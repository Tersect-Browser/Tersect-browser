import bodyParser = require('body-parser');
import cors = require('cors');
import express = require('express');
import mongoose = require('mongoose');

import { router as tbRouter } from './routers/tersect-router';
import { router as tgrcRouter } from './routers/tgrc-router';
import { tbConfig } from './utils/config';
import { cleanDatabase } from './utils/dbutils';

const url = `${tbConfig.mongo_hostname}:${tbConfig.mongo_port}/${tbConfig.db_name}`;
mongoose.set('useNewUrlParser', true);
mongoose.set('useUnifiedTopology', true);
mongoose.set('useCreateIndex', true);
mongoose.connect(url);

cleanDatabase();

export const app = express();

app.use(cors());
app.use(bodyParser.json({ limit: '1mb' }));
app.use(express.json());
app.use('/TersectBrowser/tbapi', tbRouter);
app.use('/TersectBrowser/tgrc', tgrcRouter);
