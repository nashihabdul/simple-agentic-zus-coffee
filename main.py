from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI()

class RequestData(BaseModel):
    thread_id: str
    prompt: str

class ResponseData(BaseModel):
    thread_id: str
    answer: str

@app.post("/ask", response_model=ResponseData)
async def ask(request: RequestData):
    # Dummy answer
    answer = f"Dummy answer for prompt: {request.prompt}"
    return ResponseData(
        thread_id=request.thread_id,
        answer=answer
    )