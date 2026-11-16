// El reverso de la carta (la cara 5) como editor de código sobre el BTML del registro (VG, 14-11, #93): los datos tal
// como son (monoespaciada, líneas numeradas, sangrado por nivel, un color por tipo de valor) y un botón «formatear» que
// alterna el BTML crudo con el formateado para leer (fechas legibles, números con su formato, nombres por el 0 en lugar
// de ids). Es TEXTO: nada de él se interpreta ni se ejecuta; quien lo pinta lo escapa (carta/dom.js htmlBtml).
//
// Los criterios de formato (fecha, números, estilo) son preferencias de la carta, guardadas en este navegador por cuenta
// (leerFormato, guardarFormato): el núcleo no tiene todavía dónde escribirlos (la plantilla «preferences» de la época solo
// conoce paso, pintado, idioma, tamaños, modelo, animaciones y el servidor; un criterio nuevo es un dato de la época).
// El idioma sí es una preferencia del núcleo («language»): el desplegable lo escribe por el camino de siempre.
// Esta parte es pura: no toca el DOM ni el eje (solo lo lee, por contrato.legible).

import * as contrato from '../src/contrato.js';
import { esReferencia } from '../src/btml.js';
import { esInstante, msUTC } from '../src/instante.js';
import { t } from './textos.js';

const RE_DIA = /^\d{4}-\d{2}-\d{2}$/;

/** Los criterios de formato y sus valores posibles: el primero de cada uno es el de quien no ha elegido. */
export const CRITERIOS = Object.freeze({
  fecha: Object.freeze(['legible', 'larga', 'corta', 'iso']),
  numeros: Object.freeze(['tal-cual', 'agrupados']),
  estilo: Object.freeze(['expandido', 'compacto']),
});

/** Lo que enseña el editor al principio: el BTML crudo y, al formatear, los criterios de siempre. */
export const FORMATO_INICIAL = Object.freeze({ formateado: false, fecha: 'legible', numeros: 'tal-cual', estilo: 'expandido' });

/** Un formato con lo que tenga de válido: lo que no es un valor conocido vuelve al de siempre. */
export function formatoValido(f) {
  const dado = f && typeof f === 'object' ? f : {};
  const fuera = { formateado: dado.formateado === true };
  for (const [clave, valores] of Object.entries(CRITERIOS)) fuera[clave] = valores.includes(dado[clave]) ? dado[clave] : FORMATO_INICIAL[clave];
  return fuera;
}

/** La clave del almacén local de los criterios de quien mira: por cuenta (su alta) o «ejemplo». */
export const claveDeFormato = (quien) => 'agram.formato.' + (quien || 'ejemplo');

/** Los criterios guardados de `quien` (el almacén es un localStorage o algo con getItem y setItem); sin ellos o rotos, los de siempre. */
export function leerFormato(almacen, quien) {
  try {
    const crudo = almacen?.getItem?.(claveDeFormato(quien));
    return formatoValido(crudo ? JSON.parse(crudo) : null);
  } catch {
    return formatoValido(null);
  }
}

/** Guarda los criterios de `quien` (con lo válido de ellos); devuelve si se pudo. */
export function guardarFormato(almacen, quien, f) {
  try {
    almacen.setItem(claveDeFormato(quien), JSON.stringify(formatoValido(f)));
    return true;
  } catch {
    return false;
  }
}

// ---------- las líneas del editor ----------

const SANGRIA = '  ';
const llave = (v) => ({ k: 'llave', v });
const esFecha = (s) => typeof s === 'string' && (esInstante(s) || RE_DIA.test(s));

/** Una fecha según el criterio: legible (la que dice el núcleo en el idioma), larga, corta o la ISO tal cual. */
function fechaComoPide(s, f, idioma, opciones, eje = null) {
  if (f.fecha === 'iso') return s;
  if (f.fecha === 'legible') return contrato.legible(eje, s, null, { idioma, ...opciones }).texto || s;
  const estilo = f.fecha === 'larga' ? 'long' : 'short';
  const dia = RE_DIA.test(s);
  const ms = dia ? Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10))) : msUTC(s);
  if (!Number.isFinite(ms)) return s;
  try {
    return new Intl.DateTimeFormat(idioma || 'en', dia ? { dateStyle: estilo, timeZone: 'UTC' } : { dateStyle: estilo, timeStyle: 'short', timeZone: 'UTC' }).format(new Date(ms));
  } catch {
    return s;
  }
}

/** Un número según el criterio: tal cual viene o agrupado por miles como se escribe en el idioma. */
function numeroComoPide(n, f, idioma) {
  if (f.numeros !== 'agrupados') return String(n);
  try {
    return new Intl.NumberFormat(idioma || 'en').format(n);
  } catch {
    return String(n);
  }
}

