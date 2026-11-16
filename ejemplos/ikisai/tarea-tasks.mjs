// Ejemplo transversal con datos inventados: una tarea (Tasks) en una casa
// de eventos. Tiempo, pasos y dinero sobre el mismo núcleo que la compra de
// comida. Construye su propio eje:
//   - génesis de la casa (una persona, la primera identidad del eje): emite al
//     empezar su R y una serie de E por partida del sábado;
//   - la casa invita a una persona organizadora y a un proveedor externo, que
//     aceptan (su alta; encargo 3b);
//   - la casa escribe las partidas del sábado;
//   - la organizadora escribe la tarea «montar la carpa del sábado», una
//     décupla con sus fórmulas (BQL mínimo: cada una lee lo escrito);
//   - el proveedor escribe presupuestos donde la tarea dice que busca (su 5):
//     en sus recursos (1), donde colisionan con lo propio;
//   - el motor: descubrir → proponer (la fórmula del 9 deja los presupuestos
//     que caben en coste y en plazo y se queda con el primero que llegó) →
//     consolidar (la fábrica registra la elección) → la organizadora anuncia
//     en la tarea el pago (su 4.1) → el proveedor entrega y consume sus horas
//     (T) → la organizadora paga (E) en las series de las partidas. El ciclo
//     es una sola operación (VG, 8-11, mapa §15): cada parte escribe su propio
//     movimiento y nadie autoriza lo ajeno. La tarea nombra en su criterio (su
//     2) la plantilla de cerrado de la época: se cierra cuando el pago pasa.
// Nada de esto es real.
//
// Las series de tokens (VG, 7-11; src/tokens.js):
//   T: un token por escala y sin conversión: T:minuto y T:hora son series
//      distintas. Escribir cuesta minutos (uno por posición) y trabajar
//      cuesta horas. T no cruza de persona (VG, 7-11 noche): cada una gasta
//      su asignación del día (VG, 8-11) y el consumo queda anotado en el
//      registro que soporta; lo que la casa cede de su tiempo es E:casa/hora.
//   E: E:<emisor>/<denominación>. Cada partida es una posición con capacidad
//      (su importe) respaldada por una serie limitada de E que emite la casa,
//      E:casa/<concepto> (ver PARTIDAS). La organizadora recibe las series de
//      las partidas de su tarea y ningún otro E, así que el núcleo no la deja
//      pagar más que el coste total de la tarea.
//   P: posicionado en registros (mapa §15): nadie lo acuña a mano; quien
//      escribe un registro obtiene diez unidades sobre él, y quien recibe E o R
//      de la casa, diez por unidad sobre su alta (el génesis); cada serie de P
//      guarda su origen, quien lo obtuvo (encargo 3b-bis). Aquí no decide nada.
//   R: por emisor: la de la casa (emitir E exige R propia emitida; con su R
//      invita a la organizadora y al proveedor).
// Emitir es solo de personas (VG, 7-11 noche): la casa es la persona que la
// lleva y emite al empezar; la organizadora y el proveedor son personas
// (escriben su propia alta, aceptando la invitación), que aquí no emiten.

import { Eje } from '../../src/eje.js';
import { leerPosicion } from '../../src/contexto-eje.js';
import { indicesDe } from '../../src/btml.js';
import { claveToken } from '../../src/tokens.js';
import { escribirDesde } from '../../src/escritura.js';
import { pagaElCoste, escribirPagando } from './coste.mjs';
import { descubrir, proponer, consolidar, siguiente, FABRICA, ANUNCIO } from '../../src/motor.js';
import { entrarPorInvitacion } from './altas.mjs';

/** Calendario inventado: hoy es sábado 7; la fiesta, el sábado 14. */
export const T0 = '2026-11-07T09:00:00Z';
export const FECHA_LIMITE = '2026-11-14T09:00:00Z';

