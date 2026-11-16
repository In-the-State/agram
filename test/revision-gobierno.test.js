// Revisión de seguridad del gobierno y del motor de versiones (A21 y A23, tramo 2, paso 5; encargo
// agram-equipo/encargos/encargo-revision-gobierno.md). Un caso por hallazgo. Los que demuestran un fallo de hoy van con
// `todo` y su motivo: afirman lo que debería pasar, fallan hoy y no rompen la batería. Los que no llevan `todo` son lo
// que el encargo pedía comprobar por el eje y aguantó. Ejes de demostración en memoria, identidades inventadas.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Eje } from '../src/eje.js';
import * as A from '../src/acciones.js';
import { EPOCA_0_BTML, cargarEpocaEscrita, epocaEscritaDe, idDeRegistro } from '../src/epocas.js';
import * as V from '../src/versiones.js';
import { generarClaves } from '../src/autoridad.js';
import { escribirPagando, pagaElCoste } from '../ejemplos/ikisai/coste.mjs';
import { ejemploNodo, N, CLAVES, hora } from '../ejemplos/state/nodo.mjs';

const T0 = '2026-11-17T08:00:00Z';
const ID0 = EPOCA_0_BTML.id;
const M0 = { ref: ID0 };
const copia = (x) => JSON.parse(JSON.stringify(x));

/**
 * Un libro de ana con una época hija de la 0 escrita en su génesis: `nombres` en 7.9.5 y niveles pedidos `n3` y `n4`
 * (0 por defecto: sin prueba de sello, para mirar el recuento y la clase sin montar sellos). `invitados`, invitados por ana.
 */
async function mundo({ nombres = [0], n3 = 0, n4 = 0, invitados = ['bea'] } = {}) {
  const raiz = [['revisión'], M0, M0, M0, M0, M0, [['hija de prueba de la revisión'], ['hereda'], [ID0]], [M0, M0, M0, M0, M0, M0, M0, M0, M0, [M0, M0, M0, [n3], [n4], nombres]]];
  const eje = await Eje.genesis({ identidad: 'ana', foco: ['ana'], t: T0, demostracion: true, epoca: { raiz, registros: [] } });
  let s = 0;
  const reloj = () => new Date(Date.parse(T0) + ++s * 1000).toISOString().replace('.000Z', 'Z');
  for (const n of invitados) {
    const inv = await eje.invitar({ autor: 'ana', invitado: n, t: reloj() });
    await eje.aceptar(inv, {}, { t: reloj() });
  }
  /** Lanza una plantilla y la añade: { ev } o { motivos }. */
  const intenta = async (cual, params, yo = 'ana') => {
    const r = await A.transaccion(eje, cual, params, yo, { t: reloj() });
    if (!r.ok) return { motivos: r.motivos };
    try {
      return { ev: await eje.anadir(r.evento) };
    } catch (e) {
      return { motivos: e.motivos ?? [{ texto: e.message }] };
    }
  };
  /** La raíz de un cambio sobre la versión vigente: la marca en todo salvo `propias`. */
  const raizDeCambio = (titulo, propias) => {
    const id = eje.epoca().id;
    const m = { ref: id };
    const n = Math.max(6, ...Object.keys(propias).map(Number)) + 1;
    return Array.from({ length: n }, (_, i) => (i === 0 ? [titulo] : propias[i] ?? (i === 6 ? [['propuesto en la revisión'], ['hereda'], [id]] : m)));
  };
  const marca = () => ({ ref: eje.epoca().id });
  const proponer = (titulo, propias, { clase = 'ordinary', registros, yo = 'ana' } = {}) =>
    intenta('propose a change', { X: eje.genesisId, title: titulo, explanation: 'revisión', change: raizDeCambio(titulo, propias), ...(registros ? { records: registros } : {}), class: clase }, yo);
  /** Propone, apoyan `apoyan` con todo su P, aprueba, retiran el apoyo y pone en vigor: lo que salga de cada paso. */
  const recorrer = async (titulo, propias, opciones = {}, apoyan = ['ana']) => {
    const propuesta = await proponer(titulo, propias, opciones);
    if (!propuesta.ev) return { propuesta };
    for (const q of apoyan) await intenta('support a change', { X: propuesta.ev.id }, q);
    const aprobacion = await intenta('enact a change', { X: propuesta.ev.id });
    for (const q of apoyan) await intenta('withdraw support', { X: propuesta.ev.id }, q);
    if (!aprobacion.ev) return { propuesta, aprobacion };
    const puesta = await intenta('put a change in force', { X: aprobacion.ev.id });
    return { propuesta, aprobacion, puesta };
  };
  /** El 7 de una raíz de cambio con la fila 7.9 dada por posiciones ({ 5: ['ana'] }). */
  const fila79 = (propias) => {
    const m = marca();
    const nueve = Array.from({ length: Math.max(...Object.keys(propias).map(Number)) + 1 }, (_, i) => propias[i] ?? m);
    return [m, m, m, m, m, m, m, m, m, nueve];
  };
  return { eje, reloj, intenta, proponer, recorrer, marca, fila79 };
}

