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


## Las casas como personas (VG 17-11; `"como": "personas"`)

VG decidió (17-11) que los Cores y el operador entran en los libros como **personas invitadas**, con su propio T, y no como cosas de la dueña. La correspondencia elige el modo con `como`: `"cosas"` (el defecto, lo de arriba) o `"personas"`. La del roadmap (`correspondencia-roadmap.json`) va en `"personas"`.

- **El alta** es una invitación de la dueña (`eje.invitar`) que **no da nada** (`da: []`; la época lo admite: su 1 dice «nada») y su aceptación por la casa, firmada con su clave (`eje.aceptar`: su alta). La dueña quema el coste de escribir la invitación (15 minutos de su T del día); la casa, el de su aceptación (1 minuto). Las claves se leen igual que en modo cosas: `claves.cosas[nombre]`.
- **Sin pasos «dar»**: cada casa gasta su propio T del día (1440 minutos). Lo que no le cabe hoy no se escribe: sale en «no puede» con «a X no le llega hoy su T: otro día», y lo escribe una pasada de otro día.
- **Una casa ya existente** vale si su nombre tiene alta de persona en el libro y es de verdad esa casa: declara la clave de `claves.cosas[casa]` (cuando se conoce) o, sin clave conocida, la invitó la dueña o el autor del génesis. Si no, sus filas van a «no puede» con «el nombre X ya es de otra persona en este libro» y el resto sigue. Una invitación sin aceptar solo se acepta si la escribió la dueña, declara la clave de la casa, no ha caducado y su grupo (0) y su dominio (el alta de la dueña) son los del volcado; si no, la dueña escribe otra, y la de otro sale en los avisos. Si la de otro declara otra clave, el núcleo ya ata esa clave al nombre desde la invitación: la dueña no puede invitarla y sus filas van a «no puede» con «el nombre X ya lo reserva otra invitación, con otra clave». Un nombre con alta de **cosa** no se vuelca: aviso «ya tiene alta como cosa y no como persona».
- **Sin la clave de la dueña** (en un eje que exige firmas) no se invita: «queda para la dueña: invitar a X», y los pasos de esa casa van a «no puede». Las casas que ya tienen alta se vuelcan igual con su clave.
- **Con solo algunas claves de casa** (cada Core vuelca sus filas con su clave): las filas de las casas sin clave van a «no puede» con «sin la clave de X», sin escribir nada.
- Los proyectos cuelgan del alta de la casa (su aceptación), en su 0, con `anchor here`, que se ofrece a la persona sobre su propia alta. Idempotencia y diferencia, como en modo cosas.

Roadmap de verdad simulado el 17-11 (eje local vacío, una pasada): 253 registros (3 invitaciones, 3 altas, 9 proyectos, 73 tareas, 73 propuestas, 61 autorizadas, 29 ejecutadas, 2 cerradas), 7 avisos, nada en «no puede». La dueña gasta 45 minutos (las tres invitaciones); AGRAM 553, StateArk 525 y AARPIA 469, cada una de su T. **Cabe en una pasada**: antes hacían falta dos porque la dueña repartía su T de minuto entre las tres.

En el ensayo (`retoques/ensayo.mjs`), el libro del roadmap nace así. Un libro de ensayo ya volcado con las casas como cosas **de la dueña** es de la disposición anterior y **no se migra**: el servidor se niega al arrancar y dice el remedio (apartar `compartido.json` y `ensayo.json` de la carpeta del ensayo y arrancar otra vez para volcar de nuevo). Un alta de cosa de otro con el nombre de una casa no para el ensayo: se salta con un aviso.


## La casa de la dueña y la nota de detalle (VG 17-11)

VG quiere sus propios pasos en el libro del roadmap y, al abrir uno, ver en qué se basa, sus comandos, rutas, qué debe ver y a quién preguntar. Todo se **añade** al libro: no cambia la época ni los ids de lo escrito, y volver a pasar la misma tabla no escribe nada.

**La casa de la dueña.** La correspondencia gana `duena`: el nombre de casa que es la dueña del libro (en la del roadmap, `"VG"`; solo en modo personas). Esa casa no se invita ni se da de alta: sus proyectos cuelgan del alta de la dueña y sus filas las escribe ella, con su clave (`claves.duena`) y su escala (el coste de escribir en T de segundo), con los mismos pasos de fase que cualquier otra. Sin la clave de la dueña, sus filas van a «no puede» («sin la clave de la dueña») y queda para ella «volcar las filas de VG (la casa de la dueña) con su clave». Si ese nombre ya tiene alta propia en el libro (volcado antes como otra casa), sus filas van a «no puede» y no se vuelcan encima. En el ensayo, la casa de la dueña no tiene clave propia en el archivo de claves.

**La nota de detalle.** Columnas opcionales, nombradas en `columnas` de la correspondencia (en la del roadmap, con su mismo nombre):

| Columna | Qué es |
|---|---|
| `base` | una frase: en qué se basa |
| `pasos` | una lista ordenada de `{ hace, comando?, ruta?, ve? }` |
| `detalle` | la alternativa: un texto (se parte por líneas) o una lista de líneas ya hechas |
| `quien` | a quién preguntar |
| `depende` | una lista de ids de fila, de cualquier casa |

