// El gobierno del cambio de reglas en la época 0 (encargo A21, tramo 2, paso 1; agram-equipo/DISENO_GOBIERNO_Y_MOTOR.md
// §3-§5; docs/notas/GOBIERNO.md): la fila 7.9 «governance», las seis plantillas (proponer, apoyar, retirar el apoyo, dar
// por aprobado, poner en vigor y retirar la propuesta), las lecturas «support of», «support», «missing support»,
// «approved», «change state» y «changes», y las reglas de validez. El motor (que la época del libro cambie al poner un
// cambio en vigor) es del encargo siguiente: aquí la época no cambia. Ejes locales en memoria, identidades inventadas y
// claves de prueba generadas en cada ejecución: nada real.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Eje } from '../src/eje.js';
import * as A from '../src/acciones.js';
import { evaluar, leerRegla } from '../src/bqlm.js';
import { ContextoEje } from '../src/contexto-eje.js';
import { EPOCA_0_BTML } from '../src/epocas.js';
import { generarClaves } from '../src/autoridad.js';
import { quemaDelCoste } from '../src/escritura.js';
import { formulaDePonerEnVigor, PLANTILLAS_DE_GOBIERNO, ANCLA_DE_PROPUESTAS } from '../datos/epocas/gobierno.mjs';
import { selloEnCascada } from '../ejemplos/ikisai/sellos.mjs';
import { declararExterior, observadorDePrueba } from './ayudas-sello.js';

const T0 = '2026-11-17T08:00:00Z';
const ID0 = EPOCA_0_BTML.id;
const M = { ref: ID0 };
const P = PLANTILLAS_DE_GOBIERNO;
// Las reglas que rechazan una transacción; cada una con su veredicto (su mensaje del 9), no por PENDIENTE ni por ERROR.
const reglas = (r) => {
  for (const m of r.motivos) assert.doesNotMatch(String(m.mensaje), /PENDIENTE|ERROR/, m.mensaje);
  return r.motivos.map((m) => m.regla);
};

/**
 * Un libro de ana (la dueña) con `invitados` (invitados por ana: cada uno recibe 1 R suya). Con `nombres`, `n3` o `n4`, la
 * época del libro es una hija de prueba de la 0, escrita en su génesis, que fija 7.9.5 (quién cuenta), 7.9.3 y 7.9.4 (los
 * niveles de firmeza que piden un cambio corriente y uno de gobierno) y hereda lo demás; sin ellos, la 0.
 */
async function mundo({ nombres, n3, n4, invitados = ['bea'] } = {}) {
  const hija = nombres !== undefined || n3 !== undefined || n4 !== undefined;
  const raiz = [['gobierno de prueba'], M, M, M, M, M, [['una hija de prueba de la 0 (test/gobierno.test.js)'], ['hereda'], [ID0]], [M, M, M, M, M, M, M, M, M, [M, M, M, [n3 ?? 3], [n4 ?? 4], nombres ?? [0]]]];
  const eje = await Eje.genesis({ identidad: 'ana', foco: ['ana'], t: T0, demostracion: true, ...(hija ? { epoca: { raiz, registros: [] } } : {}) });
  let s = 0;
  const reloj = () => new Date(Date.parse(T0) + (++s) * 1000).toISOString().replace('.000Z', 'Z');
  for (const n of invitados) {
    const inv = await eje.invitar({ autor: 'ana', invitado: n, t: reloj() });
    await eje.aceptar(inv, {}, { t: reloj() });
  }
  const intenta = (cual, params, yo) => A.transaccion(eje, cual, params, yo, { t: reloj() });
  const lanza = async (cual, params, yo) => {
    const r = await intenta(cual, params, yo);
    assert.equal(r.ok, true, cual + ' de ' + yo + ': ' + JSON.stringify(r.motivos));
    return eje.anadir(r.evento);
  };
  const ctx = () => new ContextoEje(eje, { epoch: eje.epoca() });
  const lee = (expr, sujeto) => {
    const r = evaluar(expr, ctx(), { sujeto });
    assert.equal(r.estado, 'RESUELTO', expr + ': ' + r.motivo);
    return r.valor.length === 1 ? r.valor[0] : r.valor;
  };
  const cambio = (titulo = 'más margen') => [[titulo], M, M, M, M, M, [['un cambio de prueba'], ['hereda'], [eje.epoca().id]], [M, M, M, [[900], [7200]]]];
  const propone = (yo = 'ana', clase = 'ordinary', titulo = 'más margen') => lanza(P.proponer, { X: eje.genesisId, title: titulo, explanation: 'el margen del reloj del libro, de 10 a 15 minutos', change: cambio(titulo), class: clase }, yo);
  // Las lecturas de una propuesta: apoyo (X.2.6), lo que falta (X.2.7), aprobada (X.2.8) y el registro de su estado (X.2.9).
  const estado = (p) => ({ apoyo: lee('=first (first it.2).6', p.id), falta: lee('=first (first it.2).7', p.id), aprobada: lee('=first (first it.2).8', p.id) });
  const decidio = (p) => A.plantillasDeTransaccion().length && evaluar('=first (payload(first (first it.2).9)).4', ctx(), { sujeto: p.id }).valor[0];
  const apoyoDe = (p, quien) => lee('=sum (((first it.2).4 where first it2.3 = "' + quien + '") each 7)', p.id);
  return { eje, reloj, intenta, lanza, lee, ctx, cambio, propone, estado, decidio, apoyoDe };
}

