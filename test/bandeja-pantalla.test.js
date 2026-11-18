// La bandeja en pantalla (A33; agram-equipo/DISENO_BANDEJA_PV4.md, pasos 2 y 3; carta/bandeja-pantalla.js): lo que se
// pinta de lo compuesto (la cuenta en el marco, la tira donde se compuso, la marca en la ficha de la acción, el 4 y el pie
// del formulario) y los gestos que lo mueven. Sin navegador: el HTML de dom.js sobre un árbol de verdad y un DOM de mentira
// para los gestos. Lo que hace app.js con todo esto (poner al cambiar un campo, ejecutar, repintar) no se prueba aquí.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { arbol } from '../carta/carta.js';
import { html } from '../carta/dom.js';
import { instalar } from '../carta/gestos.js';
import { crearBandeja, probarAhora } from '../carta/bandeja.js';
import {
  vistaDeLaBandeja, etiquetaDeParametro, delSitio, ordenDelCuatro, tienePendiente, textoDeT, PV_DE_LA_BANDEJA,
  htmlCuentaDeLaBandeja, htmlTiraDeLaBandeja, htmlMarcaDeLaBandeja, htmlBandejaDelCuatro, htmlEstadoDeLaEntrada, htmlPieDeLaBandeja,
} from '../carta/bandeja-pantalla.js';
import { t, TEXTOS } from '../carta/textos.js';
import { ejemploCompra } from '../ejemplos/ikisai/compra-food.mjs';

const PC = { ancho: 1920, alto: 1080 };
const memoria = () => { const m = new Map(); return { m, leer: (k) => m.get(k) ?? null, guardar: (k, v) => (m.set(k, v), true) }; };

/** El ejemplo de la compra con el 3 y el 4 abiertos: el árbol, sus acciones por punto de vista y una bandeja vacía de huesped. */
async function escena() {
  const c = await ejemploCompra();
  const X = c.compra.id;
  const estado = { foco: { X, pv: 0 }, niveles: { 3: 3, 4: 3 } };
  const a = await arbol(estado, c.eje, 'huesped', PC);
  const deLa = (pv) => a.laterales.find((n) => n.pv === pv).acciones;
  const b = crearBandeja({ almacen: memoria(), libro: c.eje.genesisId, cuenta: 'huesped' });
  return { ...c, X, estado, a, deLa, b };
}

/** Un item como los de bandeja.probar, para las pruebas de pintado sin libro. */
const item = (id, { puesta = false, para = null, entra = true, X = 'X1', pv = 3, accion = 'acc-' + id, motivos = [], faltan, mueve = [] } = {}) => ({
  id, puesta, para, accion, entra, motivos, ...(faltan ? { faltan } : {}),
  entrada: puesta ? undefined : { id, accion, X, valores: {}, donde: { X, pv }, completa: !faltan, de: [] },
  resumen: { nace: { accion, autor: 'yo', sobre: X, en: '3000000000', t: null }, movimientos: [{ token: 'T', serie: 'T:minuto', cantidad: 5, de: 'yo', a: null }, ...mueve], cuesta: { segundos: 300, piezas: [] } },
});

