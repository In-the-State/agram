// Remates de la carta (encargo «carta: remates», 16-11): el 0 legible (#83: el 0 de lo escrito por plantilla, en el idioma
// de quien mira), las preferencias de formato en el libro (#93), el paso del camino (núcleo), el número del rosetón (#91),
// el arte propio sin marco general (#25) y ningún <svg> de datos en el documento en animado (SEG-15).
// Lo visual está en las capturas de equipo/mockups/capturas/beta-remates.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as A from '../src/acciones.js';
import * as C from '../src/contrato.js';
import { arbol, ceroDe, preferencias, sinNombreInterno, NIVEL } from '../carta/carta.js';
import { html } from '../carta/dom.js';
import { formatoDeLibro, formatoValido, registroDeFormato, olvidarFormatoLocal, editorDeBtml, CLAVES_DE_FORMATO } from '../carta/formato-btml.js';
import { TEXTOS } from '../carta/textos.js';
import { ejemploCompra } from '../ejemplos/ikisai/compra-food.mjs';
import { pagaElCoste } from './ayudas-coste.js';
import { sinArte } from './ayudas-arte.js';

const T1 = '2026-11-08T12:00:00Z';
const ORDENADOR = { ancho: 1200, alto: 800 };
const GRANDE = { ancho: 1920, alto: 1080 };
const MOVIL = { ancho: 390, alto: 844 };
const APP = readFileSync(new URL('../carta/app.js', import.meta.url), 'utf8');
const CSS = readFileSync(new URL('../carta/estilo.css', import.meta.url), 'utf8');

