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
import { volcar, leerLibro, estacionDe, correspondenciaDe, pintar, PLANTILLAS, notaDeDetalle, comprobarTabla, NOTA, TOPES, conCadenas, epocaDelVolcado } from '../ejemplos/volcado/volcar.mjs';
import { cadenas, NOMBRES_DE_LAS_CADENAS } from '../src/cadenas.js';

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
  assert.equal(c.como, 'personas', 'el roadmap: las casas como personas invitadas (VG 17-11)');
  assert.equal(c.duena, 'VG', 'el roadmap: la casa de la dueña');
  assert.deepEqual(['base', 'pasos', 'detalle', 'quien', 'depende'].map((k) => c.columnas[k]), ['base', 'pasos', 'detalle', 'quien', 'depende']);
  assert.throws(() => correspondenciaDe({ ...CORR, columnas: { ...CORR.columnas, id: 'base' } }), /etiqueta de la nota/);
  assert.equal(correspondenciaDe(CORR).como, 'cosas', 'el defecto sigue siendo cosas');
  assert.throws(() => correspondenciaDe({ ...CORR, como: 'grupos' }), /«como» es cosas o personas/);
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

// ---------- el modo personas (VG 17-11): cada casa es una persona invitada por la dueña, con su propio T ----------

const PERSONAS = { ...CORR, como: 'personas' };

test('volcar como personas: la dueña invita sin dar nada y cada casa acepta con su clave; gasta su propio T (sin «dar»); espejo e idempotencia; una fila cambiada escribe solo la diferencia', async () => {
  const { eje, claves } = await preparar();
  const opciones = (t, extra = {}) => ({ claves, correspondencia: PERSONAS, t, ...extra });
  const uno = await volcar(eje, TABLA, opciones(DIA(1)));
  const altas = uno.escritos.filter((e) => e.tipo === 'invitacion' || e.tipo === 'alta').map((e) => e.cosa + ' ' + e.tipo + ' ' + e.quien);
  assert.deepEqual(altas, ['Alfa invitacion duena', 'Alfa alta Alfa', 'Beta invitacion duena', 'Beta alta Beta']);
  assert.ok(!uno.escritos.some((e) => e.tipo === 'dar'), 'sin pasos «dar»');
  assert.deepEqual([uno.paraLaDuena, uno.noPuede, uno.t.dado], [[], [], {}]);
  assert.deepEqual(uno.t.calculado, uno.t.gastado);
  for (const c of ['Alfa', 'Beta']) {
    assert.equal(eje.esPersona(c), true, c + ': una persona');
    const alta = eje.obtener(eje.alta(c).id);
    const inv = eje.obtener(alta.sobre);
    assert.deepEqual([alta.autor, alta.firmante, inv.autor, inv.payload[0], inv.payload[1]], [c, c, 'duena', ['invitation'], ['nada']], c + ': la invitación no da nada');
    assert.ok(uno.t.gastado[c].minuto > 0 && eje.saldoT(c, 'minuto', DIA(1)) === 1440 - uno.t.gastado[c].minuto, c + ': gasta su T del día');
  }
  assert.ok(uno.t.gastado.duena.minuto > 0, 'la dueña gasta lo que cuesta escribir las invitaciones');
  // Lo mismo que en modo cosas: cada fila en su estación, colgada de su proyecto, que cuelga del alta de la casa.
  const libro = leerLibro(eje, 'duena', correspondenciaDe(PERSONAS));
  for (const f of TABLA) {
    const t = libro.tareas.get(f.ref);
    const ev = eje.obtener(t.id);
    assert.deepEqual([ev.autor, ev.firmante, eje.obtener(ev.sobre).sobre], [f.equipo, f.equipo, eje.alta(f.equipo).id]);
    assert.equal(estacionDe(eje, t.id), ESPERADA[f.ref], f.ref);
  }
  // Otra vez: nada.
  const antes = eje.orden.length;
  const dos = await volcar(eje, TABLA, opciones(DIA(2)));
  assert.deepEqual([dos.escritos.length, eje.orden.length], [0, antes]);
  // Una fila cambiada: solo su diferencia.
  const cambiada = [fila('a1', 'Alfa', 'Uno', 'Escribir la guía entera', 'pendiente'), ...TABLA.slice(1)];
  const tres = await volcar(eje, cambiada, opciones(DIA(2, 10)));
  assert.deepEqual(tres.escritos.map((e) => e.fila + ' ' + e.tipo), ['a1 correccion']);
});

