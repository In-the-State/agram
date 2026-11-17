// La carta con varios libros (A24; agram-equipo/DISENO_CARTA_VARIOS_LIBROS.md §4.1 a §4.8), sin navegador: una persona es
// una clave y esa clave tiene varios libros. Lo que se comprueba:
//   1. una entrada antigua gana `libro` al abrirse;
//   2. abrir un libro nuevo con la misma clave da dos entradas con la misma `publica` y distinto `libro` (en el navegador y
//      con el guardián, que no crea otra cuenta y firma el génesis);
//   3. «Tus libros» las junta, pone el pequeño debajo de su grande y aparta las de otra clave; «solo en este dispositivo»;
//   4. dos libros con el mismo nombre no chocan ni en la lista ni en el archivo de copia;
//   5. abrir aquí un libro privado crea el pequeño y escribe «this book hangs from» con el libro y el elemento buenos; sin
//      claves de línea no escribe el anuncio y lo dice; con un anfitrión simulado que las da, lo escribe y es recíproco;
//   6. `criterios` y `firmar` llevan el `libro` del libro abierto y cambian al cambiar de libro;
//   7. «Entrar» aparece solo cuando tengo ese libro y lleva al génesis del pequeño; «Volver» lleva al elemento;
//   8. un «this book hangs from» escrito por quien no es el autor del génesis no cuenta;
//   9. olvidar un libro no toca los otros;
//  10. la copia de todos se restaura entera y, con una entrada rota, restaura las demás;
//  11. al cambiar de libro, la sincronía de antes queda suelta;
//  12. el pequeño nace con las reglas del grande: con la 0 sin cambios no escribe época; con cambios, el mismo id y las mismas reglas.
// Claves de PRUEBA, generadas en cada prueba; nada real.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Eje, autoridad, persistencia, salida, acciones, contrato, sincronia, epocaEscritaDe, EPOCA_0_BTML, idDeRegistro } from '../src/index.js';
import * as V from '../src/versiones.js';
import { schnorr } from '../src/vendor/noble-secp256k1.js';
import { aHex, deHex } from '../src/cripto.js';
import { quemaDelCoste } from '../src/escritura.js';
import * as Q from '../carta/cuentas.js';
import * as L from '../carta/libros.js';
import * as S from '../carta/sincronia.js';
import { arbol, preferencias } from '../carta/carta.js';
import { html, htmlTusLibros, htmlLibroPrivado } from '../carta/dom.js';
import { t } from '../carta/textos.js';
import { firmanteDeCuenta, pasarCriterios, clavesDeLinea, libroDeLaFirma } from '../carta/anfitrion.js';
import { entrarPorInvitacion } from '../ejemplos/ikisai/altas.mjs';

const T1 = '2026-11-17T10:00:00Z';
const T = (s) => new Date(Date.parse(T1) + s * 1000).toISOString().replace('.000Z', 'Z');
const FRASE = 'una frase larga que solo yo sé';
const ORDENADOR = { ancho: 1366, alto: 900 };
const ES = { idioma: 'es' };
const K1 = '11'.repeat(32);
const K2 = '22'.repeat(32);
const sha = (texto) => createHash('sha256').update(texto, 'utf8').digest('hex');
const conCodigo = (code) => Object.assign(new Error('el guardián dice ' + code), { code });

/** Un localStorage simulado mientras dura la prueba. */
async function conAlmacen(fn) {
  const almacen = new Map();
  globalThis.localStorage = { getItem: (k) => almacen.get(k) ?? null, setItem: (k, v) => almacen.set(k, String(v)), removeItem: (k) => almacen.delete(k) };
  try {
    return await fn(almacen);
  } finally {
    delete globalThis.localStorage;
  }
}

/**
 * El guardián simulado (como el de test/carta-guardian.test.js): una clave en memoria por cuenta; apunta cada firma con su
 * `libro` y su `segundoFactor`, y cada `criterios`. Con `claves`, ofrece `clavesDeLinea` y devuelve esas (más basura, que la
 * carta tira).
 */
function guardianDePrueba({ claves = null } = {}) {
  const privadas = new Map();
  const llamadas = { crear: [], firmar: [], criterios: [], clavesDeLinea: [] };
  const g = {
    firmante: () => null,
    async crearCuenta({ nombre }) {
      llamadas.crear.push(nombre);
      const par = await autoridad.generarClaves();
      privadas.set(par.publica, par.privada);
      return { publica: par.publica };
    },
    async cuentas() { return [...privadas.keys()].map((publica) => ({ nombre: 'importada', publica })); },
    async firmar({ publica, libro, canonico, id, segundoFactor }) {
      llamadas.firmar.push({ publica, libro, id, segundoFactor });
      const privada = privadas.get(publica);
      if (!privada) throw conCodigo('unknown_account');
      if (sha(canonico) !== id) throw conCodigo('id_mismatch');
      return { id, firma: aHex(schnorr.sign(deHex(id), deHex(privada), globalThis.crypto.getRandomValues(new Uint8Array(32)))) };
    },
    async sesion() { return { abierta: true, caduca: null }; },
    async criterios({ publica, libro, registros }) { llamadas.criterios.push({ publica, libro, n: registros.length }); return { aceptados: registros.length }; },
  };
  if (claves) {
    g.clavesDeLinea = async ({ publica, libro }) => {
      llamadas.clavesDeLinea.push({ publica, libro });
      return [...claves, { nivel: 1, clave: K2 }, { nivel: 9.5, clave: K1 }, { nivel: 3, clave: 'AB'.repeat(32) }, null, 'basura'];
    };
  }
  g.llamadas = llamadas;
  return g;
}

/** Mi primer libro (camino A) con un elemento «sala» anclado en mi alta, firmado. */
async function miLibro(nombre = 'Ana', titulo = 'sala') {
  const c = await Q.crearCuenta({ nombre, t: T1 });
  const tx = await acciones.transaccion(c.eje, 'anchor here', { X: c.cuenta.alta, title: titulo }, c.cuenta.identidad, { t: T1, firmar: Q.firmarCon(c.privada) });
  assert.equal(tx.ok, true, JSON.stringify(tx.motivos));
  const sala = await c.eje.anadir(tx.evento);
  return { ...c, sala };
}

// ---------- 1. una entrada antigua gana su libro ----------

