# dsh-git-revert / 版本回溯插件

给 DeepSeek Harness（DSH）web 界面添加一个「**版本回溯**」按钮的插件。它出现在每条助手消息的操作条里，点击后把工作区**同步到该轮对话结束后的状态**：保留该轮的所有改动，撤销该轮之后的所有改动。

A plugin that adds a "**版本回溯** (version rewind)" button to the DeepSeek Harness (DSH) web UI. The button sits in each assistant message's action strip; clicking it restores the workspace to the state **as of the end of that turn** — keeping that turn's changes and undoing everything after it.

> 用途：DSH 修改文件后，不用再手动敲 `git` 命令。既能在出错时「往回」退到某一轮之后的状态，也能「后悔」再前进到最新一轮的进度。
>
> Why: after DSH edits files you no longer need to hand-run `git` commands. You can rewind backward to right after a given turn, or "regret" and move forward again to the latest turn's state.

## 截图 / Screenshot

助手消息操作条（点赞/点踩/「补充说明」那一行）右侧的「**版本回溯**」按钮：

The "版本回溯" button to the right of the assistant-message action strip (the like/dislike/note row):

![版本回溯按钮 / git-revert button](git-revert-button.png)

## 功能 / Features

- 在助手消息操作条（点赞/点踩/「补充说明」那一行）右侧加入「**版本回溯**」按钮。
- 点一下变「确认回溯？」，再点一下执行；结果以内联文案反馈（「已回溯」/「不可用」/失败原因）。
- 以 git 快照实现，**不污染**你的分支、索引和提交历史（快照是悬空提交对象）。

- Adds a "版本回溯" button to the right of the assistant-message action strip (the like/dislike/note row).
- One click turns it into "确认回溯？" (confirm), a second click executes; the result is shown inline ("已回溯" / "不可用" / failure reason).
- Backed by git snapshots that do **not** pollute your branch, index, or commit history (snapshots are dangling commit objects).

## 语义：同步到「该轮对话后」 / Semantics: sync to "after the turn"

- 每轮对话**结束时**拍一个 git 快照，记为「该轮对话后的状态」。
- 点某轮消息旁的按钮 → 工作区恢复到「那一轮结束后的状态」。
- 点最新一轮 → 回到最新进度（用于后悔回溯后前进）。

- A git snapshot is taken **when each turn ends**, recorded as "the state after that turn".
- Clicking the button beside a turn's message restores the workspace to that turn's end state.
- Clicking the latest turn restores the latest progress (for moving forward again after a rewind).

## 工作原理 / How it works

- **节点半 / node half**（`lib/index.js`，宿主 / host）：
  - 监听 `agent/turn-stopping`，每轮结束时用临时索引 `GIT_INDEX_FILE` + `write-tree` + `commit-tree` 生成一个悬空快照提交，按 `sessionId:turn` 记录。
  - 注册同源 HTTP 端点 `POST /api/git-revert`。
  - 回退时执行 `git read-tree -u --reset <快照> && git clean -fdq && git reset -q HEAD`。
- **浏览器半 / browser half**（`lib/client.js`）：
  - 在 `conversation.chat.assistant-actions` 槽注册按钮。
  - 点击后 `fetch('/api/git-revert', { sessionId, turn })` 触发宿主回退。

客户端与宿主之间走同源 HTTP，不依赖 `@Remote`/Typert 代码生成，因此**无需构建**，直接复制即可用。

- **node half** (`lib/index.js`, host): on `agent/turn-stopping`, builds a dangling snapshot commit from the full working tree (via a temporary `GIT_INDEX_FILE` + `write-tree` + `commit-tree`), keyed by `sessionId:turn`; registers the same-origin `POST /api/git-revert` endpoint; reverts with `git read-tree -u --reset <snapshot> && git clean -fdq && git reset -q HEAD`.
- **browser half** (`lib/client.js`): registers the button in the `conversation.chat.assistant-actions` slot; on click, `fetch('/api/git-revert', { sessionId, turn })` triggers the host revert.

