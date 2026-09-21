const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class RangoFalso {
  constructor(sheet, a1) {
    this.sheet = sheet;
    this.a1 = a1;
  }

  getValue() {
    return this.sheet.valores.get(this.a1) || '';
  }

  getDisplayValue() {
    return String(this.getValue());
  }

  setValue(valor) {
    this.sheet.valores.set(this.a1, valor);
    return this;
  }

  setNumberFormat(formato) {
    this.sheet.formatos.set(this.a1, formato);
    return this;
  }
}

class HojaFalsa {
  constructor(nombre, valores = {}) {
    this.nombre = nombre;
    this.valores = new Map(Object.entries(valores));
    this.formatos = new Map();
  }

  getName() {
    return this.nombre;
  }

  setName(nombre) {
    this.nombre = nombre;
    return this;
  }

  getRange(a1) {
    return new RangoFalso(this, a1);
  }

  copyTo(spreadsheet) {
    const copia = new HojaFalsa(`Copia de ${this.nombre}`);
    spreadsheet.sheets.push(copia);
    return copia;
  }
}

class PlanillaFalsa {
  constructor(sheets) {
    this.sheets = sheets;
  }

  getSheets() {
    return this.sheets;
  }

  getSheetByName(nombre) {
    return this.sheets.find(sheet => sheet.getName() === nombre) || null;
  }
}

function cargarCodigo() {
  const codigo = fs.readFileSync(
    path.join(__dirname, '..', 'google-apps-script', 'Code.gs'),
    'utf8'
  );
  const contexto = { console };
  vm.createContext(contexto);
  vm.runInContext(codigo, contexto);
  return contexto;
}

function busqueda(nombre = 'Dante') {
  return {
    idBusqueda: 'CL-5493512506750',
    nombre,
    telefono: '+5493512506750',
    tipoPropiedad: 'Casa',
    zonaPrincipal: '',
    presupuestoMaximoUsd: 50000,
    dineroDisponibleUsd: null,
    prioridad: '',
    estado: 'Orientable',
    ultimaActualizacion: '2026-09-20T12:00:00.000Z',
    proximaAccion: 'Revisar búsqueda en Chatwoot',
    descripcionOriginal: 'Quiero patio'
  };
}

test('no crea una ficha antes de confirmar el nombre', () => {
  const codigo = cargarCodigo();
  const spreadsheet = new PlanillaFalsa([new HojaFalsa('Ficha comprador')]);

  const resultado = codigo.sincronizarFicha(spreadsheet, busqueda(''));

  assert.deepEqual(
    JSON.parse(JSON.stringify(resultado)),
    { synced: false, reason: 'nombre_pendiente' }
  );
  assert.equal(spreadsheet.getSheets().length, 1);
});

test('crea una ficha desde la plantilla y completa los datos disponibles', () => {
  const codigo = cargarCodigo();
  const spreadsheet = new PlanillaFalsa([new HojaFalsa('Ficha comprador')]);

  const resultado = codigo.sincronizarFicha(spreadsheet, busqueda());
  const ficha = spreadsheet.getSheetByName('Ficha - Dante');

  assert.equal(resultado.synced, true);
  assert.equal(resultado.created, true);
  assert.ok(ficha);
  assert.equal(ficha.getRange('B5').getValue(), 'CL-5493512506750');
  assert.equal(ficha.getRange('B6').getValue(), 'Dante');
  assert.equal(ficha.getRange('B10').getValue(), 'Casa');
  assert.equal(ficha.getRange('B12').getValue(), 50000);
  assert.equal(ficha.getRange('B15').getValue(), 'Quiero patio');
  assert.equal(ficha.getRange('E45').getValue(), 'Automático');
});

test('actualiza la ficha existente sin duplicarla ni pisar datos manuales', () => {
  const codigo = cargarCodigo();
  const plantilla = new HojaFalsa('Ficha comprador');
  const ficha = new HojaFalsa('Ficha - Dante', {
    B5: 'CL-5493512506750',
    B10: 'Casa corregida por operador'
  });
  const spreadsheet = new PlanillaFalsa([plantilla, ficha]);

  const resultado = codigo.sincronizarFicha(spreadsheet, busqueda());

  assert.equal(resultado.created, false);
  assert.equal(spreadsheet.getSheets().length, 2);
  assert.equal(ficha.getRange('B10').getValue(), 'Casa corregida por operador');
  assert.equal(ficha.getRange('B6').getValue(), 'Dante');
});
