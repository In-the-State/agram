// El puente entre libros (encargo A15, tramo 3, paso 2; agram-equipo/DISENO_PUENTE.md §3, §4, §5 y §7 bis;
// docs/notas/PUENTE.md): traer un registro de otro libro con su prueba de sello, enviar E, recibirla (la serie forastera),
// devolverla (la vuelta) y declarar un saldo, entre dos libros enlazados (padre e hijo: ejemplos/puente.mjs), y la fila
// 8.9 de la época. Si están, los vectores de cascada de Core StateArk (stateark/sip/vectores/cascada, solo se leen).
// Ejes locales en memoria, identidades y claves de prueba generadas en cada ejecución: nada real.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Eje } from '../src/eje.js';
import * as A from '../src/acciones.js';
import { evaluar, Presupuesto } from '../src/bqlm.js';
import { ContextoEje } from '../src/contexto-eje.js';
import { EPOCA_0_BTML } from '../src/epocas.js';
import { esEmisorForastero } from '../src/tokens.js';
import { formulaDeSelloDelDato, decuplaDeSello } from '../src/sello.js';
import { generarClaves } from '../src/autoridad.js';
import { serializar, restaurar } from '../src/persistencia.js';
import { quemaDelCoste } from '../src/escritura.js';
import { PLANTILLAS_DEL_PUENTE as P, ENLACES, REGLAS_DEL_PUENTE as N, REQUISITO_DE_E, FORMULAS, ARCHIVO, formulaDeLaPrueba, piezasDelEslabon, registroComoDecupla, leerTraido } from '../datos/epocas/puente.mjs';
import { dosLibros, ejemploPuente, resumen, saldoDe } from '../ejemplos/puente.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
const CASCADA = join(AQUI, '..', '..', 'stateark', 'sip', 'vectores', 'cascada');
// Las reglas que rechazan una transacción, cada una por su veredicto (no por PENDIENTE ni por ERROR).
const reglas = (r) => {
  assert.equal(r.ok, false, 'se rechaza');
  for (const m of r.motivos) assert.doesNotMatch(String(m.mensaje), /PENDIENTE|ERROR/, m.mensaje);
  return r.motivos.map((m) => m.regla);
};

/** Los dos libros con el menú de ana (5 E atadas a él) en el grande. */
async function conMenu(opciones) {
  const m = await dosLibros(opciones);
  const menu = await m.lanza(m.grande, 'anchor here', { X: m.sala.id, title: 'menú', content: 'el menú del sábado' }, 'ana');
  await m.lanza(m.grande, 'issue E tied to X', { X: menu.id, denomination: 'plato', quantity: 5 }, 'ana');
  return { ...m, menu, serie: 'E:ana/plato@' + menu.id };
}

