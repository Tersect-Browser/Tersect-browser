import cors = require('cors');
import express = require('express');
import mongoose = require('mongoose');
import path = require('node:path');

import { tbConfig } from './load-config';
import { router as tbRouter } from './routers/tersect-router';
import { router as tgrcRouter } from './routers/tgrc-router';
import { cleanDatabase } from './utils/dbutils';

// The database is selected by name rather than in the URL, so credentials in
// mongoHost authenticate against "admin", as they do for the Python scripts.
console.log('Mongo database:', tbConfig.dbName);
mongoose.connect(tbConfig.mongoHost, { dbName: tbConfig.dbName }).then(() => {
    console.log('Mongo connected!');
    // Safely clean DB only after connection is established:
    return cleanDatabase();

    // Now continue with Express setup, app.listen, etc.
  })
  .catch(err => {
    console.error('Connection error:', err);
  });

export const app = express();

app.use(cors());
app.use(express.json({ limit: '1mb' }));

const baseHref = tbConfig.baseHref || '/';

/**
 * Resolve a route relative to the base href (WHATWG replacement for the
 * deprecated url.resolve()).
 */
function resolveRoute(from: string, to: string): string {
    const resolved = new URL(to, new URL(from, 'resolve://'));
    if (resolved.protocol === 'resolve:') {
        return resolved.pathname + resolved.search + resolved.hash;
    }
    return resolved.toString();
}
const PLOT_ROOT = process.env.PLOT_ROOT || path.join(__dirname, '..', 'public', 'plots');
app.use('/TersectBrowserGP/datafiles', express.static(path.join(tbConfig.localDbPath, 'gp_data_copy')));
app.use(resolveRoute(baseHref, 'tbapi'), tbRouter);
app.use(resolveRoute(baseHref, 'tgrc'), tgrcRouter);
app.use('/plots', express.static(PLOT_ROOT, {
  maxAge: '7d',
  immutable: true,
  fallthrough: false
}));
