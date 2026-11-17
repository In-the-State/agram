// «Reglas del libro» y «Ajustes de este elemento» en la carta (A21 y A23, tramo 2, paso 4; agram-equipo/
// DISENO_GOBIERNO_Y_MOTOR.md §7 y §8; docs/notas/GOBIERNO.md y docs/notas/VERSIONES.md). Sin DOM: lo que la vista enseña
// (carta/dom.js htmlReglas, htmlAjustesDelElemento) y las acciones que lanza, por el camino de siempre (carta.js enviar:
// acciones.transaccion, firmada y asentada; la app guarda y sincroniza después, como con cualquier acción).
//
// Nada se decide aquí: el estado de cada cambio es la lectura «change state» de la época, el apoyo «support» y lo que falta
// «missing support», si se aprueba «approved», quién apoya y con cuánto la lista X.2.4 (cada compromiso con su «support
// of»), qué se ofrece lo dice el 2 de cada plantilla (acciones.acciones), la versión vigente eje.versiones(), la firmeza
// contrato.firmeza, y lo que un cambio puede o no puede tocar lo dicen src/versiones.js y src/suelo.js antes de escribir.
// En pantalla no sale «época»: se dice «las reglas del libro».
//
//   reglasDelLibro(eje, yo, opciones)               → la vista: la versión vigente y la lista de cambios, lo más nuevo arriba
//   cambioDelLibro(eje, id, yo, opciones)           → el detalle de un cambio: piezas, barra de apoyo, acciones, firmeza
//   actuar(eje, id, que, yo, firmar, opciones)      → apoyar, retirar el apoyo, aprobar, retirar la propuesta, poner en vigor
//   parametrosMovibles(eje, opciones)               → las posiciones de las reglas que se pueden mover, con su valor de hoy
//   comprobarPropuesta(eje, yo, datos, opciones)    → la clase que le toca y por qué no se puede escribir (antes de escribir)
//   proponer(eje, yo, datos, firmar, opciones)      → «propose a change», si la comprobación pasa
//   ajustesDelElemento(eje, X, yo, opciones)        → lo que el elemento tiene fijado y lo que hereda del libro
//   pideDialogo(payload)                            → ¿es un registro del gobierno que con el guardián pide siempre diálogo?

import * as contrato from '../src/contrato.js';
import * as acciones from '../src/acciones.js';
import { evaluar, leerRegla } from '../src/bqlm.js';
import { ContextoEje } from '../src/contexto-eje.js';
import { idDeRegistro } from '../src/epocas.js';
import { esReferencia, direccion } from '../src/btml.js';
import {
  PROPONER, APOYAR, RETIRAR_APOYO, APROBAR, PONER_EN_VIGOR, RETIRAR, ACCION_EN, ANCLA_DE_PROPUESTAS, NOMBRES, UMBRAL_CORRIENTE, UMBRAL_DE_GOBIERNO,
  CLASE_CORRIENTE, CLASE_DE_GOBIERNO, cambioDe, claseDe, dice, traePlantilla, fundirCambio, motivosAlProponer, erroresDelSuelo,
  presionDeLosNombres, sueloDe, piezasDeGobiernoDe,
} from '../src/versiones.js';
import { caminoDePosicion, PREFIJO_DE_POSICION } from '../src/suelo.js';
import { enviar, motivosEnLlano } from './carta.js';
import { t } from './textos.js';
/** La lectura de la época que da las propuestas del libro, por llegada (docs/notas/GOBIERNO.md §4). */
const LECTURA_DE_CAMBIOS = 'changes';
/** Dónde da cada propuesta sus lecturas (docs/notas/GOBIERNO.md §4; las mismas que ejemplos/gobierno.mjs resumen). */
const LEER = Object.freeze({
  apoyo: '=first (first it.2).6',
  falta: '=first (first it.2).7',
  aprobada: '=first (first it.2).8',
  decidio: '=first (first it.2).9',
  compromisos: '=(first it.2).4',
  titulares: '=(first it.2).4 each 3',
  bloqueado: '=(first it.2).4 each 1',
  cuenta: '=(first it.2).4 each 7',
});

/** Los registros del gobierno que, con el guardián, piden siempre diálogo (encargo, punto B; diseño §8). */
export const ACCIONES_CON_DIALOGO = Object.freeze([PROPONER, APOYAR, APROBAR, PONER_EN_VIGOR]);

/** ¿Pide diálogo con el guardián la candidata con este payload? (su 4 dice una de ACCIONES_CON_DIALOGO). */
export function pideDialogo(payload) {
  const x = Array.isArray(payload) ? payload[ACCION_EN] : undefined;
  const lista = Array.isArray(x) ? x : [x];
  return lista.some((a) => ACCIONES_CON_DIALOGO.includes(a));
}

// ---------- utilidades ----------

const en = (nodo, camino) => camino.reduce((n, k) => (Array.isArray(n) ? n[k] : undefined), nodo);
const primera = (x) => {
  let n = x;
  while (Array.isArray(n)) n = n[0];
  return n;
};
const hojas = (x) => (x === undefined || x === null ? [] : Array.isArray(x) ? x : [x]);
const esHoja = (x) => !Array.isArray(x) && !esReferencia(x);
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const idiomaDe = (eje, yo, opciones) => opciones.idioma ?? contrato.configuracion(eje, yo, opciones).language;
const quienEs = (eje, x, o) => (x ? contrato.legible(eje, x, ['identity'], o).texto : '');
const cuandoEs = (eje, x, o) => (x ? contrato.legible(eje, x, ['instant'], o).texto : '');
const nombreDeAccion = (eje, nombre, o) => contrato.texto(eje, contrato.claves.plantilla(nombre), o.idioma, { original: nombre, epoca: o.epoca });
/** El id de un ocupante del BQL (una referencia a un registro: { k: 'reg', id }), o el texto tal cual. */
const idDe = (x) => (x && typeof x === 'object' ? x.id ?? null : typeof x === 'string' ? x : null);

