// El reverso de la carta (la cara 5) como editor de código sobre el BTML del registro (VG, 14-11, #93): los datos tal
// como son (monoespaciada, líneas numeradas, sangrado por nivel, un color por tipo de valor) y un botón «formatear» que
// alterna el BTML crudo con el formateado para leer (fechas legibles, números con su formato, nombres por el 0 en lugar
// de ids). Es TEXTO: nada de él se interpreta ni se ejecuta; quien lo pinta lo escapa (carta/dom.js htmlBtml).
//
// Las preferencias de formato (fecha, números, estilo y cómo se abre el editor) son un registro «format settings» del
// libro, anclado en el 9 de mi alta como «language» en las preferencias (#93, época 0 final): se leen con
// contrato.configuracionDeFormato y se escriben con contrato.registroDeAjustes por el camino de escribir de siempre
// (carta/app.js). Los valores posibles son los de la plantilla (contrato.clavesDeConfiguracionDe), no se escriben aquí.
// El idioma sí es una preferencia aparte («language»): su desplegable la escribe por el camino de siempre.
// Esta parte es pura: no toca el DOM ni el eje (solo lo lee, por contrato.legible).

import * as contrato from '../src/contrato.js';
import { esReferencia, direccion } from '../src/btml.js';
import { esInstante, msUTC } from '../src/instante.js';
import { t } from './textos.js';

const RE_DIA = /^\d{4}-\d{2}-\d{2}$/;

/** Cada criterio de la carta con su clave en la plantilla «format settings» (los valores tienen los mismos nombres). */
export const CLAVES_DE_FORMATO = Object.freeze({ fecha: 'date format', numeros: 'number format', estilo: 'editor style', vista: 'editor view' });

/** Las claves de la plantilla de formato de la época, con su defecto y sus valores: [{ clave, defecto, valores }]. */
const claves = (opciones) => contrato.clavesDeConfiguracionDe(contrato.AJUSTES_DE_FORMATO, opciones);

/**
 * Las preferencias de formato de `yo` leídas del libro (contrato.configuracionDeFormato): { fecha, numeros, estilo,
 * vista } y `formateado` (lo que enseña el editor: por defecto, si «editor view» es formateado; `sesion` puede decir otra
 * cosa solo por esta sesión). Sin registro, o sin cuenta, los de siempre. `memoria` son los criterios cambiados en esta
 * sesión sin cuenta (nada se escribe): ganan al libro.
 */
export function formatoDeLibro(eje, yo, { opciones = {}, memoria = {}, sesion = undefined } = {}) {
  const c = contrato.configuracionDeFormato(eje, yo ?? null, opciones);
  const dado = (k) => { const v = memoria[k] ?? c[CLAVES_DE_FORMATO[k]]; return Array.isArray(v) ? v[0] : v; };
  const f = { fecha: dado('fecha'), numeros: dado('numeros'), estilo: dado('estilo'), vista: dado('vista') };
  return { ...f, formateado: typeof sesion === 'boolean' ? sesion : f.vista === 'formateado' };
}

/** Un formato con su forma: lo que no es texto vuelve al defecto de la plantilla; `formateado`, siempre un booleano. */
export function formatoValido(f, opciones = {}) {
  const dado = f && typeof f === 'object' ? f : {};
  const defecto = (k) => claves(opciones).find((c) => c.clave === CLAVES_DE_FORMATO[k])?.defecto;
  const texto = (k) => (typeof dado[k] === 'string' ? dado[k] : defecto(k));
  const vista = texto('vista');
  return { fecha: texto('fecha'), numeros: texto('numeros'), estilo: texto('estilo'), vista, formateado: typeof dado.formateado === 'boolean' ? dado.formateado : vista === 'formateado' };
}

/**
 * El registro «format settings» que escribe un cambio de desplegable: los cuatro valores de ahora con el cambio
 * ({ fecha | numeros | estilo | vista: valor }); { sobre, en, payload } como los de las preferencias, o null si yo no tiene alta.
 * `vista` es la del libro, no la de la sesión (el botón «formatear» no escribe).
 */
export function registroDeFormato(eje, yo, cambio, opciones = {}) {
  const alta = eje?.alta?.(yo);
  if (!alta) return null;
  const actual = formatoDeLibro(eje, yo, { opciones });
  const valores = Object.fromEntries(Object.entries(CLAVES_DE_FORMATO).map(([k, clave]) => [clave, cambio[k] ?? actual[k]]));
  const payload = contrato.registroDeAjustes(contrato.AJUSTES_DE_FORMATO, valores, { quien: yo, ...opciones });
  return payload ? { sobre: alta.id, en: direccion([9]), payload } : null;
}

/** La clave de un almacén local anterior a las preferencias en el libro (agram.formato.<alta>); ya no se lee. */
const claveAntigua = (quien) => 'agram.formato.' + (quien || 'ejemplo');

