// La firma del titular en cada petición: NIP-98 (S54), como el backend (app/crates/stateark-servidor/src/nip98.rs).
//
// La cabecera es `Authorization: Nostr <base64 del evento JSON>`, y el evento:
//   - es de `kind` 27235, con `id` = SHA-256 de la serialización NIP-01 [0, pubkey, created_at, kind, tags, content]
//     y `sig` la firma BIP-340 de `pubkey` sobre ese id;
//   - lleva ["u", <URL absoluta>] y ["method", <método>], y si la petición tiene cuerpo, ["payload", <sha256 hex del
//     cuerpo exacto>] (una etiqueta repetida se rechaza).
//
// `firmarNip98` es el ayudante de cliente (la carta de AGRAM puede copiarlo). `Verificador` es lo que exige la sim:
// u = base pública + ruta, created_at a ±60 s, anti-repetición en memoria con caducidad. Sin dependencias: BIP-340
// (firmar y verificar) sobre secp.js. NO es de tiempo constante: las claves de aquí son de PRUEBA.

import { aBytes, sha256, sha256Texto, hashEtiquetadoBytes } from './hash.js';
import { N, liftX } from './secp.js';

export const KIND = 27235;
export const VENTANA_S = 60;
/** Tope del evento en base64, como el backend. */
export const TOPE_BASE64 = 8 * 1024;

const P = 2n ** 256n - 2n ** 32n - 977n;
const G = { x: 0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798n, y: 0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8n };
const aEntero = (hex) => BigInt('0x' + hex);
const a32 = (n) => n.toString(16).padStart(64, '0');
const HEX = (largo) => new RegExp(`^[0-9a-f]{${largo}}$`);

// ── Aritmética de la curva (coordenadas jacobianas: una sola inversión por multiplicación) ──────────

const mod = (a) => ((a % P) + P) % P;
function potencia(b, e) {
  let r = 1n; let x = mod(b); let k = e;
  while (k > 0n) { if (k & 1n) r = (r * x) % P; x = (x * x) % P; k >>= 1n; }
  return r;
}
const INF = null;
const aJac = (p) => ({ X: p.x, Y: p.y, Z: 1n });
function doblar(p) {
  if (p === INF || p.Y === 0n) return INF;
  const A = mod(p.X * p.X); const B = mod(p.Y * p.Y); const C = mod(B * B);
  const D = mod(2n * (mod((p.X + B) ** 2n) - A - C)); const E = 3n * A; const F = mod(E * E);
  const X = mod(F - 2n * D);
  return { X, Y: mod(E * (D - X) - 8n * C), Z: mod(2n * p.Y * p.Z) };
}
function sumarJ(p, q) {
  if (p === INF) return q;
  if (q === INF) return p;
  const Z1Z1 = mod(p.Z * p.Z); const Z2Z2 = mod(q.Z * q.Z);
  const U1 = mod(p.X * Z2Z2); const U2 = mod(q.X * Z1Z1);
  const S1 = mod(p.Y * q.Z * Z2Z2); const S2 = mod(q.Y * p.Z * Z1Z1);
  if (U1 === U2) return S1 === S2 ? doblar(p) : INF;
  const H = mod(U2 - U1); const R = mod(S2 - S1);
  const H2 = mod(H * H); const H3 = mod(H * H2); const V = mod(U1 * H2);
  const X = mod(R * R - H3 - 2n * V);
  return { X, Y: mod(R * (V - X) - S1 * H3), Z: mod(H * p.Z * q.Z) };
}
function aAfin(p) {
  if (p === INF) return null;
  const zi = potencia(p.Z, P - 2n); const zi2 = mod(zi * zi);
  return { x: mod(p.X * zi2), y: mod(p.Y * zi2 * zi) };
}
/** a·A + b·B (afines; a, b escalares; cualquiera puede ser 0n). Doblado compartido (truco de Shamir). */
function combinar(a, A, b, B) {
  const sumaAB = sumarJ(aJac(A), aJac(B));
  let r = INF;
  for (let i = 255; i >= 0; i--) {
    r = doblar(r);
    const ba = (a >> BigInt(i)) & 1n; const bb = (b >> BigInt(i)) & 1n;
    if (ba && bb) r = sumarJ(r, sumaAB); else if (ba) r = sumarJ(r, aJac(A)); else if (bb) r = sumarJ(r, aJac(B));
  }
  return aAfin(r);
}
const porG = (k) => combinar(k, G, 0n, G);

// ── BIP-340 ──────────────────────────────────────────────────────────────────────────────────────

/** La clave x-only (64 hex) de una privada (64 hex). */
export function publicaDe(privada) {
  const d = aEntero(privada);
  if (d <= 0n || d >= N) throw new RangeError('la clave privada no es un escalar válido');
  return a32(porG(d).x);
}

