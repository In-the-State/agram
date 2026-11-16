// La carta en lenguaje llano (VG 14-11, repaso de la beta #9, #11, #12, #15, #18, #27; ISSUES #83 a #87):
//   #83 el usuario nunca ve una clave interna de la época (plantillas, reglas, series, ajustes): ni nombres canónicos, ni
//       «write-to-x», ni «E:casa/EUR»; lo que hizo un asiento del libro se dice crear, gastar, pasar, reservar; los ajustes
//       se describen por lo que deciden («dónde se guardan los archivos», «quién sella», «quién cobra»)
//   #84 toda alta nace con su HTML básico en el PV0 («hola» en medio) y el centro enseña el HTML del PV0 del foco en el
//       <iframe sandbox>; sin JavaScript en ese HTML
//   #85 cada celda de la cruceta de un sitio enseña su término y su valor; tocarla es configurar esa posición
//   #86 «soy» solo en el modo ejemplo, como «ver como»
//   #87 el aro sobre un hueco dice en llano qué crea y dónde, ofrece lo que el núcleo escribe ahí y, si no hay nada, no se abre
// Lo visual está en las capturas de equipo/mockups/capturas/beta-cartallana.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { instalar } from '../carta/gestos.js';
import { arbol, creableEn, conEtiquetasLlanas, preferencias, sinNombreInterno, motivosEnLlano, enviar } from '../carta/carta.js';
import { html, htmlConfiguracion } from '../carta/dom.js';
import { Archivos, INICIALES, htmlInicial, inicial, adjuntarHtmlInicial } from '../carta/archivos.js';
import * as cuentas from '../carta/cuentas.js';
import * as guia from '../carta/guia.js';
import { TEXTOS, t, etiquetaLlana, holaInicial } from '../carta/textos.js';
import * as C from '../src/contrato.js';
import * as A from '../src/acciones.js';
import * as exterior from '../src/exterior.js';
import * as modelos from '../src/modelos.js';
import { EPOCA_0_BTML } from '../src/epocas.js';
import { nombreDeRegla } from '../src/bqlm.js';
import { PLANTILLAS_DE_EPOCA_DATOS, REGLAS_DE_EPOCA_DATOS } from '../datos/epocas/epocas.js';
import { ejemploCompra } from '../ejemplos/ikisai/compra-food.mjs';

const GRANDE = { ancho: 1920, alto: 1080 };
const MOVIL = { ancho: 390, alto: 844 };
const ES = { idioma: 'es' };

// ---------- lo que se ve: el texto y los atributos que lee una persona, sin el BTML en crudo ni el CSS ----------

