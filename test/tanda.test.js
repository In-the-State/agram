// La tanda (agram-equipo/CONTRATO_TANDA.md; VG, 18-11: «Todo o nada: o entran los cinco, o no entra ninguno»): la marca
// `contexto.tanda = { n, de, anterior }` dentro del registro firmado (src/evento.js), eje.anadirTanda (todo o nada, cada
// miembro viendo los anteriores), eje.anadir que no deja entrar un miembro suelto, la prueba en seco de la bandeja
// (eje.probarTanda / eje.vistaTanda: sin firmas, sin tocar el libro) y el libro rehecho desde una lista (reordenar,
// Eje.desde) con la tanda como una sola cosa. Y el vector para la puerta: test/vectores/tanda-de-tres.json, que esta
// prueba comprueba (con TANDA_VECTOR=escribir lo regenera). Claves de PRUEBA, generadas aquí.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { Eje } from '../src/eje.js';
import { generarClaves, firmar } from '../src/autoridad.js';
import { crearEvento, marcarTanda, esMiembroDeTanda, erroresDeTanda, erroresDeMarca, fallosDeTanda, partirTandas, idDeTanda, verificarId } from '../src/evento.js';
import { quemaDelCoste } from '../src/escritura.js';

const VECTOR = new URL('./vectores/tanda-de-tres.json', import.meta.url);
const T = (m) => '2026-11-18T10:' + String(m).padStart(2, '0') + ':00Z';

/** Un libro firmado de vg, con R suya emitida: { eje, vg }. */
async function libro() {
  const vg = await generarClaves();
  const eje = await Eje.genesis({ identidad: 'vg', foco: ['libro de prueba de tandas'], t: T(0), clave: vg.publica, privada: vg.privada, exigirFirmas: true, emision: [{ token: 'R', cantidad: 10 }] });
  return { eje, vg };
}

/** Los datos de un registro de `autor` sobre `sobre` que paga el coste de escribir su payload. */
function datos(eje, autor, sobre, payload, t, mas = []) {
  return { autor, sobre, t, movimientos: [quemaDelCoste(autor, payload, 'minuto', { eje }), ...mas], payload };
}

/** Firma cada miembro con la privada de su autor (`claves`: autor → { privada }). */
const firmarTodos = (eventos, claves) => Promise.all(eventos.map((ev) => firmar(ev, claves[ev.autor].privada)));

/**
 * Lo que la bandeja hace al lanzar: compone sobre la vista en seco, marca y firma. La tanda de tres de siempre: vg
 * invita a ana (con la clave de ana), ana acepta (su alta, que recoge lo que la invitación le guarda) y ana escribe sobre
 * su alta. Cada uno depende del anterior: el 2 cuelga del 1 y recoge lo que él bloquea; el 3 es de quien nace en el 2.
 */
async function tandaDeTres(eje, vg) {
  const ana = await generarClaves();
  const { vista } = await eje.vistaTanda();
  const inv = await vista.invitar({ autor: 'vg', invitado: 'ana', clave: ana.publica, t: T(1) });
  const alta = await vista.aceptar(inv.id, { publica: ana.publica }, { t: T(2) });
  const nota = await crearEvento(datos(vista, 'ana', alta.id, ['Hola, soy ana'], T(3)));
  const candidatos = [inv, alta, nota];
  const marcados = await marcarTanda(candidatos);
  return { ana, candidatos, tanda: await firmarTodos(marcados, { vg, ana }) };
}

/** Todo lo que se puede leer del eje, para comparar antes y después. */
function resumen(eje) {
  const mapa = (m) => [...m].map(([k, v]) => [k, v instanceof Map ? mapa(v) : v]);
  return JSON.stringify({
    orden: eje.orden,
    eventos: [...eje.eventos.keys()],
    claves: mapa(eje.claves),
    hijos: [...eje.hijos].map(([k, v]) => [k, v.map((e) => e.id)]),
    identidades: eje.identidades(),
    saldos: mapa(eje.saldos),
    bloqueados: mapa(eje.bloqueados),
    series: eje.series(),
    longitud: eje.libro.longitud,
    diario: eje.libro.asientos({}).length,
    transacciones: eje.libro.transacciones().map((tx) => tx.id),
    versiones: eje.versiones().map((v) => v.nombre),
    tMaximo: eje.tMaximo([]),
    reloj: eje.relojExterno,
    prefijo: eje.conPrefijo(eje.orden.at(-1).slice(0, 6)),
    sobreGenesis: eje.sobre(eje.genesisId).map((e) => e.id),
    altas: eje.identidades().map((i) => eje.alta(i)?.id),
    demostracion: eje.demostracion,
  });
}

