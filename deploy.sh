#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_NAME="api"

echo "[1/6] Indo para $APP_DIR"
cd "$APP_DIR"

echo "[2/6] Atualizando codigo"
if [ -d ".git" ]; then
  echo "Repositorio Git detectado, executando git pull..."
  git pull
else
  echo "Aviso: .git nao encontrado em $APP_DIR. Pulando git pull."
  echo "Se quiser atualizar codigo, faca upload/sync dos arquivos antes do deploy."
fi

echo "[3/6] Build da imagem"
docker compose build --no-cache "$SERVICE_NAME"

echo "[4/6] Subindo servico"
docker compose up -d "$SERVICE_NAME"

echo "[5/6] Healthcheck"
sleep 3
curl -fsS http://localhost:3000/healthz || {
  echo "Healthcheck falhou"
  docker compose logs --tail=100 "$SERVICE_NAME"
  exit 1
}

echo "[6/6] Logs recentes"
docker compose logs --tail=80 "$SERVICE_NAME"

echo "Deploy concluido com sucesso."