Una fila con alguna de ellas lleva **una** nota colgada de su tarea (en su 0), escrita por su casa con `anchor here`: su 0 es el título `nota de detalle` y su 1, líneas «etiqueta: valor» en este orden:

```
nota de detalle: <id de la fila>
base: <base>
paso 1: <hace>
paso 1 comando: <comando>
paso 1 ruta: <ruta>
paso 1 ve: <ve>
paso 2: …
detalle: <una línea>            (una por línea)
quien: <quien>
depende <id>: <texto de esa fila en la tabla>   (una por dependencia)
```

Las que no se dan no se escriben. Manda la última nota: si el detalle de la tabla cambia (o el texto de una fila de la que depende), se escribe otra; si no cambia, nada. Si la tabla retira todo el detalle de una fila, se escribe una nota vacía: `nota de detalle: <id>` y `sin detalle: la tabla ya no da detalle de esta fila`. La nota no es una corrección: no lleva la etiqueta del id de la fila, y la lectura de la última corrección (`leerLibro`) la aparta. Por eso la columna del id no puede llamarse como una etiqueta de la nota (`base`, `detalle`, `quien`, …). Las dependencias, por ahora, solo viven como líneas de esta nota; la relación de verdad, navegable y en el 7, es otra pieza con época propia.

**La lectura** (pura): `notaDeDetalle(eje, x, { correspondencia | columna })`, con `x` el id de la tarea (o su registro) o el id de la fila → `{ fila, base, pasos: [{ hace, comando?, ruta?, ve? }], detalle: [líneas], quien, depende: [{ id, texto }] }`, o `null` si no tiene nota o la última está vacía. La forma de la nota y la lectura por el registro (`NOTA`, `partirNota`, la de la carta) viven en el núcleo, `src/nota-detalle.js` (CONTRATO §12.9); el volcado las importa y reexporta.

**Las comprobaciones** (`comprobarTabla`), antes de escribir nada: un id de `depende` que no está en la tabla, una fila que depende de sí misma, un ciclo, la forma de las columnas de detalle y estos topes. Si alguna falla, **no se escribe nada**: el informe trae `comprobacion` (la lista) y un aviso por cada error («la tabla no se vuelca: …»). En el ensayo, una tabla que no pasa no arranca el primer volcado; con el libro ya hecho, se dice en la consola y el libro sigue como estaba.

| Tope | Valor |
|---|---|
| base | 500 caracteres |
| pasos | 30, y cada parte (hace, comando, ruta, ve) 500 caracteres |
| detalle | 60 líneas de 500 caracteres |
| quien | 200 caracteres |
| depende | 30 filas; un id con «: » o un salto de línea no se puede escribir en la nota |

En el ensayo, cuando cambia una fila, también se vuelven a mirar las que dependen de ella (su nota copia su texto).


## Las dependencias como relación de verdad (época del roadmap, VG 17-11)

La correspondencia gana `epoca`: el nombre de la época con que nace el libro (`EPOCAS` en `volcar.mjs`; hoy solo `"roadmap"`, la de `datos/epocas/roadmap/`). La del roadmap la lleva. Sin `epoca`, la 0 a secas, como siempre. El volcado no crea el libro: quien lo crea le pone `epocaDelVolcado(corr)` (`retoques/ensayo.mjs` en `crearCuenta`, la línea de órdenes en `Eje.genesis`, las pruebas).

Cuando la época del libro tiene la plantilla «this goes after» (`conCadenas(eje)`):

- **Cada tarea** lleva el tipo «task» en su 5 (`NOMBRES_DE_LAS_CADENAS.tarea`). Las correcciones y las notas, no.
- **Las relaciones** (solo en modo personas): por cada fila con `depende`, **un** registro «this goes after» de la casa de la tarea que depende, anclado en su **2.6**, con todas sus anteriores, en orden, en su 6 (y su número en el 1). Título llano: «va después de c2, c3». Se escriben **en una segunda pasada**, detrás de todo lo demás, cuando ya existen todas las tareas. Entran en la diferencia: manda la última; si la lista de anteriores de una fila cambia, se escribe otra; si se queda sin ninguna, una relación sin 6 («ya no va después de nada»). Una anterior que no llega al libro (su casa sin clave, un paso que no pasó) deja la relación en «no puede». Una casa sin clave: sus relaciones, como todo lo suyo, a «no puede». La nota de detalle conserva sus líneas «depende».
- **La lectura** es `cadenas(eje, X)` (`src/cadenas.js`, `docs/CONTRATO.md` §12.10). Una tarea está **hecha** solo con su cierre escrito: en el roadmap, la fase «comprobado» (`close`). «hecho» es `deliver`, que no la cierra: la siguiente sigue esperando hasta «comprobado».

Un libro que ya existe con la 0 a secas y una correspondencia que pide la época del roadmap no recibe nada de esto: ni tipo ni relaciones, y el informe empieza por un aviso llano («este libro nació con la época 0 a secas…: el libro se reescribirá entero, no se migra»). La nota de detalle sí se escribe.

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
