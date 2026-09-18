#!/usr/bin/env bash
# Lanzador dev para el .desktop (el dock no puede reproducir `npm run dev`).
# Si ya hay instancia corriendo, el single-instance lock la enfoca.
set -euo pipefail
cd "$(dirname "$0")/../.."
exec npm run dev --silent
