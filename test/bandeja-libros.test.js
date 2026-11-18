// La bandeja con varios libros (VG 18-11: «vas añadiendo y se acumula; al ejecutar te exige dos o más ejecuciones
// sucesivas: primero en el libro tal, después en el libro cual»): el borrador común de una persona (carta/bandeja.js
// crearBandeja con `comun`), su orden por libros (planDeLibros), la prueba en seco libro a libro (probarPorLibros) y
// ejecutar libro a libro, cada uno todo o nada (ejecutarPorLibros). Claves de PRUEBA, generadas aquí.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Eje } from '../src/eje.js';
import { generarClaves, firmar } from '../src/autoridad.js';
import { crearBandeja, planDeLibros, probarPorLibros, ejecutarPorLibros, absorberBorradorDeLibro, claveDelBorrador, claveDelBorradorComun } from '../carta/bandeja.js';
import { vistaDeLaBandejaPorLibros, htmlBandejaDelCuatro, textosTrasEjecutar, textoDeLosPasos } from '../carta/bandeja-pantalla.js';

const T = (m) => '2026-11-18T11:' + String(m).padStart(2, '0') + ':00Z';
const PERSONA = 'p'.repeat(64);

function memoria() {
  const m = new Map();
  return { m, leer: (k) => m.get(k) ?? null, guardar: (k, v) => (m.set(k, v), true) };
}

/** Dos libros de vg con la misma clave: { A, B, vg, firmarVg }. */
async function dosLibros() {
  const vg = await generarClaves();
  const libro = (nombre, m) => Eje.genesis({ identidad: 'vg', foco: [nombre], t: T(m), clave: vg.publica, privada: vg.privada, exigirFirmas: true, emision: [{ token: 'R', cantidad: 10 }] });
  return { A: await libro('libro A', 0), B: await libro('libro B', 1), vg, firmarVg: (ev) => firmar(ev, vg.privada) };
}

/** Todo lo que se puede leer de un eje, para comparar antes y después. */
const foto = (eje) => JSON.stringify({ orden: eje.orden, longitud: eje.libro.longitud, saldos: [...eje.saldos].map(([k, v]) => [k, v instanceof Map ? [...v] : v]) });

const nota = (eje, texto) => ({ accion: 'write to X', X: eje.genesisId, valores: { text: texto }, donde: { X: eje.genesisId, pv: 3 } });

/** La app de mentira: cada libro con su eje, quien mira y su firma; `hechos` recoge lo que se hace tras ejecutar uno. */
function abridor(libros, { firmas = {} } = {}) {
  const hechos = [];
  const abrir = async (libro) => {
    const l = libros.find((x) => x.eje.genesisId === libro);
    if (!l) return { motivo: 'no está aquí' };
    return { eje: l.eje, yo: 'vg', firmar: firmas[l.nombre] ?? l.firmar, nombre: l.nombre, hecho: (r) => hechos.push([l.nombre, r.eventos.length]) };
  };
  return { abrir, hechos };
}

test('el borrador común: una persona, las entradas de todos sus libros, cada una sabe de qué libro es; cada bandeja ve y prueba lo suyo', async () => {
  const { A, B } = await dosLibros();
  const almacen = memoria();
  const a = crearBandeja({ almacen, libro: A.genesisId, cuenta: 'vg', comun: PERSONA });
  const b = crearBandeja({ almacen, libro: B.genesisId, cuenta: 'vg', comun: PERSONA });
  assert.equal(a.clave, claveDelBorradorComun(PERSONA));
  assert.equal(a.poner(nota(A, 'a1')).ok, true);
  assert.equal(b.poner(nota(B, 'b1')).ok, true);
  assert.equal(a.poner(nota(A, 'a2')).entrada.id, 'b1', 'misma acción, mismo X y mismo sitio: se actualiza la de A');
  assert.deepEqual(a.listar().entradas.map((e) => [e.id, e.libro, e.valores.text]), [['b1', A.genesisId, 'a2']]);
  assert.deepEqual(b.listar().entradas.map((e) => [e.id, e.libro, e.valores.text]), [['b2', B.genesisId, 'b1']], 'los ids son del borrador entero');
  // Quitar y mover van sobre cualquier entrada del borrador (mover, dentro de su libro).
  b.poner({ ...nota(B, 'b2'), nueva: true });
  assert.deepEqual(a.mover('b3', -1), { ok: true, orden: ['b3', 'b2'] });
  assert.deepEqual(b.listar().entradas.map((e) => e.id), ['b3', 'b2']);
  assert.equal(a.listar().entradas.length, 1, 'lo de A, como estaba');
  assert.equal(a.quitar('b2').ok, true);
  assert.deepEqual(b.listar().entradas.map((e) => e.id), ['b3']);
  // Vaciar una bandeja vacía su libro y nada más.
  assert.equal(b.vaciar(), true);
  assert.deepEqual([a.listar().entradas.length, b.listar().entradas.length], [1, 0]);
});

