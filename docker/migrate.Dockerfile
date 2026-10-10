# syntax=docker/dockerfile:1
FROM postgres:18-alpine

COPY migrations/ /migrations/
COPY scripts/migrate.sh /usr/local/bin/migrate

ENV MIGRATIONS_DIR=/migrations

ENTRYPOINT ["/usr/local/bin/migrate"]
