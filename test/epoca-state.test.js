// La época de la clase `state` (encargo «época del nodo», VG 16-11, #124): la fuente en datos/epocas/state/, heredada
// de la época 0 definitiva, y el eje de ejemplo de un nodo (ejemplos/state/nodo.mjs). Docs: docs/EPOCA_STATE.md.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { generar, archivos, epocaState } from '../datos/epocas/state/generar.mjs';
import { EPOCA_0_BTML, cargarEpocaEscrita } from '../src/epocas.js';
import { Eje } from '../src/eje.js';
import * as A from '../src/acciones.js';
import * as contrato from '../src/contrato.js';
import { cerrado } from '../src/motor.js';
import { ContextoEje } from '../src/contexto-eje.js';
import { evaluar, leerRegla } from '../src/bqlm.js';
import { firmar } from '../src/autoridad.js';
import { sinTraducir } from '../docs/sin-traducir.mjs';
import { ejemploNodo, N, CLAVES, hora, claveDePrueba, HUELLA } from '../ejemplos/state/nodo.mjs';
import { ejemploCompra } from '../ejemplos/ikisai/compra-food.mjs';
import { escribirPagando, pagaElCoste } from '../ejemplos/ikisai/coste.mjs';

/** El id de la época 0 definitiva (no cambia con esta época). */
const ID_DE_LA_0 = '1922ce415e6fc832ec9c11061434ab73fba5836f0fb105ac665b021b28c97768';
const CAMINO = ['register the node', 'register the authority', 'register the relay', 'register the archive', 'declare a context', 'put in service'];
const PAPELES = ['authority', 'container', 'relay', 'gate', 'archive', 'deployment', 'worker', 'agent', 'context', 'served ledger'];

let completo = null;
/** El eje de ejemplo entero (se construye una vez; las pruebas que escriben construyen el suyo). */
const ejemplo = () => (completo ??= ejemploNodo());
const leer = (eje, formula, sujeto) => evaluar(formula, new ContextoEje(eje, { epoch: eje.epoca() }), { sujeto });
const estacion = (eje, id) => A.ejecuciones(eje, eje.obtener(id).sobre).find((x) => x.ocupante.ref === id)?.estacion ?? null;
const HECHA = 'count (first it2.6).8.7 = count (first it2.6).8.8 and not (it2 in (first it.4).8)';
/** Una lectura con nombre de la época (una regla con «read» en su 4 y su 3 en X), sobre un registro: sus valores. */
const lectura = (eje, nombre, id) => {
  const regla = eje.epoca().lecturas.find((r) => r[0][0] === nombre);
  assert.ok(regla, 'la época tiene la lectura «' + nombre + '»');
  const r = leerRegla(regla, id, new ContextoEje(eje, { epoch: eje.epoca() }));
  assert.equal(r.estado, 'RESUELTO', r.motivo);
  return r.valor;
};
const idDe = (x) => x?.id ?? x;
// Lo de cada conexión, con it = su alta (docs/EPOCA_STATE.md §6).
const DE_LA_CONEXION = {
  clave: '(payload(first (up it))).3.5',
  reles: '(payload(last ((down it) where last (first it2.6).5 = "1300000000" and first it2.3 = first it.3 and "declare my relays" in (payload(it2)).4))).1',
  grupo: 'it.6.3',
  precio: 'it.6.2',
  r: 'sum (((first it.3).1 where R in it2.0.0.0 and it2.0.0.1 = first (first (up it)).3) each 1)',
};

test('la época se genera desde su fuente, sin fallos, y los archivos están al día', () => {
  const g = generar();
  assert.equal(g.fallos, 0, g.informe.join('\n'));
  for (const [ruta, texto] of Object.entries(archivos(g))) assert.equal(readFileSync(ruta, 'utf8'), texto, `${ruta} no está al día: npm run epoca:state`);
  assert.equal(g.registros.length, 61, '21 reglas (10 de ellas lecturas con nombre) y 40 plantillas de transacción');
  const ids = JSON.parse(readFileSync('datos/epocas/state/state-0.ids.json', 'utf8'));
  assert.equal(ids.registrosAlPublicar, 63, 'el génesis, la raíz y sus 61 registros');
});

test('hereda de la época 0 definitiva, que no cambia, y la carga el núcleo; src/ no la importa', () => {
  assert.equal(EPOCA_0_BTML.id, ID_DE_LA_0, 'la época 0 sigue siendo la definitiva');
  const g = generar();
  assert.equal(g.hereda, ID_DE_LA_0);
  assert.deepEqual(g.raiz[6][1], ['hereda']);
  assert.deepEqual(g.raiz[6][2], [ID_DE_LA_0]);
  const e = cargarEpocaEscrita(epocaState());
  assert.equal(e.id, g.id);
  assert.equal(e.hereda, ID_DE_LA_0);
  assert.equal(e.transacciones.length, EPOCA_0_BTML.transacciones.length + 40);
  assert.equal(e.reglasConId.length, EPOCA_0_BTML.reglasConId.length + 17, 'cuatro reglas sustituyen a las de la 0 con el mismo nombre (second factor y las tres de la atención) y se añaden siete reglas y diez lecturas con nombre');
  for (const n of ['anchors asked', 'current connections', 'conversations', 'conversation title', 'conversation archived', 'messages of', 'message count', 'last message', 'delivery', 'messages to deliver']) assert.ok(e.lecturas.some((r) => r[0][0] === n), n);
  for (const n of ['add a connection', "change a connection's permissions", 'remove a connection']) assert.ok(!e.transacciones.some((x) => x.plantilla[0][0] === n), 'fuera: ' + n);
  for (const n of ['second factor', 'attention has a price', 'attention group', 'attention price']) assert.notEqual(e.reglasConId.find((x) => x.regla[0][0] === n).id, EPOCA_0_BTML.reglasConId.find((x) => x.regla[0][0] === n).id);
  const fuentes = readdirSync('src').filter((f) => f.endsWith('.js')).map((f) => readFileSync(join('src', f), 'utf8'));
  assert.ok(!fuentes.some((s) => /state-0|epocas\/state/.test(s)), 'la época no viaja con el núcleo (#115)');
});

test('todo nombre tiene su traducción al español en llano (sin-traducir limpio) y los textos de la hija mandan sobre los de la base', async () => {
  const epoca = cargarEpocaEscrita(epocaState());
  assert.deepEqual(sinTraducir('es', { epoca }).map((x) => x.clave), []);
  assert.deepEqual(sinTraducir('es').map((x) => x.clave), [], 'la 0 sigue limpia');
  assert.equal(contrato.texto(null, 'template register the node', 'es', { epoca }), 'dar de alta el nodo');
  assert.equal(contrato.texto(null, 'template register a thing', 'es', { epoca }), contrato.texto(null, 'template register a thing', 'es'), 'lo de la base sigue');
  assert.match(contrato.mensaje(null, 'second factor', 'es', { epoca }), /uno del nodo del que cuelga/);
  assert.doesNotMatch(contrato.mensaje(null, 'second factor', 'es'), /nodo/, 'la 0 no cambia');
});

test('el camino del 9 del nodo: seis pasos en orden, una acción cada uno, y se cumplen al dar de alta su pieza', async () => {
  const pasosDe = async (hasta) => {
    const { eje, ids } = await ejemploNodo({ hasta });
    return (await A.camino(eje, ids.nodo, N.operador, { idioma: 'es' })).pasos.filter((p) => p.fuente === 'tutorial');
  };
  const a1 = await pasosDe('nodo');
  assert.deepEqual(a1.map((p) => p.hacer.plantilla), CAMINO, 'los seis pasos, solo esos (el tutorial de identidad no se añade: el tipo trae su camino)');
  assert.deepEqual(a1.map((p) => p.hecho), [true, false, false, false, false, false]);
  assert.ok(a1.every((p) => p.hacer && !p.espera), 'cada paso tiene una acción, la suya (#90)');
  const a4 = await pasosDe('archivo');
  assert.deepEqual(a4.map((p) => p.hecho), [true, true, true, true, false, false]);
  const { eje, ids } = await ejemplo();
  const todo = (await A.camino(eje, ids.nodo, N.operador)).pasos.filter((p) => p.fuente === 'tutorial');
  assert.deepEqual(todo.map((p) => p.hecho), [true, true, true, true, true, true], 'en servicio');
  for (const n of CAMINO) assert.ok(!contrato.texto(eje, 'template ' + n, 'es').startsWith('template'), 'nombre llano en español: ' + n);
});

