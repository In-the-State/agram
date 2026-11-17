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
import { registrosParaUnMensaje, cupo, reservaPara, RESERVA } from '../datos/epocas/state/ayuda.mjs';

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
  /** Mete un mensaje con lo que lo precede (la reserva de quien escribe, si falta): registrosParaUnMensaje; da el mensaje. */
  const meter = async (conv, quien, params) => {
    let ev;
    for (const r of registrosParaUnMensaje(eje, conv, quien, params)) ev = await hecho(r.plantilla, conv, r.params, quien);
    return ev;
  };
  /** Lo mismo, sin afirmar: el resultado del mensaje (o del primer registro que no entra). */
  const intentarMeter = async (conv, quien, params) => {
    let r;
    for (const x of registrosParaUnMensaje(eje, conv, quien, params)) if (!(r = await intentar(x.plantilla, conv, x.params, quien)).ok) return r;
    return r;
  };
  return { eje, ids, t, intentar, hecho, aMano, persona, pSobre, meter, intentarMeter };
}

/** Un movimiento de P de `origen` (por defecto el agente). */
const P_ = (ambito, cantidad, de, a, extra = {}, origen = AG) => ({ token: 'P', ambito, origen, cantidad, de, a, ...extra });

/** El ancla del sí del dueño («let P come down here»): el 2.1 de la cosa. */
const EN_EL_21 = '2100000000';

/** p con una casa de 4 plazas (capacidad 4 en su 2), colgada de su alta, y una conversación con el agente de la casa. */
async function casaDeP({ give } = {}) {
  const n = await nodo();
  const p = 'persona-p';
  const alta = await n.persona(p);
  const conv = await n.hecho('open a conversation', n.ids.agenteCasa, { title: 'hola', ...(give ? { give } : {}) }, p);
  const casa = await escribirPagando(n.eje, { autor: p, sobre: alta, en: '1000000000', t: n.t(), movimientos: [pagaElCoste(p)], payload: [['casa'], ['de p'], [4]] }, claveDe(p).privada);
  /** `quien` (el agente u otro con P de la mirada 3 del alta de p, de origen `origen`) sube su P al alta: una décima. */
  const subir = async (quien = AG, origen = quien, sobre = conv.id) => {
    const q = n.eje.poderSobre(quien, alta); // todo en la mirada 3 del alta de p, donde nació
    assert.equal(await n.aMano(quien, sobre, [['subo']], [P_(alta + '.3', q, quien, null, {}, origen), P_(alta, q / 10, null, quien, {}, origen)]), 'entra', 'subir no pide nada');
    return q / 10;
  };
  /** Baja `cuanto` de su P del alta de p a la casa (una décima más): 'entra' o el motivo del rechazo. */
  const bajar = (cuanto, quien = AG, origen = quien, sobre = conv.id) => n.aMano(quien, sobre, [['bajo']], [P_(alta, cuanto, quien, null, {}, origen), P_(casa.id, cuanto * 1.1, null, quien, {}, origen)]);
  /** El agente lleva su P de la mirada 3 del alta de p a la casa: sube (entra siempre) y baja (lo que diga la regla). */
  const llevarALaCasa = async () => bajar(await subir());
  /** El sí (o el no) del dueño `quien` sobre `X` para `whom`, con la plantilla. */
  const si = (whom, answer = 'yes', X = casa.id, quien = p) => n.hecho('let P come down here', X, { whom, answer }, quien);
  /** Cuántas E puede emitir p sobre su casa, una a una (cada una bloquea 1 de su P sobre la casa, la cuota del tope). */
  const emiteP = async () => {
    let k = 0;
    while (k < 6 && (await n.intentar('issue E tied to X', casa.id, { denomination: 'noche', quantity: 1 }, p)).ok) k++;
    return k;
  };
  return { ...n, p, alta, conv, casa, subir, bajar, llevarALaCasa, si, emiteP };
}

const SIN_SI = /P comes down to a thing of another with its owner's yes/;

