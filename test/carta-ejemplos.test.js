// Los tres módulos que la carta tomaba de la web antigua, mudados a carta/ al retirarla (#113): los ejemplos
// (carta/ejemplos.js), el conmutador «leído» (carta/leido.js) y el localStorage como comodidad (cuentas.leerLocal y
// cuentas.guardarLocal). En Node no hay localStorage: leer da null y guardar, false, sin romper nada.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { EJEMPLOS, crearEjemplo, elegirEjemplo, ejemploElegido, cargarModulo, motivoAusente, restaurarEjemplo } from '../carta/ejemplos.js';
import { alternarLeido, leidoAbierto } from '../carta/leido.js';
import { leerLocal, guardarLocal, CLAVES_EJEMPLO } from '../carta/cuentas.js';
import { ejemploCompra } from '../ejemplos/ikisai/compra-food.mjs';

const RAIZ = new URL('../carta/ejemplos.js', import.meta.url);
const importarDesdeLaCarta = (ruta) => import(new URL(ruta, RAIZ).href);

test('ejemplos: comida, reserva, tarea, cuenta (la cuenta del banco) firmeza (encargo A18) y criterio (encargo P-5), cada uno con sus identidades y su módulo en el repositorio', () => {
  assert.deepEqual(EJEMPLOS.map((x) => [x.id, x.etiqueta]), [['compra', 'comida'], ['reserva', 'reserva'], ['tarea', 'tarea'], ['cuenta', 'cuenta'], ['firmeza', 'firmeza'], ['criterio', 'criterio']]);
  for (const x of EJEMPLOS) {
    assert.ok(x.identidades.includes(x.identidad));
    assert.ok(existsSync(fileURLToPath(new URL(x.modulo, RAIZ))), x.modulo);
  }
});

test('ejemplos: la comida se construye con claves para quien firma', async () => {
  elegirEjemplo('compra');
  const estado = { claves: {}, identidad: 'huesped', aviso: '' };
  const { eje, foco } = await crearEjemplo(estado, { importar: importarDesdeLaCarta });
  assert.equal(eje.obtener(foco).payload[0], 'Compra del menú del día');
  assert.deepEqual(Object.keys(estado.claves).sort(), ['casa', 'cocina', 'huesped']);
  assert.equal(estado.identidad, 'huesped');
  assert.equal(estado.aviso, '');
  assert.ok(eje.obtener(foco).firma);
});

test('ejemplos: si el módulo de un ejemplo falta, se avisa y sigue la comida; nada se rompe', async () => {
  elegirEjemplo('tarea');
  const estado = { claves: {}, identidad: 'huesped', aviso: '' };
  const noEsta = () => Promise.reject(Object.assign(new Error('Cannot find module'), { code: 'ERR_MODULE_NOT_FOUND' }));
  const sinTarea = (ruta) => (ruta.includes('tarea') ? noEsta() : importarDesdeLaCarta(ruta));
  const { eje, foco } = await crearEjemplo(estado, { importar: sinTarea });
  assert.equal(eje.obtener(foco).payload[0], 'Compra del menú del día');
  assert.equal(ejemploElegido(), 'compra');
  assert.match(estado.aviso, /«tarea» aún no está en este repositorio\. Sigue la comida\./);
  assert.equal(await cargarModulo(EJEMPLOS[1], () => Promise.reject(new TypeError('Failed to fetch dynamically imported module'))), null);
  assert.match(motivoAusente('reserva'), /aún no está en este repositorio/);
  // Un ejemplo que aún llega con una PR lo dice.
  assert.equal(await cargarModulo({ ...EJEMPLOS[1], id: 'prueba-pr', pr: 99 }, () => Promise.reject(new TypeError('Failed to fetch dynamically imported module'))), null);
  assert.match(motivoAusente('prueba-pr'), /aún no está en este repositorio \(llega con la PR #99\)/);
  // Un módulo que está pero pide al núcleo algo que aún no tiene: se dice el motivo real.
  assert.equal(await cargarModulo(EJEMPLOS[1], () => Promise.reject(new SyntaxError("does not provide an export named 'capacidadDe'"))), null);
  assert.match(motivoAusente('reserva'), /no carga con este núcleo: .*capacidadDe/);
  assert.ok(await cargarModulo(EJEMPLOS[1], () => Promise.resolve({})));
  assert.equal(motivoAusente('reserva'), undefined);
  assert.equal(elegirEjemplo('desconocido'), 'compra');
});

test('ejemplos: al abrir un eje guardado, una identidad que exista en él (sin foco guardado, ninguno)', async () => {
  const { eje } = await ejemploCompra();
  const estado = { identidad: 'organizadora' };
  elegirEjemplo('compra');
  assert.equal(restaurarEjemplo(eje, estado), null);
  assert.equal(estado.identidad, 'huesped');
});

for (const x of EJEMPLOS.slice(1)) {
  test('ejemplos: «' + x.etiqueta + '» se construye con sus identidades', async () => {
    elegirEjemplo(x.id);
    const estado = { claves: {}, identidad: 'huesped', aviso: '' };
    const { eje, foco } = await crearEjemplo(estado, { importar: importarDesdeLaCarta });
    assert.equal(estado.aviso, '');
    assert.equal(ejemploElegido(), x.id);
    assert.ok(eje.obtener(foco));
    for (const id of x.identidades) assert.ok(eje.identidades().includes(id), id);
    assert.ok(eje.identidades().includes(estado.identidad));
    elegirEjemplo('compra');
  });
}

test('leído: el conmutador se abre y se cierra (sin argumento, alterna)', () => {
  const antes = leidoAbierto();
  assert.equal(alternarLeido(), !antes);
  assert.equal(leidoAbierto(), !antes);
  assert.equal(alternarLeido(antes), antes);
  assert.equal(alternarLeido(true), true);
  assert.equal(alternarLeido(false), false);
  alternarLeido(antes);
});

test('localStorage como comodidad: sin él, leer da null y guardar da false; con él, lo que se guarda se lee', () => {
  assert.equal(globalThis.localStorage, undefined);
  assert.equal(leerLocal(CLAVES_EJEMPLO.foco), null);
  assert.equal(guardarLocal(CLAVES_EJEMPLO.foco, 'x'), false);
  const mapa = new Map();
  globalThis.localStorage = { getItem: (k) => (mapa.has(k) ? mapa.get(k) : null), setItem: (k, v) => mapa.set(k, String(v)), removeItem: (k) => mapa.delete(k) };
  try {
    assert.equal(guardarLocal(CLAVES_EJEMPLO.foco, 'abc'), true);
    assert.equal(leerLocal(CLAVES_EJEMPLO.foco), 'abc');
    globalThis.localStorage.setItem = () => { throw new Error('cuota llena'); };
    assert.equal(guardarLocal(CLAVES_EJEMPLO.foco, 'otro'), false);
  } finally {
    delete globalThis.localStorage;
  }
});
