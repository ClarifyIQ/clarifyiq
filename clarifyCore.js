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
      dormitorios: null,
      intencion: null,
      condiciones_clave: [],
      criterio_zona: null,
      punto_referencia: null,
      flexibilidad_zona: null
    },
    faltantes: [...CAMPOS_OBLIGATORIOS],
    ordenMinimoLogrado: false,
    derivar: false,
    coincidencias_presentadas: 0,
    validacion_externa: null,
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

function detectarPresupuesto(texto) {
  const t = normalizar(texto);

  if (/(\d+)\s*(dormitorios?|dorm|habitaciones?|hab|ambientes?)/i.test(t)) {
    return null;
  }

  const match = t.match(/(\d+(?:[.,]\d+)?)(\s*k|\s*mil)?/i);
  if (!match) return null;

  let valor = parseFloat(match[1].replace(',', '.'));
  if (isNaN(valor)) return null;

  if (match[2] && /(k|mil)/i.test(match[2])) valor *= 1000;
  if (valor < 1000 && /mil/i.test(t)) valor *= 1000;

  return String(Math.round(valor));
}

function detectarDormitorios(texto) {
  const t = normalizar(texto);

  const match = t.match(
    /(\d+)\s*(dormitorios?|dorm|habitaciones?|hab|ambientes?)/i
  );

  if (match) return match[1];

  if (/^\d+$/.test(t.trim())) {
    return t.trim();
  }

  return null;
}

function detectarIntencion(texto) {
  const t = normalizar(texto);

  if (
    /(quiero avanzar|avanzar|quiero comprar|listo|cuanto antes|verla|visitar|señar)/i.test(
      t
    )
  ) {
    return 'ejecucion';
  }

  if (/(evaluando|comparando|viendo opciones|depende|analizando)/i.test(t)) {
    return 'evaluacion';
  }

  if (
    /(solo viendo|estoy viendo|averiguando|sin apuro|más adelante|mas adelante)/i.test(
      t
    )
  ) {
    return 'exploracion';
  }

  return null;
}

function detectarZonaOCriterio(texto) {
  const original = String(texto || '').trim();
  const t = normalizar(texto);

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
  if (/perro|mascota/i.test(t)) condiciones.push('mascotas');
  if (/patio/i.test(t)) condiciones.push('patio');
  if (/seguridad|noche|oscuro/i.test(t)) condiciones.push('seguridad');
  if (/balc[oó]n/i.test(t)) condiciones.push('balcon');

  return condiciones;
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

  const tipo = detectarTipo(mensaje);
  if (tipo) datos.tipo_propiedad = tipo;

  const zona = detectarZonaOCriterio(mensaje);
  if (zona) Object.assign(datos, zona);

  const presupuesto = detectarPresupuesto(mensaje);
  if (presupuesto) datos.presupuesto = presupuesto;

  const dormitorios = detectarDormitorios(mensaje);
  if (dormitorios) datos.dormitorios = dormitorios;

  const intencion = detectarIntencion(mensaje);
  if (intencion) datos.intencion = intencion;

  const condiciones = detectarCondiciones(mensaje);
  if (condiciones.length > 0) datos.condiciones_clave = condiciones;

  if (faltanteActual && !datos[faltanteActual]) {
    const hayOtrosDatos = Object.keys(datos).some(
      k => k !== 'condiciones_clave'
    );

    if (!hayOtrosDatos) {
      if (faltanteActual === 'zona_o_criterio') {
        datos.zona_o_criterio = mensaje;
      } else if (faltanteActual === 'presupuesto') {
        datos.presupuesto = mensaje;
      } else if (faltanteActual === 'dormitorios') {
        datos.dormitorios = mensaje;
      } else if (faltanteActual === 'intencion') {
        datos.intencion = detectarIntencion(mensaje) || mensaje;
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
    } else {
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

function preguntaPorCampo(campo) {
  const preguntas = {
    tipo_propiedad:
      'Para activar la búsqueda:\n\n¿Buscás casa, departamento o terreno?',
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

function decidirSiguienteAccion(estado) {
  if (estado.estado_flujo === 'validacion_externa') {
    return {
      respuesta: 'Pasámelo y lo revisamos antes de que avances.',
      accion: 'VALIDACION_EXTERNA',
      derivar: false
    };
  }

  if (!estado.ordenMinimoLogrado) {
    const campo = estado.faltantes[0];

    return {
      respuesta: preguntaPorCampo(campo),
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