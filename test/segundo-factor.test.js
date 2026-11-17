// El segundo factor (VG 12/13-11, #66 y #70; SIP 0 de StateArk, objeto «autorización» y regla «second factor»): el
// umbral es un criterio del usuario en el 2.4 de su alta (la plantilla PV2 «second factor»: 0 nombre, 1 familia o serie,
// 2 cantidad, 3 titular, 4 la acción); al ejecutar desde el 4, si lo que mueve alcanza el umbral, el registro se escribe
// pero su estación queda en «autorizada» («pendiente de segundo factor») hasta que la cosa titular escribe y firma una
// autorización anclada sobre él (acciones.autorizar). Las dos lecturas de la época: «second factor» (X.6.8.7) y
// «authorized by the holder» (X.6.8.8). Docs: docs/CONTRATO.md §12.4 bis.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as A from '../src/acciones.js';
import * as contrato from '../src/contrato.js';
import { EPOCA_0_BTML } from '../src/epocas.js';
import { ContextoEje } from '../src/contexto-eje.js';
import { evaluar, leerRegla, Presupuesto, LIMITES } from '../src/bqlm.js';
import { ANUNCIO } from '../src/motor.js';
import { generarClaves, firmarPosesion } from '../src/autoridad.js';
import { schnorr } from '../src/vendor/noble-secp256k1.js';
import { Custodia, esquemaNoble } from '../servidor/sim/stateark/index.js';
import { createHash } from 'node:crypto';
import { ejemploCompra } from '../ejemplos/ikisai/compra-food.mjs';
import { pagaElCoste } from './ayudas-coste.js';
import { arbol as arbolEnIdioma, formulario, preferencias, segundoFactorDeConfiguracion } from '../carta/carta.js';
import { html, htmlConfiguracion } from '../carta/dom.js';

const T0 = '2026-11-07T12:00:00Z';
const T1 = '2026-11-08T12:00:00Z';
const ORDENADOR = { ancho: 1920, alto: 1080 };
const regla = (nombre) => EPOCA_0_BTML.lecturas.find((r) => r[0][0] === nombre);

/**
 * La compra de ejemplo: la cocina abre un encargo y anuncia que la huésped le pagará 7 EUR; la huésped da de alta una
 * cosa con clave («cartera», su segundo factor: la custodia StateArk) y le da 60 minutos de T (u `opciones.minutos`).
 */
async function mundo(claveDeLaCosa, { minutos = 60 } = {}) {
  const c = await ejemploCompra();
  const { eje, menu } = c;
  const encargo = await eje.escribir({ autor: 'cocina', sobre: menu.id, t: T1, payload: ['Encargo', ['x'], ['all announced movements happened'], ['cocina', 'huesped']], movimientos: [pagaElCoste('cocina')] });
  const anunciado = { token: 'E', emisor: 'casa', denominacion: 'EUR', cantidad: 7, de: 'huesped', a: 'cocina', estado: 'anunciado', refiere: '2026-11-20T10:00:00Z' };
  const anuncio = await eje.escribir({ autor: 'cocina', sobre: encargo.id, en: ANUNCIO, t: T1, payload: 'pagar la cena', movimientos: [pagaElCoste('cocina'), anunciado] });
  const cosa = claveDeLaCosa ?? await generarClaves();
  const altaH = eje.alta('huesped').id;
  const r = await A.transaccion(eje, 'register a thing', { X: altaH, thing: 'cartera', minutes: minutos, key: cosa.publica }, 'huesped', { t: T1 });
  assert.ok(r.ok, JSON.stringify(r.motivos));
  await eje.anadir(cosa.privada ? await firmarPosesion(r.evento, 'cartera', cosa.privada) : r.evento);
  return { ...c, eje, encargo, anuncio, cosa, altaH };
}

/** La huésped da de alta otra cosa suya, con clave y `minutos` de T. → sus claves. */
async function registrar(m, nombre, minutos) {
  const claves = await generarClaves();
  const r = await A.transaccion(m.eje, 'register a thing', { X: m.altaH, thing: nombre, minutes: minutos, key: claves.publica }, 'huesped', { t: T1 });
  assert.ok(r.ok, JSON.stringify(r.motivos));
  await m.eje.anadir(await firmarPosesion(r.evento, nombre, claves.privada));
  return claves;
}

/** La huésped escribe su criterio con la plantilla «second factor» (en el 2.4 de su alta). */
async function criterio(m, family, amount, holder = 'cartera') {
  const r = await A.transaccion(m.eje, 'second factor', { X: m.altaH, family, amount, holder }, 'huesped', { t: T1 });
  assert.ok(r.ok, JSON.stringify(r.motivos));
  await m.eje.anadir(r.evento);
  return r.evento;
}

/** La huésped paga el anuncio desde el 4 («pay», anclado sobre el anuncio). */
async function pagar(m) {
  const r = await A.transaccion(m.eje, 'pay', { X: m.encargo.id }, 'huesped', { t: T1 });
  assert.ok(r.ok, JSON.stringify(r.motivos));
  await m.eje.anadir(r.evento);
  return r;
}

const deE = (m) => A.estaciones(m.eje, m.encargo.id).find((e) => e.familia === 'E');

test('la plantilla PV2 «second factor» escribe el criterio en el 2.4 de mi alta, sin huecos: 0 nombre, 1 familia o serie, 2 cantidad, 3 titular (una cosa mía), 4 la acción', async () => {
  const m = await mundo();
  const p = A.plantillaDeTransaccion('second factor');
  assert.ok(p, 'está en epoch.9.6');
  assert.deepEqual(p[8], [2, 5], 'PV2; «attach a file» sigue la última del sitio 2');
  assert.deepEqual(A.plantillaDeTransaccion('attach a file')[8], [2, 6]);
  assert.ok(A.acciones(m.eje, m.altaH, 2, 'huesped').some((a) => a.nombre === 'second factor'), 'se ofrece sobre mi alta');
  assert.ok(!A.acciones(m.eje, m.altaH, 2, 'cocina').some((a) => a.nombre === 'second factor'), 'no sobre el alta de otro');
  // El titular se elige entre MIS cosas (contrato.opciones con el defecto «=first …» del parámetro).
  const f = formulario(m.eje, m.altaH, 'second factor', 'huesped');
  assert.deepEqual(f.campos.find((c) => c.nombre === 'holder').opciones.map((o) => o.valor), ['cartera']);
  const ev = await criterio(m, 'E', 5);
  assert.equal(ev.en, '2400000000');
  assert.deepEqual(ev.payload, ['second factor', ['E'], [5], ['cartera'], ['second factor']]);
  assert.deepEqual(A.criteriosDeSegundoFactor(m.eje, 'huesped').map((c) => [c.familias, c.cantidad, c.titular]), [[['E'], 5, 'cartera']]);
  // Un titular que no es cosa mía no vale (la validación del parámetro).
  const otro = await A.transaccion(m.eje, 'second factor', { X: m.altaH, family: 'E', amount: 5, holder: 'cocina' }, 'huesped', { t: T1 });
  assert.equal(otro.ok, false);
  assert.ok(otro.motivos.some((x) => x.parametro === 'holder'));
  // Las dos lecturas de la época, en X.6.8.7 y X.6.8.8; leen, no mueven.
  assert.deepEqual([regla('second factor')[3], regla('second factor')[4]], [['X.6.8.7'], ['read']]);
  assert.deepEqual([regla('authorized by the holder')[3], regla('authorized by the holder')[4]], [['X.6.8.8'], ['read']]);
});

