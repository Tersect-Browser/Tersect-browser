import bodyParser = require('body-parser');
import express = require('express');
import * as fs from 'fs';
import mongoose = require('mongoose');

import { router as tbRouter } from './src/backend/tersect-router';
import { router as tgrcRouter } from './src/backend/tgrc-router';
import { cleanDatabase } from './src/backend/utils/dbutils';

const app = express();
const port = process.env.PORT || 8060;

const config = JSON.parse(
    fs.readFileSync('./src/backend/config.json').toString()
);

const url = `${config.mongo_hostname}:${config.port}/${config.db_name}`;
mongoose.set('useNewUrlParser', true);
mongoose.set('useUnifiedTopology', true);
mongoose.set('useCreateIndex', true);
mongoose.connect(url);

app.use(bodyParser.json({ limit: '1mb' }));
app.use(express.json());
app.use('/tbapi', tbRouter);
app.use('/tgrc', tgrcRouter);

cleanDatabase();

app.listen(port, () => {
    console.log('Server started on port ' + port);
});
