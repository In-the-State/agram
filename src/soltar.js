// Soltar en una caja (VG 18-11: «soltar en una caja es crear ahí lo que la época permita»): dado lo que se arrastra, dónde
// se suelta y quién mira, qué acciones de la época encajan, con el parámetro ya relleno. Soltar compone, como tocar o
// rellenar: aquí no se escribe nada; la carta pone lo elegido en el borrador (carta/bandeja.js).
//
// Qué es dato, qué es código y por qué:
//   - Qué acciones hay, cuándo se ofrecen (su 2), qué piden (su 1, con sus tipos) y dónde anclan (su 5) es dato de la
//     época: aquí solo se lee, por acciones.acciones, acciones.parametros, acciones.sobreDe y acciones.ejecucion. Ninguna
//     acción se nombra en el código.
//   - Cómo casa una cosa con un parámetro es código, porque es la lista cerrada de lo que la lente sabe arrastrar y
//     soltar (una persona, un registro, una caja): lo que una cosa da a un parámetro sale de su tipo base (src/tipos.js),
//     y si lo admite lo dicen sus validaciones (las del tipo y la suya), evaluadas por el núcleo.
//
// Una COSA (lo arrastrado o el destino) es { X, identidad?, lugar? }:
//   X          el registro que la cosa es o donde está (una persona: su alta; una caja: el registro cuyo punto de vista la tiene)
//   identidad  si la cosa es una persona, quién (lo que da a un parámetro de tipo identity)
//   lugar      si la cosa es una caja, su posición en X («3.2»: la caja 2 del 3)
// Un registro entero (sin lugar) da su id a un parámetro de tipo ref.
//
// Encajan (decisión de Core, 18-11):
//   - las que la época ofrece sobre lo arrastrado y tienen un parámetro que admite el destino;
//   - las que ofrece sobre el destino y tienen un parámetro que admite lo arrastrado.
// Admitir una caja es crear AHÍ: el registro que escribe la acción cuelga del X de la caja y ancla dentro de su lugar. Los
// huecos con nombre de su ancla («3.{zone}.3») se rellenan con los dígitos del lugar, y cada valor puesto tiene que pasar
// sus validaciones. Admitir una persona o un registro es que un parámetro que la acción necesita (requerido) de su tipo
// base la acepte. Si no encaja ninguna, el motivo: nada que la época permita ahí, o lo permite pero no a ti (con la
// condición que falla, en llano, si el núcleo la da: acciones.porQueNo).
//
//   loQueEncaja(eje, { arrastrado, destino }, yo, opciones) → { encajan: [opción], motivo }
//     opción: { accion (id de la plantilla), nombre (canónico), etiqueta (en el idioma), X, valores, faltan, pv, por
//     ('arrastrado' | 'destino': sobre cuál se lanza), parametros (los que rellena el destino o lo arrastrado) }
//     motivo: null si alguna encaja; { que: 'nada' } o { que: 'no-a-ti', acciones: [{ accion, nombre, etiqueta, X, texto }] }

import * as acciones from './acciones.js';

