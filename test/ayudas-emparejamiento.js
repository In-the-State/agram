// El relé y la app de StateArk, SIMULADOS (nada sale de la máquina), para las pruebas de la pantalla del emparejamiento
// (test/carta-emparejado.test.js). Son los de test/emparejamiento.test.js (las mismas reglas del relé y la misma app
// idempotente por id), con dos cambios: la app firma con la clave de la CUENTA, que es la `larga` de la delegación
// (dato de frontera de Core StateArk, 17-11), y responde los rechazos con el código que se le pida. Más lo que la carta
// necesita: QR con otra sesión y otro plazo, revocaciones de una sesión cualquiera y esperar a una promesa atendiendo a
// la app. Claves de PRUEBA: las de test/vectores/emparejamiento.json.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { schnorr } from '../src/vendor/noble-secp256k1.js';
import { canonico } from '../src/evento.js';
import { hashEtiquetado, verificarBip340 } from '../src/cripto.js';
import { publicaDe } from '../src/autoridad.js';
import { sha256, aHex as hexDe } from '../src/cripto.js';
import * as E from '../carta/emparejamiento.js';

export const V = JSON.parse(readFileSync(new URL('./vectores/emparejamiento.json', import.meta.url), 'utf8'));
export const hex = (h) => Uint8Array.from(h.match(/.{2}/g) ?? [], (x) => parseInt(x, 16));
export const aHex = (u8) => Buffer.from(u8).toString('hex');
const enc = new TextEncoder();
const CEROS = new Uint8Array(32);
export const AHORA = Date.parse(V.ahora);
export const seg = (ms) => Math.floor(ms / 1000);
/** La clave de la app, que es la de la cuenta (la `larga` de la delegación). */
export const PRIV_APP = V.claves.app.privada;
export const APP = V.claves.app.publica;
export const PRIV_SESION = V.claves.sesion.privada;
export const SESION = V.claves.sesion.publica;
export const RELE = V.qr.objeto.rele;
export const M = E.ESQUEMA_MENSAJE;

/**
 * Lo que da «claves» en las pruebas (Carril F; StateArk, claves_de_cuenta): INVENTADO. Gobierno es una pública de verdad
 * (la de una privada de prueba) para comprobar firma_gobierno; el eje, el SHA-256 de su pública; lo demás, relleno.
 */
export const PRIV_GOBIERNO = '3c'.repeat(32);
export const CLAVES_DE_PRUEBA = Object.freeze({
  eje: hexDe(sha256(Uint8Array.from(publicaDe(PRIV_GOBIERNO).match(/.{2}/g), (x) => parseInt(x, 16)))),
  gobierno: publicaDe(PRIV_GOBIERNO), n: 0, lectura: '4a'.repeat(32), escritura: '5b'.repeat(32), contenido: '6c'.repeat(32), next: '7d'.repeat(32),
});
/** El permiso de «emparejada» dura 10 minutos (StateArk §4.2). */
export const PERMISO_MS = 10 * 60 * 1000;

export const firmaDe = (mensajeBytes, privada) => aHex(schnorr.sign(mensajeBytes, hex(privada), CEROS));

/** Una delegación firmada por la app, para QR con otra sesión u otro plazo. */
export function delegacion({ larga = PRIV_APP, sesion = SESION, desde = '2026-11-17T10:00:00.000Z', hasta = '2026-11-17T18:00:00.000Z' } = {}) {
  const cuerpo = { schema: E.ESQUEMA_DELEGACION, uso: E.USO_SESION, larga: publicaDe(larga), sesion, alcance: [13, 22242], desde, hasta };
  return { ...cuerpo, firma: firmaDe(hashEtiquetado(E.USO_SESION, enc.encode(canonico(cuerpo))), larga) };
}

/** El texto del QR de una sesión (por defecto, la de los vectores). */
export const qr = ({ privada = PRIV_SESION, ...d } = {}) => E.textoDeQR({ rele: RELE, privada, delegacion: delegacion({ sesion: publicaDe(privada), ...d }) });

/** La revocación de una sesión, firmada por la app. */
export function revocacion(sesion = SESION) {
  const cuerpo = { schema: E.ESQUEMA_REVOCACION, uso: E.USO_REVOCACION, larga: APP, sesion, instante: '2026-11-17T12:00:00.000Z' };
  return { ...cuerpo, firma: firmaDe(hashEtiquetado(E.USO_REVOCACION, enc.encode(canonico(cuerpo))), PRIV_APP) };
}

