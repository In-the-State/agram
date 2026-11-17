// El puente, segunda vuelta (encargo agram-equipo/encargos/encargo-puente-2.md; agram-equipo/DISENO_PUENTE_2.md;
// docs/notas/PUENTE.md §10): la vuelta libera a favor de otra persona (VG 17-11), del fondo de la serie, el libro y el
// autor del enlace; quien creó un libro lo enlaza con su génesis, además del dueño (VG 17-11); las reglas que guardan el
// puente pasan al suelo; y el punto en «this book hangs from». Ejes en memoria, identidades y claves de prueba generadas
// en cada ejecución (ejemplos/puente.mjs): nada real.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Eje } from '../src/eje.js';
import * as A from '../src/acciones.js';
import * as V from '../src/versiones.js';
import * as C from '../src/contrato.js';
import { EPOCA_0_BTML, idDeRegistro } from '../src/epocas.js';
import { crearEvento } from '../src/evento.js';
import { generarClaves, firmar } from '../src/autoridad.js';
import { evaluar, Presupuesto } from '../src/bqlm.js';
import { ContextoEje } from '../src/contexto-eje.js';
import { serializar, restaurar } from '../src/persistencia.js';
import { quemaDelCoste } from '../src/escritura.js';
import { validez } from '../src/validez.js';
import {
  PLANTILLAS_DEL_PUENTE as P, ENLACES, REGLAS_DEL_PUENTE as N, REGLA_DEL_CREADOR, SUELO_DEL_PUENTE, RETIRAR_ENLACE, FORMULAS, SENTENCIAS,
  genesisComoDecupla, bloqueosDeLaVuelta, leerTraido, registroComoDecupla, formulaDelCreador, formulaDeLoEnviado, formulaDeEnlazado, formulaDelEnvio,
} from '../datos/epocas/puente.mjs';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dosLibros, saldoDe } from '../ejemplos/puente.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
const ID0 = EPOCA_0_BTML.id;
const M0 = { ref: ID0 };
const copia = (x) => JSON.parse(JSON.stringify(x));
const reglas = (r) => (r.ok ? [] : r.motivos.map((m) => m.regla));
const firmaDe = (claves) => (ev) => firmar(ev, claves.privada);

/** Escribe a mano en `eje` pagando el coste de escribir: 'entra' o el mensaje del rechazo. */
const aMano = (eje, autor, privada, datos) => eje.escribir({ autor, ...datos, movimientos: [quemaDelCoste(autor, datos.payload, 'minuto', { eje }), ...(datos.movimientos ?? [])] }, privada).then(() => 'entra', (e) => e.message);

/**
 * Los dos libros del ejemplo con el menú de ana (5 E) traído al pequeño, y bea también en el grande con la misma clave
 * (ana la invita): así bea puede recibir allí una vuelta y enlazar, como quien lo creó, su libro pequeño.
 */
async function mundo(opciones) {
  const m = await dosLibros(opciones);
  const { grande, claves } = m;
  const menu = await m.lanza(grande, 'anchor here', { X: m.sala.id, title: 'menú', content: 'el menú del sábado' }, 'ana');
  await m.lanza(grande, 'issue E tied to X', { X: menu.id, denomination: 'plato', quantity: 5 }, 'ana');
  const menuTraido = await m.traer(m.pequeno, grande, menu);
  const inv = await grande.invitar({ autor: 'ana', invitado: 'bea', clave: claves.bea.publica, t: m.t(), privada: claves.ana.privada });
  await grande.aceptar(inv, claves.bea, { t: m.t() });
  return { ...m, menu, menuTraido, serie: 'E:ana/plato@' + menu.id, forastera: 'E:' + grande.genesisId + ':ana/plato@' + menuTraido.id };
}

/** ana envía `cuanto` a bea por `enlace` (el del dueño, por defecto) y bea lo recibe en el pequeño. */
async function enviaYRecibe(m, cuanto, enlace = m.abre) {
  const envio = await m.lanza(m.grande, P.enviar, { X: enlace.id, series: m.serie, quantity: cuanto, to: m.claves.bea.publica }, 'ana');
  const traido = await m.traer(m.pequeno, m.grande, envio);
  await m.lanza(m.pequeno, P.recibir, { X: traido.id }, 'bea');
  return envio;
}

/** bea devuelve `cuanto` de la forastera al grande, para la clave `para`; se trae por `enlace` (el «open» de ana). */
async function devuelve(m, cuanto, para = m.claves.bea.publica, enlace = m.abre) {
  const vuelta = await m.lanza(m.pequeno, P.enviar, { X: m.cuelga.id, series: m.forastera, quantity: cuanto, to: para }, 'bea');
  return m.traer(m.grande, m.pequeno, vuelta, { link: enlace.id });
}

/** Un elemento de bea en el grande y su enlace de creadora al libro `libro` (por defecto, el pequeño) con su génesis. */
async function enlaceDeCreadora(m, { libro = m.pequeno, genesis, lineas, elemento } = {}) {
  const suyo = elemento ?? (await m.lanza(m.grande, 'anchor here', { X: m.grande.alta('bea').id, title: 'lo de bea', content: 'x' }, 'bea'));
  const r = await m.intenta(m.grande, ENLACES.abrir, { X: suyo.id, book: libro.genesisId, 'line keys': lineas ?? [[1, m.claves.casaP.publica], [4, m.claves.sellador.publica]], genesis: genesis ?? genesisComoDecupla(libro.obtener(libro.genesisId)) }, 'bea');
  return { elemento: suyo, r, enlace: r.ok ? await m.grande.anadir(r.evento) : null };
}

// ---------- 1. La vuelta libera a favor de otra persona ----------

