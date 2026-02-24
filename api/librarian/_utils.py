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

import json
import os
import pathlib
import sys

from dataclasses import dataclass


@dataclass
class LimitDeps:
    """Limit tool calls."""

    limit: int
    _count: int = 0

    def at_limit(self) -> bool:
        if self.limit > self._count:
            self._count += 1
            return False
        else:
            return True


def check_env() -> None:
    """Validate required env vars. Applies schema defaults."""
    schema_path = pathlib.Path(__file__).parent.parent.parent / "env.schema.json"
    schema = json.loads(schema_path.read_text())["env"]
    missing = []
    for name, config in schema.items():
        if os.environ.get(name) is not None:
            continue
        default = config.get("default")
        if default is not None:
            os.environ[name] = default
        elif config.get("required"):
            missing.append((name, config))
    if missing:
        lines = ["Error: missing required environment variables:"]
        for name, config in missing:
            line = f"  {name}"
            if desc := config.get("description"):
                line += f" — {desc}"
            if link := config.get("link"):
                line += f"\n    {link}"
            lines.append(line)
        print("\n".join(lines), file=sys.stderr)
        sys.exit(1)
