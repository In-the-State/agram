// Padres y copias (VG 16-11, state/ANCLAJE_EN_CASCADA.md §7, puntos 3, 4, 5 y 7; Core State, REPLANTEO_CASCADA «Resuelto
// sin VG»; encargo «padres y copias», A19, N1 y N2; docs/notas/PADRES.md). Lo que se comprueba:
//   1. sin padres; un padre en la raíz que heredan todos; un elemento con su propia configuración que tapa la de arriba;
//   2. dos padres (la forma exacta del registro) y quitar uno; quitar el último vuelve a heredar;
//   3. la configuración de quien no puede se rechaza (regla «only the owner sets who keeps it») y no se ofrece;
//   4. la clase del dueño y su plazo (su propia herencia; sin ninguna, la del plazo más largo de 7.5);
//   5. quienGuarda con y sin nodo;
//   6. el bloque «quién guarda esto» del reverso y la línea de antes de firmar;
//   7. «puede leer» y la operación que enlaza dos elementos (VG 17-11, V11 y V7; encargo «puede leer»): los defectos de la
//      época (epoch.7.7), el dato de cada padre, el defecto de un elemento, las ramas de un registro que enlaza, el mismo
//      padre por dos ramas (lee por rama, no se funde), quién configura, otra época con otras bases, el bloque y la línea.
//   8. qué es una rama (algún padre vivo o un «parent reads» propio; padresDe; lee desde la rama) y ramasDelLibro, con la
//      lista por padre de «este libro» (Core, 17-11).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Eje } from '../src/eje.js';
import * as A from '../src/acciones.js';
import * as C from '../src/contrato.js';
import { arbol, preferencias } from '../carta/carta.js';
import { html } from '../carta/dom.js';
import { entrarPorInvitacion } from '../ejemplos/ikisai/altas.mjs';
import { pagaElCoste } from './ayudas-coste.js';
import { EPOCA_0_BTML, cargarEpocaBtml } from '../src/epocas.js';
import { EPOCA_0_BTML_DATOS, REGLAS_DE_EPOCA_DATOS, PLANTILLAS_DE_EPOCA_DATOS } from '../datos/epocas/epocas.js';

const T0 = '2026-11-16T10:00:00Z';
const ORDENADOR = { ancho: 1366, alto: 900 };
const ES = { idioma: 'es' };
// Claves y direcciones inventadas (nada real ni secreto).
const K1 = '11'.repeat(32);
const K2 = '22'.repeat(32);
const K3 = '33'.repeat(32);
const reglas = (r) => r.motivos.map((m) => m.regla);
const nombres = (c) => c.padres.map((p) => p.nombre);

/** ana (génesis) con bea invitada; ana escribe «empresa» en la raíz y «proyecto» en la empresa; bea, «tarea» en el proyecto. */
async function mundo() {
  const eje = await Eje.genesis({ demostracion: true, identidad: 'ana', t: T0, foco: ['ana'], emision: [{ token: 'R', cantidad: 10 }] });
  await entrarPorInvitacion(eje, { por: 'ana', quien: 'bea', t: T0 });
  const lanzar = async (nombre, X, parametros, yo = 'ana') => {
    const r = await A.transaccion(eje, nombre, { X, ...parametros }, yo, { t: T0 });
    assert.ok(r.ok, nombre + ': ' + JSON.stringify(r.motivos));
    return eje.anadir(r.evento);
  };
  const raiz = eje.genesisId;
  const empresa = await lanzar('anchor here', raiz, { title: 'empresa', content: 'lo del trabajo' });
  const proyecto = await lanzar('anchor here', empresa.id, { title: 'proyecto', content: 'un proyecto' });
  const tarea = await lanzar('anchor here', proyecto.id, { title: 'tarea', content: 'una tarea' }, 'bea');
  return { eje, raiz, empresa, proyecto, tarea, lanzar };
}

// ---------- 1. la herencia ----------

test('sin padres: nadie más lo guarda; de null, sin heredar; la clase por defecto es la del plazo más largo de 7.5 (person, el año)', async () => {
  const { eje, raiz, tarea } = await mundo();
  for (const id of [raiz, tarea.id]) {
    assert.deepEqual(C.custodia(eje, id), { de: null, padresDe: null, heredado: false, padres: [], clase: 'person', plazo: { escala: 6, segundos: 31536000 }, enlaza: [], ramas: [], todos: [] });
  }
  assert.equal(C.custodia(eje, 'f'.repeat(64)), null, 'un id que no está en el eje');
  assert.deepEqual(C.quienGuarda(eje, 'ana', tarea.id), { nodo: null, padres: [], de: null, enlazadas: 0, todos: [] });
});

