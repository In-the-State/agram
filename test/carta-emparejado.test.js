// La pantalla del emparejamiento por QR (A25, camino B sin anfitrión; carta/guardian-emparejado.js, carta/emparejar.js,
// docs/notas/EMPAREJAMIENTO.md «La pantalla»): el emparejamiento hace de guardián. Sin navegador: almacén en memoria,
// relé y app SIMULADOS (test/ayudas-emparejamiento.js; la app firma con la clave de la cuenta, que es la larga) y un
// localStorage simulado para las cuentas. Nada ha hablado con un relé real ni con la app real.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as E from '../carta/emparejamiento.js';
import { Eje, autoridad, persistencia, salida, ID_EPOCA_DE_CUENTA } from '../src/index.js';
import * as Acc from '../src/acciones.js';
import { verificarBip340 } from '../src/cripto.js';
import { EPOCA_DE_CUENTA_DATOS } from '../datos/epocas/cuenta/cuenta-0.js';
import { crearEvento, canonico, cuerpo } from '../src/evento.js';
import { schnorr } from '../src/vendor/noble-secp256k1.js';
import * as Q from '../carta/cuentas.js';
import * as A from '../carta/anfitrion.js';
import * as G from '../carta/guardian-emparejado.js';
import { htmlLineaEmparejamiento, htmlDialogoEmparejar, htmlConfirmarEmparejar, instalar, horaDe } from '../carta/emparejar.js';
import { htmlGuardian, htmlArranque, htmlReglas } from '../carta/dom.js';
import { preferencias } from '../carta/carta.js';
import { TEXTOS, t } from '../carta/textos.js';
import { publicaDe } from '../src/autoridad.js';
import { V, APP, SESION, M, AHORA, qr, revocacion, hasta, conLaApp, mundo, aHex, hex, CLAVES_DE_PRUEBA, PERMISO_MS } from './ayudas-emparejamiento.js';

const T1 = '2026-11-17T10:30:00Z';
const codeDe = async (p) => { try { await p; return 'ok'; } catch (e) { return e.code; } };
const errorDe = async (p) => { try { await p; return null; } catch (e) { return e; } };
const existe = (clave) => typeof TEXTOS.es[clave] === 'string' && t(clave) !== clave;

/** Un localStorage simulado mientras dura la prueba. */
async function conAlmacen(fn) {
  const almacen = new Map();
  globalThis.localStorage = { getItem: (k) => almacen.get(k) ?? null, setItem: (k, v) => almacen.set(k, String(v)), removeItem: (k) => almacen.delete(k) };
  try {
    return await fn(almacen);
  } finally {
    delete globalThis.localStorage;
  }
}

/** Un mundo emparejado y aceptado, con su adaptador. */
async function emparejado(opciones) {
  const w = mundo(opciones);
  await w.carta.emparejar(V.qr.texto);
  await hasta(() => w.carta.estado()?.aceptada, w.app, 'emparejada');
  w.g = G.guardianEmparejado(w.carta, { reloj: w.reloj });
  return w;
}

/** Un registro sin firmar (el de los vectores no es de la cuenta; este sí: autor «vg», cualquier cuerpo vale para proponer). */
const registro = (nota = 'propuesto') => crearEvento({ autor: 'vg', t: '2026-11-17T11:30:00+01:00', movimientos: [{ token: 'T', de: 'vg', a: null, escala: 'segundo', cantidad: 1 }], payload: [['nota', nota]] });
const propuestaDe = async (ev) => ({ publica: APP, canonico: canonico(cuerpo(ev)), id: ev.id });

// ---------- A. el adaptador ----------

test('el adaptador: cuentas da la de larga; sesion abierta solo tras «emparejada», en plazo y con larga; firmar da una firma que el núcleo verifica', async () => {
  const w = mundo({ modo: { hola: 'aceptar', propuesta: 'firmar' } });
  const g = G.guardianEmparejado(w.carta, { reloj: w.reloj });
  try {
    assert.deepEqual(await g.cuentas(), [], 'sin emparejar, ninguna cuenta');
    assert.deepEqual(await g.sesion({ publica: APP }), { abierta: false, caduca: null });
    assert.equal(A.guardianDe(g), g, 'tiene los cuatro verbos del camino B');
    await w.carta.emparejar(V.qr.texto);
    assert.deepEqual(await g.cuentas(), [{ nombre: '6aa3-da9b', publica: APP }]);
    assert.equal((await g.sesion(APP)).abierta, false, 'la app aún no ha aceptado');
    await hasta(() => w.carta.estado().aceptada, w.app);
    assert.deepEqual(await g.sesion({ publica: APP }), { abierta: true, caduca: Date.parse('2026-11-17T18:00:00.000Z') }, 'sesion({ publica })');
    assert.equal(await A.sesionAbierta(g, APP), true, 'y sesion(publica), como la llama la carta');
    assert.equal(await A.sesionAbierta(g, publicaDe('d4'.repeat(32))), false, 'con otra pública, cerrada');
    assert.deepEqual(await g.crearCuenta({ nombre: 'Víctor' }), { publica: APP }, 'no crea clave: la de la app');
    assert.equal(await A.tieneLaCuenta(g, APP), true);
    // firmar, por el firmante de la carta (firmanteDeCuenta) sobre un registro de verdad: el núcleo comprueba la firma.
    const ev = await registro();
    const firmante = A.firmanteDeCuenta(g, APP, { eje: () => null });
    const firmado = await conLaApp(autoridad.firmar(ev, firmante, 'vg', { publica: APP }), w.app);
    assert.equal(await autoridad.verificar(firmado, APP), true);
    const recibida = w.app.recibidos.find((m) => m.tipo === 'propuesta' && m.id === ev.id);
    assert.equal(recibida.publica, APP);
    assert.equal(recibida.segundoFactor, true, 'sin eje, ante la duda, diálogo');
    assert.ok(g.deEstaPagina.has(ev.id));
    assert.equal(g.enEspera.size, 0);
    // Los verbos opcionales no están, y la carta lo lleva bien.
    assert.equal(A.puedePedirSesion(g), false);
    assert.equal(await A.pedirSesion(g, APP), null);
    assert.equal(A.puedeDarClavesDeLinea(g), false);
    assert.deepEqual(await A.clavesDeLinea(g, APP, 'ab'.repeat(32)), []);
    assert.equal(await A.pasarCriterios(g, { genesisId: 'x' }, 'vg', APP), null);
    assert.deepEqual(A.firmanteDeServicio(g, APP), {}, 'sin firmarServicio, el servicio de pagos no se firma');
    // Pasado «hasta», la sesión ya no está abierta.
    w.ahora = Date.parse('2026-11-17T18:00:00.000Z');
    assert.equal((await g.sesion(APP)).abierta, false);
  } finally { w.cerrar(); }
});

test('el adaptador: con otra pública, unknown_account sin mandar nada y dicho en llano; cada rechazo de la app llega a su texto', async () => {
  const w = await emparejado({ modo: { hola: 'aceptar', propuesta: 'rechazar' } });
  try {
    const ev = await registro('otra');
    const antes = w.rele.para(APP).length;
    const e = await errorDe(w.g.firmar({ ...(await propuestaDe(ev)), publica: publicaDe('d4'.repeat(32)) }));
    assert.deepEqual([e.code, e.emparejamiento, A.claveDelError(e)], ['unknown_account', 'unknown_account', 'emparejarRechazo_unknown_account']);
    assert.equal(w.rele.para(APP).length, antes, 'no se manda nada');
    // Cada código con que la app rechaza: el del contrato del guardián y su frase llana.
    for (const code of ['cancelled_by_holder', 'unknown_account', 'id_mismatch', 'canonical_invalid', 'author_mismatch', 'message_invalid', 'otro_codigo']) {
      w.app.modo.code = code;
      const r = await registro('rechazo ' + code);
      const err = await conLaApp(errorDe(w.g.firmar(await propuestaDe(r))), w.app);
      assert.equal(err.emparejamiento, code, code);
      assert.equal(err.code, G.GUARDIAN_DE_RECHAZO[code] ?? 'cancelled_by_holder', code);
      const clave = A.claveDelError(err);
      assert.equal(clave, code === 'otro_codigo' ? 'emparejarRechazoOtro' : 'emparejarRechazo_' + code);
      assert.ok(existe(clave), clave);
      assert.doesNotMatch(t(clave), /no se pinta/, 'el motivo de la app no se dice');
    }
    // El núcleo envuelve el rechazo del firmante: su código sigue llegando a su texto.
    w.app.modo.code = 'cancelled_by_holder';
    const r = await registro('por el núcleo');
    const firmante = A.firmanteDeCuenta(w.g, APP, { eje: () => null });
    const delNucleo = await conLaApp(errorDe(autoridad.firmar(r, firmante, 'vg', { publica: APP })), w.app);
    assert.ok(delNucleo);
    assert.equal(A.claveDelError(firmante.error), 'emparejarRechazo_cancelled_by_holder');
  } finally { w.cerrar(); }
});

