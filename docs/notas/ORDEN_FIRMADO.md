# El orden firmado: el orden de llegada, firmado y encadenado en el recibo

Core AGRAM, 17-11 (decisión técnica de Core State, con las correcciones cerradas con Core AARPIA y Core StateArk). Para Core AARPIA y Core StateArk: el contrato exacto de lo que firma el servidor del libro, de lo que sirve, de la contradicción y del remate. Lo que se comprueba del orden y lo que no, en corto: `docs/CONTRATO.md` §15.4 bis.

## El problema

El orden que vale en un libro es el de llegada a su servidor, y todas las copias se rigen por él. Sin firma, nada impide que el servidor dé un orden a una copia y otro a otra. El sello de StateArk fija el conjunto de cada lote y el orden entre lotes, no el orden dentro del lote.

## Los dos pares

El recibo que el servidor ya firma por cada registro que entra (el 7701 de AARPIA, `stateark.recibo@1`, clase «llegada» sin autoridad y «aceptación» con ella) lleva dos claves más, en este orden, **detrás de las propias de la clase y antes de «universo»**:

| Clave | Valor |
|---|---|
| `orden` | su número en la cadena, en decimal y **como texto**, sin ceros a la izquierda: `'0'`, `'1'`, `'17'` |
| `anterior` | el id (64 hex) del recibo de orden − 1 de la misma cadena. **Falta solo en el `'0'`** |

- **Una cadena por emisor y universo.** En AARPIA el universo de los recibos encadenables es `relé <clave del relé> · eje <nombre>`: una cadena por eje. Con autoridad, quien firma es la autoridad y la puerta real solo da 7701 de «aceptación».
- **Clases encadenables:** «llegada» y «aceptación». **Un rechazo (7703) no entra en la cadena**: no gasta un orden.
- En la simulación (`servidor/sim/aarpia/`): la décupla de un 7701 queda `eje, llegada, orden, [anterior,] universo, [núcleo, época,] no afirma…`; el sujeto, `[id AGRAM, id Nostr]`.
- **El vector manda:** `stateark/sip/vectores/recibos/llegada.json` (SIP 0, «La llegada encadenada»). Su recibo no lleva «eje» ni «llegada» (sus claves propias son `evento`) y su universo es otro: por eso la comprobación de AGRAM **no exige «eje»**; la cadena la dan el emisor y el universo. `test/orden-firmado.test.js` comprueba el vector con `comprobarRecibo` (si la carpeta de StateArk está al lado del repo).
- **El orden servido** (`GET /eventos`, `orden`) sigue empezando en 1. En un eje que nace con la cadena, servido = firmado + 1. Un eje con registros anteriores a la cadena tiene un desfase fijo (sus primeros recibos no traen los pares): no es un aviso.
- La simulación rehace la cadena al arrancar desde el archivo del relé leyendo los 7701 guardados (los que no traen «orden» no cuentan), y da el orden servido y el firmado en el mismo paso (los `POST` de uno en uno).

## `sobre` en `GET /eventos/recibo`

`GET /eventos/recibo?eje&id` devuelve lo de siempre (`instante`, `rele`, `firma`, `recibo`: el reloj X.6.8.1, que no cambia) y además:

```
sobre: { schema: 'stateark.recibo@1', emisor, t, recibo: <décupla>, id, firma }
```

el recibo único entero tal como va en el content del 7701 (solo esos seis campos). `id` = SHA-256 de `canonico({ schema, emisor, t, recibo })`; `firma` = BIP-340 del emisor sobre el id. Sin `sobre`, o sin los dos pares, el cliente dice «sin firmar».

## Qué comprueba el cliente (`src/orden.js`, `src/sincronia.js`)

