// Ayudas de las pruebas del arte animado (VG 14-11, #94: el arte tiene dos sitios, el fondo y el marco). El animado es el
// sobrio con el arte alrededor: nodos de clase `capa` (el fondo, el dibujo del marco, el personaje, los dibujos y los
// rótulos de los subelementos) y, a pantalla completa, la escena que envuelve el bloque de campos (.arte-escena,
// .arte-lienzo, .arte-bloque). Quitar las capas y desenvolver la escena da el sobrio exacto: el contenido y su orden
// son los mismos; solo cambia la distancia (estilo.css).

const VACIOS = new Set(['img', 'br', 'input', 'meta', 'link', 'hr', 'source', 'wbr']);
const ENVOLTURAS = new Set(['arte-escena', 'arte-lienzo', 'arte-bloque']);
const RE_ETIQUETA = /<(\/?)([a-zA-Z][\w-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
const clasesDe = (attrs) => (/\bclass="([^"]*)"/.exec(attrs)?.[1] ?? '').split(/\s+/);

/** El HTML sin ningún nodo de clase `capa` (o la que se diga), con todo lo que lleva dentro. */
export function sinCapas(h, quitar = 'capa') {
  const re = new RegExp(RE_ETIQUETA.source, 'g');
  let fuera = '';
  let desde = 0;
  let saltando = null;
  let m;
  while ((m = re.exec(h))) {
    const [todo, cierre, nombre, attrs] = m;
    const tag = nombre.toLowerCase();
    if (saltando) {
      if (tag === saltando.tag && !VACIOS.has(tag)) saltando.n += cierre ? -1 : 1;
      if (saltando.n === 0) { saltando = null; desde = m.index + todo.length; }
      continue;
    }
    if (!cierre && clasesDe(attrs).includes(quitar)) {
      fuera += h.slice(desde, m.index);
      if (VACIOS.has(tag)) desde = m.index + todo.length;
      else saltando = { tag, n: 1 };
    }
  }
  return fuera + (saltando ? '' : h.slice(desde));
}

/** El HTML sin las envolturas de la escena (.arte-escena, .arte-lienzo, .arte-bloque): su etiqueta de apertura y su cierre, no lo de dentro. */
export function sinEscena(h) {
  const re = new RegExp(RE_ETIQUETA.source, 'g');
  const pila = [];
  const quitar = [];
  let m;
  while ((m = re.exec(h))) {
    const [todo, cierre, nombre, attrs] = m;
    const tag = nombre.toLowerCase();
    if (VACIOS.has(tag)) continue;
    if (!cierre) {
      const envuelve = clasesDe(attrs).some((c) => ENVOLTURAS.has(c));
      pila.push({ envuelve });
      if (envuelve) quitar.push([m.index, m.index + todo.length]);
    } else {
      const abierto = pila.pop();
      if (abierto?.envuelve) quitar.push([m.index, m.index + todo.length]);
    }
  }
  let fuera = '';
  let desde = 0;
  for (const [a, b] of quitar.sort((x, y) => x[0] - y[0])) { fuera += h.slice(desde, a); desde = b; }
  return fuera + h.slice(desde);
}

/** El HTML sin el arte: sin capas y sin las envolturas de la escena. */
export const sinArte = (h) => sinEscena(sinCapas(h));
