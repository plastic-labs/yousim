import os
from contextvars import ContextVar
from typing import Annotated, Any, Dict, List, Literal
from functools import cache
from fastapi.security import OAuth2PasswordBearer
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.staticfiles import StaticFiles

import sentry_sdk
from fastapi import Depends, FastAPI, HTTPException, status
from starlette.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, FileResponse
from honcho import Honcho
from pydantic import BaseModel

from cryptography.fernet import Fernet
import base64

from calls import GaslitClaude, Simulator
import jwt

from dotenv import load_dotenv

import tempfile
import json
from datetime import datetime

load_dotenv(override=True)


def get_env(key: str):
    var = os.getenv(key)
    if not var:
        raise ValueError(f"{key} is not set in .env")
    return var


HONCHO_ENV = get_env("HONCHO_ENV")
CLIENT_REGEX = get_env("CLIENT_REGEX")
print(CLIENT_REGEX)
JWT_SECRET = get_env("JWT_SECRET")
SECRET_KEY = get_env("SECRET_KEY").encode()
HONCHO_APP_NAME = get_env("HONCHO_APP_NAME")

fernet = Fernet(SECRET_KEY)

print(f"Initializing Honcho with base_url: {HONCHO_ENV}")
honcho = Honcho(
    base_url=HONCHO_ENV,
)

try:
    print(f"Attempting to get/create app: {HONCHO_APP_NAME}")
    honcho_app = honcho.apps.get_or_create(HONCHO_APP_NAME)
    print(f"Successfully initialized app with id: {honcho_app.id}")
except Exception as e:
    print(f"Error initializing Honcho app: {str(e)}")
    raise


gaslit_ctx = ContextVar(
    "gaslit_claude", default=GaslitClaude(name="", insights="", history=[])
)
simulator_ctx = ContextVar("simulator", default=Simulator(history=[], name=""))


sentry_sdk.init(
    # dsn=os.getenv("SENTRY_DSN"),
    # Set traces_sample_rate to 1.0 to capture 100%
    # of transactions for performance monitoring.
    traces_sample_rate=0.3,
    # Set profiles_sample_rate to 1.0 to profile 100%
    # of sampled transactions.
    # We recommend adjusting this value in production.
    profiles_sample_rate=0.3,
)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=os.getenv("CLIENT_REGEX"),
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class BaseRequest(BaseModel):
    session_id: str


class ManualRequest(BaseRequest):
    command: str


class ChatResponse(BaseModel):
    message: str
    session_id: str


oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")


@cache
async def get_or_create_user_from_name(user_id: str):
    user = honcho.apps.users.get_or_create(app_id=honcho_app.id, name=user_id)
    return user


async def get_current_user(token: Annotated[str, Depends(oauth2_scheme)]):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = jwt.decode(
            token,
            JWT_SECRET,
            algorithms=["HS256"],
            audience="authenticated",
        )
        user = honcho.apps.users.get_or_create(
            app_id=honcho_app.id, name=payload["sub"]
        )
        return user.id
    except jwt.InvalidTokenError as e:
        print(e)
        raise credentials_exception


def messages(res: BaseRequest, user_id: str):
    gaslit_claude = GaslitClaude(name="", insights="", history=[])
    simulator = Simulator(history=[], name="")
    history_iter = honcho.apps.users.sessions.messages.list(
        app_id=honcho_app.id, session_id=res.session_id, user_id=user_id
    )

    gaslit_claude.history = []
    simulator.history = []

    for message in history_iter:
        if message.is_user:
            gaslit_claude.history += [{"role": "assistant", "content": message.content}]
            simulator.history += [{"role": "user", "content": message.content}]
        else:
            gaslit_claude.history += [{"role": "user", "content": message.content}]
            simulator.history += [{"role": "assistant", "content": message.content}]

    gaslit_ctx.set(gaslit_claude)
    simulator_ctx.set(simulator)


