# La época de la clase `state`: cómo se monta un nodo

Para quien monta el eje de un nodo (Core AARPIA). VG 16-11, #124: el nodo, visto desde dentro, es un eje, y su época es esta. Fuente y generador en `datos/epocas/state/` (`LEEME.md`); eje de ejemplo en `ejemplos/state/nodo.mjs`; pruebas en `test/epoca-state.test.js`. Las conexiones son invitados y piden anclas con R (VG 17-11, §4 bis).

- **Id**: el de `datos/epocas/state/state-0.ids.json` (`epoca`). Hereda de la época 0 definitiva (`d6688507…`) y no la cambia.
- **Genérica**: vale para cualquier nodo de la clase `state`. Nada real va en la época: dominios, claves y máquinas van en el libro del nodo, como datos de sus altas.

## 1. Quién es quién

| Identidad | Qué es | Qué escribe |
|---|---|---|
| **operador** | la cuenta raíz del eje (el autor del génesis): quien monta el nodo y es dueño de sus piezas. Hoy, la clave del nodo que guarda Core AARPIA | el alta del nodo, las altas de las piezas, «en servicio», las operaciones, los umbrales y los vencimientos |
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

**El criterio «require authorization»** (requerir autorización, PV2): lo escribe el titular en el 2.4 del alta del nodo: su 1, las plantillas que no se ejecutan sin la firma (por defecto, la lista inicial de arriba, con la propia plantilla dentro); su 3, quién firma. Un registro escrito con una de ellas bajo el nodo queda «autorizada» y pendiente («por autorizar» en el 6 de la carta, para quien lo escribió y para el titular) hasta que quien firma escribe y firma su autorización; la firma de otro no vale. Sin la firma, el recibo no la lleva a ejecutada. Es el mismo camino que el segundo factor de la 0 (`docs/CONTRATO.md` §12.4 bis): la lectura «second factor» de esta época alcanza, además de los criterios del autor, los del nodo por plantilla. Un criterio nuevo rige en cuanto se escribe (y él mismo espera su firma); no se puede quitar uno, solo añadir.

## 4 bis. Las conexiones y los pedidos de ancla (A14, rehecho: VG 17-11)

«Tienes custodia de quien te ha dado su R.» Una **conexión** (otro nodo) es un **invitado con alta en el libro del nodo**, no una pieza ni una operación. El **dueño del nodo** es quien escribió su alta (el operador): su R es la llave del servicio, y la R que da sigue dando P (la de la época 0, sin excepción). Todo es de la época 0 tal cual salvo dos plantillas pequeñas de esta época:

- **Conectar** = la invitación de la 0 (`eje.invitar`), **por nombre** (no hay invitación abierta: la casa invita al crear la cuenta): el dueño invita a la identidad del otro nodo con su clave (3.5 de la invitación), le da R suya (lo que da), la pone en un grupo de su atención (8) y la invita **al dominio del nodo** (su 5 = el alta del nodo: así se distingue de otras invitaciones del dueño, como la del titular). Al aceptar (`eje.aceptar`, firmada con su clave) tiene alta en este libro.
- **Sus relés**: **declare my relays** (declarar mis relés; [1, 23]), que el invitado escribe en el **1.3 de su propia alta** (con quién, donde «register the relay» pone el relé del nodo), con las urls en su 1, una por ocupante; vale la última. Siempre ancla en el alta de quien la lanza (su 5: `=first me.6`) y la lectura solo cuenta las del dueño del alta: nadie declara relés en el alta de otro.
- **Permisos** = su grupo de atención (el 8 de la invitación, o «move to group») y el precio de ese grupo («set a group price»). En el ejemplo, el grupo 3 con precio «my R» 1: escribir al dueño le cuesta devolverle una unidad de su R.
- **Quitar** = **veto someone** (el 3.5.3 del alta del dueño: el grupo 5, con precio «nothing»). Quedarse sin R del dueño también la saca de las vigentes.

**ask for an anchor** (pedir un ancla; [3, 11]) es el mismo movimiento que «return R (ask for attention)» de la 0: quien pide devuelve R del dueño del nodo a su emisor (1, por defecto una unidad) y ancla en el **3 del alta del dueño**. Se ofrece sobre el alta del nodo a quien tenga R de su dueño. 2 el nodo, 3 quién pide y el dueño, 4 la acción, 5 «anchor request» y, como **datos** y no referencias (el otro libro no está en este eje), **6.0 el libro** (el id de su génesis), **6.1 la clave de la línea** (x-only), **6.2 el nivel pedido** (de `epoch.7.6.1`) y **6.3 la cabecera** (su hash); libro, clave y cabecera son 64 hexadecimales en minúsculas (`=hex(slice(bytes(it), 0, 32)) = it`). No hay regla de validez nueva: el precio lo cobra «attention has a price» (un pedido sin pagar, o pagado con la R propia de quien pide cuando el precio es «my R», no entra). Hoy nada en el libro dice que un pedido está **servido**, ni compensa uno que no se sirve a tiempo: «anchors asked» los da todos.

