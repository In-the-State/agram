# Las versiones de la época en el eje (A23, el motor; y la mitad de núcleo de A21)

Core AGRAM, 17-11. Diseño: `agram-equipo/DISENO_GOBIERNO_Y_MOTOR.md` §6.1, con las comprobaciones de núcleo de §3.1 y §3.4 y el «cómo se hace cumplir» de §5. La parte de época (la fila 7.9, las seis plantillas, las lecturas y las reglas de validez) está en `docs/notas/GOBIERNO.md`. Código: `src/versiones.js` (el motor, sin eje), `src/suelo.js` (el suelo, una función pura), `src/eje.js` (guarda las versiones). Pruebas: `test/versiones.test.js`, y `test/gobierno.test.js` para el recorrido de la época.

## 1. Qué guarda el eje

- **Las versiones de su época**: la de nacimiento (la escrita en su libro, con los cambios con que nació si los trae (§11), o la 0 que trae el código) y una más por cada «put a change in force» aceptado. Cada versión es la anterior con el cambio fundido encima.
- Por versión: la época cargada, la anterior, el registro que la puso en vigor, la propuesta del cambio y la posición (el número de entrada del primer registro que se juzga con ella).
- Qué propuestas están en vigor (id de la propuesta → id del registro que la puso en vigor): un cambio entra una sola vez.

No se guarda nada nuevo en el libro ni en el registro: las versiones se **rehacen solas** al volver a pasar cada registro en orden (`Eje.desde`, `restaurar`, `eje.reordenar`, `eje.antes(n)`), porque fundir depende solo de lo que ya está en el libro. Lo fundido se recuerda por versión de partida y por cambio (`src/versiones.js`, `fundirCambio`): rehacerlo es una lectura con memoria.

## 2. Las tres funciones

```text
eje.epoca()       → la versión vigente (la última). Al validar un registro es justo la que le toca. Su id es el de siempre.
eje.epocaDe(id)   → la versión con la que entró el registro `id` (null si el eje no lo tiene). El que pone un cambio en vigor entró con la anterior.
eje.versiones()   → [{ numero, epoca, registro, propuesta, nombre, posicion, desde, version }], la de nacimiento primero
```

En `versiones()`: `epoca` es el id de la época (el mismo en todas); `registro`, el que la puso en vigor (null en la de nacimiento); `propuesta`, la del cambio; `nombre`, `<época>` o `<época>/<registro>` (una versión se nombra por el id de la época y el del registro que la puso en vigor); `posicion`, el número de entrada desde el que rige; `desde`, el id del primer registro juzgado con ella (null si aún no hay); `version`, la época cargada.

Una versión es una época cargada como cualquier otra (`regla`, `condiciones`, `transacciones`, `registros`…) con el mismo `id`, `nombre`, `escrita`, `hereda` y `base` que la de nacimiento, y además `anterior` y `nacimiento`.

Ejemplo (`ejemplos/gobierno.mjs`: una propuesta corriente que lleva el margen del reloj, `epoch.7.3.0`, de 600 a 900 segundos):

```js
import { ejemploGobierno } from './ejemplos/gobierno.mjs';
const { eje, enVigor } = await ejemploGobierno();
console.log(eje.versiones().map((v) => [v.numero, v.registro ? v.registro.slice(0, 8) : null, v.desde ? v.desde.slice(0, 8) : null]));
console.log(eje.epocaDe(enVigor.id).registro[7][3][0], eje.epoca().registro[7][3][0], eje.epoca().id === eje.versiones()[0].epoca);
```

```text
[ [ 0, null, '03492193' ], [ 1, 'bc09a0b3', '564edcb3' ] ]
[ 600 ] [ 900 ] true
```

## 3. Cuándo entra una versión

Cuando el eje **acepta** un registro que dice «put a change in force» en su 4 **y la versión vigente en ese punto trae esa plantilla** en su 9.6. Sin la plantilla, un registro con ese nombre es un registro cualquiera y no cambia nada (condición de seguridad: un libro cuya época no tiene gobierno no gana reglas).

