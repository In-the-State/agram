// Entrar en un libro al que me han invitado (agram-equipo/DISENO_CARTA_VARIOS_LIBROS.md §4.9, el lado de quien entra):
// lo que la carta hace sin DOM, para probarlo en Node.
//
//   datosDeInvitacion({ url, eje, claveLectura })  la validación estricta de los tres datos → { datos } o { motivo }
//   leerArchivoDeInvitacion(texto)                  un .json con exactamente { url, eje, claveLectura } → { datos } o { motivo }
//   bajarLibro(datos)                               el libro del servidor, solo para leer → { eje, sincronia } o { motivo }
//   vistaDeInvitacion(eje, publica)                 lo que la pantalla dice: el libro, y mi alta o mis invitaciones
//   destinoGuardado(estado)                         el destino guardado de un libro (url, eje) si su eje no lo dice
//
// La clave de lectura es un secreto: nunca va en un motivo, ni se pinta, ni a la consola. El libro que se baja es dato
// hostil: todo lo suyo se enseña como texto (dom.js htmlInvitado lo escapa). Nada de esto firma ni escribe: aceptar es
// eje.aceptar con el firmante de la cuenta (app.js).

import { sincronia, salida } from '../src/index.js';
import { invitacionesParaClave, altaConClave, ceroLegible } from '../src/contrato.js';
import { t } from './textos.js';

const { Sincronia } = sincronia;

/** El nombre de un eje en el servidor: el juego de caracteres que admite (servidor/supabase/funciones/eventos/api.js NOMBRE_EJE). */
export const RE_EJE = /^[a-z0-9][a-z0-9._-]{0,63}$/;
/** Una clave de lectura: base64url (la que da el servidor al crear el eje, 43 caracteres), entre 16 y 128. */
export const RE_CLAVE_LECTURA = /^[A-Za-z0-9_-]{16,128}$/;
/** Lo más largo que se acepta en la dirección de la puerta. */
const LARGO_URL = 300;
/** Lo más grande que se acepta como archivo de invitación (son tres datos cortos). */
export const TOPE_ARCHIVO = 4096;

/** ¿Es una dirección que la carta puede usar como puerta? https, o http solo en localhost y 127.0.0.1 (pruebas). Sin usuario, clave ni fragmento. */
function urlValida(texto) {
  if (typeof texto !== 'string') return null;
  const v = texto.trim();
  if (!v || v.length > LARGO_URL) return null;
  let u;
  try { u = new URL(v); } catch { return null; }
  if (u.username || u.password || u.hash || u.search) return null;
  const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
  if (!(u.protocol === 'https:' || (u.protocol === 'http:' && local))) return null;
  return v.replace(/\/+$/, '');
}

/** Los tres datos de una invitación, validados: { datos: { url, eje, claveLectura } } o { motivo } (nunca con la clave dentro). */
export function datosDeInvitacion({ url, eje, claveLectura } = {}) {
  const u = urlValida(url);
  if (!u) return { motivo: t('invitadoUrlMala') };
  const e = typeof eje === 'string' ? eje.trim() : '';
  if (!RE_EJE.test(e)) return { motivo: t('invitadoEjeMalo') };
  const c = typeof claveLectura === 'string' ? claveLectura.trim() : '';
  if (!RE_CLAVE_LECTURA.test(c)) return { motivo: t('invitadoClaveMala') };
  return { datos: { url: u, eje: e, claveLectura: c } };
}

/** El archivo de la invitación: un JSON con exactamente las claves url, eje y claveLectura (ni una más). → { datos } o { motivo }. */
export function leerArchivoDeInvitacion(texto) {
  if (typeof texto !== 'string' || !texto.trim() || texto.length > TOPE_ARCHIVO) return { motivo: t('invitadoArchivoMalo') };
  let o;
  try { o = JSON.parse(texto); } catch { return { motivo: t('invitadoArchivoMalo') }; }
  if (!o || typeof o !== 'object' || Array.isArray(o)) return { motivo: t('invitadoArchivoMalo') };
  const claves = Object.keys(o).sort();
  if (claves.join(',') !== 'claveLectura,eje,url' || claves.some((k) => typeof o[k] !== 'string')) return { motivo: t('invitadoArchivoMalo') };
  return datosDeInvitacion(o);
}