/**
 * Dónde busca la tarea sus presupuestos: en sus recursos (1). La tarea lo
 * guarda en su 5, «dónde encaja lo que busco» (mapa §2.3), y el proveedor
 * escribe ahí, así que los presupuestos colisionan con lo propio.
 * La fórmula del 9 busca, entre lo anclado sobre la tarea (down it), lo que
 * está anclado en la dirección que dice su 5 (el 6.5 de cada registro lleva
 * su sobre y su en): el texto de diez dígitos del 5 nombra la colisión del 1.
 *
 * Quién ocupa una posición ajena (mapa §12 [D], VG 7-11 noche; R8, src/elegibles.js):
 * el 1 es de la tarea (lo escribe la organizadora) y cualquiera con minutos
 * escribe en él, pero solo es ELEGIBLE lo de quien la tarea nombra en su 3
 * (la organizadora y el proveedor). Lo de los demás colisiona y queda en el
 * eje; descubrir solo lo cuenta (noElegibles), y la fórmula del 9 lo deja
 * fuera porque lee el 3 de la tarea. El pago (movimientosDeEjecucion) lo
 * vuelve a comprobar.
 */
export const EN_PRESUPUESTO = '1000000000';

/**
 * Partidas del sábado: [concepto, importe en EUR]. Cada una es una posición
 * con capacidad (su importe, en el registro de partidas) respaldada por una
 * serie limitada de E que emite la casa, E:casa/<concepto>, con tantos tokens
 * como euros de capacidad (mapa §12: la plaza y su serie). Las tres primeras
 * son las de la carpa.
 * [X] decidir VG: que la denominación sea el concepto y que un token valga un
 * EUR es convención de este ejemplo. BQL lee 250 en el .1 de «250 EUR» y el
 * eje ve 250 tokens de E:casa/alquiler de la carpa; la traducción va a mano
 * (ver ESCALA_DE_UNIDAD).
 */
export const PARTIDAS = Object.freeze([
  Object.freeze(['alquiler de la carpa', 250]),
  Object.freeze(['transporte', 60]),
  Object.freeze(['imprevistos', 40]),
  Object.freeze(['tarima del escenario', 120]),
]);
const DE_LA_CARPA = PARTIDAS.slice(0, 3);

/**
 * Unidades escritas → escala del token T. Una unidad es un texto (el .2 de
 * «7 h»: no sabe que es la escala hora); la traducción va a mano.
 * [X] decidir VG: si las unidades de tiempo de BQL deben ser las siete
 * escalas de T por definición, y cómo se liga una unidad de BQL («EUR») a
 * las series de E que la respaldan (aquí, las de las partidas).
 */
export const ESCALA_DE_UNIDAD = Object.freeze({ min: 'minuto', h: 'hora' });

/**
 * Etapas del ejemplo, en orden. `hasta` detiene el ejemplo al terminar una:
 * la tarea escrita, los presupuestos recibidos, la consolidación, el pago
 * anunciado, la entrega del proveedor o el pago (por defecto, todo).
 */
export const ETAPAS = Object.freeze(['tarea', 'presupuestos', 'consolidada', 'anunciada', 'entregada', 'pagada']);

/** La plantilla de cerrado que la tarea nombra en su criterio (la de la época por defecto, dicha en voz alta). */
export const CERRADO = 'all announced movements happened';

/** Dónde vive el coste total en toda tarea: 1.1, la cantidad de los recursos, desplegada (1.1.1 cuánto, 1.1.2 la unidad). */
export const DIR_COSTE = '1100000000';
/** Dónde vive el tiempo previsto en toda tarea: 4.1, la cantidad de la fábrica, desplegada (4.1.1 cuánto, 4.1.2 la unidad). */
export const DIR_TIEMPO = '4100000000';

/** El coste total de una tarea, leído de lo escrito: la suma de las cantidades de sus partidas (1.0; su 0, el nombre de la hilera, no es una cantidad). */
const COSTE = 'sum (payload(it)).1.0.1';

