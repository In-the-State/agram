// Revisión de seguridad del carril «reserva y sí del dueño» (Core AGRAM 17-11; arreglos de la revisión). Un caso por
// hallazgo, que reproduce el ataque y afirma el comportamiento bueno tras el arreglo. Ejes de demostración en memoria
// (identidades inventadas: ana es la dueña del libro y de la casa; bea, cris, dani y zoe, terceras) y, para lo de las
// conversaciones, el nodo de ejemplo de la época state.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Eje } from '../src/eje.js';
import * as A from '../src/acciones.js';
import { firmar } from '../src/autoridad.js';
import { escribirPagando, pagaElCoste } from '../ejemplos/ikisai/coste.mjs';
import { ejemploNodo, N, CLAVES, hora, claveDePrueba } from '../ejemplos/state/nodo.mjs';
import { registrosParaUnMensaje, cupo, reservaPara, RESERVA } from '../datos/epocas/state/ayuda.mjs';

const T0 = '2026-11-17T08:00:00Z';
const SIN_SI = /P comes down to a thing of another with its owner's yes/;

/** El libro de ana (demostración) con bea, cris, dani y zoe invitados; ana con su R acuñada y su casa de 4 plazas. */
async function mundo() {
  const eje = await Eje.genesis({ identidad: 'ana', foco: ['ana'], t: T0, demostracion: true });
  let s = 0;
  const reloj = () => new Date(Date.parse(T0) + ++s * 1000).toISOString().replace('.000Z', 'Z');
  for (const n of ['bea', 'cris', 'dani', 'zoe']) await eje.aceptar(await eje.invitar({ autor: 'ana', invitado: n, t: reloj() }), {}, { t: reloj() });
  const intenta = async (cual, params, yo = 'ana', t = reloj()) => {
    const r = await A.transaccion(eje, cual, params, yo, { t });
    if (!r.ok) return { motivos: r.motivos, texto: JSON.stringify(r.motivos.map((x) => x.mensaje ?? x.texto)) };
    try {
      return { ev: await eje.anadir(r.evento) };
    } catch (e) {
      return { motivos: e.motivos ?? [{ texto: e.message }], texto: e.message };
    }
  };
  const hecho = async (cual, params, yo = 'ana', t) => {
    const r = await intenta(cual, params, yo, t);
    assert.ok(r.ev, cual + ' de ' + yo + ': ' + r.texto);
    return r.ev;
  };
  /** Un registro a mano, pagando su coste: el evento, o el mensaje del rechazo. */
  const aMano = (autor, sobre, movimientos = [], { en = '1000000000', t = reloj(), payload = [[autor + ' ' + s]] } = {}) =>
    escribirPagando(eje, { autor, sobre, en, t, movimientos: [pagaElCoste(autor), ...movimientos], payload }).then((e) => e, (e) => e.message);
  const altaAna = eje.alta('ana').id;
  await aMano('ana', altaAna, [{ token: 'R', emisor: 'ana', cantidad: 10, de: null, a: 'ana' }], { payload: [['mi R']] });
  const casa = await aMano('ana', altaAna, [], { payload: [['casa'], ['de ana'], [4]] });
  /** Cuántas E de una noche puede emitir `quien` sobre la casa, una a una. */
  const emite = async (quien) => {
    let k = 0;
    while (k < 6 && (await intenta('issue E tied to X', { X: casa.id, denomination: 'noche', quantity: 1 }, quien)).ev) k++;
    return k;
  };
  return { eje, reloj, intenta, hecho, aMano, casa, emite };
}

const P_ = (ambito, cantidad, de, a, origen) => ({ token: 'P', ambito, origen, cantidad, de, a });

// ---------- 1 (grave): el P de otro origen ocupaba la capacidad de la casa ----------
// Cerrado en la cuota del tope (src/condiciones/tope.js, topeYCuota): en la cuota solo cuenta el P comprometido cuyo
// origen es quien escribió el registro que declara la capacidad. El P de otro origen (el de escribir un hijo, conseguir E,
// recibir R o subir) es voz: ni da cuota ni diluye la de nadie. Subir sigue siendo libre (VG). VG 17-11: sí, tras el hallazgo 1 de la revisión de la reserva.

const serieDe = (emisor, registro) => 'E:' + emisor + '/noche@' + registro;
const conMiR = (m, quien) => m.aMano(quien, m.eje.alta(quien).id, [{ token: 'R', emisor: quien, cantidad: 1, de: null, a: quien }], { payload: [['mi R']] });

