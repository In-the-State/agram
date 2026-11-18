// La regla de la lente limpia (VG 18-11): la carta es un intérprete. Es intérprete lo que no escribe un registro por su
// cuenta ni conoce ninguna plantilla por su nombre. Hoy no lo cumple: esta prueba mide la deuda y solo deja que encoja.
//
// Dos medidas sobre carta/*.js (sin carta/textos.js, que son textos, ni carta/vendor/):
//
//   1. NOMBRES: las cadenas literales de la carta que son el nombre canónico de una plantilla de transacción de la época
//      0 o de una época hija de datos/epocas (state, guia-libro, roadmap). Los nombres salen de los datos al ejecutar la
//      prueba (acciones.plantillasDeTransaccion sobre cada época cargada), nunca de una lista escrita aquí.
//      Regla contra los falsos positivos: cuenta solo una cadena ENTERA igual al nombre (comillas simples, dobles o una
//      plantilla `…` sin ${…}); nunca un trozo de una cadena más larga, un comentario ni una expresión regular. Los
//      nombres de una palabra («close», «pay», «measure», «propose»…) cuentan igual, entera la cadena: hoy no sale
//      ninguno. Si mañana uno sale como otra cosa (un evento «close» del DOM, por ejemplo), va en la lista de excepciones
//      con su porqué, como lo demás.
//   2. ESCRITURAS: los sitios de la carta que asientan un registro. Las vías: enviar( (carta/carta.js: transaccion,
//      firma y eje.anadir), .anadir( (asentar un registro ya hecho), escribirDesde( (salida.escribirDesde), .aceptar( e
//      .invitar( (las del eje: escriben un alta o una invitación) y Eje.genesis( (escribe el génesis de un libro). Se
//      cuentan en el código, sin comentarios ni cadenas, por archivo, función que las contiene y vía; la definición de
//      enviar en carta.js y el método enviar(form) de los gestos no cuentan (no son llamadas).
//
// Para las dos, la lista de excepciones es lo que hay hoy (18-11). La prueba falla si aparece algo que no está en la lista
// (deuda nueva) y si algo de la lista ya no está (hay que quitarlo de la lista: solo encoge). Solo lee.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { plantillasDeTransaccion } from '../src/acciones.js';
import { EPOCA_0_BTML, cargarEpocaEscrita } from '../src/epocas.js';
import { epocaState } from '../datos/epocas/state/generar.mjs';
import { epocaGuiaLibro } from '../datos/epocas/guia-libro/generar.mjs';
import { epocaRoadmap } from '../datos/epocas/roadmap/generar.mjs';

const CARTA = new URL('../carta/', import.meta.url);
const ARCHIVOS = readdirSync(CARTA).filter((f) => f.endsWith('.js') && f !== 'textos.js').sort();

// ---------- la deuda de hoy (solo encoge) ----------

