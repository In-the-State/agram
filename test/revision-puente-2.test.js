// Segunda revisión de seguridad del PUENTE y de la salida (encargo agram-equipo/encargos/encargo-revision-puente-2.md,
// Core AGRAM 17-11), sobre beta-puente2 f9a7b31: la vuelta a favor de otra persona, el enlace de quien creó el libro y
// las reglas del puente en el suelo. Un agente distinto de quien lo construyó intenta romperlo; no arregla nada. Un caso
// por ataque: si la defensa aguanta, el caso lo afirma; si hay hueco, el caso lleva `todo` con su motivo en llano y falla
// de verdad (RP1 a RP6). Ejes en memoria, identidades y claves de prueba generadas en cada ejecución
// (ejemplos/puente.mjs): nada real. El sellador de nivel 4 es el simulado de ejemplos/ikisai/sellos.mjs.
//
// Ayudas de esta prueba: `vueltaFalsa` fabrica un envío del pequeño que el pequeño nunca escribió (el registro no entra
// en ningún libro) y lo sella con las claves que se le den: las de la línea del pequeño (casaP y el sellador) o unas
// cualesquiera, como haría quien escribe un enlace con claves suyas.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Eje } from '../src/eje.js';
import * as A from '../src/acciones.js';
import * as V from '../src/versiones.js';
import * as C from '../src/contrato.js';
import { EPOCA_0_BTML, idDeRegistro, epocaEscritaDe } from '../src/epocas.js';
import { crearEvento } from '../src/evento.js';
import { generarClaves, firmar, firmarPosesion } from '../src/autoridad.js';
import { evaluar } from '../src/bqlm.js';
import { ContextoEje } from '../src/contexto-eje.js';
import { serializar, restaurar } from '../src/persistencia.js';
import { quemaDelCoste } from '../src/escritura.js';
import {
  PLANTILLAS_DEL_PUENTE as P, ENLACES, REGLAS_DEL_PUENTE as N, REGLA_DEL_CREADOR, RETIRAR_ENLACE,
  genesisComoDecupla, bloqueosDeLaVuelta, leerTraido, registroComoDecupla, formulaDeLoEnviado, formulaDeLaPrueba,
} from '../datos/epocas/puente.mjs';
import { dosLibros, saldoDe } from '../ejemplos/puente.mjs';
import { selloEnCascada } from '../ejemplos/ikisai/sellos.mjs';

const ID0 = EPOCA_0_BTML.id;
const M0 = { ref: ID0 };
const copia = (x) => JSON.parse(JSON.stringify(x));
const reglas = (r) => (r.ok ? [] : r.motivos.map((m) => m.regla));
const firmaDe = (claves) => (ev) => firmar(ev, claves.privada);
const SOLO_ESO = 'a declared balance is only that';

/** Escribe a mano en `eje` pagando el coste de escribir: 'entra' o el mensaje del rechazo. */
const aMano = (eje, autor, privada, datos, posesion) => eje.escribir({ autor, ...datos, movimientos: [quemaDelCoste(autor, datos.payload, 'minuto', { eje }), ...(datos.movimientos ?? [])] }, privada, posesion).then(() => 'entra', (e) => e.message);

/** Los dos libros del ejemplo, el menú de ana (5 E) traído al pequeño y bea también en el grande (como en puente-2). */
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

/** Otra persona en el grande (ana la invita), con su clave: { k, lanza, intenta }. */
async function miembro(m, nombre) {
  const k = await generarClaves();
  const inv = await m.grande.invitar({ autor: 'ana', invitado: nombre, clave: k.publica, t: m.t(), privada: m.claves.ana.privada });
  await m.grande.aceptar(inv, k, { t: m.t() });
  const intenta = (eje, cual, params) => A.transaccion(eje, cual, params, nombre, { t: m.t(), firmar: firmaDe(k) });
  const lanza = async (eje, cual, params) => {
    const r = await intenta(eje, cual, params);
    if (!r.ok) throw new Error(cual + ' de ' + nombre + ': ' + r.motivos.map((x) => x.mensaje).join('; '));
    return eje.anadir(r.evento);
  };
  return { k, intenta, lanza };
}

/** ana le da a `a` `n` E de su serie (una transferencia a mano: la época la deja). */
const darE = (m, a, n) => aMano(m.grande, 'ana', m.claves.ana.privada, { sobre: m.sala.id, t: m.t(), payload: [['te doy ' + n]], movimientos: [{ token: 'E', emisor: 'ana', denominacion: 'plato', registro: m.menu.id, cantidad: n, de: 'ana', a }] });

/** ana envía `cuanto` a bea por `enlace` (el del dueño, por defecto) y bea lo recibe en el pequeño. */
async function enviaYRecibe(m, cuanto, enlace = m.abre) {
  const envio = await m.lanza(m.grande, P.enviar, { X: enlace.id, series: m.serie, quantity: cuanto, to: m.claves.bea.publica }, 'ana');
  const traido = await m.traer(m.pequeno, m.grande, envio);
  await m.lanza(m.pequeno, P.recibir, { X: traido.id }, 'bea');
  return envio;
}

/** bea devuelve de verdad `cuanto` de la forastera al grande, para la clave `para`, y se trae por `enlace`. */
async function devuelve(m, cuanto, para = m.claves.bea.publica, enlace = m.abre) {
  const vuelta = await m.lanza(m.pequeno, P.enviar, { X: m.cuelga.id, series: m.forastera, quantity: cuanto, to: para }, 'bea');
  return m.traer(m.grande, m.pequeno, vuelta, { link: enlace.id });
}

/**
 * Un envío «del pequeño» que vuelve al grande y que el pequeño nunca escribió, sellado con `nivel1` y `observador` (por
 * defecto, las claves de la línea del pequeño), traído al grande por `enlace` por `quien`: el resultado de la transacción.
 */
async function vueltaFalsa(m, { cuanto, para, enlace, nivel1 = m.claves.casaP, observador = m.claves.sellador, quien = 'ana' }) {
  const payload = ['send', [[m.grande.genesisId], [[m.forastera], [m.grande.genesisId + ':ana'], ['plato'], [m.menu.id]], [cuanto], [para]], ['all announced movements happened'], ['bea'], [P.enviar]];
  const falsa = await crearEvento({ autor: 'bea', sobre: m.cuelga.id, en: '4000000000', t: m.t(), movimientos: [quemaDelCoste('bea', payload, 'minuto', { eje: m.pequeno })], payload });
  assert.equal(m.pequeno.obtener(falsa.id), undefined, 'el pequeño no lo tiene');
  return m.traerCon(m.grande, m.pequeno, falsa, { link: enlace.id, proof: await m.sellar(m.pequeno, falsa.id, { nivel1, observador }), quien });
}

/** Un elemento de bea en el grande y su enlace de creadora al libro `libro` (por defecto, el pequeño) con su génesis. */
async function enlaceDeCreadora(m, { libro = m.pequeno, genesis, lineas, elemento, quien = 'bea', opciones } = {}) {
  const suyo = elemento ?? (await m.lanza(m.grande, 'anchor here', { X: m.grande.alta(quien).id, title: 'lo de ' + quien, content: 'x' }, quien));
  const r = await m.intenta(m.grande, ENLACES.abrir, { X: suyo.id, book: libro.genesisId, 'line keys': lineas ?? [[1, m.claves.casaP.publica], [4, m.claves.sellador.publica]], genesis: genesis ?? genesisComoDecupla(libro.obtener(libro.genesisId)) }, quien, opciones);
  return { elemento: suyo, r, enlace: r.ok ? await m.grande.anadir(r.evento) : null };
}

/** Un «open a private book here» de ana en un elemento nuevo del grande, con las claves `lineas`. */
async function otroEnlaceDeAna(m, lineas, titulo = 'otra sala') {
  const sala = await m.lanza(m.grande, 'anchor here', { X: m.grande.genesisId, title: titulo, content: 'x' }, 'ana');
  return m.lanza(m.grande, ENLACES.abrir, { X: sala.id, book: m.pequeno.genesisId, 'line keys': lineas }, 'ana');
}

/** Los movimientos de una vuelta a mano: de `de`, con la salida `salida`, `n` hacia `a` y su liberación. */
const mov = (m, extra) => ({ token: 'E', emisor: 'ana', denominacion: 'plato', registro: m.menu.id, ...extra });
const saca = (m, de, salida, n, a = 'bea') => [...(de === a ? [] : [mov(m, { de, a, salida, cantidad: n })]), mov(m, { de: a, a, estado: 'liberacion', salida, cantidad: n })];
/** Un «receive from another book» escrito a mano sobre `traida` con `movimientos` (su 1.1, lo que diga `ternas`). */
const recibeAMano = (m, traida, movimientos, { quien = 'bea', privada = m.claves.bea.privada, ternas = [['ana', m.abre.id, 1]], en = '4000000000' } = {}) => aMano(m.grande, quien, privada, { sobre: traida.id, en, t: m.t(), payload: ['receive', [[traida.id], ternas], ['all announced movements happened'], [quien], [P.recibir]], movimientos });

/** La raíz de un cambio que hereda de la 0, con sus posiciones propias. */
const raiz = (titulo, propias) => Array.from({ length: Math.max(7, ...Object.keys(propias).map(Number)) + 1 }, (_, i) => (i === 0 ? [titulo] : propias[i] ?? (i === 6 ? [['revisión'], ['hereda'], [ID0]] : M0)));
const regla0 = (n) => EPOCA_0_BTML.reglasConId.find((x) => x.regla[0][0] === n).regla;
/** La fila 8 de un cambio que pone `valor` en 8.9.`pos`. */
const fila89 = (pos, valor) => Array.from({ length: 10 }, (_, i) => (i === 9 ? Array.from({ length: pos + 1 }, (_, j) => (j === pos ? valor : M0)) : M0));