test('la marca: forma, tanda bien formada, partir una lista', async () => {
  const { eje, vg } = await libro();
  const { tanda } = await tandaDeTres(eje, vg);
  assert.ok(tanda.every(esMiembroDeTanda));
  assert.deepEqual(tanda.map((e) => e.contexto.tanda), [{ n: 1, de: 3 }, { n: 2, de: 3, anterior: tanda[0].id }, { n: 3, de: 3, anterior: tanda[1].id }]);
  assert.equal(tanda[1].sobre, tanda[0].id, 'marcarTanda cambia el id del anterior por el nuevo');
  for (const ev of tanda) assert.ok(await verificarId(ev), 'la marca entra en el id');
  assert.deepEqual(erroresDeTanda(tanda), []);
  assert.equal(idDeTanda(tanda), tanda[0].id);
  assert.equal(esMiembroDeTanda({ contexto: {} }), false);
  assert.deepEqual(erroresDeMarca({ contexto: { tanda: { n: 1, de: 1 } } }).length, 1, 'no hay tandas de uno');
  assert.deepEqual(erroresDeMarca({ contexto: { tanda: { n: 1, de: 33 } } }).length, 1);
  assert.deepEqual(erroresDeMarca({ contexto: { tanda: { n: 1, de: 2, anterior: 'a'.repeat(64) } } }).length, 1, 'el 1 no lleva anterior');
  assert.deepEqual(erroresDeMarca({ contexto: { tanda: { n: 2, de: 2 } } }).length, 1, 'el 2 sí');
  assert.deepEqual(erroresDeMarca({ contexto: { tanda: { n: 3, de: 2, anterior: 'a'.repeat(64) } } }).length, 1, 'n hasta de');
  assert.deepEqual(erroresDeMarca({ contexto: { tanda: null } }).length, 1);
  // Incompleta, desordenada, con «anterior» mal.
  assert.ok(erroresDeTanda(tanda.slice(0, 2)).length > 0);
  assert.equal(fallosDeTanda([tanda[0], tanda[2], tanda[1]])[0].indice, 1);
  // Partir: suelto, tanda entera, tanda partida, miembro sin su 1, tanda cortada al final.
  const g = eje.obtener(eje.genesisId);
  const partes = partirTandas([g, ...tanda]);
  assert.deepEqual(partes.map((p) => [p.eventos.length, p.marcada, p.errores.length]), [[1, false, 0], [3, true, 0]]);
  const partida = partirTandas([tanda[0], g, tanda[1], tanda[2]]);
  assert.deepEqual(partida.map((p) => [p.eventos.map((e) => e.id), p.errores.length > 0]), [[tanda.map((e) => e.id), true], [[g.id], false]]);
  assert.deepEqual(partirTandas([tanda[1]]).map((p) => [p.marcada, p.tanda, p.errores.length]), [[true, null, 1]]);
  const cortada = partirTandas([g, tanda[0], tanda[1]]);
  assert.equal(cortada[1].alFinal, true, 'le faltan miembros solo porque la lista se acaba');
  assert.equal(partirTandas([tanda[0], tanda[1], g])[0].alFinal, false);
});