/**
 * La fórmula del 9 (BQL mínimo, it = la tarea): de lo anclado sobre la tarea
 * (down it, por llegada), lo anclado en la dirección de su 5 (el en, último
 * del 6.5) por su autor o por quien nombra en su 3 (los elegibles: R8); de
 * ello, lo que cabe: precio (la cantidad de su 1) dentro del coste total de
 * la tarea (la suma de sus partidas, COSTE) y plazo (la de su 2) dentro del
 * plazo de la tarea (la del ocupante 1 de su 2); y de eso, el primero. Lee lo
 * escrito: el coste total no se toma del 1.1 (otra fórmula, que se ve como
 * texto: sin encadenar), se suma otra vez de las partidas. Compara números:
 * las unidades no las mira (EUR y h son las de este ejemplo).
 *
 * Corregir es añadir un ocupante (mapa §12): un presupuesto corregido no
 * sustituye al original. Los dos quedan en el 1, y la fórmula elige entre
 * ellos por llegada sin borrar ninguno.
 * [X] decidir VG: preferir la corrección. La fórmula se queda con el PRIMERO
 * que cabe: si el original también cabe, sale el original. Con el BQL mínimo
 * se podría tomar el último (last) o leer el autor (it2.3); este ejemplo
 * sigue eligiendo por llegada, como antes.
 *
 * [X] decidir VG: la elección vive en el 9 y no en el 1. La consolidación
 * tiene un solo hueco por PV: su 1 guarda o los recursos literales de la
 * tarea (por referencia) o el presupuesto elegido, no las dos cosas.
 * `consolidar` aceptaría el candidato en el 1 (no comprueba qué va en cada
 * posición); este ejemplo lo deja en el 9 para no perder los recursos. Es el
 * mismo choque que en la tarea: `proponer` pone cada elección en la posición
 * de su fórmula, y el 1 de la tarea ya guarda los recursos.
 */
export const FORMULA_ELECCION = '=first (down it where last it2.6.5 = first (payload(it)).5 and (first it2.3 = first it.3 or first it2.3 in (payload(it)).3)'
  + ' and (payload(it2)).1.1 <= ' + COSTE + ' and (payload(it2)).2.1 <= (nth 1 (payload(it)).2).1)';

/**
 * La décupla de una tarea. En la raíz cada posición es un PV (época 0):
 *   0 el título; 1 recursos; 2 criterios; 3 quién habla con quién;
 *   4 fábrica; 5 dónde encaja lo que busco (EN_PRESUPUESTO); 6 de dónde
 *   viene; 7 la fecha límite; 8 el coste y el tiempo; 9 la elección.
 * Debajo hay hileras: una lista con su nombre en .0 (la representación) y
 * sus ítems por orden en .1, .2… (partidas, materiales, criterios, quién y
 * pasos). Recursos (1) y fábrica (4) agrupan una hilera en x.0 y su cantidad
 * en x.1, en una dirección fija e igual en toda tarea: el coste total en 1.1
 * (DIR_COSTE) y el tiempo previsto en 4.1 (DIR_TIEMPO), cada uno una magnitud
 * desplegada ([[nombre], [fórmula], [unidad]]: el BQL mínimo solo calcula
 * números). Cada fórmula lee lo escrito desde la tarea (payload(it)), así que
 * vive donde dice su PV: el coste en recursos, el tiempo en la fábrica, el
 * coste y el tiempo juntos en el 8 y la elección en el 9.
 *
 *   partidas: referencias a los importes de las partidas (no copias), de una a nueve.
 *   materiales: textos, de uno a nueve.
 *   quien: identidades que hablan en la tarea, de una a nueve.
 *   pasos: [[nombre, '2 h'], …], de uno a nueve.
 *   origen: referencia para el 6 (de dónde viene la tarea).
 *
 * [X] decidir VG: el relleno hasta el 9. La elección vive en el 9 y un array
 * BTML no tiene huecos, así que del 5 al 8 hay que escribir algo. El mapa
 * (§12) dice «sin no aplicable; prefijo denso y anclaje»: lo lejano se ancla
 * en vez de rellenar. Anclar la elección en el 9 no funciona hoy: `proponer`
 * solo lee las fórmulas del payload del foco (una fórmula anclada tiene por it
 * su propio registro, no la tarea). Qué queda en cada posición:
 *   - 5: lo que el corpus le da, dónde encaja lo que busco. Antes llevaba un
 *     recuento de presupuestos, que se quita: el mapa (§12) pone los
 *     recuentos en las bases del 8, registros escritos en el 8 (#19). Ahora
 *     el recuento es una consulta y no ocupa posición.
 *   - 6 y 7 dicen lo de su PV (de dónde viene, la fecha límite), pero repiten
 *     lo que ya dicen el hilo (la tarea se escribe sobre las partidas) y la
 *     proyección anclada en el 7.
 *   - 8: el coste y el tiempo juntos (8.1 y 8.2, desplegados), que comparan
 *     las tareas hermanas, es de este ejemplo (antes, la composición «EUR +
 *     horas»: componer unidades no tiene equivalente en el BQL mínimo). El 8
 *     del mapa son las bases.
 *
 * [X] decidir VG: hileras ordinales. La época 0 dice que cada dígito es un PV
 * en todas las profundidades. Por debajo de la raíz lo cumplen el nombre de
 * cada hilera (.0, su representación) y las dos cantidades (1.1 y 4.1: PV1,
 * cantidades y costes). Lo demás va por orden, no por PV:
 *   - las hileras de partidas y de pasos ocupan 1.0 y 4.0 (la representación
 *     de los recursos y de la fábrica), y los materiales, 1.2 (criterios de
 *     los recursos);
 *   - dentro de las hileras, las partidas (1.0.k), los materiales (1.2.k),
 *     plazo y calidad (2.1 y 2.2), quién (3.k) y los pasos (4.0.k);
 *   - en el registro de partidas, el transporte cae en 1.2 (criterios), los
 *     imprevistos en 1.3 (comunicación) y la tarima en 1.4 (fábrica).
 * Una hilera ordinal pide su regla corta.
 */
