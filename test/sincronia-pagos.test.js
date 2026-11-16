// El recibo de pago entra al sincronizar (src/sincronia.js, opción `pago`; encargo «carta: pagos», 16-11): lo que espera
// su recibo de pago (`esperarPago`) se pide en cada sincronización al servicio de pagos (src/pago.js contra el servidor
// HTTP de la simulación de StateArk abc5e84, con la firma del titular exigida), por txid o por puntero; pendiente hasta
// el bloque, anotado después (eje.marcarPago, X.6.8.3) y «paid» verdadero; un SEGUNDO lector que solo conoce el id del
// registro lo recibe por el puntero; se guarda y se restaura (también lo guardado de antes, sin `pagos`); un fallo del
// servicio no rompe la sincronización. Claves de PRUEBA, generadas en cada ejecución.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { arrancar } from '../servidor/prueba/servidor.mjs';
import { crearServidor } from '../servidor/sim/stateark/servidor.js';
import { Simulacion } from '../servidor/sim/stateark/index.js';
import { firmaSimulada, mensajeAutorizacion } from '../servidor/sim/stateark/pagos.js';
import { huella } from '../servidor/sim/stateark/canon.js';
import { observadorBip340 } from '../servidor/sim/sello-agram.js';
import { schnorr } from '../src/vendor/noble-secp256k1.js';
import { aHex, deHex } from '../src/cripto.js';
import { Sincronia, PAGOS_POR_PASADA } from '../src/sincronia.js';
import { pagoHttp, pagoCon } from '../src/pago.js';
import { Eje } from '../src/eje.js';
import { generarClaves } from '../src/autoridad.js';
import { verificado } from '../src/contrato.js';
import { pagaElCoste } from './ayudas-coste.js';
import { declararExterior } from './ayudas-sello.js';

const T = (m) => '2026-11-16T09:' + String(m).padStart(2, '0') + ':00Z';
const firmanteDe = (privada) => ({ pubkey: aHex(schnorr.getPublicKey(deHex(privada))), firmar: async (id) => aHex(schnorr.sign(deHex(id), deHex(privada), globalThis.crypto.getRandomValues(new Uint8Array(32)))) });

let libro; // el libro compartido de prueba (servidor/prueba)
let pagos; // el servidor HTTP de la sim de StateArk, con un observador BIP-340 real
let simulacion;
let urlPagos;
before(async () => {
  libro = await arrancar({ puerto: 0, secreto: 'prueba' });
  simulacion = await Simulacion.crear({ observador: await observadorBip340() });
  ({ servidor: pagos } = await crearServidor({ simulacion, firmaTitular: true, urlPublica: '' }));
  await new Promise((r) => pagos.listen(0, '127.0.0.1', r));
  urlPagos = `http://127.0.0.1:${pagos.address().port}`;
});
after(async () => {
  await libro.cerrar();
  await new Promise((r) => pagos.close(r));
});

async function crearEje(nombre) {
  const r = await fetch(libro.url + '/ejes', { method: 'POST', headers: { 'X-Crear-Ejes': 'prueba', 'Content-Type': 'application/json' }, body: JSON.stringify({ eje: nombre }) });
  return (await r.json()).claveLectura;
}

/** Un eje con la raíz que declara al observador de la sim y dos registros que mueven (pagan su coste): { eje, cuenta, e1, e2 }. */
async function ejeConRegistros() {
  const cuenta = await generarClaves();
  const eje = await Eje.genesis({ identidad: 'vg', foco: ['mi eje'], t: T(0), clave: cuenta.publica, privada: cuenta.privada, exigirFirmas: true });
  await declararExterior(eje, { observadores: [simulacion.sellador.claveObservador], privada: cuenta.privada, t: T(1) });
  const e1 = await eje.escribir({ autor: 'vg', sobre: eje.genesisId, t: T(2), movimientos: [pagaElCoste('vg')], payload: ['la cama de esta noche'] }, cuenta.privada);
  const e2 = await eje.escribir({ autor: 'vg', sobre: e1.id, t: T(3), movimientos: [pagaElCoste('vg')], payload: ['el desayuno'] }, cuenta.privada);
  return { eje, cuenta, e1, e2 };
}

