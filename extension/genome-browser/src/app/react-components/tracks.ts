export default [
    /*{
      type: 'FeatureTrack',
      trackId:
        'GCA_000001405.15_GRCh38_full_analysis_set.refseq_annotation.sorted.gff',
      name: 'NCBI RefSeq Genes',
      category: ['Genes'],
      assemblyNames: ['GRCh38'],
      adapter: {
        type: 'Gff3TabixAdapter',
        gffGzLocation: {
          uri: 'https://s3.amazonaws.com/jbrowse.org/genomes/GRCh38/ncbi_refseq/GCA_000001405.15_GRCh38_full_analysis_set.refseq_annotation.sorted.gff.gz',
          locationType: 'UriLocation',
        },
        index: {
          location: {
            uri: 'https://s3.amazonaws.com/jbrowse.org/genomes/GRCh38/ncbi_refseq/GCA_000001405.15_GRCh38_full_analysis_set.refseq_annotation.sorted.gff.gz.tbi',
            locationType: 'UriLocation',
          },
          indexType: 'TBI',
        },
      },
      renderer: {
        type: 'SvgFeatureRenderer',
      },
    }, */
    /*{
      type: 'AlignmentsTrack',
      trackId: 'NA12878.alt_bwamem_GRCh38DH.20150826.CEU.exome',
      name: 'NA12878 Exome',
      category: ['1000 Genomes', 'Alignments'],
      assemblyNames: ['GRCh38'],
      adapter: {
        type: 'CramAdapter',
        cramLocation: {
          uri: 'https://s3.amazonaws.com/jbrowse.org/genomes/GRCh38/alignments/NA12878/NA12878.alt_bwamem_GRCh38DH.20150826.CEU.exome.cram',
          locationType: 'UriLocation',
        },
        craiLocation: {
          uri: 'https://s3.amazonaws.com/jbrowse.org/genomes/GRCh38/alignments/NA12878/NA12878.alt_bwamem_GRCh38DH.20150826.CEU.exome.cram.crai',
          locationType: 'UriLocation',
        },
        sequenceAdapter: {
          type: 'BgzipFastaAdapter',
          fastaLocation: {
            uri: 'https://s3.amazonaws.com/jbrowse.org/genomes/GRCh38/fasta/GRCh38.fa.gz',
            locationType: 'UriLocation',
          },
          faiLocation: {
            uri: 'https://s3.amazonaws.com/jbrowse.org/genomes/GRCh38/fasta/GRCh38.fa.gz.fai',
            locationType: 'UriLocation',
          },
          gziLocation: {
            uri: 'https://s3.amazonaws.com/jbrowse.org/genomes/GRCh38/fasta/GRCh38.fa.gz.gzi',
            locationType: 'UriLocation',
          },
        },
      },
    }, */
    /*{
      type: 'VariantTrack',
      trackId:
        'ALL.wgs.shapeit2_integrated_snvindels_v2a.GRCh38.27022019.sites.vcf',
      name: '1000 Genomes Variant Calls',
      category: ['1000 Genomes', 'Variants'],
      assemblyNames: ['GRCh38'],
      adapter: {
        type: 'VcfTabixAdapter',
        vcfGzLocation: {
          uri: 'https://s3.amazonaws.com/jbrowse.org/genomes/GRCh38/variants/ALL.wgs.shapeit2_integrated_snvindels_v2a.GRCh38.27022019.sites.vcf.gz',
          locationType: 'UriLocation',
        },
        index: {
          location: {
            uri: 'https://s3.amazonaws.com/jbrowse.org/genomes/GRCh38/variants/ALL.wgs.shapeit2_integrated_snvindels_v2a.GRCh38.27022019.sites.vcf.gz.tbi',
            locationType: 'UriLocation',
          },
          indexType: 'TBI',
        },
      },
    }, */
    /*{
      type: 'VariantTrack',
      trackId:
        'RF_002_SZAXPI009284-57.vcf',
      name: 'RF_002_SZAXPI009284-57',
      category: ['Variants'],
      assemblyNames: ['GRCh38'],
      adapter: {
        type: 'VcfTabixAdapter',
        vcfGzLocation: {
          uri: 'http://localhost:8000/RF_002_SZAXPI009284-57.vcf.gz.snpeff.vcf.gz',
          locationType: 'UriLocation',
        },
        index: {
          location: {
            uri: 'http://localhost:8000/RF_002_SZAXPI009284-57.vcf.gz.snpeff.vcf.gz.tbi',
            locationType: 'UriLocation',
          },
          indexType: 'TBI',
        },
      },
    } */
     /* {
        "assemblies": [
          {
            "name": "SL2.50",
            "sequence": {
              "type": "ReferenceSequenceTrack",
              "trackId": "SL2.50-ReferenceSequenceTrack",
              "adapter": {
                "type": "IndexedFastaAdapter",
                "fastaLocation": {
                  "uri": "SL2.50.fa",
                  "locationType": "UriLocation"
                },
                "faiLocation": {
                  "uri": "SL2.50.fa.fai",
                  "locationType": "UriLocation"
                }
              }
            }
          }
        ],
        "configuration": {},
  "connections": [],
  "defaultSession": {
    "name": "New Session"
  },
  "tracks": [
     */{ 
      "type": "VariantTrack",
      "trackId": "RF_002_SZAXPI009284-57.vcf.gz.snpeff.vcf",
      "name": "RF_002_SZAXPI009284-57.vcf.gz.snpeff.vcf",
      "adapter": {
        "type": "VcfTabixAdapter",
        "vcfGzLocation": {
          "uri": "http://localhost:4200/TersectBrowserGP/tbapi/datafiles/RF_002_SZAXPI009284-57.vcf.gz.snpeff.vcf.gz",
          "locationType": "UriLocation"
        },
        "index": {
          "location": {
            "uri": "http://localhost:4200/TersectBrowserGP/tbapi/datafiles/RF_002_SZAXPI009284-57.vcf.gz.snpeff.vcf.gz.tbi",
            "locationType": "UriLocation"
          },
          "indexType": "TBI"
        }
      },
      "assemblyNames": [
        "SL2.50"
      ]
    }
  ]
/*} 

  ] */