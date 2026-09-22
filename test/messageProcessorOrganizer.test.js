const test = require('node:test');
const assert = require('node:assert/strict');

const { crearProcesadorMensajes } = require('../messageProcessor');

function sesionOrientable() {
  return {
    orientable: true,
    nombreComprador: 'Rosa',
    nombreConfirmado: true,
    esperandoNombre: false,
    debePreguntarNombre: false,
    intencion: true,
    referenciaEconomica: true,
    intentosReferenciaEconomica: 0,
    etapa: 'orientable',
    ultimaAccionEstado: 'NOMBRE_CONFIRMADO',
    requiereOperador: false,
    seguimientoPrioritario: false,
    historial: [
      {
        fecha: '2026-09-21T18:00:00.000Z',
        categoria: 'NOMBRE_CONFIRMADO',
        mensajeOriginal: 'Rosa'
      }
    ]
  };
}

function esperarSegundoPlano() {
  return new Promise(resolve => setImmediate(resolve));
}

test('organiza en segundo plano y sincroniza el resultado sin demorar WhatsApp', async () => {
  const sincronizaciones = [];
  const organizacionesGuardadas = [];
  const mensajesMeta = [];
  const organizacion = {
    presupuestoMaximo: { monto: 75000000, moneda: 'ARS' },
    dineroDisponible: { monto: 60000000, moneda: 'ARS' }
  };

  const procesador = crearProcesadorMensajes({
    chatwoot: { estaConfigurado: () => false },
    obtener: () => sesionOrientable(),
    guardar: () => {},
    guardarOrganizacionResultado: (...args) => organizacionesGuardadas.push(args),
    enviarMeta: async (...args) => mensajesMeta.push(args),
    organizer: {
      organizar: async () => ({
        organized: true,
        organizacion,
        sourceUntil: '2026-09-21T18:10:00.000Z'
      })
    },
    sheetsSync: {
      sincronizarBusqueda: async datos => sincronizaciones.push(datos)
    }
  });

  const resultado = await procesador.procesar({
    telefono: '5491',
    texto: 'También quiero pileta',
    nombre: 'Perfil de WhatsApp'
  });

  assert.equal(resultado.respuestaAutomatica, true);
  assert.equal(mensajesMeta.length, 1);
  await esperarSegundoPlano();

  assert.equal(sincronizaciones.length, 1);
  assert.equal(sincronizaciones[0].nombre, 'Rosa');
  assert.equal(sincronizaciones[0].organizacion, organizacion);
  assert.equal(organizacionesGuardadas.length, 1);
  assert.equal(organizacionesGuardadas[0][0], '5491');
});

test('si OpenAI falla conserva el flujo y usa la organización anterior', async () => {
  const sincronizaciones = [];
  const mensajesMeta = [];
  const errorOriginal = console.error;
  console.error = () => {};

  try {
    const sesion = sesionOrientable();
    sesion.organizacionComprador = { tipoPropiedad: { valor: 'Casa' } };

    const procesador = crearProcesadorMensajes({
      chatwoot: { estaConfigurado: () => false },
      obtener: () => sesion,
      guardar: () => {},
      enviarMeta: async (...args) => mensajesMeta.push(args),
      organizer: { organizar: async () => { throw new Error('OpenAI no disponible'); } },
      sheetsSync: {
        sincronizarBusqueda: async datos => sincronizaciones.push(datos)
      }
    });

    const resultado = await procesador.procesar({
      telefono: '5491',
      texto: 'Ahora también patio'
    });
    await esperarSegundoPlano();

    assert.equal(resultado.respuestaAutomatica, true);
    assert.equal(mensajesMeta.length, 1);
    assert.deepEqual(
      sincronizaciones[0].organizacion,
      { tipoPropiedad: { valor: 'Casa' } }
    );
  } finally {
    console.error = errorOriginal;
  }
});

test('si OpenAI falla continúan WhatsApp, Chatwoot y la sincronización básica', async () => {
  const sincronizaciones = [];
  const mensajesMeta = [];
  const entradasChatwoot = [];
  const notasChatwoot = [];
  const errorOriginal = console.error;
  console.error = () => {};

  try {
    const procesador = crearProcesadorMensajes({
      chatwoot: {
        estaConfigurado: () => true,
        registrarEntrada: async datos => {
          entradasChatwoot.push(datos);
          return {
            conversationId: 321,
            newConversation: false,
            assignmentStatus: 'unassigned'
          };
        },
        agregarNotaPrivada: async (...args) => notasChatwoot.push(args)
      },
      obtener: () => sesionOrientable(),
      guardar: () => {},
      enviarMeta: async (...args) => mensajesMeta.push(args),
      organizer: { organizar: async () => { throw new Error('OpenAI no disponible'); } },
      sheetsSync: {
        sincronizarBusqueda: async datos => sincronizaciones.push(datos)
      }
    });

    const resultado = await procesador.procesar({
      telefono: '5491',
      texto: 'También quiero cochera'
    });
    await esperarSegundoPlano();

    assert.equal(resultado.respuestaAutomatica, true);
    assert.equal(resultado.chatwoot, true);
    assert.equal(entradasChatwoot.length, 1);
    assert.equal(mensajesMeta.length, 1);
    assert.equal(notasChatwoot.length, 1);
    assert.equal(sincronizaciones.length, 1);
    assert.equal(sincronizaciones[0].organizacion, null);
  } finally {
    console.error = errorOriginal;
  }
});

test('no llama al organizador por una simple cortesía', async () => {
  let llamadasOrganizador = 0;
  const sincronizaciones = [];
  const procesador = crearProcesadorMensajes({
    chatwoot: { estaConfigurado: () => false },
    obtener: () => sesionOrientable(),
    guardar: () => {},
    enviarMeta: async () => {},
    organizer: {
      organizar: async () => {
        llamadasOrganizador += 1;
      }
    },
    sheetsSync: {
      sincronizarBusqueda: async datos => sincronizaciones.push(datos)
    }
  });

  await procesador.procesar({ telefono: '5491', texto: 'Gracias' });
  await esperarSegundoPlano();

  assert.equal(llamadasOrganizador, 0);
  assert.equal(sincronizaciones.length, 1);
});

test('un resultado viejo no llega a Google Sheets', async () => {
  let sincronizaciones = 0;
  const procesador = crearProcesadorMensajes({
    chatwoot: { estaConfigurado: () => false },
    obtener: () => sesionOrientable(),
    guardar: () => {},
    guardarOrganizacionResultado: () => false,
    enviarMeta: async () => {},
    organizer: {
      organizar: async () => ({
        organized: true,
        organizacion: { tipoPropiedad: { valor: 'Casa' } },
        sourceUntil: '2026-09-21T18:10:00.000Z'
      })
    },
    sheetsSync: {
      sincronizarBusqueda: async () => { sincronizaciones += 1; }
    }
  });

  await procesador.procesar({ telefono: '5491', texto: 'Quiero pileta' });
  await esperarSegundoPlano();

  assert.equal(sincronizaciones, 0);
});
