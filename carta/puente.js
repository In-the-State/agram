// «Irme con lo mío» y el puente entre mis libros abiertos, en la carta (encargo «carta: irme con lo mío y el puente», Core
// AGRAM 17-11; docs/notas/PUENTE.md §9, §10.4 y §11; agram-equipo/DISENO_TRAMO_4.md §4). Sin DOM: lo que enseñan las vistas
// (carta/dom.js htmlSalida, htmlPuente) y lo que escriben, por el camino de siempre (carta.js enviar: acciones.transaccion,
// firmada y asentada; la app guarda y sincroniza después).
//
// Nada se decide aquí. La salida es planDeSalida y saldosDe (datos/epocas/puente.mjs): lo que me llevo, lo que no y por qué,
// los pasos con su estado y lo que espera cada uno; la carta firma el primer paso «listo» tal cual y vuelve a pedir el plan.
// El puente es la lectura de la época: el grado de cada enlace (contrato.gradoDelEnlace), lo que se ofrece (acciones.acciones:
// RP4, nada por un enlace que no cuenta), lo traído (leerTraido), de qué bloqueos saca una vuelta (bloqueosDeLaVuelta) y
// cuánto queda por recibir (porRecibir). Las causas y esperas de puente.mjs vienen en español llano: se enseñan como vienen.
//
// De dónde salen los sellos (sección 0 del encargo): la prueba con que se trae un registro es la décupla de sello que su
// libro ya tiene de él (eje.sello(id).decupla, la que trae la sincronía de quien lo sella) y las claves de línea, las de
// «exterior settings» de su cuenta raíz (puente.mjs pruebaParaTraer, clavesDeLineaDe). La sincronía guarda las décuplas en
// su estado (agram.sync.estado.<alta>) pero, al restaurarse, no las vuelve a poner en el eje (src/sincronia.js restaurar):
// sellosGuardados las pone desde lo guardado en este navegador, sin pedir nada a nadie.
//
//   sellosGuardados(eje, alta)                      → pone en el eje las décuplas de sello guardadas con su sincronía
//   salidaDe(eje, yo, { punto, nuevo, nombre })     → la vista «Irme con lo mío»: lo que llevo, lo que no, los pasos
//   entradaDeLaSalida(entradas, { … })              → mi libro nuevo de la salida, si ya está en este dispositivo
//   abrirLibroDeSalida({ … })                       → el génesis del libro nuevo, como otro libro de esta cuenta
//   costeDelPaso(eje, paso) · firmarPaso(eje, paso, firmar)  → lo que cuesta un paso de escribir y firmarlo, por el camino de siempre
//   guardarLibroNuevo({ cuenta, eje })              → guarda el libro nuevo tras escribir en él (no es el abierto)
//   enlaceAlNuevo(viejo, yo, nuevo) · enlazarNuevo(…) → en el viejo, el enlace que cuenta hacia mi libro nuevo (para enviarle)
//   enlacesDelLibro(eje, yo, { mios })              → los enlaces a mis libros de este dispositivo: grado, si cuenta, fondo
//   loQueCruza(eje, yo)                             → lo mío que puede ir a otro libro (la familia del puente, disponible)
//   enviarAOtroLibro · traerDeOtroLibro · recibirDeOtroLibro → las tres escrituras del puente
//   traibles(destino, enlace, origen)               → lo que el otro libro tiene sellado y aún no está traído aquí
//   traidosDelLibro(eje, yo, { mios })              → lo traído, leído, y si se puede recibir y cuánto queda

import { contrato, acciones } from '../src/index.js';
import { claveToken, partirClave } from '../src/tokens.js';
import {
  PLANTILLAS_DEL_PUENTE as PL, ENLACES, ANCLA_DE_LO_TRAIDO, saldosDe, planDeSalida, leerTraido, bloqueosDeLaVuelta, registroComoDecupla,
  pruebaParaTraer, clavesDeLineaDe, paresDelEnlace, nivelMasBajoDe, porRecibir, sinSello, genesisComoDecupla,
} from '../datos/epocas/puente.mjs';
import { PARAMETROS } from './libros.js';
import * as cuentas from './cuentas.js';
import { enviar, motivosEnLlano, ceroDe } from './carta.js';

export { PL as PLANTILLAS, sinSello };

