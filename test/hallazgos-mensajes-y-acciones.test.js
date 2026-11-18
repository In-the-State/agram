// Tres hallazgos sin explicar (investigación de Core AGRAM, 19-11), fijados como pruebas. Lo que hoy pasa por diseño se
// comprueba tal cual; lo que hoy falla y no debería va marcado como pendiente ({ todo: true }) hasta que se arregle.
//
// 1. Los mensajes de la época state («message in from an agent», «message out» con `give`) que no entran con «release
//    from: la posición está vacía»: falta el cupo del otro lado (una reserva que nombre a quien escribe, llena), que
//    antesDelMensaje no puede poner porque es R de otro. Con él, entran. El motivo es un PENDIENTE crudo del 4 de la
//    plantilla, no el de la regla.
// 2. Las funciones de la carta que reciben el eje toman su época por defecto (antesDelMensaje y formulario con el id de
//    una acción de un libro cuya época no es la 0; los retoques y las propuestas de fuera, igual).
// 3. «issue E tied to X» en el punto de vista 1 de la compra del ejemplo de la carta.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ejemploNodo, N, CLAVES, hora, claveDePrueba } from '../ejemplos/state/nodo.mjs';
import * as A from '../src/acciones.js';
import { firmar, firmarPosesion } from '../src/autoridad.js';
import { quemaDelCoste } from '../src/escritura.js';
import { registrosParaUnMensaje, cupo, RESERVA } from '../datos/epocas/state/ayuda.mjs';
import { antesDelMensaje, formulario, comprobarRetoque, textoDeNacimiento } from '../carta/carta.js';
import { evaluar as evaluarPropuesta } from '../carta/externa.js';
import { ajustesDelElemento, reglasDelLibro } from '../carta/reglas.js';
import { EPOCA_0_BTML } from '../src/epocas.js';
import * as compraFood from '../ejemplos/ikisai/compra-food.mjs';
import { EJEMPLOS } from '../carta/ejemplos.js';
import { generarClaves } from '../src/autoridad.js';

/** El nodo de ejemplo con un segundo agente que abre una conversación con el de la casa (agente con agente). */
async function agenteConAgente() {
  const { eje, ids } = await ejemploNodo();
  const epoca = eje.epoca();
  const K = { ...CLAVES, otro: claveDePrueba('agente-otro') };
  let m = 24 * 60 + 60; // el día siguiente: el operador ya gastó el T de hoy
  const t = () => hora(m++);
  const hacer = async (nombre, X, params, quien, { cosa } = {}) => {
    const r = await A.transaccion(eje, nombre, { X, ...params }, quien, { t: t(), epoca, firmar: (ev) => firmar(ev, K[quien].privada) });
    let ev = r.evento;
    if (cosa && ev) ev = await firmarPosesion(ev, cosa, K[cosa].privada);
    const motivos = ev ? await eje.validar(ev) : [];
    if (!ev || motivos.length || (!r.ok && !cosa)) return { ok: false, motivos: [...r.motivos.map((x) => x.mensaje), ...motivos] };
    await eje.anadir(ev);
    return { ok: true, ev };
  };
  const otro = (await hacer('register an agent', ids.nodo, { thing: 'otro', minutes: 600, key: K.otro.publica, model: 'simulado', limits: ['uno'] }, N.operador, { cosa: 'otro' })).ev.id;
  assert.ok((await hacer('declare agent', otro, {}, N.operador)).ok);
  // El otro agente lleva R de su dueño para abrir (y pagar el precio).
  const pl = ['R para el otro agente'];
  await eje.escribir({ autor: N.operador, sobre: otro, t: t(), movimientos: [quemaDelCoste(N.operador, pl, 'minuto', { eje }), { token: 'R', emisor: N.operador, cantidad: 3, de: null, a: N.operador }, { token: 'R', emisor: N.operador, cantidad: 3, de: N.operador, a: 'otro' }], payload: pl }, K[N.operador].privada);
  const abierta = await hacer('open a conversation as an agent', ids.agenteCasa, {}, 'otro');
  assert.ok(abierta.ok, JSON.stringify(abierta.motivos));
  const mandar = async (quien, opciones) => {
    let ultimo = null;
    for (const x of registrosParaUnMensaje(eje, abierta.ev.id, quien, opciones)) {
      const { X, ...resto } = x.params;
      ultimo = await hacer(x.plantilla, X, resto, quien);
      if (!ultimo.ok) return { plantilla: x.plantilla, ...ultimo };
    }
    return ultimo;
  };
  return { eje, ids, conv: abierta.ev.id, hacer, mandar };
}

