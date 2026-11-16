# La época de la clase `state`: cómo se monta un nodo

Para quien monta el eje de un nodo (Core AARPIA). VG 16-11, #124: el nodo, visto desde dentro, es un eje, y su época es esta. Fuente y generador en `datos/epocas/state/` (`LEEME.md`); eje de ejemplo en `ejemplos/state/nodo.mjs`; pruebas en `test/epoca-state.test.js`. Las conexiones son invitados, piden anclas con R, y su invitación, su grupo y su veto esperan la firma del titular; el dueño del nodo sirve los pedidos (VG 17-11, §4 bis).

- **Id**: el de `datos/epocas/state/state-0.ids.json` (`epoca`). Hereda de la época 0 definitiva (`e9beede7…`) y no la cambia.
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

**anchor served** (ancla servida; [3, 12]; VG 17-11): dice que un pedido está **servido**. Se ofrece sobre el pedido a quien sirve y ancla en el **4 del pedido**; no mueve más que el T de escribir. **Quien sirve es el dueño del nodo** (el operador: quien escribió el alta del nodo y a quien el pedido devuelve R; su clave es hoy la del nodo): con lo que hay en esta época, el nodo es una cosa sin clave y el sellador no tiene identidad en el libro. Escrita por otro, entra en el libro pero no cuenta. 1 el pedido, 2 el criterio de cierre, 3 quién sirve y quién pidió, 4 la acción, 5 «served anchor» y, como datos: **6.0 la cabecera pedida** (el mismo hash que el 6.3 del pedido: es su defecto y la validación lo exige), **6.1 la cabecera madre** que la incluye, **6.2 el nivel de la madre** (de `epoch.7.6.1`) y **6.3 el camino** (texto corto; hoy «sip», el defecto). Los hashes, 64 hexadecimales en minúsculas, con la misma comprobación que el pedido. Un pedido está **servido** si tiene anclado un «anchor served» del dueño del nodo que nombra el pedido cuyo 6.0 es el 6.3 del pedido, y **pendiente** si no (§6); «anchors asked» sigue dando todos los pedidos.

Salen «add a connection», «change a connection's permissions» y «remove a connection» (y el papel «connection» de la lista cerrada de las piezas); los permisos por herramienta o aviso (texto libre) pasan a ser el grupo y su precio.

**La firma del titular en las conexiones** (VG 17-11: «es algo pequeño y ya lo completa»). Invitar, cambiar de grupo o de precio y vetar se escriben en el alta del dueño, no cuelgan del nodo; aun así, si el nodo tiene escrito un criterio «require authorization» (cualquiera: no se mira su lista), estas escrituras **del dueño del nodo** quedan «autorizada» y pendientes hasta que firma quien nombra el criterio (su 3), por el mismo camino que las plantillas que cuelgan del nodo:

- **conectar**: la invitación de la 0 cuyo 5 es el alta del nodo (las demás invitaciones del dueño, como la del titular, no esperan);
- **set a group price**: lo que ancla en el 3.k.2 de su propia alta;
- **move to group** y **veto someone**: lo que ancla en el 3.k.3 de su propia alta (el veto es el 3.5.3), solo si la identidad movida (su 0) tiene un alta que cuelga de una invitación al dominio del nodo (una conexión, vigente o no).

Es una tercera rama de la lectura «second factor» de esta época, no una regla que rechace: sin criterio, todo sigue como antes. La posición del ancla se lee de los diez dígitos de su dirección como cinco bytes (`le(bytes(last (first it.6).5))`: el 3.k.2 da de 8240 a 8249 y el 3.k.3, de 12336 a 12345). Mientras espera la firma, la conexión **no sale en «current connections»** (su invitación lleva su X.6.8.7 sin su X.6.8.8) y un veto pendiente **no la quita** (el «nothing» solo cuenta si hay un veto ya firmado). **Lo que no alcanza sin tocar la 0**: el grupo y el precio de la atención del dueño (`it.6.3` y `it.6.2` de su alta, las lecturas «attention group» y «attention price» de la 0, que leen los grupos del 3 de su alta tal como los arma `src/contexto-eje.js`) y la regla «attention has a price», que los lee, cambian en cuanto se escriben, firmados o no: un cambio de grupo o de precio pendiente ya rige para lo que cuesta escribir, y un veto pendiente ya rechaza. Para que no, habría que sustituir en esta época esas dos lecturas por otras que salten lo que espera su firma (o que el núcleo arme los grupos sin ello).

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
| su grupo y su precio | su alta | `it.6.3` y `it.6.2` (las lecturas «attention group» y «attention price» de la 0: su sitio en la atención del dueño) |
| la R del dueño que le queda | su alta | `sum (((first it.3).1 where R in it2.0.0.0 and it2.0.0.1 = first (first (up it)).3) each 1)` |
| los pedidos de ancla, servidos o no | el nodo | la lectura con nombre **«anchors asked»** (abajo) |
| de cada pedido: quién, libro, clave, nivel, cabecera, instante | el pedido | `first it.3`; `(payload(it)).6.0`, `.6.1`, `.6.2`, `.6.3`; `first it.6.0` |
| lo que lo sirve (SERVIDO abajo) | el pedido | `(down it) where "anchor served" in (payload(it2)).4 and first it2.3 = first (first (payload(it)).2).3 and first (payload(it2)).6.0 = first (payload(it)).6.3`: un «anchor served» del dueño del nodo que nombra el pedido, con la cabecera pedida |
| ¿servido? | el pedido | `count (SERVIDO) > 0`: verdadero, servido; falso, pendiente |
| del servido: la madre, su nivel, el camino | el pedido | `(payload(first (SERVIDO))).6.1`, `.6.2`, `.6.3` (solo si está servido) |
| ¿espera la firma del titular? (una invitación, un grupo, un precio, un veto) | el registro | `count (first it.6).8.7 != count (first it.6).8.8` (o `acciones.segundoFactor(eje, id).pendiente`) |

