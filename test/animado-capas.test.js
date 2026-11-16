// El animado sobre el sobrio (VG, 11-11) con el arte en sus dos sitios (VG 14-11, #94): «el arte animado tiene DOS sitios
// y nada más»: el FONDO del mundo, detrás de todo, y el MARCO del elemento, que rodea su bloque de campos sin cubrirlo.
// Quitar del HTML animado el arte (los nodos de clase `capa` y la escena que envuelve el bloque: test/ayudas-arte.js) da
// exactamente el HTML sobrio: el contenido y su orden son los mismos; lo único que cambia es la distancia (CSS). Las capas
// de antes (la etapa, el dibujo de cada hijo, el personaje entre celdas, los efectos y el marco de esquinas) ya no
// existen. Qué dibujo va en el hueco de un subelemento es un dato: la correspondencia del tipo elemento en la cabecera de
// los modelos (epoch.9.7.0.4), leída con modelos.corresponde. Los huecos del marco y su geometría: test/arte-marco-fondo.test.js.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { arbol, preferencias, ampliarTodos, medidasDePantalla, NIVEL } from '../carta/carta.js';
import { html, trasPintar } from '../carta/dom.js';
import * as C from '../src/contrato.js';
import * as modelos from '../src/modelos.js';
import { EPOCA_0_BTML } from '../src/epocas.js';
import { ejemploCompra } from '../ejemplos/ikisai/compra-food.mjs';
import { pagaElCoste } from './ayudas-coste.js';
import { sinCapas, sinArte } from './ayudas-arte.js';

const GRANDE = { ancho: 1920, alto: 1080 };
const MUNDOS = [1, 2, 3, 4, 6, 7, 8, 9];
const T1 = '2026-11-08T10:00:00Z';
const minuto = (de) => pagaElCoste(de);
const CSS = readFileSync(new URL('../carta/estilo.css', import.meta.url), 'utf8');

/** Las filas que VG fijó (11-11): por dado, el nombre del elemento en cada mundo. */
const FILAS = {
  hijo: { 1: 'tienda', 2: 'parterre', 3: 'estanque', 4: 'estacion', 8: 'constelacion', 9: 'hito' },
  ocupante: { 1: 'mercancia', 2: 'flor', 3: 'paquete', 4: 'pieza', 6: 'cuenta-pasado', 7: 'cuenta-futuro', 8: 'estrella', 9: 'paso' },
  vacio: { 8: 'polvo' },
  actual: { 9: 'puerta' },
  hecho: { 4: 'sello' },
  repetido: { 6: 'cuenta-ciclo' },
  persona: { 3: 'bano' },
  cerrado: { 3: 'verja' },
};
/** El marco que el arte del modelo general declara para cada mundo (arte/general/marco-fondo.json); sin él, solo fondo. */
const MARCOS = { 1: 'tienda-amarillo', 2: 'marco-jardin', 3: 'marco-parque', 4: 'marco-fabrica' };

/** La huésped en animado con el modelo de la fase 2 (general): la cadena lo trae delante del genérico y del sobrio. */
async function animado(eje, quien = 'huesped') {
  const p = preferencias(eje, quien, { render: 'animated', model: 'general' });
  await eje.escribir({ autor: quien, sobre: p.sobre, en: p.en, t: T1, movimientos: [minuto(quien)], payload: p.payload });
}

/** Una compra con una «Carpeta» colgada (1 → «Nota» → «Hoja»), para bajar al nivel 2. */
async function conCarpeta() {
  const { eje, compra } = await ejemploCompra();
  const hoja = await eje.escribir({ autor: 'casa', sobre: compra.id, t: '2026-11-08T09:00:00Z', movimientos: [minuto('casa')], payload: [['Hoja']] });
  const nota = await eje.escribir({ autor: 'casa', sobre: compra.id, t: '2026-11-08T09:01:00Z', movimientos: [minuto('casa')], payload: [['Nota'], [{ ref: hoja.id }]] });
  const carpeta = await eje.escribir({ autor: 'casa', sobre: compra.id, t: '2026-11-08T09:02:00Z', movimientos: [minuto('casa')], payload: [['Carpeta'], [{ ref: nota.id }]] });
  return { eje, compra, hoja, nota, carpeta };
}

