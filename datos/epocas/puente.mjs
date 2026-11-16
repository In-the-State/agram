// El puente entre libros en la época 0 (encargo A15, tramo 3, paso 2; agram-equipo/DISENO_PUENTE.md §3, §4, §5 y §7 bis;
// docs/notas/PUENTE.md). Las fórmulas largas de las reglas del puente salen de aquí, como la de «a change comes into force
// with its proof» sale de gobierno.mjs: test/puente.test.js comprueba que cada archivo de reglas/ lleva exactamente la
// fórmula de FORMULAS. Si cambia la forma del sello (src/sello.js, POSICIONES_DEL_SELLO) o una de estas fórmulas:
//
//   node datos/epocas/puente.mjs --escribir    (y luego npm run epocas)
//
// Lo demás de cada regla (lo que lee, procedencia, orden, mensaje) y las plantillas son JSON escritos a mano.
//
// Y las ayudas de JS del puente, que no son núcleo: el registro de otro libro como décupla para traerlo
// (registroComoDecupla) y lo traído, leído (leerTraido).

import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { POSICIONES_DEL_SELLO, ETIQUETA_DE_CABECERA, ESLABONES_DE_LA_FORMULA, CAPAS_DE_LA_FORMULA, GRADOS_DE_LA_FORMULA } from '../../src/sello.js';
import { canonico } from '../../src/evento.js';
import { formatear } from './generar.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));

/** Las cuatro plantillas del puente (lo que dice el 4 de cada registro que escriben). */
export const PLANTILLAS_DEL_PUENTE = Object.freeze({
  traer: 'bring a record from another book',
  enviar: 'send to another book',
  recibir: 'receive from another book',
  declarar: 'declare a balance',
});

/** Los enlaces entre libros que ya existen (docs/notas/LIBRO_PRIVADO.md): el puente solo cruza por ellos. */
export const ENLACES = Object.freeze({ abrir: 'open a private book here', cuelga: 'this book hangs from' });

/** Dónde quedan los registros traídos: el 9.8 del génesis («brought from other books»). */
export const ANCLA_DE_LO_TRAIDO = '9800000000';

/** El requisito de E (8.9.3): su registro atado ha cruzado antes. */
export const REQUISITO_DE_E = 'the tied record of E crossed before';

/** Los nombres de las reglas del puente, por lo que miran. */
export const REGLAS_DEL_PUENTE = Object.freeze({
  enlazado: 'a record is brought from a linked book',
  conClaves: 'bringing needs the line keys of the book',
  cuerpo: 'a brought record is its body',
  prueba: 'a brought record comes with its proof',
  unaVez: 'a record is brought once',
  familias: 'only the families of the bridge cross',
  envio: 'a send locks what it names',
  soloLaVuelta: 'what is locked for another book is released only by its return',
  recibir: 'a send is received once by whom it names',
  loEnviado: 'what is received is what was sent',
  forastera: 'only a receive mints a foreign series',
  requisitoE: REQUISITO_DE_E,
  saldo: 'a declared balance is true',
});

const P = PLANTILLAS_DEL_PUENTE;
const L_ = ENLACES;
const hexDe = (t) => Buffer.from(t, 'utf8').toString('hex');
/** 65 bytes a cero: con ellos `slice` no se sale de un texto corto (el BQL mínimo no tiene «largo»). */
const CEROS = '00'.repeat(65);

/**
 * ¿Es forastera la serie de un movimiento (o de una serie) `m`? Su familia es E y su emisor es «<64 hex>:<emisor>»: el
 * byte 64 de su emisor es «:» (src/tokens.js, esEmisorForastero). `familia` y `emisor` son expresiones.
 */
export const forastera = (familia, emisor) => '(E in ' + familia + ' and hex(slice(cat(utf8(first ' + emisor + '), bytes("' + CEROS + '")), 64, 65)) = "3a")';
const forasteraMov = (it) => forastera(it + '.0.0.0', it + '.0.0.1');

/** El libro que nombra un enlace L (`L` una expresión de un registro): 1.0.0 en «open a private book here», 1.0 en «this book hangs from». */
const libroEs = (L, B) => '("' + L_.abrir + '" in (payload(' + L + ')).4 and first (payload(' + L + ')).1.0.0 = ' + B
  + ' or "' + L_.cuelga + '" in (payload(' + L + ')).4 and first (payload(' + L + ')).1.0 = ' + B + ')';