test('puente: la fila 8.9, las cuatro plantillas (su ancla y su aro), las fórmulas de puente.mjs y las piezas del eslabón, las de sello.js', () => {
  const ocho9 = EPOCA_0_BTML.registro[8][9];
  assert.equal(ocho9[0][0], 'bridge');
  assert.deepEqual(ocho9.slice(1), [['E'], [4], [[REQUISITO_DE_E]]], 'de nacimiento: solo E, nivel 4, y el requisito de E');
  const nombres = new Set(EPOCA_0_BTML.condiciones.map((r) => r[0][0]));
  for (const n of Object.values(N)) assert.ok(nombres.has(n), 'regla de la época: ' + n);
  const donde = Object.fromEntries(A.plantillasDeTransaccion().filter((p) => Object.values(P).includes(p.nombre)).map((p) => [p.nombre, [p.plantilla[5].join(' '), p.plantilla[8], p.plantilla[3][1][0]]]));
  assert.deepEqual(donde, {
    [P.traer]: ['9.8 =first before.5', [6, 5], 'person'],
    [P.enviar]: ['4', [4, 26], 'person'],
    [P.recibir]: ['4', [4, 27], 'person'],
    [P.declarar]: ['8', [8, 4], 'person'],
  });
  for (const [archivo, f] of Object.entries(FORMULAS)) assert.equal(JSON.parse(readFileSync(ARCHIVO(archivo), 'utf8'))[2].at(-1), f(), archivo + ': node datos/epocas/puente.mjs --escribir');
  // El eslabón de puente.mjs es, letra por letra, el de src/sello.js (el que usan «sealed», «firm» y el gobierno).
  const S = '(first (payload(ev)).1.1)';
  const { eslabon } = piezasDelEslabon(S, 'ev.6.5');
  const deSello = formulaDeSelloDelDato({ sello: S, hoja: 'ev.6.5', nivel: '4' });
  for (const k of [0, 1, 2, 3]) assert.ok(deSello.includes(eslabon(k)), 'eslabón ' + k);
  // La serie forastera: «<libro>:<emisor>».
  assert.equal(esEmisorForastero('ab'.repeat(32) + ':ana'), true);
  for (const x of ['ana', 'ab:ana', 'ab'.repeat(32) + ':a:b', 'AB'.repeat(32) + ':ana', 'ab'.repeat(32) + ':']) assert.equal(esEmisorForastero(x), false, x);
});

test('puente: el ejemplo entero (traer, enviar, recibir, devolver y declarar un saldo) y lo traído, leído', async () => {
  const e = await ejemploPuente();
  const r = resumen(e);
  assert.deepEqual(r['ana en el grande'], { libre: 3, bloqueado: 2 }, '5 emitidas, 3 enviadas, 1 de vuelta');
  assert.deepEqual(r['bea en el pequeño'], { libre: 2, bloqueado: 1 }, 'recibió 3 y devolvió 1, que queda bloqueado en el pequeño');
  assert.deepEqual(r['el saldo de bea, traído'], [[e.forastera], [3]]);
  const t = leerTraido(e.pequeno, e.menuTraido.id);
  assert.deepEqual([t.libro, t.id, t.autor, t.t, t.enlace, t.origen], [e.grande.genesisId, e.menu.id, 'ana', e.menu.t, e.cuelga.id, null], 'sin «anchor origin»: sin comprobar el origen');
  assert.deepEqual(t.payload, e.menu.payload, 'qué decía');
  assert.match(t.firme, /^\d{4}-\d\d-\d\dT/, 'cuándo quedó en firme: la hora de la cabecera de nivel 4');
  // La serie forastera: la misma serie, nombrada con el libro de origen, atada al menú traído.
  assert.equal(e.forastera, 'E:' + e.grande.genesisId + ':ana/plato@' + e.menuTraido.id);
  const mov = e.recibo.movimientos.find((m) => m.token === 'E');
  assert.deepEqual([mov.emisor, mov.denominacion, mov.registro, mov.cantidad, mov.de, mov.a], [e.grande.genesisId + ':ana', 'plato', e.menuTraido.id, 3, null, 'bea']);
  // Se comporta como cualquier serie de su familia: bea le pasa una a carla.
  const carla = await generarClaves();
  const inv = await e.pequeno.invitar({ autor: 'bea', invitado: 'carla', clave: carla.publica, t: e.t(), privada: e.claves.bea.privada });
  await e.pequeno.aceptar(inv, carla, { t: e.t() });
  const payload = ['bea le da un plato a carla'];
  await e.pequeno.escribir({ autor: 'bea', sobre: e.pequeno.alta('carla').id, t: e.t(), payload, movimientos: [quemaDelCoste('bea', payload, 'minuto', { eje: e.pequeno }), { token: 'E', emisor: e.grande.genesisId + ':ana', denominacion: 'plato', registro: e.menuTraido.id, cantidad: 1, de: 'bea', a: 'carla' }] }, e.claves.bea.privada).catch(async (x) => {
    // Escribir en el alta de carla pide la atención de su grupo: se escribe en la propia alta de bea.
    assert.match(x.message, /attention/);
    await e.pequeno.escribir({ autor: 'bea', sobre: e.pequeno.alta('bea').id, t: e.t(), payload, movimientos: [quemaDelCoste('bea', payload, 'minuto', { eje: e.pequeno }), { token: 'E', emisor: e.grande.genesisId + ':ana', denominacion: 'plato', registro: e.menuTraido.id, cantidad: 1, de: 'bea', a: 'carla' }] }, e.claves.bea.privada);
  });
  assert.deepEqual(saldoDe(e.pequeno, 'carla', e.forastera), { libre: 1, bloqueado: 0 });
});

