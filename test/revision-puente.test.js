// Revisión de seguridad del PUENTE entre libros (tramo 3, paso 4; VG 17-11; encargo
// agram-equipo/encargos/encargo-revision-puente-y-canales.md, parte 1). Un agente distinto de los que lo construyeron intenta
// romperlo; no arregla nada. Un caso por hallazgo (los que fallan hoy llevan `todo` y su motivo) y un caso por lo que
// aguanta. PH1 a PH6 los arregla el encargo «arreglos del puente» (Core AGRAM 17-11): cada caso afirma lo arreglado y
// su motivo queda en un comentario. Ejes en memoria, identidades y claves de prueba generadas en cada ejecución
// (ejemplos/puente.mjs): nada real.
// El sellador de nivel 4 es el simulado de ejemplos/ikisai/sellos.mjs: firma el lote de hashes que se le da, como un
// sellador que no ve lo que hay dentro de las cabeceras de abajo.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Eje } from '../src/eje.js';
import * as A from '../src/acciones.js';
import * as V from '../src/versiones.js';
import { EPOCA_0_BTML } from '../src/epocas.js';
import { crearEvento, canonico } from '../src/evento.js';
import { esEmisorForastero, validarMovimiento } from '../src/tokens.js';
import { evaluar, Presupuesto } from '../src/bqlm.js';
import { ContextoEje } from '../src/contexto-eje.js';
import { generarClaves, firmar } from '../src/autoridad.js';
import { serializar, restaurar } from '../src/persistencia.js';
import { quemaDelCoste } from '../src/escritura.js';
import { PLANTILLAS_DEL_PUENTE as P, ENLACES, REGLAS_DEL_PUENTE as N, FORMULAS, RETIRAR_ENLACE, registroComoDecupla, leerTraido } from '../datos/epocas/puente.mjs';
import * as C from '../src/contrato.js';
import { selloEnCascada } from '../ejemplos/ikisai/sellos.mjs';
import { dosLibros, ejemploPuente, saldoDe } from '../ejemplos/puente.mjs';

const M0 = { ref: EPOCA_0_BTML.id };
const reglas = (r) => (r.ok ? [] : r.motivos.map((m) => m.regla));

/** Los dos libros con el menú de ana (5 E atadas a él) en el grande, y el menú ya traído al pequeño. */
async function conMenu() {
  const m = await dosLibros();
  const menu = await m.lanza(m.grande, 'anchor here', { X: m.sala.id, title: 'menú', content: 'el menú del sábado' }, 'ana');
  await m.lanza(m.grande, 'issue E tied to X', { X: menu.id, denomination: 'plato', quantity: 5 }, 'ana');
  const menuTraido = await m.traer(m.pequeno, m.grande, menu);
  return { ...m, menu, menuTraido, serie: 'E:ana/plato@' + menu.id, forastera: 'E:' + m.grande.genesisId + ':ana/plato@' + menuTraido.id };
}

/** Escribe a mano en `eje` pagando el coste de escribir: 'entra' o el mensaje del rechazo. */
const aMano = (eje, autor, privada, datos) => eje.escribir({ autor, ...datos, movimientos: [quemaDelCoste(autor, datos.payload, 'minuto', { eje }), ...(datos.movimientos ?? [])] }, privada).then(() => 'entra', (e) => e.message);

// ================================ HALLAZGOS ================================

// ---------- PH1 (crítico): la clave de nivel 1 que anota el enlace no se mira; basta el sellador de nivel 4 ----------

// Arreglado (encargo «arreglos del puente», PH1): HALLAZGO PH1 (crítico): «a brought record comes with its proof» solo comparaba con el enlace la clave del eslabón que llega a epoch.8.9.2 (nivel 4); los eslabones de abajo (el 0, el único cuyo «libro» se mira) valían con cualquier clave que se firmara a sí misma. Quien consiguiera que el sellador de nivel 4 sellara un hash fabricaba registros «del grande». Ahora el eslabón 0 lo firma la clave que el enlace anota para su nivel (sin ella no se trae), y cada eslabón intermedio, si el enlace anota clave para su nivel, esa clave
test('PH1: un envío que el grande nunca escribió, con la cabecera de nivel 1 firmada por una clave cualquiera y el sellador de nivel 4, no se trae ni se recibe: no salen 1000 E forasteras de la nada', async () => {
  const m = await conMenu();
  const { grande, pequeno, claves, abre, serie } = m;
  // La forma de un envío de verdad (1 E), para copiarla.
  const deVerdad = await m.lanza(grande, P.enviar, { X: abre.id, series: serie, quantity: 1, to: claves.bea.publica }, 'ana');
  const payload = JSON.parse(JSON.stringify(deVerdad.payload));
  payload[1][2] = [1000];
  // El registro falso: nunca entra en el grande y nadie lo firma.
  const falso = await crearEvento({ autor: 'ana', sobre: abre.id, en: '4000000000', t: '2026-11-17T12:00:00Z', movimientos: deVerdad.movimientos, payload });
  assert.equal(grande.obtener(falso.id), undefined, 'el grande no lo tiene');
  const intruso = await generarClaves();
  const proof = await m.sellar(grande, falso.id, { nivel1: intruso }); // nivel 1: el intruso; nivel 4: el sellador de siempre
  const traido = await m.traerCon(pequeno, grande, falso, { proof });
  assert.deepEqual(reglas(traido), [N.prueba], 'la primera cabecera no la firma la clave de nivel 1 que anota el enlace');
  assert.deepEqual(saldoDe(grande, 'ana', serie), { libre: 4, bloqueado: 1 }, 'en el grande solo se bloqueó 1');
  assert.deepEqual(saldoDe(pequeno, 'bea', m.forastera), { libre: 0, bloqueado: 0 }, 'en el pequeño no hay más forastera que la bloqueada en el grande');
});

