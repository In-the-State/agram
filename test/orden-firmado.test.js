// El orden firmado (docs/notas/ORDEN_FIRMADO.md): el recibo que el servidor firma por cada registro lleva su «orden» en
// la cadena del eje (desde '0', en texto) y su «anterior» (el id del recibo de orden − 1). src/orden.js lo comprueba sin
// fiarse y da la prueba de contradicción («contradicción en la cadena de recibos»); src/sincronia.js lo encadena, lo guarda y
// dice el estado ('firmado', 'sin firmar', 'contradicho'); la simulación de AARPIA (servidor/sim/aarpia/) lo firma. El
// vector de StateArk (stateark/sip/vectores/recibos/llegada.json, solo lectura) manda sobre la forma: se comprueba aquí
// si está (fuera del repo); si no, esa prueba se salta y lo dice. El servicio que miente es solo de estas pruebas: envuelve
// el manejador de la simulación (sin ruta nueva) y vuelve a firmar con la clave del relé otro orden para un cliente.

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crearServicio } from '../servidor/sim/aarpia/src/servicio.js';
import { Autoridad } from '../servidor/sim/aarpia/src/autoridad.js';
import { decupla, firmarRecibo, llegada } from '../servidor/sim/aarpia/src/recibo.js';
import { Sincronia } from '../src/sincronia.js';
import { selloCon } from '../src/sello.js';
import { comprobarRecibo, comprobarEslabon, ordenDoble, CLASE_DE_ORDEN_DOBLE } from '../src/orden.js';
import { Eje } from '../src/eje.js';
import { generarClaves, firmar as firmarAgram } from '../src/autoridad.js';
import { crearEvento } from '../src/evento.js';
import { pagaElCoste } from './ayudas-coste.js';
import { lineaDeEstado } from '../carta/sincronia.js';
import { htmlSincronia } from '../carta/dom.js';
import { t as texto } from '../carta/textos.js';

const AQUI = dirname(fileURLToPath(import.meta.url));
const VECTOR = join(AQUI, '..', '..', 'stateark', 'sip', 'vectores', 'recibos', 'llegada.json');
const BASE = 'http://sim';
const T = (m) => '2026-11-10T10:' + String(m).padStart(2, '0') + ':00Z';
const dir = mkdtempSync(join(tmpdir(), 'orden-firmado-'));
after(() => rmSync(dir, { recursive: true, force: true }));

const json = (d, estado = 200) => new Response(JSON.stringify(d), { status: estado, headers: { 'Content-Type': 'application/json' } });
/** El fetch de un cliente contra el manejador de la simulación (sin HTTP). */
const fetchDe = (s) => async (url, op = {}) => s.manejar(new Request(url, op));

async function crearEje(s, nombre) {
  const r = await s.manejar(new Request(BASE + '/eventos/ejes', { method: 'POST', headers: { 'X-Crear-Ejes': 'prueba', 'Content-Type': 'application/json' }, body: JSON.stringify({ eje: nombre }) }));
  return (await r.json()).claveLectura;
}

/** Un eje con su génesis y `n` registros independientes (todos sobre el génesis, el mismo t): { eje, ids, escribir }. */
async function ejeCon(n) {
  const cuenta = await generarClaves();
  const eje = await Eje.genesis({ identidad: 'vg', foco: ['mi eje'], t: T(0), clave: cuenta.publica, privada: cuenta.privada, exigirFirmas: true });
  const escribir = async (k) => (await eje.escribir({ autor: 'vg', sobre: eje.genesisId, t: T(1), movimientos: [pagaElCoste('vg')], payload: ['r' + k] }, cuenta.privada)).id;
  const ids = [eje.genesisId];
  for (let k = 0; k < n; k++) ids.push(await escribir(k));
  return { eje, ids, escribir, cuenta };
}

