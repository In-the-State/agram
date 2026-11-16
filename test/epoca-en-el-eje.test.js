// La época vive en el eje (VG, 14-11, #107; decisión #63 con AARPIA: «cada evento se juzga con la época que referencia,
// resuelta en el libro»). Un eje nace con su época escrita en el libro (Eje.genesis({ epoca })), eje.epoca() la lee de
// ahí (resuelta con lo que hereda), y el núcleo y la carta pintan con ella; un eje sin época escrita usa la 0 que trae
// el código. La época de prueba (test/epoca-prueba.json) hereda de la 0 y añade dos plantillas, una regla, una estación
// del 4.3 y cambia la forma del mundo 2 en el 8.7.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Eje } from '../src/eje.js';
import { crearEvento } from '../src/evento.js';
import { firmar, generarClaves } from '../src/autoridad.js';
import { serializar, restaurar } from '../src/persistencia.js';
import { EPOCA_0_BTML, EPOCAS_POR_ID, IDS_ANTERIORES_DE_LA_0, cargarEpocaEscrita, epocaEscritaDe, erroresDeEpocaEscrita, fusionarRaices, heredaDe, idDeRegistro } from '../src/epocas.js';
import { condicionesDe, CONDICIONES } from '../src/condiciones/index.js';
import * as A from '../src/acciones.js';
import * as C from '../src/contrato.js';
import { arbol } from '../carta/carta.js';

const T0 = '2026-11-14T10:00:00Z';
const PRUEBA = JSON.parse(readFileSync(new URL('./epoca-prueba.json', import.meta.url), 'utf8'));
const copia = (x) => JSON.parse(JSON.stringify(x));
const nombres = (e) => e.transacciones.map((t) => t.plantilla[0][0]);

/** Un eje de demostración con la época dada (o la 0), y la emisión de su autor detrás. */
async function ejeCon(epoca, { claves } = {}) {
  return Eje.genesis({
    identidad: 'raiz',
    foco: 'mundo de prueba',
    t: T0,
    emision: [{ token: 'R', cantidad: 10 }],
    ...(epoca ? { epoca } : {}),
    ...(claves ? { clave: claves.publica, privada: claves.privada } : { demostracion: true }),
  });
}

test('la época de prueba: hereda de la 0 por su 6 (claves y valores) y se resuelve sumando sus colecciones', () => {
  assert.deepEqual(erroresDeEpocaEscrita(PRUEBA), []);
  // La de prueba hereda del id de la 0 de ANTES de H13 (0d95471b…): un id anterior reconocido resuelve con la 0 de hoy.
  assert.equal(heredaDe(PRUEBA.raiz), IDS_ANTERIORES_DE_LA_0[1]);
  assert.notEqual(heredaDe(PRUEBA.raiz), EPOCA_0_BTML.id);
  assert.equal(EPOCAS_POR_ID.get(heredaDe(PRUEBA.raiz)), EPOCA_0_BTML);
  const e = cargarEpocaEscrita(PRUEBA);
  assert.equal(e.id, idDeRegistro(PRUEBA.raiz), 'el id es el de la hija tal como se escribió');
  assert.equal(e.nombre, 'época de prueba');
  assert.equal(e.hereda, IDS_ANTERIORES_DE_LA_0[1]);
  assert.deepEqual(e.ids, [e.id, IDS_ANTERIORES_DE_LA_0[1], EPOCA_0_BTML.id], 'los ids que la nombran: el suyo, el que dice heredar y el de la 0 de hoy');
  // 9.6.1: las 46 de la 0 y las dos suyas, en el orden del 8 de cada una ([punto de vista, orden]).
  assert.equal(e.transacciones.length, EPOCA_0_BTML.transacciones.length + 2);
  assert.ok(nombres(e).includes('leave a test note') && nombres(e).includes('plan a test review') && nombres(e).includes('anchor here'));
  assert.ok(nombres(e).indexOf('leave a test note') > nombres(e).indexOf('view thread') && nombres(e).indexOf('leave a test note') < nombres(e).indexOf('commit time'));
  // 2: las condiciones de la 0 y la suya, detrás de la que nombra su 8.
  assert.equal(e.condiciones.length, EPOCA_0_BTML.condiciones.length + 1);
  const n = e.condiciones.map((r) => r[0][0]);
  assert.equal(n[n.indexOf('at most a year ahead') + 1], 'a test record names itself');
  // 4.3: las estaciones de la 0 y la suya; la cabecera, la de la 0 seguida de la suya.
  const estaciones = e.registro[4][3].filter((x) => Array.isArray(x[0])).map((x) => x[0][0]);
  assert.deepEqual(estaciones, [...EPOCA_0_BTML.registro[4][3].filter((x) => Array.isArray(x[0])).map((x) => x[0][0]), 'revisada']);
  assert.equal(e.registro[4][3][0][0], EPOCA_0_BTML.registro[4][3][0][0]);
  assert.ok(e.registro[4][3][0].includes('stations of the test epoch'));
  // 8.7.1: la fila del mundo 2 sustituye a la de la 0 (mismo 0); las demás, las de la 0.
  const filas = e.registro[8][7][1];
  assert.equal(filas.length, EPOCA_0_BTML.registro[8][7][1].length);
  assert.equal(filas.find((f) => f[0][0] === 2)[4][0], 'cruceta');
  assert.deepEqual(filas.find((f) => f[0][0] === 3), EPOCA_0_BTML.registro[8][7][1].find((f) => f[0][0] === 3));
  // Lo marcado { ref: <la 0> } es lo de la 0 en esa dirección; lo que no trae, también.
  assert.deepEqual(e.registro[5], EPOCA_0_BTML.registro[5]);
  assert.deepEqual(e.registro[1], EPOCA_0_BTML.registro[1]);
  assert.deepEqual(e.registro[9][7], EPOCA_0_BTML.registro[9][7]);
  assert.deepEqual(e.registro[6][0], PRUEBA.raiz[6][0], 'su procedencia es la suya');
});