test('umbral no alcanzado: el pago se ejecuta como siempre; nada cambia', async () => {
  const m = await mundo();
  await criterio(m, 'E', 10);
  const { evento } = await pagar(m);
  assert.equal(A.estacionDeAnuncio(m.eje, m.anuncio.id), 'ejecutada');
  assert.deepEqual(deE(m).pendientesDeSegundoFactor, []);
  assert.deepEqual(A.segundoFactor(m.eje, evento.id), { exige: false, pendiente: false, criterios: [], titulares: [], autorizaciones: [], motivo: null, estado: 'RESUELTO', motivos: [] });
});

test('umbral alcanzado: el registro se escribe, el anuncio queda en «autorizada» y pendiente de segundo factor; ejecutar lo sabe antes', async () => {
  const m = await mundo();
  await criterio(m, 'E', 5);
  const antes = A.ejecucion(m.eje, 'pay', { X: m.encargo.id }, 'huesped', { t: T1 });
  assert.deepEqual([antes.segundoFactor.exige, antes.segundoFactor.titulares], [true, ['cartera']], 'el botón de ejecutar lo sabe antes');
  const saldo = m.eje.saldo('huesped', 'E:casa/EUR');
  const r = await pagar(m);
  assert.deepEqual(r.segundoFactor.titulares, ['cartera']);
  assert.equal(m.eje.saldo('huesped', 'E:casa/EUR'), saldo - 7, 'nada se rechaza: lo movido está movido');
  assert.equal(A.estacionDeAnuncio(m.eje, m.anuncio.id), 'autorizada');
  assert.deepEqual(deE(m).pendientesDeSegundoFactor, [m.anuncio.id]);
  assert.equal(deE(m).pendientesDeSello, undefined, 'desde el 16-11 (encargo «firmeza») no hay «pendientes de sello»');
  const ej = A.ejecuciones(m.eje, m.encargo.id).find((x) => x.ocupante?.ref === m.anuncio.id);
  assert.deepEqual([ej.estacion, ej.pendienteDeSegundoFactor, ej.pendienteDeSello], ['autorizada', true, undefined]);
  const sf = A.segundoFactor(m.eje, r.evento.id);
  assert.deepEqual([sf.exige, sf.pendiente, sf.titulares], [true, true, ['cartera']]);
  assert.match(sf.motivo, /falta la autorización de cartera/);
  // «si mueve T» con cantidad 3: quemar T al escribir es mover T (el coste cuenta).
  const m2 = await mundo();
  await criterio(m2, 'T', 3);
  await pagar(m2);
  assert.equal(A.estacionDeAnuncio(m2.eje, m2.anuncio.id), 'autorizada');
});

test('la autorización escrita y firmada por la cosa titular pasa el anuncio a «ejecutada»; la del propio usuario o la de otro no, con motivo claro', async () => {
  const m = await mundo();
  await criterio(m, 'E', 5);
  const { evento: pago } = await pagar(m);
  // La huésped se autoriza a sí misma: no vale (el titular es su cosa).
  const propia = await A.autorizar(m.eje, pago.id, 'huesped', undefined, { t: T1 });
  assert.ok(propia.ok, JSON.stringify(propia.motivos));
  await m.eje.anadir(propia.evento);
  let sf = A.segundoFactor(m.eje, pago.id);
  assert.equal(sf.pendiente, true);
  assert.match(sf.motivo, /la escribe huesped y la firma nadie, y solo vale la que escribe y firma el titular, cartera/);
  assert.equal(A.estacionDeAnuncio(m.eje, m.anuncio.id), 'autorizada');
  // Otro (la cocina) tampoco.
  const ajena = await A.autorizar(m.eje, pago.id, 'cocina', undefined, { t: T1 });
  assert.ok(ajena.ok, JSON.stringify(ajena.motivos));
  await m.eje.anadir(ajena.evento);
  assert.equal(A.segundoFactor(m.eje, pago.id).pendiente, true);
  // La cosa sin firmar no pasa el suelo: tiene clave, y quien tiene clave firma.
  const sinFirma = await A.autorizar(m.eje, pago.id, 'cartera', undefined, { t: T1 });
  assert.equal(sinFirma.ok, false);
  // La cosa, firmada con su clave: ejecutada.
  const buena = await A.autorizar(m.eje, pago.id, 'cartera', m.cosa.privada, { t: T1 });
  assert.ok(buena.ok, JSON.stringify(buena.motivos));
  assert.deepEqual(buena.evento.payload, [['autorización', 'SIP 0'], [{ ref: pago.id }], ['StateArk/SecondFactor/v1'], ['cartera']]);
  assert.deepEqual([buena.evento.sobre, buena.evento.en, buena.evento.firmante], [pago.id, '4000000000', 'cartera']);
  await m.eje.anadir(buena.evento);
  sf = A.segundoFactor(m.eje, pago.id);
  assert.deepEqual([sf.exige, sf.pendiente, sf.motivo, sf.criterios[0].autorizado], [true, false, null, true]);
  assert.equal(A.estacionDeAnuncio(m.eje, m.anuncio.id), 'ejecutada');
  assert.deepEqual(deE(m).pendientesDeSegundoFactor, []);
  assert.deepEqual(A.ejecuciones(m.eje, m.encargo.id).filter((x) => x.ocupante?.ref === m.anuncio.id).map((x) => [x.estacion, x.pendienteDeSegundoFactor]), [['ejecutada', undefined]]);
});

test('criterio con varias series (una por ocupante del 1): lo alcanza la que se mueve, y no las demás', async () => {
  const m = await mundo();
  const ev = await criterio(m, ['E:otra/USD', 'E:casa/EUR'], 5);
  assert.deepEqual(ev.payload[1], ['E:otra/USD', 'E:casa/EUR']);
  await pagar(m);
  assert.equal(A.estacionDeAnuncio(m.eje, m.anuncio.id), 'autorizada');
  const n = await mundo();
  await criterio(n, ['E:otra/USD', 'T:hora'], 1);
  await pagar(n);
  assert.equal(A.estacionDeAnuncio(n.eje, n.anuncio.id), 'ejecutada', 'ni E:otra/USD ni T:hora se mueven');
});

test('un registro del 4 que no es un anuncio también espera: estación propia «autorizada» y, autorizado, «ejecutada»', async () => {
  const m = await mundo();
  await criterio(m, 'E', 1);
  const r = await A.transaccion(m.eje, 'apply a resource', { X: m.menu.id, quantity: 2, price: [['E:casa/EUR'], [12]] }, 'huesped', { t: T1 });
  assert.ok(r.ok, JSON.stringify(r.motivos));
  await m.eje.anadir(r.evento);
  const de = () => A.ejecuciones(m.eje, m.menu.id).find((x) => x.ocupante?.ref === r.evento.id);
  assert.deepEqual([de().estacion, de().pendienteDeSegundoFactor], ['autorizada', true]);
  await m.eje.anadir((await A.autorizar(m.eje, r.evento.id, 'cartera', m.cosa.privada, { t: T1 })).evento);
  assert.deepEqual([de().estacion, de().pendienteDeSegundoFactor], ['ejecutada', undefined]);
  // Lo de quien no tiene criterio no cambia: sin estación ni marca.
  assert.ok(A.ejecuciones(m.eje, m.menu.id).filter((x) => x.ocupante?.ref && m.eje.obtener(x.ocupante.ref)?.autor === 'cocina').every((x) => x.pendienteDeSegundoFactor === undefined));
});

// ---------- el firmante inyectable (#112): el guardián de StateArk es el que firma ----------

const aBytes = (hex) => Uint8Array.from(hex.match(/.{2}/g), (h) => parseInt(h, 16));

