# Mission: Creating Claude Agent Skills (authoring through advanced packaging)

## Why
Ollie wants to author Claude Agent Skills that reliably trigger and do real work, and to
understand the full distribution story — plain skills, Claude Code plugins, and MCPB
bundles — well enough to package and ship them the right way for each surface. The goal is
practical fluency: know what to build, why the format is shaped the way it is, and which
packaging path fits a given job.

## Success looks like
- Write a valid `SKILL.md` (frontmatter + body) that Claude discovers and applies correctly.
- Explain progressive disclosure and use it deliberately to keep skills lean.
- Apply authoring craft: sharp descriptions, right degrees of freedom, bundled reference
  files one level deep, utility scripts, and feedback loops.
- Choose correctly between a standalone skill, a Claude Code plugin, and an MCPB bundle for
  a given distribution need.
- Package a local MCP server as an `.mcpb` bundle with a correct `manifest.json`.

## Constraints
- Experienced technical background — skip hand-holding, go to depth and edge cases.
- Knowledge topic taught through narration + retrieval; the actual building is hands-on and
  handed off to the tools and communities in RESOURCES.md.

## Out of scope
- Building MCP servers from scratch (protocol internals) beyond what packaging requires.
- Using the pre-built document skills (pptx/xlsx/docx/pdf) as an end user.
- The Claude Agent SDK and Messages API beyond how Skills are uploaded/enabled.
