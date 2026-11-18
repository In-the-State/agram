// La tanda en la sincronía (src/sincronia.js; agram-equipo/CONTRATO_TANDA.md, con sus precisiones del 18-11 noche),
// contra el servidor de prueba (servidor/prueba, el api.js de Supabase en memoria): la cola sube la tanda entera por
// POST /eventos/tanda y nunca un miembro suelto; al bajar, la tanda se asienta entera (eje.anadirTanda), la que la página
// cortó espera sin rechazarse y la que la puerta sirve partida se rechaza entera. Los fallos de la puerta (404/405, 409,
// 400, 422, 429) se simulan envolviendo el fetch. Claves de PRUEBA.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { arrancar } from '../servidor/prueba/servidor.mjs';
import { Sincronia } from '../src/sincronia.js';
import { Eje } from '../src/eje.js';
import { crearEvento, marcarTanda } from '../src/evento.js';
import { generarClaves, firmar } from '../src/autoridad.js';
import { quemaDelCoste } from '../src/escritura.js';

const T = (m) => '2026-11-18T10:' + String(m).padStart(2, '0') + ':00Z';
let servidor;
let reloj = Date.parse('2026-11-18T12:00:00Z');
const ahora = () => reloj;

before(async () => {
  servidor = await arrancar({ puerto: 0, secreto: 'prueba', ahora: () => new Date(reloj) });
});
after(async () => servidor.cerrar());

async function crearEje(nombre) {
  const r = await fetch(servidor.url + '/ejes', { method: 'POST', headers: { 'X-Crear-Ejes': 'prueba', 'Content-Type': 'application/json' }, body: JSON.stringify({ eje: nombre }) });
  assert.equal(r.status, 201);
  return (await r.json()).claveLectura;
}

const datos = (eje, autor, sobre, payload, t) => ({ autor, sobre, t, movimientos: [quemaDelCoste(autor, payload, 'minuto', { eje })], payload });

/** Un eje de vg con una tanda suya de tres asentada (y, si se pide, un registro suelto antes): { eje, vg, tanda, suelto }. */
async function ejeConTanda({ conSuelto = false } = {}) {
  const vg = await generarClaves();
  const eje = await Eje.genesis({ identidad: 'vg', foco: ['tandas por la red'], t: T(0), clave: vg.publica, privada: vg.privada, exigirFirmas: true });
  const suelto = conSuelto ? await eje.escribir(datos(eje, 'vg', eje.genesisId, ['Suelto'], T(1)), vg.privada) : null;
  const { vista } = await eje.vistaTanda();
  const uno = await crearEvento(datos(vista, 'vg', eje.genesisId, ['Uno'], T(2)));
  const dos = await crearEvento(datos(vista, 'vg', uno.id, ['Dos'], T(2)));
  const tres = await crearEvento(datos(vista, 'vg', dos.id, ['Tres'], T(3)));
  const tanda = await Promise.all((await marcarTanda([uno, dos, tres])).map((ev) => firmar(ev, vg.privada)));
  const r = await eje.anadirTanda(tanda);
  assert.equal(r.ok, true, JSON.stringify(r.motivos));
  return { eje, vg, tanda, suelto };
}

/** Un fetch que, para POST /eventos/tanda, responde `estado` con { error, indice, id } sin llegar al servidor. */
const fetchQueResponde = (estado, cuerpo = { error: 'simulado', indice: 1, id: null }) => async (url, op = {}) => {
  if (String(url).endsWith('/eventos/tanda') && op.method === 'POST') return new Response(JSON.stringify(cuerpo), { status: estado, headers: { 'Content-Type': 'application/json' } });
  return fetch(url, op);
};

/** Cuántos miembros de la tanda tiene el servidor. */
async function enElServidor(clave, nombre, ids) {
  const r = await fetch(servidor.url + '/eventos?eje=' + nombre + '&desde=0', { headers: { 'X-Clave-Lectura': clave } });
  const vistos = new Set((await r.json()).eventos.map((e) => e.evento.id));
  return ids.filter((id) => vistos.has(id)).length;
}