El cambio se busca siguiendo el sobre: «put a change in force» va sobre un «enact a change», que va sobre un «propose a change» anclado en el 9.7 del génesis, que lleva el cambio (su 1.1, la raíz de la época hija; su 1.2, sus registros). Si la cadena no es esa, no entra nada y el registro se rechaza.

Se funde con la misma maquinaria con que una época hija se funde sobre su base (`fusionarRaices` y `cargarEpocaBtml`): el cambio declara en su 6 «hereda» con el id de la época del libro (o uno de su cadena) y marca con `{ ref }` cada posición que no cambia. **Su 0 (el nombre del cambio) y su 6 (su procedencia) son del cambio y no pasan a la versión**: la versión conserva el nombre y la procedencia de la época. Las colecciones (el 2, el 9.6.1, el 4.3…) se combinan como siempre: lo nuevo se añade y lo del mismo nombre sustituye.

El registro que pone en vigor se juzga con la versión **anterior**; la nueva rige desde el registro siguiente. Dos cambios aprobados a la vez se componen en el orden en que entran en vigor: el segundo se funde sobre la versión que dejó el primero, y si ya no encaja su entrada en vigor se rechaza (hay que proponerlo de nuevo).

## 4. Qué se comprueba y con qué motivo se rechaza

Los motivos salen por la vía de siempre: `eje.motivos(ev)` (con `regla: 'núcleo:versiones'`, `REGLA_DEL_MOTOR` de `src/eje.js`, y `estado: 'falla'`), el error de `eje.anadir` (`e.motivos`, su mensaje «evento rechazado: …») y `acciones.transaccion` (con `regla: null`, como las demás comprobaciones del núcleo). No llevan `code`: no es una parada por límite.

**Al proponer** (un «propose a change», si la versión vigente trae esa plantilla) y **otra vez al poner en vigor** (sobre la versión vigente **en ese punto**, con el prefijo «en este punto, sobre la versión vigente: »):

| Qué | Motivo |
|---|---|
| no lleva raíz | «la propuesta no lleva el cambio (payload 1.1): una raíz de época hija» |
| no tiene forma de época hija (`erroresDeEpocaEscrita`) | «el cambio no tiene forma de época hija: …» |
| no hereda de la época del libro | «el cambio no hereda de la época de este libro: su 6 ha de decir «hereda» con el id …» |
| no se funde o no carga | «el cambio no se funde sobre la versión vigente: …» / «el cambio, fundido sobre la versión vigente, no se carga: …» |
| sus registros no son décuplas | «los registros del cambio (payload 1.2) no son décuplas» |
| quita una regla del suelo | «el cambio quita «…», que es del suelo (epoch.7.9.6): no se quita» |
| sustituye una regla del suelo | «el cambio sustituye «…», que es del suelo (epoch.7.9.6): no se sustituye» |
| cambia una posición del suelo | «el cambio cambia la posición epoch.7.2 de la época, que es del suelo (epoch.7.9.6): no se cambia» |
| encoge la lista del suelo | «el cambio quita del suelo (epoch.7.9.6) «…»: el suelo se amplía, nunca se encoge» |
| un umbral que no es un número mayor que 0 y menor que 1 (también un texto que parece un número) | «el cambio deja el umbral de un cambio corriente (epoch.7.9.1) en «0.9»: un umbral es un número mayor que 0 y menor que 1 (se aprueba al superarlo, y el apoyo no pasa de 1)» |
| umbral alto que no queda por encima del corriente | «el cambio deja el umbral de un cambio de gobierno (epoch.7.9.2, x) por debajo del (o igual que el) de un cambio corriente (epoch.7.9.1, y): ha de quedar por encima» |
| un nivel que no es de la época | «el cambio deja el nivel de firmeza de un cambio de gobierno (epoch.7.9.4) en 7: un nivel es 0 (sin prueba) o uno de los de la época (epoch.7.6.1: 1, 2, 3, 4)» |
| nivel de gobierno por debajo del corriente | «el cambio deja el nivel de firmeza de un cambio de gobierno (epoch.7.9.4, x) por debajo del de un cambio corriente (epoch.7.9.3, y)» |
| una presión fuera de rango | «el cambio deja en quién cuenta (epoch.7.9.5) «nadie -9» con la presión -9: una presión es un número mayor que 0 y no mayor que la máxima de la época (epoch.9.0.0.4, 9)» |
| nombres sin presión | «el cambio deja en quién cuenta (epoch.7.9.5) nombres cuyas presiones suman 0: …» (la lectura «support» dividiría por cero) |
| la clase se queda corta | «el cambio toca «…», que es una pieza de gobierno (epoch.7.9.7), y se declara «ordinary»: un cambio así es de clase «governance»» (también las piezas calculadas: `epoch.9.0.0.4`, `epoch.7.6`) |
| añade o sustituye una condición o una lectura que se guarda, y es «ordinary» | «el cambio añade la condición «…», y se declara «ordinary»: una condición o una lectura que se guarda, nueva o sustituida, se llame como se llame, es de clase «governance»» (o «sustituye la regla que escribe «…»», o «añade la lectura «…», que se guarda en X.2.4.7») |
| quita una condición o una lectura que se guarda (deja con su nombre algo que no guarda), y es «ordinary» (la salida con lo propio, B) | «el cambio quita la condición «at most a year ahead», y se declara «ordinary»: quitar una condición o una lectura que se guarda, se llame como se llame, es de clase «governance»» (o «quita la regla que escribe «…»», o «quita la lectura «weight», que se guarda en X.2.4.8») |

