from fastapi import APIRouter
from app.utils.response import ok, err
from app.services import repo_service
from app.models.schemas import APIResponse

router = APIRouter()

@router.get("/lineage", response_model=APIResponse)
async def get_lineage():
    try:
        lineage = repo_service.get_lineage()
        return ok(data=lineage)
    except Exception as e:
        return err(str(e))
