const CAMPOS_OBLIGATORIOS = [
  'tipo_propiedad',
  'zona_o_criterio',
  'presupuesto',
  'dormitorios',
  'intencion'
];

function crearEstadoInicial() {
  return {
    estado_flujo: 'nuevo',
    leadData: {
      tipo_propiedad: null,
      zona_o_criterio: null,
      presupuesto: null,
      moneda_presupuesto: null,
      presupuesto_original: null,
      dormitorios: null,
      intencion: null,
      condiciones_clave: [],
      observaciones_extra: [],
      criterio_zona: null,
      punto_referencia: null,
      flexibilidad_zona: null
    },
    faltantes: [...CAMPOS_OBLIGATORIOS],
    ordenMinimoLogrado: false,
    derivar: false,
    coincidencias_presentadas: 0,
    validacion_externa: null,
    necesita_aclaracion: null,
    historial: []
  };
}

function normalizar(texto) {
  return String(texto || '').trim().toLowerCase();
}

function detectarTipo(texto) {
  const t = normalizar(texto);
  const tipos = [];

  if (/(departamento|depto|apartamento)/i.test(t)) tipos.push('departamento');
  if (/(casa|vivienda|chalet)/i.test(t)) tipos.push('casa');
  if (/(terreno|lote)/i.test(t)) tipos.push('terreno');

  if (tipos.length === 0) return null;
  if (tipos.length > 1) return tipos.join(' o ');
  return tipos[0];
}

function detectarMoneda(texto) {
  const t = normalizar(texto);

  if (/(dólares|dolares|usd|u\$s|us\$|dolar|dólar)/i.test(t)) return 'USD';
  if (/(pesos|ars|peso argentino)/i.test(t)) return 'ARS';

  return null;
}

function detectarPresupuesto(texto) {
  const t = normalizar(texto);

  if (/(\d+)\s*(dormitorios?|dorm|habitaciones?|hab|ambientes?)/i.test(t)) {
    return null;
  }

  const match = t.match(/(\d{1,3}(?:[.,]\d{3})+|\d+)(\s*k|\s*mil)?/i);
  if (!match) return null;

  let numero = match[1];
  let valor;

  if (/[.,]\d{3}/.test(numero)) {
    valor = parseInt(numero.replace(/[.,]/g, ''), 10);
  } else {
    valor = parseFloat(numero.replace(',', '.'));
  }

  if (isNaN(valor)) return null;

  if (match[2] && /(k|mil)/i.test(match[2])) {
    valor *= 1000;
  }

  if (valor < 1000 && /\bmil\b/i.test(t)) {
    valor *= 1000;
  }

  const moneda = detectarMoneda(texto);

  if (moneda === 'ARS') {
    return {
      presupuesto: null,
      moneda_presupuesto: 'ARS',
      presupuesto_original: String(Math.round(valor)),
      necesita_aclaracion: 'PRESUPUESTO_EN_PESOS'
    };
  }

  return {
    presupuesto: String(Math.round(valor)),
    moneda_presupuesto: moneda || 'DESCONOCIDA',
    presupuesto_original: String(Math.round(valor)),
    necesita_aclaracion: moneda ? null : 'MONEDA_NO_ESPECIFICADA'
  };
}

function detectarDormitorios(texto) {
  const t = normalizar(texto);

  const match = t.match(
    /(\d+)\s*(dormitorios?|dorm|habitaciones?|hab|ambientes?)/i
  );

  if (match) return match[1];

  if (/^\d+$/.test(t.trim())) {
    const n = parseInt(t.trim(), 10);
    if (n >= 0 && n <= 10) return String(n);
  }

  return null;
}

function detectarIntencion(texto) {
  const t = normalizar(texto);

  if (
    /(quiero avanzar|avanzar|quiero comprar|comprar ya|necesito comprar|necesito comprar ya|urgente|cuanto antes|listo|verla|visitar|señar)/i.test(t)
  ) {
    return 'ejecucion';
  }

  if (/(evaluando|comparando|viendo opciones|depende|analizando|todavía lo estoy pensando|todavia lo estoy pensando|lo estoy pensando)/i.test(t)) {
    return 'evaluacion';
  }

  if (
    /(solo viendo|estoy viendo|averiguando|sin apuro|más adelante|mas adelante)/i.test(t)
  ) {
    return 'exploracion';
  }

  return null;
}