Salen «add a connection», «change a connection's permissions» y «remove a connection» (y el papel «connection» de la lista cerrada de las piezas). **Lo que cambia con ellas**: invitar, cambiar de grupo o de precio y vetar se escriben en el alta del dueño, no cuelgan del nodo, así que el criterio «require authorization» del nodo no los alcanza (antes, las tres operaciones esperaban la firma de quien nombra el titular); y los permisos por herramienta o aviso (texto libre) pasan a ser el grupo y su precio.

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
| los pedidos de ancla por servir | el nodo | la lectura con nombre **«anchors asked»** (abajo) |
| de cada pedido: quién, libro, clave, nivel, cabecera, instante | el pedido | `first it.3`; `(payload(it)).6.0`, `.6.1`, `.6.2`, `.6.3`; `first it.6.0` |

**Lecturas con nombre.** Son reglas de esta época con «read» en su 4 y su 3 en `X` (no se materializan, como «asked» y «on time» de la 0), en el 2 de la época; se leen con `leerRegla(regla, id, new ContextoEje(eje, { epoch: eje.epoca() }))` (`src/bqlm.js`), con la regla de `eje.epoca().lecturas` por su nombre, e `it` = el alta del nodo:

- **anchors asked** (pedidos de ancla): `(down (first (first it.3).6)) where "ask for an anchor" in (payload(it2)).4 and first (payload(it2)).2 = it and count (it2.1 where transfer in it3.4 and R in it3.0.0.0 and it3.0.0.1 = first it.3 and it3.3.1 = first it.3) > 0`: lo anclado en el alta del dueño con «ask for an anchor» que nombra este nodo y le devuelve R suya, por llegada.
- **current connections** (conexiones vigentes): `before.3 where count it2.6 > 0 and count (up (first it2.6)) > 0 and "invitation" in (payload(first (up (first it2.6)))).0 and first (payload(first (up (first it2.6)))).5 = it and first (first (up (first it2.6))).3 = first it.3 and count (it2.1 where R in it3.0.0.0 and it3.0.0.1 = first it.3 and it3.1 > 0) > 0 and first (first it2.6).6.2.0 != "nothing"`: las identidades cuya alta cuelga de una invitación del dueño al nodo, con R suya y no vetadas, por llegada.

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
for (const p of lectura('anchors asked', ids.nodo)) {
  const [libro, clave, nivel, cabecera] = leer('(payload(it)).6', p.id)[0];
  console.log(`pedido de ${leer('first it.3', p.id)}: libro ${corto(libro)}, clave ${corto(clave)}, nivel ${nivel}, cabecera ${corto(cabecera)}, ${leer('first it.6.0', p.id)}`);
}
for (const c of lectura('current connections', ids.nodo)) {
  const alta = eje.alta(c).id;
  const [[token], [cuanto]] = leer('it.6.2', alta)[0];
  console.log(`conexión ${c}: clave ${corto(leer('(payload(first (up it))).3.5', alta))}, relés ${leer('(payload(last ((down it) where last (first it2.6).5 = "1300000000" and first it2.3 = first it.3 and "declare my relays" in (payload(it2)).4))).1', alta).join(' ')}, grupo ${leer('it.6.3', alta)}, precio ${cuanto} ${token}, le queda ${leer('sum (((first it.3).1 where R in it2.0.0.0 and it2.0.0.1 = first (first (up it)).3) each 1)', alta)} R`);
}
```

```text
pedido de nodo-vecino: libro abababab…, clave cec70f7c…, nivel 2, cabecera cdcdcdcd…, 2026-11-16T08:40:00Z
conexión nodo-vecino: clave cec70f7c…, relés wss://vecino.ejemplo.invalid wss://vecino-2.ejemplo.invalid, grupo 3, precio 1 my R, le queda 1 R
```

El eje es la única fuente: el nodo no lleva en la máquina ninguna lista aparte de conexiones, umbrales ni permisos. No depende del transporte (Nostr, HTTP u otro).

## 7. Publicar la época en un eje vacío

`node be.mjs epoca --publicar datos/epocas/state/state-0.btml.json` (con la configuración de `be.mjs`: el servidor, el eje vacío y la identidad del operador; `docs/CONTRATO.md` §5 bis y §17). Escribe el génesis y la época en su libro: **37 registros** (el génesis, la raíz y sus 35 registros: 4 reglas, 2 de ellas lecturas con nombre, y 31 plantillas), firmados, y los sube a 55 por minuto con reintento del 429: cabe en un minuto. El mayor, la raíz, ocupa unos 61 KB (el tope es de 256 KB). Después, las altas del §2 y el camino del §3, como en `ejemplos/state/nodo.mjs`.
