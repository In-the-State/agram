// «Quién me nombra» (Core AGRAM 18-11, pendiente de revisar VG; docs/BQLM.md §15.3): el índice que da, para un valor y
// una posición del payload (una ruta de dígitos), los registros del libro que lo llevan ahí, en el orden del libro. Es
// lo que hace barato `M cited d.d…` del BQL mínimo (src/bqlm.js); el resultado y el coste no dependen de él.
//
// Se construye perezoso, la primera vez que una evaluación lo pide, SOLO desde lo que da el contexto: los registros de
// `before.1` y, de cada uno, los ocupantes de `payload(r).d.d…` con su valor, con las mismas llamadas que hace el
// evaluador al recorrerlos con un where (contexto.ocupantes, contexto.payload). Así da exactamente lo mismo que el
// recorrido: lo que el contexto no ve (lo posterior a una candidata, otra vista) no está. Lo que cuesta construirlo no se
// cobra a nadie: el coste de `cited` lo fija su definición (§15.3). Si recorrer un registro queda PENDIENTE o da ERROR
// (una referencia a un registro que no está), el índice guarda esa parada, la del primero por orden, como el recorrido.
//
// Se guardan los últimos índices por la huella del contexto (contexto.huella(): el eje, su lista de registros, cuántos y
// el último, la época…) y la ruta: un libro que cambia tiene otra huella. Sin huella, se construye en cada evaluación.

/** Cuántos índices se guardan (por huella y ruta); se tira el más viejo. */
export const INDICES_GUARDADOS = 16;

const GUARDADOS = new Map();

/**
 * El índice de la ruta `ruta` (dígitos) en lo que ve `contexto`: { sinLibro } si el contexto no tiene `before`; si no,
 * { registros: cuántos hay en before.1, porClave: Map(clave del valor → [registros, por orden]), fallo: la parada del
 * primer registro cuyo recorrido no se resuelve, o null }. Recibe del evaluador cómo leer: `valorDe(o)` (el valor de un
 * ocupante), `clave(v)` (la clave de un valor), `presupuesto()` (uno sin tope, para recorrer) y `noEsRegistro(r)` (la
 * parada de payload(r) sobre lo que no es un registro).
 */
export function indiceDeNombres(contexto, ruta, lectura) {
  const huella = typeof contexto?.huella === 'function' ? contexto.huella() : undefined;
  const clave = huella === undefined ? undefined : huella + '#' + ruta.join('.');
  if (clave !== undefined && GUARDADOS.has(clave)) {
    const i = GUARDADOS.get(clave);
    GUARDADOS.delete(clave);
    GUARDADOS.set(clave, i);
    return i;
  }
  const i = construir(contexto, ruta, lectura);
  if (clave !== undefined) {
    GUARDADOS.set(clave, i);
    if (GUARDADOS.size > INDICES_GUARDADOS) GUARDADOS.delete(GUARDADOS.keys().next().value);
  }
  return i;
}

function construir(contexto, ruta, { valorDe, clave, presupuesto, noEsRegistro }) {
  const antes = contexto.nombre('before');
  if (antes === undefined) return Object.freeze({ sinLibro: true });
  const pres = presupuesto();
  const registros = contexto.ocupantes(antes, [1], pres);
  const porClave = new Map();
  let fallo = null;
  for (const r of registros) {
    let ocupantes;
    try {
      const p = typeof contexto.payload === 'function' ? contexto.payload(r) : undefined;
      if (p === undefined) throw noEsRegistro(r);
      ocupantes = contexto.ocupantes(p, ruta, pres);
    } catch (e) {
      fallo = e;
      break;
    }
    const vistas = new Set();
    for (const o of ocupantes) {
      const v = valorDe(o);
      if (v === undefined) continue;
      const k = clave(v);
      if (vistas.has(k)) continue;
      vistas.add(k);
      if (!porClave.has(k)) porClave.set(k, []);
      porClave.get(k).push(r);
    }
  }
  return Object.freeze({ registros: registros.length, porClave, fallo });
}

/** Olvida los índices guardados (para las pruebas). */
export function olvidarIndices() {
  GUARDADOS.clear();
}
