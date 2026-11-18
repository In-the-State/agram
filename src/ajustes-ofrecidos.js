// Las plantillas de ajustes de la época, ofrecidas como acciones donde anclan (VG 18-11: «la pantalla de configuración
// pasa a ser acciones en su punto de vista»).
//
// Qué es dato, qué es código y por qué:
//   - Qué plantillas son de ajustes lo dice la época: las que llevan «settings» en el 4 de su 4 (contrato.esDeAjustes);
//     hoy, las preferencias, los ajustes de la guía, los del exterior y los de formato. Aquí no se nombra ninguna.
//   - Su catálogo (las claves, sus defectos, su ayuda y, si su validación es una enumeración, sus valores) también es dato
//     de la plantilla (contrato.clavesDeConfiguracionDe), y el molde de su registro lo da contrato.registroDeAjustes.
//   - Dónde ancla un registro de ajustes es regla del núcleo: en el 9 del alta de quien lo escribe, que es donde lo lee
//     contrato.configuracionDe (docs/CONTRATO.md §15.7, §16). La época lo dice en llano en la nota de cada plantilla; no
//     lo trae como dato aparte. Por eso se ofrecen ahí, sobre mi alta, y en ningún otro sitio.
//   - Lo que falta y se programa aquí es la capacidad general: «una plantilla de ajustes se ofrece como acción donde
//     ancla». Cada una sale con el id de su sitio en la época (su dirección, como el de cualquier plantilla de la época) y
//     su nombre en el idioma; escribirla es un registro de ajustes (el payload que da su formulario), que la bandeja
//     compone como entrada de tipo registro y el 4 ejecuta.

import * as contrato from './contrato.js';
import { direccion, esReferencia } from './btml.js';

/** El punto de vista del alta donde ancla todo registro de ajustes (donde lo lee contrato.configuracionDe). */
export const PV_DE_LOS_AJUSTES = 9;
/** Dónde ancla, como dirección de diez dígitos. */
export const ANCLA_DE_LOS_AJUSTES = direccion([PV_DE_LOS_AJUSTES]);
/** El modo desde el que se escribe un registro de ajustes (el de siempre de la lente: uno por registro, en su orden). */
export const MODO_DE_LOS_AJUSTES = 'sequenced';

const hojas = (x) => (x === undefined || x === null ? [] : Array.isArray(x) ? x : [x]);

/** Las plantillas de ajustes de la época, en su orden: [{ id (su dirección en la época), nombre }]. */
export function plantillasDeAjustes(opciones = {}) {
  return contrato.plantillas(null, opciones).filter((p) => contrato.esDeAjustes(p.registro) && /^[0-9]{10}$/.test(p.donde)).map((p) => ({ id: p.donde, nombre: p.nombre }));
}

/** La plantilla de ajustes de un id (su dirección en la época) o de su nombre: { id, nombre } o null si no es de ajustes. */
export function plantillaDeAjustes(id, opciones = {}) {
  if (typeof id !== 'string' || !id) return null;
  return plantillasDeAjustes(opciones).find((p) => p.id === id || p.nombre === id) ?? null;
}

/** El nombre de una plantilla de ajustes en el idioma (contrato.texto: «template <nombre>»; sin texto, el canónico). */
const etiquetaDe = (eje, nombre, idioma, opciones) => contrato.texto(eje, contrato.claves.plantilla(nombre), idioma, { original: nombre, ...(opciones.epoca ? { epoca: opciones.epoca } : {}) });

/**
 * Las plantillas de ajustes que se ofrecen sobre X en el punto de vista pv a `yo`: todas las de la época si X es el alta
 * de yo y pv es donde anclan; si no, ninguna. → [{ id, nombre (canónico), etiqueta (en el idioma) }], en el orden de la época.
 */
export function ajustesOfrecidos(eje, X, pv, yo, opciones = {}) {
  if (Number(pv) !== PV_DE_LOS_AJUSTES || typeof yo !== 'string' || !yo) return [];
  const alta = eje?.alta?.(yo);
  const id = typeof X === 'string' ? X : X?.id;
  if (!alta || alta.id !== id) return [];
  const idioma = opciones.idioma ?? contrato.configuracion(eje, yo, opciones).language;
  return plantillasDeAjustes(opciones).map((p) => ({ ...p, etiqueta: etiquetaDe(eje, p.nombre, idioma, opciones) }));
}

