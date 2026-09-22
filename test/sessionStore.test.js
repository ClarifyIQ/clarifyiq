const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  obtenerRutaDB,
  obtenerSesion,
  guardarSesion,
  guardarOrganizacion,
  eliminarSesion
} = require('../sessionStore');

function conBaseTemporal(fn) {
  const directorio = fs.mkdtempSync(path.join(os.tmpdir(), 'clarifyiq-'));
  const anterior = process.env.CLARIFYIQ_DB_PATH;
  process.env.CLARIFYIQ_DB_PATH = path.join(directorio, 'datos', 'db.json');

  try {
    return fn(process.env.CLARIFYIQ_DB_PATH);
  } finally {
    if (anterior === undefined) delete process.env.CLARIFYIQ_DB_PATH;
    else process.env.CLARIFYIQ_DB_PATH = anterior;
    fs.rmSync(directorio, { recursive: true, force: true });
  }
}

test('usa la ruta persistente configurada por Railway', () => {
  conBaseTemporal(dbPath => {
    assert.equal(obtenerRutaDB(), dbPath);

    guardarSesion('5491111111111', { etapa: 'orientable' });

    assert.equal(obtenerSesion('5491111111111').etapa, 'orientable');
    assert.equal(fs.existsSync(dbPath), true);
  });
});

test('crea una base vacía y permite eliminar una sesión', () => {
  conBaseTemporal(dbPath => {
    assert.equal(obtenerSesion('5492222222222'), null);
    assert.equal(fs.existsSync(dbPath), true);

    guardarSesion('5492222222222', { etapa: 'inicio' });
    eliminarSesion('5492222222222');

    assert.equal(obtenerSesion('5492222222222'), null);
  });
});

test('guarda la organización sin perder el estado más reciente', () => {
  conBaseTemporal(() => {
    guardarSesion('5493333333333', {
      etapa: 'orientable',
      historial: [{ mensajeOriginal: 'Quiero pileta' }]
    });

    const guardada = guardarOrganizacion('5493333333333', {
      organizacion: {
        tipoPropiedad: { valor: 'Casa' },
        cambiosDetectados: [{
          campo: 'caracteristicas',
          tipoCambio: 'nuevo',
          valorAnterior: null,
          valorNuevo: 'pileta',
          evidencia: 'Quiero pileta'
        }]
      },
      sourceUntil: '2026-09-21T18:10:00.000Z'
    });

    const sesion = obtenerSesion('5493333333333');
    assert.equal(guardada, true);
    assert.equal(sesion.etapa, 'orientable');
    assert.equal(sesion.historial.length, 1);
    assert.equal(sesion.organizacionComprador.tipoPropiedad.valor, 'Casa');
    assert.equal(sesion.historialOrganizacion.length, 1);
  });
});

test('ignora un resultado viejo que termina después de otro más nuevo', () => {
  conBaseTemporal(() => {
    guardarSesion('5494444444444', { etapa: 'orientable' });
    guardarOrganizacion('5494444444444', {
      organizacion: { version: 'nueva', cambiosDetectados: [] },
      sourceUntil: '2026-09-21T18:20:00.000Z'
    });

    const guardada = guardarOrganizacion('5494444444444', {
      organizacion: { version: 'vieja', cambiosDetectados: [] },
      sourceUntil: '2026-09-21T18:10:00.000Z'
    });

    assert.equal(guardada, false);
    assert.equal(
      obtenerSesion('5494444444444').organizacionComprador.version,
      'nueva'
    );
  });
});

test('conserva en historial el cambio de presupuesto de 75 a 70 millones', () => {
  conBaseTemporal(() => {
    guardarSesion('5495555555555', { etapa: 'orientable' });
    guardarOrganizacion('5495555555555', {
      organizacion: {
        presupuestoMaximo: { monto: 75000000, moneda: 'ARS' },
        cambiosDetectados: [{
          campo: 'presupuestoMaximo',
          tipoCambio: 'nuevo',
          valorAnterior: null,
          valorNuevo: 75000000,
          evidencia: 'Mi presupuesto máximo es 75 millones'
        }]
      },
      sourceUntil: '2026-09-21T18:10:00.000Z'
    });
    guardarOrganizacion('5495555555555', {
      organizacion: {
        presupuestoMaximo: { monto: 70000000, moneda: 'ARS' },
        cambiosDetectados: [{
          campo: 'presupuestoMaximo',
          tipoCambio: 'actualizacion',
          valorAnterior: 75000000,
          valorNuevo: 70000000,
          evidencia: 'Corrijo: el máximo es 70 millones'
        }]
      },
      sourceUntil: '2026-09-21T18:20:00.000Z'
    });

    const sesion = obtenerSesion('5495555555555');
    assert.equal(sesion.organizacionComprador.presupuestoMaximo.monto, 70000000);
    assert.deepEqual(
      sesion.historialOrganizacion.map(item => item.valorNuevo),
      [75000000, 70000000]
    );
    assert.deepEqual(
      sesion.historialOrganizacion.map(item => item.fecha),
      ['2026-09-21T18:10:00.000Z', '2026-09-21T18:20:00.000Z']
    );
  });
});
