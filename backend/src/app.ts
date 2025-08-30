import bodyParser = require('body-parser');
import cors = require('cors');
import express = require('express');
import mongoose = require('mongoose');
import url = require('url');
import path = require('path');

import { tbConfig } from './load-config';
import { router as tbRouter } from './routers/tersect-router';
import { router as tgrcRouter } from './routers/tgrc-router';
import { cleanDatabase } from './utils/dbutils';

const mongoUrl = `${tbConfig.mongoHost}/${tbConfig.dbName}`;
console.log('Mongo URL:', mongoUrl);
mongoose.set('useNewUrlParser', true);
mongoose.set('useUnifiedTopology', true);
mongoose.set('useCreateIndex', true);
mongoose.connect(mongoUrl).then(() => {
    console.log('Mongo connected!');
    // Safely clean DB only after connection is established:
    cleanDatabase();

    // Now continue with Express setup, app.listen, etc.
  })
  .catch(err => {
    console.error('Connection error:', err);
  });

export const app = express();

app.use(cors());
app.use(bodyParser.json({ limit: '1mb' }));
app.use(express.json());

const baseHref = tbConfig.baseHref || '/';
const PLOT_ROOT = process.env.PLOT_ROOT || path.join(__dirname, '..', 'public', 'plots');
app.use('/TersectBrowserGP/datafiles', express.static(path.join(tbConfig.localDbPath, 'gp_data_copy')));
app.use(url.resolve(baseHref, 'tbapi'), tbRouter);
app.use(url.resolve(baseHref, 'tgrc'), tgrcRouter);
app.use('/plots', express.static(PLOT_ROOT, {
  maxAge: '7d',
  immutable: true,
  fallthrough: false
}));
