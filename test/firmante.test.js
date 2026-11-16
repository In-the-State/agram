// Un firmante en vez de la clave privada (camino B del alta, VG 17-11; docs/ANFITRION.md «la cuenta en el guardián»):
// donde el núcleo firma un registro o una prueba de posesión con una clave privada puede ir una función
// firmar({ canonico, id }) → firma | { id, firma }. El libro sale igual que con la clave (mismos ids, firmas que
// verifican, se restaura con exigirFirmas); el núcleo no se fía del firmante (otra clave, basura, otro id, un rechazo con
// `code`: nada se escribe); el génesis que falla a mitad no deja libro; el firmante del servicio (src/pago.js) recibe el
// evento NIP-98 entero. Claves de PRUEBA, generadas aquí.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Eje } from '../src/eje.js';
import { crearEvento } from '../src/evento.js';
import { generarClaves, firmar, verificar, firmarPosesion, verificarPosesion, firmanteDeEventos, esFirmante } from '../src/autoridad.js';
import { schnorr } from '../src/vendor/noble-secp256k1.js';
import { aHex, deHex } from '../src/cripto.js';
import { serializar, restaurar } from '../src/persistencia.js';
import { pagoHttp, idNip98 } from '../src/pago.js';
import { pagaElCoste, conCoste } from './ayudas-coste.js';

const T0 = '2026-11-06T20:00:00Z';
const gastaT = (de) => pagaElCoste(de);
const sha = (texto) => createHash('sha256').update(texto, 'utf8').digest('hex');

/**
 * Un firmante como el del guardián: comprueba que el id es el SHA-256 del canónico, firma con la clave que custodia
 * (la de la prueba) y devuelve { id, firma } (o la firma sola). Apunta cada llamada.
 */
function guardian(privada, { soloFirma = false } = {}) {
  const llamadas = [];
  const f = async ({ canonico, id }) => {
    llamadas.push({ canonico, id });
    if (sha(canonico) !== id) throw Object.assign(new Error('el id no es el del cuerpo'), { code: 'id_mismatch' });
    const firma = aHex(schnorr.sign(deHex(id), deHex(privada), globalThis.crypto.getRandomValues(new Uint8Array(32))));
    return soloFirma ? firma : { id, firma };
  };
  f.llamadas = llamadas;
  return f;
}

const EMISION = [{ token: 'R', cantidad: 1 }, { token: 'E', denominacion: 'minuto', cantidad: 600 }];
const datosGenesis = (raiz, privada) => ({ demostracion: true, identidad: 'raiz', emision: EMISION, foco: 'g', t: T0, clave: raiz.publica, privada, exigirFirmas: true });

test('un génesis hecho con un firmante da el mismo libro que con la clave: mismos ids, firmas que verifican', async () => {
  const raiz = await generarClaves();
  const g = guardian(raiz.privada);
  const conClave = await Eje.genesis(datosGenesis(raiz, raiz.privada));
  const conFirmante = await Eje.genesis(datosGenesis(raiz, g));
  assert.equal(esFirmante(g), true);
  assert.equal(esFirmante(raiz.privada), false);
  assert.deepEqual(conFirmante.orden, conClave.orden, 'los mismos ids, en el mismo orden');
  assert.equal(conFirmante.orden.length, 2, 'con la época 0 del código: el génesis y la emisión');
  assert.equal(g.llamadas.length, 2, 'el firmante firma los dos');
  for (const id of conFirmante.orden) {
    const ev = conFirmante.obtener(id);
    assert.equal(await verificar(ev, raiz.publica), true);
    assert.equal(ev.firmante, 'raiz');
    assert.deepEqual({ ...ev, firma: undefined }, { ...conClave.obtener(id), firma: undefined }, 'el mismo registro salvo la firma (el azar de BIP-340)');
  }
  // La firma sola (hex) vale igual que { id, firma }.
  const soloFirma = await Eje.genesis(datosGenesis(raiz, guardian(raiz.privada, { soloFirma: true })));
  assert.deepEqual(soloFirma.orden, conClave.orden);
});

test('el génesis que falla a mitad (el firmante rechaza el segundo registro) no deja libro', async () => {
  const raiz = await generarClaves();
  const bueno = guardian(raiz.privada);
  let n = 0;
  const aMedias = async (pedido) => {
    n += 1;
    if (n === 2) throw Object.assign(new Error('el titular canceló'), { code: 'cancelled_by_holder' });
    return bueno(pedido);
  };
  let eje;
  await assert.rejects(async () => { eje = await Eje.genesis(datosGenesis(raiz, aMedias)); }, (e) => e.code === 'cancelled_by_holder' && /el titular canceló/.test(e.message));
  assert.equal(n, 2, 'firmó el génesis y falló en la emisión');
  assert.equal(eje, undefined, 'no se devuelve ningún eje a medio abrir');
  // Un génesis firmado con otra clave tampoco abre nada.
  const otra = await generarClaves();
  await assert.rejects(Eje.genesis(datosGenesis(raiz, guardian(otra.privada))), /no verifica con la clave/);
});

