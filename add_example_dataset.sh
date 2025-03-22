#!/bin/bash
# This script will add a dataset with the

SCRIPT="./backend/src/scripts/add_dataset.py"
CONFIG_FILE="./tbconfig.json"
DATASET_NAME="Example dataset"
TSI_FILE="./gp_data/SGN_aer_hom_snps.tsi"
REFERENCE_NAME="SL2.50"
REFERENCE="./gp_data/SL2.50.fa"

$SCRIPT $CONFIG_FILE -f \
"$DATASET_NAME" "$TSI_FILE" \
"$REFERENCE_NAME" \
-r $REFERENCE
