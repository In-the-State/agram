// Las zonas de la cara y la guía mínima (Core AGRAM 17-11; agram-equipo/DISENO_ZONAS_GUIA.md, pieza 1; VG 17-11 por Core
// State): la época hija del libro de la guía (datos/epocas/guia-libro/), con sus dos plantillas, y las lecturas puras de
// src/guia-libro.js (docs/CONTRATO.md §12.8). Todo inventado: libros en memoria, de demostración.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { generar, archivos, epocaGuiaLibro } from '../datos/epocas/guia-libro/generar.mjs';
import * as state from '../datos/epocas/state/generar.mjs';
import { EPOCA_0_BTML, cargarEpocaEscrita } from '../src/epocas.js';
import { Eje } from '../src/eje.js';
import { validarPayload } from '../src/btml.js';
import * as A from '../src/acciones.js';
import * as contrato from '../src/contrato.js';
import { zonas, pasosDeGuia, guias, pasoHecho, sugerenciasDeGuia, TOPES_DE_ZONA } from '../src/guia-libro.js';
import { sinTraducir } from '../docs/sin-traducir.mjs';
import { escribirPagando, pagaElCoste } from '../ejemplos/ikisai/coste.mjs';

/** El id de la época 0 definitiva (no cambia con esta época). */
const ID_DE_LA_0 = '7c1d49087209c41e03a38ef5e1c6aec6007a7515d1030f37ddea13e8a35a8448';
const ZONA = 'a zone of the face';
const PASO = 'a step of the guide';
const T = '2026-11-17T10:00:00Z';
const OTRO_LIBRO = 'cd'.repeat(32);
const NO_ESTA = 'ab'.repeat(32);

/** Un libro de demostración (con la época dada, o la 0), su autora y una lectora invitada. */
async function libro(epoca, autora = 'autora', lectora = 'lectora') {
  const eje = await Eje.genesis({ identidad: autora, foco: 'libro de prueba', t: T, emision: [{ token: 'R', cantidad: 10 }], ...(epoca ? { epoca } : {}), demostracion: true });
  if (lectora) await eje.aceptar(await eje.invitar({ autor: autora, invitado: lectora, t: T }), {}, { t: T });
  return eje;
}

/** Lanza una plantilla como `quien` y la asienta; falla si no pasa. */
async function hacer(eje, nombre, X, params, quien) {
  const r = await A.transaccion(eje, nombre, { X, ...params }, quien, { t: T });
  assert.ok(r.ok, nombre + ': ' + JSON.stringify(r.motivos));
  return eje.anadir(r.evento);
}

/** El libro de la guía: la autora, una guía (un elemento suyo) y un destino. */
async function libroDeLaGuia() {
  const eje = await libro(epocaGuiaLibro());
  const guia = await hacer(eje, 'anchor here', eje.genesisId, { title: 'Primeros pasos' }, 'autora');
  const destino = await hacer(eje, 'anchor here', eje.genesisId, { title: 'Un destino' }, 'autora');
  return { eje, guia, destino };
}

const CAJA = { x: 100, y: 700, width: 300, height: 120 };

