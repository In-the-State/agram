// BQL mínimo (BQLM): expresiones sobre posiciones BTML, con un léxico corto en
// inglés (VG, 9-11, mapa §16 [D] «Molde de regla y léxico mínimo de BQL»). Es el
// único lenguaje del núcleo: las reglas y plantillas de la época y, desde la
// retirada de BQL V0 (#113), las fórmulas escritas en el payload de un registro
// (leerFormula, al final de este módulo). Gramática, semántica y ejemplos: docs/BQLM.md.
//
// Léxico, exacto y nada más:
//   posiciones      X.d.d…  (X = ev, epoch, before, it, it2…, o una expresión entre paréntesis)
//   índice por valor X.(expr)  (un dígito 0-9 es esa posición; un texto, los ocupantes que se llaman así)
//   listas          first M · last M · nth k M (desde 0) · M each d.d… · M where cond (it, it2… es el elemento;
//                   en una lectura, regla con «read» en su 4, it es lo que se lee y el primer where da it2)
//   árbol           up X · down X · path X (padre por el ancla 6.5, hijos anclados, hilo hasta la raíz; tope 10)
//                   · under X (X y todo lo que cuelga de él, a cualquier profundidad, por llegada; el presupuesto es el tope)
//   libro           moves X (los asientos del libro de X, por llegada: de un registro, lo que asentó su transacción,
//                   también lo que añade el libro; de una identidad, donde es de o a; de una serie, todos los suyos)
//   orden           M by e (M ordenado por e, de menor a mayor; los empates, por llegada; como where, da it2…)
//   tablas y relaciones (Core AGRAM 18-11, «la lente solo lee»; docs/BQLM.md §15, pendiente de revisar VG):
//                   M group e (un grupo por clave, por primera aparición: la clave en las primeras posiciones y los
//                   miembros en la siguiente) · row(a, b…) (una fila: la lista k en la posición k) · M each (e) (e
//                   para cada elemento, juntando) · M follow e (M y lo que da e una y otra vez, sin repetir; el
//                   presupuesto es el tope) · apply(F, X) (la fórmula guardada F con it = cada elemento de X; nunca
//                   mueve ni escribe; tope de anidamiento propio y sin aplicarse a sí misma) · take n M (los n primeros)
//                   · A with B (los de A y luego los de B) · M keep cond (como where, pero el elemento cuya condición
//                   queda PENDIENTE o da ERROR se cae; un límite de cálculo no; solo en una lectura, opciones.lectura)
//                   · M cited d.d… (§15.3: los registros del libro que llevan el valor de cada elemento en esa posición
//                   de su payload, por orden; cuesta uno por elemento y uno por resultado; índice en src/indice-de-nombres.js)
// Además (§15.5): explicar(src, contexto, opciones), el mismo veredicto que evaluar y su porqué (un árbol corto), con
// presupuesto y topes propios; solo lee y nada del núcleo la llama al firmar ni en una regla.
//   recuento        count · sum · max · min
//   aritmética      + - * / floor
//   comparación     = != < <= > >=
//   lógica          and or not in
//   literales       números, "texto", y los símbolos mint transfer lock release burn y E P R T (valen su nombre)
//   series          la serie como posición de su familia (VG 12-11, decisión 5 del estudio BQL-transacciones):
//                   T.d (la escala d: T.1 el minuto, T.8 el futuro) · R.(emisor) · E.(emisor).(denominación)[.(registro)]
//                   · P.(ámbito)[.(origen)]; vale la clave de la serie (el contexto la da como serie, D-SERIE)
//   mover           (solo en una plantilla de transacción: invariante del núcleo, decisión 6) los cinco símbolos como
//                   verbos: mint q S to A [price Pr] [when F] · transfer q S from A to B [exit E] [when F]
//                   · lock q S from A exit E · release q S from A exit E · burn q S from A [when F]; y en una
//                   plantilla, put v at A.1.(S).1 (el nivel en mano: acuña lo que falte). Cada verbo vale verdadero
//                   (el condicional es «cond and verbo», con and perezoso); lo que vale cero o nada no se mueve.
//                   memo es el payload de la candidata, sin movimientos ni metadatos
// Cualquier otro nombre es ERROR «no es BQL mínimo».
//
// Semántica: toda expresión vale una LISTA de ocupantes. Una posición da sus
// ocupantes por llegada; una lista de uno se usa como su elemento en la
// aritmética y en las comparaciones (decisión G3); comparar una lista de más de
// uno es ERROR; and y or son perezosos. Tres estados:
// RESUELTO, PENDIENTE (falta algo que resolver: una posición vacía donde hace
// falta un valor, una referencia a un evento que no ha llegado, un límite) y
// ERROR (sintaxis, un nombre que no es del léxico, tipos que no operan).
//
// El evaluador no sabe nada del eje: pregunta a un CONTEXTO. Interfaz:
//
//   contexto.nombre(n)              el nodo de 'ev' (la transacción candidata), 'epoch' (el registro de la
//                                   época) o 'before' (el libro de antes); undefined si no lo hay
//   contexto.ocupantes(nodo, camino, presupuesto)
//                                   los ocupantes de la posición `camino` (dígitos 0-9) del nodo, por
//                                   llegada; gasta del Presupuesto de la evaluación cada ocupante que
//                                   expande; puede lanzar una Parada PENDIENTE (o POR LÍMITE)
//   contexto.padre(nodo)            el registro padre (por el ancla 6.5), null en la raíz, undefined si el
//                                   nodo no es un registro
//   contexto.hijos(nodo)            los registros anclados sobre él, por llegada; undefined si no es un registro
//   contexto.subarbol(nodo, pres.)  (opcional) el nodo y todo lo que cuelga de él, por llegada; undefined si no es un
//                                   registro. Sin él, under recorre hijos en profundidad
//   contexto.asientos(nodo, pres.)  (opcional) los asientos del libro de un registro, una identidad o una serie, como
//                                   ocupantes con su D-MOV; undefined si el nodo no tiene libro. Sin él, moves es ERROR
//   contexto.valor(nodo)            el escalar de un nodo que no es número ni texto (el id de un registro),
//                                   o undefined (una décupla no tiene valor)
//   contexto.texto(nodo)            (opcional) cómo se escribe el nodo en un mensaje
//   contexto.serie(familia, partes) (opcional) la serie que nombran T.d, R.(x), E.(x).(y)[.(z)] y P.(x)[.(y)]: un nodo
//                                   cuyo valor es su clave, o undefined si las partes no hacen una serie. Sin él,
//                                   construir una serie es ERROR
//
// Mover (VG 12-11, decisiones 5 y 6): un verbo solo se evalúa con opciones.mover (evaluarPlantilla: las sentencias del
// 4 de una plantilla de transacción, que construye la candidata y que firma quien la lanza); en cualquier otra
// evaluación (una condición, una lectura, una regla que escribe, el 2 de una plantilla) una fórmula con un verbo es
// ERROR aunque el verbo no se llegue a evaluar. `put` solo vale en una regla que escribe (opciones.escribir: el libro
// acuña por su cuenta hasta un nivel, solo en los destinos de DESTINOS_DE_PUT) o en una plantilla (el nivel en mano).
//
// Primitivas de verificación (Core AGRAM 12-11, #67; docs/BQLM.md §12): bytes hex utf8 hash sha256 sha256d cat slice
// reverse le below merkle ots cabecera tx signed lookup, escritas como llamadas, nombre(a, b…); payload(X) (13-11, H19),
// que lee el payload de un registro tal como se escribió; y tapleaf(script) y taptweak(interna, hoja, hermanos) (13-11,
// H20: el sello ancla por Taproot), la hoja y la clave de salida de BIP-341. Son PURAS: solo leen sus
// argumentos (nada del contexto ni de fuera), nunca firman ni ven claves privadas, y cuentan en el presupuesto por byte
// procesado (LIMITES.bytes). Traen un tipo nuevo, los BYTES (esBytes), distinto de texto y número: en los datos BTML
// viajan como texto hex y se convierten con bytes(…); se leen en hex. cabecera(…) y tx(…) dan una décupla pura, que se
// lee por posiciones como cualquier otra. Una regla que las usa sigue solo leyendo.
//
// Los ocupantes son números, textos o nodos opacos del contexto (y, de las primitivas de verificación, bytes y décuplas
// puras). Hay una implementación sobre el eje en src/contexto-eje.js.

import { canonico } from './evento.js';
import { indiceDeNombres } from './indice-de-nombres.js';
import { direccion } from './btml.js';
import { sha256, sha256d, hashEtiquetado, concatenar, deHex, aHex, igualesBytes, menor, enteroLe, leerCabecera, leerTx, raizMerkle, aplicarOts, verificarBip340, tapleaf, taptweak } from './cripto.js';

export const ESTADOS = Object.freeze(['RESUELTO', 'PENDIENTE', 'ERROR']);

/** Las cinco primitivas de la capa de transacciones (VG, 9-11, mapa §16 [D]): símbolos que valen su nombre. */
export const PRIMITIVAS = Object.freeze(['mint', 'transfer', 'lock', 'release', 'burn']);

/** Las cuatro familias de tokens, como símbolos. */
export const SIMBOLOS_FAMILIA = Object.freeze(['E', 'P', 'R', 'T']);

/**
 * Los nombres fijos que el contexto resuelve: la transacción candidata, el registro de la época, el libro de antes y,
 * desde el encargo 3c-2a (las acciones del aro), `me`: la identidad que mira (sus vistas: me.1 la cartera, me.2 el
 * criterio, me.3 los grupos de atención…), lo que una plantilla de transacción lee en su 2 para decidir si se ofrece.
 */
export const NOMBRES = Object.freeze(['ev', 'epoch', 'before', 'me', 'memo']);

/** Las palabras de enlace de un verbo (VG 12-11, decisión 5): de quién, a quién, la salida, la fecha y el precio. */
export const ENLACES = Object.freeze(['from', 'to', 'exit', 'when', 'price']);

/**
 * Las palabras del léxico (sin los nombres, los símbolos ni it, it2…). `put v at X.d.(k)` es colocar (mapa §16 [D]:
 * «put v at X.d, colocar, solo reglas que escriben»; encargo 3b): vale verdadero y anota una escritura, que solo
 * evalúa una regla con «put» en su 4 (evaluarEscritura) o, el nivel en mano, una plantilla (evaluarPlantilla).
 */
export const PALABRAS = Object.freeze(['first', 'last', 'nth', 'each', 'where', 'by', 'up', 'down', 'path', 'under', 'moves', 'count', 'sum', 'max', 'min', 'floor', 'and', 'or', 'not', 'in', 'put', 'at', ...ENLACES, 'group', 'follow', 'keep', 'with', 'take', 'cited']);

/**
 * Las dos llamadas de lectura (Core AGRAM 18-11; docs/BQLM.md §15): construir una fila y aplicar una fórmula guardada.
 * Se escriben como las primitivas de verificación, nombre(a, b…), con su número de argumentos ([mínimo, máximo]).
 */
export const LLAMADAS_DE_LECTURA = Object.freeze({
  row: Object.freeze({ forma: 'row(a, b, …)', aridad: [1, 10] }),
  apply: Object.freeze({ forma: 'apply(F, X)', aridad: [2, 2] }),
});

/**
 * Cuántas fórmulas aplicadas puede haber una dentro de otra (apply dentro de una fórmula aplicada…): pasarse es PENDIENTE
 * POR LÍMITE. Se cambia con opciones.limites.aplicacion. Su sitio final es el 8.8 de la época (pendiente de la pasada
 * única: la época 0 no se toca en este encargo).
 */
export const TOPE_DE_APLICACION = 8;

/**
 * Invariante del núcleo (VG 12-11, decisión 6): los destinos de un `put` en una regla que escribe, lista cerrada.
 * El libro, por su cuenta (sin firma), solo acuña hasta un nivel aquí: hoy, `A.2.1` (el P posicionado, la obtención).
 */
export const DESTINOS_DE_PUT = Object.freeze([Object.freeze([2, 1])]);

/** Cuántas partes lleva la serie de cada familia: [mínimo, máximo] (T.d · R.(emisor) · E.(emisor).(denominación)[.(registro)] · P.(ámbito)[.(origen)]). */
const PARTES_DE_FAMILIA = Object.freeze({ T: [1, 1], R: [1, 1], E: [2, 3], P: [1, 2] });

/** Cómo se escribe cada verbo (los mensajes de sintaxis). */
const FORMAS = Object.freeze({
  mint: 'mint q S to A [price Pr] [when F]',
  transfer: 'transfer q S from A to B [exit E] [when F]',
  lock: 'lock q S from A exit E',
  release: 'release q S from A exit E',
  burn: 'burn q S from A [when F]',
});

/**
 * Límites de cálculo: pasos de una evaluación, ocupantes que el contexto puede
 * expandir en una evaluación (el máximo de Scened, 10000), anidamiento de la
 * expresión y niveles de un hilo (`path`). Pasarse es PENDIENTE POR LÍMITE.
 * Son el TECHO (#100): con una época, cada evaluación usa el menor entre su
 * fila 8.8 «calculation limits» y esto (limitesDeEpoca).
 */
export const LIMITES = Object.freeze({ pasos: 100000, ocupantes: 10000, anidamiento: 100, hilo: 10, bytes: 2000000 });

/**
 * Las primitivas de verificación (Core AGRAM 12-11, #67; docs/BQLM.md §12): su forma y cuántos argumentos llevan
 * ([mínimo, máximo]). Puras: sin efectos, sin contexto, sin firmar.
 */
export const VERIFICACION = Object.freeze({
  bytes: Object.freeze({ forma: 'bytes(hex)', aridad: [1, 1] }),
  hex: Object.freeze({ forma: 'hex(b)', aridad: [1, 1] }),
  utf8: Object.freeze({ forma: 'utf8(texto)', aridad: [1, 1] }),
  hash: Object.freeze({ forma: 'hash(x) o hash(x, etiqueta)', aridad: [1, 2] }),
  sha256: Object.freeze({ forma: 'sha256(b)', aridad: [1, 1] }),
  sha256d: Object.freeze({ forma: 'sha256d(b)', aridad: [1, 1] }),
  cat: Object.freeze({ forma: 'cat(b1, b2, …)', aridad: [1, Infinity] }),
  slice: Object.freeze({ forma: 'slice(b, desde, hasta)', aridad: [3, 3] }),
  reverse: Object.freeze({ forma: 'reverse(b)', aridad: [1, 1] }),
  le: Object.freeze({ forma: 'le(b)', aridad: [1, 1] }),
  below: Object.freeze({ forma: 'below(a, b)', aridad: [2, 2] }),
  merkle: Object.freeze({ forma: 'merkle(hoja, lados, hermanos, esquema)', aridad: [4, 4] }),
  ots: Object.freeze({ forma: 'ots(x, pasos)', aridad: [2, 2] }),
  cabecera: Object.freeze({ forma: 'cabecera(b)', aridad: [1, 1] }),
  tx: Object.freeze({ forma: 'tx(b)', aridad: [1, 1] }),
  signed: Object.freeze({ forma: 'signed(firma, mensaje, clave)', aridad: [3, 3] }),
  // Core AGRAM 13-11 (H17, H19 del SIP 0, «sin tuplas»): leer una clave en dos listas hermanas, y el payload tal cual.
  lookup: Object.freeze({ forma: 'lookup(claves, valores, clave)', aridad: [3, 3] }),
  payload: Object.freeze({ forma: 'payload(X)', aridad: [1, 1] }),
  // Core AGRAM 13-11 (H20 del SIP 0; VG: el sello ancla por Taproot, no por OpenTimestamps): BIP-341.
  tapleaf: Object.freeze({ forma: 'tapleaf(script)', aridad: [1, 1] }),
  taptweak: Object.freeze({ forma: 'taptweak(interna, hoja, hermanos)', aridad: [3, 3] }),
  // Core AGRAM 17-11 (el puente entre libros, A15; docs/notas/PUENTE.md): el registro de otro libro traído como dato se
  // comprueba rehaciendo su cuerpo canónico (json) y la serie forastera se nombra juntando textos (text de cat de utf8).
  json: Object.freeze({ forma: 'json(x)', aridad: [1, 1] }),
  text: Object.freeze({ forma: 'text(b)', aridad: [1, 1] }),
});

/** Lo que cuesta verificar una firma BIP-340, en bytes del presupuesto (una verificación cuesta como hashear ~64 KB). */
export const COSTE_FIRMA = 65536;
/** Lo que cuesta un TapTweak (subir la interna a un punto, multiplicar el generador y sumar): como una firma. */
export const COSTE_TAPTWEAK = COSTE_FIRMA;

/** El subtipo de PENDIENTE cuando se agota un límite de cálculo. */
export const POR_LIMITE = 'PENDIENTE POR LÍMITE';
/** La causa, para una máquina, de una parada por un límite de cálculo (#100; eje.motivos, el error de eje.escribir). */
export const CAUSA_LIMITE = 'limit_exhausted';

/** Los límites en el orden de la fila «calculation limits» de la época (epoch.8.8): 8.8.1 pasos … 8.8.5 bytes. */
const ORDEN_DE_LIMITES = Object.freeze(['pasos', 'ocupantes', 'anidamiento', 'hilo', 'bytes']);
const LIMITES_DE_EPOCA = new WeakMap();

/**
 * Los límites de cálculo de una época (#100, VG 17-11: «la regla de parada» es un dato de la época): su fila 8.8,
 * [["calculation limits", ayuda], [pasos], [ocupantes], [anidamiento], [hilo], [bytes]], cada uno el MENOR entre el dato
 * y su constante de LIMITES, que queda como techo (una época no lo sube; una hija que reescribe 8.8 lo baja). Un dato
 * ausente, mal formado (no un entero, o la fila sin ese nombre), cero o negativo cuenta como la constante. `epoca` es la
 * época cargada o su décupla; sin época, LIMITES.
 */