test('un padre en la raíz lo heredan todos: de = la raíz y heredado en lo de abajo; el registro tapa la configuración de arriba en su rama', async () => {
  const { eje, raiz, empresa, proyecto, tarea, lanzar } = await mundo();
  const casa = await lanzar('add a parent', raiz, { name: 'casa', does: 'keeps', key: K1 });
  assert.deepEqual([casa.sobre, casa.en], [raiz, '9000000000'], 'ancla en el 9 del registro sobre el que se lanza');
  const padreCasa = { id: casa.id, nombre: 'casa', clave: K1, guarda: true, sella: false, nivel: null, grado: null, url: null, lee: true, leeDe: 'epoca' };
  assert.deepEqual(C.custodia(eje, raiz), { de: raiz, padresDe: raiz, heredado: false, padres: [padreCasa], clase: 'person', plazo: { escala: 6, segundos: 31536000 }, enlaza: [], ramas: [{ de: raiz, padresDe: raiz, por: raiz, padres: [padreCasa] }], todos: [{ clave: K1, nombre: 'casa', url: null, guarda: true, sella: false, en: [raiz], leeEn: [raiz] }] });
  for (const x of [empresa, proyecto, tarea]) {
    const c = C.custodia(eje, x.id);
    assert.deepEqual([c.de, c.heredado, nombres(c)], [raiz, true, ['casa']], x.payload[0][0]);
  }
  // La empresa pone el suyo: tapa el de la raíz en su rama (no se suman); la raíz sigue con el suyo.
  const trabajo = await lanzar('add a parent', empresa.id, { name: 'trabajo', does: 'keeps and seals', key: K2, level: 3 });
  assert.deepEqual([C.custodia(eje, empresa.id).de, C.custodia(eje, empresa.id).heredado, nombres(C.custodia(eje, empresa.id))], [empresa.id, false, ['trabajo']]);
  for (const x of [proyecto, tarea]) assert.deepEqual([C.custodia(eje, x.id).de, nombres(C.custodia(eje, x.id))], [empresa.id, ['trabajo']]);
  assert.deepEqual(nombres(C.custodia(eje, raiz)), ['casa']);
  // Lo que cuelga del 9 (la propia configuración) es de la rama del elemento.
  assert.equal(C.custodia(eje, trabajo.id).de, empresa.id);
});

// ---------- 2. dos padres, la forma del registro, quitar ----------

test('dos padres: cada uno con su registro (0 nombre; 1.0.0 qué hace, 1.0.1 si lee, 1.1 nivel; 2.0 clave, 2.1 grado; 3.0 quién, 3.1 dirección; 4 la acción), sin huecos falte lo que falte', async () => {
  const { eje, raiz, lanzar } = await mundo();
  const casa = await lanzar('add a parent', raiz, { name: 'casa', does: 'keeps', key: K1 });
  const uni = await lanzar('add a parent', raiz, { name: 'universidad', does: 'seals', key: K2, level: 3, grade: '1', url: 'https://padre.ejemplo.org' });
  const solo = await lanzar('add a parent', raiz, { name: 'solo dirección', does: 'keeps and seals', key: K3, url: 'http://127.0.0.1:9' });
  assert.deepEqual(casa.payload, [['casa'], [[['keeps']]], [[K1]], [['ana']], ['add a parent']]);
  assert.deepEqual(uni.payload, [['universidad'], [[['seals']], [3]], [[K2], ['1']], [['ana'], ['https://padre.ejemplo.org']], ['add a parent']]);
  assert.deepEqual(solo.payload, [['solo dirección'], [[['keeps and seals']]], [[K3]], [['ana'], ['http://127.0.0.1:9']], ['add a parent']], 'una dirección sin nivel ni grado: sin huecos');
  // «can read» (encargo «puede leer»): la 1.0.1, sin nivel ni nada más, sin huecos.
  const noLee = await lanzar('add a parent', raiz, { name: 'no lee', does: 'keeps', key: K3, 'can read': 'does not read' });
  assert.deepEqual(noLee.payload, [['no lee'], [[['keeps'], ['does not read']]], [[K3]], [['ana']], ['add a parent']]);
  const c = C.custodia(eje, raiz);
  assert.deepEqual(c.padres.map((p) => [p.nombre, p.guarda, p.sella, p.nivel, p.grado, p.url, p.lee]), [
    ['casa', true, false, null, null, null, true],
    ['universidad', false, true, 3, '1', 'https://padre.ejemplo.org', true],
    ['solo dirección', true, true, null, null, 'http://127.0.0.1:9', true],
    ['no lee', true, false, null, null, null, false],
  ]);
  // Validaciones de la plantilla: qué hace, la clave x-only en minúsculas y un nivel de la época.
  const mal = await A.transaccion(eje, 'add a parent', { X: raiz, name: 'x', does: 'guarda', key: 'AB'.repeat(32), level: 7, 'can read': 'quizá' }, 'ana', { t: T0 });
  assert.deepEqual(reglas(mal).sort(), ['can read', 'does', 'key', 'level']);
  const corta = await A.transaccion(eje, 'add a parent', { X: raiz, name: 'x', does: 'keeps', key: 'abcd' }, 'ana', { t: T0 });
  assert.deepEqual(reglas(corta), ['key']);
  // Una dirección con credenciales no la impide el BQL mínimo (no lee textos): el contrato no la da.
  await lanzar('add a parent', raiz, { name: 'con credenciales', does: 'keeps', key: K1, url: 'https://usuario:secreto@padre.ejemplo.org' });
  assert.equal(C.custodia(eje, raiz).padres.find((p) => p.nombre === 'con credenciales').url, null);
});

test('quitar un padre: «remove a parent» lo refiere desde el 9 del mismo elemento y deja de salir; quitar el último vuelve a heredar lo de arriba', async () => {
  const { eje, raiz, empresa, proyecto, lanzar } = await mundo();
  await lanzar('add a parent', raiz, { name: 'casa', does: 'keeps', key: K1 });
  const trabajo = await lanzar('add a parent', empresa.id, { name: 'trabajo', does: 'keeps', key: K2 });
  const uni = await lanzar('add a parent', empresa.id, { name: 'universidad', does: 'seals', key: K3 });
  assert.ok(A.acciones(eje, empresa.id, 9, 'ana').some((a) => a.nombre === 'remove a parent'));
  assert.ok(!A.acciones(eje, proyecto.id, 9, 'ana').some((a) => a.nombre === 'remove a parent'), 'sin padres propios no se ofrece');
  // Por defecto, el último padre del elemento.
  const fuera = await lanzar('remove a parent', empresa.id, {});
  assert.deepEqual(fuera.payload[1], [{ ref: uni.id }]);
  assert.deepEqual(fuera.payload.slice(2), [['all announced movements happened'], ['ana'], ['remove a parent']]);
  assert.deepEqual(nombres(C.custodia(eje, proyecto.id)), ['trabajo']);
  // Una retirada colgada de otro elemento no quita un padre de este.
  await lanzar('remove a parent', raiz, { parent: trabajo.id });
  assert.deepEqual(nombres(C.custodia(eje, empresa.id)), ['trabajo']);
  // Quitar el último: la empresa se queda sin configuración propia y hereda la de la raíz.
  await lanzar('remove a parent', empresa.id, { parent: trabajo.id });
  const c = C.custodia(eje, proyecto.id);
  assert.deepEqual([c.de, c.heredado, nombres(c)], [raiz, true, ['casa']]);
  const noEsPadre = await A.transaccion(eje, 'remove a parent', { X: raiz, parent: empresa.id }, 'ana', { t: T0 });
  assert.deepEqual(reglas(noEsPadre), ['parent'], 'el 1 tiene que ser un padre');
});