test('vuelta: ana envía 3 a bea, cruzan, bea devuelve 1 para su clave del grande y la vuelta le libera a bea lo que bloqueó ana; dos veces, no', async () => {
  const m = await mundo();
  const { grande, pequeno, serie, abre } = m;
  await enviaYRecibe(m, 3);
  assert.deepEqual(saldoDe(grande, 'ana', serie), { libre: 2, bloqueado: 3 });
  const traida = await devuelve(m, 1);
  assert.deepEqual(bloqueosDeLaVuelta(grande, traida.id), [['ana', abre.id, 1]], 'del fondo de ana por su enlace con el pequeño');
  assert.ok(A.acciones(grande, traida.id, 4, 'bea').some((a) => a.nombre === P.recibir), 'se le ofrece a bea, a quien va');
  const recibo = await m.lanza(grande, P.recibir, { X: traida.id }, 'bea');
  assert.deepEqual(recibo.payload[1], [[traida.id], [['ana', abre.id, 1]]], '1.0 el envío; 1.1 de qué bloqueos saca');
  const E = recibo.movimientos.filter((x) => x.token === 'E').map((x) => [x.de, x.a, x.estado ?? 'transferencia', x.salida, x.cantidad]);
  assert.deepEqual(E, [['ana', 'bea', 'transferencia', abre.id, 1], ['bea', 'bea', 'liberacion', abre.id, 1]], 'desde quien bloqueó hacia quien recibe, y su liberación');
  assert.deepEqual(saldoDe(grande, 'ana', serie), { libre: 2, bloqueado: 2 });
  assert.deepEqual(saldoDe(grande, 'bea', serie), { libre: 1, bloqueado: 0 });
  assert.deepEqual(saldoDe(pequeno, 'bea', m.forastera), { libre: 2, bloqueado: 1 }, 'en el pequeño, lo devuelto queda bloqueado');
  // Lo mismo dice la capa de acreditación (src/validez.js repite la excepción del suelo).
  const v = await validez(grande, recibo.id);
  assert.equal(v.acreditacion.estado, 'ok', v.acreditacion.resumen);
  assert.deepEqual(reglas(await m.intenta(grande, P.recibir, { X: traida.id, locks: [['ana', abre.id, 1]] }, 'bea')), [N.recibir, N.loEnviado], 'dos veces, no (ya entera: lo que libera pasa de lo que vuelve)');
});

test('vuelta: la de algo que no se envió no entra; una transferencia desde otro fuera de un «receive», o con la salida en algo que no es un enlace, tampoco (el suelo sigue en pie)', async () => {
  const m = await mundo();
  const { grande, pequeno, claves, abre, menu } = m;
  await enviaYRecibe(m, 3);
  const mov = (extra) => ({ token: 'E', emisor: 'ana', denominacion: 'plato', registro: menu.id, cantidad: 1, ...extra });
  const tr = (salida) => [mov({ de: 'ana', a: 'bea', salida }), mov({ de: 'bea', a: 'bea', estado: 'liberacion', salida })];
  // Fuera de un «receive»: una nota de bea que saca de lo bloqueado por ana.
  const fuera = await aMano(grande, 'bea', claves.bea.privada, { sobre: grande.alta('bea').id, t: m.t(), payload: [['me lo llevo']], movimientos: tr(abre.id) });
  assert.match(fuera, /nobody moves tokens of others/);
  assert.match(fuera, new RegExp(N.soloLaVuelta));
  // Un «receive» sobre algo que no es un envío traído: una nota del pequeño, traída.
  const nota = await m.lanza(pequeno, 'anchor here', { X: pequeno.genesisId, title: 'nota', content: 'no es un envío' }, 'bea');
  const notaTraida = await m.traer(grande, pequeno, nota);
  const payload = (sobre) => ['receive', [[sobre], [['ana', abre.id, 1]]], ['all announced movements happened'], ['bea'], [P.recibir]];
  const noEnvio = await aMano(grande, 'bea', claves.bea.privada, { sobre: notaTraida.id, en: '4000000000', t: m.t(), payload: payload(notaTraida.id), movimientos: tr(abre.id) });
  assert.match(noEnvio, new RegExp(N.recibir), 'la vuelta de algo que no se envió');
  // Un «receive» de una vuelta de verdad, pero con la salida en algo que no es un enlace (lo que ana bloqueó con el menú).
  await aMano(grande, 'ana', claves.ana.privada, { sobre: menu.id, en: '4000000000', t: m.t(), payload: [['lo guardo para el menú']], movimientos: [mov({ de: 'ana', a: 'ana', estado: 'bloqueo', salida: menu.id })] });
  assert.equal(grande.bloqueado('ana', m.serie, menu.id), 1);
  const traida = await devuelve(m, 1);
  const conSalidaMala = await aMano(grande, 'bea', claves.bea.privada, { sobre: traida.id, en: '4000000000', t: m.t(), payload: payload(traida.id), movimientos: tr(menu.id) });
  assert.match(conSalidaMala, /nobody moves tokens of others/, 'la salida no es un enlace: no es la excepción del suelo');
  assert.deepEqual(saldoDe(grande, 'ana', m.serie), { libre: 1, bloqueado: 4 });
  assert.equal(grande.saldo('bea', m.serie), 0);
});

