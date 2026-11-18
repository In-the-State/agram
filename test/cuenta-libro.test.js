// La época del libro de cuenta (A34, parte de datos; agram-equipo/DISENO_LIBRO_DE_CUENTA.md): datos/epocas/cuenta/.
// Todo inventado: libros en memoria, de demostración; ids y claves de ejemplo, ningún secreto.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { generar, archivos, epocaCuenta } from '../datos/epocas/cuenta/generar.mjs';
import { EPOCA_0_BTML, cargarEpocaEscrita } from '../src/epocas.js';
import { Eje } from '../src/eje.js';
import * as A from '../src/acciones.js';
import { leerRegla } from '../src/bqlm.js';
import { ContextoEje } from '../src/contexto-eje.js';
import { sinTraducir } from '../docs/sin-traducir.mjs';

const ID_DE_LA_0 = '7c1d49087209c41e03a38ef5e1c6aec6007a7515d1030f37ddea13e8a35a8448';
const LIBRO = 'a book of mine';
const INVITACION = 'an invitation received';
const EMPAREJAMIENTO = 'a pairing';
const AVISO = 'this account lives only here';
const T = '2026-11-18T10:00:00Z';
const OTRO = 'ab'.repeat(32);
const OTRO2 = 'cd'.repeat(32);
const ID = 'ef'.repeat(32);
const CLAVE = '12'.repeat(32);

/** Un libro de cuenta de demostración: «ana» lo abre (su alta es el génesis) e invita a «bea». */
async function cuenta() {
  const eje = await Eje.genesis({ identidad: 'ana', foco: 'cuenta inventada', t: T, emision: [{ token: 'R', cantidad: 10 }], epoca: epocaCuenta(), demostracion: true });
  await eje.aceptar(await eje.invitar({ autor: 'ana', invitado: 'bea', t: T }), {}, { t: T });
  return eje;
}
async function hacer(eje, nombre, X, params, quien) {
  const r = await A.transaccion(eje, nombre, { X, ...params }, quien, { t: T });
  assert.ok(r.ok, nombre + ': ' + JSON.stringify(r.motivos));
  return eje.anadir(r.evento);
}
const ofrece = (eje, X, pv, quien) => A.acciones(eje, X, pv, quien).map((a) => a.nombre);
const lectura = (eje, nombre, alta) => {
  const r = leerRegla(eje.epoca().lecturas.find((x) => x[0][0] === nombre), alta, new ContextoEje(eje, { epoch: eje.epoca() }));
  assert.equal(r.estado, 'RESUELTO', r.motivo);
  return r.valor.map((v) => eje.obtener(v?.id ?? v).payload[0][0]);
};

test('la época se genera desde su fuente, al día con ella y con el id de la 0; lleva las de la guía sin copiarlas; src/ y carta/ no conocen sus plantillas', () => {
  const g = generar();
  assert.equal(g.fallos, 0, g.informe.join('\n'));
  for (const [ruta, texto] of Object.entries(archivos(g))) assert.equal(readFileSync(ruta, 'utf8'), texto, `${ruta} no está al día: npm run epoca:cuenta`);
  assert.equal(EPOCA_0_BTML.id, ID_DE_LA_0);
  assert.equal(g.hereda, ID_DE_LA_0);
  assert.deepEqual(g.plantillas.map((p) => [p.nombre, p.ocho]), [[LIBRO, [1, 40]], ['a zone of the face', [2, 13]], [INVITACION, [3, 40]], [EMPAREJAMIENTO, [3, 41]], ['a step of the guide', [4, 29]]]);
  const guia = JSON.parse(readFileSync('datos/epocas/guia-libro/guia-libro-0.ids.json', 'utf8')).plantillas;
  for (const p of guia) assert.equal(g.plantillas.find((x) => x.nombre === p.nombre).id, p.id, 'la de la guía, la misma: ' + p.nombre);
  assert.ok(!readdirSync('datos/epocas/cuenta/plantillas').some((f) => /step|zone/.test(f)), 'no copiadas: vienen de prestadas.json');
  assert.deepEqual(g.reglas.map((r) => r.nombre), ['my books', 'my pairings', 'my pending invitations', AVISO]);
  const e = cargarEpocaEscrita(epocaCuenta());
  assert.equal(e.id, g.id);
  // Las suyas (las provisionales, VG 18-11, no cuentan: la zona y el paso de la época les ganan por nombre).
  const propias = (x) => x.transacciones.filter((t) => !t.provisional);
  assert.equal(propias(e).length, propias(EPOCA_0_BTML).length + 5);
  for (const carpeta of ['src', 'carta']) {
    const fuentes = readdirSync(carpeta).filter((f) => f.endsWith('.js')).map((f) => readFileSync(join(carpeta, f), 'utf8'));
    for (const n of [LIBRO, INVITACION, EMPAREJAMIENTO, 'my books', 'my pending invitations', 'my pairings', AVISO]) assert.ok(!fuentes.some((s) => s.includes(`'${n}'`) || s.includes(`"${n}"`)), `${carpeta}/ no conoce «${n}» por su nombre`);
  }
  assert.deepEqual(sinTraducir('es', { epoca: e }).map((x) => x.clave), []);
});

