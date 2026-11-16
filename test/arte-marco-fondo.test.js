// El arte en sus dos sitios (VG 14-11, #94; #114): el FONDO, detrás de todo, y el MARCO, que rodea el bloque de campos
// del elemento sin cubrirlo nunca, con sus HUECOS declarados en coordenadas del dibujo (arte/general/marco-fondo.json): el
// del bloque, el del personaje y los de los subelementos (rectángulo y punto de apoyo) con su rótulo debajo. Primera
// aplicación: el paquete externo «Tiendas, Jardín y Parque» (arte de una IA externa, 15-11-2026: datos no fiables,
// saneados y servidos como data:, SEG-15): las tiendas como marco del 1 y las secuencias de crecimiento como fondo del 2 y
// del 3. Aquí: la carga y la validación de los huecos; que el hueco del bloque contiene el bloque (1366 × 768 y 390 × 844);
// que ningún arte pisa un texto en los diez PV; los hijos en sus huecos por orden y el «+n»; los rótulos sin desbordar;
// el saneado; y que el sobrio no cambia.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { arbol, preferencias, colocarEscena, BLOQUE_MINIMO, medidasDePantalla } from '../carta/carta.js';
import { html } from '../carta/dom.js';
import * as modelos from '../src/modelos.js';
import { ejemploCompra } from '../ejemplos/ikisai/compra-food.mjs';
import { pagaElCoste } from './ayudas-coste.js';
import { sinArte, sinCapas } from './ayudas-arte.js';

const T1 = '2026-11-08T10:00:00Z';
const PVS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
const ORDENADOR = medidasDePantalla(1366, 768);
const MOVIL = medidasDePantalla(390, 844);
const CSS = readFileSync(new URL('../carta/estilo.css', import.meta.url), 'utf8');
const RAIZ = new URL('../', import.meta.url);
const leer = (ruta) => readFileSync(new URL(ruta, RAIZ), 'utf8');
const JSON_ARTE = JSON.parse(leer(modelos.ARTE_DE_MARCO));

/** La huésped en animado con el modelo general. */
async function animado(eje, quien = 'huesped') {
  const p = preferencias(eje, quien, { render: 'animated', model: 'general' });
  await eje.escribir({ autor: quien, sobre: p.sobre, en: p.en, t: T1, movimientos: [pagaElCoste(quien)], payload: p.payload });
}
/** Un arte del modelo general cambiado en una copia (el resto, del repositorio), para las pruebas. */
function arteCambiado(cambiar) {
  const datos = structuredClone(JSON_ARTE);
  cambiar(datos);
  return modelos.cargarArteDeMarco({ leer: async (ruta) => (ruta === modelos.ARTE_DE_MARCO ? JSON.stringify(datos) : leer(ruta)) });
}
const solapan = (a, b) => a.x < b.x + b.ancho - 0.01 && b.x < a.x + a.ancho - 0.01 && a.y < b.y + b.alto - 0.01 && b.y < a.y + a.alto - 0.01;
const contiene = (a, b) => b.x >= a.x - 0.01 && b.y >= a.y - 0.01 && b.x + b.ancho <= a.x + a.ancho + 0.01 && b.y + b.alto <= a.y + a.alto + 0.01;

