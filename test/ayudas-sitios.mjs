// La foto de los sitios y los pesos de la pantalla (18-11, sobre 1dea43b): los valores que hoy decide la carta, escritos a
// mano antes de mover nada a dato (docs/notas/SITIOS_Y_PESOS.md §4). No cambia al mover: el lector (contrato.sitios,
// contrato.pesos) tiene que darlos tal cual sin libro, y la carta, leerlos de él. Solo cambia por una decisión.
// geometria: lo que era GEOMETRIA; hilo: zonaDelHilo y esPvDelPasado; camino: PV_CAMINO; botones: BOTONES_POR_NIVEL;
// rosetones: ORDEN_ROSETONES; alEmpezar.tamano: el NIVEL (2, tarjeta) con que se abre.

export const FOTO = Object.freeze({
  geometria: {
    0: { grupo: 'nucleo', lado: 0, cara: 'anverso', celda: [1, 1], borde: [0, 1] },
    5: { grupo: 'nucleo', lado: 0, cara: 'reverso', celda: [1, 1], borde: [2, 1] },
    1: { grupo: 'x', lado: 1, fila: 'arriba', celda: [0, 0] },
    2: { grupo: 'x', lado: 2, fila: 'arriba', celda: [0, 2] },
    3: { grupo: 'x', lado: 1, fila: 'abajo', celda: [2, 0] },
    4: { grupo: 'x', lado: 2, fila: 'abajo', celda: [2, 2] },
    6: { grupo: 'cruz', lado: 1, fila: 'medio', celda: [1, 0] },
    7: { grupo: 'cruz', lado: 2, fila: 'medio', celda: [1, 2] },
    8: { grupo: 'cruz', lado: 0, fila: 'arriba', celda: [0, 1] },
    9: { grupo: 'cruz', lado: 0, fila: 'abajo', celda: [2, 1] },
  },
  centros: [0, 5],
  laterales: [1, 2, 3, 4, 6, 7, 8, 9],
  hilo: { pasado: 6, futuro: 7 },
  camino: 9,
  botones: { comprimido: 0, tarjeta: 1, bloque: 3, abierto: 'todas', filas: 12 },
  rosetones: [1, 2, 0, 3, 4, 6, 7, 5, 8, 9],
  ordenDeSequenced: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  buscarDestacado: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  proponenALaVista: 3,
  ejecucionesEnCelda: 3,
  ejecucionesEnCeldaAbierta: 10,
  seriesEnElPie: 4,
  alEmpezar: { pv: 9, tamano: 2 },
});