export function limitesDeEpoca(epoca) {
  const raiz = Array.isArray(epoca) ? epoca : epoca?.registro ?? epoca?.payload;
  if (!Array.isArray(raiz)) return LIMITES;
  if (LIMITES_DE_EPOCA.has(raiz)) return LIMITES_DE_EPOCA.get(raiz);
  const fila = Array.isArray(raiz[8]) ? raiz[8][8] : undefined;
  const nombrada = Array.isArray(fila) && Array.isArray(fila[0]) && fila[0][0] === 'calculation limits';
  const dato = (k) => {
    const x = nombrada && Array.isArray(fila[k + 1]) && fila[k + 1].length === 1 ? fila[k + 1][0] : undefined;
    return Number.isSafeInteger(x) && x > 0 ? x : Infinity;
  };
  const fuera = Object.freeze(Object.fromEntries(ORDEN_DE_LIMITES.map((n, k) => [n, Math.min(dato(k), LIMITES[n])])));
  LIMITES_DE_EPOCA.set(raiz, fuera);
  return fuera;
}

/**
 * Los límites de una evaluación: los del contexto (`contexto.limitesDeCalculo`, los de su época: src/contexto-eje.js) o
 * LIMITES, y encima lo que diga `opciones.limites` (el código que la llama, como hasta ahora).
 */
function limitesDe(contexto, opciones = {}) {
  const propios = contexto && typeof contexto === 'object' ? contexto.limitesDeCalculo : undefined;
  const base = propios && typeof propios === 'object' ? propios : LIMITES;
  const o = opciones.limites;
  if (!o) return base;
  return Object.fromEntries(ORDEN_DE_LIMITES.map((n) => [n, o[n] ?? base[n] ?? LIMITES[n]]));
}

/** Una parada de la evaluación: PENDIENTE (con su subtipo, si lo hay) o ERROR, con su motivo. */
export class Parada extends Error {
  constructor(estado, motivo, subtipo) {
    super(motivo);
    this.estado = estado;
    if (subtipo) this.subtipo = subtipo;
  }
}

/** Parada PENDIENTE (para los contextos: falta algo que puede llegar). */
export const pendiente = (motivo) => new Parada('PENDIENTE', motivo);
/** Parada PENDIENTE POR LÍMITE: se agotó un límite de cálculo. */
export const porLimite = (motivo) => new Parada('PENDIENTE', 'límite de cálculo: ' + motivo, POR_LIMITE);
const fallo = (motivo) => new Parada('ERROR', motivo);

/**
 * Los símbolos: las cinco primitivas, las cuatro familias y «nadie» (el otro
 * lado de una emisión o de un consumo). Son objetos propios, congelados, que
 * solo produce el contexto desde el libro (la primitiva y la familia de un
 * movimiento real) y el analizador desde un literal: un texto del payload
 * «burn» no es igual al símbolo `burn`, así que el payload no puede fabricar
 * un movimiento (revisión de seguridad, SEG-09) ni hacerse pasar por «nadie»
 * (SEG-11). Se leen por su nombre.
 */
const MARCA = new WeakSet();
function simbolo(nombre) {
  const s = Object.freeze({ simbolo: nombre });
  MARCA.add(s);
  return s;
}
export const SIMBOLOS = Object.freeze(Object.fromEntries([...PRIMITIVAS, ...SIMBOLOS_FAMILIA, 'nadie'].map((n) => [n, simbolo(n)])));
/** Quien está al otro lado de una emisión (de = null) o de un consumo (a = null): un símbolo, nunca un texto. */
export const NADIE = SIMBOLOS.nadie;
/** ¿Es `o` uno de los símbolos de BQLM? */
export const esSimbolo = (o) => MARCA.has(o);

/**
 * El presupuesto compartido de una evaluación: cuántos ocupantes puede
 * expandir el contexto (cada uno cuenta, también cada salto de referencia) y
 * la memoria de las referencias ya seguidas, por (ref, dir). El evaluador lo
 * pasa al contexto en cada llamada a ocupantes.
 */
export class Presupuesto {
  constructor(tope = LIMITES.ocupantes, topeBytes = LIMITES.bytes) {
    this.tope = tope;
    this.usados = 0;
    this.memo = new Map();
    // Los bytes que procesan las primitivas de verificación (§12): cada una paga lo que lee o produce antes de hacerlo.
    this.topeBytes = topeBytes;
    this.bytes = 0;
    // Los pasos que han dado las evaluaciones que lo comparten (§15: para medir lo que cuesta una lectura); el tope de
    // pasos sigue siendo de cada evaluación.
    this.pasos = 0;
  }

  gastar(n = 1) {
    this.usados += n;
    if (this.usados > this.tope) throw porLimite('más de ' + this.tope + ' ocupantes expandidos');
  }

  gastarBytes(n) {
    this.bytes += n;
    if (this.bytes > this.topeBytes) throw porLimite('más de ' + this.topeBytes + ' bytes procesados por las primitivas de verificación');
  }
}

/**
 * Los bytes (§12): un valor propio, congelado, distinto de texto y número, que solo producen las primitivas de
 * verificación. Se leen en hex; dos bytes son iguales si lo son byte a byte. Un texto hex del payload no es bytes hasta
 * que pasa por bytes(…).
 */
const BYTES = new WeakSet();
function aBytesBql(u8) {
  const o = Object.freeze({ b: u8 });
  BYTES.add(o);
  return o;
}
/** ¿Es `o` un valor de bytes del BQL mínimo? */
export const esBytes = (o) => BYTES.has(o);
/** El hex de un valor de bytes (o undefined si no lo es). */
export const hexDe = (o) => (BYTES.has(o) ? aHex(o.b) : undefined);

/** Una décupla pura (la de cabecera(…) o tx(…)): pos[d] es la lista de ocupantes de su posición d. */
const PURAS = new WeakSet();
function pura(posiciones, largo) {
  const pos = Array.from({ length: 10 }, (_, d) => Object.freeze(posiciones[d] ?? []));
  const o = Object.freeze({ pos: Object.freeze(pos), ...(largo === undefined ? {} : { largo }) });
  PURAS.add(o);
  return o;
}
const esPura = (o) => PURAS.has(o);

/**
 * Una fila (§15): la décupla pura que construyen row(…) y group, con las `largo` primeras posiciones como columnas.
 * `listas[k]` es la lista de ocupantes de la posición k.
 */
const fila = (listas) => pura(Object.fromEntries(listas.map((l, k) => [k, l])), listas.length);
/** ¿Es `o` una fila de row(…) o de group? */
export const esFila = (o) => PURAS.has(o) && o.largo !== undefined;

/**
 * Lo que vale una lista de ocupantes (o un ocupante) para el JavaScript que la recibe (§15): una fila, un array con una
 * entrada por columna, cada una la lista aplanada de su posición; una décupla pura sin columnas (cabecera, tx), sus diez
 * posiciones; un número, un texto o un booleano, tal cual; un símbolo, su nombre; unos bytes, su hex; un nodo del
 * contexto, su valor (el id de un registro) o, si no tiene, cómo se escribe (contexto.texto), o null. Solo lee.
 */
export function aplanar(x, contexto) {
  if (Array.isArray(x)) return x.map((o) => aplanar(o, contexto));
  if (typeof x === 'number' || typeof x === 'string' || typeof x === 'boolean') return x;
  if (esSimbolo(x)) return x.simbolo;
  if (esBytes(x)) return aHex(x.b);
  if (esPura(x)) return x.pos.slice(0, x.largo ?? 10).map((l) => aplanar(l, contexto));
  const v = esNodo(x) ? contexto?.valor?.(x) : undefined;
  if (v !== undefined) return v;
  return esNodo(x) ? contexto?.texto?.(x) ?? null : null;
}

const PREFIJAS = new Set(['first', 'last', 'count', 'sum', 'max', 'min', 'floor', 'up', 'down', 'path', 'under', 'moves']);
const COMPARACIONES = new Set(['=', '!=', '<', '<=', '>', '>=']);
const RESERVADAS = new Set([...PALABRAS, ...NOMBRES, ...PRIMITIVAS, ...SIMBOLOS_FAMILIA, ...Object.keys(VERIFICACION), ...Object.keys(LLAMADAS_DE_LECTURA)]);
// Las palabras que, como where, se llevan lo que queda a su derecha y dan el siguiente it al elemento (§2, §15).
const COMO_WHERE = new Set(['where', 'by', 'group', 'follow', 'keep']);
// Tras un símbolo de primitiva, ¿empieza un operando? Entonces es un verbo (mint 3 R.(me) to me); si no, el símbolo
// (burn in it.4, it.4 = burn).
const EMPIEZA_OPERANDO = new Set([...NOMBRES, ...PREFIJAS, 'nth', ...SIMBOLOS_FAMILIA]);

// ---------- léxico ----------

const RE_ESPACIO = /\s+/y;
const RE_NUMERO = /\d+(?:\.\d+)?/y;
const RE_DIGITOS = /\d+/y;
const RE_TEXTO = /"(?:[^"\\]|\\.)*"/y;
const RE_NOMBRE = /[\p{L}_][\p{L}\p{N}_]*/uy;
// La coma no es del léxico: se lee para que «FILTRAR(a, b)» diga qué nombre no es BQL mínimo.
const RE_OPERADOR = /!=|<=|>=|[()+\-*/=<>.,]/y;

/** Tokens de una expresión: { t: 'num' | 'dig' | 'txt' | 'id' | 'op', v, pos }. Tras «.» o «each», las cifras son dígitos de posición. */
function tokenizar(src) {
  const tokens = [];
  let pos = 0;
  const prueba = (re) => {
    re.lastIndex = pos;
    const m = re.exec(src);
    if (m) pos = re.lastIndex;
    return m;
  };
  while (pos < src.length) {
    if (prueba(RE_ESPACIO)) continue;
    const previo = tokens[tokens.length - 1];
    const tras = previo && ((previo.t === 'op' && previo.v === '.') || (previo.t === 'id' && (previo.v === 'each' || previo.v === 'cited')));
    const inicio = pos;
    let m;
    if (tras && (m = prueba(RE_DIGITOS))) tokens.push({ t: 'dig', v: m[0], pos: inicio });
    else if ((m = prueba(RE_NUMERO))) tokens.push({ t: 'num', v: Number(m[0]), pos: inicio });
    else if ((m = prueba(RE_TEXTO))) {
      let v;
      try {
        v = JSON.parse(m[0]);
      } catch {
        throw fallo('sintaxis: texto mal escrito en ' + inicio + ': ' + m[0]);
      }
      tokens.push({ t: 'txt', v, pos: inicio });
    } else if ((m = prueba(RE_NOMBRE))) tokens.push({ t: 'id', v: m[0], pos: inicio });
    else if ((m = prueba(RE_OPERADOR))) tokens.push({ t: 'op', v: m[0], pos: inicio });
    else throw fallo('sintaxis: carácter inesperado en ' + pos + ': «' + src.slice(pos, pos + 8) + '»');
    // Dónde acaba el token (el espacio de cada nodo del árbol, §15.5: explicar enseña el trozo de la fórmula).
    tokens[tokens.length - 1].fin = pos;
  }
  return tokens;
}

// ---------- sintaxis ----------

const NIVEL_IT = /^it([2-9]|[1-9]\d+)?$/;

/**
 * Analiza una expresión de BQL mínimo (sin el «=» de fórmula, o con él) y
 * devuelve su árbol. Lanza una Parada ERROR con el motivo (sintaxis o «no es
 * BQL mínimo»). `anidamiento` es el tope de anidamiento (por omisión, LIMITES.anidamiento).
 */
