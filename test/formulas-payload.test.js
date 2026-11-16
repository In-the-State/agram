// Las fórmulas escritas en el payload de un registro (retirada de BQL V0, #113; docs/BQLM.md §14): BQL mínimo con
// it = el registro que la lleva, en el contexto con que el núcleo lee un registro (contexto-eje.contextoDeLectura).
// bqlm.leerFormula es la única lectura; contexto-eje.leerPosicion lee una posición (la fórmula o lo escrito); la capa 2
// de la validez, bases.medir, motor.proponer y motor.descubrir la usan.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esFormula, leerFormula, registrosDeFormula, Presupuesto, POR_LIMITE, ESTADOS } from '../src/bqlm.js';
import { contextoDeLectura, leerPosicion } from '../src/contexto-eje.js';
import { validez } from '../src/validez.js';
import { medir } from '../src/bases.js';
import { ejemploCompra } from '../ejemplos/ikisai/compra-food.mjs';
import { pagaElCoste, escribirPagando } from '../ejemplos/ikisai/coste.mjs';
import { crearEvento } from '../src/evento.js';

const AUSENTE = 'ab'.repeat(32);

/** La compra de ejemplo y un registro de cocina sobre ella con `payload`. */
async function conRegistro(payload) {
  const c = await ejemploCompra();
  const r = await escribirPagando(c.eje, { autor: 'cocina', sobre: c.compra.id, t: '2026-11-07T15:00:00Z', movimientos: [pagaElCoste('cocina')], payload });
  return { ...c, r };
}

const leer = (eje, id, formula, opciones) => leerFormula(formula, { k: 'reg', id }, contextoDeLectura(eje), opciones);

test('una sola prueba «¿es fórmula?»: «=» y no «==»', () => {
  assert.deepEqual(['=1', '= 1 + 1', '==1', '1', '', null, 3, ['=1']].map(esFormula), [true, true, false, false, false, false, false, false]);
});

test('it es el registro que la lleva: lo escrito con payload(it), y lo que el núcleo lee en él con it', async () => {
  const { eje, r, compra } = await conRegistro(['Cuenta', [['total'], ['=(payload(it)).2 * 2'], ['EUR']], 21]);
  assert.deepEqual(leerPosicion(eje, r.id, [1, 1]).valor, [42]);
  assert.deepEqual(leer(eje, r.id, '=first it.3').valor, ['cocina']); // el autor (D-META)
  assert.deepEqual(leer(eje, r.id, '=first (payload(it)).0').valor, ['Cuenta']);
  assert.equal(leer(eje, r.id, '=up it').valor[0].id, compra.id); // el registro sobre el que se escribió
  assert.equal(leer(eje, r.id, '=first it.5').valor[0], r.id);
});

test('los tres estados: RESUELTO, PENDIENTE (lo que falta) y ERROR (lo mal escrito)', async () => {
  const { eje, r } = await conRegistro(['x', 1]);
  assert.deepEqual(ESTADOS, ['RESUELTO', 'PENDIENTE', 'ERROR']);
  assert.deepEqual(leer(eje, r.id, '=1 + 1'), { estado: 'RESUELTO', valor: [2], texto: '2' });
  const p = leer(eje, r.id, '=(payload(it)).9 + 1');
  assert.equal(p.estado, 'PENDIENTE');
  assert.match(p.motivo, /la posición está vacía, falta un valor/);
  assert.equal(leer(eje, r.id, '=FILTRAR(payload(it))').estado, 'ERROR'); // una palabra del V0 ya no es nada
  assert.equal(leer(eje, r.id, '=REF("' + r.id.slice(0, 8) + '")').estado, 'ERROR');
  assert.equal(leer(eje, r.id, '=1 / 0').estado, 'ERROR');
});

