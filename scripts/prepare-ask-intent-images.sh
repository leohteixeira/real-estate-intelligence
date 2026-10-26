#!/usr/bin/env bash

set -Eeuo pipefail

# Keep serial cold image preparation outside the bounded routed Ask scenario.
# Its UUID fixture tags these local images into its own Compose project.
export COMPOSE_DISABLE_ENV_FILE=1
export COMPOSE_ENV_FILES=
for service in migrations api ai worker; do
  docker compose --file compose.yaml --project-name rei-intent-images build "${service}"
done
