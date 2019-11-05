import * as fs from 'fs';
import path = require('path');

export interface TersectBrowserConfig {
    server_port: number;
    server_port_dev?: number;
    mongo_hostname: string;
    mongo_port: number;
    db_name: string;
    local_db_location: string;
    salt: string;
    index_partitions: number[];
}

export const tbConfig: TersectBrowserConfig = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), 'tbconfig.json')).toString()
);