test('puente: traer un registro bueno; con el cuerpo cambiado, con la prueba de otro registro o de otra línea, con nivel menor, de un libro sin enlace o sin claves, se rechaza con su motivo; y no dos veces', async () => {
  const m = await conMenu();
  const { grande, pequeno, menu, sala, claves } = m;
  const otro = await m.lanza(grande, 'anchor here', { X: sala.id, title: 'otro', content: 'otro registro' }, 'ana');
  const cambiado = registroComoDecupla(menu);
  cambiado[6] = [['otro menú'], ...menu.payload.slice(1)];
  assert.deepEqual(reglas(await m.traerCon(pequeno, grande, menu, { record: cambiado, proof: await m.sellar(grande, menu.id) })), [N.cuerpo], 'el cuerpo cambiado');
  assert.deepEqual(reglas(await m.traerCon(pequeno, grande, menu, { proof: await m.sellar(grande, otro.id) })), [N.prueba], 'la prueba de otro registro');
  const fuera = await generarClaves();
  assert.deepEqual(reglas(await m.traerCon(pequeno, grande, menu, { proof: await m.sellar(grande, menu.id, { nivel1: fuera, observador: await generarClaves() }) })), [N.prueba], 'otra línea: claves que el enlace no anota');
  assert.deepEqual(reglas(await m.traerCon(pequeno, grande, menu, { proof: await m.sellar(grande, menu.id, { libroDeCabecera: 'cd'.repeat(32) }) })), [N.prueba], 'otra línea: las mismas claves, las cabeceras de otro libro');
  assert.deepEqual(reglas(await m.traerCon(pequeno, grande, menu, { proof: await m.sellar(grande, menu.id, { arriba: 3 }) })), [N.prueba], 'nivel 3, menor que el 4 de epoch.8.9.2');
  // De un libro sin enlace: un registro de un tercer libro, por el enlace con el grande.
  const tercero = await Eje.genesis({ identidad: 'ana', foco: ['un tercero'], t: m.t(), clave: claves.ana.publica, privada: claves.ana.privada });
  const deTercero = tercero.obtener(tercero.genesisId);
  const conOtroLibro = await A.transaccion(pequeno, P.traer, { X: m.cuelga.id, book: tercero.genesisId, record: registroComoDecupla(menu), proof: await m.sellar(grande, menu.id, { libroDeCabecera: tercero.genesisId }) }, 'bea', { t: m.t(), firmar: (ev) => import('../src/autoridad.js').then((a) => a.firmar(ev, claves.bea.privada)) });
  assert.ok(reglas(conOtroLibro).includes(N.enlazado), 'el enlace nombra otro libro');
  assert.ok(deTercero);
  // Un enlace que no es del dueño del libro: bea... en el grande, ana es la dueña; un enlace de otra persona no vale.
  const carla = await generarClaves();
  const inv = await grande.invitar({ autor: 'ana', invitado: 'carla', clave: carla.publica, t: m.t(), privada: claves.ana.privada });
  await grande.aceptar(inv, carla, { t: m.t() });
  const firmaCarla = (ev) => import('../src/autoridad.js').then((a) => a.firmar(ev, carla.privada));
  const deCarla = await A.transaccion(grande, 'anchor here', { X: grande.alta('carla').id, title: 'lo de carla', content: 'x' }, 'carla', { t: m.t(), firmar: firmaCarla });
  await grande.anadir(deCarla.evento);
  const enlaceDeCarla = await A.transaccion(grande, ENLACES.abrir, { X: deCarla.evento.id, book: pequeno.genesisId, 'line keys': [[1, fuera.publica]] }, 'carla', { t: m.t(), firmar: firmaCarla });
  assert.equal(enlaceDeCarla.ok, true, JSON.stringify(enlaceDeCarla.motivos));
  await grande.anadir(enlaceDeCarla.evento);
  const nota = await m.lanza(pequeno, 'anchor here', { X: pequeno.genesisId, title: 'nota', content: 'una nota del pequeño' }, 'bea');
  const porCarla = await A.transaccion(grande, P.traer, { X: enlaceDeCarla.evento.id, record: registroComoDecupla(nota), proof: await m.sellar(pequeno, nota.id, { nivel1: fuera }) }, 'carla', { t: m.t(), firmar: firmaCarla });
  assert.ok(reglas(porCarla).includes(N.enlazado), 'el enlace de quien no es el dueño no vale para traer');
  // El bueno, y una vez.
  const bueno = await m.traer(pequeno, grande, menu);
  assert.equal(bueno.sobre, pequeno.genesisId);
  assert.equal(bueno.en, '9800000000');
  assert.deepEqual(reglas(await m.traerCon(pequeno, grande, menu, { proof: await m.sellar(grande, menu.id) })), [N.unaVez], 'dos veces');
  // Al rotar las claves (otro «this book hangs from» de bea, con otra clave de nivel 1 y el origen de la línea), vale el último.
  const nueva = await generarClaves();
  const rotado = await m.lanza(pequeno, ENLACES.cuelga, { X: pequeno.genesisId, book: grande.genesisId, element: sala.id, 'line keys': [[1, nueva.publica], [4, claves.sellador.publica]], 'anchor origin': 'ab'.repeat(32) + ':0' }, 'bea');
  assert.deepEqual(rotado.payload[1], [[grande.genesisId], [[1, nueva.publica], [4, claves.sellador.publica]], ['ab'.repeat(32) + ':0']]);
  const otroMas = await m.lanza(grande, 'anchor here', { X: sala.id, title: 'otro más', content: 'x' }, 'ana');
  assert.ok(reglas(await m.traerCon(pequeno, grande, otroMas, { link: m.cuelga.id, proof: await m.sellar(grande, otroMas.id) })).includes(N.enlazado), 'por el enlace de antes, no');
  const porElNuevo = await m.traer(pequeno, grande, otroMas, { link: rotado.id, proof: await m.sellar(grande, otroMas.id, { nivel1: nueva }) });
  assert.equal(leerTraido(pequeno, porElNuevo.id).origen, 'ab'.repeat(32) + ':0', 'el origen de la línea, anotado (sin comprobar contra Bitcoin)');
  assert.equal((await m.intenta(pequeno, ENLACES.cuelga, { X: pequeno.genesisId, book: grande.genesisId, element: sala.id, 'anchor origin': 'ab'.repeat(32) }, 'bea')).ok, false, 'un origen sin «:salida»');
});