test('cada código del emparejamiento tiene su equivalente en el contrato del guardián y su frase llana; los del QR también', async () => {
  const contrato = new Set(['session_closed', 'cancelled_by_holder', 'dialog_busy', 'id_mismatch', 'unknown_account']);
  const nota = ['cancelled_by_holder', 'unknown_account', 'id_mismatch', 'canonical_invalid', 'author_mismatch', 'message_invalid', 'session_expired', 'session_revoked', 'pairing_refused', 'pairing_forgotten', 'pairing_replaced', 'proposal_discarded', 'no_pairing', 'message_too_large'];
  assert.deepEqual([...G.CODIGOS_DE_RECHAZO].sort(), [...nota].sort());
  for (const code of nota) {
    assert.ok(contrato.has(G.GUARDIAN_DE_RECHAZO[code]), code);
    assert.ok(existe(G.claveDeCodigo(code)), code);
    assert.equal(A.claveDelError(Object.assign(new Error('x'), { code: G.GUARDIAN_DE_RECHAZO[code], emparejamiento: code })), 'emparejarRechazo_' + code);
    assert.equal(A.claveDelError({ code: 'x', cause: { emparejamiento: code } }), 'emparejarRechazo_' + code, 'también envuelto');
  }
  assert.equal(A.claveDelError(Object.assign(new Error('x'), { code: 'session_closed' })), 'guardianSesionCerrada', 'el guardián del anfitrión, como hoy');
  for (const estado of ['propuesto', 'firmado', 'rechazado', 'caducado', 'revocado']) assert.ok(existe('emparejarEstado_' + estado), estado);
  // Cada fallo del QR, con su frase; el QR malo no toca el emparejamiento de antes.
  const w = mundo();
  try {
    const casos = { qr_invalid: 'no es un QR' };
    for (const code of G.CODIGOS_DEL_QR) assert.ok(existe('emparejarQR_' + code), code);
    const e = await errorDe(w.carta.emparejar(casos.qr_invalid));
    assert.equal(G.claveDeQR(e), 'emparejarQR_qr_invalid');
    const caducado = await errorDe(w.carta.emparejar(qr({ privada: 'c3'.repeat(32), desde: '2026-11-17T08:00:00.000Z', hasta: '2026-11-17T09:00:00.000Z' })));
    assert.equal(G.claveDeQR(caducado), 'emparejarQR_session_expired');
    assert.equal(G.claveDeQR(new Error('IndexedDB no está')), 'emparejarFallo');
    assert.equal(w.carta.estado(), null);
  } finally { w.cerrar(); }
});

// ---------- C. abrir un libro con la clave de la app; las cuentas con el emparejamiento ----------

test('abrir un libro con la clave de la app: el génesis propuesto (con «libro», su propio id), firmado por la app y asentado; un registro después', async () => {
  await conAlmacen(async (almacen) => {
    const w = await emparejado();
    try {
      const guardian = G.guardianDeLaCarta({ adaptador: w.g, emparejamiento: w.carta });
      assert.equal(guardian, w.g, 'sin anfitrión y emparejada, el guardián es el adaptador');
      const r = await conLaApp(Q.crearCuenta({ nombre: 'Víctor', t: T1, guardian }), w.app);
      assert.equal(r.publica, APP);
      assert.equal(r.cuenta.guardian, true);
      assert.equal(r.eje.clave('victor'), APP, 'la clave de la cuenta es la de la app');
      const propuestas = w.app.recibidos.filter((m) => m.tipo === 'propuesta');
      assert.ok(propuestas.some((m) => m.id === r.eje.genesisId), 'el génesis se propuso');
      assert.ok(propuestas.every((m) => m.libro === r.eje.genesisId), '«libro» es el id del génesis del libro que nace');
      for (const id of r.eje.orden) assert.equal(await autoridad.verificar(r.eje.obtener(id), APP), true);
      assert.deepEqual((await Eje.desde(persistencia.serializar(r.eje).eventos, { exigirFirmas: true })).orden, r.eje.orden);
      // Un registro después, en el libro abierto: «libro» viaja con el id de su génesis.
      const p = preferencias(r.eje, 'victor', { language: 'en' });
      const pref = await conLaApp(salida.escribirDesde(r.eje, { modo: 'sequenced', autor: 'victor', sobre: p.sobre, en: p.en, payload: p.payload, t: T1 }, r.firmante), w.app);
      assert.ok(r.eje.obtener(pref.id));
      assert.equal(w.app.recibidos.find((m) => m.id === pref.id).libro, r.eje.genesisId);
      assert.equal(await Q.guardarCuenta(r), true);
      assert.ok(![...almacen.values()].some((v) => v.includes(V.claves.app.privada)), 'ninguna privada en el almacén');
      // Lo ya asentado se descarta de lo pendiente (y no se asienta otra vez).
      const limpio = await G.asentarFirmadas(w.carta, r.eje);
      assert.deepEqual(limpio.asentados, []);
      assert.ok(limpio.descartados.includes(r.eje.genesisId));
      assert.deepEqual(w.carta.propuestas().filter((x) => x.estado === 'firmado'), []);
    } finally { w.cerrar(); }
  });
});

test('una entrada sin clave de larga firma al emparejar y vuelve a solo lectura al caducar, con «revocada» y al olvidar; la de otra clave lo dice', async () => {
  await conAlmacen(async () => {
    const w = await emparejado();
    try {
      const guardian = () => G.guardianDeLaCarta({ adaptador: w.g, emparejamiento: w.carta });
      const r = await conLaApp(Q.crearCuenta({ nombre: 'Víctor', t: T1, guardian: guardian() }), w.app);
      await Q.guardarCuenta(r);
      const alta = r.cuenta.alta;
      const abrir = async () => (await Q.abrirCuenta(alta, { guardian: guardian() })).soloLeer === true;
      assert.equal(await abrir(), false, 'emparejada: firma');
      // Caduca.
      w.ahora = Date.parse('2026-11-17T18:00:00.000Z');
      w.temporizador.disparar();
      await hasta(() => w.carta.estado() === null);
      assert.equal(guardian(), null);
      assert.equal(await abrir(), true, 'caducada: solo lectura');
      assert.ok(htmlGuardian({ soloLeer: true, sinGuardian: true, emparejar: true, reemparejar: true }).includes('data-emparejar'), 'con «Volver a emparejar»');
      assert.ok(htmlGuardian({ soloLeer: true, sinGuardian: true, emparejar: true, reemparejar: true }).includes(t('emparejarOtraVez')));
      // Otra vez emparejada (otro QR, otro plazo): firma; la app revoca: solo lectura.
      const priv2 = 'c5'.repeat(32);
      await w.carta.emparejar(qr({ privada: priv2, desde: '2026-11-17T17:30:00.000Z', hasta: '2026-11-18T10:00:00.000Z' }));
      await hasta(() => w.carta.estado()?.aceptada, w.app);
      assert.equal(await abrir(), false, 'otra vez emparejada: firma');
      await w.app.mandar({ schema: M, tipo: 'revocada', revocacion: revocacion(publicaDe(priv2)) }, publicaDe(priv2));
      await hasta(() => w.carta.estado() === null);
      assert.equal(await abrir(), true, 'revocada: solo lectura');
      // Otra vez; ahora se olvida.
      const priv3 = 'c6'.repeat(32);
      await w.carta.emparejar(qr({ privada: priv3, desde: '2026-11-17T17:30:00.000Z', hasta: '2026-11-18T10:00:00.000Z' }));
      assert.equal(await abrir(), false);
      await w.carta.olvidar();
      assert.equal(await abrir(), true, 'olvidada: solo lectura');
      // Una entrada sin clave de otra pública: sigue en solo lectura y lo dice llano.
      const priv4 = 'c7'.repeat(32);
      await w.carta.emparejar(qr({ privada: priv4, desde: '2026-11-17T17:30:00.000Z', hasta: '2026-11-18T10:00:00.000Z' }));
      const otra = publicaDe('d4'.repeat(32));
      assert.equal(await A.tieneLaCuenta(guardian(), otra), false);
      assert.equal(G.porQueSoloLeer(otra, w.carta), 'otraClave');
      assert.equal(G.porQueSoloLeer(APP, w.carta), null);
      const aviso = htmlGuardian({ soloLeer: true, otraClave: true, emparejar: true });
      assert.ok(aviso.includes(t('emparejarOtraClave')));
      assert.ok(htmlGuardian({ soloLeer: true, sinGuardian: true, emparejar: true }).includes(t('emparejarConLaApp')));
    } finally { w.cerrar(); }
  });
});

// ---------- D. lo propuesto, tras recargar ----------