export function decuplaTarea({ titulo, partidas, materiales, plazo, calidad, quien, pasos, origen, fechaLimite }) {
  for (const [nombre, lista] of [['partidas', partidas], ['materiales', materiales], ['quien', quien], ['pasos', pasos]]) {
    if (!lista.length || lista.length > 9) throw new Error('de uno a nueve: ' + nombre);
  }
  // Lo que leen de la tarea (payload(it)): las cantidades de las partidas (1.0) y las horas de cada paso (el ocupante 1 de 4.0.k).
  const coste = '=' + COSTE;
  const tiempo = '=' + pasos.map((_, k) => '(nth 1 (payload(it)).4.0.' + (k + 1) + ').1').join(' + ');
  return [
    titulo, // 0 representación
    [
      ['Partidas', ...partidas], // 1.0 hilera de partidas: referencias a sus importes
      [['coste total'], [coste], ['EUR']], // 1.1 coste total = suma de las partidas (1.1.1), en EUR (1.1.2)
      ['Materiales', ...materiales], // 1.2 hilera de materiales
    ], // 1 recursos
    ['Criterios', plazo, calidad, CERRADO], // 2 criterios: 2.1 plazo de ejecución (horas), 2.2 calidad, 2.3 la plantilla de cerrado
    ['Quién habla con quién', ...quien], // 3 comunicación
    [
      ['Pasos', ...pasos], // 4.0 hilera de pasos
      [['tiempo previsto'], [tiempo], ['h']], // 4.1 tiempo previsto = suma de los pasos (4.1.1), en horas (4.1.2)
    ], // 4 fábrica
    EN_PRESUPUESTO, // 5 estructura: dónde encaja lo que busco (los presupuestos, en el 1)
    origen, // 6 pasado: de dónde viene ([X] relleno: repite el hilo)
    fechaLimite, // 7 futuro: la fecha límite ([X] relleno: repite la proyección anclada)
    [['coste y tiempo'], [['coste'], [coste], ['EUR']], [['tiempo'], [tiempo], ['h']]], // 8 ([X] relleno): el coste (8.1) y el tiempo (8.2) de este ejemplo
    FORMULA_ELECCION, // 9 la elección: el primer presupuesto que cabe
  ];
}

