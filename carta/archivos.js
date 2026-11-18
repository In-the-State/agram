// Los archivos adjuntos en la carta (issues #21, #22; docs/CONTRATO.md §2.1): subir uno a la función `archivos` del
// libro compartido, bajarlo con la clave de lectura que la carta ya tiene, y lo de esta pestaña (lo bajado y lo que
// espera a subirse). Sin DOM, para probarlo con el servidor de prueba (test/archivos.test.js).
//
// El registro guarda solo la referencia `archivo:<sha256>` (modelos.referenciaDeArchivo). El id se calcula AQUÍ antes
// de subir (el mismo SHA-256 que calcula el servidor), así que la transacción se puede escribir aunque no haya red: el
// archivo se queda en esta pestaña y se sube en la siguiente sincronización (como la cola de eventos de sincronia.js);
// si la pestaña se cierra antes, se pierde y el registro apunta a un archivo que no está (se pinta «no disponible»).
// Sin servidor (un ejemplo, o una cuenta sin `blossom url` ni `sync url`, sin `sync ledger` o sin clave de lectura) no cabe encolarlo: se rechaza.
//
//   tipoDeArchivo(nombre, tipo)            → el tipo admitido (por su tipo o su extensión) o null
//   formatoDeTipo(tipo, opciones)          → el formato de la época (epoch.9.5.1) con que se representa, o null
//   new Archivos({ destino, fetch, alCambiar })
//     .preparar({ nombre, tipo, bytes })   → { id, tipo, bytes, referencia } (o lanza con el motivo)
//     .adjuntar(archivo)                   → { id, tipo, referencia, subido, sinRed } (o lanza): prepara, guarda y sube
//   valoresDeArchivo(p, campos) · subirLosNombrados(archivos, preparados, valores)   una acción con archivo, por la bandeja
//     .subirPendientes()                   → cuántos quedan por subir
//     .contenido(id)                       → lo que hay de un archivo en esta pestaña: { estado, tipo, texto?, url? }

import * as contrato from '../src/contrato.js';
import * as acciones from '../src/acciones.js';
import { destinoDeArchivos } from '../src/sincronia.js';
import { referenciaDeArchivo } from '../src/modelos.js';
import { enviar } from './carta.js';
import { t, HOLA, holaInicial } from './textos.js';

/** Tope de un archivo (el de la función). */
export const LIMITE = 2 * 1024 * 1024;
/** Tope de lo que la carta pinta como HTML en el iframe (srcdoc). */
export const LIMITE_HTML = 1024 * 1024;
/**
 * Los tipos que admite la función y el formato de la época (epoch.9.5.1) con que se representa cada uno: el contrato
 * de la función (servidor/supabase/funciones/archivos/api.js, TIPOS), no un dato del dominio. La palabra del formato
 * solo vale si la época la tiene (formatoDeTipo).
 */
