#!/bin/sh
# Renders public/splash/<class>.webp, the champion-select splash, from public/models/<class>.glb with headless Blender.
# Usage: art/splash.sh [class ...]   (default: every figure). KEEP=<dir> also keeps the full-quality <dir>/<class>.png.
set -e
cd "$(dirname "$0")/.."
BLENDER=${BLENDER:-/Applications/Blender.app/Contents/MacOS/Blender}
[ $# -gt 0 ] || set -- $(ls public/models/*.glb | xargs -n1 basename | sed 's/\.glb$//')
mkdir -p public/splash
tmp=$(mktemp -d)
for cls in "$@"; do
  start=$(date +%s)
  "$BLENDER" --background --factory-startup --python-exit-code 1 --python art/splash.py -- "$cls" "$tmp/$cls.png" > "/tmp/splash-$cls.log" 2>&1 \
    || { tail -30 "/tmp/splash-$cls.log"; echo "splash: $cls failed"; exit 1; }
  magick "$tmp/$cls.png" -filter Lanczos -resize 1024x1280 "$tmp/$cls.png"
  cwebp -quiet -q 82 -m 6 "$tmp/$cls.png" -o "public/splash/$cls.webp"
  [ -n "$KEEP" ] && mkdir -p "$KEEP" && cp "$tmp/$cls.png" "$KEEP/$cls.png"
  echo "splash: public/splash/$cls.webp ($(wc -c < "public/splash/$cls.webp" | tr -d ' ') bytes, $(( $(date +%s) - start ))s, $(grep -o 'eyes at .*' "/tmp/splash-$cls.log"))"
done
rm -rf "$tmp"