export function analizar(src, { sujeto = false, anidamiento: topeAnidamiento = LIMITES.anidamiento } = {}) {
  if (typeof src !== 'string') throw fallo('sintaxis: una expresión es un texto');
  const cuerpo = esFormula(src) ? src.slice(1) : src;
  const tokens = tokenizar(cuerpo);
  let i = 0;
  // Con sujeto (una lectura, B5), it ya es lo que se lee: el primer where da it2.
  let nivelWhere = sujeto ? 1 : 0;
  let anidamiento = 0;
  const ver = () => tokens[i];
  const es = (t, v) => tokens[i]?.t === t && (v === undefined || tokens[i].v === v);
  const donde = () => (tokens[i] ? 'en ' + tokens[i].pos + ' («' + tokens[i].v + '»)' : 'al final');
  const entrar = () => {
    if (++anidamiento > topeAnidamiento) throw porLimite('expresión anidada más de ' + topeAnidamiento + ' niveles');
  };
  const salir = () => { anidamiento--; };
  const esperar = (t, v) => {
    if (!es(t, v)) throw fallo('sintaxis: se esperaba «' + v + '» ' + donde());
    i++;
  };

  function expresion() {
    entrar();
    let base = disyuncion();
    // where y by (VG 12-11, decisión 2 del estudio BQL-transacciones): los dos dan el siguiente it al elemento.
    // group, follow y keep (Core AGRAM 18-11, §15), igual: agrupar por e, seguir la relación e, filtrar tolerante.
    while (es('id') && COMO_WHERE.has(ver().v)) {
      const n = ver().v;
      i++;
      nivelWhere++;
      const cond = disyuncion();
      base = n === 'where' || n === 'keep' ? { n, base, cond, nivel: nivelWhere } : n === 'follow' ? { n, base, rel: cond, nivel: nivelWhere } : { n, base, clave: cond, nivel: nivelWhere };
      nivelWhere--;
    }
    salir();
    return base;
  }
  function disyuncion() {
    let a = conjuncion();
    while (es('id', 'or')) { i++; a = { n: 'or', a, b: conjuncion() }; }
    return a;
  }
  function conjuncion() {
    let a = negacion();
    while (es('id', 'and')) { i++; a = { n: 'and', a, b: negacion() }; }
    return a;
  }
  function negacion() {
    if (es('id', 'not')) {
      i++;
      entrar();
      const a = negacion();
      salir();
      return { n: 'not', a };
    }
    return comparacion();
  }
  function esComparacion() {
    return (es('op') && COMPARACIONES.has(ver().v)) || es('id', 'in');
  }
  function comparacion() {
    const a = union();
    if (!esComparacion()) return a;
    const op = ver().v;
    i++;
    const b = union();
    if (esComparacion()) throw fallo('sintaxis: comparaciones encadenadas ' + donde() + ': únelas con and');
    return { n: 'cmp', op, a, b };
  }
  /** Juntar listas (§15): A with B, los de A y luego los de B; entre la comparación y la suma. */
  function union() {
    let a = suma();
    while (es('id', 'with')) { i++; a = { n: 'with', a, b: suma() }; }
    return a;
  }
  function suma() {
    let a = producto();
    while (es('op', '+') || es('op', '-')) { const op = ver().v; i++; a = { n: 'bin', op, a, b: producto() }; }
    return a;
  }
  function producto() {
    let a = prefija();
    while (es('op', '*') || es('op', '/')) { const op = ver().v; i++; a = { n: 'bin', op, a, b: prefija() }; }
    return a;
  }
  function prefija() {
    if (es('id') && PREFIJAS.has(ver().v)) {
      const op = ver().v;
      i++;
      entrar();
      const arg = prefija();
      salir();
      return { n: 'pref', op, arg };
    }
    if (es('id', 'nth') || es('id', 'take')) {
      const n = ver().v;
      i++;
      entrar();
      const k = prefija();
      const arg = prefija();
      salir();
      return { n, k, arg };
    }
    if (es('op', '-')) {
      i++;
      entrar();
      const arg = prefija();
      salir();
      return { n: 'pref', op: 'neg', arg };
    }
    if (es('id', 'put')) {
      // put v at B.d….(k): el valor es una suma; el destino, una posición de B con el índice por valor al final.
      i++;
      entrar();
      const v = suma();
      if (!es('id', 'at')) throw fallo('sintaxis: put v at X.d.(k): falta «at» ' + donde());
      i++;
      const t = posfija();
      salir();
      // Tras el índice por valor puede seguir un camino de dígitos (encargo 3c-2a, P por mirada): put v at X.d.(k).e
      // coloca en la posición e de la entrada k (el P sobre la mirada e del registro k).
      const clave = t.n === 'paso' && !t.each && t.base?.n === 'clave' ? t.base : t;
      if (clave.n !== 'clave' || clave.base?.n !== 'paso' || clave.base.each) throw fallo('sintaxis: put coloca en una posición con su índice por valor: put v at X.d.(k) o put v at X.d.(k).e');
      return { n: 'put', v, t: clave, ...(clave !== t ? { sub: t.digitos } : {}) };
    }
    return posfija();
  }
  function digitos() {
    const lista = [];
    for (;;) {
      if (!es('dig')) throw fallo('sintaxis: se esperaba un dígito de posición ' + donde());
      if (ver().v.length !== 1) throw fallo('sintaxis: una posición es un solo dígito (0-9), no «' + ver().v + '»: escribe ' + ver().v.split('').join('.'));
      lista.push(Number(ver().v));
      i++;
      // Sigue el camino mientras venga «.» y otro dígito.
      if (es('op', '.') && tokens[i + 1]?.t === 'dig') { i++; continue; }
      return lista;
    }
  }
  /** La serie como posición de su familia (VG 12-11, decisión 5): T.d, R.(x), E.(x).(y)[.(z)], P.(x)[.(y)]. */
  function serieDeFamilia(familia) {
    const partes = [];
    while (es('op', '.')) {
      i++;
      if (es('op', '(')) {
        i++;
        partes.push(expresion());
        esperar('op', ')');
      } else if (es('dig')) {
        for (const d of digitos()) partes.push({ n: 'lit', v: d });
      } else throw fallo('sintaxis: la serie de ' + familia + ' se escribe con sus partes, ' + familia + '.d o ' + familia + '.(…) ' + donde());
    }
    const [min, max] = PARTES_DE_FAMILIA[familia];
    if (partes.length < min || partes.length > max) {
      throw fallo('sintaxis: la serie de ' + familia + ' lleva ' + (min === max ? min : min + ' o ' + max) + (max === 1 ? ' parte' : ' partes') + ' (T.d · R.(emisor) · E.(emisor).(denominación)[.(registro)] · P.(ámbito)[.(origen)]), no ' + partes.length);
    }
    return { n: 'serie', familia, partes };
  }
  function posfija() {
    let base = primaria();
    for (;;) {
      if (base.familia && es('op', '.')) {
        base = serieDeFamilia(base.familia);
        continue;
      }
      if (es('op', '.')) {
        if (!base.posicionable) throw fallo('sintaxis: una posición se lee de ev, epoch, before, it… o de una expresión entre paréntesis ' + donde());
        i++;
        if (es('op', '(')) {
          i++;
          const expr = expresion();
          esperar('op', ')');
          base = { n: 'clave', base, expr, posicionable: true };
        } else base = { n: 'paso', base, digitos: digitos(), posicionable: true };
      } else if (es('id', 'each') && tokens[i + 1]?.t === 'op' && tokens[i + 1].v === '(') {
        // M each (e) (§15): e para cada elemento, que es el siguiente it, como en where; se juntan los resultados.
        i += 2;
        entrar();
        nivelWhere++;
        const e = expresion();
        const nivel = nivelWhere;
        nivelWhere--;
        esperar('op', ')');
        salir();
        base = { n: 'mapa', base, e, nivel, posicionable: true };
      } else if (es('id', 'each')) {
        i++;
        base = { n: 'paso', base, digitos: digitos(), posicionable: true, each: true };
      } else if (es('id', 'cited')) {
        // M cited d.d… (§15.3): los registros del libro que nombran a cada elemento de M en esa posición de su payload.
        i++;
        base = { n: 'cited', base, digitos: digitos(), posicionable: true };
      } else return base;
    }
  }
  function primaria() {
    const tk = ver();
    if (!tk) throw fallo('sintaxis: falta una expresión al final');
    if (tk.t === 'num') { i++; return { n: 'lit', v: tk.v }; }
    if (tk.t === 'txt') { i++; return { n: 'lit', v: tk.v }; }
    if (tk.t === 'op' && tk.v === '(') {
      i++;
      const e = expresion();
      esperar('op', ')');
      return { n: 'paren', e, posicionable: true };
    }
    if (tk.t === 'id') {
      i++;
      if (NOMBRES.includes(tk.v)) return { n: 'nombre', v: tk.v, posicionable: true };
      if (PRIMITIVAS.includes(tk.v) && empiezaOperando()) return verbo(tk.v);
      if (PRIMITIVAS.includes(tk.v)) return { n: 'lit', v: SIMBOLOS[tk.v] };
      if (SIMBOLOS_FAMILIA.includes(tk.v)) return { n: 'lit', v: SIMBOLOS[tk.v], familia: tk.v };
      const it = NIVEL_IT.exec(tk.v);
      if (it) {
        const nivel = it[1] ? Number(it[1]) : 1;
        if (nivel > nivelWhere) {
          throw fallo(nivel === 1 ? 'sintaxis: it solo vale dentro de where' : 'sintaxis: ' + tk.v + ' solo vale dentro de un where anidado ' + nivel + ' veces');
        }
        return { n: 'it', nivel, posicionable: true };
      }
      if (Object.hasOwn(VERIFICACION, tk.v)) {
        if (!es('op', '(')) throw fallo('sintaxis: ' + tk.v + ' es una primitiva de verificación y se escribe con sus argumentos entre paréntesis: ' + VERIFICACION[tk.v].forma);
        return llamadaPura(tk.v);
      }
      if (Object.hasOwn(LLAMADAS_DE_LECTURA, tk.v)) {
        if (!es('op', '(')) throw fallo('sintaxis: ' + tk.v + ' se escribe con sus argumentos entre paréntesis: ' + LLAMADAS_DE_LECTURA[tk.v].forma);
        return llamadaPura(tk.v, LLAMADAS_DE_LECTURA);
      }
      if (RESERVADAS.has(tk.v)) throw fallo('sintaxis: «' + tk.v + '» fuera de sitio en ' + tk.pos);
      const llamada = es('op', '(') ? ' (no hay funciones con nombre)' : '';
      throw fallo('no es BQL mínimo: «' + tk.v + '»' + llamada);
    }
    throw fallo('sintaxis: «' + tk.v + '» inesperado en ' + tk.pos);
  }
  /** Una primitiva de verificación (§12): f(a, b…), con su número de argumentos. */
  function llamadaPura(f, tabla = VERIFICACION) {
    i++; // «(»
    entrar();
    const args = [];
    if (!es('op', ')')) {
      for (;;) {
        args.push(expresion());
        if (!es('op', ',')) break;
        i++;
      }
    }
    esperar('op', ')');
    salir();
    const { forma, aridad: [min, max] } = tabla[f];
    if (args.length < min || args.length > max) {
      throw fallo('sintaxis: ' + forma + ' lleva ' + (min === max ? min : max === Infinity ? 'al menos ' + min : min + ' o ' + max) + (min === 1 && max === 1 ? ' argumento' : ' argumentos') + ', no ' + args.length);
    }
    return { n: 'llamada', f, args, posicionable: true };
  }
  /** ¿Empieza un operando en el token de ahora? (tras un símbolo de primitiva: entonces es un verbo). */
  function empiezaOperando() {
    const tk = ver();
    if (!tk) return false;
    if (tk.t === 'num' || tk.t === 'txt') return true;
    if (tk.t === 'op') return tk.v === '(';
    return tk.t === 'id' && (EMPIEZA_OPERANDO.has(tk.v) || NIVEL_IT.test(tk.v));
  }
  /**
   * Un verbo (VG 12-11, decisión 5): «v q S» y sus enlaces (from to exit when price), en cualquier orden y una vez
   * cada uno. q es una suma; S, una expresión prefija (la serie: T.1, R.(me), before.4.(…), (first …)).
   */
  function verbo(v) {
    entrar();
    const q = suma();
    if (!empiezaOperando()) throw fallo('sintaxis: ' + v + ' q S…: falta la serie ' + donde());
    const s = prefija();
    const enlaces = {};
    while (es('id') && ENLACES.includes(ver().v)) {
      const k = ver().v;
      i++;
      if (enlaces[k]) throw fallo('sintaxis: «' + k + '» dos veces en un ' + v);
      enlaces[k] = suma();
    }
    salir();
    const pide = { mint: ['to'], transfer: ['from', 'to'], lock: ['from', 'exit'], release: ['from', 'exit'], burn: ['from'] }[v];
    const admite = { mint: ['to', 'price', 'when'], transfer: ['from', 'to', 'exit', 'when'], lock: ['from', 'exit'], release: ['from', 'exit'], burn: ['from', 'when'] }[v];
    for (const k of pide) if (!enlaces[k]) throw fallo('sintaxis: ' + v + ' lleva «' + k + '»: ' + FORMAS[v]);
    for (const k of Object.keys(enlaces)) if (!admite.includes(k)) throw fallo('sintaxis: ' + v + ' no lleva «' + k + '»: ' + FORMAS[v]);
    return { n: 'verbo', v, q, s, ...enlaces };
  }

  // El espacio de cada nodo (§15.5): ini y fin, las posiciones en el texto (sin el «=») donde empieza y acaba lo que lo
  // escribe. Cada función de la gramática marca el nodo que devuelve si aún no lo está; los nodos de en medio de una
  // cadena (a or b or c) lo toman de sus hijos al final. No cambia lo que vale nada.
  const conEspacio = (f) => (...args) => {
    const ini = i;
    const n = f(...args);
    if (n && typeof n === 'object' && typeof n.n === 'string' && n.ini === undefined && tokens[ini]) {
      n.ini = tokens[ini].pos;
      n.fin = tokens[i - 1]?.fin ?? n.ini;
    }
    return n;
  };
  expresion = conEspacio(expresion);
  disyuncion = conEspacio(disyuncion);
  conjuncion = conEspacio(conjuncion);
  negacion = conEspacio(negacion);
  comparacion = conEspacio(comparacion);
  union = conEspacio(union);
  suma = conEspacio(suma);
  producto = conEspacio(producto);
  prefija = conEspacio(prefija);
  posfija = conEspacio(posfija);
  primaria = conEspacio(primaria);

  if (!tokens.length) throw fallo('sintaxis: expresión vacía');
  const arbol = expresion();
  if (i < tokens.length) throw fallo('sintaxis: sobra ' + donde());
  rellenarEspacios(arbol);
  Object.defineProperty(arbol, 'fuente', { value: cuerpo });
  return arbol;
}

/** Los nodos sin espacio (los de en medio de una cadena) lo toman de sus hijos: del primero al último. */
function rellenarEspacios(n) {
  if (!n || typeof n !== 'object' || typeof n.n !== 'string') return;
  let ini = Infinity;
  let fin = -Infinity;
  for (const x of Object.values(n)) {
    for (const h of Array.isArray(x) ? x : [x]) {
      if (!h || typeof h !== 'object' || typeof h.n !== 'string') continue;
      rellenarEspacios(h);
      if (h.ini < ini) ini = h.ini;
      if (h.fin > fin) fin = h.fin;
    }
  }
  if (n.ini === undefined && ini !== Infinity) {
    n.ini = ini;
    n.fin = fin;
  }
}

// ---------- evaluación ----------

const esNodo = (o) => o !== null && typeof o === 'object';

/**
 * Evalúa una expresión (texto, con o sin «=», o el árbol de analizar) en un
 * contexto. Devuelve { estado: 'RESUELTO', valor, texto } (valor: la lista de
 * ocupantes; texto: cómo se lee) o { estado: 'PENDIENTE' | 'ERROR', motivo }.
 * No lanza. Los límites son los de la época del contexto (limitesDeEpoca, #100: el menor entre su 8.8 y LIMITES) o,
 * sin época, LIMITES; opciones.limites los cambia (pasos, ocupantes, anidamiento, hilo, bytes). Un límite agotado da
 * PENDIENTE con subtipo «PENDIENTE POR LÍMITE».
 */
export function evaluar(src, contexto, opciones = {}) {
  // La memoria de las lecturas de pantalla (§15.4): solo con opciones.lectura (nunca con mover ni escribir) y una
  // MemoriaDeLectura que trae quien llama; una evaluación entera se recuerda por (fórmula, sujeto, mirada, límites).
  const memoria = opciones.lectura === true && !opciones.mover && !opciones.escribir && opciones.memoria instanceof MemoriaDeLectura ? opciones.memoria : null;
  const huella = memoria ? huellaDe(contexto) : undefined;
  const clave = huella ? claveDeEvaluacion(src, opciones, contexto, huella.mirada) : undefined;
  if (clave) {
    const r = memoria.leer(huella.libro, clave);
    if (r) {
      if (opciones.presupuesto instanceof Presupuesto) opciones.presupuesto.pasos += 1;
      return r.valor ? { ...r, valor: [...r.valor] } : { ...r };
    }
  }
  const fuera = contexto?.vistasDeFuera;
  const r = evaluarSinMemoria(src, contexto, opciones, huella ? { memoria, ...huella } : null);
  if (clave && r.subtipo !== POR_LIMITE && contexto?.vistasDeFuera === fuera) memoria.guardar(huella.libro, clave, r.valor ? { ...r, valor: [...r.valor] } : { ...r });
  return r;
}

function evaluarSinMemoria(src, contexto, opciones, recuerdo) {
  try {
    const conSujeto = Object.hasOwn(opciones, 'sujeto');
    const lim = limitesDe(contexto, opciones);
    const arbol = typeof src === 'string' ? analizar(src, { sujeto: conSujeto, anidamiento: lim.anidamiento }) : src;
    // Invariante del núcleo (VG 12-11, decisión 6): mover es de las plantillas; las reglas solo leen. Se mira el árbol
    // entero, no lo que se llega a evaluar: un verbo detrás de un and que da falso también es ERROR.
    const { verbo, put } = queMueve(arbol);
    if (verbo && !opciones.mover) throw fallo(verbo + ': solo una plantilla de transacción mueve (la firma quien la lanza); una regla solo lee (invariante del núcleo)');
    if (put && !opciones.mover && !opciones.escribir) throw fallo('put: solo en una regla que escribe (put en su 4) o en una plantilla de transacción');
    // keep (§15) convierte un PENDIENTE en «se cae»: solo vale en una lectura para la pantalla (opciones.lectura), nunca
    // con mover ni escribir. Como los verbos, se mira el árbol entero.
    const lectura = opciones.lectura === true && !opciones.mover && !opciones.escribir;
    if (!lectura && llevaKeep(arbol)) throw fallo(SOLO_EN_LECTURA);
    const st = {
      ctx: contexto, its: conSujeto ? [opciones.sujeto] : [], pasos: 0, tope: lim.pasos, hilo: lim.hilo, presupuesto: opciones.presupuesto instanceof Presupuesto ? opciones.presupuesto : new Presupuesto(lim.ocupantes, lim.bytes),
      escrituras: opciones.escribir && !opciones.mover ? [] : null, movimientos: opciones.mover ? [] : null,
      lectura, aplicando: [], topeAplicacion: opciones.limites?.aplicacion ?? TOPE_DE_APLICACION, anidamiento: lim.anidamiento,
      // La memoria (§15.4), solo en una lectura: dónde se recuerda, el libro y la mirada, los límites y las subexpresiones
      // cerradas del árbol que se evalúa (las que no leen ningún it de fuera).
      memoria: recuerdo?.memoria ?? null, libro: recuerdo?.libro, mirada: recuerdo?.mirada,
      claveDeLimites: recuerdo ? JSON.stringify([lim, opciones.limites?.aplicacion ?? TOPE_DE_APLICACION]) : '',
      cerrados: recuerdo ? cerradosDe(arbol) : null,
    };
    const valor = calcular(arbol, st);
    return { estado: 'RESUELTO', valor, texto: textoDe(valor, contexto), ...(st.escrituras ? { escrituras: st.escrituras } : {}), ...(st.movimientos ? { movimientos: st.movimientos } : {}) };
  } catch (e) {
    if (e instanceof Parada) return { estado: e.estado, ...(e.subtipo ? { subtipo: e.subtipo } : {}), motivo: e.message };
    return { estado: 'ERROR', motivo: 'fallo al evaluar: ' + e.message };
  }
}

// ---------- el porqué de un veredicto (Core AGRAM 18-11, 8a de docs/notas/NUCLEO_6_7_8.md; docs/BQLM.md §15.5) ----------

/** Los topes de forma de una explicación: niveles del árbol, muestras de un where y nodos en total. */
export const TOPES_DE_EXPLICAR = Object.freeze({ niveles: 6, muestras: 3, nodos: 20 });

/** Lo que pone una explicación cortada por su presupuesto. */
export const EXPLICACION_CORTADA = 'no se puede explicar más: límite de cálculo';

/** Una parada de la pasada de explicar: su presupuesto propio se agotó. */
class Corte extends Error {}

/**
 * explicar (8a): lo MISMO que `evaluar` (el veredicto lo da `evaluar` con las mismas opciones: estado, valor, texto,
 * subtipo, motivo) y, además, `porque`: un árbol pequeño que dice qué parte decidió el veredicto, qué valían sus lados y
 * sobre qué elemento. Es una pasada aparte, solo a petición, con su propio presupuesto (del tamaño de los límites de la
 * evaluación) y sus topes de forma (TOPES_DE_EXPLICAR): al agotarlos se corta («no se puede explicar más: límite de
 * cálculo») sin tocar el veredicto. Solo lee: con mover o escribir no explica (ERROR), y no entra en lo que se firma ni
 * en una regla (nadie del núcleo la llama ahí). No usa la memoria de lectura. No lanza.
 *
 * Cada nodo de `porque`: { expr (el trozo de la fórmula), dio (true, false, PENDIENTE, ERROR o RESUELTO), vale (lo que da,
 * o en una comparación lo de cada lado; como mucho 3 ocupantes), sobre (el elemento que era it en ese punto), motivo (si
 * paró), hijos, y en un where: de (cuántos había), pasan, muestras (hasta 3 de los que no pasan, los que más partes de la
 * condición cumplen, cada uno con la parte que falla) }.
 */
export function explicar(src, contexto, opciones = {}) {
  if (opciones.mover || opciones.escribir) return { estado: 'ERROR', motivo: 'explicar solo lee: no explica una plantilla de transacción ni una regla que escribe', porque: null };
  const r = evaluar(src, contexto, opciones);
  let porque;
  try {
    porque = porqueDe(src, contexto, opciones, r);
  } catch (e) {
    porque = { expr: typeof src === 'string' ? src : textoDeNodo(src, src?.fuente), dio: r.estado, motivo: e instanceof Parada ? e.message : 'no se puede explicar: ' + e.message };
  }
  return { ...r, porque };
}

function porqueDe(src, contexto, opciones, r) {
  const conSujeto = Object.hasOwn(opciones, 'sujeto');
  const lim = limitesDe(contexto, opciones);
  let arbol;
  try {
    arbol = typeof src === 'string' ? analizar(src, { sujeto: conSujeto, anidamiento: lim.anidamiento }) : src;
  } catch (e) {
    return { expr: String(src), dio: r.estado, motivo: e.message };
  }
  const fuente = arbol.fuente;
  // Lo que el veredicto ya dijo antes de calcular (sintaxis, un verbo, put o keep fuera de sitio): eso es el porqué.
  const { verbo, put } = queMueve(arbol);
  const lectura = opciones.lectura === true;
  if (verbo || put || (!lectura && llevaKeep(arbol))) return { expr: textoDeNodo(arbol, fuente), dio: r.estado, motivo: r.motivo };
  const st = {
    ctx: contexto, its: conSujeto ? [opciones.sujeto] : [], pasos: 0, tope: lim.pasos, hilo: lim.hilo, presupuesto: new Presupuesto(lim.ocupantes, lim.bytes),
    escrituras: null, movimientos: null, lectura, aplicando: [], topeAplicacion: opciones.limites?.aplicacion ?? TOPE_DE_APLICACION, anidamiento: lim.anidamiento,
    memoria: null, cerrados: null, claveDeLimites: '',
  };
  const ex = { st, fuente, nodos: 0, cortado: false };
  const raiz = explicarNodo(arbol, ex, 0);
  if (conSujeto && raiz) {
    raiz.sobre = leerCorto([opciones.sujeto], contexto);
    raiz.sobreValor = aplanar([opciones.sujeto], contexto)[0];
  }
  if (ex.cortado && raiz) raiz.cortada = EXPLICACION_CORTADA;
  return raiz;
}

