// Doble ejecución de la retirada de BQL V0 (#113; encargo «retirar BQL V0», paso 3). Prueba TEMPORAL: se borra con
// src/bql.js. Para cada fórmula de los tres ejemplos (compra, reserva, tarea) y de los fixtures con fórmulas (las
// compras vecinas y las compras hermanas), la vieja con el V0 y la nueva con el BQL mínimo SOBRE EL MISMO LIBRO: el de
// los ejemplos de ahora, con la vieja puesta en su sitio en una vista del registro (el payload de antes, solo para
// leerla). Las cantidades tienen que coincidir; la unidad va aparte (la nueva la lleva escrita en el .2 de la
// magnitud desplegada). Las que no tienen equivalente se listan con su porqué. La tabla: docs/notas/RETIRADA_BQL_V0.md.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluar as evaluarV0, consultar as consultarV0 } from '../src/bql.js';
import { leerPosicion } from '../src/contexto-eje.js';
import { ejemploCompra, ejemploCuenta, ejemploComprasVecinas } from '../ejemplos/ikisai/compra-food.mjs';
import { ejemploComprasHermanas } from '../ejemplos/ikisai/compras-hermanas.mjs';
import { ejemploReserva } from '../ejemplos/ikisai/reserva-booking.mjs';
import { ejemploTarea } from '../ejemplos/ikisai/tarea-tasks.mjs';
import { escribirDesde } from '../src/escritura.js';

/** El payload con `valor` en `camino` (una copia). */
function con(payload, camino, valor) {
  const copia = structuredClone(payload);
  let nodo = copia;
  for (const i of camino.slice(0, -1)) nodo = nodo[i];
  nodo[camino.at(-1)] = valor;
  return copia;
}

/** El eje con el registro `id` leído con otro payload (el de antes): lo demás, el mismo libro. */
function vistaCon(eje, id, payload) {
  const ev = { ...eje.obtener(id), payload };
  const propio = { obtener: (x) => (x === id ? ev : eje.obtener(x)) };
  return new Proxy(propio, {
    get(o, k) {
      if (Object.hasOwn(o, k)) return o[k];
      const v = eje[k];
      return typeof v === 'function' ? v.bind(eje) : v;
    },
  });
}

/** Lo que vale una lectura del V0, como cantidades: un número, las partes de una composición o los ids de una colección. */
function delV0(r) {
  if (r.estado !== 'RESUELTO') return { estado: r.estado.startsWith('PENDIENTE') ? 'PENDIENTE' : r.estado };
  const v = r.valor;
  if (v.tipo === 'numero') return { cantidad: v.valor };
  if (v.tipo === 'magnitud') return { cantidad: v.cantidad, unidad: v.unidad };
  if (v.tipo === 'composicion') return { partes: v.partes.map((p) => ({ cantidad: p.cantidad, unidad: p.unidad })) };
  if (v.tipo === 'coleccion') return { registros: v.items.map((i) => i.evento) };
  return { texto: r.texto };
}

/** Lo que vale una lectura del BQL mínimo en `camino` (y su unidad en el .2 de la magnitud desplegada, si se pide). */
function delBqlm(eje, id, camino, { unidad, indice } = {}) {
  const r = leerPosicion(eje, id, camino, indice === undefined ? {} : { indice });
  if (r.estado !== 'RESUELTO') return { estado: r.estado };
  if (r.valor.every((o) => o?.k === 'reg')) return { registros: r.valor.map((o) => o.id) }; // también vacía: ningún registro
  assert.equal(r.valor.length, 1, 'una cantidad: ' + r.texto);
  const u = unidad ? leerPosicion(eje, id, unidad).valor[0] : undefined;
  return { cantidad: r.valor[0], ...(u === undefined ? {} : { unidad: u }) };
}

const filas = [];

/**
 * Una fórmula: la vieja (en el payload de antes, en `caminoViejo`; con `indice`, el elemento de la lista) y la nueva
 * (en `camino`; la unidad, en `unidad`). `antes` pone en el payload de antes las otras fórmulas viejas que la vieja lee.
 */
function caso({ nombre, eje, id, vieja, caminoViejo, camino, unidad, indice, antes = [] }) {
  let payloadViejo = eje.obtener(id).payload;
  for (const [c, f] of [...antes, [caminoViejo, vieja]]) payloadViejo = con(payloadViejo, c, indice !== undefined && c === caminoViejo ? Object.assign([...getEn(payloadViejo, c)], { [indice]: f }) : f);
  const vista = vistaCon(eje, id, payloadViejo);
  const viejo = delV0(indice === undefined ? evaluarV0(vista, id, caminoViejo) : consultarV0(vista, id, caminoViejo, vieja));
  const nuevaTexto = leerPosicion(eje, id, camino, indice === undefined ? {} : { indice }).formula;
  const nuevo = delBqlm(eje, id, camino, { unidad, indice });
  filas.push({ nombre, vieja, nueva: nuevaTexto, viejo, nuevo });
  return { viejo, nuevo };
}

