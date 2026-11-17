// Reservar en lugar de entregar (encargo «reservar en lugar de entregar», VG 17-11; docs/notas/RESERVA.md): la pieza
// genérica de la época 0. La plantilla «a reserve», la tercera excepción de «nobody moves tokens of others» (suelo, y su
// repetición en src/validez.js) y la guarda «a reserve is spent as it says» (suelo). Ejes de demostración en memoria,
// identidades inventadas: ana reserva, bea gasta, cris y dani son terceros.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Eje } from '../src/eje.js';
import * as A from '../src/acciones.js';
import { EPOCA_0_BTML, idDeRegistro } from '../src/epocas.js';
import { validez } from '../src/validez.js';
import { serializar, restaurar } from '../src/persistencia.js';
import { saldosDe } from '../datos/epocas/puente.mjs';
import { excepcionDeLaReserva, formulaDeLaGuarda, conLaExcepcion, ARCHIVO_DEL_SUELO, ARCHIVO_DE_LA_GUARDA, REGLA_DE_LA_GUARDA } from '../datos/epocas/reserva.mjs';
import { escribirPagando, pagaElCoste } from '../ejemplos/ikisai/coste.mjs';

const T0 = '2026-11-17T08:00:00Z';
const ID0 = EPOCA_0_BTML.id;
const M0 = { ref: ID0 };
const copia = (x) => JSON.parse(JSON.stringify(x));
const regla0 = (nombre) => EPOCA_0_BTML.reglasConId.find((x) => x.regla[0][0] === nombre).regla;
const AJENO = /nobody moves tokens of others/;
const GUARDA = /a reserve is spent as it says/;

/** Un movimiento de R de ana (`m`: bloqueo, liberación, quema o paso a otro, con la salida que se diga). */
const R = (cantidad, de, a, extra = {}) => ({ token: 'R', emisor: 'ana', cantidad, de, a, ...extra });
const bloquea = (cantidad, salida, de = 'ana') => R(cantidad, de, de, { estado: 'bloqueo', salida });
const libera = (cantidad, salida, de = 'ana') => R(cantidad, de, de, { estado: 'liberacion', salida });
const quema = (cantidad, de = 'ana') => R(cantidad, de, null);
const paga = (cantidad, a, salida, de = 'ana') => R(cantidad, de, a, { salida });

/**
 * Un libro de ana con bea, cris y dani invitados (la época hija de la 0 con nivel pedido 0, para poder poner cambios en
 * vigor); un registro de ana, «uso», donde cuelgan las reservas; y ana con 10 R suyas en mano.
 */
async function mundo() {
  const raiz = [['reservas'], M0, M0, M0, M0, M0, [['hija de prueba'], ['hereda'], [ID0]], [M0, M0, M0, M0, M0, M0, M0, M0, M0, [M0, M0, M0, [0], [0]]]];
  const eje = await Eje.genesis({ identidad: 'ana', foco: ['ana'], t: T0, demostracion: true, epoca: { raiz, registros: [] } });
  let s = 0;
  const reloj = () => new Date(Date.parse(T0) + ++s * 1000).toISOString().replace('.000Z', 'Z');
  for (const n of ['bea', 'cris', 'dani']) await eje.aceptar(await eje.invitar({ autor: 'ana', invitado: n, t: reloj() }), {}, { t: reloj() });
  const intenta = async (cual, params, yo = 'ana') => {
    const r = await A.transaccion(eje, cual, params, yo, { t: reloj() });
    if (!r.ok) return { motivos: r.motivos };
    try {
      return { ev: await eje.anadir(r.evento) };
    } catch (e) {
      return { motivos: e.motivos ?? [{ texto: e.message }] };
    }
  };
  const hecho = async (cual, params, yo = 'ana') => {
    const r = await intenta(cual, params, yo);
    assert.ok(r.ev, cual + ' de ' + yo + ': ' + JSON.stringify(r.motivos?.map((x) => x.mensaje ?? x.texto)));
    return r.ev;
  };
  /** Un registro a mano, pagando su coste: 'entra' o el mensaje del rechazo. */
  const aMano = (autor, movimientos, { sobre = uso.id, t = reloj(), payload = [[autor + ' ' + s]] } = {}) =>
    escribirPagando(eje, { autor, sobre, en: '1000000000', t, movimientos: [pagaElCoste(autor), ...movimientos], payload }).then(() => 'entra', (e) => e.message);
  const uso = await escribirPagando(eje, { autor: 'ana', sobre: eje.alta('ana').id, en: '1000000000', t: reloj(), movimientos: [pagaElCoste('ana'), R(10, null, 'ana')], payload: [['uso']] });
  /** Una reserva de ana (o de `quien`) para `spender`, con la plantilla. */
  const reserva = (params = {}, quien = 'ana') => hecho('a reserve', { X: uso.id, spender: 'bea', modes: 'return', ...params }, quien);
  const hay = (id, k = 'R:ana') => [eje.saldo(id, k), eje.bloqueado(id, k)];
  return { eje, reloj, intenta, hecho, aMano, uso, reserva, hay };
}

