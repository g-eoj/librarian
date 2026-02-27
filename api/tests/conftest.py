"""
Pytest configuration and shared fixtures.

This module runs before any test file is imported, so it's the right place
to set required environment variables and mock heavy module-level imports.
"""

import os
import sys
from unittest.mock import MagicMock

# ---------------------------------------------------------------------------
# Required environment variables — must be set before librarian is imported.
# ---------------------------------------------------------------------------
os.environ.setdefault("VLLM_BASE_URL", "http://localhost:8000/v1")
os.environ.setdefault("VLLM_API_KEY", "test-api-key")
os.environ.setdefault("VLLM_MODEL_NAME", "test-model")
os.environ.setdefault("SERPER_API_TOKEN", "test-serper-token")

# ---------------------------------------------------------------------------
# Mock `transformers` before _tools.py is imported.
# _tools.py calls AutoTokenizer.from_pretrained() at the module level, which
# would try to download a model from HuggingFace. Replacing the whole module
# in sys.modules prevents that download in all test runs.
# ---------------------------------------------------------------------------
if "transformers" not in sys.modules:
    sys.modules["transformers"] = MagicMock()
