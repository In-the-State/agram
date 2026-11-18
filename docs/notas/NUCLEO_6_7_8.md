# Núcleo 6, 7 y 8: lo que falta como posición, los tipos de parámetro y el porqué de un «no» (diseño, 18-11)

Tres de las diez piezas de «lo que sube de verdad al núcleo» (`agram-equipo/OPINION_BOTONES_PV.md` §11). Es diseño: no cambia `src/`, `carta/`, `datos/epocas/`, `servidor/` ni `sw.js`. La construcción la decide Core con esta nota.

Pregunta de cada pieza, la regla de VG: ¿podría hacerlo el agente de dentro solo con registros, lecturas BQL, transacciones y BTML? Lo que sí, es dato. Lo que no, es una capacidad general del núcleo, y eso es lo que se programa.

Cómo se ha medido:

- `test/medida-nucleo-678.mjs`: solo lee y no es de la suite. Se corre con `node test/medida-nucleo-678.mjs`.
- Los ejemplos son la reserva de Booking (`ejemplos/ikisai/reserva-booking.mjs`, `ejemploReserva({ confirmar: false })`) y la tarea de Tasks (`ejemplos/ikisai/tarea-tasks.mjs`, `ejemploTarea({ hasta: 'entregada' })`).
- Las fórmulas nuevas se apoyan en el §15 de `docs/BQLM.md` (`row`, `with`, `apply`, `each (e)`, `take`, `keep`). Ese apartado está en `beta-lenguaje` (commit 3db4d93) y **todavía no está en `beta-nucleo`**. Lo he leído con `git show`, sin tocar ningún árbol. Por eso las fórmulas son borradores: los niveles de `it` se fijan con su prueba al construir.

En el texto, «acción» es lo que el código llama plantilla de transacción y «tipo» lo que llama plantilla de datos.

---

## 6. Lo que el motor deduce que falta, legible como posición

### 6.1 Cómo es hoy

Hay dos funciones de JavaScript que deducen lo mismo, con formas distintas, y una lectura de la época que ya hace la mitad.

| Dónde | Qué hace | Quién la llama |
|---|---|---|
| `src/motor.js:400` `siguiente(eje, X, yo)` | Lee «what is missing» (`epoch.9.0.3`, que es `=(first it.4).8`), reparte lo pendiente entre lo mío y lo de otros, y monta a mano la transacción cruda «move what was announced» (línea 418). Si el dueño declara recuento y no pasa, añade «commit P» con su transacción (`motor.js:426-448`; el texto «el recuento de … da … y pide …», en español, en la línea 430). Si X es mi alta por invitación, añade el tutorial | `carta/carta.js:1138` (`pasoDeFila`, el paso de cada fila), `ejemplos/ikisai/reserva-booking.mjs:449`, `ejemplos/ikisai/tarea-tasks.mjs:479` y 8 pruebas (`motor`, `ejemplo-booking`, `ejemplo-tasks`, `conformidad-motor`, `efectos`, `pasos`, `reglas-3b`, `validez`) |
| `src/acciones.js:1629` `camino(eje, X, yo)` | Junta el tutorial (el 9 del tipo, el de identidad y el de X); lo anunciado pendiente por estación (`epoch.4.2`, líneas 1676-1699); el recuento con «commit P» por su nombre (1700-1710; el texto «the tally of … gives … and asks above …», en inglés, en la 1706); las peticiones de atención con «attend» (1711-1719); las caducidades con «expire something mine» (1720-1731), y las sugerencias | `transaccion` (las acciones con `path`), `autoejecutar`, `carta/carta.js:1797` (la vista del camino), las sugerencias de la guía (`src/guia-libro.js`) y 15 pruebas |
| La lectura «stage» (`datos/epocas/reglas/stage.json`), en **X.4.8** | Los anuncios del 4.1 de X que aún no se han cumplido: ya es una posición | La plantilla de cerrado, «what is missing», las estaciones (`epoch.4.3`) y la condición de «pay», que ya lee `(first it.4).8` |

Las formas de dato que ya existen:

- **motor.siguiente:** `{ cerrado, faltaDeMi: [{ que, anuncio, plantilla, transaccion }], espera: [{ que, anuncio, de }], tutorial? }`.
- **acciones.camino:** `{ pasos: [{ fuente, regla, hacer: { plantilla, X, parametros, lectura }, falta, espera, hecho, anuncio?, peticion? }], niveles? }`.
- **X.4.8:** una lista de registros, que son los anuncios.
- **Las estaciones**, en `epoch.4.2`: `[[familia], [qué se hace], [la acción que lo mueve]]`.

Lo medido sobre la reserva sin confirmar (3a0274cf):

| Quien mira | motor.siguiente | acciones.camino | Lo que ya da BQL desde X.4.8 |
|---|---|---|---|
| huesped | falta: mover 165 EUR, «move what was announced»; espera: casa ×3 (una por noche) | espera a casa; hacer «pay» | 2 pendientes; 1 mío, de familia E; `first epoch.4.2.0.2` = pay |
| casa | falta: la plaza de 3 noches, «move what was announced»; espera: huesped | hacer «pay»; espera a huesped | 1 mío, de familia E ×3 |
| recepcion | nada; espera: casa ×3 y huesped | espera a casa y a huesped | 0 míos, 2 de otros |

Cuatro hallazgos:

1. **El paso de cada fila de la carta casi nunca sale.** «move what was announced» no es una acción de la época: `epoch.9.0.3` la describe, pero no está en `9.6`. Así que `pasoDeFila` (`carta/carta.js:1131`) solo encuentra «commit P». Pagar y entregar no se pintan nunca como el paso de una fila.
2. **Las dos funciones no dan lo mismo.** `siguiente` repite la espera por cada movimiento; `camino` la da por anuncio. Una dice el motivo en español y otra en inglés, y los dos textos están escritos en el código.
3. **Entregar las plazas es «pay».** La serie de plaza es E y la estación de E es «pay». Funciona, porque «pay» mueve todo lo anunciado de quien la lanza, pero la casa «paga» las noches. Es de la época, no de esta nota.
4. **Ya se escribe en BQL qué está pendiente, de quién y de qué familia.** Lo que falta para que todo sea dato: elegir la estación por la familia, el recuento y montar filas.
   - **La estación por familia.** La tabla guarda la familia como texto («E») y el libro como símbolo (`E`). Un texto no fabrica un símbolo (SEG-09), así que hacen falta cuatro ramas, una por familia. Se escribe, pero a mano.
   - **El recuento.** Qué plantilla nombra el criterio, el umbral «above 0.5» (que ya se despliega como D-VALOR: 1 = 0.5) y si cuento yo (`presionDe`). `presionDe` ya construye una expresión BQL dentro del JavaScript.
   - **Montar filas** con varias posiciones.
   - **Recorrer las filas de una tabla de la época.** `epoch.9.0.0.1` (los recuentos) y `epoch.9.0.1.1` (las plantillas de cerrado) son una décupla con una fila por posición, no una lista, así que `each` no las recorre.

   Con `row`, `with`, `apply` y `each (e)` (§15) se escribe todo. Lo último, con un rodeo: un índice por valor sobre los diez dígitos (FILAS, abajo). Que el lenguaje lo traiga sin rodeo es la decisión 14.

### 6.2 Propuesta: la lectura «what is missing» en X.4.9

**Es dato, no código.** Una lectura de la época (B5, `read` en su 4) que se materializa en **X.4.9**. Para la regla corta, el 9 en la profundidad 1 es «cómo; […] y el siguiente paso», al lado de X.4.8, «frente a otros: lo ocurrido frente a lo previsto». `src/contexto-eje.js:576` ya da un nodo a cualquier `X.d.e` donde la época materializa una lectura, así que el contexto no cambia.

**Una fila por cada movimiento que falta**, la misma para todos los que miran:

| Posición | Qué es |
|---|---|
| 0 | qué se mueve: la serie (D-SERIE; en el recuento, `P.(X)`) |
| 1 | cuánto: lo anunciado; en el recuento, el umbral |
| 2 | por qué: el nombre de la lectura o del recuento que lo pide («stage», «weighted sum»…) |
| 3 | quién: 3.0 quién tiene que actuar (una o varias identidades; en el recuento, las que cuentan), 3.1 a quién |
| 4 | la acción que lo cumple: su nombre, sacado de los datos (`epoch.4.2` por familia; para el recuento, `epoch.9.0.3`, que ya nombra «commit P») |
| 5 | sobre qué registro se lanza: el anuncio, o X para el recuento |
| 6 | para cuándo: el 7.1 del movimiento anunciado; vacío si no lo dice |
| 7 | lo que hay ahora: en el recuento, su valor; en lo anunciado, vacío |

**No depende de `me`.** La parte de cada uno la filtra quien lee: `it.4.9 where me in it2.3.0`. Así una regla puede leer X.4.9 sin que cambie según quién mira, y la memoria del evaluador (la pieza 10) la guarda una vez por registro y no una vez por persona.

Borrador de la fórmula. ANT es el anuncio y MOV el movimiento; las subfórmulas van con nombre, como en el §15.1:

