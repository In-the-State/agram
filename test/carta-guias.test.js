// Las zonas de la cara y la guía mínima en la carta (Core AGRAM 17-11, pieza 2 de agram-equipo/DISENO_ZONAS_GUIA.md §4):
// carta/guias.js (leer mis otros libros una vez, la tercera fuente del 9, el camino de una guía), la capa de zonas sobre
// la cara (carta.js, dom.js) y los pasos de la guía en el camino. Todo inventado: dos libros en memoria, de demostración.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { epocaGuiaLibro } from '../datos/epocas/guia-libro/generar.mjs';
import { Eje } from '../src/eje.js';
import * as A from '../src/acciones.js';
import * as contrato from '../src/contrato.js';
import { serializar } from '../src/persistencia.js';
import { LibrosDelDispositivo, sugerenciasDeMisGuias, estadoDeLosPasos, pasoDelLibro, esMiGuia, libroDeEntrada, TOPE_DE_LIBROS, TOPE_DE_PASOS } from '../carta/guias.js';
import { arbol } from '../carta/carta.js';
import { html, htmlCamino, htmlFicha } from '../carta/dom.js';

const ZONA = 'a zone of the face';
/** Una acción que no hay en el libro de trabajo (la zona ya no vale: VG 18-11, es provisional en todo libro, irá a la 0). */
const AJENA = 'something of another book';
const PASO = 'a step of the guide';
const T = '2026-11-17T10:00:00Z';
const NO_ESTA = 'ab'.repeat(32);
const GRANDE = { ancho: 1920, alto: 1080 };
const CSS = readFileSync(new URL('../carta/estilo.css', import.meta.url), 'utf8');

/** Un libro de la dueña (vg, que escribe la guía) con una lectora invitada (quien sigue la guía: su alta no es el génesis). */
async function libro(epoca, duena = 'vg') {
  const eje = await Eje.genesis({ identidad: duena, foco: 'libro de prueba', t: T, emision: [{ token: 'R', cantidad: 10 }], ...(epoca ? { epoca } : {}), demostracion: true });
  await eje.aceptar(await eje.invitar({ autor: duena, invitado: 'lectora', t: T }), {}, { t: T });
  return eje;
}
async function hacer(eje, nombre, X, params, quien = 'vg') {
  const r = await A.transaccion(eje, nombre, { X, ...params }, quien, { t: T });
  assert.ok(r.ok, nombre + ': ' + JSON.stringify(r.motivos));
  return eje.anadir(r.evento);
}

/**
 * Dos libros de la misma dueña: el de la guía (la época hija) con una guía, cuatro pasos y tres zonas, y el de trabajo
 * (la 0), donde se hacen. Las entradas de «Tus libros» y un almacén con los dos guardados.
 */
async function dosLibros() {
  const g = await libro(epocaGuiaLibro());
  const w = await libro(null);
  const guia = await hacer(g, 'anchor here', g.genesisId, { title: 'Primeros pasos' });
  const destino = await hacer(g, 'anchor here', g.genesisId, { title: 'Un destino' });
  const p1 = await hacer(g, PASO, guia.id, { title: 'Anota aquí', action: 'anchor here', parameters: ['title: mi nota'], why: 'el primero', record: destino.id });
  const p2 = await hacer(g, PASO, guia.id, { title: 'Un hito', action: 'anchor here', parameters: ['title: hito'], why: 'en el trabajo', book: w.genesisId });
  const p3 = await hacer(g, PASO, guia.id, { title: 'Imposible', action: AJENA, why: 'allí no existe', book: w.genesisId });
  const p4 = await hacer(g, PASO, guia.id, { title: 'Lejos', action: 'anchor here', why: 'en otro sitio', book: NO_ESTA });
  const z1 = await hacer(g, ZONA, guia.id, { label: 'Destino & <b>', x: 50, y: 50, width: 300, height: 100, record: destino.id });
  const z2 = await hacer(g, ZONA, guia.id, { label: 'Empieza', x: 50, y: 400, width: 300, height: 100, record: p1.id });
  const z3 = await hacer(g, ZONA, guia.id, { label: 'Al trabajo', x: 500, y: 700, width: 400, height: 200, book: w.genesisId, record: w.alta('lectora').id });
  const almacen = new Map([['eje.G', JSON.stringify(serializar(g))], ['eje.W', JSON.stringify(serializar(w))]]);
  // Mi identidad en cada libro (la de su entrada): en el de la guía soy vg, quien la escribió; en el de trabajo, la lectora.
  const entradas = [{ alta: 'G', nombre: 'La guía', identidad: 'vg', libro: g.genesisId }, { alta: 'W', nombre: 'El trabajo', identidad: 'lectora' }];
  return { g, w, guia, destino, p1, p2, p3, p4, z1, z2, z3, almacen, entradas };
}

