"""Dataset assistant (server/assistant*.py) against a fake OpenAI-compatible model.

The model is an httpx.MockTransport that serves scripted streamed responses
(text deltas and tool calls) and records what it was sent. Document fetches
and URL checks are replaced with canned responses, so these tests need no
network. Tests marked `network` read real papers and folders; run them with
TB_NETWORK_TESTS=1.
"""
import asyncio
import json
import os

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from tbpipeline.server import assistant, assistant_llm, assistant_propose, assistant_read, files

network = pytest.mark.skipif(not os.environ.get('TB_NETWORK_TESTS'),
                             reason='set TB_NETWORK_TESTS=1 to read real papers')

SGN = 'https://solgenomics.net/ftp/genomes/tomato_150/150_VCFs_2.50/'
FASTA = 'https://solgenomics.net/ftp/tomato_genome/assembly/build_2.50/S_lycopersicum_chromosomes.2.50.fa.gz'
GFF = 'https://solgenomics.net/ftp/tomato_genome/annotation/ITAG2.4_release/ITAG2.4_gene_models.gff3.gz'


# ------------------------------------------------------------ fake model --

def chunk(content=None, tool_calls=None, finish=None, reasoning=None):
    delta = {}
    if content is not None:
        delta['content'] = content
    if reasoning is not None:
        delta['reasoning'] = reasoning
    if tool_calls is not None:
        delta['tool_calls'] = tool_calls
    return {'id': 'x', 'object': 'chat.completion.chunk',
            'choices': [{'index': 0, 'delta': delta, 'finish_reason': finish}]}


def call(index, name, arguments, split=True):
    """Tool call chunks, with the arguments split across two deltas."""
    text = arguments if isinstance(arguments, str) else json.dumps(arguments)
    half = len(text) // 2 if split else len(text)
    first = {'index': index, 'id': 'call_%s_%d' % (name, index), 'type': 'function',
             'function': {'name': name, 'arguments': text[:half]}}
    chunks = [chunk(tool_calls=[first])]
    if text[half:]:
        chunks.append(chunk(tool_calls=[{'index': index, 'function': {'arguments': text[half:]}}]))
    return chunks


def text_reply(*deltas):
    return [chunk(content=d) for d in deltas] + [chunk(finish='stop')]


def tool_reply(*calls):
    chunks = []
    for c in calls:
        chunks += c
    return chunks + [chunk(finish='tool_calls')]


class FakeModel:
    """Scripted OpenAI-compatible /chat/completions, recording requests."""

    def __init__(self, *replies):
        self.replies, self.requests = list(replies), []

    def __call__(self, request: httpx.Request):
        assert request.url.path.endswith('/v1/chat/completions')
        body = json.loads(request.content)
        self.requests.append(body)
        reply = self.replies.pop(0)
        if isinstance(reply, httpx.Response):
            return reply
        text = ''.join('data: %s\n\n' % json.dumps(c) for c in reply) + 'data: [DONE]\n\n'
        return httpx.Response(200, headers={'Content-Type': 'text/event-stream'},
                              content=text.encode())


def events_of(response):
    """Parse an SSE body into [(event, data)], checking the framing."""
    assert response.headers['content-type'].startswith('text/event-stream')
    events = []
    for block in response.text.split('\n\n'):
        if not block.strip() or block.startswith(':'):
            continue
        lines = block.split('\n')
        assert lines[0].startswith('event: ') and lines[1].startswith('data: '), block
        assert len(lines) == 2, block
        events.append((lines[0][7:], json.loads(lines[1][6:])))
    return events


@pytest.fixture
def run(monkeypatch):
    """POST /api/assistant with a fake model; returns (events, fake)."""
    monkeypatch.setenv('TB_ASSISTANT_URL', 'http://model.test/v1')
    monkeypatch.setenv('TB_ASSISTANT_MODEL', 'qwen3:8b')
    monkeypatch.setattr(assistant_llm, '_omit_reasoning', False)
    app = FastAPI()
    app.include_router(assistant.router, prefix='/api')
    client = TestClient(app)

    def go(fake, message='Replicate 10.1111/tpj.12616', form=None, step='reference',
           build=None, think=False, history=()):
        monkeypatch.setattr(assistant, 'transport', httpx.MockTransport(fake))
        response = client.post('/api/assistant', json={
            'messages': list(history) + [{'role': 'user', 'content': message}],
            'context': {'draft_id': None, 'step': step, 'form': form, 'build': build},
            'think': think})
        assert response.status_code == 200, response.text
        return events_of(response)
    return go


