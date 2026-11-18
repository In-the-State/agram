// La tanda en los servidores de AGRAM (agram-equipo/CONTRATO_TANDA.md, 18-11): POST /eventos/tanda { eje, eventos },
// todos o ninguno, con órdenes consecutivos, en el servidor de prueba (servidor/prueba, el api.js de la función de
// Supabase con el almacén en memoria) y en la simulación de AARPIA (servidor/sim/aarpia, el mismo api.js sobre el relé).
// La marca, la forma en orden viendo los anteriores, los topes, los duplicados, el 409, el 400 del suelto con marca, el
// error que lanza un almacén con autoridad y lo que sirve GET /eventos.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, appendFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { arrancar, almacenEnMemoria } from '../servidor/prueba/servidor.mjs';
import { arrancar as arrancarSim } from '../servidor/sim/aarpia/servidor.mjs';
import { crearServicio } from '../servidor/sim/aarpia/src/servicio.js';
import { Autoridad, KIND_RECHAZO } from '../servidor/sim/aarpia/src/autoridad.js';
import { Rele, KIND_EVENTO } from '../servidor/sim/aarpia/src/rele.js';
import { envolver } from '../servidor/sim/aarpia/src/sobre.js';
import { generarClaves as clavesNostr, aBytes, aHex } from '../servidor/sim/aarpia/src/nostr.js';
import { crearApi, comprobarMarcaDeTanda, LIMITE_CUERPO, LIMITE_TANDA } from '../servidor/supabase/funciones/eventos/api.js';
import * as criptoNucleo from '../servidor/prueba/cripto-nucleo.mjs';
import { Eje } from '../src/eje.js';
import { generarClaves, firmar } from '../src/autoridad.js';
import { marcarTanda } from '../src/evento.js';
import { quemaDelCoste } from '../src/escritura.js';
import { canonico, cuerpo, hash, RAIZ } from '../servidor/supabase/funciones/eventos/verificar.js';
import { schnorr } from '../servidor/supabase/funciones/eventos/noble-secp256k1.js';

const T = (m) => '2026-11-18T09:' + String(m).padStart(2, '0') + ':00Z';

/** Un registro firmado, hecho a mano (solo forma: los servidores no juzgan reglas, así que no hace falta que mueva tokens). */
async function registro({ autor = 'vg', privada, sobre = null, t = T(1), payload = ['x'], contexto = {} }) {
  const ev = { autor, sobre, en: RAIZ, t, movimientos: [], payload, contexto };
  ev.id = await hash(canonico(cuerpo(ev)));
  ev.firmante = autor;
  ev.firma = aHex(schnorr.sign(aBytes(ev.id), aBytes(privada)));
  return ev;
}

/**
 * Una tanda bien marcada: cada miembro { autor?, privada, sobre?, payload?, contexto? } recibe contexto.tanda = { n, de,
 * anterior } (anterior: el id del miembro de antes). `de` se puede forzar para las pruebas de la marca.
 */
async function tanda(miembros, { de = miembros.length } = {}) {
  const hechos = [];
  for (const [k, m] of miembros.entries()) {
    const marca = k === 0 ? { n: 1, de } : { n: k + 1, de, anterior: hechos[k - 1].id };
    hechos.push(await registro({ ...m, payload: m.payload ?? ['miembro ' + (k + 1)], contexto: { ...(m.contexto ?? {}), tanda: marca } }));
  }
  return hechos;
}

/** Un libro con su génesis firmado (Eje.genesis del núcleo) y la clave de vg. */
async function libro() {
  const claves = await generarClaves();
  const eje = await Eje.genesis({ identidad: 'vg', foco: ['tanda'], t: T(0), clave: claves.publica, privada: claves.privada, exigirFirmas: true });
  return { claves, eje, genesis: eje.obtener(eje.genesisId) };
}

let reloj = Date.parse('2026-11-18T10:00:00Z');
/**
 * Una tanda que el núcleo admite de verdad (para la autoridad): cada miembro paga el coste de escribir, cuelga del
 * génesis y la marca la pone marcarTanda del núcleo; se firma después de marcar (el id firmado es el definitivo).
 */
async function validos({ claves, eje, genesis }, n, etiqueta = 'válido') {
  const candidatos = [];
  for (let k = 0; k < n; k++) {
    const payload = [etiqueta + ' ' + (k + 1) + ' ' + reloj];
    candidatos.push({ autor: 'vg', sobre: genesis.id, t: new Date((reloj += 1000)).toISOString(), movimientos: [quemaDelCoste('vg', payload, 'minuto', { eje })], payload });
  }
  const marcados = await marcarTanda(candidatos);
  return Promise.all(marcados.map((ev) => firmar(ev, claves.privada)));
}

/** Las llamadas HTTP a un servidor { url }: crear un eje, subir uno, subir una tanda, bajar. */
function cliente(servidor) {
  const post = (camino, cuerpo, cabeceras = {}) => fetch(servidor.url + camino, { method: 'POST', headers: { 'Content-Type': 'application/json', ...cabeceras }, body: typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo) });
  const leer = async (r) => ({ estado: r.status, cuerpo: await r.json() });
  return {
    async crear(eje) {
      const { claveLectura } = await (await post('/eventos/ejes', { eje }, { 'X-Crear-Ejes': 'prueba' })).json();
      const cab = { 'X-Clave-Lectura': claveLectura };
      return {
        cab,
        uno: async (evento) => leer(await post('/eventos', { eje, evento }, cab)),
        tanda: async (eventos, cabeceras = cab) => leer(await post('/eventos/tanda', { eje, eventos }, cabeceras)),
        crudo: (cuerpo) => post('/eventos/tanda', cuerpo, cab),
        bajar: async (q = '') => (await fetch(servidor.url + '/eventos?eje=' + eje + q, { headers: cab })).json(),
        recibo: async (id) => leer(await fetch(servidor.url + '/eventos/recibo?eje=' + eje + '&id=' + id, { headers: cab })),
      };
    },
  };
}

const consecutivos = (ordenes) => ordenes.every((o, k) => k === 0 || o === ordenes[k - 1] + 1);

