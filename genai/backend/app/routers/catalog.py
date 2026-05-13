from fastapi import APIRouter
from app.utils.response import ok, err
from app.services import repo_service
from app.models.schemas import APIResponse

router = APIRouter()

@router.get("/tables", response_model=APIResponse)
async def get_tables():
    try:
        tables = repo_service.get_tables()
        return ok(data={"tables": tables, "total": len(tables)})
    except Exception as e:
        return err(str(e))
