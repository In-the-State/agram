// F1 paso 5 (VG, 14-11): la simulación firma con el GUARDIÁN REAL. Las claves y las firmas son las del guardián
// en Rust (`app/crates/stateark-guardian`, servicio en 127.0.0.1 con cookie); Bitcoin sigue simulado hasta F2.
//
// `CustodiaRemota` tiene la misma API que `Custodia` (custodia.js) en lo que el guardián cubre, y cada método
// llama a su ruta `POST /custodia/*`. Aquí NO hay ninguna privada: `esquema` solo verifica (la noble de AGRAM).
//
// Diferencias con la `Custodia` simulada, todas a propósito:
//   - `publica` y `listar` son asíncronas (son una llamada al guardián): úsalas con `await`, que vale con las dos.
//   - Los canales (`guardarCanal`, `contacto`, `enviar`, `comprobarEntrada`) NO están en el guardián: lanzan
//     `RechazoCustodia('not_in_guardian')`. Llegan en F4.
//   - Los rechazos 422 del guardián llegan como `RechazoCustodia` con su mismo `codigo`. Los de transporte:
//     `cookie_missing`, `unauthorized` (401), `guardian_unreachable`, `guardian_http` (otro estado).
//
// Solo Node (node:http): el guardián rechaza a los navegadores (toda petición con `Origin`). No se exporta desde
// index.js para no romper el módulo en el navegador: `import { CustodiaRemota } from 'stateark-sim/custodia-remota'`.

import { request } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { esId } from './hash.js';
import { RechazoCustodia, esquemaNoble, verificarVinculo, verificarPruebaVinculo, comprobarSegundoFactor } from './custodia.js';
import { decuplaDeRecibo } from './recibo.js';

const rechazo = (codigo, mensaje) => new RechazoCustodia(codigo, mensaje);
const ESPERA_MS = 10_000;

export class CustodiaRemota {
  #url;
  #cookie;
  #revocadas = new Map(); // clave de sesión → revocación firmada (las que se pidieron desde aquí)

