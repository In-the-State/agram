// El libro privado: el enlace entre dos libros, como dato en los dos lados (VG 17-11 por Core State; encargo «abrir aquí un
// libro privado»; docs/notas/LIBRO_PRIVADO.md). Lo que se comprueba:
//   1. «open a private book here» sobre un elemento propio y sobre uno ajeno; sobre el alta de otro, con y sin pagar la atención;
//   2. un id, una clave o un nivel mal formados no valen; más de cuatro claves, o un nivel repetido, tampoco;
//   3. la lectura del elemento (contrato.librosPrivados): libro, claves con su nivel, dirección de cabeceras, quién, cuándo e id;
//      vale el último por libro (al rotar una clave), por instante y, a igualdad, por id;
//   4. «this book hangs from» solo se ofrece al dueño del génesis; gana la última; a mano por otro, la época lo deja y la
//      lectura no lo cuenta (contrato.cuelgaDe);
//   5. recíproco sí y no (contrato.enlaceReciproco, sobre dos ejes);
//   6. un tercero ve que existe y quién lo abrió (la lectura y el bloque «quién guarda esto» del reverso), no las claves ni la dirección;
//   7. el ejemplo: el libro pequeño con su «this book hangs from» y un padre, el grande, que guarda y sella y no lee.
// Ejes locales en memoria, identidades y claves inventadas (nada real ni secreto).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Eje } from '../src/eje.js';
import * as A from '../src/acciones.js';
import * as C from '../src/contrato.js';
import { arbol } from '../carta/carta.js';
import { html } from '../carta/dom.js';
import { entrarPorInvitacion } from '../ejemplos/ikisai/altas.mjs';
import { quemaDelCoste } from '../src/escritura.js';

const T0 = '2026-11-17T10:00:00Z';
const T = (s) => new Date(Date.parse(T0) + s * 1000).toISOString().replace('.000Z', 'Z');
const ORDENADOR = { ancho: 1366, alto: 900 };
const ES = { idioma: 'es' };
const ABRIR = 'open a private book here';
const CUELGA = 'this book hangs from';
const K1 = '11'.repeat(32);
const K2 = '22'.repeat(32);
const K3 = '33'.repeat(32);
const K4 = '44'.repeat(32);
const LIBRO = 'ab'.repeat(32);
const reglas = (r) => r.motivos.map((m) => m.regla);

/** ana (génesis) con bea y carl invitados; ana escribe «empresa» en la raíz y bea, «tarea» en la empresa. */
async function mundo() {
  const eje = await Eje.genesis({ demostracion: true, identidad: 'ana', t: T0, foco: ['ana'], emision: [{ token: 'R', cantidad: 10 }] });
  await entrarPorInvitacion(eje, { por: 'ana', quien: 'bea', t: T0 });
  await entrarPorInvitacion(eje, { por: 'ana', quien: 'carl', t: T0 });
  const lanzar = async (nombre, X, parametros, yo = 'ana', t = T0) => {
    const r = await A.transaccion(eje, nombre, { X, ...parametros }, yo, { t });
    assert.ok(r.ok, nombre + ': ' + JSON.stringify(r.motivos));
    return eje.anadir(r.evento);
  };
  const empresa = await lanzar('anchor here', eje.genesisId, { title: 'empresa', content: 'lo del trabajo' });
  const tarea = await lanzar('anchor here', empresa.id, { title: 'tarea', content: 'una tarea' }, 'bea');
  return { eje, empresa, tarea, lanzar };
}

/** Un registro escrito a mano, pagando su coste de escribir y lo que se le añada: → los mensajes de la validación ([] si pasa). */
async function aMano(eje, { autor, sobre, en, t, payload, movimientos = [] }) {
  try {
    await eje.escribir({ autor, sobre, en, t, payload, movimientos: [quemaDelCoste(autor, payload, 'minuto', { eje }), ...movimientos] });
    return [];
  } catch (e) {
    return [e.message];
  }
}

// ---------- 1. abrir ----------