test('el orden de los libros: el de su primera aparición, salvo que una entrada se apoye en otra de otro libro (entonces aquel va antes); en círculo, no se ejecuta', () => {
  const e = (id, libro, de = []) => ({ id, libro, cuenta: 'vg', de });
  assert.deepEqual(planDeLibros([e('b1', 'A'), e('b2', 'B'), e('b3', 'A')]).libros.map((l) => [l.libro, l.entradas]), [['A', ['b1', 'b3']], ['B', ['b2']]]);
  const dep = planDeLibros([e('b1', 'A', ['b2']), e('b2', 'B'), e('b3', 'C')]);
  assert.deepEqual(dep.libros.map((l) => [l.libro, l.despuesDe]), [['B', []], ['A', ['B']], ['C', []]], 'A se apoya en B: B va antes');
  assert.equal(dep.circular, false);
  const circulo = planDeLibros([e('b1', 'A', ['b2']), e('b2', 'B', ['b3']), e('b3', 'A')]);
  assert.equal(circulo.circular, true);
});

test('dos libros: la prueba en seco va libro a libro y en orden; lo que se apoya en una entrada del otro libro se prueba con el id que tendrá y se dice; el 4 dice «primero en el libro tal, después en el libro cual»', async () => {
  const { A, B, firmarVg } = await dosLibros();
  const almacen = memoria();
  const a = crearBandeja({ almacen, libro: A.genesisId, cuenta: 'vg', comun: PERSONA });
  const b = crearBandeja({ almacen, libro: B.genesisId, cuenta: 'vg', comun: PERSONA });
  a.poner(nota(A, 'en A, primero en aparecer'));
  const deB = b.poner(nota(B, 'en B')).entrada.id;
  // La segunda de A se apoya en lo que escriba la de B: su texto es el id de aquel registro.
  a.poner({ ...nota(A, 'x'), valores: { text: { pendiente: deB } }, nueva: true });
  const { abrir } = abridor([{ eje: A, nombre: 'Libro A', firmar: firmarVg }, { eje: B, nombre: 'Libro B', firmar: firmarVg }]);
  const p = await probarPorLibros({ almacen, persona: PERSONA, abrir });
  assert.equal(p.ok, true, JSON.stringify(p.libros.map((l) => l.motivos)));
  assert.deepEqual(p.libros.map((l) => [l.nombre, l.items.length]), [['Libro B', 1], ['Libro A', 2]], 'B antes: A se apoya en él');
  const apoyada = p.libros[1].items.find((x) => x.provisional);
  assert.deepEqual(apoyada.provisional, [deB]);
  assert.ok(JSON.stringify(apoyada.candidato.payload).includes(p.libros[0].items[0].candidato.id), 'probado con el id que tendrá');
  const v = vistaDeLaBandejaPorLibros(p, {}, { emparejada: true, abierto: A.genesisId });
  assert.deepEqual(v.libros.map((l) => [l.nombre, l.n]), [['Libro B', 1], ['Libro A', 2]]);
  assert.equal(textoDeLosPasos(v.libros), 'Se ejecuta en 2 pasos, uno por libro: primero en el libro «Libro B» (1 entrada), después en el libro «Libro A» (2 entradas).');
  const h = htmlBandejaDelCuatro(v, A.genesisId);
  assert.match(h, /data-bandeja-pasos>Se ejecuta en 2 pasos[^<]*primero en el libro «Libro B»[^<]*entre libros no se promete nada/);
  assert.match(h, /data-bandeja-firmas>Con la app emparejada, cada libro pide su firma: 2/);
  assert.ok(h.indexOf('data-bandeja-libro="' + B.genesisId + '"') < h.indexOf('data-bandeja-libro="' + A.genesisId + '"'));
  assert.match(h, /class="bandeja-provisional"/);
  // Ejecutar: B y después A; lo de A lleva el id REAL del registro de B; todo sale del borrador.
  const { abrir: abrir2, hechos } = abridor([{ eje: A, nombre: 'Libro A', firmar: firmarVg }, { eje: B, nombre: 'Libro B', firmar: firmarVg }]);
  const r = await ejecutarPorLibros({ almacen, persona: PERSONA, abrir: abrir2 });
  assert.equal(r.ok, true, JSON.stringify(r.fallo));
  assert.deepEqual(r.hechos.map((x) => [x.nombre, x.eventos.length]), [['Libro B', 1], ['Libro A', 2]]);
  assert.deepEqual(hechos, [['Libro B', 1], ['Libro A', 2]], 'la app guarda cada libro al acabar el suyo');
  const idEnB = r.ids[deB];
  assert.equal(B.obtener(idEnB).autor, 'vg');
  assert.ok(JSON.stringify(A.obtener(A.orden.at(-1)).payload).includes(idEnB), 'resuelto con el id real');
  assert.deepEqual([a.listar().entradas, b.listar().entradas], [[], []]);
});

