#!/usr/bin/env bash

set -Eeuo pipefail

# CI image preparation for one integration shard (the profile comes from integration/shards.ts).
#
# The four prepare-*-images.sh scripts build one image after another, which suits a shared
# workstation. A hosted runner is a private four-core machine, so the distinct builds run
# together here first; the serial scripts that follow only tag what BuildKit already holds.
#
#   full      every fixture image: migrations, API, prepared-search API, web, prefixed web, AI, worker
#   web-read  only what a read-only web stack starts: migrations, prepared-search API, web
profile="${1:?Usage: prepare-integration-images.sh <full|web-read>}"

export COMPOSE_DISABLE_ENV_FILE=1
export COMPOSE_ENV_FILES=
export PREPARED_SEARCH_SOURCE_ROOT="$PWD"

compose() {
  docker compose --file compose.yaml "$@"
}
prepared_search() {
  compose --file integration/fixtures/prepared-search.compose.yaml "$@"
}

pids=()
case "${profile}" in
  web-read)
    prepared_search --project-name rei-web-read-images build migrations api web &
    pids+=("$!")
    ;;
  full)
    compose --project-name rei-readiness-images build migrations api web &
    pids+=("$!")
    compose --project-name rei-intent-images build ai worker &
    pids+=("$!")
    prepared_search --project-name rei-prefix-images build api &
    pids+=("$!")
    ;;
  *)
    echo "Unknown image profile: ${profile}" >&2
    exit 2
    ;;
esac
for pid in "${pids[@]}"; do
  wait "${pid}"
done

if [[ "${profile}" == full ]]; then
  bash scripts/prepare-readiness-images.sh
  bash scripts/prepare-prefix-images.sh
  bash scripts/prepare-ask-intent-images.sh
  bash scripts/prepare-ask-quota-images.sh
fi