const casi = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, a + ' ≠ ' + b);

test('gobierno: la fila 7.9 «governance», el suelo y las piezas por su nombre exacto, las seis plantillas y la regla que sale de gobierno.mjs', () => {
  const siete9 = EPOCA_0_BTML.registro[7][9];
  assert.equal(siete9[0][0], 'governance');
  assert.deepEqual(siete9.slice(1, 6), [[0.5], [0.6666666666], [3], [4], [0]], 'más de la mitad, dos tercios, niveles 3 y 4 (VG 17-11), y ningún nombre: el dueño');
  const nombres = new Set([...EPOCA_0_BTML.condiciones, ...EPOCA_0_BTML.lecturas, ...EPOCA_0_BTML.escrituras].map((r) => r[0][0]));
  const plantillas = new Set(A.plantillasDeTransaccion().map((p) => p.nombre));
  const [suelo, piezas] = [siete9[6], siete9[7]];
  for (const n of suelo) assert.ok(nombres.has(n) || /^epoch(\.\d)+$/.test(n), 'el suelo nombra una regla que existe: ' + n);
  assert.deepEqual(suelo.filter((n) => n.startsWith('epoch.')), ['epoch.7.0', 'epoch.1.3.1', 'epoch.7.2']);
  assert.equal(suelo.length, 29, '17 reglas de VG, 9 del mecanismo del gobierno (arreglos, anexo I) y 3 posiciones');
  for (const n of piezas) assert.ok(nombres.has(n) || plantillas.has(n) || n === 'epoch.7.9', 'pieza de gobierno: ' + n);
  for (const n of ['epoch.7.9', 'approved', ...Object.values(P)]) assert.ok(piezas.includes(n), n);
  // Las seis plantillas: dónde anclan y su sitio en el aro.
  const donde = Object.fromEntries(A.plantillasDeTransaccion().filter((p) => Object.values(P).includes(p.nombre)).map((p) => [p.nombre, [p.plantilla[5][0], p.plantilla[8], p.plantilla[3][1][0]]]));
  assert.deepEqual(donde, {
    [P.proponer]: ['9.7', [0, 5], 'person'],
    [P.apoyar]: ['2.1', [2, 7], 'person'],
    [P.retirarApoyo]: ['2.1', [2, 8], 'person'],
    [P.aprobar]: ['4', [4, 19], 'agent'],
    [P.poner]: ['6', [6, 4], 'agent'],
    [P.retirar]: ['4', [4, 20], 'person'],
  });
  assert.equal(ANCLA_DE_PROPUESTAS, '9700000000');
  const enVigor = EPOCA_0_BTML.condiciones.find((r) => r[0][0] === 'a change comes into force with its proof');
  assert.equal(enVigor[2].at(-1), formulaDePonerEnVigor(), 'la regla lleva la fórmula de datos/epocas/gobierno.mjs (node datos/epocas/gobierno.mjs --escribir)');
  // Las lecturas, donde se materializan.
  const lectura = (n) => EPOCA_0_BTML.lecturas.find((r) => r[0][0] === n)[3][0];
  assert.deepEqual(['support of', 'support', 'missing support', 'approved', 'change state', 'changes'].map(lectura), ['X.2.4.7', 'X.2.6', 'X.2.7', 'X.2.8', 'X.2.9', 'X']);
});

