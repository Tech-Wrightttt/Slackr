"""
Shared playlists and the "online now" count.

A playlist is a list of question IDs with a 6-character code. Signed-in users share their own
(public = listed for everyone, unlisted = code only); anyone can open one by code. Private
playlists never leave the device (they are the Custom Builder's local presets).

  GET    /api/playlists             public list (featured first)
  GET    /api/playlists/mine        playlists the signed-in user shared
  GET    /api/playlists/{code}      one playlist with its question IDs
  POST   /api/playlists             {title, description, question_ids, visibility} -> {code}
  DELETE /api/playlists/{code}      remove one of your own
  POST   /api/presence              {client_id} -> {online, users}; called once an hour by each open tab
                                    (users = usernames of signed-in people online; guests are only counted)
  POST   /api/presence/leave        {client_id}; sent when the tab closes
"""

import re
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field

from routers.account import ACCESS_COOKIE, REFRESH_COOKIE, current_session, same_origin_only
from routers.admin import PLAYLIST_CODE_RE, clean_question_ids
from services.supabase_gateway import SupabaseError, gateway

router = APIRouter()

CLIENT_ID_RE = r"^[0-9a-fA-F-]{36}$"


class PlaylistBody(BaseModel):
    title: str = Field(min_length=1, max_length=60)
    description: str = Field(default="", max_length=280)
    question_ids: List[str] = Field(min_length=1, max_length=500)
    visibility: str = Field(default="public", pattern=r"^(public|unlisted)$")


class PresenceBody(BaseModel):
    client_id: str = Field(pattern=CLIENT_ID_RE)


def _fail(err: SupabaseError):
    raise HTTPException(status_code=err.status, detail=err.message)


def _require_supabase() -> None:
    if not gateway.configured:
        raise HTTPException(status_code=503, detail="Sharing isn't available on this server.")


def _valid_code(code: str) -> str:
    if not re.match(PLAYLIST_CODE_RE, code.strip()):
        raise HTTPException(status_code=404, detail="That code doesn't match a playlist. Check it and try again.")
    return code.strip().upper()


@router.get("/api/playlists")
def list_public_playlists():
    _require_supabase()
    try:
        return {"playlists": gateway.public_playlists()}
    except SupabaseError as err:
        _fail(err)


# Declared before /{code} so "mine" isn't read as a code
@router.get("/api/playlists/mine")
def list_my_playlists(request: Request, response: Response):
    _require_supabase()
    token, _ = current_session(request, response)
    try:
        return {"playlists": gateway.my_playlists(token)}
    except SupabaseError as err:
        _fail(err)


@router.get("/api/playlists/{code}")
def get_playlist(code: str):
    _require_supabase()
    try:
        playlist = gateway.playlist_by_code(_valid_code(code))
    except SupabaseError as err:
        _fail(err)
    if not playlist:
        raise HTTPException(status_code=404, detail="That code doesn't match a playlist. Check it and try again.")
    return {"playlist": playlist}


@router.post("/api/playlists", dependencies=[Depends(same_origin_only)])
def share_playlist(body: PlaylistBody, request: Request, response: Response):
    _require_supabase()
    token, _ = current_session(request, response)
    ids = clean_question_ids(body.question_ids)
    try:
        code = gateway.create_playlist(token, body.title.strip(), body.description.strip(), ids, body.visibility)
    except SupabaseError as err:
        _fail(err)
    return {"code": code}


@router.delete("/api/playlists/{code}", dependencies=[Depends(same_origin_only)])
def delete_playlist(code: str, request: Request, response: Response):
    _require_supabase()
    token, _ = current_session(request, response)
    try:
        deleted = gateway.delete_my_playlist(token, _valid_code(code))
    except SupabaseError as err:
        _fail(err)
    if not deleted:
        raise HTTPException(status_code=404, detail="You can only delete playlists you shared.")
    return {"ok": True}


@router.post("/api/presence", dependencies=[Depends(same_origin_only)])
def presence_ping(body: PresenceBody, request: Request, response: Response):
    _require_supabase()
    token = None
    # Signed-in tabs count under their username; anyone else counts as a guest
    if request.cookies.get(ACCESS_COOKIE) or request.cookies.get(REFRESH_COOKIE):
        try:
            token, _ = current_session(request, response)
        except HTTPException:
            token = None
    try:
        return gateway.presence_ping(body.client_id, token)
    except SupabaseError as err:
        _fail(err)


@router.post("/api/presence/leave", dependencies=[Depends(same_origin_only)])
def presence_leave(body: PresenceBody):
    _require_supabase()
    try:
        gateway.presence_leave(body.client_id)
    except SupabaseError:
        pass  # the row ages out in 65 minutes anyway
    return {"ok": True}