/** Lo guardado de antes en el almacén local no se migra: si la clave vieja existe, se borra. Devuelve si había algo. */
export function olvidarFormatoLocal(almacen, quien) {
  try {
    const clave = claveAntigua(quien);
    if (almacen?.getItem?.(clave) === null || almacen?.getItem?.(clave) === undefined) return false;
    almacen.removeItem(clave);
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

/**
 * Un valor leído por el núcleo, con el 0 legible de un registro entero (`o.cero`: la función de la carta, carta.js ceroDe)
 * donde el núcleo da el 0 guardado. Solo el modo formateado lo usa: el BTML crudo son los datos tal como son.
 */
function leidoComoPide(eje, v, o) {
  const l = contrato.legible(eje, v, null, { idioma: o.idioma, ...o.opciones });
  const p = l.partes;
  return typeof o.cero === 'function' && p?.X && !p.dir && p.representacion !== null && l.texto === p.representacion && eje?.obtener?.(p.X)?.payload?.[0] === p.representacion
    ? { ...l, texto: o.cero(p.X, l.texto) }
    : l;
}

/** Los trozos de una hoja (un terminal o una referencia) del BTML, crudos o formateados. */
function trozosDeHoja(v, f, o) {
  if (esReferencia(v)) {
    if (!f.formateado) {
      return [llave('{'), { k: 'clave', v: '"ref"' }, llave(': '), { k: 'ref', v: JSON.stringify(v.ref) }, ...(v.dir ? [llave(', '), { k: 'clave', v: '"dir"' }, llave(': '), { k: 'ref', v: JSON.stringify(v.dir) }] : []), llave('}')];
    }
    return [{ k: 'nombre', v: leidoComoPide(o.eje, v, o).texto || String(v.ref).slice(0, 8) }];
  }
  if (typeof v === 'number') return [{ k: 'numero', v: f.formateado ? numeroComoPide(v, f, o.idioma) : String(v) }];
  const s = String(v);
  if (!f.formateado) return [{ k: esFecha(s) ? 'fecha' : 'texto', v: JSON.stringify(s) }];
  if (esFecha(s)) return [{ k: 'fecha', v: fechaComoPide(s, f, o.idioma, o.opciones, o.eje) }];
  const leido = leidoComoPide(o.eje, s, o);
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
export function lineasDeBtml(payload, formato, { eje = null, idioma = 'es', opciones = {}, cero = null } = {}) {
  const f = formatoValido(formato, opciones);
  if (payload === undefined || payload === null) return [];
  return lineasDe(payload, 0, false, f, { eje, idioma, opciones, cero }).map((l, i) => ({ n: i + 1, ...l }));
}

/** El instante de un registro (su t) según el criterio de fecha: la línea de la plantilla del reverso nunca lo enseña crudo salvo que se pida así. */
export function fechaDelRegistro(s, formato, { eje = null, idioma = 'es', opciones = {} } = {}) {
  return esFecha(s) ? fechaComoPide(s, formatoValido(formato, opciones), idioma, opciones, eje) : s ?? '';
}

/**
 * Lo que el reverso enseña del BTML de X: el payload del registro como líneas, el formato que rige y, al formatear, los
 * criterios para que quien mira los establezca: los tres de formato y «al abrir» (cómo se abre el editor), cada uno con
 * sus valores y su nombre tal como los da la plantilla «format settings» de la época en el idioma, más el idioma de la
 * cuenta. `guardaEn` dice dónde queda lo que se elige: 'libro' (un registro «format settings», o «language»), o 'sesion' (sin
 * cuenta: solo en esta sesión). `idiomas`: los de la época (contrato.idiomas), para el desplegable del idioma de la cuenta;
 * `cero`: el 0 legible de un registro (carta.js ceroDe), para cambiar un id por su 0 al formatear.
 */
export function editorDeBtml(eje, X, formato, { idioma = 'es', idiomas = [], opciones = {}, cero = null, conCuenta = true } = {}) {
  const ev = eje?.obtener?.(X) ?? null;
  const f = formatoValido(formato, opciones);
  const nombreDeIdioma = (c) => { try { return new Intl.DisplayNames([c], { type: 'language' }).of(c) ?? c; } catch { return c; } };
  const guardaEn = conCuenta ? 'libro' : 'sesion';
  const delaEpoca = (clave, que) => contrato.texto(eje, contrato.claves.parametro(contrato.AJUSTES_DE_FORMATO, clave, que), idioma, { original: clave, epoca: opciones.epoca });
  const criterio = (k, etiqueta) => {
    const clave = CLAVES_DE_FORMATO[k];
    const valores = claves(opciones).find((c) => c.clave === clave)?.valores ?? [];
    return {
      clave: k, etiqueta: etiqueta ?? delaEpoca(clave, 'label'), valor: f[k], guardaEn,
      opciones: [...new Set([...valores, f[k]])].map((valor) => ({ valor, texto: delaEpoca(clave, 'option ' + valor) })),
    };
  };
  const criterios = f.formateado ? [
    criterio('fecha'), criterio('numeros'), criterio('estilo'), criterio('vista', t('btmlAlAbrir')),
    { clave: 'idioma', etiqueta: t('criterio_idioma'), valor: idioma, guardaEn: 'libro', opciones: [...new Set([...idiomas, idioma])].map((valor) => ({ valor, texto: nombreDeIdioma(valor) })) },
  ] : [];
  return { formateado: f.formateado, formato: f, lineas: ev ? lineasDeBtml(ev.payload, f, { eje, idioma, opciones, cero }) : [], criterios };
}