test('subir: la tanda va entera por POST /eventos/tanda; quien baja la asienta entera; el reintento duplicado vale como subida', async () => {
  const clave = await crearEje('tanda-sube');
  const { eje, tanda } = await ejeConTanda({ conSuelto: true });
  const rutas = [];
  const espia = (url, op = {}) => {
    if (op.method === 'POST') rutas.push(new URL(url).pathname);
    return fetch(url, op);
  };
  const A = new Sincronia({ url: servidor.url, eje: 'tanda-sube', claveLectura: clave, fetch: espia, ahora });
  const informe = await A.sincronizar(eje);
  assert.deepEqual(informe.subidos, eje.orden);
  assert.deepEqual(rutas, ['/eventos', '/eventos', '/eventos/tanda'], 'génesis y suelto sueltos; la tanda, entera');
  assert.deepEqual(tanda.map((e) => A.orden(e.id)), [3, 4, 5], 'órdenes consecutivos');
  // B baja el libro: la tanda entra entera por anadirTanda.
  const B = new Sincronia({ url: servidor.url, eje: 'tanda-sube', claveLectura: clave, ahora });
  const deB = await B.sincronizar(null);
  assert.deepEqual(deB.errores, []);
  assert.deepEqual(deB.rechazados, []);
  assert.deepEqual(deB.eje.orden, eje.orden);
  // La respuesta se perdió: la tanda vuelve a subir y el 200 con duplicado vale como subida.
  const otraVez = new Sincronia({ url: servidor.url, eje: 'tanda-sube', claveLectura: clave, ahora });
  const r = await otraVez.subirTanda(tanda);
  assert.equal(r.duplicado, true);
  assert.deepEqual(r.eventos.map((f) => f.orden), [3, 4, 5]);
});

test('subir: 404/405 deja la tanda pendiente con su motivo y no la parte; 409, 400 y 422 la paran sin reintentar sola; 429, como un suelto', async () => {
  for (const estado of [404, 405]) {
    const nombre = 'sin-tandas-' + estado;
    const clave = await crearEje(nombre);
    const { eje, tanda } = await ejeConTanda();
    const S = new Sincronia({ url: servidor.url, eje: nombre, claveLectura: clave, fetch: fetchQueResponde(estado), ahora });
    const informe = await S.sincronizar(eje);
    assert.deepEqual(informe.subidos, [eje.genesisId]);
    assert.deepEqual(informe.pendientes, tanda.map((e) => e.id));
    assert.equal(await enElServidor(clave, nombre, tanda.map((e) => e.id)), 0, 'no cae a subir de uno en uno');
    assert.ok(informe.rechazados.every((r) => r.de === 'servidor' && /no acepta tandas/.test(r.motivo)));
    assert.deepEqual(S.cola.map((c) => [c.id, c.parada ?? false, /no acepta tandas/.test(c.error)]), tanda.map((e) => [e.id, false, true]));
    // Pasada la espera, se vuelve a intentar (no está parada).
    reloj += 10 * 60 * 1000;
    const n = S.cola[0].intentos;
    await S.sincronizar(eje);
    assert.equal(S.cola[0].intentos, n + 1);
  }
  for (const estado of [400, 409, 422]) {
    const nombre = 'parada-' + estado;
    const clave = await crearEje(nombre);
    const { eje, tanda } = await ejeConTanda();
    let llamadas = 0;
    const responde = fetchQueResponde(estado, { error: 'simulado ' + estado, indice: 1, id: tanda[1].id });
    const S = new Sincronia({ url: servidor.url, eje: nombre, claveLectura: clave, fetch: (url, op) => { if (String(url).endsWith('/eventos/tanda')) llamadas += 1; return responde(url, op); }, ahora });
    const informe = await S.sincronizar(eje);
    assert.equal(llamadas, 1);
    assert.ok(informe.rechazados.every((r) => r.de === 'servidor' && r.motivo.includes('simulado ' + estado) && r.motivo.includes('miembro 2')));
    assert.ok(S.cola.every((c) => c.parada === true));
    reloj += 60 * 60 * 1000;
    await S.sincronizar(eje);
    assert.equal(llamadas, 1, 'parada: no se reintenta sola');
    // Se guarda parada.
    const R = Sincronia.restaurar(S.serializar(), { claveLectura: clave, fetch: responde, ahora });
    assert.ok(R.cola.every((c) => c.parada === true));
    // Tras olvidar los rechazos, sí.
    S.olvidarRechazados();
    await S.sincronizar(eje);
    assert.equal(llamadas, 2);
  }
  {
    const clave = await crearEje('tanda-429');
    const { eje, tanda } = await ejeConTanda();
    const S = new Sincronia({ url: servidor.url, eje: 'tanda-429', claveLectura: clave, fetch: fetchQueResponde(429, { error: 'demasiadas', indice: null, id: null }), ahora });
    await S.sincronizar(eje);
    assert.ok(S.cola.every((c) => !c.parada && c.proximo > reloj && c.intentos === 1));
    // Con la puerta de verdad y pasada la espera, sube entera.
    const B = Sincronia.restaurar(S.serializar(), { claveLectura: clave, ahora });
    reloj += 10 * 60 * 1000;
    const informe = await B.sincronizar(eje);
    assert.deepEqual(informe.subidos, tanda.map((e) => e.id));
    assert.equal(await enElServidor(clave, 'tanda-429', tanda.map((e) => e.id)), 3);
  }
});

