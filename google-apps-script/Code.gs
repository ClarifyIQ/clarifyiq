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
    actualizarTableroOrganizado(sheet, row, busqueda);

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
  if (!busqueda.organizacion) completarSiVacio(ficha, 'H5', busqueda.prioridad);
  completarSiVacio(ficha, 'B6', busqueda.nombre);
  completarSiVacio(ficha, 'F6', busqueda.telefono);
  ficha.getRange('F7').setValue(fechaValida(busqueda.ultimaActualizacion));

  if (!busqueda.organizacion) {
    completarSiVacio(ficha, 'B10', busqueda.tipoPropiedad);
    completarSiVacio(ficha, 'B11', busqueda.zonaPrincipal);
    completarSiVacio(ficha, 'B12', busqueda.presupuestoMaximoUsd);
    completarSiVacio(ficha, 'E12', busqueda.dineroDisponibleUsd);
    completarSiVacio(ficha, 'H12', busqueda.prioridad);
    completarSiVacio(ficha, 'B15', busqueda.descripcionOriginal);
  }
  completarSiVacio(ficha, 'B44', busqueda.proximaAccion || 'Revisar búsqueda en Chatwoot');
  completarSiVacio(ficha, 'E45', 'Automático');

  if (busqueda.organizacion) {
    actualizarFichaOrganizada(ficha, busqueda.organizacion);
  } else {
    ficha.getRange('B12:C12').setNumberFormat('"USD" #,##0.00');
    ficha.getRange('E12:F12').setNumberFormat('"USD" #,##0.00');
  }

  if (creada) {
    ficha.getRange('A37').setValue(fechaValida(busqueda.ultimaActualizacion));
    ficha.getRange('B37').setValue('Búsqueda orientable registrada automáticamente');
    ficha.getRange('G37').setValue('ClarifyIQ');
  }
}

function actualizarTableroOrganizado(sheet, row, busqueda) {
  const organizacion = busqueda.organizacion;
  if (!organizacion) {
    if (busqueda.fechaLimite && !sheet.getRange(row, 9).getValue()) {
      sheet.getRange(row, 9).setValue(busqueda.fechaLimite);
    }
    return;
  }

  actualizarCeldaAutomatica(
    sheet.getRange(row, 4),
    organizacion.tipoPropiedad?.valor,
    'tipoPropiedad',
    organizacion.tipoPropiedad?.textoOriginal
  );
  actualizarCeldaAutomatica(
    sheet.getRange(row, 5),
    organizacion.zonas?.principal,
    'zonaPrincipal',
    organizacion.zonas?.textoOriginal
  );
  actualizarCeldaAutomatica(
    sheet.getRange(row, 6),
    formatearMonto(organizacion.presupuestoMaximo),
    'presupuestoMaximo',
    organizacion.presupuestoMaximo?.textoOriginal
  );
  actualizarCeldaAutomatica(
    sheet.getRange(row, 7),
    formatearMonto(organizacion.dineroDisponible),
    'dineroDisponible',
    organizacion.dineroDisponible?.textoOriginal
  );
  actualizarCeldaAutomatica(
    sheet.getRange(row, 8),
    prioridadDesdeOrganizacion(organizacion),
    'prioridad',
    organizacion.urgencia?.textoOriginal
  );
  actualizarCeldaAutomatica(
    sheet.getRange(row, 9),
    organizacion.fechaLimite?.texto,
    'fechaLimite',
    organizacion.fechaLimite?.texto
  );
}

