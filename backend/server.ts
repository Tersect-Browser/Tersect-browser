import express = require('express');
import path = require('path');

import { app } from './src/app';
import { tbConfig } from './src/load-config';

const frontend = express.static(path.join(__dirname, '../../frontend/dist'));
app.use(tbConfig.baseHref || '/', frontend);

const port = process.env.PORT || tbConfig.serverPort;
app.set('port', port);
app.listen(port, () => {
    console.log(`Server started on port ${port}`);
});
