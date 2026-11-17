// El sello de tiempo (el tercer reloj, X.6.8.2): un adaptador con la interfaz del §3 del contrato AGRAM ↔ exterior,
//
//   sello.sellar(ids)               → { lote, pendiente: true, ids }
//   sello.prueba(id)                → { altura, hash, instante, lote, prueba } | { pendiente: true, lote } | null
//   sello.verificar(evento, prueba) → { ok, motivo, altura?, hash?, instante? }
//
// todo asíncrono. Lo que se sella son SOLO ids (SHA-256 del cuerpo canónico): el evento no sale de aquí. El bloque
// dice que el lote existía como muy tarde en su instante (una cota superior: no la hora del evento).
//
// Hay dos vías, con la misma forma, y este módulo no conoce ninguna simulación (TOK-74: fuera quedan AARPIA, Nostr y
// Bitcoin; ningún import de src/ las nombra):
//   · inyectada: `selloCon(sellador)` envuelve un objeto con sellar/prueba/verificar (y, si lo tiene, minar) que da
//     quien llama. La SIMULACIÓN de StateArk (servidor/sim/stateark/) entra así, desde servidor/sim/sello-agram.js
//     (`selloSimulado`, solo en Node), que es quien la importa; se sustituirá por StateArk real.
//   · HTTP: un servicio con POST /sellar, GET /prueba/:id (202 si pendiente, 404 si nunca se selló), POST /verificar
//     (la forma de servidor/sim/stateark/servidor.js, que sirve también de servicio de prueba). Es la del navegador: su
//     dirección es el ajuste «seal url» de «exterior settings» (ver `destino`); sin ella, en el navegador, nada se sella.
//
// El resultado se escribe en el eje con `eje.marcarSello(id, prueba)` (src/eje.js): una vista del libro, fuera del
// cuerpo firmado y del id (src/sincronia.js lo hace tras asentar eventos nuevos). Este módulo no toca ningún evento.
// Con el sello va la PRUEBA COPIADA (`decuplaDeSello`, la décupla del SIP 0): la comprueba la regla «sealed» de la
// época (X.6.8.5; encargo «verificado-regla», #67), sin salir del libro; `verificar` de aquí ya no decide nada.

import { AJUSTES, exterior } from './exterior.js';
import { sha256, hashEtiquetado, concatenar, deHex, aHex, verificarBip340, raizMerkle } from './cripto.js';
import { canonico } from './evento.js';

/** La clave de la configuración («exterior settings», docs/CONTRATO.md §16.2 bis) que dice dónde está el servicio de sello. */
export const CONFIGURACION = Object.freeze({ get url() { return AJUSTES.sello; } }); // perezosa: sello y exterior se importan en círculo

/** La dirección del servicio de sello de `yo` («seal url» de «exterior settings»; http o https, sin la barra final), o null si no la ha dicho o no es una url. */
export function destino(eje, yo, opciones = {}) {
  return exterior(eje, yo, opciones).sello;
}

/**
 * El sello por un sellador que se inyecta (la simulación, una prueba, otro servicio): un objeto con `sellar(ids)`,
 * `prueba(id)` y `verificar(evento, prueba)`, síncronos o asíncronos, y, si lo tiene, `minar()` (solo una simulación).
 * El adaptador lo da todo asíncrono; `via` es la del sellador o «inyectado».
 */
export function selloCon(sellador) {
  if (!sellador || ['sellar', 'prueba', 'verificar'].some((k) => typeof sellador[k] !== 'function')) throw new TypeError('sello: el sellador ha de tener sellar, prueba y verificar');
  return {
    via: typeof sellador.via === 'string' ? sellador.via : 'inyectado',
    sellar: async (ids) => sellador.sellar(ids),
    prueba: async (id) => sellador.prueba(id),
    verificar: async (evento, prueba) => sellador.verificar(evento, prueba),
    ...(typeof sellador.minar === 'function' ? { minar: async () => sellador.minar() } : {}),
  };
}

/** No hubo respuesta del servicio de sello, o contestó con un error (estado HTTP y su texto). */
export class ErrorDeSello extends Error {
  constructor(mensaje, estado) {
    super(mensaje);
    this.name = 'ErrorDeSello';
    this.estado = estado;
  }
}

/**
 * El sello por un servicio HTTP en `url` (la base: …/sellar, …/prueba/:id, …/verificar cuelgan de ella). Solo salen los
 * ids: a verificar se manda el id del evento, no el evento. Lanza ErrorDeSello si no hay red o el servicio contesta mal.
 */
export function selloHttp({ url, fetch = globalThis.fetch?.bind(globalThis) } = {}) {
  if (typeof url !== 'string' || !url) throw new TypeError('sello: hace falta la url del servicio');
  if (typeof fetch !== 'function') throw new Error('sello: no hay fetch');
  const base = url.replace(/\/+$/, '');
  const pedir = async (camino, cuerpo) => {
    let r;
    try {
      r = await fetch(base + camino, cuerpo === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });
    } catch (e) {
      throw new ErrorDeSello('sin red hacia el sello: ' + (e?.message ?? String(e)));
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
    if (!ok) throw new ErrorDeSello('sello ' + estado + ': ' + (datos?.error ?? 'sin detalle'), estado);
    return datos;
  };
  return {
    via: 'http',
    url: base,
    sellar: async (ids) => sinError(await pedir('/sellar', { ids })),
    prueba: async (id) => {
      const r = await pedir('/prueba/' + encodeURIComponent(id));
      if (r.estado === 404) return null;
      return sinError(r); // 200 la prueba; 202 { pendiente: true, lote }
    },
    verificar: async (evento, prueba) => sinError(await pedir('/verificar', { id: typeof evento === 'string' ? evento : evento?.id, prueba })),
  };
}

/**
 * El adaptador que toca: con `url`, el servicio HTTP; sin ella, el sellador inyectado (`sellador`, ver selloCon); sin
 * ninguno de los dos, null: nada se sella.
 */
export function crearSello({ url, fetch, sellador } = {}) {
  if (typeof url === 'string' && url.trim()) return selloHttp({ url: url.trim(), fetch });
  return sellador ? selloCon(sellador) : null;
}

/**
 * El adaptador de la configuración de `yo`: el servicio HTTP de su «seal url» («exterior settings») si lo ha dicho; si
 * no, el sellador inyectado (`opciones.sellador`); si no, null (la carta, en el navegador, no sella sin dirección).
 */
export function deConfiguracion(eje, yo, { fetch, sellador, ...opciones } = {}) {
  const url = destino(eje, yo, opciones);
  if (url) return selloHttp({ url, fetch });
  return sellador ? selloCon(sellador) : null;
}

/** Un texto hex en minúsculas de la longitud dada (en caracteres), o null. */
const hexO = (x, n) => (typeof x === 'string' && new RegExp('^[0-9a-f]{' + n + '}$').test(x) ? x : null);

/**
 * Los pasos de un camino de Merkle de Bitcoin (por nivel: «append» o «prepend» del hermano y dos «sha256», los que da la
 * simulación de StateArk) como dos listas hermanas, lados («d» si se añade detrás: el hermano va a la derecha; «i» si se
 * antepone) y hermanos. null si los pasos no son eso.
 */
