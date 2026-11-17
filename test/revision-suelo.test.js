// Revisión de seguridad, segunda pasada: solo el SUELO (VG 17-11: cada uno solo mueve lo suyo; todo registro paga su
// T; se entra por invitación y el invitado queda protegido; la regla de las reglas pide un umbral más alto). Encargo de
// Core AGRAM tras test/revision-gobierno.test.js. Un caso por hallazgo; los que fallan hoy, con `todo` y su motivo.
// Ejes de demostración en memoria, identidades inventadas. S2, S4 y S5 los arregla encargo-arreglos-gobierno-anexo.md
// (Core AGRAM 17-11; su motivo queda en un comentario). S6 lo decidió VG (17-11) y lo construye el encargo «la salida
// con lo propio» (agram-equipo/encargos/encargo-salida-con-lo-propio.md): afirma lo decidido, y detrás van sus pruebas.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Eje } from '../src/eje.js';
import * as A from '../src/acciones.js';
import { EPOCA_0_BTML, idDeRegistro, cargarEpocaEscrita, epocaEscritaDe } from '../src/epocas.js';
import * as V from '../src/versiones.js';
import { quemaDelCoste } from '../src/escritura.js';
import { serializar, restaurar } from '../src/persistencia.js';
import { escribirPagando, pagaElCoste } from '../ejemplos/ikisai/coste.mjs';

const T0 = '2026-11-17T08:00:00Z';
const ID0 = EPOCA_0_BTML.id;
const M0 = { ref: ID0 };
const copia = (x) => JSON.parse(JSON.stringify(x));
const regla0 = (nombre) => EPOCA_0_BTML.reglasConId.find((x) => x.regla[0][0] === nombre).regla;

/** Un libro de ana (la dueña: con ella sola cualquier umbral se cumple) con nivel pedido 0 e `invitados`. */
async function mundo({ invitados = ['bea', 'cris'] } = {}) {
  const raiz = [['revisión del suelo'], M0, M0, M0, M0, M0, [['hija de prueba'], ['hereda'], [ID0]], [M0, M0, M0, M0, M0, M0, M0, M0, M0, [M0, M0, M0, [0], [0]]]];
  const eje = await Eje.genesis({ identidad: 'ana', foco: ['ana'], t: T0, demostracion: true, epoca: { raiz, registros: [] } });
  let s = 0;
  const reloj = () => new Date(Date.parse(T0) + ++s * 1000).toISOString().replace('.000Z', 'Z');
  const invitaciones = {};
  for (const n of invitados) {
    invitaciones[n] = await eje.invitar({ autor: 'ana', invitado: n, t: reloj() });
    await eje.aceptar(invitaciones[n], {}, { t: reloj() });
  }
  const intenta = async (cual, params, yo = 'ana') => {
    const r = await A.transaccion(eje, cual, params, yo, { t: reloj() });
    if (!r.ok) return { motivos: r.motivos };
    try {
      return { ev: await eje.anadir(r.evento) };
    } catch (e) {
      return { motivos: e.motivos ?? [{ texto: e.message }] };
    }
  };
  const raizDeCambio = (titulo, propias) => {
    const id = eje.epoca().id;
    const m = { ref: id };
    const n = Math.max(6, ...Object.keys(propias).map(Number)) + 1;
    return Array.from({ length: n }, (_, i) => (i === 0 ? [titulo] : propias[i] ?? (i === 6 ? [['propuesto en la revisión'], ['hereda'], [id]] : m)));
  };
  /** Propone, apoya ana con todo su P, aprueba, retira el apoyo y pone en vigor. */
  const recorrer = async (titulo, propias, { clase = 'governance', registros } = {}) => {
    const propuesta = await intenta('propose a change', { X: eje.genesisId, title: titulo, explanation: 'revisión', change: raizDeCambio(titulo, propias), ...(registros ? { records: registros } : {}), class: clase });
    if (!propuesta.ev) return { propuesta };
    await intenta('support a change', { X: propuesta.ev.id });
    const aprobacion = await intenta('enact a change', { X: propuesta.ev.id });
    await intenta('withdraw support', { X: propuesta.ev.id });
    if (!aprobacion.ev) return { propuesta, aprobacion };
    const puesta = await intenta('put a change in force', { X: aprobacion.ev.id });
    return { propuesta, aprobacion, puesta };
  };
  /** Un registro añadido a mano, pagando su coste: 'entra' o el mensaje del rechazo. */
  const aMano = (datos, privada) => escribirPagando(eje, { t: reloj(), ...datos }, privada).then(() => 'entra', (e) => e.message);
  return { eje, reloj, intenta, recorrer, aMano, invitaciones };
}

