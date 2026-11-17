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
// (registroComoDecupla), lo traído, leído (leerTraido), y la salida con saldos: cuánto se puede declarar (saldosDe) y
// los registros de la salida, listos para firmar (planDeSalida; docs/notas/PUENTE.md §11).
//
// La carta importa este módulo en el navegador (encargo «carta: irme con lo mío y el puente»): lo de Node (leer y escribir
// los archivos de reglas, --escribir) solo se carga en Node, y nada de arriba usa el Buffer de Node.

import { POSICIONES_DEL_SELLO, ETIQUETA_DE_CABECERA, ESLABONES_DE_LA_FORMULA, CAPAS_DE_LA_FORMULA, GRADOS_DE_LA_FORMULA, eslabonesValidos } from '../../src/sello.js';
import { canonico } from '../../src/evento.js';
import { claveToken, partirClave } from '../../src/tokens.js';
import { gradoDelEnlace, cuelgaDe } from '../../src/contrato.js';
import { epocaEscritaDe } from '../../src/epocas.js';
import { quemaDelCoste } from '../../src/escritura.js';
import { ajustesDelEje } from '../../src/exterior.js';

/** ¿Corre en Node? (las pruebas y --escribir). En el navegador no hay archivos que leer. */
const EN_NODE = typeof globalThis.process?.versions?.node === 'string';
const { dirname, join } = EN_NODE ? await import('node:path') : {};
const { fileURLToPath, pathToFileURL } = EN_NODE ? await import('node:url') : {};
const AQUI = EN_NODE ? dirname(fileURLToPath(import.meta.url)) : null;

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

/**
 * La regla del enlace de quien creó el libro (encargo «el puente, segunda vuelta», VG 17-11): un «open a private book
 * here» que lleva en su 5 el génesis del libro que enlaza lo prueba con él. No va en REGLAS_DEL_PUENTE (su sitio en la
 * cadena del 8 es detrás de «a declared balance is only that»).
 */
export const REGLA_DEL_CREADOR = 'who created a book links it with its genesis';

/**
 * RP2 (arreglos de la segunda revisión del puente): solo un envío bloquea con la salida en un enlace. Detrás de la del
 * creador en la cadena del 8; es suelo.
 */
export const REGLA_DEL_BLOQUEO = 'only a send locks for another book';

/** Dónde lleva un «open a private book here» el génesis del libro que enlaza (su 5) y un «this book hangs from» el punto (su 5). */
export const GENESIS_EN = 5;
export const PUNTO_EN = 5;

/**
 * Cuántos bloqueos puede nombrar un «receive from another book» de una vuelta (su 1.1). Arreglos de la segunda revisión,
 * RP8 y RP9: cinco por registro (así la regla coteja por salida y por persona con margen en el presupuesto de cálculo); una
 * vuelta que pide más se recibe en varios registros.
 */
export const BLOQUEOS_DE_LA_VUELTA = 5;

/** Hasta dónde puede llegar el 1.1 de un recibir (una décupla): las ternas más allá del tope han de ir vacías. */
const SITIOS_DEL_1_1 = 10;

/**
 * Lo que va a 7.9.6 (el suelo) con el puente (encargo «el puente, segunda vuelta», punto 3): las reglas que guardan lo
 * bloqueado para otro libro y lo traído, y las plantillas cuyo nombre leen. Ninguna alcanza una declaración de saldo.
 */
export const SUELO_DEL_PUENTE = Object.freeze([
  'a record is brought from a linked book',
  'a brought record comes with its proof',
  'a brought record is its body',
  'a record is brought once',
  'bringing needs the line keys of the book',
  'what is locked for another book is released only by its return',
  'a send is received once by whom it names',
  'what is received is what was sent',
  'a send locks what it names',
  'only a receive mints a foreign series',
  REGLA_DEL_CREADOR,
  REGLA_DEL_BLOQUEO,
  'only a receive hangs on the 4 of a brought record',
  'bring a record from another book',
  'send to another book',
  'receive from another book',
  'open a private book here',
  'this book hangs from',
  'withdraw a link',
]);

const P = PLANTILLAS_DEL_PUENTE;
const L_ = ENLACES;
const hexDe = (t) => Array.from(new TextEncoder().encode(t), (b) => b.toString(16).padStart(2, '0')).join('');
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

/** El enlace L anota una clave para el nivel N: uno de sus pares [nivel, clave] (dos ocupantes) dice ese nivel. */
const anotaNivel = (L, N) => Array.from({ length: 4 }, (_, p) => ['2', '1.1'].map((d) => '(count (payload(' + L + ')).' + d + '.' + p + ' > 1 and first (payload(' + L + ')).' + d + '.' + p + ' = ' + N + ')').join(' or ')).join(' or ');

/**
 * El enlace L no anota para el nivel N otra clave que K: cada par suyo que dice ese nivel lleva esa clave (si no anota
 * ninguno para ese nivel, vale). Sin nivel (N vacío) no vale.
 */
const soloEsaClave = (L, N, K) => Array.from({ length: 4 }, (_, p) => ['2', '1.1'].map((d) => '(first (payload(' + L + ')).' + d + '.' + p + ' != ' + N + ' or last (payload(' + L + ')).' + d + '.' + p + ' = ' + K + ')').join(' and ')).join(' and ');

/** Lo que cuelga de un enlace L y lo retira: un «withdraw a link» de su mismo autor (src/contrato.js lo lee igual). */
export const RETIRAR_ENLACE = 'withdraw a link';
const noRetirado = (L) => 'count ((down ' + L + ') where "' + RETIRAR_ENLACE + '" in (payload(it)).4 and first it.3 = first ' + L + '.3) = 0';

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
 * dueño (el autor del génesis), que nombra el libro de origen (1.0), es el último de los suyos y no está retirado. El
 * último (PH4, arreglos del puente): ningún otro enlace del mismo autor para ese libro, de cualquiera de los dos tipos,
 * con instante igual o posterior, en el mismo elemento ni en el 9.5 del génesis. El mismo elemento: para un «open a
 * private book here» (en el 9.1 de su elemento), lo que cuelga de ese elemento; para un «this book hangs from» (en el 9.5
 * del génesis), el 9.1 del génesis. Un enlace de otro elemento no lo retira (no se recorre el libro). Retirado: de él
 * cuelga un «withdraw a link» de su autor. A igualdad de instante, ninguno de los dos vale (el BQL mínimo no ordena textos).
 */
export function formulaDeEnlazado() {
  return '=' + noTraer + ' or first ev.6.5 = first before.5 and nth 1 ev.6.5 = "' + ANCLA_DE_LO_TRAIDO + '" and ' + enlaceQueCuenta(ENLACE, B);
}

/**
 * ¿Cuenta el enlace L (una expresión de un registro) para el libro B? El predicado de traer y, desde la segunda vuelta,
 * también el de enviar. L es un registro de este libro y:
 * - un «open a private book here» en el 9.1 de su elemento que nombra B, **del dueño** (el autor del génesis) o **de
 *   quien creó B** (VG 17-11): no es el dueño, lleva en su 5 el génesis de B, que se vuelve a comprobar entero aquí
 *   (pruebaDelGenesis; también lo comprueba al escribirlo «who created a book links it with its genesis», que es suelo), y
 *   su elemento es suyo;
 * - o un «this book hangs from» del dueño en el 9.5 del génesis que nombra B;
 * y es el último de su autor (ningún enlace suyo para B, de cualquiera de los dos tipos, igual o posterior, en el mismo
 * elemento ni en el 9.5 del génesis: PH4) y no está retirado. A igualdad de instante, ninguno de los dos vale.
 */
export function enlaceQueCuenta(L, B_) {
  const G = '(first before.5)';
  const sinPosterior = (lista) => 'count ((' + lista + ') where ' + esEnlace('it') + ' and ' + libroEs('it', B_) + ' and first it.3 = first ' + L + '.3 and it != ' + L + ' and ' + t('it') + ' >= ' + t(L) + ') = 0';
  const delDueno = 'first ' + L + '.3 = first ' + G + '.3';
  // La prueba del génesis se vuelve a mirar al consumir el enlace (revisión automática, 17-11): no se fía de que la regla
  // del creador rigiera cuando se escribió (un libro que la recibe después por un cambio, o cualquier otro camino).
  const deQuienLoCreo = 'count (payload(' + L + ')).' + GENESIS_EN + ' > 0 and first (up ' + L + ').3 = first ' + L + '.3 and ' + pruebaDelGenesis(L);
  // RP10 (tercera tanda): nada más allá del cuarto par [nivel, clave] (las reglas miran los pares 0 a 3).
  const cuatroPares = (d) => Array.from({ length: 6 }, (_, i) => 'count (payload(' + L + ')).' + d + '.' + (4 + i) + ' = 0').join(' and ');
  return 'count ' + L + '.5 > 0'
    + ' and ("' + L_.abrir + '" in (payload(' + L + ')).4 and ' + cuatroPares('2') + ' and (' + delDueno + ' or ' + deQuienLoCreo + ') and nth 1 ' + L + '.6.5 = "9100000000" and first (payload(' + L + ')).1.0.0 = ' + B_
    + ' and ' + sinPosterior('down (up ' + L + ')')
    + ' or "' + L_.cuelga + '" in (payload(' + L + ')).4 and ' + cuatroPares('1.1') + ' and ' + delDueno + ' and first ' + L + '.6.5 = first before.5 and nth 1 ' + L + '.6.5 = "9500000000" and first (payload(' + L + ')).1.0 = ' + B_
    + ' and ' + sinPosterior(G + '.9.1') + ')'
    + ' and ' + sinPosterior(G + '.9.5') + ' and ' + noRetirado(L);
}

