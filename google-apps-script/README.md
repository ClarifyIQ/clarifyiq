# Sincronización ClarifyIQ -> Google Sheets

Este directorio contiene el receptor que actualiza la pestaña `Tablero` y las
fichas individuales de la planilla `CasaLista - Organización de compradores`.

## Activación

1. Abrir la planilla y entrar en `Extensiones > Apps Script`.
2. Reemplazar el contenido de `Code.gs` por el de este directorio.
3. En `Configuración del proyecto > Propiedades del script`, crear
   `CLARIFYIQ_SYNC_SECRET` con un secreto largo que no se guarde en GitHub.
4. Implementar como aplicación web:
   - ejecutar como el propietario;
   - acceso: cualquier usuario.
5. En Railway agregar:
   - `GOOGLE_SHEETS_WEBHOOK_URL`: URL de la aplicación web;
   - `GOOGLE_SHEETS_SYNC_SECRET`: el mismo secreto.

Sin esas dos variables, la integración queda desactivada y ClarifyIQ continúa
funcionando normalmente.

## Comportamiento

- Sincroniza solamente búsquedas orientables.
- Usa el teléfono para actualizar siempre la misma fila.
- Cuando el comprador confirma su nombre, copia la plantilla `Ficha comprador`
  y crea su ficha individual.
- Usa el número de búsqueda para actualizar siempre la misma ficha y evitar
  duplicados.
- La plantilla original nunca se modifica.
- No reemplaza estado, prioridad ni próxima acción si un operador ya los editó.
- Conserva como notas la referencia económica y el último detalle compartido.
- Un error de Google Sheets no detiene WhatsApp ni Chatwoot.
