# Padres y copias: quién guarda cada elemento, quién puede leerlo, y la línea de antes de firmar

Core AGRAM, 16-11 (encargo «padres y copias», A19; N1 y N2 de `agram-equipo/REPLANTEO_AGRAM_2026-11-16.md`), rama `beta-padres`. Decisiones de VG del 16-11 en `state/ANCLAJE_EN_CASCADA.md` §7 (puntos 3, 4, 5 y 7) y lo técnico que ordena Core State en `state/REPLANTEO_CASCADA.md`. Ampliado el 17-11 (encargo «puede leer», rama `beta-leer`: V11 y V7 de VG por Core State, el grupo «quién puede leer qué», con las correcciones de Core del mismo día). **Estado:** en la beta, sin aceptar.

> «Copias y padres son lo mismo, y son configurables: ninguno, uno o varios.» «Varios padres, cada uno con su parte.» «Los padres son testigos, no jueces.» La configuración cuelga de un elemento y se hereda hacia abajo. «Transparente no es invisible»: antes de firmar, la carta dice en una línea quién va a guardar lo que escribes. V11: nada queda sin padre; la privacidad es un dato de cada padre, «puede leer»: un padre puede guardar y sellar sin recibir el sobre. V7: una operación que enlaza dos elementos la guardan y la sellan los padres de los dos, entera; leerla depende del «puede leer» de cada uno. Las dos, **definidas por la época y configurables, con resoluciones de base; no reglas fijas en código**.

## Qué hay (época 0)

| Pieza | Qué es |
|---|---|
| **custody defaults** (`epoch.7.7`) | Las resoluciones de base. 0 nombre y explicación; 1 las claves, `parent reads` y `linked operation`; 2 la base de cada una, `yes` y `both`; 3 los valores permitidos de cada una, `[yes, no]` y `[both, own]`. Lo lee `contrato.defectosDeCustodia(epoca)` |
| **add a parent** (añadir un padre, PV9, orden 5) | Un registro por padre, en el 9 del elemento sobre el que se lanza (cualquier registro). Posiciones abajo |
| **remove a parent** (quitar un padre, PV9, orden 6) | En el 9 del mismo elemento: 0 el mensaje, 1 la referencia al padre (por defecto, el último), 2 la plantilla de cerrado, 3 quién, 4 la acción. Las de vencimiento que había no sirven: «expire something mine» quema E mía y «expire» cierra un proceso con un plazo vencido |
| **set the kind of owner** (decir de quién es, PV9, orden 7) | En el 9 del elemento: 0 la clase (una de `epoch.7.5.1`: person, group, company, provider), 1 el elemento, 2 la plantilla de cerrado, 3 quién, 4 la acción |
| **set a custody default** (decidir cómo se guarda aquí, PV9, orden 8) | En el 9 del elemento: 0 la clave (una de `epoch.7.7.1`), 1 el valor (uno de los permitidos de esa clave), 2 la plantilla de cerrado, 3 quién, 4 la acción. Por defecto, la primera clave y su base. Se hereda hacia abajo; en un elemento manda el último de cada clave |
| **only the owner sets who keeps it** (regla) | Las cuatro solo valen si su autor escribió el elemento del que cuelgan o el génesis del libro. Cabe en el BQL mínimo, sin primitivas nuevas |
| `contrato.custodia(eje, id)` | `{ de, padresDe, heredado, padres, clase, plazo, enlaza, ramas, todos }` (`docs/CONTRATO.md` §7.2) |
| `contrato.ramasDelLibro(eje)` | `[{ de, padresDe, padres }]`: todas las ramas del libro |
| `contrato.quienGuarda(eje, yo, sobre, { enlaza })` | `{ nodo, padres: [{ nombre, guarda, sella, lee }], de, enlazadas, todos }`: la línea de antes de firmar |
| `acciones.sobreDe(eje, plantilla, params, yo)` y `acciones.enlazaDe(…)` | de qué registro colgará lo que escribe una plantilla (X o el que nombra su 5) y qué enlazará: lo que la carta pasa como `sobre` y `enlaza` |
| la carta | el bloque «quién guarda esto» («este libro» en la raíz) en el reverso, y la línea junto al botón de cualquier formulario que escribe |

**El registro de un padre** (sin huecos ni rellenos: lo opcional cierra su propia décupla, así que falte lo que falte no queda hueco; no es la forma de claves y valores de los ajustes porque cada parámetro de una plantilla tiene una posición fija):

