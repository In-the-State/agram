// Revisión de seguridad de LA R EN LOS CANALES y del P que da (tramo 3, paso 4; VG 17-11; encargo
// agram-equipo/encargos/encargo-revision-puente-y-canales.md, parte 2). La pregunta de VG, tal cual: «una conversación
// larga en la que la R gira y el agente acumula P sobre quien contesta: ¿puede llegar a pesar en un cambio de reglas o
// sobre algo del dueño?». Un agente distinto de los que lo construyeron intenta romperlo; no arregla nada. Un caso por
// hallazgo (los que fallan hoy llevan `todo` y su motivo) y un caso por lo que aguanta. El nodo de ejemplo
// (ejemplos/state/nodo.mjs), en memoria, con identidades y claves de prueba: nada real.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Eje } from '../src/eje.js';
import * as A from '../src/acciones.js';
import { evaluar } from '../src/bqlm.js';
import { ContextoEje } from '../src/contexto-eje.js';
import { firmar } from '../src/autoridad.js';
import { serializar, restaurar } from '../src/persistencia.js';
import { ejemploNodo, N, CLAVES, hora, claveDePrueba } from '../ejemplos/state/nodo.mjs';
import { escribirPagando, pagaElCoste } from '../ejemplos/ikisai/coste.mjs';

const claveDe = (q) => CLAVES[q] ?? claveDePrueba(q);
const AG = N.agenteCasa;

/** El nodo de ejemplo con un reloj y las ayudas de siempre. */
async function nodo(desde = 6000) {
  const { eje, ids } = await ejemploNodo();
  let minuto = desde;
  const t = () => hora(minuto++);
  const intentar = async (nombre, X, params, quien) => {
    const r = await A.transaccion(eje, nombre, { X, ...params }, quien, { t: t(), firmar: (ev) => firmar(ev, claveDe(quien).privada) });
    if (r.ok) await eje.anadir(r.evento);
    return r;
  };
  const hecho = async (nombre, X, params, quien) => {
    const r = await intentar(nombre, X, params, quien);
    assert.ok(r.ok, nombre + ' de ' + quien + ': ' + JSON.stringify(r.motivos?.map((x) => x.mensaje)));
    return r.evento;
  };
  /** Un registro escrito a mano, pagando su coste: 'entra' o el mensaje del rechazo. */
  const aMano = (autor, sobre, payload, movimientos = [], en = '1000000000') => escribirPagando(eje, { autor, sobre, en, t: t(), movimientos: [pagaElCoste(autor), ...movimientos], payload }, claveDe(autor).privada).then(() => 'entra', (e) => e.message);
  /** Una persona nueva, invitada por el operador con `cuanta` R suya (para pagar el precio de abrir). */
  const persona = async (quien, cuanta = 2) => {
    const K = claveDe(quien);
    const inv = await eje.invitar({ autor: N.operador, invitado: quien, clave: K.publica, da: [{ token: 'R', cantidad: cuanta }], t: t(), privada: CLAVES.operador.privada });
    await eje.aceptar(inv, K, { t: t() });
    return eje.alta(quien).id;
  };
  /** El P de `quien` sobre el alta de `de` (en su mirada 3: el que da recibir R de su emisor). */
  const pSobre = (quien, de) => eje.poderSobre(quien, eje.alta(de).id);
  return { eje, ids, t, intentar, hecho, aMano, persona, pSobre };
}

/** Un movimiento de P del agente (su origen). */
const P_ = (ambito, cantidad, de, a, extra = {}) => ({ token: 'P', ambito, origen: AG, cantidad, de, a, ...extra });

