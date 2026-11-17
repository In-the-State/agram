// Volcado de una tabla de tareas en un libro (encargo A8, Core AGRAM 16-11; VG por Core State, #131): lee una tabla JSON
// (una lista de filas) y la vuelca con las plantillas de la época 0. El libro es espejo de la tabla: volver a pasarla no
// escribe nada; con la tabla cambiada se escribe solo la diferencia.
//
//   cada cosa de la tabla (una columna)   según la correspondencia («como»):
//     "cosas" (el defecto)                una cosa de la dueña, dada de alta con «register a thing» y su clave; su T, lo
//                                         justo: el alta da el mínimo de su lista y el resto, o lo que le falte en una
//                                         pasada posterior, llega con «give T to a thing of mine» (V10, 16-11)
//     "personas" (VG 17-11)               una PERSONA invitada: la dueña la invita (eje.invitar, sin dar nada: lo mínimo
//                                         que admite la época) y la casa acepta con su clave (eje.aceptar: su alta). Gasta
//                                         su propio T del día: no hay pasos «dar»; lo que no le quepa hoy queda para otro
//                                         día. Una casa que ya tiene alta de persona vale, la haya invitado quien la haya
//                                         invitado (y si hay una invitación suya sin aceptar, la acepta); un nombre con
//                                         alta de cosa no se vuelca. Sin la clave de la dueña no se invita (paraLaDuena:
//                                         «invitar a X»); sin la clave de una casa, sus filas no se escriben (noPuede)
//   cada proyecto (otra columna)          un registro de la cosa sobre su alta («anchor here»; de una persona, su
//                                         aceptación): de él cuelgan sus tareas
//   cada fila                             un registro de la cosa sobre el proyecto («anchor here»): su 0 es el texto y su 1
//                                         los datos como «etiqueta: valor» (el id de la fila y los que diga la
//                                         correspondencia), la misma forma que la clasificación de una opinión
//   la fase de la fila                    hasta qué paso llega su proceso, en orden:
//     propuesta   «declare future T» en el 4.1 de la tarea: el anuncio de los minutos que se trabajarán
//     autorizada  «commit P» sobre el anuncio: la cosa compromete su P y el recuento del anuncio pasa
//     ejecutada   «deliver» sobre el anuncio: la cosa trabaja (quema) lo anunciado
//     cerrada     «close» en el 4 de la tarea: la cosa dice que todo lo anunciado ha pasado
//   un texto o un dato que cambia         otro «anchor here» de la cosa sobre la tarea, con el texto y los datos nuevos
//
// Lo leen el motor y el contrato: la estación del anuncio (acciones.estacionDeAnuncio: propuesta, autorizada, ejecutada)
// y el cierre (motor.cerrado). Nada de la tabla está escrito aquí: qué columna es cada cosa y a qué paso lleva cada fase
// lo dice la correspondencia (opciones.correspondencia; la del roadmap, en correspondencia-roadmap.json, al lado).
//
// Uso:
//   node ejemplos/volcado/volcar.mjs --tabla <tabla.json> [--correspondencia <c.json>] [--claves <claves.json>]
//        [--eje <eje.json>] [--salida <eje.json>] [--simular] [--t <instante>]
//   --claves   un JSON FUERA del repositorio: { "duena": { "identidad", "privada" }, "cosas": { "<cosa>": { "publica",
//              "privada" } } } (también en modo personas: la clave de cada casa va en «cosas»). Sin él, solo se puede
//              simular, con claves de prueba generadas en memoria.
//   --eje      un eje guardado (persistencia.serializar). Sin él, un eje local vacío: el génesis de la dueña.
//   --salida   dónde guardar el eje escrito (sin --simular es obligatorio). Nada habla con ningún nodo.

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname, relative, isAbsolute, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Eje } from '../../src/eje.js';
import * as A from '../../src/acciones.js';
import { cerrado } from '../../src/motor.js';
import { serializar, restaurar } from '../../src/persistencia.js';
import { firmar, firmarPosesion, generarClaves, publicaDe } from '../../src/autoridad.js';
import { esAnunciado, ESCALAS_REALES } from '../../src/tokens.js';

/** Los pasos del proceso de una tarea, en orden: la fase de una fila dice hasta cuál llega. */
export const PASOS = Object.freeze(['propuesta', 'autorizada', 'ejecutada', 'cerrada']);

/** Las plantillas de la época 0 que escribe el volcado. */
export const PLANTILLAS = Object.freeze({
  alta: 'register a thing', dar: 'give T to a thing of mine', registro: 'anchor here',
  propuesta: 'declare future T', autorizada: 'commit P', ejecutada: 'deliver', cerrada: 'close',
});

/**
 * La dueña paga el coste de escribir cada alta y cada «give T to a thing of mine» en T de segundo: su T de minuto es lo
 * que da a las cosas (las dos plantillas transfieren T de minuto) y cada escala es su propio token, sin conversión.
 */
const ESCALA_DE_LA_DUENA = 'segundo';

/** La escala que da la dueña con «give T to a thing of mine»: el minuto, por su índice en el calendario (su parámetro scale). */
const MINUTO = ESCALAS_REALES.indexOf('minuto');

const SEP = ': ';
const EN_0 = '0000000000';
const ANUNCIO = '4100000000';