test('escribir, invitar, aceptar y una prueba de posesión con firmante; el libro se restaura y revalida con exigirFirmas', async () => {
  const vg = await generarClaves();
  const ana = await generarClaves();
  const cartera = await generarClaves();
  const gVg = guardian(vg.privada);
  const gAna = guardian(ana.privada, { soloFirma: true });
  const gCartera = guardian(cartera.privada);
  const eje = await Eje.genesis({ identidad: 'vg', foco: ['p'], t: T0, clave: vg.publica, privada: gVg, exigirFirmas: true });
  const invitacion = await eje.invitar({ autor: 'vg', invitado: 'ana', clave: ana.publica, t: T0, privada: gVg });
  assert.equal(await verificar(invitacion, vg.publica), true);
  const alta = await eje.aceptar(invitacion, { publica: ana.publica, privada: gAna }, { t: T0 });
  assert.equal(await verificar(alta, ana.publica), true);
  assert.equal(eje.clave('ana'), ana.publica);
  const escrito = await eje.escribir({ autor: 'ana', sobre: alta.id, t: T0, movimientos: [gastaT('ana')], payload: 'firmado por el guardián' }, gAna);
  assert.equal(await verificar(escrito, ana.publica), true);
  // La cartera, una cosa de vg, y el vínculo que declara su clave con la prueba de posesión (H13) firmada por un firmante.
  await eje.escribir({ autor: 'vg', sobre: eje.genesisId, t: T0, movimientos: [gastaT('vg'), { token: 'T', escala: 'minuto', cantidad: 5, de: 'vg', a: 'cartera' }], payload: ['cartera'] }, gVg);
  const vinculo = await eje.escribir({ autor: 'vg', sobre: eje.genesisId, t: T0, movimientos: [gastaT('vg')], payload: [['vínculo', 'SIP 0'], ['StateArk/Vinculo/AgramCartera/v1'], [['vg'], ['cartera']]], contexto: { claves: { cartera: cartera.publica } } }, gVg, { cartera: gCartera });
  assert.equal(await verificarPosesion(vinculo, 'cartera', cartera.publica), true);
  assert.equal(eje.clave('cartera'), cartera.publica);
  assert.equal(gCartera.llamadas.length, 1);
  // Cada firmante recibió el cuerpo canónico cuyo SHA-256 es el id.
  for (const { canonico, id } of [...gVg.llamadas, ...gAna.llamadas, ...gCartera.llamadas]) assert.equal(sha(canonico), id);
  // Se restaura y revalida entero, con exigirFirmas.
  const guardado = JSON.parse(JSON.stringify(serializar(eje)));
  assert.equal(guardado.exigirFirmas, true);
  const otra = await restaurar(guardado);
  assert.deepEqual(otra.orden, eje.orden);
  assert.equal(otra.clave('cartera'), cartera.publica);
  // La prueba de posesión suelta (firmarPosesion) con firmante.
  const suelto = await crearEvento(conCoste(eje, { autor: 'vg', sobre: eje.genesisId, t: T0, movimientos: [gastaT('vg')], payload: 'otra', contexto: { claves: { nueva: ana.publica } } }));
  const conPrueba = await firmarPosesion(suelto, 'nueva', gAna);
  assert.equal(await verificarPosesion(conPrueba, 'nueva', ana.publica), true);
});