test('vuelta: una mayor que el fondo de su enlace no entra, y no saca del fondo de otro autor de enlace, de otra serie ni de otro libro', async () => {
  const m = await mundo();
  const { grande, pequeno, claves, abre, sala, menu, serie } = m;
  await enviaYRecibe(m, 3);
  await m.lanza(grande, P.recibir, { X: (await devuelve(m, 1)).id }, 'bea'); // bea tiene 1 de la serie en el grande
  // Otros fondos: bea la manda al pequeño por su enlace de creadora (otro autor); ana manda 1 de otra serie por su enlace;
  // ana manda 1 de la serie a un tercer libro (otro libro).
  const { enlace: deBea } = await enlaceDeCreadora(m);
  await m.lanza(grande, P.enviar, { X: deBea.id, series: serie, quantity: 1, to: claves.bea.publica }, 'bea');
  const postre = await m.lanza(grande, 'anchor here', { X: sala.id, title: 'postre', content: 'x' }, 'ana');
  await m.lanza(grande, 'issue E tied to X', { X: postre.id, denomination: 'postre', quantity: 2 }, 'ana');
  await m.lanza(grande, P.enviar, { X: abre.id, series: 'E:ana/postre@' + postre.id, quantity: 1, to: claves.bea.publica }, 'ana');
  const tercero = await Eje.genesis({ identidad: 'ana', foco: ['un tercer libro'], t: m.t(), clave: claves.ana.publica, privada: claves.ana.privada });
  const alTercero = await m.lanza(grande, ENLACES.abrir, { X: sala.id, book: tercero.genesisId, 'line keys': [[1, claves.casaG.publica]] }, 'ana');
  await m.lanza(grande, P.enviar, { X: alTercero.id, series: serie, quantity: 1, to: claves.ana.publica }, 'ana');
  assert.equal(grande.bloqueado('ana', serie, abre.id), 2, 'el fondo de la serie, el pequeño y ana: 2');
  // Un pequeño que hiciera trampa: una vuelta de 3 que nunca escribió, sellada por su línea (las claves del ejemplo).
  const deVerdad = await m.intenta(pequeno, P.enviar, { X: m.cuelga.id, series: m.forastera, quantity: 1, to: claves.bea.publica }, 'bea');
  const payload = copia(deVerdad.evento.payload);
  payload[1][2] = [3];
  const falsa = await crearEvento({ autor: 'bea', sobre: m.cuelga.id, en: '4000000000', t: m.t(), movimientos: deVerdad.evento.movimientos, payload });
  const traida = await m.traer(grande, pequeno, falsa);
  assert.deepEqual(bloqueosDeLaVuelta(grande, traida.id), [['ana', abre.id, 2]], 'la ayuda da la parte que el fondo cubre: 2 (RP9: el resto, cuando haya)');
  const plantilla = await m.intenta(grande, P.recibir, { X: traida.id, locks: [['ana', abre.id, 2]] }, 'bea');
  assert.deepEqual(reglas(plantilla), [], 'libera 2 de las 3 que dice: una parte, entra (RP9; no se añade)');
  const mov = (extra) => ({ token: 'E', emisor: 'ana', denominacion: 'plato', registro: menu.id, ...extra });
  const de = (quien, salida, cantidad, otra = {}) => [mov({ de: quien, a: 'bea', salida, cantidad, ...otra }), mov({ de: 'bea', a: 'bea', estado: 'liberacion', salida, cantidad, ...otra })].filter((x) => x.de !== x.a || x.estado);
  const recibe = (movimientos) => aMano(grande, 'bea', claves.bea.privada, { sobre: traida.id, en: '4000000000', t: m.t(), payload: plantilla.evento.payload, movimientos });
  const casos = {
    'todo del fondo, más de lo que tiene': de('ana', abre.id, 3),
    'del fondo de otro autor (el enlace de bea)': [...de('ana', abre.id, 2), mov({ de: 'bea', a: 'bea', estado: 'liberacion', salida: deBea.id, cantidad: 1 })],
    'del fondo de otro libro': [...de('ana', abre.id, 2), ...de('ana', alTercero.id, 1)],
    'del fondo de otra serie': [...de('ana', abre.id, 2), ...de('ana', abre.id, 1, { denominacion: 'postre', registro: postre.id })],
    'transfiere más de lo que libera': [mov({ de: 'ana', a: 'bea', salida: abre.id, cantidad: 2 }), mov({ de: 'bea', a: 'bea', estado: 'liberacion', salida: abre.id, cantidad: 1 })],
  };
  for (const [que, movs] of Object.entries(casos)) assert.notEqual(await recibe(movs), 'entra', que);
  assert.match(await recibe(casos['del fondo de otro autor (el enlace de bea)']), new RegExp(N.loEnviado));
  assert.match(await recibe(casos['del fondo de otro libro']), new RegExp(N.loEnviado));
  assert.match(await recibe(casos['del fondo de otra serie']), new RegExp(N.loEnviado));
  assert.deepEqual([grande.bloqueado('ana', serie, abre.id), grande.bloqueado('bea', serie, deBea.id), grande.bloqueado('ana', serie, alTercero.id), grande.bloqueado('ana', 'E:ana/postre@' + postre.id, abre.id)], [2, 1, 1, 1], 'nada salió de ningún fondo');
});

test('vuelta: un enlace que su autor retira deja parado lo que se mandó por él; al reponerlo (otro enlace suyo) la vuelta se trae por el nuevo y libera lo de antes', async () => {
  const m = await mundo();
  const { grande, pequeno, claves, abre, sala, serie } = m;
  await enviaYRecibe(m, 3);
  await m.lanza(grande, RETIRAR_ENLACE, { X: abre.id }, 'ana');
  const vuelta = await m.lanza(pequeno, P.enviar, { X: m.cuelga.id, series: m.forastera, quantity: 1, to: claves.ana.publica }, 'bea');
  assert.ok(reglas(await m.traerCon(grande, pequeno, vuelta, { proof: await m.sellar(pequeno, vuelta.id) })).includes(N.enlazado), 'por el retirado no se trae');
  assert.ok(reglas(await m.intenta(grande, P.enviar, { X: abre.id, series: serie, quantity: 1, to: claves.bea.publica }, 'ana')).includes(N.envio), 'ni se envía');
  const nuevo = await m.lanza(grande, ENLACES.abrir, { X: sala.id, book: pequeno.genesisId, 'line keys': [[1, claves.casaP.publica], [4, claves.sellador.publica]] }, 'ana');
  const traida = await m.traer(grande, pequeno, vuelta, { link: nuevo.id });
  assert.deepEqual(bloqueosDeLaVuelta(grande, traida.id), [['ana', abre.id, 1]], 'el fondo es del autor: también lo bloqueado por el retirado');
  await m.lanza(grande, P.recibir, { X: traida.id }, 'ana');
  assert.deepEqual(saldoDe(grande, 'ana', serie), { libre: 3, bloqueado: 2 });
});