test('firmante inyectable: un firmante que imita al guardián (recibe el canónico y el id, firma fuera de autorizar con la privada de la cosa) autoriza igual que la privada en local', async () => {
  const m = await mundo();
  await criterio(m, 'E', 5);
  const { evento: pago } = await pagar(m);
  const llamadas = [];
  // Lo que hace el guardián real: comprueba que el id es el SHA-256 del canónico y que es una autorización de la cosa, y solo entonces firma el id con la clave que custodia (aquí, la privada de la cosa, fuera de `autorizar`).
  const guardian = async ({ canonico, id }) => {
    llamadas.push({ canonico, id });
    assert.equal(createHash('sha256').update(canonico).digest('hex'), id, 'el id es el hash del cuerpo canónico');
    const cuerpo = JSON.parse(canonico);
    assert.deepEqual([cuerpo.autor, cuerpo.sobre, cuerpo.en], ['cartera', pago.id, '4000000000']);
    assert.equal(cuerpo.payload[0][0], 'autorización');
    return Array.from(schnorr.sign(aBytes(id), aBytes(m.cosa.privada), globalThis.crypto.getRandomValues(new Uint8Array(32))), (b) => b.toString(16).padStart(2, '0')).join('');
  };
  const buena = await A.autorizar(m.eje, pago.id, 'cartera', { firmar: guardian, t: T1 });
  assert.ok(buena.ok, JSON.stringify(buena.motivos));
  assert.equal(llamadas.length, 1);
  assert.deepEqual([buena.evento.id, buena.evento.firmante, buena.evento.sobre, buena.evento.en], [llamadas[0].id, 'cartera', pago.id, '4000000000']);
  await m.eje.anadir(buena.evento);
  const sf = A.segundoFactor(m.eje, pago.id);
  assert.deepEqual([sf.exige, sf.pendiente, sf.motivo, sf.criterios[0].autorizado], [true, false, null, true]);
  assert.equal(A.estacionDeAnuncio(m.eje, m.anuncio.id), 'ejecutada');
  // La forma antigua sigue valiendo y da el mismo registro (misma t, mismo cuerpo, mismo id).
  const local = await A.autorizar(m.eje, pago.id, 'cartera', m.cosa.privada, { t: T1 });
  assert.equal(local.evento.id, buena.evento.id);
});

test('firmante inyectable: un firmante que firma con otra clave, que devuelve algo que no es una firma o que firma otro registro no autoriza; sin firma ni privada, el registro va sin firmar y el suelo lo rechaza', async () => {
  const m = await mundo();
  await criterio(m, 'E', 5);
  const { evento: pago } = await pagar(m);
  const ajena = await generarClaves();
  const firmaCon = (privada) => async ({ id }) => Array.from(schnorr.sign(aBytes(id), aBytes(privada), globalThis.crypto.getRandomValues(new Uint8Array(32))), (b) => b.toString(16).padStart(2, '0')).join('');
  const conOtraClave = await A.autorizar(m.eje, pago.id, 'cartera', { firmar: firmaCon(ajena.privada), t: T1 });
  assert.equal(conOtraClave.ok, false);
  assert.match(conOtraClave.motivos.map((x) => x.mensaje).join(' '), /firma inválida de cartera/);
  const basura = await A.autorizar(m.eje, pago.id, 'cartera', { firmar: async () => 'no es una firma', t: T1 });
  assert.equal(basura.ok, false);
  assert.match(basura.motivos[0].mensaje, /no devolvió una firma/);
  const otroRegistro = await A.autorizar(m.eje, pago.id, 'cartera', { firmar: async ({ id }) => ({ id: '0'.repeat(64), firma: await firmaCon(m.cosa.privada)({ id }) }), t: T1 });
  assert.equal(otroRegistro.ok, false);
  assert.match(otroRegistro.motivos[0].mensaje, /firmó otro registro/);
  const rechaza = await A.autorizar(m.eje, pago.id, 'cartera', { firmar: async () => { throw new Error('not_a_second_factor'); }, t: T1 });
  assert.deepEqual([rechaza.ok, rechaza.motivos[0].mensaje], [false, 'not_a_second_factor']);
  const sinNada = await A.autorizar(m.eje, pago.id, 'cartera', { t: T1 });
  assert.equal(sinNada.ok, false, 'la cosa tiene clave: sin firma no pasa');
});

test('firmante inyectable: la custodia de la sim de StateArk (su segundoFactor, como el guardián real) es el firmante', async () => {
  const custodia = new Custodia({ esquema: esquemaNoble(schnorr) });
  const { publica } = await custodia.crearClave('cartera', 'huesped');
  // Un eje de demostración: la cosa se da de alta con la clave que custodia StateArk, y su prueba de posesión la daría la propia custodia (la sim no firma altas).
  const m = await mundo({ publica });
  await criterio(m, 'E', 5);
  const { evento: pago } = await pagar(m);
  const r = await A.autorizar(m.eje, pago.id, 'cartera', { firmar: ({ canonico, id }) => custodia.segundoFactor('huesped', 'cartera', { canonico, id }), t: T1 });
  assert.ok(r.ok, JSON.stringify(r.motivos));
  await m.eje.anadir(r.evento);
  assert.equal(A.estacionDeAnuncio(m.eje, m.anuncio.id), 'ejecutada');
  // La custodia solo firma autorizaciones del titular que dice: pedirle la firma de otra cosa la rechaza.
  const mal = await A.autorizar(m.eje, pago.id, 'cartera', { firmar: ({ canonico, id }) => custodia.segundoFactor('huesped', 'otra-cosa', { canonico, id }), t: T1 });
  assert.equal(mal.ok, false);
  assert.match(mal.motivos[0].mensaje, /cosa titular/);
});

// ---------- la carta ----------

test('carta: la celda del 4 y el reverso dicen «pendiente de segundo factor»; ejecutar lo avisa antes; autorizado, «ejecutada» y sin marca', async () => {
  const m = await mundo();
  await criterio(m, 'E', 5);
  // El formulario en modo ejecutar avisa antes: «esto pedirá el segundo factor».
  const conForm = () => arbolEnIdioma({ foco: { X: m.encargo.id, pv: 4 }, formulario: { X: m.encargo.id, accion: 'pay', valores: {}, ejecutar: true } }, m.eje, 'huesped', ORDENADOR, { idioma: 'es' });
  const f = (await conForm()).formulario;
  assert.deepEqual(f.ejecucion.segundoFactor, { titulares: ['cartera'] });
  assert.match(html(await conForm()), /<p class="aviso-segundo-factor" role="note">esto pedirá el segundo factor: [^<]*cartera lo autorice desde StateArk<\/p>/);
  const { evento: pago } = await pagar(m);
  const cuatro = html(await arbolEnIdioma({ foco: { X: m.encargo.id, pv: 4 } }, m.eje, 'huesped', ORDENADOR, { idioma: 'es' }));
  assert.match(cuatro, /<li class="ejecucion" data-estado="autorizada"[^>]*>(?:(?!<\/li>).)*<small class="pendiente-segundo-factor" title="[^"]+">pendiente de segundo factor<\/small><\/li>/s);
  assert.doesNotMatch(cuatro, /pendiente-sello/, 'no es «pendiente de sello»');
  const reverso = await arbolEnIdioma({ foco: { X: pago.id, pv: 5 } }, m.eje, 'huesped', ORDENADOR, { idioma: 'es' });
  assert.equal(reverso.centro.pendienteDeSegundoFactor, true);
  assert.match(html(reverso), /<p class="verificado-linea"><small class="pendiente-segundo-factor" title="falta la autorización de cartera[^"]*">pendiente de segundo factor<\/small><\/p>/);
  await m.eje.anadir((await A.autorizar(m.eje, pago.id, 'cartera', m.cosa.privada, { t: T1 })).evento);
  const despues = html(await arbolEnIdioma({ foco: { X: m.encargo.id, pv: 4 } }, m.eje, 'huesped', ORDENADOR, { idioma: 'es' }));
  assert.doesNotMatch(despues, /pendiente-segundo-factor/);
  assert.match(despues, /<li class="ejecucion" data-estado="ejecutada"/);
});

