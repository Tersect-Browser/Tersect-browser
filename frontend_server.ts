import express = require('express'); // Legacy (non-ES6) import syntax
import path = require('path');
import cors = require('cors');

const app = express();
const port = process.env.PORT || 4200;

app.set('port', port);
app.use(cors());
// app.use('/SMIS', express.static(path.join(__dirname, 'dist')));
// app.use('/', express.static(path.join(__dirname, 'dist')));

app.use(express.static(path.join(__dirname, 'dist')));

/*app.get('/', function(req, res) {
    res.sendFile(path.resolve(__dirname, 'dist/index.html'));
  });*/

app.listen(port, () => {
    console.log('Server started on port ' + port);
});