// ---------- utilidades ----------

const hoja = (x) => (Array.isArray(x) ? hoja(x[0]) : x);
const accionesDe = (r) => [].concat(r?.payload?.[4] ?? []);
const idiomaDe = (eje, yo, o = {}) => o.idioma ?? contrato.configuracion(eje, yo, o).language;
const quienEs = (eje, x, o) => (x ? contrato.legible(eje, x, ['identity'], o).texto : '');
const cuandoEs = (eje, x, o) => (x ? contrato.legible(eje, x, ['instant'], o).texto : '');
/** Una serie con su cantidad, en llano («3 pan de bea»), o la clave tal cual si no se lee. */
function serieEs(eje, serie, cantidad, o) {
  try {
    return contrato.legible(eje, { serie, cantidad }, null, o).texto || String(serie);
  } catch {
    return String(serie);
  }
}
/** Una serie con su cantidad, en llano, en el idioma de `idioma` (para la confirmación de la app). */
export const serieEnLlano = (eje, serie, cantidad, idioma) => serieEs(eje, serie, cantidad, { idioma });
/** El nivel de firmeza que pide traer en `eje` (epoch.8.9.2; 4 si no lo dice), como leerTraido. */
const nivelDelPuente = (eje) => Number(hoja(eje?.epoca?.()?.registro?.[8]?.[9]?.[2])) || 4;
/** Las familias que cruzan como token en `eje` (epoch.8.9.1). */
const familiasDelPuente = (eje) => [].concat(eje?.epoca?.()?.registro?.[8]?.[9]?.[1] ?? []).flat(Infinity).filter((x) => typeof x === 'string');

/** ¿Se ofrece `nombre` sobre X a `yo`? (el 2 de su plantilla en el punto de vista de su 8; RP4 para enviar y traer). */
function ofrecida(eje, X, nombre, yo, o = {}) {
  o = acciones.conEpoca(eje, o); // la época del libro por defecto (la de la 0 no trae sus acciones)
  const p = acciones.plantillaDeTransaccion(nombre, o);
  if (!p || !yo || !X) return false;
  try {
    return acciones.acciones(eje, X, Number(hoja(p[8])), yo, o).some((a) => a.nombre === nombre);
  } catch {
    return false;
  }
}

/** Lo que cuesta lanzar `nombre` sobre X con `valores` (acciones.ejecucion: la cuenta del formulario): { exigido, denominacion } o null. */
export function costeDe(eje, X, nombre, valores, yo, o = {}) {
  try {
    const e = acciones.ejecucion(eje, nombre, { X, ...valores }, yo, o);
    return e?.ok ? { exigido: e.exigido, denominacion: e.denominacion } : null;
  } catch {
    return null;
  }
}

/** Lanza `nombre` sobre X por el camino de siempre (carta.js enviar) → lo que da enviar, con los motivos en llano. */
async function escribir(eje, X, nombre, valores, yo, firmar, opciones = {}) {
  const r = await enviar(eje, X, nombre, valores, yo, firmar, opciones.t ? { t: opciones.t } : {});
  return { ...r, motivos: motivosEnLlano(r.motivos, eje) };
}

// ---------- la prueba para traer, en memoria ----------

/**
 * Lo que da pruebaParaTraer, guardado por libro de origen (su eje), id del registro y tamaño del eje de origen, con las
 * claves y el nivel pedidos: verificar las firmas de la cadena es lo caro, y la hoja se repinta a menudo. Solo vale
 * mientras el sello del registro sea el mismo (eje.sello(id) da el mismo objeto hasta que llega otro).
 */
const PRUEBAS = new WeakMap();
export function pruebaGuardada(origen, id, { lineas, nivel }) {
  if (!origen || typeof origen !== 'object') return { prueba: null, falta: 'sello' };
  let delLibro = PRUEBAS.get(origen);
  if (!delLibro) PRUEBAS.set(origen, (delLibro = new Map()));
  const llave = id + '|' + (origen.orden?.length ?? 0) + '|' + nivel + '|' + JSON.stringify(lineas ?? null);
  const sello = origen.sello?.(id) ?? null;
  const antes = delLibro.get(llave);
  if (antes && antes.sello === sello) return antes.r;
  const r = pruebaParaTraer(origen, id, { lineas, nivel });
  delLibro.set(llave, { sello, r });
  return r;
}

