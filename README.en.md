# dsh-git-revert

> [中文](README.md)

A plugin that adds a "**版本回溯** (version rewind)" button to the DeepSeek Harness (DSH) web UI. The button sits in each assistant message's action strip; clicking it restores the workspace to the state **as of the end of that turn** — keeping that turn's changes and undoing everything after it.

> Why: after DSH edits files you no longer need to hand-run `git` commands. You can rewind backward to right after a given turn, or "regret" and move forward again to the latest turn's state.

## Screenshot

The "版本回溯" button to the right of the assistant-message action strip (the like/dislike/note row):

![git-revert button](git-revert-button.png)

## Features

- Adds a "版本回溯" button to the right of the assistant-message action strip (the like/dislike/note row).
- One click turns it into "确认回溯？" (confirm), a second click executes; the result is shown inline ("已回溯" / "不可用" / failure reason).
- Backed by git snapshots that do **not** pollute your branch, index, or commit history (snapshots are dangling commit objects).

## Semantics: sync to "after the turn"

- A git snapshot is taken **when each turn ends**, recorded as "the state after that turn".
- Clicking the button beside a turn's message restores the workspace to that turn's end state.
- Clicking the latest turn restores the latest progress (for moving forward again after a rewind).

## How it works

- **node half** (`lib/index.js`, host): on `agent/turn-stopping`, builds a dangling snapshot commit from the full working tree (via a temporary `GIT_INDEX_FILE` + `write-tree` + `commit-tree`), keyed by `sessionId:turn`; registers the same-origin `POST /api/git-revert` endpoint; reverts with `git read-tree -u --reset <snapshot> && git clean -fdq && git reset -q HEAD`.
- **browser half** (`lib/client.js`): registers the button in the `conversation.chat.assistant-actions` slot; on click, `fetch('/api/git-revert', { sessionId, turn })` triggers the host revert.

Client↔host communication uses plain same-origin HTTP rather than `@Remote`/Typert codegen, so **no build step** is needed — copy and use as-is.

## Layout

```
dsh-git-revert/
├── package.json        # package metadata + dsh.client declaration
└── lib/
    ├── index.js        # node half: snapshot + /api/git-revert
    └── client.js       # browser half: the button
```

## Installation (web profile)

Assuming your DSH home is `~/.dsh` and the web profile is at `~/.dsh/profiles/web`.

1. Copy this package into the profile's plugins dir:

   ```bash
   mkdir -p ~/.dsh/profiles/web/plugins
   cp -r dsh-git-revert ~/.dsh/profiles/web/plugins/
   ```

2. Make it resolvable (node_modules symlink):

   ```bash
   mkdir -p ~/.dsh/profiles/web/node_modules
   ln -sfn ../plugins/dsh-git-revert ~/.dsh/profiles/web/node_modules/dsh-git-revert
   ```

3. Add a row to `~/.dsh/profiles/web/cordis.patch.yml`:

   ```yaml
   - insert:
       - id: ui-git-revert
         name: dsh-git-revert
   ```

4. Restart `dsh web` to pick up the new composition and client bundle.

## Usage

1. Open a git-repository workspace (see Requirements below).
2. Chat with DSH normally and let it edit files.
3. Beside any assistant message, click "版本回溯" → "确认回溯？" → execute.

## Requirements

- The workspace must be a **git repository** with at least **one commit** (`git rev-parse --show-toplevel` succeeds).
- Snapshots exist only for turns that **completed after** the plugin became active; earlier messages show "不可用".

## Limitations

- **Only changes inside the git repo are recorded**: snapshots are bounded by the repo root returned by `git rev-parse --show-toplevel`. File operations outside that directory (e.g. creating/editing files under `~/Desktop`, `/tmp`, or any other non-repo path) are not captured and therefore cannot be rewound.
- **`.gitignore`d files are not recorded**: snapshots use `git add -A`, which honors `.gitignore`, so ignored files never enter the snapshot.
- Untracked files are removed entirely on rewind (returning to the "after the turn" state where that file did not exist) — avoid keeping important un-committed new files in the repo.

## License

MIT
