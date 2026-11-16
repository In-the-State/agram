// «Reglas del libro» y «Ajustes de este elemento» en la carta (A21 y A23, tramo 2, paso 4; agram-equipo/
// DISENO_GOBIERNO_Y_MOTOR.md §7 y §8; carta/reglas.js): la vista lista los cambios con su estado; el detalle de un cambio de
// parámetro enseña el valor de hoy y el nuevo; la barra da el apoyo y lo que falta; apoyar escribe «support a change» y la
// barra se mueve; quien no está en la lista de nombres ve el aviso; aprobar solo se ofrece cuando «approved» pasa; poner en
// vigor solo cuando la prueba llega; en vigor, la versión vigente cambia y el valor nuevo se ve; una propuesta que toca el
// suelo avisa y no se escribe; un título con signos de marcado sale escapado; «Ajustes de este elemento» da lo fijado y lo
// heredado; con el guardián, los registros del gobierno piden diálogo. Sin navegador: ejes en memoria, identidades
// inventadas y claves de prueba generadas en cada ejecución.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Eje } from '../src/eje.js';
import * as A from '../src/acciones.js';
import { EPOCA_0_BTML } from '../src/epocas.js';
import { generarClaves } from '../src/autoridad.js';
import { reglasDelLibro, cambioDelLibro, actuar, proponer, parametrosMovibles, comprobarPropuesta, cambioDeDatos, ajustesDelElemento, pideDialogo, APOYAR } from '../carta/reglas.js';
import { htmlReglas, htmlAjustesDelElemento, htmlConfiguracion } from '../carta/dom.js';
import { preferencias } from '../carta/carta.js';
import { segundoFactorDe } from '../carta/anfitrion.js';
import { t } from '../carta/textos.js';
import { selloEnCascada } from '../ejemplos/ikisai/sellos.mjs';
import { declararExterior, observadorDePrueba } from './ayudas-sello.js';

const T0 = '2026-11-17T08:00:00Z';
const ID0 = EPOCA_0_BTML.id;
const M = { ref: ID0 };
const ES = { idioma: 'es' };

/**
 * Un libro de ana (la dueña) con `invitados`. Con `nombres` o `n3`, su época es una hija de prueba de la 0 escrita en su
 * génesis que fija quién cuenta (7.9.5) y el nivel de firmeza de un cambio corriente (7.9.3); sin ellos, la 0.
 */
async function mundo({ nombres, n3, invitados = ['bea'] } = {}) {
  const hija = nombres !== undefined || n3 !== undefined;
  const raiz = [['reglas de prueba'], M, M, M, M, M, [['una hija de prueba de la 0 (test/carta-reglas.test.js)'], ['hereda'], [ID0]], [M, M, M, M, M, M, M, M, M, [M, M, M, [n3 ?? 3], [4], nombres ?? [0]]]];
  const eje = await Eje.genesis({ identidad: 'ana', foco: ['el libro de ana'], t: T0, demostracion: true, ...(hija ? { epoca: { raiz, registros: [] } } : {}) });
  let s = 0;
  const reloj = () => new Date(Date.parse(T0) + (++s) * 60_000).toISOString().replace('.000Z', 'Z');
  for (const n of invitados) {
    const inv = await eje.invitar({ autor: 'ana', invitado: n, t: reloj() });
    await eje.aceptar(inv, {}, { t: reloj() });
  }
  const o = () => ({ ...ES, t: reloj() });
  const hace = async (que, id, yo) => {
    const r = await actuar(eje, id, que, yo, undefined, o());
    assert.ok(r.asentado, que + ' de ' + yo + ': ' + JSON.stringify(r.motivos));
    return r.asentado;
  };
  const propone = async (yo, datos) => {
    const r = await proponer(eje, yo, datos, undefined, o());
    assert.ok(r.asentado, 'proponer: ' + (r.aviso ?? '') + JSON.stringify(r.motivos));
    return r.asentado;
  };
  return { eje, reloj, o, hace, propone };
}

