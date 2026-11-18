// El emparejamiento por QR (carta/emparejamiento.js, carta/nip44.js; docs/notas/EMPAREJAMIENTO.md): los vectores de
// StateArk (QR, delegación, AUTH, revocación y los seis mensajes envueltos), los oficiales de NIP-44 v2, cada código de
// error del QR, envolver y abrir, y el flujo entero con un relé y una app SIMULADOS aquí (nada sale de la máquina).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { schnorr } from '../src/vendor/noble-secp256k1.js';
import { canonico, crearEvento } from '../src/evento.js';
import { hashEtiquetado, verificarBip340 } from '../src/cripto.js';
import { publicaDe, firmar, verificar } from '../src/autoridad.js';
import * as N44 from '../carta/nip44.js';
import * as E from '../carta/emparejamiento.js';

const leer = (f) => JSON.parse(readFileSync(new URL('./vectores/' + f, import.meta.url), 'utf8'));
const V = leer('emparejamiento.json');
const NIP44 = leer('nip44-v2.json').v2;
const hex = (h) => Uint8Array.from(h.match(/.{2}/g) ?? [], (x) => parseInt(x, 16));
const aHex = (u8) => Buffer.from(u8).toString('hex');
const enc = new TextEncoder();
const CEROS = new Uint8Array(32);
const AHORA = Date.parse(V.ahora);
const seg = (ms) => Math.floor(ms / 1000);
const PRIV_APP = V.claves.app.privada;
const APP = V.claves.app.publica;
const PRIV_SESION = V.claves.sesion.privada;
const SESION = V.claves.sesion.publica;
const PRIV_CUENTA = V.claves.cuenta.privada;
const CUENTA = V.claves.cuenta.publica;
const RELE = V.qr.objeto.rele;
const M = E.ESQUEMA_MENSAJE;

const firmaDe = (mensajeBytes, privada) => aHex(schnorr.sign(mensajeBytes, hex(privada), CEROS));
const codeDe = (f) => { try { f(); return 'ok'; } catch (e) { return e.code; } };
const codeDeAsync = async (p) => { try { await p; return 'ok'; } catch (e) { return e.code; } };

/** Una delegación firmada por la app (para QR de prueba con otros plazos o alcances). */
function delegacion({ larga = PRIV_APP, sesion = SESION, alcance = [13, 22242], desde = '2026-11-17T10:00:00.000Z', hasta = '2026-11-17T18:00:00.000Z' } = {}) {
  const cuerpo = { schema: E.ESQUEMA_DELEGACION, uso: E.USO_SESION, larga: publicaDe(larga), sesion, alcance, desde, hasta };
  return { ...cuerpo, firma: firmaDe(hashEtiquetado(E.USO_SESION, enc.encode(canonico(cuerpo))), larga) };
}
const qr = (o = {}) => E.textoDeQR({ rele: RELE, privada: PRIV_SESION, delegacion: delegacion(), ...o });

function revocacion({ por = PRIV_APP, sesion = SESION, larga = publicaDe(por) } = {}) {
  const cuerpo = { schema: E.ESQUEMA_REVOCACION, uso: E.USO_REVOCACION, larga, sesion, instante: '2026-11-17T12:00:00.000Z' };
  return { ...cuerpo, firma: firmaDe(hashEtiquetado(E.USO_REVOCACION, enc.encode(canonico(cuerpo))), por) };
}

// ---------- NIP-44 v2: los vectores oficiales ----------

test('NIP-44 v2: claves de conversación, de mensaje y largos con relleno (vectores oficiales)', async () => {
  for (const v of NIP44.valid.get_conversation_key) {
    assert.equal(aHex(await N44.claveDeConversacion(v.sec1, v.pub2)), v.conversation_key);
  }
  const conv = hex(NIP44.valid.get_message_keys.conversation_key);
  for (const v of NIP44.valid.get_message_keys.keys) {
    const k = await N44.clavesDeMensaje(conv, hex(v.nonce));
    assert.deepEqual([aHex(k.chacha), aHex(k.nonceChacha), aHex(k.hmac)], [v.chacha_key, v.chacha_nonce, v.hmac_key]);
  }
  for (const [n, largo] of NIP44.valid.calc_padded_len) assert.equal(N44.largoConRelleno(n), largo, `largo ${n}`);
});

test('NIP-44 v2: cifrar y descifrar (vectores oficiales, también los largos)', async () => {
  for (const v of NIP44.valid.encrypt_decrypt) {
    const conv = await N44.claveDeConversacion(v.sec1, publicaDe(v.sec2));
    assert.equal(aHex(conv), v.conversation_key);
    assert.equal(await N44.cifrar(v.plaintext, conv, hex(v.nonce)), v.payload);
    assert.equal(await N44.descifrar(v.payload, conv), v.plaintext);
  }
  const sha = (t) => createHash('sha256').update(t).digest('hex');
  for (const v of NIP44.valid.encrypt_decrypt_long_msg) {
    const claro = v.pattern.repeat(v.repeat);
    assert.equal(sha(claro), v.plaintext_sha256);
    const p = await N44.cifrar(claro, hex(v.conversation_key), hex(v.nonce));
    assert.equal(sha(p), v.payload_sha256);
    assert.equal(await N44.descifrar(p, hex(v.conversation_key)), claro);
  }
});

