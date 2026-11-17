// La guía de ensayo (Core AGRAM 17-11, pieza 3 de agram-equipo/DISENO_ZONAS_GUIA.md, §5): el SEGUNDO libro que sirve el
// servidor de retoques con --ensayo, de la misma dueña y con su misma clave, con la época hija del libro de la guía
// (datos/epocas/guia-libro/). Lo crea retoques/ensayo.mjs la primera vez; después se carga tal cual (VG lo retoca desde la
// carta): nunca se reescribe solo.
//
// Su contenido inicial lo escribe la dueña con las plantillas reales de las dos épocas, nada a mano:
//   el elemento guía   «anchor here» sobre su alta: «Guía de ensayo»
//   su cara            «attach a file» en su 0: un html pequeño, sin guiones ni nada de fuera (CARA), del tamaño 3, como el
//                      html con que nace toda alta. Se pinta en el iframe aislado de siempre, a todo el ancho de la cara, y
//                      deja la mitad de abajo libre para los botones.
//   tres pasos         «a step of the guide» en su 4, sobre el libro del roadmap: una nota en su propia alta, una tarea
//                      nueva en una línea y un comentario en una tarea (las tres, «anchor here», que se le ofrece a la
//                      dueña en cualquier registro). Cada uno se comprueba con sugerenciasDeGuia contra el roadmap y con lo
//                      que se le ofrece allí: si uno sale inválido, no se escribe nada.
//   cuatro zonas       «a zone of the face» en su 0: dos a dos pasos, una a la línea del roadmap (otro libro) y una al
//                      alta de la dueña en este libro.

import { createHash } from 'node:crypto';
import * as A from '../src/acciones.js';
import { firmar } from '../src/autoridad.js';
import { cargarEpocaEscrita } from '../src/epocas.js';
import { sugerenciasDeGuia, pasosDeGuia, zonas } from '../src/guia-libro.js';
import { leerLibro } from '../ejemplos/volcado/volcar.mjs';
import { epocaGuiaLibro } from '../datos/epocas/guia-libro/generar.mjs';
import { formatoDeTipo } from '../carta/archivos.js';

/** El nombre del eje compartido de la guía de ensayo (en su propio almacén). */
export const EJE_GUIA = 'guia';
export const PASO = 'a step of the guide';
export const ZONA = 'a zone of the face';

/** La cara de la guía: un html pequeño, sin guiones, sin estilos ni nada de fuera. Arriba el título; abajo, sitio para los botones. */
export const CARA = '<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Guía de ensayo</title></head>'
  + '<body style="margin:0;min-height:100vh;background:#f3ede2;color:#3b332a;font:18px system-ui,sans-serif">'
  + '<h1 style="margin:0;padding:7% 8% 0;font-size:1.4em">Guía de ensayo</h1>'
  + '<p style="margin:0;padding:3% 8%">Toca un botón para empezar.</p></body></html>';

/** La cara como archivo adjunto: { id (su SHA-256), tipo, bytes, referencia }. */
export function caraDeLaGuia() {
  const bytes = new TextEncoder().encode(CARA);
  const id = createHash('sha256').update(bytes).digest('hex');
  return { id, tipo: 'text/html', bytes, referencia: 'archivo:' + id };
}

/** El id de la época hija del libro de la guía que trae este código. */
export const idDeLaEpocaDeLaGuia = () => cargarEpocaEscrita(epocaGuiaLibro()).id;

/**
 * Los registros del roadmap sobre los que van los pasos: su alta, la primera línea (proyecto) y la primera tarea que haya
 * (null las que no haya). `corr`: la correspondencia del volcado.
 */
export function destinosEnElRoadmap(roadmap, identidad, corr) {
  const libro = leerLibro(roadmap, identidad, corr);
  const posicion = new Map(roadmap.orden.map((id, i) => [id, i]));
  const primero = (ids) => [...ids].sort((a, b) => (posicion.get(a) ?? 0) - (posicion.get(b) ?? 0))[0] ?? null;
  return { alta: roadmap.alta(identidad).id, linea: primero(libro.proyectos.values()), tarea: primero([...libro.tareas.values()].map((t) => t.id)) };
}

/** Los pasos, en llano y cortos: { titulo, accion, parametros, porque, sobre (null: su alta en el roadmap) }. */
function pasosPara(d) {
  return [
    { titulo: 'Escribe tu primera nota', accion: 'anchor here', parametros: ['title: Mi primera nota'], porque: 'para ver cómo se escribe en el libro', sobre: null },
    ...(d.linea ? [{ titulo: 'Añade una tarea a esta línea', accion: 'anchor here', parametros: ['title: Una tarea nueva'], porque: 'una línea crece con sus tareas', sobre: d.linea }] : []),
    ...(d.tarea ? [{ titulo: 'Comenta una tarea', accion: 'anchor here', parametros: ['title: Un comentario'], porque: 'lo que se dice queda junto a la tarea', sobre: d.tarea }] : []),
  ];
}

