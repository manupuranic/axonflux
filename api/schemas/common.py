from pydantic import BaseModel


class PaginatedResponse(BaseModel):
    total: int
    limit: int
    offset: int
    items: list
