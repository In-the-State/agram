// Medida para la nota docs/notas/NUCLEO_6_7_8.md (diseño, 18-11). Solo lee: no es una prueba de la suite (no acaba en
// .test.js) ni cambia nada. Se corre con: node test/medida-nucleo-678.mjs
//
//   6. Lo que el motor deduce que falta (motor.siguiente, acciones.camino) frente a lo que ya se lee en BQL desde la
//      posición X.4.8 (la lectura «stage») sobre la reserva del ejemplo de Booking.
//   7. Los tipos de parámetro que usan las acciones de todas las épocas, y cuántas veces se repite a mano la misma
//      validación (un id de 64 hexadecimales).
//   8. Lo que dice hoy el evaluador cuando una condición da falso: nada más que «false».

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { ejemploReserva } from '../ejemplos/ikisai/reserva-booking.mjs';
import { siguiente } from '../src/motor.js';
import { camino, acciones, plantillasDeTransaccion } from '../src/acciones.js';
import { ContextoEje } from '../src/contexto-eje.js';
import { evaluar } from '../src/bqlm.js';
import { epocaDelEje } from '../src/epocas.js';

const r = await ejemploReserva({ confirmar: false });
const { eje, reserva } = r;
const epoch = epocaDelEje(eje);
const corto = (x) => (typeof x === 'string' && /^[0-9a-f]{64}$/.test(x) ? x.slice(0, 8) : x);

console.log('== 6. lo que falta en la reserva', reserva.id.slice(0, 8));
for (const yo of ['huesped', 'casa', 'recepcion']) {
  const s = siguiente(eje, reserva.id, yo);
  console.log(' motor.siguiente', yo, JSON.stringify({ cerrado: s.cerrado, faltaDeMi: s.faltaDeMi.map((f) => ({ que: f.que.slice(0, 60), plantilla: f.plantilla, anuncio: corto(f.anuncio) })), espera: s.espera.map((e) => ({ de: e.de, anuncio: corto(e.anuncio) })) }));
  const c = await camino(eje, reserva.id, yo);
  console.log(' acciones.camino ', yo, JSON.stringify(c.pasos.map((p) => ({ fuente: p.fuente, regla: p.regla ?? null, hacer: p.hacer?.plantilla ?? null, espera: p.espera, hecho: p.hecho }))));
  const ctx = new ContextoEje(eje, { epoch, me: yo });
  const exprs = {
    'X.4.8 (todo lo pendiente)': 'count it.4.8',
    'lo pendiente que debo yo': 'count (it.4.8 where count (moves it2 where "anunciado" in it3.2 and it3.3.0 = me) > 0)',
    'lo pendiente que deben otros': 'count (it.4.8 where count (moves it2 where "anunciado" in it3.2 and it3.3.0 != me) > 0)',
    'mis movimientos pendientes, por familia': '((moves (it.4.8 where count (moves it2 where "anunciado" in it3.2 and it3.3.0 = me) > 0)) where "anunciado" in it2.2 and it2.3.0 = me) each 0.0.0',
    'la acción de la estación E (epoch.4.2.0.2), escrita a mano por familia': 'first epoch.4.2.0.2',
    'la tabla de estaciones como lista (no lo es: una décupla)': 'count epoch.4.2',
  };
  for (const [nombre, e] of Object.entries(exprs)) {
    const v = evaluar(e, ctx, { sujeto: reserva.id });
    console.log('   BQL', nombre, '→', v.estado, v.estado === 'RESUELTO' ? v.texto : v.motivo);
  }
}

console.log('\n== 7. tipos de parámetro de las acciones (época 0 y las hijas de datos/epocas)');
const dirs = ['datos/epocas/plantillas/', ...['cuenta', 'guia-libro', 'roadmap', 'state'].map((d) => 'datos/epocas/' + d + '/plantillas/')].filter((d) => existsSync(d));
const tipos = new Map();
const validaciones = new Map();
let parametros = 0;
for (const d of dirs) {
  for (const f of readdirSync(d).filter((x) => x.endsWith('.json'))) {
    const p = JSON.parse(readFileSync(d + f, 'utf8'));
    for (const q of (Array.isArray(p[1]) ? p[1] : []).filter((x) => Array.isArray(x) && Array.isArray(x[0]))) {
      parametros++;
      const t = JSON.stringify(q[1]);
      tipos.set(t, (tipos.get(t) ?? 0) + 1);
      const v = Array.isArray(q[2]) ? q[2][q[2].length - 1] : q[2];
      if (typeof v === 'string' && v.startsWith('=')) validaciones.set(v, [...(validaciones.get(v) ?? []), p[0][0] + '/' + q[0][0]]);
    }
  }
}
console.log(' parámetros:', parametros, 'en', dirs.length, 'carpetas');
for (const [t, n] of [...tipos].sort((a, b) => b[1] - a[1])) console.log(' tipo', t, n);
console.log(' validaciones repetidas (3 o más):');
for (const [v, l] of [...validaciones].filter(([, l]) => l.length >= 3).sort((a, b) => b[1].length - a[1].length)) console.log('  ', l.length, '×', v.length > 90 ? v.slice(0, 90) + '…' : v);

console.log('\n== 8. una condición que da falso: lo que dice hoy el evaluador');
const ctx = new ContextoEje(eje, { epoch, me: 'recepcion' });
const consume = plantillasDeTransaccion().find((p) => p.nombre === 'consume');
const cond = consume.plantilla[2][consume.plantilla[2].length - 1];
const v = evaluar(cond, ctx, { sujeto: reserva.id });
console.log(' «consume» sobre la reserva para recepción:', v.estado, v.texto, '(ni qué parte, ni sobre qué registro)');
const ofrecidas = acciones(eje, reserva.id, 1, 'recepcion').map((a) => a.nombre);
const delPv = plantillasDeTransaccion().filter((p) => p.pv === 1).map((p) => p.nombre);
console.log(' pv1 para recepción: se ofrecen', ofrecidas.length, 'de', delPv.length, '; las otras', delPv.length - ofrecidas.length, 'desaparecen sin motivo');

console.log('\n== 8 bis. el porqué de «consume», a mano: cada parte del where sobre cada serie de me.1');
for (const yo of ['recepcion', 'huesped']) {
  const c = new ContextoEje(eje, { epoch, me: yo });
  const series = evaluar('count me.1', c, { sujeto: reserva.id });
  console.log(' ', yo, 'tiene', series.texto, 'series en me.1');
  const n = series.valor[0];
  for (let k = 0; k < n; k++) {
    const el = '(nth ' + k + ' me.1)';
    const partes = {
      serie: el + '.0',
      'E in it2.0.0.0': 'E in ' + el + '.0.0.0',
      'it2.1 > 0': el + '.1 > 0',
      'first it2.0.5': 'first ' + el + '.0.5',
      'first it2.0.5 = first it.5': 'first ' + el + '.0.5 = first it.5',
    };
    const fila = Object.entries(partes).map(([nombre, e]) => { const v = evaluar(e, c, { sujeto: reserva.id }); return nombre + ' → ' + (v.estado === 'RESUELTO' ? (v.texto.length > 20 ? v.texto.slice(0, 20) + '…' : v.texto) : v.estado); });
    console.log('   ', fila.join(' · '));
  }
}
console.log(' first it.5 (la reserva) →', evaluar('first it.5', ctx, { sujeto: reserva.id }).texto.slice(0, 8));