test('bajar: la tanda que la página corta espera sin rechazarse y entra entera en la pasada siguiente', async () => {
  const clave = await crearEje('tanda-cortada');
  const { eje, tanda } = await ejeConTanda({ conSuelto: true });
  const A = new Sincronia({ url: servidor.url, eje: 'tanda-cortada', claveLectura: clave, ahora });
  await A.sincronizar(eje);
  // B baja: la página se corta tras el miembro 1 (como si la red cayera en la página siguiente).
  let cortar = true;
  const cortada = async (url, op = {}) => {
    const r = await fetch(url, op);
    if (!cortar || !String(url).includes('/eventos?')) return r;
    const d = await r.json();
    const hasta = d.eventos.findIndex((e) => e.evento.id === tanda[1].id);
    return new Response(JSON.stringify({ eventos: d.eventos.slice(0, hasta), siguiente: null }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const B = new Sincronia({ url: servidor.url, eje: 'tanda-cortada', claveLectura: clave, fetch: cortada, ahora });
  const primera = await B.sincronizar(null);
  assert.deepEqual(primera.enEspera, [tanda[0].id]);
  assert.deepEqual(primera.rechazados, []);
  assert.equal(primera.eje.obtener(tanda[0].id), undefined, 'un miembro nunca se asienta suelto');
  assert.deepEqual(B.rechazados, []);
  cortar = false;
  const segunda = await B.sincronizar(primera.eje);
  assert.deepEqual(segunda.rechazados, []);
  assert.deepEqual(segunda.anadidos, tanda.map((e) => e.id));
  assert.deepEqual(primera.eje.orden, eje.orden);
});

test('bajar: una tanda que la puerta sirve partida (otro registro entre sus miembros) se rechaza entera, con el mismo motivo y de: reglas', async () => {
  const clave = await crearEje('tanda-partida');
  const { eje, tanda, vg } = await ejeConTanda();
  const A = new Sincronia({ url: servidor.url, eje: 'tanda-partida', claveLectura: clave, ahora });
  await A.sincronizar(eje);
  const x = await eje.escribir(datos(eje, 'vg', eje.genesisId, ['Después'], T(4)), vg.privada);
  await A.sincronizar(eje);
  // La puerta miente: sirve x entre el miembro 1 y el 2 (le da el orden del 2 y corre los demás).
  const miente = async (url, op = {}) => {
    const r = await fetch(url, op);
    if (!String(url).includes('/eventos?')) return r;
    const d = await r.json();
    const o = Object.fromEntries(d.eventos.map((e) => [e.evento.id, e.orden]));
    const nuevo = { ...o, [x.id]: o[tanda[1].id], [tanda[1].id]: o[tanda[1].id] + 1, [tanda[2].id]: o[tanda[2].id] + 1 };
    const eventos = d.eventos.map((e) => ({ ...e, orden: nuevo[e.evento.id] })).sort((a, b) => a.orden - b.orden);
    return new Response(JSON.stringify({ eventos, siguiente: null }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const B = new Sincronia({ url: servidor.url, eje: 'tanda-partida', claveLectura: clave, fetch: miente, ahora });
  const informe = await B.sincronizar(null);
  assert.deepEqual(informe.rechazados.map((r) => r.id).sort(), tanda.map((e) => e.id).sort());
  assert.ok(informe.rechazados.every((r) => r.de === 'reglas'));
  assert.equal(new Set(informe.rechazados.map((r) => r.motivo)).size, 1);
  assert.ok(informe.eje.obtener(x.id));
  assert.ok(tanda.every((e) => !informe.eje.obtener(e.id)));
});

test('bajar: si un miembro no pasa las reglas al bajar, todos los de la tanda a rechazados con el mismo motivo', async () => {
  const clave = await crearEje('tanda-nula');
  const vg = await generarClaves();
  const eje = await Eje.genesis({ identidad: 'vg', foco: ['nula'], t: T(0), clave: vg.publica, privada: vg.privada, exigirFirmas: true });
  const A = new Sincronia({ url: servidor.url, eje: 'tanda-nula', claveLectura: clave, ahora });
  await A.sincronizar(eje);
  // Una tanda nula por las reglas (bloquea R que vg no tiene) subida a mano: la puerta solo mira la forma.
  const uno = await crearEvento(datos(eje, 'vg', eje.genesisId, ['Uno'], T(1)));
  const dos = await crearEvento({ ...datos(eje, 'vg', uno.id, ['Bloqueo lo que no tengo'], T(1)), movimientos: [quemaDelCoste('vg', ['Bloqueo lo que no tengo'], 'minuto', { eje }), { token: 'R', emisor: 'vg', cantidad: 5, de: 'vg', a: 'vg', estado: 'bloqueo', salida: 'x' }] });
  const nula = await Promise.all((await marcarTanda([uno, dos])).map((ev) => firmar(ev, vg.privada)));
  await A.subirTanda(nula);
  // Otro dispositivo con el mismo libro la baja.
  const B = new Sincronia({ url: servidor.url, eje: 'tanda-nula', claveLectura: clave, ahora });
  const informe = await B.sincronizar(eje);
  assert.deepEqual(informe.rechazados.map((r) => r.id), nula.map((e) => e.id));
  assert.ok(informe.rechazados.every((r) => r.de === 'reglas' && /el miembro 2 no pasa/.test(r.motivo)));
  assert.equal(new Set(informe.rechazados.map((r) => r.motivo)).size, 1);
  assert.equal(eje.obtener(nula[0].id), undefined);
});

test('bajar: un libro que nace de una tanda de apertura (el génesis es su miembro 1)', async () => {
  const clave = await crearEje('tanda-apertura');
  const vg = await generarClaves();
  const base = await Eje.genesis({ identidad: 'vg', foco: ['abierto en una tanda'], t: T(0), clave: vg.publica, privada: vg.privada, exigirFirmas: true });
  const g = base.obtener(base.genesisId);
  const { vista } = await base.vistaTanda();
  const uno = await crearEvento(datos(vista, 'vg', g.id, ['Primero'], T(1)));
  const tanda = await Promise.all((await marcarTanda([g, uno])).map((ev) => firmar(ev, vg.privada)));
  const A = new Sincronia({ url: servidor.url, eje: 'tanda-apertura', claveLectura: clave, ahora });
  await A.subirTanda(tanda);
  const B = new Sincronia({ url: servidor.url, eje: 'tanda-apertura', claveLectura: clave, ahora });
  const informe = await B.sincronizar(null);
  assert.deepEqual(informe.errores, []);
  assert.deepEqual(informe.eje.orden, tanda.map((e) => e.id));
});
