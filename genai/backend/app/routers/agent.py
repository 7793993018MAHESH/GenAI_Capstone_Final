from fastapi import APIRouter
from app.models.schemas import TriggerCheckRequest, APIResponse
from app.utils.response import ok, err
from app.tools.mcp_tools import trigger_data_quality_check, MCP_TOOL_DEFINITIONS

router = APIRouter()

@router.post("/trigger-check", response_model=APIResponse)
async def trigger_check(req: TriggerCheckRequest):
    try:
        result = trigger_data_quality_check(req.table_name)
        return ok(data=result, message=f"Quality check complete for '{req.table_name}'")
    except Exception as e:
        return err(str(e))

@router.get("/mcp/tools", response_model=APIResponse)
async def list_mcp_tools():
    return ok(data={"tools": MCP_TOOL_DEFINITIONS})