const esEnlace = (L) => '("' + L_.abrir + '" in (payload(' + L + ')).4 or "' + L_.cuelga + '" in (payload(' + L + ')).4)';

/** La clave K está anotada en el enlace L para el nivel N: uno de sus pares [nivel, clave] (2.p en «open…», 1.1.p en «this book…»). */
const claveEnNivel = (L, N, K) => Array.from({ length: 4 }, (_, p) => ['2', '1.1'].map((d) => '(first (payload(' + L + ')).' + d + '.' + p + ' = ' + N + ' and last (payload(' + L + ')).' + d + '.' + p + ' = ' + K + ')').join(' or ')).join(' or ');

/**
 * Una salida de un movimiento como texto (text de utf8: su valor), que se despliega como el registro que nombra, si lo es
 * (una salida en el 2 de un movimiento solo se despliega si nombra una serie o es un instante).
 */
const SALIDA = '(text(utf8(it2)))';

/** El instante de un registro, en segundos (D-FECHA 0 de su t). */
const t = (x) => 'first (first ' + x + '.6).0.0';

// ---------- traer un registro ----------

/** Lo que lleva un «bring a record from another book»: 1.0 el libro de origen, 1.1 el registro, 1.2 la prueba, 1.3 el enlace. */
const B = 'first (payload(ev)).1.0';
const R = (k) => '(payload(ev)).1.1.' + k;
const SELLO = '(first (payload(ev)).1.2)';
const ENLACE = '(first (payload(ev)).1.3)';
const noTraer = 'not ("' + P.traer + '" in ev.4)';

/**
 * «a record is brought from a linked book»: cuelga del 9.8 del génesis y su enlace (1.3) es un registro de este libro, del
 * dueño (el autor del génesis), que nombra el libro de origen (1.0) y es el último de los suyos: un «open a private book
 * here» sin otro posterior del mismo autor para ese libro en el mismo elemento, o un «this book hangs from» en el 9.5 del
 * génesis sin otro posterior. A igualdad de instante, ninguno de los dos vale (el BQL mínimo no ordena textos).
 */
export function formulaDeEnlazado() {
  const L = ENLACE;
  const posterior = (lista, nombre, libro) => 'count ((' + lista + ') where "' + nombre + '" in (payload(it)).4 and ' + libro + ' and first it.3 = first ' + L + '.3 and it != ' + L + ' and ' + t('it') + ' >= ' + t(L) + ') = 0';
  return '=' + noTraer + ' or first ev.6.5 = first before.5 and nth 1 ev.6.5 = "' + ANCLA_DE_LO_TRAIDO + '"'
    + ' and count ' + L + '.5 > 0 and first ' + L + '.3 = first (first before.5).3'
    + ' and ("' + L_.abrir + '" in (payload(' + L + ')).4 and nth 1 ' + L + '.6.5 = "9100000000" and first (payload(' + L + ')).1.0.0 = ' + B
    + ' and ' + posterior('down (up ' + L + ')', L_.abrir, 'first (payload(it)).1.0.0 = ' + B)
    + ' or "' + L_.cuelga + '" in (payload(' + L + ')).4 and first ' + L + '.6.5 = first before.5 and nth 1 ' + L + '.6.5 = "9500000000" and first (payload(' + L + ')).1.0 = ' + B
    + ' and ' + posterior('(first before.5).9.5', L_.cuelga, 'first (payload(it)).1.0 = ' + B) + ')';
}

/** «bringing needs the line keys of the book»: el enlace (si lo es) anota al menos un par [nivel, clave]. */
export function formulaDeConClaves() {
  const L = ENLACE;
  return '=' + noTraer + ' or not (count ' + L + '.5 > 0 and ' + esEnlace(L) + ') or count (payload(' + L + ')).2.0 = 2 or count (payload(' + L + ')).1.1.0 = 2';
}

/**
 * «a brought record is its body»: el id que trae (1.1.0) es el SHA-256 de su cuerpo canónico (src/evento.js, cuerpo y
 * canonico: las claves en orden, autor, contexto, en, movimientos, payload, sobre y t), rehecho con json y cat de lo que
 * trae: 1.1.1 autor, 1.1.2 sobre, 1.1.3 en, 1.1.4 t, 1.1.5 movimientos y 1.1.7 contexto (su JSON canónico, como texto),
 * 1.1.6 el payload tal cual.
 */
