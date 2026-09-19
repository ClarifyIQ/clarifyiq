const axios = require('axios');

const {
  crearEstadoInicial,
  actualizarEstado,
  decidirSiguienteAccion
} = require('./clarifyCore');

const {
  obtenerSesion,
  guardarSesion
} = require('./sessionStore');

function crearNotaInicial(estado) {
  const intencion = estado.intencion === true
    ? 'Sí'
    : estado.intencion === false
      ? 'No'
      : 'No definida';

  const eventoReferencia = [...(estado.historial || [])]
    .reverse()
    .find(evento => evento.categoria === 'PEDIR_DESCRIPCION_LIBRE');
  const referencia = eventoReferencia?.mensajeOriginal ||
    (estado.referenciaEconomica ? 'Informada' : 'No informada');

  return [
    'Resumen automático de CLARIFYIQ',
    `Etapa: ${estado.etapa}`,
    `Intención de visita: ${intencion}`,
    `Referencia económica: ${referencia}`
  ].join('\n');
}

async function enviarMensajeMeta(telefono, texto, { env = process.env, http = axios } = {}) {
  return http.post(
    `https://graph.facebook.com/v20.0/${env.PHONE_NUMBER_ID}/messages`,
    {
      messaging_product: 'whatsapp',
      to: telefono,
      type: 'text',
      text: { body: texto }
    },
    {
      headers: {
        Authorization: `Bearer ${env.WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json'
      }
    }
  );
}

function crearProcesadorMensajes({
  chatwoot,
  obtener = obtenerSesion,
  guardar = guardarSesion,
  enviarMeta = enviarMensajeMeta
} = {}) {
  async function procesar({ telefono, texto }) {
    let sesion = obtener(telefono);
    if (!sesion) sesion = crearEstadoInicial();

    const estado = actualizarEstado(texto, sesion);
    const accion = decidirSiguienteAccion(estado);

    // Guardar antes de cualquier llamada externa evita perder el avance del usuario.
    guardar(telefono, estado);

    if (!estado.orientable || !chatwoot?.estaConfigurado()) {
      await enviarMeta(telefono, accion.respuesta);
      return { estado, accion, respuestaAutomatica: true, chatwoot: false };
    }

    let registro;
    try {
      registro = await chatwoot.registrarEntrada({ telefono, texto });
      if (registro.newConversation) {
        await chatwoot.agregarNotaPrivada(
          registro.conversationId,
          crearNotaInicial(estado)
        );
      }
    } catch (error) {
      console.error('Error sincronizando con Chatwoot:', error.response?.data || error.message);
      return { estado, accion, respuestaAutomatica: false, chatwoot: 'error' };
    }

    // Ante una asignación incierta se prioriza no duplicar al operador.
    if (registro.assignmentStatus !== 'unassigned') {
      return {
        estado,
        accion,
        respuestaAutomatica: false,
        chatwoot: true,
        assignmentStatus: registro.assignmentStatus
      };
    }

    await enviarMeta(telefono, accion.respuesta);

    // La respuesta ya salió por WhatsApp. Una falla al registrar la nota no debe
    // provocar un reintento de Meta y una respuesta duplicada al cliente.
    try {
      await chatwoot.agregarNotaPrivada(
        registro.conversationId,
        `Respuesta automática enviada por CLARIFYIQ:\n${accion.respuesta}`
      );
    } catch (error) {
      console.error('No se pudo registrar la respuesta automática en Chatwoot:', error.response?.data || error.message);
    }

    return {
      estado,
      accion,
      respuestaAutomatica: true,
      chatwoot: true,
      assignmentStatus: 'unassigned'
    };
  }

  return { procesar };
}

module.exports = { crearProcesadorMensajes, crearNotaInicial, enviarMensajeMeta };
