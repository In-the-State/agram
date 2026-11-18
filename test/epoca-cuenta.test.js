// La época del libro de cuenta, conocida por el código (Carril F, 18-11; src/epoca-cuenta.js): registrada por su id, un
// génesis que la nombra se lee con ella y no con la 0; un génesis así es UN registro; y desde un libro de cuenta nacido
// así siguen valiendo «un libro mío» (carta/libros.js) y el puente (la época del libro nuevo, por referencia). Y los
// vectores del génesis de cuenta por la app, para Core StateArk (test/vectores/genesis-de-cuenta.json).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { canonico } from '../src/evento.js';
import { publicaDe } from '../src/autoridad.js';
import { Eje } from '../src/eje.js';
import * as A from '../src/acciones.js';
import { EPOCA_0_BTML, EPOCAS_POR_ID, epocaEscritaDe } from '../src/epocas.js';
import { EPOCA_DE_CUENTA, ID_EPOCA_DE_CUENTA } from '../src/index.js';
import { serializar, restaurar } from '../src/persistencia.js';
import { epocaCuenta } from '../datos/epocas/cuenta/generar.mjs';
import * as Q from '../carta/cuentas.js';
import * as L from '../carta/libros.js';
import * as PU from '../carta/puente.js';

const ID = JSON.parse(readFileSync('datos/epocas/cuenta/cuenta-0.ids.json', 'utf8')).epoca;
const T = '2026-11-18T10:00:00Z';
const AVISO = 'this account lives only here';
const POR_ID = Object.freeze({ base: ID, cambios: [] });

async function conAlmacen(fn) {
  const almacen = new Map();
  globalThis.localStorage = { getItem: (k) => almacen.get(k) ?? null, setItem: (k, v) => almacen.set(k, String(v)), removeItem: (k) => almacen.delete(k) };
  try {
    return await fn(almacen);
  } finally {
    delete globalThis.localStorage;
  }
}

/** Los pasos del tutorial del alta: [regla o plantilla, hecho]. */
const tutorial = async (eje, quien) => (await A.camino(eje, eje.alta(quien).id, quien, { t: T, idioma: 'es' })).pasos.filter((p) => p.fuente === 'tutorial').map((p) => [p.hacer?.plantilla ?? p.regla, p.hecho, p.falta ?? null]);

