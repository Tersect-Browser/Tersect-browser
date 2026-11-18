import path = require('node:path');
import yargs = require('yargs');
import { hideBin } from 'yargs/helpers';

import { TersectBrowserConfig } from '../../common/config';
import { readJSON, toAbsolutePath } from '../../common/utils';

const argv = yargs(hideBin(process.argv)).option('config', {
    alias: 'c',
    type: 'string',
    description: 'configuration file',
    default: 'tbconfig.json'
}).parseSync();

/**
 * Settings that can be overridden from the environment, so one tbconfig.json
 * serves both a local setup and the Docker containers. Must match
 * CONFIG_ENV_OVERRIDES in src/scripts/tbutils.py.
 */
const ENV_OVERRIDES = {
    TB_MONGO_HOST: 'mongoHost',
    TB_DB_NAME: 'dbName',
    TB_LOCAL_DB_PATH: 'localDbPath',
    TB_SERVER_HOST: 'serverHost',
} as const;

const configFile = toAbsolutePath(argv.config);
export const tbConfig: TersectBrowserConfig = readJSON(configFile);

if (!tbConfig) {
    console.error(`Config file could not be read! (${configFile})`);
    process.exit(1);
}

for (const [variable, key] of Object.entries(ENV_OVERRIDES)) {
    const value = process.env[variable];
    if (value) {
        tbConfig[key] = value;
    }
}

// A relative data path is taken relative to the config file.
tbConfig.localDbPath = path.resolve(path.dirname(configFile),
                                    tbConfig.localDbPath);
