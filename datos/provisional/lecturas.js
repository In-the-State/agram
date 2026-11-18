// Generado por datos/provisional/generar.mjs desde datos/provisional/lecturas.json.
// No se edita a mano: se cambia el JSON y se ejecuta `node datos/provisional/generar.mjs`.

export const LECTURAS_PROVISIONALES_DATOS = [
  [
    [
      "what is missing"
    ],
    [
      "X.4.8",
      "epoch.4.2",
      "epoch.9.0.0",
      "epoch.9.0.1",
      "epoch.9.0.3",
      "moves",
      "apply"
    ],
    [
      "=(((first it.4).8 each (((moves it2) where \"anunciado\" in it3.2 and count ((down it2) where count ((moves it4) where not \"anunciado\" in it5.2 and it5.0 = it3.0 and it5.3.0 = it3.3.0 and it5.3.1 = it3.3.1 and it5.4 = it3.4 and it5.1 >= it3.1) > 0) = 0) each (row(it3.0, it3.1, \"stage\", row(it3.3.0, it3.3.1), first ((epoch.4.2.0.2 where E in it3.0.0.0) with (epoch.4.2.1.2 where P in it3.0.0.0) with (epoch.4.2.2.2 where R in it3.0.0.0) with (epoch.4.2.3.2 where T in it3.0.0.0)), it2, it3.7.1)) with (it2 where count (moves it3 where \"anunciado\" in it4.2) = 0) each (row(first (before.4.(first it3.0) with first it3.0), last it3.1, \"stage\", row(last it3.3.0, last it3.3.1), first ((epoch.4.2.0.2 where E in (before.4.(first it3.0)).0.0) with (epoch.4.2.1.2 where P in (before.4.(first it3.0)).0.0) with (epoch.4.2.2.2 where R in (before.4.(first it3.0)).0.0) with (epoch.4.2.3.2 where T in (before.4.(first it3.0)).0.0)), it3, (0 where 1 = 0))))) with (((((0 with 1 with 2 with 3 with 4 with 5 with 6 with 7 with 8 with 9) each (epoch.9.0.0.1.(it2))) where first it2.0 = last ((((payload(it)).2 with (payload(it)).2.2) where count it3.0 = 0) where it3 in (((0 with 1 with 2 with 3 with 4 with 5 with 6 with 7 with 8 with 9) each (epoch.9.0.0.1.(it4))) each 0 with ((0 with 1 with 2 with 3 with 4 with 5 with 6 with 7 with 8 with 9) each (epoch.9.0.0.5.(it4))) each 0))) each (row(P.(it), first (((((payload(it)).2 with (payload(it)).2.2) where count it3.0 = 0) where it3.2 = \"above\") each 1 with epoch.9.0.0.2), first it2.0, row(((payload(it)).2.3 with ((first it.3) where count (payload(it)).2.3 = 0))), first epoch.9.0.3.1.2.0, it, (0 where 1 = 0), apply(last it2.1, it)))) where not (it2.7 > it2.1))) where count (((0 with 1 with 2 with 3 with 4 with 5 with 6 with 7 with 8 with 9) each (epoch.9.0.1.1.(it3))) where (first it3.0 = \"closed with error\" or first it3.0 = \"expired\" or first it3.0 = \"closed by decision\") and first apply(last it3.1, it)) = 0"
    ],
    [
      "X.4.9"
    ],
    [
      "read"
    ],
    [
      "*"
    ],
    [
      "Core AGRAM 18-11 (docs/notas/NUCLEO_6_7_8.md §6, decisiones 1 a 3, supuestos por confirmar con VG): lo que el motor deducía en JavaScript (motor.siguiente, acciones.camino), escrito como una lectura de la época que se materializa en X.4.9 (fábrica · cómo y el siguiente paso, al lado de X.4.8, «stage»). Provisional hasta la pasada única por la época 0, que la pondrá en su 2 tal cual",
      "Una fila por cada movimiento que falta, la misma para todos los que miran (no lee me): 0 qué se mueve (la serie; en el recuento, P.(X)), 1 cuánto (lo anunciado; en el recuento, el umbral), 2 por qué (stage, o el nombre del recuento), 3 quién (3.0 quién tiene que actuar, una o varias identidades; en el recuento, las que nombra su lista o el dueño; 3.1 a quién), 4 la acción que lo cumple (de epoch.4.2 por la familia de la serie; para el recuento, epoch.9.0.3.1.2.0), 5 sobre qué registro se lanza (el anuncio, o X), 6 para cuándo (el 7.1 del movimiento anunciado), 7 lo que hay (el valor del recuento)",
      "Lo anunciado: los movimientos anunciados de cada anuncio pendiente ((first X.4).8, la lectura «stage») que ningún registro anclado sobre él ha movido aún, con la misma comparación que «stage»; y el anuncio de antes (un payload que imita un movimiento), su fila. El recuento: el último nombre de recuento (epoch.9.0.0.1) o de lo que no lo es (epoch.9.0.0.5) que el dueño dice en su criterio (su 2 o su 2.2, solo lo de su payload), su umbral («above x» o epoch.9.0.0.2) y su valor (apply de la fórmula de la época); da fila si es un recuento de la época y su valor no pasa del umbral. Un proceso terminado (las plantillas de cerrado «closed with error», «expired» y «closed by decision» de epoch.9.0.1, aplicadas a X) no da filas"
    ],
    [
      "epoch 0"
    ],
    [
      "after stage"
    ],
    [
      "what is missing: one row per movement that X still needs and per tally that does not pass, with who has to act and the action that does it"
    ]
  ]
];