test('aguanta (control de PH1): con la cabecera de nivel 1 de la casa del grande la prueba vale; con la de nivel 4 de otra clave, no', async () => {
  const m = await conMenu();
  const nota = await m.lanza(m.grande, 'anchor here', { X: m.sala.id, title: 'nota', content: 'x' }, 'ana');
  assert.deepEqual(reglas(await m.traerCon(m.pequeno, m.grande, nota, { proof: await m.sellar(m.grande, nota.id, { observador: await generarClaves() }) })), [N.prueba], 'nivel 4 con otra clave');
  assert.deepEqual(reglas(await m.traerCon(m.pequeno, m.grande, nota, { proof: await m.sellar(m.grande, nota.id) })), [], 'el bueno');
});

test('PH1: un registro de verdad se sigue trayendo con el enlace que anota la clave del nivel de su primera cabecera; con un enlace que solo anota la clave de arriba, no se trae', async () => {
  const m = await conMenu();
  const { grande, pequeno, claves, sala } = m;
  const nota = await m.lanza(grande, 'anchor here', { X: sala.id, title: 'nota', content: 'x' }, 'ana');
  assert.deepEqual(m.cuelga.payload[1][1], [[1, claves.casaG.publica], [4, claves.sellador.publica]], 'el enlace anota la clave del nivel 1 (la primera cabecera) y la de arriba');
  assert.deepEqual(reglas(await m.traerCon(pequeno, grande, nota, { proof: await m.sellar(grande, nota.id) })), [], 'se trae');
  // bea rota el enlace anotando solo la clave de arriba: la primera cabecera (nivel 1) no tiene con qué comprobarse.
  const soloArriba = await m.lanza(pequeno, ENLACES.cuelga, { X: pequeno.genesisId, book: grande.genesisId, element: sala.id, 'line keys': [[4, claves.sellador.publica]] }, 'bea');
  const otra = await m.lanza(grande, 'anchor here', { X: sala.id, title: 'otra', content: 'x' }, 'ana');
  assert.deepEqual(reglas(await m.traerCon(pequeno, grande, otra, { link: soloArriba.id, proof: await m.sellar(grande, otra.id) })), [N.conClaves, N.prueba], 'sin la clave del nivel de la primera cabecera, no');
});

test('PH1: un eslabón intermedio cuyo nivel anota el enlace lo firma esa clave; si el enlace no anota su nivel, cualquiera', async () => {
  const m = await conMenu();
  const { grande, pequeno, claves, sala } = m;
  const nota = await m.lanza(grande, 'anchor here', { X: sala.id, title: 'nota', content: 'x' }, 'ana');
  const media = await generarClaves();
  const sellar3 = (clave2) => selloEnCascada(nota.id, { observador: claves.sellador, capas: [{ nivel: 1, grado: 0, claves: claves.casaG, libro: grande.genesisId }, { nivel: 2, grado: 0, claves: clave2, libro: grande.genesisId }, { nivel: 4, grado: 2, red: 0, libro: grande.genesisId }] }).then((s) => s.decupla);
  assert.deepEqual(reglas(await m.traerCon(pequeno, grande, nota, { proof: await sellar3(media) })), [], 'nivel 2 sin clave anotada: vale');
  const conDos = await m.lanza(pequeno, ENLACES.cuelga, { X: pequeno.genesisId, book: grande.genesisId, element: sala.id, 'line keys': [[1, claves.casaG.publica], [2, media.publica], [4, claves.sellador.publica]] }, 'bea');
  assert.deepEqual(reglas(await m.traerCon(pequeno, grande, nota, { link: conDos.id, proof: await sellar3(media) })), [], 'nivel 2 anotado, con su clave: vale');
  assert.deepEqual(reglas(await m.traerCon(pequeno, grande, nota, { link: conDos.id, proof: await sellar3(await generarClaves()) })), [N.prueba], 'nivel 2 anotado, con otra clave: no');
});

// ---------- PH2 (alto): el saldo declarado cuenta lo bloqueado para otro libro ----------

