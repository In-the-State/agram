// El emparejamiento por QR hace de guardián (A25, camino B sin anfitrión; docs/notas/EMPAREJAMIENTO.md «La pantalla»,
// docs/ANFITRION.md). Sin anfitrión y con un emparejamiento vivo, el guardián de la carta es este adaptador sobre una
// instancia de Emparejamiento (carta/emparejamiento.js): ofrece los mismos verbos que el guardián del anfitrión
// (cuentas, crearCuenta, firmar, sesion) y así no se abre un segundo camino de firma por la carta. La carta PROPONE y la
// app FIRMA con la clave de la cuenta, que es la `larga` de la delegación (estado().app): la carta nunca la ve.
//
// No ofrece `criterios`, `clavesDeLinea`, `pedirSesion` ni `firmarServicio`: la carta los trata como opcionales.
//
//   guardianEmparejado(emparejamiento, { reloj })   el adaptador (con `deEstaPagina`: los ids propuestos en esta página)
//   guardianDeLaCarta({ delAnfitrion, adaptador, emparejamiento })   el del anfitrión si lo hay; si no, el adaptador
//                                                    mientras haya emparejamiento vivo; si no, null
//   GUARDIAN_DE_RECHAZO, claveDeRechazo, claveDeQR   los códigos del emparejamiento dichos en llano (carta/textos.js)
//   asentarFirmadas(emparejamiento, eje, …)          tras recargar: lo firmado que aún no está en el libro se asienta
//   permisoDeCuenta, genesisDeCuenta                 el génesis del libro de cuenta al emparejar (Carril F)
//   leerConCamara, soltarCamara, puedeLeerConCamara  la lectura del QR con BarcodeDetector, aislada (se prueba con dobles)
//
// Sin DOM: lo prueba test/carta-emparejado.test.js en Node.

import { firmar as firmarRegistro } from '../src/autoridad.js';

/**
 * Cada código de fallo de una propuesta (los de un `rechazo` de la app y los de la carta) → el código del contrato del
 * guardián (docs/ANFITRION.md) que mejor dice lo ocurrido. El error lleva los dos: `code` (el del contrato, el que la
 * carta ya sabe tratar) y `emparejamiento` (el original, para decirlo en llano con claveDeRechazo).
 */
export const GUARDIAN_DE_RECHAZO = Object.freeze({
  // De la app.
  cancelled_by_holder: 'cancelled_by_holder',
  unknown_account: 'unknown_account',
  id_mismatch: 'id_mismatch',
  canonical_invalid: 'id_mismatch',
  author_mismatch: 'unknown_account',
  message_invalid: 'id_mismatch',
  // De la carta: el emparejamiento ya no está vivo.
  session_expired: 'session_closed',
  session_revoked: 'session_closed',
  pairing_refused: 'session_closed',
  pairing_forgotten: 'session_closed',
  pairing_replaced: 'session_closed',
  no_pairing: 'session_closed',
  // De la carta: la persona la descartó; o no se pudo mandar.
  proposal_discarded: 'cancelled_by_holder',
  message_too_large: 'id_mismatch',
});

/** Los códigos con frase propia (carta/textos.js «emparejarRechazo_<code>»). */
export const CODIGOS_DE_RECHAZO = Object.freeze(Object.keys(GUARDIAN_DE_RECHAZO));

/** Los códigos del QR (leerQR), con frase propia («emparejarQR_<code>»). */
export const CODIGOS_DEL_QR = Object.freeze(['qr_invalid', 'relay_invalid', 'delegation_invalid', 'session_mismatch', 'scope_invalid', 'session_expired']);

/** El código original del emparejamiento que lleva un error (el del adaptador, o el de su `cause` si el núcleo lo envolvió), o null. Nunca lanza. */
function codigoDelEmparejamiento(e) {
  try {
    const c = e?.emparejamiento ?? e?.cause?.emparejamiento;
    return typeof c === 'string' ? c : null;
  } catch {
    return null;
  }
}

/** La clave de carta/textos.js con que se dice un fallo del emparejamiento: la de su código, «emparejarRechazoOtro» si es otro; null si el error no viene del emparejamiento. */
export function claveDeRechazo(e) {
  const c = codigoDelEmparejamiento(e);
  if (c === null) return null;
  return CODIGOS_DE_RECHAZO.includes(c) ? 'emparejarRechazo_' + c : 'emparejarRechazoOtro';
}

