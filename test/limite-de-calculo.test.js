// El límite de cálculo, con causa y como dato de la época (#100; VG 17-11 por Core State: «la regla de parada»).
// Una regla que se para por un límite de cálculo no pasa y el registro se rechaza, como siempre; ahora se sabe por qué
// con una causa que una máquina lee: eje.motivos da [{ texto, regla, estado, causa }] y el error de eje.escribir lleva
// `motivos` y `code: 'limit_exhausted'`. El tope es la fila 8.8 de la época («calculation limits»): el núcleo usa el
// menor entre ella y su constante LIMITES (el techo); una época hija que reescribe 8.8 lo baja. Docs:
// docs/notas/LIMITE_DE_CALCULO.md, docs/BQLM.md (límites), docs/CONTRATO.md.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Eje } from '../src/eje.js';
import { crearEvento } from '../src/evento.js';
import { EPOCA_0_BTML, idDeRegistro } from '../src/epocas.js';
import { LIMITES, POR_LIMITE, CAUSA_LIMITE, limitesDeEpoca, evaluarRegla } from '../src/bqlm.js';
import { ContextoEje } from '../src/contexto-eje.js';
import * as A from '../src/acciones.js';

const T0 = '2026-11-14T10:00:00Z';
const PRUEBA = JSON.parse(readFileSync(new URL('./epoca-prueba.json', import.meta.url), 'utf8'));
const copia = (x) => JSON.parse(JSON.stringify(x));

/**
 * Una condición que siempre se cumple y cuesta unos 370 pasos: recorre cinco veces las reglas del 2 de la época. Las de
 * la 0 cuestan menos de 200 con una nota de prueba («writing burns today's T», unos 161).
 */
const RECORRE = '=' + Array(5).fill('count (epoch.2 where count it >= 0)').join(' + ') + ' >= 0';
/** La fila 8.8 de una hija que baja los pasos a 300: la regla de prueba se para; las de la 0, no. */
const BAJA = [[300], [10000], [100], [10], [2000000]];
/** Una condición que siempre se cumple con `n` paréntesis anidados. */
const anidada = (n) => '=' + '('.repeat(n) + 'count ev.5 >= 0' + ')'.repeat(n);

/**
 * La época de prueba (hereda de la 0) con su regla cambiada por una que se llama «a test rule walks the epoch» y cuya
 * condición es `condicion`; con `limites`, su 8.8 (el resto de la fila «calculation limits»); sin él, hereda la de la 0.
 */
function epoca({ condicion = RECORRE, limites } = {}) {
  const e = copia(PRUEBA);
  const regla = copia(e.registros[0]);
  regla[0] = ['a test rule walks the epoch'];
  regla[2] = [condicion];
  regla[9] = ['a test rule walks the epoch: never fails'];
  e.registros[0] = regla;
  e.raiz[2] = [{ ref: idDeRegistro(regla) }];
  if (limites) e.raiz[8][8] = [['calculation limits', 'a test row'], ...limites];
  return e;
}

/** Un eje de demostración con esa época escrita, sin nada más (la emisión del génesis también pasaría por la regla). */
const ejeCon = (e) => Eje.genesis({ identidad: 'raiz', foco: 'mundo de prueba', t: T0, demostracion: true, epoca: e });

/** Una nota de prueba (la plantilla de la época de prueba): el evento, construido aunque el eje lo rechace. */
async function nota(eje, titulo = 'nota') {
  const r = await A.transaccion(eje, 'leave a test note', { X: eje.genesisId, title: titulo }, 'raiz');
  assert.ok(r.evento, 'la nota se construye: ' + JSON.stringify(r.motivos));
  return r.evento;
}

const datosDe = (ev) => ({ autor: ev.autor, sobre: ev.sobre, ...(ev.en ? { en: ev.en } : {}), t: ev.t, movimientos: ev.movimientos, payload: ev.payload, ...(ev.contexto ? { contexto: ev.contexto } : {}) });

test('la época 0 lleva su fila 8.8 «calculation limits» con los valores de LIMITES: con ella todo es como antes', () => {
  const fila = EPOCA_0_BTML.registro[8][8];
  assert.equal(fila[0][0], 'calculation limits');
  assert.deepEqual(fila.slice(1), [[LIMITES.pasos], [LIMITES.ocupantes], [LIMITES.anidamiento], [LIMITES.hilo], [LIMITES.bytes]]);
  assert.deepEqual({ ...limitesDeEpoca(EPOCA_0_BTML) }, { ...LIMITES });
  assert.equal(limitesDeEpoca(undefined), LIMITES, 'sin época, LIMITES');
  assert.equal(CAUSA_LIMITE, 'limit_exhausted');
});