/** Quién tiene sí sobre una cosa (it = la cosa): los «let P come down here» vigentes de su dueño, el último por identidad, que dicen «yes». */
const QUIEN_TIENE_SI = '(down it) where nth 1 it2.6.5 = "2100000000" and first it2.3 = first it.3 and "let P come down here" in (payload(it2)).4 and it2 = last ((down it) where nth 1 it3.6.5 = "2100000000" and first it3.3 = first it.3 and "let P come down here" in (payload(it3)).4 and first (payload(it3)).3.1 = first (payload(it2)).3.1) and "yes" in (payload(it2)).1.0 and not ("no" in (payload(it2)).1.0)';

// ================================ HALLAZGOS ================================

// ---------- CH1 (alto): el P de una conversación pesa sobre las cosas de quien la abrió ----------
// Arreglado (VG 17-11, encargo «el P baja con el sí del dueño»): el P que nace de recibir R se queda en la mirada 3 del
// alta de quien dio la R; solo baja a una cosa de otro con el sí de su dueño («let P come down here»), y lo mismo para
// pasar P de una cosa de otro a otro titular (regla «P comes down to a thing of another with its owner's yes», época 0).

test('CH1: control: sin agente de por medio, p emite las 4 plazas de su casa', async () => {
  const { emiteP } = await casaDeP();
  assert.equal(await emiteP(), 4);
});

test('CH1: con la R de abrir la conversación (una unidad), el agente intenta llevar su P a la casa de p, pasárselo a su dueño y que el dueño emita E atada a la casa: sin el sí de p no baja, y p emite sus 4 plazas', async () => {
  const c = await casaDeP();
  assert.equal(c.pSobre(AG, c.p), 10, 'abrir: diez P sobre el alta de p (el P de la R se queda como está)');
  assert.match(await c.llevarALaCasa(), SIN_SI, 'sin sí de p, no baja a la casa');
  assert.equal(c.eje.poderSobre(AG, c.casa.id), 0);
  assert.notEqual(await c.aMano(AG, c.conv.id, [['te lo paso']], [P_(c.casa.id, 1.1, AG, N.operador)]), 'entra', 'no tiene P en la casa que pasar');
  const r = await c.intentar('issue E tied to X', c.casa.id, { denomination: 'noche', quantity: 2, commitment: 1.1 }, N.operador);
  assert.equal(r.ok, false, 'el operador no emite E atada a la casa de p');
  assert.equal(await c.emiteP(), 4, 'p sigue pudiendo emitir sus 4 plazas');
});

test('CH1: con el sí de p que nombra al agente, baja; pasárselo a su dueño pide un sí que nombre al dueño (sin él no entra, con él entra)', async () => {
  const c = await casaDeP();
  await c.si(AG);
  assert.equal(await c.llevarALaCasa(), 'entra', 'con el sí que nombra al agente, baja');
  assert.equal(c.eje.poderSobre(AG, c.casa.id), 1.1);
  const pasar = () => c.aMano(AG, c.conv.id, [['te lo paso']], [P_(c.casa.id, 1.1, AG, N.operador)]);
  assert.match(await pasar(), SIN_SI, 'sin un sí que nombre al dueño, no se lo pasa');
  await c.si(N.operador);
  assert.equal(await pasar(), 'entra', 'con el sí que nombra al dueño, entra');
  assert.equal(c.eje.poderSobre(N.operador, c.casa.id), 1.1);
});

test('CH1: con «le doy 100» al abrir, el agente solo, intentando bloquear en la casa el P de la conversación: sin el sí de p no baja y p emite sus 4 plazas', async () => {
  const c = await casaDeP({ give: 100 });
  assert.equal(c.pSobre(AG, c.p), 1000, '«le doy 100» al abrir: mil P sobre el alta de p');
  const arriba = await c.subir();
  assert.match(await c.bajar(arriba), SIN_SI, 'sin sí, no baja a la casa');
  assert.notEqual(await c.aMano(AG, c.conv.id, [['bloqueo']], [P_(c.casa.id, 110, AG, AG, { estado: 'bloqueo', salida: 'E:' + c.p + '/noche@' + c.casa.id })]), 'entra', 'no tiene P en la casa que bloquear');
  assert.equal(await c.emiteP(), 4, 'p sigue pudiendo emitir sus 4 plazas');
});

