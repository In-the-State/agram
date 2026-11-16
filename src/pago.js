// El servicio de pagos de StateArk (§5 del contrato AGRAM ↔ exterior; encargo «carta: pagos», 16-11): un adaptador,
// gemelo de src/sello.js, con las rutas /pagos/* del servicio (la simulación, servidor/sim/stateark/ 108f888, o el
// backend de StateArk), todo asíncrono:
//
//   pago.raiz()                                                → { servicio, … }                    GET /                              sin firma
//   pago.cartera({ nombre })                                   → { nombre, titular }                POST /pagos/cartera                firmada (el titular es `pubkey`)
//   pago.direccion({ nombre })                                 → { direccion }                      POST /pagos/direccion              firmada
//   pago.preparar({ nombre, instruccion })                     → el plan                            POST /pagos/preparar               firmada
//   pago.autorizar({ plan, firma })                            → la autorización                    POST /pagos/autorizar              firmada
//   pago.ejecutar({ nombre, instruccion, plan, autorizacion }) → el recibo del carril               POST /pagos/ejecutar               firmada
//   pago.saldos({ nombre })                                    → { altura, n, pendiente, … }        POST /pagos/saldos                 firmada
//   pago.reciboPago(txid)                                      → sobre | null | { pendiente: true } GET /pagos/recibo-pago/:txid        sin firma
//   pago.reciboPorPuntero(id)                                  → sobre | null | { pendiente: true } GET /pagos/recibo-pago/puntero/:id sin firma
//
// LA FIRMA DEL TITULAR (S54, como el backend): NIP-98, `Authorization: Nostr <base64 del evento JSON>`, un evento kind
// 27235 con su id NIP-01 (SHA-256 de [0, pubkey, created_at, kind, tags, content]) y su firma BIP-340, y las etiquetas
// `u` (la «pay url» + la ruta), `method` y, si hay cuerpo, `payload` (SHA-256 hex del cuerpo EXACTO). El cuerpo se
// serializa UNA vez y ese mismo texto se firma y se envía; cada petición firmada lleva un `content` distinto (un
// contador), para que dos iguales en el mismo segundo no den `replay`. El servicio la exige en cartera, dirección,
// preparar y saldos; aquí se firman también autorizar y ejecutar (allí, si llega, se verifica). Los GET, sin firma.
//
// EL FIRMANTE ES INYECTABLE: el adaptador recibe `firmar(idHex) → firmaHex` (BIP-340 sobre los 32 bytes del id) y la
// clave pública x-only `pubkey`; la carta le da el de la cuenta (el mismo material con el que firma sus registros) y
// mañana se lo dará el guardián. La clave privada no entra aquí. Este módulo no conoce ninguna simulación (TOK-74).
//
// Lo que compromete (autorizar un pago) lo firma el guardián (VG 12-11): en la web la carta solo pide recibos; la
// pantalla de pagar no está decidida. El recibo de pago entra en el eje por src/sincronia.js (`esperarPago`,
// eje.marcarPago, X.6.8.3) y lo comprueba la regla «paid» de la época (X.6.8.6).

import { AJUSTES, exterior } from './exterior.js';
import { sha256, aHex } from './cripto.js';

/** La clave de la configuración («exterior settings», docs/CONTRATO.md §16.2 bis) que dice dónde está el servicio de pagos. */
export const CONFIGURACION = Object.freeze({ url: AJUSTES.pago });

/** El kind de un evento NIP-98 (HTTP Auth). */
export const KIND_NIP98 = 27235;

const HEX64 = /^[0-9a-f]{64}$/;
const HEX128 = /^[0-9a-f]{128}$/;
const utf8 = (texto) => new TextEncoder().encode(texto);
const bytesDe = (cuerpo) => (cuerpo === undefined || cuerpo === null ? new Uint8Array(0) : typeof cuerpo === 'string' ? utf8(cuerpo) : cuerpo);

/** El id NIP-01 de un evento: SHA-256 (hex) de [0, pubkey, created_at, kind, tags, content] en JSON sin espacios. */
export function idNip98({ pubkey, created_at, kind, tags, content }) {
  return aHex(sha256(utf8(JSON.stringify([0, pubkey, created_at, kind, tags, content]))));
}

/**
 * El evento NIP-98 de una petición, SIN firmar, con su id: { id, pubkey, created_at, kind: 27235, tags, content }.
 * `url`: la url absoluta de la petición (la «pay url» + la ruta); `metodo`: GET, POST…; `cuerpo`: el cuerpo EXACTO que
 * se enviará (texto o bytes; sin cuerpo no hay etiqueta `payload`); `content`: un texto libre (el contador);
 * `creado`: segundos Unix.
 */