/** Firma BIP-340 de un mensaje de 32 bytes (hex), con aux_rand dado (por defecto, ceros: determinista). */
export async function firmarSchnorr(mensajeHex, privada, auxHex = '00'.repeat(32)) {
  let d = aEntero(privada);
  if (d <= 0n || d >= N) throw new RangeError('la clave privada no es un escalar válido');
  const Q = porG(d);
  if (Q.y % 2n === 1n) d = N - d;
  const pk = a32(Q.x);
  const aux = aEntero(await hashEtiquetadoBytes('BIP0340/aux', aBytes(auxHex)));
  const t = a32(d ^ aux);
  const k0 = aEntero(await hashEtiquetadoBytes('BIP0340/nonce', aBytes(t + pk + mensajeHex))) % N;
  if (k0 === 0n) throw new RangeError('nonce nulo');
  const R = porG(k0);
  const k = R.y % 2n === 0n ? k0 : N - k0;
  const rx = a32(R.x);
  const e = aEntero(await hashEtiquetadoBytes('BIP0340/challenge', aBytes(rx + pk + mensajeHex))) % N;
  return rx + a32((k + e * d) % N);
}

/** Verifica una firma BIP-340 (128 hex) de un mensaje de 32 bytes (hex) con una clave x-only (64 hex). */
export async function verificarSchnorr(firma, mensajeHex, publica) {
  try {
    if (!HEX(128).test(firma) || !HEX(64).test(mensajeHex) || !HEX(64).test(publica)) return false;
    const Q = liftX(publica);
    const r = aEntero(firma.slice(0, 64));
    const s = aEntero(firma.slice(64));
    if (r >= P || s >= N) return false;
    const e = aEntero(await hashEtiquetadoBytes('BIP0340/challenge', aBytes(firma.slice(0, 64) + publica + mensajeHex))) % N;
    const R = combinar(s, G, (N - e) % N, Q);
    return R !== null && R.y % 2n === 0n && R.x === r;
  } catch { return false; }
}

// ── El evento NIP-98 ─────────────────────────────────────────────────────────────────────────────

/** El id NIP-01: SHA-256 de [0, pubkey, created_at, kind, tags, content] en JSON sin espacios. */
export function idDeEvento({ pubkey, created_at, kind, tags, content }) {
  return sha256Texto(JSON.stringify([0, pubkey, created_at, kind, tags, content]));
}

const bytesDe = (cuerpo) => (cuerpo === undefined || cuerpo === null ? new Uint8Array(0) : typeof cuerpo === 'string' ? new TextEncoder().encode(cuerpo) : cuerpo);

/** El hash del cuerpo exacto (bytes o texto UTF-8) para la etiqueta `payload`. */
export function hashDeCuerpo(cuerpo) {
  return sha256(bytesDe(cuerpo));
}

/** La cabecera `Authorization` de un evento ya firmado: `Nostr <base64>`. */
export function cabeceraDeEvento(evento) {
  return `Nostr ${Buffer.from(JSON.stringify(evento), 'utf8').toString('base64')}`;
}

/**
 * Firma un evento NIP-98 para una petición. `clave` = la privada x-only del titular (64 hex).
 * `cuerpo`: el cuerpo EXACTO que se enviará (texto o bytes); sin cuerpo (GET), no se pone `payload`.
 * `content`: un texto libre (poner un número de serie evita el `replay` de dos peticiones iguales en el mismo
 * segundo). `creadoEn`: segundos Unix (por defecto, ahora). Devuelve { evento, cabecera }.
 */
export async function firmarNip98(clave, { url, metodo, cuerpo, content = '', creadoEn } = {}) {
  const pubkey = publicaDe(clave);
  const bytes = bytesDe(cuerpo);
  const tags = [['u', url], ['method', metodo]];
  if (bytes.length) tags.push(['payload', await sha256(bytes)]);
  const e = { pubkey, created_at: creadoEn ?? Math.floor(Date.now() / 1000), kind: KIND, tags, content };
  const id = await idDeEvento(e);
  const evento = { id, ...e, sig: await firmarSchnorr(id, clave) };
  return { evento, cabecera: cabeceraDeEvento(evento) };
}

/** ¿Trae la cabecera el esquema `Nostr`? (Para las rutas en que la firma es opcional: si llega, se verifica.) */
export function esNostr(cabecera) {
  const m = typeof cabecera === 'string' ? cabecera.match(/^(\S+) /) : null;
  return m !== null && m[1].toLowerCase() === 'nostr';
}

// ── El verificador ───────────────────────────────────────────────────────────────────────────────

