import asyncio
from loguru import logger
from typing import Annotated, List, TypedDict

from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import AnyMessage, add_messages
from langgraph.prebuilt import tools_condition

from langchain_core.messages import AIMessage, HumanMessage
from langchain_mcp_adapters.client import MultiServerMCPClient

from helper.function_helper import HelperCustom
from helper.agent import Assistant
from config import settings

class LangAgent:
    class AgentState(TypedDict, total=False):
        messages: Annotated[list[AnyMessage], add_messages]
        intention: str
        tool_mode: str  # opsional, bisa pakai kondisi ini untuk memilih tools

    def __init__(self, api_key: str):
        logger.info("Initialize LLM...")
        self.llm = ChatOpenAI(
            model_name=settings.LLM_MODEL,
            api_key=api_key,
            max_tokens=2000
        )

        logger.info("Initialize MCP client...")
        self.client = MultiServerMCPClient(
            {
                "calculator": {"transport": "sse", "url": "https://mcp-tools-production-6365.up.railway.app/sse"},
            }
        )
        # self._all_tools = asyncio.run(self.client.get_tools())
        # logger.success(f"All tools loaded: {', '.join(tool.name for tool in self._all_tools)}")

    # -----------------------------
    # SELECT TOOLS
    # -----------------------------
    async def init_tools(self):
        self._all_tools = await self.client.get_tools()
        self.chain = self._create_assistant_chain()
        self.agent = self._create_agent_flow()
        
    def get_tools_for_state(self, state: dict):
        """
        Memilih tools berdasarkan kondisi tertentu di state.
        Misal: state['tool_mode'] = "calculator_only"
        """
        tool_mode = state.get("tool_mode", "all")
        if tool_mode == "calculator_only":
            return [t for t in self._all_tools if t.name == "calculator"]
        elif tool_mode == "drinkware_only":
            return [t for t in self._all_tools if t.name in ["drinkware_catalogue"]]
        else:
            # default: semua tools
            return self._all_tools

    # -----------------------------
    # Formatting conversation
    # -----------------------------
    def _format_conversation_from_state(self, state: dict) -> str:
        messages = state.get("messages", [])
        filtered = [msg for msg in messages if isinstance(msg, (HumanMessage, AIMessage))]
        if not filtered:
            return "No conversation history yet"
        lines = []
        for msg in filtered:
            lines.append(f"Human: {msg.content}" if isinstance(msg, HumanMessage) else f"AI: {msg.content}")
        return "\n".join(lines)

    # -----------------------------
    # Intention step
    # -----------------------------
    def _intention_step(self, state):
        logger.info("[INTENTION STEP]...")
        history = self._format_conversation_from_state(state)
        messages = [
            (
                "system",
                f"""
                You are a helpful assistant. Your role is to reflect on user queries with intention.
                Available tools will be dynamically selected.
                <History Conversation>
                {history}
                </end history>
                """
            ),
            (
                "human",
                f"USER QUESTION:\n{state['messages'][-1].content}"
            )
        ]
        response = self.llm.invoke(messages)
        logger.info("[INTENTION RESULT]: " + response.content)
        return {"intention": response.content}

    # -----------------------------
    # CREATE ASSISTANT CHAIN
    # -----------------------------
    def _create_assistant_chain(self):
        prompt = ChatPromptTemplate.from_messages([
            ("system", """
                You are a customer service assistant. Answer based on instructions and tools.
                *INSTRUCTION*
                {intention}
            """),
            ("placeholder", "{messages}")
        ])
        return prompt | self.llm.bind_tools(self._all_tools) 

    # -----------------------------
    # ROUTING AGENT
    # -----------------------------
    def _route_agent(self, state):
        route = tools_condition(state)
        logger.info(f"[PRIMARY AGENT][ROUTING]: {route}")
        if route == END:
            return END

        tool_calls = state["messages"][-1].tool_calls
        if tool_calls:
            logger.info(f"[TOOL CALL]: {tool_calls[0]['name']} -> {tool_calls[0]['args']}")
            return "agent_tools"
        return END

    # -----------------------------
    # Membuat agent flow
    # -----------------------------
    def _create_agent_flow(self):
        agent_flow = StateGraph(self.AgentState)
        agent_flow.add_node("intention", self._intention_step)
        agent_flow.add_node("primary_assistant", Assistant(self.chain))
        agent_flow.add_edge(START, "intention")
        agent_flow.add_edge("intention", "primary_assistant")
        agent_flow.add_node(
            "agent_tools",
            HelperCustom.create_tool_node_with_fallback(self._all_tools)
        )
        agent_flow.add_edge("agent_tools", "primary_assistant")
        agent_flow.add_conditional_edges("primary_assistant", self._route_agent, ["agent_tools", END])
        return agent_flow.compile()

    # -----------------------------
    # Public async interface
    # -----------------------------
    async def ainvoke(self, input_state: dict):
        input_state["tools"] = self.get_tools_for_state(input_state)
        return await self.agent.ainvoke(input_state)