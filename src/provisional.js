// Lo provisional (Core AGRAM 18-11; docs/notas/NUCLEO_6_7_8.md, decisión 13, reversible): lo que irá a la época 0 en su
// pasada única, escrito ya con la forma exacta que tendrá allí, como DATO: los JSON de datos/provisional/ mandan y este
// módulo importa sus copias generadas (datos/provisional/generar.mjs: tipos.js y lecturas.js), el patrón de la casa, sin
// fetch ni módulos JSON (el núcleo va copiado en el WebView de StateArk y en los servidores de AARPIA).
// Es una capa entre la época 0 y la época del libro: lo de la época del libro gana siempre, y lo de la 0, cuando la 0 lo
// tenga, también (lo provisional nunca tapa a la época: test/tipos-parametro.test.js y test/lo-que-falta.test.js lo
// vigilan por nombre; test/provisional.test.js, que las copias están al día).
//
//   TIPOS_PROVISIONALES     los tipos de parámetro (datos/provisional/tipos.json), con el molde de un parámetro: irán a
//                           epoch.9.2.0.3
//   LECTURAS_PROVISIONALES  las lecturas (datos/provisional/lecturas.json), con el molde de una regla de la época: irán a
//                           su 2 (NUCLEO_6_7_8 §6). El contexto (src/contexto-eje.js) las materializa donde la época no
//                           tenga una lectura del mismo nombre. Hoy, «what is missing» en X.4.9 y «path steps» en X.9.8
//   FINALES_PROVISIONALES   los finales de un proceso que no son «cumplido» (datos/provisional/finales.json): por cada
//                           plantilla de cerrado de epoch.9.0.1, 1 el fin que da motor.cerrado, 2 la acción que escribe el
//                           registro que lo cierra y 3 si se lee antes («before») o después («after») de la del dueño. Irán
//                           a esas mismas posiciones de las filas de epoch.9.0.1.1
//
// Se borra de un golpe en la pasada única: este archivo, datos/provisional/ y los import de este módulo (src/tipos.js,
// src/contexto-eje.js y src/motor.js). Un JSON por clase y no una carpeta de archivos: así su copia es una.

import { TIPOS_PROVISIONALES_DATOS as TIPOS } from '../datos/provisional/tipos.js';
import { LECTURAS_PROVISIONALES_DATOS as LECTURAS } from '../datos/provisional/lecturas.js';
import { FINALES_PROVISIONALES_DATOS as FINALES } from '../datos/provisional/finales.js';

/** Una copia congelada en profundidad: lo provisional no lo cambia nadie al leerlo. */
function congelada(x) {
  if (!Array.isArray(x)) return x;
  return Object.freeze(x.map(congelada));
}

/** Los tipos de parámetro provisionales: décuplas con el molde de un parámetro (0 nombre, 1 de qué deriva, 2 validación, 9 opciones y ayuda). */
export const TIPOS_PROVISIONALES = congelada(Array.isArray(TIPOS) ? TIPOS : []);

/** Las lecturas provisionales: décuplas con el molde de una regla de la época que lee (read en su 4, dónde se materializa en su 3). */
export const LECTURAS_PROVISIONALES = congelada(Array.isArray(LECTURAS) ? LECTURAS : []);

/** Los finales de un proceso que no son «cumplido»: [[plantilla de cerrado], [fin], [acción que lo escribe], [before | after], [procedencia]]. */
export const FINALES_PROVISIONALES = congelada(Array.isArray(FINALES) ? FINALES : []);