const MARGEN = { titulo: 'más margen', explicacion: 'el reloj del libro puede ir hasta 15 minutos por delante', posicion: 'epoch.7.3.0', valor: '900' };
const que = (d) => d.acciones.map((a) => a.que);

test('carta-reglas: la vista lista los cambios con su estado; el detalle enseña el valor de hoy y el nuevo; la barra da el apoyo y lo que falta', async () => {
  const m = await mundo({ nombres: ['ana', 'bea'], n3: 0 });
  const { eje } = m;
  const vacia = reglasDelLibro(eje, 'ana', ES);
  assert.deepEqual([vacia.gobierno, vacia.version.cambios, vacia.cambios.length, vacia.puedeProponer], [true, 0, 0, true]);
  assert.match(htmlReglas({ lista: vacia }), /Las reglas son las de nacimiento del libro/);
  // El formulario parte del valor de hoy: la lista empieza por la fila de gobierno, y el margen del reloj vale 600.
  const params = parametrosMovibles(eje);
  assert.equal(params[0].posicion, 'epoch.7.9.1');
  assert.deepEqual(params.find((p) => p.posicion === 'epoch.7.3.0').hoy, [600]);
  const p = await m.propone('ana', MARGEN);
  assert.deepEqual([p.sobre, p.payload[2], p.payload[4]], [eje.genesisId, ['ordinary'], ['propose a change']]);
  const q = await m.propone('ana', { ...MARGEN, titulo: 'otro', valor: '700' });
  const v = reglasDelLibro(eje, 'ana', ES);
  assert.deepEqual(v.cambios.map((c) => [c.titulo, c.estado, c.claseLlana]), [['otro', 'propuesto', 'corriente'], ['más margen', 'propuesto', 'corriente']], 'lo más nuevo arriba');
  const h = htmlReglas({ lista: v });
  assert.match(h, /data-reglas-cambio="[0-9a-f]{64}"><span class="reglas-cambio-titulo">otro<\/span> <small class="reglas-estado" data-estado="propuesto">propuesto<\/small>/);
  // El detalle: la pieza que toca, hoy y cómo queda.
  const d = cambioDelLibro(eje, p.id, 'ana', ES);
  assert.deepEqual(d.piezas, [{ tipo: 'parametro', posicion: '7.3.0', nombre: t('reglaPosicion_7_3_0'), hoy: '600', queda: '900' }]);
  const hd = htmlReglas({ lista: v, cambio: d });
  assert.match(hd, /<small>hoy<\/small> 600<\/span> → <span class="reglas-valor-queda"><small>queda<\/small> 900<\/span>/);
  // La barra: nadie apoya; hace falta más de la mitad.
  assert.deepEqual([d.barra.apoyo, d.barra.umbral, d.barra.falta, d.barra.aprobada, d.barra.apoyos.length], [0, 0.5, 0.5, false, 0]);
  assert.match(hd, /Apoyo: 0 % · hace falta más de 50 % · falta 50 %/);
  assert.match(hd, /Nadie lo apoya todavía\./);
  assert.ok(que(d).includes('apoyar') && que(d).includes('retirar'), 'apoyar, y retirar la propuesta para quien la propuso');
  assert.ok(!que(cambioDelLibro(eje, p.id, 'bea', ES)).includes('retirar'), 'retirar, solo quien propuso');
  // Cada acción con su coste en T, como el formulario de cualquier acción.
  assert.ok(d.acciones.find((a) => a.que === 'apoyar').coste.exigido > 0);
  assert.match(hd, /data-reglas-actuar="apoyar"[^>]*>Apoyar con mi P<\/button> <small class="reglas-coste">cuesta /);
  assert.equal(cambioDelLibro(eje, q.id, 'ana', ES).piezas[0].queda, '700');
});

