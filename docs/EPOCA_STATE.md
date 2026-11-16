# La época de la clase `state`: cómo se monta un nodo

Para quien monta el eje de un nodo (Core AARPIA). VG 16-11, #124: el nodo, visto desde dentro, es un eje, y su época es esta. Fuente y generador en `datos/epocas/state/` (`LEEME.md`); eje de ejemplo en `ejemplos/state/nodo.mjs`; pruebas en `test/epoca-state.test.js`.

- **Id**: el de `datos/epocas/state/state-0.ids.json` (`epoca`). Hereda de la época 0 definitiva (`4e3d3e6f…`) y no la cambia.
- **Genérica**: vale para cualquier nodo de la clase `state`. Nada real va en la época: dominios, claves y máquinas van en el libro del nodo, como datos de sus altas.

## 1. Quién es quién

| Identidad | Qué es | Qué escribe |
|---|---|---|
| **operador** | la cuenta raíz del eje (el autor del génesis): quien monta el nodo y es dueño de sus piezas. Hoy, la clave del nodo que guarda Core AARPIA | el alta del nodo, las altas de las piezas, «en servicio», las operaciones, los umbrales y los vencimientos |
| **titular** | una persona del eje (entra por invitación), nombrada en el 3.2 del alta del nodo | el criterio «require authorization» en el 2.4 del alta del nodo |
| **quien firma** | la identidad que nombra el criterio (su 3): una cosa del titular cuya clave custodia StateArk, o el titular | las autorizaciones (`acciones.autorizar`; en la carta, «por autorizar») |
| **vigía** | una pieza de papel «agent», declarada agente | las medidas, en el 8 de cada pieza |
| **ejecutor** | otra pieza «agent», declarada agente: lista cerrada de órdenes, sin shell | los recibos de lo que hace fuera, y los fallos |

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
| — | una conexión (otro nodo) | **add a connection** (es una operación, §4) | 4.1 | 0 su nombre, 6.0 su clave pública (x-only, hex: un dato, no una identidad), 6.1 sus relés, 6.2 sus permisos |

Las piezas que no escriben en el libro no declaran clave (una cosa sin clave puede tener alta; sin clave no actúa). Los minutos del 1 son la T que el operador les da (una cosa no tiene T diaria).

## 3. El camino del 9 del nodo

Seis pasos, en orden, cada uno con su acción (#90): **alta del nodo** (register the node), **autoridad** (register the authority), **relé** (register the relay), **archivo** (register the archive), **contextos** (declare a context) y **en servicio** (put in service, en el 9 del nodo). Un paso está hecho cuando hay en su ancla un registro de quien mira (`acciones.camino`): el camino es el del operador, que es quien lo recorre. «follow the path» (PV9) lanza el siguiente.

## 4. Qué escribe un operador: las operaciones (tabla 3.2 de UI_NODO)

Una operación es un **movimiento anunciado** en el 4.1 de la pieza sobre la que actúa (del nodo, si es una conexión): el operador anuncia que el ejecutor dará minutos de su T al nodo (su 1: cuándo y cuántos; por defecto, ahora y uno), con el ejecutor en su 3.1 y sus datos en su 6. El ejecutor comprueba las firmas, lo hace fuera y deja su recibo:

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
| add a connection / change a connection's permissions / remove a connection | el nodo / la conexión | sí | §2 / los permisos nuevos / — |
| resend the mirror queue | el relé | **no** (libre) | — |
| seal the pending | una puerta o la autoridad | **no** (libre) | — |

Ver salud, logs y recibos es solo leer. Borrar datos y lo de fuera del nodo (la máquina, el DNS, pagar) no existen en esta época.

**El criterio «require authorization»** (requerir autorización, PV2): lo escribe el titular en el 2.4 del alta del nodo: su 1, las plantillas que no se ejecutan sin la firma (por defecto, la lista inicial de arriba, con la propia plantilla dentro); su 3, quién firma. Un registro escrito con una de ellas bajo el nodo queda «autorizada» y pendiente («por autorizar» en el 6 de la carta, para quien lo escribió y para el titular) hasta que quien firma escribe y firma su autorización; la firma de otro no vale. Sin la firma, el recibo no la lleva a ejecutada. Es el mismo camino que el segundo factor de la 0 (`docs/CONTRATO.md` §12.4 bis): la lectura «second factor» de esta época alcanza, además de los criterios del autor, los del nodo por plantilla. Un criterio nuevo rige en cuanto se escribe (y él mismo espera su firma); no se puede quitar uno, solo añadir.

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
| las conexiones vigentes (sus nombres) | el nodo | `((down it) where last (first it2.6).5 = "4100000000" and "connection" in (payload(it2)).5 and HECHA and count ((down it2) where "remove a connection" in (payload(it3)).4) = 0) each 0` |
| sus permisos | la conexión | los del último cambio hecho, `(payload(last ((down it) where "change a connection's permissions" in (payload(it2)).4 and HECHA))).6`; si no hay ninguno, los de su alta, `(payload(it)).6.2` |
| el núcleo vigente | la autoridad | el 6 del último «change the core» hecho, `(payload(last ((down it) where "change the core" in (payload(it2)).4 and HECHA))).6`; si no hay ninguno, el de su alta, `(payload(it)).6` |

El eje es la única fuente: el nodo no lleva en la máquina ninguna lista aparte de conexiones, umbrales ni permisos. No depende del transporte (Nostr, HTTP u otro).

## 7. Publicar la época en un eje vacío

`node be.mjs epoca --publicar datos/epocas/state/state-0.btml.json` (con la configuración de `be.mjs`: el servidor, el eje vacío y la identidad del operador; `docs/CONTRATO.md` §5 bis y §17). Escribe el génesis y la época en su libro: **36 registros** (el génesis, la raíz y sus 34 registros: 2 reglas y 32 plantillas), firmados, y los sube a 55 por minuto con reintento del 429: cabe en un minuto. El mayor, la raíz, ocupa unos 62 KB (el tope es de 256 KB). Después, las altas del §2 y el camino del §3, como en `ejemplos/state/nodo.mjs`.