test('la marca: de 2 a 32 contando los miembros reales, n su sitio, anterior el id del de antes y solo falta en el 1, sin más claves', async () => {
  const { claves } = await libro();
  const p = claves.privada;
  const [a, b, c] = await tanda([{ privada: p }, { privada: p }, { privada: p }]);
  assert.equal(comprobarMarcaDeTanda([a, b, c]), null);
  assert.equal(comprobarMarcaDeTanda([a, b]).indice, null, 'dice de = 3 y llegan 2: no se fía de `de`; el fallo es de la lista entera');
  assert.match(comprobarMarcaDeTanda([a, b]).error, /de = 3 y la tanda trae 2/);
  assert.equal(comprobarMarcaDeTanda([]).indice, null, 'vacía');
  assert.equal(comprobarMarcaDeTanda([a, c, b]).indice, 1, 'fuera de su sitio');
  assert.equal(comprobarMarcaDeTanda([a]).indice, null, 'no hay tandas de uno');
  assert.equal(comprobarMarcaDeTanda('x').indice, null);
  const [x, y] = await tanda([{ privada: p }, { privada: p }]);
  const sinAnterior = await registro({ privada: p, contexto: { tanda: { n: 2, de: 2 } } });
  assert.equal(comprobarMarcaDeTanda([x, sinAnterior]).indice, 1);
  const conAnterior = await registro({ privada: p, contexto: { tanda: { n: 1, de: 2, anterior: y.id } } });
  assert.equal(comprobarMarcaDeTanda([conAnterior, y]).indice, 0, 'el 1 no lleva anterior');
  const otraClave = await registro({ privada: p, contexto: { tanda: { n: 1, de: 2, grupo: 'a' } } });
  assert.match(comprobarMarcaDeTanda([otraClave, y]).error, /grupo/);
  const suelto = await registro({ privada: p });
  assert.equal(comprobarMarcaDeTanda([x, suelto]).indice, 1, 'un miembro sin marca');
  assert.equal(comprobarMarcaDeTanda([x, { ...y, id: 'no' }]).indice, 1);
  // Un solo autor: el índice es el del primer miembro que no es del autor del miembro 1.
  const ana = await generarClaves();
  const mezcla = await tanda([{ privada: p }, { privada: p }, { autor: 'ana', privada: ana.privada }, { privada: p }]);
  const fallo = comprobarMarcaDeTanda(mezcla);
  assert.equal(fallo.indice, 2);
  assert.match(fallo.error, /otro autor/);
  // De un miembro: el de del 2 dice 4 en una de 3 es de la lista entera (null), como el largo.
  const [d1, d2, d3] = await tanda([{ privada: p }, { privada: p }, { privada: p }]);
  const d2mal = await registro({ privada: p, payload: ['d2'], contexto: { tanda: { n: 2, de: 4, anterior: d1.id } } });
  assert.equal(comprobarMarcaDeTanda([d1, d2mal, d3]).indice, null);
});