/** Un servicio con un eje subido por un cliente A: { s, nombre, claveLectura, A, eje, ids, escribir }. */
async function montar({ n = 2, nombre = 'libro', ...opciones } = {}) {
  const s = crearServicio(opciones);
  if (opciones.archivo) await s.abrir();
  const claveLectura = await crearEje(s, nombre);
  const { eje, ids, escribir, cuenta } = await ejeCon(n);
  const A = new Sincronia({ url: BASE, eje: nombre, claveLectura, fetch: fetchDe(s), ...(opciones.selloCliente ? { sello: opciones.selloCliente } : {}) });
  const informe = await A.sincronizar(eje);
  return { s, nombre, claveLectura, A, eje, ids, escribir, cuenta, informe };
}

/** Vuelve a firmar, con la clave del relé, el recibo honesto `sobre` con otro eslabón (lo que haría un servicio que miente). */
async function refirmar(s, sobre, { orden, anterior }) {
  const valor = (k) => sobre.recibo[3][sobre.recibo[2].indexOf(k)];
  return llegada({ idAgram: sobre.recibo[1][0], idNostr: sobre.recibo[1][1], eje: valor('eje'), instante: sobre.t, rele: s.rele.publica, orden, ...(anterior ? { anterior } : {}) }, s.rele.privada);
}

/** El recibo honesto (el `sobre` de GET /eventos/recibo) de un registro. */
async function sobreHonesto(s, nombre, claveLectura, id) {
  const r = await s.manejar(new Request(BASE + '/eventos/recibo?eje=' + nombre + '&id=' + id, { headers: { 'X-Clave-Lectura': claveLectura } }));
  return (await r.json()).sobre;
}

/**
 * EL SERVICIO QUE MIENTE (solo en las pruebas, sin ruta nueva): envuelve el manejador. `servir(id, orden)` cambia el
 * `orden` servido por GET /eventos; `recibos` (id → sobre, null para quitarlo, o async (sobre honesto) → sobre) cambia el
 * `sobre` de GET /eventos/recibo.
 */
function mentiroso(s, { servir = null, recibos = new Map() } = {}) {
  return async (url, op = {}) => {
    const r = await s.manejar(new Request(url, op));
    const u = new URL(url);
    if (r.status !== 200) return r;
    if (u.pathname.endsWith('/eventos/recibo')) {
      const d = await r.json();
      const id = u.searchParams.get('id');
      if (recibos.has(id)) {
        const otro = recibos.get(id);
        if (otro === null) delete d.sobre;
        else d.sobre = typeof otro === 'function' ? await otro(d.sobre) : otro;
      }
      return json(d);
    }
    if (servir && u.pathname.endsWith('/eventos') && (op.method ?? 'GET') === 'GET') {
      const d = await r.json();
      d.eventos = d.eventos.map((e) => ({ ...e, orden: servir(e.evento.id, e.orden) })).sort((a, b) => a.orden - b.orden);
      return json(d);
    }
    return r;
  };
}

