// El motor de versiones de la época (A23; agram-equipo/DISENO_GOBIERNO_Y_MOTOR.md §6.1, §3.1, §3.4 y §5;
// docs/notas/VERSIONES.md). Un libro con la época 0 real y una época hija de prueba que solo baja el nivel pedido
// (7.9.3 y 7.9.4 a 0, como ejemplos/gobierno.mjs) y añade una regla con un parámetro (7.8.1) para ver qué versión juzga
// cada registro. Todo el recorrido de verdad: proponer, apoyar, aprobar y poner en vigor. Identidades inventadas, ejes de
// demostración en memoria.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { Eje, REGLA_DEL_MOTOR } from '../src/eje.js';
import * as A from '../src/acciones.js';
import * as C from '../src/contrato.js';
import { EPOCA_0_BTML, EPOCAS_POR_ID, cargarEpocaEscrita, epocaEscritaDe, idDeRegistro } from '../src/epocas.js';
import { serializar, restaurar } from '../src/persistencia.js';
import { direccion } from '../src/btml.js';
import { escribirPagando, pagaElCoste } from '../ejemplos/ikisai/coste.mjs';
import { epocaState } from '../datos/epocas/state/generar.mjs';
import * as V from '../src/versiones.js';

const T0 = '2026-11-17T09:00:00Z';
const B = EPOCA_0_BTML.id;
const M = { ref: B };
const copia = (x) => JSON.parse(JSON.stringify(x));

/** Una regla de prueba con un parámetro de la época: un registro «test measure» no pasa de epoch.7.8.1. */
const regla = (condicion = '=not ("test measure" in ev.4) or first (payload(ev)).1 <= first epoch.7.8.1', mensaje = 'a test limit: {first (payload(ev)).1} is above the limit') => [['a test limit'], [0], [condicion], ['ev.3'], ['mint', 'transfer', 'lock', 'release', 'burn'], ['*'], ['prueba del motor de versiones'], ['test epoch'], ['after at most a year ahead'], [mensaje]];
const REGLA = regla();

/** Una plantilla nueva que trae un cambio. */
const PLANTILLA = [['leave a governed note'], [
  [['title'], ['text'], ['any'], ['me'], ['payload'], ['0'], ['prueba del motor'], ['required'], [1], ['the title of the note']],
  [['who'], ['identity'], ['any'], ['me'], ['payload'], ['1'], ['prueba del motor'], ['required'], [2], ['=me', 'who writes']],
  [['actions'], ['text'], ['any'], ['me'], ['payload'], ['2'], ['prueba del motor'], ['required'], [3], ['leave a governed note', 'the action']],
], ['=count it.5 > 0'], [['me'], ['person']], ['write'], ['0'], ['prueba del motor de versiones: una plantilla que llega con un cambio'], ['test epoch'], [6, 30], ['leave a governed note: {me} leaves a governed note on {first it.0}']];

/** Una fila 7.9 de un cambio: la marca en todo, salvo las posiciones dadas ({ 3: [0] }). */
const fila79 = (propias) => Array.from({ length: Math.max(...Object.keys(propias).map(Number)) + 1 }, (_, i) => propias[i] ?? M);
/** El 7 de una raíz: la marca hasta el 7.8 y el 7.9 dado (o solo el 7.8, si no hay 7.9). */
const siete = ({ ocho = M, nueve } = {}) => [M, M, M, M, M, M, M, M, ocho, ...(nueve ? [nueve] : [])];

/** La época del libro: hija de la 0, nivel pedido 0 y la regla de prueba con su parámetro 7.8.1 = 5. */
const EPOCA = Object.freeze({
  raiz: [['motor de prueba'], M, [{ ref: idDeRegistro(REGLA) }], M, M, M, [['época hija de prueba del motor de versiones: nivel pedido 0 y una regla con un parámetro'], ['hereda'], [B]], siete({ ocho: [M, [5]], nueve: fila79({ 3: [0], 4: [0] }) })],
  registros: [REGLA],
});

