#!/usr/bin/env bash

set -Eeuo pipefail

# Serial, resource-bounded preparation stays outside the native campaign deadline.
# These local images contain only the affected API and additive migrations.
for service in migrations api; do
  dockerfile="docker/${service}.Dockerfile"
  if [[ "${service}" == migrations ]]; then dockerfile=docker/migrate.Dockerfile; fi
  docker build --file "${dockerfile}" --tag "rei-quota-images-${service}" \
    --resource memory=1536m --resource cpu-quota=100000 .
done
