// Los tipos de parámetro (Core AGRAM 18-11; docs/notas/NUCLEO_6_7_8.md §7, decisiones 7 a 9, supuestos por confirmar con
// VG). Dos capas:
//
//   - los TIPOS BASE, una lista cerrada que es del aparato: un control por tipo (escribir un texto, elegir un archivo,
//     elegir uno de mis libros…). La conoce el código y ninguna época la amplía. Dos de ellos, file y book, tienen
//     FACETAS: un parámetro pide una (la referencia de un archivo, el id de un libro) y el aparato las da todas a la vez;
//   - los TIPOS DECLARADOS, que son dato: décuplas con el molde de un parámetro (0 nombre, 1 de qué deriva —un tipo
//     base, con su faceta si la tiene, u otro declarado—, 2 la validación «=…» con it = el valor, 6 la procedencia y en el
//     9, delante de la ayuda, la fórmula de sus opciones). Viven en epoch.9.2.0.3 (la cabecera de los tipos) y, hasta la
//     pasada única por la época 0, en datos/provisional/tipos.json (src/provisional.js).
//
// Tres capas de tipos declarados, de abajo arriba: la época 0, lo provisional y la época del libro. Una capa de arriba
// que declara un tipo con el nombre de uno de abajo lo ENDURECE: sus validaciones se suman a las de abajo (nunca las
// quitan) y no puede cambiarle la base. Un tipo deriva como mucho en MAXIMO_DE_SALTOS pasos hasta su base; un ciclo es
// un error. Aquí no se evalúa nada: se resuelve qué hay que comprobar (resolverTipo) y se comprueba con valeElValor.

import { EPOCA_0_BTML, epocaDelEje } from './epocas.js';
import { esDecupla } from './btml.js';
import { evaluar, esFormula } from './bqlm.js';
import { TIPOS_PROVISIONALES } from './provisional.js';

/** Los tipos base: la lista cerrada de controles del aparato, cada uno con sus facetas (la primera, la de por defecto). */
export const TIPOS_BASE = Object.freeze({
  text: Object.freeze({ facetas: Object.freeze([]) }),
  number: Object.freeze({ facetas: Object.freeze([]) }),
  identity: Object.freeze({ facetas: Object.freeze([]) }),
  ref: Object.freeze({ facetas: Object.freeze([]) }),
  instant: Object.freeze({ facetas: Object.freeze([]) }),
  level: Object.freeze({ facetas: Object.freeze([]) }),
  tenfold: Object.freeze({ facetas: Object.freeze([]) }),
  // Un archivo del aparato: su referencia (archivo:<sha256>), su formato de epoch.9.5.1 y su tamaño en bytes.
  file: Object.freeze({ facetas: Object.freeze(['ref', 'format', 'size']) }),
  // Uno de mis libros: el id de su génesis, sus claves de línea ([nivel, clave]…) y dónde publica sus cabeceras.
  // «Mi alta allí» no es una faceta (decisión de Core AGRAM 18-11: enlaza mis identidades entre libros).
  book: Object.freeze({ facetas: Object.freeze(['id', 'line keys', 'headers url']) }),
});

/** Los tipos base cuyas opciones da el aparato (nunca el libro): la fórmula de opciones de un tipo solo las filtra. */
export const BASES_DEL_APARATO = Object.freeze(['file', 'book']);

/** Cuántos pasos de derivación, como mucho, hay de un parámetro a su tipo base. */
export const MAXIMO_DE_SALTOS = 4;

/** Dónde declara una época sus tipos de parámetro: la cabecera de los tipos (epoch.9.2.0), en su 3. */
export const SITIO_DE_LOS_TIPOS = Object.freeze([9, 2, 0, 3]);

/** Las capas de tipos declarados, de abajo arriba. */
export const CAPAS = Object.freeze(['0', 'provisional', 'libro']);

const RE_ARCHIVO = /^archivo:[0-9a-f]{64}$/;
const RE_ID = /^[0-9a-f]{64}$/;