test('la carga y la validación de los huecos: el arte del modelo general vale; un rectángulo fuera del lienzo, un solape del bloque con un hueco o un rótulo, un apoyo fuera de su hueco, unos umbrales que no crecen o un marco sin huecos no valen', async () => {
  const { arte, motivos } = await modelos.cargarArteDeMarco();
  assert.deepEqual(motivos, []);
  assert.equal(arte.modelo, 'general');
  const t = arte.huecos.tienda;
  assert.equal(t.ajuste, 'fijo');
  // los del paquete, tal cual: el personaje y la fila de abajo de la estantería (de izquierda a derecha)
  assert.deepEqual(t.personaje, { x: 75, y: 161, ancho: 390, alto: 742, apoyo: { x: 270, y: 903 } });
  assert.deepEqual(t.subelementos.map((s) => [s.x, s.y, s.ancho, s.alto, s.apoyo.x, s.apoyo.y]), [562, 750, 938, 1126, 1314].map((x) => [x, 575, 158, 223, x + 79, 798]));
  for (const nombre of ['tienda-amarillo', 'tienda-verde', 'tienda-azul-cian', 'tienda-rojo']) assert.deepEqual([arte.dibujos[nombre].huecos, arte.dibujos[nombre].lienzo], ['tienda', { ancho: 1536, alto: 1024 }]);
  // la validación, uno a uno
  const mal = (cambiar) => modelos.validarArteDeMarco((() => { const d = structuredClone(JSON_ARTE); cambiar(d); return d; })());
  assert.deepEqual(mal(() => {}), []);
  assert.match(mal((d) => { d.huecos.tienda.bloque.ancho = 2000; }).join(' '), /el bloque sale del lienzo/);
  assert.match(mal((d) => { d.huecos.tienda.bloque.alto = 700; }).join(' '), /el bloque se solapa con el subelemento 1/);
  assert.match(mal((d) => { d.huecos.tienda.bloque.alto = 600; d.huecos.tienda.bloque.y = 0; d.huecos.tienda.subelementos[0].y = 0; }).join(' '), /el bloque se solapa/);
  assert.match(mal((d) => { d.huecos.tienda.personaje.apoyo.y = 990; }).join(' '), /el apoyo de el personaje no está en su rectángulo/);
  assert.match(mal((d) => { d.huecos.tienda.rotulo = 300; }).join(' '), /el rótulo del subelemento 1 sale del lienzo/);
  assert.match(mal((d) => { d.huecos.tienda.subelementos[1].x = 600; }).join(' '), /el subelemento 1 se solapa con el subelemento 2/);
  assert.match(mal((d) => { d.mundos[2].fondo.dibujos[1][0] = 0; }).join(' '), /los umbrales del fondo no crecen/);
  assert.match(mal((d) => { d.mundos[1].marco.dibujos[0][1] = 'jardin-1'; }).join(' '), /no declara sus huecos/);
  assert.match(mal((d) => { d.mundos[5] = { marco: { dibujos: [[0, 'tienda-rojo']] } }; }).join(' '), /mundo 5: no es un mundo/);
  assert.match(mal((d) => { d.huecos['marco-jardin'].personaje = t.personaje; }).join(' '), /un marco estirable solo declara el bloque/);
  assert.match(mal((d) => { d.dibujos['tienda-rojo'].recurso = 'https://ejemplo.invalid/x.svg'; }).join(' '), /no es un SVG del arte del repositorio/);
  assert.match(mal((d) => { d.dibujos['tienda-rojo'].recurso = 'arte/../sw.svg'; }).join(' '), /no es un SVG del arte del repositorio/);
  // un arte que no vale no se pinta: la carta se queda con el fondo del modelo y sin marco
  const roto = arteCambiado((d) => { d.huecos.tienda.bloque.alto = 700; });
  assert.notDeepEqual((await roto).motivos, []);
  const { eje, compra } = await ejemploCompra();
  await animado(eje);
  const a = await arbol({ foco: { X: compra.id, pv: 1 } }, eje, 'huesped', ORDENADOR, { arteDeMarco: roto });
  assert.equal(a.centro.rejilla.escena.marco, null);
  assert.ok(a.centro.rejilla.escena.fondo.recurso.includes('/fondo/'));
});

/**
 * La escena medida en el navegador (Playwright, 16-11, el ejemplo de la compra): a 1366 × 768 la pantalla completa de
 * Mapped deja a la escena 1254 × 608 en el 1 (con «nivel 1 de 4») y 1254 × 630 en el 4; a 390 × 844 (Sequenced, sin
 * rejilla), la escena va al ancho de la tarjeta, 321 px, y su alto es el del dibujo a ese ancho.
 */
const ESCENAS = { 1366: [{ ancho: 1254, alto: 608 }, { ancho: 1254, alto: 630 }], 390: [{ ancho: 321 }] };

