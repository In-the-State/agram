// Los sitios y los pesos de la pantalla como dato (docs/notas/SITIOS_Y_PESOS.md; Core 18-11): dónde va cada punto de
// vista (epoch.9.5.6 «places»), en qué orden y cuánto se enseña (epoch.9.5.8 «lens»). La carta no guarda estas tablas:
// las lee de aquí (paso 2, aún no). Se reexportan desde src/contrato.js: contrato.sitios y contrato.pesos.
//
// Las capas, de la que manda a la de respaldo:
//   1. la preferencia de quien mira («lens settings» en su libro de cuenta): todavía no se construye; el hueco es
//      `opciones.preferencia`, { <clave>: valor | [valores] }, y solo vale para los pesos y órdenes de la persona;
//   2. la época del libro (`opciones.epoca` o la del eje);
//   3. la época 0 (hasta su pasada única no trae ninguna de las dos posiciones);
//   4. el archivo de la carta: datos/lente/lente-0.json (su copia importable, lente-0.js).
// 9.5.8 se resuelve CLAVE A CLAVE: cada clave sale de la primera capa que la dice bien. 9.5.6 se resuelve ENTERA: la
// tabla de sitios sale de la primera capa que trae una válida entera; una hostil o incompleta cae entera a la
// siguiente. Nunca lanza: lo que no se entiende es «no lo dice».
//
// El suelo (lo que ninguna capa redefine; §5 de la nota), aplicado aquí y no en el dato:
//   - el espacio del dato es el 3×3 de la escena: fila y columna de 0 a 2; nada de píxeles ni CSS;
//   - el 3×3 entero o nada: los ocho laterales (1-4, 6-9) en las ocho celdas que no son el centro, una cada uno; el 0
//     y el 5 en el centro, uno «front» y otro «back»; cada fila con su «side» (0, 1 o 2); «time», un «past» y un
//     «future» como mucho, y nunca en el centro; ni claves desconocidas ni repetidas;
//   - los órdenes son permutaciones de los diez dígitos (un orden que esconde un PV no vale);
//   - las cuentas, enteros de 0 a su tope (o «all» en los botones); lo que cuesta tiene tope como en 8.8;
//   - lo que se abre al empezar, como mucho en el segundo tamaño de 9.5.2 (la tarjeta): el foco se ve al entrar;
//   - la persona solo dice pesos y órdenes; las celdas, lo que se abre al empezar, las cuentas de listas y la búsqueda
//     del destacado son del libro.

import { epocaDelEje, EPOCA_0_BTML } from './epocas.js';
import { LENTE_0_DATOS } from '../datos/lente/lente-0.js';

/** Dónde pone la época cada tabla (los únicos caminos que este módulo conoce). */
const SITIO = Object.freeze({ sitios: [9, 5, 6], pesos: [9, 5, 8], tamanos: [9, 5, 2] });
/** Cómo se llama cada capa en `de` y en `descartadas`. */
export const CAPAS = Object.freeze({ preferencia: 'preferencia', libro: 'libro', epoca0: 'época 0', archivo: 'archivo' });
/** El nombre de la cabecera de cada tabla (su 0): lo que no se llama así no es esa tabla. */
const CABECERA = Object.freeze({ sitios: 'places', pesos: 'lens' });