test('carta-reglas: apoyar escribe «support a change» y la barra se mueve; quien no está en la lista ve el aviso; aprobar solo cuando «approved» pasa', async () => {
  const m = await mundo({ nombres: ['ana', 'bea'], n3: 0, invitados: ['bea', 'cris'] });
  const { eje, hace } = m;
  const p = await m.propone('ana', MARGEN);
  const apoyo = await hace('apoyar', p.id, 'ana');
  assert.deepEqual([apoyo.sobre, apoyo.payload[4]], [p.id, [APOYAR]]);
  let d = cambioDelLibro(eje, p.id, 'ana', ES);
  assert.equal(d.barra.apoyo, 0.5, 'ana, la mitad de la presión de los nombres');
  assert.deepEqual(d.barra.apoyos.map((a) => [a.titular, a.parte, a.enLista]), [['ana', 0.5, true]]);
  // La mitad no supera la mitad: no se aprueba y no se ofrece aprobar.
  assert.equal(d.barra.aprobada, false);
  assert.ok(!que(d).includes('aprobar'));
  assert.ok(que(d).includes('retirarApoyo'));
  // cris no está en la lista: lo ve dicho, apoya y la barra no se mueve.
  const dc = cambioDelLibro(eje, p.id, 'cris', ES);
  assert.equal(dc.barra.avisoFueraDeLista, true);
  assert.match(htmlReglas({ lista: reglasDelLibro(eje, 'cris', ES), cambio: dc }), new RegExp(t('reglasFueraDeLista')));
  assert.equal(cambioDelLibro(eje, p.id, 'bea', ES).barra.avisoFueraDeLista, false);
  await hace('apoyar', p.id, 'cris');
  d = cambioDelLibro(eje, p.id, 'ana', ES);
  assert.equal(d.barra.apoyo, 0.5);
  assert.deepEqual(d.barra.apoyos.find((a) => a.titular === 'cris').enLista, false);
  assert.match(htmlReglas({ lista: reglasDelLibro(eje, 'ana', ES), cambio: d }), /data-no-cuenta>[^<]*: apoya, pero no cuenta/);
  // bea apoya: llega, y entonces sí se ofrece aprobar.
  await hace('apoyar', p.id, 'bea');
  d = cambioDelLibro(eje, p.id, 'bea', ES);
  assert.deepEqual([d.barra.apoyo, d.barra.falta, d.barra.aprobada], [1, 0, true]);
  assert.ok(que(d).includes('aprobar'));
  // Retirar el apoyo (withdraw support) mueve la barra hacia atrás.
  await hace('retirarApoyo', p.id, 'bea');
  assert.equal(cambioDelLibro(eje, p.id, 'bea', ES).barra.apoyo, 0.5);
  await hace('apoyar', p.id, 'bea');
  const e = await hace('aprobar', p.id, 'bea');
  assert.equal(e.sobre, p.id);
  d = cambioDelLibro(eje, p.id, 'bea', ES);
  assert.equal(d.estado, 'aprobado');
  assert.ok(!que(d).includes('aprobar'), 'una vez');
  assert.ok(!que(d).includes('retirar'), 'aprobada, ya no se retira');
});