test('gobierno: proponer, apoyar, retirar el apoyo, aprobar y poner en vigor con nivel 0; sin llegar al umbral no se aprueba; ni dos veces; ni en vigor dos veces', async () => {
  const m = await mundo({ n3: 0 });
  const { eje, lanza, intenta, lee, estado, decidio } = m;
  // Se ofrece a quien tiene alta, en el génesis.
  assert.ok(A.acciones(eje, eje.genesisId, 0, 'ana').some((a) => a.nombre === P.proponer));
  const p = await m.propone();
  assert.deepEqual([p.sobre, p.en], [eje.genesisId, ANCLA_DE_PROPUESTAS]);
  assert.deepEqual([p.payload[0], p.payload[1][0], p.payload[2], p.payload[4]], [['más margen'], ['el margen del reloj del libro, de 10 a 15 minutos'], ['ordinary'], [P.proponer]]);
  assert.equal(decidio(p), P.proponer, 'estado: propuesta');
  assert.deepEqual(estado(p), { apoyo: 0, falta: 0.5, aprobada: false });
  // Sin apoyo no se aprueba (la regla, aunque se fuerce la plantilla).
  const sin = await intenta(P.aprobar, { X: p.id }, 'ana');
  assert.deepEqual(reglas(sin), ['a change is enacted once it is approved']);
  assert.equal(A.acciones(eje, p.id, 4, 'ana').some((a) => a.nombre === P.aprobar), false, 'no se ofrece');
  // Apoyar: bloquea todo su P (parte 1) con la salida en la propuesta, esté donde esté.
  const a1 = await lanza(P.apoyar, { X: p.id }, 'ana');
  assert.ok(a1.movimientos.filter((x) => x.estado === 'bloqueo').length >= 2, 'bloquea varias series de una vez');
  assert.ok(a1.movimientos.filter((x) => x.estado === 'bloqueo').every((x) => x.salida === p.id && x.de === 'ana' && x.a === 'ana' && x.token === 'P'));
  assert.deepEqual(estado(p), { apoyo: 1, falta: 0, aprobada: true }, 'el dueño solo: todo su P bloqueado (el P que le da escribir el apoyo no cuenta)');
  // Retirar el apoyo lo devuelve entero.
  const r = await lanza(P.retirarApoyo, { X: p.id }, 'ana');
  assert.ok(r.movimientos.filter((x) => x.estado === 'liberacion').length >= 2);
  assert.equal(lee('=count ((first it.2).4)', p.id), 0);
  assert.deepEqual(estado(p), { apoyo: 0, falta: 0.5, aprobada: false });
  // Otra vez, y se aprueba.
  await lanza(P.apoyar, { X: p.id }, 'ana');
  assert.ok(A.acciones(eje, p.id, 4, 'ana').some((a) => a.nombre === P.aprobar));
  const e = await lanza(P.aprobar, { X: p.id }, 'bea');
  assert.equal(e.sobre, p.id);
  assert.equal(decidio(p), P.aprobar, 'estado: aprobada');
  const dos = await intenta(P.aprobar, { X: p.id }, 'ana');
  assert.deepEqual(reglas(dos), ['a change is enacted once it is approved'], 'aprobar dos veces');
  // Retirar el apoyo después no cambia la aprobación (queda fijada en el registro).
  await lanza(P.retirarApoyo, { X: p.id }, 'ana');
  assert.equal(decidio(p), P.aprobar);
  // En vigor con nivel 0: sin prueba.
  const f = await lanza(P.poner, { X: e.id }, 'bea');
  assert.equal(f.sobre, e.id);
  assert.equal(f.payload[1].length, 1, 'sin prueba en su 1.1');
  assert.equal(decidio(p), P.poner, 'estado: en vigor');
  const otra = await intenta(P.poner, { X: e.id }, 'ana');
  // Lo rechaza la regla de la época y, por su cuenta, el núcleo (A23, src/versiones.js: un cambio entra en vigor una sola vez).
  assert.deepEqual(reglas(otra), ['a change comes into force with its proof', null], 'en vigor dos veces');
  assert.match(otra.motivos[1].mensaje, /ya está en vigor desde el registro [0-9a-f]{8}: un cambio entra en vigor una sola vez/);
  assert.equal(A.acciones(eje, e.id, 6, 'ana').some((a) => a.nombre === P.poner), false);
  // El motor de versiones (A23, docs/notas/VERSIONES.md): la época del libro pasa a la versión con el cambio; su id no cambia.
  assert.equal(eje.epoca().registro[7][3][0][0], 900);
  assert.equal(eje.epocaDe(f.id).registro[7][3][0][0], 600, 'el registro que lo pone en vigor se juzgó con la anterior');
  assert.equal(eje.versiones().length, 2);
  // «changes»: las propuestas del libro.
  const q = await m.propone('ana', 'ordinary', 'otro');
  const cambios = leerRegla(eje.epoca().lecturas.find((x) => x[0][0] === 'changes'), eje.genesisId, m.ctx());
  assert.deepEqual(cambios.valor.map((x) => x.id ?? x), [p.id, q.id]);
});