export function formulaDelCuerpo() {
  const pieza = (texto) => 'bytes("' + hexDe(texto) + '")';
  const cuerpo = [
    pieza('{"autor":'), 'json(first ' + R(1) + ')',
    pieza(',"contexto":'), 'utf8(first ' + R(7) + ')',
    pieza(',"en":'), 'json(first ' + R(3) + ')',
    pieza(',"movimientos":'), 'utf8(first ' + R(5) + ')',
    pieza(',"payload":'), 'json(first ' + R(6) + ')',
    pieza(',"sobre":'), 'json(first ' + R(2) + ')',
    pieza(',"t":'), 'json(first ' + R(4) + ')',
    pieza('}'),
  ];
  return '=' + noTraer + ' or hex(sha256(cat(' + cuerpo.join(', ') + '))) = first ' + R(0);
}

/**
 * Las piezas de un eslabón de la vía «cascada» sobre un sello S (las mismas que src/sello.js piezasDeCascada, escritas con
 * el mismo mapa: una prueba comprueba que salen letra por letra en sello.formulaDeSelloDelDato).
 */
export function piezasDelEslabon(S, hoja, p = POSICIONES_DEL_SELLO) {
  const en = (k) => S + '.' + p[k];
  const E = (k) => S + '.' + p.cadena + '.' + k;
  const c = (k, campo) => E(k) + '.' + p.eslabon.cabecera + '.' + p.cabeceraDeLote[campo];
  const H = (k) => 'hash(cat(' + ['numeroLe', 'anterior', 'raiz', 'horaLe', 'clave', 'libro', 'referencias'].map((x) => 'bytes(first ' + c(k, x) + ')').join(', ') + '), "' + ETIQUETA_DE_CABECERA + '")';
  const eslabon = (k) => '"' + p.cabeceraDeLote.marca + '" in ' + c(k, 'clase') + ' and "' + p.cabeceraDeLote.version + '" in ' + c(k, 'clase')
    + ' and le(bytes(first ' + c(k, 'numeroLe') + ')) = first ' + c(k, 'numero')
    + ' and le(bytes(first ' + c(k, 'horaLe') + ')) = first ' + c(k, 'hora')
    + ' and merkle(' + (k === 0 ? 'bytes(first ' + en('id') + ')' : H(k - 1)) + ', ' + E(k) + '.' + p.eslabon.lados + ', ' + E(k) + '.' + p.eslabon.hermanos + ', "sip") = bytes(first ' + c(k, 'raiz') + ')'
    + ' and signed(bytes(first ' + c(k, 'firma') + '), ' + H(k) + ', bytes(first ' + c(k, 'clave') + '))';
  return { en, E, c, H, eslabon, hoja };
}

/**
 * «a brought record comes with its proof» (diseño §4.1 y §7 bis): el sello que trae (1.2) es de la vía «cascada», su hoja
 * es el id traído, su primera cabecera es del libro de origen (su 8 = 1.0) y hay un eslabón j con los de 0 a j válidos
 * (piezasDelEslabon) que dice un nivel k a la altura de epoch.8.9.2 o por encima, con su grado a la altura del exigido en
 * k (epoch.7.6.5, como «firm»), y cuya cabecera firma una clave que el enlace (1.3) anota para ese nivel k. No basta que
 * el sello llegue a Bitcoin con un observador de este libro («sealed»): las claves de las cabeceras han de ser las de
 * línea del otro libro. Que el ancla descienda del origen de su línea («anchor origin») no es una regla: es un grado de
 * la prueba, que se comprueba fuera (diseño §7 bis).
 */
