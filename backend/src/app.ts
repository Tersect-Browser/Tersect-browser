import bodyParser = require('body-parser');
import cors = require('cors');
import express = require('express');
import mongoose = require('mongoose');
import url = require('url');

import { tbConfig } from './load-config';
import { router as tbRouter } from './routers/tersect-router';
import { router as tgrcRouter } from './routers/tgrc-router';
import { cleanDatabase } from './utils/dbutils';

const mongoUrl = `${tbConfig.mongoHost}/${tbConfig.dbName}?directConnection=true`;
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

app.use(url.resolve(baseHref, 'tbapi'), tbRouter);
app.use(url.resolve(baseHref, 'tgrc'), tgrcRouter);
