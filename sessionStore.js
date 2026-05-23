const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'db.json');

function leerDB() {
  try {
    const data = fs.readFileSync(DB_PATH, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    const base = { conversaciones: {} };
    escribirDB(base);
    return base;
  }
}

function escribirDB(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
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

module.exports = { obtenerSesion, guardarSesion, eliminarSesion };