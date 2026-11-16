// La cuenta en el guardián (camino B del alta, VG 17-11; docs/ANFITRION.md «La cuenta en el guardián»): con un anfitrión
// que ofrece crearCuenta, cuentas, firmar y sesion, la cuenta nace en el guardián y la carta firma TODO con él; la carta
// nunca ve la clave privada. Aquí, un anfitrión simulado (una clave en memoria detrás de los cinco verbos): crear no deja
// clave en el almacén y el libro vale con exigirFirmas; escribir, una transacción, autoejecutar, invitar y aceptar firman
// por el guardián; `segundoFactor` va verdadero solo cuando un criterio alcanza a la candidata; un rechazo no deja nada y
// se dice en llano; con la sesión cerrada la sincronía no intenta firmar; sin la cuenta en el guardián se abre para leer;
// la copia no lleva clave; el servicio de pagos firma por firmarServicio; y sin anfitrión, el camino A de siempre.
// Claves de PRUEBA, generadas en cada prueba.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Eje, autoridad, persistencia, salida, acciones, contrato, sincronia } from '../src/index.js';
import { schnorr } from '../src/vendor/noble-secp256k1.js';
import { aHex, deHex } from '../src/cripto.js';
import { idNip98 } from '../src/pago.js';
import * as Q from '../carta/cuentas.js';
import * as S from '../carta/sincronia.js';
import * as G from '../carta/guia.js';
import { enviar, preferencias } from '../carta/carta.js';
import { htmlGuardian } from '../carta/dom.js';
import { t } from '../carta/textos.js';
import {
  guardian as guardianDeLaPagina, guardianDe, anfitrionDe, firmanteDeCuenta, firmanteDeServicio, sesionAbierta, segundoFactorDe,
  claveDelError, codigoDe, pasarCriterios, tieneLaCuenta, pedirSesion, puedePedirSesion,
} from '../carta/anfitrion.js';

const T1 = '2026-11-17T10:00:00Z';
const FRASE = 'una frase larga que solo yo sé';
const sha = (texto) => createHash('sha256').update(texto, 'utf8').digest('hex');
const conCodigo = (code) => Object.assign(new Error('el guardián dice ' + code), { code });

/**
 * El guardián simulado: guarda en memoria la clave privada de cada cuenta que crea y firma con ella; la sesión se abre al
 * crear la cuenta y al firmar (su diálogo); `cerrar()` la cierra y `cancelar` hace que el titular no firme. Apunta cada
 * llamada (sin la firma).
 */
function guardianDePrueba({ conCriterios = false, conPedirSesion = false } = {}) {
  const claves = new Map();
  const llamadas = { crear: [], firmar: [], servicio: [], sesion: 0, cuentas: 0, criterios: [] };
  const g = {
    abierta: false,
    cancelar: false,
    firmante: () => null, // lo de hoy (el segundo factor de una cosa): aquí no tiene ninguna
    async crearCuenta({ nombre }) {
      llamadas.crear.push(nombre);
      const par = await autoridad.generarClaves();
      claves.set(par.publica, par.privada);
      g.abierta = true;
      return { publica: par.publica };
    },
    async cuentas() {
      llamadas.cuentas += 1;
      return [...claves.keys()].map((publica) => ({ nombre: 'importada', publica }));
    },
    async firmar({ publica, canonico, id, segundoFactor }) {
      llamadas.firmar.push({ publica, id, segundoFactor });
      const privada = claves.get(publica);
      if (!privada) throw conCodigo('unknown_account');
      if (g.cancelar) throw conCodigo('cancelled_by_holder');
      if (sha(canonico) !== id) throw conCodigo('id_mismatch');
      g.abierta = true;
      return { id, firma: aHex(schnorr.sign(deHex(id), deHex(privada), globalThis.crypto.getRandomValues(new Uint8Array(32)))) };
    },
    async firmarServicio({ publica, evento }) {
      llamadas.servicio.push({ publica, evento });
      const privada = claves.get(publica);
      if (!privada) throw conCodigo('unknown_account');
      return aHex(schnorr.sign(deHex(idNip98(evento)), deHex(privada), new Uint8Array(32)));
    },
    async sesion() {
      llamadas.sesion += 1;
      return { abierta: g.abierta, caduca: null };
    },
    cerrar() { g.abierta = false; },
  };
  if (conCriterios) g.criterios = async ({ publica, registros }) => { llamadas.criterios.push({ publica, registros }); if (!claves.has(publica)) throw conCodigo('unknown_account'); return { aceptados: registros.length }; };
  // El verbo opcional: abre la sesión (el diálogo) sin escribir nada, salvo que el titular cancele u haya otro diálogo.
  if (conPedirSesion) g.pedirSesion = async ({ publica }) => { llamadas.pedir = [...(llamadas.pedir ?? []), publica]; if (!g.cancelar && !g.ocupado) g.abierta = true; return { abierta: g.abierta, caduca: g.abierta ? 1e12 : null }; };
  g.llamadas = llamadas;
  g.privadas = () => [...claves.values()];
  g.olvidar = (publica) => claves.delete(publica);
  return g;
}

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

