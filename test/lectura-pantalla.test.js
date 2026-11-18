// La lectura de pantalla por el contrato (Core AGRAM 18-11; docs/BQLM.md §15.4): la lectura de un punto de vista
// (contrato.leer → aplicarLectura) es la única que pasa lectura: true y la memoria de lectura de su eje. Aquí: keep
// funciona por ese camino y no por el de una regla; la segunda lectura de la misma pantalla cuesta un paso por fórmula;
// un libro que cambia no recibe nada viejo; y la huella del contexto ve todo cambio de la lista de registros del eje,
// porque el eje solo la alarga o la sustituye entera (nunca la cambia en su sitio). Libros en memoria, de demostración.

import { test } from 'node:test';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { evaluar, evaluarRegla, leerRegla, Presupuesto } from '../src/bqlm.js';
import { ContextoEje } from '../src/contexto-eje.js';
import { Eje } from '../src/eje.js';
import * as A from '../src/acciones.js';
import * as contrato from '../src/contrato.js';
import { epocaRoadmap } from '../datos/epocas/roadmap/generar.mjs';

const T = '2026-11-17T10:00:00Z';
const DESPUES = 'this goes after';

/** El roadmap de test/cadenas.test.js, solo con el proyecto A: A2 y A3 después de A1, A4 después de A2 y A3; A5 suelta. */
async function roadmap() {
  const eje = await Eje.genesis({ identidad: 'duena', foco: 'roadmap de prueba', t: T, emision: [{ token: 'R', cantidad: 10 }], epoca: epocaRoadmap(), demostracion: true });
  const hacer = async (nombre, X, params) => {
    const r = await A.transaccion(eje, nombre, { X, ...params }, 'duena', { t: T });
    assert.ok(r.ok, nombre + ': ' + JSON.stringify(r.motivos));
    return eje.anadir(r.evento);
  };
  const pa = await hacer('anchor here', eje.genesisId, { title: 'Proyecto A' });
  const t = {};
  for (const n of ['A1', 'A2', 'A3', 'A4', 'A5']) t[n] = await hacer('anchor here', pa.id, { title: n, content: ['id: ' + n], type: 'task' });
  await hacer(DESPUES, t.A2.id, { previous: [t.A1.id] });
  await hacer(DESPUES, t.A3.id, { previous: [t.A1.id] });
  await hacer(DESPUES, t.A4.id, { previous: [t.A2.id, t.A3.id] });
  const nombres = new Map(Object.entries(t).map(([k, v]) => [v.id, k]));
  return { eje, pa, t, hacer, nombres };
}

// Lo que cuelga de X y alguna relación nombra en su 6: 1 / (cuántas lo nombran) da ERROR (división por cero) en la que
// ninguna nombra, y keep la deja caer; con where, la lectura entera daría ERROR.
const CON_KEEP = '=(down it) keep 1 / count (it2 cited 6) > 0';
const CON_WHERE = '=(down it) where 1 / count (it2 cited 6) > 0';
const PV = 7;

/** La época del libro con una sola lectura de punto de vista, la del PV 7, con estas fórmulas. */
const conLectura = (eje, ...formulas) => ({ ...eje.epoca(), lecturasDePv: [[['lectura de prueba'], [], formulas, [PV], ['point of view'], [], [], [], [], []]] });

const derivados = (eje, X, epoca, nombres) => contrato.leer(eje, X, PV, { epoca }).derivado.map((x) => nombres.get(x.valor?.ref ?? x.valor) ?? x.valor);

test('keep funciona por la lectura de pantalla del contrato; la misma fórmula, por el camino de una regla, no', async () => {
  const { eje, pa, nombres } = await roadmap();
  assert.deepEqual(derivados(eje, pa.id, conLectura(eje, CON_KEEP), nombres), ['A1', 'A2', 'A3'], 'A4 y A5 no las nombra nadie: se caen');
  assert.deepEqual(derivados(eje, pa.id, conLectura(eje, CON_WHERE), nombres), [], 'con where, ERROR: la fórmula no da nada');
  const ctx = new ContextoEje(eje, { epoch: eje.epoca(), me: 'duena' });
  const regla = (dos, cuatro = []) => [['regla de prueba'], [], [dos], [], cuatro, [], [], [], [], ['no']];
  const c = evaluarRegla(regla('=count ((down ' + JSON.stringify(pa.id) + ') keep 1 / count (it cited 6) > 0) > 0'), ctx, { lectura: true });
  assert.equal(c.estado, 'ERROR');
  assert.match(c.motivo, /keep: solo en una lectura/);
  assert.equal(leerRegla(regla(CON_KEEP, ['read']), pa.id, ctx, { lectura: true }).estado, 'ERROR', 'una lectura B5 tampoco');
  assert.equal(evaluar(CON_KEEP, ctx, { sujeto: pa.id }).estado, 'ERROR', 'ni evaluar sin lectura');
});