/** El trozo de la fórmula que escribe un nodo (§15.5: su espacio), o su clase si no lo tiene. */
function textoDeNodo(n, fuente) {
  if (typeof fuente === 'string' && Number.isInteger(n?.ini) && Number.isInteger(n?.fin)) return fuente.slice(n.ini, n.fin);
  return n?.n ?? '';
}

/** Cómo se lee una lista, corta: como mucho tres ocupantes. */
function leerCorto(lista, ctx) {
  return textoDe(lista.slice(0, 3), ctx) + (lista.length > 3 ? '… (' + lista.length + ')' : '');
}

/** Lo que da un nodo en la pasada de explicar: { valor } o { parada }. Un límite agotado corta la explicación. */
function medir(n, ex) {
  try {
    return { valor: calcular(n, ex.st) };
  } catch (e) {
    if (e instanceof Parada && e.subtipo === POR_LIMITE) {
      ex.cortado = true;
      throw new Corte();
    }
    if (e instanceof Parada) return { parada: e };
    return { parada: fallo('fallo al evaluar: ' + e.message) };
  }
}

const sinParentesis = (n) => {
  while (n?.n === 'paren') n = n.e;
  return n;
};

/** Los términos de un and, aplanados: a and b and c → [a, b, c]. */
function terminos(n) {
  n = sinParentesis(n);
  return n?.n === 'and' ? [...terminos(n.a), ...terminos(n.b)] : [n];
}

// Lo que cuelga de un nodo, en el orden en que se evalúa (sin el cuerpo de las palabras que dan it: ese va por elemento).
const ORDEN_DE_HIJOS = ['base', 'k', 'a', 'arg', 'expr', 'b', 'v', 't', 'q', 's'];
function hijosEnOrden(n) {
  const fuera = [];
  for (const k of ORDEN_DE_HIJOS) if (n[k] && typeof n[k] === 'object' && typeof n[k].n === 'string' && !(CUERPO[n.n] === k)) fuera.push(n[k]);
  for (const k of ['args', 'partes']) for (const h of Array.isArray(n[k]) ? n[k] : []) if (h && typeof h.n === 'string') fuera.push(h);
  return fuera;
}

/** Con `it` (del nivel `nivel`) = o, calcula f; deja it como estaba. */
function conIt(st, nivel, o, f) {
  const antes = st.its[nivel - 1];
  st.its[nivel - 1] = o;
  try {
    return f();
  } finally {
    st.its[nivel - 1] = antes;
  }
}

/** Los valores planos de una lista, para quien los pinta (contrato.legible): como mucho tres. */
const planos = (lista, ctx) => aplanar(lista.slice(0, 3), ctx);

/**
 * Qué es un lado de una comparación o lo que recorre un where (8b, para el texto en llano): su trozo; si es una posición
 * (it.d…, me.d…, (expr).d…, envuelta o no en first, last o count), sus dígitos y de qué es (su base: qué clase de nodo, su
 * valor plano, y si es it, me, ev, epoch o before); si es un literal, su valor; si es it, su nivel.
 */
function ladoDe(n, ex) {
  n = sinParentesis(n);
  if (!n) return null;
  const fuera = { expr: textoDeNodo(n, ex.fuente) };
  if (n.n === 'pref' && (n.op === 'first' || n.op === 'last' || n.op === 'count')) return { ...ladoDe(n.arg, ex), expr: fuera.expr, envuelto: n.op };
  if (n.n === 'lit') return { ...fuera, literal: true, valor: planos([n.v], ex.st.ctx)[0] };
  if (n.n === 'it') return { ...fuera, it: n.nivel };
  if (n.n === 'nombre') return { ...fuera, nombre: n.v };
  if (n.n === 'paso') {
    const b = sinParentesis(n.base);
    // payload(X).d: la posición d de lo escrito en X; su base es X (el registro), marcada como payload.
    if (b.n === 'llamada' && b.f === 'payload' && b.args?.length === 1) {
      const x = medir(b.args[0], ex);
      const o = x.valor?.length === 1 ? x.valor[0] : undefined;
      return { ...fuera, digitos: [...n.digitos], cada: Boolean(n.each), base: { expr: textoDeNodo(b, ex.fuente), k: o === undefined ? null : o && typeof o === 'object' ? o.k ?? 'nodo' : typeof o, valor: o === undefined ? null : planos([o], ex.st.ctx)[0], payload: true } };
    }
    const m = medir(b, ex);
    const o = m.valor?.length === 1 ? m.valor[0] : undefined;
    return {
      ...fuera, digitos: [...n.digitos], cada: Boolean(n.each),
      base: { expr: textoDeNodo(b, ex.fuente), k: o === undefined ? null : o && typeof o === 'object' ? o.k ?? 'nodo' : typeof o, valor: o === undefined ? null : planos([o], ex.st.ctx)[0], ...(b.n === 'nombre' ? { nombre: b.v } : b.n === 'it' ? { it: b.nivel } : {}) },
    };
  }
  return fuera;
}

function explicarNodo(n, ex, nivel) {
  n = sinParentesis(n);
  if (!n || ex.cortado || nivel >= TOPES_DE_EXPLICAR.niveles || ex.nodos >= TOPES_DE_EXPLICAR.nodos) return null;
  ex.nodos++;
  const { st } = ex;
  const ctx = st.ctx;
  const nodo = { expr: textoDeNodo(n, ex.fuente), clase: n.n };
  let m;
  try {
    m = medir(n, ex);
  } catch (e) {
    if (e instanceof Corte) return { ...nodo, dio: 'PENDIENTE', motivo: EXPLICACION_CORTADA };
    throw e;
  }
  const hijos = [];
  const anadir = (h) => {
    if (h) hijos.push(h);
  };
  const debajo = (h) => {
    try {
      return explicarNodo(h, ex, nivel + 1);
    } catch (e) {
      if (e instanceof Corte) return null;
      throw e;
    }
  };
  try {
    if (m.parada) {
      nodo.dio = m.parada.estado;
      nodo.motivo = m.parada.message;
      // Dónde se paró: el primer hijo que se para; en una palabra que da it, el primer elemento cuyo cuerpo se para.
      let culpable = null;
      for (const h of hijosEnOrden(n)) {
        if (medir(h, ex).parada) {
          culpable = h;
          break;
        }
      }
      if (culpable) anadir(debajo(culpable));
      else if (!CUERPO[n.n] && hijosEnOrden(n).length) {
        // Se paró en la operación misma (una división por cero, una lista donde hacía falta un valor): lo que valían sus lados.
        nodo.vale = hijosEnOrden(n).map((h) => leerCorto(medir(h, ex).valor ?? [], ctx));
        nodo.lados = hijosEnOrden(n).map((h) => ladoDe(h, ex));
        nodo.valores = hijosEnOrden(n).map((h) => planos(medir(h, ex).valor ?? [], ctx));
      } else if (CUERPO[n.n]) {
        const base = medir(n.base, ex).valor ?? [];
        for (const o of base) {
          const cuerpo = n[CUERPO[n.n]];
          if (conIt(st, n.nivel, o, () => medir(cuerpo, ex)).parada) {
            const h = conIt(st, n.nivel, o, () => debajo(cuerpo));
            const sobre = { sobre: leerCorto([o], ctx), sobreValor: planos([o], ctx)[0] };
            anadir(h ? { ...h, ...sobre } : { expr: textoDeNodo(cuerpo, ex.fuente), ...sobre });
            break;
          }
        }
      }
    } else {
      const v = m.valor;
      const booleano = v.length === 1 && typeof v[0] === 'boolean';
      nodo.dio = booleano ? v[0] : 'RESUELTO';
      if (!booleano) {
        nodo.vale = leerCorto(v, ctx);
        nodo.valores = planos(v, ctx);
        nodo.cuantos = v.length;
      }
      if (n.n === 'and') {
        // Falso: el primer término falso (es perezoso, como evaluar). Verdadero: los dos.
        if (!v[0]) anadir(debajo(medir(n.a, ex).valor?.[0] === false ? n.a : n.b));
        else { anadir(debajo(n.a)); anadir(debajo(n.b)); }
      } else if (n.n === 'or') {
        if (v[0]) anadir(debajo(medir(n.a, ex).valor?.[0] === true ? n.a : n.b));
        else { anadir(debajo(n.a)); anadir(debajo(n.b)); }
      } else if (n.n === 'not') {
        anadir(debajo(n.a));
      } else if (n.n === 'cmp') {
        // Una comparación es una hoja: lo que vale cada lado. Si un lado es count (M where c), por qué pasan los que pasan.
        const va = medir(n.a, ex).valor ?? [];
        const vb = medir(n.b, ex).valor ?? [];
        nodo.vale = [leerCorto(va, ctx), leerCorto(vb, ctx)];
        nodo.op = n.op;
        nodo.lados = [ladoDe(n.a, ex), ladoDe(n.b, ex)];
        nodo.valores = [planos(va, ctx), planos(vb, ctx)];
        nodo.cuantos = [va.length, vb.length];
        for (const lado of [n.a, n.b]) {
          const l = sinParentesis(lado);
          const w = l?.n === 'pref' && l.op === 'count' ? sinParentesis(l.arg) : null;
          if (w && (w.n === 'where' || w.n === 'keep')) anadir(explicarWhere(w, ex, nivel + 1));
        }
      } else if (n.n === 'where' || n.n === 'keep') {
        explicarWhere(n, ex, nivel + 1, nodo);
      }
    }
  } catch (e) {
    if (!(e instanceof Corte)) throw e;
  }
  if (hijos.length) nodo.hijos = hijos;
  return nodo;
}

/**
 * Un where (o un keep): cuántos había, cuántos pasan y, si no pasa ninguno, las muestras: los que más términos de la
 * condición cumplen (los de su and), cada uno con el término que falla explicado. Si `nodo` se da, se completa ese.
 */
function explicarWhere(w, ex, nivel, nodo) {
  if (ex.cortado || nivel >= TOPES_DE_EXPLICAR.niveles || ex.nodos >= TOPES_DE_EXPLICAR.nodos) return null;
  const { st } = ex;
  const ctx = st.ctx;
  const fuera = nodo ?? (ex.nodos++, { expr: textoDeNodo(w, ex.fuente), clase: w.n });
  fuera.m = ladoDe(w.base, ex);
  fuera.c = textoDeNodo(w.cond, ex.fuente);
  const base = medir(w.base, ex);
  if (base.parada) return fuera;
  const partes = terminos(w.cond);
  const filas = base.valor.map((o, k) => {
    const dan = partes.map((p) => conIt(st, w.nivel, o, () => medir(p, ex)));
    return { o, k, cumple: dan.filter((d) => d.valor?.length === 1 && d.valor[0] === true).length, falla: partes.find((_, j) => !(dan[j].valor?.length === 1 && dan[j].valor[0] === true)) };
  });
  fuera.de = filas.length;
  fuera.pasan = filas.filter((f) => !f.falla).length;
  if (!nodo) fuera.dio = fuera.pasan;
  if (fuera.pasan === 0 && filas.length) {
    const muestras = [...filas].sort((a, b) => b.cumple - a.cumple || a.k - b.k).slice(0, TOPES_DE_EXPLICAR.muestras);
    fuera.muestras = [];
    for (const f of muestras) {
      if (ex.cortado || ex.nodos >= TOPES_DE_EXPLICAR.nodos) break;
      const h = conIt(st, w.nivel, f.o, () => {
        try {
          return explicarNodo(f.falla, ex, nivel + 1);
        } catch (e) {
          if (e instanceof Corte) return null;
          throw e;
        }
      });
      fuera.muestras.push({ sobre: leerCorto([f.o], ctx), sobreValor: planos([f.o], ctx)[0], cumple: f.cumple + ' de ' + partes.length, cumplen: f.cumple, partes: partes.length, ...(h ? { hijos: [h] } : {}) });
    }
  }
  return fuera;
}

const MUEVE = new WeakMap();
/**
 * Lo que mueve una expresión (su árbol de analizar): { verbo: el primer verbo que lleva, o null; put: si lleva un put }.
 * Mira el árbol entero, también lo que no se llegaría a evaluar. Es la prueba del invariante (decisión 6).
 */
export function queMueve(arbol) {
  if (typeof arbol === 'string') arbol = analizar(arbol, { sujeto: true });
  if (!arbol || typeof arbol !== 'object') return { verbo: null, put: false };
  if (MUEVE.has(arbol)) return MUEVE.get(arbol);
  const fuera = { verbo: null, put: false };
  const pila = [arbol];
  while (pila.length) {
    const n = pila.pop();
    if (!n || typeof n !== 'object' || esSimbolo(n)) continue;
    if (n.n === 'verbo' && !fuera.verbo) fuera.verbo = n.v;
    if (n.n === 'put') fuera.put = true;
    for (const k of Object.keys(n)) {
      const x = n[k];
      if (Array.isArray(x)) pila.push(...x);
      else if (x && typeof x === 'object' && typeof x.n === 'string') pila.push(x);
    }
  }
  MUEVE.set(arbol, fuera);
  return fuera;
}

const SOLO_EN_LECTURA = 'keep: solo en una lectura para la pantalla (opciones.lectura); en una regla, una plantilla o una regla que escribe un PENDIENTE no puede volverse «no»';

const CON_KEEP = new WeakMap();
/** ¿Lleva la expresión (su árbol) un keep en alguna parte, también donde no se llegaría a evaluar? */
function llevaKeep(arbol) {
  if (!arbol || typeof arbol !== 'object') return false;
  if (CON_KEEP.has(arbol)) return CON_KEEP.get(arbol);
  let hay = false;
  const pila = [arbol];
  while (pila.length && !hay) {
    const n = pila.pop();
    if (!n || typeof n !== 'object' || esSimbolo(n)) continue;
    if (n.n === 'keep') hay = true;
    for (const x of Object.values(n)) {
      if (Array.isArray(x)) pila.push(...x);
      else if (x && typeof x === 'object' && typeof x.n === 'string') pila.push(x);
    }
  }
  CON_KEEP.set(arbol, hay);
  return hay;
}

// ---------- la memoria de las lecturas de pantalla (Core AGRAM 18-11; docs/BQLM.md §15.4, pendiente de revisar VG) ----------

/** Cuántas entradas guarda por omisión una MemoriaDeLectura; se tira la más vieja. */
export const ENTRADAS_DE_MEMORIA = 4000;

/**
 * Lo que recuerda una lectura de pantalla (§15.4): la trae quien llama (el contrato, una por eje) en opciones.memoria, y
 * solo se usa con opciones.lectura (nunca con mover ni escribir, ni en evaluarRegla, leerRegla, evaluarEscritura o
 * evaluarPlantilla). Recuerda evaluaciones enteras, aplicaciones de apply(F, x) y subexpresiones cerradas, con su
 * resultado: un RESUELTO, un PENDIENTE corriente o un ERROR, nunca un PENDIENTE POR LÍMITE. Vale mientras el libro no
 * cambie: si la huella del libro del contexto es otra, se vacía entera. Guarda como mucho `tope` entradas.
 */
export class MemoriaDeLectura {
  #entradas = new Map();
  #libro;

  constructor(tope = ENTRADAS_DE_MEMORIA) {
    this.tope = tope;
    this.aciertos = 0;
    this.fallos = 0;
  }

  /** Cuántas entradas tiene. */
  get tamano() {
    return this.#entradas.size;
  }

  #al(libro) {
    if (libro !== this.#libro) {
      this.#entradas.clear();
      this.#libro = libro;
    }
  }

  /** Lo recordado con esta clave para este libro, o undefined (y se cuenta el fallo). */
  leer(libro, clave) {
    this.#al(libro);
    if (!this.#entradas.has(clave)) {
      this.fallos++;
      return undefined;
    }
    const v = this.#entradas.get(clave);
    this.#entradas.delete(clave);
    this.#entradas.set(clave, v);
    this.aciertos++;
    return v;
  }

  /** Recuerda `valor` con esta clave para este libro; si pasa del tope, olvida lo más viejo. */
  guardar(libro, clave, valor) {
    this.#al(libro);
    this.#entradas.set(clave, valor);
    while (this.#entradas.size > this.tope) this.#entradas.delete(this.#entradas.keys().next().value);
  }

  /** Lo olvida todo. */
  vaciar() {
    this.#entradas.clear();
    this.#libro = undefined;
  }
}

/** La huella de lo que ve el contexto, partida en { libro, mirada } (ContextoEje.huella), o undefined si no la da. */
function huellaDe(contexto) {
  const h = typeof contexto?.huella === 'function' ? contexto.huella() : undefined;
  if (typeof h !== 'string') return undefined;
  const k = h.indexOf('#');
  return k < 0 ? { libro: h, mirada: '' } : { libro: h.slice(0, k), mirada: h.slice(k + 1) };
}

/** La clave de un sujeto (it) para recordar: un valor plano o un registro; lo demás (una décupla, un nodo), undefined. */
function claveDeSujeto(x) {
  if (typeof x === 'string') return 's:' + x;
  if (typeof x === 'number') return 'n:' + x;
  if (typeof x === 'boolean') return 'b:' + x;
  if (x && typeof x === 'object' && x.k === 'reg' && typeof x.id === 'string') return 'r:' + x.id;
  return undefined;
}

