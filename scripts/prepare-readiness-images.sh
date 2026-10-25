#!/usr/bin/env bash

set -Eeuo pipefail

# Keep installation/build outside the HTTP scenario and serialize image work.
# The UUID fixture tags these local images into its own Compose project.
export COMPOSE_DISABLE_ENV_FILE=1
export COMPOSE_ENV_FILES=
for service in migrations api web; do
  docker compose --file compose.yaml --project-name rei-readiness-images build "${service}"
done
