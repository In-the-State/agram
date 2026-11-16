// Retocar un texto en su sitio, en la carta (A20 escalón 1, VG 17-11; docs/notas/RETOQUES.md «Para la carta»): el modo
// «retocar textos» de la configuración (solo para quien puede retocar en este libro), los textos marcados con su clave
// (contrato.conClaves), la hoja del retoque (guardar por el mismo camino que cualquier acción, volver al original, los
// huecos), la lista «Textos retocados» y que, apagado, el HTML de la carta es el de siempre. Sin navegador: ejes en
// memoria, identidades inventadas, sin claves de verdad.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Eje } from '../src/eje.js';
import * as A from '../src/acciones.js';
import * as C from '../src/contrato.js';
import { arbol, preferencias, guardarRetoque, comprobarRetoque, retoqueDeTexto, textosRetocados, textoDeNacimiento } from '../carta/carta.js';
import { html, htmlConfiguracion, htmlRetoque } from '../carta/dom.js';
import { instalar } from '../carta/gestos.js';
import { t, usarRetoques } from '../carta/textos.js';

const T0 = '2026-11-16T08:00:00Z';
const T = (s) => new Date(Date.parse(T0) + s * 1000).toISOString().replace('.000Z', 'Z');
const GRANDE = { ancho: 1920, alto: 1080 };
const ES = { idioma: 'es' };
const RETOCAR = 'retouch a text';
const ETIQUETA_CLAVE = 'template retouch a text param key label';

/** Ana, dueña del libro (autora del génesis); bea, invitada por ana. */
async function mundo() {
  const eje = await Eje.genesis({ identidad: 'ana', foco: ['ana'], t: T0, demostracion: true });
  const inv = await eje.invitar({ autor: 'ana', invitado: 'bea', t: T(1) });
  await eje.aceptar(inv, {}, { t: T(2) });
  return eje;
}

/** El formulario de «retouch a text» sobre el génesis, con el aro abierto debajo, para `yo`, con o sin el modo. */
const estadoDe = (eje, extra = {}) => ({ foco: { X: eje.genesisId, pv: 0 }, aro: { X: eje.genesisId }, formulario: { X: eje.genesisId, accion: RETOCAR, valores: {} }, ...extra });
const pintar = async (eje, yo, extra = {}) => html(await arbol(estadoDe(eje, extra), eje, yo, GRANDE, ES), {});
const marcas = (h) => [...h.matchAll(/data-retocar="([^"]*)" data-retocar-idioma="([^"]*)"/g)].map((m) => [m[1], m[2]]);
/** El HTML sin las marcas del modo: el texto que envuelven, tal cual. */
const sinMarcas = (h) => h.replace(/<span class="retocable" data-retocar="[^"]*" data-retocar-idioma="[^"]*">([^<]*)<\/span>/g, '$1');

test('carta-retoques: el modo no existe para quien no es dueño: ni marcas, ni interruptor, ni lista, ni hoja', async () => {
  const eje = await mundo();
  assert.deepEqual([C.puedeRetocar(eje, 'ana'), C.puedeRetocar(eje, 'bea')], [true, false]);
  const a = await arbol(estadoDe(eje, { retocar: true, retoque: { clave: 'template pay', idioma: 'es' } }), eje, 'bea', GRANDE, ES);
  assert.equal(a.retocar, undefined);
  assert.equal(a.retoque, undefined);
  const h = html(a, {});
  assert.doesNotMatch(h, /data-retocar|retocable|data-retoque/);
  assert.equal(h, await pintar(eje, 'bea'), 'para bea, con o sin el modo, la misma carta');
  assert.equal(textosRetocados(eje, 'bea'), null);
  assert.equal(retoqueDeTexto(eje, 'bea', { clave: 'template pay', idioma: 'es' }, ES), null);
  const p = preferencias(eje, 'bea');
  assert.doesNotMatch(htmlConfiguracion(p, { retocar: undefined }), /data-retocar-modo|Textos retocados/);
  // A ana sí se le ofrece: el interruptor llano y la lista (vacía, lo dice).
  const r = textosRetocados(eje, 'ana');
  const conf = htmlConfiguracion(preferencias(eje, 'ana'), { retocar: { ...r, activo: false, idioma: 'es' } });
  assert.match(conf, /<input type="checkbox" data-retocar-modo> Retocar los textos de este libro/);
  assert.match(conf, /No hay ningún texto retocado en este libro\./);
  assert.match(htmlConfiguracion(preferencias(eje, 'ana'), { retocar: { ...r, activo: true, idioma: 'es' } }), /data-retocar-modo checked/);
  // En la parte 9 no va.
  assert.doesNotMatch(htmlConfiguracion(preferencias(eje, 'ana'), { parte: '9', retocar: { ...r, activo: true, idioma: 'es' } }), /data-retocar-modo/);
  // Un retoque escrito a mano por bea no pasa la regla (la plantilla no se le ofrece, y comprobarRetoque lo dice).
  assert.equal(comprobarRetoque(eje, 'bea', { clave: 'template pay', idioma: 'es', texto: 'abonar' }, ES), t('retoqueNoPuede'));
  const b = await guardarRetoque(eje, 'bea', { clave: 'template pay', idioma: 'es', texto: 'abonar' }, undefined, { t: T(5) });
  assert.equal(b.asentado, null);
});

