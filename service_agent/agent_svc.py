from fastapi import FastAPI
from pydantic import BaseModel
from typing import List
import time
from langchain_core.messages import AIMessage, HumanMessage

import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from main import LangAgent

# -----------------------------
# FastAPI app
# -----------------------------
app = FastAPI()
agent_instance: LangAgent | None = None  # global agent instance

# -----------------------------
# Input API key saat startup
# -----------------------------
def init_agent_with_api_key():
    global agent_instance
    if not agent_instance:
        api_key = input("Please enter your API key: ").strip()
        if not api_key:
            raise ValueError("API key is required to start the server!")
        agent_instance = LangAgent(api_key=api_key)
        print("Agent initialized successfully!")

@app.on_event("startup")
async def startup_event():
    init_agent_with_api_key()

# -----------------------------
# Request model
# -----------------------------
class MessageRequest(BaseModel):
    messages: List[str]  # list of strings, alternates Human/AI

# -----------------------------
# Ask endpoint
# -----------------------------
@app.post("/ask")
async def ask_agent(request: MessageRequest):
    global agent_instance
    start = time.time()

    if not agent_instance:
        return {"status": "error", "answer": "Agent not initialized", "elapsed_time": 0}

    try:
        # konversi list of strings -> HumanMessage/AIMessage
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