/** p con una casa de 4 plazas (capacidad 4 en su 2), colgada de su alta, y una conversación con el agente de la casa. */
async function casaDeP({ give } = {}) {
  const n = await nodo();
  const p = 'persona-p';
  const alta = await n.persona(p);
  const conv = await n.hecho('open a conversation', n.ids.agenteCasa, { title: 'hola', ...(give ? { give } : {}) }, p);
  const casa = await escribirPagando(n.eje, { autor: p, sobre: alta, en: '1000000000', t: n.t(), movimientos: [pagaElCoste(p)], payload: [['casa'], ['de p'], [4]] }, claveDe(p).privada);
  /** El agente lleva su P de la mirada 3 del alta de p a la casa: dos pasos (sube al alta, una décima; baja a la casa, una décima más). */
  const llevarALaCasa = async () => {
    const q = n.pSobre(AG, p);
    assert.equal(await n.aMano(AG, conv.id, [['subo']], [P_(alta + '.3', q, AG, null), P_(alta, q / 10, null, AG)]), 'entra', 'sube');
    assert.equal(await n.aMano(AG, conv.id, [['bajo']], [P_(alta, q / 10, AG, null), P_(casa.id, (q / 10) * 1.1, null, AG)]), 'entra', 'baja');
    return n.eje.poderSobre(AG, casa.id);
  };
  /** Cuántas E puede emitir p sobre su casa, una a una (cada una bloquea 1 de su P sobre la casa, la cuota del tope). */
  const emiteP = async () => {
    let k = 0;
    while (k < 6 && (await n.intentar('issue E tied to X', casa.id, { denomination: 'noche', quantity: 1 }, p)).ok) k++;
    return k;
  };
  return { ...n, p, alta, conv, casa, llevarALaCasa, emiteP };
}

// ================================ HALLAZGOS ================================

// ---------- CH1 (alto): el P de una conversación pesa sobre las cosas de quien la abrió ----------

test('CH1: control: sin agente de por medio, p emite las 4 plazas de su casa', async () => {
  const { emiteP } = await casaDeP();
  assert.equal(await emiteP(), 4);
});

test('CH1: con la R de abrir la conversación (una unidad), el agente lleva su P a la casa de p, se lo pasa a su dueño, el dueño emite E atada a la casa de p y p solo emite 2 de sus 4 plazas', {
  todo: 'HALLAZGO CH1 (alto): «receiving R gives ten P on the root of its issuer» pone el P en la mirada 3 del alta de quien da la R, y «P is repositioned one step at a time» deja llevarlo a cualquier registro colgado de esa alta (sube al alta: 1; baja a la casa: 1,1). Con él, el agente (escribiendo a mano: «reposition P toward X» es de modo persona, la regla no) bloquea P en la casa o lo pasa a su dueño, y el dueño emite E atada a la casa de p («minting E needs P on its record» admite P de cualquier origen); las dos cosas entran en el tope y en la cuota de la casa (src/condiciones/tope.js: el total comprometido cuenta el P bloqueado de cualquiera con la salida en una serie atada al subárbol). Basta abrir una conversación. Arreglo mínimo (decide VG): que el P que nace de recibir R no salga de la mirada 3 del alta del emisor (no se reposiciona), o que la cuota y «minting E needs P on its record» solo cuenten P cuyo origen es quien escribió el registro o lo obtuvo escribiéndolo',
}, async () => {
  const c = await casaDeP();
  assert.equal(c.pSobre(AG, c.p), 10, 'abrir: diez P sobre el alta de p');
  assert.equal(await c.llevarALaCasa(), 1.1, 'el P de la conversación, en la casa de p');
  assert.equal(await c.aMano(AG, c.conv.id, [['te lo paso']], [P_(c.casa.id, 1.1, AG, N.operador)]), 'entra', 'se lo pasa a su dueño (sigue siendo de origen el agente)');
  const r = await c.intentar('issue E tied to X', c.casa.id, { denomination: 'noche', quantity: 2, commitment: 1.1 }, N.operador);
  assert.equal(r.ok, true, 'el operador emite 2 E atadas a la casa de p: ' + JSON.stringify(r.motivos?.map((x) => x.mensaje)));
  assert.equal(await c.emiteP(), 4, 'p sigue pudiendo emitir sus 4 plazas');
});

test('CH1: con «le doy 100» al abrir, el agente solo, bloqueando en la casa el P de la conversación (sin emitir nada), deja a p sin poder emitir ni una plaza', {
  todo: 'HALLAZGO CH1 (alto), variante sin el dueño: el agente es una cosa y no emite («only persons mint»), pero su P bloqueado con la salida en una serie atada a la casa cuenta en el denominador de la cuota de p (1100 contra el 1 de p: cuota 0 de 4). El mismo arreglo que CH1',
}, async () => {
  const c = await casaDeP({ give: 100 });
  assert.equal(c.pSobre(AG, c.p), 1000, '«le doy 100» al abrir: mil P sobre el alta de p');
  const enLaCasa = await c.llevarALaCasa();
  assert.ok(Math.abs(enLaCasa - 110) < 1e-9, 'en la casa: ' + enLaCasa);
  assert.equal(await c.aMano(AG, c.conv.id, [['bloqueo']], [P_(c.casa.id, enLaCasa, AG, AG, { estado: 'bloqueo', salida: 'E:' + c.p + '/noche@' + c.casa.id })]), 'entra', 'lo bloquea con la salida de la serie de p');
  assert.equal(await c.emiteP(), 4, 'p sigue pudiendo emitir sus 4 plazas');
});

