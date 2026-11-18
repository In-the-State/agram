// Generado por datos/provisional/generar.mjs desde datos/provisional/tipos.json.
// No se edita a mano: se cambia el JSON y se ejecuta `node datos/provisional/generar.mjs`.

export const TIPOS_PROVISIONALES_DATOS = [
  [
    [
      "an id"
    ],
    [
      "text"
    ],
    [
      "=hex(slice(bytes(it), 0, 32)) = it"
    ],
    [
      "me"
    ],
    [
      "payload"
    ],
    [
      "*"
    ],
    [
      "Core AGRAM 18-11 (docs/notas/NUCLEO_6_7_8.md §7): provisional hasta la pasada única por la época 0, que lo pondrá en epoch.9.2.0.3 tal cual; la validación que hoy repiten a mano 27 parámetros"
    ],
    [
      "optional"
    ],
    [
      0
    ],
    [
      "an id: 64 hexadecimal characters in lower case, a datum and not a reference"
    ]
  ],
  [
    [
      "a positive number"
    ],
    [
      "number"
    ],
    [
      "=it > 0"
    ],
    [
      "me"
    ],
    [
      "payload"
    ],
    [
      "*"
    ],
    [
      "Core AGRAM 18-11 (docs/notas/NUCLEO_6_7_8.md §7): provisional hasta la pasada única por la época 0; la validación que hoy repiten a mano 35 parámetros"
    ],
    [
      "optional"
    ],
    [
      0
    ],
    [
      "a number greater than zero"
    ]
  ],
  [
    [
      "a text"
    ],
    [
      "text"
    ],
    [
      "=it != \"\""
    ],
    [
      "me"
    ],
    [
      "payload"
    ],
    [
      "*"
    ],
    [
      "Core AGRAM 18-11 (docs/notas/NUCLEO_6_7_8.md §7): provisional hasta la pasada única por la época 0; la validación que hoy repiten a mano 18 parámetros"
    ],
    [
      "optional"
    ],
    [
      0
    ],
    [
      "a text that is not empty"
    ]
  ],
  [
    [
      "an identity with alta"
    ],
    [
      "identity"
    ],
    [
      "=count it.6 > 0"
    ],
    [
      "me"
    ],
    [
      "payload"
    ],
    [
      "*"
    ],
    [
      "Core AGRAM 18-11 (docs/notas/NUCLEO_6_7_8.md §7): provisional hasta la pasada única por la época 0; la validación que hoy repiten a mano 17 parámetros"
    ],
    [
      "optional"
    ],
    [
      0
    ],
    [
      "an identity of this book, one with its alta"
    ]
  ],
  [
    [
      "another book"
    ],
    [
      "book",
      "id"
    ],
    [
      "=it != first before.5"
    ],
    [
      "me"
    ],
    [
      "payload"
    ],
    [
      "*"
    ],
    [
      "Core AGRAM 18-11 (docs/notas/NUCLEO_6_7_8.md §7): provisional hasta la pasada única por la época 0; un libro mío que no es este (el id de su génesis); las opciones las da el aparato y este tipo solo las filtra"
    ],
    [
      "optional"
    ],
    [
      0
    ],
    [
      "one of my books, other than this one"
    ]
  ],
  [
    [
      "cohort"
    ],
    [
      "text"
    ],
    [
      "=\"siblings\" in it or \"project\" in it or \"genesis\" in it"
    ],
    [
      "me"
    ],
    [
      "payload"
    ],
    [
      "*"
    ],
    [
      "Core AGRAM 18-11 (docs/notas/NUCLEO_6_7_8.md §7): provisional hasta la pasada única por la época 0; las cohortes contra las que se compara un registro, las que lee contrato.cohortes() (antes, la validación del parámetro «cohort» de una acción por su nombre); en la pasada, ese parámetro nombra este tipo"
    ],
    [
      "optional"
    ],
    [
      0
    ],
    [
      "the cohort X is compared with: siblings, project, genesis"
    ]
  ],
  [
    [
      "a record"
    ],
    [
      "ref"
    ],
    [
      "=count it.5 > 0"
    ],
    [
      "me"
    ],
    [
      "payload"
    ],
    [
      "*"
    ],
    [
      "Core AGRAM 18-11 (docs/notas/NUCLEO_6_7_8.md, tercera tanda, punto 8): provisional hasta la pasada única por la época 0; lo piden los parámetros de los gestos de la lente (datos/provisional/gestos.json)"
    ],
    [
      "optional"
    ],
    [
      0
    ],
    [
      "a record of this book"
    ]
  ],
  [
    [
      "a view"
    ],
    [
      "number"
    ],
    [
      "=it >= 0 and it <= 9 and floor it = it"
    ],
    [
      "me"
    ],
    [
      "payload"
    ],
    [
      "*"
    ],
    [
      "Core AGRAM 18-11 (docs/notas/NUCLEO_6_7_8.md, tercera tanda, punto 8): provisional hasta la pasada única por la época 0; lo piden los parámetros de los gestos de la lente (datos/provisional/gestos.json)"
    ],
    [
      "optional"
    ],
    [
      0
    ],
    [
      "a point of view: a digit, 0 to 9"
    ]
  ],
  [
    [
      "a lens level"
    ],
    [
      "number"
    ],
    [
      "=it >= 0 and floor it = it"
    ],
    [
      "me"
    ],
    [
      "payload"
    ],
    [
      "*"
    ],
    [
      "Core AGRAM 18-11 (docs/notas/NUCLEO_6_7_8.md, tercera tanda, punto 8): provisional hasta la pasada única por la época 0; lo piden los parámetros de los gestos de la lente (datos/provisional/gestos.json)"
    ],
    [
      "optional"
    ],
    [
      0
    ],
    [
      "a level of the lens: a whole number, 0 or more"
    ]
  ],
  [
    [
      "an action"
    ],
    [
      "text"
    ],
    [
      "=it in (epoch.9.6.1 each 0)"
    ],
    [
      "me"
    ],
    [
      "payload"
    ],
    [
      "*"
    ],
    [
      "Core AGRAM 18-11 (docs/notas/NUCLEO_6_7_8.md, tercera tanda, punto 8): provisional hasta la pasada única por la época 0; lo piden los parámetros de los gestos de la lente (datos/provisional/gestos.json)"
    ],
    [
      "optional"
    ],
    [
      0
    ],
    [
      "the name of an action of the epoch of this book"
    ]
  ]
];