test('NIP-44 v2: lo que no vale se rechaza (vectores oficiales)', async () => {
  for (const v of NIP44.invalid.decrypt) {
    await assert.rejects(N44.descifrar(v.payload, hex(v.conversation_key)), N44.ErrorNip44, v.note);
  }
  for (const v of NIP44.invalid.get_conversation_key) {
    await assert.rejects(N44.claveDeConversacion(v.sec1, v.pub2), N44.ErrorNip44, v.note);
  }
  for (const n of NIP44.invalid.encrypt_msg_lengths) await assert.rejects(N44.cifrar('x'.repeat(n), new Uint8Array(32)), N44.ErrorNip44, 'largo ' + n);
  await assert.rejects(N44.cifrar('', new Uint8Array(32)), N44.ErrorNip44);
  await assert.rejects(N44.cifrar('x'.repeat(65536), new Uint8Array(32)), N44.ErrorNip44);
  await assert.rejects(N44.descifrar('A'.repeat(N44.MAX_PAYLOAD + 4), new Uint8Array(32)), /largo de payload/);
});

// ---------- los vectores de StateArk ----------

test('vectores de StateArk: el QR se arma igual, se lee con su huella, y sus ocho fallos dan su código', () => {
  assert.equal(E.textoDeQR(V.qr.objeto), V.qr.texto);
  const l = E.leerQR(V.qr.texto, { ahora: AHORA });
  assert.deepEqual([l.rele, l.privada, l.delegacion, l.huella], [RELE, PRIV_SESION, V.qr.objeto.delegacion, V.qr.huella]);
  assert.equal(E.huellaCorta(SESION), V.qr.huella);
  assert.equal(V.qr.fallos.length, 8);
  for (const f of V.qr.fallos) assert.equal(codeDe(() => E.leerQR(f.texto, { ahora: Date.parse(f.ahora ?? V.ahora) })), f.code, f.que);
});

test('vectores de StateArk: el AUTH de la sesión sale byte a byte, la revocación y su 7705 verifican', async () => {
  const ev = await E.eventoAuth(V.auth.privada, { ...V.auth.datos, aux: CEROS });
  assert.equal(canonico(ev), canonico(V.auth.evento));
  assert.ok(await E.verificarEvento(V.auth.evento));
  assert.ok(E.revocacionValida(V.revocacion.revocacion));
  assert.ok(!E.revocacionValida({ ...V.revocacion.revocacion, instante: '2026-11-17T12:00:01.000Z' }), 'tocada, no');
  assert.ok(!E.revocacionValida({ ...V.revocacion.revocacion, extra: 1 }), 'con un campo de más, no');
  assert.ok(await E.verificarEvento(V.revocacion.evento7705));
  assert.equal(V.revocacion.evento7705.kind, E.KINDS.REVOCACION);
  assert.ok(verificarBip340(hex(V.registro.firma), hex(V.registro.id), hex(CUENTA)), 'la firma del registro es la de la cuenta');
  assert.equal(createHash('sha256').update(V.registro.canonico).digest('hex'), V.registro.id);
});

test('vectores de StateArk: los seis mensajes se envuelven byte a byte y se abren; el remitente no los abre', async () => {
  assert.deepEqual(V.mensajes.map((m) => m.que), ['hola', 'emparejada', 'propuesta', 'firma', 'rechazo', 'revocada']);
  for (const m of V.mensajes) {
    const regalo = await E.envolver(m.mensaje, { privada: m.privadaRemitente, para: m.para, creadoEn: m.creadoEn, caduca: m.caduca, determinista: { efimera: m.efimera, nonces: m.nonces, aux: CEROS } });
    assert.equal(canonico(regalo), canonico(m.regalo), m.que + ': el regalo');
    const a = await E.abrir(m.regalo, m.privadaDestinatario);
    assert.ok(a, m.que + ': se abre');
    assert.equal(a.motivo, null);
    assert.equal(canonico(a.mensaje), canonico(m.mensaje));
    assert.equal(a.remitente, publicaDe(m.privadaRemitente));
    assert.equal(a.creadoEn, m.creadoEn);
    assert.equal(await E.abrir(m.regalo, m.privadaRemitente), null, m.que + ': el remitente no lo abre');
    assert.equal(m.rumor.kind, E.KINDS.RUMOR);
    assert.equal(m.sello.kind, E.KINDS.SELLO);
    assert.equal(m.regalo.kind, E.KINDS.REGALO);
  }
});

// ---------- el QR: cada código, y los límites de la carta ----------

