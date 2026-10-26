import { html } from "diff2html";
import { ColorSchemeType } from "diff2html/lib-esm/types";
import diffStyles from "diff2html/bundles/css/diff2html.min.css" with { type: "text" };
import type { ExtensionRegistrationHost, GitFileChange, ProjectGitStatus } from "./api.ts";

const STATUS: Record<GitFileChange["status"], readonly [string, string]> = {
  added: ["A", "Added"], modified: ["M", "Modified"], deleted: ["D", "Deleted"],
  renamed: ["R", "Renamed"], copied: ["C", "Copied"], "type-changed": ["T", "Type changed"],
  unmerged: ["!", "Unmerged"], untracked: ["U", "Untracked"],
};

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = ""): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag); node.className = className; node.textContent = text; return node;
}
function text(node: HTMLElement, value: string): void {
  // Unchanged polling must not continually mutate/announce the same status.
  if (node.textContent !== value) node.textContent = value;
}
function icon(kind: "branch" | "refresh"): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 16 16"); svg.setAttribute("aria-hidden", "true"); svg.setAttribute("focusable", "false");
  const path = document.createElementNS(svg.namespaceURI, "path");
  path.setAttribute("d", kind === "refresh" ? "M13 7a5 5 0 1 0-1 4M13 3v4H9" : "M4 5v6m8-6v1a4 4 0 0 1-4 4H4M6 3a2 2 0 1 1-4 0 2 2 0 1 1 4 0M14 3a2 2 0 1 1-4 0 2 2 0 1 1 4 0M6 13a2 2 0 1 1-4 0 2 2 0 1 1 4 0");
  svg.append(path); return svg;
}
function fileRow(change: GitFileChange): HTMLLIElement {
  const row = element("li"), path = element("span", "path"), kind = element("span", "kind");
  const [letter, label] = STATUS[change.status];
  const fullPath = change.previousPath ? `${change.previousPath} → ${change.path}` : change.path;
  row.dataset.status = change.status; row.setAttribute("aria-label", `${label}: ${fullPath}`);
  path.title = fullPath;
  // Git paths use '/', including the trailing slash on summarized untracked directories.
  const directory = change.path.endsWith("/"), trimmed = directory ? change.path.slice(0, -1) : change.path;
  const split = trimmed.lastIndexOf("/");
  path.append(element("span", "file-name", trimmed.slice(split + 1) + (directory ? "/" : "")));
  if (split >= 0) path.append(element("span", "directory", trimmed.slice(0, split)));
  if (change.previousPath) path.append(element("span", "previous-path", `from ${change.previousPath}`));
  kind.textContent = letter; kind.title = label; kind.setAttribute("role", "img"); kind.setAttribute("aria-label", label);
  row.append(path, kind); return row;
}

interface DiffRow {
  readonly key: string;
  readonly row: HTMLLIElement;
  readonly details: HTMLDetailsElement;
  readonly summary: HTMLElement;
  readonly body: HTMLElement;
  readonly paths: readonly string[];
  rendered?: object;
}
/** A staged/unstaged file row whose summary is the plain row content and whose body holds that file's diff. */
function diffRow(change: GitFileChange): DiffRow {
  const row = fileRow(change), details = element("details", "file-diff"), summary = element("summary"), body = element("div", "diff");
  summary.setAttribute("aria-label", row.getAttribute("aria-label")!); row.removeAttribute("aria-label");
  summary.append(...row.childNodes); details.append(summary, body); row.append(details); row.classList.add("diff-row");
  // Status reports renames although diffs disable them: show both sides.
  return { key: JSON.stringify(change), row, details, summary, body, paths: change.previousPath ? [change.previousPath, change.path] : [change.path] };
}