```text
NADA      := (0 where 1 = 0)
HECHO     := count ((down ANT) where count ((moves itN) where not "anunciado" in itM.2 and itM.0 = MOV.0
               and itM.3.0 = MOV.3.0 and itM.3.1 = MOV.3.1 and itM.4 = MOV.4 and itM.1 >= MOV.1) > 0) > 0
ESTACION  := first ((epoch.4.2.0.2 where E in MOV.0.0.0) with (epoch.4.2.1.2 where P in MOV.0.0.0)
               with (epoch.4.2.2.2 where R in MOV.0.0.0) with (epoch.4.2.3.2 where T in MOV.0.0.0))
ANUNCIADO := it.4.8 each (((moves ANT) where "anunciado" in MOV.2 and not HECHO)
               each (row(MOV.0, MOV.1, "stage", row(MOV.3.0, MOV.3.1), ESTACION, ANT, MOV.7.1)))

FILAS(D)  := (0 with 1 with 2 with 3 with 4 with 5 with 6 with 7 with 8 with 9) each (D.(itN))
               [las filas de una décupla de la época: epoch.9.0.0.1 y epoch.9.0.1.1 son UNA décupla con una
                fila por posición, no una lista; medido: «epoch.9.0.0.1 each 0» da la primera fila entera]
CRITERIO  := (it.2 where count it2.5 = 0 and count it2.0 = 0) with (it.2.2 where count it2.5 = 0)
NOMBRE    := last (CRITERIO where it2 in (FILAS(epoch.9.0.0.1) each 0))
UMBRAL    := first (((CRITERIO where it2.2 = "above") each 1) with epoch.9.0.0.2)
VALOR     := apply(last (FILAS(epoch.9.0.0.1) where first it2.0 = NOMBRE).1, it)
QUIENES   := first (((it.2.3 where count it2.5 = 0) where count it2 > 0) with first it.3)   [la lista o el dueño]
RECUENTO  := (row(P.(it), UMBRAL, NOMBRE, row(QUIENES), first epoch.9.0.3.1.2.0, it, NADA, VALOR))
               where count NOMBRE > 0 and not (VALOR > UMBRAL)

FIN       := count (FILAS(epoch.9.0.1.1) where (first it2.0 = "closed with error" or first it2.0 = "expired"
               or first it2.0 = "closed by decision") and first apply(last it2.1, it) = true) > 0

what is missing (X.4.9) := (ANUNCIADO with RECUENTO) where not FIN
```

Lo que sale de aquí hacia la lente y el agente:

- **Qué acción toca ahora**, como dato: `=first ((it.4.9 where me in it2.3.0) each 4)`, y el registro sobre el que se lanza, `=first ((it.4.9 where me in it2.3.0) each 5)`.
- **Una sola vez por anuncio:** la acción mueve todo lo mío de su anuncio («pay» lo hace), así que se agrupa: `=(it.4.9 where me in it2.3.0) group row(it2.4, it2.5)`.
- **Lo que espero de otros:** `=((it.4.9 where not (me in it2.3.0)) group it2.3.0) each 0`.

#### Ejemplo 1: la reserva de Booking (3a0274cf, sin confirmar)

X.4.9 da cuatro filas, por llegada de su anuncio:

| 0 serie | 1 | 2 | 3.0 → 3.1 | 4 | 5 |
|---|---|---|---|---|---|
| E:casa/1100000000@2026-11-20@89c2a7cc | 1 | stage | casa → huesped | pay | 70bf9285 (ocupar) |
| E:casa/1100000000@2026-11-21@89c2a7cc | 1 | stage | casa → huesped | pay | 70bf9285 |
| E:casa/1100000000@2026-11-22@89c2a7cc | 1 | stage | casa → huesped | pay | 70bf9285 |
| E:casa/EUR | 165 | stage | huesped → casa | pay | 1d24ffcb (pagar) |

La lectura de «qué toca» con estos datos:

- **huesped:** toca «pay» sobre 1d24ffcb, que mueve los 165 EUR.
- **casa:** toca «pay» sobre 70bf9285. El grupo junta las tres noches en un solo registro, que es lo que hoy escribe `confirmarReserva`.
- **recepcion:** no le toca nada; espera a casa y a huesped.

Cuando casa entrega, queda la fila de los 165 EUR. Cuando paga huesped, X.4.9 está vacío y la plantilla de cerrado da `true`. La reserva no declara recuento, así que RECUENTO no da fila.

#### Ejemplo 2: la tarea de Tasks (hasta «entregada»)

La organizadora anunció en el 4.1 de la tarea un pago con dos movimientos. X.4.9 da dos filas sobre el mismo anuncio:

| 0 serie | 1 | 2 | 3.0 → 3.1 | 4 | 5 |
|---|---|---|---|---|---|
| E:casa/alquiler de la carpa | 250 | stage | organizadora → proveedor | pay | el anuncio |
| E:casa/transporte | 60 | stage | organizadora → proveedor | pay | el anuncio |

Agrupadas por (4, 5) son un único «pay», el que hoy escribe `ejemploTarea` desde `siguiente(…).faltaDeMi[0].transaccion`. El proveedor y la casa esperan a la organizadora. Medido: hoy la acción por defecto de la organizadora en el 4 es «aggregate T»; «pay» sale cuarta. Con X.4.9, «lo que toca» ya no depende del orden del aro.

#### Casos límite

- **Un proceso terminado** (con error, caducado o por decisión) da X.4.9 vacío. FIN lo dice con las plantillas de cerrado de la época, como hoy `motor.cerrado`. Vacío no distingue «terminado» de «no falta nada»: eso lo dice el cerrado de X.
- **Pendiente.** Basta un anuncio que referencie un registro que no está (o una posición vacía donde hace falta un valor) para que **toda** la posición quede PENDIENTE. Una lectura B5 no admite `keep` (§15), así que no se cae en silencio. La lente enseña «no se puede saber qué falta» con el porqué del 8, y nunca «nada». Una regla que lea X.4.9 no pasa.
- **Error** (una fórmula mal escrita en la época): ERROR, con el mismo trato.
- **Presupuesto agotado:** PENDIENTE POR LÍMITE, con su causa (`limit_exhausted`). Nunca «no falta nada». Es caro: «stage» ya es la fórmula más larga de la época y el recuento usa `apply`. Por eso va después de la memoria del evaluador (la pieza 10) o junto a ella.
- **Sin recuento declarado:** RECUENTO no da fila. Con un nombre que no es de la época («one per person»), tampoco, y lo dice el recuento como hoy (`epoch.9.0.0.5`).

**Lo que no entra en X.4.9.** El tutorial, las peticiones de atención y las caducidades próximas no son lo que falta para cerrar X: son camino (PV9). Van en una segunda lectura en **X.9.8** (camino, frente a otros): `it.4.9 with ATENCION with CADUCIDAD`, con la misma forma de fila.

- **ATENCION.** Las peticiones del dueño de X sin atender, con la lectura «attended» (X.7.4). Su acción sale de la tabla de la época de abajo, no del código.
- **CADUCIDAD.** Las series de X.7.1 que caducan antes del final del día siguiente al reloj **del libro** (`before.6.0`, con D-FECHA: `(first it2.7).3 <= (first before.6.0).3 + 1`), no del aparato. Su acción, «expire something mine», también sale de la tabla.

El tutorial se queda de momento en JavaScript, en `camino`. Para ser dato le falta resolver el tipo de X por el nombre de su 5 (§15.2 de beta-lenguaje) y la regla de «hecho» (`hechoEnSuAncla`, `acciones.js:1592`).

**Alternativa descartada:** una vista nueva en JavaScript del contexto (como X.2.4). Todo lo que calcula ya es BQL («stage») o lo es con `apply` (el recuento), así que sería código para algo que el agente de dentro puede escribir.

### 6.3 Qué cambia

**En `src/`:**

- **`contexto-eje.js`:** nada para leer X.4.9 ni X.9.8. Las lecturas provisionales (abajo) se suman a las de la época al construir `#lecturas`, y la de la época gana por nombre.
- **Las lecturas provisionales.** Un módulo pequeño, `src/provisional.js`, carga `datos/provisional/lecturas/*.json` con la misma forma que una regla. Es la única pieza nueva.
- **`motor.siguiente(eje, X, yo)`** lee X.4.9 y filtra por `yo`. Devuelve `{ cerrado, faltaDeMi: [{ que, anuncio, plantilla, sobre }], espera: [{ que, anuncio, de }], tutorial? }`. `plantilla` pasa a ser siempre el nombre de una acción de verdad, y **desaparece `transaccion`**, la cruda de «move what was announced». Lo de antes, `motor.js:416-448`, se va.
- **`acciones.camino`:** las partes (2), recuento, atención y caducidad (`acciones.js:1676-1731`) pasan a leer X.9.8. `mio(nombre, …)` se queda tal cual.
- **Ejemplos:** `cumplir` (`reserva-booking.mjs:448`) y la tarea (`tarea-tasks.mjs:479`) lanzan `acciones.transaccion(eje, f.plantilla, { X: f.sobre }, yo)`.

**En la época 0**, en la pasada única y no ahora:

1. La lectura «what is missing» con su posición X.4.9, y la de X.9.8.
2. `epoch.9.0.3` se rehace como tabla de «por qué → acción que lo cumple»: stage por estación (`epoch.4.2`), el recuento → «commit P», «attended» → «attend», la caducidad → «expire something mine». La fila «move what was announced» se quita.
3. Las filas de `epoch.9.0.1` dicen qué acción escribe cada final. Así FIN y `motor.cerrado` dejan de llevar `FINES` en el código (decisión 5).

Mientras tanto, todo vive en `datos/provisional/` con la forma exacta que tendrá en la 0. Las dos lecturas llevan los nombres de las acciones como literales de su fórmula, que es dato y no código. Al congelar, su contenido pasa a la 0 sin cambios y la carpeta desaparece.

**En la carta:** `pasoDeFila` (`carta/carta.js:1131`) lee «qué toca» de X.4.9 en vez de `motor.siguiente` y, por fin, pinta «pay» y «deliver». La vista del camino (`carta.js:1797`) no cambia de forma.