test('una regla que se pasa de pasos: eje.motivos da pendiente y limit_exhausted, validar el mismo texto, y escribir lanza con el code sin escribir nada', async () => {
  // La hija baja los pasos a 300: la regla (unos 370) se para.
  const baja = await ejeCon(epoca({ limites: BAJA }));
  assert.equal(limitesDeEpoca(baja.epoca()).pasos, 300);
  const ev = await nota(baja);
  const motivos = await baja.motivos(ev);
  assert.deepEqual(motivos, [{
    texto: 'a test rule walks the epoch: PENDIENTE: límite de cálculo: más de 300 pasos',
    regla: 'a test rule walks the epoch',
    estado: 'pendiente',
    causa: 'limit_exhausted',
  }]);
  assert.deepEqual(await baja.validar(ev), motivos.map((m) => m.texto), 'validar da los mismos textos, en el mismo orden');
  // El veredicto de la regla conserva el subtipo.
  const ctx = new ContextoEje(baja, { ev, epoch: baja.epoca() });
  const v = evaluarRegla(baja.epoca().condiciones.find((r) => r[0][0] === 'a test rule walks the epoch'), ctx);
  assert.deepEqual([v.pasa, v.estado, v.subtipo], [false, 'PENDIENTE', POR_LIMITE]);
  // escribir: lanza con el mensaje de siempre, los motivos y el code; nada entra.
  const antes = baja.orden.length;
  const err = await baja.escribir(datosDe(ev)).then(() => null, (e) => e);
  assert.ok(err instanceof Error);
  assert.equal(err.message, 'evento rechazado: ' + motivos[0].texto);
  assert.equal(err.code, 'limit_exhausted');
  assert.deepEqual(err.motivos, motivos);
  assert.equal(baja.orden.length, antes, 'no deja nada escrito');
  assert.equal(baja.obtener(ev.id), undefined);
});

test('la base (sin 8.8 propia: la de la 0) no se para con la misma regla', async () => {
  const base = await ejeCon(epoca());
  assert.deepEqual({ ...limitesDeEpoca(base.epoca()) }, { ...LIMITES });
  const ev = await nota(base);
  assert.deepEqual(await base.motivos(ev), []);
  assert.deepEqual(await base.validar(ev), []);
  await base.anadir(ev);
  assert.ok(base.obtener(ev.id));
});

test('una época no sube el techo: un 8.8 mayor se queda en LIMITES y la regla demasiado anidada se para igual', async () => {
  const alta = epoca({ condicion: anidada(LIMITES.anidamiento + 1), limites: [[1e12], [1e9], [1e6], [1000], [1e12]] });
  const eje = await ejeCon(alta);
  assert.deepEqual({ ...limitesDeEpoca(eje.epoca()) }, { ...LIMITES });
  const [m] = await eje.motivos(await nota(eje));
  assert.equal(m.causa, 'limit_exhausted');
  assert.equal(m.estado, 'pendiente');
  assert.equal(m.texto, 'a test rule walks the epoch: PENDIENTE: límite de cálculo: expresión anidada más de 100 niveles');
  // Y bajarlo sí cuenta: la misma regla con 50 niveles pasa en la base y se para con un 8.8 de 10.
  const cincuenta = await ejeCon(epoca({ condicion: anidada(50) }));
  const corto = await ejeCon(epoca({ condicion: anidada(50), limites: [[100000], [10000], [10], [10], [2000000]] }));
  assert.ok(!(await cincuenta.motivos(await nota(cincuenta))).some((x) => x.regla === 'a test rule walks the epoch'));
  const [c] = await corto.motivos(await nota(corto));
  assert.deepEqual([c.regla, c.causa, c.texto], ['a test rule walks the epoch', 'limit_exhausted', 'a test rule walks the epoch: PENDIENTE: límite de cálculo: expresión anidada más de 10 niveles']);
});

test('un dato mal formado, cero o negativo cuenta como la constante', async () => {
  const mal = epoca({ limites: [[-5], ['mucho'], [0], [2.5], [1, 2]] });
  const eje = await ejeCon(mal);
  assert.deepEqual({ ...limitesDeEpoca(eje.epoca()) }, { ...LIMITES });
  const ev = await nota(eje);
  assert.deepEqual(await eje.motivos(ev), [], 'la regla de unos 370 pasos pasa con los 100 000 de la constante');
  // Una fila 8.8 que no es «calculation limits» (la de otra cosa) tampoco cuenta.
  const otra = copia(EPOCA_0_BTML.registro);
  otra[8][8] = [['usage labels', 'otra cosa'], [5], [5], [5], [5], [5]];
  assert.deepEqual({ ...limitesDeEpoca(otra) }, { ...LIMITES });
  // Un dato ausente (solo los pasos), la constante en los demás.
  const parcial = copia(EPOCA_0_BTML.registro);
  parcial[8][8] = [['calculation limits', 'solo los pasos'], [7]];
  assert.deepEqual({ ...limitesDeEpoca(parcial) }, { ...LIMITES, pasos: 7 });
});

test('un rechazo normal da causa null; y si una regla falla con veredicto, la parada por límite no sale', async () => {
  const base = await ejeCon(epoca());
  // Dos años por delante: «at most a year ahead» falla con veredicto.
  const lejos = await crearEvento({ ...datosDe(await nota(base)), t: '2028-11-14T10:00:00Z' });
  const motivos = await base.motivos(lejos);
  assert.ok(motivos.length > 0);
  assert.ok(motivos.every((m) => m.causa === null && m.estado === 'falla'), JSON.stringify(motivos));
  assert.ok(motivos.some((m) => m.regla === 'at most a year ahead'));
  assert.deepEqual(await base.validar(lejos), motivos.map((m) => m.texto));
  const err = await base.anadir(lejos).then(() => null, (e) => e);
  assert.equal(err.code, undefined);
  assert.deepEqual(err.motivos, motivos);
  // En la hija que para la regla por pasos, el mismo registro: solo cuentan las que fallan con veredicto.
  const baja = await ejeCon(epoca({ limites: BAJA }));
  const otro = await crearEvento({ ...datosDe(await nota(baja)), t: '2028-11-14T10:00:00Z' });
  const m2 = await baja.motivos(otro);
  assert.ok(m2.some((m) => m.regla === 'at most a year ahead'));
  assert.ok(!m2.some((m) => m.causa === 'limit_exhausted'), 'la parada por límite no sale');
});
