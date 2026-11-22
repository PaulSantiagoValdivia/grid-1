# Changes waiting for a release

Read this when your change needs a line in a changelog. Each change writes its own file here,
`changes/<ID>.md`, named by its ID (such as `BRF-6.md`), and edits neither `CHANGELOG.md` nor
the changelog for agents in `docs/result-contract.md`. So changes built at the same time never
edit the same lines. The release step ([RELEASING.md](../RELEASING.md)) writes every file here
into both changelogs and deletes it.

```markdown
# 2026-11-22: a first layout from the brief (BRF-6)

## For people

- The line for "Unreleased" in CHANGELOG.md, in plain words: what you can do now, or what works
  differently (BRF-6).

## For agents

- The entry for the changelog for agents: what a tool answers now, a new code, field or
  wording. "No new code in the record." when there is none.

## Codes

| `room/new-code` | Room "{name}" has the new thing | what is needed |
```

- The first line is the entry's heading in the changelog for agents: the day, what changed and
  the ID, which is the file's name.
- Write the parts that apply and leave out the others. A change people will notice has "For
  people"; a change to what a tool answers has "For agents".
- A new message code goes under "Codes" as its row of the contract's code table, and comes with
  an entry for agents. The release puts the row after the last code of its kind. Until then the
  test that holds the code table to `packages/rules/src/result/catalogue.ts` reads the rows here
  too.
- `scripts/__tests__/release.test.ts` reads every file here, so a fragment the release could not
  combine fails `npm test`.
