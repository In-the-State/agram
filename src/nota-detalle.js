// La nota de detalle de un registro (VG 17-11; la escribe el volcado, ejemplos/volcado/volcar.mjs y docs/notas/VOLCADO.md):
// la lectura pura, sin DOM, para la carta y el volcado. Documentación: docs/CONTRATO.md §12.9.
//
//   NOTA                              el título de la nota y las etiquetas de sus líneas
//   partirNota(lineas)                las líneas «etiqueta: valor» de una nota, partidas, o null si es la vacía
//   esNotaDeDetalle(ev, fila)         ¿es ese registro una nota de detalle (de esa fila del volcado, si se da)?
//   ultimaNotaDeDetalle(eje, X, fila) el registro de la última nota que el autor de X ancló en su 0, o null
//   notaDeDetalle(eje, X)             la última nota de detalle de X, partida, con quién la escribió y su id, o null
//
// Solo cuenta lo que el AUTOR del registro ancló en su 0 con «anchor here» (título «nota de detalle», primera línea
// «nota de detalle: …»): una nota de otra persona no cuenta nunca. Los textos que salen pasan por la misma limpieza que la
// etiqueta de una zona (RE_TEXTO_ENGANOSO de guia-libro.js): una línea con caracteres de control o de dirección del texto
// se da sin ellos y marcada (`enganosas`), y un comando que los lleve no se ofrece para copiar (`sinCopiar`).

import { RE_TEXTO_ENGANOSO } from './guia-libro.js';

/** El título de la nota y las etiquetas de su 1, en el orden en que se escriben. */
export const NOTA = Object.freeze({
  titulo: 'nota de detalle',
  marca: 'nota de detalle', // la primera línea: «nota de detalle: <id de la fila>»
  base: 'base',
  paso: 'paso', // «paso 1: …», «paso 1 comando: …», «paso 1 ruta: …», «paso 1 ve: …»
  detalle: 'detalle',
  quien: 'quien',
  depende: 'depende', // «depende <id>: <texto de esa fila>»
  vacia: 'sin detalle', // la nota que dice que la tabla retiró el detalle
});

const SEP = ': ';
const EN_EL_CERO = '0000000000';
const ANCLAR = 'anchor here';

const hojas = (x) => (Array.isArray(x) ? x.flatMap(hojas) : [x]);
const accionDe = (ev) => hojas(ev?.payload?.[4]).filter((x) => typeof x === 'string');
const texto0 = (ev) => { const h = hojas(ev?.payload?.[0]).find((x) => typeof x === 'string' || typeof x === 'number'); return h === undefined ? '' : String(h); };
/** Las líneas del 1 de un registro (las hojas de texto, en orden). */
const lineasDe = (ev) => hojas(ev?.payload?.[1]).filter((x) => typeof x === 'string');

/** ¿Lleva el texto caracteres engañosos? Y el texto sin ellos. (La expresión es la de guia-libro.js; se lee al llamar.) */
const enganoso = (s) => RE_TEXTO_ENGANOSO.test(s);
const sinEnganos = (s) => s.replace(new RegExp(RE_TEXTO_ENGANOSO.source, 'gu'), '');

/** ¿Es `ev` una nota de detalle (de la fila `fila`, si se da)? Su título y su primera línea lo dicen. */
export function esNotaDeDetalle(ev, fila = null) {
  if (!accionDe(ev).includes(ANCLAR) || texto0(ev) !== NOTA.titulo) return false;
  const primera = lineasDe(ev)[0] ?? '';
  return fila === null ? primera.startsWith(NOTA.marca + SEP) : primera === NOTA.marca + SEP + fila;
}

/** El registro de la última nota de detalle que el autor de X ancló en su 0 (de la fila `fila`, si se da), o null. */
export function ultimaNotaDeDetalle(eje, X, fila = null) {
  const tarea = typeof X === 'object' && X ? eje?.obtener?.(X.id) : eje?.obtener?.(X);
  if (!tarea) return null;
  return (eje.sobre(tarea.id, EN_EL_CERO) ?? []).filter((h) => h.autor === tarea.autor && esNotaDeDetalle(h, fila)).at(-1) ?? null;
}

/**
 * Una nota partida: { fila, base, pasos: [{ hace, comando?, ruta?, ve? }], detalle: [líneas], quien, depende: [{ id,
 * texto }] }, o null si está vacía (la que dice que la tabla retiró el detalle, o una sin nada). Una línea con caracteres
 * engañosos se da sin ellos y su sitio va en `enganosas` («base», «paso 1 comando», «detalle 2», «depende a1»…); un
 * comando así, además, en `sinCopiar` (el número de su paso, desde 1). Las dos listas solo salen si tienen algo.
 */
export function partirNota(lineas) {
  const nota = { fila: null, base: null, pasos: [], detalle: [], quien: null, depende: [] };
  const enganosas = [];
  const sinCopiar = [];
  let algo = false;
  for (const l of lineas ?? []) {
    if (typeof l !== 'string') continue;
    const i = l.indexOf(SEP);
    if (i < 0) continue;
    const etiqueta = l.slice(0, i);
    const crudo = l.slice(i + SEP.length);
    const malo = enganoso(crudo);
    const valor = malo ? sinEnganos(crudo) : crudo;
    if (etiqueta === NOTA.marca) { nota.fila = valor; continue; }
    if (etiqueta === NOTA.vacia) return null;
    algo = true;
    let m;
    let sitio = etiqueta;
    if (etiqueta === NOTA.base) nota.base = valor;
    else if (etiqueta === NOTA.detalle) { nota.detalle.push(valor); sitio = NOTA.detalle + ' ' + nota.detalle.length; }
    else if (etiqueta === NOTA.quien) nota.quien = valor;
    else if ((m = /^paso (\d+)(?: (comando|ruta|ve))?$/.exec(etiqueta))) {
      const k = Number(m[1]) - 1;
      nota.pasos[k] ??= { hace: '' };
      if (m[2]) nota.pasos[k][m[2]] = valor; else nota.pasos[k].hace = valor;
      if (malo && m[2] === 'comando') sinCopiar.push(k + 1);
    } else if (etiqueta.startsWith(NOTA.depende + ' ')) {
      const id = etiqueta.slice(NOTA.depende.length + 1);
      nota.depende.push({ id: sinEnganos(id), texto: valor });
      sitio = NOTA.depende + ' ' + sinEnganos(id);
      if (enganoso(id)) { enganosas.push(sitio); continue; }
    }
    if (malo) enganosas.push(sitio);
  }
  nota.pasos = nota.pasos.filter(Boolean);
  if (!algo) return null;
  if (enganosas.length) nota.enganosas = enganosas;
  if (sinCopiar.length) nota.sinCopiar = sinCopiar;
  return nota;
}

/**
 * La última nota de detalle de X (su id o su registro) que su autor ancló en su 0, partida (partirNota), con quién la
 * escribió (`autor`) y su id (`id`); null si X no está, si no tiene nota o si la última es la vacía.
 */
export function notaDeDetalle(eje, X) {
  const nota = ultimaNotaDeDetalle(eje, X);
  const partida = nota ? partirNota(lineasDe(nota)) : null;
  return partida ? { ...partida, autor: nota.autor, id: nota.id } : null;
}