/** La raíz de un cambio sobre la época del libro: la marca en todo salvo `propias` ({ 2: …, 7: …, 9: … }). */
function raizDeCambio(eje, titulo, propias) {
  const id = eje.epoca().id;
  const m = { ref: id };
  const n = Math.max(6, ...Object.keys(propias).map(Number)) + 1;
  return Array.from({ length: n }, (_, i) => (i === 0 ? [titulo] : propias[i] ?? (i === 6 ? [['propuesto en la prueba'], ['hereda'], [id]] : m)));
}

async function libro() {
  let s = 0;
  const eje = await Eje.genesis({ identidad: 'ana', foco: ['el libro de ana'], t: T0, demostracion: true, epoca: EPOCA });
  const t = () => new Date(Date.parse(T0) + (++s) * 60_000).toISOString().replace('.000Z', 'Z');
  /** Lanza una plantilla y la añade: { ev } o { motivos } (los del eje si la plantilla da evento). */
  const intenta = async (cual, params, yo = 'ana') => {
    const r = await A.transaccion(eje, cual, params, yo, { t: t() });
    if (!r.evento) return { motivos: r.motivos };
    try {
      return { ev: await eje.anadir(r.evento) };
    } catch (e) {
      return { motivos: e.motivos ?? [{ texto: e.message }], error: e };
    }
  };
  const lanza = async (cual, params, yo) => {
    const r = await intenta(cual, params, yo);
    assert.ok(r.ev, cual + ': ' + JSON.stringify(r.motivos));
    return r.ev;
  };
  const proponer = (titulo, propias, { clase = 'ordinary', registros } = {}) => intenta('propose a change', { X: eje.genesisId, title: titulo, explanation: 'prueba', change: raizDeCambio(eje, titulo, propias), ...(registros ? { records: registros } : {}), class: clase });
  /** Propone, apoya y aprueba: { propuesta, aprobacion }. Aprobada, ana retira su apoyo (ya no cambia nada) para apoyar la siguiente. */
  const aprobar = async (titulo, propias, opciones) => {
    const p = await proponer(titulo, propias, opciones);
    assert.ok(p.ev, 'propuesta: ' + JSON.stringify(p.motivos));
    await lanza('support a change', { X: p.ev.id });
    const aprobacion = await lanza('enact a change', { X: p.ev.id });
    await lanza('withdraw support', { X: p.ev.id });
    return { propuesta: p.ev, aprobacion };
  };
  const poner = (aprobacion) => intenta('put a change in force', { X: aprobacion.id });
  const mide = (n) => escribirPagando(eje, { autor: 'ana', sobre: eje.genesisId, t: t(), movimientos: [pagaElCoste('ana')], payload: [['medida'], [n], ['x'], ['ana'], ['test measure']] }).then((ev) => ({ ev }), (e) => ({ motivos: e.motivos, error: e }));
  return { eje, t, intenta, lanza, proponer, aprobar, poner, mide };
}

const delMotor = (motivos) => (motivos ?? []).filter((m) => m.regla === REGLA_DEL_MOTOR).map((m) => m.texto);

