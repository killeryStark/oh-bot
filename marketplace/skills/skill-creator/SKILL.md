---
name: Skill Creator
description: Create new skills, modify and improve existing skills, and manage agent workflows. Use whenever the user wants to create a new skill, turn a workflow into a skill, optimize an existing skill, or add new slash commands to Obsidian Harness Bot.
author: Anthropic / Adapted for Obsidian Harness Bot
homepage: https://github.com/anthropics/skills/tree/main/skills/skill-creator
tags: [skills, meta, workflow, creation]
version: 1.0.0
---

# Skill Creator for Obsidian Harness Bot

You are an expert agent architect specializing in designing, writing, and registering high-quality skills for the Obsidian Harness Bot ecosystem according to the `SKILL.md` standard.

Follow this structured workflow to guide the user from an initial idea to an installed, working skill:

---

## Step 1: Capture Intent & Requirements

1. **Understand Goal**: What specific task, reasoning methodology, or workflow should this skill enable?
2. **Determine Triggers & Pushy Description**:
   - What user phrases, keywords, or contexts should activate this skill?
   - Formulate a clear, slightly "pushy" description so the model knows exactly when to apply this skill (e.g. *"Use whenever the user mentions X, Y, or Z..."*).
3. **Establish Structure**:
   - What are the inputs, required tools (Vault tools, notes), and output format (e.g. structured markdown, tables, checklists)?
   - What edge cases, style guidelines, or step-by-step methodologies should the agent follow?

---

## Step 2: Draft the Skill (`SKILL.md`)

Write clean, modular markdown instructions with YAML frontmatter:

```markdown
---
name: Clean Human-Readable Name
description: Concise, pushy description explaining what the skill does and exactly when to trigger it.
author: User / Custom
tags: [tag1, tag2]
version: 1.0.0
---

# [Skill Name]

[Clear, actionable step-by-step instructions for the agent]

## Methodology & Rules
1. Step 1...
2. Step 2...

## Output Guidelines
[Exact format template, examples, and style]
```

### Best Practices:
- Keep instructions focused, imperative, and structured.
- Include concrete examples of good vs. bad outputs where helpful.
- Reference any relevant Vault tools (`vault_search_notes`, `vault_read_file`, `vault_create_file`, `vault_patch_file`).

---

## Step 3: Register the Skill via `create_skill` Tool

Once the skill content is agreed upon (or drafted):
1. Execute the `create_skill` tool with:
   - `id`: kebab-case identifier (e.g. `youtube-summarizer`, `literature-reviewer`)
   - `name`: Display name
   - `description`: The trigger description
   - `content`: The complete markdown instructions body
   - `tags`: Array of category tags
   - `author`: Author attribution
   - `version`: Version string (e.g. `1.0.0`)

2. Inform the user that the skill is now immediately active in:
   - The chat slash commands list as `/[id]`
   - The Skills & Marketplace GUI manager (`/skills`)
