// «retouch a text» (retocar un texto en su sitio; A20 escalón 1, VG 17-11 por Core State): la plantilla de la época 0
// que retoca un texto de la época en un libro, la regla de quién («only the owner of the book retouches a text»; desde
// A21 la fila epoch.7.9 es «governance», el gobierno del cambio de reglas, y no abre el retoque), la lectura con los retoques del libro encima y la hoja de retoques de la 0
// (datos/epocas/retoques-0.json). Ejes locales en memoria, identidades inventadas, sin claves de verdad ni nodos.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Eje } from '../src/eje.js';
import * as A from '../src/acciones.js';
import * as C from '../src/contrato.js';
import { EPOCA_0_BTML, epocaEscritaDe, cargarEpocaEscrita, RETOQUES_DE_LA_0 } from '../src/epocas.js';
import { quemaDelCoste } from '../src/escritura.js';
import { generar } from '../datos/epocas/generar.mjs';
import { epocaState } from '../datos/epocas/state/generar.mjs';

const T0 = '2026-11-16T08:00:00Z';
const T = (s) => new Date(Date.parse(T0) + s * 1000).toISOString().replace('.000Z', 'Z');
const RETOCAR = 'retouch a text';
const REGLA = 'only the owner of the book retouches a text';
const reglas = (r) => r.motivos.map((m) => m.regla);

async function retoca(eje, yo, params, t) {
  const r = await A.transaccion(eje, RETOCAR, { X: eje.genesisId, ...params }, yo, { t });
  assert.equal(r.ok, true, JSON.stringify(r.motivos));
  return eje.anadir(r.evento);
}

/** Ana, dueña del libro; bea, invitada por ana (recibe 1 R de ana: diez P sobre su alta, que es el génesis). Los desconocidos escriben gratis a ana (precio 0), para que solo mire la regla de quién retoca. */
async function mundo({ epoca } = {}) {
  const eje = await Eje.genesis({ identidad: 'ana', foco: ['ana'], t: T0, demostracion: true, ...(epoca ? { epoca } : {}) });
  const inv = await eje.invitar({ autor: 'ana', invitado: 'bea', t: T(1) });
  await eje.aceptar(inv, {}, { t: T(2) });
  const precio = await A.transaccion(eje, 'set a group price', { X: eje.genesisId, token: 'their R', amount: 0, zone: 0 }, 'ana', { t: T(3) });
  assert.equal(precio.ok, true, JSON.stringify(precio.motivos));
  await eje.anadir(precio.evento);
  return eje;
}

/** La época 0 escrita en el libro con otros nombres en su 7.9.5 (quién cuenta en el gobierno; cambia su id: es otra época, solo para la prueba). */
function epocaConNombres(nombres) {
  const { raiz, registros } = epocaEscritaDe(EPOCA_0_BTML);
  const otra = JSON.parse(JSON.stringify(raiz));
  otra[7][9][5] = nombres;
  return { raiz: otra, registros };
}

test('retoques: la época trae la plantilla y la regla; la 7.9 es el gobierno (A21) y la 7.8 solo guarda el sitio', () => {
  const raiz = EPOCA_0_BTML.registro;
  assert.equal(raiz[7][9][0][0], 'governance');
  assert.match(raiz[7][9][0][1], /only the owner of the book retouches a text/, 'su nota dice que el retoque no pasa por el gobierno');
  assert.equal(raiz[7][8][0][0], 'reserved');
  const p = A.plantillasDeTransaccion().find((x) => x.nombre === RETOCAR);
  assert.deepEqual([p.pv, p.plantilla[5][0], p.plantilla[8]], [0, '9.4', [0, 4]]);
  assert.ok((EPOCA_0_BTML.reglasConId ?? []).some((x) => x.regla[0][0] === REGLA));
  assert.deepEqual(RETOQUES_DE_LA_0, [], 'la hoja de retoques de la 0 nace vacía');
});

