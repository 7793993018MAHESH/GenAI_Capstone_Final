from pydantic import BaseModel
from typing import Any, Optional, List, Dict

class APIResponse(BaseModel):
    status: str = "success"
    data: Any = None
    message: str = ""

class ChatRequest(BaseModel):
    message: str
    history: Optional[List[Dict[str, str]]] = []

class LoadRepoRequest(BaseModel):
    repo_url: str
    branch: str = "main"

class TriggerCheckRequest(BaseModel):
    table_name: str