test('CH1: retirado el sí («no», del mismo dueño), el paso siguiente no entra y lo ya bajado sigue', async () => {
  const c = await casaDeP({ give: 2 });
  // La lectura de quién tiene sí sobre una cosa (docs/notas/R_EN_CANALES.md): los sí vigentes, el último del dueño por identidad.
  const conSi = () => evaluar(QUIEN_TIENE_SI, new ContextoEje(c.eje, { epoch: c.eje.epoca() }), { sujeto: c.casa.id }).valor.map((r) => c.eje.obtener(r?.id ?? r).payload[3][1][0]);
  assert.deepEqual(conSi(), []);
  await c.si(AG);
  await c.si(N.visita);
  assert.deepEqual(conSi(), [AG, N.visita]);
  const arriba = await c.subir();
  assert.equal(await c.bajar(arriba / 2), 'entra', 'con el sí, baja la mitad');
  const abajo = c.eje.poderSobre(AG, c.casa.id);
  assert.ok(Math.abs(abajo - (arriba / 2) * 1.1) < 1e-9);
  await c.si(AG, 'no');
  assert.deepEqual(conSi(), [N.visita]);
  assert.match(await c.bajar(arriba / 2), SIN_SI, 'retirado el sí, la otra mitad no baja');
  assert.equal(c.eje.poderSobre(AG, c.casa.id), abajo, 'lo ya bajado sigue');
  await c.si(AG, 'yes');
  assert.deepEqual(conSi(), [N.visita, AG]);
  assert.equal(await c.bajar(arriba / 2), 'entra', 'cuenta el último: otro sí lo vuelve a dejar');
});

test('CH1: una persona (no un agente) con P por R recibida de p, igual: sin el sí de p no baja a la casa, con él baja', async () => {
  const c = await casaDeP();
  const q = 'persona-q';
  const altaQ = await c.persona(q);
  await c.hecho('give own R', altaQ, { amount: 2 }, c.p);
  assert.equal(c.pSobre(q, c.p), 20, 'q recibe R de p: veinte P sobre el alta de p');
  // El P en la raíz donde nació (la mirada 3 del alta de p) se queda como está: pasarlo a otro no pide sí.
  assert.equal(await c.aMano(q, altaQ, [['te paso voz']], [P_(c.alta + '.3', 5, q, N.operador, {}, q)]), 'entra', 'en su raíz, sin sí');
  const arriba = await c.subir(q, q, altaQ);
  assert.match(await c.bajar(arriba, q, q, altaQ), SIN_SI, 'sin sí, no baja');
  await c.si(q);
  assert.equal(await c.bajar(arriba, q, q, altaQ), 'entra', 'con el sí que nombra a q, baja');
});

test('CH1: un sí escrito por quien no es dueño de la cosa, o colgado de otra cosa, o que nombra a otro, no vale; tampoco una nota ajena colgada del sí', async () => {
  const c = await casaDeP();
  const delDueno = await c.si(N.visita);
  // El operador copia a mano el sí de p, nombrando al agente, colgado de la casa: no es el dueño.
  const copia = JSON.parse(JSON.stringify(delDueno.payload));
  copia[3] = [[N.operador], [AG]];
  assert.equal(await c.aMano(N.operador, c.casa.id, copia, [], EN_EL_21), 'entra', 'escribirlo, cualquiera lo escribe');
  // p da el sí al agente, pero colgado de su alta (otra cosa).
  await c.si(AG, 'yes', c.alta);
  assert.match(await c.llevarALaCasa(), SIN_SI, 'ni el del operador ni el colgado del alta valen para la casa; el de la visita nombra a otro');
  // Una nota del agente anclada en el 3 del sí de p a la visita, que «dice» yes y nombra al agente: no es el payload del sí.
  assert.equal(await c.aMano(AG, delDueno.id, [['nota'], [['yes']], ['x'], [[AG], [AG]], ['let P come down here']], [], '3000000000'), 'entra');
  assert.match(await c.bajar(c.eje.poderSobre(AG, c.alta)), SIN_SI, 'una nota ajena no da permiso');
});

