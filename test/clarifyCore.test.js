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
