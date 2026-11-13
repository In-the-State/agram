// Pruebas del transporte simulado de AARPIA (servidor/sim/aarpia/), copiadas del fe7a2f9 de
// InTheState/aarpia/transporte con las rutas adaptadas: ayuda.js, rele, servicio, archivos, autoridad, recibo, espejo,
// revalidar y sellado en un solo archivo. vendor.test.js (las copias de AGRAM) y la comprobación de sha256 del núcleo ya
// no hacen falta: la simulación importa directamente las de este repo. No se copian las pruebas que necesitan carpetas de
// fuera del repo (stateark/sim: recibo de referencia y cadena de sellado, que aquí se prueba con un sellador de mentira) ni
// vendor/revalidar.mjs (revalidar con un commit de git).
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { canonico, cuerpo, hash, RAIZ } from '../servidor/supabase/funciones/eventos/verificar.js';
import { schnorr } from '../servidor/supabase/funciones/eventos/noble-secp256k1.js';
import { Rele, KIND_EVENTO, KIND_RECIBO, pasaFiltro, relojDeRecibo } from '../servidor/sim/aarpia/src/rele.js';
import { firmar, verificar, generarClaves, valores, serializar, aBytes, aHex } from '../servidor/sim/aarpia/src/nostr.js';
import { envolver, desenvolver, destinatarios } from '../servidor/sim/aarpia/src/sobre.js';
import { crearBlossom, autorizacion, POLITICA } from '../servidor/sim/aarpia/src/blossom.js';
import { crearServicio } from '../servidor/sim/aarpia/src/servicio.js';
import { Autoridad, NUCLEO, KIND_RECHAZO } from '../servidor/sim/aarpia/src/autoridad.js';
import { verificarRecibo, leerRecibo } from '../servidor/sim/aarpia/src/recibo.js';
import { crearEspejo } from '../servidor/sim/aarpia/src/espejo.js';
import { revalidar } from '../servidor/sim/aarpia/src/revalidar.js';
import { Eje } from '../src/eje.js';
import { generarClaves as clavesAgram, firmar as firmarAgram } from '../src/autoridad.js';
import { crearEvento } from '../src/evento.js';
import { arrancar } from '../servidor/sim/aarpia/servidor.mjs';
import { crearArchivos } from '../servidor/supabase/funciones/archivos/api.js';
import { crearApi } from '../servidor/supabase/funciones/eventos/api.js';
import { almacenEnMemoria } from '../servidor/prueba/servidor.mjs';

/** Un evento AGRAM firmado por `autor` con `privada`. */
async function eventoAgram({ autor, privada, sobre = null, en = RAIZ, t = '2026-11-12T12:00:00+01:00', movimientos = [], payload = [], contexto = {} }) {
  const ev = { autor, sobre, en, t, movimientos, payload, contexto };
  ev.id = await hash(canonico(cuerpo(ev)));
  ev.firmante = autor;
  ev.firma = aHex(schnorr.sign(aBytes(ev.id), aBytes(privada)));
  return ev;
}

/** Un eje de prueba: el génesis de `vg` y el alta de `huesped`, con sus claves. */
async function ejeDePrueba() {
  const vg = generarClaves();
  const huesped = generarClaves();
  const genesis = await eventoAgram({ autor: 'vg', privada: vg.privada, contexto: { genesis: true, claves: { vg: vg.publica } } });
  const alta = await eventoAgram({ autor: 'vg', privada: vg.privada, sobre: genesis.id, contexto: { claves: { huesped: huesped.publica } } });
  return { vg, huesped, genesis, alta };
}

/** Un sellador de mentira con la forma de stateark/sim (sellar(ids), prueba(id), verificar(id, prueba)); minar() cierra el lote. */
function selladorDeMentira() {
  const pruebas = new Map();
  let altura = 0;
  return {
    async sellar(ids) { for (const id of ids) pruebas.set(id, { pendiente: true }); },
    minar() {
      altura++;
      for (const [id, p] of pruebas) if (p.pendiente) pruebas.set(id, { hash: id, altura });
      return { altura };
    },
    async prueba(id) { return pruebas.get(id) ?? null; },
    async verificar(id, p) { return p.hash === id ? { ok: true, altura: p.altura } : { ok: false, motivo: 'la prueba no corresponde' }; },
  };
}

/** Un movimiento de T de `de` a `a`. */
const mover = (de, a, cantidad = 1) => ({ token: 'T', escala: 'minuto', cantidad, de, a });

