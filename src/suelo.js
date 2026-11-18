// El suelo de una época (A21, agram-equipo/DISENO_GOBIERNO_Y_MOTOR.md §5; VG 17-11): lo que ningún cambio de reglas
// toca. Una función pura, sin eje: compara una época con la que resulta de fundirle algo encima (un cambio aprobado,
// src/versiones.js, o una época hija de nacimiento, src/epocas.js cargarEpocaEscrita) y dice, en llano, por qué no vale.
//
// La época dice su suelo en su fila de gobierno, 7.9 (diseño §4.1):
//   7.9.1  el umbral de un cambio corriente        7.9.2  el umbral de un cambio de gobierno (nunca por debajo del 7.9.1)
//   7.9.6  el suelo: nombres de reglas y posiciones de la época («epoch.7.0»), una hoja cada una
//   7.9.7  las piezas de gobierno: lo que solo cambia un cambio de clase «governance» (posiciones y nombres de reglas,
//          lecturas o plantillas); el núcleo les añade, calculado, lo que leen (piezasDeGobiernoDe)
// Una época sin esa fila (la 0 de antes del gobierno) no tiene suelo que guardar: no se rechaza nada.
//
// Lo que se comprueba (diseño §5, «cómo se hace cumplir»; arreglos de la revisión, Core AGRAM 17-11):
//   - no se quita ni se sustituye una regla (o lectura, o plantilla) cuyo nombre está en el suelo;
//   - no cambia ninguna posición de la época que esté en el suelo;
//   - no se quita nada de la lista del suelo: se amplía, nunca se encoge;
//   - la fila 7.9 vale (erroresDeLaFila): los umbrales (7.9.1 y 7.9.2) son números mayores que 0 y menores que 1, y el
//     de gobierno queda estrictamente por encima del corriente; los niveles (7.9.3 y 7.9.4) son niveles de la época y el
//     de gobierno no queda por debajo; cada nombre de quién cuenta (7.9.5) pesa más que 0 y no más que la presión máxima;
//   - con una clase dada (un cambio, no una época de nacimiento): si toca una pieza de gobierno, o añade, sustituye o quita
//     una condición o una lectura que se guarda (se llame como se llame), la clase es «governance».
// Y la salida con lo propio (VG 17-11; condicionesDelRegistro, al final): a un registro que nombra «declare a balance»
// solo se le prueban las reglas del suelo de la versión de nacimiento del libro (S8, encargo «arreglos del puente»).

import { nombreDeRegla, esLectura, esEscritura, esLecturaDePv, posicionDeLectura, esFormula } from './bqlm.js';

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
/** Los niveles de firmeza que pide cada clase (diseño §4.1) y los de la época, en su orden (epoch.7.6.1). */
export const NIVEL_CORRIENTE = Object.freeze([7, 9, 3]);
export const NIVEL_DE_GOBIERNO = Object.freeze([7, 9, 4]);
export const NIVELES = Object.freeze([7, 6, 1]);
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

/**
 * El suelo de una época: la lista de su 7.9.6 (nombres y posiciones, en su orden) y, calculado, toda lectura que una
 * regla o lectura del suelo nombra en su 1, hasta cerrar (anexo de los arreglos, I: el mismo cálculo que las piezas de
 * gobierno, solo con nombres; las posiciones del suelo son las escritas). [] si no la tiene.
 */
export function sueloDe(epoca) {
  return cerrarPiezas(epoca, textos(en(raizDe(epoca), SUELO)), { posiciones: false });
}

/** Las piezas de gobierno escritas en una época (su 7.9.7, tal cual); [] si no las tiene. */
export function piezasEscritasDe(epoca) {
  return textos(en(raizDe(epoca), PIEZAS_DE_GOBIERNO));
}

/** Una posición de la época dentro de una fórmula: «epoch.9.0.0.4» (no «epoch.(x)» ni «epoch» suelto). */
const RE_POSICION_EN_FORMULA = /(?<![A-Za-z0-9_])epoch((?:\.[0-9])+)(?![0-9])/g;