test('una tanda válida entra entera, con cada miembro viendo los anteriores; anadir no deja entrar un miembro suelto', async () => {
  const { eje, vg } = await libro();
  const { tanda } = await tandaDeTres(eje, vg);
  const antes = resumen(eje);
  for (const ev of tanda) {
    await assert.rejects(eje.anadir(ev), /no entra suelto/);
    assert.ok((await eje.validar(ev)).some((t) => /no entra suelto/.test(t)));
  }
  assert.equal(resumen(eje), antes);
  // Antes de firmar, la bandeja puede volver a probar en seco lo ya marcado (con sus ids nuevos).
  const { candidatos } = await tandaDeTres(eje, vg);
  const marcados = await marcarTanda(candidatos);
  assert.deepEqual((await eje.probarTanda(marcados)).map((x) => x.ok), [true, true, true]);
  assert.equal(resumen(eje), antes);
  const n = eje.orden.length;
  const r = await eje.anadirTanda(tanda);
  assert.equal(r.ok, true, JSON.stringify(r.motivos));
  assert.equal(r.tanda, tanda[0].id);
  assert.deepEqual(r.eventos.map((e) => e.id), tanda.map((e) => e.id));
  assert.deepEqual(eje.orden.slice(n), tanda.map((e) => e.id), 'seguidos y en orden');
  assert.equal(eje.esPersona('ana'), true, 'el alta del 2 viene en la tanda');
  assert.equal(eje.alta('ana').id, tanda[1].id);
  // Otra vez: ya está registrada, nada entra.
  const otra = await eje.anadirTanda(tanda);
  assert.equal(otra.ok, false);
  assert.equal(otra.indice, 0);
  // El libro, rehecho desde su lista, la vuelve a tomar entera.
  const copia = await Eje.desde(eje.orden.map((id) => eje.obtener(id)), { exigirFirmas: true });
  assert.equal(resumen(copia), resumen(eje));
});

test('si falla el último, el libro queda idéntico; también si falla una firma o la marca', async () => {
  const { eje, vg } = await libro();
  const { tanda, ana } = await tandaDeTres(eje, vg);
  const orden = eje.orden;
  const libroAntes = eje.libro;
  const antes = resumen(eje);
  // El 3 de ana, firmado por vg: no pasa.
  const malFirmado = [...tanda.slice(0, 2), await firmar(tanda[2], vg.privada, 'ana')];
  const r = await eje.anadirTanda(malFirmado);
  assert.equal(r.ok, false);
  assert.equal(r.indice, 2);
  assert.equal(r.id, tanda[2].id);
  assert.ok(r.motivos.length > 0 && r.motivos.every((m) => typeof m.texto === 'string'));
  assert.equal(resumen(eje), antes);
  assert.equal(eje.orden, orden, 'ni el orden se ha sustituido');
  assert.equal(eje.libro, libroAntes);
  // El último no pasa una regla: gasta R de vg que no tiene.
  const { vista } = await eje.vistaTanda();
  const inv = await vista.invitar({ autor: 'vg', invitado: 'ana', clave: ana.publica, t: T(1) });
  const alta = await vista.aceptar(inv.id, { publica: ana.publica }, { t: T(2) });
  const gasta = await crearEvento(datos(vista, 'vg', inv.id, ['Doy lo que no tengo'], T(3), [{ token: 'R', emisor: 'vg', cantidad: 500, de: 'vg', a: 'ana' }]));
  const tres = await firmarTodos(await marcarTanda([inv, alta, gasta]), { vg, ana });
  const r2 = await eje.anadirTanda(tres);
  assert.equal(r2.ok, false);
  assert.equal(r2.indice, 2);
  assert.equal(resumen(eje), antes);
  assert.equal(eje.orden, orden);
  // La firma de mentira de la vista en seco no pasa en el libro de verdad.
  const deLaVista = vista.obtener(inv.id);
  assert.equal(typeof deLaVista.firma, 'string');
  await assert.rejects(eje.anadir(deLaVista), /firma/);
  // Incompleta, desordenada, con «anterior» mal, de uno, de 33.
  const casos = [
    [tanda.slice(0, 2), 0],
    [[tanda[0], tanda[2], tanda[1]], 1],
    [[tanda[0]], 0],
    [Array.from({ length: 33 }, () => tanda[0]), 0],
  ];
  const conAnteriorMal = await crearEvento({ ...tanda[1], contexto: { ...tanda[1].contexto, tanda: { n: 2, de: 3, anterior: 'ab'.repeat(32) } } });
  casos.push([[tanda[0], await firmar(conAnteriorMal, ana.privada), tanda[2]], 1]);
  for (const [lista, indice] of casos) {
    const x = await eje.anadirTanda(lista);
    assert.equal(x.ok, false);
    assert.equal(x.indice, indice, JSON.stringify(x.motivos));
    assert.equal(resumen(eje), antes);
  }
  // Y entera, sí.
  assert.equal((await eje.anadirTanda(tanda)).ok, true);
});

