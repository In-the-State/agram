// La entrada de la carta (VG 18-11): la persona nueva entra por la guía de su libro de cuenta; «ver un ejemplo» queda como
// entrada secundaria (el libro de ejemplo es banco de pruebas, no escaparate). Sin navegador: lo que pinta dom.js y lo que
// pasa al crear la cuenta (carta/cuentas.js), más lo que la app hace al terminar de crearla, leído de su fuente.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { htmlArranque, html } from '../carta/dom.js';
import { arbol, ceroDe } from '../carta/carta.js';
import { TEXTOS, t } from '../carta/textos.js';
import { contrato } from '../src/index.js';
import { NIVEL } from '../carta/carta.js';
import { epocaCuenta } from '../datos/epocas/cuenta/generar.mjs';
import { EPOCA_DE_CUENTA_DATOS } from '../datos/epocas/cuenta/cuenta-0.js'; // lo que importa la app (la copia generada), no el generador

const almacen = new Map();
globalThis.localStorage ??= { getItem: (k) => almacen.get(k) ?? null, setItem: (k, v) => almacen.set(k, String(v)), removeItem: (k) => almacen.delete(k) };
const Q = await import('../carta/cuentas.js');

const MENU = { modo: 'menu' };
/** El bloque de los botones iguales (`.opciones`) de un menú de arranque. */
const opciones = (h) => /<div class="opciones">([\s\S]*?)<\/div>/.exec(h)?.[1] ?? '';

test('arranque: «ver un ejemplo» es un enlace pequeño al final, con la línea de libro de pruebas; no un botón al nivel de «crear mi cuenta»', () => {
  for (const ar of [MENU, { modo: 'menu', conClave: true }]) {
    const h = htmlArranque(ar, { cuentas: [{ alta: 'a'.repeat(64), nombre: 'Ana' }] });
    const botones = opciones(h);
    assert.ok(!botones.includes('data-arranque="ejemplo"'), 'fuera de los botones del mismo nivel');
    assert.match(botones, /data-arranque="(crear|crear-mio)"/, 'crear sigue entre los botones');
    assert.match(botones, /data-arranque="restaurar"/);
    const enlace = /<p class="arranque-ejemplo">\s*<button type="button" class="enlace" data-arranque="ejemplo">([^<]*)<\/button>\s*<small class="ayuda">([^<]*)<\/small><\/p>/.exec(h);
    assert.ok(enlace, 'el enlace con su línea');
    assert.deepEqual([enlace[1], enlace[2]], ['ver un ejemplo', t('verUnEjemploNota')]);
    assert.match(enlace[2], /libro de pruebas/);
    assert.ok(h.lastIndexOf('arranque-ejemplo') > h.lastIndexOf('data-arranque="restaurar"'), 'al final de la pantalla, detrás de lo demás');
    assert.equal(h.split('data-arranque="ejemplo"').length, 2, 'una sola entrada al ejemplo');
    assert.ok(h.includes('data-arranque="cuenta:' + 'a'.repeat(64) + '"'), 'las cuentas guardadas siguen');
  }
  assert.ok(!t('arranqueIntro').includes('ejemplo'), 'la introducción ya no ofrece el ejemplo al mismo nivel');
  for (const idioma of Object.keys(TEXTOS)) for (const clave of ['verUnEjemplo', 'verUnEjemploNota']) assert.ok(TEXTOS[idioma][clave], clave + ' en ' + idioma);
});

test('arranque: el ejemplo sigue entrándose por el mismo gesto (data-arranque="ejemplo") y el selector de ejemplos de dentro conserva su opción', () => {
  assert.match(readFileSync('carta/gestos.js', 'utf8'), /b\('\[data-arranque\]'\)[\s\S]{0,120}m\.arranque\?\.\(el\.dataset\.arranque\)/);
  const app = readFileSync('carta/app.js', 'utf8');
  assert.ok(app.includes('que === EJEMPLO') && app.includes('await entrarEnEjemplo();'), 'la app lo atiende');
  assert.match(readFileSync('carta/dom.js', 'utf8'), /<optgroup label="\$\{attr\(t\('ejemplos'\)\)\}"><option value="ejemplo">\$\{t\('probarConEjemplo'\)\}<\/option><\/optgroup>/);
});

/** Lo que la app llama al crear (app.js, `crear`): crearCuenta con la época de cuenta que importa, la copia generada. */
const crearComoLaApp = (nombre, extra = {}) => Q.crearCuenta({ nombre, idioma: 'es', htmlInicial: true, epoca: EPOCA_DE_CUENTA_DATOS, ...extra });

