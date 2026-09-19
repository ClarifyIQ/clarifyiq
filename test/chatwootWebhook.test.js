const test = require('node:test');
const assert = require('node:assert/strict');

const {
  firmaEsperada,
  verificarFirma,
  esMensajeHumanoSaliente,
  telefonoDePayload
} = require('../chatwootWebhook');

test('acepta una firma HMAC válida y reciente', () => {
  const now = 1_800_000_000_000;
  const timestamp = String(now / 1000);
  const rawBody = '{"event":"message_created"}';
  const signature = firmaEsperada('secreto', timestamp, rawBody);
  assert.equal(verificarFirma({ secret: 'secreto', timestamp, signature, rawBody, now }), true);
});

test('rechaza firma inválida', () => {
  assert.equal(verificarFirma({
    secret: 'secreto',
    timestamp: '1800000000',
    signature: 'sha256=incorrecta',
    rawBody: '{}',
    now: 1_800_000_000_000
  }), false);
});

test('rechaza timestamp viejo', () => {
  const rawBody = '{}';
  const signature = firmaEsperada('secreto', '100', rawBody);
  assert.equal(verificarFirma({
    secret: 'secreto',
    timestamp: '100',
    signature,
    rawBody,
    now: 1_800_000_000_000
  }), false);
});

test('detecta mensaje humano saliente', () => {
  assert.equal(esMensajeHumanoSaliente({
    event: 'message_created',
    message_type: 'outgoing',
    private: false,
    sender_type: 'User'
  }), true);
});

test('ignora notas privadas', () => {
  assert.equal(esMensajeHumanoSaliente({
    event: 'message_created',
    message_type: 1,
    private: true,
    sender_type: 'User'
  }), false);
});

test('ignora mensajes de contacto', () => {
  assert.equal(esMensajeHumanoSaliente({
    event: 'message_created',
    message_type: 0,
    private: false,
    sender_type: 'Contact'
  }), false);
});

test('ignora mensajes de bot', () => {
  assert.equal(esMensajeHumanoSaliente({
    event: 'message_created',
    message_type: 1,
    private: false,
    sender_type: 'AgentBot'
  }), false);
});

test('extrae el teléfono del contacto de la conversación', () => {
  assert.equal(telefonoDePayload({
    conversation: { meta: { sender: { phone_number: '+54 9 376 123-4567' } } }
  }), '5493761234567');
});

test('marca como enviado en Chatwoot después de entregarlo a Meta', async () => {
  const now = 1_800_000_000_000;
  const timestamp = String(now / 1000);
  const payload = {
    id: 20,
    event: 'message_created',
    message_type: 'outgoing',
    private: false,
    sender_type: 'User',
    account: { id: 185048 },
    inbox: { id: 137532 },
    content: 'Hola',
    conversation: {
      id: 10,
      meta: { sender: { phone_number: '+54 9 376 123-4567' } }
    }
  };
  const rawBody = JSON.stringify(payload);
  const headers = {
    'x-chatwoot-timestamp': timestamp,
    'x-chatwoot-signature': firmaEsperada('secreto', timestamp, rawBody),
    'x-chatwoot-delivery': 'entrega-1'
  };
  const llamadasMeta = [];
  const estados = [];
  const manejador = require('../chatwootWebhook').crearManejadorChatwoot({
    env: {
      CHATWOOT_ENABLED: 'true',
      CHATWOOT_WEBHOOK_SECRET: 'secreto',
      CHATWOOT_ACCOUNT_ID: '185048',
      CHATWOOT_INBOX_ID: '137532'
    },
    enviarMeta: async (...args) => llamadasMeta.push(args),
    actualizarEstadoMensaje: async (...args) => estados.push(args),
    now: () => now
  });
  const req = {
    rawBody: Buffer.from(rawBody),
    body: payload,
    get: nombre => headers[nombre.toLowerCase()]
  };
  const res = {
    sendStatus(codigo) {
      this.codigo = codigo;
      return this;
    }
  };

  await manejador(req, res);

  assert.equal(res.codigo, 200);
  assert.deepEqual(llamadasMeta, [['5493761234567', 'Hola']]);
  assert.deepEqual(estados, [[10, 20, 'sent']]);
});