/** Los libros del dispositivo sobre un almacén en memoria; `restaurados` cuenta cuántas veces se restaura uno. */
function dispositivo(almacen) {
  const cuenta = { restaurados: 0 };
  const libros = new LibrosDelDispositivo({
    clave: (alta) => 'eje.' + alta,
    almacen: () => ({ getItem: (k) => almacen.get(k) ?? null }),
    restaurar: async (datos) => { cuenta.restaurados += 1; const { restaurar } = await import('../src/persistencia.js'); return restaurar(datos); },
  });
  return { libros, cuenta };
}

test('mis otros libros se leen una vez mientras no cambien; lo que no está da null; los topes están dichos', async () => {
  const { w, almacen } = await dosLibros();
  const { libros, cuenta } = dispositivo(almacen);
  const a = await libros.eje('W');
  assert.equal(a.genesisId, w.genesisId);
  assert.equal(await libros.eje('W'), a, 'el mismo eje, sin volver a restaurar');
  assert.equal(cuenta.restaurados, 1);
  await hacer(w, 'anchor here', w.genesisId, { title: 'otro' });
  almacen.set('eje.W', JSON.stringify(serializar(w)));
  const b = await libros.eje('W');
  assert.notEqual(b, a, 'cambió lo guardado: se vuelve a leer');
  assert.equal(cuenta.restaurados, 2);
  assert.equal(await libros.eje('NADA'), null);
  assert.equal(await libros.eje(null), null);
  assert.ok(TOPE_DE_LIBROS > 0 && TOPE_DE_PASOS > 0);
  // Se compara el texto entero: uno del mismo largo con el medio cambiado también se vuelve a leer.
  const texto = almacen.get('eje.W');
  const medio = Math.floor(texto.length / 2);
  const otro = texto.slice(0, medio) + (texto[medio] === 'a' ? 'b' : 'a') + texto.slice(medio + 1);
  assert.equal(otro.length, texto.length);
  almacen.set('eje.W', otro);
  assert.notEqual(await libros.eje('W'), b, 'el mismo largo y los mismos extremos no bastan: se compara todo y no se da lo leído antes');
});

test('la entrada de un libro: por la que ya lo dice o leyendo su eje; el abierto; uno que no está, null; nada que no sea un id', async () => {
  const { g, w, almacen, entradas } = await dosLibros();
  const { libros } = dispositivo(almacen);
  assert.equal((await libroDeEntrada(g.genesisId, { entradas, libros })).alta, 'G');
  assert.deepEqual(await libroDeEntrada(w.genesisId, { entradas, libros }), { ...entradas[1], libro: w.genesisId }, 'la entrada aún no lo decía: se lee');
  assert.equal((await libroDeEntrada(w.genesisId, { entradas: [], libros, actual: { alta: 'W', eje: w } })).alta, 'W');
  assert.equal(await libroDeEntrada(NO_ESTA, { entradas, libros }), null);
  assert.equal(await libroDeEntrada('https://fuera.invalid/x', { entradas, libros }), null);
});

test('un paso de una guía se reconoce por su registro (solo los del autor de la guía); lo demás no lo es', async () => {
  const { g, guia, destino, p1 } = await dosLibros();
  const r = pasoDelLibro(g, p1.id);
  assert.equal(r.paso.titulo, 'Anota aquí');
  assert.deepEqual(r.guia, { id: guia.id, titulo: 'Primeros pasos' });
  assert.equal(r.autor, 'vg', 'con el autor de su guía');
  assert.equal(esMiGuia(r, 'vg'), true);
  assert.equal(esMiGuia(r, 'lectora'), false);
  assert.equal(esMiGuia(r, null), false, 'sin saber quién soy en ese libro, no');
  assert.equal(esMiGuia(null, 'vg'), false);
  assert.equal(pasoDelLibro(g, destino.id), null);
  assert.equal(pasoDelLibro(g, NO_ESTA), null);
  assert.equal(pasoDelLibro(g, 'no-es-un-id'), null);
});

