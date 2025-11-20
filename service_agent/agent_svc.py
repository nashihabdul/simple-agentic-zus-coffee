from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List
import time
from langchain_core.messages import HumanMessage, AIMessage

import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from main import LangAgent

app = FastAPI()

# -----------------------------
# Request model
# -----------------------------
class MessageRequest(BaseModel):
    messages: List[str]   # list of strings, alternates Human/AI
    api_key: str          # api_key untuk init agent per request

# -----------------------------
# Ask endpoint
# -----------------------------
@app.post("/ask")
async def ask_agent(request: MessageRequest):
    start = time.time()

    if not request.api_key:
        raise HTTPException(status_code=400, detail="API key is required")

    try:
        # inisialisasi agent per request
        agent_instance = LangAgent(api_key=request.api_key)
        await agent_instance.init_tools()

        # konversi list of string -> HumanMessage/AIMessage
        messages = []
        for i, msg in enumerate(request.messages):
            if i % 2 == 0:
                messages.append(HumanMessage(content=msg))
            else:
                messages.append(AIMessage(content=msg))

        # jalankan agent
        result = await agent_instance.ainvoke({"messages": messages})
        answer = result["messages"][-1].content if result["messages"] else ""

        return {
            "status": "success",
            "answer": answer,
            "elapsed_time": time.time() - start
        }

    except Exception as e:
        return {
            "status": "error",
            "answer": str(e),
            "elapsed_time": time.time() - start
        }