**Solo al poner en vigor**, siguiendo el sobre:

| Qué | Motivo |
|---|---|
| no va sobre un «enact a change» | ««put a change in force» va sobre un «enact a change», y el registro sobre el que se escribe no lo es: …» |
| el «enact a change» no va sobre una propuesta | «el «enact a change» sobre el que se escribe no va sobre un «propose a change»: …» |
| la propuesta no está en el 9.7 del génesis | «la propuesta … no está anclada en el 9.7 del génesis de este libro: …» |
| ya está en vigor | «el cambio de la propuesta … ya está en vigor desde el registro …: un cambio entra en vigor una sola vez» |
| retirada por quien la propuso | «la propuesta … se retiró (registro …): no entra en vigor» |

Lo de «una sola vez» y «retirada» también lo dicen las reglas de la época («a change comes into force with its proof», «only who proposed withdraws a change»); el núcleo no depende de ellas para no fundir dos veces.

**Las referencias del cambio.** La raíz de un cambio puede referenciar los registros que trae en su 1.2 (una regla, una plantilla nueva) aunque no estén en el eje: el suelo de las referencias ausentes (`src/condiciones/evento.js`) los da por resueltos **solo** en un «propose a change» con la plantilla en la versión vigente, y solo los ids de esos registros (`idsDelCambio`). Cualquier otra referencia a un registro que el eje no tiene se sigue rechazando.

## 5. El suelo

`erroresDelSuelo(base, resultado, { clase })` (`src/suelo.js`): pura, sin eje. Compara una época con la que queda al fundirle algo encima y da los motivos en llano (sin el «el cambio» delante). El suelo es la lista 7.9.6 de la base: nombres de reglas (o lecturas, o plantillas: se comparan los ids de los registros de ese nombre) y posiciones `epoch.…` (se compara lo que hay en esa dirección). Además mira la fila 7.9 del resultado (`erroresDeLaFila`: umbrales, niveles y presiones, `docs/notas/GOBIERNO.md` §2). Las piezas de gobierno son las de 7.9.7 de la base y del resultado **y lo que leen, calculado** (`piezasDeGobiernoDe`, GOBIERNO.md §6). Con una clase que no es «governance», además, ninguna condición ni lectura que se guarda nueva o sustituida (`reglasConId` del resultado que la base no tiene, por id), **ni quitada** (la salida con lo propio, B: una de la base cuyo id el resultado no tiene y con cuyo nombre no queda ninguna que guarde; el 2 no pierde entradas al fundir, así que quitar es dejar con ese nombre una lectura que solo informa). Sin `clase` no se mira la clase.

