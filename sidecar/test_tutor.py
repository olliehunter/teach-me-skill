"""
Tests for the tutor grounding assembler and POST /tutor endpoint.

Covers:
  - assemble_grounding() with a fixture workspace (pure function)
  - build_system_prompt() structural checks (pure function)
  - no-key path via POST /tutor (FastAPI TestClient, no real API call)
  - SDK call kwargs via POST /tutor (mocked Anthropic client)
"""

from __future__ import annotations

import json
import os
import sys
import textwrap
from pathlib import Path
from typing import Optional
from unittest.mock import MagicMock, patch

import pytest

# Ensure the sidecar directory is on the path so `import tutor` works.
sys.path.insert(0, str(Path(__file__).parent))


# ---------------------------------------------------------------------------
# Fixture: minimal workspace on the filesystem
# ---------------------------------------------------------------------------

FIXTURE_WORKSPACE = (
    Path(__file__).parent.parent / ".docs" / "fixtures" / "example-course"
)


@pytest.fixture(scope="module")
def workspace(tmp_path_factory):
    """
    Build a minimal in-memory-style workspace in a temp directory.

    Mirrors the example-course fixture closely so grounding assembly can be
    tested without touching the real fixture path.
    """
    root = tmp_path_factory.mktemp("workspace")

    # MISSION.md
    (root / "MISSION.md").write_text(
        textwrap.dedent("""\
            # Mission
            **Learner:** Test User
            **Why:** Understand interest rates.
            **Success looks like:** Explain the base rate and lags.
        """),
        encoding="utf-8",
    )

    # sources/s1.md
    (root / "sources").mkdir()
    (root / "sources" / "s1.md").write_text(
        textwrap.dedent("""\
            # Source s1 — Bank Rate explainer
            - The base rate is the rate paid to commercial banks.
            - Changes take one to two years to fully bite (long and variable lags).
        """),
        encoding="utf-8",
    )

    # lessons/0001-interest-rate-lags.json
    (root / "lessons").mkdir()
    lesson = {
        "schema_version": "1.0",
        "lesson_id": "0001",
        "slug": "interest-rate-lags",
        "title": "Why Rate Changes Take Time",
        "objective": "Explain what the base rate is and why changes act with lags.",
        "sources": [
            {
                "id": "s1",
                "title": "Bank Rate",
                "url": "https://example.com",
                "excerpt_ref": "sources/s1.md",
                "accessed": "2026-07-01",
                "tier": 1,
                "trust_rationale": "Primary source.",
            }
        ],
        "beats": [
            {
                "id": "b1",
                "type": "narration",
                "narration": "The base rate is the interest rate a central bank pays.",
                "audio": "assets/audio/0001-b1.wav",
                "audio_duration_s": None,
                "visual": {"kind": "none", "alt": ""},
                "citations": ["s1"],
            },
            {
                "id": "b2",
                "type": "narration",
                "narration": "A higher rate makes borrowing more expensive.",
                "audio": "assets/audio/0001-b2.wav",
                "audio_duration_s": None,
                "visual": {"kind": "none", "alt": ""},
                "citations": ["s1"],
            },
            {
                "id": "b3",
                "type": "quiz",
                "format": "single_choice",
                "narration_intro": "Quick check before we move on.",
                "audio_intro": "assets/audio/0001-b3-intro.wav",
                "prompt": "Why don't rate changes act instantly?",
                "options": [
                    {"id": "a", "text": "Loans, wages and prices adjust gradually"},
                    {"id": "b", "text": "Banks are required to wait"},
                ],
                "answer": "a",
                "explanation": "Correct.",
                "audio_explanation": "assets/audio/0001-b3-explain.wav",
                "citations": ["s1"],
            },
        ],
    }
    (root / "lessons" / "0001-interest-rate-lags.json").write_text(
        json.dumps(lesson, indent=2), encoding="utf-8"
    )

    return root


# ---------------------------------------------------------------------------
# Tests: assemble_grounding() — pure function
# ---------------------------------------------------------------------------


