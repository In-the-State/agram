// Entrar en un libro al que me han invitado (agram-equipo/DISENO_CARTA_VARIOS_LIBROS.md §4.9, el lado de quien entra):
// la lectura de invitaciones del núcleo (src/invitaciones.js, CONTRATO §12.10), lo puro de la carta (carta/invitado.js:
// validar los datos, el archivo, bajar el libro, la vista) y su HTML. De extremo a extremo contra el servidor de prueba:
// la dueña invita a mi clave, yo bajo el libro, acepto, subo y el servidor lo tiene. Todo inventado, claves de prueba.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { arrancar } from '../servidor/prueba/servidor.mjs';
import { sincronia, autoridad } from '../src/index.js';
import * as contrato from '../src/contrato.js';
import { invitacionesParaClave, altaConClave, invitacionesA, invitacionPendiente } from '../src/invitaciones.js';
import * as Q from '../carta/cuentas.js';
import { datosDeInvitacion, leerArchivoDeInvitacion, bajarLibro, vistaDeInvitacion, destinoGuardado } from '../carta/invitado.js';
import { htmlInvitado } from '../carta/dom.js';

let servidor;
before(async () => { servidor = await arrancar({ puerto: 0, secreto: 'prueba' }); });
after(async () => { await servidor.cerrar(); delete globalThis.localStorage; });

const almacen = new Map();
globalThis.localStorage = { getItem: (k) => almacen.get(k) ?? null, setItem: (k, v) => almacen.set(k, String(v)), removeItem: (k) => almacen.delete(k) };

async function crearEje(nombre) {
  const r = await fetch(servidor.url + '/ejes', { method: 'POST', headers: { 'X-Crear-Ejes': 'prueba', 'Content-Type': 'application/json' }, body: JSON.stringify({ eje: nombre }) });
  assert.equal(r.status, 201);
  return (await r.json()).claveLectura;
}

/** La dueña con su libro en el servidor y una invitación a la clave `publica` (con nombre «invitada»). */
async function libroConInvitacion(nombre, publica) {
  const duena = await Q.crearCuenta({ nombre: 'Dueña inventada' });
  const claveLectura = await crearEje(nombre);
  const t = new Date(Date.now() + 2000).toISOString();
  const inv = await duena.eje.invitar({ autor: duena.cuenta.identidad, invitado: 'invitada', clave: publica, t, privada: duena.privada });
  const S = new sincronia.Sincronia({ url: servidor.url, eje: nombre, claveLectura });
  const informe = await S.sincronizar(duena.eje);
  assert.equal(informe.errores.length, 0, JSON.stringify(informe.errores));
  return { duena, inv, claveLectura };
}

test('las invitaciones pendientes para una clave: solo las hechas a ella, sin aceptar y sin caducar; el contrato las expone; el volcado las importa', async () => {
  const yo = autoridad.generarClaves ? await autoridad.generarClaves() : null;
  const publica = autoridad.publicaDe(yo.privada ?? yo);
  const duena = await Q.crearCuenta({ nombre: 'Dueña' });
  const t = new Date(Date.now() + 2000).toISOString();
  const a = await duena.eje.invitar({ autor: duena.cuenta.identidad, invitado: 'para-mi', clave: publica, t, privada: duena.privada });
  await duena.eje.invitar({ autor: duena.cuenta.identidad, invitado: 'para-otra', clave: 'ab'.repeat(32), t, privada: duena.privada });
  await duena.eje.invitar({ autor: duena.cuenta.identidad, invitado: 'caducada', clave: publica, hasta: '2020-01-01T00:00:00Z', t, privada: duena.privada });
  const p = invitacionesParaClave(duena.eje, publica);
  assert.deepEqual(p.map((x) => [x.id, x.autor, x.invitado]), [[a.id, duena.cuenta.identidad, 'para-mi']]);
  assert.ok(p[0].da.length > 0, 'lo que me da, como textos');
  assert.deepEqual(contrato.invitacionesParaClave(duena.eje, publica.toUpperCase()).map((x) => x.id), [a.id], 'la clave, sin mirar mayúsculas');
  assert.deepEqual(invitacionesParaClave(duena.eje, 'no es una clave'), []);
  assert.equal(altaConClave(duena.eje, publica), null);
  assert.deepEqual(altaConClave(duena.eje, duena.cuenta.publica), { identidad: duena.cuenta.identidad, alta: duena.cuenta.alta });
  // Aceptada, deja de estar pendiente; y ya hay un alta con mi clave.
  const alta = await duena.eje.aceptar(a.id, { publica, privada: yo.privada ?? yo }, { t: new Date(Date.now() + 5000).toISOString() });
  assert.deepEqual(invitacionesParaClave(duena.eje, publica), []);
  assert.deepEqual(altaConClave(duena.eje, publica), { identidad: 'para-mi', alta: alta.id });
  assert.deepEqual(invitacionesA(duena.eje, 'para-mi'), [], 'con alta, ya no hay invitaciones a ese nombre');
  assert.equal(typeof invitacionPendiente, 'function');
  const volcado = await import('../ejemplos/volcado/volcar.mjs');
  assert.ok(!('invitacionPendiente' in volcado), 'el volcado la importa, no la define ni la exporta');
});

