// La carta: formularios y camino (VG 14-11, repaso de la beta #14, #20, #21, #22, #28; ISSUES #70, #88, #89, #90, #92, #95):
//   #89 el formulario de ejecutar enseña solo lo que el usuario decide; fórmulas, tipos y BTML en crudo van al reverso, que se
//       abre a propósito; con el botón apagado, una línea arriba dice qué le falta al registro
//   #70 el desglose de la autorización en el 4: una línea por cosa, los motivos no bloqueantes como aviso; el 6 marca lo desbordado
//   #90 un paso del camino tiene una sola acción visible; «previsualizar» pasa a mantener pulsado (una frase); «reglas» al reverso
//   #95 la celda «qué es» enseña el 0 del registro en llano
//   #88 y #92 verificados: el botón que cicla dice lo que filtra; la configuración, separada por posición
// Lo visual está en las capturas de equipo/mockups/capturas/beta-cartaform.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { arbol, previsualizar, preferencias } from '../carta/carta.js';
import { html, htmlGuia, htmlConfiguracion } from '../carta/dom.js';
import { instalar } from '../carta/gestos.js';
import { preguntar } from '../carta/guia.js';
import { t } from '../carta/textos.js';
import * as A from '../src/acciones.js';
import * as contrato from '../src/contrato.js';
import { generarClaves, firmarPosesion } from '../src/autoridad.js';
import { ANUNCIO } from '../src/motor.js';
import { LibroLocal } from '../src/local.js';
import { ejemploCompra, ejemploFabrica } from '../ejemplos/ikisai/compra-food.mjs';
import { pagaElCoste } from './ayudas-coste.js';

const T1 = '2026-11-08T12:00:00Z';
const GRANDE = { ancho: 1920, alto: 1080 };
const MOVIL = { ancho: 390, alto: 844 };
const ES = { idioma: 'es' };
const APP = readFileSync(new URL('../carta/app.js', import.meta.url), 'utf8');

/** Lo que va entre dos marcas del HTML. */
const entre = (h, desde, hasta) => { const i = h.indexOf(desde); return i < 0 ? '' : h.slice(i, h.indexOf(hasta, i + desde.length)); };
const anverso = (h) => entre(h, '<div class="cara cara-anverso"', '<div class="cara cara-reverso"');
const reverso = (h) => entre(h, '<div class="cara cara-reverso"', '<footer>');

/** La compra de ejemplo con una cosa de la huésped («cartera», con clave y 60 minutos de T) y un anuncio de pago de la cocina (como test/segundo-factor.test.js). */
async function mundo() {
  const c = await ejemploCompra();
  const { eje, menu } = c;
  const encargo = await eje.escribir({ autor: 'cocina', sobre: menu.id, t: T1, payload: ['Encargo', ['x'], ['all announced movements happened'], ['cocina', 'huesped']], movimientos: [pagaElCoste('cocina')] });
  const anunciado = { token: 'E', emisor: 'casa', denominacion: 'EUR', cantidad: 7, de: 'huesped', a: 'cocina', estado: 'anunciado', refiere: '2026-11-20T10:00:00Z' };
  await eje.escribir({ autor: 'cocina', sobre: encargo.id, en: ANUNCIO, t: T1, payload: 'pagar la cena', movimientos: [pagaElCoste('cocina'), anunciado] });
  const cosa = await generarClaves();
  const altaH = eje.alta('huesped').id;
  const r = await A.transaccion(eje, 'register a thing', { X: altaH, thing: 'cartera', minutes: 60, key: cosa.publica }, 'huesped', { t: T1 });
  assert.ok(r.ok, JSON.stringify(r.motivos));
  await eje.anadir(await firmarPosesion(r.evento, 'cartera', cosa.privada));
  return { ...c, eje, encargo, altaH, cosa };
}

/** La huésped escribe su criterio de segundo factor. */
async function criterio(m, family, amount, t = T1) {
  const r = await A.transaccion(m.eje, 'second factor', { X: m.altaH, family, amount, holder: 'cartera' }, 'huesped', { t });
  assert.ok(r.ok, JSON.stringify(r.motivos));
  await m.eje.anadir(r.evento);
}

