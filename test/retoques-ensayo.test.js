// El ensayo del servidor de retoques (retoques/ensayo.mjs y --ensayo en retoques/servidor.mjs): el libro del roadmap volcado
// de una tabla, servido como libro compartido bajo /ensayo/…, y la cuenta de la dueña para la carta. Con una tabla
// INVENTADA aquí (las columnas de la correspondencia del roadmap, nada del roadmap de verdad), carpetas temporales,
// claves generadas en cada prueba y un agente falso. Dos «dispositivos» con los módulos de la carta en node (como
// test/carta-sincronia.test.js): cada uno su localStorage simulado.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crearServidor, CABECERA_LLAVE } from '../retoques/servidor.mjs';
import { instantesDePasadas, huellaDeFila, EJE } from '../retoques/ensayo.mjs';
import { acciones, sincronia } from '../src/index.js';
import { firmar } from '../src/autoridad.js';
import * as Q from '../carta/cuentas.js';
import * as S from '../carta/sincronia.js';
import { leerLibro, correspondenciaDe, PLANTILLAS } from '../ejemplos/volcado/volcar.mjs';

const FALSO = join(dirname(fileURLToPath(import.meta.url)), 'ayudas-agente-falso.mjs');
const CORR = correspondenciaDe(JSON.parse(readFileSync(new URL('../ejemplos/volcado/correspondencia-roadmap.json', import.meta.url), 'utf8')));
const fila = (id, casa, linea, tarea, fase) => ({ id, casa, linea, tarea, fase, sprint: '1', estado: 'inventado' });
const TABLA = [
  fila('t1', 'Casa Norte', 'Puertas', 'Pintar la puerta inventada', 'falta'),
  fila('t2', 'Casa Norte', 'Puertas', 'Lijar el marco inventado', 'en curso'),
  fila('t3', 'Casa Norte', 'Ventanas', 'Medir la ventana inventada', 'hecho'),
  fila('t4', 'Casa Sur', 'Tejado', 'Revisar la teja inventada', 'comprobado'),
];
const DIA = 86_400_000;

/** Un árbol de la carta mínimo (la raíz servida) y, aparte, la carpeta del ensayo con la tabla. */
function preparar(tabla = TABLA) {
  const raiz = mkdtempSync(join(tmpdir(), 'agram-raiz-'));
  writeFileSync(join(raiz, 'index.html'), '<!doctype html><html><head></head><body></body></html>\n');
  const fuera = mkdtempSync(join(tmpdir(), 'agram-ensayo-'));
  writeFileSync(join(fuera, 'tabla.json'), JSON.stringify(tabla));
  return { raiz, fuera, ensayo: { carpeta: join(fuera, 'carpeta'), tabla: join(fuera, 'tabla.json'), claves: join(fuera, 'claves.json') }, borrar: () => { rmSync(raiz, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); rmSync(fuera, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); } };
}

/** Arranca el servidor con el ensayo; lo que dice va a `dicho`. */
async function arrancar(p, { publico = null, puerto: fijo = 0 } = {}) {
  const dicho = [];
  const s = crearServidor({ raiz: p.raiz, puerto: fijo, vigilar: false, publico, ensayo: p.ensayo, decir: (x) => dicho.push(x), orden: { comando: process.execPath, args: [FALSO] } });
  const puerto = await s.escuchar();
  return { s, puerto, dicho };
}

function pedir(puerto, ruta, { metodo = 'GET', host = 'localhost:' + puerto, cabeceras = {}, cuerpo } = {}) {
  return new Promise((ok, mal) => {
    const datos = cuerpo === undefined ? null : JSON.stringify(cuerpo);
    const req = http.request({ host: '127.0.0.1', port: puerto, path: ruta, method: metodo, headers: { host, ...(datos !== null ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(datos) } : {}), ...cabeceras } }, (res) => {
      const trozos = [];
      res.on('data', (d) => trozos.push(d));
      res.on('end', () => ok({ estado: res.statusCode, cabeceras: res.headers, cuerpo: Buffer.concat(trozos).toString('utf8') }));
    });
    req.on('error', mal);
    if (datos !== null) req.write(datos);
    req.end();
  });
}

/** Un dispositivo: su propio localStorage simulado, que pasa a ser el global mientras se usa. */
function dispositivo() {
  const almacen = new Map();
  const ls = { getItem: (k) => almacen.get(k) ?? null, setItem: (k, v) => almacen.set(k, String(v)), removeItem: (k) => almacen.delete(k) };
  return { almacen, usar: () => { globalThis.localStorage = ls; } };
}

