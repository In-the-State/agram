// «Irme con lo mío» y el puente entre mis libros, en la carta (encargo «carta: irme con lo mío y el puente», Core AGRAM 17-11).
// Lo que se comprueba:
//   0. de dónde salen los sellos: datos/epocas/puente.mjs se puede servir a la carta (nada de Node arriba); la prueba con que
//      se trae un registro es la décupla de sello que su libro ya tiene (pruebaParaTraer), y con ella la regla deja traer;
//      sin sello, sin claves o sin el nivel, se dice qué falta; un libro sin sellador o de demostración no tiene sello;
//      la carta pone en el eje las décuplas guardadas con la sincronía (sellosGuardados);
//   1. «Irme con lo mío», recorrida paso a paso con dos libros de la misma cuenta; sin sello, la espera con su frase;
//   2. el puente entre dos libros abiertos de la misma cuenta: el grado de cada enlace, traer, enviar y recibir; un enlace que
//      no cuenta no ofrece nada; lo traído no fiable se dice y no se enseña; sin sello del otro libro, la espera con su frase.
// Claves y libros de PRUEBA, generados en cada prueba; nada real.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Eje } from '../src/eje.js';
import { generarClaves } from '../src/autoridad.js';
import { PLANTILLAS_DEL_PUENTE as P, pruebaParaTraer, clavesDeLineaDe, paresDelEnlace, sinSello, porRecibir, registroComoDecupla, saldosDe, ESPERAS_DE_LA_SALIDA } from '../datos/epocas/puente.mjs';
import { dosLibros } from '../ejemplos/puente.mjs';
import { selloEnCascada, declararExterior } from './ayudas-sello.js';
import * as PU from '../carta/puente.js';
import * as Q from '../carta/cuentas.js';
import { reglasDelLibro } from '../carta/reglas.js';
import { htmlReglas, htmlPuente } from '../carta/dom.js';
import { enviar } from '../carta/carta.js';
import { canonico } from '../src/evento.js';
import { quemaDelCoste } from '../src/escritura.js';
import { t } from '../carta/textos.js';

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

/** El sello en cascada de un registro del grande, como el que trae la sincronía: { altura, hash, instante, verificado, decupla }. */
const selloDelGrande = (m, id, { arriba = 4 } = {}) => selloEnCascada(id, {
  observador: m.claves.sellador, capas: [{ nivel: 1, grado: 0, claves: m.claves.casaG, libro: m.grande.genesisId }, { nivel: arriba, grado: 2, red: 0, libro: m.grande.genesisId }],
});