test('1a: bea cuelga un registro de la casa de ana, sube a la casa los diez P que le nacen (subir es libre) y no emite ninguna plaza: su P no es de origen ana; ana emite sus cuatro', async () => {
  const m = await mundo();
  const hijo = await m.aMano('bea', m.casa.id, [], { payload: [['un hijo de la casa']] });
  assert.equal(m.eje.poderSobre('bea', hijo.id), 10, 'escribir un registro da diez P en él');
  const sube = await m.aMano('bea', hijo.id, [P_(hijo.id, 10, 'bea', null, 'bea'), P_(m.casa.id, 1, null, 'bea', 'bea')]);
  assert.ok(sube.id, 'subir no pide nada: ' + String(sube));
  assert.equal(m.eje.poderSobre('bea', m.casa.id), 1);
  await conMiR(m, 'bea');
  assert.equal(await m.emite('bea'), 0, 'bea no emite E atada a la casa: su P (de origen bea) no da cuota');
  // Ni a mano, bloqueando su P de la casa con la salida de su serie.
  const aMano = await m.aMano('bea', m.casa.id, [{ ...P_(m.casa.id, 1, 'bea', 'bea', 'bea'), estado: 'bloqueo', salida: serieDe('bea', m.casa.id) }, { token: 'E', emisor: 'bea', denominacion: 'noche', registro: m.casa.id, cantidad: 1, de: null, a: 'bea' }]);
  assert.match(String(aMano), /cuota de E:bea\/noche@.* origen ana/);
  assert.equal(await m.emite('ana'), 4, 'ana emite sus cuatro plazas');
});

test('1a: bea emite sobre su propio hijo de la casa, bloqueando los diez P que le nacen en él con la salida de su serie: la casa no le da cuota y ana emite sus cuatro', async () => {
  for (const capacidadDelHijo of [false, true]) {
    const m = await mundo();
    const hijo = await m.aMano('bea', m.casa.id, [], { payload: capacidadDelHijo ? [['un hijo'], ['de bea'], [4]] : [['un hijo']] });
    await conMiR(m, 'bea');
    const emiteEnElHijo = (cantidad) => m.aMano('bea', hijo.id, [{ ...P_(hijo.id, 10, 'bea', 'bea', 'bea'), estado: 'bloqueo', salida: serieDe('bea', hijo.id) }, { token: 'E', emisor: 'bea', denominacion: 'noche', registro: hijo.id, cantidad, de: null, a: 'bea' }]);
    assert.match(String(await emiteEnElHijo(4)), /cuota de E:bea\/noche@.* en el registro .* origen ana/, capacidadDelHijo ? 'con capacidad en el hijo' : 'sin capacidad en el hijo');
    assert.equal(await m.emite('ana'), 4, 'ana emite sus cuatro plazas');
  }
});

test('1a: de una mirada al registro entero del mismo registro sigue sin pedir nada (r.d → r)', async () => {
  const m = await mundo();
  // bea recibe R de ana: diez P en la mirada 3 del alta de ana; subirlos al alta entera es r.3 → r.
  await m.hecho('give own R', { X: m.eje.alta('bea').id, amount: 1 });
  const alta = m.eje.alta('ana').id;
  const q = m.eje.poderSobre('bea', alta);
  assert.equal(q, 20, 'la R de su invitación y la de «give own R»: veinte P');
  const r = await m.aMano('bea', m.eje.alta('bea').id, [P_(alta + '.3', q, 'bea', null, 'bea'), P_(alta, q / 10, null, 'bea', 'bea')]);
  assert.ok(r.id, String(r));
});

test('1b: quien compra una plaza de la casa (diez P en su mirada 1, de origen suyo) no emite E atada a la casa; ana emite las que le quedan', async () => {
  const m = await mundo();
  assert.ok(await m.hecho('issue E tied to X', { X: m.casa.id, denomination: 'noche', quantity: 1 }));
  assert.ok((await m.aMano('ana', m.casa.id, [{ token: 'E', emisor: 'ana', denominacion: 'noche', registro: m.casa.id, cantidad: 1, de: 'ana', a: 'zoe' }])).id, 'ana le vende una plaza a zoe');
  assert.equal(m.eje.poderSobre('zoe', m.casa.id), 10, 'recibir la E de su emisor da diez P en la mirada 1 de la casa');
  await conMiR(m, 'zoe');
  assert.equal(await m.emite('zoe'), 0, 'zoe no emite: su P es de origen zoe');
  assert.equal(await m.emite('ana'), 3, 'ana emite las tres que le quedan');
});

