import express = require('express'); // Legacy (non-ES6) import syntax

import { router } from './src/backend/tersect-router';

const app = express();
const port = process.env.PORT || 8040;

app.use('/api', router);

app.listen(port, () => {
    console.log('Server started on port ' + port);
});
