window.__ModuleLoader__.load({
	id: "dsh-git-revert",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		const React = require("react");

		const css = '.gv-wrap{display:inline-flex;align-items:center}' +
			'.gv-btn{max-width:240px;color:var(--dsw-alias-label-tertiary);white-space:nowrap;cursor:pointer;background:0 0;border:none;border-radius:14px;padding:0 8px;font-size:13px;line-height:28px;overflow:hidden}' +
			'.gv-btn:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}' +
			'.gv-btn:disabled{cursor:default;opacity:.4}' +
			'.gv-btn[data-confirm]{color:var(--dsw-alias-label-primary);font-weight:500}' +
			'.gv-msg{color:var(--dsw-alias-label-tertiary);padding-left:4px;font-size:13px;line-height:28px}';
		const tagId = "dsh-git-revert.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-git-revert";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}

		/** Cordis services this browser half requires. */
		const inject = ["slots"];

		function RevertButton(props) {
			const messageId = props.messageId;
			const sessionId = props.sessionId;
			const useSession = props.useSession;

			const turn = typeof useSession === "function"
				? useSession((snap) => {
					if (!snap || !snap.nodes) return undefined;
					for (let i = 0; i < snap.nodes.length; i++) {
						const n = snap.nodes[i];
						if (n && n.kind === "assistant" && n.messageId === messageId) return n.turn;
					}
					return undefined;
				})
				: undefined;

			const hasTurn = typeof turn === "number";
			const stageState = React.useState("idle");
			const stage = stageState[0];
			const setStage = stageState[1];
			const messageState = React.useState(null);
			const message = messageState[0];
			const setMessage = messageState[1];

			const onClick = () => {
				if (!hasTurn || stage === "busy") return;
				if (stage === "idle") { setStage("confirm"); return; }
				setStage("busy");
				setMessage(null);
				fetch("/api/git-revert", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ sessionId: sessionId, turn: turn })
				}).then((res) => res.json()).then((data) => {
					setStage("idle");
					setMessage(data && data.message ? String(data.message) : "已回退");
				}).catch((err) => {
					setStage("idle");
					setMessage("回退失败：" + (err && err.message ? err.message : String(err)));
				});
			};

			const label = stage === "busy" ? "回退中…" : (stage === "confirm" ? "确认回退？" : "版本回溯");

			return React.createElement("span", { className: "gv-wrap" },
				React.createElement("button", {
					type: "button",
					className: "gv-btn",
					"data-confirm": stage === "confirm" ? "" : undefined,
					disabled: !hasTurn || stage === "busy",
					onClick: onClick,
					onMouseLeave: () => { if (stage === "confirm") setStage("idle"); },
					title: hasTurn ? (message || "回到该轮对话后的状态") : "无法定位该消息所属的轮次"
				}, label),
				message !== null ? React.createElement("span", { className: "gv-msg", role: "status" }, message) : null
			);
		}

		function apply(ctx) {
			ctx.slots.inject("conversation.chat.assistant-actions", () => {
				const dispose = ctx.slots.register(
					{ name: "conversation.chat.assistant-actions", id: "git-revert", order: 11 },
					RevertButton
				);
				return () => dispose();
			});
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
