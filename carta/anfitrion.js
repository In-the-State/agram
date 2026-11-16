// El anfitrión (docs/ANFITRION.md): la app que lleva la carta dentro (la de escritorio de StateArk, u otra) y le deja un
// firmante para el segundo factor. Antes de cargar la carta deja un objeto congelado en globalThis.__AGRAM_ANFITRION__:
//
//   { firmante(cosa) → función firmar | null }      (puede devolver una promesa)
//
// `firmante(cosa)` recibe la identidad de la cosa titular y da el `firmar` de acciones.autorizar
// (({ canonico, id, propuesta }) → firma en hex | { id, firmante, firma }), o null si no tiene la clave de esa cosa. Qué
// clave de su custodia usa es asunto del anfitrión. La carta no nombra a ninguna app: el contrato es genérico.
//
// Se lee UNA vez, al cargar este módulo; después nadie lo cambia. Si no es un objeto con `firmante` función, no hay
// anfitrión (null) y la carta queda exactamente como sin él. Nada que venga del anfitrión se pinta como HTML, y un error
// suyo es un aviso: no rompe la carta.
//
// La cuenta en el guardián (camino B, VG 17-11; docs/ANFITRION.md «La cuenta en el guardián»): si el mismo objeto ofrece
// además crearCuenta, cuentas, firmar y sesion (`guardian`), una cuenta nueva nace en el guardián y la carta firma TODO
// con él (firmanteDeCuenta): propone sin firmar y el guardián firma con la clave de la propia cuenta, que la carta nunca
// ve. Sin esos cuatro verbos, `guardian` es null y todo sigue por el camino A, como hoy. `pedirSesion` es un verbo
// opcional más (abre la sesión sin escribir ningún registro): no entra en la detección.

import * as acciones from '../src/acciones.js';
import { evaluar } from '../src/bqlm.js';
import { ContextoEje } from '../src/contexto-eje.js';
import { epocaDelEje } from '../src/epocas.js';
import { clavePublicaValida, verificar } from '../src/autoridad.js';
import { canonico, cuerpo } from '../src/evento.js';

/** El global del anfitrión, leído UNA vez al cargar (si leerlo lanza, como si no estuviera). */
const delGlobal = (() => { try { return globalThis.__AGRAM_ANFITRION__; } catch { return undefined; } })();

/** El anfitrión válido de un valor (el global): el mismo objeto si tiene `firmante` función; si no, null. */
export function anfitrionDe(valor) {
  return valor !== null && typeof valor === 'object' && typeof valor.firmante === 'function' ? valor : null;
}

/** El anfitrión de esta página, leído una vez al cargar, o null. */
export const anfitrion = anfitrionDe(delGlobal);

// ---------- la cuenta en el guardián (camino B) ----------

/** Los verbos que abren el camino B: con los cuatro, la cuenta nace en el guardián y firma con él. */
export const VERBOS_DEL_GUARDIAN = Object.freeze(['crearCuenta', 'cuentas', 'firmar', 'sesion']);

/** El guardián de un valor (el global): el mismo objeto si ofrece los cuatro verbos del camino B; si no, null. Nunca lanza. */
export function guardianDe(valor) {
  try {
    return valor !== null && typeof valor === 'object' && VERBOS_DEL_GUARDIAN.every((v) => typeof valor[v] === 'function') ? valor : null;
  } catch {
    return null;
  }
}

/** El guardián de esta página (camino B), leído una vez al cargar, o null (camino A). */
export const guardian = guardianDe(delGlobal);

/** Los errores del guardián que la carta dice en llano (su clave en carta/textos.js); cualquier otro es un fallo sin más. */
export const ERRORES_DEL_GUARDIAN = Object.freeze({
  session_closed: 'guardianSesionCerrada',
  cancelled_by_holder: 'guardianNoFirmado',
  unknown_account: 'guardianSinCuenta',
  dialog_busy: 'guardianOtroDialogo',
});

