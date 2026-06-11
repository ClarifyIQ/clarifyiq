// clarifyCore.js
// CasaLista V1 = conservar información + seleccionar respuesta segura
// Interfaz conservada:
// actualizarEstado(mensaje, estadoActual)
// decidirSiguienteAccion(estado)

const RESPUESTAS = {
  SALUDO_PEDIR_BUSQUEDA: [
    "Hola, soy CasaLista.\n\nEstamos para ayudarte y acompañarte durante la búsqueda de tu próxima propiedad.\n\nContame qué te gustaría encontrar o qué te gustaría evitar en una propiedad."
  ],

  PREGUNTAR_INTENCION: [
    "Bien.\n\nSi aparece una opción que tenga sentido para vos, ¿podríamos coordinar una visita?"
  ],

  PREGUNTAR_CAPITAL: [
    "Perfecto.\n\nPara optimizar tu búsqueda, ¿de cuánto capital aproximado contás?"
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
  const n = estado?.contadorRespuestas || 0;
  return lista[n % lista.length];
}

function crearEstadoInicial() {
  return {
    motivo: null,
    intencion: null,
    presupuesto: null,

    tieneIntencion: false,
    tieneCapital: false,
    orientable: false,

    etapa: "motivo",
    historial: [],
    preferencias: [],

    ultimaAccionEstado: null,
    requiereOperador: false,
    contadorRespuestas: 0,

    creadoEn: new Date().toISOString(),
    actualizadoEn: new Date().toISOString()
  };
}

function normalizar(texto) {
  return String(texto || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function asegurarEstadoCasaLista(estadoActual) {
  if (!estadoActual) return crearEstadoInicial();

  return {
    motivo: estadoActual.motivo ?? null,
    intencion: estadoActual.intencion ?? null,
    presupuesto: estadoActual.presupuesto ?? null,

    tieneIntencion: estadoActual.tieneIntencion ?? Boolean(estadoActual.intencion),
    tieneCapital: estadoActual.tieneCapital ?? Boolean(estadoActual.presupuesto),
    orientable: estadoActual.orientable ?? false,

    etapa: estadoActual.etapa ?? "motivo",
    historial: estadoActual.historial ?? [],
    preferencias: estadoActual.preferencias ?? [],

    ultimaAccionEstado: estadoActual.ultimaAccionEstado ?? null,
    requiereOperador: estadoActual.requiereOperador ?? false,
    contadorRespuestas: estadoActual.contadorRespuestas ?? 0,

    creadoEn: estadoActual.creadoEn ?? new Date().toISOString(),
    actualizadoEn: estadoActual.actualizadoEn ?? new Date().toISOString()
  };
}

function esEntradaGenerica(texto) {
  const t = normalizar(texto).replace(/[¿?¡!.,;:]/g, "");

  return (
    /^(hola|buenas|buen dia|buenas tardes|buenas noches|info|informacion|quiero info|quiero informacion)$/.test(t) ||
    /(vi un anuncio|vengo del anuncio|me interesa informacion|me interesa info|de que se trata|quiero saber mas|pasame info|pasame informacion)/.test(t)
  );
}

function detectarIntencion(texto) {
  const t = normalizar(texto);

  return /\b(comprar|compra|busco|buscando|quiero|quisiera|me interesa|propiedad|casa|departamento|depto|dpto|terreno|lote)\b/.test(t);
}

function detectarCapital(texto) {
  const t = normalizar(texto);

  const hablaDeDinero =
    /\b(usd|dolar|dolares|u\$s|us\$|verdes|lucas|k|millones|millon|pesos|capital|presupuesto|tengo|dispongo|cuento con|me puedo estirar)\b/.test(t);

  const tieneNumero = /\d/.test(t);

  const numeroGrande = /\b\d{5,}\b/.test(t.replace(/[.\s]/g, ""));

  return (hablaDeDinero && tieneNumero) || numeroGrande;
}

function esConsultaEstado(texto) {
  const t = normalizar(texto);

  return /\b(como va|como viene|hay novedades|alguna novedad|novedad|novedades|aparecio|aparecio algo|hay algo|algo para mi|en que quedo|sigue activa|estado de la busqueda|tienen algo|buscaron)\b/.test(t);
}

function requiereOperador(texto) {
  const t = normalizar(texto);

  return /\b(escritura|legal|abogado|comision|comisiones|financiacion bancaria|banco|hipoteca|quiero vender|vender una propiedad|tasacion|boleto|contrato|sena|seña|reserva|impuesto|papeles|documentacion)\b/.test(t);
}

function guardarMensajeOriginal(estado, mensaje, categoria) {
  const texto = String(mensaje || "").trim();

  const evento = {
    fecha: new Date().toISOString(),
    mensajeOriginal: texto,
    categoria
  };

  return {
    ...estado,
    historial: [...(estado.historial || []), evento].slice(-100),
    actualizadoEn: new Date().toISOString()
  };
}

function actualizarEstado(mensaje, estadoActual) {
  let estado = asegurarEstadoCasaLista(estadoActual);
  const texto = String(mensaje || "").trim();

  if (!texto) return estado;

  let categoria = "MENSAJE_REGISTRABLE";

  if (estado.orientable && requiereOperador(texto)) {
    categoria = "REQUIERE_OPERADOR";
  } else if (estado.orientable && esConsultaEstado(texto)) {
    categoria = "CONSULTA_ESTADO";
  } else if (esEntradaGenerica(texto) && !estado.tieneIntencion) {
    categoria = "SALUDO_PEDIR_BUSQUEDA";
  }

  estado = guardarMensajeOriginal(estado, texto, categoria);

  if (!estado.tieneIntencion && detectarIntencion(texto)) {
    estado.tieneIntencion = true;
    estado.intencion = "avanzar";
    estado.motivo = estado.motivo || texto;
  }

  if (!estado.tieneCapital && detectarCapital(texto)) {
    estado.tieneCapital = true;
    estado.presupuesto = estado.presupuesto || texto;
  }

  if (estado.orientable && categoria === "MENSAJE_REGISTRABLE") {
    estado.preferencias = [...(estado.preferencias || []), texto].slice(-100);
  }

  if (categoria === "REQUIERE_OPERADOR") {
    estado.requiereOperador = true;
  }

  estado.orientable = Boolean(estado.tieneIntencion && estado.tieneCapital);

  if (!estado.tieneIntencion) {
    estado.etapa = "motivo";
    estado.ultimaAccionEstado = categoria === "SALUDO_PEDIR_BUSQUEDA"
      ? "SALUDO_PEDIR_BUSQUEDA"
      : "PREGUNTAR_INTENCION";
  } else if (!estado.tieneCapital) {
    estado.etapa = "capital";
    estado.ultimaAccionEstado = "PREGUNTAR_CAPITAL";
  } else if (categoria === "CONSULTA_ESTADO") {
    estado.etapa = "orientable";
    estado.ultimaAccionEstado = "CONSULTA_ESTADO";
  } else if (categoria === "REQUIERE_OPERADOR") {
    estado.etapa = "orientable";
    estado.ultimaAccionEstado = "REQUIERE_OPERADOR";
  } else {
    estado.etapa = "orientable";
    estado.ultimaAccionEstado = estado.orientable ? "MENSAJE_REGISTRABLE" : categoria;
  }

  estado.contadorRespuestas = (estado.contadorRespuestas || 0) + 1;

  return estado;
}

function decidirSiguienteAccion(estado) {
  const categoria = estado?.ultimaAccionEstado || "SALUDO_PEDIR_BUSQUEDA";

  if (categoria === "SALUDO_PEDIR_BUSQUEDA") {
    return {
      respuesta: elegir("SALUDO_PEDIR_BUSQUEDA", estado),
      accion: "SALUDO_PEDIR_BUSQUEDA",
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

  if (categoria === "PREGUNTAR_CAPITAL") {
    return {
      respuesta: elegir("PREGUNTAR_CAPITAL", estado),
      accion: "PREGUNTAR_CAPITAL",
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
    derivar: estado?.orientable === true
  };
}

module.exports = {
  crearEstadoInicial,
  actualizarEstado,
  decidirSiguienteAccion
};
