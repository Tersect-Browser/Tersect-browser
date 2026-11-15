"""Client for an OpenAI-compatible chat completions endpoint (Ollama, vLLM, ...).

Configured by TB_ASSISTANT_URL (base URL including /v1), TB_ASSISTANT_MODEL
and optionally TB_ASSISTANT_API_KEY. The endpoint is expected to run on this
server or its network (a local open-weight model); it is called directly,
not through the SSRF guard used for document fetches.

Responses are streamed. Reasoning is off unless a request asks to see it
(on_think): then it is forwarded as it arrives. Otherwise `reasoning` /
`reasoning_content` deltas are dropped and `<think>…</think>` blocks are cut
out of the content (ThinkFilter). Models that write tool calls as text
(`<tool_call>{…}</tool_call>`, Qwen and Hermes style) have them parsed.
"""
import json
import os
import re

import httpx

DEFAULT_MODEL = 'qwen3:14b'
CONNECT_TIMEOUT = 10
READ_TIMEOUT = 300        # first token can wait for a long prompt to be read


class LLMError(Exception):
    """The endpoint failed; the message is shown to the user."""


def base_url() -> str:
    return os.environ.get('TB_ASSISTANT_URL', '').strip().rstrip('/')


def model() -> str:
    return os.environ.get('TB_ASSISTANT_MODEL', '').strip() or DEFAULT_MODEL


def configured() -> bool:
    return bool(base_url())


def _headers() -> dict:
    headers = {'Content-Type': 'application/json'}
    key = os.environ.get('TB_ASSISTANT_API_KEY', '').strip()
    if key:
        headers['Authorization'] = 'Bearer ' + key
    return headers


def client(transport: httpx.AsyncBaseTransport | None = None) -> httpx.AsyncClient:
    return httpx.AsyncClient(
        transport=transport, headers=_headers(),
        timeout=httpx.Timeout(READ_TIMEOUT, connect=CONNECT_TIMEOUT))


# ------------------------------------------------------------ filtering --

class ThinkFilter:
    """Cuts <think>…</think> out of streamed text and collects <tool_call> blocks.

    Tags may be split across deltas, so text that could be the start of a tag
    is held back until the next delta decides it.
    """

    HIDDEN = ('think', 'tool_call')

    def __init__(self):
        self.pending, self.inside, self.captured = '', None, ''
        self.tool_texts = []
        self.thoughts = []    # text inside <think>, for take_thoughts()
        self.leading = True   # drop whitespace before the first visible text

    def _emit(self, text, out):
        if self.leading:
            text = text.lstrip()
            if text:
                self.leading = False
        if text:
            out.append(text)

    def feed(self, delta: str) -> str:
        self.pending += delta
        out = []
        while self.pending:
            if self.inside:
                close = '</%s>' % self.inside
                at = self.pending.find(close)
                if at < 0:
                    keep = _partial_suffix(self.pending, [close])
                    if self.inside == 'think':
                        self.thoughts.append(self.pending[:len(self.pending) - keep])
                    self.captured += self.pending[:len(self.pending) - keep]
                    self.pending = self.pending[len(self.pending) - keep:]
                    break
                if self.inside == 'think':
                    self.thoughts.append(self.pending[:at])
                self.captured += self.pending[:at]
                if self.inside == 'tool_call':
                    self.tool_texts.append(self.captured)
                self.pending = self.pending[at + len(close):]
                self.inside, self.captured = None, ''
                if self.leading:
                    self.pending = self.pending.lstrip()
                continue
            starts = [(self.pending.find('<%s>' % tag), tag) for tag in self.HIDDEN]
            starts = [(at, tag) for at, tag in starts if at >= 0]
            if starts:
                at, tag = min(starts)
                self._emit(self.pending[:at], out)
                self.pending = self.pending[at + len(tag) + 2:]
                self.inside = tag
                continue
            # A stray closing tag (the opening one came in the prompt template).
            stray = self.pending.find('</think>')
            if stray >= 0:
                self.pending = self.pending[stray + len('</think>'):]
                out.clear()
                self.leading = True
                continue
            keep = _partial_suffix(self.pending, ['<%s>' % t for t in self.HIDDEN] + ['</think>'])
            self._emit(self.pending[:len(self.pending) - keep], out)
            self.pending = self.pending[len(self.pending) - keep:]
            break
        return ''.join(out)

    def take_thoughts(self) -> str:
        """Reasoning read from <think> blocks since the last call."""
        text, self.thoughts = ''.join(self.thoughts), []
        return text

    def flush(self) -> str:
        """End of stream: an unclosed <think> is dropped, other held text shown."""
        rest, self.pending = self.pending, ''
        if self.inside == 'tool_call':
            self.tool_texts.append(self.captured + rest)
            return ''
        if self.inside:
            return ''
        out = []
        self._emit(rest, out)
        return ''.join(out)


