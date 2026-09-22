const test = require('node:test');
const assert = require('node:assert/strict');

const {
  crearGoogleSheetsSync,
  crearPayloadBusqueda,
  detectarTipoPropiedad,
  extraerMontoUsd
} = require('../googleSheetsSync');

function estadoOrientable() {
  return {
    orientable: true,
    seguimientoPrioritario: true,
    historial: [
      { categoria: 'PREGUNTAR_CONTINUIDAD', mensajeOriginal: 'Busco un dúplex' },
      { categoria: 'PEDIR_DESCRIPCION_LIBRE', mensajeOriginal: 'Tengo 50 mil dólares' },
      { categoria: 'ACOMPANAMIENTO', mensajeOriginal: 'Quiero patio y pileta' }
    ]
  };
}

test('detecta el tipo de propiedad a partir del historial', () => {
  assert.equal(detectarTipoPropiedad(estadoOrientable()), 'Dúplex / PH');
});

test('extrae únicamente montos expresados en dólares', () => {
  assert.equal(extraerMontoUsd('Tengo 50 mil dólares'), 50000);
  assert.equal(extraerMontoUsd('USD 100.000'), 100000);
  assert.equal(extraerMontoUsd('Tengo 20 millones de pesos'), null);
});

test('crea un payload estable para actualizar la misma búsqueda', () => {
  const payload = crearPayloadBusqueda({
    telefono: '54 9 376 123-4567',
    nombre: 'Marco',
    estado: estadoOrientable(),
    ahora: new Date('2026-09-20T12:00:00.000Z')
  });

  assert.equal(payload.idBusqueda, 'CL-5493761234567');
  assert.equal(payload.telefono, '+5493761234567');
  assert.equal(payload.nombre, 'Marco');
  assert.equal(payload.tipoPropiedad, 'Dúplex / PH');
  assert.equal(payload.presupuestoMaximoUsd, 50000);
  assert.equal(payload.prioridad, 'Alta');
  assert.equal(payload.estado, 'Orientable');
  assert.equal(payload.descripcionOriginal, 'Quiero patio y pileta');
});

test('prioriza la organización estructurada sin confundir dinero disponible', () => {
  const organizacion = {
    tipoPropiedad: { valor: 'Casa' },
    zonas: { principal: 'Centro' },
    presupuestoMaximo: { monto: 75000000, moneda: 'ARS' },
    dineroDisponible: { monto: 60000000, moneda: 'ARS' },
    urgencia: { nivel: 'alta' },
    fechaLimite: { texto: 'Antes de fin de año' }
  };

  const payload = crearPayloadBusqueda({
    telefono: '5491',
    nombre: 'Rosa',
    estado: estadoOrientable(),
    organizacion,
    ahora: new Date('2026-09-21T12:00:00.000Z')
  });

  assert.equal(payload.tipoPropiedad, 'Casa');
  assert.equal(payload.zonaPrincipal, 'Centro');
  assert.equal(payload.presupuestoMaximoUsd, null);
  assert.equal(payload.dineroDisponibleUsd, null);
  assert.equal(payload.fechaLimite, 'Antes de fin de año');
  assert.equal(payload.organizacion.presupuestoMaximo.monto, 75000000);
  assert.equal(payload.organizacion.dineroDisponible.monto, 60000000);
});

test('queda desactivado de forma segura si faltan variables', async () => {
  const sync = crearGoogleSheetsSync({ env: {}, http: { post: async () => assert.fail() } });
  const resultado = await sync.sincronizarBusqueda({
    telefono: '5491',
    estado: estadoOrientable()
  });

  assert.deepEqual(resultado, { enabled: false, synced: false });
});

test('envía la búsqueda orientable al endpoint configurado', async () => {
  const llamadas = [];
  const sync = crearGoogleSheetsSync({
    env: {
      GOOGLE_SHEETS_WEBHOOK_URL: 'https://example.test/sync',
      GOOGLE_SHEETS_SYNC_SECRET: 'secreto'
    },
    http: {
      post: async (...args) => {
        llamadas.push(args);
        return { data: { ok: true, row: 6 } };
      }
    }
  });

  const resultado = await sync.sincronizarBusqueda({
    telefono: '5491',
    nombre: 'Marco',
    estado: estadoOrientable()
  });

  assert.equal(resultado.synced, true);
  assert.equal(resultado.row, 6);
  assert.equal(llamadas.length, 1);
  assert.equal(llamadas[0][0], 'https://example.test/sync');
  assert.equal(llamadas[0][1].secreto, 'secreto');
  assert.equal(llamadas[0][1].busqueda.nombre, 'Marco');
});

