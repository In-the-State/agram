// Copia de test/nip98.test.js de stateark-sim (Core StateArk, commit abc5e84: la firma NIP-98 del titular, S54), con las rutas adaptadas a este repo (servidor/sim/stateark/) y una base pública de PRUEBA (https://pagos.ejemplo) en vez de la de StateArk; el vector compartido (test/vectores/nip98.json, copiado sin cambios) se comprueba con su propia url.
// La firma NIP-98 del titular (S54): los mismos casos que app/crates/stateark-servidor/tests/titular.rs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { crearServidor } from '../servidor/sim/stateark/servidor.js';
import {
  KIND, Verificador, FalloFirma, firmarNip98, firmarSchnorr, verificarSchnorr, publicaDe, idDeEvento, hashDeCuerpo,
  cabeceraDeEvento, esNostr,
} from '../servidor/sim/stateark/nip98.js';
import { sha256Texto } from '../servidor/sim/stateark/hash.js';

const PUBLICA = 'https://pagos.ejemplo';
const clave = (semilla) => createHash('sha256').update(`titular de PRUEBA «${semilla}»`).digest('hex');
const VG = clave('vg');
const AINA = clave('aina');
const vector = JSON.parse(readFileSync(new URL('./vectores/nip98.json', import.meta.url), 'utf8'));

// ── BIP-340 y el vector compartido con el backend ────────────────────────────────────────────────

test('BIP-340: los vectores oficiales (0 y 1) firman y verifican; una firma tocada no', async () => {
  const cero = '00'.repeat(32);
  const k3 = '00'.repeat(31) + '03';
  assert.equal(publicaDe(k3), 'f9308a019258c31049344f85f89d5229b531c845836f99b08601f113bce036f9');
  const s0 = await firmarSchnorr(cero, k3);
  assert.equal(s0, 'e907831f80848d1069a5371b402410364bdf1c5f8307b0084c55f1ce2dca821525f66a4a85ea8b71e482a74f382d2ce5ebeee8fdb2172f477df4900d310536c0');
  assert.equal(await verificarSchnorr(s0, cero, publicaDe(k3)), true);
  // Vector 1 de BIP-340 (clave B7E1…, mensaje 243F…, aux 0000…01).
  const k1 = 'b7e151628aed2a6abf7158809cf4f3c762e7160f38b4da56a784d9045190cfef';
  const m1 = '243f6a8885a308d313198a2e03707344a4093822299f31d0082efa98ec4e6c89';
  const pk1 = 'dff1d77f2a671c5f36183726db2341be58feae1da2deced843240f7b502ba659';
  assert.equal(publicaDe(k1), pk1);
  const s1 = await firmarSchnorr(m1, k1, '00'.repeat(31) + '01');
  assert.equal(s1, '6896bd60eeae296db48a229ff71dfe071bde413e6d43f917dc8dcf8c78de33418906d11ac976abccb20b091292bff4ea897efcb639ea871cfa95f6de339e4b0a');
  assert.equal(await verificarSchnorr(s1, m1, pk1), true);
  assert.equal(await verificarSchnorr(s1.replace(/.$/, 'b'), m1, pk1), false);
  assert.equal(await verificarSchnorr(s1, cero, pk1), false);
  assert.equal(await verificarSchnorr('zz', m1, pk1), false);
});

test('el vector compartido: el id NIP-01 coincide con el del backend (nip98.rs) y el evento fijo verifica', async () => {
  // El literal de ID_VECTOR en app/crates/stateark-servidor/src/nip98.rs (el_id_es_el_de_nip01), copiado a mano.
  const ID_VECTOR_RUST = '31097d566304cca4ac7afd38aa08b07c10f5ab38b5d5d416cfe9d16c08236fcb';
  assert.equal(await idDeEvento(vector.id_de_nip98_rs.evento), ID_VECTOR_RUST);
  assert.equal(vector.id_de_nip98_rs.id, ID_VECTOR_RUST);
  // El evento fijo: clave, created_at y cuerpo de prueba; el id y la firma salen igual hoy que cuando se fijó.
  const p = vector.peticion;
  const { evento } = await firmarNip98(p.clave_privada_de_prueba, { url: p.url, metodo: p.metodo, cuerpo: p.cuerpo, content: '', creadoEn: p.ahora });
  assert.deepEqual(evento, vector.evento);
  assert.equal(vector.cabecera, cabeceraDeEvento(vector.evento));
  assert.equal(p.payload, await hashDeCuerpo(p.cuerpo));
  assert.equal(await idDeEvento(vector.evento), vector.evento.id);
  const v = new Verificador();
  assert.equal(await v.verificar(vector.cabecera, p.metodo, '/pagos/cartera', Buffer.from(p.cuerpo), { base: new URL(p.url).origin, ahora: p.ahora }), vector.evento.pubkey);
});