test('puente: de un libro anotado sin claves de línea no se trae (no hay con qué comprobar sus cabeceras)', async () => {
  const m = await conMenu({ clavesDelGrande: false });
  assert.deepEqual(m.cuelga.payload[1], [[m.grande.genesisId], [0]], 'el enlace del pequeño, con 0: ninguna clave');
  const r = await m.traerCon(m.pequeno, m.grande, m.menu, { proof: await m.sellar(m.grande, m.menu.id) });
  assert.deepEqual(reglas(r), [N.conClaves, N.prueba]);
});

test('puente: enviar E y recibirla crea la serie forastera para quien se nombró; no dos veces ni para otro; una familia cerrada no se envía; sin su registro atado traído no se recibe', async () => {
  const m = await conMenu();
  const { grande, pequeno, abre, claves, menu, serie } = m;
  // Sin traer antes el menú: el envío se trae, pero no se recibe (el requisito de E).
  const envio = await m.lanza(grande, P.enviar, { X: abre.id, series: serie, quantity: 3, to: claves.bea.publica }, 'ana');
  assert.deepEqual(envio.payload[1], [[pequeno.genesisId], [[serie], ['E'], [grande.genesisId], ['ana'], ['plato'], [menu.id]], [3], [claves.bea.publica]]);
  assert.deepEqual(saldoDe(grande, 'ana', serie), { libre: 2, bloqueado: 3 }, 'bloqueadas con la salida en el enlace');
  assert.equal(grande.bloqueado('ana', serie, abre.id), 3);
  const envioTraido = await m.traer(pequeno, grande, envio);
  assert.deepEqual(reglas(await m.intenta(pequeno, P.recibir, { X: envioTraido.id }, 'bea')), [REQUISITO_DE_E]);
  // Con el menú traído, sí; para quien se nombró.
  const menuTraido = await m.traer(pequeno, grande, menu);
  assert.ok(A.acciones(pequeno, envioTraido.id, 4, 'bea').some((a) => a.nombre === P.recibir), 'se le ofrece a bea');
  const recibo = await m.lanza(pequeno, P.recibir, { X: envioTraido.id }, 'bea');
  const forastera = 'E:' + grande.genesisId + ':ana/plato@' + menuTraido.id;
  assert.deepEqual(saldoDe(pequeno, 'bea', forastera), { libre: 3, bloqueado: 0 });
  assert.equal(recibo.sobre, envioTraido.id);
  assert.deepEqual(reglas(await m.intenta(pequeno, P.recibir, { X: envioTraido.id }, 'bea')), [N.recibir], 'dos veces');
  // Otra persona del pequeño, sin la clave nombrada, no lo recibe.
  const carla = await generarClaves();
  const inv = await pequeno.invitar({ autor: 'bea', invitado: 'carla', clave: carla.publica, t: m.t(), privada: claves.bea.privada });
  await pequeno.aceptar(inv, carla, { t: m.t() });
  const envio2 = await m.lanza(grande, P.enviar, { X: abre.id, series: serie, quantity: 1, to: claves.bea.publica }, 'ana');
  const traido2 = await m.traer(pequeno, grande, envio2);
  assert.equal(A.acciones(pequeno, traido2.id, 4, 'carla').some((a) => a.nombre === P.recibir), false, 'no se le ofrece a carla');
  const firmaCarla = (ev) => import('../src/autoridad.js').then((a) => a.firmar(ev, carla.privada));
  assert.ok(reglas(await A.transaccion(pequeno, P.recibir, { X: traido2.id }, 'carla', { t: m.t(), firmar: firmaCarla })).includes(N.recibir), 'carla no es a quien va');
  // Nadie acuña la serie forastera fuera de un recibir.
  const payload = ['a mano'];
  await assert.rejects(pequeno.escribir({ autor: 'bea', sobre: pequeno.alta('bea').id, t: m.t(), payload, movimientos: [quemaDelCoste('bea', payload, 'minuto', { eje: pequeno }), { token: 'E', emisor: grande.genesisId + ':ana', denominacion: 'plato', registro: menuTraido.id, cantidad: 7, de: null, a: 'bea' }] }, claves.bea.privada), new RegExp(N.forastera));
  // Una familia cerrada (R, P o T) no se envía.
  for (const [familia, series] of [['R', 'R:ana'], ['P', 'P:' + menu.id + '/ana'], ['T', 'T:minuto']]) {
    const r = await m.intenta(grande, P.enviar, { X: abre.id, series, quantity: 1, to: claves.bea.publica }, 'ana');
    assert.ok(reglas(r).includes(N.familias), familia + ': ' + JSON.stringify(r.motivos.map((x) => x.regla)));
  }
});