test('las piezas dicen su papel, de una lista cerrada; el agente lleva su modelo y límites en su 2 y su dotación de T', async () => {
  const { eje, ids } = await ejemplo();
  const papel = (id) => eje.obtener(id).payload[5];
  const vistos = new Set();
  for (const k of ['autoridad', 'rele', 'archivo', 'contexto', 'contenedor', 'puerta', 'despliegue', 'worker', 'vigia', 'ejecutor', 'ejeServido']) {
    const [tipo, rol] = papel(ids[k]);
    assert.equal(tipo, 'piece', k);
    assert.ok(PAPELES.includes(rol), k + ': ' + rol);
    vistos.add(rol);
  }
  assert.deepEqual([...vistos].sort(), [...PAPELES].sort(), 'la lista cerrada, cubierta entera');
  assert.deepEqual(eje.obtener(ids.autoridad).payload[6], [['0a1b2c3'], ['aa'.repeat(32)]], 'la autoridad: commit y sha256 del núcleo que corre');
  assert.equal(eje.obtener(ids.contenedor).payload[6][0][0], 'sha256:' + 'dd'.repeat(32), 'el contenedor, por digest');
  assert.deepEqual(eje.obtener(ids.despliegue).payload[6], [['4d5e6f7'], ['--puerto 8080'], ['/datos/ejemplo']]);
  assert.deepEqual(eje.obtener(ids.contexto).payload[6], [['cc'.repeat(32)], ['wss://rele.ejemplo.invalid']], 'un puntero, no una copia');
  assert.deepEqual(eje.obtener(ids.ejeServido).payload[6], [['eje-a'], ['ee'.repeat(32)]], 'solo nombre y génesis');
  const vigia = eje.obtener(ids.vigia);
  assert.deepEqual(vigia.payload[2].slice(1), [['modelo-de-ejemplo'], ['una medida por hora']], 'modelo y límites en su 2');
  assert.ok(vigia.movimientos.some((m) => m.token === 'T' && m.a === N.vigia && m.escala === 'minuto' && m.cantidad === 180), 'su dotación: 180 minutos de T');
  assert.equal(eje.esPersona(N.vigia), false, 'una cosa');
  assert.ok(A.esAgente(eje, N.vigia) && A.esAgente(eje, N.ejecutor), 'declarados agentes');
});

test('el criterio: una acción de la lista queda por autorizar y una libre no; sin la firma del titular no pasa a ejecutada, la de otro no vale, con la suya sí, y el recibo la enciende', async () => {
  const { eje, ids } = await ejemploNodo();
  const firmaDe = (q) => ({ firmar: (ev) => firmar(ev, CLAVES[q].privada) });
  let minuto = 900;
  const t = () => hora(minuto++);
  const pend = ids.reinicioPendiente;
  // Pendiente: autorizada, por autorizar para el operador (lo escribió) y para el titular (su llavero firma).
  let sf = A.segundoFactor(eje, pend);
  assert.ok(sf.exige && sf.pendiente);
  assert.deepEqual(sf.titulares, [N.llavero]);
  assert.equal(estacion(eje, pend), 'autorizada');
  assert.ok(A.porAutorizar(eje, N.titular).some((x) => x.id === pend && x.titular));
  assert.ok(A.porAutorizar(eje, N.operador).some((x) => x.id === pend && x.propio));
  // La libre: ni exige ni espera; su recibo la da por ejecutada.
  assert.equal(A.segundoFactor(eje, ids.reenvio).exige, false);
  assert.equal(estacion(eje, ids.reenvio), 'ejecutada');
  // El recibo sin la firma: lo anunciado se mueve, pero no pasa a ejecutada.
  const recibo = await A.transaccion(eje, 'leave a receipt', { X: ids.contenedor, operation: pend, result: 'reiniciado' }, N.ejecutor, { t: t(), ...firmaDe(N.ejecutor) });
  assert.ok(recibo.ok, JSON.stringify(recibo.motivos));
  await eje.anadir(recibo.evento);
  assert.equal(estacion(eje, pend), 'autorizada', 'sin la firma no se ejecuta');
  // La firma de otro (el operador) no vale.
  const otra = await A.autorizar(eje, pend, N.operador, { privada: CLAVES.operador.privada, t: t() });
  await eje.anadir(otra.evento);
  sf = A.segundoFactor(eje, pend);
  assert.ok(sf.pendiente);
  assert.match(sf.motivo, /operador/);
  assert.equal(estacion(eje, pend), 'autorizada');
  // La del llavero sí: ejecutada (el recibo ya estaba).
  const buena = await A.autorizar(eje, pend, N.llavero, { privada: CLAVES.llavero.privada, t: t() });
  assert.ok(buena.ok, JSON.stringify(buena.motivos));
  await eje.anadir(buena.evento);
  assert.equal(A.segundoFactor(eje, pend).pendiente, false);
  assert.equal(estacion(eje, pend), 'ejecutada');
  assert.ok(!A.porAutorizar(eje, N.titular).some((x) => x.id === pend), 'sale de lo por autorizar');
  // En el orden normal (el reinicio del vigía): firmado y luego el recibo, que la enciende.
  assert.equal(estacion(eje, ids.reinicio), 'ejecutada');
  assert.ok(eje.obtener(ids.reciboReinicio).sobre === ids.reinicio, 'el recibo, anclado sobre la operación');
  // Cambiar el criterio requiere a su vez autorización (la plantilla está en su propia lista).
  const nuevo = await A.transaccion(eje, 'require authorization', { X: ids.nodo, signer: N.llavero, templates: ['shut down'] }, N.titular, { t: t(), ...firmaDe(N.titular) });
  assert.ok(nuevo.ok, JSON.stringify(nuevo.motivos));
  await eje.anadir(nuevo.evento);
  assert.ok(A.segundoFactor(eje, nuevo.evento.id).pendiente);
});

test('un cambio de núcleo que falla la revalidación se cierra con error y no cambia el núcleo vigente', async () => {
  const { eje, ids } = await ejemplo();
  assert.equal(cerrado(eje, ids.cambioNucleo).fin, 'error');
  assert.notEqual(estacion(eje, ids.cambioNucleo), 'ejecutada');
  assert.equal(A.segundoFactor(eje, ids.cambioNucleo).pendiente, false, 'estaba autorizado');
  const hechos = leer(eje, `count ((down it) where "change the core" in (payload(it2)).4 and ${HECHA})`, ids.autoridad);
  assert.deepEqual(hechos.valor, [0], 'ningún cambio de núcleo ejecutado: rige el 6 del alta de la autoridad');
});

test('umbral (con autorización), vencimiento con su renovación y medidas del vigía, leídos por máquina', async () => {
  const { eje, ids } = await ejemplo();
  assert.ok(A.segundoFactor(eje, ids.umbral).exige, 'fijar un umbral requiere autorización');
  const umbral = leer(eje, `(payload(last ((down it) where last (first it2.6).5 = "2800000000" and "set a threshold" in (payload(it2)).4 and count (first it2.6).8.7 = count (first it2.6).8.8 and first (payload(it2)).1.0 = "disco"))).1`, ids.contenedor);
  assert.deepEqual(umbral.valor[0].v, [['disco'], [80], ['%']]);
  const medida = leer(eje, `(payload(last ((down it) where last (first it2.6).5 = "8000000000" and first (payload(it2)).0 = "disco"))).1`, ids.contenedor);
  assert.deepEqual(medida.valor, [42]);
  const vence = leer(eje, `(payload(last ((down it) where last (first it2.6).5 = "7000000000" and first (payload(it2)).1.0 = "certificado TLS"))).1.1`, ids.contenedor);
  assert.deepEqual(vence.valor, ['2027-05-01T00:00:00Z'], 'el vigente es el de la renovación');
  const vencido = leer(eje, `(first (payload(last ((down it) where last (first it2.6).5 = "7000000000" and first (payload(it2)).1.0 = "certificado TLS"))).1.1).0 < first before.6.0.0`, ids.contenedor);
  assert.deepEqual(vencido.valor, [false]);
  assert.equal(A.segundoFactor(eje, ids.vencimiento).exige, false, 'poner una fecha es libre');
});

test('el vigía mide sobre una pieza sin pagar atención; uno de fuera no; y el agente no escribe otra cosa por ese paso', async () => {
  const { eje, ids, rechazos } = await ejemplo();
  assert.equal(eje.obtener(ids.medida).autor, N.vigia);
  assert.equal(eje.obtener(ids.medida).sobre, ids.contenedor);
  assert.ok(rechazos.some((r) => r.caso === 'una visita mide una pieza' && r.motivos.some((m) => /pieza de un nodo/.test(m))));
  const intento = async (autor, en, payload) => {
    try {
      await escribirPagando(eje, { autor, sobre: ids.contenedor, en, t: hora(800), movimientos: [pagaElCoste(autor)], payload }, CLAVES[autor].privada);
      return null;
    } catch (e) {
      return e.message;
    }
  };
  // Una cosa que no es agente del nodo (el llavero del titular) tampoco mide.
  assert.match(await intento(N.llavero, '8000000000', ['disco', 1, '%', N.llavero, 'measure a piece']), /attention has a price/);
  // El vigía escribe otra cosa sobre la pieza (una fecha en su 7): no por ese paso.
  assert.match(await intento(N.vigia, '7000000000', ['vence', [['x'], ['2027-01-01T00:00:00Z']], 'all announced movements happened', N.vigia, 'set an expiry']), /attention has a price/);
  // Y una medida en el 8 de otra cosa que no es el 8 (su 2) tampoco.
  assert.match(await intento(N.vigia, '2000000000', ['disco', 1, '%', N.vigia, 'measure a piece']), /attention has a price/);
});

