# Retirada de BQL V0 (#113)

VG decidió que no conviven dos lenguajes (#113; revisión del paquete externo del 15-11). El V0 (`src/bql.js`, funciones en mayúsculas) solo seguía vivo para las fórmulas escritas en el payload de un registro y para la web antigua. Desde este encargo, una fórmula del payload es **BQL mínimo** (`docs/BQLM.md` §14): `it` es el registro que la lleva, lee lo escrito (`payload(it)`, o el `payload` de otro registro por su id entero), da números y no encadena. La web antigua (`antigua/`) se borra y la carta se queda con los tres módulos que tomaba de ella.

## Doble ejecución

`test/doble-ejecucion.test.js` (temporal: se borró con `src/bql.js`) evaluó cada fórmula de los tres ejemplos (compra, reserva, tarea) y de los fixtures con fórmulas (las compras vecinas y las compras hermanas) dos veces sobre el mismo libro: la vieja con el V0 (puesta en su sitio en una vista del registro, con el payload de antes) y la nueva con el BQL mínimo. Las cantidades coinciden; la unidad va aparte (la nueva la lleva escrita en el .2 de la magnitud desplegada).

| Fórmula | Vieja (V0) | Nueva (BQL mínimo) | Resultado viejo | Resultado nuevo |
|---|---|---|---|---|
| cuenta, 1: precio de la compra + propina | `=REF("<id8>", "1200000000") + 2 EUR` | 1.1: `=(payload("<id de la compra>")).1.2.1 + 2`, 1.2: `EUR` | 14 EUR | 14 EUR |
| vecina, 1: espera la posición 5 | `=LOCAL(5)` | `=(payload(it)).5 + 0` | PENDIENTE | PENDIENTE |
| vecina, 1.1: la cantidad de la 1.0 + 1 | `=LOCAL(0, 0) + 1 EUR` | 1.1.1: `=(payload(it)).1.0.1 + 1`, 1.1.2: `EUR` | 11 EUR | 11 EUR |
| dos guisos, 1.2: 2 × 6 | `=2 * 6 EUR` | 1.2.1: `=2 * 6`, 1.2.2: `EUR` | 12 EUR | 12 EUR |
| sopa, 1.2: 9 − 2 | `=9 EUR - 2 EUR` | 1.2.1: `=9 - 2`, 1.2.2: `EUR` | 7 EUR | 7 EUR |
| dos guisos, 4[1]: espera la 9 | `=LOCAL(9)` | `=(payload(it)).9 + 0` | PENDIENTE | PENDIENTE |
| reserva, 1.3: precio por noche × noches | `=LOCAL(2) * LOCAL(1)` | 1.3.1: `=(payload(it)).1.2.1 * (payload(it)).1.1`, 1.3.2: `EUR` | 165 EUR | 165 EUR |
| tarea, 1.1: coste total | `=LOCAL(0, 1) + LOCAL(0, 2) + LOCAL(0, 3)` | 1.1.1: `=sum (payload(it)).1.0.1`, 1.1.2: `EUR` | 350 EUR | 350 EUR |
| tarea, 4.1: tiempo previsto | `=LOCAL(0, 1, 1) + LOCAL(0, 2, 1) + LOCAL(0, 3, 1) + LOCAL(0, 4, 1)` | 4.1.1: `=(nth 1 (payload(it)).4.0.1).1 + … + (nth 1 (payload(it)).4.0.4).1`, 4.1.2: `h` | 7 h | 7 h |
| tarea, 8: la composición «EUR + horas» | `=LOCAL(1, 1) + LOCAL(4, 1)` | 8.1.1: `=sum (payload(it)).1.0.1` (8.1.2 `EUR`) y 8.2.1: la del tiempo (8.2.2 `h`) | 350 EUR + 7 h | 350 EUR y 7 h |
| tarea, 9: el primer presupuesto que cabe | `=ELEGIR(FILTRAR(FILTRAR(BUSCAR(LOCAL(5)), ORIGEN() = "escrito"), Y(ACTUAL(1) <= LOCAL(1, 1), ACTUAL(2) <= LOCAL(2, 1))))` | `=first (down it where last it2.6.5 = first (payload(it)).5 and (first it2.3 = first it.3 or first it2.3 in (payload(it)).3) and (payload(it2)).1.1 <= sum (payload(it)).1.0.1 and (payload(it2)).2.1 <= (nth 1 (payload(it)).2).1)` | el corregido | el corregido |
| tarea, 9: sin presupuestos | la misma | la misma | ninguno | ninguno (∅) |
| tarea, 9: uno ajeno (de la casa), el caro, uno lento y el que cabe | la misma | la misma | el que cabe | el que cabe |
| tarea, 9: con una nota terminal en el 1 | la misma | la misma | PENDIENTE | PENDIENTE |

## Equivalencias

| V0 | BQL mínimo |
|---|---|
| `LOCAL(n, …)` (la décupla anfitriona) | una posición de `payload(it)`, desde la raíz del registro: `(payload(it)).1.0` (el V0 contaba desde la décupla que lleva el slot) |
| `REF("<id8>", "d…")` | `(payload("<id de 64 hex>")).d.d`: el id entero (el prefijo de 8 no vale). `("<id>").d.d` también es el registro, pero además de lo escrito trae lo que el núcleo lee en él (D-META, sus movimientos en el 1) y lo anclado en esa posición: el 1 de la compra trae la propia cuenta, anclada ahí, y deja de ser un número |
| `BUSCAR(n)`, `BUSCAR("d…")` | una posición, o `down it` (lo anclado sobre el registro) filtrado por su ancla (`last it2.6.5`, el en) |
| `FILTRAR(col, cond)` | `col where cond` (dentro, `it2`… es el elemento) |
| `ORDENAR(col, e)` | `col by e` |
| `ELEGIR(col)`, `ELEGIR(col, k)` | `first col`; `last col`; `nth k col` |
| `CONTAR(col)` · `SUMAR(col)` | `count col` · `sum col` |
| `Y(a, b)` · `O(a, b)` · `NO(a)` | `a and b` · `a or b` · `not a` |
| `ACTUAL(n)` dentro de FILTRAR | `it2.n` (o `(payload(it2)).n` para lo escrito) |
| `ORIGEN() = "escrito"` | lo anclado sobre el registro es `down it`; lo propio, `payload(it)` |
| la elegibilidad de BUSCAR (R8) | se lee en la fórmula: `first it2.3 = first it.3 or first it2.3 in (payload(it)).3` |
| `12 EUR` (magnitud) | solo el número; la magnitud calculada va desplegada: `[[nombre], ["=fórmula"], ["EUR"]]` (la cantidad en su .1, la unidad en su .2; una décupla no tiene posiciones vacías, así que su 0 la nombra) |

## Sin equivalente (se quitan y no se sustituyen)

| V0 | Por qué | Qué pasó en los ejemplos |
|---|---|---|
| sumar magnitudes con unidad (`12 EUR + 2 EUR`) y componer unidades distintas (`14 EUR + 15 min`) | el BQL mínimo solo opera con números (VG 12-11: «ninguna palabra más por ahora») | la cantidad va en el .1 y la unidad, escrita, en el .2. La cuenta, en su 2, deja la composición «euros + minutos» y escribe el terminal `15 min`; la reserva quita su 1.4 (el total compuesto con el tiempo que ocupa); el 8 de la tarea pasa de la composición «EUR + horas» al coste (8.1) y al tiempo (8.2) desplegados |
| encadenar fórmulas (una lee el resultado de otra) | sin encadenar: una fórmula lee lo escrito (decisión 4) | la cuenta, en su 2, leía su 1; la reserva, en su 1.4, leía su 1.3; la tarea, en su 8 y su 9, leía su 1.1 y su 4.1. Ahora cada una suma otra vez lo escrito (las partidas, los pasos) |
| `BASES`, `CAJA`, `FRESCURA` | las bases del 8 se leen con `src/bases.js` (situar, leerBase), no desde una fórmula | ningún ejemplo las usaba en su payload |
| `VALOR_R`, `LENTE` | la lente de R la lee `src/lente.js` | `lente-booking.valorEnBql` se quita (y sus dos líneas de `correr.mjs`) |
| `ORIGEN`, `PRESENTE`, `ACUERDO`, `DESPLAZAMIENTO`, `SIGNO`, `FALTAS`, `EXCEDENTES` | el encaje de un candidato lo calcula `src/encaje.js` (motor.proponer lo añade al candidato) | la elección del 9 ya no pregunta el origen: lee `down it` |
| INCOMPATIBLE y «PENDIENTE DE AUTORIZACIÓN» | tres estados; lo que quien mira no tiene, falta (la vista) | — |

## `puedeLeer`

El V0 aceptaba un gancho `puedeLeer(evId, dir, indices)`: antes de cada lectura (una posición, cada ocupante de BUSCAR y cada salto de referencia) preguntaba si quien consultaba podía leerla y, si no, la fórmula quedaba «PENDIENTE DE AUTORIZACIÓN» (y BASES y CAJA no contaban las fórmulas del anfitrión con gancho). Ningún consumidor del núcleo ni de la carta lo pasaba: solo las pruebas. En el BQL mínimo lo hace la vista: la fórmula se lee sobre la vista que recibe quien la lee (la de la validez es el eje con el registro dentro), y un registro que no está en la vista falta (PENDIENTE, como una referencia ausente). Lo que se pierde: el gancho por posición dentro de un registro que sí está en la vista (leer el 1 de un registro y no su 3); con la vista, un registro se lee entero o no se lee.