const hojas = (x) => (Array.isArray(x) ? x.flatMap(hojas) : [x]);
const accionDe = (ev) => hojas(ev?.payload?.[4]).filter((x) => typeof x === 'string');
const tiene = (ev, plantilla) => accionDe(ev).includes(plantilla);
const texto0 = (ev) => { const h = hojas(ev?.payload?.[0]).find((x) => typeof x === 'string' || typeof x === 'number'); return h === undefined ? '' : String(h); };
const etiquetas = (ev) => Object.fromEntries(hojas(ev?.payload?.[1]).filter((x) => typeof x === 'string' && x.includes(SEP)).map((x) => [x.slice(0, x.indexOf(SEP)), x.slice(x.indexOf(SEP) + SEP.length)]));
const masSegundos = (t, s) => new Date(Date.parse(t) + s * 1000).toISOString().replace('.000Z', 'Z');
const sumar = (cuenta, quien, escala, n) => { cuenta[quien] ??= {}; cuenta[quien][escala] = (cuenta[quien][escala] ?? 0) + n; };

/** Los dos modos del alta de cada casa: cosas de la dueña (el defecto) o personas invitadas por ella (VG 17-11). */
export const MODOS = Object.freeze(['cosas', 'personas']);

/** La correspondencia con sus defectos comprobada: { columnas: { id, cosa, proyecto, texto, fase, datos }, fases, nombres, minutosAnunciados, cuando, como }. */
export function correspondenciaDe(c = {}) {
  const col = c.columnas ?? {};
  for (const k of ['id', 'cosa', 'proyecto', 'texto', 'fase']) if (typeof col[k] !== 'string' || !col[k]) throw new Error('correspondencia: falta la columna «' + k + '»');
  const fases = c.fases ?? {};
  for (const [f, paso] of Object.entries(fases)) if (!PASOS.includes(paso)) throw new Error('correspondencia: la fase «' + f + '» lleva a «' + paso + '», que no es un paso (' + PASOS.join(', ') + ')');
  const minutos = c.minutosAnunciados ?? 1;
  if (!Number.isInteger(minutos) || minutos < 1) throw new Error('correspondencia: minutosAnunciados ha de ser un entero positivo');
  const como = c.como ?? MODOS[0];
  if (!MODOS.includes(como)) throw new Error('correspondencia: «como» es ' + MODOS.join(' o ') + ', no «' + como + '»');
  return { columnas: { ...col, datos: Array.isArray(col.datos) ? col.datos : [] }, fases, nombres: c.nombres ?? {}, minutosAnunciados: minutos, cuando: c.cuando ?? null, como };
}

/** Los datos de una fila como el 1 de su registro: «etiqueta: valor», el id primero. */
const datosDe = (fila, col) => [col.id, ...col.datos].map((k) => k + SEP + String(fila[k] ?? ''));

// ---------- lo que ya hay en el libro ----------

/**
 * Lo que el libro ya tiene de la tabla, leído de los registros (sin nada guardado aparte): las cosas de la dueña, sus
 * proyectos y sus tareas, por el id de la fila. → { cosas: Map(nombre → alta), proyectos: Map(nombre\0proyecto → id),
 * tareas: Map(id de fila → { id, cosa, proyecto, texto, datos, anuncio, pasos }) }.
 */
export function leerLibro(eje, duena, corr) {
  const { columnas: col } = corr;
  const cosas = new Map();
  const proyectos = new Map();
  const tareas = new Map();
  if (corr.como === 'personas') {
    // Las casas son personas del libro (escribieron su propia alta), las haya invitado quien las haya invitado.
    for (const id of eje.identidades()) if (eje.esPersona(id) && eje.alta(id)) cosas.set(id, eje.alta(id).id);
  } else {
    for (const id of eje.orden) {
      const ev = eje.obtener(id);
      if (ev.autor !== duena || !tiene(ev, PLANTILLAS.alta)) continue;
      const nombre = hojas(ev.payload?.[3]).at(-1);
      if (typeof nombre === 'string' && eje.alta(nombre)?.id === ev.id) cosas.set(nombre, ev.id);
    }
  }
  for (const [cosa, alta] of cosas) {
    for (const p of eje.sobre(alta, EN_0).filter((h) => h.autor === cosa && tiene(h, PLANTILLAS.registro))) {
      const clave = cosa + '\0' + texto0(p);
      if (!proyectos.has(clave)) proyectos.set(clave, p.id);
      for (const t of eje.sobre(p.id, EN_0).filter((h) => h.autor === cosa && tiene(h, PLANTILLAS.registro))) {
        const fila = etiquetas(t)[col.id];
        if (fila === undefined || tareas.has(fila)) continue;
        // Lo último que dice la cosa de la tarea: la tarea o su última corrección (otro «anchor here» suyo sobre ella).
        const ultima = [t, ...eje.sobre(t.id, EN_0).filter((h) => h.autor === cosa && tiene(h, PLANTILLAS.registro) && etiquetas(h)[col.id] === fila)].at(-1);
        const anuncio = eje.sobre(t.id, ANUNCIO).find((h) => h.autor === cosa && tiene(h, PLANTILLAS.propuesta)) ?? null;
        const sobreAnuncio = anuncio ? eje.sobre(anuncio.id).filter((h) => h.autor === cosa) : [];
        const pasos = {
          propuesta: Boolean(anuncio),
          autorizada: sobreAnuncio.some((h) => tiene(h, PLANTILLAS.autorizada)),
          ejecutada: sobreAnuncio.some((h) => tiene(h, PLANTILLAS.ejecutada)),
          cerrada: eje.sobre(t.id).some((h) => h.autor === cosa && tiene(h, PLANTILLAS.cerrada)),
        };
        tareas.set(fila, { id: t.id, cosa, proyecto: texto0(p), texto: texto0(ultima), datos: etiquetas(ultima), anuncio: anuncio?.id ?? null, pasos });
      }
    }
  }
  return { cosas, proyectos, tareas };
}

