import express = require('express');
import path = require('path');
import cors = require('cors');

const app = express();
const port = process.env.PORT || 4500;

app.set('port', port);
app.use(cors());

app.use('/TersectBrowser', express.static(path.join(__dirname, 'dist')));
app.use('*', express.static(path.join(__dirname, 'dist')));
app.listen(port, () => {
    console.log('Server started on port ' + port);
});