describe('servidor de prueba (servidor/prueba: el api.js de Supabase en memoria)', () => {
  let servidor;
  let api;
  before(async () => {
    servidor = await arrancar({ puerto: 0, secreto: 'prueba' });
    api = cliente(servidor);
  });
  after(async () => servidor.cerrar());

  test('una tanda válida de tres: 201 { tanda, eventos } con órdenes consecutivos, un recibo por miembro; repetida, 200 duplicado con los mismos órdenes', async () => {
    const e = await api.crear('tres');
    const { claves, genesis } = await libro();
    assert.equal((await e.uno(genesis)).estado, 201);
    const miembros = await tanda([{ privada: claves.privada, sobre: genesis.id }, { privada: claves.privada, sobre: genesis.id }, { privada: claves.privada, sobre: genesis.id }]);
    const r = await e.tanda(miembros);
    assert.equal(r.estado, 201);
    assert.deepEqual(Object.keys(r.cuerpo), ['tanda', 'eventos']);
    assert.equal(r.cuerpo.tanda, miembros[0].id, 'la tanda es el id de su miembro 1');
    assert.deepEqual(r.cuerpo.eventos.map((x) => x.id), miembros.map((m) => m.id));
    assert.deepEqual(Object.keys(r.cuerpo.eventos[0]), ['id', 'orden', 'recibido']);
    const ordenes = r.cuerpo.eventos.map((x) => x.orden);
    assert.ok(consecutivos(ordenes), 'órdenes seguidos: ' + ordenes);
    // Lo guardado es lo subido, por llegada, y GET /eventos lo sirve igual.
    const bajado = await e.bajar();
    assert.deepEqual(bajado.eventos.map((x) => [x.orden, x.evento.id]), [[ordenes[0] - 1, genesis.id], ...miembros.map((m, k) => [ordenes[k], m.id])]);
    assert.deepEqual(bajado.eventos[1].evento, JSON.parse(JSON.stringify(miembros[0])));
    // Un recibo por miembro (el de prueba), todos.
    for (const m of miembros) assert.equal((await e.recibo(m.id)).estado, 200);
    const otra = await e.tanda(miembros);
    assert.equal(otra.estado, 200);
    assert.deepEqual(otra.cuerpo, { ...r.cuerpo, duplicado: true });
    assert.equal(servidor.almacen.filas('tres').length, 4, 'el reintento no guarda nada');
  });

  test('un miembro con firma mala: su estado con { error, indice, id } y NADA guardado; tampoco con un autor sin alta (403)', async () => {
    const e = await api.crear('firma');
    const { claves, genesis } = await libro();
    await e.uno(genesis);
    const ajena = await generarClaves();
    const miembros = await tanda([{ privada: claves.privada, sobre: genesis.id }, { privada: ajena.privada, sobre: genesis.id }, { privada: claves.privada, sobre: genesis.id }]);
    const r = await e.tanda(miembros);
    assert.equal(r.estado, 400);
    assert.deepEqual(Object.keys(r.cuerpo), ['error', 'indice', 'id']);
    assert.equal(r.cuerpo.indice, 1);
    assert.equal(r.cuerpo.id, miembros[1].id);
    assert.match(r.cuerpo.error, /firma inválida/);
    assert.equal(servidor.almacen.filas('firma').length, 1, 'ni el miembro 1, que estaba bien');
    const ana = await generarClaves();
    const sinAlta = await tanda([{ autor: 'ana', privada: ana.privada, sobre: genesis.id }, { autor: 'ana', privada: ana.privada, sobre: genesis.id }]);
    const r2 = await e.tanda(sinAlta);
    assert.deepEqual([r2.estado, r2.cuerpo.indice, r2.cuerpo.id], [403, 0, sinAlta[0].id]);
    // Autores mezclados: fallo de marca, 400 con el primero que no es del autor del miembro 1.
    const mezcla = await tanda([{ privada: claves.privada, sobre: genesis.id }, { autor: 'ana', privada: ana.privada, sobre: genesis.id }]);
    const r4 = await e.tanda(mezcla);
    assert.deepEqual([r4.estado, r4.cuerpo.indice, r4.cuerpo.id], [400, 1, mezcla[1].id]);
    assert.equal(servidor.almacen.filas('firma').length, 1);
    // Un miembro con el cuerpo tocado (el id ya no es su hash).
    const tocada = await tanda([{ privada: claves.privada, sobre: genesis.id }, { privada: claves.privada, sobre: genesis.id }]);
    const r3 = await e.tanda([tocada[0], { ...tocada[1], payload: ['otra cosa'] }]);
    assert.deepEqual([r3.estado, r3.cuerpo.indice], [400, 1]);
    assert.match(r3.cuerpo.error, /el id no corresponde al cuerpo/);
  });

  test('en orden y viendo los anteriores: la tanda que abre un eje vacío (génesis el primero, y su alta vale para el miembro 2)', async () => {
    const e = await api.crear('vacio');
    const vg = await generarClaves();
    const genesis = { privada: vg.privada, payload: [], contexto: { genesis: true, claves: { vg: vg.publica } } };
    // El génesis solo vale para el primero: un eje vacío no admite otra cosa delante.
    const alReves = await tanda([{ privada: vg.privada, sobre: 'a'.repeat(64) }, genesis]);
    let r = await e.tanda(alReves);
    assert.deepEqual([r.estado, r.cuerpo.indice], [400, 0]);
    assert.match(r.cuerpo.error, /vacío: solo se admite su génesis/);
    const dosGenesis = await tanda([genesis, { ...genesis, payload: ['otro'] }]);
    r = await e.tanda(dosGenesis);
    assert.deepEqual([r.estado, r.cuerpo.indice], [400, 1]);
    assert.match(r.cuerpo.error, /ya tiene génesis/);
    assert.equal(servidor.almacen.filas('vacio').length, 0);
    // El génesis declara la clave de vg: los miembros 2 y 3, de vg, la ven aunque el eje esté vacío.
    const miembros = await tanda([
      { ...genesis, payload: ['génesis en tanda'] },
      { privada: vg.privada, sobre: null, payload: ['dos'] },
      { privada: vg.privada, sobre: null, payload: ['tres'] },
    ]);
    r = await e.tanda(miembros);
    assert.equal(r.estado, 201, JSON.stringify(r.cuerpo));
    assert.deepEqual(servidor.almacen.filas('vacio').map((f) => f.id), miembros.map((m) => m.id));
  });

  test('parte de sus ids ya guardados: 409 { error, indice, id } y nada más entra', async () => {
    const e = await api.crear('partida');
    const { claves, genesis } = await libro();
    await e.uno(genesis);
    const miembros = await tanda([{ privada: claves.privada, sobre: genesis.id }, { privada: claves.privada, sobre: genesis.id }, { privada: claves.privada, sobre: genesis.id }]);
    // No debería poder pasar (un miembro nunca entra suelto, ni por el almacén); se fuerza con insertarTanda para verlo.
    const m = miembros[1];
    await servidor.almacen.insertarTanda('partida', [{ id: m.id, autor: m.autor, firma: m.firma, cuerpo: m }]);
    const r = await e.tanda(miembros);
    assert.equal(r.estado, 409);
    assert.deepEqual([r.cuerpo.indice, r.cuerpo.id], [1, m.id]);
    assert.match(r.cuerpo.error, /recompuesta/);
    assert.equal(servidor.almacen.filas('partida').length, 2);
    // Sus ids ya están todos pero no seguidos (algo de otro en medio): tampoco es la misma tanda; 409 con el primero.
    const [p1, p2] = await tanda([{ privada: claves.privada, sobre: genesis.id, payload: ['p1'] }, { privada: claves.privada, sobre: genesis.id, payload: ['p2'] }]);
    await servidor.almacen.insertarTanda('partida', [{ id: p1.id, autor: 'vg', firma: p1.firma, cuerpo: p1 }]);
    const entre = await registro({ privada: claves.privada, sobre: genesis.id, payload: ['en medio'] });
    assert.equal((await e.uno(entre)).estado, 201);
    await servidor.almacen.insertarTanda('partida', [{ id: p2.id, autor: 'vg', firma: p2.firma, cuerpo: p2 }]);
    const r2 = await e.tanda([p1, p2]);
    assert.deepEqual([r2.estado, r2.cuerpo.indice, r2.cuerpo.id], [409, 0, p1.id]);
  });

  test('el alta guardada gana: un miembro anterior que declara otra clave para un autor con alta no la cambia', async () => {
    const e = await api.crear('alta');
    const { claves, genesis } = await libro();
    await e.uno(genesis);
    const otra = await generarClaves();
    // El 1 (de vg, firmado con su clave guardada) declara para vg otra clave; el 2 firma con esa otra: no vale.
    const conOtra = await tanda([{ privada: claves.privada, sobre: genesis.id, contexto: { claves: { vg: otra.publica } } }, { privada: otra.privada, sobre: genesis.id }]);
    let r = await e.tanda(conOtra);
    assert.deepEqual([r.estado, r.cuerpo.indice, r.cuerpo.id], [400, 1, conOtra[1].id]);
    assert.match(r.cuerpo.error, /firma inválida/);
    // Con la guardada, entra (la declaración del 1 no cuenta para quien ya tiene alta).
    const conGuardada = await tanda([{ privada: claves.privada, sobre: genesis.id, contexto: { claves: { vg: otra.publica } } }, { privada: claves.privada, sobre: genesis.id }]);
    r = await e.tanda(conGuardada);
    assert.equal(r.estado, 201, JSON.stringify(r.cuerpo));
  });

  test('POST /eventos con un registro que lleva contexto.tanda: 400, también si es de una tanda ya guardada', async () => {
    const e = await api.crear('suelto');
    const { claves, genesis } = await libro();
    await e.uno(genesis);
    const miembros = await tanda([{ privada: claves.privada, sobre: genesis.id }, { privada: claves.privada, sobre: genesis.id }]);
    let r = await e.uno(miembros[0]);
    assert.equal(r.estado, 400);
    assert.match(r.cuerpo.error, /no entra suelto/);
    assert.equal(servidor.almacen.filas('suelto').length, 1);
    assert.equal((await e.tanda(miembros)).estado, 201);
    r = await e.uno(miembros[1]);
    assert.equal(r.estado, 400, 'ni como duplicado');
  });

  test('tandas de 1 y de 33: 400, nada guardado; el cuerpo entero por encima del tope: 413; sin clave: 401; GET: 405', async () => {
    const e = await api.crear('tamano');
    const { claves, genesis } = await libro();
    await e.uno(genesis);
    const uno = await tanda([{ privada: claves.privada, sobre: genesis.id }]);
    let r = await e.tanda(uno);
    assert.deepEqual([r.estado, r.cuerpo.indice], [400, null]);
    const treintaYTres = await tanda(Array.from({ length: 33 }, () => ({ privada: claves.privada, sobre: genesis.id })));
    r = await e.tanda(treintaYTres);
    assert.deepEqual([r.estado, r.cuerpo.indice], [400, null]);
    assert.match(r.cuerpo.error, /de 2 a 32 miembros; llegan 33/);
    // 32 sí.
    r = await e.tanda(treintaYTres.slice(0, 32).map((m) => m)); // su marca dice de = 33: no vale
    assert.equal(r.estado, 400);
    const treintaYDos = await tanda(Array.from({ length: 32 }, () => ({ privada: claves.privada, sobre: genesis.id })));
    r = await e.tanda(treintaYDos);
    assert.equal(r.estado, 201);
    assert.ok(consecutivos(r.cuerpo.eventos.map((x) => x.orden)));
    // Topes: cada miembro dentro de 256 KiB (413 con su índice); la petición entera, 1 MiB (413 con null).
    const medianos = await tanda([{ privada: claves.privada, sobre: genesis.id, payload: ['x'.repeat(LIMITE_CUERPO / 2)] }, { privada: claves.privada, sobre: genesis.id, payload: ['y'.repeat(LIMITE_CUERPO / 2)] }]);
    r = await e.tanda(medianos);
    assert.equal(r.estado, 201, 'dos de 128 KiB: la petición pasa de 256 KiB y cabe en 1 MiB');
    const unoGrande = await tanda([{ privada: claves.privada, sobre: genesis.id, payload: ['a'] }, { privada: claves.privada, sobre: genesis.id, payload: ['z'.repeat(LIMITE_CUERPO)] }]);
    r = await e.tanda(unoGrande);
    assert.deepEqual([r.estado, r.cuerpo.indice, r.cuerpo.id], [413, 1, unoGrande[1].id], 'un miembro se pasa: su índice');
    const cuarto = Math.floor(LIMITE_TANDA / 4);
    const grandes = await tanda(Array.from({ length: 5 }, (_, k) => ({ privada: claves.privada, sobre: genesis.id, payload: [String(k).repeat(cuarto - 2000)] })));
    r = await e.tanda(grandes);
    assert.deepEqual([r.estado, r.cuerpo.indice, r.cuerpo.id], [413, null, null], 'la petición entera pasa de 1 MiB');
    r = await e.tanda(uno, {});
    assert.deepEqual(r, { estado: 401, cuerpo: { error: 'clave de lectura ausente o incorrecta', indice: null, id: null } });
    assert.equal((await e.crudo('{no')).status, 400);
    assert.equal((await fetch(servidor.url + '/eventos/tanda?eje=tamano', { headers: e.cab })).status, 405);
    assert.equal(servidor.almacen.filas('tamano').length, 35);
  });

  test('GET /eventos no cambia (contrato, «Bajar»): una página puede cortar la tanda y la siguiente trae el resto; un fallo no deja nada que bajar', async () => {
    const e = await api.crear('bajar');
    const { claves, genesis } = await libro();
    await e.uno(genesis);
    const miembros = await tanda([{ privada: claves.privada, sobre: genesis.id }, { privada: claves.privada, sobre: genesis.id }, { privada: claves.privada, sobre: genesis.id }]);
    const malos = await tanda([{ privada: claves.privada, sobre: genesis.id }, { privada: (await generarClaves()).privada, sobre: genesis.id }]);
    assert.equal((await e.tanda(malos)).estado, 400);
    assert.deepEqual((await e.bajar()).eventos.map((x) => x.evento.id), [genesis.id], 'del fallo, nada');
    await e.tanda(miembros);
    const p1 = await e.bajar('&cuantos=2');
    assert.deepEqual(p1.eventos.map((x) => x.evento.id), [genesis.id, miembros[0].id]);
    assert.notEqual(p1.siguiente, null);
    const p2 = await e.bajar('&desde=' + p1.siguiente);
    assert.deepEqual(p2.eventos.map((x) => x.evento.id), [miembros[1].id, miembros[2].id]);
    assert.equal(p2.siguiente, null);
  });

  test('el tope por minuto: la tanda gasta `de` escrituras solo si pasa la forma y se va a guardar; si no caben todas, 429 con null y no entra ninguna', async () => {
    let ahora = Date.parse('2026-11-18T15:00:00Z');
    const s = await arrancar({ puerto: 0, secreto: 'prueba', ahora: () => new Date(ahora), escriturasPorMinuto: 4 });
    try {
      const e = await cliente(s).crear('limite');
      const { claves, genesis } = await libro();
      assert.equal((await e.uno(genesis)).estado, 201); // 1 de 4
      const de = (n) => tanda(Array.from({ length: n }, (_, k) => ({ privada: claves.privada, sobre: genesis.id, payload: ['t' + n + '-' + k + '-' + ahora] })));
      const cuatro = await de(4);
      let r = await e.tanda(cuatro);
      assert.deepEqual([r.estado, r.cuerpo.indice, r.cuerpo.id], [429, null, null]);
      assert.match(r.cuerpo.error, /solo caben 3/);
      assert.equal(s.almacen.filas('limite').length, 1, 'ni los tres que cabían');
      // Rechazadas por la forma o por la marca: no gastan (siguen quedando 3).
      const malas = await tanda([{ privada: claves.privada, sobre: genesis.id, payload: ['m1'] }, { privada: (await generarClaves()).privada, sobre: genesis.id, payload: ['m2'] }]);
      for (let i = 0; i < 5; i++) assert.equal((await e.tanda(malas)).estado, 400);
      const tres = await de(3);
      assert.equal((await e.tanda(tres)).estado, 201); // 4 de 4
      // Duplicada: tampoco gasta (y responde aunque el minuto esté lleno).
      for (let i = 0; i < 3; i++) assert.equal((await e.tanda(tres)).estado, 200);
      r = await e.tanda(await de(2));
      assert.deepEqual([r.estado, r.cuerpo.indice], [429, null]);
      // El suelto sigue como hoy: cuenta cada intento con clave buena.
      assert.equal((await e.uno(await registro({ privada: claves.privada, sobre: genesis.id, payload: ['suelto'] }))).estado, 429);
      ahora += 60000;
      assert.equal((await e.tanda(cuatro)).estado, 201, 'el minuto siguiente, entera');
      assert.equal(s.almacen.filas('limite').length, 8);
    } finally {
      await s.cerrar();
    }
  });

  test('con --archivo, la tanda se vuelca entera y sobrevive a reiniciar', async () => {
    const carpeta = mkdtempSync(join(tmpdir(), 'agram-tanda-'));
    const archivo = join(carpeta, 'libro.json');
    try {
      const s1 = await arrancar({ puerto: 0, secreto: 'prueba', archivo });
      const e = await cliente(s1).crear('disco');
      const { claves, genesis } = await libro();
      await e.uno(genesis);
      const miembros = await tanda([{ privada: claves.privada, sobre: genesis.id }, { privada: claves.privada, sobre: genesis.id }]);
      const r = await e.tanda(miembros);
      await s1.cerrar();
      const s2 = await arrancar({ puerto: 0, secreto: 'prueba', archivo });
      assert.deepEqual(s2.almacen.filas('disco').map((f) => [f.orden, f.id]).slice(1), r.cuerpo.eventos.map((x) => [x.orden, x.id]));
      await s2.cerrar();
    } finally {
      rmSync(carpeta, { recursive: true, force: true });
    }
  });
});