test('recargar con una propuesta «firmado» sin asentar: se asienta una vez y no dos; con una «propuesto», se ofrece volver a pedir', async () => {
  await conAlmacen(async () => {
    const w = await emparejado();
    try {
      const r = await conLaApp(Q.crearCuenta({ nombre: 'Víctor', t: T1, guardian: w.g }), w.app);
      // La app calla: el registro queda «propuesto»; la página se cierra antes de que firme.
      w.app.modo.propuesta = 'callar';
      const p = preferencias(r.eje, 'victor', { language: 'en' });
      const escribiendo = salida.escribirDesde(r.eje, { modo: 'sequenced', autor: 'victor', sobre: p.sobre, en: p.en, payload: p.payload, t: T1 }, r.firmante);
      escribiendo.catch(() => {});
      await hasta(() => w.carta.propuestas().some((x) => x.estado === 'propuesto'), w.app, 'propuesto');
      const id = w.carta.propuestas().find((x) => x.estado === 'propuesto').id;
      w.carta.cerrar();
      w.rele.cortarTodo();
      // La página vuelve: lo «propuesto» se enseña con «Volver a pedir».
      w.carta = w.nueva();
      await w.carta.cargar();
      const enLista = w.carta.propuestas().find((x) => x.id === id);
      assert.equal(enLista.estado, 'propuesto');
      const linea = htmlLineaEmparejamiento({ estado: w.carta.estado(), propuestas: w.carta.propuestas(), esperan: G.esperando(w.carta).length });
      assert.ok(linea.includes(`data-emparejar-reenviar="${id}"`), 'volver a pedir');
      assert.ok(linea.includes(t('emparejarPropuestoAviso')), 'Propuesto: confírmalo en la app');
      assert.ok(linea.includes(t('emparejarEstado_propuesto')));
      // Volver a pedir: la app firma ahora; queda «firmado» sin asentar (la promesa de antes ya no existe).
      w.app.modo.propuesta = 'firmar';
      await w.carta.reenviar(id);
      await hasta(() => w.carta.propuestas().find((x) => x.id === id)?.estado === 'firmado', w.app, 'firmado');
      assert.equal(r.eje.obtener(id), undefined);
      // Se asienta una vez (dos llamadas a la vez y una después): el cuerpo idéntico por autoridad.firmar.
      const [a, b] = await Promise.all([G.asentarFirmadas(w.carta, r.eje), G.asentarFirmadas(w.carta, r.eje)]);
      assert.equal(a.asentados.length + b.asentados.length, 1, 'una sola vez');
      assert.deepEqual([...a.fallidos, ...b.fallidos], []);
      const asentado = r.eje.obtener(id);
      assert.ok(asentado);
      assert.equal(await autoridad.verificar(asentado, APP), true);
      assert.equal(asentado.firmante, 'victor');
      const otra = await G.asentarFirmadas(w.carta, r.eje);
      assert.deepEqual([otra.asentados, otra.fallidos], [[], []]);
      assert.equal(w.carta.propuestas().some((x) => x.id === id), false, 'asentada, se descarta');
      assert.deepEqual((await Eje.desde(persistencia.serializar(r.eje).eventos, { exigirFirmas: true })).orden, r.eje.orden);
      // Una «firmado» de otro libro no se toca aquí; una de esta página la asienta su propio flujo.
      assert.deepEqual((await G.asentarFirmadas(w.carta, r.eje, { deEstaPagina: new Set([id]) })).asentados, []);
    } finally { w.cerrar(); }
  });
});

test('leer otro QR con propuestas esperando: pasan a caducadas (pairing_replaced) y se dice; la lista las enseña con su motivo', async () => {
  const w = await emparejado({ modo: { hola: 'aceptar', propuesta: 'callar' } });
  try {
    const ev = await registro('esperando');
    const firmando = w.g.firmar(await propuestaDe(ev));
    firmando.catch(() => {});
    await hasta(() => G.esperando(w.carta).length === 1, w.app);
    assert.equal(w.g.enEspera.size, 1);
    const linea = htmlLineaEmparejamiento({ estado: w.carta.estado(), propuestas: w.carta.propuestas(), esperan: G.esperando(w.carta).length + w.g.enEspera.size });
    assert.ok(linea.includes(t('emparejarPropuestoAviso')));
    // Se avisa antes (la pantalla pregunta con este texto) y se lee otro QR.
    const n = G.esperando(w.carta).length;
    assert.match(t('emparejarSustituirConfirmar', { n }), /1 propuestas/);
    await w.carta.emparejar(qr({ privada: 'c8'.repeat(32) }));
    const e = await errorDe(firmando);
    assert.deepEqual([e.code, e.emparejamiento, A.claveDelError(e)], ['session_closed', 'pairing_replaced', 'emparejarRechazo_pairing_replaced']);
    const p = w.carta.propuestas().find((x) => x.id === ev.id);
    assert.deepEqual([p.estado, p.code], ['caducado', 'pairing_replaced']);
    assert.deepEqual(G.esperando(w.carta), [], 'nada espera ya');
    assert.ok(t('emparejarSustituidas', { n }).startsWith('1 '));
    const despues = htmlLineaEmparejamiento({ estado: w.carta.estado(), propuestas: w.carta.propuestas(), mensaje: t('emparejarSustituidas', { n }) });
    assert.ok(despues.includes(t('emparejarEstado_caducado')));
    assert.ok(despues.includes(t('emparejarRechazo_pairing_replaced')));
    assert.ok(despues.includes(t('emparejarSustituidas', { n })));
    assert.ok(!despues.includes(`data-emparejar-reenviar="${ev.id}"`), 'caducada: no se vuelve a pedir');
    assert.ok(despues.includes(`data-emparejar-descartar="${ev.id}"`), 'se puede descartar');
    // Descartar una que espera rechaza su firma con proposal_discarded.
    const ev2 = await registro('descartada');
    const otra = w.g.firmar(await propuestaDe(ev2));
    otra.catch(() => {});
    await hasta(() => G.esperando(w.carta).length === 1, w.app);
    await w.carta.descartar(ev2.id);
    assert.equal(A.claveDelError(await errorDe(otra)), 'emparejarRechazo_proposal_discarded');
    // Olvidar con una esperando: pairing_forgotten; sin emparejamiento, no_pairing.
    const ev3 = await registro('olvidada');
    const tercera = w.g.firmar(await propuestaDe(ev3));
    tercera.catch(() => {});
    await hasta(() => G.esperando(w.carta).length === 1, w.app);
    await w.carta.olvidar();
    assert.equal(A.claveDelError(await errorDe(tercera)), 'emparejarRechazo_pairing_forgotten');
    assert.equal(A.claveDelError(await errorDe(w.g.firmar(await propuestaDe(await registro('sin'))))), 'emparejarRechazo_no_pairing');
  } finally { w.cerrar(); }
});

test('caducar y revocar con una propuesta esperando: session_expired y session_revoked, cada uno en llano', async () => {
  const w = await emparejado({ modo: { hola: 'aceptar', propuesta: 'callar' } });
  try {
    const ev = await registro('caduca');
    const f1 = w.g.firmar(await propuestaDe(ev));
    f1.catch(() => {});
    await hasta(() => G.esperando(w.carta).length === 1, w.app);
    await w.app.mandar({ schema: M, tipo: 'revocada', revocacion: V.revocacion.revocacion }, SESION);
    assert.equal(A.claveDelError(await conLaApp(errorDe(f1), w.app)), 'emparejarRechazo_session_revoked');
    const priv = 'c9'.repeat(32);
    await w.carta.emparejar(qr({ privada: priv }));
    const ev2 = await registro('caduca 2');
    const f2 = w.g.firmar(await propuestaDe(ev2));
    f2.catch(() => {});
    await hasta(() => G.esperando(w.carta).length === 1, w.app);
    w.ahora = Date.parse('2026-11-17T18:00:00.000Z');
    w.temporizador.disparar();
    assert.equal(A.claveDelError(await errorDe(f2)), 'emparejarRechazo_session_expired');
    // Un registro demasiado grande no se manda.
    const w2 = await emparejado();
    try {
      const grande = await crearEvento({ autor: 'vg', t: '2026-11-17T11:30:00+01:00', movimientos: [{ token: 'T', de: 'vg', a: null, escala: 'segundo', cantidad: 1 }], payload: [['nota', 'x'.repeat(60_000)]] });
      assert.equal(A.claveDelError(await errorDe(w2.g.firmar(await propuestaDe(grande)))), 'emparejarRechazo_message_too_large');
    } finally { w2.cerrar(); }
  } finally { w.cerrar(); }
});

test('la app no acepta el emparejamiento: lo que esperaba queda en llano (pairing_refused)', async () => {
  const w = mundo({ modo: { hola: 'rechazar', propuesta: 'callar' } });
  try {
    await w.carta.emparejar(V.qr.texto);
    const g = G.guardianEmparejado(w.carta, { reloj: w.reloj });
    const ev = await registro('rechazada');
    const f = g.firmar(await propuestaDe(ev));
    f.catch(() => {});
    assert.equal(A.claveDelError(await conLaApp(errorDe(f), w.app)), 'emparejarRechazo_pairing_refused');
    assert.equal(w.carta.estado(), null);
  } finally { w.cerrar(); }
});

// ---------- B. la lectura por cámara, con dobles ----------

function camaraDePrueba() {
  const pista = { paradas: 0, stop() { pista.paradas += 1; } };
  const video = { srcObject: { getTracks: () => [pista] }, play: async () => {} };
  return { pista, video };
}