/** El texto visible de un HTML y sus title, aria-label, placeholder y alt; sin <style>, <code>, <pre> ni el «ver en BTML» (el editor técnico). */
const visible = (h) => h
  .replace(/<option value="(burn|transfer|mint|lock|release) [^"]*">[^<]*<\/option>/g, '') // el contenido de una propuesta que escribió un ejemplo, en el texto canónico de sus movimientos (dato del ejemplo: se apunta en el informe)
  .replace(/una serie concreta \(E:casa\/EUR\)/g, '') // la ayuda de «second factor» (texto de la época: un ejemplo de formato; se apunta en el informe)
  .replace(/<(style|details class="btml"|code|pre)[^]*?<\/(style|details|code|pre)>/g, '')
  .replace(/<[^>]+>/g, (m) => [...m.matchAll(/(?:title|aria-label|placeholder|alt)="([^"]*)"/g)].map((x) => ' ' + x[1] + ' ').join(''))
  .replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#39;/g, "'");

/** Los nombres internos de la época: plantillas (datos y transacción), reglas y estaciones, tal como están en datos/epocas/epocas.js. */
function nombresInternos() {
  const nombres = new Set();
  const nombre = (d) => (Array.isArray(d) && Array.isArray(d[0]) && typeof d[0][0] === 'string' ? d[0][0] : null);
  const archivos = new Set();
  for (const p of [...PLANTILLAS_DE_EPOCA_DATOS, ...REGLAS_DE_EPOCA_DATOS]) if (typeof p.archivo === 'string') archivos.add(p.archivo.replace(/\.json$/, '')); // «write-to-x», «the-cost-of-writing»: el nombre de su archivo
  for (const { nombre: n } of A.plantillasDeTransaccion({ epoca: EPOCA_0_BTML })) nombres.add(n);
  for (const { nombre: n } of C.plantillas(null, { epoca: EPOCA_0_BTML })) nombres.add(n);
  for (const e of A.estacionesDelAnuncio({ epoca: EPOCA_0_BTML })) nombres.add(e.nombre);
  // Las de una palabra son palabras corrientes («close», «measure»…): una clave interna es la de varias palabras o la de su archivo.
  const claves = [];
  for (const n of nombres) if (/\s/.test(n)) claves.push(n);
  claves.push(...[...archivos].filter((a) => a.includes('-')));
  return claves;
}
const SERIE_CRUDA = /(^|[^\p{L}\d])[ETRP]:[\p{L}\d][\p{L}\d.:/-]*/u;
const contiene = (v, n) => v.toLowerCase().includes(n.toLowerCase());

/** Las claves internas que pinta un HTML: nombres de la época (sus formas con espacios y con guiones) y series en crudo (T:minuto, E:casa/EUR). */
function fugas(h, nombres) {
  const v = visible(h);
  return [...nombres.filter((n) => contiene(v, n)), ...(SERIE_CRUDA.test(v) ? [v.match(SERIE_CRUDA)[0].trim()] : [])];
}

const MEDIDAS = [['ordenador', GRANDE], ['móvil', MOVIL]];

// ---------- #83 ----------

test('#83 el detector de claves internas funciona: ve «write to X», «write-to-x» y «E:casa/EUR» donde estén', () => {
  const nombres = nombresInternos();
  assert.ok(nombres.includes('write to X') && nombres.includes('write-to-x'), 'las plantillas, con espacios y con el nombre de su archivo');
  assert.ok(nombres.includes('the-cost-of-writing'), 'las reglas, por el nombre de su archivo');
  assert.deepEqual(fugas('<p>ahí pone write to X</p>', nombres), ['write to X']);
  assert.deepEqual(fugas('<button title="the-cost-of-writing">x</button>', nombres), ['the-cost-of-writing']);
  assert.equal(fugas('<td>12 E:casa/EUR</td>', nombres).length, 1);
  assert.equal(fugas('<pre>write to X</pre><details class="btml"><code>E:casa/EUR</code></details>', nombres).length, 0, 'el BTML en crudo no cuenta');
  assert.equal(fugas('<p>escribir en X, 12 EUR</p>', nombres).length, 0);
});

test('#83 la carta no pinta ninguna clave interna de la época: los diez PV, el aro, la cruceta, los formularios y la configuración, en el ordenador y en el móvil', async () => {
  const nombres = nombresInternos();
  const { eje, compra } = await ejemploCompra();
  const alta = eje.alta('huesped').id;
  const estados = [];
  for (const pv of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]) estados.push([{ foco: { X: compra.id, pv } }, 'foco ' + pv]);
  for (const lugar of ['0', '1', '3.1', '4', '6', '9']) estados.push([{ foco: { X: compra.id, pv: 0 }, sitio: { X: alta, lugar, general: lugar === '0' } }, 'sitio ' + lugar]);
  for (const pv of [1, 2, 3, 4, 6, 7, 8, 9]) estados.push([{ foco: { X: compra.id, pv: 0 }, aro: { X: compra.id, pv } }, 'aro ' + pv]);
  for (const [pv, en] of [[3, undefined], [1, undefined], [4, undefined], [1, [3]]]) estados.push([{ foco: { X: compra.id, pv: 0 }, aro: { X: compra.id, nuevo: pv, ...(en ? { en: [...en, pv] } : {}) } }, 'aro hueco ' + pv]);
  for (const { id, nombre } of A.plantillasDeTransaccion({ epoca: EPOCA_0_BTML })) estados.push([{ foco: { X: compra.id, pv: 0 }, formulario: { X: compra.id, accion: id, valores: {} } }, 'formulario ' + nombre]);
  let vistos = 0;
  for (const [cuando, medidas] of MEDIDAS) {
    for (const [estado, que] of estados) {
      const h = html(await arbol(estado, eje, 'huesped', medidas, ES));
      assert.deepEqual(fugas(h, nombres), [], `${que} (${cuando}) pinta una clave interna`);
      vistos++;
    }
  }
  assert.ok(vistos >= 100);
  // la configuración: la de mi alta, con sus dos partes, y la de una cuenta real
  const { cuenta, eje: eje2, privada } = await cuentas.crearCuenta({ nombre: 'Vic', idioma: 'es', htmlInicial: true });
  for (const parte of ['2', '9']) {
    const p = conEtiquetasLlanas(preferencias(eje2, cuenta.identidad), 'es');
    const extra = { preferencias: p, claveLectura: '', guiaAjustes: conEtiquetasLlanas(guia.ajustesEditables(eje2, cuenta.identidad), 'es'), exteriorAjustes: conEtiquetasLlanas(guia.ajustesEditablesDe(exterior.AJUSTES.plantilla, eje2, cuenta.identidad), 'es'), parteConfiguracion: parte };
    const h = html(await arbol({ foco: { X: cuenta.alta, pv: 0 } }, eje2, cuenta.identidad, GRANDE, ES), extra);
    assert.deepEqual(fugas(h, nombres), [], 'la configuración ' + parte);
  }
  void privada;
});

