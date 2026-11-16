// Pruebas de regresión de la auditoría de ajuste 2 (docs/notas/AUDITORIA_AJUSTE_2.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ejemploCompra } from '../ejemplos/ikisai/compra-food.mjs';
import { descubrir, consolidar, propuestas, cerrado } from '../src/motor.js';
import { Eje } from '../src/eje.js';
import { leerFormula } from '../src/bqlm.js';
import { contextoDeLectura, leerPosicion } from '../src/contexto-eje.js';
import { item, desdePointed, desdeSequenced } from '../src/escritura.js';
import { cargarEpoca, EPOCA_0 } from '../src/epocas.js';
import { confluir } from '../src/tiempo.js';
import { cortesDe } from '../src/bases.js';
import { pagaElCoste } from './ayudas-coste.js';

const T = '2026-11-07T16:00:00Z';

// A2-02 · una propuesta de la fábrica se reconoce por su anclaje en la fábrica, no por lo que diga su contexto.
// Encargo 3b (VG, 8-11, mapa §15 [D] «Una sola operación: registrar»): ya no hay estados del motor ni autorizar ni
// ejecutar; lo que queda es la lista de propuestas de la fábrica (motor.propuestas), con su lectura de cerrado.
test('A2-02: un registro que se dice «de la fábrica» escrito fuera de ella no es una propuesta', async () => {
  const { eje, compra } = await ejemploCompra();
  const falsa = await eje.escribir({
    autor: 'huesped', sobre: compra.id, en: '7000000000', t: T,
    movimientos: [pagaElCoste('huesped')],
    payload: 'mañana',
    contexto: { motor: 'fabrica', fase: 'consolidado' },
  });
  assert.equal(propuestas(eje, compra.id).length, 0);
  // Anclado en la posición 4, pero sin motor 'fabrica', tampoco cuenta.
  const sinMotor = await eje.escribir({
    autor: 'huesped', sobre: compra.id, en: '4000000000', t: T,
    movimientos: [pagaElCoste('huesped')],
    payload: 'x', contexto: { fase: 'consolidado' },
  });
  assert.equal(propuestas(eje, compra.id).length, 0);
  void sinMotor;
  // La propuesta que escribe consolidar sí cuenta; sin nada anunciado, su lectura es «cerrada».
  const c = await consolidar(eje, { autor: 'huesped', foco: compra.id, t: T, titulo: 'Pago', elecciones: { 1: 'un menú', 4: 'pagar' } });
  assert.deepEqual(propuestas(eje, compra.id).map((x) => [x.id, x.cerrado]), [[c.id, true]]);
  assert.equal(cerrado(eje, c.id).plantilla, 'all announced movements happened');
});

// A2-03 · descubrir da a cada candidato el estado de su camino exacto; la posición 0 es solo su etiqueta.
test('A2-03: [1] y [1, 0] se distinguen, y una fórmula pendiente en la 0 no vuelve pendiente al candidato', async () => {
  const { eje, compra } = await ejemploCompra();
  const escrito = await eje.escribir({
    autor: 'cocina', sobre: compra.id, en: '1000000000', t: T,
    movimientos: [{ token: 'T', escala: 'minuto', cantidad: 3, de: 'cocina', a: null }],
    payload: ['=(payload("' + 'f'.repeat(64) + '")).1', 'ensalada', 'nota'], // un registro que no está: PENDIENTE
  });
  const [p1] = descubrir(eje, compra.id, { posiciones: [1] });
  const propio1 = p1.candidatos.find((c) => c.origen === 'propio' && c.camino.length === 1);
  const propio10 = p1.candidatos.find((c) => c.origen === 'propio' && c.camino.length === 2);
  assert.notEqual(propio1.texto, propio10.texto);
  const e = p1.candidatos.find((c) => c.evento === escrito.id);
  assert.equal(e.estado, 'RESUELTO'); // el registro escrito entero
  assert.match(e.etiqueta, /^PENDIENTE/); // su posición 0, solo como etiqueta
});

