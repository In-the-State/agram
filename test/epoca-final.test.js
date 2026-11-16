// La época 0 final (encargo «época 0 final», 16-11): lo que cambia de la época 0 y de su núcleo de una vez, antes de la
// aceptación. Aquí, lo de la lectura (#83: el 0 legible de lo escrito por plantilla, las series de E, los nombres de
// recuento, las traducciones sin el nombre delante), las preferencias de formato (#93), los pasos del camino en llano,
// los textos de la época sin BQL V0 y la ayuda de «pay url». La lectura «second factor» a 200 criterios y la estación con
// desbordamiento están en test/segundo-factor.test.js; la retirada de las correcciones, en test/epoca-btml.test.js.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as A from '../src/acciones.js';
import * as C from '../src/contrato.js';
import { EPOCA_0_BTML, IDS_ANTERIORES_DE_LA_0, EPOCAS_POR_ID } from '../src/epocas.js';
import { EPOCA_0_DATOS } from '../datos/epocas/epocas.js';
import { analizar } from '../src/bqlm.js';
import { ejemploCompra } from '../ejemplos/ikisai/compra-food.mjs';
import { pagaElCoste } from './ayudas-coste.js';

const T1 = '2026-11-08T12:00:00Z';

async function escribir(eje, plantilla, params, yo) {
  const r = await A.transaccion(eje, plantilla, params, yo, { t: T1 });
  assert.ok(r.ok, plantilla + ': ' + JSON.stringify(r.motivos));
  await eje.anadir(r.evento);
  return r.evento;
}

// ---------- #83: el 0 legible ----------

test('ceroLegible: el registro guarda el 0 canónico en inglés; la lectura lo vuelve a componer en el idioma de quien lee, sin el nombre de la plantilla delante', async () => {
  const { eje, menu } = await ejemploCompra();
  const adjunto = await escribir(eje, 'attach a file', { X: menu.id, file: 'archivo:' + 'a'.repeat(64), format: 'image', size: 3 }, 'huesped');
  assert.equal(adjunto.payload[0], 'attach a file: huesped attaches a file to Menú del día', 'el registro no cambia: el canónico');
  const huesped = C.legible(eje, 'huesped', 'identity').texto;
  assert.deepEqual(C.ceroLegible(eje, adjunto.id, { idioma: 'es' }), { texto: huesped + ' adjunta un archivo a Menú del día', plantilla: 'attach a file', compuesto: true });
  assert.deepEqual(C.ceroLegible(eje, adjunto.id, { idioma: 'en' }), { texto: huesped + ' attaches a file to Menú del día', plantilla: 'attach a file', compuesto: true });
  // Con cantidades y series: la serie por su nombre y su emisor, no su clave.
  const aplica = await escribir(eje, 'apply a resource', { X: menu.id, quantity: 2, price: [['E:casa/EUR'], [12]] }, 'huesped');
  assert.match(aplica.payload[0], /^apply a resource: huesped gives 24 E:casa\/EUR to cocina for Menú del día$/);
  const casa = C.legible(eje, 'casa', 'identity').texto;
  assert.equal(C.ceroLegible(eje, aplica.id, { idioma: 'es' }).texto, huesped + ' da 24 euros de ' + casa + ' a ' + C.legible(eje, 'cocina', 'identity').texto + ' por Menú del día');
  assert.equal(C.ceroLegible(eje, aplica.id, { idioma: 'en' }).texto, huesped + ' gives 24 ' + casa + ' euros to ' + C.legible(eje, 'cocina', 'identity').texto + ' for Menú del día');
  // Un registro anclado sobre otro escrito por plantilla: el nombre de lo referido es su 0 legible, también compuesto.
  const sobreAdjunto = await escribir(eje, 'attach a file', { X: adjunto.id, file: 'archivo:' + 'b'.repeat(64), format: 'image', size: 3 }, 'huesped');
  assert.equal(C.ceroLegible(eje, sobreAdjunto.id, { idioma: 'es' }).texto, huesped + ' adjunta un archivo a ' + huesped + ' adjunta un archivo a Menú del día');
  // Lo que no escribió una plantilla (un 0 a mano, sin plantilla en su 4) se lee tal cual.
  assert.deepEqual(C.ceroLegible(eje, menu.id, { idioma: 'es' }), { texto: 'Menú del día', plantilla: null, compuesto: false });
  const aMano = await eje.escribir({ autor: 'huesped', sobre: menu.id, t: T1, movimientos: [pagaElCoste('huesped')], payload: ['attach a file: lo escribo yo', ['x'], ['all announced movements happened'], ['huesped'], ['attach a file']] });
  assert.deepEqual(C.ceroLegible(eje, aMano.id, { idioma: 'es' }), { texto: 'attach a file: lo escribo yo', plantilla: 'attach a file', compuesto: false }, 'nombra la plantilla pero su 0 no es lo que ella da: tal cual');
  assert.equal(C.ceroLegible(eje, 'f'.repeat(64)), null);
});

