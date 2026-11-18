"""FastAPI application: one router per area."""
from fastapi import FastAPI

from . import assistant, auth, builds, datasets, drafts, files, uploads

app = FastAPI(title='Tersect Browser builder', docs_url='/api/docs',
              openapi_url='/api/openapi.json')

# auth: /api/session, /api/login, /api/logout. With TB_ADMIN_PASSWORD set,
#       everything else needs the session it gives (auth.Protect).
app.add_middleware(auth.Protect)
app.include_router(auth.router, prefix='/api')
# files: /api/config, /api/storage, /api/server-files, /api/datasets/inspect,
#        /api/datasets/check-urls
app.include_router(files.router, prefix='/api')
# uploads: /api/uploads (tus)
app.include_router(uploads.router, prefix='/api')
# drafts: /api/drafts
app.include_router(drafts.router, prefix='/api')
# datasets: /api/datasets, /api/datasets/validate, /api/datasets/manifest.yaml,
#           /api/datasets/{id}[/add|/rebuild|/manifest.yaml]
app.include_router(datasets.router, prefix='/api')
# builds: /api/builds[/{id}[/events|/cancel|/retry|/manifest.yaml]]
app.include_router(builds.router, prefix='/api')
# assistant: /api/assistant (SSE), from proposer-llm; 503 unless TB_ASSISTANT_URL is set
app.include_router(assistant.router, prefix='/api')


@app.on_event('startup')
def _start_worker():
    builds.start_worker()
