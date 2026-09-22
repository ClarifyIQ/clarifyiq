const test = require('node:test');
const assert = require('node:assert/strict');

const {
  crearOrganizadorComprador,
  debeOrganizar,
  protegerDatosEconomicosConfirmados,
  validarOrganizacion
} = require('../buyerOrganizer');

function organizacionValida() {
  return {
    tipoPropiedad: { valor: 'Casa', certeza: 'confirmado', textoOriginal: 'Busco una casa' },
    zonas: { principal: null, alternativas: [], textoOriginal: null },
    presupuestoMaximo: { monto: 75000000, moneda: 'ARS', textoOriginal: 'Presupuesto 75000000' },
    dineroDisponible: { monto: 60000000, moneda: 'ARS', textoOriginal: 'Tengo 60000000' },
    financiacion: {
      estado: 'desconocido', tipo: null, monto: null, moneda: 'UNKNOWN', textoOriginal: null
    },
    dormitorios: { cantidad: null, textoOriginal: null },
    caracteristicas: [
      { nombre: 'pileta', clasificacion: 'sin_clasificar', textoOriginal: 'Quiero pileta' }
    ],
    urgencia: { nivel: 'alta', textoOriginal: 'Estoy apurada' },
    fechaLimite: {
      texto: 'Antes de fin de año', fechaNormalizada: '2026-12-31', precision: 'aproximada'
    },
    situacionFamiliar: [],
    necesidadesEspeciales: [],
    cosasAEvitar: [],
    pendientesDeRevision: [],
    cambiosDetectados: []
  };
}

test('queda desactivado por defecto y no llama a OpenAI', async () => {
  let llamadas = 0;
  const organizer = crearOrganizadorComprador({
    env: {},
    http: { post: async () => { llamadas += 1; } }
  });

  const resultado = await organizer.organizar({ estado: { historial: [] } });

  assert.equal(organizer.estaConfigurado(), false);
  assert.deepEqual(resultado, { enabled: false, organized: false });
  assert.equal(llamadas, 0);
});

test('solo organiza categorías útiles de una búsqueda orientable', () => {
  assert.equal(debeOrganizar({
    orientable: true,
    historial: [{ categoria: 'ACOMPANAMIENTO' }]
  }), true);
  assert.equal(debeOrganizar({
    orientable: true,
    historial: [{ categoria: 'CORTESIA' }]
  }), false);
  assert.equal(debeOrganizar({
    orientable: false,
    historial: [{ categoria: 'ACOMPANAMIENTO' }]
  }), false);
});

test('solicita JSON estricto y mantiene separados los datos económicos', async () => {
  const llamadas = [];
  const organizacion = organizacionValida();
  const organizer = crearOrganizadorComprador({
    env: {
      BUYER_ORGANIZER_ENABLED: 'true',
      OPENAI_API_KEY: 'clave-prueba',
      OPENAI_ORGANIZER_MODEL: 'modelo-prueba'
    },
    http: {
      post: async (...args) => {
        llamadas.push(args);
        return { data: { output_text: JSON.stringify(organizacion) } };
      }
    }
  });

  const resultado = await organizer.organizar({
    telefono: '5491',
    nombre: 'Rosa',
    estado: {
      orientable: true,
      historial: [
        { fecha: '2026-09-21T18:00:00.000Z', categoria: 'PREGUNTAR_NOMBRE', mensajeOriginal: 'Casa' },
        { fecha: '2026-09-21T18:05:00.000Z', categoria: 'ACOMPANAMIENTO', mensajeOriginal: 'Tengo 60000000' }
      ]
    },
    organizacionAnterior: null
  });

  assert.equal(resultado.organized, true);
  assert.equal(resultado.organizacion.presupuestoMaximo.monto, 75000000);
  assert.equal(resultado.organizacion.dineroDisponible.monto, 60000000);
  assert.equal(resultado.sourceUntil, '2026-09-21T18:05:00.000Z');
  assert.equal(llamadas[0][0], 'https://api.openai.com/v1/responses');
  assert.equal(llamadas[0][1].text.format.type, 'json_schema');
  assert.equal(llamadas[0][1].text.format.strict, true);
  assert.equal(llamadas[0][1].input[1].content.includes('5491'), false);
  assert.equal(llamadas[0][1].input[1].content.includes('Rosa'), false);
});