function caminoBitcoin(pasos) {
  const lados = [];
  const hermanos = [];
  for (let k = 0; k < pasos.length; k += 3) {
    const [op, x] = pasos[k] ?? [];
    if (!(op === 'append' || op === 'prepend') || !hexO(x, 64) || pasos[k + 1]?.[0] !== 'sha256' || pasos[k + 2]?.[0] !== 'sha256') return null;
    lados.push(op === 'append' ? 'd' : 'i');
    hermanos.push(x);
  }
  return { lados, hermanos };
}

/**
 * La prueba de un sello (la de `prueba(id)`: { altura, hash, instante, lote, prueba: { camino, via, taproot: { tx, vout,
 * interna, hermanos }, pasos, cabecera, observador: { clave, firma, altura_le } } }) como la décupla BTML del sello de
 * tiempo del SIP 0 (0a445b2: sin huecos, sin relleno y sin tuplas, VG 12-11 y 13-11; el sello ancla por Taproot, VG 13-11),
 * la que va copiada en X.6.8.2 del registro sellado y lee la regla «sealed» (docs/CONTRATO.md §4.4):
 *   0 ["sello de tiempo", "SIP 0"], 1 altura, 2 hash (orden interno: el doble SHA-256 de la cabecera), 3 raíz del lote,
 *   4 el id (la hoja), 5 instante, 6 vía («taproot»),
 *   7 lo observado, SIEMPRE una décupla: [[cabecera (80 bytes hex)], [firma del observador], [altura en 4 bytes LE],
 *     [su clave] y, si los hay, los lados y los hermanos del camino «bitcoin» de la transacción de anclaje a la raíz de
 *     Merkle de la cabecera],
 *   8 el anclaje, SIEMPRE una décupla: [[transacción de anclaje (hex, serializada como Bitcoin)], [vout], [clave interna
 *     x-only] y, si los hay, los hermanos de la hoja de compromiso del lote en el árbol Taproot],
 *   9 el camino «sip» del id a la raíz del lote, si lo hay: [lados, hermanos].
 * Cada hoja suelta de 7 y 8 va entre corchetes (la forma canónica de BTML): una décupla de solo hojas sería una lista, sin
 * posiciones 7.0, 7.1… que leer. Lo opcional, al final; sin «-». Un sello sin cabecera, firma, altura LE o clave del
 * observador no lleva 7 (ni 8 ni 9, que no pueden ir sin el 7), y uno sin la transacción, el vout o la clave interna no
 * lleva 8 (ni 9): la regla dice PENDIENTE, nunca verdadero. Es la forma de `selloComoDecupla` de la simulación de
 * StateArk (0ddd6e7; test/verificado-regla.test.js lo comprueba), escrita aquí porque src/ no importa ninguna simulación
 * (TOK-74); dónde va cada cosa lo dice POSICIONES_DEL_SELLO. null si la prueba no tiene altura, hash, instante y lote.
 */
export function decuplaDeSello(prueba, id) {
  if (!prueba || prueba.pendiente || !Number.isSafeInteger(prueba.altura) || !/^[0-9a-f]{64}$/.test(prueba.hash ?? '') || typeof prueba.instante !== 'string' || !/^[0-9a-f]{64}$/.test(prueba.lote ?? '') || !/^[0-9a-f]{64}$/.test(id ?? '')) return null;
  const p = prueba.prueba && typeof prueba.prueba === 'object' ? prueba.prueba : {};
  // La vía «cascada» (SIP 0, «El sello en cascada», VG 16-11): el 3 es el compromiso (el hash de la cabecera de arriba, el
  // que va en la hoja OP_RETURN) y el 9 la cadena de eslabones; sin compromiso no hay décupla.
  const cascada = p.via === POSICIONES_DEL_SELLO.cascada;
  const tres = cascada ? hexO(prueba.compromiso, 64) : prueba.lote;
  if (!tres) return null;
  const camino = (Array.isArray(p.camino) ? p.camino : []).filter((x) => Array.isArray(x) && (x[0] === 'i' || x[0] === 'd') && hexO(x[1], 64));
  const o = p.observador && typeof p.observador === 'object' ? p.observador : {};
  const d = [['sello de tiempo', 'SIP 0'], prueba.altura, prueba.hash, tres, id, prueba.instante, typeof p.via === 'string' && p.via ? p.via : 'desconocida'];
  const observado = [hexO(p.cabecera, 160), hexO(o.firma, 128), hexO(o.altura_le, 8), hexO(o.clave, 64)];
  if (!observado.every(Boolean)) return d;
  const bitcoin = Array.isArray(p.pasos) && p.pasos.length ? caminoBitcoin(p.pasos) : null;
  d.push([...observado.map((x) => [x]), ...(bitcoin ? [bitcoin.lados, bitcoin.hermanos] : [])]);
  const t = p.taproot && typeof p.taproot === 'object' ? p.taproot : {};
  const tx = typeof t.tx === 'string' && t.tx.length >= 20 && /^(?:[0-9a-f]{2})+$/.test(t.tx) ? t.tx : null;
  if (!tx || !Number.isSafeInteger(t.vout) || t.vout < 0 || !hexO(t.interna, 64)) return d;
  const hermanosTaproot = (Array.isArray(t.hermanos) ? t.hermanos : []).filter((h) => hexO(h, 64));
  d.push([[tx], [t.vout], [t.interna], ...(hermanosTaproot.length ? [hermanosTaproot] : [])]);
  if (cascada) {
    // La cadena, de abajo arriba (de uno a diez eslabones, todos bien formados); si no, sin 9: la regla no la da por buena.
    const cadena = Array.isArray(p.cadena) ? p.cadena.map(decuplaDeEslabon) : [];
    if (cadena.length && cadena.length <= 10 && cadena.every(Boolean)) d.push(cadena);
  } else if (camino.length) d.push([camino.map(([l]) => l), camino.map(([, h]) => h)]);
  return d;
}

/** Un entero ≥ 0 en `n` bytes little-endian, en hex (lo que BQL no puede pasar de número a bytes). */
const leHex = (x, n) => Array.from({ length: n }, (_, k) => Number((BigInt(x) >> BigInt(8 * k)) & 0xffn).toString(16).padStart(2, '0')).join('');

/** La cabecera de lote v2 de la forma JSON (`{ numero, anterior, raiz, hora, clave, libro, referencias, firma }`) si está bien formada, o null. */
function cabeceraValida(c) {
  if (!c || typeof c !== 'object') return null;
  const { numero, anterior, raiz, hora, clave, libro, referencias, firma } = c;
  if (!Number.isSafeInteger(numero) || numero < 0 || !Number.isSafeInteger(hora) || hora < 0) return null;
  if (!hexO(anterior, 64) || !hexO(raiz, 64) || !hexO(clave, 64) || !hexO(libro, 64) || !hexO(referencias, 64) || !hexO(firma, 128)) return null;
  return { numero, anterior, raiz, hora, clave, libro, referencias, firma };
}

/**
 * Una cabecera de lote v2 del SIP 0 («El sello en cascada» §1, `cabeceraComoDecupla` de los vectores; la ficha de Core
 * StateArk del 16-11) como décupla BTML: 0 ["cabecera de lote", "SIP 0", "v2"], 1 número, 2 anterior, 3 raíz del lote,
 * 4 hora (segundos Unix), 5 la clave x-only del emisor, 6 su firma, 7 lo que BQL no pasa de número a bytes, siempre una
 * décupla: 7.0 [número en 8 bytes LE], 7.1 [hora en 8 bytes LE]; 8 el libro (el id del génesis del eje: un mismo nodo
 * firma varios libros) y 9 las referencias (la raíz de los últimos recibos de cada padre y del último sello propio; 32
 * bytes a cero si no hay). null si la cabecera no está bien formada. La v1 (sin 8 ni 9) ya no vale en la vía «cascada».
 */