// Arreglado (encargo «arreglos del puente», PH2): HALLAZGO PH2 (alto): «a declared balance is true» sumaba lo disponible y lo bloqueado, también lo bloqueado con la salida en un enlace: esas unidades ya viven en el otro libro como serie forastera y su tenedor las declara allí. Ahora no cuenta lo bloqueado con la salida en un enlace
test('PH2: tras enviar 3 E al pequeño (y recibir 1 de vuelta), ana no declara 5 en el grande ni bea 3 en el pequeño: lo declarado en los dos libros no pasa de 5', async () => {
  const e = await ejemploPuente();
  assert.deepEqual(saldoDe(e.grande, 'ana', e.serie), { libre: 3, bloqueado: 2 });
  assert.deepEqual(saldoDe(e.pequeno, 'bea', e.forastera), { libre: 2, bloqueado: 1 });
  const ana = await e.intenta(e.grande, P.declarar, { X: e.grande.alta('ana').id, series: e.serie, quantity: 5 }, 'ana');
  const bea = await e.intenta(e.pequeno, P.declarar, { X: e.pequeno.alta('bea').id, series: e.forastera, quantity: 3 }, 'bea');
  assert.deepEqual([reglas(ana), reglas(bea)], [[N.saldo], [N.saldo]]);
  // Por defecto, cada una declara lo suyo de aquí: ana 3, bea 2.
  const porDefecto = [];
  for (const [eje, quien, serie] of [[e.grande, 'ana', e.serie], [e.pequeno, 'bea', e.forastera]]) porDefecto.push(await e.intenta(eje, P.declarar, { X: eje.alta(quien).id, series: serie }, quien));
  assert.deepEqual(porDefecto.map((r) => r.ok && r.evento.payload[1][1][0]), [3, 2], 'lo declarado en los dos libros no pasa de las 5 que emitió ana');
});

// ---------- PH3 (medio): una declaración que no es verdad ni en su propio instante ----------

// Arreglado (encargo «arreglos del puente», PH3): HALLAZGO PH3 (medio): «a declared balance is true» miraba el saldo del libro de antes (first ev.3) y no los movimientos del propio registro. La quema de E ya la para «a declared balance is only that» (la salida con lo propio: solo quema T); lo que quedaba (la T, que el propio registro quema) lo cierra la regla: lo declarado no supera lo que queda de esa serie después de los movimientos del propio registro
test('PH3: ana declara 5 y en el mismo registro quema esas 5, o declara su T y la quema en su coste: no entra', async () => {
  const m = await conMenu();
  const { grande, claves, serie, menu } = m;
  const plantilla = await m.intenta(grande, P.declarar, { X: grande.alta('ana').id, series: serie, quantity: 5 }, 'ana');
  assert.equal(plantilla.ok, true, 'con la plantilla, verdad');
  const ev = plantilla.evento;
  const r = await grande.escribir({ autor: 'ana', sobre: ev.sobre, en: ev.en, t: m.t(), payload: ev.payload, movimientos: [...ev.movimientos, { token: 'E', emisor: 'ana', denominacion: 'plato', registro: menu.id, cantidad: 5, de: 'ana', a: null }] }, claves.ana.privada).then(() => 'entra', (x) => x.message);
  assert.match(r, /a declared balance is only that/, 'declara 5 y las quema en el mismo registro');
  // La T: lo que dice su cartera (A.1) de T:minuto, declarado a mano, en un registro que quema su coste en T:minuto.
  const tiene = grande.saldo('ana', 'T:minuto') + grande.bloqueado('ana', 'T:minuto');
  const payload = ['declare a balance: ana declares having ' + tiene + ' of T:minuto', [['T:minuto'], [tiene]], ['all announced movements happened'], ['ana'], ['declare a balance']];
  const t = await aMano(grande, 'ana', claves.ana.privada, { sobre: grande.alta('ana').id, en: '8000000000', t: m.t(), payload });
  assert.match(t, /a declared balance is true/, 'lo declarado supera lo que le queda de T después de quemar su coste');
});

// ---------- PH4 (medio): rotar las claves no retira el enlace viejo si el nuevo va en otro elemento o es del otro tipo ----------

