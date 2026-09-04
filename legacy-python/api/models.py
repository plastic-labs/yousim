from pydantic import BaseModel
from typing import Literal


class BaseRequest(BaseModel):
    session_id: str


class ManualRequest(BaseRequest):
    command: str


class ChatResponse(BaseModel):
    message: str
    session_id: str


class Reset(BaseModel):
    user_id: str
    session_id: str | None


class MessageFormat(BaseModel):
    role: Literal["user", "assistant"]
    content: str
