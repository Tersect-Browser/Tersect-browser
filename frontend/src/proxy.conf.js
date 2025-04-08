'use strict';
const path = require('path');
const url = require('url');

const { readJSON } = require('../../common/utils');

const configFile = path.join(__dirname, '../../tbconfig.json');
const tbConfig = readJSON(configFile);
const devPort = process.env.PORT || tbConfig.serverPort;

const baseHref = tbConfig.baseHref || '/';

const PROXY_CONFIG = [
    {
        context: [
            url.resolve(baseHref, 'tbapi'),
            url.resolve(baseHref, 'tgrc')
        ],
        target: 'http://backend:' + devPort,
        "secure": false,
        "changeOrigin": true
    }
];

module.exports = PROXY_CONFIG;