export const TIPOS = Object.freeze({ 'text/html': 'html', 'image/png': 'image', 'image/jpeg': 'image', 'image/svg+xml': 'svg', 'application/json': 'lottie' });
const POR_EXTENSION = Object.freeze({ html: 'text/html', htm: 'text/html', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', svg: 'image/svg+xml', json: 'application/json' });

/** El tipo admitido de un archivo: el que dice el navegador si es uno de TIPOS, si no el de su extensión; null si no se admite. */
export function tipoDeArchivo(nombre, tipo) {
  const dicho = String(tipo ?? '').split(';')[0].trim().toLowerCase();
  if (Object.hasOwn(TIPOS, dicho)) return dicho;
  const ext = /\.([a-z0-9]+)$/i.exec(String(nombre ?? ''))?.[1]?.toLowerCase();
  return ext && Object.hasOwn(POR_EXTENSION, ext) ? POR_EXTENSION[ext] : null;
}

/** El formato de la época para un tipo admitido, si la época lo tiene entre los formatos de las representaciones. */
export function formatoDeTipo(tipo, opciones = {}) {
  const f = TIPOS[tipo];
  return f && contrato.formatos(opciones).includes(f) ? f : null;
}

/** Tras un fallo al bajar un archivo (sin red, el servidor), cuándo se vuelve a pedir. */
const REINTENTO_MS = 30 * 1000;

const hex = (buf) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
/** SHA-256 en hexadecimal de unos bytes (el id del archivo, el mismo que calcula la función). */
export async function sha256(bytes) {
  return hex(await globalThis.crypto.subtle.digest('SHA-256', bytes));
}

/**
 * El HTML básico con que nace toda alta (VG 14-11, #84): «hola» en medio, texto plano en el idioma de la cuenta, sin
 * estilos externos ni scripts (el iframe aislado los ignoraría igual: SEG-14, SEG-15). Es el archivo que la alta
 * adjunta a su PV0 (`archivo:<sha256>`); como lo trae la propia carta, se ve sin servidor: INICIALES lo tiene a mano por su id.
 */
export function htmlInicial(idioma) {
  const hola = holaInicial(idioma);
  return `<!doctype html><html lang="${HOLA[idioma] ? idioma : Object.keys(HOLA)[0]}"><head><meta charset="utf-8"><title>${hola}</title></head><body style="margin:0;min-height:100vh;display:grid;place-items:center;font:24px system-ui,sans-serif"><p>${hola}</p></body></html>`;
}

/** El HTML inicial de un idioma como archivo adjunto: { id, tipo, bytes, referencia }. */
export async function inicial(idioma) {
  const bytes = new TextEncoder().encode(htmlInicial(idioma));
  const id = await sha256(bytes);
  return { id, tipo: 'text/html', bytes, referencia: referenciaDeArchivo(id) };
}

/** Los HTML iniciales de todos los idiomas que la carta sabe saludar: id → bytes (se calculan una vez, al cargar el módulo). */
export const INICIALES = new Map();
try {
  for (const idioma of Object.keys(HOLA)) {
    const x = await inicial(idioma);
    INICIALES.set(x.id, x.bytes);
  }
} catch { /* sin WebCrypto (un contexto no seguro) no hay hash que calcular: los iniciales se bajarían como cualquier archivo */ }

/**
 * Los valores de los parámetros de archivo de una acción con un archivo ya preparado (Archivos.preparar): por la faceta de
 * cada uno (acciones.archivoDe: la de la base file), «ref» su referencia `archivo:<sha256>`, «format» el formato de la época
 * con que se representa y «size» sus bytes. `campos`: [{ nombre, archivo }]. Lanza si la época no tiene formato para su tipo.
 * Así una acción con archivo es una entrada más de la bandeja (A33): el archivo se elige antes de componer, y lo que no
 * cabe (tipo, tamaño: preparar) se dice entonces.
 */
export function valoresDeArchivo(p, campos, opciones = {}) {
  const formato = formatoDeTipo(p.tipo, opciones);
  if (!formato) throw new Error(t('archivoSinFormato', { tipo: p.tipo }));
  const por = { ref: p.referencia, format: formato, size: p.bytes?.length };
  return Object.fromEntries((campos ?? []).filter((c) => por[c.archivo] !== undefined).map((c) => [c.nombre, por[c.archivo]]));
}

/** Las referencias `archivo:<sha256>` que nombra un valor, en profundidad (las de unos valores o de un registro). */
export function referenciasEn(x, fuera = new Set()) {
  if (typeof x === 'string' && /^archivo:[0-9a-f]{64}$/.test(x)) fuera.add(x);
  else if (Array.isArray(x)) for (const v of x) referenciasEn(v, fuera);
  else if (x !== null && typeof x === 'object') for (const v of Object.values(x)) referenciasEn(v, fuera);
  return fuera;
}

/**
 * Antes de firmar lo que nombra archivos de este aparato (A33): sube los preparados (`preparados`: referencia → lo de
 * preparar) que nombran `valores` (una lista: los de cada entrada que se va a lanzar). Sin red quedan pendientes y se suben
 * al sincronizar; sin servidor, o si el servidor lo rechaza, lanza y no se lanza nada. → [lo de adjuntarPreparado].
 */
export async function subirLosNombrados(archivos, preparados, valores) {
  const refs = new Set();
  for (const v of valores ?? []) referenciasEn(v, refs);
  const subidos = [];
  for (const ref of refs) {
    const p = preparados?.get(ref);
    if (p) subidos.push(await archivos.adjuntarPreparado(p));
  }
  return subidos;
}

/**
 * La acción que adjunta a X una representación suya, leída de la época sin nombrarla: la primera (en el orden de la época)
 * que se ancla en el 0 de X, donde van sus representaciones (contrato.representaciones), y pide un archivo (un parámetro de
 * faceta «ref», acciones.archivoDe). Sus valores para un archivo: la referencia y el formato en los parámetros de esas
 * facetas y, en el 1.0 (el tamaño mínimo de la representación), el mayor tamaño de la época (9.5.2: la pantalla).
 * → { accion (su id), valores } o null si la época no tiene ninguna.
 */
export function accionDeRepresentacion(eje, { referencia, formato }, opciones = {}) {
  const o = acciones.conEpoca(eje, opciones);
  const mayor = contrato.tamanos(o).at(-1)?.tamano;
  for (const { id, plantilla } of acciones.plantillasDeTransaccion(o)) {
    const ancla = Array.isArray(plantilla?.[5]) ? plantilla[5] : [plantilla?.[5]];
    if (ancla.length !== 1 || ancla[0] !== '0') continue;
    const parametros = acciones.parametros(plantilla, o);
    if (!parametros.some((p) => acciones.archivoDe(p) === 'ref')) continue;
    const valores = {};
    for (const p of parametros) {
      const faceta = acciones.archivoDe(p);
      if (faceta === 'ref') valores[p.nombre] = referencia;
      else if (faceta === 'format') valores[p.nombre] = formato;
      else if (p.posicion === '1.0' && mayor !== undefined) valores[p.nombre] = mayor;
    }
    return { accion: id, valores };
  }
  return null;
}

/**
 * El HTML básico inicial en el PV0 de una alta (VG 14-11, #84): la plantilla «attach a file» escribe sobre X su
 * representación de tamaño 3 con la referencia `archivo:<sha256>` del HTML de `inicial`; `firmar`, la firma de quien la
 * escribe (o nada). Sirve para una cuenta nueva (cuentas.crearCuenta, con `htmlInicial`) y para una cosa dada de alta.
 * → el registro asentado, o null si no pasó (la alta ya existe: sin su HTML se ve como hasta ahora, su nombre).
 */
export async function adjuntarHtmlInicial(eje, X, identidad, firmar, idioma, opciones = {}) {
  try {
    const x = await inicial(idioma);
    const formato = formatoDeTipo(x.tipo, opciones);
    if (!formato) return null;
    const a = accionDeRepresentacion(eje, { referencia: x.referencia, formato }, opciones);
    if (!a) return null;
    const r = await enviar(eje, X, a.accion, a.valores, identidad, firmar, opciones);
    return r.ok && r.asentado ? r.asentado : null;
  } catch {
    return null;
  }
}

/**
 * Dónde están los archivos de `yo` (docs/CONTRATO.md §16.2 bis): { url, eje, claveLectura } o null. La url es la «blossom url» de
 * «exterior settings» si la ha dicho; si no, la «sync url» de las preferencias (el eje y la clave de lectura son los de siempre).
 */
export function destinoDe(eje, yo, claveLectura) {
  const d = eje && yo ? destinoDeArchivos(eje, yo) : null;
  return d && claveLectura ? { url: d.url, eje: d.eje, claveLectura } : null;
}

/** Lo que espera la función: la base (`blossom url` o `sync url`) sin barra final. */
const base = (url) => String(url).replace(/\/+$/, '');

/**
 * Los archivos de esta pestaña. `destino()` → { url, eje, claveLectura } o null (sin servidor no se sube ni se baja);
 * `alCambiar()` se llama cuando llega un archivo pedido (la app repinta).
 */
export class Archivos {
  constructor({ destino = () => null, fetch = globalThis.fetch?.bind(globalThis), alCambiar = () => {} } = {}) {
    this.destino = destino;
    this.fetch = fetch;
    this.alCambiar = alCambiar;
    this.cache = new Map(); // id → { estado: 'listo' | 'cargando' | 'falta' | 'error', tipo, bytes, texto, url, motivo }
    this.pendientes = new Map(); // id → { tipo, bytes }: lo adjuntado sin red, por subir
  }

  /** Lee y comprueba un archivo ({ nombre, tipo, bytes } o un File del navegador) y calcula su id. Lanza con el motivo si no vale. */
  async preparar(archivo) {
    const nombre = archivo?.name ?? archivo?.nombre ?? '';
    const tipo = tipoDeArchivo(nombre, archivo?.type ?? archivo?.tipo);
    if (!tipo) throw new Error(t('archivoTipoNo', { nombre, tipos: Object.keys(TIPOS).join(', ') }));
    // { bytes } (Node, las pruebas) o un File del navegador (que también tiene un método bytes(): no es lo mismo)
    const bytes = ArrayBuffer.isView(archivo?.bytes) || archivo?.bytes instanceof ArrayBuffer ? new Uint8Array(archivo.bytes) : new Uint8Array(await archivo.arrayBuffer());
    if (!bytes.length) throw new Error(t('archivoVacio', { nombre }));
    if (bytes.length > LIMITE) throw new Error(t('archivoGrande', { nombre, tope: Math.round(LIMITE / 1024 / 1024) }));
    const id = await sha256(bytes);
    return { id, tipo, bytes, referencia: referenciaDeArchivo(id) };
  }

  /** Lo que hay de un archivo ya leído (lo que se pinta): el texto del HTML (si cabe) o una URL local de la imagen. */
  listo(id, tipo, bytes) {
    const e = { estado: 'listo', tipo, bytes };
    if (tipo === 'text/html') {
      if (bytes.length > LIMITE_HTML) Object.assign(e, { estado: 'error', motivo: t('archivoHtmlGrande', { tope: Math.round(LIMITE_HTML / 1024) }) });
      else e.texto = new TextDecoder('utf-8').decode(bytes);
    } else if (tipo === 'image/svg+xml') {
      // Un SVG en <img> no ejecuta nada, pero una URL blob es del MISMO ORIGEN que la carta: abierta directamente
      // (clic derecho, arrastrar a la barra) ejecutaría sus scripts con acceso al almacén local (la clave de lectura,
      // las claves de la cuenta). Un data: URL es de origen opaco al navegarlo: solo sirve para <img> (SEG-15).
      e.url = 'data:image/svg+xml;base64,' + aBase64(bytes);
    } else if (Object.hasOwn(TIPOS, tipo) && typeof URL.createObjectURL === 'function') {
      // una imagen de píxeles o una animación Lottie (su JSON, para lottie-web): una URL local; ninguna de las dos ejecuta nada al navegarla
      e.url = URL.createObjectURL(new Blob([bytes], { type: tipo }));
    }
    this.cache.set(id, e);
    return e;
  }

  /**
   * Adjunta: prepara, lo deja en esta pestaña y lo sube. Sin servidor, lanza (no cabe encolarlo); si el servidor lo
   * rechaza (clave, tipo, tamaño), lanza con su motivo; sin red, queda pendiente (`sinRed`) y se sube después.
   */
  async adjuntar(archivo) {
    return this.adjuntarPreparado(await this.preparar(archivo));
  }

  /** Guarda y sube un archivo ya preparado (preparar: su id calculado en local). → como adjuntar. */
  async adjuntarPreparado(p) {
    const d = this.destino();
    if (!d) throw new Error(t('archivoSinServidor'));
    const r = await this.subir(p.id, p.tipo, p.bytes, d);
    if (r.motivo) throw new Error(r.motivo);
    this.listo(p.id, p.tipo, p.bytes);
    if (r.sinRed) this.pendientes.set(p.id, { tipo: p.tipo, bytes: p.bytes });
    return { id: p.id, tipo: p.tipo, referencia: p.referencia, subido: !r.sinRed, sinRed: Boolean(r.sinRed) };
  }

  /** Sube unos bytes. → { ok } | { sinRed } | { motivo } (el error del servidor tal cual). */
  async subir(id, tipo, bytes, d = this.destino()) {
    if (!d) return { sinRed: true };
    let r;
    try {
      r = await this.fetch(base(d.url) + '/archivos?eje=' + encodeURIComponent(d.eje), { method: 'POST', headers: { 'Content-Type': tipo, 'X-Clave-Lectura': d.claveLectura }, body: bytes });
    } catch {
      return { sinRed: true };
    }
    const cuerpo = await r.json().catch(() => ({}));
    if (!r.ok) return { motivo: t('archivoRechazado', { estado: r.status, motivo: cuerpo.error ?? '' }) };
    if (cuerpo.id !== id) return { motivo: t('archivoOtroId') };
    return { ok: true };
  }

  /** Sube lo que quedó pendiente (lo llama la sincronización). → cuántos quedan. */
  async subirPendientes() {
    for (const [id, { tipo, bytes }] of [...this.pendientes]) {
      const r = await this.subir(id, tipo, bytes);
      if (r.sinRed) break;
      this.pendientes.delete(id); // subido, o rechazado por el servidor (no se reintenta un rechazo)
    }
    return this.pendientes.size;
  }

  /**
   * Lo que hay de un archivo en esta pestaña; si no está, lo pide (una vez) y, al llegar, llama a alCambiar. → la entrada
   * de la caché ({ estado, tipo, texto?, url?, motivo? }); sin servidor y sin tenerlo, { estado: 'falta' }.
   */
  contenido(id) {
    const e = this.cache.get(id);
    if (e && !(e.estado === 'error' && e.reintentar && Date.now() >= e.reintentar)) return e;
    if (INICIALES.has(id)) return this.listo(id, 'text/html', INICIALES.get(id)); // el HTML con que nace toda alta: lo trae la carta
    const d = this.destino();
    if (!d) return { estado: 'falta' };
    const cargando = { estado: 'cargando' };
    this.cache.set(id, cargando);
    void this.bajar(id, d).then(() => this.alCambiar());
    return cargando;
  }

  async bajar(id, d = this.destino()) {
    try {
      const r = await this.fetch(base(d.url) + '/archivos/' + id + '?eje=' + encodeURIComponent(d.eje), { headers: { 'X-Clave-Lectura': d.claveLectura } });
      if (!r.ok) {
        // 404: no está (se pinta «no disponible»); otro fallo del servidor, se vuelve a pedir pasado un rato.
        const motivo = (await r.json().catch(() => ({}))).error ?? 'HTTP ' + r.status;
        this.cache.set(id, r.status === 404 ? { estado: 'falta' } : { estado: 'error', motivo, reintentar: Date.now() + REINTENTO_MS });
        return this.cache.get(id);
      }
      const tipo = (r.headers.get('content-type') ?? '').split(';')[0].trim();
      return this.listo(id, Object.hasOwn(TIPOS, tipo) ? tipo : 'application/octet-stream', new Uint8Array(await r.arrayBuffer()));
    } catch {
      this.cache.set(id, { estado: 'error', motivo: t('sinRed'), reintentar: Date.now() + REINTENTO_MS }); // sin red: se vuelve a pedir pasado un rato
      return this.cache.get(id);
    }
  }
}

/** Bytes → base64 (Node y navegador), para el data: URL de los SVG. */
function aBase64(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (typeof globalThis.Buffer === 'function') return globalThis.Buffer.from(b).toString('base64');
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
  return btoa(s);
}