/** Una lectura de la época sobre un registro, con la versión vigente: { valor (la lista), estado }. */
function leer(eje, expr, id) {
  const r = evaluar(expr, new ContextoEje(eje, { epoch: eje.epoca() }), { sujeto: id });
  return r.estado === 'RESUELTO' ? r.valor : null;
}
const leerUno = (eje, expr, id) => leer(eje, expr, id)?.[0];

/** ¿Trae la versión vigente del libro el gobierno (la plantilla de proponer)? Sin ella, la vista lo dice y no ofrece nada. */
export const conGobierno = (eje) => Boolean(eje?.epoca && traePlantilla(eje.epoca(), PROPONER));

/** ¿Se ofrece la acción `nombre` sobre X a `yo`? (el 2 de su plantilla, en el punto de vista de su 8). */
function ofrecida(eje, X, nombre, yo, o) {
  const p = acciones.plantillaDeTransaccion(nombre, o);
  if (!p || !yo) return false;
  const pv = Number(hojas(p[8])[0]);
  return acciones.acciones(eje, X, pv, yo, o).some((a) => a.nombre === nombre);
}

/** Lo que cuesta lanzar `nombre` sobre X con `valores` (acciones.ejecucion: la misma cuenta que el formulario): { exigido, denominacion } o null. */
function costeDe(eje, X, nombre, valores, yo, o) {
  try {
    const e = acciones.ejecucion(eje, nombre, { X, ...valores }, yo, o);
    return e?.ok ? { exigido: e.exigido, denominacion: e.denominacion } : null;
  } catch {
    return null;
  }
}

// ---------- quién cuenta ----------

/**
 * Los nombres que cuentan en el gobierno del libro (epoch.7.9.5 de la versión vigente): [{ nombre, presion }]. Sin nombres
 * (solo el 0), el dueño del libro (el autor del génesis) con la presión máxima. Una hoja «nombre k» (una magnitud) pesa k.
 */
export function nombresQueCuentan(eje) {
  const raiz = eje.epoca().registro;
  const maxima = Number(primera(en(raiz, [9, 0, 0, 4])));
  const lista = hojas(en(raiz, NOMBRES)).filter((h) => h !== 0 && h !== '0' && !Array.isArray(h));
  if (!lista.length) return [{ nombre: eje.obtener(eje.genesisId)?.autor ?? null, presion: maxima }];
  return lista.map((h) => {
    const s = String(h).trim();
    const m = /^(.+?)\s+(-?\d+(?:\.\d+)?)$/.exec(s) ?? /^(-?\d+(?:\.\d+)?)\s+(.+)$/.exec(s);
    if (!m) return { nombre: s, presion: maxima };
    const numero = /^-?\d/.test(m[1]) ? m[1] : m[2];
    const nombre = numero === m[1] ? m[2] : m[1];
    return { nombre, presion: Number(numero) };
  });
}

// ---------- la lista y su estado ----------

/** El estado en llano de una propuesta por el registro que la decidió por última vez (la lectura «change state»). */
const ESTADOS = Object.freeze({ [PROPONER]: 'propuesto', [APROBAR]: 'aprobado', [PONER_EN_VIGOR]: 'enVigor', [RETIRAR]: 'retirado' });
function estadoDe(eje, id) {
  const decidio = idDe(leerUno(eje, LEER.decidio, id));
  const ev = decidio ? eje.obtener(decidio) : null;
  const accion = ev ? Object.keys(ESTADOS).find((a) => dice(ev, a)) : null;
  return { estado: accion ? ESTADOS[accion] : 'propuesto', registro: ev?.id ?? id, accion: accion ?? PROPONER };
}

/** Las propuestas del libro por llegada (la lectura «changes»; sin ella, las que cuelgan del 9.7 del génesis). */
function propuestasDe(eje) {
  const lectura = eje.epoca().lecturas?.find((x) => primera(x?.[0]) === LECTURA_DE_CAMBIOS);
  if (lectura) {
    const r = leerRegla(lectura, eje.genesisId, new ContextoEje(eje, { epoch: eje.epoca() }));
    if (r?.estado === 'RESUELTO') return r.valor.map(idDe).filter((id) => id && eje.obtener(id));
  }
  return eje.sobre(eje.genesisId, ANCLA_DE_PROPUESTAS).filter((ev) => dice(ev, PROPONER)).map((ev) => ev.id);
}

/** El título, la explicación, quién propuso y cuándo, la clase y el estado de una propuesta. */
function resumenDe(eje, id, o) {
  const ev = eje.obtener(id);
  const e = estadoDe(eje, id);
  const clase = claseDe(ev);
  return {
    id,
    titulo: String(primera(ev.payload?.[0]) ?? ''),
    explicacion: String(primera(en(ev.payload, [1, 0])) ?? ''),
    clase,
    claseLlana: clase === CLASE_DE_GOBIERNO ? 'gobierno' : clase === CLASE_CORRIENTE ? 'corriente' : 'otra',
    autor: ev.autor,
    quien: quienEs(eje, ev.autor, o),
    cuando: cuandoEs(eje, ev.t, o),
    ...e,
  };
}

/**
 * La vista «Reglas del libro» para `yo`: la versión vigente (eje.versiones(): cuántos cambios lleva el libro y desde cuándo
 * rige el último, con el registro que lo puso en vigor), la lista de cambios con su estado en llano (lo más nuevo arriba),
 * y si `yo` puede proponer. → { gobierno, version: { cambios, desde, registro, propuesta }, cambios: [...], puedeProponer }.
 */