export function formulaDeLaPrueba(p = POSICIONES_DEL_SELLO) {
  const { en, E, c, eslabon } = piezasDelEslabon(SELLO, R(0), p);
  const capa = (k) => '(nth ' + k + ' epoch.7.6.1)';
  const exigido = (k) => '(nth ' + k + ' epoch.7.6.5)';
  const nivelDe = (j) => '(first ' + E(j) + '.' + p.eslabon.nivel + ')';
  const gradoDe = (j) => '(nth ' + p.enElNivel.grado + ' ' + E(j) + '.' + p.eslabon.nivel + ')';
  const llega = (k, j) => '(' + exigido(k) + ' = 0 or (' + Array.from({ length: GRADOS_DE_LA_FORMULA - 1 }, (_, d) => gradoDe(j) + ' in ' + (d === 0 ? exigido(k) : '(' + exigido(k) + ' + 1'.repeat(d) + ')')).join(' or ') + ') and ' + gradoDe(j) + ' < count epoch.7.6.4)';
  const niveles = (j) => Array.from({ length: CAPAS_DE_LA_FORMULA }, (_, k) => '(' + capa(k) + ' in ' + nivelDe(j) + ' and ' + capa(k) + ' >= first epoch.8.9.2 and ' + llega(k, j) + ' and (' + claveEnNivel(ENLACE, capa(k), 'first ' + c(j, 'clave')) + '))').join(' or ');
  let cadena = '';
  for (let j = ESLABONES_DE_LA_FORMULA - 1; j >= 0; j--) cadena = eslabon(j) + ' and ((' + niveles(j) + ')' + (cadena ? ' or ' + cadena : '') + ')';
  return '=' + noTraer + ' or "' + p.cascada + '" in ' + en('via') + ' and bytes(first ' + en('id') + ') = bytes(first ' + R(0) + ')'
    + ' and first ' + c(0, 'libro') + ' = ' + B + ' and ' + cadena;
}

/** «a record is brought once»: ningún registro traído antes (en el 9.8 del génesis) trae el mismo id. */
export function formulaDeUnaVez() {
  return '=' + noTraer + ' or count ((first before.5).9.8 where "' + P.traer + '" in (payload(it)).4 and first (payload(it)).1.1.0 = first ' + R(0) + ') = 0';
}

// ---------- enviar ----------

/** Lo que lleva un «send to another book»: 1.0 el libro de destino, 1.1 la serie (sus partes), 1.2 cuánto, 1.3 a quién (su clave). */
const SP = (k) => '(payload(ev)).1.1.' + k;
const noEnviar = 'not ("' + P.enviar + '" in ev.4)';
const familiaEs = (texto, it) => '(' + ['E', 'P', 'R', 'T'].map((f) => texto + ' = "' + f + '" and ' + f + ' in ' + it + '.0.0.0').join(' or ') + ')';

/** «only the families of the bridge cross»: la familia que dice el envío (1.1.1) está en epoch.8.9.1 y es la de lo que bloquea. */
export function formulaDeFamilias() {
  return '=' + noEnviar + ' or first ' + SP(1) + ' in epoch.8.9.1 and count (ev.1 where lock in it.4 and not ' + familiaEs('first ' + SP(1), 'it') + ') = 0';
}

/**
 * «a send locks what it names»: se ancla en un enlace que nombra el libro de destino (1.0, otro libro); bloquea una sola
 * vez, cuánto dice (1.2), con la salida en el enlace, de la serie cuyas partes dice (1.1.3 su emisor, 1.1.4 su
 * denominación), y nada más que su coste. Dónde nació la serie (1.1.2) y su registro atado allí (1.1.5): si es de aquí,
 * este libro y su registro; si es forastera, solo vuelve a su libro de origen, su emisor empieza por él y el registro es
 * el que trajo el registro al que está atada (diseño §4.4: la vuelta).
 */
export function formulaDelEnvio() {
  const L = '(first ev.6.5)';
  const D = 'first ' + '(payload(ev)).1.0';
  const nacio = 'not ' + forasteraMov('it') + ' and first ' + SP(2) + ' = first before.5 and first ' + SP(5) + ' = first it.5'
    + ' or ' + forasteraMov('it') + ' and first ' + SP(2) + ' = ' + D + ' and slice(utf8(first it.0.0.1), 0, 64) = utf8(' + D + ')'
    + ' and "' + P.traer + '" in (payload(first it.5)).4 and first (payload(first it.5)).1.0 = ' + D + ' and first ' + SP(5) + ' = first (payload(first it.5)).1.1.0';
  return '=' + noEnviar + ' or ' + esEnlace(L) + ' and ' + libroEs(L, D) + ' and ' + D + ' != first before.5'
    + ' and count (ev.1 where lock in it.4) = 1 and count (ev.1 where mint in it.4 or transfer in it.4 or release in it.4) = 0'
    + ' and count (ev.1 where lock in it.4 and it.1 = first (payload(ev)).1.2 and first ev.6.5 in it.2 and first it.0.0.1 = first ' + SP(3) + ' and first it.0.0.2 = first ' + SP(4) + ' and (' + nacio + ')) = 1';
}