**Pruebas que lo fijan:**

- **Booking y Tasks:** X.4.9 da las filas de los dos ejemplos de arriba, antes y después de cada parte, y al final está vacío con `cerrado: true`.
- **`me`:** el valor de X.4.9 es el mismo con `me` = huesped, casa y recepcion.
- **Mismo resultado que hoy:** `siguiente` da lo mismo que antes en los ocho archivos que lo usan, salvo `transaccion`.
- **Límites:** un anuncio con una referencia ausente deja X.4.9 PENDIENTE y la carta no dice «nada». Con `limites.ocupantes` bajo, PENDIENTE POR LÍMITE.
- **Las guardas:** `nucleo-limpio` encoge (6.5).
- **Una prueba de `datos/provisional/`:** ningún nombre suyo choca con uno de la 0 (lo provisional nunca tapa a la época).

### 6.4 Seguridad

- **Leer no escribe.** X.4.9 es una lectura: no mueve, no coloca y paga del presupuesto de la evaluación que la lee. Una época hija hostil puede redefinir «what is missing» en su propio libro. Solo engaña a la lente sobre qué conviene hacer: lo que se firma lo sigue sacando el intérprete de la transacción construida (el resumen del 4), no de la fila.
- **Lo que pone una fila es solo un nombre.** Que una fila diga «pay» no lanza nada. La carta busca esa acción en las de la época y, si no se ofrece aquí y para mí (su 2), no hay botón.
- **Los libros ajenos no entran.** X.4.9 solo lee el libro que se mira.
- **El presupuesto no se salta.** La lectura usa los límites de la época (el menor entre su 8.8 y `LIMITES`) y `apply` tiene su tope de anidamiento.

### 6.5 Qué desaparece

De las 27 acciones «en deuda» de `test/nucleo-limpio.test.js`:

- **Con 6 dejan de nombrarse 3 (4 pares archivo–nombre):** «commit P» (`acciones.js` y `motor.js`), «attend» y «expire something mine» (`acciones.js`).
- **Con la decisión 5** (los finales como dato de `epoch.9.0.1`), otras 3, las tres dudosas de `motor.js`: «close with error», «expire» y «close by decision». Salen de B sin pasar a A. `cadenas.js` deja de importar `FINES` y lee el `fin` de `motor.cerrado` como hasta ahora.
- **Fuera de las 27**, desaparece «move what was announced» y los dos textos de recuento escritos a mano (`motor.js:430`, `acciones.js:1706`).
- **No cambian:** las otras 21.

---

## 7. Tipos de parámetro declarables por la época; «archivo» y «libro»

### 7.1 Cómo es hoy

- **El tipo** de un parámetro es la primera hoja de su 1 (`src/acciones.js:271`, `tipo: texto(hoja(p[1])) ?? 'text'`). La lista es cerrada, aunque nadie la declara: `contrato.js:100` (`TIPO`: number, ref, identity, instant, level) y la cabecera de los tipos de la época (`epoch.9.2.0.1`, que da el tipo genérico por dígito y que `contrato.esTipoSimple`, `contrato.js:3783`, usa como lista). `tenfold` aparece en 7 parámetros y no está en ninguna de las dos.
- **Ya hay un precedente de tipo refinado:** `["ref", "purchase"]`, una referencia a un registro de ese tipo, que lee `contrato.opciones` (`contrato.js:3876`).
- **Archivo no es un tipo, es un destino.** Va en el 4 del parámetro, `file ref` o `file format` (`acciones.js:224` `destinoDe`, `:245` `archivoDe`). La carta lo reconoce por ese 4 y toma un camino propio:
  - `carta/app.js:1242` `adjuntarArchivo` llama a `carta/archivos.js:100` `adjuntarConAccion`;
  - ese camino prepara el archivo, calcula su id, valida la acción en seco sin firmar, sube y escribe;
  - es la escritura «archivos.js · adjuntarConAccion · enviar» de `test/lente-limpia.test.js`.

  Lo usan «attach a file» y «attach art to this element».
- **Libro no existe como tipo.** Los parámetros que nombran un libro son texto con la validación de un id escrita a mano (`=hex(slice(bytes(it), 0, 32)) = it`), y quien los rellena son pantallas fijas: `carta/libros.js` (`anunciarLibroPrivado` calcula las claves de línea y escribe «open a private book here») y `carta/puente.js` (`enviarAOtroLibro`, `traerDeOtroLibro`, `enlazarNuevo`). Los nombres de los parámetros del enlace están en el núcleo (`contrato.js:2828`, `PARAMETROS_DEL_ENLACE`).
- **Las opciones de un parámetro** las saca `contrato.opciones` de cinco fuentes en orden: el tipo, una enumeración en la validación, los niveles, la lista del defecto `=first …` y lo ya escrito por los hermanos. No hay manera de que la época diga «las opciones son esta lectura».
- **Una hija no puede declarar un tipo:** no hay sitio, y el 9.2 se hereda por posición.

Medido (`test/medida-nucleo-678.mjs`) sobre los 698 parámetros de las acciones de la 0 y de las hijas (cuenta, guia-libro, roadmap, state): text 443, identity 129, number 74, ref 36, instant 9, tenfold 7. La misma validación se repite a mano:

| Validación | Veces |
|---|---|
| `=it > 0` | 35 |
| `=hex(slice(bytes(it), 0, 32)) = it` (un id de 64 hexadecimales) | 27 |
| `=it != ""` | 18 |
| `=count it.6 > 0` (una identidad con alta) | 17 |
| `=it >= 0` | 12 |

### 7.2 Propuesta

**Dos capas.** Abajo, una **lista cerrada de tipos base**, que es del dispositivo: un control por tipo, y el código la conoce. Encima, **tipos declarados por la época**, que son dato: derivan de un tipo base o de otro declarado, y dicen qué validan, qué opciones ofrecen y su ayuda.

**Los tipos base** (`TIPOS_BASE` en `src/contrato.js`, sustituye a `TIPO`):

| Base | Control del dispositivo | Lo que el dispositivo comprueba él solo | Facetas |
|---|---|---|---|
| text | campo de texto | nada | — |
| number | campo numérico | que es un número | — |
| identity | elegir una identidad del libro | que tiene alta | — |
| ref | elegir un registro del libro | que está en el libro | — |
| instant | fecha y hora | ISO con zona | — |
| level | elegir un nivel (`epoch.8.4`) | que es uno de ellos | — |
| tenfold | editor BTML | `validarPayload` | — |
| **file** | elegir un archivo del aparato | tamaño y tipo permitidos (`carta/archivos.js`, `LIMITE`, `TIPOS`) | `ref` (archivo:<sha256>), `format` (el formato de `epoch.9.5.1` que corresponde a su tipo MIME), `size` (bytes) |
| **book** | elegir uno de **mis libros** (los de este aparato y los del libro de cuenta: la lectura «my books») | 64 hexadecimales | `id` (su génesis), `line keys` (los pares [nivel, clave] que el aparato ya sabe calcular: `carta/anfitrion.js`, `clavesDeLinea`), `headers url` |

Un parámetro pide **una faceta** de su base en la segunda hoja de su 1: `["file", "format"]`, `["book", "line keys"]`. Todos los parámetros de una acción con la misma base comparten **un solo control**: un archivo elegido llena su referencia, su formato y su tamaño. El 4 vuelve a ser solo «payload», «key {p}», «proof {p}» o «cost», y `file ref` / `file format` en el 4 se siguen leyendo hasta la pasada única.

**Un tipo declarado** tiene el mismo molde que un parámetro, para no inventar otro:

| Posición | Qué es |
|---|---|
| 0 | el nombre |
| 1 | de qué deriva (un tipo base o uno declarado; con faceta si es file o book) |
| 2 | la validación, `=…` con `it` = el valor |
| 6 | la procedencia |
| 9 | lo que hay antes de la ayuda: la fórmula de **opciones**, una lectura con `it` = X, `me` = quien mira y `opciones.lectura` (admite `keep`), y detrás, la ayuda |

Viven en una lista nueva de la cabecera de los tipos, **`epoch.9.2.0.3`**, que se añade a `COLECCIONES` (`src/epocas.js:529`) para que una hija sume los suyos sin tapar los de la 0; gana la hija por nombre.

**Cómo se resuelve un parámetro cuyo 1 nombra un tipo:**

1. **La cadena de derivación**, hasta la base. Como mucho 4 saltos; un ciclo es ERROR.
2. **Las validaciones**, en orden: lo que comprueba el dispositivo para la base, luego la del tipo de abajo arriba y al final la del propio parámetro. Tienen que pasar todas. Así una hija puede **endurecer** un tipo de la 0, pero no aflojarlo.
3. **Las opciones:** las del parámetro si las tiene; si no, las de su tipo; si no, las de siempre (`contrato.opciones`).
4. **La ayuda:** la del parámetro, y si no tiene, la del tipo.

**Para file y book, las opciones salen del dispositivo, no del libro.** La fórmula del tipo solo puede **filtrar** esa lista (se evalúa con `it` = cada libro mío), nunca añadir. Y la etiqueta de cada libro es el nombre que le doy yo en mi aparato, no la que diga el libro.

#### Ejemplo 1: «attach a file» sobre la reserva de Booking (huesped)

El parámetro `file` (hoy `["text"]` con 4 `["file", "ref"]`) pasa a pedir `["file", "ref"]` en su 1, con 4 `["payload"]` y 5 `"5"`. `format` (hoy `["text"]` con 4 `["file", "format"]`) pasa a pedir `["file", "format"]`, con 5 `"1.1"` y su validación de siempre. `size` no cambia. En «attach art to this element», el formato pide además `=it in epoch.9.5.1 and it != "html"`.

