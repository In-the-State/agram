// Los rosetones y la cara 5 (VG, 14-11; ISSUES #91 y #93; repaso de la beta #5 y #23):
//   #91 los rosetones son lo MÍO frente a lo que miro: el ampliado FLOTA sobre la carta (no empuja lo demás), se cierra al
//       pulsar fuera o el mismo rosetón y, con doble toque, ocupa la pantalla; tiene más contraste que los PV del foco; su
//       nombre es el 0 de la posición de mi alta (no «de mi alta»)
//   #93 la cara 5 (el reverso) es un editor de código de solo lectura sobre el BTML del registro: monoespaciada, líneas
//       numeradas, sangrada, un color por tipo de valor; «formatear» alterna el BTML crudo con el formateado y enseña los
//       criterios de formato, que se guardan y se vuelven a leer; sin «cuando —/10»
// Lo visual está en las capturas de equipo/mockups/capturas/beta-cartaros.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { arbol, alternarRoseton, rosetonAPantallaCompleta, hayRosetonAmpliado, NIVEL } from '../carta/carta.js';
import { html } from '../carta/dom.js';
import { instalar } from '../carta/gestos.js';
import { TEXTOS, t } from '../carta/textos.js';
import { formatoValido, lineasDeBtml, editorDeBtml } from '../carta/formato-btml.js';
import * as C from '../src/contrato.js';
import { direccion } from '../src/btml.js';
import { ejemploCompra } from '../ejemplos/ikisai/compra-food.mjs';
import { pagaElCoste } from './ayudas-coste.js';

const ORDENADOR = { ancho: 1200, alto: 800 };
const T1 = '2026-11-08T10:00:00Z';
// El formato de quien no ha elegido (lo da la plantilla «format settings» de la época: la carta no lo escribe) y los valores de la fecha.
const FORMATO_INICIAL = Object.freeze(formatoValido(null));
const CRITERIOS = { fecha: C.clavesDeConfiguracionDe(C.AJUSTES_DE_FORMATO).find((c) => c.clave === 'date format').valores };
const CSS = readFileSync(new URL('../carta/estilo.css', import.meta.url), 'utf8');
const APP = readFileSync(new URL('../carta/app.js', import.meta.url), 'utf8');