// ---------- los sellos guardados (sección 0) ----------

/**
 * Pone en `eje` las décuplas de sello que la sincronía de ese libro guardó en este navegador (cuentas.estadoSincronia(alta):
 * Sincronia#serializar las lleva), para los libros que la carta abre sin sincronía. eje.marcarSello comprueba su forma y,
 * si el eje ya tiene ese sello sin décupla, se la añade; no las da por verificadas. Solo donde el eje no tiene sello de
 * ese registro, o tiene ese mismo (misma altura y hash) sin décupla: lo guardado en el navegador nunca sustituye a un
 * sello que el eje ya tiene con su prueba. → cuántas puso.
 */
export function sellosGuardados(eje, alta) {
  const datos = alta ? cuentas.estadoSincronia(alta) : null;
  let n = 0;
  for (const par of Array.isArray(datos?.sellos) ? datos.sellos : []) {
    const [id, e] = Array.isArray(par) ? par : [];
    if (typeof id !== 'string' || !e || typeof e !== 'object' || !Array.isArray(e.decupla)) continue;
    try {
      const antes = eje.sello?.(id) ?? null;
      if (antes && (antes.decupla || antes.altura !== e.altura || antes.hash !== e.hash)) continue;
      eje.marcarSello(id, { altura: e.altura, hash: e.hash, instante: e.instante, decupla: e.decupla });
      if (eje.sello?.(id)?.decupla) n += 1;
    } catch { /* un sello mal guardado no para a los demás */ }
  }
  return n;
}

// ---------- «Irme con lo mío» (tramo 4, parte B) ----------

/**
 * Las pruebas de sello de las declaraciones ya firmadas en el libro viejo, para planDeSalida (`sellos`): de cada una, la
 * que el viejo ya tiene (pruebaParaTraer, con las claves de línea con que nacerá el enlace y el nivel que pide traer).
 */
function sellosDe(eje, plan, claves) {
  const sellos = new Map();
  for (const p of plan.pasos) {
    if (p.que !== 'declarar' || p.estado !== 'hecho' || !p.id) continue;
    const { prueba } = pruebaGuardada(eje, p.id, { lineas: claves, nivel: nivelDelPuente(eje) });
    if (prueba) sellos.set(p.id, prueba);
  }
  return sellos;
}

/** Lo que identifica una época cargada: su raíz fundida y los ids de sus registros (la misma versión da lo mismo). */
const huellaDeEpoca = (e) => (e ? JSON.stringify(e.registro ?? null) + '|' + [...(e.registros?.keys?.() ?? [])].sort().join(',') : null);

/**
 * Con qué versión del libro viejo `eje` nació mi libro nuevo `nuevo`: si ya escribe de qué cuelga, el punto que anota (el
 * registro que puso en vigor esa versión; sin punto, la de nacimiento); si no, la versión del viejo cuya época es la de
 * nacimiento del nuevo. → 'vigente' (la última), 'antes' (la anterior), el número de otra versión, o null si no se sabe.
 */
export function puntoDelNuevo(eje, nuevo) {
  const versiones = typeof eje?.versiones === 'function' ? eje.versiones() : [];
  if (!nuevo || !versiones.length) return null;
  let k = -1;
  const c = contrato.cuelgaDe(nuevo);
  if (c?.libro === eje.genesisId) k = c.punto ? versiones.findIndex((v) => v.registro === c.punto) : 0;
  if (k < 0) {
    const huella = huellaDeEpoca(nuevo.versiones?.()[0]?.version ?? nuevo.epoca?.());
    k = versiones.findLastIndex((v) => huellaDeEpoca(v.version) === huella);
  }
  if (k < 0) return null;
  return k === versiones.length - 1 ? 'vigente' : k === versiones.length - 2 ? 'antes' : k;
}

/**
 * La vista «Irme con lo mío» de `yo` en el libro `eje` (el viejo): todo de saldosDe y planDeSalida.
 * `opciones`: `punto` ('vigente', por defecto, o 'antes'); `nuevo`, el eje de mi libro nuevo si ya está abierto; `nombre`, el
 * del libro nuevo (su foco). Las claves de línea del viejo son las de su «exterior settings» (clavesDeLineaDe); las pruebas,
 * las décuplas de sello que el viejo ya tiene. → null si `yo` no tiene alta aquí; si no, { lleva: [{ serie, cantidad,
 * texto }], noSeLleva: [{ serie, cantidad, texto, causa }], puntos: ['vigente', 'antes'?], punto, pasos: [{ n, que, libro,
 * estado, espera, serie, texto, id }], siguiente (el primer paso «listo», con su plan), aparte, sinSello, claves, plan }.
 */