test('los datos de la invitación: validación estricta; el archivo con exactamente tres claves; la clave nunca va en un motivo', () => {
  const clave = 'Abc_def-0123456789abcdefghijKLMNOPQRSTUVWX';
  assert.deepEqual(datosDeInvitacion({ url: 'https://aarpia.invalid/ensayo/', eje: 'ensayo-aarpia', claveLectura: clave }).datos, { url: 'https://aarpia.invalid/ensayo', eje: 'ensayo-aarpia', claveLectura: clave });
  assert.ok(datosDeInvitacion({ url: 'http://localhost:18741', eje: 'x', claveLectura: clave }).datos, 'localhost, para pruebas');
  assert.ok(datosDeInvitacion({ url: 'http://127.0.0.1:18741', eje: 'x', claveLectura: clave }).datos);
  for (const url of ['http://ejemplo.invalid', 'javascript:alert(1)', 'https://u:p@ejemplo.invalid', 'https://ejemplo.invalid/?a=1', 'https://ejemplo.invalid/#x', 'ftp://ejemplo.invalid', '', 'https://' + 'a'.repeat(400) + '.invalid']) {
    const r = datosDeInvitacion({ url, eje: 'x', claveLectura: clave });
    assert.ok(r.motivo && !r.datos, url);
  }
  for (const eje of ['Mayusculas', '-guion', 'con espacio', 'a/b', '']) assert.ok(datosDeInvitacion({ url: 'https://e.invalid', eje, claveLectura: clave }).motivo, eje);
  for (const c of ['corta', 'con espacios dentro de la clave', clave + '!', 'x'.repeat(200)]) {
    const r = datosDeInvitacion({ url: 'https://e.invalid', eje: 'x', claveLectura: c });
    assert.ok(r.motivo && !r.motivo.includes(c), 'la clave no va en el motivo');
  }
  const bien = JSON.stringify({ url: 'https://e.invalid', eje: 'ensayo', claveLectura: clave });
  assert.ok(leerArchivoDeInvitacion(bien).datos);
  for (const malo of ['no es json', '[]', '{}', JSON.stringify({ url: 'https://e.invalid', eje: 'ensayo' }), JSON.stringify({ url: 'https://e.invalid', eje: 'ensayo', claveLectura: clave, mas: 1 }), JSON.stringify({ url: 'https://e.invalid', eje: 'ensayo', claveLectura: 5 }), 'x'.repeat(5000)]) {
    const r = leerArchivoDeInvitacion(malo);
    assert.ok(r.motivo && !r.datos && !r.motivo.includes(clave), malo.slice(0, 40));
  }
  assert.deepEqual(destinoGuardado({ url: 'https://e.invalid/', eje: 'ensayo', cola: [] }), { url: 'https://e.invalid', eje: 'ensayo' });
  assert.equal(destinoGuardado({ url: 'javascript:x', eje: 'ensayo' }), null);
  assert.equal(destinoGuardado(null), null);
});