test('el segundo gasta lo que le da el primero: entra; sin el primero, no', async () => {
  const { eje, vg } = await libro();
  const bea = await generarClaves();
  const { vista } = await eje.vistaTanda();
  const inv = await vista.invitar({ autor: 'vg', invitado: 'bea', clave: bea.publica, da: [{ token: 'R', cantidad: 2 }], t: T(1) });
  const alta = await vista.aceptar(inv.id, { publica: bea.publica }, { t: T(2) });
  // bea gasta las dos R de vg que acaba de recoger: se las devuelve.
  const devuelve = await crearEvento(datos(vista, 'bea', alta.id, ['Te devuelvo tu R'], T(3), [{ token: 'R', emisor: 'vg', cantidad: 2, de: 'bea', a: 'vg' }]));
  const resultados = await eje.probarTanda([inv, alta, devuelve]);
  assert.deepEqual(resultados.map((r) => r.ok), [true, true, true], JSON.stringify(resultados));
  const tanda = await firmarTodos(await marcarTanda([inv, alta, devuelve]), { vg, bea });
  const r = await eje.anadirTanda(tanda);
  assert.equal(r.ok, true, JSON.stringify(r.motivos));
  assert.equal(eje.saldo('bea', 'R:vg'), 0);
});

test('probar en seco: no toca el libro, marca el que falla y sigue como si no estuviera', async () => {
  const { eje, vg } = await libro();
  const ana = await generarClaves();
  const antes = resumen(eje);
  const { vista } = await eje.vistaTanda();
  assert.equal(vista.enSeco, true);
  assert.equal(resumen(vista), antes, 'la vista es una copia fiel del libro');
  assert.equal(eje.enSeco, false);
  const r1 = await crearEvento(datos(vista, 'vg', eje.genesisId, ['Uno'], T(1)));
  const malo = await crearEvento(datos(vista, 'vg', eje.genesisId, ['Doy lo que no tengo'], T(2), [{ token: 'R', emisor: 'vg', cantidad: 500, de: 'vg', a: 'vg', estado: 'bloqueo', salida: 'x' }]));
  const r3 = await crearEvento(datos(vista, 'vg', r1.id, ['Tres, sobre el uno'], T(3)));
  const huerfano = await crearEvento(datos(vista, 'vg', malo.id, ['Sobre el malo'], T(4)));
  const res = await eje.probarTanda([r1, malo, r3, huerfano]);
  assert.deepEqual(res.map((r) => r.ok), [true, false, true, false]);
  assert.ok(res[1].motivos.length > 0 && res[1].motivos.every((m) => typeof m.texto === 'string'));
  assert.deepEqual(res[0].motivos, []);
  assert.equal(resumen(eje), antes, 'el libro no se ha tocado');
  // Sin firmas: vg tiene clave y sus candidatos van sin firmar; en el libro de verdad, «who has a key signs» no los deja.
  assert.equal(r1.firma, undefined);
  assert.ok((await eje.validar(r1)).length > 0);
  // La vista con lo que pasa aplicado, para componer el siguiente sobre ella (los defectos leen el libro).
  const { vista: v2, resultados } = await eje.vistaTanda([r1]);
  assert.equal(resultados[0].ok, true);
  assert.ok(v2.obtener(r1.id));
  assert.equal(eje.obtener(r1.id), undefined);
  const alta = await v2.invitar({ autor: 'vg', invitado: 'ana', clave: ana.publica, t: T(5) });
  assert.ok(v2.obtener(alta.id) && !eje.obtener(alta.id));
  // Más de 32: el 33 no cabe en la tanda.
  const muchos = [];
  for (let k = 0; k < 33; k++) muchos.push(await crearEvento(datos(vista, 'vg', eje.genesisId, ['r' + k], T(6))));
  const res33 = await eje.probarTanda(muchos);
  assert.equal(res33[31].ok, true);
  assert.equal(res33[32].ok, false);
  assert.match(res33[32].motivos.at(-1).texto, /como mucho 32/);
  assert.equal(resumen(eje), antes);
});