export function reglasDelLibro(eje, yo, opciones = {}) {
  const o = { ...opciones, idioma: idiomaDe(eje, yo, opciones) };
  const versiones = typeof eje.versiones === 'function' ? eje.versiones() : [];
  const ultima = versiones.at(-1);
  const puesta = ultima?.registro ? eje.obtener(ultima.registro) : null;
  const version = {
    cambios: Math.max(0, versiones.length - 1),
    desde: puesta ? cuandoEs(eje, puesta.t, o) : null,
    registro: ultima?.registro ?? null,
    propuesta: ultima?.propuesta ?? null,
  };
  if (!conGobierno(eje)) return { gobierno: false, version, cambios: [], puedeProponer: false };
  const cambios = propuestasDe(eje).map((id) => {
    const r = resumenDe(eje, id, o);
    const apoyo = Number(leerUno(eje, LEER.apoyo, id));
    const falta = Number(leerUno(eje, LEER.falta, id));
    return { ...r, apoyo: Number.isFinite(apoyo) ? apoyo : null, falta: Number.isFinite(falta) ? falta : null };
  }).reverse();
  return { gobierno: true, version, cambios, puedeProponer: ofrecida(eje, eje.genesisId, PROPONER, yo, o) };
}

// ---------- el detalle de un cambio ----------

/** El texto llano de un valor de una posición (una lista de hojas): «0.5», «ana, bea». */
const textoDeValor = (v) => (v === undefined ? '' : hojas(v).map((x) => (Array.isArray(x) ? JSON.stringify(x) : String(x))).join(', '));

/** El tipo de la pieza que es un registro del cambio, por dónde lo nombra su raíz. */
function tipoDePieza(camino) {
  if (camino[0] === 2) return 'regla';
  if (camino[0] === 9 && camino[1] === 6) return 'plantilla';
  if (camino[0] === 9 && camino[1] === 4) return 'texto';
  return 'pieza';
}

/** Los registros de una época (Map id → registro, o pares) como lista de { id, registro }. */
const registrosDe = (epoca) => [...(epoca?.registros ?? [])].map(([id, registro]) => ({ id, registro }));

/**
 * Las piezas que toca un cambio: recorre su raíz (sin su 0, el título, ni su 6, la procedencia) y, donde no hay la marca
 * «lo de la base aquí», da cada parámetro (una lista de hojas: cómo es hoy en `antes` y cómo queda en `despues`) y cada
 * registro nuevo que trae (una regla, una plantilla, un texto: su nombre, el escrito de hoy con ese nombre, si lo hay, y el
 * nuevo). Un parámetro que queda igual no se cuenta.
 */
function piezasDe(cambio, antes, despues) {
  if (!cambio) return [];
  const porId = new Map();
  for (const r of cambio.registros ?? []) {
    try { porId.set(idDeRegistro(r), r); } catch { /* lo dice la forma del cambio */ }
  }
  const viejos = registrosDe(antes);
  const fuera = [];
  const visitar = (nodo, camino) => {
    if (esReferencia(nodo)) {
      const r = porId.get(nodo.ref);
      if (!r) return; // la marca: lo de la base, sin cambiar
      const nombre = String(primera(r[0]) ?? '');
      const hoy = viejos.filter((x) => String(primera(x.registro?.[0]) ?? '') === nombre).map((x) => x.registro);
      fuera.push({ tipo: tipoDePieza(camino), posicion: camino.join('.'), nombre, hoy: hoy.length ? JSON.stringify(hoy.length === 1 ? hoy[0] : hoy, null, 1) : null, queda: JSON.stringify(r, null, 1) });
      return;
    }
    if (!Array.isArray(nodo) || !nodo.length) return;
    if (nodo.every(esHoja)) {
      const hoy = en(antes?.registro, camino);
      const queda = despues ? en(despues.registro, camino) : nodo;
      if (despues && igual(hoy, queda)) return;
      fuera.push({ tipo: 'parametro', posicion: camino.join('.'), nombre: nombreDePosicion(antes, camino), hoy: textoDeValor(hoy), queda: textoDeValor(queda) });
      return;
    }
    nodo.forEach((x, i) => visitar(x, [...camino, i]));
  };
  (Array.isArray(cambio.raiz) ? cambio.raiz : []).forEach((x, i) => { if (i !== 0 && i !== 6) visitar(x, [i]); });
  return fuera;
}

/**
 * El nombre en llano de una posición de las reglas: los de la fila de gobierno los dice la carta (reglaPosicion_7_9_k);
 * los demás, el nombre de su fila (su 0, como lo escribe la época) con el número de la posición.
 */
function nombreDePosicion(epoca, camino) {
  const clave = 'reglaPosicion_' + camino.join('_');
  if (t(clave) !== clave) return t(clave);
  for (let k = camino.length - 1; k >= 1; k--) {
    const fila = en(epoca?.registro, [...camino.slice(0, k), 0]);
    const nombre = esCabecera(fila) && camino[k] !== 0 ? fila[0] : null;
    if (nombre) return nombre;
  }
  return '';
}

/**
 * El apoyo de una propuesta por titular (la lista X.2.4: cada compromiso con su titular, lo bloqueado y lo que cuenta,
 * «support of»), sumado por titular: [{ titular, quien, bloqueado, cuenta (en presión), parte (de 0 a 1 del total de
 * los nombres), enLista }].
 */
function apoyosDe(eje, id, nombres, total, o) {
  const titulares = leer(eje, LEER.titulares, id) ?? [];
  const bloqueado = leer(eje, LEER.bloqueado, id) ?? [];
  const cuenta = leer(eje, LEER.cuenta, id) ?? [];
  const por = new Map();
  titulares.forEach((x, k) => {
    const titular = idDe(x) ?? String(x);
    const a = por.get(titular) ?? { titular, bloqueado: 0, cuenta: 0 };
    a.bloqueado += Number(bloqueado[k]) || 0;
    a.cuenta += Number(cuenta[k]) || 0;
    por.set(titular, a);
  });
  const enLista = new Set(nombres.map((n) => n.nombre));
  return [...por.values()].map((a) => ({ ...a, quien: quienEs(eje, a.titular, o), parte: total > 0 ? a.cuenta / total : 0, enLista: enLista.has(a.titular) }));
}