test('el vector de StateArk: comprobarRecibo da por buena su cadena, el eslabón cuadra, las dos manipulaciones fallan y la décupla de la simulación es la misma', { skip: existsSync(VECTOR) ? false : 'sin la carpeta de StateArk (fuera del repo): no se comprueba el vector' }, () => {
  const v = JSON.parse(readFileSync(VECTOR, 'utf8'));
  for (const r of v.cadena) {
    const c = comprobarRecibo(r.sobre, { registro: r.campos.sujeto[0] });
    assert.equal(c.ok, true, JSON.stringify(c));
    assert.equal(c.orden, String(r.orden));
    assert.deepEqual(decupla(r.campos), r.decupla, 'la simulación pone «orden» y «anterior» donde el vector');
  }
  assert.equal(comprobarRecibo(v.cadena[0].sobre).anterior, undefined, '«anterior» falta solo en el 0');
  assert.deepEqual([comprobarEslabon(v.cadena[1].sobre, v.cadena[0].sobre), comprobarEslabon(v.cadena[2].sobre, v.cadena[1].sobre)], [{ ok: true }, { ok: true }]);
  assert.equal(comprobarEslabon(v.cadena[2].sobre, v.cadena[0].sobre), null, 'el 0 no es el de orden − 1 del 2: no aplica');
  const [malAnterior, repetido] = v.manipulaciones.map((m) => m.recibos.map((r) => r.sobre));
  assert.equal(comprobarEslabon(malAnterior[2], malAnterior[1]).ok, false, v.manipulaciones[0].nombre);
  assert.equal(ordenDoble(malAnterior[1], malAnterior[2]).motivo, 'un «anterior» que no es el recibo de ese sitio');
  assert.equal(ordenDoble(repetido[1], repetido[2]).motivo, 'el mismo orden con dos registros', v.manipulaciones[1].nombre);
  assert.equal(ordenDoble(v.cadena[1].sobre, v.cadena[2].sobre), null, 'la cadena buena no se contradice');
  assert.equal(v.selladas.at(-1), v.cadena.at(-1).sobre.id, 'lo sellado es el último de la tanda');
});

test('los vectores de contradicción de StateArk: ordenDoble da la misma clase, el mismo motivo de fondo y el mismo id, del derecho y del revés', { skip: existsSync(VECTOR) ? false : 'falta el vector de StateArk (stateark/sip/vectores/recibos/llegada.json)' }, () => {
  const v = JSON.parse(readFileSync(VECTOR, 'utf8'));
  assert.equal(v.contradicciones.length, 4);
  const motivos = new Set();
  for (const c of v.contradicciones) {
    const p = ordenDoble(c.prueba.a, c.prueba.b);
    assert.ok(p, c.nombre);
    assert.equal(p.clase, c.prueba.clase, c.nombre);
    assert.equal(p.clase, CLASE_DE_ORDEN_DOBLE);
    assert.equal(p.emisor, c.prueba.acusado, c.nombre);
    assert.equal(p.id, c.prueba.id, c.nombre);
    assert.equal(ordenDoble(c.prueba.b, c.prueba.a).id, c.prueba.id, c.nombre);
    assert.equal(ordenDoble(c.prueba).id, c.prueba.id, c.nombre);
    assert.equal(ordenDoble(c.prueba.a, c.prueba.a), null, c.nombre);
    motivos.add(p.motivo);
  }
  assert.equal(motivos.size, 4);
});

test('la simulación firma la cadena: «orden» desde 0 en texto, «anterior» del 1 en adelante, universo «relé · eje»; GET /eventos/recibo da `sobre`; el cliente encadena y dice «firmado» (servido = firmado + 1)', async () => {
  const { s, nombre, claveLectura, A, ids, informe } = await montar({ n: 2 });
  assert.deepEqual(informe.orden.encadenados, ids);
  assert.deepEqual([informe.orden.avisos, informe.orden.fraudes], [[], []]);
  assert.equal(A.orden(), 'firmado');
  const r = await (await s.manejar(new Request(BASE + '/eventos/recibo?eje=' + nombre + '&id=' + ids[1], { headers: { 'X-Clave-Lectura': claveLectura } }))).json();
  assert.deepEqual(Object.keys(r).sort(), ['firma', 'instante', 'recibo', 'rele', 'sobre'], 'lo de antes, igual, y `sobre`');
  assert.deepEqual(Object.keys(r.sobre).sort(), ['emisor', 'firma', 'id', 'recibo', 'schema', 't']);
  const sobres = ids.map((id) => A.reciboDeOrden(id));
  assert.deepEqual(sobres[1], r.sobre);
  const claves = sobres.map((x) => x.recibo[2].slice(0, 5));
  assert.deepEqual(claves[0], ['eje', 'llegada', 'orden', 'universo', 'no afirma']);
  assert.deepEqual(claves[1], ['eje', 'llegada', 'orden', 'anterior', 'universo']);
  const valor = (x, k) => x.recibo[3][x.recibo[2].indexOf(k)];
  assert.deepEqual(sobres.map((x) => valor(x, 'orden')), ['0', '1', '2']);
  assert.deepEqual(sobres.map((x) => valor(x, 'anterior')), [undefined, sobres[0].id, sobres[1].id]);
  assert.equal(valor(sobres[0], 'universo'), 'relé ' + s.rele.publica + ' · eje ' + nombre);
  assert.deepEqual(ids.map((id) => A.orden(id) - Number(valor(A.reciboDeOrden(id), 'orden'))), [1, 1, 1], 'el eje nació con la cadena');
  assert.deepEqual(A.fraudesDeOrden(), []);
});

