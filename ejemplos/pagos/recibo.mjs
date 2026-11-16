// El recibo de pago, de punta a punta (encargo «carta: pagos», 16-11), con la SIMULACIÓN de StateArk en proceso
// (servidor/sim/stateark/ 108f888, su servidor HTTP en un puerto libre de 127.0.0.1, con la firma del titular exigida) y
// el libro compartido de prueba (servidor/prueba/). `node ejemplos/pagos/recibo.mjs`.
//
//   1. vg escribe un movimiento del libro (un registro que paga su coste) y declara en sus ajustes del exterior la «pay
//      url» y la clave del observador de StateArk; lo sube al libro compartido.
//   2. vg paga fuera, con un pago que apunta a ese registro (el puntero, su id): cartera, dirección, grifo (solo en la
//      simulación), preparar, autorizar y ejecutar; todo firmado por el titular (NIP-98 en cada petición, y la
//      autorización BIP-340 del plan), con el firmante de su cuenta (src/pago.js no ve la clave privada). Se mina.
//   3. Al sincronizar, el recibo de pago entra en el eje de vg (esperarPago con su txid → eje.marcarPago, X.6.8.3).
//   4. Un SEGUNDO lector, que solo conoce el id del registro, baja el eje, lo espera por el puntero y, al sincronizar,
//      «paid» (X.6.8.6) le da verdadero: lo comprueba la regla de la época, sin fiarse de quien pagó.
//
// Claves de PRUEBA generadas en cada ejecución; nada sale de la máquina.

import { pathToFileURL } from 'node:url';
import { arrancar } from '../../servidor/prueba/servidor.mjs';
import { crearServidor } from '../../servidor/sim/stateark/servidor.js';
import { Simulacion, Custodia, esquemaNoble } from '../../servidor/sim/stateark/index.js';
import { mensajeAutorizacion } from '../../servidor/sim/stateark/pagos.js';
import { huella } from '../../servidor/sim/stateark/canon.js';
import { schnorr } from '../../src/vendor/noble-secp256k1.js';
import { Eje, salida, sincronia, pago as pagos, contrato, autoridad } from '../../src/index.js';
import { ajustesEditablesDe } from '../../carta/guia.js';
import { escribirPagando, pagaElCoste } from '../ikisai/coste.mjs';

const T = (m) => '2026-11-16T07:' + String(m).padStart(2, '0') + ':00Z';

/** El firmante de una cuenta (como el de la carta): firma un id (32 bytes en hex) con su clave; la privada se queda aquí. */
const firmanteDe = (privada) => ({ pubkey: autoridad.publicaDe(privada), firmar: async (id) => (await autoridad.firmar({ id }, privada)).firma });

/**
 * El recorrido entero. → { registro, txid, informeA, informeB, pagadoA, pagadoB }: «paid» en el eje de quien pagó y en el
 * del segundo lector. Arranca y cierra sus dos servidores.
 */