test('nace con época: el génesis la escribe en el libro (una sola apertura), eje.epoca() la lee y sobrevive a guardar y restaurar', async () => {
  const claves = await generarClaves();
  const eje = await ejeCon(PRUEBA, { claves });
  const g = eje.obtener(eje.genesisId);
  assert.equal(g.contexto.epoca, idDeRegistro(PRUEBA.raiz));
  assert.equal(g.contexto.epocaEscrita, 1 + PRUEBA.registros.length);
  // La raíz y sus tres registros, detrás del génesis, de su autor, firmados, sin mover nada; no son hijos del génesis.
  assert.deepEqual(eje.registrosDeLaEpoca, eje.orden.slice(1, 5));
  for (const id of eje.registrosDeLaEpoca) {
    const r = eje.obtener(id);
    assert.equal(r.autor, 'raiz');
    assert.equal(r.sobre, eje.genesisId);
    assert.deepEqual(r.movimientos, []);
    assert.ok(r.firma);
    assert.ok(eje.esDeLaEpoca(id));
  }
  assert.deepEqual(eje.obtener(eje.registrosDeLaEpoca[0]).payload, PRUEBA.raiz);
  assert.ok(!(eje.hijos.get(eje.genesisId) ?? []).some((h) => eje.esDeLaEpoca(h.id)), 'la emisión sí cuelga del génesis; la época no');
  assert.equal(eje.epoca().nombre, 'época de prueba');
  assert.equal(eje.saldo('raiz', 'R:raiz'), 10, 'después de la época, el eje sigue: la emisión pasó por las reglas');
  // Guardar y restaurar (con firmas exigidas): la época vuelve a salir del libro.
  const otro = await restaurar(serializar(eje));
  assert.equal(otro.epoca().id, eje.epoca().id);
  assert.deepEqual(nombres(otro.epoca()), nombres(eje.epoca()));
  const desde = await Eje.desde(eje.orden.map((id) => eje.obtener(id)), { exigirFirmas: true });
  assert.equal(desde.epoca().nombre, 'época de prueba');
  // Un registro de la época fuera de la apertura no entra.
  const tarde = await firmar(await crearEvento({ autor: 'raiz', sobre: eje.genesisId, t: T0, movimientos: [], payload: [['otra regla']], contexto: { epoca: g.contexto.epoca, registroDeEpoca: true } }), claves.privada);
  await assert.rejects(eje.anadir(tarde), /registro de la época rechazado: .*ya está entera/);
  // Mientras la época no está entera, nada más entra.
  const solo = await Eje.desde([g]);
  assert.throws(() => solo.epoca(), /no está entera en el libro \(0 de 4/);
  await assert.rejects(solo.anadir(eje.obtener(eje.orden[5])), /no está entera en el libro/);
});

test('dos ejes, dos épocas, en el mismo proceso: cada uno se juzga y se pinta con la suya', async () => {
  const cero = await ejeCon();
  const prueba = await ejeCon(PRUEBA);
  assert.equal(cero.epoca(), EPOCA_0_BTML);
  assert.equal(prueba.epoca().nombre, 'época de prueba');
  assert.equal(condicionesDe(cero.epoca()), CONDICIONES);
  assert.equal(condicionesDe(prueba.epoca()).length, CONDICIONES.length + 1);
  assert.ok(condicionesDe(prueba.epoca()).some((c) => c.nombre === 'a test record names itself'));
  // El aro del mundo 6 sobre el génesis: la plantilla nueva solo en el eje de la época de prueba; la de la 0, en los dos.
  const aro = (eje, pv) => A.acciones(eje, eje.genesisId, pv, 'raiz').map((a) => a.nombre);
  assert.ok(aro(prueba, 6).includes('leave a test note') && aro(prueba, 6).includes('anchor here'));
  assert.ok(!aro(cero, 6).includes('leave a test note') && aro(cero, 6).includes('anchor here'));
  assert.ok(aro(prueba, 7).includes('plan a test review') && !aro(cero, 7).includes('plan a test review'));
  // Lo demás, igual: los registros de la época no se ven como registros del libro (before.1, las listas).
  for (const pv of [1, 2, 3, 4, 8, 9]) assert.deepEqual(aro(prueba, pv), aro(cero, pv), 'el aro del ' + pv);
  assert.deepEqual(aro(prueba, 6).filter((n) => n !== 'leave a test note'), aro(cero, 6));
  // La forma del mundo 2 (8.7) y las estaciones del anuncio (4.3), de la época de cada eje.
  assert.equal(C.divisionDelMundo(prueba, 2).forma, 'cruceta');
  assert.notEqual(C.divisionDelMundo(cero, 2).forma, 'cruceta');
  assert.ok(A.estacionesDelAnuncio({ epoca: prueba.epoca() }).some((s) => s.nombre === 'revisada'));
  assert.ok(!A.estacionesDelAnuncio({ epoca: cero.epoca() }).some((s) => s.nombre === 'revisada'));
  // La plantilla nueva se lanza en su eje y pasa por sus reglas (la suya, la de la 0).
  const r = await A.transaccion(prueba, 'leave a test note', { X: prueba.genesisId, title: 'nota de prueba' }, 'raiz');
  assert.ok(r.ok, JSON.stringify(r.motivos));
  const nota = await prueba.anadir(r.evento);
  assert.deepEqual(nota.payload[0], ['nota de prueba']);
  assert.equal((await A.transaccion(cero, 'leave a test note', { X: cero.genesisId, title: 'x' }, 'raiz')).ok, false, 'en el eje de la 0 no existe');
  // La invitación referencia la época del eje.
  const inv = await prueba.invitar({ autor: 'raiz', invitado: 'ana', t: T0 });
  assert.deepEqual(inv.payload[2], [{ ref: prueba.epoca().id }]);
});

test('un eje sin época escrita usa la que referencia si el código la conoce, y si no la 0 (los ejes de hoy)', async () => {
  for (const epoca of [EPOCA_0_BTML.id, IDS_ANTERIORES_DE_LA_0[0], 'ab'.repeat(32)]) {
    const g = await crearEvento({ autor: 'raiz', sobre: null, t: T0, movimientos: [], payload: 'viejo', contexto: { genesis: true, epoca, demostracion: true } });
    const eje = await Eje.desde([g]);
    assert.equal(eje.epoca(), EPOCA_0_BTML);
    assert.deepEqual(eje.registrosDeLaEpoca, []);
  }
  assert.equal(EPOCAS_POR_ID.get(IDS_ANTERIORES_DE_LA_0[0]), EPOCA_0_BTML);
  // La época 0 también se puede escribir entera en el libro (sin «hereda»): la misma id, sus 757 registros.
  const escrita = epocaEscritaDe();
  const eje = await ejeCon(escrita);
  assert.equal(eje.epoca().id, EPOCA_0_BTML.id);
  assert.equal(eje.registrosDeLaEpoca.length, 1 + escrita.registros.length);
  assert.equal(eje.epoca().transacciones.length, EPOCA_0_BTML.transacciones.length);
});

test('el eje de ejemplo de StateArk (génesis con la SIP 0 viva, que hereda de la 0) se carga entero con la época que su génesis referencia', { skip: !existsSync('C:/Users/acer/Documents/InTheState/stateark/sip/ejemplo/eje-stateark.json') && 'sin el repositorio de StateArk' }, async () => {
  const j = JSON.parse(readFileSync('C:/Users/acer/Documents/InTheState/stateark/sip/ejemplo/eje-stateark.json', 'utf8'));
  const eje = await Eje.desde(j.eventos, { exigirFirmas: true });
  assert.equal(eje.orden.length, j.eventos.length);
  // El génesis del ejemplo referencia la SIP 0 viva (hereda de la 0); antes referenciaba la 0 misma.
  const referida = eje.obtener(eje.genesisId).contexto.epoca;
  assert.equal(eje.epoca().id, referida);
  assert.ok(eje.epoca() === EPOCA_0_BTML || EPOCAS_POR_ID.get(eje.epoca().hereda) === EPOCA_0_BTML, 'es la 0 o una que hereda de ella');
});

test('la SIP 0 de StateArk (solo lectura): hereda de la 0, se resuelve, y sus plantillas del 9.6 y sus 4 estaciones del 4.3 se suman a las de la 0', { skip: !existsSync('C:/Users/acer/Documents/InTheState/stateark/sip/sip-0.btml.json') && 'sin el repositorio de StateArk' }, () => {
  const D = 'C:/Users/acer/Documents/InTheState/stateark/sip/';
  const leer = (c) => readdirSync(D + c).filter((f) => f.endsWith('.json')).sort().map((f) => JSON.parse(readFileSync(D + c + '/' + f, 'utf8')));
  const raiz = JSON.parse(readFileSync(D + 'sip-0.btml.json', 'utf8'));
  const plantillas = leer('plantillas');
  const sip = cargarEpocaEscrita({ raiz, registros: [...leer('reglas'), ...plantillas] });
  assert.equal(sip.id, idDeRegistro(raiz));
  assert.equal(sip.nombre, 'SIP 0');
  assert.equal(EPOCAS_POR_ID.get(sip.hereda), EPOCA_0_BTML);
  // El repositorio de StateArk es de otro Core y crece (la orden de pago entró el 16-11): se pide un mínimo, no un número fijo.
  assert.ok(plantillas.length >= 7);
  const propias = plantillas.map((p) => p[0][0]);
  assert.equal(sip.transacciones.length, EPOCA_0_BTML.transacciones.length + propias.filter((n) => !nombres(EPOCA_0_BTML).includes(n)).length);
  assert.ok(propias.every((n) => nombres(sip).includes(n)));
  const estaciones = (e) => e.registro[4][3].filter((x) => Array.isArray(x[0])).length;
  assert.equal(estaciones(sip), estaciones(EPOCA_0_BTML) + 4);
  // Lo que marca { ref: <la 0> } es lo de la 0; lo que trae de nuevo (7.5, 8.8) queda en su dirección.
  assert.deepEqual(sip.registro[5], EPOCA_0_BTML.registro[5]);
  assert.deepEqual(sip.registro[7].slice(0, 5), EPOCA_0_BTML.registro[7].slice(0, 5));
  assert.equal(sip.registro[7][5][0][0], 'block time');
  assert.equal(sip.registro[8][8][0][0], 'usage labels');
  // Y un eje nace con ella escrita en su libro.
  return ejeCon({ raiz, registros: [...leer('reglas'), ...plantillas] }).then((eje) => {
    assert.equal(eje.epoca().nombre, 'SIP 0');
    assert.equal(eje.obtener(eje.genesisId).contexto.epoca, sip.id);
  });
});

test('una época mal formada se rechaza al escribirla, con la causa', async () => {
  const mal = (cambiar) => {
    const e = copia(PRUEBA);
    cambiar(e);
    return e;
  };
  const casos = [
    [mal((e) => { e.raiz[0] = ['-']; }), /un «-» en 0\.0: sin huecos ni rellenos \(#77\)/],
    [mal((e) => { e.raiz[3] = []; }), /raíz 3: array vacío/],
    [mal((e) => { e.raiz[6][2] = [EPOCA_0_BTML.id, 'otro']; }), /las claves \(6\.1\) y los valores \(6\.2\) van en paralelo \(#77\)/],
    [mal((e) => { e.raiz[6][2] = ['ab'.repeat(32)]; }), /hereda de una época que no se conoce: abababab/],
    [mal((e) => { e.registros.pop(); }), /no está entre las plantillas de la época/],
    [mal((e) => { e.raiz[6] = [['sin hereda']]; }), /en una época que no hereda de ninguna/],
  ];
  for (const [epoca, causa] of casos) await assert.rejects(ejeCon(epoca), causa);
  // Una marca donde la base no tiene nada.
  const hueca = copia(PRUEBA);
  hueca.raiz[7] = [{ ref: EPOCA_0_BTML.id }, { ref: EPOCA_0_BTML.id }, { ref: EPOCA_0_BTML.id }, { ref: EPOCA_0_BTML.id }, { ref: EPOCA_0_BTML.id }, { ref: EPOCA_0_BTML.id }, { ref: EPOCA_0_BTML.id }, { ref: EPOCA_0_BTML.id }, { ref: EPOCA_0_BTML.id }];
  await assert.rejects(ejeCon(hueca), /la posición 7\.\d se hereda \(\{ ref \} a la base\) y la base no la tiene/);
  assert.throws(() => fusionarRaices([['a'], ['b']], [['c'], { ref: 'x' }, { ref: 'x' }], { ids: new Set(['x']) }), /la posición 2 se hereda/);
  // Una regla que mueve no se carga (invariante del núcleo: las reglas solo leen).
  const mueve = copia(PRUEBA);
  mueve.registros[0][2] = ['=mint 1 T.1 to me'];
  mueve.raiz[2] = [{ ref: idDeRegistro(mueve.registros[0]) }];
  await assert.rejects(ejeCon(mueve), /una regla solo lee/);
});

test('un id de época que no casa se rechaza con causa clara', async () => {
  const claves = await generarClaves();
  const prueba = await ejeCon(PRUEBA, { claves });
  const g = prueba.obtener(prueba.genesisId);
  // Un evento que nombra otra época (la 0) en un eje de la época de prueba.
  const ev = { autor: 'raiz', sobre: prueba.genesisId, t: T0, movimientos: [{ token: 'T', escala: 'minuto', cantidad: 1, de: 'raiz', a: null }], payload: ['otra época'], contexto: { epoca: 'cd'.repeat(32) } };
  const e1 = await firmar(await crearEvento(ev), claves.privada);
  assert.ok((await prueba.validar(e1)).some((m) => /la época del evento \(cdcdcdcd\) no es la del eje \(/.test(m)));
  const e2 = await firmar(await crearEvento({ ...ev, contexto: { epoca: g.contexto.epoca } }), claves.privada);
  assert.ok(!(await prueba.validar(e2)).some((m) => /la época del evento/.test(m)), 'nombrar la suya vale');
  // La raíz escrita que no casa con el id del génesis: el libro la rechaza al restaurar.
  const eventos = prueba.orden.map((id) => prueba.obtener(id));
  const falsa = await firmar(await crearEvento({ autor: 'raiz', sobre: g.id, t: T0, movimientos: [], payload: [['otra raíz']], contexto: { epoca: g.contexto.epoca, registroDeEpoca: true } }), claves.privada);
  await assert.rejects(Eje.desde([g, falsa, ...eventos.slice(2)], { exigirFirmas: true }), /la raíz de la época \([0-9a-f]{8}\) no casa con el id que referencia el génesis/);
  // Un registro de la época de otro (sin la firma del autor del génesis) tampoco entra.
  const ajeno = await crearEvento({ autor: 'ana', sobre: g.id, t: T0, movimientos: [], payload: PRUEBA.raiz, contexto: { epoca: g.contexto.epoca, registroDeEpoca: true } });
  await assert.rejects(Eje.desde([g, ajeno], { exigirFirmas: true }), /la escribe el autor del génesis/);
  // En un eje que no escribe su época, un registro de época no entra.
  const cero = await ejeCon();
  const suelto = await crearEvento({ autor: 'raiz', sobre: cero.genesisId, t: T0, movimientos: [], payload: PRUEBA.raiz, contexto: { epoca: g.contexto.epoca, registroDeEpoca: true } });
  await assert.rejects(cero.anadir(suelto), /no escribe su época/);
});

test('la carta abre un eje con la segunda época y se ve distinta: sus plantillas en el aro, junto a las de la 0', async () => {
  const cero = await ejeCon();
  const prueba = await ejeCon(PRUEBA);
  const carta = async (eje, pv) => JSON.stringify(await arbol({ foco: { X: eje.genesisId, pv: 0 }, aro: { X: eje.genesisId, pv } }, eje, 'raiz', { ancho: 1366, alto: 768 }, { idioma: 'en' }));
  const p6 = await carta(prueba, 6);
  const c6 = await carta(cero, 6);
  assert.ok(p6.includes('leave a test note') && p6.includes('anchor here'));
  assert.ok(!c6.includes('leave a test note') && c6.includes('anchor here'));
  assert.notEqual(p6, c6);
});

test('be.mjs epoca: --ver de un archivo, --publicar en un eje nuevo del servidor y --ver de lo publicado', async () => {
  const { ejecutar } = await import('../be.mjs');
  const { arrancar } = await import('../servidor/prueba/servidor.mjs');
  const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = mkdtempSync(join(tmpdir(), 'agram-epoca-'));
  const servidor = await arrancar({ puerto: 0, secreto: 'prueba' });
  try {
    const archivo = fileURLToPath(new URL('./epoca-prueba.json', import.meta.url));
    const ver = await ejecutar(['epoca', '--ver', '--archivo', archivo], {});
    assert.match(ver, /^época: época de prueba · id [0-9a-f]{64}$/m);
    assert.match(ver, /hereda de: [0-9a-f]{8} \(época 0\)/);
    assert.match(ver, /plantillas de transacción \(9\.6\): 52/);
    assert.match(ver, /2 cruceta/);
    const mal = join(dir, 'mal.json');
    writeFileSync(mal, JSON.stringify({ ...PRUEBA, raiz: [['-'], ...PRUEBA.raiz.slice(1)] }));
    await assert.rejects(ejecutar(['epoca', '--publicar', mal, '--salida', join(dir, 'x.json')], {}), /época mal formada: .*#77/);
    const r = await fetch(servidor.url + '/ejes', { method: 'POST', headers: { 'X-Crear-Ejes': 'prueba', 'Content-Type': 'application/json' }, body: JSON.stringify({ eje: 'prueba' }) });
    const { claveLectura } = await r.json();
    const claves = await generarClaves();
    const config = join(dir, 'config.json');
    writeFileSync(config, JSON.stringify({ sync_url: servidor.url, eje: 'prueba', clave_lectura: claveLectura, identidad: { nombre: 'core', ...claves } }));
    const entorno = { AGRAM_BE_CACHE: join(dir, 'cache') };
    const pub = await ejecutar(['epoca', '--publicar', archivo, '--config', config], entorno);
    assert.match(pub, /4 registros de época/);
    assert.match(pub, /subido al eje «prueba»: 5 registros/);
    const delEje = await ejecutar(['epoca', '--ver', '--config', config], entorno);
    assert.match(delEje, /época: época de prueba/);
    assert.match(delEje, /escrita en el libro del eje: 4 registros tras el génesis/);
    await assert.rejects(ejecutar(['epoca', '--publicar', archivo, '--config', config], entorno), /ya tiene génesis/);
  } finally {
    await servidor.cerrar?.();
    rmSync(dir, { recursive: true, force: true });
  }
});
