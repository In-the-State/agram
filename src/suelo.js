// El suelo de una época (A21, agram-equipo/DISENO_GOBIERNO_Y_MOTOR.md §5; VG 17-11): lo que ningún cambio de reglas
// toca. Una función pura, sin eje: compara una época con la que resulta de fundirle algo encima (un cambio aprobado,
// src/versiones.js, o una época hija de nacimiento, src/epocas.js cargarEpocaEscrita) y dice, en llano, por qué no vale.
//
// La época dice su suelo en su fila de gobierno, 7.9 (diseño §4.1):
//   7.9.1  el umbral de un cambio corriente        7.9.2  el umbral de un cambio de gobierno (nunca por debajo del 7.9.1)
//   7.9.6  el suelo: nombres de reglas y posiciones de la época («epoch.7.0»), una hoja cada una
//   7.9.7  las piezas de gobierno: lo que solo cambia un cambio de clase «governance» (posiciones y nombres de reglas,
//          lecturas o plantillas)
// Una época sin esa fila (la 0 de antes del gobierno) no tiene suelo que guardar: no se rechaza nada.
//
// Lo que se comprueba (diseño §5, «cómo se hace cumplir»):
//   - no se quita ni se sustituye una regla (o lectura, o plantilla) cuyo nombre está en el suelo;
//   - no cambia ninguna posición de la época que esté en el suelo;
//   - no se quita nada de la lista del suelo: se amplía, nunca se encoge;
//   - el umbral de un cambio de gobierno no queda por debajo del de un cambio corriente;
//   - con una clase dada (un cambio, no una época de nacimiento): si toca una pieza de gobierno, la clase es «governance».

import { nombreDeRegla } from './bqlm.js';

/** La fila de gobierno de la época y sus posiciones (diseño §4.1). */
export const GOBIERNO = Object.freeze([7, 9]);
export const UMBRAL_CORRIENTE = Object.freeze([7, 9, 1]);
export const UMBRAL_DE_GOBIERNO = Object.freeze([7, 9, 2]);
export const SUELO = Object.freeze([7, 9, 6]);
export const PIEZAS_DE_GOBIERNO = Object.freeze([7, 9, 7]);
/** Las dos clases que declara un cambio (diseño §3.1). */
export const CLASE_CORRIENTE = 'ordinary';
export const CLASE_DE_GOBIERNO = 'governance';
/** Cómo se escribe una posición de la época en el suelo y en las piezas de gobierno: «epoch.7.0». */
export const PREFIJO_DE_POSICION = 'epoch.';

const raizDe = (e) => (Array.isArray(e) ? e : e?.registro ?? e?.payload);
const en = (nodo, camino) => camino.reduce((n, k) => (Array.isArray(n) ? n[k] : undefined), nodo);
const primera = (x) => {
  let n = x;
  while (Array.isArray(n)) n = n[0];
  return n;
};
/** Las hojas de una posición que es una lista (o una hoja sola). */
const hojasDe = (x) => (x === undefined || x === null ? [] : Array.isArray(x) ? x.filter((h) => !Array.isArray(h)) : [x]);
const textos = (x) => hojasDe(x).filter((h) => typeof h === 'string' && h.length > 0);
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** El camino de una posición escrita «epoch.7.0» ([7, 0]), o null si no lo es. */
export function caminoDePosicion(s) {
  if (typeof s !== 'string' || !s.startsWith(PREFIJO_DE_POSICION)) return null;
  const partes = s.slice(PREFIJO_DE_POSICION.length).split('.');
  if (!partes.length || partes.length > 10 || !partes.every((p) => /^[0-9]$/.test(p))) return null;
  return partes.map(Number);
}

/** Quién cuenta (diseño §4.1; docs/notas/GOBIERNO.md §2): la lista de nombres de 7.9.5, la presión máxima en 9.0.0.4. */
export const NOMBRES = Object.freeze([7, 9, 5]);
export const PRESION_MAXIMA = Object.freeze([9, 0, 0, 4]);
// Un nombre «nombre k» es una magnitud (D-VALOR): la misma forma que src/contexto-eje.js (RE_MAGNITUD), copiada aquí
// porque este módulo no puede importar el contexto (lo importa src/epocas.js).
const RE_MAGNITUD = /^(?:(-?\d+(?:\.\d+)?)\s+([\p{L}€$%][\p{L}\p{N}_€$%]*)|([\p{L}€$%][\p{L}\p{N}_€$%]*)\s+(-?\d+(?:\.\d+)?))$/u;

/**
 * La suma de las presiones de los nombres de 7.9.5 (lo que divide la lectura «support»), o null si la época no tiene esa
 * fila. Cada hoja distinta de 0: una magnitud «nombre k» pesa k; cualquier otra (una identidad), la presión máxima
 * (9.0.0.4). Sin nombres (solo el 0), cuenta el dueño con la presión máxima.
 */