test('versiones: las constantes casan con la época 0 real (plantillas, posiciones, anclas, 7.9)', () => {
  const plantilla = (n) => EPOCA_0_BTML.transacciones.find((x) => x.plantilla[0][0] === n)?.plantilla;
  for (const n of [V.PROPONER, V.APROBAR, V.PONER_EN_VIGOR, V.RETIRAR]) assert.ok(plantilla(n), n);
  const donde = (n, etiqueta) => plantilla(n)[1].find((q) => q[0][0] === etiqueta)[5][0];
  assert.deepEqual([donde(V.PROPONER, 'change'), donde(V.PROPONER, 'records'), donde(V.PROPONER, 'class'), donde(V.PROPONER, 'actions')], [V.CAMBIO_EN.join('.'), V.REGISTROS_EN.join('.'), V.CLASE_EN.join('.'), String(V.ACCION_EN)]);
  for (const n of [V.APROBAR, V.PONER_EN_VIGOR, V.RETIRAR]) assert.equal(donde(n, 'actions'), String(V.ACCION_EN));
  assert.equal(direccion(plantilla(V.PROPONER)[5][0].split('.').map(Number)), V.ANCLA_DE_PROPUESTAS);
  const r = EPOCA_0_BTML.registro;
  assert.equal(r[7][9][0][0], 'governance');
  assert.ok(r[7][9][2][0] > r[7][9][1][0]);
  assert.deepEqual(r[7][9][5], [0]);
  const suelo = V.sueloDe(EPOCA_0_BTML);
  // 17 reglas del suelo de VG, las 9 del mecanismo del gobierno (anexo de los arreglos, I), las 2 reglas y la plantilla de
  // la salida con lo propio (VG 17-11), las 12 reglas y las 6 plantillas del puente (encargo «el puente, segunda vuelta» y sus arreglos) y 3 posiciones.
  assert.equal(suelo.length, 50);
  assert.deepEqual(suelo.slice(-3), ['epoch.7.0', 'epoch.1.3.1', 'epoch.7.2']);
  const reglas = new Set(EPOCA_0_BTML.reglasConId.map((x) => x.regla[0][0]));
  for (const s of suelo.slice(0, 28)) assert.ok(reglas.has(s), s);
  assert.equal(suelo[28], 'declare a balance', 'la plantilla de la declaración de saldo');
  assert.ok(EPOCA_0_BTML.transacciones.some((x) => x.plantilla[0][0] === suelo[28]));
  for (const n of ['approved', 'support', 'support of', 'a change is enacted once it is approved', 'a change comes into force with its proof', 'a support is true at its point']) assert.ok(suelo.includes(n), n);
  const piezas = V.piezasDeGobiernoDe(EPOCA_0_BTML);
  for (const n of ['epoch.7.9', 'epoch.8.9', 'approved', 'support of', 'support', V.PROPONER, V.APROBAR, V.PONER_EN_VIGOR, V.RETIRAR]) assert.ok(piezas.includes(n), n);
  assert.equal(V.presionDeLosNombres(EPOCA_0_BTML), 9, 'sin nombres cuenta el dueño, con la presión máxima');
  assert.deepEqual(V.erroresDelSuelo(EPOCA_0_BTML, EPOCA_0_BTML, { clase: 'ordinary' }), []);
});

test('versiones: un cambio que mueve un parámetro entra en vigor; el registro siguiente se juzga con el valor nuevo y el anterior con el viejo', async () => {
  const L = await libro();
  const { eje } = L;
  const nacimiento = eje.epoca();
  const id = nacimiento.id;
  const viejo = await L.mide(4);
  assert.ok(viejo.ev);
  assert.match((await L.mide(7)).error.message, /a test limit: 7 is above the limit/);
  const { propuesta, aprobacion } = await L.aprobar('subir el límite', { 7: siete({ ocho: [M, [10]] }) });
  assert.equal(eje.epoca(), nacimiento, 'aprobar no cambia nada');
  const puesta = await L.poner(aprobacion);
  assert.ok(puesta.ev, JSON.stringify(puesta.motivos));
  assert.notEqual(eje.epoca(), nacimiento);
  assert.equal(eje.epoca().id, id, 'el id de la época no cambia');
  assert.equal(eje.epoca().nombre, nacimiento.nombre, 'ni su nombre');
  assert.deepEqual(eje.epoca().registro[7][8][1], [10]);
  const nuevo = await L.mide(7);
  assert.ok(nuevo.ev, 'el siguiente se juzga con el 10');
  assert.match((await L.mide(12)).error.message, /12 is above the limit/);
  // epocaDe: cada registro con la versión con la que entró; el que pone en vigor, con la anterior.
  assert.equal(eje.epocaDe(viejo.ev.id), nacimiento);
  assert.equal(eje.epocaDe(puesta.ev.id), nacimiento);
  assert.equal(eje.epocaDe(nuevo.ev.id), eje.epoca());
  assert.equal(eje.epocaDe(eje.genesisId), nacimiento);
  assert.equal(eje.epocaDe('no está'), null);
  // versiones(): qué registro abrió cada una y desde qué registro rige.
  const v = eje.versiones();
  assert.equal(v.length, 2);
  assert.deepEqual(v.map((x) => [x.numero, x.epoca, x.registro, x.propuesta]), [[0, id, null, null], [1, id, puesta.ev.id, propuesta.id]]);
  assert.equal(v[1].nombre, id + '/' + puesta.ev.id);
  assert.equal(v[1].desde, nuevo.ev.id);
  assert.equal(v[1].posicion, eje.orden.indexOf(puesta.ev.id) + 1);
  assert.equal(v[0].desde, eje.genesisId);
  assert.equal(v[1].version, eje.epoca());
  // El eje de antes del registro que pone en vigor está en la versión de nacimiento; el de después, en la nueva.
  const k = eje.orden.indexOf(puesta.ev.id);
  assert.deepEqual(eje.antes(k).epoca().registro[7][8][1], [5]);
  assert.deepEqual(eje.antes(k + 1).epoca().registro[7][8][1], [10]);
  assert.equal(eje.antes(k).versiones().length, 1);
  assert.equal(eje.antes(k + 1).versiones().length, 2);
});