test('CH1: restaurar, rehacer desde los eventos y reordenar dan los mismos veredictos', async () => {
  const c = await casaDeP();
  const siAG = await c.si(AG);
  const arriba = await c.subir();
  assert.equal(await c.bajar(arriba / 2), 'entra');
  const bajada = c.eje.orden[c.eje.orden.length - 1];
  const foto = (e) => [e.poderSobre(AG, c.casa.id), e.poderSobre(AG, c.alta)];
  const esperada = foto(c.eje);
  assert.deepEqual(foto(await restaurar(serializar(c.eje))), esperada, 'restaurado');
  const desde = await Eje.desde(c.eje.orden.map((id) => c.eje.obtener(id)), { exigirFirmas: true });
  assert.deepEqual(foto(desde), esperada, 'desde sus eventos');
  // Con el paso de bajar delante del sí, el paso no entra (el sí aún no está).
  const sinElSi = c.eje.orden.filter((id) => id !== siAG.id && id !== bajada);
  const { rechazados } = await desde.reordenar([...sinElSi, bajada, siAG.id]);
  assert.deepEqual(rechazados.map((x) => x.id), [bajada], 'reordenado: sin el sí delante, el paso de bajar se rechaza');
  assert.match(rechazados[0].motivo, SIN_SI);
  assert.equal(desde.poderSobre(AG, c.casa.id), 0);
});

// ---------- CH2 (medio, conocido): sin tope por conversación ----------
// Arreglado (VG 17-11, encargo «reservar en lugar de entregar»): los mensajes ya no entregan R al agente, la reservan en
// la conversación («a reserve» de la 0, colgada de ella), y el agente solo gasta de lo reservado en esa conversación.

test('CH2: por Telegram, x escribe 5 veces y el agente solo escribe a y lo que y reservó en su conversación (la R del servicio de una conversación no se gasta en otra)', async () => {
  const n = await nodo();
  const conv = {};
  for (const q of ['x', 'y']) {
    await n.hecho('register an interlocutor', n.ids.altaServicio, { thing: 'inter-' + q, channel: 'telegram', fingerprint: createHash('sha256').update('revision/' + q).digest('hex') }, N.servicio);
    conv[q] = (await n.hecho('open a conversation', n.ids.agenteCasa, { interlocutor: 'inter-' + q, title: q }, N.servicio)).id;
  }
  for (let k = 0; k < 5; k++) await n.meter(conv.x, N.servicio, { channel: 'telegram', text: 'x ' + k });
  await n.meter(conv.y, N.servicio, { channel: 'telegram', text: 'y 0' });
  assert.deepEqual([cupo(n.eje, conv.x), cupo(n.eje, conv.y)], [5, 1]);
  let aY = 0;
  while (aY < 20 && (await n.intentar('message out', conv.y, { text: 'a y ' + aY }, AG)).ok) aY++;
  assert.equal(aY, 1, 'a y, lo que reservó su conversación (abrir no cuenta: la R de abrir se entrega, no se reserva)');
  assert.equal(cupo(n.eje, conv.x), 5, 'lo de x sigue en la conversación de x');
});

