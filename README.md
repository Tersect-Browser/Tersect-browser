# TersectBrowser

## How to install

Ensure you have nvm installed on your machine and perform the following steps;

- Run `nvm use 16` to switch to a compatible node version
- In the root of the application run `npm install`
- Run `npm install -g turbo` to install turbo
- Run `turbo build` to build the application
- add a `tbconfig.json` with the following values

```
{
    "serverPort": 4300,
    "baseHref": "/TersectBrowserGP/",
    "mongoHost": "mongodb://localhost:27017", // adjust url to fit your local mongodb installation
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
- Run `turbo dev` to start the application (it'll load the frontend and backend application).

This project was generated with [Angular CLI](https://github.com/angular/angular-cli) version 1.7.1.

## Development server

Run `ng serve` for a dev server. Navigate to `http://localhost:4200/`. The app will automatically reload if you change any of the source files.

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
