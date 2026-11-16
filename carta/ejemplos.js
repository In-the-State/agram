// Los ejemplos de la carta: comida (compra del menú), reserva (Booking), tarea (Tasks) o cuenta (la cuenta del banco), dominios con datos
// inventados sobre el mismo núcleo (mudado de la web antigua, antigua/ui/ejemplos.js, al retirarla: #113). Cada ejemplo
// vive en su módulo de ejemplos/ikisai y se carga al elegirlo, con import() dinámico: si el módulo no está en el
// repositorio (o un ejemplo nuevo lleva `pr`: llega con esa PR), se avisa y se sigue con la comida; nada se rompe. Cada
// ejemplo dice qué identidades firman; las claves que falten se generan y se guardan junto a las demás en este
// navegador (las claves de localStorage de los ejemplos: cuentas.CLAVES_EJEMPLO).

import { generarClaves, exportarPrivada } from '../src/autoridad.js';
import { CLAVES_EJEMPLO, leerLocal, guardarLocal } from './cuentas.js';

/** Los ejemplos: id, etiqueta, módulo, PR que lo trae, identidades que firman, con quién se empieza y cómo se construye. */
export const EJEMPLOS = Object.freeze([
  {
    id: 'compra',
    etiqueta: 'comida',
    modulo: '../ejemplos/ikisai/compra-food.mjs',
    identidades: ['casa', 'cocina', 'huesped'],
    identidad: 'huesped',
    async crear(m, claves) {
      const { eje, compra } = await m.ejemploCompra({ claves });
      await m.ejemploCuenta(eje, compra, claves.cocina?.privada);
      // El jardín y el parque (encargo «datos», issue #11): votos y umbral en el 2, paquetes en el 3.
      const privadas = Object.fromEntries(Object.entries(claves).map(([k, v]) => [k, v?.privada]));
      if (m.ejemploJardinYParque) await m.ejemploJardinYParque(eje, { compra }, privadas);
      // La fábrica (encargo «datos2», issue #11): las tres estaciones en la matriz del 4 y la capacidad en el 1.
      if (m.ejemploFabrica) await m.ejemploFabrica(eje, { compra }, privadas);
      // El futuro y el cielo (encargo «datos3», issue #11): entradas con estado en el 7 y la cohorte del proyecto en el 8.
      if (m.ejemploFuturoYCohorte) await m.ejemploFuturoYCohorte(eje, { compra }, privadas);
      return { eje, foco: compra.id };
    },
  },
  {
    id: 'reserva',
    etiqueta: 'reserva',
    modulo: '../ejemplos/ikisai/reserva-booking.mjs',
    identidades: ['casa', 'recepcion', 'huesped'],
    identidad: 'huesped',
    async crear(m, claves) {
      const { eje, reserva } = await m.ejemploReserva({ claves });
      return { eje, foco: reserva.id };
    },
  },
  {
    id: 'tarea',
    etiqueta: 'tarea',
    modulo: '../ejemplos/ikisai/tarea-tasks.mjs',
    identidades: ['casa', 'organizadora', 'proveedor'],
    identidad: 'organizadora',
    async crear(m, claves) {
      const { eje, tarea } = await m.ejemploTarea({ claves });
      return { eje, foco: tarea.id };
    },
  },
  {
    // La cuenta del banco (encargo «cuenta del banco», VG 16-11): una E única con el saldo como dato; la conectora (la app
    // de StateArk) está simulada y bea, con P sobre la cuenta, ordena.
    id: 'cuenta',
    etiqueta: 'cuenta',
    modulo: '../ejemplos/ikisai/cuenta-banco.mjs',
    identidades: ['ana', 'conectora', 'bea'],
    identidad: 'ana',
    async crear(m, claves) {
      const { eje, cuenta } = await m.ejemploCuentaBanco({ claves });
      return { eje, foco: cuenta.id };
    },
  },
]);

const porId = (id) => EJEMPLOS.find((x) => x.id === id);

let elegido = 'compra';
/** Ejemplos cuyo módulo no se pudo cargar en esta sesión: id → motivo. */
const ausentes = new Map();

export function ejemploElegido() {
  return elegido;
}

/** Elige el ejemplo que construirá crearEjemplo (sin construirlo). Un id desconocido no cambia nada. */
export function elegirEjemplo(id) {
  if (porId(id)) elegido = id;
  return elegido;
}