/** Hasta qué paso ha llegado una tarea en el libro (los registros que hay, en orden): -1 sin anuncio. */
const nivelDe = (pasos) => { let n = -1; for (const p of PASOS) { if (!pasos[p]) break; n += 1; } return n; };

/**
 * La estación de una tarea leída con el motor: «cerrada» si la cosa la cerró y el motor la da por cerrada; si no, la del
 * anuncio de su 4.1 (acciones.estacionDeAnuncio: propuesta, autorizada, ejecutada o verificada); null sin anuncio.
 */
export function estacionDe(eje, tareaId) {
  const t = eje.obtener(tareaId);
  if (!t) return null;
  const anuncio = eje.sobre(tareaId, ANUNCIO).find((h) => h.autor === t.autor && tiene(h, PLANTILLAS.propuesta));
  const cierre = eje.sobre(tareaId).some((h) => h.autor === t.autor && tiene(h, PLANTILLAS.cerrada));
  if (cierre && cerrado(eje, tareaId).cerrado === true) return 'cerrada';
  return anuncio ? A.estacionDeAnuncio(eje, anuncio.id) : null;
}

// ---------- el plan: lo que falta ----------

/**
 * Compara la tabla con el libro y da los pasos que faltan, en orden, y los avisos. Cada paso: { tipo, quien, cosa,
 * fila?, proyecto?, ... }; tipo: alta, proyecto, tarea, correccion o uno de PASOS. Con `filas` (un Set de ids de fila),
 * solo esas filas: las demás no se miran (ni se corrigen ni cuentan como desaparecidas).
 */
export function planear(eje, tabla, { duena, corr, filas = null }) {
  const { columnas: col, fases, nombres } = corr;
  const libro = leerLibro(eje, duena, corr);
  const pasos = [];
  const avisos = [];
  const sinCambios = [];
  const vistos = new Set();
  const cosasNuevas = new Set();
  const proyectosNuevos = new Set();
  if (!Array.isArray(tabla)) throw new Error('la tabla ha de ser una lista de filas');
  for (const [k, fila] of tabla.entries()) {
    const id = fila?.[col.id];
    const falta = [col.id, col.cosa, col.proyecto, col.texto].filter((c) => fila?.[c] === undefined || fila?.[c] === null || String(fila[c]).trim() === '');
    if (falta.length) { avisos.push(`fila ${k + 1}: sin ${falta.join(', ')}; no se vuelca`); continue; }
    const fid = String(id);
    if (vistos.has(fid)) { avisos.push(`fila ${fid}: id repetido; solo cuenta la primera`); continue; }
    vistos.add(fid);
    if (filas && !filas.has(fid)) continue;
    const texto = String(fila[col.texto]);
    if (texto.startsWith('=')) { avisos.push(`fila ${fid}: el texto empieza por «=» y se leería como fórmula; no se vuelca`); continue; }
    const cosa = String(nombres[fila[col.cosa]] ?? fila[col.cosa]);
    const proyecto = String(fila[col.proyecto]);
    const fase = fila[col.fase] === undefined ? '' : String(fila[col.fase]);
    let destino = fases[fase];
    if (destino === undefined) { avisos.push(`fila ${fid}: fase «${fase}» desconocida; se queda en propuesta`); destino = PASOS[0]; }
    const quiere = PASOS.indexOf(destino);
    const datos = datosDe(fila, col);
    const ya = libro.tareas.get(fid);
    if (ya) {
      if (ya.cosa !== cosa || ya.proyecto !== proyecto) avisos.push(`fila ${fid}: en la tabla es de ${cosa} / ${proyecto} y en el libro de ${ya.cosa} / ${ya.proyecto}; no se mueve`);
      const antes = [col.id, ...col.datos].map((c) => c + SEP + (ya.datos[c] ?? ''));
      const cambia = ya.texto !== texto || antes.join('\n') !== datos.join('\n');
      const n = nivelDe(ya.pasos);
      const nuevos = [];
      if (cambia) nuevos.push({ tipo: 'correccion', quien: ya.cosa, cosa: ya.cosa, fila: fid, tarea: ya.id, texto, datos });
      if (quiere < n) avisos.push(`fila ${fid}: la fase «${fase}» (${destino}) retrocede desde ${PASOS[n]}; no se deshace`);
      for (let p = n + 1; p <= quiere; p++) nuevos.push({ tipo: PASOS[p], quien: ya.cosa, cosa: ya.cosa, fila: fid, tarea: ya.id, anuncio: ya.anuncio, texto });
      if (nuevos.length) pasos.push(...nuevos); else sinCambios.push(fid);
      continue;
    }
    if (!libro.cosas.has(cosa) && !cosasNuevas.has(cosa)) {
      if (eje.alta(cosa)) {
        avisos.push(corr.como === 'personas'
          ? `fila ${fid}: «${cosa}» ya tiene alta como cosa y no como persona; no se vuelca`
          : `fila ${fid}: «${cosa}» ya tiene alta y no es una cosa de ${duena}; no se vuelca`);
        continue;
      }
      cosasNuevas.add(cosa);
      pasos.push({ tipo: 'alta', quien: duena, cosa });
    }
    const clave = cosa + '\0' + proyecto;
    if (!libro.proyectos.has(clave) && !proyectosNuevos.has(clave)) {
      proyectosNuevos.add(clave);
      pasos.push({ tipo: 'proyecto', quien: cosa, cosa, proyecto });
    }
    pasos.push({ tipo: 'tarea', quien: cosa, cosa, proyecto, fila: fid, texto, datos });
    for (let p = 0; p <= quiere; p++) pasos.push({ tipo: PASOS[p], quien: cosa, cosa, fila: fid, texto });
  }
  const desaparecen = [...libro.tareas.keys()].filter((f) => !vistos.has(f));
  for (const f of desaparecen) avisos.push(`fila ${f}: ya no está en la tabla; no se borra`);
  return { pasos, avisos, sinCambios, desaparecen, libro };
}