test('el QR: cada código con su caso, en el orden del SIP, y los límites antes de decodificar', () => {
  const ahora = AHORA;
  const casos = [
    ['ok', qr()],
    ['qr_invalid', 'otra:cosa'],
    ['qr_invalid', E.PREFIJO_QR + '!!!'],
    ['qr_invalid', E.PREFIJO_QR + Buffer.from('no es json').toString('base64url')],
    ['qr_invalid', E.PREFIJO_QR + Buffer.from(canonico({ schema: 'otro', rele: RELE, privada: PRIV_SESION, delegacion: delegacion() })).toString('base64url')],
    ['qr_invalid', E.PREFIJO_QR + 'A'.repeat(E.LIMITES.qr)],
    ['qr_invalid', qr().slice(0, -1) + '='],
    ['relay_invalid', qr({ rele: 'ws://aarpia.ikisai.com/rele' })],
    ['relay_invalid', qr({ rele: 'wss://usuario:clave@aarpia.ikisai.com/rele' })],
    ['relay_invalid', qr({ rele: 'ws://localhost:7777' })],
    ['delegation_invalid', qr({ delegacion: { ...delegacion(), firma: '00'.repeat(64) } })],
    ['ok', qr({ delegacion: delegacion({ larga: 'd4'.repeat(32) }) })], // otra app que delega bien: el QR vale
    ['delegation_invalid', qr({ delegacion: delegacion({ hasta: '2026-11-18T10:00:00.001Z' }) })],
    ['delegation_invalid', qr({ delegacion: delegacion({ hasta: '2026-11-17T10:00:00.000Z' }) })],
    ['delegation_invalid', qr({ delegacion: delegacion({ desde: '17-11-2026' }) })],
    ['session_mismatch', qr({ privada: 'd4'.repeat(32) })],
    ['session_mismatch', qr({ privada: 'no es hex' })],
    ['scope_invalid', qr({ delegacion: delegacion({ alcance: [22242, 13] }) })],
    ['scope_invalid', qr({ delegacion: delegacion({ alcance: [13] }) })],
    ['session_expired', qr({ delegacion: delegacion({ desde: '2026-11-17T11:00:00.000Z' }) })],
  ];
  for (const [code, texto] of casos) assert.equal(codeDe(() => E.leerQR(texto, { ahora })), code, texto.slice(0, 80));
  // ws://localhost solo con `local` (pruebas).
  assert.equal(codeDe(() => E.leerQR(qr({ rele: 'ws://localhost:7777' }), { ahora, local: true })), 'ok');
  assert.equal(codeDe(() => E.leerQR(qr({ rele: 'ws://ejemplo.org' }), { ahora, local: true })), 'relay_invalid');
  // Un pegado con espacios alrededor vale; uno larguísimo, no.
  assert.equal(codeDe(() => E.leerQR('  ' + qr() + '\n', { ahora })), 'ok');
  assert.equal(codeDe(() => E.leerQR(qr() + ' '.repeat(E.LIMITES.qr), { ahora })), 'qr_invalid');
  assert.equal(codeDe(() => E.leerQR(qr(), { ahora: Date.parse('2026-11-17T18:00:00.000Z') })), 'session_expired');
});

// ---------- envolver y abrir ----------

/** Un regalo armado a mano (para probar lo que `envolver` se niega a armar). */
async function regaloCrudo(contenidoRumor, { de = PRIV_APP, para = SESION, kindRumor = E.KINDS.RUMOR, creadoEn = seg(AHORA) } = {}) {
  const pubkey = publicaDe(de);
  const rumor = { pubkey, created_at: creadoEn, kind: kindRumor, tags: [], content: contenidoRumor };
  rumor.id = await E.idDeEvento(rumor);
  const firmarEv = async (ev, priv) => {
    const pk = publicaDe(priv);
    const id = await E.idDeEvento({ ...ev, pubkey: pk });
    return { id, pubkey: pk, created_at: ev.created_at, kind: ev.kind, tags: ev.tags, content: ev.content, sig: aHex(schnorr.sign(hex(id), hex(priv), CEROS)) };
  };
  const sello = await firmarEv({ created_at: creadoEn, kind: 13, tags: [], content: await N44.cifrar(JSON.stringify(rumor), await N44.claveDeConversacion(de, para)) }, de);
  const efimera = 'e5'.repeat(32);
  return firmarEv({ created_at: creadoEn, kind: 1059, tags: [['p', para], ['expiration', String(creadoEn + 3600)]], content: await N44.cifrar(JSON.stringify(sello), await N44.claveDeConversacion(efimera, para)) }, efimera);
}

test('envolver y abrir: ida y vuelta al azar; otra clave, otro esquema o un regalo tocado se descartan', async () => {
  const t = seg(AHORA);
  const mensaje = { schema: M, tipo: 'firma', id: V.registro.id, firma: V.registro.firma };
  const r1 = await E.envolver(mensaje, { privada: PRIV_APP, para: SESION, creadoEn: t, caduca: t + 600 });
  const r2 = await E.envolver(mensaje, { privada: PRIV_APP, para: SESION, creadoEn: t, caduca: t + 600 });
  assert.notEqual(r1.content, r2.content, 'al azar: dos envoltorios distintos');
  assert.notEqual(r1.pubkey, APP, 'el regalo no lo firma el remitente');
  for (const r of [r1, r2]) {
    const a = await E.abrir(r, PRIV_SESION);
    assert.equal(canonico(a.mensaje), canonico(mensaje));
    assert.equal(a.remitente, APP);
  }
  assert.deepEqual(r1.tags, [['p', SESION], ['expiration', String(t + 600)]]);
  // Para otra clave: no lo abre la sesión.
  const otra = await E.envolver(mensaje, { privada: PRIV_APP, para: publicaDe('d4'.repeat(32)), creadoEn: t, caduca: t + 600 });
  assert.equal(await E.abrir(otra, PRIV_SESION), null);
  // Tocado: el contenido, la firma, las etiquetas, el kind.
  const tocar = (c) => c.slice(0, 50) + (c[50] === 'A' ? 'B' : 'A') + c.slice(51);
  for (const malo of [{ ...r1, content: tocar(r1.content) }, { ...r1, sig: '00'.repeat(64) }, { ...r1, tags: [['p', SESION]] }, { ...r1, kind: 1 }, { ...r1, extra: 1 }, null, 'texto']) {
    assert.equal(await E.abrir(malo, PRIV_SESION), null);
  }
  // Otro esquema o forma: se abre, pero con motivo (y el flujo lo descarta).
  for (const contenido of [canonico({ ...mensaje, schema: 'otro@1' }), canonico({ ...mensaje, de: 'más' }), JSON.stringify(mensaje, null, 1), 'no es json', canonico({ schema: M, tipo: 'propuesta', publica: CUENTA, canonico: '{}', id: V.registro.id, segundoFactor: false, libro: 'AB'.repeat(32) })]) {
    const a = await E.abrir(await regaloCrudo(contenido), PRIV_SESION);
    assert.ok(a && typeof a.motivo === 'string', contenido.slice(0, 40));
  }
  // Un rumor de otro kind, o un sello que no es del autor del rumor: se descarta.
  assert.equal(await E.abrir(await regaloCrudo(canonico(mensaje), { kindRumor: 1 }), PRIV_SESION), null);
  // envolver no arma mensajes sin su forma, ni demasiado grandes.
  assert.equal(await codeDeAsync(E.envolver({ ...mensaje, tipo: 'otro' }, { privada: PRIV_APP, para: SESION, creadoEn: t, caduca: t + 1 })), 'message_invalid');
  const enorme = { schema: M, tipo: 'propuesta', publica: CUENTA, canonico: 'x'.repeat(50_000), id: V.registro.id, segundoFactor: false };
  assert.equal(await codeDeAsync(E.envolver(enorme, { privada: PRIV_SESION, para: APP, creadoEn: t, caduca: t + 1 })), 'message_too_large');
  // La clave de usar y tirar no puede ser la del remitente.
  assert.equal(await codeDeAsync(E.envolver(mensaje, { privada: PRIV_APP, para: SESION, creadoEn: t, caduca: t + 1, determinista: { efimera: PRIV_APP } })), 'message_invalid');
});