test('con autoridad, la cadena la firma la autoridad en los recibos de «aceptación»; un rechazo (7703) no entra en ella', async () => {
  const autoridad = new Autoridad();
  const { s, nombre, claveLectura, A, ids, eje, cuenta, escribir } = await montar({ n: 1, autoridad, nombre: 'juzgado' });
  assert.equal(A.orden(), 'firmado');
  const x = A.reciboDeOrden(ids[1]);
  assert.deepEqual([x.recibo[0][1], x.emisor, comprobarRecibo(x).orden], ['aceptación', autoridad.publica, '1']);
  // Un rechazo no gasta un orden: el siguiente aceptado es el 2 y encadena con el 1.
  const malo = await firmarAgram(await crearEvento({ autor: 'vg', sobre: eje.genesisId, t: T(1), movimientos: [pagaElCoste('vg'), { token: 'E', emisor: 'vg', denominacion: 'EUR', cantidad: 5, de: 'vg', a: 'otro' }], payload: ['pago'] }), cuenta.privada);
  const r = await s.manejar(new Request(BASE + '/eventos', { method: 'POST', headers: { 'X-Clave-Lectura': claveLectura, 'Content-Type': 'application/json' }, body: JSON.stringify({ eje: nombre, evento: malo }) }));
  assert.equal(r.status, 422, 'rechazado, con su 7703');
  assert.equal(s.rele.ultimoEslabon(nombre).orden, 1, 'el rechazo no entra en la cadena');
  const y = await escribir(4);
  const informe = await A.sincronizar(eje);
  assert.deepEqual([informe.orden.encadenados, informe.orden.avisos], [[y], []]);
  const c = comprobarRecibo(A.reciboDeOrden(y));
  assert.deepEqual([c.orden, c.anterior], ['2', x.id]);
});

