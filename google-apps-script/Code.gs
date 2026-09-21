const SPREADSHEET_ID = '1ExOyllQswP9vFq_43CT9Ma5YnbPsD-eXgoc3rZlcNsY';
const SHEET_NAME = 'Tablero';
const FICHA_TEMPLATE_NAME = 'Ficha comprador';
const FICHA_PREFIX = 'Ficha - ';
const FIRST_DATA_ROW = 6;

function respuestaJson(datos) {
  return ContentService
    .createTextOutput(JSON.stringify(datos))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const cuerpo = JSON.parse(e.postData?.contents || '{}');
    const secretoEsperado = PropertiesService
      .getScriptProperties()
      .getProperty('CLARIFYIQ_SYNC_SECRET');

    if (!secretoEsperado || cuerpo.secreto !== secretoEsperado) {
      return respuestaJson({ ok: false, error: 'No autorizado' });
    }

    if (cuerpo.accion !== 'upsert' || !cuerpo.busqueda?.telefono) {
      return respuestaJson({ ok: false, error: 'Solicitud inválida' });
    }

    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = spreadsheet.getSheetByName(SHEET_NAME);
    if (!sheet) return respuestaJson({ ok: false, error: 'No existe la pestaña Tablero' });

    const busqueda = cuerpo.busqueda;
    const row = buscarFila(sheet, busqueda.telefono) || buscarFilaLibre(sheet);
    const existente = sheet.getRange(row, 1, 1, 13).getValues()[0];
    const esNueva = !existente[0];

    const valores = esNueva
      ? filaNueva(busqueda)
      : filaActualizada(existente, busqueda);

    sheet.getRange(row, 1, 1, 13).setValues([valores]);

    if (busqueda.referenciaEconomicaOriginal) {
      sheet.getRange(row, 6).setNote(
        `Referencia económica original:\n${busqueda.referenciaEconomicaOriginal}`
      );
    }

    if (busqueda.descripcionOriginal) {
      sheet.getRange(row, 13).setNote(
        `Último dato del comprador:\n${busqueda.descripcionOriginal}`
      );
    }

    const ficha = sincronizarFicha(spreadsheet, busqueda);

    return respuestaJson({
      ok: true,
      row,
      created: esNueva,
      ficha
    });
  } catch (error) {
    console.error(error);
    return respuestaJson({ ok: false, error: String(error.message || error) });
  } finally {
    lock.releaseLock();
  }
}

function sincronizarFicha(spreadsheet, busqueda) {
  // La ficha se crea recién después de que el comprador confirma su nombre.
  // Esto evita pestañas provisionales basadas únicamente en el teléfono.
  if (!busqueda.nombre || !busqueda.idBusqueda) {
    return { synced: false, reason: 'nombre_pendiente' };
  }

  let ficha = buscarFicha(spreadsheet, busqueda.idBusqueda);
  let creada = false;

  if (!ficha) {
    const plantilla = spreadsheet.getSheetByName(FICHA_TEMPLATE_NAME);
    if (!plantilla) {
      throw new Error('No existe la pestaña Ficha comprador');
    }

    ficha = plantilla.copyTo(spreadsheet);
    ficha.setName(nombreFichaDisponible(spreadsheet, busqueda));
    creada = true;
  }

  actualizarFicha(ficha, busqueda, creada);
  return { synced: true, created: creada, sheetName: ficha.getName() };
}

function buscarFicha(spreadsheet, idBusqueda) {
  const fichas = spreadsheet
    .getSheets()
    .filter(sheet => sheet.getName().startsWith(FICHA_PREFIX));

  for (let indice = 0; indice < fichas.length; indice += 1) {
    if (String(fichas[indice].getRange('B5').getDisplayValue()).trim() === idBusqueda) {
      return fichas[indice];
    }
  }

  return null;
}