test('un almacén cuyo insertarTanda lanza { estado, indice, id } (la puerta con autoridad): la ruta responde ese estado y { error, indice, id }', async () => {
  const almacen = almacenEnMemoria();
  const llamadas = [];
  let lanzar = null;
  const original = almacen.insertarTanda;
  almacen.insertarTanda = async (eje, filas) => {
    llamadas.push(filas.map((f) => f.id));
    if (lanzar) throw lanzar(filas);
    return original(eje, filas);
  };
  const manejar = crearApi({ almacen, cripto: criptoNucleo, crearEjes: { secreto: 'prueba' } });
  const pedir = async (camino, cuerpo, cab = {}) => {
    const r = await manejar(new Request('http://127.0.0.1' + camino, { method: 'POST', headers: { 'Content-Type': 'application/json', ...cab }, body: JSON.stringify(cuerpo) }));
    return { estado: r.status, cuerpo: await r.json() };
  };
  const { claveLectura } = (await pedir('/eventos/ejes', { eje: 'juez' }, { 'X-Crear-Ejes': 'prueba' })).cuerpo;
  const cab = { 'X-Clave-Lectura': claveLectura };
  const { claves, genesis } = await libro();
  assert.equal((await pedir('/eventos', { eje: 'juez', evento: genesis }, cab)).estado, 201);
  const miembros = await tanda([{ privada: claves.privada, sobre: genesis.id }, { privada: claves.privada, sobre: genesis.id }]);
  lanzar = (filas) => Object.assign(new Error('tanda rechazada: no pasa las reglas'), { estado: 422, indice: 1, id: filas[1].id });
  let r = await pedir('/eventos/tanda', { eje: 'juez', eventos: miembros }, cab);
  assert.deepEqual(r, { estado: 422, cuerpo: { error: 'tanda rechazada: no pasa las reglas', indice: 1, id: miembros[1].id } });
  lanzar = () => Object.assign(new Error('el núcleo de esta puerta aún no trae tandas'), { estado: 501, indice: 0, id: null });
  r = await pedir('/eventos/tanda', { eje: 'juez', eventos: miembros }, cab);
  assert.deepEqual(r, { estado: 501, cuerpo: { error: 'el núcleo de esta puerta aún no trae tandas', indice: 0, id: null } });
  lanzar = () => new Error('se cayó el disco');
  r = await pedir('/eventos/tanda', { eje: 'juez', eventos: miembros }, cab);
  assert.equal(r.estado, 500, 'un error sin estado es un 500, como siempre');
  assert.equal(almacen.filas('juez').length, 1);
  lanzar = null;
  r = await pedir('/eventos/tanda', { eje: 'juez', eventos: miembros }, cab);
  assert.equal(r.estado, 201);
  assert.equal(llamadas.length, 4);
  // insertarTanda que devuelve null (alguna llegó a la vez): si ya están todas, 200 duplicado.
  almacen.insertarTanda = async () => null;
  const otra = await tanda([{ privada: claves.privada, sobre: genesis.id, payload: ['a la vez'] }, { privada: claves.privada, sobre: genesis.id, payload: ['a la vez 2'] }]);
  r = await pedir('/eventos/tanda', { eje: 'juez', eventos: otra }, cab);
  assert.equal(r.estado, 500, 'null sin que estén: no se pudo guardar');
});