test('vuelta (RP1): si ana retira su enlace y vuelve a enlazar con OTRAS claves, una vuelta traída por el nuevo no saca lo mandado por el viejo; con las mismas, sí', async () => {
  const m = await mundo();
  const { grande, pequeno, claves, abre, sala, serie } = m;
  await enviaYRecibe(m, 3);
  await m.lanza(grande, RETIRAR_ENLACE, { X: abre.id }, 'ana');
  const nueva = await generarClaves();
  const otras = await m.lanza(grande, ENLACES.abrir, { X: sala.id, book: pequeno.genesisId, 'line keys': [[1, nueva.publica], [4, claves.sellador.publica]] }, 'ana');
  // Una vuelta de verdad sellada con la casa nueva del pequeño (como si el pequeño hubiera cambiado de claves).
  const vuelta = await m.lanza(pequeno, P.enviar, { X: m.cuelga.id, series: m.forastera, quantity: 1, to: claves.ana.publica }, 'bea');
  const traida = await m.traer(grande, pequeno, vuelta, { link: otras.id, proof: await m.sellar(pequeno, vuelta.id, { nivel1: nueva }) });
  assert.equal(bloqueosDeLaVuelta(grande, traida.id), null, 'el fondo de las claves nuevas está vacío');
  assert.deepEqual(reglas(await m.intenta(grande, P.recibir, { X: traida.id, locks: [['ana', abre.id, 1]] }, 'ana')), [N.loEnviado], 'lo mandado con las claves viejas no sale con una vuelta sellada por las nuevas');
  // Vuelve a enlazar con las de siempre (en el mismo elemento: retira el de las otras) y la misma vuelta, sellada por ellas, sí.
  const iguales = await m.lanza(grande, ENLACES.abrir, { X: sala.id, book: pequeno.genesisId, 'line keys': [[1, claves.casaP.publica], [4, claves.sellador.publica]] }, 'ana');
  const otra = await m.lanza(pequeno, P.enviar, { X: m.cuelga.id, series: m.forastera, quantity: 1, to: claves.ana.publica }, 'bea');
  const buena = await m.traer(grande, pequeno, otra, { link: iguales.id });
  assert.deepEqual(bloqueosDeLaVuelta(grande, buena.id), [['ana', abre.id, 1]]);
  await m.lanza(grande, P.recibir, { X: buena.id }, 'ana');
  assert.deepEqual(saldoDe(grande, 'ana', serie), { libre: 3, bloqueado: 2 });
});

// ---------- 2. Quien creó un libro lo enlaza con su génesis ----------

test('creador: bea enlaza en el grande, sobre un elemento suyo y con su génesis, el pequeño que creó, y trae de él; lo traído dice por qué enlace y su grado', async () => {
  const m = await mundo();
  const { grande, pequeno, claves } = m;
  const { enlace, elemento, r } = await enlaceDeCreadora(m);
  assert.equal(r.ok, true, JSON.stringify(r.motivos));
  assert.equal(enlace.payload[5].length, 7, 'su 5: las siete piezas del génesis');
  assert.ok(A.acciones(grande, enlace.id, 6, 'bea').some((a) => a.nombre === P.traer), 'traer se ofrece sobre él');
  const nota = await m.lanza(pequeno, 'anchor here', { X: pequeno.genesisId, title: 'nota', content: 'una nota del pequeño' }, 'bea');
  const traida = await m.traer(grande, pequeno, nota, { link: enlace.id });
  const t = leerTraido(grande, traida.id);
  assert.deepEqual([t.enlace, t.quien, t.grado, t.cuenta, t.delDueno], [enlace.id, 'bea', 'de quien creó el libro, avalado por el dueño', true, m.abre.id], 'ana tiene un enlace al pequeño con las mismas claves');
  assert.deepEqual(C.librosPrivados(grande, elemento.id, { puente: true }).map((l) => [l.id, l.grado, l.cuenta]), [[enlace.id, 'de quien creó el libro, avalado por el dueño', true]]);
  assert.deepEqual(Object.keys(C.librosPrivados(grande, elemento.id)[0]).sort(), ['claves', 'direccion', 'id', 'libro', 'quien', 't'], 'sin { puente: true }, lo de siempre');
  assert.equal(leerTraido(m.pequeno, m.menuTraido.id).grado, 'del dueño');
  assert.equal(leerTraido(m.pequeno, m.menuTraido.id).nivelMasBajo, 1, 'RP7: la lectura dice dónde empieza la prueba: la casa del libro, nivel 1');
  // Un libro de bea que ana no enlaza: «de quien creó el libro», sin aval.
  const otro = await Eje.genesis({ identidad: 'bea', foco: ['otro libro de bea'], t: m.t(), clave: claves.bea.publica, privada: claves.bea.privada });
  const solo = await enlaceDeCreadora(m, { libro: otro, elemento });
  assert.equal(solo.r.ok, true, JSON.stringify(solo.r.motivos));
  assert.deepEqual(C.gradoDelEnlace(grande, solo.enlace.id), { enlace: solo.enlace.id, quien: 'bea', grado: 'de quien creó el libro', cuenta: true, delDueno: null });
  // Un anuncio de otra persona sin génesis no cuenta (como en LIBRO_PRIVADO: se escribe, pero no es del puente).
  const anuncio = await m.lanza(grande, ENLACES.abrir, { X: elemento.id, book: 'cd'.repeat(32), 'line keys': [[1, claves.casaP.publica]] }, 'bea');
  assert.deepEqual([C.gradoDelEnlace(grande, anuncio.id).grado, C.gradoDelEnlace(grande, anuncio.id).cuenta], [null, false]);
});