test('tolera una demora simulada de Apps Script superior a ocho segundos', async () => {
  const demoraSimuladaMs = 12000;
  let timeoutConfigurado;
  const sync = crearGoogleSheetsSync({
    env: {
      GOOGLE_SHEETS_WEBHOOK_URL: 'https://example.test/sync',
      GOOGLE_SHEETS_SYNC_SECRET: 'secreto'
    },
    http: {
      post: async (_url, _body, configuracion) => {
        timeoutConfigurado = configuracion.timeout;
        if (demoraSimuladaMs > configuracion.timeout) {
          throw new Error(`timeout of ${configuracion.timeout}ms exceeded`);
        }
        return { data: { ok: true, row: 7 } };
      }
    }
  });

  const resultado = await sync.sincronizarBusqueda({
    telefono: '5491',
    nombre: 'Marco',
    estado: estadoOrientable()
  });

  assert.equal(timeoutConfigurado, 30000);
  assert.equal(resultado.synced, true);
  assert.equal(resultado.row, 7);
});

test('registra metadatos seguros de una respuesta exitosa de Google Sheets', async () => {
  const registros = [];
  const sync = crearGoogleSheetsSync({
    env: {
      GOOGLE_SHEETS_WEBHOOK_URL: 'https://example.test/sync',
      GOOGLE_SHEETS_SYNC_SECRET: 'secreto-no-registrar'
    },
    http: {
      post: async () => ({
        status: 200,
        headers: { 'content-type': 'application/json; charset=utf-8' },
        data: { ok: true, row: 8, contenidoPrivado: 'no registrar' }
      })
    },
    logger: { log: (...argumentos) => registros.push(argumentos) }
  });

  await sync.sincronizarBusqueda({
    telefono: '5491111111111',
    nombre: 'Nombre privado',
    estado: estadoOrientable()
  });

  assert.deepEqual(registros, [[
    'Google Sheets: respuesta recibida',
    {
      status: 200,
      contentType: 'application/json; charset=utf-8',
      dataType: 'object',
      ok: true
    }
  ]]);
  const serializado = JSON.stringify(registros);
  assert.equal(serializado.includes('5491111111111'), false);
  assert.equal(serializado.includes('Nombre privado'), false);
  assert.equal(serializado.includes('secreto-no-registrar'), false);
  assert.equal(serializado.includes('no registrar'), false);
});

test('registra solamente el error devuelto por Google Sheets antes de rechazar', async () => {
  const registros = [];
  const sync = crearGoogleSheetsSync({
    env: {
      GOOGLE_SHEETS_WEBHOOK_URL: 'https://example.test/sync',
      GOOGLE_SHEETS_SYNC_SECRET: 'secreto'
    },
    http: {
      post: async () => ({
        status: 200,
        headers: { 'content-type': 'application/json' },
        data: { ok: false, error: 'Error seguro de Apps Script', detalle: 'dato sensible' }
      })
    },
    logger: { log: (...argumentos) => registros.push(argumentos) }
  });

  await assert.rejects(
    sync.sincronizarBusqueda({ telefono: '5491', estado: estadoOrientable() }),
    /Error seguro de Apps Script/
  );
  assert.deepEqual(registros[0][1], {
    status: 200,
    contentType: 'application/json',
    dataType: 'object',
    error: 'Error seguro de Apps Script',
    ok: false
  });
  assert.equal(JSON.stringify(registros).includes('dato sensible'), false);
});

test('identifica una respuesta textual sin registrar su contenido', async () => {
  const registros = [];
  const sync = crearGoogleSheetsSync({
    env: {
      GOOGLE_SHEETS_WEBHOOK_URL: 'https://example.test/sync',
      GOOGLE_SHEETS_SYNC_SECRET: 'secreto'
    },
    http: {
      post: async () => ({
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
        data: 'contenido completo prohibido'
      })
    },
    logger: { log: (...argumentos) => registros.push(argumentos) }
  });

  await assert.rejects(
    sync.sincronizarBusqueda({ telefono: '5491', estado: estadoOrientable() }),
    /Google Sheets no confirmó la sincronización/
  );
  assert.deepEqual(registros[0][1], {
    status: 200,
    contentType: 'text/html; charset=utf-8',
    dataType: 'string'
  });
  assert.equal(JSON.stringify(registros).includes('contenido completo prohibido'), false);
});

test('no sincroniza estados que todavía no son orientables', async () => {
  const sync = crearGoogleSheetsSync({
    env: {
      GOOGLE_SHEETS_WEBHOOK_URL: 'https://example.test/sync',
      GOOGLE_SHEETS_SYNC_SECRET: 'secreto'
    },
    http: { post: async () => assert.fail() }
  });

  const resultado = await sync.sincronizarBusqueda({
    telefono: '5491',
    estado: { orientable: false }
  });

  assert.deepEqual(resultado, { enabled: true, synced: false });
});