@pytest.fixture
def web(monkeypatch):
    """Canned documents for fetch() and URL checks (404 for anything with 'RF_099')."""
    listing = '<html><body><h1>Index of /x/</h1><pre><a href="../">../</a>\n' + ''.join(
        '<a href="RF_%03d_X.vcf.gz">RF_%03d_X.vcf.gz</a>   08-Sep-2016 15:39   8M\n' % (n, n)
        for n in (1, 2, 3)) + '</pre></body></html>'
    documents = {
        'https://api.crossref.org/works/10.1111/tpj.12616': (200, 'application/json', json.dumps(
            {'message': {'title': ['Exploring genetic variation in the tomato clade'],
                         'author': [{'family': 'Aflitos'}, {'family': 'Schijlen'}],
                         'issued': {'date-parts': [[2014]]},
                         'container-title': ['The Plant Journal']}})),
        'europepmc-search': (200, 'application/json', json.dumps({'resultList': {'result': [
            {'title': 'Exploring genetic variation', 'isOpenAccess': 'N', 'inEPMC': 'N',
             'abstractText': 'We explored genetic variation by sequencing 84 tomato accessions.'}
        ]}})),
        'https://doi.org/10.1111/tpj.12616': (403, 'text/html', 'denied'),
        SGN: (200, 'text/html', listing),
    }
    fetched = []

    async def fake_fetch(url, max_bytes=0, timeout=0, accept=None):
        fetched.append(url)
        key = 'europepmc-search' if 'europepmc/webservices/rest/search' in url else url
        if key not in documents:
            raise assistant_read.ToolError('could not connect to %s' % url)
        status, content_type, body = documents[key]
        return assistant_read.Fetched(url, status, content_type, body.encode(), False)

    async def fake_check(urls):
        return [{'url': u, 'ok': 'RF_099' not in u, 'status': 404 if 'RF_099' in u else 200,
                 'size': None if 'RF_099' in u else 8_000_000,
                 'error': 'not found (404)' if 'RF_099' in u else None} for u in urls]

    monkeypatch.setattr(assistant_read, 'fetch', fake_fetch)
    monkeypatch.setattr(files, 'check_urls', fake_check)
    return fetched


def texts(events):
    return ''.join(d['delta'] for e, d in events if e == 'text')


def proposals(events):
    return [d for e, d in events if e == 'proposal']


# --------------------------------------------------------------- tests --

def test_not_configured(monkeypatch):
    monkeypatch.delenv('TB_ASSISTANT_URL', raising=False)
    app = FastAPI()
    app.include_router(assistant.router, prefix='/api')
    app.include_router(files.router, prefix='/api')
    client = TestClient(app)
    response = client.post('/api/assistant', json={'messages': [{'role': 'user', 'content': 'hi'}],
                                                    'context': {}})
    assert response.status_code == 503
    assert 'TB_ASSISTANT_URL' in response.json()['detail']
    config = client.get('/api/config').json()
    assert config['assistant'] is False and config['assistant_model'] is None
    monkeypatch.setenv('TB_ASSISTANT_URL', 'http://host.docker.internal:11434/v1')
    monkeypatch.delenv('TB_ASSISTANT_MODEL', raising=False)
    assert client.get('/api/config').json()['assistant_model'] == 'qwen3:14b'


def test_sse_framing_and_request(run):
    fake = FakeModel(text_reply('Hello', ' there.'))
    events = run(fake, message='What is a rename map?')
    names = [e for e, _ in events]
    assert names[0] == 'status' and names[-1] == 'done'
    assert texts(events) == 'Hello there.'
    body = fake.requests[0]
    assert body['model'] == 'qwen3:8b' and body['stream'] is True
    assert {t['function']['name'] for t in body['tools']} >= {
        'read_paper', 'list_directory', 'read_table', 'check_urls', 'propose_reference',
        'propose_accessions', 'propose_rename_map', 'propose_options', 'propose_sheet'}
    system = body['messages'][0]
    assert system['role'] == 'system' and 'UNTRUSTED' in system['content']
    assert body['messages'][-1] == {'role': 'user', 'content': 'What is a rename map?'}
    assert body['reasoning_effort'] == 'none'


