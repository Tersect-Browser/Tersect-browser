'use strict';
const cp = require('child_process');
const fs = require('fs');
const path = require('path');
const yargs = require('yargs');

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

const configFile = path.isAbsolute(argv.config) ? argv.config
                                                : path.join(process.cwd(),
                                                            argv.config);
const tbConfig = JSON.parse(fs.readFileSync(configFile).toString());

const baseHref = tbConfig.baseHref || '/';
const deployUrl = baseHref;

const serveCommand = 'ng serve' + ' --baseHref=' + baseHref
                                + ' --deployUrl=' + deployUrl;
                                + ' --port ' + argv.port;

cp.execSync(serveCommand, { stdio: 'inherit' });
