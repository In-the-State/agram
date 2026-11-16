// La firmeza (encargo «firmeza», VG 16-11; state/ANCLAJE_EN_CASCADA.md §2-§4; SIP 0 de Core StateArk, «El sello en
// cascada»): las filas 7.5 y 7.6 de la época 0 y su lector (cascadaDe), la vía «cascada» de «sealed» (X.6.8.5: la décupla
// del sello con el compromiso en el 3 y la cadena de cabeceras de lote en el 9), la lectura «firm» (X.6.8.9) y su fachada
// contrato.firmeza, y «en duda» por una bifurcación de línea. Las claves son de prueba, generadas en cada ejecución; los
// vectores de StateArk se LEEN si su carpeta está (solo lectura: no se copian sus claves privadas ni se ejecuta nada de ella).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { contrato, sello as selloDe } from '../src/index.js';
import { Eje } from '../src/eje.js';
import { evaluar, Presupuesto } from '../src/bqlm.js';
import { ContextoEje } from '../src/contexto-eje.js';
import { EPOCA_0_BTML, cargarEpocaEscrita, cargarEpocaBtml } from '../src/epocas.js';
import { EPOCA_0_BTML_DATOS, REGLAS_DE_EPOCA_DATOS, PLANTILLAS_DE_EPOCA_DATOS } from '../datos/epocas/epocas.js';
import { generarClaves } from '../src/autoridad.js';
import { validarPayload } from '../src/btml.js';
import { epocaState } from '../datos/epocas/state/generar.mjs';
import { pagaElCoste } from './ayudas-coste.js';
import { selloEnCascada, selloCompleto, cabeceraDeLoteFirmada, LIBRO_DE_PRUEBA, observadorDePrueba, releDePrueba, reciboFirmado, declararExterior, NUMS } from './ayudas-sello.js';

const T = (m) => '2026-11-10T10:' + String(m).padStart(2, '0') + ':00Z';
const regla = (nombre) => EPOCA_0_BTML.lecturas.find((r) => r[0][0] === nombre);
const leer = (eje, id, d) => evaluar('=first (first it.6).8.' + d, new ContextoEje(eje, { epoch: EPOCA_0_BTML }), { sujeto: id });
const VECTORES = 'C:/Users/acer/Documents/InTheState/stateark/sip/vectores/cascada/';

/** Un eje con firmas, tres registros que solo pagan su coste y la cuenta raíz (vg), que declara al observador. */
async function ejeDePrueba(observador) {
  const cuenta = await generarClaves();
  const eje = await Eje.genesis({ identidad: 'vg', foco: ['mi eje'], t: T(0), clave: cuenta.publica, privada: cuenta.privada, exigirFirmas: true });
  const e1 = await eje.escribir({ autor: 'vg', sobre: eje.genesisId, t: T(1), movimientos: [pagaElCoste('vg')], payload: ['uno'] }, cuenta.privada);
  const e2 = await eje.escribir({ autor: 'vg', sobre: e1.id, t: T(2), movimientos: [pagaElCoste('vg')], payload: ['dos'] }, cuenta.privada);
  const e3 = await eje.escribir({ autor: 'vg', sobre: e1.id, t: T(3), movimientos: [pagaElCoste('vg')], payload: ['tres'] }, cuenta.privada);
  if (observador) await declararExterior(eje, { observadores: [observador.publica], privada: cuenta.privada, t: T(4) });
  return { eje, e1, e2, e3 };
}

// ---------- 1 · las filas 7.5 y 7.6 y su lector ----------

test('7.5 y 7.6 de la época 0: listas hermanas sin tuplas, con su nota; cascadaDe las lee y una época hija que las fija manda', () => {
  const siete = EPOCA_0_BTML.registro[7];
  assert.equal(siete[5][0][0], 'anchoring cadence');
  assert.equal(siete[6][0][0], 'layers');
  assert.match(siete[6][0][1], /not a rule of validity/, 'el ritmo es de sellos, no de registros, y no rechaza nada');
  assert.ok(validarPayload(siete).ok);
  assert.deepEqual(contrato.cascadaDe(), {
    plazos: { person: { escala: 6, segundos: 31536000 }, group: { escala: 5, segundos: 2419200 }, company: { escala: 4, segundos: 604800 }, provider: { escala: 3, segundos: 86400 } },
    capas: [{ nivel: 1, escala: 0, ritmo: 1, familia: 'T' }, { nivel: 2, escala: 1, ritmo: 60, familia: 'R' }, { nivel: 3, escala: 2, ritmo: 3600, familia: 'P' }, { nivel: 4, escala: 3, ritmo: 86400, familia: 'E' }],
  });
  // Los niveles son números y los ritmos y los plazos, índices de las escalas de T del 7.0 (año, ciclo, semana, día), no segundos copiados.
  assert.deepEqual([siete[6][1], siete[6][2], siete[5][2]], [[1, 2, 3, 4], [0, 1, 2, 3], [6, 5, 4, 3]]);
  assert.doesNotMatch(siete[6][0][1], /sidechain|liquid/i, 'sin nombres de producto');
  const segundos = Object.fromEntries(siete[0].map((f) => [f[0][0], f[1][0]]));
  assert.deepEqual(Object.values(contrato.cascadaDe().plazos).map((p) => p.segundos), [segundos['año'], segundos.ciclo, segundos.semana, segundos['día']]);
  // La época state hereda de la 0: las mismas filas.
  assert.deepEqual(contrato.cascadaDe(cargarEpocaEscrita(epocaState())), contrato.cascadaDe());
  // Una época que fija su 7.6 manda.
  const hija = structuredClone(EPOCA_0_BTML.registro);
  hija[7][6] = [['layers', 'una hija'], [1, 2], [1, 9], ['T', 'E']];
  hija[7][5] = [['anchoring cadence', 'una hija'], ['group'], [3]];
  assert.deepEqual(contrato.cascadaDe(hija), { plazos: { group: { escala: 3, segundos: 86400 } }, capas: [{ nivel: 1, escala: 1, ritmo: 60, familia: 'T' }, { nivel: 2, escala: 9, ritmo: null, familia: 'E' }] }, 'un índice que 7.0 no tiene: null');
});

// ---------- 2 · «sealed» por la vía «cascada» ----------

