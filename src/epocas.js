// Épocas: convención PARALELA, fuera del dato. Un dato se puede leer desde
// cualquier época. La regla corta dice qué significa cada dígito en cada
// profundidad: diez profundidades por diez dígitos, cien reglas cortas.
// Época 0 (decidida por VG, 7-11 noche): las cien reglas cortas. Profundidad
// 0 = la cruceta, los diez PV sobre el registro en foco; en toda profundidad
// n ≥ 1 el dígito es el PV aplicado al nodo de arriba (0 qué es, 1 cuánto,
// 2 con qué condición, 3 con quién, 4 qué se hace, 5 dónde encaja, 6 de dónde
// viene, 7 para cuándo, 8 frente a otros, 9 cómo). Esas reglas nombran las
// subposiciones de las décuplas: cada índice de una décupla es un dígito
// con su PV (la regla corta de la PR #58). Por hojas (VG, 7-11 noche): un
// array solo de hojas dentro de una posición es una lista; sus elementos no
// son dígitos: son ocupantes por llegada, fuera del árbol, y se nombran
// «ocupante k» (leerCamino y nombreEnNodo). Las reglas largas, que
// especializan rutas completas, son lo que pulen las épocas futuras: se cargan
// con la misma función, en el mismo JSON. Las épocas viven como datos en
// datos/epocas/*.json; datos/epocas/epocas.js es su copia generada para
// importarlas sin fetch.
// Los cortes de las diez cajas del 8 también son regla de la época (VG, 7-11
// noche, decisión 2): `cortes` en el JSON, leídos con epoca.cortes(medida).
// La época como registro (VG, 9-11, mapa §16 [D]): la misma época 0 escrita
// como décupla BTML leída con la cruceta (datos/epocas/epoca-0.btml.json),
// que carga cargarEpocaBtml y lee el BQL mínimo como `epoch` (docs/BQLM.md,
// docs/BTML.md §12). Convive con el formato de siempre, que no cambia.

import { ARIDAD, indicesDe, esLista, esReferencia, esTerminal, esDecupla, validarPayload } from './btml.js';
import { canonico } from './evento.js';
import { sha256, aHex } from './cripto.js';
import { esLectura, esEscritura, esLecturaDePv, analizar, queMueve, esFormula } from './bqlm.js';
import { erroresDelSuelo } from './suelo.js';
import { fundirCambio } from './versiones.js';
import { PLANTILLAS_PROVISIONALES } from './provisional.js';
import { EPOCA_0_DATOS, EPOCA_0_BTML_DATOS, EPOCA_0_BTML_ID, REGLAS_DE_EPOCA_DATOS, PLANTILLAS_DE_EPOCA_DATOS, MODELOS_DE_EPOCA_DATOS, GUIA_DE_EPOCA_DATOS, RETOQUES_0_DATOS } from '../datos/epocas/epocas.js';

/**
 * El tope de profundidad de los grupos de plantillas de dominio del 9.2 (Core AGRAM 17-11): un grupo en el 9.2 es la
 * profundidad 1, uno dentro de él la 2… hasta 3. Va aquí arriba porque la 0 se carga (y se valida) más abajo.
 */
export const PROFUNDIDAD_DE_GRUPOS = 3;

export const PV = Object.freeze([
  'representación', // 0 · PV0, lente libre
  'recursos', // 1 · reino / ciudad
  'criterios', // 2 · jardín / bosque
  'comunicación', // 3 · parque acuático
  'fábrica', // 4 · producción, futuro subjetivo
  'estructura', // 5 · registro en foco, inspección
  'pasado', // 6 · hilos del pasado
  'futuro', // 7 · hilos del futuro
  'comparabilidad', // 8 · cielo
  'camino', // 9 · guía
]);

/** Valor de `profundidad` de una regla que vale en todas las profundidades. */
export const TODAS = 'todas';

const esIndice = (x) => Number.isInteger(x) && x >= 0 && x < ARIDAD;
const esRuta = (x) => typeof x === 'string' && /^[0-9]{2,10}$/.test(x);

/** Escala provisional de las diez cajas del 8 (nueve umbrales crecientes a saltos, VG, 7-11 noche: «sin más pretensión, se cambiará con datos reales»). Vale solo si ninguna época de la cadena trae cortes. [X] decidir VG: sus valores. */
export const CORTES_PROVISIONALES = Object.freeze([1, 2, 3, 4, 6, 10, 16, 26, 42]);

const sonCortes = (c) => Array.isArray(c) && c.length === ARIDAD - 1 && c.every(Number.isFinite) && c.every((x, k) => k === 0 || x > c[k - 1]);

/**
 * Reduce el campo `cortes` de una época a su escala única, o undefined si no
 * trae ninguna: una lista de nueve umbrales, o (forma por medida, EN DESUSO)
 * un objeto cuya escala es la de la clave `*`, `todas` o `por defecto`, o si
 * no la de la primera medida; `decision` es texto, no una escala.
 */
function escalaDeCortes(cortes, nombre) {
  if (cortes === undefined || cortes === null) return undefined;
  let lista = cortes;
  if (!Array.isArray(cortes)) {
    if (typeof cortes !== 'object') throw new TypeError(nombre + ': cortes es una lista de nueve umbrales crecientes (o, en desuso, un objeto por medida)');
    const claves = Object.keys(cortes).filter((k) => k !== 'decision');
    const clave = ['*', 'todas', 'por defecto'].find((k) => claves.includes(k)) ?? claves[0];
    if (clave === undefined) return undefined;
    lista = cortes[clave];
    if (!sonCortes(lista)) throw new TypeError(nombre + ': los cortes de ' + clave + ' han de ser nueve umbrales crecientes');
  } else if (!sonCortes(lista)) {
    throw new TypeError(nombre + ': los cortes han de ser nueve umbrales crecientes');
  }
  return { cortes: lista, origen: 'epoca' };
}

/**
 * Carga una época desde sus datos: { nombre, estado, principios, ordinales?,
 * reglas, dudas }. Una regla corta es { profundidad, digito, nombre,
 * significado, ejemplo }, con profundidad 0–9 o 'todas'. Las cien
 * combinaciones profundidad × dígito tienen que quedar cubiertas: por una regla
 * de esa profundidad, por una de 'todas' o por la época de respaldo.
 * Una regla larga es { ruta, nombre, significado, ejemplo }, con `ruta` de
 * dos a diez dígitos (el prefijo que especializa) en lugar de profundidad y
 * dígito: al leer esa ruta exacta gana a las cortas. No hace falta cubrir
 * nada con ellas. Con respaldo, las largas de la propia época mandan y las del
 * respaldo valen donde la propia no dice nada.
 * `ordinales` son las profundidades donde el dígito es orden y no un nombre:
 * da el gancho epoca.ordinal(profundidad) que usa el encaje.
 * `cortes` (opcional) es UNA SOLA escala de nueve umbrales crecientes para las
 * diez cajas del 8 y para todas las medidas (VG, 8-11: las cajas se calculan
 * sobre cantidades y cuotas, no sobre recuentos; antes, VG 7-11 noche, decisión
 * 2: son regla de la época, MAPA §12 «Cortes de las cajas = regla de la época»;
 * la época 0 trae 1 2 3 4 6 10 16 26 42). Va como una lista de nueve números;
 * por compatibilidad se admite un objeto por medida { <clave>: [...], todas?:
 * [...], decision?: texto }, pero esa forma queda EN DESUSO: se reduce a la
 * escala única (la clave `*`, `todas` o `por defecto`, o si no la primera) y
 * ya no hay una escala por medida. Una época sin `cortes` HEREDA los de su
 * respaldo (recursivo), igual que hereda las reglas cortas (VG, 8-11); si
 * nadie los trae, vale CORTES_PROVISIONALES. Da el gancho epoca.cortes(clave),
 * que devuelve siempre esa escala única (la clave solo se acepta por
 * compatibilidad con quien lee por medida: src/bases.js), y
 * epoca.cortesConOrigen(), { cortes, origen }, con origen 'epoca' (los trae la
 * época o su respaldo) o 'provisional' (nadie los trae).
 */