// ---------- 3. quién puede ----------

test('quién puede: solo quien escribió el elemento o la identidad del génesis; lo de otro se rechaza (regla) y no se ofrece', async () => {
  const { eje, raiz, empresa, tarea, lanzar } = await mundo();
  const ofrece = (X, yo) => A.acciones(eje, X, 9, yo).map((a) => a.nombre).filter((n) => ['add a parent', 'remove a parent', 'set the kind of owner'].includes(n));
  assert.deepEqual(ofrece(raiz, 'ana'), ['add a parent', 'set the kind of owner']);
  assert.deepEqual(ofrece(empresa.id, 'bea'), [], 'bea no escribió la empresa ni el génesis');
  assert.deepEqual(ofrece(tarea.id, 'bea'), ['add a parent', 'set the kind of owner'], 'la tarea la escribió bea');
  assert.deepEqual(ofrece(tarea.id, 'ana'), ['add a parent', 'set the kind of owner'], 'ana escribió el génesis');
  const ajena = await A.transaccion(eje, 'add a parent', { X: empresa.id, name: 'de bea', does: 'keeps', key: K1 }, 'bea', { t: T0 });
  assert.ok(!ajena.ok);
  assert.ok(reglas(ajena).includes('only the owner sets who keeps it'));
  assert.match(ajena.motivos.find((m) => m.regla === 'only the owner sets who keeps it').mensaje, /bea/);
  const clase = await A.transaccion(eje, 'set the kind of owner', { X: empresa.id, kind: 'company' }, 'bea', { t: T0 });
  assert.ok(reglas(clase).includes('only the owner sets who keeps it'));
  // Escrita a mano (sin plantilla), la regla la rechaza igual.
  await assert.rejects(() => eje.escribir({ autor: 'bea', sobre: empresa.id, en: '9000000000', t: T0, payload: [['a mano'], [['keeps']], [[K1]], [['bea']], ['add a parent']], movimientos: [pagaElCoste('bea')] }));
  // La de bea sobre lo suyo vale, y la de ana (génesis) sobre lo de bea también.
  await lanzar('add a parent', tarea.id, { name: 'de bea', does: 'keeps', key: K1 }, 'bea');
  await lanzar('add a parent', tarea.id, { name: 'de ana', does: 'seals', key: K2 }, 'ana');
  assert.deepEqual(nombres(C.custodia(eje, tarea.id)), ['de bea', 'de ana']);
});

// ---------- 4. la clase del dueño ----------

test('la clase del dueño: «set the kind of owner» en el 9; se hereda aparte de los padres, manda la última y da el plazo de 7.5', async () => {
  const { eje, raiz, empresa, proyecto, tarea, lanzar } = await mundo();
  const k = await lanzar('set the kind of owner', raiz, { kind: 'group' });
  assert.deepEqual(k.payload, [['group'], [{ ref: raiz }], ['all announced movements happened'], ['ana'], ['set the kind of owner']]);
  assert.deepEqual([C.custodia(eje, tarea.id).clase, C.custodia(eje, tarea.id).plazo], ['group', { escala: 5, segundos: 2419200 }]);
  await lanzar('set the kind of owner', empresa.id, { kind: 'provider' });
  await lanzar('set the kind of owner', empresa.id, { kind: 'company' });
  assert.deepEqual([C.custodia(eje, proyecto.id).clase, C.custodia(eje, proyecto.id).plazo], ['company', { escala: 4, segundos: 604800 }], 'en un elemento, la última');
  assert.equal(C.custodia(eje, raiz).clase, 'group');
  // Los padres vienen de la raíz y la clase de la empresa: cada uno de su herencia.
  await lanzar('add a parent', raiz, { name: 'casa', does: 'keeps', key: K1 });
  const c = C.custodia(eje, tarea.id);
  assert.deepEqual([c.de, c.clase], [raiz, 'company']);
  const mala = await A.transaccion(eje, 'set the kind of owner', { X: raiz, kind: 'robot' }, 'ana', { t: T0 });
  assert.deepEqual(reglas(mala), ['kind']);
  // El desplegable: las clases de 7.5, por su defecto «=first epoch.7.5.1».
  const p = A.acciones(eje, raiz, 9, 'ana').find((a) => a.nombre === 'set the kind of owner').parametros.find((x) => x.nombre === 'kind');
  assert.equal(p.valor, 'person');
  assert.deepEqual(C.opciones(eje, raiz, null, { yo: 'ana', parametro: A.parametros(A.plantillaDeTransaccion('set the kind of owner')).find((x) => x.nombre === 'kind') }).map((o) => o.valor), ['person', 'group', 'company', 'provider']);
});

// ---------- 5. quienGuarda ----------