/**
 * Lee una magnitud de un registro con el BQL mínimo (contexto-eje.leerPosicion): la desplegada en `indices` (su .1 la
 * cantidad, la fórmula; su .2 la unidad) o un terminal «12 EUR» (lo mismo). { cantidad, unidad, texto }: la cantidad,
 * un número si se resuelve; si no, undefined y el texto dice por qué.
 */
export function magnitudEn(eje, id, indices) {
  const c = leerPosicion(eje, id, [...indices, 1]);
  const u = leerPosicion(eje, id, [...indices, 2]);
  const cantidad = c.estado === 'RESUELTO' && c.valor.length === 1 && typeof c.valor[0] === 'number' ? c.valor[0] : undefined;
  const unidad = u.estado === 'RESUELTO' && u.valor.length === 1 && typeof u.valor[0] === 'string' ? u.valor[0] : undefined;
  return { cantidad, unidad, texto: cantidad === undefined ? c.texto : cantidad + (unidad ? ' ' + unidad : '') };
}

/** Tiempo previsto de una tarea (4.1): { cantidad, unidad, texto }. */
export function tiempoPrevisto(eje, tareaId) {
  return magnitudEn(eje, tareaId, indicesDe(DIR_TIEMPO));
}

/** El presupuesto que eligió la consolidación (su 9). */
function presupuestoElegido(eje, consolidacionId) {
  const elegido = eje.obtener(consolidacionId)?.payload[9];
  if (!elegido?.ref) throw new Error('la consolidación no tiene presupuesto elegido en el 9');
  return eje.obtener(elegido.ref);
}

/**
 * El pago, leído con BQL y no tecleado: el precio del presupuesto elegido
 * (su 1) pasa de quien consolidó al autor del presupuesto, en las series de las
 * partidas de la tarea, por su orden (1.0.1, 1.0.2…) y hasta el importe de
 * cada una. La serie de cada partida es la de quien la escribe y la respalda:
 * E:<autor del registro de partidas>/<concepto>, con el concepto en 1.k.0,
 * leído a través de la referencia. Esa serie tiene que estar emitida por él
 * con al menos el importe de la partida (su capacidad).
 *
 * Antes comprueba lo que la fórmula del 9 no puede comprobar: que quien
 * cobra esté en el 3 de la tarea (quién habla con quién) y no sea quien paga.
 *
 * [X] decidir VG: repartir el precio entre partidas por orden es una regla de
 * este ejemplo. Y el proveedor cobra en tokens de las partidas, que la casa
 * respalda: canjearlos por euros (liquidar una serie) no existe.
 */
export function movimientosDeEjecucion(eje, consolidacionId, tareaId) {
  const c = eje.obtener(consolidacionId);
  const tarea = eje.obtener(tareaId);
  const presupuesto = presupuestoElegido(eje, consolidacionId);
  const quien = tarea.payload[3].slice(1);
  if (!quien.includes(presupuesto.autor) || presupuesto.autor === c.autor) {
    throw new Error(presupuesto.autor + ' no cobra: no está en el 3 de la tarea o es quien paga');
  }
  const precio = magnitudEn(eje, presupuesto.id, [1]);
  if (precio.cantidad === undefined || !precio.unidad) throw new Error('precio sin magnitud: ' + precio.texto);
  let resta = precio.cantidad;
  const movimientos = [];
  for (const ref of tarea.payload[1][0].slice(1)) {
    const donde = indicesDe(ref.dir);
    const importe = magnitudEn(eje, ref.ref, donde); // 1.k.1 es [importe]: la lista de un ocupante se lee como su ocupante
    if (importe.cantidad === undefined || importe.unidad !== precio.unidad) throw new Error('partida sin importe en ' + precio.unidad);
    // El concepto es el ocupante de la 1.k.0 (una lista de uno).
    const concepto = leerPosicion(eje, ref.ref, [...donde.slice(0, -1), 0]);
    if (concepto.estado !== 'RESUELTO' || concepto.valor.length !== 1 || typeof concepto.valor[0] !== 'string') throw new Error('partida sin concepto');
    const denominacion = concepto.valor[0];
    const emisor = eje.obtener(ref.ref).autor;
    const serie = eje.serie(claveToken({ token: 'E', emisor, denominacion }));
    if (serie.emisor !== emisor || serie.emitido < importe.cantidad) throw new Error('partida sin respaldo: ' + emisor + ' no ha emitido ' + importe.cantidad + ' de ' + denominacion);
    const parte = Math.min(resta, importe.cantidad);
    if (parte > 0) movimientos.push({ token: 'E', emisor, denominacion, cantidad: parte, de: c.autor, a: presupuesto.autor });
    resta -= parte;
  }
  if (resta > 0) throw new Error('el precio pasa del coste de las partidas en ' + resta + ' ' + precio.unidad);
  return movimientos;
}