Lo que hace el dispositivo, igual para toda acción con un parámetro file:

1. La persona elige un archivo. El dispositivo calcula las facetas: `archivo:<sha256>`, `svg` o `image`…, y el tamaño.
2. Valida la acción en seco, sin firmar, con esos valores.
3. Si no pasa, no sube nada y dice por qué (con el 8: «formato: hace falta que no sea html, y es html»).
4. Si pasa, sube y lanza la acción.

Es lo que hace hoy `adjuntarConAccion`, pero sin depender de qué acción es.

- **Sin red:** el archivo queda pendiente de subir (`Archivos.pendientes`, como hoy) y la acción se compone.
- **La validación en seco queda pendiente** (por ejemplo, por el presupuesto): no se sube. El aviso es «no se ha podido comprobar»; nunca se sube un archivo que no se sabe si entra.

#### Ejemplo 2: «open a private book here» sobre el génesis de Booking (casa, que tiene un libro pequeño en su aparato)

`book` pide `["book", "id"]`, en 1.0.0. Hoy es texto con la validación hex. `line keys` pide `["book", "line keys"]`, en 2, con la misma validación larga de hoy (de uno a cuatro pares, niveles de `epoch.7.6.1`, sin repetir). Hoy esas claves las calcula `anunciarLibroPrivado`.

La época declara además un tipo que reutilizan las 27 validaciones del id. Está en `datos/provisional/tipos/` hasta la pasada:

```json
[["an id"], ["text"], ["=hex(slice(bytes(it), 0, 32)) = it"], [], [], [], ["Core AGRAM 18-11: los 27 parámetros que piden un id de 64 hexadecimales"], [], [], ["an id: 64 hexadecimal characters in lower case"]]
```

El formulario de casa enseña un desplegable con sus libros, con los nombres que ella les puso. Elegir uno rellena el id y las claves de línea a la vez. La validación en seco es la de la acción de siempre, y el resumen del 4 dice en llano: «este registro publica en este libro el id de tu libro «Casa (privado)» y sus claves de línea».

**Cuando no hay nada que elegir.** Sin libros en el aparato, el desplegable sale vacío y el campo admite pegar un id (pasa por la validación del tipo); las facetas que no se saben quedan vacías y, si son obligatorias, la validación en seco dice cuál falta. Para «a book of mine» en el libro de cuenta, el mismo control lista los libros del aparato que todavía no están en «my books».

**Tipos declarados que ya tocan:**

- **«cohort»**, derivado de text, con las opciones de `change cohort`. Así `contrato.cohortes()` (`contrato.js:2273`) lee el tipo y no el parámetro de una acción por su nombre.
- **«an identity with alta»** (`=count it.6 > 0`, 17 veces).
- **«a positive number»** (`=it > 0`, 35 veces).

### 7.3 Qué cambia

**En `src/`:**

- **`contrato.js`:**
  - `TIPOS_BASE` (la lista cerrada, con las facetas de file y book).
  - `tiposDeParametro(opciones)`: los declarados de la 0, de lo provisional y de la época del libro, resueltos, con `{ nombre, base, faceta, validaciones: [], opciones, ayuda, de: '0' | 'provisional' | 'libro' }`.
  - `esTipoSimple` y `desdeLegible` leen la base.
  - `opciones()` añade la fuente «la fórmula de opciones del tipo» antes de las de siempre, y para file y book no da nada propio: las da el dispositivo.
- **`acciones.js`:**
  - `parametros()` resuelve el tipo: cada parámetro lleva `tipo` (el nombre), `base`, `faceta` y `validaciones`.
  - `preparar()` valida la cadena entera.
  - `destinoDe` deja de mirar `file` (hasta la pasada lo lee también del 1).
  - `archivoDe(p)` pasa a `p.base === 'file' ? p.faceta : null`, con la misma firma, así que la carta no se rompe.
- **`epocas.js`:** `'9.2.0.3'` en `COLECCIONES`.
- **`provisional.js`:** carga también `datos/provisional/tipos/*.json`.

**En la época 0**, en la pasada única:

- la lista `9.2.0.3` con los tipos («an id», «a positive number», «an identity with alta», «cohort»…);
- los parámetros de las acciones que hoy repiten la validación pasan a nombrar el tipo;
- `file` y `book` en el 1 de los parámetros de «attach a file», «attach art to this element», los del enlace y «a book of mine» (este último, en la hija de cuenta);
- los textos «base <tipo>» de cada control.

Cambia el id de la 0 y de las hijas, como ya cambia en esa pasada. **Lo provisional:** los tipos de `datos/provisional/tipos/` funcionan sin tocar la época, porque `parametros()` los ve aunque la acción todavía diga text. Lo que no puede adelantarse es que una acción de la 0 nombre un tipo, que cambia la acción: eso espera a la pasada, y hasta entonces el tipo se aplica por la faceta (file) o queda declarado sin uso.

**En la carta:**

- `formulario` (`carta/carta.js:1224`) da `base` y `faceta` en cada campo, y `dom.js` elige el control por la base (lista cerrada).
- El envío de un formulario con un campo file hace siempre lo de 7.2, el ejemplo 1. **`adjuntarConAccion` desaparece**, y con él la escritura «archivos.js · adjuntarConAccion · enviar» de `lente-limpia`.
- El control book lee de `carta/cuentas.js` (las entradas) y de `carta/anfitrion.js` (las claves de línea).
- `anunciarLibroPrivado` y `enviarAOtroLibro` pasan a ser el formulario de su acción. Sus escrituras salen de `lente-limpia`: «libros.js · anunciarLibroPrivado · enviar» y «puente.js · escribir · enviar». `abrirLibroPrivado` (crear el libro pequeño) no es una acción del libro y se queda en el borde.

**Pruebas que lo fijan:**

- **La resolución de tipos:** `parametros()` resuelve la cadena; una hija endurece un tipo de la 0 y no puede aflojarlo; un ciclo y más de 4 saltos dan ERROR.
- **book:** las opciones vienen del dispositivo, y una fórmula de una hija que «añade» un libro no lo añade.
- **file:**
  - un .html con «attach art» no se sube (el caso de `test/archivos.test.js:183`, sin `adjuntarConAccion`);
  - una acción nueva con un parámetro file, sin código, sube y escribe;
  - sin red queda pendiente.
- **Las guardas:** `lente-limpia` encoge en las tres escrituras de arriba.

### 7.4 Seguridad

- **Ningún tipo trae un control nuevo.** El control es de la base, y la lista de bases es del código. Un libro hostil solo puede validar, filtrar opciones y dar textos.
- **Validaciones y opciones son lecturas:** no escriben y pagan del presupuesto. Una validación que agota el presupuesto deja el valor «sin comprobar», y la acción no se lanza.
- **El libro no ve mis otros libros.** La lista de mis libros la tiene el aparato. La fórmula del tipo de un libro hostil solo ve, uno a uno, los ids que el aparato le pasa para filtrar, y lo que no filtra no sale del aparato. Lo único que llega al libro es lo que firmo. Como un tipo puede pedir facetas que me identifican entre libros (el id de mi libro, mis claves de línea), **el resumen del 4 dice en llano qué faceta de qué libro mío va a quedar escrita**. Ese resumen lo saca el intérprete de la candidata, y su texto no lo da el libro.
- **El contenido de un archivo nunca entra en BQL:** solo su referencia, su formato y su tamaño. Se sube después de validar en seco y solo si la persona lo eligió. El destino de la subida es el de siempre (`archivos.destinoDe`).
- **Las etiquetas de un tipo** son del libro, se pintan como texto escapado y no se evalúan (no pasan por `rellenar`).

### 7.5 Qué desaparece

- **De las 27 de `nucleo-limpio`:** ninguna del todo. «change cohort» sigue nombrada (`cohorteEscrita` busca el registro por su acción), aunque `cohortes()` deja de leer su parámetro.
- **En la carta**, que es donde gana:
  - el camino propio de adjuntar (`adjuntarConAccion`);
  - dos pantallas fijas del puente (anunciar y enviar);
  - tres escrituras de `lente-limpia`.
- **Los nombres de `lente-limpia` no cambian:** «attach a file» sigue en `archivos.js` por `adjuntarHtmlInicial`, que cae con «va antes» en A33.
- **En datos:** 27 + 35 + 17 validaciones repetidas pasan a nombrar su tipo.

---

## 8. El porqué de un «no», dado por el evaluador

### 8.1 Cómo es hoy

El evaluador solo dice `true`, `false`, o `PENDIENTE`/`ERROR` con un texto. De un «falso» no dice nada (`src/bqlm.js:642` `evaluar`, `:774` `calcular`). Los motivos que ve la persona se escriben a mano en seis sitios:

| Sitio | Qué se enseña cuando no pasa |
|---|---|
| Una acción que no se ofrece (`acciones.js:433`, `continue`) | nada: desaparece del aro. Medido: para recepcion sobre la reserva, en el punto de vista 1 se ofrecen 4 de 11 y las otras 7 desaparecen sin motivo |
| Una validación de parámetro (`acciones.js:390`, `:393`, `:851`) | la etiqueta y **la ayuda**, no el porqué. Medido: «consume» con cantidad 0 da «cantidad: cuántas unidades se queman» |
| Una regla del eje (`bqlm.js:1538`, `evaluarRegla`) | el 9 de la regla, escrito a mano por la época: las 73 condiciones lo tienen, y 62 con huecos `{expr}` que se evalúan |
| El recuento en el motor y en el camino (`motor.js:430`, `acciones.js:1706`) | una frase en español y otra en inglés, en el código |
| El segundo factor (`acciones.js:1283`, `MOTIVOS_DEL_SEGUNDO_FACTOR`), las cadenas (`cadenas.js:41`) y lo estructural (`contrato.motivo`: «anchor not a position», «X not in ledger»…) | claves «reason …» de la época, con huecos planos |
| La carta (`carta/carta.js:434`, `sinNombreInterno`) | quita del texto el nombre interno de la regla |

