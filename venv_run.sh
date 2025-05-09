#!/bin/bash

# This is an external script, e.g., "run_with_venv.sh"
source .tersect/bin/activate || { echo "Failed to activate virtual environment"; exit 1; }
bash add_example_dataset.sh || { echo "Failed to run dataset script"; exit 1; }