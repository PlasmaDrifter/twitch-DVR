#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

VERSION=$(grep -m1 '"version"' manifest.json | sed -E 's/.*"version": "([^"]+)".*/\1/')
ZIP_NAME="twitch-dvr-test-v${VERSION}.zip"
XPI_NAME="twitch-dvr-test.xpi"

# Remove prior archives
rm -f twitch-dvr-test-v*.zip twitch-dvr-test.xpi twitch-rewind*.zip twitch-rewind*.xpi

# Package clean archive for testing
zip -r -FS "$ZIP_NAME" manifest.json icons/ content/ popup/ background.js
cp "$ZIP_NAME" "$XPI_NAME"

echo "Test Package ready: $DIR/$ZIP_NAME"
echo "Local Test XPI ready: $DIR/$XPI_NAME"
