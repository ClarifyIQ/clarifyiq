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
cantidad_ambientes: null,
es_monoambiente: false,
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
    pregunta_cliente: null,
    accion_post_cierre: null,
    historial_cambios: [],
    historial: []
  };
}

function normalizar(texto) {
  return String(texto || '').trim().toLowerCase();
}

function detectarTipo(texto) {
  const t = normalizar(texto);

  if (/mono\s*ambiente|monoambiente/i.test(t)) {
    return 'departamento';
  }

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

  if (
    /(\d+)\s*(dormitorios?|dorm|habitaciones?|hab|ambientes?)/i.test(t) ||
    /(dormitorios?|dorm|habitaciones?|hab|ambientes?)\s*(\d+)/i.test(t)
  ) {
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

  const numerosTexto = {
    un: '1',
    uno: '1',
    una: '1',
    dos: '2',
    tres: '3',
    cuatro: '4',
    cinco: '5',
    seis: '6',
    siete: '7',
    ocho: '8'
  };

  const sinonimosDormitorio =
    '(dormitorios?|dorm|habitaciones?|hab|cuartos?|rec[aá]maras?|piezas?)';

  let match = t.match(
    new RegExp(`(\\d+)\\s*${sinonimosDormitorio}|${sinonimosDormitorio}\\s*(\\d+)`, 'i')
  );

  if (match) {
    return match[1] || match[3];
  }

  for (const [textoNumero, valor] of Object.entries(numerosTexto)) {
    const regex = new RegExp(
      `\\b${textoNumero}\\b\\s*${sinonimosDormitorio}|${sinonimosDormitorio}\\s*\\b${textoNumero}\\b`,
      'i'
    );

    if (regex.test(t)) {
      return valor;
    }
  }

  if (/^\d+$/.test(t.trim())) {
    const n = parseInt(t.trim(), 10);
    if (n >= 0 && n <= 10) return String(n);
  }

  return null;
}
function detectarIntencion(texto) {
  const t = normalizar(texto);

  if (
    /^(sí|si|dale|ok|okay)$/i.test(t) ||
    /(me interesaría verlo|me interesaria verlo|quiero verlo|me gustaría verlo|me gustaria verlo|avisame|avísame|me sirve|lo quiero ver|verlo|quiero avanzar|avanzar|quiero comprar|comprar ya|necesito comprar|necesito comprar ya|urgente|cuanto antes|listo|visitar|señar)/i.test(t)
  ) {
    return 'ejecucion';
  }

  if (/(evaluando|comparando|viendo opciones|depende|analizando|todavía lo estoy pensando|todavia lo estoy pensando|lo estoy pensando|juntando información|juntando informacion|estoy juntando información|estoy juntando informacion)/i.test(t)) {
    return 'evaluacion';
  }

  if (
    /(solo viendo|estoy viendo|averiguando|estoy averiguando|por ahora averiguo|sin apuro|más adelante|mas adelante)/i.test(t)
  ) {
    return 'exploracion';
  }

  return null;
}

function detectarPreguntaDelCliente(texto) {
  const t = normalizar(texto);

  if (/(cómo va|como va|cómo viene|como viene|novedades|noticias|alguna novedad|alguna noticia|encontraron algo|encontraste algo|apareció algo|aparecio algo|apareció alguna|aparecio alguna|hay algo|hay alguna propiedad|hay alguna opción|hay alguna opcion|encontraron propiedad|encontraron alguna propiedad|sigue activa|estado de la búsqueda|estado de la busqueda|tuvieron suerte)/i.test(t)) {
    return 'CONSULTA_ESTADO_BUSQUEDA';
  }

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

  const cambioZona = original.match(/mejor\s+(.+?)\s+que\s+(.+)/i);
  if (cambioZona && cambioZona[1]) {
    return {
      zona_o_criterio: cambioZona[1].trim(),
      criterio_zona: null,
      punto_referencia: null
    };
  }

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
    'candelaria',
    'nueva cordoba',
    'nueva córdoba'
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
  if (/terraza/i.test(t)) condiciones.push('terraza');
  if (/cocina integrada/i.test(t)) condiciones.push('cocina integrada');
  if (/no quiero duplex|no quiero dúplex|no duplex|no dúplex|que no sea duplex|que no sea dúplex/i.test(t)) condiciones.push('no duplex');
  if (/techo de chapa|sin chapa|que no sea de chapa/i.test(t)) condiciones.push('sin techo de chapa');

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
    datosDetectados.dormitorios;

  if (datosDetectados.intencion) return null;
  if (tieneCondiciones && !tieneCampoPrincipal) return texto;

  if (/(también|tambien|además|ademas|quiero|necesito|preferiría|preferiria|me gustaría|me gustaria|mejor|no quiero|evitar|importante)/i.test(t)) {
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

function crearCambio(campo, anterior, nuevo) {
  return {
    campo,
    anterior: anterior ?? null,
    nuevo: nuevo ?? null,
    fecha: new Date().toISOString()
  };
}

function extraerDatos(mensaje, estado) {
  const datos = {};
  const faltanteActual = estado.faltantes?.[0];

  const preguntaCliente = detectarPreguntaDelCliente(mensaje);
  if (preguntaCliente) datos.pregunta_cliente = preguntaCliente;

  const tipo = detectarTipo(mensaje);
  if (tipo) datos.tipo_propiedad = tipo;
  if (/mono\s*ambiente|monoambiente/i.test(normalizar(mensaje))) {
    datos.tipo_propiedad = 'departamento';
    datos.cantidad_ambientes = '1';
    datos.es_monoambiente = true;
    datos.dormitorios = '0';
  }

  const ambienteMatch = normalizar(mensaje).match(/(\d+)\s*ambientes?/i);
  if (ambienteMatch && !datos.es_monoambiente) {
    datos.cantidad_ambientes = ambienteMatch[1];
  }
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

function actualizarEstadoPostCierre(mensaje, estado) {
  const datos = extraerDatos(mensaje, estado);
  const leadData = { ...estado.leadData };
  const cambios = [];

  if (datos.pregunta_cliente === 'CONSULTA_ESTADO_BUSQUEDA') {
    return {
      ...estado,
      accion_post_cierre: 'CONSULTA_ESTADO_BUSQUEDA',
      pregunta_cliente: datos.pregunta_cliente,
      historial: [
        ...(estado.historial || []),
        {
          evento: 'post_cierre_consulta_estado',
          mensaje,
          datos_detectados: datos,
          estado_flujo: estado.estado_flujo,
          fecha: new Date().toISOString()
        }
      ].slice(-30)
    };
  }

  if (datos.necesita_aclaracion) {
    return {
      ...estado,
      necesita_aclaracion: datos.necesita_aclaracion,
      accion_post_cierre: 'ACLARACION_REQUERIDA',
      historial: [
        ...(estado.historial || []),
        {
          evento: 'post_cierre_aclaracion_requerida',
          mensaje,
          datos_detectados: datos,
          estado_flujo: estado.estado_flujo,
          fecha: new Date().toISOString()
        }
      ].slice(-30)
    };
  }

  if (datos.presupuesto) {
    cambios.push(crearCambio('presupuesto', leadData.presupuesto, datos.presupuesto));
    leadData.presupuesto = datos.presupuesto;
    leadData.moneda_presupuesto = datos.moneda_presupuesto || leadData.moneda_presupuesto;
    leadData.presupuesto_original = datos.presupuesto_original || datos.presupuesto;
  }

  if (datos.zona_o_criterio) {
    cambios.push(crearCambio('zona_o_criterio', leadData.zona_o_criterio, datos.zona_o_criterio));
    leadData.zona_o_criterio = datos.zona_o_criterio;
    leadData.criterio_zona = datos.criterio_zona ?? leadData.criterio_zona;
    leadData.punto_referencia = datos.punto_referencia ?? leadData.punto_referencia;
  }

  if (datos.condiciones_clave) {
    leadData.condiciones_clave = [
      ...new Set([
        ...(leadData.condiciones_clave || []),
        ...datos.condiciones_clave
      ])
    ];
  }

  if (datos.observaciones_extra) {
    leadData.observaciones_extra = [
      ...new Set([
        ...(leadData.observaciones_extra || []),
        ...datos.observaciones_extra
      ])
    ];
  }

  const huboCambioDato = cambios.length > 0;
  const huboCriterio =
    (datos.condiciones_clave && datos.condiciones_clave.length > 0) ||
    (datos.observaciones_extra && datos.observaciones_extra.length > 0);

  let accion_post_cierre = 'ACLARACION_GUARDADA';

  if (huboCambioDato && huboCriterio) {
    accion_post_cierre = 'DATO_Y_CRITERIO_ACTUALIZADO';
  } else if (huboCambioDato) {
    accion_post_cierre = 'DATO_ACTUALIZADO';
  } else if (huboCriterio) {
    accion_post_cierre = 'CRITERIO_GUARDADO';
  } else {
    leadData.observaciones_extra = [
      ...new Set([
        ...(leadData.observaciones_extra || []),
        mensaje
      ])
    ];
  }

  return {
    ...estado,
    leadData,
    accion_post_cierre,
    necesita_aclaracion: null,
    pregunta_cliente: null,
    historial_cambios: [
      ...(estado.historial_cambios || []),
      ...cambios
    ].slice(-50),
    historial: [
      ...(estado.historial || []),
      {
        evento: 'post_cierre_mensaje_procesado',
        mensaje,
        datos_detectados: datos,
        accion_post_cierre,
        estado_flujo: estado.estado_flujo,
        fecha: new Date().toISOString()
      }
    ].slice(-30)
  };
}

function actualizarEstado(mensaje, estadoActual) {
  const estado = estadoActual || crearEstadoInicial();

  if (
    estado.ordenMinimoLogrado &&
    ['orden_logrado', 'orden_logrado_evaluacion', 'orden_logrado_sin_derivar'].includes(estado.estado_flujo)
  ) {
    return actualizarEstadoPostCierre(mensaje, estado);
  }

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
    accion_post_cierre: null,
    historial_cambios: estado.historial_cambios || [],
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
  const yaTieneHistorial = (estado.historial || []).length > 1;

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
      'Si aparece algo que encaje con tu búsqueda, ¿te interesaría verlo o todavía estás juntando información?'
  };

  return preguntas[campo] || 'Necesito un dato más para ordenar la búsqueda.';
}

function respuestaCierreOrdenLogrado() {
  return (
    'Perfecto.\n\n' +
    'La búsqueda quedó ordenada y lista para trabajar.\n\n' +
    'Si recordás algún detalle importante que te gustaría conseguir o evitar en la propiedad, podés escribirlo cuando quieras y lo incorporamos a la búsqueda.\n\n' +
    'Si encontramos opciones que encajen con estos criterios, nos pondremos en contacto con vos.'
  );
}

function decidirSiguienteAccion(estado) {
  if (estado.accion_post_cierre === 'CONSULTA_ESTADO_BUSQUEDA') {
    return {
      respuesta:
        'Seguimos trabajando sobre la búsqueda.\n\n' +
        'Por el momento no apareció una opción que justifique contactarte, pero si encontramos algo que realmente encaje con tus criterios nos pondremos en contacto con vos.',
      accion: 'CONSULTA_ESTADO_BUSQUEDA',
      derivar: false
    };
  }

  if (estado.accion_post_cierre === 'DATO_Y_CRITERIO_ACTUALIZADO') {
    return {
      respuesta:
        'Perfecto, actualicé la información de tu búsqueda y registré los nuevos criterios.',
      accion: 'DATO_Y_CRITERIO_ACTUALIZADO',
      derivar: true
    };
  }

  if (estado.accion_post_cierre === 'DATO_ACTUALIZADO') {
    return {
      respuesta:
        'Perfecto, actualicé la información de tu búsqueda.',
      accion: 'DATO_ACTUALIZADO',
      derivar: true
    };
  }

  if (estado.accion_post_cierre === 'CRITERIO_GUARDADO') {
    return {
      respuesta:
        'Perfecto, incorporé ese criterio a tu búsqueda.',
      accion: 'CRITERIO_GUARDADO',
      derivar: true
    };
  }

  if (estado.accion_post_cierre === 'ACLARACION_GUARDADA') {
    return {
      respuesta:
        'Perfecto, dejé registrada tu aclaración en la búsqueda.',
      accion: 'ACLARACION_GUARDADA',
      derivar: true
    };
  }

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
      respuesta: respuestaCierreOrdenLogrado(),
      accion: 'ORDEN_LOGRADO_SIN_DERIVAR',
      derivar: false
    };
  }

  if (estado.estado_flujo === 'orden_logrado_evaluacion') {
    return {
      respuesta: respuestaCierreOrdenLogrado(),
      accion: 'ORDEN_LOGRADO_EVALUACION',
      derivar: false
    };
  }

  return {
    respuesta: respuestaCierreOrdenLogrado(),
    accion: 'ORDEN_LOGRADO',
    derivar: true
  };
}

module.exports = {
  crearEstadoInicial,
  actualizarEstado,
  decidirSiguienteAccion
};