test('falla la segunda con la primera hecha: lo de la primera YA ESTÁ HECHO y salió del borrador; de la segunda no queda nada a medias en su libro y sigue en el borrador con su motivo', async () => {
  const { A, B, firmarVg } = await dosLibros();
  const almacen = memoria();
  const a = crearBandeja({ almacen, libro: A.genesisId, cuenta: 'vg', comun: PERSONA });
  const b = crearBandeja({ almacen, libro: B.genesisId, cuenta: 'vg', comun: PERSONA });
  a.poner(nota(A, 'a1'));
  b.poner(nota(B, 'b1'));
  b.poner({ ...nota(B, 'b2'), nueva: true });
  const antesB = foto(B);
  const nA = A.orden.length;
  // En B la firma se cancela en la segunda: B no puede quedar a medias.
  let k = 0;
  const cancelaLaSegunda = async (ev) => (++k === 2 ? null : firmarVg(ev));
  const { abrir } = abridor([{ eje: A, nombre: 'Libro A', firmar: firmarVg }, { eje: B, nombre: 'Libro B', firmar: firmarVg }], { firmas: { 'Libro B': cancelaLaSegunda } });
  const r = await ejecutarPorLibros({ almacen, persona: PERSONA, abrir });
  assert.equal(r.ok, false);
  assert.deepEqual(r.hechos.map((h) => h.nombre), ['Libro A']);
  assert.deepEqual([r.fallo.nombre, r.fallo.fase], ['Libro B', 'firmar']);
  assert.equal(A.orden.length, nA + 1, 'lo de A está hecho');
  assert.equal(foto(B), antesB, 'B, exactamente como estaba');
  assert.deepEqual(a.listar().entradas, [], 'lo hecho sale del borrador');
  assert.deepEqual(b.listar().entradas.map((e) => e.valores.text), ['b1', 'b2'], 'lo fallido se queda para reintentar o quitar');
  const textos = textosTrasEjecutar(r, { lista: (h) => h.eventos.map((e) => e.id.slice(0, 8)).join(', ') });
  assert.match(textos[0], /^YA ESTÁ HECHO en el libro «Libro A»: [0-9a-f]{8}\. No se deshace\.$/);
  assert.match(textos[1], /^En el libro «Libro B» no se ha registrado nada: firma cancelada\. Sigue en la bandeja/);
});

test('falla la primera: no se intenta la segunda y todo sigue en el borrador con su motivo; un libro que no se abre lo dice', async () => {
  const { A, B, firmarVg } = await dosLibros();
  const almacen = memoria();
  const a = crearBandeja({ almacen, libro: A.genesisId, cuenta: 'vg', comun: PERSONA });
  const b = crearBandeja({ almacen, libro: B.genesisId, cuenta: 'vg', comun: PERSONA });
  a.poner(nota(A, 'a1'));
  b.poner(nota(B, 'b1'));
  const fotos = [foto(A), foto(B)];
  const { abrir } = abridor([{ eje: A, nombre: 'Libro A', firmar: firmarVg }, { eje: B, nombre: 'Libro B', firmar: firmarVg }], { firmas: { 'Libro A': async () => null } });
  const r = await ejecutarPorLibros({ almacen, persona: PERSONA, abrir });
  assert.deepEqual([r.ok, r.hechos.length, r.fallo.nombre, r.pendientes.map((p) => p.nombre)], [false, 0, 'Libro A', ['Libro B']]);
  assert.deepEqual([foto(A), foto(B)], fotos, 'nada escrito en ninguno');
  assert.deepEqual([a.listar().entradas.length, b.listar().entradas.length], [1, 1]);
  assert.match(textosTrasEjecutar(r).join(' '), /Sin intentar, siguen en la bandeja: «Libro B»/);
  // Si algo no entra en la prueba en seco (aquí, un libro que no se abre), no se ejecuta nada.
  const solo = abridor([{ eje: A, nombre: 'Libro A', firmar: firmarVg }]);
  const r2 = await ejecutarPorLibros({ almacen, persona: PERSONA, abrir: solo.abrir });
  assert.deepEqual([r2.ok, r2.fase, r2.hechos.length], [false, 'probar', 0]);
  assert.match(r2.fallo.motivos.map((m) => m.mensaje).join(' '), /no se puede abrir este libro en este dispositivo: no está aquí/);
  assert.deepEqual([foto(A), foto(B)], fotos);
});

