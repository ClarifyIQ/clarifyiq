const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  obtenerRutaDB,
  obtenerSesion,
  guardarSesion,
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