def manual_turn(res: ManualRequest, user_id: str):
    gaslit_response = res.command
    simulator_response = ""
    simulator = simulator_ctx.get()
    simulator.history += [{"role": "user", "content": res.command}]  # type: ignore
    response = simulator.stream()
    for text in response:
        simulator_response += text
        yield text

    honcho.apps.users.sessions.messages.create(
        session_id=res.session_id,
        app_id=honcho_app.id,
        user_id=user_id,
        content=gaslit_response,
        is_user=True,
    )
    honcho.apps.users.sessions.messages.create(
        session_id=res.session_id,
        app_id=honcho_app.id,
        user_id=user_id,
        content=simulator_response,
        is_user=False,
    )


@app.post("/manual")
async def manual(res: ManualRequest, user_id: str = Depends(get_current_user)):
    messages(res, user_id)
    return StreamingResponse(manual_turn(res, user_id))


@app.post("/auto")
async def auto(res: BaseRequest, user_id: str = Depends(get_current_user)):
    messages(res, user_id)

    def convo():
        gaslit_response = ""
        gaslit_claude = gaslit_ctx.get()
        response = gaslit_claude.stream()
        for text in response:
            gaslit_response += text
            yield text

    return StreamingResponse(convo())


@app.get("/user")
async def user(name: str):
    user = honcho.apps.users.get_or_create(app_id=honcho_app.id, name=name)
    return {
        "user_id": user.id,
    }


async def session():
    pass


class Reset(BaseModel):
    user_id: str
    session_id: str | None



async def resolve_legacy_session_id(session_id: str, user_id: str) -> str:
    """
    Only used for resolving potentially legacy session IDs from share URLs.
    Returns the current valid session ID.
    """
    try:
        sessions_page = honcho.apps.users.sessions.list(
            app_id=honcho_app.id,
            user_id=user_id
        )
        sessions = list(sessions_page)
        
        # Look for a session with matching id
        for session in sessions:
            if str(session.id) == session_id:
                return str(session.id)
        
        print("No session found with matching ID, checking legacy metadata...")
        # If not found, check legacy metadata
        for session in sessions:
            if session.metadata and session.metadata.get("legacy_id") == session_id:
                print(f"Found matching legacy session! ID: {session.id}")
                return str(session.id)
                
        raise HTTPException(
            status_code=404,
            detail=f"Session not found with ID {session_id}"
        )
    except Exception as e:
        print(f"Failed to resolve session: {str(e)}")
        print(f"Exception type: {type(e)}")
        raise HTTPException(
            status_code=404,
            detail=f"Failed to resolve session: {str(e)}"
        )


@app.post("/reset")
async def reset(
    session_id: str | None = None, user_id: str = Depends(get_current_user)
):
    if session_id:
        honcho.apps.users.sessions.delete(
            app_id=honcho_app.id, session_id=session_id, user_id=user_id
        )
    # TODO reset the session
    # gaslit_claude.history = []
    # simulator.history = []
    try:
        session = honcho.apps.users.sessions.create(
            app_id=honcho_app.id, 
            user_id=user_id,
        )
    except TypeError as e:
        if "location_id" in str(e):
            # If location_id is truly optional, try without it
            session = honcho.apps.users.sessions.create(
                app_id=honcho_app.id,
                user_id=user_id
            )
        else:
            raise e
            
    return {
        "user_id": user_id,
        "session_id": session.id,
    }


@app.get("/session")
async def get_session_messages(
    session_id: str | None = None, user_id: str = Depends(get_current_user)
):
    resolved_session_id: str
    if not session_id:
        # Fetch the latest session if session_id is not provided
        sessions = honcho.apps.users.sessions.list(
            app_id=honcho_app.id, user_id=user_id, size=1, reverse=True
        )
        sessions_list = list(sessions)
        if not sessions_list:
            raise HTTPException(
                status_code=404,
                detail="No sessions found"
            )
        latest_session = sessions_list[0]
        resolved_session_id = str(latest_session.id)
    else:
        resolved_session_id = session_id

    try:
        # Fetch messages for the given or latest session
        messages = honcho.apps.users.sessions.messages.list(
            app_id=honcho_app.id, user_id=user_id, session_id=resolved_session_id
        )
        return {
            "session_id": resolved_session_id,
            "messages": [
                {
                    "id": msg.id,
                    "content": msg.content,
                    "created_at": msg.created_at,
                    "is_user": msg.is_user,
                }
                for msg in messages
            ],
        }
    except Exception as e:
        return {"error": f"Failed to fetch messages: {str(e)}"}