test('quienGuarda: sin nodo (el libro no sale de este dispositivo) y con nodo (el nombre de máquina del transporte); los padres del elemento del que colgará', async () => {
  const { eje, raiz, empresa, proyecto, lanzar } = await mundo();
  await lanzar('add a parent', empresa.id, { name: 'trabajo', does: 'keeps', key: K1 });
  await lanzar('add a parent', empresa.id, { name: 'universidad', does: 'keeps and seals', key: K2 });
  assert.deepEqual(C.quienGuarda(eje, 'ana', proyecto.id), { nodo: null, padres: [{ nombre: 'trabajo', guarda: true, sella: false, lee: true }, { nombre: 'universidad', guarda: true, sella: true, lee: true }], de: empresa.id, enlazadas: 0, todos: [{ nombre: 'trabajo', guarda: true, sella: false, lee: true }, { nombre: 'universidad', guarda: true, sella: true, lee: true }] });
  assert.deepEqual(C.quienGuarda(eje, 'ana', raiz), { nodo: null, padres: [], de: null, enlazadas: 0, todos: [] });
  const p = preferencias(eje, 'ana', { 'sync url': 'https://nodo.ejemplo.org:8443', 'sync ledger': 'eje' });
  await eje.escribir({ autor: 'ana', sobre: p.sobre, en: p.en, t: T0, payload: p.payload, movimientos: [pagaElCoste('ana')] });
  assert.deepEqual(C.quienGuarda(eje, 'ana', proyecto.id).nodo, 'nodo.ejemplo.org');
  assert.equal(C.quienGuarda(eje, 'bea', proyecto.id).nodo, null, 'el transporte es el de quien escribe');
});

// ---------- 6. la carta ----------

test('la carta: el bloque «quién guarda esto» del reverso («este libro» en la raíz; heredado de…; el plazo; sin padres; el nodo) y la línea de antes de firmar', async () => {
  const { eje, raiz, empresa, proyecto, lanzar } = await mundo();
  const reverso = async (X, yo = 'ana') => html(await arbol({ foco: { X, pv: 5 } }, eje, yo, ORDENADOR, ES));
  let h = await reverso(raiz);
  assert.match(h, /<div class="custodia" data-padres="0"><h4>este libro<\/h4><p class="custodia-sin">sin padres: nadie más lo guarda ni lo sella<\/p><small class="custodia-plazo">plazo de anclaje por defecto: 1 año \(dueño: persona\)<\/small><\/div>/);
  await lanzar('add a parent', empresa.id, { name: 'trabajo', does: 'keeps', key: K1 });
  await lanzar('add a parent', empresa.id, { name: 'universidad', does: 'keeps and seals', key: K2, level: 4, grade: 'compartido' });
  await lanzar('set the kind of owner', empresa.id, { kind: 'company' });
  h = await reverso(proyecto.id);
  assert.match(h, /<div class="custodia" data-padres="2" data-heredado><h4>quién guarda esto<\/h4>/);
  assert.match(h, /<li class="custodia-padre" data-guarda="1" data-sella="0" data-lee="1"><b>trabajo<\/b> <span>guarda una copia<\/span> <span class="custodia-lee">puede leerlo<\/span> <small class="custodia-lee-de">por defecto de la época<\/small><\/li>/);
  assert.match(h, /<b>universidad<\/b> <span>guarda y sella<\/span> <small>nivel 4 · grado compartido<\/small> <span class="custodia-lee">puede leerlo<\/span>/);
  assert.match(h, /<small class="custodia-heredado">heredado de empresa<\/small>/);
  assert.match(h, /plazo de anclaje por defecto: 1 semana \(dueño: empresa\)/);
  assert.doesNotMatch(h, /custodia-nodo/);
  // La línea de antes de firmar: sin nodo ni padres; con padres; con nodo.
  const linea = async (X, yo = 'ana') => (html(await arbol({ foco: { X, pv: 0 }, formulario: { X, accion: 'anchor here', valores: {} } }, eje, yo, ORDENADOR, ES)).match(/<p class="quien-guarda"[^>]*>([^<]*)<\/p>/) ?? [])[1];
  assert.equal(await linea(raiz), 'Solo lo guardas tú, en este dispositivo');
  assert.equal(await linea(proyecto.id), 'Lo guardarán: tú y 2 padres (trabajo, universidad). Pueden leerlo: trabajo y universidad.');
  const p = preferencias(eje, 'ana', { 'sync url': 'https://nodo.ejemplo.org', 'sync ledger': 'eje' });
  await eje.escribir({ autor: 'ana', sobre: p.sobre, en: p.en, t: T0, payload: p.payload, movimientos: [pagaElCoste('ana')] });
  assert.equal(await linea(proyecto.id), 'Lo guardarán: tú, el nodo nodo.ejemplo.org y 2 padres (trabajo, universidad). Pueden leerlo: el nodo, trabajo y universidad.');
  assert.equal(await linea(raiz), 'Lo guardarán: tú y el nodo nodo.ejemplo.org');
  assert.match(await reverso(proyecto.id), /<small class="custodia-nodo">el nodo que sirve este libro lo ve en claro<\/small>/);
  // La línea va junto al botón, en el pie, y no en el reverso del formulario; una lectura no la lleva.
  const f = html(await arbol({ foco: { X: proyecto.id, pv: 0 }, formulario: { X: proyecto.id, accion: 'anchor here', valores: {} } }, eje, 'ana', ORDENADOR, ES));
  assert.match(f, /<footer><p class="quien-guarda">Lo guardarán: [^<]*<\/p><button type="submit">/);
  const lectura = html(await arbol({ foco: { X: proyecto.id, pv: 9 }, formulario: { X: proyecto.id, accion: 'view the whole tutorial', valores: {} } }, eje, 'ana', ORDENADOR, ES));
  assert.doesNotMatch(lectura, /quien-guarda/);
  // Una plantilla que ancla en otro registro (su 5): la línea es la del elemento del que colgará (aquí, el alta de ana).
  assert.equal(A.sobreDe(eje, 'connect an account', { X: proyecto.id }, 'ana', { t: T0 }), eje.alta('ana').id);
});