Lo estructural (el ancla no es una posición, no hay quien lance) no es una condición y se queda como está. Lo que pide esta pieza es lo de las tres primeras filas.

### 8.2 Propuesta

**`explicar(src | arbol, contexto, opciones)`** en `src/bqlm.js`. Devuelve **lo mismo que `evaluar`** (`estado`, `valor`) más `porque`, un árbol pequeño de motivos. Es una pasada aparte, que se hace **solo cuando se pide**: no cambia el veredicto, que lo da `evaluar`.

Cada nodo de `porque`:

| Campo | Qué es |
|---|---|
| `expr` | el trozo de la fórmula, tal como está escrito (cada nodo del árbol de `analizar` guarda dónde empieza y acaba; los tokens ya tienen `pos`, `bqlm.js:325`) |
| `dio` | `true`, `false`, `PENDIENTE` o `ERROR` |
| `vale` | en una comparación, lo que vale cada lado (sus textos legibles, como mucho 3 ocupantes) |
| `sobre` | el registro o el ocupante que era `it` (e `it2`…) en ese punto, y el registro sujeto |
| `hijos` | por qué, debajo |
| `muestras` | en un `where` vacío, hasta 3 elementos, cada uno con su porqué |
| `de` | cuántos había |
| `motivo` | si quedó PENDIENTE o ERROR, el de siempre (`la posición está vacía…`) |

**Cómo baja,** según lo que se quiere explicar:

- **`and` falso:** el primer término falso (es perezoso, como `evaluar`).
- **`or` falso:** todos sus términos.
- **`not`:** explica por qué lo de dentro es verdad (la misma bajada, al revés).
- **Una comparación** es una hoja: sus dos lados con su valor.
- **`count (M where c) op n`** que no se cumple: cuántos hay en M y cuántos pasan. Si no pasa ninguno, las 3 muestras que **más partes de `c` cumplen**, cada una con la parte que falla.
- **Una posición que es una lectura** (X.6.8.9 «firm», X.4.8 «stage»): su nombre y lo que da, y como mucho un nivel más dentro de su fórmula.
- **PENDIENTE y ERROR:** `calcular` anota en la `Parada` el nodo y el `it` donde se paró. Solo en el camino del fallo, así que no cuesta nada cuando todo va bien.

**Topes:**

- **Presupuesto propio**, del mismo tamaño que el de la evaluación (los límites de la época). Al agotarse, la explicación se corta con «no se puede explicar más: límite de cálculo», y el veredicto sigue siendo el de `evaluar`.
- **Tope de forma:** 6 niveles, 3 muestras por `where` y 20 nodos en total.
- **Igual que `evaluar`, `explicar` no admite verbos ni `put`** (`queMueve`). La pasada solo lee.

**El texto en llano** lo compone `contrato.porqueEnLlano(porque, { eje, idioma })` con tres clases de texto:

1. **Las frases que unen**, como «hace falta que {a} sea mayor que {b}, y es {va}», «de {M} ({n}), ninguno cumple {c}» o «no se puede saber: {qué} está vacío». Son claves «why …» de la época 0. **Un libro no puede retocarlas** (decisión 10).
2. **Los nombres de las posiciones.** Salen de los datos, por este orden:
   - la etiqueta de esa posición en el tipo del registro (su d.0);
   - el nombre de la lectura que se materializa ahí («stage», «firm»);
   - un glosario de las vistas del contexto en la época 0 («position A.1» → «lo que tiene {A}»);
   - la regla corta del dígito (`epoch.5`).

   Lo que no tiene nombre se enseña tal como está escrito.
3. **Los valores.** Los pone el dispositivo con `contrato.legible`: una identidad por su 0, un registro por su 0, una serie legible. Se insertan los últimos, como valores y no como texto de la plantilla.

**Dónde sale:**

- **`acciones.porQueNo(eje, X, accion, yo, opciones)`:** `{ ofrecida, estado, porque, texto }` para una acción. Se pide al pulsar una acción apagada o «¿por qué no está…?», no al pintar.
- **`acciones.acciones(…, { noOfrecidas: true })`:** devuelve además `noOfrecidas: [{ nombre, estado }]`, sin explicación (cuesta lo mismo que hoy), para pintarlas apagadas si la lente lo quiere.
- **`preparar()`:** cada motivo de parámetro lleva `porque` y `mensaje` = la etiqueta más el porqué en llano. La ayuda va aparte, en `ayuda`.
- **`evaluarRegla`:** en la fase 2 (decisión 12) devuelve `porque` además de `motivo`, que sigue siendo el 9 de la regla. Las palabras del autor quedan como título y la deducción, debajo.

#### Ejemplo 1: «consume» no se ofrece a recepcion sobre la reserva (3a0274cf)

La condición es `=count (me.1 where E in it2.0.0.0 and it2.1 > 0 and first it2.0.5 = first it.5) > 0`, y lo que dio cada parte está medido en `test/medida-nucleo-678.mjs` (8 bis):

```text
count (me.1 where …) > 0                         dio false · vale 0, y hace falta > 0
└ me.1 (lo que tiene recepcion)                   8 series; cumplen las tres partes: 0
  └ muestra: E:casa/hora                          E in it2.0.0.0 → sí · it2.1 > 0 → sí
     └ first it2.0.5 = first it.5                 dio false · 3316e7e5 («Casa rural de ejemplo», el génesis) ≠ 3a0274cf (la reserva)
  └ muestra: R:casa                               E in it2.0.0.0 → no (es R)
  └ muestra: P:10b6d90f…                          E in it2.0.0.0 → no (es P)
```

En llano: «“consume” no se ofrece aquí: de tus 8 series, ninguna es una E con saldo atada a esta reserva. La que más se acerca, E:casa/hora, está atada a “Casa rural de ejemplo”.» Para huesped sale lo mismo con E:casa/EUR, también atada al génesis. Hoy las dos ven el aro sin «consume» y no saben por qué.

#### Ejemplo 2: «consume» en seco con cantidad 0 (huesped)

La validación de `quantity` es `=it > 0`.

- **Hoy:** «cantidad: cuántas unidades se queman» (la ayuda).
- **Con 8:** `it > 0` dio false porque `it` vale 0. En llano: «cantidad: hace falta que sea mayor que 0, y es 0». La ayuda («cuántas unidades se queman») va debajo, aparte.
- **Si la validación queda pendiente**, por ejemplo `=count before.4.(it) > 0` con una serie que no existe y una posición vacía donde hace falta un valor: «serie: no se puede comprobar: “before.4.(it)” está vacío para “E:casa/XYZ”». Nunca «no vale».
- **Con el presupuesto agotado:** «no se ha podido comprobar (límite de cálculo)», y la acción no se lanza, igual que hoy.

### 8.3 Qué cambia

**En `src/`:**

- **`bqlm.js`:** espacio de cada nodo en `analizar`; el nodo y `it` en `Parada`; `explicar` y su prueba. Ojo: este archivo lo está tocando beta-lenguaje, así que va después de su merge.
- **`acciones.js`:** `porQueNo`, `noOfrecidas` y `porque` en los motivos de `preparar`.
- **`contrato.js`:** `porqueEnLlano` y el glosario.
- **Fase 2:** que `eje.validar` devuelva los motivos con su `porque`. Hoy da textos, y `acciones.motivosDelEje` (`acciones.js:744`) los vuelve a casar por el nombre de la regla. Toca `src/eje.js` y `src/validez.js`, así que espera a que asiente la tanda.

**En la época 0**, en la pasada única: las claves «why …» (una docena) en `epoch.9.4`, en inglés y en español, y el glosario «position A.1», «position X.2.4»… de las vistas del contexto (las de `docs/BQLM.md` §4: unas 25). Mientras tanto, viven en `datos/provisional/textos/{es,en}.json`, leídos detrás de los de la época y nunca delante.

**En la carta:**

- una acción apagada se puede pulsar y pide `porQueNo`;
- los motivos del formulario y de la bandeja (A33) enseñan `mensaje` con la ayuda aparte;
- `sinNombreInterno` deja de hacer falta en lo que ya viene compuesto.

**Pruebas que lo fijan:**

- **El veredicto no cambia:** para todas las fórmulas de la época 0 y de las hijas, sobre Booking y Tasks, `explicar(...).estado/valor` es igual que `evaluar(...)`.
- **Cada forma de bajar:** `and`, `or`, `not`, comparación, `count … where` (con sus muestras), lectura, PENDIENTE y ERROR.
- **Los dos ejemplos de arriba, literales.**
- **El presupuesto:** con límites bajos la explicación se corta con su marca y el veredicto es el mismo.
- **`explicar` no mueve:** con un verbo es ERROR.
- **Una etiqueta hostil** (abajo) sale tal cual, escapada.
- **El caso de seguridad** en `test/seguridad-bqlm.test.js` (SEG siguiente): una fórmula que en la explicación tocaría más que en la evaluación no pasa de su presupuesto.

### 8.4 Seguridad: con textos de quién se compone el motivo

