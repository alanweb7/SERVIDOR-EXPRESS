# OpenClaw WS Integration (lab-api -> openclaw)

## Arquitetura
- `lab-api` conecta via WebSocket no gateway OpenClaw (`openclaw:18789`).
- `lab-api` recebe `connect.challenge`, responde `connect`, envia `chat.send`.
- Resposta do Nolan volta no frame WS e segue para persistencia + dispatch outbound.

## Variaveis de ambiente
- `OPENCLAW_GATEWAY_URL=ws://openclaw:18789`
- `OPENCLAW_GATEWAY_TOKEN=...`
- `OPENCLAW_AGENT_ID=...`
- `OPENCLAW_SESSION_DEFAULT=agent:main:main`
- `OPENCLAW_CONNECT_TIMEOUT_MS=15000`
- `OPENCLAW_DEBUG=false`

## Teste rapido entre containers
Dentro do container `lab-api`:

```bash
node scripts/test-openclaw-ws-quick.js
```

Esperado no log:
- `OPEN`
- `challenge recebido`
- `connect ok` (ou erro claro)
- `chat.send ok` (ou erro claro)
- `close code/reason`

## Validar handshake
1. Abrir WS em `OPENCLAW_GATEWAY_URL`.
2. Aguardar `event=connect.challenge`.
3. Enviar `req=connect` com:
- `token`
- `role=operator`
- `scopes=["operator.write"]`
- `client` e `device` (nonce assinado).

## Pairing (producao)
Se retornar `pairing required`:
1. Aprovar dispositivo no gateway OpenClaw.
2. Repetir handshake.
3. Confirmar `connect.ok`.

## Diagnostico rapido: missing scope
Erro `missing scope: operator.write`:
1. Confirmar role/scopes no frame `connect`.
2. Validar permissoes do token no gateway.
3. Validar policy de auth do OpenClaw.

## Checklist seguranca pos-debug
Desativar:
- `gateway.controlUi.dangerouslyDisableDeviceAuth`
- `gateway.controlUi.dangerouslyAllowHostHeaderOriginFallback`

Configurar:
- `gateway.auth.rateLimit`
- token de gateway com menor privilegio necessario
- `OPENCLAW_DEBUG=false`