test('pedir un ancla: con R del dueño del nodo pasa, la devuelve y la cobra «attention has a price» con «my R»; sin R no', async () => {
  const { eje, ids } = await ejemploNodo();
  const firmaDe = (q) => ({ firmar: (ev) => firmar(ev, CLAVES[q].privada) });
  let minuto = 1000;
  const t = () => hora(minuto++);
  const altaOperador = eje.alta(N.operador).id;
  // El pedido del ejemplo: anclado en el 3 del alta del dueño del nodo, devuelve una unidad de su R.
  const pedido = eje.obtener(ids.pedidoAncla);
  assert.equal(pedido.autor, N.vecino);
  assert.equal([pedido.sobre, pedido.en].join(' '), altaOperador + ' 3000000000');
  assert.ok(pedido.movimientos.some((m) => m.token === 'R' && m.emisor === N.operador && m.de === N.vecino && m.a === N.operador && m.cantidad === 1));
  assert.deepEqual(pedido.payload[6], [['ab'.repeat(32)], [CLAVES[N.vecino].publica], [2], ['cd'.repeat(32)]], 'el lote del otro libro, como datos');
  assert.ok(A.acciones(eje, ids.nodo, 3, N.vecino).some((a) => a.nombre === 'ask for an anchor'), 'se ofrece sobre el nodo a quien tiene R de su dueño');
  assert.ok(!A.acciones(eje, ids.autoridad, 3, N.vecino).some((a) => a.nombre === 'ask for an anchor'), 'y solo sobre el alta del nodo');
  // El precio de su grupo es «my R» y lo comprueba la regla: un pedido escrito a mano sin devolver R no entra, ni pagado con su propia R.
  assert.deepEqual(leer(eje, DE_LA_CONEXION.precio, ids.conexion).valor.map((x) => x?.v ?? x), [[['my R'], [1]]]);
  const aMano = (movimientos) => escribirPagando(eje, { autor: N.vecino, sobre: altaOperador, en: '3000000000', t: t(), movimientos: [pagaElCoste(N.vecino), ...movimientos], payload: ['pedido a mano', 1, { ref: ids.nodo }, [N.vecino, N.operador], 'ask for an anchor', 'anchor request', [['ab'.repeat(32)], [CLAVES[N.vecino].publica], [2], ['ef'.repeat(32)]]] }, CLAVES[N.vecino].privada).then(() => null, (e) => e.message);
  assert.match(await aMano([]), /attention has a price/, 'sin pagar, no');
  assert.match(await aMano([{ token: 'R', emisor: N.vecino, cantidad: 1, de: null, a: N.vecino }, { token: 'R', emisor: N.vecino, cantidad: 1, de: N.vecino, a: N.operador }]), /attention has a price/, 'con su propia R, no: el precio es «my R»');
  // Con la R que le queda, otro pedido pasa; después ya no tiene R del dueño y no puede pedir.
  const otro = await A.transaccion(eje, 'ask for an anchor', { X: ids.nodo, ledger: 'ab'.repeat(32), key: CLAVES[N.vecino].publica, level: 1, header: 'ef'.repeat(32) }, N.vecino, { t: t(), ...firmaDe(N.vecino) });
  assert.ok(otro.ok, JSON.stringify(otro.motivos));
  await eje.anadir(otro.evento);
  assert.equal(eje.saldo(N.vecino, 'R:' + N.operador), 0);
  assert.ok(!A.acciones(eje, ids.nodo, 3, N.vecino).some((a) => a.nombre === 'ask for an anchor'), 'sin R ya no se ofrece');
  const sinR = await A.transaccion(eje, 'ask for an anchor', { X: ids.nodo, ledger: 'ab'.repeat(32), key: CLAVES[N.vecino].publica, level: 1, header: '12'.repeat(32) }, N.vecino, { t: t(), ...firmaDe(N.vecino) });
  assert.equal(sinR.ok, false, 'sin R no pasa');
  assert.equal(lectura(eje, 'anchors asked', ids.nodo).length, 3, 'los dos del ejemplo y este; el que no pasó no está');
});

test('un pedido de ancla con un hueco mal formado no vale: libro, clave y cabecera de 64 hexadecimales en minúsculas, nivel de epoch.7.6.1', async () => {
  const { eje, ids } = await ejemplo();
  const bien = { ledger: 'ab'.repeat(32), key: CLAVES[N.vecino].publica, level: 2, header: 'cd'.repeat(32) };
  const prueba = async (cambio) => A.transaccion(eje, 'ask for an anchor', { X: ids.nodo, ...bien, ...cambio }, N.vecino, { t: hora(1200), firmar: (ev) => firmar(ev, CLAVES[N.vecino].privada) });
  assert.ok((await prueba({})).ok, 'el bueno pasa en seco');
  for (const [cambio, parametro] of [
    [{ ledger: 'ab'.repeat(31) }, 'ledger'],
    [{ ledger: 'xy'.repeat(32) }, 'ledger'],
    [{ key: CLAVES[N.vecino].publica.toUpperCase() }, 'key'],
    [{ key: CLAVES[N.vecino].publica + '00' }, 'key'],
    [{ level: 9 }, 'level'],
    [{ header: 'cd'.repeat(32) + 'c' }, 'header'],
  ]) {
    const r = await prueba(cambio);
    assert.equal(r.ok, false, JSON.stringify(cambio));
    assert.ok(r.motivos.some((m) => m.parametro === parametro), JSON.stringify(cambio) + ': ' + JSON.stringify(r.motivos));
  }
  const falta = await A.transaccion(eje, 'ask for an anchor', { X: ids.nodo, ledger: bien.ledger, key: bien.key, level: 2 }, N.vecino, { t: hora(1201) });
  assert.ok(falta.motivos.some((m) => m.parametro === 'header'), 'la cabecera es obligatoria');
});

test('la lectura «anchors asked»: por pedido, quién, libro, clave, nivel, cabecera e instante, leído del libro del nodo', async () => {
  const { eje, ids } = await ejemplo();
  assert.deepEqual(lectura(eje, 'anchors asked', ids.nodo).map(idDe), [ids.pedidoAncla, ids.pedidoPendiente], 'todos, servidos o no');
  const p = ids.pedidoAncla;
  assert.deepEqual(leer(eje, 'first it.3', p).valor, [N.vecino], 'quién');
  assert.deepEqual(leer(eje, '(payload(it)).6.0', p).valor, ['ab'.repeat(32)], 'libro');
  assert.deepEqual(leer(eje, '(payload(it)).6.1', p).valor, [CLAVES[N.vecino].publica], 'clave de la línea');
  assert.deepEqual(leer(eje, '(payload(it)).6.2', p).valor, [2], 'nivel');
  assert.deepEqual(leer(eje, '(payload(it)).6.3', p).valor, ['cd'.repeat(32)], 'cabecera');
  assert.deepEqual(leer(eje, 'first it.6.0', p).valor, [eje.obtener(p).t], 'instante');
  // Solo los del nodo que se lee: sobre otra alta del dueño, nada.
  assert.deepEqual(lectura(eje, 'anchors asked', ids.autoridad), []);
});

test('conexiones: el invitado al nodo con R del dueño está vigente, con su clave, sus relés, su grupo y su precio; el titular y la visita, invitados a otra cosa, no', async () => {
  const { eje, ids } = await ejemplo();
  assert.deepEqual(lectura(eje, 'current connections', ids.nodo).map(idDe), [N.vecino]);
  const de = (q) => leer(eje, DE_LA_CONEXION[q], ids.conexion).valor;
  assert.deepEqual(de('clave'), [CLAVES[N.vecino].publica]);
  assert.deepEqual(de('reles'), ['wss://vecino.ejemplo.invalid', 'wss://vecino-2.ejemplo.invalid']);
  assert.deepEqual(de('grupo'), [3]);
  assert.deepEqual(de('precio').map((x) => x?.v ?? x), [[['my R'], [1]]]);
  assert.deepEqual(de('r'), [1], 'le dieron 3 y devolvió 2 al pedir dos anclas');
  assert.equal(eje.obtener(ids.conexion).sobre, ids.invitacionConexion, 'su alta cuelga de la invitación');
  assert.deepEqual(eje.obtener(ids.invitacionConexion).payload[5], [{ ref: ids.nodo }], 'al dominio del nodo');
  assert.ok(eje.saldo(N.titular, 'R:' + N.operador) > 0 && eje.saldo(N.visita, 'R:' + N.operador) > 0, 'tienen R del dueño, pero no son conexiones del nodo');
});

test('conexiones: el veto la quita, y quedarse sin R también', async () => {
  const { eje, ids } = await ejemploNodo();
  // El otro nodo: aceptó y tiene R, pero está vetado (grupo 5, precio «nothing»).
  assert.equal(eje.obtener(ids.quitarConexion).en, '3530000000');
  assert.deepEqual(leer(eje, DE_LA_CONEXION.grupo, ids.otraConexion).valor, [5]);
  assert.deepEqual(leer(eje, DE_LA_CONEXION.r, ids.otraConexion).valor, [1]);
  assert.ok(!lectura(eje, 'current connections', ids.nodo).map(idDe).includes(N.dePaso));
  // El vecino devuelve la R que le queda pidiendo otra ancla: deja de estar vigente.
  const r = await A.transaccion(eje, 'ask for an anchor', { X: ids.nodo, ledger: 'ab'.repeat(32), key: CLAVES[N.vecino].publica, level: 3, header: '34'.repeat(32) }, N.vecino, { t: hora(1300), firmar: (ev) => firmar(ev, CLAVES[N.vecino].privada) });
  assert.ok(r.ok, JSON.stringify(r.motivos));
  await eje.anadir(r.evento);
  assert.deepEqual(lectura(eje, 'current connections', ids.nodo), []);
  assert.equal(lectura(eje, 'anchors asked', ids.nodo).length, 3);
});