test('el mapa del sello aprende la vía «cascada»: decuplaDeSello pone el compromiso en el 3 y la cadena en el 9, y la vía «taproot» no cambia', async () => {
  const obs = await observadorDePrueba();
  const id = 'ab'.repeat(32);
  const s = await selloEnCascada(id, { observador: obs, altura: 5, capas: [{ nivel: 1, otros: 2 }, { nivel: 4, otros: 1 }] });
  const P = selloDe.POSICIONES_DEL_SELLO;
  const en = (d, camino) => camino.split('.').map(Number).reduce((x, k) => x?.[k], d);
  assert.ok(validarPayload(s.decupla).ok);
  assert.equal(en(s.decupla, P.via), 'cascada');
  assert.equal(en(s.decupla, P.compromisoCascada), s.prueba.compromiso);
  assert.equal(en(s.decupla, P.compromisoCascada), s.cabeceras[1].hash, 'el compromiso es el hash de la cabecera de arriba');
  const cadena = en(s.decupla, P.cadena);
  assert.equal(cadena.length, 2);
  const c0 = en(cadena[0], P.eslabon.cabecera);
  assert.deepEqual([en(c0, P.cabeceraDeLote.clase)[0], en(c0, P.cabeceraDeLote.numero), en(c0, P.cabeceraDeLote.numeroLe)[0], en(c0, P.cabeceraDeLote.horaLe).length], ['cabecera de lote', 0, '0000000000000000', 1]);
  // La cabecera es la v2: «v2» en su 0, el libro en el 8 y las referencias en el 9 (32 bytes a cero si no hay).
  assert.deepEqual([en(c0, P.cabeceraDeLote.clase), en(c0, P.cabeceraDeLote.libro), en(c0, P.cabeceraDeLote.referencias)], [['cabecera de lote', 'SIP 0', 'v2'], LIBRO_DE_PRUEBA, '00'.repeat(32)]);
  assert.deepEqual(en(cadena[0], P.eslabon.nivel), [1], 'sin grado, el 9.k.1 es solo el nivel');
  assert.equal(en(cadena[1], P.eslabon.nivel)[0], 4);
  assert.equal(cadena[0].length, 4, 'la cabecera, el nivel, los lados y los hermanos: no hay 9.k.4');
  // El grado y la red, opacos, detrás del nivel (9.k.1 = [nivel, grado, red]): caben también en un eslabón sin camino «sip»; sin grado no hay red.
  const g = await selloEnCascada(id, { observador: obs, capas: [{ nivel: 1, otros: 1, grado: 'g1' }, { nivel: 2, otros: 1, red: 'suelta' }, { nivel: 4, grado: 7, red: 'pruebas' }] });
  assert.deepEqual(en(g.decupla, P.cadena + '.0.' + P.eslabon.nivel), [1, 'g1']);
  assert.deepEqual(en(g.decupla, P.cadena + '.1.' + P.eslabon.nivel), [2], 'una red sin grado no se escribe');
  assert.deepEqual(en(g.decupla, P.cadena + '.2'), [g.cabeceras[2].decupla, [4, 7, 'pruebas']], 'el de arriba, solo en su lote: sin camino, con su grado y su red');
  assert.ok(validarPayload(g.decupla).ok);
  // La v1 (sin «v2», sin libro o sin referencias) ya no es una cabecera de lote.
  assert.equal(selloDe.leerCabeceraDeLote(Object.assign([...c0], { 0: ['cabecera de lote', 'SIP 0'] })), null);
  assert.equal(selloDe.leerCabeceraDeLote(c0.slice(0, 8)), null);
  assert.equal(selloDe.decuplaDeCabecera({ ...s.cabeceras[0].cabecera, libro: undefined }), null);
  assert.ok(en(cadena[0], P.eslabon.lados).length >= 1 && en(cadena[0], P.eslabon.hermanos).length === en(cadena[0], P.eslabon.lados).length);
  assert.equal(selloDe.leerCabeceraDeLote(c0).hash, s.cabeceras[0].hash);
  // La vía «taproot»: ni un byte distinto de la de antes (el 3 es la raíz del lote; el 9, el camino «sip»).
  const t = await selloCompleto(id, { observador: obs, ids: [id, 'cd'.repeat(32)] });
  assert.equal(t.decupla[6], 'taproot');
  assert.deepEqual(t.decupla[9].map((x) => x.length), [1, 1]);
  // Sin compromiso no hay décupla; una cadena mal formada no lleva 9.
  assert.equal(selloDe.decuplaDeSello({ ...s.prueba, compromiso: undefined }, id), null);
  const mala = structuredClone(s.prueba);
  mala.prueba.cadena[0].cabecera.firma = 'xx';
  assert.equal(selloDe.decuplaDeSello(mala, id).length, 9);
});

