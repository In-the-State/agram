# Vectores de fuera

- `emparejamiento.json`: de Core StateArk, `stateark/sip`, rama `beta-emparejar` (commit `0c75e1c`), `vectores/emparejamiento/emparejamiento.json`, copiado byte a byte con `git show` el 17-11-2026. SHA-256 `2a349799e76334369f6ef59d8314a0e37f50faf1d852019ab24769f8c4bda49d`. Claves de PRUEBA. Lo usa `test/emparejamiento.test.js`.
- `nip44-v2.json`: los vectores oficiales de NIP-44 v2 (de `github.com/paulmillr/nip44`), en la copia de Core StateArk: `stateark/sim`, rama `beta-emparejar` (commit `fe4b288`), `test/vectores/nip44-v2.json`, copiado byte a byte con `git show` el 17-11-2026. SHA-256 `269ed0f69e4c192512cc779e78c555090cebc7c785b609e338a62afc3ce25040`. Lo usa `test/emparejamiento.test.js`.

# Vectores de aquí, para fuera

- `tanda-de-tres.json`: de AGRAM para la puerta (Core AARPIA), agram-equipo/CONTRATO_TANDA.md. Un libro (génesis y emisión de vg), una tanda válida de tres (vg invita a ana, ana acepta, ana escribe) con su resultado esperado de `eje.anadirTanda`, y una inválida de tres cuyo segundo miembro no pasa una regla, con su `{ indice, id, motivos }`. Claves de PRUEBA, generadas por `test/tanda.test.js`, que lo comprueba (con `TANDA_VECTOR=escribir`, lo regenera: cambian claves, ids y firmas, no la forma ni el resultado).
