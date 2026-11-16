// Padres y copias (VG 16-11, state/ANCLAJE_EN_CASCADA.md §7, puntos 3, 4, 5 y 7; Core State, REPLANTEO_CASCADA «Resuelto
// sin VG»; encargo «padres y copias», A19, N1 y N2; docs/notas/PADRES.md). Lo que se comprueba:
//   1. sin padres; un padre en la raíz que heredan todos; un elemento con su propia configuración que tapa la de arriba;
//   2. dos padres (la forma exacta del registro) y quitar uno; quitar el último vuelve a heredar;
//   3. la configuración de quien no puede se rechaza (regla «only the owner sets who keeps it») y no se ofrece;
//   4. la clase del dueño y su plazo (su propia herencia; sin ninguna, la del plazo más largo de 7.5);
//   5. quienGuarda con y sin nodo;
//   6. el bloque «quién guarda esto» del reverso y la línea de antes de firmar.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Eje } from '../src/eje.js';
import * as A from '../src/acciones.js';
import * as C from '../src/contrato.js';
import { arbol, preferencias } from '../carta/carta.js';
import { html } from '../carta/dom.js';
import { entrarPorInvitacion } from '../ejemplos/ikisai/altas.mjs';
import { pagaElCoste } from './ayudas-coste.js';

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
    assert.deepEqual(C.custodia(eje, id), { de: null, heredado: false, padres: [], clase: 'person', plazo: { escala: 6, segundos: 31536000 } });
  }
  assert.equal(C.custodia(eje, 'f'.repeat(64)), null, 'un id que no está en el eje');
  assert.deepEqual(C.quienGuarda(eje, 'ana', tarea.id), { nodo: null, padres: [], de: null });
});

test('un padre en la raíz lo heredan todos: de = la raíz y heredado en lo de abajo; el registro tapa la configuración de arriba en su rama', async () => {
  const { eje, raiz, empresa, proyecto, tarea, lanzar } = await mundo();
  const casa = await lanzar('add a parent', raiz, { name: 'casa', does: 'keeps', key: K1 });
  assert.deepEqual([casa.sobre, casa.en], [raiz, '9000000000'], 'ancla en el 9 del registro sobre el que se lanza');
  assert.deepEqual(C.custodia(eje, raiz), { de: raiz, heredado: false, padres: [{ id: casa.id, nombre: 'casa', clave: K1, guarda: true, sella: false, nivel: null, grado: null, url: null }], clase: 'person', plazo: { escala: 6, segundos: 31536000 } });
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

test('dos padres: cada uno con su registro (0 nombre; 1.0 qué hace, 1.1 nivel; 2.0 clave, 2.1 grado; 3.0 quién, 3.1 dirección; 4 la acción), sin huecos falte lo que falte', async () => {
  const { eje, raiz, lanzar } = await mundo();
  const casa = await lanzar('add a parent', raiz, { name: 'casa', does: 'keeps', key: K1 });
  const uni = await lanzar('add a parent', raiz, { name: 'universidad', does: 'seals', key: K2, level: 3, grade: '1', url: 'https://padre.ejemplo.org' });
  const solo = await lanzar('add a parent', raiz, { name: 'solo dirección', does: 'keeps and seals', key: K3, url: 'http://127.0.0.1:9' });
  assert.deepEqual(casa.payload, [['casa'], [['keeps']], [[K1]], [['ana']], ['add a parent']]);
  assert.deepEqual(uni.payload, [['universidad'], [['seals'], [3]], [[K2], ['1']], [['ana'], ['https://padre.ejemplo.org']], ['add a parent']]);
  assert.deepEqual(solo.payload, [['solo dirección'], [['keeps and seals']], [[K3]], [['ana'], ['http://127.0.0.1:9']], ['add a parent']], 'una dirección sin nivel ni grado: sin huecos');
  const c = C.custodia(eje, raiz);
  assert.deepEqual(c.padres.map((p) => [p.nombre, p.guarda, p.sella, p.nivel, p.grado, p.url]), [
    ['casa', true, false, null, null, null],
    ['universidad', false, true, 3, '1', 'https://padre.ejemplo.org'],
    ['solo dirección', true, true, null, null, 'http://127.0.0.1:9'],
  ]);
  // Validaciones de la plantilla: qué hace, la clave x-only en minúsculas y un nivel de la época.
  const mal = await A.transaccion(eje, 'add a parent', { X: raiz, name: 'x', does: 'guarda', key: 'AB'.repeat(32), level: 7 }, 'ana', { t: T0 });
  assert.deepEqual(reglas(mal).sort(), ['does', 'key', 'level']);
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
  assert.deepEqual(C.quienGuarda(eje, 'ana', proyecto.id), { nodo: null, padres: [{ nombre: 'trabajo', guarda: true, sella: false }, { nombre: 'universidad', guarda: true, sella: true }], de: empresa.id });
  assert.deepEqual(C.quienGuarda(eje, 'ana', raiz), { nodo: null, padres: [], de: null });
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
  assert.match(h, /<li class="custodia-padre" data-guarda="1" data-sella="0"><b>trabajo<\/b> <span>guarda una copia<\/span><\/li>/);
  assert.match(h, /<b>universidad<\/b> <span>guarda y sella<\/span> <small>Bitcoin · grado compartido<\/small>/);
  assert.match(h, /<small class="custodia-heredado">heredado de empresa<\/small>/);
  assert.match(h, /plazo de anclaje por defecto: 1 semana \(dueño: empresa\)/);
  assert.doesNotMatch(h, /custodia-nodo/);
  // La línea de antes de firmar: sin nodo ni padres; con padres; con nodo.
  const linea = async (X, yo = 'ana') => (html(await arbol({ foco: { X, pv: 0 }, formulario: { X, accion: 'anchor here', valores: {} } }, eje, yo, ORDENADOR, ES)).match(/<p class="quien-guarda"[^>]*>([^<]*)<\/p>/) ?? [])[1];
  assert.equal(await linea(raiz), 'Solo lo guardas tú, en este dispositivo');
  assert.equal(await linea(proyecto.id), 'Lo guardarán: tú y 2 padres (trabajo, universidad)');
  const p = preferencias(eje, 'ana', { 'sync url': 'https://nodo.ejemplo.org', 'sync ledger': 'eje' });
  await eje.escribir({ autor: 'ana', sobre: p.sobre, en: p.en, t: T0, payload: p.payload, movimientos: [pagaElCoste('ana')] });
  assert.equal(await linea(proyecto.id), 'Lo guardarán: tú, el nodo nodo.ejemplo.org y 2 padres (trabajo, universidad)');
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
