# Creating Claude Skills — Glossary

Canonical terms for authoring, running, and packaging Claude Agent Skills. Definitions follow
Anthropic's official documentation.

## Terms

**Agent Skill**:
A folder of instructions, scripts, and resources, entered through a `SKILL.md` file, that Claude
discovers and loads dynamically to perform better at a specific task.
_Avoid_: plugin, add-on, macro

**SKILL.md**:
The required entry file of a skill: YAML frontmatter (metadata) followed by a Markdown body of
instructions.
_Avoid_: skill file, config file

**Frontmatter**:
The YAML block at the top of `SKILL.md`, between `---` markers, holding at minimum `name` and
`description`.
_Avoid_: header, metadata block (use "frontmatter")

**Description**:
The frontmatter field, written in third person, stating what the skill does and when to use it. It
is what Claude reads to decide whether to trigger the skill.
_Avoid_: summary, blurb

**Progressive disclosure**:
The design principle that Claude loads a skill in stages — metadata always, body when triggered,
bundled files only as needed — so context is spent only on what a task requires.
_Avoid_: lazy loading, on-demand loading

**Level 1 / Level 2 / Level 3**:
The three loading tiers: Level 1 = frontmatter metadata (always loaded); Level 2 = the `SKILL.md`
body (loaded when triggered); Level 3+ = bundled files and scripts (loaded or executed as needed).
_Avoid_: stages, phases

**Bundled files**:
Additional Markdown, reference, or data files in a skill directory that `SKILL.md` links to, read
only when needed. Should sit one level deep from `SKILL.md`.
_Avoid_: attachments, includes

**Utility script**:
A pre-written executable (e.g. a Python file) bundled in a skill that Claude runs via bash; its code
never enters context, only its output does.
_Avoid_: helper, tool script

**Degrees of freedom**:
How much latitude a skill's instructions give Claude — high (prose guidance), medium (parameterised
patterns), or low (exact scripts) — chosen to match a task's fragility.
_Avoid_: strictness, specificity level

**Trigger**:
The event of Claude selecting a skill based on its description matching the current task, causing
the body to load.
_Avoid_: activate, fire (use "trigger")

**Surface**:
A product where skills run — claude.ai, Claude Code, or the Claude API — each with its own upload
mechanism, sharing scope, and runtime constraints.
_Avoid_: platform, environment

**Agent Skills open standard**:
The published, cross-tool specification for skills (agentskills.io) that Claude Code and other tools
implement; Claude Code adds extensions on top of it.
_Avoid_: skill spec, format

**Plugin (Claude Code)**:
A self-contained, distributable bundle — a `.claude-plugin/plugin.json` manifest plus components
(skills, agents, hooks, MCP/LSP servers) — that namespaces its skills as `plugin-name:skill-name`.
_Avoid_: package, extension (reserve "extension" for legacy DXT wording)

**plugin.json**:
A Claude Code plugin's manifest, at `.claude-plugin/plugin.json`, declaring `name` (the namespace),
`description`, and optional `version` and `author`.
_Avoid_: manifest (ambiguous — say "plugin.json")

**Marketplace**:
A registry (a repo with `.claude-plugin/marketplace.json`) that Claude Code reads so users can
browse and install plugins.
_Avoid_: store, registry (use "marketplace")

**MCP (Model Context Protocol)**:
The open protocol by which Claude connects to external tools and data through servers exposing tools,
prompts, and resources.
_Avoid_: connector protocol

**MCP server**:
A program implementing MCP that exposes tools/prompts/resources; a "local" MCP server runs on the
user's machine.
_Avoid_: connector, plugin

**MCPB (MCP Bundle)**:
An open packaging format — a ZIP archive containing a local MCP server plus a `manifest.json` — that
lets a client install that server in one click. Formerly called DXT (Desktop Extension).
_Avoid_: DXT, desktop extension (for new work), zip plugin

**manifest.json (MCPB)**:
The one required file inside an `.mcpb` bundle, declaring `manifest_version`, `name`, `version`,
`description`, `author`, and `server`, plus optional `user_config`, `compatibility`, and more.
_Avoid_: plugin.json (that is Claude Code's), package.json

**user_config**:
The MCPB manifest field declaring configuration a host collects from the user (e.g. API keys, allowed
directories) and injects into the server at runtime via `${user_config.KEY}`.
_Avoid_: settings, env config

**mcpb CLI**:
The command-line tool (`@anthropic-ai/mcpb`, e.g. `mcpb init`, `mcpb pack`) that scaffolds a
`manifest.json` and packs a directory into an `.mcpb` file.
_Avoid_: packer, builder