// Arreglado (encargo «arreglos del puente», PH4): HALLAZGO PH4 (medio): «a record is brought from a linked book» solo anulaba un enlace con otro posterior del mismo autor, para el mismo libro, en el mismo elemento y del mismo tipo. Ahora el posterior se mira cruzando los dos tipos, en el mismo elemento y en el 9.5 del génesis, y quien escribió un enlace lo retira con «withdraw a link» colgado de él. Un enlace nuevo en otro elemento no retira el viejo (no se recorre el libro): al rotar en otro sitio, se retira el viejo
test('PH4: ana rota las claves del pequeño con un «open a private book here» en otra sala y retira el viejo; por el enlace viejo ya no se trae ni se envía, y el contrato no lo da por vigente', async () => {
  const m = await conMenu();
  const { grande, pequeno, claves, sala, abre, serie } = m;
  const sala2 = await m.lanza(grande, 'anchor here', { X: grande.genesisId, title: 'sala 2', content: 'x' }, 'ana');
  const nueva = await generarClaves();
  const nuevo = await m.lanza(grande, ENLACES.abrir, { X: sala2.id, book: pequeno.genesisId, 'line keys': [[1, nueva.publica], [4, claves.sellador.publica]] }, 'ana');
  const nota = await m.lanza(pequeno, 'anchor here', { X: pequeno.genesisId, title: 'nota', content: 'x' }, 'bea');
  // Límite sabido: sin retirarlo, un enlace en otro elemento no retira el viejo (no se recorre el libro entero).
  assert.deepEqual(reglas(await m.traerCon(grande, pequeno, nota, { link: abre.id, proof: await m.sellar(pequeno, nota.id) })), [], 'sin retirarlo, el viejo sigue valiendo');
  assert.equal(A.acciones(grande, abre.id, 4, 'bea').some((a) => a.nombre === RETIRAR_ENLACE), false, 'retirar solo se le ofrece al autor del enlace');
  assert.ok(A.acciones(grande, abre.id, 4, 'ana').some((a) => a.nombre === RETIRAR_ENLACE), 'a ana, sí');
  const retirada = await m.lanza(grande, RETIRAR_ENLACE, { X: abre.id }, 'ana');
  assert.equal(retirada.sobre, abre.id);
  assert.equal(A.acciones(grande, abre.id, 4, 'ana').some((a) => a.nombre === RETIRAR_ENLACE), false, 'una vez');
  assert.ok(reglas(await m.traerCon(grande, pequeno, nota, { link: abre.id, proof: await m.sellar(pequeno, nota.id) })).includes(N.enlazado), 'el enlace viejo ya no vale tras retirarlo');
  assert.deepEqual(reglas(await m.traerCon(grande, pequeno, nota, { link: nuevo.id, proof: await m.sellar(pequeno, nota.id, { nivel1: nueva }) })), [], 'el nuevo, sí');
  assert.ok(reglas(await m.intenta(grande, P.enviar, { X: abre.id, series: serie, quantity: 1, to: claves.bea.publica }, 'ana')).includes(N.envio), 'por un enlace retirado no se envía');
  assert.deepEqual(C.librosPrivados(grande, sala.id), [], 'el contrato no da por vigente un enlace retirado');
  assert.deepEqual(C.librosPrivados(grande, sala2.id).map((l) => l.id), [nuevo.id]);
  // La retirada que escribe otro (a mano, si hace falta) no cuenta.
  const carla = await generarClaves();
  const inv = await grande.invitar({ autor: 'ana', invitado: 'carla', clave: carla.publica, t: m.t(), privada: claves.ana.privada });
  await grande.aceptar(inv, carla, { t: m.t() });
  const deCarla = await aMano(grande, 'carla', carla.privada, { sobre: nuevo.id, en: '4000000000', t: m.t(), payload: [['withdrawn'], [nuevo.id], ['x'], ['carla'], [RETIRAR_ENLACE]] });
  assert.equal(deCarla, 'entra', 'carla puede colgar algo del enlace');
  assert.deepEqual(reglas(await m.traerCon(grande, pequeno, nota, { link: nuevo.id, proof: await m.sellar(pequeno, nota.id, { nivel1: nueva }) })), [], 'lo que cuelgue otro del enlace no lo retira');
  assert.deepEqual(C.librosPrivados(grande, sala2.id).map((l) => l.id), [nuevo.id]);
});

test('PH4: el posterior cruza los dos tipos: un «this book hangs from» del dueño en el 9.5 del génesis retira un «open a private book here» anterior, y un «open» en el 9.1 del génesis retira un «this book hangs from»', async () => {
  const m = await conMenu();
  const { grande, pequeno, claves, sala } = m;
  const nota = await m.lanza(pequeno, 'anchor here', { X: pequeno.genesisId, title: 'nota', content: 'x' }, 'bea');
  const nueva = await generarClaves();
  // En el grande: ana anota el pequeño con un «this book hangs from» (el otro tipo) en el 9.5 de su génesis.
  const cruzado = await m.lanza(grande, ENLACES.cuelga, { X: grande.genesisId, book: pequeno.genesisId, element: pequeno.genesisId, 'line keys': [[1, nueva.publica], [4, claves.sellador.publica]] }, 'ana');
  assert.ok(reglas(await m.traerCon(grande, pequeno, nota, { proof: await m.sellar(pequeno, nota.id) })).includes(N.enlazado), 'el «open» de la sala, anterior, ya no vale');
  assert.deepEqual(reglas(await m.traerCon(grande, pequeno, nota, { link: cruzado.id, proof: await m.sellar(pequeno, nota.id, { nivel1: nueva }) })), [], 'el nuevo, sí');
  assert.deepEqual(C.librosPrivados(grande, sala.id), [], 'y el contrato dice lo mismo');
  // En el pequeño: bea anota el grande con un «open a private book here» en el 9.1 de su génesis.
  const menu2 = await m.lanza(grande, 'anchor here', { X: sala.id, title: 'otro menú', content: 'x' }, 'ana');
  const abreEnGenesis = await m.lanza(pequeno, ENLACES.abrir, { X: pequeno.genesisId, book: grande.genesisId, 'line keys': [[1, nueva.publica], [4, claves.sellador.publica]] }, 'bea');
  assert.ok(reglas(await m.traerCon(pequeno, grande, menu2, { proof: await m.sellar(grande, menu2.id) })).includes(N.enlazado), 'el «this book hangs from», anterior, ya no vale');
  assert.deepEqual(reglas(await m.traerCon(pequeno, grande, menu2, { link: abreEnGenesis.id, proof: await m.sellar(grande, menu2.id, { nivel1: nueva }) })), [], 'el nuevo, sí');
  assert.equal(C.cuelgaDe(pequeno), null, 'el contrato tampoco lo da por vigente');
});