describe('sim aarpia: relé Nostr', () => {
  const reloj = (iso) => {
    let t = Date.parse(iso);
    return () => new Date((t += 1500));
  };

  test('nostr: firmar y verificar; tocar el contenido rompe el id', async () => {
    const k = generarClaves();
    const ev = await firmar({ kind: 1, created_at: 1700000000, tags: [['t', 'x']], content: 'hola' }, k.privada);
    assert.equal(ev.pubkey, k.publica);
    assert.equal(await verificar(ev), true);
    assert.equal(await verificar({ ...ev, content: 'adiós' }), false);
    assert.equal(await verificar({ ...ev, sig: '0'.repeat(128) }), false);
    assert.equal(serializar(ev), JSON.stringify([0, ev.pubkey, 1700000000, 1, [['t', 'x']], 'hola']));
  });

  test('sobre: etiquetas g, s, p (resueltas por el alta, sin el autor), h, u; ida y vuelta', async () => {
    const { vg, huesped, genesis } = await ejeDePrueba();
    const ev = await eventoAgram({ autor: 'vg', privada: vg.privada, sobre: genesis.id, movimientos: [mover('vg', 'huesped'), mover('vg', 'vg'), mover('vg', 'huesped')] });
    assert.deepEqual(destinatarios(ev), ['huesped']);
    const claves = { huesped: huesped.publica };
    const s = await envolver({ evento: ev, eje: 'prueba', privada: vg.privada, claveDe: async (n) => claves[n] });
    assert.equal(s.kind, KIND_EVENTO);
    assert.equal(s.pubkey, vg.publica, 'el sobre lo firma el autor');
    assert.deepEqual(valores(s, 'g'), [ev.id]);
    assert.deepEqual(valores(s, 's'), [genesis.id]);
    assert.deepEqual(valores(s, 'p'), [huesped.publica]);
    assert.deepEqual(valores(s, 'h'), ['prueba']);
    assert.deepEqual(valores(s, 'u'), ['vg']);
    assert.deepEqual(desenvolver(s), ev, 'el evento AGRAM viaja sin tocar');
    assert.throws(() => desenvolver({ ...s, tags: [['g', 'f'.repeat(64)]] }));
  });

  test('relé: acepta, rechaza lo mal firmado o de otro kind, y es idempotente', async () => {
    const rele = new Rele();
    const k = generarClaves();
    const ev = await firmar({ kind: KIND_EVENTO, created_at: 1, tags: [['g', 'a'.repeat(64)]], content: '{}' }, k.privada);
    assert.equal((await rele.publicar(ev)).ok, true);
    const otra = await rele.publicar(ev);
    assert.equal(otra.ok, true);
    assert.equal(otra.duplicado, true);
    assert.equal((await rele.publicar({ ...ev, id: 'b'.repeat(64) })).ok, false);
    const nota = await firmar({ kind: 1, created_at: 1, tags: [], content: '' }, k.privada);
    assert.match((await rele.publicar(nota)).motivo, /^blocked/);
    const recibo = await firmar({ kind: KIND_RECIBO, created_at: 1, tags: [['e', ev.id]], content: '' }, k.privada);
    assert.match((await rele.publicar(recibo)).motivo, /solo los emite el relé/, 'nadie de fuera publica un recibo');
    const rechazo = await firmar({ kind: 7703, created_at: 1, tags: [['g', 'a'.repeat(64)]], content: '{}' }, k.privada);
    assert.match((await rele.publicar(rechazo)).motivo, /solo los firma la autoridad/, 'ni un rechazo');
  });

  test('relé: el recibo 7701 lo firma el relé, lleva e/g/h y el instante de llegada (X.6.8.1)', async () => {
    const rele = new Rele({ ahora: () => new Date('2026-11-12T11:00:05.250Z') });
    const { vg, genesis } = await ejeDePrueba();
    const s = await envolver({ evento: genesis, eje: 'prueba', privada: vg.privada, ahora: new Date('2026-11-12T10:59:00Z') });
    const { recibo } = await rele.publicar(s);
    assert.equal(recibo.kind, KIND_RECIBO);
    assert.equal(recibo.pubkey, rele.publica);
    assert.equal(await verificar(recibo), true);
    assert.deepEqual(valores(recibo, 'e'), [s.id]);
    assert.deepEqual(valores(recibo, 'g'), [genesis.id]);
    assert.deepEqual(valores(recibo, 'h'), ['prueba']);
    assert.equal(recibo.created_at, Date.parse('2026-11-12T11:00:05Z') / 1000);
    assert.deepEqual(relojDeRecibo(recibo), { instante: '2026-11-12T11:00:05.250Z', rele: rele.publica, firma: recibo.sig, recibo: recibo.id });
    assert.equal(rele.reciboDe(s.id).id, recibo.id);
    // Un 'ms' que no cuadra con created_at no se cree: vale el segundo firmado.
    const falso = { ...recibo, tags: [['ms', '2030-01-01T00:00:00.000Z']] };
    assert.equal(relojDeRecibo(falso).instante, '2026-11-12T11:00:05.000Z');
  });

  test('relé: filtros #s (todo lo que cuelga de X), #p (mi diario por tokens), #h, #u, authors, kinds, since/until, limit', async () => {
    const rele = new Rele({ ahora: reloj('2026-11-12T11:00:00Z') });
    const { vg, huesped, genesis, alta } = await ejeDePrueba();
    const claves = { vg: vg.publica, huesped: huesped.publica };
    const claveDe = async (n) => claves[n];
    const pago = await eventoAgram({ autor: 'vg', privada: vg.privada, sobre: alta.id, movimientos: [mover('vg', 'huesped', 3)] });
    const respuesta = await eventoAgram({ autor: 'huesped', privada: huesped.privada, sobre: pago.id, movimientos: [mover('huesped', 'vg')] });
    const sobres = [];
    let t = 1000;
    for (const [ev, priv] of [[genesis, vg.privada], [alta, vg.privada], [pago, vg.privada], [respuesta, huesped.privada]]) {
      const s = await envolver({ evento: ev, eje: 'prueba', privada: priv, claveDe, ahora: new Date((t += 10) * 1000) });
      sobres.push(s);
      assert.equal((await rele.publicar(s)).ok, true);
    }
    const ag = (lista) => lista.map((s) => desenvolver(s).id);
    assert.deepEqual(ag(rele.consultar({ kinds: [KIND_EVENTO], '#s': [genesis.id] })), [alta.id]);
    assert.deepEqual(ag(rele.consultar({ kinds: [KIND_EVENTO], '#p': [huesped.publica] })), [pago.id]);
    assert.deepEqual(ag(rele.consultar({ kinds: [KIND_EVENTO], '#p': [vg.publica] })), [respuesta.id]);
    assert.equal(rele.consultar({ kinds: [KIND_EVENTO], '#h': ['prueba'] }).length, 4);
    assert.equal(rele.consultar({ kinds: [KIND_EVENTO], '#h': ['otro'] }).length, 0);
    assert.deepEqual(ag(rele.consultar({ kinds: [KIND_EVENTO], '#u': ['huesped'] })), [respuesta.id]);
    assert.deepEqual(ag(rele.consultar({ kinds: [KIND_EVENTO], authors: [huesped.publica] })), [respuesta.id]);
    assert.equal(rele.consultar({ kinds: [KIND_RECIBO] }).length, 4);
    assert.deepEqual(ag(rele.consultar({ kinds: [KIND_EVENTO], since: 1030 })), [respuesta.id, pago.id], 'más reciente primero');
    assert.deepEqual(ag(rele.consultar({ kinds: [KIND_EVENTO], until: 1010 })), [genesis.id]);
    assert.deepEqual(ag(rele.consultar({ kinds: [KIND_EVENTO], limit: 1 })), [respuesta.id]);
    assert.equal(pasaFiltro(sobres[0], { '#g': [genesis.id], kinds: [KIND_EVENTO] }), true);
  });

  test('relé: una suscripción a mi #p recibe lo guardado, el EOSE y lo nuevo, y deja de recibir al cerrar', async () => {
    const rele = new Rele();
    const { vg, huesped, genesis } = await ejeDePrueba();
    const claveDe = async (n) => ({ huesped: huesped.publica })[n];
    const llegan = [];
    let eose = 0;
    const env = async (cantidad) => {
      const ev = await eventoAgram({ autor: 'vg', privada: vg.privada, sobre: genesis.id, movimientos: [mover('vg', 'huesped', cantidad)] });
      await rele.publicar(await envolver({ evento: ev, eje: 'prueba', privada: vg.privada, claveDe }));
      return ev.id;
    };
    const antes = await env(1);
    const cerrar = rele.suscribir([{ kinds: [KIND_EVENTO], '#p': [huesped.publica] }], (s) => llegan.push(desenvolver(s).id), () => eose++);
    assert.deepEqual(llegan, [antes]);
    assert.equal(eose, 1);
    const despues = await env(2);
    assert.deepEqual(llegan, [antes, despues]);
    cerrar();
    await env(3);
    assert.equal(llegan.length, 2);
  });
});