/**
 * ¿Sale bien cada paso de la guía `X` de `eje` en el roadmap? Por sugerenciasDeGuia en el registro de cada paso (sin
 * registro, el alta de `identidad`) y por lo que se le ofrece allí a `identidad`. → [motivo] (vacío: todos bien).
 */
export function comprobarPasos(eje, X, roadmap, identidad) {
  const motivos = [];
  for (const p of pasosDeGuia(eje, X)) {
    if (p.libro !== roadmap.genesisId) continue;
    const sobre = p.sobre ?? roadmap.alta(identidad)?.id;
    const s = sugerenciasDeGuia(eje, roadmap, sobre, identidad, { idioma: 'es' }).find((x) => x.id === p.id);
    if (!s) motivos.push(p.titulo + ': no sale en ' + sobre);
    else if (s.invalida) motivos.push(p.titulo + ': ' + s.invalida);
    else if (![...Array(10).keys()].some((pv) => A.acciones(roadmap, sobre, pv, identidad).some((a) => a.nombre === p.accion))) motivos.push(p.titulo + ': ' + p.accion + ' no se le ofrece');
  }
  return motivos;
}

/**
 * Escribe el contenido inicial de la guía de ensayo en `eje` (el libro nuevo, con la época hija, de `identidad`), firmado
 * con `privada`, sobre el `roadmap` ya volcado. `t0`: el instante del primer registro (uno por segundo después).
 * → { guia, pasos: [ids], zonas: [ids] }. Lanza (sin haber escrito nada que valga) si un paso saldría inválido.
 */
export async function escribirGuiaDeEnsayo(eje, { roadmap, identidad, privada, corr, t0 }) {
  let s = 0;
  const t = () => new Date(t0 + 1000 * s++).toISOString().replace(/\.\d{3}Z$/, 'Z');
  const hacer = async (nombre, X, params) => {
    const r = await A.transaccion(eje, nombre, { X, ...params }, identidad, { t: t(), firmar: (ev) => firmar(ev, privada) });
    if (!r.ok) throw new Error('guía de ensayo: «' + nombre + '» no pasa: ' + r.motivos.map((m) => m.mensaje ?? String(m)).join('; '));
    return eje.anadir(r.evento);
  };
  const alta = eje.alta(identidad).id;
  const guia = await hacer('anchor here', alta, { title: 'Guía de ensayo' });
  const cara = caraDeLaGuia();
  const formato = formatoDeTipo(cara.tipo, { epoca: eje.epoca() });
  if (!formato) throw new Error('guía de ensayo: la época no admite html');
  await hacer('attach a file', guia.id, { file: cara.referencia, format: formato, size: 3 });
  const d = destinosEnElRoadmap(roadmap, identidad, corr);
  const pasos = [];
  for (const p of pasosPara(d)) {
    pasos.push(await hacer(PASO, guia.id, { title: p.titulo, action: p.accion, parameters: p.parametros, why: p.porque, book: roadmap.genesisId, ...(p.sobre ? { record: p.sobre } : {}) }));
  }
  const motivos = comprobarPasos(eje, guia.id, roadmap, identidad);
  if (motivos.length) throw new Error('guía de ensayo: un paso saldría inválido: ' + motivos.join(' · '));
  // Las zonas: dos a dos pasos (este libro), una a la línea del roadmap (otro libro) y una a mi alta aquí (este libro).
  const caja = (x, y) => ({ x, y, width: 420, height: 200 });
  const zonasPorEscribir = [
    { label: 'Primera nota', ...caja(60, 440), record: pasos[0].id },
    ...(pasos[1] ? [{ label: 'Una tarea nueva', ...caja(520, 440), record: pasos[1].id }] : []),
    { label: 'Ver el roadmap', ...caja(60, 700), book: roadmap.genesisId, record: d.linea ?? d.alta },
    { label: 'Mi sitio aquí', ...caja(520, 700), record: alta },
  ];
  const escritas = [];
  for (const z of zonasPorEscribir) escritas.push(await hacer(ZONA, guia.id, z));
  return { guia: guia.id, pasos: pasos.map((p) => p.id), zonas: escritas.map((z) => z.id), cara };
}

/** La guía del libro (el elemento con pasos de la dueña) y lo que se lee de ella: { guia, pasos, zonas } o null. */
export function leerGuiaDeEnsayo(eje, identidad) {
  const alta = eje.alta(identidad)?.id;
  if (!alta) return null;
  for (const id of eje.orden) {
    const ev = eje.obtener(id);
    if (ev?.autor !== identidad || ev.sobre !== alta) continue;
    const pasos = pasosDeGuia(eje, id);
    if (pasos.length) return { guia: id, pasos, zonas: zonas(eje, id) };
  }
  return null;
}
