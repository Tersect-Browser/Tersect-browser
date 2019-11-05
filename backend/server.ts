import express = require('express');
import path = require('path');

import { app } from './src/app';
import { tbConfig } from './src/utils/config';

const frontend = express.static(path.join(process.cwd(), '../frontend/dist'));
app.use('/TersectBrowser', frontend);

const port = process.env.PORT || tbConfig.server_port;
app.set('port', port);
app.listen(port, () => {
    console.log(`Server started on port ${port}`);
});
