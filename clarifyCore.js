// clarifyCore.js - CasaLista 0.1

function crearEstadoInicial() {
  return {
    motivo: null,
    intencion: null,
    presupuesto: null,
    etapa: "motivo",
    orientable: false,
    historial: []
  };
}

function normalizar(texto) {
  return String(texto || "").trim().toLowerCase();
}

function esEntradaGenerica(mensaje) {
  const t = normalizar(mensaje);

  return (
    /^(hola|buenas|buen dia|buenas tardes|buenas noches|info|informacion|quiero info|quiero informacion)$/i.test(t) ||
    /(vi un anuncio|vengo del anuncio|me interesa informacion|me interesa info|de que se trata|quiero saber mas|pasame info|pasame informacion)/i.test(t)
  );
}

function clasificarIntencion(mensaje) {
  const t = normalizar(mensaje);

  if (
    /^(si|sí|s|ok|dale|claro|obvio)$/i.test(t) ||
    /(quiero comprar|quiero avanzar|me interesa|aparece algo bueno|aparece algo adecuado|tenga sentido|avanzar)/i.test(t)
  ) {
    return "avanzar";
  }

  return "explorando";
}

function actualizarOrientable(estado) {
  const orientable =
    estado.motivo !== null &&
    estado.intencion !== null &&
    estado.presupuesto !== null;

  return {
    ...estado,
    orientable,
    etapa: orientable ? "orientable" : estado.etapa
  };
}

function asegurarEstadoCasaLista(estadoActual) {
  if (!estadoActual) return crearEstadoInicial();

  return {
    motivo: estadoActual.motivo ?? null,
    intencion: estadoActual.intencion ?? null,
    presupuesto: estadoActual.presupuesto ?? null,
    etapa: estadoActual.etapa ?? "motivo",
    orientable: estadoActual.orientable ?? false,
    historial: estadoActual.historial ?? []
  };
}

function actualizarEstado(mensaje, estadoActual) {
  let estado = asegurarEstadoCasaLista(estadoActual);
  const texto = String(mensaje || "").trim();

  if (!texto) return estado;

  const historial = [
    ...(estado.historial || []),
    {
      mensaje: texto,
      etapa: estado.etapa,
      fecha: new Date().toISOString()
    }
  ].slice(-30);

  if (!estado.motivo) {
    if (esEntradaGenerica(texto)) {
      return {
        ...estado,
        etapa: "motivo",
        historial
      };
    }

    estado = {
      ...estado,
      motivo: texto,
      etapa: "intencion",
      historial
    };

    return actualizarOrientable(estado);
  }

  if (!estado.intencion) {
    estado = {
      ...estado,
      intencion: clasificarIntencion(texto),
      etapa: "presupuesto",
      historial
    };

    return actualizarOrientable(estado);
  }

  if (!estado.presupuesto) {
    estado = {
      ...estado,
      presupuesto: texto,
      etapa: "orientable",
      historial
    };

    return actualizarOrientable(estado);
  }

  estado = {
    ...estado,
    historial
  };

  return actualizarOrientable(estado);
}

function decidirSiguienteAccion(estado) {
  if (!estado.motivo) {
    return {
      respuesta:
        "Hola, soy CasaLista.\n\n" +
        "Te ayudamos a ordenar una busqueda de propiedad antes de avanzar, para entender que necesitas realmente y no hacerte perder tiempo.\n\n" +
        "Antes de hablar de opciones, me gustaria entender que te trae hoy por aca.",
      accion: "PREGUNTAR_MOTIVO",
      derivar: false
    };
  }

  if (!estado.intencion) {
    return {
      respuesta:
        "Entiendo.\n\n" +
        "Si apareciera una opcion que tenga sentido para vos, estarias pensando en avanzar o por ahora estas explorando posibilidades?",
      accion: "PREGUNTAR_INTENCION",
      derivar: false
    };
  }

  if (!estado.presupuesto) {
    return {
      respuesta:
        "Bien.\n\n" +
        "Para tener una referencia razonable, en que rango de presupuesto te sentirias comodo trabajando?",
      accion: "PREGUNTAR_PRESUPUESTO",
      derivar: false
    };
  }

  return {
    respuesta:
      "Gracias por contarmelo.\n\n" +
      "Con lo que me compartiste ya puedo dejar la busqueda encaminada con un criterio claro.\n\n" +
      "Si encontramos opciones que encajen con lo que estas buscando, nos vamos a poner en contacto con vos.",
    accion: "ORIENTABLE",
    derivar: estado.intencion === "avanzar"
  };
}

module.exports = {
  crearEstadoInicial,
  actualizarEstado,
  decidirSiguienteAccion
};