export class Temporizador {
  #n = 0;
  pendientes = new Map();
  poner = (f, ms) => { const id = ++this.#n; this.pendientes.set(id, { f, ms }); return id; };
  quitar = (id) => { this.pendientes.delete(id); };
  disparar() { const l = [...this.pendientes.values()]; this.pendientes.clear(); for (const { f } of l) f(); }
}

/** Un relé con las reglas pedidas a AARPIA, en memoria. Los sockets entregan en microtareas. */
export class ReleSim {
  guardados = [];
  sockets = new Set();
  auths = 0;
  constructor({ url = RELE, reloj }) { this.url = url; this.reloj = reloj; }

  abrirSocket = (url) => {
    assert.equal(url, this.url, 'la carta solo abre el relé del QR');
    const rele = this;
    const s = {
      desafio: 'desafio-' + (++this.auths), clave: null, subs: new Map(), cerrado: false,
      onopen: null, onmessage: null, onclose: null, onerror: null,
      send(texto) { if (s.cerrado) throw new Error('cerrado'); queueMicrotask(() => rele.recibir(s, texto)); },
      close() { if (s.cerrado) return; s.cerrado = true; rele.sockets.delete(s); queueMicrotask(() => s.onclose?.()); },
      entregar(marco) { if (!s.cerrado) queueMicrotask(() => s.onmessage?.({ data: JSON.stringify(marco) })); },
    };
    this.sockets.add(s);
    queueMicrotask(() => { s.onopen?.(); s.entregar(['AUTH', s.desafio]); });
    return s;
  };

  cortarTodo() { for (const s of [...this.sockets]) s.close(); }

  async recibir(s, texto) {
    const [tipo, a, b] = JSON.parse(texto);
    if (tipo === 'AUTH') {
      const ok = await this.authValido(s, a);
      if (ok) s.clave = a.pubkey;
      s.entregar(['OK', a.id, ok, ok ? '' : 'auth-required: no']);
    } else if (tipo === 'REQ') {
      if (!s.clave) return s.entregar(['CLOSED', a, 'auth-required: primero AUTH']);
      s.subs.set(a, b);
      for (const ev of this.guardados) if (b['#p'].includes(ev.tags[0][1])) s.entregar(['EVENT', a, ev]);
      s.entregar(['EOSE', a]);
    } else if (tipo === 'EVENT') {
      if (!s.clave) return s.entregar(['OK', a.id, false, 'auth-required: primero AUTH']);
      const ok = (await E.verificarEvento(a)) && a.kind === 1059;
      if (ok) this.guardar(a);
      s.entregar(['OK', a.id, ok, ok ? '' : 'invalid: no']);
    }
  }

  async authValido(s, ev) {
    if (!(await E.verificarEvento(ev)) || ev.kind !== 22242) return false;
    const t = (n) => ev.tags.find((x) => x[0] === n)?.[1];
    if (t('relay') !== this.url || t('challenge') !== s.desafio) return false;
    const d = JSON.parse(t('delegacion'));
    const { firma, ...cuerpo } = d;
    const ahora = this.reloj();
    return d.sesion === ev.pubkey && ahora >= Date.parse(d.desde) && ahora < Date.parse(d.hasta)
      && verificarBip340(hex(firma), hashEtiquetado(E.USO_SESION, enc.encode(canonico(cuerpo))), hex(d.larga));
  }

  guardar(ev) {
    if (this.guardados.some((g) => g.id === ev.id)) return;
    this.guardados.push(ev);
    for (const s of this.sockets) for (const [sub, f] of s.subs) if (f['#p'].includes(ev.tags[0][1])) s.entregar(['EVENT', sub, ev]);
  }