// ================================ HALLAZGOS ================================

// ---------- RP1 (alto): la dueña del grande se lleva lo que otros mandaron por su enlace ----------

// Arreglado (encargo «arreglos de la segunda revisión del puente»): HALLAZGO RP1 (alto): el fondo es del AUTOR del enlace, y el autor elige las claves de línea de cada enlace suyo. Desde la segunda vuelta la vuelta saca lo bloqueado por OTROS (antes solo soltaba lo propio). Así la dueña del grande, sin el pequeño, escribe un «open a private book here» en otra sala (el viejo sigue valiendo: no se recorre el libro), anota claves suyas, sella una vuelta que el pequeño nunca escribió y la recibe para sí sacándola del bloqueo de carla. PUENTE.md §10.4 dice a quien envía «queda en manos de ese libro», y el diseño «por el enlace del dueño no cambia nada»: no es así, queda también en manos de quien escribió el enlace
test('RP1: ana, dueña del grande, escribe otro enlace al pequeño en otra sala con claves suyas, fabrica una vuelta y se lleva lo que carla mandó al pequeño por el enlace de ana', async () => {
  const m = await mundo();
  const { grande, claves, abre, serie } = m;
  const carla = await miembro(m, 'carla');
  assert.equal(await darE(m, 'carla', 2), 'entra');
  await carla.lanza(grande, P.enviar, { X: abre.id, series: serie, quantity: 2, to: claves.bea.publica });
  assert.equal(grande.bloqueado('carla', serie, abre.id), 2, 'carla mandó 2 al pequeño por el enlace de ana');
  // ana: claves suyas en un enlace nuevo, en otra sala. No retira el viejo.
  const f1 = await generarClaves();
  const f4 = await generarClaves();
  const suyo = await otroEnlaceDeAna(m, [[1, f1.publica], [4, f4.publica]]);
  assert.equal(C.gradoDelEnlace(grande, abre.id).cuenta, true, 'el viejo sigue contando');
  const traida = await vueltaFalsa(m, { cuanto: 2, para: claves.ana.publica, enlace: suyo, nivel1: f1, observador: f4 });
  if (traida.ok) {
    const x = await grande.anadir(traida.evento);
    const recibo = await m.intenta(grande, P.recibir, { X: x.id, locks: [['carla', abre.id, 2]] }, 'ana');
    if (recibo.ok) await grande.anadir(recibo.evento);
  }
  // Hoy: entra todo, carla 0 y ana 5. Lo esperado: lo de carla sigue bloqueado para el pequeño.
  assert.deepEqual([grande.bloqueado('carla', serie, abre.id), grande.saldo('ana', serie)], [2, 3], 'lo que carla mandó no lo saca la dueña con claves suyas');
});

// ---------- RP2 (medio): lo bloqueado sobre un enlace por otra plantilla queda congelado y se lo lleva la vuelta ----------

// Arreglado (encargo «arreglos de la segunda revisión del puente»): HALLAZGO RP2 (medio): «lock E as a bid for a quota» y «commit P» se ofrecen sobre cualquier registro, también un enlace, y bloquean con la salida en él. «what is locked for another book is released only by its return» (suelo) prohíbe soltarlo y «what is received is what was sent» (suelo) lo cuenta en el fondo: quien recibe una vuelta de verdad lo elige. Solo «send to another book» debería bloquear con la salida en un enlace
test('RP2: carla puja por un cupo sobre el enlace de ana (se le ofrece en su 1): su E queda bloqueada con la salida en el enlace, no la suelta nunca y la vuelta de bea se la lleva; ana compromete P sobre el enlace y no lo suelta', async () => {
  const m = await mundo();
  const { grande, claves, abre, serie } = m;
  const carla = await miembro(m, 'carla');
  assert.equal(await darE(m, 'carla', 2), 'entra');
  // Arreglado (RP2): ya no se le ofrece sobre el enlace, ni comprometer P; y a mano, la regla nueva lo para.
  assert.equal(A.acciones(grande, abre.id, 1, 'carla').some((a) => a.nombre === 'lock E as a bid for a quota'), false, 'no se le ofrece sobre el enlace');
  assert.equal(A.acciones(grande, abre.id, 2, 'ana').some((a) => a.nombre === 'commit P'), false, 'comprometer P sobre el enlace no se ofrece');
  assert.match(await aMano(grande, 'carla', carla.k.privada, { sobre: abre.id, t: m.t(), payload: [['puja a mano']], movimientos: [mov(m, { cantidad: 2, de: 'carla', a: 'carla', estado: 'bloqueo', salida: abre.id })] }), /only a send locks for another book/, 'a mano, no entra');
  const puja = await carla.intenta(grande, 'lock E as a bid for a quota', { X: abre.id, series: serie, quantity: 2 });
  if (puja.ok) await grande.anadir(puja.evento);
  // ana manda 2 a bea de verdad y bea devuelve 2 de verdad para su clave del grande: bea elige el bloqueo de carla.
  await enviaYRecibe(m, 2);
  const traida = await devuelve(m, 2);
  const recibo = await m.intenta(grande, P.recibir, { X: traida.id, locks: [['carla', abre.id, 2]] }, 'bea');
  if (recibo.ok) await grande.anadir(recibo.evento);
  // commit P sobre el enlace: el P de ana queda bloqueado con la salida en él.
  const p = await m.intenta(grande, 'commit P', { X: abre.id }, 'ana');
  const bloqueoP = p.ok ? p.evento.movimientos.find((x) => x.token === 'P' && x.estado === 'bloqueo') : null;
  let sueltaP = 'no se bloqueó';
  if (bloqueoP) {
    await grande.anadir(p.evento);
    sueltaP = await aMano(grande, 'ana', claves.ana.privada, { sobre: abre.id, t: m.t(), payload: [['lo suelto']], movimientos: [{ ...bloqueoP, estado: 'liberacion' }] });
  }
  // Hoy: la puja y el compromiso entran, la vuelta de bea se lleva las 2 de carla (las 2 de ana siguen bloqueadas) y el
  // P de ana no se suelta. Lo esperado: lo de carla sigue siendo suyo y nada se congela fuera de un envío.
  assert.doesNotMatch(sueltaP, new RegExp(N.soloLaVuelta), 'el P comprometido no queda congelado');
  assert.deepEqual([grande.saldo('carla', serie) + grande.bloqueado('carla', serie), grande.saldo('bea', serie)], [2, 0], 'la puja de carla no la paga a bea');
});

// ---------- RP3 (medio): un cambio de gobierno congela toda vuelta (las constantes que leen las reglas del suelo) ----------

test('RP3: un cambio «governance» que saca E de 8.9.1, o pone en 8.9.2 un nivel que no existe, entra; con él ninguna vuelta se recibe ni nada se trae: lo bloqueado para otro libro queda parado para siempre', { todo: 'HALLAZGO RP3 (medio): las reglas del puente están en el suelo, pero lo que leen (epoch.8.9.1, epoch.8.9.2, epoch.7.6) es pieza de gobierno y no suelo: sueloDe no añade posiciones. Con dos tercios, sacar E de 8.9.1 deja «what is received is what was sent» en falso para toda vuelta, y subir 8.9.2 deja «a brought record comes with its proof» en falso para todo lo traído (8.9.2 = 9 entra aunque no es un nivel de 7.6.1). No se llevan nada, pero lo dejan parado: la vuelta de lo que ya salió no debería depender de 8.9' }, async () => {
  const m = await mundo();
  await enviaYRecibe(m, 3);
  const traida = await devuelve(m, 1);
  const recibo = await m.intenta(m.grande, P.recibir, { X: traida.id }, 'bea');
  assert.equal(recibo.ok, true, 'control: la vuelta se recibe');
  const vuelta = await m.lanza(m.pequeno, P.enviar, { X: m.cuelga.id, series: m.forastera, quantity: 1, to: m.claves.bea.publica }, 'bea');
  const trae = await m.traerCon(m.grande, m.pequeno, vuelta, { proof: await m.sellar(m.pequeno, vuelta.id) });
  assert.equal(trae.ok, true, 'control: se trae');
  const casos = [['8.9.1 sin E', fila89(1, ['R']), formulaDeLoEnviado, recibo.evento], ['8.9.2 en 9', fila89(2, [9]), formulaDeLaPrueba, trae.evento]];
  const fallos = [];
  for (const [que, ocho, formula, ev] of casos) {
    const cambio = { raiz: [[que], M0, M0, M0, M0, M0, [['revisión'], ['hereda'], [ID0]], M0, ocho], registros: [] };
    const motivos = V.comprobarCambio(EPOCA_0_BTML, cambio, 'governance').motivos;
    assert.ok(V.comprobarCambio(EPOCA_0_BTML, cambio, 'ordinary').motivos.length > 0, que + ': como «ordinary», no (8.9 es pieza de gobierno)');
    const control = evaluar(formula(), new ContextoEje(m.grande, { ev, epoch: EPOCA_0_BTML }));
    assert.deepEqual([control.estado, control.valor?.[0]], ['RESUELTO', true], que + ': control con la época de hoy');
    const epoch = V.fundirCambio(EPOCA_0_BTML, cambio).version;
    const x = evaluar(formula(), new ContextoEje(m.grande, { ev, epoch }));
    const sigue = x.estado === 'RESUELTO' && x.valor?.[0] === true;
    if (!(motivos.length > 0 || sigue)) fallos.push(que);
  }
  assert.deepEqual(fallos, [], 'o el cambio no entra, o la vuelta y lo traído siguen valiendo con él');
});

// ---------- RP4 (bajo): el límite (b) «por lectura» no lo cumple la oferta ----------