/** El centro abierto a pantalla completa, sin su etiqueta de apertura: de la cabecera del mundo al final del mapa. */
const centroDe = (h) => {
  const desde = h.indexOf('<header class="nucleo-cabeza"');
  const hasta = h.indexOf('<nav class="vecinos"', desde);
  assert.ok(desde > 0 && hasta > desde, 'pantalla completa');
  return h.slice(desde, hasta);
};

/** Las capas que ya no existen (VG 14-11, #94): ni sus clases ni sus nodos. */
const RETIRADAS = /pieza-etapa|capa-etapa|capa-dibujo|dibujo-hijo|dibujo-ocupante|capa-ocupante|capa-elemento|pieza-elemento|capa-efectos|pieza-efecto|marco-esquina|pieza-marco|class="escenario/;

test('sinArte quita cada nodo .capa entero y desenvuelve la escena, y nada más', () => {
  const h = '<div class="a"><img class="pieza capa x" src="./a.svg"><p>hola</p><div class="capa capa-sub"><div><img src="b"></div></div><span class="capaz">sí</span></div>';
  assert.equal(sinCapas(h), '<div class="a"><p>hola</p><span class="capaz">sí</span></div>');
  const e = '<div class="r"><div class="arte-escena" data-ajuste="fijo" style="--lw:1"><div class="arte-lienzo"><img class="capa capa-marco" src="x"><span class="capa capa-rotulo">uno</span><div class="arte-bloque"><div class="b"><p>dentro</p></div></div></div></div><p>fuera</p></div>';
  assert.equal(sinArte(e), '<div class="r"><div class="b"><p>dentro</p></div><p>fuera</p></div>');
});

test('la correspondencia del elemento es un dato de la cabecera (epoch.9.7.0.4): una fila por dado, sus claves emparejadas con sus mundos, y se lee con modelos.corresponde', () => {
  const tipo = EPOCA_0_BTML.registro[9][7][0][4].find((t) => t[0][0] === 'elemento');
  const filas = tipo[2];
  assert.ok(filas.length <= 10, 'una décupla');
  assert.deepEqual(filas.map((f) => f[0][0]), Object.keys(FILAS));
  for (const f of filas) assert.equal(f[1].length, f[2].length, 'cada clave con su mundo: ' + f[0][0]);
  const c = modelos.cabecera();
  for (const [dado, porMundo] of Object.entries(FILAS)) {
    for (const pv of MUNDOS) {
      const esperado = porMundo[pv] ?? dado; // sin fila, lo dado tal cual: la carta no dibuja nada
      assert.equal(modelos.corresponde(c, 'elemento', dado, pv), esperado, dado + ' en el ' + pv);
    }
  }
  assert.equal(modelos.rolPorDefecto(c, 'munequito', 1), 'vendedor');
  const general = modelos.modelosDeLaEpoca().find((m) => m.nombre === 'general');
  for (const porMundo of Object.values(FILAS)) {
    for (const [pv, nombre] of Object.entries(porMundo)) assert.ok(general.piezas.some((p) => p.tipo === 'elemento' && p.pv === Number(pv) && p.subclave === nombre), nombre + ' en el ' + pv);
  }
});

test('el mismo contenido en el mismo orden: en la pantalla completa de los ocho mundos y en el nivel 2 del 1, del 2 y del 3, quitar del animado el arte da exactamente el sobrio', async () => {
  const { eje, compra, nota } = await conCarpeta();
  const casos = [...MUNDOS.map((pv) => ({ pv, estado: { foco: { X: compra.id, pv } } })), ...[1, 2, 3].map((pv) => ({ pv, nivel: 2, estado: { foco: { X: compra.id, pv }, profundidad: { [pv]: [nota.id] } } }))];
  const sobrio = [];
  for (const k of casos) {
    const a = await arbol(k.estado, eje, 'huesped', GRANDE);
    assert.equal(a.animado, false);
    assert.equal(a.centro.rejilla.nivel, k.nivel ?? 1);
    const h = centroDe(html(a));
    assert.doesNotMatch(h, /class="[^"]*\bcapa\b|arte-escena/, 'el sobrio no lleva arte');
    sobrio.push(h);
  }
  await animado(eje);
  for (const [i, k] of casos.entries()) {
    const a = await arbol(k.estado, eje, 'huesped', GRANDE);
    assert.equal(a.animado, true);
    const h = centroDe(html(a));
    const donde = `mundo ${k.pv}${k.nivel ? ', nivel 2' : ''}`;
    assert.match(h, /class="[^"]*\bcapa\b[^"]*capa-fondo/, donde + ': el fondo');
    assert.doesNotMatch(h, RETIRADAS, donde + ': ninguna de las capas retiradas');
    assert.equal(sinArte(h), sobrio[i], donde + ': el animado es el sobrio con su arte alrededor');
  }
});