@app.get("/sessions")
async def get_sessions(user_id: str = Depends(get_current_user)):
    try:
        sessions = honcho.apps.users.sessions.list(
            app_id=honcho_app.id,
            user_id=user_id,
            reverse=True,  # Get the most recent sessions first
        )
        return [session for session in sessions]
    except Exception as e:
        return {"error": f"Failed to fetch sessions: {str(e)}"}


@app.put("/sessions/{session_id}/metadata")
async def update_session_metadata(
    session_id: str, metadata: Dict[str, Any], user_id: str = Depends(get_current_user)
):
    try:
        updated_session = honcho.apps.users.sessions.update(
            session_id=session_id,
            app_id=honcho_app.id,
            user_id=user_id,
            metadata=metadata,
        )
        return {"session_id": updated_session.id, "metadata": updated_session.metadata}
    except Exception as e:
        raise HTTPException(
            status_code=400, detail=f"Failed to update session metadata: {str(e)}"
        )


@app.get("/share/{session_id}")
async def share(session_id: str, user_id: str = Depends(get_current_user)):
    # return encrypted session_id and user_id
    encrypted = fernet.encrypt(f"{session_id}:{user_id}".encode())
    return {"code": encrypted.decode()}

async def resolve_legacy_user_id(legacy_user_id: str) -> str:
    try:
        users = honcho.apps.users.list(app_id=honcho_app.id)
        for user in users:
            if user.metadata and user.metadata.get("legacy_id") == legacy_user_id:
                return user.id
        raise HTTPException(
            status_code=404,
            detail=f"User not found with legacy ID {legacy_user_id}"
        )
    except Exception as e:
        raise HTTPException(
            status_code=404,
            detail=f"Failed to resolve user: {str(e)}"
        )


def is_legacy_id(id_str: str) -> bool:
    """
    Determine if an ID is a legacy UUID based on its format.
    Legacy UUIDs are 36 characters long with hyphens (e.g., 550e8400-e29b-41d4-a716-446655440000)
    New IDs are shorter nanoid strings
    """
    return len(id_str) == 36 and id_str.count('-') == 4

@app.get("/share/messages/{code}")
async def get_shared_messages(code: str):
    try:
        decrypted = fernet.decrypt(code.encode()).decode()
        session_id, user_id = decrypted.split(":")
        
        if is_legacy_id(user_id):
            current_user_id = await resolve_legacy_user_id(user_id)
            sessions = honcho.apps.users.sessions.list(
                app_id=honcho_app.id,
                user_id=current_user_id
            )
            
            for session in sessions:
                if session.metadata and session.metadata.get("legacy_id") == session_id:
                    return await get_session_messages(session_id=str(session.id), user_id=current_user_id)
            
            raise HTTPException(
                status_code=404,
                detail=f"Legacy session not found with ID {session_id}"
            )
        
        # For non-legacy IDs, try direct matching
        else:
            try:
                return await get_session_messages(session_id=session_id, user_id=user_id)
            except Exception as e:
                raise HTTPException(
                    status_code=404,
                    detail=f"Session not found with ID {session_id}"
                )
        
    except Exception as e:
        raise HTTPException(
            status_code=400, 
            detail=f"Invalid share code or session not found: {str(e)}"
        )

class MessageFormat(BaseModel):
    role: Literal["user", "assistant"]
    content: str

@app.get("/export/{session_id}")
async def export_session(session_id: str, user_id: str = Depends(get_current_user)):
    try:
        messages = honcho.apps.users.sessions.messages.list(
            app_id=honcho_app.id,
            user_id=user_id, 
            session_id=session_id
        )
        
        formatted_messages = [
            {
                "role": "user" if msg.is_user else "assistant",
                "content": msg.content
            } for msg in messages
        ]
        
        # Create a temporary file
        with tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.json') as tmp:
            json.dump(formatted_messages, tmp, indent=2)
            tmp_path = tmp.name
            
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"yousim_conversation_{timestamp}.json"
        
        return FileResponse(
            path=tmp_path,
            filename=filename,
            media_type='application/json',
            background=None  # Ensures file is sent before deletion
        )
            
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Failed to export session: {str(e)}"
        )
