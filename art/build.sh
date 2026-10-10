#!/bin/sh
# Rebuilds public/models/<class>.glb from art/figures/<class>.py with headless Blender.
# Usage: art/build.sh [class ...]   (default: every figure). PREVIEW=<dir> also renders <dir>/<class>.png and <class>-back.png.
set -e
cd "$(dirname "$0")/.."
BLENDER=${BLENDER:-/Applications/Blender.app/Contents/MacOS/Blender}
[ $# -gt 0 ] || set -- $(ls art/figures/*.py | xargs -n1 basename | sed 's/\.py$//' | grep -vE '^(common|lookdev|hands)$')
for cls in "$@"; do
  extra=""
  [ -n "$PREVIEW" ] && mkdir -p "$PREVIEW" && extra="--preview $PREVIEW/$cls.png"
  "$BLENDER" --background --factory-startup --python-exit-code 1 --python "art/figures/$cls.py" -- "public/models/$cls.glb" $extra > "/tmp/blender-$cls.log" 2>&1 \
    || { tail -30 "/tmp/blender-$cls.log"; echo "build: $cls failed"; exit 1; }
  echo "build: public/models/$cls.glb ($(wc -c < "public/models/$cls.glb" | tr -d ' ') bytes)"
done
