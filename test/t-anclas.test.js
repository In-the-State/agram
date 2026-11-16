// T, el sistema de las anclas (encargo A18; VG 16-11, state/ANCLAJE_EN_CASCADA.md §7.8; agram-equipo/T_Y_CASCADA_2026-11-16.md):
// la escala del T real que quema el autor de un registro elige lo que pide (nivel y plazo); las lecturas «asked» y «on
// time» de la época 0 (no se materializan: su 3 es X); contrato.firmeza con `pedidos` (propio, colgado, suelo) y `plazo`;
// contrato.pedidoDeLote; contrato.plazoDeSuelo; la plantilla «ask for more firmness»; y la prueba mejor que sustituye a la
// anterior en eje.marcarSello. Claves de prueba, generadas en cada ejecución; datos inventados.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contrato, acciones as A, salida } from '../src/index.js';
import { Eje, nivelesDeSello } from '../src/eje.js';
import { leerRegla, posicionDeLectura } from '../src/bqlm.js';
import { ContextoEje } from '../src/contexto-eje.js';
import { EPOCA_0_BTML } from '../src/epocas.js';
import * as anclas from '../src/anclas.js';
import { pagaElCoste } from './ayudas-coste.js';
import { selloEnCascada, selloCompleto, observadorDePrueba, releDePrueba, reciboFirmado, declararExterior } from './ayudas-sello.js';

const T = (m) => '2026-11-10T10:' + String(m).padStart(2, '0') + ':00Z';
const S = (iso) => Math.floor(Date.parse(iso) / 1000);
const iso = (s) => new Date(s * 1000).toISOString().replace('.000Z', 'Z');
const regla = (nombre) => EPOCA_0_BTML.lecturas.find((r) => r[0][0] === nombre);
const lectura = (eje, id, nombre) => { const r = leerRegla(regla(nombre), id, new ContextoEje(eje, { epoch: EPOCA_0_BTML })); return [r.estado, r.valor]; };

/** Un eje de demostración con el observador declarado; `escribe(escalas, t)` escribe un registro que paga su coste quemando una unidad de cada escala que cubra el coste. */
async function demo() {
  const obs = await observadorDePrueba();
  const eje = await Eje.genesis({ demostracion: true, identidad: 'g', t: T(0), foco: 'raíz' });
  await declararExterior(eje, { observadores: [obs.publica], t: T(1) });
  const escribe = (escalas, t, payload = ['un registro']) => eje.escribir({ autor: 'g', sobre: eje.genesisId, t, payload, movimientos: escalas.map((e) => salida.quemaDelCoste('g', payload, e, { eje })) });
  return { eje, obs, escribe };
}

test('«asked» y «on time»: lecturas de la época 0 que no se materializan (su 3 es X), con la fórmula de src/anclas.js y su mensaje en español', () => {
  for (const [nombre, f] of [['asked', anclas.formulaDelPedido()], ['on time', anclas.formulaATiempo()]]) {
    const r = regla(nombre);
    assert.ok(r, nombre + ' está en el 2 de la época');
    assert.deepEqual([r[3], r[4], r.length], [['X'], ['read'], 10]);
    assert.equal(r[2].at(-1), f, nombre + ': la fórmula es la de src/anclas.js');
    assert.equal(posicionDeLectura(r), 'X', 'no se materializa en ninguna posición del registro');
    assert.notEqual(contrato.mensaje(null, r, 'es'), r[9].at(-1), nombre + ': su 9 en español (epoch.9.4)');
  }
  assert.ok(!EPOCA_0_BTML.condiciones.includes(regla('asked')) && !EPOCA_0_BTML.condiciones.includes(regla('on time')), 'son lecturas, no condiciones: nada se rechaza por esto');
  assert.ok(anclas.formulaATiempo().length < 30000, 'cabe: ' + anclas.formulaATiempo().length);
});