export function salidaDe(eje, yo, { punto = 'vigente', nuevo = null, nombre, idioma } = {}) {
  if (!eje?.alta?.(yo)) return null;
  const o = { idioma: idiomaDe(eje, yo, { idioma }) };
  const versiones = typeof eje.versiones === 'function' ? eje.versiones() : [];
  const puntos = versiones.length > 1 ? ['vigente', 'antes'] : ['vigente'];
  // Con el libro nuevo ya nacido, el punto es el suyo (puntoDelNuevo), no el que diga la hoja.
  const delNuevo = nuevo ? puntoDelNuevo(eje, nuevo) : null;
  const elegido = delNuevo ?? (puntos.includes(punto) ? punto : 'vigente');
  const claves = clavesDeLineaDe(eje);
  const pedir = (sellos) => planDeSalida(eje, yo, { punto: elegido, claves: claves.length ? claves : 0, nuevo, sellos, ...(nombre ? { foco: nombre } : {}) });
  const plan = pedir(sellosDe(eje, pedir(new Map()), claves));
  const declarar = plan.pasos.filter((p) => p.que === 'declarar');
  const cuanto = new Map(declarar.map((p) => [p.serie, p.params.quantity]));
  return {
    lleva: declarar.map((p) => ({ serie: p.params.series, cantidad: p.params.quantity, texto: serieEs(eje, p.params.series, p.params.quantity, o) })),
    noSeLleva: plan.noSeLleva.map((x) => ({ ...x, texto: serieEs(eje, x.serie, x.cantidad, o) })),
    puntos, punto: elegido,
    pasos: plan.pasos.map((p) => ({ n: p.n, que: p.que, libro: p.libro, estado: p.estado, espera: p.espera ?? null, serie: p.serie ?? null, id: p.id ?? null, texto: p.serie ? serieEs(eje, p.serie, cuanto.get(p.serie), o) : null })),
    siguiente: plan.pasos.find((p) => p.estado === 'listo') ?? null,
    aparte: plan.aparte,
    sinSello: sinSello(eje),
    claves: claves.length,
    plan,
  };
}

/**
 * Mi libro nuevo de la salida del libro `libro`, entre las entradas de este dispositivo (cuentas.cuentas()): el de mi clave
 * cuya entrada lleva la marca de esta salida (`salidaDe`: el génesis del viejo, que pone abrirLibroDeSalida) o, si no la
 * lleva (una entrada restaurada de antes), el que cuelga de ese libro desde mi alta (`elemento`). No se busca por nombre:
 * cambiarlo no hace nacer otro. El más reciente si hay varios. → la entrada o null.
 */
export function entradaDeLaSalida(entradas, { publica, libro, elemento } = {}) {
  const mias = (Array.isArray(entradas) ? entradas : []).filter((e) => e && typeof e.alta === 'string' && cuentas.mismaClave(e.publica, publica) && e.libro !== libro);
  return mias.filter((e) => e.salidaDe === libro).at(-1) ?? mias.filter((e) => e.cuelga?.libro === libro && e.cuelga?.elemento === elemento).at(-1) ?? null;
}

/**
 * El paso del génesis: abre el libro nuevo con mi clave y la época que da el plan (la del viejo por referencia en el punto
 * elegido), por el camino de abrirLibroPrivado (cuentas.crearCuenta con `conClave`, la misma identidad) y lo guarda como otro
 * libro de esta cuenta, sin cambiar el abierto («Tus libros»), con la marca `salidaDe` (el génesis del viejo, `viejo`) en su
 * entrada: por ella se encuentra después (entradaDeLaSalida). Con guardián, su firmante. → { cuenta, eje, privada?,
 * firmante? }; si crear falla, lanza (nada se guarda).
 *
 * Nace con el idioma del libro abierto, como abrirLibroPrivado: sus preferencias (un registro anclado en el 9 de su
 * génesis) no estorban a traer, porque las reglas del puente solo miran en el 9.d lo anclado exactamente ahí
 * (datos/epocas/puente.mjs, ancladoEnElGenesis).
 */
