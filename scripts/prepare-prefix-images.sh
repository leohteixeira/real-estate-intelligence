#!/usr/bin/env bash
set -Eeuo pipefail
# Serialized before browser campaigns; root-based images retain their existing preparation.
export COMPOSE_DISABLE_ENV_FILE=1
export COMPOSE_ENV_FILES=
VITE_PUBLIC_BASE=/real-estate-intelligence/ \
  docker compose --file compose.yaml --project-name rei-prefix-images build web
# The prefix campaign reads prepared Search, whose override runs the API image's build stage.
PREPARED_SEARCH_SOURCE_ROOT="$PWD" \
  docker compose --file compose.yaml --file integration/fixtures/prepared-search.compose.yaml \
  --project-name rei-prefix-images build api