test('reordenar: una tanda partida se rechaza entera; seguida, entra', async () => {
  const { eje, vg } = await libro();
  const { tanda } = await tandaDeTres(eje, vg);
  assert.equal((await eje.anadirTanda(tanda)).ok, true);
  const x = await eje.escribir(datos(eje, 'vg', eje.genesisId, ['Suelto'], T(1)), vg.privada);
  const previos = eje.orden.slice(0, eje.orden.length - 4);
  // Seguida, en otro sitio: entra entera.
  const bien = await eje.reordenar([...previos, x.id, ...tanda.map((e) => e.id)]);
  assert.deepEqual(bien.rechazados, []);
  assert.deepEqual(eje.orden.slice(-4), [x.id, ...tanda.map((e) => e.id)]);
  // Partida por el suelto: se rechaza entera, el suelto entra.
  const partida = await eje.reordenar([...previos, tanda[0].id, x.id, tanda[1].id, tanda[2].id]);
  assert.deepEqual(partida.rechazados.map((r) => r.id), tanda.map((e) => e.id));
  assert.ok(partida.rechazados.every((r) => r.tanda === tanda[0].id && /se rechaza entera/.test(r.motivo)));
  assert.deepEqual(eje.orden.slice(previos.length), [x.id]);
  assert.equal(eje.alta('ana'), null);
});

test('reordenar: si un miembro no pasa las reglas en el orden nuevo, la tanda entera fuera y el libro sigue', async () => {
  const { eje, vg } = await libro();
  const bea = await generarClaves();
  // Una tanda de vg que gasta sus 10 R (las bloquea), y otro registro suelto de vg que también las gasta: en el orden
  // nuevo el suelto va antes, y el segundo miembro ya no tiene con qué.
  const { vista } = await eje.vistaTanda();
  const uno = await crearEvento(datos(vista, 'vg', eje.genesisId, ['Uno'], T(1)));
  const gasta = await crearEvento(datos(vista, 'vg', eje.genesisId, ['Bloqueo mis R'], T(1), [{ token: 'R', emisor: 'vg', cantidad: 10, de: 'vg', a: 'vg', estado: 'bloqueo', salida: 'a' }]));
  const tanda = await firmarTodos(await marcarTanda([uno, gasta]), { vg });
  assert.equal((await eje.anadirTanda(tanda)).ok, true);
  const previos = eje.orden.slice(0, -2);
  const suelto = await firmar(await crearEvento(datos(eje, 'vg', eje.genesisId, ['Las bloqueo yo antes'], T(1), [{ token: 'R', emisor: 'vg', cantidad: 10, de: 'vg', a: 'vg', estado: 'bloqueo', salida: 'b' }])), vg.privada);
  const r = await eje.reordenar([...previos, suelto, ...tanda]);
  assert.deepEqual(r.rechazados.map((x) => x.id), tanda.map((e) => e.id));
  assert.match(r.rechazados[0].motivo, /el miembro 2 no pasa/);
  assert.deepEqual(eje.orden.slice(previos.length), [suelto.id]);
  assert.equal(eje.bloqueado('vg', 'R:vg', 'b'), 10);
  assert.equal(eje.bloqueado('vg', 'R:vg', 'a'), 0);
  void bea;
});

test('Eje.desde: una tanda incompleta o partida en la lista no entra (lanza)', async () => {
  const { eje, vg } = await libro();
  const { tanda } = await tandaDeTres(eje, vg);
  const base = eje.orden.map((id) => eje.obtener(id));
  await assert.rejects(Eje.desde([...base, tanda[0], tanda[1]], { exigirFirmas: true }), /se rechaza entera/);
  await assert.rejects(Eje.desde([...base, tanda[1], tanda[2]], { exigirFirmas: true }), /sin su miembro 1/);
  const entera = await Eje.desde([...base, ...tanda], { exigirFirmas: true });
  assert.deepEqual(entera.orden.slice(-3), tanda.map((e) => e.id));
});

// ---------- el vector para la puerta (Core AARPIA) ----------