test('carta-reglas: poner en vigor solo cuando la prueba llega; en vigor, la versión vigente cambia y el valor nuevo se ve', async () => {
  // La época 0: el dueño solo cuenta y un cambio corriente pide el nivel 3.
  const m = await mundo();
  const { eje, hace } = m;
  const obs = await observadorDePrueba();
  const casa = await generarClaves();
  await declararExterior(eje, { lineas: [casa.publica], t: m.reloj() });
  const p = await m.propone('ana', MARGEN);
  await hace('apoyar', p.id, 'ana');
  const e = await hace('aprobar', p.id, 'ana');
  let d = cambioDelLibro(eje, p.id, 'ana', ES);
  assert.deepEqual([d.estado, d.firmeza.pedido, d.firmeza.llega, d.poner], ['aprobado', 3, false, null]);
  assert.ok(!que(d).includes('poner'), 'sin la prueba no se ofrece');
  const h = htmlReglas({ lista: reglasDelLibro(eje, 'ana', ES), cambio: d });
  assert.match(h, /Firmeza de la aprobación/);
  assert.match(h, /class="estaciones-firmeza"/, 'las estaciones de siempre: nivel, grado y red');
  assert.match(h, /Todavía no llega/);
  const intento = await actuar(eje, p.id, 'poner', 'ana', undefined, m.o());
  assert.equal(intento.asentado, null, 'y si se fuerza, la regla lo rechaza con su motivo');
  assert.ok(intento.motivos.length > 0);
  // Llega el sello de la aprobación: un eslabón de nivel 3 firmado con una clave de línea del libro.
  eje.marcarSello(e.id, await selloEnCascada(e.id, { observador: obs, capas: [{ nivel: 3, claves: casa }, { nivel: 4 }] }));
  d = cambioDelLibro(eje, p.id, 'ana', ES);
  assert.equal(d.firmeza.llega, true);
  assert.ok(que(d).includes('poner'));
  assert.match(htmlReglas({ lista: reglasDelLibro(eje, 'ana', ES), cambio: d }), /data-reglas-actuar="poner"/, 'con clave en el navegador, un botón');
  assert.doesNotMatch(htmlReglas({ lista: reglasDelLibro(eje, 'ana', ES), cambio: d, guardian: true }), /data-reglas-actuar="poner"/, 'con el guardián lo hace sola la carta');
  const antes = reglasDelLibro(eje, 'ana', ES).version.cambios;
  const f = await hace('poner', p.id, 'ana');
  assert.equal(f.sobre, e.id);
  const v = reglasDelLibro(eje, 'ana', ES);
  assert.deepEqual([antes, v.version.cambios, v.version.registro, v.version.propuesta], [0, 1, f.id, p.id]);
  assert.match(htmlReglas({ lista: v }), /Este libro lleva 1 cambio en sus reglas; rige desde /);
  assert.equal(v.cambios[0].estado, 'enVigor');
  d = cambioDelLibro(eje, p.id, 'ana', ES);
  assert.deepEqual(d.piezas.map((x) => [x.hoy, x.queda]), [['600', '900']]);
  assert.match(htmlReglas({ lista: v, cambio: d }), /<small>antes<\/small> 600<\/span> → <span class="reglas-valor-queda"><small>ahora<\/small> 900<\/span>/);
  assert.deepEqual(parametrosMovibles(eje).find((x) => x.posicion === 'epoch.7.3.0').hoy, [900], 'el valor nuevo, en las reglas de hoy');
  assert.equal(eje.epoca().registro[7][3][0][0], 900);
});

