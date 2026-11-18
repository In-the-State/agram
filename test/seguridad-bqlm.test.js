// Revisión de seguridad del BQL mínimo y su contexto (SEG-09 a SEG-12): el
// payload no fabrica movimientos ni «nadie»; la expansión de ocupantes tiene
// un presupuesto; y los textos de fuera no tocan el prototipo de los
// diccionarios del libro.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluar, evaluarRegla, evaluarEscritura, evaluarPlantilla, leerRegla, leerFormula, Presupuesto, aplanar, MemoriaDeLectura, explicar, EXPLICACION_CORTADA, POR_LIMITE, LIMITES, NADIE, DESTINOS_DE_PUT, VERIFICACION, COSTE_FIRMA, queMueve } from '../src/bqlm.js';
import { readFileSync } from 'node:fs';
import { ContextoEje } from '../src/contexto-eje.js';
import { EPOCA_0_BTML, cargarEpocaBtml } from '../src/epocas.js';
import { EPOCA_0_BTML_DATOS, REGLAS_DE_EPOCA_DATOS, PLANTILLAS_DE_EPOCA_DATOS } from '../datos/epocas/epocas.js';
import * as A from '../src/acciones.js';
import { generarClaves, firmar as firmarEvento } from '../src/autoridad.js';
import { crearEvento, canonico, cuerpo, hash, RAIZ } from '../src/evento.js';
import { validarMovimiento } from '../src/tokens.js';
import { Libro, acunar, bloquear, transaccion } from '../src/libro.js';
import { ejemploCompra } from '../ejemplos/ikisai/compra-food.mjs';
import { entrarPorInvitacion } from '../ejemplos/ikisai/altas.mjs';
import { pagaElCoste } from './ayudas-coste.js';
import { selloCompleto, declararExterior } from './ayudas-sello.js';
import { Eje } from '../src/eje.js';
import { verificado as verificadoDe } from '../src/contrato.js';

const REGLA = EPOCA_0_BTML.condiciones[0];
const uno = (src, ctx) => {
  const r = evaluar(src, ctx);
  assert.equal(r.estado, 'RESUELTO', src + ': ' + r.motivo);
  assert.equal(r.valor.length, 1, src);
  return r.valor[0];
};
const aMano = async (datos) => {
  const ev = { en: RAIZ, contexto: {}, ...datos };
  return { ...ev, id: await hash(canonico(cuerpo(ev))) };
};

test('SEG-09 una décupla del payload que imita un movimiento no cuenta: las primitivas y las familias son símbolos del libro', async () => {
  const { eje, menu } = await ejemploCompra();
  // Sin quemar T de verdad, con un payload que lleva en su 1 algo con la forma de una quema de T.
  const falso = [['T:minuto'], [1], ['nada'], [['huesped'], ['nadie']], ['burn']];
  const ev = await aMano({
    autor: 'huesped',
    sobre: menu.id,
    t: '2026-11-07T15:00:00Z',
    movimientos: [{ token: 'E', emisor: 'casa', denominacion: 'EUR', cantidad: 1, de: 'huesped', a: 'cocina' }],
    payload: ['Quema fingida', falso],
  });
  const ctx = new ContextoEje(eje, { ev, epoch: EPOCA_0_BTML });
  assert.equal(uno('count ev.1', ctx), 2, 'el movimiento y la décupla del payload colisionan en el 1');
  assert.equal(uno('count (ev.1 where it.4 = burn)', ctx), 0, 'el texto «burn» no es el símbolo burn');
  assert.equal(uno('count (ev.1 where it.0.0 = T)', ctx), 0, 'ni el texto «T» de una clave del payload es la familia T');
  assert.equal(uno('count (ev.1 where it.4 = "burn")', ctx), 1, 'como texto sigue ahí, y se puede leer');
  assert.ok((await eje.validar(ev)).some((e) => /escribir consume T/.test(e)));
  const r = evaluarRegla(REGLA, ctx);
  assert.deepEqual([r.pasa, r.estado], [false, 'RESUELTO']);
});

test('SEG-10 la expansión de ocupantes tiene un presupuesto por evaluación; las referencias repetidas se siguen una vez', async () => {
  const { eje, menu } = await ejemploCompra();
  const minuto = pagaElCoste('huesped');
  const grande = await crearEvento({ autor: 'huesped', sobre: menu.id, t: '2026-11-07T15:00:00Z', movimientos: [minuto], payload: ['Lista enorme', Array.from({ length: 20000 }, (_, k) => 'x' + k)] });
  const ctx = new ContextoEje(eje, { ev: grande });
  const r = evaluar('count ev.1', ctx);
  assert.deepEqual([r.estado, r.subtipo], ['PENDIENTE', POR_LIMITE]);
  assert.match(r.motivo, new RegExp('más de ' + LIMITES.ocupantes + ' ocupantes'));
  assert.equal(evaluar('count ev.1', ctx, { limites: { ocupantes: 50000 } }).valor[0], 20001, 'el tope se puede subir');
  // Mil referencias al mismo 1 del menú (tres platos): con la memoria por (ref, dir) se sigue una vez, y lo que
  // devuelve cada una se cobra igual (SEG-13): tres mil ocupantes, que caben en el presupuesto.
  const ref = { ref: menu.id, dir: '1000000000' };
  const repetidas = await crearEvento({ autor: 'huesped', sobre: menu.id, t: '2026-11-07T15:00:00Z', movimientos: [minuto], payload: ['Referencias', Array.from({ length: 1000 }, () => ref)] });
  assert.equal(uno('count ev.1', new ContextoEje(eje, { ev: repetidas })), 3001);
});