/**
 * «what is locked for another book is released only by its return»: lo bloqueado con la salida en un enlace (un envío)
 * no se libera ni se transfiere con esa salida dentro del libro, salvo en un «receive from another book» (que lo mira
 * «what is received is what was sent»).
 */
export function formulaDeSoloLaVuelta() {
  return '=count (ev.1 where (release in it.4 or transfer in it.4) and count (it.2 where count ' + SALIDA + '.5 > 0 and ' + esEnlace(SALIDA) + ') > 0) = 0 or "' + P.recibir + '" in ev.4';
}

// ---------- recibir ----------

/** Lo que lee un «receive from another book»: X el registro traído del envío; SND su payload (el del envío); O el libro de origen. */
const X = '(first ev.6.5)';
const BP = '(payload(' + X + '))';
const SND = (k) => BP + '.1.1.6.' + k;
const O = 'first ' + BP + '.1.0';
const noRecibir = 'not ("' + P.recibir + '" in ev.4)';

/**
 * «a send is received once by whom it names»: se ancla en un registro traído que es un envío a este libro, quien lo
 * escribe declara en su alta la clave a la que va (1.3 del envío) y no se ha recibido antes.
 */
export function formulaDeRecibir() {
  return '=' + noRecibir + ' or "' + P.traer + '" in ' + BP + '.4 and "' + P.enviar + '" in ' + SND('4') + ' and first ' + SND('1.0') + ' = first before.5'
    + ' and first ' + SND('1.3') + ' in ((first (first ev.3).6).5 each 2)'
    + ' and count (down ' + X + ' where "' + P.recibir + '" in (payload(it)).4) = 0';
}

/**
 * «what is received is what was sent»: la familia cruza aquí (epoch.8.9.1); si la serie nació aquí (la vuelta), libera
 * una vez, cuánto se envió, de la serie de aquí cuyo nombre forastero era el del envío, con la salida en un enlace al
 * libro de origen, y no mueve nada más; si nació en el origen, acuña una vez, cuánto se envió, para quien recibe, la serie
 * forastera: el emisor «<origen>:<emisor>» y la misma denominación (su registro atado lo mira el requisito de E).
 */
export function formulaDeLoEnviado() {
  const q = 'first ' + SND('1.2');
  const vuelta = 'first ' + SND('1.1.2') + ' = first before.5'
    + ' and count (ev.1 where mint in it.4 or transfer in it.4 or lock in it.4) = 0 and count (ev.1 where release in it.4) = 1'
    + ' and count (ev.1 where release in it.4 and it.1 = ' + q + ' and it.3.0 = first ev.3 and ' + familiaEs('first ' + SND('1.1.1'), 'it')
    + ' and first it.0.0.2 = first ' + SND('1.1.4') + ' and first it.5 = first ' + SND('1.1.5')
    + ' and cat(utf8(first before.5), bytes("3a"), utf8(first it.0.0.1)) = utf8(first ' + SND('1.1.3') + ')'
    + ' and count (it.2 where count ' + SALIDA + '.5 > 0 and ' + libroEs(SALIDA, O) + ') > 0) = 1';
  const ida = 'first ' + SND('1.1.2') + ' = ' + O
    + ' and count (ev.1 where release in it.4 or transfer in it.4 or lock in it.4) = 0 and count (ev.1 where mint in it.4) = 1'
    + ' and count (ev.1 where mint in it.4 and it.1 = ' + q + ' and it.3.1 = first ev.3 and ' + familiaEs('first ' + SND('1.1.1'), 'it')
    + ' and first it.0.0.2 = first ' + SND('1.1.4') + ' and utf8(first it.0.0.1) = cat(utf8(' + O + '), bytes("3a"), utf8(first ' + SND('1.1.3') + '))) = 1';
  return '=' + noRecibir + ' or first ' + SND('1.1.1') + ' in epoch.8.9.1 and (' + vuelta + ' or ' + ida + ')';
}