// ---------- escribir un plan ----------

/** Los minutos que «register a thing» deja dar (su validación): los valores de «it = N». */
function minutosPermitidos() {
  const p = A.parametros(A.plantillaDeTransaccion(PLANTILLAS.alta)).find((x) => x.nombre === 'minutes');
  return [...String(p?.validacion ?? '').matchAll(/it = (\d+)/g)].map((m) => Number(m[1])).sort((a, b) => a - b);
}

/**
 * Escribe los pasos en `eje`, en orden, cada uno con su plantilla, firmado por quien lo escribe; lo que no pasa se
 * anota y se saltan los que dependen de él. `minutos` (Map cosa → minutos) son los que la dueña da a cada cosa nueva en
 * su alta, y `dar` (Map cosa → minutos) los que le da después con «give T to a thing of mine» (el paso «dar»).
 * → { escritos: [{ paso, ev }], fallos: [{ paso, motivo, quema }] }.
 */
async function escribirPlan(eje, pasos, { duena, claves, corr, minutos, dar = new Map(), t0 }) {
  const ids = { alta: new Map(), proyecto: new Map(), tarea: new Map(), anuncio: new Map() };
  const libro = leerLibro(eje, duena, corr);
  for (const [c, id] of libro.cosas) ids.alta.set(c, id);
  for (const [k, id] of libro.proyectos) ids.proyecto.set(k, id);
  for (const [f, x] of libro.tareas) { ids.tarea.set(f, x.id); if (x.anuncio) ids.anuncio.set(f, x.anuncio); }
  const caidas = new Set(); // cosas, proyectos y filas cuyo paso anterior no pasó
  const escritos = [];
  const discrepancias = [];
  const fallos = [];
  let s = 0;
  for (const paso of pasos) {
    const dep = [paso.cosa, paso.proyecto !== undefined ? paso.cosa + '\0' + paso.proyecto : null, paso.fila ? 'fila\0' + paso.fila : null].filter(Boolean);
    const propia = paso.tipo === 'alta' || paso.tipo === 'dar' ? paso.cosa : paso.tipo === 'proyecto' ? paso.cosa + '\0' + paso.proyecto : 'fila\0' + paso.fila;
    if (dep.some((d) => caidas.has(d))) { fallos.push({ paso, motivo: 'depende de un paso que no pasó', quema: null }); caidas.add(propia); continue; }
    let X;
    let params;
    const t = masSegundos(t0, s++);
    const tarea = paso.tarea ?? ids.tarea.get(paso.fila);
    if (paso.tipo === 'alta' && corr.como === 'personas') {
      // Una persona: la invitación (la de la dueña, o una que ya esté sin aceptar) y su aceptación, firmada con su clave.
      try {
        let inv = invitacionPendiente(eje, paso.cosa);
        if (!inv) {
          inv = await eje.invitar({ autor: duena, invitado: paso.cosa, clave: claves.cosas?.[paso.cosa]?.publica, da: [], t, privada: claves.duena?.privada });
          escritos.push({ paso: { ...paso, tipo: 'invitacion' }, ev: inv });
        }
        const alta = await eje.aceptar(inv, claves.cosas?.[paso.cosa] ?? {}, { t: masSegundos(t0, s++) });
        ids.alta.set(paso.cosa, alta.id);
        escritos.push({ paso, ev: alta });
      } catch (e) {
        fallos.push({ paso, motivo: e.message, quema: null });
        caidas.add(propia);
      }
      continue;
    }
    switch (paso.tipo) {
      case 'alta': X = eje.alta(duena)?.id; params = { thing: paso.cosa, minutes: minutos.get(paso.cosa), ...(claves.cosas?.[paso.cosa]?.publica ? { key: claves.cosas[paso.cosa].publica } : {}) }; break;
      case 'dar': X = ids.alta.get(paso.cosa); params = { scale: MINUTO, amount: dar.get(paso.cosa) }; break;
      case 'proyecto': X = ids.alta.get(paso.cosa); params = { title: paso.proyecto }; break;
      case 'tarea': X = ids.proyecto.get(paso.cosa + '\0' + paso.proyecto); params = { title: paso.texto, content: paso.datos }; break;
      case 'correccion': X = tarea; params = { title: paso.texto, content: paso.datos }; break;
      case 'propuesta': X = tarea; params = { what: paso.texto, when: corr.cuando ?? t0, units: corr.minutosAnunciados }; break;
      case 'autorizada': X = paso.anuncio ?? ids.anuncio.get(paso.fila); params = {}; break;
      case 'ejecutada': X = tarea; params = { announcement: paso.anuncio ?? ids.anuncio.get(paso.fila) }; break;
      case 'cerrada': X = tarea; params = {}; break;
      default: throw new Error('paso desconocido: ' + paso.tipo);
    }
    const plantilla = PLANTILLAS[paso.tipo] ?? PLANTILLAS.registro;
    const privada = paso.quien === duena ? claves.duena?.privada : claves.cosas?.[paso.quien]?.privada;
    const prueba = paso.tipo === 'alta' ? claves.cosas?.[paso.cosa]?.privada : null;
    const firma = async (ev) => {
      let e = ev;
      if (prueba) e = await firmarPosesion(e, paso.cosa, prueba);
      return privada ? firmar(e, privada) : e;
    };
    let r;
    try {
      r = X ? await A.transaccion(eje, plantilla, { X, ...params }, paso.quien, { t, firmar: firma, ...(paso.quien === duena ? { escala: ESCALA_DE_LA_DUENA } : {}) }) : { ok: false, evento: null, motivos: [{ mensaje: 'no hay registro donde escribir' }] };
    } catch (e) {
      r = { ok: false, evento: null, motivos: [{ mensaje: e.message }] };
    }
    let ev = null;
    if (r.ok) {
      try { ev = await eje.anadir(r.evento); } catch (e) { r = { ...r, ok: false, motivos: [{ mensaje: e.message }] }; }
    }
    if (!ev) {
      fallos.push({ paso, motivo: r.motivos.map((m) => m.mensaje ?? String(m)).join('; ') || 'no pasa', quema: r.evento ? tDe(r.evento) : null });
      caidas.add(propia);
      continue;
    }
    if (paso.tipo === 'alta') ids.alta.set(paso.cosa, ev.id);
    if (paso.tipo === 'proyecto') ids.proyecto.set(paso.cosa + '\0' + paso.proyecto, ev.id);
    if (paso.tipo === 'tarea') ids.tarea.set(paso.fila, ev.id);
    if (paso.tipo === 'propuesta') ids.anuncio.set(paso.fila, ev.id);
    escritos.push({ paso, ev });
    // Lo escrito, leído con el motor: la estación de la tarea ha de ser la del paso.
    if (PASOS.includes(paso.tipo)) {
      const leida = estacionDe(eje, ids.tarea.get(paso.fila));
      if (leida !== paso.tipo) discrepancias.push(`fila ${paso.fila}: tras «${PLANTILLAS[paso.tipo]}» el motor la lee en ${leida} y no en ${paso.tipo}`);
    }
  }
  return { escritos, fallos, discrepancias };
}

