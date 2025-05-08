#!/bin/bash
# This script will add a dataset with the

SCRIPT="./backend/src/scripts/add_dataset.py"
CONFIG_FILE="./tbconfig.json"
DATASET_NAME="HN-Soybean-data"
TSI_FILE="./HN-Soybean-data.tsi"  
REFERENCE_NAME="Soybean/glyma.Wm82.gnm2.DTC4.genome_main.fna"
REFERENCE="./Soybean/glyma.Wm82.gnm2.DTC4.genome_main.fna"

$SCRIPT $CONFIG_FILE -f \
"$DATASET_NAME" "$TSI_FILE" \
"$REFERENCE_NAME" \
-r $REFERENCE
