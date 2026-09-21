const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');

const originalLoad = Module._load;
const processorPath = path.join(__dirname, '..', 'messageProcessor.js');

Module._load = function cargarConDependencias(request, parent, isMain) {
  if (parent?.filename === processorPath && request === 'axios') return {};
  if (parent?.filename === processorPath && request === './clarifyCore') {
    return {
      crearEstadoInicial: () => ({ orientable: false, historial: [] }),
      actualizarEstado: texto => ({
        orientable: true,
        etapa: 'orientable',
        nombreComprador: texto === 'sin confirmar' ? null : 'Marco',
        nombreConfirmado: texto !== 'sin confirmar',
        seguimientoPrioritario: false,
        historial: []
      }),
      decidirSiguienteAccion: () => ({ respuesta: 'Registrado', accion: 'ACOMPANAMIENTO' })
    };
  }
  if (parent?.filename === processorPath && request === './sessionStore') {
    return { obtenerSesion: () => null, guardarSesion: () => {} };
  }
  return originalLoad(request, parent, isMain);
};

const { crearProcesadorMensajes } = require('../messageProcessor');
Module._load = originalLoad;

function esperarSegundoPlano() {
  return new Promise(resolve => setImmediate(resolve));
}

test('programa la sincronización sin demorar la respuesta de WhatsApp', async () => {
  const sincronizadas = [];
  let resolverSync;
  const syncPendiente = new Promise(resolve => { resolverSync = resolve; });
  const enviados = [];

  const procesador = crearProcesadorMensajes({
    chatwoot: { estaConfigurado: () => false },
    obtener: () => ({ orientable: false, historial: [] }),
    guardar: () => {},
    enviarMeta: async (...args) => enviados.push(args),
    sheetsSync: {
      sincronizarBusqueda: async datos => {
        sincronizadas.push(datos);
        await syncPendiente;
      }
    }
  });

  const resultado = await procesador.procesar({
    telefono: '5491',
    texto: 'Quiero patio',
    nombre: 'Marco'
  });

  assert.equal(resultado.respuestaAutomatica, true);
  assert.equal(enviados.length, 1);
  await esperarSegundoPlano();
  assert.equal(sincronizadas.length, 1);
  assert.equal(sincronizadas[0].nombre, 'Marco');
  resolverSync();
});

test('no usa el nombre de perfil de WhatsApp antes de confirmarlo', async () => {
  const sincronizadas = [];
  const procesador = crearProcesadorMensajes({
    chatwoot: { estaConfigurado: () => false },
    obtener: () => ({ orientable: false, historial: [] }),
    guardar: () => {},
    enviarMeta: async () => {},
    sheetsSync: {
      sincronizarBusqueda: async datos => sincronizadas.push(datos)
    }
  });

  await procesador.procesar({
    telefono: '5491',
    texto: 'sin confirmar',
    nombre: 'Nombre del perfil'
  });
  await esperarSegundoPlano();

  assert.equal(sincronizadas[0].nombre, '');
});

test('una falla de Sheets no bloquea la respuesta automática', async () => {
  const enviados = [];
  const errorOriginal = console.error;
  console.error = () => {};

  try {
    const procesador = crearProcesadorMensajes({
      chatwoot: { estaConfigurado: () => false },
      obtener: () => ({ orientable: false, historial: [] }),
      guardar: () => {},
      enviarMeta: async (...args) => enviados.push(args),
      sheetsSync: {
        sincronizarBusqueda: async () => { throw new Error('Google no disponible'); }
      }
    });

    const resultado = await procesador.procesar({ telefono: '5491', texto: 'Quiero patio' });
    await esperarSegundoPlano();

    assert.equal(resultado.respuestaAutomatica, true);
    assert.equal(enviados.length, 1);
  } finally {
    console.error = errorOriginal;
  }
});