function getEn(payload, camino) {
  let nodo = payload;
  for (const i of camino) nodo = nodo[i];
  return nodo;
}

const cantidadesIguales = ({ viejo, nuevo }, nombre) => {
  assert.equal(nuevo.cantidad, viejo.cantidad, nombre);
  if (viejo.unidad !== undefined) assert.equal(nuevo.unidad, viejo.unidad, nombre + ' (la unidad, aparte)');
};

test('compra: la cuenta (precio de la compra + propina) y las compras vecinas (pendiente y resuelta)', async () => {
  const c = await ejemploCompra();
  const cuenta = await ejemploCuenta(c.eje, c.compra);
  cantidadesIguales(caso({
    nombre: 'cuenta, 1: precio de la compra + propina', eje: c.eje, id: cuenta.id,
    vieja: '=REF("' + c.compra.id.slice(0, 8) + '", "1200000000") + 2 EUR', caminoViejo: [1], camino: [1, 1], unidad: [1, 2],
  }), 'cuenta 1');
  const v = await ejemploComprasVecinas(c.eje, c);
  const pendiente = caso({ nombre: 'vecina, 1: espera la posición 5', eje: c.eje, id: v.vecinas[0].id, vieja: '=LOCAL(5)', caminoViejo: [1], camino: [1] });
  assert.deepEqual([pendiente.viejo.estado, pendiente.nuevo.estado], ['PENDIENTE', 'PENDIENTE']);
  cantidadesIguales(caso({
    nombre: 'vecina, 1.1: la cantidad de la 1.0 + 1', eje: c.eje, id: v.vecinas[1].id,
    vieja: '=LOCAL(0, 0) + 1 EUR', caminoViejo: [1, 1], camino: [1, 1, 1], unidad: [1, 1, 2],
  }), 'vecina 1.1');
});

test('compras hermanas: dos guisos, la sopa con descuento y la pendiente de la 9', async () => {
  const h = await ejemploComprasHermanas();
  const guisos = h.eje.orden.map((x) => h.eje.obtener(x)).find((e) => Array.isArray(e.payload) && e.payload[0] === 'Compra de dos guisos');
  const sopa = h.eje.orden.map((x) => h.eje.obtener(x)).find((e) => Array.isArray(e.payload) && e.payload[0] === 'Sopa para llevar');
  cantidadesIguales(caso({ nombre: 'dos guisos, 1.2: 2 × 6', eje: h.eje, id: guisos.id, vieja: '=2 * 6 EUR', caminoViejo: [1, 2], camino: [1, 2, 1], unidad: [1, 2, 2] }), 'guisos');
  cantidadesIguales(caso({ nombre: 'sopa, 1.2: 9 − 2', eje: h.eje, id: sopa.id, vieja: '=9 EUR - 2 EUR', caminoViejo: [1, 2], camino: [1, 2, 1], unidad: [1, 2, 2] }), 'sopa');
  const p = caso({ nombre: 'dos guisos, 4[1]: espera la 9', eje: h.eje, id: guisos.id, vieja: '=LOCAL(9)', caminoViejo: [4], camino: [4], indice: 1 });
  assert.deepEqual([p.viejo.estado, p.nuevo.estado], ['PENDIENTE', 'PENDIENTE']);
});

test('reserva: el total (precio por noche × noches)', async () => {
  const r = await ejemploReserva();
  cantidadesIguales(caso({
    nombre: 'reserva, 1.3: precio por noche × noches', eje: r.eje, id: r.reserva.id,
    vieja: '=LOCAL(2) * LOCAL(1)', caminoViejo: [1, 3], camino: [1, 3, 1], unidad: [1, 3, 2],
  }), 'reserva 1.3');
});

