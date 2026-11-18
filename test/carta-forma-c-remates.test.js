// Remates de la forma C vistos en pantalla (VG 18-11): en Mapped, un punto de vista comprimido no se pinta y su rosetón
// lleva la marca con cuántas acciones ofrece.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { arbol, LATERALES, NIVEL } from '../carta/carta.js';
import { html } from '../carta/dom.js';
import { ejemploCompra } from '../ejemplos/ikisai/compra-food.mjs';

const PC = { ancho: 1440, alto: 900 };

test('Mapped: cada punto de vista comprimido lleva en su rosetón la marca con cuántas acciones ofrece; uno en tarjeta, no', async () => {
  const { eje, compra } = await ejemploCompra();
  const niveles = Object.fromEntries(LATERALES.map((pv) => [pv, NIVEL.comprimido]));
  niveles[2] = NIVEL.tarjeta;
  const a = await arbol({ foco: { X: compra.id, pv: 0 }, niveles }, eje, 'huesped', PC);
  assert.ok(a.rosetones?.length, 'hay rosetones');
  const h = html(a);
  const marcas = Object.fromEntries([...h.matchAll(/<span class="roseton-marca" data-marca-pv="(\d)" title="[^"]*">(\d+)<\/span>/g)].map((m) => [Number(m[1]), Number(m[2])]));
  for (const n of a.laterales) {
    if (n.nivel <= NIVEL.comprimido && n.acciones?.total) assert.equal(marcas[n.pv], n.acciones.total, 'la marca del ' + n.pv);
    else assert.equal(marcas[n.pv], undefined, 'sin marca el ' + n.pv + ' (nivel ' + n.nivel + ')');
  }
  assert.ok(Object.keys(marcas).length >= 5, 'varias marcas');
  // Dentro de su rosetón (el botón de esa posición), sin tocar sus clases de tamaño ni de sitio.
  const r1 = h.match(/<button type="button" class="roseton [^"]*" [^>]*data-roseton="1"[^]*?<\/button>/)[0];
  assert.match(r1, /class="roseton-marca"/);
});
