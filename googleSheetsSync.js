function normalizarTexto(texto) {
  return String(texto || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function normalizarTelefono(telefono) {
  const limpio = String(telefono || '').replace(/\D/g, '');
  return limpio ? `+${limpio}` : '';
}

function ultimoMensaje(estado, categorias) {
  const buscadas = new Set(categorias);
  const historial = Array.isArray(estado?.historial) ? estado.historial : [];

  for (let indice = historial.length - 1; indice >= 0; indice -= 1) {
    const evento = historial[indice];
    if (buscadas.has(evento?.categoria) && evento?.mensajeOriginal) {
      return String(evento.mensajeOriginal).trim();
    }
  }

  return '';
}

function detectarTipoPropiedad(estado) {
  const mensaje = ultimoMensaje(estado, ['PREGUNTAR_CONTINUIDAD']);
  const texto = normalizarTexto(mensaje);

  if (/\b(duplex|ph)\b/.test(texto)) return 'Dúplex / PH';
  if (/\b(departamento|depto|monoambiente)\b/.test(texto)) return 'Departamento';
  if (/\b(terreno|lote)\b/.test(texto)) return 'Terreno';
  if (/\b(quinta|chacra|campo)\b/.test(texto)) return 'Quinta / Campo';
  if (/\b(local|comercio|propiedad comercial)\b/.test(texto)) return 'Local o propiedad comercial';
  if (/\b(casa|vivienda|propiedad)\b/.test(texto)) return 'Casa';
  return '';
}

function convertirNumero(numero, unidad) {
  let normalizado = String(numero || '').replace(/\s/g, '');
  if (normalizado.includes('.') && normalizado.includes(',')) {
    normalizado = normalizado.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(?:\.\d{3})+$/.test(normalizado)) {
    normalizado = normalizado.replace(/\./g, '');
  } else {
    normalizado = normalizado.replace(',', '.');
  }

  const valor = Number(normalizado);
  if (!Number.isFinite(valor)) return null;

  const u = normalizarTexto(unidad);
  if (u === 'mil' || u === 'k') return Math.round(valor * 1000);
  if (u === 'millon' || u === 'millones') return Math.round(valor * 1000000);
  return Math.round(valor);
}

function extraerMontoUsd(textoOriginal) {
  const texto = normalizarTexto(textoOriginal);
  if (!/(usd|u\$s|dolar|dolares)/.test(texto)) return null;

  const despues = texto.match(/(\d[\d.,\s]*)(?:\s*)(mil|k|millon|millones)?\s*(?:usd|u\$s|dolar|dolares)/);
  if (despues) return convertirNumero(despues[1], despues[2]);

  const antes = texto.match(/(?:usd|u\$s|dolar|dolares)\s*(\d[\d.,\s]*)(?:\s*)(mil|k|millon|millones)?/);
  if (antes) return convertirNumero(antes[1], antes[2]);

  return null;
}

function crearPayloadBusqueda({
  telefono,
  nombre,
  estado,
  organizacion = null,
  ahora = new Date()
}) {
  const telefonoNormalizado = normalizarTelefono(telefono);
  const referenciaEconomicaOriginal = ultimoMensaje(estado, ['PEDIR_DESCRIPCION_LIBRE']);
  const descripcionOriginal = ultimoMensaje(estado, [
    'PREGUNTAR_NOMBRE',
    'ACOMPANAMIENTO',
    'SEGUIMIENTO_PRIORITARIO'
  ]);

  const prioridadOrganizada = organizacion?.urgencia?.nivel === 'alta' ? 'Alta' : '';

  return {
    idBusqueda: `CL-${telefonoNormalizado.replace(/\D/g, '')}`,
    nombre: String(nombre || '').trim(),
    telefono: telefonoNormalizado,
    tipoPropiedad: organizacion?.tipoPropiedad?.valor || detectarTipoPropiedad(estado),
    zonaPrincipal: organizacion?.zonas?.principal || '',
    presupuestoMaximoUsd: organizacion
      ? null
      : extraerMontoUsd(referenciaEconomicaOriginal),
    dineroDisponibleUsd: null,
    prioridad: prioridadOrganizada || (estado?.seguimientoPrioritario ? 'Alta' : ''),
    fechaLimite: organizacion?.fechaLimite?.texto || '',
    estado: 'Orientable',
    ultimaActualizacion: ahora.toISOString(),
    proximaAccion: 'Revisar búsqueda en Chatwoot',
    referenciaEconomicaOriginal,
    descripcionOriginal,
    organizacion
  };
}

function crearGoogleSheetsSync({ env = process.env, http } = {}) {
  const endpoint = String(env.GOOGLE_SHEETS_WEBHOOK_URL || '').trim();
  const secreto = String(env.GOOGLE_SHEETS_SYNC_SECRET || '').trim();

  function estaConfigurado() {
    return Boolean(endpoint && secreto);
  }

  async function sincronizarBusqueda({ telefono, nombre, estado, organizacion = null }) {
    if (!estado?.orientable || !estaConfigurado()) {
      return { enabled: estaConfigurado(), synced: false };
    }

    const cliente = http || require('axios');
    const busqueda = crearPayloadBusqueda({ telefono, nombre, estado, organizacion });
    const respuesta = await cliente.post(
      endpoint,
      { secreto, accion: 'upsert', busqueda },
      { timeout: 8000, headers: { 'Content-Type': 'application/json' } }
    );

    if (respuesta?.data?.ok !== true) {
      throw new Error(respuesta?.data?.error || 'Google Sheets no confirmó la sincronización');
    }

    return { enabled: true, synced: true, row: respuesta.data.row };
  }

  return { estaConfigurado, sincronizarBusqueda };
}

module.exports = {
  crearGoogleSheetsSync,
  crearPayloadBusqueda,
  detectarTipoPropiedad,
  extraerMontoUsd,
  normalizarTelefono
};
