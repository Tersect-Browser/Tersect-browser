#!/bin/bash
# This script will add a dataset with the

SCRIPT="./backend/src/scripts/add_dataset.py"
CONFIG_FILE="./tbconfig.json"
DATASET_NAME="data"
TSI_FILE="./data.tsi"  
REFERENCE_NAME="GCF_000004515.6_Glycine_max_v4.0_genomic.fa.gz"
REFERENCE="./GCF_000004515.6_Glycine_max_v4.0_genomic.fa.gz"

$SCRIPT $CONFIG_FILE -f \
"$DATASET_NAME" "$TSI_FILE" \
"$REFERENCE_NAME" \
-r $REFERENCE