test('puente: la vuelta suelta lo bloqueado y no más; lo bloqueado para el otro libro no se suelta dentro del origen; una vuelta de algo que no se envió no pasa', async () => {
  const e = await ejemploPuente();
  const { grande, pequeno, claves, serie, forastera, abre, cuelga, menu } = e;
  assert.deepEqual(saldoDe(grande, 'ana', serie), { libre: 3, bloqueado: 2 });
  assert.deepEqual(e.reciboDeVuelta.movimientos.filter((x) => x.token === 'E').map((x) => [x.estado, x.cantidad, x.salida]), [['liberacion', 1, abre.id]], 'no crea nada: suelta 1');
  // La misma vuelta no se recibe dos veces.
  assert.deepEqual(reglas(await e.intenta(grande, P.recibir, { X: e.vueltaTraida.id }, 'ana')), [N.recibir]);
  // Lo bloqueado para el pequeño no se suelta a mano en el grande, ni se pasa con esa salida.
  for (const [m, que] of [[{ estado: 'liberacion', de: 'ana', a: 'ana', salida: abre.id }, 'soltar'], [{ de: 'ana', a: 'ana', salida: abre.id, estado: 'liberacion', cantidad: 2 }, 'soltar todo']]) {
    const payload = ['a mano: ' + que];
    await assert.rejects(grande.escribir({ autor: 'ana', sobre: abre.id, en: '4000000000', t: e.t(), payload, movimientos: [quemaDelCoste('ana', payload, 'minuto', { eje: grande }), { token: 'E', emisor: 'ana', denominacion: 'plato', registro: menu.id, cantidad: 1, ...m }] }, claves.ana.privada), new RegExp(N.soloLaVuelta), que);
  }
  assert.deepEqual(saldoDe(grande, 'ana', serie), { libre: 3, bloqueado: 2 });
  // Una «vuelta» de algo que no se envió: bea envía como nacida en el grande una E suya del pequeño.
  const suya = await e.lanza(pequeno, 'anchor here', { X: pequeno.genesisId, title: 'lo de bea', content: 'x' }, 'bea');
  await e.lanza(pequeno, 'issue E tied to X', { X: suya.id, denomination: 'vale', quantity: 2 }, 'bea');
  const falsa = await e.intenta(pequeno, P.enviar, { X: cuelga.id, series: 'E:bea/vale@' + suya.id, quantity: 1, to: claves.ana.publica, 'born in': grande.genesisId, 'tied record': menu.id }, 'bea');
  assert.ok(reglas(falsa).includes(N.envio), 'no es una vuelta: la serie es de aquí');
  // Ni se devuelve más de lo que se envió: bea no tiene más de 2 libres de la forastera.
  const mas = await e.intenta(pequeno, P.enviar, { X: cuelga.id, series: forastera, quantity: 5, to: claves.ana.publica }, 'bea');
  assert.equal(mas.ok, false, 'no tiene 5');
  // La forastera no se envía a otro libro que el suyo: por el enlace del grande con el pequeño no hay otro; se mira la regla con otro destino.
  const otroDestino = await e.intenta(pequeno, P.enviar, { X: cuelga.id, series: forastera, quantity: 1, to: claves.ana.publica, book: 'cd'.repeat(32) }, 'bea');
  assert.ok(reglas(otroDestino).includes(N.envio));
});