/**
 * Una invitación sin aceptar que nombra a `quien` (su 3.1), de quien sea (en la reescritura la escribe VG desde la
 * carta), o null: la última por llegada.
 */
function invitacionPendiente(eje, quien) {
  if (eje.alta(quien)) return null;
  let fuera = null;
  for (const id of eje.orden) {
    const ev = eje.obtener(id);
    if (hojas(ev.payload?.[0]).includes('invitation') && hojas(ev.payload?.[3]?.[1])[0] === quien) fuera = ev;
  }
  return fuera;
}

/** El T que mueve un registro por quien lo mueve: { quema: { quien: { escala: n } }, da: { quien: { escala: n } } } (lo anunciado no mueve nada). */
function tDe(ev) {
  const quema = {};
  const da = {};
  for (const m of ev.movimientos ?? []) {
    if (m.token !== 'T' || esAnunciado(m) || !m.de) continue;
    sumar(m.a ? da : quema, m.de, m.escala, m.cantidad);
  }
  return { quema, da };
}

const juntar = (a, b) => { for (const [q, porEscala] of Object.entries(b)) for (const [e, n] of Object.entries(porEscala)) sumar(a, q, e, n); return a; };
const copia = async (eje) => restaurar(serializar(eje));

// ---------- volcar ----------

/** Los pasos con el de dar T a cada cosa de `cosas` (el paso «dar»): detrás de su alta o, si ya la tiene, delante de su primer paso. */
function conDar(pasos, cosas, duena) {
  const fuera = [];
  const puesto = new Set();
  for (const p of pasos) {
    if (cosas.has(p.cosa) && !puesto.has(p.cosa) && p.tipo !== 'alta') { fuera.push({ tipo: 'dar', quien: duena, cosa: p.cosa }); puesto.add(p.cosa); }
    fuera.push(p);
  }
  return fuera;
}

/**
 * Vuelca `tabla` (una lista de filas) en `eje`. opciones: { duena (la identidad dueña; por defecto la autora del
 * génesis), claves: { duena: { privada }, cosas: { nombre: { publica, privada } } }, correspondencia, t (el instante del
 * primer registro; uno por segundo después), simular, filas (ids de fila: solo esas; las demás no se tocan aunque en el
 * libro digan otra cosa que la tabla) }. Antes de escribir mide lo que gasta cada cosa en una copia del
 * eje (allí la dueña le da todo el T de minuto que le queda) y la dueña le da lo justo: al darla de alta, el mínimo de
 * la lista de «register a thing»; el resto, o lo que le falte a una cosa que ya tiene alta, con «give T to a thing of
 * mine». Si a la dueña no le llega su T de minuto del día, las cosas que no caben se quedan para otro día (en el
 * informe), y sin su clave (en un eje que exige firmas) no se da T. Con `simular`, todo pasa en una copia.
 * → el informe: { simulado, escritos, sinCambios, avisos, noPuede, paraLaDuena, desaparecen, t: { calculado, gastado, dado }, eje } (eje: donde se escribió; con simular, la copia).
 */
