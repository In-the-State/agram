// Pruebas de la simulación de StateArk (§6 custodia), copiadas del commit 0ddd6e7 de InTheState/stateark/sim; el repo de AGRAM es este. [Al día con 108f888: ver LEEME de servidor/sim/stateark/.]
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { Custodia, RechazoCustodia, esquemaNoble, esquemaSimulado, verificarVinculo, verificarPruebaVinculo, mensajePruebaVinculo, Simulacion } from '../servidor/sim/stateark/index.js';
import { sha256Texto } from '../servidor/sim/stateark/hash.js';

const codigo = (c) => (e) => e instanceof RechazoCustodia && e.codigo === c;

// El repo de AGRAM en esta máquina: si está, las pruebas BIP-340 corren contra su noble y su propio verificador.
const AGRAM = process.env.AGRAM_SRC ?? fileURLToPath(new URL('../src', import.meta.url));
const hayAgram = existsSync(`${AGRAM}/vendor/noble-secp256k1.js`);
const deAgram = (f) => import(pathToFileURL(`${AGRAM}/${f}`).href);

test('crear claves: una raíz por clave, la privada no sale, dominios cerrados', async () => {
  const k = new Custodia();
  const a = await k.crearClave('agram', 'vg');
  const b = await k.crearClave('cartera', 'vg');
  assert.match(a.publica, /^[0-9a-f]{64}$/);
  assert.notEqual(a.publica, b.publica); // mismo nombre, otro dominio: otra clave
  assert.equal(JSON.stringify(k.listar()).includes('privada'), false);
  assert.deepEqual(Object.keys(a).sort(), ['dominio', 'nombre', 'publica']);
  await assert.rejects(k.crearClave('bitcoin', 'vg'), codigo('domain_unknown'));
  await assert.rejects(k.crearClave('agram', 'vg'), codigo('key_exists'));
  assert.throws(() => k.publica('agram', 'nadie'), codigo('key_unknown'));
  // Ni una sola función pública firma bytes sueltos.
  const metodos = Object.getOwnPropertyNames(Custodia.prototype);
  assert.equal(metodos.some((m) => /^firmar$|^sign$|^firmarBytes$/.test(m)), false);
});

test('firmarAgram recalcula el id y no firma si no cuadra', async () => {
  const k = new Custodia();
  await k.crearClave('agram', 'vg');
  const canonico = '{"autor":"vg","payload":"hola"}';
  const id = await sha256Texto(canonico);
  const f = await k.firmarAgram('vg', { canonico, id });
  assert.equal(f.firmante, k.publica('agram', 'vg'));
  assert.equal(await k.verificarAgram({ id, ...f }), true);
  const otro = await sha256Texto('otra cosa');
  await assert.rejects(k.firmarAgram('vg', { canonico, id: otro }), codigo('id_mismatch'));
  await assert.rejects(k.firmarAgram('vg', { canonico: '', id }), codigo('canonical_missing'));
  await assert.rejects(k.firmarAgram('vg', { canonico, id: 'corto' }), codigo('id_invalid'));
  // La clave de cartera no puede firmar eventos.
  await k.crearClave('cartera', 'w');
  await assert.rejects(k.firmarAgram('w', { canonico, id }), codigo('key_unknown'));
});

test('firmarAutorizacion sirve al §5: la cartera de la custodia es el titular que autoriza', async () => {
  const k = new Custodia();
  const sim = await Simulacion.crear({ verificarFirma: k.verificadorDeFirma() });
  const c = sim.carril;
  const { publica: titular } = await k.crearClave('cartera', 'casa');
  await c.crearCartera('casa', { titular });
  await c.acunar(await c.direccion('casa'), 100_000);
  await sim.minar();
  const ins = { schema: 'stateark.payment-instruction@2', rail: 'bitcoin.onchain', amount: { valor: 10_000, unidad: 'sat' }, destino: { clase: 'bitcoin/address', valor: await c.direccion('casa') }, correlation_id: 'C6' };
  const plan = await c.preparar('casa', ins);
  const aut = await c.autorizar(plan, await k.firmarAutorizacion('casa', plan));
  await c.ejecutar('casa', ins, plan, aut);
  await assert.rejects(k.firmarAutorizacion('casa', { schema: 'otra cosa' }), codigo('not_a_plan'));
  // Una clave de AGRAM no autoriza pagos.
  await k.crearClave('agram', 'casa-id');
  await assert.rejects(k.firmarAutorizacion('casa-id', plan), codigo('key_unknown'));
});

