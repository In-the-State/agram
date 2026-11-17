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

import { contrato, acciones } from '../src/index.js';
import { PLANTILLAS_DEL_PUENTE as PL, saldosDe, planDeSalida, pruebaParaTraer, clavesDeLineaDe, sinSello } from '../datos/epocas/puente.mjs';
import * as cuentas from './cuentas.js';
import { enviar, motivosEnLlano } from './carta.js';

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
/** El nivel de firmeza que pide traer en `eje` (epoch.8.9.2; 4 si no lo dice), como leerTraido. */
const nivelDelPuente = (eje) => Number(hoja(eje?.epoca?.()?.registro?.[8]?.[9]?.[2])) || 4;
/** Las familias que cruzan como token en `eje` (epoch.8.9.1). */
const familiasDelPuente = (eje) => [].concat(eje?.epoca?.()?.registro?.[8]?.[9]?.[1] ?? []).flat(Infinity).filter((x) => typeof x === 'string');

/** ¿Se ofrece `nombre` sobre X a `yo`? (el 2 de su plantilla en el punto de vista de su 8; RP4 para enviar y traer). */
function ofrecida(eje, X, nombre, yo, o = {}) {
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

// ---------- los sellos guardados (sección 0) ----------

/**
 * Pone en `eje` las décuplas de sello que la sincronía de ese libro guardó en este navegador (cuentas.estadoSincronia(alta):
 * Sincronia#serializar las lleva; Sincronia.restaurar no las devuelve al eje). eje.marcarSello comprueba su forma y, si el
 * eje ya tiene ese sello sin décupla, se la añade; no las da por verificadas. → cuántas décuplas había guardadas.
 */
export function sellosGuardados(eje, alta) {
  const datos = alta ? cuentas.estadoSincronia(alta) : null;
  let n = 0;
  for (const par of Array.isArray(datos?.sellos) ? datos.sellos : []) {
    const [id, e] = Array.isArray(par) ? par : [];
    if (typeof id !== 'string' || !e || typeof e !== 'object' || !Array.isArray(e.decupla)) continue;
    try {
      eje.marcarSello(id, { altura: e.altura, hash: e.hash, instante: e.instante, decupla: e.decupla });
      n += 1;
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
    const { prueba } = pruebaParaTraer(eje, p.id, { lineas: claves, nivel: nivelDelPuente(eje) });
    if (prueba) sellos.set(p.id, prueba);
  }
  return sellos;
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
  const elegido = puntos.includes(punto) ? punto : 'vigente';
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
 * que cuelga de ese libro desde mi alta (`elemento`), o, si todavía no escribe de qué cuelga, el que se llama `nombre` (el
 * foco con que nació). El más reciente si hay varios. → la entrada o null.
 */
export function entradaDeLaSalida(entradas, { publica, libro, elemento, nombre } = {}) {
  const mias = (Array.isArray(entradas) ? entradas : []).filter((e) => e && typeof e.alta === 'string' && cuentas.mismaClave(e.publica, publica) && e.libro !== libro);
  const colgado = mias.filter((e) => e.cuelga?.libro === libro && e.cuelga?.elemento === elemento).at(-1);
  return colgado ?? mias.filter((e) => !e.cuelga && nombre && e.nombre === nombre).at(-1) ?? null;
}

/**
 * El paso del génesis: abre el libro nuevo con mi clave y la época que da el plan (la del viejo por referencia en el punto
 * elegido), por el camino de abrirLibroPrivado (cuentas.crearCuenta con `conClave`, la misma identidad) y lo guarda como otro
 * libro de esta cuenta, sin cambiar el abierto («Tus libros»). Con guardián, su firmante. → { cuenta, eje, privada?,
 * firmante? }; si crear falla, lanza (nada se guarda).
 */
export async function abrirLibroDeSalida({ cuenta, privada, guardian = null, paso, t, idioma } = {}) {
  if (paso?.que !== 'genesis' || paso.estado !== 'listo') throw new Error('el paso no es abrir el libro nuevo');
  const { identidad, foco, epoca } = paso.params;
  const conClave = guardian ? { publica: cuenta.publica } : { publica: cuenta.publica, privada };
  const creado = await cuentas.crearCuenta({ nombre: String(hoja(foco)), idioma: idioma ?? cuenta.idioma, conClave, epoca, identidad, ...(guardian ? { guardian, dialogo: true } : {}), ...(t ? { t } : {}) });
  await cuentas.guardarCuenta({ cuenta: creado.cuenta, eje: creado.eje, privada: creado.privada }, { recordar: false });
  return { cuenta: cuentas.entradaDe(creado.cuenta, creado.eje), eje: creado.eje, ...(guardian ? { firmante: creado.firmante } : { privada: creado.privada }) };
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