test('SEG-11 «nadie» es un símbolo: una identidad que se llama así no se confunde con el otro lado de una quema', async () => {
  const { eje } = await ejemploCompra();
  // B1: escribe su propia alta, aceptando la invitación de la casa (encargo 3b).
  await entrarPorInvitacion(eje, { por: 'casa', quien: 'nadie', t: '2026-11-07T15:00:00Z' });
  const alta = await eje.escribir({
    autor: 'casa',
    sobre: eje.genesisId,
    t: '2026-11-07T15:00:00Z',
    movimientos: [pagaElCoste('casa'), { token: 'E', emisor: 'casa', denominacion: 'EUR', cantidad: 5, de: 'casa', a: 'nadie' }],
    payload: ['Alta de alguien que se llama nadie', ['nadie']],
  });
  const ev = await crearEvento({ autor: 'nadie', sobre: alta.id, t: '2026-11-07T16:00:00Z', movimientos: [pagaElCoste('nadie')], payload: ['Escribe nadie'] });
  const ctx = new ContextoEje(eje, { ev, epoch: EPOCA_0_BTML });
  assert.equal(uno('first ev.3', ctx), 'nadie');
  assert.equal(uno('first ev.1.3.1', ctx), NADIE);
  assert.equal(uno('first ev.1.3.1 = first ev.3', ctx), false, 'el destino de la quema no es la identidad «nadie»');
  assert.equal(evaluar('ev.1.3.1', ctx).texto, 'nadie', 'aunque se lea igual');
  assert.deepEqual(await eje.validar(ev), []);
  assert.equal(evaluarRegla(REGLA, ctx).pasa, true, 'la identidad «nadie» quema su T como cualquiera');
});

test('SEG-12 una salida o una serie llamada «__proto__» o «constructor»: el eje la rechaza y el libro no se altera', async () => {
  for (const nombre of ['__proto__', 'constructor', 'prototype']) {
    assert.ok(validarMovimiento({ token: 'P', ambito: 'x', cantidad: 1, de: 'ana', a: 'ana', estado: 'bloqueo', salida: nombre }).some((e) => /nombre reservado/.test(e)), nombre);
    assert.ok(validarMovimiento({ token: 'E', emisor: nombre, denominacion: 'EUR', cantidad: 1, de: null, a: nombre }).some((e) => /emisor no puede llamarse/.test(e)), nombre);
  }
  const { eje } = await ejemploCompra();
  await assert.rejects(eje.escribir({
    autor: 'casa',
    sobre: eje.genesisId,
    t: '2026-11-07T15:00:00Z',
    movimientos: [pagaElCoste('casa'), { token: 'P', ambito: 'genesis', cantidad: 1, de: 'casa', a: 'casa', estado: 'bloqueo', salida: '__proto__' }],
    payload: ['bloqueo raro'],
  }), /salida no puede llamarse «__proto__»/);
  // El libro, por debajo de la validación: las claves raras son claves propias y el prototipo no cambia.
  const libro = new Libro();
  const ok = await libro.aplicar(transaccion({ movimientos: [acunar('P:x', 'ana', 10), bloquear('P:x', 'ana', 3, '__proto__'), bloquear('P:x', 'ana', 2, 'constructor'), acunar('__proto__', 'ana', 1)], autor: 'ana' }));
  assert.equal(ok.ok, true);
  const vista = libro.vista('ana');
  assert.equal(Object.getPrototypeOf(vista), Object.prototype);
  assert.deepEqual(Object.keys(vista), ['P:x', '__proto__']);
  assert.deepEqual(Object.keys(vista['P:x'].bloqueado), ['__proto__', 'constructor']);
  assert.deepEqual([vista['P:x'].disponible, Object.getOwnPropertyDescriptor(vista['P:x'].bloqueado, '__proto__').value, vista['P:x'].bloqueado.constructor], [5, 3, 2]);
  assert.equal(Object.getPrototypeOf(vista['P:x'].bloqueado), Object.prototype);
  assert.equal(Object.getOwnPropertyDescriptor(libro.sumas({ primitiva: 'acunar' }), '__proto__').value, 1);
  assert.deepEqual(Object.entries(libro.bloqueadoPorSalida('constructor')), [['P:x', 2]], 'la salida «constructor» suma lo suyo, sin leer el prototipo');
  assert.equal({}.constructor, Object, 'Object.prototype intacto');
});

test('SEG-13 el presupuesto cobra lo que devuelve cada referencia aunque esté memoizada: muchas referencias a un registro grande no salen gratis', async () => {
  const { eje, menu } = await ejemploCompra();
  const minuto = pagaElCoste('huesped');
  const grande = await eje.escribir({ autor: 'huesped', sobre: menu.id, t: '2026-11-07T15:00:00Z', movimientos: [minuto], payload: ['Doscientos', Array.from({ length: 200 }, (_, k) => 'x' + k)] });
  const ref = { ref: grande.id, dir: '1000000000' };
  const cien = await crearEvento({ autor: 'huesped', sobre: menu.id, t: '2026-11-07T15:01:00Z', movimientos: [minuto], payload: ['Cien referencias', Array.from({ length: 100 }, () => ref)] });
  const r = evaluar('count ev.1', new ContextoEje(eje, { ev: cien }));
  assert.deepEqual([r.estado, r.subtipo], ['PENDIENTE', POR_LIMITE], 'cien referencias a doscientos ocupantes son veinte mil, más que el presupuesto');
  assert.equal(evaluar('count ev.1', new ContextoEje(eje, { ev: cien }), { limites: { ocupantes: 50000 } }).valor[0], 20001, 'con más presupuesto se cuenta entero');
});

// ---------- BQL mueve: el invariante del núcleo (VG 12-11, estudio BQL-transacciones, decisión 6) ----------

/** La época 0 con una regla o una plantilla cambiadas (los datos, no el código). */
function epocaCambiada({ regla, plantilla } = {}) {
  const registros = REGLAS_DE_EPOCA_DATOS.map((r) => (regla && r.registro[0][0] === regla.nombre ? { ...r, registro: r.registro.map((x, i) => (i === 2 ? [regla.formula] : i === 4 && regla.cuatro ? regla.cuatro : x)) } : r));
  const plantillas = PLANTILLAS_DE_EPOCA_DATOS.map((p) => (plantilla && p.registro[0][0] === plantilla.nombre ? { ...p, registro: p.registro.map((x, i) => (i === 4 ? plantilla.cuatro : x)) } : p));
  return cargarEpocaBtml(JSON.parse(JSON.stringify(EPOCA_0_BTML_DATOS)), { registros, plantillas, id: EPOCA_0_BTML.id });
}

