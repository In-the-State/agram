// El ensayo del roadmap en la carta (el botón «Entrar en el libro del roadmap» del servidor de retoques) y la guía en la
// pantalla completa del 9. Lo que se comprueba:
//   1. la bienvenida enseña el botón cuando hay ensayo (la misma condición que el panel Core) y, sin él, queda igual;
//   2. el botón, en la bienvenida y en el panel Core, se apaga y dice que está entrando mientras trabaja, y si falla dice
//      por qué y vuelve a quedar pulsable;
//   3. la pantalla completa del rosetón 9 lleva la guía con su «guía | Core» debajo del camino.
// Sin servidor ni claves: solo lo que pinta dom.js.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { htmlArranque, htmlGuia, html } from '../carta/dom.js';
import { arbol } from '../carta/carta.js';
import { t } from '../carta/textos.js';
import { ejemploCompra } from '../ejemplos/ikisai/compra-food.mjs';

const MENU = { modo: 'menu' };
/** El botón del ensayo de un trozo de HTML: { disabled, texto } o null. */
const boton = (h) => {
  const m = /<button[^>]*data-core-ensayo[^>]*>([^<]*)<\/button>/.exec(h);
  return m ? { disabled: /\sdisabled/.test(m[0]), texto: m[1] } : null;
};
/** El panel Core de la guía, con lo mínimo y el ensayo dado. */
const core = (ensayo) => htmlGuia({ core: { con: 'core', turnos: [], pensando: false, error: '', borrador: '', senalado: [], senalando: false, fondo: null, fondoAbierto: false, ensayo } });

test('ensayo: la bienvenida enseña «Entrar en el libro del roadmap» cuando hay ensayo; sin él, queda exactamente igual', () => {
  assert.equal(htmlArranque(MENU, { ensayo: null }), htmlArranque(MENU), 'sin servidor de retoques, como hoy');
  assert.equal(boton(htmlArranque(MENU)), null);
  assert.deepEqual(boton(htmlArranque(MENU, { ensayo: { entrando: false, error: '' } })), { disabled: false, texto: t('coreEnsayo') });
  assert.deepEqual(boton(htmlArranque(MENU, { ensayo: { entrando: false } , sobreCarta: true })), { disabled: false, texto: t('coreEnsayo') }, 'también sobre la carta');
  assert.equal(boton(htmlArranque({ modo: 'crear', campos: [] }, { ensayo: { entrando: false } })), null, 'solo en el menú de la bienvenida');
});

test('ensayo: el botón se apaga y dice que entra mientras trabaja; si falla, dice por qué y vuelve a ser pulsable (bienvenida y Core)', () => {
  for (const [donde, pinta] of [['bienvenida', (e) => htmlArranque(MENU, { ensayo: e })], ['Core', core]]) {
    assert.deepEqual(boton(pinta({ entrando: true, error: '' })), { disabled: true, texto: t('coreEnsayoEntrando') }, donde + ': entrando');
    const fallo = pinta({ entrando: false, error: 'la copia no llega' });
    assert.deepEqual(boton(fallo), { disabled: false, texto: t('coreEnsayo') }, donde + ': otra vez pulsable');
    assert.ok(fallo.includes(t('coreEnsayoFallo', { motivo: 'la copia no llega' })), donde + ': el motivo');
    assert.doesNotMatch(pinta({ entrando: true, error: 'viejo' }), /data-core-ensayo-error/, donde + ': mientras entra, sin el error de antes');
    assert.doesNotMatch(pinta({ entrando: false, error: '<b>x</b>' }), /<b>x<\/b>/, donde + ': el motivo, escapado');
  }
  assert.equal(boton(core(null)), null, 'sin ensayo, nada en Core');
});

test('pantalla completa del 9: lleva la guía con su «guía | Core» debajo del camino', async () => {
  const { eje, compra } = await ejemploCompra();
  const ORDENADOR = { ancho: 1366, alto: 900 };
  const a = await arbol({ foco: { X: compra.id, pv: 0 }, rosetones: { 9: 3 } }, eje, 'huesped', ORDENADOR);
  a.guia = { historial: [], preguntas: [], pensando: false, core: { con: 'guia' } };
  const h = html(a, { cuentas: [] });
  const pantalla = /<section class="roseton-pantalla"[^>]*data-roseton-pantalla="(\d)"[\s\S]*?<\/section>\s*<\/section>|<section class="roseton-pantalla"[^>]*data-roseton-pantalla="(\d)"[\s\S]*?$/.exec(h);
  assert.ok(pantalla, 'la pantalla completa del rosetón');
  assert.equal(pantalla[1] ?? pantalla[2], '9');
  assert.match(pantalla[0], /data-guia/);
  assert.match(pantalla[0], /data-guia-con="core"/);
  // Otro rosetón a pantalla completa no lleva la guía.
  const b = await arbol({ foco: { X: compra.id, pv: 0 }, rosetones: { 1: 3 } }, eje, 'huesped', ORDENADOR);
  b.guia = a.guia;
  const otra = /<section class="roseton-pantalla"[^>]*data-roseton-pantalla="1"[\s\S]*?<\/section>/.exec(html(b, { cuentas: [] }));
  assert.ok(otra);
  assert.doesNotMatch(otra[0], /data-guia/);
});
