import os

import uvicorn

uvicorn.run('tbpipeline.server.app:app', host='0.0.0.0',
            port=int(os.environ.get('TB_BUILDER_PORT', '4310')), log_level='info')
