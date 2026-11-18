// Los tipos de parámetro (Core AGRAM 18-11; docs/notas/NUCLEO_6_7_8.md §7, paso 1 del orden, la parte del núcleo): la
// lista cerrada de tipos base con las facetas de file y book, los tipos declarados por capas (la 0, lo provisional y la
// época del libro), su resolución (hasta cuatro saltos, un ciclo es un error, una capa de arriba endurece y no afloja),
// parametros() y la validación en seco de preparar() con todas las validaciones, archivoDe, el 9.2.0.3 como colección
// que se combina al heredar y las opciones de un parámetro (las del aparato, solo filtradas; la fórmula de un tipo).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { TIPOS_BASE, BASES_DEL_APARATO, MAXIMO_DE_SALTOS, SITIO_DE_LOS_TIPOS, resolverTipo, tiposDeParametro, valeElValor } from '../src/tipos.js';
import { TIPOS_PROVISIONALES } from '../src/provisional.js';
import * as contrato from '../src/contrato.js';
import { parametros, archivoDe, transaccion, plantillaDeTransaccion } from '../src/acciones.js';
import { EPOCA_0_BTML, COLECCIONES, fusionarRaices } from '../src/epocas.js';
import { ContextoEje } from '../src/contexto-eje.js';
import { ejemploReserva } from '../ejemplos/ikisai/reserva-booking.mjs';

const ID_A = 'a'.repeat(64);
const ID_B = 'b'.repeat(64);

/** Una época «del libro» de prueba: la 0 con estos tipos en su 9.2.0.3 (lo que resolverTipo lee de ella). */
function epocaConTipos(lista) {
  const raiz = structuredClone(EPOCA_0_BTML.registro);
  raiz[9][2][0][3] = lista;
  return { registro: raiz };
}

/** Una décupla de tipo con el molde de un parámetro. */
const tipo = (nombre, deriva, validacion = 'any', { opciones = null, ayuda = 'ayuda de ' + nombre } = {}) => [
  [nombre], [deriva].flat(), [validacion], ['me'], ['payload'], ['*'], ['prueba'], ['optional'], [0], [...(opciones ? [opciones] : []), ayuda],
];

const formulas = (r) => r.validaciones.filter((v) => v.formula).map((v) => v.formula);

test('TIPOS_BASE: la lista cerrada de controles, con las facetas de file y book; contrato la expone', () => {
  assert.deepEqual(Object.keys(TIPOS_BASE), ['text', 'number', 'identity', 'ref', 'instant', 'level', 'tenfold', 'file', 'book']);
  assert.deepEqual(TIPOS_BASE.file.facetas, ['ref', 'format', 'size']);
  assert.deepEqual(TIPOS_BASE.book.facetas, ['id', 'line keys', 'headers url'], 'sin «mi alta allí» (Core AGRAM 18-11)');
  assert.deepEqual(BASES_DEL_APARATO, ['file', 'book']);
  assert.ok(Object.isFrozen(TIPOS_BASE) && Object.isFrozen(TIPOS_BASE.file.facetas));
  assert.equal(contrato.TIPOS_BASE, TIPOS_BASE);
  assert.equal(contrato.resolverTipo, resolverTipo);
  assert.deepEqual(SITIO_DE_LOS_TIPOS, [9, 2, 0, 3]);
  assert.equal(MAXIMO_DE_SALTOS, 4);
});

test('todos los parámetros de las acciones de la 0 y de las hijas se resuelven, y su base es la primera hoja de su 1 (nada cambia hoy)', () => {
  const carpetas = ['datos/epocas/plantillas/', ...['cuenta', 'guia-libro', 'roadmap', 'state'].map((d) => 'datos/epocas/' + d + '/plantillas/')].filter((d) => existsSync(d));
  let n = 0;
  for (const d of carpetas) {
    for (const f of readdirSync(d).filter((x) => x.endsWith('.json'))) {
      const p = JSON.parse(readFileSync(d + f, 'utf8'));
      for (const q of (Array.isArray(p[1]) ? p[1] : []).filter((x) => Array.isArray(x) && Array.isArray(x[0]))) {
        const r = resolverTipo(q[1]);
        assert.equal(r.error, null, d + f + ' · ' + q[0][0] + ': ' + r.error);
        assert.equal(r.base, q[1][0], d + f + ' · ' + q[0][0]);
        assert.equal(r.nombre, null);
        n++;
      }
    }
  }
  assert.ok(n > 600, 'se miran todos: ' + n);
});

