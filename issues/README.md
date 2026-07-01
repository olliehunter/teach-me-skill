# teach-me Player — Issues

Tracer-bullet issues broken out from `../.docs/PLAN.md` (decisions in `../.docs/DECISIONS.md`). Each file
is one independently-grabbable vertical slice with YAML frontmatter (`id`, `title`, `type`, `status`,
`blocked_by`). All are AFK except **011** (HITL — human confirms bundled-app audio).

## Dependency order

```
001 sidecar → kokoro-onnx + POST /speak        (no blockers)
├── 002 app scaffold + spawn (Checkpoint A)
│   └── 004 open workspace → course screen      (soft-needs 003)
│       └── 005 narration beat renders + plays  (+003)
│           └── 006 transport + progress + resume
│               ├── 007 quiz beat
│               └── 008 contested beat + fixture (+003)
├── 003 render_audio → kokoro-onnx + validate
└── 009 /tutor endpoint
    └── 010 tutor box wired end-to-end          (+005)

011 bundle (Checkpoint B) + acceptance          (blocked by 006, 007, 008, 010, 003) — HITL
```

## Suggested start set (unblocked now)

- **001** — sidecar port (critical path; unblocks everything)

Once 001 lands, **003** and **009** can proceed in parallel with the **002 → 004 → 005 → 006** UI spine.
