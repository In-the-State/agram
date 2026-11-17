# La R en los canales: lo que cruza a otros

Core AGRAM, 17-11 (encargos «la R en los canales» y «reservar en lugar de entregar», VG 17-11). Para quien escribe en las conversaciones de un nodo desde fuera de la carta: la pasarela de Telegram de StateArk y cualquier conversador (el proceso que hace hablar a un agente). Todo en la época state (`docs/EPOCA_STATE.md` §8, «La R en una conversación»), sobre la pieza «reservar en lugar de entregar» de la época 0 (`docs/notas/RESERVA.md`).

**La regla en una frase.** Abrir una conversación entrega R al agente (eso le da P, como siempre); **los mensajes ya no la entregan: la reservan en la conversación**, y el agente solo escribe gastando de lo que el otro lado le reservó **en esa misma conversación**. Sin cupo ahí, el registro no entra (lo comprueban las reglas, también a lo escrito a mano).

## Qué cambia para quien llama desde fuera

- **Antes de meter el primer mensaje en una conversación, una reserva.** Quien reserva (la persona en la casa, el servicio por Telegram, el agente que abre una conversación con otro) escribe una vez su reserva en esa conversación para el agente: `acciones.transaccion(eje, 'a reserve', { X: conversación, spender: agente, modes: 'return' }, quien)`. Después, cada «message in» bloquea su R con la salida en ella. No hay que acordarse: **`registrosParaUnMensaje(eje, conversación, quien, { text, … })`** de `datos/epocas/state/ayuda.mjs` dice qué registros escribir, en orden (la reserva si falta, y el mensaje), cada uno para `acciones.transaccion(eje, r.plantilla, r.params, quien)`.
- **Las plantillas de mensaje conservan nombre y parámetros** («message in», «message in from an agent», «message out»; `give` en su 1.5). Lo que cambia es lo que mueven.
- **El cupo del agente se lee con `cupo(eje, conversación, agente)`** (misma ayuda), o con la lectura **conversation quota** de la época state (`it` = la conversación: el de su agente). Sustituye a mirar `eje.saldo(agente, 'R:' + emisor)`, que ya no dice cuánto puede escribir.
- **Lo no gastado es de quien lo reservó**: sigue en su saldo (bloqueado); lo retira liberando su propio bloqueo cuando quiera, y archivar la conversación lo retira en el mismo registro si archiva quien reservó.

## Dónde va la R en cada plantilla

La R se mueve en los **movimientos del propio registro** (junto a la quema del coste de escribir), no en el payload. El payload solo lleva la cantidad cuando no es la de por defecto:

| Plantilla | Qué mueve | Posición de la cantidad (opcional) |
|---|---|---|
| open a conversation [1, 24] | el precio del grupo al dueño del agente y R de quien abre **al agente** (se entrega, como antes): la suya (una persona; el servicio, la suya) | **6** (sin él, una unidad) |
| open a conversation as an agent [1, 27] | lo mismo, cuando abre otro agente: el precio y R de su dueño, de la que guarda, entregada | **6** (sin él, una; con 0, ninguna) |
| a reserve (época 0) | nada (el coste de escribir): la reserva de quien escribe en la conversación para el agente, en «return» | — |
| fill a reserve (época 0) | bloquea R de quien escribe con la salida en su reserva (la propia la pone en mano) | su 1.0 |
| message in [3, 13] | **bloquea** R de quien escribe con la salida en su reserva de esta conversación para el agente: en la casa, de la persona; fuera, **del servicio** | **1.5** (sin él, una unidad) |
| message in from an agent [3, 15] | **gasta** una unidad de R del dueño de este agente de una reserva de la conversación que lo nombra (vuelve a quien la reservó) y **bloquea** R de su dueño en su reserva para el agente | **1.5** (sin él, una; con 0, ninguna) |
| message out [3, 14] | **gasta** una unidad de R de la persona del otro lado de una reserva de esta conversación que nombra a quien escribe (casa: la del interlocutor; fuera: la del servicio; agente con agente: la del dueño del otro agente, que reservó el otro agente) | **1.5**: solo agente con agente, la R del dueño de este agente que **bloquea** en su reserva para el otro (sin él, ninguna) |
| archive a conversation [4, 24] | si archiva quien reservó, libera lo que le quede bloqueado en su primera reserva de la conversación | — |
| anchor served [3, 12] | una unidad de R del dueño del nodo a quien pidió (sin cambios) | **6.4** (sin él, una; con 0, ninguna) |

