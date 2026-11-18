"""The builder's login (server/auth.py): off without a password; with one,
everything but the login itself and /api/config needs a session."""
import pytest
from fastapi import APIRouter, FastAPI
from fastapi.responses import StreamingResponse
from fastapi.testclient import TestClient

from tbpipeline.server import auth


def make_app():
    app = FastAPI()
    app.add_middleware(auth.Protect)
    app.include_router(auth.router, prefix='/api')
    router = APIRouter()

    @router.get('/config')
    def config():
        return {'assistant': False}

    @router.get('/datasets')
    def datasets():
        return []

    @router.delete('/datasets/{dataset_id}')
    def delete(dataset_id: str):
        return {'deleted': dataset_id}

    @router.get('/builds/{build_id}/events')
    def events(build_id: str):
        return StreamingResponse(iter(['data: one\n\n', 'data: two\n\n']),
                                 media_type='text/event-stream')

    app.include_router(router, prefix='/api')
    return app


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv('TB_ADMIN_USER', 'curator')
    monkeypatch.setenv('TB_ADMIN_PASSWORD', 'correct horse battery')
    monkeypatch.delenv('TB_SESSION_SECRET', raising=False)
    monkeypatch.delenv('TB_SESSION_HOURS', raising=False)
    auth._failures.clear()
    return TestClient(make_app())


def login(client, password='correct horse battery', username='curator'):
    return client.post('/api/login', json={'username': username, 'password': password})


def test_without_a_password_the_builder_is_open(monkeypatch):
    monkeypatch.delenv('TB_ADMIN_PASSWORD', raising=False)
    client = TestClient(make_app())
    assert client.get('/api/session').json() == {
        'required': False, 'authenticated': False, 'username': None}
    assert client.delete('/api/datasets/rice').status_code == 200
    assert client.post('/api/login', json={'username': 'a', 'password': 'b'}).status_code == 400


def test_everything_but_the_public_requests_needs_a_session(client):
    assert client.get('/api/session').json() == {
        'required': True, 'authenticated': False, 'username': None}
    assert client.get('/api/config').status_code == 200
    for method, path in [('GET', '/api/datasets'), ('DELETE', '/api/datasets/rice'),
                         ('GET', '/api/builds/1/events'), ('GET', '/api/docs'),
                         ('POST', '/api/config'), ('GET', '/api/nothing-here')]:
        response = client.request(method, path)
        assert response.status_code == 401, (method, path)
        assert response.json() == {'detail': 'Sign in to manage datasets.'}


def test_a_login_opens_the_builder_and_a_logout_closes_it(client):
    response = login(client)
    assert response.status_code == 200
    assert response.json() == {'required': True, 'authenticated': True, 'username': 'curator'}
    cookie = response.headers['set-cookie'].lower()
    assert 'httponly' in cookie and 'samesite=strict' in cookie and 'path=/' in cookie

    assert client.get('/api/session').json()['authenticated'] is True
    assert client.get('/api/datasets').status_code == 200
    assert client.delete('/api/datasets/rice').json() == {'deleted': 'rice'}
    assert client.get('/api/builds/1/events').text == 'data: one\n\ndata: two\n\n'

    assert client.post('/api/logout').json()['authenticated'] is False
    assert client.get('/api/datasets').status_code == 401


def test_the_cookie_is_secure_behind_https(client):
    response = client.post('/api/login', headers={'x-forwarded-proto': 'https'},
                           json={'username': 'curator', 'password': 'correct horse battery'})
    assert 'secure' in response.headers['set-cookie'].lower()
    assert 'secure' not in login(client).headers['set-cookie'].lower()


def test_wrong_credentials_are_refused(client):
    assert login(client, password='wrong').status_code == 401
    assert login(client, username='someone').status_code == 401
    assert 'set-cookie' not in login(client, password='').headers
    assert client.get('/api/datasets').status_code == 401


def test_repeated_failures_are_slowed_down_per_client(client):
    for _ in range(auth.MAX_FAILURES):
        assert login(client, password='wrong').status_code == 401
    # Even the right password has to wait now.
    assert login(client).status_code == 429
    # Another visitor is not affected.
    other = client.post('/api/login', headers={'x-forwarded-for': '198.51.100.7'},
                        json={'username': 'curator', 'password': 'correct horse battery'})
    assert other.status_code == 200


def test_tokens_expire_and_cannot_be_forged(client, monkeypatch):
    token, lifetime = auth.issue('curator', now=1000)
    assert lifetime == 12 * 3600
    assert auth.verify(token, now=1000 + lifetime - 1) == 'curator'
    assert auth.verify(token, now=1000 + lifetime + 1) is None

    payload, _, signature = token.rpartition('.')
    assert auth.verify(payload + '.' + '0' * len(signature), now=1000) is None
    assert auth.verify(auth.issue('someone-else', now=1000)[0], now=1000) is None
    assert auth.verify('', now=1000) is None and auth.verify('nonsense', now=1000) is None

    # A new password ends the sessions of the old one.
    monkeypatch.setenv('TB_ADMIN_PASSWORD', 'a different password')
    assert auth.verify(token, now=1000) is None


def test_only_an_intact_cookie_counts(client):
    token, _ = auth.issue('curator')
    cookie = lambda value: {'cookie': '%s=%s' % (auth.COOKIE, value)}
    assert client.get('/api/datasets', headers=cookie(token)).status_code == 200
    assert client.get('/api/datasets', headers=cookie(token + 'x')).status_code == 401