// ---------- 7. puede leer y la operación que enlaza dos elementos (VG 17-11, V11 y V7; encargo «puede leer») ----------

const K4 = '44'.repeat(32);
const leen = (padres) => padres.map((p) => [p.nombre, p.lee, p.leeDe]);

/** mundo() más «personal», otro elemento de ana colgado de la raíz: otra rama. */
async function dosRamas() {
  const m = await mundo();
  const personal = await m.lanzar('anchor here', m.raiz, { title: 'personal', content: 'lo de casa' });
  return { ...m, personal };
}

/** La época 0 con otras bases en su 7.7 (una época de prueba: el código no cambia). */
function epocaConBases(bases) {
  const e = JSON.parse(JSON.stringify(EPOCA_0_BTML_DATOS));
  e[7][7][2] = bases;
  return cargarEpocaBtml(e, { registros: REGLAS_DE_EPOCA_DATOS, plantillas: PLANTILLAS_DE_EPOCA_DATOS, id: EPOCA_0_BTML.id });
}

test('las resoluciones de base son un dato de la época: epoch.7.7, «custody defaults» (claves, bases y valores permitidos)', () => {
  assert.equal(EPOCA_0_BTML.registro[7][7][0][0], 'custody defaults');
  assert.deepEqual(EPOCA_0_BTML.registro[7][7].slice(1), [['parent reads', 'linked operation'], ['yes', 'both'], [['yes', 'no'], ['both', 'own']]]);
  assert.deepEqual(C.defectosDeCustodia(), { 'parent reads': { base: 'yes', valores: ['yes', 'no'] }, 'linked operation': { base: 'both', valores: ['both', 'own'] } });
  assert.deepEqual(C.defectosDeCustodia(epocaConBases(['no', 'own'])), { 'parent reads': { base: 'no', valores: ['yes', 'no'] }, 'linked operation': { base: 'own', valores: ['both', 'own'] } });
  assert.deepEqual(C.defectosDeCustodia(epocaConBases(['quizá', 'both']))['parent reads'].base, null, 'una base que no es de los permitidos no vale');
});

test('puede leer, por padre: sin dato, la base de la época; «does not read», no lee; un registro de antes (qué hace en 1.0) sigue valiendo', async () => {
  const { eje, empresa, proyecto, lanzar } = await mundo();
  await lanzar('add a parent', empresa.id, { name: 'trabajo', does: 'keeps', key: K1 });
  await lanzar('add a parent', empresa.id, { name: 'asesoría', does: 'keeps and seals', key: K2, 'can read': 'does not read' });
  await lanzar('add a parent', empresa.id, { name: 'universidad', does: 'seals', key: K3, level: 3, 'can read': 'reads' });
  await eje.escribir({ autor: 'ana', sobre: empresa.id, en: '9000000000', t: T0, payload: [['de antes'], [['keeps'], [2]], [[K4]], [['ana']], ['add a parent']], movimientos: [pagaElCoste('ana')] });
  const c = C.custodia(eje, proyecto.id);
  assert.deepEqual(leen(c.padres), [['trabajo', true, 'epoca'], ['asesoría', false, 'padre'], ['universidad', true, 'padre'], ['de antes', true, 'epoca']]);
  const antes = c.padres.find((p) => p.nombre === 'de antes');
  assert.deepEqual([antes.guarda, antes.sella, antes.nivel], [true, false, 2]);
  assert.deepEqual(c.todos.map((p) => [p.nombre, p.leeEn]), [['trabajo', [empresa.id]], ['asesoría', []], ['universidad', [empresa.id]], ['de antes', [empresa.id]]]);
});

test('el defecto de un elemento («set a custody default», [9, 8], en su 9) se hereda hacia abajo; en un elemento manda el último de cada clave; el dato del padre lo tapa', async () => {
  const { eje, raiz, empresa, proyecto, tarea, lanzar } = await mundo();
  await lanzar('add a parent', raiz, { name: 'casa', does: 'keeps', key: K1 });
  await lanzar('add a parent', raiz, { name: 'notaría', does: 'keeps', key: K2, 'can read': 'reads' });
  const d = await lanzar('set a custody default', empresa.id, { key: 'parent reads', value: 'no' });
  assert.deepEqual([d.sobre, d.en, d.payload], [empresa.id, '9000000000', [['parent reads'], ['no'], ['all announced movements happened'], ['ana'], ['set a custody default']]]);
  assert.deepEqual(leen(C.custodia(eje, raiz).padres), [['casa', true, 'epoca'], ['notaría', true, 'padre']]);
  for (const x of [empresa, proyecto, tarea]) assert.deepEqual(leen(C.custodia(eje, x.id).padres), [['casa', false, 'elemento'], ['notaría', true, 'padre']], x.payload[0][0]);
  await lanzar('set a custody default', empresa.id, { key: 'linked operation', value: 'own' });
  assert.deepEqual(leen(C.custodia(eje, proyecto.id).padres)[0], ['casa', false, 'elemento'], 'otra clave no toca esta');
  await lanzar('set a custody default', proyecto.id, { key: 'parent reads', value: 'yes' });
  assert.deepEqual([leen(C.custodia(eje, tarea.id).padres)[0], leen(C.custodia(eje, empresa.id).padres)[0]], [['casa', true, 'elemento'], ['casa', false, 'elemento']], 'uno más abajo lo tapa en lo suyo');
  await lanzar('set a custody default', empresa.id, { key: 'parent reads', value: 'yes' });
  assert.deepEqual(leen(C.custodia(eje, empresa.id).padres)[0], ['casa', true, 'elemento'], 'en un elemento, el último');
  // Los defectos de la plantilla salen de la época (la primera clave y su base) y el valor se valida contra la época (lookup).
  const p = A.acciones(eje, raiz, 9, 'ana').find((a) => a.nombre === 'set a custody default').parametros;
  assert.deepEqual(p.filter((x) => ['key', 'value'].includes(x.nombre)).map((x) => x.valor), ['parent reads', 'yes']);
  assert.equal((await A.transaccion(eje, 'set a custody default', { X: raiz, key: 'linked operation' }, 'ana', { t: T0 })).evento.payload[1][0], 'both');
  assert.deepEqual(reglas(await A.transaccion(eje, 'set a custody default', { X: raiz, key: 'parent reads', value: 'own' }, 'ana', { t: T0 })), ['value']);
  assert.deepEqual(reglas(await A.transaccion(eje, 'set a custody default', { X: raiz, key: 'who reads', value: 'yes' }, 'ana', { t: T0 })).sort(), ['key', 'value']);
});

