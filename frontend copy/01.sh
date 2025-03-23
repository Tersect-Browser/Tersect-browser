#!/bin/bash

# Exit on error
set -e

APP_NAME="tersect-ng19"
DEST_DIR="../$APP_NAME"

echo "🛠️ Creating new Angular 19 app: $APP_NAME"

# 1. Create a clean Angular 19 app
npm create @angular@latest $APP_NAME -- --routing --style=css

cd $DEST_DIR

# 2. Install dependencies that match the uploaded zip
npm install primeng primeicons primeflex font-awesome@4.7.0 \
            file-saver fast-deep-equal color-convert core-js rxjs zone.js

# 3. Install dev dependencies
npm install -D @angular-devkit/build-angular@19 @angular/compiler-cli@19 typescript

echo "✅ Angular 19 base project created in $DEST_DIR"