test('PH4: bea retira su «this book hangs from»: ya no se trae por él y contrato.cuelgaDe dice null', async () => {
  const m = await conMenu();
  assert.equal(C.cuelgaDe(m.pequeno)?.id, m.cuelga.id);
  await m.lanza(m.pequeno, RETIRAR_ENLACE, { X: m.cuelga.id }, 'bea');
  assert.ok(reglas(await m.traerCon(m.pequeno, m.grande, m.menu, { proof: await m.sellar(m.grande, m.menu.id) })).includes(N.enlazado));
  assert.equal(C.cuelgaDe(m.pequeno), null);
});

// ---------- PH5 (conocido): 8.9 no es pieza de gobierno ----------

// Arreglado (la salida con lo propio, VG 17-11): HALLAZGO PH5 (conocido): 8.9 no estaba entre las piezas de gobierno (7.9.7). Ahora epoch.8.9 está en 7.9.7: un cambio de 8.9 es de gobierno
test('PH5: un cambio «ordinary» que abre la familia R en 8.9.1, o baja a 1 o a 0 el nivel que pide traer (8.9.2), lo para el núcleo: 8.9 es pieza de gobierno', () => {
  const fila = (pos, valor) => Array.from({ length: 10 }, (_, i) => (i === 9 ? Array.from({ length: pos + 1 }, (_, j) => (j === pos ? valor : M0)) : M0));
  const casos = [['abre R', fila(1, ['E', 'R'])], ['nivel 1', fila(2, [1])], ['nivel 0', fila(2, [0])]].map(([titulo, ocho]) => {
    const raiz = [[titulo], M0, M0, M0, M0, M0, [['revisión'], ['hereda'], [EPOCA_0_BTML.id]], M0, ocho];
    return [titulo, V.comprobarCambio(EPOCA_0_BTML, { raiz, registros: [] }, 'ordinary').motivos];
  });
  assert.deepEqual(casos.filter(([, motivos]) => motivos.length === 0).map(([titulo]) => titulo), [], 'un cambio de 8.9 es de gobierno');
  for (const [titulo, motivos] of casos) assert.ok(motivos.some((x) => /epoch\.8\.9/.test(x) && /governance/.test(x)), titulo + ': ' + motivos.join('; '));
});

// ---------- PH6 (bajo): dos textos distintos dan el mismo id ----------

// Arreglado (encargo «arreglos del puente», PH6): HALLAZGO PH6 (bajo): «a brought record is its body» mete el contexto (1.1.7) y los movimientos (1.1.5) tal cual; un contexto con claves «en» y «movimientos» deja partir los mismos bytes de otra manera. Decidido por Core: la plantilla no cambia; ninguna regla lee el contexto ni los movimientos de lo traído (comprobado) y leerTraido lo lee «no fiable» si alguno de los dos no es el JSON canónico de un solo valor, sin enseñarlos
test('PH6: un registro cuyo contexto imita el cuerpo, traído partido de otra forma con el mismo id, se lee «no fiable» y no se enseña ni su contexto ni sus movimientos; traído entero, sí', async () => {
  const m = await dosLibros();
  const payload = [['nota con contexto']];
  const ev = await m.grande.escribir({ autor: 'ana', sobre: m.sala.id, t: m.t(), payload, movimientos: [quemaDelCoste('ana', payload, 'minuto', { eje: m.grande })], contexto: { a: 1, en: '7000000000', movimientos: [] } }, m.claves.ana.privada);
  assert.equal(ev.en, '0000000000');
  const texto = canonico(ev.contexto);
  const corte = texto.indexOf(',"en":');
  const otra = registroComoDecupla(ev);
  otra[7] = [texto.slice(0, corte)];
  otra[3] = ['7000000000'];
  otra[5] = ['[]},"en":' + JSON.stringify(ev.en) + ',"movimientos":' + canonico(ev.movimientos)];
  const partido = await m.traerCon(m.pequeno, m.grande, ev, { record: otra, proof: await m.sellar(m.grande, ev.id) });
  assert.deepEqual(reglas(partido), [], 'el mismo id: el cuerpo lo da por bueno (ninguna regla lee el contexto ni los movimientos)');
  const x = await m.pequeno.anadir(partido.evento);
  const leido = leerTraido(m.pequeno, x.id);
  assert.deepEqual([leido.fiable, leido.contexto, leido.movimientos], [false, null, null]);
  assert.match(leido.causa, /^no fiable: el contexto y los movimientos que trae no son el JSON canónico de un solo valor/);
  assert.deepEqual([leido.id, leido.autor, leido.payload], [ev.id, 'ana', payload], 'lo que pasa por json sí es lo del registro');
  // Traído entero (el grande trae del pequeño un registro con el mismo contexto), fiable.
  const pago = [['otra nota']];
  const deBea = await m.pequeno.escribir({ autor: 'bea', sobre: m.pequeno.genesisId, t: m.t(), payload: pago, movimientos: [quemaDelCoste('bea', pago, 'minuto', { eje: m.pequeno })], contexto: { a: 1, en: '7000000000', movimientos: [] } }, m.claves.bea.privada);
  const entero = await m.traer(m.grande, m.pequeno, deBea);
  const bien = leerTraido(m.grande, entero.id);
  assert.deepEqual([bien.fiable, bien.causa, bien.contexto, bien.movimientos], [true, null, deBea.contexto, deBea.movimientos]);
});

