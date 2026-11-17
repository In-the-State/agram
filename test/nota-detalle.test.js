// La nota de detalle de un registro (src/nota-detalle.js, CONTRATO §12.9; la escribe el volcado): la lectura pura. Todo
// inventado: un libro en memoria, de demostración.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Eje } from '../src/eje.js';
import * as A from '../src/acciones.js';
import * as contrato from '../src/contrato.js';
import { notaDeDetalle, partirNota, NOTA, esNotaDeDetalle, ultimaNotaDeDetalle } from '../src/nota-detalle.js';
import * as volcado from '../ejemplos/volcado/volcar.mjs';

const T = '2026-11-17T10:00:00Z';

async function libro() {
  const eje = await Eje.genesis({ identidad: 'duena', foco: 'libro', t: T, emision: [{ token: 'R', cantidad: 10 }], demostracion: true });
  await eje.aceptar(await eje.invitar({ autor: 'duena', invitado: 'otra', t: T }), {}, { t: T });
  const hacer = async (X, params, quien = 'duena') => {
    const r = await A.transaccion(eje, 'anchor here', { X, ...params }, quien, { t: T });
    assert.ok(r.ok, JSON.stringify(r.motivos));
    return eje.anadir(r.evento);
  };
  const tarea = await hacer(eje.genesisId, { title: 'Probar la carta inventada' });
  const nota = (lineas, quien = 'duena', X = tarea.id) => hacer(X, { title: NOTA.titulo, content: lineas }, quien);
  return { eje, tarea, hacer, nota };
}

const LINEAS = [
  'nota de detalle: j1',
  'base: Lo pide la dueña',
  'paso 1: Arrancar el servidor inventado',
  'paso 1 comando: node servidor.mjs --puerto 9999',
  'paso 1 ruta: retoques/',
  'paso 1 ve: la portada',
  'paso 2: Abrir la tarea',
  'detalle: primera línea',
  'quien: Core Inventado',
  'depende a1: Escribir la guía',
];

test('la última nota de detalle del autor manda; sale partida, con quién la escribió y su id; el contrato la expone; el volcado la reexporta', async () => {
  const { eje, tarea, nota } = await libro();
  assert.equal(notaDeDetalle(eje, tarea.id), null, 'sin nota, null');
  await nota(LINEAS);
  const ultima = await nota([...LINEAS.slice(0, -2), 'quien: Core Otro']);
  const n = notaDeDetalle(eje, tarea.id);
  assert.deepEqual(n, {
    fila: 'j1', base: 'Lo pide la dueña',
    pasos: [{ hace: 'Arrancar el servidor inventado', comando: 'node servidor.mjs --puerto 9999', ruta: 'retoques/', ve: 'la portada' }, { hace: 'Abrir la tarea' }],
    detalle: ['primera línea'], quien: 'Core Otro', depende: [], autor: 'duena', id: ultima.id,
  });
  assert.deepEqual(notaDeDetalle(eje, tarea), n, 'también con el registro');
  assert.deepEqual(contrato.notaDeDetalle(eje, tarea.id), n);
  assert.equal(contrato.NOTA, NOTA);
  assert.equal(volcado.NOTA, NOTA, 'el volcado reexporta lo mismo, sin duplicarlo');
  assert.equal(volcado.partirNota, partirNota);
  assert.ok(esNotaDeDetalle(eje.obtener(ultima.id)) && esNotaDeDetalle(eje.obtener(ultima.id), 'j1') && !esNotaDeDetalle(eje.obtener(ultima.id), 'j2'));
  assert.equal(ultimaNotaDeDetalle(eje, tarea.id, 'j1').id, ultima.id);
  assert.equal(notaDeDetalle(eje, 'f'.repeat(64)), null, 'un registro que no está, null');
});

test('si la última es la vacía, null; una nota de otra persona no cuenta nunca; un registro con otro título no es nota', async () => {
  const { eje, tarea, nota, hacer } = await libro();
  await nota(LINEAS);
  await nota(['nota de detalle: j1', 'base: la mía de otra'], 'otra');
  assert.equal(notaDeDetalle(eje, tarea.id).base, 'Lo pide la dueña', 'la de otra persona, aunque sea la última, no cuenta');
  await hacer(tarea.id, { title: 'otra cosa', content: ['nota de detalle: j1', 'base: no'] });
  assert.equal(notaDeDetalle(eje, tarea.id).base, 'Lo pide la dueña');
  await nota(['nota de detalle: j1', 'sin detalle: la tabla ya no da detalle de esta fila']);
  assert.equal(notaDeDetalle(eje, tarea.id), null, 'la última es la vacía');
  // Solo de otra persona: nada.
  const suya = await hacer(eje.genesisId, { title: 'Otra tarea' });
  await nota(LINEAS, 'otra', suya.id);
  assert.equal(notaDeDetalle(eje, suya.id), null);
});

test('los textos engañosos: la línea sale sin ellos y marcada; un comando así no se ofrece para copiar; el ZWJ de un emoji vale', async () => {
  const p = partirNota([
    'nota de detalle: j1',
    'base: pagar‮ofni',
    'paso 1: hacer\u0007 algo',
    'paso 1 comando: rm -rf ⁦/⁩',
    'paso 2: limpio',
    'paso 2 comando: node x.mjs',
    'detalle: bien',
    'detalle: mal‏',
    'quien: 👩‍💻 Core',
    'depende a‎1: texto',
  ]);
  assert.equal(p.base, 'pagarofni');
  assert.equal(p.pasos[0].hace, 'hacer algo');
  assert.equal(p.pasos[0].comando, 'rm -rf /');
  assert.equal(p.pasos[1].comando, 'node x.mjs');
  assert.deepEqual(p.detalle, ['bien', 'mal']);
  assert.equal(p.quien, '👩‍💻 Core', 'el ZWJ no se toca');
  assert.deepEqual(p.depende, [{ id: 'a1', texto: 'texto' }]);
  assert.deepEqual(p.enganosas, ['base', 'paso 1', 'paso 1 comando', 'detalle 2', 'depende a1']);
  assert.deepEqual(p.sinCopiar, [1], 'el comando con trucos no se ofrece para copiar; el limpio, sí');
  // Sin trucos, ni enganosas ni sinCopiar (la forma de siempre).
  const limpia = partirNota(LINEAS);
  assert.ok(!('enganosas' in limpia) && !('sinCopiar' in limpia));
  assert.equal(partirNota(['nota de detalle: j1']), null, 'sin nada, null');
});