const ESCAPES: Record<string, number> = { a: 7, b: 8, t: 9, n: 10, v: 11, f: 12, r: 13, '"': 34, "\\": 92 };
/** Decodes the inside of a Git C-quoted path, whose octal escapes are UTF-8 bytes. */
function unquote(quoted: string): string {
  const bytes: number[] = [], encoder = new TextEncoder();
  for (const [, escape, plain] of quoted.matchAll(/\\([0-7]{3}|.)|([^\\]+)/gs)) {
    if (plain !== undefined) bytes.push(...encoder.encode(plain));
    else bytes.push(/^[0-7]/.test(escape!) ? parseInt(escape!, 8) : ESCAPES[escape!] ?? escape!.charCodeAt(0));
  }
  return new TextDecoder().decode(Uint8Array.from(bytes));
}
// The body of a C-quoted string, captured.
const QUOTED = String.raw`((?:[^"\\]|\\.)*)`;
/** The file a section header names. Renames are disabled, so both sides of a two-way header are the same path. */
function headerPath(header: string): string | undefined {
  const twoWay = /^diff --git (.*)$/.exec(header);
  if (!twoWay) {
    // Unmerged paths use a combined header naming the path once, without a/ or b/.
    const combined = /^diff --(?:cc|combined) (.*)$/.exec(header)?.[1];
    const quoted = combined && new RegExp(`^"${QUOTED}"$`).exec(combined);
    return quoted ? unquote(quoted[1]!) : combined;
  }
  const sides = twoWay[1]!, quoted = new RegExp(String.raw`^"a/${QUOTED}" "b/\1"$`).exec(sides);
  if (quoted) return unquote(quoted[1]!);
  const path = sides.slice(2, 2 + (sides.length - 5) / 2);
  return sides === `a/${path} b/${path}` ? path : undefined;
}
/** Splits one diff section into per-file sections keyed by repository path. */
function indexDiff(text: string): Map<string, string> {
  const files = new Map<string, string>();
  // `--cached` interleaves "* Unmerged path" lines that carry no diff.
  for (const section of text.split(/^(?=diff --|\* Unmerged path )/m)) {
    const path = section.startsWith("diff --") ? headerPath(section.split("\n", 1)[0]!) : undefined;
    if (path !== undefined) files.set(path, section);
  }
  return files;
}
// diff2html declares variables on :host/:root and styles generic .line-num classes; keep every rule inside the widget.
const DIFF_STYLES = diffStyles.replace(/(^|[{}])([^{}@]+)\{/g, (_, end: string, selectors: string) =>
  `${end}${selectors.split(",").map(selector => /^:(?:host|root)$/.test(selector.trim()) ? ".wolfpack-changes" : `.wolfpack-changes ${selector}`).join(",")}{`);
const DIFF_OPTIONS = { drawFileList: false, outputFormat: "line-by-line", matching: "none", colorScheme: ColorSchemeType.DARK } as const;
type DiffSection = "staged" | "unstaged";
type DiffResult = { readonly state: "not-repository" } | { readonly state: "ready"; readonly truncated: boolean } & Readonly<Record<DiffSection, Map<string, string>>>;

type GroupKey = "staged" | "unstaged" | "untracked";
const GROUP_KEYS: readonly GroupKey[] = ["staged", "unstaged", "untracked"];
const isGroupKey = (value: unknown): value is GroupKey => GROUP_KEYS.some(key => key === value);
// One storage key holds closed groups and collapsed directories; bounds stop vanished paths from growing it indefinitely.
const DISCLOSURE_KEY = "disclosure", MAX_COLLAPSED = 256, MAX_PATH_LENGTH = 4096;
interface DisclosureState { readonly closed: Set<GroupKey>; readonly collapsed: Record<GroupKey, Set<string>>; }

/** Invalid or foreign stored data falls back to the default expanded state, keeping any valid entries. */
function parseDisclosure(raw: string | null): DisclosureState {
  const state: DisclosureState = { closed: new Set(), collapsed: { staged: new Set(), unstaged: new Set(), untracked: new Set() } };
  let value: unknown;
  try { value = raw === null ? null : JSON.parse(raw); } catch { return state; }
  if (!value || typeof value !== "object") return state;
  const { closed, collapsed } = value as Record<string, unknown>;
  if (Array.isArray(closed)) for (const key of closed) if (isGroupKey(key)) state.closed.add(key);
  if (collapsed && typeof collapsed === "object") for (const key of GROUP_KEYS) {
    const paths = (collapsed as Record<string, unknown>)[key];
    if (Array.isArray(paths)) for (const path of paths.slice(-MAX_COLLAPSED)) {
      if (typeof path === "string" && path && path.length <= MAX_PATH_LENGTH) state.collapsed[key].add(path);
    }
  }
  return state;
}

interface DirectoryDisclosure {
  readonly section: HTMLDetailsElement;
  readonly heading: HTMLElement;
  readonly list: HTMLUListElement;
}

function renderPaths(list: HTMLUListElement, changes: readonly GitFileChange[], directories: Map<string, DirectoryDisclosure>, collapsed: Set<string>, row: (change: GitFileChange) => HTMLElement): void {
  const available = new Set<string>();
  const children = new Map<HTMLUListElement, HTMLElement[]>();
  const append = (parent: HTMLUListElement, child: HTMLElement) => {
    const rows = children.get(parent) ?? []; rows.push(child); children.set(parent, rows);
  };
  children.set(list, []);
  for (const change of changes) {
    // The final segment (even a summarized untracked directory) remains a leaf.
    const segments = (change.path.endsWith("/") ? change.path.slice(0, -1) : change.path).split("/");
    let parent = list;
    for (let index = 1; index < segments.length; index++) {
      const path = segments.slice(0, index).join("/");
      let disclosure = directories.get(path);
      if (!disclosure) {
        const section = element("details"), heading = element("summary"), nested = element("ul");
        section.dataset.directory = path; section.open = !collapsed.has(path);
        heading.append(element("span", "directory-label", `${path}/`)); section.append(heading, nested);
        section.addEventListener("toggle", () => { if (section.open) collapsed.delete(path); else collapsed.add(path); });
        disclosure = { section, heading, list: nested }; directories.set(path, disclosure);
      }
      if (!available.has(path)) {
        available.add(path); children.set(disclosure.list, []);
        const row = element("li", "directory-row"); row.append(disclosure.section); append(parent, row);
      }
      parent = disclosure.list;
    }
    append(parent, row(change));
  }
  for (const [parent, rows] of children) parent.replaceChildren(...rows);
  for (const path of directories.keys()) if (!available.has(path)) directories.delete(path);
}

export default function register(host: ExtensionRegistrationHost): void {
  host.registerContextView({
    id: "changes", title: "Changes",
    mount(container, context) {
      const root = element("section", "wolfpack-changes"); root.setAttribute("aria-label", "Git changes");
      // Hosts without project.gitDiff get the plain status view.
      const diffs = typeof context.project.gitDiff === "function";
      const style = element("style");
      style.textContent = `
.wolfpack-changes{display:flex;flex-direction:column;gap:10px;min-width:0;height:100%;color:var(--text-primary,#dce5df);font:13px/1.5 system-ui}
.wolfpack-changes [hidden]{display:none!important}
.wolfpack-changes header,.wolfpack-changes .branch-heading,.wolfpack-changes .summary-line,.wolfpack-changes footer{display:flex;align-items:center;gap:8px;min-width:0}
.wolfpack-changes header,.wolfpack-changes .summary-line,.wolfpack-changes footer{justify-content:space-between;flex:none}
.wolfpack-changes header{padding:0;min-height:0;background:none;border:0;box-shadow:none;position:static;z-index:auto;transition:none}
.wolfpack-changes .branch-heading{overflow:hidden}
.wolfpack-changes svg{width:16px;height:16px;flex:none;fill:none;stroke:currentColor;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}
.wolfpack-changes .branch-heading svg{color:var(--text-muted,#a4b2a9)}
.wolfpack-changes .branch{font:600 12px/1.5 monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wolfpack-changes .refresh{display:grid;place-items:center;flex:none;width:32px;height:32px;padding:0;border:1px solid transparent;border-radius:6px;background:transparent;color:var(--text-muted,#a4b2a9);cursor:pointer}
.wolfpack-changes .refresh:hover{background:var(--bg-hover,#1b231e);color:var(--text-primary,#dce5df);border-color:var(--border,#28312b)}
.wolfpack-changes .refresh:focus-visible,.wolfpack-changes .refresh-diffs:focus-visible,.wolfpack-changes .d2h-file-diff:focus-visible,.wolfpack-changes summary:focus-visible{outline:2px solid var(--accent,#45ed7e);outline-offset:-2px}
.wolfpack-changes .refresh[aria-busy=true] svg{animation:wolfpack-changes-refresh 1s linear infinite}
@keyframes wolfpack-changes-refresh{to{transform:rotate(360deg)}}
@media(prefers-reduced-motion:reduce){.wolfpack-changes .refresh[aria-busy=true] svg{animation:none}}
.wolfpack-changes .change-count{font-size:12px;font-weight:600}
.wolfpack-changes .read-only{font-size:10px;white-space:nowrap;padding:1px 6px;border:1px solid var(--border,#28312b);border-radius:4px;color:var(--text-muted,#a4b2a9)}
.wolfpack-changes .files{overflow:auto;min-height:0;flex:1;scrollbar-gutter:stable}
.wolfpack-changes details{margin:0 0 8px}
.wolfpack-changes summary{display:flex;align-items:center;gap:8px;min-height:32px;padding:0 6px;list-style:none;cursor:pointer;border-radius:4px;background:var(--bg-inset,#0d100e);font-size:11px;font-weight:600}
.wolfpack-changes summary::-webkit-details-marker{display:none}
.wolfpack-changes summary::before{content:"";width:5px;height:5px;border-right:1.5px solid currentColor;border-bottom:1.5px solid currentColor;transform:rotate(-45deg);margin-right:3px}
.wolfpack-changes details[open]>summary::before{transform:rotate(45deg)}
.wolfpack-changes .group-count{margin-left:auto;min-width:18px;text-align:center;border-radius:9px;background:var(--bg-elevated,#1c211e);color:var(--text-muted,#a4b2a9);font:11px/18px monospace}
.wolfpack-changes ul{list-style:none;margin:3px 0 0;padding:0}
.wolfpack-changes li{display:flex;gap:10px;align-items:center;min-height:32px;padding:5px 7px;border-radius:4px}
.wolfpack-changes li:hover{background:var(--bg-hover,#1b231e)}
.wolfpack-changes li.directory-row{display:block;padding:0 0 0 8px;min-width:0}
.wolfpack-changes li.directory-row:hover{background:none}
.wolfpack-changes .directory-row details{margin:3px 0 0}
.wolfpack-changes summary::before{flex:none}
.wolfpack-changes .directory-label{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;unicode-bidi:plaintext;font-family:monospace}
.wolfpack-changes .path{min-width:0;flex:1;font:12px/1.5 monospace;unicode-bidi:plaintext}
.wolfpack-changes .file-name,.wolfpack-changes .directory,.wolfpack-changes .previous-path{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wolfpack-changes .directory,.wolfpack-changes .previous-path{font-size:10px;color:var(--text-muted,#a4b2a9)}
.wolfpack-changes [data-status=deleted] .file-name{text-decoration:line-through}
.wolfpack-changes .kind{flex:none;width:20px;text-align:center;border-radius:3px;background:color-mix(in srgb,currentColor 8%,transparent);font:600 11px/20px monospace;color:#9dc9f4}
.wolfpack-changes [data-status=modified] .kind,.wolfpack-changes [data-status=type-changed] .kind{color:#f1c576}
.wolfpack-changes [data-status=added] .kind,.wolfpack-changes [data-status=untracked] .kind{color:#7fe5a6}
.wolfpack-changes [data-status=deleted] .kind,.wolfpack-changes [data-status=unmerged] .kind{color:#f49898}
.wolfpack-changes .notice{border:1px solid var(--border,#28312b);border-radius:6px;padding:10px;font-size:12px;color:var(--text-muted,#a4b2a9)}
.wolfpack-changes .notice p{margin:0}
.wolfpack-changes .notice[data-kind=empty]{padding:24px 10px;text-align:center}
.wolfpack-changes .notice-symbol{display:block;margin-bottom:6px;font-size:22px}
.wolfpack-changes .notice[data-kind=warning]{border-color:#796134;color:#f1c576}
.wolfpack-changes footer{flex-wrap:wrap;border-top:1px solid var(--border,#28312b);padding-top:8px;color:var(--text-muted,#a4b2a9);font-size:10px}
.wolfpack-changes .auto-refresh{display:flex;align-items:center;gap:5px}
.wolfpack-changes .auto-refresh::before{content:"";width:5px;height:5px;border-radius:50%;background:var(--accent,#45ed7e)}
.wolfpack-changes[data-stale=true] .auto-refresh::before{background:#f1c576}
@media(pointer:coarse),(max-width:600px){.wolfpack-changes .refresh{width:44px;height:44px}.wolfpack-changes summary{min-height:44px}}
${diffs ? DIFF_STYLES + `
.wolfpack-changes{--d2h-dark-color:var(--text-primary,#dce5df);--d2h-dark-bg-color:var(--bg-inset,#0d100e);--d2h-dark-border-color:var(--border,#28312b);--d2h-dark-line-border-color:var(--border-subtle,#1f2621);--d2h-dark-dim-color:var(--text-muted,#a4b2a9);--d2h-dark-file-header-bg-color:var(--bg-elevated,#1c211e);--d2h-dark-file-header-border-color:var(--border,#28312b)}
.wolfpack-changes li.diff-row{display:block;padding:0}
.wolfpack-changes li.diff-row:hover{background:none}
.wolfpack-changes details.file-diff{margin:0;min-width:0}
.wolfpack-changes .file-diff>summary{gap:10px;padding:5px 7px;background:none;font-size:inherit;font-weight:400}
.wolfpack-changes .file-diff>summary:hover{background:var(--bg-hover,#1b231e)}
.wolfpack-changes .diff{min-width:0;margin:2px 0 6px 12px}
.wolfpack-changes .diff-note{margin:0;padding:6px 8px;font-size:12px;color:var(--text-muted,#a4b2a9)}
.wolfpack-changes .d2h-file-header{display:none}
.wolfpack-changes .d2h-file-wrapper{margin:0 0 4px;border-radius:4px;position:relative}/* containing block for diff2html's absolutely positioned line numbers, so they scroll with .files */
.wolfpack-changes .d2h-file-diff{overflow-x:auto}
.wolfpack-changes .d2h-diff-table{font:12px/1.5 var(--font-mono,monospace)}
.wolfpack-changes .diff-bar{display:flex;align-items:center;gap:8px;flex:none;min-width:0;font-size:12px;color:var(--text-muted,#a4b2a9)}
.wolfpack-changes .diff-bar p{margin:0;min-width:0}
.wolfpack-changes .diff-bar[data-stale=true] p{color:#f1c576}
.wolfpack-changes .refresh-diffs{flex:none;margin-left:auto;min-height:32px;padding:0 10px;border:1px solid var(--border,#28312b);border-radius:6px;background:transparent;color:var(--text-primary,#dce5df);font:inherit;cursor:pointer}
.wolfpack-changes .refresh-diffs:hover{background:var(--bg-hover,#1b231e)}
.wolfpack-changes .refresh-diffs[aria-busy=true]{cursor:progress}
@media(pointer:coarse),(max-width:600px){.wolfpack-changes .refresh-diffs{min-height:44px}}
` : ""}`;
      const header = element("header"), branchHeading = element("div", "branch-heading"), branch = element("span", "branch", "Git"), refresh = element("button", "refresh");
      refresh.type = "button"; refresh.title = "Refresh Git status"; refresh.setAttribute("aria-label", "Refresh Git status"); refresh.append(icon("refresh"));
      branchHeading.append(icon("branch"), branch); header.append(branchHeading, refresh);
      const summary = element("div", "summary-line"), count = element("span", "change-count", "Project status");
      summary.append(count, element("span", "read-only", "Read-only"));
      const notice = element("div", "notice"), symbol = element("span", "notice-symbol"), message = element("p");
      symbol.setAttribute("aria-hidden", "true"); symbol.hidden = true; message.setAttribute("role", "status"); notice.append(symbol, message);
      const showMessage = (value: string, kind: "loading" | "empty" | "warning", mark = "") => {
        notice.hidden = !value; notice.dataset.kind = kind; text(message, value); text(symbol, mark); symbol.hidden = !mark;
      };
      showMessage("Checking Git…", "loading");
      const diffBar = element("div", "diff-bar"), diffMessage = element("p"), refreshDiffs = element("button", "refresh-diffs", "Refresh diffs");
      diffBar.hidden = true; diffMessage.setAttribute("role", "status"); refreshDiffs.type = "button"; diffBar.append(diffMessage, refreshDiffs);
      const files = element("div", "files");
      const restored = parseDisclosure((() => { try { return context.storage.get(DISCLOSURE_KEY); } catch { return null; } })());
      // Keep disclosures mounted: refresh must not reset collapse state, focus or the scroll container.
      const groups = GROUP_KEYS.map(key => {
        const title = key[0]!.toUpperCase() + key.slice(1), section = element("details"), heading = element("summary"), badge = element("span", "group-count", "0"), list = element("ul");
        section.dataset.group = key; section.open = !restored.closed.has(key); section.hidden = true;
        list.setAttribute("aria-label", `${title} files`); heading.append(element("span", "", title), badge); section.append(heading, list); files.append(section);
        return { key, section, heading, badge, list, fingerprint: "", directories: new Map<string, DirectoryDisclosure>(), collapsed: restored.collapsed[key], rows: new Map<string, DiffRow>() };
      });
      // Snapshot directly: native toggle events can be queued until after a refresh.
      const snapshot = (group: typeof groups[number]) => {
        for (const [path, directory] of group.directories) {
          if (directory.section.open) group.collapsed.delete(path); else group.collapsed.add(path);
        }
      };
      const serialize = () => JSON.stringify({
        closed: groups.filter(group => !group.section.open).map(group => group.key),
        collapsed: Object.fromEntries(groups.filter(group => group.collapsed.size).map(group => [group.key, [...group.collapsed].slice(-MAX_COLLAPSED)])),
      });
      let saved = serialize();
      const footer = element("footer"), automatic = element("span", "auto-refresh", "Auto-refresh · 5s"), updated = element("time", "updated", "Not checked yet");
      automatic.title = "Updates every five seconds while visible, and when you return to this window.";
      footer.append(automatic, updated);
      root.append(style, header, summary, notice, ...diffs ? [diffBar] : [], files, footer); container.replaceChildren(root);
      let visible = false, disposed = false, timer: ReturnType<typeof setTimeout> | undefined;
      let request: AbortController | undefined, hasResult = false;
      // One diff read serves every open row; it is refetched only for a changed status or an explicit refresh.
      let diff: DiffResult | undefined, diffFingerprint = "", diffRequest: AbortController | undefined, diffFailed = false;
      const active = () => visible && !disposed && !context.signal.aborted && document.visibilityState === "visible";
      const diffGroups = () => groups.filter((group): group is typeof group & { key: DiffSection } => group.key !== "untracked");
      const statusFingerprint = () => diffGroups().map(group => group.fingerprint).join("\n");
      const openRows = () => diffGroups().flatMap(group => [...group.rows.values()].filter(row => row.details.open && row.row.isConnected).map(row => [group.key, row] as const));
      const note = (body: HTMLElement, value: string) => { body.replaceChildren(element("p", "diff-note", value)); };
      const renderDiff = (section: DiffSection, row: DiffRow) => {
        if (!row.details.open || diff && row.rendered === diff) return;
        row.rendered = diff;
        if (!diff) return note(row.body, diffRequest ? "Loading diff…" : diffFailed ? "Diff unavailable." : "");
        if (diff.state === "not-repository") return note(row.body, "Not a Git repository.");
        const sections = row.paths.flatMap(path => diff?.state === "ready" ? diff[section].get(path) ?? [] : []);
        if (!sections.length) return note(row.body, diff.truncated ? "Not shown: the host truncated the diff." : "No diff for this file. It may have changed since the last check.");
        // diff2html escapes paths and diff lines; its output is the only markup inserted as HTML.
        row.body.innerHTML = html(sections.join(""), DIFF_OPTIONS);
        // Long lines scroll inside each file; keyboard users need to reach that scroller.
        for (const scroller of row.body.querySelectorAll<HTMLElement>(".d2h-file-diff")) {
          scroller.tabIndex = 0; scroller.setAttribute("role", "region"); scroller.setAttribute("aria-label", `Diff of ${row.summary.getAttribute("aria-label")}`);
        }
      };
      const updateDiffs = () => {
        const open = openRows();
        for (const [section, row] of open) renderDiff(section, row);
        if (!open.length && diffBar.contains(document.activeElement)) refresh.focus({ preventScroll: true });
        diffBar.hidden = !open.length;
        text(diffMessage, diffRequest ? diff ? "Updating diffs; showing the previous diff." : "Loading diff…"
          : diffFailed ? diff ? "Could not refresh diffs; showing the previous diff." : "Diff unavailable. Try Refresh diffs."
          : diff?.state === "ready" && diff.truncated ? "Diff truncated by the host. Some changes are not shown." : "");
        diffBar.dataset.stale = String(Boolean(diff && (diffRequest || diffFailed)));
      };
      const readDiff = async (force = false) => {
        if (!diffs || !active() || diffRequest || !openRows().length || !force && diff && diffFingerprint === statusFingerprint()) return updateDiffs();
        const current = new AbortController(), fingerprint = statusFingerprint();
        diffRequest = current; refreshDiffs.setAttribute("aria-busy", "true"); updateDiffs();
        try {
          const value = await context.project.gitDiff!(current.signal);
          if (diffRequest !== current) return;
          diff = value.state === "ready" ? { state: "ready", staged: indexDiff(value.staged), unstaged: indexDiff(value.unstaged), truncated: value.truncated } : value;
          diffFingerprint = fingerprint; diffFailed = false;
        } catch {
          if (diffRequest === current) diffFailed = true;
        } finally {
          if (diffRequest === current) { diffRequest = undefined; refreshDiffs.removeAttribute("aria-busy"); updateDiffs(); }
        }
      };
      const render = (status: ProjectGitStatus) => {
        for (const group of groups) {
          const rowFor = (change: GitFileChange): HTMLElement => {
            if (!diffs || group.key === "untracked") return fileRow(change);
            // Rows are keyed by path so an open diff survives polls; changed row content keeps the disclosure state.
            const previous = group.rows.get(change.path), key = JSON.stringify(change);
            if (previous?.key === key) return previous.row;
            const next = diffRow(change); next.details.open = previous?.details.open ?? false; group.rows.set(change.path, next);
            return next.row;
          };
          const changes = status.state === "ready" ? status[group.key] : [];
          const fingerprint = JSON.stringify(changes);
          if (!changes.length && group.section.contains(document.activeElement)) refresh.focus({ preventScroll: true });
          group.section.hidden = !changes.length;
          if (fingerprint === group.fingerprint) continue;
          group.fingerprint = fingerprint; text(group.badge, String(changes.length));
          const focused = document.activeElement;
          const focusedRow = [...group.rows].find(([, row]) => row.summary === focused);
          const focusedPath = focusedRow ? focusedRow[0].slice(0, Math.max(focusedRow[0].lastIndexOf("/"), 0)) : [...group.directories].find(([, directory]) => directory.heading === focused)?.[0];
          snapshot(group);
          renderPaths(group.list, changes, group.directories, group.collapsed, rowFor);
          for (const [path, row] of group.rows) if (!row.row.isConnected) group.rows.delete(path);
          if (focusedPath !== undefined && changes.length) {
            const survivor = focusedRow && group.rows.get(focusedRow[0]);
            let path = survivor ? "" : focusedPath, fallback = survivor?.summary ?? group.heading;
            while (path) {
              const directory = group.directories.get(path);
              if (directory) { fallback = directory.heading; break; }
              const split = path.lastIndexOf("/"); path = split < 0 ? "" : path.slice(0, split);
            }
            // A surviving disclosure may now be inside a collapsed ancestor.
            let ancestor = fallback.parentElement?.parentElement?.closest("details");
            while (ancestor && ancestor !== group.section) {
              if (!ancestor.open) fallback = ancestor.querySelector("summary")!;
              ancestor = ancestor.parentElement?.closest("details") ?? null;
            }
            fallback.focus({ preventScroll: true });
          }
        }
        text(branch, status.state === "ready" ? status.detached ? "Detached HEAD" : status.branch ?? "Git" : "Git"); branch.title = branch.textContent!;
        const total = status.state === "ready" ? new Set([...status.staged, ...status.unstaged, ...status.untracked].map(file => file.path)).size : 0;
        text(count, status.state === "not-repository" ? "Local project" : `${total}${status.truncated ? "+" : ""} changed ${total === 1 && !status.truncated ? "file" : "files"}`);
        if (status.state === "not-repository") showMessage("Not a Git repository.", "empty", "—");
        else if (status.truncated) showMessage("File list truncated. More changes are not shown.", "warning");
        else if (!total) showMessage("Working tree clean.", "empty", "✓");
        else showMessage("", "empty");
        const now = new Date(); updated.dateTime = now.toISOString();
        text(updated, now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
        updated.title = `Last successful check: ${now.toLocaleString()}`;
        root.dataset.stale = "false"; hasResult = true;
        void readDiff();
      };
      const stop = () => {
        clearTimeout(timer); timer = undefined; request?.abort(); request = undefined; refresh.removeAttribute("aria-busy");
        diffRequest?.abort(); diffRequest = undefined; refreshDiffs.removeAttribute("aria-busy");
      };
      const read = async () => {
        if (!active() || request) return;
        clearTimeout(timer); timer = undefined;
        const current = new AbortController(); request = current; refresh.setAttribute("aria-busy", "true");
        try {
          const status = await context.project.gitStatus(current.signal);
          if (active() && request === current) render(status);
        } catch {
          if (active() && request === current) {
            root.dataset.stale = "true";
            showMessage(hasResult ? "Could not refresh; showing the previous result. Try Refresh." : "Git status unavailable. Try Refresh.", "warning");
          }
        } finally {
          if (request === current) {
            request = undefined; refresh.removeAttribute("aria-busy");
            if (active()) timer = setTimeout(() => { void read(); }, 5000);
          }
        }
      };
      // Only user toggles change the serialized state; polls re-create disclosures without changing it.
      const persist = () => {
        if (disposed) return;
        for (const group of groups) snapshot(group);
        const value = serialize();
        if (value === saved) return;
        // A failed write keeps the widget usable; the next toggle retries.
        try { context.storage.set(DISCLOSURE_KEY, value); saved = value; } catch {}
      };
      const onFocus = () => { void read(); };
      const onVisibility = () => { if (active()) void read(); else stop(); };
      const dispose = () => {
        if (disposed) return;
        persist(); disposed = true; stop(); document.removeEventListener("visibilitychange", onVisibility); window.removeEventListener("focus", onFocus);
        context.signal.removeEventListener("abort", dispose); root.remove();
      };
      files.addEventListener("toggle", persist, true);
      if (diffs) files.addEventListener("toggle", event => { if ((event.target as Element).matches(".file-diff")) void readDiff(); }, true);
      refreshDiffs.addEventListener("click", () => { void readDiff(true); });
      refresh.addEventListener("click", onFocus);
      window.addEventListener("focus", onFocus);
      document.addEventListener("visibilitychange", onVisibility);
      context.signal.addEventListener("abort", dispose, { once: true });
      if (context.signal.aborted) dispose();
      return { setVisible(value) { visible = value; root.hidden = !value; onVisibility(); }, dispose };
    },
  });
}