/** Lo que hace la carta con «Entrar en el libro del roadmap»: restaurar la copia, el eje del libro compartido, guardarla y abrirla. */
async function entrar(d, { copia, frase }) {
  d.usar();
  const r = await Q.restaurarCuenta(copia, frase);
  const destino = sincronia.destino(r.eje, r.cuenta.identidad);
  const libro = await S.ejeDelServidor({ cuenta: r.cuenta, url: destino.url, eje: destino.eje, claveLectura: r.claveLectura, foto: r.eje });
  assert.equal(libro.motivo, undefined, libro.motivo);
  r.eje = libro.eje;
  assert.equal(await Q.guardarCuenta(r), true);
  Q.guardarEstadoSincronia(r.cuenta.alta, libro.sincronia.serializar());
  const abierta = await Q.abrirCuenta(r.cuenta.alta);
  const sinc = S.abrir({ alta: r.cuenta.alta, eje: abierta.eje, yo: r.cuenta.identidad });
  assert.ok(sinc, 'la cuenta restaurada sincroniza con /ensayo');
  return { ...r, eje: abierta.eje, sinc, destino };
}

/** Todo el texto de los archivos de una carpeta (recursivo), para buscar secretos. */
function textoDe(dir) {
  if (!existsSync(dir)) return '';
  return readdirSync(dir).map((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? textoDe(p) : readFileSync(p, 'utf8'); }).join('\n');
}

test('las pasadas del primer volcado: días seguidos, la última hoy y sin fecha futura; la huella de una fila no depende del orden', () => {
  const ahora = Date.parse('2026-11-17T12:00:00.500Z');
  assert.deepEqual(instantesDePasadas([30], ahora), [Date.parse('2026-11-17T12:00:00Z') - 40_000]);
  assert.deepEqual(instantesDePasadas([], ahora), [Date.parse('2026-11-17T12:00:00Z') - 10_000], 'sin nada que escribir, una pasada');
  assert.deepEqual(instantesDePasadas([400, 120], ahora), [Date.parse('2026-11-16T00:01:00Z'), Date.parse('2026-11-17T12:00:00Z') - 130_000]);
  const tres = instantesDePasadas([1, 1, 1], ahora);
  assert.deepEqual(tres.slice(0, 2), [Date.parse('2026-11-15T00:01:00Z'), Date.parse('2026-11-16T00:01:00Z')]);
  assert.ok(tres.every((t) => t <= ahora));
  assert.throws(() => instantesDePasadas([50], Date.parse('2026-11-17T00:00:20Z')), /acaba de empezar/);
  assert.equal(huellaDeFila({ a: 1, b: 2 }), huellaDeFila({ b: 2, a: 1 }));
  assert.notEqual(huellaDeFila({ a: 1 }), huellaDeFila({ a: 2 }));
});