/** Lo que el núcleo comprueba él solo de cada faceta (la forma; lo demás lo dicen las validaciones de los tipos). */
const FORMA_DE_LA_FACETA = Object.freeze({
  file: Object.freeze({
    ref: (v) => typeof v === 'string' && RE_ARCHIVO.test(v),
    format: (v) => typeof v === 'string' && v !== '',
    size: (v) => Number.isSafeInteger(v) && v > 0,
  }),
  book: Object.freeze({
    id: (v) => typeof v === 'string' && RE_ID.test(v),
    'line keys': (v) => v !== undefined && v !== null,
    'headers url': (v) => typeof v === 'string' && v !== '',
  }),
});

const hojas = (x) => (x === undefined || x === null ? [] : Array.isArray(x) ? x : [x]);
const textos = (x) => hojas(x).filter((y) => typeof y === 'string');
const ultima = (x) => (Array.isArray(x) ? x[x.length - 1] : x);
const raizDe = (epoca) => (Array.isArray(epoca) ? epoca : epoca?.registro ?? epoca?.payload);
const en = (raiz, camino) => camino.reduce((n, d) => (Array.isArray(n) ? n[d] : undefined), raiz);

/** ¿Es `t` un tipo base? */
export const esTipoBase = (t) => typeof t === 'string' && Object.hasOwn(TIPOS_BASE, t);

/** La época que se lee: la de las opciones, la del eje, o la 0. */
const epocaDe = (opciones = {}) => opciones.epoca ?? (opciones.eje && typeof opciones.eje.epoca === 'function' ? epocaDelEje(opciones.eje) : EPOCA_0_BTML);

/** Los tipos que declara una época en su sitio (solo décuplas con nombre). */
function declaradosEn(epoca) {
  return hojas(en(raizDe(epoca), SITIO_DE_LOS_TIPOS)).filter((x) => esDecupla(x) && typeof textos(x[0])[0] === 'string');
}

const MAPAS = new WeakMap();

/**
 * Los tipos declarados que ve la época `opciones.epoca` (o la del eje, o la 0): Map nombre → { nombre, registro, capa,
 * debajo }. `debajo` es el mismo tipo en una capa de abajo, si lo hay: la de arriba lo endurece. Un tipo que la época del
 * libro hereda tal cual de la 0 no es una capa más. Un nombre de tipo base no se puede declarar (se ignora).
 */
function mapaDeTipos(opciones = {}) {
  const epoca = epocaDe(opciones);
  const llave = epoca && typeof epoca === 'object' ? epoca : EPOCA_0_BTML;
  if (MAPAS.has(llave)) return MAPAS.get(llave);
  const capas = [['0', declaradosEn(EPOCA_0_BTML)], ['provisional', TIPOS_PROVISIONALES], ...(epoca !== EPOCA_0_BTML ? [['libro', declaradosEn(epoca)]] : [])];
  const mapa = new Map();
  for (const [capa, lista] of capas) {
    for (const registro of lista) {
      const nombre = textos(registro[0])[0];
      if (!nombre || esTipoBase(nombre)) continue;
      const previo = mapa.get(nombre);
      if (previo && JSON.stringify(previo.registro) === JSON.stringify(registro)) continue; // heredado tal cual
      const debajo = previo ? (previo.capa === capa ? previo.debajo : previo) : null;
      mapa.set(nombre, Object.freeze({ nombre, registro, capa, debajo }));
    }
  }
  MAPAS.set(llave, mapa);
  return mapa;
}

/** La validación de una décupla de tipo (su 2, la última hoja si es una fórmula), o null. */
const validacionDe = (registro) => (esFormula(ultima(registro[2])) ? ultima(registro[2]) : null);
/** La fórmula de opciones de una décupla de tipo (la primera fórmula de su 9 delante de la ayuda), o null. */
const opcionesDe = (registro) => hojas(registro[9]).slice(0, -1).find(esFormula) ?? null;
/** La ayuda de una décupla de tipo (la última hoja de su 9, si es un texto y no una fórmula), o null. */
const ayudaDe = (registro) => {
  const a = ultima(registro[9]);
  return typeof a === 'string' && !esFormula(a) ? a : null;
};

