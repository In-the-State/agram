# La época de la clase `state`: cómo se monta un nodo

Para quien monta el eje de un nodo (Core AARPIA). VG 16-11, #124: el nodo, visto desde dentro, es un eje, y su época es esta. Fuente y generador en `datos/epocas/state/` (`LEEME.md`); eje de ejemplo en `ejemplos/state/nodo.mjs`; pruebas en `test/epoca-state.test.js`. Las conexiones son invitados, piden anclas con R, y su invitación, su grupo y su veto esperan la firma del titular; el dueño del nodo sirve los pedidos (VG 17-11, §4 bis).

- **Id**: el de `datos/epocas/state/state-0.ids.json` (`epoca`). Hereda de la época 0 definitiva (`55b72e91…`) y no la cambia.
- **Genérica**: vale para cualquier nodo de la clase `state`. Nada real va en la época: dominios, claves y máquinas van en el libro del nodo, como datos de sus altas.

## 1. Quién es quién

| Identidad | Qué es | Qué escribe |
|---|---|---|
| **operador** | la cuenta raíz del eje (el autor del génesis): quien monta el nodo y es dueño de sus piezas. Hoy, la clave del nodo que guarda Core AARPIA. Es también **quien sirve** las anclas (§4 bis) | el alta del nodo, las altas de las piezas, «en servicio», las operaciones, los umbrales y los vencimientos; las conexiones (invitar, grupos, precios, vetos) y las anclas servidas |
| **titular** | una persona del eje (entra por invitación), nombrada en el 3.2 del alta del nodo | el criterio «require authorization» en el 2.4 del alta del nodo |
| **quien firma** | la identidad que nombra el criterio (su 3): una cosa del titular cuya clave custodia StateArk, o el titular | las autorizaciones (`acciones.autorizar`; en la carta, «por autorizar») |
| **vigía** | una pieza de papel «agent», declarada agente | las medidas, en el 8 de cada pieza |
| **ejecutor** | otra pieza «agent», declarada agente: lista cerrada de órdenes, sin shell | los recibos de lo que hace fuera, y los fallos |
| **conexión** | otro nodo: una persona de este eje, invitada por el dueño del nodo (el operador, que escribió el alta del nodo) al dominio del nodo (§4 bis) | sus relés, en su propia alta, y sus pedidos de ancla, en el 3 del alta del dueño |

## 2. Qué plantilla usar para cada alta de la matriz (CLASE_STATE §2)

Las altas las escribe el operador. Cada pieza es una cosa suya con su papel en el 5 (`["piece", <papel>]`) y sus datos en el 6; ancla en el alta del nodo.

| Archivo de la matriz | Pieza | Plantilla | Ancla en el nodo | Datos |
|---|---|---|---|---|
| `type` | el nodo | **register the node** (dar de alta el nodo) | el 1.4 del alta del operador | 3.2 el titular; su tipo `node` (su camino es el 9 de la plantilla de datos `node`) |
| `contract.contextvm` | la autoridad | **register the authority** | 1.2 | 6.0 commit y 6.1 sha256 del núcleo que corre |
| `channel` | el relé | **register the relay** | 1.3 | (los espejos, por operaciones) |
| — | el archivo (Blossom) | **register the archive** | 1.6 | — |
| contextos | un contexto declarado | **declare a context** | 1.5 | 6.0 el id del evento de fuera y 6.1 su relé (un puntero, no una copia) |
| `runtime.contextvm` | un contenedor | **register a container** | 1.4 | 6.0 el digest de la imagen, 6.1 su nombre (opcional). El servidor web del TLS es un contenedor, con el vencimiento de su certificado en su 7 |
| — | una puerta | **register a gate** | 1.4 | — |
| `container` | un despliegue | **register a deployment** | 1.4 | 6.0 commit, 6.1 argumentos y 6.2 volumen (opcionales, en ese orden). La carta que sirve cada puerta es un despliegue |
| `contract.worker`, `runtime.worker` | el worker | **register a worker** | 1.4 | — |
| `contract.ai_agent`, `client.model` | un agente (el vigía, el ejecutor) | **register an agent** | 1.4 | su clave y su prueba de posesión; su dotación de T en el 1 (cualquier número entero de minutos: 180 en el ejemplo); 2.1 su modelo y 2.2 sus límites. Después, **declare agent** (en su 9) |
| — | un eje servido | **register a served ledger** | 1.4 | 6.0 su nombre y 6.1 su génesis (nunca su contenido) |
| — | una conexión (otro nodo) | no es una pieza: es un **invitado** con alta (§4 bis) | — | su clave, en la invitación; sus relés, **declare my relays** en su alta |

Las piezas que no escriben en el libro no declaran clave (una cosa sin clave puede tener alta; sin clave no actúa). Los minutos del 1 son la T que el operador les da (una cosa no tiene T diaria).

## 3. El camino del 9 del nodo

