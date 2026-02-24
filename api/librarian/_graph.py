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


from __future__ import annotations

import hashlib
import os
import re
from dataclasses import dataclass, field
from datetime import datetime

import logfire
from cragents import (
    Constrain,
    CRAgent,
    Think,
    UseTools,
    vllm_model_profile,
)
from pydantic_ai import RunContext, ToolDefinition, ToolOutput, format_as_xml
from pydantic_ai.mcp import MCPServerStdio
from pydantic_ai.messages import ModelMessage
from pydantic_ai.models.openai import OpenAIChatModel, OpenAIChatModelSettings
from pydantic_ai.providers.openai import OpenAIProvider
from pydantic_graph import BaseNode, End, Graph, GraphRunContext

from librarian._tools import (
    read_url,
    search_papers,
    search_web,
)
from librarian._types import (
    ApprovalResponse,
    CoderResponse,
    CoderTask,
    FinalAnswer,
    Note,
    NoteWithReference,
    PaperSearchResult,
    RephrasedQuery,
    ResearchQuery,
    SearchResult,
    URLSelection,
)
from librarian._utils import LimitDeps

logfire.configure(console=False, send_to_logfire=False)
logfire.instrument_pydantic_ai()

MAX_RETRIES = 3

model = OpenAIChatModel(
    model_name=os.environ["VLLM_MODEL_NAME"],
    provider=OpenAIProvider(
        api_key=os.environ["VLLM_API_KEY"],
        base_url=os.environ["VLLM_BASE_URL"],
    ),
    profile=vllm_model_profile,
    settings=OpenAIChatModelSettings(
        parallel_tool_calls=False,
    ),
)


@dataclass
class State:
    """Graph state."""

    task: str

    allowed_urls: list[str] = field(default_factory=list[str])
    references: list[str] = field(default_factory=list[str])
    references_required: int = 1

    answer_tries: int = 0
    baseline_thinking_effort: int = 5
    dynamic_thinking_effort: bool = True
    message_memory: list[ModelMessage] = field(default_factory=list[ModelMessage])
    research_query_memory: dict[str, list[NoteWithReference]] = field(
        default_factory=dict[str, list[NoteWithReference]]
    )


@dataclass
class RouterNode(BaseNode[State, None, FinalAnswer]):
    """Routes task steps to tools or agents. Decides when task is complete."""

    feedback: str | None = None

    async def run(
        self, ctx: GraphRunContext[State]
    ) -> End[FinalAnswer] | CoderNode | ResearchNode | RouterNode:
        router_complexity = ctx.state.baseline_thinking_effort
        if ctx.state.dynamic_thinking_effort:
            router_complexity += len(re.split(r"[\.\?\!\n] ", self.feedback or ""))

        router_agent = CRAgent(
            instructions=(
                "Decide what to do next. "
                "Call the coder for computations and simulations. "
                "Don't call the researcher unnecessarily. "
                "However, do call the researcher as many times as needed to collect relevant information. "
                "Don't provide references for research in your responses, the user can already see the sources."
            ),
            model=model,
            output_type=[
                ToolOutput(CoderTask, name="call_coder"),
                ToolOutput(ResearchQuery, name="call_researcher"),
                ToolOutput(FinalAnswer, name="make_response"),
            ],
        )
        await router_agent.set_guide(
            generation_sequence=[
                Think(
                    sequence=[
                        Constrain(
                            max_newlines=router_complexity,
                            max_char_captures=8,
                            chars_to_capture=".?!",
                        )
                    ]
                ),
                UseTools(),
            ],
        )
        if self.feedback is None:
            instructions = f"<query>{ctx.state.task}</query><current_datetime>{datetime.now()}</current_datetime>"
        else:
            instructions = self.feedback
        run = await router_agent.run(
            instructions,
            message_history=ctx.state.message_memory,
        )
        ctx.state.message_memory += run.new_messages()

        if isinstance(run.output, CoderTask):
            return CoderNode(run.output)

        if isinstance(run.output, ResearchQuery):
            return ResearchNode(run.output)

        if isinstance(run.output, FinalAnswer):
            approval_complexity = router_complexity
            if ctx.state.dynamic_thinking_effort:
                approval_complexity += ctx.state.answer_tries

            ctx.state.answer_tries += 1
            potential_final_answer = run.output
            approval_agent = CRAgent(
                instructions=(
                    "Make absolutely sure all requirements are met before approving an answer. "
                    "It is okay to approve requests for more information from the user."
                ),
                model=model,
                output_type=[
                    ToolOutput(ApprovalResponse, max_retries=1, name="make_decision"),
                ],
            )

            await approval_agent.set_guide(
                generation_sequence=[
                    Think(
                        sequence=[
                            Constrain(
                                max_newlines=approval_complexity,
                                max_char_captures=8,
                                chars_to_capture=".?!",
                            ),
                        ]
                    ),
                    UseTools(),
                ],
            )
            instructions = (
                f"Review the original task:\n\n{ctx.state.task}\n\n"
                f"Review the message history and this response to decide if the response was arrived at correctly:\n\n{format_as_xml(potential_final_answer)}"
            )
            approval_run = await approval_agent.run(
                instructions,
                message_history=ctx.state.message_memory,
            )
            ctx.state.message_memory += approval_run.new_messages()
            if (
                approval_run.output.answer_accepted
                or ctx.state.answer_tries > MAX_RETRIES
            ):
                potential_final_answer.references = list(set(ctx.state.references))
                return End(potential_final_answer)

            return RouterNode(feedback=format_as_xml(approval_run.output))

        raise RuntimeError(f"Unexpected output type: {type(run.output)}")