function detectarPreguntaDelCliente(texto) {
  const t = normalizar(texto);

  if (/(qué zonas|que zonas|zonas disponibles|dónde tienen|donde tienen|qué hay disponible|que hay disponible)/i.test(t)) {
    return 'PREGUNTA_ZONAS_DISPONIBLES';
  }

  if (/(me llaman|se contactan conmigo|me contactan|ustedes llaman|cómo sigue|como sigue)/i.test(t)) {
    return 'PREGUNTA_PROCESO';
  }

  return null;
}

function detectarZonaOCriterio(texto) {
  const original = String(texto || '').trim();
  const t = normalizar(texto);

  if (!original) return null;

  if (detectarPreguntaDelCliente(texto)) return null;

  if (/(plaza|espacio verde|parque)/i.test(t)) {
    return {
      zona_o_criterio: 'espacios verdes cercanos',
      criterio_zona: 'espacios verdes',
      punto_referencia: null
    };
  }

  if (/(cerca de|cerca del|cerca a)/i.test(t)) {
    const ref = original
      .replace(/.*cerca (de|del|a)\s*/i, '')
      .trim();

    return {
      zona_o_criterio: `cerca de ${ref}`,
      criterio_zona: 'cercanía',
      punto_referencia: ref
    };
  }

  if (/(zona tranquila|tranquilo|periferia|centro|céntrico|centrico|zona sur|zona norte|zona este|zona oeste|costanera|ruta)/i.test(t)) {
    return {
      zona_o_criterio: original,
      criterio_zona: null,
      punto_referencia: null
    };
  }

  const ciudadesConocidas = [
    'posadas',
    'cordoba',
    'córdoba',
    'oberá',
    'obera',
    'alem',
    'leandro n alem',
    'garupá',
    'garupa',
    'candelaria'
  ];

  if (ciudadesConocidas.includes(t)) {
    return {
      zona_o_criterio: original,
      criterio_zona: null,
      punto_referencia: null
    };
  }

  const match = original.match(
    /(?:en|zona|barrio|por)\s+(.+?)(?:\s+hasta|\s+con|\s+\d|\s+y\s+quiero|$)/i
  );

  if (match && match[1]) {
    return {
      zona_o_criterio: match[1].trim(),
      criterio_zona: null,
      punto_referencia: null
    };
  }

  return null;
}

function detectarCondiciones(texto) {
  const t = normalizar(texto);
  const condiciones = [];

  if (/cochera|garage|garaje/i.test(t)) condiciones.push('cochera');
  if (/subterr[aá]nea|subterraneo|subterráneo/i.test(t)) condiciones.push('cochera subterranea');
  if (/perro|mascota/i.test(t)) condiciones.push('mascotas');
  if (/patio/i.test(t)) condiciones.push('patio');
  if (/seguridad|noche|oscuro/i.test(t)) condiciones.push('seguridad');
  if (/balc[oó]n/i.test(t)) condiciones.push('balcon');

  return condiciones;
}

function detectarObservacionExtra(texto, datosDetectados) {
  const t = normalizar(texto);

  if (!t) return null;

  const tieneCondiciones = datosDetectados.condiciones_clave?.length > 0;
  const tieneCampoPrincipal =
    datosDetectados.tipo_propiedad ||
    datosDetectados.zona_o_criterio ||
    datosDetectados.presupuesto ||
    datosDetectados.dormitorios ||
    datosDetectados.intencion;

  if (tieneCondiciones && !tieneCampoPrincipal) return texto;

  if (/(también|tambien|además|ademas|quiero|necesito|preferiría|preferiria|me gustaría|me gustaria)/i.test(t)) {
    return texto;
  }

  return null;
}

function detectarValidacionExterna(texto) {
  const t = normalizar(texto);

  return /(vi algo|encontr[eé]|me pasaron|me mostraron|vi un aviso|marketplace|zonaprop|publicaci[oó]n)/i.test(
    t
  );
}

