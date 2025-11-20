"""Custom Assistant to used as main agents"""
from __future__ import annotations

import re
import sys
from pathlib import Path

from loguru import logger

from langchain_core.runnables import Runnable
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage

ROOT = Path(__file__).resolve().parents[0]
for path in [ROOT]:
    sys.path.insert(0, str(path))

class Assistant:
    def __init__(
        self, 
        runnable: Runnable
        ):
        self.runnable = runnable

    def __call__(
        self,
        state,
        config: RunnableConfig
        ):
        while True:
            logger.info(f"AGENT THINKING...")
            logger.info(state['messages'][-1].content[:200] + "...")
            result = self.runnable.invoke(state)

            # If result is valid content
            if not result.tool_calls:
                if isinstance(result.content, str):
                    cleaned_content = result.content
                else:
                    cleaned_content = ""
                
                ai_message = AIMessage(
                    content=cleaned_content,
                    tool_calls=getattr(result, "tool_calls", None),
                    additional_kwargs=getattr(result, "additional_kwargs", {})
                )
                
                logger.info(f"AGENT DECISION: ANSWER")
                
                return {
                    "messages": ai_message
                }

            # If result is not valid content nor valid tool calls
            if not result.tool_calls and (
                not result.content
                or isinstance(result.content, list)
                and not result.content[0].get("text")
            ):

                logger.warning("AGENT NOT RESPOND PROPERLY, TRY AGAIN")

                messages = state["messages"] + [("user", "Try again and respond with a real output.")]
                state = {**state, "messages": messages}
            else:
                break
        
        ai_message = AIMessage(
            content=result.content,
            tool_calls=getattr(result, "tool_calls", None),
            additional_kwargs=getattr(result, "additional_kwargs", {})
        )
        
        logger.info(f"AGENT DECISION: TOOL CALL")
            
        return {
            "messages": ai_message
        }