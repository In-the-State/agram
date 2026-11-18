// Remates de la forma C vistos en pantalla (VG 18-11): en Mapped, un punto de vista comprimido no se pinta y su rosetón
// lleva la marca con cuántas acciones ofrece; el «+n» abierto es una lista flotante pegada a su botón, dentro de la
// pantalla, que se cierra al tocar fuera.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { arbol, LATERALES, NIVEL } from '../carta/carta.js';
import { html, situarDesplegadas } from '../carta/dom.js';
import { instalar } from '../carta/gestos.js';
import { ejemploCompra } from '../ejemplos/ikisai/compra-food.mjs';

const PC = { ancho: 1440, alto: 900 };

test('Mapped: cada punto de vista comprimido lleva en su rosetón la marca con cuántas acciones ofrece; uno en tarjeta, no', async () => {
  const { eje, compra } = await ejemploCompra();
  const niveles = Object.fromEntries(LATERALES.map((pv) => [pv, NIVEL.comprimido]));
  niveles[2] = NIVEL.tarjeta;
  const a = await arbol({ foco: { X: compra.id, pv: 0 }, niveles }, eje, 'huesped', PC);
  assert.ok(a.rosetones?.length, 'hay rosetones');
  const h = html(a);
  const marcas = Object.fromEntries([...h.matchAll(/<span class="roseton-marca" data-marca-pv="(\d)" title="[^"]*">(\d+)<\/span>/g)].map((m) => [Number(m[1]), Number(m[2])]));
  for (const n of a.laterales) {
    if (n.nivel <= NIVEL.comprimido && n.acciones?.total) assert.equal(marcas[n.pv], n.acciones.total, 'la marca del ' + n.pv);
    else assert.equal(marcas[n.pv], undefined, 'sin marca el ' + n.pv + ' (nivel ' + n.nivel + ')');
  }
  assert.ok(Object.keys(marcas).length >= 5, 'varias marcas');
  // Dentro de su rosetón (el botón de esa posición), sin tocar sus clases de tamaño ni de sitio.
  const r1 = h.match(/<button type="button" class="roseton [^"]*" [^>]*data-roseton="1"[^]*?<\/button>/)[0];
  assert.match(r1, /class="roseton-marca"/);
});

/** Los gestos sobre una raíz de mentira con un «+n» abierto (o no). */
function gestos({ abierto }) {
  const oyentes = [];
  const llamadas = [];
  const documento = { defaultView: { innerWidth: 400, innerHeight: 800 }, addEventListener: (t, f) => oyentes.push([t, f]), removeEventListener() {} };
  const raiz = { ownerDocument: documento, addEventListener: (t, f) => oyentes.push([t, f]), removeEventListener() {}, querySelector: (sel) => (abierto && sel === '.pv-acciones-mas[open]' ? {} : null) };
  const m = new Proxy({}, { get: (_, nombre) => (...args) => { llamadas.push([nombre, ...args]); } });
  instalar(raiz, m);
  const disparar = (tipo, evento) => { for (const [t, f] of oyentes) if (t === tipo) f(evento); };
  return { disparar, llamadas };
}
const objetivo = (respuestas) => ({ closest: (sel) => { for (const [trozo, v] of Object.entries(respuestas)) if (sel.includes(trozo)) return v; return null; } });

test('el «+n» abierto: tocar fuera lo cierra y no hace nada más; tocar dentro sigue siendo lo de dentro; cerrado, nada cambia', () => {
  const fuera = gestos({ abierto: true });
  let prevenido = 0;
  fuera.disparar('click', { target: objetivo({ '[data-lanzar]': { dataset: { lanzar: 'a1', x: 'X1' } } }), preventDefault: () => { prevenido++; } });
  assert.deepEqual(fuera.llamadas, [['cerrarAccionesMas']], 'fuera: solo se cierra (no lanza lo de debajo)');
  assert.equal(prevenido, 1);
  const dentro = gestos({ abierto: true });
  const lanzar = { dataset: { lanzar: 'a2', x: 'X1' } };
  dentro.disparar('click', { target: { closest: (sel) => (sel === '.pv-acciones-mas' ? {} : sel === '[data-lanzar]' ? lanzar : null) }, preventDefault() {} });
  assert.deepEqual(dentro.llamadas, [['lanzar', 'X1', 'a2', null, {}]], 'dentro: lanza la acción de la lista');
  const cerrado = gestos({ abierto: false });
  cerrado.disparar('click', { target: objetivo({ '[data-lanzar]': lanzar }), preventDefault() {} });
  assert.deepEqual(cerrado.llamadas, [['lanzar', 'X1', 'a2', null, {}]]);
});

/** Un «+n» abierto de mentira: su botón y su lista con sus cajas; la lista guarda dónde se la pone. */
function masDeMentira(boton, tam) {
  const lista = { style: {}, getBoundingClientRect() { const left = parseFloat(this.style.left ?? boton.left); const top = parseFloat(this.style.top ?? boton.bottom); return { left: Number.isFinite(left) ? left : boton.left, top: Number.isFinite(top) ? top : boton.bottom, width: tam.ancho, height: tam.alto }; } };
  const summary = { getBoundingClientRect: () => ({ ...boton, right: boton.left + 30 }) };
  const mas = { querySelector: (sel) => (sel === 'summary' ? summary : sel === '.pv-acciones-desplegadas' ? lista : null) };
  const raiz = { ownerDocument: { documentElement: { clientWidth: 400 }, defaultView: { innerWidth: 400, innerHeight: 800 } }, querySelectorAll: (sel) => (sel === '.pv-acciones-mas[open]' ? [mas] : []) };
  return { raiz, lista };
}

test('el «+n» abierto se coloca pegado a su botón y dentro de la pantalla: debajo si cabe, si no encima; nunca fuera por la derecha', () => {
  const abajo = masDeMentira({ left: 50, top: 100, bottom: 126 }, { ancho: 200, alto: 120 });
  situarDesplegadas(abajo.raiz);
  assert.deepEqual([abajo.lista.style.left, abajo.lista.style.top], ['50px', '130px']);
  const derecha = masDeMentira({ left: 330, top: 100, bottom: 126 }, { ancho: 200, alto: 120 });
  situarDesplegadas(derecha.raiz);
  assert.equal(derecha.lista.style.left, '192px', '400 − 8 − 200');
  const encima = masDeMentira({ left: 50, top: 740, bottom: 766 }, { ancho: 200, alto: 120 });
  situarDesplegadas(encima.raiz);
  assert.equal(encima.lista.style.top, '616px', '740 − 4 − 120');
});

test('Mapped: en la rejilla, la fila de acciones de un punto de vista es de una línea (la primera con nombre y «+n» con las demás); a 400 px, como antes', async () => {
  const { eje, compra } = await ejemploCompra();
  const niveles = Object.fromEntries(LATERALES.map((pv) => [pv, NIVEL.bloque]));
  const pc = await arbol({ foco: { X: compra.id, pv: 0 }, niveles }, eje, 'huesped', PC);
  const h = html(pc);
  const conVarias = pc.laterales.filter((n) => n.nivel >= NIVEL.tarjeta && n.acciones && n.acciones.total > 1);
  assert.ok(conVarias.length >= 4, 'hay laterales con varias acciones');
  assert.equal((h.match(/class="pv-acciones una-linea"/g) ?? []).length, pc.laterales.filter((n) => n.nivel >= NIVEL.tarjeta && n.acciones).length, 'todas las de la rejilla, de una línea');
  for (const n of conVarias) {
    const fila = h.match(new RegExp(`<div class="pv-acciones una-linea"[^>]*data-pv-acciones="${n.pv}"[^>]*>(?:<details[^]*?</details>)?<button[^]*?</button></div>`))?.[0] ?? '';
    assert.ok(fila, 'la fila del ' + n.pv);
    const todas = [...n.acciones.nombradas, ...n.acciones.resto];
    // Fuera de «+n», una sola con nombre: la primera del árbol (la destacada o la por defecto); dentro, las demás.
    const fuera = fila.replace(/<details[^]*<\/details>/, '');
    assert.equal((fuera.match(/data-lanzar=/g) ?? []).length, 1, 'una con nombre en el ' + n.pv);
    assert.ok(fuera.includes(`data-lanzar="${todas[0].id}"`), 'la primera del árbol en el ' + n.pv);
    assert.match(fila, new RegExp(`<summary[^>]*>[+]${todas.length - 1}</summary>`), '«+n» con las demás en el ' + n.pv);
  }
  // A 400 px (Sequenced), nada de esto: ni filas abiertas ni hilos llevan la clase.
  const movil = await arbol({ foco: { X: compra.id, pv: 0 }, niveles: { 1: NIVEL.bloque, 2: NIVEL.bloque } }, eje, 'huesped', { ancho: 400, alto: 860 });
  assert.ok(movil.apilada);
  assert.doesNotMatch(html(movil), /una-linea/);
});

test('el CSS de la fila de una línea: no pasa de una línea, la primera se recorta y «+n» no encoge; en animado, la cabecera es una franja sobre el arte', () => {
  const css = readFileSync(new URL('../carta/estilo.css', import.meta.url), 'utf8');
  assert.match(css, /\.pv-acciones\.una-linea\{[^}]*flex-direction:row-reverse[^}]*flex-wrap:wrap[^}]*max-height:34px[^}]*overflow:hidden/);
  assert.match(css, /\.pv-acciones\.una-linea>\.accion\{[^}]*text-overflow:ellipsis/);
  assert.match(css, /\.pv-acciones\.una-linea>\.pv-acciones-mas\{flex:none\}/);
  assert.match(css, /\.carta\.animado \.mapa \.pv>\.pv-cabeza\{position:relative;background:inherit/);
});