test('una entrada antigua (sin `libro`) gana el id del génesis de su eje la primera vez que se abre', async () => {
  await conAlmacen(async () => {
    const c = await Q.crearCuenta({ nombre: 'Ana', t: T1 });
    assert.equal(c.cuenta.libro, c.eje.genesisId, 'una cuenta nueva ya nace con su libro');
    assert.equal(await Q.guardarCuenta(c), true);
    assert.equal(Q.cuentas()[0].libro, c.eje.genesisId);
    // Lo que guardaba la carta antes: la entrada sin `libro`.
    const { libro, ...antigua } = Q.cuentas()[0];
    assert.equal(libro, c.eje.genesisId);
    globalThis.localStorage.setItem(Q.CLAVES.cuentas, JSON.stringify([antigua]));
    assert.equal(Q.cuentas()[0].libro, undefined);
    const r = await Q.abrirCuenta(c.cuenta.alta);
    assert.equal(r.cuenta.libro, c.eje.genesisId);
    assert.equal(Q.cuentas()[0].libro, c.eje.genesisId, 'y queda guardada');
    assert.equal(r.cuenta.cuelga, undefined, 'no cuelga de nada');
  });
});

// ---------- 2. un libro nuevo con mi clave ----------

test('abrir un libro nuevo con la misma clave: dos entradas con la misma `publica` y distinto `libro`; «persona nueva» sigue dando otra clave', async () => {
  await conAlmacen(async () => {
    const a = await Q.crearCuenta({ nombre: 'Ana', t: T1 });
    await Q.guardarCuenta(a);
    const b = await Q.crearCuenta({ nombre: 'Trabajo', t: T(1), conClave: { publica: a.publica, privada: a.privada }, identidad: a.cuenta.identidad });
    await Q.guardarCuenta(b);
    assert.equal(b.publica, a.publica);
    assert.equal(b.privada, a.privada);
    assert.equal(b.cuenta.identidad, a.cuenta.identidad, 'la misma persona en los dos libros');
    assert.notEqual(b.cuenta.libro, a.cuenta.libro);
    assert.equal(b.eje.obtener(b.eje.genesisId).payload, 'Trabajo', 'el nombre del libro en su 0');
    assert.equal(await autoridad.verificar(b.eje.obtener(b.eje.genesisId), a.publica), true, 'el génesis lo firma mi clave');
    const lista = Q.cuentas();
    assert.deepEqual(lista.map((e) => [e.publica, e.libro]), [[a.publica, a.cuenta.libro], [a.publica, b.cuenta.libro]]);
    // Una privada que no es la pareja de la pública no abre libro.
    await assert.rejects(Q.crearCuenta({ nombre: 'Otro', conClave: { publica: a.publica, privada: (await autoridad.generarClaves()).privada } }), /pareja/);
    // Persona nueva: una clave nueva.
    const nueva = await Q.crearCuenta({ nombre: 'Bea', t: T1 });
    assert.notEqual(nueva.publica, a.publica);
    // Los dos libros se abren por separado, cada uno con su eje.
    const ra = await Q.abrirCuenta(a.cuenta.alta);
    const rb = await Q.abrirCuenta(b.cuenta.alta);
    assert.deepEqual([ra.eje.genesisId, rb.eje.genesisId], [a.cuenta.libro, b.cuenta.libro]);
  });
});

test('con el guardián: un libro nuevo con mi clave usa la misma `publica` (no pide otra cuenta) y el guardián firma su génesis, con su libro', async () => {
  await conAlmacen(async () => {
    const g = guardianDePrueba();
    const a = await Q.crearCuenta({ nombre: 'Ana', t: T1, guardian: g });
    const b = await Q.crearCuenta({ nombre: 'Trabajo', t: T(1), guardian: g, conClave: { publica: a.publica }, identidad: a.cuenta.identidad });
    assert.deepEqual(g.llamadas.crear, ['Ana'], 'una sola cuenta en el guardián');
    assert.deepEqual([b.publica, b.cuenta.guardian, b.cuenta.identidad], [a.publica, true, a.cuenta.identidad]);
    assert.notEqual(b.cuenta.libro, a.cuenta.libro);
    const delGenesis = g.llamadas.firmar.find((f) => f.id === b.eje.genesisId);
    assert.equal(delGenesis.libro, b.eje.genesisId, 'firma el génesis del libro nuevo, y lo dice');
    assert.equal(await autoridad.verificar(b.eje.obtener(b.eje.genesisId), a.publica), true);
  });
});

// ---------- 3 y 4. «Tus libros» y las etiquetas ----------

test('«Tus libros»: junta los de mi clave, el pequeño debajo de su grande con el nombre del elemento, aparta las otras claves y marca los que no tienen destino', () => {
  const yo = 'aa'.repeat(32);
  const otra = 'bb'.repeat(32);
  const G = 'c1'.repeat(32);
  const P = 'c2'.repeat(32);
  const E = 'e1'.repeat(32);
  const entradas = [
    { nombre: 'Ana', alta: G, libro: G, publica: yo },
    { nombre: 'Sala privada', alta: P, libro: P, publica: yo, cuelga: { libro: G, elemento: E, nombre: 'sala' } },
    { nombre: 'Huérfano', alta: 'c3'.repeat(32), libro: 'c3'.repeat(32), publica: yo, cuelga: { libro: 'ff'.repeat(32), elemento: E } },
    { nombre: 'Bea', alta: 'd1'.repeat(32), libro: 'd1'.repeat(32), publica: otra },
  ];
  const l = L.tusLibros(entradas, { publica: yo, abierto: P, conDestino: (alta) => alta === G });
  assert.deepEqual(l.propios.map((f) => [f.etiqueta, f.soloAqui, f.colgados.map((h) => [h.etiqueta, h.elemento, h.abierto])]), [
    ['Ana', false, [['Sala privada', 'sala', true]]],
    ['Huérfano', true, []],
  ]);
  assert.deepEqual(l.propios[1].cuelga, { elemento: 'e1e1e1e1' }, 'cuelga de un libro que no está aquí: el id corto del elemento');
  assert.deepEqual(l.otras.map((f) => f.etiqueta), ['Bea'], 'otras personas en este dispositivo, aparte');
  const h = htmlTusLibros(l);
  assert.match(h, /data-tus-libros/);
  assert.match(h, new RegExp(`data-libro="${P}" aria-current="true" disabled`));
  assert.ok(h.includes(t('libroSoloAqui')) && h.includes(t('libroOtrasPersonas')) && h.includes(t('libroAbrirOtro')));
  assert.match(h, /cuelga de «sala»/);
  assert.equal(htmlTusLibros(undefined), '', 'en un ejemplo, nada');
});

