// Lo provisional (Core AGRAM 18-11; docs/notas/NUCLEO_6_7_8.md, decisión 13): los JSON de datos/provisional/ mandan y
// src/provisional.js importa sus copias generadas (datos/provisional/generar.mjs), sin fetch ni módulos JSON. Esta prueba
// falla si una copia no está al día con su JSON o si algo de src/ importa un módulo JSON.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { COPIAS, generar } from '../datos/provisional/generar.mjs';
import { TIPOS_PROVISIONALES, LECTURAS_PROVISIONALES } from '../src/provisional.js';

test('cada copia de datos/provisional/ está al día con su JSON (node datos/provisional/generar.mjs)', () => {
  for (const [fuente, copia, nombre] of COPIAS) {
    assert.equal(readFileSync(join('datos/provisional', copia), 'utf8'), generar(fuente, nombre), copia + ' no está al día con ' + fuente);
  }
});

test('src/provisional.js da lo mismo que los JSON, congelado', () => {
  assert.deepEqual(structuredClone(TIPOS_PROVISIONALES), JSON.parse(readFileSync('datos/provisional/tipos.json', 'utf8')));
  assert.deepEqual(structuredClone(LECTURAS_PROVISIONALES), JSON.parse(readFileSync('datos/provisional/lecturas.json', 'utf8')));
  assert.ok(Object.isFrozen(TIPOS_PROVISIONALES) && Object.isFrozen(LECTURAS_PROVISIONALES[0][2]));
});

