'use strict';
const fs = require('fs');
const path = require('path');
const url = require('url');

const configFile = path.join(__dirname, '../../tbconfig.json');
const tbConfig = JSON.parse(fs.readFileSync(configFile).toString());
const devPort = process.env.PORT || tbConfig.server_port;

const baseHref = tbConfig.baseHref || '/';

const PROXY_CONFIG = [
    {
        context: [
            url.resolve(baseHref, 'tbapi'),
            url.resolve(baseHref, 'tgrc')
        ],
        target: 'http://localhost:' + devPort,
        secure: false
    }
];

module.exports = PROXY_CONFIG;