test('ensayo: el almacén vacío se llena con la tabla; dos dispositivos restauran la cuenta de la dueña y ven el mismo libro; lo que escribe uno lo ve el otro; nada secreto en la consola ni en .datos', async () => {
  const p = preparar();
  const capturado = [];
  const antes = { log: console.log, error: console.error, warn: console.warn };
  for (const k of Object.keys(antes)) console[k] = (...a) => capturado.push(a.join(' '));
  let m;
  try {
    m = await arrancar(p);
    assert.equal(m.dicho.length, 1);
    assert.match(m.dicho[0], /^ensayo: volcado en 1 pasada: \d+ registros escritos, 0 avisos$/);
    for (const f of TABLA) assert.ok(!m.dicho[0].includes(f.tarea));
    assert.ok(existsSync(p.ensayo.claves), 'el archivo de claves se crea');
    const claves = JSON.parse(readFileSync(p.ensayo.claves, 'utf8'));
    assert.deepEqual(Object.keys(claves.cosas).sort(), ['Casa Norte', 'Casa Sur']);
    assert.ok(existsSync(join(p.ensayo.carpeta, 'compartido.json')));
    const llave = { [CABECERA_LLAVE]: m.s.llave };
    const estado = JSON.parse((await pedir(m.puerto, '/retoques/estado', { cabeceras: llave })).cuerpo);
    assert.equal(estado.ensayo, true);
    assert.equal(estado.ensayoAlta, m.s.ensayo().alta);
    assert.equal((await pedir(m.puerto, '/retoques/ensayo/cuenta')).estado, 401);
    const cuenta = JSON.parse((await pedir(m.puerto, '/retoques/ensayo/cuenta', { cabeceras: llave })).cuerpo);
    assert.equal(typeof cuenta.frase, 'string');
    assert.equal(cuenta.copia.formato, Q.FORMATO);
    assert.ok(!JSON.stringify(cuenta.copia).includes(claves.duena.privada), 'la privada va cifrada');
    // Crear ejes, nunca desde fuera.
    assert.equal((await pedir(m.puerto, '/ensayo/ejes', { metodo: 'POST', cuerpo: { eje: 'otro' }, cabeceras: { 'x-crear-ejes': 'prueba' } })).estado, 404);
    assert.equal((await pedir(m.puerto, '/ensayo/eventos/ejes', { metodo: 'POST', cuerpo: { eje: 'otro' } })).estado, 404);

    const A = await entrar(dispositivo(), cuenta);
    const B = await entrar(dispositivo(), cuenta);
    assert.deepEqual(A.destino, { url: 'http://localhost:' + m.puerto + '/ensayo', eje: EJE });
    assert.deepEqual(A.eje.orden, B.eje.orden, 'los dos ven el mismo libro');
    assert.ok(A.eje.orden.every((id) => Date.parse(A.eje.obtener(id).t) <= Date.now()), 'ningún registro con fecha futura');
    const libro = leerLibro(A.eje, A.cuenta.identidad, CORR);
    assert.deepEqual([...libro.tareas.keys()].sort(), ['t1', 't2', 't3', 't4']);
    // A escribe en una tarea, como la dueña desde la carta; B lo baja.
    const tarea = libro.tareas.get('t1').id;
    const tx = await acciones.transaccion(A.eje, 'anchor here', { X: tarea, title: 'Un comentario desde la pantalla' }, A.cuenta.identidad, { firmar: Q.firmarCon(A.privada) });
    assert.equal(tx.ok, true, JSON.stringify(tx.motivos));
    await A.eje.anadir(tx.evento);
    globalThis.localStorage = undefined;
    const subeA = await A.sinc.sincronizar(A.eje);
    assert.deepEqual([subeA.subidos, subeA.errores], [[tx.evento.id], []]);
    const bajaB = await B.sinc.sincronizar(B.eje);
    assert.deepEqual(bajaB.anadidos, [tx.evento.id]);
    // Ni la privada ni la frase ni la clave de lectura en la consola o en .datos.
    const secretos = [claves.duena.privada, ...Object.values(claves.cosas).map((c) => c.privada), cuenta.frase, A.claveLectura];
    const todo = [...m.dicho, ...capturado].join('\n') + textoDe(join(p.raiz, 'retoques', '.datos'));
    for (const x of secretos) assert.ok(!todo.includes(x));
  } finally {
    Object.assign(console, antes);
    delete globalThis.localStorage;
    await m?.s.cerrar();
    p.borrar();
  }
});