/** Un pago en la sim con el puntero a `id`, firmado por el titular de PRUEBA: el txid (aún sin bloque). */
async function pagarCon(puntero, nombre) {
  const titular = (await generarClaves()).privada;
  const quien = pagoHttp({ url: urlPagos, ...firmanteDe(titular) });
  const cobra = pagoHttp({ url: urlPagos, ...firmanteDe((await generarClaves()).privada) });
  await quien.cartera({ nombre });
  await cobra.cartera({ nombre: nombre + '-cobra' });
  const { direccion } = await quien.direccion({ nombre });
  await fetch(urlPagos + '/pagos/acunar', { method: 'POST', body: JSON.stringify({ direccion, sat: 200_000 }) });
  await simulacion.minar();
  const instruccion = { schema: 'stateark.payment-instruction@2', rail: 'bitcoin.onchain', amount: { valor: 61_000, unidad: 'sat' }, destino: { clase: 'bitcoin/address', valor: (await cobra.direccion({ nombre: nombre + '-cobra' })).direccion }, correlation_id: 'AGRAM-' + nombre, puntero };
  const plan = await quien.preparar({ nombre, instruccion });
  const firma = await firmaSimulada(firmanteDe(titular).pubkey, await mensajeAutorizacion(await huella(plan)));
  const autorizacion = await quien.autorizar({ plan, firma });
  return (await quien.ejecutar({ nombre, instruccion, plan, autorizacion })).posicion.txid;
}

test('esperar, pendiente hasta el bloque, anotado y «paid» verdadero; el segundo lector, solo con el id, lo recibe por el puntero; lo que no tiene pago sigue esperando', async () => {
  const claveLectura = await crearEje('pagos');
  const { eje: ejeA, e1, e2 } = await ejeConRegistros();
  const A = new Sincronia({ url: libro.url, eje: 'pagos', claveLectura, pago: pagoHttp({ url: urlPagos }) });
  let informe = await A.sincronizar(ejeA);
  assert.deepEqual(informe.pagos, { anotados: [], pendientes: 0, errores: [] }, 'con adaptador y nada que esperar');
  assert.equal(A.pago.url, urlPagos);

  const txid = await pagarCon(e1.id, 'casa');
  assert.equal(A.esperarPago(e1.id, { txid }), true);
  assert.deepEqual(A.estadoDePago(e1.id), { esperando: true, txid });
  assert.deepEqual(A.esperasDePago, [e1.id]);
  informe = await A.sincronizar(ejeA);
  assert.deepEqual(informe.pagos, { anotados: [], pendientes: 1, errores: [] }, 'sin bloque: pendiente');
  assert.equal(ejeA.pago(e1.id), null);
  assert.equal(verificado(ejeA, e1.id).pago, null, 'sin recibo, «paid» no se exige');

  await simulacion.minar();
  informe = await A.sincronizar(ejeA);
  assert.deepEqual(informe.pagos, { anotados: [e1.id], pendientes: 0, errores: [] });
  assert.equal(A.estadoDePago(e1.id).schema, 'stateark.recibo@1', 'anotado: el sobre');
  assert.deepEqual(A.esperasDePago, []);
  assert.equal(A.esperarPago(e1.id), false, 'lo ya anotado no vuelve a esperarse');
  assert.deepEqual(ejeA.pago(e1.id).decupla[1], [txid]);
  assert.equal(verificado(ejeA, e1.id).pago, true, '«paid» (X.6.8.6) verdadero');

  // El segundo lector baja el eje y solo sabe el id del registro: lo pide por el puntero, sin firmante.
  const B = new Sincronia({ url: libro.url, eje: 'pagos', claveLectura, pago: pagoHttp({ url: urlPagos }) });
  const ejeB = (await B.sincronizar(null)).eje;
  assert.ok(ejeB.eventos.has(e1.id));
  assert.equal(ejeB.pago(e1.id), null);
  assert.equal(B.esperarPago(e1.id), true);
  assert.equal(B.esperarPago(e2.id), true, 'un registro sin pago');
  assert.deepEqual(B.estadoDePago(e1.id), { esperando: true });
  informe = await B.sincronizar(ejeB);
  assert.deepEqual(informe.pagos, { anotados: [e1.id], pendientes: 1, errores: [] }, 'e2 no tiene pago: sigue esperando');
  assert.deepEqual(ejeB.pago(e1.id).decupla.slice(0, 6), ejeA.pago(e1.id).decupla.slice(0, 6), 'el mismo recibo (y el mismo emisor) que por txid; el sobre, firmado otra vez');
  assert.equal(verificado(ejeB, e1.id).pago, true, '«paid» verdadero en el segundo lector');
  assert.deepEqual(B.estadoDePago(e2.id), { esperando: true });
  assert.equal(verificado(ejeB, e2.id).pago, null);

  // Un pago sin bloque buscado por puntero: pendiente; con bloque, anotado.
  const t2 = await pagarCon(e2.id, 'desayuno');
  informe = await B.sincronizar(ejeB);
  assert.deepEqual(informe.pagos, { anotados: [], pendientes: 1, errores: [] });
  await simulacion.minar();
  informe = await B.sincronizar(ejeB);
  assert.deepEqual(informe.pagos.anotados, [e2.id]);
  assert.deepEqual(ejeB.pago(e2.id).decupla[1], [t2]);
});