function nombreFichaDisponible(spreadsheet, busqueda) {
  const nombreLimpio = String(busqueda.nombre || 'Comprador')
    .replace(/[\\/?:*\[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 70) || 'Comprador';
  const base = `${FICHA_PREFIX}${nombreLimpio}`;

  if (!spreadsheet.getSheetByName(base)) return base;

  const ultimosDigitos = soloDigitos(busqueda.telefono).slice(-4) || 'nuevo';
  const alternativa = `${base} ${ultimosDigitos}`.slice(0, 95);
  if (!spreadsheet.getSheetByName(alternativa)) return alternativa;

  let numero = 2;
  while (spreadsheet.getSheetByName(`${alternativa} ${numero}`.slice(0, 100))) {
    numero += 1;
  }
  return `${alternativa} ${numero}`.slice(0, 100);
}

function actualizarFicha(ficha, busqueda, creada) {
  ficha.getRange('A2').setValue(`CasaLista - ficha de búsqueda viva — ${busqueda.nombre}`);

  completarSiVacio(ficha, 'B5', busqueda.idBusqueda);
  completarSiVacio(ficha, 'E5', busqueda.estado || 'Orientable');
  completarSiVacio(ficha, 'H5', busqueda.prioridad);
  completarSiVacio(ficha, 'B6', busqueda.nombre);
  completarSiVacio(ficha, 'F6', busqueda.telefono);
  ficha.getRange('F7').setValue(fechaValida(busqueda.ultimaActualizacion));

  completarSiVacio(ficha, 'B10', busqueda.tipoPropiedad);
  completarSiVacio(ficha, 'B11', busqueda.zonaPrincipal);
  completarSiVacio(ficha, 'B12', busqueda.presupuestoMaximoUsd);
  completarSiVacio(ficha, 'E12', busqueda.dineroDisponibleUsd);
  completarSiVacio(ficha, 'H12', busqueda.prioridad);
  completarSiVacio(ficha, 'B15', busqueda.descripcionOriginal);
  completarSiVacio(ficha, 'B44', busqueda.proximaAccion || 'Revisar búsqueda en Chatwoot');
  completarSiVacio(ficha, 'E45', 'Automático');

  ficha.getRange('B12:C12').setNumberFormat('"USD" #,##0.00');
  ficha.getRange('E12:F12').setNumberFormat('"USD" #,##0.00');

  if (creada) {
    ficha.getRange('A37').setValue(fechaValida(busqueda.ultimaActualizacion));
    ficha.getRange('B37').setValue('Búsqueda orientable registrada automáticamente');
    ficha.getRange('G37').setValue('ClarifyIQ');
  }
}

function completarSiVacio(sheet, rango, valor) {
  if (valor === null || valor === undefined || valor === '') return;
  const celda = sheet.getRange(rango);
  if (!celda.getValue()) celda.setValue(valor);
}

function buscarFila(sheet, telefono) {
  const ultimaFila = Math.max(sheet.getLastRow(), FIRST_DATA_ROW);
  const telefonos = sheet
    .getRange(FIRST_DATA_ROW, 3, ultimaFila - FIRST_DATA_ROW + 1, 1)
    .getDisplayValues();
  const buscado = soloDigitos(telefono);

  for (let indice = 0; indice < telefonos.length; indice += 1) {
    if (soloDigitos(telefonos[indice][0]) === buscado) {
      return FIRST_DATA_ROW + indice;
    }
  }

  return null;
}

function buscarFilaLibre(sheet) {
  const limite = Math.max(sheet.getLastRow(), 205);
  const ids = sheet
    .getRange(FIRST_DATA_ROW, 1, limite - FIRST_DATA_ROW + 1, 1)
    .getDisplayValues();

  for (let indice = 0; indice < ids.length; indice += 1) {
    if (!ids[indice][0]) return FIRST_DATA_ROW + indice;
  }

  return limite + 1;
}

function filaNueva(busqueda) {
  return [
    busqueda.idBusqueda || '',
    busqueda.nombre || '',
    busqueda.telefono || '',
    busqueda.tipoPropiedad || '',
    busqueda.zonaPrincipal || '',
    busqueda.presupuestoMaximoUsd || '',
    busqueda.dineroDisponibleUsd || '',
    busqueda.prioridad || '',
    '',
    busqueda.estado || 'Orientable',
    '',
    fechaValida(busqueda.ultimaActualizacion),
    busqueda.proximaAccion || 'Revisar búsqueda en Chatwoot'
  ];
}

function filaActualizada(existente, busqueda) {
  const actualizada = [...existente];
  if (!actualizada[0]) actualizada[0] = busqueda.idBusqueda || '';
  if (!actualizada[1] && busqueda.nombre) actualizada[1] = busqueda.nombre;
  actualizada[2] = busqueda.telefono || actualizada[2];
  if (!actualizada[3] && busqueda.tipoPropiedad) actualizada[3] = busqueda.tipoPropiedad;
  if (!actualizada[4] && busqueda.zonaPrincipal) actualizada[4] = busqueda.zonaPrincipal;
  if (!actualizada[5] && busqueda.presupuestoMaximoUsd) {
    actualizada[5] = busqueda.presupuestoMaximoUsd;
  }
  if (!actualizada[6] && busqueda.dineroDisponibleUsd) {
    actualizada[6] = busqueda.dineroDisponibleUsd;
  }
  if (!actualizada[7] && busqueda.prioridad) actualizada[7] = busqueda.prioridad;
  if (!actualizada[9]) actualizada[9] = busqueda.estado || 'Orientable';
  actualizada[11] = fechaValida(busqueda.ultimaActualizacion);
  if (!actualizada[12]) {
    actualizada[12] = busqueda.proximaAccion || 'Revisar búsqueda en Chatwoot';
  }
  return actualizada;
}

function fechaValida(valor) {
  const fecha = new Date(valor);
  return Number.isNaN(fecha.getTime()) ? new Date() : fecha;
}

function soloDigitos(valor) {
  return String(valor || '').replace(/\D/g, '');
}