test('versiones: restaurar, reordenar y copiar hasta un punto rehacen las mismas versiones', async () => {
  const L = await libro();
  const { eje } = L;
  const { aprobacion } = await L.aprobar('subir el límite', { 7: siete({ ocho: [M, [10]] }) });
  await L.poner(aprobacion);
  const nota = await L.aprobar('una plantilla nueva', { 9: [M, M, M, M, M, M, [M, [{ ref: idDeRegistro(PLANTILLA) }]]] }, { registros: [PLANTILLA] });
  await L.poner(nota.aprobacion);
  assert.ok((await L.mide(9)).ev);
  const firma = (e) => e.versiones().map((x) => [x.nombre, x.posicion, x.desde, JSON.stringify(x.version.registro)]);
  assert.equal(eje.versiones().length, 3);
  const restaurado = await restaurar(serializar(eje));
  assert.deepEqual(firma(restaurado), firma(eje));
  const desde = await Eje.desde(eje.orden.map((id) => eje.obtener(id)));
  assert.deepEqual(firma(desde), firma(eje));
  const otro = await Eje.desde(eje.orden.map((id) => eje.obtener(id)));
  const { rechazados } = await otro.reordenar([...eje.orden]);
  assert.deepEqual(rechazados, []);
  assert.deepEqual(firma(otro), firma(eje));
  assert.deepEqual(firma(eje.antes(eje.orden.length)), firma(eje));
  // Restaurar da la misma versión cargada (fundir es una lectura con memoria): las mismas plantillas y reglas.
  assert.deepEqual(restaurado.epoca().transacciones.map((x) => x.id), eje.epoca().transacciones.map((x) => x.id));
});

test('versiones: dos cambios aprobados a la vez se componen en el orden en que entran en vigor; un cambio trae sus registros', async () => {
  const L = await libro();
  const { eje } = L;
  const a = await L.aprobar('subir el límite', { 7: siete({ ocho: [M, [10]] }) });
  const b = await L.aprobar('una plantilla nueva', { 9: [M, M, M, M, M, M, [M, [{ ref: idDeRegistro(PLANTILLA) }]]] }, { registros: [PLANTILLA] });
  assert.ok((await L.poner(b.aprobacion)).ev);
  assert.ok((await L.poner(a.aprobacion)).ev);
  const e = eje.epoca();
  assert.deepEqual(e.registro[7][8][1], [10]);
  assert.ok(e.transacciones.some((x) => x.plantilla[0][0] === 'leave a governed note'));
  assert.equal(eje.versiones()[1].propuesta, b.propuesta.id);
  assert.equal(eje.versiones()[2].propuesta, a.propuesta.id);
});