test('lo pedido por la escala: segundo, minuto, hora y día piden los niveles 1 a 4; semana, ciclo y año, el último; de varias, el nivel más alto y, a igual nivel, el plazo más corto', async () => {
  // Cada registro en su eje: la asignación de día, semana, ciclo y año es una unidad por periodo.
  const esperado = { segundo: 1, minuto: 2, hora: 3, dia: 4, semana: 4, ciclo: 4, anio: 4 };
  const segundos = { segundo: 1, minuto: 60, hora: 3600, dia: 86400, semana: 604800, ciclo: 2419200, anio: 31536000 };
  let m = 2;
  for (const [escala, nivel] of Object.entries(esperado)) {
    const { eje, escribe } = await demo();
    const r = await escribe([escala], T(m++));
    assert.deepEqual(lectura(eje, r.id, 'asked'), ['RESUELTO', [nivel]], escala);
    const p = contrato.firmeza(eje, r.id).pedidos.find((x) => x.origen === 'propio');
    assert.deepEqual([p.nivel, p.escala, p.desde, p.plazo, p.por], [nivel, escala, r.t, iso(S(r.t) + segundos[escala]), 'g'], escala);
  }
  // De varias escalas: el nivel más alto (hora y minuto: el 3); a igual nivel (el último), el plazo más corto (semana y año: la semana; día y ciclo: el día).
  for (const [escalas, nivel, escala] of [[['minuto', 'hora'], 3, 'hora'], [['anio', 'semana'], 4, 'semana'], [['ciclo', 'dia'], 4, 'dia'], [['segundo', 'anio'], 4, 'anio']]) {
    const { eje, escribe } = await demo();
    const r = await escribe(escalas, T(m++));
    assert.deepEqual(lectura(eje, r.id, 'asked'), ['RESUELTO', [nivel]], escalas.join('+'));
    const p = contrato.firmeza(eje, r.id).pedidos.find((x) => x.origen === 'propio');
    assert.deepEqual([p.nivel, p.escala], [nivel, escala], escalas.join('+'));
  }
  assert.equal(anclas.escalaElegida([]), null);
  assert.deepEqual([anclas.escalaElegida([1, 0]), anclas.escalaElegida([6, 4, 5]), anclas.escalaElegida([2, 3, 6])], [1, 4, 3]);
  // El génesis no quema T: no pide nada propio (solo el suelo), y «asked» no da nada.
  const { eje } = await demo();
  assert.deepEqual(lectura(eje, eje.genesisId, 'asked'), ['RESUELTO', []]);
  assert.deepEqual(contrato.firmeza(eje, eje.genesisId).pedidos.map((p) => p.origen), ['suelo']);
});

test('estado del pedido propio: pendiente, fuera de plazo sin alcanzar, a tiempo y fuera de plazo alcanzado tarde; el instante de llegada; «on time» dice lo mismo que el contrato', async () => {
  const { eje, obs, escribe } = await demo();
  const r = await escribe(['minuto'], T(2)); // pide el nivel 2 en un minuto
  const t0 = S(r.t);
  const propio = (opciones) => contrato.firmeza(eje, r.id, opciones).pedidos.find((p) => p.origen === 'propio');
  assert.equal(propio({ ahora: iso(t0 + 30) }).estado, 'pendiente');
  assert.equal(propio({ ahora: iso(t0 + 120) }).estado, 'fuera de plazo', 'sin alcanzar y el plazo pasado');
  assert.deepEqual(lectura(eje, r.id, 'on time'), ['RESUELTO', [false]]);
  // Alcanzado a tiempo por su eslabón de nivel 2 (la hora de su cabecera, dentro del minuto).
  const casos = [
    [[{ nivel: 1, hora: t0 + 10 }, { nivel: 2, hora: t0 + 50 }, { nivel: 4, hora: t0 + 3000 }], t0 + 3600, 'a tiempo', t0 + 50],
    [[{ nivel: 1, hora: t0 + 10 }, { nivel: 2, hora: t0 + 200 }, { nivel: 4, hora: t0 + 3000 }], t0 + 3600, 'fuera de plazo', t0 + 200],
    // Sin eslabón de nivel 2: lo cubre el de arriba, Bitcoin, con la hora del bloque.
    [[{ nivel: 1, hora: t0 + 10 }, { nivel: 4, hora: t0 + 20 }], t0 + 40, 'a tiempo', t0 + 40],
    [[{ nivel: 1, hora: t0 + 10 }, { nivel: 4, hora: t0 + 20 }], t0 + 400, 'fuera de plazo', t0 + 400],
  ];
  for (const [k, [capas, bloque, estado, llegada]] of casos.entries()) {
    const { eje: e2, obs: o2, escribe: w2 } = await demo();
    const x = await w2(['minuto'], T(2));
    e2.marcarSello(x.id, await selloEnCascada(x.id, { observador: o2, capas, instante: iso(bloque) }));
    const f = contrato.firmeza(e2, x.id, { ahora: iso(t0 + 99999) });
    const p = f.pedidos.find((q) => q.origen === 'propio');
    assert.deepEqual([p.estado, p.llegada], [estado, iso(llegada)], 'caso ' + k);
    assert.deepEqual(lectura(e2, x.id, 'on time'), ['RESUELTO', [estado === 'a tiempo']], 'caso ' + k + ': «on time» y el contrato dicen lo mismo');
  }
  // El primer nivel lo alcanza el recibo de llegada, con su instante: un registro de segundo (pide el 1 en un segundo).
  const s = await escribe(['segundo'], T(9));
  const rele = await releDePrueba();
  eje.marcarRecibo(s.id, reciboFirmado(rele, { instante: '2026-11-10T10:09:00.000Z', semilla: s.id }));
  const ps = contrato.firmeza(eje, s.id).pedidos.find((p) => p.origen === 'propio');
  assert.deepEqual([ps.nivel, ps.estado, ps.llegada], [1, 'a tiempo', T(9)]);
  assert.deepEqual(lectura(eje, s.id, 'on time'), ['RESUELTO', [true]]);
  void obs;
});

