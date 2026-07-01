"""
Validator for a teach-me workspace. Asserts the output guarantees from the beat
schema so a broken lesson never reaches the Player.

    python validate.py            # validates the workspace in the current dir
    python validate.py <path>     # validates the workspace at <path>
    python validate.py --require-audio   # also fail if audio files are missing

Exit code 0 = OK (warnings allowed), 1 = errors found.
"""

import json
import sys
from pathlib import Path

NARRATION_WORD_SOFT_MAX = 80   # ~30s at a calm pace; above this we warn
DURATION_OK = (5.0, 35.0)      # hard-ish bounds; we warn outside 10-30

errors, warnings = [], []


def err(m): errors.append(m)
def warn(m): warnings.append(m)


def validate(root: Path, require_audio: bool):
    course_path = root / "course.json"
    if not course_path.exists():
        err(f"missing course.json at {root}")
        return
    course = json.loads(course_path.read_text())
    if "schema_version" not in course:
        err("course.json: missing schema_version")

    for entry in course.get("lessons", []):
        matches = list((root / "lessons").glob(f"{entry['lesson_id']}-*.json"))
        if not matches:
            err(f"course lists lesson {entry['lesson_id']} but no lessons/{entry['lesson_id']}-*.json exists")
            continue
        validate_lesson(root, matches[0], require_audio)


def validate_lesson(root: Path, path: Path, require_audio: bool):
    L = json.loads(path.read_text())
    src_ids = {s["id"] for s in L.get("sources", [])}

    # sources: excerpt files must exist (tutor grounding) + Tier 1/2 trust bar
    for s in L.get("sources", []):
        sid = s.get("id")
        if "excerpt_ref" not in s:
            err(f"{path.name}: source {sid} has no excerpt_ref")
        elif not (root / s["excerpt_ref"]).exists():
            err(f"{path.name}: source excerpt missing: {s['excerpt_ref']}")
        if s.get("tier") not in (1, 2):
            err(f"{path.name}: source {sid} tier {s.get('tier')!r} — only Tier 1/2 may back a taught claim")
        if not s.get("trust_rationale"):
            warn(f"{path.name}: source {sid} has no trust_rationale (trust should be auditable)")

    if not L.get("beats"):
        err(f"{path.name}: lesson has no beats")

    for b in L.get("beats", []):
        bid = b.get("id", "?")
        tag = f"{path.name}:{bid}"

        # every content beat must be source-traceable. Contested beats carry their
        # citations per-position (checked in that branch), not at the top level.
        if b["type"] != "contested":
            if not b.get("citations"):
                err(f"{tag}: no citations — every claim must be source-traceable")
            for c in b.get("citations", []):
                if c not in src_ids:
                    err(f"{tag}: citation '{c}' not found in lesson sources")

        if b["type"] == "narration":
            # guarantee 1: audio exists + duration matches
            check_audio(root, tag, b.get("audio"), require_audio, b.get("audio_duration_s"))
            # guarantee 2: visual exists
            check_visual(root, tag, b.get("visual"))
            # guarantee 3: beat sized for working memory
            wc = len(b.get("narration", "").split())
            if wc > NARRATION_WORD_SOFT_MAX:
                warn(f"{tag}: narration is {wc} words — consider splitting into smaller beats")
            d = b.get("audio_duration_s")
            if isinstance(d, (int, float)):
                if not (DURATION_OK[0] <= d <= DURATION_OK[1]):
                    err(f"{tag}: audio_duration_s {d}s outside {DURATION_OK}")
                elif not (10 <= d <= 30):
                    warn(f"{tag}: audio_duration_s {d}s outside the 10-30s target")

        elif b["type"] == "quiz":
            opts = {o["id"] for o in b.get("options", [])}
            if b.get("answer") not in opts:
                err(f"{tag}: answer '{b.get('answer')}' is not one of the options")
            if len(opts) < 2:
                err(f"{tag}: quiz needs at least 2 options")
            # option length parity (Matt's rule): warn if lengths vary a lot
            lengths = [len(o["text"]) for o in b.get("options", [])]
            if lengths and (max(lengths) - min(lengths)) > 18:
                warn(f"{tag}: option lengths vary by {max(lengths)-min(lengths)} chars — may leak the answer")
            check_audio(root, tag + ":intro", b.get("audio_intro"), require_audio, None)
            check_audio(root, tag + ":explain", b.get("audio_explanation"), require_audio, None)

        elif b["type"] == "contested":
            positions = b.get("positions", [])
            if len(positions) < 2:
                err(f"{tag}: contested beat needs >=2 positions")
            for i, p in enumerate(positions):
                ptag = f"{tag}:p{i+1}"
                if not p.get("citations"):
                    err(f"{ptag}: position has no citation — each side must be independently sourced")
                for c in p.get("citations", []):
                    if c not in src_ids:
                        err(f"{ptag}: citation '{c}' not found in lesson sources")
                check_audio(root, ptag, p.get("audio"), require_audio, p.get("audio_duration_s"))
            if b.get("audio_intro"):
                check_audio(root, tag + ":intro", b.get("audio_intro"), require_audio, None)
            if b.get("visual"):
                check_visual(root, tag, b.get("visual"))
        else:
            err(f"{tag}: unknown beat type '{b['type']}'")


def check_audio(root, tag, rel, require_audio, declared_dur):
    if not rel:
        return
    p = root / rel
    if not p.exists():
        (err if require_audio else warn)(f"{tag}: audio not rendered yet: {rel}")
        return
    # if soundfile is available, verify declared duration matches reality
    if declared_dur is not None:
        try:
            import soundfile as sf
            info = sf.info(str(p))
            actual = info.frames / info.samplerate
            if abs(actual - declared_dur) > 0.3:
                err(f"{tag}: audio_duration_s {declared_dur}s != actual {actual:.2f}s")
        except Exception:
            pass  # soundfile not installed during a structure-only check


def check_visual(root, tag, visual):
    if not visual:
        err(f"{tag}: narration beat has no visual")
        return
    kind = visual.get("kind")
    if kind in ("svg_file", "html_file", "image_file"):
        if not visual.get("src"):
            err(f"{tag}: visual.kind {kind} but no src")
        elif not (root / visual["src"]).exists():
            err(f"{tag}: visual file missing: {visual['src']}")
    elif kind == "inline_svg":
        if not visual.get("svg"):
            err(f"{tag}: inline_svg but no svg content")
    elif kind == "none":
        pass
    else:
        err(f"{tag}: unknown visual.kind '{kind}'")
    if visual.get("kind") != "none" and not visual.get("alt"):
        warn(f"{tag}: visual has no alt text (accessibility)")


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if a != "--require-audio"]
    require_audio = "--require-audio" in sys.argv
    root = Path(args[0]) if args else Path(".")
    validate(root, require_audio)

    for w in warnings:
        print(f"WARN  {w}")
    for e in errors:
        print(f"ERROR {e}")
    print(f"\n{len(errors)} error(s), {len(warnings)} warning(s)")
    sys.exit(1 if errors else 0)