test('versiones: el segundo cambio que ya no encaja se rechaza al ponerlo en vigor (el suelo, y la clase)', async () => {
  const L = await libro();
  const { eje } = L;
  // Umbrales: a baja el de gobierno a 0.55; b sube el corriente a 0.6. Cada uno vale solo; juntos, el alto queda por debajo.
  const a = await L.aprobar('umbral alto más bajo', { 7: siete({ nueve: fila79({ 2: [0.55] }) }) }, { clase: 'governance' });
  const b = await L.aprobar('umbral corriente más alto', { 7: siete({ nueve: fila79({ 1: [0.6] }) }) }, { clase: 'governance' });
  assert.ok((await L.poner(a.aprobacion)).ev);
  const r = await L.poner(b.aprobacion);
  assert.ok(!r.ev);
  assert.match(delMotor(r.motivos).join(' '), /en este punto, sobre la versión vigente: el cambio deja el umbral de un cambio de gobierno \(epoch\.7\.9\.2, 0\.55\) por debajo del de un cambio corriente \(epoch\.7\.9\.1, 0\.6\)/);
  assert.equal(eje.versiones().length, 2);
  // Clase: c hace de epoch.7.8 (el parámetro de la regla de prueba) una pieza de gobierno; d, corriente, lo cambia: valía al
  // proponerla, ya no. (Sustituir la regla misma ya pide «governance» al proponer: arreglos de la revisión, H2.)
  const piezas = [...V.piezasEscritasDe(eje.epoca()), 'epoch.7.8'];
  const c = await L.aprobar('el parámetro de prueba es de gobierno', { 7: siete({ nueve: fila79({ 7: piezas }) }) }, { clase: 'governance' });
  const d = await L.aprobar('subir el límite', { 7: siete({ ocho: [M, [10]] }) });
  assert.ok((await L.poner(c.aprobacion)).ev);
  const r2 = await L.poner(d.aprobacion);
  assert.match(delMotor(r2.motivos).join(' '), /toca «epoch\.7\.8», que es una pieza de gobierno \(epoch\.7\.9\.7\), y se declara «ordinary»/);
});

test('versiones: al proponer, el núcleo rechaza lo que toca el suelo, la clase que se queda corta y los nombres sin presión', async () => {
  const L = await libro();
  const { eje } = L;
  const coste = EPOCA_0_BTML.reglasConId.find((x) => x.regla[0][0] === 'the cost of writing').regla;
  const otraCoste = copia(coste);
  otraCoste[6] = ['una nota distinta: es otra regla con el mismo nombre'];
  const casos = [
    [await L.proponer('otro coste', { 2: [{ ref: idDeRegistro(otraCoste) }] }, { registros: [otraCoste] }), /sustituye «the cost of writing», que es del suelo/],
    [await L.proponer('otras escalas informativas', { 7: [M, M, [9]] }), /cambia la posición epoch\.7\.2 de la época, que es del suelo/],
    [await L.proponer('nombrar a bea', { 7: siete({ nueve: fila79({ 5: ['ana', 'bea'] }) }) }), /toca «epoch\.7\.9», que es una pieza de gobierno \(epoch\.7\.9\.7\), y se declara «ordinary»/],
    [await L.proponer('nadie pesa', { 7: siete({ nueve: fila79({ 5: ['nadie 0'] }) }) }, { clase: 'governance' }), /deja en quién cuenta \(epoch\.7\.9\.5\) nombres cuyas presiones suman 0/],
    [await L.proponer('encoger el suelo', { 7: siete({ nueve: fila79({ 6: V.sueloDe(eje.epoca()).slice(1) }) }) }, { clase: 'governance' }), /quita del suelo \(epoch\.7\.9\.6\) «nobody moves tokens of others»: el suelo se amplía, nunca se encoge/],
    [await L.proponer('sin herencia', { 6: [['x'], ['hereda'], ['ab'.repeat(32)]] }), /el cambio no hereda de la época de este libro|no tiene forma de época hija/],
  ];
  for (const [r, re] of casos) {
    assert.ok(!r.ev, String(re));
    assert.match(delMotor(r.motivos).join(' '), re);
  }
  assert.equal(eje.versiones().length, 1);
});