export async function abrirLibroDeSalida({ cuenta, privada, guardian = null, paso, viejo, t } = {}) {
  if (paso?.que !== 'genesis' || paso.estado !== 'listo') throw new Error('el paso no es abrir el libro nuevo');
  if (typeof viejo !== 'string' || !/^[0-9a-f]{64}$/.test(viejo)) throw new Error('falta el libro del que se sale');
  const { identidad, foco, epoca } = paso.params;
  const conClave = guardian ? { publica: cuenta.publica } : { publica: cuenta.publica, privada };
  const creado = await cuentas.crearCuenta({ nombre: String(hoja(foco)), idioma: cuenta.idioma, conClave, epoca, identidad, ...(guardian ? { guardian, dialogo: true } : {}), ...(t ? { t } : {}) });
  const marcada = { ...creado.cuenta, salidaDe: viejo };
  await cuentas.guardarCuenta({ cuenta: marcada, eje: creado.eje, privada: creado.privada }, { recordar: false });
  return { cuenta: cuentas.entradaDe(marcada, creado.eje), eje: creado.eje, ...(guardian ? { firmante: creado.firmante } : { privada: creado.privada }) };
}

/** Lo que cuesta un paso de escribir de la salida en su libro (`eje`), a la vista antes de confirmar, o null. */
export function costeDelPaso(eje, paso, opciones = {}) {
  if (!paso?.plantilla || !eje) return null;
  const { X, ...valores } = paso.params;
  return costeDe(eje, X, paso.plantilla, valores, paso.quien, opciones);
}

/** Un paso de escribir de la salida (declarar, cuelga, traer), tal cual lo da el plan, en su libro `eje`. → lo que da enviar. */
export async function firmarPaso(eje, paso, firmar, opciones = {}) {
  if (!paso?.plantilla || paso.estado !== 'listo') return { ok: false, asentado: null, motivos: [] };
  const { X, ...valores } = paso.params;
  return escribir(eje, X, paso.plantilla, valores, paso.quien, firmar, opciones);
}

/**
 * Guarda en este navegador el libro nuevo tras escribir en él (no es el abierto: nadie más lo guarda) y completa su entrada
 * con lo que dice su eje (de qué cuelga, cuentas.completarEntrada). → la entrada completada.
 */
export function guardarLibroNuevo({ cuenta, eje }) {
  cuentas.guardarEje({ alta: cuenta.alta }, eje);
  return cuentas.completarEntrada(cuenta, eje);
}

// ---------- enviar del libro viejo al nuevo (docs/notas/PUENTE.md §10.2 y §10.4) ----------

/**
 * El enlace que cuenta, en el libro viejo, hacia mi libro nuevo: un «open a private book here» sobre mi alta en el viejo (un
 * elemento mío) con el libro nuevo y sus claves de línea (clavesDeLineaDe; sin ellas, ninguna: se puede enviar, pero no
 * traer de vuelta). Si no soy el dueño del viejo, lleva en su 5 el génesis del nuevo (genesisComoDecupla): así cuenta el
 * de quien creó el libro (§10.2, «who created a book links it with its genesis»). → { hecho (el enlace que ya cuenta, si lo
 * hay), X, valores, ofrecido } o null si no tengo alta en el viejo o no hay libro nuevo.
 */
export function enlaceAlNuevo(viejo, yo, nuevo) {
  const alta = viejo?.alta?.(yo);
  if (!alta || !nuevo?.genesisId) return null;
  const ya = contrato.librosPrivados(viejo, alta.id, { puente: true }).find((l) => l.libro === nuevo.genesisId && l.cuenta);
  const lineas = clavesDeLineaDe(nuevo);
  const dueno = viejo.obtener(viejo.genesisId)?.autor === yo;
  // Un génesis que no se puede rehacer (con campos propios, o de demostración sin clave) no lo enlaza su creador: sinGenesis.
  const g = dueno ? null : genesisComoDecupla(nuevo.obtener(nuevo.genesisId));
  const valores = { [PARAMETROS.libro]: nuevo.genesisId, [PARAMETROS.claves]: lineas.length ? lineas : 0, ...(g ? { [PARAMETROS.genesis]: g } : {}) };
  return { hecho: ya?.id ?? null, X: alta.id, valores, sinGenesis: !dueno && !g, ofrecido: ofrecida(viejo, alta.id, ENLACES.abrir, yo) };
}