/** Una cuenta del guardián recién creada, con su firmante sobre su propio eje (como el de la carta sobre el eje en pantalla). */
async function cuentaDelGuardian(g, nombre = 'Víctor', opciones = {}) {
  const r = await Q.crearCuenta({ nombre, t: T1, guardian: g, ...opciones });
  const firmante = firmanteDeCuenta(g, r.publica, { eje: () => r.eje });
  return { ...r, firmante, firmar: autoridad.firmanteDeEventos(firmante, { publica: r.publica }) };
}

test('detectar el camino B: los cuatro verbos; sin uno, o mal formado, null (y el anfitrión de hoy no cambia); en las pruebas no hay global', () => {
  const g = guardianDePrueba();
  assert.equal(guardianDe(g), g);
  for (const quita of ['crearCuenta', 'cuentas', 'firmar', 'sesion']) assert.equal(guardianDe({ ...g, [quita]: undefined }), null, quita);
  for (const malo of [undefined, null, 5, 'guardián', () => {}, {}, { firmante: () => null }]) assert.equal(guardianDe(malo), null, String(malo));
  const traicionero = { get crearCuenta() { throw new Error('no'); }, cuentas() {}, firmar() {}, sesion() {} };
  assert.equal(guardianDe(traicionero), null, 'nunca lanza');
  assert.equal(anfitrionDe(g), g, 'el anfitrión de hoy (firmante) sigue igual');
  assert.equal(guardianDeLaPagina, null, 'sin __AGRAM_ANFITRION__, camino A');
});

test('crear una cuenta en el guardián: ninguna clave privada en el almacén, la marca en la lista, el libro vale con exigirFirmas y todo lo firmó el guardián', async () => {
  await conAlmacen(async (almacen) => {
    const g = guardianDePrueba();
    const r = await Q.crearCuenta({ nombre: 'Víctor Gil', idioma: 'en', t: T1, guardian: g, htmlInicial: true });
    assert.deepEqual(Object.keys(r).sort(), ['cuenta', 'eje', 'firmante', 'publica']);
    assert.equal(r.privada, undefined, 'la carta no ve la privada');
    assert.deepEqual(g.llamadas.crear, ['Víctor Gil']);
    assert.deepEqual([r.cuenta.identidad, r.cuenta.guardian, r.cuenta.publica, r.eje.clave('victor-gil')], ['victor-gil', true, r.publica, r.publica]);
    assert.ok(r.eje.orden.length >= 3, 'el alta, el idioma y el HTML inicial');
    assert.deepEqual(g.llamadas.firmar.map((x) => x.id), r.eje.orden, 'cada registro lo firmó el guardián, en orden');
    assert.ok(g.llamadas.firmar.every((x) => x.publica === r.publica && x.segundoFactor === false), 'sin criterios: sin diálogo');
    for (const id of r.eje.orden) assert.equal(await autoridad.verificar(r.eje.obtener(id), r.publica), true);
    const conFirmas = await Eje.desde(persistencia.serializar(r.eje).eventos, { exigirFirmas: true });
    assert.deepEqual(conFirmas.orden, r.eje.orden, 'el libro se rehace exigiendo firmas');
    assert.equal(contrato.configuracion(r.eje, 'victor-gil').language, 'en');
    assert.equal(await Q.guardarCuenta(r), true);
    assert.equal(almacen.has(Q.CLAVES.clave(r.cuenta.alta)), false, 'sin agram.clave.<alta>');
    const [privada] = g.privadas();
    assert.ok(![...almacen.values()].some((v) => v.includes(privada)), 'la privada no está en ningún sitio del almacén');
    assert.deepEqual(Q.cuentas(), [{ nombre: 'Víctor Gil', idioma: 'en', identidad: 'victor-gil', alta: r.cuenta.alta, publica: r.publica, guardian: true, libro: r.cuenta.alta }]); // A24: con su libro
    const abierta = await Q.abrirCuenta(r.cuenta.alta, { guardian: g });
    assert.deepEqual([abierta.eje.orden, abierta.publica, abierta.soloLeer, abierta.privada], [r.eje.orden, r.publica, undefined, undefined]);
  });
});

