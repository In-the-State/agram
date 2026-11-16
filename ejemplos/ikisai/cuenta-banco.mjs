// Ejemplo con datos inventados: una cuenta del banco (VG 16-11, la trae Core State; encargo «cuenta del banco»;
// docs/notas/CUENTA_BANCO.md). «La cuenta del banco es una E única, como una mesa. El saldo es un dato de su registro,
// que se actualiza con lo que dice el banco. No hay unidades de euro fungibles en el libro.» Construye su propio eje:
//   - génesis de ana (una persona, la primera identidad del eje), que emite al empezar su R (emitir E exige R propia
//     emitida: la regla «minting E needs own R issued»);
//   - ana invita a bea, que acepta (su alta);
//   - ana conecta una cuenta («connect an account», en el 1.1 de su alta): el nombre que le pone, el banco y los días
//     que dura el permiso (180); capacidad 1 en su 2;
//   - ana da de alta la conectora, una cosa suya con clave («register a thing»): la que en la vida real es la app de
//     StateArk que va a la web o la app del banco. Aquí está simulada: nada sale del libro y no hay credencial ninguna;
//   - la conectora deja «permiso concedido» en el 7 de la cuenta («grant the permission»), hasta dentro de 180 días;
//   - ana acuña la E única de la cuenta («issue E tied to X», denominación «account», cantidad 1); la plantilla bloquea
//     además 1 de su P sobre la cuenta con la salida = la serie (su «commitment»), lo que pide la cuota del tope en un
//     registro con capacidad;
//   - la conectora escribe dos saldos («update the balance», en el 1 de la cuenta): manda el de instante más reciente;
//   - bea ancla una nota en la cuenta («anchor here»), con lo que obtiene diez P sobre la nota, y lo reposiciona un paso
//     hacia la cuenta («reposition P toward X»: subir deja una décima, 1 P); desde entonces puede ordenar: escribe una
//     orden en el 4 de la cuenta (la orden de pago es de StateArk, su plantilla «payment instruction»; aquí, un registro
//     cualquiera con un texto inventado), que la regla «acting on an account needs P on it» deja pasar.
// Nada de esto es real: ni el banco, ni los saldos, ni ningún número de cuenta.

import { Eje } from '../../src/eje.js';
import * as A from '../../src/acciones.js';
import { firmar, firmarPosesion } from '../../src/autoridad.js';
import { entrarPorInvitacion } from './altas.mjs';
import { pagaElCoste, escribirPagando } from './coste.mjs';

/** Calendario inventado: el lunes 16 de noviembre se conecta y el martes 17 llega el segundo saldo y la orden. */
export const T0 = '2026-11-16T09:00:00Z';
export const T1 = '2026-11-16T10:00:00Z';
export const T2 = '2026-11-17T09:00:00Z';
export const T3 = '2026-11-17T10:00:00Z';

/** La cuenta inventada: su nombre (el 0 de su registro), el banco y los dos saldos que dice el banco [cuánto, cuándo]. */
export const CUENTA = Object.freeze({ nombre: 'cuenta de casa', banco: 'Banco de Ejemplo', dias: 180 });
export const SALDOS = Object.freeze([Object.freeze([1250.4, T1]), Object.freeze([1180.15, T2])]);

/** Un instante `dias` días después de `t`, en ISO sin milisegundos (lo que la conectora pone como vencimiento). */
export const diasDespues = (t, dias) => new Date(Date.parse(t) + dias * 86400e3).toISOString().replace('.000Z', 'Z');

/**
 * Construye el eje de la cuenta. `claves` ({ ana, conectora, bea }: { publica, privada }) son las de quienes firman
 * (opcionales en un eje de demostración). Devuelve { eje, cuenta, permiso, unica, saldos, nota, reposicion, orden }.
 */