/** «only a receive mints a foreign series»: nadie acuña una serie forastera fuera de un «receive from another book». */
export function formulaDeForastera() {
  return '=count (ev.1 where mint in it.4 and ' + forasteraMov('it') + ') = 0 or "' + P.recibir + '" in ev.4';
}

/**
 * «the tied record of E crossed before» (el requisito de E, si epoch.8.9.3 lo nombra para E): la serie forastera de E que
 * acuña un «receive from another book» está atada al registro traído (del libro de origen) del registro al que la E está
 * atada allí (1.1.5 del envío).
 */
export function formulaDelRequisitoDeE() {
  return '=' + noRecibir + ' or not ("' + REQUISITO_DE_E + '" in lookup(epoch.8.9.1, epoch.8.9.3, "E"))'
    + ' or count (ev.1 where mint in it.4 and ' + forasteraMov('it') + ' and not (count it.5 > 0 and "' + P.traer + '" in (payload(first it.5)).4'
    + ' and first (payload(first it.5)).1.0 = ' + O + ' and first (payload(first it.5)).1.1.0 = first ' + SND('1.1.5') + ')) = 0';
}

// ---------- declarar un saldo ----------

/** «a declared balance is true»: quien la escribe tiene, de la serie que dice (1.0), al menos cuánto dice (1.1): disponible y bloqueado. */
export function formulaDelSaldo() {
  const entrada = '(first ev.3).1.(first (payload(ev)).1.0)';
  return '=not ("' + P.declarar + '" in ev.4) or first (payload(ev)).1.1 <= sum (' + entrada + ' each 1) + sum ((' + entrada + ').2 each 1)';
}

// ---------- las reglas de E que no cuentan la serie forastera ----------

const E_FUERA = forasteraMov('it');

/** «E is minted by and to its issuer», sin la serie forastera (la acuña su «receive from another book»). */
export function formulaDeEmiteSuEmisor() {
  return '=count (ev.1 where E in it.0.0.0 and mint in it.4 and not ' + E_FUERA + ' and (it.0.0.1 != first ev.3 or it.3.1 != it.0.0.1)) = 0';
}

/** «minting E needs own R issued», sin la serie forastera. */
export function formulaDeRPropia() {
  return '=count (ev.1 where mint in it.4 and E in it.0.0.0 and not ' + E_FUERA + ') = 0 or count ((first ev.3).1 where R in it.0.0.0 and first ev.3 in it.0.0.1) > 0 or sum (first ev.3).8.1 > 0 or count (ev.1 where mint in it.4 and R in it.0.0.0 and first ev.3 in it.0.0.1) > 0';
}

/** «minting E needs P on its record», sin la serie forastera. */
export function formulaDePEnSuRegistro() {
  return '=count (ev.1 where mint in it.4 and E in it.0.0.0 and not ' + E_FUERA + ' and not (count it.5 > 0 and count ((first ev.3).2.1 where it2.0 = first it.5 and it2.1 > 0 and (count it2.5 = 0 or first it2.5 = 1)) > 0)) = 0';
}

/** Cada archivo de reglas/ con la fórmula de su 2 (su último ocupante). */
export const FORMULAS = Object.freeze({
  'a-record-is-brought-from-a-linked-book.json': formulaDeEnlazado,
  'bringing-needs-the-line-keys-of-the-book.json': formulaDeConClaves,
  'a-brought-record-is-its-body.json': formulaDelCuerpo,
  'a-brought-record-comes-with-its-proof.json': formulaDeLaPrueba,
  'a-record-is-brought-once.json': formulaDeUnaVez,
  'only-the-families-of-the-bridge-cross.json': formulaDeFamilias,
  'a-send-locks-what-it-names.json': formulaDelEnvio,
  'what-is-locked-for-another-book-is-released-only-by-its-return.json': formulaDeSoloLaVuelta,
  'a-send-is-received-once-by-whom-it-names.json': formulaDeRecibir,
  'what-is-received-is-what-was-sent.json': formulaDeLoEnviado,
  'only-a-receive-mints-a-foreign-series.json': formulaDeForastera,
  'the-tied-record-of-e-crossed-before.json': formulaDelRequisitoDeE,
  'a-declared-balance-is-true.json': formulaDelSaldo,
  'e-is-minted-by-and-to-its-issuer.json': formulaDeEmiteSuEmisor,
  'minting-e-needs-own-r-issued.json': formulaDeRPropia,
  'minting-e-needs-p-on-its-record.json': formulaDePEnSuRegistro,
});