def test_paper_replication_flow(run, web):
    fake = FakeModel(
        tool_reply(call(0, 'read_paper', {'doi_or_url': '10.1111/tpj.12616'})),
        tool_reply(call(0, 'list_directory', {'url': SGN})),
        tool_reply(
            call(0, 'propose_reference', {'fasta_url': FASTA, 'gff_url': GFF,
                                          'reference_id': 'SL2.50', 'name': 'Tomato 150',
                                          'source': 'SGN tomato_genome/assembly'}),
            call(1, 'propose_accessions', {
                'base_url': SGN, 'source': 'Folder listing 150_VCFs_2.50',
                'rows': [{'name': 'RF 001', 'label': 'Heinz 1706', 'species': 'S. lycopersicum',
                          'vcf': 'RF_001_X.vcf.gz'},
                         {'name': 'RF_002', 'species': 'S. pimpinellifolium',
                          'vcf': SGN + 'RF_002_X.vcf.gz'},
                         {'name': 'RF_099', 'vcf': 'RF_099_X.vcf.gz'}],
                'missing': ['RF_100']})),
        text_reply('I proposed the SL2.50 reference and 2 accessions.'))
    events = run(fake)
    assert [e for e, _ in events][-1] == 'done'
    statuses = [d['text'] for e, d in events if e == 'status']
    assert 'Reading the paper…' in statuses and 'Listing solgenomics.net…' in statuses

    reference, accessions = proposals(events)
    assert reference['kind'] == 'reference' and reference['applicable'] is True
    assert reference['payload']['fasta']['location'] == FASTA
    assert reference['payload']['fasta']['source'] == 'url'
    assert reference['payload']['reference_id'] == 'SL2.50'
    assert reference['source'] == 'SGN tomato_genome/assembly'

    assert accessions['kind'] == 'accessions' and accessions['applicable'] is True
    rows = accessions['payload']['rows']
    assert [r['name'] for r in rows] == ['RF_001', 'RF_002']        # 'RF 001' sanitised
    assert rows[0]['label'] == 'Heinz 1706' and rows[0]['group'] == 'S. lycopersicum'
    assert rows[1]['label'] == 'RF_002'
    assert rows[0]['vcf'] == {'source': 'url', 'location': SGN + 'RF_001_X.vcf.gz',
                              'name': 'RF_001_X.vcf.gz', 'size': 8_000_000}
    assert accessions['payload']['missing'] == ['RF_099', 'RF_100']
    failed = [l for l in accessions['links'] if not l['ok']]
    assert [l['url'] for l in failed] == [SGN + 'RF_099_X.vcf.gz']
    assert failed[0]['error'] == 'not found (404)'
    assert '2 with reachable VCF links' in accessions['note']
    assert accessions['action'] == 'Review 2'

    # What the model was told, round by round.
    paper = fake.requests[1]['messages'][-1]
    assert paper['role'] == 'tool' and 'Aflitos' in paper['content']
    assert 'refuses automated access' in paper['content']
    listing = fake.requests[2]['messages'][-1]['content']
    assert '3 files, 0 folders' in listing and 'RF_001_X.vcf.gz  8M' in listing
    summaries = [m['content'] for m in fake.requests[3]['messages'] if m['role'] == 'tool'][-2:]
    assert summaries[1].startswith('Shown: 2 of 4 accessions with reachable VCFs, 2 missing')
    assert 'RF_099' in summaries[1]
    assert texts(events) == 'I proposed the SL2.50 reference and 2 accessions.'


def test_guessed_vcf_names_send_the_model_back_to_list(run, web):
    """Seen with qwen3:8b: it invented "accession_1.vcf.gz" names without listing
    the folder. No card; the model is told to list, and its retry succeeds."""
    fake = FakeModel(
        tool_reply(call(0, 'propose_accessions', {
            'base_url': SGN, 'source': 'User',
            # The fake web 404s anything containing RF_099.
            'rows': [{'name': 'a1', 'vcf': 'RF_099_accession_1.vcf.gz'},
                     {'name': 'a2', 'vcf': 'RF_099_accession_2.vcf.gz'}]})),
        tool_reply(call(0, 'list_directory', {'url': SGN})),
        tool_reply(call(0, 'propose_accessions', {
            'base_url': SGN, 'source': 'Folder listing',
            'rows': [{'name': 'RF_001', 'vcf': 'RF_001_X.vcf.gz'}]})),
        text_reply('Done.'))
    events = run(fake)
    (accessions,) = proposals(events)          # only the retry produced a card
    assert accessions['applicable'] is True
    told = fake.requests[1]['messages'][-1]['content']
    assert told.startswith('Error: none of the 2 VCF URLs exist')
    assert 'list_directory on ' + SGN in told