export async function ejemploRecibo({ log = () => {} } = {}) {
  const libro = await arrancar({ puerto: 0, secreto: 'prueba' });
  // Una custodia con BIP-340 real: el observador firma las cabeceras, la clave «carril» firma los recibos y el carril
  // comprueba de verdad la autorización del titular.
  const simulacion = await Simulacion.crear({ custodia: new Custodia({ esquema: esquemaNoble(schnorr) }) });
  const { servidor } = await crearServidor({ simulacion, firmaTitular: true, urlPublica: '' });
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  const payUrl = `http://127.0.0.1:${servidor.address().port}`;
  const post = async (ruta, cuerpo) => (await fetch(payUrl + ruta, { method: 'POST', body: JSON.stringify(cuerpo ?? {}) })).json(); // solo lo de la simulación: grifo y minar
  try {
    const r = await fetch(libro.url + '/ejes', { method: 'POST', headers: { 'X-Crear-Ejes': 'prueba', 'Content-Type': 'application/json' }, body: JSON.stringify({ eje: 'pagos' }) });
    const { claveLectura } = await r.json();

    // 1. El movimiento del libro y los ajustes del exterior de vg (la cuenta raíz: con ellos verifica todo lector).
    const vg = await autoridad.generarClaves();
    const eje = await Eje.genesis({ identidad: 'vg', foco: ['la casa'], t: T(0), clave: vg.publica, privada: vg.privada, exigirFirmas: true });
    const a = ajustesEditablesDe('exterior settings', eje, 'vg', { 'pay url': payUrl, 'observer keys': simulacion.sellador.claveObservador });
    await salida.escribirDesde(eje, { modo: 'sequenced', autor: 'vg', sobre: a.sobre, en: a.en, payload: a.payload, t: T(1) }, vg.privada);
    const registro = await escribirPagando(eje, { autor: 'vg', sobre: eje.genesisId, t: T(2), movimientos: [pagaElCoste('vg')], payload: ['la cama de esta noche'] }, vg.privada);
    const firmante = firmanteDe(vg.privada);
    const A = new sincronia.Sincronia({ url: libro.url, eje: 'pagos', claveLectura, pago: pagos.deConfiguracion(eje, 'vg', firmante) });
    await A.sincronizar(eje);
    log(`registro ${registro.id.slice(0, 8)} en el libro compartido; pay url ${A.pago.url}`);

    // 2. El pago, fuera: todo lo firma el titular (vg) por src/pago.js; quien cobra tiene su propia cartera.
    const p = A.pago;
    await p.cartera({ nombre: 'vg' });
    const cobra = pagos.pagoHttp({ url: payUrl, ...firmanteDe((await autoridad.generarClaves()).privada) });
    await cobra.cartera({ nombre: 'cocina' });
    await post('/pagos/acunar', { direccion: (await p.direccion({ nombre: 'vg' })).direccion, sat: 200_000 });
    await post('/minar');
    const instruccion = {
      schema: 'stateark.payment-instruction@2', rail: 'bitcoin.onchain', amount: { valor: 61_000, unidad: 'sat' },
      destino: { clase: 'bitcoin/address', valor: (await cobra.direccion({ nombre: 'cocina' })).direccion },
      correlation_id: 'AGRAM-' + registro.id.slice(0, 8), puntero: registro.id,
    };
    const plan = await p.preparar({ nombre: 'vg', instruccion });
    const autorizacion = await p.autorizar({ plan, firma: await firmante.firmar(await mensajeAutorizacion(await huella(plan))) });
    const { posicion } = await p.ejecutar({ nombre: 'vg', instruccion, plan, autorizacion });
    log(`pago ${posicion.txid.slice(0, 8)}: ${(await p.reciboPago(posicion.txid)).pendiente ? 'aún sin bloque' : 'en un bloque'}`);
    await post('/minar');

    // 3. Al sincronizar, el recibo entra en el eje de quien pagó.
    A.esperarPago(registro.id, { txid: posicion.txid });
    const informeA = await A.sincronizar(eje);
    const pagadoA = contrato.verificado(eje, registro.id).pago;
    log(`vg: recibos anotados ${informeA.pagos.anotados.length}, «paid» ${pagadoA}`);

    // 4. El segundo lector solo conoce el id del registro: lo busca por el puntero, sin firmante.
    const B = new sincronia.Sincronia({ url: libro.url, eje: 'pagos', claveLectura, pago: pagos.pagoHttp({ url: payUrl }) });
    const ejeB = (await B.sincronizar(null)).eje;
    B.esperarPago(registro.id);
    const informeB = await B.sincronizar(ejeB);
    const pagadoB = contrato.verificado(ejeB, registro.id).pago;
    log(`segundo lector: recibos anotados ${informeB.pagos.anotados.length}, «paid» ${pagadoB}`);
    return { registro, txid: posicion.txid, informeA, informeB, pagadoA, pagadoB };
  } finally {
    await new Promise((r) => servidor.close(r));
    await libro.cerrar();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const r = await ejemploRecibo({ log: (x) => console.log(x) });
  if (r.pagadoB !== true) process.exitCode = 1;
}