test('gobierno: con dos nombres y presiones distintas el recuento da lo esperado; quien no está en la lista apoya y no cuenta; escribir más no da más peso', async () => {
  const m = await mundo({ nombres: ['ana', 'bea 3'], invitados: ['bea', 'cris'] });
  const { eje, lanza, lee, estado, apoyoDe } = m;
  const p = await m.propone();
  await lanza(P.apoyar, { X: p.id }, 'ana');
  // ana: presión 9 (un nombre suelto), todo su P: 9 / (9 + 3).
  casi(estado(p).apoyo, 9 / 12);
  casi(apoyoDe(p, 'ana'), 9);
  // bea: presión 3, la mitad de su P (su alta y la R de ana en la raíz de ana, 3.ª mirada del génesis).
  assert.equal(lee('=sum (("bea").2.1 each 1)', p.id), 20, 'bea tiene diez P sobre su alta y diez sobre el génesis por la R de ana que recibió');
  await lanza(P.apoyar, { X: p.id, part: 0.5 }, 'bea');
  casi(apoyoDe(p, 'bea'), 3 * 0.5);
  casi(estado(p).apoyo, (9 + 1.5) / 12);
  casi(estado(p).falta, 0);
  assert.equal(estado(p).aprobada, true);
  // cris no está en la lista: bloquea su P y no mueve el resultado.
  const antes = estado(p).apoyo;
  await lanza(P.apoyar, { X: p.id }, 'cris');
  assert.ok(lee('=count ((first it.2).4 where first it2.3 = "cris")', p.id) > 0, 'su compromiso está');
  assert.equal(apoyoDe(p, 'cris'), 0);
  assert.equal(estado(p).apoyo, antes);
  // Escribir más no da más peso: en un libro igual, bea escribe cinco registros más antes de apoyar con la misma parte.
  const n = await mundo({ nombres: ['ana', 'bea 3'] });
  for (let k = 0; k < 5; k++) await n.eje.escribir({ autor: 'bea', sobre: n.eje.alta('bea').id, t: n.reloj(), payload: ['nota ' + k], movimientos: [quemaDelCoste('bea', ['nota ' + k], 'minuto', { eje: n.eje })] });
  assert.equal(n.lee('=sum (("bea").2.1 each 1)', n.eje.genesisId), 70);
  const q = await n.propone();
  await n.lanza(P.apoyar, { X: q.id, part: 0.5 }, 'bea');
  casi(n.apoyoDe(q, 'bea'), 1.5);
  casi(n.estado(q).apoyo, 1.5 / 12);
});

