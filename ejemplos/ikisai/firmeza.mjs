// Ejemplo con datos inventados: la firmeza y lo pedido (encargo A18, «T, el sistema de las anclas»; VG 16-11,
// state/ANCLAJE_EN_CASCADA.md §7.8; docs/notas/FIRMEZA.md). Un libro pequeño de ana, con bea invitada, y un registro en
// cada estado de las estaciones de firmeza del reverso:
//   - en firme en cada uno de los cuatro niveles (lo que exige la familia más alta que mueve: solo el coste, el nivel 1;
//     acuñar R, el 2; mover P, el 3; acuñar E, el 4), con grado y red en algunos eslabones;
//   - se puede usar y aún no en firme (acuña R y solo tiene su recibo de llegada, el nivel 1);
//   - lo pedido por la escala del T que quema al escribirlo: pendiente (paga con el año: el nivel 4 en un año), a tiempo
//     (paga con minutos y su eslabón de nivel 2 llega en el minuto), fuera de plazo alcanzado tarde (llega a los diez
//     minutos) y fuera de plazo sin alcanzar (paga con segundos y no tiene ni recibo ni sello);
//   - uno con «pedir más firmeza» colgado (bea pide el nivel 4 en un día, pagando con su día), sellado a las cinco horas;
//   - y uno en duda: su sello pasa por una cabecera de la línea del observador que se ha bifurcado (dos cabeceras con el
//     mismo número), anotada en el eje.
// Los sellos, los recibos y sus claves (el observador, el relé y los firmantes de cada nivel) son INVENTADOS y se fabrican
// aquí, en cada construcción (ejemplos/ikisai/sellos.mjs): cabeceras de lote v2 firmadas de verdad con esas claves, que la
// regla «sealed» comprueba. Nada de esto es real: ni el observador, ni la red, ni los bloques.

import { Eje } from '../../src/eje.js';
import * as A from '../../src/acciones.js';
import { contrato, salida } from '../../src/index.js';
import { firmar, generarClaves } from '../../src/autoridad.js';
import { quemaDelCoste } from '../../src/escritura.js';
import { direccion } from '../../src/btml.js';
import { entrarPorInvitacion } from './altas.mjs';
import { selloEnCascada, cabeceraDeLoteFirmada, reciboFirmado } from './sellos.mjs';

/** Calendario inventado: todo el lunes 16 de noviembre de 2026 (UTC). */
export const T0 = '2026-11-16T09:00:00Z';
/** Un instante `s` segundos después de T0, en ISO sin milisegundos. */
export const despues = (s) => new Date(Date.parse(T0) + s * 1000).toISOString().replace('.000Z', 'Z');
const segundos = (iso) => Math.floor(Date.parse(iso) / 1000);

/** Los registros del ejemplo, por su papel: el 0 que escribe cada uno. */
export const PAPELES = Object.freeze({
  casa: 'firmeza: solo paga su coste y lo recibe la casa (nivel 1)',
  nivel2: 'firmeza: acuña R y llega al nivel 2',
  nivel3: 'firmeza: mueve P y llega al nivel 3',
  bitcoin: 'firmeza: acuña E y llega a Bitcoin',
  usable: 'firmeza: acuña R, la casa lo tiene y aún no está en firme',
  pendiente: 'pedido: paga con el año y pide Bitcoin en un año',
  aTiempo: 'pedido: paga con minutos y llega al nivel 2 en el minuto',
  tarde: 'pedido: paga con minutos y llega al nivel 2 a los diez minutos',
  sinAlcanzar: 'pedido: paga con segundos y no llega a ninguna parte',
  colgado: 'pedido: bea pide más firmeza para este registro',
  enDuda: 'firmeza: su sello pasa por una línea bifurcada',
});

/**
 * Construye el eje. `claves` ({ ana, bea }: { publica, privada }) son las de quienes firman (opcionales: un eje de
 * demostración). Devuelve { eje, registros: { <papel>: evento }, peticion, foco } (el foco, el registro con lo colgado).
 */