export async function volcar(eje, tabla, opciones = {}) {
  const corr = correspondenciaDe(opciones.correspondencia);
  if (corr.como === 'personas') return volcarPersonas(eje, tabla, corr, opciones);
  const duena = opciones.duena ?? eje.obtener(eje.genesisId).autor;
  const claves = opciones.claves ?? {};
  const t0 = opciones.t ?? new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const plan = planear(eje, tabla, { duena, corr, filas: opciones.filas ? new Set([...opciones.filas].map(String)) : null });
  const avisos = [...plan.avisos];
  const paraLaDuena = [];
  const noPuede = [];
  const minimo = minutosPermitidos()[0] ?? 1;
  const puedeDar = !eje.exigirFirmas || Boolean(claves.duena?.privada);

  // 1. Lo que gasta cada cosa, medido en una copia del eje antes de escribir nada: la dueña la da de alta con el mínimo
  //    y le da todo el T de minuto que le quede. Aparte, lo que quema la propia dueña al darla de alta y al darle T.
  const cosas = [...new Set(plan.pasos.map((p) => p.cosa))];
  const medida = new Map(); // cosa → { quema: lo que queman sus pasos, alta y dar: lo que quema la dueña en esos pasos }
  const necesita = new Map();
  for (const cosa of cosas) {
    const suyos = plan.pasos.filter((p) => p.cosa === cosa);
    const prueba = await copia(eje);
    const nueva = suyos.some((p) => p.tipo === 'alta');
    const mucho = Math.max(0, prueba.saldoT(duena, 'minuto', t0) - (nueva ? minimo : 0));
    const pasosDePrueba = mucho > 0 && puedeDar ? conDar(suyos, new Set([cosa]), duena) : suyos;
    const r = await escribirPlan(prueba, pasosDePrueba, { duena, claves, corr, minutos: new Map([[cosa, minimo]]), dar: new Map([[cosa, mucho]]), t0 });
    const m = { quema: {}, alta: {}, dar: {} };
    const parte = (paso) => (paso.tipo === 'alta' ? m.alta : paso.tipo === 'dar' ? m.dar : m.quema);
    for (const { paso, ev } of r.escritos) juntar(parte(paso), tDe(ev).quema);
    for (const f of r.fallos) if (f.quema) juntar(parte(f.paso), f.quema.quema);
    medida.set(cosa, m);
    necesita.set(cosa, Object.values(m.quema[cosa] ?? {}).reduce((x, y) => x + y, 0));
    const sinCalcular = r.fallos.filter((f) => !f.quema).length;
    if (r.fallos.length) avisos.push(`${cosa}: ${r.fallos.length} pasos no pasan en la copia${sinCalcular ? ` (${sinCalcular} sin calcular su T)` : ''}: ${r.fallos[0].motivo}`);
  }

  // 2. Lo que la dueña da a cada cosa, lo justo, mientras le llegue su T de minuto del día: el mínimo en el alta de una
  //    cosa nueva, y con «give T to a thing of mine» lo que le falte para lo que gasta.
  const minutos = new Map();
  const dar = new Map();
  const dado = {};
  let queda = eje.saldoT(duena, 'minuto', t0);
  const fuera = new Set();
  for (const cosa of cosas) {
    const nueva = plan.pasos.some((p) => p.cosa === cosa && p.tipo === 'alta');
    const n = necesita.get(cosa) ?? 0;
    const tiene = nueva ? minimo : eje.saldoT(cosa, 'minuto', t0);
    const falta = Math.max(0, n - tiene);
    if (nueva && eje.exigirFirmas && !claves.cosas?.[cosa]?.privada) { avisos.push(`${cosa}: sin clave; no se da de alta`); fuera.add(cosa); continue; }
    if (falta > 0 && !puedeDar) {
      fuera.add(cosa);
      // Sin dar T, lo medido en la copia se para en el primer paso que no tiene T: es lo menos que le falta.
      paraLaDuena.push(`dar a ${cosa} al menos ${falta} minutos de T con «${PLANTILLAS.dar}» (tendría ${tiene}): sin la clave de la dueña no se puede`);
      continue;
    }
    const pide = (nueva ? minimo : 0) + falta;
    if (pide > queda) {
      fuera.add(cosa);
      paraLaDuena.push(`${nueva ? 'dar de alta a' : 'dar T a'} ${cosa} con ${pide} minutos de T (gasta ${n}): hoy a la dueña le quedan ${queda} minutos de T de minuto; otro día`);
      continue;
    }
    queda -= pide;
    if (nueva) minutos.set(cosa, minimo);
    if (falta > 0) dar.set(cosa, falta);
    if (pide > 0) sumar(dado, cosa, 'minuto', pide);
  }
  // Lo calculado: lo que quema cada cosa que se vuelca hoy, lo que quema la dueña al darla de alta y al darle T (el
  // coste de escribir, por posición: no depende de cuánto da) y lo que le da.
  const calculado = {};
  for (const [cosa, m] of medida) {
    if (fuera.has(cosa)) continue;
    juntar(calculado, m.quema);
    if (minutos.has(cosa)) juntar(calculado, m.alta);
    if (dar.has(cosa)) juntar(calculado, m.dar);
    if (dado[cosa]) sumar(calculado, duena, 'minuto', dado[cosa].minuto);
  }
  const pasos = conDar(plan.pasos.filter((p) => !fuera.has(p.cosa)), new Set(dar.keys()), duena);
  for (const p of plan.pasos.filter((x) => fuera.has(x.cosa))) noPuede.push({ paso: p, motivo: 'la cosa ' + p.cosa + ' no tiene hoy el T que gasta' });

  // 3. Escribir (o simular en una copia).
  const destino = opciones.simular ? await copia(eje) : eje;
  const r = await escribirPlan(destino, pasos, { duena, claves, corr, minutos, dar, t0 });
  const gastado = {};
  for (const { ev } of r.escritos) { const x = tDe(ev); juntar(gastado, x.quema); juntar(gastado, x.da); }
  for (const f of r.fallos) noPuede.push({ paso: f.paso, motivo: f.motivo });
  avisos.push(...r.discrepancias);
  const escritos = r.escritos.map(({ paso, ev }) => ({ tipo: paso.tipo, quien: paso.quien, cosa: paso.cosa, ...(paso.fila ? { fila: paso.fila } : {}), ...(paso.proyecto && !paso.fila ? { proyecto: paso.proyecto } : {}), plantilla: PLANTILLAS[paso.tipo] ?? PLANTILLAS.registro, id: ev.id }));
  return {
    simulado: Boolean(opciones.simular), escritos, sinCambios: plan.sinCambios, avisos, noPuede, paraLaDuena,
    desaparecen: plan.desaparecen,
    t: { calculado, gastado, dado },
    eje: destino,
  };
}

