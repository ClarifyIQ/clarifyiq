const test = require('node:test');
const assert = require('node:assert/strict');

const { crearProcesadorMensajes, crearNotaInicial } = require('../messageProcessor');

function estadoOrientable() {
  return {
    orientable: true,
    intencion: true,
    referenciaEconomica: true,
    intentosReferenciaEconomica: 0,
    etapa: 'orientable',
    ultimaAccionEstado: 'ACOMPANAMIENTO',
    requiereOperador: false,
    seguimientoPrioritario: false,
    historial: [{
      fecha: new Date().toISOString(),
      mensajeOriginal: 'USD 100000',
      categoria: 'PEDIR_DESCRIPCION_LIBRE'
    }]
  };
}

function dependencias({ estado = estadoOrientable(), configurado = true, registro } = {}) {
  const enviados = [];
  const entradas = [];
  const notas = [];
  const prioridades = [];
  const guardados = [];

  const chatwoot = {
    estaConfigurado: () => configurado,
    registrarEntrada: async entrada => {
      entradas.push(entrada);
      if (registro instanceof Error) throw registro;
      return registro || {
        conversationId: 50,
        newConversation: false,
        assignmentStatus: 'unassigned'
      };
    },
    agregarNotaPrivada: async (id, contenido) => notas.push([id, contenido]),
    actualizarPrioridad: async (id, prioridad) => prioridades.push([id, prioridad])
  };

  const procesador = crearProcesadorMensajes({
    chatwoot,
    obtener: () => estado,
    guardar: (telefono, nuevoEstado) => guardados.push([telefono, nuevoEstado]),
    enviarMeta: async (telefono, texto) => enviados.push([telefono, texto])
  });

  return { procesador, chatwoot, enviados, entradas, notas, prioridades, guardados };
}

test('antes de ser orientable responde por Meta sin abrir Chatwoot', async () => {
  const deps = dependencias({ estado: null });
  const resultado = await deps.procesador.procesar({ telefono: '5491', texto: 'Hola' });

  assert.equal(resultado.respuestaAutomatica, true);
  assert.equal(resultado.chatwoot, false);
  assert.equal(deps.enviados.length, 1);
  assert.equal(deps.entradas.length, 0);
  assert.equal(deps.guardados.length, 1);
});

test('con Chatwoot desactivado mantiene la respuesta automática normal', async () => {
  const deps = dependencias({ configurado: false });
  const resultado = await deps.procesador.procesar({ telefono: '5491', texto: 'Necesito patio' });

  assert.equal(resultado.respuestaAutomatica, true);
  assert.equal(resultado.chatwoot, false);
  assert.equal(deps.enviados.length, 1);
  assert.equal(deps.entradas.length, 0);
});

test('sin operador asignado registra la entrada y permite responder a CLARIFYIQ', async () => {
  const deps = dependencias({
    registro: { conversationId: 50, newConversation: true, assignmentStatus: 'unassigned' }
  });
  const resultado = await deps.procesador.procesar({ telefono: '5491', texto: 'Necesito patio' });

  assert.equal(resultado.respuestaAutomatica, true);
  assert.equal(resultado.assignmentStatus, 'unassigned');
  assert.equal(deps.entradas.length, 1);
  assert.equal(deps.enviados.length, 1);
  assert.equal(deps.notas.length, 2);
  assert.match(deps.notas[0][1], /Resumen automático de CLARIFYIQ/);
  assert.match(deps.notas[1][1], /Respuesta automática enviada/);
});

test('con operador asignado registra el mensaje y suprime la respuesta automática', async () => {
  const deps = dependencias({
    registro: { conversationId: 50, newConversation: false, assignmentStatus: 'assigned' }
  });
  const resultado = await deps.procesador.procesar({ telefono: '5491', texto: 'Otra consulta' });

  assert.equal(resultado.respuestaAutomatica, false);
  assert.equal(resultado.assignmentStatus, 'assigned');
  assert.equal(deps.entradas.length, 1);
  assert.equal(deps.enviados.length, 0);
});

test('agrega resumen al iniciar una búsqueda orientable aunque Chatwoot reutilice la conversación', async () => {
  const estado = {
    ...estadoOrientable(),
    orientable: false,
    etapa: 'descripcionLibre',
    ultimaAccionEstado: 'PEDIR_DESCRIPCION_LIBRE'
  };
  const deps = dependencias({
    estado,
    registro: { conversationId: 50, newConversation: false, assignmentStatus: 'assigned' }
  });

  await deps.procesador.procesar({ telefono: '5491', texto: 'Quiero pileta, patio y terraza' });

  assert.equal(deps.notas.length, 1);
  assert.match(deps.notas[0][1], /Resumen automático de CLARIFYIQ/);
});

test('si la asignación es desconocida evita una respuesta duplicada', async () => {
  const deps = dependencias({
    registro: { conversationId: 50, newConversation: false, assignmentStatus: 'unknown' }
  });
  const resultado = await deps.procesador.procesar({ telefono: '5491', texto: 'Otra consulta' });

  assert.equal(resultado.respuestaAutomatica, false);
  assert.equal(resultado.assignmentStatus, 'unknown');
  assert.equal(deps.enviados.length, 0);
});

test('si Chatwoot falla aplica cierre seguro y no responde automáticamente', async () => {
  const deps = dependencias({ registro: new Error('Chatwoot no disponible') });
  const errorOriginal = console.error;
  console.error = () => {};
  try {
    const resultado = await deps.procesador.procesar({ telefono: '5491', texto: 'Otra consulta' });
    assert.equal(resultado.respuestaAutomatica, false);
    assert.equal(resultado.chatwoot, 'error');
    assert.equal(deps.enviados.length, 0);
  } finally {
    console.error = errorOriginal;
  }
});

test('construye el resumen inicial con los datos disponibles', () => {
  const nota = crearNotaInicial(estadoOrientable());
  assert.match(nota, /Intención de visita: Sí/);
  assert.match(nota, /Referencia económica: USD 100000/);
  assert.match(nota, /Seguimiento prioritario: No/);
});

test('marca prioridad en Chatwoot sin silenciar la respuesta automática', async () => {
  const deps = dependencias();

  const resultado = await deps.procesador.procesar({
    telefono: '5491',
    texto: 'Estoy ansioso, ¿cuánto tarda?'
  });

  assert.equal(resultado.estado.seguimientoPrioritario, true);
  assert.equal(resultado.accion.accion, 'SEGUIMIENTO_PRIORITARIO');
  assert.equal(resultado.respuestaAutomatica, true);
  assert.deepEqual(deps.prioridades, [[50, 'high']]);
  assert.ok(deps.notas.some(([, contenido]) => /seguimiento prioritario/.test(contenido)));
});