test('volcar como personas: sin la clave de la dueña no se invita (paraLaDuena), pero una casa ya invitada (por quien sea) se vuelca; con solo algunas claves, las demás a noPuede; un nombre con alta de cosa no se vuelca', async () => {
  const { eje, claves } = await preparar();
  // Beta la invita otra persona (no la dueña) y acepta: vale.
  const { firmar } = await import('../src/autoridad.js');
  const vg = await generarClaves();
  await eje.aceptar(await eje.invitar({ autor: 'duena', invitado: 'vg', clave: vg.publica, da: [], t: DIA(1, 8), privada: claves.duena.privada }), vg, { t: DIA(1, 8) });
  await eje.aceptar(await eje.invitar({ autor: 'vg', invitado: 'Beta', clave: claves.cosas.Beta.publica, da: [], t: DIA(1, 8), privada: vg.privada }), claves.cosas.Beta, { t: DIA(1, 8) });
  // Sin la clave de la dueña: Alfa no se invita; las filas de Beta se vuelcan con su clave.
  const sinDuena = await volcar(eje, TABLA, { claves: { cosas: claves.cosas }, correspondencia: PERSONAS, t: DIA(1, 9) });
  assert.deepEqual(sinDuena.paraLaDuena, ['invitar a Alfa']);
  assert.ok(sinDuena.noPuede.every((x) => x.paso.cosa === 'Alfa' && /la dueña ha de invitarla/.test(x.motivo)));
  assert.deepEqual([...new Set(sinDuena.escritos.map((e) => e.cosa))], ['Beta']);
  assert.ok(!eje.alta('Alfa'));
  // Con solo la clave de Beta (cada Core vuelca sus filas con su clave): las de Alfa, «sin la clave de Alfa», sin escribir.
  const parcial = await volcar(eje, [...TABLA, fila('b2', 'Beta', 'Tres', 'Otra', 'pendiente')], { claves: { duena: claves.duena, cosas: { Beta: claves.cosas.Beta } }, correspondencia: PERSONAS, t: DIA(1, 10) });
  assert.ok(parcial.noPuede.length > 0 && parcial.noPuede.every((x) => x.paso.cosa === 'Alfa' && x.motivo === 'sin la clave de Alfa'));
  assert.deepEqual(parcial.escritos.map((e) => e.fila + ' ' + e.tipo), ['b2 tarea', 'b2 propuesta']);
  assert.ok(!eje.alta('Alfa'), 'sin la clave de Alfa no se invita ni se escribe nada suyo');
  // Un nombre con alta de cosa (de la dueña): aviso, no se vuelca.
  const { firmarPosesion } = await import('../src/autoridad.js');
  const kGama = await generarClaves();
  const cosa = await A.transaccion(eje, 'register a thing', { X: eje.alta('duena').id, thing: 'Gama', minutes: 1, key: kGama.publica }, 'duena', { t: DIA(1, 11), escala: 'segundo', firmar: async (ev) => firmar(await firmarPosesion(ev, 'Gama', kGama.privada), claves.duena.privada) });
  assert.ok(cosa.ok, JSON.stringify(cosa.motivos));
  await eje.anadir(cosa.evento);
  const conCosa = await volcar(eje, [fila('g1', 'Gama', 'Cuatro', 'Algo', 'pendiente')], { claves: { duena: claves.duena, cosas: { Gama: await generarClaves() } }, correspondencia: PERSONAS, t: DIA(1, 12), filas: ['g1'] });
  assert.ok(conCosa.avisos.includes('fila g1: «Gama» ya tiene alta como cosa y no como persona; no se vuelca'), JSON.stringify(conCosa.avisos));
  assert.deepEqual(conCosa.escritos, []);
});

test('volcar como personas: lo que no le cabe a una casa en su día queda para otro día', async () => {
  const { eje, claves } = await preparar();
  // Una casa con muchas filas largas: su T del día no alcanza.
  const largo = 'x'.repeat(40);
  const muchas = Array.from({ length: 40 }, (_, k) => fila('m' + k, 'Alfa', 'Uno', 'Tarea ' + k + ' ' + largo, 'revisada', String(k), largo));
  const uno = await volcar(eje, muchas, { claves, correspondencia: PERSONAS, t: DIA(1) });
  assert.ok(uno.noPuede.length > 0, 'algo no cabe hoy');
  assert.ok(uno.noPuede.some((x) => x.motivo === 'a Alfa no le llega hoy su T: otro día'), JSON.stringify([...new Set(uno.noPuede.map((x) => x.motivo))]));
  const dos = await volcar(eje, muchas, { claves, correspondencia: PERSONAS, t: DIA(2), simular: true });
  assert.ok(dos.escritos.length > 0, 'otro día sigue');
});

