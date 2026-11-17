// El volcado de una tabla de tareas en un libro (encargo A8; ejemplos/volcado/volcar.mjs), sobre un eje local en memoria
// con una tabla inventada y una correspondencia inventada (otras columnas y otras fases que las del roadmap: el guion no
// sabe de ninguna). Claves generadas aquí mismo; nada real, ningún nodo.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Eje } from '../src/eje.js';
import { cerrado } from '../src/motor.js';
import * as A from '../src/acciones.js';
import { generarClaves } from '../src/autoridad.js';
import { volcar, leerLibro, estacionDe, correspondenciaDe, pintar, PLANTILLAS } from '../ejemplos/volcado/volcar.mjs';

const CORR = {
  columnas: { id: 'ref', cosa: 'equipo', proyecto: 'bloque', texto: 'que', fase: 'etapa', datos: ['ronda', 'nota'] },
  fases: { pendiente: 'propuesta', abierta: 'autorizada', lista: 'ejecutada', revisada: 'cerrada' },
  minutosAnunciados: 10,
};
const fila = (ref, equipo, bloque, que, etapa, ronda = '1', nota = 'sin nota') => ({ ref, equipo, bloque, que, etapa, ronda, nota });
const TABLA = [
  fila('a1', 'Alfa', 'Uno', 'Escribir la guía', 'pendiente'),
  fila('a2', 'Alfa', 'Uno', 'Revisar los textos', 'abierta', '2', 'a medias'),
  fila('a3', 'Alfa', 'Dos', 'Montar el banco de pruebas', 'lista'),
  fila('a4', 'Alfa', 'Dos', 'Cerrar la ronda', 'revisada'),
  fila('a5', 'Alfa', 'Dos', 'Pensar el siguiente paso', 'rara'),
  fila('b1', 'Beta', 'Tres', 'Preparar la red', 'lista', '2'),
];
const ESPERADA = { a1: 'propuesta', a2: 'autorizada', a3: 'ejecutada', a4: 'cerrada', a5: 'propuesta', b1: 'ejecutada' };
const DIA = (d, h = 9) => `2026-11-${String(15 + d).padStart(2, '0')}T${String(h).padStart(2, '0')}:00:00Z`;

async function preparar() {
  const duena = await generarClaves();
  const claves = { duena: { privada: duena.privada }, cosas: { Alfa: await generarClaves(), Beta: await generarClaves() } };
  const eje = await Eje.genesis({ identidad: 'duena', foco: ['la dueña'], t: DIA(1, 8), clave: duena.publica, privada: duena.privada, exigirFirmas: true });
  return { eje, claves };
}

/** Lo volcado leído con el contrato y el motor: cada fila en su estación, colgada de su proyecto, escrita por su cosa. */
function comprobarLibro(eje, tabla, esperada) {
  const libro = leerLibro(eje, 'duena', correspondenciaDe(CORR));
  for (const f of tabla) {
    const t = libro.tareas.get(f.ref);
    assert.ok(t, 'la fila ' + f.ref + ' está en el libro');
    const ev = eje.obtener(t.id);
    const proyecto = eje.obtener(ev.sobre);
    assert.equal(ev.autor, f.equipo, f.ref + ': la escribe su cosa');
    assert.equal(ev.firmante, f.equipo, f.ref + ': firmada con la clave de su cosa');
    assert.equal(proyecto.autor, f.equipo);
    assert.deepEqual(proyecto.payload[0], [f.bloque], f.ref + ': cuelga de su proyecto');
    assert.equal(proyecto.sobre, eje.alta(f.equipo).id, 'el proyecto cuelga del alta de la cosa');
    assert.equal(eje.esPersona(f.equipo), false, 'una cosa');
    assert.equal(eje.obtener(eje.alta(f.equipo).id).autor, 'duena', 'de la dueña');
    assert.equal(estacionDe(eje, t.id), esperada[f.ref], f.ref + ': su estación');
    // El contrato y el motor por su lado: la plantilla del anuncio y lo que dice el motor del cierre.
    if (t.anuncio) assert.equal(A.estacionDeAnuncio(eje, t.anuncio), esperada[f.ref] === 'cerrada' ? 'ejecutada' : esperada[f.ref]);
    assert.equal(cerrado(eje, t.id).cerrado, ['ejecutada', 'cerrada'].includes(esperada[f.ref]), f.ref + ': cerrado según el motor');
  }
  return libro;
}

