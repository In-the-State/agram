# Sitios y pesos en pantalla (fase 1: inventario y propuesta, 18-11)

Fila «1 bis» de `agram-equipo/OPINION_BOTONES_PV.md` §11: «Sitios y pesos en pantalla. Nada: hoy es tabla en código (dónde va cada punto de vista, medidas, orden de los rosetones). Al lenguaje no le falta nada. Es una fila de BTML y una preferencia mía. Irreducible: nada.»

La regla con la que se mide: es intérprete lo que no escribe un registro por su cuenta ni conoce una plantilla por su nombre. Aquí se le añade lo de esta fila: tampoco guarda en código una tabla que diga dónde va cada punto de vista, en qué orden ni cuánto se enseña. Lo que sí es suyo: medir lo que cabe en píxeles y pintar.

Esta nota no cambia código. Lo único que se ha ejecutado es una prueba de que el pintado del ejemplo es determinista (apartado 4).

## 1. Inventario

Medido sobre `carta/*.js` (sin `textos.js` ni `vendor/`) y `carta/estilo.css`, en el commit `04ae20a`. Las líneas son de ese commit.

**Clases:**
- **(a)** ya es dato en la época: la tabla del código sobra o la duplica;
- **(b)** puede ser dato con lo que hay;
- **(c)** es del dispositivo o del intérprete y se queda en la lente.

### Sitio: dónde va cada punto de vista

| # | Qué | Dónde | Qué decide | Quién lo lee | En la época | Clase |
|---|---|---|---|---|---|---|
| S1 | `GEOMETRIA` | carta.js:56-67 | De cada PV: `celda` [fila, columna] en el 3×3, `grupo` (x, cruz, núcleo), `lado` (orientación), `fila` (arriba, medio, abajo), `cara` (anverso, reverso: el 0 y el 5) y `borde` (dónde va el rosetón del 0 y del 5 en el ordenador) | carta.js: el reparto de Mapped (`deseos`, `repartir`, `ampliar`, 1853-1957), el aro (956-962), los rosetones (1739-1741), los retratos (480, 569, 659, 2112, 2263, 2757-2812), la pantalla completa (3011, 3024); dom.js (1548, 1604, 1679, 2455); app.js:171; estilo.css:275-276 y 459-461 (por `data-fila`, `data-columna`, `sitio-f*`, `sitio-c*`) | Solo `lado`, que indexa las orientaciones de `epoch.9.7.0.3` (centro, izquierda, derecha). Lo demás está escrito en prosa: la nota de 8.7 («↖1 ↗2 ↙3 ↘4») y la de 8.6 («esquina (1-4)», «lado (6-9)») | **b** |
| S2 | `CENTROS`, `LATERALES` | carta.js:68-69 | Cuáles van en el centro y cuáles alrededor. `CENTROS[0]` es el anverso y `CENTROS[1]`, el reverso | Unas 40 llamadas en carta.js; app.js:1355, 1414, 1420, 1479, 1583, 2287, 2303; dom.js:2377 | Se deducen de S1 | **b** (con S1) |
| S3 | `ORDEN_ROSETONES` | carta.js:1731 | El orden de los diez rosetones: 1 2 0 3 4 6 7 5 8 9 | `rosetonesDe` (1735) | No | **b** |
| S4 | `ARRIBA` | dom.js:1612 | Qué rosetones van en la tira de arriba del móvil: 1 2 0 3 4. Repite la primera mitad de S3 | `htmlRosetones` (1617) | No | **b** (va con S3; el duplicado sobra) |
| S5 | `ordenCruz` y la tira de la X | dom.js:2375-2377 | El orden de las franjas de la cruz (6, 8, 9, 7) y de la X en el móvil sin columna de Sequenced | `html` | Se deduce de S1 | **b**. Seguramente es código muerto: en apilada el árbol siempre trae `secuencia` (carta.js:2994). Se comprueba en la fase 2 |
| S6 | El orden de las filas de Sequenced | carta.js:2863 (`[...pvs].sort`) | Las filas del móvil van del 0 al 9 | `secuenciaDe`, la fila de dígitos (dom.js:1484) | 8.3 trae su propio orden por fila (por ejemplo 1 2 3 4 0 6 7 8 9), pero el código lo reordena | **b** |
| S7 | `zonaDelHilo`, `esPvDelPasado` | carta.js:2850, 1994 | Qué PV es el pasado (encima de la tarjeta) y cuál el futuro (debajo). En el pasado, las franjas van al revés (2524) y se lee el diario (2461) | `secuenciaDe`, `itemsDeBandas`, `franjasDeRejilla` | En prosa en la nota de 8.7 (6 y 7). Las filas dicen `order` «latest» y «soonest», pero eso es el orden de sus listas, no su sitio | **b** |
| S8 | `PV_CAMINO` y «la guía bajo la cruz de abajo» | app.js:171 (y 2635); dom.js:1548, 1604 | Dónde se pinta el camino y la guía, y dónde se abre el tutorial | La app y el pintado | **Sí:** la fila del 9 en 8.7 dice que su forma es «camino» en los dos modos. El código lo saca de la geometría | **a** |
| S9 | El orden de «hermano» | app.js:2287-2288 | Deslizar sobre un PV pasa al siguiente lateral en orden 1 2 3 4 6 7 8 9 | `manejadores.hermano` | Se deduce de S1 | **b** (con S6). Seguramente muerto: la línea 2286 sale antes en Mapped y en Sequenced |
| S10 | `POSICIONES` | carta.js:2068 | Los diez dígitos, del 0 al 9 | Los ejes de la matriz (2406-2407), `enElFoco` (2656) | Es la décupla misma | **c**: suelo del lenguaje, no una tabla de pantalla |

### Orden: qué se enseña primero

| # | Qué | Dónde | Qué decide | Quién lo lee | En la época | Clase |
|---|---|---|---|---|---|---|
| O1 | El orden en que se busca el destacado | carta.js:1091 | En qué punto de vista se busca primero la acción del primer paso mío del camino: del 0 al 9 | `destacadaDe` | No | **b** |
| O2 | La prioridad de la cabecera | carta.js:1117 | Primero la destacada, luego la acción por defecto y luego las demás | `cabeceraDe` | **Sí:** el orden de las acciones y cuál es la de por defecto son de la época. Poner primero la destacada es una regla del intérprete | **a** |
| O3 | Lo que se abre al empezar | app.js:2635; app.js:63 (`foco: { pv: 0 }`) | Una cuenta nueva abre el 9 en tarjeta (el tutorial). El foco empieza en el anverso | `crearCuenta`, el estado inicial | El anverso sale de S1 (`cara`); lo del tutorial, no | **b** |