test('dos libros con el mismo nombre no chocan: ni en la lista (ocho letras del libro) ni en el archivo de copia', async () => {
  await conAlmacen(async () => {
    const a = await Q.crearCuenta({ nombre: 'Casa', t: T1 });
    const b = await Q.crearCuenta({ nombre: 'Casa', t: T(1), conClave: { publica: a.publica, privada: a.privada } });
    await Q.guardarCuenta(a);
    await Q.guardarCuenta(b);
    const e = L.etiquetas(Q.cuentas());
    assert.deepEqual([e.get(a.cuenta.alta), e.get(b.cuenta.alta)], ['Casa · ' + a.cuenta.libro.slice(0, 8), 'Casa · ' + b.cuenta.libro.slice(0, 8)]);
    assert.notEqual(Q.nombreDeArchivo(a.cuenta), Q.nombreDeArchivo(b.cuenta));
    assert.equal(Q.nombreDeArchivo(a.cuenta), 'agram-casa-' + a.cuenta.libro.slice(0, 8) + '.json');
    const l = L.tusLibros(Q.cuentas(), { publica: a.publica });
    assert.equal(new Set(l.propios.map((f) => f.etiqueta)).size, 2);
    assert.equal(L.etiquetas([{ nombre: 'Única', alta: 'x' }]).get('x'), 'Única', 'sin choque, el nombre tal cual');
  });
});

// ---------- 5. abrir aquí un libro privado ----------

test('abrir aquí un libro privado (clave en el navegador): crea el pequeño con mi clave y escribe «this book hangs from» con el libro y el elemento buenos; sin claves de línea no anuncia y lo dice', async () => {
  await conAlmacen(async () => {
    const g = await miLibro();
    await Q.guardarCuenta(g);
    const previa = await L.previaDelLibroPrivado(g.eje, g.sala.id, g.cuenta.identidad, ES);
    assert.deepEqual([previa.elemento, previa.nombre], ['sala', 'sala'], 'el nombre del elemento, por defecto');
    assert.ok(previa.cuelga?.exigido > 0, 'lo que cuesta escribir de qué cuelga, a la vista antes de confirmar');
    const dialogo = htmlLibroPrivado({ X: g.sala.id, ...previa, fase: 'pedir' });
    assert.match(dialogo, /data-libro-privado-form/);
    assert.match(dialogo, /data-coste-cuelga>En él se escribe de qué cuelga: cuesta /);
    const r = await L.abrirLibroPrivado({ grande: { eje: g.eje, cuenta: g.cuenta, privada: g.privada }, X: g.sala.id, nombre: 'Sala privada', t: T(5) });
    const p = r.pequeno;
    assert.equal(r.falta, undefined, JSON.stringify(r.motivos));
    assert.deepEqual([p.cuenta.publica, p.cuenta.identidad, p.eje.clave(g.cuenta.identidad)], [g.publica, g.cuenta.identidad, g.publica], 'mi clave, mi identidad');
    assert.notEqual(p.eje.genesisId, g.eje.genesisId);
    assert.deepEqual(contrato.cuelgaDe(p.eje), { libro: g.eje.genesisId, elemento: g.sala.id, id: r.cuelga.id, t: T(5) });
    assert.equal(await autoridad.verificar(r.cuelga, g.publica), true, 'firmado con mi clave');
    const pagado = r.cuelga.movimientos.filter((m) => m.token === 'T' && m.a === null).map((m) => ({ escala: m.escala, cantidad: m.cantidad }));
    assert.deepEqual(pagado, previa.cuelga.denominacion, 'paga en su libro la T que se enseñó antes de confirmar');
    assert.deepEqual(r.claves, [], 'con la clave en el navegador no hay quien selle: ninguna clave de línea');
    // Guardado aquí, sin cambiar el libro abierto, con lo que se sabe del enlace.
    assert.equal(Q.ultima(), g.cuenta.alta, 'el libro abierto sigue siendo el grande');
    const entrada = Q.cuentas().find((e) => e.alta === p.cuenta.alta);
    assert.deepEqual([entrada.libro, entrada.cuelga], [p.eje.genesisId, { libro: g.eje.genesisId, elemento: g.sala.id, nombre: 'sala' }]);
    assert.equal((await Q.abrirCuenta(p.cuenta.alta)).eje.orden.length, p.eje.orden.length);
    // Sin claves, el anuncio no se escribe y la carta lo dice llano.
    const sin = await L.anunciarLibroPrivado(g.eje, g.sala.id, g.cuenta.identidad, { libro: p.eje.genesisId, claves: r.claves, firmar: Q.firmarCon(g.privada) });
    assert.deepEqual([sin.ok, sin.sinClaves], [false, true]);
    assert.deepEqual(contrato.librosPrivados(g.eje, g.sala.id), [], 'nada se escribió en el grande');
    assert.equal(contrato.enlaceReciproco(g.eje, p.eje), false);
    const hecho = htmlLibroPrivado({ X: g.sala.id, nombre: 'Sala privada', elemento: 'sala', fase: 'hecho', sinClaves: true, entrar: p.cuenta.alta, libro: p.eje.genesisId });
    assert.ok(hecho.includes('todavía no se anuncia en el libro grande: este libro no tiene quien lo selle'));
    assert.match(hecho, new RegExp(`data-libro-entrar="${p.cuenta.alta}" data-foco="${p.eje.genesisId}"`));
  });
});