test('un registro que enlaza otro elemento va también a los padres de la rama del enlazado (linked operation: both, la base), cada uno con su lee; con own, solo a la suya', async () => {
  const { eje, empresa, proyecto, personal, lanzar } = await dosRamas();
  await lanzar('add a parent', empresa.id, { name: 'trabajo', does: 'keeps', key: K1 });
  await lanzar('add a parent', personal.id, { name: 'familia', does: 'keeps and seals', key: K2, 'can read': 'does not read' });
  const r = await lanzar('reference X from another record', proyecto.id, { title: 'enlace', from: personal.id });
  assert.equal(r.sobre, personal.id);
  const c = C.custodia(eje, r.id);
  assert.deepEqual(c.enlaza, [proyecto.id], 'enlaza: lo que su payload nombra, menos aquel del que cuelga');
  assert.deepEqual([c.de, nombres(c)], [personal.id, ['familia']], 'la rama propia, como antes');
  assert.deepEqual(c.ramas.map((x) => [x.de, x.por, leen(x.padres)]), [[personal.id, r.id, [['familia', false, 'padre']]], [empresa.id, proyecto.id, [['trabajo', true, 'epoca']]]]);
  assert.deepEqual(c.todos.map((p) => [p.nombre, p.guarda, p.sella, p.en, p.leeEn]), [['familia', true, true, [personal.id], []], ['trabajo', true, false, [empresa.id], [empresa.id]]]);
  // La línea de antes de firmar otro enlace: lo que enlazará lo dice acciones.enlazaDe.
  const enlaza = A.enlazaDe(eje, 'reference X from another record', { X: proyecto.id, title: 'otro', from: personal.id }, 'ana', { t: T0 });
  assert.deepEqual(enlaza, [proyecto.id]);
  assert.deepEqual(A.enlazaDe(eje, 'anchor here', { X: proyecto.id, title: 'x', content: 'y' }, 'ana', { t: T0 }), [], 'lo que solo cuelga no enlaza');
  assert.deepEqual(C.quienGuarda(eje, 'ana', personal.id, { enlaza }), { nodo: null, padres: [{ nombre: 'familia', guarda: true, sella: true, lee: false }], de: personal.id, enlazadas: 1, todos: [{ nombre: 'familia', guarda: true, sella: true, lee: false }, { nombre: 'trabajo', guarda: true, sella: false, lee: true }] });
  // own en el elemento del que cuelga: solo su rama (lo que enlaza se sigue diciendo).
  await lanzar('set a custody default', personal.id, { key: 'linked operation', value: 'own' });
  const own = C.custodia(eje, r.id);
  assert.deepEqual([own.enlaza, own.ramas.map((x) => x.de), own.todos.map((p) => p.nombre)], [[proyecto.id], [personal.id], ['familia']]);
  assert.equal(C.quienGuarda(eje, 'ana', personal.id, { enlaza }).enlazadas, 0);
});

test('el mismo padre (la misma clave) por dos ramas cuenta una vez para guardar y sellar, y lee por rama: reads en A y does not read en B', async () => {
  const { eje, empresa, proyecto, personal, lanzar } = await dosRamas();
  await lanzar('add a parent', empresa.id, { name: 'nube', does: 'keeps', key: K1, 'can read': 'reads' });
  await lanzar('add a parent', personal.id, { name: 'nube', does: 'seals', key: K1, 'can read': 'does not read' });
  const r = await lanzar('reference X from another record', proyecto.id, { title: 'enlace', from: personal.id });
  const c = C.custodia(eje, r.id);
  assert.deepEqual(c.todos, [{ clave: K1, nombre: 'nube', url: null, guarda: true, sella: true, en: [personal.id, empresa.id], leeEn: [empresa.id] }], 'una vez, sin un lee fundido');
  assert.deepEqual(c.ramas.map((x) => [x.de, x.padres[0].lee]), [[personal.id, false], [empresa.id, true]]);
  // Un registro que solo cuelga de B no le da lectura.
  const soloB = await lanzar('anchor here', personal.id, { title: 'nota', content: 'solo de casa' });
  const b = C.custodia(eje, soloB.id);
  assert.deepEqual([b.ramas.length, b.padres[0].lee, b.todos[0].leeEn], [1, false, []]);
  // En la línea (el registro va entero a cada rama): para ESTE registro lee quien lee en alguna de sus ramas.
  assert.deepEqual(C.quienGuarda(eje, 'ana', personal.id, { enlaza: [proyecto.id] }).todos, [{ nombre: 'nube', guarda: true, sella: true, lee: true }]);
  assert.deepEqual(C.quienGuarda(eje, 'ana', personal.id).todos, [{ nombre: 'nube', guarda: false, sella: true, lee: false }]);
});

