#!/bin/sh
set -eu
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Please install Node.js 22 or later from https://nodejs.org/"
  exit 1
fi
exec node server.mjs