const textos = (r) => JSON.stringify((r?.motivos ?? []).map((x) => x.mensaje ?? x.texto)).slice(0, 200);

// ---------- Aguanta (S1 intentado): una lectura nueva en X.3.1 no abre la puerta ----------

test('aguanta: un cambio que añade una lectura en X.3.1 (=first ev.3) entra en vigor (como «governance»: como «ordinary» ya no), pero no deja entrar a nadie sin invitación', async () => {
  // El 3 de un registro es [autor, firmante] y su payload: el contexto no le suma lecturas (src/contexto-eje.js, #meta,
  // d === 3 vuelve antes de mirar las lecturas), así que «a person joins by an invitation» no ve la lectura nueva.
  const m = await mundo();
  const invitacion = m.invitaciones.bea.id;
  const alta = () => m.eje.escribir({ autor: 'zed', sobre: invitacion, t: m.reloj(), movimientos: [quemaDelCoste('zed', ['Alta de zed'], 'minuto', { eje: m.eje })], payload: ['Alta de zed'] }).then(() => 'entra', (e) => e.message);
  assert.match(await alta(), /a person joins by an invitation/, 'control');
  const puerta = [['open door'], ['ev.3'], ['=first ev.3'], ['X.3.1'], ['read'], ['*'], ['revisión de seguridad: una lectura en X.3.1'], ['epoch 0'], ['after changes'], ['open door: the writer']];
  // Una lectura que se guarda (en X.3.1) es de clase «governance» desde los arreglos (A, H1): como «ordinary» no entra.
  const corriente = await m.recorrer('una lectura más', { 2: [{ ref: idDeRegistro(puerta) }] }, { clase: 'ordinary', registros: [puerta] });
  assert.ok(!corriente.propuesta.ev, 'como «ordinary», no');
  const r = await m.recorrer('una lectura más', { 2: [{ ref: idDeRegistro(puerta) }] }, { clase: 'governance', registros: [puerta] });
  assert.ok(r.puesta?.ev, 'la lectura entra en vigor como «governance»');
  assert.match(await alta(), /a person joins by an invitation/);
  assert.equal(m.eje.alta('zed'), null);
});

// ---------- S2 (alto, hoy, sin gobierno): un tercero bloquea una invitación anclando algo en su 7 ----------

// Arreglado (encargo-arreglos-gobierno-anexo.md): HALLAZGO S2: «a person joins by an invitation» lee (invitación).7 (y .0, .3.1, .3.5), y ahí se suma lo que otros anclan en esa posición de la invitación; una nota con un texto hace que el plazo dé ERROR («<= espera un número») y la regla rechaza. Cualquiera con alta deja sin entrada al invitado de otro. En el 3 pasa algo parecido: lo anclado añade su id al 3.5 y un nombre al 3.1
test('S2: cris ancla una nota en el 7 de una invitación de ana a zed, y zed ya no puede entrar a tiempo', async () => {
  const m = await mundo();
  const inv = await m.eje.invitar({ autor: 'ana', invitado: 'zed', t: m.reloj() });
  assert.equal(await m.aMano({ autor: 'cris', sobre: inv.id, en: '7000000000', movimientos: [pagaElCoste('cris')], payload: [['basura']] }), 'entra', 'cris puede anclar en el 7 de la invitación');
  const r = await m.eje.aceptar(inv, {}, { t: m.reloj() }).then(() => 'entra', (e) => e.message);
  assert.equal(r, 'entra', 'el invitado queda protegido: lo que un tercero ancle en su invitación no le cierra la puerta');
});

// ---------- Aguanta (S3 intentado): acuñar la R de otro, ni tras un cambio de gobierno ----------