const HEX64 = /^[0-9a-f]{128}$/;

/** El error con que la carta no intenta una firma automática con la sesión cerrada (el mismo `code` que daría el guardián). */
export const errorDeSesionCerrada = () => Object.assign(new Error('la sesión del guardián está cerrada'), { code: 'session_closed' });

/** El `code` de un error del guardián (el núcleo lo conserva al relanzar; si no, el de su `cause`), o null. Nunca lanza. */
export function codigoDe(e) {
  try {
    if (typeof e?.code === 'string') return e.code;
    return typeof e?.cause?.code === 'string' ? e.cause.code : null;
  } catch {
    return null;
  }
}

/** La clave de carta/textos.js con que se dice un error del guardián: la de su `code` o, si no es uno conocido, «guardianFallo». */
export const claveDelError = (e) => ERRORES_DEL_GUARDIAN[codigoDe(e)] ?? 'guardianFallo';

/** ¿Tiene el guardián una sesión abierta para esta cuenta? Ante cualquier duda (lanza, devuelve otra cosa), no. Nunca lanza. */
export async function sesionAbierta(g, publica) {
  try {
    const r = await g.sesion(publica);
    return r !== null && typeof r === 'object' && r.abierta === true;
  } catch {
    return false;
  }
}

/** ¿Ofrece el guardián el verbo opcional `pedirSesion`? Nunca lanza. */
export function puedePedirSesion(g) {
  try {
    return g !== null && typeof g === 'object' && typeof g.pedirSesion === 'function';
  } catch {
    return false;
  }
}

/**
 * Pide al guardián que abra la sesión (`pedirSesion({ publica })`: su diálogo nativo, sin escribir ningún registro) y
 * devuelve `{ abierta, caduca }`. Con la misma limpieza que `sesionAbierta`: solo `abierta === true` cuenta como abierta
 * (cualquier otra forma, o un rechazo, es `{ abierta: false, caduca: null }`) y `caduca` solo se conserva si es un número
 * o un texto. Sin el verbo, null. Nunca lanza.
 */
export async function pedirSesion(g, publica) {
  if (!puedePedirSesion(g)) return null;
  try {
    const r = await g.pedirSesion({ publica });
    const abierta = r !== null && typeof r === 'object' && r.abierta === true;
    const c = abierta ? r.caduca : null;
    return { abierta, caduca: (typeof c === 'number' && Number.isFinite(c)) || (typeof c === 'string' && c !== '') ? c : null };
  } catch {
    return { abierta: false, caduca: null };
  }
}

/** ¿Tiene el guardián la cuenta de esta clave pública (cuentas())? Sin guardián, o si algo falla, no. Nunca lanza. */
export async function tieneLaCuenta(g, publica) {
  if (!g || typeof publica !== 'string') return false;
  try {
    const lista = await g.cuentas();
    return Array.isArray(lista) && lista.some((c) => c !== null && typeof c === 'object' && c.publica === publica);
  } catch {
    return false;
  }
}

/**
 * Pide al guardián una cuenta nueva (crearCuenta({ nombre }): abre la sesión en el mismo diálogo) y devuelve su clave
 * pública, comprobada (x-only en hexadecimal). Si el guardián rechaza, lanza con su `code`; si devuelve otra cosa, lanza.
 */
export async function crearEnElGuardian(g, nombre) {
  const r = await g.crearCuenta({ nombre });
  const publica = r !== null && typeof r === 'object' ? r.publica : undefined;
  if (typeof publica !== 'string' || !clavePublicaValida(publica)) throw new Error('el guardián no ha dado una clave pública válida para la cuenta');
  return publica;
}

/** La lectura del segundo factor sobre una candidata (la de acciones.transaccion: «second factor», X.6.8.7, con ev = la candidata). */
const SEGUNDO_FACTOR_DE_LA_CANDIDATA = '(first ev.6).8.7';