def _partial_suffix(text: str, tags: list[str]) -> int:
    """Length of the longest suffix of text that is a proper prefix of a tag."""
    best = 0
    for tag in tags:
        for size in range(min(len(tag) - 1, len(text)), 0, -1):
            if text.endswith(tag[:size]):
                best = max(best, size)
                break
    return best


def parse_text_tool_calls(texts: list[str]) -> list[dict]:
    """<tool_call>{"name": …, "arguments": {…}}</tool_call> bodies → tool calls."""
    calls = []
    for index, text in enumerate(texts):
        text = text.strip()
        name, arguments = None, text
        try:
            data = json.loads(text)
            name = data.get('name')
            arguments = data.get('arguments', data.get('parameters', {}))
            if not isinstance(arguments, str):
                arguments = json.dumps(arguments)
        except (ValueError, AttributeError):
            match = re.search(r'"name"\s*:\s*"([\w-]+)"', text)
            name = match.group(1) if match else None
        calls.append({'id': 'text_call_%d' % index, 'type': 'function',
                      'function': {'name': name or '', 'arguments': arguments}})
    return calls


# ------------------------------------------------------------ requests --

_omit_reasoning = False   # set once the endpoint rejected reasoning_effort


def _reasoning_setting():
    value = os.environ.get('TB_ASSISTANT_REASONING', 'none').strip()
    return None if _omit_reasoning or not value or value == 'default' else value


# Models that refused a reasoning request ("mistral:7b does not support thinking").
_no_thinking: set[str] = set()
NO_THINKING_NOTE = '%s cannot show its reasoning; answering without it.'


def supports_thinking() -> bool:
    return model() not in _no_thinking


def thinking_setting() -> str:
    """reasoning_effort when the user asked to see the reasoning. Ollama turns
    thinking on for any value but "none"; TB_ASSISTANT_THINKING_EFFORT changes it."""
    return None if _omit_reasoning else (
        os.environ.get('TB_ASSISTANT_THINKING_EFFORT', '') or 'medium')


def _explain(status: int, body: str) -> str:
    text = body.strip()
    try:
        data = json.loads(text)
        error = data.get('error')
        text = (error.get('message') if isinstance(error, dict) else error) or \
            data.get('detail') or text
    except (ValueError, AttributeError):
        pass
    text = str(text)[:300]
    low = text.lower()
    if 'does not support tools' in low or ('tool' in low and 'not support' in low):
        return ('The model %s does not support tool calling, which the assistant needs. '
                'Set TB_ASSISTANT_MODEL to one that does (for example qwen3:8b).' % model())
    if status == 404 or ('model' in low and 'not found' in low):
        return ('The model %s was not found on the assistant server (%s). Pull it first, '
                'e.g. `ollama pull %s`.' % (model(), text, model()))
    if status in (401, 403):
        return 'The assistant server refused the request (%d): check TB_ASSISTANT_API_KEY.' % status
    return 'The assistant server returned an error (%d): %s' % (status, text)


async def stream_chat(http: httpx.AsyncClient, messages: list[dict], tools: list[dict] | None,
                      on_text, temperature: float = 0.3, on_think=None) -> dict:
    """One streamed completion. Calls on_text(delta) with visible text, and,
    when on_think is given, asks the model to reason first and calls
    on_think(delta) with its reasoning (never part of the returned content).

    Returns {'content': visible text, 'tool_calls': [...], 'finish_reason': ...}.
    """
    global _omit_reasoning
    body = {'model': model(), 'messages': messages, 'stream': True,
            'temperature': temperature}
    if tools:
        body['tools'] = tools
        body['tool_choice'] = 'auto'
    reasoning = thinking_setting() if on_think else _reasoning_setting()
    if reasoning:
        body['reasoning_effort'] = reasoning
    url = base_url() + '/chat/completions'
    try:
        async with http.stream('POST', url, json=body) as response:
            if response.status_code >= 400:
                text = (await response.aread()).decode(errors='replace')
                if on_think and response.status_code in (400, 422) and \
                        'thinking' in text.lower():
                    # The model cannot reason: say so once, answer without.
                    _no_thinking.add(model())
                    await on_think(NO_THINKING_NOTE % model())
                    return await stream_chat(http, messages, tools, on_text, temperature)
                if reasoning and response.status_code in (400, 422) and \
                        'reasoning' in text.lower():
                    _omit_reasoning = True
                    return await stream_chat(http, messages, tools, on_text, temperature,
                                             on_think)
                raise LLMError(_explain(response.status_code, text))
            return await _read_stream(response, on_text, on_think)
    except httpx.ConnectError:
        raise LLMError('Cannot reach the assistant server at %s. Is it running '
                       '(for Ollama: `ollama serve`)?' % base_url())
    except httpx.TimeoutException:
        raise LLMError('The assistant server did not answer in time.')
    except httpx.HTTPError as error:
        raise LLMError('Connection to the assistant server failed: %s'
                       % (str(error) or type(error).__name__))