test('abrir aquí un libro privado: sobre un elemento propio y sobre uno ajeno; ancla en el 9.1, sin movimientos propios y sin huecos', async () => {
  const { eje, empresa, tarea, lanzar } = await mundo();
  const ofrece = (X, yo) => A.acciones(eje, X, 9, yo).some((a) => a.nombre === ABRIR);
  assert.deepEqual([ofrece(empresa.id, 'ana'), ofrece(empresa.id, 'bea'), ofrece(tarea.id, 'ana'), ofrece(tarea.id, 'bea')], [true, true, true, true], 'lo escribe quien puede escribir sobre X');
  assert.equal(A.acciones(eje, empresa.id, 9, 'ana', ES).find((a) => a.nombre === ABRIR).etiqueta, 'abrir aquí un libro privado');
  // Propio: ana sobre su empresa, con dos claves y la dirección de las cabeceras.
  const propio = await lanzar(ABRIR, empresa.id, { book: LIBRO, 'line keys': [[1, K1], [3, K3]], 'headers url': 'https://cabeceras.ejemplo.org/' });
  assert.deepEqual([propio.sobre, propio.en], [empresa.id, '9100000000']);
  assert.deepEqual(propio.payload.slice(1), [[[[LIBRO]], ['https://cabeceras.ejemplo.org/']], [[1, K1], [3, K3]], ['ana'], [ABRIR]]);
  assert.match(String(propio.payload[0]), /ana opens the private book ab/);
  assert.ok(propio.movimientos.every((m) => m.a === null), 'solo el coste de escribir');
  // Ajeno (no un alta): bea sobre la empresa de ana, sin dirección; la 1 queda [[[libro]]] (desde el puente, A15, el libro va en 1.0.0), sin hueco.
  const ajeno = await lanzar(ABRIR, empresa.id, { book: 'cd'.repeat(32), 'line keys': [[2, K2]] }, 'bea');
  assert.deepEqual(ajeno.payload.slice(1), [[[['cd'.repeat(32)]]], [[2, K2]], ['bea'], [ABRIR]]);
  // Y ana sobre la tarea de bea.
  await lanzar(ABRIR, tarea.id, { book: LIBRO, 'line keys': [[4, K4]] });
});

test('abrir sobre el alta de otro: no se ofrece; sin pagar la atención lo rechaza «attention has a price»; a mano, pagando, pasa', async () => {
  const { eje } = await mundo();
  const altaAna = eje.alta('ana').id;
  assert.ok(!A.acciones(eje, altaAna, 9, 'bea').some((a) => a.nombre === ABRIR));
  assert.ok(A.acciones(eje, altaAna, 9, 'ana').some((a) => a.nombre === ABRIR), 'en la suya, sí');
  const sin = await A.transaccion(eje, ABRIR, { X: altaAna, book: LIBRO, 'line keys': [[1, K1]] }, 'bea', { t: T(1) });
  assert.equal(sin.ok, false);
  assert.ok(reglas(sin).includes('attention has a price'), JSON.stringify(sin.motivos));
  // El pago: el que pide «write to X» (el precio del grupo en que ana pone a bea) en la misma transacción.
  const carta = await A.transaccion(eje, 'write to X', { X: altaAna, text: 'hola' }, 'bea', { t: T(1) });
  assert.equal(carta.ok, true, JSON.stringify(carta.motivos));
  const pago = carta.evento.movimientos.filter((m) => m.a !== null || m.token !== 'T');
  assert.ok(pago.length > 0);
  const payload = sin.evento.payload;
  assert.match((await aMano(eje, { autor: 'bea', sobre: altaAna, en: '9100000000', t: T(2), payload })).join('\n'), /attention has a price/);
  assert.deepEqual(await aMano(eje, { autor: 'bea', sobre: altaAna, en: '9100000000', t: T(3), payload, movimientos: pago }), []);
  assert.deepEqual(C.librosPrivados(eje, altaAna).map((l) => [l.libro, l.quien]), [[LIBRO, 'bea']]);
});

// ---------- 2. lo mal formado ----------