test('el id NIP-01 escapa como el backend: comillas, saltos, controles y UTF-8', async () => {
  const e = { pubkey: '11'.repeat(32), created_at: 1, kind: 1, tags: [], content: 'a"b\\c\n\r\t\b\f\u0001\u001fñ€😀' };
  const esperado = await sha256Texto('[0,"' + '11'.repeat(32) + '",1,1,[],"a\\"b\\\\c\\n\\r\\t\\b\\f\\u0001\\u001fñ€😀"]');
  assert.equal(await idDeEvento(e), esperado);
});

// ── El verificador ───────────────────────────────────────────────────────────────────────────────

const codigo = async (promesa) => {
  try { await promesa; } catch (e) { assert.ok(e instanceof FalloFirma, String(e)); return e.codigo; }
  assert.fail('tenía que fallar');
};

test('el verificador NIP-98: lo bueno, lo repetido, lo manipulado, el reloj y la caducidad', async () => {
  const ahora = 1_763_300_000;
  const ruta = '/pagos/direccion';
  const url = PUBLICA + ruta;
  const cuerpo = '{"nombre":"vg"}';
  const firmar = async (extra = {}) => (await firmarNip98(VG, { url, metodo: 'POST', cuerpo, creadoEn: ahora, ...extra })).evento;
  const cab = (e) => cabeceraDeEvento(e);
  const v = new Verificador();
  const ver = (e, { metodo = 'POST', cuerpo: c = cuerpo, a = ahora, r = ruta } = {}) => v.verificar(cab(e), metodo, r, Buffer.from(c), { base: `${PUBLICA}/`, ahora: a });
  const reFirmar = async (e) => { // un evento con otras etiquetas o campos, bien firmado
    const tmp = { pubkey: e.pubkey, created_at: e.created_at, kind: e.kind, tags: e.tags, content: e.content };
    const id = await idDeEvento(tmp);
    return { id, ...tmp, sig: await firmarSchnorr(id, VG) };
  };
  const buenas = (await firmar()).tags;

  // Bueno: devuelve quién firma. Repetido: replay, también con el esquema en minúsculas.
  const bueno = await firmar();
  assert.equal(await ver(bueno), publicaDe(VG));
  assert.equal(await codigo(ver(bueno, { a: ahora + 1 })), 'replay');
  assert.equal(await codigo(v.verificar(cab(bueno).replace('Nostr', 'nostr'), 'POST', ruta, Buffer.from(cuerpo), { base: PUBLICA, ahora: ahora + 2 })), 'replay');

  // Firma mala (otro byte), contenido cambiado con el id viejo.
  const mala = await firmar({ content: '3' });
  mala.sig = (mala.sig[0] === '0' ? '1' : '0') + mala.sig.slice(1);
  assert.equal(await codigo(ver(mala)), 'titular_signature_invalid');
  const otro = await firmar({ content: '4' });
  otro.content = 'otro';
  assert.equal(await codigo(ver(otro)), 'titular_signature_invalid');
  // Otro kind (bien firmado).
  assert.equal(await codigo(ver(await reFirmar({ ...(await firmar({ content: '5' })), kind: 1 }))), 'titular_signature_invalid');
  // Otra u (otro origen, otra ruta), otro method, otro payload, sin payload con cuerpo, u repetida.
  for (const u of [`https://malo.example${ruta}`, `${PUBLICA}/pagos/saldos`]) {
    assert.equal(await codigo(ver(await firmar({ url: u, content: u }))), 'titular_signature_invalid', u);
  }
  assert.equal(await codigo(ver(await firmar({ metodo: 'GET', content: '6' }))), 'titular_signature_invalid');
  assert.equal(await codigo(ver(await firmar({ content: '7' }), { cuerpo: '{"nombre":"aina"}' })), 'titular_signature_invalid');
  const base = { ...(await firmar({ content: '8' })) };
  assert.equal(await codigo(ver(await reFirmar({ ...base, tags: buenas.filter((t) => t[0] !== 'payload') }))), 'titular_signature_invalid');
  assert.equal(await codigo(ver(await reFirmar({ ...base, content: '9', tags: [buenas[0], ...buenas] }))), 'titular_signature_invalid');
  // created_at viejo y futuro (61 s); a 60 s, vale.
  assert.equal(await codigo(ver(await firmar({ creadoEn: ahora - 61 }))), 'titular_signature_invalid');
  assert.equal(await codigo(ver(await firmar({ creadoEn: ahora + 61 }))), 'titular_signature_invalid');
  await ver(await firmar({ creadoEn: ahora - 60 }));
  // Sin cabecera, o con otro esquema: falta. Base64 o JSON rotos: inválida.
  assert.equal(await codigo(v.verificar(undefined, 'POST', ruta, Buffer.from(cuerpo), { base: PUBLICA, ahora })), 'titular_signature_missing');
  assert.equal(await codigo(v.verificar('Bearer 00', 'POST', ruta, Buffer.from(cuerpo), { base: PUBLICA, ahora })), 'titular_signature_missing');
  assert.equal(await codigo(v.verificar('Nostr ###', 'POST', ruta, Buffer.from(cuerpo), { base: PUBLICA, ahora })), 'titular_signature_invalid');
  assert.equal(await codigo(v.verificar(`Nostr ${Buffer.from('[]').toString('base64')}`, 'POST', ruta, Buffer.from(cuerpo), { base: PUBLICA, ahora })), 'titular_signature_invalid');
  // La caducidad: pasada la ventana se olvida lo visto (y ese evento ya no pasaría el reloj).
  assert.equal(v.recordados, 2);
  assert.ok(await ver(await firmar({ creadoEn: ahora + 200 }), { a: ahora + 200 }));
  assert.equal(v.recordados, 1);
  assert.equal(await codigo(ver(bueno, { a: ahora + 200 })), 'titular_signature_invalid');
  // La firma de otro verifica como firma (devuelve su pubkey); la ruta la rechaza (403).
  const aina = (await firmarNip98(AINA, { url, metodo: 'POST', cuerpo, creadoEn: ahora + 201 })).evento;
  assert.equal(await ver(aina, { a: ahora + 200 }), publicaDe(AINA));
});