test('la lectura por cámara con dobles: lee, suelta la cámara al leer y al cancelar; sin BarcodeDetector solo queda pegar', async () => {
  // Lee al tercer intento (los dos primeros, nada y un fallo del detector); suelta la cámara.
  const { pista, video } = camaraDePrueba();
  let intentos = 0;
  const detector = { async detect(v) { assert.equal(v, video); intentos += 1; if (intentos === 2) throw new Error('aún no'); return intentos < 3 ? [] : [{ rawValue: V.qr.texto }, { rawValue: 'otro' }]; } };
  const esperas = [];
  assert.equal(await G.leerConCamara({ detector, video, esperar: async (ms) => { esperas.push(ms); } }), V.qr.texto, 'el texto tal cual');
  assert.equal(intentos, 3);
  assert.deepEqual(esperas, [250, 250]);
  assert.equal(pista.paradas, 1, 'la cámara se suelta al leer');
  assert.equal(video.srcObject, null);
  // Cancelar: devuelve null y suelta.
  const c = camaraDePrueba();
  let cancelado = false;
  const nada = { async detect() { cancelado = true; return []; } };
  assert.equal(await G.leerConCamara({ detector: nada, video: c.video, cancelado: () => cancelado, esperar: async () => {} }), null);
  assert.equal(c.pista.paradas, 1, 'la cámara se suelta al cancelar');
  // Abrir la cámara: getUserMedia con la trasera; si falla, se suelta y lanza.
  const d = camaraDePrueba();
  const entorno = { navigator: { mediaDevices: { getUserMedia: async (o) => { assert.deepEqual(o, { video: { facingMode: 'environment' }, audio: false }); return d.video.srcObject; } } }, BarcodeDetector: class { constructor(o) { this.formatos = o.formats; } } };
  const v = { srcObject: null, play: async () => {} };
  const det = await G.abrirCamara(v, entorno);
  assert.deepEqual(det.formatos, ['qr_code']);
  assert.ok(v.srcObject);
  const malo = { navigator: { mediaDevices: { getUserMedia: async () => { throw new Error('denegado'); } } }, BarcodeDetector: class {} };
  await assert.rejects(G.abrirCamara({ srcObject: null }, malo));
  // ¿Puede leer con la cámara?
  assert.equal(G.puedeLeerConCamara(entorno), true);
  assert.equal(G.puedeLeerConCamara({ navigator: entorno.navigator }), false, 'sin BarcodeDetector');
  assert.equal(G.puedeLeerConCamara({ BarcodeDetector: class {} }), false, 'sin getUserMedia');
  // El diálogo: sin cámara, solo pegar; con cámara, el botón; leyendo, el vídeo.
  const sin = htmlDialogoEmparejar({ camara: false });
  assert.ok(sin.includes('data-emparejar-texto') && sin.includes('data-emparejar-sin-camara') && sin.includes('data-emparejar-leer'));
  assert.ok(!sin.includes('<video') && !sin.includes('data-emparejar-camara'));
  assert.ok(htmlDialogoEmparejar({ camara: true }).includes('data-emparejar-camara'));
  assert.ok(htmlDialogoEmparejar({ camara: true, camaraActiva: true }).includes('<video'));
  // Lo pegado o leído nunca entra como HTML.
  const hostil = htmlDialogoEmparejar({ texto: '</textarea><img src=x onerror=alert(1)>', error: 'emparejarQR_qr_invalid' });
  assert.ok(!hostil.includes('<img') && hostil.includes('&lt;img'));
  assert.ok(hostil.includes(t('emparejarQR_qr_invalid')));
});

test('tras leer: «Emparejada con la app hasta las HH:MM», la huella y «esperando a que la app acepte» hasta «emparejada»; sin libro de la app, abrir uno o restaurar', () => {
  const resultado = { hasta: '2026-11-17T18:00:00.000Z', huella: '6aa3-da9b' };
  const esperandoHtml = htmlDialogoEmparejar({ fase: 'hecho', resultado, aceptada: false, sinLibro: true });
  assert.ok(esperandoHtml.includes(t('emparejarHasta', { hora: horaDe(resultado.hasta) })));
  assert.match(horaDe(resultado.hasta), /^\d\d:\d\d$/);
  assert.ok(esperandoHtml.includes('6aa3-da9b'));
  assert.ok(esperandoHtml.includes(t('emparejarEsperando')));
  assert.ok(!esperandoHtml.includes('data-emparejar-arranque'), 'hasta que acepte, no se abre libro');
  const aceptada = htmlDialogoEmparejar({ fase: 'hecho', resultado, aceptada: true, sinLibro: true });
  assert.ok(aceptada.includes(t('emparejarAceptada')));
  assert.ok(aceptada.includes('data-emparejar-arranque="crear"') && aceptada.includes(t('emparejarAbrirLibro')));
  assert.ok(aceptada.includes('data-emparejar-arranque="restaurar"') && aceptada.includes(t('emparejarRestaurar')));
  assert.ok(!htmlDialogoEmparejar({ fase: 'hecho', resultado, aceptada: true, sinLibro: false }).includes('data-emparejar-arranque'));
  // La línea fija: hasta qué hora, la huella, la conexión, «Leer otro QR» y «Olvidar el emparejamiento».
  const estado = { sesion: SESION, huella: '6aa3-da9b', hasta: resultado.hasta, app: APP, aceptada: false, conectado: false };
  const linea = htmlLineaEmparejamiento({ estado, rele: 'auth_rechazado' });
  for (const k of ['emparejarAuthRechazado', 'emparejarEsperando', 'emparejarLeerOtro', 'emparejarOlvidar']) assert.ok(linea.includes(t(k)), k);
  assert.ok(linea.includes('6aa3-da9b'));
  assert.ok(linea.includes('data-emparejar-olvidar') && linea.includes('data-emparejar'));
  assert.ok(htmlLineaEmparejamiento({ estado: { ...estado, aceptada: true, conectado: true } }).includes(t('emparejarConectado')));
  assert.equal(htmlLineaEmparejamiento({}), '', 'sin emparejamiento ni nada pendiente, nada');
  assert.ok(t('emparejarOlvidarConfirmar').includes('revócalo'), 'olvidar dice la verdad: para cortarlo del todo, en la app');
});

// ---------- con anfitrión, y el arranque ----------

test('con anfitrión presente no se ofrece emparejar y el guardián es el del anfitrión; sin él, el adaptador mientras está vivo', async () => {
  const w = await emparejado();
  try {
    // Sin anfitrión (estas pruebas): el guardián de la página sigue al emparejamiento.
    assert.equal(A.hayAnfitrion, false);
    assert.equal(A.usarGuardian(G.guardianDeLaCarta({ adaptador: w.g, emparejamiento: w.carta })), w.g);
    assert.equal(A.guardian, w.g, 'el enlace vivo: quien lo importa ve el adaptador');
    assert.equal(A.usarGuardian(null), null);
    assert.equal(A.guardian, null);
    // Con anfitrión (el módulo leído con el global puesto): su guardián manda, también emparejada.
    const delAnfitrion = { firmante: () => null, crearCuenta: async () => ({}), cuentas: async () => [], firmar: async () => ({}), sesion: async () => ({ abierta: false }) };
    globalThis.__AGRAM_ANFITRION__ = Object.freeze(delAnfitrion);
    let B;
    try { B = await import('../carta/anfitrion.js?con-anfitrion'); } finally { delete globalThis.__AGRAM_ANFITRION__; }
    assert.equal(B.hayAnfitrion, true);
    assert.equal(B.guardian, B.guardianDelAnfitrion);
    assert.equal(B.usarGuardian(w.g), B.guardianDelAnfitrion, 'el adaptador no lo sustituye');
    assert.equal(B.guardian, B.guardianDelAnfitrion);
    assert.equal(G.guardianDeLaCarta({ delAnfitrion: B.guardianDelAnfitrion, adaptador: w.g, emparejamiento: w.carta }), B.guardianDelAnfitrion);
    // Un anfitrión solo con firmante (sin guardián) tampoco deja emparejar.
    globalThis.__AGRAM_ANFITRION__ = Object.freeze({ firmante: () => null });
    let C;
    try { C = await import('../carta/anfitrion.js?solo-firmante'); } finally { delete globalThis.__AGRAM_ANFITRION__; }
    assert.deepEqual([C.hayAnfitrion, C.usarGuardian(w.g), C.guardian], [true, null, null]);
    // La pantalla: con anfitrión (extra.emparejar null) ni el arranque ni el aviso de solo lectura ofrecen emparejar.
    assert.ok(!htmlArranque({ modo: 'menu' }, { emparejar: null }).includes('data-emparejar'));
    assert.ok(!htmlGuardian({ soloLeer: true, sinGuardian: false }).includes('data-emparejar'));
    // Sin anfitrión: el arranque ofrece «Emparejar con la app»; emparejada, crear abre un libro con la clave de la app.
    const sin = htmlArranque({ modo: 'menu' }, { emparejar: { vivo: false } });
    assert.ok(sin.includes('data-emparejar') && sin.includes(t('emparejarConLaApp')));
    const con = htmlArranque({ modo: 'menu' }, { emparejar: { vivo: true } });
    assert.ok(!con.includes('data-emparejar ') && con.includes(t('emparejarAbrirLibro')) && con.includes('data-arranque="restaurar"'));
  } finally { w.cerrar(); A.usarGuardian(null); }
});

test('«Reglas del libro» lleva al pie la frase de VG, tal cual', () => {
  const html = htmlReglas({ lista: { gobierno: false } });
  assert.ok(html.includes('data-reglas-pie'));
  assert.ok(html.includes('Siempre puedes irte con tu clave, tu copia y la prueba de lo que tenías. Ninguna regla te lo quita. Llevarte la E y los registros de modo que salgan de este libro depende de sus reglas y de quien lo guarda y lo sella.'));
});