export function cargarEpoca(datos, { respaldo } = {}) {
  if (!datos || typeof datos !== 'object') throw new TypeError('época: faltan los datos');
  if (typeof datos.nombre !== 'string' || !datos.nombre) throw new TypeError('época: falta el nombre');
  if (!Array.isArray(datos.reglas)) throw new TypeError(datos.nombre + ': faltan las reglas');
  const ordinales = datos.ordinales ?? [];
  if (!Array.isArray(ordinales) || !ordinales.every(esIndice)) throw new TypeError(datos.nombre + ': ordinales son profundidades 0–9');
  const escalaPropia = escalaDeCortes(datos.cortes, datos.nombre);
  const escala = escalaPropia
    ?? (typeof respaldo?.cortesConOrigen === 'function' ? respaldo.cortesConOrigen() : undefined)
    ?? { cortes: CORTES_PROVISIONALES, origen: 'provisional' };
  const origenCortes = escalaPropia ? 'epoca' : escala.origen;
  const cortesFijos = Object.freeze([...(escalaPropia ?? escala).cortes]);

  const propias = new Map(); // 'p.d' → regla
  const generales = new Map(); // d → regla de todas las profundidades
  const largas = new Map(); // ruta → regla larga
  for (const r of datos.reglas) {
    if (r?.ruta !== undefined) {
      const donde = datos.nombre + ' ruta ' + r.ruta;
      if (!esRuta(r.ruta)) throw new TypeError(donde + ': la ruta de una regla larga son de dos a diez dígitos');
      if (r.profundidad !== undefined || r.digito !== undefined) throw new TypeError(donde + ': una regla larga lleva ruta, no profundidad ni dígito');
      if (typeof r.nombre !== 'string' || !r.nombre) throw new TypeError(donde + ': falta el nombre');
      if (largas.has(r.ruta)) throw new Error(donde + ': regla larga repetida');
      largas.set(r.ruta, r);
      continue;
    }
    const donde = datos.nombre + ' ' + r?.profundidad + '.' + r?.digito;
    if (!esIndice(r?.digito)) throw new TypeError(donde + ': dígito 0–9');
    if (r.profundidad !== TODAS && !esIndice(r.profundidad)) throw new TypeError(donde + ': profundidad 0–9 o «todas»');
    if (typeof r.nombre !== 'string' || !r.nombre) throw new TypeError(donde + ': falta el nombre');
    const tabla = r.profundidad === TODAS ? generales : propias;
    const clave = r.profundidad === TODAS ? r.digito : r.profundidad + '.' + r.digito;
    if (tabla.has(clave)) throw new Error(donde + ': regla repetida');
    tabla.set(clave, r);
  }

  const fijar = (r, profundidad, digito) => Object.freeze({
    profundidad, digito, nombre: r.nombre, significado: r.significado ?? '', ejemplo: r.ejemplo ?? '',
  });
  const reglas = [];
  for (let p = 0; p < ARIDAD; p++) {
    for (let d = 0; d < ARIDAD; d++) {
      const r = propias.get(p + '.' + d) ?? generales.get(d) ?? respaldo?.regla(p, d);
      if (!r) throw new Error(datos.nombre + ': falta la regla corta ' + p + '.' + d);
      reglas.push(fijar(r, p, d));
    }
  }
  const esOrdinal = new Set(ordinales);

  const fijarLarga = (r) => Object.freeze({
    ruta: r.ruta, nombre: r.nombre, significado: r.significado ?? '', ejemplo: r.ejemplo ?? '',
  });
  const largasFijas = [...largas.values()].map(fijarLarga);
  const largaPorRuta = new Map(largasFijas.map((r) => [r.ruta, r]));

  /** Regla completa de un dígito en una profundidad, o undefined. */
  function regla(profundidad, digito) {
    if (!esIndice(digito)) return undefined;
    if (esIndice(profundidad)) return reglas[profundidad * ARIDAD + digito];
    // Fuera de las diez profundidades solo valen las reglas de todas las profundidades.
    const g = generales.get(digito);
    return g ? fijar(g, profundidad, digito) : undefined;
  }

  /** Regla larga completa de una ruta exacta (cadena de dos a diez dígitos), o undefined. */
  function larga(ruta) {
    return largaPorRuta.get(ruta) ?? respaldo?.larga?.(ruta);
  }

  return Object.freeze({
    nombre: datos.nombre,
    estado: datos.estado ?? '',
    principios: Object.freeze([...(datos.principios ?? [])]),
    dudas: Object.freeze([...(datos.dudas ?? [])]),
    reglas: Object.freeze(reglas),
    largas: Object.freeze(largasFijas),
    regla,
    larga,
    /** Regla corta: el nombre de un dígito en una profundidad. */
    reglaCorta(profundidad, digito) {
      return regla(profundidad, digito)?.nombre;
    },
    /** Regla larga: el nombre que da a una ruta exacta, o undefined si no la especializa. */
    reglaLarga(ruta) {
      return larga(ruta)?.nombre;
    },
    /** ¿El dígito es orden (y no un nombre) en esa profundidad? */
    ordinal(profundidad) {
      return esOrdinal.has(profundidad);
    },
    /** La escala única de cortes de las cajas del 8 (VG, 8-11): la misma para toda medida o serie, así que `clave` no cambia nada. La propia, la heredada del respaldo o la provisional. */
    cortes(clave) { // eslint-disable-line no-unused-vars
      return [...cortesFijos];
    },
    /** { cortes, origen } de la escala única: origen 'epoca' (propia o heredada del respaldo) o 'provisional' (nadie la trae). */
    cortesConOrigen() {
      return { cortes: [...cortesFijos], origen: origenCortes };
    },
  });
}

/**
 * Época 0, decidida por VG: las cien reglas cortas. Profundidad 0 = los diez
 * PV sobre el registro en foco; en toda profundidad n ≥ 1, el dígito es el PV
 * aplicado al nodo de arriba.
 */
export const EPOCA_0 = cargarEpoca(EPOCA_0_DATOS);
if (!PV.every((n, d) => EPOCA_0.reglaCorta(0, d) === n)) throw new Error('época 0: los datos no coinciden con los diez PV');

/** Épocas por nombre. Hoy solo hay la época 0; las futuras se añaden aquí al cargarlas. */
export const EPOCAS = Object.freeze({ [EPOCA_0.nombre]: EPOCA_0 });

// ---------- la época como registro (VG, 9-11, mapa §16 [D]) ----------

/** Copia congelada en profundidad de un valor JSON. */
function congelarCopia(x) {
  const copia = JSON.parse(JSON.stringify(x));
  const congelar = (v) => {
    if (v !== null && typeof v === 'object') {
      Object.values(v).forEach(congelar);
      Object.freeze(v);
    }
    return v;
  };
  return congelar(copia);
}

/** Lo que hay en una posición en forma canónica: la lista de uno se lee como su ocupante. */
const hojaDe = (x) => (Array.isArray(x) && x.length === 1 ? x[0] : x);
const textoNoVacio = (x) => typeof x === 'string' && x.length > 0;

/**
 * Las plantillas de transacción provisionales (src/provisional.js; Core AGRAM 18-11, VG 18-11: lo que irá al 9.6 de la 0
 * en su pasada única), como las ve una época: { id, plantilla, provisional: true }, el id el hash de su cuerpo canónico
 * (como el de una plantilla de una hija). Se calculan una vez, antes de cargar la 0 más abajo en este módulo.
 */
const TRANSACCIONES_PROVISIONALES = Object.freeze(PLANTILLAS_PROVISIONALES.map((p) => Object.freeze({ id: idDeRegistro(p), plantilla: congelarCopia(p), provisional: true })));

/**
 * Carga una época escrita como décupla BTML (datos/epocas/epoca-0.btml.json),
 * leída con la cruceta (VG, 9-11, mapa §16 [D] «La época es un registro leído
 * con la cruceta»): 0 nombre; 1 las cuatro familias (E 1.0, P 1.1, R 1.2,
 * T 1.3, cada una [[nombre], [estructura], [estado]]); 2 las reglas largas
 * (condiciones): la lista de referencias { ref } a sus registros, uno por
 * regla (VG, 10-11, A1), que el cargador resuelve con `registros`
 * ([{ id, registro }]); cada regla, una décupla del molde con las diez
 * posiciones llenas (una regla no se corrige: se versiona, #119);
 * 3 la plantilla de identidad y el autor del primer registro; 4 primitivas y
 * despliegues; 5 las cien reglas cortas (5.p.d = [[nombre], [significado],
 * [ejemplo]]); 6 procedencia ([[notas], [claves], [valores]], #77: la clave «hereda»); 7 calendario y reloj; 8 cortes de las cajas,
 * órdenes de magnitud y modos; 9 plantillas y el orden del tutorial.
 * Sin posiciones vacías (VG: nunca se escribe []): la raíz y cada regla llevan
 * las diez; ningún array va vacío ni con huecos (validarPayload).
 * Devuelve lo mismo que cargarEpoca (regla, reglaCorta, larga, reglaLarga,
 * ordinal, cortes, cortesConOrigen), y además `payload` y `registro` (la
 * décupla congelada: el registro `epoch` que lee el BQL mínimo,
 * src/contexto-eje.js), `condiciones` (las reglas del 2, en su orden),
 * `reglasConId` ([{ id, regla }], las mismas con su id) y
 * `registros` (Map id → regla: lo que el BQL mínimo alcanza al seguir una
 * referencia del 2). Las reglas largas por ruta de cargarEpoca no existen
 * aquí: las del 2 son condiciones, no nombres de rutas.
 */
