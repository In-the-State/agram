// Revisión de seguridad, segunda pasada: solo el SUELO (VG 17-11: cada uno solo mueve lo suyo; todo registro paga su
// T; se entra por invitación y el invitado queda protegido; la regla de las reglas pide un umbral más alto). Encargo de
// Core AGRAM tras test/revision-gobierno.test.js. Un caso por hallazgo; los que fallan hoy, con `todo` y su motivo.
// Ejes de demostración en memoria, identidades inventadas. S2, S4 y S5 los arregla encargo-arreglos-gobierno-anexo.md
// (Core AGRAM 17-11; su motivo queda en un comentario); S6 sigue como pregunta.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Eje } from '../src/eje.js';
import * as A from '../src/acciones.js';
import { EPOCA_0_BTML, idDeRegistro } from '../src/epocas.js';
import * as V from '../src/versiones.js';
import { quemaDelCoste } from '../src/escritura.js';
import { escribirPagando, pagaElCoste } from '../ejemplos/ikisai/coste.mjs';

const T0 = '2026-11-17T08:00:00Z';
const ID0 = EPOCA_0_BTML.id;
const M0 = { ref: ID0 };
const copia = (x) => JSON.parse(JSON.stringify(x));
const regla0 = (nombre) => EPOCA_0_BTML.reglasConId.find((x) => x.regla[0][0] === nombre).regla;

/** Un libro de ana (la dueña: con ella sola cualquier umbral se cumple) con nivel pedido 0 e `invitados`. */
async function mundo({ invitados = ['bea', 'cris'] } = {}) {
  const raiz = [['revisión del suelo'], M0, M0, M0, M0, M0, [['hija de prueba'], ['hereda'], [ID0]], [M0, M0, M0, M0, M0, M0, M0, M0, M0, [M0, M0, M0, [0], [0]]]];
  const eje = await Eje.genesis({ identidad: 'ana', foco: ['ana'], t: T0, demostracion: true, epoca: { raiz, registros: [] } });
  let s = 0;
  const reloj = () => new Date(Date.parse(T0) + ++s * 1000).toISOString().replace('.000Z', 'Z');
  const invitaciones = {};
  for (const n of invitados) {
    invitaciones[n] = await eje.invitar({ autor: 'ana', invitado: n, t: reloj() });
    await eje.aceptar(invitaciones[n], {}, { t: reloj() });
  }
  const intenta = async (cual, params, yo = 'ana') => {
    const r = await A.transaccion(eje, cual, params, yo, { t: reloj() });
    if (!r.ok) return { motivos: r.motivos };
    try {
      return { ev: await eje.anadir(r.evento) };
    } catch (e) {
      return { motivos: e.motivos ?? [{ texto: e.message }] };
    }
  };
  const raizDeCambio = (titulo, propias) => {
    const id = eje.epoca().id;
    const m = { ref: id };
    const n = Math.max(6, ...Object.keys(propias).map(Number)) + 1;
    return Array.from({ length: n }, (_, i) => (i === 0 ? [titulo] : propias[i] ?? (i === 6 ? [['propuesto en la revisión'], ['hereda'], [id]] : m)));
  };
  /** Propone, apoya ana con todo su P, aprueba, retira el apoyo y pone en vigor. */
  const recorrer = async (titulo, propias, { clase = 'governance', registros } = {}) => {
    const propuesta = await intenta('propose a change', { X: eje.genesisId, title: titulo, explanation: 'revisión', change: raizDeCambio(titulo, propias), ...(registros ? { records: registros } : {}), class: clase });
    if (!propuesta.ev) return { propuesta };
    await intenta('support a change', { X: propuesta.ev.id });
    const aprobacion = await intenta('enact a change', { X: propuesta.ev.id });
    await intenta('withdraw support', { X: propuesta.ev.id });
    if (!aprobacion.ev) return { propuesta, aprobacion };
    const puesta = await intenta('put a change in force', { X: aprobacion.ev.id });
    return { propuesta, aprobacion, puesta };
  };
  /** Un registro añadido a mano, pagando su coste: 'entra' o el mensaje del rechazo. */
  const aMano = (datos, privada) => escribirPagando(eje, { t: reloj(), ...datos }, privada).then(() => 'entra', (e) => e.message);
  return { eje, reloj, intenta, recorrer, aMano, invitaciones };
}