test('versiones: un cambio de gobierno que amplía el suelo pasa, y lo nuevo queda guardado', async () => {
  const L = await libro();
  const { eje } = L;
  const mas = await L.aprobar('ampliar el suelo', { 7: siete({ nueve: fila79({ 6: [...V.sueloDe(eje.epoca()), 'a test limit'] }) }) }, { clase: 'governance' });
  assert.ok((await L.poner(mas.aprobacion)).ev);
  assert.ok(V.sueloDe(eje.epoca()).includes('a test limit'));
  const otra = regla(undefined, 'a test limit: otro mensaje {first (payload(ev)).1}');
  const r = await L.proponer('cambiar la regla del suelo', { 2: [{ ref: idDeRegistro(otra) }] }, { registros: [otra], clase: 'governance' });
  assert.match(delMotor(r.motivos).join(' '), /sustituye «a test limit», que es del suelo/);
});

test('versiones: un cambio que añade una plantilla la deja usable desde el registro siguiente; uno que sustituye una regla hace que rija la nueva', async () => {
  const L = await libro();
  const { eje } = L;
  const nota = await L.aprobar('una plantilla nueva', { 9: [M, M, M, M, M, M, [M, [{ ref: idDeRegistro(PLANTILLA) }]]] }, { registros: [PLANTILLA] });
  const ofrece = (opciones) => A.acciones(eje, eje.genesisId, 6, 'ana', opciones).some((a) => a.nombre === 'leave a governed note');
  assert.equal(ofrece(), false);
  assert.ok(!(await L.intenta('leave a governed note', { X: eje.genesisId, title: 'antes' })).ev, 'antes no existe');
  const puesta = await L.poner(nota.aprobacion);
  assert.equal(ofrece(), true);
  assert.equal(ofrece({ epoca: eje.epocaDe(puesta.ev.id) }), false, 'la versión anterior no la sirve');
  const escrita = await L.intenta('leave a governed note', { X: eje.genesisId, title: 'después' });
  assert.ok(escrita.ev, JSON.stringify(escrita.motivos));
  // Sustituir la regla de prueba (no es del suelo ni de gobierno): rige la nueva desde el registro siguiente.
  assert.ok((await L.mide(4)).ev);
  const estricta = regla('=not ("test measure" in ev.4) or first (payload(ev)).1 <= 3', 'a test limit: {first (payload(ev)).1} is above three');
  // Una condición sustituida es de clase «governance» (arreglos de la revisión, H2): el dueño solo cuenta, con los dos tercios.
  const s = await L.aprobar('una regla más estricta', { 2: [{ ref: idDeRegistro(estricta) }] }, { registros: [estricta], clase: 'governance' });
  assert.ok((await L.poner(s.aprobacion)).ev);
  assert.match((await L.mide(4)).error.message, /a test limit: 4 is above three/);
  assert.ok((await L.mide(3)).ev);
});

test('versiones: una caché no sirve el texto ni la plantilla de otra versión', async () => {
  const L = await libro();
  const { eje } = L;
  const antes = eje.versiones()[0].version;
  const otra = regla(undefined, 'a test limit: {first (payload(ev)).1} is not allowed');
  const s = await L.aprobar('otro mensaje', { 2: [{ ref: idDeRegistro(otra) }] }, { registros: [otra], clase: 'governance' });
  const mensaje = (epoca) => C.mensaje(eje, 'a test limit', 'en', epoca ? { epoca } : {});
  const viejo = mensaje();
  await L.poner(s.aprobacion);
  const nuevo = mensaje();
  assert.notEqual(nuevo, viejo);
  assert.match(nuevo, /is not allowed/);
  assert.equal(mensaje(antes), viejo, 'la versión anterior, su texto');
  assert.equal(mensaje(), nuevo, 'y la vigente otra vez, el suyo');
  assert.equal(mensaje(antes), viejo);
});