const quienCuenta = (eje) => eje.epoca().registro[7][9][5];

// ---------- H1 (crítico): una lectura nueva en X.2.4.7 (o X.2.6, X.2.8) entra como cambio corriente ----------

test('H1: un cambio «ordinary» que añade una lectura en X.2.4.7 infla el apoyo y deja que una mayoría corriente pase cambios de gobierno', {
  todo: 'HALLAZGO H1: la clase se mira por el NOMBRE de las piezas de 7.9.7; una lectura nueva con otro nombre que se materializa donde leen «support»/«approved» (X.2.4.7, X.2.6, X.2.8) no cuenta como pieza de gobierno, y «support» suma todo lo que hay en X.2.4.7',
}, async () => {
  // ana pesa 9 de 14: pasa un cambio corriente (más de la mitad) y no uno de gobierno (dos tercios).
  const m = await mundo({ nombres: ['ana', 'bea 5'] });
  const fuera = () => m.recorrer('fuera bea', { 7: m.fila79({ 5: ['ana'] }) }, { clase: 'governance' });
  const control = await fuera();
  assert.ok(control.propuesta.ev && !control.aprobacion.ev, 'control: ana sola no aprueba un cambio de gobierno');
  // La lectura «support bonus»: la forma de «support of», con otro nombre y la fórmula «=100».
  const extra = copia(m.eje.epoca().lecturas.find((r) => r[0][0] === 'support of'));
  extra[0] = ['support bonus'];
  extra[2] = ['=100'];
  extra[6] = ['revisión de seguridad: una lectura que se materializa en X.2.4.7'];
  extra[9] = ['support bonus: prueba de la revisión'];
  const empujon = await m.recorrer('un empujón', { 2: [{ ref: idDeRegistro(extra) }] }, { registros: [extra] });
  const entro = Boolean(empujon.puesta?.ev);
  // Con la lectura en vigor, ana sola (o cualquiera que bloquee un poco de P) aprueba el cambio de gobierno.
  const despues = await fuera();
  assert.deepEqual(quienCuenta(m.eje), ['ana', 'bea 5'], 'un cambio que añade una lectura en X.2.4.7 toca el gobierno y no es «ordinary»; ana sola no echa a bea (hoy: el empujón ' + (entro ? 'entró en vigor como «ordinary»' : 'no entró') + ' y el cambio de gobierno ' + (despues.puesta?.ev ? 'entró en vigor' : 'no entró') + ')');
});

// ---------- H2 (alto): una regla nueva corriente congela el gobierno para siempre ----------

test('H2: un cambio «ordinary» que añade una condición contra «put a change in force» deja el libro sin poder cambiar nunca más', {
  todo: 'HALLAZGO H2: una condición nueva con otro nombre puede rechazar cualquier plantilla de gobierno (proponer, apoyar, retirar el apoyo, aprobar, poner en vigor); no es pieza de 7.9.7 por nombre y entra por mayoría corriente. Y como el registro que la quitaría tampoco entra en vigor, es irreversible',
}, async () => {
  const m = await mundo();
  const congela = [['nothing comes into force'], [0], ['=not ("put a change in force" in ev.4)'], ['ev.3'], ['mint', 'transfer', 'lock', 'release', 'burn'], ['*'], ['revisión de seguridad'], ['epoch 0'], ['after at most a year ahead'], ['nothing comes into force: no change comes into force any more']];
  const r1 = await m.recorrer('nada más entra en vigor', { 2: [{ ref: idDeRegistro(congela) }] }, { registros: [congela] });
  const entro = Boolean(r1.puesta?.ev);
  // Un cambio de gobierno aprobado después (más margen del reloj) ya no entra en vigor.
  const r2 = await m.recorrer('más margen', { 7: [m.marca(), m.marca(), m.marca(), [[900], [7200]]] }, { clase: 'governance' });
  assert.ok(r2.aprobacion?.ev, 'control: el cambio de gobierno se aprueba');
  assert.ok(!entro || r2.puesta?.ev, 'tras un cambio corriente, un cambio de gobierno aprobado sigue pudiendo entrar en vigor (hoy: ' + JSON.stringify((r2.puesta?.motivos ?? []).map((x) => x.mensaje ?? x.texto)).slice(0, 200) + ')');
});