test('#83 los mensajes de la época llegan sin el nombre interno de la regla o de la plantilla que llevan delante: el camino de una cuenta nueva, los motivos y las lecturas', async () => {
  const { cuenta, eje } = await cuentas.crearCuenta({ nombre: 'Vic', idioma: 'es' });
  assert.equal(sinNombreInterno('only persons mint: cocina es una cosa', eje), 'cocina es una cosa');
  assert.equal(sinNombreInterno('set a group price: ana fija el precio', eje), 'ana fija el precio');
  assert.equal(sinNombreInterno('nada: que quitar', eje), 'nada: que quitar', 'lo que no empieza por un nombre interno, igual');
  assert.equal(sinNombreInterno('only persons mint', eje), 'only persons mint');
  assert.deepEqual(motivosEnLlano([{ regla: 'only persons mint', mensaje: 'only persons mint: no' }, { regla: null, mensaje: 'otro' }], eje).map((m) => m.mensaje), ['no', 'otro']);
  // el núcleo sigue dando la regla aparte y el mensaje entero (test/carta.test.js): quien quita el nombre es lo que se enseña
  const a = await arbol({ foco: { X: cuenta.alta, pv: 9 } }, eje, cuenta.identidad, GRANDE, ES);
  assert.ok(a.camino.pasos.length > 0);
  for (const p of a.camino.pasos) assert.doesNotMatch(String(p.falta), /^(a key is declared at its alta|set a group price|anchor here): /);
  assert.deepEqual(fugas(html(a), nombresInternos()), []);
  const mal = await enviar(eje, cuenta.alta, 'apply a resource', { quantity: 0 }, cuenta.identidad, undefined, { idioma: 'es' });
  assert.equal(mal.ok, false);
  assert.ok(motivosEnLlano(mal.motivos, eje).every((m) => !/^[a-z ]+: /.test(m.mensaje) || !mal.motivos.some((x) => x.regla && m.mensaje.startsWith(x.regla + ': '))));
});

test('#83 lo que hizo un asiento del libro se dice en llano: crear, gastar, reservar; no acunar, quemar ni bloquear', async () => {
  const { eje, compra } = await ejemploCompra();
  assert.deepEqual(['acunar', 'quemar', 'transferir', 'bloquear', 'liberar'].map((p) => t('primitiva_' + p)), ['crear', 'gastar', 'transferir', 'reservar', 'liberar']);
  const v = visible(html(await arbol({ foco: { X: compra.id, pv: 6 } }, eje, 'huesped', GRANDE, ES)));
  assert.match(v, /crear 1 hora · gastar 1 hora · transferir 12 euros de Casa de ejemplo/);
  assert.doesNotMatch(v, /\b(acunar|quemar|bloquear)\b/);
  // el aro del móvil y el sequenced dicen lo mismo
  const m = visible(html(await arbol({ foco: { X: compra.id, pv: 6 } }, eje, 'huesped', MOVIL, ES)));
  assert.doesNotMatch(m, /\b(acunar|quemar|bloquear)\b/);
});

