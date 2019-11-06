'use strict';
const cp = require('child_process');
const fs = require('fs');
const path = require('path');
const yargs = require('yargs');

const argv = yargs.option('port', {
    type: 'number',
    description: 'development server port',
    default: 4200
}).argv;

const configFile = path.join(__dirname, '../../tbconfig.json');
const tbConfig = JSON.parse(fs.readFileSync(configFile).toString());

const baseHref = tbConfig.baseHref || '/';
const deployUrl = baseHref;

const serveCommand = 'ng serve' + ' --baseHref=' + baseHref
                                + ' --deployUrl=' + deployUrl;
                                + ' --port ' + argv.port;

cp.execSync(serveCommand, { stdio: 'inherit' });
