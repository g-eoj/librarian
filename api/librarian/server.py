# Copyright 2026 g-eoj
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.


import argparse
import asyncio
import json
import os
import uuid
from collections.abc import AsyncGenerator
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from pydantic_ai.messages import ModelMessage

from pydantic_graph import End

from librarian._graph import CoderNode, ResearchNode, RouterNode, State, agent_graph
from librarian._utils import check_env


class QueryRequest(BaseModel):
    query: str
    session_id: str | None = None
    # Search settings
    allowed_sites: list[str] | None = None
    references_required: int = 1
    # AI settings
    baseline_thinking_effort: int = 5
    dynamic_thinking_effort: bool = True


def format_sse(event_type: str, data: dict) -> str:
    """Format data as an SSE event."""
    return f"event: {event_type}\ndata: {json.dumps(data)}\n\n"


def format_sse_comment() -> str:
    """Format a keepalive comment."""
    return ": keepalive\n\n"


def get_cors_origins() -> list[str]:
    """Get CORS origins from environment or use defaults."""
    if origins := os.environ.get("CORS_ORIGINS"):
        return [o.strip() for o in origins.split(",")]
    # Default: allow common local development ports
    return [
        "http://localhost:8080",
        "http://127.0.0.1:8080",
        "http://localhost:8001",
        "http://127.0.0.1:8001",
    ]


# Session storage for message history
sessions: dict[str, list[ModelMessage]] = {}


async def run_agent(
    query: str,
    session_id: str,
    allowed_sites: list[str] | None = None,
    references_required: int = 1,
    baseline_thinking_effort: int = 5,
    dynamic_thinking_effort: bool = True,
) -> AsyncGenerator[str, None]:
    """Run the agent and yield SSE events for each node."""
    messages = sessions.get(session_id, [])
    event_queue: asyncio.Queue[str | None] = asyncio.Queue()
    cancelled = asyncio.Event()
    current_messages: list[ModelMessage] = list(messages)

    async def keepalive():
        """Send keepalive comments every 15 seconds."""
        while not cancelled.is_set():
            try:
                await asyncio.wait_for(cancelled.wait(), timeout=15)
            except asyncio.TimeoutError:
                if not cancelled.is_set():
                    await event_queue.put(format_sse_comment())

    async def process_graph():
        """Process the graph and queue events."""
        nonlocal current_messages
        try:
            async with agent_graph.iter(
                RouterNode(),
                state=State(
                    task=query,
                    message_memory=messages,
                    allowed_urls=allowed_sites or [],
                    references_required=references_required,
                    baseline_thinking_effort=baseline_thinking_effort,
                    dynamic_thinking_effort=dynamic_thinking_effort,
                ),
            ) as run:
                node = None
                async for node in run:
                    node_type = type(node).__name__
                    node_data = {}

                    if isinstance(node, RouterNode):
                        node_data = {"feedback": node.feedback}
                    elif isinstance(node, CoderNode):
                        node_data = {
                            "task": node.task.model_dump() if node.task else None
                        }
                    elif isinstance(node, ResearchNode):
                        node_data = {
                            "query": node.research_query.model_dump()
                            if node.research_query
                            else None
                        }

                    await event_queue.put(
                        format_sse(
                            "node",
                            {
                                "node_type": node_type,
                                "data": node_data,
                            },
                        )
                    )

                    # Update messages after each node
                    current_messages = run.state.message_memory

                    if cancelled.is_set():
                        break

                if not cancelled.is_set():
                    assert isinstance(node, End)
                    result = node.data.model_dump()

                    await event_queue.put(
                        format_sse(
                            "answer",
                            {
                                "answer": result["answer"],
                                "references": result["references"],
                            },
                        )
                    )

        except asyncio.CancelledError:
            pass
        except Exception as e:
            if not cancelled.is_set():
                await event_queue.put(format_sse("error", {"message": str(e)}))
        finally:
            # Always save whatever messages we have
            sessions[session_id] = current_messages
            await event_queue.put(None)

    keepalive_task = asyncio.create_task(keepalive())
    process_task = asyncio.create_task(process_graph())

    try:
        while True:
            event = await event_queue.get()
            if event is None:
                break
            yield event
    except GeneratorExit:
        # Client disconnected
        cancelled.set()
    finally:
        cancelled.set()
        keepalive_task.cancel()
        process_task.cancel()
        try:
            await keepalive_task
        except asyncio.CancelledError:
            pass
        try:
            await process_task
        except asyncio.CancelledError:
            pass


check_env()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
async def health():
    """Check connectivity to the configured vLLM endpoint."""
    import httpx

    vllm_url = os.environ.get("VLLM_BASE_URL")
    api_key = os.environ.get("VLLM_API_KEY")
    headers = {"Authorization": f"Bearer {api_key}"} if api_key else {}
    try:
        async with httpx.AsyncClient() as client:
            r = await client.get(f"{vllm_url}/models", headers=headers)
        vllm_ok = r.status_code < 500
    except Exception:
        vllm_ok = False
    return {"vllm": vllm_ok, "vllm_url": vllm_url}


@app.post("/api/query")
async def query_agent(request: QueryRequest):
    """SSE endpoint for querying the agent."""
    session_id = request.session_id or str(uuid.uuid4())
    return StreamingResponse(
        run_agent(
            request.query,
            session_id,
            request.allowed_sites,
            request.references_required,
            request.baseline_thinking_effort,
            request.dynamic_thinking_effort,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Session-Id": session_id,
        },
    )


@app.delete("/api/session/{session_id}")
async def clear_session(session_id: str):
    """Clear a session's message history."""
    if session_id in sessions:
        del sessions[session_id]
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8001)
    parser.add_argument("--host", type=str, default="0.0.0.0")
    args = parser.parse_args()

    uvicorn.run(app, host=args.host, port=args.port)
