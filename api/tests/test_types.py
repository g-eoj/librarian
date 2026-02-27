"""Tests for librarian/_types.py — Pydantic model validation."""

import pytest

from pydantic import ValidationError

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


class TestApprovalResponse:
    def test_valid(self):
        m = ApprovalResponse(answer_accepted=True, reason="Looks good")
        assert m.answer_accepted is True
        assert m.reason == "Looks good"

    def test_rejected(self):
        m = ApprovalResponse(answer_accepted=False, reason="Incomplete")
        assert m.answer_accepted is False


class TestCoderTask:
    def test_valid(self):
        m = CoderTask(task="Compute 2 + 2")
        assert m.task == "Compute 2 + 2"

    def test_rejects_task_over_1000_chars(self):
        with pytest.raises(ValidationError):
            CoderTask(task="x" * 1001)

    def test_accepts_exactly_1000_chars(self):
        CoderTask(task="x" * 1000)


class TestCoderResponse:
    def test_int_value(self):
        m = CoderResponse(explanation="Result", value=42, units=None)
        assert m.value == 42

    def test_float_value(self):
        m = CoderResponse(explanation="Pi", value=3.14, units="radians")
        assert m.units == "radians"

    def test_str_value(self):
        m = CoderResponse(explanation="Name", value="Alice", units=None)
        assert m.value == "Alice"


class TestFinalAnswer:
    def test_string_answer(self):
        m = FinalAnswer(answer="The answer is 42", references=[])
        assert m.answer == "The answer is 42"

    def test_numeric_answer(self):
        m = FinalAnswer(answer=42, references=["https://example.com"])
        assert m.answer == 42

    def test_references_list(self):
        refs = ["https://a.com", "https://b.com"]
        m = FinalAnswer(answer="yes", references=refs)
        assert m.references == refs


class TestSearchResult:
    def test_valid_with_snippet(self):
        m = SearchResult(
            title="Example", url="https://example.com", snippet="A snippet"
        )
        assert m.snippet == "A snippet"

    def test_snippet_optional(self):
        m = SearchResult(title="Example", url="https://example.com", snippet=None)
        assert m.snippet is None


class TestPaperSearchResult:
    def test_inherits_search_result(self):
        m = PaperSearchResult(
            title="A Paper",
            url="https://arxiv.org/abs/1234",
            snippet="Abstract",
            publication_info="Journal 2024",
        )
        assert m.title == "A Paper"
        assert m.publication_info == "Journal 2024"

    def test_publication_info_optional(self):
        m = PaperSearchResult(
            title="Paper",
            url="https://arxiv.org/abs/1234",
            snippet=None,
            publication_info=None,
        )
        assert m.publication_info is None


class TestNoteModels:
    def test_note(self):
        m = Note(text="Important fact")
        assert m.text == "Important fact"

    def test_note_with_reference(self):
        m = NoteWithReference(text="Important fact", reference="https://source.com")
        assert m.reference == "https://source.com"


class TestResearchQuery:
    def test_valid(self):
        m = ResearchQuery(
            query="climate change effects",
            reason="User asked about climate",
            source_requirements=None,
            include_academic_papers=True,
        )
        assert m.include_academic_papers is True

    def test_defaults_papers_to_false(self):
        m = ResearchQuery(query="q", reason="r", source_requirements=None)
        assert m.include_academic_papers is False


class TestRephrasedQuery:
    def test_valid(self):
        m = RephrasedQuery(query="alternative search terms")
        assert m.query == "alternative search terms"


class TestURLSelection:
    def test_valid(self):
        m = URLSelection(url="https://example.com/page")
        assert m.url == "https://example.com/page"
