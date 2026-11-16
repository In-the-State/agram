# El volcado de una tabla de tareas (A8)

Core AGRAM, 16-11. Origen: VG por Core State (roadmap A8, #131). Sin plantilla nueva y sin tocar la época. El guion es `ejemplos/volcado/volcar.mjs`; la prueba, `test/volcado-tabla.test.js`.

## Qué hace

Lee una tabla JSON (una lista de filas) y la vuelca en un libro con las plantillas de la época 0. El libro es espejo de la tabla: si se pasa otra vez la misma tabla, no escribe nada; si la tabla ha cambiado, escribe solo la diferencia. Cada fila se reconoce por su id, que va escrito en la tarea.

| De la tabla | En el libro | Plantilla | Quién |
|---|---|---|---|
| cada cosa (columna) | una cosa de la dueña, con su clave declarada en el alta y su prueba de posesión | `register a thing` (en el 1.4 del alta de la dueña) | la dueña |
| cada proyecto de una cosa | un registro sobre el alta de la cosa; de él cuelgan sus tareas | `anchor here` | la cosa |
| cada fila | un registro sobre el proyecto: el 0 es el texto; el 1 son los datos, como «etiqueta: valor» (el id y las columnas de `datos`), la misma forma que la clasificación de una opinión | `anchor here` | la cosa |
| fase → propuesta | el anuncio de los minutos que se trabajarán, en el 4.1 de la tarea | `declare future T` | la cosa |
| fase → autorizada | la cosa compromete su P con el anuncio y el recuento pasa | `commit P` (en el 2.1 del anuncio) | la cosa |
| fase → ejecutada | la cosa trabaja (quema) lo anunciado | `deliver` (en el 4 del anuncio) | la cosa |
| fase → cerrada | la cosa dice que todo lo anunciado ha pasado | `close` (en el 4 de la tarea) | la cosa |
| un texto o un dato que cambia | otro registro de la cosa, colgado de la tarea, con el texto y los datos nuevos | `anchor here` (en el 0 de la tarea) | la cosa |

Lo leen el motor y el contrato: `acciones.estacionDeAnuncio` da propuesta, autorizada o ejecutada; `motor.cerrado` da el cierre. `estacionDe(eje, tarea)` del guion junta las dos lecturas.

- Una fase desconocida se queda en propuesta y sale en los avisos.
- Una fase que retrocede no se deshace: sale en los avisos, en cada pasada.
- Una fila que desaparece no se borra: sale en los avisos.
- Una fila que cambia de cosa o de proyecto no se mueve: sale en los avisos.

## Cómo se llama

```
node ejemplos/volcado/volcar.mjs --tabla <tabla.json> [--correspondencia <c.json>] [--claves <claves.json>]
     [--eje <eje.json>] [--salida <eje.json>] [--simular] [--t <instante>]
```

- `--claves`: un JSON que esté fuera del repositorio. Lleva `{ "duena": { "identidad", "privada" }, "cosas": { "<cosa>": { "publica", "privada" } } }`. Si no se da, solo se puede simular, con claves de prueba generadas en memoria.
- `--eje`: un eje guardado con `persistencia.serializar`. Si no se da, se usa un eje local vacío, con solo el génesis de la dueña.
- `--salida`: dónde se guarda el eje escrito. Sin `--simular` es obligatorio. El guion no habla con ningún nodo.
- `--simular`: hace lo mismo en una copia y no escribe nada. Da la lista de lo que escribiría, el T que cuesta y lo que no puede hacer.

Como módulo: `volcar(eje, tabla, { duena, claves, correspondencia, t, simular })` devuelve el informe y `pintar(informe)` lo pone en unas líneas. El informe tiene `escritos`, `sinCambios`, `avisos`, `noPuede`, `paraLaDuena`, `desaparecen` y `t: { calculado, gastado, dado }`.

## La correspondencia

Va en las opciones. El guion no lleva escrito ningún nombre de columna, de cosa ni de fase. La del roadmap está en `ejemplos/volcado/correspondencia-roadmap.json`:

- columnas: `id` → id, `cosa` → casa, `proyecto` → linea, `texto` → tarea, `fase` → fase, `datos` → [sprint, estado];
- fases: falta → propuesta, en curso → autorizada, hecho → ejecutada, comprobado → cerrada;
- `minutosAnunciados`: 10, los minutos de T que anuncia cada tarea (ver «Límites»);
- opcionales: `nombres`, para dar a una cosa otra identidad que el valor de su columna, y `cuando`, el instante del anuncio, que por defecto es el del volcado.

## El T

Una cosa no tiene asignación diaria: gasta lo que le da su dueña. Antes de escribir, el guion vuelca cada cosa en una copia del eje para medir lo que gasta. Después elige los minutos que la dueña le da en el alta: el menor valor que deja la plantilla (1, 60 o 1440) y que cubre ese gasto. Para no tocar su T de minuto, la dueña paga en T de segundo el coste de escribir el alta. Si a la dueña no le llega el T de minuto del día, las cosas que no caben quedan para otro día; el informe lo dice en «queda para la dueña». El informe da el T calculado y el gastado, y la prueba comprueba que coinciden.

Roadmap de verdad, simulado sobre un eje local vacío: 57 filas, 176 registros y 6 avisos (4 «aparcado» y 2 «estudio», que se quedan en propuesta). Las cosas gastan 1237 minutos en total: AGRAM 403, StateArk 400 y AARPIA 434. La dueña da 1440 minutos a cada cosa y paga 360 segundos por cada alta. Como cada cosa necesita más de 60 minutos, cada alta se lleva todo el T de minuto de un día. Por eso hacen falta tres días, uno por casa: el primero 61 registros (AGRAM), el segundo 56 (StateArk) y el tercero 59 (AARPIA). Si la dueña pudiera dar minutos sueltos, bastaría un día, porque 1237 es menos que 1440.

## Lo que queda para la dueña

La cosa hace sola todos los pasos: proyecto, tarea, propuesta, autorizada, ejecutada, cerrada y correcciones. Lo comprueba la prueba, con el recuento por defecto: solo cuenta la dueña del anuncio, que es la cosa, y el umbral es 0. La dueña solo hace falta para dos cosas:

- **Dar de alta cada cosa** con su T. Es el único paso que firma ella.
- **Reponer el T de una cosa** que se queda sin él. En la época 0 no hay plantilla para reponer: la ayuda de `register a thing` dice que es «otra transferencia de T», pero ninguna plantilla la hace. El guion calcula cuántos minutos faltan y lo pone en «queda para la dueña».

Una cosa que su dueña haya declarado agente (`epoch.9.0.4`) no podría hacer nada de esto: todas estas plantillas son de modo «person».

## Límites

- **«verificada»**, la cuarta estación de `epoch.4.3`, pide «firm», es decir, un sello. Ninguna clave la da. Por eso el paso «cerrada» del guion es el registro `close` y no esa estación.
- **El coste de escribir cumple un anuncio de T.** Ocurre con un defecto de la lectura «stage» (época 0). La quema del coste de escribir de cualquier registro anclado sobre el anuncio cuenta como el T anunciado si llega a su cantidad: `commit P` cuesta 6 minutos, y con un anuncio de 6 o menos la tarea pasaría de propuesta a ejecutada sin entregar nada. Por eso `minutosAnunciados` vale 10. El guion lo comprueba con el motor después de cada paso y avisa si la estación leída no es la del paso; la prueba lo enseña con 1 minuto. La regla «firm» ya excluye el coste de escribir, y «stage» no.
- `write to X` no sirve para corregir una tarea propia: solo se ofrece sobre lo de otro, ancla en el 3 del alta del destinatario y paga atención. La corrección es otro `anchor here` de la cosa sobre su tarea.
- Las altas solo pueden dar 1, 60 o 1440 minutos en un día. Con eso, una dueña con varias casas grandes da de alta una casa al día (ver «El T»).
- El anuncio lleva fecha, por defecto la del volcado. Una tarea que se queda en propuesta tiene esa fecha vencida, así que un agente con `expire` podría darla por caducada. Con `cuando` se puede dar otra fecha.
- Si un texto empieza por «=», se leería como fórmula. El guion no vuelca esa fila y lo avisa.