test('un id, una clave o un nivel mal formados no valen; más de cuatro claves (cinco) o un nivel repetido, tampoco; ninguna (0) sí', async () => {
  const { eje, empresa } = await mundo();
  const prueba = (params) => A.transaccion(eje, ABRIR, { X: empresa.id, book: LIBRO, 'line keys': [[1, K1]], ...params }, 'ana', { t: T(1) });
  for (const [book, que] of [['AB'.repeat(32), 'en mayúsculas'], ['abcd', 'corto'], ['ab'.repeat(33), 'largo'], ['zz'.repeat(32), 'no hex']]) {
    assert.deepEqual(reglas(await prueba({ book })), ['book'], 'libro ' + que);
  }
  const claves = [
    [[[1, 'AB'.repeat(32)]], 'clave en mayúsculas'],
    [[[1, 'abcd']], 'clave corta'],
    [[[5, K1]], 'un nivel que la cascada no tiene'],
    [[['1', K1]], 'el nivel como texto'],
    [[[1, K1], [1, K2]], 'un nivel repetido'],
    [[[1, K1], [2, K2], [3, K3], [4, K4], [1, K1]], 'más de cuatro'],
    [[[1, K1], [2, K2], [3, K3], [4, K4], [2, K1]], 'cinco, con el quinto repetido'],
    [[1, K1], 'un par sin la lista'],
    [K1, 'una clave sin nivel'],
    [[[1, K1, 'de más']], 'un par de tres'],
  ];
  for (const [k, que] of claves) assert.deepEqual(reglas(await prueba({ 'line keys': k })), ['line keys'], que);
  // Cero claves (Core AGRAM 17-11 con Core StateArk: un libro pequeño sin sellador se anuncia sin claves): se escribe 0.
  const sin = await A.transaccion(eje, ABRIR, { X: empresa.id, book: LIBRO }, 'ana', { t: T(1) });
  assert.equal(sin.ok, true, 'sin claves: ' + JSON.stringify(sin.motivos));
  assert.deepEqual(sin.evento.payload[2], [0]);
  assert.equal((await prueba({ 'line keys': 0 })).ok, true, 'el 0 dicho');
  assert.deepEqual(reglas(await prueba({ 'line keys': [[1, K1], [2, K2], [3, K3], [4, K4], [4, K1]] })), ['line keys'], 'cinco');
  assert.equal((await prueba({ 'line keys': [[4, K4], [1, K1], [3, K3], [2, K2]] })).ok, true, 'las cuatro, en cualquier orden: el nivel va dicho');
  // Escrito a mano con una clave mala (la época no tiene regla para esto): la lectura no lo cuenta.
  assert.deepEqual(await aMano(eje, { autor: 'ana', sobre: empresa.id, en: '9100000000', t: T(2), payload: ['a mano', [[LIBRO]], [[1, 'abcd']], ['ana'], [ABRIR]] }), []);
  assert.deepEqual(C.librosPrivados(eje, empresa.id), []);
});

// ---------- 3. la lectura del elemento ----------

