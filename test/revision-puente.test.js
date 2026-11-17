// Revisión de seguridad del PUENTE entre libros (tramo 3, paso 4; VG 17-11; encargo
// agram-equipo/encargos/encargo-revision-puente-y-canales.md, parte 1). Un agente distinto de los que lo construyeron intenta
// romperlo; no arregla nada. Un caso por hallazgo (los que fallan hoy llevan `todo` y su motivo) y un caso por lo que
// aguanta. Ejes en memoria, identidades y claves de prueba generadas en cada ejecución (ejemplos/puente.mjs): nada real.
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
import { PLANTILLAS_DEL_PUENTE as P, ENLACES, REGLAS_DEL_PUENTE as N, FORMULAS, registroComoDecupla, leerTraido } from '../datos/epocas/puente.mjs';
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

test('PH1: un envío que el grande nunca escribió, con la cabecera de nivel 1 firmada por una clave cualquiera y el sellador de nivel 4, se trae y se recibe: 1000 E forasteras de la nada', {
  todo: 'HALLAZGO PH1 (crítico): «a brought record comes with its proof» solo compara con el enlace la clave del eslabón que llega a epoch.8.9.2 (nivel 4); los eslabones de abajo (el 0, que es el único cuyo «libro» se mira) valen con cualquier clave que se firme a sí misma. Quien consiga que el sellador de nivel 4 selle un hash (el sellador no ve dentro de la cabecera de abajo) fabrica registros «del grande»: aquí, un envío de 1000 E a bea que ana no escribió, no firmó ni bloqueó. Arreglo mínimo: exigir que cada eslabón por debajo de j (al menos el 0) lo firme la clave que el enlace anota para su nivel (claveEnNivel en todos los eslabones, como pedía el diseño §4.1)',
}, async () => {
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
  if (traido.ok) {
    const x = await pequeno.anadir(traido.evento);
    const recibo = await m.intenta(pequeno, P.recibir, { X: x.id }, 'bea');
    if (recibo.ok) await pequeno.anadir(recibo.evento);
  }
  assert.deepEqual(saldoDe(grande, 'ana', serie), { libre: 4, bloqueado: 1 }, 'en el grande solo se bloqueó 1');
  assert.deepEqual(saldoDe(pequeno, 'bea', m.forastera), { libre: 0, bloqueado: 0 }, 'en el pequeño no hay más forastera que la bloqueada en el grande');
});

test('aguanta (control de PH1): con la cabecera de nivel 1 de la casa del grande la prueba vale; con la de nivel 4 de otra clave, no', async () => {
  const m = await conMenu();
  const nota = await m.lanza(m.grande, 'anchor here', { X: m.sala.id, title: 'nota', content: 'x' }, 'ana');
  assert.deepEqual(reglas(await m.traerCon(m.pequeno, m.grande, nota, { proof: await m.sellar(m.grande, nota.id, { observador: await generarClaves() }) })), [N.prueba], 'nivel 4 con otra clave');
  assert.deepEqual(reglas(await m.traerCon(m.pequeno, m.grande, nota, { proof: await m.sellar(m.grande, nota.id) })), [], 'el bueno');
});

// ---------- PH2 (alto): el saldo declarado cuenta lo bloqueado para otro libro ----------

test('PH2: tras enviar 3 E al pequeño (y recibir 1 de vuelta), ana declara 5 en el grande y bea 3 en el pequeño: 8 declaradas de 5 que existen', {
  todo: 'HALLAZGO PH2 (alto): «a declared balance is true» suma lo disponible y lo bloqueado (A.1.serie y su .2), también lo bloqueado con la salida en un enlace: esas unidades ya viven en el otro libro como serie forastera y su tenedor las declara allí. Y bea cuenta además la que tiene bloqueada para volver, que el grande ya soltó a ana. La misma unidad se prueba en dos libros. Arreglo mínimo: no sumar lo bloqueado con la salida en un enlace (o declarar solo lo disponible)',
}, async () => {
  const e = await ejemploPuente();
  assert.deepEqual(saldoDe(e.grande, 'ana', e.serie), { libre: 3, bloqueado: 2 });
  assert.deepEqual(saldoDe(e.pequeno, 'bea', e.forastera), { libre: 2, bloqueado: 1 });
  const ana = await e.intenta(e.grande, P.declarar, { X: e.grande.alta('ana').id, series: e.serie, quantity: 5 }, 'ana');
  const bea = await e.intenta(e.pequeno, P.declarar, { X: e.pequeno.alta('bea').id, series: e.forastera, quantity: 3 }, 'bea');
  const declarado = (ana.ok ? 5 : 3) + (bea.ok ? 3 : 2);
  assert.equal(declarado, 5, 'lo declarado en los dos libros no pasa de las 5 que emitió ana');
});

// ---------- PH3 (medio): una declaración que no es verdad ni en su propio instante ----------

test('PH3: ana declara 5 y en el mismo registro quema esas 5: la declaración entra y ya no tiene nada', {
  todo: 'HALLAZGO PH3 (medio): «a declared balance is true» mira el saldo del libro de antes (first ev.3) y no los movimientos del propio registro; a mano, un «declare a balance» que además quema, transfiere o bloquea la serie declara lo que deja de tener en ese mismo instante. Arreglo mínimo: que la regla pida que el registro no mueva la serie declarada (o restarle lo que el propio registro saca)',
}, async () => {
  const m = await conMenu();
  const { grande, claves, serie, menu } = m;
  const plantilla = await m.intenta(grande, P.declarar, { X: grande.alta('ana').id, series: serie, quantity: 5 }, 'ana');
  assert.equal(plantilla.ok, true, 'con la plantilla, verdad');
  const ev = plantilla.evento;
  const r = await grande.escribir({ autor: 'ana', sobre: ev.sobre, en: ev.en, t: m.t(), payload: ev.payload, movimientos: [...ev.movimientos, { token: 'E', emisor: 'ana', denominacion: 'plato', registro: menu.id, cantidad: 5, de: 'ana', a: null }] }, claves.ana.privada).then(() => 'entra', (x) => x.message);
  assert.notEqual(r, 'entra', 'declara 5 y las quema en el mismo registro');
});