/** La clave con que se dice un código de una propuesta guardada (su estado `rechazado`, `caducado`, `revocado`). */
export const claveDeCodigo = (code) => (CODIGOS_DE_RECHAZO.includes(code) ? 'emparejarRechazo_' + code : 'emparejarRechazoOtro');

/** La clave con que se dice un fallo al leer el QR (emparejar): la de su código, o «emparejarFallo». */
export const claveDeQR = (e) => (CODIGOS_DEL_QR.includes(e?.code) ? 'emparejarQR_' + e.code : 'emparejarFallo');

/** El error con que rechaza el adaptador: el código del contrato en `code` y el del emparejamiento en `emparejamiento`. */
function rechazo(original) {
  return Object.assign(new Error('emparejamiento: ' + original), { code: GUARDIAN_DE_RECHAZO[original] ?? 'cancelled_by_holder', emparejamiento: original });
}

/** La pública con que se pregunta por la sesión: el contrato dice sesion(publica); el encargo, sesion({ publica }). Las dos valen. */
const publicaDe = (x) => (typeof x === 'string' ? x : x !== null && typeof x === 'object' ? x.publica : undefined);

/**
 * El guardián hecho sobre un Emparejamiento. Sus verbos miran el emparejamiento en cada llamada (un solo objeto por
 * página): sin emparejamiento vivo, `cuentas()` no da ninguna y `firmar` rechaza con session_closed (no_pairing).
 *
 *   cuentas()                         [{ nombre, publica: larga }] o []
 *   crearCuenta({ nombre })           { publica: larga }: no crea clave; un libro nuevo emparejado se abre con la de la app
 *   firmar({ publica, canonico, id, segundoFactor, libro })   proponer y esperar la firma de la app → { id, firma }
 *   sesion(publica | { publica })     { abierta, caduca }: abierta si sigue en plazo, la app lo aceptó y publica es larga
 *
 * `deEstaPagina`: los ids propuestos desde esta página (su flujo los asienta; asentarFirmadas no los toca). `enEspera`:
 * los que esperan ahora la firma de la app (id → instante). `avisar` recibe { tipo: 'propuesta', id } al proponer y
 * { tipo: 'propuesta_resuelta', id } al resolverse (firmada o no): la pantalla enseña «Propuesto: confírmalo en la app».
 */
export function guardianEmparejado(emparejamiento, { reloj = () => Date.now(), avisar = () => {} } = {}) {
  const deEstaPagina = new Set();
  const enEspera = new Map();
  const aviso = (a) => { try { avisar(a); } catch { /* un oyente que falla no rompe la firma */ } };
  return Object.freeze({
    deEstaPagina,
    enEspera,
    async cuentas() {
      const e = emparejamiento.estado();
      return e ? [{ nombre: e.huella, publica: e.app }] : [];
    },
    async crearCuenta() {
      const e = emparejamiento.estado();
      if (!e) throw rechazo('no_pairing');
      return { publica: e.app };
    },
    async firmar({ publica, canonico, id, segundoFactor = false, libro } = {}) {
      const e = emparejamiento.estado();
      if (!e) throw rechazo('no_pairing');
      // La app solo firma con la clave de la cuenta, la `larga`: con otra pública ni se manda (volvería unknown_account).
      if (publica !== e.app) throw rechazo('unknown_account');
      if (typeof id === 'string') deEstaPagina.add(id);
      enEspera.set(id, reloj());
      aviso({ tipo: 'propuesta', id });
      try {
        return await emparejamiento.proponer({ publica, canonico, id, segundoFactor: segundoFactor === true, ...(typeof libro === 'string' ? { libro } : {}) });
      } catch (err) {
        throw rechazo(typeof err?.code === 'string' ? err.code : 'message_invalid');
      } finally {
        enEspera.delete(id);
        aviso({ tipo: 'propuesta_resuelta', id });
      }
    },
    async sesion(x) {
      const e = emparejamiento.estado();
      const hasta = e ? Date.parse(e.hasta) : NaN;
      const abierta = Boolean(e) && e.aceptada === true && publicaDe(x) === e.app && reloj() < hasta;
      return { abierta, caduca: abierta ? hasta : null };
    },
  });
}