// ================================ LO QUE AGUANTA ================================

test('aguanta: el mismo registro no se trae dos veces, ni por el enlace nuevo tras rotar las claves (el viejo, en el mismo elemento, deja de valer)', async () => {
  const m = await conMenu();
  const { grande, pequeno, claves, sala, menu } = m;
  assert.deepEqual(reglas(await m.traerCon(pequeno, grande, menu, { proof: await m.sellar(grande, menu.id) })), [N.unaVez]);
  const nueva = await generarClaves();
  const rotado = await m.lanza(pequeno, ENLACES.cuelga, { X: pequeno.genesisId, book: grande.genesisId, element: sala.id, 'line keys': [[1, nueva.publica], [4, claves.sellador.publica]] }, 'bea');
  assert.deepEqual(reglas(await m.traerCon(pequeno, grande, menu, { link: rotado.id, proof: await m.sellar(grande, menu.id, { nivel1: nueva }) })), [N.unaVez], 'por el enlace nuevo, tampoco');
  const otro = await m.lanza(grande, 'anchor here', { X: sala.id, title: 'otro', content: 'x' }, 'ana');
  assert.ok(reglas(await m.traerCon(pequeno, grande, otro, { link: m.cuelga.id, proof: await m.sellar(grande, otro.id) })).includes(N.enlazado), 'el viejo no');
});

test('aguanta: un «receive» escrito a mano que acuña más, otra denominación, otro emisor, otro registro atado, para otro, o acuña además otra cosa, no entra', async () => {
  const m = await conMenu();
  const { grande, pequeno, claves, abre, serie, menuTraido } = m;
  const envio = await m.lanza(grande, P.enviar, { X: abre.id, series: serie, quantity: 3, to: claves.bea.publica }, 'ana');
  const traido = await m.traer(pequeno, grande, envio);
  const bueno = await m.intenta(pequeno, P.recibir, { X: traido.id }, 'bea');
  assert.equal(bueno.ok, true);
  const ev = bueno.evento;
  const acuna = ev.movimientos.find((x) => x.token === 'E');
  assert.deepEqual([acuna.emisor, acuna.denominacion, acuna.registro, acuna.cantidad, acuna.a], [grande.genesisId + ':ana', 'plato', menuTraido.id, 3, 'bea']);
  const otraNota = await m.lanza(pequeno, 'anchor here', { X: pequeno.genesisId, title: 'otra', content: 'x' }, 'bea');
  const casos = {
    'más de lo enviado': { cantidad: 1000 },
    'otra denominación': { denominacion: 'postre' },
    'otro emisor del grande': { emisor: grande.genesisId + ':bea' },
    'el emisor de otro libro': { emisor: 'cd'.repeat(32) + ':ana' },
    'otro registro atado': { registro: otraNota.id },
  };
  for (const [que, cambio] of Object.entries(casos)) {
    const movs = ev.movimientos.map((x) => (x.token === 'E' ? { ...x, ...cambio } : x));
    assert.notEqual(await pequeno.escribir({ autor: 'bea', sobre: ev.sobre, en: ev.en, t: m.t(), payload: ev.payload, movimientos: movs }, claves.bea.privada).then(() => 'entra', (x) => x.message), 'entra', que);
  }
  const doble = [...ev.movimientos, { ...acuna, cantidad: 1 }];
  assert.notEqual(await pequeno.escribir({ autor: 'bea', sobre: ev.sobre, en: ev.en, t: m.t(), payload: ev.payload, movimientos: doble }, claves.bea.privada).then(() => 'entra', (x) => x.message), 'entra', 'dos acuñaciones');
  assert.deepEqual(saldoDe(pequeno, 'bea', m.forastera), { libre: 0, bloqueado: 0 });
});