function actualizarFichaOrganizada(ficha, organizacion) {
  actualizarCeldaAutomatica(
    ficha.getRange('H5'),
    prioridadDesdeOrganizacion(organizacion),
    'prioridad',
    organizacion.urgencia?.textoOriginal
  );
  actualizarCeldaAutomatica(
    ficha.getRange('B10'),
    organizacion.tipoPropiedad?.valor,
    'tipoPropiedad',
    organizacion.tipoPropiedad?.textoOriginal
  );
  actualizarCeldaAutomatica(
    ficha.getRange('B11'),
    organizacion.zonas?.principal,
    'zonaPrincipal',
    organizacion.zonas?.textoOriginal
  );
  actualizarCeldaAutomatica(
    ficha.getRange('F11'),
    (organizacion.zonas?.alternativas || []).join(', '),
    'zonasAlternativas',
    organizacion.zonas?.textoOriginal
  );
  actualizarCeldaAutomatica(
    ficha.getRange('B12'),
    formatearMonto(organizacion.presupuestoMaximo),
    'presupuestoMaximo',
    organizacion.presupuestoMaximo?.textoOriginal
  );
  actualizarCeldaAutomatica(
    ficha.getRange('E12'),
    formatearMonto(organizacion.dineroDisponible),
    'dineroDisponible',
    organizacion.dineroDisponible?.textoOriginal
  );
  actualizarCeldaAutomatica(
    ficha.getRange('B13'),
    describirFinanciacion(organizacion.financiacion),
    'financiacion',
    organizacion.financiacion?.textoOriginal
  );
  actualizarCeldaAutomatica(
    ficha.getRange('B14'),
    organizacion.dormitorios?.cantidad,
    'dormitorios',
    organizacion.dormitorios?.textoOriginal
  );
  actualizarCeldaAutomatica(
    ficha.getRange('B15'),
    describirCaracteristicas(organizacion.caracteristicas),
    'caracteristicas',
    evidenciaCaracteristicas(organizacion.caracteristicas)
  );
  actualizarCeldaAutomatica(
    ficha.getRange('F10'),
    organizacion.fechaLimite?.texto,
    'fechaLimite',
    organizacion.fechaLimite?.texto
  );
  actualizarCeldaAutomatica(
    ficha.getRange('H12'),
    etiquetaUrgencia(organizacion.urgencia?.nivel),
    'urgencia',
    organizacion.urgencia?.textoOriginal
  );

  actualizarListaProtegida(ficha, 'B19', organizacion.situacionFamiliar, 'situacionFamiliar');
  actualizarListaProtegida(ficha, 'B20', organizacion.necesidadesEspeciales, 'necesidadesEspeciales');
  actualizarListaProtegida(ficha, 'B21', organizacion.cosasAEvitar, 'cosasAEvitar');
  actualizarRequisitos(ficha, organizacion.caracteristicas || []);
  registrarCambios(ficha, organizacion.cambiosDetectados || []);
}

function actualizarListaProtegida(sheet, rango, valores, campo) {
  const texto = Array.isArray(valores) ? valores.filter(Boolean).join('; ') : '';
  actualizarCeldaAutomatica(sheet.getRange(rango), texto, campo, texto);
}

function actualizarRequisitos(ficha, caracteristicas) {
  const inicio = 26;
  const fin = 34;
  const nombres = ficha.getRange(inicio, 1, fin - inicio + 1, 1).getDisplayValues();

  caracteristicas.forEach(caracteristica => {
    const nombre = String(caracteristica?.nombre || '').trim();
    if (!nombre) return;

    let fila = null;
    for (let indice = 0; indice < nombres.length; indice += 1) {
      if (normalizarComparacion(nombres[indice][0]) === normalizarComparacion(nombre)) {
        fila = inicio + indice;
        break;
      }
      if (fila === null && !nombres[indice][0]) fila = inicio + indice;
    }
    if (!fila) return;

    actualizarCeldaAutomatica(
      ficha.getRange(fila, 1),
      nombre,
      `requisito:${nombre}`,
      caracteristica.textoOriginal
    );

    const clasificacion = etiquetaClasificacion(caracteristica.clasificacion);
    if (clasificacion) {
      actualizarCeldaAutomatica(
        ficha.getRange(fila, 5),
        clasificacion,
        `clasificacion:${nombre}`,
        caracteristica.textoOriginal
      );
    }
    actualizarCeldaAutomatica(
      ficha.getRange(fila, 6),
      caracteristica.textoOriginal,
      `evidencia:${nombre}`,
      caracteristica.textoOriginal
    );
  });
}

function registrarCambios(ficha, cambios) {
  if (!Array.isArray(cambios) || !cambios.length) return;
  const inicio = 37;
  const fin = 42;

  cambios.forEach(cambio => {
    const descripcion = describirCambio(cambio);
    if (!descripcion) return;

    const existentes = ficha.getRange(inicio, 2, fin - inicio + 1, 1).getDisplayValues().flat();
    if (existentes.includes(descripcion)) return;

    let fila = existentes.findIndex(valor => !valor);
    if (fila >= 0) {
      fila += inicio;
    } else {
      const valores = ficha.getRange(inicio + 1, 1, fin - inicio, 7).getValues();
      ficha.getRange(inicio, 1, fin - inicio, 7).setValues(valores);
      fila = fin;
    }

    ficha.getRange(fila, 1).setValue(new Date());
    ficha.getRange(fila, 2).setValue(descripcion);
    ficha.getRange(fila, 7).setValue('Organizador CasaLista');
  });
}

function describirCambio(cambio) {
  if (!cambio?.campo || !cambio?.tipoCambio) return '';
  const anterior = valorLegible(cambio.valorAnterior);
  const nuevo = valorLegible(cambio.valorNuevo);
  return `${cambio.campo}: ${cambio.tipoCambio} — ${anterior || 'sin dato'} → ${nuevo || 'sin dato'}`;
}