| Posición | Lleva |
|---|---|
| 0 | el nombre (lo que es) |
| 1.0.0 | qué hace: `keeps` (guarda la copia cifrada), `seals` (sella hacia arriba) o `keeps and seals`. En un registro escrito antes del 17-11 está en 1.0 (sin décupla) y sigue valiendo: se lee la primera hoja de 1.0 |
| 1.0.1 | opcional: si lee (`can read`): `reads` o `does not read` |
| 1.1 | opcional: el nivel en que sella, un número de `epoch.7.6.1` |
| 2.0 | la clave x-only (64 hex en minúsculas) con que firma sus cabeceras de lote |
| 2.1 | opcional: el grado que declara (opaco, como el del eslabón: un número o un texto corto) |
| 3.0 | quién lo pone (`me`) |
| 3.1 | opcional: su dirección, http o https |
| 4 | `add a parent` |

Ejemplo: `[["universidad"], [[["seals"], ["does not read"]], [3]], [["<64 hex>"], ["1"]], [["ana"], ["https://padre.ejemplo.org"]], ["add a parent"]]`.

Por qué la 1.0.1 (decisión de Core AGRAM en el encargo): 0-4 van siempre llenos y cada x.1 ya lo ocupa un opcional (el nivel, el grado, la dirección), así que un 1.2, 2.2 o 3.2 dejaría un hueco cuando falta el de delante (un padre que guarda sin sellar no tiene nivel, y es justo el que más pide «no lee»); del 5 al 9 son el tipo (y las claves declaradas) y las lecturas de cualquier registro. El único sitio sin huecos es abrir la 1.0 como décupla: 1.0.0 qué hace (obligatorio) y 1.0.1 si lee (opcional, cierra su décupla). Por eso qué hace pasa de 1.0 a 1.0.0 en lo que se escribe desde ahora.

**La rama** (Core, 17-11). La rama de un registro, `de`, es el elemento más cercano hacia arriba por su hilo (`sobre`), él incluido, con configuración de custodia propia: algún padre vivo **o** un «set a custody default» de `parent reads`. `linked operation` no abre rama. Sus padres son los del elemento con padres vivos más cercano hacia arriba desde `de`, él incluido (`padresDe`): un elemento con padres tapa los de arriba (no se suman); un elemento sin padres propios que fija `parent reads` abre una rama nueva con los padres heredados y su propia lectura. Quitar el último padre de un elemento sin otra configuración lo deja heredando la de arriba. La clase del dueño se hereda igual pero aparte (puede venir de otro elemento); en un elemento manda la última; sin ninguna, la clase del plazo más largo de 7.5 (hoy person, el año).

**Puede leer** (V11). Lo que diga el registro del padre (`leeDe: 'padre'`); si no dice nada, el `parent reads` del «set a custody default» más cercano hacia arriba **desde la rama** (`de`), él incluido (`'elemento'`); si no hay ninguno, la base de `epoch.7.7` (`'epoca'`). Se resuelve desde la rama y no desde el registro: todos los registros de una misma rama tienen los mismos padres y el mismo «lee». El código sabe qué significa cada valor permitido (`yes`/`no`, `both`/`own`, `reads`/`does not read`) pero no cuál vale por defecto: otra época con otras bases da otro resultado sin tocar el código (`test/padres.test.js`).

**La operación que enlaza dos elementos** (V7). Un registro enlaza los registros del libro que su payload nombra por su id (sus referencias `{ ref }`, leídas como las lee el suelo de referencias, `condiciones/evento.js` `referenciasDe`) y que no son aquel del que cuelga ni él mismo (`contrato.enlacesDe`). Si el `linked operation` que le toca (desde el registro hacia arriba; si no, la época) es `both`, va además a los padres de la rama de cada enlazado; con `own`, solo a los suyos. Hoy enlaza, por ejemplo, «reference X from another record» (cuelga de lo mío y nombra X en su 2).

**El mismo padre por dos ramas** (la misma clave) cuenta una vez para guardar y sellar (guarda o sella si lo hace en alguna). **«Lee» es por rama y no se funde** (corrección de Core, 17-11): el sobre se envuelve por rama; si un padre lee en la rama A y no en la B, fundir «lee si puede en alguna» le abriría la B. En `todos` cada padre lleva `en` (sus ramas) y `leeEn` (las ramas en que lee), sin un `lee` fundido; un registro que solo cuelga de B no se lo da a leer. Solo en la línea de antes de firmar, «pueden leerlo» son los padres que leen en alguna rama de ESE registro: es verdad para él, porque va entero a cada rama.

