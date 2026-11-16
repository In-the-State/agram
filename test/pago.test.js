// El cliente del servicio de pagos de StateArk (src/pago.js; encargo «carta: pagos», 16-11): el evento NIP-98 con el id
// del vector compartido con el backend (test/vectores/nip98.json, copiado de stateark-sim abc5e84), la cabecera, el
// cuerpo firmado = el enviado, el contador en `content`, y las rutas contra el servidor HTTP de la simulación
// (servidor/sim/stateark/ 108f888) CON la firma del titular exigida: sin firma 401, con otra clave 403, repetida
// `replay`; los recibos por txid y por puntero (404 → null, 422 unconfirmed → pendiente); `deConfiguracion` sin
// «pay url». Claves de PRUEBA: la del vector y otra derivada igual; nada real.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { schnorr } from '../src/vendor/noble-secp256k1.js';
import { sha256, aHex, deHex } from '../src/cripto.js';
import { idNip98, eventoNip98, cabeceraNip98, pagoHttp, pagoCon, deConfiguracion, destino, ErrorDePago, KIND_NIP98, CONFIGURACION } from '../src/pago.js';
import * as agram from '../src/index.js';
import { crearServidor } from '../servidor/sim/stateark/servidor.js';
import { Verificador } from '../servidor/sim/stateark/nip98.js';
import { firmaSimulada, mensajeAutorizacion } from '../servidor/sim/stateark/pagos.js';
import { huella } from '../servidor/sim/stateark/canon.js';
import { Eje } from '../src/eje.js';
import { generarClaves } from '../src/autoridad.js';
import { salida } from '../src/index.js';
import * as G from '../carta/guia.js';

const vector = JSON.parse(readFileSync(new URL('./vectores/nip98.json', import.meta.url), 'utf8'));
const claveDePrueba = (semilla) => createHash('sha256').update(`titular de PRUEBA «${semilla}»`).digest('hex');
const VG = vector.peticion.clave_privada_de_prueba;
const AINA = claveDePrueba('aina');
const publica = (privada) => aHex(schnorr.getPublicKey(deHex(privada)));
/** El firmante inyectable: firmar(idHex) → firmaHex (BIP-340 de la noble vendorizada, como la cuenta de la carta). */
const firmanteDe = (privada, aux) => ({ pubkey: publica(privada), firmar: async (id) => aHex(schnorr.sign(deHex(id), deHex(privada), aux ?? globalThis.crypto.getRandomValues(new Uint8Array(32)))) });
const utf8 = (t) => new TextEncoder().encode(t);
const leerCabecera = (c) => JSON.parse(Buffer.from(c.replace(/^Nostr /, ''), 'base64').toString('utf8'));

// ── El evento NIP-98 y el vector compartido ───────────────────────────────────────────────────────

test('el id NIP-01 del vector del backend (nip98.rs) sale igual; el evento de la petición del vector, su firma y su cabecera también', async () => {
  assert.equal(idNip98(vector.id_de_nip98_rs.evento), vector.id_de_nip98_rs.id);
  const p = vector.peticion;
  assert.equal(publica(VG), vector.evento.pubkey);
  const ev = eventoNip98({ pubkey: publica(VG), url: p.url, metodo: p.metodo, cuerpo: p.cuerpo, content: '', creado: p.ahora });
  const { sig, ...sinFirma } = vector.evento;
  assert.deepEqual(ev, sinFirma, 'el mismo evento, con el mismo orden de claves');
  assert.equal(ev.id, vector.evento.id);
  assert.equal(ev.kind, KIND_NIP98);
  assert.deepEqual(ev.tags.find((t) => t[0] === 'payload'), ['payload', p.payload]);
  // La firma con el firmante inyectable (aux_rand a ceros, como la sim al fijar el vector) es la del vector.
  const firma = await firmanteDe(VG, new Uint8Array(32)).firmar(ev.id);
  assert.equal(firma, sig);
  assert.equal(cabeceraNip98({ ...ev, sig: firma }), vector.cabecera);
  assert.equal(cabeceraNip98(vector.evento), vector.cabecera);
  assert.throws(() => cabeceraNip98(ev), TypeError, 'sin firma no hay cabecera');
  // El verificador de la sim lo acepta con la url del vector.
  assert.equal(await new Verificador().verificar(vector.cabecera, p.metodo, '/pagos/cartera', Buffer.from(p.cuerpo), { base: new URL(p.url).origin, ahora: p.ahora }), vector.evento.pubkey);
});