El suelo se amplía y no se encoge: un cambio de gobierno puede añadir a 7.9.6 (lo que añade queda guardado desde el registro siguiente), nunca quitar. En la 0, el suelo son las 17 reglas de VG, las 9 reglas y lecturas del mecanismo del gobierno (anexo de los arreglos, I: «approved», «support», «support of», las cuatro reglas de §5 de GOBIERNO.md y las dos del apoyo), las 2 reglas y la plantilla de la salida con lo propio («a declared balance is true», «a declared balance is only that», «declare a balance»; VG 17-11) y tres posiciones: 32; `sueloDe` le añade, calculado, toda lectura que una de sus reglas o lecturas nombra en su 1 (hoy, ninguna). Las piezas de gobierno de la 0 (7.9.7) incluyen desde entonces la fila del puente, `epoch.8.9`.

**Lo que el suelo decide al validar** (la salida con lo propio, VG 17-11; `docs/notas/GOBIERNO.md` §10): a un registro que nombra «declare a balance» en su payload 4 solo se le prueban las reglas de la época que se llaman como una pieza del suelo de la versión vigente (`src/suelo.js`, `condicionesDelRegistro`, que pide `src/condiciones/reglas.js`, `veredictosDe`), si ese suelo trae «a declared balance is only that»; las condiciones del núcleo en JS y el motor, como siempre. Una regla añadida por un cambio, aunque sea de gobierno, no la alcanza (salvo que se añada al propio 7.9.6: pregunta S8).

**Al cargar una época hija de nacimiento** (`cargarEpocaEscrita`, `src/epocas.js`) se comprueba el mismo suelo, sin la clase: una hija puede ampliarlo, no encogerlo, ni sustituir ni quitar una regla de la lista, ni cambiar una posición de la lista; si lo hace, la carga lanza con «no respeta el suelo de la época de la que hereda: …». Comprobado contra la 7.9.6 real antes de activarlo: la época state (sustituye «second factor» y «attention has a price») y la SIP 0 de StateArk (sustituye «sealed», «paid», «second factor» y «authorized by the holder») no tocan el suelo.

**Una época completa** (que no hereda: su 6 no dice «hereda») pasa por lo mismo contra el suelo de **la 0 que trae el código** (arreglos de la revisión, H4): si no lo respeta, la carga lanza con «no respeta el suelo de la época 0: …». La 0 misma y las épocas completas de las pruebas siguen cargando.

## 6. Lo escrito sin red (diseño §6.2)

Nada nuevo: lo escrito sin red se coloca detrás al sincronizar (`eje.reordenar`) y se vuelve a validar en orden; si entre medias entró en vigor un cambio, se juzga con la versión nueva, y lo que ya no pasa va a rechazados con su motivo, como cualquier otro choque. Las versiones se rehacen en la misma pasada.

## 7. Las cachés

Cada versión es un objeto distinto, y las cachés que iban por eje y época van ya por eje y versión sin tocarlas: los textos (`textosDe`, por la raíz congelada), los retoques del libro (por eje y época), las condiciones (`condicionesDe`, por época), los límites de cálculo (por raíz), los nombres de las plantillas que mira el motor (por época). Lo que se lee con `{ epoca: eje.epocaDe(id) }` sale de esa versión; sin opción, de la vigente.

## 8. Las constantes

En `src/versiones.js` (las posiciones de las plantillas; `test/versiones.test.js` vigila que casan con la época 0 real) y `src/suelo.js` (la fila 7.9 del diseño §4.1):

