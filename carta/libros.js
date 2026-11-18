// La carta con varios libros (A24; agram-equipo/DISENO_CARTA_VARIOS_LIBROS.md §4.3, §4.4 y §4.7). Sin DOM: lo que
// enseña «Tus libros» y lo que hace «abrir aquí un libro privado», para probarlo sin navegador (test/carta-libros.test.js).
// carta/app.js lo engancha a la pantalla y carta/dom.js lo pinta.
//
// Una persona es una clave y esa clave tiene varios libros: cada entrada de carta/cuentas.js es «mi sitio en un libro»
// ({ nombre, identidad, alta, publica, libro, cuelga? }). Aquí no se guarda nada nuevo: se leen las entradas.
//
//   etiquetas(entradas)                         → Map alta → etiqueta (dos libros con el mismo nombre: ocho letras del libro)
//   tusLibros(entradas, { publica, abierto, conDestino })  → lo que lista «Tus libros»
//   previaDelLibroPrivado(eje, X, yo, opciones) → lo que enseña el diálogo antes de confirmar: el nombre y lo que cuesta
//   abrirLibroPrivado({ … })                    → crea el libro pequeño con mi clave y escribe en él «this book hangs from»
//   costeDelAnuncio(eje, X, yo, { libro, claves }) · anunciarLibroPrivado(eje, X, yo, { libro, claves, firmar })
//                                               → «open a private book here» en el grande, con las claves de línea
//   librosParaCopia(entradas, { guardian })     → mis libros abiertos, para la copia de todos

import { Eje, contrato, acciones, autoridad, epocaEscritaDe } from '../src/index.js';
import * as cuentas from './cuentas.js';
import { enviar, motivosEnLlano, ceroDe } from './carta.js';
import { clavesDeLinea } from './anfitrion.js';

const { LIBRO_PRIVADO } = contrato;

// Los nombres de los parámetros de las dos plantillas del enlace: del núcleo (contrato.PARAMETROS_DEL_ENLACE).
export const PARAMETROS = contrato.PARAMETROS_DEL_ENLACE;

const corto = (id) => String(id ?? '').slice(0, 8);

// ---------- «Tus libros» (§4.3) ----------

/**
 * La etiqueta de cada entrada: su nombre y, si otra entrada de la lista se llama igual, ocho letras de su libro (o de su
 * alta, en una entrada de antes sin completar): «Casa · 1a2b3c4d». → Map alta → etiqueta.
 */
export function etiquetas(entradas) {
  const lista = Array.isArray(entradas) ? entradas : [];
  const cuantos = new Map();
  for (const e of lista) cuantos.set(e.nombre, (cuantos.get(e.nombre) ?? 0) + 1);
  return new Map(lista.map((e) => [e.alta, cuantos.get(e.nombre) > 1 ? `${e.nombre} · ${corto(e.libro ?? e.alta)}` : String(e.nombre ?? corto(e.alta))]));
}

/**
 * Lo que lista «Tus libros»: los libros de mi clave (`publica`), cada uno con su etiqueta y, debajo, los que cuelgan de él
 * (con el nombre del elemento, o su id corto si no lo sé); un libro mío que cuelga de otro que no está en este dispositivo
 * va arriba, con lo que se sabe de dónde cuelga; aparte, las entradas de otras claves («otras personas en este
 * dispositivo»). `abierto`: el alta del libro en pantalla. `conDestino(alta)`: si ese libro tiene destino de sincronía; sin
 * él, «solo en este dispositivo».
 * → { propios: [{ alta, etiqueta, abierto, soloAqui, cuelga?: { elemento }, colgados: [igual, con `elemento`] }], otras: [{ alta, etiqueta, abierto }] }
 */
export function tusLibros(entradas, { publica = null, abierto = null, conDestino = () => false } = {}) {
  const lista = (Array.isArray(entradas) ? entradas : []).filter((e) => e && typeof e.alta === 'string');
  const nombres = etiquetas(lista);
  const destino = (alta) => { try { return Boolean(conDestino(alta)); } catch { return false; } };
  const fila = (e) => ({ alta: e.alta, libro: e.libro ?? null, etiqueta: nombres.get(e.alta), abierto: e.alta === abierto, soloAqui: !destino(e.alta) });
  const mias = lista.filter((e) => cuentas.mismaClave(e.publica, publica));
  const otras = lista.filter((e) => !cuentas.mismaClave(e.publica, publica)).map((e) => ({ alta: e.alta, etiqueta: nombres.get(e.alta), abierto: e.alta === abierto }));
  const grandeDe = (e) => (e.cuelga?.libro ? mias.find((g) => g !== e && g.libro === e.cuelga.libro) ?? null : null);
  const elementoDe = (e) => e.cuelga?.nombre ?? corto(e.cuelga?.elemento);
  const propios = mias.filter((e) => !grandeDe(e)).map((e) => ({
    ...fila(e),
    ...(e.cuelga?.libro ? { cuelga: { elemento: elementoDe(e) } } : {}),
    colgados: mias.filter((h) => grandeDe(h) === e).map((h) => ({ ...fila(h), elemento: elementoDe(h) })),
  }));
  return { propios, otras };
}

