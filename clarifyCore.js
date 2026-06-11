// clarifyCore.js - CasaLista V1 = memoria útil por teléfono

function crearEstadoInicial() {
  return {
    motivo: null,
    intencion: null,
    presupuesto: null,
    etapa: "motivo",
    orientable: false,
    historial: [],
    preferencias: [],
    ultimaAccionEstado: null
  };
}

function normalizar(texto) {
  return String(texto || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[¿?¡!.,;:]/g, "");
}

function esEntradaGenerica(mensaje) {
  const t = normalizar(mensaje);

  return (
    /^(hola|buenas|buen dia|buenas tardes|buenas noches|info|informacion|quiero info|quiero informacion)$/i.test(t) ||
    /(vi un anuncio|vengo del anuncio|me interesa informacion|me interesa info|de que se trata|quiero saber mas|pasame info|pasame informacion)/i.test(t)
  );
}

function detectarIntencionSimple(mensaje) {
  const t = normalizar(mensaje);

  if (
    /^(si|s|ok|dale|claro|obvio)$/i.test(t) ||
    /(quiero comprar|quiero avanzar|me interesa|me interesaria|aparece algo bueno|aparece algo adecuado|tenga sentido|avanzar|coordinar una visita|verla|ir a verla|visitar)/i.test(t)
  ) {
    return "avanzar";
  }

  if (
    /(estoy mirando|estoy averiguando|por ahora averiguo|solo estoy viendo|mas adelante|todavia no|tal vez|depende|no se|segun que aparezca)/i.test(t)
  ) {
    return "explorando";
  }

  return null;
}

function clasificarIntencion(mensaje) {
  return detectarIntencionSimple(mensaje) || "explorando";
}

function detectarPresupuestoSimple(mensaje) {
  const texto = String(mensaje || "").trim();
  const t = normalizar(texto);

  if (
    /(dolar|dolares|usd|u\$s|us\$|verdes)/i.test(t) &&
    /(\d+|mil|lucas|k)/i.test(t)
  ) {
    return texto;
  }

  if (/\b\d{5,}\b/.test(t)) {
    return texto;
  }

  if (/\b\d+\s*(mil|k|lucas)\b/i.test(t)) {
    return texto;
  }

  return null;
}

function esConsultaEstado(mensaje) {
  const t = normalizar(mensaje);

  return (
    /(como va|como viene|hay novedades|alguna novedad|encontraron algo|aparecio algo|hay algo|sigue activa|estado de la busqueda)/i.test(t) ||
    /(que novedades|que hay|ya hay algo|alguna opcion|alguna propiedad)/i.test(t)
  );
}

function detectarCambioSimple(mensaje, estado) {
  const t = normalizar(mensaje);
  const cambios = [];

  if (/(departamento|depto|dpto|departamentos)/i.test(t)) {
    cambios.push("ahora también aceptarías departamentos");
  }

  if (/(casa|casas)/i.test(t) && estado.motivo && !normalizar(estado.motivo).includes("casa")) {
    cambios.push("ahora también mencionás casa");
  }

  if (/(terreno|lote|lotes)/i.test(t)) {
    cambios.push("ahora también mencionás terreno o lote");
  }

  const nuevoPresupuesto = detectarPresupuestoSimple(mensaje);
  if (nuevoPresupuesto && nuevoPresupuesto !== estado.presupuesto) {
    cambios.push(`actualizás presupuesto a ${nuevoPresupuesto}`);
  }

  if (/(zona norte|zona sur|zona centro|nueva cordoba|general paz|alberdi|guemes|alta cordoba|arguello|villa belgrano)/i.test(t)) {
    cambios.push(`agregás o modificás zona: ${mensaje}`);
  }

  if (/(balcon|cochera|patio|pileta|terraza|quincho|jardin|dos dormitorios|2 dormitorios|tres dormitorios|3 dormitorios)/i.test(t)) {
    cambios.push(`agregás preferencia: ${mensaje}`);
  }

  if (cambios.length === 0) {
    cambios.push(`agregás este dato: ${mensaje}`);
  }

  return cambios.join(". ");
}

function resumenEstado(estado) {
  const partes = [];

  if (estado.motivo) partes.push(estado.motivo);
  if (estado.presupuesto) partes.push(`presupuesto cercano a ${estado.presupuesto}`);

  if (partes.length === 0) return "teníamos una búsqueda iniciada";

  return partes.join(", ");
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
    ultimaAccionEstado: estadoActual.ultimaAccionEstado ?? null,
    ultimoCambioDetectado: estadoActual.ultimoCambioDetectado ?? null
  };
}