test('gobierno: el resultado no depende de quién propuso, y el mismo P no apoya dos propuestas a la vez', async () => {
  // Dos libros iguales; en uno propone ana (la dueña) y en el otro bea. Los mismos apoyos dan lo mismo.
  const libro = async (quien) => {
    const m = await mundo({ nombres: ['ana', 'bea 3'] });
    // El dueño deja escribir gratis en su alta (el génesis) a todos sus grupos («attention has a price»), en los dos libros.
    for (const zone of [0, 1, 2, 3, 4]) await m.lanza('set a group price', { X: m.eje.genesisId, token: 'their R', amount: 0, zone }, 'ana');
    const p = await m.propone(quien);
    await m.lanza(P.apoyar, { X: p.id }, 'ana');
    await m.lanza(P.apoyar, { X: p.id, part: 0.5 }, 'bea');
    return { m, p };
  };
  const deAna = await libro('ana');
  const deBea = await libro('bea');
  assert.equal(deBea.m.eje.obtener(deBea.p.id).autor, 'bea');
  casi(deAna.m.estado(deAna.p).apoyo, (9 + 1.5) / 12);
  casi(deBea.m.estado(deBea.p).apoyo, deAna.m.estado(deAna.p).apoyo);
  for (const quien of ['ana', 'bea']) casi(deBea.m.apoyoDe(deBea.p, quien), deAna.m.apoyoDe(deAna.p, quien));
  // Lo bloqueado con una propuesta no está disponible para otra: bloquearlo a mano con la otra salida no pasa el libro.
  const { m, p } = deAna;
  const q = await m.propone('ana', 'ordinary', 'otra');
  const serie = evaluar('=first ((("bea").1 where P in it2.0.0.0 and count it2.2.("' + p.id + '") > 0) each 0)', m.ctx(), { sujeto: p.id }).texto;
  const libre = m.lee('=first ("bea").1.("' + serie + '").1', p.id);
  const bloqueado = m.lee('=first ("bea").1.("' + serie + '").2.("' + p.id + '").1', p.id);
  assert.ok(bloqueado > 0);
  const [ambito] = String(serie).slice(2).split('/');
  const payload = ['a mano', ['1'], ['all announced movements happened'], ['bea'], [P.apoyar]];
  const bloquea = (cantidad) => m.eje.escribir({ autor: 'bea', sobre: q.id, en: '2100000000', t: m.reloj(), payload, movimientos: [quemaDelCoste('bea', payload, 'minuto', { eje: m.eje }), { token: 'P', ambito, origen: 'bea', cantidad, de: 'bea', a: 'bea', estado: 'bloqueo', salida: q.id }] });
  await assert.rejects(bloquea(libre + bloqueado));
  assert.equal(m.lee('=count ((first it.2).4 where first it2.3 = "bea")', q.id), 0);
});

test('gobierno: una propuesta de gobierno pide el umbral alto; con más apoyo, pasa', async () => {
  const m = await mundo({ nombres: ['ana', 'bea 5'], n3: 0, n4: 0 });
  const { lanza, intenta, estado } = m;
  const g = await m.propone('ana', 'governance', 'de gobierno');
  await lanza(P.apoyar, { X: g.id }, 'ana');
  // ana, todo su P, presión 9 de 14: más de la mitad, menos de dos tercios.
  casi(estado(g).apoyo, 9 / 14);
  assert.equal(estado(g).aprobada, false);
  casi(estado(g).falta, 0.6666666666 - 9 / 14);
  assert.deepEqual(reglas(await intenta(P.aprobar, { X: g.id }, 'ana')), ['a change is enacted once it is approved']);
  // El mismo apoyo en una corriente, en un libro igual, pasa.
  const n = await mundo({ nombres: ['ana', 'bea 5'], n3: 0, n4: 0 });
  const c = await n.propone('ana', 'ordinary', 'corriente');
  await n.lanza(P.apoyar, { X: c.id }, 'ana');
  casi(n.estado(c).apoyo, 9 / 14);
  assert.deepEqual([n.estado(c).aprobada, n.estado(c).falta], [true, 0]);
  // bea pone la mitad de su P en la de gobierno: (9 + 2.5) / 14.
  await lanza(P.apoyar, { X: g.id, part: 0.5 }, 'bea');
  casi(estado(g).apoyo, 11.5 / 14);
  assert.equal(estado(g).aprobada, true);
  const e = await lanza(P.aprobar, { X: g.id }, 'bea');
  await lanza(P.poner, { X: e.id }, 'ana');
});

