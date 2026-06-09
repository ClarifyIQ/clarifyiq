// clarifyCore.js - CasaLista 0.1.5

function crearEstadoInicial() {
  return {
    motivo: null,
    intencion: null,
    presupuesto: null,
    etapa: "motivo",
    orientable: false,
    historial: [],
    preferencias: [],
    postOrientableCount: 0,
    ultimaAccionEstado: null
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

function esConsultaEstado(mensaje) {
  const t = normalizar(mensaje);

  return /(como va|como viene|hay novedades|alguna novedad|encontraron algo|aparecio algo|apareció algo|hay algo|sigue activa|estado de la busqueda|estado de la búsqueda)/i.test(t);
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
    historial: estadoActual.historial ?? [],
    preferencias: estadoActual.preferencias ?? [],
    postOrientableCount: estadoActual.postOrientableCount ?? 0,
    ultimaAccionEstado: estadoActual.ultimaAccionEstado ?? null
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

  if (estado.orientable) {
    const consultaEstado = esConsultaEstado(texto);

    return {
      ...estado,
      historial,
      preferencias: consultaEstado
        ? estado.preferencias
        : [...(estado.preferencias || []), texto].slice(-30),
      postOrientableCount: (estado.postOrientableCount || 0) + 1,
      ultimaAccionEstado: consultaEstado
        ? "POST_ORIENTABLE_CONSULTA_ESTADO"
        : "POST_ORIENTABLE_DETALLE"
    };
  }

  if (!estado.motivo) {
    if (esEntradaGenerica(texto)) {
      return {
        ...estado,
        etapa: "motivo",
        historial,
        ultimaAccionEstado: "ENTRADA_GENERICA"
      };
    }

    estado = {
      ...estado,
      motivo: texto,
      etapa: "intencion",
      historial,
      ultimaAccionEstado: "MOTIVO_RECIBIDO"
    };

    return actualizarOrientable(estado);
  }

  if (!estado.intencion) {
    estado = {
      ...estado,
      intencion: clasificarIntencion(texto),
      etapa: "presupuesto",
      historial,
      ultimaAccionEstado: "INTENCION_RECIBIDA"
    };

    return actualizarOrientable(estado);
  }

  if (!estado.presupuesto) {
    estado = {
      ...estado,
      presupuesto: texto,
      etapa: "orientable",
      historial,
      ultimaAccionEstado: "CIERRE_ORIENTABLE"
    };

    return actualizarOrientable(estado);
  }

  return actualizarOrientable({
    ...estado,
    historial
  });
}

function respuestaPostOrientableDetalle(estado) {
  const n = estado.postOrientableCount || 0;

  const respuestas = [
    "Entiendo.\n\nSeguimos tomando esos detalles para orientar mejor la busqueda.",
    "Perfecto.\n\nEse tipo de detalle ayuda a ajustar mejor el criterio con el que venimos trabajando.",
    "Bien, lo tenemos en cuenta dentro de lo que venimos conversando.\n\nPodes seguir agregando o corrigiendo detalles cuando quieras.",
    "Entendido.\n\nLa idea es ir afinando la busqueda con lo que vayas recordando, sin empezar de cero cada vez."
  ];

  return respuestas[n % respuestas.length];
}

function decidirSiguienteAccion(estado) {
  if (estado.ultimaAccionEstado === "POST_ORIENTABLE_CONSULTA_ESTADO") {
    return {
      respuesta:
        "La busqueda sigue encaminada.\n\n" +
        "Si aparece una opcion que tenga sentido con lo que venimos conversando, nos vamos a poner en contacto con vos.",
      accion: "POST_ORIENTABLE_CONSULTA_ESTADO",
      derivar: false
    };
  }

  if (estado.ultimaAccionEstado === "POST_ORIENTABLE_DETALLE") {
    return {
      respuesta: respuestaPostOrientableDetalle(estado),
      accion: "POST_ORIENTABLE_DETALLE",
      derivar: false
    };
  }

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
      "Entiendo. Con lo que me compartiste ya puedo dejar la busqueda encaminada con un criterio claro.\n\n" +
      "Si queres, tambien podes contarme que te gustaria encontrar o evitar en una propiedad: zona, dormitorios, cochera, balcon o cualquier detalle importante.\n\n" +
      "Y si mas adelante recordas algo o queres saber como viene la busqueda, podes escribirme por aca y seguimos desde donde dejamos.",
    accion: "ORIENTABLE",
    derivar: estado.intencion === "avanzar"
  };
}

module.exports = {
  crearEstadoInicial,
  actualizarEstado,
  decidirSiguienteAccion
};