test('volcar como personas (seguridad): una invitación pendiente de otro no se reutiliza: con otra clave, el nombre queda reservado y sus filas a noPuede; con la misma, la dueña escribe la suya; la ajena sale en avisos', async () => {
  const { eje, claves } = await preparar();
  const vg = await generarClaves();
  await eje.aceptar(await eje.invitar({ autor: 'duena', invitado: 'vg', clave: vg.publica, da: [], t: DIA(1, 8), privada: claves.duena.privada }), vg, { t: DIA(1, 8) });
  // Alfa: vg la invita con otra clave. El núcleo ata la clave al nombre desde la invitación: la dueña no puede invitarla.
  const otra = await generarClaves();
  const ajenaAlfa = await eje.invitar({ autor: 'vg', invitado: 'Alfa', clave: otra.publica, da: [], t: DIA(1, 8), privada: vg.privada });
  // Beta: vg la invita con la clave de Beta. Tampoco se reutiliza (no es de la dueña): la dueña escribe la suya.
  const ajenaBeta = await eje.invitar({ autor: 'vg', invitado: 'Beta', clave: claves.cosas.Beta.publica, da: [], t: DIA(1, 8), privada: vg.privada });
  const inf = await volcar(eje, TABLA, { claves, correspondencia: PERSONAS, t: DIA(1, 9) });
  for (const c of ['Alfa', 'Beta']) assert.ok(inf.avisos.includes('«' + c + '»: hay una invitación de vg para ese nombre que el volcado no usa'), JSON.stringify(inf.avisos));
  assert.ok(inf.noPuede.filter((x) => x.paso.cosa === 'Alfa').every((x) => x.motivo === 'el nombre Alfa ya lo reserva otra invitación, con otra clave'));
  assert.ok(!eje.alta('Alfa'), 'Alfa no acepta la invitación ajena');
  const beta = eje.obtener(eje.alta('Beta').id);
  assert.notEqual(beta.sobre, ajenaBeta.id);
  assert.equal(eje.obtener(beta.sobre).autor, 'duena', 'Beta acepta la de la dueña');
  assert.ok(inf.escritos.some((e) => e.fila === 'b1'));
  assert.ok(eje.obtener(ajenaAlfa.id));
});

test('volcar como personas (seguridad): una persona ajena con el nombre de una casa no se toma por la casa; sus filas a noPuede y el resto sigue', async () => {
  const { eje, claves } = await preparar();
  const vg = await generarClaves();
  await eje.aceptar(await eje.invitar({ autor: 'duena', invitado: 'vg', clave: vg.publica, da: [], t: DIA(1, 8), privada: claves.duena.privada }), vg, { t: DIA(1, 8) });
  const otra = await generarClaves();
  await eje.aceptar(await eje.invitar({ autor: 'vg', invitado: 'Alfa', clave: otra.publica, da: [], t: DIA(1, 8), privada: vg.privada }), otra, { t: DIA(1, 8) });
  // Con la clave de Alfa conocida: la persona «Alfa» declara otra.
  const inf = await volcar(eje, TABLA, { claves, correspondencia: PERSONAS, t: DIA(1, 9) });
  const deAlfa = inf.noPuede.filter((x) => x.paso.cosa === 'Alfa');
  assert.equal(deAlfa.length, TABLA.filter((f) => f.equipo === 'Alfa').length);
  assert.ok(deAlfa.every((x) => x.motivo === 'el nombre Alfa ya es de otra persona en este libro'));
  assert.ok(!inf.escritos.some((e) => e.cosa === 'Alfa'), 'nada se cuelga de ella');
  assert.ok(inf.escritos.some((e) => e.cosa === 'Beta' && e.fila === 'b1'), 'el resto sigue');
  // Sin clave conocida de Alfa (simulación): la invitó vg, ni la dueña ni el autor del génesis.
  const sim = await volcar(eje, TABLA, { claves: { duena: claves.duena, cosas: {} }, correspondencia: PERSONAS, t: DIA(1, 10), simular: true });
  assert.ok(sim.noPuede.some((x) => x.paso.cosa === 'Alfa' && x.motivo === 'el nombre Alfa ya es de otra persona en este libro'));
});

// ---------- la casa de la dueña y la nota de detalle (VG 17-11) ----------

