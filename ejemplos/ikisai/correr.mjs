// Consola: imprime la décupla de la compra en Pointed, las hileras en
// Sequenced y los saldos. `node ejemplos/ikisai/correr.mjs`.

import { ejemploCompra, ejemploCuenta } from './compra-food.mjs';
import { decupla, render } from '../../src/pointed.js';
import { secuencia, render as renderSecuencia } from '../../src/sequenced.js';
import { leerPosicion } from '../../src/contexto-eje.js';
import { ejemploLente, valoresParaLaCasa } from './lente-booking.mjs';
import { detalleValor } from '../../src/lente.js';
import { leidos } from './leer.mjs';

const { eje, compra } = await ejemploCompra();
const cuenta = await ejemploCuenta(eje, compra);
console.log(render(decupla(compra)));
// La cuenta: su 1 es una magnitud desplegada (1.1 la cantidad, una fórmula del BQL mínimo; 1.2 la unidad).
const leer = (camino) => leerPosicion(eje, cuenta.id, camino).texto;
console.log('\ncuenta · 1:', leer([1, 1]), leer([1, 2]), '· 2:', leer([2]), '· 3:', leer([3]));
console.log('\n' + renderSecuencia(secuencia(eje, compra.id)));
console.log('\n' + renderSecuencia(secuencia(eje, eje.genesisId, { sentido: 'hijos' })));
console.log('saldos · cocina EUR:', eje.saldo('cocina', 'E:casa/EUR'), '· huesped EUR:', eje.saldo('huesped', 'E:casa/EUR'), '· huesped T:', eje.tiempos('huesped').map((x) => x.cantidad + ' ' + x.escala).join(', '));
console.log('series · ' + eje.series().map((s) => s.clave + ' ' + s.emitido + ' de ' + s.emisor).join(' · '));

// La lente de R (R6): la casa de Booking valora la R de su huésped solo con la lente que ha firmado.
const lente = await ejemploLente();
console.log('\nlente de R · valor para la casa:', JSON.stringify(valoresParaLaCasa(lente.eje)));
console.log('lente de R · detalle de la huésped:', JSON.stringify(detalleValor(lente.eje, 'casa', 'huesped').porEmisor));

// Leídos (src/lectura.js): la compra, el menú y la reserva, una línea por posición (lo mismo que `node ejemplos/ikisai/leer.mjs`).
console.log('\nleídos\n\n' + (await leidos()));