test('el núcleo no se fía del firmante: otra clave, basura, otro id o un rechazo con code no dejan nada escrito', async () => {
  const vg = await generarClaves();
  const otra = await generarClaves();
  const gVg = guardian(vg.privada);
  const eje = await Eje.genesis({ identidad: 'vg', foco: ['p'], t: T0, clave: vg.publica, privada: gVg, exigirFirmas: true });
  const antes = [...eje.orden];
  const datos = () => ({ autor: 'vg', sobre: eje.genesisId, t: T0, movimientos: [gastaT('vg')], payload: 'intento' });
  const malos = [
    [guardian(otra.privada), /no verifica con la clave/],
    [async () => 'no es una firma', /no devolvió una firma/],
    [async () => ({ firma: 'ab' }), /no devolvió una firma/],
    [async () => null, /no devolvió una firma/],
    [async () => 42, /no devolvió una firma/],
    [async ({ id }) => ({ id: 'f'.repeat(64), firma: (await gVg({ canonico: '', id: sha('') })).firma }), /firmó otro registro/],
    [async () => { throw Object.assign(new Error('sesión cerrada'), { code: 'session_closed' }); }, (e) => e.code === 'session_closed' && /sesión cerrada/.test(e.message)],
    [async () => Promise.reject({ code: 'unknown_account', message: 'no la conozco' }), (e) => e.code === 'unknown_account' && /no la conozco/.test(e.message)],
    [async () => { throw new Error('sin code'); }, (e) => e.code === undefined && /el firmante no firmó/.test(e.message)],
  ];
  for (const [firmante, esperado] of malos) {
    await assert.rejects(eje.escribir(datos(), firmante), esperado);
    assert.deepEqual(eje.orden, antes, 'nada se añade al libro');
  }
  // Un id_mismatch del guardián (el id no es el del cuerpo) conserva su code.
  await assert.rejects(eje.escribir(datos(), async () => { throw Object.assign(new Error('mismatch'), { code: 'id_mismatch' }); }), (e) => e.code === 'id_mismatch');
  // Una prueba de posesión firmada con otra clave que la declarada: lanza antes de añadir.
  await assert.rejects(eje.escribir({ ...datos(), contexto: { claves: { cosa: otra.publica } } }, gVg, { cosa: guardian(vg.privada) }), /no verifica con la clave/);
  // Invitar y aceptar con un firmante malo, igual.
  await assert.rejects(eje.invitar({ autor: 'vg', invitado: 'ana', t: T0, privada: guardian(otra.privada) }), /no verifica/);
  assert.deepEqual(eje.orden, antes);
  // La firma suelta (autoridad.firmar) con la clave pública que se le dice.
  const ev = await crearEvento(conCoste(eje, { autor: 'vg', sobre: eje.genesisId, t: T0, movimientos: [gastaT('vg')], payload: 'x' }));
  await assert.rejects(firmar(ev, guardian(otra.privada), 'vg', { publica: vg.publica }), /no verifica/);
  assert.equal(await verificar(await firmar(ev, gVg, 'vg', { publica: vg.publica }), vg.publica), true);
});

test('firmanteDeEventos: el firmante ({ canonico, id }) hecho la función (evento) → evento firmado de transaccion, englobar y Sincronia', async () => {
  const vg = await generarClaves();
  const otra = await generarClaves();
  const eje = await Eje.genesis({ identidad: 'vg', foco: ['p'], t: T0, clave: vg.publica, privada: vg.privada, exigirFirmas: true });
  const ev = await crearEvento(conCoste(eje, { autor: 'vg', sobre: eje.genesisId, t: T0, movimientos: [gastaT('vg')], payload: 'por evento' }));
  const firmado = await firmanteDeEventos(guardian(vg.privada), { publica: vg.publica })(ev);
  assert.equal(firmado.id, ev.id);
  assert.equal(firmado.firmante, 'vg');
  assert.deepEqual(await eje.validar(firmado), []);
  await eje.anadir(firmado);
  await assert.rejects(firmanteDeEventos(guardian(otra.privada), { publica: vg.publica })(ev), /no verifica/);
  // Con una clave privada en vez de un firmante, firma como siempre.
  assert.equal(await verificar(await firmanteDeEventos(vg.privada)(ev), vg.publica), true);
});

test('el firmante del servicio recibe, además del id, el evento NIP-98 entero sin firmar', async () => {
  const vg = await generarClaves();
  const pedidos = [];
  const firmarServicio = async (idHex, evento) => {
    pedidos.push({ idHex, evento });
    return aHex(schnorr.sign(deHex(idHex), deHex(vg.privada), new Uint8Array(32)));
  };
  const fetch = async () => new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
  const p = pagoHttp({ url: 'https://pagos.ejemplo', fetch, firmar: firmarServicio, pubkey: vg.publica, ahora: () => 1_763_300_000_000 });
  await p.saldos({ nombre: 'vg' });
  assert.equal(pedidos.length, 1);
  const { idHex, evento } = pedidos[0];
  assert.equal(evento.id, idHex);
  assert.equal(idNip98(evento), idHex, 'el guardián puede recalcular el id del evento');
  assert.equal(evento.pubkey, vg.publica);
  assert.equal(evento.kind, 27235);
  assert.equal(evento.sig, undefined, 'sin firmar');
  assert.ok(Object.isFrozen(evento) && Object.isFrozen(evento.tags));
  assert.equal(evento.tags.find((t) => t[0] === 'u')?.[1], 'https://pagos.ejemplo/pagos/saldos');
});