/** Los trozos de una hoja (un terminal o una referencia) del BTML, crudos o formateados. */
function trozosDeHoja(v, f, o) {
  if (esReferencia(v)) {
    if (!f.formateado) {
      return [llave('{'), { k: 'clave', v: '"ref"' }, llave(': '), { k: 'ref', v: JSON.stringify(v.ref) }, ...(v.dir ? [llave(', '), { k: 'clave', v: '"dir"' }, llave(': '), { k: 'ref', v: JSON.stringify(v.dir) }] : []), llave('}')];
    }
    return [{ k: 'nombre', v: contrato.legible(o.eje, v, null, { idioma: o.idioma, ...o.opciones }).texto || String(v.ref).slice(0, 8) }];
  }
  if (typeof v === 'number') return [{ k: 'numero', v: f.formateado ? numeroComoPide(v, f, o.idioma) : String(v) }];
  const s = String(v);
  if (!f.formateado) return [{ k: esFecha(s) ? 'fecha' : 'texto', v: JSON.stringify(s) }];
  if (esFecha(s)) return [{ k: 'fecha', v: fechaComoPide(s, f, o.idioma, o.opciones, o.eje) }];
  const leido = contrato.legible(o.eje, s, null, { idioma: o.idioma, ...o.opciones });
  return [{ k: leido.partes?.ref || leido.partes?.X || leido.partes?.identidad ? 'nombre' : 'texto', v: leido.texto || s }];
}

/** Las líneas de un valor del BTML a un nivel de sangrado; `coma`, si le sigue otro hermano. */
function lineasDe(valor, nivel, coma, f, o) {
  const sangria = { k: 'sangria', v: SANGRIA.repeat(nivel) };
  const fin = coma ? [llave(',')] : [];
  if (!Array.isArray(valor)) return [{ nivel, trozos: [sangria, ...trozosDeHoja(valor, f, o), ...fin] }];
  if (!valor.length) return [{ nivel, trozos: [sangria, llave('[]'), ...fin] }];
  const soloHojas = valor.every((x) => !Array.isArray(x));
  // El crudo es siempre compacto (los datos tal como son); el formateado, como pida el criterio de estilo.
  if (soloHojas && (!f.formateado || f.estilo === 'compacto')) {
    const trozos = [sangria, llave('[')];
    valor.forEach((h, i) => { if (i) trozos.push(llave(', ')); trozos.push(...trozosDeHoja(h, f, o)); });
    return [{ nivel, trozos: [...trozos, llave(']'), ...fin] }];
  }
  return [
    { nivel, trozos: [sangria, llave('[')] },
    ...valor.flatMap((h, i) => lineasDe(h, nivel + 1, i < valor.length - 1, f, o)),
    { nivel, trozos: [sangria, llave(']'), ...fin] },
  ];
}

/**
 * Las líneas numeradas del BTML de `payload`: [{ n, nivel, trozos: [{ k, v }] }], con k = sangria | llave | clave | texto |
 * numero | ref | fecha | nombre (el tipo del valor: el color lo pone la hoja de estilos). `formato` es el del editor
 * (formatoValido); `eje`, `idioma` y `opciones.epoca`, lo que contrato.legible necesita para los nombres y las fechas.
 */
export function lineasDeBtml(payload, formato, { eje = null, idioma = 'es', opciones = {} } = {}) {
  const f = formatoValido(formato);
  if (payload === undefined || payload === null) return [];
  return lineasDe(payload, 0, false, f, { eje, idioma, opciones }).map((l, i) => ({ n: i + 1, ...l }));
}

/** El instante de un registro (su t) según el criterio de fecha: la línea de la plantilla del reverso nunca lo enseña crudo salvo que se pida así. */
export function fechaDelRegistro(s, formato, { eje = null, idioma = 'es', opciones = {} } = {}) {
  return esFecha(s) ? fechaComoPide(s, formatoValido(formato), idioma, opciones, eje) : s ?? '';
}

/**
 * Lo que el reverso enseña del BTML de X: el payload del registro como líneas, el formato que rige y, al formatear, los
 * criterios para que quien mira los establezca (cada uno con sus valores en el idioma y dónde se guarda).
 * `idiomas`: los de la época (contrato.idiomas), para el desplegable del idioma de la cuenta.
 */
export function editorDeBtml(eje, X, formato, { idioma = 'es', idiomas = [], opciones = {} } = {}) {
  const ev = eje?.obtener?.(X) ?? null;
  const f = formatoValido(formato);
  const nombreDeIdioma = (c) => { try { return new Intl.DisplayNames([c], { type: 'language' }).of(c) ?? c; } catch { return c; } };
  const criterios = f.formateado ? [
    ...Object.keys(CRITERIOS).map((clave) => ({
      clave, etiqueta: t('criterio_' + clave), valor: f[clave], guardaEn: 'local',
      opciones: CRITERIOS[clave].map((valor) => ({ valor, texto: t('criterio_' + clave + '_' + valor) })),
    })),
    { clave: 'idioma', etiqueta: t('criterio_idioma'), valor: idioma, guardaEn: 'cuenta', opciones: [...new Set([...idiomas, idioma])].map((valor) => ({ valor, texto: nombreDeIdioma(valor) })) },
  ] : [];
  return { formateado: f.formateado, formato: f, lineas: ev ? lineasDeBtml(ev.payload, f, { eje, idioma, opciones }) : [], criterios };
}
