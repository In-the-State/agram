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

import * as acciones from '../src/acciones.js';

/** El anfitrión válido de un valor (el global): el mismo objeto si tiene `firmante` función; si no, null. */
export function anfitrionDe(valor) {
  return valor !== null && typeof valor === 'object' && typeof valor.firmante === 'function' ? valor : null;
}

/** El anfitrión de esta página, leído una vez al cargar, o null. */
export const anfitrion = anfitrionDe(globalThis.__AGRAM_ANFITRION__);

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