test('lo colgado con «ask for more firmness»: la plantilla del PV 1 paga su coste en la escala pedida, y el registro del que cuelga lo pide desde el instante de la petición', async () => {
  const p = A.plantillasDeTransaccion().find((x) => x.nombre === 'ask for more firmness');
  assert.ok(p, 'la plantilla está en la época 0');
  assert.deepEqual([p.pv, p.orden], [1, 21]);
  const params = A.parametros(p.plantilla, { idioma: 'es' });
  assert.deepEqual(params.map((x) => [x.nombre, x.destino.que, x.posicion]), [['scale', 'cost', null], ['about', 'payload', '1'], ['criteria', 'payload', '2'], ['who', 'payload', '3'], ['actions', 'payload', '4']]);
  assert.equal(params[0].etiqueta, 'escala');
  const { eje, escribe } = await demo();
  const r = await escribe(['minuto'], T(2));
  // El 4 propone una sola pieza en la escala pedida (de más vale).
  const e = A.ejecucion(eje, 'ask for more firmness', { X: r.id, scale: 3 }, 'g', { t: T(5) });
  assert.ok(e.ok, JSON.stringify(e.motivos));
  assert.deepEqual(e.denominacion, [{ escala: 'dia', cantidad: 1 }]);
  // Una escala que no es real no vale (el 7 de la serie de T es el pasado, informativo).
  assert.equal((await A.transaccion(eje, 'ask for more firmness', { X: r.id, scale: 7 }, 'g', { t: T(5) })).ok, false);
  const x = await A.transaccion(eje, 'ask for more firmness', { X: r.id, scale: 3 }, 'g', { t: T(5) });
  assert.ok(x.ok, JSON.stringify(x.motivos));
  assert.deepEqual(x.evento.movimientos.map((m) => [m.token, m.escala, m.cantidad, m.a]), [['T', 'dia', 1, null]], 'esa quema es la petición; no mueve nada más');
  const pet = await eje.anadir(x.evento);
  assert.equal(eje.obtener(pet.id ?? x.evento.id).sobre, r.id);
  assert.ok(anclas.esPeticionDeFirmeza(x.evento));
  const f = contrato.firmeza(eje, r.id, { ahora: T(6) });
  assert.deepEqual(f.pedidos.map((q) => [q.origen, q.nivel, q.escala, q.estado]), [['colgado', 4, 'dia', 'pendiente'], ['suelo', 4, 'anio', 'pendiente'], ['propio', 2, 'minuto', 'fuera de plazo']], 'del más exigente al menos');
  const c = f.pedidos[0];
  assert.deepEqual([c.desde, c.plazo, c.por], [T(5), iso(S(T(5)) + 86400), 'g'], 'el plazo cuenta desde el instante de la petición');
  assert.equal(f.plazo, 'fuera de plazo', 'uno fuera de plazo basta');
  assert.equal(contrato.firmeza(eje, r.id, { ahora: T(2) }).plazo, 'pendiente');
});