test('1. «message in from an agent»: sin la reserva del lado de la casa no entra (release from vacío); con ella, llena, entra', async () => {
  const { eje, conv, hacer, mandar } = await agenteConAgente();
  const sinCupo = await mandar('otro', { esAgente: true, text: 'hola' });
  assert.equal(sinCupo.ok, false);
  assert.match(sinCupo.motivos.join(' '), /release from: la posición está vacía/);
  // Lo que falta en el libro: el dueño del agente de la casa reserva para el otro y la llena.
  const reserva = await hacer(RESERVA, conv, { spender: 'otro', modes: 'return' }, N.operador);
  assert.ok((await hacer('fill a reserve', reserva.ev.id, { amount: 1 }, N.operador)).ok);
  const conCupo = await mandar('otro', { esAgente: true, text: 'hola' });
  assert.ok(conCupo.ok, JSON.stringify(conCupo.motivos));
  // «message out» con give: entra mientras hay cupo; sin él (ya gastado), el mismo «release from» vacío.
  assert.equal(cupo(eje, conv), 1);
  assert.ok((await mandar(N.agenteCasa, { text: 'respuesta', give: 1 })).ok);
  assert.equal(cupo(eje, conv), 0);
  const otraVez = await mandar(N.agenteCasa, { text: 'otra', give: 1 });
  assert.match(otraVez.motivos.join(' '), /release from: la posición está vacía/);
});

test('1. sin cupo, el motivo debería ser el de la regla (quién escribe un mensaje y con qué R), no un PENDIENTE crudo del 4', { todo: true }, async () => {
  const { mandar } = await agenteConAgente();
  const r = await mandar('otro', { esAgente: true, text: 'hola' });
  assert.doesNotMatch(r.motivos.join(' '), /PENDIENTE/);
});

/** El nodo de ejemplo (época state), construido una vez para las pruebas del 2. */
let nodo;
const elNodo = async () => (nodo ??= await ejemploNodo());

test('2. carta.js: formulario y antesDelMensaje sin `epoca`, con el id de la acción (lo que pasa la carta), leen la época del libro', async () => {
  const { eje, ids } = await elNodo();
  const epoca = eje.epoca();
  const id = A.plantillasDeTransaccion({ epoca }).find((p) => p.nombre === 'message in').id;
  assert.equal(A.plantillaDeTransaccion(id), null, 'la 0 no la trae: sin el eje, plantillaDeTransaccion no puede saberlo');
  const valores = { channel: 'house', text: 'otra pregunta' };
  // En la conversación de Telegram la persona de la casa no tiene reserva: antesDelMensaje la pone delante.
  const conEpoca = await antesDelMensaje(eje, ids.conversacionTelegram, id, valores, N.personaCasa, { epoca });
  assert.deepEqual(conEpoca.registros.map((r) => r.plantilla), [RESERVA]);
  assert.deepEqual(await antesDelMensaje(eje, ids.conversacionTelegram, id, valores, N.personaCasa, {}), conEpoca);
  assert.deepEqual(await antesDelMensaje(eje, ids.conversacionTelegram, id, valores, N.personaCasa, { idioma: 'es' }), await antesDelMensaje(eje, ids.conversacionTelegram, id, valores, N.personaCasa, { idioma: 'es', epoca }));
  const f = formulario(eje, ids.conversacionCasa, id, N.personaCasa, valores);
  assert.ok(f, 'sin opciones, como lo llama la app');
  assert.deepEqual(f, formulario(eje, ids.conversacionCasa, id, N.personaCasa, valores, { epoca }));
  // Lo que se pasa explícito manda: con la 0, la acción no existe.
  assert.equal(formulario(eje, ids.conversacionCasa, id, N.personaCasa, valores, { epoca: EPOCA_0_BTML }), null);
});