test('ensayo: los arranques siguientes no reescriben; una fila cambiada en la tabla, solo esa; una cambiada en la pantalla y no en la tabla, no se toca', async () => {
  const p = preparar();
  let m;
  try {
    m = await arrancar(p);
    const total = () => JSON.parse(readFileSync(join(p.ensayo.carpeta, 'compartido.json'), 'utf8')).eventos[EJE].length;
    const n0 = total();
    const puerto = m.puerto; // el mismo puerto: la «sync url» del libro no cambia
    await m.s.cerrar();
    // Sin cambios en la tabla: nada.
    m = await arrancar(p, { puerto });
    assert.deepEqual(m.dicho, []);
    assert.deepEqual(m.s.ensayo().ultimo, { pasadas: 0, escritos: 0, avisos: 0, filas: [] });
    assert.equal(total(), n0);
    // En pantalla, la casa de t2 cambia su texto (una corrección suya, firmada con su clave y con su propio T del día: es
    // una persona invitada por la dueña, VG 17-11).
    const llave = { [CABECERA_LLAVE]: m.s.llave };
    const cuenta = JSON.parse((await pedir(m.puerto, '/retoques/ensayo/cuenta', { cabeceras: llave })).cuerpo);
    const A = await entrar(dispositivo(), cuenta);
    const claves = JSON.parse(readFileSync(p.ensayo.claves, 'utf8'));
    const casa = 'Casa Norte';
    assert.equal(A.eje.esPersona(casa), true, 'la casa es una persona del libro');
    const t2 = leerLibro(A.eje, A.cuenta.identidad, CORR).tareas.get('t2');
    const cambio = await acciones.transaccion(A.eje, PLANTILLAS.registro, { X: t2.id, title: 'Lijar el marco, dicho en pantalla', content: ['id: t2', 'sprint: 1', 'estado: inventado'] }, casa, { firmar: (ev) => firmar(ev, claves.cosas[casa].privada) });
    assert.equal(cambio.ok, true, JSON.stringify(cambio.motivos));
    await A.eje.anadir(cambio.evento);
    globalThis.localStorage = undefined;
    assert.deepEqual((await A.sinc.sincronizar(A.eje)).errores, []);
    await m.s.cerrar();
    // La tabla cambia t1 (y t2 sigue como estaba en la tabla): solo t1.
    writeFileSync(p.ensayo.tabla, JSON.stringify([fila('t1', 'Casa Norte', 'Puertas', 'Pintar la puerta inventada de verde', 'falta'), ...TABLA.slice(1)]));
    m = await arrancar(p, { puerto });
    assert.equal(m.dicho.length, 1);
    assert.match(m.dicho[0], /^ensayo: volcado de 1 filas cambiadas: 1 registros escritos, 0 avisos$/);
    assert.deepEqual(m.s.ensayo().ultimo.filas, ['t1']);
    const llave2 = { [CABECERA_LLAVE]: m.s.llave };
    const B = await entrar(dispositivo(), JSON.parse((await pedir(m.puerto, '/retoques/ensayo/cuenta', { cabeceras: llave2 })).cuerpo));
    const libro = leerLibro(B.eje, B.cuenta.identidad, CORR);
    assert.equal(libro.tareas.get('t1').texto, 'Pintar la puerta inventada de verde');
    assert.equal(libro.tareas.get('t2').texto, 'Lijar el marco, dicho en pantalla', 'la pantalla manda hasta que la tabla diga otra cosa');
    await m.s.cerrar();
    // Otro arranque con la misma tabla: nada.
    const n1 = total();
    m = await arrancar(p, { puerto });
    assert.deepEqual(m.dicho, []);
    assert.equal(total(), n1);
    await m.s.cerrar();
    // Por otro puerto (o por --publico), la «sync url» del libro cambia: un registro de preferencias de la dueña, nada más.
    m = await arrancar(p);
    assert.deepEqual(m.dicho, []);
    assert.equal(total(), n1 + 1);
  } finally {
    delete globalThis.localStorage;
    await m?.s.cerrar();
    p.borrar();
  }
});

test('ensayo: dentro de la raíz, rechazado; la cara pública sin sesión no da ni /ensayo ni la cuenta; sin --ensayo no existe', async () => {
  const p = preparar();
  try {
    for (const [k, ruta] of [['carpeta', join(p.raiz, 'ensayo')], ['tabla', join(p.raiz, 'tabla.json')], ['claves', join(p.raiz, 'claves.json')]]) {
      assert.throws(() => crearServidor({ raiz: p.raiz, puerto: 0, vigilar: false, ensayo: { ...p.ensayo, [k]: ruta } }), /FUERA del repositorio/, k);
    }
    assert.throws(() => crearServidor({ raiz: p.raiz, puerto: 0, vigilar: false, ensayo: { carpeta: p.ensayo.carpeta } }), /falta/);
    const publico = 'retoques.ejemplo.test';
    const m = await arrancar(p, { publico });
    try {
      for (const ruta of ['/ensayo/eventos?eje=roadmap', '/retoques/ensayo/cuenta']) {
        const r = await pedir(m.puerto, ruta, { host: publico, cabeceras: { [CABECERA_LLAVE]: m.s.llave } });
        assert.equal(r.estado, 401, ruta);
        assert.ok(!r.cuerpo.includes('eventos') && !r.cuerpo.includes('copia'), ruta);
      }
      // Con --publico, la «sync url» del libro es la de fuera.
      const cuenta = JSON.parse((await pedir(m.puerto, '/retoques/ensayo/cuenta', { cabeceras: { [CABECERA_LLAVE]: m.s.llave } })).cuerpo);
      const r = await Q.restaurarCuenta(cuenta.copia, cuenta.frase);
      assert.deepEqual(sincronia.destino(r.eje, r.cuenta.identidad), { url: 'https://' + publico + '/ensayo', eje: EJE });
    } finally { await m.s.cerrar(); }
    // Sin --ensayo: ni la ruta, ni la cuenta, y estado lo dice.
    const s = crearServidor({ raiz: p.raiz, puerto: 0, vigilar: false });
    const puerto = await s.escuchar();
    try {
      assert.equal((await pedir(puerto, '/ensayo/eventos?eje=roadmap')).estado, 404);
      assert.equal((await pedir(puerto, '/retoques/ensayo/cuenta', { cabeceras: { [CABECERA_LLAVE]: s.llave } })).estado, 404);
      assert.equal(JSON.parse((await pedir(puerto, '/retoques/estado', { cabeceras: { [CABECERA_LLAVE]: s.llave } })).cuerpo).ensayo, false);
    } finally { await s.cerrar(); }
  } finally { p.borrar(); }
});

