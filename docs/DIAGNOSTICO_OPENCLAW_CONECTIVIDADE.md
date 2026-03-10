# Diagnostico de Conectividade OpenClaw (Bridge)

## Diagnostico curto

O erro `ECONNREFUSED` aconteceu porque o bridge tentava falar com o OpenClaw em IP/porta incorretos e, mesmo quando achou o container certo, o gateway (`18789`) estava ouvindo apenas em `127.0.0.1` dentro do container (nao acessivel pela rede Docker).

Depois, ao usar `:3000`, o retorno era HTML da Control UI (login/painel), e nao JSON da API.

## Manual rapido (como resolvemos)

1. Confirmamos o sintoma
- Bridge retornava `ECONNREFUSED ...:18789`.
- Testes `curl` do bridge para destinos antigos falhavam.

2. Validamos que o OpenClaw estava vivo internamente
- Dentro do container OpenClaw:
  - `curl http://127.0.0.1:18789/healthz` -> `200 {"ok":true}`

3. Provamos que estava preso em loopback
- Dentro do mesmo container:
  - `curl http://<IP_CONTAINER>:18789/healthz` -> `Connection refused`
- `/proc/net/tcp` mostrava bind em `127.0.0.1:18789`.

4. Descartamos porta/rota errada do UI
- `:3000` respondia HTML/login/UI (nao API JSON para integracao).

5. Aplicamos workaround definitivo no deploy
- Criamos proxy TCP interno no container:
  - escuta em `0.0.0.0:18790`
  - encaminha para `127.0.0.1:18789`
- Colocamos no `command` do servico para subir junto no redeploy.

6. Atualizamos bridge
- `OPENCLAW_BASE_URL=http://openclaw_ai_openclaw:18790`
- `OPENCLAW_WS_URL=ws://openclaw_ai_openclaw:18790`

7. Validamos fim-a-fim
- `GET /healthz` em `18790` -> `200` JSON
- `POST /v1/responses` com token -> `200` JSON com resposta

## Comandos de validacao para futuros incidentes

```bash
# 1) Saude no bridge -> OpenClaw
curl -i http://openclaw_ai_openclaw:18790/healthz

# 2) Teste real da API
curl -i -X POST http://openclaw_ai_openclaw:18790/v1/responses \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"model":"openai-codex/gpt-5.3-codex","input":"teste"}'
```

## Interpretacao rapida

- Se o passo 1 falhar: problema de rede/servico.
- Se o passo 1 passar e o passo 2 falhar: problema de rota/token/payload.