test('#83 la tabla de lo que entra y sale de un recurso no deja la clave de la serie en el title', async () => {
  const { eje, compra } = await ejemploCompra();
  const h = html(await arbol({ foco: { X: compra.id, pv: 1 } }, eje, 'huesped', GRANDE, ES));
  assert.doesNotMatch(h, /title="[ETRP]:/);
  assert.match(h, /<th scope="row" title="hora">hora<\/th>/);
});

test('#83 los ajustes se describen por lo que hacen, sin nombrar AARPIA, StateArk ni Blossom en la etiqueta; los nombres técnicos van en la ayuda', async () => {
  const { eje } = await ejemploCompra();
  const llanas = { 'relay url': 'por dónde viajan los eventos', 'blossom url': 'dónde se guardan los archivos', 'seal url': 'quién sella', 'pay url': 'quién cobra', 'guide url': 'dónde está la guía', 'sync url': 'dónde se comparte el libro' };
  for (const [clave, etiqueta] of Object.entries(llanas)) assert.equal(etiquetaLlana(clave, 'es'), etiqueta);
  assert.equal(etiquetaLlana('blossom url', 'en'), null, 'sin textos en ese idioma, la de la época');
  const ext = conEtiquetasLlanas(guia.ajustesEditablesDe(exterior.AJUSTES.plantilla, eje, 'huesped', {}, ES), 'es');
  const etiquetas = new Map(ext.campos.map((c) => [c.clave, c]));
  for (const [clave, etiqueta] of Object.entries(llanas)) if (etiquetas.has(clave)) assert.equal(etiquetas.get(clave).etiqueta, etiqueta);
  const todas = [...ext.campos, ...conEtiquetasLlanas(guia.ajustesEditables(eje, 'huesped', {}, ES), 'es').campos, ...conEtiquetasLlanas(preferencias(eje, 'huesped'), 'es').campos];
  for (const c of todas) assert.doesNotMatch(c.etiqueta, /AARPIA|StateArk|Blossom|Anthropic|SIP|epoch\./i, 'etiqueta: ' + c.etiqueta);
  assert.match(etiquetas.get('blossom url').ayuda, /Blossom/, 'el nombre técnico está en la ayuda del campo');
  assert.match(etiquetas.get('pay url').ayuda, /StateArk/);
  assert.ok(Object.keys(TEXTOS).every((i) => Object.keys(TEXTOS[i]).filter((k) => k.startsWith('ajuste_')).length >= 19));
  const h = htmlConfiguracion({ nombre: 'x', campos: [] }, { guia: null, exterior: ext, parte: '9' });
  assert.match(visible(h), /dónde se guardan los archivos[^]*quién sella[^]*quién cobra/);
  assert.doesNotMatch(h, /<label[^>]*>[^<]*(AARPIA|StateArk|Blossom)/);
});

// ---------- #84 ----------

const sha = (texto) => createHash('sha256').update(texto).digest('hex');

test('#84 el HTML inicial es «hola» en medio, texto plano en el idioma de la cuenta, sin JavaScript, sin red y con su id por contenido', async () => {
  const es = htmlInicial('es');
  assert.match(es, /<p>hola<\/p>/);
  assert.match(htmlInicial('en'), /<p>hello<\/p>/);
  assert.equal(holaInicial('fr'), 'hola', 'sin su idioma, el primero');
  for (const x of [es, htmlInicial('en')]) {
    assert.doesNotMatch(x, /<script|javascript:|\son[a-z]+\s*=|<link|@import|https?:|url\(|<iframe|<object|<embed/i);
    assert.match(x, /place-items:center/, 'en medio');
  }
  const i = await inicial('es');
  assert.equal(i.id, sha(es));
  assert.equal(i.referencia, 'archivo:' + sha(es));
  assert.ok(INICIALES.has(i.id) && INICIALES.has(sha(htmlInicial('en'))), 'la carta los trae a mano');
  // sin servidor ni red, se ve: el archivo está en la propia carta
  const a = new Archivos({ destino: () => null, fetch: async () => { throw new Error('sin red'); } });
  const e = a.contenido(i.id);
  assert.deepEqual([e.estado, e.tipo, e.texto], ['listo', 'text/html', es]);
});

test('#84 toda alta nace con su HTML en el PV0: una cuenta nueva y una cosa dada de alta; el nombre sigue siendo el 0 de la alta', async () => {
  const { cuenta, eje, privada } = await cuentas.crearCuenta({ nombre: 'Víctor Gil', idioma: 'es', htmlInicial: true });
  const reps = C.representaciones(eje, cuenta.alta);
  assert.deepEqual(reps.map((r) => [r.formato, r.tamano]), [['text', 0], ['html', 3]]);
  assert.equal(reps[0].texto, 'Víctor Gil', 'el 0 de la alta es su nombre (#75)');
  assert.equal(modelos.idDeArchivo(reps[1].recurso), sha(htmlInicial('es')));
  assert.equal(modelos.representacionAdmitida(reps[1]), true);
  // sin pedirlo, la cuenta es solo su alta, como siempre (cuentas.test.js)
  assert.equal((await cuentas.crearCuenta({ nombre: 'Ana' })).eje.orden.length, 1);
  // una cuenta en inglés saluda en inglés
  const en = await cuentas.crearCuenta({ nombre: 'Ann', idioma: 'en', htmlInicial: true });
  assert.equal(modelos.idDeArchivo(C.representaciones(en.eje, en.cuenta.alta)[1].recurso), sha(htmlInicial('en')));
  // una cosa dada de alta
  const firmar = cuentas.firmarCon(privada);
  const r = await A.transaccion(eje, 'register a thing', { X: cuenta.alta, thing: 'maceta', minutes: 1 }, cuenta.identidad, { firmar });
  assert.equal(r.ok, true, JSON.stringify(r.motivos));
  const cosa = await eje.anadir(r.evento);
  const x = await adjuntarHtmlInicial(eje, cosa.id, cuenta.identidad, firmar, 'es');
  assert.ok(x, 'la cosa nace con su HTML');
  assert.deepEqual(C.representaciones(eje, cosa.id).map((r2) => [r2.texto === 'maceta' ? 'maceta' : r2.formato, r2.tamano]), [['maceta', 0], ['html', 3]]);
});

test('#84 el centro enseña el HTML del PV0 del foco en el <iframe sandbox> (sin scripts, sin mismo origen), en el ordenador y en el móvil; sin HTML, como antes', async () => {
  const { cuenta, eje } = await cuentas.crearCuenta({ nombre: 'Vic', idioma: 'es', htmlInicial: true });
  const archivo = (id) => (INICIALES.has(id) ? { estado: 'listo', tipo: 'text/html', texto: new TextDecoder().decode(INICIALES.get(id)) } : null);
  for (const [cuando, medidas] of MEDIDAS) {
    const a = await arbol({ foco: { X: cuenta.alta, pv: 0 } }, eje, cuenta.identidad, medidas, ES);
    assert.equal(a.centro.representacion.aislada, true, cuando);
    const h = html(a, { archivo });
    const iframe = h.match(/<iframe class="rep rep-aislada"[^>]*>/)?.[0];
    assert.ok(iframe, 'el PV0 del foco es un iframe: ' + cuando);
    assert.match(iframe, /sandbox=""/);
    assert.doesNotMatch(iframe, /allow-scripts|allow-same-origin/);
    assert.match(iframe, /referrerpolicy="no-referrer"/);
    assert.match(iframe, /srcdoc="[^"]*hola/, 'el «hola» está dentro');
    assert.doesNotMatch(iframe, /attach a file|∅/, 'el título no es el mensaje de la plantilla');
    assert.match(iframe, /title="Vic \(archivo aislado/);
  }
  // un foco sin HTML en su PV0 (el ejemplo): la tarjeta de siempre, texto e input
  const { eje: e2, compra } = await ejemploCompra();
  const h2 = html(await arbol({ foco: { X: compra.id, pv: 0 } }, e2, 'huesped', GRANDE, ES));
  assert.doesNotMatch(h2, /<iframe/);
  assert.match(h2, /<h1 class="representacion">/);
});

test('#87 mantener sobre una caja del 3 abre el aro con la dirección entera de la caja (3.1) y su nombre; el aro dice «quién · comercial», no el nombre de la posición 1 del registro', async () => {
  const { eje, compra } = await ejemploCompra();
  const a = await arbol({ foco: { X: compra.id, pv: 3 } }, eje, 'huesped', GRANDE, ES);
  const h = html(a);
  const caja = h.match(/<div class="rejilla-celda hijo caja-tres[^>]*data-pv="1"[^>]*>/)?.[0];
  assert.match(caja, /data-hueco-ruta="3\.1" data-hueco-nombre="comercial"/);
  // gestos.js: mantener (clic derecho) sobre la caja 1 → aroNuevo(X, 1, { en: [3], nombre: 'comercial' }) (la posición es 3.1, no 1)
  const oyentes = [];
  const documento = { defaultView: { innerWidth: 1920, innerHeight: 1080 }, addEventListener: (tipo, f) => oyentes.push([tipo, f]), removeEventListener() {} };
  const raiz = { ownerDocument: documento, addEventListener: (tipo, f) => oyentes.push([tipo, f]), removeEventListener() {}, querySelector: () => null };
  const llamadas = [];
  instalar(raiz, new Proxy({}, { get: (_, nombre) => (...args) => { llamadas.push([nombre, ...args]); } }));
  const hijo = { dataset: { pv: '1', huecoRuta: '3.1', huecoNombre: 'comercial' } };
  const contenedor = { dataset: { huecoX: compra.id, huecoPv: '3' }, contains: (x) => x === hijo, parentElement: null };
  const objetivo = { closest: (sel) => (sel === '[data-x], [data-hueco-x]' ? contenedor : sel === '.rejilla-celda.hijo[data-pv]' ? hijo : null) };
  for (const [tipo, f] of oyentes) if (tipo === 'contextmenu') f({ target: objetivo, clientX: 500, clientY: 400, preventDefault() {} });
  const [llamada] = llamadas.filter((x) => x[0] === 'aroNuevo');
  assert.deepEqual([llamada[1], llamada[2], llamada[3].en, llamada[3].nombre], [compra.id, 1, [3], 'comercial']);
  // el árbol con ese estado (lo que deja app.aroNuevo): la posición entera y el nombre de la caja
  const b = await arbol({ foco: { X: compra.id, pv: 0 }, aro: { X: compra.id, nuevo: 1, en: [3, 1], nombre: 'comercial' } }, eje, 'huesped', GRANDE, ES);
  assert.equal(b.aro.texto, `crear algo aquí: ${C.etiqueta(eje, compra.id, 3, ES)} · comercial, sobre Compra del menú del día`);
  for (const x of b.aro.centro.crear) assert.match(String(A.plantillasDeTransaccion({ epoca: EPOCA_0_BTML }).find((p) => p.id === x.id).plantilla[5][0]), /^3/, `«${x.nombre}» escribe en el 3`);
  // el resto de la rejilla, como siempre: sin esa dirección
  assert.doesNotMatch(h.replace(/<div class="rejilla-celda hijo caja-tres[^>]*>/g, ''), /data-hueco-ruta/);
});

// ---------- #85 ----------

const posicionDe = (h, k) => (h.match(new RegExp(`<div class="sitio-posicion[^"]*" data-posicion="${k}"[^]*?(?=<div class="sitio-posicion[^"]*" data-posicion=|</ol>)`)) ?? [''])[0];

test('#85 cada celda de la cruceta de un sitio enseña su término y su valor («sin configurar» si no hay); tocarla es configurar esa posición, sin el botón repetido ni «—»', async () => {
  const { eje, compra } = await ejemploCompra();
  const a = await arbol({ foco: { X: compra.id, pv: 3 }, sitio: { X: compra.id, lugar: '3.1' } }, eje, 'huesped', GRANDE, ES);
  assert.deepEqual(a.sitio.posiciones.map((p) => p.nombre), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((k) => C.etiqueta(eje, null, [3, 1, k], ES)));
  const h = html(a);
  assert.equal((h.match(/class="sitio-posicion[ "]/g) ?? []).length, 10);
  for (const k of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]) {
    const celda = posicionDe(h, k);
    assert.match(celda, /<span class="nombre">[^<]+<\/span><span class="valor( sin-configurar)?">[^<]+<\/span>/, 'la ' + k + ' trae término y valor');
    assert.equal((celda.match(/<button/g) ?? []).length, 1, 'la ' + k + ': un solo botón, la celda entera');
  }
  assert.doesNotMatch(h, /class="accion"|<span class="valor">—<\/span>/);
  // el 0 de mi alta: lo anclado en su 0 es un archivo (el HTML inicial): se dice qué es, no el mensaje con que lo escribió la plantilla
  const { cuenta, eje: e2 } = await cuentas.crearCuenta({ nombre: 'Vic', idioma: 'es', htmlInicial: true });
  const c = await arbol({ foco: { X: cuenta.alta, pv: 0 }, sitio: { X: cuenta.alta, lugar: '0', general: true } }, e2, cuenta.identidad, GRANDE, ES);
  assert.equal(c.sitio.posiciones[0].valor, 'una página');
  assert.doesNotMatch(visible(html(c)), /attach a file|attaches/);
  assert.equal((h.match(/sin configurar/g) ?? []).length, 10);
});

// ---------- #86 ----------

test('#86 en una cuenta real no hay «soy» en la cruceta del 0; en el modo ejemplo se queda como «ver como»', async () => {
  const { cuenta, eje } = await cuentas.crearCuenta({ nombre: 'Vic', idioma: 'es' });
  const a = await arbol({ foco: { X: cuenta.alta, pv: 0 }, sitio: { X: cuenta.alta, lugar: '0', general: true } }, eje, cuenta.identidad, GRANDE, ES);
  const real = html(a, { cuenta: { nombre: 'Vic', alta: cuenta.alta, identidad: cuenta.identidad }, cuentas: [{ nombre: 'Vic', alta: cuenta.alta }] });
  assert.doesNotMatch(real, /data-quien|>soy<|ver como/);
  assert.match(visible(real), /olvidar|copia de seguridad/, 'cambiar de identidad es cerrar sesión (olvidar la cuenta en este navegador)');
  const { eje: e2, compra } = await ejemploCompra();
  const alta2 = e2.alta('huesped').id;
  const ejemplo = html(await arbol({ foco: { X: compra.id, pv: 0 }, sitio: { X: alta2, lugar: '0', general: true } }, e2, 'huesped', GRANDE, ES), { ejemplos: [{ id: 'compra', etiqueta: 'la compra' }], ejemplo: 'compra' });
  assert.match(posicionDe(ejemplo, 0), /ver como <select data-quien>/);
  assert.doesNotMatch(ejemplo, />soy </);
  assert.equal(TEXTOS.es.verComo, 'ver como');
  // actuar como una cosa mía se elige en la acción, donde ya se elige el autor (el parámetro «quién»)
  const f = html(await arbol({ foco: { X: compra.id, pv: 0 }, formulario: { X: compra.id, accion: A.plantillasDeTransaccion({ epoca: EPOCA_0_BTML }).find((p) => p.nombre === 'close by decision').id, valores: {} } }, e2, 'huesped', GRANDE, ES));
  assert.match(f, /<label for="param-who">quién<\/label>|<label for="param-who">[^<]*quién/);
});

// ---------- #87 ----------

test('#87 el aro sobre un hueco dice en llano qué crea y dónde, y ofrece solo lo que el núcleo escribe en esa posición', async () => {
  const { eje, compra } = await ejemploCompra();
  const alta = eje.alta('huesped').id;
  const aro = async (X, pv, en, medidas = GRANDE) => arbol({ foco: { X: compra.id, pv: 0 }, aro: { X, nuevo: pv, ...(en ? { en } : {}) } }, eje, 'huesped', medidas, ES);
  const a = await aro(alta, 3);
  assert.equal(a.aro.nuevo, true);
  const dondeTres = C.etiqueta(eje, alta, 3, ES);
  assert.equal(a.aro.texto, `crear algo aquí: ${dondeTres}, sobre Alta de huesped`);
  const h = html(a);
  const marco = h.match(/<div class="aro aro-nuevo[^]*?<\/ul><\/div><\/div><\/div>/)?.[0];
  assert.ok(marco, 'el aro del hueco');
  assert.ok(marco.includes(`<b>crear algo aquí</b><small class="aro-donde">${dondeTres}, sobre Alta de huesped</small>`));
  assert.match(marco, /placeholder="el nombre de lo que creas"/, 'el nombre va en el 0 de lo que se crea');
  assert.ok(marco.includes(`el nombre es el 0 de lo que se crea (${dondeTres})`));
  assert.match(marco, /o créalo con/);
  // lo ofrecido sale del núcleo: las acciones del sitio que escriben ahí (su 5), no las plantillas de datos
  const ancla = (nombre) => String(A.plantillasDeTransaccion({ epoca: EPOCA_0_BTML }).find((p) => A.nombreDeAccion(p.plantilla) === nombre || p.nombre === nombre).plantilla[5][0]);
  const ofrecidas = (X, ruta) => creableEn(eje, X, ruta, 'huesped', ES);
  const canonico = (x) => A.plantillasDeTransaccion({ epoca: EPOCA_0_BTML }).find((p) => p.id === x.id).nombre;
  for (const [pv, esperado] of [[3, '3'], [1, '1'], [4, '4']]) {
    const lista = ofrecidas(alta, [pv]);
    assert.ok(lista.length, 'el hueco ' + pv + ' ofrece algo');
    for (const x of lista) assert.equal(ancla(canonico(x)).split('.')[0], esperado, `«${x.nombre}» escribe en ${esperado}`);
  }
  assert.ok(ofrecidas(alta, [3]).some((x) => canonico(x) === 'admit someone'), 'en el 3, la invitación');
  assert.ok(ofrecidas(alta, [1]).some((x) => canonico(x) === 'issue E tied to X'), 'en el 1, un recurso');
  assert.ok(ofrecidas(alta, [4]).some((x) => canonico(x) === 'propose'), 'en el 4, una acción');
  // la ruta entera del hueco: una caja del 3 se llama como esa caja, no como la posición 5 del registro
  const caja = await aro(alta, 5, [3, 5]);
  assert.match(caja.aro.texto, /^crear algo aquí: /);
  assert.equal(caja.aro.centro.etiqueta, C.etiqueta(eje, alta, [3, 5], ES));
  // ni los nombres de las plantillas de datos (compra, reserva, ajustes…) ni las de lectura
  const todas = ['compra', 'reserva', 'ajustes de la guía', 'opinión'];
  for (const n of todas) assert.doesNotMatch(marco, new RegExp(`>${n}<`));
  // el botón de cada una lanza su formulario sobre el registro del hueco
  assert.match(marco, /<button type="button" class="opcion"[^>]*data-lanzar="[0-9a-f]{64}" data-x="[0-9a-f]{64}"/);
  // el móvil, igual
  assert.match((await aro(alta, 3, undefined, MOVIL)).aro.texto, /^crear algo aquí: /);
});

test('#87 donde no hay nada que crear el aro no se abre: ni el árbol lo pinta ni la app lo abre', async () => {
  const { eje, compra } = await ejemploCompra();
  // En el 9, desde «padres y copias» (A19, 16-11), quien escribió el registro puede configurar quién lo guarda: eso sí se crea ahí.
  assert.deepEqual(creableEn(eje, compra.id, [9], 'huesped', ES).map((x) => x.nombre), ['añadir un padre', 'decir de quién es']);
  for (const pv of [0, 5, 6, 9]) {
    if (pv === 9) {
      assert.deepEqual(creableEn(eje, compra.id, [pv], 'cocina', ES), [], 'en el 9 de lo ajeno no hay nada que crear');
      assert.equal((await arbol({ foco: { X: compra.id, pv: 0 }, aro: { X: compra.id, nuevo: pv } }, eje, 'cocina', GRANDE, ES)).aro, null);
      continue;
    }
    assert.deepEqual(creableEn(eje, compra.id, [pv], 'huesped', ES), [], 'en el ' + pv + ' no hay nada que crear');
    const a = await arbol({ foco: { X: compra.id, pv: 0 }, aro: { X: compra.id, nuevo: pv } }, eje, 'huesped', GRANDE, ES);
    assert.equal(a.aro, null, 'el aro del hueco ' + pv + ' no existe');
    assert.doesNotMatch(html(a), /aro-nuevo/);
  }
  assert.deepEqual(creableEn(eje, compra.id, [3], null, ES), [], 'sin nadie que mire, nada');
  // la app pregunta al núcleo antes de abrir
  const APP = readFileSync(new URL('../carta/app.js', import.meta.url), 'utf8');
  assert.match(APP, /if \(!creableEn\(estado\.eje, X, \[\.\.\.base, pv\], estado\.identidad, \{ idioma: idioma\(\) \}\)\.length\) return;/);
  // tampoco una acción de lectura ni el camino se ofrece como algo que crear
  for (const pv of [1, 2, 3, 4, 7, 8]) for (const x of creableEn(eje, compra.id, [pv], 'huesped', ES)) {
    const p = A.plantillasDeTransaccion({ epoca: EPOCA_0_BTML }).find((q) => q.id === x.id).plantilla;
    assert.equal(A.esLectura(p) || A.esCamino(p), false);
  }
});

test('textos: los textos nuevos están en un solo sitio y las pantallas no llevan palabras de la interfaz escritas a mano', () => {
  const dom = readFileSync(new URL('../carta/dom.js', import.meta.url), 'utf8');
  for (const frase of ['crear algo aquí', 'el nombre de lo que creas', 'o créalo con', 'hola', 'dónde se guardan los archivos', 'quién sella']) {
    assert.ok(!dom.includes(`'${frase}'`) && !dom.includes(`>${frase}<`), `dom.js lleva «${frase}»`);
  }
  assert.equal(t('aroCrear'), 'crear algo aquí');
  assert.equal(Object.values(TEXTOS).length, 1, 'solo hay español: nada que traducir a otro idioma todavía');
});
