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

const { crearChatwootAdapter } = require('./chatwootAdapter');
const { crearManejadorChatwoot } = require('./chatwootWebhook');
const { crearProcesadorMensajes, enviarMensajeMeta } = require('./messageProcessor');

function crearApp({ env = process.env, chatwoot, procesador, enviarMeta } = {}) {
  const app = express();

  app.use(express.json({
    verify: (req, _res, buffer) => {
      req.rawBody = Buffer.from(buffer);
    }
  }));

  const adapter = chatwoot || crearChatwootAdapter({ env });
  const enviar = enviarMeta || ((telefono, texto) =>
    enviarMensajeMeta(telefono, texto, { env }));
  const procesadorActivo = procesador || crearProcesadorMensajes({
    chatwoot: adapter,
    enviarMeta: enviar
  });
  const manejarChatwoot = crearManejadorChatwoot({
    env,
    enviarMeta: enviar,
    actualizarEstadoMensaje: adapter.actualizarEstadoMensaje
  });

  app.get('/', (_req, res) => {
    res.send('ClarifyIQ - prueba local');
  });

  app.post('/test-message', (req, res) => {
    const { telefono, mensaje } = req.body;

    if (!telefono || !mensaje) {
      return res.status(400).json({ error: 'Faltan telefono o mensaje' });
    }

    let sesion = obtenerSesion(telefono);
    if (!sesion) sesion = crearEstadoInicial();

    const estadoActualizado = actualizarEstado(mensaje, sesion);
    const accion = decidirSiguienteAccion(estadoActualizado);
    guardarSesion(telefono, estadoActualizado);

    console.log('TEST - Teléfono:', telefono);
    console.log('TEST - Texto:', mensaje);
    console.log('TEST - Respuesta ClarifyIQ:', accion.respuesta);
    console.log('TEST - Acción:', accion.accion);
    console.log('TEST - Derivar:', accion.derivar);

    return res.json({
      respuesta: accion.respuesta,
      accion: accion.accion,
      derivar: accion.derivar,
      estadoResumido: estadoActualizado
    });
  });

  app.post('/reset/:telefono', (req, res) => {
    const { telefono } = req.params;
    eliminarSesion(telefono);
    console.log('Sesión reiniciada:', telefono);
    return res.json({ ok: true, mensaje: `Sesión ${telefono} reiniciada` });
  });

  app.get('/webhook', (req, res) => {
    const verifyToken = env.VERIFY_TOKEN || 'clarify2024';
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === verifyToken) {
      return res.status(200).send(challenge);
    }

    return res.sendStatus(403);
  });

  app.post('/webhook/chatwoot', manejarChatwoot);

  app.post('/webhook', async (req, res) => {
    try {
      console.log('Mensaje recibido de Meta');

      const mensaje = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
      if (!mensaje) {
        console.log('Webhook sin mensaje de usuario. Se responde 200.');
        return res.sendStatus(200);
      }

      const telefono = mensaje.from;
      const texto = mensaje.text?.body;

      // Primera versión: texto solamente. Los demás eventos se reconocen sin
      // alterar el estado de la conversación ni generar respuestas vacías.
      if (!telefono || typeof texto !== 'string' || !texto.trim()) {
        console.log('Mensaje no textual ignorado de forma segura.');
        return res.sendStatus(200);
      }

      console.log('Teléfono:', telefono);
      console.log('Texto:', texto);

      const resultado = await procesadorActivo.procesar({ telefono, texto });

      console.log('Estado flujo:', resultado.estado.etapa);
      console.log('Respuesta automática:', resultado.respuestaAutomatica);
      console.log('Chatwoot:', resultado.chatwoot);
      console.log('Asignación Chatwoot:', resultado.assignmentStatus || 'no aplica');

      return res.sendStatus(200);
    } catch (error) {
      console.error('Error procesando webhook:', error.response?.data || error.message);
      return res.sendStatus(500);
    }
  });

  return app;
}

if (require.main === module) {
  const port = process.env.PORT || 3000;
  crearApp().listen(port, () => {
    console.log(`Servidor corriendo en http://localhost:${port}`);
  });
}

module.exports = { crearApp };