async function escribir(eje, plantilla, params, yo) {
  const r = await A.transaccion(eje, plantilla, params, yo, { t: T1 });
  assert.ok(r.ok, plantilla + ': ' + JSON.stringify(r.motivos));
  await eje.anadir(r.evento);
  return r.evento;
}
/** Dos registros escritos por plantilla (uno sobre el menú, otro sobre ese) y uno escrito a mano que nombra la misma plantilla. */
async function conAdjuntos() {
  const m = await ejemploCompra();
  const adjunto = await escribir(m.eje, 'attach a file', { X: m.menu.id, file: 'archivo:' + 'a'.repeat(64), format: 'image', size: 3 }, 'huesped');
  const sobreAdjunto = await escribir(m.eje, 'attach a file', { X: adjunto.id, file: 'archivo:' + 'b'.repeat(64), format: 'image', size: 3 }, 'huesped');
  const aMano = await m.eje.escribir({ autor: 'huesped', sobre: m.menu.id, t: T1, movimientos: [pagaElCoste('huesped')], payload: ['attach a file: lo escribo yo', ['x'], ['all announced movements happened'], ['huesped'], ['attach a file']] });
  return { ...m, adjunto, sobreAdjunto, aMano };
}
const CANONICO = 'huesped attaches a file to Menú del día';
const ES = 'Alta de huesped adjunta un archivo a Menú del día';
const EN = 'Alta de huesped attaches a file to Menú del día';
const todos = Object.fromEntries([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((k) => [k, NIVEL.bloque]));
/** El HTML sin la línea de un asiento de P («crear 10 P sobre <0 del registro>»): el núcleo la compone con el 0 guardado (apuntado en el informe). */
const sinAsientosDeP = (h) => h.replace(/ P sobre [^<]*/g, '');

// ---------- 1. el 0 legible ----------

test('0 legible: el foco, la línea de una lista y el «sobre» leen el 0 de lo escrito por plantilla en el idioma de quien mira; el crudo del reverso, intacto', async () => {
  const { eje, menu, adjunto, sobreAdjunto } = await conAdjuntos();
  assert.equal(adjunto.payload[0], 'attach a file: ' + CANONICO, 'el registro guarda el 0 canónico en inglés');
  // El foco (su representación y el título), en español; en inglés, sin el nombre de la plantilla delante.
  const a = await arbol({ foco: { X: adjunto.id, pv: 0 }, rosetones: {} }, eje, 'huesped', ORDENADOR);
  assert.equal(a.centro.representacion.texto, ES);
  assert.equal(a.centro.textoDelFoco, ES);
  const ha = html(a);
  assert.ok(ha.includes(ES));
  assert.doesNotMatch(ha, /attaches a file|attach a file/);
  const en = await arbol({ foco: { X: adjunto.id, pv: 0 }, rosetones: {} }, eje, 'huesped', ORDENADOR, { idioma: 'en' });
  assert.equal(en.centro.representacion.texto, EN);
  // La línea de una lista (lo anclado en el menú), a pantalla completa y en el móvil.
  for (const dim of [ORDENADOR, MOVIL]) {
    const l = await arbol({ foco: { X: menu.id, pv: 0 }, rosetones: {}, niveles: todos }, eje, 'huesped', dim);
    const h = sinAsientosDeP(html(l));
    assert.ok(h.includes('title="entrar en ' + ES + '"'), 'la línea, en español (' + dim.ancho + ')');
    assert.doesNotMatch(h, /attaches a file|attach a file/, 'ni la línea ni el hilo dicen el canónico (' + dim.ancho + ')');
  }
  // La línea «sobre» de un registro anclado en otro escrito por plantilla (el reverso).
  const r = await arbol({ foco: { X: sobreAdjunto.id, pv: 5 }, rosetones: {} }, eje, 'huesped', ORDENADOR);
  assert.equal(r.centro.ancla.sobreTexto, ES);
  // El BTML crudo del reverso: los datos tal como son (el canónico y el id de lo referido), no lo que se lee.
  const crudo = r.centro.btml.lineas.map((l) => l.trozos.map((z) => z.v).join('')).join('\n');
  assert.ok(crudo.includes('"attach a file: '), 'el crudo guarda el 0 canónico');
  assert.doesNotMatch(crudo, /adjunta un archivo/, 'el crudo no se traduce');
  // Lo que se escribe y se compara sigue siendo el canónico.
  assert.equal(eje.obtener(adjunto.id).payload[0], 'attach a file: ' + CANONICO);
});

test('0 legible: un 0 escrito a mano sale tal cual; ceroDe cae al 0 de siempre si el núcleo da null; el ocupante de un rosetón lo lee', async () => {
  const { eje, menu, aMano, adjunto } = await conAdjuntos();
  const ctx = { opciones: { idioma: 'es' } };
  assert.equal(ceroDe(eje, aMano.id, ctx), 'attach a file: lo escribo yo', 'a mano: tal cual');
  assert.equal(ceroDe(eje, menu.id, ctx), 'Menú del día', 'un 0 sin plantilla: tal cual');
  assert.equal(ceroDe(eje, adjunto.id, ctx), ES);
  assert.equal(ceroDe(eje, 'f'.repeat(64), ctx, 'el de siempre'), 'el de siempre', 'sin registro, el 0 de siempre');
  assert.equal(ceroDe(eje, 'f'.repeat(64), ctx), null);
  // La línea de lo escrito a mano en una lista: lo que mostraba la carta antes (sin el nombre interno delante).
  const l = await arbol({ foco: { X: menu.id, pv: 0 }, rosetones: {}, niveles: todos }, eje, 'huesped', ORDENADOR);
  assert.ok(html(l).includes(sinNombreInterno('attach a file: lo escribo yo', eje)), 'el escrito a mano sale como antes');
  // El ocupante de un rosetón: algo escrito por plantilla sobre mi alta.
  const alta = eje.alta('huesped').id;
  const sobreMiAlta = await A.transaccion(eje, 'attach a file', { X: alta, file: 'archivo:' + 'c'.repeat(64), format: 'image', size: 3 }, 'huesped', { t: T1 });
  assert.ok(sobreMiAlta.ok);
  await eje.escribir({ autor: 'huesped', sobre: alta, en: '6000000000', t: T1, movimientos: [pagaElCoste('huesped')], payload: sobreMiAlta.evento.payload });
  const a = await arbol({ foco: { X: menu.id, pv: 0 }, rosetones: todos }, eje, 'huesped', ORDENADOR);
  const textos = a.rosetones.flatMap((r) => r.ocupantes?.lista ?? []).map((o) => o.texto);
  assert.ok(textos.includes('Alta de huesped adjunta un archivo a Alta de huesped'), 'rosetón: ' + textos.join(' | '));
  assert.ok(textos.every((x) => !/attaches a file|attach a file:/.test(x)));
});

test('0 legible: lo por autorizar del 6 de mi alta lee el 0; el paso del camino lo compone el núcleo con nombres y en el idioma, y la carta no lo retoca', async () => {
  const fuente = readFileSync(new URL('../carta/carta.js', import.meta.url), 'utf8');
  assert.match(fuente, /que: esElCeroGuardado\(eje, x\.id, x\.que\) \? ceroDe\(eje, x\.id, ctx, x\.que\) : x\.que/, 'lo por autorizar, por ceroDe');
  const { eje, menu } = await ejemploCompra();
  const encargo = await eje.escribir({ autor: 'cocina', sobre: menu.id, t: T1, payload: ['Encargo', ['x'], ['all announced movements happened'], ['cocina', 'huesped']], movimientos: [pagaElCoste('cocina')] });
  await eje.escribir({ autor: 'cocina', sobre: encargo.id, en: '4100000000', t: T1, payload: 'servir', movimientos: [pagaElCoste('cocina'), { token: 'T', escala: 'hora', cantidad: 1, de: 'huesped', a: 'cocina', estado: 'anunciado', refiere: '2026-11-20T10:00:00Z' }] });
  const es = await arbol({ foco: { X: encargo.id, pv: 0 }, rosetones: {} }, eje, 'huesped', ORDENADOR, { t: T1 });
  const paso = es.camino.pasos.find((p) => p.regla === 'stage');
  assert.match(paso.falta, / · servir: huesped da 1 hora a cocina$/, 'el paso, con nombres y en español, tal como lo da el núcleo');
  assert.doesNotMatch(paso.falta, /T:hora|→/);
  const en = await arbol({ foco: { X: encargo.id, pv: 0 }, rosetones: {} }, eje, 'huesped', ORDENADOR, { t: T1, idioma: 'en' });
  const pasoEn = en.camino.pasos.find((p) => p.regla === 'stage');
  assert.match(pasoEn.falta, / · servir: huesped gives 1 hora to cocina$/);
  // En inglés el núcleo trae el nombre de la regla delante del mensaje («stage: …»): sinNombreInterno sigue haciendo falta, y la carta lo quita.
  const crudo = (await A.camino(eje, encargo.id, 'huesped', { t: T1, idioma: 'en' })).pasos.find((p) => p.regla === 'stage');
  assert.ok(crudo.falta.startsWith('stage: '), 'el núcleo en inglés lo trae delante');
  assert.ok(!pasoEn.falta.startsWith('stage: '), 'la carta lo quita');
});

// ---------- 2. las preferencias de formato, en el libro ----------

test('formato: se lee del libro (format settings), se escribe con un registro por cambio y lo que no se ha elegido es lo de siempre', async () => {
  const { eje } = await ejemploCompra();
  assert.deepEqual(formatoDeLibro(eje, 'huesped'), { fecha: 'legible', numeros: 'tal-cual', estilo: 'expandido', vista: 'crudo', formateado: false });
  assert.deepEqual(CLAVES_DE_FORMATO, { fecha: 'date format', numeros: 'number format', estilo: 'editor style', vista: 'editor view' });
  // Un cambio de desplegable: un registro «format settings» con los cuatro valores, anclado en el 9 de mi alta.
  const r = registroDeFormato(eje, 'huesped', { fecha: 'iso' });
  assert.equal(r.sobre, eje.alta('huesped').id);
  assert.equal(r.en, '9000000000');
  assert.deepEqual(r.payload[0], ['format settings']);
  assert.deepEqual(r.payload[1], ['date format', 'number format', 'editor style', 'editor view']);
  assert.deepEqual(r.payload[2], ['iso', 'tal-cual', 'expandido', 'crudo']);
  await eje.escribir({ autor: 'huesped', sobre: r.sobre, en: r.en, t: T1, movimientos: [pagaElCoste('huesped')], payload: r.payload });
  assert.deepEqual(formatoDeLibro(eje, 'huesped'), { fecha: 'iso', numeros: 'tal-cual', estilo: 'expandido', vista: 'crudo', formateado: false });
  // Otro cambio: otro registro; gana el último y conserva lo anterior.
  const r2 = registroDeFormato(eje, 'huesped', { vista: 'formateado', estilo: 'compacto' });
  assert.deepEqual(r2.payload[2], ['iso', 'tal-cual', 'compacto', 'formateado']);
  await eje.escribir({ autor: 'huesped', sobre: r2.sobre, en: r2.en, t: '2026-11-08T12:01:00Z', movimientos: [pagaElCoste('huesped')], payload: r2.payload });
  assert.deepEqual(formatoDeLibro(eje, 'huesped'), { fecha: 'iso', numeros: 'tal-cual', estilo: 'compacto', vista: 'formateado', formateado: true });
  // Es de quien lo escribió: otra persona sigue con lo de siempre; sin alta no hay registro que escribir.
  assert.equal(formatoDeLibro(eje, 'cocina').fecha, 'legible');
  assert.equal(registroDeFormato(eje, 'nadie-con-esa-alta', { fecha: 'iso' }), null);
  // La vista de esta sesión (el botón «formatear») manda sobre la del libro sin escribir nada; sin cuenta, la memoria manda sobre el libro.
  assert.equal(formatoDeLibro(eje, 'huesped', { sesion: false }).formateado, false);
  assert.equal(formatoDeLibro(eje, 'cocina', { sesion: true }).formateado, true);
  assert.equal(formatoDeLibro(eje, 'cocina', { memoria: { numeros: 'agrupados' } }).numeros, 'agrupados');
  assert.equal(formatoDeLibro(null, null).fecha, 'legible', 'sin eje, lo de siempre');
});

test('formato: los valores salen de la plantilla de la época (con su nombre en el idioma) y no de la carta; «al abrir» es otro desplegable', async () => {
  const { eje, compra } = await ejemploCompra();
  const claves = C.clavesDeConfiguracionDe(C.AJUSTES_DE_FORMATO);
  const ed = editorDeBtml(eje, compra.id, formatoValido({ formateado: true }), { idioma: 'es', idiomas: C.idiomas() });
  assert.deepEqual(ed.criterios.map((c) => c.clave), ['fecha', 'numeros', 'estilo', 'vista', 'idioma']);
  for (const [k, clave] of Object.entries(CLAVES_DE_FORMATO)) {
    const c = ed.criterios.find((x) => x.clave === k);
    assert.deepEqual(c.opciones.map((o) => o.valor), claves.find((x) => x.clave === clave).valores, k + ': los valores de la plantilla');
    assert.ok(c.opciones.every((o) => o.texto && !/^option /.test(o.texto)), k + ': cada valor con su nombre');
  }
  assert.equal(ed.criterios.find((c) => c.clave === 'fecha').etiqueta, 'formato de fecha', 'la etiqueta, de la época');
  assert.equal(ed.criterios.find((c) => c.clave === 'vista').etiqueta, 'al abrir');
  const eni = editorDeBtml(eje, compra.id, formatoValido({ formateado: true }), { idioma: 'en', idiomas: C.idiomas() });
  assert.equal(eni.criterios.find((c) => c.clave === 'fecha').opciones.find((o) => o.valor === 'larga').texto, 'long', 'en inglés, el de la época en inglés');
  // La carta ya no escribe los valores ni los nombres de los criterios, ni usa el almacén local para ellos.
  assert.equal(Object.keys(TEXTOS.es).filter((k) => /^criterio_(fecha|numeros|estilo)/.test(k)).length, 0);
  const fuente = readFileSync(new URL('../carta/formato-btml.js', import.meta.url), 'utf8');
  assert.doesNotMatch(fuente, /CRITERIOS|leerFormato|guardarFormato|claveDeFormato|setItem/);
  assert.equal(formatoValido({ vista: 'formateado' }).formateado, true, 'sin vista de sesión, abre como dice el libro');
});

test('formato: el botón «formatear» no escribe, un cambio de desplegable escribe un registro, sin cuenta todo queda en memoria, y la clave vieja se borra', () => {
  // El botón: la vista de esta sesión, nada más (ni escribir ni el almacén).
  const formatear = APP.match(/formatear\(\) \{[^}]*\}/)[0];
  assert.match(formatear, /estado\.formatoSesion = !formatoDe\(\)\.formateado/);
  assert.doesNotMatch(formatear, /escribir|salida|registroDeFormato|setItem/);
  // Un cambio de desplegable: sin cuenta, en memoria y antes de cualquier escritura; con cuenta, un registro por el camino de escribir de siempre.
  const formato = APP.match(/async formato\(clave, valor\) \{[^]*?\n  \},/)[0];
  assert.match(formato, /if \(clave === 'idioma'\) return manejadores\.preferencia\('language', valor\)/);
  const sinCuenta = formato.slice(formato.indexOf('if (!estado.cuenta)'), formato.indexOf('try {'));
  assert.match(sinCuenta, /estado\.formatoMemoria = \{ \.\.\.estado\.formatoMemoria, \[clave\]: valor \}/);
  assert.doesNotMatch(sinCuenta, /escribir|salida/);
  assert.match(formato, /registroDeFormato\(estado\.eje, estado\.identidad, \{ \[clave\]: valor \}\)/);
  assert.match(formato, /salida\.escribirDesde\(estado\.eje, \{ modo: 'sequenced', autor: estado\.identidad, sobre: r\.sobre, en: r\.en, payload: r\.payload \}, privadaDe\(estado\.identidad\)\)/);
  // Se lee del libro en cada pintado y la clave vieja del almacén local se borra al leer.
  assert.match(APP, /estado\.formato = formatoDe\(\)/);
  assert.match(APP, /olvidarFormatoLocal\(almacenLocal\(\), estado\.cuenta \? estado\.cuenta\.alta : null\)/);
  assert.doesNotMatch(APP, /guardarFormato|leerFormato/);
  const m = new Map([['agram.formato.ALTA1', '{"formateado":true}'], ['agram.formato.ejemplo', '{}'], ['otra', 'x']]);
  const almacen = { getItem: (k) => m.get(k) ?? null, removeItem: (k) => m.delete(k), setItem: (k, v) => m.set(k, v) };
  assert.equal(olvidarFormatoLocal(almacen, 'ALTA1'), true);
  assert.equal(m.has('agram.formato.ALTA1'), false, 'la clave vieja, borrada (sin migrar)');
  assert.equal(m.has('agram.formato.ejemplo'), true, 'solo la de esta cuenta');
  assert.equal(olvidarFormatoLocal(almacen, null), true);
  assert.equal(olvidarFormatoLocal(almacen, null), false, 'ya no hay nada que borrar');
  assert.equal(m.get('otra'), 'x');
  assert.equal(olvidarFormatoLocal({ getItem() { throw new Error('bloqueado'); } }, 'A'), false, 'un almacén que falla no rompe nada');
});