@dataclass
class CoderNode(BaseNode[State, None, FinalAnswer]):
    """Python coder."""

    task: CoderTask

    @staticmethod
    async def no_comments(
        ctx: RunContext, tool_defs: list[ToolDefinition]
    ) -> list[ToolDefinition] | None:
        tool_defs[0].parameters_json_schema["properties"]["python_code"]["pattern"] = (
            "^[^#]*$"
        )
        return tool_defs

    async def run(self, ctx: GraphRunContext[State]) -> RouterNode:
        complexity = ctx.state.baseline_thinking_effort
        if ctx.state.dynamic_thinking_effort:
            complexity += len(re.split(r"[\.\?\!\n] ", format_as_xml(self.task)))

        python_server = MCPServerStdio(
            "uvx", args=["mcp-run-python@latest", "stdio"], timeout=10
        )
        python_server = python_server.prepared(prepare_func=CoderNode.no_comments)
        python_server = python_server.filtered(
            lambda ctx, tool_def: not ctx.deps.at_limit()
        )

        coder_agent = CRAgent(
            model=model,
            deps_type=LimitDeps,
            output_type=[
                ToolOutput(
                    CoderResponse,
                    name="final_result",
                    description="Call this tool when you have completed your task.",
                ),
            ],
            retries=2,
            toolsets=[python_server],
        )
        deps = LimitDeps(5)
        await coder_agent.set_guide(
            generation_sequence=[
                Think(
                    sequence=[Constrain(max_newlines=complexity, max_char_captures=8)]
                ),
                UseTools(),
            ],
            deps=deps,
        )
        async with coder_agent:
            run = await coder_agent.run(format_as_xml(self.task), deps=deps)
        return RouterNode(feedback=format_as_xml(run.output))