test('la propuesta admite «libro» opcional (64 hex en minúsculas); sin él, el mensaje es el de los vectores', () => {
  const base = V.mensajes.find((m) => m.que === 'propuesta').mensaje;
  assert.equal(E.formaDelMensaje(base), null);
  assert.equal(E.formaDelMensaje({ ...base, libro: 'ab'.repeat(32) }), null);
  assert.notEqual(E.formaDelMensaje({ ...base, libro: 'AB'.repeat(32) }), null);
  assert.notEqual(E.formaDelMensaje({ ...base, libro: 'ab' }), null);
  assert.notEqual(E.formaDelMensaje({ ...base, otro: 1 }), null);
});

// ---------- la clave de sesión no firma otra cosa ----------

test('la clave de sesión solo firma 13 y 22242: cualquier otro kind se rechaza sin firmar', async () => {
  for (const kind of [0, 1, 1059, 7700, 7701, 7704, 7705, 24242, 27235]) {
    assert.equal(await codeDeAsync(E.firmarEventoDeSesion({ created_at: 1, kind, tags: [], content: '' }, PRIV_SESION)), 'scope_invalid', 'kind ' + kind);
  }
  assert.ok(await E.verificarEvento(await E.firmarEventoDeSesion({ created_at: 1, kind: 13, tags: [], content: 'x' }, PRIV_SESION)));
  // El módulo no exporta nada que firme un registro, ni un firmador genérico.
  const nombres = Object.keys(E).sort();
  assert.deepEqual(nombres.filter((n) => /firm/i.test(n)), ['firmarEventoDeSesion']);
});

// ---------- el relé y la app, simulados ----------

class Temporizador {
  #n = 0;
  pendientes = new Map();
  poner = (f, ms) => { const id = ++this.#n; this.pendientes.set(id, { f, ms }); return id; };
  quitar = (id) => { this.pendientes.delete(id); };
  disparar() { const l = [...this.pendientes.values()]; this.pendientes.clear(); for (const { f } of l) f(); }
}

/** Un relé con las reglas pedidas a AARPIA, en memoria. Los sockets entregan en microtareas. */
class ReleSim {
  guardados = [];
  sockets = new Set();
  revocadas = new Set();
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
    return d.sesion === ev.pubkey && !this.revocadas.has(d.sesion) && ahora >= Date.parse(d.desde) && ahora < Date.parse(d.hasta)
      && verificarBip340(hex(firma), hashEtiquetado(E.USO_SESION, enc.encode(canonico(cuerpo))), hex(d.larga));
  }

  guardar(ev) {
    if (this.guardados.some((g) => g.id === ev.id)) return;
    this.guardados.push(ev);
    for (const s of this.sockets) for (const [sub, f] of s.subs) if (f['#p'].includes(ev.tags[0][1])) s.entregar(['EVENT', sub, ev]);
  }

  para(clave) { return this.guardados.filter((g) => g.tags[0][1] === clave); }
}

/** La app, simulada: abre lo que le llega y responde según `modo`. Idempotente por id. */
class AppSim {
  vistos = new Set();
  respuestas = new Map();
  recibidos = [];
  dialogos = 0;
  constructor({ rele, reloj, modo = { hola: 'aceptar', propuesta: 'firmar' } }) { this.rele = rele; this.reloj = reloj; this.modo = modo; }

  async mandar(mensaje, sesion, { de = PRIV_APP } = {}) {
    const t = seg(this.reloj());
    this.rele.guardar(await E.envolver(mensaje, { privada: de, para: sesion, creadoEn: t, caduca: t + 604_800 }));
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
        await this.mandar(this.modo.hola === 'aceptar' ? { schema: M, tipo: 'emparejada' } : { schema: M, tipo: 'rechazo', id: sesion, code: 'pairing_refused', motivo: 'no' }, sesion);
      } else if (m.tipo === 'propuesta') {
        let resp = this.respuestas.get(m.id);
        if (!resp) {
          const modo = this.modo.propuesta;
          if (modo === 'callar') continue;
          this.dialogos++;
          if (modo === 'firmar') resp = { schema: M, tipo: 'firma', id: m.id, firma: firmaDe(hex(m.id), PRIV_CUENTA) };
          else if (modo === 'falsa') resp = { schema: M, tipo: 'firma', id: m.id, firma: firmaDe(hex(m.id), 'e7'.repeat(32)) };
          else if (modo === 'rechazar') resp = { schema: M, tipo: 'rechazo', id: m.id, code: 'cancelled_by_holder', motivo: 'el titular no la firma' };
          this.respuestas.set(m.id, resp);
        }
        await this.mandar(resp, sesion);
      }
    }
  }
}