// ---------- CH2 (medio, conocido): sin tope por conversación ----------

test('CH2: por Telegram, x escribe 5 veces y el agente escribe 9 veces seguidas a y, que solo abrió y escribió una (la R del servicio de una conversación se gasta en otra)', {
  todo: 'HALLAZGO CH2 (medio, límite conocido de docs/notas/R_EN_CANALES.md): fuera, toda la R es del servicio, así que «un agente solo escribe a quien le ha dado R» no separa a los interlocutores: lo que da la charla de x paga mensajes no pedidos a y (y a cualquier otro chat del servicio). Daño: mensajes no pedidos a personas de fuera, entregados por el servicio, y el agente acumulando P sobre el servicio sin tope (CH4). Arreglo mínimo: contar por conversación (lo que entra menos lo que sale) en «who writes a message» para los canales de fuera',
}, async () => {
  const n = await nodo();
  const conv = {};
  for (const q of ['x', 'y']) {
    await n.hecho('register an interlocutor', n.ids.altaServicio, { thing: 'inter-' + q, channel: 'telegram', fingerprint: createHash('sha256').update('revision/' + q).digest('hex') }, N.servicio);
    conv[q] = (await n.hecho('open a conversation', n.ids.agenteCasa, { interlocutor: 'inter-' + q, title: q }, N.servicio)).id;
  }
  for (let k = 0; k < 5; k++) await n.hecho('message in', conv.x, { channel: 'telegram', text: 'x ' + k }, N.servicio);
  await n.hecho('message in', conv.y, { channel: 'telegram', text: 'y 0' }, N.servicio);
  let aY = 0;
  while (aY < 20 && (await n.intentar('message out', conv.y, { text: 'a y ' + aY }, AG)).ok) aY++;
  assert.ok(aY <= 2, 'a y, como mucho lo que dio su conversación (abrir y un mensaje): ' + aY);
});

// ================================ LA PREGUNTA DE VG: EL P, MEDIDO ================================

test('dato: el P del agente sobre quien le da R es un nivel (diez por lo neto recibido de él: recibido menos devuelto) que nunca baja, aunque devuelva toda la R; «le doy 1000»; muchas personas, cada una en su alta', async () => {
  const n = await nodo();
  const p = 'persona-con-r';
  await n.persona(p);
  const conv = await n.hecho('open a conversation', n.ids.agenteCasa, {}, p);
  assert.equal(n.pSobre(AG, p), 10, 'abrir');
  for (let k = 0; k < 10; k++) {
    await n.hecho('message out', conv.id, { channel: 'house', text: 'r ' + k }, AG);
    await n.hecho('message in', conv.id, { text: 'p ' + k }, p);
  }
  assert.equal(n.pSobre(AG, p), 10, 'diez vueltas: no crece');
  // Retiene sin contestar: cada «message in» le da otra.
  for (let k = 0; k < 3; k++) await n.hecho('message in', conv.id, { text: 'sin respuesta ' + k }, p);
  assert.equal(n.eje.saldo(AG, 'R:' + p), 4);
  assert.equal(n.pSobre(AG, p), 40, 'cuatro en la mano: cuarenta');
  // Las devuelve todas: el P se queda (devolver baja el nivel, no quema).
  for (let k = 0; k < 4; k++) await n.hecho('message out', conv.id, { channel: 'house', text: 'devuelvo ' + k }, AG);
  assert.equal(n.eje.saldo(AG, 'R:' + p), 0);
  assert.equal(n.pSobre(AG, p), 40, 'sin R de p, sigue con cuarenta P sobre su alta');
  await n.hecho('message in', conv.id, { text: 'otra vez' }, p);
  assert.equal(n.pSobre(AG, p), 40, 'recibir otra no acuña hasta pasar el nivel ya alcanzado');
  // «le doy 1000».
  const mil = 'persona-mil';
  await n.persona(mil);
  await n.hecho('open a conversation', n.ids.agenteCasa, { give: 1000 }, mil);
  assert.equal(n.pSobre(AG, mil), 10000, '«le doy 1000» al abrir: diez mil P');
  // Muchas personas: diez sobre cada una, cada cual en la mirada 3 de su alta (no se suman en un mismo sitio).
  const otras = ['p1', 'p2', 'p3', 'p4', 'p5'];
  for (const q of otras) {
    await n.persona(q);
    await n.hecho('open a conversation', n.ids.agenteCasa, {}, q);
  }
  assert.deepEqual(otras.map((q) => n.pSobre(AG, q)), [10, 10, 10, 10, 10]);
  assert.ok(n.eje.poderes(AG).filter((x) => otras.some((q) => x.ambito === n.eje.alta(q).id + '.3')).every((x) => x.cantidad === 10));
});

