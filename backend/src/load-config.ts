import * as fs from 'fs';
import path = require('path');
import yargs = require('yargs');

import { TersectBrowserConfig } from '../../common/config';

const argv = yargs.option('config', {
    alias: 'c',
    type: 'string',
    description: 'configuration file',
    default: 'tbconfig.json'
}).argv;

const configFile = path.isAbsolute(argv.config) ? argv.config
                                                : path.join(process.cwd(),
                                                            argv.config);

if (!fs.existsSync(configFile)) {
    console.error(`Config file not found! (${configFile})`);
    process.exit(1);
}

export const tbConfig: TersectBrowserConfig = JSON.parse(
    fs.readFileSync(configFile).toString()
);
