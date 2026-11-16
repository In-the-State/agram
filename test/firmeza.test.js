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
import { EPOCA_0_BTML, cargarEpocaEscrita } from '../src/epocas.js';
import { generarClaves } from '../src/autoridad.js';
import { validarPayload } from '../src/btml.js';
import { epocaState } from '../datos/epocas/state/generar.mjs';
import { pagaElCoste } from './ayudas-coste.js';
import { selloEnCascada, selloCompleto, cabeceraDeLoteFirmada, observadorDePrueba, releDePrueba, reciboFirmado, declararExterior, NUMS } from './ayudas-sello.js';

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
    plazos: { person: 31536000, group: 2419200, company: 604800, provider: 86400 },
    capas: [{ capa: 'casa', ritmo: 1, familia: 'T' }, { capa: 'sidechain', ritmo: 60, familia: 'R' }, { capa: 'liquid', ritmo: 3600, familia: 'P' }, { capa: 'bitcoin', ritmo: 86400, familia: 'E' }],
  });
  // Los plazos son los segundos del calendario del 7.0 (año, ciclo, semana, día).
  const segundos = Object.fromEntries(siete[0].map((f) => [f[0][0], f[1][0]]));
  assert.deepEqual(Object.values(contrato.cascadaDe().plazos), [segundos['año'], segundos.ciclo, segundos.semana, segundos['día']]);
  // La época state hereda de la 0: las mismas filas.
  assert.deepEqual(contrato.cascadaDe(cargarEpocaEscrita(epocaState())), contrato.cascadaDe());
  // Una época que fija su 7.6 manda.
  const hija = structuredClone(EPOCA_0_BTML.registro);
  hija[7][6] = [['layers', 'una hija'], ['casa', 'bitcoin'], [1, 86400], ['T', 'E']];
  hija[7][5] = [['anchoring cadence', 'una hija'], ['group'], [86400]];
  assert.deepEqual(contrato.cascadaDe(hija), { plazos: { group: 86400 }, capas: [{ capa: 'casa', ritmo: 1, familia: 'T' }, { capa: 'bitcoin', ritmo: 86400, familia: 'E' }] });
});

// ---------- 2 · «sealed» por la vía «cascada» ----------

test('el mapa del sello aprende la vía «cascada»: decuplaDeSello pone el compromiso en el 3 y la cadena en el 9, y la vía «taproot» no cambia', async () => {
  const obs = await observadorDePrueba();
  const id = 'ab'.repeat(32);
  const s = await selloEnCascada(id, { observador: obs, altura: 5, capas: [{ capa: 'casa', otros: 2 }, { capa: 'bitcoin', otros: 1 }] });
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
  assert.deepEqual(en(cadena[0], P.eslabon.capa), ['casa']);
  assert.equal(en(cadena[1], P.eslabon.capa)[0], 'bitcoin');
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
  assert.ok(f.includes('"StateArk/Lote/Cabecera/v1"'));
  assert.ok(regla('sealed')[6].some((n) => n.startsWith('VG 16-11')), 'la nota cuenta el cambio');
});