**Lecturas con nombre.** Son reglas de esta época con «read» en su 4 y su 3 en `X` (no se materializan, como «asked» y «on time» de la 0), en el 2 de la época; se leen con `leerRegla(regla, id, new ContextoEje(eje, { epoch: eje.epoca() }))` (`src/bqlm.js`), con la regla de `eje.epoca().lecturas` por su nombre, e `it` = el alta del nodo:

- **anchors asked** (pedidos de ancla): `(down (first (first it.3).6)) where "ask for an anchor" in (payload(it2)).4 and first (payload(it2)).2 = it and count (it2.1 where transfer in it3.4 and R in it3.0.0.0 and it3.0.0.1 = first it.3 and it3.3.1 = first it.3) > 0`: lo anclado en el alta del dueño con «ask for an anchor» que nombra este nodo y le devuelve R suya, por llegada; todos, servidos o pendientes (el estado de cada uno, con SERVIDO, arriba).
- **current connections** (conexiones vigentes): `before.3 where count it2.6 > 0 and count (up (first it2.6)) > 0 and "invitation" in (payload(first (up (first it2.6)))).0 and first (payload(first (up (first it2.6)))).5 = it and first (first (up (first it2.6))).3 = first it.3 and count (first (first (up (first it2.6))).6).8.7 = count (first (first (up (first it2.6))).6).8.8 and count (it2.1 where R in it3.0.0.0 and it3.0.0.1 = first it.3 and it3.1 > 0) > 0 and (first (first it2.6).6.2.0 != "nothing" or count ((down (first (first it.3).6)) where last (first it3.6).5 = "3530000000" and first (payload(it3)).0 = it2) > 0 and count ((down (first (first it.3).6)) where last (first it3.6).5 = "3530000000" and first (payload(it3)).0 = it2 and count (first it3.6).8.7 = count (first it3.6).8.8) = 0)`: las identidades cuya alta cuelga de una invitación del dueño al nodo que no espera la firma del titular, con R suya y no vetadas (un veto que espera la firma no cuenta), por llegada.

**Coste** (medido con el ejemplo más 48 conexiones firmadas: 50 conexiones, 49 vigentes y una vetada, 66 identidades, 20 criterios «require authorization» y 256 registros; los topes, `LIMITES` de `src/bqlm.js`: 100 000 pasos y 10 000 ocupantes por evaluación, y cada lectura materializada dentro de otra lleva los suyos): «second factor» de una invitación al nodo, 1134 pasos y 1601 ocupantes (antes de la tercera rama, 728 ocupantes); de un «move to group», 1774 y 2154 (antes, 662); de una operación bajo el nodo, 1482 y 1895 (antes, 1304); «authorized by the holder» de la invitación, 302 y 585; «current connections», 2182 pasos y 5481 ocupantes (antes, 2161 ocupantes: la firma de cada invitación cuesta unos 50, los 20 criterios de su X.6.8.7 y los de su X.6.8.8) en un segundo; «anchors asked», 145 y 160. Los ocupantes de «current connections» crecen con conexiones × criterios: con 20 criterios, el tope de 10 000 llegaría hacia las 90 conexiones.

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
const SERVIDO = '(down it) where "anchor served" in (payload(it2)).4 and first it2.3 = first (first (payload(it)).2).3 and first (payload(it2)).6.0 = first (payload(it)).6.3';
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
conexión nodo-vecino: clave cec70f7c…, relés wss://vecino.ejemplo.invalid wss://vecino-2.ejemplo.invalid, grupo 3, precio 1 my R, le queda 1 R
```

El eje es la única fuente: el nodo no lleva en la máquina ninguna lista aparte de conexiones, umbrales ni permisos. No depende del transporte (Nostr, HTTP u otro).

## 7. Publicar la época en un eje vacío

`node be.mjs epoca --publicar datos/epocas/state/state-0.btml.json` (con la configuración de `be.mjs`: el servidor, el eje vacío y la identidad del operador; `docs/CONTRATO.md` §5 bis y §17). Escribe el génesis y la época en su libro: **38 registros** (el génesis, la raíz y sus 36 registros: 4 reglas, 2 de ellas lecturas con nombre, y 32 plantillas), firmados, y los sube a 55 por minuto con reintento del 429: cabe en un minuto. El mayor, la raíz, ocupa unos 63 KB (el tope es de 256 KB). Después, las altas del §2 y el camino del §3, como en `ejemplos/state/nodo.mjs`.
