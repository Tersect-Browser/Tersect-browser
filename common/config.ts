import * as fs from 'fs';
import path = require('path');
import yargs = require('yargs');

export interface TersectBrowserConfig {
    serverPort: number;
    baseHref?: string;
    mongoHost: string;
    dbName: string;
    localDbPath: string;
    indexPartitions: number[];
}

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
