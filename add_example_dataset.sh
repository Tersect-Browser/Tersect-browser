#!/bin/bash
# This script will add a dataset with the

SCRIPT="/app/backend/src/scripts/add_dataset.py"
CONFIG_FILE="/app/tbconfig.json"
DATASET_NAME="SGN_aer_hom_snps"
TSI_FILE="/app/gp_data_copy/SGN_aer_hom_snps.tsi"
REFERENCE_NAME="/app/gp_data_copy/SL2.50.fa"
REFERENCE="/app/gp_data_copy/SL2.50.fa"

$SCRIPT $CONFIG_FILE -f \
"$DATASET_NAME" "$TSI_FILE" \
"$REFERENCE_NAME" \
-r $REFERENCE