test('vínculo AGRAM ↔ cartera: firmado por las dos, verificable sin la custodia, y no se puede tocar', async () => {
  const k = new Custodia();
  await k.crearClave('agram', 'vg');
  await k.crearClave('cartera', 'vg');
  const v = await k.vincular('vg', 'vg', { instante: '2026-11-12T12:00:00Z' });
  assert.equal(v.agram, k.publica('agram', 'vg'));
  assert.equal(v.cartera, k.publica('cartera', 'vg'));
  assert.deepEqual(await verificarVinculo(v), { ok: true, motivo: 'vinculadas', agram: v.agram, cartera: v.cartera, instante: v.instante });

  await k.crearClave('cartera', 'otra');
  const ajena = k.publica('cartera', 'otra');
  const casos = [
    [{ ...v, cartera: ajena }, /cartera no verifica|AGRAM no verifica/],
    [{ ...v, instante: '2030-01-01T00:00:00Z' }, /no verifica/],
    [{ ...v, firmas: { agram: v.firmas.cartera, cartera: v.firmas.agram } }, /no verifica/],
    [{ ...v, firmas: { agram: v.firmas.agram, cartera: '00'.repeat(32) } }, /cartera no verifica/],
    [{ ...v, firmas: { agram: v.firmas.agram } }, /cartera no verifica/],
    [{ ...v, uso: 'otro' }, /no es un vínculo/],
    [{ ...v, cartera: v.agram }, /dos claves distintas/],
  ];
  for (const [malo, motivo] of casos) {
    const r = await verificarVinculo(malo);
    assert.equal(r.ok, false);
    assert.match(r.motivo, motivo);
  }
});

test('esquema simulado: verifica lo suyo y rechaza lo ajeno', async () => {
  const priv = '11'.repeat(32);
  const pub = await esquemaSimulado.publica(priv);
  const m = await sha256Texto('m');
  const f = await esquemaSimulado.firmar(m, priv);
  assert.equal(await esquemaSimulado.verificar(f, m, pub), true);
  assert.equal(await esquemaSimulado.verificar(f, await sha256Texto('otro'), pub), false);
});

test('BIP-340 real con la noble de AGRAM: AGRAM verifica lo que firma la custodia', { skip: !hayAgram && 'no está el repo de AGRAM' }, async () => {
  const { schnorr } = await deAgram('vendor/noble-secp256k1.js');
  const { crearEvento, canonico, cuerpo, verificarId } = await deAgram('evento.js');
  const { verificar } = await deAgram('autoridad.js');
  const k = new Custodia({ esquema: esquemaNoble(schnorr) });
  const { publica } = await k.crearClave('agram', 'ana');

  const ev = await crearEvento({ autor: publica, sobre: 'g', t: '2026-11-12T10:00:00Z', movimientos: [{ token: 'T', escala: 'minuto', cantidad: 1, de: publica, a: null }], payload: 'hola' });
  const firmado = await k.firmarEvento('ana', ev, (e) => canonico(cuerpo(e)));
  assert.equal(firmado.firma.length, 128); // 64 bytes
  assert.equal(firmado.firmante, publica);
  assert.equal(await verificarId(firmado), true, 'la custodia no toca el evento');
  assert.equal(await verificar(firmado, publica), true, 'el verificador de AGRAM acepta la firma');
  assert.equal(await k.verificarAgram(firmado), true);

  // Un evento manipulado después de calcular su id no se firma.
  await assert.rejects(k.firmarEvento('ana', { ...ev, payload: 'adiós' }, (e) => canonico(cuerpo(e))), codigo('id_mismatch'));

  // Vínculo con BIP-340 real, y no vale con el esquema simulado.
  await k.crearClave('cartera', 'ana');
  const v = await k.vincular('ana', 'ana');
  assert.equal((await verificarVinculo(v, esquemaNoble(schnorr))).ok, true);
  assert.equal((await verificarVinculo(v)).ok, false);
});

