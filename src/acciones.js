// Las acciones del aro (encargo 3c-2a): la mitad de acción del contrato entre el núcleo y la pantalla.
// Principio (VG): nada hardcodeado en la pantalla ni negocio en JavaScript que pueda ser una regla o un dato de la
// época. Cada acción del aro es una PLANTILLA DE TRANSACCIÓN, un registro de la época (epoch.9.6, la lista de
// referencias a datos/epocas/plantillas/<nombre>.json) con el molde de regla adaptado:
//
//   0 nombre (inglés)        1 parámetros que pide (cada uno como una posición de una plantilla de datos: 0 etiqueta,
//                              1 tipo, 2 validación «=…» con it = el valor, 4 qué se hace con él, 5 dónde va en el
//                              registro, 7 required u optional, 9 defectos y ayuda; un defecto «=…» se lee sobre it = X,
//                              me y la candidata ev. Su 4 es «payload», o «key {p}» / «proof {p}»: la clave pública que
//                              el registro declara para la identidad que da el parámetro p y su prueba de posesión,
//                              fuera del payload: así da de alta una cosa con su clave, encargo core-escribe)
//   2 cuándo se ofrece       BQL mínimo con it = X y me = la identidad que mira (el nombre `me` del contexto)
//   3 quién la lanza         (VG 12-11, #71.1: 3.0 quién, «me»; 3.1 su modo de ejecución, si puede lanzarla un agente: «person»
//                              [defecto: solo una persona], «agent» [un agente de AARPIA escribiendo como identidad: una cosa que su
//                              dueño declaró agente, epoch.9.0.4] o
//                              «system» [el sistema solo; exige una revisión del dueño de la época, epoch.9.0.4])
//                            4 lo que mueve (VG 12-11, decisiones 5 a 7 del estudio BQL-transacciones): las sentencias
//                              «=…» del BQL mínimo con los cinco verbos (mint transfer lock release burn), una por
//                              ocupante, evaluadas en orden (bqlm.evaluarPlantilla); «write» si no mueve nada más que el
//                              coste de escribir (la regla de la época «the cost of writing», que transaccion cobra a
//                              toda candidata); «read» si solo lee; «path» si lanza el camino. La lista de antes (un
//                              movimiento por décupla) se retiró al fundir con PV3: las dos vías daban lo mismo
//   5 dónde ancla            el dígito (o camino, con huecos {parámetro}) de X y, si no es X, el registro
//   6 procedencia  7 época  8 [punto de vista, orden] (la primera de cada uno es la acción por defecto)  9 mensaje
//
//   acciones(eje, X, k, yo)                 las plantillas del punto de vista k cuya condición pasa para yo sobre X
//   transaccion(eje, plantilla, params, yo) construye la transacción y la valida en seco: { ok, evento, motivos, ejecucion }
//   ejecucion(eje, plantilla, params, yo)   lo que exige en T cada parte y la denominación propuesta (el 4 ejecuta; decisión 7)
//   sobreDe(eje, plantilla, params, yo)     el registro del que colgará lo que escribe (X o el que nombra su 5): la línea de antes de firmar
//   enlazaDe(eje, plantilla, params, yo)    los registros que enlazará (los que su payload nombra, menos del que cuelga): a quién más va
//   camino(eje, X, yo)                      lo que falta: lo del tutorial, lo que derivan las reglas, las sugerencias
//   hechoPorMi(eje, plantilla, X, yo)       ¿hay un registro mío, o de una cosa mía, en su ancla? (la regla de un paso del tutorial)
//   autoejecutar(eje, X, yo, firmar)        lanza los pasos míos en orden mientras pasen
//   modoDeEjecucion(eje, plantilla)         su modo de ejecución: { declarado, modo, revisado } (system sin revisión se lee agent)
//   esAgente(eje, identidad)                ¿es una cosa que su dueño declaró agente? (no lanza las plantillas «person»)
//   estaciones(eje, X)                      lo anunciado en X por estación (E pagar, P decidir, R atender, T trabajar)
//   ejecuciones(eje, X)                     la fábrica de X para la matriz del 4: cada ejecución con su PV, su posición y su estación
//   segundoFactor(eje, X)                   ¿espera X su segundo factor? (VG 12/13-11, #66, #70: las lecturas X.6.8.7 y X.6.8.8)
//   criteriosDeSegundoFactor(eje, yo)       los criterios «second factor» de yo (el 2.4 de su alta)
//   autorizar(eje, idPropuesta, cosa, { firmar, privada, t }) construye y firma la autorización de la cosa titular: la firma el firmante
//                                           inyectado (el guardián de StateArk) o, por defecto, la clave privada en local (también autorizar(eje, id, cosa, priv, { t }))
//
// Aquí no se decide nada: si una acción no se ofrece, lo dice su 2; qué mueve, su 4; dónde ancla, su 5. Este módulo
// solo sabe leer el molde y construir el evento. No asienta nada: la carta firma y asienta con lo que ya existe
// (eje.anadir); autoejecutar lo hace con la firma que le pasa la carta. Documentación: docs/CONTRATO.md, «Acciones».

import { epocaDelEje, EPOCA_0_BTML } from './epocas.js';
import { ContextoEje } from './contexto-eje.js';
import { evaluar, rellenar, nombreDeRegla, evaluarPlantilla, POR_LIMITE, esFormula } from './bqlm.js';
import { crearEvento, canonico as canonicoDe, cuerpo as cuerpoDe } from './evento.js';
import { partirClave, validarMovimiento, ESCALAS_INFORMATIVAS, ESCALAS_REALES, SEGUNDOS, ANUNCIADO, esAnunciado, claveToken } from './tokens.js';
import { exigido as exigidoDe, tDelCoste, escalaQueAlcanza, REGLA_DEL_COSTE, quemaDelCoste } from './escritura.js';
import { firmar as firmarEvento } from './autoridad.js';
import { escalaQueCubre, ESCALA_MINIMA_PROPUESTA } from './tiempo.js';
import { contarPosiciones } from './modos.js';
import { direccion, esReferencia, esDecupla } from './btml.js';
import { plantilla as plantillaDeDatos, etiqueta as etiquetaDe, ocupantes as ocupantesDeContrato, nombreDePlantilla, madurez, niveles as nivelesGenericos, configuracion, mensaje, legible, texto as textoDe, claves, motivo as motivoDe, guia as guiaDeLaEpoca, desdeLegible, anclaDeLasOpiniones, celdaDeEjecucion, configuracionDe, clavesDeConfiguracionDe, enlacesDe, gradoDelEnlace } from './contrato.js';
import { recuento, cerrado as cerradoDe, pasosDeLasReglas } from './motor.js';
import { resolverTipo, valeElValor } from './tipos.js';

const RE_ID = /^[0-9a-f]{64}$/;

/** Las plantillas del puente que se lanzan sobre un enlace y solo valen por uno que cuente (RP4; datos/epocas/puente.mjs). */
const PLANTILLAS_POR_UN_ENLACE = Object.freeze(['send to another book', 'bring a record from another book']);

// ---------- la época y sus sitios ----------

/**
 * La época que se lee (VG, 14-11, #107: la época vive en el eje): la que se pasa en las opciones (un objeto de
 * cargarEpocaBtml), si no la del eje (eje.epoca(): la escrita en su libro o la 0 que trae el código), si no la 0.
 */
const epocaDe = (opciones, eje) => opciones?.epoca ?? (eje ? epocaDelEje(eje) : EPOCA_0_BTML);
/** Las opciones con la época del eje, si no traen una (lo que pasa una entrada con eje a las que no lo tienen). */
const conEpoca = (eje, opciones) => (opciones?.epoca || typeof eje?.epoca !== 'function' || eje.epoca() === EPOCA_0_BTML ? opciones : { ...opciones, epoca: eje.epoca() });
const raizDe = (epoca) => (Array.isArray(epoca) ? epoca : epoca.registro ?? epoca.payload);
/** Dónde pone la época lo que este módulo lee. */
const SITIO = Object.freeze({
  acciones: [9, 6], // la lista de referencias a las plantillas de transacción
  estaciones: [4, 2], // [[familia], [qué se hace], [la plantilla que cumple un movimiento anunciado]]
  estacionesDelAnuncio: [4, 3], // [[nombre], [lo que la comprueba: una fórmula con it = el anuncio, o epoch.9.0.0]] (VG 12-11, decisión 8)
  identidad: [3, 0], // la plantilla de identidad: su 9 es el tutorial del alta
  revisiones: [9, 0, 4, 1], // las lecturas de revisión del modo de ejecución: [[nombre], [fórmula]] (VG 12-11, #71.1)
});
const en = (raiz, camino) => camino.reduce((n, d) => (Array.isArray(n) ? n[d] : undefined), raiz);
const hoja = (x) => (Array.isArray(x) ? x[0] : x);
const hojas = (x) => (x === undefined || x === null ? [] : Array.isArray(x) ? x : [x]);
const ultima = (x) => (Array.isArray(x) ? x[x.length - 1] : x);
const texto = (x) => (typeof x === 'string' ? x : typeof x === 'number' ? String(x) : undefined);

/** El evento de X (su id o el evento), o null. */
function eventoDe(eje, X) {
  if (typeof X === 'string') return eje?.obtener(X) ?? null;
  if (X && typeof X === 'object' && 'payload' in X) return X;
  if (X && typeof X === 'object' && typeof X.id === 'string') return eje?.obtener(X.id) ?? null;
  return null;
}

/** El contexto del BQL mínimo: el eje, la época, la candidata y quien mira. */
const contextoDe = (eje, epoca, { ev, me } = {}) => new ContextoEje(eje, { ev, epoch: epoca, me });

/** Un ocupante del BQL mínimo como dato plano: número, texto, símbolo, el valor de un nodo (un id, una clave) o la décupla de un nodo del payload. */
function plano(o, ctx) {
  if (typeof o === 'number' || typeof o === 'string' || typeof o === 'boolean') return o;
  if (o && typeof o === 'object' && typeof o.simbolo === 'string') return o.simbolo;
  if (o && typeof o === 'object' && o.k === 'dec') return o.v;
  const v = ctx.valor(o);
  return v !== undefined ? v : undefined;
}

/** Lo que vale una expresión con it = sujeto: la lista plana, o null si no se resuelve (y por qué). */
function valores(expr, ctx, sujeto) {
  const r = evaluar(expr, ctx, sujeto === undefined ? {} : { sujeto });
  if (r.estado !== 'RESUELTO') return { valores: null, motivo: r.motivo, estado: r.estado };
  return { valores: r.valor.map((o) => plano(o, ctx)).filter((x) => x !== undefined), estado: 'RESUELTO' };
}

/** ¿Da verdadero una condición con it = sujeto? */
function cumple(expr, ctx, sujeto) {
  const r = evaluar(expr, ctx, { sujeto });
  return r.estado === 'RESUELTO' && r.valor.length === 1 && r.valor[0] === true;
}

/** El sujeto `it` de una evaluación sobre X: su id en el eje. */
const sujetoDe = (ev) => ev.id;

// ---------- 1. las plantillas de transacción ----------

/** El nombre de una plantilla de transacción: su 0.0. */
export const nombreDeAccion = (p) => texto(hoja(p?.[0]));
/** ¿Solo lee? (su 4 dice «read»). */
export const esLectura = (p) => Array.isArray(p?.[4]) && p[4].length >= 1 && p[4][0] === 'read';
/** ¿Lanza el camino? (su 4 dice «path», y «path all» si lo recorre entero). */
export const esCamino = (p) => Array.isArray(p?.[4]) && p[4].length >= 1 && p[4][0] === 'path';

/**
 * Las plantillas de transacción de la época (epoch.9.6), en su orden: [{ nombre, plantilla, id, pv, orden }]. Son
 * las acciones del aro; su 8 es [punto de vista, orden].
 */
export function plantillasDeTransaccion(opciones = {}) {
  const epoca = epocaDe(opciones);
  const lista = Array.isArray(epoca.transacciones) ? epoca.transacciones : [];
  return lista.map(({ id, plantilla }) => ({ nombre: nombreDeAccion(plantilla), plantilla, id, pv: Number(hojas(plantilla[8])[0]), orden: Number(hojas(plantilla[8])[1]) }));
}

/** Una plantilla de transacción por su nombre, su décupla o la referencia a su registro; null si no la hay. */
export function plantillaDeTransaccion(cual, opciones = {}) {
  if (Array.isArray(cual)) return cual;
  const todas = plantillasDeTransaccion(opciones);
  if (esReferencia(cual)) return todas.find((p) => p.id === cual.ref)?.plantilla ?? null;
  if (typeof cual === 'string') return todas.find((p) => p.nombre === cual || p.id === cual)?.plantilla ?? null;
  return null;
}

// ---------- 1b. el modo de ejecución (VG 12-11, #71.1; CONVERGENCIA de AARPIA §2.2) ----------

/**
 * Los tres modos de ejecución de una plantilla (su 3.1), en el canónico (inglés); sus textos, en epoch.9.4 por la clave
 * «launch mode <modo>» (persona, agente, sistema). `person` es el defecto: solo una persona la lanza.
 */
export const MODOS_DE_EJECUCION = Object.freeze(['person', 'agent', 'system']);

/** El modo que una plantilla declara en su 3.1 (`person` si no lo dice o dice un valor que no es uno de los tres). */
export function modoDeclarado(plantilla) {
  const v = texto(hoja(hojas(plantilla?.[3])[1]));
  return MODOS_DE_EJECUCION.includes(v) ? v : 'person';
}

/**
 * Los ids de las plantillas de transacción que el dueño de la época revisó para que las lance el sistema solo: la
 * lectura «reviewed to run by the system» (epoch.9.0.4) con it = el génesis del libro (los registros anclados en su 9.6
 * con «review execution mode» en su 4, escritos por el autor del génesis, y el id de la plantilla en su 2). Solo lee.
 */
export function plantillasRevisadas(eje, opciones = {}) {
  opciones = conEpoca(eje, opciones);
  const g = eje?.genesisId;
  const formula = g ? formulaDeEjecucion('reviewed to run by the system', opciones) : null;
  if (!formula) return new Set();
  return new Set((valores(formula, contextoDe(eje, epocaDe(opciones, eje), {}), g).valores ?? []).filter((x) => typeof x === 'string'));
}

/** La fórmula de epoch.9.0.4 que se llama así (null si la época no la trae). */
function formulaDeEjecucion(nombre, opciones) {
  const lectura = hojas(en(raizDe(epocaDe(opciones)), SITIO.revisiones)).filter(Array.isArray).find((c) => texto(hoja(c[0])) === nombre);
  const formula = texto(ultima(lectura?.[1]));
  return esFormula(formula) ? formula : null;
}

/**
 * ¿Es `identidad` un agente? Una cosa (su alta la escribió otra) que su dueño ha declarado agente con un registro anclado en
 * el 9 de su alta que dice «declare agent» en su 4 (la lectura «declared as an agent», epoch.9.0.4). Un agente no lanza las
 * plantillas de modo `person`; una cosa sin declarar (Core, la cocina de los ejemplos) y una persona, sí.
 */
export function esAgente(eje, identidad, opciones = {}) {
  opciones = conEpoca(eje, opciones);
  if (typeof identidad !== 'string' || !identidad || eje?.esPersona?.(identidad) !== false) return false;
  const formula = formulaDeEjecucion('declared as an agent', opciones);
  return Boolean(formula) && valores(formula, contextoDe(eje, epocaDe(opciones, eje), {}), identidad).valores?.[0] === true;
}

/**
 * El modo de ejecución de una plantilla (su nombre, su id o su décupla): { declarado, modo, revisado, id }. `declarado`
 * es el que dice su 3.1; `modo`, el que rige: «system» solo rige si el dueño de la época lo revisó (un registro anclado
 * sobre el génesis que nombra el id de la plantilla, `plantillasRevisadas`); sin revisión, una plantilla que declara
 * «system» se lee «agent». Cambiar la plantilla le cambia el id y anula su revisión. null si no hay tal plantilla.
 */
export function modoDeEjecucion(eje, cual, opciones = {}) {
  opciones = conEpoca(eje, opciones);
  const plantilla = plantillaDeTransaccion(cual, opciones);
  if (!plantilla) return null;
  const id = plantillasDeTransaccion(opciones).find((p) => p.plantilla === plantilla)?.id ?? null;
  const declarado = modoDeclarado(plantilla);
  const revisado = declarado === 'system' && id !== null && plantillasRevisadas(eje, opciones).has(id);
  return { declarado, modo: declarado === 'system' && !revisado ? 'agent' : declarado, revisado, id };
}

/**
 * Qué se hace con un parámetro (su 4): { que: 'payload' | 'key' | 'proof' | 'file', para } (`para`: en key y proof, la
 * identidad, con huecos {parámetro}; en file, qué del archivo adjunto es: «ref», su referencia archivo:<sha256>, o
 * «format», el formato de la época con que se representa). Un parámetro «file» va al payload como cualquiera: el 4
 * solo le dice a quien lanza la acción que el valor sale de subir un archivo (la carta abre el selector de archivos).
 */
function destinoDe(cuatro) {
  const [que, para] = hojas(cuatro).map(texto);
  if (que === 'key' || que === 'proof') return { que, para: para ?? '' };
  // «cost» (encargo A18, «ask for more firmness»): el valor es la escala de T real (su índice en epoch.7.0) en que se paga el
  // coste de escribir el registro; no va en el payload (su 5 es un hueco con nombre). Esa quema es la petición.
  if (que === 'cost') return { que, para: null };
  if (que === 'file') return { que, para: para === 'format' ? para : 'ref' };
  return { que: 'payload', para: null };
}

/**
 * La escala del coste que pide un parámetro «cost» de la plantilla (encargo A18): el nombre de la escala real cuyo índice en
 * epoch.7.0 es su valor, o null si la plantilla no lo tiene o el valor no es el de una escala real.
 */
function escalaDelParametro(prep) {
  const p = prep.parametros.find((x) => x.destino.que === 'cost');
  const v = p ? Number(prep.valores[p.nombre]) : NaN;
  return Number.isSafeInteger(v) && v >= 0 && v < ESCALAS_REALES.length ? ESCALAS_REALES[v] : null;
}