test('lo provisional: tipos como dato (JSON), congelados, que se resuelven y no chocan con la 0 ni con un tipo base', () => {
  assert.ok(existsSync('datos/provisional/tipos.json') && existsSync('datos/provisional/tipos.js'));
  assert.deepEqual(JSON.parse(readFileSync('datos/provisional/tipos.json', 'utf8')), TIPOS_PROVISIONALES.map((x) => structuredClone(x)));
  assert.ok(Object.isFrozen(TIPOS_PROVISIONALES) && Object.isFrozen(TIPOS_PROVISIONALES[0][0]));
  const deLa0 = new Set((EPOCA_0_BTML.registro[9][2][0][3] ?? []).map((x) => x[0][0]));
  const nombres = TIPOS_PROVISIONALES.map((x) => x[0][0]);
  assert.deepEqual(nombres, ['an id', 'a positive number', 'a text', 'an identity with alta', 'another book', 'cohort']);
  for (const n of nombres) {
    assert.ok(!deLa0.has(n), '«' + n + '» ya está en la 0: quítalo de datos/provisional/');
    assert.ok(!Object.hasOwn(TIPOS_BASE, n));
    const r = resolverTipo([n]);
    assert.equal(r.error, null, n);
    assert.equal(r.capa, 'provisional');
  }
  assert.deepEqual(formulas(resolverTipo(['an id'])), ['=hex(slice(bytes(it), 0, 32)) = it']);
  const libro = resolverTipo(['another book']);
  assert.equal(libro.base, 'book');
  assert.equal(libro.faceta, 'id');
  assert.deepEqual(libro.validaciones[0], { de: 'base', base: 'book', faceta: 'id' }, 'la forma de la faceta va la primera');
  assert.deepEqual(tiposDeParametro().map((t) => t.nombre), nombres);
});

test('tipos base: la faceta por defecto, una faceta que no es, un refinamiento y un tipo desconocido', () => {
  assert.equal(resolverTipo(['file']).faceta, 'ref');
  assert.equal(resolverTipo(['file', 'format']).faceta, 'format');
  assert.match(resolverTipo(['file', 'name']).error, /no es una faceta de file/);
  assert.match(resolverTipo(['book', 'my alta there']).error, /no es una faceta de book/);
  assert.deepEqual(resolverTipo(['ref', 'purchase']).refinamiento, ['purchase']);
  assert.equal(resolverTipo([]).base, 'text', 'sin tipo, text');
  assert.match(resolverTipo(['a thing that is not a type']).error, /tipo desconocido/);
  assert.match(resolverTipo(['another book', 'line keys']).error, /no le cambia la faceta/, 'un tipo declarado fija su faceta');
});

test('la época del libro: deriva, endurece y no afloja; no cambia la base; ciclos y saltos', () => {
  const epoca = epocaConTipos([
    tipo('a small number', 'a positive number', '=it <= 9'),
    tipo('a positive number', 'a positive number', '=it < 100'), // endurece el provisional
    tipo('an id', 'an id', 'any'), // «aflojar»: no quita la de abajo
    tipo('a text', 'number'), // cambia la base: error
    tipo('ida', 'vuelta'),
    tipo('vuelta', 'ida'),
    tipo('t1', 't2'), tipo('t2', 't3'), tipo('t3', 't4'), tipo('t4', 'number'),
    tipo('t0', 't1'),
    tipo('number', 'text', '=it = "x"'), // un nombre de tipo base no se declara
  ]);
  const o = { epoca };
  const pequeno = resolverTipo(['a small number'], o);
  assert.equal(pequeno.base, 'number');
  assert.deepEqual(formulas(pequeno), ['=it > 0', '=it < 100', '=it <= 9'], 'de abajo arriba');
  assert.deepEqual(pequeno.cadena, ['a small number', 'a positive number']);
  const positivo = resolverTipo(['a positive number'], o);
  assert.equal(positivo.capa, 'libro');
  assert.deepEqual(formulas(positivo), ['=it > 0', '=it < 100']);
  assert.deepEqual(formulas(resolverTipo(['an id'], o)), ['=hex(slice(bytes(it), 0, 32)) = it'], 'la hija no afloja');
  assert.match(resolverTipo(['a text'], o).error, /cambia la base del tipo «a text» \(de text a number\)/);
  assert.match(resolverTipo(['ida'], o).error, /ciclo de tipos: ida → vuelta → ida/);
  assert.equal(resolverTipo(['t1'], o).error, null, 'cuatro saltos valen');
  assert.match(resolverTipo(['t0'], o).error, /más de 4 pasos/);
  assert.deepEqual(resolverTipo(['number'], o).validaciones, [], 'number sigue siendo el tipo base');
  assert.equal(resolverTipo(['a positive number']).capa, 'provisional', 'sin la época del libro, lo provisional');
});

