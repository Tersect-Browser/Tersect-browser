'use strict';
const fs = require('fs');
const path = require('path');

const configFile = path.join(__dirname, '../../tbconfig.json');
const tbConfig = JSON.parse(fs.readFileSync(configFile).toString());
const devPort = process.env.PORT
                || tbConfig.server_port_dev
                || tbConfig.server_port;

const PROXY_CONFIG = [
    {
        context: [
            '/TersectBrowser/tbapi',
            '/TersectBrowser/tgrc'
        ],
        target: 'http://localhost:' + devPort,
        secure: false
    }
];

module.exports = PROXY_CONFIG;