test('ensayo (seguridad): un alta de cosa de otro con el nombre de una casa no para el ensayo (aviso); una de la dueña es un libro de la disposición anterior: se niega y dice apartarlo', async () => {
  const p = preparar();
  let m;
  try {
    m = await arrancar(p);
    const puerto = m.puerto;
    const llave = { [CABECERA_LLAVE]: m.s.llave };
    const A = await entrar(dispositivo(), JSON.parse((await pedir(m.puerto, '/retoques/ensayo/cuenta', { cabeceras: llave })).cuerpo));
    const { generarClaves, firmarPosesion } = await import('../src/autoridad.js');
    const otro = await generarClaves();
    const ya = (seg) => new Date(Math.floor(Date.now() / 1000) * 1000 - seg * 1000).toISOString().replace('.000Z', 'Z');
    const inv = await A.eje.invitar({ autor: A.cuenta.identidad, invitado: 'otro', clave: otro.publica, da: [], t: ya(3), privada: A.privada });
    await A.eje.aceptar(inv, otro, { t: ya(2) });
    const cosa = await generarClaves();
    const tx = await acciones.transaccion(A.eje, 'register a thing', { X: A.eje.alta('otro').id, thing: 'Casa Este', minutes: 1, key: cosa.publica }, 'otro', { firmar: async (ev) => firmar(await firmarPosesion(ev, 'Casa Este', cosa.privada), otro.privada) });
    assert.equal(tx.ok, true, JSON.stringify(tx.motivos));
    await A.eje.anadir(tx.evento);
    globalThis.localStorage = undefined;
    assert.deepEqual((await A.sinc.sincronizar(A.eje)).errores, []);
    await m.s.cerrar();
    writeFileSync(p.ensayo.tabla, JSON.stringify([...TABLA, fila('t5', 'Casa Este', 'Patio', 'Barrer el patio inventado', 'falta')]));
    m = await arrancar(p, { puerto });
    assert.ok(m.dicho.includes('ensayo: aviso: «Casa Este» ya tiene alta como cosa de otro; sus filas no se vuelcan'), JSON.stringify(m.dicho));
    await m.s.cerrar();
    m = null;
    // Una cosa de la dueña con el nombre de una casa: el libro es de la disposición anterior.
    const B = await (async () => { m = await arrancar(p, { puerto }); return entrar(dispositivo(), JSON.parse((await pedir(m.puerto, '/retoques/ensayo/cuenta', { cabeceras: { [CABECERA_LLAVE]: m.s.llave } })).cuerpo)); })();
    const vieja = await generarClaves();
    const tv = await acciones.transaccion(B.eje, 'register a thing', { X: B.eje.alta(B.cuenta.identidad).id, thing: 'Casa Oeste', minutes: 1, key: vieja.publica }, B.cuenta.identidad, { escala: 'segundo', firmar: async (ev) => Q.firmarCon(B.privada)(await firmarPosesion(ev, 'Casa Oeste', vieja.privada)) });
    assert.equal(tv.ok, true, JSON.stringify(tv.motivos));
    await B.eje.anadir(tv.evento);
    globalThis.localStorage = undefined;
    assert.deepEqual((await B.sinc.sincronizar(B.eje)).errores, []);
    await m.s.cerrar();
    m = null;
    writeFileSync(p.ensayo.tabla, JSON.stringify([...TABLA, fila('t6', 'Casa Oeste', 'Huerto', 'Regar el huerto inventado', 'falta')]));
    await assert.rejects(arrancar(p, { puerto }), /disposición anterior.*aparta la carpeta del ensayo/);
  } finally {
    delete globalThis.localStorage;
    await m?.s.cerrar();
    p.borrar();
  }
});