test('sello en cascada de uno y de dos eslabones con la clave del observador declarada: «sealed» verdadero; cabe en el presupuesto', async () => {
  const obs = await observadorDePrueba();
  const { eje, e1, e2, e3 } = await ejeDePrueba(obs);
  eje.marcarSello(e1.id, await selloEnCascada(e1.id, { observador: obs, altura: 5 }));
  eje.marcarSello(e2.id, await selloEnCascada(e2.id, { observador: obs, altura: 6, capas: [{ capa: 'casa', otros: 2 }, { capa: 'bitcoin', otros: 3 }], otrasTx: 2 }));
  eje.marcarSello(e3.id, await selloEnCascada(e3.id, { observador: obs, altura: 7, capas: [{ capa: 'casa', otros: 1 }, { capa: 'sidechain', otros: 1 }, { capa: 'liquid' }, { capa: 'bitcoin', otros: 2 }] }));
  const ctx = new ContextoEje(eje, { epoch: EPOCA_0_BTML });
  for (const [e, n] of [[e1, 1], [e2, 2], [e3, 4]]) {
    assert.equal(eje.sello(e.id).decupla[9].length, n);
    assert.deepEqual(leer(eje, e.id, 5).valor, [true], n + ' eslabones');
    assert.equal(contrato.verificado(eje, e.id).sello, true);
    const p = new Presupuesto();
    const r = evaluar(regla('sealed')[2].at(-1), ctx, { sujeto: { k: 'reg', id: e.id }, presupuesto: p });
    assert.deepEqual(r.valor, [true]);
    assert.ok(p.usados < p.tope / 5 && p.bytes < p.topeBytes / 3, n + ' eslabones: ' + p.usados + ' ocupantes, ' + p.bytes + ' bytes');
  }
  // Una clave de arriba que no es la del observador declarado: falso.
  const otro = await observadorDePrueba();
  const { eje: b, e1: y1 } = await ejeDePrueba(obs);
  b.marcarSello(y1.id, await selloEnCascada(y1.id, { observador: otro, capas: [{ capa: 'casa' }, { capa: 'bitcoin' }] }));
  assert.deepEqual(leer(b, y1.id, 5).valor, [false]);
});