test('la tercera fuente del 9: en el libro de trabajo salen los pasos de mi guía sobre el foco, con su guía; el inválido con su motivo; hecho después', async () => {
  const { w, p2, p3, almacen, entradas } = await dosLibros();
  const { libros } = dispositivo(almacen);
  const alta = w.alta('lectora').id;
  const vistos = new Map();
  const hook = sugerenciasDeMisGuias({ entradas, libros, actual: { alta: 'W', eje: w, yo: 'lectora' }, idioma: 'es', deDonde: (id, alta) => vistos.set(id, alta) });
  const s = await hook(w, w.obtener(alta), 'lectora');
  assert.deepEqual(s.map((x) => x.id), [p2.id, p3.id]);
  assert.equal(s[0].guia, 'Primeros pasos');
  assert.equal(s[0].hecho, false);
  assert.match(s[1].invalida, /something of another book/);
  assert.equal(vistos.get(p2.id), 'G', 'la carta sabe a qué libro de guía volver');
  const pasos = async () => (await A.camino(w, alta, 'lectora', { sugerencias: hook, t: T })).pasos.filter((p) => p.guia);
  const [antes, invalido] = await pasos();
  assert.equal(antes.hecho, false);
  assert.equal(antes.porque, 'en el trabajo');
  assert.equal(invalido.hacer, null);
  await hacer(w, antes.hacer.plantilla, antes.hacer.X, antes.hacer.parametros, 'lectora');
  assert.equal((await pasos())[0].hecho, true);
  // En el 9 pintado: el paso con su guía y un botón que abre su formulario; el inválido con su motivo y sin botón.
  const h = htmlCamino({ pasos: [{ fuente: 'sugerencia', propuesta: p2.id, guia: 'Primeros <guía>', porque: 'en el <trabajo>', mio: true, hacer: { nombre: 'anclar aquí' }, pasa: true }, { fuente: 'sugerencia', propuesta: p3.id, guia: 'Primeros pasos', invalida: 'no existe', falta: ZONA }] });
  assert.ok(h.includes(`data-guia-paso="${p2.id}"`));
  assert.ok(h.includes('de la guía «Primeros &lt;guía&gt;»') && h.includes('en el &lt;trabajo&gt;'), 'el texto de la guía, escapado');
  assert.ok(!h.includes(`data-guia-paso="${p3.id}"`) && h.includes('no existe'), 'el inválido, con su motivo y sin botón');
  assert.ok(!h.includes('data-propuesta-aceptar'), 'un paso de guía no es una propuesta importada: no hay aceptar ni rechazar');
  // Un libro de guía que no está en el dispositivo no aporta nada (ni falla).
  assert.deepEqual(await sugerenciasDeMisGuias({ entradas: [{ alta: 'NADA', identidad: 'vg' }], libros, actual: { alta: 'W', eje: w, yo: 'lectora' } })(w, w.obtener(alta), 'lectora'), []);
  // Sin saber quién soy en el libro de la guía, ese libro no aporta pasos.
  assert.deepEqual(await sugerenciasDeMisGuias({ entradas: [{ alta: 'G' }], libros, actual: { alta: 'W', eje: w, yo: 'lectora' } })(w, w.obtener(alta), 'lectora'), []);
});

test('solo mis guías: la guía que otro miembro escribe en el libro de la guía, con un paso hacia mi libro, no sale en mi 9 ni se sigue', async () => {
  const { g, w, almacen, entradas, p2 } = await dosLibros();
  // La lectora es miembro del libro de la guía: escribe su elemento y un paso que apunta a mi libro de trabajo.
  const trampa = await hacer(g, 'anchor here', g.alta('lectora').id, { title: 'Trampa' }, 'lectora');
  const malo = await hacer(g, PASO, trampa.id, { title: 'Firma esto', action: 'anchor here', parameters: ['title: dame'], why: 'confía', book: w.genesisId }, 'lectora');
  almacen.set('eje.G', JSON.stringify(serializar(g)));
  const { libros } = dispositivo(almacen);
  const alta = w.alta('lectora').id;
  const s = await sugerenciasDeMisGuias({ entradas, libros, actual: { alta: 'W', eje: w, yo: 'lectora' }, idioma: 'es' })(w, w.obtener(alta), 'lectora');
  assert.ok(s.some((x) => x.id === p2.id), 'los de mi guía, sí');
  assert.ok(!s.some((x) => x.id === malo.id), 'el de la guía de otra persona, no');
  // Seguirlo (la decisión de app.js seguirPasoDeGuia, antes de cambiar de libro): es un paso, pero no de mi guía.
  const hallado = pasoDelLibro(g, malo.id);
  assert.equal(hallado.autor, 'lectora');
  assert.equal(esMiGuia(hallado, 'vg'), false);
  // Y la carta lo dice en llano, con su clave.
  const { t } = await import('../carta/textos.js');
  assert.equal(t('guiaPasoAjeno'), 'Ese paso es de la guía de otra persona. No se ha abierto nada.');
});