test('la reserva: su payload (quién gasta, de qué modo, a quién paga, hasta cuándo), anclada en el uso, sin mover nada; y el archivo de las fórmulas al día', async () => {
  const m = await mundo();
  const r = await m.reserva({ modes: ['return', 'pay'], payees: ['cris', 'dani'], until: '2026-11-18T00:00:00Z' });
  assert.deepEqual(r.payload.slice(1), [[['return', 'pay'], ['cris', 'dani'], ['2026-11-18T00:00:00Z']], ['all announced movements happened'], [['ana'], ['bea']], ['a reserve']]);
  assert.deepEqual([r.sobre, r.en], [m.uso.id, '1000000000']);
  assert.deepEqual(r.movimientos.map((x) => x.token + ' ' + (x.a === null ? 'quema' : 'a ' + x.a)), ['T quema'], 'solo el coste de escribir');
  const sinHasta = await m.reserva({ modes: 'pay', payees: 'cris' });
  assert.deepEqual(sinHasta.payload[1], [['pay'], ['cris']]);
  const soloHasta = await m.reserva({ until: '2026-11-18T00:00:00Z' });
  assert.deepEqual(soloHasta.payload[1], [['return'], ['-'], ['2026-11-18T00:00:00Z']], 'sin a quién pagar y con hasta cuándo, el 1.1 va como «-»');
  // Las fórmulas de los archivos son las de datos/epocas/reserva.mjs.
  const archivo = (f) => JSON.parse(readFileSync(f, 'utf8'))[2][0];
  assert.equal(archivo(ARCHIVO_DE_LA_GUARDA), formulaDeLaGuarda());
  assert.equal(conLaExcepcion(archivo(ARCHIVO_DEL_SUELO)), archivo(ARCHIVO_DEL_SUELO));
  assert.ok(archivo(ARCHIVO_DEL_SUELO).includes(excepcionDeLaReserva()));
  assert.ok(EPOCA_0_BTML.registro[7][9][6].includes(REGLA_DE_LA_GUARDA) && EPOCA_0_BTML.registro[7][9][6].includes('a reserve'), 'la guarda y la plantilla, en el suelo (7.9.6)');
});

test('return: quien gasta libera y vuelve disponible a su dueño; no recibe nada ni gana P; el dueño retira lo no gastado cuando quiere', async () => {
  const m = await mundo();
  const r = await m.reserva();
  assert.equal(await m.aMano('ana', [bloquea(3, r.id)]), 'entra', 'ana llena la reserva bloqueando 3 de su R');
  assert.deepEqual(m.hay('ana'), [7, 3]);
  const antes = [m.eje.saldo('bea', 'R:ana'), m.eje.poderSobre('bea', m.eje.alta('ana').id)];
  assert.equal(await m.aMano('bea', [libera(1, r.id)]), 'entra', 'bea gasta una');
  assert.deepEqual(m.hay('ana'), [8, 2], 'vuelve disponible a ana');
  assert.deepEqual([m.eje.saldo('bea', 'R:ana'), m.eje.poderSobre('bea', m.eje.alta('ana').id)], antes, 'bea no recibe R ni gana P por lo que gasta');
  assert.equal(await m.aMano('ana', [libera(2, r.id)]), 'entra', 'ana retira lo que queda: ninguna regla se lo impide');
  assert.deepEqual(m.hay('ana'), [10, 0]);
  assert.match(await m.aMano('bea', [libera(1, r.id)]), /bloqueado|no hay/, 'ya no queda nada que gastar');
});