test('gobierno: poner en vigor con prueba: la que no cubre el registro, la de una clave que el libro no nombra o la que no llega al nivel se rechazan; la buena pasa', async () => {
  // La época 0: un cambio corriente pide el nivel 3, uno de gobierno el 4; el dueño solo cuenta.
  const m = await mundo();
  const { eje, lanza, intenta } = m;
  const obs = await observadorDePrueba();
  const casa = await generarClaves();
  const fuera = await generarClaves();
  await declararExterior(eje, { lineas: [casa.publica], t: m.reloj() });
  const p = await m.propone();
  await lanza(P.apoyar, { X: p.id }, 'ana');
  const e = await lanza(P.aprobar, { X: p.id }, 'ana');
  const regla = ['a change comes into force with its proof'];
  const con = async (sello) => intenta(P.poner, { X: e.id, ...(sello ? { proof: sello.decupla } : {}) }, 'ana');
  assert.deepEqual(reglas(await con(null)), regla, 'sin prueba, con el nivel 3 pedido');
  // Una prueba buena, pero de otro registro.
  assert.deepEqual(reglas(await con(await selloEnCascada(p.id, { observador: obs, capas: [{ nivel: 3, claves: casa }, { nivel: 4 }] }))), regla, 'no cubre ese registro');
  // Firmada por una clave que el libro no nombra (ni en sus claves de línea ni en las del observador).
  assert.deepEqual(reglas(await con(await selloEnCascada(e.id, { observador: obs, capas: [{ nivel: 3, claves: fuera }, { nivel: 4 }] }))), regla, 'clave que el libro no nombra');
  // Con clave nombrada, pero solo hasta el nivel 2 (el de arriba lo firma un observador que el libro no declara).
  assert.deepEqual(reglas(await con(await selloEnCascada(e.id, { observador: obs, capas: [{ nivel: 2, claves: casa }, { nivel: 4 }] }))), regla, 'no llega al nivel 3');
  // La buena: un eslabón de nivel 3 firmado por una clave de línea del libro.
  const buena = await selloEnCascada(e.id, { observador: obs, capas: [{ nivel: 3, claves: casa }, { nivel: 4 }] });
  const r = await con(buena);
  assert.equal(r.ok, true, JSON.stringify(r.motivos));
  assert.deepEqual(r.evento.payload[1][1], buena.decupla, 'la décupla de sello va en su 1.1');
  await eje.anadir(r.evento);
  assert.deepEqual(reglas(await con(buena)), [...regla, null], 'una vez: lo dice la regla y, por su cuenta, el núcleo (A23)');
  // De gobierno: nivel 4. Por defecto la plantilla toma el sello que el libro guarda del registro (su 6.8.2); el entero
  // (el observador declarado: llega a Bitcoin) pasa.
  await declararExterior(eje, { lineas: [casa.publica], observadores: [obs.publica], t: m.reloj() });
  // ana retira su apoyo a la primera (ya en vigor: no cambia nada) para tener libre su P.
  await lanza(P.retirarApoyo, { X: p.id }, 'ana');
  const g = await m.propone('ana', 'governance', 'de gobierno');
  await lanza(P.apoyar, { X: g.id }, 'ana');
  const eg = await lanza(P.aprobar, { X: g.id }, 'ana');
  const solo3 = await selloEnCascada(eg.id, { observador: await observadorDePrueba(), capas: [{ nivel: 3, claves: casa }, { nivel: 4 }] });
  assert.deepEqual(reglas(await intenta(P.poner, { X: eg.id, proof: solo3.decupla }, 'ana')), regla, 'el 3 no basta a un cambio de gobierno');
  eje.marcarSello(eg.id, await selloEnCascada(eg.id, { observador: obs, capas: [{ nivel: 1, claves: casa }, { nivel: 4 }] }));
  const porDefecto = await intenta(P.poner, { X: eg.id }, 'ana');
  assert.equal(porDefecto.ok, true, JSON.stringify(porDefecto.motivos));
  assert.equal(porDefecto.evento.payload[1][1][6], 'cascada', 'la del 6.8.2 del registro');
});