test('aguanta: nadie acuña a mano una serie forastera, ni nombrada con este mismo libro, ni con un emisor raro (espacios, mayúsculas, «@», NUL, «__proto__», 64 hex que no son un libro enlazado)', async () => {
  const m = await conMenu();
  const { grande, pequeno, claves, menu, menuTraido } = m;
  const hex = 'ab'.repeat(32);
  // La forma: esEmisorForastero admite cualquier cola sin «|», «:» ni «/»; validarMovimiento deja acuñar esas a otro.
  const tabla = Object.fromEntries([hex + ':ana bea', hex + ':ANA', hex + ':a@b', hex + ':\u0000', hex + ':__proto__', hex.toUpperCase() + ':ana', hex + ':a|b', hex + ':a/b', hex.slice(2) + ':ana', ' ' + hex + ':ana'].map((x) => [JSON.stringify(x.slice(60)), [esEmisorForastero(x), validarMovimiento({ token: 'E', emisor: x, denominacion: 'plato', cantidad: 1, de: null, a: 'bea' }).length === 0]]));
  assert.deepEqual(Object.values(tabla).map(([f, v]) => f === v), Object.values(tabla).map(() => true), 'el núcleo deja acuñar a otro justo las que tienen la forma forastera: ' + JSON.stringify(tabla));
  // Y la regla de la época las para todas fuera de un «receive».
  const intentos = [
    [pequeno, 'bea', claves.bea, grande.genesisId + ':ana', menuTraido.id, 'del grande, al pequeño'],
    [grande, 'ana', claves.ana, grande.genesisId + ':ana', menu.id, 'nombrada con el propio libro'],
    [pequeno, 'bea', claves.bea, hex + ':ana bea', menuTraido.id, 'con espacio'],
    [pequeno, 'bea', claves.bea, hex + ':a@b', menuTraido.id, 'con @'],
    [pequeno, 'bea', claves.bea, hex + ':\u0000', menuTraido.id, 'NUL'],
    [pequeno, 'bea', claves.bea, hex + ':__proto__', menuTraido.id, '__proto__'],
    [pequeno, 'bea', claves.bea, hex.toUpperCase() + ':ana', menuTraido.id, 'mayúsculas'],
  ];
  for (const [eje, quien, k, emisor, registro, que] of intentos) {
    const r = await aMano(eje, quien, k.privada, { sobre: eje.alta(quien).id, t: m.t(), payload: [['a mano: ' + que]], movimientos: [{ token: 'E', emisor, denominacion: 'plato', registro, cantidad: 7, de: null, a: quien }] });
    assert.notEqual(r, 'entra', que);
  }
  // Ni haciéndola pasar por un «receive» (el 4 lo dice) sin un envío traído debajo.
  const r = await aMano(pequeno, 'bea', claves.bea.privada, { sobre: menuTraido.id, en: '4000000000', t: m.t(), payload: [['falso recibo'], [[menuTraido.id]], ['x'], ['bea'], [P.recibir]], movimientos: [{ token: 'E', emisor: grande.genesisId + ':ana', denominacion: 'plato', registro: menuTraido.id, cantidad: 7, de: null, a: 'bea' }] });
  assert.notEqual(r, 'entra', 'un «receive» sobre algo que no es un envío');
});

test('aguanta: la vuelta que nombra a quien no bloqueó no suelta nada (y queda bloqueada para siempre en el pequeño: el límite sabido §9)', async () => {
  const e = await ejemploPuente();
  const { grande, pequeno, claves, forastera, cuelga, serie } = e;
  const carla = await generarClaves();
  const inv = await grande.invitar({ autor: 'ana', invitado: 'carla', clave: carla.publica, t: e.t(), privada: claves.ana.privada });
  await grande.aceptar(inv, carla, { t: e.t() });
  const vuelta = await e.lanza(pequeno, P.enviar, { X: cuelga.id, series: forastera, quantity: 1, to: carla.publica }, 'bea');
  const traida = await e.traer(grande, pequeno, vuelta);
  const r = await A.transaccion(grande, P.recibir, { X: traida.id }, 'carla', { t: e.t(), firmar: (ev) => firmar(ev, carla.privada) });
  assert.equal(r.ok, false, 'carla no tiene nada bloqueado que soltar');
  assert.equal(grande.saldo('carla', serie), 0);
  assert.deepEqual(saldoDe(grande, 'ana', serie), { libre: 3, bloqueado: 2 }, 'a ana tampoco se le suelta');
  assert.deepEqual(saldoDe(pequeno, 'bea', forastera), { libre: 1, bloqueado: 2 });
});