test('quien gasta no saca más de lo reservado, ni de otra reserva, ni de lo disponible, ni para sí; un tercero no mueve nada', async () => {
  const m = await mundo();
  const r = await m.reserva();
  const deCris = await m.reserva({ spender: 'cris' });
  assert.equal(await m.aMano('ana', [bloquea(2, r.id), bloquea(2, deCris.id), bloquea(1, 'otra cosa')]), 'entra');
  assert.match(await m.aMano('bea', [libera(3, r.id)]), /no hay 3 de R:ana bloqueado|bloqueado/, 'el libro solo deja sacar lo bloqueado con esa salida');
  assert.match(await m.aMano('bea', [libera(1, deCris.id)]), AJENO, 'de la reserva de cris, no');
  assert.match(await m.aMano('bea', [libera(1, 'otra cosa')]), AJENO, 'de otro bloqueo, no');
  assert.match(await m.aMano('bea', [R(1, 'ana', 'dani')]), AJENO, 'de lo disponible, no');
  assert.match(await m.aMano('bea', [paga(1, 'bea', r.id)]), AJENO, 'para sí, no');
  assert.match(await m.aMano('dani', [libera(1, r.id)]), AJENO, 'un tercero que la reserva no nombra no mueve nada');
  assert.match(await m.aMano('bea', [bloquea(1, r.id)]), AJENO, 'bloquear lo de ana, tampoco');
  assert.deepEqual(m.hay('ana'), [5, 5]);
});

test('una reserva escrita por quien no es el titular no da permiso; una nota ajena anclada en la reserva tampoco', async () => {
  const m = await mundo();
  const deCris = await m.reserva({}, 'cris'); // cris escribe una reserva para bea (cris tiene R de ana, de su invitación)
  assert.equal(await m.aMano('ana', [bloquea(2, deCris.id)]), 'entra', 'ana bloquea lo suyo con la salida en la reserva de cris');
  assert.match(await m.aMano('bea', [libera(1, deCris.id)]), AJENO, 'la reserva no es de ana: no da permiso');
  // Una reserva de ana para cris, y una nota de bea anclada en ella que «dice» que gasta bea y que se puede pagar.
  const r = await m.reserva({ spender: 'cris' });
  assert.equal(await m.aMano('ana', [bloquea(2, r.id)]), 'entra');
  assert.equal(await m.aMano('bea', [], { sobre: r.id, payload: [['nota'], [['pay'], ['bea']], ['x'], [['ana'], ['bea']], ['a reserve']] }), 'entra', 'la nota entra (cualquiera escribe)');
  assert.match(await m.aMano('bea', [libera(1, r.id)]), AJENO, 'lo que se lee es el payload de la reserva, no la nota');
  // Y para el que sí nombra, una nota que añade «pay» no le deja pagar.
  assert.equal(await m.aMano('cris', [], { sobre: r.id, payload: [['nota de cris'], [['pay'], ['dani']]] }), 'entra');
  assert.match(await m.aMano('cris', [paga(1, 'dani', r.id)]), GUARDA, 'la nota no añade un modo');
  assert.equal(await m.aMano('cris', [libera(1, r.id)]), 'entra', 'lo que la reserva dice, sí');
});

test('pasado el «hasta cuándo» no entra; antes, sí', async () => {
  const m = await mundo();
  const r = await m.reserva({ until: '2026-11-17T09:00:00Z' });
  assert.equal(await m.aMano('ana', [bloquea(3, r.id)]), 'entra');
  assert.equal(await m.aMano('bea', [libera(1, r.id)], { t: '2026-11-17T08:59:00Z' }), 'entra', 'a tiempo');
  assert.match(await m.aMano('bea', [libera(1, r.id)], { t: '2026-11-17T09:00:01Z' }), GUARDA, 'pasado, no');
  assert.equal(await m.aMano('ana', [libera(2, r.id)], { t: '2026-11-17T09:00:02Z' }), 'entra', 'el dueño retira después del plazo');
});