/**
 * ¿El fallo es que el módulo no está? En Node, ERR_MODULE_NOT_FOUND; en el
 * navegador, un TypeError al traerlo. Un módulo que está pero pide al
 * núcleo algo que aún no tiene da otro error (SyntaxError), y se dice tal cual.
 */
function noEsta(e) {
  return e?.code === 'ERR_MODULE_NOT_FOUND' || e instanceof TypeError;
}

/** Carga el módulo de un ejemplo; null (y el motivo en `ausentes`) si no está o no carga. */
export async function cargarModulo(def, importar = (ruta) => import(ruta)) {
  try {
    const m = await importar(def.modulo);
    ausentes.delete(def.id);
    return m;
  } catch (e) {
    const motivo = noEsta(e)
      ? 'aún no está en este repositorio' + (def.pr ? ' (llega con la PR #' + def.pr + ')' : '')
      : 'no carga con este núcleo: ' + String(e?.message ?? e);
    ausentes.set(def.id, motivo);
    return null;
  }
}

/** Por qué no se pudo cargar un ejemplo en esta sesión (o undefined). */
export function motivoAusente(id) {
  return ausentes.get(id);
}

/** Claves de las identidades del ejemplo: las que falten se generan y se guardan con las demás. */
async function asegurarClaves(claves, identidades) {
  const faltan = identidades.filter((id) => !claves[id]);
  if (!faltan.length) return;
  let guardadas = {};
  try { guardadas = JSON.parse(leerLocal(CLAVES_EJEMPLO.claves) ?? '{}') ?? {}; } catch { guardadas = {}; }
  for (const id of faltan) {
    claves[id] = await generarClaves();
    guardadas[id] = { publica: claves[id].publica, privada: await exportarPrivada(claves[id].privada) };
  }
  guardarLocal(CLAVES_EJEMPLO.claves, JSON.stringify(guardadas));
}

/**
 * Construye el eje del ejemplo elegido con las claves de `estado.claves`
 * (completa las que falten) y deja como identidad una que exista en él.
 * Si el módulo del elegido no está o falla al construirse, vuelve a la
 * comida y lo dice en el aviso. Devuelve { eje, foco }.
 */
export async function crearEjemplo(estado, { importar } = {}) {
  const def = porId(elegido) ?? EJEMPLOS[0];
  let r = null;
  const m = await cargarModulo(def, importar);
  if (m) {
    try {
      await asegurarClaves(estado.claves, def.identidades);
      r = await def.crear(m, estado.claves);
    } catch (e) {
      if (def === EJEMPLOS[0]) throw e;
      ausentes.set(def.id, 'no se ha podido construir con este núcleo: ' + String(e.message ?? e));
    }
  }
  let usado = def;
  if (!r) {
    if (def === EJEMPLOS[0]) throw new Error('no se ha podido cargar el ejemplo «' + def.etiqueta + '»');
    estado.aviso = 'El ejemplo «' + def.etiqueta + '» ' + ausentes.get(def.id) + '. Sigue la comida.';
    usado = EJEMPLOS[0];
    const base = await cargarModulo(usado, importar);
    if (!base) throw new Error('no se ha podido cargar el ejemplo «' + usado.etiqueta + '»');
    await asegurarClaves(estado.claves, usado.identidades);
    r = await usado.crear(base, estado.claves);
  }
  elegido = usado.id;
  guardarLocal(CLAVES_EJEMPLO.ejemplo, elegido);
  if (!r.eje.identidades().includes(estado.identidad)) estado.identidad = usado.identidad;
  guardarLocal(CLAVES_EJEMPLO.foco, r.foco);
  return r;
}

/**
 * Al abrir un eje guardado: el foco donde se quedó (si sigue en el eje) y
 * una identidad que exista en él. Devuelve el foco o null.
 */
export function restaurarEjemplo(eje, estado) {
  const def = porId(elegido) ?? EJEMPLOS[0];
  const ids = eje.identidades();
  if (!ids.includes(estado.identidad)) estado.identidad = ids.includes(def.identidad) ? def.identidad : ids[0];
  const foco = leerLocal(CLAVES_EJEMPLO.foco);
  return foco && eje.obtener(foco) ? foco : null;
}