test('serializar y restaurar: las esperas y los sobres; marcarPagos los devuelve al eje; lo guardado de antes, sin `pagos`, sigue restaurando', async () => {
  const claveLectura = await crearEje('pagos-guardar');
  const { eje, e1, e2 } = await ejeConRegistros();
  const S = new Sincronia({ url: libro.url, eje: 'pagos-guardar', claveLectura, pago: pagoHttp({ url: urlPagos }) });
  await S.sincronizar(eje);
  const sinNada = S.serializar();
  assert.equal(sinNada.pagos, undefined, 'sin esperas ni recibos, no se guarda nada de pagos');
  const txid = await pagarCon(e1.id, 'guardar');
  await simulacion.minar();
  S.esperarPago(e1.id, { txid });
  S.esperarPago(e2.id);
  await S.sincronizar(eje);
  assert.ok(eje.pago(e1.id));

  const guardado = JSON.parse(JSON.stringify(S.serializar()));
  assert.deepEqual(guardado.pagos.esperas, [[e2.id, { txid: null }]]);
  assert.equal(guardado.pagos.anotados[0][0], e1.id);
  const S2 = Sincronia.restaurar(guardado, { claveLectura });
  assert.equal(S2.estadoDePago(e1.id).schema, 'stateark.recibo@1');
  assert.deepEqual(S2.estadoDePago(e2.id), { esperando: true });
  assert.equal(S2.pago, null, 'el adaptador no se guarda: se da al restaurar');
  const eje2 = await Eje.desde([...eje.orden].map((id) => eje.obtener(id)), { exigirFirmas: true });
  assert.equal(eje2.pago(e1.id), null);
  assert.equal(S2.marcarPagos(eje2), 1);
  assert.deepEqual(eje2.pago(e1.id), eje.pago(e1.id));
  assert.equal(verificado(eje2, e1.id).pago, true);

  // Lo guardado antes de los pagos (sin la clave `pagos`): restaura igual, sin esperas ni recibos.
  const deAntes = JSON.parse(JSON.stringify(guardado));
  delete deAntes.pagos;
  const S3 = Sincronia.restaurar(deAntes, { claveLectura, pago: pagoHttp({ url: urlPagos }) });
  assert.equal(S3.estadoDePago(e1.id), undefined);
  assert.deepEqual(S3.esperasDePago, []);
  assert.equal(S3.marcarPagos(eje2), 0);
  assert.deepEqual(S3.serializar().ordenes, guardado.ordenes);
  // Basura en `pagos`: se ignora lo que no es.
  const raro = Sincronia.restaurar({ ...deAntes, pagos: { esperas: [['no-es-id', {}], [e2.id, null]], anotados: 'x' } }, { claveLectura });
  assert.deepEqual(raro.esperasDePago, [e2.id]);
});