test('la segunda lectura de la misma pantalla cuesta un paso por fórmula; un libro que cambia no recibe nada viejo', async () => {
  const { eje, pa, t, hacer, nombres } = await roadmap();
  const epoca = conLectura(eje, CON_KEEP);
  const memoria = contrato.memoriaDeLectura(eje);
  assert.equal(contrato.memoriaDeLectura(eje), memoria, 'una por eje');
  assert.deepEqual(derivados(eje, pa.id, epoca, nombres), ['A1', 'A2', 'A3']);
  const llena = memoria.tamano;
  assert.ok(llena > 0, 'la lectura del contrato la llena');
  const aciertos = memoria.aciertos;
  assert.deepEqual(derivados(eje, pa.id, epoca, nombres), ['A1', 'A2', 'A3']);
  assert.equal(memoria.aciertos, aciertos + 1, 'la segunda vez, un acierto (una fórmula)');
  // Lo que cuesta ese acierto, con la misma memoria y la misma mirada que el contrato (me = la dueña del proyecto).
  const ctx = new ContextoEje(eje, { epoch: epoca, me: 'duena' });
  const presupuesto = new Presupuesto();
  const r = evaluar(CON_KEEP, ctx, { sujeto: pa.id, lectura: true, memoria, presupuesto });
  assert.equal(r.estado, 'RESUELTO');
  assert.deepEqual([presupuesto.pasos, presupuesto.usados], [1, 0]);
  const fresco = new Presupuesto();
  evaluar(CON_KEEP, ctx, { sujeto: pa.id, lectura: true, presupuesto: fresco });
  assert.ok(fresco.pasos > 1 && fresco.usados > 0, 'sin memoria cuesta ' + fresco.pasos + ' pasos y ' + fresco.usados + ' ocupantes');
  // Cambia el libro: A5 pasa a ir antes de A1, así que una relación la nombra. Validarla y asentarla (las reglas) no toca
  // la memoria; la pantalla siguiente ve lo nuevo.
  const cuenta = [memoria.tamano, memoria.aciertos, memoria.fallos];
  await hacer(DESPUES, t.A1.id, { previous: [t.A5.id] });
  assert.deepEqual([memoria.tamano, memoria.aciertos, memoria.fallos], cuenta, 'las reglas ni la consultan ni la llenan');
  assert.deepEqual(derivados(eje, pa.id, epoca, nombres), ['A1', 'A2', 'A3', 'A5']);
});

test('la huella ve todo cambio de la lista de registros: el eje solo la alarga o la sustituye entera, nunca la cambia en su sitio', async () => {
  const { eje, pa, hacer } = await roadmap();
  const huella = () => new ContextoEje(eje, { epoch: eje.epoca() }).huella();
  const lista = eje.orden;
  const antes = [...lista];
  const h0 = huella();
  // Añadir alarga la misma lista, sin tocar lo que había: cambia su longitud y su último.
  await hacer('anchor here', pa.id, { title: 'A6', content: ['id: A6'], type: 'task' });
  assert.equal(eje.orden, lista, 'la misma lista');
  assert.deepEqual(eje.orden.slice(0, antes.length), antes, 'lo que había, igual');
  assert.equal(eje.orden.length, antes.length + 1);
  const h1 = huella();
  assert.notEqual(h1, h0);
  // Reordenar (aunque sea en el mismo orden) sustituye la lista entera: otra lista, otra huella.
  const r = await eje.reordenar([...eje.orden]);
  assert.deepEqual(r.rechazados, []);
  assert.notEqual(eje.orden, lista, 'otra lista');
  assert.notEqual(huella(), h1);
  // Una tanda que no entra deja la lista como estaba o la sustituye: nunca la cambia en su sitio con la misma longitud.
  const lista2 = eje.orden;
  const n = lista2.length;
  const ultimo = lista2[n - 1];
  await eje.anadirTanda([{ id: 'no es un evento' }]).catch(() => null);
  assert.ok(eje.orden !== lista2 || (eje.orden.length === n && eje.orden[n - 1] === ultimo));
  // Una vista de antes es otro eje: otra huella aunque tenga lo mismo.
  const h = huella();
  assert.notEqual(new ContextoEje(eje.antes(eje.orden.length), { epoch: eje.epoca() }).huella(), h);
});

test('nada fuera de src/eje.js escribe en la lista de registros de un eje, y src/eje.js solo la alarga o la sustituye', () => {
  const archivos = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (e.name === 'node_modules' ? [] : archivos(join(dir, e.name))) : /\.m?js$/.test(e.name) ? [join(dir, e.name)] : []));
  const escribe = /\.orden\s*\.\s*(splice|pop|shift|unshift|sort|reverse|fill|copyWithin)\s*\(|\.orden\s*\[[^\]]*\]\s*=[^=]|\.orden\.length\s*=[^=]/;
  for (const dir of ['src', 'servidor', 'ejemplos', 'carta']) {
    for (const f of existsSync(dir) ? archivos(dir) : []) assert.ok(!escribe.test(readFileSync(f, 'utf8')), f + ' cambia la lista de registros en su sitio');
  }
  const eje = readFileSync('src/eje.js', 'utf8');
  // En src/eje.js (también recorrido arriba), la lista solo se alarga con push o se sustituye entera con =.
  assert.match(eje, /this\.orden\.push\(/);
  assert.match(eje, /this\.orden = otro\.orden/);
});