const textos = (r) => JSON.stringify((r?.motivos ?? []).map((x) => x.mensaje ?? x.texto)).slice(0, 200);

// ---------- Aguanta (S1 intentado): una lectura nueva en X.3.1 no abre la puerta ----------

test('aguanta: un cambio que añade una lectura en X.3.1 (=first ev.3) entra en vigor (como «governance»: como «ordinary» ya no), pero no deja entrar a nadie sin invitación', async () => {
  // El 3 de un registro es [autor, firmante] y su payload: el contexto no le suma lecturas (src/contexto-eje.js, #meta,
  // d === 3 vuelve antes de mirar las lecturas), así que «a person joins by an invitation» no ve la lectura nueva.
  const m = await mundo();
  const invitacion = m.invitaciones.bea.id;
  const alta = () => m.eje.escribir({ autor: 'zed', sobre: invitacion, t: m.reloj(), movimientos: [quemaDelCoste('zed', ['Alta de zed'], 'minuto', { eje: m.eje })], payload: ['Alta de zed'] }).then(() => 'entra', (e) => e.message);
  assert.match(await alta(), /a person joins by an invitation/, 'control');
  const puerta = [['open door'], ['ev.3'], ['=first ev.3'], ['X.3.1'], ['read'], ['*'], ['revisión de seguridad: una lectura en X.3.1'], ['epoch 0'], ['after changes'], ['open door: the writer']];
  // Una lectura que se guarda (en X.3.1) es de clase «governance» desde los arreglos (A, H1): como «ordinary» no entra.
  const corriente = await m.recorrer('una lectura más', { 2: [{ ref: idDeRegistro(puerta) }] }, { clase: 'ordinary', registros: [puerta] });
  assert.ok(!corriente.propuesta.ev, 'como «ordinary», no');
  const r = await m.recorrer('una lectura más', { 2: [{ ref: idDeRegistro(puerta) }] }, { clase: 'governance', registros: [puerta] });
  assert.ok(r.puesta?.ev, 'la lectura entra en vigor como «governance»');
  assert.match(await alta(), /a person joins by an invitation/);
  assert.equal(m.eje.alta('zed'), null);
});

// ---------- S2 (alto, hoy, sin gobierno): un tercero bloquea una invitación anclando algo en su 7 ----------

// Arreglado (encargo-arreglos-gobierno-anexo.md): HALLAZGO S2: «a person joins by an invitation» lee (invitación).7 (y .0, .3.1, .3.5), y ahí se suma lo que otros anclan en esa posición de la invitación; una nota con un texto hace que el plazo dé ERROR («<= espera un número») y la regla rechaza. Cualquiera con alta deja sin entrada al invitado de otro. En el 3 pasa algo parecido: lo anclado añade su id al 3.5 y un nombre al 3.1
test('S2: cris ancla una nota en el 7 de una invitación de ana a zed, y zed ya no puede entrar a tiempo', async () => {
  const m = await mundo();
  const inv = await m.eje.invitar({ autor: 'ana', invitado: 'zed', t: m.reloj() });
  assert.equal(await m.aMano({ autor: 'cris', sobre: inv.id, en: '7000000000', movimientos: [pagaElCoste('cris')], payload: [['basura']] }), 'entra', 'cris puede anclar en el 7 de la invitación');
  const r = await m.eje.aceptar(inv, {}, { t: m.reloj() }).then(() => 'entra', (e) => e.message);
  assert.equal(r, 'entra', 'el invitado queda protegido: lo que un tercero ancle en su invitación no le cierra la puerta');
});

// ---------- Aguanta (S3 intentado): acuñar la R de otro, ni tras un cambio de gobierno ----------