test('volcar: dos casas, tres líneas, las cuatro fases y una desconocida; espejo, diferencia, simulación y T', async () => {
  const { eje, claves } = await preparar();
  const opciones = (t, extra = {}) => ({ claves, correspondencia: CORR, t, ...extra });

  // Día 1: la dueña da a cada cosa lo justo: 1 minuto en el alta (el mínimo de «register a thing») y el resto con
  // «give T to a thing of mine». Las dos casas caben en un día.
  const uno = await volcar(eje, TABLA, opciones(DIA(1)));
  assert.deepEqual(uno.escritos.filter((e) => e.tipo === 'alta' || e.tipo === 'dar').map((e) => e.cosa + ' ' + e.tipo + ' ' + e.plantilla), ['Alfa alta register a thing', 'Alfa dar give T to a thing of mine', 'Beta alta register a thing', 'Beta dar give T to a thing of mine']);
  assert.deepEqual(Object.keys(uno.t.dado), ['Alfa', 'Beta']);
  for (const c of ['Alfa', 'Beta']) {
    assert.equal(uno.t.dado[c].minuto, uno.t.gastado[c].minuto, c + ': la dueña le da lo que gasta');
    assert.equal(eje.saldoT(c, 'minuto', DIA(1)), 0, c + ': se queda sin T');
    assert.deepEqual(Object.keys(uno.t.gastado[c]), ['minuto']);
  }
  assert.ok(uno.t.dado.Alfa.minuto < 1440 && uno.t.dado.Alfa.minuto + uno.t.dado.Beta.minuto <= 1440, JSON.stringify(uno.t.dado));
  assert.deepEqual([uno.paraLaDuena, uno.noPuede], [[], []]);
  assert.deepEqual(uno.avisos, ['fila a5: fase «rara» desconocida; se queda en propuesta']);
  assert.deepEqual(uno.t.calculado, uno.t.gastado, 'el T calculado es el gastado');
  const libro = comprobarLibro(eje, TABLA, ESPERADA);
  // Una tarea en el libro: su 0 es el texto y su 1 los datos; el anuncio en su 4.1.
  const a2 = eje.obtener(libro.tareas.get('a2').id);
  assert.deepEqual(a2.payload.slice(0, 2), [['Revisar los textos'], ['ref: a2', 'ronda: 2', 'nota: a medias']]);
  assert.equal(eje.obtener(libro.tareas.get('a2').anuncio).en, '4100000000');

  // Otra vez la misma tabla: no escribe nada.
  const antes = eje.orden.length;
  const tres = await volcar(eje, TABLA, opciones(DIA(2)));
  assert.equal(tres.escritos.length, 0);
  assert.equal(eje.orden.length, antes);
  assert.deepEqual(tres.sinCambios, TABLA.map((f) => f.ref));
  assert.deepEqual([tres.t.gastado, tres.t.dado, tres.paraLaDuena], [{}, {}, []]);

  // La tabla cambiada: una nueva, una que avanza, un texto que cambia, una que retrocede y una que desaparece.
  const cambiada = [
    fila('a1', 'Alfa', 'Uno', 'Escribir la guía', 'lista'),
    TABLA[1],
    fila('a3', 'Alfa', 'Dos', 'Montar el banco de pruebas y la batería', 'lista'),
    fila('a4', 'Alfa', 'Dos', 'Cerrar la ronda', 'abierta'),
    TABLA[4],
    fila('a6', 'Alfa', 'Uno', 'Una tarea nueva', 'abierta', '3'),
  ];
  // Simular: la lista de lo que escribiría y su T, sin escribir nada.
  const sim = await volcar(eje, cambiada, opciones(DIA(3), { simular: true }));
  assert.equal(sim.simulado, true);
  assert.equal(eje.orden.length, antes, 'simular no escribe');
  assert.deepEqual(sim.t.calculado, sim.t.gastado);
  const resumen = (inf) => inf.escritos.map((e) => (e.fila ?? e.proyecto ?? e.cosa) + ' ' + e.tipo);
  // Alfa se quedó sin T: la dueña le da lo que gasta esta pasada, con «give T to a thing of mine», antes de sus pasos.
  assert.deepEqual(resumen(sim), ['Alfa dar', 'a1 autorizada', 'a1 ejecutada', 'a3 correccion', 'a6 tarea', 'a6 propuesta', 'a6 autorizada']);
  assert.match(pintar(sim), /^SIMULADO \(no se escribe nada\): escribiría 7 registros/);
  assert.deepEqual(Object.keys(sim.t.dado), ['Alfa']);
  assert.equal(sim.t.dado.Alfa.minuto, sim.t.gastado.Alfa.minuto);
  assert.deepEqual(sim.paraLaDuena, []);
  // Sin la clave de la dueña no se puede dar T: queda para ella y los pasos de Alfa no se escriben.
  const sinDuena = await volcar(eje, cambiada, { claves: { cosas: claves.cosas }, correspondencia: CORR, t: DIA(3), simular: true });
  assert.equal(sinDuena.paraLaDuena.length, 1);
  assert.match(sinDuena.paraLaDuena[0], /^dar a Alfa al menos \d+ minutos de T con «give T to a thing of mine» \(tendría 0\): sin la clave de la dueña no se puede$/);
  assert.deepEqual(sinDuena.escritos, []);
  assert.equal(sinDuena.noPuede.length, 6);

  const cuatro = await volcar(eje, cambiada, opciones(DIA(3)));
  assert.deepEqual(resumen(cuatro), resumen(sim), 'escribe lo que dijo la simulación');
  assert.deepEqual(cuatro.t.calculado, cuatro.t.gastado);
  assert.deepEqual(cuatro.t.gastado, sim.t.gastado);
  assert.equal(eje.saldoT('Alfa', 'minuto', DIA(3)), 0, 'lo justo otra vez');
  assert.ok(cuatro.avisos.includes('fila a4: la fase «abierta» (autorizada) retrocede desde cerrada; no se deshace'));
  assert.ok(cuatro.avisos.includes('fila b1: ya no está en la tabla; no se borra'));
  assert.deepEqual(cuatro.sinCambios, ['a2', 'a4', 'a5']);
  comprobarLibro(eje, cambiada, { ...ESPERADA, a1: 'ejecutada', a4: 'cerrada', a6: 'autorizada' });
  const corregida = leerLibro(eje, 'duena', correspondenciaDe(CORR)).tareas.get('a3');
  assert.equal(corregida.texto, 'Montar el banco de pruebas y la batería');
  const correccion = eje.sobre(corregida.id, '0000000000').at(-1);
  assert.deepEqual([correccion.autor, correccion.payload[4]], ['Alfa', [PLANTILLAS.registro]], 'la corrección es otro registro de la cosa colgado de la tarea');
  assert.ok(eje.obtener(leerLibro(eje, 'duena', correspondenciaDe(CORR)).tareas.get('b1').id), 'la que desaparece sigue en el libro');

  // Y otra vez la cambiada: nada.
  const cinco = await volcar(eje, cambiada, opciones(DIA(3, 10)));
  assert.equal(cinco.escritos.length, 0);
});