export function decuplaDeCabecera(c) {
  const v = cabeceraValida(c);
  if (!v) return null;
  const q = POSICIONES_DEL_SELLO.cabeceraDeLote;
  return [[q.marca, 'SIP 0', q.version], v.numero, v.anterior, v.raiz, v.hora, v.clave, v.firma, [[leHex(v.numero, 8)], [leHex(v.hora, 8)]], v.libro, v.referencias];
}

/** El grado o la red de un eslabón (VG 16-11): opacos, un número o un texto corto; null si no lo trae o no lo es. Nada los compara. */
const gradoDe = (g) => ((typeof g === 'number' && Number.isFinite(g)) || (typeof g === 'string' && g.length > 0 && g.length <= 32) ? g : null);

/**
 * Un eslabón de la cadena como décupla: 0 la cabecera, 1 [nivel], [nivel, grado] o [nivel, grado, red] (el nivel, un
 * número de epoch.7.6.1; el grado y la red, opcionales y opacos; sin grado no hay red; VG 16-11) y, solo si los hay, 2 los
 * lados y 3 los hermanos de su camino «sip». El grado va junto al nivel para que quepa también en un eslabón sin camino
 * «sip» (un lote de un solo id), que no tiene 2 ni 3.
 */
function decuplaDeEslabon(e) {
  const cabecera = decuplaDeCabecera(e?.cabecera);
  if (!cabecera || !Number.isSafeInteger(e.nivel) || e.nivel < 1) return null;
  const camino = Array.isArray(e.camino) ? e.camino : [];
  if (!camino.every((x) => Array.isArray(x) && (x[0] === 'i' || x[0] === 'd') && hexO(x[1], 64))) return null;
  const grado = gradoDe(e.grado);
  const red = grado !== null ? gradoDe(e.red) : null;
  return [cabecera, [e.nivel, ...(grado !== null ? [grado] : []), ...(red !== null ? [red] : [])], ...(camino.length ? [camino.map(([l]) => l), camino.map(([, h]) => h)] : [])];
}

/**
 * Una cabecera de lote v2 (su décupla, la de decuplaDeCabecera) leída: { numero, anterior, raiz, hora, clave, libro,
 * referencias, firma, hash } con el hash = hashEtiquetado("StateArk/Lote/Cabecera/v2", número u64 LE ‖ anterior ‖ raíz ‖
 * hora u64 LE ‖ clave ‖ libro ‖ referencias), 176 bytes, o null si no es una cabecera de lote v2 bien formada (sin «v2»
 * en su 0, sin libro o sin referencias, o su 7 no dice su número y su hora).
 */
export function leerCabeceraDeLote(d) {
  const q = POSICIONES_DEL_SELLO.cabeceraDeLote;
  const marcas = Array.isArray(d) ? (Array.isArray(d[0]) ? d[0] : [d[0]]) : [];
  if (!marcas.includes(q.marca) || !marcas.includes(q.version)) return null;
  const c = cabeceraValida({ numero: d[1], anterior: d[2], raiz: d[3], hora: d[4], clave: d[5], firma: d[6], libro: d[8], referencias: d[9] });
  if (!c || d[7]?.[0]?.[0] !== leHex(c.numero, 8) || d[7]?.[1]?.[0] !== leHex(c.hora, 8)) return null;
  const bytes = concatenar(deHex(leHex(c.numero, 8)), deHex(c.anterior), deHex(c.raiz), deHex(leHex(c.hora, 8)), deHex(c.clave), deHex(c.libro), deHex(c.referencias));
  return { ...c, hash: aHex(hashEtiquetado(ETIQUETA_DE_CABECERA, bytes)) };
}

/** La clase de equivocación de una bifurcación de línea (SIP 0, «El sello en cascada» §3). */
export const CLASE_DE_BIFURCACION = 'dos cabeceras con el mismo número';
/** El esquema de la equivocación portable de StateArk (B9). */
export const ESQUEMA_DE_EQUIVOCACION = 'stateark.equivocacion@1';

/**
 * Una bifurcación de línea, comprobada SIN LIBRO (SIP 0, «El sello en cascada» §3; petición 4 a Core AGRAM): la
 * equivocación portable `{ schema: "stateark.equivocacion@1", clase, acusado, a, b, id }` con `a` y `b` dos décuplas de
 * cabecera de lote (o solo `{ a, b }`). Una línea es (libro, clave): lo es si las dos firmas valen, con el mismo libro, la
 * misma clave, el mismo número y distinto hash (con otro libro no lo es: un mismo nodo firma varios libros);
 * la clase y el acusado se derivan (no se creen), y el id es SHA-256(canonico({ schema, clase, ids: [hash menor, hash mayor] })):
 * si la prueba trae otro, no vale. → { clase, acusado, numero, hashes: [menor, mayor], id } o null.
 */
export function bifurcacion(prueba) {
  const a = leerCabeceraDeLote(prueba?.a);
  const b = leerCabeceraDeLote(prueba?.b);
  if (!a || !b || a.libro !== b.libro || a.clave !== b.clave || a.numero !== b.numero || a.hash === b.hash) return null;
  for (const c of [a, b]) if (!verificarBip340(deHex(c.firma), deHex(c.hash), deHex(c.clave))) return null;
  if (prueba.schema !== undefined && prueba.schema !== ESQUEMA_DE_EQUIVOCACION) return null;
  if (prueba.clase !== undefined && prueba.clase !== CLASE_DE_BIFURCACION) return null;
  if (prueba.acusado !== undefined && prueba.acusado !== a.clave) return null;
  const hashes = [a.hash, b.hash].sort();
  const id = aHex(sha256(new TextEncoder().encode(canonico({ schema: ESQUEMA_DE_EQUIVOCACION, clase: CLASE_DE_BIFURCACION, ids: hashes }))));
  if (prueba.id !== undefined && prueba.id !== id) return null;
  return { clase: CLASE_DE_BIFURCACION, acusado: a.clave, libro: a.libro, numero: a.numero, hashes, id };
}

/**
 * EL MAPA DE POSICIONES DEL SELLO (encargos «verificado-regla» y «taproot»): dónde va cada parte de la prueba copiada en
 * la décupla del sello de tiempo del SIP 0 (0a445b2, la forma de `selloComoDecupla` de la simulación de StateArk 0ddd6e7).
 * Es el ÚNICO sitio que hay que tocar cuando StateArk cambie la forma: se cambia aquí, se cambia `decuplaDeSello` para que
 * construya esa forma y se reescribe la fórmula de la regla «sealed» con `formulaDeSellado()` (y `npm run epocas`):
 *   node -e "import('./src/sello.js').then(m => console.log(m.formulaDeSellado()))"
 * (test/verificado-regla.test.js comprueba que datos/epocas/reglas/sealed.json lleva exactamente esa fórmula y que
 * `decuplaDeSello` pone cada parte donde dice el mapa). `marca` es lo que el 0 del sello lleva para reconocerlo; `taproot`,
 * la vía que la fórmula exige en el 6; `compromiso`, el principio del script de la hoja de compromiso (OP_RETURN y el
 * empuje de 32 bytes: la plantilla de Script «compromiso» del SIP 0); `p2tr`, el de una salida P2TR (OP_1 y 32 bytes).
 */
