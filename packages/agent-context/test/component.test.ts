import { expect, test } from "bun:test";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Browser } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { claudeFocusDocument, focusDocument } from "./focus-fixture.ts";

const root = join(import.meta.dirname, "..");
type ComponentDependencies = { launch?: () => Promise<Browser>; onServer?: (url: string) => void; themeFixture?: boolean; };
const selectedHostStyles = process.env.WOLFPACK_EXTENSION_HOST_CSS_PATH ?? (process.env.WOLFPACK_EXTENSION_HOST_ROOT ? join(process.env.WOLFPACK_EXTENSION_HOST_ROOT, "public", "styles.css") : undefined);
const hostWrapper = '<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><div id="workspace-context-region"><div id="workspace-context-container"><section class="widget-panel" style="width:100%;flex:1;max-height:none"><div class="widget-content"><main></main></div></section></div></div>';

async function component({ launch = () => chromium.launch({ headless: true, ...(process.env.WOLFPACK_WIDGET_BRAVE ? { executablePath: process.env.WOLFPACK_WIDGET_BRAVE } : {}) }), onServer, themeFixture = false }: ComponentDependencies = {}) {
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch(request) {
    const path = new URL(request.url).pathname;
    if (path === "/ui.js") return new Response(Bun.file(join(root, "dist", "ui.js")), { headers: { "content-type": "text/javascript" } });
    if (path === "/styles.css" && selectedHostStyles) return new Response(Bun.file(selectedHostStyles), { headers: { "content-type": "text/css" } });
    const neutral = '<meta name="viewport" content="width=device-width,initial-scale=1"><style>:root{--text-primary:#edf3ef;--text-muted:#c1c9c3;--text-secondary:#d2d8d3;--bg-surface:#131715;--bg-inset:#0d100e;--bg-hover:#1b231e;--border-subtle:#59655e;--border-input:#647168;--border-hover:#718077;--accent:#45ed7e;--warning:#ebca78}body{margin:0;background:#101511;color:#edf3ef}.widget-content{padding:16px}</style><div class="widget-content"><main></main></div>';
    return new Response(themeFixture && selectedHostStyles ? hostWrapper : themeFixture ? neutral : "<main></main>", { headers: { "content-type": "text/html" } });
  } });
  let browser: Browser | undefined; let failed = false;
  try {
    onServer?.(server.url.toString());
    browser = await launch(); const browserContext = await browser.newContext(); const page = await browserContext.newPage(); await page.goto(server.url.toString());
    await page.evaluate(async () => {
      const asset = "/ui.js"; const module = await import(asset); let contribution: any; let publish: any; let releases = 0;
      module.default({ registerContextView(value: any) { contribution = value; }, registerTerminalLayout() {} });
      let abort = new AbortController(); const storage = new Map<string, string>();
      const git = { calls: 0, value: { state: "not-repository" } as any, fail: false, pending: false, signals: [] as AbortSignal[], releases: [] as Array<(value: any) => void> };
      (globalThis as any).__git = git;
      const mount = () => contribution.mount(document.querySelector("main"), {
        signal: abort.signal, scope: { installationId: "installation", sessionId: "11111111-1111-4111-8111-111111111111" },
        selection: { selectedSessionId: null }, theme: {},
        storage: { get: (key: string) => storage.get(key) ?? null, set: (key: string, value: string) => storage.set(key, value), remove: (key: string) => storage.delete(key) },
        documents: { read: async () => null, subscribe(_id: string, listener: any) { publish = listener; listener(null, 0); return () => { releases++; }; } },
        project: { gitStatus: async (signal: AbortSignal) => { git.calls++; git.signals.push(signal); if (git.fail) throw Error("unavailable"); return git.pending ? new Promise(resolve => git.releases.push(resolve)) : git.value; } },
      });
      let controller = mount();
      (globalThis as any).__sample = {
        get abort() { return abort; }, get controller() { return controller; },
        publish(value: unknown, revision: number) { publish(value, revision); }, storage, releases: () => releases,
        remount() { controller.dispose(); abort.abort(); abort = new AbortController(); controller = mount(); },
      };
    });
    return { page, async close() { await browser!.close(); server.stop(true); } };
  } catch (error) { failed = true; try { await browser?.close(); } catch {} server.stop(true); throw error; }
  finally { if (failed) server.stop(true); }
}

