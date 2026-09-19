const fs = require('fs');
const path = require('path');

function obtenerRutaDB() {
  return process.env.CLARIFYIQ_DB_PATH || path.join(__dirname, 'db.json');
}

function leerDB(dbPath = obtenerRutaDB()) {
  try {
    const data = fs.readFileSync(dbPath, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    const base = { conversaciones: {} };
    escribirDB(base, dbPath);
    return base;
  }
}

function escribirDB(db, dbPath = obtenerRutaDB()) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  // Escribir primero un archivo temporal evita dejar un JSON incompleto si el
  // proceso se interrumpe durante la escritura.
  const temporal = `${dbPath}.${process.pid}.tmp`;
  fs.writeFileSync(temporal, JSON.stringify(db, null, 2));
  fs.renameSync(temporal, dbPath);
}

function obtenerSesion(telefono) {
  const db = leerDB();
  return db.conversaciones[telefono] || null;
}

function guardarSesion(telefono, sesion) {
  const db = leerDB();
  db.conversaciones[telefono] = { ...sesion, telefono, ultimo_mensaje: new Date().toISOString() };
  escribirDB(db);
}

function eliminarSesion(telefono) {
  const db = leerDB();
  delete db.conversaciones[telefono];
  escribirDB(db);
}

module.exports = {
  obtenerRutaDB,
  leerDB,
  escribirDB,
  obtenerSesion,
  guardarSesion,
  eliminarSesion
};