test('volcar: la correspondencia del roadmap se lee y una fase que lleva a otro sitio no vale', () => {
  const c = correspondenciaDe(JSON.parse(readFileSync(new URL('../ejemplos/volcado/correspondencia-roadmap.json', import.meta.url), 'utf8')));
  assert.deepEqual(Object.values(c.fases), ['propuesta', 'autorizada', 'ejecutada', 'cerrada']);
  assert.throws(() => correspondenciaDe({ ...CORR, fases: { hecho: 'terminada' } }), /no es un paso/);
  assert.throws(() => correspondenciaDe({ columnas: { id: 'ref' } }), /falta la columna/);
});

test('volcar: con lo anunciado por debajo de lo que cuesta escribir «commit P» (1 minuto), la tarea autorizada sigue autorizada (#134: el coste de escribir no cumple un anuncio)', async () => {
  const { eje, claves } = await preparar();
  const inf = await volcar(eje, [fila('a2', 'Alfa', 'Uno', 'Revisar los textos', 'abierta')], { claves, correspondencia: { ...CORR, minutosAnunciados: 1 }, t: DIA(1) });
  assert.deepEqual(inf.avisos, []);
  assert.equal(estacionDe(eje, leerLibro(eje, 'duena', correspondenciaDe(CORR)).tareas.get('a2').id), 'autorizada');
});