«Gastar» es liberar el bloqueo de otro (modo «return» de la reserva: vuelve disponible a quien la llenó), y solo lo deja la tercera excepción de «nobody moves tokens of others» de la 0: la salida es una reserva escrita por quien tiene lo bloqueado que nombra a quien escribe. En los mensajes, si se escribe el 1.5, el 1.3 y el 1.4 que falten van como `-` (los defectos los ponen). La unidad por defecto no cambia el coste en T; escrita, un mensaje pasa a 7 minutos.

## Qué tiene que hacer una pasarela (StateArk, Telegram)

- **Una reserva por conversación, y reservar en cada entrada.** La primera vez que mete un mensaje en una conversación, el servicio escribe su reserva para el agente («a reserve», `registrosParaUnMensaje` lo dice); cada «message in» que escribe en nombre de un interlocutor de fuera bloquea una unidad de R **del servicio** en ella (`acciones.transaccion(eje, 'message in', { X: conversación, channel: 'telegram', text, … }, servicio)`). La primera vez el servicio la emite, y eso quema T real suya en el mismo registro. Después gira: el agente la gasta al contestar y vuelve al servicio.
- **Abrir entrega**: «open a conversation» en nombre del interlocutor lleva una unidad de R del servicio al agente, además del precio de su grupo (como antes; no da cupo).
- **El interlocutor de fuera no tiene R ni la recibe**: es una cosa sin clave.
- Lo que reserva en una conversación solo lo gasta el agente en esa conversación: la charla de un chat no paga mensajes a otro.
- Para dar más de una («le doy 10»), el 1.5 del «message in» (`give`).

## Qué tiene que hacer un conversador (el que hace hablar al agente)

- **Firmar con la clave del agente** cada «message out» y cada «message in from an agent».
- **Mirar el cupo antes de escribir**: `cupo(eje, conversación)`. Cada «message out» gasta **exactamente una unidad**, y solo de una reserva **del otro lado** de la conversación (la del interlocutor o la de quien escribió su alta: el servicio, el dueño del otro agente; revisión de seguridad, hallazgos 5 a 7): una reserva de un tercero que nombre al agente no da cupo y la plantilla no la elige. Sin cupo, no escribe: es lo esperado (no le han escrito o ya contestó a todo).
- **Agente con agente**: abrir con «open a conversation as an agent» (entrega R de su dueño y paga el precio) y escribir con «message in from an agent». Cada lado reserva para el otro en la conversación lo que antes le pasaba: el que escribe gasta una unidad que el otro lado le reservó y bloquea R de su dueño en su propia reserva para el otro (la primera vez, con la reserva delante: `registrosParaUnMensaje(…, { esAgente: true, … })`); el agente que contesta con `give` bloquea R de su dueño en su reserva para el otro. **El primer mensaje del otro agente necesita que este lado le reserve antes**: el dueño del agente (o el agente) escribe su reserva para él y la llena con «fill a reserve». Ningún mensaje lo hace por él.
- **El dueño del agente** puede escribir un «message out» en vez del agente, pero gastando de una reserva de la conversación **que lo nombre a él** (lo reservado para el agente es del agente).

## Límites conocidos

- **El tope por conversación está cerrado**: lo reservado en diez conversaciones no se gasta en una (prueba en `test/revision-canales.test.js`).
- **«Le doy N» no da más P.** Lo que se reserva no se recibe: el P del agente sobre quien abrió es el de la R de abrir (10 por unidad; «le doy 1000» al abrir sí son diez mil). Diez vueltas y «le doy 3» lo dejan en 10.
- **La R de abrir sigue en el agente** y no paga mensajes: es la voz que le da P, no cupo.
- La carta no cambia: «hablas con el agente de tal persona» es un dato que ya está (quien escribió el alta del agente). La carta tampoco escribe todavía la reserva antes del primer «message in»: si una persona escribe desde la carta sin reserva, el mensaje no entra (falta la salida del bloqueo). Lo resuelve quien llame a `registrosParaUnMensaje`, o la carta cuando se ponga al día.

## El P de la R solo baja a una cosa de otro con el sí de su dueño (VG 17-11; CH1)