- **Cada recibo** (`comprobarRecibo(sobre, { registro })`): recibo único bien formado de clase encadenable; el id es el hash de su cuerpo; la firma es del emisor; un «orden» decimal y, solo si no es el `'0'`, un «anterior» de 64 hex; un «universo»; el sujeto (su primer id) es el registro.
- **El eslabón** (`comprobarEslabon(recibo, previo)`): el «anterior» del n es el id del recibo n − 1 que se tiene (si no se tiene, no se puede decir y no se inventa).
- **Contra lo servido:** los recibos van en el mismo orden relativo que lo servido: servido − firmado es el mismo en toda la cadena (y al menos 1). Si no, un aviso propio en `informe.orden.avisos` («el servidor no sirve en el orden que firma»). No es una contradicción: lo servido no lleva firma.

## La contradicción

Clase `CLASE_DE_ORDEN_DOBLE = 'dos recibos con el mismo orden'` (provisional, como la bifurcación de cabeceras; StateArk la añadirá a la SIP con su nombre y sus vectores). Dos recibos **válidos** del **mismo emisor y el mismo universo** son la prueba si:

1. tienen el mismo «orden» y distinto registro;
2. son del mismo registro con dos «orden»;
3. tienen el mismo «orden» y registro y distinto «anterior»;
4. en órdenes seguidos (n y n + 1), el «anterior» del n + 1 no es el id del n.

Dos recibos iguales, o el mismo recibo vuelto a firmar con todo igual menos su `t`, no lo son. La prueba son **los dos recibos enteros**. `ordenDoble(a, b)` (o `ordenDoble({ a, b })`, para una guardada) la comprueba sin libro y la da:

```
{ clase: 'dos recibos con el mismo orden', motivo, emisor, universo, ordenes: [de a, de b], registros: [de a, de b], a, b, id }
id = SHA-256(canonico({ clase, ids: [id menor, id mayor] }))
```

Clase, motivo y lo demás se derivan; no se creen. La sincronía la guarda (`sinc.fraudesDeOrden()`), la anota en `informe.orden.fraudes`, no rompe la sincronización, no cambia el libro (el recibo que contradice no entra en la cadena) y no se borra sola. El estado pasa a `'contradicho'`.

## El remate

**Lo hace la puerta, no el cliente.** Cada lote de nivel 1 lleva como hoja, además de lo suyo, el id del último recibo encadenado de cada eje que creció desde el lote anterior (en la simulación: `sellarPendientes` del servicio). El cliente no pide sellar nada nuevo: tras cada pasada, con adaptador de sello, pide la **prueba** del id del último recibo encadenado que tiene (uno por pasada, como la de cualquier id), la verifica con el mismo adaptador y la guarda: `sinc.ordenSellado()` → `{ orden, recibo, prueba }` o null. Con ese sello el orden de toda la cadena hasta él queda fijado en el tiempo (el id del último compromete al anterior, y así hacia atrás). Un fallo del sello va a `informe.orden.errores` y no rompe nada. Si el cliente pide un id que la puerta no selló (llegó otro detrás antes del lote), no hay prueba y se vuelve a pedir el último en la pasada siguiente.

## Lo que guarda la sincronía

De cada registro encadenado, su recibo entero (es lo que sirve de prueba). Al serializar va compacto: el último recibo entero como plantilla y, de cada uno, solo `t`, el resto del sujeto, los valores que cambian (llegada, orden, anterior), `id` y `firma`; se rehace exacto (se comprueba el id; la firma ya se comprobó al llegar). Medido en `test/orden-firmado.test.js` con la simulación: unos 930 B por registro el recibo entero, unos 550 B guardado (con el id del registro como clave), más una plantilla de unos 940 B. Además: las contradicciones enteras, si el orden está sin firmar, y el sello del orden.

## Los dos límites

- **Quien fija el orden lo sigue eligiendo.** Puede poner delante a quien quiera; lo único que no puede es dar dos órdenes distintos sin firmar dos recibos que se contradicen. Y la contradicción solo la ve quien junta los dos recibos.
- **Un servidor sin clave se queda como hoy.** Supabase y el servidor de prueba no firman: el orden es su palabra, la carta dice «El servidor de este libro no firma el orden de llegada.» y nada más cambia.

Nada de esto entra en las reglas del libro ni cambia ningún id (ni de evento ni de época). `eje.marcarRecibo` y X.6.8.1 quedan como estaban.