/** El nivel de firmeza que pide la clase (epoch.7.9.3 corriente, 7.9.4 gobierno), de la versión vigente. */
function nivelPedido(eje, clase) {
  const raiz = eje.epoca().registro;
  const k = clase === CLASE_DE_GOBIERNO ? 4 : 3;
  const n = Number(primera(en(raiz, [7, 9, k])));
  return Number.isFinite(n) ? n : null;
}

/**
 * ¿Llega ya la prueba del «enact a change» al nivel pedido? Con nivel 0, sí (no hace falta prueba). Si no, lo que la carta
 * enseña de su sello (contrato.firmeza): un nivel igual o mayor alcanzado por un eslabón con su clave declarada, o el
 * último (el sello entero). El recibo de llegada no cuenta: «put a change in force» no lo trae (GOBIERNO.md §5).
 */
function pruebaLlega(firmeza, pedido) {
  if (pedido === 0) return true;
  if (!firmeza?.capas?.length || pedido === null) return false;
  const ultima = firmeza.capas.length - 1;
  return firmeza.capas.some((c, k) => c.nivel >= pedido && c.estado === 'alcanzada' && (c.clave || k === ultima));
}

/**
 * El detalle de un cambio para `yo` (su id: el de la propuesta): título y explicación, quién lo propuso, su clase en llano,
 * su estado, las piezas que toca (hoy y cómo queda; si está en vigor, cómo era antes y cómo quedó), la barra de apoyo
 * («support» frente al umbral de su clase, lo que falta, quién apoya y con cuánto), las acciones que se le ofrecen a `yo`
 * con su coste, la firmeza del cambio aprobado y si ya se puede poner en vigor. `aviso`: el motivo del núcleo si el cambio
 * ya no se funde sobre las reglas de hoy. → el nodo, o null si `id` no es una propuesta del libro.
 */
export function cambioDelLibro(eje, id, yo, opciones = {}) {
  const ev = typeof id === 'string' ? eje.obtener(id) : null;
  if (!ev || !dice(ev, PROPONER) || !conGobierno(eje)) return null;
  const o = { ...opciones, idioma: idiomaDe(eje, yo, opciones) };
  const r = resumenDe(eje, id, o);
  const cambio = cambioDe(ev);
  // Las piezas: en vigor, la versión que abrió y la de antes; si no, las reglas de hoy y lo que quedaría al fundirlo.
  const abierta = (typeof eje.versiones === 'function' ? eje.versiones() : []).find((v) => v.propuesta === id);
  let antes = eje.epoca();
  let despues = null;
  let aviso = null;
  if (abierta?.version) { antes = abierta.version.anterior ?? antes; despues = abierta.version; }
  else if (cambio) {
    const f = fundirCambio(eje.epoca(), cambio);
    if (f.version) despues = f.version;
    else aviso = f.motivo;
  }
  // La barra: el apoyo frente al umbral de su clase (epoch.7.9.1 o 7.9.2), lo que falta y quién apoya.
  const raiz = eje.epoca().registro;
  const umbral = Number(primera(en(raiz, r.clase === CLASE_DE_GOBIERNO ? UMBRAL_DE_GOBIERNO : UMBRAL_CORRIENTE)));
  const nombres = nombresQueCuentan(eje);
  const total = presionDeLosNombres(eje.epoca()) ?? 0;
  const apoyo = Number(leerUno(eje, LEER.apoyo, id));
  const falta = Number(leerUno(eje, LEER.falta, id));
  const aprobada = leerUno(eje, LEER.aprobada, id) === true;
  const apoyos = apoyosDe(eje, id, nombres, total, o);
  const yoEnLista = Boolean(yo) && nombres.some((n) => n.nombre === yo);
  // Las acciones: cada una se ofrece si su plantilla lo dice (el 2), con su coste.
  const accion = (que, nombre, X, valores = {}) => (ofrecida(eje, X, nombre, yo, o) ? { que, nombre: nombreDeAccion(eje, nombre, o), X, coste: costeDe(eje, X, nombre, valores, yo, o) } : null);
  const aprobacion = r.accion === APROBAR || r.accion === PONER_EN_VIGOR ? (r.accion === APROBAR ? eje.obtener(r.registro) : eje.obtener(eje.obtener(r.registro)?.sobre)) : null;
  const pedido = nivelPedido(eje, r.clase);
  const firmeza = aprobacion ? contrato.firmeza(eje, aprobacion.id, { ...o, ahora: o.ahora ?? o.t ?? new Date().toISOString() }) : null;
  const llega = r.estado === 'aprobado' && pruebaLlega(firmeza, pedido);
  const lista = [
    accion('apoyar', APOYAR, id),
    accion('retirarApoyo', RETIRAR_APOYO, id),
    aprobada && r.estado === 'propuesto' ? accion('aprobar', APROBAR, id) : null,
    r.autor === yo ? accion('retirar', RETIRAR, id) : null,
    llega && aprobacion ? accion('poner', PONER_EN_VIGOR, aprobacion.id) : null,
  ].filter(Boolean);
  return {
    ...r,
    piezas: piezasDe(cambio, antes, despues),
    aviso,
    barra: {
      apoyo: Number.isFinite(apoyo) ? apoyo : 0,
      umbral: Number.isFinite(umbral) ? umbral : null,
      falta: Number.isFinite(falta) ? falta : null,
      aprobada,
      apoyos,
      nombres: nombres.map((n) => ({ ...n, quien: quienEs(eje, n.nombre, o) })),
      yoEnLista,
      // Quien no está en la lista puede apoyar, y no cuenta: se le dice (si tiene P bloqueado con ella o se le ofrece apoyar).
      avisoFueraDeLista: Boolean(yo) && !yoEnLista,
    },
    acciones: lista,
    firmeza: aprobacion ? { aprobacion: aprobacion.id, pedido, llega, ...(firmeza ? { capas: firmeza.capas, alcanzada: firmeza.alcanzada, exigida: pedido, firme: firmeza.firme, enDuda: firmeza.enDuda, confirmaciones: firmeza.confirmaciones, enFirme: firmeza.enFirme, pedidos: [] } : {}) } : null,
    poner: llega && aprobacion ? { X: aprobacion.id, ofrecida: lista.some((a) => a.que === 'poner') } : null,
    // «Salir a un libro hijo» (punto C): lo que la carta ya tiene para abrir un libro que cuelga de este, sin saldos.
    salir: { X: eje.genesisId, accion: contrato.LIBRO_PRIVADO.abrir, ofrecida: ofrecida(eje, eje.genesisId, contrato.LIBRO_PRIVADO.abrir, yo, o) },
  };
}