test('la vista de la bandeja: cuántas, cuántas no entran, el resumen sin la quema (va en «cuesta») y lo que pone la bandeja donde se compuso lo que lo necesita', () => {
  const probado = {
    ok: false,
    items: [
      item('b1', { mueve: [{ token: 'R', serie: 'R:yo', cantidad: 2, de: 'yo', a: 'ana' }] }),
      item(null, { puesta: true, para: 'b2', accion: 'reserva' }),
      item('b2', { X: 'X2', pv: 1, entra: false, motivos: [{ regla: null, mensaje: 'lo que exige antes no entra' }] }),
      item('b3', { X: 'X1', pv: 4, entra: false, faltan: ['text'] }),
    ],
    motivos: [], cuesta: { segundos: 1200 },
  };
  const v = vistaDeLaBandeja(probado, { nombre: (a) => 'N:' + a, quien: (x) => 'Q:' + x, registro: (id) => 'R:' + id, cuanto: (m) => m.cantidad + ' ' + m.serie });
  assert.equal(v.total, 3, 'lo que pone la bandeja no cuenta');
  assert.equal(v.noEntran, 2);
  assert.equal(v.ok, false);
  assert.equal(v.cuesta, 1200);
  const [b1, puesta, b2, b3] = v.items;
  assert.deepEqual(b1.resumen.movimientos, [t('bandejaMueve', { cuanto: '2 R:yo', de: 'Q:yo', a: 'Q:ana' })], 'la quema del autor no es un movimiento: es lo que cuesta');
  assert.equal(b1.resumen.sobre, 'R:X1');
  assert.equal(b1.resumen.nace, 'N:acc-b1');
  assert.deepEqual(puesta.donde, { X: 'X2', pv: 1 }, 'se ve donde se compuso lo que la necesita');
  assert.equal(puesta.puesta, true);
  assert.equal(b2.motivo, 'lo que exige antes no entra');
  assert.equal(b3.motivo, t('bandejaFalta', { campos: 'text' }));
  // Dónde se ve cada cosa.
  assert.deepEqual(delSitio(v, 'X2', 1).map((x) => x.id), [null, 'b2']);
  assert.deepEqual(ordenDelCuatro(v, 'X2').map((x) => x.id), [null, 'b2', 'b1', 'b3'], 'en el 4 de X2, primero lo compuesto sobre X2');
  assert.equal(tienePendiente(v, 'X1', 'acc-b1'), true);
  assert.equal(tienePendiente(v, 'X2', 'reserva'), false, 'lo que pone la bandeja no marca ninguna ficha');
  // Vacía, nada que pintar.
  assert.equal(vistaDeLaBandeja({ ok: false, items: [], motivos: [] }), null);
  assert.equal(vistaDeLaBandeja(null), null);
  assert.equal(PV_DE_LA_BANDEJA, 4);
  assert.equal(textoDeT(3660), t('tPieza_hora', { n: 1 }) + ' ' + t('tPieza_minuto', { n: 1 }));
});