test('carta: la configuración (personaje del 0 → 2) tiene el desplegable «segundo factor» con el titular entre mis cosas y los criterios que ya hay', async () => {
  const m = await mundo();
  const sf = segundoFactorDeConfiguracion(m.eje, 'huesped');
  assert.deepEqual(sf.campos.map((c) => c.nombre), ['family', 'amount', 'holder']);
  assert.deepEqual(sf.campos.find((c) => c.nombre === 'holder').opciones.map((o) => o.valor), ['cartera']);
  assert.deepEqual(sf.criterios, []);
  const h0 = htmlConfiguracion(preferencias(m.eje, 'huesped'), { segundoFactor: sf });
  assert.match(h0, /<details class="segundo-factor"[^>]*><summary>segundo factor<\/summary>/);
  assert.match(h0, /<select id="segundo-factor-holder" data-segundo-factor-campo="holder"[^>]*><option value="cartera" selected>/);
  assert.match(h0, /<input id="segundo-factor-family" data-segundo-factor-campo="family" type="text" value=""/);
  assert.match(h0, /sin segundo factor/);
  await criterio(m, 'E', 5);
  const h1 = htmlConfiguracion(preferencias(m.eje, 'huesped'), { segundoFactor: segundoFactorDeConfiguracion(m.eje, 'huesped') });
  assert.match(h1, /<details class="segundo-factor"[^>]* open><summary>/);
  assert.match(h1, /<ul class="segundo-factor-actuales"><li>E desde 5 → cartera<\/li><\/ul>/);
});

// ---------- #70 (3) bis: lo prepagado es una TRANSFERENCIA a la cosa titular, no una quema (VG 14-11) ----------

const SEG = { segundo: 1, minuto: 60, hora: 3600, dia: 86400 };
/** Lo que quema de T real quien escribe un evento, en segundos del calendario. */
const quemaDe = (ev, de) => ev.movimientos.filter((m) => m.token === 'T' && m.de === de && m.a === null).reduce((s, m) => s + m.cantidad * SEG[m.escala], 0);
/** Lo que `de` transfiere de T real a `a` en un evento, en segundos del calendario. */
const transfiereDe = (ev, de, a) => ev.movimientos.filter((m) => m.token === 'T' && m.de === de && m.a === a).reduce((s, m) => s + m.cantidad * SEG[m.escala], 0);

test('prepago como transferencia: la tarifa no se quema; la propuesta transfiere a la cosa titular max(tarifa, coste de escribir la autorización) y lo dice antes de ejecutar', async () => {
  const m0 = await mundo();
  const sin = A.ejecucion(m0.eje, 'pay', { X: m0.encargo.id }, 'huesped', { t: T1 });
  assert.deepEqual([sin.autorizacion, sin.elementos, sin.partes.map((p) => p.parte), sin.exigido], [0, 0, ['coste', 'plantilla'], 300], 'sin criterio alcanzado, no hay parte de autorización');
  const r0 = await A.transaccion(m0.eje, 'pay', { X: m0.encargo.id }, 'huesped', { t: T1 });
  assert.deepEqual([r0.autorizacion, quemaDe(r0.evento, 'huesped'), r0.transferencias], [0, 300, []], 'lo de siempre: el coste de escribir, 5 posiciones, 5 minutos, y ninguna transferencia');
  // Escribir la autorización (5 posiciones, «the cost of writing») cuesta 5 minutos: más que la tarifa de un criterio (1 min).
  assert.equal(A.costeDeEscribirAutorizacion('cartera'), 300);
  const m = await mundo();
  await criterio(m, 'E', 5);
  const e = A.ejecucion(m.eje, 'pay', { X: m.encargo.id }, 'huesped', { t: T1 });
  assert.deepEqual(e.partes[2], { parte: 'autorizacion', segundos: 300, elementos: 1, transferencias: [{ cosa: 'cartera', segundos: 300, tarifa: 60, escribir: 300, elementos: 1, escala: 'minuto', cantidad: 5 }] });
  assert.deepEqual([e.coste, e.autorizacion, e.exigido, e.denominacion, e.paga, e.cubre, e.alcanza, e.motivos], [300, 300, 600, [{ escala: 'minuto', cantidad: 5 }], 300, true, true, []], 'la denominación paga el coste; lo de la autorización se transfiere aparte (y cuenta en lo exigido)');
  const cosaAntes = m.eje.saldoT('cartera', 'minuto', T1);
  const r = await pagar(m);
  assert.deepEqual([r.autorizacion, quemaDe(r.evento, 'huesped'), transfiereDe(r.evento, 'huesped', 'cartera')], [300, 300, 300], 'quema solo el coste de la propuesta y transfiere 5 min a la cosa');
  assert.deepEqual(r.transferencias, e.partes[2].transferencias);
  assert.equal(m.eje.saldoT('cartera', 'minuto', T1), cosaAntes + 5, 'la cosa recibe la T con la que escribirá');
  // El botón de ejecutar (con denominación) hace lo mismo: quema el coste en las piezas elegidas y transfiere aparte.
  const m1 = await mundo();
  await criterio(m1, 'E', 5);
  const conDen = await A.transaccion(m1.eje, 'pay', { X: m1.encargo.id }, 'huesped', { t: T1, denominacion: 'minuto' });
  assert.ok(conDen.ok, JSON.stringify(conDen.motivos));
  assert.deepEqual([quemaDe(conDen.evento, 'huesped'), transfiereDe(conDen.evento, 'huesped', 'cartera')], [300, 300]);
});

test('prepago como transferencia: max(tarifa, escribir) con la tarifa por debajo y por encima de lo que cuesta escribir', () => {
  assert.deepEqual([0, 1, 59, 60, 61, 70].map(A.segundosDeAutorizar), [0, 60, 60, 60, 61, 70], 'la tarifa: un segundo por elemento, mínimo un minuto');
  const escribir = A.costeDeEscribirAutorizacion('cartera');
  // Tarifa menor que escribir (hasta 300 elementos): se transfiere lo de escribir; mayor: la tarifa.
  assert.deepEqual([0, 1, 65, 300, 301, 400].map((n) => A.segundosDeTransferir(n, escribir)), [0, 300, 300, 300, 301, 400]);
  // Con un escribir más barato que el mínimo de la tarifa, manda la tarifa.
  assert.deepEqual([1, 30, 90].map((n) => A.segundosDeTransferir(n, 45)), [60, 60, 90]);
});

test('prepago como transferencia: la cosa escribe su autorización con lo transferido; su saldo propio no baja y quien propuso no paga nada más', async () => {
  const m = await mundo();
  await criterio(m, 'E', 5);
  const cosaPropia = m.eje.saldoT('cartera', 'minuto', T1);
  const r = await pagar(m);
  assert.equal(A.estacionDeAnuncio(m.eje, m.anuncio.id), 'autorizada');
  assert.equal(m.eje.saldoT('cartera', 'minuto', T1), cosaPropia + 5);
  const propone = m.eje.saldoT('huesped', 'minuto', T1);
  const buena = await A.autorizar(m.eje, r.evento.id, 'cartera', m.cosa.privada, { t: T1 });
  assert.ok(buena.ok, JSON.stringify(buena.motivos));
  // La cosa quema lo que exige escribir la autorización (5 posiciones, 5 min) y es justo lo que recibió: no hay tarifa aparte.
  assert.deepEqual([buena.transferido, buena.exigido, quemaDe(buena.evento, 'cartera'), quemaDe(buena.evento, 'huesped')], [300, 300, 300, 0]);
  assert.equal(A.costeDeEscribirAutorizacion('cartera', { eje: m.eje }), buena.exigido, 'el id de muestra cuesta lo mismo que el de verdad');
  await m.eje.anadir(buena.evento);
  assert.equal(m.eje.saldoT('cartera', 'minuto', T1), cosaPropia, 'el saldo propio de la cosa no baja: escribió con lo transferido');
  assert.equal(m.eje.saldoT('huesped', 'minuto', T1), propone, 'autorizar no cobra nada más a quien propuso');
  assert.equal(A.estacionDeAnuncio(m.eje, m.anuncio.id), 'ejecutada');
});

