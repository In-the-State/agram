// La lista de cambios de fondo (retoques/.datos/fondo.md, que escribe el agente de la carta) y las sesiones de
// retoques (retoques/.datos/sesiones.json, que lleva el servidor). Puro salvo leer y escribir esos dos archivos.
//
// fondo.md: cada entrada empieza por «## <fecha> · <título corto>» y sigue con «clase:» (época, regla o parámetro,
// núcleo, otro), «estado:» (pendiente, por gobierno en el libro vivo), «pidió:» y «contexto:». Solo se añade al final.
// Es un archivo que escribe un agente: se lee como texto y con topes, y quien lo pinte lo escapa.
//
// Una sesión es un arranque del servidor en el que Core recibió al menos un mensaje: { inicio, mensajes,
// fondoAlEmpezar, fondoAlAcabar }. «Sesiones sin crecer»: cuántas seguidas, desde la última hacia atrás, acabaron con
// las mismas entradas con que empezaron. La primera vuelta de la aceptación acaba cuando deja de crecer (o VG lo dice).

import { readFileSync, renameSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export const CLASES = Object.freeze(['época', 'regla o parámetro', 'núcleo', 'otro']);
export const ESTADOS = Object.freeze(['pendiente', 'por gobierno en el libro vivo']);
export const TOPES = Object.freeze({ entradas: 200, titulo: 200, campo: 60, texto: 1200, sesiones: 500, archivo: 512 * 1024 });

/** Las entradas de fondo.md: [{ titulo, clase, estado, texto }] en su orden (el título, la línea «## …» entera). */
export function entradasDe(md) {
  const entradas = [];
  let actual = null;
  for (const linea of String(md ?? '').slice(0, TOPES.archivo).split(/\r?\n/)) {
    const cabeza = /^## (.+)$/.exec(linea);
    if (cabeza) {
      actual = { titulo: cabeza[1].trim().slice(0, TOPES.titulo), clase: '', estado: '', lineas: [] };
      entradas.push(actual);
      continue;
    }
    if (!actual) continue;
    const campo = /^(clase|estado):\s*(.*)$/i.exec(linea.trim());
    if (campo && !actual[campo[1].toLowerCase()]) { actual[campo[1].toLowerCase()] = campo[2].trim().slice(0, TOPES.campo); continue; }
    actual.lineas.push(linea);
  }
  return entradas.map(({ lineas, ...e }) => ({ ...e, texto: lineas.join('\n').trim().slice(0, TOPES.texto) }));
}

/** Cuántas sesiones seguidas, desde la última hacia atrás, no hicieron crecer la lista. */
export function sesionesSinCrecer(sesiones) {
  let n = 0;
  for (let i = (sesiones?.length ?? 0) - 1; i >= 0; i--) {
    const s = sesiones[i];
    if (s && Number.isFinite(s.fondoAlEmpezar) && s.fondoAlAcabar === s.fondoAlEmpezar) n++;
    else break;
  }
  return n;
}

/** Lo que devuelve GET /retoques/fondo: { total, sesiones, sesionesSinCrecer, entradas } (las últimas TOPES.entradas). */
export function resumenDelFondo(md, sesiones = []) {
  const entradas = entradasDe(md);
  return { total: entradas.length, sesiones: sesiones.length, sesionesSinCrecer: sesionesSinCrecer(sesiones), entradas: entradas.slice(-TOPES.entradas) };
}

/** Una sesión más (o la misma, si ya empezó): un mensaje más y lo que hay ahora en la lista. Puro: devuelve la lista nueva. */
export function conMensaje(sesiones, { inicio, fondoAlEmpezar, fondoAhora }) {
  const lista = Array.isArray(sesiones) ? sesiones.filter((s) => s && typeof s.inicio === 'string') : [];
  const ultima = lista.at(-1);
  if (ultima?.inicio === inicio) return [...lista.slice(0, -1), { ...ultima, mensajes: (ultima.mensajes ?? 0) + 1, fondoAlAcabar: fondoAhora }];
  return [...lista, { inicio, mensajes: 1, fondoAlEmpezar, fondoAlAcabar: fondoAhora }].slice(-TOPES.sesiones);
}

export function leerTexto(ruta) {
  try { return readFileSync(ruta, 'utf8'); } catch { return ''; }
}

export function leerSesiones(ruta) {
  try {
    const v = JSON.parse(readFileSync(ruta, 'utf8'));
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}

/** Escribe la lista en un .nuevo y lo renombra encima (sin dejar el archivo a medias). */
export function guardarSesiones(ruta, lista) {
  mkdirSync(dirname(ruta), { recursive: true });
  writeFileSync(ruta + '.nuevo', JSON.stringify(lista, null, 1) + '\n');
  renameSync(ruta + '.nuevo', ruta);
}
