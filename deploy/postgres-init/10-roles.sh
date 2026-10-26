#!/bin/sh
# Runs once, on an empty data directory: the two roles, their passwords and the directory
# database (apps/server/db/roles.sql; deployment.md section 4).
set -eu
psql -v ON_ERROR_STOP=1 -U postgres -f /aos-db/roles.sql
psql -v ON_ERROR_STOP=1 -U postgres <<SQL
alter role aos_migration password '${AOS_MIGRATION_PASSWORD}';
alter role aos_runtime password '${AOS_RUNTIME_PASSWORD}';
create database aos_directory owner aos_migration;
SQL