/** El nivel de la primera cabecera del sello que trae un «bring a record from another book» (su eslabón 0). */
const NIVEL_DEL_ESLABON_0 = (p = POSICIONES_DEL_SELLO) => '(first ' + SELLO + '.' + p.cadena + '.0.' + p.eslabon.nivel + ')';

/**
 * «bringing needs the line keys of the book» (PH1, arreglos del puente): el enlace (si lo es) anota una clave para el
 * nivel de la primera cabecera de la prueba (su eslabón 0, la única cuyo libro se mira); sin ella no hay con qué
 * comprobar que esa cabecera la firmó el otro libro. Y (RP7) ese nivel es el más bajo que el enlace anota: la prueba
 * empieza en la casa del libro; una sola cabecera de un sellador de arriba no basta si el enlace anota la casa.
 */
export function formulaDeConClaves() {
  const L = ENLACE;
  return '=' + noTraer + ' or not (count ' + L + '.5 > 0 and ' + esEnlace(L) + ') or (' + anotaNivel(L, NIVEL_DEL_ESLABON_0()) + ') and ' + nivelMasBajo(L, NIVEL_DEL_ESLABON_0());
}

/**
 * RP7 (arreglos de la segunda revisión, segunda tanda): ningún par [nivel, clave] del enlace L dice un nivel por debajo de
 * N (`N` el nivel de la primera cabecera de la prueba): la prueba empieza en el nivel más bajo que el enlace anota, la casa
 * del libro, y no en un sellador de arriba. Los pares van en el 2 de «open a private book here» y en el 1.1 de «this book
 * hangs from».
 */
const nivelMasBajo = (L, N) => {
  const todos = (d) => Array.from({ length: 4 }, (_, p) => '(count (payload(' + L + ')).' + d + '.' + p + ' = 0 or first (payload(' + L + ')).' + d + '.' + p + ' >= ' + N + ')').join(' and ');
  return '("' + L_.abrir + '" in (payload(' + L + ')).4 and ' + todos('2') + ' or "' + L_.cuelga + '" in (payload(' + L + ')).4 and ' + todos('1.1') + ')';
};

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
 *
 * Y las de abajo (PH1, arreglos del puente): el eslabón 0, la única cabecera cuyo libro se mira, lo firma una clave que
 * el enlace anota para su nivel (sin clave anotada para ese nivel, no se trae); cada eslabón entre el 0 y el j, si el
 * enlace anota claves para su nivel, lo firma esa clave (`intermedios: false` deja solo el 0 y el j: para medir).
 */
export function formulaDeLaPrueba(p = POSICIONES_DEL_SELLO, { intermedios = true } = {}) {
  const { en, E, c, eslabon } = piezasDelEslabon(SELLO, R(0), p);
  const capa = (k) => '(nth ' + k + ' epoch.7.6.1)';
  const exigido = (k) => '(nth ' + k + ' epoch.7.6.5)';
  const nivelDe = (j) => '(first ' + E(j) + '.' + p.eslabon.nivel + ')';
  const gradoDe = (j) => '(nth ' + p.enElNivel.grado + ' ' + E(j) + '.' + p.eslabon.nivel + ')';
  const llega = (k, j) => '(' + exigido(k) + ' = 0 or (' + Array.from({ length: GRADOS_DE_LA_FORMULA - 1 }, (_, d) => gradoDe(j) + ' in ' + (d === 0 ? exigido(k) : '(' + exigido(k) + ' + 1'.repeat(d) + ')')).join(' or ') + ') and ' + gradoDe(j) + ' < count epoch.7.6.4)';
  const niveles = (j) => Array.from({ length: CAPAS_DE_LA_FORMULA }, (_, k) => '(' + capa(k) + ' in ' + nivelDe(j) + ' and ' + capa(k) + ' >= first epoch.8.9.2 and ' + llega(k, j) + ' and (' + claveEnNivel(ENLACE, capa(k), 'first ' + c(j, 'clave')) + '))').join(' or ');
  // La firma de la línea en cada eslabón por debajo del que llega: el 0, con la clave de su nivel; los demás, si el enlace la anota.
  const deLaLinea = (j) => (j === 0 ? ' and (' + claveEnNivel(ENLACE, nivelDe(0), 'first ' + c(0, 'clave')) + ')' : intermedios ? ' and ' + soloEsaClave(ENLACE, nivelDe(j), 'first ' + c(j, 'clave')) : '');
  let cadena = '';
  for (let j = ESLABONES_DE_LA_FORMULA - 1; j >= 0; j--) cadena = eslabon(j) + deLaLinea(j) + ' and ((' + niveles(j) + ')' + (cadena ? ' or ' + cadena : '') + ')';
  return '=' + noTraer + ' or "' + p.cascada + '" in ' + en('via') + ' and bytes(first ' + en('id') + ') = bytes(first ' + R(0) + ')'
    + ' and first ' + c(0, 'libro') + ' = ' + B + ' and ' + cadena;
}

/** «a record is brought once»: ningún registro traído antes (en el 9.8 del génesis) trae el mismo id. */
export function formulaDeUnaVez() {
  return '=' + noTraer + ' or count ((first before.5).9.8 where "' + P.traer + '" in (payload(it)).4 and first (payload(it)).1.1.0 = first ' + R(0) + ') = 0';
}

// ---------- enviar ----------

/**
 * Lo que lleva un «send to another book»: 1.0 el libro de destino; 1.1 la serie como la nombra este libro: 1.1.0 su clave,
 * 1.1.1 su emisor, 1.1.2 su denominación (si la tiene) y 1.1.3 el registro al que está atada en el libro donde nació; 1.2
 * cuánto; 1.3 a quién (su clave pública). El libro de destino no tiene esta serie: lee sus partes del registro traído.
 */
const SP = (k) => '(payload(ev)).1.1.' + k;
const noEnviar = 'not ("' + P.enviar + '" in ev.4)';
/** La familia que dice la clave de una serie (un texto «E:…»): su primera letra. */
const familiaDe = (clave) => 'text(slice(utf8(' + clave + '), 0, 1))';
const familiaEs = (texto, it) => '(' + ['E', 'P', 'R', 'T'].map((f) => texto + ' = "' + f + '" and ' + f + ' in ' + it + '.0.0.0').join(' or ') + ')';
/** ¿Nombra el emisor `e` (un texto) una serie forastera de `libro` («<libro>:…»)? Con 65 bytes a cero detrás, slice no se sale. */
const deLibro = (e, libro) => 'slice(cat(utf8(' + e + '), bytes("' + CEROS + '")), 0, 65) = cat(utf8(' + libro + '), bytes("3a"))';
const sinDosPuntos = (e) => 'hex(slice(cat(utf8(' + e + '), bytes("' + CEROS + '")), 64, 65)) != "3a"';

/** «only the families of the bridge cross»: la familia de la serie que se envía (la de su clave, 1.1.0) está en epoch.8.9.1 y es la de lo que bloquea. */
export function formulaDeFamilias() {
  const F = familiaDe('first ' + SP(0));
  return '=' + noEnviar + ' or ' + F + ' in epoch.8.9.1 and count (ev.1 where lock in it.4 and not ' + familiaEs(F, 'it') + ') = 0';
}

/**
 * «a send locks what it names»: se ancla en un enlace que cuenta para el libro de destino (1.0, otro libro): el mismo
 * predicado que traer (enlaceQueCuenta; encargo «el puente, segunda vuelta»: no se envía por un enlace por el que nunca
 * podrá traerse la vuelta, ni por uno retirado); bloquea una sola
 * vez, cuánto dice (1.2), con la salida en el enlace, de la serie cuyas partes dice (1.1.1 su emisor, 1.1.2 su
 * denominación), y nada más que su coste. Su registro atado (1.1.3): si la serie es de aquí, el suyo; si es forastera,
 * solo vuelve a su libro de origen (su emisor empieza por él) y es el registro que trajo aquí el registro al que está
 * atada (diseño §4.4: la vuelta).
 */
export function formulaDelEnvio() {
  const L = '(first ev.6.5)';
  const D = 'first (payload(ev)).1.0';
  const atado = 'not ' + forasteraMov('it') + ' and first ' + SP(3) + ' = first it.5'
    + ' or ' + forasteraMov('it') + ' and slice(utf8(first it.0.0.1), 0, 64) = utf8(' + D + ')'
    + ' and "' + P.traer + '" in (payload(first it.5)).4 and first (payload(first it.5)).1.0 = ' + D + ' and first ' + SP(3) + ' = first (payload(first it.5)).1.1.0';
  return '=' + noEnviar + ' or ' + enlaceQueCuenta(L, D) + ' and ' + D + ' != first before.5'
    + ' and count (ev.1 where lock in it.4) = 1 and count (ev.1 where mint in it.4 or transfer in it.4 or release in it.4) = 0'
    + ' and count (ev.1 where lock in it.4 and it.1 = first (payload(ev)).1.2 and first ev.6.5 in it.2 and first it.0.0.1 = first ' + SP(1) + ' and first it.0.0.2 = first ' + SP(2) + ' and (' + atado + ')) = 1';
}