test('abrir aquí un libro privado con un anfitrión simulado que da claves de línea: escribe también el anuncio y el enlace es recíproco; con guardián, cada firma pide diálogo y lleva su libro', async () => {
  await conAlmacen(async () => {
    const g = guardianDePrueba({ claves: [{ nivel: 1, clave: K1 }, { nivel: 2, clave: K2 }] });
    const grande = await Q.crearCuenta({ nombre: 'Ana', t: T1, guardian: g });
    const firmanteGrande = firmanteDeCuenta(g, grande.publica, { eje: () => grande.eje });
    const firmarGrande = autoridad.firmanteDeEventos(firmanteGrande, { publica: grande.publica });
    const tx = await acciones.transaccion(grande.eje, 'anchor here', { X: grande.cuenta.alta, title: 'sala' }, grande.cuenta.identidad, { t: T1, firmar: firmarGrande });
    const sala = await grande.eje.anadir(tx.evento);
    await Q.guardarCuenta(grande);
    const antes = g.llamadas.firmar.length;
    const r = await L.abrirLibroPrivado({ grande: { eje: grande.eje, cuenta: grande.cuenta }, X: sala.id, nombre: 'Sala privada', guardian: g, t: T(5) });
    const p = r.pequeno;
    assert.equal(r.falta, undefined, JSON.stringify(r.motivos));
    assert.deepEqual(g.llamadas.crear, ['Ana'], 'ninguna cuenta nueva en el guardián');
    assert.deepEqual([p.cuenta.publica, p.cuenta.guardian], [grande.publica, true]);
    const delPequeno = g.llamadas.firmar.slice(antes);
    assert.ok(delPequeno.length >= 2, 'el génesis y «this book hangs from»');
    assert.ok(delPequeno.every((f) => f.segundoFactor === true), 'abrir un libro privado pide siempre diálogo');
    assert.ok(delPequeno.every((f) => f.libro === p.eje.genesisId), 'cada firma dice en qué libro se firma');
    assert.deepEqual(g.llamadas.clavesDeLinea, [{ publica: grande.publica, libro: p.eje.genesisId }]);
    assert.deepEqual(r.claves, [{ nivel: 1, clave: K1 }, { nivel: 2, clave: K2 }], 'las del anfitrión, limpias de basura y sin repetir nivel');
    // El anuncio, con su coste a la vista antes de confirmar, y escrito por el camino de siempre.
    const coste = L.costeDelAnuncio(grande.eje, sala.id, grande.cuenta.identidad, { libro: p.eje.genesisId, claves: r.claves });
    assert.ok(coste.exigido > (L.costeDelAnuncio(grande.eje, sala.id, grande.cuenta.identidad, { libro: p.eje.genesisId, claves: r.claves.slice(0, 1) }).exigido), 'más claves, más coste');
    assert.match(htmlLibroPrivado({ X: sala.id, nombre: 'Sala privada', elemento: 'sala', fase: 'anunciar', claves: 2, anuncio: coste }), /data-coste-anuncio>Anunciarlo aquí, en «sala», con 2 claves para sellarlo: cuesta /);
    const antesDelAnuncio = g.llamadas.firmar.length;
    const a = await L.anunciarLibroPrivado(grande.eje, sala.id, grande.cuenta.identidad, { libro: p.eje.genesisId, claves: r.claves, firmar: firmarGrande, t: T(6) });
    assert.equal(a.ok, true, JSON.stringify(a.motivos));
    const firmaDelAnuncio = g.llamadas.firmar.slice(antesDelAnuncio);
    assert.deepEqual(firmaDelAnuncio.map((f) => [f.libro, f.segundoFactor]), [[grande.eje.genesisId, true]], 'en el grande, con diálogo');
    assert.deepEqual(contrato.librosPrivados(grande.eje, sala.id).map((l) => [l.libro, l.claves, l.quien]), [[p.eje.genesisId, r.claves, grande.cuenta.identidad]]);
    assert.equal(contrato.enlaceReciproco(grande.eje, p.eje), true);
    const pagado = a.asentado.movimientos.filter((m) => m.token === 'T' && m.a === null).map((m) => ({ escala: m.escala, cantidad: m.cantidad }));
    assert.deepEqual(pagado, coste.denominacion, 'paga en el grande la T que se enseñó antes de confirmar');
  });
});

test('las claves de línea: sin el verbo, o si el anfitrión falla, ninguna; nunca más de cuatro', async () => {
  assert.deepEqual(await clavesDeLinea(null, K1, K2), []);
  assert.deepEqual(await clavesDeLinea({ clavesDeLinea: async () => { throw new Error('no'); } }, K1, K2), []);
  assert.deepEqual(await clavesDeLinea({ clavesDeLinea: async () => 'basura' }, K1, K2), []);
  const muchas = [1, 2, 3, 4, 5, 6].map((nivel) => ({ nivel, clave: K1 }));
  assert.equal((await clavesDeLinea({ clavesDeLinea: async () => muchas }, K1, K2)).length, 4);
});

// ---------- 6. criterios y firmar llevan el libro abierto ----------

test('`criterios` y `firmar` llevan el `libro` del libro abierto y cambian al cambiar de libro', async () => {
  await conAlmacen(async () => {
    const g = guardianDePrueba();
    const a = await Q.crearCuenta({ nombre: 'Ana', t: T1, guardian: g });
    const b = await Q.crearCuenta({ nombre: 'Trabajo', t: T(1), guardian: g, conClave: { publica: a.publica }, identidad: a.cuenta.identidad });
    let abierto = a.eje; // el eje en pantalla, como estado.eje en la carta
    const firmante = firmanteDeCuenta(g, a.publica, { eje: () => abierto });
    const firmar = autoridad.firmanteDeEventos(firmante, { publica: a.publica });
    const escribir = async (c, titulo, s) => {
      const tx = await acciones.transaccion(c.eje, 'anchor here', { X: c.cuenta.alta, title: titulo }, c.cuenta.identidad, { t: T(s), firmar });
      assert.equal(tx.ok, true, JSON.stringify(tx.motivos));
      return c.eje.anadir(tx.evento);
    };
    const n = g.llamadas.firmar.length;
    await escribir(a, 'en el primero', 10);
    abierto = b.eje; // cambiar de libro
    await escribir(b, 'en el segundo', 11);
    assert.deepEqual(g.llamadas.firmar.slice(n).map((f) => f.libro), [a.eje.genesisId, b.eje.genesisId]);
    await pasarCriterios(g, a.eje, a.cuenta.identidad, a.publica);
    await pasarCriterios(g, b.eje, b.cuenta.identidad, b.publica);
    assert.deepEqual(g.llamadas.criterios.map((c) => [c.publica, c.libro]), [[a.publica, a.eje.genesisId], [a.publica, b.eje.genesisId]]);
    // El génesis de un libro que nace: su propio id.
    assert.equal(libroDeLaFirma(null, { canonico: JSON.stringify({ sobre: null, contexto: { genesis: true } }), id: K1 }), K1);
    assert.equal(libroDeLaFirma(null, { canonico: '{}', id: K1 }), null);
  });
});

// ---------- 7 y 8. entrar y volver ----------

/** Dos libros de ana (el grande con «sala» y el pequeño colgado de ella), anunciado o no, en ejes de demostración. */
async function grandeYPequeno({ anunciar = true } = {}) {
  const grande = await Eje.genesis({ demostracion: true, identidad: 'ana', t: T1, foco: ['Ana'], emision: [{ token: 'R', cantidad: 10 }] });
  await entrarPorInvitacion(grande, { por: 'ana', quien: 'bea', t: T1 });
  const lanzar = async (eje, nombre, X, parametros, yo = 'ana', t = T1) => {
    const r = await acciones.transaccion(eje, nombre, { X, ...parametros }, yo, { t });
    assert.ok(r.ok, nombre + ': ' + JSON.stringify(r.motivos));
    return eje.anadir(r.evento);
  };
  const sala = await lanzar(grande, 'anchor here', grande.genesisId, { title: 'sala', content: 'la sala' });
  const pequeno = await Eje.genesis({ demostracion: true, identidad: 'ana', t: T(100), foco: ['Sala privada'], emision: [{ token: 'R', cantidad: 5 }] });
  await entrarPorInvitacion(pequeno, { por: 'ana', quien: 'bea', t: T(100) });
  await lanzar(pequeno, 'this book hangs from', pequeno.genesisId, { book: grande.genesisId, element: sala.id }, 'ana', T(101));
  if (anunciar) await lanzar(grande, 'open a private book here', sala.id, { book: pequeno.genesisId, 'line keys': [[1, K1]] }, 'ana', T(102));
  const yo = '99'.repeat(32);
  const entradaGrande = { ...Q.entradaDe({ nombre: 'Ana', identidad: 'ana', alta: grande.genesisId, publica: yo }, grande) };
  const entradaPequeno = { ...Q.entradaDe({ nombre: 'Sala privada', identidad: 'ana', alta: pequeno.genesisId, publica: yo }, pequeno) };
  return { grande, pequeno, sala, lanzar, entradaGrande, entradaPequeno };
}