test('sin firmar: un servidor sin la ruta del recibo, uno con recibos sin `sobre` y uno con recibos firmados sin los dos pares', async () => {
  // Sin la ruta (la función de Supabase): se detecta una vez por sesión, como hoy.
  const s1 = crearServicio();
  const k1 = await crearEje(s1, 'sinruta');
  const sinRuta = async (url, op) => (String(url).includes('/eventos/recibo') ? json({ error: 'solo POST' }, 405) : fetchDe(s1)(url, op));
  const a = new Sincronia({ url: BASE, eje: 'sinruta', claveLectura: k1, fetch: sinRuta });
  await a.sincronizar((await ejeCon(1)).eje);
  assert.equal(a.orden(), 'sin firmar');

  // Con recibos, pero sin `sobre` (el servidor de prueba de AGRAM, o un relé de antes de la cadena).
  const { eje, ids } = await ejeCon(1);
  const s2 = crearServicio();
  const k2 = await crearEje(s2, 'sinsobre');
  const sinSobre = mentiroso(s2, { recibos: new Map(ids.map((id) => [id, null])) });
  const b = new Sincronia({ url: BASE, eje: 'sinsobre', claveLectura: k2, fetch: sinSobre });
  const ib = await b.sincronizar(eje);
  assert.deepEqual(ib.recibos.recibidos, ids, 'el reloj X.6.8.1 entra igual');
  assert.equal(b.orden(), 'sin firmar');

  // Recibos bien firmados por el relé, pero sin «orden» ni «anterior».
  const ejeC = (await ejeCon(1)).eje;
  const s3 = crearServicio();
  const k3 = await crearEje(s3, 'sinpares');
  const sinPares = async (url, op) => {
    const r = await fetchDe(s3)(url, op);
    if (!String(url).includes('/eventos/recibo') || r.status !== 200) return r;
    const d = await r.json();
    const h = d.sobre;
    d.sobre = await firmarRecibo({ clase: 'llegada', sujeto: h.recibo[1], ata: [['eje', 'sinpares'], ['llegada', h.t]], universo: 'relé ' + s3.rele.publica, noAfirma: ['que el evento sea válido'] }, s3.rele.privada, h.t);
    return json(d);
  };
  const c = new Sincronia({ url: BASE, eje: 'sinpares', claveLectura: k3, fetch: sinPares });
  const ic = await c.sincronizar(ejeC);
  assert.equal(c.orden(), 'sin firmar');
  assert.deepEqual(ic.orden.encadenados, []);
  assert.ok(ic.orden.avisos.length === 2 && ic.orden.avisos.every((x) => /sin «orden»/.test(x.motivo)));
});

test('un recibo con la firma mala o con el id malo no encadena (aviso, «sin firmar»); el bueno de después vuelve a «firmado»', async () => {
  const { eje, ids, escribir } = await ejeCon(1);
  const s = crearServicio();
  const k = await crearEje(s, 'malos');
  const recibos = new Map();
  const S = new Sincronia({ url: BASE, eje: 'malos', claveLectura: k, fetch: mentiroso(s, { recibos }) });
  recibos.set(ids[0], async (g) => ({ ...g, firma: (g.firma[0] === '0' ? '1' : '0') + g.firma.slice(1) }));
  recibos.set(ids[1], async (x) => ({ ...x, t: '2030-01-01T00:00:00.000Z' }));
  const informe = await S.sincronizar(eje);
  assert.deepEqual(informe.orden.encadenados, []);
  assert.deepEqual(informe.orden.avisos.map((a) => a.motivo), ['el recibo de orden no vale: la firma no es del emisor', 'el recibo de orden no vale: el id no es el de su cuerpo']);
  assert.deepEqual([S.reciboDeOrden(ids[0]), S.reciboDeOrden(ids[1]), S.orden()], [undefined, undefined, 'sin firmar']);
  // El siguiente, honesto: encadena (sin tener el anterior no se puede comprobar el eslabón, y no se inventa nada).
  const y = await escribir(9);
  const i2 = await S.sincronizar(eje);
  assert.deepEqual(i2.orden.encadenados, [y]);
  assert.equal(S.orden(), 'firmado');
});

