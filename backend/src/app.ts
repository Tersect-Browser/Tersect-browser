import bodyParser = require('body-parser');
import cors = require('cors');
import express = require('express');
import mongoose = require('mongoose');
import url = require('url');

import { tbConfig } from '../../common/config';
import { router as tbRouter } from './routers/tersect-router';
import { router as tgrcRouter } from './routers/tgrc-router';
import { cleanDatabase } from './utils/dbutils';

const mongoUrl = `${tbConfig.mongoHost}/${tbConfig.db_name}`;
mongoose.set('useNewUrlParser', true);
mongoose.set('useUnifiedTopology', true);
mongoose.set('useCreateIndex', true);
mongoose.connect(mongoUrl);

cleanDatabase();

export const app = express();

app.use(cors());
app.use(bodyParser.json({ limit: '1mb' }));
app.use(express.json());

const baseHref = tbConfig.baseHref || '/';

app.use(url.resolve(baseHref, 'tbapi'), tbRouter);
app.use(url.resolve(baseHref, 'tgrc'), tgrcRouter);
