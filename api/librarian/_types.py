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


from pydantic import BaseModel, Field


class ApprovalResponse(BaseModel):
    """Decide whether the provided final answer completes the task."""

    answer_accepted: bool
    reason: str


class CoderResponse(BaseModel):
    """The result of completing your task."""

    explanation: str
    value: int | float | str
    units: str | None


class CoderTask(BaseModel):
    """Ask an expert Python coder to compute something."""

    task: str = Field(max_length=1000, pattern="[^#]*")


class FinalAnswer(BaseModel):
    """The answer to the user request. Be detailed but succinct."""

    answer: int | float | str
    references: list[str] = Field()


class Note(BaseModel):
    """Information that will be reviewed later."""

    text: str


class NoteWithReference(Note):
    """The final result of a research query."""

    reference: str


class RephrasedQuery(BaseModel):
    """A rephrased search query to find more results."""

    query: str


class ResearchQuery(BaseModel):
    """Ask an expert researcher to find information for you."""

    query: str
    reason: str
    source_requirements: str | None
    include_academic_papers: bool = False


class SearchResult(BaseModel):
    """A link that may be useful."""

    title: str
    url: str
    snippet: str | None


class PaperSearchResult(SearchResult):
    """A paper that may be useful."""

    publication_info: str | None


class URLSelection(BaseModel):
    """URL to read."""

    url: str
