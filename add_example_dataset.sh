#!/bin/bash
# This script will add a dataset with the

SCRIPT="./backend/src/scripts/add_dataset.py"
CONFIG_FILE="./tbconfig.json"
DATASET_NAME="SGN_aer_hom_snps"
TSI_FILE="/Users/davidoluwasusi/msc_project/tersect-browser/test-data/mongo-data/gp_data_copy//SGN_aer_hom_snps.tsi"  
REFERENCE_NAME="test-data/mongo-data/gp_data_copy/SL2.50.fa"
REFERENCE="./test-data/mongo-data/gp_data_copy/SL2.50.fa"

$SCRIPT $CONFIG_FILE -f \
"$DATASET_NAME" "$TSI_FILE" \
"$REFERENCE_NAME" \
-r $REFERENCE
