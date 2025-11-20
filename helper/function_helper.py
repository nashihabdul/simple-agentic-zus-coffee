import re
import json
from langchain_core.messages import ToolMessage
from langchain_core.runnables import RunnableLambda
from langgraph.prebuilt import ToolNode
from loguru import logger

class HelperCustom:
    """List of custom helper function to help creating agent graph"""
    @staticmethod
    def handle_tool_error(state) -> dict:
        error = state.get("error")
        tool_calls = state["messages"][-1].tool_calls
        return {
            "messages": [
                ToolMessage(
                    content=f"Error: {repr(error)}\n please fix your mistakes.",
                    tool_call_id=tc["id"],
                )
                for tc in tool_calls
            ]
        }
        
    @staticmethod
    def log_tool_success(state) -> dict:
        """Log hasil tool yang berhasil."""
        for msg in state["messages"]:
            logger.info(f"[TOOL SUCCESS] result={msg.content}")
        return state
    
    @staticmethod
    def extract_result_from_tool_output(state) -> dict:
        for msg in state["messages"]:
            try:
                data = json.loads(msg.content)
                if "result" in data:
                    msg.content = str(data["result"])
            except Exception:
                logger.debug(f"Skipping message: {msg.content}")
                continue
        return state

    @staticmethod
    def create_tool_node_with_fallback(tools: list) -> ToolNode:
        tool_node = ToolNode(tools)

        processing_wrapper = RunnableLambda(HelperCustom.extract_result_from_tool_output)
        logging_wrapper = RunnableLambda(HelperCustom.log_tool_success)

        wrapped_node = tool_node | processing_wrapper | logging_wrapper
        return wrapped_node.with_fallbacks(
            [RunnableLambda(HelperCustom.handle_tool_error)],
            exception_key="error",
        )
        
    def strip_think_blocks(text: str) -> str:
        return re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL).strip()