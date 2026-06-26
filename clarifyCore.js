// clarifyCore.js
// CasaLista V1
//
// Detectar únicamente lo que cambia una decisión automática.
// Conservar intacto todo lo demás.
//
// Interfaz mantenida:
// actualizarEstado(mensaje, estadoActual)
// decidirSiguienteAccion(estado)

const RESPUESTAS = {
  APERTURA: [
  
    "Hola, somos CasaLista.\n\nAyudamos a personas que están buscando comprar una propiedad.\n\nNo hace falta que tengas toda tu búsqueda definida desde el principio. La idea es ir conociendo mejor lo que estás buscando para poder acompañarte durante ese proceso.\n\nCuanto mejor conozcamos tu búsqueda, más posibilidades tendremos de identificar oportunidades compatibles con vos.\n\n¿Qué tipo de propiedad estás buscando?"
  PREGUNTAR_CONTINUIDAD: [
    "Perfecto.\n\nSi apareciera una opción que tenga sentido para vos, ¿estarías pensando en avanzar o por ahora estás explorando posibilidades?"
  ],

  PREGUNTAR_REFERENCIA_ECONOMICA: [
    "Perfecto.\n\nPara tener una referencia razonable, ¿en qué rango de presupuesto te sentirías cómodo trabajando?"
  ],

  ORIENTABLE: [
    "Perfecto.\n\nYa tenemos una base para empezar.\n\nSi en algún momento querés sumar un dato o cambia algo, podés escribirnos cuando quieras."
  ],

  MENSAJE_REGISTRABLE: [
    "Perfecto, quedó registrado.\n\nCualquier cambio o dato nuevo que quieras sumar, podés escribirnos cuando quieras.",
    "Bien, lo dejamos anotado.\n\nSi más adelante querés agregar o modificar algo, podés hacerlo por acá.",
    "Entendido, quedó registrado.\n\nSeguimos teniendo en cuenta la información que vayas sumando.",
    "Gracias, lo registramos para considerarlo dentro de la búsqueda."
  ],

  CONSULTA_ESTADO: [
    "Tu búsqueda sigue registrada.\n\nPara no hacerte perder tiempo, sólo nos comunicamos cuando aparece algún indicio compatible con lo que estás buscando.",
    "Seguimos teniendo en cuenta tu búsqueda.\n\nNi bien aparezca una oportunidad compatible, nos vamos a comunicar.",
    "Por el momento no tenemos novedades concretas para compartir.\n\nSi aparece algo que tenga sentido para vos, te vamos a escribir."
  ],

  CORTESIA: [
    "De nada.\n\nCuando quieras sumar información o consultar novedades, podés escribirnos.",
    "Gracias a vos.\n\nSeguimos teniendo en cuenta tu búsqueda."
  ],

  MALESTAR: [
    "Gracias por comentarlo.\n\nEste mensaje será revisado por un operador para darle seguimiento.",
    "Lamento que lo sientas así.\n\nUn operador va a revisar este mensaje para darle mejor seguimiento."
  ],

  REQUIERE_OPERADOR: [
    "Gracias, quedó registrado.\n\nPara responderte correctamente, este mensaje requiere revisión de un operador.",
    "Tu consulta quedó registrada.\n\nUn operador la va a revisar para darte una respuesta adecuada.",
    "Gracias por escribirnos.\n\nEste tema requiere revisión manual de nuestro equipo."
  ]
};

function elegir(categoria, estado) {
  const lista = RESPUESTAS[categoria] || RESPUESTAS.REQUIERE_OPERADOR;
  const historial = Array.isArray(estado?.historial) ? estado.historial : [];
  return lista[historial.length % lista.length];
}

function crearEstadoInicial() {
  return {
    orientable: false,
    intencion: null,
    referenciaEconomica: null,
    etapa: "apertura",
    ultimaAccionEstado: "APERTURA",
    requiereOperador: false,
    historial: []
  };
}

function asegurarEstado(estadoActual) {
  if (!estadoActual) return crearEstadoInicial();

  const etapaAnterior = estadoActual.etapa === "intencion"
    ? "continuidad"
    : estadoActual.etapa ?? "apertura";

  const accionAnterior = estadoActual.ultimaAccionEstado === "PREGUNTAR_INTENCION"
    ? "PREGUNTAR_CONTINUIDAD"
    : estadoActual.ultimaAccionEstado ?? "APERTURA";

  return {
    orientable: Boolean(estadoActual.orientable),
    intencion: estadoActual.intencion ?? null,
    referenciaEconomica:
      estadoActual.referenciaEconomica ??
      estadoActual.presupuesto ??
      null,
    etapa: etapaAnterior,
    ultimaAccionEstado: accionAnterior,
    requiereOperador: Boolean(estadoActual.requiereOperador),
    historial: Array.isArray(estadoActual.historial)
      ? estadoActual.historial
      : []
  };
}

function normalizar(texto) {
  return String(texto || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function guardarHistorial(estado, mensajeOriginal, categoria) {
  const evento = {
    fecha: new Date().toISOString(),
    mensajeOriginal: String(mensajeOriginal || "").trim(),
    categoria
  };

  return {
    ...estado,
    historial: [...estado.historial, evento].slice(-200),
    ultimaAccionEstado: categoria
  };
}

function esEntradaGenerica(texto) {
  const t = normalizar(texto).replace(/[¿?¡!.,;:]/g, "").trim();

  if (!t) return true;

  return (
    /^(hola|ola|halo|buenas|buen dia|buenas tardes|buenas noches|info|informacion|consulta|contame)$/.test(t) ||

    t.length <= 3 ||

    /(vi un anuncio|vengo del anuncio|quiero saber mas|quiero info|pasame info|de que se trata|como funciona|cómo funciona|me pasaron este numero|me paso este numero|me pasaron el numero|mi amiga me paso este numero|mi amigo me paso este numero|ustedes consiguen propiedades|ustedes buscan propiedades|consiguen propiedades|buscan propiedades)/.test(t)
  );
}

function esCortesia(texto) {
  const t = normalizar(texto).replace(/[¿?¡!.,;:]/g, "").trim();

  return /^(gracias|muchas gracias|ok|okay|dale|perfecto|buenisimo|buenísimo|genial|barbaro|bárbaro|listo|joya)$/.test(t);
}

function esMalestar(texto) {
  const t = normalizar(texto);

  return /(no me siento acompanado|no me siento acompañado|contestan cualquier cosa|no entendieron|no me entendieron|esto no sirve|me estan haciendo perder tiempo|me están haciendo perder tiempo|no sirve|cualquier cosa ustedes|responden cualquier cosa)/.test(t);
}

function esConsultaEstado(texto) {
  const t = normalizar(texto);

  return /(como va|cómo va|como viene|hay novedades|alguna novedad|novedad|novedades|aparecio algo|apareció algo|aparecio|apareció|hay algo|tienen algo|algo para mi|en que quedo|en qué quedó|sigue registrada|sigue activa|estado de la busqueda|estado de la búsqueda)/.test(t);
}

function requiereOperador(texto) {
  const t = normalizar(texto);

  return /(escritura|legal|abogado|comision|comisión|comisiones|financiacion bancaria|financiación bancaria|banco|hipoteca|quiero vender|vender una propiedad|tasacion|tasación|boleto|contrato|seña|sena|reserva|papeles|documentacion|documentación|impuesto|impuestos)/.test(t);
}

function detectaReferenciaEconomica(texto) {
  const t = normalizar(texto);

  if (
    /(credito aprobado|crédito aprobado|prestamo aprobado|préstamo aprobado|preaprobado|pre aprobado|tengo un credito|tengo un crédito|cuento con financiacion|cuento con financiación)/.test(t)
  ) {
    return true;
  }

  if (
    /(vendo|vender|vendiendo).*(me quedan|me queda|tendria|tendría|voy a tener|quedarian|quedarían)/.test(t)
  ) {
    return true;
  }

  if (
    /(no lo tengo definido|no tengo definido|no se exactamente|no sé exactamente|estoy viendo opciones|estoy evaluando|depende de lo que aparezca|depende si vendo primero|si vendo primero)/.test(t)
  ) {
    return true;
  }

  const referenciaEnPalabras =
    /\b(cien|doscientos|trescientos|cuatrocientos|quinientos|seiscientos|setecientos|ochocientos|novecientos)\s+mil\b/.test(t) ||
    /\b(un|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\s+millones?\b/.test(t);

  if (referenciaEnPalabras) {
    return true;
  }

  const tieneNumero = /\d/.test(t);

  const hablaDeDinero =
    /(usd|u\$s|us\$|dolar|dólar|dolares|dólares|verdes|lucas|k|millones|millon|millón|pesos|peso|capital|presupuesto|inversion|inversión|tengo|dispongo|cuento con|hasta|me puedo estirar)/.test(t) ||
    /\b\d+\s*mil\b/.test(t);

  const numeroGrande = /\b\d{5,}\b/.test(t.replace(/[.\s]/g, ""));

  return (tieneNumero && hablaDeDinero) || numeroGrande;
}
function actualizarEstado(mensaje, estadoActual) {
  let estado = asegurarEstado(estadoActual);
  const texto = String(mensaje || "").trim();

  const esPrimerContacto =
    !Array.isArray(estadoActual?.historial) ||
    estadoActual.historial.length === 0;

  if (esPrimerContacto) {
    estado = guardarHistorial(estado, texto, "APERTURA");
    estado.etapa = "apertura";
    return estado;
  }

  // Después de orientable: guardar todo y responder seguro.
  if (estado.orientable) {
    if (esMalestar(texto)) {
      estado.requiereOperador = true;
      estado = guardarHistorial(estado, texto, "MALESTAR");
      estado.etapa = "orientable";
      return estado;
    }

    if (requiereOperador(texto)) {
      estado.requiereOperador = true;
      estado = guardarHistorial(estado, texto, "REQUIERE_OPERADOR");
      estado.etapa = "orientable";
      return estado;
    }

    if (esConsultaEstado(texto)) {
      estado = guardarHistorial(estado, texto, "CONSULTA_ESTADO");
      estado.etapa = "orientable";
      return estado;
    }

    if (esCortesia(texto)) {
      estado = guardarHistorial(estado, texto, "CORTESIA");
      estado.etapa = "orientable";
      return estado;
    }

    estado = guardarHistorial(estado, texto, "MENSAJE_REGISTRABLE");
    estado.etapa = "orientable";
    return estado;
  }

  // Antes de orientable: preguntar lo mínimo.

  // 1. APERTURA / DESCRIPCION LIBRE
  if (estado.etapa === "apertura") {
    if (esEntradaGenerica(texto)) {
      estado = guardarHistorial(estado, texto, "APERTURA");
      estado.etapa = "apertura";
      return estado;
    }

    estado = guardarHistorial(estado, texto, "PREGUNTAR_CONTINUIDAD");
    estado.etapa = "continuidad";
    return estado;
  }

  // 2. CONTINUIDAD
  if (estado.etapa === "continuidad" || !estado.intencion) {
    if (esMalestar(texto)) {
      estado.requiereOperador = true;
      estado = guardarHistorial(estado, texto, "MALESTAR");
      estado.etapa = "continuidad";
      return estado;
    }

    if (requiereOperador(texto)) {
      estado.requiereOperador = true;
      estado = guardarHistorial(estado, texto, "REQUIERE_OPERADOR");
      estado.etapa = "continuidad";
      return estado;
    }

    if (esConsultaEstado(texto)) {
      estado = guardarHistorial(estado, texto, "CONSULTA_ESTADO");
      estado.etapa = "continuidad";
      return estado;
    }

    estado.intencion = texto;
    estado = guardarHistorial(estado, texto, "PREGUNTAR_REFERENCIA_ECONOMICA");
    estado.etapa = "referenciaEconomica";
    return estado;
  }

  // 3. REFERENCIA ECONOMICA
  if (!estado.referenciaEconomica) {
    if (esMalestar(texto)) {
      estado.requiereOperador = true;
      estado = guardarHistorial(estado, texto, "MALESTAR");
      estado.etapa = "referenciaEconomica";
      return estado;
    }

    if (requiereOperador(texto)) {
      estado.requiereOperador = true;
      estado = guardarHistorial(estado, texto, "REQUIERE_OPERADOR");
      estado.etapa = "referenciaEconomica";
      return estado;
    }

    if (esConsultaEstado(texto)) {
      estado = guardarHistorial(estado, texto, "CONSULTA_ESTADO");
      estado.etapa = "referenciaEconomica";
      return estado;
    }

    if (esCortesia(texto)) {
      estado = guardarHistorial(estado, texto, "CORTESIA");
      estado.etapa = "referenciaEconomica";
      return estado;
    }

    if (detectaReferenciaEconomica(texto)) {
      estado.referenciaEconomica = texto;
      estado.orientable = true;
      estado = guardarHistorial(estado, texto, "ORIENTABLE");
      estado.etapa = "orientable";
      return estado;
    }

    estado = guardarHistorial(estado, texto, "PREGUNTAR_REFERENCIA_ECONOMICA");
    estado.etapa = "referenciaEconomica";
    return estado;
  }

  estado.orientable = true;
  estado = guardarHistorial(estado, texto, "MENSAJE_REGISTRABLE");
  estado.etapa = "orientable";
  return estado;
}
function decidirSiguienteAccion(estado) {
  const categoria = estado?.ultimaAccionEstado || "APERTURA";

  if (categoria === "APERTURA") {
    return {
      respuesta: elegir("APERTURA", estado),
      accion: "APERTURA",
      derivar: false
    };
  }

  if (categoria === "PREGUNTAR_CONTINUIDAD" || categoria === "PREGUNTAR_INTENCION") {
    return {
      respuesta: elegir("PREGUNTAR_CONTINUIDAD", estado),
      accion: "PREGUNTAR_CONTINUIDAD",
      derivar: false
    };
  }

  if (categoria === "PREGUNTAR_REFERENCIA_ECONOMICA") {
    return {
      respuesta: elegir("PREGUNTAR_REFERENCIA_ECONOMICA", estado),
      accion: "PREGUNTAR_REFERENCIA_ECONOMICA",
      derivar: false
    };
  }

  if (categoria === "ORIENTABLE") {
    return {
      respuesta: elegir("ORIENTABLE", estado),
      accion: "ORIENTABLE",
      derivar: false
    };
  }

  if (categoria === "CONSULTA_ESTADO") {
    return {
      respuesta: elegir("CONSULTA_ESTADO", estado),
      accion: "CONSULTA_ESTADO",
      derivar: false
    };
  }

  if (categoria === "CORTESIA") {
    return {
      respuesta: elegir("CORTESIA", estado),
      accion: "CORTESIA",
      derivar: false
    };
  }

  if (categoria === "MALESTAR") {
    return {
      respuesta: elegir("MALESTAR", estado),
      accion: "MALESTAR",
      derivar: true
    };
  }

  if (categoria === "REQUIERE_OPERADOR") {
    return {
      respuesta: elegir("REQUIERE_OPERADOR", estado),
      accion: "REQUIERE_OPERADOR",
      derivar: true
    };
  }

  return {
    respuesta: elegir("MENSAJE_REGISTRABLE", estado),
    accion: "MENSAJE_REGISTRABLE",
    derivar: false
  };
}

module.exports = {
  crearEstadoInicial,
  actualizarEstado,
  decidirSiguienteAccion
};
