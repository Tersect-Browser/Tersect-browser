import { app } from './src/app';
import { tbConfig } from './src/load-config';

const port = process.env.PORT || tbConfig.serverPort;
app.set('port', port);
app.listen(port, () => {
    console.log(`Development server started on port ${port}`);
});