test('carta-reglas: una propuesta que toca el suelo avisa y no se escribe; la clase sale de lo que toca; la vía de experto comprueba antes de escribir', async () => {
  const m = await mundo({ nombres: ['ana', 'bea'], n3: 0 });
  const { eje } = m;
  const n = eje.orden.length;
  const suelo = await proponer(eje, 'ana', { titulo: 'escalas', explicacion: 'otras escalas informativas', posicion: 'epoch.7.2', valor: '7' }, undefined, m.o());
  assert.deepEqual([suelo.asentado, suelo.aviso], [null, t('reglasTocaElSuelo')]);
  assert.match(suelo.motivos[0].mensaje, /cambia la posición epoch\.7\.2 de la época, que es del suelo/, 'el motivo del núcleo, tal como llega');
  assert.equal(eje.orden.length, n, 'no se escribe nada');
  assert.ok(parametrosMovibles(eje).find((x) => x.posicion === 'epoch.7.2').suelo, 'la lista ya lo marca');
  // Tocar una pieza de gobierno (el umbral corriente, 7.9.1) es de clase «governance»: la carta lo arma así.
  const c = comprobarPropuesta(eje, 'ana', { cambio: cambioDeDatos(eje, { posicion: 'epoch.7.9.1', valor: '0.6' }).cambio, titulo: 'x', explicacion: 'y' });
  assert.deepEqual([c.clase, c.aviso], ['governance', null]);
  const g = await m.propone('ana', { titulo: 'umbral', explicacion: 'más apoyo para lo corriente', posicion: 'epoch.7.9.1', valor: '0.6' });
  assert.deepEqual(g.payload[2], ['governance']);
  // Vía de experto: lo que no es JSON, o no trae raíz, no se escribe; una raíz que encoge el suelo, tampoco.
  assert.equal((await proponer(eje, 'ana', { titulo: 'a', explicacion: 'b', pieza: '{ no' }, undefined, m.o())).aviso, t('reglasPiezaNoEsJson'));
  assert.equal((await proponer(eje, 'ana', { titulo: 'a', explicacion: 'b', pieza: '{"x":1}' }, undefined, m.o())).aviso, t('reglasPiezaSinRaiz'));
  const id = eje.epoca().id;
  const encoge = [['encoge'], { ref: id }, { ref: id }, { ref: id }, { ref: id }, { ref: id }, [['de prueba'], ['hereda'], [id]], [...Array.from({ length: 9 }, () => ({ ref: id })), [{ ref: id }, { ref: id }, { ref: id }, { ref: id }, { ref: id }, { ref: id }, ['nobody moves tokens of others']]]];
  const r = await proponer(eje, 'ana', { titulo: 'a', explicacion: 'b', pieza: JSON.stringify({ raiz: encoge, registros: [] }) }, undefined, m.o());
  assert.equal(r.aviso, t('reglasTocaElSuelo'));
  assert.ok(r.motivos.some((x) => /el suelo se amplía, nunca se encoge/.test(x.mensaje)));
  // Sin título no se escribe.
  assert.equal((await proponer(eje, 'ana', { ...MARGEN, titulo: ' ' }, undefined, m.o())).aviso, t('reglasFaltaTitulo'));
  assert.equal(eje.orden.length, n + 1, 'solo la de gobierno');
});