test('burn y pay: entran cuando la reserva los dice y se rechazan cuando no (a nivel de regla); en pay, solo a alguien de su lista', async () => {
  const m = await mundo();
  const soloReturn = await m.reserva();
  const quemar = await m.reserva({ modes: 'burn' });
  const pagar = await m.reserva({ modes: 'pay', payees: ['dani'] });
  assert.equal(await m.aMano('ana', [bloquea(2, soloReturn.id), bloquea(2, quemar.id), bloquea(2, pagar.id)]), 'entra');
  // burn: liberar y quemar en el mismo registro (la quema no lleva salida en el núcleo).
  assert.match(await m.aMano('bea', [libera(1, soloReturn.id), quema(1)]), GUARDA, 'con «return» solo, no quema');
  assert.match(await m.aMano('bea', [libera(1, quemar.id)]), GUARDA, 'con «burn» solo, no libera sin quemar');
  assert.match(await m.aMano('bea', [libera(1, quemar.id), quema(2)]), AJENO, 'no quema más de lo que libera');
  assert.match(await m.aMano('bea', [quema(1)]), AJENO, 'ni quema sin liberar');
  const emitido = m.eje.serie('R:ana').emitido;
  assert.equal(await m.aMano('bea', [libera(1, quemar.id), quema(1)]), 'entra', 'con «burn», libera y quema');
  assert.deepEqual(m.hay('ana'), [4, 5]);
  assert.ok(m.eje.serie('R:ana').emitido <= emitido, 'quemada');
  // pay: transferir con la salida en la reserva a alguien de su lista (llega bloqueado con esa salida; lo suelta quien lo recibe).
  assert.match(await m.aMano('bea', [paga(1, 'dani', soloReturn.id)]), GUARDA, 'sin «pay», no paga');
  assert.match(await m.aMano('bea', [paga(1, 'cris', pagar.id)]), GUARDA, 'a quien no está en la lista, no');
  assert.match(await m.aMano('bea', [libera(1, pagar.id)]), GUARDA, 'con «pay» solo, no libera');
  assert.equal(await m.aMano('bea', [paga(1, 'dani', pagar.id)]), 'entra', 'a dani, que está en la lista');
  assert.equal(m.eje.bloqueado('dani', 'R:ana', pagar.id), 1, 'dani lo tiene, bloqueado con la salida en la reserva');
  assert.equal(await m.aMano('dani', [libera(1, pagar.id, 'dani')]), 'entra', 'dani lo suelta: es suyo');
  assert.match(await m.aMano('bea', [libera(1, pagar.id, 'dani')]), AJENO, 'lo que llegó a dani ya no lo mueve bea: la reserva es de ana');
});

test('la T no se bloquea: no hay reserva de T; lo reservado sigue siendo de su dueño (saldosDe y la declaración de saldo lo cuentan)', async () => {
  const m = await mundo();
  const r = await m.reserva();
  assert.match(await m.aMano('ana', [{ token: 'T', escala: 'minuto', cantidad: 5, de: 'ana', a: 'ana', estado: 'bloqueo', salida: r.id }]), /T is not locked/);
  assert.equal(await m.aMano('ana', [bloquea(4, r.id)]), 'entra');
  const s = saldosDe(m.eje, 'ana').find((x) => x.serie === 'R:ana');
  assert.deepEqual([s.disponible, s.bloqueado, s.cantidad, s.declarable], [6, 4, 10, true]);
  const declara = await m.intenta('declare a balance', { X: m.eje.alta('ana').id, series: 'R:ana', quantity: 10 });
  assert.ok(declara.ev, 'la declaración de saldo cuenta lo reservado: ' + JSON.stringify(declara.motivos));
  const mas = await m.intenta('declare a balance', { X: m.eje.alta('ana').id, series: 'R:ana', quantity: 11 });
  assert.ok(!mas.ev);
});

