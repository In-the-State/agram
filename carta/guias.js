// Las zonas de la cara y la guía mínima en la carta (Core AGRAM 17-11, pieza 2 de agram-equipo/DISENO_ZONAS_GUIA.md §4;
// las lecturas son del núcleo, docs/CONTRATO.md §12.8). Sin DOM: lo que la carta necesita para leer las guías de los
// libros de mi clave en este dispositivo y para seguir un paso o una zona.
//
//   LibrosDelDispositivo                     los ejes de mis otros libros, leídos del almacén local una vez mientras no cambien
//   pasoDelLibro(eje, id)                    ¿es `id` un paso de una guía de ese libro? → { paso, guia, autor } o null
//   esMiGuia(hallado, yo)                    ¿es mía la guía de ese paso (yo, mi identidad en el libro de la guía)?
//   sugerenciasDeMisGuias(...)               el gancho de la tercera fuente del 9: los pasos de mis guías sobre el foco
//   estadoDeLosPasos(...)                    el camino de una guía en su libro: cada paso con su estado leído en su libro
//   libroDeEntrada(...)                      la entrada de «Tus libros» de un libro (por el id de su génesis), si está aquí
//
// Seguridad (§7 del diseño): nada de esto firma, escribe, lanza ni pide nada a la red. Solo lee el almacén local de este
// navegador (los libros de mi clave que ya están aquí) y lo que dicen las lecturas del núcleo, que ya solo cuentan las
// zonas y los pasos del autor del elemento y comprueban la forma de cada id.

import * as contrato from '../src/contrato.js';
import { plantillaDeTransaccion } from '../src/acciones.js';

/** Cuántos libros de mi clave se leen para la tercera fuente y para el camino de una guía (los primeros de «Tus libros»). */
export const TOPE_DE_LIBROS = 8;
/** Cuántos pasos de guía salen como mucho en el 9 de un registro, y cuántos enseña el camino de una guía. */
export const TOPE_DE_PASOS = 24;

const RE_ID = /^[0-9a-f]{64}$/;


/**
 * Los ejes de mis libros en este dispositivo, leídos del almacén local (la clave de cada uno: `clave(alta)`). Se guarda lo
 * leído por libro con el texto entero del que salió: mientras el texto guardado sea el mismo (===), no se vuelve a
 * restaurar (restaurar vuelve a comprobar todas las firmas). Lo que no se lee da null; nunca lanza.
 */
export class LibrosDelDispositivo {
  constructor({ clave, restaurar, almacen = () => globalThis.localStorage } = {}) {
    this.clave = clave;
    this.restaurar = restaurar;
    this.almacen = almacen;
    this.leidos = new Map(); // alta → { texto, eje, guias: Map(autor → guías) }
  }

  /** El texto guardado del libro de esa alta, o null. */
  texto(alta) {
    try { return this.almacen()?.getItem(this.clave(alta)) ?? null; } catch { return null; }
  }

  /** El eje del libro de esa alta (lo leído antes si el texto no cambió), o null. */
  async eje(alta) {
    if (typeof alta !== 'string' || !alta) return null;
    const texto = this.texto(alta);
    if (!texto) { this.leidos.delete(alta); return null; }
    const antes = this.leidos.get(alta);
    if (antes && antes.texto === texto) return antes.eje;
    let eje = null;
    try { eje = await this.restaurar(JSON.parse(texto)); } catch { eje = null; }
    this.leidos.set(alta, { texto, eje, guias: new Map() });
    return eje;
  }

  /** Las guías de `autor` en el libro de esa alta (contrato.guias), contadas una vez por versión del texto. */
  async guias(alta, autor) {
    const eje = await this.eje(alta);
    if (!eje || typeof autor !== 'string' || !autor) return [];
    const l = this.leidos.get(alta);
    if (!l.guias.has(autor)) {
      try { l.guias.set(autor, contrato.guias(eje, { autor })); } catch { l.guias.set(autor, []); }
    }
    return l.guias.get(autor);
  }
}

/**
 * La entrada de «Tus libros» del libro `libro` (el id de su génesis): por la que ya lo sabe (`e.libro`) o, si la entrada
 * aún no lo dice, leyendo su eje del dispositivo. null si no está aquí. `actual`: { alta, eje } del libro abierto.
 */
export async function libroDeEntrada(libro, { entradas = [], libros, actual = null } = {}) {
  if (typeof libro !== 'string' || !RE_ID.test(libro)) return null;
  if (actual?.eje?.genesisId === libro) return entradas.find((e) => e.alta === actual.alta) ?? { alta: actual.alta, libro };
  const sabida = entradas.find((e) => e.libro === libro);
  if (sabida) return sabida;
  for (const e of entradas.slice(0, TOPE_DE_LIBROS)) {
    if (e.libro) continue;
    const eje = await libros?.eje(e.alta);
    if (eje?.genesisId === libro) return { ...e, libro };
  }
  return null;
}

/**
 * ¿Es `id` un paso de una guía de este libro? Un registro con «a step of the guide» anclado en el 4 de su guía que la
 * lectura del núcleo da por bueno (del autor de la guía, con forma válida). → { paso, guia: { id, titulo }, autor (el de la
 * guía) } o null. Que sea un paso no dice que sea mío: eso lo decide esMiGuia.
 */