test('dato (CH4): por Telegram el P del agente es sobre el servicio y crece con todo el tráfico de todos los chats (sin tope)', async () => {
  const n = await nodo();
  const s = () => n.pSobre(AG, N.servicio);
  const antes = [n.eje.saldo(AG, 'R:' + N.servicio), s()];
  for (let k = 0; k < 8; k++) await n.hecho('message in', n.ids.conversacionTelegram, { channel: 'telegram', text: 'm ' + k }, N.servicio);
  const despues = [n.eje.saldo(AG, 'R:' + N.servicio), s()];
  assert.deepEqual([despues[0] - antes[0], despues[1]], [8, 10 * despues[0]], 'antes ' + JSON.stringify(antes) + ', después ' + JSON.stringify(despues));
});

test('dato: agente con agente no da P por la R que gira; pero si escribe el dueño el «message out» con «give», el otro agente recibe R de su emisor y gana P sobre el dueño', async () => {
  const n = await nodo();
  const B = 'agente-de-la-visita';
  const K = claveDe(B);
  const alta = await escribirPagando(n.eje, { autor: N.visita, sobre: n.eje.alta(N.visita).id, en: '1400000000', t: n.t(), movimientos: [pagaElCoste(N.visita), { token: 'T', escala: 'minuto', cantidad: 600, de: N.visita, a: B }], payload: [B, 600, 'all announced movements happened', [N.visita, B], 'register a thing', 'agent'], contexto: { claves: { [B]: K.publica } } }, CLAVES.visita.privada, { [B]: K.privada });
  await n.hecho('declare agent', alta.id, {}, N.visita);
  await n.hecho('admit someone', n.eje.alta(N.operador).id, { whom: AG, amount: 3 }, N.operador);
  await n.hecho('admit someone', n.eje.alta(N.visita).id, { whom: B, amount: 6 }, N.visita);
  await n.hecho('admit someone', n.eje.alta(N.operador).id, { whom: B, amount: 2 }, N.operador);
  const conv = await n.hecho('open a conversation as an agent', n.ids.agenteCasa, {}, B);
  const antes = n.pSobre(B, N.operador);
  for (let k = 0; k < 3; k++) {
    await n.hecho('message in from an agent', conv.id, { channel: 'house', text: 'B ' + k }, B);
    await n.hecho('message out', conv.id, { text: 'A ' + k, give: 1 }, AG);
  }
  assert.equal(n.pSobre(B, N.operador), antes, 'la R del operador que le pasa su agente no da P');
  await n.hecho('message in from an agent', conv.id, { channel: 'house', text: 'B otra' }, B);
  await n.hecho('give own R', n.eje.alta(N.operador).id, { amount: 1 }, N.visita); // para que el dueño pueda devolver la de la visita
  await n.hecho('message out', conv.id, { text: 'escribe el dueño', give: 10 }, N.operador);
  const neto = n.eje.recibidoDelEmisor(B).find((x) => x.emisor === N.operador).neto;
  assert.deepEqual([neto, n.pSobre(B, N.operador)], [7, 70], 'la que pasa el dueño viene de su emisor: diez por lo neto (2 de «admit someone» + 10 − 5 devueltas en los «message in from an agent»)');
});

// ================================ LO QUE AGUANTA ================================