export function cargarEpocaBtml(payload, { registros = [], plantillas = [], id = null, validar = true } = {}) {
  // `validar: false` solo para una época RESUELTA por herencia (cargarEpocaEscrita): sus dos partes ya se validaron, y
  // una colección combinada (el 4.3, el 1.2.1) puede pasar de diez entradas.
  const v = validar ? validarPayload(payload) : { ok: true };
  if (!v.ok) throw new TypeError('época BTML: ' + v.errores.join('; '));
  if (!Array.isArray(payload) || payload.length !== ARIDAD) throw new TypeError('época BTML: la raíz lleva las diez posiciones llenas');
  const registro = congelarCopia(payload);
  const nombres = Array.isArray(registro[0]) ? registro[0] : [registro[0]];
  const nombre = nombres[0];
  if (!textoNoVacio(nombre)) throw new TypeError('época BTML: falta el nombre en el 0');

  // 9.2: las plantillas de dominio y sus grupos (Core AGRAM 17-11): cada posición, una plantilla o un grupo bien formado.
  const dominio = erroresDelDominio(registro);
  if (dominio.length) throw new TypeError(nombre + ': época mal formada: ' + dominio.join('; '));

  // 5: las cien reglas cortas.
  const cortas = registro[5];
  if (!Array.isArray(cortas) || cortas.length !== ARIDAD) throw new TypeError(nombre + ': el 5 son las diez profundidades de reglas cortas');
  const reglas = [];
  for (let p = 0; p < ARIDAD; p++) {
    if (!Array.isArray(cortas[p]) || cortas[p].length !== ARIDAD) throw new TypeError(nombre + ': la profundidad ' + p + ' lleva diez reglas cortas');
    for (let d = 0; d < ARIDAD; d++) {
      const r = cortas[p][d];
      const [n, s, e] = Array.isArray(r) ? r.map(hojaDe) : [];
      if (![n, s, e].every(textoNoVacio)) throw new TypeError(nombre + ': la regla corta ' + p + '.' + d + ' es [[nombre], [significado], [ejemplo]]');
      reglas.push(Object.freeze({ profundidad: p, digito: d, nombre: n, significado: s, ejemplo: e }));
    }
  }

  // 2: las reglas largas (condiciones). Cada regla es su propio registro (VG, 10-11, A1): el 2 de la época es
  // la LISTA de referencias { ref } a esos registros, una hoja por regla, sin tope de diez; el cargador las
  // resuelve con `registros` ([{ id, registro }]: hoy, los de datos/epocas/reglas/). Cada regla lleva las diez
  // posiciones llenas y la condición «=…» en el 2 (el último ocupante). Una regla no se corrige: se versiona (#119; el
  // mecanismo de correcciones, ocupantes añadidos desde fuera, se retiró en la época 0 final).
  const porId = new Map();
  for (const r of registros) {
    if (!r || typeof r.id !== 'string' || !Array.isArray(r.registro)) throw new TypeError(nombre + ': un registro de la época es { id, registro }');
    porId.set(r.id, r.registro);
  }
  const entradas = Array.isArray(registro[2]) ? registro[2] : [];
  if (!esLista(entradas) || !entradas.every((x) => esReferencia(x) && x.dir === undefined)) {
    throw new TypeError(nombre + ': el 2 es la lista de referencias { ref } a los registros de sus reglas (VG, 10-11, A1)');
  }
  const reglasDel2 = entradas.map(({ ref }, k) => {
    const donde = 'la regla ' + (k + 1) + ' del 2 (' + ref.slice(0, 8) + ')';
    if (!porId.has(ref)) throw new TypeError(nombre + ': ' + donde + ' no está entre los registros de la época');
    const r = porId.get(ref);
    if (!Array.isArray(r) || r.length !== ARIDAD || !r.every((x) => Array.isArray(x) && x.length > 0)) throw new TypeError(nombre + ': ' + donde + ' lleva las diez posiciones llenas');
    const efectiva = r.map((x) => [...x]);
    const c = efectiva[2][efectiva[2].length - 1];
    // La lectura de un punto de vista (encargo «lecturas»): cada ocupante de su 2, una fórmula o «js <nombre>».
    if (esLecturaDePv(efectiva) ? !efectiva[2].every((x) => esFormula(x) || /^js [a-z]+$/.test(x)) : !esFormula(c)) throw new TypeError(nombre + ': ' + donde + ' lleva su condición «=…» en el 2');
    // Invariante del núcleo (VG 12-11, decisión 6 del estudio BQL-transacciones): las reglas de la época solo leen.
    // Una regla con un verbo (mint transfer lock release burn) no se carga; un put, solo en una regla que escribe.
    for (const x of efectiva[2]) {
      if (!esFormula(x)) continue;
      let mueve;
      try {
        mueve = queMueve(analizar(x, { sujeto: true }));
      } catch {
        continue; // lo que no se analiza lo dice la regla al evaluarse
      }
      if (mueve.verbo) throw new TypeError(nombre + ': ' + donde + ' mueve («' + mueve.verbo + '»): una regla solo lee; solo una plantilla de transacción mueve (invariante del núcleo)');
      if (mueve.put && !esEscritura(efectiva)) throw new TypeError(nombre + ': ' + donde + ' coloca (put) sin ser una regla que escribe (put en su 4)');
    }
    return Object.freeze({ id: ref, regla: congelarCopia(efectiva) });
  });
  // Las lecturas (B5: «read» en su 4) están en el 2 como las demás, pero no son condiciones: el contexto las
  // pone en la posición que dice su 3 (src/contexto-eje.js) y las otras reglas las leen ahí.
  const condiciones = Object.freeze(reglasDel2.filter((x) => !esLectura(x.regla) && !esEscritura(x.regla) && !esLecturaDePv(x.regla)).map((x) => x.regla));
  // Las lecturas de los puntos de vista (encargo «lecturas», issue #12: «point of view» en su 4) tampoco: las aplica el
  // contrato a un nodo (contrato.leer), una por PV, en el orden de su 8.
  const lecturasDePv = Object.freeze(reglasDel2.filter((x) => esLecturaDePv(x.regla)).map((x) => x.regla));
  const lecturas = Object.freeze(reglasDel2.filter((x) => esLectura(x.regla)).map((x) => x.regla));
  // Las reglas que escriben (encargo 3b: «put» en su 4, la obtención de P) tampoco son condiciones: lo que colocan
  // lo asienta el libro en la misma transacción (src/eje.js).
  const escrituras = Object.freeze(reglasDel2.filter((x) => esEscritura(x.regla)).map((x) => x.regla));
  // Lo que alcanza una referencia a un registro de la época: todos los que se pasan (las reglas, y desde el encargo
  // 3c-2b los modelos de visualización y sus piezas, que referencia el 9.7), y las reglas del 2.
  const registrosDeEpoca = new Map([...porId].map(([id, r]) => [id, congelarCopia(r)]));
  for (const x of reglasDel2) registrosDeEpoca.set(x.id, x.regla);

  // 9.6: las plantillas de transacción (encargo 3c-2a, las acciones del aro): la lista de referencias a sus registros,
  // uno por acción (`plantillas`, [{ id, registro }]: hoy, los de datos/epocas/plantillas/), en el orden de su 8
  // ([punto de vista, orden]). Son registros de la época como las reglas: una referencia del 9.6 leída con el BQL
  // mínimo alcanza su registro. Sin 9.6 (una época sin acciones) o sin `plantillas` (quien carga la época sin ellas),
  // ninguna: las referencias del 9.6 quedan sin resolver.
  const porIdPlantilla = new Map();
  for (const p of plantillas) {
    if (!p || typeof p.id !== 'string' || !Array.isArray(p.registro)) throw new TypeError(nombre + ': una plantilla de transacción de la época es { id, registro }');
    porIdPlantilla.set(p.id, p.registro);
  }
  // 9.6.0 es la cabecera; 9.6.1 la lista de referencias (una posición con una décupla dentro no pasa de diez ocupantes).
  const entradas96 = plantillas.length && Array.isArray(registro[9]) && Array.isArray(registro[9][6]) && Array.isArray(registro[9][6][1]) ? registro[9][6][1] : [];
  if (entradas96.length && (!esLista(entradas96) || !entradas96.every((x) => esReferencia(x) && x.dir === undefined))) {
    throw new TypeError(nombre + ': el 9.6.1 es la lista de referencias { ref } a los registros de sus plantillas de transacción');
  }
  const propias96 = entradas96.map(({ ref }, k) => {
    const donde = 'la plantilla ' + (k + 1) + ' del 9.6 (' + ref.slice(0, 8) + ')';
    if (!porIdPlantilla.has(ref)) throw new TypeError(nombre + ': ' + donde + ' no está entre las plantillas de la época');
    const p = porIdPlantilla.get(ref);
    if (p.length !== ARIDAD || !p.every((x) => Array.isArray(x) && x.length > 0)) throw new TypeError(nombre + ': ' + donde + ' lleva las diez posiciones llenas');
    const c = p[2][p[2].length - 1];
    if (!esFormula(c)) throw new TypeError(nombre + ': ' + donde + ' lleva en su 2 cuándo se ofrece, una fórmula «=…»');
    const r = congelarCopia(p);
    registrosDeEpoca.set(ref, r);
    return Object.freeze({ id: ref, plantilla: r });
  });
  // Detrás, las provisionales (src/provisional.js: lo que irá al 9.6 de la 0 en su pasada única) cuyo nombre la época no
  // tiene: lo de la época gana siempre, por nombre. Marcadas `provisional` (lo que cuenta o compara las plantillas propias
  // de una época las distingue así), no están en su 9.6 ni en `registros`, y no cambian su id (el de la raíz escrita).
  // Como las lecturas provisionales (src/contexto-eje.js), solo en una época con acciones: sin 9.6, o cargada sin sus
  // plantillas, ninguna.
  const nombres96 = new Set(propias96.map((x) => primeraHojaDe(x.plantilla[0])));
  const transacciones = Object.freeze([...propias96, ...(propias96.length ? TRANSACCIONES_PROVISIONALES.filter((x) => !nombres96.has(primeraHojaDe(x.plantilla[0]))) : [])]);

  // 8.0: los cortes de las diez cajas del 8.
  const cortesDatos = Array.isArray(registro[8]) ? registro[8][0] : undefined;
  const escala = escalaDeCortes(Array.isArray(cortesDatos) ? [...cortesDatos] : undefined, nombre);
  const cortesFijos = Object.freeze([...(escala?.cortes ?? CORTES_PROVISIONALES)]);
  const origenCortes = escala ? 'epoca' : 'provisional';

  function regla(profundidad, digito) {
    if (!esIndice(digito) || !esIndice(profundidad)) return undefined;
    return reglas[profundidad * ARIDAD + digito];
  }

  return Object.freeze({
    nombre,
    // El id de la raíz (el hash de su cuerpo canónico, datos/epocas/generar.mjs): lo que nombran el génesis y una invitación.
    id,
    nombres: Object.freeze([...nombres]),
    payload: registro,
    registro,
    reglas: Object.freeze(reglas),
    condiciones,
    lecturas,
    lecturasDePv,
    escrituras,
    reglasConId: Object.freeze(reglasDel2),
    // Las plantillas de transacción (encargo 3c-2a): [{ id, plantilla }], en el orden del 9.6; detrás, las provisionales
    // que la época no tiene por su nombre, [{ id, plantilla, provisional: true }].
    transacciones,
    registros: registrosDeEpoca,
    largas: Object.freeze([]),
    regla,
    larga: () => undefined,
    reglaCorta: (profundidad, digito) => regla(profundidad, digito)?.nombre,
    reglaLarga: () => undefined,
    ordinal: () => false,
    cortes: () => [...cortesFijos],
    cortesConOrigen: () => ({ cortes: [...cortesFijos], origen: origenCortes }),
  });
}