def test_accessions_from_a_folder_pattern(run, web):
    """Folder mode: the model names a folder and a pattern instead of writing
    every row (qwen3:8b timed out writing 84 rows)."""
    fake = FakeModel(
        tool_reply(call(0, 'propose_accessions', {
            'base_url': SGN, 'pattern': '*.vcf.gz', 'name_regex': r'^(RF_\d+)',
            'group': 'S. lycopersicum', 'source': 'Folder listing 150_VCFs_2.50'})),
        text_reply('Done.'))
    (accessions,) = proposals(run(fake))
    rows = accessions['payload']['rows']
    assert [r['name'] for r in rows] == ['RF_001', 'RF_002', 'RF_003']
    assert all(r['group'] == 'S. lycopersicum' for r in rows)
    assert rows[0]['vcf']['location'] == SGN + 'RF_001_X.vcf.gz'


def test_folder_pattern_matching_nothing_is_an_error(run, web):
    fake = FakeModel(
        tool_reply(call(0, 'propose_accessions', {
            'base_url': SGN, 'pattern': '*.bcf', 'source': 'Folder listing'})),
        text_reply('Nothing matched.'))
    events = run(fake)
    assert proposals(events) == []
    assert "matches '*.bcf'" in fake.requests[1]['messages'][-1]['content']


def test_unreachable_reference_is_not_applicable(run, web):
    fake = FakeModel(
        tool_reply(call(0, 'propose_reference', {'fasta_url': SGN + 'RF_099.fa.gz',
                                                 'source': 'Methods, para. 1'})),
        text_reply('The FASTA link is not reachable.'))
    events = run(fake)
    (reference,) = proposals(events)
    assert reference['applicable'] is False and reference['payload']['fasta'] is None
    assert reference['links'][0]['ok'] is False


def test_malformed_tool_call_then_retry(run):
    fake = FakeModel(
        tool_reply(call(0, 'propose_options', '{"effects": "fast", "source": ')),     # bad JSON
        tool_reply(call(0, 'propose_options', {'effects': 'fast', 'source': 'x'})),  # bad values
        tool_reply(call(0, 'propose_options', {'types': 'snps', 'homozygous': True,
                                               'source': 'Methods, para. 3'})),
        text_reply('Use homozygous SNPs.'))
    events = run(fake, message='Which options?', step='options')
    first = fake.requests[1]['messages'][-1]['content']
    assert first.startswith('Error: the arguments are not valid JSON')
    second = fake.requests[2]['messages'][-1]['content']
    assert second.startswith('Error: invalid arguments for propose_options') and 'effects' in second
    (options,) = proposals(events)
    assert options['payload'] == {'effects': None, 'snpeff_db': None, 'types': 'snps',
                                  'homozygous': True}
    assert [e for e, _ in events][-1] == 'done'


def test_unknown_tool_and_missing_source(run):
    fake = FakeModel(
        tool_reply(call(0, 'start_build', {}), call(1, 'propose_options', {'types': 'snps'})),
        text_reply('ok'))
    events = run(fake, message='Build it')
    results = [m['content'] for m in fake.requests[1]['messages'] if m['role'] == 'tool']
    assert results[0].startswith("Error: unknown tool 'start_build'")
    assert 'source' in results[1] and results[1].startswith('Error: invalid arguments')
    assert proposals(events) == []


def test_think_tags_are_stripped(run):
    fake = FakeModel(text_reply('<thi', 'nk>secret reasoning</th', 'ink>\n\nHello ', 'world'))
    events = run(fake, message='hi')
    assert texts(events) == 'Hello world'
    assert 'secret' not in json.dumps(events)


def test_reasoning_deltas_are_not_streamed(run):
    fake = FakeModel([chunk(reasoning='hidden'), chunk(content='Visible'), chunk(finish='stop')])
    events = run(fake, message='hi')
    assert texts(events) == 'Visible'


def thinking(events):
    return ''.join(d['delta'] for e, d in events if e == 'thinking')


def test_reasoning_is_streamed_when_asked(run):
    fake = FakeModel([chunk(reasoning='The user wants '), chunk(reasoning='a rename map.'),
                      chunk(content='Visible'), chunk(finish='stop')])
    events = run(fake, message='hi', think=True)
    assert thinking(events) == 'The user wants a rename map.'
    assert texts(events) == 'Visible'
    body = fake.requests[0]
    assert body['reasoning_effort'] == 'medium'
    assert '/no_think' not in body['messages'][0]['content']


def test_think_tags_become_thinking_when_asked(run):
    fake = FakeModel(text_reply('<thi', 'nk>step one, ', 'step two</th', 'ink>\n\nHello'))
    events = run(fake, message='hi', think=True)
    assert thinking(events) == 'step one, step two'
    assert texts(events) == 'Hello'


