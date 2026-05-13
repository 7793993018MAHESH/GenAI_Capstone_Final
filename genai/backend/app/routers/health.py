from fastapi import APIRouter
from app.utils.response import ok, err
from app.services import health_service
from app.models.schemas import APIResponse

router = APIRouter()

@router.get("/health", response_model=APIResponse)
async def get_health():
    try:
        data = health_service.get_health()
        return ok(data={"pipelines": data})
    except Exception as e:
        return err(str(e))

@router.get("/slo", response_model=APIResponse)
async def get_slo():
    try:
        data = health_service.get_slo()
        return ok(data=data)
    except Exception as e:
        return err(str(e))
