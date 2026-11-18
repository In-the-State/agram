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
  htmlCuentaDeLaBandeja, htmlTiraDeLaBandeja, htmlMarcaDeLaBandeja, htmlBandejaDelCuatro, htmlEstadoDeLaEntrada, htmlPieDeLaBandeja, ponerAlDiaEnPantalla,
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
  assert.match(regla('.carta:has(.formulario-fondo,.aro-fondo,.sitio-fondo,.puente-fondo,.core-fondo,.roseton-pantalla)>.bandeja-cuenta'), /display:none/);
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

/** Un DOM de mentira, lo justo para ponerAlDiaEnPantalla: hermanos, clases, outerHTML e insertAdjacentHTML que se apuntan. */
function domDeMentira() {
  const hechos = [];
  const nodo = (clases, dataset = {}, hijos = []) => {
    const n = {
      dataset, hijos, siguiente: null, quitado: false,
      classList: { contains: (c) => clases.includes(c), toggle: (c, si) => { const i = clases.indexOf(c); if (si && i < 0) clases.push(c); if (!si && i >= 0) clases.splice(i, 1); } },
      clases,
      get nextElementSibling() { return n.siguiente && !n.siguiente.quitado ? n.siguiente : null; },
      matches: (sel) => sel.split(',').some((s) => clases.includes(s.trim().slice(1))),
      remove: () => { n.quitado = true; hechos.push(['quitar', clases.join(' ')]); },
      insertAdjacentHTML: (donde, html) => hechos.push(['meter', dataset.x ?? clases.join(' '), html]),
      querySelectorAll: () => hijos,
      set outerHTML(html) { hechos.push(['cambiar', dataset.x, html]); },
    };
    return n;
  };
  const botonA = nodo(['accion'], { lanzar: 'acc-b1' });
  const botonB = nodo(['accion', 'pendiente'], { lanzar: 'otra' });
  const cab3 = nodo(['pv-acciones'], { x: 'X1', pvAcciones: '3' }, [botonA, botonB]);
  const viejaTira = nodo(['bandeja-tira'], { x: 'X1' });
  cab3.siguiente = viejaTira;
  const cab6 = nodo(['pv-acciones', 'marca'], { x: 'X1', pvAcciones: '6' });
  const cuatro = nodo(['bandeja-cuatro'], { x: 'X1' });
  const carta = nodo(['carta']);
  const raiz = {
    querySelectorAll: (sel) => (sel.startsWith('.pv-acciones') ? [cab3, cab6] : sel === '[data-bandeja-cuatro]' ? [cuatro] : []),
    querySelector: (sel) => (sel === '.carta' ? carta : null),
  };
  return { raiz, hechos, botonA, botonB, viejaTira };
}