test('ceroLegible: lo referido se nombra por su 0 legible (donde el canónico dice «∅», si tiene uno) y lo que no tiene 0 es «nadie»; un mensaje que es solo un hueco (el nombre de la cosa) da ese nombre', async () => {
  const { eje, menu } = await ejemploCompra();
  const altaH = eje.alta('huesped').id;
  const huesped = C.legible(eje, 'huesped', 'identity').texto;
  // Un registro cuyo payload es un terminal: el canónico no le encuentra 0 («∅»); su representación es ese texto.
  const nota = await eje.escribir({ autor: 'huesped', sobre: altaH, t: T1, movimientos: [pagaElCoste('huesped')], payload: 'una nota' });
  const sobreNota = await escribir(eje, 'attach a file', { X: nota.id, file: 'archivo:' + 'c'.repeat(64), format: 'image', size: 3 }, 'huesped');
  assert.match(sobreNota.payload[0], /attaches a file to ∅$/);
  assert.equal(C.ceroLegible(eje, sobreNota.id, { idioma: 'es' }).texto, huesped + ' adjunta un archivo a una nota');
  // Un registro cuyo 0 es solo una referencia (sin texto): lo referido, por su 0 (el canónico escribe su id).
  const sinTexto = await eje.escribir({ autor: 'huesped', sobre: altaH, t: T1, movimientos: [pagaElCoste('huesped')], payload: [[{ ref: menu.id }], ['x']] });
  const compromiso = await escribir(eje, 'commit P', { X: sinTexto.id, amount: 1 }, 'huesped');
  assert.equal(compromiso.payload[0], 'commit P: huesped commits 1 P to ' + menu.id);
  assert.equal(C.ceroLegible(eje, compromiso.id, { idioma: 'es' }).texto, huesped + ' compromete 1 P con Menú del día');
  // Un registro cuyo 0 es una décupla sin texto: «nadie», no «∅».
  const vacio = await eje.escribir({ autor: 'huesped', sobre: altaH, t: T1, movimientos: [pagaElCoste('huesped')], payload: [[['a'], ['b']], ['x']] });
  const sobreVacio = await escribir(eje, 'commit P', { X: vacio.id, amount: 1 }, 'huesped');
  assert.equal(C.ceroLegible(eje, sobreVacio.id, { idioma: 'es' }).texto, huesped + ' compromete 1 P con nadie');
  assert.equal(C.ceroLegible(eje, sobreVacio.id, { idioma: 'en' }).texto, huesped + ' commits 1 P to nobody');
  // «register a thing»: su mensaje es «{last ev.3.1}», el nombre de la cosa.
  const cosa = await escribir(eje, 'register a thing', { X: altaH, thing: 'cartera', minutes: 1 }, 'huesped');
  assert.equal(cosa.payload[0], 'cartera');
  assert.deepEqual(C.ceroLegible(eje, cosa.id, { idioma: 'es' }), { texto: 'cartera', plantilla: 'register a thing', compuesto: true });
});

// ---------- #83: las series de E, los recuentos y las traducciones ----------