test('reservar P: en pay, el P que sale hacia otro pasa por «P comes down to a thing of another with its owner\'s yes»', async () => {
  const m = await mundo();
  // ana tiene diez P sobre «uso» (lo escribió ella); los reserva para bea, que puede pagar a dani.
  const P = (cantidad, de, a, extra = {}) => ({ token: 'P', ambito: m.uso.id, origen: 'ana', cantidad, de, a, ...extra });
  const r = await m.reserva({ modes: 'pay', payees: ['dani'] });
  assert.equal(await m.aMano('ana', [P(4, 'ana', 'ana', { estado: 'bloqueo', salida: r.id })]), 'entra');
  assert.match(await m.aMano('bea', [P(1, 'ana', 'dani', { salida: r.id })]), /P comes down to a thing of another with its owner's yes/, 'sin el sí de ana para dani, no');
  await m.hecho('let P come down here', { X: m.uso.id, whom: 'dani' });
  assert.equal(await m.aMano('bea', [P(1, 'ana', 'dani', { salida: r.id })]), 'entra', 'con él, sí');
  assert.equal(m.eje.bloqueado('dani', 'P:' + m.uso.id + '/ana', r.id), 1);
});

test('«locked P backing live E is not released» y «what is locked for another book is released only by its return» siguen diciendo lo mismo: un bloqueo que no es con la salida en la reserva no lo toca quien gasta', async () => {
  const m = await mundo();
  const r = await m.reserva();
  const serieE = 'E:ana/noche@' + m.uso.id;
  // ana respalda una E de «uso» con 2 de su P (bloqueado con la salida en la serie) y llena la reserva con 2 más.
  const P = (cantidad, extra) => ({ token: 'P', ambito: m.uso.id, origen: 'ana', cantidad, de: 'ana', a: 'ana', ...extra });
  assert.equal(await m.aMano('ana', [P(2, { estado: 'bloqueo', salida: serieE }), P(2, { estado: 'bloqueo', salida: r.id })]), 'entra');
  assert.equal(await m.aMano('ana', [{ token: 'E', emisor: 'ana', denominacion: 'noche', registro: m.uso.id, cantidad: 1, de: null, a: 'ana' }]), 'entra', 'ana emite una noche');
  assert.match(await m.aMano('bea', [P(1, { estado: 'liberacion', salida: serieE })]), AJENO, 'lo que respalda la E no es de la reserva');
  assert.match(await m.aMano('ana', [P(1, { estado: 'liberacion', salida: serieE })]), /locked P backing live E is not released/, 'y ana tampoco lo suelta mientras viva la E');
  assert.equal(await m.aMano('bea', [P(1, { estado: 'liberacion', salida: r.id })]), 'entra', 'lo de la reserva, sí (la reserva no es un enlace entre libros)');
});

test('validez (src/validez.js) repite la excepción: el paso con la salida en la reserva hacia la lista, en ok; sin reserva que nombre a quien escribe, falla en la capa 4', async () => {
  const m = await mundo();
  const r = await m.reserva({ modes: 'pay', payees: ['dani'] });
  const otra = await m.reserva({ spender: 'cris', modes: 'pay', payees: ['dani'] });
  assert.equal(await m.aMano('ana', [bloquea(2, r.id), bloquea(2, otra.id)]), 'entra');
  const evento = async (salida) => {
    const { crearEvento } = await import('../src/evento.js');
    return crearEvento({ autor: 'bea', sobre: m.uso.id, en: '1000000000', t: m.reloj(), movimientos: [{ token: 'T', escala: 'minuto', cantidad: 1, de: 'bea', a: null }, paga(1, 'dani', salida)], payload: ['p'] });
  };
  const bien = await validez(m.eje, await evento(r.id));
  assert.equal(bien.capas.find((c) => c.capa === 4).estado, 'ok', JSON.stringify(bien.capas.find((c) => c.capa === 4).motivos));
  const mal = await validez(m.eje, await evento(otra.id));
  const c4 = mal.capas.find((c) => c.capa === 4);
  assert.equal(c4.estado, 'falla');
  assert.match(JSON.stringify(c4.motivos), /nadie mueve lo ajeno: bea saca lo bloqueado de ana/);
});

test('un cambio corriente y uno de gobierno que quitan o cambian la excepción o la guarda: rechazados por el suelo', async () => {
  const m = await mundo();
  let s = 0;
  const raizDeCambio = (titulo, propias) => {
    const id = m.eje.epoca().id;
    const k = { ref: id };
    const n = Math.max(6, ...Object.keys(propias).map(Number)) + 1;
    return Array.from({ length: n }, (_, i) => (i === 0 ? [titulo] : propias[i] ?? (i === 6 ? [['propuesto en la prueba'], ['hereda'], [id]] : k)));
  };
  const propone = (titulo, otra, clase) => m.intenta('propose a change', { X: m.eje.genesisId, title: titulo + ' ' + ++s, explanation: 'prueba', change: raizDeCambio(titulo, { 2: [{ ref: idDeRegistro(otra) }] }), records: [otra], class: clase });
  const sinExcepcion = copia(regla0('nobody moves tokens of others'));
  sinExcepcion[2] = [sinExcepcion[2][0].replace(' and not (' + excepcionDeLaReserva() + ')', '')];
  sinExcepcion[6] = ['prueba: sin la tercera excepción'];
  const guardaAbierta = copia(regla0(REGLA_DE_LA_GUARDA));
  guardaAbierta[2] = ['=true'];
  guardaAbierta[6] = ['prueba: la guarda que ya no mira nada'];
  const sinPay = copia(regla0(REGLA_DE_LA_GUARDA));
  sinPay[2] = [sinPay[2][0].replace(/ and it\.3\.1 in \(payload\(\(text\(utf8\(it2\)\)\)\)\)\.1\.1/, '')];
  sinPay[6] = ['prueba: la guarda que paga a cualquiera'];
  assert.notEqual(sinPay[2][0], regla0(REGLA_DE_LA_GUARDA)[2][0]);
  for (const [otra, nombre] of [[sinExcepcion, 'nobody moves tokens of others'], [guardaAbierta, REGLA_DE_LA_GUARDA], [sinPay, REGLA_DE_LA_GUARDA]]) {
    for (const clase of ['ordinary', 'governance']) {
      const r = await propone('cambia ' + nombre, otra, clase);
      assert.ok(!r.ev, clase + ': ' + nombre);
      if (clase === 'governance') assert.match(JSON.stringify(r.motivos.map((x) => x.mensaje ?? x.texto)), new RegExp('sustituye «' + nombre + '», que es del suelo'));
    }
  }
  // Quitarlas de la lista 7.9.6: el suelo no se encoge.
  const k = () => ({ ref: m.eje.epoca().id });
  const lista = EPOCA_0_BTML.registro[7][9][6].filter((x) => x !== REGLA_DE_LA_GUARDA && x !== 'a reserve');
  const fila = [k(), k(), k(), k(), k(), k(), k(), k(), k(), [k(), k(), k(), k(), k(), k(), lista]];
  const fuera = await m.intenta('propose a change', { X: m.eje.genesisId, title: 'fuera del suelo', explanation: 'prueba', change: raizDeCambio('fuera del suelo', { 7: fila }), class: 'governance' });
  assert.ok(!fuera.ev);
  assert.match(JSON.stringify(fuera.motivos.map((x) => x.mensaje ?? x.texto)), /quita del suelo \(epoch\.7\.9\.6\) «a reserve is spent as it says», «a reserve»/);
});

test('restaurar, rehacer desde los eventos y reordenar dan los mismos veredictos', async () => {
  const m = await mundo();
  const r = await m.reserva();
  assert.equal(await m.aMano('ana', [bloquea(3, r.id)]), 'entra');
  const llenar = m.eje.orden[m.eje.orden.length - 1];
  assert.equal(await m.aMano('bea', [libera(2, r.id)]), 'entra');
  const gastar = m.eje.orden[m.eje.orden.length - 1];
  const foto = (e) => [e.saldo('ana', 'R:ana'), e.bloqueado('ana', 'R:ana'), e.saldo('bea', 'R:ana')];
  const esperada = foto(m.eje);
  assert.deepEqual(foto(await restaurar(serializar(m.eje))), esperada, 'restaurado');
  const desde = await Eje.desde(m.eje.orden.map((id) => m.eje.obtener(id)));
  assert.deepEqual(foto(desde), esperada, 'desde sus eventos');
  const sin = m.eje.orden.filter((id) => id !== llenar && id !== gastar);
  const { rechazados } = await desde.reordenar([...sin, gastar, llenar]);
  assert.deepEqual(rechazados.map((x) => x.id), [gastar], 'gastar antes de llenar no entra');
  assert.deepEqual(foto(desde), [7, 3, 1], 'lo de ana, como antes de gastar (bea tiene la R de su invitación)');
});