function extraerDatos(mensaje, estado) {
  const datos = {};
  const faltanteActual = estado.faltantes?.[0];

  const preguntaCliente = detectarPreguntaDelCliente(mensaje);
  if (preguntaCliente) datos.pregunta_cliente = preguntaCliente;

  const tipo = detectarTipo(mensaje);
  if (tipo) datos.tipo_propiedad = tipo;

  const zona = detectarZonaOCriterio(mensaje);
  if (zona) Object.assign(datos, zona);

  const presupuestoDetectado = detectarPresupuesto(mensaje);
  if (presupuestoDetectado) {
    if (presupuestoDetectado.presupuesto) datos.presupuesto = presupuestoDetectado.presupuesto;
    datos.moneda_presupuesto = presupuestoDetectado.moneda_presupuesto;
    datos.presupuesto_original = presupuestoDetectado.presupuesto_original;
    if (presupuestoDetectado.necesita_aclaracion) {
      datos.necesita_aclaracion = presupuestoDetectado.necesita_aclaracion;
    }
  }

  const dormitorios = detectarDormitorios(mensaje);
  if (dormitorios) datos.dormitorios = dormitorios;

  const intencion = detectarIntencion(mensaje);
  if (intencion) datos.intencion = intencion;

  const condiciones = detectarCondiciones(mensaje);
  if (condiciones.length > 0) datos.condiciones_clave = condiciones;

  const observacionExtra = detectarObservacionExtra(mensaje, datos);
  if (observacionExtra) datos.observaciones_extra = [observacionExtra];

  if (faltanteActual && !datos[faltanteActual] && !datos.pregunta_cliente && !datos.necesita_aclaracion) {
    const hayOtrosDatos = Object.keys(datos).some(
      k => !['condiciones_clave', 'observaciones_extra'].includes(k)
    );

    if (!hayOtrosDatos) {
      if (faltanteActual === 'zona_o_criterio') {
        datos.zona_o_criterio = mensaje;
      } else if (faltanteActual === 'presupuesto') {
        const p = detectarPresupuesto(mensaje);
        if (p?.presupuesto) {
          datos.presupuesto = p.presupuesto;
          datos.moneda_presupuesto = p.moneda_presupuesto;
          datos.presupuesto_original = p.presupuesto_original;
        } else if (p?.necesita_aclaracion) {
          datos.necesita_aclaracion = p.necesita_aclaracion;
        }
      } else if (faltanteActual === 'dormitorios') {
        const dorm = detectarDormitorios(mensaje);
        if (dorm) datos.dormitorios = dorm;
      } else if (faltanteActual === 'intencion') {
        const i = detectarIntencion(mensaje);
        if (i) datos.intencion = i;
      }
    }
  }

  return datos;
}

function recalcularFaltantes(leadData) {
  return CAMPOS_OBLIGATORIOS.filter(campo => {
    return (
      leadData[campo] === null ||
      leadData[campo] === undefined ||
      leadData[campo] === ''
    );
  });
}

function calcularEstadoFlujo(leadData, faltantes) {
  if (faltantes.length > 0) return 'filtrando';
  if (leadData.intencion === 'exploracion') return 'orden_logrado_sin_derivar';
  if (leadData.intencion === 'evaluacion') return 'orden_logrado_evaluacion';
  return 'orden_logrado';
}

function actualizarEstado(mensaje, estadoActual) {
  const estado = estadoActual || crearEstadoInicial();

  if (detectarValidacionExterna(mensaje)) {
    return {
      ...estado,
      estado_flujo: 'validacion_externa',
      validacion_externa: {
        estado: 'pendiente',
        mensaje_original: mensaje
      },
      historial: [
        ...(estado.historial || []),
        {
          evento: 'validacion_externa_detectada',
          mensaje,
          fecha: new Date().toISOString()
        }
      ].slice(-30)
    };
  }

  const datos = extraerDatos(mensaje, estado);
  const leadData = { ...estado.leadData };

  for (const campo of Object.keys(datos)) {
    if (campo === 'condiciones_clave') {
      leadData.condiciones_clave = [
        ...new Set([
          ...(leadData.condiciones_clave || []),
          ...datos.condiciones_clave
        ])
      ];
    } else if (campo === 'observaciones_extra') {
      leadData.observaciones_extra = [
        ...new Set([
          ...(leadData.observaciones_extra || []),
          ...datos.observaciones_extra
        ])
      ];
    } else if (!['pregunta_cliente', 'necesita_aclaracion'].includes(campo)) {
      leadData[campo] = datos[campo];
    }
  }

  const faltantes = recalcularFaltantes(leadData);
  const ordenMinimoLogrado = faltantes.length === 0;
  const estado_flujo = calcularEstadoFlujo(leadData, faltantes);

  return {
    ...estado,
    leadData,
    faltantes,
    ordenMinimoLogrado,
    estado_flujo,
    derivar: estado_flujo === 'orden_logrado',
    necesita_aclaracion: datos.necesita_aclaracion || null,
    pregunta_cliente: datos.pregunta_cliente || null,
    historial: [
      ...(estado.historial || []),
      {
        evento: 'mensaje_procesado',
        mensaje,
        datos_detectados: datos,
        estado_flujo,
        fecha: new Date().toISOString()
      }
    ].slice(-30)
  };
}

