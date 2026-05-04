/**
 * Session Pins Extension
 *
 * Bookmark (pin) sessions you aren't finished with, list them,
 * and resume them later. Also lets you remove pins.
 *
 * Commands:
 *   /pin [label]    – Bookmark the current session
 *   /unpin          – Remove bookmark from current session
 *   /pins           – List bookmarked sessions and pick one to open
 *
 * The extension also shows a status indicator in the footer
 * showing whether the current session is pinned.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { DynamicBorder } from "@mariozechner/pi-coding-agent";
import { Container, type SelectItem, SelectList, Text } from "@mariozechner/pi-tui";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";

interface SessionBookmark {
	sessionFile: string;
	label: string;
	timestamp: number;
	cwd: string;
}

const BOOKMARKS_PATH = join(homedir(), ".pi", "agent", "session-bookmarks.json");

async function loadBookmarks(): Promise<SessionBookmark[]> {
	try {
		const data = await readFile(BOOKMARKS_PATH, "utf-8");
		return JSON.parse(data) as SessionBookmark[];
	} catch {
		return [];
	}
}

async function saveBookmarks(bookmarks: SessionBookmark[]): Promise<void> {
	await mkdir(join(homedir(), ".pi", "agent"), { recursive: true });
	await writeFile(BOOKMARKS_PATH, JSON.stringify(bookmarks, null, 2), "utf-8");
}

function formatTimestamp(ts: number): string {
	const diff = Date.now() - ts;
	const minutes = Math.floor(diff / 60000);
	const hours = Math.floor(diff / 3600000);
	const days = Math.floor(diff / 86400000);

	if (minutes < 1) return "just now";
	if (minutes < 60) return `${minutes}m ago`;
	if (hours < 24) return `${hours}h ago`;
	return `${days}d ago`;
}

/**
 * Shorten a filesystem path for display. Replaces $HOME with ~
 * and shows the last two path components when it's deep.
 */
function shortPath(p: string): string {
	const resolved = resolve(p);
	const home = homedir();
	let display = resolved;
	if (display.startsWith(home)) {
		display = "~" + display.slice(home.length);
	}
	return display;
}

/**
 * Build a SelectItem for a bookmark.
 */
function bookmarkToItem(b: SessionBookmark): SelectItem {
	const ago = formatTimestamp(b.timestamp);
	const loc = shortPath(b.cwd);
	return {
		value: b.sessionFile,
		label: `${b.label}  (${ago})`,
		description: loc,
	};
}

/**
 * Derive a label from the first user message in the session.
 */
function deriveLabelFromSession(ctx: { sessionManager: { getBranch(): any[] } }): string | undefined {
	const entries = ctx.sessionManager.getBranch();
	const firstUser = entries.find(
		(e: any) => e.type === "message" && e.message.role === "user"
	);
	if (!firstUser || firstUser.type !== "message") return undefined;

	const parts = firstUser.message.content
		?.map((c: any) => (typeof c === "string" ? c : c.text))
		.filter(Boolean);
	if (!parts || parts.length === 0) return undefined;

	return parts.join(" ").slice(0, 60);
}

