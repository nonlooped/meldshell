# Agent documentation maintenance

Reviewed on 2026-09-05 against OpenAI's [GPT-6 Astra guidance](https://developers.openai.com/api/docs/guides/latest-model?model=gpt-6-astra), particularly its prompting section. This is a maintenance record, not another set of always-loaded agent rules.

The guide recommends auditing instructions because Astra follows them closely. The changes here favor authorized follow-through, clear task boundaries, concise communication, and verification proportional to the change. They do not change application models or claim measured performance improvements.

## Ownership

- AGENTS.md owns shared repository rules. CLAUDE.md points to it.
- `.agents/skills` owns the local skill content. In this Windows checkout, `.claude/skills` contains junctions to those directories; both tracked paths reflect an edit. Other checkouts may contain separate copies, so check before editing or syncing them.
- `agents/openai.yaml` and existing Claude frontmatter preserve invocation preferences. Short aliases remain for existing commands.
- `skills-lock.json` records upstream installation provenance. These skills now contain local adaptations. Preserve those adaptations when updating upstream; the recorded hashes do not certify the edited local content. Do not invent replacement upstream hashes.
- User-wide rules and plugin caches outside this repository are outside this audit.

## Review decisions

| Area | Result |
| --- | --- |
| AGENTS.md and contributor guidance | One verification policy, task-based document links, explicit follow-through and skill precedence |
| Frontend design | Follow MeldShell's visual language; remove forced aesthetic risks and repeated design ceremonies |
| Grilling and aliases | Bound questions to consequential decisions; remove the extra confirmation gate and missing Skill/domain-modeling dependencies |
| Architecture skills | Preserve isolation and meaningful tests; remove mandatory agent counts, vocabulary bans, and automatic HTML/interview requirements |
| Writing skills | Keep concrete editing advice; remove unsupported behavioral theories, punctuation bans, and instructions to invent personality |
| PR evidence | Correct the formatter path, accept available capture tools, and check upload capability before publishing |
| Architecture documentation | Reflect the two provider workers and shared desktop supervision |
| Roadmap and feature-gap analysis | Retain planning history with explicit status and source limitations |
| Release and design checklists | Keep their criteria and scope them to the relevant task |
| Claude integration and 0.1.0 release record | Retain provider detail and historical evidence; this audit does not recertify runtime behavior |

Removed obsolete instructions within existing files rather than deleting useful skills or historical records.

## Future edits

The subsequent 2026-09-05 documentation refresh checked `docs` against the source. [Architecture](architecture.md) and [roadmap](roadmap.md) now describe the implemented IPC, persistence, search, two-provider behavior, and remaining limits. [Interface design](design.md) includes current themes and inbox/settings surfaces. The [feature-gap analysis](meldShell-hofh-feature-gaps.md) has a current reconciliation above its historical research, and [release.md](release.md) covers both providers. The original audit decisions above remain a maintenance record, not a live feature inventory.

Keep project constraints and non-obvious reasons. Replace a failing instruction with a focused correction instead of adding another universal rule. Review a routine edit, an already-authorized implementation, and an explicit interview request to check that the same skill does not force them through one workflow.

Check changed links, frontmatter, invocation metadata, and the diff. Behavioral testing is useful when a real failure or complex workflow warrants it. This audit used document and reference review; no application tests, release certification, or live provider calls were needed.
