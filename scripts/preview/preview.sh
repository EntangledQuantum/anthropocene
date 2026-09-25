#!/usr/bin/env bash
# Build the site into a private dir (serialised across agents with a lock) and
# screenshot one lesson with every step shown.
#   bash scripts/preview/preview.sh <tag> <route> [maxShots]
#   route e.g. /learn/university-physics/interaction/nothing-keeps-it-going
# Screenshots land in /tmp/anth-shots/<tag>/shot-NN.png — Read them.
set -e
cd "$(dirname "$0")/../.."
TAG="$1"; ROUTE="$2"; N="${3:-16}"
OUT="/tmp/anth-dist/$TAG"; SHOTS="/tmp/anth-shots/$TAG"
mkdir -p "$OUT" "$SHOTS"; rm -f "$SHOTS"/*.png
( flock 9; npx astro build --outDir "$OUT" > "/tmp/anth-dist/$TAG.log" 2>&1 || { tail -40 "/tmp/anth-dist/$TAG.log"; exit 1; } ) 9>/tmp/anth-build.lock
node scripts/preview/shoot.mjs "$OUT" "$ROUTE" "$SHOTS/shot" "$N"
ls "$SHOTS"