/** Espera (sin temporizadores: setImmediate) a que se cumpla algo, atendiendo la app entre vuelta y vuelta. */
async function hasta(cond, app, que = 'la condición') {
  const fin = Date.now() + 5000;
  while (Date.now() < fin) {
    if (app) await app.atender();
    if (await cond()) return;
    await new Promise((r) => setImmediate(r));
  }
  assert.fail('no se cumplió ' + que);
}

/** Un mundo de prueba: reloj, temporizador, relé, app, almacén espiado y la carta. */
function mundo({ modo, almacen = E.almacenEnMemoria() } = {}) {
  const w = { ahora: AHORA, avisos: [] };
  w.reloj = () => w.ahora;
  w.temporizador = new Temporizador();
  w.rele = new ReleSim({ reloj: w.reloj });
  w.app = new AppSim({ rele: w.rele, reloj: w.reloj, modo });
  w.almacen = almacen;
  w.nueva = () => new E.Emparejamiento({ almacen: w.almacen, abrirSocket: w.rele.abrirSocket, reloj: w.reloj, temporizador: w.temporizador, agente: 'navegador · prueba', avisar: (a) => w.avisos.push(a) });
  w.carta = w.nueva();
  w.cerrar = () => { w.carta.cerrar(); w.rele.cortarTodo(); };
  return w;
}

const REGISTRO = { publica: CUENTA, canonico: V.registro.canonico, id: V.registro.id };

// ---------- el flujo ----------

test('flujo: emparejar (hola → emparejada), proponer y recibir la firma verificada, lista para el camino B', async () => {
  const w = mundo();
  try {
    const e = await w.carta.emparejar(V.qr.texto);
    assert.deepEqual(e, { sesion: SESION, huella: '6aa3-da9b', hasta: '2026-11-17T18:00:00.000Z', app: APP, rele: RELE });
    await hasta(() => w.carta.estado().aceptada, w.app, 'emparejada');
    assert.deepEqual(w.app.recibidos[0], { schema: M, tipo: 'hola', agente: 'navegador · prueba' });
    assert.ok(w.avisos.some((a) => a.tipo === 'emparejada'));
    assert.equal(w.carta.estado().conectado, true);
    const p = w.carta.proponer({ ...REGISTRO, segundoFactor: true, nota: 'una nota' });
    await hasta(() => w.carta.propuestas()[0]?.estado === 'firmado', w.app, 'firmado');
    assert.deepEqual(await p, { id: V.registro.id, firma: firmaDe(hex(V.registro.id), PRIV_CUENTA) });
    const recibida = w.app.recibidos.find((m) => m.tipo === 'propuesta');
    assert.deepEqual(recibida, { schema: M, tipo: 'propuesta', publica: CUENTA, canonico: V.registro.canonico, id: V.registro.id, segundoFactor: true, nota: 'una nota' }, 'sin libro, la forma de los vectores');
    // Como en el camino B: el firmante del emparejamiento firma un registro de verdad y el núcleo lo comprueba.
    const ev = await crearEvento({ autor: 'vg', t: '2026-11-17T11:30:00+01:00', movimientos: [{ token: 'T', de: 'vg', a: null, escala: 'segundo', cantidad: 1 }], payload: [['nota', 'propuesto']] });
    const firmado = firmar(ev, w.carta.firmante({ publica: CUENTA, libro: 'ab'.repeat(32) }), 'vg', { publica: CUENTA });
    await hasta(() => w.carta.propuestas().some((x) => x.id === ev.id && x.estado === 'firmado'), w.app);
    const listo = await firmado;
    assert.equal(listo.firmante, 'vg');
    assert.ok(await verificar(listo, CUENTA));
    assert.equal(w.app.recibidos.find((m) => m.id === ev.id).libro, 'ab'.repeat(32), 'con libro, viaja');
  } finally { w.cerrar(); }
});

test('flujo: una firma falsa no vale (sigue «propuesto»); un rechazo da su código y su motivo', async () => {
  const w = mundo({ modo: { hola: 'aceptar', propuesta: 'falsa' } });
  try {
    await w.carta.emparejar(V.qr.texto);
    const p = w.carta.proponer(REGISTRO);
    p.catch(() => {});
    await hasta(() => w.avisos.some((a) => a.tipo === 'firma_invalida'), w.app, 'firma_invalida');
    assert.equal(w.carta.propuestas()[0].estado, 'propuesto');
    assert.equal(w.carta.propuestas()[0].firma, undefined);
    // Un mensaje de otra clave que no es la app (aunque firme bien) se descarta.
    await w.app.mandar({ schema: M, tipo: 'firma', id: V.registro.id, firma: firmaDe(hex(V.registro.id), PRIV_CUENTA) }, SESION, { de: 'e8'.repeat(32) });
    // … y uno de la app con otro esquema, también.
    const crudo = await regaloCrudo(canonico({ schema: 'otro@1', tipo: 'firma', id: V.registro.id, firma: firmaDe(hex(V.registro.id), PRIV_CUENTA) }));
    w.rele.guardar(crudo);
    for (let i = 0; i < 30; i++) await new Promise((r) => setImmediate(r));
    assert.equal(w.carta.propuestas()[0].estado, 'propuesto');
    await w.carta.olvidar();
    assert.equal(await codeDeAsync(p), 'pairing_forgotten');
  } finally { w.cerrar(); }

  const r = mundo({ modo: { hola: 'aceptar', propuesta: 'rechazar' } });
  try {
    await r.carta.emparejar(V.qr.texto);
    const p = r.carta.proponer(REGISTRO);
    p.catch(() => {});
    await hasta(() => r.carta.propuestas()[0]?.estado === 'rechazado', r.app, 'rechazado');
    await assert.rejects(p, (e) => e.code === 'cancelled_by_holder' && /no la firma/.test(e.message));
    assert.deepEqual([r.carta.propuestas()[0].code, r.carta.propuestas()[0].motivo], ['cancelled_by_holder', 'el titular no la firma']);
    assert.equal(await codeDeAsync(r.carta.proponer(REGISTRO)), 'cancelled_by_holder', 'el mismo id: la misma respuesta');
  } finally { r.cerrar(); }
});