const vacio = Object.freeze({ nombre: null, capa: null, base: null, faceta: null, refinamiento: Object.freeze([]), validaciones: Object.freeze([]), opciones: null, ayuda: null, cadena: Object.freeze([]), error: null });
const fallo = (error, extra = {}) => ({ ...vacio, ...extra, error });

/** Quita las validaciones repetidas (la misma fórmula, o la misma forma de faceta), quedándose con la primera. */
function sinRepetir(lista) {
  const vistas = new Set();
  return lista.filter((v) => {
    const k = v.formula ?? 'base ' + v.base + ' ' + v.faceta;
    if (vistas.has(k)) return false;
    vistas.add(k);
    return true;
  });
}

/** Un tipo base, con la faceta pedida (o la primera). */
function resolverBase(t0, resto) {
  const { facetas } = TIPOS_BASE[t0];
  if (!facetas.length) return { ...vacio, base: t0, refinamiento: Object.freeze([...resto]) };
  const faceta = resto[0] ?? facetas[0];
  if (!facetas.includes(faceta)) return fallo('«' + faceta + '» no es una faceta de ' + t0 + ' (' + facetas.join(', ') + ')');
  return { ...vacio, base: t0, faceta, validaciones: Object.freeze([Object.freeze({ de: 'base', base: t0, faceta })]) };
}

/** Resuelve un nombre (base o declarado) con lo que le sigue en el 1 (la faceta). `camino` lleva lo que ya se está resolviendo. */
function resolverNombre(t0, resto, mapa, camino) {
  if (esTipoBase(t0)) return resolverBase(t0, resto);
  const entrada = mapa.get(t0);
  if (!entrada) return fallo('tipo desconocido: «' + t0 + '»');
  const r = resolverEntrada(entrada, mapa, camino);
  if (r.error || !resto.length || resto[0] === r.faceta) return r;
  // Un tipo declarado ya fija su faceta (sus validaciones son de esa faceta): un parámetro no la cambia. Para otra faceta
  // del mismo control, el parámetro nombra el tipo base con ella (["book", "line keys"]).
  return fallo('el tipo «' + r.nombre + '» es ' + (r.faceta ? 'la faceta «' + r.faceta + '» de ' + r.base : r.base + ', sin facetas') + '; un parámetro no le cambia la faceta («' + resto[0] + '»)', { nombre: r.nombre, cadena: r.cadena });
}