test('2. carta.js: los retoques de un texto que solo trae la época del libro (comprobarRetoque, sin `epoca`)', async () => {
  const { eje } = await elNodo();
  const epoca = eje.epoca();
  const yo = eje.obtener(eje.genesisId).autor; // el titular: el autor del génesis retoca
  const clave = 'template message in';
  assert.notEqual(textoDeNacimiento(clave, 'es', { epoca }), null, 'la clave es de la época state');
  assert.equal(textoDeNacimiento(clave, 'es'), null, 'y la 0 no la tiene');
  const pedido = { clave, idioma: 'es', texto: 'Mensaje que entra' };
  assert.deepEqual(comprobarRetoque(eje, yo, pedido), comprobarRetoque(eje, yo, pedido, { epoca }));
});

test('2. externa.js: una propuesta que nombra una acción de la época del libro se evalúa sin `epoca`', async () => {
  const { eje, ids } = await elNodo();
  const epoca = eje.epoca();
  const propuesta = { id: 'p1', accion: 'message in', sobre: ids.conversacionCasa, parametros: { channel: 'house', text: 'hola' }, porque: 'prueba' };
  const sin = evaluarPropuesta(eje, N.personaCasa, propuesta);
  assert.deepEqual(sin, evaluarPropuesta(eje, N.personaCasa, propuesta, { epoca }));
  assert.doesNotMatch(String(sin.motivo ?? ''), /desconocid|unknown/i);
});

test('2. reglas.js: sin `epoca` da lo mismo que con la del libro (sus acciones son de la 0: aquí no cambia nada visible)', async () => {
  const { eje, ids } = await elNodo();
  const epoca = eje.epoca();
  const yo = eje.obtener(eje.genesisId).autor;
  assert.deepEqual(ajustesDelElemento(eje, ids.nodo, N.operador), ajustesDelElemento(eje, ids.nodo, N.operador, { epoca }));
  assert.deepEqual(reglasDelLibro(eje, yo), reglasDelLibro(eje, yo, { epoca }));
});

test('3. «issue E tied to X»: el núcleo la ofrece en el PV 1 a quien tiene P sobre X entero (o su mirada 1)', async () => {
  const { eje, compra } = await compraFood.ejemploCompra();
  const nombres = (k, yo) => A.acciones(eje, compra.id, k, yo).map((a) => a.nombre);
  assert.ok(nombres(1, 'huesped').includes('issue E tied to X'));
  for (let k = 0; k <= 9; k++) if (k !== 1) assert.ok(!nombres(k, 'huesped').includes('issue E tied to X'), 'solo en el 1');
  assert.ok(!nombres(1, 'casa').includes('issue E tied to X'), 'la casa no tiene P sobre la compra');
});

test('3. en el ejemplo de la carta (con el jardín), la huésped debería poder emitir una E atada a la compra en su PV 1', { todo: true }, async () => {
  const claves = {};
  for (const n of ['casa', 'cocina', 'huesped']) claves[n] = await generarClaves();
  const { eje, foco } = await EJEMPLOS[0].crear(compraFood, claves);
  // Hoy no: el jardín baja todo su P de la compra a la mirada 2 («mi criterio, a la mirada 2»), y la condición de la
  // plantilla pide P sobre la compra entera o su mirada 1.
  assert.ok(A.acciones(eje, foco, 1, 'huesped').some((a) => a.nombre === 'issue E tied to X'));
});
