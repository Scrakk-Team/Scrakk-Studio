#!/usr/bin/env bash
# Copyright 2026 Scrakk Studio
# SPDX-License-Identifier: Apache-2.0
# Licencia completa en LICENSE (Apache License 2.0).

# Lanzador dev para el .desktop (el dock no puede reproducir `npm run dev`).
# Si ya hay instancia corriendo, el single-instance lock la enfoca.
set -euo pipefail
cd "$(dirname "$0")/../.."
exec npm run dev --silent