test('el hueco del bloque contiene el bloque, a 1366 × 768 y a 390 × 844: el marco se escala por el hueco (el arte se adapta al bloque), se corre lo justo y no lo cubre', async () => {
  const { arte } = await modelos.cargarArteDeMarco();
  for (const nombre of Object.keys(arte.dibujos).filter((n) => arte.dibujos[n].huecos)) {
    const m = { ...arte.huecos[arte.dibujos[nombre].huecos], lienzo: arte.dibujos[nombre].lienzo };
    const areas = [...ESCENAS[1366].map((a) => [a, BLOQUE_MINIMO]), ...ESCENAS[390].map((a) => [{ ancho: a.ancho, alto: (a.ancho * m.lienzo.alto) / m.lienzo.ancho }, 0]), [{ ancho: 800, alto: 300 }, BLOQUE_MINIMO], [{ ancho: 300, alto: 900 }, BLOQUE_MINIMO]];
    for (const [area, minimo] of areas) {
      const g = colocarEscena(m, area, { minimo });
      const donde = `${nombre} en ${Math.round(area.ancho)} × ${Math.round(area.alto)}`;
      assert.ok(contiene({ x: 0, y: 0, ...area }, g.bloque), donde + ': el bloque, dentro de la escena');
      assert.ok(g.bloque.ancho > 0 && g.bloque.alto > 0, donde);
      if (m.ajuste === 'estirable') {
        assert.equal(g.s, m.escala);
        assert.deepEqual([g.bloque.x, g.bloque.y], [m.bloque.x * m.escala, m.bloque.y * m.escala], donde + ': el borde, de su grosor');
        continue;
      }
      // el hueco del bloque es exactamente el bloque: su rectángulo del lienzo, a la escala del dibujo
      const hueco = { x: g.lienzo.x + m.bloque.x * g.s, y: g.lienzo.y + m.bloque.y * g.s, ancho: m.bloque.ancho * g.s, alto: m.bloque.alto * g.s };
      assert.deepEqual(g.bloque, hueco, donde);
      // el dibujo entero cabe si el bloque no queda por debajo del mínimo; si no, crece y se recorta por fuera, nunca por el bloque
      if (Math.min(area.ancho / m.lienzo.ancho, area.alto / m.lienzo.alto) * m.bloque.ancho >= Math.min(minimo, area.ancho)) assert.ok(contiene({ x: 0, y: 0, ...area }, g.lienzo), donde + ': el dibujo entero');
      else assert.ok(g.bloque.ancho >= Math.min(minimo, area.ancho) - 0.01 || g.bloque.alto >= area.alto - 0.01, donde + ': el bloque, al menos el mínimo');
    }
  }
  // en el árbol: a 1366 × 768 la pantalla completa del 1 y, a 390 × 844, el 1 como foco llevan la tienda alrededor del bloque
  const { eje, compra } = await ejemploCompra();
  await animado(eje);
  const a = await arbol({ foco: { X: compra.id, pv: 1 } }, eje, 'huesped', ORDENADOR);
  assert.equal(a.centro.rejilla.escena.marco.dibujo, 'tienda-amarillo');
  assert.match(html(a), /<div class="arte-escena" data-ajuste="fijo" data-dibujo="tienda-amarillo" style="--lw:1536;--lh:1024;--bx:488;--by:0;--bw:1048;--bh:568"><div class="arte-lienzo">/);
  const b = await arbol({ foco: { X: compra.id, pv: 1 } }, eje, 'huesped', MOVIL);
  assert.equal(b.apilada, true);
  assert.equal(b.centro.escena.marco.dibujo, 'tienda-amarillo');
  // la cuenta de estilo.css es la de colocarEscena: el mismo mínimo, contenido, centrado y corrido por el bloque
  assert.match(CSS, new RegExp(`\\.arte-escena\\{--bloque-minimo:${BLOQUE_MINIMO}px;`));
  assert.match(CSS, /--s:min\(max\(min\(calc\(100cqw \/ var\(--lw\)\),calc\(100cqh \/ var\(--lh\)\)\),calc\(min\(var\(--bloque-minimo\),100cqw\) \/ var\(--bw\)\)\),calc\(100cqw \/ var\(--bw\)\),calc\(100cqh \/ var\(--bh\)\)\)/);
  assert.match(CSS, /left:clamp\(calc\(-1 \* var\(--bx\) \* var\(--s\)\),calc\(\(100cqw - var\(--lw\) \* var\(--s\)\) \/ 2\),calc\(100cqw - \(var\(--bx\) \+ var\(--bw\)\) \* var\(--s\)\)\)/);
  assert.match(CSS, /\.arte-lienzo>\.arte-bloque\{left:calc\(var\(--bx\) \/ var\(--lw\) \* 100%\);top:calc\(var\(--by\) \/ var\(--lh\) \* 100%\);width:calc\(var\(--bw\) \/ var\(--lw\) \* 100%\);height:calc\(var\(--bh\) \/ var\(--lh\) \* 100%\)/);
  assert.match(CSS, /\.nucleo\.abierto>\.arte-escena\[data-ajuste="fijo"\]\{--bloque-minimo:0px;width:100%;aspect-ratio:var\(--lw\) \/ var\(--lh\)\}/);
});

/** El polígono del recorte de un marco fijo (clip-path), como rectángulos en coordenadas del lienzo: los agujeros. */
function agujerosDe(h, lienzo) {
  const poly = /style="clip-path:polygon\(evenodd, ([^)]*)\)"/.exec(h)?.[1];
  if (!poly) return null;
  const pts = poly.split(', ').map((p) => p.split(' ').map((v) => Number(v.replace('%', ''))));
  const fuera = [];
  // el lienzo (5 puntos) y, por agujero, sus 4 esquinas, el cierre y la vuelta a la esquina del lienzo
  for (let i = 5; i + 5 < pts.length + 1; i += 6) {
    const [[x1, y1], , [x2, y2]] = pts.slice(i, i + 3);
    fuera.push({ x: (x1 * lienzo.ancho) / 100, y: (y1 * lienzo.alto) / 100, ancho: ((x2 - x1) * lienzo.ancho) / 100, alto: ((y2 - y1) * lienzo.alto) / 100 });
  }
  return fuera;
}

test('ningún nodo de arte solapa una caja de texto en los diez PV (1366 × 768 y 390 × 844): todo texto de la escena está en el bloque o en un rótulo; el dibujo se recorta por ellos; el personaje y los dibujos de los subelementos no los tocan', async () => {
  const { eje, compra } = await ejemploCompra();
  await animado(eje);
  const { arte } = await modelos.cargarArteDeMarco();
  let marcos = 0;
  for (const medidas of [ORDENADOR, MOVIL]) {
    for (const pv of PVS) {
      const a = await arbol({ foco: { X: compra.id, pv } }, eje, 'huesped', medidas);
      const h = html(a);
      const donde = `el ${pv} a ${medidas.ancho} × ${medidas.alto}`;
      const escena = a.centro.rejilla?.escena ?? a.centro.escena ?? null;
      // el fondo, si lo hay, siempre detrás (una capa de z-index -1); ninguna otra capa fuera de la escena salvo el muñeco de un sitio (un mando)
      const capas = [...h.matchAll(/class="([^"]*\bcapa\b[^"]*)"/g)].map((m) => m[1]);
      for (const c of capas) assert.ok(/capa-fondo|capa-sitio|capa-marco|capa-personaje|capa-sub|capa-rotulo/.test(c), `${donde}: «${c}» no es de los dos sitios`);
      if (!escena?.marco) { assert.doesNotMatch(h, /capa-marco|capa-personaje|capa-sub|capa-rotulo/, donde + ': sin marco'); continue; }
      marcos++;
      const m = escena.marco;
      const inicio = h.indexOf('<div class="arte-escena"');
      const tramo = h.slice(inicio);
      // en la escena, el único texto fuera del bloque es el de los rótulos (y el título accesible del personaje, un atributo)
      const bloque = tramo.indexOf('<div class="arte-bloque">');
      const antesDelBloque = sinCapas(tramo.slice(0, bloque), 'capa-rotulo');
      assert.equal(antesDelBloque.replace(/<[^>]*>/g, '').trim(), '', donde + ': ningún texto bajo el dibujo, fuera del bloque y de los rótulos');
      if (m.ajuste === 'estirable') {
        // un borde: el dibujo vive en el borde de la capa (border-image sin fill) y el bloque, dentro, con el relleno de ese borde
        assert.match(CSS, /\.arte-escena\[data-ajuste="estirable"\]>\.arte-bloque\{flex:1;padding:var\(--borde\)\}/);
        assert.doesNotMatch(CSS, /border-image-slice:[^;}]*fill/, 'sin «fill»: el centro del borde no se pinta');
        continue;
      }
      // el recorte del dibujo: sus agujeros son el hueco del bloque y la banda del rótulo de cada subelemento usado
      const agujeros = agujerosDe(tramo, m.lienzo);
      const rotulos = m.subelementos.map((s) => modelos.bandaDelRotulo(s.hueco, m.rotulo));
      const cerca = (a, b) => ['x', 'y', 'ancho', 'alto'].every((k) => Math.abs(a[k] - b[k]) < 0.1);
      assert.equal(agujeros.length, 1 + rotulos.length, donde);
      assert.ok(cerca(agujeros[0], m.bloque), donde + ': el agujero del bloque');
      rotulos.forEach((r, k) => assert.ok(cerca(agujeros[k + 1], r), donde + ': el agujero del rótulo ' + (k + 1)));
      // lo que pinta (el personaje y los dibujos de los subelementos) no toca ni el bloque ni ningún rótulo, en el lienzo y en pantalla
      const pintan = [m.personaje?.hueco, ...m.subelementos.map((s) => s.hueco)].filter(Boolean);
      const textos = [m.bloque, ...rotulos];
      for (const p of pintan) for (const t of textos) assert.ok(!solapan(p, t), donde + ': un dibujo pisa un texto');
      const area = medidas === ORDENADOR ? ESCENAS[1366][0] : { ancho: ESCENAS[390][0].ancho, alto: (ESCENAS[390][0].ancho * m.lienzo.alto) / m.lienzo.ancho };
      const g = colocarEscena({ ...arte.huecos.tienda, lienzo: m.lienzo }, area, { minimo: medidas === ORDENADOR ? BLOQUE_MINIMO : 0 });
      for (const p of [g.personaje, ...g.subelementos]) for (const t of [g.bloque, ...g.rotulos]) assert.ok(!solapan(p, t), donde + ': en pantalla, un dibujo pisa un texto');
    }
  }
  assert.equal(marcos, 8, 'el 1, el 2, el 3 y el 4, en las dos pantallas');
});