/** Un motivo que viene de la red, sin la clave de lectura aunque el servidor la repitiera, y corto. */
const sinSecreto = (texto, clave) => String(texto ?? '').split(clave || '\u0000').join('…').slice(0, 300);

/**
 * Baja el libro del servidor solo para leer, con la verificación normal del eje (la de ejeDelServidor: Sincronia desde el
 * génesis del servidor). → { eje, sincronia } (la sincronía queda lista para subir lo que se escriba después) o { motivo }.
 */
export async function bajarLibro({ url, eje: nombre, claveLectura }, { fetch = globalThis.fetch?.bind(globalThis), ahora } = {}) {
  const S = new Sincronia({ url, eje: nombre, claveLectura, fetch, ...(ahora ? { ahora } : {}) });
  let informe;
  try { informe = await S.sincronizar(null, { exigirFirmas: false }); } catch (e) { return { motivo: sinSecreto(e?.message ?? e, claveLectura) }; }
  if (!informe.eje) {
    const motivo = informe.errores.length ? informe.errores.join(' · ') : informe.sinRed ? t('sinRed') : t('servidorVacio');
    return { motivo: sinSecreto(motivo, claveLectura) };
  }
  if (informe.errores.length) return { motivo: sinSecreto(informe.errores.join(' · '), claveLectura) };
  return { eje: informe.eje, sincronia: S };
}

/** Un texto del libro para enseñarlo (dato hostil: corto; dom.js lo escapa). */
const corto = (x, n = 120) => (typeof x === 'string' ? (x.length > n ? x.slice(0, n - 1) + '…' : x) : null);
/** El 0 legible de un registro del libro, o null. */
const ceroDe = (eje, id) => { try { return corto(ceroLegible(eje, id, { idioma: 'es' })?.texto ?? null); } catch { return null; } };

/**
 * Lo que dice la pantalla de un libro bajado para mi clave `publica`: { libro: { nombre, genesis (sus 12 primeros) },
 * miAlta: { identidad, alta } | null, invitaciones: [{ id, autor, quienInvita (el 0 de su alta), invitado, da, coste: {
 * cantidad, escala } | null, tema }] }. Si mi alta ya está, no hay invitaciones que ofrecer.
 */
export function vistaDeInvitacion(eje, publica, { t: ahora } = {}) {
  const libro = { nombre: ceroDe(eje, eje.genesisId), genesis: String(eje.genesisId ?? '').slice(0, 12) };
  const miAlta = altaConClave(eje, publica);
  if (miAlta) return { libro, miAlta, invitaciones: [] };
  const invitaciones = invitacionesParaClave(eje, publica, ahora ? { t: ahora } : {}).map((i) => {
    let coste = null;
    try { const q = salida.quemaDelCoste(i.invitado, ['Alta de ' + i.invitado], 'minuto', { eje }); coste = q ? { cantidad: q.cantidad, escala: q.escala } : null; } catch { coste = null; }
    const altaDeQuien = eje.alta(i.autor)?.id ?? null;
    return { id: i.id, autor: corto(i.autor, 64), quienInvita: altaDeQuien ? ceroDe(eje, altaDeQuien) : null, invitado: corto(i.invitado, 64), da: i.da.map((x) => corto(x, 80)).slice(0, 10), coste, tema: corto(i.tema) };
  });
  return { libro, miAlta: null, invitaciones };
}

/** El destino guardado de un libro (el estado de su sincronía: cuentas.estadoSincronia), si su eje no lo dice: { url, eje } o null. */
export function destinoGuardado(estado) {
  const d = datosDeInvitacion({ url: estado?.url, eje: estado?.eje, claveLectura: 'x'.repeat(16) });
  return d.datos ? { url: d.datos.url, eje: d.datos.eje } : null;
}