describe('simulación de AARPIA (servidor/sim/aarpia: el mismo api.js sobre el relé)', () => {
  /** La décupla del recibo único: { clave: valor } de su par de listas. */
  const pares = (sobre) => Object.fromEntries(sobre.recibo[2].map((k, i) => [k, sobre.recibo[3][i]]));

  test('sin autoridad: 201 con órdenes consecutivos y un 7701 por miembro en órdenes seguidos de la cadena del eje; repetida, 200; un miembro malo no deja nada en el relé', async () => {
    const s = await arrancarSim({ puerto: 0 });
    try {
      const e = await cliente(s).crear('sim');
      const { claves, genesis } = await libro();
      assert.equal((await e.uno(genesis)).estado, 201);
      const malos = await tanda([{ privada: claves.privada, sobre: genesis.id }, { privada: (await generarClaves()).privada, sobre: genesis.id }]);
      const mal = await e.tanda(malos);
      assert.deepEqual([mal.estado, mal.cuerpo.indice, mal.cuerpo.id], [400, 1, malos[1].id]);
      assert.equal(s.servicio.rele.consultar({ kinds: [KIND_EVENTO] }).length, 1, 'en el relé, solo el génesis');
      const miembros = await tanda([{ privada: claves.privada, sobre: genesis.id }, { privada: claves.privada, sobre: genesis.id }, { privada: claves.privada, sobre: genesis.id }]);
      const r = await e.tanda(miembros);
      assert.equal(r.estado, 201, JSON.stringify(r.cuerpo));
      assert.deepEqual(r.cuerpo.eventos.map((x) => [x.id, x.orden]), miembros.map((m, k) => [m.id, k + 2]));
      // Los recibos: uno por miembro, órdenes seguidos de la cadena, cada anterior el id del recibo de antes.
      const recibos = [];
      for (const id of [genesis.id, ...miembros.map((m) => m.id)]) recibos.push((await e.recibo(id)).cuerpo.sobre);
      const cadena = recibos.map(pares);
      assert.deepEqual(cadena.map((c) => c.orden), ['0', '1', '2', '3']);
      for (let k = 1; k < recibos.length; k++) assert.equal(cadena[k].anterior, recibos[k - 1].id);
      const otra = await e.tanda(miembros);
      assert.deepEqual([otra.estado, otra.cuerpo.duplicado], [200, true]);
      assert.deepEqual(otra.cuerpo.eventos, r.cuerpo.eventos);
      assert.equal((await e.uno(miembros[0])).estado, 400, 'suelto, no');
      const bajado = await e.bajar();
      assert.deepEqual(bajado.eventos.map((x) => x.evento.id), [genesis.id, ...miembros.map((m) => m.id)]);
    } finally {
      await s.cerrar();
    }
  });

  /** Un servicio con autoridad, llamado sin red (Request → Response), y su eje `juez` con la clave de lectura. */
  async function conAutoridad(opciones = {}) {
    const s = crearServicio({ autoridad: new Autoridad(), ...opciones });
    if (opciones.archivo) await s.abrir();
    const llamar = async (camino, cuerpo, cab = {}) => {
      const r = await s.manejar(new Request('http://127.0.0.1' + camino, { method: 'POST', headers: { 'Content-Type': 'application/json', ...cab }, body: JSON.stringify(cuerpo) }));
      return { estado: r.status, cuerpo: await r.json() };
    };
    return { s, llamar };
  }

  test('con autoridad, el núcleo de verdad (eje.anadirTanda): una tanda válida entra entera con recibos de aceptación seguidos; una que no pasa las reglas, 422 con su índice, un solo 7703 y nada guardado', async () => {
    const { s, llamar } = await conAutoridad();
    const { claveLectura } = (await llamar('/eventos/ejes', { eje: 'juez' }, { 'X-Crear-Ejes': 'prueba' })).cuerpo;
    const cab = { 'X-Clave-Lectura': claveLectura };
    const lib = await libro();
    assert.equal((await llamar('/eventos', { eje: 'juez', evento: lib.genesis }, cab)).estado, 201);
    const nada = () => s.rele.consultar({ kinds: [KIND_EVENTO] }).length;
    // Bien formados pero sin pagar el coste de escribir: la puerta los deja pasar (forma) y el núcleo no (reglas).
    const sinCoste = await tanda([{ privada: lib.claves.privada, sobre: lib.genesis.id }, { privada: lib.claves.privada, sobre: lib.genesis.id }]);
    let r = await llamar('/eventos/tanda', { eje: 'juez', eventos: sinCoste }, cab);
    assert.equal(r.estado, 422, JSON.stringify(r.cuerpo));
    assert.deepEqual([r.cuerpo.indice, r.cuerpo.id], [0, sinCoste[0].id]);
    assert.match(r.cuerpo.error, /^tanda rechazada: /);
    assert.equal(nada(), 1);
    const rechazos = s.rele.consultar({ kinds: [KIND_RECHAZO] });
    assert.equal(rechazos.length, 1, 'un solo 7703');
    assert.equal(rechazos[0].tags.find((t) => t[0] === 'g')[1], sinCoste[0].id, 'el del miembro que falla');
    // Una tanda que el núcleo admite: 201, órdenes 2, 3, 4, y en el libro de la autoridad.
    const buenos = await validos(lib, 3);
    r = await llamar('/eventos/tanda', { eje: 'juez', eventos: buenos }, cab);
    assert.equal(r.estado, 201, JSON.stringify(r.cuerpo));
    assert.deepEqual(r.cuerpo.eventos.map((x) => x.orden), [2, 3, 4]);
    assert.equal(nada(), 4);
    assert.deepEqual(s.autoridad.ejes.get('juez').orden.slice(-3), buenos.map((b) => b.id));
    for (const b of buenos) assert.ok(s.rele.reciboDe(s.rele.consultar({ kinds: [KIND_EVENTO], '#g': [b.id] })[0].id).tags.some((t) => t[0] === 'nucleo'), 'recibo de aceptación');
    // Repetida: 200 duplicado sin volver a juzgar; suelto con marca: 400 sin juicio ni 7703.
    assert.equal((await llamar('/eventos/tanda', { eje: 'juez', eventos: buenos }, cab)).cuerpo.duplicado, true);
    assert.equal((await llamar('/eventos', { eje: 'juez', evento: buenos[0] }, cab)).estado, 400);
    assert.equal(s.rele.consultar({ kinds: [KIND_RECHAZO] }).length, 1);
  });

  test('con autoridad: el génesis como miembro 1 abre el libro entero o nada; con archivo, la tanda se rehace al reabrir', async () => {
    const carpeta = mkdtempSync(join(tmpdir(), 'agram-autoridad-tanda-'));
    const archivo = join(carpeta, 'libro.jsonl');
    try {
      const { s, llamar } = await conAutoridad({ archivo });
      const { claveLectura } = (await llamar('/eventos/ejes', { eje: 'nuevo' }, { 'X-Crear-Ejes': 'prueba' })).cuerpo;
      const cab = { 'X-Clave-Lectura': claveLectura };
      const claves = await generarClaves();
      const eje = await Eje.genesis({ identidad: 'vg', foco: ['génesis en tanda'], t: T(0), clave: claves.publica, privada: claves.privada, exigirFirmas: true, contexto: { tanda: { n: 1, de: 2 } } });
      const genesis = eje.obtener(eje.genesisId);
      const payload = ['tras el génesis'];
      const segundo = await firmar(await (await import('../src/evento.js')).crearEvento({ autor: 'vg', sobre: genesis.id, t: T(1), movimientos: [quemaDelCoste('vg', payload, 'minuto', { eje })], payload, contexto: { tanda: { n: 2, de: 2, anterior: genesis.id } } }), claves.privada);
      const r = await llamar('/eventos/tanda', { eje: 'nuevo', eventos: [genesis, segundo] }, cab);
      assert.equal(r.estado, 201, JSON.stringify(r.cuerpo));
      assert.deepEqual(s.autoridad.ejes.get('nuevo').orden, [genesis.id, segundo.id]);
      // Reabrir: la autoridad rehace el libro con la tanda entera (un miembro nunca se asienta suelto).
      const otra = await conAutoridad({ archivo });
      assert.deepEqual(otra.s.autoridad.ejes.get('nuevo').orden, [genesis.id, segundo.id]);
    } finally {
      rmSync(carpeta, { recursive: true, force: true });
    }
  });

  test('con autoridad y un doble de anadirTanda (para forzar lo que el núcleo no hace solo): el fallo de la lista entera va con null; sin anadirTanda, 501', async () => {
    const original = Object.getOwnPropertyDescriptor(Eje.prototype, 'anadirTanda');
    try {
      const { s, llamar } = await conAutoridad();
      const { claveLectura } = (await llamar('/eventos/ejes', { eje: 'doble' }, { 'X-Crear-Ejes': 'prueba' })).cuerpo;
      const cab = { 'X-Clave-Lectura': claveLectura };
      const lib = await libro();
      await llamar('/eventos', { eje: 'doble', evento: lib.genesis }, cab);
      const buenos = await validos(lib, 2);
      Object.defineProperty(Eje.prototype, 'anadirTanda', { configurable: true, writable: true, value: async () => ({ ok: false, indice: null, motivos: [{ texto: 'tanda ya registrada' }] }) });
      let r = await llamar('/eventos/tanda', { eje: 'doble', eventos: buenos }, cab);
      assert.deepEqual(r, { estado: 422, cuerpo: { error: 'tanda rechazada: tanda ya registrada', indice: null, id: null } });
      assert.equal(s.rele.consultar({ kinds: [KIND_RECHAZO] }).length, 0, 'sin miembro que falle, sin 7703');
      Object.defineProperty(Eje.prototype, 'anadirTanda', { configurable: true, writable: true, value: undefined });
      r = await llamar('/eventos/tanda', { eje: 'doble', eventos: buenos }, cab);
      assert.equal(r.estado, 501);
      assert.equal(s.rele.consultar({ kinds: [KIND_EVENTO] }).length, 1);
    } finally {
      if (original) Object.defineProperty(Eje.prototype, 'anadirTanda', original);
      else delete Eje.prototype.anadirTanda;
    }
  });

  /** Un relé con archivo en una carpeta temporal, el génesis de un libro publicado suelto y cómo envolver más. */
  async function releConArchivo(prefijo) {
    const carpeta = mkdtempSync(join(tmpdir(), prefijo));
    const archivo = join(carpeta, 'rele.jsonl');
    const transporte = clavesNostr();
    const lib = await libro();
    const rele = new Rele({ archivo });
    const sobre = (evento) => envolver({ evento, eje: 'r', privada: transporte.privada });
    assert.equal((await rele.publicar(await sobre(lib.genesis))).ok, true);
    const idsAgram = (r) => r.consultar({ kinds: [KIND_EVENTO] }).map((ev) => JSON.parse(ev.content).id);
    return { carpeta, archivo, lib, rele, sobre, idsAgram, borrar: () => rmSync(carpeta, { recursive: true, force: true }) };
  }

  test('el relé con archivo: la tanda va entre las marcas del relé; cortada a media escritura, se reabre sin ella, sin perder lo anterior, y el archivo queda listo para seguir', async () => {
    const r = await releConArchivo('agram-rele-tanda-');
    try {
      const { lib, rele, sobre, archivo, idsAgram } = r;
      const entera = await tanda([{ privada: lib.claves.privada, sobre: lib.genesis.id }, { privada: lib.claves.privada, sobre: lib.genesis.id }]);
      assert.equal((await rele.publicarVarios(await Promise.all(entera.map(sobre)))).ok, true);
      const lineasEntera = readFileSync(archivo, 'utf8').trim().split('\n');
      assert.deepEqual(JSON.parse(lineasEntera.at(-6)), { escritura: 'empieza', lineas: 4 }, 'miembro, recibo, miembro, recibo entre las dos marcas');
      assert.deepEqual(JSON.parse(lineasEntera.at(-1)), { escritura: 'acaba' });
      const largoBueno = readFileSync(archivo).length;
      const cortada = await tanda([{ privada: lib.claves.privada, sobre: lib.genesis.id, payload: ['c1'] }, { privada: lib.claves.privada, sobre: lib.genesis.id, payload: ['c2'] }]);
      assert.equal((await rele.publicarVarios(await Promise.all(cortada.map(sobre)))).ok, true);
      // Se corta la última escritura a la mitad: sin su «acaba», y con la última línea a medias.
      const todo = readFileSync(archivo);
      writeFileSync(archivo, todo.subarray(0, largoBueno + Math.floor((todo.length - largoBueno) / 2)));
      const otra = new Rele({ archivo });
      await otra.abrir();
      assert.deepEqual(new Set(idsAgram(otra)), new Set([lib.genesis.id, ...entera.map((m) => m.id)]));
      assert.equal(otra.ultimoEslabon('r').orden, 2, 'la cadena sigue en el último recibo de la tanda entera');
      assert.equal(readFileSync(archivo).length, largoBueno, 'el archivo se corta justo donde empezaba la escritura a medias');
      assert.ok(readdirSync(r.carpeta).some((n) => n.startsWith('rele.jsonl.cortado-')), 'lo cortado se guarda al lado');
      // Lo siguiente se escribe detrás, limpio, y se vuelve a abrir.
      assert.equal((await otra.publicarVarios(await Promise.all(cortada.map(sobre)))).ok, true);
      const tercera = new Rele({ archivo });
      await tercera.abrir();
      assert.equal(idsAgram(tercera).length, 5);
    } finally {
      r.borrar();
    }
  });

  test('el relé con archivo: lo que DECLARA un registro no mueve los límites (una marca de tanda falsa ni quita lo guardado ni mantiene lo cortado); en medio, corrupción', async () => {
    const r = await releConArchivo('agram-rele-falsa-');
    try {
      const { lib, rele, sobre, archivo, idsAgram } = r;
      // Una tanda cuyos miembros dicen ser 2 de 3 (la marca declarada no cuadra con lo que se escribió): el relé la escribió
      // entera, entre sus marcas, así que al reabrir se carga entera.
      const falsa = [
        await registro({ privada: lib.claves.privada, sobre: lib.genesis.id, payload: ['f1'], contexto: { tanda: { n: 1, de: 3 } } }),
      ];
      falsa.push(await registro({ privada: lib.claves.privada, sobre: lib.genesis.id, payload: ['f2'], contexto: { tanda: { n: 2, de: 3, anterior: falsa[0].id } } }));
      assert.equal((await rele.publicarVarios(await Promise.all(falsa.map(sobre)))).ok, true);
      // Y detrás, una línea suelta (como de un archivo viejo) cuyo registro declara ser el miembro 1 de una tanda de 2.
      const suelto = await sobre(await registro({ privada: lib.claves.privada, sobre: lib.genesis.id, payload: ['declara'], contexto: { tanda: { n: 1, de: 2 } } }));
      appendFileSync(archivo, JSON.stringify(suelto) + '\n');
      const otra = new Rele({ archivo });
      await otra.abrir();
      assert.deepEqual(new Set(idsAgram(otra)), new Set([lib.genesis.id, ...falsa.map((m) => m.id), JSON.parse(suelto.content).id]), 'nada se descarta por lo que declaren');
      // Una marca del relé descuadrada en medio del archivo es corrupción: no se abre.
      writeFileSync(archivo, readFileSync(archivo, 'utf8').replace('{"escritura":"acaba"}', '{"escritura":"empieza","lineas":1}'));
      await assert.rejects(new Rele({ archivo }).abrir(), /descuadradas/);
    } finally {
      r.borrar();
    }
  });

  test('el relé con archivo: un archivo de antes de las marcas (solo eventos, uno por línea) se sigue abriendo; una última línea rota se corta', async () => {
    const r = await releConArchivo('agram-rele-viejo-');
    try {
      const { lib, rele, sobre, archivo, idsAgram } = r;
      // Una «tanda» escrita como antes, sin marcas: sus líneas seguidas.
      const vieja = await tanda([{ privada: lib.claves.privada, sobre: lib.genesis.id, payload: ['v1'] }, { privada: lib.claves.privada, sobre: lib.genesis.id, payload: ['v2'] }]);
      const sobres = await Promise.all(vieja.map(sobre));
      const recibos = [];
      for (const s of sobres) recibos.push(await rele.emitirRecibo(s, new Date()));
      appendFileSync(archivo, sobres.flatMap((s, i) => [s, recibos[i]]).map((x) => JSON.stringify(x) + '\n').join(''));
      assert.ok(!readFileSync(archivo, 'utf8').includes('"escritura"'), 'sin marcas del relé');
      const otra = new Rele({ archivo });
      await otra.abrir();
      assert.deepEqual(new Set(idsAgram(otra)), new Set([lib.genesis.id, ...vieja.map((m) => m.id)]));
      // Una última línea a medias (un corte al escribir, como antes): se quita solo ella.
      const largo = readFileSync(archivo).length;
      appendFileSync(archivo, JSON.stringify(await sobre(await registro({ privada: lib.claves.privada, sobre: lib.genesis.id, payload: ['rota'] }))).slice(0, 50));
      const tercera = new Rele({ archivo });
      await tercera.abrir();
      assert.equal(idsAgram(tercera).length, 3);
      assert.equal(readFileSync(archivo).length, largo);
    } finally {
      r.borrar();
    }
  });
});


