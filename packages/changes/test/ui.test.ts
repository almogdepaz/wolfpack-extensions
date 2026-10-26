import { expect, test } from "bun:test";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Browser, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const root = join(import.meta.dirname, "..");

/** Generic test-only canvas: it supplies only neutral page sizing and host theme tokens,
 * not Wolfpack layout/framework CSS. The extension owns all tested widget styles. */
async function component({ launch = () => chromium.launch({ headless: true, ...(process.env.WOLFPACK_WIDGET_BRAVE ? { executablePath: process.env.WOLFPACK_WIDGET_BRAVE } : {}) }), diff = false }: { launch?: () => Promise<Browser>; diff?: boolean } = {}) {
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch(request) {
    return new URL(request.url).pathname === "/ui.js"
      ? new Response(Bun.file(join(root, "dist", "ui.js")), { headers: { "content-type": "text/javascript" } })
      : new Response('<meta name="viewport" content="width=device-width,initial-scale=1"><style>:root{--text-primary:#dce5df;--text-muted:#a4b2a9;--bg-hover:#1b231e;--border:#28312b;--accent:#45ed7e;--bg-inset:#0d100e;--bg-elevated:#1c211e}body{margin:0;background:#101511;color:#dce5df}main{height:700px;width:100%}</style><main></main>', { headers: { "content-type": "text/html" } });
  } });
  let browser: Browser | undefined;
  try {
    browser = await launch(); const page = await (await browser.newContext()).newPage(); await page.goto(server.url.toString());
    await page.evaluate(async withDiff => {
      const asset = "/ui.js"; const module = await import(asset); let contribution: any; let abort = new AbortController();
      module.default({ registerContextView(value: any) { contribution = value; }, registerTerminalLayout() {} });
      const git = { calls: 0, value: { state: "not-repository" } as any, fail: false, pending: false, signals: [] as AbortSignal[], releases: [] as Array<(value: any) => void> };
      (globalThis as any).__git = git;
      const diff = { calls: 0, value: { state: "not-repository" } as any, fail: false, pending: false, signals: [] as AbortSignal[], releases: [] as Array<(value: any) => void> };
      (globalThis as any).__diff = diff;
      // Hosts without project.gitDiff omit the member entirely.
      const gitDiff = async (signal: AbortSignal) => { diff.calls++; diff.signals.push(signal); if (diff.fail) throw Error("unavailable"); return diff.pending ? new Promise(resolve => diff.releases.push(resolve)) : diff.value; };
      // Shared across remounts, like host localStorage for one installation/session scope.
      const store = { values: new Map<string, string>(), failGet: false, failSet: false, gets: 0, sets: 0 };
      (globalThis as any).__storage = store;
      const storage = {
        get: (key: string) => { store.gets++; if (store.failGet) throw Error("storage get unavailable"); return store.values.get(key) ?? null; },
        set: (key: string, value: string) => { store.sets++; if (store.failSet) throw Error("storage quota exceeded"); store.values.set(key, value); },
        remove: (key: string) => { store.values.delete(key); },
      };
      const mount = () => contribution.mount(document.querySelector("main"), { signal: abort.signal, scope: { installationId: "installation", sessionId: "11111111-1111-4111-8111-111111111111" }, selection: { selectedSessionId: null }, theme: {}, storage, documents: { read: async () => null, subscribe() { return () => {}; } }, project: { gitStatus: async (signal: AbortSignal) => { git.calls++; git.signals.push(signal); if (git.fail) throw Error("unavailable"); return git.pending ? new Promise(resolve => git.releases.push(resolve)) : git.value; }, ...(withDiff ? { gitDiff } : {}) } });
      let controller = mount();
      (globalThis as any).__sample = { get abort() { return abort; }, get controller() { return controller; }, remount() { abort.abort(); abort = new AbortController(); controller = mount(); controller.setVisible(true); } };
    }, diff);
    return { page, async close() { await browser!.close(); server.stop(true); } };
  } catch (error) { await browser?.close(); server.stop(true); throw error; }
}