test('el suelo (plazoDeSuelo: el plazo más largo de 7.5) y pedidoDeLote: el nivel más alto que piden y el plazo más corto de los que lo piden; sin pedidos, el suelo', async () => {
  const { eje, obs, escribe } = await demo();
  assert.deepEqual(contrato.plazoDeSuelo(eje, eje.genesisId), { clase: 'person', escala: 'anio', segundos: 31536000 });
  const m = await escribe(['minuto'], T(2));
  const h1 = await escribe(['hora'], T(3));
  const h2 = await escribe(['hora'], T(4));
  const suelo = contrato.firmeza(eje, m.id).pedidos.find((p) => p.origen === 'suelo');
  assert.deepEqual([suelo.nivel, suelo.escala, suelo.por, suelo.plazo], [4, 'anio', 'person', iso(S(m.t) + 31536000)]);
  assert.deepEqual(contrato.pedidoDeLote(eje, [m.id, h2.id, h1.id]), { nivel: 3, plazo: iso(S(h1.t) + 3600) });
  assert.deepEqual(contrato.pedidoDeLote(eje, [m.id]), { nivel: 2, plazo: iso(S(m.t) + 60) });
  assert.deepEqual(contrato.pedidoDeLote(eje, [eje.genesisId]), { nivel: 4, plazo: iso(S(eje.obtener(eje.genesisId).t) + 31536000) }, 'nadie pide nada: el suelo');
  assert.equal(contrato.pedidoDeLote(eje, ['00'.repeat(32)]), null);
  // Alcanzado a tiempo todo: «a tiempo».
  eje.marcarSello(m.id, await selloEnCascada(m.id, { observador: obs, capas: [{ nivel: 2, hora: S(m.t) + 30 }, { nivel: 4, hora: S(m.t) + 40 }], instante: iso(S(m.t) + 50) }));
  const f = contrato.firmeza(eje, m.id);
  assert.deepEqual(f.pedidos.map((p) => [p.origen, p.estado]), [['suelo', 'a tiempo'], ['propio', 'a tiempo']]);
  assert.equal(f.plazo, 'a tiempo');
});

test('una prueba mejor sustituye a la anterior: la que alcanza más niveles pasa a ser la que leen las reglas; una peor nunca sustituye a una mejor', async () => {
  const { eje, obs, escribe } = await demo();
  const r = await escribe(['minuto'], T(2));
  const taproot = await selloCompleto(r.id, { observador: obs, instante: '2026-11-10T12:00:00.000Z' });
  const cascada = await selloEnCascada(r.id, { observador: obs, capas: [{ nivel: 1 }, { nivel: 2 }, { nivel: 4 }], instante: '2026-11-10T13:00:00.000Z' });
  const peor = await selloEnCascada(r.id, { observador: obs, capas: [{ nivel: 4 }], instante: '2026-11-10T11:00:00.000Z' });
  assert.deepEqual([nivelesDeSello(taproot.decupla), nivelesDeSello(cascada.decupla), nivelesDeSello(peor.decupla), nivelesDeSello(null)], [1, 3, 1, 0]);
  assert.equal(eje.marcarSello(r.id, taproot), true);
  assert.equal(eje.marcarSello(r.id, cascada), true, 'más reciente, pero mejor: sustituye');
  assert.equal(eje.sello(r.id).hash, cascada.hash);
  // Sus eslabones de nivel 1 y 2 no tienen la clave declarada (VG 17-11, «firm lee grados»): solo el último, por «sealed».
  assert.deepEqual(contrato.firmeza(eje, r.id).capas.map((c) => c.estado), ['saltada', 'saltada', 'saltada', 'alcanzada']);
  assert.equal(eje.marcarSello(r.id, peor), false, 'más antigua, pero peor: no sustituye');
  assert.equal(eje.sello(r.id).hash, cascada.hash);
  // A igual alcance, la más antigua (como antes).
  const igual = await selloEnCascada(r.id, { observador: obs, capas: [{ nivel: 1 }, { nivel: 3 }, { nivel: 4 }], instante: '2026-11-10T12:30:00.000Z' });
  assert.equal(eje.marcarSello(r.id, igual), true);
  assert.equal(eje.sello(r.id).hash, igual.hash);
  void pagaElCoste;
});

// ---------- la carta y el ejemplo «firmeza» ----------