/**
 * Los registros de los modelos de visualización de la época y de sus piezas (datos/epocas/modelos/, encargo 3c-2b),
 * como { id, registro }: el 9.7 de la raíz referencia los modelos y cada modelo sus piezas, y el BQL mínimo los
 * alcanza como alcanza las reglas del 2 (src/contexto-eje.js). Lo que se pasa a cargarEpocaBtml junto a las reglas.
 */
export const REGISTROS_DE_MODELOS = Object.freeze(MODELOS_DE_EPOCA_DATOS.flatMap((m) => [{ id: m.id, registro: m.registro }, ...m.piezas.map((p) => ({ id: p.id, registro: p.registro }))]));

/**
 * La época 0 como décupla BTML (datos/epocas/epoca-0.btml.json), con los
 * registros de sus reglas (datos/epocas/reglas/) y sus modelos de visualización con sus piezas
 * (datos/epocas/modelos/): las mismas cien reglas cortas que EPOCA_0. No
 * está en EPOCAS: es la misma época en otro formato.
 */
export const EPOCA_0_BTML = cargarEpocaBtml(EPOCA_0_BTML_DATOS, { registros: [...REGLAS_DE_EPOCA_DATOS, ...REGISTROS_DE_MODELOS, ...GUIA_DE_EPOCA_DATOS], plantillas: PLANTILLAS_DE_EPOCA_DATOS, id: EPOCA_0_BTML_ID });

/**
 * La hoja de retoques de la 0 del código (A20 escalón 1; datos/epocas/retoques-0.json, docs/notas/RETOQUES.md): una
 * lista de [idioma, clave, texto] FUERA del id de la época, que la lectura de textos (src/contrato.js) pone encima de los
 * textos de nacimiento de la 0 y debajo de los de una época hija. Corregir un texto aquí no cambia el id de la 0.
 */
export const RETOQUES_DE_LA_0 = Object.freeze(RETOQUES_0_DATOS.map((e) => Object.freeze([...e])));

/** El id de la época 0: el registro con id conocido que el génesis lleva en su contexto (contexto.epoca) y que una invitación referencia en su 2. */
export { EPOCA_0_BTML_ID };

/** Una época por objeto o por nombre ('época 0'). */
export function epocaDe(epoca = EPOCA_0) {
  const e = typeof epoca === 'string' ? EPOCAS[epoca] : epoca;
  if (!e || typeof e.reglaCorta !== 'function') throw new TypeError('época desconocida: ' + (typeof epoca === 'string' ? epoca : typeof epoca));
  return e;
}

/**
 * Lee una dirección bajo una época (objeto o nombre): una entrada por
 * profundidad real. Si la época tiene una regla larga para el prefijo exacto
 * que llega hasta esa profundidad (la ruta de los dígitos hasta ahí), gana a
 * la corta y la entrada lleva además `larga: ruta`. Una dirección solo
 * nombra subposiciones de la décupla (VG, 7-11 noche): cada dígito se lee
 * con su regla, sin mirar ningún payload; nunca nombra un ocupante de una
 * lista explícita.
 */
export function leerDireccion(dir, epoca = EPOCA_0) {
  return leerCamino(indicesDe(dir), epoca);
}

/**
 * Como leerDireccion, pero sobre un camino de índices (un índice 0 final
 * cuenta). En una décupla, cada índice es un dígito con su regla corta (o
 * larga). Con `{ payload }` (el del registro que se lee), un índice que cae
 * en una lista del payload (por hojas: fuera de la raíz, un array solo de
 * hojas) no es un dígito: es la llegada de un ocupante, y da
 * { profundidad, digito, ocupante: k, posicion: '1', significado: 'ocupante k+1 de la posición 1' }
 * sin regla corta ni larga: la lista está fuera del árbol («profundidad
 * 11»). Lo que siga bajo un elemento que sea una décupla vuelve a la regla
 * corta de su profundidad.
 */