test('versiones: «put a change in force» sin la plantilla en la época vigente no cambia nada', async () => {
  // La 0 escrita entera en el libro, sin la plantilla «put a change in force» y con nivel pedido 0.
  const { raiz, registros } = epocaEscritaDe(EPOCA_0_BTML);
  const poner = EPOCA_0_BTML.transacciones.find((x) => x.plantilla[0][0] === V.PONER_EN_VIGOR).id;
  const sin = copia(raiz);
  sin[9][6][1] = sin[9][6][1].filter((x) => x.ref !== poner);
  sin[7][9][3] = [0];
  sin[7][9][4] = [0];
  const otra = { raiz: sin, registros: registros.filter((r) => idDeRegistro(r) !== poner) };
  const eje = await Eje.genesis({ identidad: 'ana', foco: ['ana'], t: T0, demostracion: true, epoca: otra });
  assert.equal(V.traePlantilla(eje.epoca(), V.PONER_EN_VIGOR), false);
  let s = 0;
  const t = () => new Date(Date.parse(T0) + (++s) * 60_000).toISOString().replace('.000Z', 'Z');
  const lanza = async (cual, params) => {
    const r = await A.transaccion(eje, cual, params, 'ana', { t: t() });
    assert.ok(r.evento, cual + JSON.stringify(r.motivos));
    return eje.anadir(r.evento);
  };
  const id = eje.epoca().id;
  const m = { ref: id };
  const p = await lanza('propose a change', { X: eje.genesisId, title: 'nada', explanation: 'x', change: [['nada'], m, m, m, m, m, [['x'], ['hereda'], [id]], [m, m, m, [[900], [7200]]]], class: 'ordinary' });
  await lanza('support a change', { X: p.id });
  const ap = await lanza('enact a change', { X: p.id });
  const antes = eje.epoca();
  const r = await escribirPagando(eje, { autor: 'ana', sobre: ap.id, en: '6000000000', t: t(), movimientos: [pagaElCoste('ana')], payload: [['en vigor'], [[{ ref: ap.id }]], ['x'], ['ana'], [V.PONER_EN_VIGOR]] });
  assert.ok(r.id, 'entra como un registro cualquiera');
  assert.equal(eje.epoca(), antes);
  assert.equal(eje.versiones().length, 1);
});

