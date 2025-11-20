"""
ZUS COFFEE MCP Tool - Arithmetic Version
"""

from typing import Annotated
from loguru import logger
from pydantic import Field
from fastmcp import FastMCP

mcp = FastMCP(
    name="Zus Coffee MCP Agent",
    instructions=(
        "Tool to do arithmetic calculations (add, subtract, multiply, divide)."
    )
)

@mcp.tool(
    name="arithmetic-tool",
    description=(
        "Calculate a mathematical operation. "
        "Input required: a (float), b (float), operation (select one of 'add', 'subtract', 'multiply', 'divide')."
    )
)
async def calculate(
    a: Annotated[float, Field(description="First number")],
    b: Annotated[float, Field(description="Second number")],
    operation: Annotated[str, Field(description="Operation: add, subtract, multiply, divide")],
) -> dict:
    try:
        if operation == "add":
            result = a + b
        elif operation == "subtract":
            result = a - b
        elif operation == "multiply":
            result = a * b
        elif operation == "divide":
            if b == 0:
                return {"success": False, "message": "Division by zero is not allowed."}
            result = a / b
        else:
            return {"success": False, "message": f"Invalid operation '{operation}'."}

        return {"success": True, "result": result}

    except Exception as e:
        logger.error(f"Error in calculation: {e}")
        return {"success": False, "message": str(e)}

def main():
    logger.info("Starting MCP Agent Server")
    mcp.run(transport="sse", host="0.0.0.0", port=9425)

__all__ = ["mcp"]

if __name__ == "__main__":
    main()