/**
 * El guardián de la carta: el del anfitrión si lo hay (con anfitrión no se empareja); si no, el adaptador mientras el
 * emparejamiento siga vivo (estado() no es null); si no, null (camino A, o cuentas del guardián para leer). Nunca lanza.
 */
export function guardianDeLaCarta({ delAnfitrion = null, adaptador = null, emparejamiento = null } = {}) {
  if (delAnfitrion) return delAnfitrion;
  try {
    return adaptador && emparejamiento?.estado() ? adaptador : null;
  } catch {
    return null;
  }
}

/** Las propuestas de la sesión viva que siguen esperando a la app (las que caducarían al leer otro QR). */
export function esperando(emparejamiento) {
  const e = emparejamiento?.estado();
  if (!e) return [];
  return emparejamiento.propuestas().filter((p) => p.sesion === e.sesion && p.estado === 'propuesto');
}

/**
 * ¿Por qué una cuenta sin clave (guardian: true) se abre solo para leer con el emparejamiento? 'otraClave' si hay
 * emparejamiento vivo y la app guarda otra clave; null si no es por eso.
 */
export function porQueSoloLeer(publica, emparejamiento) {
  const e = emparejamiento?.estado();
  return e && e.app !== publica ? 'otraClave' : null;
}

/**
 * ¿Trae la sesión emparejada el permiso de un solo uso para el génesis de cuenta (agram-equipo/LIBRO_DE_CUENTA_ALOJADO.md
 * §6 y §9; StateArk §4.2), aceptada, para la época `epoca` y aún en plazo? `e` es emparejamiento.estado(). Nunca lanza.
 */
export function permisoDeCuenta(e, { epoca, reloj = () => Date.now() } = {}) {
  try {
    return Boolean(e?.aceptada && typeof epoca === 'string' && e.cuenta?.epoca === epoca && reloj() < Date.parse(e.cuenta.permiso.hasta));
  } catch {
    return false;
  }
}

/**
 * El génesis de cuenta por la app (Carril F; §6 y StateArk §4): lo que la carta pasa a cuentas.crearCuenta al crear la
 * cuenta con la app emparejada. La época de cuenta (`epoca`, su id) va por referencia: el génesis la nombra y es UN
 * registro. Con el permiso vivo (permisoDeCuenta), pide las claves a la app y el contexto del génesis lleva `eje` y
 * `next`, los que dio; lo demás de «claves» (lectura, escritura y contenido: secretos) se suelta aquí, sin guardarlo: este
 * carril no lo usa. Sin permiso (una app que no lo da, o caducado) no se pide nada y el génesis va sin ellos: la app
 * sacará su diálogo, la regla de siempre. Con permiso y SIN claves (no responde, rechaza o no cuadran: Core StateArk,
 * 18-11) no hay génesis de cuenta: lanza un error con `sinClavesDeCuenta` (su code) y la carta lo dice en llano.
 * → { epoca: { base, cambios: [] }, contexto? }, o null sin época de cuenta (el génesis nace como antes).
 */
export async function genesisDeCuenta(emparejamiento, { epoca, reloj = () => Date.now() } = {}) {
  if (typeof epoca !== 'string' || !/^[0-9a-f]{64}$/.test(epoca)) return null;
  const deCuenta = { epoca: { base: epoca, cambios: [] } };
  let e = null;
  try { e = emparejamiento?.estado() ?? null; } catch { e = null; }
  if (!permisoDeCuenta(e, { epoca, reloj })) return deCuenta;
  try {
    const { eje, next } = await emparejamiento.pedirClaves({ publica: e.app });
    return { ...deCuenta, contexto: { eje, next } };
  } catch (err) {
    const code = typeof err?.code === 'string' ? err.code : 'no_answer';
    throw Object.assign(new Error('la app no ha dado las claves de la cuenta: ' + code), { sinClavesDeCuenta: code });
  }
}

const asentando = new WeakMap(); // emparejamiento → ids que se están asentando ahora (no dos veces a la vez)