test('aguanta: el P de las conversaciones no pesa en un cambio de reglas: el agente no apoya (modo persona) y su P bloqueado con la propuesta no cuenta; el servicio apoya con todo su P y el apoyo sigue en 0; solo cuenta el dueño del libro (7.9.5 = 0)', async () => {
  const n = await nodo();
  const p = 'persona-mil';
  await n.persona(p);
  const conv = await n.hecho('open a conversation', n.ids.agenteCasa, { give: 1000 }, p);
  assert.equal(n.pSobre(AG, p), 10000);
  const id = n.eje.epoca().id;
  const m = { ref: id };
  const propuesta = await n.hecho('propose a change', n.eje.genesisId, { title: 'cambio de prueba', explanation: 'revisión', change: [['cambio de prueba'], m, m, m, m, m, [['propuesto en la revisión'], ['hereda'], [id]]], class: 'ordinary' }, N.operador);
  const leer = (f) => evaluar(f, new ContextoEje(n.eje, { epoch: n.eje.epoca() }), { sujeto: propuesta.id }).valor;
  const apoyo = () => [leer('it.2.6')[0], leer('it.2.8')[0]];
  assert.deepEqual(apoyo(), [0, false]);
  assert.equal((await n.intentar('support a change', propuesta.id, {}, AG)).ok, false, 'un agente no lanza «support a change»');
  const suyo = n.eje.poderes(AG).find((x) => x.ambito === n.eje.alta(p).id + '.3');
  assert.equal(await n.aMano(AG, conv.id, [['apoyo a mano']], [P_(suyo.ambito, suyo.cantidad, AG, AG, { estado: 'bloqueo', salida: propuesta.id })]), 'entra', 'el agente bloquea sus diez mil P con la propuesta');
  assert.deepEqual(apoyo(), [0, false], 'no cuenta: no es un compromiso «support a change» ni un nombre');
  await n.hecho('support a change', propuesta.id, {}, N.servicio);
  assert.deepEqual(apoyo(), [0, false], 'el servicio (una persona, con el P de sus registros) no es un nombre');
  await n.hecho('support a change', propuesta.id, {}, N.operador);
  assert.equal(apoyo()[1], true, 'el dueño solo la aprueba');
});

test('aguanta: el P del agente sobre p no alcanza una cuenta: en el libro del nodo solo conecta cuentas su dueño («an account lives in its owner\'s book»)', async () => {
  const c = await casaDeP();
  const r = await c.intentar('connect an account', c.alta, { name: 'cuenta de p', bank: 'Banco de Ejemplo' }, c.p);
  assert.equal(r.ok, false);
  assert.ok(r.motivos.some((x) => x.regla === "an account lives in its owner's book"), JSON.stringify(r.motivos.map((x) => x.regla)));
});

test('aguanta: el agente no emite E con el P de la conversación (es una cosa), ni en la casa de p ni en ninguna parte', async () => {
  const c = await casaDeP();
  await c.llevarALaCasa();
  const r = await c.aMano(AG, c.conv.id, [['acuño']], [{ token: 'E', emisor: AG, denominacion: 'noche', registro: c.casa.id, cantidad: 1, de: null, a: AG }]);
  assert.match(r, /only persons mint/);
});

