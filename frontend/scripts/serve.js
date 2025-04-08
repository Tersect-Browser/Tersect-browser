'use strict';
const cp = require('child_process');
const yargs = require('yargs');
const { readJSON, toAbsolutePath } = require('../../common/utils');

const argv = yargs.options({
    'port': {
        type: 'number',
        description: 'development server port',
        default: 4200
    },
    'host': {
        type: 'string',
        description: 'development server host',
        default: '0.0.0.0'
    },
    'config': {
        alias: 'c',
        type: 'string',
        description: 'configuration file',
        default: '../tbconfig.json'
    }
}).argv;

const configFile = toAbsolutePath(argv.config);
const tbConfig = readJSON(configFile);

const baseHref = tbConfig.baseHref || '/';
const deployUrl = baseHref;

// Build the command properly in one statement
const serveCommand = 'ng serve'
  + ' --baseHref=' + baseHref
  + ' --deployUrl=' + deployUrl
  + ' --port ' + argv.port
  + ' --host=' + argv.host;

console.log('Running:', serveCommand); // debug

cp.execSync(serveCommand, { stdio: 'inherit' });