test('el ayudante de cliente: sin cuerpo no hay payload; el content distingue peticiones iguales; esNostr', async () => {
  const g = await firmarNip98(VG, { url: `${PUBLICA}/pagos/recibo/ab`, metodo: 'GET', creadoEn: 5 });
  assert.deepEqual(g.evento.tags, [['u', `${PUBLICA}/pagos/recibo/ab`], ['method', 'GET']]);
  const a = await firmarNip98(VG, { url: PUBLICA, metodo: 'POST', cuerpo: '{}', content: '1', creadoEn: 5 });
  const b = await firmarNip98(VG, { url: PUBLICA, metodo: 'POST', cuerpo: '{}', content: '2', creadoEn: 5 });
  assert.notEqual(a.evento.id, b.evento.id);
  assert.equal(g.evento.kind, KIND);
  assert.ok(esNostr(a.cabecera) && esNostr('nostr abc') && !esNostr('Bearer abc') && !esNostr(undefined));
  const v = new Verificador();
  assert.equal(await v.verificar(g.cabecera, 'get', '/pagos/recibo/ab', Buffer.alloc(0), { base: PUBLICA, ahora: 5 }), publicaDe(VG));
});

// ── La tabla de rutas, por HTTP ──────────────────────────────────────────────────────────────────

async function conServidor(opciones, f) {
  const { servidor } = await crearServidor(opciones);
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  const local = `http://127.0.0.1:${servidor.address().port}`;
  try { await f(local, servidor.address().port); } finally { await new Promise((r) => servidor.close(r)); }
}

let serie = 0;
/** POST/GET como la carta: firma `clave` (o nada) con la u dada. Devuelve { estado, cuerpo }. */
async function llamar(local, clavePrivada, metodo, ruta, objeto, { base = PUBLICA, cabecera } = {}) {
  const cuerpo = metodo === 'GET' ? undefined : JSON.stringify(objeto ?? {});
  const headers = { 'content-type': 'application/json' };
  if (cabecera !== undefined) headers.authorization = cabecera;
  else if (clavePrivada) headers.authorization = (await firmarNip98(clavePrivada, { url: base + ruta, metodo, cuerpo, content: String(++serie) })).cabecera;
  const r = await fetch(local + ruta, { method: metodo, headers, body: cuerpo });
  return { estado: r.status, cuerpo: await r.json() };
}