test('quién puede: «set a custody default» solo lo escribe (regla) y se le ofrece a quien escribió el elemento o el génesis; lo de otro no cuenta', async () => {
  const { eje, empresa, tarea, lanzar } = await mundo();
  await lanzar('add a parent', empresa.id, { name: 'trabajo', does: 'keeps', key: K1 });
  const ofrece = (X, yo) => A.acciones(eje, X, 9, yo).some((a) => a.nombre === 'set a custody default');
  assert.deepEqual([ofrece(empresa.id, 'ana'), ofrece(empresa.id, 'bea'), ofrece(tarea.id, 'bea')], [true, false, true]);
  const ajena = await A.transaccion(eje, 'set a custody default', { X: empresa.id, key: 'parent reads', value: 'no' }, 'bea', { t: T0 });
  assert.ok(reglas(ajena).includes('only the owner sets who keeps it'));
  await assert.rejects(() => eje.escribir({ autor: 'bea', sobre: empresa.id, en: '9000000000', t: T0, payload: [['parent reads'], ['no'], ['all announced movements happened'], ['bea'], ['set a custody default']], movimientos: [pagaElCoste('bea')] }));
  assert.deepEqual(leen(C.custodia(eje, tarea.id).padres), [['trabajo', true, 'epoca']]);
  await lanzar('set a custody default', tarea.id, { key: 'parent reads', value: 'no' }, 'bea');
  assert.deepEqual(leen(C.custodia(eje, tarea.id).padres), [['trabajo', false, 'elemento']], 'bea sobre lo suyo, sí');
});

test('una época de prueba con otras bases (no, own) cambia lo que se resuelve sin tocar el código', async () => {
  const { eje, empresa, proyecto, personal, lanzar } = await dosRamas();
  await lanzar('add a parent', empresa.id, { name: 'trabajo', does: 'keeps', key: K1 });
  await lanzar('add a parent', personal.id, { name: 'familia', does: 'keeps', key: K2 });
  await lanzar('add a parent', personal.id, { name: 'yo mismo', does: 'keeps', key: K3, 'can read': 'reads' });
  const r = await lanzar('reference X from another record', proyecto.id, { title: 'enlace', from: personal.id });
  const otra = epocaConBases(['no', 'own']);
  const de0 = C.custodia(eje, r.id);
  const deOtra = C.custodia(eje, r.id, { epoca: otra });
  assert.deepEqual([de0.ramas.map((x) => x.de), leen(de0.padres)], [[personal.id, empresa.id], [['familia', true, 'epoca'], ['yo mismo', true, 'padre']]]);
  assert.deepEqual([deOtra.ramas.map((x) => x.de), leen(deOtra.padres)], [[personal.id], [['familia', false, 'epoca'], ['yo mismo', true, 'padre']]]);
  assert.deepEqual(C.quienGuarda(eje, 'ana', personal.id, { epoca: otra, enlaza: [proyecto.id] }).todos.map((p) => [p.nombre, p.lee]), [['familia', false], ['yo mismo', true]]);
  // La plantilla toma su defecto de esa época.
  const valor = A.acciones(eje, empresa.id, 9, 'ana', { epoca: otra }).find((a) => a.nombre === 'set a custody default').parametros.find((x) => x.nombre === 'value').valor;
  assert.equal(valor, 'no');
});

test('la carta: cada padre dice si puede leerlo y de dónde; una fila por rama enlazada («también lo guardan, por …»); la línea dice quién puede leerlo', async () => {
  const { eje, empresa, proyecto, personal, lanzar } = await dosRamas();
  await lanzar('add a parent', empresa.id, { name: 'trabajo', does: 'keeps', key: K1 });
  await lanzar('add a parent', personal.id, { name: 'familia', does: 'keeps and seals', key: K2, 'can read': 'does not read' });
  await lanzar('set a custody default', personal.id, { key: 'parent reads', value: 'no' });
  await lanzar('add a parent', personal.id, { name: 'pareja', does: 'keeps', key: K3 });
  const r = await lanzar('reference X from another record', proyecto.id, { title: 'enlace', from: personal.id });
  const h = html(await arbol({ foco: { X: r.id, pv: 5 } }, eje, 'ana', ORDENADOR, ES));
  assert.match(h, /<li class="custodia-padre" data-guarda="1" data-sella="1" data-lee="0"><b>familia<\/b> <span>guarda y sella<\/span> <span class="custodia-lee">no puede leerlo<\/span><\/li>/);
  assert.match(h, /<b>pareja<\/b> <span>guarda una copia<\/span> <span class="custodia-lee">no puede leerlo<\/span> <small class="custodia-lee-de">por defecto aquí<\/small>/);
  assert.match(h, /<div class="custodia-rama"><small class="custodia-rama-por">también lo guardan, por proyecto:<\/small><ul class="custodia-padres"><li class="custodia-padre" data-guarda="1" data-sella="0" data-lee="1"><b>trabajo<\/b> <span>guarda una copia<\/span> <span class="custodia-lee">puede leerlo<\/span> <small class="custodia-lee-de">por defecto de la época<\/small><\/li><\/ul><\/div>/);
  // La línea de antes de firmar otro enlace desde personal: los padres de las dos ramas, cuántas, y quién puede leerlo.
  const linea = async (X, accion, valores) => (html(await arbol({ foco: { X, pv: 0 }, formulario: { X, accion, valores } }, eje, 'ana', ORDENADOR, ES)).match(/<p class="quien-guarda"[^>]*>([^<]*)<\/p>/) ?? [])[1];
  assert.equal(await linea(proyecto.id, 'reference X from another record', { from: personal.id, title: 'otro' }), 'Lo guardarán: tú y 3 padres (familia, pareja, trabajo), de 2 ramas. Pueden leerlo: trabajo.');
  assert.equal(await linea(personal.id, 'anchor here', {}), 'Lo guardarán: tú y 2 padres (familia, pareja). Pueden leerlo: solo tú.');
});

