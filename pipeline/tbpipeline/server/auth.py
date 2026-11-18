"""A login for the builder: who may add, change and delete datasets.

    GET  /api/session   {required, authenticated, username}
    POST /api/login     {username, password} -> a session cookie
    POST /api/logout

The browser's viewer never calls the builder, so a public site stays fully
readable; everything the builder does (drafts, uploads, builds, deleting,
the assistant, the server folder) needs the login.

Off unless TB_ADMIN_PASSWORD is set: the builder is then open to whoever can
reach it, as on a laptop or behind a site-wide password. With it set, every
request is refused unless it carries a valid session or is one of the few
public ones below. That is decided here, in one place and by default, so that
a route added later is protected without anyone remembering to.

    TB_ADMIN_USER       user name of the login (default "admin")
    TB_ADMIN_PASSWORD   its password; setting it switches the login on
    TB_SESSION_SECRET   signs the cookie. Default: derived from the password,
                        so sessions survive a restart and end when the
                        password changes.
    TB_SESSION_HOURS    how long a session lasts (default 12)

The session is a signed cookie (no server-side store): user name and expiry,
with an HMAC-SHA256 over both. It is HttpOnly and SameSite=Strict, which is
also what keeps another site from using it (no separate CSRF token).
"""
import base64
import hashlib
import hmac
import json
import os
import threading
import time

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel
from starlette.responses import JSONResponse

COOKIE = 'tb_session'

# Reachable without a session: the login itself, and what the web app asks
# before it knows who is there.
PUBLIC = {
    ('GET', '/api/session'),
    ('POST', '/api/login'),
    ('POST', '/api/logout'),
    ('GET', '/api/config'),
}

# Wrong passwords are slowed down per client: after MAX_FAILURES within
# WINDOW seconds further attempts are refused until the window has passed.
MAX_FAILURES = 5
WINDOW = 300

router = APIRouter()
_failures: dict[str, list[float]] = {}
_lock = threading.Lock()


def username() -> str:
    return os.environ.get('TB_ADMIN_USER', '').strip() or 'admin'


def password() -> str:
    return os.environ.get('TB_ADMIN_PASSWORD', '')


def required() -> bool:
    return bool(password())


def _secret() -> bytes:
    given = os.environ.get('TB_SESSION_SECRET', '')
    if given:
        return given.encode()
    return hashlib.sha256(b'tersect-session:' + password().encode()).digest()


def _hours() -> float:
    try:
        return max(0.1, float(os.environ.get('TB_SESSION_HOURS', '12')))
    except ValueError:
        return 12.0


def _sign(payload: bytes) -> str:
    return hmac.new(_secret(), payload, hashlib.sha256).hexdigest()


def issue(user: str, now: float | None = None) -> tuple[str, int]:
    """A session token for `user` and its lifetime in seconds."""
    lifetime = int(_hours() * 3600)
    expires = int((now if now is not None else time.time()) + lifetime)
    payload = base64.urlsafe_b64encode(json.dumps({'u': user, 'e': expires}).encode())
    return '%s.%s' % (payload.decode(), _sign(payload)), lifetime


def verify(token: str | None, now: float | None = None) -> str | None:
    """The user name a token was issued to, or None if it is not valid now."""
    if not token or '.' not in token:
        return None
    payload, _, signature = token.rpartition('.')
    if not hmac.compare_digest(_sign(payload.encode()), signature):
        return None
    try:
        data = json.loads(base64.urlsafe_b64decode(payload.encode()))
        expires, user = float(data['e']), str(data['u'])
    except (ValueError, KeyError, TypeError):
        return None
    if expires < (now if now is not None else time.time()):
        return None
    # A session of a login that has since been renamed is no longer one.
    return user if user == username() else None


def _cookie_value(scope) -> str | None:
    for name, value in scope.get('headers') or []:
        if name == b'cookie':
            for part in value.decode('latin-1').split(';'):
                key, _, found = part.strip().partition('=')
                if key == COOKIE:
                    return found
    return None


def _client(request: Request) -> str:
    # Behind the proxy every request comes from the proxy; it passes the
    # visitor's address on. Only used to slow down guessing.
    forwarded = request.headers.get('x-forwarded-for', '').split(',')[0].strip()
    return forwarded or (request.client.host if request.client else 'unknown')


def _recent_failures(client: str, now: float) -> list[float]:
    recent = [at for at in _failures.get(client, []) if now - at < WINDOW]
    if recent:
        _failures[client] = recent
    else:
        _failures.pop(client, None)
    return recent


class Protect:
    """ASGI middleware: refuses builder requests without a session when the
    login is on. Plain ASGI rather than a response-wrapping middleware, so
    that the event streams (build progress, the assistant) pass untouched."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope['type'] != 'http' or not required():
            return await self.app(scope, receive, send)
        method = scope['method'].upper()
        if method == 'HEAD':
            method = 'GET'
        path = scope['path'].rstrip('/') or '/'
        if method == 'OPTIONS' or (method, path) in PUBLIC \
                or verify(_cookie_value(scope)):
            return await self.app(scope, receive, send)
        response = JSONResponse({'detail': 'Sign in to manage datasets.'}, status_code=401)
        return await response(scope, receive, send)


class Login(BaseModel):
    username: str
    password: str


@router.get('/session')
def get_session(request: Request):
    user = verify(request.cookies.get(COOKIE)) if required() else None
    return {'required': required(), 'authenticated': user is not None, 'username': user}


@router.post('/login')
def post_login(body: Login, request: Request, response: Response):
    if not required():
        raise HTTPException(400, 'This server has no login.')
    client, now = _client(request), time.time()
    with _lock:
        if len(_recent_failures(client, now)) >= MAX_FAILURES:
            raise HTTPException(429, 'Too many attempts. Try again in a few minutes.')
    # Both compared in full whatever the first says, in constant time.
    good_user = hmac.compare_digest(body.username.strip().encode(), username().encode())
    good_password = hmac.compare_digest(body.password.encode(), password().encode())
    if not (good_user and good_password):
        with _lock:
            _failures.setdefault(client, []).append(now)
        raise HTTPException(401, 'Wrong user name or password.')
    with _lock:
        _failures.pop(client, None)
    token, lifetime = issue(username(), now)
    secure = request.headers.get('x-forwarded-proto', request.url.scheme) == 'https'
    response.set_cookie(COOKIE, token, max_age=lifetime, path='/', httponly=True,
                        samesite='strict', secure=secure)
    return {'required': True, 'authenticated': True, 'username': username()}


@router.post('/logout')
def post_logout(response: Response):
    response.delete_cookie(COOKIE, path='/')
    return {'required': required(), 'authenticated': False, 'username': None}