export function presionDeLosNombres(epoca) {
  const raiz = raizDe(epoca);
  if (!Array.isArray(en(raiz, GOBIERNO)) || en(raiz, NOMBRES) === undefined) return null;
  const maxima = Number(primera(en(raiz, PRESION_MAXIMA)));
  const nombres = hojasDe(en(raiz, NOMBRES)).filter((h) => h !== 0 && h !== '0');
  if (!nombres.length) return maxima;
  return nombres.reduce((s, h) => {
    const m = typeof h === 'string' ? RE_MAGNITUD.exec(h.trim()) : null;
    return s + (m ? Number(m[1] ?? m[4]) : maxima);
  }, 0);
}

/** La lista del suelo de una época (su 7.9.6): nombres y posiciones, en su orden; [] si no la tiene. */
export function sueloDe(epoca) {
  return textos(en(raizDe(epoca), SUELO));
}

/** Las piezas de gobierno de una época (su 7.9.7); [] si no las tiene. */
export function piezasDeGobiernoDe(epoca) {
  return textos(en(raizDe(epoca), PIEZAS_DE_GOBIERNO));
}

/** Los ids de los registros de la época que se llaman `nombre`: reglas y lecturas del 2 y plantillas del 9.6, ordenados. */
function idsDe(epoca, nombre) {
  const reglas = (epoca?.reglasConId ?? []).filter((x) => nombreDeRegla(x.regla) === nombre).map((x) => x.id);
  const plantillas = (Array.isArray(epoca?.transacciones) ? epoca.transacciones : []).filter((x) => primera(x.plantilla?.[0]) === nombre).map((x) => x.id);
  return [...reglas, ...plantillas].sort();
}

/** ¿Cambia `pieza` (una posición «epoch.…» o el nombre de una regla, lectura o plantilla) de `base` a `resultado`? */
function toca(base, resultado, pieza) {
  const camino = caminoDePosicion(pieza);
  if (camino) return !igual(en(raizDe(base), camino), en(raizDe(resultado), camino));
  return !igual(idsDe(base, pieza), idsDe(resultado, pieza));
}

/**
 * Por qué `resultado` (la época que queda al fundir algo sobre `base`) no respeta el suelo de `base`: los motivos en llano,
 * [] si lo respeta. Pura: solo lee las dos épocas cargadas (su registro, sus reglas del 2 y sus plantillas del 9.6).
 * `clase` (opcional): la que declara el cambio; si se da, un cambio que toca una pieza de gobierno (las de `base` y las
 * de `resultado`) ha de ser de clase «governance». Sin `clase` (una época de nacimiento) eso no se mira.
 */
export function erroresDelSuelo(base, resultado, { clase } = {}) {
  const motivos = [];
  const suelo = sueloDe(base);
  for (const s of suelo) {
    const camino = caminoDePosicion(s);
    if (camino) {
      if (toca(base, resultado, s)) motivos.push('cambia la posición ' + s + ' de la época, que es del suelo (epoch.7.9.6): no se cambia');
      continue;
    }
    const antes = idsDe(base, s);
    if (!antes.length) continue; // un nombre que la época no tiene: no hay nada que guardar
    const despues = idsDe(resultado, s);
    if (!despues.length) motivos.push('quita «' + s + '», que es del suelo (epoch.7.9.6): no se quita');
    else if (!igual(antes, despues)) motivos.push('sustituye «' + s + '», que es del suelo (epoch.7.9.6): no se sustituye');
  }
  const nuevo = new Set(sueloDe(resultado));
  const quitados = suelo.filter((s) => !nuevo.has(s));
  if (quitados.length) motivos.push('quita del suelo (epoch.7.9.6) ' + quitados.map((s) => '«' + s + '»').join(', ') + ': el suelo se amplía, nunca se encoge');
  const alto = primera(en(raizDe(base), UMBRAL_DE_GOBIERNO));
  if (Number.isFinite(alto)) {
    const corriente = primera(en(raizDe(resultado), UMBRAL_CORRIENTE));
    const nuevoAlto = primera(en(raizDe(resultado), UMBRAL_DE_GOBIERNO));
    if (!Number.isFinite(nuevoAlto)) motivos.push('deja el umbral de un cambio de gobierno (epoch.7.9.2) sin un número');
    else if (Number.isFinite(corriente) && nuevoAlto < corriente) motivos.push('deja el umbral de un cambio de gobierno (epoch.7.9.2, ' + nuevoAlto + ') por debajo del de un cambio corriente (epoch.7.9.1, ' + corriente + ')');
  }
  const presion = presionDeLosNombres(resultado);
  if (presion !== null && !(presion > 0)) motivos.push('deja en quién cuenta (epoch.7.9.5) nombres cuyas presiones suman ' + presion + ': el apoyo de un cambio se divide por esa suma, y ha de ser más que 0');
  if (clase !== undefined && clase !== CLASE_DE_GOBIERNO) {
    const piezas = [...new Set([...piezasDeGobiernoDe(base), ...piezasDeGobiernoDe(resultado)])];
    const tocadas = piezas.filter((p) => toca(base, resultado, p));
    if (tocadas.length) motivos.push('toca ' + tocadas.map((p) => '«' + p + '»').join(', ') + ', que ' + (tocadas.length > 1 ? 'son piezas' : 'es una pieza') + ' de gobierno (epoch.7.9.7), y se declara «' + String(clase ?? 'sin clase') + '»: un cambio así es de clase «' + CLASE_DE_GOBIERNO + '»');
  }
  return motivos;
}
