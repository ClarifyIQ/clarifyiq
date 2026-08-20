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
    "Hola, somos CasaLista.\n\nAyudamos a personas que quieren comprar una propiedad.\n\nNo hace falta que tengas todo definido desde el principio. La idea es ir conociendo mejor lo que necesitás para poder acompañarte durante ese proceso.\n\nCuanta más información compartas con nosotros, más posibilidades tendremos de identificar oportunidades compatibles con vos.\n\n¿Qué tipo de propiedad estás buscando?\n\n1. Casa\n2. Dúplex / PH\n3. Departamento\n4. Terreno\n5. Quinta / Campo\n6. Local o propiedad comercial"
  ],

  TIPO_PROPIEDAD_NO_VALIDO: [
    "No pude validar qué tipo de propiedad estás buscando.\n\nPuede haber un error de escritura o la respuesta no haber quedado suficientemente clara.\n\nPara poder continuar, respondé con algo simple, por ejemplo: casa, departamento, terreno, lote o quinta."
  ],

  TIPO_PROPIEDAD_FINAL: [
    "Todavía no pude validar qué tipo de propiedad estás buscando.\n\nCuando quieras retomar la búsqueda, respondé con el tipo de propiedad que buscás y seguimos desde ahí."
  ],

  PREGUNTAR_CONTINUIDAD: [
    "Perfecto.\n\nSi apareciera una propiedad compatible con lo que estás buscando, ¿estarías dispuesto a coordinar una visita para conocerla?\n\nRespondé con una opción:\n\n1. Sí.\n2. No."
  ],

  CONTINUIDAD_NO_VALIDO: [
    "No pude validar si estarías dispuesto a coordinar una visita.\n\nPara poder continuar, respondé con una opción:\n\n1. Sí.\n2. No."
  ],

  CONTINUIDAD_FINAL: [
    "Todavía no pude validar esa información.\n\nCuando quieras retomar la búsqueda, respondé la pregunta anterior y seguimos desde ahí."
  ],

  CONTINUIDAD_NO: [
    "Entendido.\n\nPor ahora dejamos el flujo automático acá.\n\nSi más adelante estás dispuesto a coordinar una visita, podés escribirnos y retomamos la búsqueda."
  ],

  PREGUNTAR_REFERENCIA_ECONOMICA: [
    "Bien.\n\nPara orientarnos mejor también nos sirve una referencia económica aproximada.\n\nNo hace falta que sea un monto exacto. Puede ser un presupuesto estimado, un crédito aprobado o cualquier referencia que hoy tengas.\n\n¿Con qué presupuesto aproximado o referencia económica contás hoy?"
  ],

  REFERENCIA_ECONOMICA_NO_VALIDA: [
    "No pude identificar una referencia económica para orientar la búsqueda.\n\nNo hace falta que sea un monto exacto. Puede ser un presupuesto aproximado, un crédito aprobado o cualquier otra referencia económica."
  ],

  REFERENCIA_ECONOMICA_NO_VALIDA_SEGUNDO_INTENTO: [
    "Para poder orientarte necesitamos una referencia económica aproximada. Puede ser un presupuesto estimado, un crédito aprobado o una forma prevista de pago. Cuando tengas ese dato, respondeme esta pregunta y seguimos con tu búsqueda."
  ],

  REFERENCIA_ECONOMICA_FINAL: [
    "Todavía no pude identificar esa información.\n\nCuando quieras retomar la búsqueda, respondé la pregunta anterior y seguimos desde ahí."
  ],

  PEDIR_DESCRIPCION_LIBRE: [
    "Perfecto, gracias por compartir esa información.\n\nCon lo que nos contaste ya tenemos una primera referencia de tu búsqueda.\n\nA partir de ahora podés agregar todo lo que consideres importante:\n\n- zonas donde te gustaría vivir;\n- características que necesitás;\n- prioridades personales o familiares;\n- cualquier detalle que pueda ayudarnos a comprender mejor tu búsqueda.\n\nToda la información que compartas queda registrada y será tenida en cuenta para acompañarte mejor.\n\nUn asesor revisará tu búsqueda y se comunicará con vos para continuar el proceso personalmente."
  ],

  ORIENTABLE: [
    "Perfecto.\n\nA partir de ahora vamos a construir tu búsqueda teniendo en cuenta todo lo que para vos sea importante.\n\nPodés seguir escribiendo por este medio y agregar los detalles que consideres importantes.\n\nCada dato que compartas aporta valor y nos ayuda a comprender mejor qué estás buscando.\n\nPodés contarnos, por ejemplo:\n\n- la zona donde te gustaría vivir;\n- si necesitás estar cerca del trabajo, familia, colegios u otros lugares importantes;\n- características que para vos sean importantes de la propiedad;\n- prioridades personales o familiares;\n- cualquier información que pueda ayudarnos a identificar opciones más compatibles con tu búsqueda.\n\nToda la información que compartas queda registrada y ayuda a mantener tu búsqueda actualizada y activa. Cada nuevo dato nos permite comprender mejor tus necesidades y acompañarte durante el proceso.\n\nUn asesor revisará tu búsqueda y se comunicará con vos para continuar el proceso personalmente."
  ],

  ACOMPANAMIENTO: [
    "Perfecto, lo dejamos registrado.\nDurante una búsqueda pueden aparecer nuevos detalles, cambios o prioridades.\nPodés compartirlos por este medio, porque toda esa información nos ayuda a identificar opciones más compatibles con lo que estás buscando.\nUn asesor revisará tu caso y se comunicará con vos para seguir acompañándote.",
    "Entendido, quedó incorporado a tu búsqueda.\nPodés seguir sumando cualquier información que consideres importante: cambios, preferencias, dudas o nuevos datos.\nLa idea es acompañarte durante el proceso y tener en cuenta qué es importante para vos.\nUn asesor se comunicará con vos para continuar personalmente la búsqueda.",
    "Gracias por compartir esa información.\nQuedó registrada junto con los datos de tu búsqueda.\nPodés seguir agregando cualquier detalle, cambio o consulta que consideres importante. Todo lo que nos compartas nos ayuda a comprender mejor qué estás buscando.\nUn asesor revisará la información de tu búsqueda y se comunicará con vos para continuar acompañándote personalmente."
  ],

  MENSAJE_REGISTRABLE: [
    "Perfecto, quedó registrado.",
    "Gracias por compartir esa información.",
    "Entendido, quedó registrado.",
    "Bien, lo dejamos anotado."
  ],

  CONSULTA_ESTADO: [
    "Tu búsqueda continúa activa.\n\nSi aparece una oportunidad compatible con lo que nos fuiste contando, nos pondremos en contacto con vos.\n\nMientras tanto, si cambia alguna prioridad o querés agregar información, podés escribirnos cuando quieras."
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
    intentosReferenciaEconomica: 0,
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
    intentosReferenciaEconomica: Number.isInteger(estadoActual.intentosReferenciaEconomica)
      ? estadoActual.intentosReferenciaEconomica
      : 0,
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

function esCortesia(texto) {
  const t = normalizar(texto).replace(/[¿?¡!.,;:]/g, "").trim();

  return /^(gracias|muchas gracias|ok|okay|dale|perfecto|buenisimo|buenísimo|genial|barbaro|bárbaro|listo|joya)$/.test(t);
}

function preguntaPorCampo(campo) {
  const preguntas = {
    tipo_propiedad:
      'Para activar la búsqueda:\n\n¿Qué tipo de propiedad estás buscando?\n\n1. Casa\n2. Dúplex / PH\n3. Departamento\n4. Terreno\n5. Quinta / Campo\n6. Local o propiedad comercial',
    zona_o_criterio:
      'Para activar la búsqueda:\n\n¿En qué zona te interesa o necesitás estar cerca de algo?',
    presupuesto:
      'Para activar la búsqueda:\n\n¿Con qué presupuesto te gustaría trabajar?',
    dormitorios:
      'Para que aparezcan opciones que encajen:\n\n¿Cuántos dormitorios necesitás?',
    intencion:
      'Para activar correctamente la búsqueda:\n\n¿Querés avanzar si aparece algo que encaje o estás evaluando opciones?'
  };

  return preguntas[campo] || 'Para activar la búsqueda:\n\nNecesito un dato más.';
}

function esMalestar(texto) {
  const t = normalizar(texto);

  return /(no me siento acompanado|no me siento acompañado|contestan cualquier cosa|no entendieron|no me entendieron|esto no sirve|me estan haciendo perder tiempo|me están haciendo perder tiempo|es una perdida de tiempo|es perder el tiempo|no sirve|cualquier cosa ustedes|responden cualquier cosa)/.test(t);
}

function esConsultaEstado(texto) {
  const t = normalizar(texto);

  return /(como va|cómo va|como viene|hay novedades|alguna novedad|novedad|novedades|aparecio algo|apareció algo|hay algo|tienen algo|algo para mi|en que quedo|en qué quedó|sigue registrada|sigue activa|estado de la busqueda|estado de la búsqueda)/.test(t);
}

function requiereOperador(texto) {
  const t = normalizar(texto);

  return /(escritura|legal|abogado|comision|comisión|comisiones|financiacion bancaria|financiación bancaria|banco|hipoteca|quiero vender|vender una propiedad|tasacion|tasación|boleto|contrato|seña|sena|reserva|papeles|documentacion|documentación|impuesto|impuestos)/.test(t);
}

function detectaTipoPropiedad(texto) {
  const t = normalizar(texto).replace(/[¿?¡!.,;:]/g, " ").trim();

  return (
    /\b(casa|casita|casona|vivienda|propiedad)\b/.test(t) ||
    /\b(departamento|departamemto|departameto|depto|monoambiente)\b/.test(t) ||
    /\b(terreno|tereno|terrenoo|lote|lotes|chacra|chacras|campo|campos)\b/.test(t) ||
    /\b(quinta|qunta|duplex|dúplex|ph)\b/.test(t)
  );
}

function detectaRespuestaVisita(texto) {
  const t = normalizar(texto).replace(/[¿?¡!.,;:]/g, " ").trim();

  if (
    /^(1|si|sí|s|claro|dale|ok|okay|perfecto)$/.test(t) ||
    /(si coordinaria|sí coordinaria|si coordinaría|sí coordinaría|coordino|coordinaria|coordinaría|haria una visita|haría una visita|voy a verla|quiero verla|la iria a ver|la iría a ver|me interesa verla)/.test(t)
  ) {
    return true;
  }

  if (
    /^(2|no|n)$/.test(t) ||
    /(por ahora no|solo estoy mirando|sólo estoy mirando|estoy mirando|estoy explorando|solo explorando|sólo explorando|no coordinaria|no coordinaría|no haria visita|no haría visita)/.test(t)
  ) {
    return false;
  }

  return null;
}

function ultimoFue(estado, categoria) {
  const historial = Array.isArray(estado?.historial) ? estado.historial : [];
  const ultimo = historial[historial.length - 1];

  return ultimo?.categoria === categoria;
}

function detectaReferenciaEconomica(texto) {
  const t = normalizar(texto);

  if (!t) {
    return false;
  }

  const tieneDuda =
    /(no se|no sé|no tengo claro|no tengo idea|no estoy seguro|no estoy segura|estoy viendo|estoy evaluando|estoy mirando|viendo opciones|opciones)/.test(t);

  const tieneReferenciaEconomicaExplícita =
    /(credito|crédito|financiacion|financiación|financiamiento|presupuesto|monto|disponible|dinero|parte de pago|aporte|aporto|aportar|entrada|me alcanza|alcanzo|puedo pagar|puedo avanzar|pagar|pago)/.test(t);

  const tieneMontoNumerico =
    /(?:^|\s)(?:usd|u\$s|\$)?\s*(?:\d{5,}|\d{1,3}(?:[.\s]\d{3})+)(?:\s*(?:usd|u\$s|pesos|dolares?|lucas?))?(?:$|\s|[.,;:!?])/.test(t);

  const tieneMontoConUnidad =
    /\b\d+(?:[.,]\d+)?\s*(?:mil|miles|millones?|millon|k|lucas?|usd|u\$s|pesos|dolares?)\b/.test(t);

  const tieneMontoEnPalabras =
    /\b(?:un|uno|una|cien|ciento|doscientos|doscientas|trescientos|trescientas|cuatrocientos|cuatrocientas|quinientos|quinientas|seiscientos|seiscientas|setecientos|setecientas|ochocientos|ochocientas|novecientos|novecientas)\s+(?:mil|miles|lucas?|millones?|millon)\b/.test(t);

  const tieneMontoExpresadoConCeros =
    /\b(?:un|uno|1)\s+con\s+(?:cinco|seis|siete|ocho|nueve|5|6|7|8|9)\s+ceros?\b/.test(t);

  const tieneMonto =
    tieneMontoNumerico ||
    tieneMontoConUnidad ||
    tieneMontoEnPalabras ||
    tieneMontoExpresadoConCeros;

  const tienePropiedadComoParteDePago =
    /(propiedad|casa|departamento|terreno|ph|duplex|lote|quinta|local).*?(parte de pago|como parte de pago|aporte|aporto|aportar)/.test(t) ||
    /(parte de pago|como parte de pago|aporte|aporto|aportar).*(propiedad|casa|departamento|terreno|ph|duplex|lote|quinta|local)/.test(t) ||
    /(entrego|entregar|aporto|aporte).*(casa|propiedad|terreno|departamento|ph|duplex|lote|quinta|local)/.test(t);

  const esDescripcionPropiedad =
    /(metros|m2|m²|habitacion|habitaciones|dormitorio|dormitorios|cochera|patio|balcon|balcón|jardin|jardín|superficie|medida|medidas|calle|avenida|direccion|dirección|numero|número|lote|frente|fondo|ambientes|baños|baño)/.test(t);

  if (tieneDuda && !tieneReferenciaEconomicaExplícita && !tieneMonto && !tienePropiedadComoParteDePago) {
    return false;
  }

  if (esDescripcionPropiedad && !tieneReferenciaEconomicaExplícita && !tieneMonto && !tienePropiedadComoParteDePago) {
    return false;
  }

  if (tienePropiedadComoParteDePago) {
    return true;
  }

  if (tieneReferenciaEconomicaExplícita) {
    return true;
  }

  return tieneMonto;
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

  if (estado.etapa === "cerrado") {
    const cerradoPorFaltaDeReferenciaEconomica =
      estado.ultimaAccionEstado === "REFERENCIA_ECONOMICA_NO_VALIDA_SEGUNDO_INTENTO" ||
      estado.ultimaAccionEstado === "REFERENCIA_ECONOMICA_FINAL";

    if (cerradoPorFaltaDeReferenciaEconomica) {
      if (detectaReferenciaEconomica(texto)) {
        estado.referenciaEconomica = true;
        estado = guardarHistorial(estado, texto, "PEDIR_DESCRIPCION_LIBRE");
        estado.etapa = "descripcionLibre";
        return estado;
      }

      estado.ultimaAccionEstado = "REFERENCIA_ECONOMICA_FINAL";
      estado.etapa = "cerrado";
      return estado;
    }

    estado = guardarHistorial(estado, texto, "MENSAJE_REGISTRABLE");
    estado.etapa = "cerrado";
    return estado;
  }

  if (estado.orientable) {
    estado = guardarHistorial(estado, texto, "ACOMPANAMIENTO");
    estado.etapa = "orientable";
    return estado;
  }

  if (estado.etapa === "apertura") {
    if (detectaTipoPropiedad(texto)) {
      estado = guardarHistorial(estado, texto, "PREGUNTAR_CONTINUIDAD");
      estado.etapa = "continuidad";
      return estado;
    }

    if (ultimoFue(estado, "TIPO_PROPIEDAD_NO_VALIDO")) {
      estado = guardarHistorial(estado, texto, "TIPO_PROPIEDAD_FINAL");
      estado.etapa = "cerrado";
      return estado;
    }

    estado = guardarHistorial(estado, texto, "TIPO_PROPIEDAD_NO_VALIDO");
    estado.etapa = "apertura";
    return estado;
  }

  if (estado.etapa === "continuidad") {
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

    const respuestaVisita = detectaRespuestaVisita(texto);

    if (respuestaVisita === true) {
      estado.intencion = true;
      estado = guardarHistorial(estado, texto, "PREGUNTAR_REFERENCIA_ECONOMICA");
      estado.etapa = "referenciaEconomica";
      return estado;
    }

    if (respuestaVisita === false) {
      estado.intencion = false;
      estado = guardarHistorial(estado, texto, "CONTINUIDAD_NO");
      estado.etapa = "cerrado";
      return estado;
    }

    if (ultimoFue(estado, "CONTINUIDAD_NO_VALIDO")) {
      estado = guardarHistorial(estado, texto, "CONTINUIDAD_FINAL");
      estado.etapa = "cerrado";
      return estado;
    }

    estado = guardarHistorial(estado, texto, "CONTINUIDAD_NO_VALIDO");
    estado.etapa = "continuidad";
    return estado;
  }

  if (estado.etapa === "referenciaEconomica" && !estado.referenciaEconomica) {
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
      estado.referenciaEconomica = true;
      estado = guardarHistorial(estado, texto, "PEDIR_DESCRIPCION_LIBRE");
      estado.etapa = "descripcionLibre";
      return estado;
    }

    estado.intentosReferenciaEconomica = (estado.intentosReferenciaEconomica || 0) + 1;

    if (estado.intentosReferenciaEconomica >= 2) {
      estado = guardarHistorial(estado, texto, "REFERENCIA_ECONOMICA_NO_VALIDA_SEGUNDO_INTENTO");
      estado.etapa = "cerrado";
      return estado;
    }

    estado = guardarHistorial(estado, texto, "REFERENCIA_ECONOMICA_NO_VALIDA");
    estado.etapa = "referenciaEconomica";
    return estado;
  }

  if (estado.etapa === "descripcionLibre") {
    if (esMalestar(texto)) {
      estado.requiereOperador = true;
      estado = guardarHistorial(estado, texto, "MALESTAR");
      estado.etapa = "descripcionLibre";
      return estado;
    }

    if (requiereOperador(texto)) {
      estado.requiereOperador = true;
      estado = guardarHistorial(estado, texto, "REQUIERE_OPERADOR");
      estado.etapa = "descripcionLibre";
      return estado;
    }

    estado.orientable = true;
    estado = guardarHistorial(estado, texto, "ORIENTABLE");
    estado.etapa = "orientable";
    return estado;
  }

  estado = guardarHistorial(estado, texto, "MENSAJE_REGISTRABLE");
  return estado;
}