export const POSICIONES_DEL_SELLO = Object.freeze({
  marca: 'sello de tiempo', taproot: 'taproot', compromiso: '6a20', p2tr: '5120',
  clase: '0', altura: '1', hash: '2', lote: '3', id: '4', instante: '5', via: '6',
  cabecera: '7.0', firma: '7.1', alturaLe: '7.2', clave: '7.3', ladosBitcoin: '7.4', hermanosBitcoin: '7.5',
  tx: '8.0', vout: '8.1', interna: '8.2', hermanosTaproot: '8.3',
  lados: '9.0', hermanos: '9.1',
  // La vía «cascada» (SIP 0, «El sello en cascada» §2, VG 16-11): el 3 es el compromiso (el hash de la cabecera de arriba)
  // y el 9 la cadena, de abajo arriba: 9.k el eslabón k, con 9.k.0 su cabecera de lote, 9.k.1 [nivel], [nivel, grado] o
  // [nivel, grado, red] (el nivel, un número de epoch.7.6.1; grado y red, opcionales y opacos: «sealed» no lee el 9.k.1 y
  // «firm» solo su primer ocupante; VG 16-11) y, si los hay, 9.k.2 los lados y 9.k.3 los hermanos de su camino «sip». Lo
  // demás (1, 2, 4, 5, 7 y 8), como en la vía «taproot».
  cascada: 'cascada', compromisoCascada: '3', cadena: '9',
  eslabon: Object.freeze({ cabecera: '0', nivel: '1', lados: '2', hermanos: '3' }),
  // Dentro del 9.k.1, el orden de sus ocupantes (VG 17-11, encargo «firm lee grados»): el nivel, el grado (un número, su
  // posición en epoch.7.6.4) y la red (un número, su posición en epoch.7.6.6). «firm» lee el nivel y el grado.
  enElNivel: Object.freeze({ nivel: 0, grado: 1, red: 2 }),
  // Las posiciones de una cabecera de lote v2 (SIP 0, «El sello en cascada» §1), dentro de su eslabón (9.k.0): `version`
  // es lo que su 0 lleva además de la marca; el 8 el libro y el 9 las referencias (van dentro de lo firmado).
  cabeceraDeLote: Object.freeze({ marca: 'cabecera de lote', version: 'v2', clase: '0', numero: '1', anterior: '2', raiz: '3', hora: '4', clave: '5', firma: '6', numeroLe: '7.0', horaLe: '7.1', libro: '8', referencias: '9' }),
});

/** La etiqueta del hash que firma el observador de cabeceras (SIP 0, H9): cabecera ‖ altura LE. */
export const ETIQUETA_DEL_OBSERVADOR = 'StateArk/Observador/Cabecera/v1';

/** La etiqueta del hash de una cabecera de lote (SIP 0, «El sello en cascada» §1): lo que se encadena, se firma y se compromete. */
export const ETIQUETA_DE_CABECERA = 'StateArk/Lote/Cabecera/v2';

/** Hasta cuántos eslabones despliega la fórmula de la vía «cascada» (BQL no tiene bucles: las cuatro capas de hoy). */
export const ESLABONES_DE_LA_FORMULA = 4;

/**
 * La fórmula del 2 de la regla «sealed» (X.6.8.5) escrita con el mapa de posiciones: las DOS VÍAS unidas (VG 16-11, SIP 0
 * «El sello en cascada», peticiones 1 y 2 a Core AGRAM), por su 6: `(cascada) or not ("cascada" in S.6) and (taproot)`.
 * La de cascada la escribe formulaCascada (abajo); la de «taproot», la de antes, intacta (formulaTaproot), solo se lee si
 * la vía no es «cascada» (si no, su camino «sip» leería la cadena y daría ERROR). La vía «taproot»: it = el registro; S el
 * sello copiado en lo que el núcleo lee de su 6.8.2, T la transacción de anclaje y C la cabecera. La cadena entera, sin salir del libro:
 *   la hoja del sello es el propio registro (S.4 = it.5);
 *   la hoja de compromiso OP_RETURN <raíz del lote> (tapleaf), con la clave interna (S.8.2) y sus hermanos en el árbol
 *   Taproot (S.8.3; ninguno si el lote es el único del anclaje), da por TapTweak (taptweak) la clave de salida que paga la
 *   salida S.8.1 de la transacción S.8.0 (su script es 5120 ‖ clave);
 *   el txid de esa transacción, con el camino «bitcoin» (S.7.4, S.7.5; ninguno si es la única del bloque), da la raíz de
 *   Merkle de la cabecera S.7.0, que da el hash del sello y cumple su prueba de trabajo;
 *   la altura firmada (S.7.2) es la del sello, el observador firmó cabecera ‖ altura y su clave está en before.8.6 (las
 *   «observer keys» de la cuenta raíz);
 *   el id del registro con el camino «sip» (S.9.0, S.9.1; ninguno en un lote de un solo id) da la raíz del lote;
 *   y la vía es «taproot».
 * El orden importa: lo que lee la transacción, la interna y la cabecera va antes que lo que podría dar falso sin ellas
 * (el camino «sip», la vía), para que un sello al que le falta algo (la cabecera, la transacción, la interna, la firma o
 * la clave: bytes de nada) quede PENDIENTE y nunca falso ni verdadero.
 */
export function formulaDeSellado(p = POSICIONES_DEL_SELLO) {
  return '=' + formulaCascada(p) + ' or not ("' + p.cascada + '" in (first ((first it.6).8.2 where "' + p.marca + '" in it2.' + p.clase + ')).' + p.via + ') and ' + formulaTaproot(p);
}

/**
 * La vía «cascada» (SIP 0, «El sello en cascada» §2, `formula_sealed` de vectores/cascada/prueba-de-un-registro.json,
 * VG 16-11), escrita con el mapa: primero la vía (el 6 siempre está: así una vía «taproot» no lee nada de la cadena y
 * nunca llega a ERROR por leerla), luego que la hoja es el propio registro (el SIP lo pide en su paso 1), lo de Bitcoin
 * igual que en la vía «taproot» con el compromiso (3) en la hoja OP_RETURN (lo que lee la transacción, la interna y la
 * cabecera va antes: lo que falta deja PENDIENTE), y la cadena desplegada para 1 a ESLABONES_DE_LA_FORMULA eslabones,
 * unidos con «or»: cada rama ata su largo con la posición siguiente vacía (`count S.9.n = 0`), comprueba cada cabecera
 * (bien formada y v2, su camino «sip» desde el id o desde el hash de la de abajo llega a su raíz, y su firma con su propia
 * clave) y que el hash de la de arriba es el compromiso y su clave está declarada (before.8.6, la del observador). Las
 * claves de las capas de abajo no se miran. Y la primera cabecera nombra este libro (`first S.9.0.0.8 = first before.5`,
 * el id del génesis; enmienda de Core AGRAM con Core StateArk, 17-11, encargo «las claves de línea, por nivel»; detrás de la
 * hoja, en el mismo sitio que `formula_sealed` de los vectores de StateArk: una cadena de otro libro da falso, no PENDIENTE,
 * aunque le falte algo). Sin primitivas nuevas.
 */