test('flujo: la misma propuesta reenviada recibe la misma respuesta; ya firmada, no se manda otra vez', async () => {
  const w = mundo({ modo: { hola: 'aceptar', propuesta: 'callar' } });
  try {
    await w.carta.emparejar(V.qr.texto);
    const p1 = w.carta.proponer(REGISTRO);
    await hasta(() => w.app.recibidos.filter((m) => m.tipo === 'propuesta').length === 1, w.app);
    const p2 = w.carta.proponer(REGISTRO); // sigue «propuesto»: se reenvía
    await w.carta.reenviar(REGISTRO.id);
    await hasta(() => w.app.recibidos.filter((m) => m.tipo === 'propuesta').length === 3, w.app, 'tres envíos');
    const [a, b, c] = w.app.recibidos.filter((m) => m.tipo === 'propuesta');
    assert.equal(canonico(a), canonico(b));
    assert.equal(canonico(b), canonico(c));
    w.app.modo.propuesta = 'firmar';
    w.app.vistos.clear(); // la app vuelve a mirar: responde a los tres envíos, siempre lo mismo
    w.app.recibidos = [];
    await hasta(() => w.carta.propuestas()[0].estado === 'firmado', w.app);
    assert.equal(w.app.dialogos, 1, 'un solo diálogo en la app');
    assert.deepEqual(await p1, await p2);
    const antes = w.rele.para(APP).length;
    assert.deepEqual(await w.carta.proponer(REGISTRO), await p1, 'ya firmada: la firma guardada');
    assert.equal(w.rele.para(APP).length, antes, 'sin mandar nada');
    assert.equal(await codeDeAsync(w.carta.reenviar(REGISTRO.id)), 'not_pending');
  } finally { w.cerrar(); }
});

test('flujo: pasado «hasta» lo propuesto queda «caducado sin firmar» y la sesión se borra', async () => {
  const w = mundo({ modo: { hola: 'aceptar', propuesta: 'callar' } });
  try {
    await w.carta.emparejar(V.qr.texto);
    const p = w.carta.proponer(REGISTRO);
    p.catch(() => {});
    await hasta(() => w.app.recibidos.some((m) => m.tipo === 'propuesta'), w.app);
    const alarma = [...w.temporizador.pendientes.values()].find((x) => x.ms === Date.parse('2026-11-17T18:00:00.000Z') - AHORA);
    assert.ok(alarma, 'una alarma a la hora de «hasta»');
    w.ahora = Date.parse('2026-11-17T18:00:00.000Z');
    w.temporizador.disparar();
    assert.equal(await codeDeAsync(p), 'session_expired');
    assert.equal(w.carta.estado(), null);
    assert.equal(w.carta.propuestas()[0].estado, 'caducado');
    await hasta(() => !Object.keys(w.almacen.volcado()).some((k) => k.startsWith('sesion:')));
    assert.equal(await codeDeAsync(w.carta.proponer(REGISTRO)), 'no_pairing');
    assert.ok(w.avisos.some((a) => a.tipo === 'caducada'));
    assert.equal(w.temporizador.pendientes.size, 0, 'nada programado');
  } finally { w.cerrar(); }
});

test('flujo: «revocada» buena borra la sesión y marca «revocado»; una falsa o ajena no hace nada', async () => {
  const w = mundo({ modo: { hola: 'aceptar', propuesta: 'callar' } });
  try {
    await w.carta.emparejar(V.qr.texto);
    const p = w.carta.proponer(REGISTRO);
    p.catch(() => {});
    await hasta(() => w.app.recibidos.some((m) => m.tipo === 'propuesta'), w.app);
    // Falsas: firmada por otra clave (que dice ser la app), para otra sesión, o tocada.
    const otra = 'e9'.repeat(32);
    for (const r of [revocacion({ por: otra, larga: APP }), revocacion({ sesion: publicaDe('d4'.repeat(32)) }), { ...revocacion(), instante: '2026-11-17T12:00:01.000Z' }]) {
      await w.app.mandar({ schema: M, tipo: 'revocada', revocacion: r }, SESION);
    }
    // Buena, pero mandada por otra clave que no es la app: tampoco.
    await w.app.mandar({ schema: M, tipo: 'revocada', revocacion: revocacion() }, SESION, { de: otra });
    for (let i = 0; i < 40; i++) await new Promise((r) => setImmediate(r));
    assert.ok(w.carta.estado(), 'sigue emparejada');
    assert.equal(w.carta.propuestas()[0].estado, 'propuesto');
    // La buena, de la app.
    await w.app.mandar({ schema: M, tipo: 'revocada', revocacion: V.revocacion.revocacion }, SESION);
    await hasta(() => w.carta.estado() === null, null, 'revocada');
    assert.equal(await codeDeAsync(p), 'session_revoked');
    assert.equal(w.carta.propuestas()[0].estado, 'revocado');
    await hasta(() => !Object.keys(w.almacen.volcado()).some((k) => k.startsWith('sesion:')));
    assert.ok(w.avisos.some((a) => a.tipo === 'revocada'));
  } finally { w.cerrar(); }
});