export function eventoNip98({ pubkey, url, metodo, cuerpo, content = '', creado } = {}) {
  if (typeof pubkey !== 'string' || !HEX64.test(pubkey)) throw new TypeError('NIP-98: la clave pública es x-only, 64 hex en minúsculas');
  if (typeof url !== 'string' || !url) throw new TypeError('NIP-98: hace falta la url de la petición');
  if (typeof metodo !== 'string' || !metodo) throw new TypeError('NIP-98: hace falta el método');
  if (!Number.isSafeInteger(creado) || creado < 0) throw new TypeError('NIP-98: created_at son segundos Unix');
  const tags = [['u', url], ['method', metodo]];
  const bytes = bytesDe(cuerpo);
  if (bytes.length) tags.push(['payload', aHex(sha256(bytes))]);
  const e = { pubkey, created_at: creado, kind: KIND_NIP98, tags, content: String(content) };
  return { id: idNip98(e), ...e };
}

/** La cabecera `Authorization` de un evento ya firmado (con `sig`): `Nostr <base64 del evento JSON>`. */
export function cabeceraNip98(evento) {
  if (!evento || typeof evento.sig !== 'string' || !HEX128.test(evento.sig)) throw new TypeError('NIP-98: el evento no está firmado');
  let binario = '';
  for (const b of utf8(JSON.stringify(evento))) binario += String.fromCharCode(b);
  return 'Nostr ' + btoa(binario);
}

/**
 * El servicio de pagos no respondió, o rechazó la petición: `estado` (el HTTP, o null sin respuesta) y `codigo` (el
 * del servicio: `titular_signature_missing`, `titular_signature_invalid`, `replay`, `not_titular`, o el de un 422 del
 * carril; null si no lo dio).
 */
export class ErrorDePago extends Error {
  constructor(mensaje, { estado = null, codigo = null } = {}) {
    super(mensaje);
    this.name = 'ErrorDePago';
    this.estado = estado;
    this.codigo = codigo;
  }
}

// El contador del `content`: uno por proceso (o pestaña), para que dos peticiones firmadas nunca lleven el mismo evento.
let serie = 0;

/**
 * El adaptador por el servicio HTTP en `url` (la «pay url»: …/pagos/* y / cuelgan de ella). `firmar(idHex) → firmaHex`
 * (puede ser asíncrona) y `pubkey` firman como el titular; sin ellos, solo los GET (los recibos). `ahora()`: ms Unix
 * (el `created_at`). Lanza ErrorDePago si no hay red o el servicio rechaza (salvo los recibos: ver arriba).
 */
