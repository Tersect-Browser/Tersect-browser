#!/bin/bash

# Exit on error
set -e

SRC_DIR="../frontend/src"
DEST_DIR="./tersect-ng19/src"

echo "📦 Copying original app source into new Angular 19 project..."

# 1. Copy essential files
cp -r "$SRC_DIR/assets" "$DEST_DIR/"
cp "$SRC_DIR/index.html" "$DEST_DIR/"
cp "$SRC_DIR/styles.css" "$DEST_DIR/"
cp "$SRC_DIR/favicon.ico" "$DEST_DIR/"
cp "$SRC_DIR/polyfills.ts" "$DEST_DIR/"
cp "$SRC_DIR/tsconfig.app.json" "$DEST_DIR/"

# 2. Copy app logic
mkdir -p "$DEST_DIR/app"
cp -r "$SRC_DIR/app/"* "$DEST_DIR/app/"

# 3. Remove hybrid/react-bridge code
rm -f "$DEST_DIR/app/react-angular.module.ts"

# 4. Clean old imports (like react2angular)
find "$DEST_DIR/app" -type f -name "*.ts" -exec sed -i '' '/react2angular/d' {} +

# 5. Rename modules if needed
mv "$DEST_DIR/app/pipes/shared-pipes.module.ts" "$DEST_DIR/app/pipes/pipes.module.ts"

echo "✅ Codebase copied and cleaned."
