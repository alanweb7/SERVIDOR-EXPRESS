# Admin Manager API

Manual de uso das rotas administrativas para controlar agentes OpenClaw via backend `servidor-api-rest`.

## Base URL
- Local: `http://localhost:3000`
- Producao: `https://SEU_HOST`

## Seguranca
As rotas admin aceitam uma das opcoes:
- `x-admin-key: <ADMIN_MANAGER_TOKEN>`
- `Authorization: Bearer <ADMIN_MANAGER_TOKEN>`

Se credencial for invalida, retorna `401 UNAUTHORIZED`.

## Variavel obrigatoria
```env
ADMIN_MANAGER_TOKEN=change-me-admin-token
```

## Rotas

### 1) Menu administrativo
`GET /api/v1/admin/manager/menu`

Retorna as secoes MVP:
- agentes
- prompts/personalidade
- canais/instancias
- atendimento
- fluxos n8n
- midia
- monitoramento
- seguranca

Curl:
```bash
curl -s http://localhost:3000/api/v1/admin/manager/menu \
  -H "x-admin-key: change-me-admin-token"
```

---

### 2) Listar agentes
`GET /api/v1/admin/manager/agents`

Curl:
```bash
curl -s http://localhost:3000/api/v1/admin/manager/agents \
  -H "x-admin-key: change-me-admin-token"
```

---

### 3) Criar agente persistente
`POST /api/v1/admin/manager/agents/create`

Payload:
```json
{
  "agent": "suporte",
  "workspace": "/data/.openclaw/workspace",
  "model": "openai-codex/gpt-5.3-codex",
  "non_interactive": true
}
```

Observacoes:
- `agent` obrigatorio.
- `workspace`, `model`, `non_interactive` sao opcionais (com default).

Curl:
```bash
curl -s -X POST http://localhost:3000/api/v1/admin/manager/agents/create \
  -H "Content-Type: application/json" \
  -H "x-admin-key: change-me-admin-token" \
  -d '{
    "agent":"suporte",
    "workspace":"/data/.openclaw/workspace",
    "model":"openai-codex/gpt-5.3-codex",
    "non_interactive":true
  }'
```

---

### 4) Definir identidade
`POST /api/v1/admin/manager/agents/set-identity`

Payload:
```json
{
  "agent": "suporte",
  "name": "Eduardo Santos",
  "emoji": "🛠️"
}
```

Curl:
```bash
curl -s -X POST http://localhost:3000/api/v1/admin/manager/agents/set-identity \
  -H "Content-Type: application/json" \
  -H "x-admin-key: change-me-admin-token" \
  -d '{
    "agent":"suporte",
    "name":"Eduardo Santos",
    "emoji":"🛠️"
  }'
```

---

### 5) Vincular canal
`POST /api/v1/admin/manager/agents/bind`

Payload:
```json
{
  "agent": "suporte",
  "bind": "whatsapp"
}
```

Curl:
```bash
curl -s -X POST http://localhost:3000/api/v1/admin/manager/agents/bind \
  -H "Content-Type: application/json" \
  -H "x-admin-key: change-me-admin-token" \
  -d '{
    "agent":"suporte",
    "bind":"whatsapp"
  }'
```

---

### 6) Criar agente por template
`POST /api/v1/admin/manager/agents/create-from-template`

Payload:
```json
{
  "name": "Suporte Organix",
  "slug": "suporte-organix",
  "channel": "whatsapp",
  "persona": "educado, objetivo, humano",
  "language": "pt-BR",
  "system_prompt": "Voce e um agente de suporte tecnico da Organix...",
  "welcome_message": "Ola! Como posso te ajudar hoje?",
  "menu_options": [
    "1) Suporte Tecnico",
    "2) Financeiro",
    "3) Comercial"
  ],
  "fallback_message": "Nao entendi. Responda com 1, 2 ou 3.",
  "transfer_to_human": true,
  "active": true,
  "workspace": "/data/.openclaw/workspace",
  "model": "openai-codex/gpt-5.3-codex"
}
```

Curl:
```bash
curl -s -X POST http://localhost:3000/api/v1/admin/manager/agents/create-from-template \
  -H "Content-Type: application/json" \
  -H "x-admin-key: change-me-admin-token" \
  -d '{
    "name":"Suporte Organix",
    "slug":"suporte-organix",
    "channel":"whatsapp",
    "persona":"educado, objetivo, humano",
    "language":"pt-BR",
    "system_prompt":"Voce e um agente de suporte tecnico da Organix...",
    "welcome_message":"Ola! Como posso te ajudar hoje?",
    "menu_options":["1) Suporte Tecnico","2) Financeiro","3) Comercial"],
    "fallback_message":"Nao entendi. Responda com 1, 2 ou 3.",
    "transfer_to_human":true,
    "active":true,
    "workspace":"/data/.openclaw/workspace",
    "model":"openai-codex/gpt-5.3-codex"
  }'
```

## Fluxo recomendado (producao)
1. Criar agente (`agents/create`).
2. Definir identidade (`agents/set-identity`).
3. Vincular canal (`agents/bind`).
4. Validar listagem (`agents`).

## Exemplo rapido de fluxo completo
```bash
# Criar
curl -s -X POST http://localhost:3000/api/v1/admin/manager/agents/create \
  -H "Content-Type: application/json" \
  -H "x-admin-key: change-me-admin-token" \
  -d '{"agent":"suporte"}'

# Identidade
curl -s -X POST http://localhost:3000/api/v1/admin/manager/agents/set-identity \
  -H "Content-Type: application/json" \
  -H "x-admin-key: change-me-admin-token" \
  -d '{"agent":"suporte","name":"Eduardo Santos","emoji":"🛠️"}'

# Bind canal
curl -s -X POST http://localhost:3000/api/v1/admin/manager/agents/bind \
  -H "Content-Type: application/json" \
  -H "x-admin-key: change-me-admin-token" \
  -d '{"agent":"suporte","bind":"whatsapp"}'
```

## Respostas
Sucesso:
```json
{
  "ok": true,
  "data": {
    "command": "docker exec ...",
    "output": {},
    "raw": "...",
    "stderr": null
  }
}
```

Erro:
```json
{
  "ok": false,
  "error": {
    "code": "admin_manager_command_failed",
    "message": "Falha no comando administrativo OpenClaw",
    "request_id": "req-..."
  }
}
```

## Boas praticas
- Rotacione `ADMIN_MANAGER_TOKEN` periodicamente.
- Restrinja por rede/IP no reverse proxy.
- Nao exponha rotas admin publicamente sem controle de origem.
- Registre auditoria das chamadas com `request_id`.