// ---------- H3 (alto): la presión máxima, 9.0.0.4, la cambia un cambio corriente ----------

test('H3: un cambio «ordinary» que sube epoch.9.0.0.4 (la presión de un nombre suelto) da a ana sola los dos tercios', {
  todo: 'HALLAZGO H3: «support of» y «support» leen epoch.9.0.0.4 y no está en 7.9.7; con nombres mixtos (identidad y «nombre k») cambia el reparto sin pasar por el umbral alto. Lo mismo vale para epoch.7.6 (niveles y grados), que lee «a change comes into force with its proof»',
}, async () => {
  const m = await mundo({ nombres: ['ana', 'bea 5'] });
  const fuera = () => m.recorrer('fuera bea', { 7: m.fila79({ 5: ['ana'] }) }, { clase: 'governance' });
  assert.ok(!(await fuera()).aprobacion.ev, 'control: 9 de 14 no llega a dos tercios');
  const k = m.marca();
  const sube = await m.recorrer('presión máxima 100', { 9: [[[k, k, k, k, [100]]]] });
  const entro = Boolean(sube.puesta?.ev);
  const despues = await fuera();
  assert.deepEqual(quienCuenta(m.eje), ['ana', 'bea 5'], 'epoch.9.0.0.4 no la mueve un cambio corriente; ana sola (100 de 105) no echa a bea (hoy: la subida ' + (entro ? 'entró en vigor como «ordinary»' : 'no entró') + ' y el cambio de gobierno ' + (despues.puesta?.ev ? 'entró en vigor' : 'no entró') + ')');
});

// ---------- H4 (medio): una época completa, sin «hereda», no pasa por el suelo ----------

test('H4: una época de nacimiento escrita entera (sin «hereda») encoge el suelo y quita una regla del suelo, y carga', {
  todo: 'HALLAZGO H4: cargarEpocaEscrita solo mira el suelo cuando la época hereda; una completa se carga tal cual, con el suelo que quiera (o ninguno). Basta copiar la 0 sin el 6.1 «hereda»',
}, () => {
  const { raiz, registros } = epocaEscritaDe(EPOCA_0_BTML);
  const sin = copia(raiz);
  sin[0] = ['sin suelo'];
  sin[7][9][6] = ['who has a key signs'];
  const quema = EPOCA_0_BTML.reglasConId.find((x) => x.regla[0][0] === "writing burns today's T").id;
  sin[2] = sin[2].filter((x) => x?.ref !== quema);
  assert.throws(() => cargarEpocaEscrita({ raiz: sin, registros }), /suelo/, 'una época de nacimiento no encoge el suelo ni quita «writing burns today\'s T»');
});

// ---------- H5 (bajo): nombres con presión negativa ----------

test('H5: una lista de nombres con una presión negativa («nadie -9») hace que cada nombre solo tenga el cien por cien', {
  todo: 'HALLAZGO H5: el núcleo solo pide que la suma de presiones sea mayor que 0 (presionDeLosNombres); una magnitud negativa baja el divisor de «support» y el apoyo pasa de 1. Hace falta un cambio de gobierno (o el nacimiento) para escribirla, pero la lista engaña: parecen dos nombres y decide uno',
}, async () => {
  let m;
  try {
    m = await mundo({ nombres: ['ana', 'bea', 'nadie -9'] });
  } catch {
    return; // arreglado: la época con una presión negativa no carga
  }
  const r = await m.recorrer('fuera bea', { 7: m.fila79({ 5: ['ana'] }) }, { clase: 'governance' });
  assert.ok(!r.aprobacion?.ev, 'ana sola, uno de dos nombres iguales, no aprueba un cambio de gobierno');
});

