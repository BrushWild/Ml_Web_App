---
trigger: always_on
---

## General Project Rules
* If you need specific API access for an external library, use the context7 mcp server to acquire the most up to date references.
* When executing skills, if the skill asks to present something to the user, you MUST obey and wait before acting on the output.
* Do not automatically start testing. Please prompt the user if you, the agent, want to automate testing and validate changes.

## HTML animations
* Use the standardized "jiggle" animation for button icons

#### SpacetimeDB Rules
* When writing ANY SpacetimeDB code, refer to @..\..\server\domino-vision\AGENTS.md for code correctness. 
* If context7 mcp API reference fails, the full SpacetimeDB 2.1 source can be found here: @..\..\server\domino-vision\spacetime_source_flat.xml