/**
 * El modo personas (VG 17-11): cada casa es una persona invitada por la dueña (sin dar nada) que acepta con su clave y
 * gasta su propio T del día. Sin pasos «dar». Se mide en una copia lo que gasta cada una; lo que no le cabe hoy no se
 * escribe (noPuede: «otro día») y lo escribe una pasada de otro día. Sin la clave de la dueña (eje que exige firmas) no
 * se invita (paraLaDuena: «invitar a X»), salvo que ya haya una invitación suya sin aceptar; sin la clave de una casa,
 * sus filas van a noPuede («sin la clave de X»). Mismo informe que volcar.
 */
async function volcarPersonas(eje, tabla, corr, opciones) {
  const duena = opciones.duena ?? eje.obtener(eje.genesisId).autor;
  const claves = opciones.claves ?? {};
  const t0 = opciones.t ?? new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const plan = planear(eje, tabla, { duena, corr, filas: opciones.filas ? new Set([...opciones.filas].map(String)) : null });
  const avisos = [...plan.avisos];
  const paraLaDuena = [];
  const noPuede = [];
  const puedeInvitar = !eje.exigirFirmas || Boolean(claves.duena?.privada);
  const fuera = new Map(); // casa → el motivo por el que sus pasos no se escriben
  for (const casa of new Set(plan.pasos.map((p) => p.cosa))) {
    const nueva = plan.pasos.some((p) => p.cosa === casa && p.tipo === 'alta');
    if (eje.exigirFirmas && !claves.cosas?.[casa]?.privada) fuera.set(casa, 'sin la clave de ' + casa);
    else if (nueva && !puedeInvitar && !invitacionPendiente(eje, casa)) {
      fuera.set(casa, casa + ' no tiene alta: la dueña ha de invitarla');
      paraLaDuena.push('invitar a ' + casa);
    }
  }
  for (const paso of plan.pasos) if (fuera.has(paso.cosa)) noPuede.push({ paso, motivo: fuera.get(paso.cosa) });
  const pasos = plan.pasos.filter((p) => !fuera.has(p.cosa));
  // Lo que gasta cada casa (y la dueña al invitar), medido en una copia: lo que allí se escribe es lo que se escribirá.
  const medida = await escribirPlan(await copia(eje), pasos, { duena, claves, corr, minutos: new Map(), t0 });
  const calculado = {};
  for (const { ev } of medida.escritos) juntar(calculado, tDe(ev).quema);
  // Escribir (o simular en una copia).
  const destino = opciones.simular ? await copia(eje) : eje;
  const r = await escribirPlan(destino, pasos, { duena, claves, corr, minutos: new Map(), t0 });
  const gastado = {};
  for (const { ev } of r.escritos) { const x = tDe(ev); juntar(gastado, x.quema); juntar(gastado, x.da); }
  const sinT = (m) => /T del día agotado|más del que le queda hoy/i.test(m);
  for (const fallo of r.fallos) {
    noPuede.push({ paso: fallo.paso, motivo: sinT(fallo.motivo) ? 'a ' + fallo.paso.quien + ' no le llega hoy su T: otro día' : fallo.motivo });
  }
  avisos.push(...r.discrepancias);
  const escritos = r.escritos.map(({ paso, ev }) => ({ tipo: paso.tipo, quien: paso.tipo === 'invitacion' ? duena : paso.tipo === 'alta' ? paso.cosa : paso.quien, cosa: paso.cosa, ...(paso.fila ? { fila: paso.fila } : {}), ...(paso.proyecto && !paso.fila ? { proyecto: paso.proyecto } : {}), plantilla: paso.tipo === 'invitacion' ? 'invitation' : paso.tipo === 'alta' ? 'alta' : PLANTILLAS[paso.tipo] ?? PLANTILLAS.registro, id: ev.id }));
  return {
    simulado: Boolean(opciones.simular), escritos, sinCambios: plan.sinCambios, avisos, noPuede, paraLaDuena,
    desaparecen: plan.desaparecen,
    t: { calculado, gastado, dado: {} },
    eje: destino,
  };
}

