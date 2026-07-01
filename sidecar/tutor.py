"""
teach-me Player — Tutor grounding + Claude call.

Pure functions for grounding assembly and a single call_tutor() entry-point used by
POST /tutor in server.py. Keeping pure logic here makes it trivially testable without
a live server.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Optional

import anthropic as _anthropic  # module-level so tests can patch tutor._anthropic.Anthropic
from pydantic import BaseModel

TUTOR_MODEL_DEFAULT = "claude-sonnet-4-6"


# ---------------------------------------------------------------------------
# Internal structured-output model (used with messages.parse)
# ---------------------------------------------------------------------------


class TutorAnswer(BaseModel):
    """Structured output shape returned by Claude."""

    answer_text: str
    used_sources: list[str]


# ---------------------------------------------------------------------------
# Public result type
# ---------------------------------------------------------------------------


class TutorResult(BaseModel):
    """Full result returned by call_tutor(), including optional no_key flag."""

    answer_text: str
    used_sources: list[str]
    no_key: bool = False


# ---------------------------------------------------------------------------
# Grounding assembly (pure, testable)
# ---------------------------------------------------------------------------


def assemble_grounding(workspace_path: str, lesson_id: str) -> dict:
    """
    Assemble grounding context from workspace files.

    Reads MISSION.md, the lesson JSON (matched by lesson_id prefix), all beat
    narrations, and the union of cited source excerpt files.

    Args:
        workspace_path: Absolute path to the course workspace folder.
        lesson_id: The lesson ID string (e.g. "0001").

    Returns:
        dict with keys:
            mission (str): Contents of MISSION.md.
            objective (str): The lesson's objective string.
            narrations (list[str]): All narration texts in beat order.
            source_excerpts (dict[str, str]): Mapping of source_id to excerpt text.

    Raises:
        FileNotFoundError: If MISSION.md or the lesson JSON cannot be found.
    """
    workspace = Path(workspace_path)

    # --- MISSION.md ---
    mission_path = workspace / "MISSION.md"
    if not mission_path.exists():
        raise FileNotFoundError(f"MISSION.md not found at {mission_path}")
    mission_text = mission_path.read_text(encoding="utf-8")

    # --- Lesson JSON (lessons/{lesson_id}-*.json) ---
    lesson_files = sorted(workspace.glob(f"lessons/{lesson_id}-*.json"))
    if not lesson_files:
        raise FileNotFoundError(
            f"No lesson JSON found for lesson_id={lesson_id!r} in {workspace / 'lessons'}"
        )
    lesson_data = json.loads(lesson_files[0].read_text(encoding="utf-8"))

    objective: str = lesson_data.get("objective", "")

    # --- All beat narrations (in beat order) ---
    narrations: list[str] = []
    for beat in lesson_data.get("beats", []):
        # narration beats have a top-level "narration" field
        if beat.get("narration"):
            narrations.append(beat["narration"])
        # quiz and contested beats may have a "narration_intro"
        if beat.get("narration_intro"):
            narrations.append(beat["narration_intro"])
        # contested beats have per-position narrations
        for position in beat.get("positions", []):
            if position.get("narration"):
                narrations.append(position["narration"])

    # --- Source excerpts: union of all lesson sources' excerpt_refs ---
    source_excerpts: dict[str, str] = {}
    for source in lesson_data.get("sources", []):
        source_id = source.get("id")
        excerpt_ref = source.get("excerpt_ref")
        if source_id and excerpt_ref:
            excerpt_path = workspace / excerpt_ref
            if excerpt_path.exists():
                source_excerpts[source_id] = excerpt_path.read_text(encoding="utf-8")

    return {
        "mission": mission_text,
        "objective": objective,
        "narrations": narrations,
        "source_excerpts": source_excerpts,
    }


def build_system_prompt(
    mission: str,
    objective: str,
    narrations: list[str],
    source_excerpts: dict[str, str],
) -> str:
    """
    Build the source-locked system prompt from assembled grounding context.

    The resulting prompt instructs Claude to answer only from the provided
    sources, and to say so plainly (with empty used_sources) if unsupported.

    Args:
        mission: Content of MISSION.md.
        objective: The lesson objective.
        narrations: All beat narration texts.
        source_excerpts: Mapping of source_id to excerpt text.

    Returns:
        System prompt string ready to pass to the Claude API.
    """
    lines: list[str] = [
        "You are a tutor for a self-paced learning course. "
        "Answer the learner's question using ONLY the context provided below. "
        "Do not draw on outside knowledge.",
        "",
        "If the answer is not supported by the provided context, say so plainly "
        "and offer to flag the question for the course author. "
        "In that case, set used_sources to an empty list.",
        "",
        "## Learner Mission",
        mission.strip(),
        "",
        "## Lesson Objective",
        objective.strip(),
        "",
        "## Lesson Content (all beat narrations)",
    ]
    for i, narration in enumerate(narrations, 1):
        lines.append(f"{i}. {narration}")
    lines.append("")
    lines.append("## Cited Source Excerpts")
    for source_id, excerpt in source_excerpts.items():
        lines.append(f"### Source {source_id}")
        lines.append(excerpt.strip())
        lines.append("")
    lines += [
        "---",
        "Respond with your answer and, in used_sources, only the source IDs "
        "(e.g. 's1', 's2') from the excerpts above that you actually used.",
    ]
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Claude call
# ---------------------------------------------------------------------------


def call_tutor(
    *,
    question: str,
    workspace_path: str,
    lesson_id: str,
    beat_id: Optional[str] = None,
    model: Optional[str] = None,
) -> TutorResult:
    """
    Assemble grounding and call Claude for a tutor answer.

    Returns a TutorResult regardless of whether the API key is present — never
    raises on a missing key. If ANTHROPIC_API_KEY is absent, no_key=True is set
    and the caller shows the learner an "add your key" message.

    Args:
        question: The learner's question.
        workspace_path: Absolute path to the course workspace.
        lesson_id: The lesson ID (e.g. "0001").
        beat_id: Current beat ID (reserved for future use; not used in v1 grounding).
        model: Claude model ID override; defaults to TUTOR_MODEL_DEFAULT.

    Returns:
        TutorResult with answer_text, used_sources, and no_key flag.
    """
    api_key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if not api_key:
        return TutorResult(
            answer_text=(
                "No Anthropic API key found. "
                "Set ANTHROPIC_API_KEY in your environment to enable the tutor."
            ),
            used_sources=[],
            no_key=True,
        )

    resolved_model = (model or "").strip() or TUTOR_MODEL_DEFAULT

    # Assemble grounding context from workspace files
    grounding = assemble_grounding(workspace_path, lesson_id)
    system_prompt = build_system_prompt(
        mission=grounding["mission"],
        objective=grounding["objective"],
        narrations=grounding["narrations"],
        source_excerpts=grounding["source_excerpts"],
    )

    # Call Claude — structured output via messages.parse(); adaptive thinking;
    # no sampling params (temperature / top_p / top_k / budget_tokens are
    # forbidden on claude-sonnet-4-6 and later).
    client = _anthropic.Anthropic(api_key=api_key)
    response = client.messages.parse(
        model=resolved_model,
        max_tokens=2048,
        thinking={"type": "adaptive"},
        system=system_prompt,
        messages=[{"role": "user", "content": question}],
        output_format=TutorAnswer,
    )
    answer: TutorAnswer = response.parsed_output  # type: ignore[assignment]

    return TutorResult(
        answer_text=answer.answer_text,
        used_sources=answer.used_sources,
    )
