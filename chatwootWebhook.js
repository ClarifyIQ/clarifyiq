const crypto = require('crypto');

const DEDUPE_TTL_MS = 10 * 60 * 1000;

function compararSeguro(a, b) {
  const primero = Buffer.from(String(a || ''));
  const segundo = Buffer.from(String(b || ''));
  return primero.length === segundo.length && crypto.timingSafeEqual(primero, segundo);
}

function firmaEsperada(secret, timestamp, rawBody) {
  return `sha256=${crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex')}`;
}

function verificarFirma({ secret, timestamp, signature, rawBody, now = Date.now() }) {
  if (!secret || !timestamp || !signature || !rawBody) return false;

  const timestampMs = Number(timestamp) * 1000;
  if (!Number.isFinite(timestampMs) || Math.abs(now - timestampMs) > 5 * 60 * 1000) {
    return false;
  }

  return compararSeguro(signature, firmaEsperada(secret, timestamp, rawBody));
}

function normalizarTelefono(telefono) {
  return String(telefono || '').replace(/\D/g, '');
}

function esMensajeHumanoSaliente(payload) {
  const tipo = payload?.message_type;
  const saliente = tipo === 1 || tipo === 'outgoing';
  const senderType = String(payload?.sender_type || payload?.sender?.type || '').toLowerCase();
  const humano = senderType === 'user' || senderType === 'agent';

  return (
    payload?.event === 'message_created' &&
    saliente &&
    payload?.private !== true &&
    humano
  );
}

function telefonoDePayload(payload) {
  return normalizarTelefono(
    payload?.conversation?.meta?.sender?.phone_number ||
    payload?.conversation?.contact_inbox?.contact?.phone_number ||
    payload?.contact?.phone_number
  );
}

function crearManejadorChatwoot({
  env = process.env,
  enviarMeta,
  actualizarEstadoMensaje,
  now = Date.now
} = {}) {
  const vistos = new Map();

  function limpiarVistos(ahora) {
    for (const [id, fecha] of vistos) {
      if (ahora - fecha > DEDUPE_TTL_MS) vistos.delete(id);
    }
  }

  return async function manejar(req, res) {
    if (env.CHATWOOT_ENABLED !== 'true') return res.sendStatus(404);

    const rawBody = req.rawBody?.toString('utf8') || '';
    const timestamp = req.get('X-Chatwoot-Timestamp');
    const signature = req.get('X-Chatwoot-Signature');

    if (!verificarFirma({
      secret: env.CHATWOOT_WEBHOOK_SECRET,
      timestamp,
      signature,
      rawBody,
      now: now()
    })) {
      return res.sendStatus(401);
    }

    const payload = req.body || {};
    if (
      Number(payload.account?.id || payload.account_id) !== Number(env.CHATWOOT_ACCOUNT_ID) ||
      Number(payload.inbox?.id || payload.inbox_id) !== Number(env.CHATWOOT_INBOX_ID) ||
      !esMensajeHumanoSaliente(payload)
    ) {
      return res.sendStatus(200);
    }

    const texto = String(payload.content || '').trim();
    const telefono = telefonoDePayload(payload);
    if (!texto || !telefono) return res.sendStatus(200);

    const ahora = now();
    limpiarVistos(ahora);
    const deliveryId = req.get('X-Chatwoot-Delivery') || `message:${payload.id}`;
    if (vistos.has(deliveryId)) return res.sendStatus(200);

    try {
      await enviarMeta(telefono, texto);
      vistos.set(deliveryId, ahora);

      if (actualizarEstadoMensaje) {
        try {
          await actualizarEstadoMensaje(payload.conversation?.id, payload.id, 'sent');
        } catch (error) {
          // El mensaje ya salió por WhatsApp. No se devuelve 500 porque Chatwoot
          // podría reintentar el webhook y duplicar el envío al cliente.
          console.error(
            'No se pudo actualizar el estado del mensaje en Chatwoot:',
            error.response?.data || error.message
          );
        }
      }

      return res.sendStatus(200);
    } catch (error) {
      console.error('Error enviando respuesta humana a Meta:', error.response?.data || error.message);
      return res.sendStatus(500);
    }
  };
}

module.exports = {
  crearManejadorChatwoot,
  verificarFirma,
  firmaEsperada,
  esMensajeHumanoSaliente,
  telefonoDePayload
};
