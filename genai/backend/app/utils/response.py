from app.models.schemas import APIResponse

def ok(data=None, message="OK"):
    return APIResponse(status="success", data=data, message=message)

def err(message="Error", data=None):
    return APIResponse(status="error", data=data, message=message)
