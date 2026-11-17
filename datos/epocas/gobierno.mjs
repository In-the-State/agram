// El gobierno del cambio de reglas en la época 0 (encargo A21, tramo 2, paso 1; agram-equipo/DISENO_GOBIERNO_Y_MOTOR.md
// §3 y §4; docs/notas/GOBIERNO.md). De aquí sale la fórmula larga de la regla «a change comes into force with its proof»
// (reglas/a-change-comes-into-force-with-its-proof.json), como sealed.json sale de sello.formulaDeSellado(): una prueba
// (test/gobierno.test.js) comprueba que el archivo lleva exactamente formulaDePonerEnVigor(). Si cambia la forma del sello
// (src/sello.js, POSICIONES_DEL_SELLO) o esta fórmula, se reescribe con
//
//   node datos/epocas/gobierno.mjs --escribir    (y luego npm run epocas)
//
// Las demás reglas, lecturas y plantillas del gobierno son JSON escritos a mano, como todas las de la época.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { formulaDeSelloDelDato } from '../../src/sello.js';
import { formatear } from './generar.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));

/** Los nombres de las seis plantillas del gobierno (lo que dice el 4 de cada registro que escriben). */
export const PLANTILLAS_DE_GOBIERNO = Object.freeze({
  proponer: 'propose a change',
  apoyar: 'support a change',
  retirarApoyo: 'withdraw support',
  aprobar: 'enact a change',
  poner: 'put a change in force',
  retirar: 'withdraw a change',
});

/** El ancla de las propuestas en el génesis del libro: su 9.7, «changes». */
export const ANCLA_DE_PROPUESTAS = '9700000000';

/** Dónde trae «put a change in force» la décupla de sello del «enact a change»: su payload 1.1. */
export const SELLO_EN_EL_PAYLOAD = '(first (payload(ev)).1.1)';

/** La propuesta de la que cuelga el «enact a change» sobre el que se escribe la candidata (el foco de su foco). */
const PROPUESTA = '(first (first (first ev.6.5).6).5)';
/** La clase que declara esa propuesta (su 2). */
const CLASE = 'first (payload(' + PROPUESTA + ')).2';

/**
 * El nivel que pide la clase de la propuesta (epoch.7.9.3 si es «ordinary», epoch.7.9.4 si es «governance»), como una
 * expresión BQL; con otra clase, 0 (la regla exige además que sea una de las dos).
 */
export const NIVEL_PEDIDO = '(count (epoch where ' + CLASE + ' = "governance") * first epoch.7.9.4 + count (epoch where ' + CLASE + ' = "ordinary") * first epoch.7.9.3)';

/**
 * La fórmula del 2 de «a change comes into force with its proof»: un registro que dice «put a change in force» en su 4
 * solo vale anclado en un «enact a change» que aún no está en vigor, de una propuesta de clase «ordinary» o «governance»,
 * y, si el nivel que pide su clase no es 0, con la prueba de sello del «enact a change» en su payload 1.1 que lo cubre
 * (sello.formulaDeSelloDelDato: «sealed» entero, o la cadena de «firm» hasta ese nivel con la clave de la cabecera
 * anotada para su nivel en before.8.9, pares [nivel, clave], y la primera cabecera de este libro).
 */
export function formulaDePonerEnVigor() {
  const P = PLANTILLAS_DE_GOBIERNO;
  const prueba = formulaDeSelloDelDato({ sello: SELLO_EN_EL_PAYLOAD, hoja: 'ev.6.5', nivel: NIVEL_PEDIDO });
  return '=not ("' + P.poner + '" in ev.4) or "' + P.aprobar + '" in (payload(first ev.6.5)).4'
    + ' and count (down (first ev.6.5) where "' + P.poner + '" in (payload(it)).4) = 0'
    + ' and (' + CLASE + ' = "ordinary" or ' + CLASE + ' = "governance")'
    + ' and (' + NIVEL_PEDIDO + ' = 0 or ' + prueba + ')';
}

/** El archivo de la regla. */
export const ARCHIVO_DE_LA_REGLA = join(AQUI, 'reglas', 'a-change-comes-into-force-with-its-proof.json');

// ---------- El apoyo fijado en el punto del compromiso (arreglos de la revisión, H8; Core AGRAM 17-11) ----------
//
// «support a change» lleva en su 1: 1.0 la parte, 1.1 el P total de quien apoya en ese punto (todo su P en el libro, sin
// el situado sobre la propuesta ni sobre lo anclado directamente en ella), 1.2 cuántas veces ha retirado ya su apoyo de
// esa propuesta y 1.3 lo que tiene comprometido con ella: lo de su apoyo vivo anterior (el último suyo con el mismo 1.2)
// más lo que bloquea este entre su total. La regla «a support is true at its point» solo lo acepta si es verdad en ese
// punto, y «support of» lee el 1.3 del último apoyo vivo de cada titular: lo que le llegue después no lo baja.
// El BQL mínimo no deja dividir cada registro por su propio total al sumarlos (no hay un «map»): por eso el 1.3 es
// acumulado y la regla lo comprueba (con una tolerancia de 0.000001: la plantilla redondea lo que bloquea a 1e-9).
// Una lista nunca vacía: la propuesta misma va delante (un «propose a change» no lleva nada en su 1.3, lo exige su regla),
// así que sin apoyo vivo lo comprometido es 0 y nunca queda PENDIENTE.