/**
 * «what is locked for another book is released only by its return»: lo bloqueado con la salida en un enlace (un envío)
 * no se libera ni se transfiere con esa salida dentro del libro, salvo en un «receive from another book» (que lo mira
 * «what is received is what was sent»).
 */
export function formulaDeSoloLaVuelta() {
  return '=count (ev.1 where (release in it.4 or transfer in it.4) and count (it.2 where first ' + SALIDA + '.5 = ' + SALIDA + ' and ' + esEnlace(SALIDA) + ') > 0) = 0 or "' + P.recibir + '" in ev.4';
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
 * escribe declara en su alta la clave a la que va (1.3 del envío) y no se ha recibido antes. La vuelta (RP9) se recibe en
 * una o varias veces: otro recibir sobre ella vale si aún queda algo (lo ya liberado por los de antes no llega a su
 * cantidad) y lo ya liberado más lo que libera este no pasa de ella. La ida, una vez.
 */
export function formulaDeRecibir() {
  const E_ = 'first ' + SND('1.1.1');
  const esVuelta = 'slice(cat(utf8(' + E_ + '), bytes("' + CEROS + '")), 0, 65) = cat(utf8(first before.5), bytes("3a"))';
  return '=' + noRecibir + ' or "' + P.traer + '" in ' + BP + '.4 and "' + P.enviar + '" in ' + SND('4') + ' and first ' + SND('1.0') + ' = first before.5'
    + ' and first ' + SND('1.3') + ' in ((first (first ev.3).6).5 each 2)'
    + ' and (count ' + recibosDe(X) + ' = 0'
    + ' or ' + esVuelta + ' and ' + yaRecibido(X) + ' < first ' + SND('1.2') + ' and ' + yaRecibido(X) + ' + sum ((ev.1 where release in it.4) each 1) <= first ' + SND('1.2') + ')';
}

/**
 * RP9 (arreglos de la segunda revisión, segunda tanda): lo ya recibido de la vuelta traída X (una expresión): lo liberado
 * por los «receive from another book» que cuelgan de ella, en su 4 (RP11). Solo mira eso, no el libro.
 */
export const yaRecibido = (X_) => 'sum (((' + recibosDe(X_) + ' each 1) where release in it.4) each 1)';

/**
 * RP11 (arreglos de la segunda revisión, tercera tanda): los «receive from another book» de un registro traído X (una
 * expresión): lo que cuelga en su 4, la posición del recibir, y no todo lo que cuelga de X (lo que otros cuelguen en
 * otras posiciones no cuesta nada). En ese 4 solo entra un recibir («only a receive hangs on the 4 of a brought record»).
 */
const recibosDe = (X_) => '((' + X_ + '.4) where first it.5 = it and "' + P.recibir + '" in (payload(it)).4)';

/**
 * «only a receive hangs on the 4 of a brought record» (RP11): en el 4 de un «bring a record from another book», donde se
 * ancla su recibir, no se escribe otra cosa. Así lo ya recibido y el «una vez» se leen ahí sin que nadie los encarezca.
 */
export function formulaDelCuatroDelTraido() {
  return '=not ("' + P.traer + '" in (payload(first ev.6.5)).4 and nth 1 ev.6.5 = "4000000000") or "' + P.recibir + '" in (payload(ev)).4';
}

/** El nombre de esa regla (RP11). */
export const REGLA_DEL_CUATRO = 'only a receive hangs on the 4 of a brought record';

/**
 * «what is received is what was sent»: la familia (la de la clave de la serie) cruza aquí (epoch.8.9.1). Si el emisor que
 * dice el envío es «<este libro>:<emisor>» (la vuelta; encargo «el puente, segunda vuelta»), saca del fondo de la serie
 * de aquí de ese emisor, denominación y registro atado, el libro de origen y el autor del enlace por el que se trajo:
 * transferencias desde quien bloqueó hacia quien recibe y liberaciones de quien recibe, con la salida en un enlace de ese
 * fondo, que liberan cuánto se envió y nada más (ver dentro); si el
 * emisor es de allí (sin «:»), acuña una vez, cuánto se envió, para quien recibe, la serie forastera: el emisor
 * «<origen>:<emisor>» y la misma denominación (su registro atado lo mira el requisito de E).
 */
export function formulaDeLoEnviado() {
  const q = 'first ' + SND('1.2');
  const F = familiaDe('first ' + SND('1.1.0'));
  const E_ = 'first ' + SND('1.1.1');
  // La vuelta (encargo «el puente, segunda vuelta», VG 17-11: bloquear con la salida en un enlace es consentir que se
  // libere según lo que vuelva): saca del FONDO de la serie, el libro de origen y el autor del enlace por el que se trajo
  // (Lb): lo bloqueado de esa serie con la salida en un enlace de ese autor a ese libro (también uno retirado). Cada
  // transferencia va desde quien bloqueó hacia quien recibe, con esa salida; cada liberación, de quien recibe, con esa
  // salida; lo liberado suma lo que vuelve, y el 1.1 dice cada bloqueo del que saca (RP6). El fondo de un enlace no sale
  // por el de otro autor ni por uno de otras claves (RP1).
  const A = 'first (first ' + BP + '.1.3).3';
  // RP1 (arreglos de la segunda revisión): el fondo tampoco cambia de claves. La salida ha de anotar, para el nivel de la
  // primera cabecera de la prueba con que se trajo la vuelta, la misma clave que firmó esa cabecera (la que «a brought
  // record comes with its proof» ya cotejó con el enlace por el que se trajo).
  const NK = clavePrimeraDeLoTraido(BP);
  const S = (v) => '(text(utf8(' + v + ')))';
  const deLaSerie = (m) => familiaEs(F, m) + ' and first ' + m + '.0.0.2 = first ' + SND('1.1.2') + ' and first ' + m + '.5 = first ' + SND('1.1.3')
    + ' and cat(utf8(first before.5), bytes("3a"), utf8(first ' + m + '.0.0.1)) = utf8(' + E_ + ')';
  // Un enlace del fondo: de este libro, al libro de origen, de ese autor y con esas claves. Se mira una vez por terna del
  // 1.1 (cinco como mucho), no por movimiento: cada movimiento ha de llevar la salida de una terna (ternasVerdaderas).
  const delFondo = (L) => 'first ' + L + '.5 = ' + L + ' and ' + libroEs(L, O) + ' and first ' + L + '.3 = ' + A + ' and (' + claveEnNivel(L, NK.nivel, NK.clave) + ')';
  const vuelta = deLibro(E_, 'first before.5')
    + ' and count (ev.1 where mint in it.4 or lock in it.4) = 0'
    + ' and count (ev.1 where (transfer in it.4 or release in it.4) and not (' + deLaSerie('it')
    + ' and (transfer in it.4 and it.3.1 = first ev.3 and it.3.0 != first ev.3 or release in it.4 and it.3.0 = first ev.3))) = 0'
    // RP9: se recibe en una o varias veces; esta libera algo y, con lo ya recibido, no pasa de lo que vuelve.
    + ' and sum ((ev.1 where release in it.4) each 1) > 0 and ' + yaRecibido(X) + ' + sum ((ev.1 where release in it.4) each 1) <= ' + q
    // El 1.1 dice de qué bloqueos saca y lo dice de verdad (RP6 y RP8).
    + ' and ' + ternasVerdaderas((Lk) => delFondo(S(Lk)));
  const ida = sinDosPuntos(E_) + ' and count (payload(ev)).1.1.0 = 0'
    + ' and count (ev.1 where release in it.4 or transfer in it.4 or lock in it.4) = 0 and count (ev.1 where mint in it.4) = 1'
    + ' and count (ev.1 where mint in it.4 and it.1 = ' + q + ' and it.3.1 = first ev.3 and ' + familiaEs(F, 'it')
    + ' and first it.0.0.2 = first ' + SND('1.1.2') + ' and utf8(first it.0.0.1) = cat(utf8(' + O + '), bytes("3a"), utf8(' + E_ + '))) = 1';
  return '=' + noRecibir + ' or ' + F + ' in epoch.8.9.1 and (' + vuelta + ' or ' + ida + ')';
}

/**
 * El nivel y la clave de la primera cabecera (el eslabón 0) de la prueba con que se trajo un registro, dado el payload
 * del «bring a record from another book» `BP` (una expresión): { nivel, clave }, dos expresiones.
 */
function clavePrimeraDeLoTraido(BP, p = POSICIONES_DEL_SELLO) {
  const E0 = '(first ' + BP + '.1.2).' + p.cadena + '.0';
  return { nivel: '(first ' + E0 + '.' + p.eslabon.nivel + ')', clave: '(first ' + E0 + '.' + p.eslabon.cabecera + '.' + p.cabeceraDeLote.clave + ')' };
}

/**
 * RP6 y RP8 (arreglos de la segunda revisión): el 1.1 de una vuelta dice la verdad. Cada terna [quién, enlace, cuánto]
 * lleva tres hojas, cuánto es positivo y su enlace es del fondo (`delFondo`, una función del enlace). Por cada terna:
 * lo transferido desde quién con esa salida suma lo que dicen las ternas de ese quién y esa salida (si quién no es el que
 * recibe); lo liberado con esa salida suma lo que dicen todas las ternas con esa salida; y lo transferido con esa salida
 * no pasa de lo liberado con ella (nada queda bloqueado con la salida en un enlace a nombre de quien recibe). Y nada queda
 * fuera de las ternas: cada transferencia es de un quién y una salida de una terna, y cada liberación, de una salida de
 * una terna. Cinco ternas como mucho (BLOQUEOS_DE_LA_VUELTA); las demás posiciones del 1.1, vacías.
 */
function ternasVerdaderas(delFondo) {
  const T = (k) => '(payload(ev)).1.1.' + k;
  const K = BLOQUEOS_DE_LA_VUELTA;
  // Lo que dicen las ternas que cumplen `cond(j)` (it es quién, it2 el enlace): la suma de su cuánto.
  const dicen = (cond) => Array.from({ length: K }, (_, j) => 'sum ((last ' + T(j) + ') where ' + cond(j) + ')').join(' + ');
  const suma = (cond) => 'sum ((ev.1 where ' + cond + ') each 1)';
  const porTerna = Array.from({ length: K }, (_, k) => {
    // Quién y enlace se leen una vez (cada where da el siguiente it: it quién, it2 el enlace, it3 cada movimiento).
    const conEllos = '(it = first ev.3 or ' + suma('transfer in it3.4 and it3.3.0 = it and it2 in it3.2') + ' = ' + dicen((j) => 'first ' + T(j) + ' = it and nth 1 ' + T(j) + ' = it2') + ')'
      + ' and ' + suma('transfer in it3.4 and it2 in it3.2') + ' <= ' + suma('release in it3.4 and it2 in it3.2')
      + ' and ' + suma('release in it3.4 and it2 in it3.2') + ' = ' + dicen((j) => 'nth 1 ' + T(j) + ' = it2');
    // Tres hojas, dicho sin escribir el número (A3: ninguna regla lleva un número que la época tenga): primera, segunda y última.
    return '(count ' + T(k) + ' = 0 or count ' + T(k) + ' = count (first ' + T(k) + ') + count (nth 1 ' + T(k) + ') + count (last ' + T(k) + ') and last ' + T(k) + ' > 0 and ' + delFondo('nth 1 ' + T(k))
      + ' and count ((first ' + T(k) + ') where count ((nth 1 ' + T(k) + ') where ' + conEllos + ') > 0) > 0)';
  }).join(' and ');
  const vacias = Array.from({ length: SITIOS_DEL_1_1 - K }, (_, i) => 'count ' + T(K + i) + ' = 0').join(' and ');
  const enAlguna = (cond) => '(' + Array.from({ length: K }, (_, k) => cond(k)).join(' or ') + ')';
  const fuera = 'count (ev.1 where transfer in it.4 and not ' + enAlguna((k) => 'first ' + T(k) + ' = it.3.0 and nth 1 ' + T(k) + ' in it.2')
    + ' or release in it.4 and not ' + enAlguna((k) => 'nth 1 ' + T(k) + ' in it.2') + ') = 0';
  return vacias + ' and ' + porTerna + ' and ' + fuera;
}

/**
 * «only a send locks for another book» (RP2): un registro que deja algo bloqueado con la salida en un enlace entre libros
 * («open a private book here» o «this book hangs from» de este libro), por un bloqueo o por una transferencia con salida,
 * es un «send to another book» (el bloqueo) o un «receive from another book» (la transferencia, que su regla obliga a
 * liberar en el mismo registro). El enlace en la salida se reconoce como en las demás reglas del puente.
 */
export function formulaDelBloqueo() {
  const S = '(text(utf8(it2)))';
  return '=count (ev.1 where (lock in it.4 or transfer in it.4) and count (it.2 where first ' + S + '.5 = ' + S + ' and ' + esEnlace(S) + ') > 0'
    + ' and not (lock in it.4 and "' + P.enviar + '" in (payload(ev)).4 or transfer in it.4 and "' + P.recibir + '" in (payload(ev)).4)) = 0';
}

/** «only a receive mints a foreign series»: nadie acuña una serie forastera fuera de un «receive from another book». */
export function formulaDeForastera() {
  return '=count (ev.1 where mint in it.4 and ' + forasteraMov('it') + ') = 0 or "' + P.recibir + '" in ev.4';
}

/**
 * «the tied record of E crossed before» (el requisito de E, si epoch.8.9.3 lo nombra para E): la serie forastera de E que
 * acuña un «receive from another book» está atada al registro traído (del libro de origen) del registro al que la E está
 * atada allí (1.1.3 del envío).
 */
export function formulaDelRequisitoDeE() {
  return '=' + noRecibir + ' or not ("' + REQUISITO_DE_E + '" in lookup(epoch.8.9.1, epoch.8.9.3, "E"))'
    + ' or count (ev.1 where mint in it.4 and ' + forasteraMov('it') + ' and not (count it.5 > 0 and "' + P.traer + '" in (payload(first it.5)).4'
    + ' and first (payload(first it.5)).1.0 = ' + O + ' and first (payload(first it.5)).1.1.0 = first ' + SND('1.1.3') + ')) = 0';
}

// ---------- el enlace de quien creó el libro ----------

/**
 * «who created a book links it with its genesis» (encargo «el puente, segunda vuelta», punto 2; VG 17-11): un «open a
 * private book here» que lleva en su 5 el génesis del libro que enlaza (1.0.0, B) lo prueba con él. El 5: 0 el autor del
 * génesis, 1 su instante, 2 su payload (su JSON canónico, un texto), 3 el id de su época (contexto.epoca), 4 la clave que
 * declara para su autor, 5 su firma, 6 cuántos registros de época escribe (contexto.epocaEscrita; 0 si no lo dice) y,
 * opcional, 7 un 1 si es de demostración. La regla:
 * 1. rehace el cuerpo canónico del génesis con esas piezas (sobre nulo, en la raíz, sin movimientos, su contexto con las
 *    claves, en el orden canónico: src/evento.js, cuerpo y canonico) y comprueba que su hash es B;
 * 2. comprueba que la firma vale con la clave que ese cuerpo declara;
 * 3. comprueba que esa clave es una de las que quien escribe el enlace tiene en su alta de este libro (la de su titular);
 * 4. comprueba que el instante del enlace no es anterior al del génesis;
 * y quien no es el dueño de este libro solo lo escribe sobre un elemento suyo. Sin el 5, nada que mirar.
 * Lo que no cabe: un génesis con campos propios en su contexto, o de demostración sin clave (no se rehace su cuerpo).
 */
export function formulaDelCreador() {
  return '=not ("' + L_.abrir + '" in (payload(ev)).4 and count (payload(ev)).' + GENESIS_EN + ' > 0)'
    + ' or (first ev.3 = first (first before.5).3 or first (first ev.6.5).3 = first ev.3) and ' + pruebaDelGenesis('ev');
}

/**
 * La prueba del génesis que lleva en su 5 el enlace X (una expresión de un registro: la candidata `ev` al escribirlo, o
 * el enlace que se consume al traer, enviar o recibir la vuelta: enlaceQueCuenta la vuelve a mirar entera, revisión
 * automática del 17-11, para no fiarse de que la regla rigiera cuando se escribió). Las piezas 1 a 4 de
 * formulaDelCreador; el libro es el que X nombra en su 1.0.0, quien enlaza su autor (X.3) y su instante el de X.
 */
export function pruebaDelGenesis(X) {
  const GP = '(payload(' + X + ')).' + GENESIS_EN;
  const g = (k) => 'first ' + GP + '.' + k;
  const libro = 'first (payload(' + X + ')).1.0.0';
  const pieza = (texto) => 'bytes("' + hexDe(texto) + '")';
  const demo = '(count ' + GP + '.7 > 0 and ' + g(7) + ' = 1)';
  const cuerpo = (conEscrita, conDemo) => 'hex(sha256(cat(' + [
    pieza('{"autor":'), 'json(' + g(0) + ')',
    pieza(',"contexto":{"claves":{'), 'json(' + g(0) + ')', pieza(':'), 'json(' + g(4) + ')', pieza('}'),
    ...(conDemo ? [pieza(',"demostracion":true')] : []),
    pieza(',"epoca":'), 'json(' + g(3) + ')',
    ...(conEscrita ? [pieza(',"epocaEscrita":'), 'json(' + g(6) + ')'] : []),
    pieza(',"genesis":true},"en":"0000000000","movimientos":[],"payload":'), 'utf8(' + g(2) + ')',
    pieza(',"sobre":null,"t":'), 'json(' + g(1) + ')', pieza('}'),
  ].join(', ') + '))) = ' + libro;
  const variantes = [[false, false], [true, false], [false, true], [true, true]].map(([e, d]) => '(' + g(6) + (e ? ' > 0' : ' = 0') + ' and ' + (d ? '' : 'not ') + demo + ' and ' + cuerpo(e, d) + ')').join(' or ');
  const ALTA = '(first (first ' + X + '.3).6)';
  const suyas = '((' + ALTA + '.5 where it != first ' + ALTA + '.5 and first it.3 = first ' + X + '.3) each 2)';
  return 'count ' + GP + '.0 = 1 and count ' + GP + '.1 = 1 and count ' + GP + '.2 = 1 and count ' + GP + '.3 = 1 and count ' + GP + '.4 = 1 and count ' + GP + '.5 = 1 and count ' + GP + '.6 = 1'
    + ' and (' + variantes + ')'
    + ' and signed(bytes(' + g(5) + '), bytes(' + libro + '), bytes(' + g(4) + '))'
    + ' and ' + g(4) + ' in ' + suyas
    + ' and (first ' + X + '.6).0.0 >= first (' + g(1) + ').0';
}

/**
 * El génesis `g` de un libro (un evento) como lo lleva el 5 de «open a private book here» para que lo enlace quien lo
 * creó (formulaDelCreador). null si no cabe: sin clave o sin firma, con movimientos, o con campos propios en su contexto.
 */
export function genesisComoDecupla(g) {
  const c = g?.contexto ?? {};
  const propios = Object.keys(c).filter((k) => !['genesis', 'epoca', 'epocaEscrita', 'demostracion', 'claves'].includes(k));
  const clave = c.claves?.[g?.autor];
  if (!g || g.sobre !== null || (g.en ?? '0000000000') !== '0000000000' || (g.movimientos ?? []).length || c.genesis !== true || propios.length) return null;
  if (typeof clave !== 'string' || Object.keys(c.claves).length !== 1 || typeof g.firma !== 'string' || typeof c.epoca !== 'string') return null;
  if (c.epocaEscrita !== undefined && !(Number.isInteger(c.epocaEscrita) && c.epocaEscrita > 0)) return null;
  if (c.demostracion !== undefined && c.demostracion !== true) return null;
  const d = [[g.autor], [g.t], [canonico(g.payload)], [c.epoca], [clave], [g.firma], [c.epocaEscrita ?? 0]];
  if (c.demostracion === true) d.push([1]);
  return d;
}

// ---------- la vuelta: de qué bloqueos saca ----------

/**
 * Las sentencias del 4 de «receive from another book» (encargo «el puente, segunda vuelta»): la ida acuña la serie
 * forastera (atada al registro traído de su registro atado, si se trajo; si no, sin él: lo para el requisito de E); la
 * vuelta, por cada bloqueo que nombra su 1.1 ([quién lo bloqueó, el enlace de su salida, cuánto saca]), transfiere desde
 * quien lo bloqueó hacia quien recibe con esa salida (si no es él mismo) y lo libera. Decide la regla, no la plantilla.
 */
export function sentenciasDeRecibir() {
  const S = (k) => '(payload(it)).1.1.6.1.' + k;
  const EMI = 'first ' + S('1.1');
  const vuelta = 'slice(cat(utf8(' + EMI + '), bytes("' + CEROS + '")), 0, 65) = cat(utf8(first before.5), bytes("3a"))';
  const traidoDelAtado = '((first before.5).9.8 where "' + P.traer + '" in (payload(it2)).4 and first (payload(it2)).1.0 = first (payload(it)).1.0 and first (payload(it2)).1.1.0 = first ' + S('1.3') + ')';
  const forastera = 'E.(text(cat(utf8(first (payload(it)).1.0), bytes("3a"), utf8(' + EMI + ')))).(first ' + S('1.2') + ')';
  const ida = 'not (' + vuelta + ') and count ' + traidoDelAtado + ' > 0 and mint first ' + S(2) + ' ' + forastera + '.(first ' + traidoDelAtado + ') to me'
    + ' or not (' + vuelta + ') and count ' + traidoDelAtado + ' = 0 and mint first ' + S(2) + ' ' + forastera + ' to me';
  const H = (k) => '(first memo.1.1.' + k + ')';
  const serie = (k) => '(first ((' + H(k) + '.1 where E in it2.0.0.0 and first it2.0.0.2 = first ' + S('1.2') + ' and first it2.0.5 = first ' + S('1.3')
    + ' and cat(utf8(first before.5), bytes("3a"), utf8(first it2.0.0.1)) = utf8(' + EMI + ')) each 0))';
  const sentencias = ['=' + ida];
  for (let k = 0; k < BLOQUEOS_DE_LA_VUELTA; k++) {
    const hay = vuelta + ' and count memo.1.1.' + k + ' = 3';
    sentencias.push('=' + hay + ' and ' + H(k) + ' != me and transfer (last memo.1.1.' + k + ') ' + serie(k) + ' from ' + H(k) + ' to me exit (nth 1 memo.1.1.' + k + ')');
    sentencias.push('=' + hay + ' and release (last memo.1.1.' + k + ') ' + serie(k) + ' from me exit (nth 1 memo.1.1.' + k + ')');
  }
  return sentencias;
}

/**
 * De qué bloqueos saca el próximo recibir de la vuelta traída `idTraido` (un «bring a record from another book» de un envío que vuelve) en
 * `eje`: el 1.1 de «receive from another book», [[quién lo bloqueó, el enlace de su salida, cuánto saca], …], el más
 * antiguo primero (por el primer envío que bloqueó con esa salida), hasta cubrir lo que queda (lo que vuelve menos lo ya
 * recibido por los recibir que cuelgan de ella: RP9) o el tope de un registro (BLOQUEOS_DE_LA_VUELTA): una vuelta grande
 * se recibe en varios registros, y esta ayuda da la parte siguiente; del fondo de la serie, el
 * libro de origen y el autor del enlace por el que se trajo (también los enlaces retirados de ese autor), cuyas salidas
 * anotan, para el nivel de la primera cabecera de la prueba, la clave que la firmó (RP1). null si no es
 * una vuelta, si ya se recibió entera o si el fondo está vacío. Es ayuda, no regla: la regla mira lo que nombra.
 */
export function bloqueosDeLaVuelta(eje, idTraido) {
  const r = eje?.obtener?.(idTraido);
  const p = r?.payload;
  if (!Array.isArray(p) || ![].concat(p[4] ?? []).includes(P.traer)) return null;
  const hoja = (x) => (Array.isArray(x) ? hoja(x[0]) : x);
  const origen = hoja(p[1]?.[0]);
  const enlace = eje.obtener(hoja(p[1]?.[3]));
  const envio = p[1]?.[1]?.[6];
  if (!enlace || !Array.isArray(envio) || !Array.isArray(envio[1])) return null;
  const emisor = hoja(envio[1]?.[1]?.[1]);
  const denominacion = hoja(envio[1]?.[1]?.[2]);
  const registro = hoja(envio[1]?.[1]?.[3]);
  let falta = hoja(envio[1]?.[2]);
  const accionesDe = (x) => [].concat(x?.payload?.[4] ?? []);
  // RP9: lo que queda es lo que vuelve menos lo ya liberado por los «receive from another book» que cuelgan de ella.
  for (const h of eje.sobre(idTraido, '4000000000')) {
    if (accionesDe(h).includes(P.recibir)) for (const m of h.movimientos ?? []) if (m.estado === 'liberacion') falta -= m.cantidad;
  }
  if (typeof emisor !== 'string' || !emisor.startsWith(eje.genesisId + ':') || !(falta > 0)) return null;
  const suyo = emisor.slice(eje.genesisId.length + 1);
  const libroDe = (l) => (accionesDe(l).includes(L_.abrir) ? hoja(l.payload?.[1]) : accionesDe(l).includes(L_.cuelga) ? hoja(l.payload?.[1]) : undefined);
  // RP1: y que su salida anote, para el nivel de la primera cabecera de la prueba, la clave que la firmó (como la regla).
  const q = POSICIONES_DEL_SELLO;
  const eslabon0 = p[1]?.[2]?.[Number(q.cadena)]?.[0];
  const nivel = hoja(eslabon0?.[Number(q.eslabon.nivel)]);
  const clave = hoja(eslabon0?.[Number(q.eslabon.cabecera)]?.[Number(q.cabeceraDeLote.clave)]);
  const paresDe = (l) => (accionesDe(l).includes(L_.abrir) ? l.payload?.[2] : l.payload?.[1]?.[1]);
  const conLaClave = (l) => (Array.isArray(paresDe(l)) ? paresDe(l) : []).some((x) => Array.isArray(x) && x[0] === nivel && x[1] === clave);
  const delFondo = (l) => l && l.autor === enlace.autor && libroDe(l) === origen && conLaClave(l);
  const vistos = new Map();
  let serie = null;
  for (const id of eje.orden) {
    const ev = eje.obtener(id);
    if (!accionesDe(ev).includes(P.enviar)) continue;
    for (const m of ev.movimientos ?? []) {
      if (m.token !== 'E' || m.estado !== 'bloqueo' || m.emisor !== suyo || (m.denominacion ?? undefined) !== (denominacion ?? undefined) || m.registro !== registro) continue;
      if (!delFondo(eje.obtener(m.salida))) continue;
      serie ??= claveToken(m);
      const llave = m.de + '\u0000' + m.salida;
      if (!vistos.has(llave)) vistos.set(llave, [m.de, m.salida]);
    }
  }
  const bloqueos = [];
  for (const [quien, salida] of vistos.values()) {
    if (falta <= 0 || bloqueos.length === BLOQUEOS_DE_LA_VUELTA) break;
    const hay = eje.bloqueado(quien, serie, salida);
    if (!(hay > 0)) continue;
    const saca = Math.min(hay, falta);
    bloqueos.push([quien, salida, saca]);
    falta -= saca;
  }
  return bloqueos.length ? bloqueos : null;
}

// ---------- declarar un saldo ----------

/**
 * Lo bloqueado de una entrada de la cartera (`entrada`, una expresión) con la salida en un enlace: lo que está en manos de
 * otro libro (un envío). Se reconoce el enlace en la salida como en «what is locked for another book is released only by
 * its return». `it` es cada bloqueo de la entrada (su 0, la salida; su 1, cuánto).
 */
export const bloqueadoParaOtroLibro = (entrada, it = 'it') => '((' + entrada + ').2 where first (text(utf8(first ' + it + '.0))).5 = (text(utf8(first ' + it + '.0))) and ' + esEnlace('(text(utf8(first ' + it + '.0)))') + ')';

/**
 * «a declared balance is true»: quien la escribe tiene, de la serie que dice (1.0), al menos cuánto dice (1.1): lo
 * disponible y lo bloqueado, menos lo bloqueado con la salida en un enlace (PH2, arreglos del puente: eso ya vive en el
 * otro libro como serie forastera y se declara allí), y después de los movimientos del propio registro (PH3: lo que el
 * propio registro quema o pasa a otro de esa serie, como la T de su coste).
 */
export function formulaDelSaldo() {
  const S = 'first (payload(ev)).1.0';
  const entrada = '(first ev.3).1.(' + S + ')';
  const sale = '(moves ev where (burn in it.4 or transfer in it.4) and first it.0 = ' + S + ' and it.3.0 = first ev.3 and it.3.1 != first ev.3)';
  return '=not ("' + P.declarar + '" in ev.4) or first (payload(ev)).1.1 + sum (' + bloqueadoParaOtroLibro(entrada) + ' each 1) + sum (' + sale + ' each 1)'
    + ' <= sum (' + entrada + ' each 1) + sum ((' + entrada + ').2 each 1)';
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
  'who-created-a-book-links-it-with-its-genesis.json': formulaDelCreador,
  'only-a-send-locks-for-another-book.json': formulaDelBloqueo,
  'only-a-receive-hangs-on-the-4-of-a-brought-record.json': formulaDelCuatroDelTraido,
});