/** El HTML sin los rosetones (la barra y la hoja de pantalla completa): lo que no son ellos. */
const sinRosetones = (h) => h.replace(/<nav class="rosetones[^]*?<\/nav>/, '').replace(/<section class="roseton-pantalla"[^]*?<\/section>/, '');
/** El cuerpo de la primera regla CSS cuyo selector (exacto) es `sel`. */
const regla = (sel, css = CSS) => (css.match(new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\{([^}]*)\\}')) ?? [])[1] ?? null;

// ---------- #91 los rosetones ----------

test('#91 el ampliado flota: el HTML del resto de la carta es idéntico con el rosetón abierto o cerrado, y su regla es position:absolute sobre una capa que no ocupa sitio', async () => {
  const { eje, compra } = await ejemploCompra();
  const cerrado = await arbol({ foco: { X: compra.id, pv: 0 }, rosetones: {} }, eje, 'huesped', ORDENADOR);
  for (const pv of [1, 3, 7, 0, 5]) {
    const abierto = await arbol({ foco: { X: compra.id, pv: 0 }, rosetones: { [pv]: NIVEL.tarjeta } }, eje, 'huesped', ORDENADOR);
    assert.equal(sinRosetones(html(abierto)), sinRosetones(html(cerrado)), `con el rosetón ${pv} ampliado, nada más cambia (mismas cajas)`);
    assert.deepEqual(abierto.mapa.columnas, cerrado.mapa.columnas);
    assert.deepEqual(abierto.mapa.filas, cerrado.mapa.filas);
    assert.match(html(abierto), new RegExp(`class="roseton [^"]*nivel-2[^"]*"[^>]*data-roseton="${pv}"`));
  }
  // La capa de los rosetones y cada rosetón van fuera del flujo, por encima de los bloques.
  assert.match(regla('.rosetones-mapa'), /position:absolute;inset:0/);
  assert.match(regla('.rosetones-mapa .roseton'), /position:absolute/);
  assert.match(regla('.rosetones-mapa .roseton.nivel-2'), /z-index:7/);
  assert.match(regla('.rosetones-mapa .roseton.nivel-2'), /box-shadow/, 'flota: con sombra');
});

test('#91 se cierra al pulsar el mismo rosetón; uno solo abierto; Esc y «cerrar» también (estado y manejadores)', () => {
  assert.deepEqual(alternarRoseton({}, 3), { 3: NIVEL.tarjeta });
  assert.deepEqual(alternarRoseton({ 3: NIVEL.tarjeta }, 3), {}, 'el mismo lo cierra');
  assert.deepEqual(alternarRoseton({ 3: NIVEL.tarjeta }, 7), { 7: NIVEL.tarjeta }, 'otro lo cambia: de uno en uno');
  assert.deepEqual(alternarRoseton({ 3: NIVEL.bloque }, 3), {}, 'a pantalla completa, pulsarlo cierra');
  assert.deepEqual(rosetonAPantallaCompleta(4), { 4: NIVEL.bloque });
  assert.equal(hayRosetonAmpliado({}), false);
  assert.equal(hayRosetonAmpliado({ 1: NIVEL.comprimido }), false);
  assert.equal(hayRosetonAmpliado({ 1: NIVEL.tarjeta }), true);
  assert.equal(hayRosetonAmpliado({ 1: NIVEL.bloque }), true);
  // La app: el pulsar y el doble toque ya no ponen el foco (el segundo toque antes lo hacía); Esc cierra primero el rosetón.
  assert.match(APP, /roseton\(pv\) \{[^}]*alternarRoseton\(estado\.rosetones, pv\)/);
  assert.doesNotMatch(APP.match(/roseton\(pv\) \{[^}]*\}/)[0], /irA\(/);
  assert.match(APP, /rosetonCompleto\(pv\) \{[^}]*rosetonAPantallaCompleta\(pv\)/);
  assert.match(APP, /cerrarRoseton\(\) \{\s*estado\.rosetones = \{\};/);
  // Antes solo va el «+n» abierto (una lista flotante, forma C); después, el rosetón, antes que nada más.
  assert.match(APP, /cerrar\(\) \{\s*if \(estado\.accionesAbiertas\?\.size\) [^\n]*\n\s*else if \(hayRosetonAmpliado\(estado\.rosetones\)\) estado\.rosetones = \{\};/);
});

/** Un documento de mentira con un rosetón ampliado o no: lo que querySelector responde sobre la carta. */
function gestosConRoseton({ ampliado = false } = {}) {
  const oyentes = [];
  const documento = { defaultView: { innerWidth: 1366, innerHeight: 768 }, addEventListener: (tipo, f) => oyentes.push([tipo, f]), removeEventListener() {} };
  const raiz = { ownerDocument: documento, addEventListener: (tipo, f) => oyentes.push([tipo, f]), removeEventListener() {}, querySelector: (sel) => (ampliado && sel.includes('.roseton.nivel-2') ? {} : null) };
  const llamadas = [];
  const m = new Proxy({}, { get: (_, nombre) => (...args) => { llamadas.push([nombre, ...args]); } });
  instalar(raiz, m);
  return { disparar: (tipo, e) => { for (const [tp, f] of oyentes) if (tp === tipo) f(e); }, llamadas };
}
const objetivo = (respuestas) => ({ closest: (sel) => { for (const [trozo, v] of Object.entries(respuestas)) if (sel.includes(trozo)) return v; return null; } });
const dedo = (pv) => objetivo({ '.roseton': {}, '[data-roseton]': { dataset: { roseton: String(pv), x: 'ALTA' } }, '[data-x]': { dataset: { x: 'ALTA' } } });

test('#91 gestos: pulsar un rosetón lo alterna; pulsar fuera del ampliado lo cierra sin hacer nada más; el doble toque va a pantalla completa y no pone el foco', async () => {
  const { mock } = await import('node:test');
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 30_000_000 });
  try {
    const g = gestosConRoseton();
    g.disparar('click', { target: dedo(3), preventDefault() {} });
    assert.deepEqual(g.llamadas, [['roseton', 3]]);
    // Fuera de él, con uno ampliado: se cierra, y el clic no entra en lo que había debajo.
    const f = gestosConRoseton({ ampliado: true });
    const sobreUnPv = objetivo({ '[data-pv]': { dataset: { pv: '2', x: 'R1' } }, '[data-x]': { dataset: { x: 'R1' } } });
    f.disparar('click', { target: sobreUnPv, preventDefault() {} });
    assert.deepEqual(f.llamadas, [['cerrarRoseton']], 'solo cierra');
    // Sobre un rosetón (aunque haya uno ampliado), no es «fuera»: alterna.
    const d = gestosConRoseton({ ampliado: true });
    d.disparar('click', { target: dedo(3), preventDefault() {} });
    assert.deepEqual(d.llamadas, [['roseton', 3]]);
    // Un doble toque: el primer clic abre, el segundo no cierra, y el dblclick (aunque llegue a un ancestro tras repintar) lo lleva a pantalla completa.
    const h = gestosConRoseton();
    h.disparar('click', { target: dedo(7), preventDefault() {} });
    mock.timers.tick(120);
    h.disparar('click', { target: dedo(7), preventDefault() {} });
    h.disparar('dblclick', { target: objetivo({}), preventDefault() {} });
    assert.deepEqual(h.llamadas, [['roseton', 7], ['rosetonCompleto', 7]], 'abrir, y pantalla completa; no cerrar ni enfocar');
    // Lo mismo si el dblclick llega al propio rosetón.
    const j = gestosConRoseton();
    j.disparar('click', { target: dedo(1), preventDefault() {} });
    mock.timers.tick(100);
    j.disparar('click', { target: dedo(1), preventDefault() {} });
    j.disparar('dblclick', { target: dedo(1), preventDefault() {} });
    assert.deepEqual(j.llamadas, [['roseton', 1], ['rosetonCompleto', 1]]);
    // Pasado el rato, pulsar el mismo otra vez es cerrar.
    mock.timers.tick(2000);
    j.disparar('click', { target: dedo(1), preventDefault() {} });
    assert.deepEqual(j.llamadas.at(-1), ['roseton', 1]);
    // El «cerrar» de la pantalla completa.
    const c = gestosConRoseton({ ampliado: true });
    c.disparar('click', { target: objetivo({ '[data-roseton-cerrar]': { dataset: {} }, '.roseton-pantalla': {} }), preventDefault() {} });
    assert.deepEqual(c.llamadas, [['cerrarRoseton']]);
  } finally {
    mock.timers.reset();
  }
});

test('#91 el rosetón se llama como la posición de mi alta (su 0 en el idioma de la cuenta), no «de mi alta»; el ampliado y la pantalla completa lo repiten', async () => {
  const { eje, compra } = await ejemploCompra();
  const alta = eje.alta('huesped').id;
  const a = await arbol({ foco: { X: compra.id, pv: 0 }, rosetones: { 3: NIVEL.tarjeta } }, eje, 'huesped', ORDENADOR);
  for (const r of a.rosetones) assert.equal(r.etiqueta, C.etiqueta(eje, alta, r.pv, { idioma: a.idioma }), 'el nombre de la fila de la época');
  const h = html(a);
  assert.doesNotMatch([...h.matchAll(/<button[^>]*data-roseton="\d"[^>]*>/g)].map((m) => m[0]).join(''), /de mi alta/, 'ningún rosetón dice «de mi alta»');
  assert.equal(TEXTOS.es.deMiAlta, undefined, 'el texto «de mi alta» ya no existe');
  for (const r of a.rosetones) assert.match(h, new RegExp(`data-roseton="${r.pv}" data-x="${alta}" title="${r.etiqueta}: lo mío`));
  assert.match(h, /<span class="etiqueta">comunicación<\/span>/, 'el ampliado enseña el nombre de la posición');
  // La pantalla completa: la misma vista, con todo lo que el núcleo da de esa posición.
  const p = await arbol({ foco: { X: compra.id, pv: 0 }, rosetones: rosetonAPantallaCompleta(0) }, eje, 'huesped', ORDENADOR);
  const hp = html(p);
  assert.match(hp, /<section class="roseton-pantalla"[^>]*data-roseton-pantalla="0"/);
  assert.match(hp, /data-roseton-cerrar/);
  assert.equal((hp.match(/data-roseton="\d"/g) ?? []).length, 10, 'los diez rosetones, una sola vez (el «cerrar» no es otro)');
  const completo = p.rosetones.find((r) => r.pv === 0);
  assert.equal(completo.ocupantes.total, C.ocupantes(eje, alta, 0, 0, 1, { idioma: p.idioma }).total);
  assert.equal(completo.ocupantes.lista.length, Math.min(completo.ocupantes.total, 10), 'lo que el núcleo da, hasta una página');
  for (const o of completo.ocupantes.lista) assert.ok(hp.includes(o.texto.replace(/&/g, '&amp;')) || o.texto === '');
  // En la pantalla completa un PV, en Sequenced y sin rosetones, tampoco hay hoja.
  const movil = html(await arbol({ foco: { X: compra.id, pv: 0 }, rosetones: rosetonAPantallaCompleta(0) }, eje, 'huesped', { ancho: 400, alto: 700 }));
  assert.doesNotMatch(movil, /roseton-pantalla/);
});

test('#91 contraste: el rosetón (lo mío) tiene borde y fondo más marcados que los PV del foco, en claro y en oscuro, solo con las variables de siempre', () => {
  // Los tintes de los PV del foco (el bloque de colores de carta/estilo.css): borde y fondo suaves, en claro y en oscuro.
  const foco = { claro: [55, 8], oscuro: [62, 13] };
  assert.match(CSS, /:root\{--tinte-borde:55%; --tinte-fondo:8%\}/);
  assert.match(CSS, /--tinte-borde:62%; --tinte-fondo:13%/);
  // Los del rosetón, declarados tras sus reglas de posición, claro y oscuro (por preferencia del sistema y forzado).
  const desde = CSS.slice(CSS.indexOf('los rosetones son lo MÍO'));
  const claro = desde.match(/:root\{--tinte-borde-roseton:(\d+)%; --tinte-fondo-roseton:(\d+)%\}/);
  assert.ok(claro, 'los tintes del rosetón están declarados');
  assert.ok(Number(claro[1]) > foco.claro[0], 'borde más marcado que el de los PV (claro)');
  assert.ok(Number(claro[2]) >= 3 * foco.claro[1], 'fondo, al menos el triple de teñido (claro)');
  const oscuros = [...desde.matchAll(/--tinte-fondo-roseton:(\d+)%\}/g)].map((m) => Number(m[1]));
  assert.equal(oscuros.length, 3, 'claro y los dos oscuros (por preferencia y forzado) lo declaran');
  assert.ok(oscuros.every((v) => v >= 2 * foco.oscuro[1]), 'también en oscuro, el fondo del rosetón supera con mucho el del foco');
  // El borde grueso (2 px) y mezclas de variables existentes; ningún color literal nuevo.
  const r = regla('.roseton[data-roseton]', desde);
  assert.match(r, /border-width:2px/);
  assert.match(r, /--borde:color-mix\(in oklab,var\(--c,var\(--rule\)\) var\(--tinte-borde-roseton\),var\(--fg\)\)/);
  assert.match(r, /--fondo:color-mix\(in oklab,var\(--c,var\(--rule\)\) var\(--tinte-fondo-roseton\),var\(--panel\)\)/);
  const bloque = CSS.slice(CSS.indexOf('los rosetones son lo MÍO'), CSS.indexOf('/* un PV a pantalla completa: flechas'));
  assert.doesNotMatch(bloque, /#[0-9a-fA-F]{3,8}/, 'sin colores nuevos');
  assert.match(bloque, /@supports not \(color:color-mix/, 'y con respaldo sin color-mix');
});

// ---------- #93 la cara 5 ----------

/** Un registro con un instante y un número con miles en el BTML, y un texto hostil, escrito sobre la compra. */
async function registroConDatos(payload) {
  const { eje, compra } = await ejemploCompra();
  const ev = await eje.escribir({ autor: 'huesped', sobre: compra.id, en: direccion([3, 1, 1]), t: T1, movimientos: [pagaElCoste('huesped')], payload });
  return { eje, compra, X: ev?.id ?? eje.sobre(compra.id, direccion([3, 1, 1])).at(-1).id };
}

test('#93 el reverso es un editor de BTML de solo lectura: <pre><code> con líneas numeradas, sangrado por nivel y un tipo por valor; sin el campo repetido ni «cuando —/10»', async () => {
  const { eje, compra } = await ejemploCompra();
  const a = await arbol({ foco: { X: compra.id, pv: 5 } }, eje, 'huesped', ORDENADOR);
  assert.equal(a.centro.cara, 'reverso');
  const b = a.centro.btml;
  assert.equal(b.formateado, false);
  assert.deepEqual(b.lineas.map((l) => l.n), b.lineas.map((_, i) => i + 1), 'numeradas desde 1 sin saltos');
  assert.ok(b.lineas.length > 5);
  assert.ok(b.lineas.some((l) => l.nivel === 0) && b.lineas.some((l) => l.nivel >= 2), 'sangrado por nivel');
  const plano = b.lineas.map((l) => l.trozos.map((z) => z.v).join(''));
  assert.equal(plano[0], '[', 'el BTML tal como es: la décupla abre en la primera línea');
  assert.ok(plano.some((l) => /^ {4}\[\{"ref": "[0-9a-f]{64}"/.test(l)), 'una referencia, cruda y con su sangría');
  assert.deepEqual(b.criterios, [], 'los criterios se enseñan al formatear');
  const h = html(a);
  assert.match(h, /<pre class="btml-codigo" tabindex="0" aria-label="[^"]*"><code><span class="btml-linea" data-nivel="0"><span class="btml-n" aria-hidden="true">1<\/span>/);
  assert.match(h, /<button type="button" class="btml-formatear" data-formatear aria-pressed="false"/);
  assert.match(h, /<span class="t-ref">&quot;[0-9a-f]{64}&quot;<\/span>/);
  // Lo que sobra: el campo editable repetido (data-campo del 5) y los pasos sin valor.
  assert.doesNotMatch(h, /class="campo campo-5"|data-campo="5"/);
  assert.doesNotMatch(h, /cuando\s*(<[^>]+>)*\s*—|cuando <\/b> —/);
  assert.doesNotMatch(h, /—<small>\/10<\/small>/);
  assert.doesNotMatch(h, /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z<\/time>/, 'ni la fecha ISO cruda en la línea de la plantilla');
  assert.match(h, /<time datetime="2026-11-07T13:30:00Z">7 nov 2026, 13:30<\/time>/);
  // Solo lectura: ningún input ni textarea dentro del editor.
  assert.doesNotMatch(h.match(/<div class="btml-editor[^]*?<\/pre>/)[0], /<input|<textarea|contenteditable/);
  // El tipo de cada valor sale en la clase: texto, número, referencia, fecha.
  const ahora = await registroConDatos([['2026-11-07T13:30:00Z'], [1234567.5], ['hola']]);
  const k = lineasDeBtml(ahora.eje.obtener(ahora.X).payload, FORMATO_INICIAL, { eje: ahora.eje });
  const tipos = new Set(k.flatMap((l) => l.trozos.map((z) => z.k)));
  for (const tipo of ['llave', 'sangria', 'texto', 'numero', 'fecha']) assert.ok(tipos.has(tipo), 'tipo ' + tipo);
});

test('#93 el BTML se pinta como texto escapado: nada de él es HTML ni se ejecuta', async () => {
  const hostil = ['<img src=x onerror=alert(1)>', '"><script>alert(1)</script>', 'a&b <b>negrita</b>'];
  const { eje, X } = await registroConDatos([[hostil[0]], [hostil[1], hostil[2]]]);
  for (const formateado of [false, true]) {
    const a = await arbol({ foco: { X, pv: 5 }, formato: { ...FORMATO_INICIAL, formateado } }, eje, 'huesped', ORDENADOR);
    const h = html(a);
    const editor = h.match(/<pre class="btml-codigo"[^]*?<\/pre>/)[0];
    assert.doesNotMatch(editor, /<img|<script|<b>|onerror=alert\(1\)>/, 'ninguna etiqueta del dato llega al HTML');
    assert.ok(editor.includes('&lt;img src=x onerror=alert(1)&gt;'));
    assert.ok(editor.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
    assert.ok(editor.includes('a&amp;b &lt;b&gt;negrita&lt;/b&gt;'));
    assert.doesNotMatch(h, /<script/i);
  }
});

test('#93 «formatear» alterna el BTML crudo y el formateado (fechas legibles, números con su formato, nombres por el 0 en lugar de ids) y enseña los criterios', async () => {
  const { eje, compra, X } = await registroConDatos([['2026-11-07T13:30:00Z', '2026-11-08'], [1234567.5], ['compra']]);
  const cruda = await arbol({ foco: { X, pv: 5 }, formato: FORMATO_INICIAL }, eje, 'huesped', ORDENADOR);
  const crudo = cruda.centro.btml.lineas.map((l) => l.trozos.map((z) => z.v).join('')).join('\n');
  assert.match(crudo, /"2026-11-07T13:30:00Z"/);
  assert.match(crudo, /1234567\.5/);
  const f = await arbol({ foco: { X, pv: 5 }, formato: { ...FORMATO_INICIAL, formateado: true } }, eje, 'huesped', ORDENADOR);
  const b = f.centro.btml;
  const texto = b.lineas.map((l) => l.trozos.map((z) => z.v).join('')).join('\n');
  assert.equal(b.formateado, true);
  assert.doesNotMatch(texto, /2026-11-07T13:30:00Z/, 'la fecha, legible');
  assert.match(texto, /7 nov 2026, 13:30/);
  assert.match(texto, /8 nov 2026/);
  assert.match(texto, /^ {4}1234567\.5$/m, 'el número, como viene por defecto');
  // Los criterios: fecha, números, estilo (en este navegador) e idioma (en la configuración), cada uno con sus valores en el idioma.
  assert.deepEqual(b.criterios.map((c) => c.clave), ['fecha', 'numeros', 'estilo', 'vista', 'idioma']);
  assert.deepEqual(b.criterios.map((c) => c.guardaEn), ['sesion', 'sesion', 'sesion', 'sesion', 'libro'], 'sin cuenta, en memoria; el idioma, en el libro');
  assert.equal(b.criterios[3].etiqueta, 'al abrir');
  assert.deepEqual(b.criterios[0].opciones.map((o) => o.valor), [...CRITERIOS.fecha]);
  assert.ok(b.criterios.every((c) => c.etiqueta && c.opciones.every((o) => o.texto && !/^criterio_/.test(o.texto))));
  assert.ok(b.criterios[4].opciones.some((o) => o.valor === 'es'));
  const h = html(f);
  assert.match(h, /<button type="button" class="btml-formatear" data-formatear aria-pressed="true"/);
  assert.match(h, /<fieldset class="btml-criterios"><legend>criterios de formato<\/legend>/);
  for (const c of ['fecha', 'numeros', 'estilo', 'vista', 'idioma']) assert.match(h, new RegExp(`<select data-formato="${c}">`));
  assert.match(h, /<option value="legible" selected>/);
  // Cada criterio cambia lo que se lee: números agrupados, fecha corta y larga, ISO, listas en una línea.
  const con = async (cambio) => (await arbol({ foco: { X, pv: 5 }, formato: { ...FORMATO_INICIAL, formateado: true, ...cambio } }, eje, 'huesped', ORDENADOR)).centro.btml.lineas.map((l) => l.trozos.map((z) => z.v).join('')).join('\n');
  assert.match(await con({ numeros: 'agrupados' }), /1\.234\.567,5/);
  assert.match(await con({ fecha: 'iso' }), /2026-11-07T13:30:00Z/);
  assert.match(await con({ fecha: 'larga' }), /7 de noviembre de 2026/);
  assert.match(await con({ fecha: 'corta' }), /7\/11\/26/);
  const compacto = await con({ estilo: 'compacto' });
  assert.ok(compacto.split('\n').length < texto.split('\n').length, 'las listas, en una línea');
  assert.match(compacto, /^ {2}\[7 nov 2026, 13:30, 8 nov 2026\],?$/m);
  // Los nombres por el 0, no por el id: la referencia cruda lleva el id; la formateada, el 0 del registro.
  const compraCruda = await arbol({ foco: { X: compra.id, pv: 5 }, formato: FORMATO_INICIAL }, eje, 'huesped', ORDENADOR);
  const refCruda = compraCruda.centro.btml.lineas.flatMap((l) => l.trozos).find((z) => z.k === 'ref' && z.v.length > 20);
  assert.ok(refCruda, 'la compra lleva referencias, con su id crudo');
  const conRefs = await arbol({ foco: { X: compra.id, pv: 5 }, formato: { ...FORMATO_INICIAL, formateado: true } }, eje, 'huesped', ORDENADOR);
  const nombres = conRefs.centro.btml.lineas.flatMap((l) => l.trozos).filter((z) => z.k === 'nombre').map((z) => z.v);
  assert.ok(nombres.length && nombres.every((n) => !/^[0-9a-f]{64}$/.test(n)), 'nombres: ' + nombres.join(', '));
  assert.ok(conRefs.centro.btml.lineas.every((l) => l.trozos.every((z) => z.k !== 'ref')), 'ningún id crudo al formatear');
});

test('#93 los criterios en la carta (arbol → editor) leen lo guardado; el idioma de la cuenta cambia los nombres y las fechas del formateado', async () => {
  const { eje, X } = await registroConDatos([['2026-11-07T13:30:00Z'], [1234567.5]]);
  const es = editorDeBtml(eje, X, { ...FORMATO_INICIAL, formateado: true }, { idioma: 'es', idiomas: C.idiomas() });
  const en = editorDeBtml(eje, X, { ...FORMATO_INICIAL, formateado: true }, { idioma: 'en', idiomas: C.idiomas() });
  const lee = (e) => e.lineas.map((l) => l.trozos.map((z) => z.v).join('')).join('\n');
  assert.match(lee(es), /7 nov 2026, 13:30/);
  assert.match(lee(en), /Nov 7, 2026, 1:30 PM/);
  assert.equal(es.criterios.find((c) => c.clave === 'idioma').valor, 'es');
  // Sin registro, sin líneas (y no se rompe).
  assert.deepEqual(editorDeBtml(eje, 'f'.repeat(64), FORMATO_INICIAL).lineas, []);
});

test('#93 en el reverso nada se escribe a mano: ni input ni campo del 5; el aviso y el botón están en la hoja de textos', async () => {
  for (const k of ['btmlTitulo', 'btmlFormatear', 'btmlFormatearTitulo', 'btmlCriterios', 'btmlCriteriosAyuda', 'btmlAlAbrir', 'btmlSinDatos', 'criterio_idioma', 'rosetonTitulo', 'rosetonCerrar', 'rosetonCerrarTitulo', 'rosetonVacio']) assert.ok(TEXTOS.es[k] && t(k) !== k, k);
  // Los valores de los criterios salen de la plantilla de la época (con su nombre en el idioma), no de la hoja de textos de la carta.
  assert.equal(Object.keys(TEXTOS.es).filter((k) => /^criterio_(fecha|numeros|estilo)/.test(k)).length, 0);
  const { eje, compra } = await ejemploCompra();
  const h = html(await arbol({ foco: { X: compra.id, pv: 5 }, formato: { ...FORMATO_INICIAL, formateado: true } }, eje, 'huesped', ORDENADOR));
  const editor = h.match(/<div class="btml-editor[^]*?<\/pre>/)[0];
  assert.doesNotMatch(editor, /<input|<textarea|contenteditable/);
  // Lo que el CSS usa: monoespaciada y los colores salen de las variables de la carta.
  assert.match(regla('.btml-codigo'), /font:12\.5px\/1\.55 var\(--mono\)/);
  assert.match(regla('.btml-codigo'), /white-space:pre/);
  for (const clase of ['llave', 'clave', 'texto', 'numero', 'ref', 'fecha', 'nombre']) assert.match(regla('.t-' + clase), /color:/, 't-' + clase);
  const colores = ['llave', 'clave', 'texto', 'numero', 'ref', 'fecha', 'nombre'].map((c) => regla('.t-' + c)).join('');
  assert.doesNotMatch(colores, /#[0-9a-fA-F]{3,8}\b/, 'solo variables de la carta');
});