test('los relés los declara el invitado en su propia alta; nadie los declara en el alta de otro', async () => {
  const { eje, ids } = await ejemploNodo();
  const reles = eje.obtener(ids.relesVecino);
  assert.equal([reles.autor, reles.sobre, reles.en].join(' '), [N.vecino, ids.conexion, '1300000000'].join(' '));
  // Lanzada sobre el alta de otro, no se ofrece allí y la plantilla escribe en la propia (su 5: =first me.6).
  assert.ok(!A.acciones(eje, ids.otraConexion, 1, N.vecino).some((a) => a.nombre === 'declare my relays'));
  assert.ok(A.acciones(eje, ids.conexion, 1, N.vecino).some((a) => a.nombre === 'declare my relays'));
  const r = await A.transaccion(eje, 'declare my relays', { X: ids.otraConexion, relays: ['wss://intruso.ejemplo.invalid'] }, N.vecino, { t: hora(1400), firmar: (ev) => firmar(ev, CLAVES[N.vecino].privada) });
  assert.ok(r.ok, JSON.stringify(r.motivos));
  assert.equal(r.evento.sobre, ids.conexion, 'cae en su propia alta');
  // Escrita a mano en el 1.3 del alta de otro: la atención del otro la cobra, y no entra.
  const aMano = await escribirPagando(eje, { autor: N.vecino, sobre: ids.otraConexion, en: '1300000000', t: hora(1401), movimientos: [pagaElCoste(N.vecino)], payload: ['relés de otro', ['wss://intruso.ejemplo.invalid'], 'all announced movements happened', N.vecino, 'declare my relays'] }, CLAVES[N.vecino].privada).then(() => null, (e) => e.message);
  assert.match(aMano, /attention has a price/);
  // Y la lectura solo cuenta las del dueño del alta: los del otro nodo son los suyos.
  assert.deepEqual(leer(eje, DE_LA_CONEXION.reles, ids.otraConexion).valor, ['wss://paso.ejemplo.invalid']);
});

// La firma del titular en las conexiones (VG 17-11, encargo «la firma del titular en las conexiones»): la tercera rama de
// la lectura «second factor» de esta época. Y el ancla servida (encargo «ancla servida»).
const SERVIDO = '(down it) where "anchor served" in (payload(it2)).4 and first it2.3 = first (first (payload(it)).2).3 and first (payload(it2)).6.0 = first (payload(it)).6.3 and first (payload(it2)).6.2 >= first (payload(it)).6.2';
/** Invita por nombre al dominio del nodo (o a ninguno, `dominio: null`), con R, y el invitado acepta: { inv, alta }. */
async function invitarAlNodo(eje, ids, otro, minuto, { dominio = ids.nodo, cuanta = 1 } = {}) {
  const K = claveDePrueba(otro);
  const inv = await eje.invitar({ autor: N.operador, invitado: otro, clave: K.publica, da: [{ token: 'R', cantidad: cuanta }], grupo: 3, ...(dominio ? { dominio } : {}), tema: 'conexión de prueba', t: hora(minuto), privada: CLAVES.operador.privada });
  const alta = await eje.aceptar(inv, K, { t: hora(minuto + 1) });
  return { inv, alta };
}
async function firmarCon(eje, quien, id, minuto) {
  const r = await A.autorizar(eje, id, quien, { privada: CLAVES[quien].privada, t: hora(minuto) });
  assert.ok(r.evento, JSON.stringify(r.motivos));
  await eje.anadir(r.evento);
  return r;
}
async function lanzar(eje, nombre, X, params, quien, minuto) {
  const r = await A.transaccion(eje, nombre, { X, ...params }, quien, { t: hora(minuto), firmar: (ev) => firmar(ev, CLAVES[quien].privada) });
  assert.ok(r.ok, nombre + ': ' + JSON.stringify(r.motivos));
  await eje.anadir(r.evento);
  return r.evento;
}

test('conectar sin criterio «require authorization» en el nodo no espera: la conexión está vigente en cuanto acepta', async () => {
  const { eje, ids } = await ejemploNodo({ hasta: 'nodo' });
  const { inv, alta } = await invitarAlNodo(eje, ids, 'nodo-sin-criterio', 1500);
  const sf = A.segundoFactor(eje, inv.id);
  assert.equal(sf.exige, false, JSON.stringify(sf.criterios));
  assert.deepEqual(lectura(eje, 'current connections', ids.nodo).map(idDe), ['nodo-sin-criterio']);
  assert.equal(eje.obtener(alta.id).sobre, inv.id);
});

test('con criterio, conectar espera la firma del titular: no está vigente hasta que firma quien nombra el criterio; la firma de otro no vale', async () => {
  const { eje, ids } = await ejemploNodo();
  const { inv } = await invitarAlNodo(eje, ids, 'nodo-nuevo', 1500);
  let sf = A.segundoFactor(eje, inv.id);
  assert.ok(sf.exige && sf.pendiente, 'la invitación al dominio del nodo espera');
  assert.deepEqual(sf.titulares, [N.llavero], 'firma quien nombra el criterio (su 3)');
  assert.deepEqual(sf.criterios.map((c) => c.id), [ids.criterio]);
  assert.ok(A.porAutorizar(eje, N.titular).some((x) => x.id === inv.id && x.titular), 'por autorizar para el titular');
  assert.deepEqual(lectura(eje, 'current connections', ids.nodo).map(idDe), [N.vecino], 'no sale en las vigentes');
  // La firma de otro (el operador, que la escribió) no vale.
  await firmarCon(eje, N.operador, inv.id, 1510);
  sf = A.segundoFactor(eje, inv.id);
  assert.ok(sf.pendiente);
  assert.match(sf.motivo, /operador/);
  assert.deepEqual(lectura(eje, 'current connections', ids.nodo).map(idDe), [N.vecino]);
  // La del llavero sí: vigente.
  const buena = await firmarCon(eje, N.llavero, inv.id, 1511);
  assert.ok(buena.ok, JSON.stringify(buena.motivos));
  assert.equal(A.segundoFactor(eje, inv.id).pendiente, false);
  assert.deepEqual(lectura(eje, 'current connections', ids.nodo).map(idDe), [N.vecino, 'nodo-nuevo']);
  // En el ejemplo, las dos invitaciones del dueño al nodo esperaron y las firmó el llavero.
  for (const k of ['invitacionConexion', 'invitacionOtraConexion']) {
    const x = A.segundoFactor(eje, ids[k]);
    assert.ok(x.exige && !x.pendiente, k);
  }
});

test('con criterio, mover de grupo, poner el precio de un grupo y vetar a una conexión esperan la firma; el veto pendiente no la quita', async () => {
  const { eje, ids } = await ejemploNodo();
  const altaOperador = eje.alta(N.operador).id;
  const mover = await lanzar(eje, 'move to group', altaOperador, { whom: N.vecino, zone: 4 }, N.operador, 1600);
  assert.equal(mover.en, '3430000000');
  const precio = await lanzar(eje, 'set a group price', altaOperador, { token: 'my R', amount: 2, zone: 4 }, N.operador, 1601);
  const veto = await lanzar(eje, 'veto someone', altaOperador, { whom: N.vecino }, N.operador, 1602);
  for (const [que, ev] of [['mover', mover], ['precio', precio], ['vetar', veto]]) {
    const sf = A.segundoFactor(eje, ev.id);
    assert.ok(sf.exige && sf.pendiente, que);
    assert.deepEqual(sf.titulares, [N.llavero], que);
  }
  // El veto pendiente no la quita de las vigentes, y desde A0 (encargo «los dos canales») tampoco la cambia de grupo: lo que
  // espera la firma no cuenta en «attention group» ni en «attention price» de esta época (sigue en el 3, con su precio).
  assert.deepEqual(leer(eje, DE_LA_CONEXION.grupo, ids.conexion).valor, [3]);
  assert.deepEqual(leer(eje, DE_LA_CONEXION.precio, ids.conexion).valor.map((x) => x?.v ?? x), [[['my R'], [1]]]);
  assert.deepEqual(lectura(eje, 'current connections', ids.nodo).map(idDe), [N.vecino]);
  // Firmado, sí.
  await firmarCon(eje, N.llavero, veto.id, 1603);
  assert.equal(A.segundoFactor(eje, veto.id).pendiente, false);
  assert.deepEqual(lectura(eje, 'current connections', ids.nodo), []);
  assert.deepEqual(leer(eje, DE_LA_CONEXION.grupo, ids.conexion).valor, [5], 'firmado, el veto sí la pone en el grupo de los vetados');
  // En el ejemplo, el precio de las conexiones y el veto al otro nodo esperaron y los firmó el llavero.
  for (const k of ['precioConexiones', 'quitarConexion']) {
    const x = A.segundoFactor(eje, ids[k]);
    assert.ok(x.exige && !x.pendiente, k);
  }
});

test('con criterio, lo que no es del dominio del nodo no espera: una invitación del dueño a otra cosa, mover a quien no es conexión, y lo que escribe otro', async () => {
  const { eje, ids } = await ejemploNodo();
  // Una invitación del dueño fuera del dominio del nodo (como la del titular o la de la visita).
  const { inv } = await invitarAlNodo(eje, ids, 'invitado-a-otra-cosa', 1700, { dominio: null });
  assert.equal(A.segundoFactor(eje, inv.id).exige, false);
  assert.equal(A.segundoFactor(eje, eje.obtener(ids.altaTitular).sobre).exige, false, 'la invitación del titular');
  assert.equal(A.segundoFactor(eje, eje.obtener(ids.altaVisita).sobre).exige, false, 'la invitación de la visita');
  // Mover de grupo a quien no es una conexión (la visita).
  const mover = await lanzar(eje, 'move to group', eje.alta(N.operador).id, { whom: N.visita, zone: 4 }, N.operador, 1702);
  assert.equal(A.segundoFactor(eje, mover.id).exige, false);
  // Lo que escribe otro en su alta: el vecino veta a la visita en la suya.
  const ajeno = await lanzar(eje, 'veto someone', ids.conexion, { whom: N.visita }, N.vecino, 1703);
  assert.equal(A.segundoFactor(eje, ajeno.id).exige, false);
});

