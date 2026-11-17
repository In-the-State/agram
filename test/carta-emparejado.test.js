// La pantalla del emparejamiento por QR (A25, camino B sin anfitrión; carta/guardian-emparejado.js, carta/emparejar.js,
// docs/notas/EMPAREJAMIENTO.md «La pantalla»): el emparejamiento hace de guardián. Sin navegador: almacén en memoria,
// relé y app SIMULADOS (test/ayudas-emparejamiento.js; la app firma con la clave de la cuenta, que es la larga) y un
// localStorage simulado para las cuentas. Nada ha hablado con un relé real ni con la app real.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Eje, autoridad, persistencia, salida } from '../src/index.js';
import { crearEvento, canonico, cuerpo } from '../src/evento.js';
import { schnorr } from '../src/vendor/noble-secp256k1.js';
import * as Q from '../carta/cuentas.js';
import * as A from '../carta/anfitrion.js';
import * as G from '../carta/guardian-emparejado.js';
import { htmlLineaEmparejamiento, htmlDialogoEmparejar, horaDe } from '../carta/emparejar.js';
import { htmlGuardian, htmlArranque, htmlReglas } from '../carta/dom.js';
import { preferencias } from '../carta/carta.js';
import { TEXTOS, t } from '../carta/textos.js';
import { publicaDe } from '../src/autoridad.js';
import { V, APP, SESION, M, AHORA, qr, revocacion, hasta, conLaApp, mundo, aHex } from './ayudas-emparejamiento.js';

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