function actualizarCeldaAutomatica(celda, valor, campo, evidencia) {
  if (valor === null || valor === undefined || valor === '') return false;

  const actual = celda.getValue();
  const marca = leerMarcaAutomatica(celda.getNote());
  const puedeActualizar = !actual ||
    (!marca && String(actual) === String(valor)) ||
    (marca && String(actual) === String(marca.valor));

  if (!puedeActualizar) return false;

  celda.setValue(valor);
  celda.setNote(notaAutomatica(campo, valor, evidencia));
  return true;
}

function notaAutomatica(campo, valor, evidencia) {
  const metadata = JSON.stringify({ campo, valor: String(valor) });
  const detalle = evidencia ? `\nEvidencia del comprador:\n${evidencia}` : '';
  return `CLARIFYIQ_AUTO\n${metadata}${detalle}`;
}

function leerMarcaAutomatica(nota) {
  const lineas = String(nota || '').split('\n');
  if (lineas[0] !== 'CLARIFYIQ_AUTO' || !lineas[1]) return null;
  try {
    return JSON.parse(lineas[1]);
  } catch (_error) {
    return null;
  }
}

function formatearMonto(dato) {
  if (!dato || dato.monto === null || dato.monto === undefined) return '';
  const moneda = dato.moneda || 'UNKNOWN';
  const numero = Number(dato.monto);
  if (!Number.isFinite(numero)) return '';
  const formateado = numero.toLocaleString('es-AR', { maximumFractionDigits: 2 });
  return `${moneda} ${formateado}`;
}

function describirFinanciacion(dato) {
  if (!dato || dato.estado === 'desconocido') return '';
  if (dato.estado === 'no') return 'No requiere financiación';
  const partes = ['Sí'];
  if (dato.tipo) partes.push(dato.tipo);
  const monto = formatearMonto(dato);
  if (monto) partes.push(monto);
  return partes.join(' — ');
}

function describirCaracteristicas(caracteristicas) {
  if (!Array.isArray(caracteristicas)) return '';
  return caracteristicas.map(item => item?.nombre).filter(Boolean).join(', ');
}

function evidenciaCaracteristicas(caracteristicas) {
  if (!Array.isArray(caracteristicas)) return '';
  return [...new Set(caracteristicas.map(item => item?.textoOriginal).filter(Boolean))].join('\n');
}

function prioridadDesdeOrganizacion(organizacion) {
  return etiquetaUrgencia(organizacion?.urgencia?.nivel);
}

function etiquetaUrgencia(nivel) {
  const etiquetas = { alta: 'Alta', media: 'Media', baja: 'Baja' };
  return etiquetas[nivel] || '';
}

function etiquetaClasificacion(valor) {
  const etiquetas = {
    indispensable: 'Indispensable',
    preferido: 'Preferido',
    flexible: 'Flexible'
  };
  return etiquetas[valor] || '';
}

function valorLegible(valor) {
  if (valor === null || valor === undefined || valor === '') return '';
  if (typeof valor === 'object') return JSON.stringify(valor);
  return String(valor);
}

function normalizarComparacion(valor) {
  return String(valor || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
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
  const organizada = Boolean(busqueda.organizacion);
  return [
    busqueda.idBusqueda || '',
    busqueda.nombre || '',
    busqueda.telefono || '',
    organizada ? '' : (busqueda.tipoPropiedad || ''),
    organizada ? '' : (busqueda.zonaPrincipal || ''),
    organizada ? '' : (busqueda.presupuestoMaximoUsd || ''),
    organizada ? '' : (busqueda.dineroDisponibleUsd || ''),
    organizada ? '' : (busqueda.prioridad || ''),
    organizada ? '' : (busqueda.fechaLimite || ''),
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
  if (!busqueda.organizacion) {
    if (!actualizada[3] && busqueda.tipoPropiedad) actualizada[3] = busqueda.tipoPropiedad;
    if (!actualizada[4] && busqueda.zonaPrincipal) actualizada[4] = busqueda.zonaPrincipal;
    if (!actualizada[5] && busqueda.presupuestoMaximoUsd) {
      actualizada[5] = busqueda.presupuestoMaximoUsd;
    }
    if (!actualizada[6] && busqueda.dineroDisponibleUsd) {
      actualizada[6] = busqueda.dineroDisponibleUsd;
    }
    if (!actualizada[7] && busqueda.prioridad) actualizada[7] = busqueda.prioridad;
    if (!actualizada[8] && busqueda.fechaLimite) actualizada[8] = busqueda.fechaLimite;
  }
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