/** Lo que cuesta escribir el enlace al nuevo en el viejo, o null. */
export function costeDelEnlaceAlNuevo(viejo, yo, nuevo, o = {}) {
  const e = enlaceAlNuevo(viejo, yo, nuevo);
  return e && !e.hecho && !e.sinGenesis ? costeDe(viejo, e.X, ENLACES.abrir, e.valores, yo, o) : null;
}

/** Escribe en el viejo el enlace al nuevo (enlaceAlNuevo), por el camino de siempre. → lo que da enviar. */
export async function enlazarNuevo(viejo, yo, nuevo, firmar, opciones = {}) {
  const e = enlaceAlNuevo(viejo, yo, nuevo);
  if (!e || e.hecho || e.sinGenesis) return { ok: false, asentado: null, motivos: [] };
  return escribir(viejo, e.X, ENLACES.abrir, e.valores, yo, firmar, opciones);
}

// ---------- el puente entre mis libros abiertos (paso 3 del plan del puente) ----------

/** El libro que nombra un enlace (el 1.0.0 de «open a private book here», el 1.0 de «this book hangs from»). */
const libroDelEnlace = (r) => hoja(r?.payload?.[1]);

/**
 * Lo bloqueado por un enlace (su fondo, docs/notas/PUENTE.md §10.4): de cada quien que envió por él y cada serie, lo que
 * sigue bloqueado con la salida en él (eje.bloqueado(quien, serie, enlace)). → [{ quien, serie, cantidad }].
 */
export function fondoDe(eje, enlace) {
  const vistos = new Map();
  for (const ev of eje.sobre(enlace, '4000000000')) {
    if (!accionesDe(ev).includes(PL.enviar)) continue;
    for (const m of ev.movimientos ?? []) if (m.estado === 'bloqueo' && m.salida === enlace) vistos.set(m.de + '\u0000' + claveToken(m), [m.de, claveToken(m)]);
  }
  return [...vistos.values()].map(([quien, serie]) => ({ quien, serie, cantidad: eje.bloqueado(quien, serie, enlace) })).filter((x) => x.cantidad > 0);
}

/**
 * Los enlaces de `eje` a mis libros de este dispositivo (`mios`: las entradas de mi clave, { alta, libro, nombre }): cada
 * «open a private book here» y «this book hangs from» con su grado, si cuenta y el del dueño (contrato.gradoDelEnlace), las
 * claves que anota (su nivel más bajo, nivelMasBajoDe), el fondo bloqueado por él y qué se ofrece por él (enviar, traer:
 * acciones.acciones, que no ofrece nada por un enlace que no cuenta). Solo los de libros míos de aquí: el puente de la
 * carta va entre los libros que esta cuenta tiene abiertos.
 */
export function enlacesDelLibro(eje, yo, { mios = [], idioma } = {}) {
  const o = { idioma: idiomaDe(eje, yo, { idioma }) };
  const fuera = [];
  for (const id of eje.orden ?? []) {
    const r = eje.obtener(id);
    const a = accionesDe(r);
    if (!a.includes(ENLACES.abrir) && !a.includes(ENLACES.cuelga)) continue;
    const libro = libroDelEnlace(r);
    const mio = mios.find((e) => e.libro === libro);
    if (!mio || libro === eje.genesisId) continue;
    const g = contrato.gradoDelEnlace(eje, id) ?? {};
    fuera.push({
      id, libro, nombre: mio.nombre ?? String(libro).slice(0, 8), alta: mio.alta, tipo: a.includes(ENLACES.abrir) ? 'abre' : 'cuelga',
      quien: r.autor, quienTexto: quienEs(eje, r.autor, o), cuando: cuandoEs(eje, r.t, o),
      grado: g.grado ?? null, cuenta: g.cuenta === true, delDueno: g.delDueno ?? null,
      claves: paresDelEnlace(r).length, nivelMasBajo: nivelMasBajoDe(r),
      fondo: fondoDe(eje, id).map((f) => ({ ...f, quienTexto: quienEs(eje, f.quien, o), texto: serieEs(eje, f.serie, f.cantidad, o) })),
      enviar: ofrecida(eje, id, PL.enviar, yo, o), traer: ofrecida(eje, id, PL.traer, yo, o),
    });
  }
  return fuera;
}