const formPago = (m, extra = {}, yo = 'huesped', medidas = GRANDE) => arbol({ foco: { X: m.encargo.id, pv: 4 }, formulario: { X: m.encargo.id, accion: 'pay', valores: {}, ejecutar: true, ...extra } }, m.eje, yo, medidas, ES);

// ---------- #89 ----------

test('#89 el formulario de ejecutar enseña solo lo que se decide: sin tipos, fórmulas ni BTML a la vista; todo eso, en el reverso que se abre a propósito', async () => {
  const m = await mundo();
  await criterio(m, 'E', 5);
  const a = await formPago(m);
  const h = html(a);
  const cara = anverso(h);
  assert.match(cara, /<section class="ejecucion-t"[^>]*><h3>lo que cuesta ejecutarlo<\/h3><p class="exigido-total"><b>lo exigido: 10 min<\/b><\/p>/);
  assert.match(cara, /<select data-denominacion/, 'la denominación propuesta, a la vista');
  assert.match(cara, /<p class="aviso-segundo-factor" role="note">/, 'el aviso del segundo factor');
  assert.match(h, /<footer><p class="quien-guarda" data-solo>Solo lo guardas tú, en este dispositivo<\/p><button type="submit" class="ejecutar[^>]*>ejecutar<\/button><\/footer>/, 'y el botón, con la línea de quién lo guardará (padres y copias, N2)');
  // a la vista, nada técnico: ni el tipo de cada campo, ni su fórmula, ni «ver en BTML», ni el desglose con el nombre de la regla
  assert.doesNotMatch(cara, /class="tipo"|<code>|<details class="btml"|ver en BTML|data-parte=|the cost of writing/);
  const texto = cara.replace(/<[^>]+>/g, (x) => [...x.matchAll(/(?:title|aria-label)="([^"]*)"/g)].map((y) => ' ' + y[1] + ' ').join(''));
  assert.doesNotMatch(texto, /=count|=it |=first|\bidentity\b|\bref\b/, 'ni fórmulas ni nombres de tipo, ni en lo que se lee');
  // solo lo que falta por decidir; lo que ya viene dado, recogido tras «ya resuelto» (sus inputs siguen: se envían)
  assert.match(cara, /<details class="mas-parametros"><summary title="[^"]+">ya resuelto · 4<\/summary>/);
  assert.deepEqual(a.formulario.campos.filter((c) => c.falta).map((c) => c.nombre), [], 'aquí no falta ninguno');
  const falta = html(await arbol({ foco: { X: m.encargo.id, pv: 4 }, formulario: { X: m.encargo.id, accion: 'declare future T', valores: {}, ejecutar: true } }, m.eje, 'huesped', GRANDE, ES));
  assert.match(anverso(falta), /<div class="campo falta">/, 'lo que falta, a la vista y marcado');
  // el reverso: el tipo y la fórmula de cada campo, el BTML en crudo y lo exigido por partes con su regla; cerrado por defecto
  assert.match(h, /<div class="cara cara-reverso" hidden>/);
  assert.equal(a.formulario.reverso, false);
  const atras = reverso(h);
  for (const c of a.formulario.campos) assert.ok(atras.includes(`<b>${c.etiqueta}</b>`), 'el campo ' + c.nombre + ' en el reverso');
  assert.match(atras, /<small>tipo <code>[^<]+<\/code><\/small>/);
  assert.match(atras, /<small>fórmula <code>=[^<]+<\/code><\/small>/);
  assert.match(atras, /<details class="btml"><summary>ver en BTML<\/summary><code>/);
  assert.match(atras, /<li data-parte="coste">[^<]*posiciones[^<]*<code>the cost of writing<\/code><\/li>/);
  assert.match(atras, /<li data-parte="total">/);
  // abierto: el reverso a la vista, el anverso oculto (sus inputs siguen para no perder lo escrito) y el pie es «volver»
  const b = await formPago(m, { reverso: true });
  assert.equal(b.formulario.reverso, true);
  const hb = html(b);
  assert.match(hb, /<form class="formulario" data-formulario[^>]* data-reverso /);
  assert.match(hb, /<div class="cara cara-anverso" hidden>/);
  assert.match(hb, /<div class="cara cara-reverso">/);
  assert.match(hb, /<footer><button type="button"[^>]*data-voltear-formulario[^>]*>volver<\/button><\/footer>/);
  assert.doesNotMatch(hb, /<button type="submit"/, 'con el reverso abierto, no se envía');
  assert.ok(anverso(hb).includes('name="'), 'los inputs siguen en el DOM');
  // el botón de dar la vuelta, en la cabecera, y la app guarda lo escrito al darla
  assert.match(h, /<header><h2>[^<]+<\/h2><button type="button" class="voltear-formulario" data-voltear-formulario aria-pressed="false"/);
  assert.match(APP, /voltearFormulario\(form\) \{[^]*?f\.valores = \{ \.\.\.f\.valores, \.\.\.valoresDelFormulario\(form\)\.valores \};[^]*?f\.reverso = !f\.reverso;/);
  // un formulario que no es de ejecutar lleva el mismo reverso (el tipo y el BTML tampoco están a la vista)
  const { eje, menu } = await ejemploCompra();
  const l = html(await arbol({ foco: { X: menu.id, pv: 0 }, formulario: { X: menu.id, accion: 'anchor here', valores: {} } }, eje, 'huesped', GRANDE, ES));
  assert.doesNotMatch(anverso(l), /class="tipo"|<details class="btml"|ver en BTML/);
  assert.match(reverso(l), /ver en BTML|<small>tipo /);
});

test('#89 con el botón apagado, una línea arriba dice qué le falta al registro (el rango en que está y el que lo marca); marcado, no hay línea', async () => {
  const m = await mundo();
  const a = await formPago(m);
  const b = a.formulario.ejecucion.boton;
  assert.equal(b.estado, 'apagado');
  const h = html(a);
  const linea = h.match(/<p class="boton-apagado-motivo" role="status">([^<]+)<\/p>/);
  assert.ok(linea, 'la línea');
  assert.equal(linea[1], `el botón sigue apagado: este registro está en «${b.nombre}» (${b.nivel}.${b.grado}) y se marca al llegar al ${b.marca.nivel}.${b.marca.grado}`);
  assert.ok(h.indexOf('boton-apagado-motivo') < h.indexOf('<div class="campo'), 'arriba, antes de los campos');
  // con el botón marcado, ninguna línea; sin rango, otra frase
  const marcado = { ...a, formulario: { ...a.formulario, ejecucion: { ...a.formulario.ejecucion, boton: { ...b, estado: 'marcado' } } } };
  assert.doesNotMatch(html(marcado), /boton-apagado-motivo/);
  const sinRango = { ...a, formulario: { ...a.formulario, ejecucion: { ...a.formulario.ejecucion, boton: { ...b, nombre: null } } } };
  assert.match(html(sinRango), /el botón sigue apagado: este registro aún no tiene rango y se marca al llegar al 3\.1/);
  // y el aro (interactuar) no lleva ni línea ni cuenta de T
  const sin = html(await arbol({ foco: { X: m.encargo.id, pv: 4 }, formulario: { X: m.encargo.id, accion: 'pay', valores: {} } }, m.eje, 'huesped', GRANDE, ES));
  assert.doesNotMatch(sin, /boton-apagado-motivo|ejecucion-t/);
});

// ---------- #70 ----------

test('#70 la autorización, desglosada: una línea por cosa («5 min a cartera, que autoriza»), en el ordenador y en el móvil; el desglose con su detalle, en el reverso', async () => {
  const m = await mundo();
  await criterio(m, 'E', 5);
  for (const medidas of [GRANDE, MOVIL]) {
    const a = await formPago(m, {}, 'huesped', medidas);
    const e = a.formulario.ejecucion;
    assert.deepEqual(e.autorizacion.map((x) => [x.cosa, x.cosaTexto, x.segundos]), [['cartera', 'cartera', 300]]);
    const cara = anverso(html(a));
    assert.match(cara, /<ul class="autoriza"><li data-autoriza="cartera">5 min a cartera, que autoriza<\/li><\/ul>/);
    assert.match(reverso(html(a)), /<li data-parte="autorizacion">autorización: 5 min \(1 que piden segundo factor\)/);
  }
  // dos cosas titulares, dos líneas
  const otra = await generarClaves();
  const r = await A.transaccion(m.eje, 'register a thing', { X: m.altaH, thing: 'caja', minutes: 60, key: otra.publica }, 'huesped', { t: T1 });
  await m.eje.anadir(await firmarPosesion(r.evento, 'caja', otra.privada));
  const c2 = await A.transaccion(m.eje, 'second factor', { X: m.altaH, family: 'E', amount: 6, holder: 'caja' }, 'huesped', { t: T1 });
  await m.eje.anadir(c2.evento);
  const dos = html(await formPago(m));
  assert.equal([...anverso(dos).matchAll(/<li data-autoriza="/g)].length, 2);
  assert.match(anverso(dos), /a cartera, que autoriza<\/li><li data-autoriza="caja">[^<]+ a caja, que autoriza/);
  // sin segundo factor, ninguna línea
  const { eje, menu } = await ejemploCompra();
  const sin = html(await arbol({ foco: { X: menu.id, pv: 4 }, formulario: { X: menu.id, accion: 'declare future T', valores: { what: 'servir', when: '2026-12-01T10:00:00Z' }, ejecutar: true } }, eje, 'huesped', GRANDE, ES));
  assert.doesNotMatch(sin, /class="autoriza"|que autoriza/);
});

test('#70 los motivos no bloqueantes del núcleo salen como aviso (la lectura del segundo factor desbordada, estado PENDIENTE) y el 6 marca lo desbordado', async () => {
  const m = await mundo();
  // Época 0 final (#70): la lectura recorre los movimientos una vez por criterio y 200 caben; desborda hacia los 300 en la
  // candidata. La mitad, el día antes, para que a la huésped le llegue la T de escribirlos.
  for (let i = 0; i < 320; i++) await criterio(m, ['E:casa/EUR', 'E:otra/U' + i], 1, i < 160 ? '2026-11-07T12:00:00Z' : T1);
  const a = await formPago(m);
  const e = a.formulario.ejecucion;
  assert.equal(e.desbordado, true);
  assert.ok(e.motivos.some((x) => x.estado === 'PENDIENTE' && /no se ha podido hacer/.test(x.mensaje)));
  const cara = anverso(html(a));
  assert.match(cara, /<small class="aviso desbordado" role="note" data-desbordado>la lectura «second factor» no se ha podido hacer/);
  assert.doesNotMatch(cara, /^[^]*second factor: límite[^]*the cost of writing/, 'sin el nombre interno de la regla');
  // asentado el pago, el 6 de mi alta lo lista como desbordado: marcado, con su motivo
  const p = await A.transaccion(m.eje, 'pay', { X: m.encargo.id }, 'huesped', { t: T1 });
  await m.eje.anadir(p.evento);
  const seis = await arbol({ foco: { X: m.altaH, pv: 6 } }, m.eje, 'huesped', GRANDE, ES);
  const x = seis.centro.porAutorizar.find((y) => y.id === p.evento.id);
  assert.equal(x.desbordado, true);
  assert.match(html(seis), /<li class="por-autorizar-linea desbordado" data-por-autorizar="[0-9a-f]{64}" data-desbordado><button[^>]*>por autorizar: [^<]+<\/button> · <b class="marca-desbordado">no se pudo leer del todo<\/b> · <small>la lectura «second factor» no se ha podido hacer/);
  // un pendiente normal no lleva la marca
  const n = await mundo();
  await criterio(n, 'E', 5);
  const pn = await A.transaccion(n.eje, 'pay', { X: n.encargo.id }, 'huesped', { t: T1 });
  await n.eje.anadir(pn.evento);
  const seisN = html(await arbol({ foco: { X: n.altaH, pv: 6 } }, n.eje, 'huesped', GRANDE, ES));
  assert.doesNotMatch(seisN, /desbordado|no se pudo leer/);
  assert.match(seisN, /class="por-autorizar-linea" data-por-autorizar=/);
});

// ---------- #90 ----------

/** Un mundo con pasos míos en el camino del 9 (la compra con su fábrica). */
async function conCamino() {
  const c = await ejemploCompra();
  await ejemploFabrica(c.eje, c);
  const a = await arbol({ foco: { X: c.compra.id, pv: 9 } }, c.eje, 'huesped', GRANDE, ES);
  const i = a.camino.pasos.findIndex((p) => p.mio && !p.hacer.lectura);
  assert.ok(i >= 0);
  return { ...c, a, i, p: a.camino.pasos[i] };
}

test('#90 un paso del camino tiene una sola acción visible, la del paso, con el nombre de su plantilla; «previsualizar» ya no es un botón; «reglas» va al reverso del paso', async () => {
  const { a, i, p } = await conCamino();
  const h = html(a);
  const camino = entre(h, '<section class="camino"', '</section>');
  const paso = entre(camino, '<li class="paso mio"', '</li>');
  assert.ok(paso.includes(`data-paso="${i}"`));
  // la acción del paso: una, con el nombre en llano de su plantilla y lo que hace mantener pulsado
  const botones = [...paso.matchAll(/<button type="button"([^>]*)>([^<]*)<\/button>/g)];
  const acciones = botones.filter((b) => b[1].includes('data-lanzar'));
  assert.equal(acciones.length, 1);
  assert.equal(acciones[0][2], p.hacer.nombre);
  assert.match(acciones[0][1], /title="[^"]*mantén pulsado para ver qué pasaría, sin escribir nada"/);
  assert.match(acciones[0][1], new RegExp(`data-previsualizar="${i}"`), 'mantener pulsado previsualiza este mismo paso');
  assert.doesNotMatch(camino, />previsualizar</);
  assert.doesNotMatch(camino, /class="previsualizar"/);
  // lo demás es un botón de dar la vuelta (↻), no otra acción
  assert.deepEqual(botones.filter((b) => !b[1].includes('data-lanzar')).map((b) => b[2]), ['↻']);
  // «reglas» (la fuente del paso) y su regla, solo en el reverso (oculto)
  const atras = entre(paso, '<span class="paso-reverso"', '</span></li>');
  assert.match(atras, /^<span class="paso-reverso" hidden>/);
  assert.match(atras, /de dónde sale: <code>reglas<\/code>/);
  assert.match(atras, /regla que lo pide: <code>stage<\/code>/);
  assert.doesNotMatch(paso.replace(atras, ''), />reglas</);
  assert.doesNotMatch(paso.replace(atras, ''), /class="fuente"/);
});

test('#90 mantener pulsado un paso enseña lo que haría en una frase, sin escribir; lo de abajo del camino no cambia', async () => {
  const { eje, compra, a, i, p } = await conCamino();
  const antes = eje.orden.length;
  const v = await previsualizar(eje, p.hacer.X ?? compra.id, p.hacer.id, p.hacer.parametros ?? {}, 'huesped');
  assert.equal(eje.orden.length, antes, 'no escribe nada');
  assert.equal(v.ok, true);
  assert.match(v.frase, /^se (movería|gastaría|crearía|anunciaría) /);
  assert.match(v.frase, /se gastaría 5 minutos de ti/, 'quien mira es «ti»');
  assert.match(v.frase, /se movería 1 hora de ti a cocina/);
  assert.deepEqual(v.frase.split('; ').length, v.movimientos.length, 'una frase por movimiento');
  assert.ok(v.movimientos.length > 0, 'el desglose por movimientos sigue en el resultado');
  const h = html(await arbol({ foco: { X: compra.id, pv: 9 }, previa: { foco: compra.id, paso: i, ...v } }, eje, 'huesped', GRANDE, ES));
  assert.ok(h.includes(`<small class="previa pasa" role="status">${v.frase}</small>`));
  assert.doesNotMatch(h, /pasaría:|→ nadie|Alta de/, 'sin flechas ni símbolos');
  // un paso que no pasaría dice por qué
  const mal = html(await arbol({ foco: { X: compra.id, pv: 9 }, previa: { foco: compra.id, paso: i, ok: false, motivos: [{ mensaje: 'falta saldo' }], movimientos: [], frase: '' } }, eje, 'huesped', GRANDE, ES));
  assert.match(mal, /<small class="previa no-pasa" role="status">no pasaría: falta saldo<\/small>/);
  void a;
});

/** Los gestos instalados sobre una raíz de mentira: dispara eventos y apunta las llamadas que hacen a la app. */
function gestosDeMentira() {
  const oyentes = [];
  const documento = { defaultView: { innerWidth: 1366, innerHeight: 768 }, addEventListener: (x, f) => oyentes.push([x, f]), removeEventListener() {} };
  const raiz = { ownerDocument: documento, addEventListener: (x, f) => oyentes.push([x, f]), removeEventListener() {}, querySelector: () => null };
  const llamadas = [];
  instalar(raiz, new Proxy({}, { get: (_, nombre) => (...args) => { llamadas.push([nombre, ...args]); } }));
  return { llamadas, disparar: (tipo, e) => { for (const [x, f] of oyentes) if (x === tipo) f(e); } };
}

test('#90 gestos: mantener pulsado (o el clic derecho) un paso lo previsualiza; el clic lo lanza; la vuelta del paso es solo de la pantalla', () => {
  const { llamadas, disparar } = gestosDeMentira();
  const boton = { dataset: { x: 'X1', accion: 'A1', previsualizar: '2', paso: '2' } };
  const objetivo = (resp) => ({ closest: (sel) => { for (const [trozo, v] of Object.entries(resp)) if (sel.includes(trozo)) return v; return null; } });
  let prevenido = 0;
  disparar('contextmenu', { target: objetivo({ '[data-paso][data-previsualizar]': boton, '[data-x]': boton }), clientX: 5, clientY: 5, preventDefault: () => { prevenido++; } });
  assert.deepEqual(llamadas, [['previsualizar', 'X1', 'A1', 2]]);
  assert.equal(prevenido, 1);
  // el clic de un paso lo lanza (no lo previsualiza): otro juego de gestos, sin el mantener de antes
  const g2 = gestosDeMentira();
  const lanzar = { dataset: { x: 'X1', lanzar: 'A1', paso: '2' } };
  g2.disparar('click', { target: objetivo({ '[data-lanzar]': lanzar }), preventDefault() {} });
  assert.deepEqual(g2.llamadas.map((x) => x[0]), ['lanzar']);
  // la vuelta del paso: el reverso aparece y desaparece sin avisar a la app
  g2.llamadas.length = 0;
  const atras = { hidden: true };
  const pulsado = { attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } };
  const li = { querySelector: (sel) => (sel === '.paso-reverso' ? atras : null) };
  const voltear = { closest: (sel) => (sel === '.paso' ? li : null), setAttribute: (k, v) => pulsado.setAttribute(k, v) };
  g2.disparar('click', { target: objetivo({ '[data-voltear-paso]': voltear }), preventDefault() {} });
  assert.deepEqual([atras.hidden, pulsado.attrs['aria-pressed'], g2.llamadas], [false, 'true', []]);
  g2.disparar('click', { target: objetivo({ '[data-voltear-paso]': voltear }), preventDefault() {} });
  assert.deepEqual([atras.hidden, pulsado.attrs['aria-pressed']], [true, 'false']);
  // y la del formulario sí avisa, con su formulario
  const form = {};
  const botonForm = { closest: (sel) => (sel === 'form' ? form : null) };
  g2.disparar('click', { target: { closest: (sel) => (sel === 'button' ? botonForm : sel.includes('[data-voltear-formulario]') ? botonForm : sel.includes('.formulario') ? {} : null) }, preventDefault() {} });
  assert.deepEqual(g2.llamadas, [['voltearFormulario', form]]);
});

test('#90 los textos de la guía distinguen el ejemplo del libro real: el ejemplo no dice «por el servidor del libro compartido»', async () => {
  const base = { historial: [], pensando: false, pendiente: '', error: '', borrador: '', preguntas: [], propuestas: { aqui: 0, fuera: [] } };
  const real = htmlGuia({ ...base, via: 'server', ejemplo: false });
  const ejemplo = htmlGuia({ ...base, via: 'server', ejemplo: true });
  const directa = htmlGuia({ ...base, via: 'direct', ejemplo: true });
  assert.match(real, /por el servidor del libro compartido/);
  assert.doesNotMatch(ejemplo, /por el servidor del libro compartido/);
  assert.match(ejemplo, /ejemplo con datos inventados: aquí no hay libro compartido/);
  assert.match(directa, /directo desde este navegador/);
  // sin servidor, lo que contesta dice dónde está: el ejemplo no manda a configurar un servidor
  const sinSitio = await preguntar({ via: 'server', ejemplo: true, pregunta: 'hola' });
  const sinSitioReal = await preguntar({ via: 'server', ejemplo: false, pregunta: 'hola' });
  assert.equal(sinSitio.motivo, t('guiaSinServidorEjemplo'));
  assert.equal(sinSitioReal.motivo, t('guiaSinServidor'));
  assert.doesNotMatch(sinSitio.motivo, /servidor, eje compartido y clave de lectura/);
  assert.match(APP, /ejemplo: !estado\.cuenta/);
});

// ---------- #95 ----------

test('#95 la celda «qué es» enseña el 0 del registro en llano: «un rato en la carta, 2 minutos, hoy a las 10:14»; el volcado, solo en la cara 5', async () => {
  const { eje, compra } = await ejemploCompra();
  const alta = eje.alta('huesped').id;
  const libro = new LibroLocal(eje, 'huesped');
  const ahora = new Date();
  const hace = new Date(ahora.getTime() - 2 * 60000);
  libro.ver(compra.id, { t: hace.toISOString() });
  libro.tocar(compra.id, 'nivel 1 2', { t: ahora.toISOString() });
  const ev = await libro.englobar(undefined, { nota: 'un rato en la carta' });
  assert.ok(ev);
  const a = await arbol({ foco: { X: compra.id, pv: 0 }, local: libro, sitio: { X: alta, lugar: '0', general: true } }, eje, 'huesped', GRANDE, { t: ahora.toISOString() });
  const cero = a.sitio.posiciones[0];
  const hora = (d) => String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  assert.equal(cero.valor, `un rato en la carta, 2 minutos, hoy a las ${hora(ahora)}`);
  const h = html(a, { cuenta: { nombre: 'yo', alta, identidad: 'huesped' }, cuentas: [] });
  assert.ok(h.includes(cero.valor));
  assert.doesNotMatch(cero.valor, /[0-9a-f]{16}|T\d\d:\d\d:\d\dZ|huesped| · /);
  // el 0 del registro se dice así también con un solo minuto
  const libro2 = new LibroLocal(eje, 'huesped');
  libro2.ver(compra.id, { t: ahora.toISOString() });
  libro2.tocar(compra.id, 'nivel 1 2', { t: new Date(ahora.getTime() + 20000).toISOString() });
  await libro2.englobar(undefined, { nota: 'otro rato' });
  const b = await arbol({ foco: { X: compra.id, pv: 0 }, local: libro2, sitio: { X: alta, lugar: '0', general: true } }, eje, 'huesped', GRANDE, { t: ahora.toISOString() });
  assert.match(b.sitio.posiciones[0].valor, /^otro rato, 1 minuto, hoy a las \d\d:\d\d$/);
  // el volcado entero sigue en el registro (el editor de BTML de la cara 5)
  assert.equal(eje.obtener(ev.id).payload.length, 8);
});

// ---------- #88 y #92 (ya estaban: se comprueban aquí) ----------

test('#88 el botón cíclico del 3 dice lo que filtra con su flecha (lo que doy, lo que recibo, todo) y las cajas vacías dicen qué las llena', async () => {
  const { eje, compra } = await ejemploCompra();
  assert.deepEqual([t('filtro_todos'), t('filtro_doy'), t('filtro_recibo')], ['↔ todo', '→ lo que doy', '← lo que recibo']);
  for (const [filtro, texto] of [['todos', '↔ todo'], ['doy', '→ lo que doy'], ['recibo', '← lo que recibo']]) {
    const h = html(await arbol({ foco: { X: compra.id, pv: 3 }, filtrosDelTres: { 1: filtro } }, eje, 'huesped', GRANDE, ES));
    assert.match(h, new RegExp(`data-filtro="${filtro}"[^>]*>${texto}</button>`), 'dice ' + texto);
  }
  const h = html(await arbol({ foco: { X: compra.id, pv: 3 } }, eje, 'huesped', GRANDE, ES));
  for (const frase of ['aquí entra quien te escribe', 'quien compra o vende contigo', 'a quien das tu R', 'a quien has vetado']) assert.ok(h.includes(`<span class="hijo-vacio">${frase}</span>`), frase);
  assert.doesNotMatch(h, /<span class="hijo-vacio">nadie<\/span>/);
});

test('#92 la configuración se abre separada por posición: el 2 = mis criterios y preferencias, el 9 = guía y exterior, cada botón solo su parte con el nombre llano', async () => {
  const { eje, compra } = await ejemploCompra();
  const alta = eje.alta('huesped').id;
  const h = html(await arbol({ foco: { X: compra.id, pv: 0 }, sitio: { X: alta, lugar: '0', general: true } }, eje, 'huesped', GRANDE, ES), { cuenta: { nombre: 'yo', alta, identidad: 'huesped' }, cuentas: [] });
  assert.match(h, /data-config="2"[^>]*>mis criterios y preferencias<\/button>/);
  assert.match(h, /data-config="9"[^>]*>guía y exterior<\/button>/);
  const p = preferencias(eje, 'huesped');
  const guia = { campos: [{ pv: 1, clave: 'guide model', etiqueta: 'modelo de la guía', valor: '', marcador: '', ayuda: '' }], claveIa: '' };
  const exterior = { campos: [{ pv: 1, clave: 'relay url', etiqueta: 'relé', valor: '', marcador: '', ayuda: '' }] };
  const segundoFactor = { criterios: [], campos: [{ nombre: 'family', etiqueta: 'familia', tipo: 'text', ayuda: '', valor: '' }], titulares: [] };
  const etiquetas = (x) => [...x.matchAll(/<label for="[^"]+">([^<]+)<\/label>/g)].map((m) => m[1]);
  const dos = etiquetas(htmlConfiguracion(p, { claveLectura: '', guia, exterior, segundoFactor, parte: '2' }));
  const nueve = etiquetas(htmlConfiguracion(p, { claveLectura: '', guia, exterior, segundoFactor, parte: '9' }));
  for (const clave of ['idioma', 'pintado', 'tamaños', 'familia']) assert.ok(dos.includes(clave), 'el 2 trae ' + clave);
  for (const clave of ['servidor', 'clave de lectura', 'modelo de la guía', 'relé']) assert.ok(nueve.includes(clave), 'el 9 trae ' + clave);
  assert.ok(!dos.some((x) => nueve.includes(x)) && !nueve.some((x) => dos.includes(x)), 'ningún campo en las dos partes');
  void contrato;
});

test('la propuesta que sube de escala porque hoy no alcanza la que bastaba lo dice antes de firmar; elegida a mano, no', async () => {
  const { eje, menu } = await ejemploCompra();
  const form = (escala) => arbol({ foco: { X: menu.id, pv: 4 }, formulario: { X: menu.id, accion: 'declare future T', valores: { what: 'servir', when: '2026-12-01T10:00:00Z' }, ejecutar: true, ...(escala ? { escala } : {}) } }, eje, 'huesped', MOVIL, ES);
  // con minutos de sobra, la propuesta va en minutos y no avisa
  const antes = await form();
  assert.deepEqual([antes.formulario.ejecucion.propuesta.desde, antes.formulario.ejecucion.propuesta.subeDe], ['minuto', undefined]);
  assert.doesNotMatch(html(antes), /data-sube-de/);
  // la huésped agota hoy sus minutos y sus segundos
  const quema = (escala) => ({ token: 'T', escala, cantidad: eje.saldoT('huesped', escala, T1), de: 'huesped', a: null });
  await eje.escribir({ autor: 'huesped', sobre: menu.id, t: T1, payload: 'un día largo', movimientos: [quema('minuto'), quema('segundo')] });
  assert.deepEqual([eje.saldoT('huesped', 'minuto', T1), eje.saldoT('huesped', 'segundo', T1)], [0, 0]);
  const a = await form();
  const e = a.formulario.ejecucion;
  assert.deepEqual([e.propuesta.desde, e.propuesta.subeDe, e.denominacion, e.alcanza], ['hora', 'minuto', [{ escala: 'hora', cantidad: 1 }], true]);
  assert.ok(e.coste < 3600, 'lo exigido es menos de una hora: se quema de más');
  assert.match(anverso(html(a)), /<small class="aviso" data-sube-de="minuto">hoy no te alcanza la T de minutos: se propone pagar con horas y se quema 1 h en vez de \d+ min<\/small>/);
  // elegida a mano, es su decisión: sin aviso
  assert.doesNotMatch(html(await form('hora')), /data-sube-de/);
});