test('la firma que asienta tras recargar es la de la app sobre el id: una firma falsa guardada no entra en el libro', async () => {
  await conAlmacen(async () => {
    const w = await emparejado();
    try {
      const r = await conLaApp(Q.crearCuenta({ nombre: 'Víctor', t: T1, guardian: w.g }), w.app);
      const p = preferencias(r.eje, 'victor', { language: 'en' });
      // Un registro firmado «a mano» con otra clave, como si estuviera guardado así: el núcleo no lo deja pasar.
      let capturado = null;
      await salida.escribirDesde(r.eje, { modo: 'sequenced', autor: 'victor', sobre: p.sobre, en: p.en, payload: p.payload, t: T1 }, ({ canonico, id }) => { capturado = { canonico, id }; throw Object.assign(new Error('no'), { code: 'cancelled_by_holder' }); }).catch(() => {});
      assert.ok(capturado);
      const falso = { estado: 'firmado', id: capturado.id, canonico: capturado.canonico, publica: APP, libro: r.eje.genesisId, firma: aHex(schnorr.sign(Uint8Array.from(Buffer.from(capturado.id, 'hex')), Uint8Array.from(Buffer.from('e7'.repeat(32), 'hex')), new Uint8Array(32))) };
      const doble = { propuestas: () => [falso], descartar: async () => { throw new Error('no se descarta lo que no entra'); } };
      const res = await G.asentarFirmadas(doble, r.eje);
      assert.deepEqual(res.asentados, []);
      assert.equal(res.fallidos.length, 1);
      assert.equal(r.eje.obtener(capturado.id), undefined);
    } finally { w.cerrar(); }
  });
});

test('nada de la sesión sale por el adaptador: ni cuentas, ni sesion, ni los errores llevan la privada', async () => {
  const w = await emparejado({ modo: { hola: 'aceptar', propuesta: 'rechazar', code: 'cancelled_by_holder' } });
  try {
    const priv = V.claves.sesion.privada;
    const dicho = JSON.stringify([await w.g.cuentas(), await w.g.sesion(APP), w.carta.estado(), w.carta.propuestas()]);
    assert.ok(!dicho.includes(priv));
    const e = await conLaApp(errorDe(w.g.firmar(await propuestaDe(await registro('x')))), w.app);
    assert.ok(!JSON.stringify({ m: e.message, c: e.code, e: e.emparejamiento }).includes(priv));
    assert.equal(AHORA, Date.parse(V.ahora));
  } finally { w.cerrar(); }
});

// ---------- flecos: el aviso del guardián con emparejamiento y la confirmación dentro de la página ----------

test('el aviso del guardián, cuando firma el emparejamiento: en plazo dice que cada registro se confirma en la app; terminado, que terminó y ofrece volver a emparejar; con anfitrión, los de siempre', () => {
  const vivo = htmlGuardian({ sesionCerrada: true, puedeAbrir: false, emparejar: true, porEmparejamiento: 'vivo' });
  assert.ok(vivo.includes('Cada registro se confirma en la app del móvil.'));
  assert.ok(!vivo.includes('guardián'), 'no habla de la sesión del guardián');
  assert.ok(!vivo.includes('data-guardian-abrir') && !vivo.includes('data-emparejar'), 'ni abrir sesión ni volver a emparejar');
  const terminado = htmlGuardian({ sesionCerrada: true, puedeAbrir: false, emparejar: true, porEmparejamiento: 'terminado' });
  assert.ok(terminado.includes('El emparejamiento con la app terminó. Vuelve a emparejar para escribir.'));
  assert.ok(!terminado.includes('guardián') && !terminado.includes('data-guardian-abrir'));
  assert.ok(terminado.includes('data-emparejar') && terminado.includes('Volver a emparejar'), 'con el gesto que ya existe');
  for (const k of ['emparejarFirmaEnLaApp', 'emparejarTerminado', 'emparejarSeguir']) assert.ok(existe(k), k);
  // Con anfitrión (sin porEmparejamiento), los textos de siempre.
  assert.ok(htmlGuardian({ sesionCerrada: true, puedeAbrir: true }).includes(t('guardianSesionCerrada')));
  assert.ok(htmlGuardian({ sesionCerrada: true, puedeAbrir: false }).includes(t('guardianSesionCerradaSinBoton')));
});

/** Un documento mínimo para instalar la pantalla sin navegador: guarda sus oyentes y da lo que la pantalla le pide por selector. */
function documentoDePrueba() {
  const oyentes = new Map();
  const dialogo = { innerHTML: '', texto: { value: '', focus() {} }, querySelector(s) { return s === '[data-emparejar-texto]' ? this.texto : /confirmar="no"/.test(s) ? { focus() {} } : null; } };
  const linea = { innerHTML: '', querySelector: () => null };
  const caja = { className: '', set innerHTML(_) {}, querySelector: (s) => (s.includes('linea') ? linea : dialogo) };
  const documento = { visibilityState: 'visible', createElement: () => caja, addEventListener: (tipo, f) => oyentes.set(tipo, [...(oyentes.get(tipo) ?? []), f]), documentElement: { style: { setProperty() {}, removeProperty() {} } } };
  const raiz = { ownerDocument: documento, after() {} };
  const pulsa = (selector, extra = {}) => {
    const el = { dataset: extra, disabled: false };
    const e = { target: { closest: (s) => (s === selector ? el : null), matches: () => false }, preventDefault() {} };
    for (const f of oyentes.get('click') ?? []) f(e);
  };
  return { raiz, dialogo, linea, pulsa };
}

test('olvidar el emparejamiento pregunta dentro de la página, no con el confirm del navegador: Cancelar no hace nada y Seguir lo olvida', async () => {
  const w = await emparejado();
  try {
    let usadoElConfirm = 0;
    const d = documentoDePrueba();
    instalar({ raiz: d.raiz, emparejamiento: w.carta, entorno: { confirm: () => { usadoElConfirm += 1; return true; } } });
    d.pulsa('[data-emparejar-olvidar]');
    assert.ok(d.dialogo.innerHTML.includes('data-emparejar-confirmar-texto') && d.dialogo.innerHTML.includes(t('emparejarOlvidarConfirmar')), 'la pregunta está en la página');
    assert.ok(d.dialogo.innerHTML.includes('data-emparejar-confirmar="si"') && d.dialogo.innerHTML.includes('data-emparejar-confirmar="no"'));
    assert.ok(w.carta.estado(), 'aún no se ha olvidado nada');
    d.pulsa('[data-emparejar-confirmar]', { emparejarConfirmar: 'no' });
    await new Promise((ok) => setImmediate(ok));
    assert.equal(d.dialogo.innerHTML, '', 'la pregunta se cierra');
    assert.ok(w.carta.estado(), 'Cancelar: sigue emparejada');
    d.pulsa('[data-emparejar-olvidar]');
    d.pulsa('[data-emparejar-confirmar]', { emparejarConfirmar: 'si' });
    await hasta(() => w.carta.estado() === null, w.app, 'olvidada');
    assert.equal(usadoElConfirm, 0, 'el confirm del navegador no se toca');
  } finally { w.cerrar(); }
});

test('leer otro QR con propuestas esperando pregunta dentro de la página; sin Seguir no se empareja otra vez', async () => {
  const w = await emparejado({ modo: { hola: 'aceptar', propuesta: 'callar' } });
  try {
    const firmando = w.g.firmar(await propuestaDe(await registro('esperando')));
    firmando.catch(() => {});
    await hasta(() => G.esperando(w.carta).length === 1, w.app);
    let usadoElConfirm = 0;
    const d = documentoDePrueba();
    instalar({ raiz: d.raiz, emparejamiento: w.carta, adaptador: w.g, entorno: { confirm: () => { usadoElConfirm += 1; return true; } } });
    const antes = w.carta.estado().sesion;
    d.dialogo.texto.value = 'no es un QR';
    d.pulsa('[data-emparejar]'); // abre el diálogo
    d.pulsa('[data-emparejar-leer]');
    assert.ok(d.dialogo.innerHTML.includes(t('emparejarSustituirConfirmar', { n: 1 })), 'avisa de que caducarán');
    d.pulsa('[data-emparejar-confirmar]', { emparejarConfirmar: 'no' });
    await new Promise((ok) => setImmediate(ok));
    assert.ok(!d.dialogo.innerHTML.includes('data-emparejar-confirmar-texto'));
    assert.equal(w.carta.estado().sesion, antes, 'Cancelar: nada cambia');
    assert.equal(G.esperando(w.carta).length, 1, 'lo propuesto sigue esperando');
    assert.equal(usadoElConfirm, 0);
    // Seguir: con un texto que no es un QR, la frase llana en el propio diálogo (y la pregunta ya no está).
    d.pulsa('[data-emparejar-leer]');
    d.pulsa('[data-emparejar-confirmar]', { emparejarConfirmar: 'si' });
    await new Promise((ok) => setTimeout(ok, 20));
    assert.ok(d.dialogo.innerHTML.includes(t('emparejarQR_qr_invalid')));
    assert.ok(!d.dialogo.innerHTML.includes('data-emparejar-confirmar-texto'));
    assert.equal(usadoElConfirm, 0);
  } finally { w.cerrar(); }
});

test('la confirmación de la página escapa su texto y lleva Seguir y Cancelar', () => {
  const h = htmlConfirmarEmparejar({ texto: '<b>¿Seguir?</b>' });
  assert.ok(h.includes('&lt;b&gt;') && !h.includes('<b>¿'));
  assert.ok(h.includes('data-emparejar-confirmar="si"') && h.includes(t('emparejarSeguir')));
  assert.ok(h.includes('data-emparejar-confirmar="no"') && h.includes(t('emparejarCancelar')));
});

