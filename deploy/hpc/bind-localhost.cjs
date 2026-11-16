// Preloaded into the backend on HPC (NODE_OPTIONS=--require=...).
//
// backend/server-dev.ts calls app.listen(port), which listens on every
// interface. In Docker that is the container's private network; under
// Apptainer there is no network namespace, so it would be every interface of
// a shared compute node, with no password in front of it. This makes a
// listen() that names only a port use TB_BIND_HOST instead.
'use strict';

const net = require('node:net');

const host = process.env.TB_BIND_HOST;
if (host) {
  const listen = net.Server.prototype.listen;
  net.Server.prototype.listen = function (...args) {
    const first = args[0];
    const isPort = typeof first === 'number' || (typeof first === 'string' && /^\d+$/.test(first));
    if (isPort && typeof args[1] !== 'string') {
      args.splice(1, 0, host);
    }
    return listen.apply(this, args);
  };
}