// ---------- actuar ----------

/** Qué plantilla lanza cada acción de la vista y sobre qué: la propuesta, o su «enact a change» para poner en vigor. */
const PLANTILLA_DE = Object.freeze({ apoyar: APOYAR, retirarApoyo: RETIRAR_APOYO, aprobar: APROBAR, retirar: RETIRAR, poner: PONER_EN_VIGOR });

/**
 * Lanza una acción de la vista sobre el cambio `id` (la propuesta) por el camino de siempre (carta.js enviar: transaccion,
 * firmada con `firmar`, asentada): apoyar («support a change»), retirar el apoyo («withdraw support»), aprobar («enact a
 * change»), retirar la propuesta («withdraw a change») o poner en vigor («put a change in force», sobre su aprobación). Lo
 * que el núcleo o una regla rechazan vuelve en `motivos`, en llano y con su motivo tal como llega. → lo que da enviar.
 */
export async function actuar(eje, id, que, yo, firmar, opciones = {}) {
  const nombre = PLANTILLA_DE[que];
  const ev = typeof id === 'string' ? eje.obtener(id) : null;
  if (!nombre || !ev) return { ok: false, asentado: null, motivos: [{ regla: null, mensaje: t('reglasNoHayCambio') }] };
  let X = id;
  if (que === 'poner') {
    const e = estadoDe(eje, id);
    if (e.accion !== APROBAR) return { ok: false, asentado: null, motivos: [{ regla: null, mensaje: t('reglasNoAprobado') }] };
    X = e.registro;
  }
  const r = await enviar(eje, X, nombre, {}, yo, firmar, opciones);
  return { ...r, motivos: motivosEnLlano(r.motivos, eje, opciones) };
}

// ---------- proponer ----------

/** Las filas de las reglas cuyas posiciones con valor se ofrecen, en este orden: el gobierno (7.9), las bases de custodia (7.7), el resto de «para cuándo» (7). */
const FILAS_MOVIBLES = Object.freeze([[7, 9], [7, 7], [7]]);
/** Una hoja que es la ayuda de una fila (un texto largo con espacios), no un valor. */
const textoLargo = (s) => typeof s === 'string' && s.length > 40 && /\s/.test(s);
const esAyuda = (lista) => lista.length === 1 && textoLargo(lista[0]);
/** La cabecera de una fila (su 0): su nombre, o su nombre y su ayuda, todo texto (["layers", "the levels of …"]). */
const esCabecera = (lista) => Array.isArray(lista) && lista.length >= 1 && lista.every((x) => typeof x === 'string') && (lista.length === 1 || (lista.length === 2 && textoLargo(lista[1])));
/** Un valor que es una fórmula («=…»): vía de experto, no un parámetro del formulario. */
const esFormula = (lista) => lista.some((x) => typeof x === 'string' && x.startsWith('='));

/**
 * Los parámetros de las reglas del libro que se pueden mover (encargo, punto B): las posiciones con valor (una lista de
 * hojas, ni la cabecera de su fila ni su ayuda) de la fila de gobierno 7.9, de las bases 7.7 y del resto de la fila 7, de la
 * versión vigente, con su valor de hoy y si son del suelo o piezas de gobierno (lo dicen 7.9.6 y 7.9.7).
 * → [{ posicion: 'epoch.7.9.1', camino, nombre, hoy (lista), texto, suelo, gobierno }].
 */
export function parametrosMovibles(eje, opciones = {}) {
  const epoca = opciones.epoca ?? eje.epoca();
  const raiz = epoca.registro;
  const suelo = sueloDe(epoca).map(caminoDePosicion).filter(Boolean);
  const gobierno = piezasDeGobiernoDe(epoca).map(caminoDePosicion).filter(Boolean);
  const dentro = (camino, lista) => lista.some((c) => c.length <= camino.length && c.every((k, i) => k === camino[i]));
  const vistos = new Set();
  const fuera = [];
  const visitar = (nodo, camino, profundidad) => {
    if (!Array.isArray(nodo) || !nodo.length || profundidad > 4) return;
    if (nodo.every(esHoja)) {
      const clave = camino.join('.');
      if (vistos.has(clave) || (camino.at(-1) === 0 && esCabecera(nodo)) || esAyuda(nodo) || esFormula(nodo)) return;
      vistos.add(clave);
      fuera.push({ posicion: PREFIJO_DE_POSICION + clave, camino, nombre: nombreDePosicion(epoca, camino), hoy: nodo, texto: textoDeValor(nodo), suelo: dentro(camino, suelo), gobierno: dentro(camino, gobierno) });
      return;
    }
    nodo.forEach((x, i) => visitar(x, [...camino, i], profundidad + 1));
  };
  for (const fila of FILAS_MOVIBLES) visitar(en(raiz, fila), fila, fila.length);
  return fuera;
}

/** Un valor escrito en el formulario como lista de hojas: separado por comas; lo que parece un número, número. */
export function valorDesdeTexto(texto) {
  return String(texto ?? '').split(',').map((s) => s.trim()).filter((s) => s !== '').map((s) => (/^-?\d+(\.\d+)?$/.test(s) ? Number(s) : s));
}