test("component fixture releases server and partial browser after later startup rejection", async () => {
  let serverUrl = ""; let closes = 0;
  const partial = { close: async () => { closes++; }, newContext: async () => ({ newPage: async () => { throw new Error("new page failed"); } }) } as unknown as Browser;
  await expect(component({ launch: async () => partial, onServer: (url) => { serverUrl = url; } })).rejects.toThrow("new page failed");
  expect(closes).toBe(1);
  await expect(fetch(serverUrl)).rejects.toThrow();
});

test("empty Agent Context explains companion activation and explicit fallback for the exact scope", async () => {
  const fixture = await component();
  try {
    const { page } = fixture;
    await page.setViewportSize({ width: 220, height: 960 });
    const guidance = page.getByText(/Installing the Wolfpack extension adds this panel, not the Claude Code plugin or Pi companion/);
    expect(await guidance.isVisible()).toBe(true);
    for (const command of [
      "claude plugin marketplace add /path/to/wolfpack-extensions",
      "claude plugin install wolfpack-agent-context@wolfpack-extensions",
      "pi install /path/to/wolfpack-extensions/packages/agent-context",
    ]) expect(await page.getByText(command, { exact: true }).isVisible()).toBe(true);
    expect(await page.getByText(/Start a new session in Wolfpack after setup/).isVisible()).toBe(true);
    expect(await page.getByText(/Manual recovery is not automatic setup/).isVisible()).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(await page.locator(".wac-guidance").textContent()).not.toContain("Other agents can publish");
    expect(await page.getByRole("button", { name: "Copy request" }).isVisible()).toBe(true);
    await page.getByText("Session details", { exact: true }).click();
    expect(await page.locator(".wac-session-id").textContent()).toBe("11111111-1111-4111-8111-111111111111");
    await page.evaluate(() => (globalThis as any).__sample.publish({ schemaVersion: 1, goal: "A real document", planItems: [], decisions: [], blockers: [], nextSteps: [] }, 1));
    expect(await guidance.isVisible()).toBe(false);
  } finally { await fixture.close(); }
});

test("generated Agent Context component preserves focused drafts and ignores late stale revisions", async () => {
  const fixture = await component(); try { const { page } = fixture; expect(await page.locator("h2").textContent()).toContain("No context"); await page.getByText("Local draft", { exact: true }).click(); await page.locator("textarea").fill("draft"); await page.locator("textarea").evaluate((node: HTMLTextAreaElement) => { node.focus(); node.setSelectionRange(1, 4); (globalThis as any).editor = node; }); await page.evaluate(() => { const sample = (globalThis as any).__sample; const value = { schemaVersion: 1, goal: "<img src=x onerror=alert(1)>", planItems: [], decisions: [], blockers: [], nextSteps: [] }; sample.publish(value, 2); sample.publish({ ...value, goal: "stale" }, 1); }); expect(await page.locator("h2").textContent()).toBe("<img src=x onerror=alert(1)>"); expect(await page.locator("img").count()).toBe(0); expect(await page.locator("textarea").inputValue()).toBe("draft"); expect(await page.evaluate(() => { const node = (globalThis as any).editor; return [node === document.querySelector("textarea"), document.activeElement === node, node.selectionStart, node.selectionEnd]; })).toEqual([true, true, 1, 4]); } finally { await fixture.close(); }
}, 20_000);

