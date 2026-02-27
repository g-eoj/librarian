"""Smoke tests for librarian/server.py — SSE helpers and FastAPI endpoints."""

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from librarian.server import (
    app,
    format_sse,
    format_sse_comment,
    get_cors_origins,
    sessions,
)

client = TestClient(app)


@pytest.fixture(autouse=True)
def clear_sessions():
    """Isolate session state between tests."""
    sessions.clear()
    yield
    sessions.clear()


# ---------------------------------------------------------------------------
# SSE formatting helpers
# ---------------------------------------------------------------------------


class TestFormatSse:
    def test_event_line(self):
        result = format_sse("node", {"x": 1})
        assert result.startswith("event: node\n")

    def test_data_line_is_json(self):
        data = {"answer": "42", "references": ["https://a.com"]}
        result = format_sse("answer", data)
        data_line = result.split("\n")[1]
        assert data_line.startswith("data: ")
        assert json.loads(data_line[len("data: ") :]) == data

    def test_ends_with_double_newline(self):
        result = format_sse("ping", {})
        assert result.endswith("\n\n")

    def test_exact_format(self):
        result = format_sse("node", {"k": "v"})
        assert result == 'event: node\ndata: {"k": "v"}\n\n'


class TestFormatSseComment:
    def test_keepalive_format(self):
        assert format_sse_comment() == ": keepalive\n\n"


# ---------------------------------------------------------------------------
# CORS origins helper
# ---------------------------------------------------------------------------


class TestGetCorsOrigins:
    def test_defaults_when_env_var_absent(self, monkeypatch):
        monkeypatch.delenv("CORS_ORIGINS", raising=False)
        origins = get_cors_origins()
        assert "http://localhost:8080" in origins
        assert "http://localhost:8001" in origins

    def test_parses_comma_separated_env_var(self, monkeypatch):
        monkeypatch.setenv(
            "CORS_ORIGINS", "http://app.example.com, http://other.example.com"
        )
        origins = get_cors_origins()
        assert origins == ["http://app.example.com", "http://other.example.com"]

    def test_single_origin(self, monkeypatch):
        monkeypatch.setenv("CORS_ORIGINS", "http://app.example.com")
        assert get_cors_origins() == ["http://app.example.com"]


# ---------------------------------------------------------------------------
# DELETE /api/session/{session_id}
# ---------------------------------------------------------------------------


class TestClearSession:
    def test_clears_existing_session(self):
        sessions["sess-1"] = []
        response = client.delete("/api/session/sess-1")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
        assert "sess-1" not in sessions

    def test_nonexistent_session_still_returns_ok(self):
        response = client.delete("/api/session/nonexistent")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}


# ---------------------------------------------------------------------------
# POST /api/query
# ---------------------------------------------------------------------------


def _make_fake_run_agent(*events: dict):
    """Return an async generator function that yields the given SSE events."""

    async def fake_run_agent(*args, **kwargs):
        for event_type, data in events:
            yield format_sse(event_type, data)

    return fake_run_agent


class TestQueryEndpoint:
    def test_returns_200_with_event_stream(self):
        fake = _make_fake_run_agent(("answer", {"answer": "ok", "references": []}))
        with patch("librarian.server.run_agent", fake):
            response = client.post("/api/query", json={"query": "test"})
        assert response.status_code == 200
        assert "text/event-stream" in response.headers["content-type"]

    def test_session_id_header_echoed_when_provided(self):
        fake = _make_fake_run_agent(("answer", {"answer": "ok", "references": []}))
        with patch("librarian.server.run_agent", fake):
            response = client.post(
                "/api/query", json={"query": "test", "session_id": "my-sess"}
            )
        assert response.headers.get("x-session-id") == "my-sess"

    def test_session_id_generated_when_absent(self):
        fake = _make_fake_run_agent(("answer", {"answer": "ok", "references": []}))
        with patch("librarian.server.run_agent", fake):
            response = client.post("/api/query", json={"query": "test"})
        assert response.headers.get("x-session-id")

    def test_missing_query_returns_422(self):
        response = client.post("/api/query", json={})
        assert response.status_code == 422

    def test_streamed_body_contains_sse_events(self):
        fake = _make_fake_run_agent(
            ("node", {"node_type": "RouterNode", "data": {}}),
            ("answer", {"answer": "42", "references": []}),
        )
        with patch("librarian.server.run_agent", fake):
            response = client.post("/api/query", json={"query": "What is 2+2?"})
        assert "event: node" in response.text
        assert "event: answer" in response.text


# ---------------------------------------------------------------------------
# GET /api/health
# ---------------------------------------------------------------------------


class TestHealthEndpoint:
    def _mock_client(self, status_code: int):
        mock_resp = MagicMock()
        mock_resp.status_code = status_code
        mock_async_client = AsyncMock()
        mock_async_client.get = AsyncMock(return_value=mock_resp)
        return mock_async_client

    def test_returns_vllm_true_when_reachable(self, monkeypatch):
        mock_client = self._mock_client(status_code=200)
        with patch("httpx.AsyncClient") as MockClass:
            MockClass.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            MockClass.return_value.__aexit__ = AsyncMock(return_value=None)
            response = client.get("/api/health")
        assert response.status_code == 200
        assert response.json()["vllm"] is True

    def test_returns_vllm_false_when_unreachable(self):
        with patch("httpx.AsyncClient") as MockClass:
            MockClass.return_value.__aenter__ = AsyncMock(
                side_effect=Exception("Connection refused")
            )
            MockClass.return_value.__aexit__ = AsyncMock(return_value=None)
            response = client.get("/api/health")
        assert response.status_code == 200
        assert response.json()["vllm"] is False

    def test_returns_vllm_false_on_500(self):
        mock_client = self._mock_client(status_code=500)
        with patch("httpx.AsyncClient") as MockClass:
            MockClass.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            MockClass.return_value.__aexit__ = AsyncMock(return_value=None)
            response = client.get("/api/health")
        assert response.json()["vllm"] is False

    def test_vllm_url_in_response(self, monkeypatch):
        monkeypatch.setenv("VLLM_BASE_URL", "http://test-vllm:8080/v1")
        mock_client = self._mock_client(status_code=200)
        with patch("httpx.AsyncClient") as MockClass:
            MockClass.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            MockClass.return_value.__aexit__ = AsyncMock(return_value=None)
            response = client.get("/api/health")
        assert response.json()["vllm_url"] == "http://test-vllm:8080/v1"
