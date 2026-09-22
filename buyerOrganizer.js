const axios = require('axios');

const ORGANIZER_CATEGORIES = new Set([
  'PREGUNTAR_NOMBRE',
  'ACOMPANAMIENTO',
  'SEGUIMIENTO_PRIORITARIO'
]);

const MONEY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['monto', 'moneda', 'textoOriginal'],
  properties: {
    monto: { type: ['number', 'null'] },
    moneda: { type: 'string', enum: ['ARS', 'USD', 'UNKNOWN'] },
    textoOriginal: { type: ['string', 'null'] }
  }
};

const ORGANIZATION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'tipoPropiedad',
    'zonas',
    'presupuestoMaximo',
    'dineroDisponible',
    'financiacion',
    'dormitorios',
    'caracteristicas',
    'urgencia',
    'fechaLimite',
    'situacionFamiliar',
    'necesidadesEspeciales',
    'cosasAEvitar',
    'pendientesDeRevision',
    'cambiosDetectados'
  ],
  properties: {
    tipoPropiedad: {
      type: 'object',
      additionalProperties: false,
      required: ['valor', 'certeza', 'textoOriginal'],
      properties: {
        valor: { type: ['string', 'null'] },
        certeza: { type: 'string', enum: ['confirmado', 'inferido', 'desconocido'] },
        textoOriginal: { type: ['string', 'null'] }
      }
    },
    zonas: {
      type: 'object',
      additionalProperties: false,
      required: ['principal', 'alternativas', 'textoOriginal'],
      properties: {
        principal: { type: ['string', 'null'] },
        alternativas: { type: 'array', items: { type: 'string' } },
        textoOriginal: { type: ['string', 'null'] }
      }
    },
    presupuestoMaximo: MONEY_SCHEMA,
    dineroDisponible: MONEY_SCHEMA,
    financiacion: {
      type: 'object',
      additionalProperties: false,
      required: ['estado', 'tipo', 'monto', 'moneda', 'textoOriginal'],
      properties: {
        estado: { type: 'string', enum: ['si', 'no', 'desconocido'] },
        tipo: { type: ['string', 'null'] },
        monto: { type: ['number', 'null'] },
        moneda: { type: 'string', enum: ['ARS', 'USD', 'UNKNOWN'] },
        textoOriginal: { type: ['string', 'null'] }
      }
    },
    dormitorios: {
      type: 'object',
      additionalProperties: false,
      required: ['cantidad', 'textoOriginal'],
      properties: {
        cantidad: { type: ['number', 'null'] },
        textoOriginal: { type: ['string', 'null'] }
      }
    },
    caracteristicas: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['nombre', 'clasificacion', 'textoOriginal'],
        properties: {
          nombre: { type: 'string' },
          clasificacion: {
            type: 'string',
            enum: ['indispensable', 'preferido', 'flexible', 'sin_clasificar']
          },
          textoOriginal: { type: 'string' }
        }
      }
    },
    urgencia: {
      type: 'object',
      additionalProperties: false,
      required: ['nivel', 'textoOriginal'],
      properties: {
        nivel: { type: 'string', enum: ['alta', 'media', 'baja', 'desconocida'] },
        textoOriginal: { type: ['string', 'null'] }
      }
    },
    fechaLimite: {
      type: 'object',
      additionalProperties: false,
      required: ['texto', 'fechaNormalizada', 'precision'],
      properties: {
        texto: { type: ['string', 'null'] },
        fechaNormalizada: { type: ['string', 'null'] },
        precision: { type: 'string', enum: ['exacta', 'aproximada', 'desconocida'] }
      }
    },
    situacionFamiliar: { type: 'array', items: { type: 'string' } },
    necesidadesEspeciales: { type: 'array', items: { type: 'string' } },
    cosasAEvitar: { type: 'array', items: { type: 'string' } },
    pendientesDeRevision: { type: 'array', items: { type: 'string' } },
    cambiosDetectados: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['campo', 'tipoCambio', 'valorAnterior', 'valorNuevo', 'evidencia'],
        properties: {
          campo: { type: 'string' },
          tipoCambio: { type: 'string', enum: ['nuevo', 'actualizacion', 'contradiccion'] },
          valorAnterior: { type: ['string', 'number', 'boolean', 'null'] },
          valorNuevo: { type: ['string', 'number', 'boolean', 'null'] },
          evidencia: { type: 'string' }
        }
      }
    }
  }
};

const SYSTEM_PROMPT = [
  'Sos el organizador interno de CasaLista. No respondés al comprador.',
  'Extraé únicamente datos expresados o claramente implicados por el comprador.',
  'No conviertas toda cifra en presupuesto: presupuesto máximo, dinero disponible y financiación son campos distintos.',
  'No inventes moneda. Usá UNKNOWN si el texto no permite distinguir ARS de USD.',
  'No clasifiques una característica como indispensable, preferida o flexible sin evidencia explícita.',
  'Compará con la organización anterior y conservá cambios o contradicciones en cambiosDetectados.',
  'Una corrección explícita puede cambiar el valor actual; una frase ambigua debe ir a pendientesDeRevision.',
  'Las fechas normalizadas usan YYYY-MM-DD. Si no es posible normalizarlas, devolvé null.'
].join('\n');

function ultimoEventoOrganizable(estado) {
  const historial = Array.isArray(estado?.historial) ? estado.historial : [];
  return [...historial].reverse().find(evento => ORGANIZER_CATEGORIES.has(evento?.categoria)) || null;
}