test('puente: un saldo declarado verdadero entra y uno falso se rechaza; traído al otro libro es la prueba', async () => {
  const m = await conMenu();
  const { grande, pequeno, serie } = m;
  const alta = grande.alta('ana').id;
  assert.ok(A.acciones(grande, alta, 8, 'ana').some((a) => a.nombre === P.declarar), 'sobre su alta');
  assert.deepEqual(reglas(await m.intenta(grande, P.declarar, { X: alta, series: serie, quantity: 6 }, 'ana')), [N.saldo], 'tiene 5');
  const r = await m.lanza(grande, P.declarar, { X: alta, series: serie, quantity: 5 }, 'ana');
  assert.deepEqual(r.payload[1], [[serie], [5]]);
  assert.equal(r.movimientos.every((x) => x.token === 'T' && x.a === null), true, 'no bloquea nada');
  const menos = await m.lanza(grande, P.declarar, { X: alta, series: 'R:ana' }, 'ana');
  assert.equal(menos.payload[1][1][0], grande.saldo('ana', 'R:ana') + grande.bloqueado('ana', 'R:ana'), 'por defecto, lo que tiene: también de R');
  const traido = await m.traer(pequeno, grande, r);
  assert.deepEqual(leerTraido(pequeno, traido.id).payload[1], [[serie], [5]]);
});