test('creador: con un enlace del dueño al mismo libro con otras claves, el de bea no cuenta (por lectura: la regla no recorre el libro) y la lectura da el del dueño', async () => {
  const m = await mundo();
  const { grande, pequeno, claves, sala } = m;
  const { enlace, elemento } = await enlaceDeCreadora(m);
  const nueva = await generarClaves();
  const delDueno = await m.lanza(grande, ENLACES.abrir, { X: sala.id, book: pequeno.genesisId, 'line keys': [[1, nueva.publica], [4, claves.sellador.publica]] }, 'ana');
  assert.deepEqual(C.gradoDelEnlace(grande, enlace.id), { enlace: enlace.id, quien: 'bea', grado: 'de quien creó el libro', cuenta: false, delDueno: delDueno.id });
  assert.deepEqual(C.librosPrivados(grande, elemento.id, { puente: true }).map((l) => [l.cuenta, l.delDueno]), [[false, delDueno.id]]);
  // Límite sabido: la regla sigue dejando traer por él (mirar el enlace del dueño pediría recorrer el libro).
  const nota = await m.lanza(pequeno, 'anchor here', { X: pequeno.genesisId, title: 'nota', content: 'x' }, 'bea');
  const traida = await m.traer(grande, pequeno, nota, { link: enlace.id });
  assert.deepEqual([leerTraido(grande, traida.id).cuenta, leerTraido(grande, traida.id).delDueno], [false, delDueno.id], 'pero lo traído lo dice');
});

test('creador: suplantar no enlaza: el génesis ajeno con la clave propia, la firma de otro génesis, una pieza cambiada, la clave de otro, un enlace anterior al génesis, sobre un elemento ajeno', async () => {
  const m = await mundo();
  const { grande, pequeno, claves, sala } = m;
  const carla = await generarClaves();
  const inv = await grande.invitar({ autor: 'ana', invitado: 'carla', clave: carla.publica, t: m.t(), privada: claves.ana.privada });
  await grande.aceptar(inv, carla, { t: m.t() });
  const deCarla = (await A.transaccion(grande, 'anchor here', { X: grande.alta('carla').id, title: 'lo de carla', content: 'x' }, 'carla', { t: m.t(), firmar: firmaDe(carla) })).evento;
  await grande.anadir(deCarla);
  const g = genesisComoDecupla(pequeno.obtener(pequeno.genesisId));
  const otro = await Eje.genesis({ identidad: 'bea', foco: ['otro'], t: m.t(), clave: claves.bea.publica, privada: claves.bea.privada });
  const conCarla = (genesis) => A.transaccion(grande, ENLACES.abrir, { X: deCarla.id, book: pequeno.genesisId, 'line keys': [[1, claves.casaP.publica]], genesis }, 'carla', { t: m.t(), firmar: firmaDe(carla) });
  const conClave = copia(g);
  conClave[4] = [carla.publica];
  assert.deepEqual(reglas(await conCarla(conClave)), [REGLA_DEL_CREADOR], 'el génesis ajeno con la clave propia');
  assert.deepEqual(reglas(await conCarla(g)), [REGLA_DEL_CREADOR], 'el génesis bueno, con una clave que no es de su alta');
  const conFirma = copia(g);
  conFirma[5] = [otro.obtener(otro.genesisId).firma];
  assert.deepEqual(reglas((await enlaceDeCreadora(m, { genesis: conFirma })).r), [REGLA_DEL_CREADOR], 'la firma de otro génesis (de la misma clave)');
  for (const [k, v] of [[1, '2026-11-17T09:00:01Z'], [2, '["otro foco"]'], [3, 'ab'.repeat(32)], [6, 2]]) {
    const cambiado = copia(g);
    cambiado[k] = [v];
    assert.deepEqual(reglas((await enlaceDeCreadora(m, { genesis: cambiado })).r), [REGLA_DEL_CREADOR], 'una pieza cambiada: ' + k);
  }
  const demo = copia(g);
  demo.push([1]);
  assert.deepEqual(reglas((await enlaceDeCreadora(m, { genesis: demo })).r), [REGLA_DEL_CREADOR], 'diciendo demostración sin serlo');
  // Sobre un elemento ajeno (la sala de ana), con el génesis bueno: no entra.
  assert.deepEqual(reglas((await enlaceDeCreadora(m, { elemento: sala })).r), [REGLA_DEL_CREADOR], 'sobre un elemento que no es suyo');
  // Un génesis posterior al enlace (fechado un día después).
  const futuro = await Eje.genesis({ identidad: 'bea', foco: ['del futuro'], t: '2026-11-18T09:00:00Z', clave: claves.bea.publica, privada: claves.bea.privada });
  assert.deepEqual(reglas((await enlaceDeCreadora(m, { libro: futuro })).r), [REGLA_DEL_CREADOR], 'el enlace es anterior al génesis');
  // Un alta no declara una clave sin su prueba de posesión: mallory no entra con la clave de bea (su alta la firma con otra).
  const mallory = await generarClaves();
  const invM = await grande.invitar({ autor: 'ana', invitado: 'mallory', clave: claves.bea.publica, t: m.t(), privada: claves.ana.privada });
  await assert.rejects(grande.aceptar(invM, { publica: claves.bea.publica, privada: mallory.privada }, { t: m.t() }), /firma/);
  assert.equal(grande.alta('mallory'), null);
  // Lo que no cabe: un génesis con campos propios en su contexto, o de demostración sin clave.
  const conPropio = await Eje.genesis({ identidad: 'bea', foco: ['x'], t: m.t(), contexto: { nombre: 'propio' }, clave: claves.bea.publica, privada: claves.bea.privada });
  assert.equal(genesisComoDecupla(conPropio.obtener(conPropio.genesisId)), null);
  const demoSinClave = await Eje.genesis({ identidad: 'bea', foco: ['x'], t: m.t(), demostracion: true });
  assert.equal(genesisComoDecupla(demoSinClave.obtener(demoSinClave.genesisId)), null);
  assert.equal(C.librosPrivados(grande, deCarla.id).length, 0, 'nada de lo rechazado quedó escrito');
});