/**
 * Qué del archivo adjunto pide un parámetro: su faceta si su tipo es de base file (Core AGRAM 18-11, src/tipos.js: 'ref',
 * 'format' o 'size') o, como hasta la pasada única por la época 0, lo que dice su 4 «file» ('ref' o 'format'); null si no
 * pide un archivo.
 */
export const archivoDe = (p) => (p?.base === 'file' ? p.faceta : p?.destino?.que === 'file' ? p.destino.para : null);

/** Una posición del registro, «1.2» (lo que no lo es, un hueco con nombre «{parámetro}», no se escribe en él). */
const RE_POSICION = /^\d(\.\d)*$/;

/**
 * Los parámetros que pide una plantilla, leídos de su 1: [{ nombre, etiqueta, tipo, validacion, posicion, requerido,
 * defectos, ayuda, orden, destino }]. `posicion` es dónde va en el registro que escribe («1.2»; null si no va en él: su 5 es
 * entonces un hueco con nombre, «{parámetro}», y no un «-»: sin huecos ni rellenos, VG 13-11, #77);
 * `destino`, qué se hace con él (su 4: el payload, la clave y la prueba de posesión que declara el registro, o un archivo adjunto); `defectos`
 * son las hojas del 9 menos la ayuda (una fórmula «=…» se evalúa sobre it = X, me y la candidata). `nombre` es el
 * canónico (inglés); `etiqueta` y `ayuda`, con `opciones.idioma`, su traducción (epoch.9.4: «template <nombre> param
 * <etiqueta> label | help»).
 * El tipo (Core AGRAM 18-11, src/tipos.js): `tipo` es su tipo base (el control; lo que lee la carta, como siempre), `declarado`
 * el tipo declarado por la época que nombra su 1 (o null), `faceta` la de file o book, `validaciones` todas las que tiene
 * que pasar el valor en su orden (la forma de la faceta, la cadena del tipo de abajo arriba y al final la del parámetro,
 * `validacion`), `opcionesDelTipo` la fórmula de opciones de su tipo y `errorDeTipo` el motivo si el tipo no se resuelve.
 * La ayuda, la del parámetro o, si no tiene, la de su tipo.
 */
export function parametros(plantilla, opciones = {}) {
  const nombre = nombreDeAccion(plantilla);
  const t = (clave, original) => textoDe(null, clave, opciones.idioma, { original, epoca: opciones.epoca });
  const lista = Array.isArray(plantilla?.[1]) ? plantilla[1].filter((p) => Array.isArray(p) && esDecupla(p)) : [];
  return lista.map((p) => {
    const k = texto(hoja(p[0]));
    const validacion = esFormula(texto(ultima(p[2]))) ? texto(ultima(p[2])) : null;
    const delTipo = resolverTipo(hojas(p[1]), opciones);
    // La ayuda es la última hoja del 9 si es un texto; sin ella, la de su tipo; si no, lo de siempre.
    const ultimaDel9 = ultima(p[9]);
    const ayuda = (typeof ultimaDel9 === 'string' && !esFormula(ultimaDel9) ? ultimaDel9 : null) ?? delTipo.ayuda ?? texto(ultimaDel9) ?? '';
    return {
      nombre: k,
      etiqueta: t(claves.parametro(nombre, k, 'label'), k),
      tipo: delTipo.base ?? texto(hoja(p[1])) ?? 'text',
      declarado: delTipo.nombre,
      base: delTipo.base,
      faceta: delTipo.faceta,
      validaciones: Object.freeze([...delTipo.validaciones, ...(validacion ? [Object.freeze({ de: 'parámetro', formula: validacion })] : [])]),
      opcionesDelTipo: delTipo.opciones,
      errorDeTipo: delTipo.error,
      validacion,
      posicion: RE_POSICION.test(texto(hoja(p[5])) ?? '') ? texto(hoja(p[5])) : null,
      // «required if signed»: obligatorio solo si el eje exige firmas (VG 13-11, #75: la clave de una cosa)
      requerido: hoja(p[7]) === 'required' || (hoja(p[7]) === 'required if signed' && (opciones.exigirFirmas ?? opciones.eje?.exigirFirmas) === true),
      defectos: hojas(p[9]).slice(0, -1),
      ayuda: t(claves.parametro(nombre, k, 'help'), ayuda),
      orden: Number(hoja(p[8])) || 0,
      destino: destinoDe(p[4]),
    };
  }).sort((a, b) => a.orden - b.orden);
}

/** El idioma de quien mira: el que se pide, o el de su configuración (la preferencia «language»); sin él, el canónico. */
const idiomaDe = (eje, yo, opciones) => opciones?.idioma ?? configuracion(eje, yo, opciones).language ?? 'en';

// ---------- la candidata: el registro que la plantilla describe ----------

/** El camino de dígitos de una posición «1.2» (o null si el parámetro no se escribe en el registro). */
const caminoDe = (posicion) => (posicion === null || posicion === undefined ? null : String(posicion).split('.').map(Number));

/** Pone un valor en una posición del payload (creando las décuplas intermedias): una hoja va entre corchetes (forma canónica), una lista tal cual. */
function poner(payload, camino, valor) {
  let nodo = payload;
  for (let k = 0; k < camino.length - 1; k++) {
    if (!Array.isArray(nodo[camino[k]])) nodo[camino[k]] = [];
    nodo = nodo[camino[k]];
  }
  nodo[camino[camino.length - 1]] = Array.isArray(valor) ? valor : [valor];
}

/** Las posiciones sin valor de un payload (huecos), como caminos «1.2». */
function huecos(payload, camino = []) {
  const fuera = [];
  if (!Array.isArray(payload)) return fuera;
  for (let i = 0; i < payload.length; i++) {
    if (payload[i] === undefined || payload[i] === null) fuera.push([...camino, i].join('.'));
    else if (Array.isArray(payload[i]) && payload[i].some(Array.isArray)) fuera.push(...huecos(payload[i], [...camino, i]));
  }
  return fuera;
}

/** Un valor de tipo `ref`: un id (o una lista de ids) se vuelve referencia. */
function comoTipo(valor, tipo) {
  if (tipo !== 'ref') return valor;
  const ref = (x) => (typeof x === 'string' && RE_ID.test(x) ? { ref: x } : x);
  return Array.isArray(valor) ? valor.map(ref) : ref(valor);
}

/** El nodo que hace de sujeto para validar un valor: una décupla del payload envuelta, lo demás tal cual (un id se despliega solo). */
const sujetoDeValor = (v) => (Array.isArray(v) ? { k: 'dec', id: null, camino: [], v } : esReferencia(v) ? v.ref : v);

/** Rellena los huecos {nombre} de un camino de anclaje con los parámetros. */
const conHuecos = (ruta, valores) => String(ruta).replace(/\{([^{}]+)\}/g, (_, n) => String(valores[n] ?? ''));

/**
 * Prepara la candidata de una plantilla sobre X para `yo`: el ancla (su 5), el payload con los parámetros dados y
 * los defectos de los que faltan (en su orden), y los parámetros resueltos. Devuelve { sobre, en, payload, valores,
 * parametros, motivos } con los motivos de los parámetros que fallan (cada uno { regla, mensaje }, con la etiqueta y
 * la ayuda del parámetro en el idioma).
 */
function preparar(eje, plantilla, X, yo, params, { t, epoca, idioma }) {
  const nombre = nombreDeAccion(plantilla);
  const lista = parametros(plantilla, { idioma, epoca, eje });
  const valores = {};
  const motivos = [];
  for (const p of lista) if (params[p.nombre] !== undefined) valores[p.nombre] = comoTipo(params[p.nombre], p.tipo);
  const payload = [];
  const colocar = () => {
    payload.length = 0;
    for (const p of lista) {
      const camino = caminoDe(p.posicion);
      if (camino && valores[p.nombre] !== undefined) poner(payload, camino, valores[p.nombre]);
    }
    if (payload[0] === undefined) payload[0] = nombre;
  };
  colocar();
  // El ancla: el dígito (o camino, con huecos {parámetro}) de X y, si la plantilla lo dice, otro registro.
  const [ruta, formulaRegistro] = hojas(plantilla[5]);
  let sobre = X.id;
  const provisional = { autor: yo, sobre, en: '0000000000', t, movimientos: [], payload };
  // El registro del ancla, si la plantilla lo dice (su 5): si sale de un parámetro que aún no está (un defecto, como el
  // anuncio que «pay» cumple: VG 12-11, decisión 8), se vuelve a mirar con los defectos puestos.
  let sinAncla = false;
  if (esFormula(formulaRegistro)) {
    const r = valores0(eje, epoca, formulaRegistro, provisional, yo, X);
    if (typeof r !== 'string' || !eje.obtener(r)) sinAncla = true;
    else sobre = r;
  }
  const rutaLlena = conHuecos(ruta ?? '0', valores);
  const digitos = rutaLlena.split('.').map(Number);
  const enDir = digitos.every((d) => Number.isInteger(d) && d >= 0 && d <= 9) && digitos.length <= 10 ? direccion(digitos) : null;
  if (!enDir) motivos.push({ regla: nombre, mensaje: motivoDe('anchor not a position', { name: nombre, path: rutaLlena }, { idioma, epoca }) });
  const candidata = { autor: yo, sobre, en: enDir ?? '0000000000', t, movimientos: [], payload };
  // Los defectos de lo que falta, en su orden, con lo ya puesto a la vista (ev).
  for (const p of lista) {
    if (valores[p.nombre] !== undefined || !p.defectos.length) continue;
    const v = p.defectos.map((d) => (esFormula(d) ? valoresDe(eje, epoca, d, candidata, yo, X) : [d])).flat();
    if (v.length) {
      valores[p.nombre] = comoTipo(v.length === 1 ? v[0] : v, p.tipo);
      colocar();
    }
  }
  // Un hueco del ancla que llena un defecto (encargo «arte propio»: el mundo donde sirve la pieza, «*» → su 5): el ancla
  // se vuelve a llenar con los defectos puestos.
  const rutaConDefectos = conHuecos(ruta ?? '0', valores);
  if (rutaConDefectos !== rutaLlena) {
    const d2 = rutaConDefectos.split('.').map(Number);
    const en2 = d2.every((d) => Number.isInteger(d) && d >= 0 && d <= 9) && d2.length <= 10 ? direccion(d2) : null;
    if (en2) candidata.en = en2;
    else motivos.push({ regla: nombre, mensaje: motivoDe('anchor not a position', { name: nombre, path: rutaConDefectos }, { idioma, epoca }) });
  }
  if (sinAncla) {
    const r = valores0(eje, epoca, formulaRegistro, candidata, yo, X);
    if (typeof r !== 'string' || !eje.obtener(r)) motivos.push({ regla: nombre, mensaje: motivoDe('anchor not in ledger', { name: nombre, formula: String(formulaRegistro) }, { idioma, epoca }) });
    else candidata.sobre = r;
  }
  // Validar: lo requerido está, y cada valor cumple su 2.
  const ctx = contextoDe(eje, epoca, { ev: candidata, me: yo });
  for (const p of lista) {
    // Un tipo que no se resuelve (desconocido, un ciclo, más de cuatro saltos, una capa que cambia la base) es un error
    // de la época: el parámetro no vale nunca.
    if (p.errorDeTipo) {
      motivos.push({ regla: p.nombre, mensaje: p.etiqueta + ': ' + p.errorDeTipo, parametro: p.nombre, estado: 'ERROR' });
      continue;
    }
    const v = valores[p.nombre];
    if (v === undefined) {
      if (p.requerido) motivos.push({ regla: p.nombre, mensaje: p.etiqueta + ': ' + p.ayuda, parametro: p.nombre });
      continue;
    }
    // Todas sus validaciones, en su orden (la forma de la faceta, las de su tipo y la suya): la primera que no pasa lo dice.
    const r = valeElValor(p.validaciones, v, ctx, { sujeto: sujetoDeValor(v) });
    // La forma del motivo es la de siempre; cuál de las validaciones no pasó lo dirá el porqué (NUCLEO_6_7_8 §8).
    if (!r.ok) motivos.push({ regla: p.nombre, mensaje: p.etiqueta + ': ' + p.ayuda, parametro: p.nombre });
  }
  for (const h of huecos(payload)) motivos.push({ regla: nombre, mensaje: motivoDe('position without value', { name: nombre, position: h }, { idioma, epoca }) });
  return { sobre: candidata.sobre, en: candidata.en, payload, valores, parametros: lista, motivos, candidata };
}

/** Lo que vale una fórmula sobre it = X, me = yo y la candidata, como lista plana (vacía si no se resuelve). */
function valoresDe(eje, epoca, formula, candidata, yo, X) {
  const ctx = contextoDe(eje, epoca, { ev: candidata, me: yo });
  return valores(formula, ctx, sujetoDe(X)).valores ?? [];
}
const valores0 = (...args) => valoresDe(...args)[0];

// ---------- 2. acciones ----------

/**
 * Las acciones del aro: las plantillas de transacción del punto de vista k cuya condición (su 2, con it = X y me = yo)
 * pasa, en el orden de su 8: [{ nombre, id, etiqueta, plantilla, parametros, porDefecto, lectura, camino }]. `nombre`
 * es el canónico (inglés) e `id` el del registro de la plantilla (los dos la nombran en transaccion); `etiqueta`, el
 * nombre en el idioma de yo (o el de `opciones.idioma`), como la etiqueta y la ayuda de cada parámetro. Cada parámetro
 * lleva su valor por defecto ya resuelto (`valor`) y si falta (`falta`). Nada se decide aquí: si una acción no debe
 * aparecer, lo dice su 2.
 */
export function acciones(eje, X, k, yo, opciones = {}) {
  opciones = conEpoca(eje, opciones);
  const ev = eventoDe(eje, X);
  if (!ev || typeof ev.id !== 'string' || !eje?.obtener(ev.id)) return [];
  const epoca = epocaDe(opciones, eje);
  const idioma = idiomaDe(eje, yo, opciones);
  const ctx = contextoDe(eje, epoca, { me: yo });
  const fuera = [];
  // RP4 (arreglos de la segunda revisión del puente): enviar y traer no se ofrecen por un enlace que la lectura no da por
  // bueno para el puente (gradoDelEnlace: otra persona sin génesis, el de quien creó el libro con un enlace del dueño con
  // otras claves, uno retirado o de antes del puente). La regla no lo mira entero (el límite (b) es de lectura): lo dice la
  // oferta. Solo se lee si X es un enlace, y una vez.
  let cuentaElEnlace;
  const cuenta = () => (cuentaElEnlace ??= gradoDelEnlace(eje, ev.id)?.cuenta === true);
  for (const { nombre, plantilla, pv, id } of plantillasDeTransaccion(opciones)) {
    if (pv !== Number(k)) continue;
    const condicion = texto(ultima(plantilla[2]));
    if (!esFormula(condicion) || !cumple(condicion, ctx, sujetoDe(ev))) continue;
    if (PLANTILLAS_POR_UN_ENLACE.includes(nombre) && !cuenta()) continue;
    const { valores, parametros: lista } = preparar(eje, plantilla, ev, yo, {}, { t: relojDe(eje, opciones), epoca, idioma });
    fuera.push({
      nombre,
      id,
      etiqueta: textoDe(eje, claves.plantilla(nombre), idioma, { original: nombre, epoca }),
      plantilla,
      parametros: lista.map((p) => ({ nombre: p.nombre, etiqueta: p.etiqueta, tipo: p.tipo, requerido: p.requerido, ayuda: p.ayuda, posicion: p.posicion, valor: valores[p.nombre], falta: p.requerido && valores[p.nombre] === undefined, archivo: archivoDe(p), base: p.base, faceta: p.faceta, declarado: p.declarado })),
      porDefecto: fuera.length === 0,
      lectura: esLectura(plantilla),
      camino: esCamino(plantilla),
      ...modoParaLanzar(eje, plantilla, yo, opciones),
    });
  }
  return fuera;
}

/**
 * Lo que el modo de ejecución de una plantilla dice de quien la lanza: { modo, puedeLanzar }. Una plantilla «person» no la
 * lanza un agente (una cosa que su dueño declaró agente: `esAgente`); las de modo «agent» y «system», cualquiera.
 */
function modoParaLanzar(eje, plantilla, yo, opciones) {
  const { modo } = modoDeEjecucion(eje, plantilla, opciones);
  return { modo, puedeLanzar: modo !== 'person' || !esAgente(eje, yo, opciones) };
}