/** Una lectura que se guarda en una posición de un elemento: su 3 es «X.2.4.7», «A.8.1»… (no «X», «A» ni «ev»). */
const RE_MATERIALIZADA = /^[A-Za-z]+(\.[0-9])+$/;

/**
 * Cierra una lista de piezas con lo que leen (arreglos de la revisión, H3; Core AGRAM 17-11): de cada regla o lectura
 * de la época que se llama como una pieza, toda posición «epoch.…» que lee su fórmula (su 2) o que declara leer (su 1),
 * y toda lectura que se materializa justo en una posición que declara leer (su 1: «X.2.6» trae «support»), y así hasta
 * cerrar. Las plantillas no añaden nada: lo que leen sus fórmulas prepara una candidata que juzgan las reglas. Con
 * `posiciones: false`, solo los nombres (las reglas y lecturas). Una posición que ya cubre otra de la lista
 * («epoch.7.9.5» bajo «epoch.7.9») no se repite.
 */
export function cerrarPiezas(epoca, iniciales, { posiciones = true } = {}) {
  const reglas = Array.isArray(epoca?.reglasConId) ? epoca.reglasConId.map((x) => x.regla) : [];
  const lecturasEn = new Map();
  for (const r of reglas) {
    if (!esLectura(r)) continue;
    const p = posicionDeLectura(r);
    // Solo las que se materializan en una posición de un elemento: «X» en un 1 es el registro, no la lectura «asked».
    if (typeof p !== 'string' || !RE_MATERIALIZADA.test(p)) continue;
    if (!lecturasEn.has(p)) lecturasEn.set(p, []);
    lecturasEn.get(p).push(nombreDeRegla(r));
  }
  const piezas = [...iniciales];
  const vistas = new Set(piezas);
  const anade = (p) => {
    if (typeof p === 'string' && p && !vistas.has(p)) {
      vistas.add(p);
      piezas.push(p);
    }
  };
  for (let k = 0; k < piezas.length; k++) {
    if (caminoDePosicion(piezas[k])) continue;
    for (const r of reglas) {
      if (nombreDeRegla(r) !== piezas[k]) continue;
      if (posiciones) for (const f of hojasDe(r[2]).filter(esFormula)) for (const m of f.matchAll(RE_POSICION_EN_FORMULA)) anade(PREFIJO_DE_POSICION + m[1].slice(1));
      for (const h of textos(r[1])) {
        if (caminoDePosicion(h)) {
          if (posiciones) anade(h);
        } else for (const l of lecturasEn.get(h) ?? []) anade(l);
      }
    }
  }
  const cubre = (a, b) => a.length < b.length && a.every((d, i) => d === b[i]);
  return piezas.filter((p) => {
    const c = caminoDePosicion(p);
    if (!c) return true;
    if (!posiciones && !iniciales.includes(p)) return false;
    return !piezas.some((q) => q !== p && caminoDePosicion(q) && cubre(caminoDePosicion(q), c));
  });
}

/**
 * Las piezas de gobierno de una época: las de su 7.9.7 y, calculado y no escrito a mano, lo que leen, hasta cerrar
 * (cerrarPiezas). Sin las reglas cargadas (una raíz suelta), solo las del 7.9.7.
 */
export function piezasDeGobiernoDe(epoca) {
  return cerrarPiezas(epoca, piezasEscritasDe(epoca));
}

/**
 * Lo que una regla de la época guarda o decide (arreglos de la revisión, H1 y H2): «la condición «…»», «la regla que
 * escribe «…»» o «la lectura «…», que se guarda en X.2.4.7» (las que se materializan en una posición de un elemento); null
 * si solo informa (una lectura que no se materializa, como «changes» en X, o la de un punto de vista).
 */