const richDocument = {
  schemaVersion: 1, goal: "Make Agent Context easier to scan",
  planItems: [
    { id: "inspect", text: "Inspect the changes\n\nReview spacing, hierarchy and interactions.", status: "in_progress" },
    { id: "ship", text: "Apply the update\n\nKeep the live terminal and its session unchanged.", status: "pending" },
  ],
  decisions: ["Native disclosures\n\nKeyboard, touch and pointer users can expand each item independently."],
  blockers: ["Feedback needed\n\nWaiting for the design review before claiming visual acceptance."],
  nextSteps: ["Review the narrow sidebar\n\nCheck long headlines and expanded descriptions."],
};

test("bullet disclosures preserve keyboard focus and independent expansion across updates and reordering", async () => {
  const fixture = await component({ themeFixture: true });
  try {
    const { page } = fixture;
    await page.evaluate((value) => (globalThis as any).__sample.publish(value, 1), richDocument);
    const inspect = page.locator(".wac-item summary").filter({ hasText: "Inspect the changes" });
    const ship = page.locator(".wac-item summary").filter({ hasText: "Apply the update" });
    expect(await inspect.locator("..").getAttribute("open")).toBeNull();
    await inspect.focus(); await page.keyboard.press("Enter");
    expect(await page.getByText("Review spacing, hierarchy and interactions.", { exact: true }).isVisible()).toBe(true);
    expect(await ship.locator("..").getAttribute("open")).toBeNull();
    await page.waitForFunction(() => (globalThis as any).__sample.storage.get('bullet-open:["plan","inspect",0]') === "true");
    await inspect.evaluate((element) => { (globalThis as any).__focusedSummary = element; });
    await page.evaluate((value) => {
      const sample = (globalThis as any).__sample;
      sample.publish({ ...value, planItems: [value.planItems[1], { ...value.planItems[0], text: "Inspect the revised changes\n\nNew supporting detail." }] }, 2);
      sample.publish(value, 1);
    }, richDocument);
    expect(await page.evaluate(() => document.activeElement === (globalThis as any).__focusedSummary)).toBe(true);
    expect(await page.getByText("New supporting detail.", { exact: true }).isVisible()).toBe(true);
    await page.keyboard.press("Space");
    expect(await page.getByText("New supporting detail.", { exact: true }).isVisible()).toBe(false);
    expect(await page.locator(".wac-item").count()).toBe(5);
    await page.evaluate(() => (globalThis as any).__sample.controller.setVisible(false));
    expect(await page.locator(".wolfpack-agent-context").isVisible()).toBe(false);
    await page.evaluate(() => (globalThis as any).__sample.controller.setVisible(true));
    expect(await page.locator(".wolfpack-agent-context").isVisible()).toBe(true);
  } finally { await fixture.close(); }
}, 20_000);

test("disclosure preferences and local draft survive remount without publishing or opening empty expanders", async () => {
  const fixture = await component();
  try {
    const { page } = fixture;
    await page.evaluate((value) => (globalThis as any).__sample.publish(value, 1), richDocument);
    await page.getByText("Native disclosures", { exact: true }).click();
    await page.getByText("Local draft", { exact: true }).click();
    await page.getByRole("textbox", { name: "Local draft", exact: true }).fill("Keep this local");
    await page.waitForFunction(() => (globalThis as any).__sample.storage.get('bullet-open:["decisions","Native disclosures",0]') === "true");
    await page.evaluate((value) => { const sample = (globalThis as any).__sample; sample.remount(); sample.publish(value, 1); }, richDocument);
    expect(await page.getByRole("textbox", { name: "Local draft", exact: true }).inputValue()).toBe("Keep this local");
    expect(await page.getByText(richDocument.decisions[0].split("\n\n")[1]!, { exact: true }).isVisible()).toBe(true);
    await page.evaluate(() => (globalThis as any).__sample.publish({ schemaVersion: 1, goal: "Legacy", planItems: [{ id: "plain", text: "Existing plan", status: "complete" }], decisions: ["An existing decision"], blockers: [], nextSteps: [] }, 2));
    expect(await page.getByText("An existing decision", { exact: true }).isVisible()).toBe(true);
    expect(await page.locator(".wac-item details:not([hidden])").count()).toBe(0);
    expect(await page.getByText("No blockers reported", { exact: false }).isVisible()).toBe(true);
    expect(await page.getByRole("region", { name: "Blockers", exact: true }).isVisible()).toBe(false);
  } finally { await fixture.close(); }
}, 20_000);