test('escribir, una transacción, autoejecutar, invitar y aceptar firman por el guardián', async () => {
  const g = guardianDePrueba();
  const c = await cuentaDelGuardian(g);
  const yo = c.cuenta.identidad;
  const firmados = () => g.llamadas.firmar.map((x) => x.id);
  // Escribir (salida.escribirDesde, como la configuración y los campos): el firmante va donde iba la privada.
  const p = preferencias(c.eje, yo, { language: 'en' });
  const pref = await salida.escribirDesde(c.eje, { modo: 'sequenced', autor: yo, sobre: p.sobre, en: p.en, payload: p.payload, t: T1 }, c.firmante);
  assert.ok(firmados().includes(pref.id));
  // Una transacción (carta.enviar, con firmanteDeEventos del firmante).
  const tx = await enviar(c.eje, c.cuenta.alta, 'anchor here', { title: 'Mi primer registro' }, yo, c.firmar, { t: T1 });
  assert.equal(tx.ok, true, JSON.stringify(tx.motivos));
  assert.ok(firmados().includes(tx.asentado.id));
  assert.equal(await autoridad.verificar(tx.asentado, c.publica), true);
  // Autoejecutar: cada paso que da lo firma el guardián.
  const antes = g.llamadas.firmar.length;
  const auto = await acciones.autoejecutar(c.eje, c.cuenta.alta, yo, c.firmar, { t: T1 });
  assert.ok(auto.hechos.length >= 1, 'el camino de un alta nueva da al menos un paso');
  for (const h of auto.hechos) assert.ok(firmados().includes(h.evento.id));
  assert.equal(g.llamadas.firmar.length - antes >= auto.hechos.length, true);
  // Invitar a Ana (otra cuenta del mismo guardián) y que acepte firmando con el guardián.
  const ana = await g.crearCuenta({ nombre: 'Ana' });
  const invitacion = await c.eje.invitar({ autor: yo, invitado: 'ana', clave: ana.publica, t: T1, privada: c.firmante });
  assert.ok(firmados().includes(invitacion.id));
  const firmanteAna = firmanteDeCuenta(g, ana.publica, { eje: () => c.eje });
  const alta = await c.eje.aceptar(invitacion, { publica: ana.publica, privada: firmanteAna }, { t: T1 });
  assert.ok(g.llamadas.firmar.some((x) => x.id === alta.id && x.publica === ana.publica));
  assert.equal(c.eje.clave('ana'), ana.publica);
  // Todo verifica y el libro se rehace con exigirFirmas.
  assert.deepEqual((await Eje.desde(persistencia.serializar(c.eje).eventos, { exigirFirmas: true })).orden, c.eje.orden);
});

