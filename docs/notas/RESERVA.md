# Reservar en lugar de entregar (época 0)

Core AGRAM, 17-11 (encargo «reservar en lugar de entregar», VG 17-11). La pieza genérica: **consumir de lo bloqueado con salida sin recibirlo**. Un dueño bloquea lo suyo con la salida en una reserva que nombra a quien gasta; quien gasta lo saca de ahí del modo que la reserva dice, sin que pase nunca por sus manos. Tiene **un solo uso** por ahora, el cupo de mensajes de una conversación de la época state (`docs/notas/R_EN_CANALES.md`). Pruebas: `test/reserva.test.js`. Revisión de seguridad: pendiente (Core).

## 1. La reserva: «a reserve» [1, 30]

La escribe el dueño de lo que se va a reservar, **anclada en el uso** (cualquier registro, en su 1). Modo agente (la escriben también los agentes que reservan para otro). Se ofrece a quien tiene algo que no es T. No mueve nada (solo el coste de escribir). Su payload:

| Posición | Qué es |
|---|---|
| 1.0 | **de qué modo puede gastar**, uno o varios de: `return` (lo gastado vuelve disponible a su dueño), `burn` (se quema), `pay` (se transfiere a alguien de la lista del 1.1) |
| 1.1 | **a quién puede pagar** (identidades; con `pay`). `-` si no hay nadie y la reserva dice hasta cuándo |
| 1.2 | **hasta cuándo** (opcional): un instante |
| 2 | el criterio |
| 3.0 | quien reserva (el dueño) |
| 3.1 | **quién gasta** (una identidad) |
| 4 | «a reserve» |

Lo que leen las reglas es **su payload firmado** (`payload(…)`), nunca lo que otros anclen en ella; y su autor, el primer ocupante de su 3.

## 2. Llenarla: «fill a reserve» [1, 31]

El dueño bloquea lo suyo con la salida en el id de la reserva: la mecánica de bloqueo con salida de siempre, sin cambios en el núcleo. Cualquier plantilla puede hacerlo (los mensajes de la state lo hacen), pero hace falta una mínima para llenar una reserva fuera de ellas: **agente con agente no arranca sin ella** (el lado al que escriben ha de reservar para el otro antes de su primer mensaje, y ningún mensaje lo hace por él). Se ofrece sobre una reserva escrita por quien mira; ancla en su 1; payload 1.0 cuánto y 1.1 la serie (por defecto la R propia, que pone en mano lo que falte; con otra serie, bloquea lo que tiene). La T no se bloquea.

## 3. El suelo: la tercera excepción de «nobody moves tokens of others»

Calcada de las dos que ya tenía (la invitación y la vuelta de otro libro). Un movimiento desde otro titular entra si:

- es una **liberación o una transferencia** con la salida en una reserva **escrita por el titular** de lo que se mueve, **que nombra en su 3.1 a quien escribe**, y **no va hacia quien escribe**;
- o es una **quema** desde ese titular de una serie de la que el mismo registro libera, de reservas así, al menos lo que quema.

La quema va así porque en el núcleo **una quema no lleva salida** (`src/libro.js`: «quemar: no lleva salida»): `burn` es liberar y quemar en el mismo registro. **Decisión de este encargo, a revisar**: el encargo decía «una quema con la salida en la reserva», que el núcleo no admite sin cambiar la mecánica de bloqueo.

`src/validez.js` la repite (`gastaUnaReserva`) en su capa 4, donde ya repetía las otras dos: la única transferencia con salida desde otro que no es aceptar una invitación ni recibir la vuelta. Las liberaciones y las quemas desde otro no las mira la capa 4 (nunca las miró: las dice la regla).

**El libro solo deja sacar lo bloqueado con esa salida**: la liberación y la transferencia con salida salen de `bloqueadoCon(titular, serie, salida)` (`src/libro.js`); ni de otra reserva, ni de otro bloqueo, ni de lo disponible (prueba «quien gasta no saca más de lo reservado…»).