test('puente: restaurar y reordenar dan lo mismo', async () => {
  const e = await ejemploPuente();
  const huella = (eje, quien, serie) => [eje.orden.length, saldoDe(eje, quien, serie)];
  for (const [eje, quien, serie] of [[e.grande, 'ana', e.serie], [e.pequeno, 'bea', e.forastera]]) {
    const restaurado = await restaurar(serializar(eje));
    assert.deepEqual(huella(restaurado, quien, serie), huella(eje, quien, serie));
    const otro = await Eje.desde(eje.orden.map((id) => eje.obtener(id)));
    const { rechazados } = await otro.reordenar([...eje.orden]);
    assert.deepEqual(rechazados, []);
    assert.deepEqual(huella(otro, quien, serie), huella(eje, quien, serie));
  }
});

/** Un libro de demostración con el enlace «open a private book here» de ana a `libro`, con esas claves: el contexto de la regla de la prueba. */
async function conEnlace(libro, claves) {
  const eje = await Eje.genesis({ demostracion: true, identidad: 'ana', t: '2026-11-17T09:00:00Z', foco: ['ana'] });
  const lanza = async (n, p, t) => { const r = await A.transaccion(eje, n, p, 'ana', { t }); assert.ok(r.ok, JSON.stringify(r.motivos)); return eje.anadir(r.evento); };
  const sala = await lanza('anchor here', { X: eje.genesisId, title: 'sala', content: 'x' }, '2026-11-17T09:01:00Z');
  const enlace = await lanza(ENLACES.abrir, { X: sala.id, book: libro, 'line keys': claves }, '2026-11-17T09:02:00Z');
  const prueba = (id, decupla) => {
    const ev = { autor: 'ana', t: '2026-11-17T09:03:00Z', movimientos: [], payload: [['traer'], [[libro], [[id]], decupla, [enlace.id]], ['x'], ['ana'], [P.traer]] };
    return evaluar(formulaDeLaPrueba(), new ContextoEje(eje, { ev, epoch: eje.epoca() }));
  };
  return { eje, prueba, enlace };
}