/** Cada archivo de plantillas/ con las sentencias de su 4 (lo que mueve) que salen de aquí. */
export const SENTENCIAS = Object.freeze({
  'receive-from-another-book.json': sentenciasDeRecibir,
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

/** ¿Es `texto` el JSON canónico de un solo valor (src/evento.js, canonico)? */
function esCanonicoDeUnValor(texto) {
  if (typeof texto !== 'string') return false;
  try {
    return canonico(JSON.parse(texto)) === texto;
  } catch {
    return false;
  }
}

/**
 * Lo traído, leído (diseño §4.1: quién lo escribió allí, qué decía, cuándo quedó en firme): el registro «bring a record
 * from another book» `id` de `eje` → { libro, id, autor, t, payload, contexto, movimientos, fiable, causa, firme, enlace,
 * origen, quien, grado, cuenta, delDueno, nivelMasBajo } o null (quien, grado, cuenta y delDueno: por qué enlace vino,
 * porQueEnlace; nivelMasBajo: el nivel más bajo que anota ese enlace, donde empieza la prueba, RP7). `firme` es la hora (ISO) de la cabecera del primer eslabón que dice un nivel a la altura del que pide
 * la época (epoch.8.9.2), la que da por buena la regla; `origen`, el «anchor origin» que anota el enlace (null: «sin
 * comprobar el origen»).
 *
 * El contexto y los movimientos viajan como texto (1.1.7 y 1.1.5) y «a brought record is its body» los mete tal cual en
 * el cuerpo (PH6, arreglos del puente): si uno de los dos no es el JSON canónico de un solo valor (rehecho con
 * canonico(JSON.parse(texto)) no da el mismo texto), los mismos bytes podrían partirse de otra forma con el mismo id. Lo
 * traído se lee entonces «no fiable» (`fiable` false y `causa`, en llano) y no se enseña ni su contexto ni sus
 * movimientos (null). Ninguna regla los lee.
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
  const malos = [['el contexto', reg[7]], ['los movimientos', reg[5]]].filter(([, x]) => !esCanonicoDeUnValor(hoja(x))).map(([que]) => que);
  // La hora de la cabecera, en segundos: solo es una fecha si es finita y cabe en una fecha de JS (|ms| <= 8.64e15). Si la
  // prueba trae otra cosa, lo traído se lee «no fiable» (revisión del carril de la carta, 17-11).
  const horaMala = hora !== undefined && !(Number.isFinite(hora) && Math.abs(hora * 1000) <= 8.64e15);
  const fiable = malos.length === 0 && !horaMala;
  return {
    libro: hoja(p[1]?.[0]), id: hoja(reg[0]), autor: hoja(reg[1]), t: hoja(reg[4]), payload: reg[6] ?? null,
    contexto: fiable ? JSON.parse(hoja(reg[7])) : null, movimientos: fiable ? JSON.parse(hoja(reg[5])) : null,
    fiable,
    causa: fiable ? null : malos.length
      ? 'no fiable: ' + malos.join(' y ') + ' que trae no ' + (malos.length > 1 ? 'son' : 'es') + ' el JSON canónico de un solo valor, así que el mismo id podría leerse partido de otra forma; no se enseña' + (malos.length > 1 ? 'n' : '')
      : 'no fiable: la hora de la cabecera de su prueba no es una fecha; no se enseñan ni su contexto ni sus movimientos',
    firme: !horaMala && Number.isFinite(hora) ? new Date(hora * 1000).toISOString() : null,
    enlace: enlace?.id ?? null, origen: typeof origen === 'string' ? origen : null,
    ...porQueEnlace(eje, enlace?.id),
    nivelMasBajo: nivelMasBajoDe(enlace),
  };
}

/**
 * Por qué enlace vino lo traído (encargo «el puente, segunda vuelta», límites (b) y (c)): quién escribió el enlace
 * (`quien`), su grado («del dueño», «de quien creó el libro, avalado por el dueño» o «de quien creó el libro»), si cuenta
 * según la lectura (`cuenta`: con un enlace del dueño a ese libro con otras claves, el de otra persona no cuenta) y el del
 * dueño, si lo hay (`delDueno`). src/contrato.js, gradoDelEnlace.
 */
function porQueEnlace(eje, id) {
  const g = id ? gradoDelEnlace(eje, id) : null;
  return { quien: g?.quien ?? null, grado: g?.grado ?? null, cuenta: g?.cuenta === true, delDueno: g?.delDueno ?? null };
}

/**
 * RP7: el nivel más bajo que anota un enlace (sus pares [nivel, clave]: el 2 de «open a private book here», el 1.1 de
 * «this book hangs from»), donde ha de empezar toda prueba de lo que se trae por él; null si no anota ninguno. Si es el
 * de un sellador de arriba (el libro no tiene línea propia), quien trae por él se fía de ese sellador.
 */
export function nivelMasBajoDe(enlace) {
  const a = [].concat(enlace?.payload?.[4] ?? []);
  const pares = a.includes(L_.abrir) ? enlace.payload[2] : a.includes(L_.cuelga) ? enlace.payload[1]?.[1] : null;
  // RP10: un enlace con más de cuatro pares no cuenta para el puente (como la regla): sin nivel.
  if (Array.isArray(pares) && pares.length > 4) return null;
  const niveles = (Array.isArray(pares) ? pares : []).filter((x) => Array.isArray(x) && x.length === 2 && typeof x[0] === 'number').map((x) => x[0]);
  return niveles.length ? Math.min(...niveles) : null;
}

// ---------- de dónde salen los sellos (encargo «carta: irme con lo mío y el puente», sección 0) ----------
//
// Traer pide la prueba de sello del registro en su libro y las claves de línea de ese libro. Las dos están ya en el libro
// de origen, sin pedir nada al nodo: la prueba es la décupla de la vía «cascada» que guarda eje.sello(id) (la que llega
// por la sincronía de quien guarda y sella ese libro, src/sincronia.js #sellar, y la que leen «sealed» y «firm»), la misma
// forma que pide «a brought record comes with its proof»; las claves de línea, las que anota su cuenta raíz en «exterior
// settings» («line keys»: src/exterior.js ajustesDelEje), las mismas con que «firm» comprueba sus sellos. Un libro sin
// quien lo selle (sin «seal url», o de demostración) no tiene ni una ni otra: lo que pide su sello espera.

/** Las claves de línea de un libro, pares [nivel, clave]: las de «exterior settings» de su cuenta raíz ([] si no anota ninguna). */
export function clavesDeLineaDe(eje) {
  try {
    return ajustesDelEje(eje).lineas;
  } catch {
    return [];
  }
}

/** Los pares [nivel, clave] que anota un enlace (el 2 de «open a private book here», el 1.1 de «this book hangs from»), o []. */
export function paresDelEnlace(enlace) {
  const a = [].concat(enlace?.payload?.[4] ?? []);
  const pares = a.includes(L_.abrir) ? enlace.payload[2] : a.includes(L_.cuelga) ? enlace.payload[1]?.[1] : null;
  return Array.isArray(pares) ? pares.filter((x) => Array.isArray(x) && x.length === 2 && typeof x[0] === 'number' && typeof x[1] === 'string') : [];
}

/**
 * ¿Tiene quien lo selle el libro `eje`? null si sí; si no, por qué: 'demostracion' (un libro de demostración no se sella),
 * 'sinSellador' (su cuenta raíz no dice «seal url»: nadie lo sella) o 'sinClaves' (no anota claves de línea: nada suyo se
 * puede comprobar en otro libro).
 */
export function sinSello(eje) {
  const genesis = eje?.obtener?.(eje?.genesisId);
  if (genesis?.contexto?.demostracion === true) return 'demostracion';
  let sello = null;
  try {
    sello = ajustesDelEje(eje).sello;
  } catch {
    sello = null;
  }
  if (!sello) return 'sinSellador';
  return clavesDeLineaDe(eje).length ? null : 'sinClaves';
}

/**
 * La prueba de sello con que se trae el registro `id` del libro `origen` a otro: la décupla de la vía «cascada» que el
 * origen ya tiene de ese registro (eje.sello(id).decupla), si sus eslabones valen seguidos desde abajo con las claves
 * `lineas` (las del enlace por el que se trae; por defecto, las del origen: clavesDeLineaDe), con el libro de origen en la
 * primera cabecera (sello.eslabonesValidos, como «firm») y uno de ellos dice un nivel a la altura de `nivel` (epoch.8.9.2
 * del libro de destino). No mira el grado de cada eslabón (epoch.7.6.5): eso lo dice la regla al traer.
 * → { prueba: la décupla (una copia, para el payload) | null, falta: null | 'sello' | 'claves' | 'nivel' }.
 */
export function pruebaParaTraer(origen, id, { lineas = clavesDeLineaDe(origen), nivel = 4 } = {}) {
  const decupla = origen?.sello?.(id)?.decupla;
  const q = POSICIONES_DEL_SELLO;
  if (!Array.isArray(decupla) || ![].concat(decupla[Number(q.via)]).includes(q.cascada)) return { prueba: null, falta: 'sello' };
  if (!Array.isArray(lineas) || !lineas.length) return { prueba: null, falta: 'claves' };
  const validos = eslabonesValidos(decupla, id, { libro: origen.genesisId, lineas });
  const cadena = Array.isArray(decupla[Number(q.cadena)]) ? decupla[Number(q.cadena)] : [];
  const hoja = (x) => (Array.isArray(x) ? hoja(x[0]) : x);
  const llega = cadena.slice(0, validos).some((e) => Array.isArray(e) && hoja(e[Number(q.eslabon.nivel)]) >= nivel);
  return llega ? { prueba: JSON.parse(JSON.stringify(decupla)), falta: null } : { prueba: null, falta: validos ? 'nivel' : 'claves' };
}

/**
 * Cuánto queda por recibir de un envío traído `idTraido` (un «bring a record from another book» de un «send to another
 * book»): `envia`, cuánto dice el envío; `recibido`, lo ya liberado (la vuelta) o acuñado (la ida) por los «receive from
 * another book» que cuelgan de su 4 (RP9, RP11); `queda`, la diferencia; `vuelta`, si vuelve a este libro (el emisor de la
 * serie es «<este libro>:…»). null si no es un envío traído.
 */
export function porRecibir(eje, idTraido) {
  const p = eje?.obtener?.(idTraido)?.payload;
  if (!Array.isArray(p) || ![].concat(p[4] ?? []).includes(P.traer)) return null;
  const hoja = (x) => (Array.isArray(x) ? hoja(x[0]) : x);
  const envio = p[1]?.[1]?.[6];
  if (!Array.isArray(envio) || ![].concat(envio[4] ?? []).includes(P.enviar)) return null;
  const envia = hoja(envio[1]?.[2]);
  const emisor = hoja(envio[1]?.[1]?.[1]);
  const vuelta = typeof emisor === 'string' && emisor.startsWith(eje.genesisId + ':');
  const cuanto = Number(envia) || 0;
  const recibos = eje.sobre(idTraido, '4000000000').filter((h) => [].concat(h.payload?.[4] ?? []).includes(P.recibir));
  // La ida se recibe una vez y entera; la vuelta, en partes: lo liberado por cada recibir (como bloqueosDeLaVuelta).
  const recibido = vuelta
    ? recibos.reduce((s, h) => s + (h.movimientos ?? []).filter((m) => m.estado === 'liberacion').reduce((x, m) => x + m.cantidad, 0), 0)
    : recibos.length ? cuanto : 0;
  return { envia: cuanto, recibido, queda: Math.max(0, cuanto - recibido), vuelta };
}

// ---------- la salida con saldos (tramo 4, parte B; agram-equipo/DISENO_TRAMO_4.md §4; docs/notas/PUENTE.md §11) ----------

/** El criterio de cierre que escribe «declare a balance» (su 2): aquí solo sirve para medir cuánto ocupa el registro. */
const CIERRE_DE_LA_DECLARACION = 'all announced movements happened';

/** El payload que escribe «declare a balance» (su 9 y sus parámetros), para medir lo que cuesta escribirlo. */
const payloadDeDeclaracion = (quien, serie, cuanto) => ['declare a balance: ' + quien + ' declares having ' + cuanto + ' of ' + serie, [[serie], [cuanto]], [CIERRE_DE_LA_DECLARACION], [quien], [P.declarar]];

/** ¿Es el registro `id` de `eje` un enlace entre libros? Lo mismo que mira la regla en la salida de un bloqueo. */
const esEnlaceDe = (eje, id) => {
  const a = [].concat(eje.obtener(id)?.payload?.[4] ?? []);
  return a.includes(L_.abrir) || a.includes(L_.cuelga);
};

/**
 * Cuánto puede declarar hoy `identidad` en `eje` de cada serie que tiene: exactamente lo que acepta «a declared balance is
 * true» (lo disponible más lo bloqueado, menos lo bloqueado con la salida en un enlace, y nunca más de lo que queda tras el
 * propio registro, que quema la T de su coste). → [{ serie, familia, disponible, bloqueado, enOtroLibro, cantidad,
 * declarable, causa }], en el orden de su cartera: `cantidad`, lo que se declara (0 si no es declarable); `enOtroLibro`, lo
 * bloqueado con la salida en un enlace (vive en el otro libro y se declara allí); `causa`, en llano, por qué no es
 * declarable (null si lo es). Las series de las que no tiene nada no salen, salvo la T, que sale para decir por qué no se
 * lleva (la de una persona no se guarda: se gasta al escribir, y su saldo es 0).
 */
export function saldosDe(eje, identidad) {
  const bloqueos = eje?.bloqueos?.(identidad) ?? [];
  const claves = new Set([...(eje?.libro?.disponibles?.(identidad) ?? [])].map(([k]) => k));
  for (const b of bloqueos) claves.add(b.clave);
  const saldos = [];
  for (const serie of claves) {
    const familia = serie.slice(0, serie.indexOf(':'));
    const disponible = eje.saldo(identidad, serie);
    const bloqueado = eje.bloqueado(identidad, serie);
    const enOtroLibro = bloqueos.filter((b) => b.clave === serie && esEnlaceDe(eje, b.salida)).reduce((s, b) => s + b.cantidad, 0);
    if (disponible + bloqueado <= 0 && familia !== 'T') continue;
    let cantidad = disponible + bloqueado - enOtroLibro;
    // Lo que el propio registro quema de esta serie (PH3): la T de su coste, si es de esta escala.
    const coste = familia === 'T' && cantidad > 0 ? quemaDelCoste(identidad, payloadDeDeclaracion(identidad, serie, cantidad), 'minuto', { eje }) : null;
    if (coste && 'T:' + coste.escala === serie) cantidad -= coste.cantidad;
    const declarable = cantidad > 0;
    const causa = declarable ? null
      : familia === 'T' ? 'la T de una persona no se guarda: es lo que puede gastar cada día al escribir, y la declaración misma la gasta; aquí no le queda T que declarar'
        : 'todo lo que tiene de esta serie está bloqueado para otro libro (un envío): vive allí y se declara allí';
    saldos.push({ serie, familia, disponible, bloqueado, enOtroLibro, cantidad: declarable ? cantidad : 0, declarable, causa });
  }
  return saldos;
}

/** Lo que espera un paso de la salida, en llano. */
export const ESPERAS_DE_LA_SALIDA = Object.freeze({
  sello: 'espera el sello del libro viejo: la declaración vale fuera cuando lleva la prueba de quien guarda y sella ese libro; mientras, tienes tu registro firmado y tu copia',
  claves: 'espera las claves de línea del libro viejo (la de su casa incluida): sin ellas no se trae nada',
  declaracion: 'espera a que firmes la declaración en el libro viejo',
  genesis: 'espera a que abras el libro nuevo',
  cuelga: 'espera a que escribas en el libro nuevo de qué libro cuelga',
});

/**
 * Los registros de la salida de `identidad` del libro `eje`, en orden y con a qué libro va cada uno (DISENO_TRAMO_4.md §4,
 * pasos 1, 3, 4 y 5). No firma ni escribe nada: devuelve datos, y se vuelve a pedir tras cada paso (lee lo ya hecho).
 *
 * `opciones`: `punto`, la época con que nace el libro nuevo ('vigente', por defecto; 'antes', la de antes del último cambio
 * en vigor; o el número de una versión de eje.versiones()); `claves`, las claves de línea del libro viejo ([[nivel, clave],
 * …], la de su casa incluida); `nuevo`, el eje del libro nuevo si ya está abierto; `sellos`, la prueba de sello de cada
 * declaración en el libro viejo ({ id: décupla } o un Map); `foco`, el del libro nuevo; `elemento`, el elemento del libro
 * viejo del que cuelga el nuevo (por defecto, el alta de `identidad` allí, donde van sus declaraciones).
 *
 * → { libro, identidad, epoca: { punto, version, id, registro }, pasos: [{ n, libro: 'viejo' | 'nuevo', que: 'declarar' |
 * 'genesis' | 'cuelga' | 'traer', plantilla, params, quien, serie?, estado: 'hecho' | 'listo' | 'espera', id?, espera? }],
 * noSeLleva: [{ serie, cantidad, causa }], esperan: [textos], aparte }. Un paso «listo» se firma tal cual: `plantilla` y
 * `params` para acciones.transaccion en su libro; el génesis, `params` para Eje.genesis con la época del viejo por
 * referencia (como carta/libros.js, abrirLibroPrivado), y quien lo firma añade su clave y su instante. `id`, el del
 * registro ya escrito; `espera`, lo que falta. `epoca.registro` es el punto: el registro que puso en vigor esa versión.
 */
export function planDeSalida(eje, identidad, opciones = {}) {
  const alta = eje?.alta?.(identidad);
  if (!alta) throw new TypeError('planDeSalida: ' + identidad + ' no tiene alta en este libro');
  const { punto = 'vigente', claves = 0, nuevo = null, sellos = {}, foco = ['lo mío, de ' + String(eje.genesisId).slice(0, 8)], elemento = alta.id } = opciones;
  const versiones = eje.versiones();
  const k = punto === 'vigente' ? versiones.length - 1 : punto === 'antes' ? versiones.length - 2 : punto;
  if (!Number.isInteger(k) || !versiones[k]) throw new TypeError('planDeSalida: no hay esa versión de la época (' + punto + ')' + (punto === 'antes' ? ': el libro no tiene ningún cambio en vigor' : ''));
  const version = versiones[k];
  const E_ = ESPERAS_DE_LA_SALIDA;
  const selloDe = (id) => (sellos instanceof Map ? sellos.get(id) : sellos?.[id]) ?? null;
  const hoja = (x) => (Array.isArray(x) ? hoja(x[0]) : x);
  const accionesDe = (r) => [].concat(r?.payload?.[4] ?? []);
  const saldos = saldosDe(eje, identidad);
  const pasos = [];
  const paso = (p) => {
    const x = { n: pasos.length + 1, ...p };
    pasos.push(x);
    return x;
  };

  // 1. En el libro viejo, una declaración por serie declarable (hecha si la última suya de esa serie dice lo mismo). Sin el
  // P sobre sus propias declaraciones: cada declaración da P sobre ella (writing a record gives ten P on it), y declararlo
  // daría otra declaración y otro P, sin fin.
  const esDeclaracion = (r) => r?.autor === identidad && accionesDe(r).includes(P.declarar);
  const deLaSalida = (s) => s.familia === 'P' && esDeclaracion(eje.obtener(partirClave(s.serie).raiz));
  const declaradas = eje.sobre(alta.id, '8000000000').filter(esDeclaracion);
  const declaraciones = saldos.filter((s) => s.declarable && !deLaSalida(s)).map((s) => {
    const ultima = declaradas.filter((r) => hoja(r.payload?.[1]?.[0]) === s.serie).at(-1);
    const hecha = ultima && hoja(ultima.payload?.[1]?.[1]) === s.cantidad ? ultima : null;
    return paso({ libro: 'viejo', que: 'declarar', plantilla: P.declarar, params: { X: alta.id, series: s.serie, quantity: s.cantidad }, quien: identidad, serie: s.serie, ...(hecha ? { estado: 'hecho', id: hecha.id } : { estado: 'listo' }) });
  });

  // 3. El génesis del libro nuevo, con la época del viejo por referencia en el punto pedido.
  const epoca = epocaEscritaDe(version.version, { porReferencia: true });
  paso({ libro: 'nuevo', que: 'genesis', plantilla: null, params: { identidad, foco, epoca }, quien: identidad, ...(nuevo ? { estado: 'hecho', id: nuevo.genesisId } : { estado: 'listo' }) });

  // 4. En el nuevo, como dueño: «this book hangs from» con el viejo, sus claves de línea y el punto.
  const colgado = nuevo ? cuelgaDe(nuevo) : null;
  const yaCuelga = colgado?.libro === eje.genesisId ? colgado : null;
  const params = { X: nuevo?.genesisId ?? null, book: eje.genesisId, element: elemento, 'line keys': claves, ...(version.registro ? { point: version.registro } : {}) };
  paso({ libro: 'nuevo', que: 'cuelga', plantilla: L_.cuelga, params, quien: identidad, ...(yaCuelga ? { estado: 'hecho', id: yaCuelga.id } : nuevo ? { estado: 'listo' } : { estado: 'espera', espera: E_.genesis }) });
  const enlace = yaCuelga ? nuevo.obtener(yaCuelga.id) : null;
  const sinClaves = enlace ? nivelMasBajoDe(enlace) === null : !(Array.isArray(claves) && claves.length);

  // 5. En el nuevo, traer cada declaración con su prueba de sello.
  const traidos = nuevo ? nuevo.sobre(nuevo.genesisId, ANCLA_DE_LO_TRAIDO).filter((r) => accionesDe(r).includes(P.traer)) : [];
  for (const d of declaraciones) {
    const ya = d.id ? traidos.find((r) => hoja(r.payload?.[1]?.[1]?.[0]) === d.id && hoja(r.payload?.[1]?.[0]) === eje.genesisId) : null;
    const proof = d.id ? selloDe(d.id) : null;
    const espera = ya ? null : !d.id ? E_.declaracion : !proof ? E_.sello : sinClaves ? E_.claves : !enlace ? E_.cuelga : null;
    paso({
      libro: 'nuevo', que: 'traer', plantilla: P.traer, quien: identidad, serie: d.serie,
      params: { X: enlace?.id ?? null, record: d.id ? registroComoDecupla(eje.obtener(d.id)) : null, proof },
      ...(ya ? { estado: 'hecho', id: ya.id } : espera ? { estado: 'espera', espera } : { estado: 'listo' }),
    });
  }

  const noSeLleva = saldos.filter((s) => s.enOtroLibro > 0).map((s) => ({ serie: s.serie, cantidad: s.enOtroLibro, causa: 'bloqueado para otro libro (un envío): vive allí y se declara allí' }));
  for (const s of saldos) if (s.familia === 'T' && !s.declarable) noSeLleva.push({ serie: s.serie, cantidad: s.disponible + s.bloqueado, causa: s.causa });
  for (const s of saldos) if (s.declarable && deLaSalida(s)) noSeLleva.push({ serie: s.serie, cantidad: s.cantidad, causa: 'P sobre una declaración suya: nace al declarar, y declararlo daría otra declaración y otro P, sin fin' });
  return {
    libro: eje.genesisId, identidad,
    epoca: { punto, version: k, id: version.epoca, registro: version.registro },
    pasos,
    noSeLleva,
    esperan: pasos.filter((p) => p.estado === 'espera').map((p) => 'paso ' + p.n + ' (' + p.que + (p.serie ? ' ' + p.serie : '') + '): ' + p.espera),
    aparte: 'La E y los registros como tales no van en esta salida: salen con «send to another book» y se traen con «bring a record from another book», bajo las reglas del libro viejo.',
  };
}

/** El archivo de cada regla del puente. */
export const ARCHIVO = (nombre) => join(AQUI, 'reglas', nombre);

// node datos/epocas/puente.mjs --escribir: pone cada fórmula en el 2 de su regla (el resto del archivo no cambia).
if (EN_NODE && import.meta.url === pathToFileURL(process.argv[1] ?? '').href && process.argv.includes('--escribir')) {
  const { readFileSync, renameSync, writeFileSync } = await import('node:fs');
  const { formatear } = await import('./generar.mjs');
  for (const [archivo, f] of Object.entries(FORMULAS)) {
    const ruta = ARCHIVO(archivo);
    const regla = JSON.parse(readFileSync(ruta, 'utf8'));
    regla[2] = [f()];
    writeFileSync(ruta + '.nuevo', formatear(regla) + '\n');
    renameSync(ruta + '.nuevo', ruta);
  }
  for (const [archivo, f] of Object.entries(SENTENCIAS)) {
    const ruta = join(AQUI, 'plantillas', archivo);
    const plantilla = JSON.parse(readFileSync(ruta, 'utf8'));
    plantilla[4] = f();
    writeFileSync(ruta + '.nuevo', formatear(plantilla) + '\n');
    renameSync(ruta + '.nuevo', ruta);
  }
  console.log('escritas ' + Object.keys(FORMULAS).length + ' fórmulas del puente y las sentencias de ' + Object.keys(SENTENCIAS).length + ' plantilla');
}