function queGuarda(regla) {
  const n = nombreDeRegla(regla);
  if (esLecturaDePv(regla)) return null;
  if (esLectura(regla)) {
    const p = posicionDeLectura(regla);
    return typeof p === 'string' && RE_MATERIALIZADA.test(p) ? 'la lectura «' + n + '», que se guarda en ' + p : null;
  }
  if (esEscritura(regla)) return 'la regla que escribe «' + n + '»';
  return 'la condición «' + n + '»';
}

/** El número de una posición si es un número de verdad (un texto que parece un número no lo es), o undefined. */
const numero = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : undefined);
const comoTexto = (x) => (x === undefined ? 'nada' : typeof x === 'string' ? '«' + x + '»' : String(x));

/** Los ids de los registros de la época que se llaman `nombre`: reglas y lecturas del 2 y plantillas del 9.6, ordenados. */
function idsDe(epoca, nombre) {
  const reglas = (epoca?.reglasConId ?? []).filter((x) => nombreDeRegla(x.regla) === nombre).map((x) => x.id);
  // Solo las suyas: las provisionales (src/provisional.js) no son de la época (no están en su 9.6).
  const plantillas = (Array.isArray(epoca?.transacciones) ? epoca.transacciones : []).filter((x) => !x.provisional && primera(x.plantilla?.[0]) === nombre).map((x) => x.id);
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
  motivos.push(...erroresDeLaFila(resultado));
  const presion = presionDeLosNombres(resultado);
  if (presion !== null && !(presion > 0)) motivos.push('deja en quién cuenta (epoch.7.9.5) nombres cuyas presiones suman ' + presion + ': el apoyo de un cambio se divide por esa suma, y ha de ser más que 0');
  if (clase !== undefined && clase !== CLASE_DE_GOBIERNO) {
    const declarada = '«' + String(clase ?? 'sin clase') + '»';
    const piezas = [...new Set([...piezasDeGobiernoDe(base), ...piezasDeGobiernoDe(resultado)])];
    const tocadas = piezas.filter((p) => toca(base, resultado, p));
    if (tocadas.length) motivos.push('toca ' + tocadas.map((p) => '«' + p + '»').join(', ') + ', que ' + (tocadas.length > 1 ? 'son piezas' : 'es una pieza') + ' de gobierno (epoch.7.9.7), y se declara ' + declarada + ': un cambio así es de clase «' + CLASE_DE_GOBIERNO + '»');
    // H1 y H2: la clase por lo que hace, no por cómo se llama. Una condición, o una lectura que se guarda, nueva o sustituida.
    const antes = new Set((base?.reglasConId ?? []).map((x) => x.id));
    const nombresAntes = new Set((base?.reglasConId ?? []).map((x) => nombreDeRegla(x.regla)));
    for (const { id, regla } of resultado?.reglasConId ?? []) {
      if (antes.has(id) || tocadas.includes(nombreDeRegla(regla))) continue;
      const q = queGuarda(regla);
      if (!q) continue;
      motivos.push((nombresAntes.has(nombreDeRegla(regla)) ? 'sustituye ' : 'añade ') + q + ', y se declara ' + declarada + ': una condición o una lectura que se guarda, nueva o sustituida, se llame como se llame, es de clase «' + CLASE_DE_GOBIERNO + '»');
    }
    // Tampoco quita (VG 17-11, encargo «la salida con lo propio», B): una condición o una lectura que se guarda de la base
    // que en el resultado ya no está como tal. El 2 es una colección que no pierde entradas al fundir, así que quitar es
    // dejar con ese nombre algo que no guarda (una lectura que solo informa); una época completa puede no traerla.
    const ahora = new Set((resultado?.reglasConId ?? []).map((x) => x.id));
    const guardanAhora = new Set((resultado?.reglasConId ?? []).filter((x) => queGuarda(x.regla)).map((x) => nombreDeRegla(x.regla)));
    for (const { id, regla } of base?.reglasConId ?? []) {
      const n = nombreDeRegla(regla);
      if (ahora.has(id) || tocadas.includes(n) || guardanAhora.has(n)) continue;
      const q = queGuarda(regla);
      if (q) motivos.push('quita ' + q + ', y se declara ' + declarada + ': quitar una condición o una lectura que se guarda, se llame como se llame, es de clase «' + CLASE_DE_GOBIERNO + '»');
    }
  }
  return motivos;
}