/**
 * `eje` con un registro más, `r`, que nunca pasó por sus reglas (un enlace escrito por un camino en que la regla del
 * creador no rigiera): para mirar las fórmulas de traer y enviar sobre él. Solo lectura: el eje no cambia.
 */
const conIntruso = (eje, r) => new Proxy(eje, {
  get(t, k) {
    if (k === 'obtener') return (id) => (id === r.id ? r : t.obtener(id));
    if (k === 'sobre') return (id, en) => [...t.sobre(id, en), ...(r.sobre === id && (en === undefined || en === r.en) ? [r] : [])];
    const v = t[k];
    return typeof v === 'function' ? v.bind(t) : v;
  },
});

test('creador: un enlace con el sitio del génesis relleno de algo que no prueba nada no entra, y si estuviera (escrito sin la regla) no sirve para traer, enviar ni recibir la vuelta: la prueba se vuelve a mirar al usarlo', async () => {
  const m = await mundo();
  const { grande, pequeno, claves, serie } = m;
  const suyo = await m.lanza(grande, 'anchor here', { X: grande.alta('bea').id, title: 'lo de bea', content: 'x' }, 'bea');
  const basura = genesisComoDecupla(pequeno.obtener(pequeno.genesisId));
  basura[5] = ['00'.repeat(64)];
  const r = await m.intenta(grande, ENLACES.abrir, { X: suyo.id, book: pequeno.genesisId, 'line keys': [[1, claves.casaP.publica], [4, claves.sellador.publica]], genesis: basura }, 'bea');
  assert.deepEqual(reglas(r), [REGLA_DEL_CREADOR], 'al escribirlo, la regla del creador lo para');
  // El mismo registro, como si hubiera entrado sin la regla (el libro de un camino en que no rigiera).
  const ojo = conIntruso(grande, r.evento);
  const bueno = await m.intenta(grande, ENLACES.abrir, { X: suyo.id, book: pequeno.genesisId, 'line keys': [[1, claves.casaP.publica], [4, claves.sellador.publica]], genesis: genesisComoDecupla(pequeno.obtener(pequeno.genesisId)) }, 'bea');
  const ojoBueno = conIntruso(grande, bueno.evento);
  const nota = await m.lanza(pequeno, 'anchor here', { X: pequeno.genesisId, title: 'nota', content: 'x' }, 'bea');
  const proof = await m.sellar(pequeno, nota.id);
  const traer = (L) => ({ autor: 'ana', sobre: grande.genesisId, en: '9800000000', t: m.t(), movimientos: [], payload: ['traer', [[pequeno.genesisId], registroComoDecupla(nota), proof, [L.id]], ['x'], ['ana'], [P.traer]] });
  const enviar = (L) => ({ autor: 'ana', sobre: L.id, en: '4000000000', t: m.t(), movimientos: [{ token: 'E', emisor: 'ana', denominacion: 'plato', registro: m.menu.id, cantidad: 1, de: 'ana', a: 'ana', estado: 'bloqueo', salida: L.id }], payload: ['enviar', [[pequeno.genesisId], [[serie], ['ana'], ['plato'], [m.menu.id]], [1], [claves.bea.publica]], ['x'], ['ana'], [P.enviar]] });
  const vale = (eje, f, ev) => { const x = evaluar(f(), new ContextoEje(eje, { ev, epoch: eje.epoca() })); return [x.estado, x.valor?.[0]]; };
  assert.deepEqual(vale(ojoBueno, formulaDeEnlazado, traer(bueno.evento)), ['RESUELTO', true], 'control: por el bueno se trae');
  assert.deepEqual(vale(ojoBueno, formulaDelEnvio, enviar(bueno.evento)), ['RESUELTO', true], 'control: por el bueno se envía');
  assert.deepEqual(vale(ojo, formulaDeEnlazado, traer(r.evento)), ['RESUELTO', false], 'por el de basura no se trae (ni la vuelta: solo se recibe lo traído)');
  assert.deepEqual(vale(ojo, formulaDelEnvio, enviar(r.evento)), ['RESUELTO', false], 'por el de basura no se envía');
  // Ni se le da por bueno con otras basuras: la clave de otro, el instante, el libro.
  for (const [k, v] of [[4, claves.ana.publica], [1, '2027-01-01T00:00:00Z'], [3, 'ab'.repeat(32)]]) {
    const otra = copia(r.evento);
    otra.payload[5] = copia(genesisComoDecupla(pequeno.obtener(pequeno.genesisId)));
    otra.payload[5][k] = [v];
    otra.id = 'f' + otra.id.slice(1);
    assert.deepEqual(vale(conIntruso(grande, otra), formulaDeEnlazado, traer(otra)), ['RESUELTO', false], 'pieza ' + k);
  }
});

test('creador: enviar por un enlace retirado o por uno que no cuenta (el anuncio de otra persona, sin génesis) no entra', async () => {
  const m = await mundo();
  const { grande, claves, serie, abre } = m;
  const suyo = await m.lanza(grande, 'anchor here', { X: grande.alta('bea').id, title: 'lo de bea', content: 'x' }, 'bea');
  const anuncio = await m.lanza(grande, ENLACES.abrir, { X: suyo.id, book: m.pequeno.genesisId, 'line keys': [[1, claves.casaP.publica], [4, claves.sellador.publica]] }, 'bea');
  assert.ok(reglas(await m.intenta(grande, P.enviar, { X: anuncio.id, series: serie, quantity: 1, to: claves.bea.publica }, 'ana')).includes(N.envio), 'por el anuncio de bea, no');
  await m.lanza(grande, RETIRAR_ENLACE, { X: abre.id }, 'ana');
  assert.ok(reglas(await m.intenta(grande, P.enviar, { X: abre.id, series: serie, quantity: 1, to: claves.bea.publica }, 'ana')).includes(N.envio), 'por el retirado, no');
  // Por el de la creadora, sí (cuenta: su génesis vale).
  const { enlace } = await enlaceDeCreadora(m, { elemento: suyo });
  assert.deepEqual(reglas(await m.intenta(grande, P.enviar, { X: enlace.id, series: serie, quantity: 1, to: claves.bea.publica }, 'ana')), []);
});