test('S33: firmarRecibo sin t o sin dominio, y revocarSesion con una sesión que no es x-only, dan error (como el guardián)', async () => {
  const k = new Custodia();
  await k.crearClave('nostr', 'carril');
  const ev = await sha256Texto('ev-s33');
  const campos = { clase: 'aceptación', sujeto: [ev], ata: [['evento', ev]], universo: 'relé aarpia-sim', nucleo: 'abc123', epoca: 'e0', noAfirma: ['NO afirma nada'] };
  const codigoDe = (c) => (e) => e.codigo === c;
  await assert.rejects(k.firmarRecibo('carril', campos, { t: '2026-11-12T00:00:00Z' }), codigoDe('domain_unknown'));
  await assert.rejects(k.firmarRecibo('carril', campos, { dominio: 'nostr' }), codigoDe('time_invalid'));
  await assert.rejects(k.firmarRecibo('carril', campos, { t: '2026-11-12', dominio: 'nostr' }), codigoDe('time_invalid'));
  await assert.rejects(k.firmarRecibo('carril', campos, { t: '2026-11-12T00:00:00+01:00', dominio: 'nostr' }), codigoDe('time_invalid'));
  await assert.rejects(k.firmarRecibo('nadie', campos, { t: '2026-11-12T00:00:00Z', dominio: 'nostr' }), codigoDe('key_unknown'));
  assert.ok((await k.firmarRecibo('carril', campos, { t: '2026-11-12T00:00:00.5Z', dominio: 'nostr' })).firma);
  for (const mala of ['no-es-clave', '', 'AB'.repeat(32), 'ab'.repeat(31), undefined]) {
    await assert.rejects(k.revocarSesion('carril', mala), codigoDe('session_invalid'), String(mala));
  }
  await assert.rejects(k.revocarSesion('nadie', 'no-es-clave'), codigoDe('key_unknown'));
  assert.ok((await k.revocarSesion('carril', 'ab'.repeat(32))).firma);
});

// S45: la prueba del vínculo nuevo (opción c). La fórmula, copiada literal de `pruebaDe` de sip/ejemplo/generar.mjs y de
// stateark-guardian/tests/paridad/vinculo.mjs, con node:crypto (sin pasar por el código de la sim).
const mensajeDelSip = (identidad, claveHex) => {
  const t = createHash('sha256').update('StateArk/Vinculo/AgramCartera/v1', 'utf8').digest();
  return createHash('sha256').update(t).update(t).update(Buffer.concat([Buffer.from(identidad, 'utf8'), Buffer.from(claveHex, 'hex')])).digest('hex');
};

test('S45: probarVinculo da { clave, prueba } con el mensaje del SIP; otra identidad o clave no verifica', async () => {
  const k = new Custodia();
  const { publica } = await k.crearClave('cartera', 'casa');
  const identidad = await sha256Texto('identidad-de-vg');
  const p = await k.probarVinculo('casa', identidad);
  assert.deepEqual(Object.keys(p), ['clave', 'prueba']);
  assert.equal(p.clave, publica, 'la clave de gasto x-only');
  assert.equal(await mensajePruebaVinculo(identidad, publica), mensajeDelSip(identidad, publica), 'el mensaje es el del SIP');
  assert.equal(await verificarPruebaVinculo(p, identidad), true);
  assert.equal(await verificarPruebaVinculo(p, `${identidad}x`), false, 'otra identidad');
  assert.equal(await verificarPruebaVinculo({ ...p, clave: 'ab'.repeat(32) }, identidad), false, 'otra clave');
  assert.equal(await verificarPruebaVinculo({ ...p, prueba: 'ab'.repeat(64) }, identidad), false, 'prueba falsa');
  // Los códigos del guardián: primero la clave, luego la identidad.
  await assert.rejects(k.probarVinculo('nadie', identidad), codigo('key_unknown'));
  await assert.rejects(k.probarVinculo('casa', ''), codigo('identity_missing'));
  await assert.rejects(k.probarVinculo('casa'), codigo('identity_missing'));
  await assert.rejects(k.probarVinculo('nadie', ''), codigo('key_unknown'));
  // Una clave de AGRAM no es una cartera: la entrada es del dominio `cartera`.
  await k.crearClave('agram', 'vg');
  await assert.rejects(k.probarVinculo('vg', identidad), codigo('key_unknown'));
});

test('S45: con BIP-340 real, la prueba la verifica el schnorr de la noble de AGRAM sobre el mensaje del SIP', { skip: !hayAgram && 'no está AGRAM' }, async () => {
  const { schnorr } = await deAgram('vendor/noble-secp256k1.js');
  const esquema = esquemaNoble(schnorr);
  const k = new Custodia({ esquema });
  await k.crearClave('cartera', 'casa');
  const identidad = await sha256Texto('identidad-de-vg');
  const p = await k.probarVinculo('casa', identidad);
  const mensaje = Uint8Array.from(Buffer.from(mensajeDelSip(identidad, p.clave), 'hex'));
  assert.equal(schnorr.verify(Buffer.from(p.prueba, 'hex'), mensaje, Buffer.from(p.clave, 'hex')), true);
  assert.equal(await verificarPruebaVinculo(p, identidad, esquema), true);
  assert.equal(await verificarPruebaVinculo(p, `${identidad}x`, esquema), false);
  assert.equal(schnorr.verify(Buffer.from(p.prueba, 'hex'), Uint8Array.from(Buffer.from(mensajeDelSip(`${identidad}x`, p.clave), 'hex')), Buffer.from(p.clave, 'hex')), false);
});