const SERIALES = new WeakMap();
let ultimoSerial = 0;
/** Un número por nodo de un árbol (los árboles analizados se guardan por su texto: el mismo nodo, el mismo número). */
function serialDe(o) {
  if (!SERIALES.has(o)) SERIALES.set(o, ++ultimoSerial);
  return SERIALES.get(o);
}

/** La clave de una evaluación entera: la fórmula (su texto, o el número de su árbol), el sujeto, la mirada y los límites. */
function claveDeEvaluacion(src, opciones, contexto, mirada) {
  const formula = typeof src === 'string' ? 't:' + src : src && typeof src === 'object' ? 'a:' + serialDe(src) : undefined;
  if (formula === undefined) return undefined;
  let sujeto = '-';
  if (Object.hasOwn(opciones, 'sujeto')) {
    sujeto = claveDeSujeto(opciones.sujeto);
    if (sujeto === undefined) return undefined;
  }
  return 'E|' + formula + '|' + sujeto + '|' + mirada + '|' + JSON.stringify([limitesDe(contexto, opciones), opciones.limites?.aplicacion ?? TOPE_DE_APLICACION]);
}

// Los nodos que vale la pena recordar cuando son cerrados (leen posiciones, recorren, aplican); los demás (literales,
// aritmética, comparaciones) se calculan, y se recuerdan sus hijos cerrados.
const RECORDABLES = new Set(['paso', 'clave', 'where', 'keep', 'by', 'group', 'follow', 'mapa', 'with', 'pref', 'nth', 'take', 'llamada', 'cited']);
// Las palabras que dan el siguiente it a su cuerpo (where, by…): su `nivel` está atado dentro de ese cuerpo.
const CUERPO = { where: 'cond', keep: 'cond', by: 'clave', group: 'clave', follow: 'rel', mapa: 'e' };

const CERRADOS = new WeakMap();
/**
 * Las subexpresiones cerradas de un árbol que se recuerdan (§15.4): las que no leen ningún it de fuera de ellas (sus
 * valores dependen solo del contexto, de la pila de apply y de los límites), de las clases de RECORDABLES, y la más alta
 * de cada rama (no la raíz: esa la recuerda la evaluación entera o apply).
 */
function cerradosDe(raiz) {
  if (CERRADOS.has(raiz)) return CERRADOS.get(raiz);
  const libres = new Map();
  const hijos = (n) => {
    const fuera = [];
    for (const [k, x] of Object.entries(n)) {
      if (k === 'base' || k === 'cond' || k === 'clave' || k === 'rel' || k === 'e' || k === 'a' || k === 'b' || k === 'arg' || k === 'k' || k === 'expr' || k === 'v' || k === 't' || k === 'q' || k === 's' || ENLACES.includes(k)) {
        if (x && typeof x === 'object' && typeof x.n === 'string') fuera.push([k, x]);
      } else if (k === 'args' || k === 'partes') {
        for (const y of x) if (y && typeof y === 'object' && typeof y.n === 'string') fuera.push([k, y]);
      }
    }
    return fuera;
  };
  const libresDe = (n) => {
    if (libres.has(n)) return libres.get(n);
    const l = new Set();
    if (n.n === 'it') l.add(n.nivel);
    for (const [k, h] of hijos(n)) {
      for (const v of libresDe(h)) if (!(CUERPO[n.n] === k && v === n.nivel)) l.add(v);
    }
    libres.set(n, l);
    return l;
  };
  const marcados = new Set();
  const marcar = (n, raizDeArbol) => {
    if (!raizDeArbol && RECORDABLES.has(n.n) && libresDe(n).size === 0) {
      marcados.add(n);
      return;
    }
    for (const [, h] of hijos(n)) marcar(h, false);
  };
  marcar(raiz, true);
  CERRADOS.set(raiz, marcados);
  return marcados;
}

/**
 * Lo recordado con esta clave o, si no lo hay, lo que da `calcularlo`, que se recuerda (§15.4). Un acierto cuesta un paso
 * y repite lo que pasó: el valor o la misma parada. No se recuerda un PENDIENTE POR LÍMITE, ni lo que leyó una vista de
 * fuera del libro (contexto.vistasDeFuera: el sello, el recibo, el pago), que cambia sin cambiar la huella.
 */
function recordar(st, clave, calcularlo) {
  const r = st.memoria.leer(st.libro, clave);
  if (r) {
    paso(st);
    if (r.parada) throw r.parada;
    return [...r.valor];
  }
  const fuera = st.ctx?.vistasDeFuera;
  let valor;
  try {
    valor = calcularlo();
  } catch (e) {
    if (e instanceof Parada && e.subtipo !== POR_LIMITE && st.ctx?.vistasDeFuera === fuera) st.memoria.guardar(st.libro, clave, { parada: e });
    throw e;
  }
  if (st.ctx?.vistasDeFuera === fuera) st.memoria.guardar(st.libro, clave, { valor: [...valor] });
  return valor;
}

function paso(st, n = 1) {
  st.pasos += n;
  st.presupuesto.pasos += n;
  if (st.pasos > st.tope) throw porLimite('más de ' + st.tope + ' pasos');
}

function valorDe(o, ctx) {
  if (typeof o === 'number' || typeof o === 'string' || typeof o === 'boolean' || esSimbolo(o) || esBytes(o)) return o;
  if (esPura(o)) return undefined;
  return esNodo(o) ? ctx.valor?.(o) : undefined;
}

/** ¿Son el mismo valor? Los bytes, byte a byte; lo demás, idéntico. */
function mismo(a, b) {
  if (esBytes(a) || esBytes(b)) return esBytes(a) && esBytes(b) && igualesBytes(a.b, b.b);
  return a === b;
}

function leer(o, ctx) {
  if (typeof o === 'string') return o;
  if (typeof o === 'number' || typeof o === 'boolean') return String(o);
  if (esSimbolo(o)) return o.simbolo;
  if (esBytes(o)) return aHex(o.b);
  if (esPura(o)) return o.largo === undefined ? '«décupla»' : '[' + o.pos.slice(0, o.largo).map((l) => textoDe(l, ctx)).join(' | ') + ']';
  return ctx?.texto?.(o) ?? (valorDe(o, ctx) !== undefined ? String(valorDe(o, ctx)) : '«décupla»');
}

/** Cómo se lee una lista de ocupantes: sus textos separados por comas; vacía, «∅». */
export function textoDe(lista, contexto) {
  return lista.length ? lista.map((o) => leer(o, contexto)).join(', ') : '∅';
}

/** El único elemento de una lista: vacía → PENDIENTE; de más de uno → ERROR (decisión G3). */
function uno(lista, donde, ctx) {
  if (lista.length === 0) throw pendiente(donde + ': la posición está vacía, falta un valor');
  if (lista.length > 1) throw fallo(donde + ': es una lista de ' + lista.length + ' (' + textoDe(lista.slice(0, 3), ctx) + (lista.length > 3 ? '…' : '') + '); usa first, last, nth, count o sum');
  return lista[0];
}

function numero(lista, donde, ctx) {
  const v = valorDe(uno(lista, donde, ctx), ctx);
  if (typeof v !== 'number') throw fallo(donde + ' espera un número, no «' + leer(lista[0], ctx) + '»');
  return v;
}

function booleano(lista, donde, ctx) {
  if (lista.length !== 1 || typeof lista[0] !== 'boolean') throw fallo(donde + ' espera verdadero o falso, no «' + textoDe(lista, ctx) + '»');
  return lista[0];
}

/** Los nombres de un ocupante, para el índice por valor: su valor, o los valores de su 0. */
function nombresDe(o, st) {
  const v = valorDe(o, st.ctx);
  if (v !== undefined) return [v];
  paso(st);
  return bajar(o, [0], st).map((x) => valorDe(x, st.ctx)).filter((x) => x !== undefined);
}

function igual(A, B, ctx) {
  if (A.length === 0 || B.length === 0) return A.length === 0 && B.length === 0;
  const a = valorDe(uno(A, 'comparar', ctx), ctx);
  const b = valorDe(uno(B, 'comparar', ctx), ctx);
  if (a === undefined || b === undefined) throw fallo('comparar: una décupla no tiene valor; lee una de sus posiciones');
  return mismo(a, b);
}

/**
 * Los ocupantes de la posición `digitos` de un ocupante: los del contexto o, si es una décupla pura (§12), los suyos.
 * Los bytes no tienen posiciones (se cortan con slice); un número tampoco.
 */
function bajar(o, digitos, st) {
  if (!esPura(o) && !esBytes(o)) return st.ctx.ocupantes(o, digitos, st.presupuesto);
  let actual = [o];
  for (const d of digitos) {
    actual = actual.flatMap((x) => {
      if (esBytes(x)) throw fallo('los bytes no tienen posiciones: córtalos con slice(b, desde, hasta)');
      if (esPura(x)) return x.pos[d];
      if (typeof x === 'number' || typeof x === 'boolean') return [];
      return st.ctx.ocupantes(x, [d], st.presupuesto);
    });
    st.presupuesto.gastar(actual.length);
  }
  return actual;
}

function calcular(nodo, st) {
  // Una subexpresión cerrada (no lee ningún it de fuera), en una lectura con memoria: se recuerda (§15.4).
  if (st.memoria && st.cerrados?.has(nodo)) return recordar(st, 'C|' + serialDe(nodo) + '|' + JSON.stringify(st.aplicando) + '|' + st.claveDeLimites + '|' + st.mirada, () => calcularNodo(nodo, st));
  return calcularNodo(nodo, st);
}

function calcularNodo(nodo, st) {
  const { ctx } = st;
  switch (nodo.n) {
    case 'lit':
      return [nodo.v];
    case 'nombre': {
      const x = ctx.nombre(nodo.v);
      if (x === undefined) throw pendiente('no hay ' + nodo.v + ' en este contexto');
      return [x];
    }
    case 'it':
      return [st.its[nodo.nivel - 1]];
    case 'paren':
      return calcular(nodo.e, st);
    case 'paso': {
      const base = calcular(nodo.base, st);
      paso(st, base.length || 1);
      return base.flatMap((o) => bajar(o, nodo.digitos, st));
    }
    case 'clave': {
      const base = calcular(nodo.base, st);
      const v = valorDe(uno(calcular(nodo.expr, st), 'la posición entre paréntesis', ctx), ctx);
      if (typeof v === 'number') {
        if (!Number.isInteger(v) || v < 0 || v > 9) throw fallo('una posición es un dígito 0-9, no ' + v);
        paso(st, base.length || 1);
        return base.flatMap((o) => bajar(o, [v], st));
      }
      if (typeof v !== 'string') throw fallo('una posición por valor es un dígito o un texto, no «' + v + '»');
      return base.filter((o) => nombresDe(o, st).includes(v));
    }
    case 'where': {
      const base = calcular(nodo.base, st);
      const antes = st.its[nodo.nivel - 1];
      const fuera = [];
      try {
        for (const o of base) {
          paso(st);
          st.its[nodo.nivel - 1] = o;
          if (booleano(calcular(nodo.cond, st), 'where', ctx)) fuera.push(o);
        }
      } finally {
        st.its[nodo.nivel - 1] = antes;
      }
      return fuera;
    }
    case 'by': {
      // Ordenar (VG 12-11): por la clave de cada elemento (un número o un texto, todas del mismo tipo), de menor a mayor;
      // los empates, en el orden en que llegan. Una clave vacía es PENDIENTE; una lista de más de uno, ERROR (como G3).
      const base = calcular(nodo.base, st);
      const antes = st.its[nodo.nivel - 1];
      const claves = [];
      try {
        for (const o of base) {
          paso(st);
          st.its[nodo.nivel - 1] = o;
          const x = uno(calcular(nodo.clave, st), 'by', ctx);
          const v = valorDe(x, ctx);
          if (typeof v !== 'number' && typeof v !== 'string') throw fallo('by ordena por un número o un texto, no «' + leer(x, ctx) + '»');
          claves.push(v);
        }
      } finally {
        st.its[nodo.nivel - 1] = antes;
      }
      if (new Set(claves.map((v) => typeof v)).size > 1) throw fallo('by: las claves mezclan números y textos');
      return base.map((o, k) => ({ o, k, v: claves[k] })).sort((a, b) => (a.v < b.v ? -1 : a.v > b.v ? 1 : a.k - b.k)).map((x) => x.o);
    }
    case 'group':
      return agrupar(nodo, st);
    case 'follow':
      return seguir(nodo, st);
    case 'keep': {
      // Como where, tolerante (§15): el elemento cuya condición queda PENDIENTE o da ERROR se cae y los demás siguen. Un
      // límite de cálculo (POR_LIMITE) no se traga: un resultado corto por falta de presupuesto sería mentir.
      const base = calcular(nodo.base, st);
      const antes = st.its[nodo.nivel - 1];
      const fuera = [];
      try {
        for (const o of base) {
          paso(st);
          st.its[nodo.nivel - 1] = o;
          let pasa;
          try {
            pasa = booleano(calcular(nodo.cond, st), 'keep', ctx);
          } catch (e) {
            if (!(e instanceof Parada) || e.subtipo === POR_LIMITE) throw e;
            continue;
          }
          if (pasa) fuera.push(o);
        }
      } finally {
        st.its[nodo.nivel - 1] = antes;
      }
      return fuera;
    }
    case 'mapa': {
      // M each (e) (§15): e con el elemento como it (o it2…), y se juntan los resultados en orden.
      const base = calcular(nodo.base, st);
      const antes = st.its[nodo.nivel - 1];
      const fuera = [];
      try {
        for (const o of base) {
          paso(st);
          st.its[nodo.nivel - 1] = o;
          fuera.push(...calcular(nodo.e, st));
        }
      } finally {
        st.its[nodo.nivel - 1] = antes;
      }
      return fuera;
    }
    case 'cited':
      return citados(nodo, st);
    case 'take': {
      // Los n primeros (§15).
      const k = numero(calcular(nodo.k, st), 'take', ctx);
      if (!Number.isInteger(k) || k < 0) throw fallo('take espera un entero ≥ 0, no ' + k);
      paso(st);
      return calcular(nodo.arg, st).slice(0, k);
    }
    case 'with': {
      // Juntar listas (§15): los de A y luego los de B, sin quitar repetidos; cada ocupante cuesta uno del presupuesto.
      const a = calcular(nodo.a, st);
      const b = calcular(nodo.b, st);
      paso(st);
      st.presupuesto.gastar(a.length + b.length);
      return [...a, ...b];
    }
    case 'pref':
      return prefija(nodo.op, calcular(nodo.arg, st), st);
    case 'nth': {
      const k = numero(calcular(nodo.k, st), 'nth', ctx);
      if (!Number.isInteger(k) || k < 0) throw fallo('nth espera un índice entero ≥ 0 (desde 0), no ' + k);
      return calcular(nodo.arg, st).slice(k, k + 1);
    }
    case 'bin': {
      const a = numero(calcular(nodo.a, st), nodo.op, ctx);
      const b = numero(calcular(nodo.b, st), nodo.op, ctx);
      if (nodo.op === '+') return [a + b];
      if (nodo.op === '-') return [a - b];
      if (nodo.op === '*') return [a * b];
      if (b === 0) throw fallo('división por cero');
      return [a / b];
    }
    case 'cmp': {
      if (nodo.op === '=' || nodo.op === '!=') {
        const r = igual(calcular(nodo.a, st), calcular(nodo.b, st), ctx);
        return [nodo.op === '=' ? r : !r];
      }
      if (nodo.op === 'in') {
        const x = calcular(nodo.a, st);
        if (x.length === 0) return [false];
        const v = valorDe(uno(x, 'in', ctx), ctx);
        if (v === undefined) throw fallo('in: una décupla no tiene valor; lee una de sus posiciones');
        return [calcular(nodo.b, st).some((o) => mismo(valorDe(o, ctx), v))];
      }
      const a = numero(calcular(nodo.a, st), nodo.op, ctx);
      const b = numero(calcular(nodo.b, st), nodo.op, ctx);
      if (nodo.op === '<') return [a < b];
      if (nodo.op === '<=') return [a <= b];
      if (nodo.op === '>') return [a > b];
      return [a >= b];
    }
    case 'and':
      if (!booleano(calcular(nodo.a, st), 'and', ctx)) return [false];
      return [booleano(calcular(nodo.b, st), 'and', ctx)];
    case 'or':
      if (booleano(calcular(nodo.a, st), 'or', ctx)) return [true];
      return [booleano(calcular(nodo.b, st), 'or', ctx)];
    case 'not':
      return [!booleano(calcular(nodo.a, st), 'not', ctx)];
    case 'serie': {
      // La serie como posición de su familia (VG 12-11, decisión 5): una parte vacía no hace serie (nada); la serie la
      // da el contexto (D-SERIE), exista ya o no: construir su clave no concede nada (lo deciden las reglas).
      const partes = [];
      for (const p of nodo.partes) {
        const l = calcular(p, st);
        if (!l.length) return [];
        partes.push(valorDe(uno(l, nodo.familia + '.(…)', ctx), ctx));
      }
      if (typeof ctx.serie !== 'function') throw fallo(nodo.familia + '.…: este contexto no construye series');
      const s = ctx.serie(nodo.familia, partes);
      return s === undefined || s === null ? [] : [s];
    }
    case 'verbo':
      return mover(nodo, st);
    case 'llamada':
      if (nodo.f === 'row') return construirFila(nodo, st);
      if (nodo.f === 'apply') return aplicar(nodo, st);
      return verificar(nodo, st);
    case 'put': {
      // En una plantilla (evaluarPlantilla): el nivel en mano, put v at A.1.(S).1 acuña lo que falte.
      if (st.movimientos) return nivelEnMano(nodo, st);
      // Colocar (mapa §16 [D]): anota { sujeto, camino, clave, valor } por cada sujeto de la base del destino y vale
      // verdadero. El destino no se lee: es dónde se escribe. Solo en una regla que escribe (evaluarEscritura), y solo
      // en los destinos de la lista cerrada (invariante del núcleo, decisión 6): el libro acuña sin firma.
      if (!st.escrituras) throw fallo('put: solo en una regla que escribe (put en su 4)');
      if (!DESTINOS_DE_PUT.some((d) => d.length === nodo.t.base.digitos.length && d.every((x, k) => x === nodo.t.base.digitos[k]))) {
        throw fallo('put: una regla que escribe solo coloca en ' + DESTINOS_DE_PUT.map((d) => 'A.' + d.join('.')).join(', ') + ' (el libro, por su cuenta, solo acuña hasta un nivel en una lista cerrada), no en X.' + nodo.t.base.digitos.join('.'));
      }
      const valor = numero(calcular(nodo.v, st), 'put', ctx);
      const sujetos = calcular(nodo.t.base.base, st);
      const clave = valorDe(uno(calcular(nodo.t.expr, st), 'put: la clave', ctx), ctx);
      if (clave === undefined || esSimbolo(clave) || esBytes(clave)) throw fallo('put: la clave del destino es un valor (un id o un texto)');
      paso(st, sujetos.length || 1);
      // `desde`: el elemento del where en que se coloca (el movimiento, en las reglas que recorren ev.1), si lo hay: con
      // él, quien asienta sabe de qué serie viene la colocación (el tope por serie de la obtención, src/eje.js).
      const desde = st.its.filter((x) => x !== undefined).at(-1); // un where anidado ya cerrado deja su hueco en its
      for (const s of sujetos) {
        const sujeto = valorDe(s, ctx);
        if (sujeto === undefined || esSimbolo(sujeto)) continue; // nadie no recibe
        st.escrituras.push({ sujeto, camino: [...nodo.t.base.digitos], clave, valor, ...(nodo.sub ? { posicion: [...nodo.sub] } : {}), ...(desde !== undefined ? { desde } : {}) });
      }
      return [true];
    }
    default:
      throw fallo('nodo desconocido: ' + nodo.n);
  }
}

