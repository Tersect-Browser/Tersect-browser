"""Wizard drafts, in the MongoDB collection dataset_drafts.

    GET    /api/drafts          all drafts, newest first
    POST   /api/drafts          create (the server assigns id and updated_at)
    GET    /api/drafts/{id}
    PUT    /api/drafts/{id}     replace
    DELETE /api/drafts/{id}     also removes the draft's unfinished uploads

`form` is stored as given (the UI's WizardForm). `build_id` is set by the
build service; a PUT without one keeps the stored value.
"""
import functools
import secrets
import threading
from datetime import datetime, timezone
from typing import Any, Literal

from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel
from pymongo import DESCENDING, MongoClient, ReturnDocument
from pymongo.errors import PyMongoError

from .. import settings
from . import uploads

router = APIRouter()

COLLECTION = 'dataset_drafts'
_client = None
_client_lock = threading.Lock()


class DraftInput(BaseModel):
    mode: Literal['new', 'add'] = 'new'
    base_dataset: str | None = None
    base_accessions: int | None = None
    step: Literal['reference', 'accessions', 'options', 'review'] = 'reference'
    form: dict[str, Any]
    build_id: str | None = None


def collection():
    """The drafts collection (one client per process)."""
    global _client
    with _client_lock:
        if _client is None:
            cfg = settings.config()
            _client = MongoClient(cfg['mongoHost'], serverSelectionTimeoutMS=5000)
        return _client[settings.config()['dbName']][COLLECTION]


def _iso(value: datetime) -> str:
    return value.replace(tzinfo=timezone.utc).isoformat(timespec='milliseconds') \
        .replace('+00:00', 'Z')


def to_draft(doc: dict) -> dict:
    """A stored document as the UI's Draft."""
    return {'id': doc['_id'], 'mode': doc.get('mode', 'new'),
            'base_dataset': doc.get('base_dataset'),
            'base_accessions': doc.get('base_accessions'),
            'step': doc.get('step', 'reference'), 'form': doc.get('form') or {},
            'build_id': doc.get('build_id'), 'updated_at': _iso(doc['updated_at'])}


def _now() -> datetime:
    # MongoDB keeps milliseconds; round now so the returned value is the stored one.
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    return now.replace(microsecond=now.microsecond // 1000 * 1000)


def create(draft: dict) -> dict:
    """Store a new draft (also used by the datasets router for add mode)."""
    doc = {**DraftInput(**draft).model_dump(), '_id': secrets.token_hex(8),
           'updated_at': _now()}
    collection().insert_one(doc)
    return to_draft(doc)


def _upload_ids(value) -> list[str]:
    """Upload ids of the FileRefs anywhere in a form."""
    found = []
    if isinstance(value, dict):
        if value.get('source') == 'upload' and isinstance(value.get('location'), str):
            found.append(value['location'])
        for item in value.values():
            found += _upload_ids(item)
    elif isinstance(value, list):
        for item in value:
            found += _upload_ids(item)
    return found


def _mongo_errors(handler):
    """Turn an unreachable database into a 503 with a readable message."""
    @functools.wraps(handler)
    def wrapped(*args, **kwargs):
        try:
            return handler(*args, **kwargs)
        except PyMongoError as error:
            raise HTTPException(503, 'The drafts database is not available (%s)' % error)
    return wrapped


@router.get('/drafts')
@_mongo_errors
def list_drafts():
    return [to_draft(doc) for doc in collection().find().sort('updated_at', DESCENDING)]


@router.post('/drafts', status_code=201)
@_mongo_errors
def post_draft(body: DraftInput):
    return create(body.model_dump())


@router.get('/drafts/{draft_id}')
@_mongo_errors
def get_draft(draft_id: str):
    doc = collection().find_one({'_id': draft_id})
    if doc is None:
        raise HTTPException(404, 'Draft not found')
    return to_draft(doc)


@router.put('/drafts/{draft_id}')
@_mongo_errors
def put_draft(draft_id: str, body: DraftInput):
    fields = body.model_dump()
    if fields['build_id'] is None:
        del fields['build_id']  # keep the one the build service set
    doc = collection().find_one_and_update(
        {'_id': draft_id}, {'$set': {**fields, 'updated_at': _now()}},
        return_document=ReturnDocument.AFTER)
    if doc is None:
        raise HTTPException(404, 'Draft not found')
    return to_draft(doc)


@router.delete('/drafts/{draft_id}', status_code=204)
@_mongo_errors
def delete_draft(draft_id: str):
    doc = collection().find_one_and_delete({'_id': draft_id})
    if doc is None:
        raise HTTPException(404, 'Draft not found')
    # Unfinished uploads belong to nothing else; finished ones may be in a build.
    for upload_id in set(_upload_ids(doc.get('form'))):
        record = uploads.info(upload_id)
        if record is not None and not record['complete'] and upload_id not in uploads._busy:
            uploads.delete(upload_id)
    return Response(status_code=204)
