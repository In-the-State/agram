# Padres y copias: quién guarda cada elemento, y la línea de antes de firmar

Core AGRAM, 16-11 (encargo «padres y copias», A19; N1 y N2 de `agram-equipo/REPLANTEO_AGRAM_2026-11-16.md`), rama `beta-padres`. Decisiones de VG del 16-11 en `state/ANCLAJE_EN_CASCADA.md` §7 (puntos 3, 4, 5 y 7) y lo técnico que ordena Core State en `state/REPLANTEO_CASCADA.md`. **Estado:** en la beta, sin aceptar.

> «Copias y padres son lo mismo, y son configurables: ninguno, uno o varios.» «Varios padres, cada uno con su parte.» «Los padres son testigos, no jueces.» La configuración cuelga de un elemento y se hereda hacia abajo. «Transparente no es invisible»: antes de firmar, la carta dice en una línea quién va a guardar lo que escribes.

## Qué hay (época 0)

| Pieza | Qué es |
|---|---|
| **add a parent** (añadir un padre, PV9, orden 5) | Un registro por padre, en el 9 del elemento sobre el que se lanza (cualquier registro). Posiciones abajo |
| **remove a parent** (quitar un padre, PV9, orden 6) | En el 9 del mismo elemento: 0 el mensaje, 1 la referencia al padre (por defecto, el último), 2 la plantilla de cerrado, 3 quién, 4 la acción. Las de vencimiento que había no sirven: «expire something mine» quema E mía y «expire» cierra un proceso con un plazo vencido |
| **set the kind of owner** (decir de quién es, PV9, orden 7) | En el 9 del elemento: 0 la clase (una de `epoch.7.5.1`: person, group, company, provider), 1 el elemento, 2 la plantilla de cerrado, 3 quién, 4 la acción |
| **only the owner sets who keeps it** (regla) | Las tres solo valen si su autor escribió el elemento del que cuelgan o el génesis del libro. Cabe en el BQL mínimo, sin primitivas nuevas |
| `contrato.custodia(eje, id)` | `{ de, heredado, padres, clase, plazo }` (`docs/CONTRATO.md` §7.2) |
| `contrato.quienGuarda(eje, yo, sobre)` | `{ nodo, padres: [{ nombre, guarda, sella }], de }`: la línea de antes de firmar |
| `acciones.sobreDe(eje, plantilla, params, yo)` | de qué registro colgará lo que escribe una plantilla (X o el que nombra su 5): lo que la carta pasa como `sobre` |
| la carta | el bloque «quién guarda esto» («este libro» en la raíz) en el reverso, y la línea junto al botón de cualquier formulario que escribe |

**El registro de un padre** (sin huecos ni rellenos: lo opcional cierra su propia décupla, así que falte lo que falte no queda hueco; no es la forma de claves y valores de los ajustes porque cada parámetro de una plantilla tiene una posición fija):

| Posición | Lleva |
|---|---|
| 0 | el nombre (lo que es) |
| 1.0 | qué hace: `keeps` (guarda la copia cifrada), `seals` (sella hacia arriba) o `keeps and seals` |
| 1.1 | opcional: el nivel en que sella, un número de `epoch.7.6.1` |
| 2.0 | la clave x-only (64 hex en minúsculas) con que firma sus cabeceras de lote |
| 2.1 | opcional: el grado que declara (opaco, como el del eslabón: un número o un texto corto) |
| 3.0 | quién lo pone (`me`) |
| 3.1 | opcional: su dirección, http o https |
| 4 | `add a parent` |

Ejemplo: `[["universidad"], [["seals"], [3]], [["<64 hex>"], ["1"]], [["ana"], ["https://padre.ejemplo.org"]], ["add a parent"]]`.

**La herencia.** La rama de un registro es la del elemento más cercano hacia arriba por su hilo (`sobre`), él incluido, que tenga algún padre vivo. Un elemento con su propia configuración tapa la de arriba en su rama (no se suman). Quitar el último padre de un elemento lo deja heredando la de arriba. La clase del dueño se hereda igual pero aparte (puede venir de otro elemento); en un elemento manda la última; sin ninguna, la clase del plazo más largo de 7.5 (hoy person, el año).

**Quién puede.** Es una regla de validez de la época 0 y además una comprobación del contrato al leer (por un libro escrito antes de la regla). Las plantillas solo se ofrecen a quien puede.

## Lo que leerá el nodo (Core AARPIA)

- Para saber a qué padres manda cada registro: `contrato.custodia(eje, id).padres` (o la misma lectura en sus propios términos: los registros con `add a parent` en su 4 anclados en el 9 de un elemento, menos los que refiere un `remove a parent` del mismo 9, solo de quien escribió el elemento o del génesis; subir por `sobre` hasta el primer elemento con alguno vivo). `de` es la rama: lo que comparte `de` va al mismo grupo de padres.
- De cada padre: `clave` (la que firmará sus cabeceras de lote: es la que el nodo debe esperar en sus recibos), `guarda` y `sella`, `nivel` y `grado` si los declara, y `url` (dónde encontrarlo; nada secreto: el registro no lleva credenciales y el contrato descarta una dirección que las lleve).
- El plazo por defecto: `contrato.custodia(eje, id).plazo` (`{ escala, segundos }` de 7.5 por la clase del dueño). Otro agente añade `plazoDeSuelo(eje, id)`; Core la conecta con esta `clase` al fundir.
- Todo es configuración de un libro escrita con plantillas de la época: la interfaz de AARPIA puede lanzarlas como cualquier acción (modo `person`).

## Lo que queda

- **Preguntas abiertas de VG, fuera de este encargo** (nada aquí las da por contestadas): que quien te invita sea tu padre por defecto (V1); la operación que enlaza dos elementos (V7: aquí la rama es solo la del elemento del que cuelga el registro); con qué clave se cifra (V4); la compensación al padre; lo que tiene la persona sola el primer día (V2).
- **«Ninguno» bajo un elemento que hereda padres** no se puede decir: quitar todos los padres de un elemento vuelve a heredar los de arriba. Si VG quiere un «sin padres aquí» explícito, es otra plantilla o un valor.
- **El BQL mínimo no lee textos**: la plantilla no puede rechazar una dirección con credenciales ni un grado largo. El contrato da la dirección como null si no es http(s) o lleva credenciales; el grado sale tal cual.
- **Orden en el PV9** (5, 6 y 7): elegido para no pisar los de la época hija de StateArk (PV1, órdenes 7, 8 y 10) ni el siguiente libre del PV1, que puede tomar a la vez el encargo de la escala de T. Si Core prefiere el PV1, es cambiar el 8 de las tres.
- **El nodo** de la línea es el nombre de máquina de la dirección del transporte (relé o «sync url»): sin puerto.
