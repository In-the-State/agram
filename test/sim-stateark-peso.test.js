// Copia de test/peso.test.js de stateark-sim (Core StateArk, commit 108f888: el peso del plan, S37), con las rutas adaptadas a este repo (servidor/sim/stateark/).
// S37: el peso estimado del carril contra una transacción REAL serializada (con `tx.js`): entradas P2TR con testigo de
// 64 bytes, salidas P2TR y un puntero OP_RETURN de 70 bytes. Antes, la sim estimaba 256 vB donde la real son 293.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulacion, firmaSimulada, mensajeAutorizacion } from '../servidor/sim/stateark/index.js';
import { pesoVirtual } from '../servidor/sim/stateark/pagos.js';
import { serializar } from '../servidor/sim/stateark/tx.js';
import { huella } from '../servidor/sim/stateark/canon.js';
import { sha256Texto } from '../servidor/sim/stateark/hash.js';
import { NUMS } from '../servidor/sim/stateark/miniscript.js';

const INICIO = '2026-11-12T00:00:00.000Z';
const RAIZ = '9fc59d5459419e447bd4a9f6fe44490569e7a0ff78fca3f03fee2e84d7c57c9b'.slice(0, 64);

/** vsize de BIP-141 de una transacción serializada con testigo: ⌈(3 × base + total) / 4⌉. */
async function vsizeReal(tx) {
  const { cruda } = await serializar(tx);
  assert.match(cruda.slice(8, 12), /^0001$/, 'lleva testigo (marcador y bandera)');
  const total = cruda.length / 2;
  // Sin testigo: quita marcador y bandera (2 B) y el testigo de cada entrada (1 + 1 + 64 B) y deja el locktime.
  const base = total - 2 - tx.entradas.length * 66;
  return Math.ceil((3 * base + total) / 4);
}

const p2tr = (sat) => ({ sat, candado: { politica: { interna: NUMS, raiz: RAIZ } } });

async function transaccion(nEntradas, { puntero }) {
  const entradas = [];
  for (let i = 0; i < nEntradas; i++) entradas.push({ txid: await sha256Texto(`previa ${i}`), vout: i, firma: 'ab'.repeat(64) });
  const salidas = [p2tr(61_000), p2tr(10_000)];
  if (puntero) salidas.push({ sat: 0, op_return: `agram:${await sha256Texto('evento')}` });
  return { entradas, salidas };
}

test('el caso de S37: dos entradas, destino, vuelta y puntero de 70 bytes pesan 293 vB, y la fórmula lo da', async () => {
  const tx = await transaccion(2, { puntero: true });
  assert.equal(new TextEncoder().encode(tx.salidas[2].op_return).length, 70);
  assert.equal(await vsizeReal(tx), 293);
  assert.equal(pesoVirtual(2, 2, { puntero: true }), 293);
  assert.ok(pesoVirtual(2, 2, { puntero: true }) > 256, 'ya no se queda en los 256 de antes');
});

test('la fórmula nunca se queda corta frente a la transacción real, con 1, 2, 3 y 5 entradas, con y sin puntero', async () => {
  for (const puntero of [false, true]) {
    for (const n of [1, 2, 3, 5]) {
      const real = await vsizeReal(await transaccion(n, { puntero }));
      const estimado = pesoVirtual(n, 2, { puntero });
      assert.ok(estimado >= real, `${n} entradas, puntero ${puntero}: estimado ${estimado} < real ${real}`);
      assert.ok(estimado - real <= 1, `${n} entradas, puntero ${puntero}: sobra ${estimado - real} vB`);
    }
  }
});

test('un plan del carril con dos entradas y puntero estima 293 vB, y su comisión es tasa × 293', async () => {
  const sim = await Simulacion.crear({ inicio: INICIO, reloj: () => Date.parse(INICIO) });
  const c = sim.carril;
  const vg = await sha256Texto('clave vg');
  await c.crearCartera('vg', { titular: vg });
  await c.crearCartera('aina', { titular: await sha256Texto('clave aina') });
  await c.acunar(await c.direccion('vg'), 40_000);
  await c.acunar(await c.direccion('vg'), 30_000);
  await sim.minar();
  const id = await sha256Texto('el evento de AGRAM');
  const ins = {
    schema: 'stateark.payment-instruction@2', rail: 'bitcoin.onchain', amount: { valor: 50_000, unidad: 'sat' },
    destino: { clase: 'bitcoin/address', valor: await c.direccion('aina') },
    vencimiento: { marca: 'valido_hasta', valor: 50, fuente: 'consenso', unidad: 'bitcoin_block_height' },
    on_timeout: 'caducado', correlation_id: 'S37', puntero: id,
  };
  const plan = await c.preparar('vg', ins);
  assert.equal(plan.entradas.length, 2);
  assert.equal(plan.cambio_sat > 0, true);
  assert.equal(plan.peso_virtual_estimado, 293);
  assert.equal(plan.comision_sat, plan.tasa_sat_vb * 293);
  // Y se ejecuta (la regla de pago de AGRAM sigue cuadrando).
  const aut = await c.autorizar(plan, { titular: vg, firma: await firmaSimulada(vg, await mensajeAutorizacion(await huella(plan))) });
  await c.ejecutar('vg', ins, plan, aut);
  assert.equal((await sim.minar()).pagos, 1);
});
