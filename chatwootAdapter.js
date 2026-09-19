const axios = require('axios');

function normalizarTelefono(telefono) {
  return String(telefono || '').replace(/\D/g, '');
}

function crearChatwootAdapter({ env = process.env, http = axios } = {}) {
  const baseUrl = String(env.CHATWOOT_BASE_URL || '').replace(/\/$/, '');
  const accountId = Number(env.CHATWOOT_ACCOUNT_ID);
  const inboxId = Number(env.CHATWOOT_INBOX_ID);
  const token = env.CHATWOOT_API_ACCESS_TOKEN;

  function estaConfigurado() {
    return (
      env.CHATWOOT_ENABLED === 'true' &&
      Boolean(baseUrl && accountId && inboxId && token)
    );
  }

  function url(path) {
    return `${baseUrl}/api/v1/accounts/${accountId}${path}`;
  }

  function opciones(extra = {}) {
    return {
      ...extra,
      headers: {
        api_access_token: token,
        'Content-Type': 'application/json',
        ...(extra.headers || {})
      }
    };
  }

  function listaContactos(data) {
    if (Array.isArray(data?.payload)) return data.payload;
    if (Array.isArray(data)) return data;
    return [];
  }

  function extraerContacto(data) {
    if (Array.isArray(data?.payload)) return data.payload[0];
    return data?.payload?.contact || data?.contact || data?.payload || data;
  }

  function extraerConversaciones(data) {
    if (Array.isArray(data?.payload)) return data.payload;
    if (Array.isArray(data?.data?.payload)) return data.data.payload;
    if (Array.isArray(data)) return data;
    return [];
  }

  function extraerSourceId(contacto, inboxBuscado) {
    const enlaces = contacto?.contact_inboxes || contacto?.contactInboxes || [];
    const enlace = enlaces.find(item => Number(item.inbox?.id || item.inbox_id) === inboxBuscado);
    return enlace?.source_id || enlace?.sourceId || null;
  }

  async function buscarOCrearContacto(telefono) {
    const limpio = normalizarTelefono(telefono);
    const internacional = `+${limpio}`;
    const busqueda = await http.get(
      url('/contacts/search'),
      opciones({ params: { q: internacional } })
    );

    let contacto = listaContactos(busqueda.data).find(item =>
      normalizarTelefono(item.phone_number || item.identifier) === limpio
    );

    if (!contacto) {
      const creado = await http.post(
        url('/contacts'),
        {
          inbox_id: inboxId,
          name: `WhatsApp ${internacional}`,
          phone_number: internacional,
          identifier: limpio
        },
        opciones()
      );

      contacto = extraerContacto(creado.data);
      return {
        contacto,
        sourceId:
          creado.data?.payload?.contact_inbox?.source_id ||
          creado.data?.contact_inbox?.source_id ||
          extraerSourceId(contacto, inboxId) ||
          limpio
      };
    }

    // La búsqueda puede devolver una versión resumida sin los vínculos a bandejas.
    if (!Array.isArray(contacto.contact_inboxes) && !Array.isArray(contacto.contactInboxes)) {
      const detalle = await http.get(url(`/contacts/${contacto.id}`), opciones());
      contacto = extraerContacto(detalle.data);
    }

    let sourceId = extraerSourceId(contacto, inboxId);
    if (!sourceId) {
      const enlace = await http.post(
        url(`/contacts/${contacto.id}/contact_inboxes`),
        { inbox_id: inboxId, source_id: limpio },
        opciones()
      );
      sourceId = enlace.data?.source_id || enlace.data?.payload?.source_id || limpio;
    }

    return { contacto, sourceId };
  }

  async function buscarOCrearConversacion(contactId, sourceId) {
    const respuesta = await http.get(
      url(`/contacts/${contactId}/conversations`),
      opciones()
    );

    let conversacion = extraerConversaciones(respuesta.data).find(item =>
      Number(item.inbox_id) === inboxId &&
      ['open', 'pending', 'snoozed'].includes(item.status)
    );
    let nueva = false;

    if (!conversacion) {
      const creada = await http.post(
        url('/conversations'),
        {
          source_id: sourceId,
          inbox_id: inboxId,
          contact_id: contactId,
          status: 'open'
        },
        opciones()
      );
      conversacion = creada.data;
      nueva = true;
    }

    return { conversacion, nueva };
  }

  function estadoAsignacion(conversacion) {
    if (conversacion?.meta && Object.prototype.hasOwnProperty.call(conversacion.meta, 'assignee')) {
      return conversacion.meta.assignee ? 'assigned' : 'unassigned';
    }
    if (Object.prototype.hasOwnProperty.call(conversacion || {}, 'assignee_id')) {
      return conversacion.assignee_id ? 'assigned' : 'unassigned';
    }
    return 'unknown';
  }

  async function obtenerEstadoAsignacion(conversationId) {
    try {
      const respuesta = await http.get(
        url(`/conversations/${conversationId}`),
        opciones()
      );
      return estadoAsignacion(respuesta.data);
    } catch (error) {
      console.error('No se pudo verificar la asignación en Chatwoot:', error.response?.data || error.message);
      return 'unknown';
    }
  }

  async function crearMensaje(conversationId, content, { privado = false } = {}) {
    return http.post(
      url(`/conversations/${conversationId}/messages`),
      {
        content,
        message_type: privado ? 'outgoing' : 'incoming',
        private: privado
      },
      opciones()
    );
  }

  async function registrarEntrada({ telefono, texto }) {
    if (!estaConfigurado()) {
      return { enabled: false, assignmentStatus: 'unknown' };
    }

    const { contacto, sourceId } = await buscarOCrearContacto(telefono);
    const { conversacion, nueva } = await buscarOCrearConversacion(contacto.id, sourceId);
    await crearMensaje(conversacion.id, texto);
    const assignmentStatus = await obtenerEstadoAsignacion(conversacion.id);

    return {
      enabled: true,
      contactId: contacto.id,
      conversationId: conversacion.id,
      newConversation: nueva,
      assignmentStatus
    };
  }

  async function agregarNotaPrivada(conversationId, content) {
    if (!estaConfigurado()) return;
    await crearMensaje(conversationId, content, { privado: true });
  }

  async function actualizarEstadoMensaje(conversationId, messageId, status, externalError) {
    const cuerpo = { status };
    if (status === 'failed' && externalError) cuerpo.external_error = externalError;

    return http.patch(
      url(`/conversations/${conversationId}/messages/${messageId}`),
      cuerpo,
      opciones()
    );
  }

  return {
    estaConfigurado,
    registrarEntrada,
    agregarNotaPrivada,
    actualizarEstadoMensaje,
    estadoAsignacion
  };
}

module.exports = { crearChatwootAdapter, normalizarTelefono };