/** El reloj con que se fecha una candidata: el que se pide, o el mayor t del libro. */
function relojDe(eje, opciones) {
  if (opciones?.t) return opciones.t;
  const ms = eje?.tMaximo?.();
  return Number.isFinite(ms) ? new Date(ms).toISOString().replace('.000Z', 'Z') : new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

// ---------- 3. construir y validar ----------

/** Los campos de una serie para un movimiento, desde su clave (R:ana, T:minuto, E:casa/EUR, P:<ámbito>/<origen>). */
function serieDe(clave) {
  if (typeof clave !== 'string' || !clave.includes(':')) return null;
  const p = partirClave(clave);
  const { token } = p;
  if (token === 'E') return { token, emisor: p.emisor, denominacion: p.denominacion, ...(p.registro ? { registro: p.registro } : {}) };
  if (token === 'P') return { token, ambito: p.ambito, ...(p.origen ? { origen: p.origen } : {}) };
  if (token === 'R') return { token, emisor: p.emisor };
  if (token === 'T') return { token, escala: p.escala };
  return null;
}

/** Las sentencias del 4 (VG 12-11, decisiones 5 y 6): las fórmulas «=…» del BQL mínimo con los verbos, en su orden. */
export const sentenciasDe = (plantilla) => (Array.isArray(plantilla?.[4]) ? plantilla[4] : []).filter(esFormula);

/** ¿Está migrada la plantilla? (VG 12-11, decisión 10): su 4 lleva sentencias, o «write» si no mueve más que el coste. */
export const migrada = (plantilla) => sentenciasDe(plantilla).length > 0 || (Array.isArray(plantilla?.[4]) && plantilla[4].includes('write'));

/**
 * Los movimientos de las sentencias del 4 (VG 12-11, decisiones 5 y 6): bqlm.evaluarPlantilla las evalúa en orden sobre
 * la candidata (it = X, me = yo, memo = su payload) y anota lo que mueven sus verbos; aquí solo se recoge, se redondea
 * y pasa la forma (validarMovimiento, el suelo). Lo que construye una plantilla no concede nada: la candidata la firma
 * quien la lanza y la validan después las reglas, que solo leen; nombrar una serie no da nada: lo que no está en la
 * cartera de quien la mueve, el libro no lo deja salir (saldo insuficiente). `when` en lo que no es T informativo lo
 * anuncia (decisión 8).
 * Devuelve { movimientos, motivos }.
 */
function movimientosBql(eje, epoca, plantilla, candidata, yo, X, idioma) {
  const nombre = nombreDeAccion(plantilla);
  const ctx = contextoDe(eje, epoca, { ev: candidata, me: yo });
  const r = evaluarPlantilla(sentenciasDe(plantilla), ctx, { sujeto: sujetoDe(X) });
  if (r.estado !== 'RESUELTO') return { movimientos: [], motivos: [{ regla: nombre, mensaje: nombre + ': ' + r.estado + ': ' + r.motivo }] };
  const movimientos = [];
  const motivos = [];
  const sinSerie = (cantidad) => motivos.push({ regla: nombre, mensaje: motivoDe('no series', { name: nombre, amount: cantidad }, { idioma, epoca }) });
  for (const v of r.movimientos) {
    const serie = serieDe(v.serie);
    if (!serie) { sinSerie(v.cantidad); continue; }
    const m = { ...serie, cantidad: Math.round(v.cantidad * 1e9) / 1e9 };
    const informativo = serie.token === 'T' && ESCALAS_INFORMATIVAS.includes(serie.escala);
    if (v.verbo === 'mint') {
      Object.assign(m, { de: null, a: v.a });
      const p = v.precio === undefined ? undefined : plano(v.precio, ctx);
      if (serie.token === 'E' && Array.isArray(p) && esDecupla(p)) m.precio = [hoja(p[0]), hoja(p[1])];
    } else if (v.verbo === 'burn') {
      Object.assign(m, { de: v.de, a: null });
      if (informativo && typeof v.cuando === 'string') m.refiere = v.cuando;
    } else if (v.verbo === 'lock' || v.verbo === 'release') {
      Object.assign(m, { de: v.de, a: v.de, estado: v.verbo === 'lock' ? 'bloqueo' : 'liberacion', salida: v.salida });
    } else {
      Object.assign(m, { de: v.de, a: v.a, ...(v.salida === undefined ? {} : { salida: v.salida }) });
    }
    // Lo que lleva fecha y no es T informativo es un movimiento anunciado (VG 12-11, decisión 8): no se mueve todavía.
    if (v.cuando !== undefined && !informativo) Object.assign(m, { estado: ANUNCIADO, refiere: v.cuando });
    const errores = validarMovimiento(m);
    if (errores.length) motivos.push({ regla: nombre, mensaje: nombre + ': ' + errores.join('; ') });
    else movimientos.push(m);
  }
  return { movimientos, motivos };
}

/**
 * El coste de escribir la candidata (VG 12-11, decisión 7): lo que exige la regla de la época «the cost of writing»
 * (por posición) y la T que lo cubre, en la escala pedida (`escala`, una real) o en la menor que lo cubre
 * (escritura.tDelCoste). → { exigido (segundos), movimiento (la quema de T de quien escribe) | null }.
 */
export function costeDe(payload, yo, { epoca, escala, eje } = {}) {
  const segundos = exigidoDe(payload, { epoca, eje });
  const t = tDelCoste(segundos, escala);
  return { exigido: segundos, movimiento: t ? { token: 'T', escala: t.escala, cantidad: t.cantidad, de: yo, a: null } : null };
}

// ---------- 3 bis. ejecutar desde el 4 (VG 12-11, decisión 7 de #49 y #65) ----------

/** Lo que una pieza de T vale en segundos del calendario (epoch.7.0); 0 si la escala no es real. */
const segundosDe = (escala, cantidad) => (ESCALAS_REALES.includes(escala) ? cantidad * SEGUNDOS[escala] : 0);

/**
 * La denominación de T que cubre `segundos` empezando por la escala `desde` (una real): lo que cabe entero en ella y el
 * resto en las menores, hasta el segundo (330 minutos desde la hora: 5 h 30 min; desde el minuto: 330 min); si la escala
 * es mayor que lo exigido, una unidad suya (se paga de más: subir de escala). → [{ escala, cantidad }] (de mayor a
 * menor), [] si no se exige nada. Es el ajuste del 4: a escalas menores (1 h 11 min) o mayores (el desplegable de las
 * escalas del calendario, epoch.7).
 */
export function denominacion(segundos, desde) {
  if (!ESCALAS_REALES.includes(desde)) throw new Error('la denominación va en una escala real (' + ESCALAS_REALES.join(', ') + '), no «' + desde + '»');
  if (!(segundos > 0)) return [];
  if (SEGUNDOS[desde] >= segundos) return [{ escala: desde, cantidad: Math.ceil(segundos / SEGUNDOS[desde] - 1e-9) }];
  const piezas = [];
  let resto = segundos;
  for (const escala of ESCALAS_REALES.slice(0, ESCALAS_REALES.indexOf(desde) + 1).reverse()) {
    const n = escala === 'segundo' ? Math.ceil(resto - 1e-9) : Math.floor(resto / SEGUNDOS[escala] + 1e-9);
    if (n > 0) { piezas.push({ escala, cantidad: n }); resto -= n * SEGUNDOS[escala]; }
    if (resto <= 1e-9) break;
  }
  return piezas;
}

/** ¿Alcanza el saldo de T de `yo` el día de `t` para cada pieza de una denominación (eje.saldoT, por escala)? */
function alcanzaPara(eje, yo, piezas, t) {
  if (typeof eje?.saldoT !== 'function') return true;
  // Las piezas de la misma escala salen del mismo saldo (la quema del coste y las transferencias de la autorización): se suman.
  const porEscala = new Map();
  for (const p of piezas) porEscala.set(p.escala, (porEscala.get(p.escala) ?? 0) + p.cantidad);
  return [...porEscala].every(([escala, cantidad]) => eje.saldoT(yo, escala, t) >= cantidad);
}

/** Una denominación pedida: la escala de la que parte (un texto) o las piezas tal cual ([{ escala, cantidad }]). */
function piezasPedidas(pedida, segundos) {
  if (typeof pedida === 'string') return denominacion(segundos, pedida);
  if (!Array.isArray(pedida)) throw new Error('la denominación es una escala real o una lista de piezas { escala, cantidad }');
  for (const p of pedida) {
    if (!ESCALAS_REALES.includes(p?.escala) || !(p.cantidad > 0)) throw new Error('una pieza de la denominación es { escala real, cantidad > 0 }, no ' + JSON.stringify(p));
  }
  return pedida.map((p) => ({ escala: p.escala, cantidad: p.cantidad }));
}

/**
 * Lo que la transacción exige en T y la denominación que lo cubre (VG 12-11, decisión 7: el 4 recopila y propone).
 * Cada parte exige o no: el coste de escribir (la regla de la época «the cost of writing», por posición) y lo que la
 * plantilla mueve de T real de quien la lanza (sus sentencias: lo que da, bloquea o quema; lo anunciado no, que aún no
 * se mueve). La denominación paga el coste: la propuesta parte de la escala que cubre lo emitido (tiempo.escalaQueCubre
 * de las posiciones, #65; nunca por debajo del minuto, #78) y baja a las menores (1 h 11 min); si el saldo del día no la alcanza, la de una sola escala que
 * sí (escritura.escalaQueAlcanza). `pedida` (opciones.denominacion) la ajusta: la escala de la que parte o las piezas.
 */
function resumenDeEjecucion(eje, { payload, movimientos, yo, t, epoca, nombre, pedida, coste: costeDado, aut = null }) {
  const coste = costeDado ?? exigidoDe(payload, { epoca, eje });
  // La autorización (VG 14-11, #70 (3) bis): lo que se transfiere a cada cosa titular (autorizacionDe), no se quema.
  const transferencias = aut?.transferencias ?? [];
  const autorizacion = transferencias.reduce((s, x) => s + x.transfiere, 0);
  const elementos = aut?.elementos ?? 0;
  const posiciones = contarPosiciones(payload);
  const reales = movimientos.filter((m) => m.token === 'T' && ESCALAS_REALES.includes(m.escala) && m.de === yo && m.estado !== ANUNCIADO && m.estado !== 'liberacion');
  const dePlantilla = reales.reduce((s, m) => s + segundosDe(m.escala, m.cantidad), 0);
  // Lo que anuncia (un movimiento anunciado de T de quien la lanza, el T futuro): no se exige ahora; se dice aparte.
  const anunciado = movimientos.filter((m) => m.token === 'T' && ESCALAS_REALES.includes(m.escala) && m.de === yo && m.estado === ANUNCIADO).reduce((s, m) => s + segundosDe(m.escala, m.cantidad), 0);
  const partes = [
    { parte: 'coste', regla: REGLA_DEL_COSTE, posiciones, segundos: coste },
    { parte: 'plantilla', plantilla: nombre, segundos: dePlantilla, movimientos: reales.map((m) => ({ escala: m.escala, cantidad: m.cantidad })), anunciado },
    // La autorización (VG 14-11, #70 (3) bis): por cada cosa titular, una TRANSFERENCIA de T de quien propone a la cosa por
    // max(tarifa, coste de escribir su autorización); la tarifa, un segundo por elemento que requiere segundo factor (cada
    // criterio alcanzado de esa cosa), con un minuto de mínimo. La cosa escribe su autorización con esa T.
    ...(transferencias.length ? [{ parte: 'autorizacion', segundos: autorizacion, elementos, transferencias: transferencias.map(({ cosa, segundos, tarifa, escribir, elementos: n, escala: e, cantidad }) => ({ cosa, segundos, tarifa, escribir, elementos: n, escala: e, cantidad })) }] : []),
  ];
  // Lo que se quema en la propuesta: el coste de escribir (lo de la autorización se transfiere, no se quema).
  const aPagar = coste;
  const escala = escalaQueCubre(posiciones);
  let propuesta = { desde: escala, piezas: denominacion(aPagar, escala) };
  if (aPagar > 0 && !alcanzaPara(eje, yo, propuesta.piezas, t)) {
    // Nunca por debajo del minuto (VG 13-11, #78): si solo alcanzara en segundos, se propone el minuto igualmente.
    const buscada = escalaQueAlcanza(eje, yo, payload, t, { epoca });
    const otra = ESCALAS_REALES.indexOf(buscada) < ESCALAS_REALES.indexOf(ESCALA_MINIMA_PROPUESTA) ? ESCALA_MINIMA_PROPUESTA : buscada;
    // Si la que alcanza es más gruesa que la que cubre lo emitido, se quema de más: `subeDe` lo dice y la carta lo avisa antes de firmar.
    propuesta = { desde: otra, piezas: [tDelCoste(aPagar, otra)], ...(ESCALAS_REALES.indexOf(otra) > ESCALAS_REALES.indexOf(escala) ? { subeDe: escala } : {}) };
  }
  const piezas = pedida === undefined || pedida === null ? propuesta.piezas : piezasPedidas(pedida, aPagar);
  const paga = piezas.reduce((s, p) => s + segundosDe(p.escala, p.cantidad), 0);
  return {
    partes, coste, autorizacion, elementos, exigido: coste + autorizacion + dePlantilla, posiciones,
    propuesta: { ...propuesta, segundos: propuesta.piezas.reduce((s, p) => s + segundosDe(p.escala, p.cantidad), 0) },
    denominacion: piezas, paga, cubre: paga >= aPagar - 1e-9, alcanza: alcanzaPara(eje, yo, [...piezas, ...transferencias], t),
    escalas: [...ESCALAS_REALES],
  };
}

/**
 * El registro del que colgará lo que escribe una plantilla lanzada sobre X (encargo «padres y copias», N2: la línea de
 * antes de firmar dice quién lo guardará): X, o el que nombra su 5 («=first me.6», el anuncio de «pay»…), resuelto con los
 * parámetros dados y los defectos, como al construir la transacción. null si la plantilla solo lee o lanza el camino, si X
 * no está en el eje o si el ancla no se resuelve. Solo lee.
 */
export function sobreDe(eje, cual, params = {}, yo, opciones = {}) {
  opciones = conEpoca(eje, opciones);
  const plantilla = plantillaDeTransaccion(cual, opciones);
  if (!plantilla || esLectura(plantilla) || esCamino(plantilla)) return null;
  const { X: cualX, ...dados } = params;
  const X = eventoDe(eje, cualX);
  if (!X || !eje?.obtener(X.id) || typeof yo !== 'string' || !yo) return null;
  try {
    const prep = preparar(eje, plantilla, X, yo, dados, { t: relojDe(eje, opciones), epoca: epocaDe(opciones, eje), idioma: idiomaDe(eje, yo, opciones) });
    return typeof prep.sobre === 'string' && eje.obtener(prep.sobre) ? prep.sobre : null;
  } catch {
    return null;
  }
}

/**
 * Lo que enlazará lo que escribe una plantilla lanzada sobre X (encargo «puede leer», V7; hermana de sobreDe): los registros
 * del eje que su payload nombrará por su id (contrato.enlacesDe), menos aquel del que colgará; con los parámetros dados y los
 * defectos, como al construir la transacción. Es lo que la carta pasa a contrato.quienGuarda como `enlaza`. [] si la plantilla
 * solo lee o lanza el camino, si X no está en el eje o si algo falla. Solo lee.
 */
export function enlazaDe(eje, cual, params = {}, yo, opciones = {}) {
  opciones = conEpoca(eje, opciones);
  const plantilla = plantillaDeTransaccion(cual, opciones);
  if (!plantilla || esLectura(plantilla) || esCamino(plantilla)) return [];
  const { X: cualX, ...dados } = params;
  const X = eventoDe(eje, cualX);
  if (!X || !eje?.obtener(X.id) || typeof yo !== 'string' || !yo) return [];
  try {
    const prep = preparar(eje, plantilla, X, yo, dados, { t: relojDe(eje, opciones), epoca: epocaDe(opciones, eje), idioma: idiomaDe(eje, yo, opciones) });
    return enlacesDe(eje, prep.payload, { sobre: prep.sobre });
  } catch {
    return [];
  }
}

/**
 * Lo que exige en T ejecutar una plantilla sobre X y la denominación de T que lo cubre (VG 12-11, decisión 7 de #49;
 * #65): la mitad «recopilar y proponer» del 4, sin construir el evento ni validarlo (síncrono: la carta la pinta junto al
 * botón de ejecutar). `opciones.denominacion` la ajusta: la escala de la que parte («hora»: 5 h 30 min) o las piezas
 * ([{ escala, cantidad }]). → { ok, motivos, partes: [{ parte: 'coste', regla, posiciones, segundos }, { parte:
 * 'plantilla', plantilla, segundos, movimientos }], coste, exigido (la suma, en segundos), posiciones, propuesta: {
 * desde, piezas, segundos, subeDe (solo si el saldo de hoy obliga a una escala más gruesa: la que habría bastado) }, denominacion (las piezas que se quemarían), paga, cubre, alcanza, escalas, incompleto } o, si
 * la plantilla no escribe o algo falla, { ok: false, motivos }. Con parámetros por rellenar, `incompleto` y sus motivos: lo
 * exigido es el de lo que ya hay. Ejecutar es transaccion con la misma `denominacion`.
 */
export function ejecucion(eje, cual, params = {}, yo, opciones = {}) {
  opciones = conEpoca(eje, opciones);
  const epoca = epocaDe(opciones, eje);
  const plantilla = plantillaDeTransaccion(cual, opciones);
  if (!plantilla || esLectura(plantilla) || esCamino(plantilla)) return { ok: false, motivos: [] };
  const idioma = idiomaDe(eje, yo, opciones);
  const { X: cualX, ...dados } = params;
  const X = eventoDe(eje, cualX);
  if (!X || !eje?.obtener(X.id) || typeof yo !== 'string' || !yo) return { ok: false, motivos: [] };
  const t = relojDe(eje, opciones);
  const nombre = nombreDeAccion(plantilla);
  try {
    const prep = preparar(eje, plantilla, X, yo, dados, { t, epoca, idioma });
    // Con parámetros por rellenar, lo exigido se calcula con lo que ya hay (`incompleto`: crecerá al rellenarlos); lo que
    // movería la plantilla no se cuenta hasta tenerlos (sin su fecha, un anuncio parecería una quema de ya).
    const incompleto = prep.motivos.length > 0;
    const hecha = movimientosBql(eje, epoca, plantilla, prep.candidata, yo, X, idioma);
    if (hecha.motivos.length && !incompleto) return { ok: false, motivos: hecha.motivos };
    const payload = prep.payload;
    if (!prep.parametros.some((p) => p.posicion === '0' && prep.valores[p.nombre] !== undefined)) payload[0] = mensajeDe(eje, epoca, plantilla, prep.candidata, yo, X);
    const movimientos = hecha.motivos.length || incompleto ? [] : hecha.movimientos;
    const coste = exigidoDe(payload, { epoca, eje });
    // Un parámetro «cost» (encargo A18) dice la escala del coste: la denominación es una sola pieza de esa escala (de más vale).
    const delParametro = escalaDelParametro(prep);
    const pieza = delParametro ? tDelCoste(coste, delParametro) : null;
    const pedida = delParametro ? (pieza ? [pieza] : null) : opciones.denominacion;
    const resumenCon = (aut) => resumenDeEjecucion(eje, { payload, movimientos, yo, t, epoca, nombre, pedida, coste, aut });
    const quema = resumenCon(null).denominacion.map((p) => ({ token: 'T', escala: p.escala, cantidad: p.cantidad, de: yo, a: null }));
    // La autorización (VG 14-11, #70 (3) bis): lo que se transferirá a cada cosa titular, precalculado desde el 4 y sumado a lo exigido.
    const aut = autorizacionDe(eje, epoca, { ...prep.candidata, payload }, [...quema, ...movimientos], { yo, t, idioma });
    const resumen = resumenCon(aut);
    // El segundo factor (VG 12/13-11, #66, #70): si lo que movería (el coste en la denominación, las transferencias de la
    // autorización y lo de la plantilla) alcanza un criterio «second factor» de quien la lanza, se avisa antes de ejecutar.
    const segundo = segundoFactorDeCandidata(eje, epoca, { ...prep.candidata, payload, movimientos: [...quema, ...comoTransferencias(aut.transferencias, yo), ...movimientos] }, { idioma });
    // Lo que el 4 avisa sin bloquear (ok sigue siendo lo que era): una lectura del segundo factor que pasa del presupuesto
    // de cálculo y lo transferido que no cubriera el coste de escribir la autorización (con el max no debería ocurrir).
    const avisos = [...aut.motivos, ...segundo.motivos, ...transferenciasCortas(aut.transferencias, { idioma, epoca })]
      .filter((m, i, todos) => todos.findIndex((x) => x.regla === m.regla && x.mensaje === m.mensaje) === i);
    return { ok: true, incompleto, motivos: [...prep.motivos, ...avisos], ...resumen, segundoFactor: segundo };
  } catch (e) {
    return { ok: false, motivos: [{ regla: nombre, mensaje: nombre + ': ' + e.message }] };
  }
}

/**
 * El mensaje de una plantilla (su 9) relleno sobre la candidata, X y yo. Con `idioma`, el traducido de epoch.9.4
 * («template <nombre> message», con los mismos huecos); sin él, el canónico, que es lo que se escribe en el 0 del
 * registro (los datos van en inglés, como el 9 de las reglas).
 */
function mensajeDe(eje, epoca, plantilla, candidata, yo, X, idioma) {
  const nombre = nombreDeAccion(plantilla);
  const canonico = texto(ultima(plantilla[9]));
  const m = idioma ? textoDe(eje, claves.mensaje(nombre), idioma, { original: canonico, epoca }) : canonico;
  if (!m) return nombre;
  return rellenar(m, contextoDe(eje, epoca, { ev: candidata, me: yo }), { sujeto: sujetoDe(X) });
}

/** Los motivos con que el eje rechaza, como { regla, mensaje } en el idioma: una regla de la época, por su nombre y su 9; lo demás, su texto. */
function motivosDelEje(eje, textos, ev, idioma, opciones) {
  const epoca = epocaDe(opciones, eje);
  const reglas = (epoca.reglasConId ?? []).map((x) => x.regla);
  return textos.map((t) => {
    const regla = reglas.find((r) => t.startsWith(nombreDeRegla(r) + ': '));
    if (!regla) return { regla: null, mensaje: t };
    return { regla: nombreDeRegla(regla), mensaje: mensaje(eje, regla, idioma, { ev, ...opciones }) ?? t };
  });
}

/**
 * Construye la transacción de una plantilla sobre X (params.X: el registro) con los parámetros, para `yo`, y la
 * valida en seco: primero los parámetros con su 2 (motivos por parámetro), después la transacción entera contra las
 * reglas del eje (eje.validar: las condiciones sobre el libro de antes, sin asentar). Devuelve { ok, evento, motivos:
 * [{ regla, mensaje }] } con los mensajes en el idioma de la configuración de yo (o el que se pida). Con
 * `opciones.firmar` (async (evento) → evento firmado) la candidata se firma antes de validarse y el evento vuelve
 * firmado (quien tiene clave firma: sin esto, una identidad con clave no pasaría la validación en seco). Si ok, la
 * carta lo asienta con lo que ya existe (eje.anadir); aquí no se asienta nada. Una plantilla que solo lee
 * (read) devuelve ok con `lectura`; una que lanza el camino (path), el paso que lanzaría (o todos, con path all).
 */
export async function transaccion(eje, cual, params = {}, yo, opciones = {}) {
  opciones = conEpoca(eje, opciones);
  const plantilla = plantillaDeTransaccion(cual, opciones);
  const modo = plantilla ? modoDeEjecucion(eje, plantilla, opciones) : null;
  // El modo de ejecución (VG 12-11, #71.1): una plantilla «person» no la lanza un agente (una cosa que su dueño declaró agente); lo demás, como antes.
  if (modo && modo.modo === 'person' && esAgente(eje, yo, opciones)) {
    const epoca = epocaDe(opciones, eje);
    const idioma = idiomaDe(eje, yo, opciones);
    const nombre = nombreDeAccion(plantilla);
    return { ok: false, evento: null, modo: modo.modo, motivos: [{ regla: nombre, mensaje: motivoDe('only a person launches', { name: nombre, who: yo, mode: textoDe(eje, claves.modo(modo.modo), idioma, { original: modo.modo, epoca }) }, { idioma, epoca }) }] };
  }
  const r = await construirTransaccion(eje, plantilla, cual, params, yo, opciones);
  return modo ? { ...r, modo: modo.modo } : r;
}

async function construirTransaccion(eje, plantilla, cual, params, yo, opciones) {
  const epoca = epocaDe(opciones, eje);
  const idioma = idiomaDe(eje, yo, opciones);
  if (!plantilla) return { ok: false, evento: null, motivos: [{ regla: null, mensaje: motivoDe('unknown template', { template: String(Array.isArray(cual) ? cual[0] : cual?.ref ?? cual) }, { idioma, epoca }) }] };
  const nombre = nombreDeAccion(plantilla);
  const { X: cualX, ...dados } = params;
  const X = eventoDe(eje, cualX);
  if (!X || !eje?.obtener(X.id)) return { ok: false, evento: null, motivos: [{ regla: nombre, mensaje: motivoDe('X not in ledger', { name: nombre }, { idioma, epoca }) }] };
  if (typeof yo !== 'string' || !yo) return { ok: false, evento: null, motivos: [{ regla: nombre, mensaje: motivoDe('who launches', { name: nombre }, { idioma, epoca }) }] };
  const t = relojDe(eje, opciones);
  if (esLectura(plantilla)) {
    const { motivos, candidata } = preparar(eje, plantilla, X, yo, dados, { t, epoca, idioma });
    return { ok: motivos.length === 0, evento: null, motivos, lectura: { nombre, mensaje: mensajeDe(eje, epoca, plantilla, candidata, yo, X, idioma) } };
  }
  if (esCamino(plantilla)) {
    const todo = hojas(plantilla[4]).includes('all');
    const { pasos } = await camino(eje, X, yo, opciones);
    const mios = pasos.filter((p) => p.hacer && !p.espera && !p.hecho);
    if (todo) return { ok: true, evento: null, motivos: [], pasos: mios };
    const primero = mios[0];
    if (!primero) return { ok: true, evento: null, motivos: [], paso: null };
    const r = await transaccion(eje, primero.hacer.plantilla, { X: primero.hacer.X ?? X.id, ...primero.hacer.parametros }, yo, opciones);
    return { ...r, paso: primero };
  }
  const prep = preparar(eje, plantilla, X, yo, dados, { t, epoca, idioma });
  if (prep.motivos.length) return { ok: false, evento: null, motivos: prep.motivos };
  // Lo que mueve (VG 12-11, decisiones 5, 6 y 10): las sentencias del 4 en BQL; «write» no mueve más que el coste.
  const hecha = movimientosBql(eje, epoca, plantilla, prep.candidata, yo, X, idioma);
  const motivos = hecha.motivos;
  const movimientos = [...hecha.movimientos];
  if (motivos.length) return { ok: false, evento: null, motivos };
  const payload = prep.payload;
  // La representación del registro: el mensaje de la plantilla, salvo que un parámetro ocupe el 0.
  // Se rellena sobre la candidata sin movimientos: así el 1 y el 3 del payload no colisionan con D-META.
  if (!prep.parametros.some((p) => p.posicion === '0' && prep.valores[p.nombre] !== undefined)) payload[0] = mensajeDe(eje, epoca, plantilla, prep.candidata, yo, X);
  // El coste de escribir (VG 12-11, decisión 7): una regla de la época para toda candidata, por posición; va delante,
  // donde iba el minuto copiado. La escala, la pedida (opciones.escala) o la menor que lo cubre.
  // Ejecutar desde el 4 (VG 12-11, decisión 7): con `opciones.denominacion` (la escala de la que parte o las piezas, lo
  // que el 4 propone y el usuario ajusta), la T del coste se quema en esas piezas; el resumen va en el resultado.
  // La autorización (VG 14-11, #70 (3) bis): si lo que mueve requiere segundo factor, la propuesta TRANSFIERE a cada cosa
  // titular max(tarifa, coste de escribir su autorización) (la tarifa, un segundo por elemento, mínimo un minuto): la cosa
  // escribe la autorización con esa T y no gasta la suya. Lo que se quema aquí es solo el coste de escribir la propuesta.
  let coste;
  let resumen;
  let aut;
  let quema;
  try {
    // Un parámetro «cost» de la plantilla (encargo A18, «ask for more firmness») manda sobre la escala y la denominación pedidas:
    // el coste se paga en esa escala, de más vale, y esa quema es la petición.
    const delParametro = escalaDelParametro(prep);
    coste = costeDe(payload, yo, { epoca, escala: delParametro ?? opciones.escala, eje });
    const conDenominacion = !delParametro && opciones.denominacion !== undefined && opciones.denominacion !== null;
    const pedida = delParametro ? (coste.movimiento ? [{ escala: coste.movimiento.escala, cantidad: coste.movimiento.cantidad }] : null) : opciones.denominacion;
    const resumenCon = (a) => resumenDeEjecucion(eje, { payload, movimientos, yo, t, epoca, nombre, pedida, coste: coste.exigido, aut: a });
    const comoQuema = (piezas) => piezas.filter(Boolean).map((p) => ({ token: 'T', escala: p.escala, cantidad: p.cantidad, de: yo, a: null }));
    const delCoste = conDenominacion ? comoQuema(resumenCon(null).denominacion) : coste.movimiento ? [coste.movimiento] : [];
    aut = autorizacionDe(eje, epoca, { autor: yo, sobre: prep.sobre, en: prep.en, t, payload }, [...delCoste, ...movimientos], { yo, t, idioma });
    resumen = resumenCon(aut);
    quema = [...delCoste, ...comoTransferencias(aut.transferencias, yo)];
  } catch (e) {
    return { ok: false, evento: null, motivos: [{ regla: nombre, mensaje: nombre + ': ' + e.message }] };
  }
  movimientos.unshift(...quema);
  // Las claves que el registro declara y sus pruebas de posesión (un parámetro con «key {p}» o «proof {p}» en su 4): la
  // clave va en el contexto (el 5 del evento, dentro del cuerpo), la prueba fuera del cuerpo, como la firma; así una
  // persona da de alta una cosa con la clave de la cosa (la prueba la firma la cosa sobre el id de este registro).
  const claves = {};
  const posesion = {};
  for (const p of prep.parametros) {
    const v = prep.valores[p.nombre];
    if ((p.destino.que !== 'key' && p.destino.que !== 'proof') || v === undefined) continue; // payload y file van en el payload
    const quien = conHuecos(p.destino.para, prep.valores);
    if (!quien) return { ok: false, evento: null, motivos: [{ regla: p.nombre, mensaje: p.etiqueta + ': ' + p.ayuda, parametro: p.nombre }] };
    (p.destino.que === 'key' ? claves : posesion)[quien] = String(v);
  }
  let evento;
  try {
    evento = await crearEvento({ autor: yo, sobre: prep.sobre, en: prep.en, t, movimientos, payload, ...(Object.keys(claves).length ? { contexto: { claves } } : {}) });
    if (Object.keys(posesion).length) evento = Object.freeze({ ...evento, posesion });
    // Quien tiene clave firma (R9): la candidata se valida ya firmada, con lo que la carta sepa firmar (opciones.firmar,
    // async (evento) → evento firmado); si no, una identidad con clave vería siempre «who has a key signs».
    if (typeof opciones.firmar === 'function') evento = (await opciones.firmar(evento)) ?? evento;
  } catch (e) {
    return { ok: false, evento: null, motivos: [{ regla: nombre, mensaje: nombre + ': ' + e.message }] };
  }
  const textos = await eje.validar(evento);
  const delEje = motivosDelEje(eje, textos, evento, idioma, opciones);
  // El segundo factor (VG 12/13-11): si la candidata alcanza un criterio de quien la lanza, el registro se escribe igual y
  // su estación espera la autorización del titular; aquí solo se dice, para avisar.
  // Una lectura del segundo factor que pasa del presupuesto (al calcular la autorización o sobre la candidata) se dice en
  // segundoFactor.motivos: no bloquea (lo que valida es el eje), pero no se calla.
  const segundo = segundoFactorDeCandidata(eje, epoca, evento, { idioma });
  const avisos = [...aut.motivos, ...segundo.motivos].filter((m, i, todos) => todos.findIndex((x) => x.regla === m.regla && x.mensaje === m.mensaje) === i);
  return { ok: delEje.length === 0, evento, motivos: delEje, exigido: coste.exigido, autorizacion: aut.segundos, transferencias: resumen.partes.find((p) => p.parte === 'autorizacion')?.transferencias ?? [], ejecucion: resumen, segundoFactor: { ...segundo, motivos: avisos } };
}

// ---------- 3b. las opiniones como registros ----------

/**
 * El registro que nombra un texto: su id entero, los primeros caracteres de un id (ocho o más, si solo uno empieza así)
 * o su 0 (lo que dice contrato.desdeLegible para una referencia). null si no es ninguno.
 */
export function registroDe(eje, cual, opciones = {}) {
  opciones = conEpoca(eje, opciones);
  const s = String(cual ?? '').trim();
  if (!s || !eje) return null;
  if (RE_ID.test(s) && eje.obtener(s)) return s;
  if (/^[0-9a-f]{8,63}$/.test(s)) {
    const a = eje.orden.filter((id) => id.startsWith(s));
    if (a.length === 1) return a[0];
  }
  const r = desdeLegible(s, 'ref', { eje, ...opciones });
  return typeof r.valor === 'string' ? r.valor : null;
}

/** El registro del proyecto donde `yo` ancla sus opiniones (su ajuste «opinions anchor», resuelto con registroDe), o null. */
export function proyectoDeOpiniones(eje, yo, opciones = {}) {
  opciones = conEpoca(eje, opciones);
  const v = yo ? anclaDeLasOpiniones(eje, yo, opciones) : null;
  return v ? registroDe(eje, v, opciones) : null;
}

/**
 * Las opiniones ancladas en un registro (el proyecto AGRAM): los registros anclados bajo él cuya plantilla es la de
 * opinión (el nombre lo da la guía de la época, su 7), con sus respuestas (los registros anclados debajo de cada una, en
 * hilo). → [{ id, autor, t, texto, clasificacion: [«etiqueta: valor»], sobre (el id del registro opinado o null), ruta,
 * respuestas: [{ id, autor, t, texto, respuestas }] }], en el orden del libro. Lo lee la carta para listarlas en el 6 y
 * lo lee quien lea el eje desde fuera: sin código especial.
 */
export function opiniones(eje, proyecto, opciones = {}) {
  opciones = conEpoca(eje, opciones);
  const P = eventoDe(eje, proyecto);
  const tipo = guiaDeLaEpoca(null, 'en', opciones)?.opinion;
  if (!P || !eje?.obtener(P.id) || !tipo) return [];
  const textoDe0 = (e) => String(hojas(e.payload?.[0]).find((x) => typeof x === 'string' || typeof x === 'number') ?? '');
  const hilo = (e, hondo) => eje.sobre(e.id).map((h) => ({ id: h.id, autor: h.autor, t: h.t, texto: textoDe0(h), respuestas: hondo < 12 ? hilo(h, hondo + 1) : [] }));
  const orden = new Map(eje.orden.map((id, i) => [id, i]));
  return eje.sobre(P.id)
    .filter((h) => nombreDePlantilla(plantillaDeDatos(eje, h, opciones)) === tipo)
    .sort((a, b) => orden.get(a.id) - orden.get(b.id))
    .map((h) => ({
      id: h.id, autor: h.autor, t: h.t, texto: textoDe0(h),
      clasificacion: hojas(h.payload?.[1]).filter((x) => typeof x === 'string'),
      sobre: hojas(h.payload?.[6]).find((x) => esReferencia(x))?.ref ?? null,
      ruta: hojas(h.payload?.[9]).filter((x) => typeof x === 'string'),
      respuestas: hilo(h, 0),
    }));
}

// ---------- 4. las estaciones ----------

/**
 * Las estaciones de la fábrica (epoch.4.2): [{ familia, estacion, plantilla, autoriza }]. `autoriza` (encargo «datos2»,
 * issue #11) es la cuarta posición de la estación, lo que autoriza un anuncio pendiente (la estación intermedia
 * «autorizada»): `epoch.9.0.0`, el recuento del anuncio con el criterio de su dueño; null si la época no dice nada.
 */
export function estacionesDeLaEpoca(opciones = {}) {
  const raiz = raizDe(epocaDe(opciones));
  return hojas(en(raiz, SITIO.estaciones)).filter((x) => Array.isArray(x) && esDecupla(x)).map((x) => {
    const autoriza = texto(hoja(x[3]));
    return { familia: hoja(x[0]), estacion: hoja(x[1]), plantilla: hoja(x[2]), autoriza: autoriza ?? null };
  });
}

/** Lo que una estación sabe leer como autorización (epoch.4.2, su cuarta posición): el recuento del anuncio (motor.recuento). */
const AUTORIZA = Object.freeze({ recuento: 'epoch.9.0.0' });

/** ¿Pasa el recuento de un anuncio (el de su dueño, motor.recuento) su umbral? Lo que autoriza un anuncio pendiente. */
function recuentoPasa(eje, id) {
  try { return recuento(eje, id).pasa === true; } catch { return false; }
}

/**
 * Las estaciones por las que pasa un movimiento anunciado (VG 12-11, decisión 8; #50): datos de la época (epoch.4.3),
 * en su orden, [{ nombre, comprueba }]: `comprueba` es una fórmula del BQL mínimo con it = el anuncio, o `epoch.9.0.0`
 * (el recuento del anuncio con el criterio de su dueño, motor.recuento). Hoy: propuesta, autorizada, ejecutada y
 * verificada. Sin ellas en la época, las tres de antes (propuesta, autorizada por el recuento, ejecutada si no está en
 * la lectura «stage» de su registro).
 */
export function estacionesDelAnuncio(opciones = {}) {
  const filas = hojas(en(raizDe(epocaDe(opciones)), SITIO.estacionesDelAnuncio)).filter((x) => Array.isArray(x) && esDecupla(x));
  const de = filas.map((x) => ({ nombre: texto(hoja(x[0])), comprueba: texto(ultima(x[1])) })).filter((x) => x.nombre && x.comprueba);
  return de.length ? de : [
    { nombre: 'propuesta', comprueba: '=count it.5 > 0' },
    { nombre: 'autorizada', comprueba: AUTORIZA.recuento },
    { nombre: 'ejecutada', comprueba: '=not (it in (first (first (up it)).4).8)' },
  ];
}

/**
 * La estación de un anuncio (VG 12-11, decisión 8): la última de epoch.4.3 que se cumple, comprobada sobre el anuncio
 * (el motor solo comprueba: los nombres y las condiciones son de la época). null si no es un registro del eje.
 */
export function estacionDeAnuncio(eje, id, opciones = {}) {
  return estacionDeAnuncioConMotivos(eje, id, opciones)?.estacion ?? null;
}

/**
 * La estación de un anuncio y lo que no se ha podido comprobar (#70: el desbordamiento no se calla en las estaciones):
 * { estacion, desbordado, motivos: [{ regla, mensaje, estado, estaciones }] } o null si no es un registro del eje. Una
 * estación de epoch.4.3 cuya fórmula no se resuelve por un límite de cálculo de BQL (PENDIENTE POR LÍMITE, como la
 * lectura «second factor» con muchos criterios del mismo autor) no se cumple, como antes; pero si va DETRÁS de la última que se cumple
 * (podría cambiar la estación), el anuncio queda `desbordado` y `motivos` dice cuáles no se han podido comprobar y por
 * qué. `regla` es la lectura de la época que no se ha podido hacer, si el motivo la nombra.
 */
export function estacionDeAnuncioConMotivos(eje, id, opciones = {}) {
  opciones = conEpoca(eje, opciones);
  if (!eje?.obtener(id)) return null;
  const epoca = epocaDe(opciones, eje);
  const ctx = contextoDe(eje, epoca, {});
  let fuera = null;
  let sinComprobar = [];
  for (const { nombre, comprueba } of estacionesDelAnuncio(opciones)) {
    if (comprueba === AUTORIZA.recuento) {
      if (recuentoPasa(eje, id)) [fuera, sinComprobar] = [nombre, []];
      continue;
    }
    if (!esFormula(comprueba)) continue;
    const r = evaluar(comprueba, ctx, { sujeto: id });
    if (r.estado === 'RESUELTO' && r.valor.length === 1 && r.valor[0] === true) [fuera, sinComprobar] = [nombre, []];
    else if (r.subtipo === POR_LIMITE) sinComprobar.push({ estacion: nombre, estado: r.estado, motivo: r.motivo ?? r.estado });
  }
  if (!sinComprobar.length) return { estacion: fuera, desbordado: false, motivos: [] };
  const idioma = opciones.idioma ?? 'es';
  const lecturas = (Array.isArray(epoca?.lecturas) ? epoca.lecturas : []).map((r) => nombreDeRegla(r)).filter(Boolean);
  // Un motivo por causa (las estaciones que no se han podido comprobar por lo mismo, juntas).
  const porCausa = new Map();
  for (const x of sinComprobar) {
    if (!porCausa.has(x.motivo)) porCausa.set(x.motivo, { estado: x.estado, estaciones: [] });
    if (!porCausa.get(x.motivo).estaciones.includes(x.estacion)) porCausa.get(x.motivo).estaciones.push(x.estacion);
  }
  const motivos = [...porCausa].map(([why, { estado, estaciones }]) => ({
    regla: lecturas.find((n) => String(why).includes(n + ':')) ?? null,
    mensaje: motivoDelSegundoFactor('stage unreadable', { stages: estaciones.map((e) => '«' + e + '»').join(', '), current: fuera ?? '', why }, { idioma, epoca }),
    estado,
    estaciones,
  }));
  return { estacion: fuera, desbordado: true, motivos };
}

/**
 * Lo anunciado en X por estación (la lectura «stage», X.4.8, y los anuncios de su 4.1): [{ familia, estacion,
 * plantilla, autoriza, anunciados, hechos, pendientes, autorizados }], cada lista con los ids de los anuncios. La
 * familia de un anuncio se lee buscando su serie por su valor en las del libro (before.4). `autorizados` (encargo
 * «datos2», issue #11) son los pendientes que la estación da por autorizados (su `autoriza`): siguen pendientes.
 * `verificados` son los que epoch.4.3 da por verificados (lo que los cumple está «firm», X.6.8.9). Desde el 16-11 (VG,
 * encargo «firmeza») «ejecutada» ya no espera al sello y no hay «pendientes de sello»: hasta qué capa ha llegado cada
 * registro lo dicen sus estaciones de firmeza (contrato.firmeza).
 * `pendientesDeSegundoFactor` (VG 12/13-11, #66, #70) son los hechos que epoch.4.3 deja en autorizada porque algo de lo
 * que los cumple espera su segundo factor (segundoFactor: la lectura «second factor» sin su «authorized by the holder»).
 * `desbordados` (#70) son los anuncios cuya estación no se ha podido comprobar del todo (una
 * fórmula de epoch.4.3 queda PENDIENTE por un límite de cálculo de BQL, como la lectura «second factor» con muchos
 * criterios del mismo autor) y `motivosDe` sus motivos por id (estacionDeAnuncioConMotivos): no se calla.
 */
export function estaciones(eje, X, opciones = {}) {
  opciones = conEpoca(eje, opciones);
  const ev = eventoDe(eje, X);
  if (!ev || !eje?.obtener(ev.id)) return [];
  const epoca = epocaDe(opciones, eje);
  const ctx = contextoDe(eje, epoca, {});
  const s = '("' + ev.id + '")';
  // Los anuncios de X: los registros que su dueño ancla en su 4.1 (como los lee la plantilla de cerrado, por `down`:
  // lo anclado en el 4 de X no se confunde con ellos); los pendientes, la lectura «stage».
  const anuncios = '((down ' + s + ') where last (first it.6).5 = "4100000000" and first it.3 = first ' + s + '.3)';
  // La familia de un anuncio: la de su movimiento anunciado (VG 12-11, decisión 8: D-MOV 0.0.0) o, en la forma de antes
  // (un payload que imita un movimiento), la de la serie que nombra, buscada por su valor en las del libro (before.4).
  const familia = (f) => f + ' in (first (moves it where "anunciado" in it2.2)).0.0.0 or count (moves it where "anunciado" in it2.2) = 0 and ' + f + ' in (before.4.(first it.0)).0.0';
  return estacionesDeLaEpoca(opciones).map((e) => {
    const de = (expr) => (valores('((' + expr + ' where count it.5 > 0) where ' + familia(e.familia) + ') each 5', ctx).valores ?? []).filter((x) => typeof x === 'string');
    const anunciados = [...new Set(de(anuncios))];
    const pendientes = [...new Set(de(s + '.4.8'))];
    // La estación de cada anuncio (epoch.4.3); «autorizada» solo si la estación de su familia autoriza (su 4 de epoch.4.2).
    const conMotivos = new Map(anunciados.map((id) => [id, estacionDeAnuncioConMotivos(eje, id, opciones)]));
    const estacion = new Map(anunciados.map((id) => { const x = conMotivos.get(id)?.estacion ?? null; return [id, x === 'autorizada' && !e.autoriza ? 'propuesta' : x]; }));
    // #70: una estación que no se ha podido comprobar (el límite de cálculo de BQL) no se calla: el anuncio sale en
    // `desbordados` y su motivo en `motivosDe`.
    const desbordados = anunciados.filter((id) => conMotivos.get(id)?.desbordado);
    const sinEjecutar = anunciados.filter((id) => !pendientes.includes(id) && estacion.get(id) !== 'ejecutada' && estacion.get(id) !== 'verificada');
    const conSegundoFactor = new Set(sinEjecutar.filter((id) => eje.sobre(id).some((h) => esperaSegundoFactor(eje, h, opciones))));
    return {
      ...e, anunciados, pendientes, hechos: anunciados.filter((id) => !pendientes.includes(id)),
      autorizados: pendientes.filter((id) => estacion.get(id) === 'autorizada'),
      verificados: anunciados.filter((id) => estacion.get(id) === 'verificada'),
      pendientesDeSegundoFactor: [...conSegundoFactor],
      estacionDe: Object.fromEntries(estacion),
      desbordados,
      motivosDe: Object.fromEntries(desbordados.map((id) => [id, conMotivos.get(id).motivos])),
    };
  });
}

/** Un movimiento anunciado en llano: «huesped da 1 hora a cocina» (los formatos «legible announced movement» de epoch.9.4). */
function movimientoLegible(eje, m, idioma, opciones) {
  const o = { idioma, epoca: epocaDe(opciones, eje) };
  // Quién, por su identidad (como la frase de previsualizar de la carta); cuánto, por su serie legible.
  const partes = { amount: legible(eje, { serie: m.serie, cantidad: m.cantidad }, undefined, o).texto, from: m.de ?? '', to: m.a ?? '' };
  const formato = textoDe(eje, claves.legible(m.a ? 'announced movement' : 'announced movement from'), idioma, { original: m.a ? '{from} gives {amount} to {to}' : '{from} gives {amount}', epoca: o.epoca });
  return String(formato).replace(/\{([^{}]+)\}/g, (_, k) => String(partes[k] ?? ''));
}

/** ¿Espera este registro su segundo factor? (segundoFactor) */
function esperaSegundoFactor(eje, h, opciones) {
  return segundoFactor(eje, h.id, opciones)?.pendiente === true;
}

/**
 * Las ejecuciones de la fábrica de X, para la matriz del 4 (encargo «datos2», issue #11; Core, pendiente de revisar VG):
 * lo propio del 4 de X y cada registro anclado en X (en cualquier posición: registrar ya es ejecutar, docs/MOTOR.md),
 * por llegada: [{ ocupante, pv, posicion, accion, estacion }]. `posicion` es la que modifica (el primer dígito del `en`
 * del registro); `pv`, el tipo de interacción: el de la plantilla de transacción que el registro nombra en su 4 (la
 * acción que lo escribió) o, si es un anuncio del 4.1, el de la plantilla de su estación (pay, deliver); `estacion`,
 * la de un anuncio: «ejecutada» (hecho), «autorizada» (pendiente y autorizado) o «propuesta» (pendiente). Lo que no se
 * sabe va a null (lo propio del payload no tiene ni lo uno ni lo otro): la carta lo pone aparte, sin inventar celda.
 * Encargo «el4» (VG 12-11, #41): cada una lleva además su celda de la matriz del 4 (contrato.celdaDeEjecucion):
 * `oficio` (la fila, el tipo de acción), `ejecucion` (la columna, lo que mueve) y `por` (de dónde sale cada uno).
 * El segundo factor (VG 12/13-11, #66, #70): un anuncio que epoch.4.3 deja en autorizada porque lo que lo cumple espera
 * su segundo factor lleva `pendienteDeSegundoFactor: true`; y un registro anclado en X que no es un anuncio y alcanza un
 * criterio «second factor» de su autor tiene estación propia: «autorizada» con `pendienteDeSegundoFactor` mientras falte
 * la autorización del titular, «ejecutada» cuando la tiene (sin criterio alcanzado, nada cambia: sin estación).
 */
export function ejecuciones(eje, X, opciones = {}) {
  opciones = conEpoca(eje, opciones);
  const ev = eventoDe(eje, X);
  if (!ev || !eje?.obtener(ev.id)) return [];
  const plantillas = plantillasDeTransaccion(opciones);
  const porNombre = new Map(plantillas.map((p) => [p.nombre, p]));
  const estacionDe = new Map();
  const plantillaDe = new Map();
  const sinSegundoFactor = new Set();
  const motivosDe = new Map();
  for (const e of estaciones(eje, ev.id, opciones)) {
    for (const [id, m] of Object.entries(e.motivosDe ?? {})) motivosDe.set(id, m);
    for (const id of e.pendientesDeSegundoFactor ?? []) sinSegundoFactor.add(id);
    for (const id of e.anunciados) plantillaDe.set(id, e.plantilla);
    // La estación de cada anuncio la dice la época (epoch.4.3; VG 12-11, decisión 8): el motor solo comprueba.
    for (const id of e.anunciados) estacionDe.set(id, e.estacionDe[id] ?? (e.pendientes.includes(id) ? (e.autorizados.includes(id) ? 'autorizada' : 'propuesta') : 'ejecutada'));
  }
  const anclados = eje.sobre(ev.id);
  const deX = new Set(anclados.map((h) => h.id));
  const total = ocupantesDeContrato(eje, ev.id, 4, 0, 0, opciones).total;
  const propios = ocupantesDeContrato(eje, ev.id, 4, 0, total, opciones).ocupantes
    .filter((o) => !(esReferencia(o) && deX.has(o.ref)))
    .map((o) => ({ ocupante: o, pv: null, posicion: null, accion: null, estacion: null, oficio: null, ejecucion: null, por: null }));
  return [...propios, ...anclados.map((h) => {
    const accion = hojas(h.payload?.[4]).find((x) => typeof x === 'string' && porNombre.has(x)) ?? plantillaDe.get(h.id) ?? null;
    const posicion = Number(String(h.en ?? '0')[0]);
    const celda = celdaDeEjecucion(eje, h.id, opciones);
    // Lo que no es un anuncio y alcanza un segundo factor de su autor: autorizada hasta que el titular lo autoriza.
    const sf = estacionDe.has(h.id) ? null : segundoFactor(eje, h.id, opciones);
    if (sf?.pendiente) sinSegundoFactor.add(h.id);
    if (sf?.motivos?.length) motivosDe.set(h.id, sf.motivos);
    const estacion = estacionDe.get(h.id) ?? (sf?.exige ? (sf.pendiente ? 'autorizada' : 'ejecutada') : null);
    return {
      ocupante: { ref: h.id }, pv: accion && porNombre.has(accion) ? porNombre.get(accion).pv : null, posicion: Number.isInteger(posicion) ? posicion : null, accion, estacion,
      oficio: celda?.oficio ?? null, ejecucion: celda?.ejecucion ?? null, por: celda?.por ?? null,

      // el segundo factor (#66, #70): movido, pero espera la autorización del titular (una cosa del autor).
      ...(sinSegundoFactor.has(h.id) ? { pendienteDeSegundoFactor: true } : {}),
      // #70: lo que no se ha podido comprobar (un límite de cálculo de BQL) no se calla: `desbordado` y sus motivos.
      ...(motivosDe.has(h.id) ? { desbordado: true, motivos: motivosDe.get(h.id) } : {}),
    };
  })];
}

// ---------- 4 ter. las preferencias de formato (#93) ----------

/** El nombre de la plantilla de las preferencias de formato (#93): la que lee configuracionDeFormato. */
export const AJUSTES_DE_FORMATO = 'format settings';

/**
 * Mis preferencias de formato (#93): el registro «format settings» anclado en el 9 de mi alta por mí (el último), leído
 * por sus claves, como «language» en las preferencias; sin registro, los de siempre (el primer valor de cada una).
 * → { 'date format': legible | larga | corta | iso, 'number format': tal-cual | agrupados, 'editor style': expandido |
 * compacto, 'editor view': crudo | formateado, de }. Un valor que la enumeración de la plantilla no tiene (un registro
 * escrito a mano) vuelve al de siempre; validar(eje, registro) lo señala.
 */
export function configuracionDeFormato(eje, quien, opciones = {}) {
  opciones = conEpoca(eje, opciones);
  const c = configuracionDe(eje, quien, AJUSTES_DE_FORMATO, opciones);
  for (const { clave, defecto, valores } of clavesDeConfiguracionDe(AJUSTES_DE_FORMATO, opciones)) {
    if (Array.isArray(valores) && !valores.includes(c[clave])) c[clave] = defecto;
  }
  return c;
}


// ---------- 4 bis. el segundo factor (VG 12/13-11, #66, #70; SIP 0 de StateArk) ----------

/**
 * Lo que el segundo factor lee y escribe, por su nombre en la época. Las dos lecturas son reglas de la época
 * (datos/epocas/reglas/second-factor.json y authorized-by-the-holder.json): aquí solo se leen. La autorización es el
 * objeto «autorización» del SIP 0 en modo segundo factor: 0 [«autorización», «SIP 0»], 1 lo autorizado (su «sobre»),
 * 2 la etiqueta de uso, 3 el titular; sin 4 (la firma es la del registro).
 */
export const SEGUNDO_FACTOR = Object.freeze({
  criterio: 'second factor', // la acción en el 4 del criterio (la plantilla PV2 «second factor»)
  lectura: 'second factor', // la lectura de la época en X.6.8.7 (datos/epocas/reglas/second-factor.json)
  autorizadas: 'authorized by the holder', // la lectura de la época en X.6.8.8 (authorized-by-the-holder.json)
  en: '2400000000', // el 2.4 del alta: criterios sobre lo que se hace (el 4)
  exige: '(first it.6).8.7', // «second factor»: los criterios del autor que el registro alcanza
  autorizan: '(first it.6).8.8', // «authorized by the holder»: los que ya tienen su autorización
  objeto: Object.freeze(['autorización', 'SIP 0']),
  uso: 'StateArk/SecondFactor/v1',
  ancla: '4000000000', // la autorización se ancla en el 4 de lo autorizado
});

/** La condición de la época que exige que todo registro pague su escritura (la que rechazaría una autorización sin T). */
const REGLA_DE_ESCRIBIR = "writing burns today's T";

/** Un criterio «second factor» (un registro del 2.4 de un alta) leído: { id, nombre, familias, cantidad, titular }. */
function criterioDe(eje, id) {
  const p = eje.obtener(id)?.payload;
  return { id, nombre: texto(hoja(p?.[0])) ?? null, familias: hojas(p?.[1]).filter((x) => typeof x === 'string'), cantidad: hoja(p?.[2]) ?? null, titular: texto(hoja(p?.[3])) ?? null };
}

/** Los criterios «second factor» de `yo`: los que él mismo ancla en el 2.4 de su alta (la plantilla PV2), por llegada. */
export function criteriosDeSegundoFactor(eje, yo) {
  const alta = yo ? eje?.alta?.(yo)?.id : null;
  if (!alta) return [];
  return eje.sobre(alta, SEGUNDO_FACTOR.en).filter((h) => h.autor === yo && hojas(h.payload?.[4]).includes(SEGUNDO_FACTOR.criterio)).map((h) => criterioDe(eje, h.id));
}

/**
 * Los criterios del 2.4 que NO son «second factor» (los escribe otra plantilla de la época): una época que hereda puede
 * redefinir la lectura «second factor» para que alcancen registros de otros autores (docs/CONTRATO.md §12.4 bis; la época
 * de la clase state, el criterio de un nodo por plantilla). Mientras el eje no tiene ninguno, todo sigue como en la 0 (el
 * atajo «sin criterios propios del autor no hay nada que leer»); con alguno, se lee siempre. Cada uno, como criterioDe;
 * se recuerda por eje y, cuando el libro crece, solo se mira lo nuevo.
 */
const CRITERIOS_DE_OTRA_PLANTILLA = new WeakMap();
export function criteriosDeOtraPlantilla(eje) {
  if (!Array.isArray(eje?.orden)) return [];
  const visto = CRITERIOS_DE_OTRA_PLANTILLA.get(eje);
  if (visto && visto.n === eje.orden.length) return visto.criterios;
  // El orden del libro solo crece por detrás: se mira lo llegado desde la última vez, no el libro entero cada vez.
  const sigue = visto && visto.n < eje.orden.length && eje.orden[visto.n - 1] === visto.ultimo;
  const criterios = sigue ? [...visto.criterios] : [];
  for (let k = sigue ? visto.n : 0; k < eje.orden.length; k++) {
    const id = eje.orden[k];
    const ev = eje.obtener(id);
    if (ev?.en === SEGUNDO_FACTOR.en && !eje.esDeLaEpoca?.(id) && !hojas(ev.payload?.[4]).includes(SEGUNDO_FACTOR.criterio)) criterios.push(criterioDe(eje, id));
  }
  CRITERIOS_DE_OTRA_PLANTILLA.set(eje, { n: eje.orden.length, ultimo: eje.orden.at(-1), criterios });
  return criterios;
}

/** ¿Puede esperar segundo factor lo que escribe `autor`? Si tiene criterios propios o el eje tiene criterios de otra plantilla (arriba). */
const puedeTenerSegundoFactor = (eje, autor) => criteriosDeSegundoFactor(eje, autor).length > 0 || criteriosDeOtraPlantilla(eje).length > 0;

/** Las autorizaciones ancladas sobre un registro (las que dicen «autorización» en su 0), de quien sean: { id, autor, firmante, titular, uso, sobre }. */
function autorizacionesSobre(eje, id) {
  return eje.sobre(id).filter((h) => hojas(h.payload?.[0]).includes(SEGUNDO_FACTOR.objeto[0])).map((h) => ({
    id: h.id, autor: h.autor, firmante: h.firma && h.firmante ? h.firmante : null, titular: texto(hoja(h.payload?.[3])) ?? null,
    uso: texto(hoja(h.payload?.[2])) ?? null, sobre: hojas(h.payload?.[1]).find(esReferencia)?.ref ?? null,
  }));
}

/**
 * ¿Espera X su segundo factor? (VG 12/13-11, #66, #70). Fachada sin lógica propia: lee las dos lecturas de la época,
 * «second factor» (X.6.8.7: los criterios de su autor que X alcanza) y «authorized by the holder» (X.6.8.8: los que ya
 * tienen la autorización escrita y firmada por su titular). → { exige, pendiente, criterios: [{ id, nombre, familias,
 * cantidad, titular, autorizado }], titulares (los que faltan), autorizaciones (las ancladas sobre X, valgan o no),
 * motivo (por qué sigue pendiente, en el idioma), estado, motivos } o null si X no está en el eje. Si una lectura no se
 * resuelve (el presupuesto de cálculo de BQL, con muchos criterios del mismo autor), `motivos` lo dice ({ regla, mensaje,
 * estado }): no exige nada, pero no se calla. Sin criterio alcanzado, nada
 * cambia (`exige: false`). Una lectura que no se resuelve (PENDIENTE: un límite) deja `estado` y no exige nada.
 */
export function segundoFactor(eje, X, opciones = {}) {
  opciones = conEpoca(eje, opciones);
  const ev = eventoDe(eje, X);
  if (!ev || !eje?.obtener(ev.id)) return null;
  const epoca = epocaDe(opciones, eje);
  // Atajo: sin criterios «second factor» de su autor (el 2.4 de su alta, lo que lee la regla de la 0) ni criterios de otra
  // plantilla en el eje (los que una época hija hace alcanzar a otros autores), no hay nada que leer.
  if (!puedeTenerSegundoFactor(eje, ev.autor)) return { exige: false, pendiente: false, criterios: [], titulares: [], autorizaciones: [], motivo: null, estado: 'RESUELTO', motivos: [] };
  const idioma = opciones.idioma ?? 'es';
  const ctx = contextoDe(eje, epoca, {});
  const exigen = valores(SEGUNDO_FACTOR.exige, ctx, ev.id);
  // Una lectura que no se resuelve (el presupuesto de cálculo: con muchos criterios del mismo autor) no se calla: no exige
  // nada, pero `motivos` dice que no se ha podido leer, y por qué.
  if (exigen.estado !== 'RESUELTO') return { exige: false, pendiente: false, criterios: [], titulares: [], autorizaciones: [], motivo: null, estado: exigen.estado, motivos: [motivoDeLectura(eje, SEGUNDO_FACTOR.lectura, exigen, ev.autor, { idioma, epoca })] };
  const ids = [...new Set(exigen.valores.filter((x) => typeof x === 'string'))];
  const autorizan = ids.length ? valores(SEGUNDO_FACTOR.autorizan, ctx, ev.id) : { valores: [], estado: 'RESUELTO' };
  const motivos = autorizan.estado === 'RESUELTO' ? [] : [motivoDeLectura(eje, SEGUNDO_FACTOR.autorizadas, autorizan, ev.autor, { idioma, epoca })];
  const hechos = new Set((autorizan.valores ?? []).filter((x) => typeof x === 'string'));
  const criterios = ids.map((id) => ({ ...criterioDe(eje, id), autorizado: hechos.has(id) }));
  const faltan = criterios.filter((c) => !c.autorizado);
  const autorizaciones = autorizacionesSobre(eje, ev.id);
  let motivo = null;
  if (faltan.length) {
    const c = faltan[0];
    // Una autorización que no vale (la escribe o la firma otro que el titular): se dice quién; si no hay ninguna, falta.
    const otra = autorizaciones.find((a) => a.autor !== c.titular || a.firmante !== c.titular);
    motivo = otra
      ? motivoDe('second factor not by the holder', { holder: c.titular, author: otra.autor, signer: otra.firmante ?? 'nadie' }, { idioma, epoca })
      : motivoDe('second factor missing', { holder: c.titular, family: c.familias.join(' '), amount: c.cantidad }, { idioma, epoca });
  }
  return { exige: criterios.length > 0, pendiente: faltan.length > 0, criterios, titulares: [...new Set(faltan.map((c) => c.titular))], autorizaciones, motivo, estado: autorizan.estado, motivos };
}

/**
 * Los motivos propios del segundo factor que la época aún no traduce (epoch.9.4, «reason <qué>»): si la época trae la
 * clave, manda la época; si no, este texto, en el idioma (español o inglés). Los huecos {…} se rellenan con `partes`.
 */
const MOTIVOS_DEL_SEGUNDO_FACTOR = Object.freeze({
  'second factor unreadable': Object.freeze({
    en: 'the reading «{rule}» could not be done ({why}): {author} has {n} second factor criteria and the reading goes over the computation budget; it is unknown whether this awaits the authorization of its holder',
    es: 'la lectura «{rule}» no se ha podido hacer ({why}): {author} tiene {n} criterios de segundo factor y la lectura pasa del presupuesto de cálculo; no se sabe si esto espera la autorización de su titular',
  }),
  'stage unreadable': Object.freeze({
    en: 'it could not be checked whether it reaches {stages} ({why}): it stays in «{current}» without knowing whether it moves on',
    es: 'no se ha podido comprobar si llega a {stages} ({why}): se queda en «{current}» sin saber si avanza',
  }),
  'authorization without T': Object.freeze({
    en: '{thing} has no T to write the authorization: the proposal transferred {transferred} and it takes {needed}',
    es: 'la cosa {thing} no tiene T para escribir la autorización: la propuesta transfirió {transferred} y hace falta {needed}',
  }),
  'authorization transfer short': Object.freeze({
    en: 'the proposal transfers {transferred} to {thing}, less than writing its authorization costs ({needed})',
    es: 'la propuesta transfiere {transferred} a {thing}, menos de lo que cuesta escribir su autorización ({needed})',
  }),
});

function motivoDelSegundoFactor(que, partes, { idioma = 'es', epoca } = {}) {
  const propio = MOTIVOS_DEL_SEGUNDO_FACTOR[que];
  const formato = textoDe(null, claves.motivo(que), idioma, { original: propio?.[idioma] ?? propio?.en ?? que, epoca });
  return String(formato).replace(/\{([^{}]+)\}/g, (_, k) => (partes[k] === undefined || partes[k] === null ? '' : String(partes[k])));
}

/** Unos segundos del calendario en texto corto («5 min», «1 h 1 min 5 s», «0 s»): igual en español y en inglés. */
function segundosEnTexto(s) {
  const n = Math.max(0, Math.round(s));
  const partes = [[Math.floor(n / 3600), 'h'], [Math.floor((n % 3600) / 60), 'min'], [n % 60, 's']].filter(([k]) => k > 0).map(([k, u]) => k + ' ' + u);
  return partes.length ? partes.join(' ') : '0 s';
}

/**
 * Una lectura del segundo factor que no se resuelve (PENDIENTE por el límite de cálculo de BQL: con muchos criterios
 * del mismo autor, unos 69, la lectura «second factor» pasa del presupuesto) como motivo visible: { regla (la lectura),
 * mensaje (en el idioma), estado }. Antes se apagaba en silencio (no exigía nada); ahora se dice.
 */
function motivoDeLectura(eje, regla, r, autor, { idioma = 'es', epoca } = {}) {
  const n = criteriosDeSegundoFactor(eje, autor).length;
  return { regla, mensaje: motivoDelSegundoFactor('second factor unreadable', { rule: regla, why: r.motivo ?? r.estado, author: autor ?? '', n }, { idioma, epoca }), estado: r.estado };
}

/**
 * Lo que pedirá el segundo factor una candidata aún sin asentar (el aviso del botón de ejecutar, VG 12/13-11): la misma
 * lectura «second factor» con it = la candidata (lo que declara mover: el coste de escribir, las transferencias de la
 * autorización y lo que mueve la plantilla). → { exige, criterios, titulares, estado, motivos }; si la lectura no se
 * resuelve (el presupuesto de cálculo), `motivos` lo dice y no exige nada.
 */
function segundoFactorDeCandidata(eje, epoca, candidata, { idioma } = {}) {
  const ctx = contextoDe(eje, epoca, { ev: candidata });
  const r = valores('(first ev.6).8.7', ctx);
  if (r.estado !== 'RESUELTO') return { exige: false, criterios: [], titulares: [], estado: r.estado, motivos: [motivoDeLectura(eje, SEGUNDO_FACTOR.lectura, r, candidata.autor, { idioma, epoca })] };
  const criterios = (r.valores ?? []).filter((x) => typeof x === 'string' && eje.obtener(x)).map((id) => criterioDe(eje, id));
  return { exige: criterios.length > 0, criterios, titulares: [...new Set(criterios.map((c) => c.titular))], estado: 'RESUELTO', motivos: [] };
}

/**
 * Lo que cuesta autorizar (VG 14-11, #70 (3): «autorizar también quema T»): un segundo por cada ELEMENTO que requiere
 * segundo factor, con un mínimo de un minuto cuando hay al menos uno. El elemento es cada criterio «second factor» que lo
 * movido alcanza (cada criterio alcanzado: la lectura «second factor» de la época da uno por criterio, no por
 * movimiento ni por serie). → segundos (0 si ninguno). Es la TARIFA de cada cosa titular (con sus criterios alcanzados).
 */
export const COSTE_DE_AUTORIZAR = Object.freeze({ porElemento: 1, minimo: SEGUNDOS.minuto });
export const segundosDeAutorizar = (elementos) => (elementos > 0 ? Math.max(elementos * COSTE_DE_AUTORIZAR.porElemento, COSTE_DE_AUTORIZAR.minimo) : 0);

/** El payload de la autorización de `cosa` sobre la propuesta `idPropuesta` (el objeto «autorización» del SIP 0 en modo segundo factor). */
const payloadDeAutorizacion = (idPropuesta, cosa) => [[...SEGUNDO_FACTOR.objeto], [{ ref: idPropuesta }], [SEGUNDO_FACTOR.uso], [cosa]];

/**
 * Lo que cuesta ESCRIBIR la autorización de `cosa` («the cost of writing», por posición, como todo registro), en segundos.
 * La propuesta aún no existe cuando se calcula: su id va como uno de la misma longitud (el coste es por posición, no por
 * contenido). Es lo que la cosa quemará al autorizar (acciones.autorizar).
 */
export function costeDeEscribirAutorizacion(cosa, opciones = {}) {
  const eje = opciones.eje ?? null;
  return exigidoDe(payloadDeAutorizacion('0'.repeat(64), cosa), { eje, epoca: epocaDe(opciones, eje) });
}

/**
 * Lo que la propuesta TRANSFIERE a una cosa titular (VG 14-11, #70 (3) bis): max(tarifa, coste de escribir su
 * autorización); 0 si ningún criterio de esa cosa se alcanza. La tarifa, segundosDeAutorizar(elementos).
 */
export const segundosDeTransferir = (elementos, escribir) => (elementos > 0 ? Math.max(segundosDeAutorizar(elementos), escribir) : 0);

/** Las escalas en que se busca la transferencia de la autorización: el minuto si alcanza, si no la hora o el día (nunca por debajo del minuto, #78). */
const ESCALAS_DE_LA_TRANSFERENCIA = Object.freeze(['minuto', 'hora', 'dia']);

/** La T real de `yo` que ya comprometen unos movimientos (lo que quema o transfiere, sin lo anunciado), por escala. */
function usoDeT(movimientos, yo) {
  const uso = new Map();
  for (const m of movimientos) {
    if (m.token !== 'T' || m.de !== yo || !ESCALAS_REALES.includes(m.escala) || m.estado === ANUNCIADO || m.estado === 'liberacion') continue;
    uso.set(m.escala, (uso.get(m.escala) ?? 0) + m.cantidad);
  }
  return uso;
}

/**
 * Las transferencias de la autorización para unos criterios alcanzados: una por cosa titular (en el orden en que aparece),
 * { cosa, elementos, tarifa, escribir, segundos: max(tarifa, escribir), escala, cantidad, transfiere }. La escala, la
 * misma lógica de denominación que el coste: el minuto si el saldo del día de `yo` lo alcanza junto con lo que ya
 * compromete (`uso`), si no la hora o el día; si ninguna, el minuto (y `alcanza` lo dirá). Unidades enteras (T is whole).
 */
function transferenciasDe(eje, epoca, criterios, { yo, t, uso: usoDado }) {
  const porCosa = new Map();
  for (const c of criterios) if (typeof c.titular === 'string' && c.titular) porCosa.set(c.titular, (porCosa.get(c.titular) ?? 0) + 1);
  const uso = new Map(usoDado);
  return [...porCosa].map(([cosa, elementos]) => {
    const tarifa = segundosDeAutorizar(elementos);
    const escribir = costeDeEscribirAutorizacion(cosa, { eje, epoca });
    const segundos = segundosDeTransferir(elementos, escribir);
    const pieza = (escala) => {
      const cantidad = Math.ceil(segundos / SEGUNDOS[escala] - 1e-9);
      return { escala, cantidad, cabe: typeof eje?.saldoT !== 'function' || eje.saldoT(yo, escala, t) >= (uso.get(escala) ?? 0) + cantidad };
    };
    const { escala, cantidad } = ESCALAS_DE_LA_TRANSFERENCIA.map(pieza).find((p) => p.cabe) ?? pieza('minuto');
    uso.set(escala, (uso.get(escala) ?? 0) + cantidad);
    return { cosa, elementos, tarifa, escribir, segundos, escala, cantidad, transfiere: cantidad * SEGUNDOS[escala] };
  });
}

/** Las transferencias de la autorización como movimientos: T de `yo` a cada cosa titular. */
const comoTransferencias = (transferencias, yo) => transferencias.map((x) => ({ token: 'T', escala: x.escala, cantidad: x.cantidad, de: yo, a: x.cosa }));

/** Lo transferido que no cubriera el coste de escribir la autorización (con el max no debería ocurrir; se comprueba igual). */
const transferenciasCortas = (transferencias, opciones) => transferencias.filter((x) => x.transfiere < x.escribir).map((x) => ({
  regla: SEGUNDO_FACTOR.lectura,
  mensaje: motivoDelSegundoFactor('authorization transfer short', { thing: x.cosa, transferred: segundosEnTexto(x.transfiere), needed: segundosEnTexto(x.escribir) }, opciones),
}));

/**
 * La autorización de una candidata aún sin asentar (VG 14-11, #70 (3) bis): cuántos elementos requieren segundo factor
 * y lo que la propuesta transfiere a cada cosa titular para que escriba su autorización. La T transferida cuenta como T
 * movida (un criterio sobre T la alcanza también), así que se busca el punto fijo: se parte sin transferencias, se lee el
 * segundo factor con las que da cada paso y se repite hasta que no cambian (solo crecen: termina). `base`: los demás
 * movimientos de la candidata (la quema del coste y lo de la plantilla). Sin criterios de quien escribe, no se lee nada.
 * Si la lectura pasa del presupuesto de cálculo, se queda con lo de la vuelta anterior y lo dice en `motivos`.
 * → { segundos (lo que transfiere en total), elementos, transferencias, motivos }.
 */
function autorizacionDe(eje, epoca, candidata, base, { yo, t, idioma }) {
  const motivos = [];
  if (!puedeTenerSegundoFactor(eje, candidata.autor)) return { segundos: 0, elementos: 0, transferencias: [], motivos };
  const uso = usoDeT(base, yo);
  let transferencias = [];
  let elementos = 0;
  const firma = (xs) => xs.map((x) => x.cosa + ':' + x.escala + ':' + x.cantidad).join('|');
  for (let i = 0; i < 16; i++) {
    const sf = segundoFactorDeCandidata(eje, epoca, { ...candidata, movimientos: [...base, ...comoTransferencias(transferencias, yo)] }, { idioma });
    if (sf.motivos.length) { motivos.push(...sf.motivos); break; }
    elementos = sf.criterios.length;
    const nuevas = transferenciasDe(eje, epoca, sf.criterios, { yo, t, uso });
    const igual = firma(nuevas) === firma(transferencias);
    transferencias = nuevas; // con los elementos y la tarifa de esta vuelta, aunque lo transferido no cambie
    if (igual) break;
  }
  return { segundos: transferencias.reduce((s, x) => s + x.transfiere, 0), elementos, transferencias, motivos };
}

/**
 * La autorización de segundo factor (VG 12/13-11, #70; el objeto «autorización» del SIP 0 en modo segundo factor): un
 * registro anclado en el 4 de la propuesta (lo ejecutado que espera), escrito por la cosa titular y firmado con su clave;
 * esa firma de registro es el segundo factor. Es lo que hace la app de StateArk, cuyo GUARDIÁN es el firmante (#112, F1
 * paso 5): la clave de la cosa no sale de su custodia, así que la firma se pide fuera. Llega pagada (VG 14-11, #70 (3) y
 * (3) bis): la propuesta (ejecucion, transaccion) le TRANSFIRIÓ a la cosa max(tarifa, coste de escribir esta
 * autorización), y la regla «writing burns today's T» no tiene excepciones: el registro de autorización, como todo
 * registro, quema lo que exige escribirlo («the cost of writing», por posición), y lo quema la cosa con esa T (en la escala
 * en que la recibió), así que su saldo propio no baja; no hay tarifa aparte de lo transferido. Antes de construir comprueba
 * que la cosa tiene saldo para escribirla (eje.saldoT); si no, { ok: false, motivos } con lo transferido y lo que hace
 * falta. Construye, firma y valida en seco (no asienta): → { ok, evento, motivos, transferido, exigido } (en segundos).
 *
 * Opciones (cuarto argumento): `t`, el instante (por defecto, el reloj del libro); `idioma`;
 * `firmar({ canonico, id, propuesta }) → firma`, el FIRMANTE INYECTABLE: recibe el cuerpo canónico del registro (el texto que
 * se hashea), su id y `propuesta`, el cuerpo canónico del registro que se autoriza (su SHA-256 es el `sobre` de la
 * autorización: el guardián comprueba que cuadra y enseña al titular qué autoriza; quien no lo lea sigue igual), y devuelve
 * la firma BIP-340 del id (64 bytes en hex, o un objeto { firma } como el `segundoFactor(nombre,
 * titular, { canonico, id })` de la custodia de StateArk, que además comprueba que el id sea el hash del cuerpo). Si no
 * hay `firmar`, firma en local con `privada` (la clave privada de la cosa; sin ella, el registro va sin firmar, para
 * mostrar que no vale). La forma antigua `autorizar(eje, id, cosa, privada, { t })` sigue valiendo.
 */
export async function autorizar(eje, idPropuesta, cosa, privadaOOpciones, opcionesDeAntes) {
  const nueva = privadaOOpciones !== null && typeof privadaOOpciones === 'object';
  let opciones = nueva ? { ...privadaOOpciones, ...(opcionesDeAntes ?? {}) } : { ...(opcionesDeAntes ?? {}), ...(privadaOOpciones === undefined ? {} : { privada: privadaOOpciones }) };
  const firmante = typeof opciones.firmar === 'function' ? opciones.firmar : null;
  const privadaDeLaCosa = opciones.privada;
  opciones = conEpoca(eje, opciones);
  const epoca = epocaDe(opciones, eje);
  const idioma = opciones.idioma ?? 'es';
  if (!eje?.obtener(idPropuesta)) return { ok: false, evento: null, motivos: [{ regla: SEGUNDO_FACTOR.criterio, mensaje: motivoDe('anchor not in ledger', { name: 'autorizar', formula: String(idPropuesta) }, { idioma, epoca }) }] };
  const payload = payloadDeAutorizacion(idPropuesta, cosa);
  const t = relojDe(eje, opciones);
  // Lo que la propuesta le transfirió (VG 14-11, #70 (3) bis): la T de quien propone a la cosa. La cosa escribe con esa T:
  // quema en la escala en que la recibió (si no recibió nada, en la primera en que su saldo alcance, como todo registro).
  const propuesta = eje.obtener(idPropuesta);
  const recibidas = (Array.isArray(propuesta.movimientos) ? propuesta.movimientos : [])
    .filter((m) => m.token === 'T' && m.de === propuesta.autor && m.a === cosa && ESCALAS_REALES.includes(m.escala) && !esAnunciado(m));
  const transferido = recibidas.reduce((s, m) => s + segundosDe(m.escala, m.cantidad), 0);
  let quema;
  try {
    quema = quemaDelCoste(cosa, payload, recibidas[0]?.escala ?? escalaQueAlcanza(eje, cosa, payload, t, { epoca }), { eje, epoca });
  } catch (e) {
    return { ok: false, evento: null, motivos: [{ regla: SEGUNDO_FACTOR.criterio, mensaje: String(e.message ?? e) }] };
  }
  const necesita = quema ? exigidoDe(payload, { eje, epoca }) : 0;
  // Antes de construir: ¿tiene la cosa saldo para escribirla? Si no, se dice por qué (lo transferido y lo que hace falta).
  if (quema && typeof eje.saldoT === 'function' && eje.saldoT(cosa, quema.escala, t) < quema.cantidad) {
    return { ok: false, evento: null, transferido, exigido: necesita, motivos: [{ regla: REGLA_DE_ESCRIBIR, mensaje: motivoDelSegundoFactor('authorization without T', { thing: cosa, transferred: segundosEnTexto(transferido), needed: segundosEnTexto(necesita) }, { idioma, epoca }) }] };
  }
  let evento;
  try {
    evento = await crearEvento({ autor: cosa, sobre: idPropuesta, en: SEGUNDO_FACTOR.ancla, t, movimientos: quema ? [quema] : [], payload });
    if (firmante) {
      // El firmante de fuera (el guardián): recibe el cuerpo canónico y el id, y devuelve la firma del id. Aquí no hay privada.
      // Recibe también la propuesta (su cuerpo canónico, cuyo SHA-256 es el `sobre`): el guardián comprueba que cuadra y
      // enseña al titular qué autoriza de verdad.
      const dada = await firmante({ canonico: canonicoDe(cuerpoDe(evento)), id: evento.id, propuesta: canonicoDe(cuerpoDe(propuesta)) });
      const firma = typeof dada === 'string' ? dada : dada?.firma;
      if (dada !== null && typeof dada === 'object' && dada.id !== undefined && dada.id !== evento.id) throw new Error('el firmante firmó otro registro: ' + String(dada.id).slice(0, 8) + ', no ' + evento.id.slice(0, 8));
      if (typeof firma !== 'string' || !/^[0-9a-f]{128}$/.test(firma)) throw new Error('el firmante no devolvió una firma (64 bytes en hexadecimal)');
      evento = Object.freeze({ ...evento, firmante: cosa, firma });
    } else if (privadaDeLaCosa) evento = await firmarEvento(evento, privadaDeLaCosa);
  } catch (e) {
    return { ok: false, evento: null, motivos: [{ regla: SEGUNDO_FACTOR.criterio, mensaje: String(e.message ?? e) }] };
  }
  const motivos = motivosDelEje(eje, await eje.validar(evento), evento, idioma, opciones);
  return { ok: motivos.length === 0, evento, motivos, transferido, exigido: necesita };
}

/**
 * Lo que está por autorizar para `yo` (VG 14-11, #70 (2): nada se rechaza, lo que requiere autorización queda registrado y
 * visible en el 6 como «por autorizar»): los registros pendientes de segundo factor (la lectura «second factor» sin su
 * «authorized by the holder»: segundoFactor) que son MÍOS (los escribí yo, su estación es «autorizada» y falta la firma de mi
 * cosa titular) o de otro cuyo criterio me nombra a mí (o a una cosa mía) como titular, así que me toca autorizar. Del más
 * reciente al más antiguo. Cada uno: { id, autor, que (su 0), propio (lo escribí yo), titular (me toca autorizar a mí o a una
 * cosa mía), titulares (los que faltan), faltan: [{ id, nombre, familias, cantidad, titular }], falta (qué falta, en el
 * idioma), motivos }. Un registro cuya lectura «second factor» pasa del presupuesto de cálculo sale también, con
 * `desbordado: true` y el motivo en `falta` (no se sabe si espera: no se calla). Cuando la autorización llega, deja de estar aquí y su estación pasa a «ejecutada» (ya es así). `opciones.cuantos`
 * limita la lista (por defecto, 50).
 */
export function porAutorizar(eje, yo, opciones = {}) {
  opciones = conEpoca(eje, opciones);
  if (typeof yo !== 'string' || !yo || !eje) return [];
  // Yo y mis cosas (las que su alta escribí yo): a quien se le pide firmar es a una de ellas.
  const mios = new Set([yo, ...(eje.identidades?.() ?? []).filter((i) => i !== yo && eje.esPersona(i) === false && eje.obtener(eje.alta(i)?.id)?.autor === yo)]);
  // Los autores con algún criterio que me concierne: yo, y quien nombra como titular a uno mío. Un criterio de otra
  // plantilla que nombra a uno mío (criteriosDeOtraPlantilla: puede alcanzar a cualquier autor) los hace a todos.
  const ajenos = criteriosDeOtraPlantilla(eje).some((c) => mios.has(c.titular));
  const autores = new Set();
  for (const a of eje.identidades?.() ?? []) {
    if (a === yo || ajenos || criteriosDeSegundoFactor(eje, a).some((c) => mios.has(c.titular))) autores.add(a);
  }
  const cuantos = opciones.cuantos ?? 50;
  const lista = [];
  for (let i = (eje.orden?.length ?? 0) - 1; i >= 0 && lista.length < cuantos; i--) {
    const ev = eje.obtener(eje.orden[i]);
    if (!ev || !autores.has(ev.autor) || eje.esDeLaEpoca?.(ev.id)) continue;
    const sf = segundoFactor(eje, ev.id, opciones);
    const que = texto(hoja(ev.payload?.[0])) ?? ev.id.slice(0, 8);
    if (sf && !sf.pendiente && sf.motivos?.length) {
      // La lectura no se ha podido hacer (el presupuesto de cálculo): no se sabe si espera, así que se lista con su motivo
      // (`desbordado`), no se calla. Me concierne si es mío o si su autor tiene un criterio que nombra a una cosa mía.
      const propio = ev.autor === yo;
      const titular = ajenos || criteriosDeSegundoFactor(eje, ev.autor).some((c) => mios.has(c.titular));
      if (propio || titular) lista.push({ id: ev.id, autor: ev.autor, que, propio, titular, titulares: [], faltan: [], falta: sf.motivos[0].mensaje, motivos: sf.motivos, desbordado: true });
      continue;
    }
    if (!sf?.pendiente) continue;
    const faltan = sf.criterios.filter((c) => !c.autorizado);
    const propio = ev.autor === yo;
    const titular = faltan.some((c) => mios.has(c.titular));
    if (!propio && !titular) continue;
    lista.push({ id: ev.id, autor: ev.autor, que, propio, titular, titulares: sf.titulares, faltan: faltan.map(({ id, nombre, familias, cantidad, titular: t }) => ({ id, nombre, familias, cantidad, titular: t })), falta: sf.motivo, motivos: sf.motivos ?? [] });
  }
  return lista;
}

// ---------- 5. el camino ----------

/**
 * Un movimiento anunciado (un registro en el 4.1 de X): { serie, cantidad, que, de, a }, o null. El anuncio es un
 * movimiento anunciado del libro (VG 12-11, decisión 8; para qué, el 0 del registro); mientras los ejemplos lo escriban
 * como antes, también un payload que imita un movimiento.
 */
function anuncioDe(registro) {
  const anunciados = (Array.isArray(registro?.movimientos) ? registro.movimientos : []).filter(esAnunciado);
  if (anunciados.length) {
    const que = typeof registro.payload === 'string' ? registro.payload : hojas(registro.payload?.[0]).find((x) => typeof x === 'string') ?? '';
    const movimientos = anunciados.map((m) => ({ serie: claveToken(m), cantidad: m.cantidad, de: m.de, a: m.a, ...(m.refiere ? { cuando: m.refiere } : {}) }));
    return { ...movimientos[0], que, movimientos };
  }
  const p = registro?.payload;
  const h = (x) => (Array.isArray(x) ? x[x.length - 1] : x);
  const serie = h(p?.[0]);
  const cantidad = h(p?.[1]);
  const de = h(p?.[3]?.[0]);
  const a = h(p?.[3]?.[1]);
  if (typeof serie !== 'string' || typeof cantidad !== 'number' || typeof de !== 'string' || typeof a !== 'string') return null;
  return { serie, cantidad, que: h(p?.[2]), de, a, movimientos: [{ serie, cantidad, de, a }] };
}

/** Los nombres que un registro o una plantilla escriben en su 9 (hojas de texto). */
const nombresDel9 = (decupla) => hojas(Array.isArray(decupla) ? decupla[9] : undefined).filter((x) => typeof x === 'string' && !esFormula(x));

/**
 * Yo y mis cosas: lo escrito por una cosa mía (la que tiene mi alta como autor de la suya) cuenta como mío en el camino: el
 * permiso de una cuenta lo da la conectora del banco, una cosa de su dueño (encargo «cuenta del banco», VG 16-11).
 */
const yoYMisCosasDe = (eje, yo) => new Set([yo, ...eje.identidades().filter((x) => x !== yo && eje.esPersona(x) === false && eje.obtener(eje.alta(x)?.id)?.autor === yo)]);

/** La regla del tutorial (§12.5): hay un registro mío, o de una cosa mía, en el ancla donde escribe la plantilla preparada. */
const hechoEnSuAncla = (eje, prep, mios) => eje.sobreDe(prep.sobre, prep.en, mios).length > 0;

/**
 * ¿Está hecho para `yo` lo que la plantilla `cual` escribe sobre X? La misma regla que un paso del tutorial del camino
 * (docs/CONTRATO.md §12.5): hay un registro mío, o de una cosa mía, en su ancla (la que da su 5 sobre X, con `params` y
 * los defectos, como al construir la transacción). La usa la guía del libro (src/guia-libro.js, pasoHecho) para leer un
 * paso en el libro donde se hace. false si la plantilla no está en la época del eje, si X no está en el eje, si `yo` no
 * es una identidad o si el ancla no se resuelve. Solo lee.
 */
export function hechoPorMi(eje, cual, X, yo, params = {}, opciones = {}) {
  opciones = conEpoca(eje, opciones);
  const plantilla = plantillaDeTransaccion(cual, opciones);
  const ev = eventoDe(eje, X);
  if (!plantilla || !ev || !eje?.obtener(ev.id) || typeof yo !== 'string' || !yo) return false;
  try {
    const prep = preparar(eje, plantilla, ev, yo, params ?? {}, { t: relojDe(eje, opciones), epoca: epocaDe(opciones, eje), idioma: idiomaDe(eje, yo, opciones) });
    return hechoEnSuAncla(eje, prep, yoYMisCosasDe(eje, yo));
  } catch {
    return false;
  }
}

/**
 * El camino de X para `yo`: lo que falta, de tres fuentes y en este orden, cada paso { fuente, falta, hacer, espera,
 * hecho }: (1) el tutorial fijo, los nombres de plantillas de transacción (o de reglas) escritos en el 9 de la
 * plantilla de X (la de datos, o la de identidad si X es un alta) o del propio X; (2) lo que derivan las reglas:
 * los movimientos anunciados y pendientes (la lectura «stage», X.4.8, con la plantilla de su estación), el recuento
 * del dueño sin alcanzar («commit P»), las peticiones de atención sin atender («attend») y las caducidades próximas
 * («expire something mine»); si lo puede lanzar yo es un paso mío (`hacer`: la plantilla y sus parámetros), si lo
 * tiene que dar otro es un paso de espera (`espera`: de quién); (3) `sugerencias`, un gancho opcional (función
 * (eje, X, yo) → [{ plantilla, parametros, sobre?, porque?, id?, invalida?, guia?, hecho? }]) cuyos pasos van marcados como sugerencia
 * y pasan por las mismas reglas (`pasa`, `motivos`); `sobre` es otro registro que X, `porque` (y `guia`, el nombre de la
 * guía de la que viene) se enseña con el paso, una con `hecho: true` sale hecha (sin él, no lo está), y
 * una con `invalida` (el motivo) no se construye: sale como paso inválido. `falta` se lee en humano con el 9 de la regla o de la plantilla, en el idioma de yo. Si la
 * madurez de X es 0 o desconocida, devuelve además `niveles` (los de su plantilla o los genéricos) para que la persona
 * se ubique. Orden: primero lo que nombra el criterio del dueño (X.2.3), luego lo que nombra el mío (el 2.3 de mi alta).
 */
export async function camino(eje, X, yo, opciones = {}) {
  opciones = conEpoca(eje, opciones);
  const ev = eventoDe(eje, X);
  if (!ev || !eje?.obtener(ev.id)) return { pasos: [] };
  const epoca = epocaDe(opciones, eje);
  const raiz = raizDe(epoca);
  const idioma = idiomaDe(eje, yo, opciones);
  const ctx = contextoDe(eje, epoca, { me: yo });
  const t = relojDe(eje, opciones);
  const plantillas = plantillasDeTransaccion(opciones);
  const porNombre = new Map(plantillas.map((p) => [p.nombre, p.plantilla]));
  const reglas = (epoca.reglasConId ?? []).map((x) => x.regla);
  const pasos = [];

  // Lo escrito por una cosa mía cuenta como mío en el camino (yoYMisCosasDe).
  const yoYMisCosas = yoYMisCosasDe(eje, yo);
  /** Un paso mío con una plantilla: sus parámetros por defecto y si ya está hecho (un registro mío, o de una cosa mía, en su ancla); `falta` se lee con su 9 en el idioma. */
  const mio = (nombre, extra = {}, sobre = ev) => {
    const plantilla = porNombre.get(nombre);
    if (!plantilla) return null;
    const prep = preparar(eje, plantilla, sobre, yo, extra, { t, epoca, idioma });
    const hecho = hechoEnSuAncla(eje, prep, yoYMisCosas);
    return { hacer: { plantilla: nombre, X: sobre.id, parametros: { ...Object.fromEntries(Object.entries(prep.valores)), ...extra }, lectura: esLectura(plantilla) }, hecho, falta: mensajeDe(eje, epoca, plantilla, prep.candidata, yo, sobre, idioma) };
  };

  // (1) El tutorial: el 9 de la plantilla de X (la de datos, o la de identidad si X es un alta) y el 9 del propio X.
  const esAlta = [...eje.identidades()].some((id) => eje.alta(id)?.id === ev.id);
  // El tutorial del alta (el 9 de la plantilla de identidad) es de quien la escribió: su dueño; salvo que X tenga un tipo
  // cuyo 9 ya es un camino (nombra plantillas de transacción: el alta de una cosa con su tipo, como el nodo de la época de
  // la clase state): entonces su camino es el de su tipo.
  const delTipo = nombresDel9(plantillaDeDatos(eje, ev, opciones));
  const deIdentidad = esAlta && ev.autor === yo && !delTipo.some((n) => porNombre.has(n)) ? nombresDel9(en(raiz, SITIO.identidad)) : [];
  const nombres = [...delTipo, ...deIdentidad, ...nombresDel9(ev.payload)];
  for (const n of nombres) {
    if (porNombre.has(n)) {
      const paso = mio(n);
      if (paso) pasos.push({ fuente: 'tutorial', ...paso, espera: null });
      continue;
    }
    const regla = reglas.find((r) => nombreDeRegla(r) === n);
    if (regla) {
      // Una regla en el tutorial: no se lanza, se cumple o no (la clave se declara en el alta misma).
      const hecho = n === 'a key is declared at its alta' ? Boolean(eje.clave(ev.autor)) : null;
      pasos.push({ fuente: 'tutorial', falta: mensaje(eje, regla, idioma, { ev, ...opciones }), hacer: null, espera: null, hecho, regla: n });
    }
  }

  // (2) Las reglas: lo anunciado y pendiente, por estación.
  const estacionDe = new Map(estacionesDeLaEpoca(opciones).map((e) => [e.familia, e]));
  // Un proceso cerrado con error, caducado o por decisión (VG 12-11, #71.2; 14-11, #80) no pide pasos: lo anunciado que quedó pendiente ya no se espera.
  const sinPasos = ['error', 'caducado', 'decidido'].includes(cerradoDe(eje, ev.id).fin);
  // Lo que piden las reglas lo dice la lectura de la época en X.9.8 (motor.pasosDeLasReglas; Core AGRAM 18-11,
  // NUCLEO_6_7_8 §6), con la época de este camino y su reloj (las caducidades): las filas de X.4.9 (los anuncios
  // pendientes, por llegada, y el recuento que no pasa), las peticiones de atención y las caducidades próximas, cada una con
  // quién tiene que actuar y la acción que lo cumple. Un proceso terminado no da filas de X.4.9. Con opciones.memoria (una
  // MemoriaDeLectura de quien llama: el contrato, la carta por fila), como lectura de pantalla.
  const todas = pasosDeLasReglas(eje, ev.id, { epoca, ahora: t, memoria: opciones.memoria }).filas;
  const filas = sinPasos ? todas.filter((f) => f.porque === 'attended' || f.porque === 'expiry') : todas;
  const deLaFabrica = filas.filter((f) => f.porque !== 'attended' && f.porque !== 'expiry');
  const pendientes = [...new Set(deLaFabrica.filter((f) => typeof f.sobre === 'string' && f.sobre !== ev.id).map((f) => f.sobre))].map((id) => eje.obtener(id)).filter(Boolean);
  for (const anuncio of pendientes) {
    const a = anuncioDe(anuncio);
    if (!a) continue;
    // Un anuncio puede llevar varios movimientos (VG 12-11, decisión 8: las noches de una reserva): un paso por quien los
    // mueve, con todos los suyos; el mío, con la plantilla de la estación de su familia.
    const porQuien = new Map();
    for (const m of a.movimientos) porQuien.set(m.de, [...(porQuien.get(m.de) ?? []), m]);
    for (const [de, ms] of porQuien) {
      // En llano (época 0 final, #9 del añadido): cuánto por su nombre, de quién y a quién por su 0, con el formato de la
      // época («legible announced movement»); sin destino resuelto (a: null), sin «a» (repaso beta #2: nunca «→ null»).
      const que = (mensaje(eje, 'stage', idioma, opciones) ?? 'stage') + ' · ' + (a.que ? a.que + ': ' : '') + ms.map((m) => movimientoLegible(eje, m, idioma, opciones)).join('; ');
      // La acción, la que dice la fila de quien mueve; si ya no le falta nada de ese anuncio, la de la estación de su familia.
      const accion = deLaFabrica.find((f) => f.sobre === anuncio.id && f.de.includes(de))?.accion ?? estacionDe.get(partirClave(ms[0].serie).token)?.plantilla;
      if (de === yo && accion) {
        const paso = mio(accion, { announcement: { ref: anuncio.id } });
        if (paso) { pasos.push({ fuente: 'reglas', regla: 'stage', ...paso, falta: que, hecho: false, espera: null, anuncio: anuncio.id }); continue; }
      }
      pasos.push({ fuente: 'reglas', regla: 'stage', falta: que, hacer: null, espera: de, hecho: false, anuncio: anuncio.id });
    }
  }
  // El recuento del dueño que no pasa: su fila de X.4.9 (sobre X), con la acción que lo cumple.
  const delRecuento = deLaFabrica.find((f) => f.sobre === ev.id);
  if (!sinPasos && delRecuento) {
    const c = recuento(eje, ev.id);
    if (c.pasa === false) {
      const que = 'the tally of ' + ev.autor + ' (' + c.plantilla + ') gives ' + c.valor + ' and asks above ' + c.umbral;
      const nombre = delRecuento.accion;
      const suya = plantillas.find((p) => p.nombre === nombre);
      const ofrecida = suya ? acciones(eje, ev, suya.pv, yo, opciones).find((a) => a.nombre === nombre) : null;
      if (ofrecida) { const paso = mio(nombre); if (paso) pasos.push({ fuente: 'reglas', regla: 'weight', ...paso, falta: que, hecho: false, espera: null }); } else pasos.push({ fuente: 'reglas', regla: 'weight', falta: que, hacer: null, espera: ev.autor, hecho: false });
    }
  }
  // Las peticiones de atención sin atender (si X es un alta, las de su dueño) y las caducidades próximas: sus filas de X.9.8,
  // con quién tiene que actuar y la acción que lo cumple (la de los datos: el núcleo no la nombra).
  for (const f of filas.filter((x) => x.porque === 'attended')) {
    const peticion = eje.obtener(f.sobre);
    if (!peticion) continue;
    const que = (mensaje(eje, 'attended', idioma, opciones) ?? 'attended') + ' · ' + String(peticion.payload?.[0] ?? peticion.payload);
    const quien = f.de[0] ?? ev.autor;
    if (quien === yo && f.accion) { const paso = mio(f.accion, f.parametros, peticion); if (paso) pasos.push({ fuente: 'reglas', regla: 'attended', ...paso, falta: que, espera: null }); } else pasos.push({ fuente: 'reglas', regla: 'attended', falta: que, hacer: null, espera: quien, hecho: false, peticion: peticion.id });
  }
  for (const f of filas.filter((x) => x.porque === 'expiry')) {
    const que = f.serie + ' expires at ' + f.para;
    const emisor = f.de[0] ?? null;
    if (emisor === yo && f.accion) { const paso = mio(f.accion, f.parametros); if (paso) pasos.push({ fuente: 'reglas', regla: 'E is tied to a record that exists', ...paso, falta: que, hecho: false, espera: null }); } else pasos.push({ fuente: 'reglas', falta: que, hacer: null, espera: emisor, hecho: false });
  }

  // (3) Las sugerencias: un gancho sin LLM aquí; cada una pasa por las mismas reglas.
  if (typeof opciones.sugerencias === 'function') {
    for (const s of (await opciones.sugerencias(eje, ev, yo)) ?? []) {
      const nombre = typeof s === 'string' ? s : s?.plantilla;
      // Lo que la sugerencia dice de sí misma, para quien la enseña: por qué (`porque`), su identidad (`propuesta`) y, si
      // viene de la guía de un libro (src/guia-libro.js), el nombre de esa guía (`guia`).
      const suya = { ...(typeof s?.porque === 'string' && s.porque ? { porque: s.porque } : {}), ...(s?.id !== undefined ? { propuesta: s.id } : {}), ...(typeof s?.guia === 'string' && s.guia ? { guia: s.guia } : {}) };
      // Una sugerencia que no se entiende se enseña con su motivo (`invalida`), no se descarta en silencio.
      if (s && typeof s === 'object' && s.invalida) {
        pasos.push({ fuente: 'sugerencia', falta: String(nombre ?? ''), hacer: null, hecho: false, espera: null, pasa: false, motivos: [{ regla: null, mensaje: String(s.invalida) }], invalida: String(s.invalida), ...suya });
        continue;
      }
      if (!porNombre.has(nombre)) continue;
      // Una sugerencia puede tratar de otro registro (`sobre`): por defecto, el de X.
      const sobre = (s?.sobre !== undefined && eventoDe(eje, s.sobre)) || ev;
      // Una sugerencia puede traer su instante (`t`): la que lleva una prueba de posesión firmada sobre el id solo pasa con él.
      const r = await transaccion(eje, nombre, { X: sobre.id, ...(s?.parametros ?? {}) }, yo, typeof s?.t === 'string' && s.t ? { ...opciones, t: s.t } : opciones);
      const paso = mio(nombre, s?.parametros ?? {}, sobre);
      // Una sugerencia no está hecha, salvo que diga ella misma que lo está (`hecho: true`): un paso de la guía de un libro
      // lo dice con la regla del tutorial (hechoPorMi); una propuesta importada, nunca.
      pasos.push({ fuente: 'sugerencia', ...paso, hecho: s?.hecho === true, espera: null, pasa: r.ok, motivos: r.motivos, ...suya });
    }
  }

  // Orden: lo que nombra el criterio del dueño (X.2.3) primero, luego lo que nombra el mío (el 2.3 de mi alta).
  const nombrados = (expr) => (valores(expr, ctx).valores ?? []).filter((x) => typeof x === 'string');
  const delDueno = nombrados('(("' + ev.id + '").2.3 where count it.5 = 0)');
  const mios = yo && eje.alta(yo) ? nombrados('("' + yo + '").2.3') : [];
  const rango = (p) => (p.hacer && delDueno.includes(p.hacer.plantilla) ? 0 : p.hacer && mios.includes(p.hacer.plantilla) ? 1 : 2);
  pasos.sort((a, b) => rango(a) - rango(b));

  const fuera = { pasos };
  const m = madurez(eje, ev, opciones);
  if (!m || !m.nivel) {
    const propios = hojas(plantillaDeDatos(eje, ev, opciones)?.[8]?.[8]).filter((x) => typeof x === 'string');
    fuera.niveles = (propios.length ? propios : nivelesGenericos(opciones)).map((n) => textoDe(eje, claves.nivel(n), idioma, { original: n, epoca }));
  }
  return fuera;
}

/**
 * Construye y lanza los pasos míos del camino, en orden, mientras pasen: cada uno se construye y se firma con
 * `transaccion` y `firmar(evento)` (lo que la carta sepa firmar; sin ella, el evento tal cual) y se asienta con eje.anadir.
 * Se detiene en el primero que no pasa. Devuelve { hechos: [{ paso, evento }], parado: { paso, motivos } | null }.
 */
export async function autoejecutar(eje, X, yo, firmar, opciones = {}) {
  opciones = conEpoca(eje, opciones);
  const { pasos } = await camino(eje, X, yo, opciones);
  const hechos = [];
  for (const paso of pasos) {
    if (!paso.hacer || paso.espera || paso.hecho || paso.hacer.lectura) continue;
    const r = await transaccion(eje, paso.hacer.plantilla, { X: paso.hacer.X ?? X, ...paso.hacer.parametros }, yo, { ...opciones, firmar });
    if (!r.ok || !r.evento) return { hechos, parado: { paso, motivos: r.motivos } };
    let evento = r.evento; // ya firmado por transaccion con `firmar`: se valida y se asienta lo mismo
    try {
      evento = await eje.anadir(evento);
    } catch (e) {
      return { hechos, parado: { paso, motivos: [{ regla: null, mensaje: e.message }] } };
    }
    hechos.push({ paso, evento });
  }
  return { hechos, parado: null };
}

// ---------- 6. el personaje del sitio: la cruceta del propio nodo (encargo pv3, VG 12-11, issue #38) ----------

/** Un camino de anclaje de plantilla («3.{box}.1», «{place}.{position}») contra unos dígitos: los parámetros que lo dan, o null. */
function encajarRuta(ruta, digitos) {
  const trozos = String(ruta).split('.');
  const ir = (i, j, dados) => {
    if (i === trozos.length) return j === digitos.length ? dados : null;
    const m = /^\{([^{}]+)\}$/.exec(trozos[i]);
    if (!m) return Number(trozos[i]) === digitos[j] ? ir(i + 1, j + 1, dados) : null;
    // Un hueco toma uno o más dígitos, los más que pueda (lo de detrás, un dígito por trozo).
    for (let k = digitos.length - (trozos.length - i - 1); k >= j + 1; k--) {
      const r = ir(i + 1, k, { ...dados, [m[1]]: digitos.slice(j, k) });
      if (r) return r;
    }
    return null;
  };
  return ir(0, 0, {});
}

/**
 * El personaje de un sitio (VG, 12-11, issue #38: «el personaje es la configuración del sitio»): el sitio es un nodo,
 * X.<lugar> (un PV o un sub-PV: 3, 3.4), con sus diez posiciones, y pulsar su interrogante (o su muñeco, en animado)
 * abre la cruceta de ese nodo como menú de configuración. → { X, lugar, direccion, dueno, posiciones: [{ posicion,
 * nombre, ayuda?, valor, de, accion: { id, nombre, etiqueta, valores } | null }] }: el nombre de cada posición es la
 * regla corta de la época (0 qué es, 1 cuánto… 9 cómo); el valor, lo último que el dueño ancló exactamente ahí; la
 * acción, la primera plantilla de configuración (PV 0, no está en el aro) cuya ancla llega a X.<lugar>.<posición> y
 * cuya condición pasa para quien mira, con los parámetros que el sitio ya da (la caja, el lugar, la posición).
 */
export function sitio(eje, X, lugar, yo, opciones = {}) {
  opciones = conEpoca(eje, opciones);
  const ev = eventoDe(eje, X);
  const digitos = (Array.isArray(lugar) ? lugar : String(lugar ?? '').split('.')).map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 9);
  if (!ev || typeof ev.id !== 'string' || !eje?.obtener(ev.id) || !digitos.length || digitos.length >= 9) return null;
  const epoca = epocaDe(opciones, eje);
  const idioma = idiomaDe(eje, yo, opciones);
  const ctx = contextoDe(eje, epoca, { me: yo });
  const configurar = plantillasDeTransaccion(opciones).filter((p) => p.pv === 0).filter((p) => {
    const condicion = texto(ultima(p.plantilla[2]));
    return yo && esFormula(condicion) && cumple(condicion, ctx, sujetoDe(ev));
  });
  const dueno = ev.autor;
  const posiciones = [];
  for (let k = 0; k <= 9; k++) {
    const camino = [...digitos, k];
    const escritos = typeof eje.sobreDe === 'function' ? eje.sobreDe(ev.id, direccion(camino), new Set([dueno])) : eje.sobre(ev.id, direccion(camino)).filter((e) => e.autor === dueno);
    const ultimo = escritos[escritos.length - 1];
    const valor = ultimo ? (Array.isArray(ultimo.payload) ? ultimo.payload.flat(2).filter((x) => typeof x === 'string' || typeof x === 'number') : [ultimo.payload]) : [];
    let accion = null;
    for (const p of configurar) {
      const ruta = hojas(p.plantilla[5])[0];
      const dados = typeof ruta === 'string' ? encajarRuta(ruta, camino) : null;
      if (!dados) continue;
      const lista = parametros(p.plantilla, { idioma, epoca });
      const valores = {};
      for (const [nombre, ds] of Object.entries(dados)) {
        const prm = lista.find((x) => x.nombre === nombre);
        if (!prm) continue;
        valores[nombre] = prm.tipo === 'number' && ds.length === 1 ? ds[0] : ds.join('.');
      }
      accion = { id: p.id, nombre: p.nombre, etiqueta: textoDe(eje, claves.plantilla(p.nombre), idioma, { original: p.nombre, epoca }), valores };
      break;
    }
    posiciones.push({ posicion: k, nombre: etiquetaDe(eje, null, camino, { idioma, epoca }), valor, de: ultimo?.id ?? null, accion });
  }
  return { X: ev.id, lugar: digitos, direccion: digitos.join('.'), dueno, posiciones };
}