test('aguanta: lo que no se comprobó al construir: un payload de hojas sueltas en la raíz o con una referencia { ref } no se trae (límite sabido: no entra nada falso); una lista larga anidada y un registro firmado de un libro con claves, sí', async () => {
  const m = await dosLibros();
  const { grande, pequeno, claves } = m;
  const conRef = [['con referencia'], [{ ref: m.sala.id, dir: '0000000000' }]];
  const veredictos = {};
  for (const [que, payload] of [['hojas en la raíz', ['nota simple', 'x']], ['referencia', conRef], ['lista anidada', [['t'], ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l']]]]) {
    const ev = await grande.escribir({ autor: 'ana', sobre: m.sala.id, t: m.t(), payload, movimientos: [quemaDelCoste('ana', payload, 'minuto', { eje: grande })] }, claves.ana.privada);
    veredictos[que] = (await m.traerCon(pequeno, grande, ev, { proof: await m.sellar(grande, ev.id) })).ok;
  }
  assert.deepEqual(veredictos, { 'hojas en la raíz': false, referencia: false, 'lista anidada': true });
  const firmado = await m.lanza(grande, 'anchor here', { X: m.sala.id, title: 'firmado', content: 'x' }, 'ana');
  assert.equal(typeof firmado.firma, 'string', 'los libros del ejemplo no son de demostración: cada registro va firmado');
  const traido = await m.traer(pequeno, grande, firmado);
  assert.equal(leerTraido(pequeno, traido.id).autor, 'ana');
});

test('aguanta: dos copias del pequeño (restaurada, rehecha desde sus eventos hasta un punto y completada, reordenada) dan el mismo veredicto a lo traído, lo recibido y lo declarado', async () => {
  const e = await ejemploPuente();
  const huella = (eje) => [eje.orden.length, saldoDe(eje, 'bea', e.forastera), leerTraido(eje, e.menuTraido.id)?.id, leerTraido(eje, e.envioTraido.id)?.id];
  const esperada = huella(e.pequeno);
  assert.deepEqual(huella(await restaurar(serializar(e.pequeno))), esperada, 'restaurada');
  const corte = e.pequeno.orden.indexOf(e.menuTraido.id);
  const hasta = await Eje.desde(e.pequeno.orden.slice(0, corte).map((id) => e.pequeno.obtener(id)));
  for (const id of e.pequeno.orden.slice(corte)) await hasta.anadir(e.pequeno.obtener(id));
  assert.deepEqual(huella(hasta), esperada, 'copiada hasta antes del primer «bring» y completada');
  const { rechazados } = await hasta.reordenar([...e.pequeno.orden]);
  assert.deepEqual(rechazados, []);
  assert.deepEqual(huella(hasta), esperada, 'reordenada');
});

test('aguanta, con su coste: traer un registro grande tiene tope (2 000 000 bytes por evaluación), pero el tope se mira después de procesar; doscientos registros en el elemento del enlace no encarecen «a record is brought from a linked book»', async () => {
  const m = await dosLibros();
  const { grande, pequeno, claves } = m;
  const filas = [];
  for (const kb of [10, 100, 500]) {
    const trozo = 'x'.repeat(kb * 100);
    const payload = [['grande ' + kb], ...Array.from({ length: 9 }, () => Array.from({ length: 10 }, () => trozo))];
    const ev = await grande.escribir({ autor: 'ana', sobre: m.sala.id, t: m.t(), payload, movimientos: [quemaDelCoste('ana', payload, 'minuto', { eje: grande })] }, claves.ana.privada);
    const t0 = performance.now();
    const r = await m.traerCon(pequeno, grande, ev, { proof: await m.sellar(grande, ev.id) });
    const ms = performance.now() - t0;
    const presupuesto = new Presupuesto();
    const ev2 = (await A.transaccion(pequeno, P.traer, { X: m.cuelga.id, record: registroComoDecupla(ev), proof: await m.sellar(grande, ev.id) }, 'bea', { t: m.t(), firmar: (x) => firmar(x, claves.bea.privada) })).evento;
    const x = evaluar(FORMULAS['a-brought-record-is-its-body.json'](), new ContextoEje(pequeno, { ev: ev2, epoch: pequeno.epoca() }), { presupuesto });
    filas.push({ payload: JSON.stringify(payload).length, entra: r.ok, estado: x.estado, bytes: presupuesto.bytes, ms: Math.round(ms) });
  }
  console.log('# coste de traer un registro grande (bytes del payload → bytes procesados por «a brought record is its body»):\n' + filas.map((f) => '#   ' + f.payload + ' → ' + f.bytes + ' (' + f.estado + ', ' + (f.entra ? 'entra' : 'no entra') + ', ' + f.ms + ' ms la transacción entera)').join('\n'));
  assert.equal(filas[0].entra, true, '90 KB de payload se traen');
  assert.ok(filas.slice(1).every((f) => !f.entra && f.estado === 'PENDIENTE'), 'por encima, el límite de cálculo lo para');
  assert.ok(filas[2].bytes > 2000000 * 5, 'pero el tope se cuenta después de procesar: ' + filas[2].bytes + ' bytes antes de parar');
  // Muchos registros en el elemento del enlace (lo que mira «posterior»): el coste no crece.
  const nota = await m.lanza(pequeno, 'anchor here', { X: pequeno.genesisId, title: 'nota', content: 'x' }, 'bea');
  const proof = await m.sellar(pequeno, nota.id);
  const medir = async () => {
    const r = await m.traerCon(grande, pequeno, nota, { proof });
    const presupuesto = new Presupuesto();
    evaluar(FORMULAS['a-record-is-brought-from-a-linked-book.json'](), new ContextoEje(grande, { ev: r.evento, epoch: grande.epoca() }), { presupuesto });
    return [r.ok, presupuesto.usados];
  };
  const antes = await medir();
  for (let k = 0; k < 200; k++) {
    const payload = [['ruido ' + k]];
    await grande.escribir({ autor: 'ana', sobre: m.sala.id, en: '9100000000', t: m.t(), payload, movimientos: [quemaDelCoste('ana', payload, 'minuto', { eje: grande })] }, claves.ana.privada);
  }
  assert.deepEqual(await medir(), antes, '200 registros más junto al enlace: ' + JSON.stringify(antes));
});