| Pieza del motivo | De quién | Qué puede hacer un libro hostil |
|---|---|---|
| Qué parte dio falso, y sobre qué registro | Del evaluador | Nada: lo calcula el núcleo sobre la fórmula que se evaluó de verdad |
| Los valores (números, ids, series) | Del evaluador, pintados por el dispositivo | Nada: se insertan los últimos, como valores |
| Las frases que unen | De la época 0 | No puede retocarlas (decisión 10). Hoy cualquier «reason …» se retoca si se conservan los huecos (la comprobación de la carta, `retoqueHuecoNuevo`); estas claves quedan fuera de los retoques de un libro |
| Los nombres de las posiciones de sus tipos y de sus lecturas | Del libro (es su vocabulario) | Poner un nombre engañoso, por ejemplo llamar «ya pagaste» a una posición. Por eso se pintan escapados, no se evalúan (un `{first me.1}` dentro de una etiqueta sale tal cual, nunca pasa por `rellenar`), se cortan a 60 caracteres y la carta los marca como «del libro». El valor sigue al lado, y lo pone el núcleo |
| El 9 de una regla | De la época del libro | Lo que ya puede hoy. Queda como título; el porqué va debajo y no lo puede tapar |

El porqué **nunca decide nada**: no habilita una acción ni cambia una validación. **Nunca aparece en el resumen del 4**, lo que se firma, que lo saca el intérprete de la candidata. Lo que dice una pantalla antes de firmar no lo puede componer un libro.

### 8.5 Qué desaparece

- **De las 27 de `nucleo-limpio`:** ninguna; el 8 no nombra acciones.
- **Lo que deja de escribirse a mano:**
  - la ayuda usada como motivo (`acciones.js:390`, `:393`, `:851`);
  - los textos del recuento (que se van ya con el 6);
  - en la fase 2, la necesidad de que cada regla nueva traiga un 9 que explique el fallo: basta un 9 corto que diga qué es.
- **Lo que no desaparece:** los «reason …» estructurales y los del segundo factor, que no son el «no» de una condición, y `MOTIVOS_DE_DESCARTE` de las cadenas.

---

## Orden de construcción

1. **El 7 sin la época 0**, ya: no depende del lenguaje nuevo.
   - `TIPOS_BASE` con facetas;
   - `parametros()` lee la base y la faceta del 1 (y sigue leyendo file del 4);
   - `datos/provisional/tipos/` y `src/provisional.js`;
   - `'9.2.0.3'` en `COLECCIONES`;
   - en la carta, el control file genérico, y fuera `adjuntarConAccion`;
   - después, el control book y los formularios del enlace.
2. **Esperar el merge de beta-lenguaje en beta-nucleo**, con `row`, `with`, `apply` y `each (e)`. El 6 y el 8 lo necesitan, y `bqlm.js` está cambiando ahora.
3. **El 8a:** los espacios en el árbol, `explicar` y la prueba de «mismo veredicto». Solo `bqlm.js`.
4. **El 6:**
   - la lectura provisional X.4.9 y su prueba sobre Booking y Tasks;
   - `motor.siguiente` y `acciones.camino` la leen;
   - `pasoDeFila` en la carta;
   - X.9.8 detrás.

   Va con la memoria del evaluador (la pieza 10), o justo después, por el coste.
5. **El 8b:** `porQueNo`, `noOfrecidas` y los motivos de parámetro con `porque` (en `acciones.js`), y en la carta, la acción apagada que explica.
6. **El 8c:** las reglas del eje con `porque`, cuando asiente la tanda en `eje.js` y `validez.js`.
7. **La pasada única por la época 0:**
   - todo lo de `datos/provisional/` entra tal cual: lecturas, tipos y textos;
   - se rehacen `epoch.9.0.3` y `epoch.9.0.1`;
   - las acciones nombran sus tipos;
   - las claves «why …» y el glosario.

   Después se borra `datos/provisional/`, y las guardas encogen.

**Se puede construir sin tocar la época 0:** el 1, el 3, el 4, el 5 y el 6, todos con `datos/provisional/` como la fila que tendrá la 0. Lo único que espera a la pasada es que una acción de la 0 nombre un tipo, quitar «move what was announced» de `epoch.9.0.3` y sacar `FINES` del código.

## Decisiones que pido

1. **Dónde vive «lo que falta».** X.4.9, «fábrica · cómo y el siguiente paso», al lado de X.4.8. La alternativa es X.9.x. *Recomiendo X.4.9 para lo que falta para cerrar y X.9.8 para el camino (con atención y caducidades).*
2. **Una fila por movimiento o una por anuncio.** *Recomiendo por movimiento.* La lente agrupa por (acción, anuncio) con `group`, y quien quiera lo de un anuncio lo tiene sin perder el detalle.
3. **Que X.4.9 no dependa de `me`.** *Recomiendo que no dependa.* Una regla puede leerla, se memoriza una vez y la parte de cada uno se filtra al leer.
4. **El reloj de las caducidades próximas.** *Recomiendo el del libro (`before.6.0`),* no el del aparato: la lectura tiene que dar lo mismo en todos los aparatos.
5. **Los finales del proceso como dato.** Las filas de `epoch.9.0.1` dirían qué acción escribe cada final, y FIN y `motor.cerrado` las leerían. *Recomiendo que sí, en la misma pasada.* Resuelve las tres dudosas de `motor.js`: salen de la deuda sin pasar al suelo.
6. **Quitar `transaccion` de `motor.siguiente`.** Es la transacción cruda de «move what was announced»; los ejemplos lanzarían la acción de la estación. *Recomiendo que sí:* era la única escritura del motor que no pasaba por una acción.
7. **Dónde declara la época sus tipos de parámetro.** En `epoch.9.2.0.3`, la cabecera de los tipos, con el molde de un parámetro, combinado al heredar. La alternativa es que un tipo de parámetro sea un «tipo» (plantilla de datos) de una sola posición. *Recomiendo `9.2.0.3`:* un tipo describe un registro entero y un tipo de parámetro, un valor; mezclarlos confunde.
8. **La lista cerrada de bases y sus facetas.** text, number, identity, ref, instant, level, tenfold, file {ref, format, size} y book {id, line keys, headers url}. *Recomiendo esa lista,* y **dejar fuera de book la faceta «mi alta allí»** salvo en la época del libro de cuenta: enlaza mis identidades entre libros.
9. **Que las opciones de book (y de file) sean solo del dispositivo,** y que el libro solo pueda filtrarlas. *Recomiendo que sí.*
10. **Que un libro no pueda retocar las frases que unen** el porqué («why …»). Sí sus etiquetas, marcadas como del libro. *Recomiendo que sí.*
11. **El porqué solo a petición** (al pulsar), y que el 9 de las reglas siga como título. *Recomiendo que sí,* por el coste: explicar todas las acciones de cada pantalla al pintar multiplica las evaluaciones.
12. **El porqué de las reglas del eje en una fase 2,** cuando asiente la tanda en `eje.js`. *Recomiendo que sí;* lo de las acciones y los parámetros no toca el eje y va antes.
13. **`datos/provisional/` como sitio de lo que irá a la 0,** leído siempre detrás de la época y con una prueba de que no choca con ella. *Recomiendo que sí,* con la misma idea que el archivo de la lente del apartado 10.
14. **Las filas de una décupla.** Recorrer las posiciones de una décupla de la época se escribe hoy con el rodeo FILAS(D) (6.2). La alternativa es una palabra para eso. *Recomiendo dejar el rodeo* y no añadir palabra («ninguna palabra más por ahora», VG 12-11), salvo que al medir X.4.9 cueste de más.

Un hallazgo que no pido decidir aquí, pero conviene saber: entregar las plazas de Booking es «pay», porque su serie es E y la estación de E es pagar (6.1, punto 3).

## Lo que no he mirado

- **Ninguna fórmula nueva está ejecutada.** `row`, `apply`, `with` y `each (e)` no están en este árbol, así que el coste de X.4.9 y de X.9.8 no está medido. Lo que sí está medido es lo que ya da hoy BQL desde X.4.8 y el porqué de «consume», parte a parte.
- **El tutorial** dentro de X.9.8 (le falta resolver el tipo de X por el nombre de su 5) y la regla de «hecho» (`hechoEnSuAncla`).
- **El recuento en un ejemplo:** no hay ninguno en `ejemplos/` que declare recuento (está en `docs/MOTOR.md` §4.3 y en las pruebas). La fila RECUENTO está escrita, sin probar.
- **`carta/dom.js`**, cómo pintar el control book y una acción apagada; **`carta/puente.js`** más allá de sus nombres («traer de otro libro» necesitaría un tercer tipo base, «un registro de otro libro», que no propongo); el servidor; la guía y el agente de dentro como lectores de X.4.9 y del porqué.
- **Las acciones de la hija state:** las he contado, no leído.
- **Si una hija puede heredar la cabecera `9.2.0` y añadir su `0.3`** sin tapar la de la 0. `COLECCIONES` trabaja por camino, y esa ruta hay que probarla al construir.

---

## Construido (Core AGRAM 18-11, por encargo; las decisiones, supuestos por confirmar con VG)

**El 7, paso 1, solo el núcleo:**

- **`src/tipos.js`:** `TIPOS_BASE`, `resolverTipo`, `tiposDeParametro` y `valeElValor`, expuestos en `contrato`.
- **Lo provisional:** `src/provisional.js` y `datos/provisional/tipos.json`, con cinco tipos: an id, a positive number, a text, an identity with alta y another book.
- **`parametros()` y `preparar()`** con todas las validaciones; `archivoDe` por faceta y por el 4.
- **`'9.2.0.3'`** en `COLECCIONES`.
- **Las opciones:** `opciones()` con el hueco del aparato (`opcionesDelAparato`).
- **La prueba:** `test/tipos-parametro.test.js`.

