"""The dataset assistant as mounted in the builder (server/assistant.py).

The assistant is the Tersect pack of proposer-llm, whose own tests cover the
turn loop, the readers and the propose tools. These check what this
repository adds: the builder's setting names, /api/config, the wizard's
request and proposal shapes going through the mount, and the builder running
without the package. The model is a scripted httpx.MockTransport.
"""
import importlib
import json
import sys

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from proposer import engine, llm, net
from tbpipeline.server import assistant, files

FOLDER = 'https://example.org/vcf/'


def chunk(content=None, tool_calls=None, finish=None):
    delta = {}
    if content is not None:
        delta['content'] = content
    if tool_calls is not None:
        delta['tool_calls'] = tool_calls
    return {'id': 'x', 'object': 'chat.completion.chunk',
            'choices': [{'index': 0, 'delta': delta, 'finish_reason': finish}]}


def text_reply(text):
    return [chunk(content=text), chunk(finish='stop')]


def tool_reply(name, arguments):
    call = {'index': 0, 'id': 'call_1', 'type': 'function',
            'function': {'name': name, 'arguments': json.dumps(arguments)}}
    return [chunk(tool_calls=[call]), chunk(finish='tool_calls')]


class FakeModel:
    """Scripted OpenAI-compatible /chat/completions, recording requests."""

    def __init__(self, *replies):
        self.replies, self.requests = list(replies), []

    def __call__(self, request: httpx.Request):
        self.requests.append(json.loads(request.content))
        text = ''.join('data: %s\n\n' % json.dumps(c) for c in self.replies.pop(0))
        return httpx.Response(200, headers={'Content-Type': 'text/event-stream'},
                              content=(text + 'data: [DONE]\n\n').encode())


def events_of(response):
    events = []
    for block in response.text.split('\n\n'):
        if block.strip() and not block.startswith(':'):
            event, data = block.split('\n')
            events.append((event[7:], json.loads(data[6:])))
    return events


@pytest.fixture
def client():
    app = FastAPI()
    app.include_router(assistant.router, prefix='/api')
    app.include_router(files.router, prefix='/api')
    return TestClient(app)


@pytest.fixture
def run(monkeypatch, client):
    """POST /api/assistant with a fake model; every checked URL is reachable."""
    monkeypatch.setenv('TB_ASSISTANT_URL', 'http://model.test/v1')
    monkeypatch.setenv('TB_ASSISTANT_MODEL', 'qwen3:8b')
    monkeypatch.setattr(llm, '_omit_reasoning', False)

    async def fake_check(urls):
        return [{'url': u, 'ok': True, 'status': 200, 'size': 8_000_000, 'error': None}
                for u in urls]
    monkeypatch.setattr(net, 'check_urls', fake_check)

    def go(fake, message, **context):
        monkeypatch.setattr(engine, 'transport', httpx.MockTransport(fake))
        response = client.post('/api/assistant', json={
            'messages': [{'role': 'user', 'content': message}],
            'context': {'draft_id': None, 'step': 'accessions', 'form': None, 'build': None,
                        **context}})
        assert response.status_code == 200, response.text
        return events_of(response)
    return go


def test_off_unless_configured(monkeypatch, client):
    monkeypatch.delenv('TB_ASSISTANT_URL', raising=False)
    response = client.post('/api/assistant', json={
        'messages': [{'role': 'user', 'content': 'hi'}], 'context': {}})
    assert response.status_code == 503
    assert 'TB_ASSISTANT_URL' in response.json()['detail']      # the builder's name for it
    config = client.get('/api/config').json()
    assert config['assistant'] is False and config['assistant_model'] is None
    monkeypatch.setenv('TB_ASSISTANT_URL', 'http://host.docker.internal:11434/v1')
    monkeypatch.delenv('TB_ASSISTANT_MODEL', raising=False)
    config = client.get('/api/config').json()
    assert config['assistant'] is True and config['assistant_model'] == 'qwen3:14b'
    monkeypatch.setenv('TB_ASSISTANT_MODEL', 'qwen3:8b')
    assert client.get('/api/config').json()['assistant_model'] == 'qwen3:8b'


