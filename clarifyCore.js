// clarifyCore.js
// CasaLista V1 = conservar contexto + seleccionar respuesta segura
// Interfaz mantenida:
// actualizarEstado(mensaje, estadoActual)
// decidirSiguienteAccion(estado)

const RESPUESTAS = {
  APERTURA: [
    "Hola, somos CasaLista.\n\nAyudamos a personas que están buscando comprar una propiedad.\n\nNos contás qué estás buscando y, si aparece algo compatible, nos comunicamos con vos.\n\n¿Qué te gustaría encontrar?"
  ],

  PREGUNTAR_INTENCION: [
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
    historial: []
  };
}

function asegurarEstado(estadoActual) {
  if (!estadoActual) return crearEstadoInicial();

  return {
    orientable: Boolean(estadoActual.orientable),
    intencion: estadoActual.intencion ?? null,
    referenciaEconomica:
      estadoActual.referenciaEconomica ??
      estadoActual.presupuesto ??
      null,
    etapa: estadoActual.etapa ?? "apertura",
    ultimaAccionEstado: estadoActual.ultimaAccionEstado ?? "APERTURA",
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
    /^(hola|buenas|buen dia|buenas tardes|buenas noches|info|informacion|consulta)$/.test(t) ||
    t.length <= 3 ||
    /(vi un anuncio|vengo del anuncio|quiero saber mas|quiero info|pasame info|de que se trata)/.test(t)
  );
}

function detectaIntencionReal(texto) {
  const t = normalizar(texto);

  return (
    /^(si|sí|s|ok|dale|claro|correcto)$/.test(t) ||
    /(quiero comprar|busco comprar|estoy buscando para comprar|estoy para comprar|comprar una propiedad|quiero avanzar|avanzaria|avanzaría|si aparece algo|si tiene sentido|depende de la oportunidad)/.test(t)
  );
}

function esConsultaEstado(texto) {
  const t = normalizar(texto);

  return /(como va|cómo va|hay novedades|alguna novedad|aparecio algo|apareció algo|hay algo|tienen algo|algo para mi|en que quedo|en qué quedó|sigue registrada|sigue activa)/.test(t);
}

function requiereOperador(texto) {
  const t = normalizar(texto);

  return /(escritura|legal|abogado|comision|comisión|financiacion bancaria|financiación bancaria|banco|hipoteca|quiero vender|vender una propiedad|tasacion|tasación|boleto|contrato|seña|reserva|papeles|documentacion|documentación)/.test(t);
}

function actualizarEstado(mensaje, estadoActual) {
  let estado = asegurarEstado(estadoActual);
  const texto = String(mensaje || "").trim();

  if (!texto) {
    estado = guardarHistorial(estado, mensaje, "APERTURA");
    estado.etapa = "apertura";
    return estado;
  }

  // Después de orientable: guardar todo y responder seguro.
  if (estado.orientable) {
    if (requiereOperador(texto)) {
      estado = guardarHistorial(estado, texto, "REQUIERE_OPERADOR");
      estado.etapa = "orientable";
      return estado;
    }

    if (esConsultaEstado(texto)) {
      estado = guardarHistorial(estado, texto, "CONSULTA_ESTADO");
      estado.etapa = "orientable";
      return estado;
    }

    estado = guardarHistorial(estado, texto, "MENSAJE_REGISTRABLE");
    estado.etapa = "orientable";
    return estado;
  }

  // Antes de orientable: preguntar lo mínimo.
  if (!estado.intencion) {
    if (esEntradaGenerica(texto)) {
      estado = guardarHistorial(estado, texto, "APERTURA");
      estado.etapa = "apertura";
      return estado;
    }

    if (detectaIntencionReal(texto)) {
      estado.intencion = texto;
      estado = guardarHistorial(estado, texto, "PREGUNTAR_REFERENCIA_ECONOMICA");
      estado.etapa = "referenciaEconomica";
      return estado;
    }

    estado = guardarHistorial(estado, texto, "PREGUNTAR_INTENCION");
    estado.etapa = "intencion";
    return estado;
  }

  if (!estado.referenciaEconomica) {
    estado.referenciaEconomica = texto;
    estado.orientable = true;
    estado = guardarHistorial(estado, texto, "ORIENTABLE");
    estado.etapa = "orientable";
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

  if (categoria === "PREGUNTAR_INTENCION") {
    return {
      respuesta: elegir("PREGUNTAR_INTENCION", estado),
      accion: "PREGUNTAR_INTENCION",
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