test('los hijos visibles van en los huecos por su orden; si hay más hijos que huecos, los que caben y «+n» en el rótulo del último', async () => {
  const { eje, compra } = await ejemploCompra();
  await animado(eje);
  const a = await arbol({ foco: { X: compra.id, pv: 1 } }, eje, 'huesped', ORDENADOR);
  const r = a.centro.rejilla;
  assert.deepEqual(r.escena.marco.subelementos.map((s) => [s.orden, s.pv, s.rotulo, s.mas]), r.celdas.map((c, k) => [k + 1, c.pv, c.nombre, null]));
  const h = html(a);
  r.celdas.forEach((c, k) => assert.ok(h.includes(`<span class="capa capa-rotulo" data-orden="${k + 1}" style="${['x', 'y', 'an', 'al'].map((v, i) => `--${v}:${[...Object.values(modelos.bandaDelRotulo(r.escena.marco.subelementos[k].hueco, 46))][i]}`).join(';')}" title="${c.nombre}">${c.nombre}</span>`), 'el rótulo ' + (k + 1)));
  // con solo dos huecos en la tienda (una copia del arte), los cuatro hijos del 1: el primero y «+3» en el último
  const dos = arteCambiado((d) => { d.huecos.tienda.subelementos = d.huecos.tienda.subelementos.slice(0, 2); });
  const b = await arbol({ foco: { X: compra.id, pv: 1 } }, eje, 'huesped', ORDENADOR, { arteDeMarco: dos });
  const subs = b.centro.rejilla.escena.marco.subelementos;
  assert.deepEqual(subs.map((s) => [s.orden, s.rotulo, s.mas]), [[1, r.celdas[0].nombre, null], [2, '', r.celdas.length - 1]]);
  assert.match(html(b), new RegExp(`<span class="capa capa-rotulo rotulo-mas" data-orden="2" style="[^"]*" title="\\+${r.celdas.length - 1}">\\+${r.celdas.length - 1}</span>`));
  assert.doesNotMatch(html(b), /data-orden="3"/);
});

