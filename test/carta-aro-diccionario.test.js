// El centro del aro con un solo diccionario (VG 18-11): «escribir algo que coincida con algo de una lista, lo que hace como
// acción es la de modificar esa hoja del árbol o elemento por otro, o crear uno nuevo si no coincide con ninguno» y «todas
// caben en el centro del aro». En las dos listas del centro (la del 5 arriba, la del 0 abajo) van los valores de esa
// posición y, detrás, las acciones de ese punto de vista que no son cambiar su valor (las de su cabecera, forma C). Se
// filtra con cada letra (subcadena, sin mayúsculas ni acentos, por etiqueta y nombre) y Enter elige solo una coincidencia
// entera; si no la hay, crea un valor nuevo como siempre.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { arbol, normalizarBusqueda, filtrarDiccionario, coincidenciaEntera } from '../carta/carta.js';
import { html, filtrarDiccionarioEnPantalla, coincidenciaEnPantalla } from '../carta/dom.js';
import { instalar } from '../carta/gestos.js';
import * as A from '../src/acciones.js';
import { ejemploCompra } from '../ejemplos/ikisai/compra-food.mjs';
import { ejemploComprasHermanas } from '../ejemplos/ikisai/compras-hermanas.mjs';

const PC = { ancho: 1920, alto: 1080 };

// ---------- el filtro, puro ----------

test('normalizar: sin mayúsculas, sin acentos ni diacríticos, espacios reducidos', () => {
  assert.equal(normalizarBusqueda('  Compra  del MENÚ del día '), 'compra del menu del dia');
  assert.equal(normalizarBusqueda('Ñandú'), 'nandu');
  assert.equal(normalizarBusqueda(null), '');
});

test('filtrar: subcadena por etiqueta o por nombre, sin mayúsculas ni acentos; vacío, todas; en su orden', () => {
  const dic = [
    { etiqueta: 'Compra del menú del día', nombre: '@aa' },
    { etiqueta: 'reserva', nombre: 'booking' },
    { etiqueta: 'proponer un cambio', nombre: 'propose a change' },
    { etiqueta: 'ajustes de la guía', nombre: 'guide settings' },
  ];
  assert.deepEqual(filtrarDiccionario(dic, ''), dic);
  assert.deepEqual(filtrarDiccionario(dic, '   '), dic);
  assert.deepEqual(filtrarDiccionario(dic, 'MENU').map((e) => e.etiqueta), ['Compra del menú del día']);
  assert.deepEqual(filtrarDiccionario(dic, 'guia').map((e) => e.etiqueta), ['ajustes de la guía'], 'sin acento casa con acento');
  assert.deepEqual(filtrarDiccionario(dic, 'book').map((e) => e.etiqueta), ['reserva'], 'por el nombre');
  assert.deepEqual(filtrarDiccionario(dic, 'pro').map((e) => e.etiqueta), ['proponer un cambio'], 'propose y proponer: una sola entrada');
  assert.deepEqual(filtrarDiccionario(dic, 'e').map((e) => e.etiqueta), dic.map((e) => e.etiqueta), 'el orden se respeta');
  assert.deepEqual(filtrarDiccionario(dic, 'zzz'), []);
  assert.deepEqual(filtrarDiccionario(null, 'a'), []);
});

test('coincidencia entera: solo si lo escrito es la etiqueta o el nombre enteros (normalizados); una parcial no cuenta aunque sea única', () => {
  const dic = [{ etiqueta: 'reserva', nombre: 'booking' }, { etiqueta: 'proponer un cambio', nombre: 'propose a change' }, { etiqueta: 'Reserva', nombre: 'otra' }];
  assert.equal(coincidenciaEntera(dic, 'RESERVA'), dic[0], 'la primera en el orden dado');
  assert.equal(coincidenciaEntera(dic, ' Propose  a Change '), dic[1], 'por el nombre');
  assert.equal(coincidenciaEntera(dic, 'proponer'), null, 'parcial y única: no');
  assert.equal(coincidenciaEntera(dic, ''), null);
  assert.equal(coincidenciaEntera(dic, 'nada'), null);
});