const en = (raiz, camino) => camino.reduce((n, d) => (Array.isArray(n) ? n[d] : undefined), raiz);
const hoja = (x) => (Array.isArray(x) ? x[0] : x);
const hojas = (x) => (x === undefined || x === null ? [] : Array.isArray(x) ? x : [x]);
const raizDe = (epoca) => (Array.isArray(epoca) ? epoca : epoca && typeof epoca === 'object' ? epoca.registro ?? epoca.payload ?? null : null);
const entero = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
const DIGITOS = Object.freeze([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);

// ---------- 9.5.6: los sitios ----------

const CLAVES_DE_SITIO = new Set(['side', 'face', 'edge row', 'edge column', 'time']);
const CARA = Object.freeze({ front: 'anverso', back: 'reverso' });
const TIEMPO = Object.freeze({ past: 'pasado', future: 'futuro' });
const FILA = Object.freeze(['arriba', 'medio', 'abajo']);
const esCentro = ([f, c]) => f === 1 && c === 1;

/**
 * Una tabla de sitios (el valor de epoch.9.5.6) leída y comprobada contra el suelo: { geometria, centros, laterales,
 * hilo } o { motivo } si no vale entera. La geometría tiene la forma de la que la carta usaba (GEOMETRIA): por PV,
 * { grupo, lado, celda, fila? (no en el centro), cara? (solo en el centro), borde? }.
 */
export function leerSitios(tabla) {
  if (!Array.isArray(tabla) || hoja(tabla[0]) !== CABECERA.sitios) return { motivo: 'no es una tabla «places»' };
  const filas = tabla[1];
  if (!Array.isArray(filas) || filas.length !== 10) return { motivo: 'no trae diez filas, una por punto de vista' };
  const geometria = {};
  const hilo = { pasado: null, futuro: null };
  const ocupadas = new Set();
  const caras = {};
  for (const fila of filas) {
    if (!Array.isArray(fila)) return { motivo: 'una fila no es una lista' };
    const pv = hoja(fila[0]);
    if (!entero(pv, 0, 9) || geometria[pv]) return { motivo: 'un punto de vista que no es un dígito o que se repite: ' + String(pv) };
    const celda = hojas(fila[1]);
    if (celda.length !== 2 || !celda.every((x) => entero(x, 0, 2))) return { motivo: 'la celda del ' + pv + ' no es [fila, columna] de 0 a 2' };
    const claves = hojas(fila[3]);
    const valores = hojas(fila[4]);
    if (claves.length !== valores.length) return { motivo: 'las claves y los valores del ' + pv + ' no van a la par' };
    const dice = {};
    for (let i = 0; i < claves.length; i++) {
      if (!CLAVES_DE_SITIO.has(claves[i])) return { motivo: 'clave desconocida en el ' + pv + ': ' + String(claves[i]) };
      if (claves[i] in dice) return { motivo: 'clave repetida en el ' + pv + ': ' + claves[i] };
      dice[claves[i]] = valores[i];
    }
    if (!entero(dice.side, 0, 2)) return { motivo: 'el ' + pv + ' no tiene un «side» de 0 a 2' };
    const centro = esCentro(celda);
    const g = { grupo: centro ? 'nucleo' : celda[0] !== 1 && celda[1] !== 1 ? 'x' : 'cruz', lado: dice.side, celda: [celda[0], celda[1]] };
    if (centro) {
      if (!Object.hasOwn(CARA, dice.face) || caras[dice.face] !== undefined) return { motivo: 'el ' + pv + ' está en el centro sin una cara «front» o «back» propia' };
      caras[dice.face] = pv;
      g.cara = CARA[dice.face];
    } else {
      if ('face' in dice) return { motivo: 'el ' + pv + ' no está en el centro y dice una cara' };
      const k = celda.join(',');
      if (ocupadas.has(k)) return { motivo: 'dos puntos de vista en la celda ' + k };
      ocupadas.add(k);
      g.fila = FILA[celda[0]];
    }
    if ('edge row' in dice || 'edge column' in dice) {
      if (!entero(dice['edge row'], 0, 2) || !entero(dice['edge column'], 0, 2)) return { motivo: 'el borde del ' + pv + ' no es fila y columna de 0 a 2' };
      g.borde = [dice['edge row'], dice['edge column']];
    }
    if ('time' in dice) {
      const t = TIEMPO[dice.time];
      if (!Object.hasOwn(TIEMPO, dice.time) || centro || hilo[t] !== null) return { motivo: 'el «time» del ' + pv + ' no es «past» o «future», está en el centro o se repite' };
      hilo[t] = pv;
    }
    geometria[pv] = g;
  }
  if (caras.front === undefined || caras.back === undefined) return { motivo: 'el centro no tiene sus dos caras' };
  // Los dos del centro y los ocho de alrededor: con diez filas distintas, dos caras y ocho celdas distintas, el 3×3 está entero.
  const centros = [caras.front, caras.back];
  const laterales = DIGITOS.filter((pv) => !centros.includes(pv));
  return { geometria, centros, laterales, hilo };
}

// ---------- 9.5.8: los pesos ----------

const TOPE = Object.freeze({ botones: 100, filas: 50, listas: 1000 });
const botones = (v) => (v.length === 1 && (v[0] === 'all' || entero(v[0], 0, TOPE.botones)) ? (v[0] === 'all' ? 'todas' : v[0]) : undefined);
const cuenta = (tope) => (v) => (v.length === 1 && entero(v[0], 0, tope) ? v[0] : undefined);
const permutacion = (v) => (v.length === 10 && v.every((x) => entero(x, 0, 9)) && new Set(v).size === 10 ? [...v] : undefined);

/**
 * Las claves de 9.5.8: su campo en lo que devuelve `pesos`, cómo se lee (undefined: no vale) y si la persona puede
 * decirla. «open at start size» se lee con los tamaños de la época que se pinta (9.5.2): solo los dos primeros.
 */
const CLAVES_DE_PESO = Object.freeze({
  'buttons slot': { campo: ['botones', 'comprimido'], leer: botones, persona: true },
  'buttons card': { campo: ['botones', 'tarjeta'], leer: botones, persona: true },
  'buttons screen': { campo: ['botones', 'bloque'], leer: botones, persona: true },
  'buttons open': { campo: ['botones', 'abierto'], leer: botones, persona: true },
  'next steps in rows': { campo: ['botones', 'filas'], leer: cuenta(TOPE.filas), persona: true },
  'rosette order': { campo: ['rosetones'], leer: permutacion, persona: true },
  'sequenced order': { campo: ['ordenDeSequenced'], leer: permutacion, persona: true },
  'highlight search': { campo: ['buscarDestacado'], leer: permutacion },
  'proposers shown': { campo: ['proponenALaVista'], leer: cuenta(TOPE.listas) },
  'executions in cell': { campo: ['ejecucionesEnCelda'], leer: cuenta(TOPE.listas) },
  'executions in open cell': { campo: ['ejecucionesEnCeldaAbierta'], leer: cuenta(TOPE.listas) },
  'series in footer': { campo: ['seriesEnElPie'], leer: cuenta(TOPE.listas) },
  'open at start': { campo: ['alEmpezar', 'pv'], leer: cuenta(9) },
  'open at start size': { campo: ['alEmpezar', 'tamano'], leer: null },
});

/** Lo que dice una tabla «lens» (el valor de epoch.9.5.8): { dice: { <clave>: [valores] } } o { motivo } si no se puede leer. */
export function leerPesos(tabla) {
  if (!Array.isArray(tabla) || hoja(tabla[0]) !== CABECERA.pesos) return { motivo: 'no es una tabla «lens»' };
  const claves = hojas(tabla[3]);
  const valores = hojas(tabla[4]);
  if (claves.length !== valores.length) return { motivo: 'las claves y los valores no van a la par' };
  const dice = {};
  claves.forEach((k, i) => { if (typeof k === 'string') (dice[k] ??= []).push(valores[i]); });
  return { dice };
}

/** La preferencia de la persona (el hueco de la capa 1) como lo que dice una tabla: { <clave>: [valores] }. */
const dePreferencia = (p) => (p && typeof p === 'object' && !Array.isArray(p) ? Object.fromEntries(Object.entries(p).map(([k, v]) => [k, hojas(v)])) : null);

/** Los tamaños de una época (9.5.2), por su orden: [{ tamano, nombre }]. */
function tamanosDe(raiz) {
  return hojas(en(raiz, SITIO.tamanos)).filter(Array.isArray).map((t) => ({ tamano: hoja(t[0]), nombre: hoja(t[1]) })).filter((t) => Number.isInteger(t.tamano) && typeof t.nombre === 'string').sort((a, b) => a.tamano - b.tamano);
}

// ---------- las capas ----------

/** Las capas de la época, de la que manda a la de respaldo: [{ capa, raiz }] (la del libro, si no es la 0; la 0; el archivo). */
function capasDeEpoca(eje, opciones) {
  const lista = [];
  let libro = null;
  try {
    libro = raizDe(opciones?.epoca ?? (eje ? epocaDelEje(eje) : null));
  } catch {
    libro = null;
  }
  const cero = raizDe(EPOCA_0_BTML);
  if (libro && libro !== cero) lista.push({ capa: CAPAS.libro, raiz: libro });
  lista.push({ capa: CAPAS.epoca0, raiz: cero });
  return lista;
}

/** El valor de `camino` en una raíz, sin lanzar. */
const valorEn = (raiz, camino) => {
  try {
    return en(raiz, camino);
  } catch {
    return undefined;
  }
};

/** El archivo de la carta: el valor de cada camino («epoch.9.5.6» → [9, 5, 6]). */
const delArchivo = (camino) => LENTE_0_DATOS?.['epoch.' + camino.join('.')];

/**
 * El núcleo puro de los sitios: de una lista de capas [{ capa, tabla }] (la que manda primero), la primera tabla que
 * vale entera. → { de, geometria, centros, laterales, hilo, descartadas: [{ capa, motivo }] }; si ninguna vale, de: null
 * y todo vacío.
 */
export function sitiosDe(capas) {
  const descartadas = [];
  for (const { capa, tabla } of capas) {
    if (tabla === undefined) continue;
    let r;
    try {
      r = leerSitios(tabla);
    } catch {
      r = { motivo: 'no se puede leer' };
    }
    if (!r.motivo) return { de: capa, ...r, descartadas };
    descartadas.push({ capa, motivo: r.motivo });
  }
  return { de: null, geometria: {}, centros: [], laterales: [], hilo: { pasado: null, futuro: null }, descartadas };
}

/**
 * El núcleo puro de los pesos: de una lista de capas [{ capa, dice | tabla, persona? }] (la que manda primero), cada clave
 * de la primera capa que la dice bien. `persona`: la capa es una preferencia (solo valen las claves de la persona).
 * `tamanos`: los de 9.5.2 de la época que se pinta, para «open at start size». → { botones, rosetones,
 * ordenDeSequenced, buscarDestacado, proponenALaVista, ejecucionesEnCelda, ejecucionesEnCeldaAbierta, seriesEnElPie,
 * alEmpezar, de: { <clave>: capa }, descartadas: [{ capa, clave?, motivo }] }. Lo que ninguna capa dice queda en null.
 */
export function pesosDe(capas, { tamanos = [] } = {}) {
  const descartadas = [];
  const leidas = [];
  for (const c of capas) {
    let dice = c.dice ?? null;
    if (!dice && c.tabla !== undefined) {
      let r;
      try {
        r = leerPesos(c.tabla);
      } catch {
        r = { motivo: 'no se puede leer' };
      }
      if (r.motivo) { descartadas.push({ capa: c.capa, motivo: r.motivo }); continue; }
      dice = r.dice;
    }
    if (dice) leidas.push({ capa: c.capa, dice, persona: c.persona === true });
  }
  for (const { capa, dice } of leidas) for (const k of Object.keys(dice)) if (!Object.hasOwn(CLAVES_DE_PESO, k)) descartadas.push({ capa, clave: k, motivo: 'clave desconocida' });
  const primeros = tamanos.slice(0, 2);
  const leerTamano = (v) => (v.length === 1 ? primeros.find((t) => t.nombre === v[0])?.tamano : undefined);
  const fuera = {
    botones: { comprimido: null, tarjeta: null, bloque: null, abierto: null, filas: null },
    rosetones: null, ordenDeSequenced: null, buscarDestacado: null,
    proponenALaVista: null, ejecucionesEnCelda: null, ejecucionesEnCeldaAbierta: null, seriesEnElPie: null,
    alEmpezar: { pv: null, tamano: null },
  };
  const de = {};
  for (const [clave, def] of Object.entries(CLAVES_DE_PESO)) {
    for (const { capa, dice, persona } of leidas) {
      if (!Object.hasOwn(dice, clave)) continue;
      if (persona && !def.persona) { descartadas.push({ capa, clave, motivo: 'la dice el libro, no la persona' }); continue; }
      let v;
      try {
        v = (def.leer ?? leerTamano)(hojas(dice[clave]));
      } catch {
        v = undefined;
      }
      if (v === undefined) { descartadas.push({ capa, clave, motivo: 'valor fuera de lo que vale' }); continue; }
      const [a, b] = def.campo;
      if (b === undefined) fuera[a] = v;
      else fuera[a][b] = v;
      de[clave] = capa;
      break;
    }
  }
  return { ...fuera, de, descartadas };
}

// ---------- lo que se usa ----------

const congelar = (x) => {
  if (x && typeof x === 'object' && !Object.isFrozen(x)) {
    Object.freeze(x);
    for (const v of Object.values(x)) congelar(v);
  }
  return x;
};
/** Lo ya resuelto por la raíz de la época del libro (sin preferencia): una tabla no cambia mientras la época no cambia. */
const MEMO_SITIOS = new WeakMap();
const MEMO_PESOS = new WeakMap();
const SIN_LIBRO = {};

/**
 * Dónde va cada punto de vista (epoch.9.5.6) para quien mira `eje` (la época del libro, la 0, el archivo; entera o
 * nada). → congelado: { de, geometria, centros (anverso primero), laterales, hilo: { pasado, futuro }, descartadas }.
 * Nunca lanza.
 */
export function sitios(eje, opciones = {}) {
  try {
    const capas = capasDeEpoca(eje, opciones);
    const llave = capas.length > 1 ? capas[0].raiz : SIN_LIBRO;
    if (typeof llave === 'object' && MEMO_SITIOS.has(llave)) return MEMO_SITIOS.get(llave);
    const r = congelar(sitiosDe([...capas.map(({ capa, raiz }) => ({ capa, tabla: valorEn(raiz, SITIO.sitios) })), { capa: CAPAS.archivo, tabla: delArchivo(SITIO.sitios) }]));
    if (typeof llave === 'object') MEMO_SITIOS.set(llave, r);
    return r;
  } catch {
    return congelar(sitiosDe([]));
  }
}

/**
 * En qué orden y cuánto se enseña (epoch.9.5.8) para quien mira `eje`: la preferencia (`opciones.preferencia`, el hueco
 * de «lens settings»), la época del libro, la 0 y el archivo, clave a clave. → congelado: { botones: { comprimido,
 * tarjeta, bloque, abierto, filas } (la forma de BOTONES_POR_NIVEL: «todas» o un número), rosetones,
 * ordenDeSequenced, buscarDestacado, proponenALaVista, ejecucionesEnCelda, ejecucionesEnCeldaAbierta, seriesEnElPie,
 * alEmpezar: { pv, tamano (el número de 9.5.2) }, de, descartadas }. Nunca lanza.
 */
export function pesos(eje, opciones = {}) {
  try {
    const capas = capasDeEpoca(eje, opciones);
    const preferencia = dePreferencia(opciones?.preferencia);
    const llave = preferencia ? null : capas.length > 1 ? capas[0].raiz : SIN_LIBRO;
    if (llave && MEMO_PESOS.has(llave)) return MEMO_PESOS.get(llave);
    const lista = [
      ...(preferencia ? [{ capa: CAPAS.preferencia, dice: preferencia, persona: true }] : []),
      ...capas.map(({ capa, raiz }) => ({ capa, tabla: valorEn(raiz, SITIO.pesos) })),
      { capa: CAPAS.archivo, tabla: delArchivo(SITIO.pesos) },
    ];
    // Los tamaños de 9.5.2 de la época que se pinta; si no trae (una época rota), los de la 0.
    const tamanos = capas.map(({ raiz }) => tamanosDe(raiz)).find((t) => t.length) ?? [];
    const r = congelar(pesosDe(lista, { tamanos }));
    if (llave) MEMO_PESOS.set(llave, r);
    return r;
  } catch {
    return congelar(pesosDe([]));
  }
}
