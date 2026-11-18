// Medida del coste de X.4.9 y X.9.8 (con el tutorial dentro) en los ejemplos y en un libro más grande (la compra con N
// compras más, cada una con su anuncio). Solo lee; no es de la suite. Se corre con: node test/medida-camino.mjs
// (docs/notas/NUCLEO_6_7_8.md, cuarta tanda, punto 2).
import { ejemploCompra } from '../ejemplos/ikisai/compra-food.mjs';
import { ejemploReserva } from '../ejemplos/ikisai/reserva-booking.mjs';
import { ejemploTarea } from '../ejemplos/ikisai/tarea-tasks.mjs';
import { MemoriaDeLectura, Presupuesto } from '../src/bqlm.js';
import { loQueFalta, pasosDeLasReglas } from '../src/motor.js';
import { pagaElCoste } from './ayudas-coste.js';
const AHORA = '2026-11-20T18:00:00Z';
const medir = (eje, X) => {
  const m = (f, o) => { const p = new Presupuesto(1e7, 1e8); const v = f(eje, X, { presupuesto: p, ahora: AHORA, ...o }); return v.estado === 'RESUELTO' ? p.usados : v.estado + '/' + p.usados; };
  const mem = new MemoriaDeLectura();
  return { 'X.4.9': m(loQueFalta, {}), 'X.9.8': m(pasosDeLasReglas, {}), 'X.9.8 memoria 1ª': m(pasosDeLasReglas, { memoria: mem }), 'X.9.8 memoria 2ª': m(pasosDeLasReglas, { memoria: mem }) };
};
const filas = [];
const r = await ejemploReserva({ confirmar: false });
for (const [n, X] of [['reserva', r.reserva.id], ['habitación', r.habitacion.id], ['alta de la casa', r.eje.alta('casa').id], ['génesis', r.eje.genesisId]]) filas.push(['Booking (' + r.eje.orden.length + ' registros), ' + n, medir(r.eje, X)]);
const t = await ejemploTarea({ hasta: 'entregada' });
filas.push(['Tasks (' + t.eje.orden.length + '), tarea', medir(t.eje, t.tarea.id)]);
for (const N of [10, 30, 60]) {
  const c = await ejemploCompra();
  const eje = c.eje;
  for (let k = 0; k < N; k++) {
    const t0 = new Date(Date.parse('2026-11-07T15:00:00Z') + k * 60000).toISOString().replace('.000Z', 'Z');
    const compra = await eje.escribir({ autor: 'huesped', sobre: c.menu.id, t: t0, payload: ['Compra ' + k, ['x'], ['all announced movements happened']], movimientos: [pagaElCoste('huesped')] });
    await eje.escribir({ autor: 'huesped', sobre: compra.id, en: '4100000000', t: t0, payload: 'pagar', movimientos: [pagaElCoste('huesped'), { token: 'E', emisor: 'casa', denominacion: 'EUR', cantidad: 1, de: 'huesped', a: 'cocina', estado: 'anunciado' }] });
  }
  for (const [n, X] of [['menú', c.menu.id], ['alta de la huésped', eje.alta('huesped').id], ['génesis', eje.genesisId], ['última compra', eje.sobre(c.menu.id).at(-1).id]]) filas.push(['Compra ×' + N + ' (' + eje.orden.length + ' registros), ' + n, medir(eje, X)]);
}
for (const [n, v] of filas) console.log(n, '|', Object.values(v).join(' | '));