/**
 * Las horas de la entrega, leídas con BQL: las del presupuesto elegido (su
 * 2), que consume su autor, porque es quien trabaja y solo él mueve sus
 * tokens. Las horas previstas de la tarea (4.1) son una previsión de la
 * organizadora y no se consumen.
 * [X] decidir VG: el 2 del presupuesto es su plazo, un criterio (el que la
 * fórmula del 9 compara con el 2.1 de la tarea), y este ejemplo lo consume
 * como horas de trabajo. Son las horas que el proveedor declara; nadie
 * comprueba las reales.
 */
export function horasDeEntrega(eje, consolidacionId) {
  const presupuesto = presupuestoElegido(eje, consolidacionId);
  const horas = magnitudEn(eje, presupuesto.id, [2]);
  if (horas.cantidad === undefined || !ESCALA_DE_UNIDAD[horas.unidad]) throw new Error('tiempo sin escala: ' + horas.texto);
  return { token: 'T', escala: ESCALA_DE_UNIDAD[horas.unidad], cantidad: horas.cantidad, de: presupuesto.autor, a: null };
}

/**
 * claves (opcional): { casa: {publica, privada}, organizadora: {...}, proveedor: {...} }.
 * Con claves, la casa firma el génesis y sus invitaciones, y cada identidad
 * acepta la suya con su clave y firma lo suyo. Sin claves, el eje funciona sin firmas.
 * hasta (opcional): la última etapa que se recorre (ETAPAS).
 */