test('valeElValor: la forma de la faceta, las fórmulas en orden, y PENDIENTE no vale', async () => {
  const { eje } = await ejemploReserva({ confirmar: false });
  const ctx = new ContextoEje(eje, { epoch: EPOCA_0_BTML });
  const archivo = resolverTipo(['file', 'ref']).validaciones;
  assert.equal(valeElValor(archivo, 'archivo:' + ID_A, ctx).ok, true);
  assert.equal(valeElValor(archivo, 'archivo:xyz', ctx).ok, false);
  const otro = resolverTipo(['another book']).validaciones;
  assert.equal(valeElValor(otro, ID_A, ctx).ok, true);
  const este = valeElValor(otro, eje.genesisId, ctx);
  assert.equal(este.ok, false, 'no este libro');
  assert.equal(este.falla.tipo, 'another book');
  assert.equal(valeElValor(otro, 'no es hex', ctx).falla.de, 'base');
  const pendiente = valeElValor([{ de: 'parámetro', formula: '=first it.9 > 0' }], ID_A, ctx);
  assert.equal(pendiente.ok, false);
  assert.equal(pendiente.estado, 'PENDIENTE');
});

test('parametros(): tipo (la base, lo de siempre), declarado, faceta, validaciones y la ayuda del tipo; archivoDe por la faceta y por el 4', () => {
  const consume = structuredClone(plantillaDeTransaccion('consume'));
  const cantidad = consume[1].find((p) => Array.isArray(p) && p[0][0] === 'quantity');
  cantidad[1] = ['a positive number'];
  cantidad[2] = ['any'];
  cantidad[9] = [1];
  const q = parametros(consume).find((p) => p.nombre === 'quantity');
  assert.equal(q.tipo, 'number');
  assert.equal(q.base, 'number');
  assert.equal(q.declarado, 'a positive number');
  assert.deepEqual(q.validaciones.map((v) => v.formula), ['=it > 0']);
  assert.equal(q.ayuda, 'a number greater than zero', 'sin ayuda propia, la del tipo');
  const serie = parametros(consume).find((p) => p.nombre === 'series');
  assert.equal(serie.tipo, 'text');
  assert.equal(serie.declarado, null);
  assert.deepEqual(serie.validaciones.map((v) => v.de), ['parámetro']);
  // archivoDe: la forma de hoy (el 4 «file») sigue; la nueva, por la faceta.
  const adjuntar = parametros(plantillaDeTransaccion('attach a file'));
  assert.equal(archivoDe(adjuntar.find((p) => p.nombre === 'file')), 'ref');
  assert.equal(archivoDe(adjuntar.find((p) => p.nombre === 'format')), 'format');
  assert.equal(archivoDe(adjuntar.find((p) => p.nombre === 'size')), null);
  const nueva = structuredClone(plantillaDeTransaccion('attach a file'));
  nueva[1].find((p) => Array.isArray(p) && p[0][0] === 'size')[1] = ['file', 'size'];
  assert.equal(archivoDe(parametros(nueva).find((p) => p.nombre === 'size')), 'size');
});

test('preparar() en seco: las validaciones del tipo cuentan, y un tipo que no se resuelve es un error del parámetro', async () => {
  const { eje, reserva } = await ejemploReserva({ confirmar: false });
  const consume = structuredClone(plantillaDeTransaccion('consume'));
  const cantidad = consume[1].find((p) => Array.isArray(p) && p[0][0] === 'quantity');
  cantidad[1] = ['a positive number'];
  cantidad[2] = ['any'];
  const deCantidad = (r) => r.motivos.filter((m) => m.parametro === 'quantity');
  const cero = await transaccion(eje, consume, { X: reserva.id, series: 'E:casa/EUR', quantity: 0 }, 'huesped', { idioma: 'en' });
  assert.equal(cero.ok, false);
  assert.equal(deCantidad(cero).length, 1);
  // 8b (NUCLEO_6_7_8 §8.2): el mensaje dice cuál de las validaciones falló y por qué; la ayuda va aparte.
  assert.equal(deCantidad(cero)[0].mensaje, 'quantity: it has to be greater than 0, and it is 0');
  assert.equal(deCantidad(cero)[0].ayuda, 'how many units are burned');
  assert.equal(deCantidad(cero)[0].validacion.tipo, 'a positive number');
  const dos = await transaccion(eje, consume, { X: reserva.id, series: 'E:casa/EUR', quantity: 2 }, 'huesped', { idioma: 'en' });
  assert.deepEqual(deCantidad(dos), []);
  cantidad[1] = ['a thing that is not a type'];
  const roto = await transaccion(eje, consume, { X: reserva.id, series: 'E:casa/EUR', quantity: 2 }, 'huesped', { idioma: 'en' });
  assert.equal(deCantidad(roto).length, 1);
  assert.equal(deCantidad(roto)[0].estado, 'ERROR');
  assert.match(deCantidad(roto)[0].mensaje, /tipo desconocido/);
});