function formulaCascada(p, d = delRegistro(p)) {
  const { S, en, E, c, H, eslabon } = piezasDeCascada(p, d);
  const con = (n) => '(count ' + E(n - 1) + ' > 0' + (n < 10 ? ' and count ' + E(n) + ' = 0' : '')
    + Array.from({ length: n }, (_, k) => ' and ' + eslabon(k)).join('')
    + ' and ' + H(n - 1) + ' = bytes(first ' + en('compromisoCascada') + ') and first ' + c(n - 1, 'clave') + ' in before.8.6)';
  const T = '(first tx(bytes(first ' + en('tx') + ')))';
  const C = '(first cabecera(bytes(first ' + en('cabecera') + ')))';
  return '("' + p.cascada + '" in ' + en('via')
    + ' and bytes(first ' + en('id') + ') = bytes(first ' + d.hoja + ')'
    + ' and ' + delLibro(c)
    + ' and cat(bytes("' + p.p2tr + '"), taptweak(bytes(first ' + en('interna') + '), tapleaf(cat(bytes("' + p.compromiso + '"), bytes(first ' + en('compromisoCascada') + '))), ' + en('hermanosTaproot') + ')) = first (nth (first ' + en('vout') + ') ' + T + '.2).1'
    + ' and merkle(first ' + T + '.5, ' + en('ladosBitcoin') + ', ' + en('hermanosBitcoin') + ', "bitcoin") = first ' + C + '.3'
    + ' and hex(first ' + C + '.7) = first ' + en('hash')
    + ' and below(reverse(first ' + C + '.7), first ' + C + '.8)'
    + ' and le(bytes(first ' + en('alturaLe') + ')) = first ' + en('altura')
    + ' and signed(bytes(first ' + en('firma') + '), hash(cat(bytes(first ' + en('cabecera') + '), bytes(first ' + en('alturaLe') + ')), "' + ETIQUETA_DEL_OBSERVADOR + '"), bytes(first ' + en('clave') + '))'
    + ' and first ' + en('clave') + ' in before.8.6'
    + ' and (' + Array.from({ length: ESLABONES_DE_LA_FORMULA }, (_, k) => con(k + 1)).join(' or ') + '))';
}

/**
 * Las piezas de la vía «cascada» que comparten «sealed» (formulaCascada) y «firm» (formulaDeFirmeza), escritas con el mapa:
 * S el sello copiado en el 6.8.2 del registro, en(k) una posición suya, E(k) el eslabón k de su cadena, c(k, campo) un campo
 * de la cabecera de ese eslabón, H(k) el hash de esa cabecera (los 176 bytes firmados) y eslabon(k), que esa cabecera está
 * bien formada y es la v2, que su camino «sip» desde el id (k = 0) o desde el hash de la de abajo llega a su raíz y que su
 * firma vale con su propia clave. Sin el «=». `d` dice de dónde sale el sello y cuál es su hoja (delRegistro: el 6.8.2 del
 * registro e it.5; el gobierno, encargo A21, lo aplica a un sello que trae un registro en su payload: datos/epocas/gobierno.mjs).
 */
function piezasDeCascada(p, d = delRegistro(p)) {
  const S = d.S;
  const en = (k) => S + '.' + p[k];
  const E = (k) => S + '.' + p.cadena + '.' + k;
  const c = (k, campo) => E(k) + '.' + p.eslabon.cabecera + '.' + p.cabeceraDeLote[campo];
  const H = (k) => 'hash(cat(' + ['numeroLe', 'anterior', 'raiz', 'horaLe', 'clave', 'libro', 'referencias'].map((x) => 'bytes(first ' + c(k, x) + ')').join(', ') + '), "' + ETIQUETA_DE_CABECERA + '")';
  const eslabon = (k) => '"' + p.cabeceraDeLote.marca + '" in ' + c(k, 'clase') + ' and "' + p.cabeceraDeLote.version + '" in ' + c(k, 'clase')
    + ' and le(bytes(first ' + c(k, 'numeroLe') + ')) = first ' + c(k, 'numero')
    + ' and le(bytes(first ' + c(k, 'horaLe') + ')) = first ' + c(k, 'hora')
    + ' and merkle(' + (k === 0 ? 'bytes(first ' + en('id') + ')' : H(k - 1)) + ', ' + E(k) + '.' + p.eslabon.lados + ', ' + E(k) + '.' + p.eslabon.hermanos + ', "sip") = bytes(first ' + c(k, 'raiz') + ')'
    + ' and signed(bytes(first ' + c(k, 'firma') + '), ' + H(k) + ', bytes(first ' + c(k, 'clave') + '))';
  return { S, en, E, c, H, eslabon };
}

/**
 * Cuántos eslabones de la cadena de un sello en cascada (su décupla, la de decuplaDeSello) valen seguidos desde abajo, con
 * los pasos de eslabon(k) de piezasDeCascada, los que mira «firm»: el sello es de vía «cascada», su hoja es `id`, y cada
 * eslabón, hasta ESLABONES_DE_LA_FORMULA, es una cabecera de lote v2 bien formada cuyo camino «sip» desde el id (el
 * primero) o desde el hash de la de abajo llega a su raíz y cuya firma vale con su propia clave. Con `libro` (el id de este
 * libro, el de su génesis), además, la primera cabecera nombra ese libro (su 8; VG 17-11, encargo «las claves de línea, por
 * nivel»: «firm» lo exige); si no, 0. Con `lineas` (las «line keys», pares [nivel, clave]), además, cada eslabón va firmado
 * por una clave anotada para el nivel que dice (el primer ocupante de su 9.k.1, un entero) y el nivel del primero es el más
 * bajo de los anotados (Core AGRAM 17-11, con Core StateArk, «5 bis»: toda la cadena, desde la casa, con claves de su
 * nivel); la cuenta se para en el primero que no. 0 si no hay ninguno.
 * La lectura de JS de lo mismo que la fórmula (contrato.firmeza la usa para decir lo mismo que la regla).
 */
export function eslabonesValidos(decupla, id, { libro, lineas } = {}) {
  const q = POSICIONES_DEL_SELLO;
  if (!Array.isArray(decupla) || ![].concat(decupla[Number(q.via)]).includes(q.cascada) || decupla[Number(q.id)] !== id || !hexO(id, 64)) return 0;
  const cadena = Array.isArray(decupla[Number(q.cadena)]) ? decupla[Number(q.cadena)] : [];
  if (libro !== undefined && !(Array.isArray(cadena[0]) && leerCabeceraDeLote(cadena[0][Number(q.eslabon.cabecera)])?.libro === libro)) return 0;
  let anterior = deHex(id);
  let n = 0;
  for (; n < Math.min(cadena.length, ESLABONES_DE_LA_FORMULA); n++) {
    const e = cadena[n];
    const c = Array.isArray(e) ? leerCabeceraDeLote(e[Number(q.eslabon.cabecera)]) : null;
    if (!c) break;
    const lados = [].concat(e[Number(q.eslabon.lados)] ?? []);
    const hermanos = [].concat(e[Number(q.eslabon.hermanos)] ?? []);
    if (lados.length !== hermanos.length || !lados.every((l) => l === 'i' || l === 'd') || !hermanos.every((h) => hexO(h, 64))) break;
    const raiz = aHex(raizMerkle(anterior, lados.map((l, k) => [l, deHex(hermanos[k])]), 'sip'));
    if (raiz !== c.raiz || !verificarBip340(deHex(c.firma), deHex(c.hash), deHex(c.clave))) break;
    if (lineas !== undefined && !deSuNivel(lineas, e, c.clave, n === 0)) break;
    anterior = deHex(c.hash);
  }
  return n;
}

