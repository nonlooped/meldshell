# Maintaining documentation and agent instructions

Use this document when changing repository rules, local skills, or documentation. [AGENTS.md](../AGENTS.md) owns shared working rules; [CLAUDE.md](../CLAUDE.md) points to it.

This rewrite follows [OpenAI's September 11, 2026 article](https://developers.openai.com/blog/rethinking-skills-and-prompts-for-gpt-6-astra) and the local writing-for-agents skill. Keep always-loaded instructions focused on project constraints, route optional detail by task, and define completion without forcing every change through a fixed procedure.

## Ownership

| Material | Owner |
| --- | --- |
| Scope, authorization, verification, dependency lookup | AGENTS.md |
| Setup and check selection | CONTRIBUTING.md |
| Process, IPC, persistence, recovery | Architecture |
| Native provider behavior | Provider documents |
| Desktop appearance and interaction intent | Design; exact values remain in renderer code |
| Current product gaps | Roadmap |
| Candidate acceptance and artifact evidence | Release checklist and dated release records |
| Website build and deployment | Website |
| Local skill instructions | `.agents/skills` |

The skill directories are Git-ignored. In this checkout, `.claude/skills` links to `.agents/skills`; editing the target updates both consumers. Verify that relationship in another checkout before synchronizing copies. Local skill changes do not travel in a normal repository diff.

Preserve skill names, explicit-invocation metadata, and aliases unless the requested change includes invocation behavior. A lockfile records upstream provenance, not proof that locally edited skill content matches upstream. Keep local adaptations when updating installations. User-wide skills and plugin caches are outside this repository's documentation scope.

## Editing guidance

Write project facts and decisions where their readers need them. Link to manifests, configuration, or source for values that are cheap to inspect. Keep runnable setup examples and non-obvious constraints near the task they support.

Separate implemented behavior, design intent, proposed work, and recorded test results. Check the implementation before carrying forward a missing-feature claim. Date historical evidence and retain artifact hashes; editing prose cannot certify a build.

Skill descriptions should identify the task that needs them. A diagnosis skill should permit source inspection and user-provided evidence; a design skill should use the established interface; an interview skill should ask about consequential choices. None should add a universal approval gate, require extra agents, or authorize browser testing against repository policy.

For instructions, state the intended result and the evidence that establishes completion. Keep ordered steps for real dependencies, such as building an artifact before certifying it. Move branch-specific details behind links that say when to read them.

## Completion

Review every changed document for factual claims, local paths, anchors, and duplicated rules. For skills, also review frontmatter, referenced resources, and invocation metadata. Check that a routine edit, a larger implementation, and an explicit interview can follow different paths.

Documentation-only work ends after diff and reference review. Runtime checks and release certification need their own task and evidence.

## September 19, 2026 rewrite

The source review corrected stale claims about bundled Claude Code, two-provider support, Windows-only packaging, full-history fetching, and missing file/Git tools. Historical competitive ranks remain in the planning record, with current status owned by the roadmap.

Local skills were shortened and their task boundaries aligned with AGENTS.md. This was a documentation review, not a measurement of model performance, a live provider test, or a release certification.
