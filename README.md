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
  - localDbPath is how we host the reference file and tbi + vcf files for each accession. These should be within your Tersect-browser project, at the path: Tersect-browser/~/mongo-data/gp_data_copy

```json
{
    "serverPort": 4300,
    "baseHref": "/TersectBrowserGP/",
    "mongoHost": "mongodb://127.0.0.1:27017", // adjust url to fit your local mongodb installation
    "dbName": "tersect_browser_gp",
    "localDbPath": "/Users/user/Tersect-browser/~/mongo-data/gp_data_copy", // adjust url to fit your Tersect-browser path
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
- Run `turbo build` to build the application
- Run `turbo dev` to start the application (it'll load the frontend and backend application).

## How to load data set

First requires a valid Mongodb installation. Refer to this documentation [here](https://www.mongodb.com/docs/manual/tutorial/install-mongodb-on-os-x/). The latest stable version worked fine so it should not be an issue.

After successful installation, start the mongodb server by running `mongod`. By default mongodb will try to create and store data in a `/data/db` path. There is a tendency that on mac this is a read-only path. If that is the case you may need to use a different path. Personally, I used `~/mongo-data`.

to start mongodb with a different path, create the path by running `mkdir -p ~/mongo-data` then run mongodb with this path `mongod --dbpath ~/mongo-data`.

When your database is up and running you can start the backend server.

### Generating the dataset

To generate the data set, copy the data in the `gp_data` folder on elvis to the root of the `tersect_browser` folder.
Copy also the `add_example_dataset` script to the root of the `tersect_browser` folder.

An example copy script via the terminal is;
`scp -r username@port:/home/tbrowser/add_example_dataset.sh  /Users/davidoluwasusi/msc_project/tersect-browser/gp_data`

Create a python virtual environment with venv at the root of the `tersect_browser` folder.
`python3.11 -m venv .tersect`

We are using python 3.11 because numpy has issues when we try to install via python > 3.12.

Activate the virtual environment
`source .tersect/bin/activate`

Install the dependencies in the requirements.txt file
`pip3 install -r /path/to/requirements.txt` the file is in `./backend/src/scripts` if you are in the root of the `tersect_browser` folder.
- If errors in install here, cat the requirements.txt file and install each tool individually. If the numpy install gives errors, run without the version specification.

Follow the installation instructions on the tersect-cli [GitHub page](https://github.com/tomkurowski/tersect?tab=readme-ov-file#macos) to install tersect CLI on your machine.

Give the `add_example_dataset.sh` script write access by running `chmod u+x add_example_dataset.sh`.

Run `./add_example_dataset.sh` to start generating the dataset. Feel free to grab a coffee while it runs 😉 (it takes some minutes).

If seeing errors about python version such as: `env: python3\r: No such file or directory` , then it might be a unix line encoding error in the python scripts. Run the following dos2unix command, and just make sure you *don't* commit the changes to these scripts (will show up as unstaged .py scripts in git status).
- `find {path_to}/Tersect-browser -type f \( -name "*.sh" -o -name "*.py" \) -exec dos2unix {} + `

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

### To set up data for the Genome Browser extension
This extension requires data for tracks to be hosted within the Tersect-browser project folder structure. Copy the reference sequence, index, and at least one of the VCF and corresponding TBI files (in this case 002) to the following folder:
- `ls Tersect-browser/~/mongo-data/gp_data_copy/`
  - SL2.50.fa
  - SL2.50.fa.fai
  - RF_002_SZAXPI009284-57.vcf.gz.snpeff.vcf.gz
  - RF_002_SZAXPI009284-57.vcf.gz.snpeff.tbi.vcf.gz

Once downloaded, you should be able to deploy Tersect Browser and view these tracks. Deployment now takes an extra step, as the Genome Browser extension needs to be deployed separately to the main Browser:
- `mongod --dbpath ~/mongo-data`
- `cd {path-to}/Tersect-browser/extension/genome-browser`
  - `nvm use 18`
  - `source .tersect/bin/activate`
  - `npm start`
- `cd {path-to}/Tersect-browser`
  - `nvm use 16`
  - `source .tersect/bin/activate`
  - `npm start`

This should deploy the Tersect Browser and the Genome Browser component, which can be accessed by clicking on the binoculars button. Open the track selector of the Genome Browser, and select the reference genome and the accession that you downloaded the files for (in this case S.lyc LA2838A).

## Development server

Run `ng serve` for a dev server. Navigate to `http://127.0.0.1:4200/`. The app will automatically reload if you change any of the source files.

## Code scaffolding

Run `ng generate component component-name` to generate a new component. You can also use `ng generate directive|pipe|service|class|guard|interface|enum|module`.

## Build

Run `ng build` to build the project. The build artifacts will be stored in the `dist/` directory. Use the `-prod` flag for a production build.

## Running unit tests

Run `ng test` to execute the unit tests via [Karma](https://karma-runner.github.io).

## Running end-to-end tests

Run `ng e2e` to execute the end-to-end tests via [Protractor](http://www.protractortest.org/).

## Further help

To get more help on the Angular CLI use `ng help` or go check out the [Angular CLI README](https://github.com/angular/angular-cli/blob/master/README.md).
