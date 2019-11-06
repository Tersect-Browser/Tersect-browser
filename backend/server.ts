import express = require('express');
import path = require('path');

import { tbConfig } from '../common/config';
import { app } from './src/app';

const frontend = express.static(path.join(process.cwd(), '../frontend/dist'));
app.use(tbConfig.baseHref || '/', frontend);

const port = process.env.PORT || tbConfig.serverPort;
app.set('port', port);
app.listen(port, () => {
    console.log(`Server started on port ${port}`);
});