export function leerCamino(indices, epoca = EPOCA_0, { payload } = {}) {
  const e = epocaDe(epoca);
  if (!Array.isArray(indices) || indices.length > ARIDAD || !indices.every(esIndice)) throw new TypeError('un camino de 0 a 10 índices 0–9');
  let nodo = payload;
  return indices.map((digito, profundidad) => {
    const padre = nodo;
    if (profundidad > 0 && esLista(padre) && digito < padre.length) {
      nodo = padre[digito];
      const posicion = indices.slice(0, profundidad).join('.');
      return { profundidad, digito, ocupante: digito, posicion, significado: 'ocupante ' + (digito + 1) + ' de la posición ' + posicion };
    }
    nodo = Array.isArray(padre) ? padre[digito] : undefined;
    const entrada = { profundidad, digito, significado: e.reglaCorta(profundidad, digito) };
    if (profundidad > 0 && typeof e.reglaLarga === 'function') {
      const ruta = indices.slice(0, profundidad + 1).join('');
      const nombre = e.reglaLarga(ruta);
      if (nombre !== undefined) return { ...entrada, significado: nombre, larga: ruta };
    }
    return entrada;
  });
}

/**
 * Nombre de la posición `digito` de un nodo del payload que está a
 * `profundidad` (la décupla de Pointed, las celdas de Mapped): si el nodo es
 * una lista (por hojas: bajo una posición, profundidad ≥ 1, un array solo de
 * hojas) y el dígito cae en ella, { ocupante: k, significado: 'ocupante
 * k+1' }; si no (una décupla, la raíz, un terminal o nada), la regla corta
 * de esa profundidad.
 */
export function nombreEnNodo(nodo, profundidad, digito, epoca = EPOCA_0) {
  if (profundidad > 0 && esLista(nodo) && digito < nodo.length) return { ocupante: digito, significado: 'ocupante ' + (digito + 1) };
  return { significado: epocaDe(epoca).reglaCorta(profundidad, digito) };
}

// ---------- la época vive en el eje (VG, 14-11, #107; decisión #63 con AARPIA) ----------
//
// Las épocas son datos y cada eje referencia la suya por id: «cada evento se juzga con la época que referencia,
// resuelta en el libro». Una época ESCRITA es { raiz, registros }: `raiz` su décupla BTML (su id, el hash de su cuerpo
// canónico, es lo que nombran el génesis y los eventos) y `registros` las décuplas de los registros que referencia
// (reglas del 2, plantillas del 9.6.1, modelos y piezas del 9.7, la guía del 9.9), cada uno con el id de su cuerpo
// canónico. El génesis la escribe en el libro (src/eje.js, Eje.genesis); eje.epoca() la devuelve cargada y resuelta.
//
// HERENCIA (Core con Core StateArk, 14-11): una época declara en su 6, como claves y valores (#77), la clave «hereda»
// con el id de la época base: 6 = [[notas de procedencia…], [claves…], [valores…]]. Sin «hereda» es completa por sí
// misma. Al cargar se FUSIONA por direcciones: donde la hija tiene contenido gana el suyo; donde no (una décupla que
// acaba antes) hereda el de la base. Como una décupla no tiene huecos (#77), la hija marca cada posición que hereda
// con la referencia { ref: <id de la base> } en esa dirección, «lo de la base aquí»: la resolución la sustituye por lo
// que la base tiene en la misma dirección (si la base tampoco lo tiene, la carga falla y dice dónde).
// Las COLECCIONES se combinan: el 2 (reglas), el 9.6.1 (plantillas), el 4.3 (estaciones), el 1.2.1 (grupos), el 9.2.0.3
// (los tipos de parámetro, Core AGRAM 18-11: src/tipos.js; uno con el mismo 0 que uno de la base no lo afloja, lo endurece) y el 8.7.1
// (las formas por PV): las entradas de la hija se añaden a las de la base, y una con el mismo 0 que una de la base la
// sustituye. El id que referencian los eventos es el de la hija tal como se escribió; la resolución es una lectura.

/** La clave del 6.1 con que una época nombra su base (su valor, en el 6.2, es el id de la base). */
export const HEREDA = 'hereda';

/** Las colecciones que se combinan al heredar (caminos en la raíz), en vez de sustituirse. */
export const COLECCIONES = Object.freeze(['2', '9.6.1', '4.3', '1.2.1', '8.7.1', '9.2.0.3']);

/** El id de un registro de la época (y el de su raíz): el hash SHA-256 de su cuerpo canónico, en hexadecimal. */
export function idDeRegistro(registro) {
  return aHex(sha256(new TextEncoder().encode(canonico(registro))));
}

// ---------- las plantillas de dominio del 9.2 y sus grupos (Core AGRAM 17-11) ----------
//
// El 9.2 es una décupla: 0 la cabecera (0.0 su etiqueta, «domain templates»; 0.1 el tipo genérico por dígito) y, en 1-9,
// las plantillas de dominio. UNA POSICIÓN PUEDE SER UN GRUPO: una décupla cuyo 0.0 dice lo mismo que el 0.0 de la cabecera
// del 9.2 no es una plantilla sino otra décupla de plantillas (su 0, la cabecera; detrás, hasta nueve plantillas o grupos,
// leídos igual), hasta PROFUNDIDAD_DE_GRUPOS. Así una época hija añade plantillas de datos sin tapar las de su base: el 9.2
// se hereda por posición, y un grupo en una posición libre lleva varias. El grupo se reconoce por su cabecera antes de
// preguntar si es una plantilla. El tipo genérico por dígito se lee solo en la cabecera de arriba (9.2.0.1). Funciones
// declaradas (no flechas): la 0 se carga más arriba en este módulo.

/** La primera hoja de un nodo (bajando por los primeros elementos), para la etiqueta de una cabecera. */
function primeraHojaDe(x) {
  let n = x;
  while (Array.isArray(n)) n = n[0];
  return n;
}

/**
 * ¿Es `r` una plantilla de datos? Un registro cuya posición 4 lleva `template`: en su 4 mismo (una lista) o, si su 4
 * describe el 4 de los datos (una décupla), en su 4.4. (contrato.esPlantilla es esta.)
 */
export function esPlantillaDeDatos(r) {
  if (!Array.isArray(r) || !Array.isArray(r[4])) return false;
  const cuatro = r[4];
  if (esLista(cuatro)) return cuatro.includes('template');
  return Array.isArray(cuatro[4]) && cuatro[4].includes('template');
}

/** ¿Es `x` un grupo de plantillas de dominio: una décupla cuyo 0.0 es la etiqueta de la cabecera del 9.2? */
export function esGrupoDePlantillas(x, etiqueta) {
  return typeof etiqueta === 'string' && Array.isArray(x) && esDecupla(x) && Array.isArray(x[0]) && primeraHojaDe(x) === etiqueta;
}

/**
 * Las plantillas de dominio del 9.2, también las de dentro de sus grupos, en su orden: [{ registro, camino }] (`camino`,
 * los dígitos bajo el 9.2: [k] o [k, j…]). `etiqueta` es la de la cabecera (por defecto, el 0.0 del 9.2 dado). Si se pasa
 * `errores` (una lista), anota en ella lo que no es ni plantilla ni grupo, un grupo sin plantillas y un grupo más hondo
 * que PROFUNDIDAD_DE_GRUPOS; `admite(x)` (opcional) deja pasar sin anotarlo lo que no es ni lo uno ni lo otro (una marca
 * de herencia en una época escrita).
 */
export function plantillasDeDominio(nueveDos, { etiqueta, errores = null, admite = null } = {}) {
  const fuera = [];
  if (!Array.isArray(nueveDos)) return fuera;
  const cabecera = etiqueta ?? primeraHojaDe(nueveDos[0]);
  const anota = (que) => errores?.push(que);
  const recorrer = (nodo, camino, nivel) => {
    for (let k = 1; k < nodo.length; k++) {
      const x = nodo[k];
      const aqui = '9.2.' + [...camino, k].join('.');
      if (esGrupoDePlantillas(x, cabecera)) {
        if (nivel + 1 > PROFUNDIDAD_DE_GRUPOS) { anota(aqui + ': un grupo de plantillas más hondo que ' + PROFUNDIDAD_DE_GRUPOS); continue; }
        if (x.length < 2) anota(aqui + ': un grupo de plantillas sin plantillas (solo su cabecera)');
        recorrer(x, [...camino, k], nivel + 1);
      } else if (esPlantillaDeDatos(x)) fuera.push({ registro: x, camino: [...camino, k] });
      else if (!(admite && admite(x))) anota(aqui + ': ni una plantilla de datos (con «template» en su 4) ni un grupo (una décupla cuyo 0.0 dice «' + cabecera + '», la etiqueta de la cabecera del 9.2)');
    }
  };
  recorrer(nueveDos, [], 0);
  return fuera;
}