function prefija(op, lista, st) {
  const { ctx } = st;
  switch (op) {
    case 'first': return lista.slice(0, 1);
    case 'last': return lista.slice(-1);
    case 'count': return [lista.length];
    case 'sum': return [lista.reduce((s, o) => s + numeroDe(o, 'sum', ctx), 0)];
    case 'max':
    case 'min': {
      if (!lista.length) return [];
      const ns = lista.map((o) => numeroDe(o, op, ctx));
      return [op === 'max' ? Math.max(...ns) : Math.min(...ns)];
    }
    case 'floor': return [Math.floor(numero(lista, 'floor', ctx))];
    case 'neg': return [-numero(lista, '-', ctx)];
    case 'up':
      return lista.flatMap((o) => {
        paso(st);
        const p = ctx.padre(o);
        if (p === undefined) throw fallo('up: «' + leer(o, ctx) + '» no es un registro');
        return p === null ? [] : [p];
      });
    case 'down':
      return lista.flatMap((o) => {
        paso(st);
        const h = ctx.hijos(o);
        if (h === undefined) throw fallo('down: «' + leer(o, ctx) + '» no es un registro');
        return h;
      });
    case 'under':
      // Todo lo que cuelga (VG 12-11): el nodo y sus descendientes a cualquier profundidad, por llegada si el contexto
      // lo sabe (subarbol); si no, en profundidad por hijos. Cada nodo cuesta del presupuesto: ese es el tope.
      return lista.flatMap((o) => {
        paso(st);
        if (typeof ctx.subarbol === 'function') {
          const todos = ctx.subarbol(o, st.presupuesto);
          if (todos === undefined) throw fallo('under: «' + leer(o, ctx) + '» no es un registro');
          paso(st, todos.length);
          return todos;
        }
        if (ctx.hijos(o) === undefined) throw fallo('under: «' + leer(o, ctx) + '» no es un registro');
        const fuera = [];
        const pila = [o];
        while (pila.length) {
          const x = pila.pop();
          paso(st);
          st.presupuesto.gastar(1);
          fuera.push(x);
          const h = ctx.hijos(x) ?? [];
          for (let k = h.length - 1; k >= 0; k--) pila.push(h[k]);
        }
        return fuera;
      });
    case 'moves':
      // Leer el libro (VG 12-11, decisión 1): los asientos de cada nodo, con su D-MOV (docs/BQLM.md §3).
      return lista.flatMap((o) => {
        paso(st);
        const a = typeof ctx.asientos === 'function' ? ctx.asientos(o, st.presupuesto) : undefined;
        if (a === undefined) throw fallo('moves: «' + leer(o, ctx) + '» no es un registro, una identidad ni una serie del libro');
        paso(st, a.length);
        return a;
      });
    case 'path':
      return lista.flatMap((o) => {
        const hilo = [];
        let x = o;
        while (x !== null) {
          if (hilo.length === st.hilo) throw pendiente('path: el hilo pasa de ' + st.hilo + ' niveles');
          paso(st);
          hilo.push(x);
          x = ctx.padre(x);
          if (x === undefined) throw fallo('path: «' + leer(hilo[hilo.length - 1], ctx) + '» no es un registro');
        }
        return hilo;
      });
    default:
      throw fallo('operación desconocida: ' + op);
  }
}

// ---------- tablas, relaciones y fórmulas guardadas (Core AGRAM 18-11; docs/BQLM.md §15) ----------

/** La clave de un valor para agrupar y para no repetir: su tipo y su valor (los bytes, por su hex; un símbolo, su nombre). */
function claveDeValor(v) {
  if (esBytes(v)) return 'x:' + aHex(v.b);
  if (esSimbolo(v)) return 'y:' + v.simbolo;
  return typeof v + ':' + String(v);
}

/**
 * M cited d.d… (§15.3): para cada elemento x de M, en su orden, los registros de before.1 (por orden del libro) que llevan el
 * valor de x en payload(r).d.d…; lo mismo, exactamente, que M each (before.1 where itN in payload(itN+1).d.d…), también
 * en sus paradas. El coste lo fija esta definición, haya índice o no: un paso y un ocupante del presupuesto por elemento
 * consultado y otro por cada registro que da. Lo encuentra el índice de src/indice-de-nombres.js.
 */
function citados(nodo, st) {
  const { ctx } = st;
  const base = calcular(nodo.base, st);
  const fuera = [];
  let indice;
  for (const x of base) {
    paso(st);
    st.presupuesto.gastar(1);
    indice ??= indiceDeNombres(ctx, nodo.digitos, {
      valorDe: (o) => valorDe(o, ctx),
      clave: claveDeValor,
      presupuesto: () => new Presupuesto(Infinity, Infinity),
      noEsRegistro: (r) => fallo('payload: «' + leer(r, ctx) + '» no es un registro ni la candidata'),
    });
    if (indice.sinLibro) throw pendiente('no hay before en este contexto');
    if (!indice.registros) continue;
    const v = valorDe(x, ctx);
    if (v === undefined) throw fallo('cited: una décupla no tiene valor; lee una de sus posiciones');
    if (indice.fallo) throw indice.fallo;
    const rs = indice.porClave.get(claveDeValor(v)) ?? [];
    paso(st, rs.length);
    st.presupuesto.gastar(rs.length);
    fuera.push(...rs);
  }
  return fuera;
}

/** row(a, b…): una fila con la lista de cada argumento en su posición. Paga un paso y un ocupante por cada uno que guarda. */
function construirFila(nodo, st) {
  const listas = nodo.args.map((a) => calcular(a, st));
  paso(st);
  st.presupuesto.gastar(listas.reduce((s, l) => s + l.length, 0));
  return [fila(listas)];
}

/**
 * M group e: un grupo por clave distinta, por primera aparición; cada uno, una fila con la clave en las primeras
 * posiciones (una si e da un valor; las de la fila si e da row(…)) y los miembros, por llegada, en la siguiente. Una parte
 * vacía de la clave es una clave más (a diferencia de by, que la da PENDIENTE): junta lo que no la tiene. Una parte con
 * más de un ocupante o sin valor (una décupla) es ERROR. Un paso por elemento y un ocupante del presupuesto por grupo.
 */
function agrupar(nodo, st) {
  const { ctx } = st;
  const base = calcular(nodo.base, st);
  const antes = st.its[nodo.nivel - 1];
  const grupos = new Map();
  try {
    for (const o of base) {
      paso(st);
      st.its[nodo.nivel - 1] = o;
      const k = calcular(nodo.clave, st);
      const partes = k.length === 1 && esFila(k[0]) ? k[0].pos.slice(0, k[0].largo) : [k];
      if (partes.length > 9) throw fallo('group: una clave de ' + partes.length + ' partes no deja sitio a los miembros (como mucho 9)');
      const claves = partes.map((p) => {
        if (p.length === 0) return '∅';
        if (p.length > 1) throw fallo('group: cada parte de la clave es un valor, no una lista de ' + p.length + ' (' + textoDe(p.slice(0, 3), ctx) + (p.length > 3 ? '…' : '') + '); usa first, last, nth o count');
        const v = valorDe(p[0], ctx);
        if (v === undefined) throw fallo('group: una décupla no tiene valor; agrupa por una de sus posiciones');
        return claveDeValor(v);
      });
      const clave = JSON.stringify(claves);
      if (!grupos.has(clave)) {
        st.presupuesto.gastar(1);
        grupos.set(clave, { partes: partes.map((p) => p.slice(0, 1)), miembros: [] });
      }
      grupos.get(clave).miembros.push(o);
    }
  } finally {
    st.its[nodo.nivel - 1] = antes;
  }
  return [...grupos.values()].map((g) => fila([...g.partes, g.miembros]));
}

/**
 * M follow e: M y lo que da e (con it = cada nodo) una y otra vez, por niveles, sin repetir: un nodo ya visto, por su
 * valor (el id de un registro), no se vuelve a dar ni a seguir, así que un ciclo acaba. Cada nodo nuevo cuesta un paso y
 * un ocupante del presupuesto: ese es el tope (como under); una relación que fabrica valores sin fin acaba en PENDIENTE
 * POR LÍMITE. Un nodo sin valor (una décupla) es ERROR.
 */
function seguir(nodo, st) {
  const { ctx } = st;
  const vistos = new Set();
  const fuera = [];
  let frente = [];
  const anotar = (o) => {
    const v = valorDe(o, ctx);
    if (v === undefined) throw fallo('follow: sigue registros o valores, no una décupla sin valor');
    const c = claveDeValor(v);
    if (vistos.has(c)) return;
    vistos.add(c);
    paso(st);
    st.presupuesto.gastar(1);
    fuera.push(o);
    frente.push(o);
  };
  for (const o of calcular(nodo.base, st)) anotar(o);
  const antes = st.its[nodo.nivel - 1];
  try {
    while (frente.length) {
      const ahora = frente;
      frente = [];
      for (const o of ahora) {
        paso(st);
        st.its[nodo.nivel - 1] = o;
        for (const r of calcular(nodo.rel, st)) anotar(r);
      }
    }
  } finally {
    st.its[nodo.nivel - 1] = antes;
  }
  return fuera;
}

/**
 * apply(F, X): la fórmula guardada F (un texto «=…»; un texto que no es fórmula no se evalúa: ERROR) con it = cada
 * elemento de X, juntando lo que da. Mismo contexto (me, ev, epoch…), mismos pasos y mismo presupuesto. Nunca mueve ni
 * escribe: un verbo o un put en F es ERROR siempre, también dentro de una plantilla. Un keep en F, solo en una lectura.
 * Una F que nombra un registro que no está, PENDIENTE (como leerFormula). Una F que ya se está aplicando (aplicarse a sí
 * misma, directa o por otra) es ERROR; más de opciones.limites.aplicacion (TOPE_DE_APLICACION) una dentro de otra,
 * PENDIENTE POR LÍMITE. Un paso por aplicación.
 */
function aplicar(nodo, st) {
  const { ctx } = st;
  const f = valorDe(uno(calcular(nodo.args[0], st), 'apply: la fórmula', ctx), ctx);
  if (!esFormula(f)) throw fallo('apply: aplica una fórmula «=…», no «' + leer(f, ctx) + '» (un texto que no es fórmula no se evalúa)');
  if (st.aplicando.includes(f)) throw fallo('apply: la fórmula se aplica a sí misma (ciclo): «' + (f.length > 40 ? f.slice(0, 40) + '…' : f) + '»');
  if (st.aplicando.length >= st.topeAplicacion) throw porLimite('apply anidado más de ' + st.topeAplicacion + ' niveles');
  const arbol = analizada(f, true, st.anidamiento);
  const { verbo, put } = queMueve(arbol);
  if (verbo || put) throw fallo('apply: una fórmula aplicada nunca mueve ni escribe (lleva ' + (verbo ?? 'put') + '); mover es de las plantillas de transacción');
  if (!st.lectura && llevaKeep(arbol)) throw fallo(SOLO_EN_LECTURA);
  for (const { id } of registrosDeFormula(arbol)) {
    if (typeof ctx?.payload !== 'function' || ctx.payload(id) === undefined) throw pendiente('apply: referencia a un evento ausente del eje: ' + id.slice(0, 8));
  }
  const xs = calcular(nodo.args[1], st);
  const its = st.its;
  const cerrados = st.cerrados;
  const fuera = [];
  // En una lectura con memoria (§15.4), cada aplicación se recuerda por (F, x) cuando x es un registro o un valor plano,
  // con la pila de lo que se está aplicando (de ella dependen el ciclo y el tope).
  const clave = (x) => {
    if (!st.memoria) return undefined;
    const k = claveDeSujeto(x);
    return k === undefined ? undefined : 'A|' + f + '|' + k + '|' + JSON.stringify(st.aplicando) + '|' + st.claveDeLimites + '|' + st.mirada;
  };
  const claves = xs.map(clave);
  st.aplicando.push(f);
  if (st.memoria) st.cerrados = cerradosDe(arbol);
  try {
    xs.forEach((x, k) => {
      const una = () => {
        paso(st);
        st.its = [x];
        return calcular(arbol, st);
      };
      fuera.push(...(claves[k] ? recordar(st, claves[k], una) : una()));
    });
  } finally {
    st.its = its;
    st.cerrados = cerrados;
    st.aplicando.pop();
  }
  return fuera;
}

function numeroDe(o, donde, ctx) {
  const v = valorDe(o, ctx);
  if (typeof v !== 'number') throw fallo(donde + ' espera números, no «' + leer(o, ctx) + '»');
  return v;
}

// ---------- primitivas de verificación (§12) ----------

const ORDINAL = ['primer', 'segundo', 'tercer', 'cuarto', 'quinto', 'sexto', 'séptimo', 'octavo', 'noveno', 'décimo'];
const ordinal = (k) => (ORDINAL[k] ?? k + 1 + '.º') + ' argumento';

/** Lo que una primitiva paga antes de procesar n bytes: un paso y n bytes del presupuesto. */
function pagar(st, n) {
  paso(st);
  st.presupuesto.gastarBytes(n);
}

/** El valor del k-ésimo argumento: uno solo (vacío → PENDIENTE; de más de uno → ERROR, como G3). */
function argumento(nodo, k, st) {
  const o = uno(calcular(nodo.args[k], st), nodo.f + ': el ' + ordinal(k), st.ctx);
  return valorDe(o, st.ctx);
}

function argBytes(nodo, k, st) {
  const v = argumento(nodo, k, st);
  if (!esBytes(v)) throw fallo(nodo.f + ': el ' + ordinal(k) + ' son bytes, no «' + leer(v, st.ctx) + '»: un texto hex se convierte con bytes(…) y uno legible con utf8(…)');
  return v.b;
}

function argTexto(nodo, k, st) {
  const v = argumento(nodo, k, st);
  if (typeof v !== 'string') throw fallo(nodo.f + ': el ' + ordinal(k) + ' es un texto, no «' + leer(v, st.ctx) + '»');
  return v;
}

function argEntero(nodo, k, st) {
  const v = argumento(nodo, k, st);
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) throw fallo(nodo.f + ': el ' + ordinal(k) + ' es un entero ≥ 0, no «' + leer(v, st.ctx) + '»');
  return v;
}

/**
 * Un camino o unos pasos como secuencia de valores (los hermanos de un camino de Merkle, los pasos de OpenTimestamps):
 * lo que viene en una lista se toma en orden; una décupla (la del dato BTML, [[lado, hermano], …], o una pura) se lee
 * posición a posición, 0 a 9, y se aplana. Así vale tanto la forma de SIP-0.md (una décupla de pares) como una lista
 * plana (lado, hermano, lado, hermano…), que no tiene el tope de diez de una décupla.
 */
function secuencia(lista, st, nivel = 0) {
  const fuera = [];
  for (const o of lista) {
    paso(st);
    const v = valorDe(o, st.ctx);
    if (v !== undefined) {
      fuera.push(v);
      continue;
    }
    if (nivel >= 3) throw fallo('el camino está anidado más de tres niveles');
    for (let d = 0; d <= 9; d++) fuera.push(...secuencia(bajar(o, [d], st), st, nivel + 1));
  }
  return fuera;
}

/**
 * Los elementos de una lista hermana (las claves o los valores de lookup): si lo que llega es una sola décupla (la
 * posición de un registro con valores que no son hojas), cada posición suya, 0 a 9, hasta la primera vacía, es un
 * elemento (sus ocupantes); si no, cada ocupante es un elemento. → [[ocupantes del elemento k]].
 */