test('retoques: el dueño retoca y se lee con el eje delante; sin eje, como siempre; la época no cambia de id', async () => {
  const eje = await mundo();
  const id = eje.epoca().id;
  assert.equal(eje.obtener(eje.genesisId).contexto.epoca, EPOCA_0_BTML.id);
  // Se ofrece en el PV 0 del génesis a su dueño, no a bea, ni sobre otro registro.
  const ofrecida = (X, yo) => A.acciones(eje, X, 0, yo).some((a) => a.nombre === RETOCAR);
  assert.deepEqual([ofrecida(eje.genesisId, 'ana'), ofrecida(eje.genesisId, 'bea'), ofrecida(eje.alta('bea').id, 'bea')], [true, false, false]);
  assert.equal(A.acciones(eje, eje.genesisId, 0, 'ana', { idioma: 'es' }).find((a) => a.nombre === RETOCAR).etiqueta, 'retocar un texto');
  const ev = await retoca(eje, 'ana', { language: 'es', key: 'template pay', text: 'abonar' }, T(10));
  assert.deepEqual([ev.sobre, ev.en], [eje.genesisId, '9400000000'], 'anclado en el 9.4 del génesis');
  assert.deepEqual(ev.payload[1], [['es'], ['template pay'], ['abonar']]);
  assert.ok(ev.payload[4].includes(RETOCAR));
  assert.equal(C.texto(eje, 'template pay', 'es', { original: 'pay' }), 'abonar');
  assert.equal(C.texto(null, 'template pay', 'es', { original: 'pay' }), 'pagar', 'sin eje, el texto de nacimiento');
  assert.equal(C.texto(eje, 'template pay', 'en', { original: 'pay' }), 'pay', 'otro idioma no cambia');
  // Por las entradas que dan texto: la etiqueta de la acción en el aro.
  const pagar = A.plantillasDeTransaccion().find((x) => x.nombre === 'pay');
  assert.equal(C.texto(eje, C.claves.plantilla(pagar.nombre), 'es'), 'abonar');
  // El mensaje de una regla: su nombre es la clave.
  const regla = 'every event moves tokens';
  assert.equal(C.mensaje(null, regla, 'es'), 'la transacción no mueve ningún token');
  await retoca(eje, 'ana', { language: 'es', key: regla, text: 'no se mueve nada' }, T(11));
  assert.equal(C.mensaje(eje, regla, 'es'), 'no se mueve nada');
  assert.equal(C.mensaje(null, regla, 'es'), 'la transacción no mueve ningún token');
  // Un idioma que solo existe por retoques.
  assert.deepEqual(C.idiomas(eje), ['en', 'es']);
  await retoca(eje, 'ana', { language: 'fr', key: 'template pay', text: 'payer' }, T(12));
  assert.deepEqual(C.idiomas(eje), ['en', 'es', 'fr']);
  assert.deepEqual(C.idiomas(), ['en', 'es'], 'sin eje, como siempre');
  assert.equal(C.texto(eje, 'template pay', 'fr', { original: 'pay' }), 'payer');
  // Lo que se deja para la carta: el vigente, la lista, quién puede y la clave con que se leyó.
  const v = C.retoque(eje, 'template pay', 'es');
  assert.deepEqual([v.texto, v.quien, v.cuando, v.id], ['abonar', 'ana', T(10), ev.id]);
  assert.equal(C.retoque(eje, 'template close', 'es'), null);
  assert.deepEqual(C.retoques(eje).map((r) => [r.idioma, r.clave, r.texto]), [['es', regla, 'no se mueve nada'], ['es', 'template pay', 'abonar'], ['fr', 'template pay', 'payer']]);
  assert.deepEqual([C.puedeRetocar(eje, 'ana'), C.puedeRetocar(eje, 'bea'), C.puedeRetocar(eje, 'nadie')], [true, false, false]);
  const { valor, lecturas } = C.conClaves(() => A.acciones(eje, eje.genesisId, 0, 'ana', { idioma: 'es' }).map((a) => a.etiqueta));
  assert.ok(valor.includes('retocar un texto'));
  assert.ok(lecturas.some((l) => l.clave === 'template retouch a text' && l.texto === 'retocar un texto' && l.retoque === null));
  const leida = C.conClaves(() => C.texto(eje, 'template pay', 'es')).lecturas;
  assert.deepEqual(leida, [{ clave: 'template pay', idioma: 'es', texto: 'abonar', retoque: ev.id }]);
  // El id de la época del eje no cambia.
  assert.equal(eje.epoca().id, id);
  assert.equal(eje.epoca(), EPOCA_0_BTML);
});

