const axios = require('axios');
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

app.post('/webhook', async (req, res) => {
  try {
    console.log('Mensaje recibido de Meta');

    const mensaje =
      req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

    if (!mensaje) {
      return res.sendStatus(200);
    }

    const telefono = mensaje.from;
    const texto = mensaje.text?.body || '';

    console.log('Teléfono:', telefono);
    console.log('Texto:', texto);

    let sesion = obtenerSesion(telefono);

    if (!sesion) {
      sesion = crearEstadoInicial();
    }

    const estadoActualizado = actualizarEstado(texto, sesion);
    const accion = decidirSiguienteAccion(estadoActualizado);

    guardarSesion(telefono, estadoActualizado);

    await axios.post(
      `https://graph.facebook.com/v20.0/${process.env.PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: 'whatsapp',
        to: telefono,
        type: 'text',
        text: {
          body: accion.respuesta
        }
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    res.sendStatus(200);

  } catch (error) {
    console.error(error.response?.data || error.message);
    res.sendStatus(500);
  }
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});