**Quién puede.** Es una regla de validez de la época 0 y además una comprobación del contrato al leer (por un libro escrito antes de la regla). Las plantillas solo se ofrecen a quien puede.

## Lo que leerán el nodo (Core AARPIA) y StateArk

- **Las ramas y sus claves**: `contrato.ramasDelLibro(eje)` da todas las ramas del libro, `[{ de, padresDe, padres }]`, cada padre con su `lee` en esa rama. Una clave de sobre por rama (`de`), envuelta para el titular y para cada padre de esa rama con `lee` verdadero; el padre la recibe en todos los lotes de esa rama. El formato del sobre y del lote es de Core StateArk y lo ejecuta el nodo: aquí no hay cifrado.
- **A quién va cada registro**: `contrato.custodia(eje, id).ramas` (`[{ de, padresDe, por, padres }]`, la propia y las de los enlazados cuando van; solo las que tienen padres) y `.todos` (los padres sin repetir, por clave, con `guarda`, `sella`, `en` y `leeEn`). Lo que comparte `de` va al mismo grupo de padres con la misma lectura. O la misma lectura en sus propios términos: los registros con `add a parent` o `set a custody default` en su 4 anclados en el 9 de un elemento, menos los que refiere un `remove a parent` del mismo 9, solo de quien escribió el elemento o del génesis; subir por `sobre` hasta el primer elemento con alguno; las bases, de `epoch.7.7`.
- **Cambia la forma de lo que se escribe**: en un registro de padre nuevo, qué hace está en 1.0.0 (antes 1.0) y «can read» en 1.0.1. Quien lea el registro directamente debe tomar la primera hoja de 1.0.
- De cada padre: `clave` (la que firmará sus cabeceras de lote: es la que el nodo debe esperar en sus recibos), `guarda` y `sella`, `lee` y `leeDe`, `nivel` y `grado` si los declara, y `url` (dónde encontrarlo; nada secreto: el registro no lleva credenciales y el contrato descarta una dirección que las lleva).
- El plazo por defecto: `contrato.custodia(eje, id).plazo` (`{ escala, segundos }` de 7.5 por la clase del dueño). Otro agente añade `plazoDeSuelo(eje, id)`; Core la conecta con esta `clase` al fundir.
- Todo es configuración de un libro escrita con plantillas de la época: la interfaz de AARPIA puede lanzarlas como cualquier acción (modo `person`).

## Lo que queda

- **Preguntas abiertas de VG, fuera de este encargo** (nada aquí las da por contestadas): que quien te invita sea tu padre por defecto (V1); con qué clave se cifra y el formato del sobre (V4, de Core StateArk); la compensación al padre; lo que tiene la persona sola el primer día (V2).
- **«Ninguno» bajo un elemento que hereda padres** no se puede decir: quitar todos los padres de un elemento vuelve a heredar los de arriba. Si VG quiere un «sin padres aquí» explícito, es otra plantilla o un valor.
- **El BQL mínimo no lee textos**: la plantilla no puede rechazar una dirección con credenciales ni un grado largo. El contrato da la dirección como null si no es http(s) o lleva credenciales; el grado sale tal cual. El valor de «set a custody default» sí se valida contra la época al escribir (`lookup(epoch.7.7.1, epoch.7.7.3, first ev.0)`), y el contrato vuelve a descartar al leer un valor que la época no permite.
- **El significado de cada valor** (`yes` lee, `both` va a los dos) está en `contrato.CUSTODIA.significa`, no en la época: una época con otro vocabulario necesitaría su traducción ahí (sus bases, no).
- **Un enlace por cualquier referencia**: cuenta como enlace toda referencia del payload a un registro del eje (también, p. ej., la de «remove a parent» a su padre, que cae en la misma rama). Si VG quiere solo ciertas posiciones, es un dato de cada plantilla.
- **Orden en el PV9** (5, 6, 7 y 8): elegido para no pisar los de la época hija de StateArk (PV1, órdenes 7, 8 y 10) ni el siguiente libre del PV1. Si Core prefiere el PV1, es cambiar el 8 de las cuatro.
- **El nodo** de la línea es el nombre de máquina de la dirección del transporte (relé o «sync url»): sin puerto.