const DETALLE = { ...PERSONAS, duena: 'Jefa', columnas: { ...CORR.columnas, base: 'base', pasos: 'pasos', detalle: 'detalle', quien: 'quien', depende: 'depende' } };
const conDetalle = (f, extra) => ({ ...f, ...extra });
const PASOS_J1 = [{ hace: 'Arrancar el servidor inventado', comando: 'node servidor.mjs --puerto 9999 {sin hueco}', ruta: 'retoques/', ve: 'la portada' }, { hace: 'Abrir la tarea' }];
const TABLA_D = [
  ...TABLA,
  conDetalle(fila('j1', 'Jefa', 'Lo mío', 'Probar la carta inventada', 'lista'), { base: 'Lo pide la dueña', pasos: PASOS_J1, quien: 'Core Inventado', depende: ['a1', 'b1'] }),
  conDetalle(fila('j2', 'Jefa', 'Lo mío', 'Revisar la nota', 'pendiente'), { detalle: 'primera línea\nsegunda línea', depende: ['j1'] }),
];

test('la casa de la dueña: no se invita; sus proyectos cuelgan del alta de la dueña y sus filas las escribe ella con su clave; repetir no escribe', async () => {
  const { eje, claves } = await preparar();
  const uno = await volcar(eje, TABLA_D, { claves, correspondencia: DETALLE, t: DIA(1) });
  assert.deepEqual([uno.noPuede, uno.paraLaDuena], [[], []]);
  assert.ok(!uno.escritos.some((e) => e.cosa === 'Jefa' && (e.tipo === 'invitacion' || e.tipo === 'alta')), 'ni invitación ni alta');
  assert.ok(!eje.alta('Jefa'));
  const libro = leerLibro(eje, 'duena', correspondenciaDe(DETALLE));
  for (const [ref, estacion] of [['j1', 'ejecutada'], ['j2', 'propuesta']]) {
    const t = libro.tareas.get(ref);
    const ev = eje.obtener(t.id);
    assert.deepEqual([t.cosa, ev.autor, ev.firmante, eje.obtener(ev.sobre).sobre], ['Jefa', 'duena', 'duena', eje.genesisId], ref + ': de la dueña, colgada de su alta');
    assert.equal(estacionDe(eje, t.id), estacion, ref);
  }
  assert.ok(uno.escritos.filter((e) => e.cosa === 'Jefa').every((e) => e.quien === 'duena'));
  const antes = eje.orden.length;
  const dos = await volcar(eje, TABLA_D, { claves, correspondencia: DETALLE, t: DIA(2) });
  assert.deepEqual([dos.escritos.length, eje.orden.length], [0, antes]);
  // Sin la clave de la dueña: sus filas no se firman; quedan para ella.
  const otro = await preparar();
  const sin = await volcar(otro.eje, TABLA_D, { claves: { cosas: otro.claves.cosas }, correspondencia: DETALLE, t: DIA(1) });
  assert.ok(sin.paraLaDuena.includes('volcar las filas de Jefa (la casa de la dueña) con su clave'), JSON.stringify(sin.paraLaDuena));
  const deJefa = sin.noPuede.filter((x) => x.paso.cosa === 'Jefa');
  assert.ok(deJefa.length > 0 && deJefa.every((x) => x.motivo === 'sin la clave de la dueña'));
  assert.ok(!sin.escritos.some((e) => e.cosa === 'Jefa'));
});