// ---------- el informe ----------

const tTexto = (porQuien) => Object.entries(porQuien).map(([q, e]) => q + ' ' + Object.entries(e).map(([k, n]) => n + ' ' + k).join(' + ')).join(' · ') || 'nada';

/** El informe en unas líneas. */
export function pintar(inf) {
  const porTipo = {};
  for (const e of inf.escritos) porTipo[e.tipo] = (porTipo[e.tipo] ?? 0) + 1;
  const l = [];
  l.push((inf.simulado ? 'SIMULADO (no se escribe nada): escribiría ' : 'escritos: ') + inf.escritos.length + ' registros' + (inf.escritos.length ? ' (' + Object.entries(porTipo).map(([k, n]) => n + ' ' + k).join(', ') + ')' : ''));
  l.push('sin cambios: ' + inf.sinCambios.length + ' filas');
  l.push('T calculado: ' + tTexto(inf.t.calculado));
  l.push('T ' + (inf.simulado ? 'que gastaría' : 'gastado') + ': ' + tTexto(inf.t.gastado));
  if (Object.keys(inf.t.dado).length) l.push('la dueña da: ' + tTexto(inf.t.dado));
  if (inf.avisos.length) l.push('avisos (' + inf.avisos.length + '):', ...inf.avisos.map((a) => '  - ' + a));
  if (inf.noPuede.length) {
    const porMotivo = {};
    for (const x of inf.noPuede) porMotivo[x.motivo] = (porMotivo[x.motivo] ?? 0) + 1;
    l.push('no puede (' + inf.noPuede.length + '):', ...Object.entries(porMotivo).map(([m, n]) => '  - ' + n + ' × ' + m));
  }
  if (inf.paraLaDuena.length) l.push('queda para la dueña:', ...inf.paraLaDuena.map((a) => '  - ' + a));
  return l.join('\n');
}

// ---------- la línea de órdenes ----------

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

function argumentos(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (!k.startsWith('--')) throw new Error('argumento suelto: ' + k);
    if (k === '--simular') a.simular = true;
    else a[k.slice(2)] = argv[++i];
  }
  return a;
}

const dentroDelRepo = (ruta) => { const r = relative(RAIZ, resolve(ruta)); return !r.startsWith('..') && !isAbsolute(r); };

async function principal(argv) {
  const a = argumentos(argv);
  if (!a.tabla) throw new Error('falta --tabla <ruta>');
  const tabla = JSON.parse(readFileSync(resolve(a.tabla), 'utf8'));
  const correspondencia = JSON.parse(readFileSync(resolve(a.correspondencia ?? join(RAIZ, 'ejemplos', 'volcado', 'correspondencia-roadmap.json')), 'utf8'));
  let claves = { cosas: {} };
  if (a.claves) {
    if (dentroDelRepo(a.claves)) throw new Error('las claves no se leen de dentro del repositorio');
    claves = JSON.parse(readFileSync(resolve(a.claves), 'utf8'));
  } else if (!a.simular) throw new Error('sin --claves solo se puede simular (--simular)');
  if (!a.simular && !a.salida) throw new Error('falta --salida <ruta> para guardar el eje escrito');
  const corr = correspondenciaDe(correspondencia);
  const duena = claves.duena?.identidad ?? a.duena ?? 'duena';
  // Sin claves (simulando): claves de prueba en memoria para la dueña y cada cosa de la tabla.
  if (!a.claves) {
    claves.duena = { identidad: duena, privada: (await generarClaves()).privada };
    for (const f of tabla) { const c = String(corr.nombres[f?.[corr.columnas.cosa]] ?? f?.[corr.columnas.cosa]); claves.cosas[c] ??= await generarClaves(); }
  }
  for (const [c, k] of Object.entries(claves.cosas ?? {})) if (k?.privada && !k.publica) claves.cosas[c] = { ...k, publica: publicaDe(k.privada) };
  const t = a.t ?? new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const eje = a.eje
    ? await restaurar(JSON.parse(readFileSync(resolve(a.eje), 'utf8')))
    : await Eje.genesis({ identidad: duena, foco: [duena], t: masSegundos(t, -1), clave: publicaDe(claves.duena.privada), privada: claves.duena.privada, exigirFirmas: true });
  const inf = await volcar(eje, tabla, { duena, claves, correspondencia, t, simular: Boolean(a.simular) });
  console.log((a.eje ? '' : 'eje local vacío (solo el génesis de ' + duena + ')\n') + pintar(inf));
  if (!a.simular) {
    writeFileSync(resolve(a.salida), JSON.stringify(serializar(inf.eje)) + '\n');
    console.log('eje guardado en ' + resolve(a.salida));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  principal(process.argv.slice(2)).catch((e) => { console.error('volcar: ' + e.message); process.exitCode = 1; });
}