test('versiones: una cadena de «sobre» que no es la buena se rechaza; poner en vigor dos veces no funde dos veces; una propuesta retirada no entra', async () => {
  const L = await libro();
  const { eje } = L;
  const { propuesta, aprobacion } = await L.aprobar('subir el límite', { 7: siete({ nueve: undefined, ocho: [M, [10]] }) });
  // Sobre la propuesta, y no sobre su «enact a change».
  const mal = await escribirPagando(eje, { autor: 'ana', sobre: propuesta.id, en: '6000000000', t: L.t(), movimientos: [pagaElCoste('ana')], payload: [['en vigor'], [[{ ref: propuesta.id }]], ['x'], ['ana'], [V.PONER_EN_VIGOR]] }).catch((e) => e);
  assert.match(delMotor(mal.motivos).join(' '), /«put a change in force» va sobre un «enact a change», y el registro sobre el que se escribe no lo es/);
  assert.ok((await L.poner(aprobacion)).ev);
  // Otra vez sobre la misma aprobación: lo dice la regla de la época y, por su cuenta, el núcleo.
  const otra = await escribirPagando(eje, { autor: 'ana', sobre: aprobacion.id, en: '6000000000', t: L.t(), movimientos: [pagaElCoste('ana')], payload: [['otra vez'], [[{ ref: aprobacion.id }]], ['x'], ['ana'], [V.PONER_EN_VIGOR]] }).catch((e) => e);
  assert.match(delMotor(otra.motivos).join(' '), /ya está en vigor desde el registro [0-9a-f]{8}: un cambio entra en vigor una sola vez/);
  assert.equal(eje.versiones().length, 2);
  // El núcleo por su cuenta, sin las reglas de la época: la entrada en vigor mira lo que ya está en vigor y lo retirado.
  const ev = { id: 'x', sobre: aprobacion.id, payload: [['x'], ['x'], ['x'], ['ana'], [V.PONER_EN_VIGOR]] };
  const libroDe = (enVigor, hijos = []) => ({ obtener: (id) => eje.obtener(id), sobre: (id) => (id === propuesta.id ? hijos : eje.sobre(id)), genesisId: eje.genesisId, enVigor });
  const base = eje.versiones()[0].version;
  assert.deepEqual(V.entradaEnVigor(libroDe(new Map()), base, ev).motivos, []);
  assert.match(V.entradaEnVigor(libroDe(new Map([[propuesta.id, 'f'.repeat(64)]])), base, ev).motivos[0], /ya está en vigor/);
  const retirada = { id: 'e'.repeat(64), autor: propuesta.autor, payload: [['x'], ['x'], ['x'], ['ana'], [V.RETIRAR]] };
  assert.match(V.entradaEnVigor(libroDe(new Map(), [retirada]), base, ev).motivos[0], /se retiró \(registro eeeeeeee\): no entra en vigor/);
  assert.equal(V.entradaEnVigor(libroDe(new Map()), base, { ...ev, payload: [['x']] }), null, 'un registro que no lo dice: nada');
});

test('versiones: el suelo al cargar una época hija de nacimiento; la state y la SIP de StateArk lo respetan', () => {
  const coste = EPOCA_0_BTML.reglasConId.find((x) => x.regla[0][0] === 'the cost of writing').regla;
  const otraCoste = copia(coste);
  otraCoste[6] = ['otra regla con el mismo nombre'];
  const hija = (siete_, dos, registros = []) => ({ raiz: [['hija'], M, dos ?? M, M, M, M, [['x'], ['hereda'], [B]], ...(siete_ ? [siete_] : [])], registros });
  assert.throws(() => cargarEpocaEscrita(hija(null, [{ ref: idDeRegistro(otraCoste) }], [otraCoste])), /no respeta el suelo de la época de la que hereda: sustituye «the cost of writing»/);
  assert.throws(() => cargarEpocaEscrita(hija(siete({ nueve: fila79({ 6: ['who has a key signs'] }) }))), /quita del suelo/);
  const amplia = cargarEpocaEscrita(hija(siete({ nueve: fila79({ 6: [...V.sueloDe(EPOCA_0_BTML), 'a test limit'] }) })));
  assert.ok(V.sueloDe(amplia).includes('a test limit'), 'ampliar sí');
  // Nacimiento: una hija puede tocar piezas de gobierno (no hay clase), como la de prueba de este archivo.
  assert.ok(cargarEpocaEscrita(EPOCA));
  // La state y la SIP 0 de StateArk (solo lectura), contra la 7.9.6 real.
  const st = epocaState();
  assert.deepEqual(V.erroresDelSuelo(EPOCA_0_BTML, cargarEpocaEscrita(st.escrita ?? st)), []);
  const D = 'C:/Users/acer/Documents/InTheState/stateark/sip/';
  if (existsSync(D + 'sip-0.btml.json')) {
    const leer = (c) => readdirSync(D + c).filter((f) => f.endsWith('.json')).sort().map((f) => JSON.parse(readFileSync(D + c + '/' + f, 'utf8')));
    const sip = cargarEpocaEscrita({ raiz: JSON.parse(readFileSync(D + 'sip-0.btml.json', 'utf8')), registros: [...leer('reglas'), ...leer('plantillas')] });
    assert.equal(EPOCAS_POR_ID.get(sip.hereda), EPOCA_0_BTML);
    assert.deepEqual(V.erroresDelSuelo(EPOCA_0_BTML, sip), []);
  }
});