test('SEG-14 nadie mueve lo ajeno desde una regla: una regla de la época con un verbo no se carga (y evaluada, es ERROR); un put solo en una regla que escribe y solo en su lista cerrada', async () => {
  // Una condición que intentara mover (aunque el verbo quede detrás de un and que da falso): la época no se carga.
  assert.throws(() => epocaCambiada({ regla: { nombre: 'nobody moves tokens of others', formula: '=1 = 2 and transfer 1 R.("casa") from "casa" to first ev.3' } }), /mueve \(«transfer»\): una regla solo lee; solo una plantilla de transacción mueve/);
  // Ni una lectura ni una regla que escribe pueden llevar un verbo; una lectura tampoco coloca.
  assert.throws(() => epocaCambiada({ regla: { nombre: 'stage', formula: '=burn 1 T.1 from first it.3' } }), /una regla solo lee/);
  assert.throws(() => epocaCambiada({ regla: { nombre: 'writing a record gives ten P on it', formula: '=mint 10 P.(first ev.5).(first ev.3) to first ev.3' } }), /una regla solo lee/);
  assert.throws(() => epocaCambiada({ regla: { nombre: 'stage', formula: '=put 10 at (first it.3).2.1.(it)' } }), /coloca \(put\) sin ser una regla que escribe/);
  // Evaluada a mano (sin el cargador), la regla con un verbo es ERROR: nunca se mueve nada desde una regla.
  const { eje, menu } = await ejemploCompra();
  const ev = await crearEvento({ autor: 'huesped', sobre: menu.id, t: '2026-11-07T15:00:00Z', movimientos: [pagaElCoste('huesped')], payload: ['x'] });
  const ctx = new ContextoEje(eje, { ev, epoch: EPOCA_0_BTML });
  const r = evaluarRegla([['thief'], [], ['=1 = 1 or transfer 12 E.("casa").("EUR") from "cocina" to first ev.3'], ['ev.3'], ['transfer'], ['*'], ['x'], ['epoch 0'], ['first'], ['no']], ctx);
  assert.deepEqual([r.pasa, r.estado], [false, 'ERROR']);
  // Una regla que escribe solo coloca en A.2.1 (el P posicionado): el libro, por su cuenta, solo acuña hasta un nivel ahí.
  const w = evaluarEscritura([['writer'], [], ['=put 100 at (first ev.3).1.("E:casa/EUR")'], ['ev.3'], ['put'], ['*'], ['x'], ['epoch 0'], ['first'], ['no']], ctx);
  assert.deepEqual([w.estado, w.escrituras], ['ERROR', []]);
  assert.deepEqual(DESTINOS_DE_PUT, [[2, 1]]);
});

test('SEG-15 las plantillas construyen y firma quien mueve: un verbo que nombra lo ajeno se construye, pero lo rechaza la regla; lo que sale lo firma quien lanza la plantilla', async () => {
  const claves = { casa: await generarClaves(), cocina: await generarClaves(), huesped: await generarClaves() };
  const { eje, menu } = await ejemploCompra({ claves });
  const firmar = (ev) => firmarEvento(ev, claves.huesped.privada);
  // «anchor here» con una sentencia que mueve los euros de la cocina hacia quien lanza: la candidata se construye (la
  // plantilla propone), la firma la huésped, y la regla «nobody moves tokens of others» la rechaza.
  const ladrona = epocaCambiada({ plantilla: { nombre: 'anchor here', cuatro: ['=transfer 12 E.("casa").("EUR") from first it.3 to me'] } });
  const r = await A.transaccion(eje, 'anchor here', { X: menu.id, title: 'mía' }, 'huesped', { t: '2026-11-07T15:00:00Z', firmar, epoca: ladrona });
  assert.equal(r.ok, false);
  assert.deepEqual([r.evento.autor, r.evento.firmante, r.evento.movimientos[1]], ['huesped', 'huesped', { token: 'E', emisor: 'casa', denominacion: 'EUR', cantidad: 12, de: 'cocina', a: 'huesped' }]);
  assert.ok(r.motivos.some((m) => m.regla === 'nobody moves tokens of others'), JSON.stringify(r.motivos));
  await assert.rejects(eje.anadir(r.evento), /nobody moves tokens of others/);
  // Lo suyo, en cambio, pasa: la misma plantilla moviendo lo de quien la lanza (la firma la huésped, que es quien mueve).
  const propia = epocaCambiada({ plantilla: { nombre: 'anchor here', cuatro: ['=transfer 2 E.("casa").("EUR") from me to first it.3'] } });
  const ok = await A.transaccion(eje, 'anchor here', { X: menu.id, title: 'propina' }, 'huesped', { t: '2026-11-07T15:00:00Z', firmar, epoca: propia });
  assert.deepEqual([ok.ok, ok.evento.firmante, ok.evento.movimientos[1].de], [true, 'huesped', 'huesped'], JSON.stringify(ok.motivos));
  // Una serie escrita como texto no la fabrica una plantilla (SEG-09): ERROR al construir.
  const texto = epocaCambiada({ plantilla: { nombre: 'anchor here', cuatro: ['=transfer 2 "E:casa/EUR" from me to first it.3'] } });
  const t = await A.transaccion(eje, 'anchor here', { X: menu.id, title: 'texto' }, 'huesped', { t: '2026-11-07T15:00:00Z', epoca: texto });
  assert.equal(t.ok, false);
  assert.match(t.motivos[0].mensaje, /un texto no fabrica una serie/);
});

// ---------- primitivas de verificación (Core AGRAM 12-11, #67; docs/BQLM.md §12) ----------

/** Un contexto que revienta si se le pregunta algo: una primitiva con argumentos literales no lo toca. */
const SIN_LIBRO = new Proxy({}, { get: (_, k) => (k === 'then' ? undefined : () => { throw new Error('la primitiva leyó el contexto: ' + String(k)); }) });

