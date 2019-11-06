'use strict';
const cp = require('child_process');
const fs = require('fs');
const path = require('path');

const configFile = path.join(__dirname, '../../tbconfig.json');
const tbConfig = JSON.parse(fs.readFileSync(configFile).toString());

const baseHref = tbConfig.baseHref || '/';
const deployUrl = baseHref;

const buildCommand = 'ng build --prod' + ' --baseHref=' + baseHref
                                       + ' --deployUrl=' + deployUrl;

cp.execSync(buildCommand, { stdio: 'inherit' });