function debeOrganizar(estado) {
  if (!estado?.orientable) return false;
  const historial = Array.isArray(estado.historial) ? estado.historial : [];
  const ultimo = historial[historial.length - 1];
  return Boolean(ultimo && ORGANIZER_CATEGORIES.has(ultimo.categoria));
}

function extraerTextoRespuesta(data) {
  if (typeof data?.output_text === 'string') return data.output_text;

  for (const item of data?.output || []) {
    for (const contenido of item?.content || []) {
      if (typeof contenido?.text === 'string') return contenido.text;
      if (contenido?.json && typeof contenido.json === 'object') {
        return JSON.stringify(contenido.json);
      }
    }
  }

  return '';
}

function validarOrganizacion(valor) {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) {
    throw new Error('OpenAI no devolvió una organización válida');
  }

  const campos = [
    'tipoPropiedad', 'zonas', 'presupuestoMaximo', 'dineroDisponible',
    'financiacion', 'dormitorios', 'caracteristicas', 'urgencia',
    'fechaLimite', 'situacionFamiliar', 'necesidadesEspeciales',
    'cosasAEvitar', 'pendientesDeRevision', 'cambiosDetectados'
  ];

  for (const campo of campos) {
    if (!Object.prototype.hasOwnProperty.call(valor, campo)) {
      throw new Error(`Falta el campo estructurado ${campo}`);
    }
  }

  return valor;
}

function normalizarCampo(campo) {
  return String(campo || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
}

function tieneDatoEconomico(campo, valor) {
  if (!valor || typeof valor !== 'object') return false;
  if (campo === 'financiacion') {
    return valor.estado === 'si' || valor.estado === 'no' ||
      Number.isFinite(valor.monto) || Boolean(valor.tipo);
  }
  return Number.isFinite(valor.monto);
}

function valorEconomico(campo, valor) {
  if (campo === 'financiacion') {
    return {
      estado: valor?.estado,
      tipo: valor?.tipo,
      monto: valor?.monto,
      moneda: valor?.moneda
    };
  }
  return { monto: valor?.monto, moneda: valor?.moneda };
}

function protegerDatosEconomicosConfirmados(organizacion, anterior) {
  if (!anterior || typeof anterior !== 'object') return organizacion;

  const protegida = { ...organizacion };
  const cambios = Array.isArray(organizacion.cambiosDetectados)
    ? organizacion.cambiosDetectados
    : [];
  const pendientes = Array.isArray(organizacion.pendientesDeRevision)
    ? [...organizacion.pendientesDeRevision]
    : [];

  for (const campo of ['presupuestoMaximo', 'dineroDisponible', 'financiacion']) {
    const previo = anterior[campo];
    const nuevo = organizacion[campo];
    if (!tieneDatoEconomico(campo, previo)) continue;
    if (JSON.stringify(valorEconomico(campo, previo)) ===
      JSON.stringify(valorEconomico(campo, nuevo))) continue;

    const cambio = cambios.find(item => normalizarCampo(item?.campo) === normalizarCampo(campo));
    const actualizacionExplicita = cambio?.tipoCambio === 'actualizacion';

    if (!actualizacionExplicita) {
      protegida[campo] = previo;
      const aviso = `Revisar ${campo}: el mensaje nuevo es ambiguo o contradice el dato confirmado.`;
      if (!pendientes.includes(aviso)) pendientes.push(aviso);
    }
  }

  protegida.pendientesDeRevision = pendientes;
  return protegida;
}

function crearOrganizadorComprador({ env = process.env, http = axios } = {}) {
  const enabled = env.BUYER_ORGANIZER_ENABLED === 'true';
  const apiKey = String(env.OPENAI_API_KEY || '').trim();
  const model = String(env.OPENAI_ORGANIZER_MODEL || '').trim();

  function estaConfigurado() {
    return Boolean(enabled && apiKey && model);
  }

  async function organizar({ telefono, nombre, estado, organizacionAnterior = null }) {
    if (!estaConfigurado()) {
      return { enabled: false, organized: false };
    }

    const eventoFinal = ultimoEventoOrganizable(estado);
    const entrada = {
      fechaActual: new Date().toISOString(),
      historialComprador: Array.isArray(estado?.historial)
        ? estado.historial.filter(evento => ![
            'NOMBRE_CONFIRMADO',
            'NOMBRE_NO_VALIDO'
          ].includes(evento?.categoria))
        : [],
      organizacionAnterior
    };

    const respuesta = await http.post(
      'https://api.openai.com/v1/responses',
      {
        model,
        input: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: JSON.stringify(entrada) }
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'casalista_buyer_search',
            strict: true,
            schema: ORGANIZATION_SCHEMA
          }
        }
      },
      {
        timeout: 20000,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const texto = extraerTextoRespuesta(respuesta?.data);
    if (!texto) throw new Error('OpenAI no devolvió contenido estructurado');

    const organizacionValidada = validarOrganizacion(JSON.parse(texto));
    const organizacion = protegerDatosEconomicosConfirmados(
      organizacionValidada,
      organizacionAnterior
    );
    return {
      enabled: true,
      organized: true,
      organizacion,
      sourceUntil: eventoFinal?.fecha || null
    };
  }

  return { estaConfigurado, organizar };
}

module.exports = {
  ORGANIZATION_SCHEMA,
  crearOrganizadorComprador,
  debeOrganizar,
  extraerTextoRespuesta,
  protegerDatosEconomicosConfirmados,
  validarOrganizacion
};