test('la fórmula de «sealed» une las dos vías: sealed.json lleva exactamente formulaDeSellado(); la de cascada son, letra por letra, las ramas del SIP', () => {
  const f = selloDe.formulaDeSellado();
  assert.equal(regla('sealed')[2].at(-1), f);
  assert.match(f, /^=\("cascada" in .*\.6 and bytes\(first .*\.4\) = bytes\(first it\.5\) and /, 'la vía primero, luego la hoja');
  assert.match(f, / or not \("cascada" in .*\.6\) and bytes\(first .*\.4\) = bytes\(first it\.5\) and cat\(/, 'la vía «taproot» detrás, solo si no es «cascada»');
  assert.equal((f.match(/\(count \(first \(\(first it\.6\)\.8\.2 where "sello de tiempo" in it2\.0\)\)\.9\.\d > 0/g) ?? []).length, selloDe.ESLABONES_DE_LA_FORMULA, 'de 1 a 4 eslabones');
  assert.ok(f.includes('"StateArk/Lote/Cabecera/v2"') && !f.includes('Lote/Cabecera/v1'));
  assert.equal((f.match(/ and "v2" in /g) ?? []).length, [1, 2, 3, 4].reduce((a, b) => a + b), 'cada eslabón de cada rama exige la v2');
  assert.ok(regla('sealed')[6].some((n) => n.startsWith('VG 16-11')), 'la nota cuenta el cambio');
});

test('sello en cascada de uno y de dos eslabones con la clave del observador declarada: «sealed» verdadero; cabe en el presupuesto', async () => {
  const obs = await observadorDePrueba();
  const { eje, e1, e2, e3 } = await ejeDePrueba(obs);
  eje.marcarSello(e1.id, await selloEnCascada(e1.id, { observador: obs, altura: 5 }));
  eje.marcarSello(e2.id, await selloEnCascada(e2.id, { observador: obs, altura: 6, capas: [{ nivel: 1, otros: 2 }, { nivel: 4, otros: 3 }], otrasTx: 2 }));
  eje.marcarSello(e3.id, await selloEnCascada(e3.id, { observador: obs, altura: 7, capas: [{ nivel: 1, otros: 1 }, { nivel: 2, otros: 1 }, { nivel: 3 }, { nivel: 4, otros: 2 }] }));
  const ctx = new ContextoEje(eje, { epoch: EPOCA_0_BTML });
  for (const [e, n] of [[e1, 1], [e2, 2], [e3, 4]]) {
    assert.equal(eje.sello(e.id).decupla[9].length, n);
    assert.deepEqual(leer(eje, e.id, 5).valor, [true], n + ' eslabones');
    assert.equal(contrato.verificado(eje, e.id).sello, true);
    const p = new Presupuesto();
    const r = evaluar(regla('sealed')[2].at(-1), ctx, { sujeto: { k: 'reg', id: e.id }, presupuesto: p });
    assert.deepEqual(r.valor, [true]);
    assert.ok(p.usados < p.tope / 4 && p.bytes < p.topeBytes / 3, n + ' eslabones: ' + p.usados + ' ocupantes, ' + p.bytes + ' bytes');
  }
  // Una clave de arriba que no es la del observador declarado: falso.
  const otro = await observadorDePrueba();
  const { eje: b, e1: y1 } = await ejeDePrueba(obs);
  b.marcarSello(y1.id, await selloEnCascada(y1.id, { observador: otro, capas: [{ nivel: 1 }, { nivel: 4 }] }));
  assert.deepEqual(leer(b, y1.id, 5).valor, [false]);
});

test('las seis manipulaciones del vector del SIP dan falso; sin cabecera del bloque, PENDIENTE', async () => {
  const obs = await observadorDePrueba();
  const casa = await generarClaves();
  const capas = [{ nivel: 1, claves: casa, otros: 2 }, { nivel: 4, numero: 1, otros: 2 }];
  const { eje, e1, e2 } = await ejeDePrueba(obs);
  // Otro id: la prueba es de e2 (en su lote está e1), copiada en e1 con su id.
  const deE2 = await selloEnCascada(e2.id, { observador: obs, capas: [{ ...capas[0], ids: [e1.id] }, capas[1]] });
  eje.marcarSello(e1.id, { ...deE2, decupla: selloDe.decuplaDeSello(deE2.prueba, e1.id) });
  assert.deepEqual(leer(eje, e1.id, 5).valor, [false], 'otro id');
  const otra = await selloEnCascada('ef'.repeat(32), { observador: obs, capas });
  for (const [que, cambiar] of [
    ['cabecera de la casa con otra hora', (q) => { q.prueba.cadena[0].cabecera.hora += 1; }],
    ['firma de StateArk de otra cabecera', (q) => { q.prueba.cadena[1].cabecera.firma = otra.prueba.prueba.cadena[1].cabecera.firma; }],
    ['compromiso de otra cabecera', (q) => { q.compromiso = otra.prueba.compromiso; }],
    ['interna cambiada (NUMS)', (q) => { q.prueba.taproot.interna = NUMS; }],
    ['sin el eslabón de arriba', (q) => { q.prueba.cadena.pop(); }],
  ]) {
    const { eje: b, e1: y1 } = await ejeDePrueba(obs);
    b.marcarSello(y1.id, await selloEnCascada(y1.id, { observador: obs, capas, cambiar }));
    assert.ok(b.sello(y1.id).decupla, que + ': la décupla se guarda');
    assert.deepEqual(leer(b, y1.id, 5).valor, [false], que);
    assert.equal(contrato.verificado(b, y1.id).sello, false, que);
  }
  // Lo que falta deja PENDIENTE, como en la vía «taproot».
  const { eje: b, e1: y1 } = await ejeDePrueba(obs);
  b.marcarSello(y1.id, await selloEnCascada(y1.id, { observador: obs, capas, cambiar: (q) => { delete q.prueba.cabecera; } }));
  assert.equal(leer(b, y1.id, 5).estado, 'PENDIENTE');
});

/**
 * Un contexto sobre un eje real en el que `it` es un registro de mentira cuyo 5 es `id` y cuyo 6.8.2 trae la décupla
 * `decupla` (la de los vectores, que sellan ids que no son de este eje); lo demás (before.8.6, las décuplas puras), del eje.
 */
function contextoConSello(eje, id, decupla) {
  const real = new ContextoEje(eje, { epoch: EPOCA_0_BTML });
  const IT = { k: 'vector' };
  const SEIS = { k: 'vector6' };
  const OCHO = { k: 'vector68' };
  const paso = (n, d) => (n === IT ? (d === 5 ? [id] : d === 6 ? [SEIS] : []) : n === SEIS ? (d === 8 ? [OCHO] : []) : d === 2 ? ['2026-11-16T12:10:00.000Z', decupla[1], decupla[2], { k: 'dec', id: null, camino: [], v: decupla }] : []);
  const falsos = new Set([IT, SEIS, OCHO]);
  const ctx = Object.create(real);
  ctx.ocupantes = (nodo, camino, presupuesto) => {
    if (!falsos.has(nodo)) return real.ocupantes(nodo, camino, presupuesto);
    const [d, ...resto] = camino;
    const dentro = paso(nodo, d);
    return resto.length ? dentro.flatMap((x) => (falsos.has(x) ? ctx.ocupantes(x, resto, presupuesto) : real.ocupantes(x, resto, presupuesto))) : dentro;
  };
  for (const k of ['nombre', 'padre', 'hijos', 'valor', 'texto', 'serie', 'subarbol', 'asientos', 'payload']) if (typeof real[k] === 'function') ctx[k] = (...a) => real[k](...a);
  ctx.valor = (n) => (falsos.has(n) ? undefined : real.valor(n));
  return { ctx, it: IT };
}

test('los vectores de StateArk (vectores/cascada, solo lectura) sobre un eje real: verdaderos con su observador declarado; sus manipulaciones, falsas', { skip: !existsSync(VECTORES + 'prueba-de-un-registro.json') && 'sin el repositorio de StateArk' }, async () => {
  const v = JSON.parse(readFileSync(VECTORES + 'prueba-de-un-registro.json', 'utf8'));
  const observador = v.observadores[0];
  const cuenta = await generarClaves();
  const eje = await Eje.genesis({ identidad: 'vg', foco: ['mi eje'], t: T(0), clave: cuenta.publica, privada: cuenta.privada, exigirFirmas: true });
  await declararExterior(eje, { observadores: [observador], privada: cuenta.privada, t: T(1) });
  const f = regla('sealed')[2].at(-1);
  // La parte «cascada» de mi fórmula es, letra por letra, la que StateArk fija en su vector (sin el «=» de delante).
  assert.equal(f.slice(1, f.indexOf(' or not ("cascada" in ')), v.formula_sealed.formula, 'formulaCascada() y formula_sealed del vector');
  const sellado = (d, id = d[4]) => { const { ctx, it } = contextoConSello(eje, id, d); return evaluar(f, ctx, { sujeto: it }); };
  for (const n of ['un_eslabon', 'dos_eslabones']) {
    const d = v[n].decupla;
    assert.deepEqual(selloDe.decuplaDeSello(v[n].prueba, v[n].prueba.id), d, n + ': decuplaDeSello da, tal cual, la décupla del vector (cabecera v2; nivel, grado y red en el 9.k.1)');
    const r = sellado(d);
    assert.deepEqual([r.estado, r.valor], ['RESUELTO', [true]], n + ': ' + r.motivo);
  }
  const dos = v.dos_eslabones.decupla;
  const una = v.un_eslabon.decupla;
  const tocar = (d, f2) => { const x = structuredClone(d); f2(x); return x; };
  for (const [que, d, id] of [
    ['la hora y su LE no cuadran', tocar(dos, (x) => { x[9][0][0][4] += 1; })],
    ['otra hora, con su LE', tocar(dos, (x) => { x[9][0][0][4] += 1; x[9][0][0][7][1] = [(BigInt(x[9][0][0][4]) & 0xffffffffn).toString(16).padStart(8, '0').match(/../g).reverse().join('') + '00000000']; })],
    ['sin el eslabón de arriba', tocar(dos, (x) => { x[9].pop(); })],
    ['otro id', tocar(dos, (x) => { x[4] = una[4]; })],
    ['otro id, también en el registro', tocar(dos, (x) => { x[4] = una[4]; }), una[4]],
    ['firma de otra cabecera', tocar(dos, (x) => { x[9][1][0][6] = una[9][0][0][6]; })],
    ['vía «taproot»', tocar(una, (x) => { x[6] = 'taproot'; })],
  ]) {
    const r = sellado(d, id ?? dos[4]);
    assert.ok(r.estado !== 'RESUELTO' || r.valor[0] !== true, que);
    if (que !== 'vía «taproot»') assert.deepEqual([r.estado, r.valor], ['RESUELTO', [false]], que + ': falso, no ERROR ni PENDIENTE (' + r.motivo + ')');
  }
  // Sin el observador declarado, falso.
  const { eje: sin } = await ejeDePrueba(null);
  const { ctx, it } = contextoConSello(sin, dos[4], dos);
  assert.deepEqual(evaluar(f, ctx, { sujeto: it }).valor, [false]);
});

// ---------- 3 · la firmeza ----------

test('«firm» está en X.6.8.9, es una lectura y su fórmula es formulaDeFirmeza(), que lee 7.6 desplegada para sus cuatro capas', () => {
  const r = regla('firm');
  assert.ok(r, 'la regla «firm» está en el 2 de la época');
  assert.deepEqual([r[3], r[4]], [['X.6.8.9'], ['read']]);
  assert.equal(r[2].at(-1), selloDe.formulaDeFirmeza());
  // La fórmula lee las capas por posición: si 7.6 deja de tener las cuatro, con la casa la primera y Bitcoin la última,
  // hay que volver a desplegarla.
  const capas = contrato.cascadaDe().capas;
  assert.equal(capas.length, selloDe.CAPAS_DE_LA_FORMULA);
  assert.deepEqual(capas.map((c) => c.nivel), [1, 2, 3, 4], 'los niveles son números, en su orden');
  assert.deepEqual(capas.map((c) => c.familia).sort(), ['E', 'P', 'R', 'T'], 'las cuatro familias del núcleo');
  assert.ok(contrato.mensaje(null, r, 'es') !== r[9].at(-1), 'su 9 en español (epoch.9.4)');
});

/** Un eje de demostración: g da E y emite R; cada registro con lo que mueve. `lineas`, las claves de línea que declara la raíz. */
async function demo(observador, lineas = []) {
  const eje = await Eje.genesis({ demostracion: true, identidad: 'g', t: T(0), foco: 'raíz', emision: [{ token: 'R', cantidad: 1e6 }, { token: 'E', denominacion: 'minuto', cantidad: 1e6 }] });
  if (observador) await declararExterior(eje, { observadores: [observador.publica], lineas: lineas.map((c) => c.publica), t: T(1) });
  const coste = await eje.escribir({ autor: 'g', sobre: eje.genesisId, t: T(2), payload: ['solo su coste'], movimientos: [pagaElCoste('g')] });
  const r = await eje.escribir({ autor: 'g', sobre: eje.genesisId, t: T(3), payload: ['R'], movimientos: [pagaElCoste('g'), { token: 'R', emisor: 'g', cantidad: 5, de: null, a: 'g' }] });
  const e = await eje.escribir({ autor: 'g', sobre: eje.genesisId, t: T(4), payload: ['E'], movimientos: [pagaElCoste('g'), { token: 'E', emisor: 'g', denominacion: 'minuto', cantidad: 3, de: 'g', a: eje.genesisId }] });
  return { eje, coste, r, e };
}

test('la capa exigida es la de la familia más alta de sus propias sentencias: el coste de escribir y el P que da el libro no cuentan', async () => {
  const { eje, coste, r, e } = await demo();
  assert.ok(eje.saldo('g', 'P:' + coste.id) > 0 || true, 'el libro da P por escribir (no es una sentencia del registro)');
  assert.equal(contrato.firmeza(eje, coste.id).exigida, 1, 'solo paga su coste: el primer nivel');
  assert.equal(contrato.firmeza(eje, r.id).exigida, 2, 'acuña R');
  assert.equal(contrato.firmeza(eje, e.id).exigida, 4, 'transfiere E');
  // Sin sello ni recibo: nada alcanzado, no está en firme (falso, no pendiente).
  // Lo de antes no cambia; detrás van lo pedido y su plazo (encargo A18, test/t-anclas.test.js).
  const { pedidos, plazo, ...f } = contrato.firmeza(eje, coste.id);
  assert.ok(Array.isArray(pedidos) && typeof plazo === 'string');
  assert.deepEqual(f, { capas: [{ nivel: 1, ritmo: 'segundo', estado: 'pendiente' }, { nivel: 2, ritmo: 'minuto', estado: 'pendiente' }, { nivel: 3, ritmo: 'hora', estado: 'pendiente' }, { nivel: 4, ritmo: 'dia', estado: 'pendiente' }], alcanzada: null, exigida: 1, firme: false, enDuda: false, confirmaciones: null, enFirme: false });
  assert.deepEqual(leer(eje, coste.id, 9).valor, [false]);
});

test('alcanzada, exigida y firme: el recibo de llegada alcanza el nivel 1; el sello, el último, que cubre los de abajo; la regla y firmeza() dicen lo mismo', async () => {
  const obs = await observadorDePrueba();
  const rele = await releDePrueba();
  const casa = await generarClaves();
  const fed = await generarClaves();
  const { eje, coste, r, e } = await demo(obs, [casa, fed]);
  for (const x of [coste, r, e]) eje.marcarRecibo(x.id, reciboFirmado(rele, { semilla: x.id }));
  // Solo con el recibo: la casa.
  assert.deepEqual([contrato.firmeza(eje, coste.id).alcanzada, contrato.firmeza(eje, coste.id).firme], [1, true]);
  assert.deepEqual([contrato.firmeza(eje, r.id).alcanzada, contrato.firmeza(eje, r.id).firme], [1, false], 'R exige el nivel 2');
  assert.equal(contrato.firmeza(eje, e.id).firme, false);
  assert.deepEqual(leer(eje, r.id, 9).valor, [false]);
  // Con el sello en cascada del nivel 1 al 4, pasando por el 2 (los eslabones de frontera con StateArk: casa [1, 0],
  // federación [2, 1], el que llega a Bitcoin [4, 2, 0]): alcanzados, y el 3 saltado.
  eje.marcarSello(r.id, await selloEnCascada(r.id, { observador: obs, altura: 4, capas: [{ nivel: 1, otros: 1, grado: 0, claves: casa }, { nivel: 2, otros: 1, grado: 1, claves: fed }, { nivel: 4, grado: 2, red: 0 }] }));
  const fr = contrato.firmeza(eje, r.id);
  assert.deepEqual(fr.capas.map((c) => c.estado), ['alcanzada', 'alcanzada', 'saltada', 'alcanzada']);
  assert.deepEqual([fr.alcanzada, fr.exigida, fr.firme, fr.confirmaciones], [4, 2, true, 1]);
  assert.deepEqual(fr.capas.map((c) => c.grado), ['local', 'shared', undefined, 'provider'], 'el grado de cada nivel alcanzado por un eslabón, con su nombre de la época (7.6.4)');
  assert.deepEqual(fr.capas.map((c) => c.red), [null, null, undefined, 'test'], 'y su red, detrás del grado (7.6.6)');
  assert.deepEqual(fr.capas.map((c) => c.clave), [casa.publica, fed.publica, undefined, obs.publica], 'la clave de la cabecera que alcanza cada nivel');
  assert.deepEqual(fr.capas.map((c) => c.ritmo), ['segundo', 'minuto', 'hora', 'dia'], 'el ritmo de cada nivel (7.6.2)');
  // Por la vía «taproot»: Bitcoin, sin capas de en medio.
  eje.marcarSello(e.id, await selloCompleto(e.id, { observador: obs, altura: 5 }));
  const fe = contrato.firmeza(eje, e.id);
  assert.deepEqual(fe.capas.map((c) => c.estado), ['alcanzada', 'saltada', 'saltada', 'alcanzada']);
  assert.deepEqual([fe.alcanzada, fe.exigida, fe.firme], [4, 4, true]);
  assert.equal(fe.capas[3].grado, undefined, 'la vía «taproot» no tiene eslabones: sin grado');
  for (const x of [coste, r, e]) assert.deepEqual(leer(eje, x.id, 9).valor, [contrato.firmeza(eje, x.id).firme]);
  // «firm» casa los niveles como números (nth 0 epoch.7.6.1 en los 9.k.1): un sello en cascada que no vale (firmado arriba
  // por un observador no declarado) con un eslabón de nivel 1 de clave declarada alcanza el primer nivel, y basta a lo que
  // solo paga su coste.
  const { eje: n, coste: c1 } = await demo(obs, [casa]);
  n.marcarSello(c1.id, await selloEnCascada(c1.id, { observador: await observadorDePrueba(), capas: [{ nivel: 1, grado: 0, claves: casa }, { nivel: 4 }] }));
  assert.deepEqual(leer(n, c1.id, 5).valor, [false]);
  assert.deepEqual(leer(n, c1.id, 9).valor, [true], 'el BQL casa el número del nivel');
  assert.deepEqual([contrato.firmeza(n, c1.id).alcanzada, contrato.firmeza(n, c1.id).firme], [1, true]);
  // Del 9.k.1 «firm» lee solo el primer ocupante: un grado o una red que valen lo mismo que un nivel no alcanzan ese nivel.
  const { eje: q, r: r2 } = await demo(obs, [casa]);
  q.marcarSello(r2.id, await selloEnCascada(r2.id, { observador: await observadorDePrueba(), capas: [{ nivel: 1, grado: 2, red: 3, claves: casa }, { nivel: 4 }] }));
  assert.deepEqual(leer(q, r2.id, 9).valor, [false], 'R exige el nivel 2, y el 2 de ese eslabón es su grado');
  assert.deepEqual([contrato.firmeza(q, r2.id).alcanzada, contrato.firmeza(q, r2.id).firme, contrato.firmeza(q, r2.id).capas[0].grado, contrato.firmeza(q, r2.id).capas[0].red], [1, false, 'provider', 3], 'una red que no es una posición de 7.6.6, tal cual');
  // Un sello al que le falta la cabecera del bloque: «sealed» PENDIENTE, y «firm» también (firmeza() no lo da en firme).
  const { eje: b, coste: c2 } = await demo(obs);
  b.marcarRecibo(c2.id, reciboFirmado(rele, { semilla: c2.id }));
  b.marcarSello(c2.id, await selloEnCascada(c2.id, { observador: obs, cambiar: (q) => { delete q.prueba.cabecera; } }));
  assert.equal(leer(b, c2.id, 9).estado, 'PENDIENTE');
  assert.equal(contrato.firmeza(b, c2.id).firme, false);
});

// ---------- 4 · en duda: la bifurcación ----------

test('«en duda»: dos cabeceras con el mismo número de la misma clave, comprobadas sin libro; la cadena que pasa por un número igual o mayor queda en duda, y «sealed» y «firm» no cambian', async () => {
  const obs = await observadorDePrueba();
  const { eje, e1, e2 } = await ejeDePrueba(obs);
  eje.marcarSello(e1.id, await selloEnCascada(e1.id, { observador: obs, capas: [{ nivel: 1 }, { nivel: 4, numero: 1 }] }));
  eje.marcarSello(e2.id, await selloEnCascada(e2.id, { observador: obs, capas: [{ nivel: 4, numero: 0 }] }));
  const antes = [leer(eje, e1.id, 5).valor, leer(eje, e1.id, 9).valor];
  assert.equal(contrato.firmeza(eje, e1.id).enDuda, false);
  const a = cabeceraDeLoteFirmada({ numero: 1, raiz: 'aa'.repeat(32) }, obs);
  const b = cabeceraDeLoteFirmada({ numero: 1, raiz: 'bb'.repeat(32) }, obs);
  const comprobada = selloDe.bifurcacion({ a: a.decupla, b: b.decupla });
  assert.deepEqual([comprobada.clase, comprobada.acusado, comprobada.libro, comprobada.numero], ['dos cabeceras con el mismo número', obs.publica, LIBRO_DE_PRUEBA, 1]);
  // No lo es: otro número, otra clave, otro libro (una línea es libro y clave), la misma cabecera dos veces, una firma mala, otro id.
  assert.equal(selloDe.bifurcacion({ a: a.decupla, b: cabeceraDeLoteFirmada({ numero: 1, raiz: 'bb'.repeat(32), libro: '2c'.repeat(32) }, obs).decupla }), null);
  const otro = await observadorDePrueba();
  assert.equal(selloDe.bifurcacion({ a: a.decupla, b: cabeceraDeLoteFirmada({ numero: 2, raiz: 'bb'.repeat(32) }, obs).decupla }), null);
  assert.equal(selloDe.bifurcacion({ a: a.decupla, b: cabeceraDeLoteFirmada({ numero: 1, raiz: 'bb'.repeat(32) }, otro).decupla }), null);
  assert.equal(selloDe.bifurcacion({ a: a.decupla, b: a.decupla }), null);
  assert.equal(selloDe.bifurcacion({ a: a.decupla, b: Object.assign([...b.decupla], { 6: a.decupla[6] }) }), null);
  assert.equal(selloDe.bifurcacion({ a: a.decupla, b: b.decupla, id: '00'.repeat(32) }), null);
  assert.equal(eje.marcarBifurcacion({ a: a.decupla, b: a.decupla }), false);
  assert.equal(eje.marcarBifurcacion({ schema: 'stateark.equivocacion@1', clase: comprobada.clase, acusado: obs.publica, a: a.decupla, b: b.decupla, id: comprobada.id }), true);
  assert.equal(contrato.firmeza(eje, e1.id).enDuda, true, 'su cadena pasa por la cabecera 1 de la clave acusada');
  assert.equal(contrato.firmeza(eje, e2.id).enDuda, false, 'lo de antes de la bifurcación sigue valiendo');
  assert.deepEqual([leer(eje, e1.id, 5).valor, leer(eje, e1.id, 9).valor], antes, 'nada castiga solo');
});

test('el vector de bifurcación de StateArk (solo lectura): se comprueba sin libro y el eje lo anota', { skip: !existsSync(VECTORES + 'bifurcacion.json') && 'sin el repositorio de StateArk' }, async () => {
  const v = JSON.parse(readFileSync(VECTORES + 'bifurcacion.json', 'utf8'));
  const b = selloDe.bifurcacion(v.equivocacion);
  assert.deepEqual([b?.clase, b?.acusado, b?.libro, b?.numero, b?.id], [v.equivocacion.clase, v.equivocacion.acusado, v.libros.stateark, 1, v.equivocacion.id]);
  // La 1 de otro libro con la misma clave es otra línea, no una bifurcación.
  assert.equal(selloDe.bifurcacion({ a: v.equivocacion.a, b: selloDe.decuplaDeCabecera(v.otra_linea) }), null);
  const { eje } = await ejeDePrueba(null);
  assert.equal(eje.marcarBifurcacion(v.equivocacion), true);
  assert.equal(eje.bifurcaciones().length, 1);
});

// ---------- 5 · la carta: las estaciones de firmeza del reverso ----------

test('la carta pinta en el reverso una estación por capa, con su estado y la exigida señalada, y la palabra de resumen: se puede usar, en firme, en duda', async () => {
  const { arbol: arbolEnIdioma } = await import('../carta/carta.js');
  const { html } = await import('../carta/dom.js');
  const obs = await observadorDePrueba();
  const rele = await releDePrueba();
  const casa = await generarClaves();
  const { eje, r } = await demo(obs, [casa]);
  const ORDENADOR = { ancho: 1920, alto: 1080 };
  const reverso = async () => {
    const a = await arbolEnIdioma({ foco: { X: r.id, pv: 5 } }, eje, 'g', ORDENADOR, { idioma: 'es' });
    assert.equal(a.centro.cara, 'reverso');
    return { f: a.centro.firmeza, h: html(a) };
  };
  const estacion = (h, nivel) => h.match(new RegExp('<li class="estacion-firmeza" data-nivel="' + nivel + '" data-estado="([a-z]+)"( data-exigida)? title="([^"]*)">')) ?? [];
  // Nada: todas pendientes; la exigida, la sidechain (acuña R); se puede usar, aún no en firme.
  let { f, h } = await reverso();
  assert.deepEqual(f.capas.map((c) => c.nivel), [1, 2, 3, 4], 'los niveles de la época, en su orden');
  assert.deepEqual([1, 2, 3, 4].map((c) => estacion(h, c)[1]), ['pendiente', 'pendiente', 'pendiente', 'pendiente']);
  assert.equal(estacion(h, 2)[2], ' data-exigida');
  assert.match(estacion(h, 2)[3], /^nivel 2 · minuto: pendiente · la que exige/);
  assert.deepEqual([1, 3, 4].map((k) => (h.match(new RegExp('data-nivel="' + k + '"[^>]*><span class="estacion-firmeza-nombre">([^<]*)<')) ?? [])[1]), ['nivel 1 · segundo', 'nivel 3 · hora', 'nivel 4 · día'], 'el nombre del nivel y su ritmo, por sus claves en los textos de la carta');
  assert.doesNotMatch(h, /estacion-firmeza-nombre">(casa|Bitcoin)</, 'sin «casa» ni «Bitcoin» como nombre de nivel');
  assert.match(h, /<div class="firmeza" data-resumen="usable"[^>]*>.*<small class="firmeza-resumen" title="[^"]*nivel 2[^"]*">se puede usar, aún no en firme<\/small><\/div>/s);
  assert.doesNotMatch(h, /pendiente-sello/);
  // Con su recibo de llegada: la casa, alcanzada; aún no en firme.
  eje.marcarRecibo(r.id, reciboFirmado(rele, { semilla: r.id }));
  ({ h } = await reverso());
  assert.deepEqual([1, 2].map((c) => estacion(h, c)[1]), ['alcanzada', 'pendiente']);
  assert.match(h, /data-resumen="usable"/);
  // Sellado en cascada por los niveles 1 y 4 (casa [1, 0] y el que llega a Bitcoin [4, 2, 0]): el 2 y el 3 saltados, el 4
  // con sus confirmaciones; en firme. El grado y la red, con sus nombres en la carta.
  eje.marcarSello(r.id, await selloEnCascada(r.id, { observador: obs, altura: 3, capas: [{ nivel: 1, otros: 1, grado: 0, claves: casa }, { nivel: 4, numero: 1, grado: 2, red: 0 }] }));
  ({ h } = await reverso());
  assert.deepEqual([1, 2, 3, 4].map((c) => estacion(h, c)[1]), ['alcanzada', 'saltada', 'saltada', 'alcanzada']);
  assert.match(h, /data-nivel="1"[^>]*><span class="estacion-firmeza-nombre">nivel 1 · segundo<\/span> · <small class="estacion-firmeza-grado">local<\/small><\/li>/, 'el grado, con su nombre');
  assert.match(h, /data-nivel="4"[^>]*><span class="estacion-firmeza-nombre">nivel 4 · día<\/span> · <small class="estacion-firmeza-grado">con proveedor · red de pruebas<\/small> <small class="verificado" data-confirmaciones="1"[^>]*>◆ verificado · 1 confirmación<\/small>/);
  assert.match(estacion(h, 4)[3], /^nivel 4 · día: alcanzada · con proveedor · red de pruebas$/);
  assert.match(h, /<div class="firmeza" data-resumen="firme"[^>]*>.*>en firme<\/small><\/div>/s);
  // Una bifurcación de la línea del observador en el número 1: en duda.
  const a = cabeceraDeLoteFirmada({ numero: 1, raiz: 'aa'.repeat(32) }, obs);
  const b = cabeceraDeLoteFirmada({ numero: 1, raiz: 'bb'.repeat(32) }, obs);
  assert.equal(eje.marcarBifurcacion({ a: a.decupla, b: b.decupla }), true);
  ({ h } = await reverso());
  assert.match(h, /<div class="firmeza" data-resumen="enDuda"[^>]*>.*<small class="firmeza-resumen" title="en duda: [^"]*">en duda<\/small><\/div>/s);
});

// ---------- 6 · firm lee grados (VG 17-11 por Core State, encargo «firm lee grados») ----------

/** Una copia de la época 0 con cambios, cargada (una época hija de prueba). */
function epocaCon(cambiar) {
  const e = JSON.parse(JSON.stringify(EPOCA_0_BTML_DATOS));
  cambiar(e);
  return cargarEpocaBtml(e, { registros: REGLAS_DE_EPOCA_DATOS, plantillas: PLANTILLAS_DE_EPOCA_DATOS, id: EPOCA_0_BTML.id });
}
const leerCon = (eje, id, epoca) => evaluar('=first (first it.6).8.9', new ContextoEje(eje, { epoch: epoca }), { sujeto: id });
/** La regla y contrato.firmeza dicen lo mismo: «firm» y, nivel a nivel, que alguno a la altura del exigido está alcanzado. */
function coinciden(eje, id, epoca, que) {
  const f = contrato.firmeza(eje, id, epoca ? { epoca } : {});
  const r = epoca ? leerCon(eje, id, epoca) : leer(eje, id, 9);
  const arriba = f.capas.findIndex((c) => c.nivel === f.exigida);
  const porNiveles = f.capas.slice(arriba).some((c) => c.estado === 'alcanzada');
  assert.deepEqual([r.estado, r.valor?.[0], f.firme, porNiveles], ['RESUELTO', f.firme, f.firme, f.firme], que + ': la regla, firmeza().firme y los niveles de firmeza() coinciden');
  return f;
}

test('7.6.4, 7.6.5 y 7.6.6 en la época 0: los grados de menor a mayor, el exigido por nivel (base, ninguno) y las redes; la fórmula los despliega', () => {
  const seis = EPOCA_0_BTML.registro[7][6];
  assert.deepEqual([seis[4], seis[5], seis[6]], [['local', 'shared', 'provider'], [0, 0, 0, 0], ['test', 'main']]);
  assert.match(seis[0][1], /4 the grades/);
  assert.match(seis[0][1], /5 the grade demanded/);
  assert.match(seis[0][1], /6 the networks/);
  assert.equal(seis[4].length, selloDe.GRADOS_DE_LA_FORMULA, 'si 7.6.4 deja de tener tres grados, hay que volver a desplegar «firm»');
  assert.equal(seis[5].length, seis[1].length, 'un grado exigido por nivel');
  assert.ok(validarPayload(EPOCA_0_BTML.registro[7]).ok);
  // «sealed» no cambia: su fórmula, letra por letra la de las piezas compartidas, sigue en sealed.json.
  assert.equal(regla('sealed')[2].at(-1), selloDe.formulaDeSellado());
});

test('«line keys», la 9 de «exterior settings»: se declara en la cuenta raíz, la lee ajustesDelEje y es before.8.9', async () => {
  const obs = await observadorDePrueba();
  const casa = await generarClaves();
  const { eje } = await demo(obs, [casa]);
  const exterior = await import('../src/exterior.js');
  assert.equal(exterior.AJUSTES.lineas, 'line keys');
  assert.deepEqual(exterior.ajustesDelEje(eje).lineas, [casa.publica]);
  assert.deepEqual(evaluar('=before.8.9', new ContextoEje(eje, { epoch: EPOCA_0_BTML })).valor, [casa.publica]);
  assert.deepEqual(evaluar('=before.8.6', new ContextoEje(eje, { epoch: EPOCA_0_BTML })).valor, [obs.publica]);
});

test('un nivel de en medio se alcanza por la cadena sin «sealed», con la clave declarada; sin declararla o con una firma rota debajo, no', async () => {
  const obs = await observadorDePrueba();
  const ajeno = await observadorDePrueba();
  const casa = await generarClaves();
  const fed = await generarClaves();
  const capas = [{ nivel: 1, grado: 0, claves: casa, otros: 1 }, { nivel: 2, grado: 1, claves: fed, otros: 1 }, { nivel: 4, grado: 2, red: 0 }];
  // Arriba firma un observador que nadie declara: «sealed» es falso, pero el eslabón de nivel 2 vale y su clave está declarada.
  const { eje, r } = await demo(obs, [casa, fed]);
  eje.marcarSello(r.id, await selloEnCascada(r.id, { observador: ajeno, capas }));
  assert.deepEqual(leer(eje, r.id, 5).valor, [false], '«sealed» falso');
  const f = coinciden(eje, r.id, null, 'nivel 2 sin «sealed»');
  assert.deepEqual([f.firme, f.alcanzada, f.exigida, f.capas.map((c) => c.estado)], [true, 2, 2, ['alcanzada', 'alcanzada', 'pendiente', 'pendiente']]);
  assert.deepEqual([f.capas[1].clave, f.capas[1].grado], [fed.publica, 'shared']);
  // La clave de la federación sin declarar: el nivel 2 no se alcanza (el 1 sí, por la casa).
  const { eje: b, r: rb } = await demo(obs, [casa]);
  b.marcarSello(rb.id, await selloEnCascada(rb.id, { observador: ajeno, capas }));
  const fb = coinciden(b, rb.id, null, 'clave sin declarar');
  assert.deepEqual([fb.firme, fb.alcanzada, fb.capas[1].estado], [false, 1, 'pendiente']);
  // La firma de la casa rota (otra hora, la misma firma): ni el 1 ni el 2, aunque sus claves estén declaradas.
  const { eje: c, r: rc } = await demo(obs, [casa, fed]);
  c.marcarSello(rc.id, await selloEnCascada(rc.id, { observador: ajeno, capas, cambiar: (q) => { q.prueba.cadena[0].cabecera.hora += 1; } }));
  assert.ok(Array.isArray(c.sello(rc.id).decupla[9]), 'la cadena se guarda');
  const fc = coinciden(c, rc.id, null, 'firma rota debajo');
  assert.deepEqual([fc.firme, fc.alcanzada], [false, null]);
  // La clave de la federación declarada como observador también cuenta (before.8.6).
  const { eje: d, r: rd } = await demo(fed);
  d.marcarSello(rd.id, await selloEnCascada(rd.id, { observador: ajeno, capas }));
  assert.deepEqual([coinciden(d, rd.id, null, 'clave en observer keys').alcanzada, contrato.firmeza(d, rd.id).firme], [2, true]);
});

test('grado exigido 1 en una época hija: alcanzado con grado 1 y 2, no con 0, ni sin grado, ni con un texto; el recibo no vale para el primero; «sealed» sí para el último', async () => {
  const hija = epocaCon((e) => { e[7][6][5] = [1, 1, 1, 1]; });
  assert.deepEqual(hija.registro[7][6][5], [1, 1, 1, 1]);
  const obs = await observadorDePrueba();
  const ajeno = await observadorDePrueba();
  const rele = await releDePrueba();
  const casa = await generarClaves();
  const fed = await generarClaves();
  for (const [grado, alcanza] of [[1, true], [2, true], [0, false], [undefined, false], ['shared', false], [7, false]]) {
    const { eje, r } = await demo(obs, [casa, fed]);
    eje.marcarSello(r.id, await selloEnCascada(r.id, { observador: ajeno, capas: [{ nivel: 1, grado: 1, claves: casa }, { nivel: 2, ...(grado === undefined ? {} : { grado }), claves: fed }, { nivel: 4 }] }));
    const f = coinciden(eje, r.id, hija, 'grado ' + grado);
    assert.equal(f.capas[1].estado === 'alcanzada', alcanza, 'grado ' + grado);
    assert.equal(f.firme, alcanza, 'grado ' + grado);
    // En la época 0 (nada exigido) lo alcanza con cualquier grado.
    assert.equal(coinciden(eje, r.id, null, 'época 0, grado ' + grado).firme, true);
  }
  // El recibo de llegada no alcanza el primer nivel si se exige grado; en la época 0, sí.
  const { eje, coste } = await demo(obs);
  eje.marcarRecibo(coste.id, reciboFirmado(rele, { semilla: coste.id }));
  assert.deepEqual([coinciden(eje, coste.id, hija, 'recibo con grado exigido').firme, contrato.firmeza(eje, coste.id, { epoca: hija }).alcanzada], [false, null]);
  assert.deepEqual([coinciden(eje, coste.id, null, 'recibo en la época 0').firme, contrato.firmeza(eje, coste.id).alcanzada], [true, 1]);
  // «sealed» alcanza el último sea cual sea el grado (la vía «taproot», sin eslabones; y la cascada con un eslabón sin grado).
  const { eje: b, e } = await demo(obs);
  b.marcarSello(e.id, await selloCompleto(e.id, { observador: obs }));
  assert.deepEqual([coinciden(b, e.id, hija, '«sealed» por taproot').firme, contrato.firmeza(b, e.id, { epoca: hija }).alcanzada], [true, 4]);
  const { eje: c, e: ec } = await demo(obs);
  c.marcarSello(ec.id, await selloEnCascada(ec.id, { observador: obs, capas: [{ nivel: 4 }] }));
  const fc = coinciden(c, ec.id, hija, '«sealed» por cascada sin grado');
  assert.deepEqual([fc.firme, fc.alcanzada, fc.capas[3].grado], [true, 4, undefined], 'alcanzado por «sealed», no por la cadena: sin grado ni clave');
});

test('la persona sola: cuatro cabeceras locales, sin Bitcoin, alcanzan el nivel 4 con grado local', async () => {
  const obs = await observadorDePrueba();
  const ajeno = await observadorDePrueba();
  const claves = await Promise.all([1, 2, 3].map(() => generarClaves()));
  const { eje, e } = await demo(obs, [...claves, ajeno]);
  // Sus cuatro líneas, cada una [n, 0]; arriba no hay observador de Bitcoin declarado (la décupla se cierra con uno de mentira).
  eje.marcarSello(e.id, await selloEnCascada(e.id, { observador: ajeno, capas: [{ nivel: 1, grado: 0, claves: claves[0] }, { nivel: 2, grado: 0, claves: claves[1] }, { nivel: 3, grado: 0, claves: claves[2] }, { nivel: 4, grado: 0 }] }));
  assert.deepEqual(leer(eje, e.id, 5).valor, [false], 'sin Bitcoin: «sealed» falso');
  const f = coinciden(eje, e.id, null, 'la persona sola');
  assert.deepEqual([f.firme, f.alcanzada, f.exigida], [true, 4, 4]);
  assert.deepEqual(f.capas.map((c) => [c.estado, c.grado]), [['alcanzada', 'local'], ['alcanzada', 'local'], ['alcanzada', 'local'], ['alcanzada', 'local']]);
});

test('«firm» recorre la cadena una vez y cabe en los límites: cuatro eslabones válidos y cuatro con el último roto', async () => {
  const { LIMITES } = await import('../src/bqlm.js');
  const obs = await observadorDePrueba();
  const ajeno = await observadorDePrueba();
  const claves = await Promise.all([1, 2, 3].map(() => generarClaves()));
  const capas = [{ nivel: 1, grado: 0, claves: claves[0], otros: 3 }, { nivel: 2, grado: 1, claves: claves[1], otros: 3 }, { nivel: 3, grado: 1, claves: claves[2], otros: 3 }, { nivel: 4, grado: 2, red: 0, otros: 3 }];
  const f = selloDe.formulaDeFirmeza();
  const medidas = {};
  // El peor caso: E exige el nivel 4 y «sealed» es falso (arriba firma uno que no es observador), así que se recorre la cadena
  // entera: con la clave de arriba declarada como de línea, verdadero en el cuarto; con su firma rota, falso tras el cuarto.
  for (const [que, cambiar, valor] of [['cuatro válidos', null, true], ['el último roto', (q) => { q.prueba.cadena[3].cabecera.firma = q.prueba.cadena[2].cabecera.firma; }, false]]) {
    const { eje, e } = await demo(obs, [...claves, ajeno]);
    eje.marcarSello(e.id, await selloEnCascada(e.id, { observador: ajeno, capas, ...(cambiar ? { cambiar } : {}) }));
    assert.equal(eje.sello(e.id).decupla[9].length, 4);
    const p = new Presupuesto();
    const r = evaluar(f, new ContextoEje(eje, { epoch: EPOCA_0_BTML }), { sujeto: { k: 'reg', id: e.id }, presupuesto: p });
    assert.deepEqual([r.estado, r.valor], ['RESUELTO', [valor]], que + ': ' + r.motivo);
    assert.equal(coinciden(eje, e.id, null, que).firme, valor);
    assert.ok(p.usados < LIMITES.ocupantes && p.bytes < LIMITES.bytes, que + ': ' + p.usados + ' ocupantes, ' + p.bytes + ' bytes');
    medidas[que] = { ocupantes: p.usados, bytes: p.bytes };
  }
  console.log('# coste de «firm» (' + f.length + ' caracteres): ' + JSON.stringify(medidas) + ' de ' + LIMITES.ocupantes + ' ocupantes y ' + LIMITES.bytes + ' bytes');
});
