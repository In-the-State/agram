// Lo que la revisión de pantalla vio en inglés con la carta en español (Core AGRAM 19-11): el 0 de un registro que escribió
// una acción, nombrado en el diario y en los desplegables (contrato.legible lo recompone en el idioma); los valores internos
// de un formulario (contrato.valorLegible, contrato.movimientoEnLlano) y los «no» del eje (contrato.motivoEnLlano y
// rechazoEnLlano, con la forma que ahora da el eje a los fallos de la aritmética del libro).

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../src/contrato.js';
import * as A from '../src/acciones.js';
import { Eje } from '../src/eje.js';
import { crearEvento } from '../src/evento.js';
import { generarClaves } from '../src/autoridad.js';
import { EJEMPLOS } from '../carta/ejemplos.js';
import { arbol, formulario } from '../carta/carta.js';
import * as compraFood from '../ejemplos/ikisai/compra-food.mjs';
import { entrarPorInvitacion } from '../ejemplos/ikisai/altas.mjs';
import { pagaElCoste } from './ayudas-coste.js';

const almacen = new Map();
globalThis.localStorage ??= { getItem: (k) => almacen.get(k) ?? null, setItem: (k, v) => almacen.set(k, String(v)), removeItem: (k) => almacen.delete(k) };
const Q = await import('../carta/cuentas.js');

const ES = { idioma: 'es' };
let compra;
before(async () => {
  const claves = {};
  for (const n of ['casa', 'cocina', 'huesped']) claves[n] = await generarClaves();
  compra = await EJEMPLOS[0].crear(compraFood, claves);
});

/** Las cadenas de un árbol de la carta (sin los valores en crudo) que empiezan por el nombre de una acción y «: ». */
function enIngles(eje, a) {
  const nombres = A.plantillasDeTransaccion({ epoca: eje.epoca() }).map((p) => p.nombre);
  const fuera = [];
  (function anda(v) {
    if (typeof v === 'string') {
      if (nombres.some((n) => v.startsWith(n + ': ') || v.includes(' ' + n + ': ') || v.includes('«' + n + ': '))) fuera.push(v);
    } else if (Array.isArray(v)) v.forEach(anda);
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) if (k !== 'valor' && k !== 'btml') anda(x);
  })(a);
  return fuera;
}

test('1. el 0 que escribió una acción, nombrado en el diario y en un desplegable, sale en español', async () => {
  const { eje, foco } = compra;
  // El diario (PV6): «crear 10 P sobre commit time: huesped locks 5 …» decía el 0 en crudo.
  const diario = await arbol({ foco: { X: foco, pv: 6 }, niveles: {} }, eje, 'huesped', { ancho: 1200, alto: 900 }, ES);
  assert.deepEqual(enIngles(eje, diario), []);
  // Un desplegable: las opciones de «declare future T» ofrecían «pay: huesped pays …».
  const a = A.acciones(eje, foco, 7, 'huesped').find((x) => x.nombre === 'declare future T') ?? A.acciones(eje, foco, 4, 'huesped').find((x) => x.nombre === 'declare future T');
  const f = formulario(eje, foco, a.id, 'huesped', {}, ES);
  const opciones = f.campos.flatMap((c) => (c.opciones ?? []).map((o) => o.texto));
  assert.ok(opciones.some((t) => /paga lo anunciado/.test(t)), JSON.stringify(opciones));
  assert.deepEqual(enIngles(eje, f), []);
  // legible de un registro y de una serie P sobre él: su 0 en el idioma.
  const pago = eje.orden.map((id) => eje.obtener(id)).find((ev) => [].concat(ev.payload?.[4] ?? []).includes('pay'));
  assert.equal(C.legible(eje, { ref: pago.id }, undefined, ES).texto, 'Alta de huesped paga lo anunciado en Compra del menú del día');
  assert.match(C.legible(eje, { ref: pago.id }).texto, / pays what was announced in Compra del menú del día$/, 'sin idioma, el canónico sin el nombre delante');
  // Un alta nueva con su HTML inicial: la representación de su PV0 («attach a file: … to ∅»).
  const c = await Q.crearCuenta({ nombre: 'Ana Repaso', idioma: 'es', htmlInicial: true });
  const pv0 = await arbol({ foco: { X: c.cuenta.alta, pv: 0 }, niveles: {} }, c.eje, c.cuenta.identidad, { ancho: 1200, alto: 900 }, ES);
  assert.deepEqual(enIngles(c.eje, pv0), []);
});