test('qué es una rama (Core, 17-11): un elemento sin padres propios que fija «parent reads» abre rama con los padres heredados (padresDe) y su lectura; «lee» se resuelve desde la rama', async () => {
  const { eje, raiz, empresa, proyecto, tarea, lanzar } = await mundo();
  // E1 = empresa con P (reads) y Q (sin dato); E2 = proyecto, sin padres, con parent reads = no.
  await lanzar('add a parent', empresa.id, { name: 'P', does: 'keeps', key: K1, 'can read': 'reads' });
  await lanzar('add a parent', empresa.id, { name: 'Q', does: 'keeps and seals', key: K2 });
  await lanzar('set a custody default', proyecto.id, { key: 'parent reads', value: 'no' });
  const bajoE2 = C.custodia(eje, tarea.id);
  assert.deepEqual([bajoE2.de, bajoE2.padresDe, bajoE2.heredado, leen(bajoE2.padres)], [proyecto.id, empresa.id, true, [['P', true, 'padre'], ['Q', false, 'elemento']]]);
  assert.deepEqual(bajoE2.ramas.map((r) => [r.de, r.padresDe]), [[proyecto.id, empresa.id]]);
  const fueraDeE2 = await lanzar('anchor here', empresa.id, { title: 'otro proyecto', content: 'fuera de E2' });
  const bajoE1 = C.custodia(eje, fueraDeE2.id);
  assert.deepEqual([bajoE1.de, bajoE1.padresDe, leen(bajoE1.padres)], [empresa.id, empresa.id, [['P', true, 'padre'], ['Q', true, 'epoca']]]);
  // Todos los registros de una misma rama leen igual: el propio E2 y lo de debajo.
  assert.deepEqual(leen(C.custodia(eje, proyecto.id).padres), leen(bajoE2.padres));
  // «linked operation» no abre rama.
  await lanzar('set a custody default', fueraDeE2.id, { key: 'linked operation', value: 'own' });
  assert.equal(C.custodia(eje, fueraDeE2.id).de, empresa.id);
  // Sin padres hasta la raíz, un «parent reads» abre rama sin padres: de el elemento, padresDe null, sin ramas que reciban nada.
  const { eje: otro, raiz: r2, empresa: e2, lanzar: l2 } = await mundo();
  await l2('set a custody default', e2.id, { key: 'parent reads', value: 'no' });
  const c = C.custodia(otro, e2.id);
  assert.deepEqual([c.de, c.padresDe, c.padres, c.ramas, c.todos], [e2.id, null, [], [], []]);
  assert.equal(C.custodia(otro, r2).de, null);
  assert.ok(raiz);
});

test('ramasDelLibro: todas las ramas del libro, una por elemento con configuración propia, con sus padres y su lee; y la lista de «este libro» por padre (solo con más de una rama)', async () => {
  const { eje, raiz, empresa, proyecto, personal, lanzar } = await dosRamas();
  const reverso = async () => html(await arbol({ foco: { X: raiz, pv: 5 } }, eje, 'ana', ORDENADOR, ES));
  assert.deepEqual(C.ramasDelLibro(eje), []);
  await lanzar('add a parent', raiz, { name: 'casa', does: 'keeps', key: K1 });
  assert.deepEqual(C.ramasDelLibro(eje).map((r) => [r.de, r.padresDe, leen(r.padres)]), [[raiz, raiz, [['casa', true, 'epoca']]]]);
  assert.doesNotMatch(await reverso(), /custodia-libro/, 'una sola rama: sin lista');
  await lanzar('add a parent', empresa.id, { name: 'casa', does: 'keeps and seals', key: K1, 'can read': 'does not read' });
  await lanzar('add a parent', empresa.id, { name: 'trabajo', does: 'seals', key: K2 });
  await lanzar('set a custody default', proyecto.id, { key: 'parent reads', value: 'no' });
  await lanzar('add a parent', personal.id, { name: 'familia', does: 'keeps', key: K3 });
  const ramas = C.ramasDelLibro(eje);
  assert.deepEqual(ramas.map((r) => [r.de, r.padresDe, leen(r.padres)]), [
    [raiz, raiz, [['casa', true, 'epoca']]],
    [empresa.id, empresa.id, [['casa', false, 'padre'], ['trabajo', true, 'epoca']]],
    [proyecto.id, empresa.id, [['casa', false, 'padre'], ['trabajo', false, 'elemento']]],
    [personal.id, personal.id, [['familia', true, 'epoca']]],
  ]);
  assert.deepEqual(Object.keys(ramas[0].padres[0]).sort(), ['clave', 'grado', 'guarda', 'id', 'lee', 'leeDe', 'nivel', 'nombre', 'sella', 'url']);
  const h = await reverso();
  assert.match(h, /<ul class="custodia-libro"><li><b>casa<\/b> <span>guarda en ana, empresa, proyecto · sella en empresa, proyecto · lee en ana<\/span><\/li><li><b>trabajo<\/b> <span>sella en empresa, proyecto · lee en empresa<\/span><\/li><li><b>familia<\/b> <span>guarda en personal · lee en personal<\/span><\/li><\/ul><\/div>/);
  assert.doesNotMatch(html(await arbol({ foco: { X: empresa.id, pv: 5 } }, eje, 'ana', ORDENADOR, ES)), /custodia-libro/, 'solo en «este libro»');
});