### Peso: cuánto se enseña

| # | Qué | Dónde | Qué decide | Quién lo lee | En la época | Clase |
|---|---|---|---|---|---|---|
| P1 | `BOTONES_POR_NIVEL` | carta.js:1067 (`botonesDeNivel` 1070) | Cuántos botones con nombre lleva la cabecera de un PV: comprimido 0, tarjeta 1, bloque 3, abierto todas. También, en cuántas filas se busca el siguiente paso (12) | `cabeceraDe` (1113), `conPasosDeFila` (1156); dom.js:1626 | No. Su comentario ya dice «ES DATO» | **b** |
| P2 | `CUENTA_PROPONEN_A_LA_VISTA` | carta.js:318 | Cuántos «pueden proponer pagos» se ven antes de «y N más»: 3 | `cuentaDe` | No | **b** |
| P3 | `EJECUCIONES_EN_CELDA` | dom.js:550 | Cuántas ejecuciones se ven en una celda de la matriz del 4: 3 | `htmlEjecuciones` (853-854) | No | **b** |
| P4 | `EJECUCIONES_EN_CELDA_ABIERTA` | carta.js:2373 | Cuántas se ven en la celda abierta: 10 | `celdasDeMatriz` (2439) | No. Coincide con «load more» de 8.3.3, pero no se lee de ahí | **b** |
| P5 | `SERIES_EN_EL_PIE` | dom.js:509 | Cuántas series caben en el pie de un hijo del 1: 4 | `htmlRecursosDeHijo` (526-527) | No | **b** |
| P6 | El rosetón ampliado: `slice(0, 4)` | dom.js:1596 | Cuántos ocupantes enseña: 4 | `htmlRoseton` | **Sí:** carta.js:1749 ya pide los de la tarjeta de 9.5.2 («card», 4). El 4 de dom.js lo repite | **a** |
| P7 | `LIMITE_DE_ANIMACIONES` | carta.js:46 | Cuántas animaciones a la vez | `arbol` | **Sí:** la preferencia «animations» y su defecto en 9.3.7. La constante es el último respaldo | **a** (es la capa «archivo») |
| P8 | `NIVEL` y `nivelDeTabla` | carta.js:135, 1076; app.js:1414 | Los niveles de un PV: oculto, comprimido, tarjeta, bloque | Todo el pintado | **Sí:** los tamaños de 9.5.2 (slot, card, screen) más el «hidden» de 8.6. `NIVEL` es el vocabulario del verbo «cambiar de nivel» | **a** |
| P9 | Los pasos de tamaño de Mapped | carta.js:1840-1980 (`escalaDeTamanos`, `deseos`, `repartir`, `ampliar`) | Cuánta pantalla quiere cada PV en cada paso | `arbol` | **Sí:** 8.6 da los pasos, las fracciones y los datos. Cómo se reparte (la raíz de la fracción, quién gana) es del intérprete | **a** (el algoritmo, c) |
| P10 | Lista o matriz | `contrato.division`, desde `arbol` | El umbral alto/ancho (1,25) que separa Sequenced de Mapped | `arbol` | **Sí:** 8.3.2 | **a** |

### Medida: píxeles y umbrales

| # | Qué | Dónde | Qué decide | Clase y por qué |
|---|---|---|---|---|
| M1 | `MEDIDAS` | carta.js:76 y estilo.css:9 (`--hueco:48px; --tarjeta:160px`) | Hueco 48, tarjeta 160, línea 30 y la pantalla por defecto 400×700 | **c.** Son píxeles del dispositivo. Están dos veces, en JS y en CSS |
| M2 | `medidasDePantalla`, `ALTO_BAJO`, `FACTOR_MINIMO` y los mínimos 240×320 | carta.js:84-91; estilo.css:872-873 | El móvil apaisado bajo (menos de 500 px de alto) encoge hueco, tarjeta y línea | **c.** **No cuadran:** el JS calcula 48·k (con k el alto entre 500, como poco 0,6), y el CSS fija 36 y 110. Con 375 px de alto, el árbol mide la tarjeta en 120 y el CSS la pinta en 110 |
| M3 | `BLOQUE_MINIMO` | carta.js:98; estilo.css:821 (`--bloque-minimo:300px`) | El ancho mínimo legible del bloque de un marco | **c.** Está en los dos sitios |
| M4 | `tamanoQueCabe`, `capacidad`, `cabenEnPantalla` y el ancho de las cadenas | carta.js:335-343, 1981, 2978, 2567-2578 | Qué tamaño de la época cabe en N píxeles y cuántos datos caben en una caja | **c.** Medir lo que cabe es del intérprete |
| M5 | La capacidad de la guía; `HUECO` | guia.js:167-172; texto.js:22 | La pantalla que se describe al agente; la forma del hueco de la carta de texto | **c** |
| M6 | El aro | estilo.css:253-255 (148, 36, 120 y 64 px; `min(112px,29vw)`); app.js:736 y 1466 (`MARGEN` 8, 60) | Las medidas del aro y su recorte a la ventana | **c.** El sitio de cada chip sale de S1 |
| M7 | Los rosetones | estilo.css:236-239, 456-461 | Tamaños de 28, 22 y 40 px; la tira; la posición por `sitio-f*` y `sitio-c*` | **c.** La posición sale de S1 |
| M8 | Los umbrales de los gestos | gestos.js:20-32 | Mantener, doble toque, deslizar, pellizco, asa, arrastre | **c.** Son del dedo y del ratón |
| M9 | Las rejillas del CSS | estilo.css:135, 418, 426, 492, 1159, 1173 | Tres columnas en la disposición matriz; `minmax(110px…)`, `minmax(220px…)`; el corte de 520 px | **c** |

### Frontera

| # | Qué | Dónde | Clase |
|---|---|---|---|
| F1 | `FORMAS` | carta.js:2050-2061 | La geometría de cada forma: cruceta 2×2, rejilla de 3 columnas, matriz 10×10, cielo y camino en dos filas. Es de la fila 1 («la vista»), no de esta. Las cuatro sencillas (cruceta, escalera, columnas, rejilla) son **b**: son dos números. Las seis con lectura propia esperan al lenguaje |

