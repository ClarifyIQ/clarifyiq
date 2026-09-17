# Integración Chatwoot

La entrada de WhatsApp continúa llegando desde Meta a `POST /webhook`.
Chatwoot funciona únicamente como bandeja para la atención humana mediante un canal API.

## Variables de entorno

- `CHATWOOT_ENABLED=true`
- `CHATWOOT_BASE_URL=https://app.chatwoot.com`
- `CHATWOOT_ACCOUNT_ID`
- `CHATWOOT_INBOX_ID`
- `CHATWOOT_API_ACCESS_TOKEN`
- `CHATWOOT_WEBHOOK_SECRET`

## Webhook de Chatwoot

URL: `POST /webhook/chatwoot`

El endpoint valida la firma HMAC de Chatwoot usando los encabezados
`X-Chatwoot-Timestamp` y `X-Chatwoot-Signature`. Sólo acepta mensajes públicos
salientes creados por un agente humano en la cuenta y bandeja configuradas.

## Control humano

- Conversación sin asignar: CLARIFYIQ puede responder automáticamente.
- Conversación asignada a un agente: CLARIFYIQ registra el mensaje, pero no responde.
- Estado de asignación incierto o error de Chatwoot: no se envía una respuesta automática.

Para apagar la integración sin modificar el webhook de Meta, establecer
`CHATWOOT_ENABLED=false` o eliminar la variable.