test('la lectura del elemento: libro, claves con su nivel, dirección, quién, cuándo e id; por libro vale el último (por instante y, a igualdad, por id)', async () => {
  const { eje, empresa, tarea, lanzar } = await mundo();
  assert.deepEqual(C.librosPrivados(eje, empresa.id), []);
  assert.deepEqual(C.librosPrivados(eje, 'f'.repeat(64)), [], 'un id que no está');
  const uno = await lanzar(ABRIR, empresa.id, { book: LIBRO, 'line keys': [[1, K1], [3, K3]], 'headers url': 'https://cabeceras.ejemplo.org/' }, 'ana', T(1));
  const otro = await lanzar(ABRIR, empresa.id, { book: 'cd'.repeat(32), 'line keys': [[2, K2]], 'headers url': 'ftp://no.vale' }, 'bea', T(2));
  assert.deepEqual(C.librosPrivados(eje, empresa.id), [
    { id: uno.id, libro: LIBRO, claves: [{ nivel: 1, clave: K1 }, { nivel: 3, clave: K3 }], direccion: 'https://cabeceras.ejemplo.org', quien: 'ana', t: T(1) },
    { id: otro.id, libro: 'cd'.repeat(32), claves: [{ nivel: 2, clave: K2 }], direccion: null, quien: 'bea', t: T(2) },
  ]);
  assert.deepEqual(C.librosPrivados(eje, tarea.id), [], 'cuelga del elemento, no se hereda hacia abajo');
  // Rotar una clave: otro registro para el mismo libro; vale el último por instante.
  const rotado = await lanzar(ABRIR, empresa.id, { book: LIBRO, 'line keys': [[1, K4], [3, K3]] }, 'ana', T(3));
  const l = C.librosPrivados(eje, empresa.id).find((x) => x.libro === LIBRO);
  assert.deepEqual([l.id, l.claves[0].clave, l.direccion, l.t], [rotado.id, K4, null, T(3)]);
  assert.equal(C.librosPrivados(eje, empresa.id).length, 2);
  // Un registro anterior que llega después no manda: vale el instante, no la llegada.
  await lanzar(ABRIR, empresa.id, { book: LIBRO, 'line keys': [[1, K2]] }, 'ana', T(2));
  assert.equal(C.librosPrivados(eje, empresa.id).find((x) => x.libro === LIBRO).id, rotado.id);
  // A igualdad de instante, el de id mayor.
  const a = await lanzar(ABRIR, empresa.id, { book: LIBRO, 'line keys': [[2, K1]] }, 'ana', T(9));
  const b = await lanzar(ABRIR, empresa.id, { book: LIBRO, 'line keys': [[2, K2]] }, 'ana', T(9));
  assert.equal(C.librosPrivados(eje, empresa.id).find((x) => x.libro === LIBRO).id, a.id > b.id ? a.id : b.id);
  // Solo cuenta quien lo abrió: el registro de otra persona sobre el mismo libro, aunque sea posterior, no cambia sus claves.
  await lanzar(ABRIR, empresa.id, { book: LIBRO, 'line keys': [[1, K3]] }, 'bea', T(10));
  const trasOtro = C.librosPrivados(eje, empresa.id).find((x) => x.libro === LIBRO);
  assert.deepEqual([trasOtro.id, trasOtro.quien], [a.id > b.id ? a.id : b.id, 'ana']);
  assert.equal(C.librosPrivados(eje, empresa.id).length, 2);
  // El enlace no es una referencia: no enlaza nada para la custodia.
  assert.deepEqual(C.custodia(eje, uno.id).enlaza, []);
});

// ---------- 4. este libro cuelga de ----------

test('«this book hangs from»: sobre el génesis, solo al dueño; gana la última; a mano por otro, la época lo deja y la lectura no lo cuenta', async () => {
  const { eje, empresa, lanzar } = await mundo();
  const raiz = eje.genesisId;
  const ofrece = (X, yo) => A.acciones(eje, X, 9, yo).some((a) => a.nombre === CUELGA);
  assert.deepEqual([ofrece(raiz, 'ana'), ofrece(raiz, 'bea'), ofrece(empresa.id, 'ana')], [true, false, false], 'solo sobre el génesis y solo a su autor');
  assert.equal(C.cuelgaDe(eje), null);
  const G = 'ef'.repeat(32);
  const primero = await lanzar(CUELGA, raiz, { book: G, element: K1 }, 'ana', T(1));
  assert.deepEqual([primero.sobre, primero.en], [raiz, '9500000000']);
  assert.deepEqual(primero.payload.slice(1), [[[G], [0]], [K1], ['ana'], [CUELGA]], 'desde el puente (A15): el libro en 1.0 y sus claves de línea en 1.1, 0 por defecto');
  assert.deepEqual(C.cuelgaDe(eje), { libro: G, elemento: K1, id: primero.id, t: T(1) });
  const segundo = await lanzar(CUELGA, raiz, { book: G, element: K2 }, 'ana', T(2));
  assert.deepEqual(C.cuelgaDe(eje), { libro: G, elemento: K2, id: segundo.id, t: T(2) });
  for (const [p, que] of [[{ book: 'EF'.repeat(32) }, 'book'], [{ element: 'abcd' }, 'element']]) {
    const r = await A.transaccion(eje, CUELGA, { X: raiz, book: G, element: K1, ...p }, 'ana', { t: T(3) });
    assert.deepEqual(reglas(r), [que]);
  }
  // bea lo escribe a mano: no hay regla de validez que lo impida (solo la oferta); contrato.cuelgaDe no lo cuenta.
  const payload = ['a mano', [G], [K3], ['bea'], [CUELGA]];
  // Sobre el génesis (el alta de ana), bea paga la atención como cualquiera que escribe ahí.
  const carta = await A.transaccion(eje, 'write to X', { X: raiz, text: 'hola' }, 'bea', { t: T(4) });
  const pago = carta.evento.movimientos.filter((m) => m.a !== null || m.token !== 'T');
  assert.deepEqual(await aMano(eje, { autor: 'bea', sobre: raiz, en: '9500000000', t: T(5), payload, movimientos: pago }), []);
  assert.deepEqual(C.cuelgaDe(eje).id, segundo.id);
});