test('el camino de la guía en su libro: cada paso con su estado en su libro; el de un libro que no está, dicho; el inválido, con su motivo', async () => {
  const { g, w, guia, destino, almacen, entradas } = await dosLibros();
  const { libros } = dispositivo(almacen);
  const decir = (k, p) => k + (p?.accion ? ':' + p.accion : '');
  const estado = async () => estadoDeLosPasos(g, guia.id, { entradas, libros, actual: { alta: 'G', eje: g }, yoDe: (e) => e.identidad, decir });
  const e = await estado();
  assert.deepEqual(e.map((x) => [x.titulo, x.estado, x.libro]), [['Anota aquí', 'pendiente', null], ['Un hito', 'pendiente', 'El trabajo'], ['Imposible', 'invalido', 'El trabajo'], ['Lejos', 'noEsta', null]]);
  assert.equal(e[2].motivo, 'guiaPasoSinAccion:' + AJENA);
  await hacer(g, 'anchor here', destino.id, { title: 'mi nota' });
  await hacer(w, 'anchor here', w.alta('lectora').id, { title: 'hito' }, 'lectora');
  almacen.set('eje.W', JSON.stringify(serializar(w)));
  assert.deepEqual((await estado()).map((x) => x.estado), ['hecho', 'hecho', 'invalido', 'noEsta']);
  // Pintado: el título de quien escribió la guía, escapado; el del libro que no está lo dice.
  const h = htmlCamino({ pasos: [], guia: [{ id: 'a'.repeat(64), titulo: '<i>uno</i>', estado: 'pendiente', libro: null, accion: 'anchor here', accionNombre: 'anclar aquí' }, { id: 'b'.repeat(64), titulo: 'dos', estado: 'noEsta', libro: null }] });
  assert.ok(h.includes('&lt;i&gt;uno&lt;/i&gt;') && !h.includes('<i>uno'));
  assert.ok(h.includes(`data-guia-seguir="${'a'.repeat(64)}"`) && !h.includes(`data-guia-seguir="${'b'.repeat(64)}"`));
  assert.ok(h.includes('ese libro no está en este dispositivo'));
});