const reverso = async (eje, X, yo, libros) => html(await arbol({ foco: { X, pv: 5 } }, eje, yo, ORDENADOR, { ...ES, ...(libros ? { libros } : {}) }));

test('«Entrar» aparece en la línea del libro privado solo cuando ese libro es mío y lleva al génesis del pequeño; «Volver», en su génesis, lleva al elemento', async () => {
  const { grande, pequeno, sala, entradaGrande, entradaPequeno } = await grandeYPequeno();
  assert.deepEqual(entradaPequeno.cuelga, { libro: grande.genesisId, elemento: sala.id }, 'la entrada lee de qué cuelga');
  // Sin el libro aquí (otra persona, o un ejemplo): la línea de siempre, sin enlace.
  const ajeno = await reverso(grande, sala.id, 'bea', { propios: [] });
  assert.match(ajeno, /<small class="custodia-privado">un libro privado \([0-9a-f]{8}\) cuelga de aquí; lo abrió ana<\/small>/);
  assert.doesNotMatch(ajeno, /data-libro-entrar/);
  assert.doesNotMatch(await reverso(grande, sala.id, 'ana'), /data-libro-entrar/, 'sin varios libros (un ejemplo), como antes');
  // Con mi libro: «Entrar», al génesis del pequeño.
  const mio = await reverso(grande, sala.id, 'ana', { propios: [entradaGrande, entradaPequeno] });
  assert.match(mio, new RegExp(`data-libro-entrar="${pequeno.genesisId}" data-foco="${pequeno.genesisId}"`));
  // En el génesis del pequeño: de qué cuelga, con «Volver» al elemento del grande (que tengo aquí).
  const genesis = await reverso(pequeno, pequeno.genesisId, 'ana', { propios: [entradaGrande, entradaPequeno] });
  assert.ok(genesis.includes('este libro cuelga de «' + sala.id.slice(0, 8) + '», en «Ana»'));
  assert.match(genesis, new RegExp(`data-libro-volver="${grande.genesisId}" data-foco="${sala.id}"`));
  // Sin el grande aquí: la línea, sin «Volver».
  const sinGrande = await reverso(pequeno, pequeno.genesisId, 'ana', { propios: [entradaPequeno] });
  assert.match(sinGrande, /data-cuelga=/);
  assert.doesNotMatch(sinGrande, /data-libro-volver/);
  // Con el nombre del elemento en mi entrada, se dice con él.
  const conNombre = await reverso(pequeno, pequeno.genesisId, 'ana', { propios: [entradaGrande, { ...entradaPequeno, cuelga: { ...entradaPequeno.cuelga, nombre: 'sala' } }] });
  assert.ok(conNombre.includes('este libro cuelga de «sala», en «Ana»'));
});

test('un libro mío que cuelga de un elemento y aún no se anuncia: «Entrar» igual, dicho llano; «abrir aquí un libro privado» solo en una cuenta que firma', async () => {
  const { grande, pequeno, sala, entradaGrande, entradaPequeno } = await grandeYPequeno({ anunciar: false });
  const mio = await reverso(grande, sala.id, 'ana', { propios: [entradaGrande, entradaPequeno], puedeAbrir: true });
  assert.match(mio, /data-sin-anunciar/);
  assert.ok(mio.includes('tu libro «Sala privada» cuelga de aquí; todavía no se anuncia en este libro'));
  assert.match(mio, new RegExp(`data-libro-entrar="${pequeno.genesisId}" data-foco="${pequeno.genesisId}"`));
  assert.match(mio, new RegExp(`data-libro-privado="${sala.id}"`), 'el gesto, sobre el elemento');
  assert.doesNotMatch(await reverso(grande, sala.id, 'ana', { propios: [entradaGrande, entradaPequeno] }), /data-libro-privado=/, 'sin una cuenta que firma, no');
  // En el génesis del pequeño: que no se anuncia, llano; con anfitrión que da claves, «Anunciarlo en el libro grande».
  const sin = await reverso(pequeno, pequeno.genesisId, 'ana', { propios: [entradaGrande, entradaPequeno] });
  assert.ok(sin.includes(t('libroSinSellador')));
  const con = await reverso(pequeno, pequeno.genesisId, 'ana', { propios: [entradaGrande, entradaPequeno], puedeAnunciar: true });
  assert.match(con, new RegExp(`data-libro-anunciar="${grande.genesisId}" data-foco="${sala.id}"`));
  const anunciado = await reverso(pequeno, pequeno.genesisId, 'ana', { propios: [entradaGrande, { ...entradaPequeno, cuelga: { ...entradaPequeno.cuelga, anunciado: true } }], puedeAnunciar: true });
  assert.doesNotMatch(anunciado, /data-libro-anunciar|custodia-cuelga-anuncio/);
});

test('un «this book hangs from» escrito por quien no es el autor del génesis no cuenta: ni la entrada lo toma, ni se ofrece entrar, ni volver', async () => {
  const { grande, pequeno, sala, lanzar, entradaGrande } = await grandeYPequeno({ anunciar: false });
  // Un libro de ana donde bea escribe a mano que cuelga de la sala (pagando la atención sobre el alta de ana).
  const otro = await Eje.genesis({ demostracion: true, identidad: 'ana', t: T(200), foco: ['Otro'], emision: [{ token: 'R', cantidad: 5 }] });
  await entrarPorInvitacion(otro, { por: 'ana', quien: 'bea', t: T(200) });
  const carta = await acciones.transaccion(otro, 'write to X', { X: otro.genesisId, text: 'hola' }, 'bea', { t: T(201) });
  const pago = carta.evento.movimientos.filter((m) => m.a !== null || m.token !== 'T');
  const payload = ['a mano', [grande.genesisId], [sala.id], ['bea'], ['this book hangs from']];
  await otro.escribir({ autor: 'bea', sobre: otro.genesisId, en: '9500000000', t: T(202), payload, movimientos: [quemaDelCoste('bea', payload, 'minuto', { eje: otro }), ...pago] });
  assert.equal(contrato.cuelgaDe(otro), null);
  const entradaOtro = Q.entradaDe({ nombre: 'Otro', identidad: 'ana', alta: otro.genesisId, publica: entradaGrande.publica }, otro);
  assert.equal(entradaOtro.cuelga, undefined, 'la entrada no lo toma');
  // Ana lo anuncia en la sala: como el pequeño no lo dice (lo dijo otro), no es recíproco: se dice y no se ofrece entrar.
  await lanzar(grande, 'open a private book here', sala.id, { book: otro.genesisId, 'line keys': [[1, K1]] }, 'ana', T(203));
  assert.equal(contrato.enlaceReciproco(grande, otro), false);
  const linea = await reverso(grande, sala.id, 'ana', { propios: [entradaGrande, entradaOtro] });
  assert.match(linea, /data-no-reciproco/);
  assert.doesNotMatch(linea, new RegExp(`data-libro-entrar="${otro.genesisId}"`));
  // En su génesis no hay línea de qué cuelga.
  assert.doesNotMatch(await reverso(otro, otro.genesisId, 'ana', { propios: [entradaGrande, entradaOtro] }), /data-cuelga=|data-libro-volver/);
  void pequeno;
});

