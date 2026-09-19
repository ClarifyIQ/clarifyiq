const test = require('node:test');
const assert = require('node:assert/strict');

const { crearChatwootAdapter, normalizarTelefono } = require('../chatwootAdapter');

const env = {
  CHATWOOT_ENABLED: 'true',
  CHATWOOT_BASE_URL: 'https://app.chatwoot.com/',
  CHATWOOT_ACCOUNT_ID: '185048',
  CHATWOOT_INBOX_ID: '137532',
  CHATWOOT_API_ACCESS_TOKEN: 'token-prueba'
};

test('normaliza teléfonos para Meta y Chatwoot', () => {
  assert.equal(normalizarTelefono('+54 9 376-1234567'), '5493761234567');
});

test('exige todas las variables y el interruptor activo', () => {
  assert.equal(crearChatwootAdapter({ env }).estaConfigurado(), true);
  assert.equal(crearChatwootAdapter({ env: { ...env, CHATWOOT_ENABLED: 'false' } }).estaConfigurado(), false);
  assert.equal(crearChatwootAdapter({ env: { ...env, CHATWOOT_API_ACCESS_TOKEN: '' } }).estaConfigurado(), false);
});

test('distingue conversación asignada, sin asignar e incierta', () => {
  const adapter = crearChatwootAdapter({ env });
  assert.equal(adapter.estadoAsignacion({ meta: { assignee: { id: 1 } } }), 'assigned');
  assert.equal(adapter.estadoAsignacion({ meta: { assignee: null } }), 'unassigned');
  assert.equal(adapter.estadoAsignacion({}), 'unknown');
});

test('crea contacto, conversación y mensaje entrante', async () => {
  const llamadas = [];
  const http = {
    get: async (url) => {
      llamadas.push(['get', url]);
      if (url.endsWith('/contacts/search')) return { data: { payload: [] } };
      if (url.endsWith('/conversations/900')) {
        return { data: { id: 900, meta: { assignee: null } } };
      }
      throw new Error(`GET inesperado: ${url}`);
    },
    post: async (url, body) => {
      llamadas.push(['post', url, body]);
      if (url.endsWith('/contacts')) {
        return {
          data: {
            payload: {
              contact: { id: 70 },
              contact_inbox: { source_id: '5491' }
            }
          }
        };
      }
      if (url.endsWith('/contacts/70/conversations')) {
        return { data: { payload: [] } };
      }
      if (url.endsWith('/conversations')) return { data: { id: 900 } };
      if (url.endsWith('/conversations/900/messages')) return { data: { id: 901 } };
      throw new Error(`POST inesperado: ${url}`);
    }
  };

  // Contact conversations is a GET in the adapter.
  const getOriginal = http.get;
  http.get = async (url, options) => {
    if (url.endsWith('/contacts/70/conversations')) {
      llamadas.push(['get', url]);
      return { data: { payload: [] } };
    }
    return getOriginal(url, options);
  };

  const resultado = await crearChatwootAdapter({ env, http }).registrarEntrada({
    telefono: '+54 91',
    texto: 'Necesito patio'
  });

  assert.equal(resultado.contactId, 70);
  assert.equal(resultado.conversationId, 900);
  assert.equal(resultado.newConversation, true);
  assert.equal(resultado.assignmentStatus, 'unassigned');
  assert.ok(llamadas.some(item =>
    item[0] === 'post' &&
    item[1].endsWith('/conversations/900/messages') &&
    item[2].message_type === 'incoming' &&
    item[2].private === false
  ));
});

test('acepta la estructura documentada al crear un contacto', async () => {
  const http = {
    get: async (url) => {
      if (url.endsWith('/contacts/search')) return { data: { payload: [] } };
      if (url.endsWith('/contacts/71/conversations')) return { data: { payload: [] } };
      if (url.endsWith('/conversations/901')) {
        return { data: { id: 901, meta: { assignee: null } } };
      }
      throw new Error(`GET inesperado: ${url}`);
    },
    post: async (url) => {
      if (url.endsWith('/contacts')) {
        return {
          data: {
            payload: [{
              id: 71,
              phone_number: '+5491',
              contact_inboxes: [{ inbox: { id: 137532 }, source_id: 'fuente-71' }]
            }]
          }
        };
      }
      if (url.endsWith('/conversations')) return { data: { id: 901 } };
      if (url.endsWith('/conversations/901/messages')) return { data: { id: 902 } };
      throw new Error(`POST inesperado: ${url}`);
    }
  };

  const resultado = await crearChatwootAdapter({ env, http }).registrarEntrada({
    telefono: '5491',
    texto: 'Necesito patio'
  });

  assert.equal(resultado.contactId, 71);
  assert.equal(resultado.conversationId, 901);
});

test('reutiliza contacto y conversación abiertos', async () => {
  const posts = [];
  const http = {
    get: async (url) => {
      if (url.endsWith('/contacts/search')) {
        return {
          data: {
            payload: [{
              id: 4,
              phone_number: '+5491',
              contact_inboxes: [{ inbox_id: 137532, source_id: '5491' }]
            }]
          }
        };
      }
      if (url.endsWith('/contacts/4/conversations')) {
        return { data: { payload: [{ id: 5, inbox_id: 137532, status: 'open' }] } };
      }
      if (url.endsWith('/conversations/5')) {
        return { data: { id: 5, meta: { assignee: { id: 2 } } } };
      }
      throw new Error(`GET inesperado: ${url}`);
    },
    post: async (url, body) => {
      posts.push([url, body]);
      return { data: { id: 6 } };
    }
  };

  const resultado = await crearChatwootAdapter({ env, http }).registrarEntrada({
    telefono: '5491',
    texto: 'Otro dato'
  });

  assert.equal(resultado.newConversation, false);
  assert.equal(resultado.assignmentStatus, 'assigned');
  assert.equal(posts.length, 1);
  assert.ok(posts[0][0].endsWith('/conversations/5/messages'));
});
