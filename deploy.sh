#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_NAME="api"
REQUIRED_PATHS=(
  "Dockerfile"
  "docker-compose.yml"
  "package.json"
  "tsconfig.json"
  "src"
  "scripts"
  "docs"
  "migrations"
)

echo "[1/8] Indo para $APP_DIR"
cd "$APP_DIR"

echo "[2/8] Validando estrutura minima do projeto"
missing=0
for path in "${REQUIRED_PATHS[@]}"; do
  if [ ! -e "$path" ]; then
    echo "ERRO: caminho obrigatorio ausente: $path"
    missing=1
  fi
done

if [ "$missing" -ne 0 ]; then
  echo ""
  echo "Deploy abortado: projeto incompleto em $APP_DIR."
  echo "Sincronize o repositorio completo antes de executar o deploy."
  exit 1
fi

echo "[3/8] Validando configuracao do docker compose"
docker compose config >/tmp/deploy-compose.effective.yml

echo "[4/8] Atualizando codigo"
if [ -d ".git" ]; then
  echo "Repositorio Git detectado, executando git pull..."
  git pull
else
  echo "Aviso: .git nao encontrado em $APP_DIR. Pulando git pull."
  echo "Se quiser atualizar codigo, faca upload/sync dos arquivos antes do deploy."
fi

echo "[5/8] Build da imagem"
docker compose build --no-cache "$SERVICE_NAME"

echo "[6/8] Subindo servico"
docker compose up -d "$SERVICE_NAME"

echo "[7/8] Healthcheck"
sleep 3
curl -fsS http://localhost:3000/healthz || {
  echo "Healthcheck falhou"
  docker compose logs --tail=100 "$SERVICE_NAME"
  exit 1
}

echo "[8/8] Logs recentes"
docker compose logs --tail=80 "$SERVICE_NAME"

echo "Deploy concluido com sucesso."