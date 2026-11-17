# Las dependencias como cadenas en el 7 (Core AGRAM 17-11)

Decidido por Core AGRAM con VG sobre el estudio de Core («dependencias como cadenas»). El contrato está en `docs/CONTRATO.md` §12.10; aquí, el porqué de cada decisión.

- **La relación en el 2.6 de la tarea que depende.** El 2 es la condición de un registro (el motor ya lee ahí el criterio de cierre, el recuento, el P comprometido y el segundo factor); «esta va después de aquella» es una precondición para empezar, y el 6 es «de dónde viene». No en el 7: allí viven lecturas implícitas (7.1, 7.4, 7.9) y el 7.6 de la época son los niveles de las anclas. Lo anclado en el 2.6 es un registro, y las lecturas del criterio solo cuentan hojas: no las confunde.
- **Una plantilla propia, no «reference X from another record» ni «anchor here».** La primera no distingue una dependencia de cualquier otra referencia; la segunda anclaría en el 0, entre los hijos de la tarea, y se ofrecería a cualquiera. La propia se reconoce por su 4, se ofrece solo al autor de una tarea y lleva su frase legible.
- **Manda la última, con todas las anteriores.** Un registro por tarea con la lista entera (como la nota de detalle del volcado): cambiar las dependencias es escribir otra; quitarlas todas, una sin 6. No hace falta retirar relaciones una a una.
- **De la casa que depende.** La anterior puede ser de otra casa: la condición es de quien espera, no del otro. Solo cuenta la relación del autor de la tarea.
- **Los ciclos los dice la lectura.** El BQL mínimo no recorre un grafo, así que la regla de la época solo impide nombrarse a sí misma. Un ciclo escrito a mano no rompe nada: se descarta la arista que lo cierra (la última en llegar) y sale en `descartadas`.
- **El reparto voraz y estable**, y no el de menos cadenas posibles (un recubrimiento mínimo por caminos): este cambia de forma al añadir una sola arista y cuesta explicarlo. El voraz se entiende leyendo una frase: cada tarea sigue la cadena de su primera anterior que aún termina en ella.
- **Hecho pide un cierre escrito.** `motor.cerrado` da por cerrado lo que no anuncia nada («all announced movements happened» sin anuncios); sin el cierre del autor, una tarea recién escrita saldría hecha. Como el volcado (`estacionDe`).
- **Lo que desbloquea es un valor**, `FINES_QUE_DESBLOQUEAN` en `src/cadenas.js`: hoy cumplido y decidido. Con error o caducada, la siguiente espera.
- **El 7 de este libro, por la época.** La fila del 7 de `epoch.8.7.1` es una colección por nombre: la del roadmap sustituye a la de la 0 solo en sus libros. Una carta que no conozca la forma `cadenas` no pinta división en el 7 (`rejillaDe` da null): la carta tiene que llegar antes que el libro reescrito.

Abierto: el volcado (escribir el tipo «task» y la relación de cada fila, en una segunda pasada cuando ya existen todas las tareas) y la carta (la forma `cadenas`, compactada a 400 px por `primeroSinHacer`).