test('hoy la época de cuenta NO es nula: cargada de su copia generada, con su id de esta ronda, registrada y no la 0', () => {
  assert.ok(EPOCA_DE_CUENTA, 'EPOCA_DE_CUENTA no es nula (si lo es, la copia generada no carga: npm run epoca:cuenta)');
  assert.equal(ID_EPOCA_DE_CUENTA, ID);
  assert.equal(EPOCA_DE_CUENTA.id, ID);
  assert.equal(EPOCAS_POR_ID.get(ID), EPOCA_DE_CUENTA, 'registrada por su id');
  assert.notEqual(EPOCA_DE_CUENTA, EPOCA_0_BTML);
  assert.equal(EPOCA_DE_CUENTA.hereda, EPOCA_0_BTML.id);
  // El módulo es tolerante: lo que lanza al cargar queda dentro (un try alrededor de la carga), y no hay import de JSON.
  const fuente = readFileSync('src/epoca-cuenta.js', 'utf8');
  assert.match(fuente, /try \{\s*return registrarEpoca\(cargarEpocaEscrita\(EPOCA_DE_CUENTA_DATOS\)\);\s*\} catch \{\s*return null;/);
  assert.ok(!fuente.includes("type: 'json'"));
  // Lo importa el eje: vale para todo lector sin que nadie se acuerde.
  assert.ok(readFileSync('src/eje.js', 'utf8').includes("import './epoca-cuenta.js';"));
});

test('un génesis que nombra la época de cuenta por su id es UN registro, no la escribe y, releído desde cero, ofrece la guía de inicio de la cuenta igual que uno nacido con la época escrita', async () => {
  const eje = await Eje.genesis({ identidad: 'ana', foco: 'cuenta inventada', t: T, epoca: POR_ID, demostracion: true });
  assert.equal(eje.orden.length, 1, 'un solo registro');
  const g = eje.obtener(eje.genesisId);
  assert.equal(g.contexto.epoca, ID);
  assert.ok(!('epocaEscrita' in g.contexto) && !('tanda' in g.contexto));
  assert.equal(eje.epoca(), EPOCA_DE_CUENTA);
  const releido = await restaurar(serializar(eje));
  assert.equal(releido.epoca().id, ID, 'releído desde cero, con la época de cuenta y no con la 0');
  const escrita = await Eje.genesis({ identidad: 'ana', foco: 'cuenta inventada', t: T, epoca: epocaCuenta(), demostracion: true });
  assert.ok(escrita.orden.length > 1, 'la escrita va en tanda');
  assert.equal(escrita.epoca().id, ID);
  const pasos = await tutorial(releido, 'ana');
  assert.deepEqual(pasos, await tutorial(escrita, 'ana'), 'la misma guía de inicio');
  assert.equal(pasos[0][0], AVISO, 'el aviso «tu cuenta está solo aquí», el primero');
  assert.equal(pasos[0][2], 'tu cuenta está solo aquí: haz un respaldo o únete a un nodo');
  // Sin registrar, el mismo génesis caería a la 0 (el id no se conoce): lo que este módulo evita.
  EPOCAS_POR_ID.delete(ID);
  try {
    assert.equal((await restaurar(serializar(eje))).epoca(), EPOCA_0_BTML);
  } finally {
    EPOCAS_POR_ID.set(ID, EPOCA_DE_CUENTA);
  }
});

test('desde un libro de cuenta nacido por id, «un libro mío» nace con la misma época por id (un registro) y el puente la nombra igual; el nacido con la escrita la sigue escribiendo', async () => {
  await conAlmacen(async () => {
    const c = await Q.crearCuenta({ nombre: 'Ana Inventada', idioma: 'es', t: T, epoca: POR_ID, htmlInicial: true });
    assert.equal(c.eje.epoca(), EPOCA_DE_CUENTA);
    assert.deepEqual(epocaEscritaDe(c.eje.epoca(), { porReferencia: true }), POR_ID, 'la registrada cuenta como del código');
    assert.deepEqual(Object.keys(epocaEscritaDe(c.eje.epoca())).sort(), ['raiz', 'registros'], 'sin porReferencia, su forma escrita, como siempre');
    await Q.guardarCuenta(c);
    const r = await L.abrirLibroPrivado({ grande: { eje: c.eje, cuenta: c.cuenta, privada: c.privada }, X: c.cuenta.alta, nombre: 'Libro inventado', t: T });
    assert.ok(r.cuelga, JSON.stringify(r.motivos));
    const p = r.pequeno.eje ?? (await Q.abrirCuenta(r.pequeno.cuenta.alta)).eje;
    const gp = p.obtener(p.genesisId);
    assert.equal(gp.contexto.epoca, ID);
    assert.ok(!('epocaEscrita' in gp.contexto), 'el libro mío nombra la época por su id, sin escribirla');
    assert.equal(p.epoca().id, ID);
    // El puente: el génesis del libro nuevo de una salida lleva la época del viejo por referencia.
    const salida = PU.salidaDe(c.eje, c.cuenta.identidad, { nombre: 'Lo mío' });
    assert.deepEqual(salida.plan.pasos.find((x) => x.que === 'genesis').params.epoca, POR_ID);
    // Una cuenta del navegador nacida con la época ESCRITA sigue como hoy: sus hijos la escriben.
    const n = await Q.crearCuenta({ nombre: 'Bea Inventada', idioma: 'es', t: T, epoca: epocaCuenta() });
    assert.equal(n.eje.epoca().id, ID);
    assert.notEqual(n.eje.epoca(), EPOCA_DE_CUENTA, 'otro objeto: la resuelta de su libro');
    assert.deepEqual(Object.keys(epocaEscritaDe(n.eje.epoca(), { porReferencia: true })).sort(), ['raiz', 'registros']);
  });
});

test('vectores para Core StateArk (test/vectores/genesis-de-cuenta.json): al día con su guion; cada canónico, su id y la forma acordada', async () => {
  const { ARCHIVO, texto, ENTRADAS } = await import('./vectores/genesis-de-cuenta.mjs');
  assert.equal(readFileSync(ARCHIVO, 'utf8'), await texto(), 'al día: node test/vectores/genesis-de-cuenta.mjs');
  const v = JSON.parse(readFileSync(ARCHIVO, 'utf8'));
  assert.equal(v.epoca, ID);
  assert.equal(v.casos.length, 2);
  for (const c of v.casos) {
    assert.equal(createHash('sha256').update(c.canonico).digest('hex'), c.id, c.caso + ': el id es el SHA-256 del canónico');
    const cuerpo = JSON.parse(c.canonico);
    assert.equal(canonico(cuerpo), c.canonico, 'en forma canónica');
    // La forma acordada: sobre nulo, sin movimientos, el nombre tecleado en el payload; génesis, la época por id, la clave
    // del autor y, si los hay, eje y next; sin epocaEscrita ni tanda.
    assert.deepEqual([cuerpo.sobre, cuerpo.movimientos, cuerpo.payload, cuerpo.t], [null, [], ENTRADAS.nombre, ENTRADAS.t]);
    assert.deepEqual(cuerpo.contexto, { genesis: true, epoca: ID, claves: { [c.identidad]: c.publica }, ...c.contexto });
    assert.equal(c.publica, publicaDe(ENTRADAS.privada));
  }
  assert.deepEqual(v.casos.map((c) => c.contexto), [{ eje: ENTRADAS.eje, next: ENTRADAS.next }, {}]);
});