test('ancla servida: un pedido sin servir sale pendiente; servido por el dueño del nodo sale servido, con la madre, su nivel y el camino', async () => {
  const { eje, ids } = await ejemplo();
  const servida = eje.obtener(ids.anclaServida);
  assert.equal([servida.autor, servida.sobre, servida.en].join(' '), [N.operador, ids.pedidoAncla, '4000000000'].join(' '), 'la escribe el dueño del nodo, anclada en el 4 del pedido');
  assert.deepEqual(servida.payload[6], [['cd'.repeat(32)], ['9a'.repeat(32)], [3], ['sip']], '6.0 la cabecera pedida, 6.1 la madre, 6.2 su nivel, 6.3 el camino');
  assert.ok(!servida.movimientos.some((m) => m.token !== 'T'), 'solo el T de escribir');
  assert.deepEqual(lectura(eje, 'anchors asked', ids.nodo).map(idDe), [ids.pedidoAncla, ids.pedidoPendiente]);
  assert.deepEqual(leer(eje, `count (${SERVIDO}) > 0`, ids.pedidoAncla).valor, [true], 'servido');
  assert.deepEqual(leer(eje, `count (${SERVIDO}) > 0`, ids.pedidoPendiente).valor, [false], 'pendiente');
  const datos = (f) => leer(eje, `(payload(first (${SERVIDO}))).6.${f}`, ids.pedidoAncla).valor;
  assert.deepEqual([datos(1), datos(2), datos(3)], [['9a'.repeat(32)], [3], ['sip']]);
  // Se ofrece al dueño del nodo sobre el pedido, no a quien pidió.
  assert.ok(A.acciones(eje, ids.pedidoPendiente, 3, N.operador).some((a) => a.nombre === 'anchor served'));
  assert.ok(!A.acciones(eje, ids.pedidoPendiente, 3, N.vecino).some((a) => a.nombre === 'anchor served'));
});

test('ancla servida: escrita por otra identidad, o con el 6.0 distinto al 6.3 del pedido, no lo da por servido; la plantilla comprueba la cabecera', async () => {
  const { eje, ids } = await ejemploNodo();
  const p = ids.pedidoPendiente;
  // La plantilla: la cabecera ha de ser la del pedido y los hashes, 64 hexadecimales en minúsculas.
  for (const [cambio, parametro] of [[{ header: 'cd'.repeat(32) }, 'header'], [{ mother: '9A'.repeat(32) }, 'mother'], [{ mother: '9a'.repeat(31) }, 'mother'], [{ level: 9 }, 'level'], [{ level: 1 }, 'level']]) {
    const r = await A.transaccion(eje, 'anchor served', { X: p, mother: '9a'.repeat(32), level: 3, ...cambio }, N.operador, { t: hora(1800) });
    assert.equal(r.ok, false, JSON.stringify(cambio));
    assert.ok(r.motivos.some((m) => m.parametro === parametro), JSON.stringify(cambio) + ': ' + JSON.stringify(r.motivos));
  }
  // Escrita por otro (el vecino, quien pidió): entra en el libro, pero no lo sirve.
  const ajena = await lanzar(eje, 'anchor served', p, { mother: '9a'.repeat(32), level: 3 }, N.vecino, 1801);
  assert.equal(ajena.autor, N.vecino);
  assert.deepEqual(leer(eje, `count (${SERVIDO}) > 0`, p).valor, [false]);
  // Escrita a mano por el dueño con otra cabecera en el 6.0: tampoco.
  await escribirPagando(eje, { autor: N.operador, sobre: p, en: '4000000000', t: hora(1802), movimientos: [pagaElCoste(N.operador)], payload: ['servida a mano', { ref: p }, 'all announced movements happened', [N.operador, N.vecino], 'anchor served', 'served anchor', [['ef'.repeat(32)], ['9a'.repeat(32)], [3], ['sip']]] }, CLAVES.operador.privada);
  assert.deepEqual(leer(eje, `count (${SERVIDO}) > 0`, p).valor, [false]);
  // Escrita a mano por el dueño con la cabecera buena y un nivel menor que el pedido (2): tampoco.
  await escribirPagando(eje, { autor: N.operador, sobre: p, en: '4000000000', t: hora(1802), movimientos: [pagaElCoste(N.operador)], payload: ['servida por debajo', { ref: p }, 'all announced movements happened', [N.operador, N.vecino], 'anchor served', 'served anchor', [['5e'.repeat(32)], ['9a'.repeat(32)], [1], ['sip']]] }, CLAVES.operador.privada);
  assert.deepEqual(leer(eje, `count (${SERVIDO}) > 0`, p).valor, [false]);
  // La buena, del dueño y con la cabecera del pedido: servido.
  await lanzar(eje, 'anchor served', p, { mother: '7b'.repeat(32), level: 4, path: 'sip' }, N.operador, 1803);
  assert.deepEqual(leer(eje, `count (${SERVIDO}) > 0`, p).valor, [true]);
  assert.deepEqual(leer(eje, `(payload(first (${SERVIDO}))).6.1`, p).valor, ['7b'.repeat(32)]);
  assert.equal(lectura(eje, 'anchors asked', ids.nodo).length, 2, 'la lectura sigue dando todos los pedidos');
});

test('un eje con la época 0 a secas da los mismos veredictos que antes: nada de esta época le afecta', async () => {
  // El ejemplo de la compra (época 0): cada evento se vuelve a validar igual en un eje nuevo.
  const { eje } = await ejemploCompra();
  assert.equal(eje.epoca().id, ID_DE_LA_0);
  assert.deepEqual(A.criteriosDeOtraPlantilla(eje), [], 'en la 0 no hay criterios de otra plantilla: el atajo sigue');
  const eventos = eje.orden.map((id) => eje.obtener(id));
  const nuevo = await Eje.desde([eventos[0]]);
  for (const ev of eventos.slice(1)) {
    assert.deepEqual(await nuevo.validar(ev), [], ev.id);
    await nuevo.anadir(ev);
  }
  // En un eje de la 0 no existen las plantillas de esta época, y la atención sigue cobrando solo sobre un alta propia:
  // una cosa mide sobre el alta de otra cosa de su dueño como siempre (en la época state, sobre una pieza, no).
  const K = CLAVES;
  const cero = await Eje.genesis({ identidad: N.operador, foco: ['eje de la 0'], t: hora(0), clave: K.operador.publica, privada: K.operador.privada, exigirFirmas: true });
  const r = await A.transaccion(cero, 'register the node', { X: cero.genesisId, node: 'n', minutes: 1, holder: N.operador }, N.operador, { t: hora(1) });
  assert.equal(r.ok, false, 'plantilla desconocida en la 0');
  const altaDe = async (cosa, min) => escribirPagando(cero, { autor: N.operador, sobre: cero.genesisId, en: '1400000000', t: hora(min), movimientos: [pagaElCoste(N.operador), { token: 'T', escala: 'minuto', cantidad: 10, de: N.operador, a: cosa }], payload: [cosa, 10, 'all announced movements happened', [N.operador, cosa], 'register a thing', ['piece', 'container']], ...(K[cosa] ? { contexto: { claves: { [cosa]: K[cosa].publica } } } : {}) }, K.operador.privada, K[cosa] ? { [cosa]: K[cosa].privada } : {});
  const pieza = await altaDe('pieza', 2);
  await altaDe(N.llavero, 3);
  await escribirPagando(cero, { autor: N.llavero, sobre: pieza.id, en: '8000000000', t: hora(4), movimientos: [pagaElCoste(N.llavero)], payload: ['disco', 1, '%', N.llavero, 'measure a piece'] }, K.llavero.privada);
});