// ---------- 9. olvidar un libro ----------

test('olvidar un libro no toca los otros de la misma clave', async () => {
  await conAlmacen(async (almacen) => {
    const a = await Q.crearCuenta({ nombre: 'Ana', t: T1 });
    const b = await Q.crearCuenta({ nombre: 'Trabajo', t: T(1), conClave: { publica: a.publica, privada: a.privada }, identidad: a.cuenta.identidad });
    await Q.guardarCuenta(a);
    await Q.guardarCuenta(b);
    Q.guardarClaveLectura(a.cuenta.alta, 'lectura-a');
    Q.guardarClaveLectura(b.cuenta.alta, 'lectura-b');
    Q.olvidarCuenta(b.cuenta.alta, [b.cuenta.identidad]);
    assert.deepEqual(Q.cuentas().map((e) => e.alta), [a.cuenta.alta]);
    assert.ok([...almacen.keys()].every((k) => !k.includes(b.cuenta.alta)), 'nada queda del olvidado');
    const ra = await Q.abrirCuenta(a.cuenta.alta);
    assert.equal(ra.privada, a.privada, 'la clave del otro libro sigue, guardada por su alta');
    assert.equal(ra.eje.genesisId, a.cuenta.libro);
    assert.equal(Q.claveLectura(a.cuenta.alta), 'lectura-a');
  });
});

// ---------- 10. la copia de todos mis libros ----------

test('la copia de todos mis libros: una lista de las copias de cada libro tal cual; se restaura entera y, con una entrada rota, restaura las demás y dice cuál falló', async () => {
  let texto;
  let a;
  let b;
  await conAlmacen(async () => {
    a = await miLibro('Ana');
    b = await Q.crearCuenta({ nombre: 'Trabajo', t: T(1), conClave: { publica: a.publica, privada: a.privada }, identidad: a.cuenta.identidad });
    await Q.guardarCuenta(a);
    await Q.guardarCuenta(b);
    Q.guardarClaveLectura(a.cuenta.alta, 'lectura-a');
    const { libros, fallidos } = await L.librosParaCopia(Q.cuentas());
    assert.deepEqual([libros.length, fallidos], [2, []]);
    const archivo = await Q.exportarTodos(libros, FRASE, { iteraciones: 1000, t: T1 });
    assert.deepEqual([archivo.formato, archivo.version, archivo.copias.length], [Q.FORMATO_DE_TODOS, Q.VERSION_DE_TODOS, 2]);
    assert.ok(archivo.copias.every((c) => c.formato === Q.FORMATO && c.version === Q.VERSION), 'cada copia, en su formato de siempre');
    texto = Q.textoDeArchivo(archivo);
    assert.ok(!texto.includes(a.privada) && !texto.includes('lectura-a'), 'nada en claro');
    assert.equal(Q.esCopiaDeTodos(texto), true);
    assert.equal(Q.esCopiaDeTodos(Q.textoDeArchivo(await Q.exportarCuenta(a, FRASE, { iteraciones: 1000 }))), false, 'la de un libro, no');
  });
  // Otro dispositivo: se restaura entera.
  await conAlmacen(async () => {
    const r = await Q.restaurarTodos(texto, FRASE);
    assert.deepEqual([r.restaurados.length, r.fallidos], [2, []]);
    assert.deepEqual(r.restaurados.map((x) => [x.cuenta.libro, x.cuenta.publica]), [[a.cuenta.libro, a.publica], [b.cuenta.libro, a.publica]]);
    assert.equal(r.restaurados[0].claveLectura, 'lectura-a');
    assert.deepEqual(r.restaurados[0].eje.orden, a.eje.orden);
  });
  // Con una entrada rota (su eje tocado) y otra que no es una copia: las demás se restauran, y se dice cuáles fallaron.
  const roto = JSON.parse(texto);
  roto.copias[0].eje.eventos[1].payload = ['otra cosa'];
  roto.copias.push({ formato: 'otro', nombre: 'Basura' });
  const r = await Q.restaurarTodos(roto, FRASE);
  assert.deepEqual(r.restaurados.map((x) => x.cuenta.alta), [b.cuenta.alta]);
  assert.deepEqual(r.fallidos.map((f) => [f.posicion, f.nombre]), [[1, 'Ana'], [3, 'Basura']]);
  assert.ok(r.fallidos.every((f) => typeof f.motivo === 'string' && f.motivo));
  await assert.rejects(Q.restaurarTodos({ formato: 'otro' }, FRASE), /no es una copia de todos/);
  // La frase incorrecta: todas fallan, cada una con el mismo motivo sin pistas.
  const mal = await Q.restaurarTodos(texto, 'otra frase');
  assert.deepEqual([mal.restaurados.length, mal.fallidos.map((f) => f.motivo)], [0, [Q.FRASE_INCORRECTA, Q.FRASE_INCORRECTA]]);
});

// ---------- 11. la sincronía al cambiar de libro ----------