test('aguanta: un cambio de gobierno sustituye «R is minted by its issuer» y «R is minted to its issuer», y cris sigue sin acuñarse R de ana (lo para el núcleo)', async () => {
  const m = await mundo();
  const acunar = () => m.aMano({ autor: 'cris', sobre: m.eje.alta('cris').id, movimientos: [pagaElCoste('cris'), { token: 'R', emisor: 'ana', cantidad: 5, de: null, a: 'cris' }], payload: [['R de ana']] });
  assert.match(await acunar(), /la emisión de R va a su propio emisor/, 'control');
  const nuevas = ['R is minted by its issuer', 'R is minted to its issuer'].map((n) => {
    const r = copia(regla0(n));
    r[2] = ['=true'];
    r[6] = ['revisión de seguridad: la misma regla, que ya no mira quién acuña'];
    return r;
  });
  const r = await m.recorrer('acuñar R de otros', { 2: nuevas.map((x) => ({ ref: idDeRegistro(x) })) }, { registros: nuevas });
  assert.ok(r.puesta?.ev, 'el suelo no lo para: esas dos reglas no están en 7.9.6');
  assert.match(await acunar(), /la emisión de R va a su propio emisor/, 'lo para la forma del movimiento, en el núcleo');
});

// ---------- S4 (alto): un cambio de gobierno sustituye «approved» y la regla de las reglas deja de pedir más ----------

// Arreglado (encargo-arreglos-gobierno-anexo.md): HALLAZGO S4: el punto 4 del suelo solo se hace cumplir comparando 7.9.2 con 7.9.1; «approved», «support», «support of» y las cuatro reglas del gobierno son piezas de gobierno pero no suelo, así que un cambio de gobierno las sustituye por lo que quiera (aquí, «approved» siempre verdadero: cualquier cambio, corriente o de gobierno, se aprueba sin apoyo)
test('S4: un cambio de gobierno que sustituye «approved» por una lectura que siempre pasa entra (el suelo no guarda «la regla de las reglas pide más»)', () => {
  const aprobado = copia(regla0('approved'));
  aprobado[2] = ['=true'];
  aprobado[6] = ['revisión de seguridad: aprobado siempre'];
  const raiz = [['aprobado siempre'], M0, [{ ref: idDeRegistro(aprobado) }], M0, M0, M0, [['x'], ['hereda'], [ID0]]];
  const r = V.comprobarCambio(EPOCA_0_BTML, { raiz, registros: [aprobado] }, 'governance');
  assert.ok(r.motivos.length > 0, 'la lectura que decide si un cambio pasa no la sustituye ni un cambio de gobierno');
});

// ---------- S5 (medio): umbrales iguales ----------

// Arreglado (encargo-arreglos-gobierno-anexo.md): HALLAZGO S5: erroresDelSuelo solo rechaza 7.9.2 < 7.9.1; igualarlos pasa, y VG pidió «un umbral más alto». (Bajar los dos a la vez, por ejemplo -1 y 0, también pasa)
test('S5: un cambio de gobierno que iguala los dos umbrales (0.6 y 0.6) entra: la regla de las reglas ya no pide más', () => {
  const raiz = [['umbrales iguales'], M0, M0, M0, M0, M0, [['x'], ['hereda'], [ID0]], [M0, M0, M0, M0, M0, M0, M0, M0, M0, [M0, [0.6], [0.6]]]];
  const r = V.comprobarCambio(EPOCA_0_BTML, { raiz, registros: [] }, 'governance');
  assert.ok(r.motivos.some((x) => /umbral/.test(x)), 'el umbral de gobierno ha de quedar por encima del corriente');
});

// ---------- S6 (decidido por VG, 17-11): una condición de gobierno que nombra a alguien, y la salida con lo propio ----------

// VG 17-11: los dos tercios pueden añadir una condición que deje a una persona sin escribir (el aviso antes de regir es
// un nivel de firmeza, puede ser 0 y no da plazo); a cambio, la salida con lo propio es intocable: la declaración de
// saldo del puente es suelo y se juzga solo con el suelo (que sea de quien la firma, que sea verdad y que pague su T).
// docs/notas/GOBIERNO.md, «La salida con lo propio».

const VETO = [['not bea'], [0], ['=first ev.3 != "bea"'], ['ev.3'], ['mint', 'transfer', 'lock', 'release', 'burn'], ['*'], ['revisión de seguridad'], ['epoch 0'], ['after at most a year ahead'], ['not bea: bea does not write here any more']];