La fórmula sale de `datos/epocas/reserva.mjs` (`excepcionDeLaReserva`).

## 4. La guarda: «a reserve is spent as it says» (suelo)

Lo que sale de una reserva por mano de quien gasta sale **del modo que la reserva dice**:

- **liberar**, si dice `return`; o si dice `burn` y el registro quema de esa serie y de ese titular **al menos todo lo que libera de él** (más estricto que lo justo: mezclar en un registro una liberación `return` y una `burn` de la misma serie y el mismo titular pide quemar las dos);
- **transferir**, si dice `pay`, hacia alguien de su 1.1 que **no es quien escribe** ni se llama `-` (revisión de seguridad, hallazgo 2: `-` es el relleno de un hueco, nunca un destinatario; la plantilla, además, no deja `pay` sin lista de a quién pagar); llega bloqueado con la misma salida (el núcleo: lo transferido con salida llega bloqueado con ella, salvo que la salida sea quien lo recibe) y lo suelta quien lo recibe, que es suyo;
- **quemar**, cubierto por lo que libera, a tiempo, de reservas con `burn` que nombran a quien escribe;
- si dice **hasta cuándo**, ni el instante del registro (su `t`, que elige quien escribe) ni el reloj del libro antes de él (`before.6.0`, el mayor instante ya visto, como «at most a year ahead») lo pasan: antedatar no sirve (hallazgo 3);
- **nada va hacia quien gasta**.

Va al final de la cadena del 8 y en **7.9.6 junto con la plantilla que lee**, «a reserve». Motivo: sin la guarda, quien gasta sacaría lo reservado de un modo que la reserva no dice; sin la plantilla en el suelo, un cambio podría redefinir qué es una reserva (su 1.0, su 3.1) y abrir la excepción. La fórmula sale de `datos/epocas/reserva.mjs` (`formulaDeLaGuarda`).

## 5. Retirar

El dueño retira lo no gastado **liberando su propio bloqueo**, cuando quiera (también pasado el «hasta cuándo»): es mover lo suyo, y ninguna regla lo impide con la salida en una reserva (comprobado: ni «support is released by withdrawing it», que solo mira propuestas, ni «what is locked for another book is released only by its return», que solo mira enlaces).

## 6. Lo que se mira (cada cosa con su prueba en `test/reserva.test.js`)

- **La T no se bloquea** («T is not locked», suelo): **no hay reserva de T**. Límite; no se ha tocado.
- **Lo reservado sigue siendo de su dueño**: `saldosDe` lo da como bloqueado y la declaración de saldo («declare a balance», «a declared balance is true») lo cuenta. No se ha cambiado.
- **Reservar P**: el P que sale en modo `pay` hacia otro pasa por «P comes down to a thing of another with its owner's yes» como cualquier otro (sin el sí del dueño del registro para quien lo recibe, no entra).
- «**locked P backing live E is not released**» y «**what is locked for another book is released only by its return**» siguen diciendo lo mismo: un bloqueo con otra salida (la serie de una E, un enlace) no es de ninguna reserva y quien gasta no lo toca; la reserva no es un enlace.
- **Quien gasta no gana P por lo que gasta**: no recibe nada (ni R ni P).
- Un cambio corriente o de gobierno que quita o cambia la excepción o la guarda, o las quita de 7.9.6: rechazado por el suelo.
- Restaurar, rehacer desde los eventos y reordenar dan los mismos veredictos (gastar antes de llenar no entra).

## 7. Coste

Medido el 17-11 sobre el nodo de ejemplo (`docs/notas/R_EN_CANALES.md` para los mensajes): la guarda, en un registro sin reserva, 11 pasos y 22 ocupantes; en uno que gasta de una reserva, 71 pasos y 51 ocupantes (1 a 2 ms); «nobody moves tokens of others» con la tercera excepción, 13 pasos y 26 ocupantes en un registro corriente (no cambia: la excepción solo se mira en un movimiento desde otro) y 48 y 40 en uno que gasta. No recorren el libro: miran los movimientos del propio registro y el payload de la reserva que nombra su salida.