test('los dos sitios de cada mundo a pantalla completa: el fondo, lo primero de la rejilla; el marco que declara el arte, alrededor del bloque (en el 1, la tienda con su personaje y sus subelementos)', async () => {
  const { eje, compra } = await ejemploCompra();
  await animado(eje);
  const { arte } = await modelos.cargarArteDeMarco();
  const madurez = C.madurez(eje, compra.id);
  for (const pv of MUNDOS) {
    const a = await arbol({ foco: { X: compra.id, pv } }, eje, 'huesped', GRANDE);
    const r = a.centro.rejilla;
    const h = centroDe(html(a));
    // 1 · el fondo: el del arte si lo declara (el jardín y el parque por etapa), si no el del modelo; lo primero de la rejilla
    const delArte = modelos.fondoDelArte(arte, pv, madurez.nivel, madurez.de);
    assert.ok(r.escena.fondo?.recurso, 'fondo del ' + pv);
    if (delArte) assert.deepEqual([r.escena.fondo.recurso, r.escena.fondo.ajuste], [delArte.recurso, 'contener'], 'el fondo del arte en el ' + pv);
    else assert.ok(r.escena.fondo.recurso.includes('/fondo/'), 'el fondo del modelo en el ' + pv);
    assert.match(h, new RegExp(`<div class="rejilla rejilla-completa"[^>]*><img class="pieza capa pieza-fondo capa-fondo ajuste-${r.escena.fondo.ajuste} pieza-imagen" src="`), 'el fondo es lo primero de la rejilla del ' + pv);
    // 2 · el marco: el que declara el arte para el mundo, o ninguno
    assert.equal(r.escena.marco?.dibujo ?? null, MARCOS[pv] ?? null, 'el marco del ' + pv);
    if (!MARCOS[pv]) { assert.doesNotMatch(h, /arte-escena|capa-marco|capa-personaje|capa-sub/, 'sin marco, solo el fondo: ' + pv); continue; }
    assert.equal((h.match(/class="arte-escena"/g) ?? []).length, 1, 'una escena');
    if (r.escena.marco.ajuste === 'fijo') {
      // el personaje del mundo en su zona: el del rol por defecto, esperando en bucle
      const p = r.escena.marco.personaje;
      assert.deepEqual([p.rol, p.accion, p.animar], [modelos.rolPorDefecto(modelos.cabecera(), 'munequito', pv), 'esperar', 'bucle']);
      assert.deepEqual(p.hueco, arte.huecos.tienda.personaje);
      assert.match(h, /<div class="capa capa-personaje" style="--x:75;--y:161;--an:390;--al:742"[^>]*><img class="pieza respaldo pieza-imagen" src="[^"]+-base-[^"]+\.svg"[^>]*><div class="pieza pieza-personaje accion-esperar pieza-lottie"/, 'en su zona, con su dibujo quieto detrás (si Lottie no carga)');
      // los subelementos: los hijos de la rejilla, en su orden, uno por hueco, con su rótulo (su nombre) y su dibujo
      const celdas = r.celdas;
      assert.deepEqual(r.escena.marco.subelementos.map((s) => s.rotulo), celdas.map((c) => c.nombre).slice(0, 5));
      r.escena.marco.subelementos.forEach((s, k) => {
        assert.deepEqual(s.hueco, arte.huecos.tienda.subelementos[k], 'el hueco ' + (k + 1));
        const lista = celdas[k].ocupantes ?? [];
        if (lista.length) assert.equal(s.dibujo?.subclave, FILAS.ocupante[pv], 'el dibujo del ocupante del mundo en el hueco ' + (k + 1));
        else assert.equal(s.dibujo, null, 'un hijo vacío fuera del cielo, sin dibujo');
      });
      for (const dado of ['actual', 'repetido', 'cerrado']) assert.ok(!r.escena.marco.subelementos.some((s) => s.dibujo?.subclave === FILAS[dado][pv]), `lo que el núcleo no da (${dado}) no se dibuja`);
    } else {
      assert.equal(r.escena.marco.personaje, null, 'un marco estirable no tiene zona de personaje');
      assert.match(h, new RegExp(`<div class="arte-escena" data-ajuste="estirable" data-dibujo="${MARCOS[pv]}" style="[^"]*"><div class="capa capa-marco" aria-hidden="true" style="border-image-source:url\\('\\./arte/fase2/[^']+'\\)"></div><div class="arte-bloque">`));
    }
  }
});