test('prepago como transferencia: 65 criterios son una tarifa de 65 s (más que el minuto) y aun así se transfiere lo de escribir (5 min); el registro asentado se lee entero (antes desbordaba hacia los 55)', async () => {
  const m = await mundo();
  for (let i = 0; i < 65; i++) await criterio(m, ['E:casa/EUR', 'E:otra/U' + i], 1); // cada criterio, distinto (una serie más que no se mueve)
  assert.equal(A.criteriosDeSegundoFactor(m.eje, 'huesped').length, 65);
  const e = A.ejecucion(m.eje, 'pay', { X: m.encargo.id }, 'huesped', { t: T1 });
  assert.deepEqual([e.elementos, e.autorizacion, e.exigido, e.cubre, e.alcanza, e.motivos], [65, 300, 600, true, true, []], 'la candidata aún se lee entera');
  assert.deepEqual(e.partes[2].transferencias.map((x) => [x.cosa, x.tarifa, x.escribir, x.segundos]), [['cartera', 65, 300, 300]], 'un criterio por elemento: tarifa de 65 s, menor que escribir');
  const cosaPropia = m.eje.saldoT('cartera', 'minuto', T1);
  const r = await pagar(m);
  assert.deepEqual([r.autorizacion, quemaDe(r.evento, 'huesped'), transfiereDe(r.evento, 'huesped', 'cartera')], [300, 300, 300]);
  // Con la transferencia, el registro mueve tres cosas (la quema, la transferencia y el pago); la lectura «second factor»
  // recorre sus movimientos una vez por criterio (#70, época 0 final) y se lee entera: espera a la cosa, sin desbordar.
  const sf = A.segundoFactor(m.eje, r.evento.id);
  assert.deepEqual([sf.estado, sf.exige, sf.pendiente, sf.criterios.length, sf.motivos], ['RESUELTO', true, true, 65, []]);
  assert.ok(A.porAutorizar(m.eje, 'huesped').some((x) => x.id === r.evento.id && !x.desbordado));
  // La autorización se escribe igual con lo transferido.
  const buena = await A.autorizar(m.eje, r.evento.id, 'cartera', m.cosa.privada, { t: T1 });
  assert.ok(buena.ok, JSON.stringify(buena.motivos));
  await m.eje.anadir(buena.evento);
  assert.equal(m.eje.saldoT('cartera', 'minuto', T1), cosaPropia);
});

test('prepago como transferencia: si la cosa no tiene T para escribir la autorización, autorizar falla antes de construir, con lo transferido y lo que hace falta', async () => {
  const m = await mundo(undefined, { minutos: 1 });
  await criterio(m, 'E', 5);
  // La compra de la huésped (ya movida antes del criterio) lo alcanza, pero no transfirió nada: la cosa solo tiene 1 minuto.
  const [compra] = A.porAutorizar(m.eje, 'huesped');
  const sinT = await A.autorizar(m.eje, compra.id, 'cartera', m.cosa.privada, { t: T1 });
  assert.deepEqual([sinT.ok, sinT.evento, sinT.transferido, sinT.exigido], [false, null, 0, 300]);
  assert.equal(sinT.motivos[0].regla, "writing burns today's T");
  assert.equal(sinT.motivos[0].mensaje, 'la cosa cartera no tiene T para escribir la autorización: la propuesta transfirió 0 s y hace falta 5 min');
  const en = await A.autorizar(m.eje, compra.id, 'cartera', m.cosa.privada, { t: T1, idioma: 'en' });
  assert.equal(en.motivos[0].mensaje, 'cartera has no T to write the authorization: the proposal transferred 0 s and it takes 5 min');
  // El pago desde el 4 sí transfiere: con eso la cosa escribe, y le queda su minuto.
  const { evento: pago } = await pagar(m);
  const buena = await A.autorizar(m.eje, pago.id, 'cartera', m.cosa.privada, { t: T1 });
  assert.ok(buena.ok, JSON.stringify(buena.motivos));
  await m.eje.anadir(buena.evento);
  assert.equal(m.eje.saldoT('cartera', 'minuto', T1), 1);
  assert.equal(A.estacionDeAnuncio(m.eje, m.anuncio.id), 'ejecutada');
});

test('prepago como transferencia: dos cosas titulares, dos transferencias; cada una escribe su autorización con la suya', async () => {
  const m = await mundo();
  const llavero = await registrar(m, 'llavero', 60);
  await criterio(m, 'E', 5, 'cartera');
  await criterio(m, 'E', 3, 'llavero');
  const e = A.ejecucion(m.eje, 'pay', { X: m.encargo.id }, 'huesped', { t: T1 });
  assert.deepEqual(e.partes[2].transferencias.map((x) => [x.cosa, x.elementos, x.tarifa, x.escribir, x.escala, x.cantidad]), [['cartera', 1, 60, 300, 'minuto', 5], ['llavero', 1, 60, 300, 'minuto', 5]]);
  assert.deepEqual([e.elementos, e.autorizacion, e.exigido, e.alcanza], [2, 600, 900, true]);
  const r = await pagar(m);
  assert.deepEqual([quemaDe(r.evento, 'huesped'), transfiereDe(r.evento, 'huesped', 'cartera'), transfiereDe(r.evento, 'huesped', 'llavero')], [300, 300, 300]);
  const una = await A.autorizar(m.eje, r.evento.id, 'cartera', m.cosa.privada, { t: T1 });
  assert.ok(una.ok, JSON.stringify(una.motivos));
  await m.eje.anadir(una.evento);
  assert.equal(A.estacionDeAnuncio(m.eje, m.anuncio.id), 'autorizada', 'falta la otra cosa');
  const otra = await A.autorizar(m.eje, r.evento.id, 'llavero', llavero.privada, { t: T1 });
  assert.ok(otra.ok, JSON.stringify(otra.motivos));
  assert.deepEqual([otra.transferido, quemaDe(otra.evento, 'llavero')], [300, 300]);
  await m.eje.anadir(otra.evento);
  assert.deepEqual([m.eje.saldoT('cartera', 'minuto', T1), m.eje.saldoT('llavero', 'minuto', T1)], [60, 60]);
  assert.equal(A.estacionDeAnuncio(m.eje, m.anuncio.id), 'ejecutada');
});

test('un criterio sobre T se alcanza también con la T transferida (cuenta como T movida): el punto fijo no se queda corto', async () => {
  const m = await mundo();
  await criterio(m, 'T', 3);
  const e = A.ejecucion(m.eje, 'pay', { X: m.encargo.id }, 'huesped', { t: T1 });
  assert.deepEqual([e.elementos, e.autorizacion], [1, 300]);
  const r = await pagar(m);
  assert.equal(r.autorizacion, 300);
  assert.equal(A.estacionDeAnuncio(m.eje, m.anuncio.id), 'autorizada');
  // 8 minutos de T:minuto: el coste solo (5) no llega; con la transferencia que dispara el criterio de E (5 más), sí.
  const n = await mundo();
  await criterio(n, 'E', 5);
  await criterio(n, 'T:minuto', 8);
  const f = A.ejecucion(n.eje, 'pay', { X: n.encargo.id }, 'huesped', { t: T1 });
  assert.deepEqual([f.elementos, f.partes[2].transferencias.map((x) => [x.cosa, x.elementos, x.tarifa, x.segundos])], [2, [['cartera', 2, 60, 300]]]);
});

// ---------- #70: la lectura «second factor» con muchos criterios del mismo autor (época 0 final) ----------