// A0 del encargo «los dos canales» (VG 17-11 por Core State): lo que espera la firma del titular no rige el precio de la
// atención hasta que está firmado. Esta época sustituye «attention group» y «attention price» (y lee el precio una sola vez
// en «attention has a price»).
test('A0: un precio, un cambio de grupo y un veto pendientes no cambian el coste ni rechazan; firmados, sí', async () => {
  const { eje, ids } = await ejemploNodo();
  const altaOperador = eje.alta(N.operador).id;
  const otro = 'nodo-a0';
  const { inv, alta } = await invitarAlNodo(eje, ids, otro, 2000, { cuanta: 20 });
  await firmarCon(eje, N.llavero, inv.id, 2002);
  const K = claveDePrueba(otro);
  let minuto = 2010;
  let cabecera = 0;
  // Pedir un ancla devolviendo `cuanta` R del dueño: { ok, motivos } (si pasa, entra en el eje).
  const pedir = async (cuanta) => {
    const r = await A.transaccion(eje, 'ask for an anchor', { X: ids.nodo, amount: cuanta, ledger: 'ab'.repeat(32), key: K.publica, level: 2, header: (++cabecera).toString(16).padStart(2, '0').repeat(32) }, otro, { t: hora(minuto++), firmar: (ev) => firmar(ev, K.privada) });
    if (r.ok) await eje.anadir(r.evento);
    return r;
  };
  const grupo = () => leer(eje, DE_LA_CONEXION.grupo, alta.id).valor;
  const precio = () => leer(eje, DE_LA_CONEXION.precio, alta.id).valor.map((x) => x?.v ?? x);
  assert.deepEqual([grupo(), precio()], [[3], [[['my R'], [1]]]]);
  // El precio del grupo 3 a 2, pendiente: sigue costando 1.
  const p3 = await lanzar(eje, 'set a group price', altaOperador, { token: 'my R', amount: 2, zone: 3 }, N.operador, minuto++);
  assert.ok(A.segundoFactor(eje, p3.id).pendiente);
  assert.deepEqual(precio(), [[['my R'], [1]]], 'el precio pendiente no rige');
  assert.ok((await pedir(1)).ok, 'con el precio de antes pasa');
  // Firmado: cuesta 2.
  await firmarCon(eje, N.llavero, p3.id, minuto++);
  assert.deepEqual(precio(), [[['my R'], [2]]]);
  const corto = await pedir(1);
  assert.equal(corto.ok, false);
  assert.ok(corto.motivos.some((m) => /attention has a price|precio de su grupo/.test(m.mensaje)), JSON.stringify(corto.motivos));
  assert.ok((await pedir(2)).ok);
  // Un precio firmado para el grupo 4 y un cambio de grupo pendiente al 4: sigue en el 3 y cuesta 2.
  const p4 = await lanzar(eje, 'set a group price', altaOperador, { token: 'my R', amount: 3, zone: 4 }, N.operador, minuto++);
  await firmarCon(eje, N.llavero, p4.id, minuto++);
  const mover = await lanzar(eje, 'move to group', altaOperador, { whom: otro, zone: 4 }, N.operador, minuto++);
  assert.ok(A.segundoFactor(eje, mover.id).pendiente);
  assert.deepEqual([grupo(), precio()], [[3], [[['my R'], [2]]]], 'el cambio de grupo pendiente no rige');
  assert.ok((await pedir(2)).ok);
  // Firmado: grupo 4, cuesta 3.
  await firmarCon(eje, N.llavero, mover.id, minuto++);
  assert.deepEqual([grupo(), precio()], [[4], [[['my R'], [3]]]]);
  assert.equal((await pedir(2)).ok, false);
  assert.ok((await pedir(3)).ok);
  // Un veto pendiente no rechaza; firmado, sí.
  const veto = await lanzar(eje, 'veto someone', altaOperador, { whom: otro }, N.operador, minuto++);
  assert.ok(A.segundoFactor(eje, veto.id).pendiente);
  assert.deepEqual(grupo(), [4], 'el veto pendiente no rige');
  assert.ok((await pedir(3)).ok, 'el veto pendiente no rechaza');
  await firmarCon(eje, N.llavero, veto.id, minuto++);
  assert.deepEqual([grupo(), precio()], [[5], [[['nothing'], [0]]]]);
  assert.equal((await pedir(3)).ok, false, 'vetado');
});

// Los dos canales (encargo «los dos canales», VG 17-11 por Core State; cerrado con Core AARPIA).
/** Una lectura con nombre, como ids (los registros) o valores. */
const lecturaIds = (eje, nombre, id) => lectura(eje, nombre, id).map((x) => x?.id ?? x);
/** Lanza una plantilla en seco (no la añade): { ok, motivos, evento }. */
const enSeco = (eje, nombre, X, params, quien, minuto) => A.transaccion(eje, nombre, { X, ...params }, quien, { t: hora(minuto), firmar: (ev) => firmar(ev, CLAVES[quien].privada) });
/** El payload de un mensaje escrito a mano: su 0 y su 1 (una décupla: cada hoja en su posición). */
const mensaje = (que, ...uno) => [que, uno.map((x) => [x])];
/** Escribe a mano (sin plantilla): null si entra, el mensaje del error si no. */
const aMano = (eje, autor, sobre, en, payload, minuto) => escribirPagando(eje, { autor, sobre, en, t: hora(minuto), movimientos: [pagaElCoste(autor)], payload }, CLAVES[autor].privada).then(() => null, (e) => e.message);

test('conversaciones: abrir, renombrar y archivar; las lecturas dan título, estado, último mensaje y recuento', async () => {
  const { eje, ids, rechazos } = await ejemplo();
  assert.deepEqual(lecturaIds(eje, 'conversations', ids.agenteCasa), [ids.conversacionCasa, ids.conversacionTelegram, ids.conversacionArchivada]);
  const c = eje.obtener(ids.conversacionCasa);
  assert.equal([c.autor, c.sobre, c.en].join(' '), [N.personaCasa, ids.agenteCasa, '1500000000'].join(' '), 'en el 1.5 del alta del agente');
  assert.deepEqual(c.payload, [['Horario de la tienda'], [N.agenteCasa], ['all announced movements happened'], [[N.personaCasa], [N.personaCasa]], ['open a conversation'], ['conversation with an agent']]);
  assert.ok(c.movimientos.some((m) => m.token === 'R' && m.emisor === N.operador && m.de === N.personaCasa && m.a === N.operador && m.cantidad === 1), 'quien no es el dueño paga el precio de su grupo');
  assert.deepEqual(eje.obtener(ids.conversacionTelegram).payload[3], [[N.servicio], [N.interlocutor]], 'el servicio la abre en nombre del interlocutor');
  assert.deepEqual(lectura(eje, 'conversation title', ids.conversacionCasa), ['Horario de la tienda']);
  assert.deepEqual(lectura(eje, 'conversation title', ids.conversacionArchivada), ['Una prueba ya resuelta'], 'vale el último renombre');
  assert.deepEqual(lectura(eje, 'conversation archived', ids.conversacionCasa), [false]);
  assert.deepEqual(lectura(eje, 'conversation archived', ids.conversacionArchivada), [true]);
  assert.deepEqual(lectura(eje, 'message count', ids.conversacionCasa), [2]);
  assert.deepEqual(lectura(eje, 'message count', ids.conversacionArchivada), [0]);
  assert.deepEqual(lectura(eje, 'last message', ids.conversacionCasa), [eje.obtener(ids.respuestaCasa).t]);
  assert.deepEqual(lectura(eje, 'last message', ids.conversacionArchivada), []);
  assert.deepEqual(lecturaIds(eje, 'messages of', ids.conversacionTelegram), [ids.entraTelegram, ids.saleTelegram]);
  assert.ok(rechazos.some((r) => r.caso === 'un mensaje en una conversación archivada' && r.motivos.some((m) => /archived|archivada/.test(m))));
  // Lo ofrecido: abrir, a quien tiene R del dueño; renombrar y archivar, a quien la abrió y al dueño, no a otro.
  assert.ok(A.acciones(eje, ids.agenteCasa, 1, N.visita).some((a) => a.nombre === 'open a conversation'));
  assert.ok(A.acciones(eje, ids.conversacionCasa, 0, N.operador).some((a) => a.nombre === 'rename a conversation'));
  assert.ok(!A.acciones(eje, ids.conversacionCasa, 0, N.visita).some((a) => a.nombre === 'rename a conversation'));
  assert.ok(!A.acciones(eje, ids.conversacionArchivada, 4, N.personaCasa).some((a) => a.nombre === 'archive a conversation'), 'ya archivada');
});

test('conversaciones: renombrar o archivar la de otro no entra; abrirla bajo algo que no es un agente o para un interlocutor ajeno, tampoco', async () => {
  const { eje, ids } = await ejemploNodo();
  const conv = ids.conversacionCasa;
  assert.match(await aMano(eje, N.visita, conv, '0000000000', ['otro título', { ref: conv }, 'all announced movements happened', N.visita, 'rename a conversation'], 3000), /who opens, renames and archives a conversation/);
  assert.match(await aMano(eje, N.servicio, conv, '4000000000', ['archived', { ref: conv }, 'closed by decision', N.servicio, ['archive a conversation', 'close by decision']], 3001), /who opens, renames and archives a conversation/);
  // El dueño del agente sí renombra.
  assert.equal(await aMano(eje, N.operador, conv, '0000000000', ['título del dueño', { ref: conv }, 'all announced movements happened', N.operador, 'rename a conversation'], 3002), null);
  assert.deepEqual(lectura(eje, 'conversation title', conv), ['título del dueño']);
  // Abrir bajo una pieza que no es un agente (el contenedor), o para un interlocutor cuya alta no escribió quien la abre.
  const abrir = await enSeco(eje, 'open a conversation', ids.contenedor, { agent: N.agenteCasa }, N.personaCasa, 3003);
  assert.equal(abrir.ok, false);
  const ajeno = await enSeco(eje, 'open a conversation', ids.agenteCasa, { interlocutor: N.interlocutor }, N.personaCasa, 3004);
  assert.equal(ajeno.ok, false);
  assert.ok(ajeno.motivos.some((m) => /who opens|abre una conversación/.test(m.mensaje)), JSON.stringify(ajeno.motivos));
});