test('flujo: la app no acepta el emparejamiento (pairing_refused): la sesión se borra', async () => {
  const w = mundo({ modo: { hola: 'rechazar', propuesta: 'callar' } });
  try {
    await w.carta.emparejar(V.qr.texto);
    await hasta(() => w.carta.estado() === null, w.app, 'rechazada');
    assert.ok(w.avisos.some((a) => a.tipo === 'rechazada' && a.code === 'pairing_refused'));
    assert.deepEqual(Object.keys(w.almacen.volcado()).filter((k) => k.startsWith('sesion:')), []);
  } finally { w.cerrar(); }
});

test('flujo: recargar la página recupera la sesión sin otro «hola»; reconecta tras un corte; olvidar no manda nada', async () => {
  const w = mundo({ modo: { hola: 'aceptar', propuesta: 'callar' } });
  try {
    await w.carta.emparejar(V.qr.texto);
    await hasta(() => w.carta.estado().aceptada, w.app);
    const p = w.carta.proponer(REGISTRO);
    p.catch(() => {});
    await hasta(() => w.app.recibidos.some((m) => m.tipo === 'propuesta'), w.app);
    w.carta.cerrar();
    w.rele.cortarTodo();
    // La página vuelve.
    w.carta = w.nueva();
    const e = await w.carta.cargar();
    assert.equal(e.sesion, SESION);
    assert.equal(e.aceptada, true);
    assert.equal(w.carta.propuestas()[0].estado, 'propuesto');
    await hasta(() => w.carta.estado().conectado, w.app);
    assert.equal(w.app.recibidos.filter((m) => m.tipo === 'hola').length, 1, 'un solo hola');
    // Un corte del relé: reconecta con la espera programada.
    w.rele.cortarTodo();
    await hasta(() => !w.carta.estado().conectado);
    assert.equal(w.temporizador.pendientes.size, 2, 'la alarma de «hasta» y el reintento');
    assert.ok([...w.temporizador.pendientes.values()].some((x) => x.ms === 1000), 'el primer reintento, a 1 s');
    const reintento = [...w.temporizador.pendientes.entries()].find(([, x]) => x.ms === 1000);
    w.temporizador.pendientes.delete(reintento[0]);
    reintento[1].f();
    await hasta(() => w.carta.estado().conectado, w.app, 'reconectada');
    // La firma que llega tras reconectar, vale.
    w.app.modo.propuesta = 'firmar';
    await w.carta.reenviar(REGISTRO.id);
    await hasta(() => w.carta.propuestas()[0].estado === 'firmado', w.app);
    // Olvidar: borra la sesión sin mandar nada.
    const antes = w.rele.para(APP).length;
    await w.carta.olvidar();
    assert.equal(w.carta.estado(), null);
    assert.equal(w.rele.para(APP).length, antes);
    assert.deepEqual(Object.keys(w.almacen.volcado()).filter((k) => k.startsWith('sesion:')), []);
    assert.equal(w.temporizador.pendientes.size, 0);
  } finally { w.cerrar(); }
});

test('flujo: proponer comprueba antes de mandar (id, forma canónica, libro, tamaño) y sin sesión no propone', async () => {
  const w = mundo({ modo: { hola: 'aceptar', propuesta: 'callar' } });
  try {
    assert.equal(await codeDeAsync(w.carta.proponer(REGISTRO)), 'no_pairing');
    await w.carta.emparejar(V.qr.texto);
    assert.equal(await codeDeAsync(w.carta.proponer({ ...REGISTRO, id: 'ab'.repeat(32) })), 'id_mismatch');
    const noCanonico = '{ "autor": "vg" }';
    assert.equal(await codeDeAsync(w.carta.proponer({ ...REGISTRO, canonico: noCanonico, id: createHash('sha256').update(noCanonico).digest('hex') })), 'canonical_invalid');
    assert.equal(await codeDeAsync(w.carta.proponer({ ...REGISTRO, libro: 'AB'.repeat(32) })), 'message_invalid');
    assert.equal(await codeDeAsync(w.carta.proponer({ ...REGISTRO, publica: 'ab' })), 'message_invalid');
    const grande = canonico({ autor: 'vg', payload: [['nota', 'x'.repeat(50_000)]] });
    assert.equal(await codeDeAsync(w.carta.proponer({ ...REGISTRO, canonico: grande, id: createHash('sha256').update(grande).digest('hex') })), 'message_too_large');
    assert.deepEqual(w.carta.propuestas(), [], 'nada guardado de lo que no se mandó');
  } finally { w.cerrar(); }
});

