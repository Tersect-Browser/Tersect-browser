import express = require('express'); // Legacy (non-ES6) import syntax
import mongoose = require('mongoose');

import { router } from './src/backend/tersect-router';

const app = express();
const port = process.env.PORT || 8060;

mongoose.connect('mongodb://localhost:27017/tersect', { useNewUrlParser: true });
mongoose.set('useCreateIndex', true);

app.use('/tbapi', router);

app.listen(port, () => {
    console.log('Server started on port ' + port);
});
