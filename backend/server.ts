import bodyParser = require('body-parser');
import cors = require('cors');
import express = require('express');
import * as fs from 'fs';
import mongoose = require('mongoose');
import path = require('path');

import { router as tbRouter } from './src/tersect-router';
import { router as tgrcRouter } from './src/tgrc-router';
import { cleanDatabase } from './src/utils/dbutils';

const config = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), 'tbconfig.json')).toString()
);

const app = express();
const port = process.env.PORT || config.server_port;

app.set('port', port);
app.use(cors());

const url = `${config.mongo_hostname}:${config.mongo_port}/${config.db_name}`;
mongoose.set('useNewUrlParser', true);
mongoose.set('useUnifiedTopology', true);
mongoose.set('useCreateIndex', true);
mongoose.connect(url);

app.use(bodyParser.json({ limit: '1mb' }));
app.use(express.json());
app.use('/TersectBrowser/tbapi', tbRouter);
app.use('/TersectBrowser/tgrc', tgrcRouter);

cleanDatabase();

const frontend = express.static(path.join(process.cwd(), '../frontend/dist'));
app.use('/TersectBrowser', frontend);
app.listen(port, () => {
    console.log(`Server started on port ${port}`);
});