test('los rótulos no desbordan: el 0 del subelemento en una línea, algo más pequeño si hace falta (nunca menos de 9 px), cortado con puntos suspensivos; su banda, dentro del dibujo y sin solaparse', async () => {
  const regla = CSS.split('\n').find((l) => l.startsWith('.capa-rotulo{'));
  for (const d of ['overflow:hidden', 'white-space:nowrap', 'text-overflow:ellipsis', 'font-size:clamp(9px,', 'line-height:calc(var(--al) * var(--s))']) assert.ok(regla.includes(d), 'el rótulo: ' + d);
  const { arte } = await modelos.cargarArteDeMarco();
  const t = arte.huecos.tienda;
  const bandas = t.subelementos.map((s) => modelos.bandaDelRotulo(s, t.rotulo));
  for (const [k, b] of bandas.entries()) {
    assert.ok(b.x >= 0 && b.y >= 0 && b.x + b.ancho <= 1536 && b.y + b.alto <= 1024, 'la banda ' + (k + 1) + ', en el lienzo');
    bandas.slice(k + 1).forEach((o) => assert.ok(!solapan(b, o), 'las bandas no se solapan'));
    t.subelementos.forEach((s) => assert.ok(!solapan(b, s), 'la banda no pisa un hueco'));
  }
  // el texto entero queda en su título (se lee al pasar por encima aunque se corte)
  const { eje, compra } = await ejemploCompra();
  await animado(eje);
  const h = html(await arbol({ foco: { X: compra.id, pv: 1 } }, eje, 'huesped', MOVIL));
  for (const m of h.matchAll(/<span class="capa capa-rotulo"[^>]*title="([^"]*)">([^<]*)<\/span>/g)) assert.equal(m[1], m[2]);
});