**Fuera de esta fila** (se nombran para que no se pierdan):
- `PESOS` de guia.js:35: es el presupuesto de contexto del agente, no la pantalla.
- `CAPAS` de carta.js:2236: son claves de textos.
- `FILAS_MOVIBLES` de reglas.js:398: es la pantalla de reglas, que la fila 5 quita.
- En `src/`, no en la carta: `MATRIZ` de src/mapped.js:64 es otro 3×3 (1 8 2 / 6 5 7 / 3 9 4, con el 5 en el centro) que no coincide con S1. `MODOS` de src/modos.js:115 repite los mínimos y máximos de 8.2.

### Cuenta

**33 tablas:**

| Clase | Cuántas | Cuáles |
|---|---|---|
| (a) ya es dato | 7 | S8, O2, P6, P7, P8, P9, P10 |
| (b) puede serlo | 16 | S1-S7, S9, O1, O3, P1-P5, F1 |
| (c) se queda en la lente | 10 | S10, M1-M9 |

Las (a) se quitan leyendo lo que la época ya dice; no hace falta dato nuevo.

## 2. Por qué cada (c) se queda

- **Píxeles (M1-M7, M9):** el dato dice qué celda, qué orden y cuántos. Cuántos píxeles mide una tarjeta en este aparato lo decide el aparato. Un libro que dijera «160 px» se vería mal en un reloj y en una tele.
- **Gestos (M8):** son del cuerpo y del aparato. La tabla de gestos (qué gesto llama a qué verbo) sí es dato, pero es otra fila.
- **Los diez dígitos (S10):** son el lenguaje. Un libro no puede tener nueve.
- **El reparto de Mapped:** la raíz de la fracción, que cada eje sume 1 y que gane el más reciente es lo que garantiza que nunca haya scroll. Es el intérprete encajando pesos.

Hay que arreglar dos cosas aunque sean (c):
- M1 y M3 están en JS y en CSS. Lo limpio es que la app ponga `--hueco`, `--tarjeta` y `--bloque-minimo` desde el JS, y que el CSS no los repita.
- M2 no cuadra entre el JS y el CSS.

Ninguna de las dos es de esta fila. Arreglarlas cambia píxeles, así que van aparte.

## 3. La forma del dato

### Dónde, en la época