test('cada ruta exige lo suyo: sin firma 401, la de otro 403, la del titular 200', async () => {
  await conServidor({ urlPublica: `${PUBLICA}/` }, async (local) => {
    const vg = publicaDe(VG);
    const aina = publicaDe(AINA);
    const tres = async (ruta, b) => {
      const sin = await llamar(local, null, 'POST', ruta, b);
      assert.deepEqual([sin.estado, sin.cuerpo.codigo], [401, 'titular_signature_missing'], `${ruta} sin firma`);
      const otro = await llamar(local, AINA, 'POST', ruta, b);
      assert.deepEqual([otro.estado, otro.cuerpo.codigo], [403, 'not_titular'], `${ruta} firma de otro`);
      const bien = await llamar(local, VG, 'POST', ruta, b);
      assert.equal(bien.estado, 200, `${ruta} del titular: ${JSON.stringify(bien.cuerpo)}`);
      return bien.cuerpo;
    };
    // cartera: firma quien se nombra titular.
    await tres('/pagos/cartera', { nombre: 'vg', titular: vg });
    assert.equal((await llamar(local, AINA, 'POST', '/pagos/cartera', { nombre: 'aina', titular: aina })).estado, 200);
    // direccion, saldos y preparar: el titular registrado de esa cartera.
    const { direccion } = await tres('/pagos/direccion', { nombre: 'vg' });
    const grifo = await fetch(`${local}/pagos/acunar`, { method: 'POST', body: JSON.stringify({ direccion, sat: 200_000 }) });
    assert.equal(grifo.status, 200, 'acunar no pide firma (solo simulación)');
    await fetch(`${local}/minar`, { method: 'POST' });
    assert.equal((await tres('/pagos/saldos', { nombre: 'vg' })).con_fondos_en_sats, 200_000);
    const destino = (await llamar(local, AINA, 'POST', '/pagos/direccion', { nombre: 'aina' })).cuerpo.direccion;
    const instruccion = {
      schema: 'stateark.payment-instruction@2', rail: 'bitcoin.onchain', amount: { valor: 61_000, unidad: 'sat' },
      destino: { clase: 'bitcoin/address', valor: destino }, correlation_id: 'S54',
    };
    const plan = await tres('/pagos/preparar', { nombre: 'vg', instruccion });
    // Una cartera que no existe: con firma válida, responde el carril (400).
    assert.equal((await llamar(local, VG, 'POST', '/pagos/saldos', { nombre: 'nadie' })).estado, 400);

    // autorizar: sin cabecera vale (la ata la firma de la autorización); si llega, la del titular del cuerpo.
    const firma = await sha256Texto(`stateark-sim/firma:${vg}:x`); // la firma de la autorización no la mira esta prueba
    const b = { plan, titular: vg, firma };
    const sinCab = await llamar(local, null, 'POST', '/pagos/autorizar', b);
    assert.notEqual(sinCab.estado, 401, 'sin cabecera, la firma del titular no se exige en autorizar');
    const otro = await llamar(local, AINA, 'POST', '/pagos/autorizar', b);
    assert.deepEqual([otro.estado, otro.cuerpo.codigo], [403, 'not_titular']);
    const propia = await llamar(local, VG, 'POST', '/pagos/autorizar', b);
    assert.notEqual(propia.estado, 401);
    assert.notEqual(propia.estado, 403);
    // Una cabecera NIP-98 rota en autorizar: 401 aunque la firma no sea obligatoria allí.
    const rota = await llamar(local, null, 'POST', '/pagos/autorizar', b, { cabecera: 'Nostr ###' });
    assert.deepEqual([rota.estado, rota.cuerpo.codigo], [401, 'titular_signature_invalid']);

    // ejecutar: igual, con el titular registrado de la cartera.
    const e = { nombre: 'vg', instruccion, plan, autorizacion: {} };
    const eOtro = await llamar(local, AINA, 'POST', '/pagos/ejecutar', e);
    assert.deepEqual([eOtro.estado, eOtro.cuerpo.codigo], [403, 'not_titular']);
    const eRota = await llamar(local, null, 'POST', '/pagos/ejecutar', e, { cabecera: 'Nostr ###' });
    assert.deepEqual([eRota.estado, eRota.cuerpo.codigo], [401, 'titular_signature_invalid']);
    assert.notEqual((await llamar(local, null, 'POST', '/pagos/ejecutar', e)).estado, 401, 'sin cabecera: lo ata la autorización');

    // Lectura y evidencia pública: sin firma.
    assert.equal((await llamar(local, null, 'GET', '/')).estado, 200);
    assert.equal((await llamar(local, null, 'GET', `/pagos/recibo/${'00'.repeat(32)}`)).estado, 404);
    assert.equal((await llamar(local, null, 'POST', '/pagos/verificar-recibo', { recibo: {} })).estado, 200);

    // Repetir la misma cabecera: replay. Solo la cookie (Bearer) en una ruta que exige firma: falta.
    const cuerpo = JSON.stringify({ nombre: 'vg' });
    const { cabecera } = await firmarNip98(VG, { url: `${PUBLICA}/pagos/saldos`, metodo: 'POST', cuerpo, content: 'repetida' });
    assert.equal((await llamar(local, null, 'POST', '/pagos/saldos', { nombre: 'vg' }, { cabecera })).estado, 200);
    const rep = await llamar(local, null, 'POST', '/pagos/saldos', { nombre: 'vg' }, { cabecera });
    assert.deepEqual([rep.estado, rep.cuerpo.codigo], [401, 'replay']);
    const bearer = await llamar(local, null, 'POST', '/pagos/saldos', { nombre: 'vg' }, { cabecera: 'Bearer 00' });
    assert.deepEqual([bearer.estado, bearer.cuerpo.codigo], [401, 'titular_signature_missing']);
    // El cuerpo cambiado después de firmar: payload no vale.
    const { cabecera: c2 } = await firmarNip98(VG, { url: `${PUBLICA}/pagos/saldos`, metodo: 'POST', cuerpo, content: 'cuerpo' });
    const tocado = await llamar(local, null, 'POST', '/pagos/saldos', { nombre: 'aina' }, { cabecera: c2 });
    assert.deepEqual([tocado.estado, tocado.cuerpo.codigo], [401, 'titular_signature_invalid']);
  });
});