export async function ejemploFirmeza({ claves = {} } = {}) {
  const priv = (id) => claves[id]?.privada;
  const firmarCon = (id) => (priv(id) ? (ev) => firmar(ev, priv(id)) : undefined);
  const eje = await Eje.genesis({ demostracion: true, identidad: 'ana', emision: [{ token: 'R', cantidad: 10 }], foco: 'ana', t: T0, clave: claves.ana?.publica, privada: priv('ana') });
  const alta = eje.alta('ana').id;
  await entrarPorInvitacion(eje, { por: 'ana', quien: 'bea', t: T0, clave: claves.bea, privadaDe: priv });

  // Las claves inventadas de fuera: el observador de cabeceras (lo declara ana, la cuenta raíz) y el relé de los recibos.
  const observador = await generarClaves();
  const rele = await generarClaves();
  const ajustes = contrato.registroDeAjustes('exterior settings', { 'observer keys': observador.publica }, { quien: 'ana' });
  await salida.escribirDesde(eje, { modo: 'sequenced', autor: 'ana', sobre: alta, en: direccion([9]), payload: ajustes, t: despues(30) }, priv('ana'));

  /** ana escribe un registro sobre su alta pagando su coste con una unidad de cada escala que lo cubra, más lo que mueva. */
  const escribe = (papel, escalas, t, mueve = [], sobre = alta) => {
    const payload = [PAPELES[papel]];
    return eje.escribir({ autor: 'ana', sobre, t, payload, movimientos: [...escalas.map((e) => quemaDelCoste('ana', payload, e, { eje })), ...mueve] }, priv('ana'));
  };
  /** Lanza una plantilla de la época y asienta su evento. */
  const lanzar = async (nombre, X, parametros, yo, t) => {
    const x = await A.transaccion(eje, nombre, { X, ...parametros }, yo, { t, firmar: firmarCon(yo) });
    if (!x.ok) throw new Error(nombre + ' (' + yo + '): ' + x.motivos.map((m) => m.mensaje).join('; '));
    return eje.anadir(x.evento);
  };
  const sellar = async (ev, capas, bloque) => eje.marcarSello(ev.id, await selloEnCascada(ev.id, { observador, capas, instante: bloque }));
  const recibir = (ev, instante) => eje.marcarRecibo(ev.id, reciboFirmado(rele, { instante, semilla: ev.id }));
  const R = (n) => ({ token: 'R', emisor: 'ana', cantidad: n, de: null, a: 'ana' });
  const r = {};

  // En firme en cada nivel: lo que exige la familia más alta que mueve.
  r.casa = await escribe('casa', ['segundo'], despues(60));
  recibir(r.casa, despues(60));
  r.nivel2 = await escribe('nivel2', ['minuto'], despues(120), [R(3)]);
  await sellar(r.nivel2, [{ nivel: 1, grado: 'casera', hora: segundos(despues(121)) }, { nivel: 2, grado: 'federación', hora: segundos(despues(150)) }, { nivel: 4, hora: segundos(despues(3000)) }], despues(3600));
  const nota = await lanzar('anchor here', alta, { title: 'una nota con P', content: 'diez P sobre ella' }, 'ana', despues(180));
  r.nivel3 = await lanzar('reposition P toward X', alta, { }, 'ana', despues(200));
  void nota;
  await sellar(r.nivel3, [{ nivel: 3, grado: 'protocolo', hora: segundos(despues(900)) }, { nivel: 4, grado: 2, red: 'pruebas', hora: segundos(despues(3000)) }], despues(3600));
  const soporte = await escribe('bitcoin', ['minuto'], despues(240));
  r.bitcoin = await lanzar('issue E tied to X', soporte.id, { denomination: 'entrada', quantity: 1 }, 'ana', despues(260));
  await sellar(r.bitcoin, [{ nivel: 4, grado: 2, red: 'pruebas', hora: segundos(despues(3000)) }], despues(3600));

  // Se puede usar, aún no en firme: acuña R (exige el nivel 2) y solo lo tiene la casa.
  r.usable = await escribe('usable', ['minuto'], despues(300), [R(2)]);
  recibir(r.usable, despues(301));

  // Lo pedido por la escala.
  r.pendiente = await escribe('pendiente', ['anio'], despues(360));
  r.aTiempo = await escribe('aTiempo', ['minuto'], despues(420));
  await sellar(r.aTiempo, [{ nivel: 2, hora: segundos(despues(450)) }, { nivel: 4, hora: segundos(despues(460)) }], despues(470));
  r.tarde = await escribe('tarde', ['minuto'], despues(480));
  await sellar(r.tarde, [{ nivel: 2, hora: segundos(despues(1080)) }, { nivel: 4, hora: segundos(despues(1200)) }], despues(1300));
  r.sinAlcanzar = await escribe('sinAlcanzar', ['segundo'], despues(540));

  // Lo colgado: bea pide para él el nivel 4 en un día (paga con su día); llega a Bitcoin a las cinco horas.
  r.colgado = await escribe('colgado', ['minuto'], despues(600));
  const peticion = await lanzar('ask for more firmness', r.colgado.id, { scale: 3 }, 'bea', despues(7200));
  await sellar(r.colgado, [{ nivel: 1, hora: segundos(despues(601)) }, { nivel: 4, hora: segundos(despues(18000)) }], despues(18000));

  // En duda: la línea del observador se bifurca en su número 1 (dos cabeceras con el mismo número, de la misma clave), y el
  // sello de este registro pasa por su cabecera 1.
  r.enDuda = await escribe('enDuda', ['minuto'], despues(660));
  eje.marcarSello(r.enDuda.id, await selloEnCascada(r.enDuda.id, { observador, capas: [{ nivel: 1, hora: segundos(despues(661)) }, { nivel: 4, numero: 1, hora: segundos(despues(3000)) }], instante: despues(3600) }));
  const a = cabeceraDeLoteFirmada({ numero: 1, raiz: 'aa'.repeat(32), hora: segundos(despues(3000)) }, observador);
  const b = cabeceraDeLoteFirmada({ numero: 1, raiz: 'bb'.repeat(32), hora: segundos(despues(3001)) }, observador);
  eje.marcarBifurcacion({ a: a.decupla, b: b.decupla });

  return { eje, registros: r, peticion, foco: r.colgado.id };
}