test('tarea: el coste, el tiempo, el coste y el tiempo del 8 y la elección del 9', async () => {
  const t = await ejemploTarea({ hasta: 'presupuestos' });
  const coste = '=LOCAL(0, 1) + LOCAL(0, 2) + LOCAL(0, 3)';
  const tiempo = '=LOCAL(0, 1, 1) + LOCAL(0, 2, 1) + LOCAL(0, 3, 1) + LOCAL(0, 4, 1)';
  const base = { eje: t.eje, id: t.tarea.id };
  cantidadesIguales(caso({ ...base, nombre: 'tarea, 1.1: coste total', vieja: coste, caminoViejo: [1, 1], camino: [1, 1, 1], unidad: [1, 1, 2] }), 'coste');
  cantidadesIguales(caso({ ...base, nombre: 'tarea, 4.1: tiempo previsto', vieja: tiempo, caminoViejo: [4, 1], camino: [4, 1, 1], unidad: [4, 1, 2] }), 'tiempo');
  // El 8: la composición «EUR + horas» del V0 leía (encadenaba) el 1.1 y el 4.1; la nueva son dos magnitudes desplegadas.
  const antes = [[[1, 1], coste], [[4, 1], tiempo]];
  const comp = caso({ ...base, nombre: 'tarea, 8.1: el coste (de la composición del 8)', vieja: '=LOCAL(1, 1) + LOCAL(4, 1)', caminoViejo: [8], camino: [8, 1, 1], unidad: [8, 1, 2], antes });
  const tiempo8 = delBqlm(t.eje, t.tarea.id, [8, 2, 1], { unidad: [8, 2, 2] });
  filas.push({ nombre: 'tarea, 8.2: el tiempo (de la composición del 8)', vieja: '=LOCAL(1, 1) + LOCAL(4, 1)', nueva: leerPosicion(t.eje, t.tarea.id, [8, 2, 1]).formula, viejo: comp.viejo, nuevo: tiempo8 });
  assert.deepEqual(comp.viejo.partes, [comp.nuevo, tiempo8]);
  // El 9: el presupuesto elegido, el mismo registro.
  const eleccion = caso({ ...base, nombre: 'tarea, 9: el primer presupuesto que cabe', vieja: '=ELEGIR(FILTRAR(FILTRAR(BUSCAR(LOCAL(5)), ORIGEN() = "escrito"), Y(ACTUAL(1) <= LOCAL(1, 1), ACTUAL(2) <= LOCAL(2, 1))))', caminoViejo: [9], camino: [9], antes });
  assert.deepEqual(eleccion.nuevo.registros, eleccion.viejo.registros);
  assert.deepEqual(eleccion.nuevo.registros, [t.presupuestos[1].id]);
});

test('tarea: la elección del 9 con un presupuesto ajeno, uno lento, el caro, uno que cabe y una nota terminal', async () => {
  const t = await ejemploTarea({ hasta: 'tarea' });
  const vieja = '=ELEGIR(FILTRAR(FILTRAR(BUSCAR(LOCAL(5)), ORIGEN() = "escrito"), Y(ACTUAL(1) <= LOCAL(1, 1), ACTUAL(2) <= LOCAL(2, 1))))';
  const antes = [[[1, 1], '=LOCAL(0, 1) + LOCAL(0, 2) + LOCAL(0, 3)']];
  const escribe = (autor, horaT, payload) => escribirDesde(t.eje, { modo: 'sequenced', autor, sobre: t.tarea.id, en: t.tarea.payload[5], t: '2026-11-07T' + horaT + ':00Z', payload });
  const vacia = caso({ eje: t.eje, id: t.tarea.id, nombre: 'tarea, 9: sin presupuestos', vieja, caminoViejo: [9], camino: [9], antes });
  assert.deepEqual([vacia.viejo.registros, vacia.nuevo.registros], [[], []]);
  await escribe('casa', '16:00', ['yo mismo', '349 EUR', '1 h', 'casa']); // ajeno: la casa no está en el 3 de la tarea
  await escribe('proveedor', '17:00', ['Presupuesto: carpa con suelo de madera', '420 EUR', '5 h', 'proveedor']); // caro
  await escribe('proveedor', '18:00', ['Presupuesto: sin prisa', '200 EUR', '9 h', 'proveedor']); // lento
  const cabe = await escribe('proveedor', '19:00', ['Presupuesto corregido: carpa sin suelo', '310 EUR', '6 h', 'proveedor']);
  const e = caso({ eje: t.eje, id: t.tarea.id, nombre: 'tarea, 9: ajeno, caro, lento y el que cabe', vieja, caminoViejo: [9], camino: [9], antes });
  assert.deepEqual([e.viejo.registros, e.nuevo.registros], [[cabe.id], [cabe.id]]);
  await escribe('proveedor', '20:00', 'una nota terminal en los recursos');
  const nota = caso({ eje: t.eje, id: t.tarea.id, nombre: 'tarea, 9: con una nota terminal en el 1', vieja, caminoViejo: [9], camino: [9], antes });
  assert.deepEqual([nota.viejo.estado, nota.nuevo.estado], ['PENDIENTE', 'PENDIENTE']);
});

test('la tabla', () => {
  const v = (x) => (x.estado ?? (x.registros ? x.registros.map((i) => i.slice(0, 8)).join(', ') : x.partes ? x.partes.map((p) => p.cantidad + ' ' + p.unidad).join(' + ') : x.cantidad + (x.unidad ? ' ' + x.unidad : '')));
  for (const f of filas) console.log('| ' + f.nombre + ' | `' + f.vieja + '` | `' + f.nueva + '` | ' + v(f.viejo) + ' | ' + v(f.nuevo) + ' |');
  assert.ok(filas.length >= 12);
});