| Constante | Valor |
|---|---|
| `PROPONER`, `APROBAR`, `PONER_EN_VIGOR`, `RETIRAR` | «propose a change», «enact a change», «put a change in force», «withdraw a change» |
| `ACCION_EN` | 4 (el parámetro «actions») |
| `CAMBIO_EN`, `REGISTROS_EN`, `CLASE_EN` | [1, 1], [1, 2], [2] |
| `ANCLA_DE_PROPUESTAS` | «9700000000» (el 9.7 del génesis) |
| `UMBRAL_CORRIENTE`, `UMBRAL_DE_GOBIERNO`, `NOMBRES`, `SUELO`, `PIEZAS_DE_GOBIERNO` | [7, 9, 1], [7, 9, 2], [7, 9, 5], [7, 9, 6], [7, 9, 7] |
| `PRESION_MAXIMA` | [9, 0, 0, 4] |
| `CLASE_CORRIENTE`, `CLASE_DE_GOBIERNO` | «ordinary», «governance» |

## 9. Coste

Un libro sin cambios en vigor no paga nada medible: por registro, el núcleo mira si su 4 dice una de dos acciones. Medido con 300 notas sobre el génesis, validar con y sin el motor (el código de beta d9dbb5a contra este), tres pasadas alternas: 17,7 / 24,5 / 19,6 ms por escritura con el motor frente a 21,5 / 29,5 / 23,1 sin él, y 14,4 / 18,5 / 12,4 ms por registro al restaurar frente a 19,5 / 17,4 / 17,7: dentro del ruido. Con dos cambios en vigor, lo mismo (15,8 y 14,9 ms por escritura; 9,6 y 8,8 al restaurar, 200 notas). Fundir un cambio sobre la época 0 cuesta unos 250 ms la primera vez (470 en frío) y 5 ms con memoria (solo el suelo): se paga al proponer y se reutiliza al poner en vigor y al rehacer.

## 10. Límites

- Fundir pide la época de partida entera en memoria: un cambio sobre un libro con muchas versiones se funde sobre la última, no sobre la cadena.
- Un nombre de 7.9.5 que es una magnitud («nadie 0») pesa su número; cualquier otra hoja, la presión máxima. Una identidad con alta que se escriba como magnitud contaría distinto en la lectura «support», que mira si tiene vistas; el núcleo no tiene eje en el suelo.
- Un cambio no puede renombrar la época ni cambiar su procedencia (su 0 y su 6 son del cambio).

## 11. La época con cambios al nacer (tramo 4, la época por referencia)

Diseño: `agram-equipo/DISENO_TRAMO_4.md` §2. Un libro puede nacer con la época de otro **en un punto**: no copia la época fundida, vuelve a pasar los cambios. Prueba: `test/epoca-por-referencia.test.js`.

**La forma.** La época escrita gana una parte opcional, y una segunda forma para la época que trae el código:

```text
{ raiz, registros, cambios: [{ raiz, registros }, …] }   el libro de arriba escribió su época
{ base: '<id>', cambios: [{ raiz, registros }, …] }      el libro de arriba nació con una época del código
```

`raiz` y `registros` son la época de nacimiento del libro de arriba tal como él la escribió; `cambios`, sus cambios en vigor en el orden en que entraron, cada uno como lo llevaba su propuesta (la raíz de una época hija y sus registros). Sin `cambios` (o con la lista vacía), todo es como antes, byte a byte: el mismo génesis, los mismos registros de época, los mismos ids.

Si el libro de arriba nació con una época que trae el código (su génesis solo la nombra, como la 0), la forma no lleva raíz ni registros de nacimiento: `base` es el id de esa época. El génesis del libro nuevo nombra ese mismo id en su contexto, como el de un libro nacido con ella, y detrás van **solo los registros de los cambios**. Así el id de la época del libro nuevo es el de la de arriba también en este caso, y un libro grande sin época escrita no hace escribir la 0 entera. `base` se resuelve como el eje resuelve hoy un génesis que nombra ese id (`EPOCAS_POR_ID`, y si no lo conoce, la 0): un id anterior de la 0 (`IDS_ANTERIORES_DE_LA_0`) o uno que el código no conoce dan la 0, y el génesis sigue nombrando el id que se dio. `{ base, cambios: [] }` es un génesis sin época escrita: nombra ese id y no escribe nada (con el id de la 0 de hoy, byte a byte el de un génesis sin `epoca`). Mal formada: ««base» es el id de una época que trae el código (64 hexadecimales)», «una época nombrada por su id («base») no lleva raíz ni registros: la trae el código».