test('la cara con zonas: una capa de la carta con un botón por zona, la etiqueta como texto y la caja en milésimas; sin zonas, todo como hoy', async () => {
  const { g, guia, z1, z2, z3 } = await dosLibros();
  const a = await arbol({ foco: { X: guia.id, pv: 0 } }, g, 'vg', GRANDE);
  assert.deepEqual(a.centro.zonas.map((z) => [z.id, z.caja]), [[z1.id, [50, 50, 300, 100]], [z2.id, [50, 400, 300, 100]], [z3.id, [500, 700, 400, 200]]]);
  const h = html(a);
  const capa = h.slice(h.indexOf('<span class="zonas-capa"'), h.indexOf('</span></span>', h.indexOf('<span class="zonas-capa"')));
  assert.equal((capa.match(/<button type="button" class="zona"/g) ?? []).length, 3);
  assert.ok(capa.includes('>Destino &amp; &lt;b&gt;</button>'), 'la etiqueta, escapada');
  assert.ok(capa.includes(`data-zona="${z1.id}" data-x="${guia.id}" style="--zx: 50; --zy: 50; --zan: 300; --zal: 100;"`), 'la caja como variables, por cssSeguro');
  assert.ok(/<h1 class="representacion[^"]* con-zonas"><span class="cara-con-zonas">/.test(h));
  // La capa cubre la cara entera (el dibujo no recibe toques) y el botón es de la carta (su borde, su letra).
  assert.match(CSS, /\.zonas-capa\{position:absolute;inset:0;z-index:2/);
  assert.match(CSS, /\.zonas-capa>\.zona\{[^}]*border:2px solid var\(--accent\)/);
  assert.match(CSS, /\.cara-con-zonas:not\(:has\(\.rep-aislada\)\)\{min-height:/, 'una cara de solo texto toma alto para sus botones');
  // Sin zonas: ni campo en el árbol ni capa.
  const sin = await arbol({ foco: { X: g.genesisId, pv: 0 } }, g, 'vg', GRANDE);
  assert.ok(!('zonas' in sin.centro));
  assert.ok(!html(sin).includes('zonas-capa'));
  // Las zonas de otra persona no cuentan (ya lo hace la lectura: aquí, que la carta no la rodea).
  assert.ok(!A.acciones(g, guia.id, 2, 'lectora').some((x) => x.nombre === ZONA), 'a otra persona no se le ofrece');
  const ajena = await A.transaccion(g, ZONA, { X: guia.id, label: 'Ajena', x: 0, y: 0, width: 100, height: 100, record: guia.id }, 'lectora', { t: T });
  if (ajena.ok) await g.anadir(ajena.evento);
  assert.equal(contrato.zonas(g, guia.id).length, 3);
  assert.equal((await arbol({ foco: { X: guia.id, pv: 0 } }, g, 'lectora', GRANDE)).centro.zonas.length, 3, 'la carta no la rodea: tampoco la pinta');
});

// ---------- la ficha de detalle (contrato.notaDeDetalle, §12.9) ----------

test('la ficha de detalle: bajo el título del registro abierto, todo como texto; Copiar solo donde se puede; sin nota, nada', async () => {
  const eje = await libro(null);
  const tarea = await hacer(eje, 'anchor here', eje.genesisId, { title: 'Probar la carta' });
  const sin = await arbol({ foco: { X: tarea.id, pv: 0 } }, eje, 'vg', GRANDE);
  assert.ok(!('ficha' in sin.centro) && !html(sin).includes('class="ficha"'), 'sin nota, el nodo no cambia');
  await hacer(eje, 'anchor here', tarea.id, { title: 'nota de detalle', content: ['nota de detalle: j1', 'base: Lo pide <b>la dueña</b>', 'paso 1: Arrancar', 'paso 1 comando: node s.mjs --puerto 9999 && echo "<x>"', 'paso 1 ruta: retoques/una/ruta/muy/larga', 'paso 1 ve: la portada', 'paso 2: Truco', 'paso 2 comando: rm ‮-rf', 'detalle: una línea', 'quien: Core Inventado', 'depende a1: Escribir la guía'] });
  const a = await arbol({ foco: { X: tarea.id, pv: 0 } }, eje, 'vg', GRANDE);
  assert.equal(a.centro.ficha.base, 'Lo pide <b>la dueña</b>');
  const h = html(a);
  // Justo bajo el título (el h1 de la representación), antes de lo demás.
  const h1 = h.indexOf('</h1>');
  assert.ok(h1 > 0 && h.indexOf('<section class="ficha"') > h1 && h.indexOf('<section class="ficha"') < h.indexOf('class="campo campo-0'), 'la ficha va bajo el título');
  const f = htmlFicha(a.centro.ficha);
  assert.ok(f.includes('En qué se basa') && f.includes('Lo pide &lt;b&gt;la dueña&lt;/b&gt;') && !f.includes('<b>la dueña'), 'como texto, escapado');
  assert.ok(f.includes('<code class="ficha-comando">node s.mjs --puerto 9999 &amp;&amp; echo &quot;&lt;x&gt;&quot;</code><button type="button" class="ficha-copiar"'), 'el comando en monoespaciado, con Copiar');
  assert.ok(f.includes('<code class="ficha-ruta">retoques/una/ruta/muy/larga</code>'));
  assert.ok(f.includes('Verás: la portada') && f.includes('Pregunta a: Core Inventado') && f.includes('Depende de') && f.includes('<code>a1</code> Escribir la guía'));
  assert.ok(f.includes('<p>una línea</p>'), 'el detalle, como párrafos');
  assert.ok(f.includes('Ficha escrita por vg'), 'al pie, quién la escribió');
  assert.equal((f.match(/data-copiar/g) ?? []).length, 1, 'el comando con caracteres que engañan no se ofrece para copiar');
  assert.ok(f.includes('<code class="ficha-comando">rm -rf</code>') && f.includes('traía caracteres que engañan'), 'se enseña sin ellos y marcado');
  assert.match(CSS, /\.ficha-comando,\.ficha-ruta\{[^}]*white-space:pre-wrap;overflow-wrap:anywhere/, 'comandos y rutas largas saltan dentro de su caja');
  assert.equal(htmlFicha(null), '');
});