function elementos(lista, st) {
  if (lista.length === 1 && valorDe(lista[0], st.ctx) === undefined) {
    const fuera = [];
    for (let d = 0; d <= 9; d++) {
      const g = bajar(lista[0], [d], st);
      if (!g.length) break;
      fuera.push(g);
    }
    return fuera;
  }
  return lista.map((o) => [o]);
}

/** Bytes de un hermano o de un argumento de ots: bytes, o el texto hex en que viajan en los datos. */
function bytesDeDato(v, donde, st) {
  if (esBytes(v)) return v.b;
  const b = typeof v === 'string' ? deHex(v) : null;
  if (!b) throw fallo(donde + ': espera bytes o su texto hex, no «' + leer(v, st.ctx) + '»');
  return b;
}

/**
 * Evalúa una primitiva de verificación. Pura: solo lee sus argumentos; nunca llama al contexto más que para leerlos (los
 * evalúa calcular, como cualquier subexpresión) y no firma. Cada una paga en el presupuesto lo que procesa ANTES de
 * hacerlo, así que una entrada desmesurada se corta (PENDIENTE POR LÍMITE) sin llegar a procesarse.
 */
function verificar(nodo, st) {
  try {
    return calcularPrimitiva(nodo, st);
  } catch (e) {
    if (e instanceof Parada) throw e;
    throw fallo(e.message);
  }
}

function calcularPrimitiva(nodo, st) {
  const { ctx } = st;
  const f = nodo.f;
  switch (f) {
    case 'bytes': {
      const t = argumento(nodo, 0, st);
      if (typeof t !== 'string') throw fallo('bytes: convierte un texto hex, no «' + leer(t, ctx) + '»');
      pagar(st, Math.ceil(t.length / 2));
      const b = deHex(t);
      if (!b) throw fallo('bytes: «' + (t.length > 24 ? t.slice(0, 24) + '…' : t) + '» no es hex (cifras 0-9 y a-f, en número par)');
      return [aBytesBql(b)];
    }
    case 'hex': {
      const b = argBytes(nodo, 0, st);
      pagar(st, b.length);
      return [aHex(b)];
    }
    case 'utf8': {
      const t = argTexto(nodo, 0, st);
      pagar(st, t.length * 3);
      return [aBytesBql(new TextEncoder().encode(t))];
    }
    case 'hash': {
      const x = argumento(nodo, 0, st);
      let m;
      if (esBytes(x)) m = x.b;
      else if (typeof x === 'string' || typeof x === 'number') {
        pagar(st, typeof x === 'string' ? x.length * 3 : 32);
        m = new TextEncoder().encode(canonico(x));
      } else throw fallo('hash: hashea un texto, un número o bytes (la serialización canónica BTML de un valor), no «' + leer(x, ctx) + '»' + (x === undefined ? ': una décupla no tiene valor; hashea una de sus posiciones' : ''));
      if (nodo.args.length === 2) {
        const etiqueta = argTexto(nodo, 1, st);
        pagar(st, m.length + 64 + etiqueta.length * 3);
        return [aBytesBql(hashEtiquetado(etiqueta, m))];
      }
      pagar(st, m.length);
      return [aBytesBql(sha256(m))];
    }
    case 'sha256':
    case 'sha256d': {
      const b = argBytes(nodo, 0, st);
      pagar(st, b.length + (f === 'sha256d' ? 32 : 0));
      return [aBytesBql(f === 'sha256' ? sha256(b) : sha256d(b))];
    }
    case 'cat': {
      const partes = nodo.args.map((_, k) => argBytes(nodo, k, st));
      pagar(st, partes.reduce((n, p) => n + p.length, 0));
      return [aBytesBql(concatenar(...partes))];
    }
    case 'slice': {
      const b = argBytes(nodo, 0, st);
      const desde = argEntero(nodo, 1, st);
      const hasta = argEntero(nodo, 2, st);
      if (desde > hasta || hasta > b.length) throw fallo('slice: corta de ' + desde + ' a ' + hasta + ' (fin excluido) en ' + b.length + ' bytes: ha de ser 0 ≤ desde ≤ hasta ≤ ' + b.length);
      pagar(st, hasta - desde);
      return [aBytesBql(b.slice(desde, hasta))];
    }
    case 'reverse': {
      const b = argBytes(nodo, 0, st);
      pagar(st, b.length);
      return [aBytesBql(b.slice().reverse())];
    }
    case 'le': {
      const b = argBytes(nodo, 0, st);
      pagar(st, b.length);
      return [enteroLe(b)];
    }
    case 'below': {
      const a = argBytes(nodo, 0, st);
      const b = argBytes(nodo, 1, st);
      if (a.length !== b.length) throw fallo('below: compara bytes de la misma longitud, no ' + a.length + ' y ' + b.length);
      pagar(st, a.length);
      return [menor(a, b)];
    }
    case 'merkle': {
      // Core AGRAM 13-11 (H18, «sin tuplas»): el camino son dos listas hermanas, los lados («i» el hermano a la izquierda,
      // «d» a la derecha) y los hermanos (bytes o su hex), de la hoja a la raíz. Ausentes o vacías: la raíz es la hoja
      // (en «sip», su hash de hoja). La forma de tres argumentos (pares [lado, hermano]) se retiró.
      const hoja = argBytes(nodo, 0, st);
      const esquema = argTexto(nodo, 3, st);
      if (esquema !== 'bitcoin' && esquema !== 'sip') throw fallo('merkle: el esquema es «bitcoin» o «sip», no «' + esquema + '»');
      const lados = secuencia(calcular(nodo.args[1], st), st);
      const hermanos = secuencia(calcular(nodo.args[2], st), st);
      if (lados.length !== hermanos.length) throw fallo('merkle: los lados y los hermanos van en paralelo, uno por paso, y aquí hay ' + lados.length + ' lados y ' + hermanos.length + ' hermanos');
      const pasos = lados.map((lado, k) => {
        if (lado !== 'i' && lado !== 'd') throw fallo('merkle: el lado de un paso es «i» (el hermano a la izquierda) o «d» (a la derecha), no «' + leer(lado, ctx) + '»');
        return [lado, bytesDeDato(hermanos[k], 'merkle: el hermano del paso ' + k, st)];
      });
      pagar(st, 65 + pasos.length * (esquema === 'sip' ? 65 : 96));
      return [aBytesBql(raizMerkle(hoja, pasos, esquema))];
    }
    case 'ots': {
      // Core AGRAM 13-11 (H18): OpenTimestamps real, con los pasos como UNA lista de textos, «prepend <hex>»,
      // «append <hex>» o «sha256», sin tuplas. Sin pasos, x tal cual.
      const inicio = argBytes(nodo, 0, st);
      let largo = inicio.length;
      const pasos = [];
      for (const texto of secuencia(calcular(nodo.args[1], st), st)) {
        const m = typeof texto === 'string' ? /^(prepend|append) (\S+)$|^(sha256)$/.exec(texto.trim()) : null;
        if (!m) throw fallo('ots: paso desconocido «' + leer(texto, ctx) + '» (un texto: «prepend <hex>», «append <hex>» o «sha256»)');
        if (m[3]) {
          pagar(st, largo);
          largo = 32;
          pasos.push(['sha256']);
          continue;
        }
        const arg = deHex(m[2]);
        if (!arg) throw fallo('ots: «' + m[1] + '» lleva bytes en hex detrás, no «' + m[2] + '»');
        largo += arg.length;
        pagar(st, largo);
        pasos.push([m[1], arg]);
      }
      return [aBytesBql(aplicarOts(inicio, pasos))];
    }
    case 'lookup': {
      // Core AGRAM 13-11 (H17): los valores de una clave en dos listas hermanas (claves y valores, en paralelo): los de
      // las posiciones donde la clave es esa, en su orden; nada si ninguna. Puro.
      const claves = elementos(calcular(nodo.args[0], st), st).map((g) => {
        const v = g.length === 1 ? valorDe(g[0], ctx) : undefined;
        if (v === undefined) throw fallo('lookup: cada clave es un valor (un texto o un número), no «' + textoDe(g, ctx) + '»');
        return v;
      });
      const valores = elementos(calcular(nodo.args[1], st), st);
      if (claves.length !== valores.length) throw fallo('lookup: las claves y los valores van en paralelo, y aquí hay ' + claves.length + ' claves y ' + valores.length + ' valores');
      const clave = argumento(nodo, 2, st);
      return claves.flatMap((k, i) => (mismo(k, clave) ? valores[i] : []));
    }
    case 'json': {
      // Core AGRAM 17-11 (el puente, A15): la serialización canónica (canonico, la del id de un evento) de un texto, un
      // número o una décupla del payload tal como se escribió, en bytes. Con ella, un registro de otro libro traído como
      // dato se comprueba entero: sha256 de su cuerpo rehecho con cat = su id.
      const o = uno(calcular(nodo.args[0], st), 'json: el primero', ctx);
      const v = valorDe(o, ctx);
      const crudo = typeof v === 'string' || typeof v === 'number' ? v : o?.k === 'dec' && Array.isArray(o.v) ? o.v : undefined;
      if (crudo === undefined) throw fallo('json: serializa un texto, un número o una décupla del payload, no «' + leer(o, ctx) + '»');
      const t = canonico(crudo);
      pagar(st, t.length * 3);
      return [aBytesBql(new TextEncoder().encode(t))];
    }
    case 'text': {
      // Core AGRAM 17-11 (el puente, A15): el texto UTF-8 de unos bytes, la vuelta de utf8. Junta textos sin palabras nuevas
      // (text(cat(utf8(a), utf8(b)))): el nombre de una serie forastera, «<libro>:<emisor>».
      const b = argBytes(nodo, 0, st);
      pagar(st, b.length);
      let t;
      try {
        t = new TextDecoder('utf-8', { fatal: true }).decode(b);
      } catch {
        throw fallo('text: los bytes no son UTF-8 válido');
      }
      if (!t) throw fallo('text: unos bytes vacíos no dan un texto (un texto no es vacío)');
      return [t];
    }
    case 'payload': {
      // Core AGRAM 13-11 (H19): la décupla de un registro tal como se escribió, sin lo implícito (D-META, vistas, lecturas,
      // lo anclado). Es lectura del contexto, como una posición; en un registro guardado su 3 ya no lleva al autor.
      const o = uno(calcular(nodo.args[0], st), 'payload: el primero', ctx);
      const p = typeof ctx.payload === 'function' ? ctx.payload(o) : undefined;
      if (p === undefined) throw fallo('payload: «' + leer(o, ctx) + '» no es un registro ni la candidata');
      return [p];
    }
    case 'cabecera': {
      const b = argBytes(nodo, 0, st);
      pagar(st, 160);
      const c = leerCabecera(b);
      return [pura({ 1: [c.version], 2: [aBytesBql(c.anterior)], 3: [aBytesBql(c.raiz)], 4: [c.hora], 5: [c.bits], 6: [c.nonce], 7: [aBytesBql(c.hash)], 8: [aBytesBql(c.objetivo)] })];
    }
    case 'tx': {
      const b = argBytes(nodo, 0, st);
      pagar(st, 2 * b.length);
      const t = leerTx(b);
      paso(st, t.entradas.length + t.salidas.length);
      return [pura({
        1: t.entradas.map((e) => pura({ 0: [aBytesBql(e.txid)], 1: [e.vout], 2: [aBytesBql(e.script)], 3: [e.secuencia] })),
        2: t.salidas.map((s) => pura({ 0: [s.sats], 1: [aBytesBql(s.script)] })),
        3: t.testigos.map((pila) => pura({ 0: pila.map(aBytesBql) })),
        4: [t.locktime],
        5: [aBytesBql(t.txid)],
      })];
    }
    case 'tapleaf': {
      // H20 (13-11): el hash TapLeaf de BIP-341 de un script Tapscript (versión 0xc0): la hoja de compromiso del sello es
      // tapleaf(cat(bytes("6a20"), raíz del lote)), OP_RETURN <32 bytes>.
      const script = argBytes(nodo, 0, st);
      pagar(st, script.length + 70);
      return [aBytesBql(tapleaf(script))];
    }
    case 'taptweak': {
      // H20 (13-11): la clave de salida x-only de BIP-341 desde la clave interna, la hoja y sus hermanos en el árbol
      // Taproot (TapBranch ordena: el camino son solo hermanos, sin lados; bytes o su hex, como en merkle; ausentes o
      // vacíos, la hoja es la raíz). ERROR si la interna no es un punto de la curva.
      const interna = argBytes(nodo, 0, st);
      const hojaT = argBytes(nodo, 1, st);
      const hermanos = secuencia(calcular(nodo.args[2], st), st).map((h, k) => bytesDeDato(h, 'taptweak: el hermano ' + k, st));
      pagar(st, COSTE_TAPTWEAK + 96 * (hermanos.length + 1));
      return [aBytesBql(taptweak(interna, hojaT, hermanos))];
    }
    case 'signed': {
      const firma = argBytes(nodo, 0, st);
      const mensaje = argBytes(nodo, 1, st);
      const clave = argBytes(nodo, 2, st);
      pagar(st, COSTE_FIRMA);
      return [verificarBip340(firma, mensaje, clave)];
    }
    default:
      throw fallo('primitiva desconocida: ' + f);
  }
}

// ---------- mover (solo en una plantilla) ----------

/** Lo que vale una expresión que puede quedar PENDIENTE (falta un valor): la lista, o [] si queda pendiente sin ser por límite. */
function oNada(nodo, st) {
  try {
    return calcular(nodo, st);
  } catch (e) {
    if (e instanceof Parada && e.estado === 'PENDIENTE' && !e.subtipo) return [];
    throw e;
  }
}

/**
 * La serie de un verbo: un nodo del contexto (o una serie de su familia) cuyo valor es su clave; null si no hay
 * ninguna (se mueve con serie null: quien construye dice «no series»). Un texto o un número no la fabrican (SEG-09).
 */
function serieDeVerbo(lista, v, ctx) {
  if (!lista.length) return null;
  if (lista.length > 1) throw fallo(v + ': la serie es una lista de ' + lista.length + ' (' + textoDe(lista.slice(0, 3), ctx) + '); usa first o last');
  const o = lista[0];
  if (typeof o === 'string' || typeof o === 'number' || typeof o === 'boolean' || esSimbolo(o)) {
    throw fallo(v + ': la serie se nombra por su familia (R.(me), T.8, E.(me).("EUR")…) o se lee del libro (before.4.(…), me.1 each 0), no con «' + leer(o, ctx) + '»: un texto no fabrica una serie');
  }
  const clave = valorDe(o, ctx);
  if (typeof clave !== 'string') throw fallo(v + ': «' + leer(o, ctx) + '» no es una serie');
  return clave;
}

/** Una identidad de un enlace (from, to): su valor; «nadie» es null. */
function identidadDe(nodo, k, v, st) {
  const x = valorDe(uno(calcular(nodo, st), v + ' ' + k, st.ctx), st.ctx);
  if (x === NADIE) return null;
  if (typeof x !== 'string' || !x) throw fallo(v + ' ' + k + ': espera una identidad, no «' + leer(x, st.ctx) + '»');
  return x;
}

/**
 * Un verbo (VG 12-11, decisión 5) en una plantilla: anota el movimiento { verbo, serie, cantidad, de, a, salida?,
 * cuando?, precio? } y vale verdadero. Lo que vale cero o nada (una cantidad que falta) no se mueve: no anota nada y
 * vale verdadero igual. `precio` es el ocupante tal cual (una décupla [[serie], [cuánto]]); lo demás, valores.
 */
function mover(nodo, st) {
  const { ctx } = st;
  const v = nodo.v;
  if (!st.movimientos) throw fallo(v + ': solo una plantilla de transacción mueve (la firma quien la lanza); una regla solo lee (invariante del núcleo)');
  const q = oNada(nodo.q, st);
  if (!q.length) return [true];
  const cantidad = numero(q, v, ctx);
  if (!(cantidad > 1e-12)) return [true];
  const serie = serieDeVerbo(calcular(nodo.s, st), v, ctx);
  const m = { verbo: v, serie, cantidad, de: v === 'mint' ? null : identidadDe(nodo.from, 'from', v, st), a: v === 'burn' ? null : v === 'lock' || v === 'release' ? undefined : identidadDe(nodo.to, 'to', v, st) };
  if (m.a === undefined) m.a = m.de;
  if (nodo.exit) {
    const e = calcular(nodo.exit, st);
    if (e.length) {
      const x = valorDe(uno(e, v + ' exit', ctx), ctx);
      if (x === undefined || esSimbolo(x) || esBytes(x)) throw fallo(v + ' exit: la salida es un valor (un id, una identidad o un instante)');
      m.salida = String(x);
    }
  }
  if (nodo.when) {
    const w = calcular(nodo.when, st);
    if (w.length) {
      const x = valorDe(uno(w, v + ' when', ctx), ctx);
      if (typeof x !== 'string') throw fallo(v + ' when: la fecha es un instante, no «' + leer(x, ctx) + '»');
      m.cuando = x;
    }
  }
  if (nodo.price) {
    const p = calcular(nodo.price, st);
    if (p.length) {
      m.precio = uno(p, v + ' price', ctx);
      if (esBytes(m.precio) || esPura(m.precio)) throw fallo(v + ' price: el precio es [[serie], [cuánto]], no bytes');
    }
  }
  paso(st);
  st.movimientos.push(m);
  return [true];
}

/**
 * put v at A.1.(S).1 en una plantilla: el nivel en mano (estudio §4b). Lo que A tiene disponible de S ha de llegar al
 * menos a v: se acuña lo que falte (mint a A). Si ya llega, nada. Solo ese destino: la cartera, el disponible.
 */