test('segundoFactor: falso sin criterio que alcance la candidata; verdadero cuando su criterio «second factor» la alcanza; si no se puede calcular, verdadero', async () => {
  const g = guardianDePrueba({ conCriterios: true });
  const c = await cuentaDelGuardian(g);
  const yo = c.cuenta.identidad;
  const ultimo = () => g.llamadas.firmar.at(-1);
  const escribir = async (title) => {
    const r = await enviar(c.eje, c.cuenta.alta, 'anchor here', { title }, yo, c.firmar, { t: T1 });
    assert.equal(r.ok, true, JSON.stringify(r.motivos));
    return r.asentado;
  };
  const sin = await escribir('sin criterio');
  assert.deepEqual([ultimo().id, ultimo().segundoFactor], [sin.id, false]);
  // Una cosa mía con clave (su prueba de posesión, de la cosa) y mi criterio: «si mueve T» (toda escritura quema T), titular la cosa.
  const llavero = await autoridad.generarClaves();
  const alta = await acciones.transaccion(c.eje, 'register a thing', { X: c.cuenta.alta, thing: 'llavero', minutes: 60, key: llavero.publica }, yo, { t: T1, firmar: c.firmar });
  assert.ok(alta.evento, 'firmada por el guardián; le falta solo la prueba de posesión de la cosa');
  await c.eje.anadir(await autoridad.firmarPosesion(alta.evento, 'llavero', llavero.privada));
  const criterio = await enviar(c.eje, c.cuenta.alta, 'second factor', { family: 'T', amount: 1, holder: 'llavero' }, yo, c.firmar, { t: T1 });
  assert.equal(criterio.ok, true, JSON.stringify(criterio.motivos));
  assert.equal(g.llamadas.firmar.at(-1).segundoFactor, false, 'el criterio no se alcanza a sí mismo (aún no está en el libro)');
  const con = await escribir('con criterio');
  assert.deepEqual([ultimo().id, ultimo().segundoFactor], [con.id, true]);
  assert.equal(acciones.segundoFactor(c.eje, con.id).pendiente, true, 'lo mismo que dice la carta después: «por autorizar»');
  // Sin eje o con basura: verdadero (ante la duda, diálogo); el génesis, falso.
  assert.equal(segundoFactorDe(null, { canonico: JSON.stringify({ autor: yo, sobre: c.cuenta.alta }), id: 'f'.repeat(64) }), true);
  assert.equal(segundoFactorDe(c.eje, { canonico: 'no es JSON', id: 'f'.repeat(64) }), true);
  assert.equal(segundoFactorDe(null, { canonico: JSON.stringify({ autor: yo, sobre: null, contexto: { genesis: true } }), id: 'f'.repeat(64) }), false, 'el génesis: sin libro no hay criterios');
  // El verbo opcional `criterios`: los registros de mis criterios como { canonico, id, firma }.
  const pasados = await pasarCriterios(g, c.eje, yo, c.publica);
  assert.deepEqual(pasados, { ids: [criterio.asentado.id], error: null });
  const [{ publica, registros }] = g.llamadas.criterios;
  assert.equal(publica, c.publica);
  assert.deepEqual(registros.map((x) => x.id), [criterio.asentado.id]);
  assert.equal(sha(registros[0].canonico), registros[0].id);
  assert.equal(registros[0].firma, criterio.asentado.firma);
  const otro = guardianDePrueba({ conCriterios: true });
  assert.equal(codigoDe((await pasarCriterios(otro, c.eje, yo, c.publica)).error), 'unknown_account', 'una cuenta que no tiene: el rechazo, sin romper nada');
  assert.equal(await pasarCriterios(guardianDePrueba(), c.eje, yo, c.publica), null, 'sin el verbo, nada');
});

test('cancelled_by_holder no deja nada escrito y se dice en llano; también session_closed, unknown_account y cualquier otro', async () => {
  const g = guardianDePrueba();
  const c = await cuentaDelGuardian(g);
  const yo = c.cuenta.identidad;
  const antes = [...c.eje.orden];
  g.cancelar = true;
  // Escribir: lanza con el code y nada entra.
  const p = preferencias(c.eje, yo, { language: 'en' });
  const e = await salida.escribirDesde(c.eje, { modo: 'sequenced', autor: yo, sobre: p.sobre, en: p.en, payload: p.payload, t: T1 }, c.firmante).then(() => null, (x) => x);
  assert.equal(codigoDe(e), 'cancelled_by_holder');
  assert.equal(t(claveDelError(e)), 'No has firmado. No se ha escrito nada.');
  // Una transacción: no pasa, nada entra, y el firmante guarda el rechazo para decirlo en llano.
  const r = await enviar(c.eje, c.cuenta.alta, 'anchor here', { title: 'no' }, yo, c.firmar, { t: T1 });
  assert.equal(r.ok, false);
  assert.equal(t(claveDelError(c.firmante.error)), 'No has firmado. No se ha escrito nada.');
  assert.deepEqual(c.eje.orden, antes, 'nada en el libro');
  // Crear una cuenta cancelada: lanza y no devuelve nada que guardar.
  await assert.rejects(Q.crearCuenta({ nombre: 'Otra', t: T1, guardian: g }), (x) => codigoDe(x) === 'cancelled_by_holder');
  // Los demás textos.
  assert.equal(t(claveDelError(conCodigo('session_closed'))), 'La sesión del guardián está cerrada. Ábrela para firmar.');
  assert.equal(t(claveDelError(conCodigo('unknown_account'))), 'El guardián no tiene esta cuenta.');
  assert.equal(t(claveDelError(conCodigo('id_mismatch'))), 'El guardián no ha podido firmar. No se ha escrito nada.');
  assert.equal(t(claveDelError(new Error('sin code'))), 'El guardián no ha podido firmar. No se ha escrito nada.');
  // Un guardián que devuelve otra cosa (otro id, basura, otra clave): el firmante lo para con code y el núcleo no escribe.
  g.cancelar = false;
  for (const [malo, code] of [[{ id: '0'.repeat(64), firma: 'ab' }, 'id_mismatch'], ['basura', 'invalid_signature'], [{ firma: 'f'.repeat(128) }, 'invalid_signature']]) {
    const raro = firmanteDeCuenta({ ...g, firmar: async () => malo }, c.publica, { eje: () => c.eje });
    const x = await salida.escribirDesde(c.eje, { modo: 'sequenced', autor: yo, sobre: p.sobre, en: p.en, payload: p.payload, t: T1 }, raro).then(() => null, (y) => y);
    assert.equal(codigoDe(x), code);
    assert.equal(codigoDe(raro.error), code);
  }
  assert.deepEqual(c.eje.orden, antes);
});