test('cada plantilla, solo al dueño sobre su propia alta y en su punto de vista; se ancla donde dice el diseño; los ids, como datos con su forma', async () => {
  const eje = await cuenta();
  const ana = eje.alta('ana').id;
  const bea = eje.alta('bea').id;
  assert.ok(ofrece(eje, ana, 1, 'ana').includes(LIBRO));
  assert.deepEqual(ofrece(eje, ana, 3, 'ana').filter((n) => [INVITACION, EMPAREJAMIENTO].includes(n)), [INVITACION, EMPAREJAMIENTO]);
  assert.ok(!ofrece(eje, ana, 3, 'ana').includes(LIBRO) && !ofrece(eje, ana, 1, 'ana').includes(EMPAREJAMIENTO), 'cada una en su punto de vista');
  for (const pv of [1, 3]) assert.ok(!ofrece(eje, ana, pv, 'bea').some((n) => [LIBRO, INVITACION, EMPAREJAMIENTO].includes(n)), 'no sobre el alta de otra');
  assert.ok(ofrece(eje, bea, 1, 'bea').includes(LIBRO) && ofrece(eje, bea, 3, 'bea').includes(EMPAREJAMIENTO), 'sí sobre la suya');
  for (const n of [LIBRO, INVITACION, EMPAREJAMIENTO]) assert.equal(A.modoDeEjecucion(eje, n).modo, 'person');
  const libro = await hacer(eje, LIBRO, bea, { name: 'Libro inventado', 'my alta there': ID, book: OTRO, 'download from': 'https://ejemplo.invalid/libro', 'shared name': 'libro-inventado' }, 'bea');
  assert.deepEqual([libro.sobre, libro.en], [bea, '1000000000']);
  assert.deepEqual(libro.payload, [['Libro inventado'], [[ID]], [['all announced movements happened']], ['bea'], [LIBRO], [[OTRO], ['https://ejemplo.invalid/libro'], ['libro-inventado']]]);
  const inv = await hacer(eje, INVITACION, bea, { name: 'Otro libro', invitation: ID, book: OTRO2, note: 'de prueba', 'invited by': CLAVE }, 'bea');
  assert.deepEqual([inv.sobre, inv.en, inv.payload[5]], [bea, '3000000000', [[OTRO2], [CLAVE]]]);
  const par = await hacer(eje, EMPAREJAMIENTO, bea, { name: 'Portátil inventado', 'session key': CLAVE, 'valid until': '2026-12-01T00:00:00Z', relay: 'wss://rele.invalid' }, 'bea');
  assert.deepEqual([par.sobre, par.en, par.payload[1], par.payload[5]], [bea, '3000000000', [[CLAVE], ['2026-12-01T00:00:00Z']], [['wss://rele.invalid']]]);
  const no = async (nombre, params) => assert.equal((await A.transaccion(eje, nombre, { X: bea, ...params }, 'bea', { t: T })).ok, false, nombre + ' ' + JSON.stringify(params));
  await no(LIBRO, { name: 'x', 'my alta there': ID, book: eje.genesisId });
  await no(LIBRO, { name: 'x', 'my alta there': 'no es un id', book: OTRO });
  await no(LIBRO, { name: 'x', 'my alta there': ID, book: OTRO, 'download from': 'javascript:alert(1)' });
  await no(INVITACION, { name: 'x', book: OTRO });
  await no(EMPAREJAMIENTO, { name: 'x', 'session key': CLAVE, relay: 'ftp://rele.invalid' });
  await no(EMPAREJAMIENTO, { name: 'x', 'session key': OTRO.toUpperCase(), relay: 'wss://rele.invalid' });
});

test('la nueva sobre la vieja (con sus defectos) y manda la última; retirar con «close by decision» (no con «close»); las lecturas con nombre lo ven', async () => {
  const eje = await cuenta();
  const bea = eje.alta('bea').id;
  const libro = await hacer(eje, LIBRO, bea, { name: 'Libro inventado', 'my alta there': ID, book: OTRO }, 'bea');
  await hacer(eje, INVITACION, bea, { name: 'Otro libro', invitation: ID, book: OTRO2 }, 'bea');
  const par = await hacer(eje, EMPAREJAMIENTO, bea, { name: 'Portátil inventado', 'session key': CLAVE, relay: 'wss://rele.invalid' }, 'bea');
  assert.deepEqual([lectura(eje, 'my books', bea), lectura(eje, 'my pending invitations', bea), lectura(eje, 'my pairings', bea)], [['Libro inventado'], ['Otro libro'], ['Portátil inventado']]);
  assert.ok(ofrece(eje, libro.id, 1, 'bea').includes(LIBRO), 'sobre la vieja, a su autora');
  assert.ok(!ofrece(eje, libro.id, 1, 'ana').includes(LIBRO));
  const nueva = await hacer(eje, LIBRO, libro.id, { name: 'Libro renombrado' }, 'bea');
  assert.deepEqual([nueva.sobre, nueva.en, nueva.payload[1], nueva.payload[5]], [libro.id, '1000000000', [[ID]], [[OTRO]]], 'los defectos son los de la vieja');
  assert.deepEqual(lectura(eje, 'my books', bea), ['Libro renombrado'], 'manda la última');
  // Retirar: «close» de la 0 pide algo anunciado (no se ofrece); «close by decision», sí.
  const cuatro = ofrece(eje, par.id, 4, 'bea');
  assert.ok(!cuatro.includes('close') && cuatro.includes('close by decision'), JSON.stringify(cuatro));
  await hacer(eje, 'close by decision', par.id, {}, 'bea');
  assert.deepEqual(lectura(eje, 'my pairings', bea), [], 'revocado');
  // Aceptar la invitación es tener un libro mío con su 5.0: deja de estar pendiente.
  await hacer(eje, LIBRO, bea, { name: 'Otro libro', 'my alta there': ID, book: OTRO2 }, 'bea');
  assert.deepEqual([lectura(eje, 'my books', bea), lectura(eje, 'my pending invitations', bea)], [['Libro renombrado', 'Otro libro'], []]);
  assert.deepEqual(lectura(eje, 'my books', eje.alta('ana').id), [], 'las de otra, no');
});

