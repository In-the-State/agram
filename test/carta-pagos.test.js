// El recibo de pago en la carta (encargo «carta: pagos», 16-11): en el reverso de un registro, la acción «buscar su recibo
// de pago» solo si mi configuración dice «pay url», y lo verificado enseña el pago cuando lo hay: «pagado» si «paid» es
// verdadera, «pago pendiente de bloque» si la sincronía de la cuenta lo espera, «el recibo de pago no vale» si es falsa;
// sin recibo ni espera, nada. Ninguna pantalla de pagar. El recibo, de la simulación de StateArk (108f888) en proceso,
// con un observador BIP-340 real; claves de PRUEBA.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { salida } from '../src/index.js';
import { Eje } from '../src/eje.js';
import { generarClaves } from '../src/autoridad.js';
import * as G from '../carta/guia.js';
import { arbol } from '../carta/carta.js';
import { html } from '../carta/dom.js';
import { t } from '../carta/textos.js';
import { Simulacion } from '../servidor/sim/stateark/index.js';
import { firmaSimulada, mensajeAutorizacion } from '../servidor/sim/stateark/pagos.js';
import { huella } from '../servidor/sim/stateark/canon.js';
import { sha256Texto } from '../servidor/sim/stateark/hash.js';
import { observadorBip340 } from '../servidor/sim/sello-agram.js';
import { pagaElCoste } from './ayudas-coste.js';

const T = (m) => '2026-11-16T08:' + String(m).padStart(2, '0') + ':00Z';
const ORDENADOR = { ancho: 1920, alto: 1080 };

/** Un pago con puntero a `id` en la simulación, minado, y su sobre (el recibo único que firma la clave «carril»). */
async function reciboDeLaSim(sim, id) {
  const c = sim.carril;
  const vg = await sha256Texto('titular de prueba de la carta');
  await c.crearCartera('vg', { titular: vg });
  await c.crearCartera('aina', { titular: await sha256Texto('quien cobra en la carta') });
  await c.acunar(await c.direccion('vg'), 200_000);
  await sim.minar();
  const ins = { schema: 'stateark.payment-instruction@2', rail: 'bitcoin.onchain', amount: { valor: 61_000, unidad: 'sat' }, destino: { clase: 'bitcoin/address', valor: await c.direccion('aina') }, correlation_id: 'CARTA', puntero: id };
  const plan = await c.preparar('vg', ins);
  const firma = await firmaSimulada(vg, await mensajeAutorizacion(await huella(plan)));
  const { posicion } = await c.ejecutar('vg', ins, plan, await c.autorizar(plan, { titular: vg, firma }));
  await sim.minar();
  const custodia = sim.sellador.observador.custodia;
  try { await custodia.crearClave('nostr', 'carril'); } catch (e) { if (e?.codigo !== 'key_exists') throw e; }
  return custodia.firmarRecibo('carril', await c.reciboPago(posicion.txid), { t: T(30), dominio: 'nostr' });
}

test('el reverso: «buscar su recibo de pago» solo con «pay url»; «pagado», «pago pendiente de bloque» y «el recibo de pago no vale»; sin nada, nada', async () => {
  const sim = await Simulacion.crear({ observador: await observadorBip340() });
  const cuenta = await generarClaves();
  const eje = await Eje.genesis({ identidad: 'vg', foco: ['mi eje'], t: T(0), clave: cuenta.publica, privada: cuenta.privada, exigirFirmas: true });
  const ajustes = async (valores, m) => {
    const a = G.ajustesEditablesDe('exterior settings', eje, 'vg', valores);
    await salida.escribirDesde(eje, { modo: 'sequenced', autor: 'vg', sobre: a.sobre, en: a.en, payload: a.payload, t: T(m) }, cuenta.privada);
  };
  await ajustes({ 'observer keys': sim.sellador.claveObservador }, 1);
  const e1 = await eje.escribir({ autor: 'vg', sobre: eje.genesisId, t: T(2), movimientos: [pagaElCoste('vg')], payload: ['la cama'] }, cuenta.privada);
  const e2 = await eje.escribir({ autor: 'vg', sobre: e1.id, t: T(3), movimientos: [pagaElCoste('vg')], payload: ['el desayuno'] }, cuenta.privada);
  const reverso = async (X, estado = {}) => {
    const a = await arbol({ foco: { X, pv: 5 }, ...estado }, eje, 'vg', ORDENADOR, { idioma: 'es' });
    assert.equal(a.centro.cara, 'reverso');
    return { centro: a.centro, h: html(a) };
  };
  const boton = (X) => new RegExp(`<button type="button" class="enlace buscar-pago" data-buscar-pago data-x="${X}" title="[^"]*">${t('buscarPago')}</button>`);

  // Sin «pay url», sin recibo y sin espera: nada.
  let r = await reverso(e1.id);
  assert.equal(r.centro.pago, null);
  assert.doesNotMatch(r.h, /data-buscar-pago|class="pago"/);

  // Con «pay url» en mi configuración: la acción, y nada más.
  await ajustes({ 'observer keys': sim.sellador.claveObservador, 'pay url': 'http://127.0.0.1:8787' }, 4);
  r = await reverso(e1.id);
  assert.deepEqual(r.centro.pago, { buscar: true, estado: null });
  assert.match(r.h, boton(e1.id));
  assert.doesNotMatch(r.h, /class="pago"/);
  assert.equal(t('buscarPago'), 'buscar su recibo de pago');

  // La sincronía de la cuenta lo espera: «pago pendiente de bloque» (y la acción sigue).
  const sincronia = { estadoDePago: (id) => (id === e1.id ? { esperando: true } : undefined) };
  r = await reverso(e1.id, { sincronia });
  assert.deepEqual(r.centro.pago, { buscar: true, estado: 'pendiente' });
  assert.match(r.h, /<p class="verificado-linea pago-linea"><small class="pago" data-pago="pendiente" title="[^"]*">pago pendiente de bloque<\/small> <button[^>]*data-buscar-pago/);

  // Con su recibo de pago en el eje y «paid» verdadera: «pagado», sin la acción.
  const sobre = await reciboDeLaSim(sim, e1.id);
  assert.equal(eje.marcarPago(e1.id, sobre), true);
  r = await reverso(e1.id, { sincronia });
  assert.deepEqual(r.centro.pago, { buscar: true, estado: 'pagado' });
  assert.match(r.h, /<small class="pago" data-pago="pagado" title="pagado: [^"]*">pagado<\/small>/);
  assert.doesNotMatch(r.h, /data-buscar-pago/);

  // Un recibo que no es de este registro (su puntero es otro): «paid» falsa, «el recibo de pago no vale».
  assert.equal(eje.marcarPago(e2.id, sobre), true);
  r = await reverso(e2.id);
  assert.deepEqual(r.centro.pago, { buscar: true, estado: 'noVale' });
  assert.match(r.h, /<small class="pago" data-pago="noVale" title="[^"]*">el recibo de pago no vale<\/small>/);

  // Quien mira sin «pay url» (otra identidad) ve el estado, pero no la acción.
  const otro = await arbol({ foco: { X: e1.id, pv: 5 } }, eje, null, ORDENADOR, { idioma: 'es' });
  assert.deepEqual(otro.centro.pago, { buscar: false, estado: 'pagado' });
  assert.doesNotMatch(html(otro), /data-buscar-pago/);

  // Los tres textos, en llano.
  assert.deepEqual([t('pagado'), t('pagoPendiente'), t('pagoNoVale')], ['pagado', 'pago pendiente de bloque', 'el recibo de pago no vale']);
});