Client↔host communication uses plain same-origin HTTP rather than `@Remote`/Typert codegen, so **no build step** is needed — copy and use as-is.

## 目录结构 / Layout

```
dsh-git-revert/
├── package.json        # 包元数据 + dsh.client 声明 / package metadata + dsh.client declaration
└── lib/
    ├── index.js        # 节点半（宿主）：快照 + /api/git-revert / node half: snapshot + /api/git-revert
    └── client.js       # 浏览器半：版本回溯按钮 / browser half: the button
```

## 安装（web profile）/ Installation (web profile)

假设你的 DSH home 是 `~/.dsh`，web profile 位于 `~/.dsh/profiles/web`。

Assuming your DSH home is `~/.dsh` and the web profile is at `~/.dsh/profiles/web`.

1. 把本包复制到 profile 的插件目录 / copy this package into the profile's plugins dir：

   ```bash
   mkdir -p ~/.dsh/profiles/web/plugins
   cp -r dsh-git-revert ~/.dsh/profiles/web/plugins/
   ```

2. 让 `dsh-git-revert` 可被解析（node_modules 软链接）/ make it resolvable (node_modules symlink)：

   ```bash
   mkdir -p ~/.dsh/profiles/web/node_modules
   ln -sfn ../plugins/dsh-git-revert ~/.dsh/profiles/web/node_modules/dsh-git-revert
   ```

3. 在 `~/.dsh/profiles/web/cordis.patch.yml` 里加一行 / add a row to `~/.dsh/profiles/web/cordis.patch.yml`：

   ```yaml
   - insert:
       - id: ui-git-revert
         name: dsh-git-revert
   ```

4. 重启 `dsh web` 使新 composition 与客户端 bundle 生效 / restart `dsh web` to pick up the new composition and client bundle.

## 使用 / Usage

1. 打开一个 git 仓库工作区（见下方「要求」）。
2. 正常和 DSH 对话、让它改文件。
3. 在任意一条助手消息旁点「**版本回溯**」→「确认回溯？」→ 执行。

1. Open a git-repository workspace (see Requirements below).
2. Chat with DSH normally and let it edit files.
3. Beside any assistant message, click "版本回溯" → "确认回溯？" → execute.

## 要求 / Requirements

- 工作区必须是 **git 仓库**，且至少有**一次提交**（`git rev-parse --show-toplevel` 能成功）。
- 只对插件激活后**已经结束**的轮次有快照；更早的历史消息会提示「不可用」。

- The workspace must be a **git repository** with at least **one commit** (`git rev-parse --show-toplevel` succeeds).
- Snapshots exist only for turns that **completed after** the plugin became active; earlier messages show "不可用".

## 局限 / Limitations

- **仅记录 git 仓库内的改动**：快照以 `git rev-parse --show-toplevel` 得到的仓库根目录为边界，只捕获该目录内的文件。仓库目录**之外**的文件操作（例如在 `~/Desktop`、`/tmp` 或其他非仓库路径下新建/修改文件）不会被快照，因而无法回退。
- **`.gitignore` 忽略的文件不记录**：快照基于 `git add -A`，遵循 `.gitignore`，被忽略的文件不会进入快照。
- 未跟踪文件回退时会被**整体移除**（回到「该轮后」状态中不存在该文件的情况），请留意不要在仓库里保留尚未提交的重要新文件。

- **Only changes inside the git repo are recorded**: snapshots are bounded by the repo root returned by `git rev-parse --show-toplevel`. File operations outside that directory (e.g. creating/editing files under `~/Desktop`, `/tmp`, or any other non-repo path) are not captured and therefore cannot be rewound.
- **`.gitignore`d files are not recorded**: snapshots use `git add -A`, which honors `.gitignore`, so ignored files never enter the snapshot.
- Untracked files are removed entirely on rewind (returning to the "after the turn" state where that file did not exist) — avoid keeping important un-committed new files in the repo.

## License

MIT