describe('sim aarpia: servicio HTTP', () => {
  const BASE = 'http://prueba.local/functions/v1/eventos';
  const json = (r) => r.json();

  /** Recorre el contrato con `manejar` y devuelve lo que contesta cada paso (sin los instantes). */
  async function recorrido(manejar, ev) {
    const pasos = [];
    const pedir = async (nombre, url, init = {}) => {
      const r = await manejar(new Request(url, init));
      const cuerpo = await r.json();
      pasos.push({ nombre, estado: r.status, cuerpo });
      return cuerpo;
    };
    const { claveLectura } = await pedir('crear eje', BASE + '/ejes', { method: 'POST', headers: { 'X-Crear-Ejes': 'prueba', 'Content-Type': 'application/json' }, body: JSON.stringify({ eje: 'vg' }) });
    const h = { 'X-Clave-Lectura': claveLectura, 'Content-Type': 'application/json' };
    const subir = (nombre, evento, cab = h) => pedir(nombre, BASE, { method: 'POST', headers: cab, body: JSON.stringify({ eje: 'vg', evento }) });
    await pedir('eje repetido', BASE + '/ejes', { method: 'POST', headers: { 'X-Crear-Ejes': 'prueba' }, body: JSON.stringify({ eje: 'vg' }) });
    await subir('no génesis en eje vacío', ev.alta);
    await subir('génesis', ev.genesis);
    await subir('génesis repetido', ev.genesis);
    await subir('sin clave', ev.alta, { 'Content-Type': 'application/json' });
    await subir('alta', ev.alta);
    await subir('firma tocada', { ...ev.pago, firma: 'f'.repeat(128) });
    await subir('autor sin alta', ev.extrano);
    await subir('pago', ev.pago);
    await pedir('bajar', BASE + '?eje=vg&desde=0', { headers: h });
    await pedir('bajar desde 2', BASE + '?eje=vg&desde=2&cuantos=1', { headers: h });
    await pedir('eje desconocido', BASE + '?eje=nadie', { headers: h });
    await pedir('clave mala', BASE + '?eje=vg', { headers: { 'X-Clave-Lectura': 'x' } });
    return { pasos, claveLectura };
  }

  async function eventos() {
    const base = await ejeDePrueba();
    const pago = await eventoAgram({ autor: 'vg', privada: base.vg.privada, sobre: base.alta.id, movimientos: [mover('vg', 'huesped', 2)] });
    const extrano = await eventoAgram({ autor: 'nadie', privada: base.huesped.privada, sobre: base.genesis.id });
    return { ...base, pago, extrano };
  }

  /** Quita los instantes y la clave de lectura (cambian en cada corrida). */
  const sinVariables = (pasos) => JSON.parse(JSON.stringify(pasos, (k, v) => (['recibido', 'creado', 'claveLectura'].includes(k) ? '·' : v)));

  test('servicio: el recorrido del contrato de `eventos`', async () => {
    const ev = await eventos();
    const s = crearServicio();
    const { pasos, claveLectura } = await recorrido(s.manejar, ev);
    const estados = Object.fromEntries(pasos.map((p) => [p.nombre, p.estado]));
    assert.deepEqual(estados, {
      'crear eje': 201, 'eje repetido': 409, 'no génesis en eje vacío': 400, 'génesis': 201, 'génesis repetido': 200, 'sin clave': 401,
      'alta': 201, 'firma tocada': 400, 'autor sin alta': 403, 'pago': 201, 'bajar': 200, 'bajar desde 2': 200, 'eje desconocido': 401, 'clave mala': 401,
    });
    const bajar = pasos.find((p) => p.nombre === 'bajar').cuerpo;
    assert.deepEqual(bajar.eventos.map((e) => [e.orden, e.evento.id]), [[1, ev.genesis.id], [2, ev.alta.id], [3, ev.pago.id]]);
    assert.deepEqual(bajar.eventos[2].evento, ev.pago, 'el evento vuelve tal cual');
    assert.equal(pasos.find((p) => p.nombre === 'bajar desde 2').cuerpo.siguiente, null);

    // Lo que ha pasado por debajo: tres 7700 firmados con la clave de transporte, con su p resuelto por el alta.
    const sobres = s.rele.consultar({ kinds: [KIND_EVENTO], '#h': ['vg'] });
    assert.equal(sobres.length, 3);
    const delPago = s.rele.consultar({ kinds: [KIND_EVENTO], '#g': [ev.pago.id] })[0];
    assert.deepEqual(valores(delPago, 'p'), [ev.huesped.publica]);

    // El reloj X.6.8.1: el `recibido` de bajar es el instante del recibo firmado por el relé.
    const r = await s.manejar(new Request(BASE + '/recibo?eje=vg&id=' + ev.pago.id, { headers: { 'X-Clave-Lectura': claveLectura } }));
    assert.equal(r.status, 200);
    const reloj = await r.json();
    assert.equal(reloj.rele, s.rele.publica);
    assert.equal(reloj.instante, bajar.eventos[2].recibido);
    assert.equal((await s.manejar(new Request(BASE + '/recibo?eje=vg&id=' + ev.pago.id, { headers: { 'X-Clave-Lectura': 'x' } }))).status, 401);
    const sin = await s.manejar(new Request(BASE + '/recibo?eje=vg&id=' + 'e'.repeat(64), { headers: { 'X-Clave-Lectura': claveLectura } }));
    assert.equal(sin.status, 404);
    assert.deepEqual(await sin.json(), { error: 'sin recibo para ese id en ese eje', codigo: 'sin-recibo' });
    // Eje que no existe = clave mala (#106): el mismo 401 con el mismo cuerpo, sin revelar qué ejes hay.
    const nadie = await s.manejar(new Request(BASE + '/recibo?eje=nadie&id=' + ev.pago.id, { headers: { 'X-Clave-Lectura': claveLectura } }));
    const mala = await s.manejar(new Request(BASE + '/recibo?eje=vg&id=' + ev.pago.id, { headers: { 'X-Clave-Lectura': 'x' } }));
    assert.equal(nadie.status, 401);
    assert.deepEqual(await nadie.json(), { error: 'clave de lectura ausente o incorrecta', codigo: 'clave' });
    assert.equal(mala.status, 401);
    assert.deepEqual(await mala.json(), { error: 'clave de lectura ausente o incorrecta', codigo: 'clave' });
    const sinClave = await s.manejar(new Request(BASE + '/recibo?eje=nadie&id=' + ev.pago.id));
    assert.equal(sinClave.status, 401, 'también sin clave');
  });

  test('servicio: /recibo y /sello con eje inexistente dan el mismo 401, con el mismo cuerpo, que con la clave mala', async () => {
    const ev = await eventos();
    const s = crearServicio({ sellador: selladorDeMentira() });
    const { claveLectura } = await recorrido(s.manejar, ev);
    for (const ruta of ['/recibo', '/sello']) {
      const peticiones = [
        ['clave mala', '?eje=vg&id=' + ev.pago.id, 'x'],
        ['eje inexistente', '?eje=nadie&id=' + ev.pago.id, claveLectura],
        ['eje inexistente, clave mala', '?eje=nadie&id=' + ev.pago.id, 'x'],
        ['eje inexistente, sin clave', '?eje=nadie&id=' + ev.pago.id, null],
      ];
      const respuestas = [];
      for (const [, q, clave] of peticiones) {
        const r = await s.manejar(new Request(BASE + ruta + q, { headers: clave ? { 'X-Clave-Lectura': clave } : {} }));
        respuestas.push([r.status, await r.text()]);
      }
      for (const [i, r] of respuestas.entries()) assert.deepEqual(r, respuestas[0], ruta + ': ' + peticiones[i][0] + ' = clave mala');
      assert.equal(respuestas[0][0], 401);
      assert.deepEqual(JSON.parse(respuestas[0][1]), { error: 'clave de lectura ausente o incorrecta', codigo: 'clave' });
    }
  });

  test('paridad con el servidor de prueba de AGRAM ', async () => {
    const ev = await eventos();
    const deAgram = crearApi({ almacen: almacenEnMemoria(), crearEjes: { secreto: 'prueba' } });
    const nuestro = crearServicio();
    const a = sinVariables((await recorrido(deAgram, ev)).pasos);
    const b = sinVariables((await recorrido(nuestro.manejar, ev)).pasos);
    assert.deepEqual(b, a);
  });

  test('servidor HTTP: arranca, crea un eje y sube el génesis por red', async () => {
    const ev = await ejeDePrueba();
    const s = await arrancar();
    try {
      const c = await fetch(s.url + '/eventos/ejes', { method: 'POST', headers: { 'X-Crear-Ejes': 'prueba' }, body: JSON.stringify({ eje: 'red' }) }).then(json);
      const r = await fetch(s.url + '/eventos', { method: 'POST', headers: { 'X-Clave-Lectura': c.claveLectura, 'Content-Type': 'application/json' }, body: JSON.stringify({ eje: 'red', evento: ev.genesis }) });
      assert.equal(r.status, 201);
      const b = await fetch(s.url + '/eventos?eje=red&desde=0', { headers: { 'X-Clave-Lectura': c.claveLectura } }).then(json);
      assert.equal(b.eventos[0].evento.id, ev.genesis.id);
    } finally {
      await s.cerrar();
    }
  });
});