test('aguanta: las reglas de los mensajes, a mano: devolver al interlocutor de fuera (una cosa) en vez de al servicio, dar R del operador desde fuera, dos movimientos de R del interlocutor que suman lo justo, y una cosa con clave no declarada agente paga como un agente', async () => {
  const n = await nodo();
  const tg = n.ids.conversacionTelegram;
  const r = (emisor, cantidad, de, a) => ({ token: 'R', emisor, cantidad, de, a });
  const msg = (que, ...uno) => [que, uno.map((x) => [x])];
  const aConv = (autor, conv, payload, movs) => n.aMano(autor, conv, payload, movs, '3000000000');
  await n.hecho('message in', tg, { channel: 'telegram', text: 'hola' }, N.servicio);
  assert.match(await aConv(AG, tg, msg('message out', 'telegram', N.interlocutor, 'al interlocutor'), [r(N.servicio, 1, AG, N.interlocutor)]), /who writes a message/, 'la R del servicio, a la cosa del otro lado');
  assert.match(await aConv(N.servicio, tg, msg('message in', 'telegram', N.interlocutor, 'con R ajena'), [r(N.operador, 1, N.servicio, AG)]), /who writes a message/, 'de fuera, con R de otro emisor');
  // Dos movimientos de una unidad en vez de uno de dos: la persona solo da R suya al agente; entra y el agente tiene dos.
  const p = 'persona-dos';
  await n.persona(p);
  const conv = await n.hecho('open a conversation', n.ids.agenteCasa, {}, p);
  const antes = n.eje.saldo(AG, 'R:' + p);
  const dos = await aConv(p, conv.id, msg('message in', 'house', p, 'dos de una'), [r(p, 2, null, p), r(p, 1, p, AG), r(p, 1, p, AG)]);
  if (dos === 'entra') assert.equal(n.eje.saldo(AG, 'R:' + p), antes + 2, 'dos de una: lo mismo que «le doy 2»');
  else assert.match(dos, /who writes a message/);
  // Una cosa con clave, no declarada agente: abre y escribe con las plantillas, pagando lo mismo que un agente (R de sus dueños), nada gratis.
  const B = 'cosa-con-clave';
  const K = claveDe(B);
  await escribirPagando(n.eje, { autor: N.visita, sobre: n.eje.alta(N.visita).id, en: '1400000000', t: n.t(), movimientos: [pagaElCoste(N.visita), { token: 'T', escala: 'minuto', cantidad: 600, de: N.visita, a: B }], payload: [B, 600, 'all announced movements happened', [N.visita, B], 'register a thing'], contexto: { claves: { [B]: K.publica } } }, CLAVES.visita.privada, { [B]: K.privada });
  assert.equal(A.esAgente(n.eje, B), false);
  assert.equal((await n.intentar('open a conversation', n.ids.agenteCasa, {}, B)).ok, false, 'sin R de los dueños, no abre');
  await n.hecho('admit someone', n.eje.alta(N.operador).id, { whom: B, amount: 2 }, N.operador);
  await n.hecho('admit someone', n.eje.alta(N.visita).id, { whom: B, amount: 2 }, N.visita);
  const c2 = await n.hecho('open a conversation', n.ids.agenteCasa, {}, B);
  assert.deepEqual(c2.movimientos.filter((x) => x.token === 'R').map((x) => [x.emisor, x.de, x.a]), [[N.operador, B, N.operador], [N.visita, B, AG]]);
});

test('aguanta: una conversación larga (20 vueltas, con «le doy» por medio) restaurada, rehecha desde sus eventos y reordenada da los mismos saldos de R, el mismo P y el mismo recuento', async () => {
  const n = await nodo();
  const p = 'persona-larga';
  await n.persona(p);
  const conv = await n.hecho('open a conversation', n.ids.agenteCasa, {}, p);
  const mios = [conv.id];
  for (let k = 0; k < 20; k++) {
    mios.push((await n.hecho('message out', conv.id, { channel: 'house', text: 'r ' + k }, AG)).id);
    mios.push((await n.hecho('message in', conv.id, { text: 'p ' + k, ...(k % 7 === 3 ? { give: 3 } : {}) }, p)).id);
    if (k % 7 === 3) for (let j = 0; j < 2; j++) mios.push((await n.hecho('message out', conv.id, { channel: 'house', text: 'extra ' + k + '.' + j }, AG)).id);
  }
  const foto = (e) => ({ r: [e.saldo(AG, 'R:' + p), e.saldo(p, 'R:' + p)], p: e.poderSobre(AG, e.alta(p).id), registros: e.orden.length });
  const esperada = foto(n.eje);
  assert.deepEqual(foto(await restaurar(serializar(n.eje))), esperada, 'restaurada');
  const desde = await Eje.desde(n.eje.orden.map((id) => n.eje.obtener(id)), { exigirFirmas: true });
  assert.deepEqual(foto(desde), esperada, 'desde sus eventos');
  const conjunto = new Set(mios);
  const otros = n.eje.orden.filter((id) => !conjunto.has(id));
  const corte = otros.indexOf(n.eje.alta(p).id) + 1;
  const { rechazados } = await desde.reordenar([...otros.slice(0, corte), ...mios, ...otros.slice(corte)]);
  assert.deepEqual(rechazados, []);
  assert.deepEqual(foto(desde), esperada, 'reordenada: la conversación entera justo tras el alta de p');
});