test('la época se genera desde su fuente, sin fallos, y los archivos están al día; hereda de la 0 definitiva; src/ no la importa', () => {
  const g = generar();
  assert.equal(g.fallos, 0, g.informe.join('\n'));
  for (const [ruta, texto] of Object.entries(archivos(g))) assert.equal(readFileSync(ruta, 'utf8'), texto, `${ruta} no está al día: npm run epoca:guia-libro`);
  assert.deepEqual(g.plantillas.map((p) => [p.nombre, p.ocho]), [[ZONA, [2, 13]], [PASO, [4, 29]]]);
  assert.equal(JSON.parse(readFileSync('datos/epocas/guia-libro/guia-libro-0.ids.json', 'utf8')).registrosAlPublicar, 4, 'el génesis, la raíz y sus dos plantillas');
  assert.equal(EPOCA_0_BTML.id, ID_DE_LA_0, 'la época 0 sigue siendo la definitiva');
  assert.equal(g.hereda, ID_DE_LA_0);
  const e = cargarEpocaEscrita(epocaGuiaLibro());
  assert.equal(e.id, g.id);
  // Sus dos plantillas son suyas (no las provisionales que irán a la 0, VG 18-11: las suyas les ganan por nombre).
  const propias = (x) => x.transacciones.filter((t) => !t.provisional);
  assert.equal(propias(e).length, propias(EPOCA_0_BTML).length + 2);
  for (const n of [ZONA, PASO]) assert.ok(propias(e).some((t) => t.plantilla[0][0] === n) && !e.transacciones.some((t) => t.provisional && t.plantilla[0][0] === n), n);
  assert.equal(e.reglasConId.length, EPOCA_0_BTML.reglasConId.length, 'no trae reglas');
  const fuentes = readdirSync('src').filter((f) => f.endsWith('.js')).map((f) => readFileSync(join('src', f), 'utf8'));
  assert.ok(!fuentes.some((s) => /(from|import)\s*\(?\s*['"][^'"]*(epocas\/guia-libro|guia-libro-0)/.test(s)), 'la época no viaja con el núcleo (#115): src/ no la importa');
  // El generador es el de toda hija (datos/epocas/hija.mjs): la época state sigue saliendo igual, byte a byte.
  for (const [ruta, texto] of Object.entries(state.archivos(state.generar()))) assert.equal(readFileSync(ruta, 'utf8'), texto, ruta);
});

test('todo nombre de la época tiene su texto en español (sin-traducir limpio con esta época) y la 0 sigue limpia', () => {
  const epoca = cargarEpocaEscrita(epocaGuiaLibro());
  assert.deepEqual(sinTraducir('es', { epoca }).map((x) => x.clave), []);
  assert.deepEqual(sinTraducir('es').map((x) => x.clave), []);
  assert.equal(contrato.texto(null, 'template ' + ZONA, 'es', { epoca }), 'una zona de la cara');
  assert.equal(contrato.texto(null, 'template ' + PASO, 'es', { epoca }), 'un paso de la guía');
});

test('la oferta: las dos plantillas solo al autor del elemento, en modo persona; la zona en el 0 y el paso en el 4; no mueven más que el coste', async () => {
  const { eje, guia } = await libroDeLaGuia();
  const nombres = (pv, quien) => A.acciones(eje, guia.id, pv, quien).map((a) => a.nombre);
  assert.ok(nombres(2, 'autora').includes(ZONA));
  assert.ok(nombres(4, 'autora').includes(PASO));
  assert.ok(!nombres(2, 'lectora').includes(ZONA), 'a otra persona, no');
  assert.ok(!nombres(4, 'lectora').includes(PASO), 'a otra persona, no');
  for (const n of [ZONA, PASO]) {
    assert.equal(A.modoDeEjecucion(eje, n).modo, 'person');
    assert.deepEqual(A.plantillaDeTransaccion(n, { epoca: eje.epoca() })[4], ['write']);
  }
  const z = await A.transaccion(eje, ZONA, { X: guia.id, label: 'Empieza', ...CAJA, record: guia.id }, 'autora', { t: T });
  assert.ok(z.ok, JSON.stringify(z.motivos));
  assert.deepEqual([z.evento.sobre, z.evento.en], [guia.id, '0000000000']);
  assert.deepEqual(z.evento.payload, [['Empieza'], [[100], [700], [300], [120]], ['all announced movements happened'], ['autora'], [ZONA], [[eje.genesisId], [guia.id]]]);
  assert.ok(z.evento.movimientos.every((m) => m.token === 'T' && m.de === 'autora' && m.a === null), 'solo el coste de escribir');
  const p = await A.transaccion(eje, PASO, { X: guia.id, title: 'Ancla una nota', action: 'anchor here', parameters: ['title: hola'], why: 'para ver cómo se escribe' }, 'autora', { t: T });
  assert.ok(p.ok, JSON.stringify(p.motivos));
  assert.deepEqual([p.evento.sobre, p.evento.en], [guia.id, '4000000000']);
  assert.deepEqual(p.evento.payload, [['Ancla una nota'], [['anchor here'], ['title: hola']], ['para ver cómo se escribe'], ['autora'], [PASO], [[eje.genesisId]]]);
  for (const ev of [z.evento, p.evento]) assert.deepEqual(validarPayload(ev.payload), { ok: true, errores: [] });
  // En un libro de la época 0 a secas, las provisionales (VG 18-11: irán a la 0 en su pasada única; src/provisional.js):
  // las mismas, salvo su procedencia (6) y su época (7), y se lanzan igual.
  const cero = await libro(null);
  for (const n of [ZONA, PASO]) {
    const propia = A.plantillaDeTransaccion(n, { epoca: eje.epoca() });
    const provisional = A.plantillaDeTransaccion(n, { epoca: cero.epoca() });
    assert.ok(cero.epoca().transacciones.find((t) => t.plantilla === provisional)?.provisional, n);
    assert.deepEqual(provisional[7], ['epoch 0']);
    assert.deepEqual([...provisional.slice(0, 6), provisional[8], provisional[9]], [...propia.slice(0, 6), propia[8], propia[9]], n);
  }
  const z0 = await A.transaccion(cero, ZONA, { X: cero.genesisId, label: 'x', ...CAJA, record: cero.genesisId }, 'autora', { t: T });
  assert.ok(z0.ok, JSON.stringify(z0.motivos));
});

test('la zona: la etiqueta, la caja y el destino se validan en la plantilla, con sus rechazos', async () => {
  const { eje, guia, destino } = await libroDeLaGuia();
  const prueba = async (cambios) => A.transaccion(eje, ZONA, { X: guia.id, label: 'Empieza', ...CAJA, record: destino.id, ...cambios }, 'autora', { t: T });
  const pasa = async (que, cambios) => assert.ok((await prueba(cambios)).ok, que);
  const falla = async (que, cambios, parametro) => {
    const r = await prueba(cambios);
    assert.equal(r.ok, false, que);
    if (parametro) assert.ok(r.motivos.some((m) => m.parametro === parametro), que + ': ' + JSON.stringify(r.motivos));
  };
  // La etiqueta: texto llano de 1 a 40 bytes de UTF-8.
  await pasa('40 letras', { label: 'x'.repeat(40) });
  await pasa('20 con tilde (40 bytes)', { label: 'á'.repeat(20) });
  await falla('41 letras', { label: 'x'.repeat(41) }, 'label');
  await falla('21 con tilde', { label: 'á'.repeat(21) }, 'label');
  await falla('vacía', { label: '' }, 'label');
  // La caja: enteros de 0 a 1000; ancho y alto de 60 como poco; sin salirse de la cara; o toda a cero.
  await pasa('la mínima en la esquina', { x: 940, y: 940, width: 60, height: 60 });
  await pasa('toda a cero (retira)', { x: 0, y: 0, width: 0, height: 0 });
  await falla('ancho 59', { width: 59 }, 'width');
  await falla('alto 59', { height: 59 }, 'height');
  await falla('x + ancho > 1000', { x: 800, width: 300 }, 'width');
  await falla('y + alto > 1000', { y: 900, height: 120 }, 'height');
  await falla('decimal', { x: 10.5 }, 'x');
  await falla('negativo', { y: -1 }, 'y');
  await falla('más de 1000', { x: 1001 }, 'x');
  await falla('medio cero', { x: 0, y: 0, width: 0, height: 100 }, 'width');
  await falla('cero con x', { x: 5, y: 0, width: 0, height: 0 }, 'width');
  await falla('texto en un número', { x: 'cien' });
  // El destino: dos ids de 64 hexadecimales, como datos; en este libro, ha de estar.
  await pasa('otro libro', { book: OTRO_LIBRO, record: NO_ESTA });
  await falla('un registro de este libro que no está', { record: NO_ESTA }, 'record');
  await falla('una dirección', { record: 'https://ejemplo.invalid/' }, 'record');
  await falla('javascript', { record: 'javascript:alert(1)' }, 'record');
  await falla('mayúsculas', { record: destino.id.toUpperCase() }, 'record');
  await falla('corto', { record: destino.id.slice(0, 63) }, 'record');
  await falla('texto en el libro', { book: 'el otro libro', record: NO_ESTA }, 'book');
  await falla('sin destino', { record: undefined }, 'record');
  await falla('quién es otra', { who: 'lectora' }, 'who');
});

test('las zonas: solo las del autor, con su forma; sustituir y retirar escribiendo sobre la zona; lo escrito a mano mal no sale', async () => {
  const { eje, guia, destino } = await libroDeLaGuia();
  const z1 = await hacer(eje, ZONA, guia.id, { label: 'Empieza', ...CAJA, record: destino.id }, 'autora');
  const z2 = await hacer(eje, ZONA, guia.id, { label: 'Fuera', x: 500, y: 100, width: 200, height: 200, book: OTRO_LIBRO, record: NO_ESTA }, 'autora');
  assert.deepEqual(zonas(eje, guia.id), [
    { id: z1.id, origen: z1.id, etiqueta: 'Empieza', caja: [100, 700, 300, 120], destino: { libro: null, registro: destino.id } },
    { id: z2.id, origen: z2.id, etiqueta: 'Fuera', caja: [500, 100, 200, 200], destino: { libro: OTRO_LIBRO, registro: NO_ESTA } },
  ]);
  // La de otra persona entra en el libro (cualquiera escribe) pero no cuenta: nadie pone botones sobre la cara de otro.
  await hacer(eje, ZONA, guia.id, { label: 'Ajena', ...CAJA, record: destino.id }, 'lectora');
  assert.equal(zonas(eje, guia.id).length, 2);
  // Sustituir: la nueva sobre la vieja (ancla: la zona); sus defectos son los de la vieja, así que mover es cambiar un número.
  const movida = await hacer(eje, ZONA, z1.id, { x: 50 }, 'autora');
  assert.deepEqual([movida.sobre, movida.en], [z1.id, '0000000000']);
  assert.deepEqual(zonas(eje, guia.id)[0], { id: movida.id, origen: z1.id, etiqueta: 'Empieza', caja: [50, 700, 300, 120], destino: { libro: null, registro: destino.id } });
  // Sobre la vieja otra vez: manda la más reciente; la de otra persona sobre la zona no cuenta.
  const otra = await hacer(eje, ZONA, z1.id, { label: 'Empieza ya' }, 'autora');
  await hacer(eje, ZONA, otra.id, { label: 'Secuestrada' }, 'lectora');
  assert.deepEqual(zonas(eje, guia.id).map((z) => [z.id, z.etiqueta, z.caja[0]]), [[otra.id, 'Empieza ya', 100], [z2.id, 'Fuera', 500]]);
  // Retirar: la caja a cero sobre la zona (sobre la última versión o sobre la primera, da igual).
  await hacer(eje, ZONA, z2.id, { x: 0, y: 0, width: 0, height: 0 }, 'autora');
  assert.deepEqual(zonas(eje, guia.id).map((z) => z.origen), [z1.id]);
  // Una zona no tiene cara.
  assert.deepEqual(zonas(eje, z1.id), []);
  // Lo escrito a mano: con forma inválida no sale (la lectura vuelve a validar).
  const amano = async (payload) => escribirPagando(eje, { autor: 'autora', sobre: guia.id, en: '0000000000', t: T, movimientos: [pagaElCoste('autora')], payload });
  const base = (cambios) => Object.assign([['Mano'], [[10], [10], [100], [100]], ['all announced movements happened'], ['autora'], [ZONA], [[eje.genesisId], [destino.id]]], cambios);
  await amano(base({ 5: [['https://ejemplo.invalid/']] }));
  await amano(base({ 5: [[eje.genesisId], [NO_ESTA]] }));
  await amano(base({ 1: [[10], [10], [30], [100]] }));
  await amano(base({ 0: ['x'.repeat(41)] }));
  await amano(base({ 5: ['libre'] }));
  assert.deepEqual(zonas(eje, guia.id).map((z) => z.etiqueta), ['Empieza ya'], 'ninguna de las mal formadas sale');
  // Una referencia a un registro de este libro también es un destino.
  const ref = await amano(base({ 0: ['Por referencia'], 5: [{ ref: destino.id }] }));
  assert.deepEqual(zonas(eje, guia.id).at(-1), { id: ref.id, origen: ref.id, etiqueta: 'Por referencia', caja: [10, 10, 100, 100], destino: { libro: null, registro: destino.id } });
  // Una sustitución mal formada no tapa la buena.
  await escribirPagando(eje, { autor: 'autora', sobre: ref.id, en: '0000000000', t: T, movimientos: [pagaElCoste('autora')], payload: base({ 0: ['x'.repeat(41)] }) });
  assert.equal(zonas(eje, guia.id).at(-1).id, ref.id);
});

test('el tope: 24 zonas por elemento, las más recientes, en el orden en que nacieron', async () => {
  const { eje, guia, destino } = await libroDeLaGuia();
  const hechas = [];
  for (let i = 0; i < TOPES_DE_ZONA.porElemento + 2; i++) hechas.push(await hacer(eje, ZONA, guia.id, { label: 'Z' + i, x: 10 * i, y: 0, width: 60, height: 60, record: destino.id }, 'autora'));
  assert.deepEqual(zonas(eje, guia.id).map((z) => z.etiqueta), hechas.slice(2).map((_, i) => 'Z' + (i + 2)));
  // Retocar una vieja la hace reciente: vuelve, y sale la más antigua de las que quedaban; sigue en su sitio.
  await hacer(eje, ZONA, hechas[0].id, { y: 10 }, 'autora');
  const ahora = zonas(eje, guia.id).map((z) => z.etiqueta);
  assert.equal(ahora.length, TOPES_DE_ZONA.porElemento);
  assert.deepEqual([ahora[0], ahora.includes('Z2'), ahora.includes('Z3')], ['Z0', false, true]);
});

test('los pasos de la guía: en el orden en que se escribieron, solo los del autor; las guías del libro', async () => {
  const { eje, guia, destino } = await libroDeLaGuia();
  assert.deepEqual(guias(eje), []);
  const p1 = await hacer(eje, PASO, guia.id, { title: 'Anota algo', action: 'anchor here', parameters: ['title: mi nota', 'content: una nota'], why: 'el primer registro' }, 'autora');
  const p2 = await hacer(eje, PASO, guia.id, { title: 'En otro libro', action: 'anchor here', why: 'el libro del roadmap', book: OTRO_LIBRO, record: NO_ESTA }, 'autora');
  const p3 = await hacer(eje, PASO, guia.id, { title: 'Sobre el destino', action: 'anchor here', why: 'un registro de aquí', record: destino.id }, 'autora');
  await hacer(eje, PASO, guia.id, { title: 'Ajeno', action: 'anchor here', why: 'no cuenta' }, 'lectora');
  // Los parámetros nacen sin prototipo (revisión de seguridad): se comparan como objeto corriente.
  const planos = (lista) => lista.map((p) => ({ ...p, parametros: { ...p.parametros } }));
  assert.ok(pasosDeGuia(eje, guia.id).every((p) => Object.getPrototypeOf(p.parametros) === null));
  assert.deepEqual(planos(pasosDeGuia(eje, guia.id)), [
    { id: p1.id, titulo: 'Anota algo', libro: null, accion: 'anchor here', sobre: null, parametros: { title: 'mi nota', content: 'una nota' }, porque: 'el primer registro' },
    { id: p2.id, titulo: 'En otro libro', libro: OTRO_LIBRO, accion: 'anchor here', sobre: NO_ESTA, parametros: {}, porque: 'el libro del roadmap' },
    { id: p3.id, titulo: 'Sobre el destino', libro: null, accion: 'anchor here', sobre: destino.id, parametros: {}, porque: 'un registro de aquí' },
  ]);
  // Un elemento con pasos solo de otra persona no es una guía.
  const suyo = await hacer(eje, 'anchor here', eje.genesisId, { title: 'De la autora' }, 'autora');
  await hacer(eje, PASO, suyo.id, { title: 'Ajeno', action: 'anchor here', why: 'no cuenta' }, 'lectora');
  assert.deepEqual(guias(eje), [{ id: guia.id, titulo: 'Primeros pasos' }]);
  // El paso no puede apuntar a un registro de este libro que no está.
  assert.equal((await A.transaccion(eje, PASO, { X: guia.id, title: 'x', action: 'anchor here', why: 'x', record: NO_ESTA }, 'autora', { t: T })).ok, false);
});

test('un paso hecho y no hecho: la regla del tutorial, leída en el libro donde se hace (también otro libro, dos ejes en memoria)', async () => {
  const { eje, guia } = await libroDeLaGuia();
  const roadmap = await libro(null, 'duena', 'lectora');
  const p1 = await hacer(eje, PASO, guia.id, { title: 'Anota algo', action: 'anchor here', parameters: ['title: mi nota'], why: 'el primer registro' }, 'autora');
  await hacer(eje, PASO, guia.id, { title: 'En el roadmap', action: 'anchor here', parameters: ['title: hito'], why: 'tu primer hito', book: roadmap.genesisId }, 'autora');
  const [aqui, alla] = pasosDeGuia(eje, guia.id);
  assert.equal(aqui.id, p1.id);
  assert.equal(pasoHecho(eje, aqui, 'lectora'), false);
  assert.equal(pasoHecho(roadmap, alla, 'lectora'), false);
  assert.equal(pasoHecho(eje, alla, 'lectora'), false, 'en otro libro que el suyo, no');
  // La acción real, en cada libro, sobre el alta de quien sigue la guía.
  await hacer(eje, 'anchor here', eje.alta('lectora').id, { title: 'mi nota' }, 'lectora');
  assert.equal(pasoHecho(eje, aqui, 'lectora'), true);
  assert.equal(pasoHecho(roadmap, alla, 'lectora'), false);
  await hacer(roadmap, 'anchor here', roadmap.alta('lectora').id, { title: 'hito' }, 'lectora');
  assert.equal(pasoHecho(roadmap, alla, 'lectora'), true);
  // Las sugerencias en el otro libro: el paso que le toca, con su guía y hecho.
  const s = sugerenciasDeGuia(eje, roadmap, roadmap.alta('lectora').id, 'lectora');
  assert.deepEqual(s.map((x) => ({ ...x, parametros: { ...x.parametros } })), [{ plantilla: 'anchor here', sobre: roadmap.alta('lectora').id, porque: 'tu primer hito', id: alla.id, guia: 'Primeros pasos', parametros: { title: 'hito' }, hecho: true }]);
  const hito = await hacer(roadmap, 'anchor here', roadmap.alta('lectora').id, { title: 'otro registro' }, 'lectora');
  assert.deepEqual(sugerenciasDeGuia(eje, roadmap, hito.id, 'lectora'), [], 'sobre otro registro, nada');
});

test('una acción que no existe en la época del libro abierto, o un parámetro que no pide, sale inválida con su motivo; no se descarta', async () => {
  const { eje, guia } = await libroDeLaGuia();
  const roadmap = await libro(null, 'duena', 'lectora');
  await hacer(eje, PASO, guia.id, { title: 'Algo de otro libro', action: 'something of another book', why: 'allí no existe', book: roadmap.genesisId }, 'autora');
  await hacer(eje, PASO, guia.id, { title: 'Mal dicho', action: 'anchor here', parameters: ['color: rojo'], why: 'no lo pide', book: roadmap.genesisId }, 'autora');
  const s = sugerenciasDeGuia(eje, roadmap, roadmap.alta('lectora').id, 'lectora', { idioma: 'es' });
  assert.equal(s.length, 2);
  assert.match(s[0].invalida, /plantilla de transacción desconocida: something of another book/);
  assert.match(s[1].invalida, /color: la acción anchor here no lo pide/);
  assert.ok(s.every((x) => x.guia === 'Primeros pasos' && x.parametros === undefined));
  const { pasos } = await A.camino(roadmap, roadmap.alta('lectora').id, 'lectora', { sugerencias: (e, ev, yo) => sugerenciasDeGuia(eje, e, ev, yo, { idioma: 'es' }) });
  const inv = pasos.filter((p) => p.fuente === 'sugerencia');
  assert.equal(inv.length, 2);
  assert.ok(inv.every((p) => p.hacer === null && p.invalida && p.guia === 'Primeros pasos'));
});

test('un libro con la época 0 a secas: las lecturas encuentran las plantillas provisionales (VG 18-11: irán a la 0), también con registros escritos a mano', async () => {
  const cero = await libro(null);
  const el = await hacer(cero, 'anchor here', cero.genesisId, { title: 'Elemento' }, 'autora');
  await escribirPagando(cero, { autor: 'autora', sobre: el.id, en: '0000000000', t: T, movimientos: [pagaElCoste('autora')], payload: [['Mano'], [[10], [10], [100], [100]], ['all announced movements happened'], ['autora'], [ZONA], [[cero.genesisId], [el.id]]] });
  await escribirPagando(cero, { autor: 'autora', sobre: el.id, en: '4000000000', t: T, movimientos: [pagaElCoste('autora')], payload: [['Paso'], [['anchor here']], ['porque'], ['autora'], [PASO]] });
  // Antes (sin las provisionales) todo daba lista vacía; ahora la zona y el paso escritos a mano se leen con su forma.
  assert.deepEqual(zonas(cero, el.id).map((z) => [z.etiqueta, z.caja, z.destino]), [['Mano', [10, 10, 100, 100], { libro: null, registro: el.id }]]);
  assert.deepEqual(pasosDeGuia(cero, el.id).map((p) => [p.titulo, p.accion, p.porque]), [['Paso', 'anchor here', 'porque']]);
  assert.deepEqual(guias(cero), [{ id: el.id, titulo: 'Elemento' }]);
  assert.deepEqual(sugerenciasDeGuia(cero, cero, cero.alta('lectora').id, 'lectora').map((s) => [s.plantilla, s.guia, s.hecho]), [['anchor here', 'Elemento', false]]);
  assert.deepEqual(contrato.zonas(cero, 'no-es-un-id'), [], 'sin X, nada');
});

test('el camino completo: el paso de la guía sale en la tercera fuente con su porqué y su guía, y sale hecho después de escribir la acción real', async () => {
  const { eje, guia } = await libroDeLaGuia();
  await hacer(eje, PASO, guia.id, { title: 'Anota algo', action: 'anchor here', parameters: ['title: mi nota', 'content: una nota'], why: 'el primer registro' }, 'autora');
  const alta = eje.alta('lectora').id;
  const sugerencias = (e, ev, yo) => contrato.sugerenciasDeGuia(eje, e, ev, yo);
  const delaGuia = async () => (await A.camino(eje, alta, 'lectora', { sugerencias, t: T })).pasos.filter((p) => p.fuente === 'sugerencia');
  const [antes] = await delaGuia();
  assert.equal(antes.porque, 'el primer registro');
  assert.equal(antes.guia, 'Primeros pasos');
  assert.equal(antes.hecho, false);
  assert.equal(antes.pasa, true, JSON.stringify(antes.motivos));
  assert.deepEqual([antes.hacer.plantilla, antes.hacer.X, antes.hacer.parametros.title, antes.hacer.parametros.content], ['anchor here', alta, 'mi nota', 'una nota']);
  // Lanzar el paso es el gesto de siempre: la transacción con sus parámetros, firmada por quien la lanza.
  await hacer(eje, antes.hacer.plantilla, antes.hacer.X, antes.hacer.parametros, 'lectora');
  const [despues] = await delaGuia();
  assert.equal(despues.hecho, true);
  // Una propuesta importada (sin `hecho`) sigue saliendo sin hacer, como siempre.
  const { pasos } = await A.camino(eje, alta, 'lectora', { sugerencias: () => [{ plantilla: 'anchor here', parametros: { title: 'otra' }, porque: 'de fuera' }], t: T });
  assert.equal(pasos.find((p) => p.fuente === 'sugerencia').hecho, false);
});

// ---------- revisión de seguridad de la pieza 2 ----------

test('solo mis guías: la guía que escribe otro miembro del libro, con un paso hacia mi libro, no sale con «autor»; sin él, sí (el servidor de retoques comprueba así)', async () => {
  const { eje, guia } = await libroDeLaGuia();
  const mio = await libro(null, 'autora', 'lectora');
  await hacer(eje, PASO, guia.id, { title: 'Lo mío', action: 'anchor here', parameters: ['title: hito'], why: 'mi guía', book: mio.genesisId }, 'autora');
  // La lectora, miembro del libro de la guía, escribe su propio elemento y un paso que apunta a mi libro.
  const trampa = await hacer(eje, 'anchor here', eje.alta('lectora').id, { title: 'Trampa' }, 'lectora');
  await hacer(eje, PASO, trampa.id, { title: 'Firma esto', action: 'anchor here', parameters: ['title: dame'], why: 'confía', book: mio.genesisId }, 'lectora');
  assert.deepEqual(guias(eje).map((g) => g.titulo), ['Primeros pasos', 'Trampa'], 'sin autor, todas (para comprobar)');
  assert.deepEqual(guias(eje, { autor: 'autora' }).map((g) => g.titulo), ['Primeros pasos']);
  const alta = mio.alta('autora').id;
  assert.deepEqual(sugerenciasDeGuia(eje, mio, alta, 'autora').map((s) => s.guia), ['Primeros pasos', 'Trampa']);
  assert.deepEqual(sugerenciasDeGuia(eje, mio, alta, 'autora', { autor: 'autora' }).map((s) => s.guia), ['Primeros pasos'], 'la de otra persona no se me ofrece');
  assert.deepEqual(sugerenciasDeGuia(eje, mio, alta, 'autora', { autor: 'nadie' }), []);
  // El tope corta al recorrer.
  assert.equal(sugerenciasDeGuia(eje, mio, alta, 'autora', { tope: 1 }).length, 1);
  assert.equal(sugerenciasDeGuia(eje, mio, alta, 'autora', { tope: 0 }).length, 0);
});

test('los parámetros de un paso no tienen prototipo: «__proto__» y «constructor» son claves suyas y no tocan nada', async () => {
  const { eje, guia } = await libroDeLaGuia();
  await hacer(eje, PASO, guia.id, { title: 'Raro', action: 'anchor here', parameters: ['__proto__: x', 'constructor: y', 'title: z'], why: 'probar' }, 'autora');
  const [p] = pasosDeGuia(eje, guia.id);
  assert.equal(Object.getPrototypeOf(p.parametros), null);
  assert.deepEqual(Object.keys(p.parametros), ['__proto__', 'constructor', 'title']);
  assert.equal(p.parametros.__proto__, 'x');
  assert.equal(({}).polucion, undefined);
  assert.equal(typeof ({}).constructor, 'function', 'Object.prototype intacto');
  const [s] = sugerenciasDeGuia(eje, eje, eje.alta('lectora').id, 'lectora', { idioma: 'es' });
  assert.match(s.invalida, /__proto__/, 'la acción no lo pide: sale inválido, sin más');
  // Lo que se copia o se serializa sigue funcionando.
  assert.equal(JSON.stringify(p.parametros), '{"__proto__":"x","constructor":"y","title":"z"}');
});

test('la etiqueta de una zona y el título de un paso con caracteres de control o de dirección del texto no salen; un emoji con ZWJ sí', async () => {
  const { eje, guia, destino } = await libroDeLaGuia();
  const amano = (en, payload) => escribirPagando(eje, { autor: 'autora', sobre: guia.id, en, t: T, movimientos: [pagaElCoste('autora')], payload });
  const zona = (etiqueta) => [[etiqueta], [[100], [100], [200], [200]], ['all announced movements happened'], ['autora'], [ZONA], [[eje.genesisId], [destino.id]]];
  await amano('0000000000', zona('pagar‮ofni'));
  await amano('0000000000', zona('salto\u0007'));
  await amano('0000000000', zona('aisla⁦x⁩'));
  await amano('0000000000', zona('👩‍💻 Hola'));
  assert.deepEqual(zonas(eje, guia.id).map((z) => z.etiqueta), ['👩‍💻 Hola']);
  const paso = (titulo) => [[titulo], [['anchor here']], ['porque'], ['autora'], [PASO]];
  await amano('4000000000', paso('Firma‏esto'));
  await amano('4000000000', paso('línea\nnueva'));
  await amano('4000000000', paso('🧑‍🌾 Bien'));
  assert.deepEqual(pasosDeGuia(eje, guia.id).map((p) => p.titulo), ['🧑‍🌾 Bien']);
});
