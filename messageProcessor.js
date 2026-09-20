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

const { crearGoogleSheetsSync } = require('./googleSheetsSync');

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
    `Referencia económica: ${referencia}`,
    `Seguimiento prioritario: ${estado.seguimientoPrioritario ? 'Sí' : 'No'}`
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
  enviarMeta = enviarMensajeMeta,
  sheetsSync = crearGoogleSheetsSync()
} = {}) {
  async function procesar({ telefono, texto, nombre }) {
    let sesion = obtener(telefono);
    if (!sesion) sesion = crearEstadoInicial();

    const yaEraOrientable = Boolean(sesion.orientable);
    const yaEraPrioritario = Boolean(sesion.seguimientoPrioritario);

    const estado = actualizarEstado(texto, sesion);
    const accion = decidirSiguienteAccion(estado);

    // Guardar antes de cualquier llamada externa evita perder el avance del usuario.
    guardar(telefono, estado);

    // La planilla es un apoyo operativo. Si Google está lento o no disponible,
    // WhatsApp y Chatwoot deben continuar funcionando sin demoras ni bloqueos.
    if (estado.orientable && sheetsSync?.sincronizarBusqueda) {
      Promise.resolve()
        .then(() => sheetsSync.sincronizarBusqueda({ telefono, nombre, estado }))
        .catch(error => {
          console.error(
            'Error sincronizando búsqueda con Google Sheets:',
            error.response?.data || error.message
          );
        });
    }

    if (!estado.orientable || !chatwoot?.estaConfigurado()) {
      await enviarMeta(telefono, accion.respuesta);
      return { estado, accion, respuestaAutomatica: true, chatwoot: false };
    }

    let registro;
    try {
      registro = await chatwoot.registrarEntrada({ telefono, texto });
      // Chatwoot puede reutilizar una conversación abierta de una búsqueda
      // anterior. El resumen pertenece al comienzo de cada búsqueda orientable,
      // no solamente a la creación de una conversación en Chatwoot.
      if (registro.newConversation || !yaEraOrientable) {
        await chatwoot.agregarNotaPrivada(
          registro.conversationId,
          crearNotaInicial(estado)
        );
      }
    } catch (error) {
      console.error('Error sincronizando con Chatwoot:', error.response?.data || error.message);
      return { estado, accion, respuestaAutomatica: false, chatwoot: 'error' };
    }

    if (estado.seguimientoPrioritario && !yaEraPrioritario) {
      try {
        await chatwoot.actualizarPrioridad?.(registro.conversationId, 'high');
        await chatwoot.agregarNotaPrivada(
          registro.conversationId,
          'CLARIFYIQ: seguimiento prioritario\nSe detectó una señal de urgencia o necesidad de avance. El bot continúa activo hasta que un operador decida asignarse la conversación.'
        );
      } catch (error) {
        console.error('No se pudo marcar la prioridad en Chatwoot:', error.response?.data || error.message);
      }
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