test('con el formulario abierto, lo compuesto se ve ya donde se compuso: la tira, la marca de la ficha, el 4 y la cuenta se ponen al día sin repintar', () => {
  const v = vistaDeLaBandeja({ ok: true, items: [item('b1'), item('b2', { pv: 6 })], motivos: [] });
  const d = domDeMentira();
  ponerAlDiaEnPantalla(d.raiz, v);
  assert.equal(d.viejaTira.quitado, true, 'la tira de antes se va');
  const metidos = d.hechos.filter((h) => h[0] === 'meter');
  assert.ok(metidos.some((h) => h[1] === 'X1' && h[2].includes('data-bandeja-tira="3"') && h[2].includes('data-bandeja-abrir="b1"')), 'la tira nueva, tras la cabecera del 3');
  assert.ok(metidos.some((h) => h[1] === 'X1' && h[2].includes('data-bandeja-marca="6"')), 'en el 6 comprimido, la marca');
  assert.ok(metidos.some((h) => h[1] === 'carta' && h[2].includes('data-bandeja-ir')), 'la cuenta');
  assert.ok(d.hechos.some((h) => h[0] === 'cambiar' && h[2].includes('data-bandeja-cuatro')), 'el 4');
  assert.ok(d.botonA.clases.includes('pendiente') && !d.botonB.clases.includes('pendiente'), 'la marca de pendiente en la ficha, y fuera donde ya no hay');
  // Vacía: se quita todo.
  const d2 = domDeMentira();
  ponerAlDiaEnPantalla(d2.raiz, null);
  assert.equal(d2.viejaTira.quitado, true);
  assert.ok(!d2.hechos.some((h) => h[0] === 'meter'));
  assert.ok(d2.hechos.some((h) => h[0] === 'quitar' && h[1] === 'bandeja-cuatro'));
  const app = readFileSync(new URL('../carta/app.js', import.meta.url), 'utf8');
  assert.match(app, /function repintarBandejaEnFormulario\(\) \{[^]*?ponerAlDiaEnPantalla\(raiz, vistaBandeja\(\)\);/, 'cada cambio de un campo lo pone al día');
});

test('completa es lo que de verdad falta: lo que tiene defecto no falta («comprometer P» recién puesto entra), y el archivo elegido ya completa su entrada', async () => {
  const { formulario } = await import('../carta/carta.js');
  const { valoresDeArchivo } = await import('../carta/archivos.js');
  const { queFaltan, estaCompleta } = await import('../carta/bandeja-pantalla.js');
  const { eje, X, a, b } = await escena();
  const todas = a.laterales.flatMap((n) => [...(n.acciones?.nombradas ?? []), ...(n.acciones?.resto ?? [])].map((x) => ({ ...x, pv: n.pv })));
  const por = (nombre) => todas.find((x) => x.nombre === nombre);
  const campos = (accion) => formulario(eje, X, accion.id, 'huesped', {}, { idioma: 'es' }).campos;
  // «comprometer P»: todo lo que pide tiene defecto.
  const P = por('comprometer P');
  assert.ok(P, 'el ejemplo lo ofrece');
  assert.ok(campos(P).some((c) => c.requerido), 'pide cosas');
  assert.deepEqual(queFaltan(campos(P)), [], 'pero todas con defecto');
  assert.equal(estaCompleta({}, queFaltan(campos(P))), true);
  b.poner({ accion: P.id, X, valores: {}, donde: { X, pv: P.pv }, completa: estaCompleta({}, queFaltan(campos(P))) });
  const probado = await b.probar(eje, 'huesped', { idioma: 'es' });
  assert.notEqual(probado.items[0].motivos[0]?.mensaje, 'falta por rellenar', 'no dice «falta por rellenar»');
  // «comprometer tiempo»: falta «hasta» hasta que se escribe; lo escrito con fallos de lectura no está completo.
  const T = por('comprometer tiempo');
  assert.deepEqual(queFaltan(campos(T)), ['until']);
  assert.equal(estaCompleta({}, ['until']), false);
  assert.equal(estaCompleta({ until: '' }, ['until']), false);
  assert.equal(estaCompleta({ until: '2026-12-01T10:00' }, ['until']), true);
  assert.equal(estaCompleta({ until: 'x' }, ['until'], [{ mensaje: 'no es una fecha' }]), false);
  // «adjuntar un archivo»: con el archivo elegido (su referencia y su formato) ya está completa, sin tocar otro campo.
  const adj = por('adjuntar un archivo');
  const faltan = queFaltan(campos(adj));
  assert.deepEqual(faltan.sort(), ['file', 'format']);
  const p = { id: 'a'.repeat(64), tipo: 'image/svg+xml', bytes: new Uint8Array(4), referencia: 'archivo:' + 'a'.repeat(64) };
  const valores = valoresDeArchivo(p, campos(adj).filter((c) => c.archivo).map((c) => ({ nombre: c.nombre, archivo: c.archivo })), { eje });
  assert.equal(estaCompleta(valores, faltan), true);
  const app = readFileSync(new URL('../carta/app.js', import.meta.url), 'utf8');
  assert.match(app, /const completa = estaCompleta\(f\.valores, f\.faltaban, motivos\);/);
  assert.equal((app.match(/faltaban = queFaltan\(/g) ?? []).length, 2, 'al lanzar y al reabrir, con el formulario sin nada escrito');
});

test('el motivo del último intento de ejecutar se va en cuanto cambia el borrador (quitar el miembro que fallaba)', async () => {
  const { motivosDelUltimoIntento } = await import('../carta/bandeja-pantalla.js');
  const motivos = [{ mensaje: 'no se ha registrado nada: el archivo no está' }];
  assert.deepEqual(motivosDelUltimoIntento({ motivos, de: '{"v":1,"a":1}' }, '{"v":1,"a":1}'), motivos, 'mismo borrador: sigue');
  assert.deepEqual(motivosDelUltimoIntento({ motivos, de: '{"v":1,"a":1}' }, '{"v":1}'), [], 'otro borrador: viejo');
  assert.deepEqual(motivosDelUltimoIntento({ motivos, de: null }, '{}'), []);
  // Con la bandeja de verdad: quitar la entrada cambia lo guardado, y el 4 ya no lo enseña.
  const almacen = memoria();
  const b = crearBandeja({ almacen, libro: 'g'.repeat(64), cuenta: 'yo' });
  b.poner({ accion: 'a1', X: 'x'.repeat(64), valores: {} });
  b.poner({ accion: 'a2', X: 'x'.repeat(64), valores: {}, donde: { X: null, pv: 4 } });
  const de = almacen.leer(b.clave);
  b.quitar('b2');
  const v = vistaDeLaBandeja({ ok: true, items: [item('b1')], motivos: [] }, {}, { motivos: motivosDelUltimoIntento({ motivos, de }, almacen.leer(b.clave)) });
  assert.ok(!htmlBandejaDelCuatro(v, 'X1').includes('el archivo no está'));
  const app = readFileSync(new URL('../carta/app.js', import.meta.url), 'utf8');
  assert.match(app, /estado\.bandeja\.motivosDe = borradorDeAhora\(\);/);
  assert.match(app, /motivosDelUltimoIntento\(\{ motivos: estado\.bandeja\.motivos, de: estado\.bandeja\.motivosDe \?\? null \}, borradorDeAhora\(\)\)/);
});

test('un archivo elegido aquí sin servidor donde subirlo: la prueba en seco ya dice que no entra, en llano, antes de ejecutar', async () => {
  const { faltaParaLosArchivos } = await import('../carta/archivos.js');
  const ref = 'archivo:' + 'b'.repeat(64);
  const elegidos = new Set([ref]);
  assert.equal(faltaParaLosArchivos({ file: ref }, { elegidos, hayServidor: false }), t('archivoSinServidor'));
  assert.equal(faltaParaLosArchivos({ file: ref }, { elegidos, hayServidor: true }), null);
  assert.equal(faltaParaLosArchivos({ file: 'archivo:' + 'c'.repeat(64) }, { elegidos, hayServidor: true }), t('bandejaArchivoNoEsta'), 'ni elegido aquí ni en esta pestaña');
  assert.equal(faltaParaLosArchivos({ file: 'archivo:' + 'c'.repeat(64) }, { listo: () => true }), null, 'ya bajado');
  assert.equal(faltaParaLosArchivos({ text: 'sin archivos' }), null);
  // Por la bandeja: la entrada con el archivo no entra y el 4 lo dice.
  const { eje, X, a, b } = await escena();
  const adj = a.laterales.flatMap((n) => [...(n.acciones?.nombradas ?? []), ...(n.acciones?.resto ?? [])]).find((x) => x.nombre === 'adjuntar un archivo');
  b.poner({ accion: adj.id, X, valores: { file: ref, format: 'svg' }, donde: { X, pv: 2 } });
  const revisar = (e) => faltaParaLosArchivos(e.valores, { elegidos, hayServidor: false });
  const probado = await b.probar(eje, 'huesped', { idioma: 'es', revisar });
  assert.equal(probado.items[0].entra, false);
  assert.equal(probado.items[0].motivos[0].mensaje, t('archivoSinServidor'));
  const v = vistaDeLaBandeja(probado);
  assert.ok(htmlBandejaDelCuatro(v, X).includes(escaparTexto(t('archivoSinServidor'))) && htmlBandejaDelCuatro(v, X).includes('data-no-lanza'));
  const app = readFileSync(new URL('../carta/app.js', import.meta.url), 'utf8');
  assert.match(app, /const revisar = \(entrada\) => faltaParaLosArchivos\(entrada\.valores, \{[^]*?hayServidor: Boolean\(destinoDeArchivos\(\)\)/);
});
const escaparTexto = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

test('en una fila cerrada (Sequenced), la marca de la bandeja va dentro de la cabecera, en su misma línea', async () => {
  const { eje, X, b } = await escena();
  const a = await arbol({ foco: { X, pv: 0 } }, eje, 'huesped', { ancho: 400, alto: 700 });
  assert.ok(a.secuencia, 'el móvil, en Sequenced');
  const fila = a.secuencia.filas.find((f) => !f.hilo && !f.abierta && f.acciones?.total);
  const accion = [...fila.acciones.nombradas, ...fila.acciones.resto][0];
  b.poner({ accion: accion.id, X, valores: {}, donde: { X, pv: fila.pv }, completa: false });
  const v = vistaDeLaBandeja(await b.probar(eje, 'huesped'));
  const h = html(a, { bandeja: v });
  const i = h.indexOf(`class="pv-acciones marca" data-nodo="acciones" data-pv-acciones="${fila.pv}"`);
  assert.ok(i >= 0, 'la cabecera comprimida de la fila');
  const span = h.slice(i, h.indexOf('</span>', h.indexOf('pv-acciones-cuantas', i)) + 7);
  assert.match(span, new RegExp(`<small class="bandeja-marca" data-bandeja-marca="${fila.pv}"`), 'dentro del span');
  assert.ok(!h.slice(i + span.length, i + span.length + 40).includes('bandeja-marca'), 'no detrás, en línea propia');
});

test('en el escritorio la cuenta va en el marco, fuera de la escena donde están los rosetones; con la configuración o cualquier diálogo abierto no se pinta', async () => {
  const css = readFileSync(new URL('../carta/estilo.css', import.meta.url), 'utf8');
  const fijas = [...css.matchAll(/([^{}]*\.bandeja-cuenta[^{}]*)\{([^}]*)\}/g)].filter((m) => /position:fixed/.test(m[2])).map((m) => m[1].replace(/\/\*[^]*?\*\//g, '').trim());
  assert.deepEqual(fijas, ['.carta-matriz>.bandeja-cuenta', '.carta-apilada>.bandeja-cuenta'], 'fija en los dos: en el escritorio no empuja el marco');
  // En el escritorio, en el anillo de 30 px de la escena (el de los rosetones), abajo a la derecha, entre el 5 y el 4.
  const matriz = css.slice(css.indexOf('.carta-matriz>.bandeja-cuenta{'), css.indexOf('}', css.indexOf('.carta-matriz>.bandeja-cuenta{')));
  assert.match(matriz, /height:26px/, 'cabe en el anillo de 30 px');
  assert.ok(matriz.includes('bottom:calc(var(--emparejar-alto,0px) + 9px)'), 'dentro del anillo: la escena deja 8 px abajo');
  assert.ok(matriz.includes('right:48px'), 'a la izquierda del rosetón de la esquina (12 + 28 + 8)');
  assert.ok(matriz.includes('max-width:calc(50vw - 120px)'), 'a la derecha del rosetón del 5');
  assert.ok(matriz.includes('text-overflow:ellipsis'));
  assert.ok(css.includes('.mapa-celdas{position:absolute;inset:30px}'), 'si cambia el anillo, cambia el sitio de la cuenta');
  assert.ok(css.includes('.carta-matriz .escena{flex:1 1 auto;min-height:0;margin:6px 0 8px;'), 'ni si cambia el margen de abajo de la escena');
  const oculta = css.match(/\.carta:has\(([^)]*)\)>\.bandeja-cuenta\{display:none\}/);
  assert.ok(oculta, 'se esconde con un diálogo abierto');
  for (const fondo of ['.formulario-fondo', '.aro-fondo', '.sitio-fondo', '.puente-fondo', '.core-fondo', '.roseton-pantalla']) assert.ok(oculta[1].split(',').includes(fondo), fondo);
  const dom = readFileSync(new URL('../carta/dom.js', import.meta.url), 'utf8');
  assert.match(dom, /export function htmlConfiguracion[^]*?<div class="formulario-fondo" data-cerrar><form class="formulario configuracion"/, 'la configuración es un formulario-fondo');
  // En Mapped: la cuenta antes de la escena; los rosetones, dentro de ella.
  const { eje, X, b } = await escena();
  b.poner({ accion: 'x', X, valores: {} });
  const v = vistaDeLaBandeja({ ok: false, items: [item('b1', { X })], motivos: [] });
  const h = html(await arbol({ foco: { X, pv: 0 } }, eje, 'huesped', PC), { bandeja: v });
  assert.ok(h.indexOf('data-bandeja-ir') > 0 && h.indexOf('data-bandeja-ir') < h.indexOf('<div class="escena">'));
  assert.ok(h.indexOf('rosetones-mapa') > h.indexOf('<div class="escena">'), 'los rosetones del escritorio, dentro de la escena');
});

test('la app ya no escribe con escribirDesde: preferencias, ajustes de la guía y de fuera y formato van por escribirPorLaBandeja; un registro se nombra en llano', () => {
  const app = readFileSync(new URL('../carta/app.js', import.meta.url), 'utf8');
  assert.doesNotMatch(app, /escribirDesde\(/);
  assert.equal((app.match(/escribirPorLaBandeja\(estado\.eje, estado\.identidad, firmarCon\(estado\.identidad\)/g) ?? []).length, 4, 'preferencias, guía, fuera y formato');
  const reg = { ...item('b1'), accion: null, entrada: { id: 'b1', tipo: 'registro', modo: 'sequenced', en: '9000000000', accion: null, X: 'X1', valores: { payload: [['x']] }, donde: { X: 'X1', pv: 9 }, completa: true, de: [] } };
  const v = vistaDeLaBandeja({ ok: true, items: [reg], motivos: [] }, { nombre: () => 'NO' });
  assert.equal(v.items[0].nombre, t('bandejaRegistro'));
  assert.ok(!htmlTiraDeLaBandeja(v, 'X1', 9).includes('data-bandeja-abrir'), 'no tiene formulario que reabrir');
});

test('cada tipo de entrada dice su nombre (nunca «null»): en la vista y en el mensaje de lo registrado', async () => {
  const { nombreDeLaEntrada } = await import('../carta/bandeja-pantalla.js');
  const { direccion } = await import('../src/btml.js');

  const { eje, X, deLa } = await escena();
  const nombre = (a) => 'N:' + a;
  assert.equal(nombreDeLaEntrada({ tipo: 'campo', valores: { texto: 'hola' } }, null, nombre), t('bandejaCampo', { texto: 'hola' }));
  assert.equal(nombreDeLaEntrada({ tipo: 'registro', valores: { payload: [] } }, null, nombre), t('bandejaRegistro'));
  assert.equal(nombreDeLaEntrada({ accion: 'a1' }, 'a1', nombre), 'N:a1');
  assert.equal(nombreDeLaEntrada(null, 'reserva', nombre), 'N:reserva', 'lo que pone la bandeja: su acción');
  assert.ok(!String(nombreDeLaEntrada({}, null, nombre)).includes('null'));
  // Una tanda de verdad con una acción y un campo: los nombres del mensaje.
  const b = crearBandeja({ almacen: memoria(), libro: eje.genesisId, cuenta: 'huesped' });
  const P = deLa(2).nombradas.find((x) => x.nombre === 'comprometer P');
  b.poner({ accion: P.id, X, valores: {}, donde: { X, pv: 2 } });
  b.poner({ tipo: 'campo', en: direccion([6]), X, valores: { texto: 'una nota' }, donde: { X, pv: 6 } });
  const r = await b.ejecutar(eje, 'huesped', (ev) => ev);
  assert.equal(r.ok, true, JSON.stringify(r.motivos));
  const nombres = r.items.map((x) => nombreDeLaEntrada(x.puesta ? null : x.entrada, x.accion, nombre));
  assert.deepEqual(nombres, ['N:' + r.items[0].accion, t('bandejaCampo', { texto: 'una nota' })]);
  assert.ok(nombres.every((n) => !n.includes('null')));
  const app = readFileSync(new URL('../carta/app.js', import.meta.url), 'utf8');
  assert.match(app, /t\('registrado', \{ accion: nombreDeLaEntrada\(x\.puesta \? null : x\.entrada, x\.accion, nombreDeAccion\)/);
});

test('la marca de una fila cerrada no se parte a 400 px: solo la cifra en corto, sin saltos, y el texto entero en su título', () => {
  const v = vistaDeLaBandeja({ ok: true, items: [item('b1', { pv: 4 })], motivos: [] });
  const m = htmlMarcaDeLaBandeja(v, 'X1', 4);
  assert.match(m, new RegExp(`>${t('bandejaMarcaCorta', { n: 1 })}</small>$`), 'a la vista, «✎1»');
  assert.ok(m.includes(`title="${t('bandejaMarcaTitulo', { n: 1 })}"`) && m.includes(`aria-label="${t('bandejaMarca', { n: 1 })}"`));
  assert.ok(!/\s/.test(t('bandejaMarcaCorta', { n: 12 })), 'sin espacios por donde partir');
  const css = readFileSync(new URL('../carta/estilo.css', import.meta.url), 'utf8');
  const regla = css.slice(css.indexOf('.bandeja-marca{'), css.indexOf('}', css.indexOf('.bandeja-marca{')));
  assert.match(regla, /white-space:nowrap/);
  assert.match(regla, /flex:0 0 auto/);
});

test('en el 4 la bandeja no se come la matriz: un tercio de su caja como mucho y la lista se desplaza dentro (1366×768, tres borradores o más)', async () => {
  const css = readFileSync(new URL('../carta/estilo.css', import.meta.url), 'utf8');
  const regla = (sel) => { const i = css.indexOf(sel + '{'); assert.ok(i >= 0, 'falta ' + sel); return css.slice(i, css.indexOf('}', i)); };
  const caja = regla('.bandeja-cuatro');
  assert.match(caja, /max-height:33%/);
  assert.match(caja, /min-height:0/);
  assert.match(caja, /overflow:hidden/);
  assert.match(regla('.bandeja-cuatro>.bandeja-lista'), /overflow:auto/);
  assert.match(regla('.bandeja-cuatro>h3,.bandeja-cuatro>small,.bandeja-cuatro>footer,.bandeja-cuatro>.motivos'), /flex:0 0 auto/, 'la cabecera y el botón, siempre a la vista');
  // El HTML: la lista es hija directa de la caja (lo que se desplaza) y el botón va fuera de ella.
  const v = vistaDeLaBandeja({ ok: true, items: [item('b1'), item('b2'), item('b3'), item('b4')], motivos: [] });
  const h = htmlBandejaDelCuatro(v, 'X1');
  assert.match(h, /^<section class="bandeja-cuatro"[^>]*><h3>[^<]*<\/h3><ol class="bandeja-lista">/);
  assert.ok(h.indexOf('data-bandeja-ejecutar') > h.indexOf('</ol>'));
});
