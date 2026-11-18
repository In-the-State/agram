// Lo que comparten las guardas de la lente limpia (test/lente-limpia.test.js, la carta) y del núcleo limpio
// (test/nucleo-limpio.test.js, src/): el léxico de un fuente JS, los nombres de las acciones (plantillas de transacción)
// sacados de las épocas al ejecutar, y las comparaciones con la deuda de hoy (puras: se prueban también solas). Solo lee.

import { readFileSync } from 'node:fs';
import { plantillasDeTransaccion } from '../src/acciones.js';
import { EPOCA_0_BTML, cargarEpocaEscrita } from '../src/epocas.js';
import { epocaState } from '../datos/epocas/state/generar.mjs';
import { epocaGuiaLibro } from '../datos/epocas/guia-libro/generar.mjs';
import { epocaRoadmap } from '../datos/epocas/roadmap/generar.mjs';
import { epocaCuenta } from '../datos/epocas/cuenta/generar.mjs';

// ---------- el léxico: cadenas literales y código sin comentarios ni cadenas ----------

const ANTES_DE_UNA_REGEX = '(,=:[!&|?{};+-*%<>~^';
const PALABRAS_ANTES_DE_UNA_REGEX = new Set(['return', 'typeof', 'case', 'in', 'of', 'void', 'throw', 'delete', 'else', 'do', 'yield', 'await']);

/** Recorre un fuente JS: → { cadenas: [{ valor, linea }] (sin las plantillas con ${…}), codigo (el fuente con comentarios, cadenas y regex en blanco, mismas líneas) }. */
export function lexico(t) {
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


/** Las épocas de donde salen los nombres: la 0 y cada hija de datos/epocas, por su nombre. */
export const EPOCAS = Object.freeze({ '0': () => EPOCA_0_BTML, state: () => cargarEpocaEscrita(epocaState()), 'guia-libro': () => cargarEpocaEscrita(epocaGuiaLibro()), roadmap: () => cargarEpocaEscrita(epocaRoadmap()), cuenta: () => cargarEpocaEscrita(epocaCuenta()) });

/** Los nombres canónicos de las acciones: { nombre → [épocas que la definen] } (la 0 y cada hija). */
export function nombresPorEpoca() {
  const fuera = new Map();
  for (const [epoca, cargar] of Object.entries(EPOCAS)) for (const p of plantillasDeTransaccion({ epoca: cargar() })) fuera.set(p.nombre, [...new Set([...(fuera.get(p.nombre) ?? []), epoca])]);
  return fuera;
}

/** Los nombres canónicos de las acciones de la 0 y de las hijas, como un Set. */
export const nombresDePlantillas = () => new Set(nombresPorEpoca().keys());

/** Los nombres que salen como cadena ENTERA en unos archivos: { archivo: { nombre: [líneas] } }. */
export function nombresEnArchivos(carpeta, archivos, nombres) {
  const fuera = {};
  for (const f of archivos) {
    for (const { valor, linea } of lexico(readFileSync(new URL(f, carpeta), 'utf8')).cadenas) {
      if (!nombres.has(valor)) continue;
      fuera[f] ??= {};
      (fuera[f][valor] ??= []).push(linea);
    }
  }
  return fuera;
}

/**
 * Compara los nombres hallados ({ archivo: { nombre: [líneas] } }) con los permitidos ({ archivo: [nombres] }, la
 * deuda de hoy o el suelo): → la lista de fallos, en llano. Uno nuevo es deuda nueva; uno de la lista que ya no está,
 * hay que quitarlo de la lista (`lista`: su nombre en la prueba). Pura.
 */
export function compararNombres(hay, permitidos, { carpeta = 'carta', lista = 'NOMBRES_DE_HOY', prueba = 'test/lente-limpia.test.js', nuevo = 'es deuda nueva' } = {}) {
  const fallos = [];
  for (const [f, porNombre] of Object.entries(hay)) {
    for (const [nombre, lineas] of Object.entries(porNombre)) {
      if (!permitidos[f]?.includes(nombre)) fallos.push(`${carpeta}/${f} nombra la acción «${nombre}» (línea ${lineas.join(', ')}): ${nuevo}`);
    }
  }
  for (const [f, nombres] of Object.entries(permitidos)) {
    for (const nombre of nombres) if (!hay[f]?.[nombre]) fallos.push(`${carpeta}/${f} ya no nombra «${nombre}»: quítalo de ${lista} en ${prueba}`);
  }
  return fallos;
}

/** Compara las escrituras halladas ({ 'archivo · función · vía': n }) con las de hoy: → la lista de fallos, en llano. Pura. */
export function compararEscrituras(hay, deHoy, { carpeta = 'carta', lista = 'ESCRITURAS_DE_HOY', prueba = 'test/lente-limpia.test.js' } = {}) {
  const fallos = [];
  for (const [clave, n] of Object.entries(hay)) {
    const antes = deHoy[clave];
    const [f, funcion, via] = clave.split(' · ');
    if (antes === undefined) fallos.push(`${carpeta}/${f}, en ${funcion}, escribe un registro por ${via} (${n} ${n === 1 ? 'llamada' : 'llamadas'}): es deuda nueva`);
    else if (n > antes) fallos.push(`${carpeta}/${f}, en ${funcion}, escribe por ${via} ${n} veces y antes ${antes}: es deuda nueva`);
    else if (n < antes) fallos.push(`${carpeta}/${f}, en ${funcion}, ya solo escribe por ${via} ${n} veces (antes ${antes}): baja la cuenta en ${lista}`);
  }
  for (const clave of Object.keys(deHoy)) {
    if (hay[clave] === undefined) {
      const [f, funcion, via] = clave.split(' · ');
      fallos.push(`${carpeta}/${f}, en ${funcion}, ya no escribe por ${via}: quítalo de ${lista} en ${prueba}`);
    }
  }
  return fallos;
}