// Arreglado (encargo «arreglos de la segunda revisión del puente»): HALLAZGO RP4 (bajo): el límite (b) es «por lectura y no por regla» (PUENTE.md §10.2; DISENO_PUENTE_2: «la carta no lo ofrece»), pero la oferta del núcleo (src/acciones.js) sí lo ofrece: enviar se ofrece sobre cualquier enlace y traer sobre cualquier «open» con génesis en un elemento de su autor, sin mirar gradoDelEnlace. Y la regla deja enviar por él (caso 8): lo mandado queda en manos de bea aunque la lectura diga que no cuenta
test('RP4: con un enlace del dueño al pequeño con otras claves, el de bea no cuenta (lectura), pero «send to another book» y «bring a record from another book» se ofrecen sobre él', async () => {
  const m = await mundo();
  const { grande, claves } = m;
  const { enlace } = await enlaceDeCreadora(m);
  await otroEnlaceDeAna(m, [[1, (await generarClaves()).publica], [4, claves.sellador.publica]]);
  assert.equal(C.gradoDelEnlace(grande, enlace.id).cuenta, false, 'la lectura: no cuenta');
  const ofrece = (k, quien, nombre) => A.acciones(grande, enlace.id, k, quien).some((a) => a.nombre === nombre);
  assert.deepEqual([ofrece(4, 'ana', P.enviar), ofrece(6, 'ana', P.traer)], [false, false], 'no se ofrece enviar ni traer por un enlace que no cuenta');
});

// ---------- RP5 (bajo): gradoDelEnlace da por bueno un enlace de antes del puente ----------

// Arreglado (encargo «arreglos de la segunda revisión del puente»): HALLAZGO RP5 (bajo): enlaceQueCuenta lee el libro en 1.0.0 y rechaza un enlace viejo (con el libro en 1.0), como dice PUENTE.md §2; contrato.gradoDelEnlace y librosPrivados({ puente: true }) lo dan como «del dueño», cuenta: true. La carta lo ofrecería y la regla lo rechazaría
test('RP5: un «open a private book here» de ana con el libro en 1.0 (la forma de antes del puente) no sirve para traer ni enviar, pero gradoDelEnlace dice «del dueño» y cuenta', async () => {
  const m = await mundo();
  const { grande, pequeno, claves, serie } = m;
  const sala2 = await m.lanza(grande, 'anchor here', { X: grande.genesisId, title: 'sala 2', content: 'x' }, 'ana');
  assert.equal(await aMano(grande, 'ana', claves.ana.privada, { sobre: sala2.id, en: '9100000000', t: m.t(), payload: ['un enlace de antes', [pequeno.genesisId], [[1, claves.casaP.publica], [4, claves.sellador.publica]], ['ana'], [ENLACES.abrir]] }), 'entra');
  const viejo = grande.sobre(sala2.id).find((x) => JSON.stringify(x.payload).includes('un enlace de antes'));
  const nota = await m.lanza(pequeno, 'anchor here', { X: pequeno.genesisId, title: 'nota', content: 'x' }, 'bea');
  const proof = await m.sellar(pequeno, nota.id);
  assert.match(await aMano(grande, 'ana', claves.ana.privada, { sobre: grande.genesisId, en: '9800000000', t: m.t(), payload: ['traer', [[pequeno.genesisId], registroComoDecupla(nota), proof, [viejo.id]], ['x'], ['ana'], [P.traer]] }), new RegExp(N.enlazado), 'la regla no trae por él');
  assert.match(await aMano(grande, 'ana', claves.ana.privada, { sobre: viejo.id, en: '4000000000', t: m.t(), payload: ['enviar', [[pequeno.genesisId], [[serie], ['ana'], ['plato'], [m.menu.id]], [1], [claves.bea.publica]], ['x'], ['ana'], [P.enviar]], movimientos: [mov(m, { cantidad: 1, de: 'ana', a: 'ana', estado: 'bloqueo', salida: viejo.id })] }), new RegExp(N.envio), 'ni envía');
  assert.equal(C.gradoDelEnlace(grande, viejo.id).cuenta, false, 'la lectura dice lo mismo que la regla');
});

// ---------- RP6 (bajo): el 1.1 de una vuelta no se coteja con sus movimientos ----------

// Arreglado (encargo «arreglos de la segunda revisión del puente»): HALLAZGO RP6 (bajo): «what is received is what was sent» mira los movimientos y no el 1.1 («de qué bloqueos saca»), así que el 1.1 puede decir otra cosa que lo que pasó (y a mano, con más de diez ternas en los movimientos, también entra: caso 7). Quien lea el 1.1 (la carta) leería mal de quién salió
test('RP6: un «receive» de una vuelta que dice en su 1.1 que saca de ana y saca de carla entra', async () => {
  const m = await mundo();
  const { grande, claves, abre, serie } = m;
  const carla = await miembro(m, 'carla');
  await darE(m, 'carla', 1);
  await carla.lanza(grande, P.enviar, { X: abre.id, series: serie, quantity: 1, to: claves.bea.publica });
  await enviaYRecibe(m, 2);
  const traida = await devuelve(m, 1);
  const r = await recibeAMano(m, traida, saca(m, 'carla', abre.id, 1), { ternas: [['ana', abre.id, 1]] });
  assert.notEqual(r, 'entra', 'el 1.1 dice ana y sale de carla');
});

// ================================ LO QUE AGUANTA ================================

test('aguanta (1): la misma vuelta no se trae dos veces (por el mismo enlace, por otro del dueño, por el de la creadora, tras retirar y volver a enlazar) ni se recibe dos veces (en otra posición, tras restaurar, en el otro orden); un envío no se recibe en un tercer libro', async () => {
  const m = await mundo();
  const { grande, pequeno, claves, abre, sala, serie } = m;
  const envio = await enviaYRecibe(m, 3);
  const vuelta = await m.lanza(pequeno, P.enviar, { X: m.cuelga.id, series: m.forastera, quantity: 1, to: claves.bea.publica }, 'bea');
  const proof = await m.sellar(pequeno, vuelta.id);
  const traida = await m.traer(grande, pequeno, vuelta, { proof });
  const { enlace: deBea } = await enlaceDeCreadora(m);
  const otro = await otroEnlaceDeAna(m, [[1, claves.casaP.publica], [4, claves.sellador.publica]]);
  for (const [que, L] of [['el mismo', abre], ['otro del dueño', otro], ['el de la creadora', deBea]]) assert.deepEqual(reglas(await m.traerCon(grande, pequeno, vuelta, { link: L.id, proof })), [N.unaVez], que);
  // Dos recibos hechos sobre el mismo estado.
  const r1 = await m.intenta(grande, P.recibir, { X: traida.id }, 'bea');
  const r2 = await m.intenta(grande, P.recibir, { X: traida.id }, 'bea');
  assert.ok(r1.ok && r2.ok && r1.evento.id !== r2.evento.id);
  const antes = await restaurar(serializar(grande));
  await grande.anadir(r1.evento);
  await assert.rejects(grande.anadir(r2.evento), new RegExp(N.recibir));
  const E = r2.evento.movimientos.filter((x) => x.token === 'E');
  assert.match(await recibeAMano(m, traida, E, { en: '5000000000', ternas: r2.evento.payload[1][1] }), new RegExp(N.recibir), 'en otra posición');
  await assert.rejects((await restaurar(serializar(grande))).anadir(r2.evento), new RegExp(N.recibir), 'tras restaurar');
  await antes.anadir(r2.evento);
  await assert.rejects(antes.anadir(r1.evento), new RegExp(N.recibir), 'en el otro orden');
  assert.deepEqual([saldoDe(grande, 'bea', serie), saldoDe(antes, 'bea', serie)], [{ libre: 1, bloqueado: 0 }, { libre: 1, bloqueado: 0 }]);
  // Retirar el enlace y volver a enlazar en el mismo elemento.
  await m.lanza(grande, RETIRAR_ENLACE, { X: abre.id }, 'ana');
  const nuevo = await m.lanza(grande, ENLACES.abrir, { X: sala.id, book: pequeno.genesisId, 'line keys': [[1, claves.casaP.publica], [4, claves.sellador.publica]] }, 'ana');
  assert.deepEqual(reglas(await m.traerCon(grande, pequeno, vuelta, { link: nuevo.id, proof })), [N.unaVez], 'tras retirar y volver a enlazar');
  // El envío de ana al pequeño, traído a un tercer libro que también cuelga del grande: allí no se recibe.
  const tercero = await Eje.genesis({ identidad: 'bea', foco: ['un tercer libro'], t: m.t(), clave: claves.bea.publica, privada: claves.bea.privada });
  const cuelga3 = await m.lanza(tercero, ENLACES.cuelga, { X: tercero.genesisId, book: grande.genesisId, element: sala.id, 'line keys': [[1, claves.casaG.publica], [4, claves.sellador.publica]] }, 'bea');
  const enTercero = await m.traer(tercero, grande, envio, { link: cuelga3.id });
  assert.ok(reglas(await m.intenta(tercero, P.recibir, { X: enTercero.id }, 'bea')).includes(N.recibir), 'el envío nombra el pequeño, no el tercero');
});

