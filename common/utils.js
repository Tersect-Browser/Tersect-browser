"use strict";
const fs = require('fs');
const path = require('path');

function readJSON(filepath) {
    if (!fs.existsSync(filepath)) {
        return null;
    }
    return JSON.parse(
        fs.readFileSync(filepath).toString()
    );
}

function toAbsolutePath(filepath, from = 'cwd') {
    if (path.isAbsolute(filepath)) {
        return filepath;
    }
    if (from === 'cwd') {
        return path.join(process.cwd(), filepath);
    } else if (from === '__dirname') {
        path.join(__dirname, filepath);
    }
    return null;
}

exports.readJSON = readJSON;
exports.toAbsolutePath = toAbsolutePath;