// ---------- el nodo del aro ----------

test('el centro del aro trae, en cada lista, los valores de su posición y las acciones de su punto de vista que no cambian su valor: las de su cabecera (forma C)', async () => {
  const H = await ejemploComprasHermanas();
  const X = H.fruta.id;
  const a = await arbol({ foco: { X, pv: 0 }, aro: { X, pv: null, editar: true } }, H.eje, 'huesped', PC);
  const c = a.aro.centro;
  assert.ok(c.opciones0.length >= 1, 'valores en el 0');
  assert.ok(c.opciones5.length >= 1, 'valores en el 5');
  for (const [pv, lista] of [[0, c.acciones0], [5, c.acciones5]]) {
    // Las del núcleo en ese punto de vista, sin las que escriben sobre su propia hoja (el 5 de su plantilla es el pv).
    const nucleo = A.acciones(H.eje, X, pv, 'huesped').filter((x) => String([x.plantilla?.[5]].flat()[0]) !== String(pv));
    assert.deepEqual(lista.map((x) => x.id), nucleo.map((x) => x.id), 'las del ' + pv);
    for (const x of lista) assert.ok(x.nombre && x.canonico, 'con su nombre en el idioma y su nombre canónico');
  }
  assert.ok(c.acciones0.length >= 1, 'en el 0 hay acciones que no son cambiar el valor');
  // Las mismas que la cabecera del 0 (forma C), que se lanzan igual.
  const vista = await arbol({ foco: { X, pv: 0 } }, H.eje, 'huesped', PC);
  const cabecera = [...(vista.centro.acciones?.nombradas ?? []), ...(vista.centro.acciones?.resto ?? [])].map((x) => x.id);
  for (const x of c.acciones0) assert.ok(cabecera.includes(x.id), 'la ofrece también la cabecera del 0: ' + x.nombre);
  // En el HTML: los valores primero y, detrás, las acciones con su píldora; lanzan como la cabecera (data-lanzar).
  const h = html(a);
  const abajo = h.match(/<ul class="opciones opciones-abajo" data-opciones="0">[^]*?<\/ul>/)[0];
  const ultimoValor = abajo.lastIndexOf('data-opcion="0"');
  const primeraAccion = abajo.indexOf('class="opcion opcion-accion"');
  assert.ok(ultimoValor > 0 && primeraAccion > ultimoValor, 'las acciones van después de los valores');
  assert.equal((abajo.match(/class="con-accion primera-accion"/g) ?? []).length, 1, 'una raya antes de la primera');
  for (const x of c.acciones0) assert.match(abajo, new RegExp(`class="opcion opcion-accion"[^>]*data-lanzar="${x.id}"[^>]*data-dic-etiqueta="[^"]+" data-dic-nombre="[^"]+"`));
  for (const o of c.opciones0) assert.match(abajo, new RegExp(`data-opcion="0" data-valor="${o.valor}"[^>]*data-dic-etiqueta=`));
  assert.match(h, /<ul class="opciones opciones-arriba" data-opciones="5">/, 'la del 5, arriba');
});

test('sin quien mira no hay acciones en el centro; los valores siguen', async () => {
  const H = await ejemploComprasHermanas();
  const X = H.fruta.id;
  const a = await arbol({ foco: { X, pv: 0 }, aro: { X, pv: null, editar: true } }, H.eje, null, PC);
  assert.deepEqual([a.aro.centro.acciones0, a.aro.centro.acciones5], [[], []]);
  assert.ok(a.aro.centro.opciones0.length >= 1);
});

test('una cuenta con más acciones en el 0 (la casa en su alta): todas en la lista de abajo, detrás de los valores', async () => {
  const { eje } = await ejemploCompra();
  const X = eje.alta('casa').id;
  const a = await arbol({ foco: { X, pv: 0 }, aro: { X, pv: null, editar: true } }, eje, 'casa', PC);
  const ids = A.acciones(eje, X, 0, 'casa').map((x) => x.id);
  assert.deepEqual(a.aro.centro.acciones0.map((x) => x.id), ids);
  const abajo = html(a).match(/<ul class="opciones opciones-abajo" data-opciones="0">[^]*?<\/ul>/)?.[0] ?? '';
  for (const id of ids) assert.ok(abajo.includes(`data-lanzar="${id}"`));
});