// ---------- emparejada y sin libros: entrar en un libro al que me han invitado (carta/invitado.js) ----------

test('emparejada sin libros: el diálogo y el arranque ofrecen entrar por invitación; quien entra es la cuenta de la app (guardian: true, sin privada)', async () => {
  const resultado = { hasta: '2026-11-17T18:00:00.000Z', huella: '6aa3-da9b' };
  const h = htmlDialogoEmparejar({ fase: 'hecho', resultado, aceptada: true, sinLibro: true });
  const [crear, invitar, restaurar] = ['crear', 'invitado', 'restaurar'].map((q) => h.indexOf(`data-emparejar-arranque="${q}"`));
  assert.ok(crear > 0 && invitar > crear && restaurar > invitar, 'el de la invitación, entre los otros dos');
  assert.ok(h.includes(`<button type="button" class="principal" data-emparejar-arranque="crear">`), 'abrir un libro sigue siendo el principal');
  assert.ok(h.includes(t('invitadoEntrar')));
  assert.ok(!htmlDialogoEmparejar({ fase: 'hecho', resultado, aceptada: false, sinLibro: true }).includes('data-emparejar-arranque="invitado"'), 'hasta que la app acepta, no');
  // El arranque sin cuenta: con el emparejamiento vivo y aceptado, el mismo botón; sin aceptar o sin emparejar, no.
  assert.ok(htmlArranque({ modo: 'menu' }, { emparejar: { vivo: true, aceptada: true } }).includes('data-libro-invitado'));
  assert.ok(!htmlArranque({ modo: 'menu' }, { emparejar: { vivo: true, aceptada: false } }).includes('data-libro-invitado'));
  assert.ok(!htmlArranque({ modo: 'menu' }, { emparejar: { vivo: false } }).includes('data-libro-invitado'));
  assert.ok(htmlArranque({ modo: 'menu', conClave: true }, { emparejar: null }).includes('data-libro-invitado'), 'con una cuenta abierta, como hoy');
  // Quien entra.
  const { quienEntra } = await import('../carta/invitado.js');
  const w = await emparejado({ modo: { hola: 'aceptar', propuesta: 'firmar' } });
  try {
    assert.deepEqual(quienEntra({ emparejamiento: w.carta, idioma: 'es' }), { publica: APP, guardian: true, idioma: 'es' });
    const cuenta = { nombre: 'Abierta', publica: 'ab'.repeat(32), identidad: 'abierta', alta: 'cd'.repeat(32) };
    assert.equal(quienEntra({ cuenta, emparejamiento: w.carta }), cuenta, 'con una cuenta abierta, nada cambia');
    assert.equal(quienEntra({}), null);
  } finally { w.cerrar(); }
  const sinAceptar = mundo({ modo: { hola: 'callar', propuesta: 'firmar' } });
  try {
    await sinAceptar.carta.emparejar(V.qr.texto);
    assert.equal(quienEntra({ emparejamiento: sinAceptar.carta }), null, 'sin aceptar, nadie');
  } finally { sinAceptar.cerrar(); }
});

test('emparejada sin libros, con mi alta ya hecha: «Añadirlo a tus libros» guarda la entrada con guardian: true y el libro se abre con la cuenta de la app; aceptar se propone a la app con el libro de ese génesis', async () => {
  await conAlmacen(async () => {
    const { quienEntra, entradaDelLibro, vistaDeInvitacion } = await import('../carta/invitado.js');
    const w = await emparejado({ modo: { hola: 'aceptar', propuesta: 'firmar' } });
    try {
      const duena = await Q.crearCuenta({ nombre: 'Dueña inventada' });
      const t0 = Date.now();
      const inv = await duena.eje.invitar({ autor: duena.cuenta.identidad, invitado: 'vg-invitada', clave: APP, t: new Date(t0 + 2000).toISOString(), privada: duena.privada });
      const quien = quienEntra({ emparejamiento: w.carta, idioma: 'es' });
      // Aceptar: el alta la firma la app, propuesta por el guardián emparejado sobre ESE eje (su libro: el génesis) y con diálogo.
      assert.equal(vistaDeInvitacion(duena.eje, quien.publica).invitaciones[0].id, inv.id);
      const firmante = A.firmanteDeCuenta(w.g, quien.publica, { eje: () => duena.eje, dialogo: true });
      const alta = await conLaApp(duena.eje.aceptar(inv.id, { publica: quien.publica, privada: firmante }, { t: new Date(t0 + 4000).toISOString() }), w.app);
      const propuesta = w.app.recibidos.filter((m) => m.tipo === 'propuesta').at(-1);
      assert.equal(propuesta.libro, duena.eje.genesisId, 'la propuesta dice el libro: el génesis del libro bajado');
      assert.equal(propuesta.id, alta.id);
      // Mi alta ya está con la clave de la app: solo «Añadirlo a tus libros», sin firma.
      const vista = vistaDeInvitacion(duena.eje, quien.publica);
      assert.deepEqual(vista.miAlta, { identidad: 'vg-invitada', alta: alta.id });
      assert.deepEqual(vista.invitaciones, []);
      const cuenta = entradaDelLibro(quien, { nombre: 'Libro invitado', identidad: vista.miAlta.identidad, alta: vista.miAlta.alta });
      assert.deepEqual(cuenta, { nombre: 'Libro invitado', idioma: 'es', identidad: 'vg-invitada', alta: alta.id, publica: APP, guardian: true });
      assert.ok(await Q.guardarCuenta({ cuenta, eje: duena.eje, privada: quien.privada, claveLectura: 'x'.repeat(43) }, { recordar: false }));
      assert.equal(Q.cuentas().find((c) => c.alta === alta.id).guardian, true);
      // Dentro: se abre con el guardián emparejado (la cuenta de la app), no solo para leer.
      const r = await Q.abrirCuenta(alta.id, { guardian: w.g });
      assert.ok(r.eje, r.motivo);
      assert.deepEqual([r.cuenta.guardian, r.cuenta.publica, r.soloLeer ?? false], [true, APP, false]);
    } finally { w.cerrar(); }
  });
});

// ---------- el libro de cuenta al emparejar (Carril F, 18-11; agram-equipo/LIBRO_DE_CUENTA_ALOJADO.md §6 y §9, StateArk §3 y §4) ----------

const CON_CUENTA = { hola: 'aceptar', propuesta: 'firmar' };
/** Un mundo cuya carta anuncia la época de cuenta, emparejado y aceptado, con su adaptador. */
async function emparejadoConCuenta(modo = CON_CUENTA) {
  const w = mundo({ modo, epocaDeCuenta: ID_EPOCA_DE_CUENTA });
  await w.carta.emparejar(V.qr.texto);
  await hasta(() => w.carta.estado()?.aceptada, w.app, 'emparejada');
  w.g = G.guardianEmparejado(w.carta, { reloj: w.reloj });
  return w;
}
/** Lo que sale por la consola mientras dura `fn`. */
async function conConsola(fn) {
  const dicho = [];
  const antes = {};
  for (const k of ['log', 'error', 'warn', 'info', 'debug']) { antes[k] = console[k]; console[k] = (...a) => dicho.push(a.map(String).join(' ')); }
  try { return { valor: await fn(), dicho }; } finally { Object.assign(console, antes); }
}
const SECRETOS = [CLAVES_DE_PRUEBA.lectura, CLAVES_DE_PRUEBA.escritura, CLAVES_DE_PRUEBA.contenido];
const ORDEN = Object.freeze({ schema: 'agram.orden@1', eje: CLAVES_DE_PRUEBA.eje, accion: 'crear', n: 0, lectura: 'a1'.repeat(32), escritura: 'b2'.repeat(32), cuando: '2026-11-17T10:30:00Z' });

test('libro de cuenta: «hola» anuncia la época; «emparejada» trae el permiso de 10 minutos y estado() lo dice (y se guarda con la sesión); una app vieja, sin él', async () => {
  assert.ok(ID_EPOCA_DE_CUENTA, 'la época de cuenta se conoce');
  const w = await emparejadoConCuenta();
  try {
    const hola = w.app.recibidos.find((m) => m.tipo === 'hola');
    assert.deepEqual(hola.cuenta, { epoca: ID_EPOCA_DE_CUENTA });
    const e = w.carta.estado();
    assert.deepEqual(e.cuenta, { epoca: ID_EPOCA_DE_CUENTA, permiso: { hasta: new Date(AHORA + PERMISO_MS).toISOString() } });
    assert.equal(G.permisoDeCuenta(e, { epoca: ID_EPOCA_DE_CUENTA, reloj: w.reloj }), true);
    assert.equal(G.permisoDeCuenta(e, { epoca: 'ab'.repeat(32), reloj: w.reloj }), false, 'otra época, no');
    assert.equal(G.permisoDeCuenta(e, { epoca: ID_EPOCA_DE_CUENTA, reloj: () => AHORA + PERMISO_MS }), false, 'caducado, no');
    // Se guarda con la sesión: otra carta sobre el mismo almacén lo recupera.
    const otra = w.nueva();
    try {
      await otra.cargar();
      assert.deepEqual(otra.estado().cuenta, e.cuenta);
    } finally { otra.cerrar(); }
  } finally { w.cerrar(); }
  // Sin época anunciada, «hola» va como siempre; una app vieja no da permiso.
  const sin = mundo({ modo: CON_CUENTA });
  try {
    await sin.carta.emparejar(V.qr.texto);
    await hasta(() => sin.carta.estado()?.aceptada, sin.app);
    assert.ok(!('cuenta' in sin.app.recibidos.find((m) => m.tipo === 'hola')));
    assert.equal(sin.carta.estado().cuenta, null);
  } finally { sin.cerrar(); }
  const vieja = await emparejadoConCuenta({ ...CON_CUENTA, cuenta: 'vieja' });
  try {
    assert.equal(vieja.carta.estado().cuenta, null);
  } finally { vieja.cerrar(); }
});