test('los vectores de cascada de StateArk: su prueba de un registro vale; las manipuladas, no', { skip: existsSync(join(CASCADA, 'prueba-cuatro-eslabones.json')) ? false : 'sin la carpeta de StateArk (fuera del repo): no se comprueban sus vectores' }, async () => {
  const leer = (f) => JSON.parse(readFileSync(join(CASCADA, f), 'utf8'));
  const dos = leer('prueba-de-un-registro.json');
  const pub = dos.claves_de_prueba.publicas;
  const { prueba } = await conEnlace(dos.libros.casa, [[1, pub.casa], [4, pub.stateark]]);
  const v = (r) => [r.estado, r.valor?.[0]];
  assert.deepEqual(v(prueba(dos.dos_eslabones.prueba.id, dos.dos_eslabones.decupla)), ['RESUELTO', true], 'dos eslabones: la casa [1] y StateArk [4]');
  const cuatro = leer('prueba-cuatro-eslabones.json');
  const c = cuatro.cuatro_eslabones;
  const p4 = cuatro.claves_de_prueba.publicas;
  const enlace4 = await conEnlace(cuatro.libros.casa, [[1, p4.casa], [4, p4.stateark]]);
  assert.deepEqual(v(enlace4.prueba(c.prueba.id, c.decupla)), ['RESUELTO', true], 'cuatro eslabones');
  // El coste con cuatro eslabones (el peor de hoy): ocupantes y bytes.
  const presupuesto = new Presupuesto();
  const ev = { autor: 'ana', t: '2026-11-17T09:03:00Z', movimientos: [], payload: [['traer'], [[cuatro.libros.casa], [[c.prueba.id]], c.decupla, [enlace4.enlace.id]], ['x'], ['ana'], [P.traer]] };
  evaluar(formulaDeLaPrueba(), new ContextoEje(enlace4.eje, { ev, epoch: enlace4.eje.epoca() }), { presupuesto });
  console.log('# coste de «a brought record comes with its proof» con cuatro eslabones (vector de StateArk): ' + presupuesto.usados + ' ocupantes, ' + presupuesto.bytes + ' bytes');
  for (const [que, mala] of Object.entries(c.manipuladas)) {
    const r = enlace4.prueba(c.prueba.id, decuplaDeSello(mala, mala.id));
    assert.notDeepEqual(v(r), ['RESUELTO', true], que);
  }
  // La de otra línea: la misma prueba con un enlace que no anota la clave de StateArk para el nivel 4.
  const sinArriba = await conEnlace(cuatro.libros.casa, [[1, p4.casa], [3, p4.stateark]]);
  assert.deepEqual(v(sinArriba.prueba(c.prueba.id, c.decupla)), ['RESUELTO', false]);
  // La de otro libro: la casa de la prueba de un registro no es la de los cuatro eslabones.
  const otroLibro = await conEnlace(dos.libros.casa, [[1, p4.casa], [4, p4.stateark]]);
  assert.deepEqual(v(otroLibro.prueba(c.prueba.id, c.decupla)), ['RESUELTO', false]);
});

test('puente: el coste de validar «bring a record from another book» (pasos, ocupantes, bytes y milisegundos)', async () => {
  const m = await conMenu();
  const proof = await m.sellar(m.grande, m.menu.id);
  const r = await m.traerCon(m.pequeno, m.grande, m.menu, { proof });
  assert.equal(r.ok, true, JSON.stringify(r.motivos));
  const ctx = () => new ContextoEje(m.pequeno, { ev: r.evento, epoch: m.pequeno.epoca() });
  const filas = [];
  for (const [archivo, f] of Object.entries(FORMULAS).slice(0, 5)) {
    const presupuesto = new Presupuesto();
    const x = evaluar(f(), ctx(), { presupuesto });
    assert.deepEqual([x.estado, x.valor?.[0]], ['RESUELTO', true], archivo);
    // Los pasos: el menor tope con que resuelve.
    let [lo, hi] = [1, 100000];
    while (lo < hi) { const mid = (lo + hi) >> 1; if (evaluar(f(), ctx(), { limites: { pasos: mid } }).estado === 'RESUELTO') hi = mid; else lo = mid + 1; }
    filas.push({ regla: archivo.replace('.json', ''), pasos: lo, ocupantes: presupuesto.usados, bytes: presupuesto.bytes });
  }
  const veces = 5;
  const t0 = performance.now();
  for (let k = 0; k < veces; k++) await m.pequeno.validar(r.evento);
  const ms = (performance.now() - t0) / veces;
  for (const f of filas) assert.ok(f.ocupantes < 10000 && f.bytes < 2000000 && f.pasos < 100000, JSON.stringify(f));
  console.log('# coste de «bring a record from another book» (dos eslabones):\n' + filas.map((f) => '#   ' + f.regla + ': ' + f.pasos + ' pasos, ' + f.ocupantes + ' ocupantes, ' + f.bytes + ' bytes').join('\n') + '\n#   validar el registro entero (todas las reglas): ' + ms.toFixed(1) + ' ms');
});