test('SEG-16 ninguna primitiva firma: no hay sign ni claves privadas en el léxico, y src/cripto.js solo llama a schnorr.verify y, para el TapTweak (H20), a la aritmética pública de la curva', () => {
  for (const f of Object.keys(VERIFICACION)) assert.doesNotMatch(f, /^sign$|priv|secret|key|firm/i, f);
  assert.ok(Object.hasOwn(VERIFICACION, 'signed'), 'signed verifica: devuelve verdadero o falso');
  for (const e of ['sign(bytes("00"), bytes("00"))', 'schnorr(1)', 'getPublicKey(bytes("00"))']) assert.match(evaluar(e, SIN_LIBRO).motivo, /no es BQL mínimo/, e);
  const fuente = readFileSync(new URL('../src/cripto.js', import.meta.url), 'utf8').replace(/^\s*\/\/.*$/gm, '');
  assert.deepEqual([...fuente.matchAll(/schnorr\.(\w+(?:\.\w+)?)/g)].map((m) => m[1]), ['verify', 'utils.lift_x', 'Point.BASE'], 'verify; y lift_x y el generador, sin secretos, para el TapTweak');
  assert.doesNotMatch(fuente, /\.multiply\(|fromPrivateKey|taggedHash/, 'solo multiplyUnsafe del generador por un ajuste público');
  assert.doesNotMatch(fuente, /getPublicKey|randomSecretKey|\.sign\(|privad/);
});

test('SEG-17 ninguna primitiva lee fuera del libro: con argumentos literales no toca el contexto; src/cripto.js no importa nada más que la verificación ni hace E/S', () => {
  const casos = ['hex(bytes("00ff"))', 'hex(utf8("a"))', 'hex(hash("a"))', 'hex(hash("a", "t"))', 'hex(sha256(bytes("")))', 'hex(sha256d(bytes("")))', 'hex(cat(bytes("01"), bytes("02")))',
    'hex(slice(bytes("0102"), 0, 1))', 'hex(reverse(bytes("0102")))', 'le(bytes("01"))', 'below(bytes("00"), bytes("01"))', 'signed(bytes("' + '00'.repeat(64) + '"), bytes("' + '00'.repeat(32) + '"), bytes("' + '00'.repeat(32) + '"))'];
  for (const e of casos) assert.equal(evaluar(e, SIN_LIBRO).estado, 'RESUELTO', e + ': ' + evaluar(e, SIN_LIBRO).motivo);
  for (const e of casos) assert.deepEqual(queMueve('=' + e), { verbo: null, put: false }, e);
  const fuente = readFileSync(new URL('../src/cripto.js', import.meta.url), 'utf8').replace(/^\s*\/\/.*$/gm, '');
  assert.deepEqual([...fuente.matchAll(/^import .* from '(.*)';$/gm)].map((m) => m[1]), ['./vendor/noble-secp256k1.js']);
  assert.doesNotMatch(fuente, /fetch|XMLHttpRequest|globalThis|process\.|require\(|import\(|Date\.|Math\.random|localStorage|crypto\.subtle/);
});

test('SEG-18 el presupuesto corta una tx o un cat desmesurados antes de procesarlos; una tx de 100 KB cabe', () => {
  // Una transacción válida de ~100 KB (un scriptSig enorme): cabe en el presupuesto de una evaluación.
  const tx = (n) => '01000000' + '01' + 'aa'.repeat(32) + '00000000' + 'fe' + Buffer.from(Uint32Array.of(n).buffer).toString('hex') + '51'.repeat(n) + 'ffffffff' + '01' + '0000000000000000' + '00' + '00000000';
  const ctx = (h) => new ContextoEje(null, { epoch: [[h]] });
  const cien = evaluar('count (first tx(bytes(first epoch.0)).1)', ctx(tx(100000)));
  assert.equal(cien.estado, 'RESUELTO', cien.motivo);
  // Una de 1,2 MB: bytes(…) paga 1,2 MB y tx(…) pediría 2,4 MB más; se para con PENDIENTE POR LÍMITE.
  const t0 = Date.now();
  const enorme = evaluar('count (first tx(bytes(first epoch.0)).1)', ctx(tx(1200000)));
  assert.equal(enorme.subtipo, POR_LIMITE, enorme.motivo);
  assert.match(enorme.motivo, /bytes procesados/);
  assert.ok(Date.now() - t0 < 5000, 'se corta sin procesarla');
  // cat: con un tope de 1000 bytes, dos bytes(…) de 500 caben y el cat de los dos, no.
  const h = 'ab'.repeat(500);
  assert.equal(evaluar('count (bytes("' + h + '") = bytes("' + h + '"))', SIN_LIBRO, { limites: { bytes: 1000 } }).estado, 'RESUELTO');
  assert.equal(evaluar('hex(cat(bytes("' + h + '"), bytes("' + h + '")))', SIN_LIBRO, { limites: { bytes: 1000 } }).subtipo, POR_LIMITE);
  // Un cat que se repite en un where: el presupuesto es de toda la evaluación.
  const repetido = evaluar('count (epoch.0 where count cat(bytes(it), bytes(it), bytes(it), bytes(it)) = 1)', new ContextoEje(null, { epoch: [Array.from({ length: 200 }, (_, k) => 'ab'.repeat(2000) + k.toString(16).padStart(2, '0'))] }));
  assert.equal(repetido.subtipo, POR_LIMITE, repetido.motivo);
  // Las firmas pagan COSTE_FIRMA cada una: no se pueden verificar sin tope.
  assert.ok(LIMITES.bytes / COSTE_FIRMA < 100);
  const firma = 'signed(bytes("' + '00'.repeat(64) + '"), bytes("' + '00'.repeat(32) + '"), bytes("' + '00'.repeat(32) + '"))';
  const muchas = evaluar('count (epoch.0 where ' + firma + ')', new ContextoEje(null, { epoch: [Array.from({ length: 100 }, (_, k) => 'f' + k)] }));
  assert.equal(muchas.subtipo, POR_LIMITE, muchas.motivo);
});

test('SEG-19 la regla «sealed» no acepta un sello firmado por una clave fuera de la lista de la cuenta raíz, ni la que declara otro, ni una prueba copiada en el payload', async () => {
  const cuenta = await generarClaves();
  const eje = await Eje.genesis({ identidad: 'vg', foco: ['mi eje'], t: '2026-11-10T10:00:00Z', clave: cuenta.publica, privada: cuenta.privada, exigirFirmas: true });
  const declarada = await generarClaves();
  const intrusa = await generarClaves();
  await declararExterior(eje, { observadores: [declarada.publica], privada: cuenta.privada, t: '2026-11-10T10:01:00Z' });
  const ev = await eje.escribir({ autor: 'vg', sobre: eje.genesisId, t: '2026-11-10T10:02:00Z', movimientos: [pagaElCoste('vg')], payload: ['uno'] }, cuenta.privada);
  const sealed = (id) => evaluar('=first (first it.6).8.5', new ContextoEje(eje, { epoch: EPOCA_0_BTML }), { sujeto: id });
  // Una prueba completa y coherente, pero firmada por una clave que la cuenta raíz no declaró: falso.
  eje.marcarSello(ev.id, await selloCompleto(ev.id, { observador: intrusa }));
  assert.deepEqual(sealed(ev.id).valor, [false]);
  assert.equal(verificadoDe(eje, ev.id).sello, false);
  // La lista que cuenta es la de la cuenta RAÍZ: unos ajustes del exterior de otra identidad no la amplían.
  assert.deepEqual(evaluar('before.8.6', new ContextoEje(eje, { epoch: EPOCA_0_BTML })).valor, [declarada.publica]);
  // Una «prueba» escrita en el payload del propio registro (su 6.8.2) no se lee: el núcleo lee el 6 implícito (first it.6).
  const prueba = (await selloCompleto(eje.genesisId, { observador: declarada })).decupla;
  const falso = await eje.escribir({ autor: 'vg', sobre: eje.genesisId, t: '2026-11-10T10:03:00Z', movimientos: [pagaElCoste('vg')], payload: ['dos', '-', '-', '-', '-', '-', ['-', '-', '-', '-', '-', '-', '-', '-', ['-', '-', prueba]]] }, cuenta.privada);
  assert.equal(sealed(falso.id).estado, 'PENDIENTE', 'sin sello del eje, falta el dato; lo del payload no cuenta');
});

test('SEG-20 la regla «sealed» no acepta un anclaje Taproot manipulado: otra clave interna, un hermano Taproot cambiado o de más, otra salida, otra transacción (H20)', async () => {
  const cuenta = await generarClaves();
  const eje = await Eje.genesis({ identidad: 'vg', foco: ['mi eje'], t: '2026-11-10T10:00:00Z', clave: cuenta.publica, privada: cuenta.privada, exigirFirmas: true });
  const declarada = await generarClaves();
  await declararExterior(eje, { observadores: [declarada.publica], privada: cuenta.privada, t: '2026-11-10T10:01:00Z' });
  const sealed = (id) => evaluar('=first (first it.6).8.5', new ContextoEje(eje, { epoch: EPOCA_0_BTML }), { sujeto: id });
  let minuto = 2;
  const nuevo = async () => eje.escribir({ autor: 'vg', sobre: eje.genesisId, t: '2026-11-10T10:' + String(minuto++).padStart(2, '0') + ':00Z', movimientos: [pagaElCoste('vg')], payload: ['r' + minuto] }, cuenta.privada);
  // El de verdad, con otros lotes en el mismo anclaje: verdadero.
  const bueno = await nuevo();
  eje.marcarSello(bueno.id, await selloCompleto(bueno.id, { observador: declarada, otrosLotes: 3 }));
  assert.deepEqual(sealed(bueno.id).valor, [true]);
  // Otra clave interna que sí es un punto de la curva (la x del generador), un hermano cambiado o uno de más: la clave de
  // salida ya no es la de la transacción. Una transacción cambiada (otra salida, otro locktime): tampoco cuadra. Falso.
  const G = '79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';
  for (const [que, cambiar] of [
    ['otra interna', (x) => { x.prueba.taproot.interna = G; }],
    ['un hermano cambiado', (x) => { x.prueba.taproot.hermanos[1] = 'ab'.repeat(32); }],
    ['un hermano de más', (x) => { x.prueba.taproot.hermanos.push('ab'.repeat(32)); }],
    ['un hermano de menos', (x) => { x.prueba.taproot.hermanos.pop(); }],
    ['otra salida en la transacción', (x) => { x.prueba.taproot.tx = x.prueba.taproot.tx.replace(/22(5120[0-9a-f]{64})00000000$/, (m, sc) => '22' + sc.slice(0, -2) + (sc.endsWith('00') ? '01' : '00') + '00000000'); }],
    ['otro locktime (otro txid)', (x) => { x.prueba.taproot.tx = x.prueba.taproot.tx.slice(0, -8) + '01000000'; }],
  ]) {
    const ev = await nuevo();
    eje.marcarSello(ev.id, await selloCompleto(ev.id, { observador: declarada, otrosLotes: 3, cambiar }));
    assert.deepEqual(sealed(ev.id).valor, [false], que);
    assert.equal(verificadoDe(eje, ev.id).sello, false, que);
  }
});

// ---------- §15 (Core AGRAM 18-11): apply, follow, keep, group, row, with y take no abren puertas ----------

/** Fórmulas guardadas en un payload, leído como `epoch`: una cadena de nueve que se aplican una dentro de otra, una que se
 * aplica a sí misma, dos que se aplican la una a la otra y unas que mueven o colocan. */
const GUARDADAS = [
  ['=it'], // 0
  ['=apply(first epoch.0, it) + 1'], // 1
  ['=apply(first epoch.1, it) + 1'], // 2
  ['=apply(first epoch.2, it) + 1'], // 3
  ['=apply(first epoch.3, it) + 1'], // 4
  ['=apply(first epoch.4, it) + 1', '=apply(last epoch.5, it)'], // 5: la 5.0 sigue la cadena; la 5.1 se aplica a sí misma
  ['=apply(first epoch.5, it) + 1', '=apply(last epoch.7, it)'], // 6: la 6.1 aplica la 7.1…
  ['=apply(first epoch.6, it) + 1', '=apply(last epoch.6, it)'], // 7: …y la 7.1 aplica la 6.1
  ['=apply(first epoch.7, it) + 1', '=mint 1 T.1 to me', '=1 = 2 and burn 1 T.1 from me', '=put 1 at me.2.1.("x")'], // 8: y tres que mueven o colocan
  ['=apply(first epoch.8, it) + 1', '=(1 with 2) keep it2 > 1', 'hola', '==it'], // 9: la cadena llega a diez; un keep; dos textos que no son fórmulas
];
const enGuardadas = new ContextoEje(null, { epoch: GUARDADAS });
const lee = (src, opciones = {}) => evaluar(src, enGuardadas, opciones);
const porLimiteEn = (r, que) => {
  assert.equal(r.estado, 'PENDIENTE', que + ': ' + r.estado + ' ' + (r.texto ?? r.motivo));
  assert.equal(r.subtipo, POR_LIMITE, que + ': ' + r.motivo);
};

test('SEG-21 apply: la bomba de recursión acaba; una fórmula que se aplica a sí misma (directa o por otra) es ERROR; el tope de anidamiento es PENDIENTE POR LÍMITE', () => {
  assert.deepEqual(lee('apply(first epoch.7, 0)').valor, [7], 'ocho, una dentro de otra, caben');
  porLimiteEn(lee('apply(first epoch.9, 0)'), 'nueve no');
  assert.match(lee('apply(first epoch.9, 0)').motivo, /apply anidado más de 8 niveles/);
  assert.deepEqual(lee('apply(first epoch.9, 0)', { limites: { aplicacion: 10 } }).valor, [9], 'el tope se cambia con opciones.limites.aplicacion');
  porLimiteEn(lee('apply(first epoch.3, 0)', { limites: { aplicacion: 2 } }), 'y se baja');
  const a = lee('apply(last epoch.5, 0)');
  assert.equal(a.estado, 'ERROR');
  assert.match(a.motivo, /se aplica a sí misma \(ciclo\)/);
  const b = lee('apply(last epoch.6, 0)');
  assert.equal(b.estado, 'ERROR', 'la 6.1 aplica la 7.1, que aplica la 6.1');
  assert.match(b.motivo, /se aplica a sí misma/);
  // La misma fórmula una al lado de otra (no una dentro de otra) no es un ciclo.
  assert.deepEqual(lee('apply(first epoch.1, 1 with 2) with apply(first epoch.1, 3)').valor, [2, 3, 4]);
});

test('SEG-22 apply: una fórmula guardada nunca mueve ni coloca, ni en una plantilla; un texto que no es fórmula no se evalúa', () => {
  for (const k of [1, 2]) {
    for (const opciones of [{}, { mover: true }, { escribir: true }]) {
      const r = lee('apply(nth ' + k + ' epoch.8, 0)', opciones);
      assert.equal(r.estado, 'ERROR', k + ' ' + JSON.stringify(opciones));
      assert.match(r.motivo, /una fórmula aplicada nunca mueve ni escribe/);
    }
  }
  // El verbo detrás de un and que da falso tampoco: se mira el árbol entero de la fórmula aplicada.
  assert.match(lee('apply(nth 2 epoch.8, 0)').motivo, /lleva burn/);
  assert.match(lee('apply(nth 3 epoch.8, 0)', { escribir: true }).motivo, /lleva put/);
  // En una plantilla de transacción, que sí mueve, la fórmula aplicada sigue sin mover.
  const p = evaluarPlantilla(['=apply(nth 1 epoch.8, it)'], enGuardadas, { sujeto: 0 });
  assert.equal(p.estado, 'ERROR');
  assert.deepEqual(p.movimientos, []);
  for (const k of [2, 3]) {
    const r = lee('apply(nth ' + k + ' epoch.9, 0)');
    assert.equal(r.estado, 'ERROR');
    assert.match(r.motivo, /no es fórmula no se evalúa/);
  }
  assert.match(lee('apply(1, 0)').motivo, /aplica una fórmula/);
});

test('SEG-23 apply comparte los pasos y el presupuesto de quien la llama: una lista gigante dentro de una fórmula aplicada se corta igual', () => {
  const dentro = '"=count (1 follow (it2 + 1 where it3 <= 3000))"';
  assert.deepEqual(lee('apply(' + dentro + ', 1)').valor, [3000]);
  porLimiteEn(lee('apply(' + dentro + ', 1 with 2 with 3 with 4)'), 'cuatro veces no caben en un presupuesto');
  const presupuesto = new Presupuesto();
  lee('apply(' + dentro + ', 1)', { presupuesto });
  assert.ok(presupuesto.usados >= 3000, 'lo de dentro se cobra al presupuesto de fuera: ' + presupuesto.usados);
  porLimiteEn(lee('apply("=it + 1", 1 with 2 with 3 with 4 with 5)', { limites: { pasos: 5 } }), 'y a los pasos');
});

test('SEG-24 listas gigantes: follow, with, row, group y take se cobran al presupuesto; take no salva lo que ya se gastó', () => {
  const mil = (n) => '(1 follow (it + 1 where it2 <= ' + n + '))';
  porLimiteEn(lee('take 5 (1 follow it + 1)'), 'take no corta un follow sin fin');
  porLimiteEn(lee('count (' + mil(3000) + ' with ' + mil(3000) + ')'), 'with');
  porLimiteEn(lee('count row(' + mil(3000) + ', ' + mil(3000) + ')'), 'row');
  porLimiteEn(lee('count (' + mil(6000) + ' group it)'), 'group: un ocupante por grupo, encima de los del follow');
  assert.deepEqual(lee('count (' + mil(3000) + ' group it)').valor, [3000]);
});

test('SEG-25 follow: una relación en ciclo acaba sin repetir; una que fabrica valores nuevos sin fin acaba en PENDIENTE POR LÍMITE, no se cuelga', async () => {
  const eje = await Eje.genesis({ demostracion: true, identidad: 'g', t: '2026-11-08T10:00:00Z', foco: 'raíz' });
  await entrarPorInvitacion(eje, { por: 'g', quien: 'ana', t: '2026-11-08T10:00:00Z', da: [] });
  const c = new ContextoEje(eje, { epoch: EPOCA_0_BTML });
  // up y down, juntos, son una relación en ciclo: el padre de mi hijo soy yo.
  const r = evaluar('it follow (up it2 with down it2)', c, { sujeto: eje.genesisId });
  assert.equal(r.estado, 'RESUELTO', r.motivo);
  const ids = r.valor.map((o) => aplanar(o, c));
  assert.equal(new Set(ids).size, ids.length, 'sin repetir');
  assert.deepEqual(new Set(ids), new Set(evaluar('under it', c, { sujeto: eje.genesisId }).valor.map((o) => aplanar(o, c))), 'todo el árbol, una vez');
  // Valores nuevos sin fin: números, textos y bytes.
  porLimiteEn(lee('1 follow it + 1'), 'números');
  porLimiteEn(lee('"a" follow hex(sha256(utf8(it)))'), 'textos');
  porLimiteEn(lee('1 follow (it * 2 with it * 2 + 1)'), 'una bifurcación sin fin');
  porLimiteEn(lee('1 follow it + 1', { limites: { pasos: 50 } }), 'o se acaban antes los pasos');
});

test('SEG-26 keep: solo en una lectura para la pantalla (opciones.lectura); en una regla, una plantilla o una regla que escribe es ERROR aunque no se evalúe', () => {
  const regla = (dos, cuatro = []) => [['regla de prueba'], [], [dos], [], cuatro, [], [], [], [], ['no se cumple']];
  const keep = '=count ((1 with 2) keep it > 1) = 1';
  const muerto = '=1 = 2 and count ((1 with 2) keep it > 1) = 1';
  assert.deepEqual(lee(keep, { lectura: true }).valor, [true]);
  for (const src of [keep, muerto]) {
    for (const opciones of [{}, { sujeto: 0 }, { lectura: true, mover: true }, { lectura: true, escribir: true }]) {
      const r = lee(src, opciones);
      assert.equal(r.estado, 'ERROR', src + ' ' + JSON.stringify(opciones));
      assert.match(r.motivo, /keep: solo en una lectura/);
    }
    const c = evaluarRegla(regla(src), enGuardadas, { lectura: true });
    assert.equal(c.pasa, false);
    assert.equal(c.estado, 'ERROR', 'una condición no la acepta aunque se le pase lectura');
    assert.equal(evaluarEscritura(regla(src, ['put']), enGuardadas, { lectura: true }).estado, 'ERROR');
    assert.equal(evaluarPlantilla([src], enGuardadas, { sujeto: 0, lectura: true }).estado, 'ERROR');
    assert.equal(leerRegla(regla(src, ['read']), 0, enGuardadas).estado, 'ERROR', 'una lectura B5 alimenta reglas: no la pone');
    assert.equal(leerFormula(src, 0, enGuardadas).estado, 'ERROR', 'una fórmula del payload tampoco');
  }
  // Dentro de una fórmula aplicada, igual: solo en una lectura.
  assert.match(lee('apply(nth 1 epoch.9, 0)').motivo, /keep: solo en una lectura/);
  assert.deepEqual(lee('apply(nth 1 epoch.9, 0)', { lectura: true }).valor, [2]);
});

test('SEG-27 keep no se traga un límite de cálculo: presupuesto, pasos, el tope de apply o un follow sin fin paran toda la lectura', () => {
  const L = { lectura: true };
  porLimiteEn(lee('(1 with 2) keep count (it follow it2 + 1) > 0', L), 'un follow sin fin');
  porLimiteEn(lee('(1 with 2) keep apply(first epoch.9, it) > 0', L), 'el tope de apply');
  porLimiteEn(lee('(1 with 2 with 3) keep it + 1 > 0', { ...L, limites: { pasos: 4 } }), 'los pasos');
  porLimiteEn(lee('(1 with 2) keep count (1 follow (it2 + 1 where it3 <= 6000)) > 0', L), 'el presupuesto');
  // Lo que no es un límite sí se cae: el ciclo de apply es ERROR, la posición vacía PENDIENTE.
  assert.deepEqual(lee('(1 with 2) keep apply(last epoch.5, it) > 0', L).valor, []);
  assert.deepEqual(lee('(1 with 2) keep it + epoch.9.9 > 0', L).valor, []);
});

// ---------- §15.4 (Core AGRAM 18-11): la memoria de las lecturas de pantalla no toca reglas ni transacciones ----------

const T_MEM = '2026-11-08T10:00:00Z';
async function libroDeMemoria() {
  const eje = await Eje.genesis({ demostracion: true, identidad: 'g', t: T_MEM, foco: 'raíz' });
  await entrarPorInvitacion(eje, { por: 'g', quien: 'ana', t: T_MEM, da: [] });
  return eje;
}
const reglaDe = (dos, cuatro = []) => [['regla de memoria'], [], [dos], [], cuatro, [], [], [], [], ['no se cumple: {count before.1}']];

test('SEG-28 memoria: con mover, escribir, evaluarRegla, leerRegla, evaluarEscritura y evaluarPlantilla, ni se consulta ni se llena', async () => {
  const eje = await libroDeMemoria();
  const c = new ContextoEje(eje, { epoch: EPOCA_0_BTML, me: 'g' });
  const memoria = new MemoriaDeLectura();
  const nada = (que) => assert.deepEqual([memoria.tamano, memoria.aciertos, memoria.fallos], [0, 0, 0], que);
  const f = '=count before.1 > 0 and count (before.1 where count it.3 > 0) > 0';
  evaluar(f, c, { memoria }); nada('sin lectura');
  evaluar(f, c, { memoria, lectura: true, mover: true }); nada('con mover');
  evaluar(f, c, { memoria, lectura: true, escribir: true }); nada('con escribir');
  assert.equal(evaluarRegla(reglaDe(f), c, { memoria, lectura: true }).pasa, true); nada('evaluarRegla');
  assert.equal(evaluarRegla(reglaDe('=count before.1 = 0'), c, { memoria, lectura: true }).pasa, false); nada('evaluarRegla, con su mensaje');
  assert.equal(leerRegla(reglaDe(f, ['read']), eje.genesisId, c, { memoria, lectura: true }).estado, 'RESUELTO'); nada('leerRegla');
  evaluarEscritura(reglaDe(f, ['put']), c, { memoria, lectura: true }); nada('evaluarEscritura');
  evaluarPlantilla([f], c, { sujeto: eje.genesisId, memoria, lectura: true }); nada('evaluarPlantilla');
  // Una lectura sí la usa.
  evaluar(f, c, { memoria, lectura: true });
  assert.ok(memoria.tamano > 0);
});

test('SEG-29 memoria: un libro que cambia no sirve lo viejo; tampoco una vista de fuera (el sello) ni otra mirada; un límite no se recuerda', async () => {
  const eje = await libroDeMemoria();
  const memoria = new MemoriaDeLectura();
  const lee = (src, opciones = {}, me = 'g') => evaluar(src, new ContextoEje(eje, { epoch: EPOCA_0_BTML, me }), { lectura: true, memoria, ...opciones });
  const antes = lee('count before.1').valor[0];
  assert.deepEqual(lee('count before.1').valor, [antes]);
  assert.equal(memoria.aciertos, 1);
  await entrarPorInvitacion(eje, { por: 'g', quien: 'bea', t: T_MEM, da: [] });
  assert.ok(lee('count before.1').valor[0] > antes, 'un registro más: otra huella, la memoria se vacía');
  // Otra mirada (me) no reutiliza lo de la primera.
  assert.deepEqual(lee('count (me where 1 = 1)', {}, 'g').valor, [1]);
  assert.deepEqual(lee('me', {}, 'ana').valor, ['ana']);
  // El sello llega de fuera sin cambiar el libro: lo que lo lee no se recuerda.
  const id = eje.genesisId;
  assert.deepEqual(lee('count it.6.8.2', { sujeto: id }).valor, [0]);
  assert.ok(eje.marcarSello(id, { altura: 900000, hash: 'a'.repeat(64), instante: '2026-11-08T11:00:00Z' }));
  assert.deepEqual(lee('count it.6.8.2', { sujeto: id }).valor, [3], 'el sello nuevo se ve');
  // Un PENDIENTE POR LÍMITE no se recuerda; un PENDIENTE corriente y un ERROR, sí.
  memoria.vaciar();
  assert.equal(lee('count (1 follow it + 1)').subtipo, POR_LIMITE);
  assert.equal(memoria.tamano, 0);
  assert.equal(lee('(1 where 1 = 2) + 1').estado, 'PENDIENTE');
  assert.equal(lee('1 / 0').estado, 'ERROR');
  const a = memoria.aciertos;
  assert.equal(lee('(1 where 1 = 2) + 1').estado, 'PENDIENTE');
  assert.equal(lee('1 / 0').estado, 'ERROR');
  assert.equal(memoria.aciertos, a + 2);
  // Tamaño acotado: se tira lo más viejo.
  const corta = new MemoriaDeLectura(3);
  for (let k = 0; k < 10; k++) evaluar('count before.1 + ' + k, new ContextoEje(eje, { epoch: EPOCA_0_BTML }), { lectura: true, memoria: corta });
  assert.equal(corta.tamano, 3);
});

test('SEG-30 memoria: una regla cuesta lo mismo con memoria y sin ella, aunque una lectura haya recordado su fórmula', async () => {
  const eje = await libroDeMemoria();
  const c = new ContextoEje(eje, { epoch: EPOCA_0_BTML, me: 'g' });
  const f = '=count (before.1 where count it.3 > 0 and count before.3 > 0) > 0';
  const coste = (hacer) => {
    const presupuesto = new Presupuesto();
    const r = hacer(presupuesto);
    return [r.pasa ?? r.estado, presupuesto.pasos, presupuesto.usados];
  };
  const sin = coste((presupuesto) => evaluarRegla(reglaDe(f), c, { presupuesto }));
  const memoria = new MemoriaDeLectura();
  // La misma fórmula leída como lectura de pantalla, dos veces: la memoria la recuerda (y sus subexpresiones cerradas).
  evaluar(f, c, { lectura: true, memoria });
  evaluar(f, c, { lectura: true, memoria });
  assert.ok(memoria.aciertos > 0 && memoria.tamano > 0);
  const con = coste((presupuesto) => evaluarRegla(reglaDe(f), c, { presupuesto, memoria, lectura: true }));
  assert.deepEqual(con, sin);
  const sinL = coste((presupuesto) => evaluar(f, c, { presupuesto }));
  assert.deepEqual(coste((presupuesto) => evaluar(f, c, { presupuesto, memoria })), sinL, 'evaluar sin lectura, igual');
  assert.deepEqual(coste((presupuesto) => evaluar(f, c, { presupuesto, memoria, lectura: true, mover: true })), sinL, 'con mover, igual');
});

test('SEG-31 explicar (8a): su pasada tiene presupuesto propio y se corta con su marca; el veredicto es el de evaluar; no explica lo que mueve', () => {
  const c = new ContextoEje(null, { epoch: [[1, 2, 3, 4, 5, 6, 7, 8]] });
  // La evaluación cabe en 20 ocupantes; la explicación vuelve a recorrer cada parte de cada elemento y no cabe.
  const src = 'count (epoch.0 where it > 10 and it < 20 and it != 15) > 0';
  const limites = { ocupantes: 20 };
  const a = evaluar(src, c, { limites });
  assert.equal(a.estado, 'RESUELTO');
  const r = explicar(src, c, { limites });
  const { porque, ...veredicto } = r;
  assert.deepEqual(veredicto, a);
  assert.equal(porque.cortada, EXPLICACION_CORTADA);
  // Sin límites bajos, la misma se explica entera.
  assert.equal(explicar(src, c).porque.cortada, undefined);
  // Un follow sin fin: el veredicto, PENDIENTE POR LÍMITE; la explicación no se cuelga ni pasa de su presupuesto.
  const sinFin = explicar('count (1 follow it + 1) > 0', c);
  assert.equal(sinFin.subtipo, POR_LIMITE);
  // Lo que mueve no se explica: ni un verbo, ni con mover.
  assert.equal(explicar('=mint 1 T.1 to me', c).estado, 'ERROR');
  assert.equal(explicar('=1 = 1', c, { mover: true }).estado, 'ERROR');
});
