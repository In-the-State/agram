// Lo provisional (Core AGRAM 18-11; docs/notas/NUCLEO_6_7_8.md, decisión 13, reversible): lo que irá a la época 0 en su
// pasada única, escrito ya con la forma exacta que tendrá allí y leído como DATO (JSON, nunca JS) desde datos/provisional/.
// Es una capa entre la época 0 y la época del libro: lo de la época del libro gana siempre, y lo de la 0, cuando la 0 lo
// tenga, también (lo provisional nunca tapa a la época; test/provisional.test.js lo vigila por nombre).
//
//   TIPOS_PROVISIONALES     los tipos de parámetro (datos/provisional/tipos.json), con el molde de un parámetro: irán a
//                           epoch.9.2.0.3
//
// Se borra de un golpe en la pasada única: este archivo, datos/provisional/ y los import de este módulo (src/tipos.js).
// Un JSON por clase y no una carpeta de archivos: el navegador no lista carpetas y la carga es síncrona (un módulo JSON).

import TIPOS from '../datos/provisional/tipos.json' with { type: 'json' };

/** Una copia congelada en profundidad: lo provisional no lo cambia nadie al leerlo. */
function congelada(x) {
  if (!Array.isArray(x)) return x;
  return Object.freeze(x.map(congelada));
}

/** Los tipos de parámetro provisionales: décuplas con el molde de un parámetro (0 nombre, 1 de qué deriva, 2 validación, 9 opciones y ayuda). */
export const TIPOS_PROVISIONALES = congelada(Array.isArray(TIPOS) ? TIPOS : []);