/**
 * El cambio mínimo que lleva la posición `camino` de las reglas vigentes al valor `valor` (una lista de hojas): una raíz de
 * época hija que hereda de la del libro, con la marca «lo de la base aquí» en cada posición anterior en el camino y nada
 * detrás (lo que acaba antes se hereda); su 0, el título, y su 6, la procedencia con «hereda». → { raiz, registros: [] }.
 */
export function cambioDeParametro(epoca, camino, valor, titulo = '') {
  const marca = { ref: epoca.id };
  const anidar = (resto) => {
    if (!resto.length) return valor;
    const [k, ...mas] = resto;
    return [...Array.from({ length: k }, () => marca), anidar(mas)];
  };
  const [fila, ...mas] = camino;
  const largo = Math.max(fila + 1, 7);
  const raiz = Array.from({ length: largo }, (_, i) => {
    if (i === 0) return [String(titulo || '—')];
    if (i === 6) return [[t('reglasProcedencia')], ['hereda'], [epoca.id]];
    if (i === fila) return anidar(mas);
    return marca;
  });
  return { raiz, registros: [] };
}

/**
 * La pieza escrita que pega un experto (punto B, «avanzado»): JSON con { raiz, registros } o la raíz sola. → { cambio } o
 * { aviso } en llano.
 */
export function leerPiezaEscrita(texto) {
  let x;
  try {
    x = JSON.parse(String(texto ?? ''));
  } catch {
    return { aviso: t('reglasPiezaNoEsJson') };
  }
  if (Array.isArray(x)) return { cambio: { raiz: x, registros: [] } };
  if (x && typeof x === 'object' && Array.isArray(x.raiz)) return { cambio: { raiz: x.raiz, registros: Array.isArray(x.registros) ? x.registros : [] } };
  return { aviso: t('reglasPiezaSinRaiz') };
}

/**
 * Antes de escribir una propuesta (punto B): funde el cambio sobre las reglas vigentes y dice la clase que le toca (si toca
 * una pieza de gobierno, «governance»: src/suelo.js erroresDelSuelo con la clase corriente da un motivo más) y por qué no se
 * puede escribir: el suelo (src/suelo.js) y las comprobaciones del núcleo al proponer (src/versiones.js motivosAlProponer,
 * sobre una candidata con ese payload). `datos`: { cambio, titulo, explicacion }.
 * → { clase, claseLlana, suelo (bool), aviso (en llano, o null), motivos: [{ regla, mensaje }] (los del núcleo tal como llegan) }.
 */
export function comprobarPropuesta(eje, yo, { cambio, titulo = '', explicacion = '' } = {}, opciones = {}) {
  const epoca = eje.epoca();
  if (!conGobierno(eje)) return { clase: null, claseLlana: null, suelo: false, aviso: t('reglasSinGobierno'), motivos: [] };
  if (!String(titulo).trim() || !String(explicacion).trim()) return { clase: null, claseLlana: null, suelo: false, aviso: t('reglasFaltaTitulo'), motivos: [] };
  if (!cambio) return { clase: null, claseLlana: null, suelo: false, aviso: t('reglasPiezaSinRaiz'), motivos: [] };
  const f = fundirCambio(epoca, cambio);
  if (f.motivo) return { clase: null, claseLlana: null, suelo: false, aviso: t('reglasNoSeFunde'), motivos: [{ regla: null, mensaje: f.motivo }] };
  const delSuelo = erroresDelSuelo(epoca, f.version);
  const conCorriente = erroresDelSuelo(epoca, f.version, { clase: CLASE_CORRIENTE });
  const clase = conCorriente.length > delSuelo.length ? CLASE_DE_GOBIERNO : CLASE_CORRIENTE;
  const claseLlana = clase === CLASE_DE_GOBIERNO ? 'gobierno' : 'corriente';
  if (delSuelo.length) return { clase, claseLlana, suelo: true, aviso: t('reglasTocaElSuelo'), motivos: delSuelo.map((m) => ({ regla: null, mensaje: 'el cambio ' + m })) };
  const payload = [[String(titulo)], [[String(explicacion)], cambio.raiz, ...(cambio.registros?.length ? [cambio.registros.length === 1 ? cambio.registros[0] : cambio.registros] : [])], [clase], [yo], [PROPONER]];
  const motivos = motivosAlProponer(epoca, { payload });
  if (motivos.length) return { clase, claseLlana, suelo: false, aviso: t('reglasNoSePuedeProponer'), motivos: motivos.map((m) => ({ regla: null, mensaje: m })) };
  return { clase, claseLlana, suelo: false, aviso: null, motivos: [] };
}

/**
 * Proponer (punto B): comprueba (comprobarPropuesta) y, si pasa, escribe «propose a change» sobre el génesis del libro por
 * el camino de siempre. `datos`: { titulo, explicacion, y o bien posicion ('epoch.7.9.1') y valor (texto), o pieza (la
 * escrita, vía de experto) }. → lo que da enviar (`asentado`, `motivos` en llano) más `comprobacion`; si no pasa, nada se
 * escribe y `aviso` lo dice.
 */
export async function proponer(eje, yo, datos = {}, firmar, opciones = {}) {
  const { cambio, aviso } = cambioDeDatos(eje, datos);
  const comprobacion = aviso ? { aviso, motivos: [], clase: null } : comprobarPropuesta(eje, yo, { cambio, titulo: datos.titulo, explicacion: datos.explicacion }, opciones);
  if (comprobacion.aviso) return { ok: false, asentado: null, motivos: comprobacion.motivos ?? [], aviso: comprobacion.aviso, comprobacion };
  const valores = { title: String(datos.titulo).trim(), explanation: String(datos.explicacion).trim(), change: cambio.raiz, class: comprobacion.clase, ...(cambio.registros?.length ? { records: cambio.registros.length === 1 ? cambio.registros[0] : cambio.registros } : {}) };
  const r = await enviar(eje, eje.genesisId, PROPONER, valores, yo, firmar, opciones);
  return { ...r, motivos: motivosEnLlano(r.motivos, eje, opciones), aviso: null, comprobacion };
}