test('la nota de detalle: una por fila con detalle, escrita por su casa; la lectura pura la parte; no es una corrección; repetir no escribe; un cambio escribe otra; retirarla escribe una vacía', async () => {
  const { eje, claves } = await preparar();
  const corr = correspondenciaDe(DETALLE);
  const uno = await volcar(eje, TABLA_D, { claves, correspondencia: DETALLE, t: DIA(1) });
  assert.deepEqual(uno.escritos.filter((e) => e.tipo === 'nota').map((e) => e.fila + ' ' + e.quien + ' ' + e.plantilla), ['j1 duena anchor here', 'j2 duena anchor here']);
  const libro = leerLibro(eje, 'duena', corr);
  const tarea = libro.tareas.get('j1');
  const nota = eje.sobre(tarea.id, '0000000000').find((h) => h.payload[0][0] === NOTA.titulo);
  assert.deepEqual(nota.payload[1], [
    'nota de detalle: j1',
    'base: Lo pide la dueña',
    'paso 1: Arrancar el servidor inventado',
    'paso 1 comando: node servidor.mjs --puerto 9999 {sin hueco}',
    'paso 1 ruta: retoques/',
    'paso 1 ve: la portada',
    'paso 2: Abrir la tarea',
    'quien: Core Inventado',
    'depende a1: Escribir la guía',
    'depende b1: Preparar la red',
  ]);
  const esperada = { fila: 'j1', base: 'Lo pide la dueña', pasos: PASOS_J1, detalle: [], quien: 'Core Inventado', depende: [{ id: 'a1', texto: 'Escribir la guía' }, { id: 'b1', texto: 'Preparar la red' }] };
  assert.deepEqual(notaDeDetalle(eje, 'j1', { correspondencia: DETALLE }), esperada, 'por el id de la fila');
  assert.deepEqual(notaDeDetalle(eje, tarea.id), esperada, 'por el registro de la tarea');
  assert.deepEqual(notaDeDetalle(eje, 'j2', { columna: 'ref' }).detalle, ['primera línea', 'segunda línea']);
  assert.equal(notaDeDetalle(eje, 'a1', { columna: 'ref' }), null, 'una fila sin detalle no tiene nota');
  // No es una corrección: el texto y los datos de la tarea siguen siendo los de la tabla.
  assert.deepEqual([tarea.texto, tarea.datos.ref], ['Probar la carta inventada', 'j1']);
  // Repetir: nada.
  const antes = eje.orden.length;
  assert.equal((await volcar(eje, TABLA_D, { claves, correspondencia: DETALLE, t: DIA(2) })).escritos.length, 0);
  assert.equal(eje.orden.length, antes);
  // Cambia el detalle de j1 y el texto de j2 (su nota no cambia: depende de j1, cuyo texto no cambia): una nota y una corrección.
  const cambiada = TABLA_D.map((f) => (f.ref === 'j1' ? { ...f, quien: 'Core Otro' } : f.ref === 'j2' ? { ...f, que: 'Revisar la nota otra vez' } : f));
  const dos = await volcar(eje, cambiada, { claves, correspondencia: DETALLE, t: DIA(2, 10) });
  assert.deepEqual(dos.escritos.map((e) => e.fila + ' ' + e.tipo), ['j1 nota', 'j2 correccion']);
  assert.equal(notaDeDetalle(eje, 'j1', { columna: 'ref' }).quien, 'Core Otro', 'manda la última');
  const l2 = leerLibro(eje, 'duena', corr);
  assert.equal(l2.tareas.get('j2').texto, 'Revisar la nota otra vez', 'la corrección se lee; la nota no la tapa');
  assert.equal(l2.tareas.get('j1').texto, 'Probar la carta inventada', 'la nota posterior no cuenta como corrección');
  // Cambia el texto de a1: la nota de j1 (que depende de a1) se reescribe con el texto nuevo.
  const conA1 = cambiada.map((f) => (f.ref === 'a1' ? { ...f, que: 'Escribir la guía entera' } : f));
  const tres = await volcar(eje, conA1, { claves, correspondencia: DETALLE, t: DIA(2, 11) });
  assert.deepEqual(tres.escritos.map((e) => e.fila + ' ' + e.tipo), ['a1 correccion', 'j1 nota']);
  assert.deepEqual(notaDeDetalle(eje, 'j1', { columna: 'ref' }).depende[0], { id: 'a1', texto: 'Escribir la guía entera' });
  // Retirada: la tabla quita todo el detalle de j1 (y j2 deja de depender): una nota vacía que lo dice; la lectura da null; repetir no escribe.
  const sinDetalle = conA1.map((f) => (f.ref === 'j1' ? fila('j1', 'Jefa', 'Lo mío', 'Probar la carta inventada', 'lista') : f));
  const cuatro = await volcar(eje, sinDetalle, { claves, correspondencia: DETALLE, t: DIA(2, 12) });
  assert.deepEqual(cuatro.escritos.map((e) => e.fila + ' ' + e.tipo), ['j1 nota']);
  const vacia = eje.obtener(cuatro.escritos[0].id);
  assert.deepEqual(vacia.payload[1], ['nota de detalle: j1', 'sin detalle: la tabla ya no da detalle de esta fila']);
  assert.equal(notaDeDetalle(eje, 'j1', { columna: 'ref' }), null);
  assert.equal((await volcar(eje, sinDetalle, { claves, correspondencia: DETALLE, t: DIA(2, 13) })).escritos.length, 0);
});

