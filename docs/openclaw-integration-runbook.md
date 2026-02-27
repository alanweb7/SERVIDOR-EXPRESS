# OpenClaw Integration Runbook

## Fluxo alvo
1. `POST /api/v1/ai/reply` recebe inbound.
2. `lab-api` tenta `WS` no gateway OpenClaw.
3. Se erro de permissao/pairing (`missing scope`, `pairing required`, `origin not allowed`), usa fallback:
   `docker exec <openclaw-container> openclaw gateway call chat.send --json --params ...`
4. API retorna `delivery_mode: "ws"` ou `delivery_mode: "fallback-cli"`.

## Variaveis de ambiente
- `OPENCLAW_GATEWAY_URL=ws://openclaw:18789`
- `OPENCLAW_GATEWAY_TOKEN=...`
- `OPENCLAW_AGENT_ID=main`
- `OPENCLAW_SESSION_DEFAULT=agent:main:main`
- `OPENCLAW_DEVICE_ID=lab-api-main`
- `OPENCLAW_DEVICE_IDENTITY_PATH=/app/.openclaw/device-identity.json`
- `OPENCLAW_ENABLE_FALLBACK_CLI=true`
- `OPENCLAW_FALLBACK_CONTAINER=openclaw-cvsy-openclaw-1`
- `OPENCLAW_CONNECT_TIMEOUT_MS=15000`
- `OPENCLAW_DEBUG=false`

## Teste WS
```bash
docker exec -it lab-api node /app/scripts/test-openclaw-ws-quick.js
```

## Teste fallback CLI
```bash
docker exec -it openclaw-cvsy-openclaw-1 sh -lc \
'openclaw gateway call chat.send --json --params "{\"sessionKey\":\"agent:main:main\",\"message\":\"ping\",\"idempotencyKey\":\"manual-001\"}"'
```

## Pairing (modo definitivo)
1. Executar cliente WS com device identity ativo.
2. O arquivo de identidade e chave privada e criado em `OPENCLAW_DEVICE_IDENTITY_PATH`.
2. Capturar request de pairing no gateway.
3. Aprovar no OpenClaw:
```bash
openclaw devices approve <requestId>
```
4. Revalidar envio WS sem fallback (`delivery_mode=ws`).

## Diagnostico rapido
- `missing scope: operator.write`: token sem escopo de escrita.
- `pairing required`: dispositivo nao aprovado.
- `origin not allowed`: cliente autenticado como UI sem origem permitida.
- `invalid request frame`: frame fora de `type/id/method/params`.

## Rollback
1. Definir `OPENCLAW_ENABLE_FALLBACK_CLI=false`.
2. Reiniciar `lab-api`.
3. Confirmar no log que apenas `delivery_mode=ws` aparece.

## Hardening (obrigatorio apos estabilizar)
Desativar:
- `gateway.controlUi.dangerouslyDisableDeviceAuth`
- `gateway.controlUi.dangerouslyAllowHostHeaderOriginFallback`

Configurar:
- `gateway.auth.rateLimit` (exemplo: `maxAttempts=10`, `windowMs=60000`, `lockoutMs=300000`)
