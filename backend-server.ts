import express = require('express');
import mongoose = require('mongoose');
import bodyParser = require('body-parser');
import * as fs from 'fs';

import { router } from './src/backend/tersect-router';
import { cleanDatabase } from './src/backend/db/dbutils';

const app = express();
const port = process.env.PORT || 8060;

const config = JSON.parse(
    fs.readFileSync('./src/backend/config.json').toString()
);

const uri = `${config.mongo_hostname}:${config.port}/${config.db_name}`;
mongoose.connect(uri, { useNewUrlParser: true });
mongoose.set('useCreateIndex', true);

app.use(bodyParser.json({ limit: '1mb' }));
app.use(express.json());
app.use('/tbapi', router);

cleanDatabase();

app.listen(port, () => {
    console.log('Server started on port ' + port);
});
