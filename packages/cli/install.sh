#!/usr/bin/env bash
# Copyright 2026 Scrakk Studio
# SPDX-License-Identifier: Apache-2.0
# Licencia completa en LICENSE (Apache License 2.0).
#
# Scrakk CLI — instalador de respaldo (sin registry npm).
# Descarga el tarball `cli.tgz` de la última GitHub Release y lo instala global.
#
#   curl -fsSL https://raw.githubusercontent.com/Scrakk-Team/Scrakk-Studio/master/packages/cli/install.sh | bash
#
# Variables: SCRAKK_REPO (owner/repo), SCRAKK_CLI_TAG (latest | cli-vX.Y.Z)

set -euo pipefail

REPO="${SCRAKK_REPO:-Scrakk-Team/Scrakk-Studio}"
TAG="${SCRAKK_CLI_TAG:-latest}"

if [ "$TAG" = "latest" ]; then
  API="https://api.github.com/repos/$REPO/releases/latest"
else
  API="https://api.github.com/repos/$REPO/releases/tags/$TAG"
fi

URL="$(curl -fsSL "$API" | grep -oE 'https://[^"]*cli\.tgz' | head -n1 || true)"
if [ -z "$URL" ]; then
  echo "✗ no encontré cli.tgz en la release de $REPO ($TAG)" >&2
  echo "  alternativa: npm install -g @scrakk-official/cli" >&2
  exit 1
fi

echo "→ descargando $URL"
npm install -g "$URL"
echo "✓ sef instalado"