test('de extremo a extremo: bajo el libro, veo la invitación a mi clave, acepto, subo y el servidor la tiene; otra clave no ve nada', async () => {
  const yo = await Q.crearCuenta({ nombre: 'Yo inventada' });
  const { duena, inv, claveLectura } = await libroConInvitacion('libro-invitado', yo.cuenta.publica);
  const datos = { url: servidor.url, eje: 'libro-invitado', claveLectura };
  const b = await bajarLibro(datos);
  assert.ok(b.eje, b.motivo);
  assert.equal(b.eje.genesisId, duena.eje.genesisId);
  const vista = vistaDeInvitacion(b.eje, yo.cuenta.publica);
  assert.equal(vista.libro.genesis, duena.eje.genesisId.slice(0, 12));
  assert.equal(vista.miAlta, null);
  assert.equal(vista.invitaciones.length, 1);
  const i = vista.invitaciones[0];
  assert.deepEqual([i.id, i.autor, i.invitado], [inv.id, duena.cuenta.identidad, 'invitada']);
  assert.ok(i.coste && i.coste.cantidad > 0 && i.coste.escala === 'minuto', 'lo que cuesta aceptar');
  // Aceptar: mi alta firmada con mi clave, y subirla con la sincronía del libro bajado.
  const alta = await b.eje.aceptar(i.id, { publica: yo.cuenta.publica, privada: yo.privada }, { t: new Date(Date.now() + 5000).toISOString() });
  const informe = await b.sincronia.sincronizar(b.eje);
  assert.ok(informe.subidos.includes(alta.id), JSON.stringify({ errores: informe.errores, rechazados: informe.rechazados }));
  // Otro dispositivo baja el libro: mi alta está, con mi clave; la vista ofrece solo «Añadirlo a tus libros».
  const otra = await bajarLibro(datos);
  assert.deepEqual(vistaDeInvitacion(otra.eje, yo.cuenta.publica).miAlta, { identidad: 'invitada', alta: alta.id });
  // Una clave sin invitación no ve ninguna.
  const nadie = await Q.crearCuenta({ nombre: 'Nadie' });
  assert.deepEqual(vistaDeInvitacion(otra.eje, nadie.cuenta.publica).invitaciones, []);
  // Con la clave de lectura mal, no baja, y el motivo no la lleva.
  const mal = await bajarLibro({ ...datos, claveLectura: 'Z'.repeat(43) });
  assert.ok(mal.motivo && !mal.motivo.includes('Z'.repeat(43)));
  // Guardado como otro libro de la cuenta, se vuelve a abrir (su alta no es el génesis).
  const cuenta = { nombre: 'Libro invitado', identidad: 'invitada', alta: alta.id, publica: yo.cuenta.publica };
  assert.ok(await Q.guardarCuenta({ cuenta, eje: b.eje, privada: yo.privada, claveLectura }, { recordar: false }));
  const abierta = await Q.abrirCuenta(alta.id);
  assert.ok(abierta.eje, abierta.motivo);
  assert.notEqual(abierta.eje.genesisId, alta.id);
});

test('el diálogo: los datos con la clave de tipo contraseña y vacía; lo del libro como texto; sin invitación, mi clave para copiar', () => {
  const datos = htmlInvitado({ paso: 'datos', url: 'https://e.invalid', eje: 'ensayo' });
  assert.match(datos, /<input id="invitado-clave" name="claveLectura" type="password"[^>]* value="">/);
  assert.ok(datos.includes('data-invitado-archivo') && datos.includes('data-invitado-form'));
  const hostil = htmlInvitado({ paso: 'vista', vista: { libro: { nombre: '<img src=x onerror=alert(1)>', genesis: 'abc' }, miAlta: null, invitaciones: [{ id: 'f'.repeat(64), autor: 'dueña', quienInvita: '<b>Dueña</b>', invitado: '<i>yo</i>', da: ['1 R:<x>'], coste: { cantidad: 1, escala: 'minuto' }, tema: null }] } });
  assert.ok(!hostil.includes('<img') && !hostil.includes('<b>Dueña') && !hostil.includes('<i>yo'), 'nada del libro como HTML');
  assert.ok(hostil.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.ok(hostil.includes(`data-invitado-aceptar="${'f'.repeat(64)}"`) && hostil.includes('Ahora no'));
  assert.ok(hostil.includes('1 minuto de tu tiempo de hoy'));
  const ninguna = htmlInvitado({ paso: 'vista', publica: 'ab'.repeat(32), vista: { libro: { nombre: 'L', genesis: 'abc' }, miAlta: null, invitaciones: [] } });
  assert.ok(ninguna.includes('ninguna invitación para tu clave') && ninguna.includes('ab'.repeat(32)) && ninguna.includes('data-copiar') && !ninguna.includes('data-invitado-aceptar'));
  const dentro = htmlInvitado({ paso: 'vista', vista: { libro: { nombre: 'L', genesis: 'abc' }, miAlta: { identidad: 'yo', alta: 'a'.repeat(64) }, invitaciones: [] } });
  assert.ok(dentro.includes('data-invitado-anadir') && !dentro.includes('data-invitado-aceptar'));
  assert.ok(htmlInvitado({ paso: 'vista', pendiente: 'f'.repeat(64), vista: { libro: { nombre: 'L', genesis: 'abc' }, miAlta: null, invitaciones: [{ id: 'f'.repeat(64), autor: 'd', invitado: 'y', da: [], coste: null }] } }).includes('data-invitado-reintentar'), 'si la subida falló, reintentar');
});
