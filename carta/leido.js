// «Leído»: si la lectura humana de un registro (src/lectura.js) está abierta o cerrada, detrás de un conmutador
// discreto (VG, 8-11: «es muy difícil de leer para una persona, incluido para mí»). Se recuerda solo en este
// navegador, como comodidad. Mudado de la web antigua (antigua/ui/leido.js) al retirarla (#113).

import { leerLocal, guardarLocal } from './cuentas.js';

const CLAVE_LEIDO = 'agram.leido';
let abierto = leerLocal(CLAVE_LEIDO) === 'si';

/** Si el leído está abierto. */
export function leidoAbierto() {
  return abierto;
}

/** Abre o cierra el leído (sin argumento, alterna). */
export function alternarLeido(valor = !abierto) {
  abierto = Boolean(valor);
  guardarLocal(CLAVE_LEIDO, abierto ? 'si' : 'no');
  return abierto;
}