**Las funciones.**

- `epocaEscritaDe(epoca, { porReferencia })`, según la época (`eje.epoca()`, o `eje.versiones()[k].version` para un punto anterior):

  | Época | Da |
  |---|---|
  | escrita, sin cambios | `{ raiz, registros }` (lo de siempre) |
  | escrita, con cambios en vigor (o nacida con ellos) | `{ raiz, registros, cambios }` |
  | del código (la 0), con cambios en vigor (o nacida con ellos) | `{ base, cambios }` |
  | la 0 del código, sin cambios | `{ raiz, registros }`, la 0 entera (816 registros, para escribirla en un libro: lo de siempre); con `{ porReferencia: true }`, `{ base, cambios: [] }` |

  Los cambios van en orden; si el libro nació a su vez con cambios, los de su nacimiento van delante. Cada versión guarda ahora el cambio con que se fundió (`version.cambio`, `src/versiones.js`). Sin la opción, la 0 sigue dando su forma entera porque es un contrato (`docs/CONTRATO.md`, «para escribirla en un libro») y la usan pruebas que escriben la 0 retocada en un libro (`versiones`, `retoques`, `revision-gobierno`, `revision-suelo`, `epoca-en-el-eje`). **Quien hace nacer un libro con la época de otro llama `epocaEscritaDe(eje.epoca(), { porReferencia: true })`**: vale sin condiciones y es barato en los tres casos (la 0 sin cambios no escribe nada; la 0 con cambios, solo los cambios; una época escrita, lo de siempre).
- `cargarEpocaEscrita({ raiz, registros, cambios })` (o `{ base, cambios }`) carga la de nacimiento y funde encima cada cambio, en orden, con `fundirCambio` (la misma función con que el libro de arriba los fundió) y comprueba en cada paso el suelo de la versión anterior (`erroresDelSuelo`, sin clase: no es un cambio del libro, es su nacimiento; no hay clase ni umbral que mirar). Un cambio que no se funde o que no respeta el suelo no abre el libro: «<época>: no abre con el cambio 2 de 3 («<nombre del cambio>»): el cambio …» con el motivo de siempre (§4). Una lista mal formada: «<época>: época mal formada: el cambio 1: …» o «los cambios de la época son una lista de { raiz, registros }».
- `Eje.genesis({ epoca })` la acepta (también una época cargada o una versión: vale por su forma escrita) y la escribe: los registros de época de siempre (ninguno con `base`) y, detrás, los de cada cambio, con el mismo autor e instante, anclados en el génesis y sin coste. `contexto.epocaEscrita` del génesis cuenta todos.

**Los contextos de los registros de época.**

| Registro | Contexto |
|---|---|
| la raíz de nacimiento y sus registros (como siempre) | `{ epoca, registroDeEpoca: true }` |
| la raíz del cambio k (1, 2…) | `{ epoca, registroDeEpoca: true, cambio: k, raizDelCambio: true }` |
| cada registro del cambio k | `{ epoca, registroDeEpoca: true, cambio: k }` |

`epoca` es en todos el id de la época de nacimiento (el que nombra el génesis). Con `base` no hay registros de nacimiento: el primero ya es la raíz del cambio 1. Al restaurar (`restaurar`, `Eje.desde`, `eje.reordenar`, `eje.antes(n)`) la lista se rehace de esos contextos. El eje rechaza, con su motivo, un registro de época que los rompe: «los cambios van en orden y sin saltos: tras la época de nacimiento va el cambio 1, no el 2», «los cambios van en orden: tras un registro del cambio 2 no va uno del cambio 1», «el primer registro del cambio 1 es su raíz (raizDelCambio: true en su contexto)», «el cambio 1 ya tiene su raíz: sus demás registros no la dicen», «solo la raíz de un cambio lo dice en su contexto (raizDelCambio: true)», «un registro de un cambio dice en su contexto el número del cambio (1, 2…): «x» no lo es». Un registro repetido se mira dentro de su parte (la de nacimiento o cada cambio): dos cambios pueden traer el mismo registro.