test('un «anterior» que no cuadra se detecta: contradicción guardada, la sincronización sigue y el libro no cambia; no se va sola y sobrevive a serializar', async () => {
  const { s, claveLectura, A, eje, ids, escribir } = await montar({ n: 1, nombre: 'anterior' });
  const recibos = new Map();
  const B = Sincronia.restaurar(A.serializar(), { claveLectura, fetch: mentiroso(s, { recibos }) });
  const y = await escribir(5);
  // El servicio da el recibo de y con orden 2 pero con «anterior» = el del génesis (el del 1 es el bueno).
  recibos.set(y, (honesto) => refirmar(s, honesto, { orden: 2, anterior: A.reciboDeOrden(ids[0]).id }));
  const informe = await B.sincronizar(eje);
  assert.deepEqual(informe.errores, []);
  assert.ok(eje.eventos.has(y), 'el libro sigue: y entró');
  assert.equal(informe.orden.fraudes.length, 1);
  const f = informe.orden.fraudes[0];
  assert.deepEqual([f.clase, f.motivo], [CLASE_DE_ORDEN_DOBLE, 'un «anterior» que no es el recibo de ese sitio']);
  assert.ok(ordenDoble(f.a, f.b) && ordenDoble(f), 'la prueba vale sola (los dos recibos enteros)');
  assert.equal(B.orden(), 'contradicho');
  assert.equal(B.reciboDeOrden(y), undefined, 'el que contradice no cambia la cadena');
  // La carta: el aviso que no se va solo, con los dos recibos para copiarlos.
  const linea = lineaDeEstado(B, await B.sincronizar(eje));
  assert.equal(B.fraudesDeOrden().length, 1, 'no se va sola');
  assert.deepEqual([linea.orden.estado, linea.orden.texto], ['contradicho', 'El servidor de este libro ha firmado dos órdenes distintos. Guarda una copia y no te fíes de él.']);
  assert.deepEqual(JSON.parse(linea.orden.pruebas).map((p) => [p.a.id, p.b.id]), [[f.a.id, f.b.id]]);
  const h = htmlSincronia(linea);
  assert.ok(h.includes('role="alert" data-orden-fraude') && h.includes('data-orden-copiar') && h.includes(texto('ordenContradicho')) && h.includes(f.b.firma), 'el aviso y los dos recibos, en la línea');
  assert.equal(lineaDeEstado(A, { pendientes: [], errores: [] }).orden, undefined, 'con «firmado», nada nuevo');
  const B2 = Sincronia.restaurar(JSON.parse(JSON.stringify(B.serializar())), { claveLectura, fetch: fetchDe(s) });
  assert.deepEqual([B2.orden(), B2.fraudesDeOrden()], ['contradicho', B.fraudesDeOrden()]);
});

test('dos clientes a los que el servicio da órdenes distintos: cada uno ve una cadena coherente, y juntando sus recibos está la prueba de contradicción', async () => {
  const { s, nombre, claveLectura, A, ids } = await montar({ n: 2, nombre: 'dos' });
  const [g, x, y] = ids;
  // A B le sirve y antes que x, con su cadena firmada: g (0), y (1), x (2).
  const h = await Promise.all(ids.map((id) => sobreHonesto(s, nombre, claveLectura, id)));
  const yB = await refirmar(s, h[2], { orden: 1, anterior: h[0].id });
  const xB = await refirmar(s, h[1], { orden: 2, anterior: yB.id });
  const servir = (id, o) => (id === x ? 3 : id === y ? 2 : o);
  const B = new Sincronia({ url: BASE, eje: nombre, claveLectura, fetch: mentiroso(s, { servir, recibos: new Map([[x, xB], [y, yB]]) }) });
  const informe = await B.sincronizar(null);
  assert.deepEqual(informe.errores, []);
  assert.deepEqual([A.orden(), B.orden()], ['firmado', 'firmado'], 'cada uno, por su lado, no ve nada raro');
  assert.deepEqual(informe.orden.avisos, [], 'lo servido a B cuadra con lo firmado para B');
  // Juntando los recibos de los dos: el mismo orden con dos registros, y el mismo registro con dos órdenes.
  const p1 = ordenDoble(A.reciboDeOrden(x), B.reciboDeOrden(y));
  assert.deepEqual([p1.clase, p1.motivo, p1.ordenes, p1.registros], [CLASE_DE_ORDEN_DOBLE, 'el mismo orden con dos registros', ['1', '1'], [x, y]]);
  assert.equal(ordenDoble(A.reciboDeOrden(x), B.reciboDeOrden(x)).motivo, 'el mismo registro con dos órdenes');
  assert.ok(ordenDoble({ a: p1.a, b: p1.b }), 'la prueba guardada se vuelve a comprobar');
  assert.equal(ordenDoble(p1.a, p1.b).id, ordenDoble(p1.b, p1.a).id, 'el id no depende del orden de los dos');
  // Dos recibos iguales (el génesis, el mismo para los dos) no son contradicción; uno tocado no es prueba.
  assert.equal(ordenDoble(A.reciboDeOrden(g), B.reciboDeOrden(g)), null);
  assert.equal(ordenDoble(A.reciboDeOrden(x), { ...B.reciboDeOrden(y), t: '2030-01-01T00:00:00.000Z' }), null);
});

