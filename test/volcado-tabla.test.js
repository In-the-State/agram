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

  // Día 1: la dueña da de alta a Alfa con todo su T de minuto del día (la plantilla da 1, 60 o 1440); Beta, otro día.
  const uno = await volcar(eje, TABLA, opciones(DIA(1)));
  assert.equal(uno.escritos.filter((e) => e.tipo === 'alta').length, 1);
  assert.deepEqual(uno.t.dado, { Alfa: { minuto: 1440 } });
  assert.ok(uno.paraLaDuena.some((x) => x.startsWith('dar de alta a Beta con 60 minutos')), uno.paraLaDuena.join('\n'));
  assert.ok(uno.noPuede.every((x) => x.paso.cosa === 'Beta'));
  assert.ok(uno.avisos.includes('fila a5: fase «rara» desconocida; se queda en propuesta'));
  assert.deepEqual(uno.t.calculado, uno.t.gastado, 'el T calculado es el gastado');
  comprobarLibro(eje, TABLA.filter((f) => f.equipo === 'Alfa'), ESPERADA);

  // Día 2: la misma tabla; Beta entra (60 minutos le bastan) y lo de Alfa no cambia.
  const dos = await volcar(eje, TABLA, opciones(DIA(2)));
  assert.deepEqual(dos.t.dado, { Beta: { minuto: 60 } });
  assert.ok(dos.escritos.every((e) => e.cosa === 'Beta'));
  assert.deepEqual(dos.sinCambios, ['a1', 'a2', 'a3', 'a4', 'a5']);
  assert.deepEqual(dos.noPuede, []);
  assert.deepEqual(dos.t.calculado, dos.t.gastado);
  const libro = comprobarLibro(eje, TABLA, ESPERADA);
  // Una tarea en el libro: su 0 es el texto y su 1 los datos; el anuncio en su 4.1.
  const a2 = eje.obtener(libro.tareas.get('a2').id);
  assert.deepEqual(a2.payload.slice(0, 2), [['Revisar los textos'], ['ref: a2', 'ronda: 2', 'nota: a medias']]);
  assert.equal(eje.obtener(libro.tareas.get('a2').anuncio).en, '4100000000');

  // Otra vez la misma tabla: no escribe nada.
  const antes = eje.orden.length;
  const tres = await volcar(eje, TABLA, opciones(DIA(2, 10)));
  assert.equal(tres.escritos.length, 0);
  assert.equal(eje.orden.length, antes);
  assert.deepEqual(tres.sinCambios, TABLA.map((f) => f.ref));
  assert.deepEqual(tres.t.gastado, {});

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
  const resumen = (inf) => inf.escritos.map((e) => (e.fila ?? e.proyecto) + ' ' + e.tipo);
  assert.deepEqual(resumen(sim), ['a1 autorizada', 'a1 ejecutada', 'a3 correccion', 'a6 tarea', 'a6 propuesta', 'a6 autorizada']);
  assert.match(pintar(sim), /^SIMULADO \(no se escribe nada\): escribiría 6 registros/);

  const cuatro = await volcar(eje, cambiada, opciones(DIA(3)));
  assert.deepEqual(resumen(cuatro), resumen(sim), 'escribe lo que dijo la simulación');
  assert.deepEqual(cuatro.t.calculado, cuatro.t.gastado);
  assert.deepEqual(cuatro.t.gastado, sim.t.gastado);
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

test('volcar: si lo anunciado no pasa de lo que cuesta escribir «commit P», el motor da la tarea por ejecutada al autorizarla, y se avisa', async () => {
  const { eje, claves } = await preparar();
  const inf = await volcar(eje, [fila('a2', 'Alfa', 'Uno', 'Revisar los textos', 'abierta')], { claves, correspondencia: { ...CORR, minutosAnunciados: 1 }, t: DIA(1) });
  assert.deepEqual(inf.avisos, ['fila a2: tras «commit P» el motor la lee en ejecutada y no en autorizada']);
});