// ---------- 4. el número del rosetón ----------

test('#91 el número del rosetón son los ocupantes, igual comprimido y ampliado; sin ocupantes, sin número', async () => {
  const { eje, compra } = await conAdjuntos();
  const alta = eje.alta('huesped').id;
  const cerrado = await arbol({ foco: { X: compra.id, pv: 0 }, rosetones: {} }, eje, 'huesped', GRANDE);
  const total = (pv) => C.ocupantes(eje, alta, pv, 0, 0).total;
  assert.ok(cerrado.rosetones.some((r) => total(r.pv) > 0) && cerrado.rosetones.some((r) => total(r.pv) === 0), 'hay rosetones con y sin ocupantes');
  for (const r of cerrado.rosetones) assert.equal(r.comprimido.dato, total(r.pv) > 0 ? total(r.pv) : null, 'rosetón ' + r.pv);
  for (const pv of [1, 2, 3, 4, 6, 7, 8, 9, 0, 5]) {
    const abierto = await arbol({ foco: { X: compra.id, pv: 0 }, rosetones: { [pv]: NIVEL.tarjeta } }, eje, 'huesped', GRANDE);
    const mismo = (lista) => lista.find((r) => r.pv === pv).comprimido;
    assert.deepEqual(mismo(abierto.rosetones), mismo(cerrado.rosetones), 'el ampliado cuenta lo mismo que el comprimido (' + pv + ')');
  }
  const h = html(cerrado);
  const de = (pv) => h.match(new RegExp(`<button type="button" class="roseton [^>]*data-roseton="${pv}"[^]*?</button>`))[0];
  for (const r of cerrado.rosetones) {
    const dato = de(r.pv).match(/<span class="dato">([^<]*)<\/span>/);
    if (total(r.pv) > 0) assert.equal(dato?.[1], String(total(r.pv)), 'rosetón ' + r.pv + ': su número');
    else assert.equal(dato, null, 'rosetón ' + r.pv + ': sin ocupantes, sin número');
  }
  // La pantalla completa de un rosetón sin ocupantes no cuenta cero.
  const vacio = cerrado.rosetones.find((r) => total(r.pv) === 0).pv;
  const completa = html(await arbol({ foco: { X: compra.id, pv: 0 }, rosetones: { [vacio]: NIVEL.bloque } }, eje, 'huesped', GRANDE));
  assert.doesNotMatch(completa.match(/<section class="roseton-pantalla"[^]*?<\/header>/)[0], /<small>0<\/small>/);
});

