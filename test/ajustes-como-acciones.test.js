// La configuración como acciones (VG 18-11: «la pantalla de configuración pasa a ser acciones en su punto de vista; la
// del segundo factor se queda fija por ahora»; src/ajustes-ofrecidos.js, carta.js formularioDeAjustes): cada plantilla de
// ajustes de la época se ofrece a la vista en el 9 de mi alta, donde ancla su registro; su formulario es el de cualquier
// acción, rellenarlo compone un registro de ajustes en la bandeja y el 4 lo ejecuta. La hoja que abre el personaje del 0
// queda mínima: el segundo factor, lo del dispositivo, las reglas del libro y retocar los textos.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { arbol, formulario, preferencias } from '../carta/carta.js';
import { html, htmlConfiguracion } from '../carta/dom.js';
import { crearBandeja, ejecutarAhora } from '../carta/bandeja.js';
import { t } from '../carta/textos.js';
import * as contrato from '../src/contrato.js';
import * as acciones from '../src/acciones.js';
import { plantillasDeAjustes, plantillaDeAjustes, ajustesOfrecidos, entradaDeAjustes, ajustesDeLaEntrada, ajustesEditablesDe, PV_DE_LOS_AJUSTES, ANCLA_DE_LOS_AJUSTES } from '../src/ajustes-ofrecidos.js';
import { ejemploCompra } from '../ejemplos/ikisai/compra-food.mjs';

const PC = { ancho: 1920, alto: 1080 };
const ES = { idioma: 'es' };
const APP = readFileSync(new URL('../carta/app.js', import.meta.url), 'utf8');
const memoria = () => { const m = new Map(); return { leer: (k) => m.get(k) ?? null, guardar: (k, v) => (m.set(k, v), true) }; };

/** El ejemplo de la compra, el alta de la huésped y las plantillas de ajustes de su época, por nombre. */
async function escena() {
  const c = await ejemploCompra();
  const alta = c.eje.alta('huesped').id;
  const o = acciones.conEpoca(c.eje, {});
  const porNombre = Object.fromEntries(plantillasDeAjustes(o).map((p) => [p.nombre, p.id]));
  return { ...c, alta, o, porNombre };
}

test('el núcleo: las plantillas de ajustes son las que la época marca como tales, y se ofrecen solo sobre mi alta y en el 9', async () => {
  const { eje, alta, o, porNombre, compra } = await escena();
  const todas = plantillasDeAjustes(o);
  assert.ok(todas.length >= 2, 'la época trae varias');
  for (const p of todas) {
    assert.match(p.id, /^[0-9]{10}$/, 'su id es su dirección en la época');
    assert.ok(contrato.esDeAjustes(contrato.plantillas(null, o).find((x) => x.nombre === p.nombre).registro));
    assert.deepEqual(plantillaDeAjustes(p.id, o), p);
    assert.deepEqual(plantillaDeAjustes(p.nombre, o), p);
  }
  assert.ok(porNombre.preferences, 'las preferencias están');
  const ofrecidas = ajustesOfrecidos(eje, alta, PV_DE_LOS_AJUSTES, 'huesped', { ...o, ...ES });
  assert.deepEqual(ofrecidas.map((p) => p.id), todas.map((p) => p.id));
  assert.equal(ofrecidas.find((p) => p.nombre === 'preferences').etiqueta, 'preferencias');
  assert.deepEqual(ajustesOfrecidos(eje, alta, 2, 'huesped', o), [], 'en otro punto de vista, no');
  assert.deepEqual(ajustesOfrecidos(eje, compra.id, PV_DE_LOS_AJUSTES, 'huesped', o), [], 'sobre otro registro, no');
  assert.deepEqual(ajustesOfrecidos(eje, eje.alta('cocina').id, PV_DE_LOS_AJUSTES, 'huesped', o), [], 'sobre el alta de otro, no');
  assert.equal(plantillaDeAjustes('second factor', o), null, 'una plantilla de transacción no es de ajustes');
});