// ---------- 3. Las reglas del puente, en el suelo ----------

test('suelo: las reglas y plantillas del puente están en 7.9.6; un cambio ordinario o de gobierno que las sustituye o las quita del suelo se rechaza; ninguna alcanza una declaración', async () => {
  const suelo = V.sueloDe(EPOCA_0_BTML);
  for (const n of SUELO_DEL_PUENTE) assert.ok(suelo.includes(n), n);
  const raiz = (titulo, propias) => Array.from({ length: Math.max(7, ...Object.keys(propias).map(Number)) + 1 }, (_, i) => (i === 0 ? [titulo] : propias[i] ?? (i === 6 ? [['revisión'], ['hereda'], [ID0]] : M0)));
  const regla0 = (n) => EPOCA_0_BTML.reglasConId.find((x) => x.regla[0][0] === n).regla;
  for (const n of SUELO_DEL_PUENTE.filter((x) => EPOCA_0_BTML.reglasConId.some((r) => r.regla[0][0] === x))) {
    const otra = copia(regla0(n));
    otra[2] = ['=true'];
    otra[6] = ['revisión: la misma regla, que ya no mira nada'];
    for (const clase of ['ordinary', 'governance']) {
      const r = V.comprobarCambio(EPOCA_0_BTML, { raiz: raiz('sin ' + n, { 2: [{ ref: idDeRegistro(otra) }] }), registros: [otra] }, clase);
      assert.ok(r.motivos.some((x) => x.includes('sustituye «' + n + '», que es del suelo')), n + ' (' + clase + '): ' + r.motivos.join('; '));
    }
  }
  for (const n of SUELO_DEL_PUENTE.filter((x) => EPOCA_0_BTML.transacciones.some((t) => t.plantilla[0][0] === x))) {
    const p = copia(EPOCA_0_BTML.transacciones.find((t) => t.plantilla[0][0] === n).plantilla);
    p[2] = ['=false'];
    for (const clase of ['ordinary', 'governance']) {
      const r = V.comprobarCambio(EPOCA_0_BTML, { raiz: raiz('sin ' + n, { 9: [M0, M0, M0, M0, M0, M0, [M0, [{ ref: idDeRegistro(p) }]]] }), registros: [p] }, clase);
      assert.ok(r.motivos.some((x) => x.includes('sustituye «' + n + '», que es del suelo')), n + ' (' + clase + '): ' + r.motivos.join('; '));
    }
  }
  const lista = EPOCA_0_BTML.registro[7][9][6].filter((x) => !SUELO_DEL_PUENTE.includes(x));
  const fila = [M0, M0, M0, M0, M0, M0, M0, M0, M0, [M0, M0, M0, M0, M0, M0, lista]];
  for (const clase of ['ordinary', 'governance']) {
    const r = V.comprobarCambio(EPOCA_0_BTML, { raiz: raiz('fuera del suelo', { 7: fila }), registros: [] }, clase);
    assert.ok(r.motivos.some((x) => x.includes('quita del suelo (epoch.7.9.6) «a record is brought from a linked book»')), clase + ': ' + r.motivos.join('; '));
  }
  // Una declaración nombra solo «declare a balance»: cada regla del puente que sube al suelo la deja pasar (lo prueba el
  // ejemplo: bea declara su saldo y ana lo trae; aquí, que ninguna fórmula mira una declaración salvo para no mirarla).
  const m = await mundo();
  const declara = await m.intenta(m.grande, P.declarar, { X: m.grande.alta('ana').id, series: m.serie }, 'ana');
  assert.equal(declara.ok, true, JSON.stringify(declara.motivos));
  const ctx = new ContextoEje(m.grande, { ev: declara.evento, epoch: m.grande.epoca() });
  for (const n of SUELO_DEL_PUENTE.filter((x) => EPOCA_0_BTML.reglasConId.some((r) => r.regla[0][0] === x))) {
    const f = regla0(n)[2].at(-1);
    assert.deepEqual([evaluar(f, ctx).estado, evaluar(f, ctx).valor?.[0]], ['RESUELTO', true], 'una declaración pasa ' + n);
  }
});

// ---------- 5. El punto en «this book hangs from» ----------

test('punto: «this book hangs from» lleva el punto del libro de arriba (opcional) y contrato.cuelgaDe lo da', async () => {
  const m = await dosLibros();
  assert.equal(C.cuelgaDe(m.pequeno).punto, undefined, 'sin él, no se dice');
  const punto = 'ef'.repeat(32);
  const otro = await m.lanza(m.pequeno, ENLACES.cuelga, { X: m.pequeno.genesisId, book: m.grande.genesisId, element: m.sala.id, 'line keys': [[1, m.claves.casaG.publica], [4, m.claves.sellador.publica]], point: punto }, 'bea');
  assert.deepEqual(otro.payload[5], [punto]);
  assert.deepEqual(C.cuelgaDe(m.pequeno), { libro: m.grande.genesisId, elemento: m.sala.id, id: otro.id, t: otro.t, punto });
  assert.equal((await m.intenta(m.pequeno, ENLACES.cuelga, { X: m.pequeno.genesisId, book: m.grande.genesisId, element: m.sala.id, point: 'no es un id' }, 'bea')).ok, false);
});

// ---------- restaurar, reordenar, las fórmulas y el coste ----------

