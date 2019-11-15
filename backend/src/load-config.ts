import yargs = require('yargs');

import { TersectBrowserConfig } from '../../common/config';
import { readJSON, toAbsolutePath } from '../../common/utils';

const argv = yargs.option('config', {
    alias: 'c',
    type: 'string',
    description: 'configuration file',
    default: 'tbconfig.json'
}).argv;

const configFile = toAbsolutePath(argv.config);
export const tbConfig: TersectBrowserConfig = readJSON(configFile);

if (!tbConfig) {
    console.error(`Config file could not be read! (${configFile})`);
    process.exit(1);
}