test('carta-retoques: encendido, el formulario de una acción y el aro marcan cada texto con la clave con que se leyó; tocarlo abre su retoque y no hace lo suyo', async () => {
  const eje = await mundo();
  const a = await arbol(estadoDe(eje, { retocar: true }), eje, 'ana', GRANDE, ES);
  assert.deepEqual(a.retocar, { idioma: 'es' });
  const h = html(a, {});
  const claves = marcas(h).map(([c]) => c);
  // El nombre de la acción (en el aro y en la cabeza del formulario), las etiquetas y ayudas de sus parámetros, y textos propios de la carta.
  for (const clave of ['template retouch a text', ETIQUETA_CLAVE, 'template retouch a text param key help', 'template retouch a text param text label', 'carta lanzar', 'carta masParametros', 'carta reversoTitulo']) {
    assert.ok(claves.includes(clave), 'marcado: ' + clave);
  }
  assert.ok(marcas(h).every(([, idioma]) => idioma === 'es'), 'en el idioma de quien mira');
  assert.match(h, /<h2><span class="retocable" data-retocar="template retouch a text" data-retocar-idioma="es">retocar un texto<\/span><\/h2>/);
  assert.match(h, /<label for="param-key"><span class="retocable" data-retocar="template retouch a text param key label" data-retocar-idioma="es">clave<\/span>/);
  assert.match(h, /<button type="submit"><span class="retocable" data-retocar="carta lanzar" data-retocar-idioma="es">lanzar<\/span><\/button>/);
  // El aro: los nombres de las acciones donde se ofrecen.
  assert.match(h, /data-lanzar="[^"]+" data-x="[^"]+"[^>]*>.*?<span class="nombre"><span class="retocable" data-retocar="template [^"]+"/s);
  // Sin iconos por texto: solo el subrayado (la clase) y los data-*.
  assert.doesNotMatch(h, /retocable[^>]*><(img|svg|i)\b/);
  // Los motivos de un rechazo: la regla es su clave.
  const motivo = { regla: 'only the owner of the book retouches a text', mensaje: 'no' };
  const conMotivo = html(await arbol(estadoDe(eje, { retocar: true, formulario: { X: eje.genesisId, accion: RETOCAR, valores: {}, motivos: [motivo] } }), eje, 'ana', GRANDE, ES), {});
  assert.match(conMotivo, /<li><span class="retocable" data-retocar="only the owner of the book retouches a text" data-retocar-idioma="es">no<\/span><\/li>/);

  // Los gestos: tocar un texto marcado (aunque esté en un botón que lanza) abre su retoque y no lanza.
  const oyentes = [];
  const documento = { defaultView: { innerWidth: 1366, innerHeight: 768 }, addEventListener: (x, f) => oyentes.push([x, f]), removeEventListener() {} };
  const raiz = { ownerDocument: documento, addEventListener: (x, f) => oyentes.push([x, f]), removeEventListener() {}, querySelector: () => null };
  const llamadas = [];
  instalar(raiz, new Proxy({}, { get: (_, nombre) => (...args) => { llamadas.push([nombre, ...args]); } }));
  const disparar = (tipo, e) => { for (const [x, f] of oyentes) if (x === tipo) f(e); };
  const marcado = { dataset: { retocar: 'template pay', retocarIdioma: 'es' } };
  const lanzar = { dataset: { x: 'X1', lanzar: 'A1' } };
  let prevenido = 0;
  disparar('click', { target: { closest: (sel) => (sel.includes('[data-retocar]') ? marcado : sel.includes('[data-lanzar]') ? lanzar : null) }, preventDefault: () => { prevenido++; } });
  assert.deepEqual(llamadas, [['retocarTexto', 'template pay', 'es']]);
  assert.equal(prevenido, 1);
  // Y la hoja: guardar (submit), volver al original (botón), el idioma y el interruptor (change).
  llamadas.length = 0;
  const hoja = { matches: (sel) => sel === '[data-retoque]' };
  disparar('submit', { target: hoja, preventDefault() {} });
  disparar('click', { target: { closest: (sel) => (sel.includes('[data-retoque-original]') ? { dataset: { clave: 'template pay', idioma: 'es' } } : null) }, preventDefault() {} });
  disparar('change', { target: { matches: (sel) => sel === '[data-retoque-idioma]', value: 'en' } });
  disparar('change', { target: { matches: (sel) => sel === '[data-retocar-modo]', checked: true } });
  assert.deepEqual(llamadas, [['guardarRetoque', hoja], ['retoqueOriginal', 'template pay', 'es'], ['retoqueIdioma', 'en'], ['modoRetocar', true]]);
});

