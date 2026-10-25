"""Portable regression for resolving the active initiative in installed skills."""

import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from render_skill import RenderError, render  # noqa: E402


class InitiativeRenderingTests(unittest.TestCase):
    def test_active_initiative_is_resolved_and_keys_immutable_generations(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            custom = root / "_bmad" / "custom"
            custom.mkdir(parents=True)
            (root / "_bmad" / "config.toml").write_text(
                '[core]\noutput_folder = "{project-root}/_bmad-output"\n', encoding="utf-8"
            )
            skill = root / "fixture-skill"
            skill.mkdir()
            (skill / "workflow.md").write_text("{{ initiative_folder }}\n", encoding="utf-8")
            default = render(root, skill)
            self.assertEqual(default.read_text(), f"{root}/_bmad-output\n")
            user = custom / "config.user.toml"
            user.write_text('[core]\nactive_initiative = "initiative-existing"\n', encoding="utf-8")
            active = render(root, skill)
            self.assertEqual(active.read_text(), f"{root}/_bmad-output/initiative-existing\n")
            self.assertNotEqual(active, default)
            self.assertEqual(render(root, skill), active)
            manifest = json.loads((active.parent / "manifest.json").read_text())
            self.assertEqual(
                manifest["inputs"]["resolved_values"]["initiative_folder"],
                f"{root}/_bmad-output/initiative-existing",
            )
            self.assertEqual(default.read_text(), f"{root}/_bmad-output\n")
            for invalid in ('""', "42"):
                user.write_text(f"[core]\nactive_initiative = {invalid}\n", encoding="utf-8")
                with self.subTest(invalid=invalid), self.assertRaises(RenderError):
                    render(root, skill)
            # Unused derived values must not require config or affect the generation identity.
            (skill / "workflow.md").write_text("plain\n", encoding="utf-8")
            first = render(root, skill)
            user.write_text('[core]\nactive_initiative = "another"\n', encoding="utf-8")
            self.assertEqual(render(root, skill), first)


if __name__ == "__main__":
    unittest.main()