test('rechaza una respuesta incompleta aunque sea JSON válido', () => {
  assert.throws(
    () => validarOrganizacion({ tipoPropiedad: {} }),
    /Falta el campo estructurado/
  );
});

test('caso Doña Rosa separa presupuesto, efectivo y financiación', () => {
  const organizacion = organizacionValida();
  organizacion.financiacion = {
    estado: 'si',
    tipo: 'crédito hipotecario',
    monto: 15000000,
    moneda: 'ARS',
    textoOriginal: 'Los 15 millones restantes serían con crédito'
  };

  const validada = validarOrganizacion(organizacion);

  assert.equal(validada.presupuestoMaximo.monto, 75000000);
  assert.equal(validada.dineroDisponible.monto, 60000000);
  assert.equal(validada.financiacion.monto, 15000000);
  assert.equal(validada.financiacion.tipo, 'crédito hipotecario');
});

test('una contradicción ambigua no reemplaza el presupuesto confirmado', () => {
  const anterior = organizacionValida();
  const ambigua = organizacionValida();
  ambigua.presupuestoMaximo = {
    monto: 70000000,
    moneda: 'ARS',
    textoOriginal: 'Tal vez podría ser 70'
  };
  ambigua.pendientesDeRevision = ['No queda claro si cambia el presupuesto'];
  ambigua.cambiosDetectados = [{
    campo: 'presupuestoMaximo',
    tipoCambio: 'contradiccion',
    valorAnterior: 75000000,
    valorNuevo: 70000000,
    evidencia: 'Tal vez podría ser 70'
  }];

  const protegida = protegerDatosEconomicosConfirmados(ambigua, anterior);

  assert.equal(protegida.presupuestoMaximo.monto, 75000000);
  assert.match(protegida.pendientesDeRevision.join(' '), /Revisar presupuestoMaximo/);
});

test('una corrección económica explícita sí actualiza el valor', () => {
  const anterior = organizacionValida();
  const corregida = organizacionValida();
  corregida.presupuestoMaximo = {
    monto: 70000000,
    moneda: 'ARS',
    textoOriginal: 'Corrijo: mi presupuesto máximo es 70 millones'
  };
  corregida.cambiosDetectados = [{
    campo: 'presupuestoMaximo',
    tipoCambio: 'actualizacion',
    valorAnterior: 75000000,
    valorNuevo: 70000000,
    evidencia: 'Corrijo: mi presupuesto máximo es 70 millones'
  }];

  const protegida = protegerDatosEconomicosConfirmados(corregida, anterior);

  assert.equal(protegida.presupuestoMaximo.monto, 70000000);
});

test('un dato económico nuevo completa un campo antes desconocido', () => {
  const anterior = organizacionValida();
  anterior.financiacion = {
    estado: 'desconocido', tipo: null, monto: null, moneda: 'UNKNOWN', textoOriginal: null
  };
  const completada = organizacionValida();
  completada.financiacion = {
    estado: 'si',
    tipo: 'crédito hipotecario',
    monto: 15000000,
    moneda: 'ARS',
    textoOriginal: 'Completo con un crédito de 15 millones'
  };
  completada.cambiosDetectados = [{
    campo: 'financiacion',
    tipoCambio: 'nuevo',
    valorAnterior: null,
    valorNuevo: 15000000,
    evidencia: 'Completo con un crédito de 15 millones'
  }];

  const protegida = protegerDatosEconomicosConfirmados(completada, anterior);

  assert.equal(protegida.financiacion.monto, 15000000);
  assert.equal(protegida.financiacion.estado, 'si');
});