test('mensajes: sin texto ni adjunto no; el adjunto, sha256 o «telegram:…» y nada más', async () => {
  const { eje, ids } = await ejemplo();
  const conv = ids.conversacionCasa;
  const prueba = (params, minuto) => enSeco(eje, 'message in', conv, { channel: 'house', ...params }, N.personaCasa, minuto);
  assert.equal((await prueba({}, 3100)).ok, false, 'ni texto ni adjunto');
  for (const [file, bien] of [
    ['ab'.repeat(32), true],
    ['telegram:AgAD-ejemplo_0002', true],
    ['telegram:' + 'a'.repeat(128), true],
    ['telegram:' + 'a'.repeat(129), false],
    ['telegram:', false],
    ['AB'.repeat(32), false],
    ['ab'.repeat(31), false],
    ['ftp://ejemplo.invalid/archivo', false],
    ['-', false],
  ]) {
    const r = await prueba({ file }, 3101);
    assert.equal(r.ok, bien, file + ': ' + JSON.stringify(r.motivos));
  }
  // Solo el adjunto: el texto va como «-» (un payload no tiene textos vacíos) y no cuenta como texto.
  const solo = await prueba({ file: 'cd'.repeat(32) }, 3102);
  assert.deepEqual(solo.evento.payload[1], [['house'], [N.personaCasa], ['-'], ['cd'.repeat(32)]]);
  // A mano, lo mismo lo dice la regla.
  assert.match(await aMano(eje, N.personaCasa, conv, '3000000000', mensaje('message in', 'house', N.personaCasa), 3103), /a message carries a text or a file/);
  assert.match(await aMano(eje, N.personaCasa, conv, '3000000000', mensaje('message in', 'house', N.personaCasa, '-', '-'), 3104), /a message carries a text or a file/);
  assert.match(await aMano(eje, N.personaCasa, conv, '3000000000', mensaje('message in', 'house', N.personaCasa, 'hola', 'telegram:'), 3105), /a message carries a text or a file/);
  // En respuesta a un mensaje de otra conversación, no.
  assert.match(await aMano(eje, N.personaCasa, conv, '3000000000', mensaje('message in', 'house', N.personaCasa, 'hola', '-', { ref: ids.entraTelegram }), 3106), /a message carries a text or a file/);
  // Un canal que no está en la lista, no.
  assert.equal((await enSeco(eje, 'message in', conv, { channel: 'fax', text: 'hola' }, N.personaCasa, 3107)).ok, false);
});

test('quién escribe un mensaje: el «message in» de fuera solo lo escribe quien dio de alta al interlocutor, el de la casa la propia persona, y siempre el interlocutor de la conversación; el «message out», el agente o su dueño', async () => {
  const { eje, ids } = await ejemploNodo();
  const casa = ids.conversacionCasa;
  const tg = ids.conversacionTelegram;
  // Los buenos (los del ejemplo) entraron; y otra vuelta de cada uno pasa.
  assert.ok((await enSeco(eje, 'message in', casa, { text: 'otra pregunta' }, N.personaCasa, 3200)).ok);
  assert.ok((await enSeco(eje, 'message in', tg, { channel: 'telegram', text: 'otra' }, N.servicio, 3201)).ok);
  assert.ok((await enSeco(eje, 'message out', tg, { text: 'otra respuesta' }, N.agenteCasa, 3202)).ok);
  assert.ok((await enSeco(eje, 'message out', casa, { text: 'del dueño' }, N.operador, 3203)).ok, 'el dueño del agente también');
  // Un «message in» de fuera de quien no dio de alta al interlocutor (la persona de la casa habla por el de Telegram).
  assert.match(await aMano(eje, N.personaCasa, tg, '3000000000', mensaje('message in', 'telegram', N.interlocutor, 'suplantado'), 3204), /who writes a message/);
  // La pasarela que dio de alta al interlocutor mete un «message in» suyo en la conversación de otra persona (la de la casa).
  assert.match(await aMano(eje, N.servicio, casa, '3000000000', mensaje('message in', 'telegram', N.interlocutor, 'colado'), 3205), /a message names a channel and its interlocutor/);
  assert.equal((await enSeco(eje, 'message in', casa, { channel: 'telegram', interlocutor: N.interlocutor, text: 'colado' }, N.servicio, 3206)).ok, false);
  // En el canal de la casa, otra persona (la visita) escribe en la conversación de la persona de la casa: no.
  assert.match(await aMano(eje, N.visita, casa, '3000000000', mensaje('message in', 'house', N.visita, 'me cuelo'), 3207), /a message names a channel and its interlocutor/);
  assert.ok(!A.acciones(eje, casa, 3, N.visita).some((a) => a.nombre === 'message in'), 'ni se le ofrece');
  assert.ok(!A.acciones(eje, casa, 3, N.servicio).some((a) => a.nombre === 'message in'), 'ni a la pasarela en la conversación de otro');
  assert.ok(A.acciones(eje, casa, 3, N.personaCasa).some((a) => a.nombre === 'message in'));
  assert.ok(A.acciones(eje, tg, 3, N.servicio).some((a) => a.nombre === 'message in'));
  // «message in» de la casa con 1.1 distinto de quien escribe (el dueño del agente, en nombre de la persona).
  assert.match(await aMano(eje, N.operador, casa, '3000000000', mensaje('message in', 'house', N.personaCasa, 'en su nombre'), 3208), /who writes a message/);
  // «message out» de quien no es el agente ni su dueño: la persona de la casa, o otro agente (el vigía).
  assert.match(await aMano(eje, N.personaCasa, casa, '3000000000', mensaje('message out', 'house', N.personaCasa, 'me respondo'), 3209), /who writes a message/);
  assert.match(await aMano(eje, N.vigia, casa, '3000000000', mensaje('message out', 'house', N.personaCasa, 'otro agente'), 3210), /who writes a message/);
  // Un «message out» a otro interlocutor que el de su conversación, tampoco.
  assert.match(await aMano(eje, N.agenteCasa, casa, '3000000000', mensaje('message out', 'telegram', N.interlocutor, 'desviado'), 3211), /a message names a channel and its interlocutor/);
});

test('una conversación archivada no admite mensajes, tampoco escritos a mano', async () => {
  const { eje, ids } = await ejemplo();
  const vieja = ids.conversacionArchivada;
  assert.equal(eje.obtener(ids.archivada).en, '4000000000');
  assert.match(await aMano(eje, N.personaCasa, vieja, '3000000000', mensaje('message in', 'house', N.personaCasa, '¿sigue abierta?'), 3300), /an archived conversation takes no messages/);
  assert.match(await aMano(eje, N.agenteCasa, vieja, '3000000000', mensaje('message out', 'house', N.personaCasa, 'respuesta tardía'), 3301), /an archived conversation takes no messages/);
  assert.ok(!A.acciones(eje, vieja, 3, N.personaCasa).some((a) => a.nombre === 'message in'));
});

test('entrega: «failed» sin causa no; solo quien entrega y solo fuera de la casa; tras «failed» y «sent» vale «sent» y sale de «messages to deliver»', async () => {
  const { eje, ids } = await ejemploNodo();
  const tg = ids.conversacionTelegram;
  // El ejemplo: una fallida y su reintento enviado.
  assert.deepEqual(lecturaIds(eje, 'delivery', ids.saleTelegram), [ids.entregaEnviada]);
  assert.deepEqual(eje.obtener(ids.entregaFallida).payload[6], [['failed'], ['el canal no respondió a tiempo']]);
  assert.deepEqual(eje.obtener(ids.entregaEnviada).payload[6], [['sent'], ['-'], ['ref-ejemplo-42']], 'sin causa delante de la referencia: «-»');
  assert.deepEqual(lectura(eje, 'messages to deliver', tg), []);
  // Un mensaje nuevo: por entregar; falla: sigue; se envía: sale.
  const nuevo = await lanzar(eje, 'message out', tg, { text: 'un aviso' }, N.agenteCasa, 3400);
  assert.deepEqual(lecturaIds(eje, 'messages to deliver', tg), [nuevo.id]);
  assert.equal((await enSeco(eje, 'delivery result', nuevo.id, { result: 'failed' }, N.servicio, 3401)).ok, false, '«failed» sin causa');
  assert.match(await aMano(eje, N.servicio, nuevo.id, '4000000000', ['delivery result: failed', { ref: nuevo.id }, 'all announced movements happened', N.servicio, 'delivery result', 'delivery result', [['failed'], ['-']]], 3402), /a delivery result comes from whoever delivers/);
  const fallo = await lanzar(eje, 'delivery result', nuevo.id, { result: 'failed', cause: 'sin red' }, N.servicio, 3403);
  assert.deepEqual(lecturaIds(eje, 'delivery', nuevo.id), [fallo.id]);
  assert.deepEqual(lecturaIds(eje, 'messages to deliver', tg), [nuevo.id], 'con el último «failed» sigue por entregar');
  // Quien no dio de alta al interlocutor no entrega; en la casa no hay entrega.
  assert.match(await aMano(eje, N.personaCasa, nuevo.id, '4000000000', ['delivery result: sent', { ref: nuevo.id }, 'all announced movements happened', N.personaCasa, 'delivery result', 'delivery result', [['sent']]], 3404), /a delivery result comes from whoever delivers/);
  assert.match(await aMano(eje, N.personaCasa, ids.respuestaCasa, '4000000000', ['delivery result: sent', { ref: ids.respuestaCasa }, 'all announced movements happened', N.personaCasa, 'delivery result', 'delivery result', [['sent']]], 3405), /a delivery result comes from whoever delivers/);
  assert.ok(!A.acciones(eje, ids.respuestaCasa, 4, N.servicio).some((a) => a.nombre === 'delivery result'));
  const enviado = await lanzar(eje, 'delivery result', nuevo.id, { result: 'sent' }, N.servicio, 3406);
  assert.deepEqual(lecturaIds(eje, 'delivery', nuevo.id), [enviado.id]);
  assert.deepEqual(lectura(eje, 'messages to deliver', tg), []);
  // A igualdad de instante vale el de mayor id.
  const otro = await lanzar(eje, 'message out', tg, { text: 'otro aviso' }, N.agenteCasa, 3407);
  const a = await lanzar(eje, 'delivery result', otro.id, { result: 'sent' }, N.servicio, 3408);
  const b = await lanzar(eje, 'delivery result', otro.id, { result: 'failed', cause: 'duplicado' }, N.servicio, 3408);
  const mayor = [a, b].sort((x, y) => (x.id < y.id ? -1 : 1))[1];
  assert.deepEqual(lecturaIds(eje, 'delivery', otro.id), [mayor.id]);
  assert.deepEqual(lecturaIds(eje, 'messages to deliver', tg), mayor === b ? [otro.id] : []);
});

