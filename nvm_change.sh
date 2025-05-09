#!/bin/bash

# This script changes the Node.js version and runs a given command

if [ -z "$1" ] || [ -z "$2" ]; then
  echo "Usage: $0 <node_version> <command>"
  exit 1
fi

NODE_VERSION=$1
COMMAND=$2

# Load NVM and change Node version
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# Use the specified Node version
nvm use $NODE_VERSION --silent

# Add Node global modules to PATH
export PATH="$PATH:$(npm bin -g)"

# Execute the passed command
eval $COMMAND