test('defensa en el guardado suelto: ningún almacén guarda por insertar un registro con contexto.tanda (memoria, relé de la simulación y el relé mismo), entre por donde entre', async () => {
  const { claves, genesis } = await libro();
  const [m1] = await tanda([{ privada: claves.privada, sobre: genesis.id }, { privada: claves.privada, sobre: genesis.id }]);
  const fila = { id: m1.id, autor: m1.autor, firma: m1.firma, cuerpo: m1 };
  // El almacén en memoria del servidor de prueba.
  const memoria = almacenEnMemoria();
  await memoria.crearEje('m', 'a'.repeat(64));
  await memoria.insertar('m', { id: genesis.id, autor: 'vg', firma: genesis.firma, cuerpo: genesis });
  await assert.rejects(memoria.insertar('m', fila), /no se guarda suelto/);
  assert.equal(memoria.filas('m').length, 1);
  // El almacén sobre el relé de la simulación, y el relé por NIP-01 directamente (sin pasar por el servicio).
  const s = crearServicio();
  await s.almacen.crearEje('r', 'a'.repeat(64));
  await s.almacen.insertar('r', { id: genesis.id, autor: 'vg', firma: genesis.firma, cuerpo: genesis });
  await assert.rejects(s.almacen.insertar('r', fila), /no se guarda suelto/);
  const sobre = await envolver({ evento: m1, eje: 'r', privada: s.transporte });
  const r = await s.rele.publicar(sobre);
  assert.equal(r.ok, false);
  assert.match(r.motivo, /solo entra con la tanda entera/);
  assert.equal(s.rele.consultar({ kinds: [KIND_EVENTO] }).length, 1, 'en el relé, solo el génesis');
  assert.equal((await s.almacen.listar('r', 0, 10)).length, 1);
});