test('con la sesión cerrada la sincronía no intenta firmar y sale el aviso; el servicio de pagos firma por firmarServicio con el evento entero', async () => {
  await conAlmacen(async () => {
    const g = guardianDePrueba();
    const c = await cuentaDelGuardian(g);
    const yo = c.cuenta.identidad;
    // Mi configuración: servidor y eje compartido (preferencias) y «pay url» (exterior settings), firmadas por el guardián.
    const p = preferencias(c.eje, yo, { [sincronia.CONFIGURACION.url]: ['http://127.0.0.1:9'], [sincronia.CONFIGURACION.eje]: ['mi-libro'] });
    await salida.escribirDesde(c.eje, { modo: 'sequenced', autor: yo, sobre: p.sobre, en: p.en, payload: p.payload, t: T1 }, c.firmante);
    const a = G.ajustesEditablesDe('exterior settings', c.eje, yo, { 'pay url': 'http://127.0.0.1:9' });
    await salida.escribirDesde(c.eje, { modo: 'sequenced', autor: yo, sobre: a.sobre, en: a.en, payload: a.payload, t: T1 }, c.firmante);
    assert.equal(await Q.guardarCuenta({ cuenta: c.cuenta, eje: c.eje, claveLectura: 'lectura-de-prueba' }), true);
    const red = { caida: true };
    const fetch = async () => (red.caida ? Promise.reject(new TypeError('fetch failed')) : new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } }));
    const sesion = () => sesionAbierta(g, c.publica);
    const Sx = S.abrir({ alta: c.cuenta.alta, eje: c.eje, yo, fetch, firmante: firmanteDeServicio(g, c.publica), sesion });
    assert.ok(Sx?.pago, 'con «pay url», el servicio de pagos');
    Sx.esperarPago(c.cuenta.alta);
    g.cerrar();
    const firmas = g.llamadas.firmar.length;
    const informe = await S.pasar(Sx, c.eje, c.cuenta.alta, { sesion });
    assert.equal(informe.sesionCerrada, true, 'el informe lo dice: la carta deja el aviso');
    assert.deepEqual([g.llamadas.firmar.length, g.llamadas.servicio.length], [firmas, 0], 'nada se pide firmar');
    // Lo que el servicio firmaría con la sesión cerrada no se intenta: session_closed sin llamar al guardián.
    await assert.rejects(Sx.pago.saldos({ nombre: 'vg' }), (e) => codigoDe(e) === 'session_closed');
    assert.equal(g.llamadas.servicio.length, 0);
    // El aviso persistente, en llano, con su botón; sin cuenta del guardián (camino A), nada.
    const aviso = htmlGuardian({ sesionCerrada: true });
    assert.match(aviso, /La sesión del guardián está cerrada\. Ábrela para firmar\./);
    assert.match(aviso, /<button type="button" class="enlace" data-guardian-abrir title="[^"]*">abrir la sesión<\/button>/);
    assert.equal(htmlGuardian(undefined), '');
    assert.equal(htmlGuardian({ sesionCerrada: false, soloLeer: false }), '');
    // Abierta (el diálogo de una firma pedida), el servicio firma por firmarServicio: el evento NIP-98 entero, sin firmar.
    await g.firmar({ publica: c.publica, canonico: 'x', id: sha('x') });
    red.caida = false;
    const informeAbierta = await S.pasar(Sx, c.eje, c.cuenta.alta, { sesion });
    assert.equal(informeAbierta.sesionCerrada, undefined);
    await Sx.pago.saldos({ nombre: 'vg' });
    assert.equal(g.llamadas.servicio.length, 1);
    const { publica, evento } = g.llamadas.servicio[0];
    assert.deepEqual([publica, evento.pubkey, evento.kind, evento.sig], [c.publica, c.publica, 27235, undefined]);
    assert.equal(idNip98(evento), evento.id, 'el guardián puede recalcular su id');
    // Sin firmarServicio, el servicio no tiene con qué firmar.
    assert.deepEqual(firmanteDeServicio({ ...g, firmarServicio: undefined }, c.publica), {});
  });
});