test('legible: una serie de E por el nombre de su denominación en el idioma y su emisor por su 0; lo no listado, su código', async () => {
  const { eje } = await ejemploCompra();
  const casa = C.legible(eje, 'casa', 'identity').texto;
  assert.equal(C.legible(eje, 'E:casa/EUR', undefined, { idioma: 'es' }).texto, 'euros de ' + casa);
  assert.equal(C.legible(eje, 'E:casa/EUR', undefined, { idioma: 'en' }).texto, casa + ' euros');
  assert.equal(C.legible(eje, 'E:casa/USD', undefined, { idioma: 'es' }).texto, 'dólares de ' + casa);
  assert.equal(C.legible(eje, 'E:casa/USD', undefined, { idioma: 'en' }).texto, casa + ' dollars');
  assert.equal(C.legible(eje, 'E:casa/hora', undefined, { idioma: 'es' }).texto, 'horas de ' + casa);
  assert.equal(C.legible(eje, 'E:casa/XYZ', undefined, { idioma: 'es' }).texto, 'XYZ de ' + casa, 'lo no listado se queda como está');
  const s = C.legible(eje, 'E:casa/EUR', undefined, { idioma: 'es' }).partes;
  assert.deepEqual([s.denominacion, s.nombre, s.emisor, s.emisorTexto], ['EUR', 'euros', 'casa', casa]);
  assert.equal(C.legible(eje, { serie: 'E:casa/EUR', cantidad: 7 }, undefined, { idioma: 'es' }).texto, '7 euros de ' + casa);
  // Las ayudas de la época, sin jerga en los ejemplos.
  const sf = A.parametros(A.plantillaDeTransaccion('second factor')).find((p) => p.nombre === 'family');
  assert.match(C.texto(null, C.claves.parametro('second factor', 'family', 'help'), 'es'), /una serie concreta \(euros de casa\)/);
  assert.match(sf.ayuda, /a concrete series \(casa euros\)/);
  assert.doesNotMatch(JSON.stringify(EPOCA_0_BTML.registro[9][4]), /\(E:casa\/EUR\)/);
});

test('legible: los nombres de las plantillas de recuento («weighted sum», …) se traducen por el camino normal', () => {
  assert.deepEqual(['weighted sum', 'weighted mean', 'threshold', 'one per person'].map((n) => C.legible(null, n, undefined, { idioma: 'es' }).texto), ['suma ponderada', 'media ponderada', 'umbral', 'uno por persona']);
  assert.deepEqual(C.legible(null, 'weighted sum', undefined, { idioma: 'es' }).partes, { recuento: 'weighted sum' });
  assert.equal(C.legible(null, 'weighted sum', undefined, { idioma: 'en' }).texto, 'weighted sum');
});

test('las traducciones de las reglas y de las plantillas no llevan su nombre canónico delante (el nombre es el 0 de su décupla); el canónico, sí', () => {
  assert.equal(C.mensaje(null, 'every event moves tokens', 'es'), 'la transacción no mueve ningún token');
  assert.equal(C.mensaje(null, 'every event moves tokens', 'en'), 'every event moves tokens: the transaction moves no token');
  for (const { nombre } of A.plantillasDeTransaccion()) {
    const m = C.texto(null, C.claves.mensaje(nombre), 'es');
    assert.ok(!m.startsWith(nombre + ': '), nombre);
  }
});

// ---------- el paso del camino, en llano ----------