En `epoch.9.5` («representation»), que ya trae los colores por PV (9.5.4) y tiene libres del 6 al 9:
- **`epoch.9.5.6` «places»:** el sitio de cada PV. Una fila por PV con la forma de las de 8.7 (#77, claves y valores): `[[pv], [fila, columna], [nota], [claves], [valores]]`. Así sirve el mismo lector (`atributosDeFila`).
- **`epoch.9.5.8` «lens»:** los pesos y los órdenes. Una sola fila de claves y valores: `[[lens], [qué es], [nota], [claves], [valores]]`. Una clave que se repite junta sus valores en orden.

Una hija hereda 9.5 por posición, como ya hacen roadmap y state con 8 y 9. Así puede traer solo su 9.5.6 o su 9.5.8.

**Lo que no se escribe** porque lo da la celda (lo hace el intérprete, que sabe qué es una esquina en un 3×3):
- **el grupo:** esquina es X, lado es cruz, centro es núcleo;
- **la fila:** 0 arriba, 1 medio, 2 abajo; en los centros, ninguna, como hoy.

Para pintar lo mismo, el lector devuelve los centros con el anverso primero y los laterales del 1 al 9, como `Object.keys(GEOMETRIA)`.

### El orden de lectura

1. **Mi preferencia**, en mi libro de cuenta: un registro de la plantilla «lens settings» en el 9 de mi alta. Solo dice las claves que escribo; lo que no digo, no lo pisa.
2. **La época del libro:** 9.5.6 y 9.5.8.
3. **La época 0:** lo mismo, tras la pasada única.
4. **El archivo por defecto** de la carta.

- **9.5.8 se resuelve clave a clave:** cada clave sale de la primera capa que la dice bien.
- **9.5.6 se resuelve entera:** la tabla de sitios sale de la primera capa que trae una tabla válida entera. Mezclar celdas de dos capas puede poner dos PV en la misma celda.

**El archivo** va en `datos/lente/lente-0.json`, fuera de `datos/epocas/`. Es un objeto con el camino de la época como clave y el valor BTML exacto que tendrá esa posición. Al congelar, cada valor se pega en su camino de la 0 sin tocarlo, y el archivo se borra para que no haya dos fuentes.

**El lector** va en `src/contrato.js`, con los demás caminos de la época (`SITIO`): `contrato.sitios(eje, yo, opciones)` y `contrato.pesos(eje, yo, opciones)`, con el suelo del apartado 5 dentro. La carta deja de tener la tabla y lee lo que le da el árbol.

**Un hueco:** hoy las preferencias se leen en el alta del libro abierto (`contrato.configuracion(eje, yo)`), no en el libro de cuenta. No he mirado si la app tiene a mano el eje del libro de cuenta con otro libro abierto. Hasta que lo tenga, la capa 1 se lee en el alta del libro abierto, como «guide settings» (`contrato.configuracionDe`).

### Ejemplo 1, escrito entero: `epoch.9.5.6` «places» (lo que hoy es `GEOMETRIA`)

```json
[
  ["places", "where each point of view sits on the screen (VG 18-11): one row per point of view, [[pv], [row, column] of its cell in the 3 × 3 of the scene, [note], [keys], [values]]; a corner is the X, an edge the cross, the centre the 0 and the 5 (the lens reads it from the cell: it is not written); «side» is its orientation in epoch.9.7.0.3; «face», front or back, for the two in the centre; «edge row» and «edge column», where its rosette goes on a wide screen when it is not its own cell; «time», past or future, the two halves of the thread in Sequenced. The whole table or none: it is read whole from the first layer that brings a valid one"],
  [
    [[0], [1, 1], ["el anverso: el elemento; su rosetón, arriba al centro"], ["face", "side", "edge row", "edge column"], ["front", 0, 0, 1]],
    [[1], [0, 0], ["↖ arriba a la izquierda"], ["side"], [1]],
    [[2], [0, 2], ["↗ arriba a la derecha"], ["side"], [2]],
    [[3], [2, 0], ["↙ abajo a la izquierda"], ["side"], [1]],
    [[4], [2, 2], ["↘ abajo a la derecha"], ["side"], [2]],
    [[5], [1, 1], ["el reverso: el JSON del registro; su rosetón, abajo al centro"], ["face", "side", "edge row", "edge column"], ["back", 0, 2, 1]],
    [[6], [1, 0], ["← el pasado: encima de la tarjeta en Sequenced; sus franjas, la más lejana a la izquierda"], ["side", "time"], [1, "past"]],
    [[7], [1, 2], ["→ el futuro: debajo de la tarjeta en Sequenced"], ["side", "time"], [2, "future"]],
    [[8], [0, 1], ["↑ arriba"], ["side"], [0]],
    [[9], [2, 1], ["↓ abajo"], ["side"], [0]]
  ],
  ["VG 18-11 (fila 1 bis de agram-equipo/OPINION_BOTONES_PV.md §11): lo que era GEOMETRIA en carta/carta.js, con los mismos valores; el grupo y la fila no se escriben porque los da la celda; el PV del camino no está aquí porque lo dice su forma en 8.7"]
]
```

### Ejemplo 2, escrito entero: `epoch.9.5.8` «lens» (`BOTONES_POR_NIVEL` y las demás b)

Los nombres de los niveles son los de 9.5.2 (slot, card, screen). «open» es la cabecera del foco, que hoy enseña todas.

```json
[
  ["lens"],
  ["how much the card shows and in what order (VG 18-11): the named buttons of a point of view at each size of epoch.9.5.2 and open (a number, or all), in how many rows the next step is looked for, the order of the rosettes and the ones in the top strip of a narrow screen, the order of the rows in Sequenced, the order in which the highlighted action is looked for, how many of each list are shown before «and N more», and what opens at the start. A key that repeats joins its values in order. Read key by key: the person's «lens settings», the epoch of the book, epoch 0"],
  ["VG 18-11: lo que eran BOTONES_POR_NIVEL, ORDEN_ROSETONES, ARRIBA, el orden de Sequenced y del destacado, CUENTA_PROPONEN_A_LA_VISTA, EJECUCIONES_EN_CELDA, EJECUCIONES_EN_CELDA_ABIERTA, SERIES_EN_EL_PIE y el tutorial del alta nueva, en la carta, con los mismos valores"],
  ["buttons slot", "buttons card", "buttons screen", "buttons open", "next steps in rows",
   "rosette order", "rosette order", "rosette order", "rosette order", "rosette order", "rosette order", "rosette order", "rosette order", "rosette order", "rosette order",
   "top strip", "top strip", "top strip", "top strip", "top strip",
   "sequenced order", "sequenced order", "sequenced order", "sequenced order", "sequenced order", "sequenced order", "sequenced order", "sequenced order", "sequenced order", "sequenced order",
   "highlight search", "highlight search", "highlight search", "highlight search", "highlight search", "highlight search", "highlight search", "highlight search", "highlight search", "highlight search",
   "proposers shown", "executions in cell", "executions in open cell", "series in footer",
   "open at start", "open at start size"],
  [0, 1, 3, "all", 12,
   1, 2, 0, 3, 4, 6, 7, 5, 8, 9,
   1, 2, 0, 3, 4,
   0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
   0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
   3, 3, 10, 4,
   9, "card"]
]
```

**Otra forma posible para los botones:** una cuarta columna en las filas de 9.5.2 (`[[2], ["card"], [4], [1]]`: datos y botones de cada tamaño). Se lee bien, «cuánto enseña cada nivel», pero cambia una posición que ya existe y deja fuera «open» y las filas. Prefiero la fila nueva.

### La preferencia: la plantilla «lens settings» (esbozo, para la pasada única)

Va en la 0, junto a «preferences» (9.3), para que exista en el libro de cuenta, que hereda de la 0. Cada posición lleva por etiqueta la misma clave que 9.5.8.

**Sin defectos:** lo que no escribo no lo digo y vale la capa siguiente. Es la regla de #77: quitar un ajuste es no escribirlo.

```json
[
  [["lens settings"], ["text"], ["any"], ["owner"], ["write"], ["0"], ["VG 18-11: mis pesos de la lente, en el 9 de mi alta; valen en todos mis libros"], ["required"], ["arrival"], ["lens settings", "my lens: how many buttons and in what order; what I do not write, the book says"]],
  [["buttons slot"], ["number"], ["any"], ["owner"], ["write"], ["1"], ["-"], ["optional"], ["arrival"], ["named buttons of a point of view at the slot size"]],
  [["buttons card"], ["number"], ["any"], ["owner"], ["write"], ["2"], ["-"], ["optional"], ["arrival"], ["named buttons at the card size"]],
  [["buttons screen"], ["number"], ["any"], ["owner"], ["write"], ["3"], ["-"], ["optional"], ["arrival"], ["named buttons at the screen size"]],
  [["buttons open"], ["text"], ["any"], ["owner"], ["write"], ["4"], ["-"], ["optional"], ["arrival"], ["named buttons of the focus: a number or all"]],
  [["type"], ["text"], ["any"], ["owner"], ["write"], ["5"], ["B4"], ["required"], ["arrival"], ["its type: this template"]],
  [["next steps in rows"], ["number"], ["any"], ["owner"], ["write"], ["6"], ["-"], ["optional"], ["arrival"], ["in how many rows the next step is looked for"]],
  [["rosette order"], ["number"], ["any"], ["owner"], ["write"], ["7"], ["-"], ["optional"], ["arrival"], ["the ten rosettes, in order"]],
  [["top strip"], ["number"], ["any"], ["owner"], ["write"], ["8"], ["-"], ["optional"], ["arrival"], ["the rosettes of the top strip on a narrow screen"]],
  [["sequenced order"], ["number"], ["any"], ["owner"], ["write"], ["9"], ["-"], ["optional"], ["arrival"], ["the rows of a narrow screen, in order"]]
]
```

**Lo que propongo que no pueda cambiar la persona:**
- **Las celdas (9.5.6):** los textos y la guía de un libro hablan de sitios («arriba a la izquierda»).
- **Lo que se abre al empezar:** es del libro y de su tutorial.
- **Las cuentas de listas** (proponen, ejecuciones, series) **y la búsqueda del destacado:** son del libro.

Es la decisión 2.

### Qué filas tiene que ganar la época 0 en la pasada única

- `epoch.9.5.6` «places», tal cual el ejemplo 1.
- `epoch.9.5.8` «lens», tal cual el ejemplo 2.
- 9.5.7 y 9.5.9 quedan libres (o para sus notas, como hacen 9.5.3 y 9.5.5).
- La plantilla «lens settings» en 9.2, junto a las de configuración.
- Sus textos (`label`, `help` y el nombre de la plantilla) en es y en en, en 9.4.
- Ninguna de las (a) pide fila nueva. S8 y P6 a P10 ya están en 8.3, 8.6, 8.7, 9.3.7 y 9.5.2.

## 4. Mover sin que cambie un píxel

**El argumento:** si el HTML que sale de `html(arbol(…))` es idéntico byte a byte y `estilo.css` no cambia, la pantalla no cambia. El CSS ya pinta por `data-fila`, `data-columna`, `sitio-f*`, `sitio-c*` y `data-roseton`, que salen de los datos. Lo que no pasa por el HTML (lo de app.js) se fija aparte.

**Comprobado hoy:** el pintado del ejemplo es determinista. `ejemploCompra()`, quien mira «huesped», el reloj fijo `2026-11-08T10:00:00Z` y `html(arbol(…))` dieron la misma huella sha256 en dos procesos distintos, en 400×700, 800×375, 1200×800 y 1920×1080. Así que se puede guardar la huella en una prueba.

### Paso 0: la foto, antes de mover nada

Un commit que solo añade `test/sitios-y-pesos.test.js`:

1. **Los valores de hoy, escritos literalmente en la prueba:** `GEOMETRIA`, `CENTROS`, `LATERALES`, `ORDEN_ROSETONES`, los cinco `botonesDeNivel`, y el 3, 3, 10 y 4 de P2 a P5. Además, que lo que la propuesta deja de escribir se deduce sin pérdida:
   - el grupo y la fila de `GEOMETRIA` salen de la celda (con la fila vacía en los centros);
   - el PV de la forma «camino» de 8.7 es `PV_CAMINO`, en sequenced y en mapped;
   - el 4 del rosetón es `tamanos()[1].datos`.
2. **Las funciones puras que leen las tablas:**
   - `repartir`, `ampliar` y `ampliarTodos`, para cada PV, cada paso y tres órdenes de «recientes»;
   - `escalaDeTamanos`;
   - `medidasDePantalla` sobre una lista de pantallas.
3. **La huella del HTML** del ejemplo, una sha256 por caso, escrita en la prueba. Los casos:
   - cuatro pantallas: 400×700, 800×375, 1200×800 y 1920×1080;
   - el estado inicial;
   - cada rosetón en 2 y en 3;
   - cada PV abierto en Sequenced;
   - cada PV en el tope de Mapped;
   - cada PV a pantalla completa;
   - todos +1 y +2;
   - el aro abierto sobre el foco;
   - el foco en el reverso;
   - una cuenta nueva con el 9 en tarjeta.

   Unos cuarenta casos bastan, uno por cada cosa que lee una tabla. Se pasa en tandas de un archivo, con `timeout`.
4. **`test/carta-acciones-vista.test.js:35-38`**, que ya fija `BOTONES_POR_NIVEL`, se queda. En el paso 2 pasa a leer el lector.

### Pasos 1, 2 y 3: mover

| Paso | Qué se hace | Qué tiene que pasar |
|---|---|---|
| 1 | El archivo y el lector (con el suelo). Una prueba: el lector, sin libro ni preferencia, da exactamente los valores de la foto | La foto sigue verde |
| 2 | La carta lee del lector y desaparecen las constantes. Como la tabla depende ya del libro, deja de ser una constante del módulo: va en el `ctx` y en el árbol. La app lee del último árbol, no importa `GEOMETRIA` | Las mismas huellas |
| 3 | Pruebas nuevas: un libro con otra tabla válida cambia lo que debe; uno hostil cae a la capa siguiente y su huella es la de hoy; una preferencia pisa al libro clave a clave | — |

**Al paso 2 hay que avisarle:** toca el aro (`nodoAro`, carta.js:956-962), la misma zona que está tocando otro agente. Hay que hacerlo después de su entrega o coordinado.

**Una guarda que se puede añadir:** un apartado en `test/lente-limpia.test.js` con los nombres que tienen que desaparecer (`GEOMETRIA`, `ORDEN_ROSETONES`, `ARRIBA`, `BOTONES_POR_NIVEL`, `CUENTA_PROPONEN_A_LA_VISTA`, `EJECUCIONES_EN_CELDA`, `EJECUCIONES_EN_CELDA_ABIERTA`, `SERIES_EN_EL_PIE`). Igual que la deuda de nombres, solo puede encoger.

**Lo que la huella no cubre:**
- **El pintado animado:** carga el arte del marco, y la foto se hace en sobrio.
- **La posición del aro anclado:** la calcula app.js en el navegador con `getBoundingClientRect`.

Las dos quedan para una mirada en el navegador cuando se pueda usar.

## 5. Riesgos y el suelo

**Lo que puede traer un libro ajeno:**
- Un PV en la celda (7, -3), o dos laterales en la misma celda (uno tapa al otro y el aro pierde un sitio).
- El 0 fuera del centro.
- Un orden de rosetones sin mi 1, con lo que mi cartera desaparece.
- «buttons screen: 0» en todo, para que no se vea ninguna acción.
- «next steps in rows: 1000000», que hace un `motor.siguiente` por fila y deja el pintado lento.
- «open at start» en pantalla completa, que tapa el foco al entrar.

**El suelo** es lo que ninguna capa puede redefinir. Lo aplica el lector, no el dato, como 8.8 hace con los límites de cálculo («the core takes the lesser of each and its own constant»). Es suelo de coherencia, no una garantía social (decisión de VG del 17-11: sin protecciones fijas).

1. **El dato no direcciona nada fuera de la escena.** Su espacio son las nueve celdas del 3×3 de la escena (fila y columna de 0 a 2) y el orden de diez rosetones. No hay píxeles, ni CSS, ni orden de apilado. Fuera de la escena, en un marco que ninguna tabla nombra, están:
   - en qué libro estoy, la bandeja, componer y ejecutar, volver y salir;
   - los avisos y el guardián;
   - el formulario y el resumen de lo que se firma (que se saca de la transacción misma, §11).

   Que algo quede fuera de pantalla es imposible por construcción.
2. **El 3×3 está entero o no vale:**
   - los ocho laterales (1-4 y 6-9) ocupan las ocho celdas que no son el centro, una cada uno;
   - el 0 y el 5 van en el centro, uno «front» y otro «back»;
   - `side` es 0, 1 o 2; `edge` cae dentro del 3×3;
   - `time`: como mucho un «past» y un «future».

   Si falla, se ignora entera la 9.5.6 de esa capa y se usa la de la siguiente. La carta da un aviso discreto: «este libro trae sitios que no valen; se usan los de la época 0».
3. **Los órdenes nunca esconden un PV:**
   - «rosette order», «sequenced order» y «highlight search» tienen que ser permutaciones del 0 al 9: un orden con un dígito repetido o que falta no vale y esa clave cae a la capa siguiente (Core 18-11; antes se proponía arreglarlo);
   - «top strip» es una parte de los dígitos, sin repetir; si no, cae igual;
   - Sequenced enseña siempre todos los PV que da 8.3; el orden solo los ordena.
4. **Las cuentas:**
   - Son un entero de 0 en adelante, o «all»; lo demás es «no lo dice».
   - Las que cuestan se topan con una constante del intérprete, como en 8.8 (propuesta: «next steps in rows» como mucho 50). Las demás no cuestan, porque ya se recortan a lo que hay.
   - Con 0 botones, las acciones siguen a mano: el «+n» se pinta siempre que haya resto, y el aro lleva todas.
5. **«open at start»** abre como mucho en tarjeta. Nunca en pantalla completa: el foco se ve al entrar.
6. **Mi preferencia va por encima del libro:** un libro hostil no deshace mis pesos ni mis órdenes. Las celdas no están en la preferencia (decisión 2).

**Un riesgo vecino que ya existe:** el estilo de un libro (el `style` de 8.7, X.0.9 y 5.0) ya es dato y pasa por `cssSeguro`.
- `cssSeguro` no deja `position`, `z-index`, `transform` ni `inset`, pero sí `margin` negativo, `width` y `box-shadow`.
- En Mapped no pasa nada: la escena y cada celda recortan (`overflow:hidden`, estilo.css:408-412).
- En Sequenced, `.carta-apilada .escena` no recorta. Un bloque podría tapar a la vista algo de fuera con una sombra enorme. No lo he probado en el navegador.
- Propuesta: `overflow:clip` o `contain:paint` también en la escena apilada. Es una línea de CSS, cambia píxeles solo en ese caso y va aparte.

## 6. Decisiones que pido

1. **Dónde en la época:**
   - `epoch.9.5.6` «places» y `epoch.9.5.8` «lens», junto a los colores por PV (9.5.4), en lugar de claves nuevas en las filas de 8.7 (que son la división de cada mundo por dentro);
   - la plantilla «lens settings» en la 0;
   - el archivo `datos/lente/lente-0.json` mientras tanto, que se borra al congelar.
2. **Qué puede cambiar la persona en su libro de cuenta:**
   - **sí:** los pesos (botones por tamaño, filas) y los órdenes (rosetones, la tira, Sequenced);
   - **solo el libro:** las celdas de los PV, lo que se abre al empezar, las cuentas de listas y la búsqueda del destacado.
3. **El suelo del apartado 5:**
   - el 3×3 entero o nada, a la capa siguiente;
   - permutaciones que no esconden ningún PV;
   - el «+n» y el aro siempre;
   - el marco fuera del alcance del dato;
   - mi preferencia por encima del libro.

**Menores** (Core las puede cerrar):
- El orden de Sequenced: sigue del 0 al 9 (clave nueva) y no obedece el orden de 8.3, que cambiaría la pantalla.
- S5 y S9 parecen código muerto: se borran en el paso 2 si las pruebas lo confirman.
- El desajuste de M2 y el duplicado de M1 y M3 entre JS y CSS van aparte, porque cambian píxeles.

## 7. Qué no he mirado

- **El navegador:** no se ha usado.
- **El pintado animado y el arte:** la huella comprobada es en sobrio.
- **`carta/textos.js`:** solo son textos. No he buscado si alguno nombra un sitio («arriba a la izquierda»), y eso importa para la decisión 2.
- **`src/`:** solo los lectores de la época que usa la carta, y las dos tablas que se nombran arriba. No he mirado sus otros 3×3 a fondo.
- **`servidor/`, `retoques/`, `sw.js`:** no he mirado nada. De `sw.js` solo su lista de precarga: guarda cada módulo al primer uso, así que un archivo nuevo no debería pedir tocarlo, pero se comprueba en la fase 2.
- **Las épocas hijas:** solo he visto que heredan 9.5 entera y que roadmap cambia 8.7. No he leído sus filas.
- **El libro de cuenta con otro libro abierto:** no he mirado si la app lo tiene cargado (el hueco del apartado 3).

## 8. Estado (18-11, noche)

Core decidió las tres cosas del apartado 6 como supuestos, reversibles, que hay que confirmar con VG:
- 9.5.6 y 9.5.8 con la forma de esta nota;
- la persona solo dice pesos y órdenes;
- el suelo, como está, y además: una tabla de sitios hostil o incompleta cae entera a la capa siguiente y el lector nunca lanza.

La época 0 no se toca hasta la pasada única.

**Hecho:**
- **Paso 0:** `test/sitios-y-pesos.test.js`, con la FOTO en `test/ayudas-sitios.mjs`. Trae 43 huellas, que se regeneran a propósito con `AGRAM_HUELLAS=1`.
- **Paso 1:**
  - el dato en `datos/lente/lente-0.json` y su copia importable `lente-0.js` (`node datos/lente/generar.mjs`, como `datos/efectos.js`);
  - el lector en `src/sitios.js`, reexportado como `contrato.sitios` y `contrato.pesos`, con el suelo dentro;
  - sus pruebas en `test/lente-lector.test.js`.
- **La capa de la preferencia:** solo está el hueco, `opciones.preferencia`.

**Pendiente:** el paso 2, que la carta lea del lector. Espera a que se funda el carril del aro.

## 9. Paso 2: la carta lee del dato (19-11)

Siete commits, uno por grupo de tablas. Las 43 huellas siguieron iguales en cada uno, sin regenerarlas.

| Commit | Qué sale del dato |
|---|---|
| 2a | Botones por nivel y cuentas de listas: P1-P5 |
| 2b | Órdenes y lo que se abre al empezar: S3, S6, O1, O3 |
| 2c | Dos de clase (a): el PV del camino, por su forma en 8.7 (S8), y el 4 del rosetón, la tarjeta de 9.5.2 (P6) |
| 2d | El código muerto: S4, S5, S9 |
| 2e | Los sitios en carta.js, fuera del aro: S1, S2, S7 |
| 2f | app.js y dom.js |
| 2g | El aro |

**Cómo funciona:**
- **El lector, una vez por pintado:** `arbol` lee `contrato.sitios` y `contrato.pesos` una sola vez y los pasa hacia abajo en `ctx.sitios` y `ctx.pesos`.
- **El árbol los lleva:** van en `lente` (`{ sitios, pesos, camino }`).
  - `dom.js` los fija al empezar `html()`, como ya hace con los archivos.
  - `app.js` los lee del último árbol pintado.
- **Las exportadas:** `GEOMETRIA`, `CENTROS`, `LATERALES`, `ORDEN_ROSETONES` y `BOTONES_POR_NIVEL` siguen exportadas, pero ya no son tablas: son la vista de sin libro del lector, para las pruebas y para lo que va fuera de un pintado.
- **El reparto de Mapped:** recibe los sitios como opción (`ampliar`, `ampliarTodos`, `repartir`).
- **Comprobado con un libro distinto:** una prueba usa un libro cuya época cambia sitios, hilo y orden. Cambia la caja de Mapped, el sitio en el aro, el pasado del hilo y el orden de las filas del móvil.

**Hallazgos:**
- **Código muerto.** En el móvil (apilado) el árbol trae siempre su secuencia y nunca rosetones; una prueba lo comprueba. Por eso no se pintaban ni las tiras de rosetones del móvil (`ARRIBA`) ni las franjas de la cruz y de la X, y «hermano» sobre un PV no hacía nada. Se han quitado.
  - Las reglas de `estilo.css` que las pintaban (`.rosetones-arriba`, `.rosetones-abajo`, `.franja-cruz`, `.franja-x`) quedan sin uso. No las toco: estilo.css es de otro carril.
  - La clave «top strip» de 9.5.8 ya no la lee nadie: se quitó el 20-11 (§10).
- **La pasada única por la época 0.** La época no admite huecos (`cargarEpocaBtml`: «hueco»). Si entran 9.5.6 y 9.5.8, 9.5.7 tiene que ir lleno, con una nota, como 9.5.3 y 9.5.5.
- **El anverso como dígito 0 en app.js.** Los estados iniciales de app.js siguen escribiendo el anverso como el dígito 0 (`foco: { pv: 0 }`, `irA(X, 0)`). No era una constante; el paso 2 no lo toca. Hoy da igual, porque el suelo exige que el 0 y el 5 estén en el centro, pero no que el 0 sea el anverso. Si un libro dijera que el 5 es el anverso, el foco empezaría en su reverso.

**Esperan a VG** (apuntados, sin tocar):
- **El desajuste del móvil apaisado:** el JS mide la tarjeta en 120 px con 375 de alto y el CSS la pinta en 110.
- **El estilo de un libro** que tapa fuera de su caja en el móvil.

**Siguen en código, y por qué:**
- **Los píxeles y los umbrales (M1-M9):** son del aparato.
- **Los diez dígitos (POSICIONES):** son el lenguaje.
- **Las formas (F1):** son de la fila 1.
- **El suelo del lector:** no puede depender del libro que se lee.
- **La preferencia de la persona:** sin construir; solo está el hueco.

## 10. Limpieza y deuda de la lente (20-11)

**Hecho:**
- **Restos muertos, fuera:**
  - la clave «top strip» del dato de la lente, de su copia generada y del lector (hoy es una clave desconocida);
  - de estilo.css, las reglas `.rosetones-arriba`, `.rosetones-abajo`, `.franja-cruz`, `.franja-x` y las de `.franja`. Ya no se emiten: lo he comprobado buscando en carta/, src/ y test/.
- **app.js abre por el anverso de la lente:**
  - el estado de partida y un libro recién puesto en pantalla usan `anversoDe(eje)`;
  - `irA`, sin pv, usa el anverso de los sitios del árbol pintado.
  - Ya no queda el dígito 0.
- **La foto, con 4 huellas más («otras · …»).** Ya cubre los cuatro pesos que no se veían:
  - las filas con siguiente paso (el jardín y el parque);
  - la matriz del 4, cerrada y con la celda 4.4 abierta (la fábrica);
  - quién puede proponer pagos (la cuenta del banco).

  Cambiando a mano cada uno de esos pesos en el dato, se mueve su huella.
- **La deuda de nombres baja de 15 a 14:** «attach a file» sale de la carta. La acción que adjunta el HTML inicial se lee de la época: la que se ancla en el 0 y pide un archivo (faceta «ref»). Los valores salen de las facetas y del 1.0 de la representación.

**Lo que queda en NOMBRES_DE_HOY, y qué capacidad general falta** (cada caso pide una decisión de diseño; no lo he tocado):

| Nombres | Dónde | Qué falta |
|---|---|---|
| «message in», «message in from an agent», «message out» | carta.js `MENSAJES_QUE_RESERVAN` | «Va antes» como dato de la plantilla: la reserva antes del mensaje. Hoy lo sabe código de la época state (`ayuda.mjs`), que trataría cualquier acción como un mensaje. Se escribe en `datos/epocas/state`, que hoy no se toca |
| «register a thing» | app.js, tras ejecutar la bandeja | «Va después» como dato: tras registrar una cosa, adjuntar su HTML inicial. Es zona de la bandeja |
| «move to group» | app.js `reclasificar` (arrastrar una persona entre cajas del 3) | La tabla de gestos como dato: «soltar en una caja es crear ahí lo que la época permita sobre esa persona». La plantilla se ancla en «3.{zone}.3» con la caja como agujero; elegirla por su ancla es la decisión de la tabla de gestos |
| «second factor» | app.js `configurar` | Que la configuración sea formularios en su punto de vista (la fila 5: las pantallas fijas sobran). Antes, Core AGRAM decide si es suelo: está en «dudosos» de `NUCLEO_Y_ACCIONES.md` |
| «add a parent», «remove a parent», «set a custody default», «set the kind of owner», «set a group price», «set a minimum», «set a minimum rank» | reglas.js `AJUSTES` | La pantalla fija «Ajustes de este elemento» como formularios en su punto de vista (la fila 5), y una lectura de la época por ajuste para «lo fijado» |
| «let P come down here» | reglas.js `SI_DEL_DUENO` y su BQL escrito en la carta | Una lectura con nombre en la época, «quién tiene el sí del dueño». La expresión es BQL escrito en la carta porque la época no tiene esa lectura |

`motor.loQueFalta`, `motor.pasosDeLasReglas`, los finales como dato y `cohortes()` no quitan ningún nombre de la carta. Ninguno de los 14 los usa: la carta ya leía el camino y las cohortes del núcleo. Lo que esas capacidades bajan es la deuda del núcleo (`NUCLEO_Y_ACCIONES.md`, clase B), no la de la lente.

Los controles por tipo base del formulario (número, instante, identidad) son dispositivo (fila 3: un control por tipo). Además están en la zona de dom.js de otro carril.

## 11. La deuda de nombres de la lente, de 14 a 3 (20-11)

Con el patrón del dato provisional del núcleo (`datos/provisional/`: un JSON más su copia generada, que importa `src/provisional.js`), dos archivos nuevos que lee `contrato`:

| Dato provisional | Qué dice | Quién lo lee | Sitio final (pasada única) |
|---|---|---|---|
| `ajustes.json`, «element settings» | Las siete acciones con que un elemento fija lo suyo: añadir y quitar un padre, un defecto de custodia, la clase de dueño, el precio de un grupo, el mínimo y el rango mínimo de una caja del 3 | `contrato.accionesDeAjuste`, desde la pantalla «Ajustes de este elemento» (`carta/reglas.js`) | Ninguno fijo: esa pantalla se irá cuando los ajustes sean formularios en su punto de vista (la fila 5) |
| `antes-y-despues.json`, «goes before» y «goes after» | Antes: los tres mensajes piden «a reserve» delante. Después: tras «register a thing» va «attach a file» | `contrato.antesDe` (`antesDelMensaje`, carta.js) y `contrato.despuesDe` (`trasEjecutar`, app.js) | La época que define esas acciones: la hija state para los mensajes, y la 0 para registrar una cosa |

Los lectores están en `src/lente-provisional.js` y se reexportan en `contrato`. Se borran con lo provisional en la pasada única.

**Quedan 3 nombres. Los tres esperan una decisión:**

| Nombre | Qué falta |
|---|---|
| «move to group» | La tabla de gestos con su destino: «soltar a una persona en una caja del 3 es lanzar lo que la época ofrece ahí» |
| «second factor» | Que la configuración sea formularios en su punto de vista, y que Core decida si es suelo |
| «let P come down here» | Una lectura con nombre en la época, «quién tiene el sí del dueño». Hoy es BQL escrito en la carta |

**Hallazgos:**
- **El dato dice qué hace falta, el código cómo.** Que un mensaje pida una reserva es dato. Cuándo la pide y con qué parámetros lo sigue calculando código de la época state (`registrosParaUnMensaje`). Para que sea dato entero haría falta escribir en la época state la regla «va antes» con sus parámetros, y eso es tocar `datos/epocas/state`.
- **Los nombres de los hitos solo están en español.** El botón de ejecutar apagado dice ahora el nivel que lo enciende por su nombre: `contrato.botonDeEjecutar` lleva `marca.nombre`. Pero esos nombres solo existen en español, en el núcleo (`src/bases.js`, `HITOS`). Hoy da igual, porque los textos de la carta solo están en español. Con otro idioma haría falta llevarlos a los mensajes de la época.

## 12. Los hitos en dos idiomas y la deuda de nombres en 1 (20-11)

**Hecho:**

| Qué | Dato provisional | Quién lo lee | Dónde iría en la pasada única |
|---|---|---|---|
| Los nombres de los diez hitos nivel.grado, en inglés y en español | `datos/provisional/hitos.json`: los niveles y, por idioma, «milestone <nivel>: nombre» | `contrato.nivelesDeLosHitos` y `contrato.nombreDelHito(nivel, idioma)`; `src/bases.js` construye `HITOS` desde ahí | Los textos de cada idioma de epoch.9.4, con la clave «milestone <nivel>» (el registro «en», el canónico). Los niveles pueden quedarse en el núcleo (son el mapa §2.2) o ir a la fila del 8 de 8.7, que ya trae un «link» por caja |
| Quién tiene el sí del dueño | `lecturas-de-la-lente.json`: la lectura «who has the owner's yes», con el molde de una regla de lectura; y `si-del-dueno.json`, que dice la acción y esa lectura | `contrato.datosDelSiDelDueno` y `contrato.lecturaDeLaLente` (carta/reglas.js) | Las lecturas de la época 0, junto a «chosen cohort». Hoy no se materializa en ninguna posición; dónde lo hará lo decide la pasada |
| Qué hace soltar a una persona en una caja del 3 | `destinos-de-gestos.json`: el gesto, el punto de vista (3), la acción, sus parámetros con lo que el gesto da para cada uno, y sobre qué registro se lanza | `contrato.destinoDeGesto` (app.js `reclasificar`) | Junto a la lista cerrada de gestos (`gestos.json`), en la época 0 |

`contrato.escalera`, las cajas de los hitos, `contrato.rango` y `botonDeEjecutar` dan el nombre en el idioma de `opciones.idioma`, así que la carta en inglés dice los hitos en inglés: el cielo del 8, el camino del 9 y el botón apagado. Los textos de la carta siguen solo en español.

**Supuestos tomados:**
- **Sin idioma, el nombre de un hito sale en español,** como hasta hoy. La pasada única decide si el canónico pasa a ser el inglés.
- **Los archivos del núcleo en `datos/provisional/` no se tocan:** son archivos nuevos y una línea cada uno en `generar.mjs`. Por eso la lectura nueva va en `lecturas-de-la-lente.json` y no en `lecturas.json`, y no se materializa (el contexto solo materializa las del núcleo).
- **El destino del gesto lanza la acción como antes,** escribiendo por el camino de la bandeja; no compone. Lo que el gesto da («person», «box») y sobre qué registro («the alta of the person») es la lista cerrada de la lente.

**Queda en NOMBRES_DE_HOY un nombre:** «second factor» (app.js `configurar`), que espera la decisión de VG.

**Queda en el núcleo:** `src/bases.js` sigue usando `HITOS` con el nombre en español para sus registros de base (`bloqueDe`, la caja de cada cuenta). Lo que se pinta pasa por `contrato`, en el idioma de quien mira.