test('lo que falta no es falso: un id de 64 hex que no es un registro da PENDIENTE con el texto de una referencia ausente, y no se evalúa', async () => {
  const { eje, r, compra } = await conRegistro(['x', '=(payload("' + AUSENTE + '")).1 + 1']);
  const f = leerPosicion(eje, r.id, [1]);
  assert.deepEqual([f.estado, f.motivo], ['PENDIENTE', 'referencia a un evento ausente del eje: ' + AUSENTE.slice(0, 8)]);
  // El mismo texto que una referencia { ref } ausente, en la capa 2 de la validez (un borrador, fuera del eje: el eje
  // no acepta una referencia a lo que no tiene; la vista es el eje con el borrador dentro).
  const borrador = await crearEvento({ autor: 'cocina', sobre: compra.id, t: '2026-11-07T15:00:00Z', movimientos: [{ token: 'T', escala: 'minuto', cantidad: 3, de: 'cocina', a: null }], payload: ['x', '=(payload("' + AUSENTE + '")).1 + 1', { ref: AUSENTE }] });
  const v = await validez(eje, borrador);
  assert.deepEqual(v.interpretacion.formulas.map((x) => [x.dir, x.estado, x.texto]), [['1000000000', 'PENDIENTE', 'PENDIENTE: referencia a un evento ausente del eje: ' + AUSENTE.slice(0, 8)]]);
  assert.ok(v.interpretacion.motivos.includes('2: referencia a un evento ausente del eje: ' + AUSENTE.slice(0, 8)));
  assert.ok(v.interpretacion.motivos.includes('1: PENDIENTE: referencia a un evento ausente del eje: ' + AUSENTE.slice(0, 8)));
  // No se evalúa: aunque la fórmula esté mal escrita después, lo que falta manda.
  assert.equal(leer(eje, r.id, '=("' + AUSENTE + '") + FILTRAR(1)').estado, 'ERROR'); // si no se analiza, es ERROR
  assert.equal(leer(eje, r.id, '=count ("' + AUSENTE + '") / 0').estado, 'PENDIENTE');
  // Los registros que nombra, con la dirección de los dígitos que les siguen (lo que Scened dibuja).
  assert.deepEqual(registrosDeFormula('=(payload("' + compra.id + '")).1.2.1 + ("' + AUSENTE + '").3 + count ("' + compra.id + '")'),
    [{ id: compra.id, dir: '1210000000' }, { id: AUSENTE, dir: '3000000000' }, { id: compra.id, dir: '0000000000' }]);
  assert.deepEqual(leer(eje, r.id, '=first (payload("' + compra.id + '")).0').valor, ['Compra del menú del día']);
});

test('sin encadenar: si la posición que lee lleva otra fórmula, ve su texto', async () => {
  const { eje, r } = await conRegistro(['x', '=1 + 1', '=(payload(it)).1 + 1', '=first (payload(it)).1']);
  assert.deepEqual(leerPosicion(eje, r.id, [1]).valor, [2]);
  const b = leerPosicion(eje, r.id, [2]);
  assert.equal(b.estado, 'ERROR');
  assert.match(b.motivo, /espera un número, no «=1 \+ 1»/);
  assert.deepEqual(leerPosicion(eje, r.id, [3]).valor, ['=1 + 1']);
});

test('solo números: la magnitud desplegada se lee con .1 y .2, igual que un terminal «EUR 12»', async () => {
  const { eje, r } = await conRegistro(['x', [['doce'], ['=2 * 6'], ['EUR']], 'EUR 12']);
  for (const camino of [[1], [2]]) {
    assert.deepEqual(leerPosicion(eje, r.id, [...camino, 1]).valor, [12], camino + '.1');
    assert.deepEqual(leerPosicion(eje, r.id, [...camino, 2]).valor, ['EUR'], camino + '.2');
  }
  assert.equal(leer(eje, r.id, '=2 * 6 EUR').estado, 'ERROR'); // una unidad dentro de la fórmula no es BQL mínimo
});

test('un presupuesto por registro, compartido por todas sus fórmulas: agotado, PENDIENTE POR LÍMITE', async () => {
  const { eje, r } = await conRegistro(['x', ['a', 'b', 'c', 'd', 'e', 'f'], '=count (payload(it)).1', '=count (payload(it)).1']);
  const sola = (tope) => leer(eje, r.id, '=count (payload(it)).1', { presupuesto: new Presupuesto(tope) });
  // Con un tope que da para una lectura, cada fórmula sola se resuelve…
  let tope = 1;
  while (sola(tope).estado !== 'RESUELTO') tope++;
  assert.deepEqual(sola(tope).valor, [6]);
  // …y las dos, con el mismo presupuesto, no: la segunda se queda sin él.
  const compartido = new Presupuesto(tope);
  assert.equal(leerPosicion(eje, r.id, [2], { presupuesto: compartido }).estado, 'RESUELTO');
  const segunda = leerPosicion(eje, r.id, [3], { presupuesto: compartido });
  assert.deepEqual([segunda.estado, segunda.subtipo], ['PENDIENTE', POR_LIMITE]);
  assert.match(segunda.texto, /^PENDIENTE POR LÍMITE: límite de cálculo/);
  // Sin presupuesto dado, el de siempre (LIMITES.ocupantes): las dos se resuelven.
  assert.equal(leerPosicion(eje, r.id, [3]).estado, 'RESUELTO');
});