test('las comprobaciones de la tabla: un id de «depende» que no existe, una fila que depende de sí misma, un ciclo y un tope: no se escribe nada y el aviso lo dice', async () => {
  const corr = correspondenciaDe(DETALLE);
  const base = (extra) => [fila('x1', 'Alfa', 'Uno', 'Uno', 'pendiente'), conDetalle(fila('x2', 'Alfa', 'Uno', 'Dos', 'pendiente'), extra), fila('x3', 'Alfa', 'Uno', 'Tres', 'pendiente')];
  assert.deepEqual(comprobarTabla(base({ depende: ['x1'] }), corr), []);
  assert.deepEqual(comprobarTabla(base({ depende: ['x9'] }), corr), ['fila x2: depende de «x9», que no está en la tabla']);
  assert.deepEqual(comprobarTabla(base({ depende: ['x2'] }), corr), ['fila x2: depende de sí misma']);
  const ciclo = [conDetalle(fila('x1', 'Alfa', 'Uno', 'Uno', 'pendiente'), { depende: ['x3'] }), conDetalle(fila('x2', 'Alfa', 'Uno', 'Dos', 'pendiente'), { depende: ['x1'] }), conDetalle(fila('x3', 'Alfa', 'Uno', 'Tres', 'pendiente'), { depende: ['x2'] })];
  assert.deepEqual(comprobarTabla(ciclo, corr), ['un ciclo de dependencias: x1 → x3 → x2 → x1']);
  assert.deepEqual(comprobarTabla(base({ base: 'b'.repeat(TOPES.base + 1) }), corr), ['fila x2: la base pasa de ' + TOPES.base + ' caracteres']);
  assert.deepEqual(comprobarTabla(base({ pasos: [{ comando: 'ls' }] }), corr), ['fila x2: el paso 1 no dice qué hace («hace»)']);
  const { eje, claves } = await preparar();
  for (const mala of [base({ depende: ['x9'] }), base({ depende: ['x2'] }), ciclo]) {
    const antes = eje.orden.length;
    const inf = await volcar(eje, mala, { claves, correspondencia: DETALLE, t: DIA(1) });
    assert.deepEqual([inf.escritos.length, eje.orden.length], [0, antes], 'no se escribe nada');
    assert.ok(inf.avisos.length > 0 && inf.avisos.every((a) => a.startsWith('la tabla no se vuelca: ')));
    assert.match(pintar(inf), /^LA TABLA NO SE VUELCA/);
  }
});

test('un libro volcado antes de este cambio: la tabla vieja con la correspondencia nueva no escribe nada; con detalle y filas de la dueña, solo lo nuevo', async () => {
  const { eje, claves } = await preparar();
  await volcar(eje, TABLA, { claves, correspondencia: PERSONAS, t: DIA(1) });
  const antes = eje.orden.length;
  const ids = [...eje.orden];
  // La tabla de antes, sin columnas nuevas, con la correspondencia nueva: nada.
  const igual = await volcar(eje, TABLA, { claves, correspondencia: DETALLE, t: DIA(2) });
  assert.deepEqual([igual.escritos.length, eje.orden.length], [0, antes]);
  // Con detalle en a2 y las filas de la dueña: solo la nota de a2 y lo de la dueña; lo escrito sigue igual.
  const nueva = [...TABLA.map((f) => (f.ref === 'a2' ? { ...f, base: 'La guía la pidió alguien inventado', depende: ['a1'] } : f)), ...TABLA_D.slice(TABLA.length)];
  const inf = await volcar(eje, nueva, { claves, correspondencia: DETALLE, t: DIA(2, 10) });
  assert.ok(inf.escritos.every((e) => e.cosa === 'Jefa' || (e.fila === 'a2' && e.tipo === 'nota')), JSON.stringify(inf.escritos.map((e) => e.cosa + ' ' + e.tipo)));
  assert.equal(inf.escritos.filter((e) => e.tipo === 'nota').length, 3);
  assert.deepEqual(eje.orden.slice(0, antes), ids, 'lo de antes, igual y en su orden');
  assert.equal(notaDeDetalle(eje, 'a2', { columna: 'ref' }).base, 'La guía la pidió alguien inventado');
  // Un nombre de la dueña que ya tiene alta propia (volcado antes como otra casa): no se vuelca encima.
  const conAlfa = await volcar(eje, nueva, { claves, correspondencia: { ...DETALLE, duena: 'Alfa' }, t: DIA(2, 11), simular: true });
  assert.ok(conAlfa.noPuede.some((x) => x.motivo === 'el nombre Alfa ya tiene alta propia en este libro: la casa de la dueña no se vuelca encima'));
});

// ---------- las dependencias como relación de verdad: la época del roadmap y «this goes after» (VG 17-11) ----------

const CADENAS = { ...DETALLE, epoca: 'roadmap' };
const T_CAD = [
  fila('c1', 'Alfa', 'Uno', 'Medir la pared inventada', 'revisada'),
  conDetalle(fila('c2', 'Alfa', 'Uno', 'Lijar la pared inventada', 'pendiente'), { depende: ['c1'] }),
  conDetalle(fila('c3', 'Beta', 'Dos', 'Comprar la pintura inventada', 'pendiente'), { depende: ['c1'] }),
  conDetalle(fila('c4', 'Alfa', 'Uno', 'Pintar la pared inventada', 'pendiente'), { depende: ['c2', 'c3'] }),
  fila('c5', 'Beta', 'Dos', 'Barrer el patio inventado', 'pendiente'),
];