/** Un ocupante del BQL mínimo como dato plano (como el `plano` de src/acciones.js: lo que hace falta aquí son ids). */
function plano(o, ctx) {
  if (typeof o === 'string' || typeof o === 'number' || typeof o === 'boolean') return o;
  if (o && typeof o === 'object' && (typeof o.simbolo === 'string' || o.k === 'dec')) return undefined;
  return ctx.valor(o);
}

/**
 * ¿Pide segundo factor la candidata que se va a firmar? (docs/CONTRATO.md §12.4 bis): con el eje, la lectura «second
 * factor» de la época sobre la candidata (sus criterios que alcanza; la misma que usa acciones.transaccion y, ya escrito,
 * acciones.segundoFactor para decir «por autorizar»). Sin criterios de su autor ni de otra plantilla, no (el atajo de
 * acciones.segundoFactor); el génesis tampoco (sin libro no hay criterios). Si no se puede calcular (sin eje, la lectura
 * parada por un límite, un error): verdadero; ante la duda, el diálogo del guardián.
 */
export function segundoFactorDe(eje, { canonico, id } = {}) {
  try {
    const cuerpo = JSON.parse(canonico);
    if (cuerpo?.sobre === null && cuerpo?.contexto?.genesis === true) return false;
    if (!eje || typeof eje.obtener !== 'function') return true;
    if (!acciones.criteriosDeSegundoFactor(eje, cuerpo.autor).length && !acciones.criteriosDeOtraPlantilla(eje).length) return false;
    const ctx = new ContextoEje(eje, { ev: { ...cuerpo, id }, epoch: epocaDelEje(eje) });
    const r = evaluar(SEGUNDO_FACTOR_DE_LA_CANDIDATA, ctx);
    if (r.estado !== 'RESUELTO') return true;
    return r.valor.some((o) => { const v = plano(o, ctx); return typeof v === 'string' && Boolean(eje.obtener(v)); });
  } catch {
    return true;
  }
}

/**
 * El firmante de una cuenta del guardián, el único que la carta usa para ella: ({ canonico, id }) →
 * guardian.firmar({ publica, canonico, id, segundoFactor }), con `segundoFactor` calculado sobre el eje de `eje()` (el que
 * está en pantalla). Tiene la forma del firmante del núcleo, que comprueba lo que vuelve (forma, id, que verifica con la
 * clave); aquí se comprueba también, para dar un `code`. `error`: el error de la última firma (null si firmó), para
 * decirlo en llano.
 */
export function firmanteDeCuenta(g, publica, { eje = () => null } = {}) {
  const firmar = async ({ canonico, id }) => {
    firmar.error = null;
    try {
      const r = await g.firmar({ publica, canonico, id, segundoFactor: segundoFactorDe(eje(), { canonico, id }) });
      // Lo que vuelve se comprueba aquí también (el núcleo lo vuelve a hacer), para que un fallo del guardián lleve `code`
      // y la carta lo diga en llano: otro id, id_mismatch; una firma que no es o no verifica con la cuenta, invalid_signature.
      const objeto = r !== null && typeof r === 'object';
      if (objeto && r.id !== undefined && r.id !== id) throw Object.assign(new Error('el guardián firmó otro registro'), { code: 'id_mismatch' });
      const firma = typeof r === 'string' ? r : objeto ? r.firma : undefined;
      if (typeof firma !== 'string' || !HEX64.test(firma) || !(await verificar({ id, firma }, publica))) throw Object.assign(new Error('el guardián devolvió una firma que no vale para esta cuenta'), { code: 'invalid_signature' });
      return r;
    } catch (e) {
      firmar.error = e === undefined || e === null ? new Error('el guardián no firmó') : e;
      throw e;
    }
  };
  firmar.error = null;
  return firmar;
}

