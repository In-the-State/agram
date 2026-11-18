// La regla de la lente limpia (VG 18-11): la carta es un intérprete. Es intérprete lo que no escribe un registro por su
// cuenta ni conoce ninguna plantilla por su nombre. Hoy no lo cumple: esta prueba mide la deuda y solo deja que encoja.
//
// Dos medidas sobre carta/*.js (sin carta/textos.js, que son textos, ni carta/vendor/):
//
//   1. NOMBRES: las cadenas literales de la carta que son el nombre canónico de una plantilla de transacción de la época
//      0 o de una época hija de datos/epocas (state, guia-libro, roadmap, cuenta). Los nombres salen de los datos al ejecutar la
//      prueba (acciones.plantillasDeTransaccion sobre cada época cargada), nunca de una lista escrita aquí.
//      Regla contra los falsos positivos: cuenta solo una cadena ENTERA igual al nombre (comillas simples, dobles o una
//      plantilla `…` sin ${…}); nunca un trozo de una cadena más larga, un comentario ni una expresión regular. Los
//      nombres de una palabra («close», «pay», «measure», «propose»…) cuentan igual, entera la cadena: hoy no sale
//      ninguno. Si mañana uno sale como otra cosa (un evento «close» del DOM, por ejemplo), va en la lista de excepciones
//      con su porqué, como lo demás.
//   2. ESCRITURAS: los sitios de la carta que asientan un registro. Las vías: enviar( (carta/carta.js: transaccion,
//      firma y eje.anadir), .anadir( (asentar un registro ya hecho), .anadirTanda( (asentar una tanda entera), escribirDesde( (salida.escribirDesde), .aceptar( e
//      .invitar( (las del eje: escriben un alta o una invitación) y Eje.genesis( (escribe el génesis de un libro). Se
//      cuentan en el código, sin comentarios ni cadenas, por archivo, función que las contiene y vía; la definición de
//      enviar en carta.js y el método enviar(form) de los gestos no cuentan (no son llamadas).
//
// Para las dos, la lista de excepciones es lo que hay hoy (18-11). La prueba falla si aparece algo que no está en la lista
// (deuda nueva) y si algo de la lista ya no está (hay que quitarlo de la lista: solo encoge). Solo lee.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { lexico, nombresDePlantillas, nombresEnArchivos, compararNombres, compararEscrituras } from './ayudas-lente.mjs';

const CARTA = new URL('../carta/', import.meta.url);
const ARCHIVOS = readdirSync(CARTA).filter((f) => f.endsWith('.js') && f !== 'textos.js').sort();

// ---------- la deuda de hoy (solo encoge) ----------

/** Nombres de plantillas en la carta, por archivo. */
const NOMBRES_DE_HOY = {
  'app.js': ['move to group', 'register a thing', 'second factor'],
  'carta.js': ['message in', 'message in from an agent', 'message out'],
  'reglas.js': ['add a parent', 'let P come down here', 'remove a parent', 'set a custody default', 'set a group price', 'set a minimum', 'set a minimum rank', 'set the kind of owner'],
};

/**
 * Escrituras en la carta: «archivo · función · vía» → cuántas llamadas. (carta/anfitrion.js autorizarCon llama a
 * un `asentar` que le pasan: la llamada que cuenta es la de app.js · autorizar.)
 */