// ---------- en la pantalla: filtrar y Enter ----------

/** Un DOM de mentira para el centro del aro: dos listas con sus botones (dataset, closest('li') con hidden). */
function centroDeMentira({ abajo = [], arriba = [] }) {
  const boton = (d) => {
    const li = { hidden: false };
    return { dataset: d, li, closest: (sel) => (sel === 'li' ? li : null) };
  };
  const lista = (botones) => ({ hidden: false, botones, querySelectorAll: (sel) => (sel === '[data-dic-etiqueta]' ? botones : []) });
  const L = { abajo: lista(abajo.map(boton)), arriba: lista(arriba.map(boton)) };
  const raiz = {
    querySelectorAll: (sel) => (sel === '.aro-edicion .opciones' ? [L.arriba, L.abajo] : []),
    querySelector: (sel) => (sel === '.aro-edicion .opciones-abajo' ? L.abajo : sel === '.aro-edicion .opciones-arriba' ? L.arriba : null),
  };
  return { raiz, L };
}

const VALOR_0 = { opcion: '0', valor: '@aa', x: 'X1', dicEtiqueta: 'Compra del menú del día', dicNombre: '@aa' };
const ACCION_0 = { lanzar: 'p1', x: 'X1', dicEtiqueta: 'proponer un cambio', dicNombre: 'propose a change' };
const VALOR_5 = { opcion: '5', valor: 'booking', x: 'X1', dicEtiqueta: 'reserva', dicNombre: 'booking' };

test('filtrar en la pantalla: oculta las entradas que no casan y la lista que se queda sin ninguna; vacío, todo a la vista', () => {
  const { raiz, L } = centroDeMentira({ abajo: [VALOR_0, ACCION_0], arriba: [VALOR_5] });
  filtrarDiccionarioEnPantalla(raiz, 'camb');
  assert.deepEqual(L.abajo.botones.map((b) => b.li.hidden), [true, false]);
  assert.equal(L.abajo.hidden, false);
  assert.equal(L.arriba.hidden, true, 'la del 5, sin ninguna: fuera');
  filtrarDiccionarioEnPantalla(raiz, 'MENU');
  assert.deepEqual(L.abajo.botones.map((b) => b.li.hidden), [false, true]);
  filtrarDiccionarioEnPantalla(raiz, '');
  assert.deepEqual([...L.abajo.botones, ...L.arriba.botones].map((b) => b.li.hidden), [false, false, false]);
  assert.deepEqual([L.abajo.hidden, L.arriba.hidden], [false, false]);
});

/** Los gestos sobre una raíz de mentira; `m` decide qué devuelve enterAro. */
function gestos(m, { aroCerrado = false } = {}) {
  const oyentes = [];
  const documento = { defaultView: { innerWidth: 400, innerHeight: 800 }, addEventListener: (t, f) => oyentes.push([t, f]), removeEventListener() {} };
  const raiz = { ownerDocument: documento, addEventListener: (t, f) => oyentes.push([t, f]), removeEventListener() {}, querySelector: (sel) => (sel === '.aro' || (aroCerrado && sel === '.aro:not(.editando)') ? {} : null) };
  instalar(raiz, m);
  return (tipo, evento) => { for (const [t, f] of oyentes) if (t === tipo) f(evento); };
}

/** El input del centro del aro, de mentira: blur da el change, como en el navegador si el valor cambió. */
function inputDelCentro(valor, disparar) {
  const input = {
    value: valor, dataset: { campo: '0', x: 'X1' }, blurs: 0,
    matches: (sel) => sel === '[data-campo]',
    closest: (sel) => (sel === '.aro-edicion' ? {} : null),
    blur() { this.blurs++; disparar('change', { target: this }); },
  };
  return input;
}