export async function ejemploTarea({ claves = {}, hasta = 'pagada' } = {}) {
  const tope = ETAPAS.indexOf(hasta);
  if (tope < 0) throw new Error('etapa desconocida: ' + hasta);
  const priv = (id) => claves[id]?.privada;
  const r = {};

  // Génesis: la casa, una persona, emite al empezar su R y sus series: una de E por partida (su capacidad,
  // E:casa/<concepto>) y las horas que cede (E:casa/hora). T no (VG, 8-11: no hay T acumulable): escribe y trabaja
  // con su asignación del día. P tampoco (mapa §15): lo obtiene al escribir.
  const eje = await Eje.genesis({
    demostracion: true,
    identidad: 'casa', // escribe el génesis, su alta: la primera identidad del eje es una persona (VG, 10-11, B1)
    emision: [
      { token: 'R', cantidad: 10 }, // su R (R:casa): emitir E exige R propia emitida (VG, 9-11, D2)
      ...PARTIDAS.map(([concepto, importe]) => ({ token: 'E', denominacion: concepto, cantidad: importe })), // emisor = casa
      { token: 'E', denominacion: 'hora', cantidad: 200 }, // el tiempo que la casa cede a otros: E:casa/hora (T no cruza de persona)
    ],
    foco: 'Casa de eventos de ejemplo',
    t: T0,
    clave: claves.casa?.publica,
    privada: priv('casa'),
  });
  r.eje = eje;

  // Altas: la casa invita a la organizadora y al proveedor, que aceptan (su alta; encargo 3b). Después la
  // organizadora recibe las series de las partidas de la carpa (y ningún otro E); el proveedor externo, horas de la
  // casa (E:casa/hora). Escribir cuesta un minuto por posición, de su propio T. La tarima se queda en la casa.
  for (const id of ['organizadora', 'proveedor']) await entrarPorInvitacion(eje, { por: 'casa', quien: id, t: T0, clave: claves[id], privadaDe: priv });
  const altas = ['Altas para la fiesta del sábado', ['organizadora', 'proveedor']];
  r.alta = await escribirPagando(eje, {
    autor: 'casa',
    sobre: eje.genesisId,
    t: T0,
    movimientos: [
      pagaElCoste('casa'),
      ...DE_LA_CARPA.map(([concepto, importe]) => ({ token: 'E', emisor: 'casa', denominacion: concepto, cantidad: importe, de: 'casa', a: 'organizadora' })),
      // Cada una escribe y trabaja con su asignación de T del día (VG, 8-11). La casa cede al proveedor 20
      // horas de su tiempo como E:casa/hora (VG, 7-11 noche: T no cruza de persona, se transforma en E).
      { token: 'E', emisor: 'casa', denominacion: 'hora', cantidad: 20, de: 'casa', a: 'proveedor' },
    ],
    payload: altas,
  }, priv('casa'));

  // Partidas del sábado: la casa escribe cada partida [concepto, importe] en
  // una hilera de recursos. El importe es la capacidad de la partida.
  r.partidas = await escribirDesde(eje, {
    modo: 'sequenced',
    autor: 'casa',
    sobre: r.alta.id,
    t: T0,
    payload: [
      'Partidas del sábado', // 0
      // Forma canónica (VG, 8-11): cada partida es una décupla [[concepto], [importe]] (cada posición entre
      // corchetes), para que su importe tenga dirección (1.k.1); [concepto, importe] sería una lista de dos ocupantes.
      ['Partidas', ...PARTIDAS.map(([concepto, importe]) => [[concepto], [importe + ' EUR']])], // 1 recursos: 1.k = [[concepto], [importe]]
    ],
  }, priv('casa'));

  // La tarea: la organizadora la escribe sobre las partidas, desde Mapped.
  // El presupuesto referencia los importes de las partidas de la carpa
  // (1.1.1, 1.2.1, 1.3.1): no copia.
  r.tarea = await escribirDesde(eje, {
    modo: 'mapped',
    autor: 'organizadora',
    sobre: r.partidas.id,
    t: '2026-11-07T10:00:00Z',
    payload: decuplaTarea({
      titulo: 'Montar la carpa del sábado',
      partidas: DE_LA_CARPA.map((_, k) => ({ ref: r.partidas.id, dir: '1' + (k + 1) + '10000000' })),
      materiales: ['carpa de 6 × 12 m', 'piquetas', 'cuerdas', 'lastres'],
      plazo: '8 h',
      calidad: 'anclada, tensada y sin goteras',
      quien: ['organizadora', 'proveedor'],
      pasos: [['marcar el suelo', '1 h'], ['anclar las piquetas', '2 h'], ['levantar la carpa', '3 h'], ['tensar y revisar', '1 h']],
      origen: { ref: r.partidas.id },
      fechaLimite: FECHA_LIMITE,
    }),
  }, priv('organizadora'));

  // La fecha límite como proyección: un registro anclado en el futuro (7)
  // de la tarea con el instante de la fecha. El 7 de la tarea solo la
  // declara como texto; el eje temporal ve proyecciones por su `t`.
  r.limite = await escribirDesde(eje, {
    modo: 'pointed',
    autor: 'organizadora',
    sobre: r.tarea.id,
    en: '7000000000',
    t: FECHA_LIMITE,
    payload: 'fecha límite: la carpa, montada',
  }, priv('organizadora'));
  if (tope < 1) return r;

  // El proveedor escribe un presupuesto donde la tarea dice que busca (su 5:
  // los recursos), por PV: 1 su precio, 2 su plazo, 3 con quién hablar. Se
  // pasa del coste total, y lo corrige. Corregir no es modificar: añade un
  // segundo presupuesto y los dos quedan como ocupantes. Aquí la fórmula del
  // 9 elige el corregido solo porque el primero no cabe (ver FORMULA_ELECCION).
  r.presupuestos = [];
  for (const [t, payload] of [
    ['2026-11-07T17:00:00Z', ['Presupuesto: carpa con suelo de madera', '420 EUR', '5 h', 'proveedor']],
    ['2026-11-08T09:30:00Z', ['Presupuesto corregido: carpa sin suelo', '310 EUR', '6 h', 'proveedor']],
  ]) {
    r.presupuestos.push(await escribirDesde(eje, { modo: 'sequenced', autor: 'proveedor', sobre: r.tarea.id, en: r.tarea.payload[5], t, payload }, priv('proveedor')));
  }
  if (tope < 2) return r;

  // Motor: Q descubre, B propone desde las fórmulas del foco, C consolida (la
  // fábrica registra la elección: un registro más, sin fases). El 9 (la
  // elección) entra como el presupuesto elegido; 1–4 y 8 (lo escrito) por
  // referencia a la tarea; 5–7 se heredan.
  r.descubierto = descubrir(eje, r.tarea.id);
  r.propuesta = proponer(eje, r.tarea.id, { posiciones: [1, 2, 3, 4, 8, 9] });
  r.consolidacion = await consolidar(eje, {
    autor: 'organizadora',
    foco: r.tarea.id,
    t: '2026-11-08T10:00:00Z',
    titulo: 'Encargo del montaje de la carpa',
    elecciones: r.propuesta.elecciones,
  }, priv('organizadora'));
  if (tope < 3) return r;

  // La organizadora anuncia en la tarea lo que va a pagar (su 4.1): el precio
  // elegido, en las series de las partidas, como movimientos anunciados del
  // libro (VG 12-11, decisión 8: no tocan saldos), en un anuncio. Es lo que la
  // tarea espera para cerrarse (su plantilla de cerrado).
  const anunciados = movimientosDeEjecucion(eje, r.consolidacion.id, r.tarea.id).map((m) => ({ ...m, estado: 'anunciado' }));
  r.anuncios = [await escribirPagando(eje, {
    autor: 'organizadora', sobre: r.tarea.id, en: ANUNCIO, t: '2026-11-08T10:30:00Z',
    movimientos: [pagaElCoste('organizadora'), ...anunciados], payload: 'pagar',
  }, priv('organizadora'))];
  if (tope < 4) return r;

  // Entrega: el proveedor monta la carpa y lo registra en la fábrica de la
  // consolidación. Consume las horas de su presupuesto (su 1 en la entrega
  // es una referencia a ellas, no una copia): su propio movimiento.
  const presupuesto = presupuestoElegido(eje, r.consolidacion.id);
  const entrega = ['Carpa montada', { ref: presupuesto.id, dir: '2000000000' }];
  r.entrega = await escribirPagando(eje, {
    autor: 'proveedor',
    sobre: r.consolidacion.id,
    en: FABRICA,
    t: '2026-11-13T16:00:00Z',
    movimientos: [
      pagaElCoste('proveedor'),
      horasDeEntrega(eje, r.consolidacion.id),
    ],
    payload: entrega,
  }, priv('proveedor'));
  if (tope < 5) return r;

  // El pago, con la carpa montada el viernes: lo que a la tarea le falta de la
  // organizadora (motor.siguiente), en un registro suyo anclado sobre su
  // anuncio (VG 12-11, decisión 8: así lo cumple).
  const [{ transaccion }] = siguiente(eje, r.tarea.id, 'organizadora').faltaDeMi;
  r.pago = await escribirPagando(eje, {
    autor: 'organizadora',
    sobre: transaccion.sobre,
    en: transaccion.en,
    t: '2026-11-13T18:00:00Z',
    movimientos: [pagaElCoste('organizadora'), ...transaccion.movimientos.slice(1)],
    payload: 'Carpa montada y pagada',
  }, priv('organizadora'));
  return r;
}
