// La entrada de la carta (VG 18-11): la persona nueva entra por la guía de su libro de cuenta; «ver un ejemplo» queda como
// entrada secundaria (el libro de ejemplo es banco de pruebas, no escaparate). Sin navegador: lo que pinta dom.js y lo que
// pasa al crear la cuenta (carta/cuentas.js), más lo que la app hace al terminar de crearla, leído de su fuente.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { htmlArranque, html } from '../carta/dom.js';
import { arbol } from '../carta/carta.js';
import { TEXTOS, t } from '../carta/textos.js';
import { contrato } from '../src/index.js';
import { NIVEL } from '../carta/carta.js';
import { epocaCuenta } from '../datos/epocas/cuenta/generar.mjs';

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

test('arranque: crear la cuenta aterriza en el 9 de mi alta, con su camino a la vista (y el aviso de la cuenta, si el libro nace con la época de cuenta)', async () => {
  // Lo que la app hace al crear (app.js, `crear`): foco en mi alta y, de los pesos de la época, el 9 abierto como tarjeta.
  const app = readFileSync('carta/app.js', 'utf8');
  assert.ok(app.includes('estado.foco = { X: r.cuenta.alta, pv: anversoDe(estado.eje) };'));
  assert.ok(app.includes('if (alEmpezar.pv !== null && alEmpezar.tamano !== null) estado.niveles[alEmpezar.pv] = alEmpezar.tamano;'));
  // Un libro nuevo, como lo crea la app (cuentas.crearCuenta), con la época de cuenta puesta (hoy la app no la pasa: ver informe).
  const r = await Q.crearCuenta({ nombre: 'Ana Prueba', idioma: 'es', htmlInicial: true, epoca: epocaCuenta() });
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
});