test('las capas no ocupan el sitio del texto ni reciben el ratón; su geometría sale de los números del dibujo, nunca de datos del eje', () => {
  assert.match(CSS, /\.capa\{pointer-events:none\}/);
  for (const sel of ['.rejilla-completa>.capa-fondo,.nucleo.abierto>.capa-fondo', '.pv>.capa-fondo', '.arte-lienzo>*', '.arte-escena[data-ajuste="estirable"]>.capa-marco']) {
    const regla = CSS.split('\n').find((l) => l.startsWith(sel + '{'));
    assert.ok(regla && regla.includes('position:absolute'), sel);
  }
  assert.match(CSS, /\.rejilla-completa>\.capa-fondo,\.nucleo\.abierto>\.capa-fondo\{[^}]*z-index:-1/, 'el fondo, detrás de todo');
  assert.match(CSS, /\.arte-lienzo>\.arte-bloque\{[^}]*z-index:2/, 'el bloque, encima del dibujo');
  assert.match(CSS, /\.capa-personaje\[data-sitio\]\{pointer-events:auto/, 'el personaje abre su sitio (#38)');
  // Lo que se cambia del sobrio en animado (fuera del arte) solo es color, fondo y sombra.
  const delSobrio = CSS.split('\n').filter((l) => l.startsWith('.animado .rejilla-completa') && !/capa/.test(l));
  assert.ok(delSobrio.length > 5);
  for (const l of delSobrio) {
    const decl = l.slice(l.indexOf('{') + 1, l.lastIndexOf('}')).split(';').filter(Boolean).map((d) => d.split(':')[0].trim());
    for (const p of decl) assert.ok(['background', 'box-shadow', 'color', 'text-shadow', 'border-bottom-color', 'border-radius', 'isolation', 'position'].includes(p), `${p} en ${l.slice(0, 80)}`);
  }
  // Ninguna regla de las capas retiradas queda en la hoja.
  assert.doesNotMatch(CSS, /\.escenario\b|capa-dibujo|capa-etapa|marco-esquina|capa-efectos|capa-elemento|capa-ocupante|pieza-elemento/);
  // La geometría del arte no viene de datos del eje: cssSeguro no deja pasar position, z-index, transform ni animation.
  assert.equal(C.cssSeguro('position:absolute;z-index:3;transform:translateX(-50%);animation:x 1s'), '');
});

test('sin red, el personaje cae a su dibujo quieto sin error: trasPintar marca el Lottie sin-lottie y el CSS enseña el respaldo; con «reducir movimiento», nada se reproduce', async () => {
  const hueco = (animar = '1') => ({ dataset: { lottie: 'arte/x.json', animar, bucle: '1', prioridad: '1' }, classList: { clases: new Set(), add(c) { this.clases.add(c); } }, isConnected: true });
  const h = hueco();
  const raiz = { querySelectorAll: () => [h], querySelector: () => null };
  const parar = trasPintar(raiz, { lottie: undefined });
  assert.equal(typeof parar, 'function');
  assert.ok(h.classList.clases.has('sin-lottie'));
  assert.match(CSS, /\.capa-personaje:has\(\.sin-lottie\) \.respaldo,\.capa-personaje:has\(\.pieza-lottie:empty\) \.respaldo\{display:block\}/);
  assert.match(CSS, /\.capa-personaje \.sin-lottie\{display:none\}/);
  const antes = globalThis.matchMedia;
  const fetchAntes = globalThis.fetch;
  globalThis.matchMedia = (q) => ({ matches: q.includes('reduce') });
  globalThis.fetch = async () => ({ ok: true, json: async () => ({}) });
  try {
    let reproducidas = 0;
    const lottie = { loadAnimation: () => ({ addEventListener: (ev, f) => { if (ev === 'DOMLoaded') setTimeout(f, 0); }, goToAndStop() {}, play() { reproducidas++; }, totalFrames: 10, isPaused: true }) };
    const otro = hueco();
    trasPintar({ querySelectorAll: () => [otro], querySelector: () => null }, { lottie, limite: 5 });
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(reproducidas, 0);
  } finally {
    globalThis.matchMedia = antes;
    globalThis.fetch = fetchAntes;
  }
});

/** Las secciones de los PV laterales del HTML de la carta, por PV: de `<section class="pv pv-N ` a su cierre. */
function seccionesDe(h) {
  const fuera = {};
  const re = /<section class="pv pv-(\d) /g;
  let m;
  while ((m = re.exec(h))) {
    const etiquetas = /<(\/?)section\b[^>]*>/g;
    etiquetas.lastIndex = m.index;
    let n = 0;
    let e;
    while ((e = etiquetas.exec(h))) {
      n += e[1] ? -1 : 1;
      if (n === 0) break;
    }
    fuera[m[1]] = h.slice(m.index, e.index + e[0].length);
  }
  return fuera;
}

test('Mapped en bloque y en tarjeta: el animado es el sobrio con el fondo del mundo detrás (en bloque); nada más de arte, ni marco ni muñequito ni dibujos', async () => {
  const { eje, compra } = await ejemploCompra();
  const pantallas = { 'el ordenador (1366 × 768)': medidasDePantalla(1366, 728), 'el móvil apaisado (844 × 390)': medidasDePantalla(844, 350), 'la pantalla grande': GRANDE };
  const bloques = ampliarTodos(ampliarTodos({}, +1), +1);
  const tarjetas = ampliarTodos({}, +1);
  const casos = Object.entries(pantallas).flatMap(([que, m]) => [[que + ', en bloque', m, bloques], [que + ', en tarjeta', m, tarjetas]]);
  const sobrio = [];
  for (const [que, m, niveles] of casos) {
    const a = await arbol({ foco: { X: compra.id, pv: 0 }, ...niveles }, eje, 'huesped', m);
    assert.equal(a.animado, false);
    assert.equal(a.apilada, false, que + ': Mapped');
    const s = seccionesDe(html(a));
    assert.equal(Object.keys(s).length, MUNDOS.length, que);
    for (const h of Object.values(s)) assert.doesNotMatch(h, /class="[^"]*\bcapa\b/, 'el sobrio no lleva capas');
    sobrio.push(s);
  }
  await animado(eje);
  let fondos = 0;
  for (const [i, [que, m, niveles]] of casos.entries()) {
    const a = await arbol({ foco: { X: compra.id, pv: 0 }, ...niveles }, eje, 'huesped', m);
    assert.equal(a.animado, true);
    const s = seccionesDe(html(a));
    for (const n of a.laterales) {
      const h = s[n.pv];
      const donde = `${que}, el ${n.pv}`;
      assert.equal(sinArte(h), sobrio[i][n.pv], donde + ': el animado es el sobrio con su arte');
      assert.doesNotMatch(h, RETIRADAS, donde + ': ninguna capa retirada');
      assert.doesNotMatch(h, /capa-personaje|capa-marco|capa-sub|arte-escena/, donde + ': el marco es de la pantalla completa');
      if (n.nivel >= NIVEL.bloque) {
        assert.match(h, new RegExp(`^<section [^>]*><img class="pieza capa pieza-fondo capa-fondo ajuste-${n.fondo.ajuste} pieza-imagen" src="`), donde + ': el fondo, lo primero del bloque');
        fondos++;
      } else assert.doesNotMatch(h, /capa-fondo/, donde + ': en tarjeta, sin fondo');
    }
  }
  assert.ok(fondos > 10, 'los bloques llevan su fondo: ' + fondos);
});