/** El nombre de la regla nueva que comprueba lo que declara un apoyo, y la de las liberaciones. */
export const REGLA_DEL_APOYO = 'a support is true at its point';
export const REGLA_DE_LIBERAR = 'support is released by withdrawing it';
/** Dónde lleva «support a change» la parte, su total, sus retiradas y lo comprometido: su payload 1.0 a 1.3. */
export const PARTE_EN = '1.0';
export const TOTAL_EN = '1.1';
export const RETIRADAS_EN = '1.2';
export const COMPROMETIDO_EN = '1.3';
/** La tolerancia con que la regla compara lo comprometido. */
export const TOLERANCIA = '0.000001';

/** El elemento de un where a la profundidad d (it a 0, it2 a 1…). */
const el = (d) => (d === 0 ? 'it' : 'it' + (d + 1));

/** Los apoyos vivos de h en X, con la propuesta delante (lo último: su apoyo vivo más reciente, o la propuesta), a la profundidad d. */
function vivosDe(X, h, d) {
  const retiradas = 'count (down ' + X + ' where "' + PLANTILLAS_DE_GOBIERNO.retirarApoyo + '" in (payload(' + el(d + 1) + ')).4 and first ' + el(d + 1) + '.3 = ' + h + ')';
  const e = el(d);
  return 'under ' + X + ' where ' + e + ' = ' + X + ' or "' + PLANTILLAS_DE_GOBIERNO.apoyar + '" in (payload(' + e + ')).4 and first ' + e + '.3 = ' + h + ' and first ' + e + '.6.5 = ' + X + ' and first (payload(' + e + ')).' + RETIRADAS_EN + ' = ' + retiradas;
}

/** Lo comprometido por h con X (el 1.3 de su último apoyo vivo; 0 sin apoyo vivo), a la profundidad d. */
const comprometidoDe = (X, h, d) => 'sum ((payload(last (' + vivosDe(X, h, d) + '))).' + COMPROMETIDO_EN + ')';

/** El P total de h en el libro sin el situado sobre X ni sobre lo anclado directamente en X (A.2.1), a la profundidad d. */
const totalDe = (A, X, d) => 'sum (' + A + '.2.1 each 1) - sum ((' + A + '.2.1 where first ' + el(d) + '.0 = ' + X + ' or ' + X + ' in up (first ' + el(d) + '.0)) each 1)';

/**
 * La fórmula de «support of» (X.2.4.7, en cada compromiso con una propuesta X; it = el compromiso): la presión de su
 * titular entre los nombres de epoch.7.9.5 × lo que tiene comprometido con X (el 1.3 de su último apoyo vivo, con tope 1)
 * × la parte de este compromiso entre todo lo que el titular tiene bloqueado con X (sumado por titular da su presión ×
 * lo comprometido). Solo P y no el situado sobre la propuesta o lo anclado en ella; lo demás da 0.
 */
export function formulaDeApoyoDe() {
  const X = 'first it.5';
  const h = 'first it.3';
  const excluido = (v) => '(first ' + v + '.0.0.1 = ' + X + ' or ' + X + ' in up (first ' + v + '.0.0.1))';
  const cuenta = 'P in it.0.0.0 and not ' + excluido('it');
  const presion = '(first epoch.9.0.0.4) * count (epoch.7.9.5 where it2 = ' + h + ') + sum ((epoch.7.9.5 where it2 != ' + h + ' and it2 != 0 and count it2.6 = 0 and count it2.2 > 0 and first it2.2 = ' + h + ') each 1) + (first epoch.9.0.0.4) * count (epoch where count (epoch.7.9.5 where it3 != 0) = 0 and ' + h + ' = first (first before.5).3)';
  // En una lectura el sujeto es it: el primer where da it2, y uno dentro de «epoch where», it3.
  const tope = comprometidoDe(X, h, 1) + ' - count (epoch where ' + comprometidoDe(X, h, 2) + ' > 1) * (' + comprometidoDe(X, h, 1) + ' - 1)';
  const bloqueado = (d) => 'sum (((first it.5).2.4 where first ' + el(d + 1) + '.3 = ' + h + ' and P in ' + el(d + 1) + '.0.0.0 and not ' + excluido(el(d + 1)) + ') each 1)';
  return '=count (epoch where ' + cuenta + ') * (' + presion + ') * (' + tope + ') * it.1 / (' + bloqueado(0) + ' + count (epoch where ' + bloqueado(1) + ' = 0))';
}

/**
 * La fórmula de «a support is true at its point»: un registro que dice «support a change» en su 4 declara en su 1.1 el P
 * total de quien lo escribe en ese punto (sin el situado sobre la propuesta ni lo anclado directamente en ella), mayor
 * que 0; en su 1.2, cuántas veces ha retirado ya su apoyo de ella; y en su 1.3, lo comprometido de su apoyo vivo
 * anterior más lo que bloquea este (P con la salida en la propuesta, sin ese P situado) entre su total.
 */
