// Copia de test/custodia-remota.test.js de stateark-sim (Core StateArk, commit cb83eda: la sim firma con el guardián real), con las rutas adaptadas a este repo (servidor/sim/stateark/ y src/). Sin el exe del guardián se salta diciéndolo (STATEARK_GUARDIAN_BIN lo señala; STATEARK_PARIDAD=obligatoria lo exige). [Al día con 108f888: ver LEEME de servidor/sim/stateark/.]
// F1 paso 5: la sim firma con el guardián REAL (app/crates/stateark-guardian). Las pruebas lanzan el binario en una
// carpeta temporal y un puerto libre, leen su cookie y lo matan al acabar. Sin el binario o sin AGRAM (su noble
// verifica BIP-340), se saltan diciéndolo; con STATEARK_PARIDAD=obligatoria, fallan.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  Custodia, RechazoCustodia, Simulacion, Sellador, esquemaNoble, verificarSesion, verificarVinculo,
  verificarReciboComun, mensajeAutorizacion, USO_SEGUNDO_FACTOR,
} from '../servidor/sim/stateark/index.js';
import { CustodiaRemota, custodiaDesdeEntorno } from '../servidor/sim/stateark/custodia-remota.js';
import { crearServidor } from '../servidor/sim/stateark/servidor.js';
import { canonico, huella } from '../servidor/sim/stateark/canon.js';
import { sha256Texto } from '../servidor/sim/stateark/hash.js';

const AGRAM = process.env.AGRAM_SRC ?? fileURLToPath(new URL('../src', import.meta.url));
const NOBLE = `${AGRAM}/vendor/noble-secp256k1.js`;
const BIN = process.env.STATEARK_GUARDIAN_BIN
  ?? fileURLToPath(new URL(`../../stateark/app/target/debug/stateark-guardian${process.platform === 'win32' ? '.exe' : ''}`, import.meta.url));
const OBLIGATORIA = process.env.STATEARK_PARIDAD === 'obligatoria';
const falta = [!existsSync(BIN) && `no está el binario del guardián (${BIN}; compílalo en app/)`, !existsSync(NOBLE) && `no está AGRAM (${NOBLE})`].filter(Boolean).join('; ');
const salto = !OBLIGATORIA && falta ? `se salta: ${falta}` : false;
if (salto) console.log(`# custodia-remota: ${salto}`);

const INICIO = '2026-11-12T00:00:00.000Z';
const reloj = () => Date.parse(INICIO);
const codigo = (c) => (e) => e instanceof RechazoCustodia && e.codigo === c;

let proceso = null;
let dir = null;
let url = null;
let cookie = null;
let schnorr = null;
let esquema = null;
let k = null; // la CustodiaRemota contra el guardián