Seis pasos, en orden, cada uno con su acción (#90): **alta del nodo** (register the node), **autoridad** (register the authority), **relé** (register the relay), **archivo** (register the archive), **contextos** (declare a context) y **en servicio** (put in service, en el 9 del nodo). Un paso está hecho cuando hay en su ancla un registro de quien mira (`acciones.camino`): el camino es el del operador, que es quien lo recorre. «follow the path» (PV9) lanza el siguiente.

## 4. Qué escribe un operador: las operaciones (tabla 3.2 de UI_NODO)

Una operación es un **movimiento anunciado** en el 4.1 de la pieza sobre la que actúa: el operador anuncia que el ejecutor dará minutos de su T al nodo (su 1: cuándo y cuántos; por defecto, ahora y uno), con el ejecutor en su 3.1 y sus datos en su 6. El ejecutor comprueba las firmas, lo hace fuera y deja su recibo:

- **leave a receipt** (dejar el recibo; modo agente): anclado sobre la operación, mueve lo anunciado y lleva el resultado (6.0) y su evidencia (6.1). Eso la da por **ejecutada**.
- **report a failure** (informar de un fallo; modo agente): anclado en el 4 de la operación con «close with error» en su 4 y la causa en su 0: la cierra con error (`motor.cerrado(…).fin === 'error'`) y no mueve lo anunciado, así que no llega a ejecutada.

| Operación | Sobre | Autorización | Datos (6) |
|---|---|---|---|
| restart a piece (reiniciar) | un agente o un contenedor | sí | — |
| deploy another version | un despliegue o un contenedor | sí | la versión (commit o digest) |
| change the core | la autoridad | sí, y el ejecutor revalida el libro antes: si falla, «report a failure» | 6.0 commit, 6.1 sha256 |
| admit someone / remove someone (las de la 0) | el nodo | sí | (las de la 0) |
| rotate a key | una pieza | sí | 6.0 qué clave, 6.1 la huella de la nueva (nunca un secreto) |
| add a mirror relay / remove a mirror relay | el relé | sí | la url |
| shut down (apagar) | el relé o una puerta | sí | — |
| set a threshold / require authorization (las del 2) | una pieza / el nodo | sí | — |
| resend the mirror queue | el relé | **no** (libre) | — |
| seal the pending | una puerta o la autoridad | **no** (libre) | — |

Ver salud, logs y recibos es solo leer. Borrar datos y lo de fuera del nodo (la máquina, el DNS, pagar) no existen en esta época.

**El criterio «require authorization»** (requerir autorización, PV2): lo escribe el titular en el 2.4 del alta del nodo: su 1, las plantillas que no se ejecutan sin la firma (por defecto, la lista inicial de arriba, con la propia plantilla dentro); su 3, quién firma. Un registro escrito con una de ellas bajo el nodo queda «autorizada» y pendiente («por autorizar» en el 6 de la carta, para quien lo escribió y para el titular) hasta que quien firma escribe y firma su autorización; la firma de otro no vale. Sin la firma, el recibo no la lleva a ejecutada. Es el mismo camino que el segundo factor de la 0 (`docs/CONTRATO.md` §12.4 bis): la lectura «second factor» de esta época alcanza, además de los criterios del autor, los del nodo por plantilla y, para el dueño del nodo, las escrituras de sus conexiones (§4 bis, «La firma del titular en las conexiones»). Un criterio nuevo rige en cuanto se escribe (y él mismo espera su firma); no se puede quitar uno, solo añadir.

## 4 bis. Las conexiones y los pedidos de ancla (A14, rehecho: VG 17-11)

«Tienes custodia de quien te ha dado su R.» Una **conexión** (otro nodo) es un **invitado con alta en el libro del nodo**, no una pieza ni una operación. El **dueño del nodo** es quien escribió su alta (el operador): su R es la llave del servicio, y la R que da sigue dando P (la de la época 0, sin excepción). Todo es de la época 0 tal cual salvo dos plantillas pequeñas de esta época:

- **Conectar** = la invitación de la 0 (`eje.invitar`), **por nombre** (no hay invitación abierta: la casa invita al crear la cuenta): el dueño invita a la identidad del otro nodo con su clave (3.5 de la invitación), le da R suya (lo que da), la pone en un grupo de su atención (8) y la invita **al dominio del nodo** (su 5 = el alta del nodo: así se distingue de otras invitaciones del dueño, como la del titular). Al aceptar (`eje.aceptar`, firmada con su clave) tiene alta en este libro.
- **Sus relés**: **declare my relays** (declarar mis relés; [1, 23]), que el invitado escribe en el **1.3 de su propia alta** (con quién, donde «register the relay» pone el relé del nodo), con las urls en su 1, una por ocupante; vale la última. Siempre ancla en el alta de quien la lanza (su 5: `=first me.6`) y la lectura solo cuenta las del dueño del alta: nadie declara relés en el alta de otro.
- **Permisos** = su grupo de atención (el 8 de la invitación, o «move to group») y el precio de ese grupo («set a group price»). En el ejemplo, el grupo 3 con precio «my R» 1: escribir al dueño le cuesta devolverle una unidad de su R.
- **Quitar** = **veto someone** (el 3.5.3 del alta del dueño: el grupo 5, con precio «nothing»). Quedarse sin R del dueño también la saca de las vigentes.

**ask for an anchor** (pedir un ancla; [3, 11]) es el mismo movimiento que «return R (ask for attention)» de la 0: quien pide devuelve R del dueño del nodo a su emisor (1, por defecto una unidad) y ancla en el **3 del alta del dueño**. Se ofrece sobre el alta del nodo a quien tenga R de su dueño. 2 el nodo, 3 quién pide y el dueño, 4 la acción, 5 «anchor request» y, como **datos** y no referencias (el otro libro no está en este eje), **6.0 el libro** (el id de su génesis), **6.1 la clave de la línea** (x-only), **6.2 el nivel pedido** (de `epoch.7.6.1`) y **6.3 la cabecera** (su hash); libro, clave y cabecera son 64 hexadecimales en minúsculas (`=hex(slice(bytes(it), 0, 32)) = it`). No hay regla de validez nueva: el precio lo cobra «attention has a price» (un pedido sin pagar, o pagado con la R propia de quien pide cuando el precio es «my R», no entra). Nada compensa todavía un pedido que no se sirve a tiempo.

**anchor served** (ancla servida; [3, 12]; VG 17-11): dice que un pedido está **servido**. Se ofrece sobre el pedido a quien sirve y ancla en el **4 del pedido**; además del T de escribir, **da R a quien pidió** (encargo «la R en los canales», F, VG 17-11): una unidad de R suya del dueño del nodo, por defecto, en el mismo registro (pone en mano lo que le falte y la transfiere al autor del pedido); **6.4** (opcional) dice cuánta, y con 0 no da ninguna: es su R y no la exige ninguna regla. Con ella quien pidió puede volver a pedir. La unidad por defecto no se escribe en el payload: el registro pesa lo mismo que antes (11 minutos); con el 6.4, 12. Escrita por quien pidió sobre su propio pedido no da nada. En esta época no hay otro camino por el que el dueño conteste a una conexión (darle R aparte es «give own R» o «admit someone» de la 0). **Quien sirve es el dueño del nodo** (el operador: quien escribió el alta del nodo y a quien el pedido devuelve R; su clave es hoy la del nodo): con lo que hay en esta época, el nodo es una cosa sin clave y el sellador no tiene identidad en el libro. Escrita por otro, entra en el libro pero no cuenta. 1 el pedido, 2 el criterio de cierre, 3 quién sirve y quién pidió, 4 la acción, 5 «served anchor» y, como datos: **6.0 la cabecera pedida** (el mismo hash que el 6.3 del pedido: es su defecto y la validación lo exige), **6.1 la cabecera madre** que la incluye, **6.2 el nivel de la madre** (de `epoch.7.6.1`; el nivel con el que esa cabecera figura en la cadena del sello del hijo: el pedido o uno de encima, y la validación lo exige) y **6.3 el camino** (texto corto; hoy «sip», el defecto). Los hashes, 64 hexadecimales en minúsculas, con la misma comprobación que el pedido. Un pedido está **servido** si tiene anclado un «anchor served» del dueño del nodo que nombra el pedido cuyo 6.0 es el 6.3 del pedido y cuyo 6.2 cubre el 6.2 del pedido, y **pendiente** si no (§6); «anchors asked» sigue dando todos los pedidos.

Salen «add a connection», «change a connection's permissions» y «remove a connection» (y el papel «connection» de la lista cerrada de las piezas); los permisos por herramienta o aviso (texto libre) pasan a ser el grupo y su precio.

**La firma del titular en las conexiones** (VG 17-11: «es algo pequeño y ya lo completa»). Invitar, cambiar de grupo o de precio y vetar se escriben en el alta del dueño, no cuelgan del nodo; aun así, si el nodo tiene escrito un criterio «require authorization» (cualquiera: no se mira su lista), estas escrituras **del dueño del nodo** quedan «autorizada» y pendientes hasta que firma quien nombra el criterio (su 3), por el mismo camino que las plantillas que cuelgan del nodo:

- **conectar**: la invitación de la 0 cuyo 5 es el alta del nodo (las demás invitaciones del dueño, como la del titular, no esperan);
- **set a group price**: lo que ancla en el 3.k.2 de su propia alta;
- **move to group** y **veto someone**: lo que ancla en el 3.k.3 de su propia alta (el veto es el 3.5.3), solo si la identidad movida (su 0) tiene un alta que cuelga de una invitación al dominio del nodo (una conexión, vigente o no).

Es una tercera rama de la lectura «second factor» de esta época, no una regla que rechace: sin criterio, todo sigue como antes. La posición del ancla se lee de los diez dígitos de su dirección como cinco bytes (`le(bytes(last (first it.6).5))`: el 3.k.2 da de 8240 a 8249 y el 3.k.3, de 12336 a 12345). Mientras espera la firma, la conexión **no sale en «current connections»** (su invitación lleva su X.6.8.7 sin su X.6.8.8) y un veto pendiente **no la quita** (el «nothing» solo cuenta si hay un veto ya firmado). **Lo que espera la firma tampoco rige la atención** (encargo «los dos canales», A0, VG 17-11 por Core State): esta época sustituye las lecturas «attention group» (X.6.3) y «attention price» (X.6.2) de la 0, que leían los grupos del 3 del alta del dueño tal como los arma `src/contexto-eje.js` (`#grupos` y `#corregido`, en JavaScript, sin mirar firmas), por otras con el mismo nombre que solo cuentan lo firmado: de los grupos que nombran a quien escribe (A.3.k.3, el último, como en la 0) solo vale uno con un registro del dueño en el 3.k.3 de su alta que lo nombre y no espere la firma (X.6.8.7 sin todas sus firmas en X.6.8.8), y el precio de la zona es el del último registro firmado del dueño en su 3.k.2 o, si no hay ninguno, el de la época (epoch.1.2.1.k.2). Así un cambio de grupo, un precio o un veto pendientes **no cambian lo que cuesta escribir ni rechazan** hasta que firma quien nombra el criterio; firmados, sí. La regla «attention has a price» de esta época lee además el precio una sola vez (como el elemento de un `where`) y no en cada comparación, porque cada lectura de X.6.2 vuelve a evaluar las dos lecturas y ahora incluyen firmas. No toca la 0 ni el núcleo: bastó con las fórmulas de la época. Coste en §6.

## 5. Qué escribe el vigía

**measure a piece** (medir una pieza, modo agente) en el 8 de cada pieza: 0 qué se mide, 1 el valor, 2 la unidad. Un agente del nodo mide sin pagar atención; nadie más gana ese paso (la regla «attention has a price» de esta época: sobre una pieza solo escriben sin pagar su dueño y, en su 8, una medida de un agente del mismo nodo; cualquier otra cosa paga como sobre un alta ajena). Cada escritura del vigía cuesta su T (5 minutos una medida de cinco posiciones); su dotación la da el operador en el alta.

## 6. Leer por máquina (BQLM)

Cada consulta se evalúa con el núcleo sobre el eje del nodo, `bqlm.evaluar(formula, new ContextoEje(eje, { epoch: eje.epoca() }), { sujeto: <id> })`; con `it` = el registro que se dice. «Hecha» es ejecutada y firmada: `count (first it2.6).8.7 = count (first it2.6).8.8 and not (it2 in (first it.4).8)` (lo llamamos HECHA abajo).

| Qué | `it` | Fórmula |
|---|---|---|
| el umbral vigente de «disco» (1.0 qué, 1.1 límite, 1.2 unidad) | la pieza | `(payload(last ((down it) where last (first it2.6).5 = "2800000000" and "set a threshold" in (payload(it2)).4 and count (first it2.6).8.7 = count (first it2.6).8.8 and first (payload(it2)).1.0 = "disco"))).1` |
| la última medida de «disco» | la pieza | `(payload(last ((down it) where last (first it2.6).5 = "8000000000" and first (payload(it2)).0 = "disco"))).1` |
| el vencimiento vigente del «certificado TLS» | la pieza | `(payload(last ((down it) where last (first it2.6).5 = "7000000000" and first (payload(it2)).1.0 = "certificado TLS"))).1.1` |
| ¿vencido? (con el reloj del libro) | la pieza | `(first (payload(last (…lo de arriba…))).1.1).0 < first before.6.0.0` |
| el núcleo vigente | la autoridad | el 6 del último «change the core» hecho, `(payload(last ((down it) where "change the core" in (payload(it2)).4 and HECHA))).6`; si no hay ninguno, el de su alta, `(payload(it)).6` |
| las conexiones vigentes | el nodo | la lectura con nombre **«current connections»** (abajo) |
| su clave | su alta | la que nombra la invitación, `(payload(first (up it))).3.5` |
| sus relés | su alta | `(payload(last ((down it) where last (first it2.6).5 = "1300000000" and first it2.3 = first it.3 and "declare my relays" in (payload(it2)).4))).1` |
| su grupo y su precio | su alta | `it.6.3` y `it.6.2` (las lecturas «attention group» y «attention price» de esta época, que sustituyen a las de la 0: su sitio en la atención del dueño, sin lo que espera la firma del titular) |
| la R del dueño que le queda | su alta | `sum (((first it.3).1 where R in it2.0.0.0 and it2.0.0.1 = first (first (up it)).3) each 1)` |
| los pedidos de ancla, servidos o no | el nodo | la lectura con nombre **«anchors asked»** (abajo) |
| de cada pedido: quién, libro, clave, nivel, cabecera, instante | el pedido | `first it.3`; `(payload(it)).6.0`, `.6.1`, `.6.2`, `.6.3`; `first it.6.0` |
| lo que lo sirve (SERVIDO abajo) | el pedido | `(down it) where "anchor served" in (payload(it2)).4 and first it2.3 = first (first (payload(it)).2).3 and first (payload(it2)).6.0 = first (payload(it)).6.3 and first (payload(it2)).6.2 >= first (payload(it)).6.2`: un «anchor served» del dueño del nodo que nombra el pedido, con la cabecera pedida y un nivel que cubre el pedido |
| ¿servido? | el pedido | `count (SERVIDO) > 0`: verdadero, servido; falso, pendiente |
| del servido: la madre, su nivel, el camino | el pedido | `(payload(first (SERVIDO))).6.1`, `.6.2`, `.6.3` (solo si está servido) |
| ¿espera la firma del titular? (una invitación, un grupo, un precio, un veto) | el registro | `count (first it.6).8.7 != count (first it.6).8.8` (o `acciones.segundoFactor(eje, id).pendiente`) |

**Lecturas con nombre.** Son reglas de esta época con «read» en su 4 y su 3 en `X` (no se materializan, como «asked» y «on time» de la 0), en el 2 de la época; se leen con `leerRegla(regla, id, new ContextoEje(eje, { epoch: eje.epoca() }))` (`src/bqlm.js`), con la regla de `eje.epoca().lecturas` por su nombre, e `it` = el alta del nodo:

- **anchors asked** (pedidos de ancla): `(down (first (first it.3).6)) where "ask for an anchor" in (payload(it2)).4 and first (payload(it2)).2 = it and count (it2.1 where transfer in it3.4 and R in it3.0.0.0 and it3.0.0.1 = first it.3 and it3.3.1 = first it.3) > 0`: lo anclado en el alta del dueño con «ask for an anchor» que nombra este nodo y le devuelve R suya, por llegada; todos, servidos o pendientes (el estado de cada uno, con SERVIDO, arriba).
- **current connections** (conexiones vigentes): `before.3 where count it2.6 > 0 and count (up (first it2.6)) > 0 and "invitation" in (payload(first (up (first it2.6)))).0 and first (payload(first (up (first it2.6)))).5 = it and first (first (up (first it2.6))).3 = first it.3 and count (first (first (up (first it2.6))).6).8.7 = count (first (first (up (first it2.6))).6).8.8 and count (it2.1 where R in it3.0.0.0 and it3.0.0.1 = first it.3 and it3.1 > 0) > 0 and (first (first it2.6).6.2.0 != "nothing" or count ((down (first (first it.3).6)) where last (first it3.6).5 = "3530000000" and first (payload(it3)).0 = it2) > 0 and count ((down (first (first it.3).6)) where last (first it3.6).5 = "3530000000" and first (payload(it3)).0 = it2 and count (first it3.6).8.7 = count (first it3.6).8.8) = 0)`: las identidades cuya alta cuelga de una invitación del dueño al nodo que no espera la firma del titular, con R suya y no vetadas (un veto que espera la firma no cuenta), por llegada.

**Coste** (medido con el ejemplo más 48 conexiones firmadas: 50 conexiones, 49 vigentes y una vetada, 66 identidades, 20 criterios «require authorization» y 256 registros; los topes, `LIMITES` de `src/bqlm.js`: 100 000 pasos y 10 000 ocupantes por evaluación, y cada lectura materializada dentro de otra lleva los suyos): «second factor» de una invitación al nodo, 1134 pasos y 1601 ocupantes (antes de la tercera rama, 728 ocupantes); de un «move to group», 1774 y 2154 (antes, 662); de una operación bajo el nodo, 1482 y 1895 (antes, 1304); «authorized by the holder» de la invitación, 302 y 585; «current connections», 2182 pasos y 5481 ocupantes (antes, 2161 ocupantes: la firma de cada invitación cuesta unos 50, los 20 criterios de su X.6.8.7 y los de su X.6.8.8) en un segundo; «anchors asked», 145 y 160. Los ocupantes de «current connections» crecen con conexiones × criterios: con 20 criterios, el tope de 10 000 llegaría hacia las 90 conexiones.

**Coste de A0** (la atención sin lo que espera la firma; medido sobre el eje de ejemplo, y los tiempos con otros agentes trabajando en la máquina, así que valen de orden): «attention group» no cambia de coste (101 pasos y 283 ocupantes con el pedido de ancla del vecino; solo mira firmas cuando un grupo nombra a quien escribe); «attention price» pasa de 22 pasos y 56 ocupantes a 651 pasos y 1738 ocupantes cuando el grupo tiene un precio escrito (la firma de ese precio, su X.6.8.7, es una lectura con su propio presupuesto) y de 22 y 30 a 45 y 69 cuando rige el de la época. La regla «attention has a price» lee ahora el precio una vez y no unas quince: escribir sobre el alta de otro (el pedido de ancla) pasó de 43 ms a 38 ms de validación (la regla, de 31 a 17 ms) con solo A0, y un registro corriente que no escribe sobre un alta ajena no lee la atención (la regla se para en su primer «or»): ni antes ni después.

En el contrato de JS (`src/contrato.js`) no hay una lectura de conexiones: se leen así. Con el nodo de ejemplo:

```js
import { ejemploNodo } from './ejemplos/state/nodo.mjs';
import { evaluar, leerRegla } from './src/bqlm.js';
import { ContextoEje } from './src/contexto-eje.js';

const { eje, ids } = await ejemploNodo();
const ctx = () => new ContextoEje(eje, { epoch: eje.epoca() });
const lectura = (nombre, id) => leerRegla(eje.epoca().lecturas.find((r) => r[0][0] === nombre), id, ctx()).valor;
const leer = (formula, id) => evaluar(formula, ctx(), { sujeto: id }).valor.map((x) => x?.v ?? x);
const corto = (h) => String(h).slice(0, 8) + '…';
const SERVIDO = '(down it) where "anchor served" in (payload(it2)).4 and first it2.3 = first (first (payload(it)).2).3 and first (payload(it2)).6.0 = first (payload(it)).6.3 and first (payload(it2)).6.2 >= first (payload(it)).6.2';
for (const p of lectura('anchors asked', ids.nodo)) {
  const [libro, clave, nivel, cabecera] = leer('(payload(it)).6', p.id)[0];
  const [servido] = leer(`count (${SERVIDO}) > 0`, p.id);
  const estado = servido ? (([, [madre], [nivelMadre], [camino]]) => `servido: madre ${corto(madre)}, nivel ${nivelMadre}, camino ${camino}`)(leer(`(payload(first (${SERVIDO}))).6`, p.id)[0]) : 'pendiente';
  console.log(`pedido de ${leer('first it.3', p.id)}: libro ${corto(libro)}, clave ${corto(clave)}, nivel ${nivel}, cabecera ${corto(cabecera)}, ${leer('first it.6.0', p.id)}; ${estado}`);
}
for (const c of lectura('current connections', ids.nodo)) {
  const alta = eje.alta(c).id;
  const [[token], [cuanto]] = leer('it.6.2', alta)[0];
  console.log(`conexión ${c}: clave ${corto(leer('(payload(first (up it))).3.5', alta))}, relés ${leer('(payload(last ((down it) where last (first it2.6).5 = "1300000000" and first it2.3 = first it.3 and "declare my relays" in (payload(it2)).4))).1', alta).join(' ')}, grupo ${leer('it.6.3', alta)}, precio ${cuanto} ${token}, le queda ${leer('sum (((first it.3).1 where R in it2.0.0.0 and it2.0.0.1 = first (first (up it)).3) each 1)', alta)} R`);
}
```

```text
pedido de nodo-vecino: libro abababab…, clave cec70f7c…, nivel 2, cabecera cdcdcdcd…, 2026-11-16T08:42:00Z; servido: madre 9a9a9a9a…, nivel 3, camino sip
pedido de nodo-vecino: libro abababab…, clave cec70f7c…, nivel 2, cabecera 5e5e5e5e…, 2026-11-16T08:44:00Z; pendiente
conexión nodo-vecino: clave cec70f7c…, relés wss://vecino.ejemplo.invalid wss://vecino-2.ejemplo.invalid, grupo 3, precio 1 my R, le queda 2 R
```

El eje es la única fuente: el nodo no lleva en la máquina ninguna lista aparte de conexiones, umbrales ni permisos. No depende del transporte (Nostr, HTTP u otro).

## 7. Publicar la época en un eje vacío

`node be.mjs epoca --publicar datos/epocas/state/state-0.btml.json` (con la configuración de `be.mjs`: el servidor, el eje vacío y la identidad del operador; `docs/CONTRATO.md` §5 bis y §17). Escribe el génesis y la época en su libro: **65 registros** (el génesis, la raíz y sus 63 registros: 21 reglas, 10 de ellas lecturas con nombre, y 42 plantillas), firmados, y los sube a 55 por minuto con reintento del 429: algo más de un minuto. El mayor, la raíz, ocupa unos 76 KB (el tope es de 256 KB). Después, las altas del §2 y el camino del §3, como en `ejemplos/state/nodo.mjs`.

## 8. Las conversaciones y los canales

VG 17-11 (por Core State; cerrado con Core AARPIA, encargo «los dos canales»): en el sprint 1 hay dos canales, al menos simulados: uno con personas (Telegram) y uno de IA (el agente de la casa con un modelo simulado). Las conversaciones viven en el libro del nodo, en esta época; la 0 no se toca. Es el caso 2 de AARPIA (`aarpia/APPS_PARA_AGRAM.md`) en cuatro niveles: la persona, el espacio del agente (su alta), la conversación (el activo) y su estado (activa o archivada, una lectura). «Continuar» no es plantilla: es cada mensaje.

**Quién es quién.** El **agente**: una pieza «agent» del nodo declarada agente («register an agent», «declare agent»). El **servicio** que habla con Telegram: una persona del libro (entra por invitación con R del operador); es el único que ve el identificador de fuera (el chat_id), que nunca se guarda en el libro. El **interlocutor de fuera**: una identidad del libro sin clave, dada de alta por el servicio con «register an interlocutor» (una cosa suya: su alta la escribe el servicio, con un segundo de T, lo mínimo para que exista); no actúa: el servicio habla de ella y en su nombre. En el canal de la casa, el interlocutor es la propia persona.

**Los canales** son un dato de la época, `epoch.9.0.5` (`[["channels"], [todos], [los de la casa], [nota]]`): `epoch.9.0.5.1` = `telegram`, `house` y `epoch.9.0.5.2` = `house`. Se añade un canal sin tocar plantillas; uno que no está en `9.0.5.2` es «de fuera» (lo escribe y lo entrega quien dio de alta al interlocutor).

### Las plantillas

| Plantilla (8) | X y ancla | Payload | Quién la escribe |
|---|---|---|---|
| **open a conversation** [1, 24] | el alta de un agente declarado; ancla en su **1.5** (donde encajan los contextos) | 0 el título (opcional; sin él, la representación), **1 el agente** (por defecto el 3.1 de X), 2 el criterio de cierre, **3.0 quien la abre**, **3.1 el interlocutor** (por defecto quien la abre), 4 «open a conversation», 5 «conversation with an agent», **6 la R que da** (opcional; sin él, una unidad) | el dueño del agente (quien escribió su alta) o quien tiene R suya; el interlocutor es quien la abre o una identidad cuya alta escribió quien la abre (el servicio la abre en nombre del interlocutor). Quien no es el dueño paga el precio de su grupo: el 4 devuelve al dueño la R del precio (`first (first ev.6).2.1`), y «attention has a price» lo exige, porque el alta del agente es una pieza. **Y quien abre da al agente su primera R**: una unidad suya (la persona; el servicio, la suya) o, si abre una cosa, de su dueño |
| **open a conversation as an agent** [1, 27] | lo mismo | lo mismo (su 4 es «open a conversation»; 3.0 y 3.1, el agente que la abre) | otro agente declarado, con clave, que abre él mismo la conversación con este agente (agente con agente). Modo agente: «open a conversation» es de modo persona y un agente no lanza una plantilla de modo persona. Paga el precio de su grupo al dueño del otro, como cualquiera, y pasa al agente R de su propio dueño (el 6; sin él, una; con 0, ninguna). Se ofrece a una cosa con R del dueño del agente |
| **rename a conversation** [0, 6] | la conversación; ancla en su **0** | 0 el título nuevo, 1 la conversación, 2 el criterio, 3 quién, 4 «rename a conversation» | quien la abrió o el dueño del agente; vale el último |
| **archive a conversation** [4, 24] | la conversación; ancla en su **4** | 0 la causa (por defecto «archived»), 1 la conversación, 2 «closed by decision», 3 quién, 4 «archive a conversation» y «close by decision» (la forma de «close by decision» de la 0) | quien la abrió o el dueño del agente; después no admite mensajes |
| **message in** [3, 13] | la conversación; ancla en su **3** | **0 «message in»**, **1.0 el canal**, **1.1 el interlocutor** (por defecto, el de la conversación), **1.2 el texto**, **1.3 el adjunto**, **1.4 en respuesta a**, **1.5 la R que da** (opcional; sin él, una unidad) | canal de la casa: la propia persona (1.1 = quien escribe); canal de fuera: quien dio de alta al interlocutor (el autor de su alta, y no él mismo). Siempre el interlocutor de la conversación (su 3.1). Modo persona. **Da R al agente**: quien escribe, R suya (en la casa, la persona; fuera, el servicio) |
| **message in from an agent** [3, 15] | lo mismo | lo mismo (su 0 es «message in»; canal de la casa) | agente con agente: el otro agente, que es el interlocutor de la conversación (1.1 = quien escribe). Modo agente. Devuelve una unidad de R del dueño de este agente a ese dueño y pasa al agente R de su propio dueño (el 1.5; sin él, una; con 0, ninguna) |
| **message out** [3, 14] | la conversación; ancla en su **3** | lo mismo con **0 «message out»** (canal e interlocutor, por defecto los del último que entró); **1.5 la R que pasa** (opcional, solo agente con agente) | el agente de la conversación (su 1) o su dueño; siempre al interlocutor de la conversación. Modo agente (el dueño, una persona, también la lanza). **Devuelve una unidad de R de la persona del otro lado** a su emisor, de lo suyo de quien firma; agente con agente, el 1.5 pasa además al otro agente R del dueño de este |
| **delivery result** [4, 25] | un «message out» de fuera; ancla en su **4** | 0 la representación, 1 el mensaje, 2 el criterio, 3 quién, 4 y 5 «delivery result», **6.0 `sent` o `failed`**, **6.1 la causa** (obligatoria si `failed`), **6.2 una referencia de fuera** (opcional) | quien entrega: el autor del alta del interlocutor del mensaje. Un reintento es otro; vale el último por instante y, a igualdad, por id. En la casa no lleva |
| **register an interlocutor** [1, 25] | la propia alta de quien la lanza; ancla en su **1.4** (como «register a thing») | 0 la identidad (su nombre), **1 la dotación** (1: un segundo de T), 2 el criterio, 3.0 quién, **3.1 el interlocutor**, 4 «register an interlocutor», **5 «interlocutor»**, **6.0 el canal** (de `epoch.9.0.5.1` y no de `9.0.5.2`), **6.1 la huella** (64 hexadecimales en minúsculas) | quien tiene R en el nodo (R de quien escribió el alta de un nodo, que la ancló en su propia alta): el servicio. No declara clave. Mueve un segundo de su T (`T.0`, la escala menor) al interlocutor: lo mínimo para abrir su cuenta |
| **interlocutor of** [1, 26] | el alta del servicio; solo lee (su 4, `read`) | 0 el canal, 1 la huella (los datos de la lectura) | cualquiera; su mensaje es la identidad, o `∅` si nadie dio de alta esa pareja |

Un mensaje lleva lo mínimo que admite la época: un payload no tiene huecos ni textos vacíos (`validarPayload`), así que su acción va en su 0 (lo que es) y no en el 4, que obligaría a escribir también el 2 y el 3. Al menos uno de 1.2 y 1.3; el que falte delante de otro se escribe `-` (los defectos lo ponen: el texto, si hay adjunto; el adjunto, si hay respuesta o R escrita; la respuesta, si hay R escrita en el 1.5), y `-` no cuenta como texto, ni como adjunto, ni como mensaje al que responde. El adjunto es un puntero: 64 hexadecimales en minúsculas (el sha256 de un blob) o `telegram:` y el identificador del archivo. Lo que el BQL mínimo comprueba de `telegram:`: el prefijo (sus nueve bytes en utf8), que le sigue algo y que todo cabe en 137 bytes (relleno de ceros, el byte 137 es cero); **no comprueba** que el identificador sea solo de letras, cifras, guion y guion bajo (no hay primitiva que recorra un texto). Un puntero que no es ni lo uno ni lo otro deja la regla en ERROR (`bytes(…)` de algo que no es hexadecimal) y también se rechaza, con un motivo menos llano.

### Las reglas de validez

Lo que piden las plantillas lo exigen también a lo escrito a mano siete reglas de esta época, detrás de «attention has a price»; cada una se para en su primer `or` si la candidata no es lo suyo (un mensaje es lo que dice «message in» o «message out» en su 0 y cuelga del 3 de una conversación):

- **a message names a channel and its interlocutor**: el 1.0, de `epoch.9.0.5.1`; el 1.1, el interlocutor de la conversación (su 3.1). Nadie mete en una conversación lo que dice o se le dice a otro.
- **a message carries a text or a file**: al menos uno de 1.2 y 1.3 que no sea `-`; el adjunto, un puntero como arriba; el 1.4, un mensaje de la misma conversación o `-`.
- **who writes a message**: lo de la tabla, y la R de cada mensaje (la de «La R en una conversación», abajo).
- **an archived conversation takes no messages**: con un «archive a conversation» en su 4 (de quien la abrió o del dueño del agente), ni uno más.
- **a delivery result comes from whoever delivers**: en el 4 de un «message out» de fuera, de quien dio de alta a su interlocutor, `sent` o `failed` con causa.
- **who opens, renames and archives a conversation**: lo de la tabla para abrir, renombrar y archivar, y la primera R del agente al abrir.
- **an interlocutor is registered once**: el alta de un interlocutor va en el 1.4 de la propia alta, con el tipo «interlocutor», un canal de fuera y una huella bien formada, la escribe quien tiene R en el nodo, y **una misma pareja de canal y huella no se da de alta dos veces por el mismo escritor** (mira lo que cuelga de su alta, la huella primero). Y **no declara ninguna clave** (arreglos de la revisión del gobierno, H7: su 5 es solo su id, `count ev.5 = 1`): un interlocutor no actúa, y un alta escrita a mano que le diera una clave dejaría al servicio firmar en su nombre. Rechazo en español: «… o declarando una clave (un interlocutor no tiene)».

Un interlocutor de un canal de fuera (en «who opens, renames and archives a conversation», el 3.1 que no es quien abre; en «who writes a message», el 1.1 de un «message in» de fuera) ha de ser además **de tipo «interlocutor»** (el 5 de su alta): una lectura del alta que la regla ya mira, sin coste apreciable (de 10 a 16 pasos seguían siendo los de «who writes a message»; con la R, de 55 a 72: «La R en una conversación», abajo).

### Las lecturas

Lecturas con nombre (reglas con «read» y su 3 en `X`), con `leerRegla` como las del §6:

| Lectura | `it` | Da |
|---|---|---|
| **conversations** | el alta del agente | sus conversaciones (registros), por llegada, activas o archivadas |
| **conversation title** | la conversación | el título vigente: el 0 del último renombre válido o su propio 0 |
| **conversation archived** | la conversación | verdadero si está archivada, falso si está activa |
| **messages of** | la conversación | sus mensajes (registros), por llegada; de cada uno, `first (payload(it)).0` el sentido y `(payload(it)).1.0` a `.1.4` el canal, el interlocutor, el texto, el adjunto y en respuesta a |
| **message count** | la conversación | cuántos mensajes tiene |
| **last message** | la conversación | el instante de su último mensaje (nada si no tiene) |
| **delivery** | un «message out» | su resultado vigente (un registro: su 6.0, 6.1 y 6.2), o nada |
| **messages to deliver** | la conversación | los «message out» de fuera sin resultado o con el vigente `failed`, por llegada |

«messages to deliver» es **por conversación**: el servicio la lee en cada conversación del agente. Una global no cabe: lo que cuelga de un agente con 30 conversaciones de 200 mensajes son unos 9000 registros, y recorrerlo (`under`) costó 1688 ocupantes por 304 registros, así que pasaría del tope de 10 000.

### La R en una conversación

Encargo «la R en los canales» (VG 17-11; lo de antes, en `agram-equipo/R_EN_CANALES.md`). **Un agente solo puede escribirle a alguien si tiene R de esa persona, y cada mensaje que le escribe se la gasta: se la devuelve.** Quien quiere que el agente le siga contestando le da R al escribirle; un agente al que no contestan se queda sin R y para. La época 0 no cambia: dar R propia, devolverla a su emisor y pasar R guardada ya estaban en ella. Cada mensaje sigue siendo **un solo registro**: la R se mueve en sus propios movimientos, junto al coste de escribir.

En llano: abrir la conversación le da al agente una unidad de R tuya; cada vez que te escribe te la devuelve; cada vez que le escribes le das otra (o las que digas: «le doy 3» le deja contestarte tres veces seguidas). La R devuelta vuelve a tu saldo, no se quema: una conversación viva gira con la misma R y solo se emite la primera vez (emitirla quema T real).

**Ejemplo de tres vueltas, en la casa** (una persona, *p*, con el agente de la casa, *a*, del operador):

| Registro | Quién | R que mueve | *a* tiene de *p* |
|---|---|---|---|
| abrir la conversación | *p* | el precio de su grupo al operador (como antes) y 1 R de *p* a *a* | 1 |
| vuelta 1: «message out» | *a* | devuelve 1 R de *p* a *p* | 0 |
| vuelta 1: «message in» | *p* | 1 R de *p* a *a* (la que le volvió: no emite) | 1 |
| vuelta 2: «message out» | *a* | devuelve 1 R de *p* a *p* | 0 |
| vuelta 2: «message in», «le doy 3» | *p* | 3 R de *p* a *a* (su 1.5 dice 3) | 3 |
| vuelta 3: tres «message out» seguidos | *a* | 1 R de *p* a *p* cada uno | 0 |
| un cuarto «message out» | *a* | no entra: no tiene R de *p* | 0 |

**Quién da y quién devuelve**:

| Caso | Lo que entra (abrir y «message in») | Lo que sale («message out») |
|---|---|---|
| casa, con una persona | quien escribe da R suya al agente (pone en mano lo que le falte: si no tiene, la emite) | devuelve 1 R del interlocutor al interlocutor |
| fuera (Telegram) | el servicio, que escribe en nombre del interlocutor, da R **del servicio** al agente | devuelve 1 R del servicio al servicio (el interlocutor es una cosa sin clave: no emite ni mueve R) |
| agente con agente | el otro agente devuelve 1 R del dueño de este agente a ese dueño y pasa al agente R de su propio dueño (por defecto 1; con 0, ninguna). Al abrir, paga el precio de su grupo al dueño de este agente y pasa la R de su dueño | devuelve 1 R del dueño del otro agente a ese dueño (un agente es una cosa y no emite: «la persona del otro lado» es quien escribió su alta) y puede pasar al otro agente R del dueño de este (el 1.5) |

La devuelve de lo suyo **quien firma**: lo normal es el propio agente, con la R que guarda; si escribe el dueño del agente, paga con la R de esa persona que tenga él (se la dio ella, con «give own R» de la 0); nadie mueve R de otro (la 0, «nobody moves tokens of others»). Sin esa R, el mensaje no entra.

**Las reglas** lo exigen también a lo escrito a mano: «who writes a message» mira los movimientos del propio mensaje (la cantidad mínima, una unidad; de quién es la R, su emisor; de quién sale, quien escribe; y a quién va) y no deja pasar **ningún otro movimiento de R** que no sea emitir la propia: un mensaje que lleva R de otro emisor, o que la manda a otro sitio, no entra. «who opens, renames and archives a conversation» exige al abrir la unidad de R de quien abre (una persona) al agente, y no deja mover R a otro sitio que al agente o a su dueño (el precio); si abre una cosa (otro agente), pasar la R de su dueño es opcional. Una persona es quien escribió su propia alta (`count X.6 = 0 or first (first X.6).3 = X`); de una cosa, su dueño es quien escribió su alta.

**Agente con agente** pide dos plantillas aparte, **open a conversation as an agent** [1, 27] y **message in from an agent** [3, 15]: «open a conversation» y «message in» son de modo persona y `acciones.transaccion` no deja a un agente lanzar una plantilla de modo persona. Escriben los mismos registros (su 4, «open a conversation»; su 0, «message in») en modo agente; las reglas son las mismas. Lo que entra de otro agente va por el canal de la casa (su 1.1 es quien escribe).

**«Hablas con el agente de tal persona»**: es un dato que la carta puede decir sin nada nuevo: el dueño de un agente es quien escribió su alta, `first (first (first (payload(it)).1).6).3` con `it` = la conversación (y el del otro agente, el mismo camino sobre su 3.1). No se toca la carta.

**Dónde va la cantidad.** La unidad por defecto no se escribe: va solo en los movimientos, y el registro pesa lo mismo que antes. Si se da otra cantidad, va en el payload: **1.5** en «message in», «message in from an agent» y «message out» (en este, la R que pasa al otro agente); **6** al abrir; **6.4** en «anchor served». En los mensajes, el 1.3 y el 1.4 que falten delante del 1.5 van como `-` (un payload no tiene huecos).

**Coste en T** (antes → después): un mensaje con la unidad por defecto, igual (4 minutos solo texto, 5 con adjunto, 6 en respuesta); con la cantidad escrita, 7 (el 1.5 y los `-` que falten delante: +3 con solo texto, +2 con adjunto, +1 en respuesta); abrir, 7 igual y 8 con el 6; «anchor served», 11 igual y 12 con el 6.4. Emitir la R la primera vez no añade T: la quema del coste de escribir, que es T real, es la que pide la 0 («minting R needs real T»).

**Pasos de validación** (los de la propia regla sobre el ejemplo, antes → después; tope de 100 000 pasos y 10 000 ocupantes): «who writes a message» con un «message in» de la casa, 10 → 55 pasos (25 → 106 ocupantes); de Telegram, 19 → 58 (48 → 119); un «message out» de la casa, 11 → 55 (23 → 116); de Telegram, 11 → 72 (23 → 156); agente con agente, 94 y 201 lo que entra y 104 y 256 lo que sale (no había). «who opens, renames and archives a conversation» al abrir, de la casa 43 → 105 (99 → 222), de Telegram 52 → 113 (121 → 247), agente con agente 94 y 222. No crecen con la conversación: miran los movimientos del propio registro y las altas de quien escribe, del agente y del interlocutor. Las demás reglas se paran en su primer «or» como antes.

**El P** (dato para la revisión de seguridad; no se ha cambiado: la R recibida sigue dando P, sin excepción, VG). La regla de la 0 «receiving R gives ten P on the root of its issuer» **coloca** el P (put) a diez por unidad de lo que el agente tiene de esa R al recibirla de su emisor; no suma por vuelta. Medido: en la casa, abrir le da al agente 10 P sobre el alta de la persona; **tras diez vueltas sigue en 10** (la R gira y nunca tiene más de una); tras «le doy 3», 40. **Agente con agente, tres vueltas: 0 P** del agente sobre el dueño del otro (la R de ese dueño le llega por el otro agente, no de su emisor) y 0 sobre el otro agente; el P de cada agente sobre el dueño del otro es solo el de la R que ese dueño le dio directamente (20 con dos unidades) y no cambia con las vueltas.

**Límite conocido: el tope por conversación.** La R que un agente recibe es de una persona o de un servicio, no de una conversación: lo que acumula con diez chats de Telegram (todos con R del servicio) lo puede gastar en uno solo, y la R que una persona le da en una conversación le sirve en otra con ella. Que la R de un chat no se gaste en otro pediría una regla que cuente dentro de cada conversación (lo que entra menos lo que sale); no se ha construido.

**Lo que cruza a otros** (la pasarela de StateArk, un conversador): `docs/notas/R_EN_CANALES.md`.

**Fuera de los canales, un arreglo**: la lectura «attention group» de esta época (A0) multiplicaba el grupo de la invitación aceptada por el recuento de su condición, así que sumaba el 8 del registro del que cuelga el alta aunque no fuera una invitación; para una cosa de una persona (el alta de otro agente, que cuelga del alta de su dueño) ese 8 no es un número y la lectura quedaba en ERROR, así que otro agente no podía abrir una conversación. Ahora suma el 8 filtrado por esa condición: da lo mismo (101 pasos y 135 ocupantes con la conexión del ejemplo, igual que antes).

**La huella del interlocutor.** El alta del interlocutor de fuera lleva su canal y la huella de su identificador de fuera (64 hexadecimales en minúsculas), nunca el identificador. La huella es un HMAC-SHA256 del identificador con una clave que guarda StateArk; la época no sabe cómo se calcula, solo que son 64 hexadecimales. «interlocutor of», con el canal y la huella, da la identidad que tiene esa pareja (la primera por llegada) entre lo que cuelga del alta del servicio, para que el servicio no dependa solo de su mapa privado. Se lanza como una acción que solo lee: `acciones.transaccion(eje, 'interlocutor of', { X: <alta del servicio>, channel, fingerprint }, quien)` y la identidad es `lectura.mensaje`.

**El alta del interlocutor y su dotación** (encargo, C; decidido por Core AGRAM al fundir: sin tocar el núcleo ni la 0). Una identidad existe cuando tiene cuenta en el libro, y la cuenta la abre la primera transacción que la toca (`src/libro.js`, `#abrir`); un movimiento es de una cantidad mayor que cero, y `src/eje.js` solo abre sin movimiento la cuenta del autor del génesis. Por eso «register an interlocutor» le pasa lo mínimo: **un segundo** de la T de quien la lanza (`T.0`), y nada más; el interlocutor no tiene clave, no escribe y no gasta. Un interlocutor sin dotación pediría al núcleo que `transaccion` de `src/eje.js` abriera la cuenta de la identidad que declara el 3.1 de un registro de un tipo que diga la época; no se ha hecho.

**Coste del alta y de «interlocutor of»** (medido con 500 interlocutores de un mismo servicio; tope de 10 000 ocupantes): la regla «an interlocutor is registered once» de la 501, 2562 pasos y 5110 ocupantes, y unos 31 ms de validación; «interlocutor of» de uno que existe, 4026 pasos y 5027 ocupantes (recorre dos veces lo que cuelga del alta del servicio: la identidad y la comprobación de que la hay), y de uno que no, 2006 y 2501. Las dos crecen con los interlocutores del servicio, unos 10 ocupantes por alta: **el tope llegaría hacia los 950 interlocutores de un mismo servicio**; a partir de ahí la regla no se resolvería (PENDIENTE POR LÍMITE) y no entraría ninguna alta más de ese servicio, así que con más hay que repartirlos (otra alta del servicio, o una cosa suya por canal) o pedir al núcleo un índice. Coste en T del alta: 9 minutos de escribir (sus nueve posiciones) y el segundo de la dotación.

**Coste en T.** Cada posición escrita cuesta un minuto («the cost of writing»): un mensaje de solo texto, **4 minutos** (0, 1.0, 1.1 y 1.2); con adjunto, 5; en respuesta y sin adjunto, 6 (el adjunto va como `-`); con la R escrita en el 1.5, 7 (la unidad por defecto no se escribe); abrir una conversación, 7 (y una R del dueño si no es su dueño, más la R que da al agente; 8 con el 6 escrito); un resultado de entrega, de 7 a 9 (8 el fallido con su causa, 9 el enviado con su referencia); renombrar, 5; archivar, 6. **Al día**: una persona tiene 1440 minutos de T de minuto, así que escribe hasta **360 mensajes de solo texto al día** (288 con adjunto, 240 en respuesta), si no escribe otra cosa; un agente (una cosa) no tiene T del día: gasta su dotación (el de la casa, 600 minutos en el ejemplo: unos 150 mensajes) y su dueño se la repone.

**Coste de leer y de escribir** (una conversación de Telegram con 200 mensajes, 100 que entran y 100 que salen, 66 resultados de entrega, y 30 conversaciones del agente; los pasos y ocupantes son los de la propia evaluación, frente a los topes de 100 000 y 10 000): «conversations» 124 pasos y 153 ocupantes; «conversation title» 1476 y 1742; «conversation archived» 601 y 600; «messages of» y «message count» 901 y 1200; «last message» 903 y 1202; «delivery» 14 y 24; «messages to deliver» 2663 y 4993 (la que más: el resultado vigente de cada mensaje que sale; el tope de ocupantes llegaría hacia los 400 mensajes en una conversación). Escribir un mensaje en esa conversación cuesta unos 25 ms de validación; de las reglas nuevas, solo «an archived conversation takes no messages» crece con la conversación (607 pasos y 613 ocupantes con 200 mensajes: mira lo anclado en ella); las demás, de 10 a 16 pasos (con la R, «who writes a message» de 55 a 72 y al abrir «who opens, renames and archives a conversation» de 105 a 113: «La R en una conversación»). Las seis reglas se miran en cada escritura del libro y se paran en su primera comprobación: el ejemplo del nodo pasó de unos 4,7 s a 5,5 s con el paso 10 añadido (medido con otros agentes en la máquina: vale de orden).

Con el nodo de ejemplo:

```js
import { ejemploNodo } from './ejemplos/state/nodo.mjs';
import { leerRegla } from './src/bqlm.js';
import { ContextoEje } from './src/contexto-eje.js';

const { eje, ids } = await ejemploNodo();
const lee = (nombre, id) => leerRegla(eje.epoca().lecturas.find((r) => r[0][0] === nombre), id, new ContextoEje(eje, { epoch: eje.epoca() })).valor.map((x) => x?.id ?? x);
for (const c of lee('conversations', ids.agenteCasa)) {
  const [, [agente], , [[abre], [interlocutor]]] = eje.obtener(c).payload;
  console.log(`«${lee('conversation title', c)}», de ${abre} con ${agente} (interlocutor ${interlocutor}): ${lee('conversation archived', c)[0] ? 'archivada' : 'activa'}, ${lee('message count', c)} mensajes, el último ${lee('last message', c)[0] ?? '—'}`);
  for (const m of lee('messages of', c)) {
    const [[que], [[canal], [quien], [texto], [adjunto] = [], respuesta]] = eje.obtener(m).payload;
    const entrega = que === 'message out' && canal !== 'house' ? lee('delivery', m).map((d) => eje.obtener(d).payload[6][0][0]) : [];
    console.log(`  ${que} por ${canal}, ${quien}: ${texto}${adjunto && adjunto !== '-' ? ' + ' + adjunto : ''}${respuesta ? ' (en respuesta)' : ''}${entrega.length ? ' · entrega vigente: ' + entrega : ''}`);
  }
  console.log(`  por entregar: ${lee('messages to deliver', c).length}`);
}
```

```text
«Horario de la tienda», de persona-casa con agente-casa (interlocutor persona-casa): activa, 2 mensajes, el último 2026-11-16T09:00:00Z
  message in por house, persona-casa: ¿A qué hora abre la tienda de ejemplo?
  message out por house, persona-casa: Abre a las nueve (respuesta del modelo simulado). (en respuesta)
  por entregar: 0
«open a conversation: servicio-telegram opens a conversation with agente-casa», de servicio-telegram con agente-casa (interlocutor interlocutor-1): activa, 2 mensajes, el último 2026-11-16T09:06:00Z
  message in por telegram, interlocutor-1: Hola, ¿queda pan? + telegram:AgAD-ejemplo_0001
  message out por telegram, interlocutor-1: Sí, hasta las dos. (en respuesta) · entrega vigente: sent
  por entregar: 0
«Una prueba ya resuelta», de persona-casa con agente-casa (interlocutor persona-casa): archivada, 0 mensajes, el último —
  por entregar: 0
```

La conversación de Telegram no tiene título: su 0 es su representación. La primera entrega de su respuesta falló («el canal no respondió a tiempo») y el reintento salió: vale el último.
