# La R en los canales: lo que cruza a otros

Core AGRAM, 17-11 (encargo «la R en los canales», VG 17-11). Para quien escribe en las conversaciones de un nodo desde fuera de la carta: la pasarela de Telegram de StateArk y cualquier conversador (el proceso que hace hablar a un agente). Todo en la época state (`docs/EPOCA_STATE.md` §8, «La R en una conversación»); la 0 no cambia.

**La regla en una frase.** Un agente solo escribe a quien le ha dado R, y cada mensaje que escribe se la devuelve. Sin esa R, el registro no entra (lo comprueban las reglas, también a lo escrito a mano).

## Dónde va la R en cada plantilla

La R se mueve en los **movimientos del propio registro** (junto a la quema del coste de escribir), no en el payload. El payload solo lleva la cantidad cuando no es la de por defecto:

| Plantilla | Qué mueve | Posición de la cantidad (opcional) |
|---|---|---|
| open a conversation [1, 24] | el precio del grupo al dueño del agente (como antes) y R de quien abre al agente: la suya (una persona; el servicio, la suya) | **6** (sin él, una unidad) |
| open a conversation as an agent [1, 27] | lo mismo, cuando abre otro agente: el precio y R de su dueño, de la que guarda | **6** (sin él, una; con 0, ninguna) |
| message in [3, 13] | R de quien escribe al agente de la conversación: en la casa, de la persona; fuera, **del servicio** | **1.5** (sin él, una unidad) |
| message in from an agent [3, 15] | una unidad de R del dueño del agente devuelta a ese dueño y R del dueño del que escribe al agente | **1.5** (sin él, una; con 0, ninguna) |
| message out [3, 14] | una unidad de R de la persona del otro lado devuelta a su emisor (casa: el interlocutor; fuera: el servicio; agente con agente: el dueño del otro agente) | **1.5**: solo agente con agente, la R del dueño de este agente que pasa al otro (sin él, ninguna) |
| anchor served [3, 12] | una unidad de R del dueño del nodo a quien pidió (no la exige ninguna regla) | **6.4** (sin él, una; con 0, ninguna) |

En los mensajes, si se escribe el 1.5, el 1.3 y el 1.4 que falten van como `-` (los defectos de la plantilla los ponen). La unidad por defecto no cambia el coste en T; escrita, un mensaje pasa a 7 minutos.

## Qué tiene que hacer una pasarela (StateArk, Telegram)

- **Dar R del servicio en cada entrada.** Cada «message in» que escribe en nombre de un interlocutor de fuera lleva una unidad de R **del servicio** al agente (la plantilla lo hace: `acciones.transaccion(eje, 'message in', { X: conversación, channel: 'telegram', text, … }, servicio)`). La primera vez el servicio la emite, y eso quema T real suya en el mismo registro: el servicio necesita T del día (es una persona del libro). Después gira: el agente se la devuelve al contestar.
- **Abrir también la da**: «open a conversation» en nombre del interlocutor lleva una unidad de R del servicio al agente, además del precio de su grupo.
- **El interlocutor de fuera no tiene R ni la recibe**: es una cosa sin clave. Lo que el agente devuelve va al servicio.
- Si un mensaje que entra no lleva R del servicio (o lleva R de otro emisor), no entra.
- Para dar más de una («le doy 10»), el 1.5 del «message in» (el parámetro `give` de la plantilla; en las seis plantillas de la tabla se llama así).

## Qué tiene que hacer un conversador (el que hace hablar al agente)

- **Firmar con la clave del agente** cada «message out» y cada «message in from an agent»: la R que devuelve es la que guarda el agente; nadie mueve R de otro.
- **Devolver**: cada «message out» devuelve una unidad de R de la persona del otro lado (la plantilla la calcula: el interlocutor si es una persona; si es una cosa, quien escribió su alta). Si el agente no la tiene, no puede escribir: es lo esperado (se quedó sin R porque no le contestan). Antes de escribir puede mirar su saldo: `eje.saldo(agente, 'R:' + emisor)`.
- **Agente con agente**: abrir con «open a conversation as an agent» y escribir con «message in from an agent» (los de modo persona no los lanza un agente); pasar R de su dueño al otro (por defecto una al abrir y en cada «message in from an agent»; en «message out», con el 1.5) para que le contesten. El agente necesita R de su dueño, que se la da su dueño («admit someone» de la 0, o hablando con él).
- Si escribe el dueño del agente (una persona) en vez del agente, paga con la R de esa persona que tenga él.

## Límites conocidos

