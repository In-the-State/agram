// El recibo único de las tres casas (B19, VG 12-11; `stateark.recibo@1`, stateark/sip/SIP-0.md
// «Recibo único»). Es lo que va en el `content` de los 7701 y 7703 de AARPIA. Un recibo dice
// lo que afirma, lo que NO afirma, a qué se ata y con qué pruebas se comprueba.
//
//   { schema: 'stateark.recibo@1', emisor, t, recibo: <décupla>, id, firma }
//   id = SHA-256(canonico de AGRAM de { schema, emisor, t, recibo });  firma = BIP-340 del emisor sobre el id
//
// Se arma aquí, sin importar StateArk (la referencia es stateark/sim/src/recibo.js;
// test/recibo.test.js comprueba que aquel lo da por bueno y que la décupla es la misma).
// Campos fuera del hash, como el `sello` del SIP: en un rechazo, `evento` (el evento rechazado,
// que ya lleva la firma de su autor).

import { canonico } from '../../../supabase/funciones/eventos/verificar.js';
import { aBytes, aHex, sha256Hex } from './nostr.js';
import { schnorr } from '../../../supabase/funciones/eventos/noble-secp256k1.js';

export const ESQUEMA = 'stateark.recibo@1';

/**
 * La décupla del recibo, sin huecos, sin relleno y SIN TUPLAS (VG 12-11 y 13-11; SIP 0 b052690,
 * stateark/sim 9be12c3). La misma que decuplaDeRecibo de StateArk:
 *   0 ['recibo', clase] · 1 sujeto (ids) · 2 CLAVES · 3 VALORES (mismo orden y largo).
 * Orden de las claves: las de la clase, «orden» y «anterior» si los hay (la llegada encadenada, SIP 0;
 * docs/notas/ORDEN_FIRMADO.md), «universo» siempre y, si existen, «causa» (una por causa),
 * «núcleo», «época»; al final «no afirma», una por cada cosa que no afirma (nunca ninguna).
 * El orden importa: es parte del id. «orden» va en decimal y como texto ('0', '17'); «anterior»
 * falta solo en el 0 (vector stateark/sip/vectores/recibos/llegada.json).
 */
export function decupla({ clase, sujeto, ata, orden, anterior, causa, universo, nucleo, epoca, noAfirma }) {
  const pares = [
    ...ata,
    ...(orden !== undefined && orden !== null ? [['orden', String(orden)]] : []),
    ...(anterior ? [['anterior', anterior]] : []),
    ['universo', universo],
    ...(causa ?? []).map((c) => ['causa', c]),
    ...(nucleo ? [['núcleo', nucleo]] : []),
    ...(epoca ? [['época', epoca]] : []),
    ...noAfirma.map((t) => ['no afirma', t]),
  ];
  return [['recibo', clase], [...sujeto], pares.map(([c]) => c), pares.map(([, v]) => v)];
}

/** Arma y firma un recibo con `privada`. `t` es un instante ISO. */
export async function firmarRecibo(campos, privada, t) {
  const emisor = aHex(schnorr.getPublicKey(aBytes(privada)));
  const cuerpo = { schema: ESQUEMA, emisor, t, recibo: decupla(campos) };
  const id = await sha256Hex(canonico(cuerpo));
  return { ...cuerpo, id, firma: aHex(schnorr.sign(aBytes(id), aBytes(privada))) };
}

/** Comprueba id y firma de un recibo (sin fiarse). */
export async function verificarRecibo(r) {
  if (r?.schema !== ESQUEMA) return false;
  const { schema, emisor, t, recibo } = r;
  if ((await sha256Hex(canonico({ schema, emisor, t, recibo }))) !== r.id) return false;
  try {
    return schnorr.verify(aBytes(r.firma), aBytes(r.id), aBytes(emisor));
  } catch {
    return false;
  }
}

const RESERVADOS = ['orden', 'anterior', 'universo', 'cuánto', 'causa', 'núcleo', 'época', 'no afirma'];

/** Los campos que más se leen de un recibo. `causa` es siempre una lista (vacía si no hay). */
export function leerRecibo(r) {
  const [cero, sujeto, claves, valores] = r.recibo;
  const pares = claves.map((c, i) => [c, valores[i]]);
  const uno = (n) => pares.find(([c]) => c === n)?.[1];
  const todos = (n) => pares.filter(([c]) => c === n).map(([, v]) => v);
  return {
    clase: cero[1],
    sujeto,
    ata: pares.filter(([c]) => !RESERVADOS.includes(c)),
    orden: uno('orden'),
    anterior: uno('anterior'),
    universo: uno('universo'),
    causa: todos('causa'),
    nucleo: uno('núcleo'),
    epoca: uno('época'),
    noAfirma: todos('no afirma'),
  };
}

/** Las causas de un recibo, como lista. */
export const causas = (r) => leerRecibo(r).causa;

const NO_AFIRMA_LLEGADA = [
  'que el evento sea válido según las reglas de la época: el relé no juzga',
  'que el reloj del relé sea exacto: para eso está el sello de tiempo en Bitcoin',
];
const NO_AFIRMA_ACEPTACION = [
  'que un núcleo o una época posteriores lo juzguen igual',
  'que lo que el evento anuncia fuera del libro haya ocurrido',
  'que el reloj del relé sea exacto: para eso está el sello de tiempo en Bitcoin',
];
const NO_AFIRMA_RECHAZO = [
  'que el evento sea falso o malicioso: solo que estas reglas, en este estado del libro, no lo admiten',
  'que un núcleo o una época posteriores lo rechacen también',
];

/**
 * El universo de un recibo encadenable (llegada o aceptación): una cadena por eje y por emisor (Correcciones del 17-11,
 * docs/notas/ORDEN_FIRMADO.md): «relé <clave> · eje <nombre>».
 */
export const universoDeCadena = (rele, eje) => 'relé ' + rele + ' · eje ' + eje;

/**
 * Recibo de llegada (7701 sin autoridad): lo firma el relé. Con `orden` (entero desde 0, el número del registro en la
 * cadena de ese eje) y `anterior` (el id del recibo de orden − 1; falta solo en el 0), la llegada encadenada.
 */
export const llegada = ({ idAgram, idNostr, eje, instante, rele, orden, anterior }, privada) =>
  firmarRecibo({ clase: 'llegada', sujeto: [idAgram, idNostr], ata: [['eje', eje], ['llegada', instante]], orden, anterior, universo: universoDeCadena(rele, eje), noAfirma: NO_AFIRMA_LLEGADA }, privada, instante);

/** Recibo de aceptación (7701 con autoridad): lo firma la autoridad, con núcleo y época; encadenado como la llegada. */
export const aceptacion = ({ idAgram, idNostr, eje, instante, rele, nucleo, epoca, orden, anterior }, privada) =>
  firmarRecibo({ clase: 'aceptación', sujeto: [idAgram, idNostr], ata: [['eje', eje], ['llegada', instante]], orden, anterior, universo: universoDeCadena(rele, eje), nucleo, epoca, noAfirma: NO_AFIRMA_ACEPTACION }, privada, instante);

/** Recibo de rechazo (7703): lo firma la autoridad; un par ['causa', …] por causa. */
export const rechazo = ({ idAgram, eje, instante, reason, nucleo, epoca, universo }, privada) =>
  firmarRecibo({ clase: 'rechazo', sujeto: [idAgram], ata: [['eje', eje]], causa: [...reason], universo, nucleo, epoca, noAfirma: NO_AFIRMA_RECHAZO }, privada, instante);
