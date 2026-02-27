"""Tests for librarian/_utils.py — LimitDeps and check_env."""

import json
import os

import pytest

from librarian._utils import LimitDeps, check_env


class TestLimitDeps:
    """LimitDeps counts tool calls and blocks once the cap is reached."""

    def test_returns_false_when_under_limit(self):
        deps = LimitDeps(limit=3)
        assert deps.at_limit() is False

    def test_increments_count_on_each_call(self):
        deps = LimitDeps(limit=5)
        deps.at_limit()
        deps.at_limit()
        assert deps._count == 2

    def test_returns_true_when_limit_reached(self):
        deps = LimitDeps(limit=2)
        deps.at_limit()  # count → 1, returns False
        deps.at_limit()  # count → 2, returns False
        assert deps.at_limit() is True  # at limit, returns True

    def test_count_does_not_exceed_limit(self):
        deps = LimitDeps(limit=1)
        deps.at_limit()  # count → 1, returns False
        deps.at_limit()  # at limit, count stays 1
        deps.at_limit()  # at limit, count stays 1
        assert deps._count == 1

    def test_zero_limit_always_blocked(self):
        deps = LimitDeps(limit=0)
        assert deps.at_limit() is True


class TestCheckEnv:
    """check_env validates required env vars and applies schema defaults."""

    def test_succeeds_when_all_required_vars_present(self):
        """With the env vars set in conftest, check_env should complete silently."""
        check_env()  # should not raise or exit

    def test_applies_schema_defaults(self, tmp_path, monkeypatch):
        """check_env sets os.environ defaults declared in the schema."""
        schema = {
            "env": {"MY_DEFAULT_VAR": {"required": False, "default": "expected-value"}}
        }
        schema_file = tmp_path / "env.schema.json"
        schema_file.write_text(json.dumps(schema))

        monkeypatch.delenv("MY_DEFAULT_VAR", raising=False)

        # Redirect the schema path by monkeypatching the module-level pathlib
        import librarian._utils as utils_mod
        import pathlib

        original_path_class = pathlib.Path

        class PatchedPath(original_path_class):
            def __truediv__(self, key):
                result = super().__truediv__(key)
                if key == "env.schema.json":
                    return schema_file
                return result

        monkeypatch.setattr(
            utils_mod, "pathlib", type("pathlib", (), {"Path": PatchedPath})()
        )

        check_env()
        assert os.environ.get("MY_DEFAULT_VAR") == "expected-value"

    def test_missing_required_exits(self, monkeypatch):
        """When a required env var is absent, check_env should exit with code 1."""
        monkeypatch.delenv("VLLM_API_KEY")
        with pytest.raises(SystemExit) as e:
            check_env()
        assert e.value.code == 1