test('carta-reglas: un título y una explicación con signos de marcado salen escapados', async () => {
  const m = await mundo({ nombres: ['ana', 'bea'], n3: 0 });
  const p = await m.propone('ana', { ...MARGEN, titulo: '<img src=x onerror="alert(1)">', explicacion: '<b>negrita</b> & más' });
  const v = reglasDelLibro(m.eje, 'ana', ES);
  for (const h of [htmlReglas({ lista: v }), htmlReglas({ lista: v, cambio: cambioDelLibro(m.eje, p.id, 'ana', ES) })]) {
    assert.doesNotMatch(h, /<img|<b>negrita/);
    assert.match(h, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
  }
  assert.match(htmlReglas({ lista: v, cambio: cambioDelLibro(m.eje, p.id, 'ana', ES) }), /&lt;b&gt;negrita&lt;\/b&gt; &amp; más/);
  // Lo escrito en el formulario de proponer, también.
  const f = htmlReglas({ lista: v, proponer: { parametros: parametrosMovibles(m.eje), posicion: 'epoch.7.3.0', valores: { titulo: '"><script>x</script>', pieza: '</textarea><b>' } } });
  assert.doesNotMatch(f, /<script>|<\/textarea><b>/);
});

test('carta-reglas: «Ajustes de este elemento» da lo fijado (con quién y cuándo) y lo heredado del libro, con el botón de la plantilla de siempre', async () => {
  const m = await mundo({ invitados: ['bea'] });
  const { eje } = m;
  const X = eje.genesisId; // el alta de ana
  const lanza = async (cual, params, yo) => {
    const r = await A.transaccion(eje, cual, { X, ...params }, yo, { t: m.reloj() });
    assert.equal(r.ok, true, cual + ': ' + JSON.stringify(r.motivos));
    return eje.anadir(r.evento);
  };
  const precio = await lanza('set a group price', { token: 'their R', amount: 2, zone: 1 }, 'ana');
  const defecto = await lanza('set a custody default', { key: 'parent reads', value: 'no' }, 'ana');
  const clase = await lanza('set the kind of owner', { kind: 'group' }, 'ana');
  const a = ajustesDelElemento(eje, X, 'ana', ES);
  const fijado = new Map(a.fijado.map((f) => [f.id, f]));
  for (const r of [precio, defecto, clase]) assert.ok(fijado.has(r.id), 'fijado: ' + r.payload[4]);
  assert.ok(fijado.get(defecto.id).valores.some((x) => x.valor === 'parent reads') && fijado.get(defecto.id).valores.some((x) => x.valor === 'no'));
  assert.ok(fijado.get(precio.id).quien && fijado.get(precio.id).cuando, 'quién lo fijó y cuándo');
  assert.equal(fijado.get(defecto.id).cambiar.accion, 'set a custody default');
  assert.deepEqual(fijado.get(precio.id).cambiar.valores, { zone: 1 });
  // Lo heredado: lo que no se ha fijado aquí, con su base y lo admitido, «del libro».
  const heredado = a.heredado.map((h) => [h.clave, h.base, h.admitidos]);
  assert.ok(heredado.some(([k, b, ad]) => k === 'linked operation' && b === 'both' && ad === 'both, own'));
  assert.ok(!heredado.some(([k]) => k === 'parent reads'), 'fijado aquí, no se hereda');
  assert.ok(a.heredado.some((h) => h.cambiar?.accion === 'set a group price' && h.cambiar.valores.zone === 0), 'el precio de los grupos que no se fijaron');
  assert.ok(!a.heredado.some((h) => h.cambiar?.valores?.zone === 1));
  const h = htmlAjustesDelElemento(a);
  assert.match(h, /Ajustes de este elemento/);
  assert.match(h, /Fijado aquí/);
  assert.match(h, /De las reglas del libro/);
  assert.match(h, /<small class="ajuste-del-libro">del libro<\/small>/);
  assert.match(h, /data-sitio-lanzar="set a custody default" data-x="[0-9a-f]{64}" data-valores="\{&quot;key&quot;:&quot;linked operation&quot;\}"/);
  // A bea no se le ofrece cambiar los ajustes del alta de ana: lo ve, sin botones.
  const b = ajustesDelElemento(eje, X, 'bea', ES);
  assert.equal(b.fijado.length, a.fijado.length);
  assert.ok(b.fijado.every((f) => !f.cambiar) && b.heredado.every((x) => !x.cambiar));
});

test('carta-reglas: con el guardián, proponer, apoyar, aprobar y poner en vigor piden siempre diálogo; la entrada está en la configuración', async () => {
  const m = await mundo({ nombres: ['ana', 'bea'], n3: 0 });
  const { eje } = m;
  for (const accion of ['propose a change', 'support a change', 'enact a change', 'put a change in force']) {
    assert.equal(pideDialogo(['x', ['1'], ['c'], ['ana'], [accion]]), true, accion);
    const canonico = JSON.stringify({ autor: 'ana', sobre: eje.genesisId, payload: ['x', ['1'], ['c'], ['ana'], [accion]] });
    assert.equal(segundoFactorDe(eje, { canonico, id: 'a'.repeat(64) }), true, accion);
  }
  assert.equal(pideDialogo(['x', ['1'], ['c'], ['ana'], ['withdraw support']]), false);
  assert.equal(segundoFactorDe(eje, { canonico: JSON.stringify({ autor: 'ana', sobre: eje.genesisId, payload: ['una nota'] }), id: 'b'.repeat(64) }), false, 'lo demás, como antes');
  const conf = htmlConfiguracion(preferencias(eje, 'ana'), { reglas: true });
  assert.match(conf, /data-reglas-abrir/);
  assert.doesNotMatch(htmlConfiguracion(preferencias(eje, 'ana'), {}), /data-reglas-abrir/);
});