test('el «orden» firmado que no va en el orden servido se avisa (el servidor no sirve en el orden que firma)', async () => {
  const { s, nombre, claveLectura, ids } = await montar({ n: 2, nombre: 'descuadre' });
  const [, x, y] = ids;
  const servir = (id, o) => (id === x ? 3 : id === y ? 2 : o); // sirve y antes que x, pero los recibos son los de verdad
  const C = new Sincronia({ url: BASE, eje: nombre, claveLectura, fetch: mentiroso(s, { servir }) });
  const informe = await C.sincronizar(null);
  assert.deepEqual(informe.orden.encadenados.length, 3);
  assert.ok(informe.orden.avisos.length >= 1 && informe.orden.avisos.every((a) => a.motivo === 'el servidor no sirve en el orden que firma'));
  assert.deepEqual(informe.orden.avisos.map((a) => [a.id, a.firmado, a.servido]).find(([id]) => id === x), [x, 1, 3]);
  assert.deepEqual(informe.orden.fraudes, [], 'no es una contradicción firmada: lo servido no lleva firma');
});

test('el estado del orden sobrevive a serializar/restaurar; la cadena se guarda compacta (se mide) y se rehace exacta', async (t) => {
  const { s, claveLectura, A, ids } = await montar({ n: 6, nombre: 'guardar' });
  const datos = JSON.parse(JSON.stringify(A.serializar()));
  const R = Sincronia.restaurar(datos, { claveLectura, fetch: fetchDe(s) });
  assert.equal(R.orden(), 'firmado');
  for (const id of ids) assert.deepEqual(R.reciboDeOrden(id), A.reciboDeOrden(id));
  const entero = ids.reduce((n, id) => n + JSON.stringify(A.reciboDeOrden(id)).length, 0) / ids.length;
  const guardado = (JSON.stringify(datos.orden).length - JSON.stringify(datos.orden.plantilla).length) / ids.length;
  t.diagnostic('recibo entero: ' + Math.round(entero) + ' B por registro; guardado compacto: ' + Math.round(guardado) + ' B por registro (más una plantilla de ' + JSON.stringify(datos.orden.plantilla).length + ' B)');
  assert.ok(guardado < entero * 0.6, 'la forma compacta ahorra');
  // Un «sin firmar» también se guarda; lo de antes del orden firmado (sin `orden`) se restaura sin cadena.
  const { orden, ...antes } = datos;
  assert.ok(orden);
  assert.equal(Sincronia.restaurar(antes, { claveLectura, fetch: fetchDe(s) }).orden(), 'sin firmar');
});

