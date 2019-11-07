'use strict';
const cp = require('child_process');
const path = require('path');
const yargs = require('yargs');

const argv = yargs.option('config', {
    alias: 'c',
    type: 'string',
    description: 'configuration file',
    default: 'tbconfig.json'
}).argv;

const configFile = path.isAbsolute(argv.config) ? argv.config
                                                : path.join(process.cwd(),
                                                            argv.config);
const buildCommand = 'npm run build -- --config ' + configFile;

cp.execSync(buildCommand, {
    cwd: path.join(__dirname, '../frontend/'),
    stdio: 'inherit'
});

cp.execSync(buildCommand, {
    cwd: path.join(__dirname, '../backend/'),
    stdio: 'inherit'
});