test('sin la cuenta en el guardián (u otro equipo sin guardián), la cuenta se abre solo para leer y lo dice; con ella, para firmar', async () => {
  await conAlmacen(async () => {
    const g = guardianDePrueba();
    const c = await cuentaDelGuardian(g);
    await Q.guardarCuenta(c);
    const otro = guardianDePrueba();
    assert.equal(await tieneLaCuenta(otro, c.publica), false);
    const r1 = await Q.abrirCuenta(c.cuenta.alta, { guardian: otro });
    assert.deepEqual([Boolean(r1.eje), r1.soloLeer], [true, true]);
    const r2 = await Q.abrirCuenta(c.cuenta.alta);
    assert.deepEqual([Boolean(r2.eje), r2.soloLeer], [true, true], 'sin guardián, para leer');
    const r3 = await Q.abrirCuenta(c.cuenta.alta, { guardian: g });
    assert.deepEqual([Boolean(r3.eje), r3.soloLeer], [true, undefined]);
    // Casa por la pública, nunca por el nombre (las importadas dan otro nombre).
    assert.equal(await tieneLaCuenta(g, c.publica), true);
    assert.equal(htmlGuardian({ soloLeer: true }).includes(t('guardianSoloLeer')), true);
    assert.equal(htmlGuardian({ soloLeer: true, sinGuardian: true }).includes(t('guardianSoloLeerSinGuardian')), true);
    assert.doesNotMatch(htmlGuardian({ soloLeer: true }), /data-guardian-abrir/, 'para leer no hay sesión que abrir');
    // Una cuenta del camino A sigue igual aunque haya guardián: su clave en el navegador, sin marca.
    const a = await Q.crearCuenta({ nombre: 'Ana', t: T1 });
    await Q.guardarCuenta(a);
    const ra = await Q.abrirCuenta(a.cuenta.alta, { guardian: g });
    assert.deepEqual([ra.privada, ra.soloLeer, ra.cuenta.guardian], [a.privada, undefined, undefined]);
  });
});

test('la copia de seguridad de una cuenta del guardián no lleva clave: la cuenta, el eje y la marca; restaurada, para leer hasta que el guardián tenga la cuenta', async () => {
  const g = guardianDePrueba();
  const c = await cuentaDelGuardian(g);
  const [privada] = g.privadas();
  const sinLectura = await Q.exportarCuenta({ cuenta: c.cuenta, eje: c.eje }, FRASE, { iteraciones: 1000, t: T1 });
  assert.equal(sinLectura.guardian, true);
  assert.equal(sinLectura.clave, undefined, 'sin clave de lectura no hay nada cifrado');
  const conLectura = await Q.exportarCuenta({ cuenta: c.cuenta, eje: c.eje, claveLectura: 'lectura-secreta' }, FRASE, { iteraciones: 1000, t: T1 });
  const texto = Q.textoDeArchivo(conLectura);
  assert.ok(!texto.includes(privada), 'la privada no va');
  assert.ok(!texto.includes('lectura-secreta'), 'la de lectura, cifrada con la frase, como hoy');
  assert.deepEqual([conLectura.publica, conLectura.alta, conLectura.identidad], [c.publica, c.cuenta.alta, c.cuenta.identidad]);
  await assert.rejects(Q.restaurarCuenta(texto, 'otra frase'), new RegExp(Q.FRASE_INCORRECTA.slice(0, 20)));
  await conAlmacen(async (almacen) => {
    const r = await Q.restaurarCuenta(texto, FRASE);
    assert.deepEqual([r.cuenta.guardian, r.claveLectura, r.privada, r.eje.orden], [true, 'lectura-secreta', undefined, c.eje.orden]);
    const otroEquipo = guardianDePrueba();
    assert.equal((await Q.conGuardian(r, otroEquipo)).soloLeer, true, 'en otro equipo, para leer');
    assert.equal((await Q.conGuardian(r, g)).soloLeer, undefined, 'con el guardián que la tiene, para firmar');
    assert.equal(await Q.guardarCuenta(r), true);
    assert.equal(almacen.has(Q.CLAVES.clave(r.cuenta.alta)), false);
    assert.equal(Q.claveLectura(r.cuenta.alta), 'lectura-secreta');
    const sinClave = await Q.restaurarCuenta(Q.textoDeArchivo(sinLectura), FRASE);
    assert.equal(sinClave.claveLectura, undefined);
  });
});