test('el enrutado: POST /eventos/tanda no cae en POST /eventos ni al revés; un camino parecido (tandaX, tanda/algo, Tanda, /tanda) es 404 y no guarda nada; la barra final y la query no cambian la ruta', async () => {
  for (const arrancarUno of [arrancar, arrancarSim]) {
    const s = await arrancarUno({ puerto: 0, secreto: 'prueba' });
    try {
      const e = await cliente(s).crear('rutas');
      const { claves, genesis } = await libro();
      assert.equal((await e.uno(genesis)).estado, 201);
      const miembros = await tanda([{ privada: claves.privada, sobre: genesis.id }, { privada: claves.privada, sobre: genesis.id }]);
      const post = async (camino, cuerpo) => {
        const r = await fetch(s.url + camino, { method: 'POST', headers: { 'Content-Type': 'application/json', ...e.cab }, body: JSON.stringify(cuerpo) });
        return { estado: r.status, cuerpo: await r.json() };
      };
      const guardados = async () => (await e.bajar()).eventos.length;
      for (const camino of ['/eventos/tandaX', '/eventos/tanda/algo', '/eventos/Tanda', '/eventos/tandas', '/tanda', '/eventos/tanda/eventos']) {
        for (const cuerpo of [{ eje: 'rutas', eventos: miembros }, { eje: 'rutas', evento: miembros[0] }]) {
          const r = await post(camino, cuerpo);
          assert.equal(r.estado, 404, arrancarUno.name + ' ' + camino);
        }
      }
      assert.equal(await guardados(), 1);
      // La tanda por POST /eventos (el camino suelto): 400, nada guardado; un registro suelto por la ruta de la tanda: 400.
      assert.equal((await post('/eventos', { eje: 'rutas', eventos: miembros })).estado, 400);
      assert.equal((await post('/eventos/tanda', { eje: 'rutas', evento: miembros[0] })).estado, 400);
      const suelto = await registro({ privada: claves.privada, sobre: genesis.id, payload: ['suelto'] });
      assert.equal((await post('/eventos/tanda', { eje: 'rutas', evento: suelto })).estado, 400);
      assert.equal(await guardados(), 1);
      // La barra final y la query: la misma ruta de la tanda, entera.
      const r = await post('/eventos/tanda/?eje=otro&x=1', { eje: 'rutas', eventos: miembros });
      assert.equal(r.estado, 201, JSON.stringify(r.cuerpo));
      assert.equal((await post('/eventos/tanda?x=1', { eje: 'rutas', eventos: miembros })).cuerpo.duplicado, true);
      assert.equal(await guardados(), 3);
      // Lo de siempre sigue igual: POST /eventos/ con barra final es POST /eventos.
      assert.equal((await post('/eventos/', { eje: 'rutas', evento: suelto })).estado, 201);
    } finally {
      await s.cerrar();
    }
  }
});