test('pedirClaves: da las siete; lectura, escritura y contenido no van al almacén, ni a los avisos, ni a la consola; not_accepted, unknown_account, no_answer y el fin de la sesión, cada uno con su code', async () => {
  const w = await emparejadoConCuenta();
  try {
    const { valor, dicho } = await conConsola(() => conLaApp(w.carta.pedirClaves({ publica: APP }), w.app));
    assert.deepEqual(valor, { ...CLAVES_DE_PRUEBA });
    assert.deepEqual(w.app.recibidos.find((m) => m.tipo === 'pedir_claves'), { schema: M, tipo: 'pedir_claves', publica: APP });
    const guardado = JSON.stringify(w.almacen.volcado());
    for (const s of SECRETOS) {
      assert.ok(!guardado.includes(s), 'nada secreto en el almacén');
      assert.ok(!JSON.stringify(w.avisos).includes(s), 'ni en los avisos');
      assert.ok(!dicho.some((x) => x.includes(s)), 'ni en la consola');
      assert.ok(!JSON.stringify(w.carta.estado()).includes(s), 'ni en estado()');
    }
  } finally { w.cerrar(); }
  for (const [claves, code] of [['no_aceptada', 'not_accepted'], ['rechazar', 'unknown_account']]) {
    const x = await emparejadoConCuenta({ ...CON_CUENTA, claves });
    try {
      assert.equal(await codeDe(conLaApp(x.carta.pedirClaves({ publica: APP }), x.app)), code);
    } finally { x.cerrar(); }
  }
  const muda = await emparejadoConCuenta({ ...CON_CUENTA, claves: 'callar' });
  try {
    const p = muda.carta.pedirClaves({ publica: APP });
    p.catch(() => {});
    await hasta(() => muda.app.recibidos.some((m) => m.tipo === 'pedir_claves'), muda.app);
    muda.temporizador.disparar(); // pasa el plazo
    assert.equal(await codeDe(p), 'no_answer');
    const q = muda.carta.pedirClaves({ publica: APP });
    q.catch(() => {});
    await muda.carta.olvidar();
    assert.equal(await codeDe(q), 'pairing_forgotten', 'al terminar la sesión, lo pedido acaba con su code');
    assert.equal(await codeDe(muda.carta.pedirClaves({ publica: APP })), 'no_pairing');
  } finally { muda.cerrar(); }
});

test('firmarGobierno: la firma con gobierno sobre el id de la orden (el SHA-256 de su canónico), comprobada con la pública de «claves»; un rechazo con ese id da su code', async () => {
  const w = await emparejadoConCuenta();
  try {
    await conLaApp(w.carta.pedirClaves({ publica: APP }), w.app);
    const r = await conLaApp(w.carta.firmarGobierno({ publica: APP, orden: ORDEN }), w.app);
    assert.equal(r.id, createHash('sha256').update(canonico(ORDEN)).digest('hex'));
    assert.equal(verificarBip340(hex(r.firma), hex(r.id), hex(CLAVES_DE_PRUEBA.gobierno)), true);
    assert.deepEqual(w.app.recibidos.find((m) => m.tipo === 'gobierno'), { schema: M, tipo: 'gobierno', publica: APP, orden: ORDEN });
  } finally { w.cerrar(); }
  const no = await emparejadoConCuenta({ ...CON_CUENTA, gobierno: 'rechazar' });
  try {
    assert.equal(await codeDe(conLaApp(no.carta.firmarGobierno({ publica: APP, orden: ORDEN }), no.app)), 'cancelled_by_holder');
    assert.equal(await codeDe(no.carta.firmarGobierno({ publica: APP, orden: 'no' })), 'message_invalid');
  } finally { no.cerrar(); }
});

/** Crear la cuenta como app.js (`crear`) con la app emparejada: genesisDeCuenta y crearCuenta con el guardián emparejado. */
async function crearConLaApp(w, { nombre = 'Víctor Inventado', idioma = 'es' } = {}) {
  const deCuenta = await conLaApp(G.genesisDeCuenta(w.carta, { epoca: ID_EPOCA_DE_CUENTA, reloj: w.reloj }), w.app);
  const guardian = G.guardianDeLaCarta({ adaptador: w.g, emparejamiento: w.carta });
  const antes = w.app.recibidos.filter((m) => m.tipo === 'propuesta').length;
  const r = await conLaApp(Q.crearCuenta({ nombre, idioma, t: T1, htmlInicial: true, guardian, epoca: deCuenta.epoca, ...(deCuenta.contexto ? { contexto: deCuenta.contexto } : {}) }), w.app);
  return { r, deCuenta, propuestas: w.app.recibidos.filter((m) => m.tipo === 'propuesta').slice(antes) };
}
const tutorialDe = async (eje, quien) => (await Acc.camino(eje, eje.alta(quien).id, quien, { t: T1, idioma: 'es' })).pasos.filter((p) => p.fuente === 'tutorial').map((p) => [p.hacer?.plantilla ?? p.regla, p.hecho, p.falta ?? null]);

test('crear la cuenta emparejada: el génesis es UN registro con la época de cuenta por id y el eje y el next de la app; la app lo firma sin segundo diálogo; el aviso «tu cuenta está solo aquí» sale como en una del navegador', async () => {
  await conAlmacen(async () => {
    const w = await emparejadoConCuenta();
    try {
      const { r, deCuenta, propuestas } = await crearConLaApp(w);
      assert.deepEqual(deCuenta.contexto, { eje: CLAVES_DE_PRUEBA.eje, next: CLAVES_DE_PRUEBA.next }, 'solo eje y next: lo secreto se suelta');
      const g = r.eje.obtener(r.eje.genesisId);
      assert.equal(g.sobre, null);
      assert.deepEqual(Object.keys(g.contexto).sort(), ['claves', 'eje', 'epoca', 'genesis', 'next']);
      assert.deepEqual(g.contexto, { eje: CLAVES_DE_PRUEBA.eje, genesis: true, epoca: ID_EPOCA_DE_CUENTA, claves: { 'victor-inventado': APP }, next: CLAVES_DE_PRUEBA.next });
      assert.equal(g.payload, 'Víctor Inventado');
      assert.equal(r.eje.epoca().id, ID_EPOCA_DE_CUENTA);
      assert.equal(propuestas[0].id, r.eje.genesisId, 'el génesis, la primera propuesta: una sola, no una tanda');
      assert.deepEqual(w.app.sinDialogo, [r.eje.genesisId], 'la app lo firma sin segundo diálogo (y solo a él: el permiso es de un uso)');
      // Lo que nace detrás, como hoy: el idioma (si no es el de la época, «es») y la página inicial.
      assert.equal(propuestas.length, r.eje.orden.length, 'una propuesta por registro');
      assert.equal(propuestas.length, 2, 'en español (el de la época): génesis y página inicial');
      for (const id of r.eje.orden) assert.equal(await autoridad.verificar(r.eje.obtener(id), APP), true);
      assert.deepEqual((await Eje.desde(persistencia.serializar(r.eje).eventos, { exigirFirmas: true })).epoca().id, ID_EPOCA_DE_CUENTA);
      // El aviso de la guía de inicio, igual que en una cuenta del navegador (nacida con la época escrita).
      const navegador = await Q.crearCuenta({ nombre: 'Víctor Inventado', idioma: 'es', t: T1, htmlInicial: true, epoca: EPOCA_DE_CUENTA_DATOS });
      const pasos = await tutorialDe(r.eje, r.cuenta.identidad);
      assert.deepEqual(pasos, await tutorialDe(navegador.eje, navegador.cuenta.identidad));
      assert.equal(pasos[0][2], 'tu cuenta está solo aquí: haz un respaldo o únete a un nodo');
    } finally { w.cerrar(); }
    // En inglés: el génesis, el idioma y la página inicial, tres propuestas (y una más por cada grupo de ajustes del sitio).
    const en = await emparejadoConCuenta();
    try {
      const { propuestas } = await crearConLaApp(en, { idioma: 'en' });
      assert.equal(propuestas.length, 3);
    } finally { en.cerrar(); }
  });
});

