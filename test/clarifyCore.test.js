const test = require('node:test');
const assert = require('node:assert/strict');

const { crearEstadoInicial, actualizarEstado } = require('../clarifyCore');

function avanzar(mensajes) {
  return mensajes.reduce(
    (estado, mensaje) => actualizarEstado(mensaje, estado),
    crearEstadoInicial()
  );
}

test('reconoce Yes como respuesta afirmativa de continuidad', () => {
  const estado = avanzar(['Hola', 'Casa', 'Yes']);

  assert.equal(estado.intencion, true);
  assert.equal(estado.etapa, 'referenciaEconomica');
  assert.equal(estado.ultimaAccionEstado, 'PREGUNTAR_REFERENCIA_ECONOMICA');
});

test('retoma continuidad tras dos respuestas no interpretadas', () => {
  const estado = avanzar(['Hola', 'Casa', '3', 'tal vez', 'Si']);

  assert.equal(estado.intencion, true);
  assert.equal(estado.etapa, 'referenciaEconomica');
  assert.equal(estado.ultimaAccionEstado, 'PREGUNTAR_REFERENCIA_ECONOMICA');
});

test('retoma continuidad aunque haya mensajes genéricos después del cierre', () => {
  const estado = avanzar(['Hola', 'Casa', '3', 'tal vez', 'Hola', 'Si']);

  assert.equal(estado.intencion, true);
  assert.equal(estado.etapa, 'referenciaEconomica');
  assert.equal(estado.ultimaAccionEstado, 'PREGUNTAR_REFERENCIA_ECONOMICA');
});

test('retoma referencia económica aunque haya mensajes genéricos después del cierre', () => {
  const estado = avanzar([
    'Hola',
    'Casa',
    'Si',
    'No sé',
    'Todavía no sé',
    'Hola',
    'USD 50000'
  ]);

  assert.equal(estado.referenciaEconomica, true);
  assert.equal(estado.etapa, 'descripcionLibre');
  assert.equal(estado.ultimaAccionEstado, 'PEDIR_DESCRIPCION_LIBRE');
});

test('retoma tipo de propiedad después de cerrar por respuestas inválidas', () => {
  const estado = avanzar(['Hola', 'No sé', 'Tal vez', 'Casa']);

  assert.equal(estado.etapa, 'continuidad');
  assert.equal(estado.ultimaAccionEstado, 'PREGUNTAR_CONTINUIDAD');
});

test('no acepta frases vagas como referencia económica', () => {
  for (const respuesta of ['Me alcanza', 'Puedo pagar', 'Puedo avanzar']) {
    const estado = avanzar(['Hola', 'Casa', 'Si', respuesta]);

    assert.equal(estado.referenciaEconomica, null);
    assert.equal(estado.etapa, 'referenciaEconomica');
    assert.equal(estado.ultimaAccionEstado, 'REFERENCIA_ECONOMICA_NO_VALIDA');
  }
});

test('acepta una frase con un monto económico concreto', () => {
  const estado = avanzar(['Hola', 'Casa', 'Si', 'Me alcanza para USD 50000']);

  assert.equal(estado.referenciaEconomica, true);
  assert.equal(estado.etapa, 'descripcionLibre');
});

test('detecta una cortesía después de llegar a orientable', () => {
  const estado = avanzar([
    'Hola',
    'Casa',
    'Si',
    'USD 50000',
    'Cinco dormitorios',
    'Muchas gracias'
  ]);

  assert.equal(estado.orientable, true);
  assert.equal(estado.etapa, 'orientable');
  assert.equal(estado.ultimaAccionEstado, 'CORTESIA');
});

test('detecta cortesías que no contienen la palabra gracias', () => {
  for (const cortesia of ['Muy amable', 'Qué amable', 'Saludos', 'Hasta luego']) {
    const estado = avanzar([
      'Hola',
      'Casa',
      'Si',
      'USD 50000',
      'Cinco dormitorios',
      cortesia
    ]);

    assert.equal(estado.orientable, true);
    assert.equal(estado.etapa, 'orientable');
    assert.equal(estado.ultimaAccionEstado, 'CORTESIA');
  }
});

test('detecta agradecimiento y conformidad expresados en contexto', () => {
  const estado = avanzar([
    'Hola',
    'Casa',
    'Si',
    'USD 50000',
    'Cinco dormitorios',
    'Voy a recomendarlos, estoy conforme, gracias'
  ]);

  assert.equal(estado.orientable, true);
  assert.equal(estado.etapa, 'orientable');
  assert.equal(estado.ultimaAccionEstado, 'CORTESIA');
});

test('detecta un elogio contextual como cortesía', () => {
  const estado = avanzar([
    'Hola',
    'Casa',
    'Si',
    'USD 50000',
    'Cinco dormitorios',
    'Se pasan por la buena onda, altamente recomendables, muy amable'
  ]);

  assert.equal(estado.orientable, true);
  assert.equal(estado.ultimaAccionEstado, 'CORTESIA');
});

test('ignora emojis al detectar una cortesía', () => {
  const estado = avanzar([
    'Hola',
    'Casa',
    'Si',
    'USD 50000',
    'Cinco dormitorios',
    'Perfecto 👌'
  ]);

  assert.equal(estado.orientable, true);
  assert.equal(estado.ultimaAccionEstado, 'CORTESIA');
});

test('no descarta un dato de búsqueda incluido junto con un agradecimiento', () => {
  const estado = avanzar([
    'Hola',
    'Casa',
    'Si',
    'USD 50000',
    'Cinco dormitorios',
    'Gracias, pero también quiero árboles'
  ]);

  assert.equal(estado.orientable, true);
  assert.equal(estado.etapa, 'orientable');
  assert.equal(estado.ultimaAccionEstado, 'ACOMPANAMIENTO');
});

test('detecta un saludo después de llegar a orientable', () => {
  const estado = avanzar([
    'Hola',
    'Casa',
    'Si',
    'USD 50000',
    'Cinco dormitorios',
    'Buenos días'
  ]);

  assert.equal(estado.orientable, true);
  assert.equal(estado.etapa, 'orientable');
  assert.equal(estado.ultimaAccionEstado, 'SALUDO');
});
 
test('marca como prioritarias las señales de ansiedad y demora', () => {
  for (const mensaje of ['Estoy ansioso', 'Tardan mucho en encontrar', 'Tiempo aproximado en encontrar?']) {
    const estado = avanzar([
      'Hola',
      'Casa',
      'Si',
      'USD 50000',
      'Cinco dormitorios',
      mensaje
    ]);

    assert.equal(estado.orientable, true);
    assert.equal(estado.seguimientoPrioritario, true);
    assert.equal(estado.ultimaAccionEstado, 'SEGUIMIENTO_PRIORITARIO');
  }
});

test('no marca prioridad cuando el cliente aclara que no tiene apuro', () => {
  const estado = avanzar([
    'Hola',
    'Casa',
    'Si',
    'USD 50000',
    'Cinco dormitorios',
    'No tengo apuro'
  ]);

  assert.equal(estado.orientable, true);
  assert.equal(estado.seguimientoPrioritario, false);
  assert.equal(estado.ultimaAccionEstado, 'ACOMPANAMIENTO');
});