/** Native `<details>` toggle events are queued tasks; page.clock fakes timers, so flush with real message tasks. */
async function flushTasks(page: Page) {
  for (let round = 0; round < 2; round++) await page.evaluate(() => new Promise(resolve => { const channel = new MessageChannel(); channel.port1.onmessage = () => resolve(null); channel.port2.postMessage(0); }));
}
/** One file's unified diff in Git's output form; `quoted` is Git's C-quoted spelling of the path (with its tab suffix when the path has spaces). */
function fileDiff(path: string, removed: string[], added: string[], quoted?: string): string {
  const side = (prefix: string) => quoted ? `"${prefix}${quoted}"` : `${prefix}${path}`, tab = quoted?.includes(" ") ? "\t" : "";
  return [`diff --git ${side("a/")} ${side("b/")}`, ...removed.length ? [] : ["new file mode 100644"], ...added.length ? [] : ["deleted file mode 100644"], "index 1111111..2222222",
    `--- ${removed.length ? side("a/") + tab : "/dev/null"}`, `+++ ${added.length ? side("b/") + tab : "/dev/null"}`,
    `@@ -${removed.length ? 1 : 0},${removed.length} +${added.length ? 1 : 0},${added.length} @@`, ...removed.map(line => `-${line}`), ...added.map(line => `+${line}`)].join("\n") + "\n";
}
/** An untracked file as the host diffs it: `git diff --no-index /dev/null <path>`. */
function newFileDiff(path: string, added: string[]): string {
  return [`diff --git a/${path} b/${path}`, "new file mode 100644", "index 0000000..2222222", "--- /dev/null", `+++ b/${path}`, `@@ -0,0 +1,${added.length} @@`, ...added.map(line => `+${line}`)].join("\n") + "\n";
}
const cssString = (value: string) => value.replace(/["\\]/g, "\\$&").replace(/\n/g, "\\a ");
const fileDisclosure = (page: Page, group: string, path: string) => page.locator(`[data-group="${group}"] details.file-diff`).filter({ has: page.locator(`.path[title="${cssString(path)}"]`) });
const diffLines = (page: Page, group: string, path: string) => fileDisclosure(page, group, path).locator(".d2h-code-line-ctn").allTextContents();
function pageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  return errors;
}

test("Changes component retains stale data honestly, pauses hidden reads and ignores late responses after disposal", async () => {
  const fixture = await component();
  try {
    const { page } = fixture;
    await page.clock.install();
    await page.evaluate(() => (globalThis as any).__sample.controller.setVisible(true));
    await page.waitForFunction(() => document.querySelector('.wolfpack-changes [role="status"]')?.textContent === "Not a Git repository.");
    await page.clock.fastForward(5000);
    await page.waitForFunction(() => (globalThis as any).__git.calls === 2);
    const ready = { state: "ready", branch: null, detached: true, staged: [], unstaged: [], untracked: [], truncated: false };
    await page.evaluate(value => { (globalThis as any).__git.value = value; }, ready);
    await page.getByRole("button", { name: "Refresh Git status" }).click();
    await page.waitForFunction(() => document.querySelector(".wolfpack-changes .branch")?.textContent === "Detached HEAD");
    expect(await page.getByRole("status").textContent()).toBe("Working tree clean.");
    await page.evaluate(value => { (globalThis as any).__git.value = { ...value, truncated: true, untracked: [{ path: "<img src=x>", status: "untracked" }] }; }, ready);
    await page.getByRole("button", { name: "Refresh Git status" }).click();
    await page.waitForFunction(() => document.querySelector('.wolfpack-changes [role="status"]')?.textContent?.includes("More changes"));
    expect(await page.locator(".wolfpack-changes img").count()).toBe(0);
    await page.locator(".wolfpack-changes .path").evaluate(node => { (globalThis as any).__retainedGitPath = node; });
    const lastSuccess = await page.locator(".wolfpack-changes .updated").getAttribute("datetime");
    await page.clock.fastForward(1000);
    await page.evaluate(() => { (globalThis as any).__git.fail = true; });
    await page.getByRole("button", { name: "Refresh Git status" }).click();
    await page.waitForFunction(() => document.querySelector('.wolfpack-changes [role="status"]')?.textContent?.includes("previous result"));
    expect(await page.locator(".wolfpack-changes .path").textContent()).toBe("<img src=x>");
    expect(await page.locator(".wolfpack-changes .path").evaluate(node => node === (globalThis as any).__retainedGitPath)).toBe(true);
    expect(await page.locator(".wolfpack-changes .updated").getAttribute("datetime")).toBe(lastSuccess);
    expect(await page.locator(".wolfpack-changes").getAttribute("data-stale")).toBe("true");
    const accessibility = await new AxeBuilder({ page }).include(".wolfpack-changes").withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(accessibility.violations.filter(v => ["serious", "critical"].includes(v.impact ?? ""))).toEqual([]);
    await page.evaluate(() => { const git = (globalThis as any).__git; git.fail = false; git.pending = true; });
    await page.getByRole("button", { name: "Refresh Git status" }).click();
    await page.waitForFunction(() => (globalThis as any).__git.releases.length === 1);
    const calls = await page.evaluate(() => (globalThis as any).__git.calls);
    await page.clock.fastForward(15000); expect(await page.evaluate(() => (globalThis as any).__git.calls)).toBe(calls);
    await page.evaluate(() => { Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" }); document.dispatchEvent(new Event("visibilitychange")); });
    expect(await page.evaluate(() => (globalThis as any).__git.signals.at(-1).aborted)).toBe(true);
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await page.clock.fastForward(20000); expect(await page.evaluate(() => (globalThis as any).__git.calls)).toBe(calls);
    await page.evaluate(value => {
      const git = (globalThis as any).__git; git.pending = false; git.value = { ...value, branch: "current", detached: false };
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" }); document.dispatchEvent(new Event("visibilitychange"));
    }, ready);
    await page.waitForFunction(() => document.querySelector(".wolfpack-changes .branch")?.textContent === "current");
    await page.evaluate(value => (globalThis as any).__git.releases[0]({ ...value, branch: "obsolete", detached: false }), ready);
    expect(await page.locator(".wolfpack-changes .branch").textContent()).toBe("current");
    const beforeDispose = await page.evaluate(() => { (globalThis as any).__sample.abort.abort(); return (globalThis as any).__git.calls; });
    await page.clock.fastForward(20000);
    expect(await page.locator(".wolfpack-changes").count()).toBe(0);
    expect(await page.evaluate(() => (globalThis as any).__git.calls)).toBe(beforeDispose);
  } finally { await fixture.close(); }
}, 20_000);

test("Changes refreshes on browser focus, coalesces reads and ignores focus while hidden or disposed", async () => {
  const fixture = await component();
  try {
    const { page } = fixture; await page.clock.install();
    await page.evaluate(() => (globalThis as any).__sample.controller.setVisible(true));
    await page.waitForFunction(() => document.querySelector('.wolfpack-changes [role="status"]')?.textContent === "Not a Git repository.");
    await page.evaluate(() => {
      (globalThis as any).__git.value = { state: "ready", branch: "automatic", detached: false, staged: [], unstaged: [], untracked: [], truncated: false };
      window.dispatchEvent(new Event("focus"));
    });
    expect(await page.evaluate(() => (globalThis as any).__git.calls)).toBe(2);
    await page.waitForFunction(() => document.querySelector(".wolfpack-changes .branch")?.textContent === "automatic");
    await page.evaluate(() => {
      (globalThis as any).__git.pending = true;
      window.dispatchEvent(new Event("focus")); window.dispatchEvent(new Event("focus")); document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(await page.getByRole("button", { name: "Refresh Git status" }).getAttribute("aria-busy")).toBe("true");
    await page.clock.fastForward(15000);
    expect(await page.evaluate(() => (globalThis as any).__git.calls)).toBe(3);
    await page.evaluate(() => { (globalThis as any).__sample.controller.setVisible(false); window.dispatchEvent(new Event("focus")); });
    expect(await page.evaluate(() => (globalThis as any).__git.signals.at(-1).aborted)).toBe(true);
    expect(await page.evaluate(() => (globalThis as any).__git.calls)).toBe(3);
    await page.evaluate(() => { (globalThis as any).__git.pending = false; (globalThis as any).__sample.controller.setVisible(true); });
    expect(await page.evaluate(() => (globalThis as any).__git.calls)).toBe(4);
    await page.evaluate(() => { (globalThis as any).__sample.abort.abort(); window.dispatchEvent(new Event("focus")); });
    await page.clock.fastForward(15000);
    expect(await page.evaluate(() => (globalThis as any).__git.calls)).toBe(4);
  } finally { await fixture.close(); }
}, 20_000);

test("Changes uses unique counts, literal filename hierarchy and stable keyboard disclosures across automatic refresh", async () => {
  const fixture = await component();
  try {
    const { page } = fixture; await page.clock.install();
    await page.evaluate(() => {
      (globalThis as any).__git.value = { state: "ready", branch: "feature/changes-refinement-with-a-long-branch-name", detached: false, truncated: false,
        staged: [{ path: "src/widgets/changes.ts", status: "modified" }, { path: "src/components/new.ts", previousPath: "src/old.ts", status: "renamed" }],
        unstaged: [{ path: "src/widgets/changes.ts", status: "modified" }, { path: "src/obsolete.ts", status: "deleted" }, { path: "conflict.ts", status: "unmerged" }],
        untracked: [{ path: "new/<img src=x>.ts", status: "untracked" }, { path: `some/very/long/directory/${"x".repeat(200)}.ts`, status: "untracked" }, { path: "generated/", status: "untracked" }],
      };
      (globalThis as any).__sample.controller.setVisible(true);
    });
    await page.waitForFunction(() => document.querySelector(".wolfpack-changes .branch")?.textContent?.startsWith("feature/"));
    expect(await page.locator(".wolfpack-changes .change-count").count()).toBe(1);
    expect(await page.locator(".wolfpack-changes .change-count").textContent()).toBe("7 changed files");
    expect(await page.getByRole("list", { name: "Staged files", exact: true }).locator(".file-name").first().textContent()).toBe("changes.ts");
    expect(await page.getByRole("list", { name: "Staged files", exact: true }).locator(".directory").first().textContent()).toBe("src/widgets");
    expect(await page.locator('.kind[aria-label="Modified"]').first().textContent()).toBe("M");
    expect(await page.locator('.kind[aria-label="Unmerged"]').textContent()).toBe("!");
    expect(await page.locator('.path[title="src/widgets/changes.ts"]').count()).toBe(2);
    expect(await page.locator('.previous-path').textContent()).toBe("from src/old.ts");
    expect(await page.locator(".wolfpack-changes img").count()).toBe(0);
    const summary = page.locator('[data-group="staged"] > summary');
    await summary.focus(); await summary.press("Space");
    expect(await page.locator('[data-group="staged"]').evaluate((node: HTMLDetailsElement) => node.open)).toBe(false);
    await summary.evaluate(node => { (globalThis as any).__gitSummary = node; });
    await page.evaluate(() => { (globalThis as any).__git.value.untracked.push({ path: "auto.ts", status: "untracked" }); });
    await page.clock.fastForward(5000);
    await page.waitForFunction(() => document.querySelector(".wolfpack-changes .change-count")?.textContent === "8 changed files");
    expect(await summary.evaluate(node => node === (globalThis as any).__gitSummary && node === document.activeElement)).toBe(true);
    expect(await page.locator('[data-group="staged"]').evaluate((node: HTMLDetailsElement) => node.open)).toBe(false);
    await summary.press("Enter");
    expect(await page.locator('[data-group="staged"]').evaluate((node: HTMLDetailsElement) => node.open)).toBe(true);
    for (const width of [320, 900]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.locator(".wolfpack-changes").evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
      const refresh = await page.getByRole("button", { name: "Refresh Git status" }).boundingBox();
      expect(refresh!.height).toBeGreaterThanOrEqual(width === 320 ? 44 : 32);
      const accessibility = await new AxeBuilder({ page }).include(".wolfpack-changes").withTags(["wcag2a", "wcag2aa"]).analyze();
      expect(accessibility.violations.filter(v => ["serious", "critical"].includes(v.impact ?? ""))).toEqual([]);
      if (process.env.WOLFPACK_WIDGET_ARTIFACTS) {
        mkdirSync(process.env.WOLFPACK_WIDGET_ARTIFACTS, { recursive: true });
        await page.screenshot({ path: join(process.env.WOLFPACK_WIDGET_ARTIFACTS, `changes-${width}.png`), fullPage: true, animations: "disabled" });
      }
    }
    // If the focused group becomes empty, keep keyboard focus on an available widget control.
    await summary.focus();
    await page.evaluate(() => { (globalThis as any).__git.value.staged = []; window.dispatchEvent(new Event("focus")); });
    await page.waitForFunction(() => (document.querySelector('[data-group="staged"]') as HTMLElement).hidden);
    expect(await page.getByRole("button", { name: "Refresh Git status" }).evaluate(node => node === document.activeElement)).toBe(true);
  } finally { await fixture.close(); }
}, 20_000);


test("Changes nests native directory disclosures, isolates collapse and preserves changed-poll focus with removal fallback", async () => {
  const fixture = await component();
  try {
    const { page } = fixture; await page.clock.install();
    await page.evaluate(() => {
      (globalThis as any).__git.value = { state: "ready", branch: "directories", detached: false, truncated: false,
        staged: [{ path: "tests/unit/a.ts", status: "modified" }, { path: "tests/integration/b.ts", previousPath: "old/b.ts", status: "renamed" }, { path: "root.ts", status: "added" }],
        unstaged: [{ path: "tests/unit/a.ts", status: "modified" }],
        untracked: [{ path: "tests/generated/", status: "untracked" }, { path: "<img src=x>/literal.ts", status: "untracked" }],
      };
      (globalThis as any).__sample.controller.setVisible(true);
    });
    await page.waitForFunction(() => document.querySelector(".branch")?.textContent === "directories");
    const staged = page.locator('[data-group="staged"]');
    const directory = (path: string) => staged.locator(`details[data-directory="${path}"]`);
    const tests = directory("tests"), unit = directory("tests/unit");
    // Root and nested directory paths are native, expanded disclosures, not synthetic tree controls.
    expect(await tests.count()).toBe(1);
    expect(await unit.evaluate((node: HTMLDetailsElement) => node.open)).toBe(true);
    expect(await tests.evaluate((node: HTMLDetailsElement) => node.open)).toBe(true);
    expect(await page.locator(".change-count").textContent()).toBe("5 changed files");
    expect(await staged.locator(":scope > summary .group-count").textContent()).toBe("3");
    expect(await page.locator(".previous-path").textContent()).toBe("from old/b.ts");
    expect(await page.locator('details[data-directory="tests/generated"]').count()).toBe(0);
    expect(await page.locator('.path[title="tests/generated/"] .file-name').textContent()).toBe("generated/");
    expect(await page.locator(".wolfpack-changes img").count()).toBe(0);
    expect(await page.locator('[data-group="untracked"] .directory-label').filter({ hasText: "<img src=x>/" }).textContent()).toBe("<img src=x>/");
    expect(await unit.locator(":scope > summary").textContent()).toBe("tests/unit/");
    for (const width of [320, 900]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.locator(".wolfpack-changes").evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
      const box = await tests.locator(":scope > summary").boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(width === 320 ? 44 : 32);
      const accessibility = await new AxeBuilder({ page }).include(".wolfpack-changes").withTags(["wcag2a", "wcag2aa"]).analyze();
      expect(accessibility.violations.filter(v => ["serious", "critical"].includes(v.impact ?? ""))).toEqual([]);
    }
    const testsHeading = tests.locator(":scope > summary"), unitHeading = unit.locator(":scope > summary");
    await testsHeading.focus(); await testsHeading.press("Space");
    expect(await staged.locator('.path[title="tests/unit/a.ts"]').isVisible()).toBe(false);
    expect(await staged.locator('.path[title="tests/integration/b.ts"]').isVisible()).toBe(false);
    expect(await staged.locator('.path[title="root.ts"]').isVisible()).toBe(true);
    expect(await page.locator('[data-group="unstaged"] .path').isVisible()).toBe(true);
    await page.evaluate(() => { (globalThis as any).__git.value.staged.push({ path: "tests/unit/new.ts", status: "added" }); });
    await page.clock.fastForward(5000);
    await page.waitForFunction(() => document.querySelector('[data-group="staged"] > summary .group-count')?.textContent === "4");
    expect(await tests.evaluate((node: HTMLDetailsElement) => node.open)).toBe(false);
    expect(await testsHeading.evaluate(node => node === document.activeElement)).toBe(true);
    await testsHeading.press("Enter");
    await unitHeading.focus(); await unitHeading.press("Enter");
    await unitHeading.evaluate(node => { (globalThis as any).__directoryHeading = node; });
    await page.evaluate(() => { (globalThis as any).__git.value.staged.push({ path: "tests/unit/another.ts", status: "added" }); });
    await page.clock.fastForward(5000);
    await page.waitForFunction(() => document.querySelector('[data-group="staged"] > summary .group-count')?.textContent === "5");
    expect(await unitHeading.evaluate(node => node === document.activeElement && node === (globalThis as any).__directoryHeading)).toBe(true);
    expect(await unit.evaluate((node: HTMLDetailsElement) => node.open)).toBe(false);
    await testsHeading.focus(); await testsHeading.press("Space"); await testsHeading.press("Space");
    expect(await unit.evaluate((node: HTMLDetailsElement) => node.open)).toBe(false);
    await unitHeading.focus();
    await page.evaluate(() => { const git = (globalThis as any).__git; git.value.staged = git.value.staged.filter((file: any) => !file.path.startsWith("tests/unit/")); });
    await page.clock.fastForward(5000);
    await page.waitForFunction(() => document.querySelector('[data-group="staged"] > summary .group-count')?.textContent === "2");
    expect(await testsHeading.evaluate(node => node === document.activeElement)).toBe(true);
    await page.evaluate(() => { (globalThis as any).__git.value.staged = [{ path: "root.ts", status: "added" }]; });
    await page.clock.fastForward(5000);
    await page.waitForFunction(() => document.querySelector('[data-group="staged"] > summary .group-count')?.textContent === "1");
    expect(await staged.locator(":scope > summary").evaluate(node => node === document.activeElement)).toBe(true);
    await page.evaluate(() => { (globalThis as any).__git.value.staged = []; });
    await page.clock.fastForward(5000);
    await page.waitForFunction(() => (document.querySelector('[data-group="staged"]') as HTMLElement).hidden);
    expect(await page.getByRole("button", { name: "Refresh Git status" }).evaluate(node => node === document.activeElement)).toBe(true);
  } finally { await fixture.close(); }
}, 20_000);

test("Changes restores group and directory disclosures after remount and never writes them on polls", async () => {
  const fixture = await component();
  try {
    const { page } = fixture; await page.clock.install();
    const errors = pageErrors(page);
    await page.evaluate(() => {
      (globalThis as any).__git.value = { state: "ready", branch: "persist", detached: false, truncated: false,
        staged: [{ path: "tests/unit/a.ts", status: "modified" }, { path: "root.ts", status: "added" }],
        unstaged: [{ path: "tests/unit/a.ts", status: "modified" }],
        untracked: [{ path: "docs/notes.md", status: "untracked" }],
      };
      (globalThis as any).__sample.controller.setVisible(true);
    });
    await page.waitForFunction(() => document.querySelector(".wolfpack-changes .branch")?.textContent === "persist");
    const open = (selector: string) => page.locator(selector).evaluate((node: HTMLDetailsElement) => node.open);
    const sets = () => page.evaluate(() => (globalThis as any).__storage.sets as number);
    await page.locator('[data-group="unstaged"] > summary').press("Space");
    await page.locator('[data-group="staged"] details[data-directory="tests"] > summary').press("Space");
    await flushTasks(page);
    const written = await sets();
    expect(written).toBeGreaterThan(0);
    // Polls that remove, re-create and add directories must not rewrite persisted state.
    await page.evaluate(() => { const git = (globalThis as any).__git; git.value.staged = [{ path: "root.ts", status: "added" }]; git.value.untracked.push({ path: "fresh/new/c.ts", status: "untracked" }); });
    await page.clock.fastForward(5000);
    await page.waitForFunction(() => document.querySelector('[data-group="staged"] > summary .group-count')?.textContent === "1");
    await flushTasks(page);
    await page.evaluate(() => { (globalThis as any).__git.value.staged.push({ path: "tests/unit/a.ts", status: "modified" }); });
    await page.clock.fastForward(5000);
    await page.waitForFunction(() => document.querySelector('[data-group="staged"] > summary .group-count')?.textContent === "2");
    await flushTasks(page);
    expect(await sets()).toBe(written);
    expect(await open('[data-group="staged"] details[data-directory="tests"]')).toBe(false);
    await page.evaluate(() => (globalThis as any).__sample.remount());
    await page.waitForFunction(() => document.querySelector('[data-group="staged"] details[data-directory="tests/unit"]'));
    expect(await open('[data-group="unstaged"]')).toBe(false);
    expect(await open('[data-group="staged"]')).toBe(true);
    expect(await open('[data-group="untracked"]')).toBe(true);
    expect(await open('[data-group="staged"] details[data-directory="tests"]')).toBe(false);
    expect(await open('[data-group="staged"] details[data-directory="tests/unit"]')).toBe(true);
    expect(await open('[data-group="unstaged"] details[data-directory="tests"]')).toBe(true);
    await flushTasks(page);
    expect(await sets()).toBe(written);
    expect(errors).toEqual([]);
  } finally { await fixture.close(); }
}, 20_000);

test("Changes keeps default disclosures working when disclosure storage throws or holds invalid data", async () => {
  const fixture = await component();
  try {
    const { page } = fixture; await page.clock.install();
    const errors = pageErrors(page);
    const open = (selector: string) => page.locator(selector).evaluate((node: HTMLDetailsElement) => node.open);
    const storage = () => page.evaluate(() => { const store = (globalThis as any).__storage; return { gets: store.gets as number, sets: store.sets as number, value: store.values.get("disclosure") as string | undefined }; });
    const remount = async (setup: string) => {
      await page.evaluate(setup => {
        // Dispose first: unmount persists the current state, which would overwrite the planted value.
        (globalThis as any).__sample.abort.abort();
        const store = (globalThis as any).__storage; store.failGet = setup === "throw"; store.failSet = setup === "throw";
        if (setup !== "throw") store.values.set("disclosure", setup);
        (globalThis as any).__sample.remount();
      }, setup);
      await page.waitForFunction(() => document.querySelector('[data-group="staged"] details[data-directory="tests"]'));
    };
    await page.evaluate(() => {
      (globalThis as any).__git.value = { state: "ready", branch: "fallback", detached: false, truncated: false,
        staged: [{ path: "tests/unit/a.ts", status: "modified" }, { path: "root.ts", status: "added" }], unstaged: [], untracked: [] };
    });
    await remount("throw");
    expect((await storage()).gets).toBeGreaterThan(0);
    expect(await open('[data-group="staged"]')).toBe(true);
    expect(await open('[data-group="staged"] details[data-directory="tests"]')).toBe(true);
    const before = (await storage()).sets;
    await page.locator('[data-group="staged"] details[data-directory="tests"] > summary').press("Space");
    await flushTasks(page);
    expect((await storage()).sets).toBeGreaterThan(before);
    expect(await open('[data-group="staged"] details[data-directory="tests"]')).toBe(false);
    await page.locator('[data-group="staged"] > summary').press("Space");
    expect(await open('[data-group="staged"]')).toBe(false);
    for (const invalid of ["{not json", "null", "[]", JSON.stringify({ closed: "staged", collapsed: { staged: [1, {}, "x".repeat(5000)], unknown: ["tests"] } })]) {
      await remount(invalid);
      expect(await open('[data-group="staged"]')).toBe(true);
      expect(await open('[data-group="staged"] details[data-directory="tests"]')).toBe(true);
    }
    await page.locator('[data-group="staged"] details[data-directory="tests"] > summary').press("Space");
    await flushTasks(page);
    expect(JSON.parse((await storage()).value!)).toEqual({ closed: [], collapsed: { staged: ["tests"] } });
    // Valid entries survive alongside ignored garbage.
    await remount(JSON.stringify({ closed: ["staged", "bogus"], collapsed: { staged: ["tests/unit", 7] } }));
    expect(await open('[data-group="staged"]')).toBe(false);
    expect(await open('[data-group="staged"] details[data-directory="tests"]')).toBe(true);
    expect(await open('[data-group="staged"] details[data-directory="tests/unit"]')).toBe(false);
    expect(errors).toEqual([]);
  } finally { await fixture.close(); }
}, 20_000);

test("Changes without project.gitDiff keeps plain file rows and no diff controls", async () => {
  const fixture = await component();
  try {
    const { page } = fixture; await page.clock.install();
    await page.evaluate(() => {
      (globalThis as any).__git.value = { state: "ready", branch: "plain", detached: false, truncated: false,
        staged: [{ path: "src/a.ts", status: "modified" }], unstaged: [{ path: "b.ts", status: "modified" }], untracked: [] };
      (globalThis as any).__sample.controller.setVisible(true);
    });
    await page.waitForFunction(() => document.querySelector(".wolfpack-changes .branch")?.textContent === "plain");
    expect(await page.locator(".wolfpack-changes details.file-diff").count()).toBe(0);
    expect(await page.locator(".wolfpack-changes .diff-bar").count()).toBe(0);
    expect(await page.locator('li[aria-label="Modified: src/a.ts"]').count()).toBe(1);
    expect(await page.evaluate(() => (globalThis as any).__diff.calls)).toBe(0);
  } finally { await fixture.close(); }
}, 20_000);

test("Changes renders per-file staged and unstaged diffs from one lazy gitDiff read", async () => {
  const fixture = await component({ diff: true });
  try {
    const { page } = fixture; await page.clock.install();
    const errors = pageErrors(page);
    const staged = fileDiff("src/a.ts", ["base"], ["staged after"]) + fileDiff("added.txt", [], ["hello"]) + fileDiff("gone.txt", ["bye"], [])
      + "diff --git a/bin.dat b/bin.dat\nindex 1111111..2222222 100644\nBinary files a/bin.dat and b/bin.dat differ\n";
    const unstaged = fileDiff("src/a.ts", ["staged after"], ["unstaged after"]) + fileDiff("new\nline.txt", ["n"], ["n2"], "new\\nline.txt")
      + fileDiff("spa ce é.txt", ["q"], ["q2"], "spa ce \\303\\251.txt");
    await page.evaluate(([staged, unstaged]) => {
      (globalThis as any).__diff.value = { state: "ready", staged, unstaged, truncated: false };
      (globalThis as any).__git.value = { state: "ready", branch: "diffs", detached: false, truncated: false,
        staged: [{ path: "src/a.ts", status: "modified" }, { path: "added.txt", status: "added" }, { path: "gone.txt", status: "deleted" }, { path: "bin.dat", status: "modified" }, { path: "late.ts", status: "added" }],
        unstaged: [{ path: "src/a.ts", status: "modified" }, { path: "new\nline.txt", status: "modified" }, { path: "spa ce é.txt", status: "modified" }],
        untracked: [{ path: "loose.txt", status: "untracked" }] };
      (globalThis as any).__sample.controller.setVisible(true);
    }, [staged, unstaged]);
    await page.waitForFunction(() => document.querySelector(".wolfpack-changes .branch")?.textContent === "diffs");
    const calls = () => page.evaluate(() => (globalThis as any).__diff.calls as number);
    expect(await calls()).toBe(0);
    expect(await page.getByRole("button", { name: "Refresh diffs" }).isVisible()).toBe(false);
    await fileDisclosure(page, "staged", "src/a.ts").locator(":scope > summary").click();
    await page.waitForFunction(() => document.querySelector('[data-group="staged"] .d2h-code-line-ctn'));
    expect(await diffLines(page, "staged", "src/a.ts")).toEqual(["base", "staged after"]);
    expect(await calls()).toBe(1);
    expect(await page.getByRole("button", { name: "Refresh diffs" }).isVisible()).toBe(true);
    const unstagedSummary = fileDisclosure(page, "unstaged", "src/a.ts").locator(":scope > summary");
    await unstagedSummary.focus(); await unstagedSummary.press("Enter");
    await page.waitForFunction(() => document.querySelector('[data-group="unstaged"] .d2h-code-line-ctn'));
    expect(await diffLines(page, "unstaged", "src/a.ts")).toEqual(["staged after", "unstaged after"]);
    for (const [group, path] of [["unstaged", "new\nline.txt"], ["unstaged", "spa ce é.txt"], ["staged", "added.txt"], ["staged", "gone.txt"], ["staged", "bin.dat"], ["staged", "late.ts"]] as const) {
      await fileDisclosure(page, group, path).locator(":scope > summary").click();
    }
    await flushTasks(page);
    expect(await calls()).toBe(1);
    expect(await diffLines(page, "unstaged", "new\nline.txt")).toEqual(["n", "n2"]);
    expect(await diffLines(page, "unstaged", "spa ce é.txt")).toEqual(["q", "q2"]);
    expect(await diffLines(page, "staged", "added.txt")).toEqual(["hello"]);
    expect(await diffLines(page, "staged", "gone.txt")).toEqual(["bye"]);
    expect(await fileDisclosure(page, "staged", "bin.dat").locator(".d2h-code-line").textContent()).toContain("Binary file");
    expect(await fileDisclosure(page, "staged", "late.ts").locator(".diff-note").textContent()).toBe("No diff for this file. It may have changed since the last check.");
    expect(await page.evaluate(() => (globalThis as any).__diff.signals[0].aborted)).toBe(false);
    expect(errors).toEqual([]);
  } finally { await fixture.close(); }
}, 20_000);

test("Changes diffs untracked files and summarized untracked directories as new files from the same lazy read", async () => {
  const fixture = await component({ diff: true });
  try {
    const { page } = fixture; await page.clock.install();
    const errors = pageErrors(page);
    const untracked = newFileDiff("loose.txt", ["hello"]) + newFileDiff("fresh/a.ts", ["a"]) + newFileDiff("fresh/sub/b.ts", ["b"]) + newFileDiff("freshly.txt", ["x"]);
    await page.evaluate(untracked => {
      (globalThis as any).__diff.value = { state: "ready", staged: "", unstaged: "", untracked, truncated: false };
      (globalThis as any).__git.value = { state: "ready", branch: "new files", detached: false, truncated: false, staged: [], unstaged: [],
        untracked: [{ path: "loose.txt", status: "untracked" }, { path: "fresh/", status: "untracked" }, { path: "freshly.txt", status: "untracked" }] };
      (globalThis as any).__sample.controller.setVisible(true);
    }, untracked);
    await page.waitForFunction(() => document.querySelector(".wolfpack-changes .branch")?.textContent === "new files");
    const calls = () => page.evaluate(() => (globalThis as any).__diff.calls as number);
    expect(await page.locator('[data-group="untracked"] details.file-diff').count()).toBe(3);
    expect(await calls()).toBe(0);
    await fileDisclosure(page, "untracked", "loose.txt").locator(":scope > summary").click();
    await page.waitForFunction(() => document.querySelector('[data-group="untracked"] .d2h-code-line-ctn'));
    expect(await diffLines(page, "untracked", "loose.txt")).toEqual(["hello"]);
    expect(await calls()).toBe(1);
    // A summarized directory shows every file beneath it, and nothing from a sibling sharing its name prefix.
    await fileDisclosure(page, "untracked", "fresh/").locator(":scope > summary").click();
    await flushTasks(page);
    expect(await diffLines(page, "untracked", "fresh/")).toEqual(["a", "b"]);
    expect(await calls()).toBe(1);
    const accessibility = await new AxeBuilder({ page }).include(".wolfpack-changes").withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(accessibility.violations.filter(v => ["serious", "critical"].includes(v.impact ?? ""))).toEqual([]);
    // Hosts from before untracked diffs omit the section: say so instead of claiming the file changed.
    await page.evaluate(() => { (globalThis as any).__diff.value = { state: "ready", staged: "", unstaged: "", truncated: false }; });
    await page.getByRole("button", { name: "Refresh diffs" }).click();
    await page.waitForFunction(() => document.querySelector('[data-group="untracked"] .diff-note'));
    expect(await calls()).toBe(2);
    for (const path of ["loose.txt", "fresh/"]) expect(await fileDisclosure(page, "untracked", path).locator(".diff-note").textContent()).toBe("This host does not diff untracked files.");
    expect(errors).toEqual([]);
  } finally { await fixture.close(); }
}, 20_000);

test("Changes refetches open diffs on status changes or Refresh diffs, keeps the previous diff while stale and aborts when hidden", async () => {
  const fixture = await component({ diff: true });
  try {
    const { page } = fixture; await page.clock.install();
    const errors = pageErrors(page);
    const version = (text: string) => ({ state: "ready", staged: fileDiff("src/a.ts", ["base"], [text]), unstaged: "", truncated: false });
    await page.evaluate(value => {
      (globalThis as any).__diff.value = value;
      (globalThis as any).__git.value = { state: "ready", branch: "stale", detached: false, truncated: false, staged: [{ path: "src/a.ts", status: "modified" }], unstaged: [], untracked: [] };
      (globalThis as any).__sample.controller.setVisible(true);
    }, version("first"));
    await page.waitForFunction(() => document.querySelector(".wolfpack-changes .branch")?.textContent === "stale");
    const summary = fileDisclosure(page, "staged", "src/a.ts").locator(":scope > summary");
    const message = page.locator(".wolfpack-changes .diff-bar [role=status]"), refreshDiffs = page.getByRole("button", { name: "Refresh diffs" });
    const calls = () => page.evaluate(() => (globalThis as any).__diff.calls as number);
    await summary.focus(); await summary.press("Enter");
    await page.waitForFunction(() => document.querySelector(".d2h-code-line-ctn"));
    expect(await diffLines(page, "staged", "src/a.ts")).toEqual(["base", "first"]);
    expect(await message.textContent()).toBe("");
    await summary.evaluate(node => { (globalThis as any).__diffSummary = node; });
    // A changed status fingerprint refetches while the previous diff stays visible.
    await page.evaluate(() => { (globalThis as any).__diff.pending = true; (globalThis as any).__git.value.unstaged = [{ path: "b.ts", status: "modified" }]; });
    await page.clock.fastForward(5000);
    await page.waitForFunction(() => (globalThis as any).__diff.calls === 2);
    expect(await message.textContent()).toBe("Updating diffs; showing the previous diff.");
    expect(await diffLines(page, "staged", "src/a.ts")).toEqual(["base", "first"]);
    expect(await summary.evaluate(node => node === (globalThis as any).__diffSummary && node === document.activeElement)).toBe(true);
    expect(await fileDisclosure(page, "staged", "src/a.ts").evaluate((node: HTMLDetailsElement) => node.open)).toBe(true);
    await page.evaluate(value => { const diff = (globalThis as any).__diff; diff.pending = false; diff.releases[0](value); }, version("second"));
    await page.waitForFunction(() => [...document.querySelectorAll(".d2h-code-line-ctn")].some(node => node.textContent === "second"));
    expect(await message.textContent()).toBe("");
    // Unchanged status does not refetch; Refresh diffs does.
    await page.clock.fastForward(5000); await flushTasks(page);
    expect(await calls()).toBe(2);
    await page.evaluate(value => { (globalThis as any).__diff.value = { ...value, truncated: true }; }, version("third"));
    await refreshDiffs.click();
    await page.waitForFunction(() => [...document.querySelectorAll(".d2h-code-line-ctn")].some(node => node.textContent === "third"));
    expect(await calls()).toBe(3);
    expect(await message.textContent()).toBe("Diff truncated by the host. Some changes are not shown.");
    await fileDisclosure(page, "unstaged", "b.ts").locator(":scope > summary").click();
    await page.waitForFunction(() => document.querySelector('[data-group="unstaged"] .diff-note'));
    expect(await fileDisclosure(page, "unstaged", "b.ts").locator(".diff-note").textContent()).toBe("Not shown: the host truncated the diff.");
    await page.evaluate(() => { (globalThis as any).__diff.fail = true; });
    await refreshDiffs.click();
    await page.waitForFunction(() => document.querySelector(".wolfpack-changes .diff-bar [role=status]")?.textContent?.startsWith("Could not"));
    expect(await message.textContent()).toBe("Could not refresh diffs; showing the previous diff.");
    expect(await diffLines(page, "staged", "src/a.ts")).toEqual(["base", "third"]);
    await summary.press("Enter");
    expect(await fileDisclosure(page, "staged", "src/a.ts").evaluate((node: HTMLDetailsElement) => node.open)).toBe(false);
    await page.evaluate(() => { const diff = (globalThis as any).__diff; diff.fail = false; diff.pending = true; });
    await refreshDiffs.click();
    await page.waitForFunction(() => (globalThis as any).__diff.calls === 5);
    await page.evaluate(() => (globalThis as any).__sample.controller.setVisible(false));
    expect(await page.evaluate(() => (globalThis as any).__diff.signals.at(-1).aborted)).toBe(true);
    // Closing every diff hides the shared diff controls.
    await page.evaluate(() => { (globalThis as any).__diff.pending = false; (globalThis as any).__sample.controller.setVisible(true); });
    await fileDisclosure(page, "unstaged", "b.ts").locator(":scope > summary").click();
    await flushTasks(page);
    expect(await refreshDiffs.isVisible()).toBe(false);
    // A first read that fails leaves rows usable and says so.
    await page.evaluate(() => { (globalThis as any).__diff.fail = true; (globalThis as any).__sample.remount(); });
    await page.waitForFunction(() => document.querySelector(".wolfpack-changes .branch")?.textContent === "stale");
    await fileDisclosure(page, "staged", "src/a.ts").locator(":scope > summary").click();
    await page.waitForFunction(() => document.querySelector(".wolfpack-changes .diff-bar [role=status]")?.textContent?.startsWith("Diff unavailable"));
    expect(await message.textContent()).toBe("Diff unavailable. Try Refresh diffs.");
    expect(await fileDisclosure(page, "staged", "src/a.ts").locator(".diff-note").textContent()).toBe("Diff unavailable.");
    expect(errors).toEqual([]);
  } finally { await fixture.close(); }
}, 20_000);

test("Changes renders hostile diff content inert, scopes diff styles and keeps long diffs inside the widget", async () => {
  const fixture = await component({ diff: true });
  try {
    const { page } = fixture; await page.clock.install();
    const errors = pageErrors(page);
    const hostile = '<img src=x onerror="window.__xss=1">.ts';
    const staged = fileDiff(hostile, ["<script>window.__xss=2</script>"], ['<a href="javascript:window.__xss=3">x</a><iframe src="javascript:window.__xss=4"></iframe><img src=x onerror="window.__xss=5">']);
    const unstaged = fileDiff("src/long.ts", ["short"], [`const value = "${"x".repeat(2000)}";`]);
    await page.evaluate(([staged, unstaged, hostile]) => {
      document.body.insertAdjacentHTML("beforeend", '<div class="line-num1 d2h-probe"></div>');
      (globalThis as any).__diff.value = { state: "ready", staged, unstaged, truncated: false };
      (globalThis as any).__git.value = { state: "ready", branch: "hostile", detached: false, truncated: false,
        staged: [{ path: hostile, status: "modified" }], unstaged: [{ path: "src/long.ts", status: "modified" }], untracked: [] };
      (globalThis as any).__sample.controller.setVisible(true);
    }, [staged, unstaged, hostile]);
    await page.waitForFunction(() => document.querySelector(".wolfpack-changes .branch")?.textContent === "hostile");
    await fileDisclosure(page, "staged", hostile).locator(":scope > summary").click();
    await fileDisclosure(page, "unstaged", "src/long.ts").locator(":scope > summary").click();
    await page.waitForFunction(() => document.querySelectorAll(".wolfpack-changes .d2h-file-wrapper").length === 2);
    expect(await diffLines(page, "staged", hostile)).toEqual(["<script>window.__xss=2</script>", '<a href="javascript:window.__xss=3">x</a><iframe src="javascript:window.__xss=4"></iframe><img src=x onerror="window.__xss=5">']);
    expect(await page.locator(".wolfpack-changes :is(script, img, iframe, a, object, embed)").count()).toBe(0);
    expect(await page.evaluate(() => (globalThis as any).__xss)).toBeUndefined();
    // The diff stylesheet must not define page-wide variables or style host elements that share its class names.
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--d2h-bg-color"))).toBe("");
    expect(await page.locator(".d2h-probe").evaluate(node => getComputedStyle(node).float)).toBe("none");
    for (const width of [320, 900]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.locator(".wolfpack-changes").evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
      expect(await page.locator(".wolfpack-changes .files").evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      const box = await page.getByRole("button", { name: "Refresh diffs" }).boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(width === 320 ? 44 : 32);
      const accessibility = await new AxeBuilder({ page }).include(".wolfpack-changes").withTags(["wcag2a", "wcag2aa"]).analyze();
      expect(accessibility.violations.filter(v => ["serious", "critical"].includes(v.impact ?? ""))).toEqual([]);
      if (process.env.WOLFPACK_WIDGET_ARTIFACTS) {
        mkdirSync(process.env.WOLFPACK_WIDGET_ARTIFACTS, { recursive: true });
        await page.screenshot({ path: join(process.env.WOLFPACK_WIDGET_ARTIFACTS, `changes-diff-${width}.png`), fullPage: true, animations: "disabled" });
      }
    }
    expect(errors).toEqual([]);
  } finally { await fixture.close(); }
}, 20_000);

test("Changes keeps diff line numbers on their rows and inside the file list while it scrolls", async () => {
  const fixture = await component({ diff: true });
  try {
    const { page } = fixture; await page.clock.install();
    const errors = pageErrors(page);
    const wide = `const value = "${"x".repeat(2000)}";`;
    const staged = fileDiff("src/long.ts", Array.from({ length: 60 }, (_, i) => `old ${i}`), [wide, ...Array.from({ length: 80 }, (_, i) => `new ${i}`)]);
    await page.evaluate(staged => {
      (globalThis as any).__diff.value = { state: "ready", staged, unstaged: "", truncated: false };
      (globalThis as any).__git.value = { state: "ready", branch: "long", detached: false, truncated: false, staged: [{ path: "src/long.ts", status: "modified" }], unstaged: [], untracked: [] };
      (globalThis as any).__sample.controller.setVisible(true);
    }, staged);
    await page.waitForFunction(() => document.querySelector(".wolfpack-changes .branch")?.textContent === "long");
    await fileDisclosure(page, "staged", "src/long.ts").locator(":scope > summary").click();
    await page.waitForFunction(() => document.querySelectorAll(".wolfpack-changes .d2h-code-line-ctn").length === 141);
    // diff2html positions line numbers absolutely; without a containing block inside `.files` they stay put (and stay painted) while the list scrolls.
    const geometry = await page.evaluate(wide => {
      const files = document.querySelector(".wolfpack-changes .files")!, box = files.getBoundingClientRect();
      files.scrollTop = 300;
      const rows = [...document.querySelectorAll(".wolfpack-changes .d2h-diff-tbody tr")], numberOf = (row: Element) => row.querySelector(".d2h-code-linenumber")!;
      const drift = rows.map(row => Math.round(numberOf(row).getBoundingClientRect().top - row.getBoundingClientRect().top));
      const escaped = rows.filter(row => { const rect = numberOf(row).getBoundingClientRect(), x = rect.left + 10, y = rect.top + rect.height / 2;
        return (y < box.top || y > box.bottom) && y >= 0 && y <= innerHeight && !!document.elementFromPoint(x, y)?.closest(".d2h-code-linenumber"); }).length;
      // Horizontal scrolling of one file still keeps the number gutter in place while the code moves.
      const row = rows.find(row => row.querySelector(".d2h-code-line-ctn")?.textContent === wide)!, code = row.querySelector(".d2h-code-line")!;
      const scroller = document.querySelector(".wolfpack-changes .d2h-file-diff")!, before = { number: numberOf(row).getBoundingClientRect().left, code: code.getBoundingClientRect().left };
      scroller.scrollLeft = 200;
      return { scrollTop: files.scrollTop, drift, escaped, scrollLeft: scroller.scrollLeft, numberShift: numberOf(row).getBoundingClientRect().left - before.number, codeShift: code.getBoundingClientRect().left - before.code };
    }, wide);
    expect(geometry.scrollTop).toBe(300);
    expect(geometry.drift).toEqual(geometry.drift.map(() => 0));
    expect(geometry.escaped).toBe(0);
    expect(geometry.scrollLeft).toBe(200);
    expect(geometry.numberShift).toBe(0);
    expect(geometry.codeShift).toBe(-200);
    expect(errors).toEqual([]);
  } finally { await fixture.close(); }
}, 20_000);

test("Changes manifest and default registration declare only the context view", async () => {
  const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  expect(manifest.wolfpack).toMatchObject({ manifestVersion: 1, apiVersion: 1, id: "changes", ui: "dist/ui.js", skills: [], documents: [] });
  const asset = "../dist/ui.js"; const register = (await import(asset)).default as (host: any) => void; const views: string[] = []; const layouts: string[] = [];
  register({ registerContextView: (view: { id: string }) => views.push(view.id), registerTerminalLayout: (layout: { title: string }) => layouts.push(layout.title) });
  expect(views).toEqual(["changes"]); expect(layouts).toEqual([]);
});