/**
 * Lo mío en `eje` que puede ir a otro libro: de saldosDe, las series de una familia que cruza (epoch.8.9.1) con algo
 * disponible. Una serie forastera (su emisor, «<libro>:…») solo vuelve a su libro de origen: `soloA` lo dice.
 * → [{ serie, disponible, texto, soloA }].
 */
export function loQueCruza(eje, yo, { idioma } = {}) {
  const o = { idioma: idiomaDe(eje, yo, { idioma }) };
  const familias = familiasDelPuente(eje);
  return saldosDe(eje, yo).filter((s) => familias.includes(s.familia) && s.disponible > 0).map((s) => {
    const emisor = partirClave(s.serie)?.emisor ?? '';
    const k = String(emisor).indexOf(':');
    return { serie: s.serie, disponible: s.disponible, texto: serieEs(eje, s.serie, s.disponible, o), soloA: k > 0 ? emisor.slice(0, k) : null };
  });
}

/**
 * A qué libros se puede enviar `c` (una fila de loQueCruza) entre `enlaces` (los de enlacesDelLibro): los que ofrecen enviar
 * y, para una serie forastera, solo el de su libro de origen. → [{ enlace, libro, nombre, grado, quien }].
 */
export function destinosDeEnvio(enlaces, c) {
  if (!c) return [];
  return (enlaces ?? []).filter((l) => l.enviar && (!c.soloA || l.libro === c.soloA)).map((l) => ({ enlace: l.id, libro: l.libro, nombre: l.nombre, grado: l.grado, quien: l.quienTexto || l.quien }));
}

/** Lo que cuesta enviar `cantidad` de `serie` por `enlace` a la clave `publica`, o null. */
export function costeDelEnvio(eje, yo, { enlace, serie, cantidad, publica }, o = {}) {
  return costeDe(eje, enlace, PL.enviar, { series: serie, quantity: Number(cantidad), to: publica }, yo, o);
}

/** «send to another book» por `enlace`: `cantidad` de `serie`, a la clave `publica` (la mía: mis libros). → lo que da enviar. */
export function enviarAOtroLibro(eje, yo, { enlace, serie, cantidad, publica, firmar, t } = {}) {
  return escribir(eje, enlace, PL.enviar, { series: serie, quantity: Number(cantidad), to: publica }, yo, firmar, { t });
}

/** Los ids de los registros ya traídos a `destino` del libro `libro` (los «bring a record» del 9.8 de su génesis). */
function yaTraidos(destino, libro) {
  return new Set(destino.sobre(destino.genesisId, ANCLA_DE_LO_TRAIDO).filter((r) => accionesDe(r).includes(PL.traer) && hoja(r.payload?.[1]?.[0]) === libro).map((r) => hoja(r.payload?.[1]?.[1]?.[0])));
}

/**
 * Lo que el libro `origen` tiene sellado y se puede traer a `destino` por `enlace` (su id en `destino`): los registros del
 * origen (sin el génesis, que no se trae) con prueba de sello que alcanza (pruebaParaTraer, con las claves que anota el
 * enlace y el nivel que pide `destino`) y que aún no están traídos aquí, lo más nuevo arriba, como mucho `max`. → { lista:
 * [{ id, autor, quien, cuando, titulo }], esperan (cuántos esperan su sello), sinSello (puente.mjs sinSello del origen) }.
 */
export function traibles(destino, enlace, origen, { max = 30, idioma } = {}) {
  const r = destino.obtener(enlace);
  const lineas = paresDelEnlace(r);
  const nivel = nivelDelPuente(destino);
  const ya = yaTraidos(destino, origen.genesisId);
  const o = { idioma: idiomaDe(origen, null, { idioma }) };
  const lista = [];
  let esperan = 0;
  for (const id of [...(origen.orden ?? [])].reverse()) {
    if (id === origen.genesisId || ya.has(id)) continue;
    const { prueba } = pruebaGuardada(origen, id, { lineas, nivel });
    if (!prueba) { esperan += 1; continue; }
    if (lista.length >= max) continue;
    const ev = origen.obtener(id);
    lista.push({ id, autor: ev.autor, quien: quienEs(origen, ev.autor, o), cuando: cuandoEs(origen, ev.t, o), titulo: String(ceroDe(origen, id, o, hoja(ev.payload?.[0]) ?? '') ?? '') });
  }
  return { lista, esperan, sinSello: sinSello(origen) };
}