/**
 * ¿Va el eslabón `e` (de clave `clave`) firmado por una clave anotada en `lineas` (pares [nivel, clave]) para el nivel que
 * dice su 9.k.1 (su primer ocupante, un entero)? Y, si es el primero, ¿es ese nivel el más bajo de los anotados? Lo mismo
 * que linea(k) y casa de piezasDeNivel.
 */
function deSuNivel(lineas, e, clave, primero) {
  const nivel = [].concat(e[Number(POSICIONES_DEL_SELLO.eslabon.nivel)])[0];
  const pares = Array.isArray(lineas) ? lineas.filter((x) => Array.isArray(x) && Number.isSafeInteger(x[0])) : [];
  if (!Number.isSafeInteger(nivel) || !pares.some(([n, k]) => n === nivel && k === clave)) return false;
  return !primero || nivel === Math.min(...pares.map(([n]) => n));
}

/** Las familias de token del núcleo (los símbolos del BQL mínimo): las que nombra el 3 de epoch.7.6. */
const FAMILIAS = Object.freeze(['T', 'R', 'P', 'E']);

/** Cuántas capas despliega la fórmula de «firm» (las de epoch.7.6 de la época 0; una prueba lo vigila). */
export const CAPAS_DE_LA_FORMULA = 4;

/** Cuántos grados despliega la fórmula de «firm» (los de epoch.7.6.4 de la época 0; una prueba lo vigila). */
export const GRADOS_DE_LA_FORMULA = 3;

/**
 * La fórmula del 2 de la regla «firm» (X.6.8.9; VG 16-11, encargo «firmeza»; VG 17-11, encargo «firm lee grados»: «el
 * nivel es el ritmo; el grado dice quién responde»): ¿ha llegado el registro al nivel que exige? Lee la época por posición
 * (nth k): epoch.7.6.1 los niveles (números, de abajo arriba), .3 la familia que queda en firme en cada uno, .4 los grados
 * (de menor a mayor), .5 el grado exigido en cada nivel; desplegada para CAPAS_DE_LA_FORMULA niveles, ESLABONES_DE_LA_FORMULA
 * eslabones y GRADOS_DE_LA_FORMULA grados (BQL no tiene bucles). Un nivel k está alcanzado:
 *   por la cadena: el sello es de vía «cascada», su hoja es el propio registro y hay un eslabón j tal que los eslabones de
 *     0 a j valen (eslabon(k) de piezasDeCascada, el de «sealed»), el j dice ese nivel (el primer ocupante de su 9.j.1),
 *     su grado (el segundo, un NÚMERO: la posición en 7.6.4) llega al exigido (lo exigido es 0, o el grado es una posición
 *     de 7.6.4 igual o mayor: con «in», que no da ERROR con un texto ni con un hueco: «no alcanzado»), y TODOS los
 *     eslabones de 0 a j van firmados por una clave anotada en before.8.9 PARA EL NIVEL QUE CADA UNO DICE (las «line keys»
 *     de la cuenta raíz, pares [nivel, clave]: linea(k) de piezasDeNivel), con el nivel del 0 el más bajo de los anotados
 *     (la casa: casa de piezasDeNivel) y la primera cabecera de este libro (su 8 es before.5, el id del génesis). VG 17-11,
 *     encargo «las claves de línea, por nivel», y su enmienda con Core StateArk («5 bis»): el nivel y el grado que dice un
 *     eslabón no van firmados, solo los ata la clave, así que toda la cadena, desde la casa, ha de ir con claves de su
 *     nivel; las «observer keys», before.8.6, ya no cuentan para la cadena;
 *   el primero, además, con su recibo de llegada («received», X.6.8.4), si lo exigido en él es 0;
 *   el último, además, con «sealed» (X.6.8.5), sea cual sea el grado exigido: por la vía «taproot», tal cual; por la vía
 *     «cascada», con los pares de toda la cadena como arriba (pares(), con cada eslabón presente; sin ellos, una cadena que
 *     cuadra en hashes y firmas pero no en claves, la «forjada» de los vectores de StateArk, daría el último nivel).
 * Exige el nivel de la familia más alta que mueve con sus propias sentencias (it.1, lo declarado y no anunciado): lo que
 * cambia de manos, se acuña, se quema por decisión o se bloquea. NO cuenta lo automático de escribir: la quema de T real
 * de su autor (el coste de escribir, el mismo criterio que «writing burns today's T») ni el P que da el libro (los diez P
 * por escribir, por recibir E o R: no son sentencias del registro, no están en su 1). Sin nada, el primero.
 * «firm» es verdadera si algún nivel alcanzado está a la altura del exigido o por encima (uno de arriba cubre los de abajo).
 * La cadena se recorre UNA vez, de abajo arriba (cada firma se verifica una sola vez): `e0 and l0 and casa and (vale(0) or
 * e1 and l1 and (vale(1) or …))`, con lj la clave de j anotada para su nivel y vale(j) lo barato (que el nivel que dice j,
 * con su grado, llega al exigido o por encima). Primero «sealed» (lo que le falta un dato la deja PENDIENTE, como antes), luego la cadena, luego el recibo.
 * Sin sello ni recibo, falsa.
 */
export function formulaDeFirmeza(p = POSICIONES_DEL_SELLO) {
  const { en, E, c, eslabon } = piezasDeCascada(p);
  const { capa, exigido, nivelDe, llega, linea, casa, pares } = piezasDeNivel(p, E, c);
  const familia = (j) => '(nth ' + j + ' epoch.7.6.3)';
  // «sealed» da el último nivel: por la vía «taproot», tal cual; por la «cascada», con los pares de toda su cadena.
  const sellado = 'count (first it.6).8.2 > 0 and first (first it.6).8.5 and (not ("' + p.cascada + '" in ' + en('via') + ') or ' + pares + ')';
  const recibido = 'count (first it.6).8.1 > 0 and first (first it.6).8.4';
  const ultima = CAPAS_DE_LA_FORMULA - 1;
  const coste = 'T in it2.0.0.0 and burn in it2.4 and count epoch.7.0.(it2.0.0.1) = 1 and it2.3.0 = first it.3';
  const mueve = (j) => 'count (it.1 where not (' + coste + ') and (' + FAMILIAS.map((f) => familia(j) + ' = "' + f + '" and ' + f + ' in it2.0.0.0').join(' or ') + ')) > 0';
  // Ningún nivel de encima de k hace falta: el exigido es k o uno de debajo.
  const encima = (k) => Array.from({ length: ultima - k }, (_, i) => ' and not (' + mueve(k + 1 + i) + ')').join('');
  // vale(j): el nivel que dice, con su grado, está a la altura del exigido o por encima (que su clave está anotada para ese
  // nivel lo dice linea(j), antes, para cada eslabón de la cadena). Los niveles, de arriba abajo: `A(último) or not (mueve último) and (A(penúltimo) or not (mueve
  // penúltimo) and (…))`, así cada «mueve» sale una vez por eslabón.
  const vale = (j) => {
    let x = '';
    for (let k = 0; k <= ultima; k++) {
      const a = '(' + capa(k) + ' in ' + nivelDe(j) + ' and ' + llega(k, j) + ')';
      x = k === 0 ? a : a + ' or not (' + mueve(k) + ') and (' + x + ')';
    }
    return x;
  };
  let cadena = '';
  for (let j = ESLABONES_DE_LA_FORMULA - 1; j >= 0; j--) cadena = eslabon(j) + ' and ' + linea(j) + (j === 0 ? ' and ' + casa : '') + ' and (' + vale(j) + (cadena ? ' or ' + cadena : '') + ')';
  const porLaCadena = '("' + p.cascada + '" in ' + en('via') + ' and bytes(first ' + en('id') + ') = bytes(first it.5) and ' + delLibro(c) + ' and ' + cadena + ')';
  const porElRecibo = '(' + recibido + ' and ' + exigido(0) + ' = 0' + encima(0) + ')';
  return '=(' + sellado + ') or ' + porLaCadena + ' or ' + porElRecibo;
}