test('la u: STATEARK_SIM_URL_PUBLICA + ruta si existe; si no, http://<Host> + ruta', async () => {
  // Con la URL pública (la «pay url» de la carta): firmar contra el Host local ya no vale.
  await conServidor({ urlPublica: PUBLICA }, async (local) => {
    const b = { nombre: 'x', titular: publicaDe(VG) };
    assert.equal((await llamar(local, VG, 'POST', '/pagos/cartera', b, { base: local })).cuerpo.codigo, 'titular_signature_invalid');
    assert.equal((await llamar(local, VG, 'POST', '/pagos/cartera', b, { base: PUBLICA })).estado, 200);
  });
  // Sin ella, el Host de la petición (aquí 127.0.0.1:<puerto>), con la ruta y su ?…
  const antes = process.env.STATEARK_SIM_URL_PUBLICA;
  delete process.env.STATEARK_SIM_URL_PUBLICA;
  try {
    await conServidor({}, async (local) => {
      const b = { nombre: 'y', titular: publicaDe(VG) };
      assert.equal((await llamar(local, VG, 'POST', '/pagos/cartera', b, { base: PUBLICA })).cuerpo.codigo, 'titular_signature_invalid');
      assert.equal((await llamar(local, VG, 'POST', '/pagos/cartera', b, { base: local })).estado, 200);
      assert.equal((await llamar(local, VG, 'POST', '/pagos/saldos?x=1', { nombre: 'y' }, { base: local })).estado, 200, 'la u lleva el ?… tal como llega, como el backend');
    });
  } finally {
    if (antes !== undefined) process.env.STATEARK_SIM_URL_PUBLICA = antes;
  }
});

test('STATEARK_SIM_FIRMA_TITULAR=no la desactiva; por defecto se exige; CORS deja pasar Authorization', async () => {
  const antes = process.env.STATEARK_SIM_FIRMA_TITULAR;
  process.env.STATEARK_SIM_FIRMA_TITULAR = 'no';
  try {
    await conServidor({}, async (local) => {
      assert.equal((await llamar(local, null, 'POST', '/pagos/cartera', { nombre: 'z', titular: 'a'.repeat(64) })).estado, 200);
    });
  } finally {
    if (antes === undefined) delete process.env.STATEARK_SIM_FIRMA_TITULAR; else process.env.STATEARK_SIM_FIRMA_TITULAR = antes;
  }
  await conServidor({}, async (local) => {
    assert.equal((await llamar(local, null, 'POST', '/pagos/cartera', { nombre: 'z', titular: 'a'.repeat(64) })).estado, 401);
    const pre = await fetch(`${local}/pagos/cartera`, { method: 'OPTIONS' });
    assert.equal(pre.status, 204);
    assert.match(pre.headers.get('access-control-allow-headers'), /authorization/);
    // Un JSON roto con firma buena: 400 (primero se verifica la firma, como el backend).
    const cuerpo = '{';
    const { cabecera } = await firmarNip98(VG, { url: `http://${local.slice(7)}/pagos/cartera`, metodo: 'POST', cuerpo });
    const r = await fetch(`${local}/pagos/cartera`, { method: 'POST', headers: { authorization: cabecera }, body: cuerpo });
    assert.equal(r.status, 400);
  });
});