test('nada se escribe fuera del almacén inyectado; la privada solo vive en «sesion:<clave>» y no sale por la API', async () => {
  const tocados = [];
  const espias = ['localStorage', 'sessionStorage', 'indexedDB'];
  const antes = Object.fromEntries(espias.map((n) => [n, Object.getOwnPropertyDescriptor(globalThis, n)]));
  for (const n of espias) Object.defineProperty(globalThis, n, { configurable: true, get() { tocados.push(n); return undefined; } });
  const escritas = [];
  const base = E.almacenEnMemoria();
  const almacen = { ...base, poner: (k, v) => { escritas.push(k); return base.poner(k, v); }, volcado: base.volcado };
  const w = mundo({ almacen });
  try {
    await w.carta.emparejar(V.qr.texto);
    await hasta(() => w.carta.estado().aceptada, w.app);
    const p = w.carta.proponer(REGISTRO);
    await hasta(() => w.carta.propuestas()[0]?.estado === 'firmado', w.app, 'firmado');
    await p;
  } finally {
    w.cerrar();
    for (const n of espias) { if (antes[n]) Object.defineProperty(globalThis, n, antes[n]); else delete globalThis[n]; }
  }
  assert.deepEqual(tocados, []);
  assert.deepEqual([...new Set(escritas)].sort(), ['propuestas', 'sesion:' + SESION]);
  const volcado = base.volcado();
  assert.equal(volcado['sesion:' + SESION].privada, PRIV_SESION);
  assert.ok(!JSON.stringify(volcado.propuestas).includes(PRIV_SESION));
  assert.ok(!JSON.stringify(w.carta.propuestas()).includes(PRIV_SESION));
  assert.ok(!JSON.stringify(w.carta.estado()).includes(PRIV_SESION));
  // El módulo no importa el libro, la cuenta ni la sincronía, ni nombra localStorage.
  const fuente = readFileSync(new URL('../carta/emparejamiento.js', import.meta.url), 'utf8');
  const imports = [...fuente.matchAll(/^import .* from '([^']+)';$/gm)].map((m) => m[1]).sort();
  assert.deepEqual(imports, ['../src/autoridad.js', '../src/cripto.js', '../src/evento.js', '../src/vendor/noble-secp256k1.js', './nip44.js']);
  for (const f of ['../carta/emparejamiento.js', '../carta/nip44.js', '../carta/chacha20.js']) {
    const s = readFileSync(new URL(f, import.meta.url), 'utf8').replace(/\/\/.*$/gm, '');
    assert.doesNotMatch(s, /localStorage|sessionStorage|Math\.random|document\.|innerHTML|fetch\(/, f);
  }
});

test('libro de cuenta (Carril F): las formas exactas de hola y emparejada con «cuenta», pedir_claves y claves, gobierno y firma_gobierno; quién manda cada uno', () => {
  const m = (tipo, resto = {}) => ({ schema: M, tipo, ...resto });
  const H = 'ab'.repeat(32);
  const vale = (x) => assert.equal(E.formaDelMensaje(x), null, JSON.stringify(x).slice(0, 120));
  const no = (x) => assert.notEqual(E.formaDelMensaje(x), null, JSON.stringify(x).slice(0, 120));
  assert.deepEqual(E.DE_LA_CARTA, ['hola', 'propuesta', 'pedir_claves', 'gobierno']);
  assert.deepEqual(E.DE_LA_APP, ['emparejada', 'firma', 'rechazo', 'revocada', 'claves', 'firma_gobierno']);
  // hola: «cuenta» opcional, { epoca } de 64 hex.
  vale(m('hola', { agente: 'navegador' }));
  vale(m('hola', { agente: 'navegador', cuenta: { epoca: H } }));
  no(m('hola', { agente: 'navegador', cuenta: { epoca: 'AB'.repeat(32) } }));
  no(m('hola', { agente: 'navegador', cuenta: { epoca: H, mas: 1 } }));
  no(m('hola', { agente: 'navegador', cuenta: H }));
  // emparejada: sin nada, o con { epoca, permiso: { hasta } } (un instante ISO).
  vale(m('emparejada'));
  vale(m('emparejada', { cuenta: { epoca: H, permiso: { hasta: '2026-11-17T10:10:00Z' } } }));
  vale(m('emparejada', { cuenta: { epoca: H, permiso: { hasta: '2026-11-17T10:10:00.000Z' } } }));
  no(m('emparejada', { cuenta: { epoca: H } }));
  no(m('emparejada', { cuenta: { epoca: H, permiso: { hasta: 'mañana' } } }));
  no(m('emparejada', { cuenta: { epoca: H, permiso: { hasta: '2026-11-17T10:10:00Z', usos: 1 } } }));
  no(m('emparejada', { otra: 1 }));
  // pedir_claves y claves.
  vale(m('pedir_claves', { publica: H }));
  no(m('pedir_claves', { publica: H, n: 0 }));
  no(m('pedir_claves', {}));
  const claves = { eje: H, gobierno: H, n: 0, lectura: H, escritura: H, contenido: H, next: H };
  vale(m('claves', claves));
  vale(m('claves', { ...claves, n: 7 }));
  no(m('claves', { ...claves, n: -1 }));
  no(m('claves', { ...claves, n: 1.5 }));
  no(m('claves', { ...claves, lectura: 'ab' }));
  const { next: _next, ...sinNext } = claves;
  no(m('claves', sinNext));
  no(m('claves', { ...claves, privada: H }));
  // gobierno y firma_gobierno.
  vale(m('gobierno', { publica: H, orden: { schema: 'agram.orden@1' } }));
  no(m('gobierno', { publica: H, orden: [] }));
  no(m('gobierno', { publica: H }));
  vale(m('firma_gobierno', { id: H, firma: 'cd'.repeat(64) }));
  no(m('firma_gobierno', { id: H, firma: H }));
  // La carta solo anuncia una época que es un id.
  assert.throws(() => new E.Emparejamiento({ almacen: E.almacenEnMemoria(), epocaDeCuenta: 'no' }), /época de cuenta/);
});