// ---------- 5. recíproco ----------

/** Dos libros: el grande, de ana, con su elemento «sala», y el pequeño, de ana también, que cuelga (o no) de la sala. */
async function dosLibros() {
  const { eje: grande, empresa: sala, lanzar } = await mundo();
  const pequeno = await Eje.genesis({ demostracion: true, identidad: 'ana', t: T(100), foco: ['ana'], emision: [{ token: 'R', cantidad: 5 }] });
  const enPequeno = async (nombre, parametros, t) => {
    const r = await A.transaccion(pequeno, nombre, { X: pequeno.genesisId, ...parametros }, 'ana', { t });
    assert.ok(r.ok, nombre + ': ' + JSON.stringify(r.motivos));
    return pequeno.anadir(r.evento);
  };
  return { grande, sala, lanzar, pequeno, enPequeno };
}

test('recíproco: sí cuando los dos lados se dicen; no si falta uno, si apuntan a otro elemento o a otro libro', async () => {
  const { grande, sala, lanzar, pequeno, enPequeno } = await dosLibros();
  assert.notEqual(grande.genesisId, pequeno.genesisId);
  assert.equal(C.enlaceReciproco(grande, pequeno), false, 'ninguno lo dice');
  await enPequeno(CUELGA, { book: grande.genesisId, element: sala.id }, T(101));
  assert.equal(C.enlaceReciproco(grande, pequeno), false, 'solo lo dice el pequeño');
  const otro = await lanzar('anchor here', grande.genesisId, { title: 'otra sala', content: 'otra' }, 'ana', T(102));
  await lanzar(ABRIR, otro.id, { book: pequeno.genesisId, 'line keys': [[1, K1]] }, 'ana', T(103));
  assert.equal(C.enlaceReciproco(grande, pequeno), false, 'el grande lo dice en otro elemento');
  await lanzar(ABRIR, sala.id, { book: pequeno.genesisId, 'line keys': [[1, K1]] }, 'ana', T(104));
  assert.equal(C.enlaceReciproco(grande, pequeno), true);
  // El pequeño cambia a otro libro: vale su última, y ya no es recíproco.
  await enPequeno(CUELGA, { book: 'ef'.repeat(32), element: sala.id }, T(105));
  assert.equal(C.enlaceReciproco(grande, pequeno), false);
  assert.equal(C.enlaceReciproco(null, pequeno), false);
  assert.equal(C.enlaceReciproco(grande, null), false);
});