/** Por qué no vale la firma del titular: 401 `titular_signature_missing` / `titular_signature_invalid` / `replay`; 403 `not_titular`. */
export class FalloFirma extends Error {
  constructor(codigo, mensaje) {
    super(mensaje);
    this.codigo = codigo;
    this.estado = codigo === 'not_titular' ? 403 : 401;
  }
  cuerpo() { return { error: this.message, codigo: this.codigo }; }
}
const invalida = (m) => new FalloFirma('titular_signature_invalid', `la firma del titular no vale: ${m}`);
export const faltaFirma = () => new FalloFirma('titular_signature_missing', 'falta la firma del titular (Authorization: Nostr …, NIP-98)');
export const repetida = () => new FalloFirma('replay', 'esa firma del titular ya se usó: cada petición lleva un evento nuevo');
export const noEsElTitular = () => new FalloFirma('not_titular', 'la petición no la firma el titular de esa cartera');

export class Verificador {
  constructor() {
    /** id → created_at de los eventos ya aceptados (dentro de la ventana). */
    this.vistos = new Map();
  }

  get recordados() { return this.vistos.size; }

  /**
   * Verifica a la hora `ahora` (segundos Unix). `base` = el origen sin «/» al final con el que firma el cliente;
   * la `u` tiene que ser `base + ruta` (la ruta con su `?…`, tal como llega). Devuelve la pubkey que firma. Solo
   * un evento que pasa todas las comprobaciones se recuerda.
   */
  async verificar(cabecera, metodo, ruta, cuerpo, { base, ahora = Math.floor(Date.now() / 1000) } = {}) {
    const m = typeof cabecera === 'string' ? cabecera.trim().match(/^(\S+) (.*)$/s) : null;
    if (!m || m[1].toLowerCase() !== 'nostr') throw faltaFirma();
    const datos = m[2].trim();
    if (datos.length > TOPE_BASE64) throw invalida('el evento es demasiado largo');
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(datos) || datos.length % 4 !== 0) throw invalida('el evento no está en base64');
    let e;
    try { e = JSON.parse(Buffer.from(datos, 'base64').toString('utf8')); } catch { throw invalida('el evento no es JSON'); }
    if (e === null || typeof e !== 'object' || Array.isArray(e)) throw invalida('al evento le falta id, pubkey, sig o content');
    const { id, pubkey, sig, content, created_at, kind } = e;
    if ([id, pubkey, sig, content].some((x) => typeof x !== 'string')) throw invalida('al evento le falta id, pubkey, sig o content');
    if (!HEX(64).test(id) || !HEX(64).test(pubkey) || !HEX(128).test(sig)) throw invalida('id, pubkey o sig no son hex en minúsculas del largo debido');
    if (!Number.isInteger(created_at) || !Number.isInteger(kind) || kind < 0) throw invalida('created_at y kind son enteros');
    const tags = e.tags ?? null;
    if (!Array.isArray(tags)) throw invalida('tags es una lista');
    if (!tags.every((t) => Array.isArray(t) && t.length > 0 && t.every((x) => typeof x === 'string'))) throw invalida('cada etiqueta es una lista de textos');
    if ((await idDeEvento({ pubkey, created_at, kind, tags, content })) !== id) throw invalida('el id no es el SHA-256 de la serialización NIP-01');
    if (!(await verificarSchnorr(sig, id, pubkey))) throw invalida('la firma BIP-340 no verifica con pubkey');
    if (kind !== KIND) throw invalida(`el kind es ${kind} y NIP-98 es ${KIND}`);
    const etiqueta = (nombre) => {
      const v = tags.filter((t) => t[0] === nombre);
      if (v.length > 1) throw invalida(`la etiqueta «${nombre}» va repetida`);
      return v.length ? (v[0][1] ?? '') : undefined;
    };
    const esperada = `${String(base).replace(/\/+$/, '')}${ruta}`;
    const u = etiqueta('u');
    if (u === undefined) throw invalida('falta la etiqueta u');
    if (u !== esperada) throw invalida(`la etiqueta u es «${u}» y esta petición es «${esperada}»`);
    const metodoEtiqueta = etiqueta('method');
    if (metodoEtiqueta === undefined) throw invalida('falta la etiqueta method');
    if (metodoEtiqueta.toLowerCase() !== metodo.toLowerCase()) throw invalida(`la etiqueta method es «${metodoEtiqueta}» y esta petición es ${metodo}`);
    const bytes = bytesDe(cuerpo);
    const payload = etiqueta('payload');
    if (payload === undefined) {
      if (bytes.length) throw invalida('la petición lleva cuerpo y falta la etiqueta payload');
    } else if (payload !== (await hashDeCuerpo(bytes))) {
      throw invalida('la etiqueta payload no es el SHA-256 del cuerpo');
    }
    if (Math.abs(created_at - ahora) > VENTANA_S) throw invalida(`created_at está a ${created_at - ahora} s del reloj (como mucho ${VENTANA_S})`);
    // Anti-repetición: se olvida lo que ya no podría pasar la comprobación del reloj.
    for (const [k, t] of this.vistos) if (ahora - t > VENTANA_S) this.vistos.delete(k);
    if (this.vistos.has(id)) throw repetida();
    this.vistos.set(id, created_at);
    return pubkey;
  }
}