/** Nombres de plantillas en la carta, por archivo. */
const NOMBRES_DE_HOY = {
  'app.js': ['move to group', 'register a thing', 'second factor'],
  'archivos.js': ['attach a file'],
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
  'app.js · enviar · enviar': 2, // el método enviar(form) de los gestos: el formulario de una acción
  'app.js · configurar · escribirDesde': 2,
  'app.js · configurar · enviar': 1,
  'app.js · campo · escribirDesde': 1,
  'app.js · autorizar · anadir': 1,
  'app.js · formato · escribirDesde': 1,
  'app.js · propuesta · enviar': 1,
  'app.js · invitadoAceptar · aceptar': 1,
  'archivos.js · adjuntarConAccion · enviar': 1,
  'archivos.js · adjuntarHtmlInicial · enviar': 1,
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

// ---------- el léxico: cadenas literales y código sin comentarios ni cadenas ----------

const ANTES_DE_UNA_REGEX = '(,=:[!&|?{};+-*%<>~^';
const PALABRAS_ANTES_DE_UNA_REGEX = new Set(['return', 'typeof', 'case', 'in', 'of', 'void', 'throw', 'delete', 'else', 'do', 'yield', 'await']);

/** Recorre un fuente JS: → { cadenas: [{ valor, linea }] (sin las plantillas con ${…}), codigo (el fuente con comentarios, cadenas y regex en blanco, mismas líneas) }. */
function lexico(t) {
  const cadenas = [];
  const codigo = t.split('');
  const blanquear = (a, b) => { for (let k = a; k < b; k++) if (codigo[k] !== '\n') codigo[k] = ' '; };
  let i = 0;
  let linea = 1;
  let previo = '';
  let palabra = '';
  const n = t.length;
  const esPalabra = (c) => /[A-Za-z0-9_$]/.test(c);
  while (i < n) {
    const c = t[i];
    const ini = i;
    if (c === '\n') { linea++; i++; continue; }
    if (c === '/' && t[i + 1] === '/') { while (i < n && t[i] !== '\n') i++; blanquear(ini, i); continue; }
    if (c === '/' && t[i + 1] === '*') {
      i += 2;
      while (i < n && !(t[i] === '*' && t[i + 1] === '/')) { if (t[i] === '\n') linea++; i++; }
      i += 2;
      blanquear(ini, i);
      continue;
    }
    if (c === '/' && (previo === '' || ANTES_DE_UNA_REGEX.includes(previo) || PALABRAS_ANTES_DE_UNA_REGEX.has(palabra))) {
      i++;
      let clase = false;
      while (i < n && t[i] !== '\n') {
        if (t[i] === '\\') { i += 2; continue; }
        if (t[i] === '[') clase = true;
        else if (t[i] === ']') clase = false;
        else if (t[i] === '/' && !clase) break;
        i++;
      }
      i++;
      blanquear(ini, i);
      previo = '/';
      palabra = '';
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      const l0 = linea;
      let valor = '';
      let conHueco = false;
      i++;
      while (i < n && t[i] !== c) {
        if (t[i] === '\\') { valor += t[i + 1] === 'n' ? '\n' : t[i + 1]; i += 2; continue; }
        if (c === '`' && t[i] === '$' && t[i + 1] === '{') {
          conHueco = true;
          let hondo = 1;
          i += 2;
          while (i < n && hondo > 0) {
            if (t[i] === '{') hondo++;
            else if (t[i] === '}') hondo--;
            else if (t[i] === '\n') linea++;
            i++;
          }
          continue;
        }
        if (t[i] === '\n') { if (c !== '`') break; linea++; }
        valor += t[i];
        i++;
      }
      i++;
      blanquear(ini, i);
      if (!conHueco) cadenas.push({ valor, linea: l0 });
      previo = c;
      palabra = '';
      continue;
    }
    if (/\s/.test(c)) { i++; continue; }
    if (esPalabra(c)) { palabra = (esPalabra(previo) ? palabra : '') + c; previo = c; i++; continue; }
    previo = c;
    palabra = '';
    i++;
  }
  return { cadenas, codigo: codigo.join('') };
}

// ---------- la medida 1: nombres ----------

/** Los nombres canónicos de las plantillas de transacción: los de la 0 y los de cada época hija de datos/epocas. */
function nombresDePlantillas() {
  const nombres = new Set(plantillasDeTransaccion({ epoca: EPOCA_0_BTML }).map((p) => p.nombre));
  for (const hija of [epocaState(), epocaGuiaLibro(), epocaRoadmap()]) for (const p of plantillasDeTransaccion({ epoca: cargarEpocaEscrita(hija) })) nombres.add(p.nombre);
  return nombres;
}

/** Los nombres de plantillas que salen en la carta: { archivo: { nombre: [líneas] } }. */
function nombresEnLaCarta(nombres) {
  const fuera = {};
  for (const f of ARCHIVOS) {
    for (const { valor, linea } of lexico(readFileSync(new URL(f, CARTA), 'utf8')).cadenas) {
      if (!nombres.has(valor)) continue;
      fuera[f] ??= {};
      (fuera[f][valor] ??= []).push(linea);
    }
  }
  return fuera;
}

// ---------- la medida 2: escrituras ----------

const VIAS = [
  ['enviar', /(?<![\w$.])enviar\s*\(/g],
  ['anadir', /\.anadir\s*\(/g],
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
  const hay = nombresEnLaCarta(nombres);
  const fallos = [];
  for (const [f, porNombre] of Object.entries(hay)) {
    for (const [nombre, lineas] of Object.entries(porNombre)) {
      if (!NOMBRES_DE_HOY[f]?.includes(nombre)) fallos.push(`carta/${f} nombra la plantilla «${nombre}» (línea ${lineas.join(', ')}): es deuda nueva; la carta no debe conocer plantillas por su nombre`);
    }
  }
  for (const [f, lista] of Object.entries(NOMBRES_DE_HOY)) {
    for (const nombre of lista) if (!hay[f]?.[nombre]) fallos.push(`carta/${f} ya no nombra «${nombre}»: quítalo de NOMBRES_DE_HOY en test/lente-limpia.test.js`);
  }
  assert.deepEqual(fallos, []);
});

test('lente limpia, escrituras: ningún sitio nuevo de la carta asienta un registro, y los de la lista siguen estando con las mismas llamadas (la deuda solo encoge)', () => {
  const hay = escriturasEnLaCarta();
  const fallos = [];
  for (const [clave, n] of Object.entries(hay)) {
    const antes = ESCRITURAS_DE_HOY[clave];
    const [f, funcion, via] = clave.split(' · ');
    if (antes === undefined) fallos.push(`carta/${f}, en ${funcion}, escribe un registro por ${via} (${n} ${n === 1 ? 'llamada' : 'llamadas'}): es deuda nueva`);
    else if (n > antes) fallos.push(`carta/${f}, en ${funcion}, escribe por ${via} ${n} veces y antes ${antes}: es deuda nueva`);
    else if (n < antes) fallos.push(`carta/${f}, en ${funcion}, ya solo escribe por ${via} ${n} veces (antes ${antes}): baja la cuenta en ESCRITURAS_DE_HOY`);
  }
  for (const clave of Object.keys(ESCRITURAS_DE_HOY)) {
    if (hay[clave] === undefined) {
      const [f, funcion, via] = clave.split(' · ');
      fallos.push(`carta/${f}, en ${funcion}, ya no escribe por ${via}: quítalo de ESCRITURAS_DE_HOY en test/lente-limpia.test.js`);
    }
  }
  assert.deepEqual(fallos, []);
});