class TestAssembleGrounding:
    def test_mission_is_loaded(self, workspace):
        from tutor import assemble_grounding

        ctx = assemble_grounding(str(workspace), "0001")
        assert "interest rates" in ctx["mission"].lower()

    def test_objective_is_loaded(self, workspace):
        from tutor import assemble_grounding

        ctx = assemble_grounding(str(workspace), "0001")
        assert "base rate" in ctx["objective"].lower()

    def test_narrations_include_all_beat_texts(self, workspace):
        from tutor import assemble_grounding

        ctx = assemble_grounding(str(workspace), "0001")
        narrations = ctx["narrations"]
        # Two narration beats + one quiz narration_intro
        assert len(narrations) == 3
        assert any("base rate" in n.lower() for n in narrations)
        assert any("quick check" in n.lower() for n in narrations)

    def test_source_excerpts_loaded(self, workspace):
        from tutor import assemble_grounding

        ctx = assemble_grounding(str(workspace), "0001")
        excerpts = ctx["source_excerpts"]
        assert "s1" in excerpts
        assert "lags" in excerpts["s1"].lower()

    def test_missing_mission_raises(self, tmp_path):
        from tutor import assemble_grounding

        # Workspace with no MISSION.md
        (tmp_path / "lessons").mkdir()
        with pytest.raises(FileNotFoundError, match="MISSION.md"):
            assemble_grounding(str(tmp_path), "0001")

    def test_missing_lesson_raises(self, workspace):
        from tutor import assemble_grounding

        with pytest.raises(FileNotFoundError, match="lesson_id"):
            assemble_grounding(str(workspace), "9999")

    def test_example_course_fixture(self):
        """Smoke-test against the real example-course fixture (if present)."""
        if not FIXTURE_WORKSPACE.exists():
            pytest.skip("Example-course fixture not present")
        from tutor import assemble_grounding

        ctx = assemble_grounding(str(FIXTURE_WORKSPACE), "0001")
        assert ctx["mission"]
        assert ctx["objective"]
        assert ctx["narrations"]
        assert ctx["source_excerpts"]


# ---------------------------------------------------------------------------
# Tests: build_system_prompt() — pure function
# ---------------------------------------------------------------------------


class TestBuildSystemPrompt:
    def test_contains_mission(self, workspace):
        from tutor import assemble_grounding, build_system_prompt

        ctx = assemble_grounding(str(workspace), "0001")
        prompt = build_system_prompt(**ctx)
        assert "interest rates" in prompt.lower()

    def test_contains_objective(self, workspace):
        from tutor import assemble_grounding, build_system_prompt

        ctx = assemble_grounding(str(workspace), "0001")
        prompt = build_system_prompt(**ctx)
        assert ctx["objective"] in prompt

    def test_contains_all_narrations(self, workspace):
        from tutor import assemble_grounding, build_system_prompt

        ctx = assemble_grounding(str(workspace), "0001")
        prompt = build_system_prompt(**ctx)
        for narration in ctx["narrations"]:
            assert narration in prompt

    def test_contains_source_excerpts(self, workspace):
        from tutor import assemble_grounding, build_system_prompt

        ctx = assemble_grounding(str(workspace), "0001")
        prompt = build_system_prompt(**ctx)
        assert "s1" in prompt
        assert "lags" in prompt.lower()

    def test_source_locked_instruction_present(self, workspace):
        from tutor import assemble_grounding, build_system_prompt

        ctx = assemble_grounding(str(workspace), "0001")
        prompt = build_system_prompt(**ctx)
        assert "ONLY" in prompt or "only" in prompt


# ---------------------------------------------------------------------------
# Fixture: FastAPI TestClient
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def server_client():
    """TestClient for the sidecar FastAPI app (no real sidecar process needed)."""
    import importlib

    import server as srv

    importlib.reload(srv)
    from fastapi.testclient import TestClient

    return TestClient(srv.app)


# ---------------------------------------------------------------------------
# Tests: no-key path — structured response, no crash
# ---------------------------------------------------------------------------