def test_reasoning_stays_hidden_by_default(run):
    fake = FakeModel([chunk(reasoning='hidden'), chunk(content='Visible'), chunk(finish='stop')])
    events = run(fake, message='hi')
    assert thinking(events) == '' and fake.requests[0]['reasoning_effort'] == 'none'
    assert fake.requests[0]['messages'][0]['content'].endswith('/no_think')


def test_think_filter_units():
    f = assistant_llm.ThinkFilter()
    out = f.feed('a <think>x') + f.feed('y</think> b <tool_call>{"name": "check_urls", ') + \
        f.feed('"arguments": {"urls": ["https://e.org/a"]}}</tool_call> c') + f.flush()
    assert out == 'a  b  c'
    (parsed,) = assistant_llm.parse_text_tool_calls(f.tool_texts)
    assert parsed['function']['name'] == 'check_urls'
    assert json.loads(parsed['function']['arguments']) == {'urls': ['https://e.org/a']}
    # A closing tag whose opening tag came from the prompt template.
    f = assistant_llm.ThinkFilter()
    assert f.feed('reasoning here</think>\n\nAnswer') + f.flush() == 'Answer'
    # An unclosed think block is dropped; a lone '<' is kept.
    f = assistant_llm.ThinkFilter()
    assert f.feed('x < y <think>never closed') + f.flush() == 'x < y '


def test_text_tool_calls_are_run(run, web):
    """A model that writes <tool_call> in its text instead of native tool calls."""
    fake = FakeModel(
        text_reply('<tool_call>{"name": "list_directory", "arguments": {"url": "%s"}}</tool_call>'
                   % SGN),
        text_reply('Three VCFs.'))
    events = run(fake, message='List it')
    assert texts(events) == 'Three VCFs.'
    assert '3 files' in fake.requests[1]['messages'][-1]['content']


def test_model_without_tools(run):
    fake = FakeModel(httpx.Response(400, json={'error': {
        'message': 'registry.ollama.ai/library/gemma:2b does not support tools'}}))
    events = run(fake, message='hi')
    assert events[-1][0] == 'error'
    assert 'does not support tool calling' in events[-1][1]['message']


def test_reasoning_effort_rejected_is_retried_without(run):
    fake = FakeModel(httpx.Response(400, json={'error': 'unknown field reasoning_effort'}),
                     text_reply('ok'))
    events = run(fake, message='hi')
    assert texts(events) == 'ok'
    assert 'reasoning_effort' in fake.requests[0] and 'reasoning_effort' not in fake.requests[1]


def test_unreachable_model_gives_error_event(run):
    def refuse(request):
        raise httpx.ConnectError('refused')
    events = run(refuse, message='hi')
    assert events[-1][0] == 'error' and 'Cannot reach' in events[-1][1]['message']


def test_exception_in_tool_ends_with_error(run, monkeypatch):
    async def boom(call, form, emit, shown=None):
        raise RuntimeError('kaput')
    monkeypatch.setattr(assistant, 'execute', boom)
    fake = FakeModel(tool_reply(call(0, 'check_urls', {'urls': ['https://e.org']})))
    events = run(fake, message='hi')
    assert events[-1] == ('error', {'message': 'The assistant failed: kaput'})


def test_round_limit(run, web, monkeypatch):
    monkeypatch.setattr(assistant, 'MAX_ROUNDS', 2)
    fake = FakeModel(*[tool_reply(call(0, 'list_directory', {'url': SGN}))] * 2,
                     text_reply('Stopping here.'))
    events = run(fake, message='Loop')
    assert 'tools' not in fake.requests[2]
    assert 'tool limit' in fake.requests[2]['messages'][-1]['content']
    assert texts(events) == 'Stopping here.' and events[-1][0] == 'done'