test('aguanta, con su tope (2): una vuelta fabricada saca como mucho el fondo del autor del enlace por el que se trae y de sus claves (RP1): sus enlaces a ese libro que anotan la clave de la primera cabecera, también los retirados; nada del de otro autor ni de un enlace suyo con otras claves', async () => {
  const m = await mundo();
  const { grande, claves, abre, serie } = m;
  const carla = await miembro(m, 'carla');
  await darE(m, 'carla', 3);
  await enviaYRecibe(m, 2);
  await carla.lanza(grande, P.enviar, { X: abre.id, series: serie, quantity: 1, to: claves.bea.publica });
  const { enlace: L1, elemento } = await enlaceDeCreadora(m);
  await carla.lanza(grande, P.enviar, { X: L1.id, series: serie, quantity: 2, to: claves.bea.publica });
  // Un pequeño que hace trampa (las claves de su línea), por el enlace de ana: 3 para bea, del fondo de ana (ana y carla).
  const t1 = await grande.anadir((await vueltaFalsa(m, { cuanto: 3, para: claves.bea.publica, enlace: abre })).evento);
  assert.deepEqual(bloqueosDeLaVuelta(grande, t1.id), [['ana', abre.id, 2], ['carla', abre.id, 1]]);
  await m.lanza(grande, P.recibir, { X: t1.id }, 'bea');
  assert.deepEqual([grande.bloqueado('ana', serie, abre.id), grande.bloqueado('carla', serie, abre.id), grande.bloqueado('carla', serie, L1.id)], [0, 0, 2]);
  // Una más por el enlace de ana: su fondo está vacío, y lo mandado por el de bea no sale por él.
  const t2 = await grande.anadir((await vueltaFalsa(m, { cuanto: 1, para: claves.bea.publica, enlace: abre })).evento);
  assert.equal(bloqueosDeLaVuelta(grande, t2.id), null);
  assert.match(await recibeAMano(m, t2, saca(m, 'carla', L1.id, 1)), new RegExp(N.loEnviado), 'el fondo de otro autor no sale');
  // bea retira L1 y escribe L2 con claves suyas (RP1, arreglado): por L2 ya no saca lo mandado por L1. La vuelta la trae
  // cualquiera (aquí ana: a bea traer al 9.8 del génesis de ana le pide el precio de la atención).
  await m.lanza(grande, RETIRAR_ENLACE, { X: L1.id }, 'bea');
  const f1 = await generarClaves();
  const f4 = await generarClaves();
  const { enlace: L2 } = await enlaceDeCreadora(m, { elemento, lineas: [[1, f1.publica], [4, f4.publica]] });
  const t3 = await grande.anadir((await vueltaFalsa(m, { cuanto: 2, para: claves.bea.publica, enlace: L2, nivel1: f1, observador: f4 })).evento);
  assert.equal(bloqueosDeLaVuelta(grande, t3.id), null, 'la ayuda no saca de un enlace con otras claves');
  assert.match(await recibeAMano(m, t3, saca(m, 'carla', L1.id, 2), { ternas: [['carla', L1.id, 2]] }), new RegExp(N.loEnviado), 'ni a mano');
  // Con las mismas claves (L3, en otro elemento suyo), sí: retirar y volver a enlazar igual devuelve lo parado.
  const otroSuyo = await m.lanza(grande, 'anchor here', { X: grande.alta('bea').id, title: 'otro de bea', content: 'x' }, 'bea');
  const { enlace: L3 } = await enlaceDeCreadora(m, { elemento: otroSuyo });
  const t4 = await grande.anadir((await vueltaFalsa(m, { cuanto: 2, para: claves.bea.publica, enlace: L3 })).evento);
  assert.deepEqual(bloqueosDeLaVuelta(grande, t4.id), [['carla', L1.id, 2]]);
  await m.lanza(grande, P.recibir, { X: t4.id }, 'bea');
  assert.deepEqual([grande.bloqueado('carla', serie, L1.id), grande.saldo('bea', serie), grande.saldo('carla', serie)], [0, 5, 0], 'el tope: lo mandado por los enlaces de ese autor a ese libro que anotan esas mismas claves');
});

test('aguanta (3): una vuelta no vacía el fondo de otro: del dueño por el de la creadora y al revés, ni bloqueos cuya salida parece un enlace y no lo es (un registro cualquiera, un enlace retirado de otro autor, un enlace a otro libro)', async () => {
  const m = await mundo();
  const { grande, claves, abre, sala, serie, menu } = m;
  await m.lanza(grande, 'issue E tied to X', { X: menu.id, denomination: 'plato', quantity: 5 }, 'ana');
  const carla = await miembro(m, 'carla');
  await darE(m, 'carla', 2);
  await enviaYRecibe(m, 2);
  const { enlace: deBea } = await enlaceDeCreadora(m);
  await carla.lanza(grande, P.enviar, { X: deBea.id, series: serie, quantity: 1, to: claves.bea.publica });
  // Un enlace de bea a ese mismo libro en otro elemento suyo, ya retirado, con 1 de carla bloqueado.
  const otroBea = await m.lanza(grande, 'anchor here', { X: grande.alta('bea').id, title: 'otro de bea', content: 'x' }, 'bea');
  const { enlace: retirado } = await enlaceDeCreadora(m, { elemento: otroBea });
  await carla.lanza(grande, P.enviar, { X: retirado.id, series: serie, quantity: 1, to: claves.bea.publica });
  await m.lanza(grande, RETIRAR_ENLACE, { X: retirado.id }, 'bea');
  // ana: 1 bloqueado con el menú como salida, y 1 mandado por un enlace suyo a otro libro.
  assert.equal(await aMano(grande, 'ana', claves.ana.privada, { sobre: menu.id, t: m.t(), payload: [['lo guardo']], movimientos: [mov(m, { cantidad: 1, de: 'ana', a: 'ana', estado: 'bloqueo', salida: menu.id })] }), 'entra');
  const tercero = await Eje.genesis({ identidad: 'ana', foco: ['otro libro de ana'], t: m.t(), clave: claves.ana.publica, privada: claves.ana.privada });
  const alTercero = await m.lanza(grande, ENLACES.abrir, { X: sala.id, book: tercero.genesisId, 'line keys': [[1, claves.casaG.publica]] }, 'ana');
  await m.lanza(grande, P.enviar, { X: alTercero.id, series: serie, quantity: 1, to: claves.ana.publica }, 'ana');
  // Una vuelta de 1 por el enlace de ana (su fondo tiene 2): no saca de los demás.
  const porAna = await grande.anadir((await vueltaFalsa(m, { cuanto: 1, para: claves.bea.publica, enlace: abre })).evento);
  const casos = {
    'el fondo de la creadora': [saca(m, 'carla', deBea.id, 1), N.loEnviado],
    'un registro cualquiera (el menú)': [saca(m, 'ana', menu.id, 1), 'nobody moves tokens of others'],
    'un enlace retirado de otro autor': [saca(m, 'carla', retirado.id, 1), N.loEnviado],
    'un enlace de ana a otro libro': [saca(m, 'ana', alTercero.id, 1), N.loEnviado],
  };
  for (const [que, [movs, regla]] of Object.entries(casos)) assert.match(await recibeAMano(m, porAna, movs), new RegExp(regla), que);
  // Una vuelta de 1 por el enlace de bea: no saca del fondo de ana.
  const porBea = await grande.anadir((await vueltaFalsa(m, { cuanto: 1, para: claves.bea.publica, enlace: deBea })).evento);
  assert.match(await recibeAMano(m, porBea, saca(m, 'ana', abre.id, 1)), new RegExp(N.loEnviado), 'el fondo del dueño por el enlace de la creadora');
  assert.deepEqual([grande.bloqueado('ana', serie, abre.id), grande.bloqueado('carla', serie, deBea.id), grande.bloqueado('carla', serie, retirado.id), grande.bloqueado('ana', serie, menu.id), grande.bloqueado('ana', serie, alTercero.id)], [2, 1, 1, 1, 1], 'nada salió');
});

test('aguanta (4): suplantar al creador no enlaza: el payload del génesis como JSON no canónico; la clave no se añade después al alta; una cosa con otra clave; lo que sí enlaza (demostración con clave, época escrita con cambios, un génesis con otro nombre de autor, una cosa con la misma clave) es de quien tiene la clave', async () => {
  const m = await mundo();
  const { grande, pequeno, claves } = m;
  const g = genesisComoDecupla(pequeno.obtener(pequeno.genesisId));
  const noCanonico = copia(g);
  noCanonico[2] = ['[ ' + g[2][0].slice(1)];
  assert.deepEqual(reglas((await enlaceDeCreadora(m, { genesis: noCanonico })).r), [REGLA_DEL_CREADOR], 'el payload con un espacio');
  // La clave no se añade después: bea no declara otra clave suya en un registro posterior (las claves no cambian).
  const nueva = await generarClaves();
  const alta = grande.alta('bea').id;
  assert.match(await aMano(grande, 'bea', claves.bea.privada, { sobre: alta, t: m.t(), payload: [['otra clave']], contexto: { claves: { bea: nueva.publica } } }, { bea: nueva.privada }), /a key is declared at its alta/);
  // Enlazan, y son de quien tiene la clave: un libro de demostración con clave, uno nacido con época escrita y cambios,
  // uno cuyo génesis dice otro nombre de autor (zeta) con la clave de bea.
  const demo = await Eje.genesis({ identidad: 'bea', foco: ['demo'], t: m.t(), clave: claves.bea.publica, privada: claves.bea.privada, demostracion: true });
  const conCambios = await Eje.genesis({ identidad: 'bea', foco: ['con cambios'], t: m.t(), clave: claves.bea.publica, privada: claves.bea.privada, epoca: { base: ID0, cambios: [{ raiz: raiz('más margen', { 7: [M0, M0, M0, [[900], [7200]]] }), registros: [] }] } });
  const zeta = await Eje.genesis({ identidad: 'zeta', foco: ['de zeta'], t: m.t(), clave: claves.bea.publica, privada: claves.bea.privada });
  assert.equal(genesisComoDecupla(demo.obtener(demo.genesisId)).length, 8);
  assert.ok(genesisComoDecupla(conCambios.obtener(conCambios.genesisId))[6][0] > 0, 'dice cuántos registros de época escribe');
  const { elemento } = await enlaceDeCreadora(m);
  for (const [que, libro] of [['demostración', demo], ['época escrita con cambios', conCambios], ['otro nombre de autor', zeta]]) {
    const r = await enlaceDeCreadora(m, { libro, elemento });
    assert.equal(r.r.ok, true, que + ': ' + JSON.stringify(r.r.motivos));
    assert.deepEqual([C.gradoDelEnlace(grande, r.enlace.id).quien, C.gradoDelEnlace(grande, r.enlace.id).cuenta], ['bea', true], que);
  }
  // Una cosa de bea dada de alta con la clave de bea (con su prueba de posesión) enlaza también: el fondo es de la cosa.
  const reg = await A.transaccion(grande, 'register a thing', { X: alta, thing: 'beabot', minutes: 60, key: claves.bea.publica }, 'bea', { t: m.t(), firmar: firmaDe(claves.bea) });
  await grande.anadir(await firmarPosesion(reg.evento, 'beabot', claves.bea.privada));
  const deBot = await enlaceDeCreadora(m, { quien: 'beabot' });
  assert.equal(deBot.r.ok, true, JSON.stringify(deBot.r.motivos));
  assert.equal(C.gradoDelEnlace(grande, deBot.enlace.id).quien, 'beabot');
  // Una cosa de bea con otra clave, no.
  const otra = await generarClaves();
  const reg2 = await A.transaccion(grande, 'register a thing', { X: alta, thing: 'otrobot', minutes: 60, key: otra.publica }, 'bea', { t: m.t(), firmar: firmaDe(claves.bea) });
  await grande.anadir(await firmarPosesion(reg2.evento, 'otrobot', otra.privada));
  const suyo = await A.transaccion(grande, 'anchor here', { X: grande.alta('otrobot').id, title: 'lo de otrobot', content: 'x' }, 'otrobot', { t: m.t(), firmar: firmaDe(otra) });
  assert.equal(suyo.ok, true, JSON.stringify(suyo.motivos));
  const el = await grande.anadir(suyo.evento);
  const r = await A.transaccion(grande, ENLACES.abrir, { X: el.id, book: pequeno.genesisId, 'line keys': [[1, claves.casaP.publica]], genesis: g }, 'otrobot', { t: m.t(), firmar: firmaDe(otra) });
  assert.deepEqual(reglas(r), [REGLA_DEL_CREADOR], 'la cosa con otra clave');
});