test('el tope por minuto se reserva y solo queda gastado si la tanda se guarda: 422 de la puerta con autoridad y null del almacén lo devuelven; dos tandas a la vez no pasan juntas del tope', async () => {
  const almacen = almacenEnMemoria();
  const original = almacen.insertarTanda;
  let modo = 'guardar';
  almacen.insertarTanda = async (eje, filas) => {
    if (modo === 'rechazar') throw Object.assign(new Error('tanda rechazada: no pasa las reglas'), { estado: 422, indice: 0, id: filas[0].id });
    if (modo === 'null') return null;
    if (modo === 'lento') await new Promise((ok) => setTimeout(ok, 50));
    return original(eje, filas);
  };
  const manejar = crearApi({ almacen, cripto: criptoNucleo, crearEjes: { secreto: 'prueba' }, escriturasPorMinuto: 6, ahora: () => new Date('2026-11-18T16:00:30Z') });
  const pedir = async (camino, cuerpo, cab = {}) => {
    const r = await manejar(new Request('http://127.0.0.1' + camino, { method: 'POST', headers: { 'Content-Type': 'application/json', ...cab }, body: JSON.stringify(cuerpo) }));
    return { estado: r.status, cuerpo: await r.json() };
  };
  const { claveLectura } = (await pedir('/eventos/ejes', { eje: 'tope' }, { 'X-Crear-Ejes': 'prueba' })).cuerpo;
  const cab = { 'X-Clave-Lectura': claveLectura };
  const { claves, genesis } = await libro();
  assert.equal((await pedir('/eventos', { eje: 'tope', evento: genesis }, cab)).estado, 201); // 1 de 6
  let n = 0;
  const de = (k) => tanda(Array.from({ length: k }, () => ({ privada: claves.privada, sobre: genesis.id, payload: ['t' + ++n] })));
  const subir = async (eventos) => pedir('/eventos/tanda', { eje: 'tope', eventos }, cab);
  // Rechazada dentro de insertarTanda (la autoridad): cinco veces una de 5, y no gasta nada.
  modo = 'rechazar';
  const cinco = await de(5);
  for (let i = 0; i < 5; i++) assert.equal((await subir(cinco)).estado, 422);
  // El almacén dice null (no la guardó): tampoco gasta.
  modo = 'null';
  for (let i = 0; i < 3; i++) assert.equal((await subir(cinco)).estado, 500);
  // Dos tandas de 3 a la vez, cuando quedan 5: cabe una, la otra 429 entera.
  modo = 'lento';
  const [a, b] = await Promise.all([subir(await de(3)), subir(await de(3))]);
  assert.deepEqual([a.estado, b.estado].sort(), [201, 429]);
  assert.equal(almacen.filas('tope').length, 4);
  // Quedan 2: una de 2 entra y otra de 1 ya no.
  modo = 'guardar';
  assert.equal((await subir(await de(2))).estado, 201);
  assert.equal((await subir(await de(2))).estado, 429);
  assert.equal(almacen.filas('tope').length, 6);
});

test('con autoridad (simulación, núcleo de verdad): una tanda que el núcleo rechaza (422) no gasta escrituras del minuto', async () => {
  const s = crearServicio({ autoridad: new Autoridad(), escriturasPorMinuto: 3, ahora: () => new Date('2026-11-18T16:00:30Z') });
  const llamar = async (camino, cuerpo, cab = {}) => {
    const r = await s.manejar(new Request('http://127.0.0.1' + camino, { method: 'POST', headers: { 'Content-Type': 'application/json', ...cab }, body: JSON.stringify(cuerpo) }));
    return { estado: r.status, cuerpo: await r.json() };
  };
  const { claveLectura } = (await llamar('/eventos/ejes', { eje: 'juez' }, { 'X-Crear-Ejes': 'prueba' })).cuerpo;
  const cab = { 'X-Clave-Lectura': claveLectura };
  const lib = await libro();
  assert.equal((await llamar('/eventos', { eje: 'juez', evento: lib.genesis }, cab)).estado, 201); // 1 de 3
  const sinCoste = await tanda([{ privada: lib.claves.privada, sobre: lib.genesis.id }, { privada: lib.claves.privada, sobre: lib.genesis.id }]);
  for (let i = 0; i < 3; i++) assert.equal((await llamar('/eventos/tanda', { eje: 'juez', eventos: sinCoste }, cab)).estado, 422);
  const r = await llamar('/eventos/tanda', { eje: 'juez', eventos: await validos(lib, 2) }, cab);
  assert.equal(r.estado, 201, 'quedaban 2: los 422 no gastaron ' + JSON.stringify(r.cuerpo));
});