/** bea con R de ana (la invitación), P y una E suya (da R propia, escribe una nota y emite tres «pan» atados a ella). */
async function beaConLoSuyo(m) {
  const alta = m.eje.alta('bea').id;
  assert.ok((await m.intenta('give own R', { X: m.eje.alta('ana').id, quantity: 1 }, 'bea')).ev, 'bea da R propia');
  const nota = (await m.intenta('anchor here', { X: alta, title: 'pan', content: 'el pan de bea' }, 'bea')).ev;
  assert.ok(nota, 'bea escribe una nota');
  assert.ok((await m.intenta('issue E tied to X', { X: nota.id, denomination: 'pan', quantity: 3 }, 'bea')).ev, 'bea emite E');
  return { alta, serieE: 'E:bea/pan@' + nota.id };
}

/** Lo que tiene `quien` de cada serie (disponible y bloqueado), sin las que no tiene. */
const loQueTiene = (eje, quien) => [...eje.libro.disponibles(quien)].map(([k]) => [k, eje.saldo(quien, k) + eje.bloqueado(quien, k)]).filter(([, c]) => c > 0);

/** La declaración de saldo de `quien` de la serie `k`, con la plantilla: { ev } o { motivos }. */
const declara = (m, k, quien = 'bea', extra = {}) => m.intenta('declare a balance', { X: m.eje.alta(quien).id, series: k, ...extra }, quien);

/** Una declaración de saldo escrita a mano: el payload que escribe la plantilla, con lo que se cambie. */
const declaracion = (quien, k, cuanto, cambia = {}) => {
  const p = ['declare a balance: ' + quien + ' declares having ' + cuanto + ' of ' + k, [[k], [cuanto]], ['all announced movements happened'], [quien], ['declare a balance']];
  for (const [i, v] of Object.entries(cambia)) p[i] = v;
  return p;
};

/** bea, silenciada por un cambio de gobierno en vigor; antes, con lo suyo. */
async function beaSilenciada() {
  const m = await mundo();
  const suyo = await beaConLoSuyo(m);
  const r = await m.recorrer('fuera bea', { 2: [{ ref: idDeRegistro(VETO) }] }, { registros: [VETO] });
  assert.ok(r.puesta?.ev, 'el cambio de gobierno entra: ' + textos(r.puesta ?? r.aprobacion ?? r.propuesta));
  return { m, ...suyo };
}

test('S6: un cambio de gobierno añade «=first ev.3 != "bea"» y entra; bea ya no escribe una nota, pero sí su declaración de saldo de cada serie que tiene: entra, es verdad y paga su T', async () => {
  const m = await mundo();
  const nota = () => m.aMano({ autor: 'bea', sobre: m.eje.alta('bea').id, movimientos: [pagaElCoste('bea')], payload: [['nota de bea']] });
  assert.equal(await nota(), 'entra', 'control');
  await beaConLoSuyo(m);
  const r = await m.recorrer('fuera bea', { 2: [{ ref: idDeRegistro(VETO) }] }, { registros: [VETO] });
  assert.ok(r.puesta?.ev, 'el cambio de gobierno entra: ' + textos(r.puesta));
  assert.match(await nota(), /not bea/, 'bea ya no puede escribir una nota');
  const tiene = loQueTiene(m.eje, 'bea');
  assert.deepEqual([...new Set(tiene.map(([k]) => k[0]))].sort(), ['E', 'P', 'R'], 'bea tiene R, P y E');
  for (const [k, cuanto] of tiene) {
    const d = await declara(m, k);
    assert.ok(d.ev, 'la declaración de ' + k + ' entra: ' + textos(d));
    assert.deepEqual(d.ev.payload[1], [[k], [cuanto]], 'es verdad: lo que tiene, disponible y bloqueado');
    assert.deepEqual(d.ev.movimientos, [quemaDelCoste('bea', d.ev.payload, 'minuto', { eje: m.eje })], 'paga su T, y no mueve nada más');
  }
});

// ---------- La salida con lo propio (encargo «la salida con lo propio», VG 17-11) ----------

