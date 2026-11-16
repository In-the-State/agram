// La época de la clase `state` (encargo «época del nodo», VG 16-11, #124): la fuente en datos/epocas/state/, heredada
// de la época 0 definitiva, y el eje de ejemplo de un nodo (ejemplos/state/nodo.mjs). Docs: docs/EPOCA_STATE.md.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { generar, archivos, epocaState } from '../datos/epocas/state/generar.mjs';
import { EPOCA_0_BTML, cargarEpocaEscrita } from '../src/epocas.js';
import { Eje } from '../src/eje.js';
import * as A from '../src/acciones.js';
import * as contrato from '../src/contrato.js';
import { cerrado } from '../src/motor.js';
import { ContextoEje } from '../src/contexto-eje.js';
import { evaluar } from '../src/bqlm.js';
import { firmar } from '../src/autoridad.js';
import { sinTraducir } from '../docs/sin-traducir.mjs';
import { ejemploNodo, N, CLAVES, hora } from '../ejemplos/state/nodo.mjs';
import { ejemploCompra } from '../ejemplos/ikisai/compra-food.mjs';
import { escribirPagando, pagaElCoste } from '../ejemplos/ikisai/coste.mjs';

/** El id de la época 0 definitiva (no cambia con esta época). */
const ID_DE_LA_0 = '1a7dd4ec24e4b5c1fdfbe19d291b66b859652a689d32af9e92513987122ff67b';
const CAMINO = ['register the node', 'register the authority', 'register the relay', 'register the archive', 'declare a context', 'put in service'];
const PAPELES = ['authority', 'container', 'relay', 'gate', 'archive', 'deployment', 'worker', 'agent', 'context', 'served ledger', 'connection'];

let completo = null;
/** El eje de ejemplo entero (se construye una vez; las pruebas que escriben construyen el suyo). */
const ejemplo = () => (completo ??= ejemploNodo());
const leer = (eje, formula, sujeto) => evaluar(formula, new ContextoEje(eje, { epoch: eje.epoca() }), { sujeto });
const estacion = (eje, id) => A.ejecuciones(eje, eje.obtener(id).sobre).find((x) => x.ocupante.ref === id)?.estacion ?? null;
const HECHA = 'count (first it2.6).8.7 = count (first it2.6).8.8 and not (it2 in (first it.4).8)';

test('la época se genera desde su fuente, sin fallos, y los archivos están al día', () => {
  const g = generar();
  assert.equal(g.fallos, 0, g.informe.join('\n'));
  for (const [ruta, texto] of Object.entries(archivos(g))) assert.equal(readFileSync(ruta, 'utf8'), texto, `${ruta} no está al día: npm run epoca:state`);
  assert.equal(g.registros.length, 34, '2 reglas y 32 plantillas de transacción');
  const ids = JSON.parse(readFileSync('datos/epocas/state/state-0.ids.json', 'utf8'));
  assert.equal(ids.registrosAlPublicar, 36, 'el génesis, la raíz y sus 34 registros');
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
  assert.equal(e.transacciones.length, EPOCA_0_BTML.transacciones.length + 32);
  assert.equal(e.reglasConId.length, EPOCA_0_BTML.reglasConId.length, 'sus dos reglas sustituyen a las de la 0 con el mismo nombre');
  for (const n of ['second factor', 'attention has a price']) assert.notEqual(e.reglasConId.find((x) => x.regla[0][0] === n).id, EPOCA_0_BTML.reglasConId.find((x) => x.regla[0][0] === n).id);
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
  for (const k of ['autoridad', 'rele', 'archivo', 'contexto', 'contenedor', 'puerta', 'despliegue', 'worker', 'vigia', 'ejecutor', 'ejeServido', 'conexion']) {
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

test('conexiones: una añadida y autorizada, con sus permisos cambiados; otra quitada; el eje es la única fuente', async () => {
  const { eje, ids } = await ejemplo();
  for (const k of ['conexion', 'permisos', 'otraConexion', 'quitarConexion']) assert.ok(A.segundoFactor(eje, ids[k]).exige, k + ' requiere autorización');
  const vigentes = leer(eje, `((down it) where last (first it2.6).5 = "4100000000" and "connection" in (payload(it2)).5 and ${HECHA} and count ((down it2) where "remove a connection" in (payload(it3)).4) = 0) each 0`, ids.nodo);
  assert.deepEqual(vigentes.valor, ['nodo-vecino']);
  const permisos = leer(eje, `(payload(last ((down it) where "change a connection's permissions" in (payload(it2)).4 and ${HECHA}))).6`, ids.conexion);
  assert.deepEqual(permisos.valor, ['leer-salud']);
  assert.match(eje.obtener(ids.conexion).payload[6][0][0], /^[0-9a-f]{64}$/, 'la clave del otro nodo, x-only: un dato');
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