La revisión de los canales (CH1 de `test/revision-canales.test.js`) encontró que con la R de abrir una conversación el agente llevaba su P a una cosa de quien la abrió (su casa de cuatro plazas), se lo pasaba a su dueño y el dueño emitía E atada a esa casa, quitándole plazas a la persona. Decidido por VG: el P que nace de recibir R se queda como está (en la mirada 3 del alta de quien dio la R, donde es voz y no ocupa nada); **solo baja a una cosa de otro con el sí de su dueño**, igual para personas y para agentes. Es de la época 0 (no es suelo).

- **La regla** «P comes down to a thing of another with its owner's yes» (época 0, la última de la cadena del 8). Un registro que deja P en un registro X, sea por un paso de bajar (acuñar en X quemando en su padre, o en una mirada de X quemando en X entero) o por una transferencia de P posicionado en X a otro titular (con salida o sin ella), solo entra si quien queda con ese P es el dueño de X, o quien lo mueve es el dueño de X, o hay un sí vigente del dueño de X, colgado de X, que nombra a quien queda con él. El dueño de una cosa es **quien escribió su registro** (comprobado contra `src/condiciones/tope.js`: la capacidad que se ocupa es la que declara el registro de quien lo escribió, y «minting E needs P on its record» mira el P que quien acuña tiene en ese registro). Subir no pide nada. Tampoco la mirada 3 del alta de una persona: es la raíz donde nace el P de recibir su R (se puede pasar a otro ahí mismo, y sigue sin ocupar nada).
- **Lo ya bajado se queda.** Retirar el sí corta los pasos nuevos; lo que ya está abajo sigue hasta que se libere. Que el dueño pueda echar ese P de vuelta a la raíz queda fuera (VG).
- **Sin excepciones por tipo de identidad**: vale para cualquiera que tenga P sobre otro, persona o cosa con clave, y para lo escrito a mano.
- **Coste acotado**: la regla se para en su primera comprobación si el registro no acuña ni transfiere P; si lo hace, recorre una vez lo que cuelga de X (`down X`) y de cada registro mira primero su ancla (colgado en el 2.1 de X) y su autor (el dueño), y solo de los que pasan lee el payload firmado (revisión de seguridad, hallazgo 4: un registro ajeno con un 4 enorme no se llega a leer). Nunca recorre el libro. Medido (17-11, eje de demostración): un registro sin P, de 5 a 9 pasos y de 8 a 15 ocupantes; bajar P con un sí del dueño, 95 ocupantes; con 2 registros ajenos colgados de la casa con 900 textos en su 4, 126; con 20, 495. Lo que crece es el número de registros colgados de X (unos 20 ocupantes cada uno, sin importar su tamaño): el tope de 10 000 ocupantes llegaría hacia los 500 registros colgados de la cosa, y escribir cada uno le cuesta T a quien lo escribe.

**El gesto del dueño** (para la carta, que no se ha tocado): la plantilla **let P come down here** [2, 9] de la época 0, que se ofrece al dueño de X (su 2: `first it.3 = me`), en modo persona. Ancla en el **2.1** de X (donde se posiciona el P) y escribe: **1.0** `yes` o `no`, **2** el criterio, **3.0** quien responde (el dueño), **3.1 a quién deja bajar** (una identidad con alta: una persona o una cosa con clave, también un agente), **4** «let P come down here». No mueve nada salvo el coste de escribir. Para retirarlo, otro con `no` para la misma identidad: cuenta el último. `acciones.transaccion(eje, 'let P come down here', { X: cosa, whom: agente, answer: 'yes' }, dueño)`.

**Quién tiene sí sobre una cosa** (con `it` = la cosa; da los registros del sí vigentes; la identidad es el 3.1 de su payload): no hay lectura con nombre en la época; esta expresión, que comprueba la prueba «retirado el sí», es la que la carta puede leer con `evaluar(…, ctx, { sujeto: cosa })`:

```text
(down it) where nth 1 it2.6.5 = "2100000000" and first it2.3 = first it.3 and "let P come down here" in (payload(it2)).4 and it2 = last ((down it) where nth 1 it3.6.5 = "2100000000" and first it3.3 = first it.3 and "let P come down here" in (payload(it3)).4 and first (payload(it3)).3.1 = first (payload(it2)).3.1) and "yes" in (payload(it2)).1.0 and not ("no" in (payload(it2)).1.0)
```

Pruebas: los casos CH1 de `test/revision-canales.test.js` (los dos que eran `todo` afirman ahora lo arreglado) y el modelo de `test/propiedades-2.test.js`.