export function formulaDelApoyo() {
  const X = 'first ev.6.5';
  const h = 'first ev.3';
  const dato = (en) => 'first (payload(ev)).' + en;
  const bloquea = 'sum ((ev.1 where P in it.0.0.0 and lock in it.4 and ' + X + ' in it.2 and not (first it.0.0.1 = ' + X + ' or ' + X + ' in up (first it.0.0.1))) each 1)';
  const debe = '(' + comprometidoDe(X, h, 0) + ' + ' + bloquea + ' / ' + dato(TOTAL_EN) + ')';
  return '=not ("' + PLANTILLAS_DE_GOBIERNO.apoyar + '" in ev.4) or ' + dato(TOTAL_EN) + ' = ' + totalDe('(' + h + ')', X, 0) + ' and ' + dato(TOTAL_EN) + ' > 0'
    + ' and ' + dato(RETIRADAS_EN) + ' = count (down ' + X + ' where "' + PLANTILLAS_DE_GOBIERNO.retirarApoyo + '" in (payload(it)).4 and first it.3 = ' + h + ')'
    + ' and ' + dato(COMPROMETIDO_EN) + ' - ' + debe + ' <= ' + TOLERANCIA + ' and ' + debe + ' - ' + dato(COMPROMETIDO_EN) + ' <= ' + TOLERANCIA;
}

/**
 * La fórmula de «support is released by withdrawing it»: lo bloqueado con un cambio propuesto (la salida, una propuesta
 * del 9.7 del génesis) solo se libera en un «withdraw support» o un «withdraw a change» anclado en esa propuesta. Así una
 * liberación cuenta siempre como retirada (sube el 1.2 de los apoyos siguientes) y el mismo P no apoya dos propuestas.
 */
export function formulaDeLiberar() {
  const P = PLANTILLAS_DE_GOBIERNO;
  return '=count (ev.1 where release in it.4 and not (("' + P.retirarApoyo + '" in ev.4 or "' + P.retirar + '" in ev.4) and first ev.6.5 in it.2) and count (it.2 where it2 in (down (first before.5) where "' + P.proponer + '" in (payload(it3)).4)) > 0) = 0';
}

/** Los defectos de la plantilla «support a change» (it = la propuesta, me = quien apoya, memo = su payload). */
export const DEFECTOS_DEL_APOYO = Object.freeze({
  total: '=' + totalDe('me', 'it', 1),
  withdrawals: '=count (down it where "' + PLANTILLAS_DE_GOBIERNO.retirarApoyo + '" in (payload(it2)).4 and first it2.3 = me)',
  committed: '=' + comprometidoDe('it', 'me', 1) + ' + sum ((me.1 where P in it2.0.0.0 and it2.1 > 0 and not (first it2.0.0.1 = it or it in up (first it2.0.0.1))) each 1) * first memo.' + PARTE_EN + ' / first memo.' + TOTAL_EN,
});

export const ARCHIVO_DE_APOYO_DE = join(AQUI, 'reglas', 'support-of.json');
export const ARCHIVO_DEL_APOYO = join(AQUI, 'reglas', 'a-support-is-true-at-its-point.json');
export const ARCHIVO_DE_LIBERAR = join(AQUI, 'reglas', 'support-is-released-by-withdrawing-it.json');
export const ARCHIVO_DE_LA_PLANTILLA_DE_APOYO = join(AQUI, 'plantillas', 'support-a-change.json');

// node datos/epocas/gobierno.mjs --escribir: pone las fórmulas en el 2 de las reglas y los defectos en la plantilla de
// apoyo (el resto de cada archivo no cambia).
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href && process.argv.includes('--escribir')) {
  const { renameSync } = await import('node:fs');
  const poner = (archivo, cambiar) => {
    const registro = JSON.parse(readFileSync(archivo, 'utf8'));
    cambiar(registro);
    writeFileSync(archivo + '.nuevo', formatear(registro) + '\n');
    renameSync(archivo + '.nuevo', archivo);
    console.log('escrita la fórmula de ' + archivo);
  };
  poner(ARCHIVO_DE_LA_REGLA, (r) => { r[2] = [formulaDePonerEnVigor()]; });
  poner(ARCHIVO_DE_APOYO_DE, (r) => { r[2] = [formulaDeApoyoDe()]; });
  poner(ARCHIVO_DEL_APOYO, (r) => { r[2] = [formulaDelApoyo()]; });
  poner(ARCHIVO_DE_LIBERAR, (r) => { r[2] = [formulaDeLiberar()]; });
  poner(ARCHIVO_DE_LA_PLANTILLA_DE_APOYO, (p) => {
    for (const q of p[1]) {
      const d = DEFECTOS_DEL_APOYO[q[0][0]];
      if (d) q[9] = [d, q[9][q[9].length - 1]];
    }
  });
}