/** La columna de Sequenced del HTML de la carta: el pasado, la tarjeta del foco con sus filas y el futuro. */
const secuenciaDe = (h) => {
  const desde = h.indexOf('<div class="secuencia" data-secuencia>');
  const hasta = h.indexOf('<nav class="digitos"', desde);
  assert.ok(desde > 0 && hasta > desde, 'Sequenced');
  return h.slice(desde, hasta);
};

test('Sequenced en animado: la columna es la del sobrio con el fondo atenuado de cada fila abierta; sin muñequitos, sin movimientos, sin dibujos junto al texto y nada flotando', async () => {
  const { eje, compra, nota } = await conCarpeta();
  await eje.escribir({ autor: 'huesped', sobre: compra.id, en: '6000000000', t: T1, movimientos: [minuto('huesped')], payload: ['antes'] });
  await eje.escribir({ autor: 'huesped', sobre: compra.id, en: '7000000000', t: T1, movimientos: [minuto('huesped')], payload: ['después'] });
  const pantallas = { 'el móvil (390 × 844)': medidasDePantalla(390, 844), 'el móvil pequeño (360 × 800)': medidasDePantalla(360, 800) };
  const abiertas = Object.fromEntries([0, 1, 2, 3, 4, 5, 8, 9].map((pv) => [pv, NIVEL.bloque]));
  const estados = {
    'todas abiertas': { foco: { X: compra.id, pv: 0 }, niveles: abiertas },
    'el 1 en su nivel 2': { foco: { X: compra.id, pv: 0 }, niveles: { 1: NIVEL.bloque, 3: NIVEL.bloque }, profundidad: { 1: [nota.id] } },
  };
  const casos = Object.entries(pantallas).flatMap(([que, m]) => Object.entries(estados).map(([cual, estado]) => [`${que}, ${cual}`, m, estado]));
  const sobrio = [];
  for (const [que, m, estado] of casos) {
    const a = await arbol({ ...estado, nuevos: new Set() }, eje, 'huesped', m);
    assert.equal(a.apilada, true, que + ': Sequenced');
    const h = secuenciaDe(html(a));
    assert.doesNotMatch(h, /class="[^"]*\bcapa\b/, 'el sobrio no lleva capas');
    sobrio.push(h);
  }
  await animado(eje);
  for (const [i, [que, m, estado]] of casos.entries()) {
    const a = await arbol({ ...estado, nuevos: new Set() }, eje, 'huesped', m);
    assert.equal(a.animado, true);
    const h = secuenciaDe(html(a));
    assert.match(h, /capa-fondo/, que + ': el fondo de las filas abiertas');
    assert.equal(sinArte(h), sobrio[i], que + ': el animado es el sobrio con su arte');
    assert.doesNotMatch(h, RETIRADAS, que);
    assert.doesNotMatch(h, /pieza-personaje|capa-personaje|capa-marco|arte-escena/, que + ': ni muñequitos ni marcos en la columna');
  }
  const opacidad = Number(/\.fila-contenido>\.pv>\.capa-fondo\{opacity:([\d.]+);/.exec(CSS)?.[1]);
  assert.ok(opacidad > 0 && opacidad <= 0.3, 'el fondo de la fila, atenuado: ' + opacidad);
  assert.match(CSS, /\.fila-contenido>\.pv>\.capa-fondo\{[^}]*bottom:auto;height:112px;object-position:50% 0;[^}]*mask-image:linear-gradient\(to bottom,#000 \d+%,transparent\)/, 'solo una banda arriba, con degradado');
});

test('Sequenced, un PV abierto como foco en el móvil en vertical: la escena rodea su lista de ocupantes (la tienda en el 1, el borde en el 2, el 3 y el 4, solo el fondo en el 8 y el 9); sin el arte es el sobrio', async () => {
  const { eje, compra } = await conCarpeta();
  const pantallas = { 'el móvil (390 × 844)': medidasDePantalla(390, 844), 'el móvil pequeño (360 × 800)': medidasDePantalla(360, 800) };
  const casos = Object.entries(pantallas).flatMap(([que, m]) => [1, 2, 3, 4, 8, 9].map((pv) => [`${que}, el ${pv} como foco`, m, pv]));
  const sobrio = [];
  for (const [que, m, pv] of casos) {
    const a = await arbol({ foco: { X: compra.id, pv }, nuevos: new Set() }, eje, 'huesped', m);
    assert.equal(a.apilada, true, que + ': Sequenced');
    const h = secuenciaDe(html(a));
    assert.match(h, /<section class="nucleo abierto/, que);
    assert.doesNotMatch(h, /class="[^"]*\bcapa\b|arte-escena/, 'el sobrio no lleva arte');
    sobrio.push(h);
  }
  await animado(eje);
  for (const [i, [que, m, pv]] of casos.entries()) {
    const a = await arbol({ foco: { X: compra.id, pv }, nuevos: new Set() }, eje, 'huesped', m);
    assert.equal(a.centro.escena?.marco?.dibujo ?? null, MARCOS[pv] ?? null, que + ': el marco del mundo');
    assert.ok(a.centro.escena.fondo?.recurso, que + ': el fondo');
    const h = secuenciaDe(html(a));
    assert.doesNotMatch(h, RETIRADAS, que);
    assert.equal((h.match(/class="arte-escena"/g) ?? []).length, MARCOS[pv] ? 1 : 0, que);
    if (MARCOS[pv]) assert.match(h, /<div class="arte-bloque"><ul class="ocupantes /, que + ': la lista, en el hueco del bloque');
    assert.equal(sinArte(h), sobrio[i], que + ': el animado es el sobrio con su arte');
  }
});

// ---------- #25: el arte propio de un elemento, en los dos sitios ----------

/** El icono propio del menú: una pieza «elemento» anclada por su autor en su 5, que sirve en todos los mundos («*»). */
const ICONO_PROPIO = 'arte/fase2/bloque-0/biblioteca/jardin/elemento/fruto-intermedio.svg';
async function menuConIcono() {
  const { eje, compra, menu } = await ejemploCompra();
  const autor = eje.obtener(menu.id).autor;
  await eje.escribir({ autor, sobre: menu.id, en: '5000000000', t: '2026-11-08T09:30:00Z', movimientos: [minuto(autor)], payload: [['elemento'], [0, 'svg'], ['*'], ['centro'], ['once', 1], ['*'], [ICONO_PROPIO, 'prueba: el arte propio del menú']] });
  return { eje, compra, menu };
}
/** El pintado de la huésped: un valor de la enumeración de la época (epoch.9.3.2), por su posición. */
async function pintado(eje, k, quien = 'huesped') {
  const valores = C.clavesDeConfiguracion().find((c) => c.valores?.length >= 3).valores;
  const p = preferencias(eje, quien, { render: valores[k] });
  await eje.escribir({ autor: quien, sobre: p.sobre, en: p.en, t: T1, movimientos: [minuto(quien)], payload: p.payload });
  return valores[k];
}

test('#25: el arte propio de un registro va primero: el menú con su icono se ve en el hueco de su hijo en la tienda del 1 (todo); en propio no hay arte general (ni fondo ni marco); en sobrio, nada', async () => {
  const { eje, compra, menu } = await menuConIcono();
  assert.deepEqual(modelos.modelo(eje, 'huesped', { elemento: menu.id }).map((m) => m.nombre ?? 'propio'), ['propio', 'general', 'animado-generico', 'sobrio'], 'la cadena: lo propio, luego la de quien mira');
  // todo (el último de la enumeración): el retrato del menú en el hueco de la celda donde está, y el arte general alrededor
  await pintado(eje, 2);
  const b = await arbol({ foco: { X: compra.id, pv: 1 } }, eje, 'huesped', GRANDE);
  const r = b.centro.rejilla;
  const k = r.celdas.findIndex((c) => (c.ocupantes ?? []).some((o) => o.X === menu.id));
  assert.ok(k >= 0, 'el menú es un ocupante de una celda del 1');
  const sub = r.escena.marco.subelementos[k];
  assert.equal(sub.dibujo?.recurso, ICONO_PROPIO, 'su retrato en el hueco de su hijo');
  assert.equal(sub.dibujo.origen, menu.id);
  assert.ok(html(b).includes(`<img class="pieza sub-dibujo pieza-imagen" src="./${ICONO_PROPIO}"`), 'pintado en su hueco');
  assert.ok(r.escena.fondo?.recurso && r.escena.marco.personaje, 'en todo, el fondo y el personaje generales siguen');
  // propio (el de en medio): solo lo propio de cada elemento; el general (fondo, marco, personaje), apagado
  await pintado(eje, 1);
  const p = await arbol({ foco: { X: compra.id, pv: 1 } }, eje, 'huesped', GRANDE);
  assert.equal(p.animado, true);
  assert.deepEqual(p.centro.rejilla.escena, { fondo: null, marco: null }, 'sin fondo ni marco generales');
  assert.ok(!/class="[^"]*capa (pieza-fondo|capa-marco|capa-personaje)/.test(html(p)), 'en el HTML tampoco');
  // sobrio (el primero, el defecto): nada de arte, ni el propio
  await pintado(eje, 0);
  const s = await arbol({ foco: { X: compra.id, pv: 1 } }, eje, 'huesped', GRANDE);
  assert.equal(s.animado, false);
  assert.ok(!html(s).includes(ICONO_PROPIO), 'en sobrio no se pinta ni lo propio');
});

test('#25: lo que otro ancla en un registro no es su arte propio; un adjunto «archivo:<sha256>» se lee y la carta lo resuelve con lo que instala la app', async () => {
  const { eje, compra, menu } = await ejemploCompra();
  const autor = eje.obtener(menu.id).autor;
  const ajeno = autor === 'huesped' ? 'casa' : 'huesped';
  await eje.escribir({ autor: ajeno, sobre: menu.id, en: '5000000000', t: '2026-11-08T09:30:00Z', movimientos: [minuto(ajeno)], payload: [['elemento'], [0, 'svg'], ['*'], ['centro'], ['once', 1], ['*'], [ICONO_PROPIO]] });
  assert.equal(modelos.propio(eje, menu.id), null, 'la pieza anclada por otro no cuenta');
  const sha = 'ab'.repeat(32);
  await eje.escribir({ autor, sobre: menu.id, en: '5000000000', t: '2026-11-08T09:31:00Z', movimientos: [minuto(autor)], payload: [['elemento'], [0, 'image'], ['*'], ['centro'], ['once', 1], ['*'], ['archivo:' + sha]] });
  assert.equal(modelos.propio(eje, menu.id).piezas[0].recurso, 'archivo:' + sha);
  await pintado(eje, 2);
  const a = await arbol({ foco: { X: compra.id, pv: 1 } }, eje, 'huesped', GRANDE);
  const { srcDeRecurso, resolverArchivos } = await import('../carta/dom.js');
  assert.ok(a.centro.rejilla.escena.marco.subelementos.some((s) => s.dibujo?.recurso === 'archivo:' + sha));
  assert.ok(!html(a).includes('archivo:'), 'sin resolutor (la app no lo ha instalado), el adjunto no se pinta');
  resolverArchivos((id) => 'https://ejemplo.invalid/archivos/' + id);
  try {
    assert.equal(srcDeRecurso('archivo:' + sha), 'https://ejemplo.invalid/archivos/' + sha);
    assert.ok(html(a).includes('src="https://ejemplo.invalid/archivos/' + sha + '"'), 'con resolutor, su URL');
    assert.equal(srcDeRecurso('arte/x.svg'), './arte/x.svg');
    resolverArchivos(() => 'javascript:alert(1)');
    assert.equal(srcDeRecurso('archivo:' + sha), null, 'el resolutor solo puede dar http(s) o blob');
  } finally {
    resolverArchivos(null);
  }
});
