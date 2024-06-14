import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from contextvars import ContextVar

import sentry_sdk
from pydantic import BaseModel

from honcho import Honcho

# from .main import manual, auto, honcho
# from .main import app as honcho_app
from calls import GaslitClaude, Simulator

honcho = Honcho(environment="demo")
honcho_app = honcho.apps.get_or_create("NYTW Yousim Demo")

# gaslit_claude = GaslitClaude(name="", insights="", history=[])
# simulator = Simulator(history=[], name="")

gaslit_ctx = ContextVar(
    "gaslit_claude", default=GaslitClaude(name="", insights="", history=[])
)
simulator_ctx = ContextVar("simulator", default=Simulator(history=[], name=""))

# gaslit_response = ContextVar("gaslit_response", default="")
# simulator_response = ContextVar("simulator_response", default="")

sentry_sdk.init(
    dsn=os.getenv("SENTRY_DSN"),
    # Set traces_sample_rate to 1.0 to capture 100%
    # of transactions for performance monitoring.
    traces_sample_rate=1.0,
    # Set profiles_sample_rate to 1.0 to profile 100%
    # of sampled transactions.
    # We recommend adjusting this value in production.
    profiles_sample_rate=1.0,
)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=os.getenv("CLIENT_REGEX"),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class BaseRequest(BaseModel):
    user_id: str
    session_id: str


class ManualRequest(BaseRequest):
    command: str


class ChatResponse(BaseModel):
    message: str
    user_id: str
    session_id: str


def messages(res: BaseRequest):
    gaslit_claude = GaslitClaude(name="", insights="", history=[])
    simulator = Simulator(history=[], name="")
    history_iter = honcho.apps.users.sessions.messages.list(
        app_id=honcho_app.id, session_id=res.session_id, user_id=res.user_id
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


def manual_turn(res: ManualRequest):
    gaslit_response = res.command
    simulator_response = ""
    simulator = simulator_ctx.get()
    simulator.history += [{"role": "user", "content": res.command}]  # type: ignore
    response = simulator.stream()
    # print("\033[93mSIMULATOR CLAUDE:\033[0m")
    for chunk in response:
        # print(f"\033[93m{chunk.content}\033[0m", end="", flush=True)
        simulator_response += chunk.content
        yield chunk.content
    # print("\n")

    honcho.apps.users.sessions.messages.create(
        session_id=res.session_id,
        app_id=honcho_app.id,
        user_id=res.user_id,
        content=gaslit_response,
        is_user=True,
    )
    honcho.apps.users.sessions.messages.create(
        session_id=res.session_id,
        app_id=honcho_app.id,
        user_id=res.user_id,
        content=simulator_response,
        is_user=False,
    )


@app.post("/manual")
async def manual(res: ManualRequest):
    messages(res)
    return StreamingResponse(manual_turn(res))


@app.post("/auto")
async def auto(res: BaseRequest):
    # user = honcho.apps.users.get_or_create(app_id=honcho_app.id, name=res.user_id)
    messages(res)

    def convo():
        gaslit_response = ""
        gaslit_claude = gaslit_ctx.get()
        response = gaslit_claude.stream()
        # print("\033[94mSEARCHER CLAUDE:\033[0m")
        for chunk in response:
            # print(f"\033[94m{chunk.content}\033[0m", end="", flush=True)
            yield chunk.content
            gaslit_response += chunk.content
            # sleep(0.1)
        # gaslit_response.set(acc)
        # print("\n")
        # req = ManualRequest(
        #     user_id=res.user_id, session_id=res.session_id, command=gaslit_response
        # )

        # yield ""
        # yield "|<X❁X>|"
        # yield ""

        # reponse = manual_turn(req)

        # for chunk in reponse:
        #     yield chunk

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
async def reset(user_id: str, session_id: str | None = None):
    # user = honcho.apps.users.get_or_create(app_id=honcho_app.id, name=res.user_id)
    if session_id:
        honcho.apps.users.sessions.delete(
            app_id=honcho_app.id, session_id=session_id, user_id=user_id
        )
    session = honcho.apps.users.sessions.create(
        app_id=honcho_app.id, user_id=user_id, location_id="cli"
    )
    # TODO reset the session
    # gaslit_claude.history = []
    # simulator.history = []
    return {
        "user_id": user_id,
        "session_id": session.id,
    }