test('al cambiar de libro, la sincronía de antes queda suelta: su estado guardado por su alta, una sola viva, cada libro con su destino y su clave de lectura', async () => {
  await conAlmacen(async () => {
    const sinRed = () => Promise.reject(new TypeError('fetch failed'));
    const a = await Q.crearCuenta({ nombre: 'Ana', t: T1 });
    const b = await Q.crearCuenta({ nombre: 'Trabajo', t: T(1), conClave: { publica: a.publica, privada: a.privada }, identidad: a.cuenta.identidad });
    for (const [c, nombre] of [[a, 'libro-a'], [b, 'libro-b']]) {
      const p = preferencias(c.eje, c.cuenta.identidad, { [sincronia.CONFIGURACION.url]: ['https://nodo.ejemplo.org'], [sincronia.CONFIGURACION.eje]: [nombre] });
      await salida.escribirDesde(c.eje, { modo: 'sequenced', autor: c.cuenta.identidad, sobre: p.sobre, en: p.en, payload: p.payload, t: T(2) }, c.privada);
      await Q.guardarCuenta(c);
      Q.guardarClaveLectura(c.cuenta.alta, 'lectura-' + nombre);
    }
    // El libro A abierto: su sincronía.
    let viva = S.abrir({ alta: a.cuenta.alta, eje: a.eje, yo: a.cuenta.identidad, fetch: sinRed });
    const deA = viva;
    assert.equal(deA.eje, 'libro-a');
    const enMarcha = S.pasar(deA, a.eje, a.cuenta.alta); // una pasada de A que sigue en marcha al cambiar
    // Cambiar a B: la de A se suelta (su estado, guardado por su alta) y se abre la de B.
    viva = S.soltar(viva, a.cuenta.alta) ?? S.abrir({ alta: b.cuenta.alta, eje: b.eje, yo: b.cuenta.identidad, fetch: sinRed });
    assert.notEqual(viva, deA);
    assert.deepEqual([viva.eje, viva.url], ['libro-b', 'https://nodo.ejemplo.org']);
    assert.ok(Q.estadoSincronia(a.cuenta.alta), 'el estado de la de antes, guardado');
    assert.equal(Q.estadoSincronia(a.cuenta.alta).eje, 'libro-a');
    await enMarcha; // lo que tenía en marcha acaba y guarda lo suyo por su alta, sin tocar el libro nuevo
    assert.equal(Q.estadoSincronia(b.cuenta.alta), null, 'B aún no ha guardado nada: nada de A cayó en B');
    await S.pasar(viva, b.eje, b.cuenta.alta);
    assert.deepEqual([Q.estadoSincronia(a.cuenta.alta).eje, Q.estadoSincronia(b.cuenta.alta).eje], ['libro-a', 'libro-b']);
    // Un libro sin destino no sincroniza: «solo en este dispositivo».
    const c = await Q.crearCuenta({ nombre: 'Solo aquí', t: T(3), conClave: { publica: a.publica, privada: a.privada } });
    await Q.guardarCuenta(c);
    assert.equal(S.abrir({ alta: c.cuenta.alta, eje: c.eje, yo: c.cuenta.identidad, fetch: sinRed }), null);
    assert.equal(S.soltar(null, c.cuenta.alta), null, 'soltar sin sincronía no hace nada');
  });
});

test('un libro privado sin claves de línea se abre y se dice llano que de él no se podrá traer nada al otro hasta anotarlas', () => {
  const frase = 'Sin claves de línea, de este libro no se podrá traer nada al otro hasta anotarlas.';
  assert.ok(t('libroPrivadoSinClaves').endsWith(frase), 'al crearlo');
  assert.ok(t('libroSinSellador').endsWith(frase), 'al entrar en su génesis');
  const hecho = htmlLibroPrivado({ X: 'x'.repeat(64), nombre: 'Sala privada', elemento: 'sala', fase: 'hecho', sinClaves: true, entrar: 'a'.repeat(64), libro: 'b'.repeat(64) });
  assert.ok(hecho.includes(frase) && hecho.includes('data-falta'));
  assert.ok(hecho.includes('Creado el libro «Sala privada».'), 'creado, sin más');
});

// ---------- 12. el pequeño nace con las reglas del grande ----------

/** Un cambio sobre la 0 del código (como test/epoca-por-referencia.test.js): más margen en la fila 7.3. */
function cambioDePrueba() {
  const B = EPOCA_0_BTML.id;
  const m = { ref: B };
  const cambio = { raiz: [['más margen'], m, m, m, m, m, [['propuesto en la prueba'], ['hereda'], [B]], [m, m, m, [[900], [7200]]]], registros: [] };
  const fundida = V.fundirCambio(EPOCA_0_BTML, cambio);
  assert.deepEqual(V.erroresDelSuelo(EPOCA_0_BTML, fundida.version), []);
  return { cambio, fundida: fundida.version };
}

/** Lo que rige en una época: lo que se compara entre el libro grande y el pequeño. */
const loQueRige = (e) => ({ id: e.id, reglas: e.reglasConId.map((x) => x.id), plantillas: e.transacciones.map((x) => x.id), registro: JSON.stringify(e.registro) });

test('el libro pequeño nace con las reglas del grande: con la 0 sin cambios no escribe registros de época y su época es la 0', async () => {
  await conAlmacen(async () => {
    const g = await miLibro();
    await Q.guardarCuenta(g);
    assert.equal(g.eje.epoca(), EPOCA_0_BTML);
    const r = await L.abrirLibroPrivado({ grande: { eje: g.eje, cuenta: g.cuenta, privada: g.privada }, X: g.sala.id, nombre: 'Sala privada', t: T(5) });
    assert.equal(r.falta, undefined, JSON.stringify(r.motivos));
    const p = r.pequeno.eje;
    assert.equal(p.registrosDeLaEpoca.length, 0, 'ningún registro de época');
    assert.equal(p.obtener(p.genesisId).contexto.epocaEscrita, undefined);
    assert.equal(p.obtener(p.genesisId).contexto.epoca, EPOCA_0_BTML.id);
    assert.equal(p.epoca().id, g.eje.epoca().id, 'el id de la 0');
    assert.equal(p.epoca(), EPOCA_0_BTML);
  });
});

test('el libro pequeño nace con las reglas del grande: un grande con una época con cambios da un pequeño con el mismo id de época y las mismas reglas, y solo escribe los cambios', async () => {
  await conAlmacen(async () => {
    const { cambio, fundida } = cambioDePrueba();
    const escrita = epocaEscritaDe(fundida);
    const c = await Q.crearCuenta({ nombre: 'Ana', t: T1, epoca: escrita });
    assert.equal(c.eje.epoca().id, EPOCA_0_BTML.id, 'el grande nace con la 0 y un cambio');
    assert.equal(c.eje.registrosDeLaEpoca.length, 1, 'el grande escribe su cambio');
    const tx = await acciones.transaccion(c.eje, 'anchor here', { X: c.cuenta.alta, title: 'sala' }, c.cuenta.identidad, { t: T1, firmar: Q.firmarCon(c.privada) });
    assert.equal(tx.ok, true, JSON.stringify(tx.motivos));
    const sala = await c.eje.anadir(tx.evento);
    await Q.guardarCuenta(c);
    assert.deepEqual(loQueRige(c.eje.epoca()).registro.includes('900'), true, 'rige el cambio en el grande');
    const previa = await L.previaDelLibroPrivado(c.eje, sala.id, c.cuenta.identidad, ES);
    const r = await L.abrirLibroPrivado({ grande: { eje: c.eje, cuenta: c.cuenta, privada: c.privada }, X: sala.id, nombre: 'Sala privada', t: T(5) });
    assert.equal(r.falta, undefined, JSON.stringify(r.motivos));
    const p = r.pequeno.eje;
    assert.equal(p.epoca().id, c.eje.epoca().id, 'el mismo id de época');
    assert.deepEqual(loQueRige(p.epoca()), loQueRige(c.eje.epoca()), 'las mismas reglas');
    assert.deepEqual(epocaEscritaDe(p.epoca()), epocaEscritaDe(c.eje.epoca()), 'y quien nazca de él, lo mismo');
    assert.equal(p.registrosDeLaEpoca.length, 1, 'solo el cambio: la 0 no se escribe');
    assert.equal(p.obtener(p.registrosDeLaEpoca[0]).contexto.raizDelCambio, true);
    assert.equal(p.obtener(p.genesisId).contexto.epoca, EPOCA_0_BTML.id);
    assert.equal(p.versiones().length, 1);
    // El enlace sigue siendo el de siempre.
    assert.deepEqual(contrato.cuelgaDe(p), { libro: c.eje.genesisId, elemento: sala.id, id: r.cuelga.id, t: T(5) });
    // Lo que cuesta: la previa mide sobre un libro de prueba y lo pagado de verdad es lo que dijo la previa.
    const pagado = r.cuelga.movimientos.filter((m) => m.token === 'T' && m.a === null).map((m) => ({ escala: m.escala, cantidad: m.cantidad }));
    assert.deepEqual(pagado, previa.cuelga.denominacion, 'lo que se enseña antes es lo que se paga');
    assert.equal((await Q.abrirCuenta(r.pequeno.cuenta.alta)).eje.epoca().id, c.eje.epoca().id, 'y al reabrirlo desde lo guardado, la misma época');
  });
});