test('salida: tras el cambio que silencia a bea, declara su R, su P y su E; declarar más, en el alta de otro, moviendo otro token o con otra acción no entra', async () => {
  const { m, alta, serieE } = await beaSilenciada();
  const p = loQueTiene(m.eje, 'bea').find(([k]) => k.startsWith('P:'))[0];
  for (const k of ['R:ana', p, serieE]) assert.ok((await declara(m, k)).ev, 'declara ' + k);
  const mas = await declara(m, serieE, 'bea', { quantity: 4 });
  assert.deepEqual(mas.motivos.map((x) => x.regla), ['a declared balance is true'], 'tiene 3: declarar 4 no es verdad');
  const aMano = (datos) => m.aMano({ autor: 'bea', en: '8000000000', movimientos: [pagaElCoste('bea')], ...datos });
  assert.equal(await aMano({ sobre: alta, payload: declaracion('bea', 'R:ana', 1) }), 'entra', 'control: escrita a mano, con la forma de la plantilla');
  const solo = /a declared balance is only that/;
  const casos = {
    'en el alta de otro': { sobre: m.eje.alta('cris').id, payload: declaracion('bea', 'R:ana', 1) },
    'en otra posición de su alta': { sobre: alta, en: '7000000000', payload: declaracion('bea', 'R:ana', 1) },
    'en la raíz de su alta': { sobre: alta, en: undefined, payload: declaracion('bea', 'R:ana', 1) },
    'y además mueve un token a otro': { sobre: alta, movimientos: [pagaElCoste('bea'), { token: 'R', emisor: 'ana', cantidad: 1, de: 'bea', a: 'cris' }], payload: declaracion('bea', 'R:ana', 1) },
    'y además anuncia un movimiento': { sobre: alta, movimientos: [pagaElCoste('bea'), { token: 'R', emisor: 'ana', cantidad: 1, de: 'bea', a: 'cris', estado: 'anunciado' }], payload: declaracion('bea', 'R:ana', 1) },
    'y otra acción': { sobre: alta, payload: declaracion('bea', 'R:ana', 1, { 4: ['declare a balance', 'anchor here'] }) },
    'con más payload': { sobre: alta, payload: [...declaracion('bea', 'R:ana', 1), ['algo más']] },
    'con más en su 1': { sobre: alta, payload: declaracion('bea', 'R:ana', 1, { 1: [['R:ana'], [1], ['algo más']] }) },
    'con una décupla en su 0': { sobre: alta, payload: declaracion('bea', 'R:ana', 1, { 0: [['a'], ['b']] }) },
    'a nombre de otro en su 3': { sobre: alta, payload: declaracion('bea', 'R:ana', 1, { 3: ['cris'] }) },
  };
  for (const [que, datos] of Object.entries(casos)) {
    const r = await aMano(datos);
    assert.match(r, solo, 'una declaración ' + que + ' no entra: ' + r);
    assert.doesNotMatch(r, /not bea/, 'la rechaza el suelo y no la regla añadida (' + que + ')');
  }
});

