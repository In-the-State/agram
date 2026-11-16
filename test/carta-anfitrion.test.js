// El anfitrión (encargo «anfitrión y lottie», 16-11; docs/ANFITRION.md): la app que lleva la carta dentro le deja en
// globalThis.__AGRAM_ANFITRION__ un firmante para el segundo factor, y lo por autorizar del 6 de mi alta lleva «autorizar».
// Sin anfitrión, nada cambia. Y lottie-web va dentro del repositorio (carta/vendor/), del propio origen y con su SRI.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as A from '../src/acciones.js';
import { generarClaves, firmarPosesion } from '../src/autoridad.js';
import { schnorr } from '../src/vendor/noble-secp256k1.js';
import { ANUNCIO } from '../src/motor.js';
import { ejemploCompra } from '../ejemplos/ikisai/compra-food.mjs';
import { ejemploNodo, N } from '../ejemplos/state/nodo.mjs';
import { pagaElCoste } from './ayudas-coste.js';
import { arbol, porFirmar } from '../carta/carta.js';
import { html, escapar } from '../carta/dom.js';
import { t } from '../carta/textos.js';
import { anfitrionDe, autorizarCon } from '../carta/anfitrion.js';

const T1 = '2026-11-08T12:00:00Z';
const GRANDE = { ancho: 1920, alto: 1080 };
const ES = { idioma: 'es' };
const aBytes = (hex) => Uint8Array.from(hex.match(/.{2}/g), (h) => parseInt(h, 16));
const aHex = (b) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
/** Un firmante con una clave local (noble), como el guardián: firma el id. */
const firmaCon = (privada) => async ({ id }) => aHex(schnorr.sign(aBytes(id), aBytes(privada), globalThis.crypto.getRandomValues(new Uint8Array(32))));

/** La compra de ejemplo con la huésped, su cosa «cartera» (con clave), su criterio de segundo factor y el pago pendiente. */
async function mundo() {
  const c = await ejemploCompra();
  const { eje, menu } = c;
  const encargo = await eje.escribir({ autor: 'cocina', sobre: menu.id, t: T1, payload: ['Encargo', ['x'], ['all announced movements happened'], ['cocina', 'huesped']], movimientos: [pagaElCoste('cocina')] });
  const anunciado = { token: 'E', emisor: 'casa', denominacion: 'EUR', cantidad: 7, de: 'huesped', a: 'cocina', estado: 'anunciado', refiere: '2026-11-20T10:00:00Z' };
  const anuncio = await eje.escribir({ autor: 'cocina', sobre: encargo.id, en: ANUNCIO, t: T1, payload: 'pagar la cena', movimientos: [pagaElCoste('cocina'), anunciado] });
  const cosa = await generarClaves();
  const altaH = eje.alta('huesped').id;
  const alta = await A.transaccion(eje, 'register a thing', { X: altaH, thing: 'cartera', minutes: 60, key: cosa.publica }, 'huesped', { t: T1 });
  await eje.anadir(await firmarPosesion(alta.evento, 'cartera', cosa.privada));
  const criterio = await A.transaccion(eje, 'second factor', { X: altaH, family: 'E', amount: 5, holder: 'cartera' }, 'huesped', { t: T1 });
  await eje.anadir(criterio.evento);
  const pago = await A.transaccion(eje, 'pay', { X: encargo.id }, 'huesped', { t: T1 });
  assert.ok(pago.ok, JSON.stringify(pago.motivos));
  await eje.anadir(pago.evento);
  assert.equal(A.estacionDeAnuncio(eje, anuncio.id), 'autorizada');
  return { eje, encargo, anuncio, cosa, altaH, pago: pago.evento };
}