test('el peso de un mensaje: cuatro posiciones con solo texto', async () => {
  const { eje, ids } = await ejemplo();
  const coste = (id) => eje.obtener(id).movimientos.filter((m) => m.token === 'T' && m.a === null).reduce((s, m) => s + m.cantidad, 0);
  assert.equal(coste(ids.preguntaCasa), 4, '0, 1.0, 1.1 y 1.2: cuatro minutos');
  assert.equal(coste(ids.entraTelegram), 5, 'con un adjunto, cinco');
  assert.equal(coste(ids.respuestaCasa), 6, 'en respuesta a, sin adjunto: el adjunto va como «-», seis');
});

// Punto C (decidido por Core AGRAM al fundir: sin tocar el núcleo ni la 0, el alta con la dotación mínima).
/** «interlocutor of»: la identidad que lee la plantilla de lectura sobre el alta del servicio (∅ si no hay). */
const interlocutorDe = async (eje, ids, channel, fingerprint, minuto) => {
  const r = await A.transaccion(eje, 'interlocutor of', { X: ids.altaServicio, channel, fingerprint }, N.servicio, { t: hora(minuto) });
  assert.ok(r.ok, JSON.stringify(r.motivos));
  return r.lectura.mensaje;
};

test('register an interlocutor: una cosa del servicio sin clave, con un segundo de T, su canal y su huella; «interlocutor of» la da', async () => {
  const { eje, ids } = await ejemplo();
  const alta = eje.obtener(ids.interlocutor);
  assert.equal([alta.autor, alta.sobre, alta.en].join(' '), [N.servicio, ids.altaServicio, '1400000000'].join(' '), 'en el 1.4 de la propia alta del servicio');
  assert.deepEqual(alta.payload, [N.interlocutor, [1], ['all announced movements happened'], [[N.servicio], [N.interlocutor]], ['register an interlocutor'], ['interlocutor'], [['telegram'], [HUELLA]]]);
  assert.deepEqual(alta.movimientos.filter((m) => m.a !== null), [{ token: 'T', escala: 'segundo', cantidad: 1, de: N.servicio, a: N.interlocutor }], 'solo un segundo de T: lo mínimo para abrir su cuenta');
  assert.equal(eje.alta(N.interlocutor).id, ids.interlocutor);
  assert.equal(eje.esPersona(N.interlocutor), false, 'una cosa del servicio');
  assert.equal(eje.clave(N.interlocutor), undefined, 'sin clave: no actúa');
  assert.equal(await interlocutorDe(eje, ids, 'telegram', HUELLA, 3500), N.interlocutor);
  assert.equal(await interlocutorDe(eje, ids, 'telegram', 'ab'.repeat(32), 3501), '∅', 'una huella que nadie dio de alta: nada');
  assert.ok(A.acciones(eje, ids.altaServicio, 1, N.servicio).some((a) => a.nombre === 'register an interlocutor'), 'se ofrece al servicio sobre su alta');
});

test('register an interlocutor: el canal de la casa o fuera de la lista no; la huella mal formada no; la misma pareja dos veces por el mismo escritor no da dos', async () => {
  const { eje, ids } = await ejemploNodo();
  const alta = (params, minuto) => A.transaccion(eje, 'register an interlocutor', { X: ids.altaServicio, thing: 'interlocutor-prueba', channel: 'telegram', fingerprint: 'cd'.repeat(32), ...params }, N.servicio, { t: hora(minuto), firmar: (ev) => firmar(ev, CLAVES[N.servicio].privada) });
  for (const [cambio, parametro] of [
    [{ channel: 'house' }, 'channel'],
    [{ channel: 'fax' }, 'channel'],
    [{ fingerprint: 'CD'.repeat(32) }, 'fingerprint'],
    [{ fingerprint: 'cd'.repeat(31) }, 'fingerprint'],
    [{ fingerprint: 'cd'.repeat(32) + 'c' }, 'fingerprint'],
  ]) {
    const r = await alta(cambio, 3600);
    assert.equal(r.ok, false, JSON.stringify(cambio));
    assert.ok(r.motivos.some((m) => m.parametro === parametro), JSON.stringify(cambio) + ': ' + JSON.stringify(r.motivos));
  }
  // A mano, con el canal de la casa: la regla.
  const aManoCasa = await escribirPagando(eje, { autor: N.servicio, sobre: ids.altaServicio, en: '1400000000', t: hora(3601), movimientos: [pagaElCoste(N.servicio), { token: 'T', escala: 'segundo', cantidad: 1, de: N.servicio, a: 'de-la-casa' }], payload: ['de-la-casa', 1, 'all announced movements happened', [N.servicio, 'de-la-casa'], 'register an interlocutor', 'interlocutor', [['house'], ['cd'.repeat(32)]]] }, CLAVES[N.servicio].privada).then(() => null, (e) => e.message);
  assert.match(aManoCasa, /an interlocutor is registered once/);
  // La misma pareja de canal y huella que ya dio de alta (la del ejemplo), con otro nombre: no entra; la lectura da la primera.
  const otra = await alta({ thing: 'interlocutor-repetido', fingerprint: HUELLA }, 3602);
  assert.equal(otra.ok, false);
  assert.ok(otra.motivos.some((m) => /an interlocutor is registered once|ya dio de alta/.test(m.mensaje)), JSON.stringify(otra.motivos));
  assert.equal(eje.alta('interlocutor-repetido'), null);
  assert.equal(await interlocutorDe(eje, ids, 'telegram', HUELLA, 3603), N.interlocutor);
  // La misma huella en otro canal sería otra pareja: aquí solo hay un canal de fuera, así que se comprueba con una huella nueva.
  const nueva = await alta({}, 3604);
  assert.ok(nueva.ok, JSON.stringify(nueva.motivos));
  await eje.anadir(nueva.evento);
  assert.equal(await interlocutorDe(eje, ids, 'telegram', 'cd'.repeat(32), 3605), 'interlocutor-prueba');
  assert.equal((await alta({ thing: 'otra-vez' }, 3606)).ok, false, 'y esa, dos veces, tampoco');
});

test('Telegram de punta a punta con «register an interlocutor»; un interlocutor de fuera que no es de tipo «interlocutor» no vale', async () => {
  const { eje, ids } = await ejemploNodo();
  const fp = createHash('sha256').update('agram/prueba/interlocutor-2').digest('hex');
  await lanzar(eje, 'register an interlocutor', ids.altaServicio, { thing: 'interlocutor-2', channel: 'telegram', fingerprint: fp }, N.servicio, 3700);
  assert.equal(await interlocutorDe(eje, ids, 'telegram', fp, 3701), 'interlocutor-2');
  const conv = await lanzar(eje, 'open a conversation', ids.agenteCasa, { interlocutor: 'interlocutor-2', title: 'Por Telegram' }, N.servicio, 3702);
  const entra = await lanzar(eje, 'message in', conv.id, { channel: 'telegram', text: 'hola', file: 'telegram:AgAD-prueba_2' }, N.servicio, 3703);
  const sale = await lanzar(eje, 'message out', conv.id, { text: 'hola, ¿qué necesitas?', 'reply to': entra.id }, N.agenteCasa, 3704);
  assert.deepEqual(lecturaIds(eje, 'messages to deliver', conv.id), [sale.id]);
  await lanzar(eje, 'delivery result', sale.id, { result: 'failed', cause: 'sin red' }, N.servicio, 3705);
  assert.deepEqual(lecturaIds(eje, 'messages to deliver', conv.id), [sale.id]);
  const enviado = await lanzar(eje, 'delivery result', sale.id, { result: 'sent', reference: 'ref-prueba-2' }, N.servicio, 3706);
  assert.deepEqual(lecturaIds(eje, 'delivery', sale.id), [enviado.id]);
  assert.deepEqual(lectura(eje, 'messages to deliver', conv.id), []);
  assert.deepEqual(lectura(eje, 'message count', conv.id), [2]);
  // Una cosa del servicio que no es de tipo «interlocutor» (dada de alta a mano, sin el 5): no abre conversación de fuera.
  await escribirPagando(eje, { autor: N.servicio, sobre: ids.altaServicio, en: '1400000000', t: hora(3707), movimientos: [pagaElCoste(N.servicio), { token: 'T', escala: 'segundo', cantidad: 1, de: N.servicio, a: 'cosa-sin-tipo' }], payload: ['cosa-sin-tipo', 1, 'all announced movements happened', [N.servicio, 'cosa-sin-tipo'], 'register a thing'] }, CLAVES[N.servicio].privada);
  const r = await A.transaccion(eje, 'open a conversation', { X: ids.agenteCasa, interlocutor: 'cosa-sin-tipo' }, N.servicio, { t: hora(3708), firmar: (ev) => firmar(ev, CLAVES[N.servicio].privada) });
  assert.equal(r.ok, false);
  assert.ok(r.motivos.some((m) => /who opens|abre una conversación/.test(m.mensaje)), JSON.stringify(r.motivos));
  // Ni escribe en su nombre en una conversación (a mano) que lo nombrara.
  assert.match(await aMano(eje, N.servicio, conv.id, '3000000000', mensaje('message in', 'telegram', 'cosa-sin-tipo', 'colado'), 3709), /a message names a channel and its interlocutor|who writes a message/);
});