function actualizarEstado(mensaje, estadoActual) {
  let estado = asegurarEstadoCasaLista(estadoActual);
  const texto = String(mensaje || "").trim();

  if (!texto) return estado;

  const historialBase = [
    ...(estado.historial || []),
    {
      mensaje: texto,
      etapa: estado.etapa,
      fecha: new Date().toISOString()
    }
  ].slice(-50);

  if (estado.orientable) {
    const consultaEstado = esConsultaEstado(texto);
    const cambio = consultaEstado ? null : detectarCambioSimple(texto, estado);

    const nuevoPresupuesto = detectarPresupuestoSimple(texto);

    return {
      ...estado,
      presupuesto: nuevoPresupuesto || estado.presupuesto,
      historial: historialBase,
      preferencias: consultaEstado
        ? estado.preferencias
        : [...(estado.preferencias || []), texto].slice(-50),
      ultimaAccionEstado: consultaEstado
        ? "POST_ORIENTABLE_CONSULTA_ESTADO"
        : "POST_ORIENTABLE_DETALLE",
      ultimoCambioDetectado: cambio
    };
  }

  if (!estado.motivo) {
    if (esEntradaGenerica(texto)) {
      return {
        ...estado,
        etapa: "motivo",
        historial: historialBase,
        ultimaAccionEstado: "ENTRADA_GENERICA"
      };
    }

    const intencionDetectada = detectarIntencionSimple(texto);
    const presupuestoDetectado = detectarPresupuestoSimple(texto);

    estado = {
      ...estado,
      motivo: texto,
      intencion: intencionDetectada,
      presupuesto: presupuestoDetectado,
      etapa: "intencion",
      historial: historialBase,
      ultimaAccionEstado: "MOTIVO_RECIBIDO"
    };

    estado = actualizarOrientable(estado);

    if (!estado.orientable) {
      if (!estado.intencion) estado.etapa = "intencion";
      else if (!estado.presupuesto) estado.etapa = "presupuesto";
    }

    return estado;
  }

  if (!estado.intencion) {
    estado = {
      ...estado,
      intencion: clasificarIntencion(texto),
      etapa: "presupuesto",
      historial: historialBase,
      ultimaAccionEstado: "INTENCION_RECIBIDA"
    };

    return actualizarOrientable(estado);
  }

  if (!estado.presupuesto) {
    estado = {
      ...estado,
      presupuesto: texto,
      etapa: "orientable",
      historial: historialBase,
      ultimaAccionEstado: "CIERRE_ORIENTABLE"
    };

    return actualizarOrientable(estado);
  }

  return actualizarOrientable({
    ...estado,
    historial: historialBase
  });
}

function decidirSiguienteAccion(estado) {
  if (estado.ultimaAccionEstado === "POST_ORIENTABLE_CONSULTA_ESTADO") {
    return {
      respuesta:
        "Tenemos tu búsqueda registrada.\n\n" +
        `Hasta ahora veníamos trabajando con esto: ${resumenEstado(estado)}.\n\n` +
        "Si aparece una opción compatible, nos vamos a comunicar. También podés avisarnos si cambia tu presupuesto, zona o preferencias.",
      accion: "POST_ORIENTABLE_CONSULTA_ESTADO",
      derivar: false
    };
  }

  if (estado.ultimaAccionEstado === "POST_ORIENTABLE_DETALLE") {
    return {
      respuesta:
        `Perfecto. Teníamos registrado que buscabas ${resumenEstado(estado)}.\n\n` +
        `Actualizo tu búsqueda: ${estado.ultimoCambioDetectado}.`,
      accion: "POST_ORIENTABLE_DETALLE",
      derivar: false
    };
  }

  if (!estado.motivo) {
    return {
      respuesta:
        "Hola, soy CasaLista.\n\n" +
        "Te ayudamos a encontrar lo que estás buscando.\n\n" +
        "Me podés describir qué te interesaría conseguir o evitar en una propiedad.",
      accion: "PREGUNTAR_MOTIVO",
      derivar: false
    };
  }

  if (!estado.intencion) {
    return {
      respuesta:
        "Bien.\n\n" +
        "Si aparece algo según tus preferencias, ¿podríamos coordinar una visita?",
      accion: "PREGUNTAR_INTENCION",
      derivar: false
    };
  }

  if (!estado.presupuesto) {
    return {
      respuesta:
        "Perfecto.\n\n" +
        "Para optimizar tu búsqueda, ¿de cuánto capital aproximado contás?",
      accion: "PREGUNTAR_PRESUPUESTO",
      derivar: false
    };
  }

  return {
    respuesta:
      "Perfecto, ya registramos tu búsqueda y vamos a empezar a revisar opciones compatibles.\n\n" +
      "Si en algún momento recordás un dato relevante o cambia algo —zona, presupuesto, tipo de propiedad o preferencias— podés escribirnos cuando quieras. Cada información nueva actualiza la búsqueda.",
    accion: "ORIENTABLE",
    derivar: estado.intencion === "avanzar"
  };
}

module.exports = {
  crearEstadoInicial,
  actualizarEstado,
  decidirSiguienteAccion
};