**Lo que resulta.** La época del libro nuevo es idéntica a la versión del de arriba en ese punto (las mismas reglas, condiciones, plantillas, fila 7.9 y raíz resuelta entera) y su id es el de la época de arriba. `eje.versiones()` del nuevo empieza en **una sola versión, la de nacimiento, que ya lleva los cambios**: `eje.versiones()[0].version` es la época entera con los cambios fundidos, sin `anterior`, y su `escrita.cambios` dice con qué cambios nació. Lo que se juzgue con «el suelo de la versión de nacimiento» (la declaración de saldo, decidido 17-11) se juzga en ese libro con ese suelo: el 7.9.6 que dejaron los cambios. Desde ahí el libro es dueño de sus reglas: un cambio propio se funde encima (versión 1) y quien nazca de él hereda los de arriba y los suyos, en orden.

```js
import { ejemploGobierno } from './ejemplos/gobierno.mjs';
import { Eje } from './src/eje.js';
import { epocaEscritaDe } from './src/epocas.js';
const { eje } = await ejemploGobierno();
const escrita = epocaEscritaDe(eje.epoca());
console.log(Object.keys(escrita), escrita.cambios.map((c) => c.raiz[0][0]));
const nuevo = await Eje.genesis({ identidad: 'bea', foco: ['el libro de bea'], t: '2026-11-18T09:00:00Z', demostracion: true, epoca: escrita });
const [nacimiento] = nuevo.versiones();
console.log(nuevo.epoca().id === eje.epoca().id, nuevo.epoca().registro[7][3][0], nuevo.versiones().length, nacimiento.version.escrita.cambios.length);
console.log(nuevo.registrosDeLaEpoca.map((id) => nuevo.obtener(id).contexto).map(({ cambio, raizDelCambio }) => [cambio ?? 0, raizDelCambio ?? false]));
```

```text
[ 'raiz', 'registros', 'cambios' ] [ 'más margen' ]
true [ 900 ] 1 1
[ [ 0, false ], [ 1, true ] ]
```

**El punto.** El diseño quiere que «this book hangs from» anote el id del registro que puso en vigor el último cambio en el libro de arriba. La plantilla no tiene sitio: sus parámetros son 1.0 el libro, 1.1 las claves de línea, 1.2 el origen (opcional), 2 el elemento, 3 quién y 4 la acción. Haría falta un parámetro opcional nuevo, «point», en el payload 5 (no en el 1.3: el 1.2 es opcional y dejaría un hueco), y eso cambia el registro de la plantilla y con él el id de la época 0: va por el carril de época (Core, 17-11). (A mano, un payload 5 entra hoy, porque ninguna regla lo rechaza, pero la plantilla no lo declara, no se ofrece ni se lee.)

**Coste** (medido 17-11 en este portátil, una época hija de la 0 con una regla y n cambios de un parámetro; cada proceso en frío): abrir el libro (génesis y apertura) 0,37 s sin cambios, 0,47 s con 1, 0,91 s con 5 y 2,76 s con 20; restaurarlo en otro proceso, 0,25 / 0,44 / 1,00 / 2,87 s; restaurarlo otra vez en el mismo proceso, 5 a 30 ms (la época resuelta se recuerda). Cada cambio cuesta en frío unos 120 a 190 ms: fundir es cargar la época entera otra vez. Es el límite del diseño: un libro de arriba con cien cambios hace nacer libros con cien cambios escritos (del orden de 12 a 15 s al abrir en frío: extrapolado, sin medir). No hay tope.

## Para la carta

Hecho (tramo 2, paso 4): «Reglas del libro» enseña la versión vigente con `eje.versiones()`, y en un cambio en vigor cómo era antes y cómo quedó (`version.anterior`); los motivos de «núcleo:versiones» salen tal como llegan. `carta/reglas.js`, `docs/CONTRATO.md` §5 bis.2, `test/carta-reglas.test.js`.