/** Los motivos por los que el 9.2 de una época (resuelta) está mal formado: [] si vale (o si no lo tiene). */
export function erroresDelDominio(raiz) {
  const nueveDos = Array.isArray(raiz?.[9]) ? raiz[9][2] : undefined;
  if (nueveDos === undefined) return [];
  if (!Array.isArray(nueveDos) || !esDecupla(nueveDos)) return ['el 9.2 es una décupla: su cabecera y las plantillas de dominio'];
  const errores = [];
  if (typeof primeraHojaDe(nueveDos[0]) !== 'string') errores.push('el 9.2 empieza por su cabecera (9.2.0.0, su etiqueta)');
  plantillasDeDominio(nueveDos, { errores });
  return errores;
}

const RE_ID_EPOCA = /^[0-9a-f]{64}$/;
const hojasDe = (x) => (x === undefined || x === null ? [] : Array.isArray(x) ? x : [x]);
/** La primera hoja de un nodo, bajando por los primeros elementos. */
const primeraHoja = (x) => {
  let n = x;
  while (Array.isArray(n)) n = n[0];
  return n;
};
const ultimaHoja = (x) => (Array.isArray(x) ? x[x.length - 1] : x);
/** ¿Es `x` la marca «lo de la base aquí»: una referencia { ref } (sin dir) a la base o a una de su cadena (o la lista de una sola)? */
const esMarca = (x, ids) => {
  const r = Array.isArray(x) && x.length === 1 ? x[0] : x;
  return esReferencia(r) && r.dir === undefined && ids.has(r.ref);
};

/**
 * La procedencia de una raíz de época (su 6, #77): { notas, claves: Map clave → valores }. Acepta también el 6 de antes
 * (una lista de notas sin claves).
 */
export function procedenciaDe(raiz) {
  const seis = Array.isArray(raiz) ? raiz[6] : undefined;
  if (!Array.isArray(seis) || !esDecupla(seis)) return { notas: hojasDe(seis), claves: new Map() };
  const claves = hojasDe(seis[1]);
  const valores = hojasDe(seis[2]);
  const mapa = new Map();
  claves.forEach((k, i) => {
    if (!mapa.has(k)) mapa.set(k, []);
    if (i < valores.length) mapa.get(k).push(valores[i]);
  });
  return { notas: hojasDe(seis[0]), claves: mapa };
}

/** El id de la época de la que hereda una raíz (la clave «hereda» de su 6.1, con su valor en el 6.2), o null. */
export function heredaDe(raiz) {
  return procedenciaDe(raiz).claves.get(HEREDA)?.[0] ?? null;
}

/**
 * Los errores de forma de una época escrita ({ raiz, registros }, con `cambios` opcionales; o { base, cambios }, la
 * época que trae el código nombrada por su id), sin resolverla: [] si vale.
 */
export function erroresDeEpocaEscrita(escrita) {
  const errores = [];
  if (!escrita || typeof escrita !== 'object' || Array.isArray(escrita)) return ['una época escrita es { raiz, registros }'];
  // La época del código nombrada por su id (tramo 4: un libro nacido con ella y con los cambios de otro): sin raíz ni registros.
  if (escrita.base !== undefined) {
    if (typeof escrita.base !== 'string' || !RE_ID_EPOCA.test(escrita.base)) errores.push('«base» es el id de una época que trae el código (64 hexadecimales)');
    if (escrita.raiz !== undefined || escrita.registros !== undefined) errores.push('una época nombrada por su id («base») no lleva raíz ni registros: la trae el código');
    return [...errores, ...erroresDeCambios(escrita)];
  }
  const { raiz, registros = [] } = escrita;
  if (!Array.isArray(raiz) || raiz.length < 1 || raiz.length > ARIDAD) return ['la raíz de la época es una décupla de una a diez posiciones'];
  const v = validarPayload(raiz);
  if (!v.ok) errores.push(...v.errores.map((e) => 'raíz ' + e));
  const nombre = primeraHoja(raiz[0]);
  if (typeof nombre !== 'string' || !nombre) errores.push('falta el nombre en el 0');
  if (!Array.isArray(registros)) return [...errores, 'los registros de la época son una lista de décuplas'];
  registros.forEach((r, k) => {
    if (!Array.isArray(r) || !r.length) {
      errores.push('el registro ' + (k + 1) + ' de la época no es una décupla');
      return;
    }
    const w = validarPayload(r);
    if (!w.ok) errores.push(...w.errores.map((e) => 'registro ' + (k + 1) + ' ' + e));
  });
  // Sin huecos ni rellenos (#77): ningún «-» en ningún nivel.
  const guiones = (x, ruta) => {
    if (x === '-') errores.push('un «-» en ' + (ruta || 'la raíz') + ': sin huecos ni rellenos (#77)');
    else if (Array.isArray(x)) x.forEach((h, i) => guiones(h, ruta ? ruta + '.' + i : String(i)));
  };
  guiones(raiz, '');
  registros.forEach((r, k) => guiones(r, 'registro ' + (k + 1)));
  // El 6: notas, claves y valores en paralelo (#77), con «hereda» = un id de época.
  const seis = raiz[6];
  if (Array.isArray(seis) && esDecupla(seis)) {
    const claves = hojasDe(seis[1]);
    const valores = hojasDe(seis[2]);
    if (seis.length > 3) errores.push('el 6 es [[notas], [claves], [valores]] (#77)');
    if (claves.length !== valores.length) errores.push('el 6: las claves (6.1) y los valores (6.2) van en paralelo (#77)');
    if (!claves.every((c) => typeof c === 'string' && c)) errores.push('el 6.1: las claves son textos');
    const h = heredaDe(raiz);
    if (claves.includes(HEREDA) && (typeof h !== 'string' || !RE_ID_EPOCA.test(h))) errores.push('el 6: «hereda» va con el id de la época base (64 hexadecimales)');
  }
  // La marca «lo de la base aquí» solo tiene sentido en una época que hereda.
  if (!heredaDe(raiz)) {
    const ids = new Set(EPOCAS_POR_ID.keys());
    const tiene = (x) => esMarca(x, ids) || (Array.isArray(x) && x.some(tiene));
    if (raiz.some((x, i) => i !== 6 && tiene(x))) errores.push('una posición marcada con la referencia a una época ({ ref }) en una época que no hereda de ninguna (su 6.1 no lleva «hereda»)');
  }
  return [...errores, ...erroresDeCambios(escrita)];
}

/**
 * Los errores de forma de los cambios de una época escrita (tramo 4, la época por referencia): cada cambio es una época
 * hija { raiz, registros }, como el que lleva una propuesta; se funden en orden al cargar (cargarEpocaEscrita).
 */
function erroresDeCambios(escrita) {
  const errores = [];
  if (escrita.cambios !== undefined) {
    if (!Array.isArray(escrita.cambios)) errores.push('los cambios de la época son una lista de { raiz, registros }');
    else {
      escrita.cambios.forEach((c, k) => {
        if (!c || typeof c !== 'object' || Array.isArray(c) || c.cambios !== undefined) {
          errores.push('el cambio ' + (k + 1) + ' no es { raiz, registros }');
          return;
        }
        for (const e of erroresDeEpocaEscrita({ raiz: c.raiz, registros: c.registros ?? [] })) errores.push('el cambio ' + (k + 1) + ': ' + e);
      });
    }
  }
  return errores;
}

/** El nombre de una entrada de colección: el 0 del registro que referencia, o la primera hoja de su 0. */
function nombreDeEntrada(x, registroDe) {
  if (esReferencia(x)) return primeraHoja(registroDe(x.ref)?.[0]);
  return primeraHoja(x);
}

/** ¿Es una entrada de colección (una referencia o una décupla) y no la cabecera (una hoja o una lista de hojas)? */
const esEntrada = (x) => esReferencia(x) || esDecupla(x);

/**
 * Combina una colección de la base con la de la hija: la cabecera (lo que no es entrada) es la de la base seguida de la
 * de la hija; las entradas de la base, con las de la hija detrás y, si una se llama como (mismo 0) una o varias de
 * la base, en el sitio de la primera de ellas (las demás de ese nombre salen). Una regla del 2 que dice «after
 * <nombre>» en su 8 va detrás de esa. El 9.6.1 queda en el orden del 8 de cada plantilla ([punto de vista, orden]).
 */