test('el tope por conversación: lo reservado en diez conversaciones no se gasta en una; el agente con cupo 0 no escribe; tampoco a mano', async () => {
  const n = await nodo();
  // El operador da al servicio R suya para el precio de abrir diez conversaciones.
  await n.hecho('admit someone', n.eje.alta(N.operador).id, { whom: N.servicio, amount: 10 }, N.operador);
  const convs = [];
  for (let k = 0; k < 10; k++) {
    await n.hecho('register an interlocutor', n.ids.altaServicio, { thing: 'inter-' + k, channel: 'telegram', fingerprint: createHash('sha256').update('revision/diez/' + k).digest('hex') }, N.servicio);
    const c = (await n.hecho('open a conversation', n.ids.agenteCasa, { interlocutor: 'inter-' + k }, N.servicio)).id;
    await n.meter(c, N.servicio, { channel: 'telegram', text: 'hola ' + k });
    convs.push(c);
  }
  assert.deepEqual(convs.map((c) => cupo(n.eje, c)), Array(10).fill(1));
  const una = convs[0];
  assert.ok((await n.intentar('message out', una, { text: 'una' }, AG)).ok);
  assert.equal((await n.intentar('message out', una, { text: 'otra' }, AG)).ok, false, 'cupo 0 en esa conversación: no escribe, aunque haya nueve más en otras');
  // A mano, gastando lo reservado en otra conversación: no entra.
  const otra = reservaPara(n.eje, convs[1], N.servicio, AG);
  const payload = ['message out', [['telegram'], ['inter-0'], ['a mano']]];
  assert.match(await n.aMano(AG, una, payload, [{ token: 'R', emisor: N.servicio, cantidad: 1, de: N.servicio, a: N.servicio, estado: 'liberacion', salida: otra.id }], '3000000000'), /who writes a message/);
  assert.deepEqual(convs.map((c) => cupo(n.eje, c)), [0, ...Array(9).fill(1)]);
});

// ================================ LA PREGUNTA DE VG: EL P, MEDIDO ================================

