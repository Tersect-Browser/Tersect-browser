import { tbConfig } from '../common/config';
import { app } from './src/app';

const port = process.env.PORT || tbConfig.server_port;
app.set('port', port);
app.listen(port, () => {
    console.log(`Development server started on port ${port}`);
});