/**
 * Lo que no vale de la fila 7.9 de una época (arreglos de la revisión, H5 y H6, y S5 de la segunda pasada), en llano;
 * [] si vale o si no tiene la fila. Los umbrales (7.9.1 y 7.9.2) son números mayores que 0 y menores que 1 («approved»
 * pasa si el apoyo, que no pasa de 1, supera el umbral: con 1 no se aprobaría nada), y el de gobierno queda
 * estrictamente por encima del corriente; los niveles (7.9.3 y 7.9.4) son niveles de la época (0, sin prueba, o uno de
 * epoch.7.6.1) y el de gobierno no queda por debajo del corriente (por su rango en epoch.7.6.1); cada nombre de quién
 * cuenta (7.9.5) pesa más que 0 y no más que la presión máxima (epoch.9.0.0.4): un nombre suelto, la máxima; «nombre k»,
 * k. Un texto que parece un número no vale.
 */
export function erroresDeLaFila(epoca) {
  const raiz = raizDe(epoca);
  if (!Array.isArray(en(raiz, GOBIERNO))) return [];
  const motivos = [];
  const umbral = (camino, que) => {
    const x = primera(en(raiz, camino));
    const v = numero(x);
    const vale = v !== undefined && v > 0 && v < 1;
    if (!vale) motivos.push('deja el umbral de ' + que + ' (epoch.' + camino.join('.') + ') en ' + comoTexto(x) + ': un umbral es un número mayor que 0 y menor que 1 (se aprueba al superarlo, y el apoyo no pasa de 1)');
    return vale ? v : undefined;
  };
  const corriente = umbral(UMBRAL_CORRIENTE, 'un cambio corriente');
  const alto = umbral(UMBRAL_DE_GOBIERNO, 'un cambio de gobierno');
  if (corriente !== undefined && alto !== undefined && !(alto > corriente)) motivos.push('deja el umbral de un cambio de gobierno (epoch.7.9.2, ' + alto + ') ' + (alto < corriente ? 'por debajo del' : 'igual que el') + ' de un cambio corriente (epoch.7.9.1, ' + corriente + '): ha de quedar por encima');
  const niveles = hojasDe(en(raiz, NIVELES)).filter((h) => numero(h) !== undefined);
  const nivel = (camino, que) => {
    const x = primera(en(raiz, camino));
    const v = numero(x);
    const rango = v === 0 ? -1 : v === undefined ? -2 : niveles.indexOf(v);
    if (rango < -1) {
      motivos.push('deja el nivel de firmeza de ' + que + ' (epoch.' + camino.join('.') + ') en ' + comoTexto(x) + ': un nivel es 0 (sin prueba) o uno de los de la época (epoch.7.6.1: ' + niveles.join(', ') + ')');
      return undefined;
    }
    return { v, rango };
  };
  const n3 = nivel(NIVEL_CORRIENTE, 'un cambio corriente');
  const n4 = nivel(NIVEL_DE_GOBIERNO, 'un cambio de gobierno');
  if (n3 && n4 && n4.rango < n3.rango) motivos.push('deja el nivel de firmeza de un cambio de gobierno (epoch.7.9.4, ' + n4.v + ') por debajo del de un cambio corriente (epoch.7.9.3, ' + n3.v + ')');
  const maxima = numero(primera(en(raiz, PRESION_MAXIMA)));
  const nombres = hojasDe(en(raiz, NOMBRES)).filter((h) => h !== 0 && h !== '0');
  if (!nombres.length && !(maxima > 0)) motivos.push('deja la presión máxima (epoch.9.0.0.4) ' + (maxima === undefined ? 'sin un número' : 'en ' + maxima) + ', y sin nombres cuenta el dueño con ella: una presión es un número mayor que 0');
  for (const h of nombres) {
    const m = typeof h === 'string' ? RE_MAGNITUD.exec(h.trim()) : null;
    const presion = m ? Number(m[1] ?? m[4]) : maxima;
    if (!(presion > 0 && maxima !== undefined && presion <= maxima)) motivos.push('deja en quién cuenta (epoch.7.9.5) ' + comoTexto(h) + ' con la presión ' + (presion === undefined ? 'sin un número' : presion) + ': una presión es un número mayor que 0 y no mayor que la máxima de la época (epoch.9.0.0.4, ' + (maxima === undefined ? 'sin un número' : maxima) + ')');
  }
  return motivos;
}