FORM = {
    'name': 'Tiny', 'description': '',
    'reference': {'id': 'SL2.50', 'fasta': {'source': 'url', 'location': FASTA,
                                            'name': 'S_lycopersicum_chromosomes.2.50.fa.gz'},
                  'gff': None,
                  'sequences': [{'name': 'SL2.50ch%02d' % n, 'length': 1} for n in range(13)],
                  'chromosomes': ['SL2.50ch%02d' % n for n in range(1, 13)], 'gffSeqids': None},
    'vcfs': [{'id': 'v1', 'file': {'source': 'upload', 'location': 'u1', 'name': 'a.vcf.gz'},
              'samples': ['A'], 'contigs': ['chr%d' % n for n in range(0, 13)],
              'hasGenotypes': True, 'inspectError': None, 'selected': ['A'],
              'renameContigs': None},
             {'id': 'v2', 'file': {'source': 'upload', 'location': 'u2', 'name': 'b.vcf.gz'},
              'samples': ['B'], 'contigs': ['SL2.50ch01'], 'hasGenotypes': True,
              'inspectError': None, 'selected': ['B'], 'renameContigs': None}],
    'accessions': [{'id': 'r1', 'name': 'A', 'label': 'A', 'group': '', 'fileId': 'v1',
                    'sample': 'A', 'info': {}},
                   {'id': 'r2', 'name': 'B', 'label': 'B', 'group': '', 'fileId': 'v2',
                    'sample': 'B', 'info': {}}],
    'options': {'effects': 'none', 'snpeffDb': '', 'types': 'snps', 'homozygous': True,
                'useIndex': False, 'index': None, 'indexSamples': None},
}


def test_rename_map_is_computed_from_the_form(run):
    build = {'id': 'b1', 'status': 'failed',
             'error': {'stage': 'accessions', 'message': 'No VCF contig matches the reference',
                       'file': 'a.vcf.gz', 'fix': {'step': 'accessions', 'kind': 'rename-map'}},
             'log': [{'t': 'checking a.vcf.gz'}, {'t': 'contig chr1 not in reference',
                                                  'error': True}]}
    fake = FakeModel(
        tool_reply(call(0, 'propose_rename_map', {'map': {'chr1': 'wrong'},
                                                  'source': 'Build error and VCF header'})),
        text_reply('The VCF calls chromosomes chr1…chr12.'))
    events = run(fake, message='Explain', form=FORM, step='build', build=build)
    # The server shows the computed map before the model runs; the model's own
    # (wrong) map is refused rather than shown as a second card.
    (proposal,) = proposals(events)
    assert [e for e, _ in events][:1] == ['proposal']
    told = [m for m in fake.requests[1]['messages'] if m['role'] == 'tool'][-1]['content']
    assert told.startswith('Error: a rename-map card is already shown')
    assert proposal['kind'] == 'rename-map' and proposal['applicable'] is True
    assert proposal['payload']['files'] == ['a.vcf.gz']
    mapping = proposal['payload']['map']
    assert mapping['chr1'] == 'SL2.50ch01' and mapping['chr12'] == 'SL2.50ch12'
    assert 'chr0' not in mapping           # ch00 is not a chosen chromosome
    system = fake.requests[0]['messages'][0]['content']
    assert 'CONTIGS DO NOT MATCH THE REFERENCE' in system
    assert 'No VCF contig matches the reference' in system and '! contig chr1' in system
    assert 'Accessions (2): A, B' in system


def test_sheet_matches_form_rows(run):
    fake = FakeModel(
        tool_reply(call(0, 'propose_sheet', {'source': 'Pasted table', 'rows': [
            {'name': 'a', 'label': 'Accession A', 'group': 'wild', 'info': {'Origin': 'Peru'}},
            {'name': 'Z', 'label': 'nope'}]})),
        text_reply('Done.'))
    events = run(fake, message='Here is my table', form=FORM, step='accessions')
    (sheet,) = proposals(events)
    assert sheet['payload']['rows'] == [{'name': 'A', 'label': 'Accession A', 'group': 'wild',
                                         'info': {'Origin': 'Peru'}}]
    assert 'not in the form: Z' in sheet['note'] and sheet['applicable'] is True


def test_history_and_fit():
    messages = [{'role': 'system', 'content': 's' * 100},
                {'role': 'user', 'content': 'u' * 5000},
                {'role': 'assistant', 'content': 'a' * 5000},
                {'role': 'user', 'content': 'now'},
                {'role': 'assistant', 'content': '', 'tool_calls': [
                    {'id': '1', 'function': {'name': 'read_paper', 'arguments': '{}'}}]},
                {'role': 'tool', 'tool_call_id': '1', 'content': 'p' * 6000},
                {'role': 'assistant', 'content': '', 'tool_calls': [
                    {'id': '2', 'function': {'name': 'list_directory', 'arguments': '{}'}}]},
                {'role': 'tool', 'tool_call_id': '2', 'content': 'l' * 4000}]
    out = assistant.fit(messages, 6000)
    assert out[0]['role'] == 'system' and out[1] == {'role': 'user', 'content': 'now'}
    assert len(out[3]['content']) < 700          # older tool result shortened
    assert out[-1]['content'] == 'l' * 4000      # latest kept whole