En qué se aparta de lo de arriba:

1. **Un JSON por clase, no una carpeta.** `datos/provisional/tipos.json` y no `tipos/*.json`, con su copia importable generada (`datos/provisional/generar.mjs` escribe `tipos.js` y `lecturas.js`; `test/provisional.test.js` comprueba que están al día): el patrón de la casa, sin módulos JSON.
2. **`tipo` sigue siendo la base** (lo que lee la carta). El tipo declarado va en `declarado`.
3. **Un tipo declarado fija su faceta:** un parámetro no se la cambia. Para otra faceta del mismo control, se nombra la base: `["book", "line keys"]`.
4. **«Mi alta allí» no es faceta de book.**
5. **La forma del motivo de un parámetro no cambia:** cuál de las validaciones falló, lo dirá el 8.

**El 6, sin la carta:**

- **La lectura:** «what is missing» en `datos/provisional/lecturas.json`, que el contexto materializa en X.4.9 detrás de las lecturas de la época, nunca encima.
- **La lectura en el motor:** `motor.loQueFalta(eje, X, { memoria })`; `motor.siguiente` y `acciones.camino` la leen.
- **La prueba:** `test/lo-que-falta.test.js`.

Lo medido, en ocupantes del presupuesto y pasos:

| Ejemplo | Sin memoria | Con memoria, la primera vez | La segunda |
|---|---|---|---|
| Booking (reserva sin confirmar) | 1 993 (831) | 361 (175) | 0 (1) |
| Tasks (hasta «entregada») | 3 635 (1 590) | 640 (383) | 0 (1) |

Lo que queda:

- **`transaccion` se queda en `siguiente`.** Los ejemplos y sus pruebas escriben con sus movimientos exactos. `plantilla` ya es la acción de la fila («pay»).
- **El tutorial y las sugerencias** siguen en `camino`, en JavaScript.

**Después (Core AGRAM 18-11):**

- **Lo provisional es una copia importable generada.** `datos/provisional/generar.mjs` escribe `tipos.js`, `lecturas.js` y `finales.js`. No hay módulos JSON en `src/`, y `test/provisional.test.js` comprueba que las copias están al día.
- **La memoria:** `siguiente` y `camino` aceptan `memoria` y se la pasan a la lectura.
- **`camino` lee X.9.8** («path steps»: las filas de X.4.9, las peticiones de atención y las caducidades próximas), con la época, el reloj `t` y la memoria que se le pasen. Las acciones salen de las filas, y sus parámetros también (el 8 de la fila: nombre, valor…). «attend» y «expire something mine» dejan de nombrarse.
- **Los finales del proceso son dato:** `datos/provisional/finales.json` (plantilla de cerrado, fin, acción, antes o después). `motor.FINES` sale de ahí, y el motor no nombra «close with error», «expire» ni «close by decision». Dónde vive la causa de cada final (el 0 o el 2.1 del registro que lo escribe) sigue en `motor.finDe`.
- **`cohortes()` lee el tipo provisional «cohort»,** no el parámetro de «change cohort». `cohorteEscrita` sigue buscando el registro por esa acción.
- **La deuda de `nucleo-limpio`** pasa de 27 a 21 nombres.
- **Pruebas:** `test/camino-reglas.test.js` y `test/provisional.test.js`.

## Tercera tanda (Core AGRAM 18-11)

**1. El texto de una petición de atención.** Si el payload de la petición es un texto, `camino` ya no enseña su primer carácter: enseña el texto entero, y si es una décupla, su 0.

**2. Lo que cuesta una lectura de pantalla, de verdad.** `motor.filasEn` lee en un contexto de pantalla (`new ContextoEje(eje, { pantalla: { memoria } })`). Así, las lecturas de la época que encuentra por dentro (X.4.9 dentro de X.9.8, «stage» dentro de X.4.9) pagan del mismo presupuesto y usan la misma memoria. Antes, cada una iba con un presupuesto propio que no se contaba y nunca pasaba por la memoria.

- **Las reglas no cambian:** solo un contexto creado para una pantalla lee así, y una regla nunca lo crea.
- **Una lectura con `keep`** (que en una regla no vale) se sigue leyendo como en una regla.
- **La memoria se comparte:** un registro de dentro se nombra por su id, y X.4.9 leída sola o por dentro de X.9.8 es la misma entrada de la memoria.

Lo que cuesta ahora, en ocupantes del presupuesto (pasos entre paréntesis), con `ahora` = 2026-11-20T18:00:00Z:

| Lectura | Sin memoria | Con memoria, la primera vez | La segunda |
|---|---|---|---|
| Booking, reserva, X.4.9 | 2 806 (1 409) | 802 (594) | 0 (1) |
| Booking, reserva, X.9.8 | 2 914 (1 478) | 910 (663) | 0 (1) |
| Booking, habitación, X.4.9 | 1 368 (583) | 348 (173) | 0 (1) |
| Booking, habitación, X.9.8 | 2 507 (1 298) | 1 159 (847) | 0 (1) |
| Booking, alta de la casa, X.4.9 | 125 (73) | 125 (73) | 0 (1) |
| Booking, alta de la casa, X.9.8 | 1 265 (792) | 937 (751) | 0 (1) |
| Tasks, tarea, X.4.9 | 3 684 (1 659) | 689 (452) | 0 (1) |
| Tasks, tarea, X.9.8 | 3 800 (1 734) | 805 (527) | 0 (1) |

Con X.4.9 ya en la memoria (por ejemplo, al pintar la fila), X.9.8 de la reserva cuesta 108 en vez de 910. Antes se informaban 1 993 y 3 635 para X.4.9 de Booking y de Tasks: no contaban «stage», que X.4.9 lee por dentro.

**3. La fila trae lo que hace falta; `camino` no distingue por nombre.** La forma de cada fila de X.4.9 y X.9.8:

| Posición | Qué es |
|---|---|
| 0 | qué se mueve |
| 1 | cuánto |
| 2 | la regla o lectura que lo pide: su mensaje encabeza el texto |
| 3 | quién: 3.0 quién actúa (nadie si es quien tenga la acción ofrecida), 3.1 a quién |
| 4 | qué se hace: 4.0 la acción, 4.1 sobre qué registro se lanza |
| 5 | el registro del que trata |
| 6 | para cuándo |
| 7 | lo que hay |
| 8 | los parámetros de la acción, como pares nombre, valor |
| 9 | el texto: piezas que se leen seguidas; detrás, los movimientos legibles si la fila tiene a quién |

`camino` agrupa las filas que solo se diferencian en el movimiento (los de un anuncio que mueve la misma persona). Por cada grupo:

- **Es un paso mío** si me nombra o no nombra a nadie, y si la acción se me ofrece sobre su 4.1.
- **Si no, es una espera** de quien nombra (o del dueño de X).

Ya no se nombra ninguna regla ni acción en `camino` (`test/camino-reglas.test.js` lo mira).

Cambios que se notan:

- **El recuento** dice «weight» en su 2 y su texto en su 9 («the tally of g with weighted mean gives 0 and asks above 0.4»). Su 3.0 queda vacío: quien tenga «commit P» ofrecida.
- **La caducidad** lleva en su 2 la regla «E is tied to a record that exists»: su texto empieza ahora por el mensaje de esa regla.
- **Un paso mío de lo anunciado** pasa por la misma comprobación de oferta que los demás.
- **Lo anunciado que una persona ya movió entero** deja de salir como paso suyo.

**4. La cohorte elegida es dato.** La lectura provisional «chosen cohort» en X.8.5 (frente a otros · dónde encaja) da una fila: 0 la cohorte y 1 el registro que la dice. Ese registro es el último del dueño de X anclado en su 8 que dice «change cohort» en su 4, y ese nombre está en la fórmula, no en el núcleo. `contrato.cohorteEscrita` lee `(first it.8).5`. «change cohort» sale de `contrato.js`, y la deuda de `nucleo-limpio` baja a 20 nombres.

**5. Dónde vive el dato de cada final es dato.** Las filas de `datos/provisional/finales.json` llevan en su 4 qué dato da el registro que escribe ese final y en qué posición: `["causa", "0"]` para el cerrado con error y el cerrado por decisión, `["plazo", "2.1"]` para el caducado. La procedencia pasa al 5. `motor.finDe` lee esa columna; `cerrado` devuelve `causa` y `plazo` como siempre (null el que no toca) y `siguiente` da el que diga la fila.

**6. El tutorial y las sugerencias de `camino`: diagnóstico (no se cambian).**

*El tutorial* (fuente «tutorial») es la lista de nombres que hay en el 9 de tres sitios, juntos y en este orden:

1. el tipo de X (el tipo que X nombra en su 5, entre los de `epoch.9.2`);
2. si X es mi alta y su tipo no trae camino propio, la plantilla de identidad (`epoch.3.0.9`);
3. el payload de X.

Cada nombre que es una acción da un paso mío. Está «hecho» si hay un registro mío, o de una cosa mía, donde esa acción escribe (`hechoEnSuAncla`, con su 5 y sus huecos). Cada nombre que es una regla da un paso que no se lanza. Para una de ellas, `camino` sabe por su nombre qué mirar: «a key is declared at its alta» es si el autor del alta tiene clave. Es el único nombre de regla que queda en `camino`; la guarda solo cuenta acciones y no lo ve.