test('carta-retoques: guardar escribe un «retouch a text» con el idioma, la clave y el texto en su sitio, con su coste a la vista, y el texto nuevo se lee después', async () => {
  const eje = await mundo();
  // La hoja: el texto de hoy, el de nacimiento, los idiomas del libro y lo que cuesta.
  const hoja = retoqueDeTexto(eje, 'ana', { clave: ETIQUETA_CLAVE, idioma: 'es' }, ES);
  assert.deepEqual([hoja.hoy, hoja.texto, hoja.nacimiento, hoja.vigente, hoja.existe], ['clave', 'clave', 'clave', null, true]);
  assert.ok(hoja.idiomas.includes('es') && hoja.idiomas.includes('en'));
  assert.ok(hoja.coste && hoja.coste.exigido > 0, 'su coste en T');
  const hh = htmlRetoque(hoja);
  assert.match(hh, /<textarea id="retoque-texto" data-retoque-texto[^>]*>clave<\/textarea>/);
  assert.match(hh, /<option value="es" selected>es<\/option>/);
  assert.match(hh, /class="retoque-nacimiento"><small>texto de nacimiento:<\/small> <span>clave<\/span>/);
  assert.match(hh, /cuesta [^<]+ de T/);
  assert.doesNotMatch(hh, /data-retoque-original/, 'sin retoque, no hay original al que volver');

  const antes = eje.orden.length;
  const r = await guardarRetoque(eje, 'ana', { clave: ETIQUETA_CLAVE, idioma: 'es', texto: 'qué texto' }, undefined, { t: T(10) });
  assert.equal(r.aviso, null);
  assert.ok(r.asentado, JSON.stringify(r.motivos));
  assert.equal(eje.orden.length, antes + 1);
  const ev = eje.obtener(r.asentado.id);
  assert.deepEqual([ev.autor, ev.sobre, ev.en], ['ana', eje.genesisId, '9400000000'], 'sobre el génesis, en su 9.4');
  assert.deepEqual(ev.payload[1], [['es'], [ETIQUETA_CLAVE], ['qué texto']]);
  assert.ok(ev.payload[4].includes(RETOCAR));
  assert.ok((ev.movimientos ?? []).length > 0, 'pagado con T, como cualquier acción');
  assert.equal(C.texto(eje, ETIQUETA_CLAVE, 'es'), 'qué texto');
  // En pantalla, al repintar (sin recargar): en el formulario, con y sin el modo.
  assert.match(await pintar(eje, 'ana'), /<label for="param-key">qué texto/);
  assert.match(await pintar(eje, 'ana', { retocar: true }), /data-retocar="template retouch a text param key label" data-retocar-idioma="es">qué texto<\/span>/);
  // La hoja de nuevo: el de hoy es el retocado, el de nacimiento sigue, y ya hay original al que volver.
  const otra = retoqueDeTexto(eje, 'ana', { clave: ETIQUETA_CLAVE, idioma: 'es' }, ES);
  assert.deepEqual([otra.hoy, otra.nacimiento, otra.vigente.texto, otra.vigente.id], ['qué texto', 'clave', 'qué texto', ev.id]);
  assert.match(htmlRetoque(otra), /data-retoque-original data-clave="template retouch a text param key label" data-idioma="es"/);
  // El mismo texto otra vez: nada que guardar.
  assert.equal((await guardarRetoque(eje, 'ana', { clave: ETIQUETA_CLAVE, idioma: 'es', texto: 'qué texto' }, undefined, { t: T(11) })).aviso, t('retoqueIgual'));

  // Un texto propio de la carta («carta <clave>»): t lo lee en cuanto se pinta el libro.
  const carta = await guardarRetoque(eje, 'ana', { clave: 'carta lanzar', idioma: 'es', texto: 'enviar ya' }, undefined, { t: T(12) });
  assert.ok(carta.asentado, JSON.stringify(carta));
  assert.deepEqual(eje.obtener(carta.asentado.id).payload[1], [['es'], ['carta lanzar'], ['enviar ya']]);
  assert.match(await pintar(eje, 'ana'), /<button type="submit">enviar ya<\/button>/);
  assert.equal(t('lanzar'), 'enviar ya');
  // Otro libro, la misma época: no lo ve.
  const otroLibro = await mundo();
  assert.match(await pintar(otroLibro, 'ana'), /<button type="submit">lanzar<\/button>/);
  assert.equal(t('lanzar'), 'lanzar');
  usarRetoques(null);
  // Un texto que empieza por «=» sería una fórmula: se escribe escapado («==») y se lee tal cual.
  const igual = await guardarRetoque(eje, 'ana', { clave: 'template retouch a text param text label', idioma: 'es', texto: '=texto' }, undefined, { t: T(13) });
  assert.deepEqual(eje.obtener(igual.asentado.id).payload[1][2], ['==texto']);
  assert.equal(C.texto(eje, 'template retouch a text param text label', 'es'), '=texto');
});