export async function ejemploCuentaBanco({ claves = {} } = {}) {
  const priv = (id) => claves[id]?.privada;
  const firmarCon = (id) => (priv(id) ? (ev) => firmar(ev, priv(id)) : undefined);
  const r = {};
  const eje = await Eje.genesis({
    demostracion: true,
    identidad: 'ana',
    emision: [{ token: 'R', cantidad: 10 }],
    foco: 'ana',
    t: T0,
    clave: claves.ana?.publica,
    privada: priv('ana'),
  });
  r.eje = eje;
  const alta = eje.alta('ana').id;
  await entrarPorInvitacion(eje, { por: 'ana', quien: 'bea', t: T0, clave: claves.bea, privadaDe: priv });

  /** Lanza una plantilla de la época y asienta su evento (firmado por quien la lanza, si tiene clave). */
  const lanzar = async (nombre, X, parametros, yo, t) => {
    const x = await A.transaccion(eje, nombre, { X, ...parametros }, yo, { t, firmar: firmarCon(yo) });
    if (!x.ok) throw new Error(nombre + ' (' + yo + '): ' + x.motivos.map((m) => m.mensaje).join('; '));
    return eje.anadir(x.evento);
  };

  // 1. Elegir el banco: ana conecta la cuenta (queda hecho al escribirla).
  r.cuenta = await lanzar('connect an account', alta, { name: CUENTA.nombre, bank: CUENTA.banco, 'permission days': CUENTA.dias }, 'ana', T0);

  // La conectora, una cosa de ana con clave (la app de StateArk, simulada), con 60 minutos de T para escribir.
  const conClave = claves.conectora?.publica ? { key: claves.conectora.publica } : {};
  const altaConectora = await A.transaccion(eje, 'register a thing', { X: alta, thing: 'conectora', minutes: 60, ...conClave }, 'ana', { t: T0, firmar: firmarCon('ana') });
  if (!altaConectora.ok) throw new Error('register a thing: ' + altaConectora.motivos.map((m) => m.mensaje).join('; '));
  await eje.anadir(priv('conectora') ? await firmarPosesion(altaConectora.evento, 'conectora', priv('conectora')) : altaConectora.evento);

  // 2. Ir al banco y dar el permiso: lo hace la conectora fuera del libro; en el libro, «permiso concedido» hasta dentro de 180 días.
  r.permiso = await lanzar('grant the permission', r.cuenta.id, { until: diasDespues(T1, CUENTA.dias) }, 'conectora', T1);

  // 3. Volver: se acuña la E única, con la plantilla (que compromete 1 de P de ana sobre la cuenta con la serie).
  r.unica = await lanzar('issue E tied to X', r.cuenta.id, { denomination: 'account', quantity: 1 }, 'ana', T1);

  // Los saldos: lo que dice el banco, escrito por la conectora en el 1 de la cuenta; manda el de instante más reciente.
  r.saldos = [];
  for (const [cuanto, cuando] of SALDOS) r.saldos.push(await lanzar('update the balance', r.cuenta.id, { amount: cuanto, when: cuando }, 'conectora', cuando));

  // La cuenta compartida: bea ancla una nota en la cuenta (diez P sobre la nota) y reposiciona ese P un paso hacia la cuenta.
  r.nota = await lanzar('anchor here', r.cuenta.id, { title: 'cuenta compartida', content: 'la llevamos entre las dos' }, 'bea', T2);
  r.reposicion = await lanzar('reposition P toward X', r.cuenta.id, {}, 'bea', T2); // por defecto, el P de bea sobre su nota

  // Ordenar: bea escribe en el 4 de la cuenta (la orden de pago es de StateArk; aquí, un texto inventado).
  r.orden = await escribirPagando(eje, { autor: 'bea', sobre: r.cuenta.id, en: '4000000000', t: T3, payload: ['orden de pago simulada: 30 EUR para la compra de la semana'], movimientos: [pagaElCoste('bea')] }, priv('bea'));
  return r;
}