test('2. los valores internos de un formulario: valorLegible (con dato provisional) y los movimientos de «proponer», en llano', () => {
  const { eje, foco } = compra;
  assert.equal(C.valorLegible(eje, 'whole', { plantilla: 'commit P', parametro: 'view', ...ES }).texto, 'todo');
  assert.equal(C.valorLegible(eje, 'aggregate', { plantilla: 'aggregate T', parametro: 'type', ...ES }).texto, 'agregado');
  assert.equal(C.valorLegible(eje, 'aggregate T', ES).texto, 'agrupar T', 'lo que no tiene «value …», legible como siempre');
  assert.equal(C.valorLegible(eje, 'whole').texto, 'whole');
  const p = A.parametros(A.plantillaDeTransaccion('propose', { epoca: eje.epoca() }), { ...ES, epoca: eje.epoca() }).find((x) => x.nombre === 'content');
  const textos = C.opciones(eje, foco, null, { yo: 'huesped', ...ES, parametro: p }).map((o) => o.texto);
  assert.ok(textos.includes('Alta de huesped da 1 hora'), JSON.stringify(textos));
  assert.ok(!textos.some((t) => /→|burn|transfer/.test(t)), JSON.stringify(textos));
});

test('3. los «no» del eje: los fallos de la aritmética del libro tienen forma y salen en llano en los dos idiomas', async () => {
  const T = '2026-11-08T10:00:00Z';
  const eje = await Eje.genesis({ demostracion: true, identidad: 'g', t: T, foco: 'raíz', emision: [{ token: 'R', cantidad: 10 }] });
  await entrarPorInvitacion(eje, { por: 'g', quien: 'ana', t: T, da: [] });
  const falla = async (movimientos) => {
    try {
      await eje.escribir({ autor: 'ana', sobre: eje.genesisId, t: T, movimientos: [pagaElCoste('ana'), ...movimientos], payload: ['x'] });
    } catch (e) {
      return e;
    }
    assert.fail('entró');
  };
  const sinSaldo = await falla([{ token: 'R', emisor: 'g', cantidad: 50, de: 'ana', a: 'g' }]);
  assert.match(sinSaldo.message, /saldo insuficiente de R:g en ana/, 'el texto de siempre no cambia');
  assert.deepEqual(sinSaldo.motivos.map((m) => [m.que, m.partes]), [['insufficient balance', { series: 'R:g', holder: 'ana' }]]);
  assert.equal(C.rechazoEnLlano(eje, sinSaldo, ES), 'Alta de ana no tiene bastante R de g');
  assert.equal(C.rechazoEnLlano(eje, sinSaldo), 'Alta de ana does not have enough R of g');
  const bloqueo = await falla([{ token: 'R', emisor: 'g', cantidad: 5, de: 'ana', a: 'ana', estado: 'bloqueo', salida: 'x' }]);
  assert.match(C.rechazoEnLlano(eje, bloqueo, ES), /Alta de ana no tiene disponible bastante R de g para bloquear$/);
  const liberar = await falla([{ token: 'R', emisor: 'g', cantidad: 5, de: 'ana', a: 'ana', estado: 'liberacion', salida: 'x' }]);
  assert.match(C.rechazoEnLlano(eje, liberar, ES), /Alta de ana no tiene 5 de R de g bloqueado con la salida x$/);
  // Con el registro rechazado, también el motivo de una regla de la época, en el idioma.
  const ev = await crearEvento({ autor: 'ana', sobre: eje.genesisId, t: T, movimientos: [pagaElCoste('ana'), { token: 'R', emisor: 'g', cantidad: 5, de: 'ana', a: 'ana', estado: 'bloqueo', salida: 'x' }], payload: ['x'] });
  const e = await eje.anadir(ev).then(() => null, (x) => x);
  assert.doesNotMatch(C.rechazoEnLlano(eje, e, { ...ES, ev }), /attention has a price|writes to/);
  // Un motivo sin forma, tal cual; un error sin motivos, su mensaje.
  assert.equal(C.motivoEnLlano(eje, { texto: 'algo' }, ES), 'algo');
  assert.equal(C.rechazoEnLlano(eje, new Error('otro'), ES), 'otro');
});
