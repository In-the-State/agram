// Los gestos de la lente, del lado del núcleo (Core AGRAM 18-11; docs/notas/NUCLEO_6_7_8.md, tercera tanda, punto 8;
// agram-equipo/OPINION_BOTONES_PV.md §10 y §11, INVENTARIO_FIJO_CARTA.md). SUPUESTO POR CONFIRMAR CON VG.
//
// Una lista CERRADA de verbos que la carta sabe hacer y que un dato puede nombrar como destino (una zona de la cara, un
// paso de guía): enfocar, entrar, girar, cambiar de nivel, lanzar, componer y ejecutar. Es dato (hasta la pasada única por
// la época 0, datos/provisional/gestos.json, con su copia generada), y un libro no la amplía: un gesto que no está en la
// lista no es un destino. Cada gesto dice sus parámetros con un tipo de parámetro (src/tipos.js), y su validación es la
// de ese tipo. Aquí no se ejecuta nada: hacer un gesto es de la carta; esto solo dice cuáles hay y si un destino vale.
//
//   gestos(eje, opciones)                  la lista: [{ nombre, parametros: [{ nombre, tipo, base, requerido }], ayuda }]
//   validarGesto(eje, destino, opciones)   ¿es un destino «gesto» válido? { ok, gesto, parametros: { nombre: valor }, motivos }
//
// El destino «gesto» es una décupla: 0 «gesture», 1 el nombre de un gesto de la lista y, desde el 2, los valores de sus
// parámetros en su orden (los opcionales del final pueden faltar). Un valor de tipo ref puede ir como id o como { ref }.

import { GESTOS_PROVISIONALES } from './provisional.js';
import { resolverTipo, valeElValor } from './tipos.js';
import { ContextoEje } from './contexto-eje.js';
import { epocaDelEje, EPOCA_0_BTML } from './epocas.js';
import { esReferencia } from './btml.js';

/** La marca del 0 de un destino «gesto». */
export const DESTINO_GESTO = 'gesture';

const primeraHoja = (x) => (Array.isArray(x) ? primeraHoja(x[0]) : x);
const epocaDe = (eje, opciones) => opciones?.epoca ?? (eje && typeof eje.epoca === 'function' ? epocaDelEje(eje) : EPOCA_0_BTML);

/** Un gesto de los datos: { nombre, parametros: [{ nombre, tipo, requerido }], ayuda }, o null si su forma no vale. */
function gestoDe(g) {
  const nombre = primeraHoja(g?.[0]);
  if (typeof nombre !== 'string' || !nombre) return null;
  const parametros = (Array.isArray(g[1]) ? g[1] : []).filter((p) => Array.isArray(p) && typeof p[0] === 'string' && typeof p[1] === 'string')
    .map((p) => ({ nombre: p[0], tipo: p[1], requerido: p[2] === 'required' }));
  return { nombre, parametros, ayuda: primeraHoja(g[2]) ?? '' };
}

/** La lista cerrada, de los datos (los gestos que no tienen forma no entran). */
const LISTA = Object.freeze(GESTOS_PROVISIONALES.map(gestoDe).filter(Boolean).map((g) => Object.freeze({ ...g, parametros: Object.freeze(g.parametros.map((p) => Object.freeze(p))) })));

/**
 * Los gestos de la lente, en su orden, con cada parámetro resuelto en la época del libro (su tipo base y sus validaciones,
 * src/tipos.js): [{ nombre, parametros: [{ nombre, tipo, base, requerido, validaciones, error }], ayuda }].
 */
export function gestos(eje, opciones = {}) {
  const epoca = epocaDe(eje, opciones);
  return LISTA.map((g) => ({
    nombre: g.nombre,
    ayuda: g.ayuda,
    parametros: g.parametros.map((p) => {
      const t = resolverTipo([p.tipo], { epoca });
      return { nombre: p.nombre, tipo: p.tipo, base: t.base, requerido: p.requerido, validaciones: t.validaciones, error: t.error };
    }),
  }));
}

/**
 * ¿Es `destino` un destino «gesto» válido en el libro de `eje`? Una décupla [[«gesture»], [nombre], [valor 1], …]: el
 * nombre ha de estar en la lista cerrada; cada parámetro requerido, presente; cada valor, válido para su tipo (con it = el
 * valor, en el libro). → { ok, gesto (el nombre, o null), parametros: { nombre: valor }, motivos: [{ que, parametro?, mensaje }] }.
 */
export function validarGesto(eje, destino, opciones = {}) {
  const motivos = [];
  const fuera = (gesto, parametros = {}) => ({ ok: motivos.length === 0, gesto, parametros, motivos });
  if (!Array.isArray(destino) || primeraHoja(destino[0]) !== DESTINO_GESTO) {
    motivos.push({ que: 'forma', mensaje: 'un destino «gesto» es una décupla con «' + DESTINO_GESTO + '» en su 0' });
    return fuera(null);
  }
  const nombre = primeraHoja(destino[1]);
  const gesto = gestos(eje, opciones).find((g) => g.nombre === nombre);
  if (!gesto) {
    motivos.push({ que: 'no es un gesto', mensaje: '«' + String(nombre) + '» no está en la lista cerrada de gestos (' + LISTA.map((g) => g.nombre).join(', ') + ')' });
    return fuera(null);
  }
  const valores = destino.slice(2);
  if (valores.length > gesto.parametros.length) motivos.push({ que: 'sobran', mensaje: nombre + ' pide ' + gesto.parametros.length + ' parámetros y lleva ' + valores.length });
  const ctx = new ContextoEje(eje ?? null, { epoch: epocaDe(eje, opciones) });
  const parametros = {};
  gesto.parametros.forEach((p, k) => {
    const crudo = Array.isArray(valores[k]) && valores[k].length === 1 && !Array.isArray(valores[k][0]) ? valores[k][0] : valores[k];
    if (crudo === undefined || crudo === null || (Array.isArray(crudo) && crudo.length === 0)) {
      if (p.requerido) motivos.push({ que: 'falta', parametro: p.nombre, mensaje: nombre + ': falta ' + p.nombre });
      return;
    }
    if (p.error) {
      motivos.push({ que: 'tipo', parametro: p.nombre, mensaje: nombre + ' · ' + p.nombre + ': ' + p.error });
      return;
    }
    const valor = esReferencia(crudo) ? crudo.ref : crudo;
    const r = valeElValor(p.validaciones, valor, ctx);
    if (!r.ok) motivos.push({ que: 'no vale', parametro: p.nombre, mensaje: nombre + ' · ' + p.nombre + ': no es ' + p.tipo });
    else parametros[p.nombre] = valor;
  });
  return fuera(nombre, parametros);
}
