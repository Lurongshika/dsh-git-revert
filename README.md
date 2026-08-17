# dsh-git-revert

给 DeepSeek Harness（DSH）web 界面添加一个「**版本回溯**」按钮的插件。它出现在每条助手消息的操作条里，点击后把工作区**同步到该轮对话结束后的状态**：保留该轮的所有改动，撤销该轮之后的所有改动。

> 用途：DSH 修改文件后，不用再手动敲 `git` 命令。既能在出错时「往回」退到某一轮之后的状态，也能「后悔」再前进到最新一轮的进度。

## 功能

- 在助手消息操作条（点赞/点踩/「补充说明」那一行）右侧加入「**版本回溯**」按钮。
- 点一下变「确认回溯？」，再点一下执行；结果以内联文案反馈（「已回溯」/「不可用」/失败原因）。
- 以 git 快照实现，**不污染**你的分支、索引和提交历史（快照是悬空提交对象）。

## 语义：同步到「该轮对话后」

- 每轮对话**结束时**拍一个 git 快照，记为「该轮对话后的状态」。
- 点某轮消息旁的按钮 → 工作区恢复到「那一轮结束后的状态」。
- 点最新一轮 → 回到最新进度（用于后悔回溯后前进）。

## 工作原理

- **节点半**（`lib/index.js`，宿主）：
  - 监听 `agent/turn-stopping`，每轮结束时用临时索引 `GIT_INDEX_FILE` + `write-tree` + `commit-tree` 生成一个悬空快照提交，按 `sessionId:turn` 记录。
  - 注册同源 HTTP 端点 `POST /api/git-revert`。
  - 回退时执行 `git read-tree -u --reset <快照> && git clean -fdq && git reset -q HEAD`。
- **浏览器半**（`lib/client.js`）：
  - 在 `conversation.chat.assistant-actions` 槽注册按钮。
  - 点击后 `fetch('/api/git-revert', { sessionId, turn })` 触发宿主回退。

客户端与宿主之间走同源 HTTP，不依赖 `@Remote`/Typert 代码生成，因此**无需构建**，直接复制即可用。

## 目录结构

```
dsh-git-revert/
├── package.json        # 包元数据 + dsh.client 声明
└── lib/
    ├── index.js        # 节点半（宿主）：快照 + /api/git-revert
    └── client.js       # 浏览器半：版本回溯按钮
```

## 安装（web profile）

假设你的 DSH home 是 `~/.dsh`，web profile 位于 `~/.dsh/profiles/web`。

1. 把本包复制到 profile 的插件目录：

   ```bash
   mkdir -p ~/.dsh/profiles/web/plugins
   cp -r dsh-git-revert ~/.dsh/profiles/web/plugins/
   ```

2. 让 `dsh-git-revert` 可被解析（node_modules 软链接）：

   ```bash
   mkdir -p ~/.dsh/profiles/web/node_modules
   ln -sfn ../plugins/dsh-git-revert ~/.dsh/profiles/web/node_modules/dsh-git-revert
   ```

3. 在 `~/.dsh/profiles/web/cordis.patch.yml` 里加一行：

   ```yaml
   - insert:
       - id: ui-git-revert
         name: dsh-git-revert
   ```

4. 重启 `dsh web` 使新 composition 与客户端 bundle 生效。

## 使用

1. 打开一个 git 仓库工作区（见下方「要求」）。
2. 正常和 DSH 对话、让它改文件。
3. 在任意一条助手消息旁点「**版本回溯**」→「确认回溯？」→ 执行。

## 要求

- 工作区必须是 **git 仓库**，且至少有**一次提交**（`git rev-parse --show-toplevel` 能成功）。
- 只对插件激活后**已经结束**的轮次有快照；更早的历史消息会提示「不可用」。

## License

MIT
