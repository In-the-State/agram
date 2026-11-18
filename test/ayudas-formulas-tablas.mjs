// Las fórmulas de las tablas de §15 (docs/BQLM.md §15.1 y §15.4): las comparten test/tablas-bqlm.test.js, que las prueba
// frente al JavaScript, y test/explicar-bqlm.test.js, que comprueba que explicar da su mismo veredicto.

// a) Las acciones que se ofrecen: las plantillas del PV K cuya fórmula del 2 pasa sobre X, por el orden de su 8, las N primeras.
export const ACCIONES = (K, N) => '=take ' + N + ' (epoch.9.6.1 where first it2.8 = ' + K + ' keep apply(last it2.2, it) by nth 1 it2.8) each (first it2.0)';

// b) Las anteriores de una tarea (it): la última relación «this goes after» de su autor en su 2.6, y en su 6 las tareas.
export const ANTERIORES = '=(last (it.2.6 where first it2.3 = first it.3 and "this goes after" in payload(it2).4)) each (payload(it2).6) where "task" in payload(it2).5 and it2 != it';
export const ANT = JSON.stringify(ANTERIORES);
// b) Lo que continúa desde una tarea, con cited (§15.3): las relaciones que la nombran en su 6, la tarea en que se anclan, si
// es una tarea y la relación es la que manda (la tarea está entre sus anteriores).
export const SIGUIENTES = '=it follow ((it2 cited 6) each (up it3) where "task" in payload(it3).5 and it2 in apply(' + ANT + ', it3))';

// c) La matriz del 4: el oficio (el PV de la plantilla que el registro nombra en su 4; si no, el dígito de la posición en
// que se ancla) y la ejecución (0 si no mueve nada más que el coste, la asignación y la obtención; si no, la columna de la
// primera familia que mueve, E 1, P 2, R 3, T 4). Una versión corta de contrato.celdaDeEjecucion: ni las estaciones de los
// anuncios ni las escalas informativas de T.
export const DIGITOS = '"0" with "1" with "2" with "3" with "4" with "5" with "6" with "7" with "8" with "9"';
export const OFICIO = '=first ((epoch.9.6.1 where first it2.0 in payload(it).4) each (first it2.8) with lookup(' + DIGITOS + ', 0 with 1 with 2 with 3 with 4 with 5 with 6 with 7 with 8 with 9, text(slice(utf8(nth 1 it.6.5), 0, 1))))';
export const MUEVE = '(moves it where not (it3.4.1 in ("asignacion" with "obtencion")) and not (it3.4.0 = burn and first it3.0.0.0 = T and first it3.3.0 = first it.3))';
export const FAMILIA = (k, f) => '(' + k + ' where ' + f + ' in ' + MUEVE + ' each (first it3.0.0.0))';
export const EJECUCION = '=first ((0 where count ' + MUEVE + ' = 0) with ' + FAMILIA(1, 'E') + ' with ' + FAMILIA(2, 'P') + ' with ' + FAMILIA(3, 'R') + ' with ' + FAMILIA(4, 'T') + ')';
export const MATRIZ = '=(down it) group row(apply(' + JSON.stringify(OFICIO) + ', it2), apply(' + JSON.stringify(EJECUCION) + ', it2))';
// El mismo oficio con lookup (§15.4): los nombres y los PV de las plantillas son una subexpresión cerrada (no leen it), que
// la memoria de una lectura de pantalla recuerda de un registro al siguiente; sin memoria cuesta algo más que OFICIO.
export const OFICIO_CON_LOOKUP = '=first ((payload(it).4 each (first lookup(epoch.9.6.1 each (first it3.0), epoch.9.6.1 each (first it3.8), it2))) with lookup(' + DIGITOS + ', 0 with 1 with 2 with 3 with 4 with 5 with 6 with 7 with 8 with 9, text(slice(utf8(nth 1 it.6.5), 0, 1))))';
export const MATRIZ_CON_LOOKUP = '=(down it) group row(apply(' + JSON.stringify(OFICIO_CON_LOOKUP) + ', it2), apply(' + JSON.stringify(EJECUCION) + ', it2))';

/** Todas, para recorrerlas: las de arriba y las de las pruebas del caso b). */
export const FORMULAS_DE_LAS_TABLAS = Object.freeze([
  ACCIONES(7, 50),
  ACCIONES(0, 3),
  ANTERIORES,
  SIGUIENTES,
  '=it follow apply(' + ANT + ', it2)',
  '=it follow (under up it2 where "task" in payload(it3).5 and it2 in apply(' + ANT + ', it3))',
  '=it follow (under (last path it2) where "task" in payload(it3).5 and it2 in apply(' + ANT + ', it3))',
  '=under it where "task" in payload(it2).5 and count apply(' + ANT + ', it2) = 0',
  '=under it where "task" in payload(it2).5 and count ((last (it2.2.6 where first it3.3 = first it2.3 and "this goes after" in payload(it3).4)) each (payload(it3).6) where "task" in payload(it3).5 and it3 != it2) = 0',
  '=under it where "task" in payload(it2).5 by count (it2 follow apply(' + ANT + ', it3))',
  OFICIO,
  EJECUCION,
  MATRIZ,
  OFICIO_CON_LOOKUP,
  MATRIZ_CON_LOOKUP,
]);