test('volcar con `filas`: solo esas filas; una que cambió en el libro (en pantalla) y no en la tabla no se toca', async () => {
  const { eje, claves } = await preparar();
  const opciones = (t, extra = {}) => ({ claves, correspondencia: CORR, t, ...extra });
  await volcar(eje, TABLA, opciones(DIA(1)));
  // En pantalla, la cosa Alfa cambia el texto de a2 (otro «anchor here» suyo sobre la tarea, como una corrección); antes,
  // la dueña le da T del día para escribirlo.
  const { firmar } = await import('../src/autoridad.js');
  const { ESCALAS_REALES } = await import('../src/tokens.js');
  const da = await A.transaccion(eje, PLANTILLAS.dar, { X: eje.alta('Alfa').id, scale: ESCALAS_REALES.indexOf('minuto'), amount: 60 }, 'duena', { t: DIA(2), escala: 'segundo', firmar: (ev) => firmar(ev, claves.duena.privada) });
  assert.equal(da.ok, true, JSON.stringify(da.motivos));
  await eje.anadir(da.evento);
  const a2 = leerLibro(eje, 'duena', correspondenciaDe(CORR)).tareas.get('a2');
  const tx = await A.transaccion(eje, PLANTILLAS.registro, { X: a2.id, title: 'Revisar los textos, dicho en pantalla', content: ['ref: a2', 'ronda: 2', 'nota: a medias'] }, 'Alfa', { t: DIA(2, 9), firmar: (ev) => firmar(ev, claves.cosas.Alfa.privada) });
  assert.equal(tx.ok, true, JSON.stringify(tx.motivos));
  await eje.anadir(tx.evento);
  // La tabla cambia a1; a2 sigue como estaba en la tabla.
  const cambiada = [fila('a1', 'Alfa', 'Uno', 'Escribir la guía entera', 'pendiente'), ...TABLA.slice(1)];
  const sinFiltro = await volcar(eje, cambiada, opciones(DIA(2, 10), { simular: true }));
  assert.ok(sinFiltro.escritos.some((e) => e.fila === 'a2' && e.tipo === 'correccion'), 'sin filtro, volvería a poner el texto de la tabla en a2');
  const antes = eje.orden.length;
  const conFiltro = await volcar(eje, cambiada, opciones(DIA(2, 10), { filas: ['a1'] }));
  assert.deepEqual(conFiltro.escritos.map((e) => e.fila + ' ' + e.tipo), ['a1 correccion']);
  assert.equal(eje.orden.length, antes + 1);
  assert.deepEqual(conFiltro.desaparecen, [], 'las filas fuera del filtro no cuentan como desaparecidas');
  const libro = leerLibro(eje, 'duena', correspondenciaDe(CORR));
  assert.equal(libro.tareas.get('a1').texto, 'Escribir la guía entera');
  assert.equal(libro.tareas.get('a2').texto, 'Revisar los textos, dicho en pantalla', 'la pantalla manda hasta que la tabla diga otra cosa');
  // Una fila nueva entra aunque sea de una cosa ya dada de alta.
  const nueva = await volcar(eje, [...cambiada, fila('b2', 'Beta', 'Tres', 'Otra más', 'pendiente')], opciones(DIA(2, 11), { filas: new Set(['b2']) }));
  assert.deepEqual(nueva.escritos.filter((e) => e.fila).map((e) => e.fila + ' ' + e.tipo), ['b2 tarea', 'b2 propuesta']);
});