test('aguanta: un cambio de gobierno sustituye «R is minted by its issuer» y «R is minted to its issuer», y cris sigue sin acuñarse R de ana (lo para el núcleo)', async () => {
  const m = await mundo();
  const acunar = () => m.aMano({ autor: 'cris', sobre: m.eje.alta('cris').id, movimientos: [pagaElCoste('cris'), { token: 'R', emisor: 'ana', cantidad: 5, de: null, a: 'cris' }], payload: [['R de ana']] });
  assert.match(await acunar(), /la emisión de R va a su propio emisor/, 'control');
  const nuevas = ['R is minted by its issuer', 'R is minted to its issuer'].map((n) => {
    const r = copia(regla0(n));
    r[2] = ['=true'];
    r[6] = ['revisión de seguridad: la misma regla, que ya no mira quién acuña'];
    return r;
  });
  const r = await m.recorrer('acuñar R de otros', { 2: nuevas.map((x) => ({ ref: idDeRegistro(x) })) }, { registros: nuevas });
  assert.ok(r.puesta?.ev, 'el suelo no lo para: esas dos reglas no están en 7.9.6');
  assert.match(await acunar(), /la emisión de R va a su propio emisor/, 'lo para la forma del movimiento, en el núcleo');
});

// ---------- S4 (alto): un cambio de gobierno sustituye «approved» y la regla de las reglas deja de pedir más ----------

// Arreglado (encargo-arreglos-gobierno-anexo.md): HALLAZGO S4: el punto 4 del suelo solo se hace cumplir comparando 7.9.2 con 7.9.1; «approved», «support», «support of» y las cuatro reglas del gobierno son piezas de gobierno pero no suelo, así que un cambio de gobierno las sustituye por lo que quiera (aquí, «approved» siempre verdadero: cualquier cambio, corriente o de gobierno, se aprueba sin apoyo)
test('S4: un cambio de gobierno que sustituye «approved» por una lectura que siempre pasa entra (el suelo no guarda «la regla de las reglas pide más»)', () => {
  const aprobado = copia(regla0('approved'));
  aprobado[2] = ['=true'];
  aprobado[6] = ['revisión de seguridad: aprobado siempre'];
  const raiz = [['aprobado siempre'], M0, [{ ref: idDeRegistro(aprobado) }], M0, M0, M0, [['x'], ['hereda'], [ID0]]];
  const r = V.comprobarCambio(EPOCA_0_BTML, { raiz, registros: [aprobado] }, 'governance');
  assert.ok(r.motivos.length > 0, 'la lectura que decide si un cambio pasa no la sustituye ni un cambio de gobierno');
});

// ---------- S5 (medio): umbrales iguales ----------

// Arreglado (encargo-arreglos-gobierno-anexo.md): HALLAZGO S5: erroresDelSuelo solo rechaza 7.9.2 < 7.9.1; igualarlos pasa, y VG pidió «un umbral más alto». (Bajar los dos a la vez, por ejemplo -1 y 0, también pasa)
test('S5: un cambio de gobierno que iguala los dos umbrales (0.6 y 0.6) entra: la regla de las reglas ya no pide más', () => {
  const raiz = [['umbrales iguales'], M0, M0, M0, M0, M0, [['x'], ['hereda'], [ID0]], [M0, M0, M0, M0, M0, M0, M0, M0, M0, [M0, [0.6], [0.6]]]];
  const r = V.comprobarCambio(EPOCA_0_BTML, { raiz, registros: [] }, 'governance');
  assert.ok(r.motivos.some((x) => /umbral/.test(x)), 'el umbral de gobierno ha de quedar por encima del corriente');
});

// ---------- S6 (pregunta, no necesariamente fallo): una condición de gobierno que nombra a alguien ----------