export function pagoHttp({ url, fetch = globalThis.fetch?.bind(globalThis), firmar, pubkey, ahora = () => Date.now() } = {}) {
  if (typeof url !== 'string' || !url) throw new TypeError('pago: hace falta la url del servicio');
  if (typeof fetch !== 'function') throw new Error('pago: no hay fetch');
  const base = url.replace(/\/+$/, '');
  const pedir = async (metodo, ruta, objeto, { firmada = false } = {}) => {
    const cuerpo = objeto === undefined ? undefined : JSON.stringify(objeto); // UNA vez: este texto se firma y se envía
    const headers = cuerpo === undefined ? {} : { 'Content-Type': 'application/json' };
    if (firmada) {
      if (typeof firmar !== 'function' || typeof pubkey !== 'string' || !HEX64.test(pubkey)) throw new TypeError('pago: ' + ruta + ' se firma como el titular: hacen falta firmar y pubkey');
      serie += 1;
      const evento = eventoNip98({ pubkey, url: base + ruta, metodo, cuerpo, content: String(serie), creado: Math.floor(ahora() / 1000) });
      const sig = await firmar(evento.id);
      headers.Authorization = cabeceraNip98({ ...evento, sig });
    }
    let r;
    try {
      r = await fetch(base + ruta, { method: metodo, headers, ...(cuerpo === undefined ? {} : { body: cuerpo }) });
    } catch (e) {
      throw new ErrorDePago('sin red hacia el servicio de pagos: ' + (e?.message ?? String(e)));
    }
    let datos = null;
    try {
      datos = await r.json();
    } catch {
      datos = null;
    }
    return { estado: r.status, ok: r.ok, datos };
  };
  const sinError = ({ estado, ok, datos }) => {
    if (!ok) throw new ErrorDePago('pagos ' + estado + ': ' + (datos?.error ?? 'sin detalle'), { estado, codigo: typeof datos?.codigo === 'string' ? datos.codigo : null });
    return datos;
  };
  // Un recibo: el sobre (200), null si no hay pago (404), { pendiente: true } si aún no tiene bloque (422 unconfirmed).
  const recibo = async (ruta) => {
    const r = await pedir('GET', ruta);
    if (r.estado === 404) return null;
    if (r.estado === 422 && r.datos?.codigo === 'unconfirmed') return { pendiente: true };
    return sinError(r);
  };
  const post = async (ruta, objeto) => sinError(await pedir('POST', ruta, objeto, { firmada: true }));
  return {
    via: 'http',
    url: base,
    raiz: async () => sinError(await pedir('GET', '/')),
    cartera: ({ nombre } = {}) => post('/pagos/cartera', { nombre, titular: pubkey }),
    direccion: ({ nombre } = {}) => post('/pagos/direccion', { nombre }),
    preparar: ({ nombre, instruccion } = {}) => post('/pagos/preparar', { nombre, instruccion }),
    autorizar: ({ plan, firma } = {}) => post('/pagos/autorizar', { plan, titular: pubkey, firma }),
    ejecutar: ({ nombre, instruccion, plan, autorizacion } = {}) => post('/pagos/ejecutar', { nombre, instruccion, plan, autorizacion }),
    saldos: ({ nombre } = {}) => post('/pagos/saldos', { nombre }),
    reciboPago: (txid) => recibo('/pagos/recibo-pago/' + encodeURIComponent(String(txid ?? ''))),
    reciboPorPuntero: (id) => recibo('/pagos/recibo-pago/puntero/' + encodeURIComponent(String(id ?? ''))),
  };
}

/**
 * El adaptador por un carril que se inyecta (pruebas en proceso, como `selloCon`): un objeto con, al menos,
 * `reciboPago(txid)` y `reciboPorPuntero(id)` (el sobre del recibo, null si no hay pago, y `{ pendiente: true }` o un
 * error con `codigo: 'unconfirmed'` si aún no tiene bloque) y, si los tiene, raiz, cartera, direccion, preparar,
 * autorizar, ejecutar y saldos con la forma del adaptador. Todo asíncrono; un error con `codigo` sale como ErrorDePago.
 */
export function pagoCon(carril) {
  if (!carril || ['reciboPago', 'reciboPorPuntero'].some((k) => typeof carril[k] !== 'function')) throw new TypeError('pago: el carril ha de tener reciboPago y reciboPorPuntero');
  const comoError = (e) => (e instanceof ErrorDePago || typeof e?.codigo !== 'string' ? e : new ErrorDePago(e.message, { estado: Number.isInteger(e.estado) ? e.estado : null, codigo: e.codigo }));
  const llamar = (k) => async (...args) => {
    try {
      return await carril[k](...args);
    } catch (e) {
      throw comoError(e);
    }
  };
  const recibo = (k) => async (x) => {
    try {
      return (await carril[k](x)) ?? null;
    } catch (e) {
      if (e?.codigo === 'unconfirmed') return { pendiente: true };
      throw comoError(e);
    }
  };
  const resto = Object.fromEntries(['raiz', 'cartera', 'direccion', 'preparar', 'autorizar', 'ejecutar', 'saldos'].filter((k) => typeof carril[k] === 'function').map((k) => [k, llamar(k)]));
  return { via: typeof carril.via === 'string' ? carril.via : 'inyectado', ...resto, reciboPago: recibo('reciboPago'), reciboPorPuntero: recibo('reciboPorPuntero') };
}

/** La dirección del servicio de pagos de `yo` («pay url» de «exterior settings»; http o https, sin la barra final), o null. */
export function destino(eje, yo, opciones = {}) {
  return exterior(eje, yo, opciones).pago;
}

/**
 * El adaptador de la configuración de `yo`: el servicio HTTP de su «pay url» con el firmante que se le da (`firmar`,
 * `pubkey`; el de la cuenta, o mañana el del guardián), o null si no la ha dicho: sin «pay url» no se pide ningún recibo.
 */
export function deConfiguracion(eje, yo, { fetch, firmar, pubkey, ahora, ...opciones } = {}) {
  const url = destino(eje, yo, opciones);
  return url ? pagoHttp({ url, fetch, firmar, pubkey, ...(ahora ? { ahora } : {}) }) : null;
}