test('sin anfitrión, crear una cuenta va por el camino A exactamente como hoy', async () => {
  await conAlmacen(async (almacen) => {
    const r = await Q.crearCuenta({ nombre: 'Víctor', idioma: 'en', t: T1, htmlInicial: true });
    assert.deepEqual(Object.keys(r), ['cuenta', 'eje', 'privada', 'publica']);
    assert.deepEqual(Object.keys(r.cuenta), ['nombre', 'idioma', 'identidad', 'alta', 'publica', 'libro'], 'sin marca (y con su libro, A24)');
    assert.match(r.privada, /^[0-9a-f]{64}$/);
    assert.equal(autoridad.publicaDe(r.privada), r.publica);
    for (const id of r.eje.orden) assert.equal(await autoridad.verificar(r.eje.obtener(id), r.publica), true);
    assert.equal(await Q.guardarCuenta(r), true);
    assert.equal(almacen.get(Q.CLAVES.clave(r.cuenta.alta)), r.privada, 'la clave, en el navegador, como hoy');
    assert.deepEqual(JSON.parse(almacen.get(Q.CLAVES.cuentas)), [{ nombre: 'Víctor', idioma: 'en', identidad: 'victor', alta: r.cuenta.alta, publica: r.publica, libro: r.cuenta.alta }]); // A24: con su libro
    const abierta = await Q.abrirCuenta(r.cuenta.alta);
    assert.deepEqual([abierta.privada, abierta.soloLeer], [r.privada, undefined]);
    const copia = await Q.exportarCuenta(r, FRASE, { iteraciones: 1000, t: T1 });
    assert.equal(copia.guardian, undefined);
    assert.equal(typeof copia.clave?.datos, 'string', 'la copia lleva la privada cifrada, como hoy');
  });
});

test('pedirSesion: con el verbo abre la sesión sin escribir ningún registro y devuelve { abierta, caduca }; sin él, null y el guardián sigue siendo de cuatro verbos', async () => {
  const g = guardianDePrueba({ conPedirSesion: true });
  const c = await cuentaDelGuardian(g);
  const antes = [...c.eje.orden];
  const firmas = g.llamadas.firmar.length;
  g.cerrar();
  assert.equal(guardianDe(g), g, 'pedirSesion no entra en la detección');
  assert.equal(puedePedirSesion(g), true);
  assert.deepEqual(await pedirSesion(g, c.publica), { abierta: true, caduca: 1e12 });
  assert.deepEqual(g.llamadas.pedir, [c.publica], 'se pide con { publica }');
  assert.equal(await sesionAbierta(g, c.publica), true);
  assert.deepEqual([c.eje.orden, g.llamadas.firmar.length], [antes, firmas], 'ni un registro, ni una firma');
  // Cancelado u ocupado: { abierta: false }, caduca null.
  g.cerrar();
  g.cancelar = true;
  assert.deepEqual(await pedirSesion(g, c.publica), { abierta: false, caduca: null });
  g.cancelar = false;
  g.ocupado = true;
  assert.deepEqual(await pedirSesion(g, c.publica), { abierta: false, caduca: null });
  // Sin el verbo: null (y el guardián de siempre sigue siendo guardián).
  const sin = guardianDePrueba();
  assert.equal(puedePedirSesion(sin), false);
  assert.equal(await pedirSesion(sin, c.publica), null);
  assert.equal(guardianDe(sin), sin);
  assert.equal(await pedirSesion(null, c.publica), null);
  const traicionero = { get pedirSesion() { throw new Error('no'); } };
  assert.equal(puedePedirSesion(traicionero), false);
  assert.equal(await pedirSesion(traicionero, c.publica), null);
});