test('un fallo del servicio de pagos no rompe la sincronización; el tope por pasada; un recibo que no vale no entra; sin adaptador, nada', async () => {
  const claveLectura = await crearEje('pagos-fallo');
  const { eje, e1, e2 } = await ejeConRegistros();
  // Sin red hacia el servicio: el informe lo dice, se sigue esperando, el resto de la sincronización va bien.
  const caido = pagoHttp({ url: 'http://127.0.0.1:9', fetch: async () => { throw new Error('caído'); } });
  const S = new Sincronia({ url: libro.url, eje: 'pagos-fallo', claveLectura, pago: caido });
  S.esperarPago(e1.id);
  S.esperarPago(e2.id);
  let informe = await S.sincronizar(eje);
  assert.deepEqual(informe.errores, []);
  assert.equal(informe.subidos.length, eje.orden.length, 'la sincronización subió todo');
  assert.equal(informe.pagos.errores.length, 1, 'sin red: se deja de pedir en esta pasada');
  assert.match(informe.pagos.errores[0].motivo, /caído/);
  assert.equal(informe.pagos.pendientes, 2);
  assert.deepEqual(S.esperasDePago, [e1.id, e2.id]);

  // El servicio responde con un error (500): se anota y se sigue con los demás.
  const roto = pagoHttp({ url: 'http://pagos.ejemplo', fetch: async () => new Response(JSON.stringify({ error: 'roto' }), { status: 500 }) });
  S.usarPago(roto);
  informe = await S.sincronizar(eje);
  assert.equal(informe.pagos.errores.length, 2);
  assert.match(informe.pagos.errores[0].motivo, /500/);

  // Un recibo que no es de pago o no da su id: no entra, se sigue esperando.
  S.usarPago(pagoCon({ reciboPago: () => null, reciboPorPuntero: () => ({ schema: 'stateark.recibo@1', recibo: [] }) }));
  informe = await S.sincronizar(eje);
  assert.deepEqual(informe.pagos.anotados, []);
  assert.match(informe.pagos.errores[0].motivo, /no tiene la forma/);
  assert.equal(eje.pago(e1.id), null);

  // El tope por pasada.
  assert.equal(PAGOS_POR_PASADA, 500);
  const pedidos = [];
  const contado = pagoCon({ reciboPago: () => null, reciboPorPuntero: (id) => { pedidos.push(id); return null; } });
  const U = new Sincronia({ url: libro.url, eje: 'pagos-fallo', claveLectura, pago: contado, pagosPorPasada: 1 });
  U.esperarPago(e1.id);
  U.esperarPago(e2.id);
  informe = await U.sincronizar(eje, { subir: false });
  assert.deepEqual(pedidos, [e1.id], 'uno por pasada');
  assert.equal(informe.pagos.pendientes, 2);

  // Un registro que este eje aún no tiene: se espera sin pedirlo.
  const V = new Sincronia({ url: libro.url, eje: 'pagos-fallo', claveLectura, pago: contado });
  V.esperarPago('ab'.repeat(32));
  pedidos.length = 0;
  informe = await V.sincronizar(eje, { subir: false });
  assert.deepEqual([pedidos, informe.pagos.pendientes], [[], 1]);

  // Sin adaptador: ni se pide ni hay `pagos` en el informe, aunque haya esperas.
  const sin = new Sincronia({ url: libro.url, eje: 'pagos-fallo', claveLectura });
  sin.esperarPago(e1.id);
  informe = await sin.sincronizar(eje, { subir: false });
  assert.equal(informe.pagos, undefined);
  assert.equal(sin.esperarPago('no-es-un-id'), false);
});

test('el ejemplo (ejemplos/pagos/recibo.mjs): pagar con puntero, minar, sincronizar y «paid» verdadero en el segundo lector', async () => {
  const { ejemploRecibo } = await import('../ejemplos/pagos/recibo.mjs');
  const r = await ejemploRecibo();
  assert.deepEqual([r.informeA.pagos.anotados, r.informeB.pagos.anotados], [[r.registro.id], [r.registro.id]]);
  assert.deepEqual([r.pagadoA, r.pagadoB], [true, true]);
});