/** Lo que hace la app con Enter (app.js enterAro), sobre el DOM de mentira: la coincidencia entera y su manejador. */
function appDeMentira(raiz) {
  const llamadas = [];
  const m = new Proxy({
    enterAro(input) {
      const b = coincidenciaEnPantalla(raiz, input.value);
      if (!b) return false;
      if (b.dataset.lanzar !== undefined) llamadas.push(['lanzar', b.dataset.x, b.dataset.lanzar]);
      else llamadas.push(['opcion', b.dataset.x, Number(b.dataset.opcion), b.dataset.valor]);
      return true;
    },
  }, { get: (o, nombre) => o[nombre] ?? ((...args) => { llamadas.push([nombre, ...args]); }) });
  return { m, llamadas };
}

const enter = (target) => ({ key: 'Enter', target, preventDefault() {} });

test('Enter con coincidencia entera: un valor se escribe (opcion) y una acción se lanza (lanzar); lo escrito no se crea como valor nuevo', () => {
  for (const [texto, esperado] of [
    ['compra del menu del dia', ['opcion', 'X1', 0, '@aa']],
    ['PROPONER UN CAMBIO', ['lanzar', 'X1', 'p1']],
    ['propose a change', ['lanzar', 'X1', 'p1']],
    ['Reserva', ['opcion', 'X1', 5, 'booking']],
  ]) {
    const { raiz } = centroDeMentira({ abajo: [VALOR_0, ACCION_0], arriba: [VALOR_5] });
    const { m, llamadas } = appDeMentira(raiz);
    const disparar = gestos(m);
    const input = inputDelCentro(texto, disparar);
    disparar('keydown', enter(input));
    assert.deepEqual(llamadas, [esperado], texto);
    assert.equal(input.blurs, 0, 'no se suelta el campo por Enter');
    // Si luego el campo se suelta (repintar, un clic fuera), el change no escribe lo tecleado.
    disparar('change', { target: input });
    assert.deepEqual(llamadas, [esperado], 'ni después');
  }
});

test('Enter sin coincidencia entera (ni una parcial única): se crea un valor nuevo como siempre (campo)', () => {
  for (const texto of ['proponer', 'Una cosa nueva']) {
    const { raiz } = centroDeMentira({ abajo: [VALOR_0, ACCION_0], arriba: [VALOR_5] });
    const { m, llamadas } = appDeMentira(raiz);
    const disparar = gestos(m);
    const input = inputDelCentro(texto, disparar);
    disparar('keydown', enter(input));
    assert.equal(input.blurs, 1);
    assert.deepEqual(llamadas, [['campo', 'X1', 0, texto, { nuevo: false }]], texto);
  }
});

test('escribir en el campo del centro filtra (filtrarAro); en el campo de un hueco (crear), no', () => {
  const llamadas = [];
  const m = new Proxy({}, { get: (_, nombre) => (...args) => { llamadas.push([nombre, ...args]); } });
  const disparar = gestos(m);
  const campo = (nuevo) => ({ value: 'res', dataset: nuevo ? { nuevo: '' } : {}, matches: (sel) => sel === '[data-campo]', closest: (sel) => (sel === '.aro-edicion' ? {} : null) });
  disparar('input', { target: campo(false) });
  disparar('input', { target: campo(true) });
  assert.deepEqual(llamadas, [['filtrarAro', 'res']]);
});

test('con el aro abierto, teclear una letra abre el campo del centro con ella escrita; los dígitos siguen siendo del aro', () => {
  const llamadas = [];
  const m = new Proxy({}, { get: (_, nombre) => (...args) => { llamadas.push([nombre, ...args]); } });
  const disparar = gestos(m, { aroCerrado: true });
  const tecla = (key) => disparar('keydown', { key, target: { closest: () => null }, preventDefault() {}, ctrlKey: false, metaKey: false, altKey: false });
  tecla('r');
  tecla('4');
  tecla(' ');
  assert.deepEqual(llamadas, [['editarAro', { texto: 'r' }], ['aroTecla', 4]]);
});