test('pedirSesion: una respuesta con forma rara no se da por abierta; un rechazo tampoco; caduca solo si es número o texto', async () => {
  for (const raro of [undefined, null, 'abierta', 1, true, [], {}, { abierta: 'true' }, { abierta: 1 }, { abierta: false, caduca: 5 }, { abierta: [true] }]) {
    const r = await pedirSesion({ pedirSesion: async () => raro }, 'a'.repeat(64));
    assert.deepEqual(r, { abierta: false, caduca: null }, JSON.stringify(raro));
  }
  assert.deepEqual(await pedirSesion({ pedirSesion: async () => { throw conCodigo('dialog_busy'); } }, 'a'.repeat(64)), { abierta: false, caduca: null });
  assert.deepEqual(await pedirSesion({ pedirSesion: () => { throw new Error('síncrono'); } }, 'a'.repeat(64)), { abierta: false, caduca: null });
  assert.deepEqual(await pedirSesion({ pedirSesion: async () => ({ abierta: true }) }, 'a'.repeat(64)), { abierta: true, caduca: null });
  assert.deepEqual(await pedirSesion({ pedirSesion: async () => ({ abierta: true, caduca: { x: 1 } }) }, 'a'.repeat(64)), { abierta: true, caduca: null });
  assert.deepEqual(await pedirSesion({ pedirSesion: async () => ({ abierta: true, caduca: '2026-11-17T18:00:00Z' }) }, 'a'.repeat(64)), { abierta: true, caduca: '2026-11-17T18:00:00Z' });
});

test('crearCuenta que rechaza con dialog_busy (o cancelled_by_holder): se dice en llano y no nace nada a medias', async () => {
  const g = guardianDePrueba();
  const ocupado = { ...g, crearCuenta: async () => { throw conCodigo('dialog_busy'); } };
  const e = await Q.crearCuenta({ nombre: 'Víctor', t: T1, guardian: ocupado }).then(() => null, (x) => x);
  assert.equal(codigoDe(e), 'dialog_busy');
  assert.equal(t(claveDelError(e)), 'El guardián tiene otro diálogo abierto. Ciérralo y vuelve a intentarlo.');
  assert.equal(g.llamadas.firmar.length, 0, 'no se firmó nada');
  assert.equal(t(claveDelError(conCodigo('cancelled_by_holder'))), 'No has firmado. No se ha escrito nada.', 'el otro rechazo sigue con su texto');
  // Y la cuenta se puede crear en cuanto el guardián queda libre.
  const c = await Q.crearCuenta({ nombre: 'Víctor', t: T1, guardian: g });
  assert.equal(c.cuenta.guardian, true);
});

test('el aviso de la sesión cerrada: con botón si se puede abrir, sin él (con el aviso de la próxima firma) si no, y con la línea de que no se abrió', () => {
  const con = htmlGuardian({ sesionCerrada: true, puedeAbrir: true });
  assert.match(con, /data-guardian-abrir/);
  assert.match(con, /La sesión del guardián está cerrada\. Ábrela para firmar\./);
  assert.doesNotMatch(con, /data-guardian-no-abrio/);
  const sin = htmlGuardian({ sesionCerrada: true, puedeAbrir: false });
  assert.doesNotMatch(sin, /data-guardian-abrir|<button/);
  assert.match(sin, /La sesión del guardián está cerrada\. Se abrirá con la próxima firma\./);
  const noAbrio = htmlGuardian({ sesionCerrada: true, puedeAbrir: true, noAbrio: true });
  assert.match(noAbrio, /data-guardian-abrir/, 'el aviso y el botón se quedan');
  assert.match(noAbrio, /El guardián no ha abierto la sesión\. Inténtalo dentro de un minuto\./);
  assert.doesNotMatch(htmlGuardian({ sesionCerrada: true, puedeAbrir: true, noAbrio: true, abriendo: true }), /no ha abierto/, 'mientras pide, la línea se quita');
  assert.equal(htmlGuardian({ sesionCerrada: false, noAbrio: true }), '', 'abierta, nada');
});