test('los SVG del paquete externo: sin script, manejadores on*, javascript:, foreignObject, enlaces ni imágenes externas; saneados (sin comentarios) y servidos como data:, nunca en línea; solo los doce SVG y el JSON entran', async () => {
  const VEDADO = /<\s*script\b|\son[a-z]+\s*=|javascript\s*:|<\s*foreignObject\b|\b(xlink:)?href\s*=|<\s*image\b|<\s*use\b|url\(\s*(?!['"]?#)/i;
  const { arte } = await modelos.cargarArteDeMarco();
  const externos = Object.entries(arte.dibujos).filter(([, d]) => d.externo);
  assert.equal(externos.length, 12, 'cuatro tiendas y dos secuencias de cuatro etapas');
  for (const [nombre, d] of externos) {
    const original = leer(d.recurso);
    assert.doesNotMatch(original, VEDADO, nombre + ': limpio en el repositorio');
    assert.match(d.datos, /^data:image\/svg\+xml;base64,[A-Za-z0-9+/]+=*$/, nombre + ': como data:');
    const dentro = Buffer.from(d.datos.split(',')[1], 'base64').toString('utf8');
    assert.equal(dentro, modelos.svgLimpio(original), nombre + ': lo saneado');
    assert.doesNotMatch(dentro, /<!--/, nombre + ': sin comentarios');
    assert.equal(d.formato, 'svg');
  }
  // el saneado rechaza lo que ejecuta o pide fuera
  const base = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1">X</svg>';
  for (const malo of ['<script>alert(1)</script>', '<rect onload="x()"/>', '<a href="javascript:x()"><rect/></a>', '<foreignObject><p/></foreignObject>', '<image href="https://ejemplo.invalid/x.png"/>', '<use xlink:href="#a"/>', '<rect style="fill:url(https://ejemplo.invalid/x)"/>', '<style>@import "x.css";</style>']) {
    assert.equal(modelos.svgLimpio(base.replace('X', malo)), null, malo);
    assert.equal(modelos.svgComoDatos(base.replace('X', malo)), null, malo);
  }
  assert.equal(modelos.svgLimpio('<?xml version="1.0"?><!-- nota --><svg viewBox="0 0 1 1"><rect fill="url(#g)"/></svg>'), '<svg viewBox="0 0 1 1"><rect fill="url(#g)"/></svg>');
  assert.equal(modelos.svgLimpio('<html><svg></svg></html>'), null, 'solo un <svg>');
  // en la carta, en un <img> como data: y nunca en línea
  const { eje, compra } = await ejemploCompra();
  await animado(eje);
  const h = html(await arbol({ foco: { X: compra.id, pv: 1 } }, eje, 'huesped', ORDENADOR));
  assert.ok(h.includes(`<img class="capa capa-marco pieza-imagen" src="${arte.dibujos['tienda-amarillo'].datos}"`));
  assert.doesNotMatch(h, /<svg\b/i, 'nada en línea');
  // del paquete solo entran los SVG (y su colocación, convertida al JSON del modelo) y el LEEME propio del modelo
  const carpeta = (sub) => readdirSync(new URL('arte/general/' + sub, RAIZ)).sort();
  assert.deepEqual(carpeta(''), ['LEEME.md', 'jardin', 'marco-fondo.json', 'parque', 'tiendas']);
  assert.deepEqual(carpeta('tiendas'), ['interior-tienda-amarillo.svg', 'interior-tienda-azul-cian.svg', 'interior-tienda-rojo.svg', 'interior-tienda-verde.svg']);
  for (const m of ['jardin', 'parque']) assert.deepEqual(carpeta(m), ['etapa-1.svg', 'etapa-10.svg', 'etapa-3.svg', 'etapa-5.svg']);
  assert.match(leer('arte/general/LEEME.md'), /arte generado por IA externa, 15-11-2026/);
});

test('el fondo por etapa del jardín (2) y del parque (3): la madurez del foco, reescalada a las etapas 1, 3, 5 y 10, elige la inferior más cercana', async () => {
  const { arte } = await modelos.cargarArteDeMarco();
  const casos = [[1, 15, 1], [2, 10, 1], [3, 10, 3], [4, 10, 3], [11, 15, 5], [9, 10, 5], [10, 10, 10], [15, 15, 10]];
  for (const mundo of [2, 3]) for (const [k, de, etapa] of casos) assert.equal(modelos.fondoDelArte(arte, mundo, k, de).paso, etapa, `${mundo}: ${k} de ${de}`);
  assert.equal(modelos.fondoDelArte(arte, 1, 5, 10), null, 'el 1 no declara fondo: el del modelo');
  // el rango del elemento (contrato.rango) elige la paleta de la tienda: 0-2 amarilla, 3-4 verde, 5-6 azul cian, 7-9 roja
  assert.deepEqual([0, 2, 3, 4, 5, 6, 7, 9].map((r) => modelos.marcoDelArte(arte, 1, r).dibujo), ['tienda-amarillo', 'tienda-amarillo', 'tienda-verde', 'tienda-verde', 'tienda-azul-cian', 'tienda-azul-cian', 'tienda-rojo', 'tienda-rojo']);
});

test('el sobrio no cambia: sin arte ni escena, no lee el arte del modelo, y es el animado sin su arte en los diez PV (1366 × 768 y 390 × 844)', async () => {
  const { eje, compra } = await ejemploCompra();
  const roto = Promise.reject(new Error('el sobrio no lee el arte'));
  roto.catch(() => {});
  const sobrio = {};
  for (const medidas of [ORDENADOR, MOVIL]) {
    for (const pv of PVS) {
      const a = await arbol({ foco: { X: compra.id, pv } }, eje, 'huesped', medidas, { arteDeMarco: roto });
      assert.equal(a.animado, false);
      const h = html(a);
      assert.doesNotMatch(h, /class="[^"]*\bcapa\b|arte-escena|arte-lienzo|arte-bloque|data:image\/svg/, `el ${pv}: el sobrio no lleva arte`);
      sobrio[medidas.ancho + '-' + pv] = h;
    }
  }
  await animado(eje);
  for (const medidas of [ORDENADOR, MOVIL]) {
    for (const pv of PVS) {
      const h = html(await arbol({ foco: { X: compra.id, pv } }, eje, 'huesped', medidas));
      // lo que cambia fuera del arte entre los dos pintados: la marca del pintado (la clase animado) y la preferencia escrita
      const comparable = (x) => x.replace(/ animado\b/g, '').replace(/data-animaciones="\d+"/g, '');
      const sin = comparable(sinArte(h));
      const antes = comparable(sobrio[medidas.ancho + '-' + pv]);
      const centro = (x) => x.slice(x.indexOf('<section class="nucleo'), x.indexOf('</section>', x.indexOf('<section class="nucleo')));
      assert.equal(centro(sin), centro(antes), `el ${pv} a ${medidas.ancho}: el centro, igual sin el arte`);
    }
  }
});