// ---------- H6 (bajo): el umbral corriente escrito como texto se salta la comparación de umbrales ----------

test('H6: un cambio de gobierno que escribe 7.9.1 como texto («0.9») deja el umbral corriente por encima del de gobierno', {
  todo: 'HALLAZGO H6: erroresDelSuelo solo compara si 7.9.1 es un número (Number.isFinite); un texto pasa sin comparar. Tampoco mira que 7.9.4 (nivel de gobierno) no quede por debajo de 7.9.3',
}, () => {
  const M = { ref: ID0 };
  const raiz = [['umbral de texto'], M, M, M, M, M, [['x'], ['hereda'], [ID0]], [M, M, M, M, M, M, M, M, M, [M, ['0.9'], [0.6]]]];
  const r = V.comprobarCambio(EPOCA_0_BTML, { raiz, registros: [] }, 'governance');
  assert.ok(r.motivos.length > 0, 'el umbral corriente ha de ser un número y no quedar por encima del de gobierno');
});

// ---------- H7 (medio): el alta de un interlocutor escrita a mano puede declarar una clave ----------

test('H7: la época state: un alta de interlocutor escrita a mano que declara una clave entra, y el interlocutor queda con clave', {
  todo: 'HALLAZGO H7: «an interlocutor is registered once» no mira que el alta no declare clave; la plantilla dice «sin clave no actúa», pero a mano el servicio le da una clave suya y puede firmar en nombre de alguien de fuera',
}, async () => {
  const { eje, ids } = await ejemploNodo();
  const claves = await generarClaves();
  const nombre = 'interlocutor-con-clave';
  const payload = [nombre, [1], ['all announced movements happened'], [[N.servicio], [nombre]], ['register an interlocutor'], ['interlocutor'], [['telegram'], ['ef'.repeat(32)]]];
  const r = await escribirPagando(eje, {
    autor: N.servicio, sobre: ids.altaServicio, en: '1400000000', t: hora(3800),
    movimientos: [pagaElCoste(N.servicio), { token: 'T', escala: 'segundo', cantidad: 1, de: N.servicio, a: nombre }],
    payload, contexto: { claves: { [nombre]: claves.publica } },
  }, CLAVES[N.servicio].privada, { [nombre]: claves.privada }).then((ev) => ({ ev }), (e) => ({ error: e.message }));
  assert.equal(eje.clave(nombre), undefined, 'un interlocutor no tiene clave (hoy: ' + (r.ev ? 'entra con clave' : 'rechazado: ' + r.error) + ')');
});

// ---------- H8 (medio): cualquiera diluye el apoyo de los nombres regalándoles R ----------

test('H8: quien no está en la lista tumba un apoyo unánime dándoles R a los nombres (el P que nace al recibir R entra en su total)', {
  todo: 'HALLAZGO H8: «support of» divide por TODO el P del titular, también el que nace cuando otro le da R («receiving R gives ten P on the root of its issuer»); recibir no pide consentimiento, así que cris (sin nombre) baja de 1 a 0,33 el apoyo de ana y bea y bloquea la aprobación. Pueden volver a apoyar, y cris volver a dar: una carrera que gana quien gasta',
}, async () => {
  const m = await mundo({ nombres: ['ana', 'bea'], invitados: ['bea', 'cris'] });
  const p = await m.proponer('más margen', { 7: [m.marca(), m.marca(), m.marca(), [[900], [7200]]] }, { clase: 'governance' });
  assert.ok((await m.intenta('support a change', { X: p.ev.id }, 'ana')).ev);
  assert.ok((await m.intenta('support a change', { X: p.ev.id }, 'bea')).ev);
  assert.ok((await m.intenta('give own R', { X: m.eje.genesisId, amount: 5 }, 'cris')).ev, 'cris da 5 R suyas a ana');
  assert.ok((await m.intenta('give own R', { X: m.eje.alta('bea').id, amount: 5 }, 'cris')).ev, 'y 5 a bea');
  const e = await m.intenta('enact a change', { X: p.ev.id });
  assert.ok(e.ev, 'el apoyo de los dos nombres con todo su P no lo baja un tercero (hoy: ' + JSON.stringify((e.motivos ?? []).map((x) => x.mensaje ?? x.texto)).slice(0, 160) + ')');
});