describe('sim aarpia: Blossom y archivos', () => {
  const sha = async (b) => aHex(new Uint8Array(await crypto.subtle.digest('SHA-256', b)));
  const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
  const HTML = new TextEncoder().encode('<p>hola <script>alert(1)</script></p>');

  test('blossom: subir con 24242, bajar por sha con cabeceras que no dejan ejecutar, HEAD y DELETE', async () => {
    const b = crearBlossom();
    const k = generarClaves();
    const x = await sha(HTML);
    const put = (cuerpo, auth) => b(new Request('http://b/upload', { method: 'PUT', headers: { 'Content-Type': 'text/html', ...(auth ? { Authorization: auth } : {}) }, body: cuerpo }));
    assert.equal((await put(HTML)).status, 401, 'sin autorización');
    assert.equal((await put(HTML, await autorizacion({ accion: 'upload', sha: 'a'.repeat(64), privada: k.privada }))).status, 401, 'autorización de otro blob');
    assert.equal((await put(HTML, await autorizacion({ accion: 'upload', sha: x, privada: k.privada, ahora: new Date(Date.now() - 3600e3) }))).status, 401, 'caducada');
    const r = await put(HTML, await autorizacion({ accion: 'upload', sha: x, privada: k.privada }));
    assert.equal(r.status, 201);
    assert.equal((await r.json()).sha256, x);
    assert.equal((await put(HTML, await autorizacion({ accion: 'upload', sha: x, privada: k.privada }))).status, 200, 'idempotente');
    const g = await b(new Request('http://b/' + x + '.html'));
    assert.equal(g.status, 200);
    assert.deepEqual(new Uint8Array(await g.arrayBuffer()), HTML);
    assert.equal(g.headers.get('content-security-policy'), POLITICA);
    assert.equal(g.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(g.headers.get('content-disposition'), 'attachment', 'el HTML no se pinta suelto');
    assert.equal((await b(new Request('http://b/' + x, { method: 'HEAD' }))).status, 200);
    const otro = generarClaves();
    assert.equal((await b(new Request('http://b/' + x, { method: 'DELETE', headers: { Authorization: await autorizacion({ accion: 'upload', sha: x, privada: k.privada }) } }))).status, 401, 'upload no vale para delete');
    assert.equal((await b(new Request('http://b/' + x, { method: 'DELETE', headers: { Authorization: await autorizacion({ accion: 'delete', sha: x, privada: otro.privada }) } }))).status, 200);
    assert.equal((await b(new Request('http://b/' + x))).status, 200, 'quien no lo subió no lo borra del todo');
    await b(new Request('http://b/' + x, { method: 'DELETE', headers: { Authorization: await autorizacion({ accion: 'delete', sha: x, privada: k.privada }) } }));
    assert.equal((await b(new Request('http://b/' + x))).status, 404);
  });

  /** Crea un eje en el servicio y devuelve su clave de lectura. */
  async function eje(s, nombre = 'vg') {
    const r = await s.manejar(new Request('http://p/functions/v1/eventos/ejes', { method: 'POST', headers: { 'X-Crear-Ejes': 'prueba' }, body: JSON.stringify({ eje: nombre }) }));
    return (await r.json()).claveLectura;
  }

  /** El recorrido del contrato de `archivos`: lo que contesta cada paso, sin los cuerpos binarios. */
  async function recorrido(manejar, clave) {
    const pasos = [];
    const pedir = async (nombre, url, init = {}) => {
      const r = await manejar(new Request('http://p/functions/v1' + url, init));
      const tipo = r.headers.get('content-type') ?? '';
      const cuerpo = tipo.startsWith('application/json') && !url.includes('/archivos/') ? await r.json() : (await r.arrayBuffer()).byteLength;
      pasos.push({ nombre, estado: r.status, tipo, cuerpo });
    };
    const h = (tipo) => ({ 'X-Clave-Lectura': clave, 'Content-Type': tipo });
    await pedir('subir png', '/archivos?eje=vg', { method: 'POST', headers: h('image/png'), body: PNG });
    await pedir('subir png otra vez', '/archivos?eje=vg', { method: 'POST', headers: h('image/png'), body: PNG });
    await pedir('subir html', '/archivos?eje=vg', { method: 'POST', headers: h('text/html'), body: HTML });
    await pedir('png que no es png', '/archivos?eje=vg', { method: 'POST', headers: h('image/png'), body: HTML });
    await pedir('tipo no admitido', '/archivos?eje=vg', { method: 'POST', headers: h('application/pdf'), body: HTML });
    await pedir('sin clave', '/archivos?eje=vg', { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: PNG });
    await pedir('eje desconocido', '/archivos?eje=nadie', { method: 'POST', headers: h('image/png'), body: PNG });
    await pedir('bajar png', '/archivos/' + (await sha(PNG)) + '?eje=vg', { headers: h('') });
    await pedir('bajar html', '/archivos/' + (await sha(HTML)) + '?eje=vg', { headers: h('') });
    await pedir('bajar desconocido', '/archivos/' + 'e'.repeat(64) + '?eje=vg', { headers: h('') });
    return pasos;
  }

  test('archivos: la API de AGRAM sobre Blossom, cifrando antes de subir', async () => {
    const s = crearServicio();
    const clave = await eje(s);
    const pasos = await recorrido(s.manejar, clave);
    assert.deepEqual(Object.fromEntries(pasos.map((p) => [p.nombre, p.estado])), {
      'subir png': 201, 'subir png otra vez': 200, 'subir html': 201, 'png que no es png': 400, 'tipo no admitido': 415,
      'sin clave': 401, 'eje desconocido': 401, 'bajar png': 200, 'bajar html': 200, 'bajar desconocido': 404,
    });
    // Lo que vuelve es el original, con su tipo y la política de AGRAM.
    const r = await s.manejar(new Request('http://p/archivos/' + (await sha(HTML)) + '?eje=vg', { headers: { 'X-Clave-Lectura': clave } }));
    assert.deepEqual(new Uint8Array(await r.arrayBuffer()), HTML);
    assert.match(r.headers.get('content-type'), /^text\/html/);
    assert.match(r.headers.get('content-security-policy'), /^sandbox/);
    // Lo que guarda Blossom es otra cosa: el cifrado, con otro sha, sin el original dentro.
    const blob = s.archivos.blobDe('vg', await sha(HTML));
    assert.notEqual(blob, await sha(HTML));
    assert.equal((await s.manejar(new Request('http://p/blossom/' + (await sha(HTML))))).status, 404, 'el original no está en Blossom');
    const publico = new Uint8Array(await (await s.manejar(new Request('http://p/blossom/' + blob))).arrayBuffer());
    assert.equal(await sha(publico), blob);
    assert.equal(new TextDecoder('utf-8', { fatal: false }).decode(publico).includes('hola'), false, 'el texto no se ve en el blob');
    // Otro eje no lee los archivos de este.
    const otra = await eje(s, 'otro');
    assert.equal((await s.manejar(new Request('http://p/archivos/' + (await sha(HTML)) + '?eje=otro', { headers: { 'X-Clave-Lectura': otra } }))).status, 404);
  });

  test('archivos: paridad con el servidor de prueba de AGRAM ', async () => {
    const almacen = almacenEnMemoria();
    const eventos = crearApi({ almacen, crearEjes: { secreto: 'prueba' } });
    const archivos = crearArchivos({ almacen });
    const deAgram = (req) => (new URL(req.url).pathname.includes('/archivos') ? archivos(req) : eventos(req));
    const claveA = await eje({ manejar: deAgram });
    const nuestro = crearServicio();
    const claveB = await eje(nuestro);
    assert.deepEqual(await recorrido(nuestro.manejar, claveB), await recorrido(deAgram, claveA));
  });
});

describe('sim aarpia: autoridad del libro', () => {
  const T = '2026-11-12T12:00:00+01:00';
  const gastaT = (de, cantidad = 1) => ({ token: 'T', escala: 'minuto', cantidad, de, a: null });
  const BASE = 'http://p/functions/v1/eventos';
  /** Un eje de la carta con su génesis firmado, y una forma de escribir eventos candidatos sin añadirlos. */
  async function carta() {
    const c = await clavesAgram();
    const eje = await Eje.genesis({ identidad: 'vg', foco: ['mi eje'], t: T, clave: c.publica, privada: c.privada, exigirFirmas: true });
    const candidato = async (datos) => firmarAgram(await crearEvento({ autor: 'vg', sobre: eje.genesisId, t: T, ...datos }), c.privada);
    return { c, eje, genesis: eje.obtener(eje.genesisId), candidato };
  }
  
  async function servicioConEje(genesis) {
    const s = crearServicio({ autoridad: new Autoridad() });
    const r = await s.manejar(new Request(BASE + '/ejes', { method: 'POST', headers: { 'X-Crear-Ejes': 'prueba' }, body: JSON.stringify({ eje: 'vg' }) }));
    const { claveLectura } = await r.json();
    const subir = async (evento) => {
      const x = await s.manejar(new Request(BASE, { method: 'POST', headers: { 'X-Clave-Lectura': claveLectura, 'Content-Type': 'application/json' }, body: JSON.stringify({ eje: 'vg', evento }) }));
      return { estado: x.status, cuerpo: await x.json() };
    };
    assert.equal((await subir(genesis)).estado, 201);
    return { s, subir, claveLectura };
  }
  
  test('autoridad: acepta con 7701 (nucleo, epoca) y rechaza con 422 + 7703 firmado con la causa dentro', async () => {
    const { c, genesis, candidato } = await carta();
    const { s, subir, claveLectura } = await servicioConEje(genesis);
    const llegan = [];
    s.rele.suscribir([{ kinds: [KIND_RECHAZO], '#p': [c.publica] }], (ev) => llegan.push(ev));
  
    const bien = await candidato({ movimientos: [gastaT('vg')], payload: ['hola'] });
    assert.equal((await subir(bien)).estado, 201);
    const sobre = s.rele.consultar({ kinds: [KIND_EVENTO], '#g': [bien.id] })[0];
    const recibo = s.rele.reciboDe(sobre.id);
    assert.equal(recibo.kind, KIND_RECIBO);
    assert.deepEqual(valores(recibo, 'nucleo'), [NUCLEO.commit]);
    assert.deepEqual(valores(recibo, 'epoca'), [genesis.contexto.epoca], 'la época que referencia el libro');
  
    const mal = await candidato({ movimientos: [gastaT('vg'), { token: 'E', emisor: 'vg', denominacion: 'EUR', cantidad: 5, de: 'vg', a: 'otro' }], payload: ['pago'] });
    const r = await subir(mal);
    assert.equal(r.estado, 422);
    assert.deepEqual(r.cuerpo.reason, ['saldo insuficiente de E:vg/EUR en vg']);
    assert.equal(r.cuerpo.id, mal.id);
    assert.equal(r.cuerpo.nucleo, NUCLEO.commit);
    assert.equal(r.cuerpo.epoca, genesis.contexto.epoca);
    assert.match(r.cuerpo.error, /^evento rechazado: saldo insuficiente/);
  
    const [rechazo] = s.rele.consultar({ kinds: [KIND_RECHAZO], '#g': [mal.id] });
    assert.equal(rechazo.id, r.cuerpo.rechazo);
    assert.equal(rechazo.pubkey, s.autoridad.publica, 'lo firma la autoridad');
    assert.equal(await verificar(rechazo), true);
    assert.deepEqual(valores(rechazo, 'h'), ['vg']);
    assert.deepEqual(valores(rechazo, 'p'), [c.publica], 'el autor lo recibe por su #p');
    const dentro = JSON.parse(rechazo.content);
    assert.equal(dentro.schema, 'stateark.recibo@1', 'el content es el recibo único');
    assert.equal(leerRecibo(dentro).clase, 'rechazo');
    assert.deepEqual(leerRecibo(dentro).causa, r.cuerpo.reason, 'la causa va dentro, como lista, nunca vacía');
    assert.equal(dentro.evento.id, mal.id, 'el evento rechazado queda como contenido');
    assert.deepEqual(llegan.map((e) => e.id), [rechazo.id]);
  
    // Reenviar lo rechazado: otra vez 422, el mismo 7703, sin duplicar.
    assert.equal((await subir(mal)).cuerpo.rechazo, rechazo.id);
    assert.equal(s.rele.consultar({ kinds: [KIND_RECHAZO] }).length, 1);
    // Lo rechazado no entra en el libro: bajar da el génesis y el bueno.
    const b = await s.manejar(new Request(BASE + '?eje=vg&desde=0', { headers: { 'X-Clave-Lectura': claveLectura } }));
    assert.deepEqual((await b.json()).eventos.map((e) => e.evento.id), [genesis.id, bien.id]);
  });
  
  test('autoridad: la firma tocada sigue siendo 400 sin 7703; lo que el transporte admite y el núcleo no, 422 con 7703', async () => {
    const { c, genesis } = await carta();
    const { s, subir } = await servicioConEje(genesis);
    // Sin movimientos: crearEvento no lo construye, así que se firma a mano.
    const crudo = { autor: 'vg', sobre: genesis.id, en: '0000000000', t: T, movimientos: [], payload: ['nada'], contexto: {} };
    crudo.id = await hash(canonico(cuerpo(crudo)));
    const sinMov = await firmarAgram(crudo, c.privada);
    assert.equal((await subir({ ...sinMov, firma: 'f'.repeat(128) })).estado, 400, 'firma tocada');
    const r = await subir(sinMov);
    assert.equal(r.estado, 422, 'forma válida para el transporte, pero el núcleo la rechaza');
    assert.ok(r.cuerpo.reason.length >= 1 && r.cuerpo.reason.every((x) => typeof x === 'string' && x));
    assert.equal(s.rele.consultar({ kinds: [KIND_RECHAZO] }).length, 1, 'solo el juzgado por reglas tiene 7703');
  });
  
  test('paridad: mismo evento, mismo veredicto en la carta y en la autoridad (las dos con el núcleo de este repo)', async () => {
    const vivo = { Eje };
    const c = await clavesAgram();
    const laCarta = await vivo.Eje.genesis({ identidad: 'vg', foco: ['mi eje'], t: T, clave: c.publica, privada: c.privada, exigirFirmas: true });
    const genesis = laCarta.obtener(laCarta.genesisId);
    const { subir } = await servicioConEje(genesis);
    const firmarDatos = async (datos) => firmarAgram(await crearEvento({ autor: 'vg', sobre: laCarta.genesisId, t: T, ...datos }), c.privada);
    const casos = [
      { movimientos: [gastaT('vg')], payload: ['uno'] },
      { movimientos: [gastaT('vg'), { token: 'E', emisor: 'vg', denominacion: 'EUR', cantidad: 5, de: 'vg', a: 'otro' }], payload: ['pago sin saldo'] },
      { movimientos: [gastaT('vg', 2)], payload: ['dos minutos'] },
      { movimientos: [gastaT('vg', 100000)], payload: ['más T del que hay'] },
      { movimientos: [gastaT('vg')], payload: [['una', 'décupla'], ['x']] },
    ];
    let aceptados = 0;
    let rechazados = 0;
    for (const datos of casos) {
      const ev = await firmarDatos(datos);
      const enLaCarta = await laCarta.validar(ev);
      const enAarpia = await subir(ev);
      const veredicto = enAarpia.estado === 201 ? [] : enAarpia.cuerpo.reason;
      assert.deepEqual(veredicto, enLaCarta, 'mismo evento, mismo veredicto: ' + datos.payload[0]);
      if (!enLaCarta.length) {
        await laCarta.anadir(ev);
        aceptados++;
      } else rechazados++;
    }
    assert.ok(aceptados >= 2 && rechazados >= 2, 'la prueba ejercita las dos salidas (' + aceptados + ' / ' + rechazados + ')');
  });
  
});

describe('sim aarpia: recibo único (stateark.recibo@1)', () => {
  const T = '2026-11-12T12:00:00+01:00';
  const BASE = 'http://p/functions/v1/eventos';
  /** Un servicio con autoridad, un génesis, uno aceptado y uno rechazado. */
  async function aceptadoYRechazado() {
    const s = crearServicio({ autoridad: new Autoridad() });
    const c = await clavesAgram();
    const carta = await Eje.genesis({ identidad: 'vg', foco: ['mi eje'], t: T, clave: c.publica, privada: c.privada, exigirFirmas: true });
    const { claveLectura } = await (await s.manejar(new Request(BASE + '/ejes', { method: 'POST', headers: { 'X-Crear-Ejes': 'prueba' }, body: JSON.stringify({ eje: 'vg' }) }))).json();
    const subir = (evento) => s.manejar(new Request(BASE, { method: 'POST', headers: { 'X-Clave-Lectura': claveLectura, 'Content-Type': 'application/json' }, body: JSON.stringify({ eje: 'vg', evento }) }));
    const cand = async (datos) => firmarAgram(await crearEvento({ autor: 'vg', sobre: carta.genesisId, t: T, ...datos }), c.privada);
    const genesis = carta.obtener(carta.genesisId);
    const bien = await cand({ movimientos: [{ token: 'T', escala: 'minuto', cantidad: 1, de: 'vg', a: null }], payload: ['hola'] });
    const mal = await cand({ movimientos: [{ token: 'T', escala: 'minuto', cantidad: 1, de: 'vg', a: null }, { token: 'E', emisor: 'vg', denominacion: 'EUR', cantidad: 5, de: 'vg', a: 'otro' }], payload: ['pago'] });
    await subir(genesis);
    await subir(bien);
    await subir(mal);
    const sobreBien = s.rele.consultar({ kinds: [7700], '#g': [bien.id] })[0];
    const aceptado = JSON.parse(s.rele.reciboDe(sobreBien.id).content);
    const rechazado = JSON.parse(s.rele.consultar({ kinds: [KIND_RECHAZO], '#g': [mal.id] })[0].content);
    return { s, genesis, bien, mal, aceptado, rechazado };
  }

  test('recibo único: 7701 de llegada (sin autoridad), de aceptación y 7703 de rechazo (con autoridad)', async () => {
    // Sin autoridad: «llegada», firmado por el relé.
    const rele = new Rele();
    const { vg, genesis } = await ejeDePrueba();
    const { recibo } = await rele.publicar(await envolver({ evento: genesis, eje: 'prueba', privada: vg.privada }));
    const llegada = JSON.parse(recibo.content);
    assert.equal(await verificarRecibo(llegada), true);
    assert.deepEqual([leerRecibo(llegada).clase, llegada.emisor, leerRecibo(llegada).sujeto[0]], ['llegada', rele.publica, genesis.id]);
    assert.ok(leerRecibo(llegada).noAfirma.length >= 1, 'lo que NO afirma, nunca vacío');

    // Con autoridad: «aceptación» y «rechazo», los dos firmados por la autoridad, con núcleo y época.
    const { s, genesis: g2, bien, mal, aceptado, rechazado } = await aceptadoYRechazado();
    for (const r of [aceptado, rechazado]) {
      assert.equal(await verificarRecibo(r), true);
      assert.equal(r.emisor, s.autoridad.publica);
      assert.equal(leerRecibo(r).nucleo, NUCLEO.commit);
      assert.equal(leerRecibo(r).epoca, g2.contexto.epoca);
    }
    assert.deepEqual([leerRecibo(aceptado).clase, leerRecibo(aceptado).sujeto[0]], ['aceptación', bien.id]);
    assert.deepEqual([leerRecibo(rechazado).clase, leerRecibo(rechazado).sujeto[0]], ['rechazo', mal.id]);
    assert.deepEqual(leerRecibo(rechazado).causa, ['saldo insuficiente de E:vg/EUR en vg']);
    assert.equal(rechazado.evento.id, mal.id, 'el evento rechazado va al lado, fuera del hash');
    // Tocar el recibo rompe su id.
    assert.equal(await verificarRecibo({ ...aceptado, t: '2030-01-01T00:00:00.000Z' }), false);
  });
});

describe('sim aarpia: espejo hacia relés Nostr', () => {
  /** Un relé remoto falso: recibe EVENT, guarda y contesta OK (o se cae cuando se le pide). */
  function releFalso() {
    const recibidos = [];
    const sockets = [];
    let caido = false;
    class WSFalso {
      constructor(url) {
        this.url = url;
        sockets.push(this);
        queueMicrotask(() => (caido ? this.onclose?.() : this.onopen?.()));
      }
      send(texto) {
        const [tipo, ev] = JSON.parse(texto);
        assert.equal(tipo, 'EVENT');
        const ya = recibidos.some((x) => x.id === ev.id);
        if (!ya) recibidos.push(ev);
        queueMicrotask(() => this.onmessage?.({ data: JSON.stringify(['OK', ev.id, !ya, ya ? 'duplicate: ya estaba' : '']) }));
      }
      close() { this.onclose?.(); }
    }
    return { WSFalso, recibidos, sockets, caer: () => { caido = true; for (const s of sockets) s.close(); }, levantar: () => { caido = false; } };
  }

  const esperar = () => new Promise((ok) => setTimeout(ok, 5));

  test('espejo: lo que guarda el relé (7700 y su recibo 7701) llega al relé remoto, en orden y una vez', async () => {
    const remoto = releFalso();
    const espejo = crearEspejo({ urls: ['ws://strfry.casa:7777'], WS: remoto.WSFalso });
    const rele = new Rele({ alGuardar: espejo.enviar });
    const { vg, genesis, alta } = await ejeDePrueba();
    for (const ev of [genesis, alta]) await rele.publicar(await envolver({ evento: ev, eje: 'prueba', privada: vg.privada }));
    await esperar();
    assert.deepEqual(remoto.recibidos.map((e) => e.kind), [7700, 7701, 7700, 7701], 'cada evento y su recibo, en orden de llegada');
    assert.deepEqual(remoto.recibidos.map((e) => e.id), rele.enOrden().map((e) => e.id));
    assert.deepEqual(espejo.estado(), [{ url: 'ws://strfry.casa:7777', pendientes: 0, confirmados: 4, conectado: true }]);
    assert.equal(remoto.sockets.length, 1, 'una sola conexión');
  });

  test('espejo: si el remoto se cae, la cola espera y reintenta; al volver, llega todo sin duplicar', async () => {
    const remoto = releFalso();
    const temporizados = [];
    const avisos = [];
    const espejo = crearEspejo({ urls: ['ws://strfry.casa:7777'], WS: remoto.WSFalso, temporizador: (ms, f) => temporizados.push({ ms, f }), aviso: (m) => avisos.push(m) });
    const rele = new Rele({ alGuardar: espejo.enviar });
    const { vg, genesis, alta } = await ejeDePrueba();
    await rele.publicar(await envolver({ evento: genesis, eje: 'prueba', privada: vg.privada }));
    await esperar();
    assert.equal(remoto.recibidos.length, 2);
    remoto.caer();
    await rele.publicar(await envolver({ evento: alta, eje: 'prueba', privada: vg.privada }));
    await esperar();
    assert.equal(espejo.estado()[0].pendientes, 2, 'el 7700 y su 7701 esperan');
    assert.ok(temporizados.length >= 1 && temporizados[0].ms === 1000, 'reintento con espera');
    assert.ok(avisos.some((m) => /sin conexión/.test(m)), 'la caída se dice');
    remoto.levantar();
    temporizados.shift().f();
    await esperar();
    assert.equal(remoto.recibidos.length, 4, 'llega lo pendiente');
    assert.equal(new Set(remoto.recibidos.map((e) => e.id)).size, 4, 'sin duplicados');
    assert.equal(espejo.estado()[0].pendientes, 0);
  });
});

describe('sim aarpia: libro persistente y revalidar', () => {
  const T = '2026-11-12T12:00:00+01:00';
  const BASE = 'http://p/functions/v1/eventos';
  const gastaT = (de, cantidad = 1) => ({ token: 'T', escala: 'minuto', cantidad, de, a: null });
  const dir = mkdtempSync(join(tmpdir(), 'aarpia-libro-'));
  after(() => rmSync(dir, { recursive: true, force: true }));

  /** Un libro guardado en disco: génesis, uno aceptado y uno rechazado. */
  async function libroGuardado(nombre) {
    const archivo = join(dir, nombre + '.jsonl');
    const c = await clavesAgram();
    const carta = await Eje.genesis({ identidad: 'vg', foco: ['mi eje'], t: T, clave: c.publica, privada: c.privada, exigirFirmas: true });
    const candidato = async (datos) => firmarAgram(await crearEvento({ autor: 'vg', sobre: carta.genesisId, t: T, ...datos }), c.privada);
    const s = crearServicio({ autoridad: new Autoridad(), archivo });
    await s.abrir();
    const { claveLectura } = await (await s.manejar(new Request(BASE + '/ejes', { method: 'POST', headers: { 'X-Crear-Ejes': 'prueba' }, body: JSON.stringify({ eje: 'vg' }) }))).json();
    const subirA = (serv) => async (evento) => {
      const r = await serv.manejar(new Request(BASE, { method: 'POST', headers: { 'X-Clave-Lectura': claveLectura, 'Content-Type': 'application/json' }, body: JSON.stringify({ eje: 'vg', evento }) }));
      return { estado: r.status, cuerpo: await r.json() };
    };
    const genesis = carta.obtener(carta.genesisId);
    const bien = await candidato({ movimientos: [gastaT('vg')], payload: ['hola'] });
    const mal = await candidato({ movimientos: [gastaT('vg'), { token: 'E', emisor: 'vg', denominacion: 'EUR', cantidad: 5, de: 'vg', a: 'otro' }], payload: ['pago'] });
    assert.equal((await subirA(s)(genesis)).estado, 201);
    assert.equal((await subirA(s)(bien)).estado, 201);
    const rechazo = (await subirA(s)(mal)).cuerpo.rechazo;
    return { archivo, claveLectura, subirA, genesis, bien, mal, rechazo, candidato };
  }

  test('persistencia: tras reiniciar, el libro, los recibos, los rechazos y el juicio siguen igual', async () => {
    const l = await libroGuardado('reinicio');
    assert.ok(existsSync(l.archivo) && existsSync(l.archivo + '.ejes.json'));
    const s2 = crearServicio({ autoridad: new Autoridad(), archivo: l.archivo });
    assert.ok((await s2.abrir()) >= 5, 'génesis, bien, sus dos recibos y el rechazo');
    const bajar = await (await s2.manejar(new Request(BASE + '?eje=vg&desde=0', { headers: { 'X-Clave-Lectura': l.claveLectura } }))).json();
    assert.deepEqual(bajar.eventos.map((e) => [e.orden, e.evento.id]), [[1, l.genesis.id], [2, l.bien.id]]);
    assert.equal((await s2.manejar(new Request(BASE + '/recibo?eje=vg&id=' + l.bien.id, { headers: { 'X-Clave-Lectura': l.claveLectura } }))).status, 200);
    const otraVez = await l.subirA(s2)(l.mal);
    assert.deepEqual([otraVez.estado, otraVez.cuerpo.rechazo], [422, l.rechazo], 'el mismo rechazo, sin otro 7703');
    // La autoridad restaurada juzga sobre el estado de antes: lo siguiente entra en su orden.
    const siguiente = await l.candidato({ movimientos: [gastaT('vg')], payload: ['después de reiniciar'] });
    const r = await l.subirA(s2)(siguiente);
    assert.equal(r.estado, 201);
    assert.equal(r.cuerpo.orden, 3);
  });

  test('revalidar: con el mismo núcleo ningún veredicto cambia; con uno que cambia una regla, se dice cuál', async () => {
    const l = await libroGuardado('revalidar');
    const rele = new Rele({ archivo: l.archivo });
    await rele.abrir();
    const igual = await revalidar({ eventos: rele.enOrden(), Eje });
    assert.deepEqual({ ejes: igual.ejes, juzgados: igual.juzgados, diferencias: igual.diferencias, avisos: igual.avisos }, { ejes: 1, juzgados: 3, diferencias: [], avisos: [] });

    // Un núcleo «nuevo» cuya regla rechaza todo lo que no es el génesis.
    const Estricto = { desde: async (evs, o) => Object.assign(await Eje.desde(evs, o), { validar: async () => ['regla nueva: no'] }) };
    const r = await revalidar({ eventos: rele.enOrden(), Eje: Estricto });
    assert.equal(r.diferencias.length, 1);
    assert.deepEqual(r.diferencias[0], { eje: 'vg', id: l.bien.id, antes: 'aceptado', ahora: ['regla nueva: no'] });

    // Uno que solo cambia el texto del rechazo: aviso, no bloqueo.
    const OtroTexto = { desde: async (evs, o) => { const e = await Eje.desde(evs, o); const v = e.validar.bind(e); return Object.assign(e, { validar: async (x) => (await v(x)).map((t) => t.toUpperCase()) }); } };
    const t = await revalidar({ eventos: rele.enOrden(), Eje: OtroTexto });
    assert.deepEqual([t.diferencias.length, t.avisos.length], [0, 1]);
  });

  test('seguridad: un 7700 que no pasó por la autoridad ni entra ni cuenta como aceptado al restaurar o revalidar', async () => {
    const l = await libroGuardado('intruso');
    const intruso = generarClaves();
    const evIntruso = await l.candidato({ movimientos: [gastaT('vg')], payload: ['colado'] });
    const sobre = await firmar({ kind: 7700, created_at: 1, tags: [['g', evIntruso.id], ['h', 'vg']], content: JSON.stringify(evIntruso) }, intruso.privada);

    // 1. Con autoridad, el relé no admite un 7700 de fuera.
    const s = crearServicio({ autoridad: new Autoridad(), archivo: l.archivo });
    await s.abrir();
    assert.match((await s.rele.publicar(sobre)).motivo, /solo entra por el servicio/);

    // 2. Si alguien lo coló en el archivo por un relé sin autoridad (recibo sin `nucleo`), no cuenta.
    const sinAutoridad = new Rele({ archivo: l.archivo });
    await sinAutoridad.abrir();
    assert.equal((await sinAutoridad.publicar(sobre)).ok, true);
    const s2 = crearServicio({ autoridad: new Autoridad(), archivo: l.archivo });
    await s2.abrir();
    const bajar = await (await s2.manejar(new Request(BASE + '?eje=vg&desde=0', { headers: { 'X-Clave-Lectura': l.claveLectura } }))).json();
    assert.deepEqual(bajar.eventos.map((e) => e.evento.id), [l.genesis.id, l.bien.id], 'el colado no aparece en el libro');
    assert.equal(s2.autoridad.ejes.get('vg').eventos.has(evIntruso.id), false, 'ni en el libro de la autoridad');
    const r = new Rele({ archivo: l.archivo });
    await r.abrir();
    assert.equal((await revalidar({ eventos: r.enOrden(), Eje })).juzgados, 3, 'ni como decisión al revalidar');
  });
});

describe('sim aarpia: sellado de recibos', () => {
  test('sellado: cada 7701 entra en un lote; /sello da la prueba (sellador de mentira, con la forma de stateark/sim)', async () => {
    const BASE = 'http://p/functions/v1/eventos';
    const sellador = selladorDeMentira();
    const s = crearServicio({ autoridad: new Autoridad(), sellador, lote: 2 });
    const T = '2026-11-12T12:00:00+01:00';
    const c = await clavesAgram();
    const carta = await Eje.genesis({ identidad: 'vg', foco: ['mi eje'], t: T, clave: c.publica, privada: c.privada, exigirFirmas: true });
    const { claveLectura } = await (await s.manejar(new Request(BASE + '/ejes', { method: 'POST', headers: { 'X-Crear-Ejes': 'prueba' }, body: JSON.stringify({ eje: 'vg' }) }))).json();
    const h = { 'X-Clave-Lectura': claveLectura, 'Content-Type': 'application/json' };
    const subir = (evento) => s.manejar(new Request(BASE, { method: 'POST', headers: h, body: JSON.stringify({ eje: 'vg', evento }) }));
    const sello = async (id) => {
      const r = await s.manejar(new Request(BASE + '/sello?eje=vg&id=' + id, { headers: h }));
      return { estado: r.status, cuerpo: await r.json() };
    };
    const nuevo = async (p) => firmarAgram(await crearEvento({ autor: 'vg', sobre: carta.genesisId, t: T, movimientos: [{ token: 'T', escala: 'minuto', cantidad: 1, de: 'vg', a: null }], payload: [p] }), c.privada);
    const genesis = carta.obtener(carta.genesisId);
    const uno = await nuevo('uno');
    const dos = await nuevo('dos');
    assert.equal((await subir(genesis)).status, 201);
    assert.equal((await subir(uno)).status, 201); // segundo recibo: se cierra el lote de 2
    assert.equal((await subir(dos)).status, 201); // tercero: queda por sellar

    const antes = await sello(uno.id);
    assert.equal(antes.estado, 200);
    assert.equal(antes.cuerpo.prueba.pendiente, true);
    assert.equal(antes.cuerpo.verificacion.ok, false);
    assert.deepEqual([(await sello(dos.id)).estado, (await sello(dos.id)).cuerpo.codigo], [404, 'sin-sellar']);

    await s.sellarPendientes();
    const bloque = sellador.minar();
    for (const ev of [genesis, uno, dos]) {
      const r = await sello(ev.id);
      assert.equal(r.estado, 200);
      assert.equal(r.cuerpo.verificacion.ok, true, 'sellado y comprobado: ' + ev.id.slice(0, 8));
      assert.equal(r.cuerpo.verificacion.altura, bloque.altura);
      // Lo sellado es el 7701, que lleva con qué núcleo y qué época se aceptó.
      const recibo = s.rele.consultar({ ids: [r.cuerpo.recibo] })[0];
      assert.deepEqual(valores(recibo, 'nucleo'), [NUCLEO.commit]);
      assert.deepEqual(valores(recibo, 'epoca'), [genesis.contexto.epoca]);
    }
    const r = await sello(uno.id);
    assert.equal((await sellador.verificar(r.cuerpo.recibo, { ...r.cuerpo.prueba, hash: 'f'.repeat(64) })).ok, false, 'una prueba tocada no pasa');
    // Sin sellador, /sello lo dice.
    const sin = crearServicio();
    const { claveLectura: k2 } = await (await sin.manejar(new Request(BASE + '/ejes', { method: 'POST', headers: { 'X-Crear-Ejes': 'prueba' }, body: JSON.stringify({ eje: 'vg' }) }))).json();
    await sin.manejar(new Request(BASE, { method: 'POST', headers: { 'X-Clave-Lectura': k2, 'Content-Type': 'application/json' }, body: JSON.stringify({ eje: 'vg', evento: genesis }) }));
    const nada = await sin.manejar(new Request(BASE + '/sello?eje=vg&id=' + genesis.id, { headers: { 'X-Clave-Lectura': k2 } }));
    assert.deepEqual([nada.status, (await nada.json()).codigo], [404, 'sin-sellador']);
  });
});
