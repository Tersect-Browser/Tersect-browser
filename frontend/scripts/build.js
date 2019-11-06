'use strict';
const cp = require('child_process');
const fs = require('fs');
const path = require('path');
const yargs = require('yargs');

const argv = yargs.option('config', {
    alias: 'c',
    type: 'string',
    description: 'configuration file',
    default: '../tbconfig.json'
}).argv;

const configFile = path.isAbsolute(argv.config) ? argv.config
                                                : path.join(process.cwd(),
                                                            argv.config);
const tbConfig = JSON.parse(fs.readFileSync(configFile).toString());

const baseHref = tbConfig.baseHref || '/';
const deployUrl = baseHref;

const buildCommand = 'ng build --prod' + ' --baseHref=' + baseHref
                                       + ' --deployUrl=' + deployUrl;

cp.execSync(buildCommand, { stdio: 'inherit' });