test('retoques: otro no puede retocar (la regla), ni con P sobre el génesis ni nombrado en el gobierno (7.9.5)', async () => {
  const eje = await mundo();
  const r = await A.transaccion(eje, RETOCAR, { X: eje.genesisId, language: 'es', key: 'template pay', text: 'x' }, 'bea', { t: T(10) });
  assert.equal(r.ok, false);
  assert.deepEqual(reglas(r), [REGLA], JSON.stringify(r.motivos));
  // A mano, con la acción en su 4 y en el 9.4 del génesis: la misma regla.
  const payload = ['bea retoca', [['es'], ['template pay'], ['x']], ['all announced movements happened'], ['bea'], [RETOCAR]];
  await assert.rejects(eje.escribir({ autor: 'bea', sobre: eje.genesisId, en: '9400000000', t: T(11), payload, movimientos: [quemaDelCoste('bea', payload, 'minuto', { eje })] }), new RegExp(REGLA));
  assert.equal(C.texto(eje, 'template pay', 'es'), 'pagar');
  assert.equal(C.mensaje(eje, REGLA, 'es', { ev: { autor: 'bea', payload, movimientos: [], t: T(11) } }), 'bea retoca un texto de un libro cuyo génesis no escribió');

  // Una época que nombra a bea en su 7.9.5 (cuenta en el gobierno): bea tiene 10 P sobre el génesis (en su mirada 3: la R de
  // ana que recibió), y no cambia nada: los textos los retoca solo el dueño.
  const conValor = await mundo({ epoca: epocaConNombres(['ana', 'bea']) });
  assert.notEqual(conValor.epoca().id, EPOCA_0_BTML.id);
  assert.deepEqual([C.puedeRetocar(conValor, 'ana'), C.puedeRetocar(conValor, 'bea')], [true, false]);
  assert.equal(A.acciones(conValor, conValor.genesisId, 0, 'bea').some((a) => a.nombre === RETOCAR), false, 'no se le ofrece');
  const b = await A.transaccion(conValor, RETOCAR, { X: conValor.genesisId, language: 'es', key: 'template pay', text: 'liquidar' }, 'bea', { t: T(10) });
  assert.deepEqual(reglas(b), [REGLA], JSON.stringify(b.motivos));
  await retoca(conValor, 'ana', { language: 'es', key: 'template pay', text: 'liquidar' }, T(11));
  assert.equal(C.texto(conValor, 'template pay', 'es'), 'liquidar');
  assert.equal(C.retoque(conValor, 'template pay', 'es').quien, 'ana');
});

test('retoques: gana el último por instante y, a igualdad, por id, sea cual sea el orden de entrada; sin texto se retira', async () => {
  const eje = await mundo();
  await retoca(eje, 'ana', { language: 'es', key: 'template pay', text: 'abonar' }, T(10));
  await retoca(eje, 'ana', { language: 'es', key: 'template pay', text: 'satisfacer' }, T(20));
  assert.equal(C.texto(eje, 'template pay', 'es'), 'satisfacer');
  // Uno de un instante anterior que entra después no manda: el instante, no el orden de entrada.
  await retoca(eje, 'ana', { language: 'es', key: 'template pay', text: 'saldar' }, T(15));
  assert.equal(C.texto(eje, 'template pay', 'es'), 'satisfacer');
  // Dos retoques en el mismo instante, en dos réplicas con el orden de entrada al revés: el mismo resultado (el de id mayor).
  const dos = async (orden) => {
    const e = await mundo();
    const ev = [];
    for (const text of ['primero', 'segundo']) {
      const r = await A.transaccion(e, RETOCAR, { X: e.genesisId, language: 'es', key: 'template close', text }, 'ana', { t: T(30) });
      assert.equal(r.ok, true, JSON.stringify(r.motivos));
      ev.push(r.evento);
    }
    for (const k of orden) await e.anadir(ev[k]);
    return { texto: C.texto(e, 'template close', 'es'), ganador: [...ev].sort((a, b) => (a.id < b.id ? 1 : -1))[0].payload[1][2][0] };
  };
  const a = await dos([0, 1]);
  const b = await dos([1, 0]);
  assert.equal(a.texto, a.ganador);
  assert.equal(b.texto, a.texto, 'no depende del orden de entrada');
  // Sin texto (un texto vacío no es un terminal BTML: el parámetro no se da), se retiran: vuelve el de nacimiento.
  const ev = await retoca(eje, 'ana', { language: 'es', key: 'template pay' }, T(40));
  assert.deepEqual(ev.payload[1], [['es'], ['template pay']]);
  assert.equal(C.texto(eje, 'template pay', 'es'), 'pagar');
  assert.equal(C.retoque(eje, 'template pay', 'es'), null);
  assert.equal(C.retoques(eje).length, 0);
  // Y un retoque posterior vuelve a mandar.
  await retoca(eje, 'ana', { language: 'es', key: 'template pay', text: 'abonar' }, T(50));
  assert.equal(C.texto(eje, 'template pay', 'es'), 'abonar');
});

