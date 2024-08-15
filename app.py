import os
from contextvars import ContextVar
from typing import Annotated, Any, Dict
from functools import cache
from fastapi.security import OAuth2PasswordBearer

import sentry_sdk
from fastapi import Depends, FastAPI, HTTPException, status
from starlette.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from honcho import Honcho
from pydantic import BaseModel

from cryptography.fernet import Fernet
import base64

from calls import GaslitClaude, Simulator

import jwt


from dotenv import load_dotenv

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
SECRET_KEY = base64.b64decode(get_env("SECRET_KEY"))
HONCHO_APP_NAME = get_env("HONCHO_APP_NAME")

fernet = Fernet(SECRET_KEY)

honcho = Honcho(base_url=HONCHO_ENV)
honcho_app = honcho.apps.get_or_create(HONCHO_APP_NAME)


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
    for chunk in response:
        simulator_response += chunk.content
        yield chunk.content

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
        for chunk in response:
            gaslit_response += chunk.content
            yield chunk.content

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


@app.get("/reset")
async def reset(
    session_id: str | None = None, user_id: str = Depends(get_current_user)
):
    if session_id:
        honcho.apps.users.sessions.delete(
            app_id=honcho_app.id, session_id=session_id, user_id=user_id
        )
    session = honcho.apps.users.sessions.create(app_id=honcho_app.id, user_id=user_id)
    # TODO reset the session
    # gaslit_claude.history = []
    # simulator.history = []
    return {
        "user_id": user_id,
        "session_id": session.id,
    }


@app.get("/session")
async def get_session_messages(
    session_id: str | None = None, user_id: str = Depends(get_current_user)
):
    if not session_id:
        # Fetch the latest session if session_id is not provided
        sessions = honcho.apps.users.sessions.list(
            app_id=honcho_app.id, user_id=user_id, size=1, reverse=True
        )
        session_id = sessions.items[0].id
    try:
        # Fetch messages for the given or latest session
        messages = honcho.apps.users.sessions.messages.list(
            app_id=honcho_app.id, user_id=user_id, session_id=session_id
        )
        return {
            "session_id": session_id,
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


@app.get("/share/messages/{code}")
async def share_messages(code: str):
    try:
        decrypted = fernet.decrypt(code.encode()).decode()
        session_id, user_id = decrypted.split(":")
        return await get_session_messages(session_id=session_id, user_id=user_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid encrypted data")
