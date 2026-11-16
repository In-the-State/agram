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
- Para dar más de una («le doy 10»), el 1.5 del «message in».

## Qué tiene que hacer un conversador (el que hace hablar al agente)

- **Firmar con la clave del agente** cada «message out» y cada «message in from an agent»: la R que devuelve es la que guarda el agente; nadie mueve R de otro.
- **Devolver**: cada «message out» devuelve una unidad de R de la persona del otro lado (la plantilla la calcula: el interlocutor si es una persona; si es una cosa, quien escribió su alta). Si el agente no la tiene, no puede escribir: es lo esperado (se quedó sin R porque no le contestan). Antes de escribir puede mirar su saldo: `eje.saldo(agente, 'R:' + emisor)`.
- **Agente con agente**: abrir con «open a conversation as an agent» y escribir con «message in from an agent» (los de modo persona no los lanza un agente); pasar R de su dueño al otro (por defecto una al abrir y en cada «message in from an agent»; en «message out», con el 1.5) para que le contesten. El agente necesita R de su dueño, que se la da su dueño («admit someone» de la 0, o hablando con él).
- Si escribe el dueño del agente (una persona) en vez del agente, paga con la R de esa persona que tenga él.

## Límites conocidos

- **No hay tope por conversación.** La R es de una persona o de un servicio, no de un chat: lo que un agente acumula con diez chats de Telegram (todos con R del servicio) lo puede gastar en uno solo. Hacerlo por conversación pediría una regla que cuente dentro de cada conversación (entradas menos salidas); no se ha construido.
- **La R recibida sigue dando P** (VG, sin excepción). Medido: el P del agente sobre quien le da R no crece con las vueltas (diez vueltas en la casa: 10; «le doy 3»: 40); agente con agente, 0 sobre el dueño del otro. Dato para la revisión de seguridad.
- La carta no cambia: «hablas con el agente de tal persona» es un dato que ya está (quien escribió el alta del agente).