test('la guía de inicio: el tutorial del alta enseña los pasos nuevos detrás de los de la 0 y los da por hechos al escribirlos', async () => {
  const eje = await cuenta();
  const bea = eje.alta('bea').id;
  const pasos = async () => Object.fromEntries((await A.camino(eje, bea, 'bea', { t: T })).pasos.filter((p) => p.fuente === 'tutorial').map((p) => [p.hacer?.plantilla ?? p.regla, p.hecho]));
  const antes = await pasos();
  assert.deepEqual(Object.keys(antes), [AVISO, 'a key is declared at its alta', 'set a group price', 'anchor here', EMPAREJAMIENTO, LIBRO]);
  assert.equal(antes[AVISO], null, 'el aviso no tiene «hecho»: ninguna condición del libro lo cumple, queda siempre a la vista');
  assert.deepEqual([antes[EMPAREJAMIENTO], antes[LIBRO]], [false, false]);
  await hacer(eje, EMPAREJAMIENTO, bea, { name: 'Móvil inventado', 'session key': CLAVE, relay: 'https://rele.invalid' }, 'bea');
  await hacer(eje, LIBRO, bea, { name: 'Libro inventado', 'my alta there': ID, book: OTRO }, 'bea');
  const despues = await pasos();
  assert.deepEqual([despues[EMPAREJAMIENTO], despues[LIBRO]], [true, true]);
});

test('la guía de inicio avisa, el primero, de que la cuenta vive solo en el dispositivo: dato de la época, en es y en en; sin condición de hecho; no escribe nada', async () => {
  const eje = await cuenta();
  const ana = eje.alta('ana').id;
  const epoca = eje.epoca();
  const orden = epoca.registro[3][0][9];
  assert.equal(orden[orden.indexOf(AVISO) - 1], 'cómo: su guía', 'el primer paso tras la etiqueta del tutorial');
  assert.equal(orden.indexOf('a key is declared at its alta'), orden.indexOf(AVISO) + 1, 'delante de los demás pasos');
  const aviso = async (idioma) => (await A.camino(eje, ana, 'ana', { t: T, idioma })).pasos.filter((p) => p.fuente === 'tutorial')[0];
  const es = await aviso('es');
  assert.deepEqual([es.regla, es.hacer, es.hecho, es.falta], [AVISO, null, null, 'tu cuenta está solo aquí: haz un respaldo o únete a un nodo']);
  const en = await aviso('en');
  assert.deepEqual([en.regla, en.hacer, en.hecho], [AVISO, null, null]);
  assert.equal(en.falta, AVISO + ': your account is only here: make a backup or join a node', 'el canónico en inglés (la carta le quita el nombre interno delante)');
  // Es una lectura: ni escribe ni rechaza nada y no se ofrece como acción.
  const antesDeLeer = eje.orden.length;
  await aviso('es');
  assert.equal(eje.orden.length, antesDeLeer, 'el aviso no escribe');
  assert.ok(!ofrece(eje, ana, 9, 'ana').includes(AVISO));
  // Escribir lo demás no lo da por hecho: sigue a la vista.
  await hacer(eje, EMPAREJAMIENTO, ana, { name: 'Móvil inventado', 'session key': CLAVE, relay: 'https://rele.invalid' }, 'ana');
  assert.equal((await aviso('es')).hecho, null);
  // La otra mitad: el aviso viene del DATO. En una copia de la época sin el nombre en el 9, el tutorial no lo trae.
  const sin = JSON.parse(JSON.stringify(epocaCuenta()));
  const raizDelAlta = sin.raiz[3][0];
  raizDelAlta[raizDelAlta.length - 1] = raizDelAlta.at(-1).filter((n) => n !== AVISO);
  const ejeSin = await Eje.genesis({ identidad: 'ana', foco: 'cuenta inventada', t: T, epoca: sin, demostracion: true });
  assert.ok(!(await A.camino(ejeSin, ejeSin.alta('ana').id, 'ana', { t: T })).pasos.some((p) => p.regla === AVISO));
});