test('el remate: la puerta mete en su lote el id del último recibo encadenado; el cliente pide su prueba (un id por pasada, sin pedir sellar nada) y la guarda', async () => {
  const pruebas = new Map();
  const llamadas = { sellar: [], prueba: [] };
  let altura = 0;
  const sellador = {
    async sellar(ids) { llamadas.sellar.push([...ids]); for (const id of ids) if (!pruebas.has(id)) pruebas.set(id, { pendiente: true }); return { pendiente: true }; },
    minar() { altura += 1; for (const [id, p] of pruebas) if (p.pendiente) pruebas.set(id, { altura, hash: 'ab'.repeat(32), instante: '2026-11-10T11:00:00.000Z', lote: 'cd'.repeat(32), prueba: { via: 'de mentira' } }); },
    async prueba(id) { llamadas.prueba.push(id); return pruebas.get(id) ?? null; },
    async verificar(evento, p) { return p && !p.pendiente && pruebas.has(typeof evento === 'string' ? evento : evento?.id) ? { ok: true } : { ok: false, motivo: 'no' }; },
  };
  const { s, claveLectura, A, eje, ids, escribir } = await montar({ n: 2, nombre: 'remate', sellador, lote: 1000, selloCliente: selloCon(sellador) });
  const reciboIds = () => new Set(eje.orden.map((id) => A.reciboDeOrden(id)?.id).filter(Boolean));
  const deRecibo = (lista) => lista.filter((id) => reciboIds().has(id));
  assert.equal(deRecibo(llamadas.prueba).length, 1, 'primera pasada: un id de recibo pedido');
  assert.deepEqual(llamadas.sellar.flat().filter((id) => reciboIds().has(id)), [], 'el cliente no manda a sellar ningún recibo');
  assert.equal(A.ordenSellado(), null);
  // La puerta cierra su lote (con el último recibo del eje) y se mina.
  await s.sellarPendientes();
  const ultimo = A.reciboDeOrden(ids[2]).id;
  assert.ok(llamadas.sellar.at(-1).includes(ultimo), 'el lote de la puerta lleva el id del último recibo encadenado');
  sellador.minar();
  const antes = llamadas.prueba.length;
  await A.sincronizar(eje);
  assert.equal(deRecibo(llamadas.prueba.slice(antes)).length, 1, 'un id por pasada');
  const sellado = A.ordenSellado();
  assert.deepEqual([sellado.orden, sellado.recibo, sellado.prueba.altura], [2, ultimo, 1]);
  // Sin recibos nuevos no se pide más; uno nuevo, sin sellar aún, no quita lo sellado.
  const otra = llamadas.prueba.length;
  await A.sincronizar(eje);
  assert.equal(deRecibo(llamadas.prueba.slice(otra)).length, 0);
  await escribir(7);
  await A.sincronizar(eje);
  assert.deepEqual(A.ordenSellado().orden, 2);
  assert.deepEqual(Sincronia.restaurar(JSON.parse(JSON.stringify(A.serializar())), { fetch: fetchDe(s) }).ordenSellado(), A.ordenSellado());
  // Un fallo del sello no rompe nada.
  const roto = Sincronia.restaurar(A.serializar(), { claveLectura, fetch: fetchDe(s), sello: { sellar: async () => ({}), prueba: async () => { throw new Error('sin red hacia el sello'); }, verificar: async () => ({ ok: false }) } });
  const i = await roto.sincronizar(eje);
  assert.deepEqual(i.errores, []);
  assert.ok(i.orden.errores.some((e) => /sin red hacia el sello/.test(e.motivo)));
});

test('la cadena de la simulación se rehace igual al arrancar desde el archivo del relé', async () => {
  const archivo = join(dir, 'libro.jsonl');
  const { s, nombre, claveLectura, A, eje, ids, escribir } = await montar({ n: 1, nombre: 'archivo', archivo });
  assert.deepEqual(s.rele.ultimoEslabon(nombre), { orden: 1, id: A.reciboDeOrden(ids[1]).id });
  const s2 = crearServicio({ archivo });
  await s2.abrir();
  assert.deepEqual(s2.rele.ultimoEslabon(nombre), s.rele.ultimoEslabon(nombre));
  const A2 = Sincronia.restaurar(A.serializar(), { claveLectura, fetch: fetchDe(s2) });
  const y = await escribir(3);
  const informe = await A2.sincronizar(eje);
  assert.deepEqual([informe.orden.encadenados, informe.orden.avisos, A2.orden()], [[y], [], 'firmado']);
  const c = comprobarRecibo(A2.reciboDeOrden(y));
  assert.deepEqual([c.orden, c.anterior], ['2', A.reciboDeOrden(ids[1]).id]);
});
