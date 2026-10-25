#!/usr/bin/env bash
set -Eeuo pipefail
# Serialized before browser campaigns; root-based images retain their existing preparation.
COMPOSE_DISABLE_ENV_FILE=1 COMPOSE_ENV_FILES= VITE_PUBLIC_BASE=/real-estate-intelligence/ \
  docker compose --file compose.yaml --project-name rei-prefix-images build web