test('el 9.2.0.3 es una colección: una hija suma sus tipos a los de la base al heredar', () => {
  assert.ok(COLECCIONES.includes('9.2.0.3'));
  const base = structuredClone(EPOCA_0_BTML.registro);
  base[9][2][0][3] = [tipo('de la base', 'text')];
  const hija = structuredClone(EPOCA_0_BTML.registro);
  hija[9][2][0][3] = [tipo('de la hija', 'number')];
  const fusion = fusionarRaices(base, hija);
  assert.deepEqual(fusion[9][2][0][3].map((x) => x[0][0]), ['de la base', 'de la hija']);
});

test('opciones de un parámetro: file y book las da el aparato y la época solo filtra; un tipo con fórmula de opciones', async () => {
  const { eje, reserva } = await ejemploReserva({ confirmar: false });
  const p = structuredClone(plantillaDeTransaccion('anchor here'));
  p[1].push([['where'], ['another book'], ['any'], ['me'], ['payload'], ['1.9'], ['prueba'], ['optional'], [9], ['dónde']]);
  const param = parametros(p).find((x) => x.nombre === 'where');
  assert.equal(param.base, 'book');
  const delAparato = () => [{ valor: eje.genesisId, texto: 'Este' }, { valor: ID_A, texto: 'Casa (privado)' }, { valor: ID_B, texto: 'Otro' }, { valor: 'no es hex', texto: 'Roto' }, { valor: ID_A, texto: 'Repetido' }];
  assert.deepEqual(contrato.opciones(eje, reserva.id, null, { yo: 'casa', parametro: param }), [], 'sin el aparato, ninguna: el núcleo no da libros');
  assert.deepEqual(contrato.opciones(eje, reserva.id, null, { yo: 'casa', parametro: param, opcionesDelAparato: delAparato }), [{ valor: ID_A, texto: 'Casa (privado)' }, { valor: ID_B, texto: 'Otro' }], 'ni este libro ni lo que no es un id; la etiqueta, la del aparato');
  // La fórmula de opciones de un tipo de base del aparato solo filtra (it = cada valor), nunca añade.
  const filtrado = { ...param, opcionesDelTipo: '=it != "' + ID_B + '"' };
  assert.deepEqual(contrato.opciones(eje, reserva.id, null, { yo: 'casa', parametro: filtrado, opcionesDelAparato: delAparato }).map((x) => x.valor), [ID_A]);
  const hostil = { ...param, opcionesDelTipo: '="' + 'c'.repeat(64) + '"' };
  assert.deepEqual(contrato.opciones(eje, reserva.id, null, { yo: 'casa', parametro: hostil, opcionesDelAparato: delAparato }), [], 'una fórmula que da un libro no lo añade');
  // Un tipo que no es del aparato y trae fórmula de opciones: una lectura con it = X, filtrada por las validaciones.
  const quien = parametros(plantillaDeTransaccion('anchor here')).find((x) => x.nombre === 'who');
  const conOpciones = { ...quien, opcionesDelTipo: '=before.3', validaciones: [{ de: 'libro', formula: '=it != "casa"' }] };
  const ids = contrato.opciones(eje, reserva.id, null, { yo: 'casa', parametro: conOpciones }).map((x) => x.valor);
  assert.ok(ids.length >= 2 && !ids.includes('casa') && ids.includes('huesped'), JSON.stringify(ids));
});

test('esTipoSimple: un tipo declarado es simple si lo es su base', () => {
  assert.equal(contrato.esTipoSimple(['an id']), true);
  assert.equal(contrato.esTipoSimple(['a positive number']), true);
  assert.equal(contrato.esTipoSimple(['tenfold']), false);
});

test('cohortes() lee el tipo «cohort» (no el parámetro de una acción por su nombre), y hasta la pasada enumera lo mismo que «change cohort»', () => {
  assert.deepEqual(contrato.cohortes().map((c) => [c.valor, c.alcance]), [['siblings', 'hermanos'], ['project', 'proyecto'], ['genesis', 'general']]);
  const param = plantillaDeTransaccion('change cohort')[1].find((p) => Array.isArray(p) && p[0][0] === 'cohort');
  assert.equal(resolverTipo(['cohort']).validaciones.at(-1).formula, param[2][param[2].length - 1], 'el tipo y el parámetro de la acción dicen lo mismo hasta la pasada única');
  // Una época que endurece el tipo (solo hermanos y proyecto) cambia las cohortes que se leen.
  const epoca = epocaConTipos([tipo('cohort', 'cohort', '="siblings" in it or "project" in it')]);
  assert.deepEqual(contrato.cohortes({ epoca }).map((c) => c.valor), ['siblings', 'project']);
});
