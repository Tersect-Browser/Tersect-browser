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

const serveCommand = 'ng serve' + ' --baseHref=' + baseHref
                                + ' --deployUrl=' + deployUrl;
                                + ' --port ' + argv.port;

cp.execSync(serveCommand, { stdio: 'inherit' });