export function pasoDelLibro(eje, id) {
  if (typeof id !== 'string' || !RE_ID.test(id)) return null;
  const r = eje?.obtener?.(id);
  if (!r?.sobre) return null;
  const paso = contrato.pasosDeGuia(eje, r.sobre).find((p) => p.id === id);
  if (!paso) return null;
  const guia = contrato.guias(eje).find((g) => g.id === r.sobre) ?? { id: r.sobre, titulo: null };
  return { paso, guia, autor: eje.obtener(r.sobre)?.autor ?? null };
}

/**
 * ¿Puedo seguir este paso? Solo si la guía de la que cuelga la escribí yo (`yo`: mi identidad en el libro de la guía).
 * Un miembro de un libro con la época de la guía puede escribir su propia guía con pasos que apuntan a mis libros: esos
 * no se me ofrecen ni se siguen (la carta lo dice y no abre nada). Sin saber quién soy en ese libro, no.
 */
export const esMiGuia = (hallado, yo) => Boolean(hallado) && typeof yo === 'string' && yo !== '' && hallado.autor === yo;

/**
 * El gancho de la tercera fuente del camino (§12.5) con los pasos de mis guías: de cada libro de mi clave en este
 * dispositivo que tenga guías (los TOPE_DE_LIBROS primeros), los pasos cuyo libro es el abierto y cuyo registro es el
 * del foco (contrato.sugerenciasDeGuia). Solo los de MIS guías: las que escribí con mi identidad en el libro de la guía
 * (la de su entrada; en el libro abierto, `actual.yo`); de un libro donde no sé quién soy, nada. El libro abierto se lee
 * de `actual.eje` (lo último, no lo guardado). Como mucho TOPE_DE_PASOS pasos, cortando al recorrer. `deDonde` (opcional) recibe, por cada paso, el alta del libro de su guía: con ella la carta sabe
 * después a qué guía volver al tocarlo. → (eje, ev, yo) → [sugerencias].
 */
export function sugerenciasDeMisGuias({ entradas = [], libros, actual = null, idioma, deDonde } = {}) {
  return async (eje, ev, yo) => {
    const fuera = [];
    for (const e of entradas.slice(0, TOPE_DE_LIBROS)) {
      if (fuera.length >= TOPE_DE_PASOS) break;
      const esActual = actual && e.alta === actual.alta;
      const autor = esActual ? actual.yo : e.identidad;
      if (typeof autor !== 'string' || !autor) continue;
      const ejeGuia = esActual ? actual.eje : await libros?.eje(e.alta);
      if (!ejeGuia) continue;
      const tiene = esActual ? contrato.guias(ejeGuia, { autor }).length > 0 : (await libros.guias(e.alta, autor)).length > 0;
      if (!tiene) continue;
      let lista = [];
      try { lista = contrato.sugerenciasDeGuia(ejeGuia, eje, ev, yo, { idioma, autor, tope: TOPE_DE_PASOS - fuera.length }); } catch { lista = []; }
      for (const s of lista.slice(0, TOPE_DE_PASOS - fuera.length)) {
        deDonde?.(s.id, e.alta);
        fuera.push(s);
      }
    }
    return fuera;
  };
}

/**
 * El camino de la guía X en su libro (`ejeGuia`): todos sus pasos (los TOPE_DE_PASOS primeros), cada uno con su estado
 * leído en el libro donde se hace, si ese libro está en este dispositivo: { id, titulo, porque, accion, libro (el nombre
 * de su entrada; null: este libro), estado: 'hecho' | 'pendiente' | 'noEsta' | 'invalido', motivo? }. 'noEsta': ese
 * libro no está en este dispositivo; 'invalido': la acción no existe en la época de ese libro o el registro no está (el
 * motivo, en llano, lo pone `decir(clave, partes)`). `yoDe(entrada)`: mi identidad en ese libro. [] si X no es una guía.
 */
export async function estadoDeLosPasos(ejeGuia, X, { entradas = [], libros, actual, yoDe, decir = (k) => k, opciones = {} } = {}) {
  const pasos = contrato.pasosDeGuia(ejeGuia, X).slice(0, TOPE_DE_PASOS);
  const fuera = [];
  for (const paso of pasos) {
    const libro = paso.libro ?? ejeGuia.genesisId;
    const base = { id: paso.id, titulo: paso.titulo, porque: paso.porque, accion: paso.accion, libro: null };
    const entrada = await libroDeEntrada(libro, { entradas, libros, actual });
    if (!entrada) { fuera.push({ ...base, estado: 'noEsta' }); continue; }
    if (libro !== ejeGuia.genesisId) base.libro = entrada.nombre ?? null;
    const ejeD = actual?.eje?.genesisId === libro ? actual.eje : libro === ejeGuia.genesisId ? ejeGuia : await libros?.eje(entrada.alta);
    if (!ejeD) { fuera.push({ ...base, estado: 'noEsta' }); continue; }
    const yo = yoDe?.(entrada) ?? null;
    if (!plantillaDeTransaccion(paso.accion, { epoca: ejeD.epoca() })) { fuera.push({ ...base, estado: 'invalido', motivo: decir('guiaPasoSinAccion', { accion: paso.accion }) }); continue; }
    const sobre = paso.sobre ?? (yo ? ejeD.alta(yo)?.id : null);
    if (!sobre || !ejeD.obtener(sobre)) { fuera.push({ ...base, estado: 'invalido', motivo: decir('guiaPasoSinRegistro') }); continue; }
    let hecho = false;
    try { hecho = contrato.pasoHecho(ejeD, paso, yo, opciones); } catch { hecho = false; }
    fuera.push({ ...base, estado: hecho ? 'hecho' : 'pendiente' });
  }
  return fuera;
}
