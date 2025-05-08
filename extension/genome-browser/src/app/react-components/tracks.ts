export default [
  {
    "type": "FeatureTrack",
    "trackId": "ITAG2.4_gene_models.sorted.gff3.sorted.gff",
    "name": "ITAG2.4_gene_models.sorted.gff3.sorted",
    "adapter": {
      "type": "Gff3TabixAdapter",
      "gffGzLocation": {
        "uri": "http://127.0.0.1:4200/TersectBrowserGP/tbapi/datafiles/ITAG2.4_gene_models.sorted.gff3.sorted.gff.gz",
        "locationType": "UriLocation"
      },
      "index": {
        "location": {
          "uri": "http://127.0.0.1:4200/TersectBrowserGP/tbapi/datafiles/ITAG2.4_gene_models.sorted.gff3.sorted.gff.gz.tbi",
          "locationType": "UriLocation"
        },
        "indexType": "TBI"
      }
    },
    "assemblyNames": [
      "SL2.50"
    ]
  },
  {
    "type": "VariantTrack",
    "trackId": "RF_001_SZAXPI008746-45.vcf.gz.snpeff.vcf",
    "name": "RF_001_SZAXPI008746-45.vcf.gz.snpeff",
    "adapter": {
      "type": "VcfTabixAdapter",
      "vcfGzLocation": {
        "uri": "http://127.0.0.1:4200/TersectBrowserGP/tbapi/datafiles/RF_001_SZAXPI008746-45.vcf.gz.snpeff.vcf.gz",
        "locationType": "UriLocation"
      },
      "index": {
        "location": {
          "uri": "http://127.0.0.1:4200/TersectBrowserGP/tbapi/datafiles/RF_001_SZAXPI008746-45.vcf.gz.snpeff.vcf.gz.tbi",
          "locationType": "UriLocation"
        },
        "indexType": "TBI"
      }
    },
    "assemblyNames": [
      "SL2.50"
    ]
  }
];