test('1, el caso bueno: ana pasa P suyo de la casa a bea (el origen sigue siendo ana) y bea emite en proporción con la plantilla', async () => {
  const m = await mundo();
  const k = 'P:' + m.casa.id + '/ana';
  assert.equal(m.eje.saldo('ana', k), 10, 'ana tiene diez P sobre la casa, de origen ana');
  assert.ok((await m.aMano('ana', m.casa.id, [P_(m.casa.id, 5, 'ana', 'bea', 'ana')])).id, 'ana le pasa cinco');
  await conMiR(m, 'bea');
  // bea compromete uno de los suyos de origen ana (la plantilla elige ese) y ana uno suyo: dos de cuatro, la mitad.
  const r = await m.intenta('issue E tied to X', { X: m.casa.id, denomination: 'noche', quantity: 1 }, 'bea');
  assert.ok(r.ev, r.texto);
  assert.ok(r.ev.movimientos.some((x) => x.token === 'P' && x.estado === 'bloqueo' && x.origen === 'ana'), 'bloquea P de origen ana: ' + JSON.stringify(r.ev.movimientos));
  // ana emite las tres que quedan (cada una compromete una más: 3 suyos frente a 1 de bea, cuota 3 de 4), y la casa está llena.
  assert.equal(await m.emite('ana'), 3);
  assert.equal(await m.emite('bea'), 0, 'tope de la casa: cuatro');
  // Sin lo que ana le pasó, bea no habría emitido: el P suyo de origen bea no cuenta (1a).
});

test('1: no se fabrica P de origen ajeno: escribir un registro, conseguir E, recibir R o reposicionar dejan a bea con P de origen bea; un paso que cambia el origen no entra', async () => {
  const m = await mundo();
  const hijo = await m.aMano('bea', m.casa.id, [], { payload: [['un hijo']] });
  await m.hecho('issue E tied to X', { X: m.casa.id, denomination: 'noche', quantity: 1 });
  await m.aMano('ana', m.casa.id, [{ token: 'E', emisor: 'ana', denominacion: 'noche', registro: m.casa.id, cantidad: 1, de: 'ana', a: 'bea' }]);
  await m.hecho('give own R', { X: m.eje.alta('bea').id, amount: 1 });
  await m.aMano('bea', hijo.id, [P_(hijo.id, 5, 'bea', null, 'bea'), P_(m.casa.id, 0.5, null, 'bea', 'bea')]);
  const origenes = new Set(m.eje.poderes('bea').map((x) => x.origen));
  assert.deepEqual([...origenes], ['bea'], 'todo su P es de origen bea: ' + JSON.stringify(m.eje.poderes('bea')));
  // Reposicionar cambiando el origen (quema suyo y acuña «de ana»): no entra.
  const cambia = await m.aMano('bea', hijo.id, [P_(hijo.id, 5, 'bea', null, 'bea'), P_(m.casa.id, 0.5, null, 'bea', 'ana')]);
  assert.match(String(cambia), /P is repositioned one step at a time/);
  // Ni mover P de origen ana que no tiene.
  assert.ok(!(await m.aMano('bea', m.casa.id, [P_(m.casa.id, 1, 'ana', 'bea', 'ana')])).id, 'nadie mueve lo de ana');
  assert.equal(m.eje.saldo('bea', 'P:' + m.casa.id + '/ana'), 0);
});

test('1c (lo decidido por VG, V6): quien cuelga un registro de una cuenta ajena gana P sobre ella subiendo y ordena; el titular aprueba en su banco', async () => {
  const m = await mundo();
  const cuenta = await m.hecho('connect an account', { X: m.eje.alta('ana').id, name: 'cuenta de ana', bank: 'Banco de Ejemplo' });
  const hijo = await m.aMano('dani', cuenta.id, [], { payload: [['me cuelgo']] });
  assert.equal(m.eje.poderSobre('dani', hijo.id), 10);
  assert.ok((await m.aMano('dani', hijo.id, [P_(hijo.id, 10, 'dani', null, 'dani'), P_(cuenta.id, 1, null, 'dani', 'dani')])).id, 'subir es libre');
  assert.equal(m.eje.poderSobre('dani', cuenta.id), 1);
  const orden = await m.aMano('dani', cuenta.id, [], { en: '4000000000', payload: [['orden'], ['paga 100']] });
  assert.ok(orden.id, 'con P sobre la cuenta, ordena (docs/notas/CUENTA_BANCO.md, punto 4): ' + String(orden));
});


// ---------- 2 (grave): pagar a la identidad «-» ----------

