# Contributing to Grid

Thank you for helping. Grid is early, so suggestions of any size are welcome.

## Suggesting something

- **Issues.** Open an issue to report a bug, ask a question or suggest a feature. Say what
  you expected, what happened, and include a small plan file if it helps show the problem.
- **Pull requests.** For a small fix, open a pull request directly. For a larger change,
  open an issue first so we can agree on the approach before you spend time on it.

Before you open a pull request, read [AGENTS.md](AGENTS.md) and run:

```bash
npm install
npm run typecheck
npm run lint
npm test
npm run check:licenses
```

The same checks run on GitHub for every pull request, on Linux and on Windows
([RELEASING.md](RELEASING.md#the-checks-on-github)).

Use [conventional commits](https://www.conventionalcommits.org/) for commit messages. If people
will notice your change, write its changelog line in a file of its own in
[changes/](changes/README.md); the release adds it to [CHANGELOG.md](CHANGELOG.md).
[RELEASING.md](RELEASING.md) says how a version is released.

Building-code figures have their own rules: see [packages/rules/README.md](packages/rules/README.md).
Never copy text from a standard, a code or a regulation.

## Licence of contributions

Grid is licensed under the [Apache License 2.0](LICENSE). Unless you say otherwise in writing,
anything you submit for inclusion in Grid is licensed under Apache-2.0, as section 5 of the
licence describes, without any additional terms.

Only submit work you have the right to submit. If you include code from another project, its
licence must allow it, and the code keeps its own licence and copyright notice. Say in the pull
request where it came from and under which licence.