test('una app vieja o el permiso caducado: el génesis nace igual con la época de cuenta por id, sin eje ni next, sin pedir claves; la app saca su diálogo', async () => {
  await conAlmacen(async () => {
    for (const caso of ['vieja', 'caducado']) {
      const w = await emparejadoConCuenta(caso === 'vieja' ? { ...CON_CUENTA, cuenta: 'vieja' } : CON_CUENTA);
      try {
        if (caso === 'caducado') w.ahora = AHORA + PERMISO_MS + 1000;
        const { r, deCuenta } = await crearConLaApp(w);
        assert.deepEqual(deCuenta, { epoca: { base: ID_EPOCA_DE_CUENTA, cambios: [] } }, caso);
        const g = r.eje.obtener(r.eje.genesisId);
        assert.deepEqual(Object.keys(g.contexto).sort(), ['claves', 'epoca', 'genesis'], caso);
        assert.equal(g.contexto.epoca, ID_EPOCA_DE_CUENTA);
        assert.ok(!w.app.recibidos.some((m) => m.tipo === 'pedir_claves'), caso + ': no se piden claves');
        assert.deepEqual(w.app.sinDialogo, [], caso + ': con el diálogo de siempre');
      } finally { w.cerrar(); }
    }
    // Sin época de cuenta (la copia generada no cargó): nada que nombrar, el génesis nace como antes.
    assert.equal(await G.genesisDeCuenta(null, { epoca: null }), null);
  });
});

test('la pantalla: aceptada, sin libro de la app y con permiso, se va derecho al formulario de nombre e idioma, con invitación y restaurar debajo; sin permiso, el diálogo de siempre', async () => {
  for (const conPermiso of [true, false]) {
    const w = mundo({ modo: conPermiso ? CON_CUENTA : { ...CON_CUENTA, cuenta: 'vieja' }, epocaDeCuenta: ID_EPOCA_DE_CUENTA });
    try {
      const d = documentoDePrueba();
      const abiertos = [];
      const p = instalar({ raiz: d.raiz, emparejamiento: w.carta, sinLibro: () => true, cuentaNueva: () => G.permisoDeCuenta(w.carta.estado(), { epoca: ID_EPOCA_DE_CUENTA, reloj: w.reloj }), abrirArranque: (que) => abiertos.push(que), entorno: {} });
      d.pulsa('[data-emparejar]');
      d.dialogo.texto.value = V.qr.texto;
      d.pulsa('[data-emparejar-leer]');
      await hasta(() => w.carta.estado()?.aceptada, w.app, 'emparejada');
      p.avisar({ tipo: 'emparejada' });
      if (conPermiso) {
        assert.deepEqual(abiertos, ['crear'], 'derecho a crear');
        assert.equal(d.dialogo.innerHTML, '', 'sin el paso de «abrir un libro con la clave de la app»');
        p.avisar({ tipo: 'emparejada' });
        assert.deepEqual(abiertos, ['crear'], 'una vez');
      } else {
        assert.deepEqual(abiertos, []);
        assert.ok(d.dialogo.innerHTML.includes('data-emparejar-arranque="crear"'), 'el diálogo de siempre');
      }
    } finally { w.cerrar(); }
  }
  const h = htmlArranque({ modo: 'crear', campos: Q.camposDelAlta({ idioma: 'es' }), conLaApp: true });
  assert.ok(h.includes(t('cuentaConLaApp')) && h.includes(t('cuentaConLaAppAyuda')));
  assert.ok(h.includes('name="nombre"') && h.includes('name="idioma"'), 'nombre e idioma');
  assert.ok(h.indexOf('type="submit"') < h.indexOf('data-libro-invitado') && h.includes('data-arranque="restaurar"'), 'crear lo principal; invitación y restaurar, debajo');
  assert.ok(!htmlArranque({ modo: 'crear', campos: Q.camposDelAlta({ idioma: 'es' }) }).includes('data-crear-otros'), 'sin la app, como siempre');
  for (const k of ['cuentaConLaApp', 'cuentaConLaAppAyuda', 'cuentaConLaAppOtros', 'cuentaSinClaves']) assert.ok(existe(k) && typeof TEXTOS.en[k] === 'string' && TEXTOS.en[k] !== TEXTOS.es[k], k);
});

// ---------- lo que pidió Core StateArk al contestar (18-11): la app v1, las claves que no cuadran y sin claves no hay génesis ----------

test('app v1: rechaza el «hola» con «cuenta» (message_invalid, id de la sesión); la carta lo reenvía sin «cuenta» una sola vez y sigue como v1, sin permiso, y así lo recuerda', async () => {
  await conAlmacen(async () => {
    const w = await emparejadoConCuenta({ ...CON_CUENTA, app: 'v1' });
    try {
      const holas = w.app.recibidos.filter((m) => m.tipo === 'hola');
      assert.equal(holas.length, 2);
      assert.deepEqual([Boolean(holas[0].cuenta), 'cuenta' in holas[1]], [true, false], 'el segundo, sin «cuenta»');
      assert.equal(w.carta.estado().cuenta, null, 'sin permiso de cuenta');
      assert.equal(w.carta.estado().aceptada, true, 'la sesión sigue, no se revoca');
      assert.equal(Object.values(w.almacen.volcado()).find((v) => v?.delegacion)?.v1, true, 'se guarda con la sesión');
      // Recargar: sin otro «hola», y sigue sin permiso.
      const otra = w.nueva();
      try {
        await otra.cargar();
        assert.equal(otra.estado().cuenta, null);
      } finally { otra.cerrar(); }
      await hasta(() => true, w.app);
      assert.equal(w.app.recibidos.filter((m) => m.tipo === 'hola').length, 2, 'recargar no manda otro «hola»');
      // Crear: el camino de antes, sin permiso: por id, sin eje ni next y sin pedir claves.
      const { r, deCuenta } = await crearConLaApp(w);
      assert.deepEqual(deCuenta, { epoca: { base: ID_EPOCA_DE_CUENTA, cambios: [] } });
      assert.deepEqual(Object.keys(r.eje.obtener(r.eje.genesisId).contexto).sort(), ['claves', 'epoca', 'genesis']);
      assert.ok(!w.app.recibidos.some((m) => m.tipo === 'pedir_claves'));
    } finally { w.cerrar(); }
  });
  // Una sola vez: a una app que rechaza todo «hola», la carta no insiste.
  const terca = mundo({ modo: { ...CON_CUENTA, app: 'siempre_invalido' }, epocaDeCuenta: ID_EPOCA_DE_CUENTA });
  try {
    await terca.carta.emparejar(V.qr.texto);
    await hasta(() => terca.app.recibidos.filter((m) => m.tipo === 'hola').length === 2, terca.app, 'el reenvío');
    for (let i = 0; i < 20; i++) { await terca.app.atender(); await new Promise((ok) => setImmediate(ok)); }
    assert.equal(terca.app.recibidos.filter((m) => m.tipo === 'hola').length, 2, 'dos «hola» y no más');
    assert.equal(terca.carta.estado().aceptada, false);
  } finally { terca.cerrar(); }
});

test('claves: el eje ha de ser el SHA-256 de los 32 bytes de la pública de gobierno (no del texto hex); si no cuadra, keys_invalid, como si no hubiera claves', async () => {
  assert.equal(E.clavesCuadran(CLAVES_DE_PRUEBA), true);
  assert.equal(E.clavesCuadran({ ...CLAVES_DE_PRUEBA, eje: 'e1'.repeat(32) }), false);
  assert.equal(E.clavesCuadran({ ...CLAVES_DE_PRUEBA, next: 'ab' }), false);
  assert.equal(E.clavesCuadran({ ...CLAVES_DE_PRUEBA, gobierno: 'ff'.repeat(32) }), false, 'una pública que no es un punto');
  for (const claves of ['eje_falso', 'eje_del_texto']) {
    const w = await emparejadoConCuenta({ ...CON_CUENTA, claves });
    try {
      assert.equal(await codeDe(conLaApp(w.carta.pedirClaves({ publica: APP }), w.app)), 'keys_invalid', claves);
    } finally { w.cerrar(); }
  }
});

test('con permiso y sin claves (no cuadran, rechazo o sin respuesta) no hay génesis de cuenta: no se propone nada y la carta lo dice en llano, en el mismo formulario', async () => {
  await conAlmacen(async () => {
    for (const claves of ['eje_falso', 'rechazar', 'callar']) {
      const w = await emparejadoConCuenta({ ...CON_CUENTA, claves });
      try {
        const p = G.genesisDeCuenta(w.carta, { epoca: ID_EPOCA_DE_CUENTA, reloj: w.reloj });
        p.catch(() => {});
        if (claves === 'callar') {
          await hasta(() => w.app.recibidos.some((m) => m.tipo === 'pedir_claves'), w.app);
          w.temporizador.disparar(); // pasan los 60 s
        }
        const e = await conLaApp(p.then(() => null, (x) => x), w.app);
        assert.equal(e?.sinClavesDeCuenta, { eje_falso: 'keys_invalid', rechazar: 'unknown_account', callar: 'no_answer' }[claves], claves);
        assert.ok(!w.app.recibidos.some((m) => m.tipo === 'propuesta'), claves + ': ningún génesis propuesto');
        assert.deepEqual(Q.cuentas(), [], claves + ': nada guardado');
      } finally { w.cerrar(); }
    }
  });
  // La carta (app.js, crear): ese error se dice con su frase y el formulario queda (no se toca estado.arranque).
  const app = readFileSync('carta/app.js', 'utf8');
  const crear = app.slice(app.indexOf('async crear(form) {'), app.indexOf('async restaurar(form) {'));
  assert.ok(crear.includes("sinClaves ? t('cuentaSinClaves')"));
  assert.ok(!crear.slice(crear.indexOf('} catch (e) {')).includes('estado.arranque ='), 'el formulario «Tu cuenta, con la app» sigue para reintentar');
  assert.match(t('cuentaSinClaves'), /actualiza la app o vuelve a emparejar/i);
});