@dataclass
class ResearchNode(BaseNode[State, None, FinalAnswer]):
    """Finds information."""

    research_query: ResearchQuery

    async def _search_with_query(
        self, query: str, ctx: GraphRunContext[State]
    ) -> list[SearchResult | PaperSearchResult]:
        """Perform search with given query and allowed sites filter."""
        results: list[SearchResult | PaperSearchResult] = await search_web(
            query=query,
            allowed_urls=ctx.state.allowed_urls,
        )
        if self.research_query.include_academic_papers:
            results.extend(
                await search_papers(
                    query=query,
                    allowed_urls=ctx.state.allowed_urls,
                )
            )
        return results

    async def run(self, ctx: GraphRunContext[State]) -> RouterNode | ResearchNode:
        query_hash = hashlib.sha256(
            (
                format_as_xml(self.research_query)
                + format_as_xml(ctx.state.allowed_urls)
            ).encode()
        ).hexdigest()
        if query_hash in ctx.state.research_query_memory:
            return RouterNode(
                feedback=format_as_xml(ctx.state.research_query_memory[query_hash])
            )
        ctx.state.research_query_memory[query_hash] = []

        # Search and keep searching until minimum required sources are found
        search_results = await self._search_with_query(self.research_query.query, ctx)
        last_tried_query = ""
        retries = 0
        while (
            len(search_results) < ctx.state.references_required
            and retries < MAX_RETRIES
        ):
            rephrase_complexity = ctx.state.baseline_thinking_effort
            if ctx.state.dynamic_thinking_effort:
                rephrase_complexity += retries
            rephrase_agent = CRAgent(
                instructions="You rephrase search queries. Try using key words that would yield different results.",
                model=model,
                output_type=[ToolOutput(RephrasedQuery, name="rephrase_query")],
            )
            await rephrase_agent.set_guide(
                generation_sequence=[
                    Think(
                        sequence=[
                            Constrain(rephrase_complexity, 8),
                        ]
                    ),
                    UseTools(),
                ]
            )
            rephrase_run = await rephrase_agent.run(
                format_as_xml(self.research_query)
                + f"<last_tried_query>{last_tried_query}</last_tried_query>"
            )
            new_results = await self._search_with_query(rephrase_run.output.query, ctx)
            existing_urls = {r.url for r in search_results}
            for r in new_results:
                if r.url not in existing_urls:
                    search_results.append(r)
                    existing_urls.add(r.url)
            last_tried_query = rephrase_run.output.query
            retries += 1

        select_agent = CRAgent(
            model=model,
            output_type=[
                ToolOutput(URLSelection, name="select_url", max_retries=3),
            ],
        )
        read_agent = CRAgent(
            model,
            output_type=[ToolOutput(Note, name="make_note")],
        )
        local_message_history = []

        # Process available results (may be less than required)
        results_to_process = min(ctx.state.references_required, len(search_results))
        for _ in range(results_to_process):
            if not search_results:
                break
            select_complexity = ctx.state.baseline_thinking_effort
            if ctx.state.dynamic_thinking_effort:
                select_complexity += len(search_results) // 3
            await select_agent.set_guide(
                generation_sequence=[
                    Think(sequence=[Constrain(select_complexity, 8)]),
                    UseTools(),
                ]
            )
            select_run = await select_agent.run(
                f"Select an URL from the ones below, given the query: {format_as_xml(self.research_query)}\n\n{format_as_xml(search_results)}",
                message_history=local_message_history,
            )
            local_message_history += select_run.new_messages()

            try:
                query_documents = await read_url(
                    query=self.research_query.query, url=select_run.output.url
                )
            except Exception:
                search_results = [
                    sr for sr in search_results if sr.url != select_run.output.url
                ]
                continue
            if (
                query_documents["documents"] is None
                or query_documents["distances"] is None
            ):
                raise ValueError(
                    f"Failed to retrieve documents from {select_run.output.url}"
                )
            max_distance = 0.3
            relevant_chunks = [
                (i, d, dist)
                for i, d, dist in zip(
                    query_documents["ids"][0],
                    query_documents["documents"][0],
                    query_documents["distances"][0],
                )
                if dist <= max_distance
            ]
            relevant_chunks.sort(key=lambda x: x[0])
            avg_chunk_distance = sum(x[2] for x in relevant_chunks) / max(
                len(relevant_chunks), 1
            )
            summary_documents = [(i, d) for i, d, _ in relevant_chunks]
            summary = "\n\n...\n\n".join([x[1] for x in summary_documents])

            read_complexity = ctx.state.baseline_thinking_effort
            if ctx.state.dynamic_thinking_effort:
                read_complexity += len(summary_documents) + int(avg_chunk_distance * 10)
            await read_agent.set_guide(
                generation_sequence=[
                    Think(sequence=[Constrain(read_complexity, 8)]),
                    UseTools(),
                ]
            )
            read_run = await read_agent.run(
                f"Write a note that will help answer:\n\n'{format_as_xml(self.research_query)}'\n\nUse these documents:\n\n{summary}",
            )
            note = NoteWithReference(
                text=read_run.output.text,
                reference=select_run.output.url,
            )
            ctx.state.references.append(note.reference)
            ctx.state.research_query_memory[query_hash].append(note)
            search_results = [
                sr for sr in search_results if sr.url != select_run.output.url
            ]

        feedback = format_as_xml(ctx.state.research_query_memory[query_hash])
        return RouterNode(feedback=feedback)


agent_graph: Graph[State, None, FinalAnswer] = Graph(
    nodes=[RouterNode, CoderNode, ResearchNode]
)
