"""Tests for librarian/_tools.py — pure utility functions.

Heavy I/O functions (search_web, search_papers, read_url, get_md) require
external services (Serper API, Playwright, ChromaDB) and are out of scope
for this unit-test suite.
"""

from librarian._tools import build_url_restricted_query


class TestBuildUrlRestrictedQuery:
    """build_url_restricted_query prepends site: filters to a search query."""

    def test_no_allowed_urls_returns_query_unchanged(self):
        result = build_url_restricted_query("python async", None)
        assert result == "python async"

    def test_empty_allowed_urls_returns_query_unchanged(self):
        result = build_url_restricted_query("python async", [])
        assert result == "python async"

    def test_single_url_adds_site_filter(self):
        result = build_url_restricted_query("deep learning", ["https://arxiv.org"])
        assert "site:arxiv.org" in result
        assert "deep learning" in result

    def test_strips_www_prefix(self):
        result = build_url_restricted_query("search query", ["https://www.example.com"])
        assert "site:example.com" in result
        assert "site:www.example.com" not in result

    def test_multiple_urls_joined_with_or(self):
        result = build_url_restricted_query(
            "query", ["https://arxiv.org", "https://nature.com"]
        )
        assert "site:arxiv.org" in result
        assert "site:nature.com" in result
        assert " OR " in result
        assert "query" in result

    def test_duplicate_urls_deduplicated(self):
        result = build_url_restricted_query(
            "q", ["https://example.com", "https://example.com"]
        )
        # Only one site: filter should appear
        assert result.count("site:example.com") == 1

    def test_url_with_path_included(self):
        result = build_url_restricted_query("search", ["https://example.com/papers"])
        assert "site:example.com/papers" in result

    def test_url_with_www_and_path(self):
        result = build_url_restricted_query("q", ["https://www.example.com/blog"])
        assert "site:example.com/blog" in result
        assert "www." not in result

    def test_query_appended_after_filters(self):
        result = build_url_restricted_query("machine learning", ["https://example.com"])
        # The query text should come after the site filters
        filter_end = result.index("machine learning")
        assert filter_end > 0
