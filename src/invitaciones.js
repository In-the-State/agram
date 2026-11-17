// Las invitaciones de un libro (VG 9-11, mapa §16 [D]; eje.invitar y eje.aceptar): lecturas puras, sin DOM, para la
// carta (entrar en un libro al que me han invitado, agram-equipo/DISENO_CARTA_VARIOS_LIBROS.md §4.9) y para el volcado.
// Documentación: docs/CONTRATO.md §12.10.
//
//   invitacionesA(eje, quien)                        las invitaciones a esa identidad, si aún no tiene alta
//   invitacionPendiente(eje, quien, { duena, … })    la que el volcado puede usar (ejemplos/volcado/volcar.mjs)
//   invitacionesParaClave(eje, publica, { t })       las pendientes hechas a esa clave pública: [{ id, autor, invitado, da, hasta, tema, t }]
//   altaConClave(eje, publica)                       ¿hay ya en el libro un alta con esa clave? → { identidad, alta } o null
//
// Nada escribe ni firma. Una invitación es un registro con «invitation» en su 0 y la identidad invitada en su 3.1 (eje.invitar).
// La clave a la que se hace es la que declara su `contexto.claves` para el invitado (lo que el servidor lee para aceptar su alta).

const hojas = (x) => (Array.isArray(x) ? x.flatMap(hojas) : [x]);
const RE_CLAVE = /^[0-9a-f]{64}$/;
const esInvitacion = (ev) => hojas(ev?.payload?.[0]).includes('invitation');
const invitadoDe = (ev) => { const q = hojas(ev?.payload?.[3]?.[1])[0]; return typeof q === 'string' && q ? q : null; };

/** Las invitaciones a `quien` (su 3.1), en orden de llegada, si aún no tiene alta en el libro; si la tiene, []. */
export function invitacionesA(eje, quien) {
  if (eje.alta(quien)) return [];
  return eje.orden.map((id) => eje.obtener(id)).filter((ev) => esInvitacion(ev) && invitadoDe(ev) === quien);
}

/**
 * La invitación sin aceptar para `quien` que el volcado puede usar, o null (la última por llegada): la escribió la
 * dueña, declara la clave de la casa (`clave`, si se conoce), no ha caducado en `t` y su grupo (0) y su dominio (el
 * alta de la dueña) son los que el volcado pondría. Una de otro, o distinta, no se toca: la dueña escribe otra.
 */
export function invitacionPendiente(eje, quien, { duena, clave = null, t = null }) {
  const dominio = eje.alta(duena)?.id;
  const vale = (ev) => {
    if (ev.autor !== duena) return false;
    if (clave && (ev.contexto?.claves?.[quien] ?? null) !== clave) return false;
    const hasta = hojas(ev.payload?.[7])[0];
    if (hasta !== undefined && hasta !== 'sin plazo' && !(t && Date.parse(hasta) > Date.parse(t))) return false;
    if (hojas(ev.payload?.[8])[0] !== 0) return false;
    return (ev.payload?.[5]?.[0]?.ref ?? null) === dominio;
  };
  return invitacionesA(eje, quien).filter(vale).at(-1) ?? null;
}

/**
 * Las invitaciones pendientes de este libro hechas a la clave pública `publica` (64 hexadecimales): las que declaran esa
 * clave para su invitado (`contexto.claves`), cuyo invitado aún no tiene alta y que no han caducado en `t` (por
 * defecto, ahora). → [{ id, autor (quien invita), invitado (con qué nombre entro: su 3.1), da (lo que dice su 1, como
 * textos), hasta, tema, t }], en orden de llegada. [] si la clave no tiene esa forma.
 */
export function invitacionesParaClave(eje, publica, { t = new Date().toISOString() } = {}) {
  const clave = typeof publica === 'string' ? publica.toLowerCase() : '';
  if (!RE_CLAVE.test(clave) || !eje?.orden) return [];
  const fuera = [];
  for (const id of eje.orden) {
    const ev = eje.obtener(id);
    if (!esInvitacion(ev)) continue;
    const invitado = invitadoDe(ev);
    if (!invitado || eje.alta(invitado)) continue;
    const declarada = ev.contexto?.claves?.[invitado];
    if (typeof declarada !== 'string' || declarada.toLowerCase() !== clave) continue;
    const hasta = hojas(ev.payload?.[7])[0];
    if (hasta !== undefined && hasta !== 'sin plazo' && !(Date.parse(hasta) > Date.parse(t))) continue;
    const da = hojas(ev.payload?.[1]).filter((x) => typeof x === 'string' && x !== 'nada');
    const tema = hojas(ev.payload?.[9]).find((x) => typeof x === 'string') ?? null;
    fuera.push({ id: ev.id, autor: ev.autor, invitado, da, hasta: typeof hasta === 'string' ? hasta : null, tema, t: ev.t ?? null });
  }
  return fuera;
}

/** ¿Hay ya en el libro un alta cuya clave es `publica`? → { identidad, alta } (la primera) o null. */
export function altaConClave(eje, publica) {
  const clave = typeof publica === 'string' ? publica.toLowerCase() : '';
  if (!RE_CLAVE.test(clave) || typeof eje?.identidades !== 'function') return null;
  for (const identidad of eje.identidades()) {
    const k = eje.clave(identidad);
    const alta = eje.alta(identidad);
    if (alta && typeof k === 'string' && k.toLowerCase() === clave) return { identidad, alta: alta.id };
  }
  return null;
}