  /**
   * @param {object} opciones
   * @param {string} opciones.url      el guardián, p. ej. `http://127.0.0.1:8350` (127.0.0.1: el guardián no escucha en ::1)
   * @param {string | (() => string)} opciones.cookie  la cookie, o cómo leerla (cada arranque del guardián trae una nueva)
   * @param {object} opciones.schnorr  el `schnorr` de la noble de AGRAM (solo para verificar)
   */
  constructor({ url, cookie, schnorr } = {}) {
    if (typeof url !== 'string' || !/^http:\/\//.test(url)) throw rechazo('guardian_url_invalid', 'falta la url del guardián (http://127.0.0.1:<puerto>)');
    if (typeof cookie === 'string' ? !cookie.trim() : typeof cookie !== 'function') throw rechazo('cookie_missing', 'falta la cookie del guardián (el contenido de <dir>/.cookie)');
    if (typeof schnorr?.verify !== 'function') throw rechazo('scheme_missing', 'hace falta el schnorr de la noble de AGRAM para verificar');
    this.#url = url.replace(/\/+$/, '');
    this.#cookie = cookie;
    const { verificar } = esquemaNoble(schnorr);
    this.esquema = Object.freeze({ nombre: 'bip340', verificar }); // solo verifica: aquí no hay privadas
  }

  get simulada() {
    return false;
  }

  get url() {
    return this.#url;
  }

  /** Una llamada al guardián: POST JSON con la cookie. 200 → el cuerpo; 422 → RechazoCustodia con su código. */
  #llamar(ruta, cuerpo) {
    let cookie;
    try {
      cookie = (typeof this.#cookie === 'function' ? this.#cookie() : this.#cookie)?.trim();
    } catch (e) {
      return Promise.reject(rechazo('cookie_missing', `no se pudo leer la cookie del guardián: ${e.message}`));
    }
    if (!cookie) return Promise.reject(rechazo('cookie_missing', 'la cookie del guardián está vacía'));
    const texto = JSON.stringify(cuerpo);
    return new Promise((resolver, rechazar) => {
      const req = request(`${this.#url}${ruta}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(texto), authorization: `Bearer ${cookie}` },
      }, (res) => {
        const trozos = [];
        res.on('data', (t) => trozos.push(t));
        res.on('error', (e) => rechazar(rechazo('guardian_unreachable', e.message)));
        res.on('end', () => {
          let json = null;
          try { json = JSON.parse(Buffer.concat(trozos).toString('utf8')); } catch { /* sin JSON */ }
          const estado = res.statusCode;
          if (estado === 200 && json !== null) return resolver(json);
          if (estado === 422) return rechazar(rechazo(json?.codigo ?? 'guardian_refused', json?.error ?? 'el guardián se negó'));
          if (estado === 401) return rechazar(rechazo('unauthorized', 'el guardián no reconoce la cookie (¿se reinició? cada arranque escribe una nueva en <dir>/.cookie)'));
          return rechazar(rechazo('guardian_http', `${ruta}: ${estado} ${json?.error ?? ''}`.trim()));
        });
      });
      req.setTimeout(ESPERA_MS, () => req.destroy(new Error(`sin respuesta en ${ESPERA_MS} ms`)));
      req.on('error', (e) => rechazar(rechazo('guardian_unreachable', `${this.#url}: ${e.message}`)));
      req.end(texto);
    });
  }

  // ── Claves ─────────────────────────────────────────────────────────────────────────────────────

  /** Crea una clave nueva en el guardián. Devuelve { dominio, nombre, publica }, como la simulada. */
  async crearClave(dominio, nombre) {
    const { publica } = await this.#llamar('/custodia/clave', { dominio, nombre });
    return { dominio, nombre, publica };
  }

  /** La pública de una clave. ASÍNCRONA (en la simulada es síncrona): úsala con `await`. */
  async publica(dominio, nombre) {
    return (await this.#llamar('/custodia/publica', { dominio, nombre })).publica;
  }

  /** Lo que hay en el guardián, sin privadas. ASÍNCRONA. */
  async listar() {
    return (await this.#llamar('/custodia/listar', {})).claves;
  }

  // ── Dominio 'agram' ────────────────────────────────────────────────────────────────────────────

  async firmarAgram(nombre, { canonico, id } = {}) {
    if (typeof canonico !== 'string' || !canonico) throw rechazo('canonical_missing', 'no hay cuerpo canónico que hashear');
    if (!esId(id)) throw rechazo('id_invalid', 'el id es un SHA-256 en 64 hex');
    return this.#llamar('/custodia/firmar-agram', { nombre, canonico, id });
  }

  async firmarEvento(nombre, evento, canonicoDe) {
    if (typeof canonicoDe !== 'function') throw rechazo('canonical_missing', 'hace falta la función de AGRAM que da el cuerpo canónico');
    const { firmante, firma } = await this.firmarAgram(nombre, { canonico: await canonicoDe(evento), id: evento.id });
    return Object.freeze({ ...evento, firmante, firma });
  }

  async verificarAgram(evento) {
    if (!esId(evento?.id) || !esId(evento?.firmante) || typeof evento?.firma !== 'string') return false;
    return Boolean(await this.esquema.verificar(evento.firma, evento.id, evento.firmante));
  }

  // ── Dominio 'cartera' ──────────────────────────────────────────────────────────────────────────

  async firmarAutorizacion(nombre, plan) {
    return this.#llamar('/custodia/firmar-autorizacion', { nombre, plan });
  }

  /** Segundo factor (SIP 0): lo comprueba el guardián (y aquí antes, para no gastar una llamada en lo que no vale). */
  async segundoFactor(nombre, titular, { canonico, id } = {}) {
    await comprobarSegundoFactor(titular, canonico, id);
    return this.#llamar('/custodia/segundo-factor', { nombre, titular, canonico, id });
  }

  verificadorDeFirma() {
    return async (firma, mensaje, titular) => Boolean(await this.esquema.verificar(firma, mensaje, titular));
  }

  // ── Vínculo ────────────────────────────────────────────────────────────────────────────────────

  async vincular(nombreAgram, nombreCartera, { instante } = {}) {
    return this.#llamar('/custodia/vincular', { agram: nombreAgram, cartera: nombreCartera, ...(instante ? { instante } : {}) });
  }

  verificarVinculo(vinculo) {
    return verificarVinculo(vinculo, this.esquema);
  }

  /** La prueba del vínculo nuevo (S45): `POST /custodia/probar-vinculo` → { clave, prueba }. La comprueba el guardián (`identity_missing`, `key_unknown`). */
  async probarVinculo(nombre, identidad) {
    return this.#llamar('/custodia/probar-vinculo', { nombre, identidad });
  }

  /** Comprueba { clave, prueba } para esa identidad, con el esquema BIP-340 de AGRAM. */
  verificarPruebaVinculo(p, identidad) {
    return verificarPruebaVinculo(p, identidad, this.esquema);
  }

  // ── Observador de cabeceras (H9) ───────────────────────────────────────────────────────────────

  async firmarCabecera(nombre, cabecera, altura) {
    if (!/^[0-9a-f]{160}$/.test(cabecera ?? '')) throw rechazo('header_invalid', 'una cabecera son 80 bytes en hex');
    if (!Number.isSafeInteger(altura) || altura < 0 || altura > 0xffffffff) throw rechazo('height_invalid', 'la altura es un entero de 4 bytes');
    return this.#llamar('/custodia/firmar-cabecera', { nombre, cabecera, altura });
  }

  // ── Recibos (B19) ──────────────────────────────────────────────────────────────────────────────

  /**
   * Como `Custodia.firmarRecibo`: recibe los CAMPOS del recibo. El guardián recibe la décupla, así que se arma
   * aquí con `decuplaDeRecibo` (que lanza `ErrorRecibo`, como en la simulada, si falta algo). Devuelve el mismo
   * sobre: { schema, emisor, t, recibo, id, firma }.
   */
  async firmarRecibo(nombre, campos, { t, dominio } = {}) {
    // Sin `t` ni `dominio` por defecto (S33): el guardián los exige y responde `time_invalid` / `domain_unknown`.
    // Quién puede firmar qué (`wrong_domain`, rotaciones) también lo decide él.
    const recibo = decuplaDeRecibo(campos);
    return this.#llamar('/custodia/firmar-recibo', { ...(dominio === undefined ? {} : { dominio }), nombre, ...(t === undefined ? {} : { t }), recibo });
  }

  // ── Sesiones para AARPIA ───────────────────────────────────────────────────────────────────────

  async emitirSesion(nombreLarga, { alcance, segundos, desde } = {}) {
    // El alcance y la duración los valida el guardián (S33: `scope_invalid`); aquí no se repite ni se corrige nada.
    return this.#llamar('/custodia/emitir-sesion', { nombre: nombreLarga, alcance, ...(segundos === undefined ? {} : { segundos }), ...(desde ? { desde } : {}) });
  }

  async revocarSesion(nombreLarga, sesion, { instante } = {}) {
    const r = await this.#llamar('/custodia/revocar-sesion', { nombre: nombreLarga, sesion, ...(instante ? { instante } : {}) });
    this.#revocadas.set(sesion, r);
    return r;
  }

  /** Las revocaciones pedidas desde esta instancia (el guardián no las guarda: las publica AARPIA en su relé). */
  revocaciones() {
    return [...this.#revocadas.values()];
  }

  // ── Canales: NO están en el guardián (llegan en F4) ────────────────────────────────────────────

  async guardarCanal() { throw noEnGuardian('guardarCanal'); }
  async contacto() { throw noEnGuardian('contacto'); }
  async enviar() { throw noEnGuardian('enviar'); }
  async comprobarEntrada() { throw noEnGuardian('comprobarEntrada'); }
}

const noEnGuardian = (m) => rechazo('not_in_guardian', `${m}: los canales aún no están en el guardián (llegan en F4); usa la Custodia simulada`);

/**
 * La custodia del guardián a partir del entorno del servidor de la sim, o null si no se pide:
 *   STATEARK_GUARDIAN_URL     http://127.0.0.1:<puerto> (sin ella, null: todo como siempre)
 *   STATEARK_GUARDIAN_COOKIE  la cookie, o
 *   STATEARK_GUARDIAN_DIR     la carpeta del guardián, de donde se lee `.cookie` en cada llamada
 *   AGRAM_SRC                 el src de AGRAM, de donde se carga `vendor/noble-secp256k1.js`
 */
export async function custodiaDesdeEntorno(entorno = process.env) {
  const url = entorno.STATEARK_GUARDIAN_URL;
  if (!url) return null;
  let cookie = entorno.STATEARK_GUARDIAN_COOKIE;
  if (!cookie) {
    const dir = entorno.STATEARK_GUARDIAN_DIR;
    if (!dir) throw rechazo('cookie_missing', 'con STATEARK_GUARDIAN_URL hace falta STATEARK_GUARDIAN_COOKIE o STATEARK_GUARDIAN_DIR');
    const ruta = join(dir, '.cookie');
    cookie = () => readFileSync(ruta, 'utf8');
  }
  const agram = entorno.AGRAM_SRC ?? 'C:/Users/acer/Documents/Ikisai/agram/src';
  const noble = join(agram, 'vendor', 'noble-secp256k1.js');
  if (!existsSync(noble)) throw rechazo('scheme_missing', `no está la noble de AGRAM en ${noble} (pon AGRAM_SRC)`);
  const { schnorr } = await import(pathToFileURL(noble).href);
  return new CustodiaRemota({ url, cookie, schnorr });
}