test('sección 0: puente.mjs se sirve a la carta: ningún import de Node arriba ni Buffer', () => {
  const fuente = readFileSync(new URL('../datos/epocas/puente.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(fuente, /^import .* from 'node:/m);
  assert.doesNotMatch(fuente, /Buffer\./);
  assert.doesNotMatch(fuente, /^import .* from '\.\/generar\.mjs'/m);
});

test('sección 0: la prueba para traer es la décupla de sello que el libro de origen ya tiene; con ella la regla deja traer', async () => {
  const m = await dosLibros();
  const menu = await m.lanza(m.grande, 'anchor here', { X: m.sala.id, title: 'menú', content: 'el menú del sábado' }, 'ana');
  const lineas = paresDelEnlace(m.cuelga);
  assert.equal(lineas.length, 2, 'el enlace del pequeño anota las dos claves del grande');
  // Sin sello: espera.
  assert.deepEqual(pruebaParaTraer(m.grande, menu.id, { lineas }), { prueba: null, falta: 'sello' });
  const sello = await selloDelGrande(m, menu.id);
  assert.equal(m.grande.marcarSello(menu.id, sello), true);
  const r = pruebaParaTraer(m.grande, menu.id, { lineas, nivel: 4 });
  assert.equal(r.falta, null);
  assert.deepEqual(r.prueba, sello.decupla, 'la misma décupla, copiada');
  // Sin claves, con otras claves o pidiendo más nivel del que llega: se dice qué falta.
  assert.equal(pruebaParaTraer(m.grande, menu.id, { lineas: [] }).falta, 'claves');
  assert.equal(pruebaParaTraer(m.grande, menu.id, { lineas: [[1, m.claves.casaP.publica], [4, m.claves.sellador.publica]] }).falta, 'claves');
  assert.equal(pruebaParaTraer(m.grande, menu.id, { lineas, nivel: 5 }).falta, 'nivel');
  // Con ella, la regla deja traer.
  const traido = await m.intenta(m.pequeno, P.traer, { X: m.cuelga.id, record: registroComoDecupla(menu), proof: r.prueba }, 'bea');
  assert.equal(traido.ok, true, (traido.motivos ?? []).map((x) => x.mensaje).join('; '));
});

test('sección 0: un libro sin quien lo selle, o de demostración, no tiene sello; con «seal url» y «line keys», sí', async () => {
  const m = await dosLibros();
  assert.equal(sinSello(m.grande), 'sinSellador');
  assert.deepEqual(clavesDeLineaDe(m.grande), []);
  const demo = await Eje.genesis({ identidad: 'ana', foco: ['demo'], t: '2026-11-17T09:00:00Z', demostracion: true });
  assert.equal(sinSello(demo), 'demostracion');
  await declararExterior(m.grande, { sello: 'https://sello.invalid', privada: m.claves.ana.privada });
  assert.equal(sinSello(m.grande), 'sinClaves');
  const lineas = [[1, m.claves.casaG.publica], [4, m.claves.sellador.publica]];
  await declararExterior(m.grande, { sello: 'https://sello.invalid', lineas, privada: m.claves.ana.privada });
  assert.equal(sinSello(m.grande), null);
  assert.deepEqual(clavesDeLineaDe(m.grande), lineas, 'las claves de línea del libro, de su «exterior settings»');
});

test('sección 0: las décuplas guardadas con la sincronía vuelven al eje (sellosGuardados), aunque el eje ya tenga el sello sin ella', async () => {
  await conAlmacen(async () => {
    const m = await dosLibros();
    const menu = await m.lanza(m.grande, 'anchor here', { X: m.sala.id, title: 'menú', content: 'el menú' }, 'ana');
    const sello = await selloDelGrande(m, menu.id);
    // Lo que deja Sincronia.restaurar: el sello sin su décupla.
    m.grande.marcarSello(menu.id, { altura: sello.altura, hash: sello.hash, instante: sello.instante, verificado: true });
    assert.equal(m.grande.sello(menu.id).decupla, undefined);
    globalThis.localStorage.setItem('agram.sync.estado.ALTA', JSON.stringify({ sellos: [[menu.id, { altura: sello.altura, hash: sello.hash, instante: sello.instante, verificado: true, decupla: sello.decupla }], ['x'.repeat(64), 'pendiente']] }));
    assert.equal(PU.sellosGuardados(m.grande, 'ALTA'), 1);
    assert.deepEqual(m.grande.sello(menu.id).decupla, sello.decupla);
    assert.equal(pruebaParaTraer(m.grande, menu.id, { lineas: paresDelEnlace(m.cuelga) }).falta, null);
  });
});

test('sección 0: porRecibir dice cuánto queda de un envío traído (la ida, una vez y entera)', async () => {
  const m = await dosLibros();
  const menu = await m.lanza(m.grande, 'anchor here', { X: m.sala.id, title: 'menú', content: 'el menú' }, 'ana');
  await m.lanza(m.grande, 'issue E tied to X', { X: menu.id, denomination: 'plato', quantity: 5 }, 'ana');
  const serie = 'E:ana/plato@' + menu.id;
  await m.traer(m.pequeno, m.grande, menu);
  const envio = await m.lanza(m.grande, P.enviar, { X: m.abre.id, series: serie, quantity: 3, to: m.claves.bea.publica }, 'ana');
  const traido = await m.traer(m.pequeno, m.grande, envio);
  assert.deepEqual(porRecibir(m.pequeno, traido.id), { envia: 3, recibido: 0, queda: 3, vuelta: false });
  await m.lanza(m.pequeno, P.recibir, { X: traido.id }, 'bea');
  assert.deepEqual(porRecibir(m.pequeno, traido.id), { envia: 3, recibido: 3, queda: 0, vuelta: false });
  assert.equal(porRecibir(m.pequeno, menu.id), null, 'un registro que no es un traído');
});

// ---------- 1. «Irme con lo mío», paso a paso, con dos libros de la misma cuenta ----------

const T1 = '2026-11-17T10:00:00Z';
let segundo = 0;
const reloj = () => new Date(Date.parse(T1) + ++segundo * 1000).toISOString().replace('.000Z', 'Z');

/** Mi libro (camino A) con quien lo selle: «seal url» y sus claves de línea en «exterior settings»; y un sellador simulado. */
async function libroConSellador(nombre = 'Ana') {
  const c = await Q.crearCuenta({ nombre, t: T1 });
  const claves = { casa: await generarClaves(), sellador: await generarClaves() };
  const lineas = [[1, claves.casa.publica], [4, claves.sellador.publica]];
  await declararExterior(c.eje, { sello: 'https://sello.invalid', lineas, privada: c.privada, t: reloj() });
  const sellar = async (id) => c.eje.marcarSello(id, await selloEnCascada(id, {
    observador: claves.sellador, capas: [{ nivel: 1, grado: 0, claves: claves.casa, libro: c.eje.genesisId }, { nivel: 4, grado: 2, red: 0, libro: c.eje.genesisId }],
  }));
  await Q.guardarCuenta({ cuenta: c.cuenta, eje: c.eje, privada: c.privada });
  return { ...c, claves, lineas, sellar };
}

/**
 * Recorre la salida como la carta: pide la vista, firma su primer paso «listo» (el génesis, por abrirLibroDeSalida; los
 * demás, por firmarPaso en su libro) y vuelve a pedirla, hasta que no queda ninguno listo. Con `sellar`, quien guarda el
 * viejo sella cada declaración firmada. → { vista (la última), nuevo }.
 */
async function recorrerLaSalida(c, { sellar = true, punto } = {}) {
  const yo = c.cuenta.identidad;
  const nombre = 'Lo mío';
  let nuevo = null;
  for (let vuelta = 0; vuelta < 30; vuelta++) {
    const v = PU.salidaDe(c.eje, yo, { punto, nuevo: nuevo?.eje ?? null, nombre });
    const sinSello = sellar && v.pasos.find((p) => p.que === 'declarar' && p.estado === 'hecho' && !c.eje.sello(p.id));
    if (sinSello) { await c.sellar(sinSello.id); continue; }
    const p = v.siguiente;
    if (!p) return { vista: v, nuevo };
    if (p.que === 'genesis') {
      nuevo = await PU.abrirLibroDeSalida({ cuenta: c.cuenta, privada: c.privada, paso: p, t: reloj() });
      continue;
    }
    const eje = p.libro === 'viejo' ? c.eje : nuevo.eje;
    const coste = PU.costeDelPaso(eje, p);
    assert.ok(coste, 'el coste del paso ' + p.n + ' (' + p.que + '), a la vista antes de confirmar');
    const r = await PU.firmarPaso(eje, p, Q.firmarCon(p.libro === 'viejo' ? c.privada : nuevo.privada), { t: reloj() });
    assert.ok(r.asentado, 'paso ' + p.n + ' (' + p.que + '): ' + r.motivos.map((x) => x.mensaje).join('; '));
    if (p.libro === 'nuevo') nuevo.cuenta = PU.guardarLibroNuevo(nuevo);
  }
  throw new Error('la salida no acaba');
}

test('salida: con dos libros de la misma cuenta se recorre entera, paso a paso; el nuevo es otro libro de la cuenta y trae mis declaraciones', async () => {
  await conAlmacen(async () => {
    const c = await libroConSellador();
    const yo = c.cuenta.identidad;
    const antes = PU.salidaDe(c.eje, yo);
    assert.ok(antes.lleva.length >= 1, 'me llevo algo: ' + JSON.stringify(antes.lleva));
    assert.deepEqual(antes.lleva.map((x) => x.serie), saldosDe(c.eje, yo).filter((s) => s.declarable).map((s) => s.serie), 'lo que llevo, leído de saldosDe');
    assert.ok(antes.noSeLleva.some((x) => x.serie.startsWith('T:') && /no se guarda/.test(x.causa)), 'la T no se lleva, con su causa tal cual');
    assert.deepEqual(antes.puntos, ['vigente'], 'sin cambios en vigor, solo las reglas vigentes');
    assert.equal(antes.siguiente.que, 'declarar');
    assert.equal(antes.sinSello, null);
    assert.equal(antes.claves, 2);
    assert.match(antes.aparte, /send to another book/);
    const { vista, nuevo } = await recorrerLaSalida(c);
    assert.deepEqual(vista.pasos.filter((p) => p.estado !== 'hecho'), [], 'todo hecho');
    // El libro nuevo es otro libro de esta cuenta: misma clave, en «Tus libros», colgado de mi alta en el viejo.
    const entrada = PU.entradaDeLaSalida(Q.cuentas(), { publica: c.cuenta.publica, libro: c.eje.genesisId, elemento: c.cuenta.alta, nombre: 'Lo mío' });
    assert.equal(entrada?.alta, nuevo.cuenta.alta);
    assert.equal(entrada.libro, nuevo.eje.genesisId);
    const guardado = await Q.abrirCuenta(entrada.alta);
    assert.ok(guardado.eje, guardado.motivo);
    assert.equal(guardado.publica, c.cuenta.publica, 'la misma clave');
    const traidos = PU.traidosDelLibro(guardado.eje, yo, { mios: Q.cuentas() });
    assert.equal(traidos.length, antes.lleva.length, 'una declaración traída por serie');
    for (const x of traidos) {
      assert.equal(x.fiable, true);
      assert.equal(x.libro, c.eje.genesisId);
      assert.ok(x.firme);
      assert.equal(x.libroNombre, 'Ana', 'de qué libro vino, por su nombre');
    }
  });
});

test('salida: sin sello del libro viejo, traer espera con su frase; un libro de demostración lo dice', async () => {
  await conAlmacen(async () => {
    const c = await libroConSellador('Bea');
    const { vista } = await recorrerLaSalida(c, { sellar: false });
    const esperan = vista.pasos.filter((p) => p.estado === 'espera');
    assert.ok(esperan.length >= 1);
    assert.ok(esperan.every((p) => p.que === 'traer' && p.espera === ESPERAS_DE_LA_SALIDA.sello), JSON.stringify(esperan));
    assert.equal(vista.siguiente, null, 'nada que firmar mientras espera');
    const demo = await Eje.genesis({ identidad: 'ana', foco: ['demo'], t: T1, demostracion: true });
    assert.equal(PU.salidaDe(demo, 'ana').sinSello, 'demostracion');
    assert.equal(PU.salidaDe(demo, 'nadie'), null, 'sin alta, no hay salida');
  });
});

test('salida en la vista: la entrada en «Reglas del libro», lo que llevo, la causa y la espera tal cual, la frase del sello y un solo botón; todo escapado', async () => {
  await conAlmacen(async () => {
    const c = await libroConSellador('Cris');
    const yo = c.cuenta.identidad;
    const lista = reglasDelLibro(c.eje, yo);
    assert.match(htmlReglas({ lista, puedeSalir: true }), /data-salida-abrir/);
    assert.doesNotMatch(htmlReglas({ lista, puedeSalir: false }), /data-salida-abrir/);
    const vista = PU.salidaDe(c.eje, yo, { nombre: 'Lo mío' });
    const h = htmlReglas({ lista, salida: { vista, nombre: 'Lo mío', coste: PU.costeDelPaso(c.eje, vista.siguiente), nuevo: null, sinCuenta: false, ocupado: false } });
    assert.match(h, /data-salida-sello/);
    assert.ok(h.includes(t('salidaSello')));
    assert.equal((h.match(/data-salida-firmar/g) ?? []).length, 1, 'un solo botón');
    assert.ok(h.includes(ESPERAS_DE_LA_SALIDA.declaracion), 'la espera, con su frase tal cual');
    assert.ok(h.includes('send to another book'), 'lo que va aparte, tal cual');
    assert.doesNotMatch(h, /data-salida-abrir/, 'dentro de la salida, sin la entrada');
    // Lo que viene de un registro se pinta como texto.
    const mala = { ...vista, lleva: [{ serie: '"><img src=x>', texto: '<script>1</script>' }], noSeLleva: [{ serie: 'x', texto: '<b>x</b>', causa: '<i>causa</i>' }] };
    const h2 = htmlReglas({ lista, salida: { vista: mala, nombre: '<u>n</u>', coste: null, nuevo: { nombre: '<s>n</s>' }, sinCuenta: false, ocupado: false } });
    assert.doesNotMatch(h2, /<script>|<img |<i>causa|<u>n|<s>n|<b>x/);
  });
});

// ---------- 2. el puente entre mis libros abiertos ----------

/** Lanza `nombre` sobre X en `eje` por el camino de la carta (carta.js enviar), firmado; falla la prueba si no entra. */
async function escribe(eje, X, nombre, valores, yo, firmar) {
  const r = await enviar(eje, X, nombre, valores, yo, firmar, { t: reloj() });
  assert.ok(r.asentado, nombre + ': ' + JSON.stringify(r.motivos));
  return r.asentado;
}

/**
 * Dos libros míos (la misma clave), A con quien lo selle, enlazados por mí en los dos sentidos con sus claves de
 * línea: en A, «open a private book here» sobre la sala con las claves de B; en B, «this book hangs from» la sala de A con
 * las de A. Un «menú» en A con 5 E atadas a él.
 */
async function dosLibrosMios() {
  const A = await libroConSellador('Ana');
  const yo = A.cuenta.identidad;
  const firmarA = Q.firmarCon(A.privada);
  const sala = await escribe(A.eje, A.cuenta.alta, 'anchor here', { title: 'sala', content: 'la sala' }, yo, firmarA);
  const menu = await escribe(A.eje, sala.id, 'anchor here', { title: 'menú', content: 'el menú del sábado' }, yo, firmarA);
  await escribe(A.eje, A.cuenta.alta, 'give own R', { quantity: 1 }, yo, firmarA);
  await escribe(A.eje, menu.id, 'issue E tied to X', { denomination: 'plato', quantity: 5 }, yo, firmarA);
  const b = await Q.crearCuenta({ nombre: 'Ana privado', conClave: { publica: A.cuenta.publica, privada: A.privada }, identidad: yo, t: reloj() });
  // Las claves de línea de B, anotadas en el enlace de A. B no declara «exterior settings»: un registro anclado en el 9 de su
  // génesis no deja traer a B (lo que se dice en el informe del encargo; sin tocar la época).
  const clavesB = { casa: await generarClaves(), sellador: await generarClaves() };
  const lineasB = [[1, clavesB.casa.publica], [4, clavesB.sellador.publica]];
  const firmarB = Q.firmarCon(b.privada);
  const abre = await escribe(A.eje, sala.id, 'open a private book here', { book: b.eje.genesisId, 'line keys': lineasB }, yo, firmarA);
  const cuelga = await escribe(b.eje, b.eje.genesisId, 'this book hangs from', { book: A.eje.genesisId, element: sala.id, 'line keys': A.lineas }, yo, firmarB);
  await Q.guardarCuenta({ cuenta: A.cuenta, eje: A.eje, privada: A.privada });
  await Q.guardarCuenta({ cuenta: b.cuenta, eje: b.eje, privada: b.privada }, { recordar: false });
  return { A, B: b, yo, sala, menu, abre, cuelga, firmarA, firmarB, serie: 'E:' + yo + '/plato@' + menu.id };
}

test('puente: entre dos libros abiertos de la misma cuenta, cada enlace con su grado; traer, enviar, traer el envío y recibirlo', async () => {
  await conAlmacen(async () => {
    const m = await dosLibrosMios();
    const { A, B, yo } = m;
    const mios = Q.cuentas();
    const [enA] = PU.enlacesDelLibro(A.eje, yo, { mios });
    assert.deepEqual([enA.id, enA.libro, enA.tipo, enA.grado, enA.cuenta, enA.claves, enA.nivelMasBajo, enA.enviar, enA.traer], [m.abre.id, B.eje.genesisId, 'abre', 'del dueño', true, 2, 1, true, true]);
    const [enB] = PU.enlacesDelLibro(B.eje, yo, { mios });
    assert.deepEqual([enB.id, enB.tipo, enB.cuenta, enB.traer, enB.enviar], [m.cuelga.id, 'cuelga', true, true, false], 'en B no tengo E: no se ofrece enviar');
    // Traer el menú de A a B: de lo que A tiene sellado.
    assert.deepEqual(PU.traibles(B.eje, m.cuelga.id, A.eje).lista, [], 'nada sellado todavía');
    assert.ok(PU.traibles(B.eje, m.cuelga.id, A.eje).esperan > 0);
    await A.sellar(m.menu.id);
    assert.deepEqual(PU.traibles(B.eje, m.cuelga.id, A.eje).lista.map((x) => x.id), [m.menu.id]);
    assert.ok(PU.costeDeTraer(B.eje, yo, { enlace: m.cuelga.id, origen: A.eje, id: m.menu.id }));
    const traido = await PU.traerDeOtroLibro(B.eje, yo, { enlace: m.cuelga.id, origen: A.eje, id: m.menu.id, firmar: m.firmarB, t: reloj() });
    assert.ok(traido.asentado, JSON.stringify(traido.motivos));
    assert.deepEqual(PU.traibles(B.eje, m.cuelga.id, A.eje).lista, [], 'lo ya traído no se ofrece otra vez');
    // Enviar 2 E de A a B (a mi clave).
    const cruza = PU.loQueCruza(A.eje, yo);
    assert.deepEqual(cruza.map((c) => [c.serie, c.disponible, c.soloA]), [[m.serie, 5, null]]);
    const datos = { enlace: m.abre.id, serie: m.serie, cantidad: 2, publica: A.cuenta.publica };
    assert.ok(PU.costeDelEnvio(A.eje, yo, datos));
    const envio = await PU.enviarAOtroLibro(A.eje, yo, { ...datos, firmar: m.firmarA, t: reloj() });
    assert.ok(envio.asentado, JSON.stringify(envio.motivos));
    assert.deepEqual(PU.enlacesDelLibro(A.eje, yo, { mios })[0].fondo.map((f) => [f.quien, f.serie, f.cantidad]), [[yo, m.serie, 2]], 'el fondo bloqueado por el enlace');
    // Traer el envío a B y recibirlo.
    await A.sellar(envio.asentado.id);
    const envioTraido = await PU.traerDeOtroLibro(B.eje, yo, { enlace: m.cuelga.id, origen: A.eje, id: envio.asentado.id, firmar: m.firmarB, t: reloj() });
    assert.ok(envioTraido.asentado, JSON.stringify(envioTraido.motivos));
    let leido = PU.traidosDelLibro(B.eje, yo, { mios }).find((x) => x.traido === envioTraido.asentado.id);
    assert.deepEqual([leido.libroNombre, leido.grado, leido.cuenta, leido.nivelMasBajo, leido.fiable, leido.envio.queda, leido.recibir], ['Ana', 'del dueño', true, 1, true, 2, true]);
    assert.ok(PU.costeDeRecibir(B.eje, yo, { id: envioTraido.asentado.id }));
    const recibo = await PU.recibirDeOtroLibro(B.eje, yo, { id: envioTraido.asentado.id, firmar: m.firmarB, t: reloj() });
    assert.ok(recibo.asentado, JSON.stringify(recibo.motivos));
    leido = PU.traidosDelLibro(B.eje, yo, { mios }).find((x) => x.traido === envioTraido.asentado.id);
    assert.deepEqual([leido.envio.queda, leido.recibir], [0, false], 'recibido entero: no se ofrece otra vez');
    const enBCruza = PU.loQueCruza(B.eje, yo);
    assert.equal(enBCruza.length, 1);
    assert.equal(enBCruza[0].disponible, 2, 'en B, 2 de la serie forastera');
    assert.equal(enBCruza[0].soloA, A.eje.genesisId, 'la forastera solo vuelve a su libro');
    // La vista: los enlaces, lo traído y lo que cruza.
    const h = htmlPuente({ enlaces: PU.enlacesDelLibro(B.eje, yo, { mios }).map((l) => ({ ...l, abierto: true })), cruza: enBCruza, enviar: null, traer: null, traidos: PU.traidosDelLibro(B.eje, yo, { mios }), motivos: [] });
    assert.match(h, /data-cambiar-claves/);
    assert.ok(h.includes(t('puenteCambiarClaves')));
    assert.ok(h.includes(t('puenteCuenta')));
    assert.match(h, /data-puente-enviar=/);
    const formulario = htmlPuente({ enlaces: [], cruza: cruza, enviar: { ...cruza[0], destinos: [{ enlace: m.abre.id, libro: B.eje.genesisId, nombre: 'Ana privado', grado: 'del dueño' }], elegido: m.abre.id }, traer: null, traidos: [], motivos: [] });
    assert.ok(formulario.includes(t('puenteAvisoEnvio')), 'el aviso antes de enviar');
    assert.ok(formulario.includes(t('puenteRedDePruebas')));
  });
});

test('puente: un enlace que no cuenta (retirado) no ofrece nada, y la vista lo dice', async () => {
  await conAlmacen(async () => {
    const m = await dosLibrosMios();
    const { A, yo } = m;
    await escribe(A.eje, m.abre.id, 'withdraw a link', {}, yo, m.firmarA);
    const [l] = PU.enlacesDelLibro(A.eje, yo, { mios: Q.cuentas() });
    assert.deepEqual([l.cuenta, l.enviar, l.traer], [false, false, false]);
    const cruza = PU.loQueCruza(A.eje, yo);
    const h = htmlPuente({ enlaces: [{ ...l, abierto: true }], cruza, enviar: { ...cruza[0], destinos: [], elegido: null }, traer: null, traidos: [], motivos: [] });
    assert.ok(h.includes(t('puenteNoCuenta')));
    assert.doesNotMatch(h, /data-puente-traer-de/);
    assert.match(h, /data-sin-destino/, 'sin enlace que cuente, no hay a dónde enviar');
  });
});

test('puente: lo traído no fiable se dice con su causa y no se enseña ni su contexto ni sus movimientos', async () => {
  const m = await dosLibros();
  const payload = [['nota con contexto']];
  const ev = await m.grande.escribir({ autor: 'ana', sobre: m.sala.id, t: m.t(), payload, movimientos: [quemaDelCoste('ana', payload, 'minuto', { eje: m.grande })], contexto: { a: 1, en: '7000000000', movimientos: [] } }, m.claves.ana.privada);
  const texto = canonico(ev.contexto);
  const corte = texto.indexOf(',"en":');
  const otra = registroComoDecupla(ev);
  otra[7] = [texto.slice(0, corte)];
  otra[3] = ['7000000000'];
  otra[5] = ['[]},"en":' + JSON.stringify(ev.en) + ',"movimientos":' + canonico(ev.movimientos)];
  const partido = await m.traerCon(m.pequeno, m.grande, ev, { record: otra, proof: await m.sellar(m.grande, ev.id) });
  assert.equal(partido.ok, true);
  const x = await m.pequeno.anadir(partido.evento);
  const [traido] = PU.traidosDelLibro(m.pequeno, 'bea', { mios: [] });
  assert.equal(traido.traido, x.id);
  assert.deepEqual([traido.fiable, traido.contexto, traido.movimientos], [false, null, null]);
  assert.match(traido.causa, /^no fiable: /);
  const h = htmlPuente({ enlaces: [], cruza: [], enviar: null, traer: null, traidos: [traido], motivos: [] });
  assert.match(h, /data-no-fiable/);
  assert.ok(h.includes(traido.causa), 'la causa, tal cual viene');
  assert.doesNotMatch(h, /7000000000/, 'ni su contexto ni sus movimientos');
});

test('puente: sin sello del otro libro, traer espera con su frase; un libro de demostración lo dice', async () => {
  const m = await dosLibros();
  await m.lanza(m.grande, 'anchor here', { X: m.sala.id, title: 'menú', content: 'el menú' }, 'ana');
  const tr = PU.traibles(m.pequeno, m.cuelga.id, m.grande);
  assert.deepEqual(tr.lista, []);
  assert.equal(tr.sinSello, 'sinSellador');
  const h = htmlPuente({ enlaces: [], cruza: [], enviar: null, traer: { enlace: m.cuelga.id, libro: 'el grande', ...tr }, traidos: [], motivos: [] });
  assert.ok(h.includes(t('puenteSinSello_sinSellador', { libro: 'el grande' })));
  const demo = await Eje.genesis({ identidad: 'ana', foco: ['demo'], t: T1, demostracion: true });
  assert.equal(PU.traibles(m.pequeno, m.cuelga.id, demo).sinSello, 'demostracion');
});