function preguntaPorCampo(campo, estado) {
  const yaTieneHistorial = (estado.historial || []).length > 0;

  if (campo === 'tipo_propiedad' && !yaTieneHistorial) {
    return (
      'Hola, soy CasaLista.\n\n' +
      'Te voy a hacer unas preguntas cortas para ordenar tu búsqueda. ' +
      'Cuanto más clara sea tu respuesta, mejor puedo filtrar opciones que encajen.\n\n' +
      'Primero: ¿buscás casa, departamento o terreno?'
    );
  }

  const preguntas = {
    tipo_propiedad:
      '¿Buscás casa, departamento o terreno?',
    zona_o_criterio:
      '¿En qué zona te interesa o necesitás estar cerca de algo?',
    presupuesto:
      '¿Con qué presupuesto aproximado en dólares querés trabajar?',
    dormitorios:
      '¿Cuántos dormitorios necesitás?',
    intencion:
      '¿Querés avanzar si aparece algo que encaje o estás evaluando opciones?'
  };

  return preguntas[campo] || 'Necesito un dato más para ordenar la búsqueda.';
}

function decidirSiguienteAccion(estado) {
  if (estado.estado_flujo === 'validacion_externa') {
    return {
      respuesta: 'Pasámelo y lo revisamos antes de que avances.',
      accion: 'VALIDACION_EXTERNA',
      derivar: false
    };
  }

  if (estado.necesita_aclaracion === 'PRESUPUESTO_EN_PESOS') {
    return {
      respuesta:
        'Para ordenar bien la búsqueda, ¿me podés pasar ese presupuesto aproximado en dólares?',
      accion: 'ACLARAR_PRESUPUESTO_DOLARES',
      derivar: false
    };
  }

  if (estado.necesita_aclaracion === 'MONEDA_NO_ESPECIFICADA') {
    return {
      respuesta:
        '¿Ese presupuesto es en dólares? Para ordenar bien la búsqueda necesito tomarlo en USD.',
      accion: 'ACLARAR_MONEDA_PRESUPUESTO',
      derivar: false
    };
  }

  if (estado.pregunta_cliente === 'PREGUNTA_ZONAS_DISPONIBLES') {
    return {
      respuesta:
        'Primero ordenamos tu búsqueda y después vemos qué zonas pueden encajar. ¿Preferís centro, periferia, zona tranquila o estar cerca de algún punto?',
      accion: 'RESPONDER_PREGUNTA_ZONA_Y_REPREGUNTAR',
      derivar: false
    };
  }

  if (estado.pregunta_cliente === 'PREGUNTA_PROCESO') {
    return {
      respuesta:
        'Primero ordeno tu búsqueda con unos datos básicos. Después, si encaja, se puede avanzar con el contacto correspondiente. Sigamos: ' +
        preguntaPorCampo(estado.faltantes[0], estado),
      accion: 'RESPONDER_PROCESO_Y_REPREGUNTAR',
      derivar: false
    };
  }

  if (!estado.ordenMinimoLogrado) {
    const campo = estado.faltantes[0];

    return {
      respuesta: preguntaPorCampo(campo, estado),
      accion: 'PREGUNTAR_FALTANTE',
      derivar: false
    };
  }

  if (estado.estado_flujo === 'orden_logrado_sin_derivar') {
    return {
      respuesta:
        'Perfecto, la búsqueda queda clara. La dejamos ordenada para cuando quieras avanzar.',
      accion: 'ORDEN_LOGRADO_SIN_DERIVAR',
      derivar: false
    };
  }

  if (estado.estado_flujo === 'orden_logrado_evaluacion') {
    return {
      respuesta:
        'Perfecto, la búsqueda queda clara. Seguimos filtrando para que aparezca algo que realmente encaje.',
      accion: 'ORDEN_LOGRADO_EVALUACION',
      derivar: false
    };
  }

  return {
    respuesta: 'Perfecto, la búsqueda queda clara y lista para activar.',
    accion: 'ORDEN_LOGRADO',
    derivar: true
  };
}

module.exports = {
  crearEstadoInicial,
  actualizarEstado,
  decidirSiguienteAccion
};
