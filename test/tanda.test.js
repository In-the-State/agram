// La tanda (agram-equipo/CONTRATO_TANDA.md, con sus «Precisiones tras las tres entregas»; VG, 18-11: «Todo o nada: o
// entran los cinco, o no entra ninguno»): la marca `contexto.tanda = { n, de, anterior }` dentro del registro firmado
// (src/evento.js: estricta y de un solo autor), eje.anadirTanda (todo o nada, cada miembro viendo los anteriores; los
// duplicados antes que la forma), eje.anadir que no deja entrar un miembro suelto, la prueba en seco de la bandeja
// (eje.probarTanda / eje.vistaTanda: sin firmas, sin tocar el libro, sin prefijos entre miembros), el libro rehecho desde
// una lista (reordenar, Eje.desde) con la tanda como una sola cosa y la tanda que abre un libro (el génesis, miembro 1).
// Y el vector para la puerta: test/vectores/tanda-de-tres.json, que esta prueba comprueba (con TANDA_VECTOR=escribir lo
// regenera). Claves de PRUEBA, generadas aquí.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { Eje, TANDA_YA_REGISTRADA } from '../src/eje.js';
import { generarClaves, firmar } from '../src/autoridad.js';
import { crearEvento, marcarTanda, esMiembroDeTanda, erroresDeTanda, erroresDeMarca, fallosDeTanda, partirTandas, idDeTanda, verificarId, prefijosAMiembros, canonico, bytesDeMiembro, bytesDeTanda, TANDA_TOPES, TANDA_TOPE_POR_MIEMBRO, TANDA_TOPE_POR_PETICION, REGLA_NO_CABE } from '../src/evento.js';
import { quemaDelCoste } from '../src/escritura.js';

const VECTOR = new URL('./vectores/tanda-de-tres.json', import.meta.url);
const T = (m) => '2026-11-18T10:' + String(m).padStart(2, '0') + ':00Z';

/**
 * Un libro firmado de vg, con R suya emitida y una invitación a ana (con la clave de ana) ya escrita: { eje, vg, ana,
 * inv }. Lo que la tanda de ana hace después: aceptar (su alta) y escribir sobre ella.
 */
async function libro() {
  const vg = await generarClaves();
  const ana = await generarClaves();
  const eje = await Eje.genesis({ identidad: 'vg', foco: ['libro de prueba de tandas'], t: T(0), clave: vg.publica, privada: vg.privada, exigirFirmas: true, emision: [{ token: 'R', cantidad: 10 }] });
  const inv = await eje.invitar({ autor: 'vg', invitado: 'ana', clave: ana.publica, da: [{ token: 'R', cantidad: 2 }], t: T(1), privada: vg.privada });
  return { eje, vg, ana, inv };
}

/** Los datos de un registro de `autor` sobre `sobre` que paga el coste de escribir su payload. */
function datos(eje, autor, sobre, payload, t, mas = []) {
  return { autor, sobre, t, movimientos: [quemaDelCoste(autor, payload, 'minuto', { eje }), ...mas], payload };
}

/** Firma cada miembro con la privada de su autor (`claves`: autor → { privada }). */
const firmarTodos = (eventos, claves) => Promise.all(eventos.map((ev) => firmar(ev, claves[ev.autor].privada)));

/**
 * Lo que la bandeja hace al lanzar (CONTRATO_TANDA, precisión 12): compone sobre la vista en seco, marca y firma. La
 * tanda de tres de siempre, toda de ana: acepta la invitación (su alta, que recoge lo que la invitación le guarda),
 * escribe sobre su alta y escribe sobre lo anterior. Cada uno depende del anterior: el 2 es de quien nace en el 1 y el 3
 * cuelga del 2. `ultimo` cambia el tercero (para hacerlo fallar).
 */
