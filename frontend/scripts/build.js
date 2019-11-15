'use strict';
const cp = require('child_process');
const yargs = require('yargs');

const { readJSON, toAbsolutePath } = require('../../common/utils');

const argv = yargs.option('config', {
    alias: 'c',
    type: 'string',
    description: 'configuration file',
    default: '../tbconfig.json'
}).argv;

const configFile = toAbsolutePath(argv.config);
const tbConfig = readJSON(configFile);

const baseHref = tbConfig.baseHref || '/';
const deployUrl = baseHref;

const buildCommand = 'ng build --prod' + ' --baseHref=' + baseHref
                                       + ' --deployUrl=' + deployUrl;

cp.execSync(buildCommand, { stdio: 'inherit' });