/**
 * El firmante del servicio de pagos (src/pago.js) para una cuenta del guardián: { pubkey, firmar(idHex, evento) } con
 * guardian.firmarServicio({ publica, evento }) (el evento NIP-98 entero sin firmar: el guardián recalcula su id). Lo que
 * vuelve ha de ser una firma de 64 bytes en hexadecimal (o { firma }); si no, lanza. Sin firmarServicio, {}: no se firma.
 */
export function firmanteDeServicio(g, publica) {
  if (!g || typeof g.firmarServicio !== 'function') return {};
  return {
    pubkey: publica,
    firmar: async (_idHex, evento) => {
      const r = await g.firmarServicio({ publica, evento });
      const firma = typeof r === 'string' ? r : r !== null && typeof r === 'object' ? r.firma : undefined;
      if (typeof firma !== 'string' || !HEX64.test(firma)) throw new Error('el guardián no devolvió una firma del servicio (64 bytes en hexadecimal)');
      return firma;
    },
  };
}

/**
 * El verbo opcional `criterios({ publica, registros }) → { aceptados }` (cerrado con StateArk el 17-11): si el guardián lo
 * ofrece, recibe los registros de los criterios de segundo factor del titular (acciones.criteriosDeSegundoFactor: los
 * «second factor» de su 2.4) como [{ canonico, id, firma }] (el cuerpo canónico, su id y su firma). No pide sesión; con una
 * cuenta que no tiene rechaza con unknown_account. De `aceptados` no se depende. → { ids, error } (ids: los pasados, para
 * no repetir lo mismo; error: el rechazo, o null), o null si no lo ofrece. Nunca lanza.
 */
export async function pasarCriterios(g, eje, identidad, publica) {
  if (!g || typeof g.criterios !== 'function' || !eje) return null;
  try {
    const registros = acciones.criteriosDeSegundoFactor(eje, identidad).map((c) => eje.obtener(c.id)).filter(Boolean)
      .map((ev) => ({ canonico: canonico(cuerpo(ev)), id: ev.id, firma: ev.firma ?? null }));
    let error = null;
    try {
      await g.criterios({ publica, registros });
    } catch (e) {
      error = e ?? new Error('el guardián no aceptó los criterios'); // un fallo del guardián no rompe la carta
    }
    return { ids: registros.map((r) => r.id), error };
  } catch {
    return null;
  }
}

/**
 * Autoriza el registro `id` con las cosas mías que le faltan (`cosas`: [{ id, texto }], las de carta.porFirmar): por
 * cada una pide al anfitrión su firmante; sin firmante, el aviso «la app no tiene la clave de <cosa>»; con él,
 * acciones.autorizar y, si vale, `asentar(evento)` (el camino por el que la carta asienta un registro). Cada cosa va por
 * su cuenta: la que firma bien se asienta aunque otra no. Lo que falle en el anfitrión (lanza, devuelve basura, firma otro
 * registro) es un motivo, nunca una excepción.
 * → { asentados: [evento], avisos: [texto], motivos: [{ regla, mensaje }] }.
 */
export async function autorizarCon(anf, eje, id, cosas, { asentar, idioma, sinClave = (cosa) => cosa } = {}) {
  const r = { asentados: [], avisos: [], motivos: [] };
  if (!anf) return r;
  for (const cosa of cosas ?? []) {
    let firmar;
    try {
      firmar = await anf.firmante(cosa.id);
    } catch (e) {
      r.motivos.push({ regla: null, mensaje: String(e?.message ?? e) });
      continue;
    }
    if (typeof firmar !== 'function') { r.avisos.push(sinClave(cosa.texto ?? cosa.id)); continue; }
    const a = await acciones.autorizar(eje, id, cosa.id, { firmar, idioma });
    if (!a.ok || !a.evento) { r.motivos.push(...(a.motivos ?? [])); continue; }
    try {
      r.asentados.push(await asentar(a.evento));
    } catch (e) {
      r.motivos.push({ regla: null, mensaje: String(e?.message ?? e).replace(/^evento (rechazado|mal formado): /, '') });
    }
  }
  return r;
}