test('lo que quedó en el borrador de un libro (el de antes del común) pasa al común con ids nuevos y sus referencias', () => {
  const almacen = memoria();
  const viejo = crearBandeja({ almacen, libro: 'g'.repeat(64), cuenta: 'vg' });
  const uno = viejo.poner({ accion: 'write to X', X: 'a'.repeat(64), valores: { text: 'uno' } }).entrada.id;
  viejo.poner({ accion: 'write to X', X: { pendiente: uno }, valores: { text: 'dos' } });
  const comun = crearBandeja({ almacen, libro: 'h'.repeat(64), cuenta: 'vg', comun: PERSONA });
  comun.poner({ accion: 'write to X', X: 'c'.repeat(64), valores: { text: 'ya estaba' } });
  assert.equal(absorberBorradorDeLibro({ almacen, libro: 'g'.repeat(64), cuenta: 'vg', persona: PERSONA }), 2);
  const pasadas = crearBandeja({ almacen, libro: 'g'.repeat(64), cuenta: 'vg', comun: PERSONA }).listar().entradas;
  assert.deepEqual(pasadas.map((e) => [e.id, e.X, e.de]), [['b2', 'a'.repeat(64), []], ['b3', { pendiente: 'b2' }, ['b2']]]);
  assert.deepEqual(viejo.listar().entradas, [], 'el viejo queda vacío');
  assert.ok(almacen.m.has(claveDelBorrador('g'.repeat(64), 'vg')));
  assert.equal(absorberBorradorDeLibro({ almacen, libro: 'g'.repeat(64), cuenta: 'vg', persona: PERSONA }), 0, 'una vez');
});

test('los botones del puente y el anuncio del libro privado componen en la bandeja (no escriben); crear el libro pequeño sigue siendo un gesto en el acto', async () => {
  const { readFileSync } = await import('node:fs');
  const puente = await import('../carta/puente.js');
  const libros = await import('../carta/libros.js');
  const X = 'e'.repeat(64);
  assert.deepEqual(puente.entradaDeEnviar({ enlace: X, serie: 'R:vg', cantidad: '2', publica: 'k' }), { accion: puente.PLANTILLAS.enviar, X, valores: { series: 'R:vg', quantity: 2, to: 'k' } });
  assert.equal(puente.entradaDeTraer({ obtener: () => null }, { enlace: X, origen: { obtener: () => null }, id: X }), null, 'sin registro ni prueba, nada que componer');
  assert.equal(libros.entradaDelAnuncio(X, { libro: X, claves: [] }), null, 'sin claves de línea no hay anuncio');
  assert.deepEqual(Object.keys(libros.entradaDelAnuncio(X, { libro: X, claves: [{ nivel: 1, clave: X }] })), ['accion', 'X', 'valores']);
  const app = readFileSync(new URL('../carta/app.js', import.meta.url), 'utf8');
  const trozo = (desde, hasta) => app.slice(app.indexOf(desde), app.indexOf(hasta, app.indexOf(desde)));
  for (const [nombre, entrada] of [['async puenteEnviar(form) {', 'entradaDeEnviar'], ['async puenteTraer(id) {', 'entradaDeTraer'], ['async puenteRecibir(id) {', 'entradaDeRecibir']]) {
    const cuerpo = trozo(nombre, '\n  },');
    assert.ok(cuerpo.includes('componerEnElPuente(puente.' + entrada + '('), nombre);
    assert.doesNotMatch(cuerpo, /DeOtroLibro\(|escribirEnElPuente/, nombre + ' no escribe');
  }
  const anuncio = trozo('async libroPrivadoAnunciar() {', '\n  },');
  assert.match(anuncio, /libros\.entradaDelAnuncio\([\s\S]*bandeja\(\)\?\.poner\(/);
  assert.doesNotMatch(anuncio, /anunciarLibroPrivado\(/);
  assert.match(trozo('async libroPrivadoCrear(form) {', '\n  },'), /libros\.abrirLibroPrivado\(/, 'crear sigue en el acto');
});