/** El cambio de lo que trae el formulario: un parámetro (posicion y valor) o la pieza escrita. → { cambio } o { aviso }. */
export function cambioDeDatos(eje, { posicion, valor, pieza, titulo } = {}) {
  if (typeof pieza === 'string' && pieza.trim()) return leerPiezaEscrita(pieza);
  const camino = caminoDePosicion(posicion);
  if (!camino) return { aviso: t('reglasEligeParametro') };
  const lista = valorDesdeTexto(valor);
  if (!lista.length) return { aviso: t('reglasFaltaValor') };
  return { cambio: cambioDeParametro(eje.epoca(), camino, lista, titulo) };
}

// ---------- Ajustes de este elemento (punto D) ----------

/**
 * Las plantillas de la época con que un elemento fija lo suyo (diseño §7: la custodia, el precio de cada grupo, los mínimos,
 * los criterios de decisión de sus piezas y la clase de dueño): las que ya existen, sin claves ni plantillas nuevas.
 */
const AJUSTES = Object.freeze({
  padre: 'add a parent',
  quitarPadre: 'remove a parent',
  defecto: 'set a custody default',
  clase: 'set the kind of owner',
  precio: 'set a group price',
  minimo: 'set a minimum',
  rango: 'set a minimum rank',
  criterio: acciones.SEGUNDO_FACTOR.criterio,
});
/**
 * El sí del dueño para que el P de otro baje a una cosa suya (CH1, VG 17-11; docs/notas/R_EN_CANALES.md, «El P de la R solo
 * baja a una cosa de otro con el sí de su dueño»): la plantilla y la expresión que da los sí vigentes (it = la cosa; el
 * último de su dueño por identidad, que dice «yes»), tal como las dice la nota: la época no tiene lectura con nombre.
 */
export const SI_DEL_DUENO = 'let P come down here';
const QUIEN_TIENE_SI = '=(down it) where nth 1 it2.6.5 = "2100000000" and first it2.3 = first it.3 and "let P come down here" in (payload(it2)).4 and it2 = last ((down it) where nth 1 it3.6.5 = "2100000000" and first it3.3 = first it.3 and "let P come down here" in (payload(it3)).4 and first (payload(it3)).3.1 = first (payload(it2)).3.1) and "yes" in (payload(it2)).1.0 and not ("no" in (payload(it2)).1.0)';

/**
 * Quién tiene el sí del dueño para bajar P a X: [{ id (el registro del sí), whom, quien (en llano), cuando, retirar }], y
 * `dar`: el botón de la plantilla para dar otro sí (solo si se le ofrece a `yo`, el dueño de X). `retirar` es la misma
 * plantilla con «no» para esa identidad: cuenta el último. Lo que ya bajó se queda (la nota lo dice).
 */
export function siDelDueno(eje, X, yo, opciones = {}) {
  const o = { ...opciones, idioma: idiomaDe(eje, yo, opciones) };
  const puede = ofrecida(eje, X, SI_DEL_DUENO, yo, o);
  const boton = (valores) => (puede ? { nombre: nombreDeAccion(eje, SI_DEL_DUENO, o), accion: SI_DEL_DUENO, X, valores } : null);
  const quienes = (leer(eje, QUIEN_TIENE_SI, X) ?? []).map(idDe).filter((id) => id && eje.obtener(id)).map((id) => {
    const r = eje.obtener(id);
    const whom = primera(en(r.payload, [3, 1]));
    return { id, whom, quien: quienEs(eje, whom, o), cuando: cuandoEs(eje, r.t, o), retirar: boton({ whom, answer: 'no' }) };
  });
  return { quienes, dar: boton({ answer: 'yes' }) };
}

/** Los parámetros que no son el ajuste (el molde de siempre: cierre, quién, la acción). */
const DEL_MOLDE = new Set(['criteria', 'who', 'actions']);

/** Una dirección «3120000000» en puntos, «3.1.2» (sin los ceros del final). */
const enPuntos = (dir) => String(dir ?? '').replace(/0+$/, '').split('').join('.') || '0';

/** Los valores de un registro de ajuste en llano: «clave: valor» por cada parámetro de su plantilla que no es del molde. */
function valoresDeAjuste(eje, ev, nombre, o) {
  const p = acciones.plantillaDeTransaccion(nombre, o);
  if (!p) return [];
  return acciones.parametros(p, o).filter((x) => !DEL_MOLDE.has(x.nombre) && x.posicion).map((x) => {
    const v = en(ev.payload, x.posicion.split('.').map(Number));
    return v === undefined ? null : { etiqueta: x.etiqueta, valor: contrato.legible(eje, hojas(v).length === 1 ? hojas(v)[0] : v, x.tipo, o).texto };
  }).filter(Boolean);
}

/**
 * «Ajustes de este elemento» (punto D) para `yo`: lo que X tiene fijado (cada registro de ajuste en vigor, con quién lo fijó
 * y cuándo) y lo que hereda del libro (el valor base y los valores admitidos de cada clave, «del libro»). En cada uno, el
 * botón de la plantilla de siempre para cambiarlo, si se le ofrece a `yo`: { nombre, X, valores }.
 * → { X, texto, fijado: [{ que, valores: [{ etiqueta, valor }], quien, cuando, id, cambiar }], heredado: [{ que, clave,
 * base, admitidos, cambiar }] } o null si X no está.
 */