test('datos no fiables: un verbo o un put en una fórmula del payload es ERROR, aunque no se llegue a evaluar', async () => {
  const { eje, r } = await conRegistro(['x', '=1 = 2 and burn 1 T.1 from first it.3', '=put 1 at (first it.3).2.1.(first it.5)', '=transfer 1 R.(first it.3) from first it.3 to "casa"']);
  const verbo = leerPosicion(eje, r.id, [1]);
  assert.equal(verbo.estado, 'ERROR');
  assert.match(verbo.motivo, /burn: solo una plantilla de transacción mueve/);
  const put = leerPosicion(eje, r.id, [2]);
  assert.equal(put.estado, 'ERROR');
  assert.match(put.motivo, /put: solo en una regla que escribe/);
  assert.equal(leerPosicion(eje, r.id, [3]).estado, 'ERROR');
  // La capa 2 lo dice como fallo, y medir las cuenta como no resueltas.
  const v = await validez(eje, r.id);
  assert.deepEqual(v.interpretacion.formulas.map((x) => x.capa), ['falla', 'falla', 'falla']);
  assert.equal(v.interpretacion.estado, 'falla');
  assert.deepEqual([medir(eje, r.id).formulasResueltas, medir(eje, r.id).formulasPendientes], [0, 3]);
  // Y el libro no se mueve: los saldos de quien escribe siguen igual.
  assert.equal(eje.saldo('cocina', 'R:cocina'), 0);
});

test('la vista recortada no deja leer lo que no trae: lo que quien mira no tiene, falta', async () => {
  const { eje, r, menu } = await conRegistro(['x', '=first (payload("MENU")).0']);
  const formula = '=first (payload("' + menu.id + '")).0';
  assert.deepEqual(leer(eje, r.id, formula).valor, ['Menú del día']);
  // Una vista sin el menú (lo que recibe quien no lo tiene): el mismo id falta, y la fórmula queda PENDIENTE.
  const vista = { obtener: (x) => (x === menu.id ? undefined : eje.obtener(x)), orden: eje.orden.filter((x) => x !== menu.id), sobre: (x, en) => eje.sobre(x, en) };
  const recortada = leerFormula(formula, { k: 'reg', id: r.id }, contextoDeLectura(vista));
  assert.deepEqual([recortada.estado, recortada.motivo], ['PENDIENTE', 'referencia a un evento ausente del eje: ' + menu.id.slice(0, 8)]);
  // Lo que la vista sí trae se lee igual.
  assert.deepEqual(leerFormula('=first (payload(it)).0', { k: 'reg', id: r.id }, contextoDeLectura(vista)).valor, ['x']);
  // Un registro que la vista no trae no se lee: leerPosicion da PENDIENTE.
  assert.equal(leerPosicion(vista, menu.id, [0]).estado, 'PENDIENTE');
});

test('«==» escapa un texto que empieza por «=»: no se evalúa', async () => {
  const { eje, r } = await conRegistro(['x', '==1 + 1', '=1 + 1']);
  const escapado = leerPosicion(eje, r.id, [1]);
  assert.deepEqual([escapado.estado, escapado.valor, escapado.formula], ['RESUELTO', ['==1 + 1'], undefined]);
  assert.deepEqual(leerFormula('==1 + 1', { k: 'reg', id: r.id }, contextoDeLectura(eje)), { estado: 'ERROR', motivo: 'no es una fórmula «=…»' });
  const v = await validez(eje, r.id);
  assert.deepEqual(v.interpretacion.formulas.map((x) => [x.dir, x.texto]), [['2000000000', '2']]);
  assert.deepEqual([medir(eje, r.id).formulasResueltas, medir(eje, r.id).formulasPendientes], [1, 0]);
});