test('arranque: «crear mi cuenta» nace con la época del libro de cuenta: la app pasa su copia importable, y esa copia es la época generada', () => {
  const app = readFileSync('carta/app.js', 'utf8');
  assert.ok(app.includes("import { EPOCA_DE_CUENTA_DATOS } from '../datos/epocas/cuenta/cuenta-0.js';"));
  const crear = app.slice(app.indexOf('async crear(form) {'), app.indexOf('async restaurar(form) {'));
  assert.ok(crear.includes('...(porLaApp ? {} : { epoca: EPOCA_DE_CUENTA_DATOS })'), 'la llamada de crear lleva la época, salvo emparejada con la app (su génesis lo firma la app: otro carril)');
  assert.ok(crear.includes('const porLaApp = Boolean(guardian && emparejado.adaptador && guardian === emparejado.adaptador);'));
  assert.deepEqual(EPOCA_DE_CUENTA_DATOS, epocaCuenta(), 'la copia importable es el contenido de cuenta-0.btml.json');
  assert.ok(!readFileSync('datos/epocas/cuenta/cuenta-0.js', 'utf8').includes("type: 'json'"));
  // Los libros de ejemplo, la restauración y los libros privados no pasan por esa llamada ni cambian.
  assert.ok(!/epoca: EPOCA_DE_CUENTA_DATOS/.test(app.replace(crear, '')), 'solo crear');
});

test('arranque: crear la cuenta aterriza en el 9 de mi alta, con su camino a la vista y el aviso de la guía de inicio, con la época con que nace de verdad', async () => {
  // Lo que la app hace al crear: foco en mi alta y, de los pesos de la época, el 9 abierto como tarjeta.
  const app = readFileSync('carta/app.js', 'utf8');
  assert.ok(app.includes('estado.foco = { X: r.cuenta.alta, pv: anversoDe(estado.eje) };'));
  assert.ok(app.includes('if (alEmpezar.pv !== null && alEmpezar.tamano !== null) estado.niveles[alEmpezar.pv] = alEmpezar.tamano;'));
  const r = await crearComoLaApp('Ana Prueba');
  assert.equal(r.eje.epoca().id, JSON.parse(readFileSync('datos/epocas/cuenta/cuenta-0.ids.json', 'utf8')).epoca, 'el libro nace con la época de cuenta');
  const { alEmpezar } = contrato.pesos(r.eje);
  assert.deepEqual(alEmpezar, { pv: 9, tamano: NIVEL.tarjeta });
  const a = await arbol({ foco: { X: r.cuenta.alta, pv: contrato.sitios(r.eje).centros[0] }, niveles: { [alEmpezar.pv]: alEmpezar.tamano }, rosetones: {} }, r.eje, r.cuenta.identidad, { ancho: 400, alto: 800 });
  assert.equal(a.X, r.cuenta.alta);
  const tutorial = a.camino.pasos.filter((p) => p.fuente === 'tutorial');
  assert.deepEqual(tutorial.slice(0, 2).map((p) => p.regla), ['this account lives only here', 'a key is declared at its alta'], 'el aviso, el primero');
  assert.equal(tutorial.length, 6);
  const pintado = html(a, { cuentas: [] });
  assert.ok(pintado.includes('class="camino"'), 'el camino a la vista');
  assert.ok(pintado.includes('tu cuenta está solo aquí: haz un respaldo o únete a un nodo'), 'con el aviso de la guía de inicio');
  // El alta, como siempre: mi nombre en su 0 y mi clave declarada.
  assert.equal(ceroDe(r.eje, r.cuenta.alta), 'Ana Prueba');
});

test('arranque: la cuenta nacida con la época de cuenta se guarda y se vuelve a abrir (la época viaja en el génesis), y se exporta y restaura en una copia', async () => {
  const r = await crearComoLaApp('Berta Prueba');
  const id = r.eje.epoca().id;
  assert.ok(await Q.guardarCuenta(r), 'guardada');
  const otra = await Q.abrirCuenta(r.cuenta.alta);
  assert.ok(otra, 'se vuelve a abrir');
  assert.equal(otra.eje.epoca().id, id, 'la época se relee del libro');
  assert.equal(otra.eje.orden.length, r.eje.orden.length);
  const archivo = await Q.exportarCuenta(r, 'una frase de prueba larga', { iteraciones: 1000 });
  const copia = await Q.restaurarCuenta(JSON.parse(Q.textoDeArchivo(archivo)), 'una frase de prueba larga');
  assert.equal(copia.eje.epoca().id, id, 'la copia lleva la época');
  assert.equal(copia.cuenta.alta, r.cuenta.alta);
  assert.equal(copia.eje.orden.length, r.eje.orden.length);
  const aviso = (await arbol({ foco: { X: copia.cuenta.alta, pv: 0 }, niveles: { 9: NIVEL.tarjeta }, rosetones: {} }, copia.eje, copia.cuenta.identidad, { ancho: 400, alto: 800 })).camino.pasos[0];
  assert.equal(aviso.regla, 'this account lives only here', 'el camino sigue con el aviso tras restaurar');
});