/**
 * Una huésped con `n` criterios «second factor», cada uno con la serie que paga (E:casa/EUR, cantidad 1) y otra que no
 * se mueve: la mitad escrita el día antes (T0) y la otra el día del pago (T1), para que le llegue la T del día de
 * escribirlos (cada criterio cuesta 6 minutos). Después, la cocina abre el encargo y anuncia el pago de 7 EUR.
 */
async function mundoConCriterios(n) {
  const c = await ejemploCompra();
  const { eje, menu } = c;
  const cosa = await generarClaves();
  const altaH = eje.alta('huesped').id;
  const r = await A.transaccion(eje, 'register a thing', { X: altaH, thing: 'cartera', minutes: 60, key: cosa.publica }, 'huesped', { t: T0 });
  assert.ok(r.ok, JSON.stringify(r.motivos));
  await eje.anadir(await firmarPosesion(r.evento, 'cartera', cosa.privada));
  for (let i = 0; i < n; i++) {
    const q = await A.transaccion(eje, 'second factor', { X: altaH, family: ['E:casa/EUR', 'E:otra/U' + i], amount: 1, holder: 'cartera' }, 'huesped', { t: i < n / 2 ? T0 : T1 });
    assert.ok(q.ok, i + ': ' + JSON.stringify(q.motivos));
    await eje.anadir(q.evento);
  }
  const encargo = await eje.escribir({ autor: 'cocina', sobre: menu.id, t: T1, payload: ['Encargo', ['x'], ['all announced movements happened'], ['cocina', 'huesped']], movimientos: [pagaElCoste('cocina')] });
  const anunciado = { token: 'E', emisor: 'casa', denominacion: 'EUR', cantidad: 7, de: 'huesped', a: 'cocina', estado: 'anunciado', refiere: '2026-11-20T10:00:00Z' };
  const anuncio = await eje.escribir({ autor: 'cocina', sobre: encargo.id, en: ANUNCIO, t: T1, payload: 'pagar la cena', movimientos: [pagaElCoste('cocina'), anunciado] });
  return { ...c, eje, encargo, anuncio, cosa, altaH };
}

/** Lo que gasta la lectura «second factor» de un registro: { estado, valor, usados } (los ocupantes expandidos). */
function gastoDeLaLectura(eje, sujeto) {
  const presupuesto = new Presupuesto(Number.MAX_SAFE_INTEGER);
  const r = leerRegla(regla('second factor'), sujeto, new ContextoEje(eje, { epoch: EPOCA_0_BTML }), { presupuesto });
  return { ...r, usados: presupuesto.usados };
}

// La regla de antes (beta 54651a9): dos recorridos de los movimientos por criterio, y «payload(it2)» en cada paso.
const ANTES = '=(down (first (first it.3).6)) where last (first it2.6).5 = "2400000000" and "second factor" in (payload(it2)).4 and first it2.3 = first it.3 and count ((moves it) where not ("anunciado" in it3.2) and it3.3.0 = first it.3 and (first it3.0 in (payload(it2)).1 or "E" in (payload(it2)).1 and E in it3.0.0.0 or "P" in (payload(it2)).1 and P in it3.0.0.0 or "R" in (payload(it2)).1 and R in it3.0.0.0 or "T" in (payload(it2)).1 and T in it3.0.0.0)) > 0 and sum (((moves it) where not ("anunciado" in it3.2) and it3.3.0 = first it.3 and (first it3.0 in (payload(it2)).1 or "E" in (payload(it2)).1 and E in it3.0.0.0 or "P" in (payload(it2)).1 and P in it3.0.0.0 or "R" in (payload(it2)).1 and R in it3.0.0.0 or "T" in (payload(it2)).1 and T in it3.0.0.0)) each 1) >= first (payload(it2)).2';

test('la lectura «second factor» de la época 0 final da lo mismo que la de antes: familias, series, cantidad 0, lo de otros, lo anunciado, la candidata', async () => {
  const m = await mundo();
  // Criterios de todas las formas: familia, serie, varias, cantidad 0, umbral no alcanzado, P, R.
  for (const [family, amount] of [['E', 5], ['E', 8], ['T', 3], ['T:minuto', 0], [['E:otra/USD', 'E:casa/EUR'], 7], [['E:otra/USD', 'T:hora'], 1], ['P', 0], ['R', 1], ['E:casa/EUR', 0], [['E', 'E:casa/EUR'], 14]]) await criterio(m, family, amount);
  const leer = (ctx, X) => {
    const antes = evaluar(ANTES, ctx, { sujeto: X });
    const ahora = leerRegla(regla('second factor'), X, ctx);
    assert.equal(ahora.estado, antes.estado, String(X?.k ?? X));
    assert.deepEqual(ahora.valor.map((o) => ctx.valor(o)), antes.valor.map((o) => ctx.valor(o)), String(X?.k ?? X));
    return ahora.valor.length;
  };
  // La candidata (aún sin asentar): lo que declara.
  const { evento: candidata } = await A.transaccion(m.eje, 'pay', { X: m.encargo.id }, 'huesped', { t: T1 });
  const ctxC = new ContextoEje(m.eje, { epoch: EPOCA_0_BTML, ev: candidata });
  assert.equal(leer(ctxC, ctxC.nombre('ev')), 5);
  const { evento: pago } = await pagar(m);
  const ctx = new ContextoEje(m.eje, { epoch: EPOCA_0_BTML });
  // Todo el libro: la compra, el anuncio (lo anunciado no cuenta), los criterios, las altas, el pago.
  for (const X of m.eje.orden.filter((id) => !m.eje.esDeLaEpoca?.(id))) leer(ctx, X);
  assert.equal(leer(ctx, pago.id), 5, 'E 5, T 3, T:minuto 0, las dos series (7) y E:casa/EUR 0; no E 8, ni USD con T:hora, ni P 0 (la obtención es de nadie), ni R, ni E con su serie (el pago cuenta una vez: 7 < 14)');
});

test('la lectura «second factor» se lee entera con 200 criterios del mismo autor (un recorrido de los movimientos por criterio): en la candidata, en lo asentado, en la estación y en lo por autorizar', async () => {
  const m = await mundoConCriterios(200);
  assert.equal(A.criteriosDeSegundoFactor(m.eje, 'huesped').length, 200);
  const e = A.ejecucion(m.eje, 'pay', { X: m.encargo.id }, 'huesped', { t: T1 });
  assert.deepEqual([e.segundoFactor.exige, e.segundoFactor.motivos, e.elementos, e.motivos], [true, [], 200, []]);
  const r = await pagar(m);
  const sf = A.segundoFactor(m.eje, r.evento.id);
  assert.deepEqual([sf.estado, sf.exige, sf.pendiente, sf.criterios.length, sf.motivos], ['RESUELTO', true, true, 200, []]);
  // Dentro del presupuesto: antes, unos 194 ocupantes por criterio sobre este pago (6 asientos, 3 de la huésped); ahora,
  // 49 (unos 13 del criterio, 3 por asiento y 5 más por asiento de su autor): 9808 de 10000.
  const gasto = gastoDeLaLectura(m.eje, r.evento.id);
  assert.deepEqual([gasto.estado, gasto.valor.length], ['RESUELTO', 200]);
  assert.ok(gasto.usados < LIMITES.ocupantes, gasto.usados + ' ocupantes');
  assert.ok(gasto.usados <= 50 * 200, gasto.usados + ' ocupantes: no más de 50 por criterio');
  assert.deepEqual(A.estacionDeAnuncioConMotivos(m.eje, m.anuncio.id), { estacion: 'autorizada', desbordado: false, motivos: [] });
  assert.deepEqual(deE(m).desbordados, []);
  assert.ok(A.porAutorizar(m.eje, 'huesped').every((x) => !x.desbordado));
});

