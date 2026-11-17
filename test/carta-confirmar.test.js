// La confirmación dentro de la página (carta/confirmar.js), en lugar del `confirm` del navegador: olvidar una cuenta
// (carta/app.js) y vaciar las opiniones (carta/opinar.js). Sin navegador: un documento mínimo de mentira.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { htmlConfirmar, confirmarEnPagina } from '../carta/confirmar.js';
import { t } from '../carta/textos.js';

/** Un documento mínimo: crea un fondo, lo pone en el body y deja pulsar [data-confirmar], el fondo y Escape. */
function documentoDePrueba() {
  const oyentes = { documento: [] };
  const fondos = [];
  const botones = { si: { enfocado: false }, no: { enfocado: false } };
  const documento = {
    activeElement: { foco: 0, focus() { this.foco += 1; } },
    createElement: () => {
      const el = {
        className: '', atributos: {}, oyentes: [], quitado: false, innerHTML: '',
        setAttribute(k, v) { this.atributos[k] = v; },
        addEventListener(tipo, f) { this.oyentes.push([tipo, f]); },
        remove() { this.quitado = true; const i = fondos.indexOf(this); if (i >= 0) fondos.splice(i, 1); },
        querySelector(s) { const m = /data-confirmar="(si|no)"/.exec(s); return m ? { focus: () => { botones[m[1]].enfocado = true; } } : null; },
      };
      return el;
    },
    body: { append: (el) => fondos.push(el) },
    addEventListener: (tipo, f) => oyentes.documento.push([tipo, f]),
    removeEventListener: (tipo, f) => { oyentes.documento = oyentes.documento.filter(([a, b]) => !(a === tipo && b === f)); },
  };
  const pulsa = (que) => {
    const fondo = fondos[0];
    const boton = que === 'fondo' ? null : { getAttribute: () => que };
    const objetivo = que === 'fondo' ? fondo : { closest: () => boton };
    for (const [tipo, f] of fondo.oyentes) if (tipo === 'click') f({ target: objetivo, preventDefault() {} });
  };
  const escape = () => { let parado = false; for (const [tipo, f] of [...oyentes.documento]) if (tipo === 'keydown') f({ key: 'Escape', preventDefault() {}, stopPropagation() {}, stopImmediatePropagation() { parado = true; } }); return parado; };
  return { documento, fondos, botones, pulsa, escape, oyentes };
}

test('htmlConfirmar: escapa el texto y lleva Seguir y Cancelar', () => {
  const h = htmlConfirmar({ texto: '<b>¿Seguir?</b>' });
  assert.ok(h.includes('&lt;b&gt;') && !h.includes('<b>¿'));
  assert.ok(h.includes('data-confirmar="si"') && h.includes('>' + t('confirmarSeguir') + '<'));
  assert.ok(h.includes('data-confirmar="no"') && h.includes('>' + t('confirmarCancelar') + '<'));
  assert.match(h, /role="alertdialog"/);
});

test('confirmarEnPagina: Seguir da true; Cancelar, el fondo y Escape dan false; cada vez el diálogo se va y no queda ningún oyente', async () => {
  for (const [gesto, esperado] of [['si', true], ['no', false], ['fondo', false], ['escape', false]]) {
    const d = documentoDePrueba();
    const respuesta = confirmarEnPagina('¿Borrar «Ana»?', { documento: d.documento });
    assert.equal(d.fondos.length, 1, 'el diálogo está en la página');
    assert.ok(d.fondos[0].innerHTML.includes('¿Borrar «Ana»?'));
    assert.equal(d.botones.no.enfocado, true, 'el foco empieza en Cancelar');
    if (gesto === 'escape') assert.equal(d.escape(), true, 'Escape no llega a nadie más');
    else d.pulsa(gesto);
    assert.equal(await respuesta, esperado, gesto);
    assert.equal(d.fondos.length, 0, 'el diálogo se cierra');
    assert.equal(d.oyentes.documento.length, 0, 'sin oyentes sueltos');
    assert.equal(d.documento.activeElement.foco, 1, 'el foco vuelve adonde estaba');
  }
});

test('confirmarEnPagina: con una pregunta abierta, otra responde false sin abrir un segundo diálogo; sin documento, false', async () => {
  const d = documentoDePrueba();
  const primera = confirmarEnPagina('una', { documento: d.documento });
  assert.equal(await confirmarEnPagina('otra', { documento: d.documento }), false);
  assert.equal(d.fondos.length, 1);
  d.pulsa('si');
  assert.equal(await primera, true);
  assert.equal(await confirmarEnPagina('sin página', { documento: null }), false);
});

test('el navegador ya no se usa para confirmar: ni carta/app.js ni carta/opinar.js llaman a confirm()', () => {
  for (const f of ['../carta/app.js', '../carta/opinar.js']) {
    const fuente = readFileSync(new URL(f, import.meta.url), 'utf8');
    assert.doesNotMatch(fuente, /\bconfirm\s*\(/, f);
  }
});