test('2: una reserva sin lista de a quién pagar no paga a nadie, tampoco a una identidad llamada «-»; la plantilla no deja «pay» sin lista', async () => {
  const m = await mundo();
  const uso = await m.aMano('ana', m.eje.alta('ana').id, [], { payload: [['uso']] });
  const sinLista = await m.intenta(RESERVA, { X: uso.id, spender: 'bea', modes: ['return', 'pay'], until: '2026-11-18T00:00:00Z' });
  assert.ok(!sinLista.ev, '«pay» sin a quién pagar: la plantilla lo rechaza');
  // A mano (lo que la plantilla ponía): «-» en el 1.1.
  const r = await m.aMano('ana', uso.id, [], { payload: [['reserva'], [['return', 'pay'], ['-'], ['2026-11-18T00:00:00Z']], ['all announced movements happened'], [['ana'], ['bea']], ['a reserve']] });
  assert.ok(r.id, String(r));
  assert.ok((await m.aMano('ana', uso.id, [{ token: 'R', emisor: 'ana', cantidad: 2, de: 'ana', a: 'ana', estado: 'bloqueo', salida: r.id }])).id);
  // Una identidad llamada «-»: o no se da de alta, o no se le paga.
  const alta = await m.eje.aceptar(await m.eje.invitar({ autor: 'ana', invitado: '-', t: m.reloj() }), {}, { t: m.reloj() }).then(() => 'entra', (e) => e.message);
  const paga = await m.aMano('bea', uso.id, [{ token: 'R', emisor: 'ana', cantidad: 1, de: 'ana', a: '-', salida: r.id }]);
  assert.ok(!paga.id, 'no se paga a «-»: ' + alta);
  assert.equal(m.eje.bloqueado('ana', 'R:ana', r.id), 2);
});

// ---------- 3 (medio): el «hasta cuándo» se saltaba antedatando ----------

test('3: con el reloj del libro pasado el «hasta cuándo», un gasto antedatado no entra', async () => {
  const m = await mundo();
  const uso = await m.aMano('ana', m.eje.alta('ana').id, [], { payload: [['uso']] });
  const r = await m.hecho(RESERVA, { X: uso.id, spender: 'bea', modes: 'return', until: '2026-11-17T08:01:00Z' });
  assert.ok((await m.aMano('ana', uso.id, [{ token: 'R', emisor: 'ana', cantidad: 2, de: 'ana', a: 'ana', estado: 'bloqueo', salida: r.id }])).id);
  // El libro llega a las 10:00 (un registro de cris).
  assert.ok((await m.aMano('cris', m.eje.alta('cris').id, [], { t: '2026-11-17T10:00:00Z', payload: [['a las diez']] })).id);
  const antedatado = await m.aMano('bea', uso.id, [{ token: 'R', emisor: 'ana', cantidad: 1, de: 'ana', a: 'ana', estado: 'liberacion', salida: r.id }], { t: '2026-11-17T08:00:59Z' });
  assert.match(String(antedatado), /a reserve is spent as it says/);
  assert.equal(m.eje.bloqueado('ana', 'R:ana', r.id), 2);
});

// ---------- 4 (medio): un tercero bloqueaba el sí del dueño ----------

test('4: dos registros colgados de la casa con un 4 de 900 textos no dejan PENDIENTE el paso con sí', async () => {
  const m = await mundo();
  const mucho = Array.from({ length: 900 }, (_, k) => 't' + k);
  assert.ok((await m.aMano('cris', m.casa.id, [], { en: '2100000000', payload: [['ruido'], ['x'], ['y'], ['z'], mucho] })).id);
  assert.ok((await m.aMano('dani', m.casa.id, [], { en: '3000000000', payload: [['ruido'], ['x'], ['y'], ['z'], mucho] })).id);
  await m.hecho('let P come down here', { X: m.casa.id, whom: 'bea' });
  // bea tiene diez P en la mirada 3 del alta de ana (la R de su invitación); los lleva al alta y los baja a la casa.
  const alta = m.eje.alta('ana').id;
  const q = m.eje.poderSobre('bea', alta);
  assert.ok((await m.aMano('bea', m.eje.alta('bea').id, [P_(alta + '.3', q, 'bea', null, 'bea'), P_(alta, q / 10, null, 'bea', 'bea')])).id);
  const baja = await m.aMano('bea', m.eje.alta('bea').id, [P_(alta, q / 10, 'bea', null, 'bea'), P_(m.casa.id, (q / 10) * 1.1, null, 'bea', 'bea')]);
  assert.ok(baja.id, 'con el sí, entra: ' + String(baja).slice(0, 300));
});