async function prepararConEpoca() {
  const duena = await generarClaves();
  const claves = { duena: { privada: duena.privada }, cosas: { Alfa: await generarClaves(), Beta: await generarClaves() } };
  const eje = await Eje.genesis({ identidad: 'duena', foco: ['la dueña'], t: DIA(1, 8), clave: duena.publica, privada: duena.privada, exigirFirmas: true, epoca: epocaDelVolcado(correspondenciaDe(CADENAS)) });
  return { eje, claves };
}
/** Las cadenas del libro por id de fila: [[sale, [fila, estado, une…]…]…], independientes y descartadas. */
function cadenasPorFila(eje) {
  const filaDe = new Map([...leerLibro(eje, 'duena', correspondenciaDe(CADENAS)).tareas].map(([f, x]) => [x.id, f]));
  const c = cadenas(eje, eje.genesisId);
  return {
    cadenas: c.cadenas.map((x) => ({ sale: x.sale ? filaDe.get(x.sale) : null, pasos: x.pasos.map((p) => [filaDe.get(p.id), p.estado, ...p.une.map((u) => '+' + filaDe.get(u))]) })),
    independientes: c.independientes.map((p) => [filaDe.get(p.id), p.estado]),
    descartadas: c.descartadas.length,
  };
}

test('con la época del roadmap: el libro nace con ella; las tareas llevan el tipo «task»; una relación «this goes after» por fila con «depende», en su 2.6 y en una segunda pasada; las cadenas son las de la tabla; repetir no escribe', async () => {
  const { eje, claves } = await prepararConEpoca();
  assert.equal(eje.epoca().id.slice(0, 8), '50fbac2f', 'la época del roadmap');
  assert.equal(conCadenas(eje), true);
  const uno = await volcar(eje, T_CAD, { claves, correspondencia: CADENAS, t: DIA(1) });
  assert.deepEqual([uno.noPuede, uno.paraLaDuena], [[], []]);
  const rel = uno.escritos.filter((e) => e.tipo === 'relacion');
  assert.deepEqual(rel.map((e) => e.fila + ' ' + e.quien + ' ' + e.plantilla), ['c2 Alfa this goes after', 'c3 Beta this goes after', 'c4 Alfa this goes after']);
  const ultimaTarea = Math.max(...uno.escritos.filter((e) => e.tipo === 'tarea').map((e) => eje.orden.indexOf(e.id)));
  assert.ok(rel.every((e) => eje.orden.indexOf(e.id) > ultimaTarea), 'la segunda pasada: después de todas las tareas');
  const libro = leerLibro(eje, 'duena', correspondenciaDe(CADENAS));
  for (const [f, t] of libro.tareas) assert.deepEqual(eje.obtener(t.id).payload[5], [NOMBRES_DE_LAS_CADENAS.tarea], f + ': el tipo «task»');
  const r4 = eje.obtener(rel[2].id);
  assert.deepEqual([r4.sobre, r4.en, r4.autor], [libro.tareas.get('c4').id, '2600000000', 'Alfa']);
  assert.deepEqual(r4.payload[6], [{ ref: libro.tareas.get('c2').id }, { ref: libro.tareas.get('c3').id }], 'todas sus anteriores en el 6');
  assert.deepEqual(notaDeDetalle(eje, 'c4', { columna: 'ref' }).depende.map((d) => d.id), ['c2', 'c3'], 'la nota conserva sus líneas «depende»');
  // Las cadenas: c1 → c2 → c4 (une c3), la bifurcación c1 → c3 (de otra casa) y c5 independiente.
  assert.deepEqual(cadenasPorFila(eje), {
    cadenas: [{ sale: null, pasos: [['c1', 'hecho'], ['c2', 'en curso'], ['c4', 'espera', '+c3']] }, { sale: 'c1', pasos: [['c3', 'en curso']] }],
    independientes: [['c5', 'en curso']],
    descartadas: 0,
  });
  // Otra vez: nada.
  const antes = eje.orden.length;
  assert.equal((await volcar(eje, T_CAD, { claves, correspondencia: CADENAS, t: DIA(2) })).escritos.length, 0);
  assert.equal(eje.orden.length, antes);
});