function decidirSiguienteAccion(estado) {
  const categoria = estado?.ultimaAccionEstado || "APERTURA";

  if (categoria === "APERTURA") {
    return { respuesta: elegir("APERTURA", estado), accion: "APERTURA", derivar: false };
  }

  if (categoria === "TIPO_PROPIEDAD_NO_VALIDO") {
    return { respuesta: elegir("TIPO_PROPIEDAD_NO_VALIDO", estado), accion: "TIPO_PROPIEDAD_NO_VALIDO", derivar: false };
  }

  if (categoria === "TIPO_PROPIEDAD_FINAL") {
    return { respuesta: elegir("TIPO_PROPIEDAD_FINAL", estado), accion: "TIPO_PROPIEDAD_FINAL", derivar: false };
  }

  if (categoria === "PREGUNTAR_CONTINUIDAD" || categoria === "PREGUNTAR_INTENCION") {
    return { respuesta: elegir("PREGUNTAR_CONTINUIDAD", estado), accion: "PREGUNTAR_CONTINUIDAD", derivar: false };
  }

  if (categoria === "CONTINUIDAD_NO_VALIDO") {
    return { respuesta: elegir("CONTINUIDAD_NO_VALIDO", estado), accion: "CONTINUIDAD_NO_VALIDO", derivar: false };
  }

  if (categoria === "CONTINUIDAD_FINAL") {
    return { respuesta: elegir("CONTINUIDAD_FINAL", estado), accion: "CONTINUIDAD_FINAL", derivar: false };
  }

  if (categoria === "CONTINUIDAD_NO") {
    return { respuesta: elegir("CONTINUIDAD_NO", estado), accion: "CONTINUIDAD_NO", derivar: false };
  }

  if (categoria === "PREGUNTAR_REFERENCIA_ECONOMICA") {
    return { respuesta: elegir("PREGUNTAR_REFERENCIA_ECONOMICA", estado), accion: "PREGUNTAR_REFERENCIA_ECONOMICA", derivar: false };
  }

  if (categoria === "REFERENCIA_ECONOMICA_NO_VALIDA") {
    return { respuesta: elegir("REFERENCIA_ECONOMICA_NO_VALIDA", estado), accion: "REFERENCIA_ECONOMICA_NO_VALIDA", derivar: false };
  }

  if (categoria === "REFERENCIA_ECONOMICA_NO_VALIDA_SEGUNDO_INTENTO") {
    return { respuesta: elegir("REFERENCIA_ECONOMICA_NO_VALIDA_SEGUNDO_INTENTO", estado), accion: "REFERENCIA_ECONOMICA_NO_VALIDA_SEGUNDO_INTENTO", derivar: false };
  }

  if (categoria === "REFERENCIA_ECONOMICA_FINAL") {
    return { respuesta: elegir("REFERENCIA_ECONOMICA_FINAL", estado), accion: "REFERENCIA_ECONOMICA_FINAL", derivar: false };
  }

  if (categoria === "PEDIR_DESCRIPCION_LIBRE") {
    return { respuesta: elegir("PEDIR_DESCRIPCION_LIBRE", estado), accion: "PEDIR_DESCRIPCION_LIBRE", derivar: false };
  }

  if (categoria === "ORIENTABLE") {
    return { respuesta: elegir("ORIENTABLE", estado), accion: "ORIENTABLE", derivar: false };
  }

  if (categoria === "ACOMPANAMIENTO") {
    return { respuesta: elegir("ACOMPANAMIENTO", estado), accion: "ACOMPANAMIENTO", derivar: false };
  }

  if (categoria === "CONSULTA_ESTADO") {
    return { respuesta: elegir("CONSULTA_ESTADO", estado), accion: "CONSULTA_ESTADO", derivar: false };
  }

  if (categoria === "CORTESIA") {
    return { respuesta: elegir("CORTESIA", estado), accion: "CORTESIA", derivar: false };
  }

  if (categoria === "MALESTAR") {
    return { respuesta: elegir("MALESTAR", estado), accion: "MALESTAR", derivar: true };
  }

  if (categoria === "REQUIERE_OPERADOR") {
    return { respuesta: elegir("REQUIERE_OPERADOR", estado), accion: "REQUIERE_OPERADOR", derivar: true };
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