test('salida: un cambio «governance» que sustituye o quita «a declared balance is true», «a declared balance is only that» o la plantilla «declare a balance» lo rechaza el suelo', async () => {
  const m = await mundo();
  const k = () => ({ ref: m.eje.epoca().id });
  for (const n of ['a declared balance is true', 'a declared balance is only that']) {
    const otra = copia(regla0(n));
    otra[2] = ['=true'];
    otra[6] = ['revisión de seguridad: la misma regla, que ya no mira nada'];
    const r = await m.recorrer('sin ' + n, { 2: [{ ref: idDeRegistro(otra) }] }, { registros: [otra] });
    assert.ok(!r.propuesta.ev, n);
    assert.match(textos(r.propuesta), new RegExp('sustituye «' + n + '», que es del suelo'));
  }
  const plantilla = copia(EPOCA_0_BTML.transacciones.find((x) => x.plantilla[0][0] === 'declare a balance').plantilla);
  plantilla[2] = ['=false'];
  plantilla[6] = ['revisión de seguridad: la plantilla que ya no se ofrece'];
  const sinPlantilla = await m.recorrer('sin declarar', { 9: [k(), k(), k(), k(), k(), k(), [k(), [{ ref: idDeRegistro(plantilla) }]]] }, { registros: [plantilla] });
  assert.ok(!sinPlantilla.propuesta.ev);
  assert.match(textos(sinPlantilla.propuesta), /sustituye «declare a balance», que es del suelo/);
  // Quitarlas de la lista 7.9.6: el suelo no se encoge.
  const lista = EPOCA_0_BTML.registro[7][9][6].filter((x) => !['a declared balance is true', 'a declared balance is only that', 'declare a balance'].includes(x));
  const fila = [k(), k(), k(), k(), k(), k(), k(), k(), k(), [k(), k(), k(), k(), k(), k(), lista]];
  const fuera = await m.recorrer('fuera del suelo', { 7: fila });
  assert.ok(!fuera.propuesta.ev);
  assert.match(textos(fuera.propuesta), /quita del suelo \(epoch\.7\.9\.6\) «a declared balance is true», «a declared balance is only that», «declare a balance»/);
  assert.equal(m.eje.versiones().length, 1);
  // Quitarlas de verdad (el 2 y el 9.6 son colecciones: un cambio no les quita entradas) solo cabe en una época completa.
  const { raiz, registros } = epocaEscritaDe(EPOCA_0_BTML);
  for (const n of ['a declared balance is true', 'a declared balance is only that']) {
    const sin = copia(raiz);
    sin[0] = ['sin ' + n];
    const id = EPOCA_0_BTML.reglasConId.find((x) => x.regla[0][0] === n).id;
    sin[2] = sin[2].filter((x) => x?.ref !== id);
    assert.throws(() => cargarEpocaEscrita({ raiz: sin, registros }), new RegExp('quita «' + n + '», que es del suelo'));
  }
});

test('salida: un cambio «governance» que añade una condición contra las declaraciones entra, y la declaración de bea sigue entrando', async () => {
  const { m, serieE } = await beaSilenciada();
  const contra = [['no balances'], [0], ['=not ("declare a balance" in ev.4)'], ['ev.3'], ['mint', 'transfer', 'lock', 'release', 'burn'], ['*'], ['revisión de seguridad: una condición hecha para rechazar las declaraciones'], ['epoch 0'], ['after not bea'], ['no balances: nobody declares a balance here']];
  const r = await m.recorrer('sin declaraciones', { 2: [{ ref: idDeRegistro(contra) }] }, { registros: [contra] });
  assert.ok(r.puesta?.ev, 'entra: ' + textos(r.puesta ?? r.aprobacion ?? r.propuesta));
  assert.ok(m.eje.epoca().condiciones.some((x) => x[0][0] === 'no balances'), 'está en vigor');
  assert.ok((await declara(m, serieE)).ev, 'bea declara');
  assert.ok((await declara(m, 'R:ana', 'cris')).ev, 'y cris');
  // Lo que no es una declaración sí lo mira: un registro que la nombra y hace otra cosa lo rechaza el suelo.
  const otra = await m.aMano({ autor: 'cris', sobre: m.eje.alta('cris').id, en: '8000000000', movimientos: [pagaElCoste('cris')], payload: declaracion('cris', 'R:ana', 1, { 4: ['declare a balance', 'anchor here'] }) });
  assert.match(otra, /a declared balance is only that/);
});

test('salida: un cambio «ordinary» que quita una condición lo rechaza la clase; como «governance» entra con los dos tercios', async () => {
  const m = await mundo();
  // Quitar una condición: el 2 no pierde entradas al fundir, así que se deja con su nombre una lectura que solo informa.
  const quitada = copia(regla0('at most a year ahead'));
  quitada[3] = ['ev'];
  quitada[4] = ['read'];
  quitada[2] = ['=0'];
  quitada[6] = ['revisión: la condición, quitada'];
  const corriente = await m.recorrer('sin el año', { 2: [{ ref: idDeRegistro(quitada) }] }, { clase: 'ordinary', registros: [quitada] });
  assert.ok(!corriente.propuesta.ev, 'como «ordinary», no');
  assert.match(textos(corriente.propuesta), /quita la condición «at most a year ahead», y se declara «ordinary»: quitar una condición o una lectura que se guarda/);
  const r = await m.recorrer('sin el año', { 2: [{ ref: idDeRegistro(quitada) }] }, { clase: 'governance', registros: [quitada] });
  assert.ok(r.puesta?.ev, textos(r.puesta ?? r.aprobacion ?? r.propuesta));
  assert.ok(!m.eje.epoca().condiciones.some((x) => x[0][0] === 'at most a year ahead'), 'ya no es condición');
  // Lo mismo con una lectura que se guarda: «weight» (X.2.4.8), dejada como una lectura que solo informa.
  const peso = copia(EPOCA_0_BTML.lecturas.find((x) => x[0][0] === 'weight'));
  peso[3] = ['X'];
  peso[6] = ['revisión: la lectura que se guarda, quitada'];
  const sinPeso = await m.recorrer('sin peso', { 2: [{ ref: idDeRegistro(peso) }] }, { clase: 'ordinary', registros: [peso] });
  assert.ok(!sinPeso.propuesta.ev);
  assert.match(textos(sinPeso.propuesta), /quita la lectura «weight», que se guarda en X\.2\.4\.8/);
});