/** Lanza el guardián y espera a que diga «escucha en 127.0.0.1:N» por stderr. */
function lanzar(carpeta) {
  return new Promise((resolver, rechazar) => {
    const p = spawn(BIN, ['--dir', carpeta, '--puerto', '0'], { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    const plazo = setTimeout(() => { p.kill(); rechazar(new Error(`el guardián no dijo su puerto: ${err}`)); }, 15_000);
    p.stderr.on('data', (t) => {
      err += t.toString('utf8');
      const m = err.match(/escucha en 127\.0\.0\.1:(\d+)/);
      if (m) { clearTimeout(plazo); resolver({ p, puerto: Number(m[1]) }); }
    });
    p.on('error', (e) => { clearTimeout(plazo); rechazar(e); });
    p.on('exit', (c) => { clearTimeout(plazo); rechazar(new Error(`el guardián salió (${c}): ${err}`)); });
  });
}

before(async () => {
  if (salto) return;
  if (falta) throw new Error(`STATEARK_PARIDAD=obligatoria y ${falta}`);
  ({ schnorr } = await import(pathToFileURL(NOBLE).href));
  esquema = esquemaNoble(schnorr);
  dir = mkdtempSync(join(tmpdir(), 'stateark-guardian-'));
  const { p, puerto } = await lanzar(dir);
  proceso = p;
  url = `http://127.0.0.1:${puerto}`;
  cookie = readFileSync(join(dir, '.cookie'), 'utf8');
  k = new CustodiaRemota({ url, cookie, schnorr });
});

after(async () => {
  if (proceso && proceso.exitCode === null) {
    const fin = new Promise((r) => proceso.once('exit', r));
    proceso.kill();
    await fin;
  }
  if (dir) rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

const opciones = { skip: salto };

test('arranque: el guardián en una carpeta temporal, su cookie, y claves que solo dan la pública', opciones, async () => {
  assert.match(cookie, /^[0-9a-f]{64}$/);
  const a = await k.crearClave('agram', 'vg');
  assert.deepEqual(Object.keys(a).sort(), ['dominio', 'nombre', 'publica']);
  assert.match(a.publica, /^[0-9a-f]{64}$/);
  assert.equal(await k.publica('agram', 'vg'), a.publica);
  const lista = await k.listar();
  assert.ok(lista.some((c) => c.dominio === 'agram' && c.nombre === 'vg' && c.publica === a.publica));
  assert.equal(JSON.stringify(lista).includes('privada'), false);
  assert.equal(k.simulada, false);
  assert.equal(Object.keys(k.esquema).sort().join(), 'nombre,verificar', 'el esquema de la remota solo verifica');
});

test('sello: un Sellador con observador remoto sella, mina y verifica «sellado» con la clave del guardián', opciones, async () => {
  const obs = await k.crearClave('nostr', 'observador-sello');
  const s = await Sellador.crear({ inicio: INICIO, reloj, observador: { custodia: k, nombre: 'observador-sello' } });
  assert.equal(s.claveObservador, obs.publica);
  const ids = await Promise.all(['uno', 'dos', 'tres'].map(sha256Texto));
  await s.sellar(ids);
  await s.minar([]);
  const p = s.prueba(ids[1]);
  assert.equal(p.prueba.observador.clave, obs.publica);
  const v = await s.verificar({ id: ids[1] }, p);
  assert.equal(v.motivo, 'sellado');
  assert.equal(v.ok, true);
  // Una firma del observador tocada no pasa.
  const mala = structuredClone(p);
  mala.prueba.observador.firma = mala.prueba.observador.firma.replace(/^./, (c) => (c === '0' ? '1' : '0'));
  assert.equal((await s.verificar({ id: ids[1] }, mala)).ok, false);
});

test('pago: autorización y recibo «pago» firmados por el guardián, verificados con BIP-340 en JS', opciones, async () => {
  const sim = await Simulacion.crear({ inicio: INICIO, reloj, custodia: k });
  const obs = await k.publica('nostr', 'observador');
  assert.equal(sim.sellador.claveObservador, obs, 'Simulacion.crear({ custodia }) crea el observador en el guardián');
  const c = sim.carril;
  const { publica: titular } = await k.crearClave('cartera', 'casa');
  await c.crearCartera('casa', { titular });
  await c.crearCartera('aina', { titular: await sha256Texto('clave aina') });
  await c.acunar(await c.direccion('casa'), 200_000);
  await sim.minar();
  const ins = {
    schema: 'stateark.payment-instruction@2', rail: 'bitcoin.onchain',
    amount: { valor: 61_000, unidad: 'sat' }, destino: { clase: 'bitcoin/address', valor: await c.direccion('aina') },
    vencimiento: { marca: 'valido_hasta', valor: 50, fuente: 'consenso', unidad: 'bitcoin_block_height' },
    on_timeout: 'caducado', correlation_id: 'AGRAM-R5',
  };
  const plan = await c.preparar('casa', ins);
  const firma = await k.firmarAutorizacion('casa', plan);
  assert.equal(firma.titular, titular);
  assert.equal(esquema.verificar(firma.firma, await mensajeAutorizacion(await huella(plan)), titular), true, 'el mensaje del guardián es el de la sim');
  const aut = await c.autorizar(plan, firma);
  // Una firma simulada ya no vale: el carril verifica con BIP-340.
  await assert.rejects(c.autorizar(plan, { titular, firma: 'ab'.repeat(64) }), (e) => e.codigo === 'authorization_invalid');
  const r = await c.ejecutar('casa', ins, plan, aut);
  await sim.minar();
  const txid = r.posicion.txid;
  assert.equal((await c.verificarRecibo(c.recibo(txid))).ok, true);
  const campos = await c.reciboPago(txid);
  assert.equal(campos.evidencia[4][0], obs, 'la evidencia lleva la clave del observador del guardián');
  await k.crearClave('nostr', 'carril');
  const sobre = await k.firmarRecibo('carril', campos, { t: INICIO, dominio: 'nostr' });
  const v = await verificarReciboComun(sobre, { esquema });
  assert.equal(v.motivo, 'recibo válido');
  assert.equal(v.emisor, await k.publica('nostr', 'carril'));
  // La misma forma que el de la Custodia simulada.
  const local = new Custodia({ esquema });
  await local.crearClave('nostr', 'carril');
  const sim2 = await local.firmarRecibo('carril', campos, { t: INICIO, dominio: 'nostr' });
  assert.deepEqual(Object.keys(sobre).sort(), Object.keys(sim2).sort());
  assert.deepEqual(sobre.recibo, sim2.recibo);
  // Tocar el recibo después: no verifica.
  const tocado = structuredClone(sobre);
  tocado.recibo[3][tocado.recibo[2].indexOf('cuánto')] = '61001 sat';
  assert.equal((await verificarReciboComun(tocado, { esquema })).ok, false);
});

test('eventos de AGRAM, vínculo, sesiones y segundo factor del guardián, verificados en JS', opciones, async () => {
  await k.crearClave('agram', 'ana');
  const { publica: cartera } = await k.crearClave('cartera', 'ana');
  // Evento
  const cuerpo = canonico({ autor: 'ana', payload: ['hola'] });
  const id = await sha256Texto(cuerpo);
  const ev = await k.firmarEvento('ana', { id, autor: 'ana', payload: ['hola'] }, () => cuerpo);
  assert.equal(ev.firmante, await k.publica('agram', 'ana'));
  assert.equal(await k.verificarAgram(ev), true);
  // Vínculo
  const v = await k.vincular('ana', 'ana', { instante: INICIO });
  assert.deepEqual(await verificarVinculo(v, esquema), { ok: true, motivo: 'vinculadas', agram: ev.firmante, cartera, instante: INICIO });
  assert.equal((await k.verificarVinculo({ ...v, instante: '2026-11-13T00:00:00.000Z' })).ok, false);
  // Sesiones
  await k.crearClave('nostr', 'aarpia');
  const { privada, delegacion } = await k.emitirSesion('aarpia', { alcance: [7703, 7701], segundos: 600, desde: INICIO });
  assert.equal(delegacion.hasta, '2026-11-12T00:10:00.000Z');
  assert.deepEqual(delegacion.alcance, [7701, 7703]);
  assert.equal(esquema.publica(privada), delegacion.sesion, 'la privada de la sesión es la de su pública');
  const ahora = '2026-11-12T00:05:00.000Z';
  assert.equal((await verificarSesion(delegacion, { ahora, kind: 7701, esquema })).ok, true);
  assert.equal((await verificarSesion(delegacion, { ahora, kind: 1, esquema })).ok, false);
  const rev = await k.revocarSesion('aarpia', delegacion.sesion, { instante: ahora });
  assert.deepEqual(k.revocaciones(), [rev]);
  assert.equal((await verificarSesion(delegacion, { ahora, kind: 7701, esquema, revocaciones: [rev] })).motivo, 'revocada');
  // Segundo factor
  const titular = 'cosa:ana';
  const registro = await segundo(titular);
  const sf = await k.segundoFactor('ana', titular, registro);
  assert.deepEqual(Object.keys(sf).sort(), ['firma', 'firmante', 'id']);
  assert.equal(sf.firmante, cartera);
  assert.equal(esquema.verificar(sf.firma, registro.id, cartera), true);
  // Paridad de rechazos: el guardián, llamado directamente (sin la comprobación en JS delante), da los mismos
  // códigos que la Custodia simulada.
  const local = new Custodia();
  await local.crearClave('cartera', 'ana');
  const casos = [
    ['otra', registro],
    [titular, await segundo(titular, { sobre: 'nada' })],
    [titular, await segundo(titular, { payload: [['autorización'], ['pago'], ['otro uso'], [titular]] })],
    [titular, { canonico: '{ "autor": 1 }', id: registro.id }],
    [titular, { canonico: registro.canonico, id: 'ab'.repeat(32) }],
  ];
  for (const [t, reg] of casos) {
    const esperado = await local.segundoFactor('ana', t, reg).then(() => null, (e) => e.codigo);
    const directo = await crudo('/custodia/segundo-factor', { nombre: 'ana', titular: t, ...reg });
    assert.equal(directo.codigo, esperado, JSON.stringify(reg).slice(0, 80));
  }
});

/** Una llamada directa al guardián, sin la CustodiaRemota (para comparar sus rechazos con los de la sim). */
async function crudo(ruta, cuerpo) {
  const { request } = await import('node:http');
  const texto = JSON.stringify(cuerpo);
  return new Promise((ok, mal) => {
    const req = request(url + ruta, { method: 'POST', headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(texto), authorization: `Bearer ${cookie}` } }, (res) => {
      const t = [];
      res.on('data', (x) => t.push(x));
      res.on('end', () => ok(JSON.parse(Buffer.concat(t).toString('utf8'))));
    });
    req.on('error', mal);
    req.end(texto);
  });
}

/** Un registro de autorización en modo segundo factor, como lo ancla AGRAM sobre una propuesta. */
async function segundo(titular, cambio = {}) {
  const cuerpo = { autor: titular, sobre: await sha256Texto('la propuesta'), payload: [['autorización'], ['pago'], [USO_SEGUNDO_FACTOR], [titular]], ...cambio };
  const texto = canonico(cuerpo);
  return { canonico: texto, id: await sha256Texto(texto) };
}

test('segundo factor en la Custodia simulada: misma forma y mismos rechazos que el guardián', async () => {
  const s = new Custodia();
  const { publica } = await s.crearClave('cartera', 'ana');
  const r = await segundo('cosa:ana');
  const f = await s.segundoFactor('ana', 'cosa:ana', r);
  assert.deepEqual(f.id, r.id);
  assert.equal(f.firmante, publica);
  assert.equal(await s.esquema.verificar(f.firma, r.id, publica), true);
  const malos = [
    ['otra', r, 'not_a_second_factor'],
    ['cosa:ana', await segundo('cosa:ana', { autor: 'otra' }), 'not_a_second_factor'],
    ['cosa:ana', await segundo('cosa:ana', { sobre: 'nada' }), 'not_a_second_factor'],
    ['cosa:ana', await segundo('cosa:ana', { payload: [['autorización'], ['pago'], ['otro uso'], ['cosa:ana']] }), 'not_a_second_factor'],
    ['cosa:ana', await segundo('cosa:ana', { payload: [['autorización'], ['pago'], [USO_SEGUNDO_FACTOR], ['otra']] }), 'not_a_second_factor'],
    ['cosa:ana', { canonico: '{ "autor": 1 }', id: r.id }, 'canonical_invalid'],
    ['cosa:ana', { canonico: r.canonico, id: 'ab'.repeat(32) }, 'id_mismatch'],
    ['', r, 'not_a_second_factor'],
  ];
  for (const [titular, reg, c] of malos) await assert.rejects(s.segundoFactor('ana', titular, reg), codigo(c), `${c}`);
  await assert.rejects(s.segundoFactor('nadie', 'cosa:ana', r), codigo('key_unknown'));
});

test('rechazos: un 422 del guardián llega como RechazoCustodia con su código; sin cookie, error claro', opciones, async () => {
  await assert.rejects(k.crearClave('agram', 'vg'), codigo('key_exists'));
  await assert.rejects(k.crearClave('bitcoin', 'x'), codigo('domain_unknown'));
  await assert.rejects(k.publica('nostr', 'nadie'), codigo('key_unknown'));
  const cuerpo = '{"autor":"vg"}';
  await assert.rejects(k.firmarAgram('vg', { canonico: cuerpo, id: await sha256Texto('otra cosa') }), codigo('id_mismatch'));
  await assert.rejects(k.firmarAutorizacion('casa', { schema: 'otra' }), codigo('not_a_plan'));
  // Esto lo rechaza el guardián (no hay comprobación en JS delante): llega su código tal cual. Lo de después, JS.
  await assert.rejects(k.revocarSesion('aarpia', 'no-es-clave'), codigo('session_invalid'));
  const ev = await sha256Texto('ev-s33');
  const acept = { clase: 'aceptación', sujeto: [ev], ata: [['evento', ev]], universo: 'relé aarpia-sim', nucleo: 'abc123', epoca: 'e0', noAfirma: ['NO afirma nada'] };
  await k.crearClave('agram', 'agram-no');
  await assert.rejects(k.firmarRecibo('agram-no', acept, { t: INICIO, dominio: 'agram' }), codigo('wrong_domain'));
  // El binario de app/target/debug puede ser anterior a S30: un campo ausente daba `field_missing`. Se admite solo eso.
  const codigoOViejo = (c) => (e) => e.codigo === c || e.codigo === 'field_missing';
  // S33: sin `t` o sin `dominio` no se supone nada (el guardián los exige); el alcance de una sesión lo juzga él.
  await assert.rejects(k.firmarRecibo('carril', acept, { dominio: 'nostr' }), codigoOViejo('time_invalid'));
  await assert.rejects(k.firmarRecibo('carril', acept, { t: INICIO }), codigoOViejo('domain_unknown'));
  await assert.rejects(k.firmarRecibo('carril', acept, { t: 'ayer', dominio: 'nostr' }), codigo('time_invalid'));
  await assert.rejects(k.emitirSesion('aarpia', { alcance: [1.5] }), codigo('scope_invalid'));
  await assert.rejects(k.emitirSesion('aarpia', { alcance: [] }), codigo('scope_invalid'));
  await assert.rejects(k.emitirSesion('aarpia', { alcance: [1], segundos: 90_000 }), codigo('scope_invalid'));
  // Canales: no están en el guardián (F4).
  for (const m of ['guardarCanal', 'contacto', 'enviar', 'comprobarEntrada']) await assert.rejects(k[m]('x', {}), codigo('not_in_guardian'));
  // Sin cookie o con una que no es: error claro.
  assert.throws(() => new CustodiaRemota({ url, schnorr }), codigo('cookie_missing'));
  assert.throws(() => new CustodiaRemota({ url, cookie: '  ', schnorr }), codigo('cookie_missing'));
  await assert.rejects(new CustodiaRemota({ url, cookie: 'ab'.repeat(32), schnorr }).publica('agram', 'vg'), codigo('unauthorized'));
  await assert.rejects(new CustodiaRemota({ url, cookie: () => { throw new Error('no hay fichero'); }, schnorr }).publica('agram', 'vg'), codigo('cookie_missing'));
  await assert.rejects(new CustodiaRemota({ url: 'http://127.0.0.1:1', cookie, schnorr }).publica('agram', 'vg'), codigo('guardian_unreachable'));
});

test('servidor de la sim: con STATEARK_GUARDIAN_URL y STATEARK_GUARDIAN_DIR firma con el guardián; sin ellas, como siempre', opciones, async () => {
  assert.equal(await custodiaDesdeEntorno({}), null);
  await assert.rejects(custodiaDesdeEntorno({ STATEARK_GUARDIAN_URL: url }), codigo('cookie_missing'));
  const custodia = await custodiaDesdeEntorno({ STATEARK_GUARDIAN_URL: url, STATEARK_GUARDIAN_DIR: dir, AGRAM_SRC: AGRAM });
  assert.ok(custodia instanceof CustodiaRemota);
  const { servidor, sellador } = await crearServidor({ custodia });
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  try {
    const pedir = async (ruta, cuerpo) => (await fetch(base + ruta, cuerpo === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) })).json();
    assert.equal((await pedir('/')).guardian, url);
    const id = await sha256Texto('por el servidor');
    await pedir('/sellar', { ids: [id] });
    await pedir('/minar', {});
    const p = await pedir(`/prueba/${id}`);
    assert.equal(p.prueba.observador.clave, await custodia.publica('nostr', 'observador'));
    assert.equal(sellador.claveObservador, p.prueba.observador.clave);
    assert.equal((await pedir('/verificar', { id, prueba: p })).motivo, 'sellado');
  } finally {
    await new Promise((r) => servidor.close(r));
  }
  // Sin custodia: la de siempre, simulada, y sin «guardian» en GET /.
  const solo = await crearServidor();
  assert.equal(solo.simulacion.custodia, null);
  assert.equal(solo.sellador.observador.custodia.simulada, true);
});

test('S45: probarVinculo llama a /custodia/probar-vinculo con la cookie y devuelve { clave, prueba } (guardián simulado en JS)', opciones, async () => {
  const { createServer } = await import('node:http');
  const { Custodia: Local } = await import('../servidor/sim/stateark/custodia.js');
  const local = new Local({ esquema: esquemaNoble(schnorr) });
  await local.crearClave('cartera', 'casa');
  let visto = null;
  const srv = createServer((req, res) => {
    const trozos = [];
    req.on('data', (t) => trozos.push(t));
    req.on('end', async () => {
      const cuerpo = JSON.parse(Buffer.concat(trozos).toString('utf8'));
      visto = { metodo: req.method, ruta: req.url, auth: req.headers.authorization, cuerpo };
      try {
        const r = await local.probarVinculo(cuerpo.nombre, cuerpo.identidad);
        res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(r));
      } catch (e) {
        res.writeHead(422, { 'content-type': 'application/json' }).end(JSON.stringify({ error: e.message, codigo: e.codigo }));
      }
    });
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  try {
    const remota = new CustodiaRemota({ url: `http://127.0.0.1:${srv.address().port}`, cookie: 'cc'.repeat(32), schnorr });
    const identidad = await sha256Texto('identidad-de-vg');
    const p = await remota.probarVinculo('casa', identidad);
    assert.deepEqual(visto, { metodo: 'POST', ruta: '/custodia/probar-vinculo', auth: `Bearer ${'cc'.repeat(32)}`, cuerpo: { nombre: 'casa', identidad } });
    assert.equal(await remota.verificarPruebaVinculo(p, identidad), true);
    assert.equal(await remota.verificarPruebaVinculo(p, `${identidad}x`), false);
    await assert.rejects(remota.probarVinculo('nadie', identidad), codigo('key_unknown'));
    await assert.rejects(remota.probarVinculo('casa', ''), codigo('identity_missing'));
  } finally {
    srv.close();
  }
});
