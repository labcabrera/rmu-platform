#!/usr/bin/env bash
# Renders the PlantUML diagrams of this folder to SVG, next to their source.
#
#   docs/diagrams/render.sh                       # every *.plantuml of the folder
#   docs/diagrams/render.sh c4-context.plantuml   # only some
#
# It runs PlantUML from its Docker image: the C4 library the diagrams include needs a recent PlantUML, newer than the
# distribution packages. The diagrams include that library from GitHub, so rendering needs network access.
# PLANTUML_IMAGE overrides the image.
set -euo pipefail

PLANTUML_IMAGE="${PLANTUML_IMAGE:-plantuml/plantuml:1.2026.8}"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

if [ "$#" -gt 0 ]; then
  files=("$@")
else
  shopt -s nullglob
  files=(*.plantuml)
fi
if [ "${#files[@]}" -eq 0 ]; then
  echo "No .plantuml files in $DIR" >&2
  exit 1
fi

for f in "${files[@]}"; do
  f="$(basename "$f")"
  [ -f "$f" ] || { echo "Not found: $DIR/$f" >&2; exit 1; }
done

# -failfast2 stops at the first diagram with errors; the files are written as the host user.
docker run --rm -u "$(id -u):$(id -g)" -v "$DIR":/data -w /data "$PLANTUML_IMAGE" \
  -tsvg -failfast2 "${files[@]##*/}"

for f in "${files[@]}"; do
  echo "Rendered ${f%.plantuml}.svg"
done