/**
 * Las piezas de los niveles que comparten «firm» (formulaDeFirmeza) y la prueba que trae un registro en su payload
 * (formulaDeSelloDelDato): capa(k) el nivel k de epoch.7.6.1, exigido(k) el grado exigido en él (7.6.5), nivelDe(j) y
 * gradoDe(j) lo que dice el 9.j.1 del eslabón j, llega(k, j) que su grado llega al exigido en k, linea(j) que la clave de
 * su cabecera está anotada en before.8.9 para el nivel que dice el propio j (las «line keys», pares [nivel, clave]: lookup
 * de sus niveles y sus claves, en paralelo; un 9.j.1 vacío no lo está), casa que el nivel del eslabón 0 es el más bajo de
 * los anotados y pares que toda la cadena presente (de 1 a ESLABONES_DE_LA_FORMULA eslabones) cumple linea y el 0, casa
 * (VG 17-11, encargo «las claves de línea, por nivel», y su enmienda «5 bis» con Core StateArk). Sin el «=».
 */
function piezasDeNivel(p, E, c) {
  const capa = (k) => '(nth ' + k + ' epoch.7.6.1)';
  const exigido = (k) => '(nth ' + k + ' epoch.7.6.5)';
  // El 9.j.1 del eslabón j: [nivel], [nivel, grado] o [nivel, grado, red].
  const nivelDe = (j) => '(first ' + E(j) + '.' + p.eslabon.nivel + ')';
  const gradoDe = (j) => '(nth ' + p.enElNivel.grado + ' ' + E(j) + '.' + p.eslabon.nivel + ')';
  // El grado llega al exigido: lo exigido es 0, o el grado es el exigido o uno de los de encima (exigido + 1…), y es una
  // posición de 7.6.4. Con «in»: un grado que falta o que es un texto no es ninguno de esos números (falso, no ERROR).
  const llega = (k, j) => '(' + exigido(k) + ' = 0 or (' + Array.from({ length: GRADOS_DE_LA_FORMULA - 1 }, (_, d) => gradoDe(j) + ' in ' + (d === 0 ? exigido(k) : '(' + exigido(k) + ' + 1'.repeat(d) + ')')).join(' or ') + ') and ' + gradoDe(j) + ' < count epoch.7.6.4)';
  const linea = (j) => '(count ' + E(j) + '.' + p.eslabon.nivel + ' > 0 and first ' + c(j, 'clave') + ' in lookup(before.8.9.0, before.8.9.1, ' + nivelDe(j) + '))';
  const casa = '(' + nivelDe(0) + ' = min before.8.9.0)';
  const pares = '(' + linea(0) + ' and ' + casa + Array.from({ length: ESLABONES_DE_LA_FORMULA - 1 }, (_, i) => ' and (count ' + E(i + 1) + ' = 0 or ' + linea(i + 1) + ')').join('') + ')';
  return { capa, exigido, nivelDe, gradoDe, llega, linea, casa, pares };
}

/** La primera cabecera de la cadena nombra este libro: su 8 es el id del génesis (before.5; VG 17-11, encargo «las claves de línea, por nivel»). */
const delLibro = (c) => 'first ' + c(0, 'libro') + ' = first before.5';

/** De dónde leen «sealed» y «firm» el sello de un registro: S, lo que el núcleo lee en su 6.8.2, y su hoja, su 5 (su id). */
function delRegistro(p) {
  return { S: '(first ((first it.6).8.2 where "' + p.marca + '" in it2.' + p.clase + '))', hoja: 'it.5' };
}

/**
 * La firmeza de un sello que un registro TRAE COMO DATO (encargo A21, el gobierno: «put a change in force» lleva en su
 * payload la décupla de sello del «enact a change», la misma forma que guarda eje.marcarSello) frente a un nivel pedido:
 * las mismas piezas que «sealed» y «firm», aplicadas a `sello` (una expresión BQL que da la décupla) con la hoja `hoja` (una
 * expresión que da el id que ha de cubrir) en vez de al 6.8.2 de un registro y su 5. Vale si:
 *   la prueba entera vale («sealed» por cualquiera de sus dos vías, con el observador en before.8.6: llega a Bitcoin, el
 *   último nivel, que cubre todos los de abajo), y si es de la vía «cascada», con los pares de toda su cadena; o
 *   por la cadena, como en «firm»: la vía es «cascada», su hoja es `hoja`, la primera cabecera nombra este libro (before.5)
 *   y hay un eslabón j con los de 0 a j válidos, cada uno firmado por una clave anotada en before.8.9 para el nivel que
 *   dice (el 0, en el más bajo de los anotados), y un nivel k que el j dice, a la altura de `nivel` o por encima, con su
 *   grado a la altura del exigido en k (epoch.7.6.5) (VG 17-11, encargo «las claves de línea, por nivel», y su enmienda
 *   «5 bis»: las «observer keys» ya no cuentan para la cadena).
 * `nivel` es una expresión BQL que da un número de epoch.7.6.1. Sin recibo de llegada (el registro no lo trae). Sin el «=».
 */
export function formulaDeSelloDelDato({ sello, hoja, nivel }, p = POSICIONES_DEL_SELLO) {
  const d = { S: sello, hoja };
  const { en, E, c, eslabon } = piezasDeCascada(p, d);
  const { capa, nivelDe, llega, linea, casa, pares } = piezasDeNivel(p, E, c);
  const sellado = '(' + formulaCascada(p, d) + ' and ' + pares + ' or not ("' + p.cascada + '" in ' + en('via') + ') and ' + formulaTaproot(p, d) + ')';
  const niveles = (j) => Array.from({ length: CAPAS_DE_LA_FORMULA }, (_, k) => '(' + capa(k) + ' in ' + nivelDe(j) + ' and ' + capa(k) + ' >= ' + nivel + ' and ' + llega(k, j) + ')').join(' or ');
  let cadena = '';
  for (let j = ESLABONES_DE_LA_FORMULA - 1; j >= 0; j--) cadena = eslabon(j) + ' and ' + linea(j) + (j === 0 ? ' and ' + casa : '') + ' and ((' + niveles(j) + ')' + (cadena ? ' or ' + cadena : '') + ')';
  const porLaCadena = '("' + p.cascada + '" in ' + en('via') + ' and bytes(first ' + en('id') + ') = bytes(first ' + hoja + ') and ' + delLibro(c) + ' and ' + cadena + ')';
  return '(' + sellado + ' or ' + porLaCadena + ')';
}

