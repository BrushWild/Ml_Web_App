---
trigger: always_on
---

## General Project Rules
* When executing skills, if the skill asks to present something to the user, you MUST obey and wait before acting on the output.
* Do not automatically start testing. Please prompt the user if you, the agent, want to automate testing and validate changes.

## HTML animations
* Use the standardized "jiggle" animation for button icons found in style.css
'/* Jiggle all button icons on hover — individual buttons may override */
button:hover .material-icons {
    animation: camera-jiggle .55s var(--ease-spring) forwards;
}'

#### SpacetimeDB Rules
* You MUST use the context7 mcp to access spacetimedb documentation if available. If not, the full SpacetimeDB 2.1 source can be found here: @..\..\server\domino-vision\spacetime_source_flat.xml
* When writing ANY SpacetimeDB code, refer to @..\..\server\domino-vision\AGENTS.md for code correctness.