/** Genera el vector: un libro, una tanda válida de tres y una inválida (su segundo miembro no pasa una regla). */
async function generarVector() {
  const { eje, vg } = await libro();
  const libroEventos = eje.orden.map((id) => eje.obtener(id));
  const { tanda, ana } = await tandaDeTres(eje, vg);
  // La inválida: vg escribe uno; en el segundo bloquea 500 R suyas, que no tiene; el tercero cuelga del primero.
  const { vista } = await eje.vistaTanda();
  const uno = await crearEvento(datos(vista, 'vg', eje.genesisId, ['Primero de la tanda inválida'], T(1)));
  const dos = await crearEvento(datos(vista, 'vg', uno.id, ['Bloqueo lo que no tengo'], T(2), [{ token: 'R', emisor: 'vg', cantidad: 500, de: 'vg', a: 'vg', estado: 'bloqueo', salida: 'nada' }]));
  const tres = await crearEvento(datos(vista, 'vg', uno.id, ['Tercero'], T(3)));
  const invalida = await firmarTodos(await marcarTanda([uno, dos, tres]), { vg });
  const valida = await Eje.desde(libroEventos, { exigirFirmas: true });
  const ok = await valida.anadirTanda(tanda);
  const mala = await (await Eje.desde(libroEventos, { exigirFirmas: true })).anadirTanda(invalida);
  void ana;
  return {
    descripcion: 'CONTRATO_TANDA (agram-equipo): una tanda válida de tres y una inválida, sobre el mismo libro. Claves de PRUEBA, generadas por test/tanda.test.js (TANDA_VECTOR=escribir). Las firmas BIP-340 llevan azar auxiliar: al regenerar cambian las claves, los ids y las firmas, no la forma ni el resultado.',
    exigirFirmas: true,
    libro: libroEventos,
    valida: {
      eventos: tanda,
      tanda: tanda[0].id,
      ids: tanda.map((e) => e.id),
      esperado: { ok: true, tanda: ok.tanda, eventos: ok.eventos.map((e) => e.id) },
    },
    invalida: {
      eventos: invalida,
      tanda: invalida[0].id,
      ids: invalida.map((e) => e.id),
      esperado: { ok: false, indice: mala.indice, id: mala.id, motivos: mala.motivos },
    },
  };
}

test('el vector tanda-de-tres: la válida entra entera; la inválida falla en el segundo con sus motivos', async () => {
  if (process.env.TANDA_VECTOR === 'escribir' || !existsSync(VECTOR)) writeFileSync(VECTOR, JSON.stringify(await generarVector(), null, 2) + '\n');
  const V = JSON.parse(readFileSync(VECTOR, 'utf8'));
  for (const ev of [...V.libro, ...V.valida.eventos, ...V.invalida.eventos]) assert.ok(await verificarId(ev), 'cada id es el hash de su cuerpo');
  assert.deepEqual(erroresDeTanda(V.valida.eventos), []);
  assert.deepEqual(erroresDeTanda(V.invalida.eventos), []);
  assert.deepEqual(V.valida.eventos.map((e) => e.id), V.valida.ids);
  const a = await Eje.desde(V.libro, { exigirFirmas: V.exigirFirmas });
  const r = await a.anadirTanda(V.valida.eventos);
  assert.deepEqual({ ok: r.ok, tanda: r.tanda, eventos: r.eventos.map((e) => e.id) }, V.valida.esperado);
  const b = await Eje.desde(V.libro, { exigirFirmas: V.exigirFirmas });
  const antes = resumen(b);
  const m = await b.anadirTanda(V.invalida.eventos);
  assert.deepEqual({ ok: m.ok, indice: m.indice, id: m.id, motivos: m.motivos }, V.invalida.esperado);
  assert.equal(V.invalida.esperado.indice, 1, 'falla el segundo');
  assert.equal(resumen(b), antes);
  // Y lo que se regenera hoy da lo mismo (con otras claves y otros ids).
  const hoy = await generarVector();
  assert.equal(hoy.valida.esperado.ok, true);
  assert.deepEqual([hoy.invalida.esperado.indice, hoy.invalida.esperado.motivos], [V.invalida.esperado.indice, V.invalida.esperado.motivos]);
});