const seis = (eje, yo) => arbol({ foco: { X: eje.alta(yo).id, pv: 6 } }, eje, yo, GRANDE, ES);
/** La sección de lo por autorizar del HTML. */
const seccion = (h) => /<section class="por-autorizar"[^]*?<\/section>/.exec(h)?.[0] ?? '';
/** Lo por autorizar como lo pintaba la carta antes del anfitrión (copia literal de htmlPorAutorizar de entonces). */
const attr = (s) => escapar(s).replace(/'/g, '&#39;');
const deAntes = (l) => `<section class="por-autorizar" data-nodo="por-autorizar" title="${attr(t('porAutorizarTitulo'))}"><ul>${l.map((x) => `<li class="por-autorizar-linea${x.desbordado ? ' desbordado' : ''}" data-por-autorizar="${attr(x.id)}"${x.desbordado ? ' data-desbordado' : ''}><button type="button" class="enlace" data-abrir="${attr(x.id)}">${escapar(t('porAutorizar'))}: ${escapar(x.que)}</button> · ${x.desbordado ? `<b class="marca-desbordado">${escapar(t('porAutorizarDesbordado'))}</b> · ` : ''}<small>${escapar(x.falta ?? '')}</small></li>`).join('')}</ul></section>`;
/** Un anfitrión de prueba que solo tiene la clave de `cosa` y firma con ella (o con `firmar`). */
const anfitrionDePrueba = (cosa, firmar) => Object.freeze({ firmante: (c) => (c === cosa ? firmar : null) });

test('sin anfitrión, el HTML de lo por autorizar es idéntico al de antes; con él, la línea lleva «autorizar» al final', async () => {
  const m = await mundo();
  const a = await seis(m.eje, 'huesped');
  const l = a.centro.porAutorizar;
  const x = l.find((y) => y.id === m.pago.id);
  assert.deepEqual([x.propio, x.titular, x.cosas], [true, true, [{ id: 'cartera', texto: 'cartera' }]]);
  const sin = seccion(html(a));
  assert.ok(sin, 'hay sección');
  assert.equal(sin, deAntes(l), 'idéntico al de antes');
  assert.equal(html(a), html(a, { anfitrion: false }));
  assert.doesNotMatch(html(a), /data-autorizar/);
  const con = seccion(html(a, { anfitrion: true }));
  assert.match(con, new RegExp(`<small>[^<]*</small> <button type="button" class="enlace autorizar" data-autorizar="${m.pago.id}" title="firma el segundo factor con la app que lleva esta carta">autorizar</button></li>`));
  assert.equal([...con.matchAll(/data-autorizar=/g)].length, l.filter((y) => y.cosas.length).length, 'una por línea en que me toca');
  assert.equal(con.replace(/ <button type="button" class="enlace autorizar"[^>]*>[^<]*<\/button>/g, ''), sin, 'el resto de la línea no cambia');
  // Mientras firma: inactivo y «autorizando…».
  assert.match(seccion(html(a, { anfitrion: true, autorizando: new Set([m.pago.id]) })), /data-autorizar="[0-9a-f]{64}" title="[^"]*" disabled aria-busy="true">autorizando…<\/button>/);
});

test('con anfitrión: autorizar firma con la clave de la cosa, se asienta, deja de estar por autorizar y la estación pasa a «ejecutada»', async () => {
  const m = await mundo();
  const cosas = porFirmar(m.eje, 'huesped', m.pago.id, ES);
  assert.deepEqual(cosas, [{ id: 'cartera', texto: 'cartera' }]);
  const pedidas = [];
  const anf = Object.freeze({ firmante: async (c) => { pedidas.push(c); return c === 'cartera' ? firmaCon(m.cosa.privada) : null; } });
  const r = await autorizarCon(anf, m.eje, m.pago.id, cosas, { idioma: 'es', asentar: (ev) => m.eje.anadir(ev) });
  assert.deepEqual([r.avisos, r.motivos, r.asentados.length, pedidas], [[], [], 1, ['cartera']]);
  assert.deepEqual([r.asentados[0].autor, r.asentados[0].firmante, r.asentados[0].sobre], ['cartera', 'cartera', m.pago.id]);
  assert.ok(!A.porAutorizar(m.eje, 'huesped').some((x) => x.id === m.pago.id), 'ya no está por autorizar');
  assert.equal(A.estacionDeAnuncio(m.eje, m.anuncio.id), 'ejecutada');
  assert.ok(!((await seis(m.eje, 'huesped')).centro.porAutorizar ?? []).some((x) => x.id === m.pago.id));
  assert.deepEqual(porFirmar(m.eje, 'huesped', m.pago.id, ES), []);
});

test('el anfitrión no tiene la clave: aviso con el nombre de la cosa y nada asentado; basura u otro id: motivo y nada asentado; si lanza, motivo', async () => {
  const m = await mundo();
  const cosas = porFirmar(m.eje, 'huesped', m.pago.id, ES);
  const antes = m.eje.orden.length;
  const asentar = (ev) => m.eje.anadir(ev);
  const sinClave = (cosa) => t('autorizarSinClave', { cosa });
  const sin = await autorizarCon(anfitrionDePrueba('otra'), m.eje, m.pago.id, cosas, { asentar, sinClave });
  assert.deepEqual([sin.avisos, sin.motivos, sin.asentados], [['la app no tiene la clave de cartera'], [], []]);
  const basura = await autorizarCon(anfitrionDePrueba('cartera', async () => '<b>no es una firma</b>'), m.eje, m.pago.id, cosas, { asentar });
  assert.equal(basura.asentados.length, 0);
  assert.match(basura.motivos[0].mensaje, /no devolvió una firma/);
  const otroId = await autorizarCon(anfitrionDePrueba('cartera', async ({ id }) => ({ id: '0'.repeat(64), firma: await firmaCon(m.cosa.privada)({ id }) })), m.eje, m.pago.id, cosas, { asentar });
  assert.equal(otroId.asentados.length, 0);
  assert.match(otroId.motivos[0].mensaje, /firmó otro registro/);
  const otraClave = await autorizarCon(anfitrionDePrueba('cartera', firmaCon((await generarClaves()).privada)), m.eje, m.pago.id, cosas, { asentar });
  assert.equal(otraClave.asentados.length, 0);
  assert.match(otraClave.motivos.map((x) => x.mensaje).join(' '), /firma inválida de cartera/);
  const lanza = await autorizarCon(Object.freeze({ firmante: () => { throw new Error('custodia cerrada'); } }), m.eje, m.pago.id, cosas, { asentar });
  assert.deepEqual([lanza.asentados, lanza.motivos.map((x) => x.mensaje)], [[], ['custodia cerrada']]);
  assert.equal(m.eje.orden.length, antes, 'nada asentado');
  assert.equal(A.estacionDeAnuncio(m.eje, m.anuncio.id), 'autorizada');
  // Sin anfitrión, autorizarCon no hace nada.
  assert.deepEqual(await autorizarCon(null, m.eje, m.pago.id, cosas, { asentar }), { asentados: [], avisos: [], motivos: [] });
});

test('el firmante recibe también la propuesta: su SHA-256 es el id de la propuesta y el «sobre» del registro firmado', async () => {
  const m = await mundo();
  let dado = null;
  const r = await A.autorizar(m.eje, m.pago.id, 'cartera', { firmar: async (x) => { dado = x; return firmaCon(m.cosa.privada)(x); }, t: T1 });
  assert.ok(r.ok, JSON.stringify(r.motivos));
  assert.deepEqual(Object.keys(dado).sort(), ['canonico', 'id', 'propuesta']);
  const sha = createHash('sha256').update(dado.propuesta).digest('hex');
  assert.equal(sha, m.pago.id);
  assert.equal(sha, r.evento.sobre);
  assert.equal(createHash('sha256').update(dado.canonico).digest('hex'), r.evento.id);
  assert.equal(JSON.parse(dado.canonico).sobre, sha);
});

test('época state: el botón sale solo en las líneas en que me toca firmar (mi cosa falta), no en lo propio que firma otro', async () => {
  const { eje, ids } = await ejemploNodo();
  const pend = ids.reinicioPendiente;
  const operador = (await seis(eje, N.operador)).centro.porAutorizar.find((x) => x.id === pend);
  assert.deepEqual([operador.propio, operador.cosas], [true, []], 'el operador lo escribió, pero firma el llavero del titular');
  const titular = (await seis(eje, N.titular)).centro.porAutorizar.find((x) => x.id === pend);
  assert.deepEqual([titular.titular, titular.cosas.map((c) => c.id)], [true, [N.llavero]]);
  assert.doesNotMatch(html(await seis(eje, N.operador), { anfitrion: true }), new RegExp(`data-autorizar="${pend}"`));
  assert.match(html(await seis(eje, N.titular), { anfitrion: true }), new RegExp(`data-autorizar="${pend}"`));
  assert.deepEqual(porFirmar(eje, N.operador, pend), []);
  assert.deepEqual(porFirmar(eje, N.titular, pend).map((c) => c.id), [N.llavero]);
});

test('un __AGRAM_ANFITRION__ mal formado (no objeto, sin función) se ignora; el bueno se lee una vez al cargar', async () => {
  for (const malo of [undefined, null, 5, 'firmante', () => {}, {}, { firmante: 'no' }, { firmante: null }]) assert.equal(anfitrionDe(malo), null, String(malo));
  const bueno = Object.freeze({ firmante: () => null });
  assert.equal(anfitrionDe(bueno), bueno);
  const antes = globalThis.__AGRAM_ANFITRION__;
  try {
    globalThis.__AGRAM_ANFITRION__ = { firmante: 'no es una función' };
    assert.equal((await import('../carta/anfitrion.js?malo')).anfitrion, null);
    globalThis.__AGRAM_ANFITRION__ = bueno;
    const mod = await import('../carta/anfitrion.js?bueno');
    assert.equal(mod.anfitrion, bueno);
    globalThis.__AGRAM_ANFITRION__ = null;
    assert.equal(mod.anfitrion, bueno, 'leído una vez: cambiar el global después no cambia nada');
  } finally {
    globalThis.__AGRAM_ANFITRION__ = antes;
  }
});

// ---------- lottie-web dentro del repositorio ----------

const SHA256_LOTTIE = 'a0757321f974527bda3cc2593bf56cc7ffe4578421249ced6ae49ffb1c529f90';

test('lottie-web vendorizado: el archivo es el del LEEME (sha256), la carta lo carga del propio origen con su SRI y en carta/ no queda ninguna URL de cdnjs', () => {
  const archivo = readFileSync(new URL('../carta/vendor/lottie.min.js', import.meta.url));
  assert.equal(archivo.length, 305543);
  assert.equal(createHash('sha256').update(archivo).digest('hex'), SHA256_LOTTIE);
  const sri = 'sha512-' + createHash('sha512').update(archivo).digest('base64');
  const leeme = readFileSync(new URL('../carta/vendor/LEEME.md', import.meta.url), 'utf8');
  assert.ok(leeme.includes(SHA256_LOTTIE) && leeme.includes(sri), 'el LEEME dice las dos huellas');
  const app = readFileSync(new URL('../carta/app.js', import.meta.url), 'utf8');
  assert.ok(app.includes("new URL('./vendor/lottie.min.js', import.meta.url)"), 'del propio origen');
  assert.ok(app.includes(`s.integrity = '${sri}'`), 'con el mismo SRI');
  assert.doesNotMatch(app, /crossOrigin/);
  // Ninguna URL de cdnjs en la carta (el LEEME de vendor/ dice de dónde se bajó: es su procedencia, no una carga).
  const raiz = fileURLToPath(new URL('../carta/', import.meta.url));
  const todos = (dir) => readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? todos(join(dir, n)) : [join(dir, n)]));
  const conCdnjs = todos(raiz).filter((f) => !f.endsWith(join('vendor', 'LEEME.md')) && /cdnjs\.cloudflare\.com/.test(readFileSync(f, 'utf8')));
  assert.deepEqual(conCdnjs, []);
});