- **No hay tope por conversación.** La R es de una persona o de un servicio, no de un chat: lo que un agente acumula con diez chats de Telegram (todos con R del servicio) lo puede gastar en uno solo. Hacerlo por conversación pediría una regla que cuente dentro de cada conversación (entradas menos salidas); no se ha construido.
- **La R recibida sigue dando P** (VG, sin excepción). Medido: el P del agente sobre quien le da R no crece con las vueltas (diez vueltas en la casa: 10; «le doy 3»: 40); agente con agente, 0 sobre el dueño del otro. Dato para la revisión de seguridad. Ese P ya no baja a las cosas de quien dio la R sin su sí: el apartado siguiente.
- La carta no cambia: «hablas con el agente de tal persona» es un dato que ya está (quien escribió el alta del agente).

## El P de la R solo baja a una cosa de otro con el sí de su dueño (VG 17-11; CH1)

La revisión de los canales (CH1 de `test/revision-canales.test.js`) encontró que con la R de abrir una conversación el agente llevaba su P a una cosa de quien la abrió (su casa de cuatro plazas), se lo pasaba a su dueño y el dueño emitía E atada a esa casa, quitándole plazas a la persona. Decidido por VG: el P que nace de recibir R se queda como está (en la mirada 3 del alta de quien dio la R, donde es voz y no ocupa nada); **solo baja a una cosa de otro con el sí de su dueño**, igual para personas y para agentes. Es de la época 0 (no es suelo).

- **La regla** «P comes down to a thing of another with its owner's yes» (época 0, la última de la cadena del 8). Un registro que deja P en un registro X, sea por un paso de bajar (acuñar en X quemando en su padre, o en una mirada de X quemando en X entero) o por una transferencia de P posicionado en X a otro titular (con salida o sin ella), solo entra si quien queda con ese P es el dueño de X, o quien lo mueve es el dueño de X, o hay un sí vigente del dueño de X, colgado de X, que nombra a quien queda con él. El dueño de una cosa es **quien escribió su registro** (comprobado contra `src/condiciones/tope.js`: la capacidad que se ocupa es la que declara el registro de quien lo escribió, y «minting E needs P on its record» mira el P que quien acuña tiene en ese registro). Subir no pide nada. Tampoco la mirada 3 del alta de una persona: es la raíz donde nace el P de recibir su R (se puede pasar a otro ahí mismo, y sigue sin ocupar nada).
- **Lo ya bajado se queda.** Retirar el sí corta los pasos nuevos; lo que ya está abajo sigue hasta que se libere. Que el dueño pueda echar ese P de vuelta a la raíz queda fuera (VG).
- **Sin excepciones por tipo de identidad**: vale para cualquiera que tenga P sobre otro, persona o cosa con clave, y para lo escrito a mano.
- **Coste acotado**: la regla se para en su primera comprobación si el registro no acuña ni transfiere P; si lo hace, mira solo lo que cuelga de X (`down X`) y el payload firmado de cada sí, nunca recorre el libro.

**El gesto del dueño** (para la carta, que no se ha tocado): la plantilla **let P come down here** [2, 9] de la época 0, que se ofrece al dueño de X (su 2: `first it.3 = me`), en modo persona. Ancla en el **2.1** de X (donde se posiciona el P) y escribe: **1.0** `yes` o `no`, **2** el criterio, **3.0** quien responde (el dueño), **3.1 a quién deja bajar** (una identidad con alta: una persona o una cosa con clave, también un agente), **4** «let P come down here». No mueve nada salvo el coste de escribir. Para retirarlo, otro con `no` para la misma identidad: cuenta el último. `acciones.transaccion(eje, 'let P come down here', { X: cosa, whom: agente, answer: 'yes' }, dueño)`.

**Quién tiene sí sobre una cosa** (con `it` = la cosa; da los registros del sí vigentes; la identidad es el 3.1 de su payload): no hay lectura con nombre en la época; esta expresión, que comprueba la prueba «retirado el sí», es la que la carta puede leer con `evaluar(…, ctx, { sujeto: cosa })`:

```text
(down it) where "let P come down here" in (payload(it2)).4 and first it2.3 = first it.3 and it2 = last ((down it) where "let P come down here" in (payload(it3)).4 and first it3.3 = first it.3 and first (payload(it3)).3.1 = first (payload(it2)).3.1) and "yes" in (payload(it2)).1.0 and not ("no" in (payload(it2)).1.0)
```

Pruebas: los casos CH1 de `test/revision-canales.test.js` (los dos que eran `todo` afirman ahora lo arreglado) y el modelo de `test/propiedades-2.test.js`.