test('retoques: un hueco que el texto de nacimiento no tiene se ignora; el HTML es un dato; una clave que no existe no hace nada', async () => {
  const eje = await mundo();
  const clave = 'template pay message';
  const nacimiento = C.texto(null, clave, 'es');
  assert.match(nacimiento, /\{me\}/);
  // Un hueco nuevo (una expresión que no estaba): se ignora, como si no existiera.
  await retoca(eje, 'ana', { language: 'es', key: clave, text: '{me} paga {first ev.3}' }, T(10));
  assert.equal(C.texto(eje, clave, 'es'), nacimiento);
  assert.equal(C.retoque(eje, clave, 'es'), null);
  // Uno de sus huecos, carácter a carácter: vale. Y el que trae un hueco nuevo después no lo tapa.
  await retoca(eje, 'ana', { language: 'es', key: clave, text: '{me} abona' }, T(11));
  await retoca(eje, 'ana', { language: 'es', key: clave, text: '{ me } abona {first it.9}' }, T(12));
  assert.equal(C.texto(eje, clave, 'es'), '{me} abona');
  // Para un idioma nuevo, con el original (el 9 de la plantilla).
  await retoca(eje, 'ana', { language: 'fr', key: clave, text: '{me} paie {first ev.3}' }, T(13));
  assert.equal(C.retoque(eje, clave, 'fr'), null);
  await retoca(eje, 'ana', { language: 'fr', key: clave, text: '{me} paie' }, T(14));
  assert.equal(C.texto(eje, clave, 'fr'), '{me} paie');
  // El mensaje de una regla, igual: sus huecos son los de su 9.
  const regla = 'every event moves tokens';
  await retoca(eje, 'ana', { language: 'es', key: regla, text: 'nada se mueve {first ev.3}' }, T(15));
  assert.equal(C.mensaje(eje, regla, 'es'), 'la transacción no mueve ningún token');
  // El HTML es un dato: sale tal cual, como texto (la carta lo escapa), y con los huecos rellenos sigue igual.
  await retoca(eje, 'ana', { language: 'es', key: 'template pay', text: '<b>abonar</b>' }, T(16));
  assert.equal(C.texto(eje, 'template pay', 'es'), '<b>abonar</b>');
  await retoca(eje, 'ana', { language: 'es', key: 'a person joins by an invitation', text: '<img src=x onerror=alert(1)> {first ev.3}' }, T(17));
  assert.equal(C.mensaje(eje, 'a person joins by an invitation', 'es', { ev: { autor: 'bea', payload: ['x'], movimientos: [], t: T(17) } }).startsWith('<img src=x onerror=alert(1)> '), true);
  // Una clave que no existe en la época (ni empieza por «carta »): no hace nada. El nombre de una plantilla no es texto: su clave sí.
  await retoca(eje, 'ana', { language: 'es', key: 'pay', text: 'abonar' }, T(18));
  assert.equal(C.retoque(eje, 'pay', 'es'), null);
  assert.equal(A.plantillasDeTransaccion().some((p) => p.nombre === 'pay'), true, 'el nombre canónico no cambia');
  // Una clave de la carta: se guarda y se devuelve tal cual (sus huecos los comprueba la carta).
  await retoca(eje, 'ana', { language: 'es', key: 'carta entrar', text: 'Pasa, {nombre}' }, T(19));
  assert.equal(C.retoque(eje, 'carta entrar', 'es').texto, 'Pasa, {nombre}');
  // Un texto que empieza por «=» sería una fórmula: no es un texto; «==» lo escapa.
  await retoca(eje, 'ana', { language: 'es', key: 'template close', text: '==cerrar' }, T(20));
  assert.equal(C.texto(eje, 'template close', 'es'), '=cerrar');
});

