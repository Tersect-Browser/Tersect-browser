# TersectBrowser

## Table of Contents

- [How to install](#how-to-install)
- [How to load data set](#how-to-load-data-set)
  - [Generating the dataset](#generating-the-dataset)
  - [Loading the dataset](#additional-requirement-for-running-the-browser)
- [Development server](#development-server)
- [Code scaffolding](#code-scaffolding)
- [Build](#build)
- [Running unit tests](#running-unit-tests)
- [Running end-to-end tests](#running-end-to-end-tests)
- [Further help](#further-help)

## How to install

Ensure you have nvm installed on your machine and perform the following steps;

- Run `nvm use 16` to switch to a compatible node version
- In the root of the application run `npm install`
  If errors with this, do:
  - Run `npm config set registry https://registry.npmjs.org/`to ensure the right npm registry
  - Run `npm cache clear --force` to remove package discrepancies
  - Run `npm install` with no errors
- Run `npm install -g turbo` to install turbo
- Add a `tbconfig.json` with the following values (remove commented line)
  - mongoHost relates to the local mongodb installation that is probably in this path: ~/mongo-data
  - localDbPath is how we host the reference file and tbi + vcf files for each accession. These should be within your Tersect-browser project, at the path: Tersect-browser/db-data/mongo-data/gp_data_copy

```json
{
    "serverPort": 4300,
    "serverHost": "http://127.0.0.1:4300/TersectBrowserGP",
    "vcfLocation": "/gp_data_copy/vcf_location",
    "tsiPath": "/Users/user/msc_project/tersect-browser/test-data/mongo-data/gp_data_copy", // parent directory of the tsi file should be relative to localdb path
    "datasetName": "SGN_aer_hom_snps",
    "fileLoadingRoute": "/tbapi/datafiles/",
    "bcftoolsLocation": "bcftools", // may vary per individual machine
    "fastaName": "SL2.50.fa", 
    "frontendHost": "http://127.0.0.1:4200/TersectBrowserGP",
    "baseHref": "/TersectBrowserGP/",
    "mongoHost": "mongodb://localhost:27017", // adjust as necessary
    "dbName": "tersect_browser_gp",
    "localDbPath":"/Users/user/msc_project/tersect-browser/test-data/mongo-data", // adjust as necessary
    "indexPartitions": [
        100000000,
        50000000,
        25000000,
        10000000,
        5000000,
        1000000
    ]
}
```
- Run `turbo dev` to start the application (it'll load the frontend and backend application).

- cd to the genome-browser application

```
cd /tersect-browser/extension/genome-browser
```

- run `nvm use 22`

- run `npm install`

- run `npm start`

The extension server should be available on port 3200.

## How to load the dataset

Loading the dataset requires a valid MongoDB installation. Refer to this documentation [here](https://www.mongodb.com/docs/manual/tutorial/install-mongodb-on-os-x/). The latest stable version worked fine while building the application.

After successful installation, start the MongoDB server by running `mongod`. By default, MongoDB will try to create and store data in a `/data/db` path. 
There is a tendency that on Mac, this is a read-only path. If that is the case, you may need to use a different path.  `db-data/mongo-data` was used to test the application.

To start MongoDB with a different path, create the path by running `mkdir -p db-data/mongo-data`, then run MongoDB with this path `mongod --dbpath db-data/mongo-data`.

When your database is up and running, you can start the backend server (However, there will be no datasets at this point).

### Installing Python dependencies
The python dependencies available in conda are listed in the requirements.txt in `/tersect-browser/backend/src/scripts`

Some dependencies are available with [pip](https://packaging.python.org/en/latest/tutorials/installing-packages/) as tersect browser  originally managed its virtual environment with pip related virtual managers like venv.

These dependencies are present in the requirements.venv.txt in `/tersect-browser/backend/src/scripts`

- Create a python virtual environment with venv at the root of the `tersect_browser` folder.
`python3.11 -m venv .tersect`

We are using python 3.11 because numpy has issues when we try to install via python > 3.12.

- Activate the virtual environment
`source .tersect/bin/activate`

- Install the dependencies in the requirements.venv.txt file, conda channels does not have the version of hashids  needed for tersect cli, therefore tersect dependencies are in requirements.venv.txt
`pip3 install -r /path/to/requirements.venv.txt` the file is in `./backend/src/scripts` if you are in the root of the `tersect_browser` folder.

- If there are errors during the installation here, cat the requirements.txt file and install each tool individually. If the numpy install gives errors, run without the version specification.

- Follow the installation instructions on the tersect-cli [GitHub page](https://github.com/tomkurowski/tersect?tab=readme-ov-file#macos) to install tersect CLI on your machine.


### Generating the dataset

To generate the data set, copy the data in the `gp_data_copy` folder on Elvis to your selected database folder. i.e the value of `tbconfig.localDbPath`. 

To test the setup script quickly, the test dataset at the root of tersect browser repository can be used. copy the TSI file and fasta file from Elvis to that folder.

The credentials for elvis will be bundled with the submission in a credentials.txt file.

Example `tbconfig.localDbPath` tree looks like this
```
...
├── gp_data_copy
    ├── ITAG2.4_gene_models.gff3
    ├── ITAG2.4_gene_models.sorted.gff3.gz
    ├── ITAG2.4_gene_models.sorted.gff3.gz.tbi
    ├── SGN_aer_hom_snps.tsi
    ├── SL2.50.fa
    ├── SL2.50.fa.fai
    └── vcf_location
        └── RF_001_SZAXPI008746-45.vcf.gz.snpeff.vcf.gz
        ...
...

```
Note: The files on elvis will be more as they contain the processed vcf files and index files needed for the search functionality

At the root of tersect browser, run the `setup_new_tbrowser_dataset.py` script to setup datasets automatically.

Its correct usage is 
` python setup_new_tbrowser_dataset.py -f {fasta file path} -g {gff gz path} -V {vcf files path} -c {tbconfig.json path}`

E.G
```
 python setup_new_tbrowser_dataset.py \
 -f /Users/user/msc_project/tersect-browser/test-data/mongo-data/gp_data_copy/SL2.50.fa \
 -g /Users/user/msc_project/tersect-browser/test-data/mongo-data/gp_data_copy/ITAG2.4_gene_models.sorted.gff3.gz \
 -V /Users/user/msc_project/tersect-browser/test-data/mongo-data/gp_data_copy/vcf_location/ \
 -c /Users/user/msc_project/tersect-browser/tbconfig.json 
```

`-V can be replaced with -v to use a comma separated list of vcf file paths instead`

E.G
```
 python setup_new_tbrowser_dataset.py \
 -f /Users/user/msc_project/tersect-browser/test-data/mongo-data/gp_data_copy/SL2.50.fa \
 -g /Users/user/msc_project/tersect-browser/test-data/mongo-data/gp_data_copy/ITAG2.4_gene_models.sorted.gff3.gz \
 -v /Users/user/msc_project/tersect-browser/test-data/mongo-data/gp_data_copy/vcf_location/RF_001_SZAXPI008746-45.vcf.gz.snpeff.vcf.gz \
 -c /Users/user/msc_project/tersect-browser/tbconfig.json 
```

After the data set is loaded you can start the server and see the loaded dataset on the home page

### Creating the search Index

#### VCF Index

- Navigate to the scripts folder in the backend `cd /tersect-browser/backend/src/scripts`

- Run the `build_annotate_per_chrom.sh` script to generate the indexes for each chromosome

E.G
```
./build_annotate_per_chrom.sh ../../../test-data/mongo-data/gp_data_copy/tracks.json /Users/user/msc_project/tersect-browser/test-data/mongo-data/SGN_aer_hom_snps.tsi /Users/user/msc_project/tersect-browser/test-data/mongo-data/gp_data_copy/trix_indicies

```
#### TRIX Index

- Navigate to the scripts folder in the backend `cd /tersect-browser/backend/src/scripts`

- Run the `tersect_trix_builder.sh` script to generate the trix indexes for each chromosome

```
./tersect_trix_builder.sh /Users/user/msc_project/tersect-browser/test-data/mongo-data/gp_data_copy/trix_indices /Users/user/msc_project/tersect-browser/test-data/mongo-data/gp_data_copy/SGN_aer_hom_snps.tsi

```



### Additional Requirement For Running The Browser
[RapidNJ](https://github.com/somme89/rapidNJ) is required for generating the phylogenetic tree under the hood, git clone the repository, and run make in the root.

NB mac users with M series chip
Install Rosetta (if not already):

```
softwareupdate --install-rosetta
```

Run the Terminal in Rosetta:

Go to Applications > Utilities > Terminal.

Right-click → Get Info.

Check “Open using Rosetta”.

Run `make` again in the Rosetta terminal.

This way, clang++ will target x86_64 and the SSE2 instructions will work.


Making it available system wide:

After running `make` cd into the bin directory

run ls as shown below to check that the binary exists
`ls -l rapidnj`

move it to the usr path
`sudo mv rapidnj /usr/local/bin/`


This project was generated with [Angular CLI](https://github.com/angular/angular-cli) version 1.7.1.

#### Clear angular cache
In the event that an error message stating an .angular/cache/ file does not exist, this error can be resolved by navigating to `{path-to}/Tersect-browser/extension/genome-browser/.angular/` and running `ng cache clean` to clean the cache

## Development server

At the root of tersect-browser, run `turbo dev` to start the frontend and backend development server.

Change directory to the genome browser in the extensions folder

` nvm use 22`;
` npm start `;

It should load the extensions on port 3200

Change the path in the index.html to reference this port in `/tersect-browser/frontend/src/index.html`;

  `<script  type="module" src="http://localhost:3200/main.js"></script>`

## Code scaffolding

Run `ng generate component component-name` to generate a new component. You can also use `ng generate directive|pipe|service|class|guard|interface|enum|module`.

## Build

Run `npm run-script build` to build the frontend and backend application

## Deployment

- Git checkout to the deployment branch `Chore-Deployment`
- Configure `tbconfig` to use correct paths and host

EG
```
{
    "serverPort": 4300,
    "serverHost": // Elvis server host,
    "vcfLocation": "/gp_data_copy/vcf_location",
    "tsiPath": // Elvis TSI Path,
    "datasetName": "SGN_aer_hom_snps",
    "fileLoadingRoute": "/tbapi/datafiles/",
    "bcftoolsLocation": Path to bcf tools on elvis,
    "fastaName": "SL2.50.fa",
    "frontendHost": // Elvis frontend host,
    "baseHref": "/TersectBrowserGP/",
    "mongoHost": "mongodb://localhost:27017",
    "dbName": "tersect_browser_gp",
    "localDbPath": // Path to local database folder on elvis,
    "indexPartitions": [
        100000000,
        50000000,
        25000000,
        10000000,
        5000000,
        1000000
    ]
}

```

Change directory to the genome-browser application
  `cd /tersect-browser/extension/genome-browser `

Switch to a compatible node version

  `nvm use 22`

Trigger a release to NPM

  `npm run release`

Change the path in the index.html to reference this release in `/tersect-browser/frontend/src/index.html`;

  `<script  type="module" src="http://localhost:3200/main.js"></script>`

Change directory to the root of tersect browser

  `cd /tersect-browser/`

Run deployment scripts

  `npm run-script build`
  `npm run-script deploy`

## Running unit tests

Run `ng test` to execute the unit tests via [Karma](https://karma-runner.github.io).

## Running end-to-end tests

Run `ng e2e` to execute the end-to-end tests via [Protractor](http://www.protractortest.org/).

## Further help

To get more help on the Angular CLI use `ng help` or go check out the [Angular CLI README](https://github.com/angular/angular-cli/blob/master/README.md).