test('el 9 de mi alta ofrece a la vista las acciones de configuración, detrás de las de la época, y su botón lanza como cualquier otro', async () => {
  const { eje, alta, porNombre } = await escena();
  const a = await arbol({ foco: { X: alta, pv: 0 }, niveles: { 9: 3 } }, eje, 'huesped', PC, ES);
  const nueve = a.laterales.find((n) => n.pv === 9).acciones;
  const ids = [...nueve.nombradas, ...nueve.resto].map((x) => x.id);
  for (const id of Object.values(porNombre)) assert.ok(ids.includes(id), 'el 9 ofrece ' + id);
  assert.ok(ids.indexOf(porNombre.preferences) > 0, 'detrás de las de la época');
  const h = html(a);
  assert.match(h, new RegExp(`data-lanzar="${porNombre.preferences}" data-x="${alta}"[^>]*>preferencias<`));
  // en otro punto de vista de mi alta, no
  const dos = await arbol({ foco: { X: alta, pv: 0 }, niveles: { 2: 3 } }, eje, 'huesped', PC, ES);
  const deDos = dos.laterales.find((n) => n.pv === 2).acciones;
  assert.ok(![...(deDos?.nombradas ?? []), ...(deDos?.resto ?? [])].some((x) => Object.values(porNombre).includes(x.id)));
});

test('el formulario de una plantilla de ajustes tiene la forma del de una acción: cada ajuste con su valor actual, a la vista, y sus valores si es una enumeración', async () => {
  const { eje, alta, porNombre } = await escena();
  const f = formulario(eje, alta, porNombre.preferences, 'huesped', {}, ES);
  assert.equal(f.accion, porNombre.preferences);
  assert.equal(f.pv, PV_DE_LOS_AJUSTES);
  assert.equal(f.ofrecida, true);
  assert.equal(f.nombre, 'preferencias');
  const conf = contrato.configuracion(eje, 'huesped');
  const campo = (n) => f.campos.find((c) => c.nombre === n);
  assert.equal(campo('language').valor, conf.language, 'el valor actual por defecto');
  assert.equal(campo('render').valor, conf.render);
  assert.deepEqual(campo('sizes').valor, conf.sizes);
  assert.equal(campo('sizes').legible, conf.sizes.join(' '));
  assert.deepEqual(campo('render').opciones.map((x) => x.texto), ['sobrio', 'propio', 'todo']);
  assert.ok(f.campos.every((c) => !c.requerido && !c.falta && c.aLaVista));
  // pintado: los campos a la vista (sin «más parámetros»), con su nombre
  const h = html(await arbol({ foco: { X: alta, pv: 9 }, formulario: { X: alta, accion: porNombre.preferences, valores: {} } }, eje, 'huesped', PC, ES));
  const form = h.slice(h.indexOf('data-formulario'));
  assert.match(form, /name="language"/);
  assert.match(form, /name="render"/);
  assert.doesNotMatch(form, /mas-parametros/);
  // otra plantilla de ajustes (la de la guía): su formulario, por el mismo camino
  const g = formulario(eje, alta, porNombre['guide settings'], 'huesped', {}, ES);
  assert.ok(g.campos.length > 0);
  assert.equal(g.ajustes.deMiConfiguracion, false);
  assert.deepEqual(g.campos.map((c) => c.nombre), ajustesEditablesDe('guide settings', eje, 'huesped', {}, ES).campos.map((c) => c.clave));
});

test('componer en la bandeja y ejecutar deja la misma preferencia escrita que dejaba la hoja; la entrada se reconoce y vuelve a abrirse con sus valores', async () => {
  const { eje, alta, o, porNombre } = await escena();
  const antes = contrato.configuracion(eje, 'huesped');
  const otro = ['sober', 'own', 'animated'].find((x) => x !== antes.render);
  // Lo que escribía la hoja al guardar: preferencias() con cada campo partido por espacios.
  const hoja = preferencias(eje, 'huesped', { render: [otro], sizes: ['1', '2', '3'] });
  // Lo que compone ahora el formulario (lo escrito llega como texto).
  const f = formulario(eje, alta, porNombre.preferences, 'huesped', { render: otro, sizes: '1 2 3' }, ES);
  assert.deepEqual(f.ajustes.payload, hoja.payload, 'el mismo registro');
  const entrada = entradaDeAjustes(f.ajustes.payload, f.ajustes.sobre);
  assert.deepEqual([entrada.tipo, entrada.en, entrada.accion, entrada.X, entrada.donde.pv], ['registro', ANCLA_DE_LOS_AJUSTES, null, alta, PV_DE_LOS_AJUSTES]);
  const b = crearBandeja({ almacen: memoria(), libro: eje.genesisId, cuenta: 'huesped' });
  const puesta = b.poner({ ...entrada, nueva: true });
  assert.equal(puesta.ok, true, puesta.motivo);
  const leida = ajustesDeLaEntrada(puesta.entrada, o);
  assert.equal(leida.id, porNombre.preferences);
  assert.equal(leida.valores.render, otro);
  assert.equal(ajustesDeLaEntrada({ ...puesta.entrada, en: '2000000000' }, o), null, 'fuera del 9, no');
  // otra plantilla de ajustes en el mismo sitio es otra entrada
  const g = formulario(eje, alta, porNombre['guide settings'], 'huesped', { 'guide model': 'otro-modelo' }, ES);
  assert.equal(b.poner({ ...entradaDeAjustes(g.ajustes.payload, alta), nueva: true }).ok, true);
  assert.equal(b.listar().entradas.length, 2);
  const r = await b.ejecutar(eje, 'huesped', undefined, ES);
  assert.equal(r.ok, true, JSON.stringify(r.motivos));
  const despues = contrato.configuracion(eje, 'huesped');
  assert.equal(despues.render, otro);
  assert.deepEqual(despues.sizes, [1, 2, 3]);
  assert.equal(contrato.configuracionGuia(eje, 'huesped')['guide model'], 'otro-modelo');
  assert.deepEqual(eje.obtener(despues.de).payload, hoja.payload, 'escrito, el mismo payload que la hoja');
});