def test_builder_settings_reach_the_assistant(monkeypatch):
    monkeypatch.setenv('TB_ASSISTANT_URL', 'http://model.test/v1/')
    monkeypatch.setenv('TB_ASSISTANT_API_KEY', 'secret')
    monkeypatch.setenv('TB_ASSISTANT_TIMEOUT', '45')
    monkeypatch.setenv('TB_ASSISTANT_CONTEXT_CHARS', '14000')
    assert llm.base_url() == 'http://model.test/v1'
    assert llm._headers()['Authorization'] == 'Bearer secret'
    assert engine.turn_timeout() == 45 and engine.context_chars() == 14000
    # One switch for the builder's own URL guard and the assistant's.
    monkeypatch.delenv('TB_BUILDER_ALLOW_PRIVATE_URLS', raising=False)
    assert not net.private_urls_allowed()
    monkeypatch.setenv('TB_BUILDER_ALLOW_PRIVATE_URLS', '1')
    assert net.private_urls_allowed() and files._private_urls_allowed()


def test_a_turn_through_the_mount(run):
    fake = FakeModel(
        tool_reply('propose_accessions', {
            'base_url': FOLDER, 'source': 'Folder listing',
            'rows': [{'name': 'RF 001', 'label': 'Heinz 1706', 'species': 'S. lycopersicum',
                      'vcf': 'RF_001.vcf.gz'}]}),
        text_reply('Proposed one accession.'))
    events = run(fake, 'Add RF 001')
    assert [e for e, _ in events][0] == 'status' and events[-1] == ('done', {})
    (card,) = [d for e, d in events if e == 'proposal']
    # The shape the wizard applies (web/src/features/datasets/assistant/types.ts).
    assert set(card) == {'id', 'kind', 'title', 'note', 'source', 'links', 'more', 'action',
                         'applicable', 'payload'}
    assert card['kind'] == 'accessions' and card['applicable'] is True
    assert card['payload']['rows'] == [{
        'name': 'RF_001', 'label': 'Heinz 1706', 'group': 'S. lycopersicum', 'sample': None,
        'info': {}, 'vcf': {'source': 'url', 'location': FOLDER + 'RF_001.vcf.gz',
                            'name': 'RF_001.vcf.gz', 'size': 8_000_000}}]
    body = fake.requests[0]
    assert body['model'] == 'qwen3:8b'
    assert {t['function']['name'] for t in body['tools']} == {
        'read_paper', 'list_directory', 'read_table', 'check_urls', 'propose_reference',
        'propose_accessions', 'propose_rename_map', 'propose_options', 'propose_sheet'}
    system = body['messages'][0]['content']
    assert 'dataset assistant of Tersect Browser' in system
    assert 'Current wizard step: accessions' in system and 'The form is empty.' in system


def test_failed_build_shows_the_rename_map(run):
    """The wizard sends the form and the failed build; the card is worked out
    from them before the model says anything."""
    form = {'reference': {'id': 'SL2.50', 'sequences': [{'name': 'SL2.50ch01'}],
                          'chromosomes': ['SL2.50ch01', 'SL2.50ch02']},
            'vcfs': [{'file': {'source': 'upload', 'location': 'u1', 'name': 'a.vcf.gz'},
                      'samples': ['A'], 'contigs': ['chr1', 'chr2']}],
            'accessions': [{'name': 'A'}]}
    build = {'id': 'b1', 'status': 'failed', 'log': [],
             'error': {'stage': 'accessions', 'file': 'a.vcf.gz',
                       'message': 'No VCF contig matches the reference',
                       'fix': {'step': 'accessions', 'kind': 'rename-map'}}}
    fake = FakeModel(text_reply('The VCF names its chromosomes chr1 and chr2.'))
    events = run(fake, 'Explain the build error', step='build', form=form, build=build)
    assert events[0][0] == 'proposal'
    card = events[0][1]
    assert card['kind'] == 'rename-map'
    assert card['payload'] == {'files': ['a.vcf.gz'],
                               'map': {'chr1': 'SL2.50ch01', 'chr2': 'SL2.50ch02'}}
    system = fake.requests[0]['messages'][0]['content']
    assert 'CONTIGS DO NOT MATCH THE REFERENCE' in system and 'Build b1 (status failed)' in system


def test_builder_runs_without_the_package(monkeypatch):
    monkeypatch.setenv('TB_ASSISTANT_URL', 'http://model.test/v1')
    monkeypatch.setitem(sys.modules, 'proposer', None)      # import proposer -> ImportError
    try:
        importlib.reload(assistant)
        assert not assistant.installed() and not assistant.enabled()
        app = FastAPI()
        app.include_router(assistant.router, prefix='/api')
        app.include_router(files.router, prefix='/api')
        client = TestClient(app)
        assert client.get('/api/config').json()['assistant'] is False
        response = client.post('/api/assistant', json={})
        assert response.status_code == 503 and 'not installed' in response.json()['detail']
    finally:
        monkeypatch.undo()
        importlib.reload(assistant)
    assert assistant.installed()