test('con la época del roadmap: cambiar un «depende» escribe otra relación y la lectura lo refleja; quitarlos todos, una relación sin 6; «hecho» (deliver) sale entregado y desbloquea, y el cierre la da por hecha', async () => {
  const { eje, claves } = await prepararConEpoca();
  await volcar(eje, T_CAD, { claves, correspondencia: CADENAS, t: DIA(1) });
  // c4 ya solo depende de c3.
  const solo3 = T_CAD.map((f) => (f.ref === 'c4' ? { ...f, depende: ['c3'] } : f));
  const dos = await volcar(eje, solo3, { claves, correspondencia: CADENAS, t: DIA(1, 10) });
  assert.deepEqual(dos.escritos.map((e) => e.fila + ' ' + e.tipo), ['c4 nota', 'c4 relacion']);
  assert.deepEqual(cadenasPorFila(eje).cadenas, [{ sale: null, pasos: [['c1', 'hecho'], ['c2', 'en curso']] }, { sale: 'c1', pasos: [['c3', 'en curso'], ['c4', 'espera']] }]);
  // «lista» (en el roadmap, «hecho»: deliver) en c3: sin el cierre no está hecha, pero su autor la entregó: sale
  // «entregado» y desbloquea a c4 (Core AGRAM 17-11: src/cadenas.js, ENTREGADA_DESBLOQUEA).
  const lista3 = solo3.map((f) => (f.ref === 'c3' ? { ...f, que: f.que, etapa: 'lista' } : f));
  await volcar(eje, lista3, { claves, correspondencia: CADENAS, t: DIA(1, 11) });
  assert.deepEqual(cadenasPorFila(eje).cadenas[1].pasos, [['c3', 'entregado'], ['c4', 'en curso']]);
  // «revisada» (en el roadmap, «comprobado»: close) en c3: desbloquea a c4.
  const cerrada3 = solo3.map((f) => (f.ref === 'c3' ? { ...f, etapa: 'revisada' } : f));
  await volcar(eje, cerrada3, { claves, correspondencia: CADENAS, t: DIA(1, 12) });
  assert.deepEqual(cadenasPorFila(eje).cadenas[1].pasos, [['c3', 'hecho'], ['c4', 'en curso']]);
  // c4 sin «depende»: una relación sin 6 (y una nota vacía); c4 queda independiente.
  const sinDep = cerrada3.map((f) => (f.ref === 'c4' ? fila('c4', 'Alfa', 'Uno', 'Pintar la pared inventada', 'pendiente') : f));
  const tres = await volcar(eje, sinDep, { claves, correspondencia: CADENAS, t: DIA(1, 13) });
  assert.deepEqual(tres.escritos.map((e) => e.fila + ' ' + e.tipo), ['c4 nota', 'c4 relacion']);
  const r = eje.obtener(tres.escritos[1].id);
  assert.deepEqual([r.payload[1], r.payload[6]], [[0], undefined], 'una relación sin 6');
  assert.ok(cadenasPorFila(eje).independientes.some(([f]) => f === 'c4'));
  assert.equal((await volcar(eje, sinDep, { claves, correspondencia: CADENAS, t: DIA(1, 14) })).escritos.length, 0);
  // Una casa sin clave: sus relaciones (como todo lo suyo) a noPuede.
  const sinBeta = await volcar(eje, sinDep.map((f) => (f.ref === 'c3' ? { ...f, depende: ['c2'] } : f)), { claves: { duena: claves.duena, cosas: { Alfa: claves.cosas.Alfa } }, correspondencia: CADENAS, t: DIA(1, 15), simular: true });
  assert.ok(sinBeta.noPuede.some((x) => x.paso.tipo === 'relacion' && x.paso.fila === 'c3' && x.motivo === 'sin la clave de Beta'), JSON.stringify(sinBeta.noPuede.map((x) => [x.paso.tipo, x.paso.fila, x.motivo])) + JSON.stringify(sinBeta.avisos));
});

test('un libro que ya existe con la 0 a secas y la correspondencia del roadmap: ni tipo ni relaciones; un aviso llano lo dice', async () => {
  const { eje, claves } = await preparar();
  assert.equal(conCadenas(eje), false);
  const inf = await volcar(eje, T_CAD, { claves, correspondencia: CADENAS, t: DIA(1) });
  assert.equal(inf.avisos[0], 'este libro nació con la época 0 a secas y la correspondencia pide la del roadmap: las dependencias no se escriben como relación ni las tareas llevan el tipo «task»; el libro se reescribirá entero, no se migra');
  assert.ok(!inf.escritos.some((e) => e.tipo === 'relacion'));
  const t4 = leerLibro(eje, 'duena', correspondenciaDe(CADENAS)).tareas.get('c4');
  assert.equal(eje.obtener(t4.id).payload[5], undefined, 'sin el tipo');
  assert.deepEqual(cadenas(eje, eje.genesisId), { cadenas: [], independientes: [], descartadas: [] });
  assert.ok(notaDeDetalle(eje, 'c4', { columna: 'ref' }).depende.length === 2, 'la nota sí');
  assert.throws(() => correspondenciaDe({ ...CORR, epoca: 'otra' }), /«epoca» es roadmap/);
});