test('aguanta (5): un enlace de la creadora un segundo anterior a la apertura del libro no entra; en el mismo segundo, sí', async () => {
  const m = await mundo();
  const { claves } = m;
  const { elemento } = await enlaceDeCreadora(m);
  const tg = m.t();
  const libro = await Eje.genesis({ identidad: 'bea', foco: ['al segundo'], t: tg, clave: claves.bea.publica, privada: claves.bea.privada });
  const unoAntes = new Date(Date.parse(tg) - 1000).toISOString().replace('.000Z', 'Z');
  assert.deepEqual(reglas((await enlaceDeCreadora(m, { libro, elemento, opciones: { t: unoAntes } })).r), [REGLA_DEL_CREADOR]);
  assert.deepEqual(reglas((await enlaceDeCreadora(m, { libro, elemento, opciones: { t: tg } })).r), []);
});

test('aguanta (6): la excepción del suelo no se usa fuera de un recibir de verdad: una nota, sobre algo traído que no es un envío, la vuelta de otra persona, una ya recibida, con más de lo que vuelve, mezclando una acuñación, de quien no bloqueó; las ternas repetidas que suman lo que vuelve entran', async () => {
  const m = await mundo();
  const { grande, pequeno, claves, abre, serie } = m;
  const carla = await miembro(m, 'carla');
  await enviaYRecibe(m, 4);
  const para = await devuelve(m, 2);
  const paraCarla = await devuelve(m, 1, carla.k.publica);
  const nota = await m.lanza(pequeno, 'anchor here', { X: pequeno.genesisId, title: 'nota', content: 'no es un envío' }, 'bea');
  const notaTraida = await m.traer(grande, pequeno, nota);
  const fuera = await aMano(grande, 'bea', claves.bea.privada, { sobre: grande.alta('bea').id, t: m.t(), payload: [['me lo llevo']], movimientos: saca(m, 'ana', abre.id, 1) });
  assert.match(fuera, /nobody moves tokens of others/, 'una nota');
  assert.match(await recibeAMano(m, notaTraida, saca(m, 'ana', abre.id, 1)), new RegExp(N.recibir), 'sobre algo traído que no es un envío');
  assert.match(await recibeAMano(m, paraCarla, saca(m, 'ana', abre.id, 1)), new RegExp(N.recibir), 'la vuelta va a carla, no a bea');
  assert.match(await recibeAMano(m, para, saca(m, 'ana', abre.id, 3)), new RegExp(N.loEnviado), 'más de lo que vuelve');
  const acuna = { token: 'E', emisor: 'bea', denominacion: 'x', registro: grande.alta('bea').id, cantidad: 1, de: null, a: 'bea' };
  assert.match(await recibeAMano(m, para, [...saca(m, 'ana', abre.id, 2), acuna]), new RegExp(N.loEnviado), 'mezclando una acuñación');
  assert.notEqual(await recibeAMano(m, para, saca(m, 'carla', abre.id, 2)), 'entra', 'de quien no tiene nada bloqueado');
  const repetidas = await m.intenta(grande, P.recibir, { X: para.id, locks: [['ana', abre.id, 1], ['ana', abre.id, 1]] }, 'bea');
  assert.equal(repetidas.ok, true, 'las ternas repetidas suman lo que vuelve');
  await grande.anadir(repetidas.evento);
  assert.match(await recibeAMano(m, para, saca(m, 'ana', abre.id, 2)), new RegExp(N.recibir), 'una ya recibida');
  assert.deepEqual([saldoDe(grande, 'ana', serie), saldoDe(grande, 'bea', serie)], [{ libre: 1, bloqueado: 2 }, { libre: 2, bloqueado: 0 }]);
});

test('aguanta, con su límite (7): diez bloqueos por vuelta es límite de la plantilla, de la ayuda y, desde RP6, de la regla: a mano no se recibe una vuelta que saca de once con diez ternas; quien recibe elige de quién saca, y quien pierde el bloqueo no pierde nada que pudiera recuperar', async () => {
  const m = await mundo();
  const { grande, claves, abre, serie } = m;
  await m.lanza(grande, 'issue E tied to X', { X: m.menu.id, denomination: 'plato', quantity: 10 }, 'ana');
  const enlaces = [abre];
  for (let k = 1; k < 11; k++) enlaces.push(await otroEnlaceDeAna(m, [[1, claves.casaP.publica], [4, claves.sellador.publica]], 'sala ' + k));
  for (const L of enlaces) await m.lanza(grande, P.enviar, { X: L.id, series: serie, quantity: 1, to: claves.bea.publica }, 'ana');
  const traida = await grande.anadir((await vueltaFalsa(m, { cuanto: 11, para: claves.bea.publica, enlace: abre })).evento);
  assert.equal(bloqueosDeLaVuelta(grande, traida.id), null, 'la ayuda no pasa de diez');
  assert.match(await recibeAMano(m, traida, enlaces.flatMap((L) => saca(m, 'ana', L.id, 1)), { ternas: enlaces.slice(0, 10).map((L) => ['ana', L.id, 1]) }), new RegExp(N.loEnviado), 'a mano, once con diez ternas: la undécima queda fuera de las ternas (RP6)');
  assert.equal(grande.saldo('bea', serie), 0);
  // Elegir: carla manda 2 a una clave que nadie tiene en el pequeño (no se recibirá nunca: no hay forma de echarlo atrás) y
  // ana manda 2 a bea; bea devuelve 2 y elige el bloqueo de carla.
  const m2 = await mundo();
  const carla = await miembro(m2, 'carla');
  await darE(m2, 'carla', 2);
  const nadie = await generarClaves();
  await carla.lanza(m2.grande, P.enviar, { X: m2.abre.id, series: m2.serie, quantity: 2, to: nadie.publica });
  assert.match(await aMano(m2.grande, 'carla', carla.k.privada, { sobre: m2.abre.id, t: m2.t(), payload: [['me lo devuelvo']], movimientos: [mov(m2, { cantidad: 2, de: 'carla', a: 'carla', estado: 'liberacion', salida: m2.abre.id })] }), new RegExp(N.soloLaVuelta), 'carla no lo recupera por sí misma');
  await enviaYRecibe(m2, 2);
  const vuelta = await devuelve(m2, 2);
  await m2.lanza(m2.grande, P.recibir, { X: vuelta.id, locks: [['carla', m2.abre.id, 2]] }, 'bea');
  assert.deepEqual([m2.grande.bloqueado('carla', m2.serie, m2.abre.id), m2.grande.bloqueado('ana', m2.serie, m2.abre.id)], [0, 2], 'lo de carla salió; lo de ana sigue respaldando lo que bea tiene en el pequeño');
});

test('aguanta, con su límite (8): (b) por lectura: con un enlace del dueño con otras claves, por el de bea se sigue enviando, trayendo lo que bea selle y recibiendo vueltas de su fondo; nada del fondo del dueño', async () => {
  const m = await mundo();
  const { grande, claves, abre, serie } = m;
  const f1 = await generarClaves();
  const f4 = await generarClaves();
  const { enlace } = await enlaceDeCreadora(m, { lineas: [[1, f1.publica], [4, f4.publica]] });
  assert.equal(C.gradoDelEnlace(grande, enlace.id).cuenta, false, 'el de ana (abre) tiene otras claves: el de bea no cuenta');
  await enviaYRecibe(m, 1);
  await m.lanza(grande, P.enviar, { X: enlace.id, series: serie, quantity: 2, to: claves.bea.publica }, 'ana');
  // Lo que bea puede de más: traer registros «del pequeño» que la línea que anota ana no confirmaría…
  const traida = await vueltaFalsa(m, { cuanto: 2, para: claves.bea.publica, enlace, nivel1: f1, observador: f4 });
  assert.equal(traida.ok, true, 'se trae por un enlace que no cuenta: ' + JSON.stringify(traida.motivos));
  const x = await grande.anadir(traida.evento);
  assert.deepEqual([leerTraido(grande, x.id).cuenta, leerTraido(grande, x.id).delDueno], [false, abre.id], 'lo dice la lectura');
  // …y recibir de su fondo lo que se mandó por su enlace, pero nada del de ana.
  assert.match(await recibeAMano(m, x, saca(m, 'ana', abre.id, 1)), new RegExp(N.loEnviado));
  await m.lanza(grande, P.recibir, { X: x.id }, 'bea');
  assert.deepEqual([grande.bloqueado('ana', serie, enlace.id), grande.bloqueado('ana', serie, abre.id), grande.saldo('bea', serie)], [0, 1, 2]);
});