test('dato: el P del agente sobre quien le da R lo da abrir (diez por unidad) y no crece con los mensajes, que reservan y no entregan; «le doy 1000» al abrir sí da diez mil (abrir sigue entregando); muchas personas, cada una en su alta', async () => {
  const n = await nodo();
  const p = 'persona-con-r';
  await n.persona(p);
  const conv = await n.hecho('open a conversation', n.ids.agenteCasa, {}, p);
  assert.equal(n.pSobre(AG, p), 10, 'abrir');
  for (let k = 0; k < 10; k++) {
    await n.meter(conv.id, p, { text: 'p ' + k });
    await n.hecho('message out', conv.id, { channel: 'house', text: 'r ' + k }, AG);
  }
  assert.equal(n.pSobre(AG, p), 10, 'diez vueltas: no crece');
  // Retiene sin contestar: cada «message in» reserva una más en la conversación, no se la da.
  for (let k = 0; k < 3; k++) await n.meter(conv.id, p, { text: 'sin respuesta ' + k });
  assert.deepEqual([n.eje.saldo(AG, 'R:' + p), cupo(n.eje, conv.id)], [1, 3]);
  assert.equal(n.pSobre(AG, p), 10, 'tres reservadas: sigue en diez');
  await n.meter(conv.id, p, { text: 'le doy 3', give: 3 });
  assert.equal(n.pSobre(AG, p), 10, '«le doy 3» no da más P');
  // «le doy 1000» al abrir.
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

test('dato (CH4, cerrado): por Telegram el P del agente sobre el servicio ya no crece con el tráfico: los mensajes que entran reservan en su conversación', async () => {
  const n = await nodo();
  const s = () => n.pSobre(AG, N.servicio);
  const antes = [n.eje.saldo(AG, 'R:' + N.servicio), s()];
  for (let k = 0; k < 8; k++) await n.meter(n.ids.conversacionTelegram, N.servicio, { channel: 'telegram', text: 'm ' + k });
  assert.deepEqual([n.eje.saldo(AG, 'R:' + N.servicio), s()], antes, 'ni R ni P de más');
  assert.equal(cupo(n.eje, n.ids.conversacionTelegram), 8);
});

test('dato: agente con agente, lo que cada lado reserva para el otro no le llega ni da P; el dueño que escribe con «give» reserva igual, y sin una reserva que lo nombre no escribe', async () => {
  const n = await nodo();
  const B = 'agente-de-la-visita';
  const K = claveDe(B);
  const alta = await escribirPagando(n.eje, { autor: N.visita, sobre: n.eje.alta(N.visita).id, en: '1400000000', t: n.t(), movimientos: [pagaElCoste(N.visita), { token: 'T', escala: 'minuto', cantidad: 600, de: N.visita, a: B }], payload: [B, 600, 'all announced movements happened', [N.visita, B], 'register a thing', 'agent'], contexto: { claves: { [B]: K.publica } } }, CLAVES.visita.privada, { [B]: K.privada });
  await n.hecho('declare agent', alta.id, {}, N.visita);
  await n.hecho('admit someone', n.eje.alta(N.operador).id, { whom: AG, amount: 3 }, N.operador);
  await n.hecho('admit someone', n.eje.alta(N.visita).id, { whom: B, amount: 6 }, N.visita);
  await n.hecho('admit someone', n.eje.alta(N.operador).id, { whom: B, amount: 2 }, N.operador);
  const conv = await n.hecho('open a conversation as an agent', n.ids.agenteCasa, {}, B);
  const delOperador = await n.hecho(RESERVA, conv.id, { spender: B, modes: 'return' }, N.operador);
  await n.hecho('fill a reserve', delOperador.id, { amount: 2 }, N.operador);
  const antes = [n.pSobre(B, N.operador), n.eje.saldo(B, 'R:' + N.operador)];
  for (let k = 0; k < 3; k++) {
    await n.meter(conv.id, B, { channel: 'house', text: 'B ' + k, esAgente: true });
    await n.meter(conv.id, AG, { text: 'A ' + k, give: 1 });
  }
  assert.deepEqual([n.pSobre(B, N.operador), n.eje.saldo(B, 'R:' + N.operador)], antes, 'la R del operador que el agente reserva para B no le llega: ni R ni P');
  // El dueño escribe con «give 10»: sin una reserva de la conversación que lo nombre (para gastar) no entra.
  assert.equal((await n.intentarMeter(conv.id, N.operador, { text: 'escribe el dueño', give: 10 })).ok, false);
  // Con ella (B reserva para el operador y la llena con R de su dueño), entra, y lo que da lo reserva para B: B no gana P.
  const paraElDueno = await n.hecho(RESERVA, conv.id, { spender: N.operador, modes: 'return' }, B);
  await n.hecho('fill a reserve', paraElDueno.id, { amount: 1, series: 'R:' + N.visita }, B);
  const sale = await n.meter(conv.id, N.operador, { text: 'escribe el dueño', give: 10 });
  assert.ok(sale.movimientos.some((m) => m.token === 'R' && m.emisor === N.operador && m.estado === 'bloqueo' && m.cantidad === 10));
  assert.deepEqual([n.pSobre(B, N.operador), n.eje.saldo(B, 'R:' + N.operador)], antes, '«le doy 10» del dueño no da P al otro agente');
  assert.equal(cupo(n.eje, conv.id, B), 12, 'los diez del dueño en su reserva para B, más los dos que el agente dejó reservados');
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
  await c.si(AG); // con el sí de p (encargo «el P baja con el sí del dueño»): el P de la conversación, en la casa
  assert.equal(await c.llevarALaCasa(), 'entra');
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
    // Lo que entra reserva (la primera vez, con la reserva de p delante: registrosParaUnMensaje); lo que sale la gasta.
    for (const r of registrosParaUnMensaje(n.eje, conv.id, p, { text: 'p ' + k, ...(k % 7 === 3 ? { give: 3 } : {}) })) mios.push((await n.hecho(r.plantilla, conv.id, r.params, p)).id);
    mios.push((await n.hecho('message out', conv.id, { channel: 'house', text: 'r ' + k }, AG)).id);
    if (k % 7 === 3) for (let j = 0; j < 2; j++) mios.push((await n.hecho('message out', conv.id, { channel: 'house', text: 'extra ' + k + '.' + j }, AG)).id);
  }
  assert.equal(cupo(n.eje, conv.id), 0);
  const foto = (e) => ({ r: [e.saldo(AG, 'R:' + p), e.saldo(p, 'R:' + p), e.bloqueado(p, 'R:' + p)], p: e.poderSobre(AG, e.alta(p).id), registros: e.orden.length, cupo: cupo(e, conv.id) });
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