test("all plan states stay readable, blockers are prominent, and expanded hostile text stays inert", async () => {
  const fixture = await component({ themeFixture: true });
  try {
    const { page } = fixture;
    const statuses = ["pending", "in_progress", "complete", "blocked"];
    await page.evaluate((value) => (globalThis as any).__sample.publish(value, 1), { ...richDocument, planItems: statuses.map((status) => ({ id: status, text: `${status}\n\n<img src=x onerror=alert(1)>\n<script>bad()</script>`, status })) });
    for (const label of ["Pending", "In progress", "Complete", "Blocked"]) expect(await page.locator(".wac-status").getByText(label, { exact: true }).isVisible()).toBe(true);
    expect(await page.getByRole("progressbar").count()).toBe(0);
    expect(await page.getByText(richDocument.blockers[0].split("\n\n")[1]!, { exact: true }).isVisible()).toBe(true);
    const plan = page.getByRole("region", { name: "Plan", exact: true });
    await plan.locator(".wac-item summary").first().click();
    expect(await plan.locator(".wac-detail").first().textContent()).toContain("<img src=x onerror=alert(1)>");
    expect(await page.locator(".wolfpack-agent-context img, .wolfpack-agent-context script").count()).toBe(0);
    await page.evaluate(() => (globalThis as any).__sample.publish({ invalid: true }, 2));
    expect(await page.getByRole("heading", { name: "Context unavailable" }).isVisible()).toBe(true);
    expect(await page.locator(".wac-content").isVisible()).toBe(false);
    await page.evaluate((value) => (globalThis as any).__sample.publish(value, 3), richDocument);
    expect(await page.getByRole("heading", { name: richDocument.goal }).isVisible()).toBe(true);
  } finally { await fixture.close(); }
}, 20_000);

test("copy and draft storage failures are explicit and do not lose draft input", async () => {
  const fixture = await component();
  try {
    const { page } = fixture;
    await page.evaluate(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => { throw new Error("denied"); } } }));
    await page.getByRole("button", { name: "Copy request" }).click();
    expect(await page.getByRole("status").textContent()).toContain("Could not copy");
    await page.getByText("Local draft", { exact: true }).click();
    await page.evaluate(() => { (globalThis as any).__sample.storage.set = () => { throw new Error("quota"); }; });
    await page.getByRole("textbox", { name: "Local draft", exact: true }).fill("Unsaved but retained");
    expect(await page.getByText(/Could not save in this browser/).isVisible()).toBe(true);
    expect(await page.getByRole("textbox", { name: "Local draft", exact: true }).inputValue()).toBe("Unsaved but retained");
    await page.evaluate(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (text: string) => { (globalThis as any).__copied = text; } } }));
    await page.getByRole("button", { name: "Copy request" }).click();
    expect(await page.evaluate(() => (globalThis as any).__copied)).toContain("Update this session's context");
  } finally { await fixture.close(); }
}, 20_000);