export default function (pi: ExtensionAPI) {
	// Track if the current session is pinned (for status display)
	let pinnedStatus: string | undefined;

	// Refresh pinned status from bookmarks
	async function refreshPinnedStatus(ctx: { sessionManager: { getSessionFile(): string | null } }) {
		const sessionFile = ctx.sessionManager.getSessionFile();
		if (!sessionFile) {
			pinnedStatus = undefined;
			return;
		}
		const bookmarks = await loadBookmarks();
		const bm = bookmarks.find((b) => b.sessionFile === sessionFile);
		pinnedStatus = bm ? `📌 ${bm.label}` : undefined;
	}

	// Update status whenever session starts
	pi.on("session_start", async (_event, ctx) => {
		await refreshPinnedStatus(ctx);
		if (pinnedStatus) {
			ctx.ui.setStatus("session-pins", pinnedStatus);
		} else {
			ctx.ui.setStatus("session-pins", undefined);
		}
	});

	// /pin – Bookmark the current session
	pi.registerCommand("pin", {
		description: "Pin current session. Usage: /pin [label] (auto-uses session name if no label)",
		handler: async (args, ctx) => {
			const sessionFile = ctx.sessionManager.getSessionFile();
			if (!sessionFile) {
				ctx.ui.notify("No session file to pin (ephemeral session)", "warning");
				return;
			}

			let label = args.trim();
			if (!label) {
				// Use the session name if set, otherwise derive from first user message
				label = pi.getSessionName() ?? deriveLabelFromSession(ctx) ?? "";
				if (!label) {
					label = await ctx.ui.input("Pin label:", "e.g. Finish refactoring...");
					if (label === undefined) return;  // Esc = cancel
					if (!label) return;                // Enter on empty = cancel
				}
			}

			const bookmarks = await loadBookmarks();
			const existing = bookmarks.findIndex((b) => b.sessionFile === sessionFile);
			if (existing !== -1) {
				bookmarks[existing].label = label;
				bookmarks[existing].timestamp = Date.now();
			} else {
				bookmarks.push({
					sessionFile,
					label,
					timestamp: Date.now(),
					cwd: ctx.cwd,
				});
			}

			await saveBookmarks(bookmarks);
			pinnedStatus = `📌 ${label}`;
			ctx.ui.setStatus("session-pins", pinnedStatus);
			ctx.ui.notify(`📌 Pinned: ${label}`, "success");
		},
	});

	// /unpin – Remove bookmark from the current session
	pi.registerCommand("unpin", {
		description: "Remove bookmark from the current session",
		handler: async (_args, ctx) => {
			const sessionFile = ctx.sessionManager.getSessionFile();
			if (!sessionFile) {
				ctx.ui.notify("No active session file", "warning");
				return;
			}

			const bookmarks = await loadBookmarks();
			const idx = bookmarks.findIndex((b) => b.sessionFile === sessionFile);
			if (idx === -1) {
				ctx.ui.notify("Current session is not pinned", "warning");
				return;
			}

			const removed = bookmarks.splice(idx, 1)[0];
			await saveBookmarks(bookmarks);
			pinnedStatus = undefined;
			ctx.ui.setStatus("session-pins", undefined);
			ctx.ui.notify(`📌 Unpinned: ${removed.label}`, "info");
		},
	});

	// /pins – List all bookmarked sessions, open or quick-unpin with x
	pi.registerCommand("pins", {
		description: "List and open bookmarked sessions. Press x to remove a pin.",
		handler: async (_args, ctx) => {
			const bookmarks = await loadBookmarks();
			if (bookmarks.length === 0) {
				ctx.ui.notify("No pinned sessions", "warning");
				return;
			}

			type Result = { action: "open" | "remove"; sessionFile: string } | null;

			const result = await ctx.ui.custom<Result>((tui, theme, _kb, done) => {
				// Local mutable state so we can rebuild the list after deletion
				let currentBookmarks = structuredClone(bookmarks);
				let selectedIdx = 0;

				function buildItems(): SelectItem[] {
					return currentBookmarks.map(bookmarkToItem);
				}

				const container = new Container();
				const borderTop = new DynamicBorder((s: string) => theme.fg("accent", s));
				const titleText = new Text(theme.fg("accent", theme.bold(" Pinned Sessions")), 1, 0);
				let list: SelectList | undefined;
				const helpText = new Text("", 1, 0);
				const borderBottom = new DynamicBorder((s: string) => theme.fg("accent", s));

				container.addChild(borderTop);
				container.addChild(titleText);

				function rebuildList() {
					const newItems = buildItems();
					if (newItems.length === 0) {
						done(null);
						return;
					}

					selectedIdx = Math.min(selectedIdx, newItems.length - 1);
					list = new SelectList(newItems, Math.min(newItems.length, 10), {
						selectedPrefix: (t) => theme.fg("accent", t),
						selectedText: (t) => theme.fg("accent", t),
						description: (t) => theme.fg("muted", t),
						scrollInfo: (t) => theme.fg("dim", t),
						noMatch: (t) => theme.fg("warning", t),
					}, {
						minPrimaryColumnWidth: 64,
					});
					list.setSelectedIndex(selectedIdx);

					list.onSelect = (item) => {
						done({ action: "open", sessionFile: item.value as string });
					};
					list.onCancel = () => done(null);

					// Rebuild container children
					container.clear();
					container.addChild(borderTop);
					container.addChild(titleText);
					container.addChild(list);
					container.addChild(helpText);
					container.addChild(borderBottom);

					container.invalidate();
				}

				rebuildList();

				return {
					render: (w: number) => container.render(w),
					invalidate: () => container.invalidate(),
					handleInput: (data: string) => {
						// Quick-unpin with x
						if ((data === "x" || data === "X") && list) {
							const items = buildItems();
							if (selectedIdx < 0 || selectedIdx >= items.length) return;

							const removed = currentBookmarks[selectedIdx];
							currentBookmarks = currentBookmarks.filter((_, i) => i !== selectedIdx);
							saveBookmarks(currentBookmarks);

							// Update pinned status if this was the current session
							const curFile = ctx.sessionManager.getSessionFile();
							if (removed.sessionFile === curFile) {
								pinnedStatus = undefined;
								ctx.ui.setStatus("session-pins", undefined);
							}

							ctx.ui.notify(`Unpinned: ${removed.label}`, "info");
							rebuildList();
							tui.requestRender();
							return;
						}

						if (list) {
							// Track selected index before handling input
							const selItem = list.getSelectedItem();
							if (selItem) {
								const items = buildItems();
								selectedIdx = items.findIndex((i) => i.value === selItem.value);
								if (selectedIdx < 0) selectedIdx = 0;
							}

							list.handleInput(data);

							// Update selected index after input
							const newSel = list.getSelectedItem();
							if (newSel) {
								const items = buildItems();
								selectedIdx = items.findIndex((i) => i.value === newSel.value);
								if (selectedIdx < 0) selectedIdx = 0;
							}

							tui.requestRender();

							// Update help text
							helpText.setText(
								theme.fg("dim", " ↑↓ navigate • enter open • ") +
								theme.fg("warning", "x unpin") +
								theme.fg("dim", " • esc cancel")
							);
						}
					},
				};
			});

			if (!result) return;

			if (result.action === "open") {
				const bookmark = bookmarks.find((b) => b.sessionFile === result.sessionFile);
				if (!bookmark) return;

				// Check if the session file still exists
				if (!existsSync(bookmark.sessionFile)) {
					ctx.ui.notify("Session file no longer exists. Removing stale pin.", "error");
					const updated = (await loadBookmarks()).filter((b) => b.sessionFile !== result.sessionFile);
					await saveBookmarks(updated);

					const currentFile = ctx.sessionManager.getSessionFile();
					if (result.sessionFile === currentFile) {
						pinnedStatus = undefined;
						ctx.ui.setStatus("session-pins", undefined);
					}
					return;
				}

				// Don't switch if it's the current session
				const currentFile = ctx.sessionManager.getSessionFile();
				if (result.sessionFile === currentFile) {
					ctx.ui.notify("Already in this session", "info");
					return;
				}

				const targetCwd = resolve(bookmark.cwd);
				ctx.ui.notify(`Opening: ${bookmark.label} → ${shortPath(targetCwd)}`, "info");

				try {
					process.chdir(targetCwd);
				} catch {
					ctx.ui.notify(`Directory not found: ${shortPath(targetCwd)}. Switching anyway.`, "warning");
				}

				try {
					await ctx.switchSession(bookmark.sessionFile, {
						withSession: async (ctx) => {
							ctx.ui.notify(`📌 Resumed: ${bookmark.label}`, "success");
						},
					});
				} catch (err) {
					ctx.ui.notify(`Failed to switch session: ${String(err)}`, "error");
				}
			}
		},
	});
}
