'use strict';
// Production build: the web app into dist/frontend, then the backend into
// dist/, which serves both (npm run deploy).
const cp = require('child_process');
const path = require('path');
const yargs = require('yargs');

const { toAbsolutePath } = require('../common/utils');

const argv = yargs.option('config', {
    alias: 'c',
    type: 'string',
    description: 'configuration file',
    default: 'tbconfig.json'
}).argv;

const configFile = toAbsolutePath(argv.config);

cp.execFileSync('npm', ['run', 'build'], {
    cwd: path.join(__dirname, '../web/'),
    env: { ...process.env, TB_CONFIG: configFile },
    stdio: 'inherit'
});

cp.execFileSync('npm', ['run', 'build'], {
    cwd: path.join(__dirname, '../backend/'),
    stdio: 'inherit'
});