/** «bring a record from another book»: el registro `id` de `origen`, con su prueba de sello, por `enlace`. → lo que da enviar. */
export function traerDeOtroLibro(destino, yo, { enlace, origen, id, firmar, t } = {}) {
  const ev = origen?.obtener?.(id);
  const { prueba } = ev ? pruebaGuardada(origen, id, { lineas: paresDelEnlace(destino.obtener(enlace)), nivel: nivelDelPuente(destino) }) : { prueba: null };
  if (!ev || !prueba) return Promise.resolve({ ok: false, asentado: null, motivos: [], sinPrueba: true });
  return escribir(destino, enlace, PL.traer, { record: registroComoDecupla(ev), proof: prueba }, yo, firmar, { t });
}

/** Lo que cuesta traer `id` de `origen` por `enlace`, o null. */
export function costeDeTraer(destino, yo, { enlace, origen, id }, o = {}) {
  const ev = origen?.obtener?.(id);
  const { prueba } = ev ? pruebaGuardada(origen, id, { lineas: paresDelEnlace(destino.obtener(enlace)), nivel: nivelDelPuente(destino) }) : { prueba: null };
  return prueba ? costeDe(destino, enlace, PL.traer, { record: registroComoDecupla(ev), proof: prueba }, yo, o) : null;
}

/**
 * Lo traído a `eje`, leído (leerTraido), lo más nuevo arriba: de qué libro vino (su nombre si es mío), quién lo escribió allí,
 * cuándo quedó en firme, por qué enlace, su grado, si es del dueño y el nivel más bajo de ese enlace. Si no es fiable, su
 * causa (como viene) y ni su contexto ni sus movimientos. Si es un envío: cuánto queda por recibir (porRecibir) y si `yo`
 * puede recibirlo (acciones.acciones).
 */
export function traidosDelLibro(eje, yo, { mios = [], idioma } = {}) {
  const o = { idioma: idiomaDe(eje, yo, { idioma }) };
  const lista = eje.sobre(eje.genesisId, ANCLA_DE_LO_TRAIDO).filter((r) => accionesDe(r).includes(PL.traer));
  return lista.reverse().map((r) => {
    const l = leerTraido(eje, r.id);
    if (!l) return null;
    const mio = mios.find((e) => e.libro === l.libro);
    const envio = porRecibir(eje, r.id);
    return {
      traido: r.id, libro: l.libro, libroNombre: mio?.nombre ?? null, id: l.id, autor: l.autor, t: l.t, firme: l.firme,
      enlace: l.enlace, quien: l.quien, grado: l.grado, cuenta: l.cuenta, delDueno: l.delDueno, nivelMasBajo: l.nivelMasBajo, origen: l.origen,
      fiable: l.fiable, causa: l.causa,
      payload: l.payload, contexto: l.fiable ? l.contexto : null, movimientos: l.fiable ? l.movimientos : null,
      envio, recibir: Boolean(envio && envio.queda > 0 && ofrecida(eje, r.id, PL.recibir, yo, o)),
    };
  }).filter(Boolean);
}

/**
 * «receive from another book» sobre lo traído `id`: la ida, sin más; la vuelta, nombrando de qué bloqueos saca la parte
 * siguiente (bloqueosDeLaVuelta, el más antiguo primero). → lo que da enviar.
 */
export function recibirDeOtroLibro(eje, yo, { id, firmar, t } = {}) {
  const locks = bloqueosDeLaVuelta(eje, id);
  return escribir(eje, id, PL.recibir, locks?.length ? { locks } : {}, yo, firmar, { t });
}

/** Lo que cuesta recibir lo traído `id`, o null. */
export function costeDeRecibir(eje, yo, { id }, o = {}) {
  const locks = bloqueosDeLaVuelta(eje, id);
  return costeDe(eje, id, PL.recibir, locks?.length ? { locks } : {}, yo, o);
}