function nivelEnMano(nodo, st) {
  const { ctx } = st;
  const destino = nodo.t;
  if (destino.base.digitos.length !== 1 || destino.base.digitos[0] !== 1 || !nodo.sub || nodo.sub.length !== 1 || nodo.sub[0] !== 1) {
    throw fallo('put: en una plantilla solo coloca el nivel en mano, put v at A.1.(S).1');
  }
  const v = oNada(nodo.v, st);
  if (!v.length) return [true];
  const nivel = numero(v, 'put', ctx);
  const A = identidadDe(destino.base.base, 'at', 'put', st);
  const serie = serieDeVerbo(calcular(destino.expr, st), 'put', ctx);
  const hay = serie === null ? 0 : calcular({ n: 'paso', base: destino, digitos: [1] }, st).reduce((s, o) => s + numeroDe(o, 'put', ctx), 0);
  const falta = nivel - hay;
  if (!(falta > 1e-12)) return [true];
  paso(st);
  st.movimientos.push({ verbo: 'mint', serie, cantidad: falta, de: null, a: A });
  return [true];
}

// ---------- reglas ----------

/**
 * Lo que vale en una posición de una regla en forma canónica: su último
 * ocupante. Una regla no se cambia en sitio: corregirla es añadir un ocupante
 * a su registro (VG, 10-11, A1), y manda el último (src/epocas.js).
 */
const ultimo = (x) => (Array.isArray(x) ? x[x.length - 1] : x);

/** El nombre de una regla: el primer ocupante de su 0. */
export const nombreDeRegla = (regla) => (Array.isArray(regla) ? (Array.isArray(regla[0]) ? regla[0][0] : regla[0]) : undefined);

/** El subtipo de una parada o de un resultado, si lo lleva (POR_LIMITE), para conservarlo hacia arriba (#100). */
const conSubtipo = (x) => (x?.subtipo ? { subtipo: x.subtipo } : {});

// Las condiciones ya analizadas, por su texto (y si llevan sujeto, y su tope de anidamiento si no es el de siempre): una
// regla se analiza una vez.
const ANALIZADAS = new Map();
function analizada(src, sujeto = false, anidamiento = LIMITES.anidamiento) {
  const clave = (sujeto ? 'L' : 'C') + (anidamiento === LIMITES.anidamiento ? '' : anidamiento + ':') + src;
  if (!ANALIZADAS.has(clave)) {
    let arbol;
    try {
      arbol = analizar(src, { sujeto, anidamiento });
    } catch (e) {
      arbol = e;
    }
    ANALIZADAS.set(clave, arbol);
  }
  const a = ANALIZADAS.get(clave);
  if (a instanceof Error) throw a;
  return a;
}

/**
 * ¿Es una lectura? (VG, 10-11, B5): una regla de la época con «read» en su 4.
 * No es una condición: no se cuelga de las transacciones; da un valor de lo que
 * lee (`it`) y el contexto lo pone en la posición que dice su 3 (docs/BQLM.md §5).
 */
export const esLectura = (regla) => Array.isArray(regla) && Array.isArray(regla[4]) && regla[4].includes('read');

/**
 * ¿Es una regla que escribe? (encargo 3b: la obtención de P, mapa §15 N1, N2, N3): una regla de la época con «put»
 * en su 4. No es una condición: se evalúa sobre la transacción que ya pasó las condiciones y lo que coloca
 * (`put v at A.2.1.(r)`: P posicionado en r) lo asienta el libro en la misma transacción (src/eje.js).
 */
export const esEscritura = (regla) => Array.isArray(regla) && Array.isArray(regla[4]) && regla[4].includes('put');

/**
 * ¿Es la lectura de un punto de vista? (encargo «lecturas», issue #12, VG 11-11 noche): una regla de la época con
 * «point of view» en su 4, «qué lee el PV d aplicado a un nodo», d su 3. No es una condición ni una lectura que el
 * contexto materialice: la aplica el contrato (contrato.leer, contrato.leerRuta) con it = el nodo. Cada ocupante de su
 * 2 es una fórmula «=…» o «js <nombre>», una lectura del núcleo en JavaScript que el contrato nombra (docs/CONTRATO.md §4.4).
 */
export const esLecturaDePv = (regla) => Array.isArray(regla) && Array.isArray(regla[4]) && regla[4].includes('point of view');

/** Dónde se materializa una lectura: el último ocupante de su 3, como «X.6.1» (de un registro) o «A.8.1» (de una identidad). */
export const posicionDeLectura = (regla) => (esLectura(regla) ? ultimo(regla[3]) : undefined);

/**
 * Lee una lectura (B5) de un sujeto: evalúa el último ocupante de su 2 con
 * `it` = el sujeto (un registro, la candidata o una identidad) en el contexto.
 * Devuelve lo que `evaluar`: { estado: 'RESUELTO', valor, texto } o { estado, motivo }.
 */
export function leerRegla(regla, sujeto, contexto, opciones = {}) {
  const nombre = nombreDeRegla(regla);
  if (!esLectura(regla)) return { estado: 'ERROR', motivo: (nombre ?? 'regla') + ': no es una lectura (su 4 no dice read)' };
  const formula = ultimo(regla[2]);
  if (!esFormula(formula)) {
    return { estado: 'ERROR', motivo: (nombre ?? 'regla') + ': su 2 no es una fórmula «=…»' };
  }
  let arbol;
  try {
    arbol = analizada(formula, true, limitesDe(contexto, opciones).anidamiento);
  } catch (e) {
    return { estado: e.estado ?? 'ERROR', ...conSubtipo(e), motivo: nombre + ': ' + e.message };
  }
  // Una lectura B5 se materializa en posiciones que leen las reglas: keep no (§15), aunque se pida.
  const r = evaluar(arbol, contexto, { ...opciones, sujeto, lectura: false });
  return r.estado === 'RESUELTO' ? r : { ...r, motivo: nombre + ': ' + r.motivo };
}

/**
 * Evalúa una regla de la época (una décupla del molde, mapa §16 [D]: 0 nombre,
 * 1 constantes, 2 condición, 3 a quién, 4 primitiva, 5 dónde cuelga, 6 de dónde
 * viene, 7 desde qué época, 8 orden, 9 mensaje). Lee la condición del 2 (una
 * fórmula «=…», el último ocupante: una corrección se añade detrás) y la
 * evalúa en el contexto. Devuelve { pasa, estado, subtipo?, motivo }:
 * pasa solo si la condición da verdadero; si da falso, motivo es el mensaje del
 * 9 con cada {expresión} rellena con lo que vale; si queda PENDIENTE o da
 * ERROR, no pasa y motivo lo dice; `subtipo` es POR_LIMITE si se paró por un
 * límite de cálculo (#100). No mira el 3, el 4 ni el 5: quién cuelga las
 * reglas de cada transacción es trabajo de después.
 */
export function evaluarRegla(regla, contexto, opciones = {}) {
  const nombre = nombreDeRegla(regla);
  if (esLectura(regla)) return { pasa: false, estado: 'ERROR', motivo: nombre + ': es una lectura (read en su 4), no una condición: se lee con leerRegla' };
  if (esEscritura(regla)) return { pasa: false, estado: 'ERROR', motivo: nombre + ': es una regla que escribe (put en su 4), no una condición: se evalúa con evaluarEscritura' };
  const condicion = Array.isArray(regla) ? ultimo(regla[2]) : undefined;
  if (!esFormula(condicion)) {
    return { pasa: false, estado: 'ERROR', motivo: (nombre ?? 'regla') + ': su 2 no es una condición «=…»' };
  }
  let arbol;
  try {
    arbol = analizada(condicion, false, limitesDe(contexto, opciones).anidamiento);
  } catch (e) {
    return { pasa: false, estado: e.estado ?? 'ERROR', ...conSubtipo(e), motivo: nombre + ': ' + (e.estado ?? 'ERROR') + ': ' + e.message };
  }
  // Una condición no puede volver «no» un PENDIENTE: keep es ERROR aunque se pida opciones.lectura (§15).
  const r = evaluar(arbol, contexto, { ...opciones, lectura: false });
  if (r.estado !== 'RESUELTO') return { pasa: false, estado: r.estado, ...conSubtipo(r), motivo: nombre + ': ' + r.estado + ': ' + r.motivo };
  if (r.valor.length !== 1 || typeof r.valor[0] !== 'boolean') {
    return { pasa: false, estado: 'ERROR', motivo: nombre + ': la condición no da verdadero o falso, da «' + r.texto + '»' };
  }
  if (r.valor[0]) return { pasa: true, estado: 'RESUELTO', motivo: null };
  const mensaje = ultimo(regla[9]);
  return { pasa: false, estado: 'RESUELTO', motivo: typeof mensaje === 'string' ? rellenar(mensaje, contexto, { ...opciones, lectura: false }) : nombre + ': no se cumple' };
}

/**
 * Evalúa una regla que escribe (esEscritura: «put» en su 4) sobre la candidata del contexto y devuelve
 * { estado, escrituras, motivo }: las colocaciones que anota su 2, [{ sujeto, camino, clave, valor }], si la fórmula
 * se resuelve; si no, ninguna y el motivo. Lo que vale la fórmula no cuenta: cuenta lo que coloca.
 */
export function evaluarEscritura(regla, contexto, opciones = {}) {
  const nombre = nombreDeRegla(regla);
  if (!esEscritura(regla)) return { estado: 'ERROR', escrituras: [], motivo: (nombre ?? 'regla') + ': no escribe (su 4 no dice put)' };
  const formula = ultimo(regla[2]);
  if (!esFormula(formula)) return { estado: 'ERROR', escrituras: [], motivo: nombre + ': su 2 no es una fórmula «=…»' };
  let arbol;
  try {
    arbol = analizada(formula, false, limitesDe(contexto, opciones).anidamiento);
  } catch (e) {
    return { estado: e.estado ?? 'ERROR', ...conSubtipo(e), escrituras: [], motivo: nombre + ': ' + e.message };
  }
  const r = evaluar(arbol, contexto, { ...opciones, escribir: true });
  if (r.estado !== 'RESUELTO') return { estado: r.estado, ...conSubtipo(r), escrituras: [], motivo: nombre + ': ' + r.estado + ': ' + r.motivo };
  return { estado: 'RESUELTO', escrituras: r.escrituras, motivo: null };
}

/**
 * Las sentencias del 4 de una plantilla de transacción (VG 12-11, decisiones 5 y 6): cada una, una fórmula «=…» con
 * it = X (el sujeto), me = quien la lanza, ev y memo = la candidata; se evalúan en orden, con los verbos y el nivel en
 * mano (put v at A.1.(S).1), y gastan del mismo presupuesto (SEG-10). Devuelve { estado, movimientos, motivo }: los
 * movimientos que anotan, en orden ([{ verbo, serie, cantidad, de, a, salida?, cuando?, precio? }]), si todas se
 * resuelven; si una no, ninguno y su motivo. Lo que valen las sentencias no cuenta: cuenta lo que mueven. Es la única
 * evaluación que mueve: la candidata la firma quien la lanza, y después la validan las reglas, que solo leen.
 */
export function evaluarPlantilla(sentencias, contexto, opciones = {}) {
  const lim = limitesDe(contexto, opciones);
  const presupuesto = new Presupuesto(lim.ocupantes, lim.bytes);
  const movimientos = [];
  for (const src of Array.isArray(sentencias) ? sentencias : [sentencias]) {
    if (!esFormula(src)) return { estado: 'ERROR', movimientos: [], motivo: 'una sentencia de plantilla es una fórmula «=…»' };
    let arbol;
    try {
      arbol = analizada(src, true, lim.anidamiento);
    } catch (e) {
      return { estado: e.estado ?? 'ERROR', ...conSubtipo(e), movimientos: [], motivo: e.message };
    }
    const r = evaluar(arbol, contexto, { ...opciones, mover: true, presupuesto });
    if (r.estado !== 'RESUELTO') return { estado: r.estado, ...(r.subtipo ? { subtipo: r.subtipo } : {}), movimientos: [], motivo: r.motivo };
    movimientos.push(...r.movimientos);
  }
  return { estado: 'RESUELTO', movimientos, motivo: null };
}

/** Rellena cada {expresión} de un mensaje con lo que vale en el contexto (o con su estado, si no se resuelve). */
export function rellenar(mensaje, contexto, opciones = {}) {
  return mensaje.replace(/\{([^{}]+)\}/g, (_, expr) => {
    let r;
    try {
      // Con sujeto (el 9 de una plantilla de transacción, con it = X), `it` vale fuera de where (encargo 3c-2a).
      r = evaluar(analizada(expr, Object.hasOwn(opciones, 'sujeto'), limitesDe(contexto, opciones).anidamiento), contexto, opciones);
    } catch (e) {
      r = { estado: e.estado ?? 'ERROR' };
    }
    return r.estado === 'RESUELTO' ? r.texto : '{' + expr + ': ' + r.estado + '}';
  });
}

// ---------- fórmulas en el payload (retirada de BQL V0, #113; docs/BQLM.md §14) ----------

/**
 * ¿Es una fórmula? Un texto que empieza por «=» y no por «==» («==» escapa un texto que empieza por «=»). Es la única
 * prueba del núcleo: la usan las reglas, las plantillas, los pasos, el motor, la época y la validez.
 */
export function esFormula(x) {
  return typeof x === 'string' && x.startsWith('=') && !x.startsWith('==');
}

/** El id de un registro escrito como texto: 64 cifras hex en minúscula. */
const RE_ID_DE_REGISTRO = /^[0-9a-f]{64}$/;
const RAIZ = '0000000000';

/**
 * Los registros que nombra una fórmula: los textos literales de 64 hex de su árbol (analizar), en el orden en que
 * aparecen, cada uno con la dirección que le sigue: la de los dígitos fijos que vienen detrás del literal, («id»).d.d o
 * (payload(«id»)).d.d; si no los hay, la raíz. Sin repetir el mismo par. Una fórmula que no se analiza no nombra nada.
 * Es lo que se mira antes de evaluar una fórmula del payload (leerFormula) y lo que Scened dibuja como arista de fórmula.
 */
export function registrosDeFormula(formula) {
  let arbol;
  try {
    arbol = typeof formula === 'string' ? analizada(formula, true) : formula;
  } catch {
    return [];
  }
  const esId = (n) => n?.n === 'lit' && typeof n.v === 'string' && RE_ID_DE_REGISTRO.test(n.v);
  // El literal que hay debajo de la base de una posición: entre paréntesis o como argumento de payload(…).
  const literalDe = (n) => {
    while (n && (n.n === 'paren' || (n.n === 'llamada' && n.f === 'payload'))) n = n.n === 'paren' ? n.e : n.args[0];
    return esId(n) ? n : undefined;
  };
  const fuera = [];
  const vistos = new Set();
  const conDireccion = new Set();
  const anotar = (id, dir) => {
    if (vistos.has(id + '|' + dir)) return;
    vistos.add(id + '|' + dir);
    fuera.push({ id, dir });
  };
  const visitar = (n) => {
    if (!n || typeof n !== 'object' || esSimbolo(n)) return;
    if (Array.isArray(n)) {
      n.forEach(visitar);
      return;
    }
    if (n.n === 'paso' && !n.each) {
      const lit = literalDe(n.base);
      if (lit) {
        // Más de diez dígitos no es una dirección (la lectura queda PENDIENTE al evaluar): se anota la raíz.
        anotar(lit.v, n.digitos.length <= 10 ? direccion(n.digitos) : RAIZ);
        conDireccion.add(lit);
      }
    }
    if (n.n === 'lit') {
      if (esId(n) && !conDireccion.has(n)) anotar(n.v, RAIZ);
      return;
    }
    for (const x of Object.values(n)) if (x && typeof x === 'object') visitar(x);
  };
  visitar(arbol);
  return fuera;
}

/**
 * Lee una fórmula escrita en el payload de un registro (retirada de BQL V0, #113; docs/BQLM.md §14): es BQL mínimo,
 * con `it` = el registro que la lleva (`sujeto`: su nodo en el contexto, { k: 'reg', id }), en el contexto con que el
 * núcleo lee un registro con una lectura de la época (`new ContextoEje(vista, { epoch })`): lo que la vista no trae,
 * falta. Lo escrito en el propio registro se lee con `payload(it)` (y `memo`, si el contexto tiene candidata).
 *
 * - Lo que falta no es falso: antes de evaluar, cada texto literal de 64 hex (registrosDeFormula) ha de ser un
 *   registro del contexto (`contexto.payload`); si uno no lo es, PENDIENTE con el texto de una referencia ausente, y no
 *   se evalúa.
 * - Sin encadenar: la fórmula lee lo ESCRITO; si la posición que lee lleva otra fórmula, ve su texto.
 * - Solo números: una magnitud calculada se escribe desplegada (la cantidad en su .1, la fórmula; la unidad en su .2).
 * - Datos no fiables: un verbo o un put es ERROR (se evalúa sin mover ni escribir). `opciones.presupuesto` es el del
 *   registro leído, compartido por todas sus fórmulas (un Presupuesto con los LIMITES); agotado, PENDIENTE POR LÍMITE.
 *
 * Devuelve lo que evaluar: { estado: 'RESUELTO', valor, texto } o { estado, subtipo?, motivo }. No lanza.
 */
export function leerFormula(formula, sujeto, contexto, opciones = {}) {
  if (!esFormula(formula)) return { estado: 'ERROR', motivo: 'no es una fórmula «=…»' };
  let arbol;
  try {
    arbol = analizada(formula, true, limitesDe(contexto, opciones).anidamiento);
  } catch (e) {
    return { estado: e.estado ?? 'ERROR', ...conSubtipo(e), motivo: e.message };
  }
  for (const { id } of registrosDeFormula(arbol)) {
    if (typeof contexto?.payload !== 'function' || contexto.payload(id) === undefined) {
      return { estado: 'PENDIENTE', motivo: 'referencia a un evento ausente del eje: ' + id.slice(0, 8) };
    }
  }
  const { presupuesto, limites } = opciones;
  return evaluar(arbol, contexto, { sujeto, ...(presupuesto instanceof Presupuesto ? { presupuesto } : {}), ...(limites ? { limites } : {}) });
}