export function ajustesDelElemento(eje, X, yo, opciones = {}) {
  const ev = typeof X === 'string' ? eje.obtener(X) : null;
  if (!ev) return null;
  const o = { ...opciones, idioma: idiomaDe(eje, yo, opciones) };
  const epoca = eje.epoca();
  const cambiar = (nombre, valores = {}) => (ofrecida(eje, X, nombre, yo, o) ? { nombre: nombreDeAccion(eje, nombre, o), accion: nombre, X, valores } : null);
  const fila = (que, r, nombre, extra = {}) => ({ que, valores: valoresDeAjuste(eje, r, nombre, o), quien: quienEs(eje, r.autor, o), cuando: cuandoEs(eje, r.t, o), id: r.id, ...extra });
  const dueno = new Set([ev.autor, eje.obtener(eje.genesisId)?.autor].filter(Boolean));
  const fijado = [];

  // La custodia: los padres propios (contrato.custodia, sin los retirados), y en el 9 lo último de cada clave de custodia y la clase de dueño.
  const c = contrato.custodia(eje, X, o);
  if (c && c.padresDe === X) {
    for (const p of c.padres ?? []) {
      const r = eje.obtener(p.id);
      if (r) fijado.push(fila(nombreDeAccion(eje, AJUSTES.padre, o), r, AJUSTES.padre, { cambiar: cambiar(AJUSTES.quitarPadre, { parent: p.id }) }));
    }
  }
  const nueve = eje.sobre(X, direccion([9])).filter((r) => dueno.has(r.autor));
  const ultimoPor = (lista, clave) => {
    const m = new Map();
    for (const r of lista) m.set(clave(r), r);
    return [...m.values()];
  };
  for (const r of ultimoPor(nueve.filter((r) => dice(r, AJUSTES.defecto)), (r) => primera(r.payload?.[0]))) {
    fijado.push(fila(nombreDeAccion(eje, AJUSTES.defecto, o), r, AJUSTES.defecto, { cambiar: cambiar(AJUSTES.defecto, { key: primera(r.payload?.[0]) }) }));
  }
  const clases = nueve.filter((r) => dice(r, AJUSTES.clase));
  if (clases.length) fijado.push(fila(nombreDeAccion(eje, AJUSTES.clase, o), clases.at(-1), AJUSTES.clase, { cambiar: cambiar(AJUSTES.clase) }));

  // Los mínimos de las cajas del 3 (X.3.<caja>.1 y .8; manda el último del dueño de X).
  for (const caja of [0, 1, 2, 3, 4, 5]) {
    for (const [nombre, k] of [[AJUSTES.minimo, 1], [AJUSTES.rango, 8]]) {
      const r = eje.sobre(X, direccion([3, caja, k])).filter((h) => h.autor === ev.autor).at(-1);
      if (r) fijado.push(fila(nombreDeAccion(eje, nombre, o) + ' · ' + enPuntos(r.en), r, nombre, { cambiar: cambiar(nombre, { box: caja }) }));
    }
  }

  // El precio de cada grupo (solo en un alta: X.3.<grupo>.2; manda el último).
  const esAlta = eje.alta?.(ev.autor)?.id === X;
  if (esAlta) {
    for (const zona of [0, 1, 2, 3, 4, 5]) {
      const r = eje.sobre(X, direccion([3, zona, 2])).filter((h) => h.autor === ev.autor).at(-1);
      if (r) fijado.push(fila(nombreDeAccion(eje, AJUSTES.precio, o) + ' · ' + enPuntos(r.en), r, AJUSTES.precio, { cambiar: cambiar(AJUSTES.precio, { zone: zona }) }));
    }
  }

  // Los criterios de decisión de sus piezas: los «second factor» de su dueño cuyo titular es X (en un alta, todos los suyos).
  for (const k of acciones.criteriosDeSegundoFactor(eje, ev.autor).filter((x) => esAlta || x.titular === X)) {
    const r = eje.obtener(k.id);
    if (r) fijado.push(fila(nombreDeAccion(eje, AJUSTES.criterio, o), r, AJUSTES.criterio, { cambiar: null }));
  }

  // Lo que hereda del libro: las bases de custodia (epoch.7.7: clave, base y valores admitidos), la clase de dueño (7.5) y,
  // en un alta, el precio de cada grupo (1.2.1).
  const heredado = [];
  const fijadas = new Set(nueve.filter((r) => dice(r, AJUSTES.defecto)).map((r) => primera(r.payload?.[0])));
  for (const [clave, d] of Object.entries(contrato.defectosDeCustodia(epoca))) {
    if (fijadas.has(clave)) continue;
    heredado.push({ que: nombreDeAccion(eje, AJUSTES.defecto, o), clave, base: textoDeValor(d.base), admitidos: textoDeValor(d.valores), cambiar: cambiar(AJUSTES.defecto, { key: clave }) });
  }
  if (!clases.length) {
    heredado.push({ que: nombreDeAccion(eje, AJUSTES.clase, o), clave: '', base: c?.clase ?? '', admitidos: textoDeValor(en(epoca.registro, [7, 5, 1])), cambiar: cambiar(AJUSTES.clase) });
  }
  if (esAlta) {
    const grupos = hojas(en(epoca.registro, [1, 2, 1])).filter(Array.isArray);
    for (const g of grupos) {
      const zona = Number(primera(g[1]));
      if (fijado.some((f) => f.cambiar?.accion === AJUSTES.precio && f.cambiar.valores.zone === zona)) continue;
      heredado.push({ que: nombreDeAccion(eje, AJUSTES.precio, o) + ' · 3.' + zona + '.2', clave: String(primera(g[0]) ?? ''), base: textoDeValor((g[2] ?? []).map((x) => primera(x))), admitidos: '', cambiar: cambiar(AJUSTES.precio, { zone: zona }) });
    }
  }
  // El sí del dueño para bajar P aquí (CH1): quién lo tiene y, para el dueño, darlo o retirarlo.
  const si = siDelDueno(eje, X, yo, o);
  return { X, texto: String(contrato.ceroLegible(eje, X, o)?.texto ?? primera(ev.payload?.[0]) ?? X.slice(0, 8)), fijado, heredado, bajarP: si.quienes.length || si.dar ? si : null };
}