test('retoques: la hoja de la 0 va encima de la 0 y debajo de una hija, y no cambia el id', () => {
  // Con una entrada nueva en datos/epocas/retoques-0.json (en una copia de la carpeta), el id de la 0 no cambia y la hoja sí.
  const carpeta = mkdtempSync(join(tmpdir(), 'retoques-0-'));
  try {
    cpSync('datos/epocas', carpeta, { recursive: true });
    const antes = generar(carpeta);
    writeFileSync(join(carpeta, 'retoques-0.json'), JSON.stringify([['es', 'template pay', 'abonar']]) + '\n');
    const despues = generar(carpeta);
    const id = (s) => /export const EPOCA_0_BTML_ID = "([0-9a-f]{64})"/.exec(s)[1];
    assert.equal(id(despues), id(antes));
    assert.equal(id(antes), EPOCA_0_BTML.id);
    assert.match(despues, /export const RETOQUES_0_DATOS = \[\s*\[\s*"es",\s*"template pay",\s*"abonar"\s*\]\s*\]/);
    assert.equal(antes, readFileSync('datos/epocas/epocas.js', 'utf8').replace(/\r\n/g, '\n'), 'epocas.js está al día');
  } finally {
    rmSync(carpeta, { recursive: true, force: true });
  }
  // La lectura con esa hoja: el texto leído cambia; un hueco nuevo en la hoja se ignora; una clave que no existe, tampoco.
  const hoja = [['es', 'template pay', 'abonar'], ['es', 'template pay message', '{me} paga {first ev.3}'], ['es', 'no such key', 'x'], ['fr', 'template close', 'clore']];
  assert.equal(C.texto(null, 'template pay', 'es', { hojaDeRetoques: hoja }), 'abonar');
  assert.equal(C.texto(null, 'template pay message', 'es', { hojaDeRetoques: hoja }), C.texto(null, 'template pay message', 'es'));
  assert.deepEqual(C.idiomas({ hojaDeRetoques: hoja }), ['en', 'es', 'fr']);
  assert.equal(C.texto(null, 'template pay', 'es'), 'pagar', 'sin la hoja, como siempre');
  // En una hija (la época state): la hoja va debajo de los textos de la hija y encima de los de la 0.
  const state = cargarEpocaEscrita(epocaState());
  const clave = 'reason second factor missing';
  const deLaHija = C.texto(null, clave, 'es', { epoca: state });
  assert.notEqual(deLaHija, C.texto(null, clave, 'es'));
  const otra = [['es', clave, 'falta {holder}'], ['es', 'template pay', 'abonar']];
  assert.equal(C.texto(null, clave, 'es', { epoca: state, hojaDeRetoques: otra }), deLaHija, 'manda la hija');
  assert.equal(C.texto(null, clave, 'es', { hojaDeRetoques: otra }), 'falta {holder}', 'en la 0, la hoja');
  assert.equal(C.texto(null, 'template pay', 'es', { epoca: state, hojaDeRetoques: otra }), 'abonar', 'lo que la hija no trae, de la hoja');
  // Y los retoques de un libro van encima de todo (el mismo mensaje de una regla: la hoja, después el libro).
  assert.equal(C.mensaje(null, 'every event moves tokens', 'es', { hojaDeRetoques: [['es', 'every event moves tokens', 'nada se mueve']] }), 'nada se mueve');
});

test('retoques: son de ese libro: otro con la misma época no los ve; restaurar el libro desde sus registros da los mismos textos', async () => {
  const eje = await mundo();
  await retoca(eje, 'ana', { language: 'es', key: 'template pay', text: 'abonar' }, T(10));
  await retoca(eje, 'ana', { language: 'es', key: 'template close', text: 'cerrar ya' }, T(11));
  await retoca(eje, 'ana', { language: 'es', key: 'template close' }, T(12));
  await retoca(eje, 'ana', { language: 'de', key: 'template pay', text: 'zahlen' }, T(13));
  const otro = await mundo();
  assert.equal(otro.epoca().id, eje.epoca().id);
  assert.equal(C.texto(otro, 'template pay', 'es'), 'pagar');
  assert.deepEqual(C.retoques(otro), []);
  assert.deepEqual(C.idiomas(otro), ['en', 'es']);
  const restaurado = await Eje.desde(eje.orden.map((id) => eje.obtener(id)));
  const textos = (e) => ['template pay', 'template close'].flatMap((k) => ['es', 'de', 'en'].map((i) => C.texto(e, k, i)));
  assert.deepEqual(textos(restaurado), textos(eje));
  assert.deepEqual(C.retoques(restaurado), C.retoques(eje));
  assert.deepEqual(C.idiomas(restaurado), ['en', 'es', 'de']);
  assert.deepEqual(textos(restaurado).slice(0, 3), ['abonar', 'zahlen', null], 'en inglés, sin original, nada (como siempre)');
  assert.deepEqual(textos(restaurado).slice(3), ['cerrar', null, null], 'retirado: el de nacimiento');
});