test('el paso del camino (lo anunciado y pendiente) dice cuánto, de quién y a quién en llano, sin claves de serie ni flechas', async () => {
  const { eje, menu } = await ejemploCompra();
  const encargo = await eje.escribir({ autor: 'cocina', sobre: menu.id, t: T1, payload: ['Encargo', ['x'], ['all announced movements happened'], ['cocina', 'huesped']], movimientos: [pagaElCoste('cocina')] });
  await eje.escribir({ autor: 'cocina', sobre: encargo.id, en: '4100000000', t: T1, payload: 'servir', movimientos: [pagaElCoste('cocina'), { token: 'T', escala: 'hora', cantidad: 1, de: 'huesped', a: 'cocina', estado: 'anunciado', refiere: '2026-11-20T10:00:00Z' }] });
  const [paso] = (await A.camino(eje, encargo.id, 'huesped', { t: T1 })).pasos.filter((p) => p.regla === 'stage');
  const [huesped, cocina] = ['huesped', 'cocina']; // por su identidad, como la frase de previsualizar de la carta
  assert.equal(paso.falta, C.mensaje(eje, 'stage', 'es') + ' · servir: ' + huesped + ' da 1 hora a ' + cocina);
  assert.doesNotMatch(paso.falta, /T:hora|→/);
  const [en] = (await A.camino(eje, encargo.id, 'huesped', { t: T1, idioma: 'en' })).pasos.filter((p) => p.regla === 'stage');
  assert.match(en.falta, new RegExp(' · servir: ' + huesped + ' gives 1 hora to ' + cocina + '$'));
});

// ---------- #93: las preferencias de formato ----------

test('format settings (#93): fecha, números, estilo y vista del editor se escriben y se leen como «language»; quien no ha elegido lee el primero; lo desconocido vuelve al de siempre y validar lo dice', async () => {
  const { eje } = await ejemploCompra();
  const claves = C.clavesDeConfiguracionDe(C.AJUSTES_DE_FORMATO);
  assert.deepEqual(claves.map((c) => [c.clave, c.valores, c.defecto]), [
    ['date format', ['legible', 'larga', 'corta', 'iso'], 'legible'],
    ['number format', ['tal-cual', 'agrupados'], 'tal-cual'],
    ['editor style', ['expandido', 'compacto'], 'expandido'],
    ['editor view', ['crudo', 'formateado'], 'crudo'],
  ]);
  const deSiempre = { 'date format': 'legible', 'number format': 'tal-cual', 'editor style': 'expandido', 'editor view': 'crudo' };
  assert.deepEqual(C.configuracionDeFormato(eje, 'huesped'), { ...deSiempre, de: null });
  const payload = C.registroDeAjustes(C.AJUSTES_DE_FORMATO, { 'date format': 'iso', 'number format': 'agrupados', 'editor style': 'compacto' }, { quien: 'huesped' });
  assert.deepEqual(payload.slice(0, 4), [['format settings'], ['date format', 'number format', 'editor style'], ['iso', 'agrupados', 'compacto'], ['huesped']]);
  const mio = await eje.escribir({ autor: 'huesped', sobre: eje.alta('huesped').id, en: '9000000000', t: T1, movimientos: [pagaElCoste('huesped')], payload });
  assert.deepEqual(C.configuracionDeFormato(eje, 'huesped'), { 'date format': 'iso', 'number format': 'agrupados', 'editor style': 'compacto', 'editor view': 'crudo', de: mio.id });
  assert.deepEqual(C.validar(eje, mio), []);
  assert.ok(C.esDeConfiguracion(eje, mio, { ajustes: [C.AJUSTES_DE_FORMATO] }));
  // Un valor desconocido: la lectura vuelve al de siempre y la plantilla lo señala.
  const mal = await eje.escribir({ autor: 'huesped', sobre: eje.alta('huesped').id, en: '9000000000', t: T1, movimientos: [pagaElCoste('huesped')], payload: C.registroDeAjustes(C.AJUSTES_DE_FORMATO, { 'date format': 'juliana', 'number format': 'agrupados' }, { quien: 'huesped' }) });
  assert.deepEqual(C.configuracionDeFormato(eje, 'huesped'), { ...deSiempre, 'number format': 'agrupados', de: mal.id });
  assert.deepEqual(C.validar(eje, mal).map((x) => x.posicion), [2], 'en la posición de los valores del registro, como «render»');
  assert.match(C.validar(eje, mal)[0].motivo, /^date format: /);
  // Sus nombres y los de sus valores, en es y en.
  const T = (clave, idioma) => C.texto(null, clave, idioma);
  assert.equal(T(C.claves.plantilla('format settings'), 'es'), 'ajustes de formato');
  assert.deepEqual(['date format', 'number format', 'editor style', 'editor view'].map((k) => T(C.claves.parametro('format settings', k, 'label'), 'es')), ['formato de fecha', 'formato de números', 'estilo del editor', 'vista del editor']);
  assert.deepEqual(['legible', 'larga', 'corta', 'iso'].map((v) => T(C.claves.parametro('format settings', 'date format', 'option ' + v), 'es')), ['legible', 'larga', 'corta', 'ISO 8601']);
  assert.deepEqual(['legible', 'larga', 'corta', 'iso'].map((v) => T(C.claves.parametro('format settings', 'date format', 'option ' + v), 'en')), ['readable', 'long', 'short', 'ISO 8601']);
  assert.deepEqual(['tal-cual', 'agrupados'].map((v) => T(C.claves.parametro('format settings', 'number format', 'option ' + v), 'en')), ['as is', 'grouped']);
  assert.deepEqual(['expandido', 'compacto'].map((v) => T(C.claves.parametro('format settings', 'editor style', 'option ' + v), 'en')), ['expanded', 'compact']);
});