  para(clave) { return this.guardados.filter((g) => g.tags[0][1] === clave); }
}

/**
 * La app, simulada: abre lo que le llega y responde según `modo` ({ hola: 'aceptar' | 'rechazar', propuesta: 'firmar' |
 * 'callar' | 'rechazar', code }). Firma con la clave de la cuenta (= la larga); a una propuesta con otra pública responde
 * unknown_account, como la app de verdad. Idempotente por id.
 *
 * El libro de cuenta (Carril F; StateArk, RESPUESTA_LIBRO_DE_CUENTA.md §3 y §4): si «hola» anuncia la época, «emparejada»
 * lleva el permiso de un solo uso (10 minutos), salvo con `cuenta: 'vieja'` (una app que no lo conoce). A «pedir_claves»
 * da CLAVES_DE_PRUEBA (`claves`: 'dar' | 'callar' | 'rechazar' | 'no_aceptada'); a «gobierno», la firma con gobierno
 * (`gobierno`: 'firmar' | 'rechazar'). `claves` admite también 'eje_falso' y 'eje_del_texto' (un eje que no es el SHA-256
 * de los bytes de gobierno), y `app: 'v1'` hace de app de antes: rechaza el «hola» con «cuenta» (message_invalid, id de la
 * sesión); `app: 'siempre_invalido'`, todo «hola». `sinDialogo`: los ids de las propuestas que firmaría SIN segundo diálogo, con las
 * condiciones de StateArk §4.5; las demás llevarían el diálogo de siempre.
 */
export class AppSim {
  vistos = new Set();
  respuestas = new Map();
  recibidos = [];
  sinDialogo = [];
  permiso = null; // { sesion, epoca, hasta, usado }
  constructor({ rele, reloj, modo = { hola: 'aceptar', propuesta: 'firmar' } }) { this.rele = rele; this.reloj = reloj; this.modo = modo; }

  /** ¿La firmaría sin segundo diálogo? (StateArk §4.5: todas a la vez; gasta el permiso). */
  cumplePermiso(m, sesion) {
    const p = this.permiso;
    if (!p || p.sesion !== sesion || p.usado || this.reloj() >= Date.parse(p.hasta)) return false;
    let c;
    try { c = JSON.parse(m.canonico); } catch { return false; }
    const x = c?.contexto ?? {};
    const ok = c.sobre === null && x.genesis === true && x.epoca === p.epoca && m.publica === APP && x.claves?.[c.autor] === m.publica
      && !('tanda' in x) && !('epocaEscrita' in x) && (!('eje' in x) || x.eje === CLAVES_DE_PRUEBA.eje);
    if (ok) p.usado = true;
    return ok;
  }

  async mandar(mensaje, sesion) {
    const t = seg(this.reloj());
    this.rele.guardar(await E.envolver(mensaje, { privada: PRIV_APP, para: sesion, creadoEn: t, caduca: t + 604_800 }));
  }

