// Los textos propios de la carta en inglés (carta/textos.js, el bloque `en`): las mismas claves que el español, los mismos
// huecos {…} en cada una, ninguna cadena igual a la española salvo las que no llevan palabras (cifras, signos, nombres
// propios y abreviaturas que se escriben igual), y sin jerga interna («PV», posiciones en cifras) ni letras del español.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TEXTOS, huecosDe, t, idiomaDeInterfaz } from '../carta/textos.js';

/** Lo que se escribe igual en los dos idiomas: nombres propios, siglas y abreviaturas. */
const IGUALES = new Set(['min', 'JSON', 'HTML', 'BTML', 'AGRAM', 'Nostr', 'Bitcoin', 'Schnorr', 'BIP', 'Core', 'Claude', 'Anthropic', 'StateArk', 'lottie', 'web', 'QR', 'KB', 'MB']);
const palabras = (s) => (String(s).replace(/\{[^{}]+\}/g, '').match(/\p{L}{2,}/gu) ?? []).filter((w) => !IGUALES.has(w));

test('el bloque inglés tiene exactamente las claves del español, en el mismo orden', () => {
  assert.deepEqual(Object.keys(TEXTOS.en), Object.keys(TEXTOS.es));
});

test('cada clave tiene los mismos huecos en los dos idiomas', () => {
  const distintos = Object.keys(TEXTOS.es).filter((k) => JSON.stringify(huecosDe(TEXTOS.es[k]).sort()) !== JSON.stringify(huecosDe(TEXTOS.en[k]).sort()));
  assert.deepEqual(distintos, []);
});

test('ninguna cadena inglesa es igual a la española, salvo las que no llevan palabras', () => {
  const iguales = Object.keys(TEXTOS.es).filter((k) => TEXTOS.en[k] === TEXTOS.es[k] && palabras(TEXTOS.es[k]).length > 0);
  assert.deepEqual(iguales, []);
});

test('el inglés va sin jerga interna ni letras del español', () => {
  const malos = Object.entries(TEXTOS.en).filter(([, v]) => {
    const s = v.replace(/\{[^{}]+\}/g, '');
    return /\bPV\b|\b\d\.\d\b|[áéíóúñ¿¡«»]/.test(s);
  }).map(([k]) => k);
  assert.deepEqual(malos, []);
});

test('con el idioma en inglés, la carta habla en inglés; con uno que no tiene textos, en el primero', () => {
  assert.equal(idiomaDeInterfaz('en'), 'en');
  assert.equal(t('altaNombre', {}, 'en'), 'your name');
  assert.equal(t('cuentaAbierta', { nombre: 'Ana', cuantos: 3 }, 'en'), 'account Ana · 3 records');
  assert.equal(idiomaDeInterfaz('fr'), 'es');
});