// ---------- Lo que el encargo pedía probar por el eje y aguanta ----------

test('aguanta: por el eje, una propuesta retirada no se aprueba ni se pone en vigor (ni con la plantilla ni a mano)', async () => {
  const m = await mundo();
  const p = await m.proponer('más margen', { 7: [m.marca(), m.marca(), m.marca(), [[900], [7200]]] });
  assert.ok(p.ev);
  assert.ok((await m.intenta('support a change', { X: p.ev.id })).ev);
  assert.ok((await m.intenta('withdraw a change', { X: p.ev.id })).ev);
  assert.ok(!(await m.intenta('enact a change', { X: p.ev.id })).ev, 'retirada: no se aprueba');
  const aMano = await escribirPagando(m.eje, { autor: 'ana', sobre: p.ev.id, en: '4000000000', t: m.reloj(), movimientos: [pagaElCoste('ana')], payload: [['a mano'], [[{ ref: p.ev.id }]], ['x'], ['ana'], [V.APROBAR]] }).then(() => 'entra', (e) => e.message);
  assert.match(aMano, /a change is enacted once it is approved/);
  // bea no retira la propuesta de ana.
  const q = await m.proponer('otra', { 7: [m.marca(), m.marca(), m.marca(), [[901], [7200]]] });
  assert.ok(!(await m.intenta('withdraw a change', { X: q.ev.id }, 'bea')).ev);
  assert.equal(m.eje.versiones().length, 1);
});

test('aguanta: reordenar en otro orden (un registro de antes del cambio pasa detrás de su entrada en vigor) lo juzga con la versión nueva y rehace las versiones', async () => {
  const m = await mundo();
  // Las notas las escribe bea en su alta: el apoyo de ana bloquea todo su P, y una nota suya movida cambiaría su P.
  const nota = (titulo) => escribirPagando(m.eje, { autor: 'bea', sobre: m.eje.alta('bea').id, t: m.reloj(), movimientos: [pagaElCoste('bea')], payload: [[titulo], ['x'], ['x'], ['bea'], ['forbidden note']] }).then((ev) => ({ ev }), (e) => ({ error: e.message }));
  const prohibe = [['no forbidden notes'], [0], ['=not ("forbidden note" in ev.4)'], ['ev.3'], ['mint', 'transfer', 'lock', 'release', 'burn'], ['*'], ['revisión'], ['epoch 0'], ['after at most a year ahead'], ['no forbidden notes: no']];
  const antes = await nota('antes');
  assert.ok(antes.ev, antes.error);
  const r = await m.recorrer('prohibir las notas', { 2: [{ ref: idDeRegistro(prohibe) }] }, { registros: [prohibe] });
  assert.ok(r.puesta.ev, JSON.stringify(r.puesta.motivos));
  assert.match((await nota('después')).error, /no forbidden notes/, 'después del cambio, la nota no entra');
  // Otra copia, sincronizada en otro orden: la nota de antes llega detrás de la entrada en vigor (escrita sin red).
  const otro = await Eje.desde(m.eje.orden.map((id) => m.eje.obtener(id)));
  const orden = otro.orden.filter((id) => id !== antes.ev.id);
  const { rechazados } = await otro.reordenar(orden);
  assert.deepEqual(rechazados.map((x) => x.id), [antes.ev.id], 'detrás de la entrada en vigor se juzga con la versión nueva');
  assert.match(rechazados[0].motivo, /no forbidden notes/);
  assert.equal(otro.versiones().length, 2);
  assert.equal(otro.versiones()[1].registro, r.puesta.ev.id);
  assert.equal(otro.versiones()[1].posicion, otro.orden.indexOf(r.puesta.ev.id) + 1, 'rige desde el registro siguiente');
  assert.equal(otro.epocaDe(r.puesta.ev.id), otro.versiones()[0].version, 'quien pone en vigor se juzga con la anterior');
  // Y la copia hasta un punto (antes) da la misma versión que la de la copia entera en ese punto.
  const k = otro.orden.indexOf(r.puesta.ev.id);
  assert.equal(otro.antes(k).versiones().length, 1);
  assert.equal(otro.antes(k + 1).versiones().length, 2);
});