test('S6: un cambio de gobierno añade «=first ev.3 != "bea"» y bea ya no escribe nada (ni retira su P): ninguna regla del suelo lo impide', {
  todo: 'PREGUNTA S6, sin arreglar (anexo de los arreglos, K): un cambio de gobierno puede añadir una condición que nombre a una persona; no hay comprobación general; la protección es el aviso antes de regir y la salida a un libro hijo',
}, async () => {
  const m = await mundo();
  const nota = () => m.aMano({ autor: 'bea', sobre: m.eje.alta('bea').id, movimientos: [pagaElCoste('bea')], payload: [['nota de bea']] });
  assert.equal(await nota(), 'entra', 'control');
  const veto = [['not bea'], [0], ['=first ev.3 != "bea"'], ['ev.3'], ['mint', 'transfer', 'lock', 'release', 'burn'], ['*'], ['revisión de seguridad'], ['epoch 0'], ['after at most a year ahead'], ['not bea: bea does not write here any more']];
  const r = await m.recorrer('fuera bea', { 2: [{ ref: idDeRegistro(veto) }] }, { registros: [veto] });
  assert.ok(r.puesta?.ev, 'el cambio de gobierno entra: ' + textos(r.puesta));
  assert.equal(await nota(), 'entra', 'una persona invitada sigue pudiendo escribir lo suyo');
});

// ---------- Lo que aguanta ----------

test('aguanta: sustituir «the cost of writing» o cambiar una posición del suelo, ni con un cambio de gobierno', async () => {
  const m = await mundo();
  const coste = copia(regla0('the cost of writing'));
  coste[2] = ['=0'];
  const r1 = await m.recorrer('escribir gratis', { 2: [{ ref: idDeRegistro(coste) }] }, { registros: [coste] });
  assert.ok(!r1.propuesta.ev, 'la propuesta no entra');
  assert.match(textos(r1.propuesta), /sustituye «the cost of writing»/);
  const k = { ref: m.eje.epoca().id };
  const r2 = await m.recorrer('día más corto', { 1: [k, k, k, [k, [k, [1]]]] });
  assert.ok(!r2.propuesta.ev);
  assert.match(textos(r2.propuesta), /epoch\.1\.3\.1/);
  assert.equal(m.eje.versiones().length, 1);
});

// ---------- Lo que añade el anexo de los arreglos (encargo-arreglos-gobierno-anexo.md) ----------

test('anexo H: una invitación con notas ajenas ancladas en su 7, en su 0 y en su 3 se acepta', async () => {
  const m = await mundo();
  const inv = await m.eje.invitar({ autor: 'ana', invitado: 'zed', t: m.reloj() });
  for (const en of ['7000000000', '0000000000', '3000000000', '3100000000', '3500000000']) {
    assert.equal(await m.aMano({ autor: 'cris', sobre: inv.id, en, movimientos: [pagaElCoste('cris')], payload: [['basura'], ['cris'], ['x'], ['cris']] }), 'entra', 'cris ancla en ' + en);
  }
  const r = await m.eje.aceptar(inv, {}, { t: m.reloj() }).then(() => 'entra', (e) => e.message);
  assert.equal(r, 'entra');
  assert.ok(m.eje.alta('zed'));
});

test('anexo I: un cambio «governance» que sustituye «approved» se rechaza por el suelo', async () => {
  const m = await mundo();
  const aprobado = copia(regla0('approved'));
  aprobado[2] = ['=true'];
  aprobado[6] = ['revisión de seguridad: aprobado siempre'];
  const r = await m.recorrer('aprobado siempre', { 2: [{ ref: idDeRegistro(aprobado) }] }, { registros: [aprobado] });
  assert.ok(!r.propuesta.ev);
  assert.match(textos(r.propuesta), /sustituye «approved», que es del suelo/);
  assert.equal(m.eje.versiones().length, 1);
});

test('anexo J: un cambio que mueve 7.9.2 dentro del rango entra con los dos tercios; fuera de rango, no', async () => {
  const m = await mundo();
  const k = { ref: m.eje.epoca().id };
  const fila = (dos) => [k, k, k, k, k, k, k, k, k, [k, k, [dos]]];
  const fuera = await m.recorrer('umbral alto 1', { 7: fila(1) });
  assert.ok(!fuera.propuesta.ev);
  assert.match(textos(fuera.propuesta), /un umbral es un número mayor que 0 y menor que 1/);
  const r = await m.recorrer('umbral alto 0.75', { 7: fila(0.75) });
  assert.ok(r.puesta?.ev, textos(r.aprobacion ?? r.propuesta));
  assert.deepEqual(m.eje.epoca().registro[7][9][2], [0.75]);
});
