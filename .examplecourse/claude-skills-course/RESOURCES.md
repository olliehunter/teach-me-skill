# Creating Claude Skills — Resources

All primary/authoritative (Tier 1). Every taught claim in this course traces to a cached
excerpt of one of these under `sources/`.

## Knowledge

- [Agent Skills — Overview (Claude Platform Docs)](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview) — Tier 1
  Anthropic's canonical reference for what a Skill is, the three loading levels, where
  Skills work, frontmatter field rules, and runtime constraints. Use for: architecture,
  metadata rules, surface differences. Cached: `sources/s1.md`.
- [Skill authoring best practices (Claude Platform Docs)](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices) — Tier 1
  Deep authoring guidance: conciseness, degrees of freedom, progressive-disclosure patterns,
  descriptions, workflows/feedback loops, evaluation-driven development. Use for: craft.
  Cached: `sources/s2.md`.
- [Equipping agents for the real world with Agent Skills (Anthropic Engineering)](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills) — Tier 1
  The design rationale — onboarding-guide metaphor, progressive disclosure levels, code as
  tools, the open-standard announcement. Use for: the "why". Cached: `sources/s3.md`.
- [anthropics/skills repository README + template (GitHub)](https://github.com/anthropics/skills) — Tier 1
  Official examples, the minimal skill template, and Claude Code plugin-marketplace install
  commands. Use for: the starter template and repo layout. Cached: `sources/s4.md`.
- [Extend Claude with skills (Claude Code Docs)](https://code.claude.com/docs/en/skills) — Tier 1
  Claude Code's skill surface and its extensions to the standard: `disable-model-invocation`,
  `allowed-tools`, `context: fork`, dynamic context injection, skill locations/precedence.
  Use for: Claude Code specifics. Cached: `sources/s5.md`.
- [Create plugins (Claude Code Docs)](https://code.claude.com/docs/en/plugins) — Tier 1
  Plugin structure, `plugin.json` manifest, components (skills/agents/hooks/MCP/LSP),
  marketplaces, standalone-vs-plugin decision. Use for: plugin packaging. Cached: `sources/s6.md`.
- [MCPB Manifest.json Spec (modelcontextprotocol/mcpb, GitHub)](https://github.com/modelcontextprotocol/mcpb/blob/main/MANIFEST.md) — Tier 1
  The authoritative `manifest.json` schema (v0.3): required fields, server types, user_config,
  variable substitution, compatibility. Use for: MCPB manifest details. Cached: `sources/s7.md`.
- [Desktop Extensions: One-click MCP server installation (Anthropic Engineering)](https://www.anthropic.com/engineering/desktop-extensions) — Tier 1
  Why MCPB exists, the bundle archive layout, the `mcpb init`/`pack` CLI, user config flow,
  and the .dxt→.mcpb rename note. Use for: MCPB rationale + packaging steps. Cached: `sources/s8.md`.
- [Adopting the MCP Bundle format (.mcpb) (Model Context Protocol Blog)](https://blog.modelcontextprotocol.io/posts/2025-11-20-adopting-mcpb/) — Tier 1
  Governance/history: MCPB (formerly DXT) moved into the MCP project for cross-client
  portability. Use for: standard governance and cross-client story. Cached: `sources/s9.md`.

## Wisdom (Communities)

- [anthropics/skills — Issues & Discussions](https://github.com/anthropics/skills) — official repo where
  patterns, partner skills (e.g. Notion), and questions are worked out in the open.
- [Model Context Protocol community](https://modelcontextprotocol.io/community/communication) — where MCPB
  and MCP standards evolve; the place for packaging/portability questions.
- [agentskills.io](https://agentskills.io) — the Agent Skills open standard site and skill-creation guides
  (including evaluating skills), useful for cross-tool skill portability.

## Gaps
- No Tier 1/2 source gives a full worked, end-to-end MCPB example inline; the course teaches
  the manifest and CLI accurately and points to the `modelcontextprotocol/mcpb` examples
  directory for a complete runnable bundle.