/** Resuelve una entrada del mapa: su derivación, lo de debajo (que endurece) y lo suyo. */
function resolverEntrada(entrada, mapa, camino) {
  const nombre = entrada.nombre;
  if (camino.includes(entrada)) return fallo('ciclo de tipos: ' + [...camino.map((e) => e.nombre), nombre].join(' → '), { nombre });
  if (camino.length >= MAXIMO_DE_SALTOS) return fallo('el tipo «' + nombre + '» está a más de ' + MAXIMO_DE_SALTOS + ' pasos de su tipo base: ' + [...camino.map((e) => e.nombre), nombre].join(' → '), { nombre });
  const aqui = [...camino, entrada];
  const r = entrada.registro;
  // Lo de debajo: el mismo tipo en una capa de abajo. Lo de arriba lo endurece: suma sus validaciones y no cambia la base.
  const abajo = entrada.debajo ? resolverEntrada(entrada.debajo, mapa, aqui) : null;
  if (abajo?.error) return { ...abajo, nombre };
  const [deriva, ...suResto] = textos(r[1]);
  let padre;
  if (deriva === undefined) padre = fallo('el tipo «' + nombre + '» no dice de qué deriva (su 1)', { nombre });
  else if (deriva === nombre) padre = abajo ?? fallo('el tipo «' + nombre + '» deriva de sí mismo y no hay otro debajo', { nombre });
  else padre = resolverNombre(deriva, suResto, mapa, aqui);
  if (padre.error) return { ...padre, nombre, cadena: Object.freeze([nombre, ...padre.cadena]) };
  if (abajo && abajo.base !== padre.base) return fallo('la capa «' + entrada.capa + '» cambia la base del tipo «' + nombre + '» (de ' + abajo.base + ' a ' + padre.base + '): un tipo se endurece, no se cambia', { nombre });
  const propia = validacionDe(r);
  const validaciones = sinRepetir([
    ...padre.validaciones,
    ...(abajo ? abajo.validaciones : []),
    ...(propia ? [{ de: entrada.capa, tipo: nombre, formula: propia }] : []),
  ].map((v) => Object.freeze(v)));
  return {
    nombre,
    capa: entrada.capa,
    base: padre.base,
    faceta: padre.faceta,
    refinamiento: padre.refinamiento,
    validaciones: Object.freeze(validaciones),
    opciones: opcionesDe(r) ?? abajo?.opciones ?? padre.opciones ?? null,
    ayuda: ayudaDe(r) ?? abajo?.ayuda ?? padre.ayuda ?? null,
    cadena: Object.freeze([nombre, ...(deriva === nombre ? abajo?.cadena.slice(1) ?? [] : padre.cadena)]),
    error: null,
  };
}

/**
 * Resuelve el tipo de un parámetro (su 1: ["text"], ["ref", "purchase"], ["file", "format"], ["an id"],
 * ["another book", "line keys"]) en la época de `opciones` (opciones.epoca, o la del eje de opciones.eje, o la 0):
 * { nombre (el declarado, o null si es un tipo base), capa, base, faceta, refinamiento (lo que sigue a un tipo base sin
 * facetas: ["purchase"]), validaciones: [{ de: 'base' | '0' | 'provisional' | 'libro', base?, faceta?, tipo?, formula? }]
 * en el orden en que se comprueban (la forma de la faceta, la cadena de abajo arriba), opciones (la fórmula, o null),
 * ayuda (o null), cadena (los declarados, del más alto al más bajo), error (o null) }. Sin tipo, text.
 */
export function resolverTipo(tipo, opciones = {}) {
  const [t0 = 'text', ...resto] = textos(tipo);
  return resolverNombre(t0, resto, mapaDeTipos(opciones), []);
}

/** Los tipos declarados que ve una época, resueltos: [{ nombre, capa, base, faceta, validaciones, opciones, ayuda, cadena, error }]. */
export function tiposDeParametro(opciones = {}) {
  const mapa = mapaDeTipos(opciones);
  return [...mapa.values()].map((e) => ({ ...resolverEntrada(e, mapa, []), nombre: e.nombre, capa: e.capa }));
}

/**
 * ¿Vale `valor` para unas validaciones (las de resolverTipo y, detrás, la del parámetro)? Cada una en su orden: la forma
 * de la faceta y cada fórmula con it = `sujeto` (por defecto, el valor) en `contexto` (un ContextoEje). Una fórmula que
 * no da verdadero (falso, PENDIENTE o ERROR) no vale. → { ok, falla: la validación que no pasó, o null, estado }.
 */
export function valeElValor(validaciones, valor, contexto, { sujeto = valor } = {}) {
  for (const v of validaciones ?? []) {
    if (v.formula === undefined) {
      const forma = FORMA_DE_LA_FACETA[v.base]?.[v.faceta];
      if (forma && !forma(valor)) return { ok: false, falla: v, estado: 'RESUELTO' };
      continue;
    }
    const r = evaluar(v.formula, contexto, { sujeto });
    if (r.estado !== 'RESUELTO') return { ok: false, falla: v, estado: r.estado };
    if (!(r.valor.length === 1 && r.valor[0] === true)) return { ok: false, falla: v, estado: 'RESUELTO' };
  }
  return { ok: true, falla: null, estado: 'RESUELTO' };
}
