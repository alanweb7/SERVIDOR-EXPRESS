# Admin de Agentes Persistentes (OpenClaw)

Este módulo permite cadastrar identidades/personas de agentes no banco e sincronizar com OpenClaw.

## Segurança

Todos os endpoints abaixo exigem header:

- `x-admin-key: <ADMIN_MANAGER_TOKEN>`

## Tabela criada

- `public.openclaw_agents_registry`

Campos principais:

- `slug` (único do agente)
- `name` (nome de exibição)
- `persona`
- `identity_name` / `identity_emoji`
- `identity_theme`
- `channel`
- `workspace`
- `model`
- `system_prompt`, `welcome_message`, `fallback_message`
- `menu_options` (jsonb array)
- `transfer_to_human`, `active`
- `last_synced_at`

## Rotas

### 1) Listar agentes persistentes

`GET /api/v1/admin/manager/agents/persistent`

```bash
curl -s http://localhost:3000/api/v1/admin/manager/agents/persistent \
  -H "x-admin-key: change-me-admin-token"
```

### 2) Criar/atualizar agente persistente

`POST /api/v1/admin/manager/agents/persistent`

```bash
curl -s http://localhost:3000/api/v1/admin/manager/agents/persistent \
  -H "Content-Type: application/json" \
  -H "x-admin-key: change-me-admin-token" \
  -d '{
    "slug": "suporte-organix",
    "name": "Suporte Organix",
    "persona": "educado, objetivo, humano",
    "identity_name": "Eduardo Santos",
    "identity_emoji": "🛠️",
    "identity_theme": "Suporte técnico objetivo e paciente",
    "channel": "whatsapp",
    "workspace": "/data/.openclaw/agents/suporte-organix/workspace",
    "model": "openai-codex/gpt-5.3-codex",
    "system_prompt": "Você é um agente de suporte técnico da Organix...",
    "welcome_message": "Olá! 👋 Como posso te ajudar hoje?",
    "fallback_message": "Não entendi. Responda com 1, 2 ou 3.",
    "menu_options": ["1) Suporte Técnico", "2) Financeiro", "3) Comercial"],
    "transfer_to_human": true,
    "active": true,
    "metadata": { "provider": "evolution" },
    "sync_openclaw": true
  }'
```

Se `sync_openclaw=true`, já executa:

- `openclaw agents add ... --workspace /data/.openclaw/agents/<slug>/workspace`
- `openclaw agents set-identity ... --theme "<identity_theme|persona>"`
- `openclaw agents bind ...`

### 3) Sincronizar manualmente no OpenClaw

`POST /api/v1/admin/manager/agents/persistent/sync`

```bash
curl -s http://localhost:3000/api/v1/admin/manager/agents/persistent/sync \
  -H "Content-Type: application/json" \
  -H "x-admin-key: change-me-admin-token" \
  -d '{"slug":"suporte-organix"}'
```

## UI (chat-admin-v6)

Nova tela:

- menu/rota `Agentes`
- path: `/agents`

Na tela:

1. Configure `Base URL` da API servidor (`http://host:3000`).
2. Configure `x-admin-key`.
3. Crie/edite agente persistente.
4. Salve e sincronize no OpenClaw.