async function tandaDeTres({ eje, ana, inv }, { ultimo } = {}) {
  const { vista } = await eje.vistaTanda();
  const alta = await vista.aceptar(inv.id, { publica: ana.publica }, { t: T(2) });
  const nota = await crearEvento(datos(vista, 'ana', alta.id, ['Hola, soy ana'], T(3)));
  const tercero = await crearEvento(ultimo ? ultimo(vista, nota) : datos(vista, 'ana', nota.id, ['Y esto cuelga de mi nota'], T(3)));
  const candidatos = [alta, nota, tercero];
  const marcados = await marcarTanda(candidatos);
  return { candidatos, marcados, tanda: await firmarTodos(marcados, { ana }) };
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

/** Una copia de `ev` con otro contexto.tanda, firmada de nuevo por `privada`. */
async function conMarca(ev, tanda, privada) {
  return firmar(await crearEvento({ ...ev, contexto: { ...ev.contexto, tanda } }), privada);
}

test('la marca: estricta, de un solo autor, índice null si falla la lista entera; partir una lista', async () => {
  const L = await libro();
  const { tanda } = await tandaDeTres(L);
  assert.ok(tanda.every(esMiembroDeTanda));
  assert.deepEqual(tanda.map((e) => e.contexto.tanda), [{ n: 1, de: 3 }, { n: 2, de: 3, anterior: tanda[0].id }, { n: 3, de: 3, anterior: tanda[1].id }]);
  assert.equal(tanda[1].sobre, tanda[0].id, 'marcarTanda cambia el id del anterior por el nuevo');
  assert.equal(tanda[2].sobre, tanda[1].id);
  for (const ev of tanda) assert.ok(await verificarId(ev), 'la marca entra en el id');
  assert.deepEqual(erroresDeTanda(tanda), []);
  assert.equal(idDeTanda(tanda), tanda[0].id);
  assert.equal(esMiembroDeTanda({ contexto: {} }), false);
  const una = (m) => erroresDeMarca({ contexto: { tanda: m } }).length;
  assert.equal(una({ n: 1, de: 1 }), 1, 'no hay tandas de uno');
  assert.equal(una({ n: 1, de: 33 }), 1);
  assert.equal(una({ n: 1, de: 2, anterior: 'a'.repeat(64) }), 1, 'el 1 no lleva anterior');
  assert.equal(una({ n: 1, de: 2, anterior: undefined }), 1, 'ni siquiera vacío');
  assert.equal(una({ n: 2, de: 2 }), 1, 'el 2 sí');
  assert.equal(una({ n: 3, de: 2, anterior: 'a'.repeat(64) }), 1, 'n hasta de');
  assert.equal(una({ n: 1, de: 2, nota: 'x' }), 1, 'claves de sobra: fallo');
  assert.equal(una(null), 1);
  // Los fallos de la lista entera van con índice null; los de un miembro, con el suyo.
  const indices = (lista) => fallosDeTanda(lista).map((f) => f.indice);
  assert.deepEqual(indices([]), [null]);
  assert.deepEqual(indices([tanda[0]]), [null, null], 'de uno, y su «de» no es su largo');
  assert.deepEqual(indices('no'), [null]);
  assert.deepEqual(indices(tanda.slice(0, 2)), [null], 'incompleta: el «de» no coincide con el largo');
  assert.deepEqual(indices([tanda[0], tanda[2], tanda[1]]), [1, 2]);
  // Un solo autor: el índice del primero que difiere del miembro 1.
  const ajeno = { ...tanda[2], autor: 'otro' };
  assert.deepEqual(fallosDeTanda([tanda[0], tanda[1], ajeno]).map((f) => f.indice), [2]);
  assert.match(fallosDeTanda([tanda[0], tanda[1], ajeno])[0].texto, /mismo autor/);
  await assert.rejects(marcarTanda([...tanda.slice(0, 1).map(({ contexto, ...r }) => r), { ...ajeno, contexto: {} }]), /mismo autor/);
  // Partir: suelto, tanda entera, tanda partida, miembro sin su 1, tanda cortada al final.
  const { eje } = L;
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
  const L = await libro();
  const { eje } = L;
  const { tanda, candidatos } = await tandaDeTres(L);
  const antes = resumen(eje);
  for (const ev of tanda) {
    await assert.rejects(eje.anadir(ev), /no entra suelto/);
    assert.ok((await eje.validar(ev)).some((t) => /no entra suelto/.test(t)));
  }
  assert.equal(resumen(eje), antes);
  // Antes de firmar, la bandeja vuelve a probar en seco lo ya marcado (con sus ids nuevos).
  const marcados = await marcarTanda(candidatos);
  assert.deepEqual((await eje.probarTanda(marcados)).map((x) => x.ok), [true, true, true]);
  assert.equal(resumen(eje), antes);
  const n = eje.orden.length;
  const r = await eje.anadirTanda(tanda);
  assert.equal(r.ok, true, JSON.stringify(r.motivos));
  assert.equal(r.tanda, tanda[0].id);
  assert.deepEqual(r.eventos.map((e) => e.id), tanda.map((e) => e.id));
  assert.deepEqual(eje.orden.slice(n), tanda.map((e) => e.id), 'seguidos y en orden');
  assert.equal(eje.esPersona('ana'), true, 'el alta del 1 la ve el 2');
  assert.equal(eje.alta('ana').id, tanda[0].id);
  // Otra vez: ya está entera, { indice: null, «tanda ya registrada» }.
  const otra = await eje.anadirTanda(tanda);
  assert.deepEqual([otra.ok, otra.indice, otra.id, otra.motivos.map((m) => m.texto)], [false, null, null, [TANDA_YA_REGISTRADA]]);
  // El libro, rehecho desde su lista, la vuelve a tomar entera.
  const copia = await Eje.desde(eje.orden.map((id) => eje.obtener(id)), { exigirFirmas: true });
  assert.equal(resumen(copia), resumen(eje));
});

test('parte ya asentada: el índice del primer miembro que ya estaba', async () => {
  const L = await libro();
  const { eje, ana } = L;
  const { tanda } = await tandaDeTres(L);
  assert.equal((await eje.anadirTanda(tanda)).ok, true);
  // Una tanda nueva de ana que reutiliza su nota ya guardada como miembro 2: la cadena no casa, pero el duplicado va antes.
  const nueva = await crearEvento(datos(eje, 'ana', tanda[0].id, ['Otra'], T(4)));
  const recompuesta = [await conMarca(nueva, { n: 1, de: 2 }, ana.privada), tanda[1]];
  const r = await eje.anadirTanda(recompuesta);
  assert.deepEqual([r.ok, r.indice, r.id], [false, 1, tanda[1].id]);
});

test('si falla el último, el libro queda idéntico; también si falla una firma, la marca o el autor', async () => {
  const L = await libro();
  const { eje, vg, ana } = L;
  const { tanda } = await tandaDeTres(L);
  const orden = eje.orden;
  const libroAntes = eje.libro;
  const antes = resumen(eje);
  // El 3 de ana, firmado por vg: no pasa.
  const malFirmado = [...tanda.slice(0, 2), await firmar(tanda[2], vg.privada, 'ana')];
  const r = await eje.anadirTanda(malFirmado);
  assert.deepEqual([r.ok, r.indice, r.id], [false, 2, tanda[2].id]);
  assert.ok(r.motivos.length > 0 && r.motivos.every((m) => typeof m.texto === 'string'));
  assert.equal(resumen(eje), antes);
  assert.equal(eje.orden, orden, 'ni el orden se ha sustituido');
  assert.equal(eje.libro, libroAntes);
  // El último no pasa una regla: ana da 500 R de vg que no tiene.
  const { tanda: tres } = await tandaDeTres(L, { ultimo: (vista, nota) => datos(vista, 'ana', nota.id, ['Doy lo que no tengo'], T(3), [{ token: 'R', emisor: 'vg', cantidad: 500, de: 'ana', a: 'vg' }]) });
  const r2 = await eje.anadirTanda(tres);
  assert.deepEqual([r2.ok, r2.indice], [false, 2]);
  assert.equal(resumen(eje), antes);
  assert.equal(eje.orden, orden);
  // La firma de mentira de la vista en seco no pasa en el libro de verdad.
  const { vista } = await eje.vistaTanda();
  const deLaVista = await vista.escribir(datos(vista, 'vg', eje.genesisId, ['En seco'], T(2)));
  assert.equal(typeof vista.obtener(deLaVista.id).firma, 'string');
  await assert.rejects(eje.anadir(vista.obtener(deLaVista.id)), /firma/);
  // Incompleta, de uno, de 33 (índice null); desordenada, con «anterior» mal, con claves de sobra, con otro autor.
  const casos = [
    [tanda.slice(0, 2), null],
    [[tanda[0]], null],
    [[], null],
    [Array.from({ length: 33 }, () => tanda[0]), null],
    [[tanda[0], tanda[2], tanda[1]], 1],
    [[tanda[0], await conMarca(tanda[1], { n: 2, de: 3, anterior: 'ab'.repeat(32) }, ana.privada), tanda[2]], 1],
    [[await conMarca(tanda[0], { n: 1, de: 3, va: 'de sobra' }, ana.privada), tanda[1], tanda[2]], 0],
    [[await conMarca(tanda[0], { n: 1, de: 3, anterior: tanda[2].id }, ana.privada), tanda[1], tanda[2]], 0],
  ];
  const deVg = await firmar(await crearEvento({ ...tanda[2], autor: 'vg', movimientos: [quemaDelCoste('vg', tanda[2].payload, 'minuto', { eje })] }), vg.privada);
  casos.push([[tanda[0], tanda[1], deVg], 2]);
  for (const [lista, indice] of casos) {
    const x = await eje.anadirTanda(lista);
    assert.equal(x.ok, false);
    assert.equal(x.indice, indice, JSON.stringify(x.motivos));
    if (indice === null) assert.equal(x.id, null);
    assert.equal(resumen(eje), antes);
  }
  // Y entera, sí.
  assert.equal((await eje.anadirTanda(tanda)).ok, true);
});

test('el segundo gasta lo que le da el primero: entra', async () => {
  const L = await libro();
  const { eje, ana } = L;
  const { tanda, candidatos } = await tandaDeTres(L, { ultimo: (vista, nota) => datos(vista, 'ana', nota.id, ['Te devuelvo tu R'], T(3), [{ token: 'R', emisor: 'vg', cantidad: 2, de: 'ana', a: 'vg' }]) });
  assert.deepEqual((await eje.probarTanda(candidatos)).map((r) => r.ok), [true, true, true]);
  // Sin el alta delante, el que devuelve no tiene con qué.
  assert.deepEqual((await eje.probarTanda([candidatos[2]])).map((r) => r.ok), [false]);
  const r = await eje.anadirTanda(tanda);
  assert.equal(r.ok, true, JSON.stringify(r.motivos));
  assert.equal(eje.saldo('ana', 'R:vg'), 0);
  void ana;
});

test('probar en seco: no toca el libro, marca el que falla y sigue como si no estuviera', async () => {
  const { eje, ana } = await libro();
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
  // Otro autor en la misma bandeja: no cabe en la tanda.
  const deAna = await crearEvento(datos(vista, 'ana', eje.genesisId, ['De ana'], T(1)));
  const mezcla = await eje.probarTanda([r1, deAna]);
  assert.deepEqual(mezcla.map((r) => r.ok), [true, false]);
  assert.match(mezcla[1].motivos[0].texto, /mismo autor/);
  // La vista con lo que pasa aplicado, para componer el siguiente sobre ella (los defectos leen el libro).
  const { vista: v2, resultados } = await eje.vistaTanda([r1]);
  assert.equal(resultados[0].ok, true);
  assert.ok(v2.obtener(r1.id));
  assert.equal(eje.obtener(r1.id), undefined);
  const otra = await v2.invitar({ autor: 'vg', invitado: 'bea', t: T(5) });
  assert.ok(v2.obtener(otra.id) && !eje.obtener(otra.id));
  // Más de 32: el 33 no cabe en la tanda.
  const muchos = [];
  for (let k = 0; k < 33; k++) muchos.push(await crearEvento(datos(vista, 'vg', eje.genesisId, ['r' + k], T(6))));
  const res33 = await eje.probarTanda(muchos);
  assert.equal(res33[31].ok, true);
  assert.equal(res33[32].ok, false);
  assert.match(res33[32].motivos.at(-1).texto, /como mucho 32/);
  assert.equal(resumen(eje), antes);
  void ana;
});

test('probar en seco: una referencia por prefijo a otro registro de la bandeja se rechaza; por id entero, vale y se reescribe al marcar', async () => {
  const { eje } = await libro();
  const { vista } = await eje.vistaTanda();
  const uno = await crearEvento(datos(vista, 'vg', eje.genesisId, ['Uno'], T(1)));
  const corto = '@' + uno.id.slice(0, 8);
  const porPrefijo = await crearEvento(datos(vista, 'vg', eje.genesisId, [corto], T(2)));
  const porEntero = await crearEvento(datos(vista, 'vg', eje.genesisId, [{ ref: uno.id }, ['=("' + uno.id + '").0']], T(2)));
  const res = await eje.probarTanda([uno, porPrefijo, porEntero]);
  assert.deepEqual(res.map((r) => r.ok), [true, false, true], JSON.stringify(res));
  assert.match(res[1].motivos[0].texto, /por prefijo/);
  // Sin falsos positivos: un texto que no es entero una referencia, un prefijo de nadie, el texto libre.
  assert.deepEqual(prefijosAMiembros({ payload: ['mira ' + corto, '@zzzz', '@' + 'f'.repeat(8)] }, [uno.id]).length, uno.id.startsWith('ffffffff') ? 1 : 0);
  assert.deepEqual(prefijosAMiembros({ payload: [[corto + ':1200000000']] }, [uno.id]).length, 1, 'con subposición, también');
  // Marcar reescribe el id entero también dentro de la fórmula.
  const [m1, , m3] = await marcarTanda([uno, porPrefijo, porEntero]);
  assert.deepEqual(m3.payload[0], { ref: m1.id });
  assert.equal(m3.payload[1][0], '=("' + m1.id + '").0');
});

test('reordenar: una tanda partida se rechaza entera; seguida, entra', async () => {
  const L = await libro();
  const { eje, vg } = L;
  const { tanda } = await tandaDeTres(L);
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
  assert.equal(new Set(partida.rechazados.map((r) => r.motivo)).size, 1, 'el mismo motivo para todos');
  assert.deepEqual(eje.orden.slice(previos.length), [x.id]);
  assert.equal(eje.alta('ana'), null);
});

test('reordenar: si un miembro no pasa las reglas en el orden nuevo, la tanda entera fuera y el libro sigue', async () => {
  const { eje, vg } = await libro();
  // Una tanda de vg que bloquea sus R libres, y otro registro suelto de vg que también: en el orden nuevo el suelto va
  // antes, y el segundo miembro ya no tiene con qué.
  const libres = eje.saldo('vg', 'R:vg');
  const { vista } = await eje.vistaTanda();
  const uno = await crearEvento(datos(vista, 'vg', eje.genesisId, ['Uno'], T(1)));
  const gasta = await crearEvento(datos(vista, 'vg', eje.genesisId, ['Bloqueo mis R'], T(1), [{ token: 'R', emisor: 'vg', cantidad: libres, de: 'vg', a: 'vg', estado: 'bloqueo', salida: 'a' }]));
  const tanda = await firmarTodos(await marcarTanda([uno, gasta]), { vg });
  assert.equal((await eje.anadirTanda(tanda)).ok, true);
  const previos = eje.orden.slice(0, -2);
  const suelto = await firmar(await crearEvento(datos(eje, 'vg', eje.genesisId, ['Las bloqueo yo antes'], T(1), [{ token: 'R', emisor: 'vg', cantidad: libres, de: 'vg', a: 'vg', estado: 'bloqueo', salida: 'b' }])), vg.privada);
  const r = await eje.reordenar([...previos, suelto, ...tanda]);
  assert.deepEqual(r.rechazados.map((x) => x.id), tanda.map((e) => e.id));
  assert.match(r.rechazados[0].motivo, /el miembro 2 no pasa/);
  assert.deepEqual(eje.orden.slice(previos.length), [suelto.id]);
  assert.equal(eje.bloqueado('vg', 'R:vg', 'b'), libres);
  assert.equal(eje.bloqueado('vg', 'R:vg', 'a'), 0);
});

test('Eje.desde: una tanda incompleta o partida en la lista no entra (lanza, con el índice del miembro)', async () => {
  const L = await libro();
  const { eje } = L;
  const { tanda } = await tandaDeTres(L);
  const base = eje.orden.map((id) => eje.obtener(id));
  await assert.rejects(Eje.desde([...base, tanda[0], tanda[1]], { exigirFirmas: true }), (e) => /se rechaza entera/.test(e.message) && e.indice === null);
  await assert.rejects(Eje.desde([...base, tanda[1], tanda[2]], { exigirFirmas: true }), /sin su miembro 1/);
  const entera = await Eje.desde([...base, ...tanda], { exigirFirmas: true });
  assert.deepEqual(entera.orden.slice(-3), tanda.map((e) => e.id));
});

/** Una tanda de apertura: el génesis de vg y dos registros suyos sobre él, marcados y firmados. `segundo` cambia el 3. */
async function apertura({ segundo } = {}) {
  const vg = await generarClaves();
  const abierto = await Eje.genesis({ identidad: 'vg', foco: ['libro abierto en una tanda'], t: T(0), clave: vg.publica, privada: vg.privada, exigirFirmas: true });
  const g = abierto.obtener(abierto.genesisId);
  const { vista } = await abierto.vistaTanda();
  const uno = await crearEvento(datos(vista, 'vg', g.id, ['Mi primer registro'], T(1)));
  const dos = await crearEvento(segundo ? segundo(vista, uno) : datos(vista, 'vg', uno.id, ['El segundo, sobre el primero'], T(2)));
  return { vg, tanda: await firmarTodos(await marcarTanda([g, uno, dos]), { vg }) };
}

test('la tanda que abre un libro (el génesis es el miembro 1): entra entera; si un miembro falla, no queda libro', async () => {
  const { tanda } = await apertura();
  assert.equal(tanda[0].contexto.genesis, true);
  assert.deepEqual(tanda[0].contexto.tanda, { n: 1, de: 3 });
  const eje = await Eje.desde(tanda, { exigirFirmas: true });
  assert.deepEqual(eje.orden, tanda.map((e) => e.id));
  const abierta = await Eje.abrirConTanda(tanda, { exigirFirmas: true });
  assert.equal(abierta.ok, true);
  assert.equal(abierta.tanda, tanda[0].id);
  assert.equal(resumen(abierta.eje), resumen(eje));
  // El génesis solo, sin el resto de su tanda: no hay libro.
  await assert.rejects(Eje.desde([tanda[0]], { exigirFirmas: true }), /génesis rechazado/);
  // El 3 no pasa una regla (bloquea R que vg no tiene): no hay libro, y el error dice cuál.
  const mala = await apertura({ segundo: (vista, uno) => datos(vista, 'vg', uno.id, ['Bloqueo lo que no tengo'], T(2), [{ token: 'R', emisor: 'vg', cantidad: 5, de: 'vg', a: 'vg', estado: 'bloqueo', salida: 'x' }]) });
  await assert.rejects(Eje.desde(mala.tanda, { exigirFirmas: true }), (e) => /génesis rechazado/.test(e.message) && e.indice === 2 && e.id === mala.tanda[2].id);
  const r = await Eje.abrirConTanda(mala.tanda, { exigirFirmas: true });
  assert.deepEqual([r.ok, r.indice, r.id, r.eje], [false, 2, mala.tanda[2].id, undefined]);
  assert.deepEqual((await Eje.abrirConTanda(mala.tanda.slice(0, 2))).indice, null);
  // Con el génesis ya en un libro, la misma tanda por anadirTanda no entra (ya hay génesis): la apertura es solo para el eje vacío.
  const otro = await Eje.desde([...tanda], { exigirFirmas: true });
  assert.equal((await otro.anadirTanda(tanda)).indice, null, 'entera ya está');
  // reordenar con la tanda de apertura partida: el génesis no se rechaza, así que lanza y el libro no cambia.
  const antes = resumen(eje);
  await assert.rejects(eje.reordenar([tanda[0].id, tanda[2].id, tanda[1].id]), /génesis rechazado/);
  assert.equal(resumen(eje), antes);
});

// ---------- el vector para la puerta (Core AARPIA) ----------

/** Genera el vector: un libro, una tanda válida de tres y una inválida (su segundo miembro no pasa una regla). */
async function generarVector() {
  const L = await libro();
  const { eje, vg } = L;
  const libroEventos = eje.orden.map((id) => eje.obtener(id));
  const { tanda } = await tandaDeTres(L);
  // La inválida, toda de vg: escribe uno; en el segundo bloquea 500 R suyas, que no tiene; el tercero cuelga del primero.
  const { vista } = await eje.vistaTanda();
  const uno = await crearEvento(datos(vista, 'vg', eje.genesisId, ['Primero de la tanda inválida'], T(2)));
  const dos = await crearEvento(datos(vista, 'vg', uno.id, ['Bloqueo lo que no tengo'], T(2), [{ token: 'R', emisor: 'vg', cantidad: 500, de: 'vg', a: 'vg', estado: 'bloqueo', salida: 'nada' }]));
  const tres = await crearEvento(datos(vista, 'vg', uno.id, ['Tercero'], T(3)));
  const invalida = await firmarTodos(await marcarTanda([uno, dos, tres]), { vg });
  const ok = await (await Eje.desde(libroEventos, { exigirFirmas: true })).anadirTanda(tanda);
  const mala = await (await Eje.desde(libroEventos, { exigirFirmas: true })).anadirTanda(invalida);
  return {
    descripcion: 'CONTRATO_TANDA (agram-equipo), con sus precisiones del 18-11 noche: una tanda válida de tres y una inválida, sobre el mismo libro; cada tanda, de un solo autor. Claves de PRUEBA, generadas por test/tanda.test.js (TANDA_VECTOR=escribir). Las firmas BIP-340 llevan azar auxiliar: al regenerar cambian las claves, los ids y las firmas, no la forma ni el resultado.',
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
  assert.equal(new Set(V.valida.eventos.map((e) => e.autor)).size, 1, 'un solo autor');
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

// ---------- revisión de Core StateArk (casos e7, r1, r2) ----------

test('marcarTanda con candidatos SIN id (como los admite vistaTanda): el 2 sigue colgando del 1 tras marcar', async () => {
  const { eje, vg } = await libro();
  const c1 = datos(eje, 'vg', eje.genesisId, ['uno'], T(5));
  const { vista } = await eje.vistaTanda([c1]);
  const id1 = vista.orden.at(-1);
  const c2 = datos(vista, 'vg', id1, ['dos, sobre el uno'], T(5));
  assert.deepEqual((await eje.probarTanda([c1, c2])).map((r) => r.ok), [true, true]);
  const m = await marcarTanda([c1, c2]);
  assert.equal(m[1].sobre, m[0].id, 'el id viejo del 1 se calcula y se cambia por el nuevo');
  const r = await eje.anadirTanda(await firmarTodos(m, { vg }));
  assert.equal(r.ok, true, JSON.stringify(r.motivos));
});

test('reordenar con la lista cortada a media tanda y algo local en medio: los miembros que faltan van detrás de los suyos; la tanda no se pierde', async () => {
  const L = await libro();
  const { eje, vg } = L;
  const P = await eje.anadir(await firmar(await crearEvento(datos(eje, 'vg', eje.genesisId, ['pendiente local'], T(1))), vg.privada));
  const { tanda } = await tandaDeTres(L);
  assert.equal((await eje.anadirTanda(tanda)).ok, true);
  const previos = eje.orden.slice(0, eje.orden.length - 4);
  const r = await eje.reordenar([...previos, tanda[0].id, tanda[1].id]);
  assert.deepEqual(r.rechazados, []);
  assert.ok(tanda.every((e) => eje.obtener(e.id)));
  assert.deepEqual(eje.orden.slice(previos.length), [...tanda.map((e) => e.id), P.id]);
  // La lista del servidor que parte la tanda con uno suyo en medio sí la rechaza entera.
  const partida = await eje.reordenar([...previos, tanda[0].id, P.id, tanda[1].id, tanda[2].id]);
  assert.deepEqual(partida.rechazados.map((x) => x.id), tanda.map((e) => e.id));
});

test('los topes de tamaño en seco (precisión 9): solo si se piden; el miembro que se pasa, con su índice; la petición, con índice null', async () => {
  const L = await libro();
  const { eje } = L;
  const { candidatos, tanda } = await tandaDeTres(L);
  assert.deepEqual([TANDA_TOPE_POR_MIEMBRO, TANDA_TOPE_POR_PETICION], [256 * 1024, 1024 * 1024]);
  assert.deepEqual(TANDA_TOPES, { porMiembro: TANDA_TOPE_POR_MIEMBRO, porPeticion: TANDA_TOPE_POR_PETICION });
  // Lo que mide el núcleo es exacto: el JSON canónico de cada miembro marcado y firmado, y de la lista.
  const largo = (x) => new TextEncoder().encode(canonico(x)).length;
  assert.deepEqual(candidatos.map((c, k) => bytesDeMiembro(c, k, 3)), tanda.map(largo));
  assert.equal(bytesDeTanda(candidatos), largo(tanda));
  // Sin topes, nada se mira; con los del contrato, cabe.
  const sin = await eje.probarTanda(candidatos);
  assert.deepEqual([sin.map((r) => r.ok), sin.peticion.ok, sin.peticion.bytes], [[true, true, true], true, null]);
  const con = await eje.probarTanda(candidatos, { topes: TANDA_TOPES });
  assert.deepEqual([con.map((r) => r.ok), con.peticion.ok, con.peticion.bytes], [[true, true, true], true, largo(tanda)]);
  // Un tope por miembro un byte por debajo del más grande: ese no cabe, con su índice y la regla REGLA_NO_CABE.
  const tamanos = tanda.map(largo);
  const grande = tamanos.indexOf(Math.max(...tamanos));
  const r = await eje.probarTanda(candidatos, { topes: { porMiembro: tamanos[grande] - 1 } });
  assert.equal(r[grande].ok, false);
  assert.equal(r[grande].motivos[0].regla, REGLA_NO_CABE);
  assert.match(r[grande].motivos[0].texto, /no cabe/);
  // La petición entera, por un byte.
  const { peticion } = await eje.vistaTanda(candidatos, { topes: { porPeticion: largo(tanda) - 1 } });
  assert.deepEqual([peticion.ok, peticion.indice, peticion.motivos[0].regla], [false, null, REGLA_NO_CABE]);
});