/**
 * Tras recargar la página (docs/notas/EMPAREJAMIENTO.md): una propuesta `firmado` cuyo registro aún no está en `eje` (y es
 * de ese libro: su `libro` es el génesis del eje) se asienta: el cuerpo idéntico, `{ ...JSON.parse(canonico), id }`,
 * vuelve a pasar por autoridad.firmar con un firmante que da la firma guardada (el núcleo la comprueba otra vez con
 * `publica`) y se añade con `anadir` (por defecto eje.anadir); después se descarta. Una que ya está en el eje solo se
 * descarta. Las de `deEstaPagina` las asienta su propio flujo: aquí solo se descartan cuando ya están en el eje.
 * → { asentados: [evento], descartados: [id], fallidos: [{ id, motivo }] }. Lo que falla se queda («firmado») y se dice.
 */
export async function asentarFirmadas(emparejamiento, eje, { deEstaPagina = new Set(), anadir = (ev) => eje.anadir(ev) } = {}) {
  const r = { asentados: [], descartados: [], fallidos: [] };
  if (!emparejamiento || !eje) return r;
  if (!asentando.has(emparejamiento)) asentando.set(emparejamiento, new Set());
  const enMarcha = asentando.get(emparejamiento);
  for (const p of emparejamiento.propuestas()) {
    if (p.estado !== 'firmado' || enMarcha.has(p.id)) continue;
    if (eje.obtener(p.id)) {
      await emparejamiento.descartar(p.id);
      r.descartados.push(p.id);
      continue;
    }
    if (deEstaPagina.has(p.id) || p.libro !== eje.genesisId) continue;
    enMarcha.add(p.id);
    try {
      const cuerpo = { ...JSON.parse(p.canonico), id: p.id };
      const firmado = await firmarRegistro(cuerpo, () => ({ id: p.id, firma: p.firma }), cuerpo.autor, { publica: p.publica });
      if (!eje.obtener(p.id)) r.asentados.push(await anadir(firmado));
      await emparejamiento.descartar(p.id);
    } catch (e) {
      r.fallidos.push({ id: p.id, motivo: String(e?.message ?? e) });
    } finally {
      enMarcha.delete(p.id);
    }
  }
  return r;
}

// ---------- la lectura con la cámara ----------

/** ¿Puede este navegador leer el QR con la cámara? (BarcodeDetector y getUserMedia). Si no, solo queda pegar el texto. Nunca lanza. */
export function puedeLeerConCamara(entorno = globalThis) {
  try {
    return typeof entorno?.BarcodeDetector === 'function' && typeof entorno?.navigator?.mediaDevices?.getUserMedia === 'function';
  } catch {
    return false;
  }
}

/** Suelta la cámara de un vídeo: para cada pista y quita la fuente. Nunca lanza. */
export function soltarCamara(video) {
  try {
    for (const pista of video?.srcObject?.getTracks?.() ?? []) {
      try { pista.stop(); } catch { /* ya parada */ }
    }
    if (video) video.srcObject = null;
  } catch { /* nada que soltar */ }
}

/**
 * Lee un QR de `video` con `detector` (un BarcodeDetector: detect(video) → [{ rawValue }]) hasta que sale uno o
 * `cancelado()` dice que basta, mirando cada `cada` ms (`esperar`). Devuelve su texto TAL CUAL (lo valida emparejar) o
 * null si se canceló. Suelta la cámara siempre al terminar: al leer, al cancelar y si algo falla.
 */
export async function leerConCamara({ detector, video, cancelado = () => false, esperar = (ms) => new Promise((ok) => setTimeout(ok, ms)), cada = 250 }) {
  try {
    while (!cancelado()) {
      let codigos = [];
      try { codigos = await detector.detect(video); } catch { codigos = []; }
      if (cancelado()) return null;
      const leido = (Array.isArray(codigos) ? codigos : []).find((c) => typeof c?.rawValue === 'string' && c.rawValue !== '');
      if (leido) return leido.rawValue;
      await esperar(cada);
    }
    return null;
  } finally {
    soltarCamara(video);
  }
}

/**
 * Abre la cámara trasera en `video` y crea el detector de QR. Si algo falla, suelta lo que hubiera abierto y lanza.
 * → el detector (para leerConCamara).
 */
export async function abrirCamara(video, entorno = globalThis) {
  try {
    video.srcObject = await entorno.navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    await video.play?.();
    return new entorno.BarcodeDetector({ formats: ['qr_code'] });
  } catch (e) {
    soltarCamara(video);
    throw e;
  }
}