class TestTutorNoKey:
    def test_no_key_returns_200(self, server_client, workspace):
        env_without_key = {k: v for k, v in os.environ.items() if k != "ANTHROPIC_API_KEY"}
        with patch.dict(os.environ, env_without_key, clear=True):
            r = server_client.post(
                "/tutor",
                json={
                    "question": "What is the base rate?",
                    "workspace_path": str(workspace),
                    "lesson_id": "0001",
                },
            )
        assert r.status_code == 200

    def test_no_key_body_has_correct_shape(self, server_client, workspace):
        env_without_key = {k: v for k, v in os.environ.items() if k != "ANTHROPIC_API_KEY"}
        with patch.dict(os.environ, env_without_key, clear=True):
            r = server_client.post(
                "/tutor",
                json={
                    "question": "What is the base rate?",
                    "workspace_path": str(workspace),
                    "lesson_id": "0001",
                },
            )
        body = r.json()
        assert "answer_text" in body
        assert "used_sources" in body
        assert isinstance(body["used_sources"], list)

    def test_no_key_sets_no_key_flag(self, server_client, workspace):
        env_without_key = {k: v for k, v in os.environ.items() if k != "ANTHROPIC_API_KEY"}
        with patch.dict(os.environ, env_without_key, clear=True):
            r = server_client.post(
                "/tutor",
                json={
                    "question": "What is the base rate?",
                    "workspace_path": str(workspace),
                    "lesson_id": "0001",
                },
            )
        assert r.json()["no_key"] is True

    def test_no_key_used_sources_empty(self, server_client, workspace):
        env_without_key = {k: v for k, v in os.environ.items() if k != "ANTHROPIC_API_KEY"}
        with patch.dict(os.environ, env_without_key, clear=True):
            r = server_client.post(
                "/tutor",
                json={
                    "question": "What is the base rate?",
                    "workspace_path": str(workspace),
                    "lesson_id": "0001",
                },
            )
        assert r.json()["used_sources"] == []


# ---------------------------------------------------------------------------
# Tests: SDK call kwargs — mocked Anthropic client
# ---------------------------------------------------------------------------


def _make_mock_response(answer_text: str, used_sources: list[str]):
    """Build a minimal mock ParsedMessage-like object."""
    from tutor import TutorAnswer

    parsed = TutorAnswer(answer_text=answer_text, used_sources=used_sources)

    mock_response = MagicMock()
    mock_response.parsed_output = parsed
    return mock_response