test('sin cuerpo no hay payload; un content distinto da otro id; lo mal formado no se firma', () => {
  const base = { pubkey: publica(VG), url: 'https://pagos.ejemplo/pagos/recibo-pago/ab', metodo: 'GET', creado: 5 };
  assert.deepEqual(eventoNip98(base).tags, [['u', base.url], ['method', 'GET']]);
  assert.deepEqual(eventoNip98({ ...base, cuerpo: '' }).tags, [['u', base.url], ['method', 'GET']]);
  assert.notEqual(eventoNip98({ ...base, content: '1' }).id, eventoNip98({ ...base, content: '2' }).id);
  assert.throws(() => eventoNip98({ ...base, pubkey: 'AB' }), TypeError);
  assert.throws(() => eventoNip98({ ...base, creado: 1.5 }), TypeError);
  assert.throws(() => eventoNip98({ ...base, url: '' }), TypeError);
});

// ── El adaptador HTTP: lo que firma es lo que envía ──────────────────────────────────────────────

test('el cuerpo firmado es el enviado, la u es la pay url + la ruta, cada petición lleva su content (un contador) y los GET van sin firma', async () => {
  const llamadas = [];
  const fetch = async (url, init) => {
    llamadas.push({ url, init });
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const f = firmanteDe(VG);
  const p = pagoHttp({ url: 'https://pagos.ejemplo/', fetch, ...f, ahora: () => 1_763_300_000_000 });
  assert.equal(p.url, 'https://pagos.ejemplo');
  await p.saldos({ nombre: 'vg' });
  await p.saldos({ nombre: 'vg' });
  await p.cartera({ nombre: 'vg' });
  await p.reciboPago('ab'.repeat(32));
  const [s1, s2, c, r] = llamadas;
  for (const { url, init } of [s1, s2, c]) {
    const ev = leerCabecera(init.headers.Authorization);
    const tag = (k) => ev.tags.find((t) => t[0] === k)?.[1];
    assert.equal(tag('u'), url, 'la u es exactamente la url pedida');
    assert.equal(tag('method'), 'POST');
    assert.equal(tag('payload'), aHex(sha256(utf8(init.body))), 'el payload es el SHA-256 del cuerpo que se envía');
    assert.equal(ev.pubkey, f.pubkey);
    assert.equal(ev.created_at, 1_763_300_000);
    assert.equal(ev.id, idNip98(ev));
    assert.equal(schnorr.verify(deHex(ev.sig), deHex(ev.id), deHex(ev.pubkey)), true);
  }
  assert.equal(s1.url, 'https://pagos.ejemplo/pagos/saldos');
  assert.equal(s1.init.body, '{"nombre":"vg"}');
  assert.equal(c.init.body, JSON.stringify({ nombre: 'vg', titular: f.pubkey }), 'la cartera nombra titular a quien firma');
  const [e1, e2] = [s1, s2].map((x) => leerCabecera(x.init.headers.Authorization));
  assert.equal(s1.init.body, s2.init.body);
  assert.notEqual(e1.content, e2.content, 'dos peticiones iguales en el mismo segundo: otro content');
  assert.equal(Number(e2.content), Number(e1.content) + 1, 'un contador');
  assert.notEqual(e1.id, e2.id);
  assert.equal(r.url, 'https://pagos.ejemplo/pagos/recibo-pago/' + 'ab'.repeat(32));
  assert.equal(r.init.method, 'GET');
  assert.equal(r.init.headers.Authorization, undefined, 'los GET, sin firma');
  assert.equal(r.init.body, undefined);
  // Sin firmante: los GET sí; lo firmado, no.
  const solo = pagoHttp({ url: 'https://pagos.ejemplo', fetch });
  assert.deepEqual(await solo.reciboPorPuntero('cd'.repeat(32)), { ok: true });
  await assert.rejects(solo.saldos({ nombre: 'vg' }), TypeError);
  // Sin red: ErrorDePago sin estado.
  const caido = pagoHttp({ url: 'https://pagos.ejemplo', fetch: async () => { throw new Error('caído'); }, ...f });
  await assert.rejects(caido.reciboPago('ab'.repeat(32)), (e) => e instanceof ErrorDePago && e.estado === null && /caído/.test(e.message));
});

// ── Contra el servidor HTTP de la sim, con la firma del titular EXIGIDA ──────────────────────────

let servidor;
let base;
before(async () => {
  ({ servidor } = await crearServidor({ firmaTitular: true, urlPublica: '' }));
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${servidor.address().port}`;
});
after(() => new Promise((r) => servidor.close(r)));

const minar = async () => (await fetch(base + '/minar', { method: 'POST' })).json();
const codigoDe = (estado, codigo) => (e) => e instanceof ErrorDePago && e.estado === estado && e.codigo === codigo;

test('las cuatro rutas que lo exigen, firmadas por el titular, y autorizar y ejecutar; los recibos por txid y por puntero: 404 null, 422 pendiente', async () => {
  const vg = pagoHttp({ url: base, ...firmanteDe(VG) });
  const aina = pagoHttp({ url: base, ...firmanteDe(AINA) });
  assert.equal((await vg.raiz()).simulado, true);
  assert.deepEqual(await vg.cartera({ nombre: 'vg' }), { nombre: 'vg', titular: publica(VG) });
  await aina.cartera({ nombre: 'aina' });
  const { direccion } = await vg.direccion({ nombre: 'vg' });
  await fetch(base + '/pagos/acunar', { method: 'POST', body: JSON.stringify({ direccion, sat: 300_000 }) }); // el grifo, sin firma (solo simulación)
  await minar();
  assert.equal((await vg.saldos({ nombre: 'vg' })).con_fondos_en_sats, 300_000);
  assert.equal((await vg.saldos({ nombre: 'vg' })).con_fondos_en_sats, 300_000, 'la misma petición dos veces en el mismo segundo: no es replay');
  const destino = (await aina.direccion({ nombre: 'aina' })).direccion;
  const puntero = aHex(sha256(utf8('un registro de AGRAM que se paga')));
  const instruccion = { schema: 'stateark.payment-instruction@2', rail: 'bitcoin.onchain', amount: { valor: 61_000, unidad: 'sat' }, destino: { clase: 'bitcoin/address', valor: destino }, correlation_id: 'PAGO-1', puntero };
  const plan = await vg.preparar({ nombre: 'vg', instruccion });
  const firma = await firmaSimulada(publica(VG), await mensajeAutorizacion(await huella(plan))); // la autorización del titular: aquí la simulada de la sim (la carta no autoriza pagos)
  const autorizacion = await vg.autorizar({ plan, firma });
  const recibo = await vg.ejecutar({ nombre: 'vg', instruccion, plan, autorizacion });
  const txid = recibo.posicion.txid;

  // Sin bloque: pendiente, por txid y por puntero.
  assert.deepEqual(await vg.reciboPago(txid), { pendiente: true });
  assert.deepEqual(await aina.reciboPorPuntero(puntero), { pendiente: true });
  await minar();
  const sobre = await vg.reciboPago(txid);
  assert.equal(sobre.schema, 'stateark.recibo@1');
  assert.deepEqual(sobre.recibo[0], ['recibo', 'pago']);
  assert.deepEqual(sobre.recibo[1], [txid]);
  const porPuntero = await pagoHttp({ url: base }).reciboPorPuntero(puntero); // cualquiera, sin firmante: solo el id del registro
  assert.deepEqual(porPuntero.recibo, sobre.recibo);
  // 404: null (un txid o un id sin pago, o mal formado).
  assert.equal(await vg.reciboPago('0'.repeat(64)), null);
  assert.equal(await vg.reciboPorPuntero('0'.repeat(64)), null);
  assert.equal(await vg.reciboPorPuntero('no-es-un-id'), null);
  // Otro 422 del carril: ErrorDePago con su código.
  await assert.rejects(vg.preparar({ nombre: 'vg', instruccion: { ...instruccion, rail: 'ark' } }), codigoDe(422, 'rail_unknown'));
});

test('sin firma 401 (titular_signature_missing), con la clave de otro 403 (not_titular), la misma petición repetida 401 (replay)', async () => {
  const vg = pagoHttp({ url: base, ...firmanteDe(VG) });
  await vg.cartera({ nombre: 'vg2' });
  // Sin la cabecera: el servicio la exige.
  const sinCabecera = async (url, init) => fetch(url, { ...init, headers: { 'Content-Type': 'application/json' } });
  await assert.rejects(pagoHttp({ url: base, fetch: sinCabecera, ...firmanteDe(VG) }).direccion({ nombre: 'vg2' }), codigoDe(401, 'titular_signature_missing'));
  // La firma vale, pero es de otra clave: no es el titular de esa cartera.
  for (const llamar of [(p) => p.direccion({ nombre: 'vg2' }), (p) => p.saldos({ nombre: 'vg2' }), (p) => p.preparar({ nombre: 'vg2', instruccion: {} })]) {
    await assert.rejects(llamar(pagoHttp({ url: base, ...firmanteDe(AINA) })), codigoDe(403, 'not_titular'));
  }
  // La misma petición dos veces (la misma cabecera): la segunda es replay.
  const dosVeces = async (url, init) => {
    await fetch(url, init);
    return fetch(url, init);
  };
  await assert.rejects(pagoHttp({ url: base, fetch: dosVeces, ...firmanteDe(VG) }).saldos({ nombre: 'vg2' }), codigoDe(401, 'replay'));
  // Una firma que no es del id: inválida.
  await assert.rejects(pagoHttp({ url: base, pubkey: publica(VG), firmar: async () => '00'.repeat(64) }).saldos({ nombre: 'vg2' }), codigoDe(401, 'titular_signature_invalid'));
  // La u es la de otra url (la pay url no es por donde se llama): inválida.
  const otraU = pagoHttp({ url: 'https://pagos.ejemplo', fetch: (u, init) => fetch(u.replace('https://pagos.ejemplo', base), init), ...firmanteDe(VG) });
  await assert.rejects(otraU.saldos({ nombre: 'vg2' }), codigoDe(401, 'titular_signature_invalid'));
});

// ── pagoCon y la configuración ───────────────────────────────────────────────────────────────────

test('pagoCon: un carril inyectado, todo asíncrono; unconfirmed es pendiente; otro código, ErrorDePago', async () => {
  const sobre = { schema: 'stateark.recibo@1' };
  const p = pagoCon({
    reciboPago: (txid) => (txid === 'a' ? sobre : txid === 'b' ? null : txid === 'c' ? { pendiente: true } : (() => { throw Object.assign(new Error('sin bloque'), { codigo: 'unconfirmed' }); })()),
    reciboPorPuntero: () => { throw Object.assign(new Error('no observada'), { codigo: 'unobserved' }); },
    saldos: () => ({ en_firme: 1 }),
  });
  assert.equal(p.via, 'inyectado');
  assert.equal(await p.reciboPago('a'), sobre);
  assert.equal(await p.reciboPago('b'), null);
  assert.deepEqual(await p.reciboPago('c'), { pendiente: true });
  assert.deepEqual(await p.reciboPago('d'), { pendiente: true });
  await assert.rejects(p.reciboPorPuntero('x'), (e) => e instanceof ErrorDePago && e.codigo === 'unobserved');
  assert.deepEqual(await p.saldos({ nombre: 'x' }), { en_firme: 1 });
  assert.equal(p.cartera, undefined);
  assert.throws(() => pagoCon({ reciboPago() {} }), TypeError);
});

test('deConfiguracion: sin «pay url» null; con ella, el adaptador HTTP de esa url; exportado como pago', async () => {
  const cuenta = await generarClaves();
  const eje = await Eje.genesis({ identidad: 'vg', foco: ['mi eje'], t: '2026-11-16T10:00:00Z', clave: cuenta.publica, privada: cuenta.privada, exigirFirmas: true });
  assert.equal(CONFIGURACION.url, 'pay url');
  assert.equal(destino(eje, 'vg'), null);
  assert.equal(deConfiguracion(eje, 'vg', firmanteDe(VG)), null, 'sin «pay url» no se pide ningún recibo');
  const a = G.ajustesEditablesDe('exterior settings', eje, 'vg', { 'pay url': 'https://pagos.ejemplo/' });
  await salida.escribirDesde(eje, { modo: 'sequenced', autor: 'vg', sobre: a.sobre, en: a.en, payload: a.payload, t: '2026-11-16T10:01:00Z' }, cuenta.privada);
  assert.equal(agram.exterior.exterior(eje, 'vg').pago, 'https://pagos.ejemplo');
  assert.equal(destino(eje, 'vg'), 'https://pagos.ejemplo');
  const p = deConfiguracion(eje, 'vg', firmanteDe(VG));
  assert.equal(p.via, 'http');
  assert.equal(p.url, 'https://pagos.ejemplo');
  assert.equal(agram.pago.deConfiguracion, deConfiguracion);
  assert.equal(agram.pago.pagoHttp, pagoHttp);
});