test('el libro pequeño con guardián (camino B): escribir la época con cambios añade una firma por registro de época, y cada una pide diálogo', async () => {
  await conAlmacen(async () => {
    const firmas = async (epoca) => {
      const g = guardianDePrueba({ claves: [{ nivel: 1, clave: K1 }] });
      const grande = await Q.crearCuenta({ nombre: 'Ana', t: T1, guardian: g, ...(epoca ? { epoca } : {}) });
      const firmar = autoridad.firmanteDeEventos(firmanteDeCuenta(g, grande.publica, { eje: () => grande.eje }), { publica: grande.publica });
      const tx = await acciones.transaccion(grande.eje, 'anchor here', { X: grande.cuenta.alta, title: 'sala' }, grande.cuenta.identidad, { t: T1, firmar });
      const sala = await grande.eje.anadir(tx.evento);
      await Q.guardarCuenta(grande);
      const antes = g.llamadas.firmar.length;
      const r = await L.abrirLibroPrivado({ grande: { eje: grande.eje, cuenta: grande.cuenta }, X: sala.id, nombre: 'Sala privada', guardian: g, t: T(5) });
      assert.equal(r.falta, undefined, JSON.stringify(r.motivos));
      const delPequeno = g.llamadas.firmar.slice(antes);
      // Todas pasan por el diálogo. (El `libro` de la firma de un registro de época anclado en el génesis que aún se abre llega
      // null al guardián: libroDeLaFirma solo conoce el génesis mismo y el eje ya creado; va al informe, no se toca aquí.)
      assert.ok(delPequeno.every((f) => f.segundoFactor === true));
      return { n: delPequeno.length, registros: r.pequeno.eje.registrosDeLaEpoca.length };
    };
    const sin = await firmas(null);
    const con = await firmas(epocaEscritaDe(cambioDePrueba().fundida));
    assert.deepEqual([sin.registros, con.registros], [0, 1]);
    assert.equal(con.n - sin.n, 1, 'una firma más por cada registro de época que se escribe');
    assert.deepEqual([sin.n, con.n], [2, 3], 'génesis y «this book hangs from»; con un cambio, además la raíz del cambio');
  });
});

// ---------- 13. retirar un enlace ----------

test('retirar un enlace: «withdraw a link» se ofrece solo a su autor, en el aro del enlace y en español; retirado, la carta deja de dar ese libro por enlazado', async () => {
  const { grande, pequeno, sala, lanzar, entradaGrande, entradaPequeno } = await grandeYPequeno();
  const enlace = grande.sobre(sala.id).find((h) => String(Array.isArray(h.payload?.[0]) ? h.payload[0][0] : h.payload?.[0]).startsWith('open a private book here'));
  assert.ok(enlace, 'el anuncio está en el grande');
  // En el aro del enlace (PV 4, donde ancla), con su nombre en español; solo a su autor.
  const delAro = (eje, id, yo) => arbol({ foco: { X: id, pv: 0 }, aro: { X: id, pv: 4 } }, eje, yo, ORDENADOR, ES).then((a) => html(a));
  const propio = await delAro(grande, enlace.id, 'ana');
  assert.match(propio, /retirar un enlace/);
  assert.deepEqual(acciones.acciones(grande, enlace.id, 4, 'ana', ES).filter((a) => a.nombre === 'withdraw a link').map((a) => a.etiqueta), ['retirar un enlace']);
  assert.deepEqual(acciones.acciones(grande, enlace.id, 4, 'bea', ES).filter((a) => a.nombre === 'withdraw a link'), [], 'a otra persona no se le ofrece');
  assert.doesNotMatch(await delAro(grande, enlace.id, 'bea'), /retirar un enlace/);
  // El otro lado: «this book hangs from», en el 4 de su registro, también es de su autor.
  const cuelga = pequeno.sobre(pequeno.genesisId).find((h) => String(Array.isArray(h.payload?.[0]) ? h.payload[0][0] : h.payload?.[0]).startsWith('this book hangs from'));
  assert.deepEqual(acciones.acciones(pequeno, cuelga.id, 4, 'ana', ES).filter((a) => a.nombre === 'withdraw a link').map((a) => a.etiqueta), ['retirar un enlace']);
  // Antes: enlazado y con «Entrar».
  assert.equal(contrato.librosPrivados(grande, sala.id).length, 1);
  const antes = await reverso(grande, sala.id, 'ana', { propios: [entradaGrande, entradaPequeno] });
  assert.match(antes, /data-libro-entrar/);
  assert.match(antes, /custodia-privado/);
  // Retirado: el contrato lo deja fuera y la carta no lo da por enlazado (ni ajena ni propia).
  const w = await lanzar(grande, 'withdraw a link', enlace.id, {}, 'ana', T(200));
  assert.ok(w.id);
  assert.deepEqual(contrato.librosPrivados(grande, sala.id), []);
  assert.doesNotMatch(await reverso(grande, sala.id, 'bea', { propios: [] }), /custodia-privado|un libro privado/);
  const despues = await reverso(grande, sala.id, 'ana', { propios: [entradaGrande, entradaPequeno] });
  assert.doesNotMatch(despues, /un libro privado \(/, 'ya no consta en el grande');
  assert.deepEqual(acciones.acciones(grande, enlace.id, 4, 'ana', ES).filter((a) => a.nombre === 'withdraw a link'), [], 'y no se retira dos veces');
  assert.match(despues, /data-sin-anunciar/, 'mi libro sigue siendo mío, pero se dice sin anunciar (no enlazado)');
  assert.doesNotMatch(despues, /data-no-reciproco/);
});