// ---------- ayudas de JS (no son núcleo) ----------

/**
 * Un registro de otro libro como lo lleva «bring a record from another book» en su 1.1: 0 su id, 1 su autor, 2 sobre qué
 * se escribió, 3 en qué posición, 4 su instante, 5 sus movimientos (su JSON canónico, un texto), 6 su payload tal cual, 7
 * su contexto (su JSON canónico) y, si va firmado, 8 su firma (un dato: sin la clave de su autor, que está en el otro
 * libro, aquí no se comprueba; la prueba de sello dice que el otro libro lo aceptó). No vale para el génesis (sin sobre).
 */
export function registroComoDecupla(ev) {
  const d = [[ev.id], [ev.autor], [ev.sobre], [ev.en ?? '0000000000'], [ev.t], [canonico(ev.movimientos ?? [])], ev.payload, [canonico(ev.contexto ?? {})]];
  if (typeof ev.firma === 'string') d.push([ev.firma]);
  return d;
}

/**
 * Lo traído, leído (diseño §4.1: quién lo escribió allí, qué decía, cuándo quedó en firme): el registro «bring a record
 * from another book» `id` de `eje` → { libro, id, autor, t, payload, firme, enlace, origen } o null. `firme` es la hora
 * (ISO) de la cabecera del primer eslabón que dice un nivel a la altura del que pide la época (epoch.8.9.2), la que da
 * por buena la regla; `origen`, el «anchor origin» que anota el enlace (null: «sin comprobar el origen»).
 */
export function leerTraido(eje, id) {
  const r = eje?.obtener?.(id);
  const p = r?.payload;
  if (!Array.isArray(p) || ![].concat(p[4] ?? []).includes(P.traer)) return null;
  const hoja = (x) => (Array.isArray(x) ? hoja(x[0]) : x);
  const reg = p[1]?.[1] ?? [];
  const sello = p[1]?.[2] ?? [];
  const q = POSICIONES_DEL_SELLO;
  const pedido = hoja(eje.epoca?.()?.registro?.[8]?.[9]?.[2]) ?? 4;
  const cadena = Array.isArray(sello[Number(q.cadena)]) ? sello[Number(q.cadena)] : [];
  const eslabon = cadena.find((e) => Array.isArray(e) && [].concat(e[1] ?? [])[0] >= pedido);
  const hora = eslabon ? hoja(eslabon[0]?.[Number(q.cabeceraDeLote.hora)]) : undefined;
  const enlace = eje.obtener(hoja(p[1]?.[3]));
  const lp = enlace?.payload ?? [];
  const origen = [].concat(lp[4] ?? []).includes(L_.abrir) ? hoja(lp[1]?.[0]?.[1]) : hoja(lp[1]?.[2]);
  return {
    libro: hoja(p[1]?.[0]), id: hoja(reg[0]), autor: hoja(reg[1]), t: hoja(reg[4]), payload: reg[6] ?? null,
    firme: Number.isFinite(hora) ? new Date(hora * 1000).toISOString() : null,
    enlace: enlace?.id ?? null, origen: typeof origen === 'string' ? origen : null,
  };
}

/** El archivo de cada regla del puente. */
export const ARCHIVO = (nombre) => join(AQUI, 'reglas', nombre);

// node datos/epocas/puente.mjs --escribir: pone cada fórmula en el 2 de su regla (el resto del archivo no cambia).
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href && process.argv.includes('--escribir')) {
  for (const [archivo, f] of Object.entries(FORMULAS)) {
    const ruta = ARCHIVO(archivo);
    const regla = JSON.parse(readFileSync(ruta, 'utf8'));
    regla[2] = [f()];
    writeFileSync(ruta + '.nuevo', formatear(regla) + '\n');
    renameSync(ruta + '.nuevo', ruta);
  }
  console.log('escritas ' + Object.keys(FORMULAS).length + ' fórmulas del puente');
}