test('ningún archivo de src/ importa un módulo JSON (with { type … })', () => {
  const archivos = [...readdirSync('src').filter((f) => f.endsWith('.js')).map((f) => 'src/' + f), ...readdirSync('src/condiciones').filter((f) => f.endsWith('.js')).map((f) => 'src/condiciones/' + f)];
  for (const f of archivos) assert.ok(!/with\s*\{\s*type/.test(readFileSync(f, 'utf8')), f);
});

test('«chosen cohort» en X.8.5: la acción que escribe la cohorte elegida es dato de la lectura, no del núcleo', async () => {
  const { posicionDeLectura, nombreDeRegla } = await import('../src/bqlm.js');
  const l = LECTURAS_PROVISIONALES.find((r) => posicionDeLectura(r) === 'X.8.5');
  assert.equal(nombreDeRegla(l), 'chosen cohort');
  assert.ok(l[2][0].includes('"change cohort"'));
  assert.ok(!readFileSync('src/contrato.js', 'utf8').includes("'change cohort'"), 'src/contrato.js ya no nombra «change cohort»');
});

test('las cadenas: lo que encadena las tareas es dato (datos/provisional/cadenas.json) y src/cadenas.js no lo nombra', async () => {
  const { CADENAS_PROVISIONALES } = await import('../src/provisional.js');
  const { NOMBRES_DE_LAS_CADENAS } = await import('../src/cadenas.js');
  const [d] = CADENAS_PROVISIONALES;
  assert.deepEqual([d[0][0], d[1][0], d[2][0], d[3][0], d[4][0], d[5][0], d[7][0]], ['chains', 'this goes after', '2.6', '6', 'task', 'close', 'deliver']);
  assert.deepEqual({ ...NOMBRES_DE_LAS_CADENAS }, { relacion: 'this goes after', tarea: 'task', cierre: 'close', entrega: 'deliver' });
  const fuente = readFileSync('src/cadenas.js', 'utf8');
  for (const n of ['this goes after', 'task', 'close', 'deliver']) assert.ok(!fuente.includes("'" + n + "'"), 'src/cadenas.js nombra «' + n + '»');
});

// ---------- las plantillas de transacción provisionales (Core AGRAM 18-11; VG 18-11: «poner nombre», la zona y el paso) ----------

const NOMBRAR = 'name it';
const ZONA = 'a zone of the face';
const PASO = 'a step of the guide';
const T = '2026-11-18T10:00:00Z';

/** Los ids de las cinco épocas, que lo provisional no cambia (no está en su 9.6 ni en sus registros). */
const IDS = Object.freeze({
  0: '7c1d49087209c41e03a38ef5e1c6aec6007a7515d1030f37ddea13e8a35a8448',
  state: '38540840c23107ce405fa4d454672eaef97d4efa07f79e15bd34ff29ff0af7c5',
  'guia-libro': '7d81ba8a633c24ec06bf3f6630ec4313092741974f77b1e106cbe673e6c858bf',
  roadmap: '50fbac2fee8f81cdc3390c03ba28546f7a2a88cf363b36db10540a8cb12fbbe3',
  cuenta: '58d457eed36e43b19b611d5bb3487c2eb7e461c52b8ce19d110aac026a4c0558',
});

/** Las cuatro épocas hijas, escritas (las de datos/epocas/<nombre>/). */
async function hijas() {
  return {
    state: (await import('../datos/epocas/state/generar.mjs')).epocaState(),
    'guia-libro': (await import('../datos/epocas/guia-libro/generar.mjs')).epocaGuiaLibro(),
    roadmap: (await import('../datos/epocas/roadmap/generar.mjs')).epocaRoadmap(),
    cuenta: (await import('../datos/epocas/cuenta/generar.mjs')).epocaCuenta(),
  };
}

/** Un libro de demostración con esa época escrita (o la 0), su autora y una lectora invitada. */
async function libro(epoca) {
  const { Eje } = await import('../src/eje.js');
  const eje = await Eje.genesis({ identidad: 'autora', foco: 'libro de prueba', t: T, emision: [{ token: 'R', cantidad: 10 }], ...(epoca ? { epoca } : {}), demostracion: true });
  await eje.aceptar(await eje.invitar({ autor: 'autora', invitado: 'lectora', t: T }), {}, { t: T });
  return eje;
}

/** Lanza una plantilla como `quien` y la asienta; falla si no pasa. */
async function hacer(eje, nombre, X, params, quien) {
  const A = await import('../src/acciones.js');
  const r = await A.transaccion(eje, nombre, { X, ...params }, quien, { t: T });
  assert.ok(r.ok, nombre + ': ' + JSON.stringify(r.motivos));
  return eje.anadir(r.evento);
}

test('las plantillas provisionales: el JSON manda, congeladas, con el molde de la época; la zona y el paso son los de la guía salvo su 6 y su 7', async () => {
  const { PLANTILLAS_PROVISIONALES } = await import('../src/provisional.js');
  assert.deepEqual(structuredClone(PLANTILLAS_PROVISIONALES), JSON.parse(readFileSync('datos/provisional/plantillas.json', 'utf8')));
  assert.ok(Object.isFrozen(PLANTILLAS_PROVISIONALES) && Object.isFrozen(PLANTILLAS_PROVISIONALES[0][1][0]));
  assert.deepEqual(PLANTILLAS_PROVISIONALES.map((p) => p[0][0]), [NOMBRAR, ZONA, PASO]);
  for (const p of PLANTILLAS_PROVISIONALES) {
    assert.equal(p.length, 10);
    assert.ok(p.every((x) => Array.isArray(x) && x.length > 0), p[0][0] + ': las diez posiciones llenas');
    assert.deepEqual(p[7], ['epoch 0'], p[0][0] + ': irá a la 0');
  }
  for (const [n, f] of [[ZONA, 'a-zone-of-the-face.json'], [PASO, 'a-step-of-the-guide.json']]) {
    const fuente = JSON.parse(readFileSync('datos/epocas/guia-libro/plantillas/' + f, 'utf8'));
    const p = PLANTILLAS_PROVISIONALES.find((x) => x[0][0] === n);
    assert.deepEqual([...p.slice(0, 6), p[8], p[9]], [...fuente.slice(0, 6), fuente[8], fuente[9]], n);
    assert.deepEqual(p[6].slice(1), fuente[6], n + ': su procedencia, la de la guía con una nota delante');
  }
  // «name it»: el molde de «rename a conversation», general; en el punto de vista 0, en un orden que no usa nadie.
  const p = PLANTILLAS_PROVISIONALES[0];
  assert.deepEqual(p[1].map((x) => [x[0][0], x[1][0], x[5][0], x[7][0]]), [['name', 'text', '0', 'required'], ['about', 'ref', '1', 'required'], ['criteria', 'text', '2', 'required'], ['who', 'identity', '3', 'required'], ['actions', 'text', '4', 'required']]);
  assert.deepEqual([p[3], p[4], p[5], p[8]], [[['me'], ['person']], ['write'], ['0'], [0, 7]]);
  const { EPOCA_0_BTML, cargarEpocaEscrita } = await import('../src/epocas.js');
  for (const e of [EPOCA_0_BTML, ...Object.values(await hijas()).map((x) => cargarEpocaEscrita(x))]) {
    const pv0 = e.transacciones.filter((t) => !t.provisional && t.plantilla[8][0] === 0).map((t) => t.plantilla[8][1]);
    assert.ok(!pv0.includes(7), e.nombre + ': el orden [0, 7] está libre');
  }
});

test('toda época cargada ofrece las provisionales que no tiene por su nombre, marcadas y con su id; los ids de las cinco épocas no cambian', async () => {
  const { EPOCA_0_BTML, cargarEpocaEscrita, idDeRegistro } = await import('../src/epocas.js');
  const { PLANTILLAS_PROVISIONALES } = await import('../src/provisional.js');
  const epocas = { 0: EPOCA_0_BTML, ...Object.fromEntries(Object.entries(await hijas()).map(([n, x]) => [n, cargarEpocaEscrita(x)])) };
  for (const [n, e] of Object.entries(epocas)) {
    assert.equal(e.id, IDS[n], n + ': su id no cambia');
    const provisionales = e.transacciones.filter((t) => t.provisional);
    // Lo de la época gana: la del libro de la guía y la de cuenta traen la zona y el paso.
    const esperadas = n === 'guia-libro' || n === 'cuenta' ? [NOMBRAR] : [NOMBRAR, ZONA, PASO];
    assert.deepEqual(provisionales.map((t) => t.plantilla[0][0]), esperadas, n);
    for (const t of provisionales) {
      assert.equal(t.id, idDeRegistro(PLANTILLAS_PROVISIONALES.find((p) => p[0][0] === t.plantilla[0][0])), n + ': el id, el hash de su cuerpo canónico');
      assert.ok(!e.registros.has(t.id), n + ': no es un registro de la época');
    }
    const nombres = e.transacciones.map((t) => t.plantilla[0][0]);
    assert.equal(new Set(nombres).size, nombres.length, n + ': ningún nombre dos veces');
  }
});

test('«name it» en un libro de la época 0: se ofrece en el 0 de lo mío y no en lo de otro; el nombre se lee; el de otro no cuenta', async () => {
  const A = await import('../src/acciones.js');
  const C = await import('../src/contrato.js');
  const eje = await libro(null);
  const el = await hacer(eje, 'anchor here', eje.genesisId, { title: 'Primeros pasos' }, 'autora');
  const ofrecida = (X, quien) => A.acciones(eje, X, 0, quien).some((a) => a.nombre === NOMBRAR);
  assert.ok(ofrecida(el.id, 'autora'), 'a quien lo escribió');
  assert.ok(!ofrecida(el.id, 'lectora'), 'a otra persona, no');
  assert.ok(ofrecida(eje.alta('lectora').id, 'lectora') && !ofrecida(eje.alta('lectora').id, 'autora'), 'a la persona sobre su propia alta');
  assert.equal(A.acciones(eje, el.id, 0, 'autora', { idioma: 'es' }).find((a) => a.nombre === NOMBRAR).etiqueta, 'poner nombre');
  const n = await hacer(eje, NOMBRAR, el.id, { name: 'Mi elemento' }, 'autora');
  assert.deepEqual([n.sobre, n.en, n.payload], [el.id, '0000000000', [['Mi elemento'], [{ ref: el.id }], ['all announced movements happened'], ['autora'], [NOMBRAR]]]);
  assert.deepEqual(C.representaciones(eje, el.id).map((r) => r.texto), ['Mi elemento']);
  assert.equal(C.ceroLegible(eje, el.id, { idioma: 'es' }).texto, 'Mi elemento');
  assert.equal(C.legible(eje, { ref: el.id }, undefined, { idioma: 'es' }).texto, 'Mi elemento', 'quien lo nombra lo lee por su nombre');
  // Lo escrito por otro se ignora, no se rechaza.
  const otro = await A.transaccion(eje, NOMBRAR, { X: el.id, name: 'De la lectora' }, 'lectora', { t: T });
  assert.ok(otro.ok);
  await eje.anadir(otro.evento);
  assert.deepEqual(C.representaciones(eje, el.id).map((r) => r.texto), ['Mi elemento']);
  // Vale el último de quien podía; en su alta, la persona.
  await hacer(eje, NOMBRAR, el.id, { name: 'Otro nombre' }, 'autora');
  assert.deepEqual(C.representaciones(eje, el.id).map((r) => r.texto), ['Otro nombre']);
  await hacer(eje, NOMBRAR, eje.alta('lectora').id, { name: 'Lectora' }, 'lectora');
  assert.deepEqual(C.representaciones(eje, eje.alta('lectora').id).map((r) => r.texto), ['Lectora']);
  // Lo escrito no se toca: el 0 del registro sigue siendo el suyo para el BQL (X.0.d), y un nombre vacío no pasa.
  const { evaluar } = await import('../src/bqlm.js');
  const { ContextoEje } = await import('../src/contexto-eje.js');
  assert.deepEqual(evaluar('it.0', new ContextoEje(eje, { epoch: eje.epoca() }), { sujeto: el.id }).valor, ['Primeros pasos']);
  assert.equal((await A.transaccion(eje, NOMBRAR, { X: el.id, name: '' }, 'autora', { t: T })).ok, false);
  assert.equal((await A.transaccion(eje, NOMBRAR, { X: el.id, name: 'x'.repeat(41) }, 'autora', { t: T })).ok, false, 'como mucho 40 bytes');
});

test('«name it», la zona y el paso en un libro de la época state; en los de la guía y de cuenta, sus plantillas siguen siendo las suyas', async () => {
  const A = await import('../src/acciones.js');
  const C = await import('../src/contrato.js');
  const G = await import('../src/guia-libro.js');
  const { cargarEpocaEscrita } = await import('../src/epocas.js');
  const h = await hijas();
  const eje = await libro(h.state);
  const el = await hacer(eje, 'anchor here', eje.genesisId, { title: 'Un elemento' }, 'autora');
  assert.ok(A.acciones(eje, el.id, 0, 'autora').some((a) => a.nombre === NOMBRAR));
  assert.ok(!A.acciones(eje, el.id, 0, 'lectora').some((a) => a.nombre === NOMBRAR));
  await hacer(eje, NOMBRAR, el.id, { name: 'Con nombre' }, 'autora');
  assert.deepEqual(C.representaciones(eje, el.id).map((r) => r.texto), ['Con nombre']);
  assert.ok(A.acciones(eje, el.id, 2, 'autora').some((a) => a.nombre === ZONA) && A.acciones(eje, el.id, 4, 'autora').some((a) => a.nombre === PASO));
  await hacer(eje, ZONA, el.id, { label: 'Ir', x: 100, y: 100, width: 300, height: 120, record: el.id }, 'autora');
  await hacer(eje, PASO, el.id, { title: 'Ponle nombre', action: NOMBRAR, why: 'para reconocerlo' }, 'autora');
  assert.deepEqual(G.zonas(eje, el.id).map((z) => z.etiqueta), ['Ir']);
  assert.deepEqual(G.pasosDeGuia(eje, el.id).map((p) => [p.titulo, p.accion]), [['Ponle nombre', NOMBRAR]]);
  // La zona no es un nombre: el nombre sigue siendo el de «name it».
  assert.deepEqual(C.representaciones(eje, el.id).map((r) => r.texto), ['Con nombre']);
  // En los libros de la guía y de cuenta, la zona y el paso son los suyos (su id), no los provisionales.
  for (const n of ['guia-libro', 'cuenta']) {
    const e = cargarEpocaEscrita(h[n]);
    for (const p of [ZONA, PASO]) assert.equal(A.plantillasDeTransaccion({ epoca: e }).find((x) => x.nombre === p).id, e.transacciones.find((t) => !t.provisional && t.plantilla[0][0] === p).id, n + ': ' + p);
  }
});

test('los textos de las provisionales en español, por lo provisional; sin-traducir limpio en las cinco épocas', async () => {
  const C = await import('../src/contrato.js');
  const { sinTraducir } = await import('../docs/sin-traducir.mjs');
  const { EPOCA_0_BTML, cargarEpocaEscrita } = await import('../src/epocas.js');
  assert.equal(C.texto(null, 'template ' + NOMBRAR, 'es'), 'poner nombre');
  assert.equal(C.texto(null, 'template ' + ZONA, 'es'), 'una zona de la cara');
  assert.equal(C.texto(null, 'template ' + NOMBRAR + ' param name label', 'en'), 'name');
  for (const e of [EPOCA_0_BTML, ...Object.values(await hijas()).map((x) => cargarEpocaEscrita(x))]) assert.deepEqual(sinTraducir('es', { epoca: e }).map((x) => x.clave), [], e.nombre);
});

test('pedir el nombre de todo un libro: una evaluación por registro y versión del eje, y lo mismo que evaluarla cada vez', async () => {
  const C = await import('../src/contrato.js');
  const { evaluar, posicionDeLectura } = await import('../src/bqlm.js');
  const { ContextoEje } = await import('../src/contexto-eje.js');
  const eje = await libro(null);
  const el = await hacer(eje, 'anchor here', eje.genesisId, { title: 'Uno' }, 'autora');
  for (let k = 0; k < 20; k++) await hacer(eje, 'anchor here', el.id, { title: 'Hijo ' + k }, 'autora');
  await hacer(eje, NOMBRAR, el.id, { name: 'Padre' }, 'autora');
  const lectura = LECTURAS_PROVISIONALES.find((r) => posicionDeLectura(r) === C.DONDE_SE_LEE_EL_CERO);
  assert.equal(lectura[0][0], 'name');
  const ctx = new ContextoEje(eje, { epoch: eje.epoca() });
  for (const id of eje.orden) {
    const v = evaluar(lectura[2][0], ctx, { sujeto: id }).valor;
    if (v.length && v.every((x) => typeof x === 'string')) assert.deepEqual(C.representaciones(eje, id).filter((r) => typeof r.texto === 'string').map((r) => r.texto), v, id.slice(0, 8));
  }
  assert.deepEqual(C.representaciones(eje, el.id).map((r) => r.texto), ['Padre']);
  // Un registro nuevo cambia la versión: lo guardado no vale y el nombre nuevo se lee.
  await hacer(eje, NOMBRAR, el.id, { name: 'Padre bis' }, 'autora');
  assert.deepEqual(C.representaciones(eje, el.id).map((r) => r.texto), ['Padre bis']);
});

test('el tutorial reconoce una acción provisional: la ve en epoch.9.6.1 por las transacciones de la época, sin tocarla', async () => {
  const { ejemploReserva } = await import('../ejemplos/ikisai/reserva-booking.mjs');
  const { camino } = await import('../src/acciones.js');
  const { pagaElCoste } = await import('./ayudas-coste.js');
  const { evaluar } = await import('../src/bqlm.js');
  const { ContextoEje } = await import('../src/contexto-eje.js');
  const { EPOCA_0_BTML } = await import('../src/epocas.js');
  const { eje } = await ejemploReserva({ confirmar: false });
  const x = await eje.escribir({ autor: 'casa', sobre: eje.genesisId, t: '2026-11-09T10:00:00Z', payload: ['con camino', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', [NOMBRAR, ZONA, 'anchor here', 'no es nada']], movimientos: [pagaElCoste('casa')] });
  const p = (await camino(eje, x.id, 'casa')).pasos.filter((q) => q.fuente === 'tutorial');
  assert.deepEqual(p.map((q) => [q.hacer?.plantilla, q.hecho]), [[NOMBRAR, false], [ZONA, false], ['anchor here', false]]);
  // El BQL ve en epoch.9.6.1 las suyas y, detrás, las provisionales; su referencia lleva a la plantilla. La época no cambia.
  const ctx = new ContextoEje(eje, { epoch: eje.epoca() });
  const nombres = evaluar('epoch.9.6.1 each 0', ctx, {}).valor;
  const propias = eje.epoca().transacciones.filter((t) => !t.provisional).map((t) => t.plantilla[0][0]);
  assert.deepEqual(nombres, [...propias, NOMBRAR, ZONA, PASO]);
  assert.equal(eje.epoca().registro[9][6][1].length, propias.length, 'la raíz de la época sigue con sus referencias');
  assert.equal(EPOCA_0_BTML.id, IDS[0]);
  // Cumplir el paso: «name it» sobre X lo da por hecho por su ancla.
  await hacer(eje, NOMBRAR, x.id, { name: 'Con nombre' }, 'casa');
  assert.equal((await camino(eje, x.id, 'casa')).pasos.find((q) => q.hacer?.plantilla === NOMBRAR)?.hecho, true);
});