// ---------- los textos de la época, sin BQL V0; «pay url» ----------

test('los textos de la época 0 (raíz, reglas, plantillas, guía, modelos, mensajes) no enseñan funciones del BQL V0; sus ejemplos de fórmula analizan en el BQL mínimo', () => {
  const V0 = /\b(LOCAL|REF|BUSCAR|FILTRAR|ORDENAR|ELEGIR|ACTUAL|CONTAR|SUMAR|BASES|CAJA|FRESCURA|VALOR_R|LENTE)\b/;
  const todo = JSON.stringify([EPOCA_0_BTML.registro, [...EPOCA_0_BTML.registros.values()], EPOCA_0_BTML.transacciones.map((x) => x.plantilla), EPOCA_0_DATOS]);
  assert.doesNotMatch(todo, V0);
  const ejemplos = EPOCA_0_BTML.reglas.map((r) => r.ejemplo).join(' ');
  const formulas = [...ejemplos.matchAll(/=((?:first |last |\()[^,;']*?)(?= da| lee| lo devuelve|,|\)?\.$| con)/g)].map((m) => m[1].trim());
  assert.ok(formulas.length >= 5, formulas.join(' | '));
  for (const f of formulas) assert.doesNotThrow(() => analizar('=' + f, { sujeto: true }), f);
});

test('la ayuda de «pay url» (exterior settings) dice lo que hace: el servicio de pagos de StateArk', () => {
  assert.equal(C.texto(null, C.claves.parametro('exterior settings', 'pay url', 'help'), 'es'), 'la dirección del servicio de pagos (StateArk): la carta le pide los recibos de pago y firma con la clave del titular lo que le pide');
  assert.equal(C.texto(null, C.claves.parametro('exterior settings', 'pay url', 'label'), 'es'), 'pagos');
  const p = C.plantillas(null).find((x) => x.nombre === 'exterior settings').registro;
  assert.equal(p[4][9].at(-1), "the address of the payment service (StateArk): the card asks it for payment receipts and signs what it asks with the holder's key");
});

// ---------- el id ----------

test('el id de la época 0 cambia una vez: el de ayer (9cd5a949…) sigue resolviendo a la de hoy', () => {
  assert.notEqual(EPOCA_0_BTML.id, '9cd5a949ae30d3ef3dff698eec90f600d62a229d77aa17c1bf6b702fff6415f0');
  assert.ok(IDS_ANTERIORES_DE_LA_0.includes('9cd5a949ae30d3ef3dff698eec90f600d62a229d77aa17c1bf6b702fff6415f0'));
  assert.equal(EPOCAS_POR_ID.get('9cd5a949ae30d3ef3dff698eec90f600d62a229d77aa17c1bf6b702fff6415f0'), EPOCA_0_BTML);
});