const ESCRITURAS_DE_HOY = {
  'app.js · escribirPreferencias · escribirDesde': 1,
  'app.js · reclasificar · enviar': 1,
  'app.js · configurar · escribirDesde': 2,
  'app.js · configurar · enviar': 1,
  'app.js · campo · escribirDesde': 1,
  'app.js · autorizar · anadir': 1,
  'app.js · formato · escribirDesde': 1,
  'app.js · propuesta · enviar': 1,
  'app.js · invitadoAceptar · aceptar': 1,
  'archivos.js · adjuntarConAccion · enviar': 1,
  'archivos.js · adjuntarHtmlInicial · enviar': 1,
  'bandeja.js · componerUna · anadir': 1, // sobre la vista en seco de la tanda (vistaTanda), no sobre el libro: así la entrada siguiente ve a la anterior
  'bandeja.js · lanzar · anadir': 1, // el camino de ejecutar con una sola entrada: aquí acaban las demás escrituras de esta lista, esta se queda
  'bandeja.js · lanzar · anadirTanda': 1, // el mismo camino con dos o más: la tanda entera o nada
  'carta.js · enviar · anadir': 1, // la vía misma: transaccion, firma y eje.anadir
  'carta.js · guardarRetoque · enviar': 1,
  'cuentas.js · crearCon · Eje.genesis': 1,
  'cuentas.js · crearCon · escribirDesde': 2,
  'externa.js · anclarOpinion · anadir': 1,
  'guardian-emparejado.js · asentarFirmadas · anadir': 1,
  'libros.js · previaDelLibroPrivado · Eje.genesis': 1, // un libro de demostración en memoria, para la previa
  'libros.js · abrirLibroPrivado · enviar': 1,
  'libros.js · anunciarLibroPrivado · enviar': 1,
  'puente.js · escribir · enviar': 1,
  'reglas.js · actuar · enviar': 1,
  'reglas.js · proponer · enviar': 1,
  'sincronia.js · ejeDelServidor · anadir': 1, // asienta lo que baja del servidor (escrito por otros), no escribe por su cuenta
};

// ---------- la medida 1: nombres ----------

/** Los nombres de plantillas que salen en la carta: { archivo: { nombre: [líneas] } }. */
const nombresEnLaCarta = (nombres) => nombresEnArchivos(CARTA, ARCHIVOS, nombres);

// ---------- la medida 2: escrituras ----------