test('el html: la cuenta (vacía no se pinta; distinta si algo no entra), la tira con abrir y quitar (lo puesto, sin quitar), la marca, el 4 con un solo botón y todo escapado', () => {
  const malo = '<img src=x onerror=alert(1)>';
  const probado = { ok: true, items: [item('b1'), item(null, { puesta: true, para: 'b2', accion: 'reserva', X: 'X1' }), item('b2')], motivos: [], cuesta: { segundos: 900 } };
  const v = vistaDeLaBandeja(probado, { nombre: () => malo });
  assert.equal(htmlCuentaDeLaBandeja(null), '');
  assert.match(htmlCuentaDeLaBandeja(v), /<button type="button" class="bandeja-cuenta" data-nodo="control" data-bandeja-ir/);
  const noEntra = vistaDeLaBandeja({ ...probado, ok: false, items: [item('b1', { entra: false })] });
  assert.match(htmlCuentaDeLaBandeja(noEntra), /class="bandeja-cuenta no-entra"/);
  const tira = htmlTiraDeLaBandeja(v, 'X1', 3);
  assert.equal((tira.match(/data-bandeja-quitar="/g) ?? []).length, 2, 'se quita lo compuesto, no lo que pone la bandeja');
  assert.equal((tira.match(/data-bandeja-abrir="/g) ?? []).length, 2);
  assert.equal((tira.match(/data-bandeja-puesta/g) ?? []).length, 1);
  assert.ok(!tira.includes(malo) && tira.includes('&lt;img'), 'escapado');
  assert.equal(htmlTiraDeLaBandeja(v, 'X1', 6), '', 'en otro sitio, nada');
  assert.match(htmlMarcaDeLaBandeja(v, 'X1', 3), /data-bandeja-marca="3"/);
  assert.equal(htmlMarcaDeLaBandeja(v, 'X9', 3), '');
  const cuatro = htmlBandejaDelCuatro(v, 'X1');
  assert.equal((cuatro.match(/data-bandeja-ejecutar/g) ?? []).length, 1, 'UN botón de ejecutar');
  assert.ok(!cuatro.includes('data-no-lanza'));
  assert.ok(cuatro.includes(t('bandejaTotal', { t: textoDeT(900) })));
  const no = htmlBandejaDelCuatro(noEntra, 'X1');
  assert.match(no, /data-bandeja-ejecutar data-no-lanza aria-disabled="true">[^<]*no entra/, 'el botón lo dice y no lanza');
  assert.equal(htmlBandejaDelCuatro(null, 'X1'), '');
  // El pie del formulario: en la bandeja, «listo» y «quitar» (sin submit); en el aro, «ejecutar ahora» (submit) con el resumen.
  const enBandeja = htmlPieDeLaBandeja({ modo: 'bandeja', id: 'b1', vista: v });
  assert.ok(enBandeja.includes('data-bandeja-listo') && enBandeja.includes('data-bandeja-quitar="b1"') && !enBandeja.includes('type="submit"'));
  assert.ok(!htmlPieDeLaBandeja({ modo: 'bandeja', id: null, vista: v }).includes('data-bandeja-quitar'), 'sin entrada aún, nada que quitar');
  assert.ok(htmlEstadoDeLaEntrada({ modo: 'bandeja', id: null }).includes(t('bandejaSinEntrada')));
  const ahora = htmlPieDeLaBandeja({ modo: 'ahora', vista: v });
  assert.match(ahora, /<button type="submit" class="ejecutar-ahora" data-ejecutar-ahora>/);
  assert.ok(ahora.includes(t('ahoraResumen')));
  assert.ok(htmlPieDeLaBandeja({ modo: 'ahora', probando: true, vista: null }).includes(t('bandejaProbando')));
  for (const k of ['bandejaCuenta', 'bandejaEjecutar', 'bandejaListo', 'ahoraEjecutar', 'bandejaNoSeLanza']) assert.ok(TEXTOS.es[k], 'texto en textos.js: ' + k);
});

test('en la carta: compuesto desde el 4 de una compra, la cuenta en el marco, la tira bajo la cabecera del 4, la marca en la ficha y la bandeja arriba del 4; probado sobre el libro de verdad', async () => {
  const { eje, X, a, deLa, b } = await escena();
  const sinNada = html(a, {});
  assert.ok(!sinNada.includes('data-bandeja-ir') && !sinNada.includes('bandeja-tira') && !sinNada.includes('data-bandeja-cuatro'), 'vacía, no se pinta');
  const acciones4 = deLa(PV_DE_LA_BANDEJA);
  const proponer = acciones4.nombradas.find((x) => x.nombre === 'proponer');
  assert.ok(proponer, 'el 4 de la compra ofrece «proponer»');
  // Lo que haría la app: poner al rellenar el formulario lanzado desde la cabecera del 4.
  assert.equal(b.poner({ accion: proponer.id, X, valores: { title: 'Pan', content: 'dos barras' }, donde: { X, pv: PV_DE_LA_BANDEJA } }).ok, true);
  assert.equal(b.poner({ accion: proponer.id, X, valores: { title: 'Leche' }, donde: { X, pv: 3 }, completa: false }).ok, true);
  const probado = await b.probar(eje, 'huesped');
  assert.deepEqual(probado.items.map((x) => x.entra), [true, false]);
  const v = vistaDeLaBandeja(probado);
  const h = html(a, { bandeja: v });
  assert.equal((h.match(/data-bandeja-ir/g) ?? []).length, 1, 'la cuenta, una vez, en el marco');
  assert.ok(h.indexOf('data-bandeja-ir') < h.indexOf('<div class="escena">'), 'fuera de la escena: en el marco de la lente');
  assert.match(h, /class="bandeja-cuenta no-entra"/, 'una está a medias: la cuenta lo dice');
  assert.match(h, new RegExp(`<ul class="bandeja-tira" data-bandeja-tira="4" data-x="${X}"`), 'la tira, bajo la cabecera del 4');
  assert.match(h, new RegExp(`<ul class="bandeja-tira" data-bandeja-tira="3" data-x="${X}"`), 'y bajo la del 3, la que se compuso ahí');
  assert.match(h, new RegExp(`class="accion pendiente"[^>]*data-lanzar="${proponer.id}"`), 'la ficha de la acción lleva la marca');
  assert.equal((h.match(/data-bandeja-cuatro/g) ?? []).length, 1, 'la bandeja entera, en el 4');
  const seccion4 = h.slice(h.indexOf('<section class="pv pv-4 '));
  assert.ok(seccion4.indexOf('data-bandeja-cuatro') < seccion4.indexOf('</section>'), 'dentro del 4');
  assert.match(h, /data-bandeja-ejecutar data-no-lanza/, 'algo a medias: el botón no lanza');
});

test('el formulario: lanzado desde un punto de vista no tiene botón que escriba; desde el aro, «ejecutar ahora» con el resumen de la misma prueba en seco', async () => {
  const { eje, X, a, deLa } = await escena();
  const proponer = deLa(PV_DE_LA_BANDEJA).nombradas.find((x) => x.nombre === 'proponer');
  const conForm = await arbol({ foco: { X, pv: 0 }, formulario: { X, accion: proponer.id, valores: { title: 'Pan' } } }, eje, 'huesped', PC);
  const deSiempre = html(conForm, {});
  assert.match(deSiempre, /<button type="submit">/, 'sin bandeja, el de siempre');
  const enBandeja = html({ ...conForm, formulario: { ...conForm.formulario, bandeja: { modo: 'bandeja', id: null } } }, {});
  const form = enBandeja.slice(enBandeja.indexOf('data-formulario'));
  assert.ok(!/type="submit"/.test(form.slice(0, form.indexOf('</form>'))), 'en la bandeja, nada que escriba');
  assert.ok(form.includes('data-bandeja-listo'));
  const prueba = await probarAhora(eje, 'huesped', { accion: proponer.id, X, valores: { title: 'Pan', content: 'dos' } });
  assert.equal(prueba.ok, true, JSON.stringify(prueba.items.map((x) => x.motivos)));
  const ahora = html({ ...conForm, formulario: { ...conForm.formulario, bandeja: { modo: 'ahora', vista: vistaDeLaBandeja(prueba) } } }, {});
  assert.match(ahora, /data-ejecutar-ahora/);
  assert.ok(ahora.includes(t('ahoraResumen')) && ahora.includes('bandeja-entra'));
  assert.ok(a);
});

/** Un elemento de mentira: `closest` responde por el selector exacto (cada parte de una lista con comas). */
const el = (mapa, dataset = {}) => {
  const yo = { dataset, closest: (sel) => { for (const s of sel.split(',').map((x) => x.trim())) if (Object.hasOwn(mapa, s)) return mapa[s] === true ? yo : mapa[s]; return null; }, matches: (sel) => sel.split(',').some((s) => Object.hasOwn(mapa, s.trim()) && mapa[s.trim()] === true) };
  return yo;
};
function gestos() {
  const oyentes = [];
  const documento = { defaultView: { innerWidth: 1920, innerHeight: 1080 }, addEventListener: (t2, f) => oyentes.push([t2, f]), removeEventListener() {} };
  const raiz = { ownerDocument: documento, addEventListener: (t2, f) => oyentes.push([t2, f]), removeEventListener() {}, querySelector: () => null };
  const llamadas = [];
  instalar(raiz, new Proxy({}, { get: (_, nombre) => (...args) => { llamadas.push([nombre, ...args]); } }));
  return { disparar: (tipo, e) => { for (const [t2, f] of oyentes) if (t2 === tipo) f({ preventDefault() {}, ...e }); }, llamadas };
}

test('gestos: lanzar desde un punto de vista lleva su pv (se compone); desde el aro o «escribir aquí», aro (se ejecuta ahora); los botones de la bandeja y cada cambio de un campo', () => {
  const g = gestos();
  const cabecera = { dataset: { pvAcciones: '3', x: 'X1' } };
  g.disparar('click', { target: el({ '[data-lanzar]': true, 'button': true, '[data-pv-acciones]': cabecera }, { lanzar: 'A1', x: 'X1' }) });
  g.disparar('click', { target: el({ '[data-lanzar]': true, 'button': true, '.aro': { dataset: { x: 'X1' } } }, { lanzar: 'A2', x: 'X1' }) });
  g.disparar('click', { target: el({ '[data-lanzar]': true, 'button': true, '.escribir-aqui': true, '[data-pv]': { dataset: { pv: '9' } } }, { lanzar: 'A3', x: 'X1' }) });
  g.disparar('click', { target: el({ '[data-lanzar]': true, 'button': true, '[data-pv]:not(.ocupante):not(.rejilla-celda):not(.hijo)': { dataset: { pv: '4', x: 'X1' } } }, { lanzar: 'A4', x: 'X1', ejecutar: '' }) });
  assert.deepEqual(g.llamadas, [
    ['lanzar', 'X1', 'A1', null, { pv: 3 }],
    ['lanzar', 'X1', 'A2', null, { aro: true }],
    ['lanzar', 'X1', 'A3', null, { aro: true }],
    ['lanzar', 'X1', 'A4', null, { ejecutar: true, pv: 4 }],
  ]);
  const h = gestos();
  const form = { tipo: 'formulario' };
  h.disparar('click', { target: el({ '[data-bandeja-ir]': true, 'button': true }) });
  h.disparar('click', { target: el({ '[data-bandeja-quitar]': true, 'button': true }, { bandejaQuitar: 'b2' }) });
  h.disparar('click', { target: el({ '[data-bandeja-abrir]': true, 'button': true }, { bandejaAbrir: 'b1' }) });
  h.disparar('click', { target: el({ '[data-bandeja-listo]': true, 'button': true, '.formulario': true, '[data-formulario]': form }) });
  h.disparar('click', { target: el({ '[data-bandeja-ejecutar]': true, 'button': true }) });
  h.disparar('click', { target: el({ '[data-bandeja-ejecutar]': true, 'button': true }, { noLanza: '' }) });
  h.disparar('input', { target: el({ 'input[name]': true, '[data-formulario]': form }) });
  assert.deepEqual(h.llamadas, [['bandejaIr'], ['bandejaQuitar', 'b2'], ['bandejaAbrir', 'b1'], ['bandejaListo', form], ['bandejaEjecutar'], ['cambioFormulario', form]], 'el botón que no lanza no llama a nada');
});

test('la app: el método enviar(form) ya no escribe por su cuenta (sin enviar( ni la pregunta aparte de la reserva); ejecuta por ejecutarAhora y compone por la bandeja', () => {
  const app = readFileSync(new URL('../carta/app.js', import.meta.url), 'utf8');
  const cuerpo = app.slice(app.indexOf('  async enviar(form) {') + '  async enviar(form) {'.length, app.indexOf('  // ---- «Reglas del libro»'));
  assert.ok(cuerpo.length > 100);
  assert.doesNotMatch(cuerpo, /(?<![\w$.])enviar\s*\(/, 'sin enviar(');
  assert.doesNotMatch(cuerpo, /antesDelMensaje|reservaAntes|confirmarEnPagina/, 'la reserva va en el mismo todo o nada');
  assert.match(cuerpo, /ejecutarAhora\(/);
  assert.match(app, /bandejaEjecutar\(\) \{[^]*?b\.ejecutar\(estado\.eje, estado\.identidad, firmarCon\(estado\.identidad\)/, 'el 4 ejecuta con el firmante de hoy');
  assert.match(app, /function trasEjecutar\(r\) \{[^]*?trasEscribir\(\);/, 'al asentar, guardar y la cola de subida, como enviar');
});

test('un campo en la bandeja se nombra por lo que escribe y no se reabre (no tiene formulario); el pie ofrece elegir el archivo de un parámetro de archivo', () => {
  const campo = { ...item('b1'), accion: null, entrada: { id: 'b1', tipo: 'campo', en: '3000000000', accion: null, X: 'X1', valores: { texto: 'hola <b>' }, donde: { X: 'X1', pv: 3 }, completa: true, de: [] } };
  const v = vistaDeLaBandeja({ ok: true, items: [campo], motivos: [] }, { nombre: () => 'NO' });
  assert.equal(v.items[0].nombre, t('bandejaCampo', { texto: 'hola <b>' }));
  assert.equal(v.items[0].tipo, 'campo');
  const tira = htmlTiraDeLaBandeja(v, 'X1', 3);
  assert.ok(!tira.includes('data-bandeja-abrir') && tira.includes('data-bandeja-quitar="b1"') && tira.includes('hola &lt;b&gt;'));
  const pie = htmlPieDeLaBandeja({ modo: 'bandeja', id: null, archivos: [{ nombre: 'file', etiqueta: 'archivo' }] });
  assert.match(pie, /data-bandeja-archivo="file"/);
  assert.ok(!htmlPieDeLaBandeja({ modo: 'ahora' }).includes('data-bandeja-archivo'));
  const g = gestos();
  const form = { f: 1 };
  g.disparar('click', { target: el({ '[data-bandeja-archivo]': true, 'button': true, '[data-formulario]': form, '.formulario': true }, { bandejaArchivo: 'file' }) });
  assert.deepEqual(g.llamadas, [['bandejaArchivo', 'file', form]]);
});

test('la app: tocar un campo y una acción con archivo ya no escriben directo (sin escribirDesde en campo, sin adjuntarConAccion); se suben los archivos antes de firmar', () => {
  const app = readFileSync(new URL('../carta/app.js', import.meta.url), 'utf8');
  const campo = app.slice(app.indexOf('  async campo(X, pv, texto'), app.indexOf('  cargarMas(pv) {'));
  assert.ok(campo.length > 100);
  assert.doesNotMatch(campo, /escribirDesde\(/);
  assert.match(campo, /bandeja\(\)\?\.poner\(\{ \.\.\.entrada, donde: \{ X, pv \} \}\)/, 'desde un punto de vista, a la bandeja');
  assert.match(campo, /ejecutarAhora\(/, 'desde el aro, ahora');
  assert.doesNotMatch(app, /adjuntarConAccion/);
  assert.match(app, /subirAntesDeFirmar\(b\.listar\(\)\.entradas\.map/);
  assert.match(app, /opcionesDelAparato, \.\.\.\(estado\.cuenta/, 'el aparato da las opciones de un parámetro de archivo');
  const archivos = readFileSync(new URL('../carta/archivos.js', import.meta.url), 'utf8');
  assert.doesNotMatch(archivos, /adjuntarConAccion|validarSinFirmar/);
});

test('la cuenta no tapa nada (repaso a 400 px): en Mapped va en el flujo del marco; en Sequenced, encima de los dígitos y con su alto guardado; con un formulario abierto no se pinta', () => {
  const css = readFileSync(new URL('../carta/estilo.css', import.meta.url), 'utf8');
  const regla = (sel) => { const i = css.indexOf(sel + '{'); assert.ok(i >= 0, 'falta ' + sel); return css.slice(i, css.indexOf('}', i)); };
  assert.doesNotMatch(regla('.bandeja-cuenta'), /position:fixed/, 'por defecto, en el flujo');
  const apilada = regla('.carta-apilada>.bandeja-cuenta');
  assert.match(apilada, /position:fixed/);
  assert.match(apilada, /bottom:calc\(var\(--emparejar-alto,0px\) \+ 41px/, 'encima de la fila de los dígitos (4 + 32 + 4 px y su borde)');
  assert.match(regla('.carta-apilada:has(>.bandeja-cuenta)'), /padding-bottom:calc\(48px \+ 44px/, 'la columna guarda su alto: no tapa lo último');
  assert.match(regla('.carta:has(.formulario-fondo)>.bandeja-cuenta'), /display:none/);
  const digito = regla('.digito');
  assert.match(digito, /height:32px/, 'si cambia el alto de los dígitos, cambia también el sitio de la cuenta');
});

test('lo que falta se dice con la etiqueta del parámetro en el idioma, la misma del formulario, nunca con su nombre interno', async () => {
  const { formulario } = await import('../carta/carta.js');
  const { eje, X, deLa, b } = await escena();
  const accion = deLa(7).nombradas[0]; // «comprometer tiempo»: pide cosas que no tienen defecto
  const campos = formulario(eje, X, accion.id, 'huesped', {}, { idioma: 'es' }).campos;
  const faltan = campos.filter((c) => c.falta);
  assert.ok(faltan.length > 0, 'pide algo');
  for (const c of faltan) assert.equal(etiquetaDeParametro(eje, accion.id, c.nombre, { idioma: 'es' }), c.etiqueta, c.nombre);
  b.poner({ accion: accion.id, X, valores: {}, donde: { X, pv: 7 }, completa: false });
  const probado = await b.probar(eje, 'huesped', { idioma: 'es' });
  const v = vistaDeLaBandeja(probado, { etiqueta: (a, n) => etiquetaDeParametro(eje, a, n, { idioma: 'es' }) });
  const motivo = v.items[0].motivo;
  assert.ok(probado.items[0].faltan.length > 0);
  for (const n of probado.items[0].faltan) {
    const etiqueta = etiquetaDeParametro(eje, accion.id, n, { idioma: 'es' });
    assert.ok(motivo.includes(etiqueta), etiqueta);
    if (etiqueta !== n) assert.ok(!new RegExp(`\b${n}\b`).test(motivo.replace(etiqueta, '')), 'sin el nombre interno: ' + n);
  }
});

test('la tira dice el nombre una sola vez (el resumen ya empieza por él); a medias, solo el nombre', () => {
  const v = vistaDeLaBandeja({ ok: false, items: [item('b1'), item('b2', { faltan: ['x'], entra: false })], motivos: [] }, { nombre: () => 'comprometer tiempo', registro: () => 'la compra' });
  v.items[1].resumen = null;
  const tira = htmlTiraDeLaBandeja(v, 'X1', 3);
  const primera = tira.slice(0, tira.indexOf('</li>'));
  assert.equal(primera.split('comprometer tiempo').length - 1, 1, 'una vez');
  assert.ok(primera.includes(t('bandejaNace', { accion: 'comprometer tiempo', sobre: 'la compra' })));
  const segunda = tira.slice(tira.indexOf('</li>'));
  assert.equal(segunda.split('comprometer tiempo').length - 1, 1);
});