test("widget has no horizontal overflow or serious accessibility violations with long expanded content", async () => {
  const fixture = await component({ themeFixture: true });
  try {
    const { page } = fixture;
    await page.evaluate((value) => (globalThis as any).__sample.publish(value, 1), { ...richDocument, decisions: ["A".repeat(240) + "\n\nhttps://example.test/" + "long".repeat(1000)] });
    await page.locator(".wac-item summary").filter({ hasText: "A".repeat(240) }).click();
    for (const width of [220, 320, 960]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(await page.locator(".wolfpack-agent-context").evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await page.setViewportSize({ width: 320, height: 1000 });
    const results = await new AxeBuilder({ page }).include(".wolfpack-agent-context").withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(results.violations).toEqual([]);
    await page.emulateMedia({ reducedMotion: "reduce" });
    expect(await page.locator(".wac-chevron").first().evaluate((element) => getComputedStyle(element).transitionDuration)).toBe("0s");
  } finally { await fixture.close(); }
}, 20_000);

test("Agent Context visual fixture uses neutral theme fixture at narrow, sidebar and full-view widths", async () => {
  const fixture = await component({ themeFixture: true });
  try {
    const document = process.env.WOLFPACK_WIDGET_DOCUMENT
      ? JSON.parse(readFileSync(process.env.WOLFPACK_WIDGET_DOCUMENT, "utf8")).document
      : { ...focusDocument, goal: "Keep the session focused without check-ins", now: { id: "design", text: "Refine the focus panel", details: "Keep meaningful focus, user actions and next steps readable at a glance." }, needsYou: [{ id: "review", text: "Review the narrow layout", details: "Check long headlines, disclosures and keyboard interaction." }] };
    await fixture.page.evaluate((value) => (globalThis as any).__sample.publish(value, 1), document);
    for (const width of [220, 320, 960]) {
      await fixture.page.setViewportSize({ width, height: 1000 });
      expect(await fixture.page.locator("h2").textContent()).toBe(document.goal);
      expect(await fixture.page.locator(".widget-content").evaluate(el => getComputedStyle(el).padding)).toBe("16px");
      expect(await fixture.page.locator(".wac-goal").evaluate(el => getComputedStyle(el).borderRadius)).toBe("9px");
      expect(await fixture.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      if (process.env.WOLFPACK_WIDGET_ARTIFACTS) {
        mkdirSync(process.env.WOLFPACK_WIDGET_ARTIFACTS, { recursive: true });
        await fixture.page.screenshot({ path: join(process.env.WOLFPACK_WIDGET_ARTIFACTS, `widget-${width}.png`), fullPage: true });
      }
    }
    if (process.env.WOLFPACK_WIDGET_ARTIFACTS && await fixture.page.locator(".wac-item details:not([hidden]) summary").count()) {
      await fixture.page.setViewportSize({ width: 320, height: 1000 });
      await fixture.page.locator(".wac-item details:not([hidden]) summary").first().click();
      await fixture.page.screenshot({ path: join(process.env.WOLFPACK_WIDGET_ARTIFACTS, "widget-expanded-320.png"), fullPage: true, animations: "disabled" });
    }
  } finally { await fixture.close(); }
}, 20_000);

test("generated Agent Context component releases once across abort, dispose, and late notification", async () => {
  const fixture = await component(); try { const result = await fixture.page.evaluate(() => { const sample = (globalThis as any).__sample; sample.abort.abort(); sample.controller.dispose(); sample.publish({ schemaVersion: 1, goal: "late", planItems: [], decisions: [], blockers: [], nextSteps: [] }, 1); return sample.releases(); }); expect(result).toBe(1); } finally { await fixture.close(); }
}, 20_000);


test("focus glance preserves actions, critical overflow, draft selection and honest runtime freshness", async () => {
  const fixture = await component({ themeFixture: true });
  try {
    const { page } = fixture;
    const value = { ...focusDocument, now: { ...focusDocument.now, text: "Long focus headline ".repeat(12).trim() }, needsYou: Array.from({ length: 5 }, (_, i) => ({ id: `ask-${i}`, text: `Question ${i}`, details: "Choose explicitly" })), needToKnow: Array.from({ length: 5 }, (_, i) => ({ id: `fact-${i}`, text: `Critical fact ${i}` })) };
    await page.evaluate(value => (globalThis as any).__sample.publish(value, 1), value);
    expect(await page.getByRole("region", { name: "Now", exact: true }).textContent()).toContain(value.now.text);
    for (let i = 0; i < 5; i++) expect(await page.getByText(`Question ${i}`, { exact: true }).isVisible()).toBe(true);
    expect(await page.getByText("Critical fact 4", { exact: true }).isVisible()).toBe(false);
    await page.getByText("More need to know", { exact: true }).click();
    expect(await page.getByText("Critical fact 4", { exact: true }).isVisible()).toBe(true);
    expect(await page.getByRole("region", { name: "Next", exact: true }).textContent()).toContain("agent");
    expect(await page.getByText("Use structured updates", { exact: true }).isVisible()).toBe(false);
    await page.getByText("Decisions and completed work", { exact: true }).click();
    expect(await page.getByText("Use structured updates", { exact: true }).isVisible()).toBe(true);
    await page.getByText("Question 0", { exact: true }).click();
    await page.getByText("Local draft", { exact: true }).click();
    await page.locator("textarea").fill("Keep this draft");
    await page.locator("textarea").evaluate((node: HTMLTextAreaElement) => { node.focus(); node.setSelectionRange(2, 5); });
    await page.evaluate(value => (globalThis as any).__sample.publish({ ...value, needsYou: [], freshness: "unreviewed", activity: { state: "idle", observedAt: "2026-02-01T00:00:00.000Z" } }, 2), value);
    expect(await page.locator(".wac-freshness").textContent()).not.toContain(focusDocument.updatedAt);
    expect(await page.locator(".wac-freshness").textContent()).toContain("unreviewed");
    expect(await page.locator(".wac-activity").textContent()).toContain("Last reported: idle");
    expect(await page.locator(".wac-action-state").textContent()).not.toContain("No action requested");
    expect(await page.locator("progress").count()).toBe(0);
    expect(await page.locator("textarea").evaluate((node: HTMLTextAreaElement) => [document.activeElement === node, node.selectionStart, node.selectionEnd])).toEqual([true, 2, 5]);
    await page.evaluate(value => (globalThis as any).__sample.publish({ ...value, needsYou: [], freshness: "reviewed" }, 3), value);
    expect(await page.getByText("No action requested in this update.", { exact: true }).isVisible()).toBe(true);
    for (const width of [220, 320, 960]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await page.setViewportSize({ width: 320, height: 1000 });
    expect((await new AxeBuilder({ page }).include(".wolfpack-agent-context").withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
  } finally { await fixture.close(); }
}, 20_000);


test("stable fact disclosure and keyboard focus survive crossing the glance overflow boundary", async () => {
  const fixture = await component();
  try {
    const { page } = fixture;
    const facts = Array.from({ length: 4 }, (_, i) => ({ id: `fact-${i}`, text: `Fact ${i}`, details: `Details ${i}` }));
    const value = { ...focusDocument, needToKnow: facts };
    await page.evaluate(value => (globalThis as any).__sample.publish(value, 1), value);
    await page.getByText("More need to know", { exact: true }).click();
    const summary = page.locator(".wac-item summary").filter({ hasText: "Fact 0" });
    await summary.click(); await summary.focus();
    await summary.evaluate(element => { (globalThis as any).__retainedFact = element; });
    await page.evaluate(value => (globalThis as any).__sample.publish({ ...value, needToKnow: [value.needToKnow[1], value.needToKnow[2], value.needToKnow[3], value.needToKnow[0]] }, 2), value);
    expect(await page.evaluate(() => document.activeElement === (globalThis as any).__retainedFact)).toBe(true);
    expect(await page.getByText("Details 0", { exact: true }).isVisible()).toBe(true);
  } finally { await fixture.close(); }
}, 20_000);


test("compact freshness keeps exact timestamps and provenance in keyboard-accessible session details", async () => {
  const fixture = await component({ themeFixture: true });
  try {
    const { page } = fixture; await page.setViewportSize({ width: 220, height: 1000 });
    await page.evaluate(value => (globalThis as any).__sample.publish(value, 1), focusDocument);
    const formatted = await page.evaluate(timestamp => new Intl.DateTimeFormat(undefined, { dateStyle: "short", timeStyle: "short" }).format(new Date(timestamp)), focusDocument.updatedAt);
    expect(await page.locator(".wac-freshness").textContent()).toBe(`Updated ${formatted}`);
    expect(await page.locator(".wac-activity").textContent()).toBe("Last reported: working · not live");
    expect(await page.locator(".wac-provenance").isVisible()).toBe(false);
    const summary = page.locator("summary").filter({ hasText: "Session details" });
    await summary.focus(); await page.keyboard.press("Enter");
    for (const text of [
      `Context updated: ${focusDocument.updatedAt}`, `Activity observed: ${focusDocument.activity.observedAt}`,
      `Producer: Pi session ${focusDocument.source.sessionId}`, `Branch anchor: ${focusDocument.source.branchId}`, `Covered entry: ${focusDocument.source.coveredEntryId}`,
    ]) expect(await page.getByText(text, { exact: true }).isVisible()).toBe(true);
    await page.evaluate(value => (globalThis as any).__sample.publish(value, 0), claudeFocusDocument); // stale revision: ignored
    expect(await page.getByText(`Producer: Pi session ${focusDocument.source.sessionId}`, { exact: true }).isVisible()).toBe(true);
    expect(await page.getByText("Agent-authored snapshot reviewed only at that update; later changes may be missing.", { exact: true }).isVisible()).toBe(true);
    const observedAt = "2026-02-01T00:00:00.000Z";
    await page.evaluate(value => (globalThis as any).__sample.publish({ ...value, freshness: "unreviewed", activity: { state: "idle", observedAt: "2026-02-01T00:00:00.000Z" } }, 2), focusDocument);
    expect(await page.locator(".wac-freshness").textContent()).toBe(`Updated ${formatted} · unreviewed`);
    expect(await page.getByText(`Context updated: ${focusDocument.updatedAt}`, { exact: true }).isVisible()).toBe(true);
    expect(await page.getByText(`Activity observed: ${observedAt}`, { exact: true }).isVisible()).toBe(true);
    expect(await summary.evaluate(element => document.activeElement === element)).toBe(true);
    await page.evaluate(value => (globalThis as any).__sample.publish(value, 3), { ...focusDocument, freshness: "missed", activity: { state: "idle", observedAt } });
    expect(await page.locator(".wac-freshness").textContent()).toBe(`Updated ${formatted} · refresh missed`);
    await page.evaluate(value => (globalThis as any).__sample.publish(value, 4), claudeFocusDocument);
    for (const text of [`Producer: Claude Code session ${claudeFocusDocument.source.sessionId}`, `Request: ${claudeFocusDocument.source.promptId}`, `Covered tool result: ${claudeFocusDocument.source.coveredToolUseId}`]) expect(await page.getByText(text, { exact: true }).isVisible()).toBe(true);
    expect(await page.getByText(/Branch anchor|Covered entry/).count()).toBe(0); // no invented Pi fields for Claude
    await page.evaluate(value => (globalThis as any).__sample.publish(value, 5), { ...claudeFocusDocument, source: { ...claudeFocusDocument.source, promptId: null, coveredToolUseId: null } });
    expect(await page.getByText("Request: none", { exact: true }).isVisible()).toBe(true);
    expect(await page.getByText("Covered tool result: none", { exact: true }).isVisible()).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (process.env.WOLFPACK_WIDGET_ARTIFACTS) {
      mkdirSync(process.env.WOLFPACK_WIDGET_ARTIFACTS, { recursive: true });
      await page.setViewportSize({ width: 220, height: 1800 });
      await page.screenshot({ path: join(process.env.WOLFPACK_WIDGET_ARTIFACTS, "widget-session-details-220.png"), fullPage: true });
    }
    expect((await new AxeBuilder({ page }).include(".wolfpack-agent-context").withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
    await page.evaluate(value => (globalThis as any).__sample.publish(value, 6), richDocument);
    expect(await page.locator(".wac-provenance").isVisible()).toBe(false);
  } finally { await fixture.close(); }
}, 20_000);
