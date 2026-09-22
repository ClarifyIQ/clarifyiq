# Organizador inteligente de compradores V1

El organizador se ejecuta únicamente para búsquedas orientables y no genera
respuestas para el comprador. Su salida sirve para mantener la ficha operativa
de Google Sheets.

## Activación

Por defecto está desactivado. Para una activación futura requiere estas tres
variables en Railway:

- `BUYER_ORGANIZER_ENABLED=true`
- `OPENAI_API_KEY`
- `OPENAI_ORGANIZER_MODEL`

Si falta cualquiera de ellas, no se llama a OpenAI y continúa funcionando la
sincronización básica existente.

## Comportamiento seguro

- Se ejecuta en segundo plano después de guardar el estado de ClarifyIQ.
- Omite saludos, cortesías y mensajes sin información organizable.
- Mantiene separados presupuesto máximo, dinero disponible y financiación.
- Conserva la organización anterior y registra cambios o contradicciones.
- Ignora resultados antiguos que terminen después de un análisis más reciente.
- Un error o demora de OpenAI no interrumpe WhatsApp ni Chatwoot.
- Google Sheets sólo actualiza automáticamente una celda si sigue conteniendo
  el último valor escrito por ClarifyIQ. Si un operador la corrigió, se conserva
  la corrección manual.

## Fuente de información en V1

La fuente principal es `sessionStore`, que contiene los mensajes del comprador
anteriores y posteriores a ORIENTABLE. La incorporación de mensajes escritos
por operadores desde Chatwoot queda preparada para una versión posterior.
