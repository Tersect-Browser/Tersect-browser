import { app } from './src/app';
import { tbConfig } from './src/utils/config';

const port = process.env.PORT
             || tbConfig.server_port_dev
             || tbConfig.server_port;
app.set('port', port);
app.listen(port, () => {
    console.log(`Development server started on port ${port}`);
});