def test_names_and_rename_helpers():
    assert assistant_propose.fix_name('S. lyc LA2706') == 'S._lyc_LA2706'
    assert assistant_propose.fix_name('_x') == 'S_x'
    assert assistant_propose.suggest_rename_map(['1', 'chr2', 'SL2.50ch03', 'scaf'],
                                                ['SL2.50ch01', 'SL2.50ch02', 'SL2.50ch03']) == {
        '1': 'SL2.50ch01', 'chr2': 'SL2.50ch02'}


def test_parsers_offline():
    html = ('<pre><a href="?C=N">Name</a>\n<a href="../">../</a>\n'
            '<a href="sub/">sub/</a>  01-Jan-2020 10:00  -\n'
            '<a href="a.vcf.gz">a.vcf.gz</a>  01-Jan-2020 10:00  1.2G\n</pre>')
    entries = assistant_read.parse_index(html, 'https://e.org/d/')
    assert entries == [{'name': 'sub/', 'dir': True, 'size': ''},
                       {'name': 'a.vcf.gz', 'dir': False, 'size': '1.2G'}]
    jats = b'''<article xmlns:xlink="http://www.w3.org/1999/xlink"><body>
      <sec><title>Methods</title><sec><title>Variant calling</title>
      <p>Reads were aligned with BWA and SNPs called with GATK into one VCF per accession.</p>
      </sec></sec></body><back><sec sec-type="data-availability"><title>Data availability</title>
      <p>VCF files are at <ext-link xlink:href="https://e.org/vcf/">e.org</ext-link>.</p></sec>
      <app-group><supplementary-material><label>Table S1</label><caption><p>Accessions</p></caption>
      <media xlink:href="tableS1.xlsx"/></supplementary-material></app-group></back></article>'''
    parsed = assistant_read.parse_jats(jats, 'PMC1')
    assert parsed['availability'][0][0] == 'Data availability, para. 1'
    assert parsed['paragraphs'][0][0] == 'Methods > Variant calling, para. 1'
    assert parsed['supplements'][0]['url'].endswith('PMC1/supplementaryFiles#tableS1.xlsx')
    assert 'https://e.org/vcf/' in parsed['links']


def test_read_table_formats(monkeypatch):
    import io
    import zipfile
    import openpyxl
    book = openpyxl.Workbook()
    sheet = book.active
    sheet.title = 'S1'
    sheet.append(['Accession', 'Species'])
    for n in range(5):
        sheet.append(['LA%d' % n, 'S. lycopersicum'])
    xlsx = io.BytesIO()
    book.save(xlsx)
    archive = io.BytesIO()
    with zipfile.ZipFile(archive, 'w') as z:
        z.writestr('tableS1.xlsx', xlsx.getvalue())
        z.writestr('t.tsv', 'a\tb\n1\t2\n')
    bodies = {'https://e.org/s.zip': archive.getvalue(), 'https://e.org/t.csv': b'x,y\n1,2\n3,4\n'}

    async def fake_fetch(url, max_bytes=0, timeout=0, accept=None):
        return assistant_read.Fetched(url, 200, '', bodies[url], False)
    monkeypatch.setattr(assistant_read, 'fetch', fake_fetch)
    out = asyncio.run(assistant_read.read_table('https://e.org/s.zip#tableS1.xlsx', max_rows=2))
    assert 'Sheets: S1 (6 rows)' in out and 'header: Accession | Species' in out
    assert '1: LA0 | S. lycopersicum' in out and 'start_row=2' in out
    listing = asyncio.run(assistant_read.read_table('https://e.org/s.zip'))
    assert 'tableS1.xlsx' in listing and 't.tsv' in listing
    csv_out = asyncio.run(assistant_read.read_table('https://e.org/t.csv'))
    assert 'header: x | y' in csv_out and '2: 3 | 4' in csv_out


# ------------------------------------------------------------- network --

@network
def test_read_paper_aflitos():
    out = asyncio.run(assistant_read.read_paper('10.1111/tpj.12616'))
    print(out)
    assert 'Exploring genetic variation in the tomato' in out
    assert '2014' in out and 'Plant Journal' in out


@network
def test_read_paper_open_access():
    out = asyncio.run(assistant_read.read_paper('10.1186/2047-217X-3-7'))
    print(out)
    assert 'Europe PMC full text (PMC4035669' in out
    assert 'Data availability' in out and 'Fastq' in out
    assert 'supplementaryFiles#' in out


@network
def test_list_directory_sgn():
    out = asyncio.run(assistant_read.list_directory(SGN))
    print(out)
    assert '84 files' in out and 'RF_001_SZAXPI008746-45.vcf.gz.snpeff.vcf.gz  8M' in out