test('defecto visible: con más criterios de los que caben (320) la lectura «second factor» pasa del presupuesto de BQL y sale como motivo en ejecucion, segundoFactor, porAutorizar y la estación del anuncio, no en silencio', async () => {
  const m = await mundoConCriterios(320);
  const aviso = /^la lectura «second factor» no se ha podido hacer \(second factor: límite de cálculo: más de 10000 ocupantes expandidos\): huesped tiene 320 criterios de segundo factor/;
  const e = A.ejecucion(m.eje, 'pay', { X: m.encargo.id }, 'huesped', { t: T1 });
  assert.equal(e.ok, true, 'no bloquea');
  const del4 = e.motivos.filter((x) => x.regla === 'second factor');
  assert.equal(del4.length, 1);
  assert.match(del4[0].mensaje, aviso);
  assert.equal(del4[0].estado, 'PENDIENTE');
  assert.deepEqual([e.segundoFactor.exige, e.segundoFactor.motivos.length], [false, 1], 'la lectura sobre la candidata tampoco se resuelve, y lo dice');
  const r = await pagar(m);
  assert.match(r.segundoFactor.motivos[0].mensaje, aviso);
  const sf = A.segundoFactor(m.eje, r.evento.id);
  assert.deepEqual([sf.exige, sf.pendiente, sf.estado, sf.motivos.map((x) => x.regla)], [false, false, 'PENDIENTE', ['second factor']]);
  assert.match(sf.motivos[0].mensaje, aviso);
  assert.match(A.segundoFactor(m.eje, r.evento.id, { idioma: 'en' }).motivos[0].mensaje, /^the reading «second factor» could not be done .*huesped has 320 second factor criteria/);
  // En la lista de lo por autorizar: con su motivo y marcado como desbordado (no se sabe si espera).
  const x = A.porAutorizar(m.eje, 'huesped').find((y) => y.id === r.evento.id);
  assert.ok(x, 'sale en porAutorizar');
  assert.deepEqual([x.desbordado, x.propio, x.motivos.length], [true, true, 1]);
  assert.match(x.falta, aviso);
  assert.ok(A.porAutorizar(m.eje, 'cartera').some((y) => y.id === r.evento.id && y.titular && y.desbordado), 'también para la cosa titular');
  // La estación del anuncio (epoch.4.3, que lee X.6.8.7 dentro de su fórmula): sigue en «propuesta», pero desbordada y
  // con su motivo, en estacionDeAnuncioConMotivos, en estaciones (desbordados, motivosDe) y en la celda del 4 (ejecuciones).
  assert.equal(A.estacionDeAnuncio(m.eje, m.anuncio.id), 'propuesta');
  const est = A.estacionDeAnuncioConMotivos(m.eje, m.anuncio.id);
  assert.deepEqual([est.estacion, est.desbordado, est.motivos.length, est.motivos[0].regla, est.motivos[0].estado], ['propuesta', true, 1, 'second factor', 'PENDIENTE']);
  assert.match(est.motivos[0].mensaje, /^no se ha podido comprobar si llega a «autorizada», «ejecutada»(, «verificada»)? \(second factor: límite de cálculo: más de 10000 ocupantes expandidos\): se queda en «propuesta» sin saber si avanza$/);
  assert.match(A.estacionDeAnuncioConMotivos(m.eje, m.anuncio.id, { idioma: 'en' }).motivos[0].mensaje, /^it could not be checked whether it reaches «autorizada»/);
  assert.deepEqual([deE(m).desbordados, deE(m).motivosDe[m.anuncio.id]], [[m.anuncio.id], est.motivos]);
  const celda = A.ejecuciones(m.eje, m.encargo.id).find((y) => y.ocupante?.ref === m.anuncio.id);
  assert.deepEqual([celda.estacion, celda.desbordado, celda.motivos], ['propuesta', true, est.motivos]);
  assert.equal(A.estacionDeAnuncioConMotivos(m.eje, 'no-existe'), null);
});

test('porAutorizar: los registros míos pendientes de segundo factor y los que me toca autorizar como titular (o mi cosa); nada pendiente, nada; autorizado, sale', async () => {
  const m = await mundo();
  await criterio(m, 'E', 5);
  // El criterio se lee sobre lo ya movido: la compra de la huésped (7 EUR) ya lo alcanza, y espera, igual que su estación.
  const compra = A.porAutorizar(m.eje, 'huesped');
  assert.deepEqual([compra.length, compra[0].que], [1, 'Compra del menú del día']);
  const { evento: pago } = await pagar(m);
  const [uno] = A.porAutorizar(m.eje, 'huesped');
  assert.deepEqual([A.porAutorizar(m.eje, 'huesped').length, uno.id, uno.autor, uno.propio, uno.titular, uno.titulares], [2, pago.id, 'huesped', true, true, ['cartera']], 'del más reciente al más antiguo');
  assert.equal(typeof uno.que, 'string');
  assert.match(uno.falta, /falta la autorización de cartera/);
  assert.deepEqual(uno.faltan.map((c) => [c.titular, c.familias, c.cantidad]), [['cartera', ['E'], 5]]);
  // La cosa titular lo ve como suyo por autorizar (no lo escribió); la cocina y quien no tiene nada que ver, nada.
  assert.deepEqual(A.porAutorizar(m.eje, 'cartera').map((x) => [x.id === pago.id, x.propio, x.titular]), [[true, false, true], [false, false, true]]);
  assert.equal(A.porAutorizar(m.eje, 'huesped', { cuantos: 1 }).length, 1);
  assert.deepEqual([A.porAutorizar(m.eje, 'cocina'), A.porAutorizar(m.eje, 'nadie'), A.porAutorizar(m.eje, '')], [[], [], []]);
  // El contrato la expone con el resto de las lecturas.
  assert.equal(contrato.porAutorizar, A.porAutorizar);
  // Una autorización que no vale (la de otro) no lo quita; la buena, sí: pasa a ejecutado.
  await m.eje.anadir((await A.autorizar(m.eje, pago.id, 'cocina', undefined, { t: T1 })).evento);
  assert.equal(A.porAutorizar(m.eje, 'huesped').length, 2);
  await m.eje.anadir((await A.autorizar(m.eje, pago.id, 'cartera', m.cosa.privada, { t: T1 })).evento);
  assert.deepEqual([A.porAutorizar(m.eje, 'huesped').map((x) => x.id), A.porAutorizar(m.eje, 'cartera').map((x) => x.id)], [[compra[0].id], [compra[0].id]], 'solo queda lo de antes');
  assert.equal(A.estacionDeAnuncio(m.eje, m.anuncio.id), 'ejecutada');
});