test('aguanta (9): un libro no nace con una época que quita o sustituye una regla del puente: { base, cambios }, { raiz, registros } que hereda y una época completa; con un cambio de 8.9 sí nace (es su nacimiento)', async () => {
  const t = '2026-11-17T10:00:00Z';
  const otra = copia(regla0(N.envio));
  otra[2] = ['=true'];
  otra[6] = ['revisión: la misma regla, que ya no mira nada'];
  const cambio = { raiz: raiz('sin envío', { 2: [{ ref: idDeRegistro(otra) }] }), registros: [otra] };
  await assert.rejects(Eje.genesis({ identidad: 'x', foco: ['x'], t, demostracion: true, epoca: { base: ID0, cambios: [cambio] } }), /sustituye «a send locks what it names», que es del suelo/);
  await assert.rejects(Eje.genesis({ identidad: 'x', foco: ['x'], t, demostracion: true, epoca: cambio }), /sustituye «a send locks what it names», que es del suelo/);
  // Una época completa (sin «hereda»): la 0 escrita, con la regla cambiada por la otra.
  const cero = epocaEscritaDe(EPOCA_0_BTML);
  const vieja = idDeRegistro(regla0(N.envio));
  const completa = { raiz: JSON.parse(JSON.stringify(cero.raiz).split(vieja).join(idDeRegistro(otra))), registros: [...cero.registros.filter((r) => idDeRegistro(r) !== vieja), otra] };
  await assert.rejects(Eje.genesis({ identidad: 'x', foco: ['x'], t, demostracion: true, epoca: completa }), /suelo/);
  const sinE = { raiz: [['sin E'], M0, M0, M0, M0, M0, [['revisión'], ['hereda'], [ID0]], M0, fila89(1, ['R'])], registros: [] };
  const nace = await Eje.genesis({ identidad: 'x', foco: ['x'], t, demostracion: true, epoca: { base: ID0, cambios: [sinE] } });
  assert.deepEqual(nace.epoca().registro[8][9][1], ['R']);
});

test('aguanta, con su límite (10): no se viste otro registro de declaración (con «declare a balance» en lista o suelto); lo bloqueado en un enlace retirado no se declara; una declaración hecha antes de mover lo declarado es verdad en su fecha y nada más', async () => {
  const m = await mundo();
  const { grande, claves, serie, abre } = m;
  const alta = grande.alta('ana').id;
  const base = ['declare a balance: ana', [[serie], [1]], ['all announced movements happened'], ['ana']];
  const pasa = [mov(m, { cantidad: 1, de: 'ana', a: 'bea' })];
  for (const [que, datos] of [
    ['en lista, pasando E a bea', { sobre: alta, en: '8000000000', payload: [...base, ['declare a balance']], movimientos: pasa }],
    ['suelto, pasando E a bea', { sobre: alta, en: '8000000000', payload: [...base, 'declare a balance'], movimientos: pasa }],
    ['suelto, en otro sitio', { sobre: m.sala.id, payload: ['x', [[serie], [1]], 'y', 'ana', 'declare a balance'], movimientos: pasa }],
  ]) assert.match(await aMano(grande, 'ana', claves.ana.privada, { t: m.t(), ...datos }), new RegExp(SOLO_ESO), que);
  // Lo bloqueado en un enlace retirado sigue sin declararse.
  await enviaYRecibe(m, 3);
  await m.lanza(grande, RETIRAR_ENLACE, { X: abre.id }, 'ana');
  assert.deepEqual(reglas(await m.intenta(grande, P.declarar, { X: alta, series: serie, quantity: 5 }, 'ana')), [N.saldo]);
  // Declarar 2 y luego pasarlas a carla, que declara 2: las dos son verdad en su fecha (4 declaradas de 2).
  const carla = await miembro(m, 'carla');
  await m.lanza(grande, P.declarar, { X: alta, series: serie, quantity: 2 }, 'ana');
  await darE(m, 'carla', 2);
  const deCarla = await carla.intenta(grande, P.declarar, { X: grande.alta('carla').id, series: serie, quantity: 2 });
  assert.equal(deCarla.ok, true, 'quien lea las dos ha de mirar sus instantes');
});

test('aguanta, con su límite (11): solo el autor retira su enlace (una cosa de ana no); si ana no vuelve a enlazar, lo mandado por sus enlaces a ese libro queda parado: ninguna vuelta por el enlace de otro autor lo saca', async () => {
  const m = await mundo();
  const { grande, pequeno, claves, abre, serie } = m;
  await enviaYRecibe(m, 3);
  const bot = await generarClaves();
  const reg = await A.transaccion(grande, 'register a thing', { X: grande.alta('ana').id, thing: 'bot', minutes: 60, key: bot.publica }, 'ana', { t: m.t(), firmar: firmaDe(claves.ana) });
  await grande.anadir(await firmarPosesion(reg.evento, 'bot', bot.privada));
  assert.equal(await aMano(grande, 'bot', bot.privada, { sobre: abre.id, en: '4000000000', t: m.t(), payload: [['withdrawn'], [abre.id], ['x'], ['bot'], [RETIRAR_ENLACE]] }), 'entra', 'la cosa de ana cuelga una retirada');
  assert.equal(C.gradoDelEnlace(grande, abre.id).cuenta, true, 'no lo retira');
  await m.lanza(grande, RETIRAR_ENLACE, { X: abre.id }, 'ana');
  const vuelta = await m.lanza(pequeno, P.enviar, { X: m.cuelga.id, series: m.forastera, quantity: 1, to: claves.bea.publica }, 'bea');
  assert.ok(reglas(await m.traerCon(grande, pequeno, vuelta, { proof: await m.sellar(pequeno, vuelta.id) })).includes(N.enlazado), 'por el retirado no se trae');
  const { enlace: deBea } = await enlaceDeCreadora(m);
  const traida = await m.traer(grande, pequeno, vuelta, { link: deBea.id });
  assert.match(await recibeAMano(m, traida, saca(m, 'ana', abre.id, 1)), new RegExp(N.loEnviado), 'por el enlace de bea no sale el fondo de ana');
  assert.deepEqual(saldoDe(grande, 'ana', serie), { libre: 2, bloqueado: 3 }, 'el tamaño del límite: todo lo bloqueado con la salida en enlaces de ana a ese libro');
});

test('aguanta (12): un «open a private book here» de carla sin génesis es un anuncio y no cuenta en ningún sitio del puente: ni trae, ni envía, ni su fondo sale; y desde RP2 nadie bloquea en él fuera de un envío (que tampoco cabe)', async () => {
  const m = await mundo();
  const { grande, pequeno, claves, abre, serie } = m;
  const carla = await miembro(m, 'carla');
  await darE(m, 'carla', 2);
  const suyo = await carla.lanza(grande, 'anchor here', { X: grande.alta('carla').id, title: 'lo de carla', content: 'x' });
  const anuncio = await carla.lanza(grande, ENLACES.abrir, { X: suyo.id, book: pequeno.genesisId, 'line keys': [[1, claves.casaP.publica], [4, claves.sellador.publica]] });
  assert.deepEqual([C.gradoDelEnlace(grande, anuncio.id).cuenta, C.librosPrivados(grande, suyo.id, { puente: true })[0]?.cuenta], [false, false]);
  const nota = await m.lanza(pequeno, 'anchor here', { X: pequeno.genesisId, title: 'nota', content: 'x' }, 'bea');
  assert.ok(reglas(await m.traerCon(grande, pequeno, nota, { link: anuncio.id, proof: await m.sellar(pequeno, nota.id), quien: 'ana' })).includes(N.enlazado), 'no trae');
  assert.ok(reglas(await carla.intenta(grande, P.enviar, { X: anuncio.id, series: serie, quantity: 1, to: claves.bea.publica })).includes(N.envio), 'no envía');
  // carla bloquea 1 a mano con la salida en su anuncio: desde RP2 no entra (solo un envío bloquea con la salida en un
  // enlace); lo suyo sigue libre y lo declara entero; y ninguna vuelta saca de su anuncio.
  assert.match(await aMano(grande, 'carla', carla.k.privada, { sobre: suyo.id, t: m.t(), payload: [['lo aparto']], movimientos: [mov(m, { cantidad: 1, de: 'carla', a: 'carla', estado: 'bloqueo', salida: anuncio.id })] }), /only a send locks for another book/);
  assert.match(await aMano(grande, 'carla', carla.k.privada, { sobre: suyo.id, t: m.t(), payload: [['lo suelto']], movimientos: [mov(m, { cantidad: 1, de: 'carla', a: 'carla', estado: 'liberacion', salida: anuncio.id })] }), new RegExp(N.soloLaVuelta));
  assert.deepEqual(reglas(await carla.intenta(grande, P.declarar, { X: grande.alta('carla').id, series: serie, quantity: 3 })), [N.saldo]);
  assert.deepEqual(reglas(await carla.intenta(grande, P.declarar, { X: grande.alta('carla').id, series: serie, quantity: 2 })), []);
  await enviaYRecibe(m, 1);
  const traida = await grande.anadir((await vueltaFalsa(m, { cuanto: 1, para: claves.bea.publica, enlace: abre })).evento);
  assert.match(await recibeAMano(m, traida, saca(m, 'carla', anuncio.id, 1), { ternas: [['carla', anuncio.id, 1]] }), new RegExp(N.loEnviado));
  assert.deepEqual(saldoDe(grande, 'carla', serie), { libre: 2, bloqueado: 0 });
});