function combinar(base, hija, camino, registroDe, ids) {
  // Una colección de referencias puede venir como una sola hoja; una de décuplas, como una sola entrada.
  const comoLista = (x) => (!Array.isArray(x) || !x.some(esEntrada) ? [x] : x);
  const b = comoLista(base);
  // Dentro de una colección la marca no hace falta (las entradas de la base siempre quedan): se quita.
  const h = comoLista(hija).filter((x) => !esMarca(x, ids));
  // La cabecera (lo que no es entrada: hojas o listas de hojas) es la de la base seguida de la de la hija, sin repetir.
  const hojasDeCabecera = (lista) => lista.filter((x) => !esEntrada(x)).flatMap((x) => (Array.isArray(x) ? x : [x]));
  const juntas = [...new Set([...hojasDeCabecera(b), ...hojasDeCabecera(h)].map((x) => JSON.stringify(x)))].map((x) => JSON.parse(x));
  const cabecera = juntas.length ? [juntas] : [];
  let entradas = b.filter(esEntrada).map((x) => ({ x, n: nombreDeEntrada(x, registroDe), hija: false }));
  for (const x of h.filter(esEntrada)) {
    const n = nombreDeEntrada(x, registroDe);
    const propias = entradas.filter((e) => e.hija && e.n === n);
    if (propias.length) {
      entradas.splice(entradas.indexOf(propias[propias.length - 1]) + 1, 0, { x, n, hija: true });
      continue;
    }
    const k = entradas.findIndex((e) => e.n === n);
    if (k >= 0) {
      entradas = entradas.flatMap((e, i) => (i === k ? [{ x, n, hija: true }] : e.n === n ? [] : [e]));
      continue;
    }
    const despues = camino === '2' && esReferencia(x) ? String(ultimaHoja(registroDe(x.ref)?.[8]) ?? '') : '';
    const tras = despues.startsWith('after ') ? entradas.findIndex((e) => e.n === despues.slice(6)) : -1;
    if (tras >= 0) entradas.splice(tras + 1, 0, { x, n, hija: true });
    else entradas.push({ x, n, hija: true });
  }
  let lista = entradas.map((e) => e.x);
  if (camino === '9.6.1') {
    const llave = (x) => {
      const ocho = hojasDe(registroDe(x.ref)?.[8]).map(Number);
      return Number.isFinite(ocho[0]) && Number.isFinite(ocho[1]) ? ocho[0] * 1000 + ocho[1] : Infinity;
    };
    lista = lista.map((x, k) => ({ x, k })).sort((p, q) => llave(p.x) - llave(q.x) || p.k - q.k).map((p) => p.x);
  }
  return [...cabecera, ...lista];
}

/**
 * Fusiona la raíz de una época hija sobre la de su base, por direcciones (lo de arriba): devuelve la raíz resuelta.
 * `registroDe(id)` alcanza los registros de las dos (para el nombre de las entradas que son referencias); `ids`, los de
 * la base y su cadena (los que valen como marca «lo de la base aquí»). Lanza si una marca cae donde la base no tiene nada.
 */
export function fusionarRaices(base, hija, { registroDe = () => undefined, ids = new Set() } = {}, camino = []) {
  const aqui = camino.join('.');
  if (hija === undefined) return base;
  if (esMarca(hija, ids)) {
    if (base === undefined) throw new TypeError('la posición ' + (aqui || 'raíz') + ' se hereda ({ ref } a la base) y la base no la tiene');
    return base;
  }
  if (base === undefined) return hija;
  if (COLECCIONES.includes(aqui)) return combinar(base, hija, aqui, registroDe, ids);
  // Una décupla de la hija se fusiona posición a posición; también una que solo lleva marcas (sería una lista de hojas):
  // la marca es por dirección.
  const esNodo = (x) => Array.isArray(x) && (camino.length === 0 || esDecupla(x));
  if (esNodo(base) && (esNodo(hija) || (Array.isArray(hija) && hija.some((x) => esMarca(x, ids))))) {
    return Array.from({ length: Math.max(base.length, hija.length) }, (_, i) => fusionarRaices(base[i], hija[i], { registroDe, ids }, [...camino, i]));
  }
  return hija;
}

/**
 * Ids anteriores de la época 0 que el código sigue reconociendo como ella: el de beta 16f30d2 (antes de normalizar su 6
 * a [[notas], [claves], [valores]], #107), del que hereda la SIP 0 de StateArk y que nombra el génesis de los ejes de
 * entonces; y el de 0d95471b, antes de H13 (15-11: las dos reglas de las claves declaradas admiten claves en cualquier
 * registro y en la invitación), del que hereda la SIP 0 viva y que nombran los génesis de los ejes de ayer; y el de
 * 9cd5a949, antes de la época 0 final (16-11), el de los ejes del nodo y la SIP de StateArk de hoy. La época 0 que se
 * carga con ellos es la de hoy.
 */
export const IDS_ANTERIORES_DE_LA_0 = Object.freeze([
  '8346d2f80a855093dc7818b7d8fa811b38f309f48e70b2f2c067359ea5e5d6e8',
  '0d95471b24e0ebc6aa93d949e38bf249613933316504b2cd72f8c370cade6858', // antes de H13: las reglas de las claves declaradas (15-11)
  // Antes de la época 0 final (16-11: «second factor» en un recorrido, el 0 legible, las series de E, los recuentos, las
  // preferencias de formato, los textos sin BQL V0, sin correcciones): los ejes del nodo y la época SIP de StateArk, que
  // hereda por id, la nombran y siguen resolviendo hasta que se reescriban. Core vacía esta muleta al crear el eje de la
  // aceptación.
  '9cd5a949ae30d3ef3dff698eec90f600d62a229d77aa17c1bf6b702fff6415f0',
]);

/** Las épocas que este código conoce, por id: la 0 (la que trae el código, con sus ids anteriores) y las que se registren (registrarEpoca). */
export const EPOCAS_POR_ID = new Map([[EPOCA_0_BTML.id, EPOCA_0_BTML], ...IDS_ANTERIORES_DE_LA_0.map((id) => [id, EPOCA_0_BTML])]);

/** Registra una época cargada por su id (para que otra pueda heredar de ella). Devuelve la época. */
export function registrarEpoca(epoca) {
  if (!epoca || typeof epoca.id !== 'string') throw new TypeError('registrarEpoca: una época cargada, con su id');
  EPOCAS_POR_ID.set(epoca.id, epoca);
  return epoca;
}

/**
 * Carga una época escrita ({ raiz, registros }) y la resuelve: sin «hereda», con cargarEpocaBtml tal cual (ha de ser
 * completa); con «hereda», fusionada sobre su base, que ha de estar en `conocidas` (por defecto EPOCAS_POR_ID). Lanza con
 * la causa si está mal formada. Devuelve lo que cargarEpocaBtml, con `id` el de la raíz ESCRITA, y además `escrita` (la
 * raíz y los registros tal como se escribieron), `hereda` (el id de la base, o null), `base` (la época base cargada) e
 * `ids` (los de la cadena: el suyo y los de sus bases).
 */
export function cargarEpocaEscrita(escrita, { conocidas = EPOCAS_POR_ID } = {}) {
  const errores = erroresDeEpocaEscrita(escrita);
  const nombre = String(primeraHoja(escrita?.raiz?.[0]) ?? 'época');
  if (errores.length) throw new TypeError(nombre + ': época mal formada: ' + errores.join('; '));
  if (escrita.base !== undefined || escrita.cambios?.length) return cargarConCambios(escrita, { conocidas, nombre });
  const raiz = congelarCopia(escrita.raiz);
  const id = idDeRegistro(raiz);
  const propios = (escrita.registros ?? []).map((r) => ({ id: idDeRegistro(r), registro: r }));
  const baseId = heredaDe(raiz);
  let e;
  let base = null;
  if (!baseId) {
    if (raiz.length !== ARIDAD) throw new TypeError(nombre + ': una época que no hereda es completa: la raíz lleva las diez posiciones (o declara «hereda» en su 6)');
    e = cargarEpocaBtml(raiz, { registros: propios, plantillas: propios, id });
    // Una época completa también pasa por el suelo (arreglos de la revisión, H4): el de la 0 que trae el código.
    const suelo = erroresDelSuelo(EPOCA_0_BTML, e);
    if (suelo.length) throw new TypeError(nombre + ': no respeta el suelo de la época 0: ' + suelo.join('; '));
  } else {
    base = conocidas.get(baseId) ?? null;
    if (!base) throw new TypeError(nombre + ': hereda de una época que no se conoce: ' + baseId.slice(0, 8));
    const todos = new Map(base.registros);
    for (const p of propios) todos.set(p.id, p.registro);
    // Valen como marca el id con que la hija nombra su base y los de la cadena de la base.
    const ids = new Set([baseId, base.id, ...(base.ids ?? [])]);
    let fusion;
    try {
      fusion = fusionarRaices(base.registro, raiz, { registroDe: (ref) => todos.get(ref), ids });
    } catch (err) {
      throw new TypeError(nombre + ': ' + err.message);
    }
    const lista = [...todos].map(([k, r]) => ({ id: k, registro: r }));
    e = cargarEpocaBtml(fusion, { registros: lista, plantillas: lista, id, validar: false });
    // El suelo de la base (A21 y A23, diseño §5; src/suelo.js): una época hija de nacimiento puede ampliarlo, no encogerlo.
    const suelo = erroresDelSuelo(base, e);
    if (suelo.length) throw new TypeError(nombre + ': no respeta el suelo de la época de la que hereda: ' + suelo.join('; '));
  }
  return Object.freeze({
    ...e,
    escrita: Object.freeze({ raiz, registros: Object.freeze(propios.map((p) => congelarCopia(p.registro))) }),
    hereda: baseId,
    base,
    ids: Object.freeze([...new Set([id, ...(base ? [baseId, ...(base.ids ?? [base.id])] : [])])]),
  });
}

