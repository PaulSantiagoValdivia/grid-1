# Working on Grid

Notes for agents and people changing this repository.

## Names

- Write "Grid" in sentences and `ongrid` in code.
- The commands will be `grid` and `ongrid`. They do the same thing.
- Internal packages use the `@ongrid/` scope. The scope is provisional. It appears in the
  package names under `packages/` and in imports between packages, and nowhere else.

## Layout

- `packages/core`: the plan schema, geometry, validation and exporters. It stays pure: no
  React, no Three.js, no DOM and no network.
- `packages/rules`: the checks that apply a figure from a building code, and the figures,
  each with where it was read and how far it has been checked. See its `README.md` before
  adding or changing a rule.
- `packages/viewer`: the 2D and 3D views. It draws what the core gives it and never
  computes geometry of its own.
- `packages/cli`: the building blocks for the `grid` and `ongrid` commands. The commands
  themselves are not built yet.

## Commands

```bash
npm install
npm run typecheck
npm run lint
npm test
```

Run the type check and the tests before calling a change done.

## Rules

- Node 22, npm, TypeScript in strict mode.
- English in code, comments and docs.
- Conventional commits.
- Every `package.json` keeps `"private": true`, and none has a `license` field, until the
  licence is chosen. See `LICENSE-PENDING.md`.
- Never commit secrets, `.env` files, personal data or paths from your own machine.

## Rules and standards

The checks in `packages/core` are checks on the drawing and cite no document. The checks in
`packages/rules` apply figures from building codes. Keep what is stored here to facts and our
own words.

- A check may state a figure and say where it comes from: the document, its edition and the
  clause number.
- Never copy text from a standard, a code or a regulation into this repository. No sentences,
  tables, definitions or images of them. Describe a rule in your own words.
- Only cite a source you were allowed to read.
- Every figure records its document, edition, clause, where it applies, the day it was read
  and a status. A figure an AI found is `ai-found` until a named person has checked it
  against the document. An AI is never recorded as the one who verified a figure.
- A rule that holds only for some buildings or places runs only there, and says so.
- Do not add collections of rules gathered from a publisher's website.
- Every report keeps the label "General guidance, not your local rules". No message says a
  plan complies or is approved.
- A short quote that a rules lookup collects, with its address, is saved in the user's own
  project. It never belongs in this repository.
- Do not copy code from another project unless its licence allows it. When you do, say where
  it came from and under which licence.