test('cero claves (Core AGRAM 17-11 con Core StateArk): un libro pequeño sin sellador se anuncia sin claves; la lectura lo da con claves vacías y el enlace sigue siendo recíproco', async () => {
  const { grande, sala, lanzar, pequeno, enPequeno } = await dosLibros();
  await enPequeno(CUELGA, { book: grande.genesisId, element: sala.id }, T(101));
  const sin = await lanzar(ABRIR, sala.id, { book: pequeno.genesisId }, 'ana', T(102));
  assert.deepEqual(sin.payload[2], [0], 'sin claves: 0');
  const [l] = C.librosPrivados(grande, sala.id);
  assert.deepEqual([l.id, l.libro, l.claves], [sin.id, pequeno.genesisId, []]);
  assert.equal(C.enlaceReciproco(grande, pequeno), true);
  // Vale el último anuncio: el que declara las claves después.
  const con = await lanzar(ABRIR, sala.id, { book: pequeno.genesisId, 'line keys': [[1, K1]] }, 'ana', T(103));
  assert.deepEqual(C.librosPrivados(grande, sala.id).map((x) => [x.id, x.claves]), [[con.id, [{ nivel: 1, clave: K1 }]]]);
  // Cinco claves no, como siempre.
  const cinco = await A.transaccion(grande, ABRIR, { X: sala.id, book: pequeno.genesisId, 'line keys': [[1, K1], [2, K2], [3, K3], [4, K4], [4, K1]] }, 'ana', { t: T(104) });
  assert.deepEqual(reglas(cinco), ['line keys']);
});

// ---------- 6. lo que ve un tercero ----------

test('un tercero ve que existe y quién lo abrió: en la lectura y en «quién guarda esto», sin claves, sin dirección y sin el id entero', async () => {
  const { eje, empresa, lanzar } = await mundo();
  await lanzar(ABRIR, empresa.id, { book: LIBRO, 'line keys': [[1, K1]], 'headers url': 'https://cabeceras.ejemplo.org' }, 'bea', T(1));
  // La lectura no depende de quién mira: carl no está en el libro privado y lo ve igual.
  assert.deepEqual(C.librosPrivados(eje, empresa.id).map((l) => [l.libro, l.quien]), [[LIBRO, 'bea']]);
  const reverso = html(await arbol({ foco: { X: empresa.id, pv: 5 } }, eje, 'carl', ORDENADOR, ES));
  const lineas = [...reverso.matchAll(/<small class="custodia-privado">([^<]*)<\/small>/g)].map((m) => m[1]);
  assert.deepEqual(lineas, ['un libro privado (abababab) cuelga de aquí; lo abrió bea']);
  assert.ok(!reverso.includes(LIBRO), 'el id solo en corto');
  assert.ok(!reverso.includes(K1) && !reverso.includes('cabeceras.ejemplo.org'), 'ni las claves ni la dirección');
  // Sin libros privados, ninguna línea.
  assert.doesNotMatch(html(await arbol({ foco: { X: eje.genesisId, pv: 5 } }, eje, 'carl', ORDENADOR, ES)), /custodia-privado/);
});

// ---------- 7. el ejemplo: el pequeño se declara colgado y su padre, el grande, guarda y sella sin leer ----------

test('ejemplo: el libro pequeño con su «this book hangs from» y un padre (quien sella el grande) que guarda y sella y no lee', async () => {
  const { grande, sala, lanzar, pequeno, enPequeno } = await dosLibros();
  const SELLADOR = '55'.repeat(32);
  await enPequeno(CUELGA, { book: grande.genesisId, element: sala.id }, T(101));
  await enPequeno('add a parent', { name: 'el libro grande', does: 'keeps and seals', key: SELLADOR, 'can read': 'does not read' }, T(102));
  await lanzar(ABRIR, sala.id, { book: pequeno.genesisId, 'line keys': [[1, K1], [2, K2]] }, 'ana', T(103));
  assert.equal(C.enlaceReciproco(grande, pequeno), true);
  const c = C.custodia(pequeno, pequeno.genesisId);
  assert.deepEqual(c.padres.map((p) => [p.nombre, p.clave, p.guarda, p.sella, p.lee, p.leeDe]), [['el libro grande', SELLADOR, true, true, false, 'padre']]);
  // Los libros no se leen entre sí: ninguno tiene registros del otro; el enlace son dos ids escritos como datos.
  assert.equal(grande.obtener(pequeno.genesisId) ?? null, null);
  assert.equal(pequeno.obtener(sala.id) ?? null, null);
});