/**
 * La época escrita con cambios (tramo 4, la época por referencia: agram-equipo/DISENO_TRAMO_4.md §2): carga la de
 * nacimiento y funde encima cada cambio, en orden, con la misma función con que el libro de arriba los fundió
 * (src/versiones.js, fundirCambio) y el suelo de la versión anterior (src/suelo.js), sin clase: no es un cambio de este
 * libro, es su nacimiento (no hay clase ni umbral que mirar). La de nacimiento es { raiz, registros } (la que escribió el
 * libro de arriba) o, si nació con una época que trae el código, su id: { base, cambios }; ese id se resuelve como lo
 * resuelve el eje con un génesis que lo nombra (EPOCAS_POR_ID, y si no lo conoce, la 0: también los ids anteriores de la
 * 0). Un cambio que no se funde o que no respeta el suelo no abre el libro. El resultado es el nacimiento del libro: la
 * época con los cambios ya fundidos, con el id de la de nacimiento, sin `anterior` (no es una versión del libro: es su
 * primera), y su `escrita` lleva también `cambios`. { base } sin cambios es la época del código tal cual.
 */
function cargarConCambios(escrita, { conocidas, nombre }) {
  const porId = escrita.base !== undefined;
  const nacida = porId ? conocidas.get(escrita.base) ?? EPOCA_0_BTML : cargarEpocaEscrita({ raiz: escrita.raiz, registros: escrita.registros ?? [] }, { conocidas });
  const lista = escrita.cambios ?? [];
  if (!lista.length) return nacida;
  const n = lista.length;
  let v = nacida;
  lista.forEach((c, k) => {
    const cambio = { raiz: c.raiz, registros: c.registros ?? [] };
    const f = fundirCambio(v, cambio);
    const motivos = f.motivo ? [f.motivo] : erroresDelSuelo(v, f.version).map((m) => 'el cambio ' + m);
    if (motivos.length) throw new TypeError((porId ? String(nacida.nombre ?? 'época') : nombre) + ': no abre con el cambio ' + (k + 1) + ' de ' + n + ' («' + String(primeraHoja(c.raiz?.[0])) + '»): ' + motivos.join('; '));
    v = f.version;
  });
  const { anterior: _anterior, nacimiento: _nacimiento, cambio: _cambio, ...epoca } = v;
  const cambios = Object.freeze(lista.map((c) => Object.freeze({ raiz: congelarCopia(c.raiz), registros: Object.freeze((c.registros ?? []).map(congelarCopia)) })));
  // Los nombres de la época de nacimiento: los suyos y, si es del código, los ids con que el código la conoce.
  const alias = [...conocidas].filter(([, e]) => e === nacida).map(([id]) => id);
  return Object.freeze({
    ...epoca,
    escrita: Object.freeze(porId ? { base: escrita.base, cambios } : { raiz: nacida.escrita.raiz, registros: nacida.escrita.registros, cambios }),
    hereda: nacida.hereda ?? null,
    base: nacida.base ?? null,
    ids: Object.freeze([...new Set([...(nacida.ids ?? [nacida.id]), ...alias])]),
  });
}

/**
 * ¿Es `epoca` una época que trae el código: la 0, o la MISMA que está registrada por su id (registrarEpoca; hoy la del
 * libro de cuenta, src/epoca-cuenta.js), aunque se cargara de su forma escrita? Es la que un génesis que nombra ese id
 * resuelve, así que un libro nacido de ella también puede nombrarla por su id (Carril F, 18-11). Una época escrita en un
 * libro se resuelve aparte (otro objeto, aunque tenga el mismo id): esa no cuenta, y sus hijos la escriben como ella.
 */
const esDelCodigo = (epoca) => !epoca?.anterior && typeof epoca?.id === 'string' && (epoca === EPOCA_0_BTML || EPOCAS_POR_ID.get(epoca.id) === epoca);

/**
 * La época escrita de una época cargada, para que otro libro nazca con ella (Eje.genesis({ epoca })):
 * - una época escrita sin cambios: { raiz, registros }, la que se escribió;
 * - una versión con cambios en vigor (src/versiones.js) o un nacimiento que los trae (tramo 4, la época por referencia):
 *   lo que el libro escribió al nacer y sus cambios en vigor en orden, cada uno { raiz, registros }: { raiz, registros,
 *   cambios } o, si nació con una época que trae el código, { base: su id, cambios } (sin raíz ni registros: el libro
 *   nuevo la nombra por su id, como el de arriba, y solo escribe los cambios);
 * - la época 0 que trae el código, sin cambios: su raíz y los registros que alcanza por referencias (reglas, plantillas,
 *   modelos y sus piezas, la guía), tal como están en datos/epocas/, para escribirla entera en un libro; con
 *   `{ porReferencia: true }`, { base: su id, cambios: [] }, con la que Eje.genesis la nombra por su id y no escribe
 *   nada (lo mismo que sin época). `porReferencia` solo cambia este caso (y el de otra época del código, que sin él no
 *   tiene forma escrita).
 */
export function epocaEscritaDe(epoca = EPOCA_0_BTML, { porReferencia = false } = {}) {
  if (epoca?.anterior) {
    const cambios = [];
    let v = epoca;
    while (v?.anterior) {
      if (!v.cambio) throw new TypeError('epocaEscritaDe: una versión sin su cambio');
      cambios.unshift(v.cambio);
      v = v.anterior;
    }
    const nacimiento = esDelCodigo(v) ? { base: v.id } : epocaEscritaDe(v);
    const { cambios: deNacimiento = [], ...forma } = nacimiento;
    return { ...forma, cambios: [...deNacimiento, ...cambios] };
  }
  // Por referencia, una época del código se nombra por su id aunque tenga forma escrita (la registrada).
  if (porReferencia && esDelCodigo(epoca)) return { base: epoca.id, cambios: [] };
  if (epoca?.escrita) {
    const e = epoca.escrita;
    const cambios = e.cambios ? { cambios: [...e.cambios] } : {};
    return e.base !== undefined ? { base: e.base, ...cambios } : { raiz: e.raiz, registros: [...e.registros], ...cambios };
  }
  if (epoca !== EPOCA_0_BTML) throw new TypeError('epocaEscritaDe: solo la época 0 o una época cargada de su forma escrita');
  const crudos = new Map([...REGLAS_DE_EPOCA_DATOS, ...PLANTILLAS_DE_EPOCA_DATOS, ...REGISTROS_DE_MODELOS, ...GUIA_DE_EPOCA_DATOS].map((r) => [r.id, r.registro]));
  const vistos = new Set();
  const registros = [];
  const recorrer = (x) => {
    if (esReferencia(x)) {
      if (crudos.has(x.ref) && !vistos.has(x.ref)) {
        vistos.add(x.ref);
        registros.push(crudos.get(x.ref));
        recorrer(crudos.get(x.ref));
      }
    } else if (Array.isArray(x)) x.forEach(recorrer);
  };
  recorrer(EPOCA_0_BTML_DATOS);
  return { raiz: EPOCA_0_BTML_DATOS, registros };
}

/** La época de un eje (eje.epoca(): la escrita en su libro, o la 0 que trae el código), o la 0 sin eje. */
export function epocaDelEje(eje) {
  return typeof eje?.epoca === 'function' ? eje.epoca() : EPOCA_0_BTML;
}
