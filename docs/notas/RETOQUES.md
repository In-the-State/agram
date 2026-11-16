# Retocar un texto en su sitio (A20, escalón 1)

VG 17-11 por Core State, sobre `agram-equipo/COSTE_A20_RETOQUES.md`. Solo textos: las reglas, los parámetros, los estilos y el orden de las acciones **no se retocan aún** (escalón 2, otro sprint).

## Qué es

El id de una época la nombra **tal como nació**. Corregir un texto no la cambia: se escribe un **retoque**, un registro normal del libro con la plantilla «retouch a text» (época 0, `[0, 4]`), lanzada sobre el génesis y anclada en su **9.4**. Lleva el idioma, la clave y el texto en su 1.0, 1.1 y 1.2. Va firmado y pagado con T como cualquier otro, sin más movimientos. Sin texto (no se da el parámetro: un texto vacío no es un terminal BTML) **retira** los retoques de esa clave en ese idioma y vuelve el texto de nacimiento.

El retoque es **de ese libro**: otro libro con la misma época no lo ve. Restaurar el libro desde sus registros da los mismos textos.

## Quién

La regla de la época «only the owner of the book retouches a text» (en BQL, con mensaje en «en» y «es»): solo vale el retoque del autor del génesis, el dueño del libro. En un eje de nodo, el operador. La lectura lo vuelve a mirar, por un libro de otra época que no traiga la regla.

VG 17-11: las piezas de la época nunca se deciden por recuento abierto ni por cantidad bruta de P; «nacen con el dueño y se amplían por nombre». Ampliar el retoque a quien el dueño nombre en el 2.3 del génesis, pesado como lo pesa «weight» (por reparto; «cualquiera» no abre nada), no salía limpio y corto en BQL sin primitivas nuevas, y la fila `epoch.7.9` quedó reservada. Desde el encargo A21 (17-11) esa fila es **«governance»**, el gobierno del cambio de reglas (`docs/notas/GOBIERNO.md`): no abre el retoque, que sigue siendo solo del dueño.

`7.8` no tiene nada propio: guarda el sitio para que exista la 7.9 (una décupla no tiene huecos).

## El orden de lectura

1. Los textos de nacimiento de la 0 (`epoch.9.4`).
2. La **hoja de retoques de la 0** (`datos/epocas/retoques-0.json`: `[idioma, clave, texto]`, nace vacía). Va fuera del id: corregir aquí un texto del repositorio ya no cambia el id de la 0.
3. Los textos de la época hija (state, SIP…).
4. Los retoques del libro (solo con un eje delante): entre los de la misma clave e idioma gana el último por **instante** del registro y, a igualdad, por **id**. Nunca por el orden de entrada, que cambia entre réplicas.

Vale para `contrato.texto` y `contrato.mensaje` (el nombre de la regla es su clave) y para todo lo que lee por ellos. `contrato.idiomas(eje)` cuenta los idiomas que solo existen por retoques. Sin eje, todo sigue como antes. La caché de los textos de la época sigue por raíz. La de los retoques va por eje y época, y se rehace cuando cambian los registros anclados en el 9.4 del génesis.

## Los huecos

Los `{…}` de un texto son expresiones BQL que se evalúan (`rellenar`). Un retoque (o una entrada de la hoja) cuyos huecos no sean un **subconjunto exacto**, carácter a carácter, de los del texto de nacimiento de esa clave en ese idioma **se ignora** en la lectura, como si no existiera. Para un idioma nuevo se compara con el original: el del registro «en», el 9 de la regla o de la plantilla, o el de cualquier idioma, que conserva los huecos. Un texto que es una fórmula (`=…`) tampoco vale; `==` escapa un texto que empieza por «=».

El texto es un dato: nunca HTML ni estilo. El núcleo lo devuelve tal cual y la carta lo escapa.

## Lo que no es texto

El nombre de una plantilla, de una regla o de una lectura (su 0, en inglés) es una **clave** y no se retoca: se retoca su traducción («template pay», el nombre de la regla para su mensaje). Una clave que no existe en la época y no empieza por «carta » no hace nada.

## Para la carta

Sus textos propios (`carta/textos.js`) se retocan con la clave «carta <clave>». El núcleo los guarda y los devuelve tal cual; sus huecos los comprueba la carta. El contrato le deja `retoque`, `retoques`, `puedeRetocar` y `conClaves` (la clave con que se leyó cada texto); están en `docs/CONTRATO.md` §8.1 bis. Pruebas: `test/retoques.test.js`.