test('salida: un cambio «ordinary» que toca epoch.8.9.1 lo rechaza la clase (la fila del puente es pieza de gobierno); como «governance» entra', async () => {
  const m = await mundo();
  const k = () => ({ ref: m.eje.epoca().id });
  const puente = () => [k(), k(), k(), k(), k(), k(), k(), k(), k(), [k(), ['E', 'R'], k(), [['the tied record of E crossed before'], ['a declared balance is true']]]];
  const corriente = await m.recorrer('R cruza', { 8: puente() }, { clase: 'ordinary' });
  assert.ok(!corriente.propuesta.ev);
  assert.match(textos(corriente.propuesta), /toca «epoch\.8\.9», que es una pieza de gobierno \(epoch\.7\.9\.7\), y se declara «ordinary»/);
  const r = await m.recorrer('R cruza', { 8: puente() }, { clase: 'governance' });
  assert.ok(r.puesta?.ev, textos(r.puesta ?? r.aprobacion ?? r.propuesta));
  assert.deepEqual(m.eje.epoca().registro[8][9][1], ['E', 'R']);
});

test('salida: restaurar y reordenar el libro de bea silenciada y sus declaraciones dan lo mismo', async () => {
  const { m, serieE } = await beaSilenciada();
  for (const k of ['R:ana', serieE]) assert.ok((await declara(m, k)).ev);
  const huella = (eje) => [eje.orden.length, eje.versiones().length, eje.sobre(eje.alta('bea').id, '8000000000').length, eje.saldo('bea', serieE)];
  const restaurado = await restaurar(serializar(m.eje));
  assert.deepEqual(huella(restaurado), huella(m.eje));
  const otro = await Eje.desde(m.eje.orden.map((id) => m.eje.obtener(id)));
  const { rechazados } = await otro.reordenar([...m.eje.orden]);
  assert.deepEqual(rechazados, []);
  assert.deepEqual(huella(otro), huella(m.eje));
});

// ---------- Preguntas que deja la salida con lo propio (para VG; no se arreglan aquí) ----------

test('S7: una declaración de saldo fechada en 2099 entra (no se le prueba «at most a year ahead») y adelanta el reloj del libro', {
  todo: 'PREGUNTA S7 (encargo «la salida con lo propio»): a una declaración solo se le prueba el suelo, y «at most a year ahead» no está en él; su t no tiene tope y adelanta el reloj del libro. Propuesta: añadir esa regla a 7.9.6 (solo lee el reloj del libro y epoch.7.0, que ya es suelo)',
}, async () => {
  const m = await mundo();
  const r = await A.transaccion(m.eje, 'declare a balance', { X: m.eje.alta('bea').id, series: 'R:ana' }, 'bea', { t: '2099-01-01T00:00:00Z' });
  const entra = r.ok ? await m.eje.anadir(r.evento).then(() => 'entra', (e) => e.message) : JSON.stringify(r.motivos);
  assert.notEqual(entra, 'entra', 'una declaración no adelanta el reloj del libro más allá de lo que admite cualquier registro');
});