test('carta-retoques: un texto con los huecos cambiados no se guarda y avisa; los de la carta, tampoco, ni con signos de marcado', async () => {
  const eje = await mundo();
  const clave = 'template pay message';
  const nacimiento = textoDeNacimiento(clave, 'es', ES);
  assert.equal(nacimiento, C.texto(null, clave, 'es'));
  assert.match(nacimiento, /\{me\}/);
  const hoja = retoqueDeTexto(eje, 'ana', { clave, idioma: 'es' }, ES);
  assert.ok(hoja.huecos.includes('{me}'));
  assert.match(htmlRetoque(hoja), /class="ayuda retoque-huecos">Lo que va entre llaves se rellena solo: déjalo tal cual \(\{me\}/);
  const antes = eje.orden.length;
  const r = await guardarRetoque(eje, 'ana', { clave, idioma: 'es', texto: '{me} paga {first ev.3}' }, undefined, { t: T(10) });
  assert.equal(r.asentado, null);
  assert.equal(r.aviso, t('retoqueHuecoNuevo', { huecos: '{first ev.3}' }));
  assert.equal(eje.orden.length, antes, 'no se escribe nada');
  // Quitar un hueco sí vale (subconjunto), como en el núcleo.
  const bien = await guardarRetoque(eje, 'ana', { clave, idioma: 'es', texto: '{me} abona' }, undefined, { t: T(11) });
  assert.ok(bien.asentado);
  assert.equal(C.texto(eje, clave, 'es'), '{me} abona');
  // Un idioma nuevo: con el original (el 9 de la plantilla).
  assert.equal(comprobarRetoque(eje, 'ana', { clave, idioma: 'fr', texto: '{me} paie {first ev.3}' }, ES), t('retoqueHuecoNuevo', { huecos: '{first ev.3}' }));
  assert.equal(comprobarRetoque(eje, 'ana', { clave, idioma: 'fr', texto: '{me} paie' }, ES), null);
  // Los de la carta los comprueba la carta: sus huecos, y nada de signos de marcado (muchos sitios ponen t() sin escapar).
  assert.equal(comprobarRetoque(eje, 'ana', { clave: 'carta registrado', idioma: 'es', texto: '{otro} hecho' }, ES), t('retoqueHuecoNuevo', { huecos: '{otro}' }));
  assert.equal(comprobarRetoque(eje, 'ana', { clave: 'carta registrado', idioma: 'es', texto: '{accion}: hecho' }, ES), null);
  assert.equal(comprobarRetoque(eje, 'ana', { clave: 'carta lanzar', idioma: 'es', texto: '<b>lanzar</b>' }, ES), t('retoqueSignos', { signos: '< >' }));
  // Y si uno así llega al libro por otro camino, la carta no lo usa.
  const aMano = await A.transaccion(eje, RETOCAR, { X: eje.genesisId, language: 'es', key: 'carta lanzar', text: '<b>x</b>' }, 'ana', { t: T(12) });
  await eje.anadir(aMano.evento);
  assert.match(await pintar(eje, 'ana'), /<button type="submit">lanzar<\/button>/);
  usarRetoques(null);
  // Vacío, o una clave que no existe: no se escribe y se avisa.
  assert.equal(comprobarRetoque(eje, 'ana', { clave: 'template pay', idioma: 'es', texto: '  ' }, ES), t('retoqueVacio'));
  assert.equal(comprobarRetoque(eje, 'ana', { clave: 'no such key', idioma: 'es', texto: 'x' }, ES), t('retoqueNoExiste'));
  assert.equal(comprobarRetoque(eje, 'ana', { clave: 'carta noExiste', idioma: 'es', texto: 'x' }, ES), t('retoqueNoExiste'));
  // La hoja con el aviso lo enseña.
  assert.match(htmlRetoque(retoqueDeTexto(eje, 'ana', { clave, idioma: 'es', texto: '{x}', aviso: r.aviso }, ES)), /<ul class="motivos" role="alert"><li>No se guarda: \{first ev.3\} no está/);
});

test('carta-retoques: «volver al texto original» retira (el registro sin texto) y vuelve el de nacimiento', async () => {
  const eje = await mundo();
  assert.equal(comprobarRetoque(eje, 'ana', { clave: ETIQUETA_CLAVE, idioma: 'es', texto: null }, ES), t('retoqueSinRetoque'));
  await guardarRetoque(eje, 'ana', { clave: ETIQUETA_CLAVE, idioma: 'es', texto: 'qué texto' }, undefined, { t: T(10) });
  const r = await guardarRetoque(eje, 'ana', { clave: ETIQUETA_CLAVE, idioma: 'es', texto: null }, undefined, { t: T(11) });
  assert.ok(r.asentado, JSON.stringify(r));
  assert.deepEqual(eje.obtener(r.asentado.id).payload[1], [['es'], [ETIQUETA_CLAVE]]);
  assert.equal(C.retoque(eje, ETIQUETA_CLAVE, 'es'), null);
  assert.equal(C.texto(eje, ETIQUETA_CLAVE, 'es'), 'clave');
  assert.match(await pintar(eje, 'ana'), /<label for="param-key">clave/);
  assert.deepEqual(textosRetocados(eje, 'ana').lista, []);
});

test('carta-retoques: un texto con «<» se enseña escapado, en la carta, en la hoja y en la lista', async () => {
  const eje = await mundo();
  const malo = '<img src=x onerror=alert(1)>';
  const r = await guardarRetoque(eje, 'ana', { clave: ETIQUETA_CLAVE, idioma: 'es', texto: malo }, undefined, { t: T(10) });
  assert.ok(r.asentado, JSON.stringify(r));
  assert.equal(C.texto(eje, ETIQUETA_CLAVE, 'es'), malo, 'el núcleo lo da tal cual');
  for (const h of [await pintar(eje, 'ana'), await pintar(eje, 'ana', { retocar: true }), htmlRetoque(retoqueDeTexto(eje, 'ana', { clave: ETIQUETA_CLAVE, idioma: 'es' }, ES)), htmlConfiguracion(preferencias(eje, 'ana'), { retocar: { ...textosRetocados(eje, 'ana'), activo: true, idioma: 'es' } })]) {
    assert.ok(h.includes('&lt;img src=x onerror=alert(1)&gt;'));
    assert.ok(!h.includes(malo), 'nunca como HTML');
  }
});

test('carta-retoques: la lista «Textos retocados» da los vigentes del libro, con clave, idioma, texto, quién y cuándo, y «volver al original» en cada uno', async () => {
  const eje = await mundo();
  await guardarRetoque(eje, 'ana', { clave: ETIQUETA_CLAVE, idioma: 'es', texto: 'qué texto' }, undefined, { t: T(10) });
  await guardarRetoque(eje, 'ana', { clave: 'carta lanzar', idioma: 'es', texto: 'enviar ya' }, undefined, { t: T(11) });
  await guardarRetoque(eje, 'ana', { clave: 'template pay', idioma: 'fr', texto: 'payer' }, undefined, { t: T(12) });
  await guardarRetoque(eje, 'ana', { clave: 'template pay', idioma: 'fr', texto: null }, undefined, { t: T(13) });
  const { lista } = textosRetocados(eje, 'ana', ES);
  assert.deepEqual(lista.map((x) => [x.idioma, x.clave, x.texto]), C.retoques(eje).map((x) => [x.idioma, x.clave, x.texto]));
  assert.deepEqual(lista.map((x) => x.clave), ['carta lanzar', ETIQUETA_CLAVE], 'lo retirado no está');
  assert.ok(lista.every((x) => typeof x.quien === 'string' && x.quien && typeof x.cuando === 'string' && x.cuando));
  const h = htmlConfiguracion(preferencias(eje, 'ana'), { retocar: { lista, activo: false, idioma: 'es' } });
  assert.match(h, /<legend>Textos retocados<\/legend>/);
  for (const x of lista) {
    assert.ok(h.includes(`<code>${x.clave}</code> · ${x.idioma}`), x.clave);
    assert.ok(h.includes(`<span class="retoque-texto">${x.texto}</span>`), x.texto);
    assert.ok(h.includes(`data-retoque-original data-clave="${x.clave}" data-idioma="${x.idioma}">volver al texto original</button>`), x.clave);
  }
  assert.doesNotMatch(h, /No hay ningún texto retocado/);
});

test('carta-retoques: con el modo apagado el HTML de la carta es el de antes; encendido, solo cambian las marcas', async () => {
  const eje = await mundo();
  await guardarRetoque(eje, 'ana', { clave: ETIQUETA_CLAVE, idioma: 'es', texto: 'qué texto' }, undefined, { t: T(10) });
  const sinModo = await pintar(eje, 'ana');
  assert.equal(await pintar(eje, 'ana', { retocar: false }), sinModo);
  assert.doesNotMatch(sinModo, /data-retocar|retocable/);
  const conModo = await pintar(eje, 'ana', { retocar: true });
  assert.notEqual(conModo, sinModo);
  assert.equal(sinMarcas(conModo), sinModo, 'quitadas las marcas, la misma carta');
  // La configuración, igual: apagado, sin marcas; encendido, solo las marcas (y el interruptor marcado).
  const p = preferencias(eje, 'ana');
  const r = textosRetocados(eje, 'ana');
  const apagada = htmlConfiguracion(p, { retocar: { ...r, activo: false, idioma: 'es' } });
  const encendida = htmlConfiguracion(p, { retocar: { ...r, activo: true, idioma: 'es' } });
  assert.doesNotMatch(apagada, /data-retocar=/);
  assert.equal(sinMarcas(encendida).replace(' data-retocar-modo checked', ' data-retocar-modo'), apagada);
  assert.deepEqual(marcas(encendida).map(([c]) => c), ['carta configuracionCriterios', 'carta configuracionAyuda2', 'carta guardar']);
  // Sin la lista de retocar (quien no puede), la configuración es la de siempre.
  assert.equal(htmlConfiguracion(p, {}), htmlConfiguracion(p, { retocar: null }));
});