// ---------- «Abrir aquí un libro privado» (§4.4) ----------

/** Lo que cuesta lanzar `nombre` sobre X con `valores` (acciones.ejecucion, la cuenta del formulario): { exigido, denominacion } o null. */
function costeDe(eje, X, nombre, valores, yo, opciones = {}) {
  try {
    const e = acciones.ejecucion(eje, nombre, { X, ...valores }, yo, opciones);
    return e?.ok ? { exigido: e.exigido, denominacion: e.denominacion } : null;
  } catch {
    return null;
  }
}

/** Un id de 64 hex que solo sirve para medir (lo que cuesta un registro depende de cuánto ocupa, no de qué id lleva). */
const MEDIDA = 'f'.repeat(64);

/**
 * Lo que enseña el diálogo antes de confirmar: el nombre del elemento (por defecto, el del libro nuevo) y lo que cuesta
 * escribir en el libro pequeño «this book hangs from» (medido sobre un libro de prueba en memoria, sin firmar ni guardar:
 * el mismo registro cuesta lo mismo en un libro recién nacido). Lo del anuncio en el grande depende de cuántas claves de
 * línea dé el anfitrión: se enseña cuando se sabe (costeDelAnuncio), antes de escribirlo. → { elemento, nombre, cuelga }.
 */
export async function previaDelLibroPrivado(eje, X, yo, opciones = {}) {
  const elemento = ceroDe(eje, X, { opciones }, corto(X)) ?? corto(X);
  let cuelga = null;
  try {
    const epoca = epocaEscritaDe(eje.epoca(), { porReferencia: true });
    // Un libro de demostración (sin clave): solo sirve para medir; nunca se guarda ni se firma nada en él. Nace con la época
    // del libro grande, como nacerá el pequeño (abrirLibroPrivado): con otra, la plantilla y su coste podrían ser otros.
    const prueba = await Eje.genesis({ demostracion: true, identidad: yo, foco: String(elemento), t: opciones.t ?? new Date().toISOString(), ...(epoca ? { epoca } : {}) });
    cuelga = costeDe(prueba, prueba.genesisId, LIBRO_PRIVADO.cuelga, { [PARAMETROS.libro]: eje.genesisId, [PARAMETROS.elemento]: X }, yo, opciones);
  } catch {
    cuelga = null;
  }
  return { elemento: String(elemento), nombre: String(elemento), cuelga };
}

/**
 * Crea el libro pequeño con mi clave (crearCuenta con `conClave`: la misma persona, la misma identidad) y escribe en él
 * «this book hangs from» con el libro grande y el elemento X (su T, en su libro; por el camino de siempre: carta.js
 * enviar). Lo guarda en este navegador sin cambiar el libro abierto (`recordar: false`), con el nombre del elemento en su
 * entrada. Nace con las reglas que rigen en el grande (la época por referencia, docs/notas/LIBRO_PRIVADO.md): con la 0 del
 * código sin cambios no escribe nada; con cambios, solo los cambios; con una época escrita, la escribe. Pide después al anfitrión las claves de línea del libro nuevo (anfitrion.clavesDeLinea; sin anfitrión que las
 * dé, ninguna). Con guardián, cada firma abre su diálogo (`dialogo`).
 *
 * `grande`: { eje, cuenta (la entrada abierta), privada } (camino A) o { eje, cuenta } con `guardian` (camino B).
 * Si crear falla, lanza (nada se guarda). Si falla escribir de qué cuelga, el libro queda creado y guardado: `falta:
 * 'cuelga'` y sus `motivos`. → { pequeno: { cuenta, eje, privada?, firmante? }, cuelga (el registro asentado) | null,
 * claves: [{ nivel, clave }], falta?, motivos, guardado }.
 */