test('el aro es el atajo: la misma entrada se ejecuta ya, sin borrador', async () => {
  const { eje, alta, porNombre } = await escena();
  const f = formulario(eje, alta, porNombre.preferences, 'huesped', { language: 'en' }, ES);
  const r = await ejecutarAhora(eje, 'huesped', undefined, entradaDeAjustes(f.ajustes.payload, alta), ES);
  assert.equal(r.ok, true, JSON.stringify(r.motivos));
  assert.equal(contrato.configuracion(eje, 'huesped').language, 'en');
});

test('la hoja mínima: el segundo factor sigue; los formularios de ajustes ya no están; lleva a «mis ajustes»', () => {
  const segundoFactor = { criterios: [], campos: [{ nombre: 'family', etiqueta: 'familia', tipo: 'text', ayuda: '', valor: '' }] };
  const h = htmlConfiguracion(true, { claveLectura: '', claveIa: '', segundoFactor, reglas: true });
  assert.match(h, /<form class="formulario configuracion"[^>]*data-configuracion/);
  assert.match(h, /data-segundo-factor-campo="family"/, 'el segundo factor, tal cual');
  assert.match(h, /data-clave-lectura/);
  assert.match(h, /data-clave-ia/);
  assert.match(h, /data-reglas-abrir/);
  assert.match(h, new RegExp(`data-config="9"[^>]*>${t('misAjustes')}<`));
  assert.doesNotMatch(h, /name="(language|render|sizes|sync url)"|data-guia-campo|data-exterior-campo/);
  assert.equal(htmlConfiguracion(null, { segundoFactor }), '', 'cerrada, nada');
  assert.doesNotMatch(htmlConfiguracion(true, {}), /data-clave-lectura|data-clave-ia/, 'sin cuenta ni guía, sin sus claves');
});

test('el personaje del 0: el 2 abre la hoja mínima y el 9 lleva al 9 de mi alta; la app compone los ajustes como registros', async () => {
  const { eje, alta } = await escena();
  const h = html(await arbol({ foco: { X: alta, pv: 0 }, sitio: { X: alta, lugar: '0', general: true } }, eje, 'huesped', PC, ES), { cuenta: { nombre: 'yo', alta, identidad: 'huesped' }, cuentas: [] });
  assert.match(h, new RegExp(`data-config="2"[^>]*>${t('configuracionFija')}</button>`));
  assert.match(h, new RegExp(`data-config="9"[^>]*>${t('misAjustes')}</button>`));
  assert.match(APP, /if \(!form && parte === '9'\) \{[^]*?irA\(alta, PV_DE_LOS_AJUSTES\);/);
  assert.match(APP, /if \(!form\) \{ estado\.config = true;/);
  assert.doesNotMatch(APP.slice(APP.indexOf('async configurar(form, parte)'), APP.indexOf('async campo(X, pv, texto')), /escribirPreferencias|escribirPorLaBandeja/, 'la hoja ya no escribe ajustes');
  assert.match(APP, /b\.poner\(\{ \.\.\.entrada, \.\.\.\(previa \? \{ id: previa \} : \{ nueva: true \}\) \}\)/, 'cada plantilla, su entrada');
  // el interruptor (sobrio o animado) sigue siendo un atajo: ejecuta ya por el camino del 4
  assert.match(APP, /async function escribirPreferencias\(valores\) \{[^]*?escribirPorLaBandeja\(/);
});