class TestTutorSDKCall:
    def _post_tutor(self, server_client, workspace, extra_body: Optional[dict] = None):
        body = {
            "question": "Why do rate changes take time?",
            "workspace_path": str(workspace),
            "lesson_id": "0001",
        }
        if extra_body:
            body.update(extra_body)
        return server_client.post("/tutor", json=body)

    def test_calls_messages_parse(self, server_client, workspace):
        """messages.parse() is invoked (not messages.create)."""
        mock_response = _make_mock_response("Because of lags.", ["s1"])

        with patch.dict(os.environ, {"ANTHROPIC_API_KEY": "sk-test-key"}):
            with patch("tutor._anthropic.Anthropic") as MockClient:
                MockClient.return_value.messages.parse.return_value = mock_response
                r = self._post_tutor(server_client, workspace)

        assert r.status_code == 200
        MockClient.return_value.messages.parse.assert_called_once()

    def test_default_model_is_sonnet(self, server_client, workspace):
        """Default model ID is claude-sonnet-4-6."""
        mock_response = _make_mock_response("Lags exist.", ["s1"])

        with patch.dict(os.environ, {"ANTHROPIC_API_KEY": "sk-test-key"}):
            with patch("tutor._anthropic.Anthropic") as MockClient:
                MockClient.return_value.messages.parse.return_value = mock_response
                self._post_tutor(server_client, workspace)

        call_kwargs = MockClient.return_value.messages.parse.call_args
        assert call_kwargs.kwargs.get("model") == "claude-sonnet-4-6"

    def test_model_override(self, server_client, workspace):
        """model field in request body overrides the default."""
        mock_response = _make_mock_response("Answer.", [])

        with patch.dict(os.environ, {"ANTHROPIC_API_KEY": "sk-test-key"}):
            with patch("tutor._anthropic.Anthropic") as MockClient:
                MockClient.return_value.messages.parse.return_value = mock_response
                self._post_tutor(server_client, workspace, {"model": "claude-opus-4-8"})

        call_kwargs = MockClient.return_value.messages.parse.call_args
        assert call_kwargs.kwargs.get("model") == "claude-opus-4-8"

    def test_adaptive_thinking_sent(self, server_client, workspace):
        """thinking={type: adaptive} is passed; no budget_tokens."""
        mock_response = _make_mock_response("Answer.", [])

        with patch.dict(os.environ, {"ANTHROPIC_API_KEY": "sk-test-key"}):
            with patch("tutor._anthropic.Anthropic") as MockClient:
                MockClient.return_value.messages.parse.return_value = mock_response
                self._post_tutor(server_client, workspace)

        call_kwargs = MockClient.return_value.messages.parse.call_args.kwargs
        thinking = call_kwargs.get("thinking")
        assert thinking is not None, "thinking param missing"
        assert thinking.get("type") == "adaptive"
        assert "budget_tokens" not in thinking, "budget_tokens must not be set"

    def test_no_sampling_params(self, server_client, workspace):
        """temperature / top_p / top_k are not passed."""
        mock_response = _make_mock_response("Answer.", [])

        with patch.dict(os.environ, {"ANTHROPIC_API_KEY": "sk-test-key"}):
            with patch("tutor._anthropic.Anthropic") as MockClient:
                MockClient.return_value.messages.parse.return_value = mock_response
                self._post_tutor(server_client, workspace)

        call_kwargs = MockClient.return_value.messages.parse.call_args.kwargs
        assert "temperature" not in call_kwargs, "temperature must not be set"
        assert "top_p" not in call_kwargs, "top_p must not be set"
        assert "top_k" not in call_kwargs, "top_k must not be set"

    def test_output_format_is_tutor_answer(self, server_client, workspace):
        """output_format=TutorAnswer is passed for structured output."""
        from tutor import TutorAnswer

        mock_response = _make_mock_response("Answer.", [])

        with patch.dict(os.environ, {"ANTHROPIC_API_KEY": "sk-test-key"}):
            with patch("tutor._anthropic.Anthropic") as MockClient:
                MockClient.return_value.messages.parse.return_value = mock_response
                self._post_tutor(server_client, workspace)

        call_kwargs = MockClient.return_value.messages.parse.call_args.kwargs
        assert call_kwargs.get("output_format") is TutorAnswer

    def test_response_shape(self, server_client, workspace):
        """Response contains answer_text and used_sources from Claude's reply."""
        mock_response = _make_mock_response(
            "Rate changes take time because of long and variable lags.", ["s1"]
        )

        with patch.dict(os.environ, {"ANTHROPIC_API_KEY": "sk-test-key"}):
            with patch("tutor._anthropic.Anthropic") as MockClient:
                MockClient.return_value.messages.parse.return_value = mock_response
                r = self._post_tutor(server_client, workspace)

        body = r.json()
        assert body["answer_text"] == "Rate changes take time because of long and variable lags."
        assert body["used_sources"] == ["s1"]
        assert body["no_key"] is False

    def test_api_key_sent_to_client(self, server_client, workspace):
        """ANTHROPIC_API_KEY env var is passed to the Anthropic client constructor."""
        mock_response = _make_mock_response("Answer.", [])

        with patch.dict(os.environ, {"ANTHROPIC_API_KEY": "sk-my-secret-key"}):
            with patch("tutor._anthropic.Anthropic") as MockClient:
                MockClient.return_value.messages.parse.return_value = mock_response
                self._post_tutor(server_client, workspace)

        MockClient.assert_called_once_with(api_key="sk-my-secret-key")