export async function abrirLibroPrivado({ grande, X, nombre, guardian = null, t, idioma } = {}) {
  const { eje, cuenta, privada } = grande ?? {};
  if (!eje || !cuenta || !eje.obtener(X)) throw new Error('no hay elemento del que colgar el libro');
  const conClave = guardian ? { publica: cuenta.publica } : { publica: cuenta.publica, privada };
  const creado = await cuentas.crearCuenta({ nombre, idioma: idioma ?? cuenta.idioma, conClave, epoca: epocaEscritaDe(eje.epoca(), { porReferencia: true }), identidad: cuenta.identidad, ...(guardian ? { guardian, dialogo: true } : {}), ...(t ? { t } : {}) });
  const p = creado.eje;
  const yo = creado.cuenta.identidad;
  const firmar = guardian ? autoridad.firmanteDeEventos(creado.firmante, { publica: creado.publica }) : cuentas.firmarCon(creado.privada);
  const elementoNombre = ceroDe(eje, X, {}, null);
  const pequeno = { cuenta: { ...creado.cuenta, cuelga: { libro: eje.genesisId, elemento: X, ...(elementoNombre ? { nombre: String(elementoNombre) } : {}) } }, eje: p, ...(guardian ? { firmante: creado.firmante } : { privada: creado.privada }) };
  const r = await enviar(p, p.genesisId, LIBRO_PRIVADO.cuelga, { [PARAMETROS.libro]: eje.genesisId, [PARAMETROS.elemento]: X }, yo, firmar, t ? { t } : {});
  const guardado = await cuentas.guardarCuenta({ cuenta: pequeno.cuenta, eje: p, privada: creado.privada }, { recordar: false });
  pequeno.cuenta = cuentas.entradaDe(pequeno.cuenta, p);
  if (!r.ok || !r.asentado) return { pequeno, cuelga: null, claves: [], falta: 'cuelga', motivos: motivosEnLlano(r.motivos, p), guardado };
  const claves = guardian ? await clavesDeLinea(guardian, cuenta.publica, p.genesisId) : [];
  return { pequeno, cuelga: r.asentado, claves, motivos: [], guardado };
}

/** Los valores de «open a private book here» para el libro `libro` con sus claves de línea ([{ nivel, clave }]). */
const valoresDelAnuncio = (libro, claves) => ({ [PARAMETROS.libro]: libro, [PARAMETROS.claves]: (claves ?? []).map((c) => [c.nivel, c.clave]) });

/** Lo que cuesta anunciar en el grande el libro `libro` con esas claves (a la vista antes de confirmar), o null. */
export function costeDelAnuncio(eje, X, yo, { libro = MEDIDA, claves = [] } = {}, opciones = {}) {
  return costeDe(eje, X, LIBRO_PRIVADO.abrir, valoresDelAnuncio(libro, claves), yo, opciones);
}

/**
 * Escribe en el grande «open a private book here» sobre X con el id del pequeño y sus claves de línea, por el camino de
 * siempre (carta.js enviar: su T, en el grande). Solo si hay claves: la plantilla pide hoy de una a cuatro; sin ninguna no
 * se escribe nada y vuelve `sinClaves`. → lo que da enviar (motivos en llano) o { ok: false, sinClaves: true }.
 */
export async function anunciarLibroPrivado(eje, X, yo, { libro, claves, firmar, t } = {}) {
  if (!Array.isArray(claves) || !claves.length) return { ok: false, sinClaves: true, asentado: null, motivos: [] };
  const r = await enviar(eje, X, LIBRO_PRIVADO.abrir, valoresDelAnuncio(libro, claves), yo, firmar, t ? { t } : {});
  return { ...r, motivos: motivosEnLlano(r.motivos, eje) };
}

/**
 * El anuncio en el grande como entrada de la bandeja (VG 18-11: lo que toca dos libros se compone y se ejecuta desde el 4,
 * libro a libro): «open a private book here» sobre X con el libro y sus claves de línea. Crear el libro pequeño (y escribir
 * en él de qué cuelga) sigue siendo un gesto en el acto: no es una acción de la época, y el anuncio necesita el id del libro
 * y las claves que solo existen al crearlo. → { accion, X, valores } o null sin claves (la plantilla pide de una a cuatro).
 */
export function entradaDelAnuncio(X, { libro, claves } = {}) {
  if (!Array.isArray(claves) || !claves.length) return null;
  return { accion: LIBRO_PRIVADO.abrir, X, valores: valoresDelAnuncio(libro, claves) };
}

// ---------- la copia de todos mis libros (§4.7) ----------

/**
 * Mis libros de este dispositivo, abiertos para la copia de todos: cada entrada por cuentas.abrirCuenta. Los que no se
 * abren no entran y se dicen. → { libros: [{ cuenta, eje, privada?, claveLectura }], fallidos: [{ alta, nombre, motivo }] }.
 */
export async function librosParaCopia(entradas, { guardian = null } = {}) {
  const libros = [];
  const fallidos = [];
  for (const e of entradas ?? []) {
    const r = await cuentas.abrirCuenta(e.alta, { guardian });
    if (r.eje) libros.push({ cuenta: r.cuenta, eje: r.eje, privada: r.privada, claveLectura: cuentas.claveLectura(e.alta) });
    else fallidos.push({ alta: e.alta, nombre: e.nombre, motivo: r.motivo });
  }
  return { libros, fallidos };
}
