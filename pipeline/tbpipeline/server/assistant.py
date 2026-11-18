"""Dataset assistant: POST /api/assistant (spec section 9).

    POST /api/assistant    AssistantRequest -> text/event-stream

Contract: web/src/features/datasets/assistant/types.ts. Events:

    event: status    data: {"text": "Reading the paper…"}
    event: text      data: {"delta": "…"}
    event: thinking  data: {"delta": "…"}       (only when the request asks)
    event: proposal  data: Proposal
    event: done      data: {}
    event: error     data: {"message": "…"}     (then the stream ends)

The assistant itself is the Tersect pack of proposer-llm
(github.com/daviddamilola/proposer): the turn loop, the model client, the
readers (papers, folder listings, tables, URL checks) and the propose tools
that map onto the wizard form live there, with their tests. This module
mounts it in the builder under the builder's own setting names.

The model runs on an OpenAI-compatible endpoint on this server or its network
(TB_ASSISTANT_URL), so no paper, file name or genotype is sent to an outside
model service. It may only read and propose. Proposals are checked before
they are shown and are applied, if at all, by the user in the form, where the
usual validation runs. Nothing here writes a draft or starts a build.

Without the proposer-llm package the builder still runs: the assistant is
reported as off (/api/config) and POST /api/assistant answers 503.
"""
import os

from fastapi import APIRouter, HTTPException

try:
    from proposer import server, settings
    from proposer.packs import tersect
except ImportError:          # the package is not installed in this environment
    server = None

if server is not None:
    # TB_ASSISTANT_URL, _MODEL, _API_KEY, _TIMEOUT, _CONTEXT_CHARS, _REASONING and
    # _THINKING_EFFORT stand for proposer's PROPOSER_* settings; the URL guard
    # follows the builder's own switch.
    settings.alias('TB_ASSISTANT_', ALLOW_PRIVATE_URLS='TB_BUILDER_ALLOW_PRIVATE_URLS')
    pack = tersect.pack()
    router = server.router(pack)
else:
    router = APIRouter()

    @router.post('/assistant')
    async def post_assistant():
        raise HTTPException(503, 'The dataset assistant is not installed on this server '
                                 '(pip install proposer-llm).')


def installed() -> bool:
    return server is not None


def enabled() -> bool:
    """Whether the panel should be offered: installed and pointed at a model."""
    return installed() and bool(os.environ.get('TB_ASSISTANT_URL', '').strip())


def model() -> str | None:
    """The model the assistant uses, if it is enabled."""
    if not enabled():
        return None
    from proposer import llm
    return llm.model()
