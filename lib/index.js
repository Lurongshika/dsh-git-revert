/**
 * dsh-git-revert — node half.
 *
 * Takes a git snapshot (a dangling commit built through a temporary index) at
 * the END of every agent turn (`agent/turn-stopping`), capturing the workspace
 * exactly as it was after that turn finished — including the latest turn. The
 * exposed same-origin HTTP endpoint `/api/git-revert` restores the workspace to
 * the state after a given turn (keeping that turn's changes and undoing
 * anything after it), so the user can rewind backward and still move forward
 * again to the latest state. Uses the `shell` executor and the `webServer`
 * route registry; publishes no Service of its own.
 */

/** Host services this plugin requires before it can register its route. */
const inject = ["webServer"];

/**
 * @param ctx - host context carrying webServer plus optional shell / sandboxPolicy.
 */
function apply(ctx) {
  const shell = ctx.get("shell");
  const sandboxPolicy = ctx.get("sandboxPolicy");

  /** sessionId:turn -> { root, commit, error } */
  const snapshots = new Map();

  async function runGit(root, command) {
    if (shell === undefined) {
      return { exitCode: null, stdout: "", stderr: "shell 服务不可用" };
    }
    const spec = shell.resolve({ command, workdir: root, timeoutMs: 20000 });
    const result = await shell.run(spec);
    return { exitCode: result.exitCode, stdout: result.stdout.text, stderr: result.stderr.text };
  }

  async function resolveRoot(cwd) {
    const start = cwd || (sandboxPolicy ? sandboxPolicy.workspaceRoot : undefined);
    if (typeof start !== "string" || start.length === 0) return null;
    const r = await runGit(start, "git rev-parse --show-toplevel");
    if (r.exitCode !== 0) return null;
    const root = (r.stdout || "").trim();
    return root.length > 0 ? root : null;
  }

  async function snapshot(sessionId, turn, cwd) {
    const key = sessionId + ":" + turn;
    const root = await resolveRoot(cwd);
    if (root === null) {
      snapshots.set(key, { root: null, commit: null, error: "该工作区不是 git 仓库" });
      return;
    }
    // Build a dangling commit that captures the full working tree (tracked +
    // untracked, respecting .gitignore) without touching the user's index,
    // working tree, or any branch. The temporary index lives inside the git
    // dir, so no /tmp write and no workspace pollution.
    const cmd = 'tmp="$(git rev-parse --git-path dsh-tmp-index-$$-$RANDOM)" && GIT_INDEX_FILE="$tmp" git read-tree HEAD && GIT_INDEX_FILE="$tmp" git add -A && tree="$(GIT_INDEX_FILE="$tmp" git write-tree)" && commit="$(git commit-tree "$tree" -m "dsh snapshot")" && rm -f "$tmp" && printf "%s" "$commit"';
    const r = await runGit(root, cmd);
    if (r.exitCode !== 0) {
      snapshots.set(key, { root, commit: null, error: "创建快照失败：" + ((r.stderr || r.stdout || "").slice(0, 300)) });
      return;
    }
    const commit = (r.stdout || "").trim();
    snapshots.set(key, {
      root,
      commit: commit.length > 0 ? commit : null,
      error: commit.length > 0 ? null : "快照为空"
    });
  }

  async function doRevert(sessionId, turn) {
    // "after turn T" = the snapshot taken when turn T closed.
    const snap = snapshots.get(sessionId + ":" + turn);
    if (!snap) return { ok: false, message: "已回溯（该轮对话后的快照不可用）" };
    if (!snap.root || !snap.commit) return { ok: false, message: snap.error || "无法回溯" };
    const cmd = "git read-tree -u --reset '" + snap.commit + "' && git clean -fdq && git reset -q HEAD";
    const r = await runGit(snap.root, cmd);
    if (r.exitCode !== 0) {
      return { ok: false, message: "回溯失败：" + ((r.stderr || r.stdout || "").slice(0, 500)) };
    }
    return { ok: true, message: "已回溯" };
  }

  // Capture the workspace when a turn closes, keyed by that turn, so every
  // completed turn (including the latest) has an "after the turn" snapshot.
  ctx.on("agent/turn-stopping", async (payload) => {
    try {
      const agent = payload.agent;
      await snapshot(agent.session.id, payload.turn, agent.session.header && agent.session.header.cwd);
    } catch (error) {
      console.error("[dsh-git-revert] snapshot failed:", error);
    }
  });

  // Same-origin JSON endpoint for the browser half's button.
  ctx.effect(() => ctx.webServer.register({
    kind: "exact",
    path: "/api/git-revert",
    handler: async (req, res) => {
      if (req.method !== "POST") {
        res.writeHead(405, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, message: "method not allowed" }));
        return;
      }
      let body = "";
      try {
        for await (const chunk of req) body += chunk;
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, message: "bad request" }));
        return;
      }
      let parsed;
      try {
        parsed = JSON.parse(body || "{}");
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, message: "invalid json" }));
        return;
      }
      const result = await doRevert(parsed.sessionId, parsed.turn);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(result));
    }
  }));
}

export { apply, inject };