// A2-06 · los cortes de las cajas son regla de la época: una época cargada de datos puede llevarlos.
test('A2-06: cargarEpoca lee y valida los cortes; confluir acepta la época por nombre y usa sus cortes', async () => {
  const cortes = [1, 2, 3, 4, 6, 10, 16, 26, 42];
  const conCortes = cargarEpoca({ nombre: 'prueba', reglas: [], cortes: { posiciones: cortes } }, { respaldo: EPOCA_0 });
  assert.deepEqual(conCortes.cortes('posiciones'), cortes);
  assert.deepEqual(conCortes.cortes('escritos'), cortes); // una sola escala para todas las medidas (VG, 8-11)
  // VG, 7-11 noche (decisión 2): la época 0 trae la escala provisional 1 2 3 4 6 10 16 26 42 en sus datos.
  assert.deepEqual(EPOCA_0.cortes('posiciones'), [1, 2, 3, 4, 6, 10, 16, 26, 42]);
  assert.throws(() => cargarEpoca({ nombre: 'mal', reglas: [], cortes: { posiciones: [3, 2, 1] } }, { respaldo: EPOCA_0 }), /nueve umbrales crecientes/);
  const { eje, compra } = await ejemploCompra();
  assert.doesNotThrow(() => confluir(eje, compra.id, { epoca: 'época 0' }));
  // R7: los cortes son de las cantidades; las posiciones son un recuento y no tienen.
  const conCortesT = cargarEpoca({ nombre: 'prueba T', reglas: [], cortes: { 'T:hora': cortes } }, { respaldo: EPOCA_0 });
  assert.deepEqual(confluir(eje, compra.id, { epoca: conCortesT }).tokens['T:hora'].origenCortes, 'epoca');
  assert.equal(cortesDe('T:hora', conCortesT).origen, 'epoca');
  assert.throws(() => cortesDe('posiciones', conCortes), /recuento informativo/);
});

// A2-01 · una cadena de cifras es una cadena literal; el número lo da el JSON.
test('A2-01: «0034» y «120» escritos como texto se leen como texto, sin perder ceros', async () => {
  const eje = await Eje.genesis({
    demostracion: true,
    identidad: 'raiz', t: T,
    emision: [],
    foco: ['Registro', 'x', '0034', '120', 'Mesa 4', '12 EUR', 120],
  });
  const g = eje.genesisId;
  // Con el BQL mínimo (retirada de BQL V0, #113): lo escrito se lee con payload(it).
  const f = (formula) => leerFormula(formula, { k: 'reg', id: g }, contextoDeLectura(eje)).valor;
  assert.deepEqual(leerPosicion(eje, g, [2]).valor, ['0034']);
  assert.deepEqual(f('=first (payload(it)).2 = "0034"'), [true]);
  assert.deepEqual(f('=first (payload(it)).3 = "120"'), [true]);
  assert.deepEqual(f('=first (payload(it)).3 = 120'), [false]); // un texto no es el número
  assert.deepEqual(leerPosicion(eje, g, [6]).valor, [120]); // número JSON
  assert.deepEqual(f('=(payload(it)).5.1'), [12]); // «12 EUR»: su .1 es la cantidad (D-VALOR)
  assert.deepEqual(f('=(payload(it)).2.1'), []); // «0034» no es una magnitud
});

// A2-04 · item() conserva como texto una dirección de diez dígitos.
test('A2-04: una dirección escrita desde un modo sigue siendo dirección para BQL', async () => {
  const { eje, compra } = await ejemploCompra();
  assert.equal(item(eje, '0400000000'), '0400000000');
  assert.equal(item(eje, '4000000000'), '4000000000');
  assert.equal(desdePointed(eje, '0400000000'), '0400000000');
  assert.equal(item(eje, '120'), 120); // lo demás, igual que antes
  const hilera = desdeSequenced(eje, ['Busco', 'a', 'b', 'c', 'd', '1000000000']);
  assert.equal(hilera[5], '1000000000');
  const r = await eje.escribir({
    autor: 'huesped', sobre: compra.id, t: T,
    movimientos: [pagaElCoste('huesped')],
    payload: hilera,
  });
  // Con el BQL mínimo: el 5 es el texto de la dirección y sirve para buscar lo anclado ahí (el en de cada registro).
  const f = (formula) => leerFormula(formula, { k: 'reg', id: r.id }, contextoDeLectura(eje));
  assert.deepEqual(f('=first (payload(it)).5 = "1000000000"').valor, [true]);
  await eje.escribir({ autor: 'huesped', sobre: r.id, en: '1000000000', t: T, movimientos: [pagaElCoste('huesped')], payload: 'una' });
  assert.deepEqual(f('=count (down it where last it2.6.5 = first (payload(it)).5)').valor, f('=count (down it where last it2.6.5 = "1000000000")').valor);
  assert.deepEqual(f('=count (down it where last it2.6.5 = first (payload(it)).5)').valor, [1]);
});