const RE_ID = /^[0-9a-f]{64}$/;
const RE_LUGAR = /^\d(\.\d){0,8}$/;
/** Los puntos de vista donde se buscan las acciones de una cosa. */
const PUNTOS_DE_VISTA = Object.freeze([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);

const hoja = (x) => (Array.isArray(x) ? hoja(x[0]) : x);

/** ¿Es `c` una cosa que se puede arrastrar o donde se puede soltar? (lo que llega de la pantalla se lee con desconfianza). */
const esCosa = (c) => c !== null && typeof c === 'object' && typeof c.X === 'string' && RE_ID.test(c.X)
  && (c.identidad === undefined || c.identidad === null || (typeof c.identidad === 'string' && c.identidad.length > 0 && c.identidad.length <= 256))
  && (c.lugar === undefined || c.lugar === null || (typeof c.lugar === 'string' && RE_LUGAR.test(c.lugar)));

/** La ruta del ancla de una plantilla (su 5.0, «3.{zone}.3») y la fórmula de su registro (su 5.1), si la tiene. */
function anclaDe(plantilla) {
  const cinco = Array.isArray(plantilla?.[5]) ? plantilla[5] : [plantilla?.[5]];
  const ruta = hoja(cinco[0]);
  return { ruta: typeof ruta === 'string' ? ruta : '0' };
}

/**
 * Los valores que pone un lugar en la ruta de un ancla, si el registro anclaría dentro de él: cada dígito del lugar casa
 * con el mismo dígito de la ruta o rellena el hueco con nombre que hay ahí. → { nombre: dígito } o null si no ancla dentro
 * (otra posición, una ruta más corta que el lugar o un hueco que pediría dos dígitos distintos).
 */
function huecosDelLugar(ruta, lugar) {
  const tramos = String(ruta).split('.');
  const digitos = lugar.split('.');
  if (tramos.length < digitos.length) return null;
  const valores = {};
  for (let k = 0; k < digitos.length; k++) {
    const tramo = tramos[k];
    const hueco = /^\{([^{}]+)\}$/.exec(tramo);
    if (hueco) {
      if (valores[hueco[1]] !== undefined && valores[hueco[1]] !== digitos[k]) return null;
      valores[hueco[1]] = digitos[k];
    } else if (tramo !== digitos[k]) return null;
  }
  return valores;
}

/** Un dígito del lugar como lo pide el tipo base de su parámetro (un número o un texto); otro tipo no lo admite. */
function comoTipoBase(digito, p) {
  const base = p?.base ?? p?.tipo;
  if (base === 'number') return Number(digito);
  if (base === 'text') return String(digito);
  return undefined;
}

/**
 * Lo que da una cosa a un parámetro, por su tipo base: una persona, quién es, a uno de identity; un registro entero (ni
 * persona ni caja), su id, a uno de ref.
 */
function loQueDa(cosa, p) {
  const base = p?.base ?? p?.tipo;
  if (cosa.identidad) return base === 'identity' ? cosa.identidad : undefined;
  if (base === 'ref' && !cosa.lugar) return cosa.X;
  return undefined;
}

/** ¿Admite el núcleo estos valores? Ninguno de los puestos sale con motivo (sus validaciones, en su orden, por acciones.ejecucion). */
function losAdmite(eje, accion, X, valores, yo, opciones) {
  try {
    const e = acciones.ejecucion(eje, accion, { X, ...valores }, yo, opciones);
    return !(e.motivos ?? []).some((m) => m.parametro && Object.hasOwn(valores, m.parametro));
  } catch {
    return false;
  }
}

/**
 * Lo que pone una caja a una acción lanzada sobre X para que su registro se cree AHÍ: cuelga del X de la caja y ancla
 * dentro de su lugar, con los huecos de su ancla rellenos con los dígitos del lugar. → los valores ({} si el ancla ya cae
 * ahí sin huecos) o null si no se crea ahí.
 */
function valoresDeLaCaja(eje, accion, plantilla, parametros, X, caja, yo, opciones) {
  const huecos = huecosDelLugar(anclaDe(plantilla).ruta, caja.lugar);
  if (!huecos) return null;
  const valores = {};
  for (const [nombre, digito] of Object.entries(huecos)) {
    const v = comoTipoBase(digito, parametros.find((p) => p.nombre === nombre));
    if (v === undefined) return null;
    valores[nombre] = v;
  }
  return acciones.sobreDe(eje, accion, { X, ...valores }, yo, opciones) === caja.X ? valores : null;
}

/**
 * Cómo encaja una acción lanzada sobre X (la cosa `sobre`) con la otra cosa: las maneras de rellenar sus parámetros. Si una
 * de las dos es una caja, el registro se crea en ella (valoresDeLaCaja); si la otra es una persona o un registro, además un
 * parámetro que la acción necesita, de su tipo, la acepta. Todo lo puesto pasa sus validaciones. → [{ valores, parametros }].
 */
function manerasDeEncajar(eje, accion, plantilla, parametros, sobre, otra, yo, opciones) {
  const X = sobre.X;
  const caja = otra.lugar ? otra : sobre.lugar ? sobre : null;
  const deLaCaja = caja ? valoresDeLaCaja(eje, accion, plantilla, parametros, X, caja, yo, opciones) : {};
  if (!deLaCaja) return [];
  const conLaCaja = (valores) => ({ valores: { ...deLaCaja, ...valores }, parametros: [...Object.keys(deLaCaja), ...Object.keys(valores)] });
  const admite = (m) => !m.parametros.length || losAdmite(eje, accion, X, m.valores, yo, opciones);
  // Soltar en una caja: lo que se crea ahí, con los huecos del lugar.
  if (otra.lugar) return [conLaCaja({})].filter(admite);
  // Lo que se lanza sobre la caja o sobre un registro: un parámetro que la acción necesita acepta lo arrastrado.
  const fuera = [];
  for (const p of parametros) {
    if (!p.requerido) continue;
    const v = loQueDa(otra, p);
    if (v === undefined || Object.hasOwn(deLaCaja, p.nombre)) continue;
    const m = conLaCaja({ [p.nombre]: v });
    if (admite(m)) fuera.push(m);
  }
  return fuera;
}

/** Los parámetros que siguen faltando con estos valores: requeridos, sin valor ni defecto (acciones.acciones, `falta`). */
const faltanCon = (parametros, valores) => parametros.filter((p) => p.falta && !Object.hasOwn(valores, p.nombre)).map((p) => p.nombre);

/**
 * Qué acciones de la época encajan al soltar `arrastrado` en `destino`, para `yo`, con el parámetro ya relleno; si no
 * encaja ninguna, por qué. `opciones`: las de acciones.acciones (idioma, época…). No escribe nada.
 */
export function loQueEncaja(eje, { arrastrado, destino } = {}, yo, opciones = {}) {
  const encajan = [];
  const noATi = [];
  if (!eje?.obtener || typeof yo !== 'string' || !yo || !esCosa(arrastrado) || !esCosa(destino)) return { encajan, motivo: { que: 'nada' } };
  opciones = acciones.conEpoca(eje, opciones);
  const vistas = new Set();
  const lados = [
    { sobre: arrastrado, otra: destino, por: 'arrastrado' },
    { sobre: destino, otra: arrastrado, por: 'destino' },
  ];
  for (const { sobre, otra, por } of lados) {
    if (!eje.obtener(sobre.X)) continue;
    for (const k of PUNTOS_DE_VISTA) {
      let lista;
      try {
        lista = acciones.acciones(eje, sobre.X, k, yo, { ...opciones, noOfrecidas: true });
      } catch {
        continue;
      }
      for (const a of lista) {
        if (a.lectura || a.camino) continue;
        for (const m of manerasDeEncajar(eje, a.id ?? a.nombre, a.plantilla, a.parametros, sobre, otra, yo, opciones)) {
          const clave = JSON.stringify([a.nombre, sobre.X, m.valores]);
          if (vistas.has(clave)) continue;
          vistas.add(clave);
          const opcion = { accion: a.id ?? a.nombre, nombre: a.nombre, etiqueta: a.etiqueta ?? a.nombre, X: sobre.X, valores: m.valores, faltan: faltanCon(a.parametros, m.valores), pv: k, por, parametros: m.parametros };
          // Una plantilla que solo lanza una persona no se ofrece a un agente: la época la permite, pero no a quien mira.
          if (a.puedeLanzar === false) noATi.push({ accion: opcion.accion, nombre: a.nombre, etiqueta: opcion.etiqueta, X: sobre.X, texto: null });
          else encajan.push(opcion);
        }
      }
      // Lo que la época tiene ahí y no ofrece a quien mira: si encajaría, es «lo permite, pero no a ti».
      for (const n of lista.noOfrecidas ?? []) {
        const plantilla = acciones.plantillaDeTransaccion(n.nombre, opciones);
        if (!plantilla || acciones.esLectura(plantilla) || acciones.esCamino(plantilla)) continue;
        const parametros = acciones.parametros(plantilla, { ...opciones, eje }).map((p) => ({ ...p, falta: false }));
        if (!manerasDeEncajar(eje, n.nombre, plantilla, parametros, sobre, otra, yo, opciones).length) continue;
        if (noATi.some((x) => x.nombre === n.nombre && x.X === sobre.X)) continue;
        let porque = null;
        try {
          porque = acciones.porQueNo(eje, sobre.X, n.nombre, yo, opciones);
        } catch { /* sin porqué: se dice que no se ofrece, sin más */ }
        noATi.push({ accion: n.nombre, nombre: n.nombre, etiqueta: n.nombre, X: sobre.X, texto: porque?.texto ?? null });
      }
    }
  }
  if (encajan.length) return { encajan, motivo: null };
  return { encajan, motivo: noATi.length ? { que: 'no-a-ti', acciones: noATi } : { que: 'nada' } };
}
