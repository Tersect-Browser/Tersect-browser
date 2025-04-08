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

```json
{
    "serverPort": 4300,
    "baseHref": "/TersectBrowserGP/",
    "mongoHost": "mongodb://0.0.0.0:27017", // adjust url to fit your local mongodb installation
    "dbName": "tersect_browser_gp",
    "localDbPath": "/home/tbrowser/local_db",
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

Follow the installation instructions on the tersect-cli [GitHub page](https://github.com/tomkurowski/tersect?tab=readme-ov-file#macos) to install tersect CLI on your machine.

Give the `add_example_dataset.sh` script write access by running `chmod u+x add_example_dataset.sh`.

Run `./add_example_dataset.sh` to start generating the dataset. Feel free to grab a coffee while it runs 😉 (it takes some minutes).

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

## Development server

Run `ng serve` for a dev server. Navigate to `http://0.0.0.0:4200/`. The app will automatically reload if you change any of the source files.

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