/**
 * La candidata de los ajustes de la plantilla `nombre` de `yo` con los valores dados sobre los actuales, para escribirla
 * como un registro más anclado en el 9 de su alta. Sin huecos ni rellenos (VG 13-11, #77): el registro lleva las claves de
 * los ajustes que tienen valor y, en paralelo, sus valores (contrato.registroDeAjustes); se enseña un campo por ajuste
 * conocido y se guardan solo los rellenos. Un campo dado vacío quita el ajuste (si tiene defecto de la época, vuelve a
 * él); uno no dado conserva el actual. Un ajuste cuya validación es una enumeración lleva sus valores en `opciones`
 * ([{ valor, texto }], en el idioma: «template <plantilla> param <clave> option <valor>»).
 * → { payload, campos: [{ pv, clave, numero, valor, marcador, etiqueta, ayuda, opciones? }], sobre, en, cambiado } o null
 * si yo no tiene alta o la plantilla no está.
 */
export function ajustesEditablesDe(nombre, eje, yo, valores = {}, opciones = {}) {
  const alta = eje?.alta(yo);
  const plantilla = contrato.plantillas(null, opciones).find((p) => p.nombre === nombre);
  if (!alta || !plantilla) return null;
  const idioma = opciones.idioma ?? contrato.configuracion(eje, yo, opciones).language;
  const leido = contrato.configuracionDe(eje, yo, nombre, opciones);
  // Una lista (las claves de los observadores, varias hojas) se enseña y se compara como un texto separado por espacios.
  const actual = Object.fromEntries(Object.entries(leido).map(([k, x]) => [k, Array.isArray(x) ? x.join(' ') : x]));
  const claves = contrato.clavesDeConfiguracionDe(nombre, opciones);
  const texto = (clave, que, original) => contrato.texto(eje, contrato.claves.parametro(plantilla.nombre, clave, que), idioma, { original, ...opciones });
  const dados = {};
  const campos = [];
  let cambiado = false;
  for (const { pv, clave, defecto, ayuda: canonica, valores: enumeracion } of claves) {
    const numero = typeof defecto === 'number';
    const dado = valores[clave] !== undefined ? String(valores[clave]).trim() : undefined;
    let v = dado === undefined ? actual[clave] ?? defecto : dado === '' ? defecto : numero ? Number(dado) : dado;
    if (numero && !(Number.isFinite(v) && v > 0)) v = actual[clave] ?? defecto;
    if (v !== (actual[clave] ?? defecto)) cambiado = true;
    if (v !== undefined) dados[clave] = v;
    campos.push({
      pv, clave, numero, valor: v ?? '', marcador: defecto ?? '',
      etiqueta: texto(clave, 'label', clave),
      ayuda: texto(clave, 'help', canonica ?? ''),
      ...(enumeracion?.length >= 2 ? { opciones: enumeracion.map((x) => ({ valor: String(x), texto: texto(clave, 'option ' + x, String(x)) })) } : {}),
    });
  }
  const payload = contrato.registroDeAjustes(nombre, dados, { quien: yo, ...opciones });
  return { payload, campos, sobre: alta.id, en: ANCLA_DE_LOS_AJUSTES, cambiado: cambiado && payload !== null };
}

/**
 * La entrada de la bandeja que escribe un registro de ajustes (`payload`, de su formulario) sobre `sobre` (mi alta): una
 * entrada de tipo registro, sin acción, en el 9, desde el modo de siempre. `donde`: dónde se compuso.
 */
export const entradaDeAjustes = (payload, sobre, donde = { X: sobre, pv: PV_DE_LOS_AJUSTES }) => ({ tipo: 'registro', modo: MODO_DE_LOS_AJUSTES, en: ANCLA_DE_LOS_AJUSTES, accion: null, X: sobre, valores: { payload }, donde });

/**
 * De qué plantilla de ajustes es una entrada de la bandeja (una de tipo registro en el 9 cuyo payload es de una plantilla
 * de ajustes: su 0 y su 5 la nombran) y qué valores lleva, por clave ({ clave: valor | [valores] }, para volver a abrir su
 * formulario con ellos). → { id, nombre, valores } o null si no lo es.
 */
export function ajustesDeLaEntrada(entrada, opciones = {}) {
  if (entrada?.tipo !== 'registro' || entrada.en !== ANCLA_DE_LOS_AJUSTES) return null;
  const payload = entrada.valores?.payload;
  if (!Array.isArray(payload)) return null;
  const nombre = hojas(payload[contrato.MOLDE_DE_AJUSTES.tipo])[0];
  if (typeof nombre !== 'string' || esReferencia(nombre) || hojas(payload[contrato.MOLDE_DE_AJUSTES.nombre])[0] !== nombre) return null;
  const p = plantillaDeAjustes(nombre, opciones);
  if (!p || p.nombre !== nombre) return null;
  const ks = hojas(payload[contrato.MOLDE_DE_AJUSTES.claves]);
  const vs = hojas(payload[contrato.MOLDE_DE_AJUSTES.valores]);
  const valores = {};
  ks.forEach((k, i) => {
    if (typeof k !== 'string' || vs[i] === undefined) return;
    valores[k] = valores[k] === undefined ? vs[i] : [...hojas(valores[k]), vs[i]];
  });
  return { ...p, valores };
}