// ================================ SEGUNDA PASADA (sobre 53a4e1d: los arreglos de RP1, RP2, RP4, RP5 y RP6) ================================

/** Un envío «del pequeño» que vuelve al grande, nunca escrito, sellado con UN solo eslabón: una cabecera de nivel 4 del sellador. */
async function vueltaSoloNivel4(m, { cuanto, para }) {
  const payload = ['send', [[m.grande.genesisId], [[m.forastera], [m.grande.genesisId + ':ana'], ['plato'], [m.menu.id]], [cuanto], [para]], ['all announced movements happened'], ['bea'], [P.enviar]];
  const falsa = await crearEvento({ autor: 'bea', sobre: m.cuelga.id, en: '4000000000', t: m.t(), movimientos: [quemaDelCoste('bea', payload, 'minuto', { eje: m.pequeno })], payload });
  const proof = (await selloEnCascada(falsa.id, { observador: m.claves.sellador, capas: [{ nivel: 4, grado: 2, red: 0, libro: m.pequeno.genesisId }] })).decupla;
  return { falsa, proof };
}

// ---------- RP7 (crítico si el sellador de arriba sella lo que le den): una prueba de un solo eslabón, de nivel 4 ----------

test('RP7: con una prueba de un solo eslabón (una cabecera de nivel 4 firmada por el sellador, sin la casa del libro), cualquiera trae un envío que el grande nunca escribió y acuña 1000 forasteras en el pequeño, y en el grande saca por el enlace de ana lo que carla mandó', { todo: 'HALLAZGO RP7 (crítico si el sellador de nivel 4 sella, para un libro, un hash que le da cualquiera; el ejemplo lo simula así: «firma el lote de hashes que se le da»): PH1 pide que el eslabón 0 lo firme la clave que el enlace anota PARA SU NIVEL, pero no que el eslabón 0 sea el de abajo (la casa del libro). Una prueba cuyo único eslabón es de nivel 4 (el sellador, que los dos enlaces anotan en su 4 y que es el mismo para los dos libros) pasa «bringing needs the line keys» y «comes with its proof»; y el arreglo de RP1 mira justo esa pareja (nivel 4, sellador), que el enlace de ana anota. No hace falta la clave de la casa de ningún libro' }, async () => {
  const m = await mundo();
  const { grande, pequeno, claves, abre, serie, cuelga } = m;
  // (a) Al pequeño: un envío de 1000 que ana nunca escribió, con la cabecera de nivel 4 del sellador como único eslabón.
  const deVerdad = await m.intenta(grande, P.enviar, { X: abre.id, series: serie, quantity: 1, to: claves.bea.publica }, 'ana');
  const payload = copia(deVerdad.evento.payload);
  payload[1][2] = [1000];
  const falso = await crearEvento({ autor: 'ana', sobre: abre.id, en: '4000000000', t: m.t(), movimientos: deVerdad.evento.movimientos, payload });
  assert.equal(grande.obtener(falso.id), undefined, 'el grande no lo tiene');
  const solo4 = (await selloEnCascada(falso.id, { observador: claves.sellador, capas: [{ nivel: 4, grado: 2, red: 0, libro: grande.genesisId }] })).decupla;
  const traido = await m.traerCon(pequeno, grande, falso, { proof: solo4, link: cuelga.id });
  if (traido.ok) {
    const x = await pequeno.anadir(traido.evento);
    const r = await m.intenta(pequeno, P.recibir, { X: x.id }, 'bea');
    if (r.ok) await pequeno.anadir(r.evento);
  }
  // (b) En el grande: carla manda 3 por el enlace de ana; una vuelta de un solo eslabón de nivel 4 se las lleva a ana.
  const carla = await miembro(m, 'carla');
  await darE(m, 'carla', 3);
  await carla.lanza(grande, P.enviar, { X: abre.id, series: serie, quantity: 3, to: claves.bea.publica });
  const { falsa, proof } = await vueltaSoloNivel4(m, { cuanto: 3, para: claves.ana.publica });
  const vuelta = await m.traerCon(grande, pequeno, falsa, { proof });
  if (vuelta.ok) {
    const x = await grande.anadir(vuelta.evento);
    const r = await m.intenta(grande, P.recibir, { X: x.id, locks: [['carla', abre.id, 3]] }, 'ana');
    if (r.ok) await grande.anadir(r.evento);
  }
  // Hoy: entra todo (bea, 1000 forasteras; carla, 0). Lo esperado: ninguna de las dos pruebas basta.
  assert.deepEqual([pequeno.saldo('bea', m.forastera), grande.bloqueado('carla', serie, abre.id)], [0, 3], 'sin la cabecera de la casa del libro no se trae nada');
});

// ---------- RP8 (bajo): una vuelta saca de una persona más de lo que vuelve, y lo de más queda bloqueado en el enlace ----------

test('RP8: bea recibe una vuelta de 2 sacando 3 de carla (con una terna suya de 1): 1 queda bloqueado a nombre de bea con la salida en el enlace y le sirve en otra vuelta; y con ternas que comparten salida saca de carla 5 diciendo 4', { todo: 'HALLAZGO RP8 (bajo): al quitar «lo que entra por cada salida se libera en el mismo registro» y «lo transferido con una salida no pasa de lo liberado con ella», el cotejo de ternas casa cada liberación con una terna por cantidad y salida, no por quién. Una terna de quien recibe ([bea, enlace, 1]) deja que lo transferido supere lo liberado: lo de más queda bloqueado en el enlace a nombre de quien recibe, fuera de un envío (contra lo que dice «only a send locks for another book»: «un receive que lo libera»). El fondo no pierde nada (sigue bloqueado y sale por otra vuelta), pero quien recibe vacía a una persona concreta más allá de lo que vuelve y se queda un adelanto; y el 1.1 dice de menos (4 dichas, 5 sacadas)' }, async () => {
  const m = await mundo();
  const { grande, claves, abre, serie } = m;
  await m.lanza(grande, 'issue E tied to X', { X: m.menu.id, denomination: 'plato', quantity: 10 }, 'ana');
  const carla = await miembro(m, 'carla');
  await darE(m, 'carla', 10);
  await carla.lanza(grande, P.enviar, { X: abre.id, series: serie, quantity: 10, to: claves.bea.publica });
  const de = (cantidad) => mov(m, { de: 'carla', a: 'bea', salida: abre.id, cantidad });
  const libera = (cantidad) => mov(m, { de: 'bea', a: 'bea', estado: 'liberacion', salida: abre.id, cantidad });
  const t1 = await grande.anadir((await vueltaFalsa(m, { cuanto: 2, para: claves.bea.publica, enlace: abre })).evento);
  const masDeLoQueVuelve = await recibeAMano(m, t1, [de(3), libera(1), libera(1)], { ternas: [['carla', abre.id, 3], ['bea', abre.id, 1]] });
  const queda = grande.bloqueado('bea', serie, abre.id);
  const t2 = await grande.anadir((await vueltaFalsa(m, { cuanto: 4, para: claves.bea.publica, enlace: abre })).evento);
  const reparto = await recibeAMano(m, t2, [de(1), de(2), de(2), libera(1), libera(1), libera(2)], { ternas: [['carla', abre.id, 1], ['carla', abre.id, 1], ['carla', abre.id, 2]] });
  // Hoy: las dos entran, a bea le queda 1 bloqueado en el enlace y carla pierde 8 por dos vueltas de 2 y 4.
  assert.deepEqual([masDeLoQueVuelve === 'entra', queda, reparto === 'entra', grande.bloqueado('carla', serie, abre.id)], [false, 0, false, 10], 'ni lo transferido supera lo liberado, ni el 1.1 dice de menos');
});

// ---------- RP9 (medio): una vuelta legítima que pide más de diez bloqueos no entra nunca, y otro puede provocarlo ----------

test('RP9: el fondo de ana tiene 6 en un enlace y 1 en cada uno de otros diez; dan recibe antes su vuelta de 5 eligiendo el bloqueo de 6, y la vuelta de 11 de bea ya pide once bloqueos: no entra nunca (antes cabía en seis)', { todo: 'HALLAZGO RP9 (medio): desde RP6 la regla también tiene el tope de diez ternas, y una vuelta se recibe una sola vez y entera. Una vuelta cuyo importe solo cubren más de diez bloqueos no entra nunca: lo que quien la envió bloqueó en el pequeño y lo bloqueado aquí quedan parados para siempre. Quien recibe otra vuelta antes elige de qué bloqueos saca y puede dejar el fondo en trozos (aquí, dan). El tamaño: la vuelta entera' }, async () => {
  const m = await mundo();
  const { grande, claves, abre, serie } = m;
  await m.lanza(grande, 'issue E tied to X', { X: m.menu.id, denomination: 'plato', quantity: 11 }, 'ana');
  await m.lanza(grande, P.enviar, { X: abre.id, series: serie, quantity: 6, to: claves.bea.publica }, 'ana');
  for (let k = 0; k < 10; k++) {
    const L = await otroEnlaceDeAna(m, [[1, claves.casaP.publica], [4, claves.sellador.publica]], 'sala ' + k);
    await m.lanza(grande, P.enviar, { X: L.id, series: serie, quantity: 1, to: claves.bea.publica }, 'ana');
  }
  const dan = await miembro(m, 'dan');
  const paraDan = await grande.anadir((await vueltaFalsa(m, { cuanto: 5, para: dan.k.publica, enlace: abre })).evento);
  const paraBea = await grande.anadir((await vueltaFalsa(m, { cuanto: 11, para: claves.bea.publica, enlace: abre })).evento);
  assert.equal(bloqueosDeLaVuelta(grande, paraBea.id)?.length, 6, 'antes, la de bea cabe en seis bloqueos');
  await dan.lanza(grande, P.recibir, { X: paraDan.id, locks: [['ana', abre.id, 5]] });
  const ayuda = bloqueosDeLaVuelta(grande, paraBea.id);
  const r = await m.intenta(grande, P.recibir, { X: paraBea.id, ...(ayuda ? { locks: ayuda } : {}) }, 'bea');
  if (r.ok) await grande.anadir(r.evento);
  assert.equal(grande.saldo('bea', serie), 11, 'la vuelta de bea sigue pudiendo recibirse');
});