const VIAS = [
  ['enviar', /(?<![\w$.])enviar\s*\(/g],
  ['anadir', /\.anadir\s*\(/g],
  ['anadirTanda', /\.anadirTanda\s*\(/g],
  ['escribirDesde', /\bescribirDesde\s*\(/g],
  ['aceptar', /\.aceptar\s*\(/g],
  ['invitar', /\.invitar\s*\(/g],
  ['Eje.genesis', /\bEje\.genesis\s*\(/g],
];
/** Una definición, no una llamada: «function enviar(», «async enviar(form) {» o «enviar(form) {» como método. */
const esDefinicion = (lineaDeCodigo, via) => via === 'enviar' && (/\bfunction\s+enviar\s*\(/.test(lineaDeCodigo) || /^\s*(async\s+)?enviar\s*\([^)]*\)\s*\{/.test(lineaDeCodigo));

const DECLARACION = [
  /^\s*(?:export\s+)?(?:async\s+)?function\s*\*?\s*([\w$]+)\s*\(/,
  /^\s*(?:export\s+)?(?:const|let|var)\s+([\w$]+)\s*=\s*(?:async\s+)?(?:function\b|\([^)]*\)\s*=>|[\w$]+\s*=>)/,
  /^\s*(?:static\s+)?(?:async\s+)?(?:get\s+|set\s+)?\*?\s*#?([\w$]+)\s*\([^)]*\)\s*\{\s*$/,
  /^\s*([\w$]+)\s*:\s*(?:async\s+)?(?:function\b|\([^)]*\)\s*=>)/,
];
const NO_SON_FUNCIONES = new Set(['if', 'for', 'while', 'switch', 'catch', 'with', 'return']);
const sangria = (l) => l.length - l.trimStart().length;

/** La función que contiene la línea k (índice desde 0) del código: la declaración más cercana por encima con menos sangría. */
function funcionDe(lineas, k) {
  let tope = sangria(lineas[k]);
  for (let j = k; j >= 0; j--) {
    const l = lineas[j];
    if (!l.trim()) continue;
    const s = sangria(l);
    if (j < k && s >= tope) continue;
    for (const re of DECLARACION) {
      const m = re.exec(l);
      if (m && !NO_SON_FUNCIONES.has(m[1])) return m[1];
    }
    if (j < k) tope = Math.min(tope, s);
    if (s === 0 && j < k) return '(módulo)';
  }
  return '(módulo)';
}

/** Las escrituras de la carta: { 'archivo · función · vía': cuántas }. */
function escriturasEnLaCarta() {
  const fuera = {};
  for (const f of ARCHIVOS) {
    const { codigo } = lexico(readFileSync(new URL(f, CARTA), 'utf8'));
    const lineas = codigo.split('\n');
    lineas.forEach((l, k) => {
      for (const [via, re] of VIAS) {
        for (const _ of l.matchAll(re)) {
          if (esDefinicion(l, via)) continue;
          const clave = f + ' · ' + funcionDe(lineas, k) + ' · ' + via;
          fuera[clave] = (fuera[clave] ?? 0) + 1;
        }
      }
    });
  }
  return fuera;
}

// ---------- las pruebas ----------

test('lente limpia, nombres: ningún nombre de plantilla nuevo en la carta, y los de la lista siguen estando (la deuda solo encoge)', () => {
  const nombres = nombresDePlantillas();
  assert.ok(nombres.size > 50, 'los nombres salen de las épocas (' + nombres.size + ')');
  assert.deepEqual(compararNombres(nombresEnLaCarta(nombres), NOMBRES_DE_HOY, { nuevo: 'es deuda nueva; la carta no debe conocer acciones por su nombre' }), []);
});

test('lente limpia, escrituras: ningún sitio nuevo de la carta asienta un registro, y los de la lista siguen estando con las mismas llamadas (la deuda solo encoge)', () => {
  assert.deepEqual(compararEscrituras(escriturasEnLaCarta(), ESCRITURAS_DE_HOY), []);
});


test('lente limpia, la guarda misma: falla con deuda nueva, con una cuenta que sube o baja y con una entrada de la lista que ya no está (casos simulados en memoria)', () => {
  const hay = { 'a.js': { 'una acción': [3] } };
  assert.deepEqual(compararNombres(hay, { 'a.js': ['una acción'] }), [], 'igual: pasa');
  assert.deepEqual(compararNombres(hay, {}), ['carta/a.js nombra la acción «una acción» (línea 3): es deuda nueva']);
  assert.deepEqual(compararNombres(hay, { 'a.js': ['una acción', 'otra'] }), ['carta/a.js ya no nombra «otra»: quítalo de NOMBRES_DE_HOY en test/lente-limpia.test.js']);
  assert.deepEqual(compararNombres({}, { 'b.js': ['x'] }), ['carta/b.js ya no nombra «x»: quítalo de NOMBRES_DE_HOY en test/lente-limpia.test.js'], 'un archivo entero que ya no nombra nada');
  const e = { 'a.js · f · enviar': 2 };
  assert.deepEqual(compararEscrituras(e, { 'a.js · f · enviar': 2 }), []);
  assert.deepEqual(compararEscrituras(e, {}), ['carta/a.js, en f, escribe un registro por enviar (2 llamadas): es deuda nueva']);
  assert.deepEqual(compararEscrituras(e, { 'a.js · f · enviar': 1 }), ['carta/a.js, en f, escribe por enviar 2 veces y antes 1: es deuda nueva']);
  assert.deepEqual(compararEscrituras(e, { 'a.js · f · enviar': 3 }), ['carta/a.js, en f, ya solo escribe por enviar 2 veces (antes 3): baja la cuenta en ESCRITURAS_DE_HOY']);
  assert.deepEqual(compararEscrituras({}, { 'a.js · g · anadir': 1 }), ['carta/a.js, en g, ya no escribe por anadir: quítalo de ESCRITURAS_DE_HOY en test/lente-limpia.test.js']);
  // Y sobre la carta de verdad: quitar del código lo que está en la lista (simulado: una lista con una entrada de más).
  assert.ok(compararNombres(nombresEnLaCarta(nombresDePlantillas()), { ...NOMBRES_DE_HOY, 'app.js': [...NOMBRES_DE_HOY['app.js'], 'close'] }).some((x) => x.includes('ya no nombra «close»')));
  assert.ok(compararEscrituras(escriturasEnLaCarta(), { ...ESCRITURAS_DE_HOY, 'app.js · inventada · enviar': 1 }).some((x) => x.includes('en inventada, ya no escribe por enviar')));
});