test('restaurar y reordenar dan los mismos veredictos: la vuelta a otra persona y el enlace de quien creó el libro', async () => {
  const m = await mundo();
  await enviaYRecibe(m, 3);
  await m.lanza(m.grande, P.recibir, { X: (await devuelve(m, 1)).id }, 'bea');
  const { enlace } = await enlaceDeCreadora(m);
  const nota = await m.lanza(m.pequeno, 'anchor here', { X: m.pequeno.genesisId, title: 'nota', content: 'x' }, 'bea');
  await m.traer(m.grande, m.pequeno, nota, { link: enlace.id });
  const huella = (eje) => [eje.orden.length, saldoDe(eje, 'ana', m.serie), saldoDe(eje, 'bea', m.serie), C.gradoDelEnlace(eje, enlace.id)];
  const esperada = huella(m.grande);
  assert.deepEqual(huella(await restaurar(serializar(m.grande))), esperada, 'restaurado');
  const otro = await Eje.desde(m.grande.orden.map((id) => m.grande.obtener(id)));
  const { rechazados } = await otro.reordenar([...m.grande.orden]);
  assert.deepEqual(rechazados, []);
  assert.deepEqual(huella(otro), esperada, 'reordenado');
});

test('las fórmulas de puente.mjs están en sus reglas y las sentencias de recibir en su plantilla (node datos/epocas/puente.mjs --escribir)', () => {
  for (const [archivo, f] of Object.entries(FORMULAS)) assert.equal(JSON.parse(readFileSync(join(AQUI, '..', 'datos', 'epocas', 'reglas', archivo), 'utf8'))[2].at(-1), f(), archivo);
  for (const [archivo, f] of Object.entries(SENTENCIAS)) assert.deepEqual(JSON.parse(readFileSync(join(AQUI, '..', 'datos', 'epocas', 'plantillas', archivo), 'utf8'))[4], f(), archivo);
  const nombres = EPOCA_0_BTML.condiciones.map((r) => r[0][0]);
  assert.equal(nombres.indexOf(REGLA_DEL_CREADOR), nombres.indexOf('a declared balance is only that') + 1, 'detrás de «a declared balance is only that»');
});

test('coste: la vuelta a otra persona, la regla del creador y traer y enviar por el enlace de quien creó el libro (pasos, ocupantes, bytes y milisegundos)', async () => {
  const m = await mundo();
  await enviaYRecibe(m, 3);
  const traida = await devuelve(m, 1);
  const recibo = await m.intenta(m.grande, P.recibir, { X: traida.id }, 'bea');
  const { r: enlace, enlace: e } = await enlaceDeCreadora(m);
  const nota = await m.lanza(m.pequeno, 'anchor here', { X: m.pequeno.genesisId, title: 'nota', content: 'x' }, 'bea');
  const trae = await m.traerCon(m.grande, m.pequeno, nota, { link: e.id, proof: await m.sellar(m.pequeno, nota.id) });
  const envia = await m.intenta(m.grande, P.enviar, { X: e.id, series: m.serie, quantity: 1, to: m.claves.bea.publica }, 'ana');
  // Una vuelta de diez bloqueos (el tope de la plantilla): ana manda 1 por cada uno de diez enlaces suyos con las mismas claves.
  await m.lanza(m.grande, 'issue E tied to X', { X: m.menu.id, denomination: 'plato', quantity: 10 }, 'ana');
  const diez = [m.abre];
  for (let k = 1; k < 11; k++) {
    const sala = await m.lanza(m.grande, 'anchor here', { X: m.grande.genesisId, title: 'sala ' + k, content: 'x' }, 'ana');
    diez.push(await m.lanza(m.grande, ENLACES.abrir, { X: sala.id, book: m.pequeno.genesisId, 'line keys': [[1, m.claves.casaP.publica], [4, m.claves.sellador.publica]] }, 'ana'));
  }
  for (const L of diez.slice(1)) await enviaYRecibe(m, 1, L);
  await enviaYRecibe(m, 1);
  const traidaDiez = await devuelve(m, 13);
  const reciboDiez = await m.intenta(m.grande, P.recibir, { X: traidaDiez.id }, 'bea');
  assert.equal(reciboDiez.evento.payload[1][1].length, 5, 'cinco ternas: el tope por registro (RP8 y RP9)');
  const casos = [
    ['what is received is what was sent (la vuelta, un bloqueo)', formulaDeLoEnviado, recibo],
    ['what is received is what was sent (la vuelta, cinco bloqueos: el tope por registro)', formulaDeLoEnviado, reciboDiez],
    [REGLA_DEL_CREADOR, formulaDelCreador, enlace],
    ['a record is brought from a linked book (enlace de la creadora)', formulaDeEnlazado, trae],
    ['a send locks what it names (enlace de la creadora)', formulaDelEnvio, envia],
  ];
  const filas = [];
  for (const [que, f, r] of casos) {
    assert.equal(r.ok, true, que + ': ' + JSON.stringify(r.motivos));
    const ctx = () => new ContextoEje(m.grande, { ev: r.evento, epoch: m.grande.epoca() });
    const presupuesto = new Presupuesto();
    const x = evaluar(f(), ctx(), { presupuesto });
    assert.deepEqual([x.estado, x.valor?.[0]], ['RESUELTO', true], que);
    let [lo, hi] = [1, 100000];
    while (lo < hi) { const mid = (lo + hi) >> 1; if (evaluar(f(), ctx(), { limites: { pasos: mid } }).estado === 'RESUELTO') hi = mid; else lo = mid + 1; }
    const t0 = performance.now();
    for (let k = 0; k < 3; k++) await m.grande.validar(r.evento);
    filas.push({ que, pasos: lo, ocupantes: presupuesto.usados, bytes: presupuesto.bytes, ms: (performance.now() - t0) / 3 });
  }
  for (const f of filas) assert.ok(f.ocupantes < 10000 && f.bytes < 2000000 && f.pasos < 100000, JSON.stringify(f));
  console.log('# coste del puente, segunda vuelta:\n' + filas.map((f) => '#   ' + f.que + ': ' + f.pasos + ' pasos, ' + f.ocupantes + ' ocupantes, ' + f.bytes + ' bytes; validar el registro entero ' + f.ms.toFixed(1) + ' ms').join('\n'));
});
