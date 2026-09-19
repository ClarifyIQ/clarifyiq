const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');

const { crearApp } = require('../index');
const { firmaEsperada } = require('../chatwootWebhook');

async function conServidor(app, ejecutar) {
  const servidor = app.listen(0, '127.0.0.1');
  await once(servidor, 'listening');
  const { port } = servidor.address();
  try {
    await ejecutar(`http://127.0.0.1:${port}`);
  } finally {
    servidor.close();
    await once(servidor, 'close');
  }
}

test('el webhook de Meta delega mensajes de texto al procesador integrado', async () => {
  const recibidos = [];
  const procesador = {
    procesar: async entrada => {
      recibidos.push(entrada);
      return {
        estado: { etapa: 'apertura' },
        respuestaAutomatica: true,
        chatwoot: false
      };
    }
  };
  const app = crearApp({ procesador, env: {} });

  await conServidor(app, async baseUrl => {
    const respuesta = await fetch(`${baseUrl}/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entry: [{ changes: [{ value: { messages: [{ from: '5491', text: { body: 'Hola' } }] } }] }]
      })
    });
    assert.equal(respuesta.status, 200);
  });

  assert.deepEqual(recibidos, [{ telefono: '5491', texto: 'Hola' }]);
});

test('el webhook de Chatwoot conserva el cuerpo original y reenvía la respuesta humana', async () => {
  const now = Date.now();
  const timestamp = String(Math.floor(now / 1000));
  const env = {
    CHATWOOT_ENABLED: 'true',
    CHATWOOT_ACCOUNT_ID: '10',
    CHATWOOT_INBOX_ID: '20',
    CHATWOOT_WEBHOOK_SECRET: 'secreto'
  };
  const enviados = [];
  const app = crearApp({
    env,
    chatwoot: { estaConfigurado: () => true },
    enviarMeta: async (telefono, texto) => enviados.push([telefono, texto])
  });
  const payload = {
    event: 'message_created',
    id: 300,
    account: { id: 10 },
    inbox: { id: 20 },
    message_type: 'outgoing',
    private: false,
    sender_type: 'User',
    content: 'Te responde un asesor',
    conversation: { meta: { sender: { phone_number: '+54 91' } } }
  };
  const rawBody = JSON.stringify(payload);

  await conServidor(app, async baseUrl => {
    const respuesta = await fetch(`${baseUrl}/webhook/chatwoot`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Chatwoot-Timestamp': timestamp,
        'X-Chatwoot-Signature': firmaEsperada('secreto', timestamp, rawBody),
        'X-Chatwoot-Delivery': 'entrega-300'
      },
      body: rawBody
    });
    assert.equal(respuesta.status, 200);
  });

  assert.deepEqual(enviados, [['5491', 'Te responde un asesor']]);
});