# A short unit repeated many times at the end of the text: the model is looping
# (seen with qwen3:8b writing "0000…" into a made-up URL).
LOOP = re.compile(r'(.{1,24}?)\1{11,}$', re.S)
LOOP_NOTE = '… [stopped: the model started repeating itself]'


class _Looping(Exception):
    pass


def looping(text: str) -> bool:
    tail = text[-400:]
    match = LOOP.search(tail)
    return bool(match) and len(match.group(0)) >= 40


async def _read_stream(response: httpx.Response, on_text, on_think=None) -> dict:
    think, content, calls, finish = ThinkFilter(), [], {}, None
    content_type = response.headers.get('Content-Type', '')
    if 'event-stream' not in content_type:
        # Not streamed (some servers ignore stream=true): one JSON body.
        try:
            data = json.loads(await response.aread())
        except ValueError:
            raise LLMError('The assistant server sent a response that is not JSON')
        chunks = [{'choices': [{'delta': (c.get('message') or {}),
                                'finish_reason': c.get('finish_reason')}
                               for c in data.get('choices') or []]}]
    else:
        chunks = _sse_chunks(response)

    async def handle(chunk):
        nonlocal finish
        if chunk.get('error'):
            error = chunk['error']
            raise LLMError(_explain(500, json.dumps({'error': error})))
        for choice in chunk.get('choices') or []:
            delta = choice.get('delta') or {}
            # Reasoning comes as its own field (Ollama, vLLM) or in <think> tags.
            thought = delta.get('reasoning') or delta.get('reasoning_content')
            if thought and on_think:
                await on_think(thought)
            text = delta.get('content')
            if text:
                visible = think.feed(text)
                thought = think.take_thoughts()
                if thought and on_think:
                    await on_think(thought)
                if visible:
                    content.append(visible)
                    await on_text(visible)
                    if looping(''.join(content[-60:])):
                        raise _Looping()
            for call in delta.get('tool_calls') or []:
                index = call.get('index', len(calls))
                slot = calls.setdefault(index, {'id': None, 'type': 'function',
                                                'function': {'name': '', 'arguments': ''}})
                if call.get('id'):
                    slot['id'] = call['id']
                function = call.get('function') or {}
                if function.get('name'):
                    slot['function']['name'] += function['name']
                arguments = function.get('arguments')
                if isinstance(arguments, dict):   # some servers send an object
                    arguments = json.dumps(arguments)
                if arguments:
                    slot['function']['arguments'] += arguments
            if choice.get('finish_reason'):
                finish = choice['finish_reason']

    try:
        if isinstance(chunks, list):
            for chunk in chunks:
                await handle(chunk)
        else:
            async for chunk in chunks:
                await handle(chunk)
    except _Looping:
        # Leaving the stream closes the connection, which stops generation.
        await on_text(LOOP_NOTE)
        content.append(LOOP_NOTE)
        return {'content': ''.join(content), 'tool_calls': [], 'finish_reason': 'loop'}
    rest = think.flush()
    if rest:
        content.append(rest)
        await on_text(rest)
    tool_calls = [calls[i] for i in sorted(calls)]
    for number, call in enumerate(tool_calls):
        call['id'] = call['id'] or 'call_%d' % number
    if not tool_calls and think.tool_texts:
        tool_calls = parse_text_tool_calls(think.tool_texts)
    return {'content': ''.join(content), 'tool_calls': tool_calls, 'finish_reason': finish}


async def _sse_chunks(response: httpx.Response):
    data_lines = []
    async for line in response.aiter_lines():
        if line.startswith(':'):
            continue
        if line.startswith('data:'):
            data_lines.append(line[5:].strip())
            continue
        if line.strip() == '' and data_lines:
            payload, data_lines = '\n'.join(data_lines), []
            if payload == '[DONE]':
                return
            try:
                yield json.loads(payload)
            except ValueError:
                continue
    if data_lines:
        payload = '\n'.join(data_lines)
        if payload != '[DONE]':
            try:
                yield json.loads(payload)
            except ValueError:
                pass