test('el ejemplo «firmeza»: un registro en cada estado; la carta pinta lo pedido en su estación y el formulario dice qué pide la escala', async () => {
  const { ejemploFirmeza } = await import('../ejemplos/ikisai/firmeza.mjs');
  const { arbol } = await import('../carta/carta.js');
  const { html } = await import('../carta/dom.js');
  const { eje, registros: r, foco } = await ejemploFirmeza();
  const ahora = '2026-11-17T12:00:00Z';
  const f = (x) => contrato.firmeza(eje, x.id, { ahora });
  // En firme en cada uno de los cuatro niveles (lo que exige su familia), con grado y red en alguno.
  assert.deepEqual(['casa', 'nivel2', 'nivel3', 'bitcoin'].map((k) => [f(r[k]).exigida, f(r[k]).firme]), [[1, true], [2, true], [3, true], [4, true]]);
  assert.deepEqual(f(r.nivel3).capas.map((c) => [c.grado, c.red]).at(-1), ['provider', 'test'], 'el eslabón que llega a Bitcoin, [4, 2, 0]: los nombres de la época');
  assert.deepEqual([f(r.sola).firme, f(r.sola).alcanzada, f(r.sola).capas.map((c) => c.grado)], [true, 4, ['local', 'local', 'local', 'local']], 'la persona sola, sin Bitcoin');
  assert.deepEqual([f(r.usable).firme, f(r.usable).alcanzada, f(r.usable).exigida], [false, 1, 2], 'se puede usar, aún no en firme');
  const propio = (k) => f(r[k]).pedidos.find((p) => p.origen === 'propio').estado;
  assert.deepEqual(['pendiente', 'aTiempo', 'tarde', 'sinAlcanzar'].map(propio), ['pendiente', 'a tiempo', 'fuera de plazo', 'fuera de plazo']);
  assert.equal(f(r.tarde).pedidos.find((p) => p.origen === 'propio').llegada !== null, true, 'alcanzado tarde');
  assert.equal(f(r.sinAlcanzar).pedidos.find((p) => p.origen === 'propio').llegada, null, 'sin alcanzar');
  assert.deepEqual(f(r.colgado).pedidos.map((p) => [p.origen, p.nivel, p.estado, p.por]), [['colgado', 4, 'a tiempo', 'bea'], ['suelo', 4, 'a tiempo', 'person'], ['propio', 2, 'fuera de plazo', 'ana']]);
  assert.equal(f(r.enDuda).enDuda, true);
  assert.equal(foco, r.colgado.id);
  // El reverso: una fila sobria en cada estación a la que apunta un pedido; la palabra de resumen no cambia.
  const h = html(await arbol({ foco: { X: foco, pv: 5 } }, eje, 'ana', { ancho: 1920, alto: 1080 }, { idioma: 'es', t: ahora }));
  const filas = [...h.matchAll(/<li class="estacion-firmeza" data-nivel="(\d)"[^>]*>(.*?)<\/li>/g)].map((m) => [m[1], [...m[2].matchAll(/<small class="estacion-firmeza-pedido" data-origen="([a-z]+)" data-plazo="([a-z-]+)"[^>]*>([^<]*)<\/small>/g)].map((x) => [x[1], x[2], x[3]])]);
  assert.deepEqual(filas.map(([n, p]) => [n, p.map((x) => x[0])]), [['1', []], ['2', ['propio']], ['3', []], ['4', ['colgado', 'suelo']]]);
  const [, colgado] = filas[3][1][0];
  assert.equal(colgado, 'a-tiempo');
  assert.match(filas[3][1][0][2], /^pedido · hasta 2026-11-17 11:00 · a tiempo · lo pide bea$/);
  assert.match(filas[3][1][1][2], /^pedido · hasta 2027-11-16 09:10 · a tiempo · por defecto \(persona\)$/);
  assert.match(filas[1][1][0][2], /^pedido · hasta 2026-11-16 09:11 · fuera de plazo$/);
  assert.match(h, /<small class="firmeza-resumen"[^>]*>en firme<\/small>/);
  // El formulario de «pedir más firmeza» (ejecutar): la línea de lo que pide la escala del coste.
  const form = html(await arbol({ foco: { X: r.pendiente.id, pv: 1 }, formulario: { X: r.pendiente.id, accion: 'ask for more firmness', valores: { scale: 1 }, ejecutar: true } }, eje, 'bea', { ancho: 1920, alto: 1080 }, { idioma: 'es', t: ahora }));
  assert.match(form, /<p class="pide-la-escala" data-nivel="2"><small>con minutos pides nivel 2 en un minuto<\/small><\/p>/);
});