// ---------- La salida con lo propio (VG 17-11; docs/notas/GOBIERNO.md, «La salida con lo propio») ----------
// Los dos tercios pueden añadir una regla que deje a una persona sin escribir; a cambio, la declaración de saldo del
// puente es suelo y se juzga solo con el suelo: que sea de quien la firma, que sea verdad y que pague su T. Qué es una
// declaración lo dice una regla del suelo, «a declared balance is only that»: un registro que nombra «declare a
// balance» en su 4 y hace cualquier otra cosa no entra. El núcleo solo decide qué reglas se le prueban.

/** El nombre de la acción (y de la plantilla) de una declaración de saldo, y el de la regla del suelo que dice qué es. */
export const DECLARAR_SALDO = 'declare a balance';
export const DECLARACION_SOLO_ESO = 'a declared balance is only that';
/** Dónde dice un registro su acción: su payload 4, el parámetro «actions» de toda plantilla de la época. */
const ACCION = 4;

/** ¿Nombra `ev` «declare a balance» en su payload 4? (la misma lectura que `dice` de src/versiones.js). */
export function nombraDeclaracion(ev) {
  const x = ev?.payload?.[ACCION];
  return Array.isArray(x) ? x.includes(DECLARAR_SALDO) : x === DECLARAR_SALDO;
}

const SOLO_DEL_SUELO = new WeakMap();

/**
 * Las reglas de validez de `epoca` (su `condiciones`, en el orden del 8) que se le prueban al registro `ev`: todas; y, si
 * `ev` nombra «declare a balance» en su 4, solo las que se llaman como una pieza del suelo de la época DE NACIMIENTO del
 * libro (sueloDe de `epoca.nacimiento`, la primera versión, o de `epoca` si es ella: su 7.9.6, con lo calculado). S8
 * (encargo «arreglos del puente»): lo que un cambio añada a 7.9.6 después de nacer el libro no alcanza la declaración; las
 * reglas del suelo de nacimiento no se quitan ni se sustituyen, así que siguen en la versión vigente con su nombre, y se
 * prueban las de la vigente. Una época de nacimiento escrita con cambios es esa época entera. Solo si esa época tiene en
 * su suelo la regla «a declared balance is only that» y la vigente la trae:
 * sin ella nadie exigiría la forma de una declaración, y vestir de declaración otro registro saltaría las reglas del
 * libro; entonces se le prueban todas. Quien decide que un registro «es una declaración» es esa regla, que se le prueba
 * siempre: si nombra la acción y hace otra cosa, no entra.
 */
export function condicionesDelRegistro(epoca, ev) {
  const todas = Array.isArray(epoca?.condiciones) ? epoca.condiciones : [];
  if (!nombraDeclaracion(ev) || !epoca || typeof epoca !== 'object') return todas;
  if (!SOLO_DEL_SUELO.has(epoca)) {
    const suelo = new Set(sueloDe(epoca.nacimiento ?? epoca));
    const guarda = suelo.has(DECLARACION_SOLO_ESO) && todas.some((r) => nombreDeRegla(r) === DECLARACION_SOLO_ESO);
    SOLO_DEL_SUELO.set(epoca, guarda ? Object.freeze(todas.filter((r) => suelo.has(nombreDeRegla(r)))) : todas);
  }
  return SOLO_DEL_SUELO.get(epoca);
}