// ---------- PH4 (medio): rotar las claves no retira el enlace viejo si el nuevo va en otro elemento o es del otro tipo ----------

test('PH4: ana rota las claves del pequeño con un «open a private book here» en otra sala; por el enlace viejo se sigue trayendo con las claves viejas', {
  todo: 'HALLAZGO PH4 (medio): «a record is brought from a linked book» solo anula un enlace con otro posterior del mismo autor, para el mismo libro y EN EL MISMO ELEMENTO (y un «this book hangs from» solo con otro del mismo tipo); contrato.librosPrivados dice «vale el último» del libro entero. Si una clave de línea se pierde y el dueño rota escribiendo el enlace en otro sitio, la vieja sigue valiendo para traer. Arreglo mínimo: el «posterior» por libro (todos los enlaces del dueño a ese libro, de los dos tipos), no por elemento',
}, async () => {
  const m = await dosLibros();
  const { grande, pequeno, claves } = m;
  const sala2 = await m.lanza(grande, 'anchor here', { X: grande.genesisId, title: 'sala 2', content: 'x' }, 'ana');
  const nueva = await generarClaves();
  await m.lanza(grande, ENLACES.abrir, { X: sala2.id, book: pequeno.genesisId, 'line keys': [[1, nueva.publica], [4, claves.sellador.publica]] }, 'ana');
  const nota = await m.lanza(pequeno, 'anchor here', { X: pequeno.genesisId, title: 'nota', content: 'x' }, 'bea');
  const r = await m.traerCon(grande, pequeno, nota, { link: m.abre.id, proof: await m.sellar(pequeno, nota.id) });
  assert.ok(reglas(r).includes(N.enlazado), 'el enlace viejo ya no vale tras rotar');
});

// ---------- PH5 (conocido): 8.9 no es pieza de gobierno ----------

test('PH5: un cambio «ordinary» abre la familia R en 8.9.1, o baja a 1 o a 0 el nivel que pide traer (8.9.2), y el núcleo no lo para', {
  todo: 'HALLAZGO PH5 (conocido, decidido por VG; lo construye otro agente): 8.9 no está entre las piezas de gobierno (7.9.7) ni en el suelo (7.9.6): con el umbral corriente se abre una familia que no tiene sus requisitos en 8.9.3, o se baja el nivel de firmeza del puente a 1 o a 0 (basta la cabecera de la casa del otro libro, sin Bitcoin). Arreglo: añadir 8.9 a 7.9.7',
}, () => {
  const fila = (pos, valor) => Array.from({ length: 10 }, (_, i) => (i === 9 ? Array.from({ length: pos + 1 }, (_, j) => (j === pos ? valor : M0)) : M0));
  const pasan = [['abre R', fila(1, ['E', 'R'])], ['nivel 1', fila(2, [1])], ['nivel 0', fila(2, [0])]].filter(([titulo, ocho]) => {
    const raiz = [[titulo], M0, M0, M0, M0, M0, [['revisión'], ['hereda'], [EPOCA_0_BTML.id]], M0, ocho];
    return V.comprobarCambio(EPOCA_0_BTML, { raiz, registros: [] }, 'ordinary').motivos.length === 0;
  }).map(([titulo]) => titulo);
  assert.deepEqual(pasan, [], 'un cambio de 8.9 es de gobierno');
});

// ---------- PH6 (bajo): dos textos distintos dan el mismo id ----------

test('PH6: un registro cuyo contexto imita el cuerpo se trae partido de otra forma (otro «en», otro contexto, otros movimientos) con el mismo id', {
  todo: 'HALLAZGO PH6 (bajo): «a brought record is its body» mete el contexto (1.1.7) y los movimientos (1.1.5) tal cual (utf8 de un texto, sin json ni comprobar que sean JSON); un contexto con claves «en» y «movimientos» deja partir los mismos bytes de otra manera. El id, el autor, el «sobre», el t y el payload no se pueden cambiar así (el payload pasa por json y va detrás), así que hoy nadie lee nada falso; pero el «en», el contexto y los movimientos traídos pueden no ser los del registro, y el primero que lo trae decide cuáles quedan («a record is brought once»). Arreglo mínimo: traer contexto y movimientos como décupla y rehacerlos con json, o comprobar que su texto es su JSON canónico',
}, async () => {
  const m = await dosLibros();
  const payload = [['nota con contexto']];
  const ev = await m.grande.escribir({ autor: 'ana', sobre: m.sala.id, t: m.t(), payload, movimientos: [quemaDelCoste('ana', payload, 'minuto', { eje: m.grande })], contexto: { a: 1, en: '7000000000', movimientos: [] } }, m.claves.ana.privada);
  assert.equal(ev.en, '0000000000');
  const C = canonico(ev.contexto);
  const corte = C.indexOf(',"en":');
  const otra = registroComoDecupla(ev);
  otra[7] = [C.slice(0, corte)];
  otra[3] = ['7000000000'];
  otra[5] = ['[]},"en":' + JSON.stringify(ev.en) + ',"movimientos":' + canonico(ev.movimientos)];
  const r = await m.traerCon(m.pequeno, m.grande, ev, { record: otra, proof: await m.sellar(m.grande, ev.id) });
  assert.ok(reglas(r).includes(N.cuerpo), 'un cuerpo partido de otra forma no es el del registro');
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