test('S8: un cambio de gobierno que añade «not bea» y la pone en el suelo (7.9.6 se amplía) alcanza la declaración de bea', {
  todo: 'PREGUNTA S8 (encargo «la salida con lo propio»): a una declaración se le prueban las reglas de 7.9.6 de la versión vigente, y un cambio de gobierno puede ampliar 7.9.6 con una regla suya. Propuesta: probarle solo las del suelo de la versión de nacimiento, o no dejar que un cambio añada condiciones al suelo',
}, async () => {
  const m = await mundo();
  const k = () => ({ ref: m.eje.epoca().id });
  const lista = [...EPOCA_0_BTML.registro[7][9][6], 'not bea'];
  const r = await m.recorrer('fuera bea, en el suelo', { 2: [{ ref: idDeRegistro(VETO) }], 7: [k(), k(), k(), k(), k(), k(), k(), k(), k(), [k(), k(), k(), k(), k(), k(), lista]] }, { registros: [VETO] });
  assert.ok(r.puesta?.ev, 'control: entra en vigor: ' + textos(r.puesta ?? r.aprobacion ?? r.propuesta));
  assert.ok((await declara(m, 'R:ana')).ev, 'ninguna regla añadida alcanza la declaración de saldo');
});

// ---------- Lo que aguanta ----------

test('aguanta: sustituir «the cost of writing» o cambiar una posición del suelo, ni con un cambio de gobierno', async () => {
  const m = await mundo();
  const coste = copia(regla0('the cost of writing'));
  coste[2] = ['=0'];
  const r1 = await m.recorrer('escribir gratis', { 2: [{ ref: idDeRegistro(coste) }] }, { registros: [coste] });
  assert.ok(!r1.propuesta.ev, 'la propuesta no entra');
  assert.match(textos(r1.propuesta), /sustituye «the cost of writing»/);
  const k = { ref: m.eje.epoca().id };
  const r2 = await m.recorrer('día más corto', { 1: [k, k, k, [k, [k, [1]]]] });
  assert.ok(!r2.propuesta.ev);
  assert.match(textos(r2.propuesta), /epoch\.1\.3\.1/);
  assert.equal(m.eje.versiones().length, 1);
});

// ---------- Lo que añade el anexo de los arreglos (encargo-arreglos-gobierno-anexo.md) ----------

test('anexo H: una invitación con notas ajenas ancladas en su 7, en su 0 y en su 3 se acepta', async () => {
  const m = await mundo();
  const inv = await m.eje.invitar({ autor: 'ana', invitado: 'zed', t: m.reloj() });
  for (const en of ['7000000000', '0000000000', '3000000000', '3100000000', '3500000000']) {
    assert.equal(await m.aMano({ autor: 'cris', sobre: inv.id, en, movimientos: [pagaElCoste('cris')], payload: [['basura'], ['cris'], ['x'], ['cris']] }), 'entra', 'cris ancla en ' + en);
  }
  const r = await m.eje.aceptar(inv, {}, { t: m.reloj() }).then(() => 'entra', (e) => e.message);
  assert.equal(r, 'entra');
  assert.ok(m.eje.alta('zed'));
});

test('anexo I: un cambio «governance» que sustituye «approved» se rechaza por el suelo', async () => {
  const m = await mundo();
  const aprobado = copia(regla0('approved'));
  aprobado[2] = ['=true'];
  aprobado[6] = ['revisión de seguridad: aprobado siempre'];
  const r = await m.recorrer('aprobado siempre', { 2: [{ ref: idDeRegistro(aprobado) }] }, { registros: [aprobado] });
  assert.ok(!r.propuesta.ev);
  assert.match(textos(r.propuesta), /sustituye «approved», que es del suelo/);
  assert.equal(m.eje.versiones().length, 1);
});

test('anexo J: un cambio que mueve 7.9.2 dentro del rango entra con los dos tercios; fuera de rango, no', async () => {
  const m = await mundo();
  const k = { ref: m.eje.epoca().id };
  const fila = (dos) => [k, k, k, k, k, k, k, k, k, [k, k, [dos]]];
  const fuera = await m.recorrer('umbral alto 1', { 7: fila(1) });
  assert.ok(!fuera.propuesta.ev);
  assert.match(textos(fuera.propuesta), /un umbral es un número mayor que 0 y menor que 1/);
  const r = await m.recorrer('umbral alto 0.75', { 7: fila(0.75) });
  assert.ok(r.puesta?.ev, textos(r.aprobacion ?? r.propuesta));
  assert.deepEqual(m.eje.epoca().registro[7][9][2], [0.75]);
});