test('gobierno: retirar la propuesta solo quien propuso y antes de aprobarse; devuelve los apoyos', async () => {
  const m = await mundo({ nombres: ['ana', 'bea'] });
  const { eje, lanza, intenta, lee, estado, decidio } = m;
  const p = await m.propone();
  await lanza(P.apoyar, { X: p.id }, 'ana');
  await lanza(P.apoyar, { X: p.id }, 'bea');
  assert.equal(estado(p).aprobada, true);
  assert.deepEqual(reglas(await intenta(P.retirar, { X: p.id }, 'bea')), ['only who proposed withdraws a change'], 'bea no la propuso');
  assert.equal(A.acciones(eje, p.id, 4, 'bea').some((a) => a.nombre === P.retirar), false);
  const w = await lanza(P.retirar, { X: p.id }, 'ana');
  assert.equal(decidio(p), P.retirar, 'estado: retirada');
  // La retirada libera lo de ana; lo de bea deja de valer para aprobar y ella lo recupera cuando quiera.
  assert.ok(w.movimientos.some((x) => x.estado === 'liberacion' && x.de === 'ana' && x.salida === p.id));
  assert.equal(lee('=count ((first it.2).4 where first it2.3 = "ana")', p.id), 0);
  assert.deepEqual(reglas(await intenta(P.aprobar, { X: p.id }, 'ana')), ['a change is enacted once it is approved'], 'retirada, no se aprueba');
  assert.equal(A.acciones(eje, p.id, 2, 'bea').some((a) => a.nombre === P.apoyar), false, 'ya no se ofrece apoyarla');
  assert.ok(A.acciones(eje, p.id, 2, 'bea').some((a) => a.nombre === P.retirarApoyo));
  await lanza(P.retirarApoyo, { X: p.id }, 'bea');
  assert.equal(lee('=count ((first it.2).4)', p.id), 0, 'todos los apoyos devueltos');
  assert.deepEqual(reglas(await intenta(P.retirar, { X: p.id }, 'ana')), ['only who proposed withdraws a change'], 'una vez');
  // Después de aprobada tampoco se retira.
  const q = await m.propone('ana', 'ordinary', 'otra');
  await lanza(P.apoyar, { X: q.id }, 'ana');
  await lanza(P.apoyar, { X: q.id }, 'bea');
  await lanza(P.aprobar, { X: q.id }, 'ana');
  assert.deepEqual(reglas(await intenta(P.retirar, { X: q.id }, 'ana')), ['only who proposed withdraws a change']);
});

test('gobierno: la forma de la propuesta (su clase, su cambio, su sitio) y el P que da recibir R cuenta en el P de su titular', async () => {
  const m = await mundo();
  const { eje, intenta, lee } = m;
  const sinClase = await intenta(P.proponer, { X: eje.genesisId, title: 't', explanation: 'x', change: m.cambio(), class: 'urgent' }, 'ana');
  assert.equal(sinClase.ok, false);
  assert.ok(reglas(sinClase).includes('class'), JSON.stringify(sinClase.motivos));
  // A mano, sin pasar por la plantilla: la regla.
  const payload = (clase, cambio) => ['a mano', [['x'], cambio], [clase], ['ana'], [P.proponer]];
  const escribe = (clase, cambio, en = ANCLA_DE_PROPUESTAS, sobre = eje.genesisId) => eje.escribir({ autor: 'ana', sobre, en, t: m.reloj(), payload: payload(clase, cambio), movimientos: [quemaDelCoste('ana', payload(clase, cambio), 'minuto', { eje })] });
  await assert.rejects(escribe('urgent', m.cambio()), /a change names its class and brings a change/);
  await assert.rejects(escribe('ordinary', 'nada'), /a change names its class and brings a change/);
  await assert.rejects(escribe('ordinary', m.cambio(), '9100000000'), /a change names its class and brings a change/, 'fuera del 9.7');
  const bien = await escribe('governance', m.cambio());
  assert.equal(lee('=first (payload(it)).2', bien.id), 'governance');
  // El P que bea obtuvo al recibir la R de ana está en la mirada 3 del génesis (la raíz de ana) y cuenta en su P total.
  assert.equal(lee('=sum ((("bea").2.1 where first it2.0 = "' + eje.genesisId + '") each 1)', eje.genesisId), 10);
  assert.equal(lee('=first (("bea").2.1 where first it2.0 = "' + eje.genesisId + '") each 5', eje.genesisId), 3);
});

test('gobierno: el ejemplo (ejemplos/gobierno.mjs): la corriente se apoya, se aprueba y se pone en vigor con nivel 0; la de gobierno no llega a dos tercios', async () => {
  const { ejemploGobierno, resumen } = await import('../ejemplos/gobierno.mjs');
  const e = await ejemploGobierno();
  assert.deepEqual(e.eje.epoca().registro[7][9].slice(3, 6), [[0], [4], ['ana', 'bea']], 'la hija de prueba: nivel 0 para lo corriente y dos nombres');
  assert.deepEqual(resumen(e), [
    { titulo: 'más margen', clase: 'ordinary', apoyo: 0, falta: 0.5, aprobada: false, estado: P.poner },
    { titulo: 'nombrar a cris', clase: 'governance', apoyo: 0.5, falta: 0.167, aprobada: false, estado: P.proponer },
  ], 'en vigor, y con los apoyos ya retirados (no cambia nada); la de gobierno, con la mitad');
  assert.equal(e.enVigor.sobre, e.aprobacion.id);
});