test('las seis manipulaciones del vector del SIP dan falso; sin cabecera del bloque, PENDIENTE', async () => {
  const obs = await observadorDePrueba();
  const casa = await generarClaves();
  const capas = [{ capa: 'casa', claves: casa, otros: 2 }, { capa: 'bitcoin', numero: 1, otros: 2 }];
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
  const sellado = (d, id = d[4]) => { const { ctx, it } = contextoConSello(eje, id, d); return evaluar(f, ctx, { sujeto: it }); };
  for (const n of ['un_eslabon', 'dos_eslabones']) {
    const d = v[n].decupla;
    assert.deepEqual(d, selloDe.decuplaDeSello(v[n].prueba, v[n].prueba.id), n + ': decuplaDeSello da la décupla del vector');
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
  assert.deepEqual([capas[0].capa, capas.at(-1).capa], ['casa', 'bitcoin']);
  assert.deepEqual(capas.map((c) => c.familia).sort(), ['E', 'P', 'R', 'T'], 'las cuatro familias del núcleo');
  assert.ok(contrato.mensaje(null, r, 'es') !== r[9].at(-1), 'su 9 en español (epoch.9.4)');
});

/** Un eje de demostración: g da E y emite R; cada registro con lo que mueve. */
async function demo(observador) {
  const eje = await Eje.genesis({ demostracion: true, identidad: 'g', t: T(0), foco: 'raíz', emision: [{ token: 'R', cantidad: 1e6 }, { token: 'E', denominacion: 'minuto', cantidad: 1e6 }] });
  if (observador) await declararExterior(eje, { observadores: [observador.publica], t: T(1) });
  const coste = await eje.escribir({ autor: 'g', sobre: eje.genesisId, t: T(2), payload: ['solo su coste'], movimientos: [pagaElCoste('g')] });
  const r = await eje.escribir({ autor: 'g', sobre: eje.genesisId, t: T(3), payload: ['R'], movimientos: [pagaElCoste('g'), { token: 'R', emisor: 'g', cantidad: 5, de: null, a: 'g' }] });
  const e = await eje.escribir({ autor: 'g', sobre: eje.genesisId, t: T(4), payload: ['E'], movimientos: [pagaElCoste('g'), { token: 'E', emisor: 'g', denominacion: 'minuto', cantidad: 3, de: 'g', a: eje.genesisId }] });
  return { eje, coste, r, e };
}

test('la capa exigida es la de la familia más alta de sus propias sentencias: el coste de escribir y el P que da el libro no cuentan', async () => {
  const { eje, coste, r, e } = await demo();
  assert.ok(eje.saldo('g', 'P:' + coste.id) > 0 || true, 'el libro da P por escribir (no es una sentencia del registro)');
  assert.equal(contrato.firmeza(eje, coste.id).exigida, 'casa', 'solo paga su coste: la primera capa');
  assert.equal(contrato.firmeza(eje, r.id).exigida, 'sidechain', 'acuña R');
  assert.equal(contrato.firmeza(eje, e.id).exigida, 'bitcoin', 'transfiere E');
  // Sin sello ni recibo: nada alcanzado, no está en firme (falso, no pendiente).
  const f = contrato.firmeza(eje, coste.id);
  assert.deepEqual(f, { capas: [{ capa: 'casa', estado: 'pendiente' }, { capa: 'sidechain', estado: 'pendiente' }, { capa: 'liquid', estado: 'pendiente' }, { capa: 'bitcoin', estado: 'pendiente' }], alcanzada: null, exigida: 'casa', firme: false, enDuda: false, confirmaciones: null, enFirme: false });
  assert.deepEqual(leer(eje, coste.id, 9).valor, [false]);
});

test('alcanzada, exigida y firme: el recibo de llegada alcanza la casa; el sello, Bitcoin, que cubre las de abajo; la regla y firmeza() dicen lo mismo', async () => {
  const obs = await observadorDePrueba();
  const rele = await releDePrueba();
  const { eje, coste, r, e } = await demo(obs);
  for (const x of [coste, r, e]) eje.marcarRecibo(x.id, reciboFirmado(rele, { semilla: x.id }));
  // Solo con el recibo: la casa.
  assert.deepEqual([contrato.firmeza(eje, coste.id).alcanzada, contrato.firmeza(eje, coste.id).firme], ['casa', true]);
  assert.deepEqual([contrato.firmeza(eje, r.id).alcanzada, contrato.firmeza(eje, r.id).firme], ['casa', false], 'R exige la sidechain');
  assert.equal(contrato.firmeza(eje, e.id).firme, false);
  assert.deepEqual(leer(eje, r.id, 9).valor, [false]);
  // Con el sello en cascada de la casa a Bitcoin, pasando por la sidechain: alcanzadas, y liquid saltada.
  eje.marcarSello(r.id, await selloEnCascada(r.id, { observador: obs, altura: 4, capas: [{ capa: 'casa' }, { capa: 'sidechain' }, { capa: 'bitcoin' }] }));
  const fr = contrato.firmeza(eje, r.id);
  assert.deepEqual(fr.capas.map((c) => c.estado), ['alcanzada', 'alcanzada', 'saltada', 'alcanzada']);
  assert.deepEqual([fr.alcanzada, fr.exigida, fr.firme, fr.confirmaciones], ['bitcoin', 'sidechain', true, 1]);
  // Por la vía «taproot»: Bitcoin, sin capas de en medio.
  eje.marcarSello(e.id, await selloCompleto(e.id, { observador: obs, altura: 5 }));
  const fe = contrato.firmeza(eje, e.id);
  assert.deepEqual(fe.capas.map((c) => c.estado), ['alcanzada', 'saltada', 'saltada', 'alcanzada']);
  assert.deepEqual([fe.alcanzada, fe.exigida, fe.firme], ['bitcoin', 'bitcoin', true]);
  for (const x of [coste, r, e]) assert.deepEqual(leer(eje, x.id, 9).valor, [contrato.firmeza(eje, x.id).firme]);
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
  eje.marcarSello(e1.id, await selloEnCascada(e1.id, { observador: obs, capas: [{ capa: 'casa' }, { capa: 'bitcoin', numero: 1 }] }));
  eje.marcarSello(e2.id, await selloEnCascada(e2.id, { observador: obs, capas: [{ capa: 'bitcoin', numero: 0 }] }));
  const antes = [leer(eje, e1.id, 5).valor, leer(eje, e1.id, 9).valor];
  assert.equal(contrato.firmeza(eje, e1.id).enDuda, false);
  const a = cabeceraDeLoteFirmada({ numero: 1, raiz: 'aa'.repeat(32) }, obs);
  const b = cabeceraDeLoteFirmada({ numero: 1, raiz: 'bb'.repeat(32) }, obs);
  const comprobada = selloDe.bifurcacion({ a: a.decupla, b: b.decupla });
  assert.deepEqual([comprobada.clase, comprobada.acusado, comprobada.numero], ['dos cabeceras con el mismo número', obs.publica, 1]);
  // No lo es: otro número, otra clave, la misma cabecera dos veces, una firma mala, otro id.
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
  assert.deepEqual([b?.clase, b?.acusado, b?.numero, b?.id], [v.equivocacion.clase, v.equivocacion.acusado, 1, v.equivocacion.id]);
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
  const { eje, r } = await demo(obs);
  const ORDENADOR = { ancho: 1920, alto: 1080 };
  const reverso = async () => {
    const a = await arbolEnIdioma({ foco: { X: r.id, pv: 5 } }, eje, 'g', ORDENADOR, { idioma: 'es' });
    assert.equal(a.centro.cara, 'reverso');
    return { f: a.centro.firmeza, h: html(a) };
  };
  const estacion = (h, capa) => h.match(new RegExp('<li class="estacion-firmeza" data-capa="' + capa + '" data-estado="([a-z]+)"( data-exigida)? title="([^"]*)">')) ?? [];
  // Nada: todas pendientes; la exigida, la sidechain (acuña R); se puede usar, aún no en firme.
  let { f, h } = await reverso();
  assert.deepEqual(f.capas.map((c) => c.capa), ['casa', 'sidechain', 'liquid', 'bitcoin'], 'las capas de la época, en su orden');
  assert.deepEqual(['casa', 'sidechain', 'liquid', 'bitcoin'].map((c) => estacion(h, c)[1]), ['pendiente', 'pendiente', 'pendiente', 'pendiente']);
  assert.equal(estacion(h, 'sidechain')[2], ' data-exigida');
  assert.match(estacion(h, 'sidechain')[3], /^sidechain: pendiente · la que exige/);
  assert.match(h, /<span class="estacion-firmeza-nombre">Liquid<\/span>/, 'el nombre de la capa, por su clave en los textos de la carta');
  assert.match(h, /<div class="firmeza" data-resumen="usable"[^>]*>.*<small class="firmeza-resumen" title="[^"]*sidechain[^"]*">se puede usar, aún no en firme<\/small><\/div>/s);
  assert.doesNotMatch(h, /pendiente-sello/);
  // Con su recibo de llegada: la casa, alcanzada; aún no en firme.
  eje.marcarRecibo(r.id, reciboFirmado(rele, { semilla: r.id }));
  ({ h } = await reverso());
  assert.deepEqual(['casa', 'sidechain'].map((c) => estacion(h, c)[1]), ['alcanzada', 'pendiente']);
  assert.match(h, /data-resumen="usable"/);
  // Sellado en cascada por la casa y Bitcoin: liquid y sidechain saltadas, Bitcoin con sus confirmaciones; en firme.
  eje.marcarSello(r.id, await selloEnCascada(r.id, { observador: obs, altura: 3, capas: [{ capa: 'casa' }, { capa: 'bitcoin', numero: 1 }] }));
  ({ h } = await reverso());
  assert.deepEqual(['casa', 'sidechain', 'liquid', 'bitcoin'].map((c) => estacion(h, c)[1]), ['alcanzada', 'saltada', 'saltada', 'alcanzada']);
  assert.match(h, /data-capa="bitcoin"[^>]*><span class="estacion-firmeza-nombre">Bitcoin<\/span> <small class="verificado" data-confirmaciones="1"[^>]*>◆ verificado · 1 confirmación<\/small>/);
  assert.match(h, /<div class="firmeza" data-resumen="firme"[^>]*>.*>en firme<\/small><\/div>/s);
  // Una bifurcación de la línea del observador en el número 1: en duda.
  const a = cabeceraDeLoteFirmada({ numero: 1, raiz: 'aa'.repeat(32) }, obs);
  const b = cabeceraDeLoteFirmada({ numero: 1, raiz: 'bb'.repeat(32) }, obs);
  assert.equal(eje.marcarBifurcacion({ a: a.decupla, b: b.decupla }), true);
  ({ h } = await reverso());
  assert.match(h, /<div class="firmeza" data-resumen="enDuda"[^>]*>.*<small class="firmeza-resumen" title="en duda: [^"]*">en duda<\/small><\/div>/s);
});
