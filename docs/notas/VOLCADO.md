# El volcado de una tabla de tareas (A8)

Core AGRAM, 16-11. Origen: VG por Core State (roadmap A8, #131). Desde el encargo «dar T a una cosa mía» (V10, 16-11), la dueña da T a sus cosas con la plantilla `give T to a thing of mine` de la época 0, y la lectura «stage» ya no cuenta el coste de escribir como lo anunciado (#134). El guion es `ejemplos/volcado/volcar.mjs`; la prueba, `test/volcado-tabla.test.js`.

## Qué hace

Lee una tabla JSON (una lista de filas) y la vuelca en un libro con las plantillas de la época 0. El libro es espejo de la tabla: si se pasa otra vez la misma tabla, no escribe nada; si la tabla ha cambiado, escribe solo la diferencia. Cada fila se reconoce por su id, que va escrito en la tarea.

| De la tabla | En el libro | Plantilla | Quién |
|---|---|---|---|
| cada cosa (columna) | una cosa de la dueña, con su clave declarada en el alta y su prueba de posesión | `register a thing` (en el 1.4 del alta de la dueña) | la dueña |
| el T de cada cosa | lo justo para lo que gasta en la pasada: el mínimo en el alta y el resto (o lo que le falte en una pasada posterior) con otra transferencia | `give T to a thing of mine` (en el 1.4 del alta de la cosa) | la dueña |
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
- `minutosAnunciados`: 1, los minutos de T que anuncia cada tarea (y que «deliver» quema al ejecutarla); 1 es también el defecto. Antes valía 10 por el defecto #134: con un anuncio de 6 minutos o menos, el coste de escribir «commit P» (6 minutos) lo cumplía. Arreglado, basta el mínimo: el anuncio dice que la tarea se trabajará, no mide el trabajo, y cada minuto anunciado es un minuto que la dueña tiene que dar;
- opcionales: `nombres`, para dar a una cosa otra identidad que el valor de su columna, y `cuando`, el instante del anuncio, que por defecto es el del volcado.

## El T

Una cosa no tiene asignación diaria: gasta lo que le da su dueña. Antes de escribir, el guion vuelca cada cosa en una copia del eje para medir lo que gasta (allí la dueña le da todo el T de minuto que le queda). Después la dueña le da lo justo: al darla de alta, el mínimo que deja la lista de `register a thing` (1 minuto), y el resto con `give T to a thing of mine` (escala minuto, la cantidad que falte), justo detrás del alta. Una cosa que ya tiene alta y se queda sin T en una pasada posterior recibe, delante de sus pasos, lo que le falte para lo que gasta. La dueña paga en T de segundo el coste de escribir el alta y la transferencia, para no tocar su T de minuto. Si a la dueña no le llega el T de minuto del día, las cosas que no caben quedan para otro día («queda para la dueña»). El informe da el T calculado y el gastado, y la prueba comprueba que coinciden y que cada cosa acaba sin T.

Roadmap de verdad (`state/roadmap.json` de Core State, leído con `JSON.parse`), simulado el 16-11 sobre un eje local vacío con `minutosAnunciados` 1: 57 filas, 181 registros (3 altas, 3 transferencias de T, 9 proyectos, 57 tareas, 57 propuestas, 33 autorizadas, 17 ejecutadas y 2 cerradas) y 6 avisos (4 «aparcado» y 2 «estudio», que se quedan en propuesta). Las cosas gastan 1096 minutos: AGRAM 382, StateArk 346 y AARPIA 368. La dueña les da justo eso (1 minuto en cada alta y el resto con la transferencia) y paga 2160 segundos de T de segundo por las seis (el coste de escribir cada alta y cada transferencia). **Cabe en un día**: 1096 es menos que los 1440 minutos de T de minuto de la dueña. Con `minutosAnunciados` 10 (lo de antes) también cabría: 1249 minutos (AGRAM 409, StateArk 400 y AARPIA 440). Antes de la plantilla hacían falta tres días, una casa por día, porque cada alta se llevaba todo el T de minuto de un día (1440).

## Lo que queda para la dueña

La cosa hace sola todos los pasos: proyecto, tarea, propuesta, autorizada, ejecutada, cerrada y correcciones. Lo comprueba la prueba, con el recuento por defecto: solo cuenta la dueña del anuncio, que es la cosa, y el umbral es 0. La dueña firma dos cosas:

- **Dar de alta cada cosa**, con el mínimo de T.
- **Darle T** con `give T to a thing of mine`, al darla de alta y cada vez que se queda sin T. Si el guion tiene su clave, lo hace él; sin ella (en un eje que exige firmas), lo que falta sale en «queda para la dueña» («dar a X al menos N minutos de T…»: sin dar T, lo medido en la copia se para en el primer paso que no tiene T) y los pasos de esa cosa no se escriben.

Una cosa que su dueña haya declarado agente (`epoch.9.0.4`) no podría hacer nada de esto: todas estas plantillas son de modo «person».

## Límites

- **«verificada»**, la cuarta estación de `epoch.4.3`, pide «firm», es decir, un sello. Ninguna clave la da. Por eso el paso «cerrada» del guion es el registro `close` y no esa estación.
- El guion comprueba con el motor la estación después de cada paso y avisa si no es la del paso. Con el arreglo de «stage» (#134) el coste de escribir ya no cumple un anuncio: la prueba lo enseña con 1 minuto anunciado (la tarea autorizada sigue autorizada).
- `write to X` no sirve para corregir una tarea propia: solo se ofrece sobre lo de otro, ancla en el 3 del alta del destinatario y paga atención. La corrección es otro `anchor here` de la cosa sobre su tarea.
- Las altas solo dan 1, 60 o 1440 minutos (la lista de `register a thing`, que no cambia): por eso el alta da el mínimo y el resto llega con `give T to a thing of mine`, de cantidad libre. El tope es el T de minuto del día de la dueña (1440): lo que no cabe queda para otro día.
- El anuncio lleva fecha, por defecto la del volcado. Una tarea que se queda en propuesta tiene esa fecha vencida, así que un agente con `expire` podría darla por caducada. Con `cuando` se puede dar otra fecha.
- Si un texto empieza por «=», se leería como fórmula. El guion no vuelca esa fila y lo avisa.