  async atender() {
    for (const r of this.rele.para(APP)) {
      if (this.vistos.has(r.id)) continue;
      this.vistos.add(r.id);
      const a = await E.abrir(r, PRIV_APP);
      if (!a || a.motivo) continue;
      const m = a.mensaje;
      this.recibidos.push(m);
      const sesion = a.remitente;
      if (m.tipo === 'hola') {
        // Una app v1 valida «hola» con claves exactas: con «cuenta», message_invalid con el id de la sesión (sin revocarla).
        // «siempre_invalido»: a todo «hola», lo mismo (para ver que la carta solo reintenta una vez).
        if ((this.modo.app === 'v1' && m.cuenta) || this.modo.app === 'siempre_invalido') {
          await this.mandar({ schema: M, tipo: 'rechazo', id: sesion, code: 'message_invalid', motivo: '«hola» lleva solo «agente»' }, sesion);
          continue;
        }
        const conPermiso = this.modo.hola === 'aceptar' && m.cuenta && this.modo.cuenta !== 'vieja';
        if (conPermiso) this.permiso = { sesion, epoca: m.cuenta.epoca, hasta: new Date(this.reloj() + PERMISO_MS).toISOString(), usado: false };
        if (this.modo.hola === 'aceptar') this.aceptadas = new Set([...(this.aceptadas ?? []), sesion]);
        await this.mandar(this.modo.hola === 'aceptar' ? { schema: M, tipo: 'emparejada', ...(conPermiso ? { cuenta: { epoca: m.cuenta.epoca, permiso: { hasta: this.permiso.hasta } } } : {}) } : { schema: M, tipo: 'rechazo', id: sesion, code: 'pairing_refused', motivo: 'no' }, sesion);
      } else if (m.tipo === 'pedir_claves') {
        const modo = this.modo.claves ?? 'dar';
        if (modo === 'callar') continue;
        const aceptada = this.aceptadas?.has(sesion) && modo !== 'no_aceptada';
        if (!aceptada) await this.mandar({ schema: M, tipo: 'rechazo', id: sesion, code: 'not_accepted', motivo: 'aún no' }, sesion);
        else if (modo === 'rechazar' || m.publica !== APP) await this.mandar({ schema: M, tipo: 'rechazo', id: m.publica, code: 'unknown_account', motivo: 'no es mi cuenta' }, sesion);
        else if (modo === 'eje_falso') await this.mandar({ schema: M, tipo: 'claves', ...CLAVES_DE_PRUEBA, eje: 'e1'.repeat(32) }, sesion);
        else if (modo === 'eje_del_texto') await this.mandar({ schema: M, tipo: 'claves', ...CLAVES_DE_PRUEBA, eje: hexDe(sha256(new TextEncoder().encode(CLAVES_DE_PRUEBA.gobierno))) }, sesion);
        else await this.mandar({ schema: M, tipo: 'claves', ...CLAVES_DE_PRUEBA }, sesion);
      } else if (m.tipo === 'gobierno') {
        const id = hexDe(sha256(new TextEncoder().encode(canonico(m.orden))));
        if (this.modo.gobierno === 'rechazar') await this.mandar({ schema: M, tipo: 'rechazo', id, code: 'cancelled_by_holder', motivo: 'no' }, sesion);
        else await this.mandar({ schema: M, tipo: 'firma_gobierno', id, firma: firmaDe(hex(id), PRIV_GOBIERNO) }, sesion);
      } else if (m.tipo === 'propuesta') {
        if (this.cumplePermiso(m, sesion)) this.sinDialogo.push(m.id);
        let resp = this.respuestas.get(m.id);
        if (!resp) {
          const modo = this.modo.propuesta;
          if (modo === 'callar') continue;
          if (m.publica !== APP) resp = { schema: M, tipo: 'rechazo', id: m.id, code: 'unknown_account', motivo: 'no es mi cuenta' };
          else if (modo === 'firmar') resp = { schema: M, tipo: 'firma', id: m.id, firma: firmaDe(hex(m.id), PRIV_APP) };
          else if (modo === 'rechazar') resp = { schema: M, tipo: 'rechazo', id: m.id, code: this.modo.code ?? 'cancelled_by_holder', motivo: 'motivo de la app <b>no se pinta</b>' };
          this.respuestas.set(m.id, resp);
        }
        await this.mandar(resp, sesion);
      }
    }
  }
}

const vuelta = () => new Promise((r) => setImmediate(r));

/** Espera (sin temporizadores) a que se cumpla algo, atendiendo a la app entre vuelta y vuelta. */
export async function hasta(cond, app, que = 'la condición') {
  const fin = Date.now() + 8000;
  while (Date.now() < fin) {
    if (app) await app.atender();
    if (await cond()) return;
    await vuelta();
  }
  assert.fail('no se cumplió ' + que);
}

/** Espera a una promesa atendiendo a la app mientras tanto (lo que firma la app: un génesis, un registro). */
export async function conLaApp(promesa, app) {
  let hecho = false;
  const p = Promise.resolve(promesa).finally(() => { hecho = true; });
  p.catch(() => {});
  const fin = Date.now() + 8000;
  while (!hecho && Date.now() < fin) { await app.atender(); await vuelta(); }
  if (!hecho) assert.fail('la promesa no se resolvió');
  return p;
}

/** Un mundo de prueba: reloj, temporizador, relé, app, almacén y la carta (un Emparejamiento). */
export function mundo({ modo, almacen = E.almacenEnMemoria(), epocaDeCuenta = null } = {}) {
  const w = { ahora: AHORA, avisos: [] };
  w.reloj = () => w.ahora;
  w.temporizador = new Temporizador();
  w.rele = new ReleSim({ reloj: w.reloj });
  w.app = new AppSim({ rele: w.rele, reloj: w.reloj, modo });
  w.almacen = almacen;
  w.nueva = () => new E.Emparejamiento({ almacen: w.almacen, abrirSocket: w.rele.abrirSocket, reloj: w.reloj, temporizador: w.temporizador, agente: 'navegador · prueba', avisar: (a) => w.avisos.push(a), epocaDeCuenta });
  w.carta = w.nueva();
  w.cerrar = () => { w.carta.cerrar(); w.rele.cortarTodo(); };
  return w;
}