@pytest.mark.parametrize('value, doi', [
    ('https://link.springer.com/article/10.1186/2047-217X-3-7#MOESM1', '10.1186/2047-217X-3-7'),
    ('https://doi.org/10.1111/tpj.12616?utm_source=x', '10.1111/tpj.12616'),
    ('https://onlinelibrary.wiley.com/doi/full/10.1111/tpj.12616', '10.1111/tpj.12616'),
    ('https://example.org/10.1186/2047-217X-3-7/fulltext.html', '10.1186/2047-217X-3-7'),
    ('doi:10.1111/tpj.12616.', '10.1111/tpj.12616'),
    ('no doi here', None),
])
def test_parse_doi_from_urls(value, doi):
    assert assistant_read.parse_doi(value) == doi


def test_looping_output_is_stopped(run):
    """Seen live: qwen3:8b wrote a made-up URL ending in endless zeros."""
    fake = FakeModel(text_reply('The FASTA is at GCF_000127655.1_ASM', *(['0000000000'] * 40)))
    events = run(fake, message='hi')
    answer = texts(events)
    assert answer.endswith('[stopped: the model started repeating itself]')
    assert answer.count('0') < 300 and [e for e, _ in events][-1] == 'done'


def test_unreachable_links_in_the_answer_are_flagged(run, web):
    fake = FakeModel(text_reply('Get it from ', SGN + 'RF_099_X.vcf.gz', ' or ',
                                SGN + 'RF_001_X.vcf.gz', '.'))
    answer = texts(run(fake, message='hi'))
    assert 'could not be reached' in answer
    assert '`%sRF_099_X.vcf.gz`' % SGN in answer and '`%sRF_001_X.vcf.gz`' % SGN not in answer


def test_reads_only_papers_get_a_verdict():
    lines = assistant_read.signals('Reads were deposited as FASTQ in ENA (PRJEB6180).')
    assert lines[0].startswith('VERDICT: this paper appears to publish raw reads only')
    assert not assistant_read.signals('Variants are provided as VCF files.')[0].startswith('VERDICT')


def test_model_without_thinking_answers_anyway(run, monkeypatch):
    """mistral:7b answers "does not support thinking" to a reasoning request."""
    monkeypatch.setattr(assistant_llm, '_no_thinking', set())
    fake = FakeModel(
        httpx.Response(400, json={'error': {'message': '"qwen3:8b" does not support thinking'}}),
        text_reply('Answer.'),
        text_reply('Second answer.'))
    events = run(fake, message='hi', think=True)
    assert texts(events) == 'Answer.'
    assert 'cannot show its reasoning' in thinking(events)
    assert 'reasoning_effort' not in fake.requests[1] or fake.requests[1]['reasoning_effort'] == 'none'
    # Next turn: no failed request first, just the note.
    events = run(fake, message='again', think=True)
    assert texts(events) == 'Second answer.' and len(fake.requests) == 3
    assert 'cannot show its reasoning' in thinking(events)


RICE_BUILD = {'id': 'b1', 'status': 'failed', 'log': [],
              'error': {'stage': 'accessions', 'file': 'a.vcf.gz', 'accession': 'A',
                        'message': 'No variants left for A on the chosen chromosomes.',
                        'fix': {'step': 'accessions', 'kind': 'rename-map', 'target': 'A'}}}


def test_rename_card_mid_conversation(run):
    """Seen with the 3K rice build: "Ask the assistant" came after the turns
    that set the dataset up, and the card was skipped."""
    earlier = [{'role': 'user', 'content': 'Replicate the rice paper'},
               {'role': 'assistant', 'content': 'Done.\n[Proposal "Add 4 accessions": accepted by the user]'}]
    fake = FakeModel(text_reply('The contigs differ.'))
    events = run(fake, message='Explain the build error', form=FORM, step='build',
                 build=RICE_BUILD, history=earlier)
    (card,) = proposals(events)
    assert card['kind'] == 'rename-map' and card['applicable'] is True


def test_rename_card_not_repeated(run):
    earlier = [{'role': 'user', 'content': 'Explain the build error'},
               {'role': 'assistant', 'content': 'The contigs differ.\n'
                '[Proposal "Rename 12 contigs in a.vcf.gz": shown in the form, awaiting the user\'s Accept]'}]
    fake = FakeModel(text_reply('Apply the card above.'))
    events = run(fake, message='What now?', form=FORM, step='build', build=RICE_BUILD,
                 history=earlier)
    assert proposals(events) == []