/** La vía «taproot», la de antes del 16-11, intacta (sin el «=»): ver formulaDeSellado. */
function formulaTaproot(p, d = delRegistro(p)) {
  const S = d.S;
  const en = (k) => S + '.' + p[k];
  const T = '(first tx(bytes(first ' + en('tx') + ')))';
  const C = '(first cabecera(bytes(first ' + en('cabecera') + ')))';
  return 'bytes(first ' + en('id') + ') = bytes(first ' + d.hoja + ')'
    + ' and cat(bytes("' + p.p2tr + '"), taptweak(bytes(first ' + en('interna') + '), tapleaf(cat(bytes("' + p.compromiso + '"), bytes(first ' + en('lote') + '))), ' + en('hermanosTaproot') + ')) = first (nth (first ' + en('vout') + ') ' + T + '.2).1'
    + ' and merkle(first ' + T + '.5, ' + en('ladosBitcoin') + ', ' + en('hermanosBitcoin') + ', "bitcoin") = first ' + C + '.3'
    + ' and hex(first ' + C + '.7) = first ' + en('hash')
    + ' and below(reverse(first ' + C + '.7), first ' + C + '.8)'
    + ' and le(bytes(first ' + en('alturaLe') + ')) = first ' + en('altura')
    + ' and signed(bytes(first ' + en('firma') + '), hash(cat(bytes(first ' + en('cabecera') + '), bytes(first ' + en('alturaLe') + ')), "' + ETIQUETA_DEL_OBSERVADOR + '"), bytes(first ' + en('clave') + '))'
    + ' and first ' + en('clave') + ' in before.8.6'
    + ' and hex(merkle(bytes(first ' + d.hoja + '), ' + en('lados') + ', ' + en('hermanos') + ', "sip")) = first ' + en('lote')
    + ' and "' + p.taproot + '" in ' + en('via');
}

/**
 * EL MAPA DE POSICIONES DEL RECIBO DE PAGO copiado en X.6.8.3 (encargos «taproot» y «pago2», Core AGRAM 13-11; eje.marcarPago):
 * 0-4 la décupla del recibo único de StateArk de clase «pago» tal cual (SIP 0, B19; `Carril.reciboPago` de la simulación
 * ddcc475): 0 ["recibo", "pago"], 1 el sujeto (el txid, orden interno), 2 las claves y 3 los valores, en paralelo (destino:
 * el script de la salida en hex; bloque: su hash, orden interno; altura, como TEXTO, como todos los valores; orden; puntero,
 * el id de AGRAM, solo si lo hay, tras «orden» y antes de «universo»; universo; cuánto, como «61000 sat»; no afirma…),
 * 4 la evidencia, SIEMPRE una décupla: [[transacción cruda], [cabecera], [firma del observador], [altura LE], [clave del
 * observador], lados, hermanos del camino «bitcoin» si los hay]; de 4.1 a 4.6 es lo mismo que el 7 del sello (7.0 a 7.5:
 * la cabecera firmada por el observador declarado, H9; sin esa firma la simulación lanza «unobserved» y no hay recibo);
 * y detrás lo del sobre que hace falta para la firma: 5 el emisor (clave x-only), 6 su t, 7 el id del sobre (SHA-256 de
 * canonico({ schema, emisor, t, recibo }): lo recalcula el núcleo al guardarlo) y 8 la firma BIP-340 del emisor sobre ese
 * id. La regla «paid» (X.6.8.6) se escribe con `formulaDePago()`. `puntero` es la clave del valor que apunta al registro
 * y `scriptPuntero` el principio del script de la salida que lo lleva (OP_RETURN, empuje de 70 bytes) seguido de
 * `prefijoPuntero` en UTF-8: 6a46 ‖ utf8("agram:" ‖ id), con 0 sats y en cualquier vout.
 */
export const POSICIONES_DEL_PAGO = Object.freeze({
  marca: 'pago', unidad: 'sat', puntero: 'puntero', prefijoPuntero: 'agram:', scriptPuntero: '6a46',
  clase: '0', sujeto: '1', claves: '2', valores: '3',
  tx: '4.0', cabecera: '4.1', firma: '4.2', alturaLe: '4.3', clave: '4.4', lados: '4.5', hermanos: '4.6',
  emisor: '5', t: '6', id: '7', firmaEmisor: '8',
});

/**
 * La fórmula del 2 de la regla «paid» (X.6.8.6) con el mapa del recibo de pago: R el recibo copiado en el 6.8.3 del
 * registro, T su transacción cruda y C la cabecera de su bloque. Comprueba, sin salir del libro y sin fiarse de quien
 * pagó: la firma del emisor sobre el id del recibo; que es un recibo de pago; que la transacción es la del sujeto (su
 * txid); que su txid, con el camino «bitcoin» (ninguno si es la única del bloque), da la raíz de Merkle de la cabecera;
 * que la cabecera da el bloque que el recibo afirma y cumple su prueba de trabajo; que la altura firmada por el
 * observador es la que dice el recibo (que es texto: `hash` de un número es el SHA-256 de su decimal canónico y
 * `sha256(utf8(texto))` el del texto, así que coinciden si el texto es ese decimal); que el observador firmó cabecera ‖
 * altura y su clave está declarada (before.8.6, las «observer keys» de la cuenta raíz, como en «sealed»); que una salida
 * de la transacción paga exactamente «cuánto» (en sat) al script «destino»; y, si el recibo trae «puntero», que es el id
 * de este registro (it.5) y que una salida de la transacción es 6a46 ‖ «agram:<id>» (en cualquier vout). La firma del
 * emisor va primero y la altura y el observador después de la cabecera: sin recibo (o sin su evidencia, como el de un
 * pago aún sin bloque, o sin la firma del observador, «unobserved») queda PENDIENTE, nunca verdadera ni falsa.
 */
export function formulaDePago(p = POSICIONES_DEL_PAGO) {
  const R = '(first (first it.6).8.3)';
  const en = (k) => R + '.' + p[k];
  const valor = (clave) => 'lookup(' + en('claves') + ', ' + en('valores') + ', "' + clave + '")';
  const T = '(first tx(bytes(first ' + en('tx') + ')))';
  const C = '(first cabecera(bytes(first ' + en('cabecera') + ')))';
  return '=signed(bytes(first ' + en('firmaEmisor') + '), bytes(first ' + en('id') + '), bytes(first ' + en('emisor') + '))'
    + ' and "' + p.marca + '" in ' + en('clase')
    + ' and hex(first ' + T + '.5) in ' + en('sujeto')
    + ' and merkle(first ' + T + '.5, ' + en('lados') + ', ' + en('hermanos') + ', "bitcoin") = first ' + C + '.3'
    + ' and hex(first ' + C + '.7) = first ' + valor('bloque')
    + ' and below(reverse(first ' + C + '.7), first ' + C + '.8)'
    + ' and hash(le(bytes(first ' + en('alturaLe') + '))) = sha256(utf8(first ' + valor('altura') + '))'
    + ' and signed(bytes(first ' + en('firma') + '), hash(cat(bytes(first ' + en('cabecera') + '), bytes(first ' + en('alturaLe') + ')), "' + ETIQUETA_DEL_OBSERVADOR + '"), bytes(first ' + en('clave') + '))'
    + ' and first ' + en('clave') + ' in before.8.6'
    + ' and "' + p.unidad + '" in (first ' + valor('cuánto') + ').2'
    + ' and count (' + T + '.2 where first it2.0 = first (first ' + valor('cuánto') + ').1 and hex(first it2.1) = first ' + valor('destino') + ') >= 1'
    + ' and (not ("' + p.puntero + '" in ' + en('claves') + ') or (first ' + valor(p.puntero) + ' = first it.5'
    + ' and count (' + T + '.2 where hex(first it2.1) = hex(cat(bytes("' + p.scriptPuntero + '"), utf8("' + p.prefijoPuntero + '"), utf8(first ' + valor(p.puntero) + '))) ) >= 1))';
}