test('carta: el formulario de ejecutar muestra la parte «autorización» en lo exigido; el 6 de mi alta lista lo por autorizar, una línea por registro', async () => {
  const m = await mundo();
  await criterio(m, 'E', 5);
  const conForm = () => arbolEnIdioma({ foco: { X: m.encargo.id, pv: 4 }, formulario: { X: m.encargo.id, accion: 'pay', valores: {}, ejecutar: true } }, m.eje, 'huesped', ORDENADOR, { idioma: 'es' });
  const f = (await conForm()).formulario;
  assert.deepEqual([f.ejecucion.partes.map((p) => p.parte), f.ejecucion.exigido], [['coste', 'plantilla', 'autorizacion'], 600]);
  const h = html(await conForm());
  assert.match(h, /<li data-parte="autorizacion">autorización: 5 min \(1 que piden segundo factor\), se transfiere a la cosa que autoriza, que escribe su autorización con esa T<\/li>/);
  // Sin nada por autorizar, el 6 de mi alta no pinta la lista.
  const seis = async (yo, X) => html(await arbolEnIdioma({ foco: { X, pv: 6 } }, m.eje, yo, ORDENADOR, { idioma: 'es' }));
  // (la compra de la huésped, ya movida, alcanza el criterio retroactivamente: una línea)
  assert.equal([...(await seis('huesped', m.altaH)).matchAll(/data-por-autorizar=/g)].length, 1);
  const { evento: pago } = await pagar(m);
  const h6 = await seis('huesped', m.altaH);
  assert.match(h6, /<section class="por-autorizar"[^>]*><ul><li class="por-autorizar-linea" data-por-autorizar="[0-9a-f]{64}"><button type="button" class="enlace" data-abrir="[0-9a-f]{64}">por autorizar: [^<]+<\/button> · <small>falta la autorización de cartera[^<]*<\/small><\/li>/);
  assert.equal([...h6.matchAll(/data-por-autorizar=/g)].length, 2, 'una línea por registro');
  // Solo en mi alta: en el alta de otro, no.
  assert.doesNotMatch(await seis('huesped', m.eje.alta('cocina').id), /por-autorizar/);
  // Autorizado, sale: el registro pasa a ejecutado.
  await m.eje.anadir((await A.autorizar(m.eje, pago.id, 'cartera', m.cosa.privada, { t: T1 })).evento);
  assert.equal([...(await seis('huesped', m.altaH)).matchAll(/data-por-autorizar=/g)].length, 1, 'queda la compra de antes');
});

// ---------- las estaciones no cuentan a ciegas el 8.8 (Core AGRAM 17-11) ----------
// El núcleo junta en X.6.8.8 lo que dan TODAS las lecturas que materializan ahí, y una época hija puede poner otra (una
// SIP pone la suya). «Espera su segundo factor» es «algún criterio del 8.7 no está en el 8.8», no «cuentan distinto».

/** Un libro de ana en una época hija de la 0 con una lectura más en X.6.8.8: los registros anclados en X que dicen «marca». */
async function conOtraLecturaEnEl88() {
  const { Eje } = await import('../src/eje.js');
  const { idDeRegistro } = await import('../src/epocas.js');
  const M0 = { ref: EPOCA_0_BTML.id };
  const ultima = EPOCA_0_BTML.reglasConId[EPOCA_0_BTML.reglasConId.length - 1].regla[0][0];
  const marcas = [['marks'], ['"marca"'], ['=(down it) where "marca" in (payload(it2)).0'], ['X.6.8.8'], ['read'], ['*'], ['prueba: otra lectura que materializa en X.6.8.8'], ['epoch 0'], ['after ' + ultima], ['marks: the records anchored on it that say «marca»']];
  const raiz = [['con marcas'], M0, [{ ref: idDeRegistro(marcas) }], M0, M0, M0, [['hija de prueba'], ['hereda'], [EPOCA_0_BTML.id]]];
  const eje = await Eje.genesis({ identidad: 'ana', foco: ['ana'], t: T0, demostracion: true, epoca: { raiz, registros: [marcas] } });
  await eje.aceptar(await eje.invitar({ autor: 'ana', invitado: 'bea', da: [{ token: 'R', cantidad: 3 }], t: T0 }), {}, { t: T0 });
  const altaB = eje.alta('bea').id;
  const cosa = await generarClaves();
  const r = await A.transaccion(eje, 'register a thing', { X: altaB, thing: 'cartera', minutes: 60, key: cosa.publica }, 'bea', { t: T1 });
  assert.ok(r.ok, JSON.stringify(r.motivos));
  await eje.anadir(await firmarPosesion(r.evento, 'cartera', cosa.privada));
  /** ana abre un encargo y anuncia que bea le dará una R de ana; bea paga. → el anuncio y el pago. */
  const anunciarYPagar = async (titulo) => {
    const encargo = await eje.escribir({ autor: 'ana', sobre: eje.alta('ana').id, t: T1, payload: [titulo, ['x'], ['all announced movements happened'], ['ana', 'bea']], movimientos: [pagaElCoste('ana')] });
    const anuncio = await eje.escribir({ autor: 'ana', sobre: encargo.id, en: ANUNCIO, t: T1, payload: 'dame una', movimientos: [pagaElCoste('ana'), { token: 'R', emisor: 'ana', cantidad: 1, de: 'bea', a: 'ana', estado: 'anunciado', refiere: '2026-11-20T10:00:00Z' }] });
    // Lo que hace «pay» (que es de E), escrito a mano para la R: en el 4 del anuncio, lo anunciado.
    const pago = await eje.escribir({ autor: 'bea', sobre: anuncio.id, en: '4000000000', t: T1, payload: ['pay: bea paga', [{ ref: anuncio.id }], ['all announced movements happened'], ['bea'], ['pay']], movimientos: [pagaElCoste('bea'), { token: 'R', emisor: 'ana', cantidad: 1, de: 'bea', a: 'ana' }] });
    return { anuncio, pago };
  };
  /** Una marca (el ocupante de más del 8.8) anclada en el pago, escrita por ana. */
  const marcar = (id) => eje.escribir({ autor: 'ana', sobre: id, t: T1, payload: ['marca'], movimientos: [pagaElCoste('ana')] });
  const ctx = () => new ContextoEje(eje, { epoch: eje.epoca() });
  const ocho = (id, d) => evaluar('(first it.6).8.' + d, ctx(), { sujeto: id }).valor.map((x) => x?.id ?? x);
  return { eje, cosa, anunciarYPagar, marcar, ocho, altaB };
}

test('estaciones: un ocupante de más en X.6.8.8 (otra lectura de una época hija) no deja el anuncio en «autorizada» si no espera ningún criterio; con un criterio sin autorizar, sigue en «autorizada» aunque lo haya', async () => {
  const m = await conOtraLecturaEnEl88();
  // Sin criterio: el pago se ejecuta; con la marca, el 8.8 tiene un ocupante y el 8.7 ninguno, y sigue «ejecutada».
  const a = await m.anunciarYPagar('sin criterio');
  assert.equal(A.estacionDeAnuncio(m.eje, a.anuncio.id), 'ejecutada');
  const marca = await m.marcar(a.pago.id);
  assert.deepEqual([m.ocho(a.pago.id, 7), m.ocho(a.pago.id, 8)], [[], [marca.id]], 'el 8.8 lleva la marca (otra lectura) y el 8.7 nada');
  assert.equal(A.estacionDeAnuncio(m.eje, a.anuncio.id), 'ejecutada', 'contar a ciegas la dejaba en «autorizada» para siempre');
  // Con un criterio de verdad (el segundo factor de bea sobre R), sin autorizar: «autorizada», con la marca o sin ella.
  const c = await A.transaccion(m.eje, 'second factor', { X: m.altaB, family: 'R', amount: 1, holder: 'cartera' }, 'bea', { t: T1 });
  assert.ok(c.ok, JSON.stringify(c.motivos));
  await m.eje.anadir(c.evento);
  const b = await m.anunciarYPagar('con criterio');
  assert.equal(A.estacionDeAnuncio(m.eje, b.anuncio.id), 'autorizada');
  const otra = await m.marcar(b.pago.id);
  assert.deepEqual([m.ocho(b.pago.id, 7).length, m.ocho(b.pago.id, 8)], [1, [otra.id]], 'un criterio en el 8.7 y solo la marca en el 8.8: cuentan lo mismo');
  assert.equal(A.estacionDeAnuncio(m.eje, b.anuncio.id), 'autorizada', 'contar a ciegas la daba por «ejecutada»');
  // La cartera autoriza: «ejecutada».
  const ok = await A.autorizar(m.eje, b.pago.id, 'cartera', m.cosa.privada, { t: T1 });
  assert.ok(ok.ok, JSON.stringify(ok.motivos));
  await m.eje.anadir(ok.evento);
  assert.equal(A.estacionDeAnuncio(m.eje, b.anuncio.id), 'ejecutada');
});