// ---------- 5 a 7: el cupo de una conversación lo da el otro lado ----------

const claveDe = (q) => CLAVES[q] ?? claveDePrueba(q);
async function nodo() {
  const { eje, ids } = await ejemploNodo();
  let minuto = 6000;
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
  const persona = async (quien, cuanta = 2) => {
    const K = claveDe(quien);
    await eje.aceptar(await eje.invitar({ autor: N.operador, invitado: quien, clave: K.publica, da: [{ token: 'R', cantidad: cuanta }], t: t(), privada: CLAVES.operador.privada }), K, { t: t() });
  };
  const meter = async (conv, quien, params) => {
    let ev;
    for (const r of registrosParaUnMensaje(eje, conv, quien, params)) ev = await hecho(r.plantilla, conv, r.params, quien);
    return ev;
  };
  const aMano = (autor, sobre, payload, movimientos, en) => escribirPagando(eje, { autor, sobre, en, t: t(), movimientos: [pagaElCoste(autor), ...movimientos], payload }, claveDe(autor).privada).then(() => 'entra', (e) => e.message);
  return { eje, ids, intentar, hecho, persona, meter, aMano };
}

test('5: un tercero con R de p no da cupo al agente en la conversación de p; el agente no escribe a p sin que p haya escrito', async () => {
  const n = await nodo();
  const AG = N.agenteCasa;
  await n.persona('p');
  await n.persona('q');
  const conv = await n.hecho('open a conversation', n.ids.agenteCasa, {}, 'p');
  // q tiene R de p (p se la da) y escribe una reserva para el agente en la conversación de p, y la llena.
  await n.hecho('give own R', n.eje.alta('q').id, { amount: 2 }, 'p');
  const deQ = await n.hecho(RESERVA, conv.id, { spender: AG, modes: 'return' }, 'q');
  await n.hecho('fill a reserve', deQ.id, { amount: 2, series: 'R:p' }, 'q');
  assert.equal(cupo(n.eje, conv.id), 0, 'el cupo del agente es lo que reserva el otro lado: p');
  assert.equal((await n.intentar('message out', conv.id, { channel: 'house', text: 'te escribo yo' }, AG)).ok, false, 'con la plantilla, no');
  const aMano = await n.aMano(AG, conv.id, ['message out', [['house'], ['p'], ['a mano']]], [{ token: 'R', emisor: 'p', cantidad: 1, de: 'q', a: 'q', estado: 'liberacion', salida: deQ.id }], '3000000000');
  assert.match(aMano, /who writes a message/, 'a mano, tampoco');
});

test('6: una contestación gasta exactamente una unidad (no se puede vaciar la reserva de una vez)', async () => {
  const n = await nodo();
  const AG = N.agenteCasa;
  await n.persona('p');
  const conv = await n.hecho('open a conversation', n.ids.agenteCasa, {}, 'p');
  await n.meter(conv.id, 'p', { text: 'hola', give: 3 });
  const suya = reservaPara(n.eje, conv.id, 'p', AG);
  const dos = await n.aMano(AG, conv.id, ['message out', [['house'], ['p'], ['dos de golpe']]], [{ token: 'R', emisor: 'p', cantidad: 2, de: 'p', a: 'p', estado: 'liberacion', salida: suya.id }], '3000000000');
  assert.match(dos, /who writes a message/);
  assert.equal(cupo(n.eje, conv.id), 3);
});

test('7: la plantilla «message out» gasta de la reserva del otro lado aunque haya antes una de un tercero que nombre al agente', async () => {
  const n = await nodo();
  const AG = N.agenteCasa;
  await n.persona('p');
  await n.persona('q');
  const conv = await n.hecho('open a conversation', n.ids.agenteCasa, {}, 'p');
  await n.hecho('give own R', n.eje.alta('q').id, { amount: 1 }, 'p');
  const deQ = await n.hecho(RESERVA, conv.id, { spender: AG, modes: 'return' }, 'q');
  await n.hecho('fill a reserve', deQ.id, { amount: 1, series: 'R:p' }, 'q');
  await n.meter(conv.id, 'p', { text: 'hola' });
  const sale = await n.hecho('message out', conv.id, { text: 'hola, p' }, AG);
  const suya = reservaPara(n.eje, conv.id, 'p', AG);
  assert.deepEqual(sale.movimientos.filter((x) => x.token === 'R').map((x) => [x.de, x.salida]), [['p', suya.id]]);
});