// ---------- Lo que aguanta en la segunda pasada ----------

test('aguanta (13), RP1: un enlace de ana que anota la clave buena del nivel 1 y claves suyas en el 2 y el 4 trae una prueba de nivel 2 y 4, pero no saca lo de carla; ni el enlace de la creadora con las mismas claves saca del fondo de ana, ni el de ana del de la creadora', async () => {
  const m = await mundo();
  const { grande, pequeno, claves, abre, serie } = m;
  const carla = await miembro(m, 'carla');
  await darE(m, 'carla', 3);
  await carla.lanza(grande, P.enviar, { X: abre.id, series: serie, quantity: 2, to: claves.bea.publica });
  const { enlace: deBea } = await enlaceDeCreadora(m);
  await carla.lanza(grande, P.enviar, { X: deBea.id, series: serie, quantity: 1, to: claves.bea.publica });
  const f2 = await generarClaves();
  const f4 = await generarClaves();
  const L2 = await otroEnlaceDeAna(m, [[1, claves.casaP.publica], [2, f2.publica], [4, f4.publica]]);
  const payload = ['send', [[grande.genesisId], [[m.forastera], [grande.genesisId + ':ana'], ['plato'], [m.menu.id]], [2], [claves.ana.publica]], ['x'], ['bea'], [P.enviar]];
  const falsa = await crearEvento({ autor: 'bea', sobre: m.cuelga.id, en: '4000000000', t: m.t(), movimientos: [quemaDelCoste('bea', payload, 'minuto', { eje: pequeno })], payload });
  const proof = (await selloEnCascada(falsa.id, { observador: f4, capas: [{ nivel: 2, grado: 0, claves: f2, libro: pequeno.genesisId }, { nivel: 4, grado: 2, red: 0, libro: pequeno.genesisId }] })).decupla;
  const tr = await m.traerCon(grande, pequeno, falsa, { link: L2.id, proof });
  assert.equal(tr.ok, true, 'se trae: el eslabón 0 (nivel 2) lo firma la clave que L2 anota para el 2');
  const x = await grande.anadir(tr.evento);
  assert.equal(bloqueosDeLaVuelta(grande, x.id), null);
  assert.match(await recibeAMano(m, x, saca(m, 'carla', abre.id, 2, 'ana'), { quien: 'ana', privada: claves.ana.privada, ternas: [['carla', abre.id, 2]] }), new RegExp(N.loEnviado), 'abre no anota (2, f2)');
  // Mismo libro, mismas claves, distinto autor: ni la creadora saca del fondo de ana, ni ana del de la creadora.
  const porBea = await grande.anadir((await vueltaFalsa(m, { cuanto: 1, para: claves.bea.publica, enlace: deBea })).evento);
  assert.match(await recibeAMano(m, porBea, saca(m, 'carla', abre.id, 1), { ternas: [['carla', abre.id, 1]] }), new RegExp(N.loEnviado));
  const porAna = await grande.anadir((await vueltaFalsa(m, { cuanto: 1, para: claves.bea.publica, enlace: abre })).evento);
  assert.match(await recibeAMano(m, porAna, saca(m, 'carla', deBea.id, 1), { ternas: [['carla', deBea.id, 1]] }), new RegExp(N.loEnviado));
  assert.deepEqual([grande.bloqueado('carla', serie, abre.id), grande.bloqueado('carla', serie, deBea.id)], [2, 1]);
});

test('aguanta (14), RP6: las ternas no sirven para sacar de otra serie, de un enlace de ana a otro libro (con las mismas claves), ni para colar una transferencia de carla con la terna de quien recibe', async () => {
  const m = await mundo();
  const { grande, claves, abre, serie, sala } = m;
  const carla = await miembro(m, 'carla');
  await darE(m, 'carla', 2);
  await carla.lanza(grande, P.enviar, { X: abre.id, series: serie, quantity: 2, to: claves.bea.publica });
  const postre = await m.lanza(grande, 'anchor here', { X: sala.id, title: 'postre', content: 'x' }, 'ana');
  await m.lanza(grande, 'issue E tied to X', { X: postre.id, denomination: 'postre', quantity: 2 }, 'ana');
  await m.lanza(grande, P.enviar, { X: abre.id, series: 'E:ana/postre@' + postre.id, quantity: 1, to: claves.bea.publica }, 'ana');
  const tercero = await Eje.genesis({ identidad: 'ana', foco: ['otro libro de ana'], t: m.t(), clave: claves.ana.publica, privada: claves.ana.privada });
  const alTercero = await m.lanza(grande, ENLACES.abrir, { X: sala.id, book: tercero.genesisId, 'line keys': [[1, claves.casaP.publica], [4, claves.sellador.publica]] }, 'ana');
  await m.lanza(grande, P.enviar, { X: alTercero.id, series: serie, quantity: 1, to: claves.bea.publica }, 'ana');
  const t = await grande.anadir((await vueltaFalsa(m, { cuanto: 1, para: claves.bea.publica, enlace: abre })).evento);
  const otraSerie = { denominacion: 'postre', registro: postre.id };
  const casos = {
    'una terna del fondo con el movimiento de otra serie': [[mov(m, { de: 'ana', a: 'bea', salida: abre.id, cantidad: 1, ...otraSerie }), mov(m, { de: 'bea', a: 'bea', estado: 'liberacion', salida: abre.id, cantidad: 1, ...otraSerie })], [['ana', abre.id, 1]]],
    'una terna de un enlace de ana a otro libro': [saca(m, 'ana', alTercero.id, 1), [['ana', alTercero.id, 1]]],
    'la terna de bea y una transferencia de carla que no dice': [[mov(m, { de: 'carla', a: 'bea', salida: abre.id, cantidad: 1 }), mov(m, { de: 'bea', a: 'bea', estado: 'liberacion', salida: abre.id, cantidad: 1 })], [['bea', abre.id, 1]]],
  };
  for (const [que, [movs, ternas]] of Object.entries(casos)) assert.match(await recibeAMano(m, t, movs, { ternas }), new RegExp(N.loEnviado), que);
  assert.deepEqual([grande.bloqueado('carla', serie, abre.id), grande.bloqueado('ana', 'E:ana/postre@' + postre.id, abre.id), grande.bloqueado('ana', serie, alTercero.id)], [2, 1, 1]);
});

test('aguanta (15), RP2: nada deja algo bloqueado con la salida en un enlace fuera de un envío (una transferencia fuera de un recibir, «commit time» con el enlace de plazo, una invitación a un nombre que es el id del enlace, quemar lo bloqueado); y lo legítimo sigue: enviar, recibir la ida y la vuelta, invitar, declarar', async () => {
  const m = await mundo();
  const { grande, claves, abre, serie, sala } = m;
  await enviaYRecibe(m, 3);
  assert.match(await aMano(grande, 'ana', claves.ana.privada, { sobre: sala.id, t: m.t(), payload: [['se lo paso a bea']], movimientos: [mov(m, { de: 'ana', a: 'bea', salida: abre.id, cantidad: 1 })] }), /only a send locks for another book/, 'una transferencia con la salida en el enlace fuera de un recibir');
  assert.ok(reglas(await m.intenta(grande, 'commit time', { X: sala.id, series: serie, amount: 1, until: abre.id }, 'ana')).includes('only a send locks for another book'), '«commit time» con el enlace como plazo');
  await assert.rejects(grande.invitar({ autor: 'ana', invitado: abre.id, clave: (await generarClaves()).publica, t: m.t(), privada: claves.ana.privada }), /only a send locks for another book/, 'una invitación a un nombre que es el id del enlace');
  assert.match(await aMano(grande, 'ana', claves.ana.privada, { sobre: sala.id, t: m.t(), payload: [['quemo']], movimientos: [mov(m, { de: 'ana', a: null, salida: abre.id, cantidad: 1 })] }), /salida/, 'quemar lo bloqueado para otro libro no es un movimiento');
  // Lo legítimo: la ida (arriba), la vuelta, una invitación normal, una declaración.
  const traida = await devuelve(m, 1);
  await m.lanza(grande, P.recibir, { X: traida.id }, 'bea');
  const carla = await miembro(m, 'carla');
  assert.ok(carla.k && grande.alta('carla') !== null, 'carla, invitada, entra');
  assert.equal((await m.intenta(grande, P.declarar, { X: grande.alta('bea').id, series: serie }, 'bea')).ok, true, 'bea declara lo que le volvió');
  assert.equal((await m.intenta(grande, P.declarar, { X: grande.alta('ana').id, series: serie }, 'ana')).ok, true, 'ana declara');
  assert.deepEqual([saldoDe(grande, 'ana', serie), saldoDe(grande, 'bea', serie)], [{ libre: 2, bloqueado: 2 }, { libre: 1, bloqueado: 0 }]);
});