- **¿Podría ser filas de X.9.8?** La mitad sí.
  - Qué nombres pide el camino y en qué orden no depende de quién mira. Con `with` y `FILAS(epoch.9.2)` se escribe ya: se busca el tipo por el nombre de su 5. Lo que el §15.2 daba por pendiente hoy se resuelve con el rodeo de las filas.
  - Lo que depende de quién mira, «hecho por mí o por una cosa mía», no puede ir en una lectura sin `me`. Se quedaría en `camino`, como la comprobación de que la acción se me ofrece: genérico, sobre el 4.1 de la fila.
  - La regla «a key is declared at its alta» pasaría a ser lo que hay en la fila (su 7: si el alta declara la clave, `count (first it.5) > 1`), sin nombre en el código.
- **Recomendación:** una quinta clase de filas de X.9.8, «tutorial». El 4 sería la acción y dónde se lanza, el 5 X y el 7 lo que hay para las reglas. `camino` calcularía «hecho» igual para toda fila que tenga acción.

*Las sugerencias* (fuente «sugerencia») no salen del libro que se mira. Son un gancho que pasa quien llama (`opciones.sugerencias`), y hoy tienen dos orígenes:

- **la guía de mi libro de cuenta:** `guia-libro.sugerenciasDeGuia(ejeGuia, ejeAbierto, X, yo)`, que lee los pasos de guía de OTRO libro;
- **un agente de fuera.**

Cada sugerencia pasa por las mismas reglas: `transaccion` en seco, y `invalida` si no se entiende.

- **¿Podría ser filas de X.9.8?** No. Una lectura del libro abierto no ve el libro de la guía (cruza libros), y un agente de fuera no es dato del libro. Son el borde: el aparato las junta.
- **Recomendación:** que sigan siendo un gancho, con la forma de una fila (`{ accion, lanzar, parametros, texto, porque }`). Así `camino` las pasaría por el mismo bucle que las filas, con la comprobación en seco que ya llevan. La lectura de los pasos de una guía sí podría ser una lectura del libro de la guía; ese es otro carril, el de la guía.

**7. «Va antes»: lo que encadena las tareas es dato.** La décupla «chains» de `datos/provisional/cadenas.json` (con su copia generada) dice:

- 1, la acción de la relación («this goes after»);
- 2, dónde la ancla el autor de la tarea («2.6»);
- 3, dónde lleva las anteriores («6»);
- 4, el tipo de una tarea («task»);
- 5, la acción que la cierra («close»);
- 7, la que la entrega («deliver»).

`src/cadenas.js` la lee y `NOMBRES_DE_LAS_CADENAS` sale de ahí. Ya no nombra ninguna acción, y la deuda de `nucleo-limpio` baja a 17 nombres. Su sitio final no es la época 0 sino la época que define la relación (hoy, la hija del roadmap). Esa decisión es de la pasada única.

**8. La tabla de gestos, del lado del núcleo. SUPUESTO POR CONFIRMAR CON VG.**

- **La lista:** `datos/provisional/gestos.json`, con su copia generada, es la lista cerrada de los verbos de la lente: focus (enfocar), enter (entrar), turn (girar), change level (cambiar de nivel), launch (lanzar), compose (componer) y execute (ejecutar).
- **Cada gesto** dice sus parámetros en su orden, con un tipo de parámetro de `src/tipos.js`. Cuatro tipos provisionales más:
  - «a record»: un registro de este libro;
  - «a view»: un dígito;
  - «a lens level»: un entero de 0 en adelante;
  - «an action»: una acción de la época del libro, `it in (epoch.9.6.1 each 0)`.
- **En `contrato`:**
  - `contrato.gestos(eje)` da la lista con cada parámetro resuelto;
  - `contrato.validarGesto(eje, destino)` dice si vale un destino «gesto». Es una décupla con «gesture» en su 0, el nombre en su 1 y, desde su 2, los valores en su orden. Los motivos son «forma», «no es un gesto», «falta», «sobran», «no vale» y «tipo».
- **Lo que no hace:** no ejecuta nada, y no toca la carta ni las plantillas de zona y paso. Que una zona o un paso nombre un gesto como destino es otro carril.
- **Prueba:** `test/gestos.test.js`.

## Cuarta tanda (Core AGRAM 18-11)

**1. El tutorial, quinta clase de filas de X.9.8.** «path steps» lleva delante el tutorial: los nombres del 9 de tres sitios, en este orden:

- **el tipo de X:** lo primero de su 5 que lleva a una plantilla (una referencia, un id o el nombre de una plantilla de dominio de la época, con sus grupos, o de la de preferencias);
- **la plantilla de identidad** (`epoch.3.0.9`), si X es un alta y el 9 de su tipo no nombra ninguna acción;
- **el propio X.**

La fila crece en tres cosas, todas dato:

- **su 2 puede ser [por qué, de dónde viene]:** «tutorial» en su 2.1;
- **su 3.2 dice quién la ve:** las filas de la identidad, solo el dueño del alta;
- **su 7 dice cómo se sabe si está hecha:** «by its anchor» (lo dice su ancla, para quien mira, y es un paso mío sin comprobar oferta, como antes) o, para una regla, verdadero o falso. La regla «a key is declared at its alta» pasa a ser `count (first it.3).6.5 > 1` en la fórmula, no un nombre en el código.

`camino` ya no tiene bloque de tutorial: el mismo bucle que las demás filas, sin nombres. Medido contra el JavaScript de antes, en los 96 casos de Booking y Tasks (cada registro, cada identidad), los pasos del tutorial salen iguales y en el mismo orden.

- **Lo que no se busca:** las plantillas que define un libro y se nombran por su nombre (por su id o una referencia, sí). El JavaScript de antes sí las buscaba, pero recorría el libro entero; ningún ejemplo ni prueba las usa.
- **Un cambio pequeño:** la caducidad dice «expiry» en su 2, porque el mensaje de la regla que llevaba antes era el de un fallo. Su texto vuelve a empezar por «expiry».

**2. Lo que cuesta, con el tutorial dentro.** Ocupantes del presupuesto, con `ahora` = 2026-11-20T18:00:00Z; se mide con `node test/medida-camino.mjs`. Las peticiones de atención se buscan ahora solo si X es un alta: antes se recorría todo lo que movió el dueño de X para cualquier X, y eso hacía crecer la última compra con el libro.

| Lectura | X.4.9 | X.9.8 sin memoria | X.9.8 con memoria, la primera vez | La segunda |
|---|---|---|---|---|
| Booking (17 registros), reserva | 2 838 | 3 356 | 1 343 | 0 |
| Booking, habitación | 1 368 | 2 320 | 963 | 0 |
| Booking, alta de la casa (es el génesis) | 125 | 5 576 | 2 484 | 0 |
| Tasks (15), tarea | 3 700 | 5 498 | 2 494 | 0 |
| Compra ×10 (27 registros), menú | 1 391 | 1 433 | 404 | 0 |
| Compra ×10, alta de la huésped | 104 | 4 565 | 1 801 | 0 |
| Compra ×10, génesis | 116 | 4 391 | 1 627 | 0 |
| Compra ×10, última compra | 948 | 994 | 577 | 0 |
| Compra ×30 (67), menú | 1 451 | 1 493 | 464 | 0 |
| Compra ×30, alta de la huésped | 104 | 5 045 | 2 281 | 0 |
| Compra ×30, última compra | 948 | 994 | 577 | 0 |
| Compra ×60 (127), menú | 1 541 | 1 583 | 554 | 0 |
| Compra ×60, alta de la huésped | 104 | 5 765 | 3 001 | 0 |
| Compra ×60, génesis | 116 | 4 391 | 1 627 | 0 |
| Compra ×60, última compra | 948 | 994 | 577 | 0 |

Qué dice la tabla:

- **El tutorial de un alta cuesta unos 4 300 sin memoria.** Lo caro es buscar el tipo entre las plantillas de la época y mirar cada nombre entre las 74 acciones y las 104 reglas. Con memoria se queda en algo más de 2 000, porque esas listas son subexpresiones cerradas.
- **Cabe en los 10 000 de hoy:** sin memoria, el máximo medido es 5 765, un 42 % de holgura; con memoria, la primera vez 3 001.
- **Lo que crece con el libro** es el alta de quien más mueve: unos 24 ocupantes por compra. Las peticiones de atención salen de todo lo que movió el dueño del alta. A ese ritmo, sin memoria, el alta de una persona con unas 230 compras pasaría de 10 000.
- **El menú, una compra y el génesis apenas crecen.**

Si hace falta, el remedio es un índice: leer las devoluciones de R a una identidad sin recorrer todo lo que movió. Es la misma clase de índice que `cited` (quién me nombra).

**3. Lo anunciado «como antes» y `anuncioDe`.**

- **Nada usa ya `anuncioDe`** (ni `src/`, ni la carta, ni los ejemplos, ni las pruebas); lo comprueba `test/camino-reglas.test.js`.
- **Los ejemplos de `ejemplos/` solo escriben lo anunciado de ahora**, un movimiento con estado «anunciado»: Booking, Tasks, la compra y el volcado del roadmap.
- **Lo anunciado «como antes»**, un payload `[[serie], [cuánto], [para qué], [[de], [a]]]` en el 4.1, solo lo escriben las pruebas, como libros de ensayo: `motor`, `acciones`, `contrato`, `efectos`, `conformidad-motor`, `ejemplo-booking`, `carta-mapped`, `sitios-y-pesos` y `tiempo`. Sigue saliendo: la lectura X.4.9 tiene su rama para él (su texto es el 2 del payload; el movimiento, el de su payload). Una prueba nueva compara un anuncio de antes con el mismo anuncio de ahora: el mismo paso («pay»), el mismo texto y la misma espera para el otro.
- **Si se quiere retirar la forma de antes**, hay que cambiar esas pruebas y quitar la rama de la lectura (y la de «stage», que también la lee). Es una decisión para la pasada única.