// ---------- 5. el arte propio sin marco general ----------

const ICONO_PROPIO = 'arte/fase2/bloque-0/biblioteca/jardin/elemento/fruto-intermedio.svg';
async function menuConIcono() {
  const m = await ejemploCompra();
  const autor = m.eje.obtener(m.menu.id).autor;
  await m.eje.escribir({ autor, sobre: m.menu.id, en: '5000000000', t: '2026-11-08T09:30:00Z', movimientos: [pagaElCoste(autor)], payload: [['elemento'], [0, 'svg'], ['*'], ['centro'], ['once', 1], ['*'], [ICONO_PROPIO, 'prueba: el arte propio del menú']] });
  return m;
}
let reloj = 0;
async function pintado(eje, k, modelo = 'general') {
  const valores = C.clavesDeConfiguracion().find((c) => c.valores?.length >= 3).valores;
  const p = preferencias(eje, 'huesped', { render: valores[k], model: modelo });
  await eje.escribir({ autor: 'huesped', sobre: p.sobre, en: p.en, t: `2026-11-08T13:0${++reloj}:00Z`, movimientos: [pagaElCoste('huesped')], payload: p.payload });
}
const cuantos = (h, re) => (h.match(re) ?? []).length;

test('#25 el icono propio se ve igual con marco general y sin él: en el hueco del marco (todo) o junto a su línea (propio, otro modelo); en sobrio, nada', async () => {
  const { eje, compra } = await menuConIcono();
  const vista = async (pv = 1) => html(await arbol({ foco: { X: compra.id, pv }, rosetones: {} }, eje, 'huesped', GRANDE));
  // todo, con el marco general: lo enseña el marco en su hueco; la línea lo lleva también pero el estilo la esconde dentro de la escena.
  await pintado(eje, 2);
  const conMarco = await vista();
  assert.equal(cuantos(conMarco, /class="arte-escena"/g), 1, 'con marco');
  assert.ok(conMarco.includes('<img class="pieza sub-dibujo pieza-imagen"') && conMarco.includes(ICONO_PROPIO), 'en su hueco del marco');
  assert.match(CSS, /\.arte-escena \.capa-icono\{display:none\}/, 'dentro del marco, la copia de la línea no se ve (no se enseña dos veces)');
  // propio (el de en medio): no hay marco general y el icono propio se sigue viendo, junto a su línea.
  await pintado(eje, 1);
  const propio = await vista();
  assert.equal(cuantos(propio, /class="arte-escena"/g), 0, 'sin marco');
  assert.equal(cuantos(propio, /<img class="pieza capa capa-icono pieza-imagen"[^>]*src="\.\/arte\/fase2/g), 1, 'su icono, junto a su línea');
  assert.ok(propio.includes(ICONO_PROPIO));
  // todo, con un modelo sin marco general (el genérico): también.
  await pintado(eje, 2, 'animado-generico');
  assert.ok(cuantos(await vista(), /class="[^"]*capa-icono[^"]*"/g) >= 1, 'con otro modelo, también');
  // sobrio (el primero): nada de arte, ni el propio.
  await pintado(eje, 0);
  const sobrio = await vista();
  assert.ok(!sobrio.includes(ICONO_PROPIO) && !/capa-icono/.test(sobrio), 'en sobrio no se pinta ni lo propio');
});

test('#25 el icono propio es una capa más: quitarla da el mismo contenido que el sobrio, y sin arte propio el nodo no cambia de forma', async () => {
  const { eje, compra } = await menuConIcono();
  await pintado(eje, 1);
  const centro = (h) => h.slice(h.indexOf('<header class="nucleo-cabeza"'), h.indexOf('<nav class="vecinos"'));
  const propio = centro(html(await arbol({ foco: { X: compra.id, pv: 1 }, rosetones: {} }, eje, 'huesped', GRANDE)));
  await pintado(eje, 0);
  const a = await arbol({ foco: { X: compra.id, pv: 1 }, rosetones: {} }, eje, 'huesped', GRANDE);
  assert.ok(propio.includes('capa-icono'));
  assert.equal(sinArte(propio), centro(html(a)), 'sin capas, el sobrio');
  assert.ok(!JSON.stringify(a).includes('"icono"'), 'sobrio: ningún ocupante lleva icono');
});

// ---------- 6. nada de SVG en el documento ----------

test('SEG-15 en animado ningún <svg> de datos entra en el documento: el arte y la imagen de un ocupante van como <img>', async () => {
  const { eje, compra } = await menuConIcono();
  for (const [k, modelo] of [[2, 'general'], [1, 'general'], [2, 'animado-generico']]) {
    await pintado(eje, k, modelo);
    for (const pv of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]) {
      for (const dim of [GRANDE, MOVIL]) {
        const h = html(await arbol({ foco: { X: compra.id, pv }, rosetones: {}, niveles: pv === 0 ? todos : undefined }, eje, 'huesped', dim));
        assert.doesNotMatch(h, /<svg[\s>]/i, `pv ${pv} (${dim.ancho})`);
        assert.doesNotMatch(h, /<\/?(object|embed)/i);
      }
    }
  }
  // Y la imagen de la representación de un ocupante (rep-mini) ya es un <img>; la carta no mete HTML de datos.
  const dom = readFileSync(new URL('../carta/dom.js', import.meta.url), 'utf8');
  assert.match(dom, /<img class="\$\{clase\} rep-imagen" src="\.\/\$\{attr\(rep\.recurso\)\}"/);
  assert.doesNotMatch(dom, /\.innerHTML|insertAdjacentHTML/);
});
