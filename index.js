const express = require('express');
const {
  crearEstadoInicial,
  actualizarEstado,
  decidirSiguienteAccion
} = require('./clarifyCore');

const {
  obtenerSesion,
  guardarSesion,
  eliminarSesion
} = require('./sessionStore');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('ClarifyIQ - prueba local');
});

app.post('/test-message', (req, res) => {
  const { telefono, mensaje } = req.body;

  if (!telefono || !mensaje) {
    return res.status(400).json({
      error: 'Faltan telefono o mensaje'
    });
  }

  let sesion = obtenerSesion(telefono);

  if (!sesion) {
    sesion = crearEstadoInicial();
  }

  const estadoActualizado = actualizarEstado(mensaje, sesion);
  const accion = decidirSiguienteAccion(estadoActualizado);

  guardarSesion(telefono, estadoActualizado);

  res.json({
    respuesta: accion.respuesta,
    accion: accion.accion,
    derivar: accion.derivar,
    estadoResumido: estadoActualizado
  });
});

app.post('/reset/:telefono', (req, res) => {
  const { telefono } = req.params;
  eliminarSesion(telefono);
  res.json({ ok: true, mensaje: `Sesión ${telefono} reiniciada` });
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});

app.get('/webhook', (req, res) => {
  const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'clarify2024';

  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});