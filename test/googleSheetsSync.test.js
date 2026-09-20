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
