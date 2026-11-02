// schemas/context.schema.json
var context_schema_default = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion",
    "goal",
    "now",
    "needsYou",
    "needToKnow",
    "nextSteps",
    "history",
    "source",
    "updatedAt",
    "freshness",
    "activity"
  ],
  properties: {
    schemaVersion: {
      const: 3
    },
    goal: {
      type: "string",
      minLength: 1,
      maxLength: 1000
    },
    now: {
      type: "object",
      additionalProperties: false,
      required: [
        "id",
        "text"
      ],
      properties: {
        id: {
          type: "string",
          minLength: 1,
          maxLength: 128
        },
        text: {
          type: "string",
          minLength: 1,
          maxLength: 240
        },
        details: {
          type: "string",
          minLength: 1,
          maxLength: 2000
        }
      }
    },
    needsYou: {
      type: "array",
      maxItems: 20,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "text"
        ],
        properties: {
          id: {
            type: "string",
            minLength: 1,
            maxLength: 128
          },
          text: {
            type: "string",
            minLength: 1,
            maxLength: 240
          },
          details: {
            type: "string",
            minLength: 1,
            maxLength: 2000
          }
        }
      }
    },
    needToKnow: {
      type: "array",
      maxItems: 20,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "text"
        ],
        properties: {
          id: {
            type: "string",
            minLength: 1,
            maxLength: 128
          },
          text: {
            type: "string",
            minLength: 1,
            maxLength: 240
          },
          details: {
            type: "string",
            minLength: 1,
            maxLength: 2000
          }
        }
      }
    },
    nextSteps: {
      type: "array",
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "text",
          "owner"
        ],
        properties: {
          id: {
            type: "string",
            minLength: 1,
            maxLength: 128
          },
          text: {
            type: "string",
            minLength: 1,
            maxLength: 240
          },
          details: {
            type: "string",
            minLength: 1,
            maxLength: 2000
          },
          owner: {
            enum: [
              "agent",
              "user"
            ]
          }
        }
      }
    },
    history: {
      type: "array",
      maxItems: 20,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "text",
          "kind"
        ],
        properties: {
          id: {
            type: "string",
            minLength: 1,
            maxLength: 128
          },
          text: {
            type: "string",
            minLength: 1,
            maxLength: 240
          },
          details: {
            type: "string",
            minLength: 1,
            maxLength: 2000
          },
          kind: {
            enum: [
              "decision",
              "completed"
            ]
          }
        }
      }
    },
    source: {
      oneOf: [
        {
          type: "object",
          additionalProperties: false,
          required: [
            "harness",
            "sessionId",
            "branchId",
            "coveredEntryId"
          ],
          properties: {
            harness: {
              const: "pi"
            },
            sessionId: {
              type: "string",
              minLength: 1,
              maxLength: 128
            },
            branchId: {
              type: [
                "string",
                "null"
              ],
              maxLength: 128
            },
            coveredEntryId: {
              type: [
                "string",
                "null"
              ],
              maxLength: 128
            }
          }
        },
        {
          type: "object",
          additionalProperties: false,
          required: [
            "harness",
            "sessionId",
            "promptId",
            "coveredToolUseId"
          ],
          properties: {
            harness: {
              const: "claude"
            },
            sessionId: {
              type: "string",
              minLength: 1,
              maxLength: 128
            },
            promptId: {
              type: [
                "string",
                "null"
              ],
              maxLength: 128
            },
            coveredToolUseId: {
              type: [
                "string",
                "null"
              ],
              maxLength: 128
            }
          }
        }
      ]
    },
    updatedAt: {
      type: "string",
      minLength: 24,
      maxLength: 24
    },
    freshness: {
      enum: [
        "reviewed",
        "unreviewed",
        "missed"
      ]
    },
    activity: {
      type: "object",
      additionalProperties: false,
      required: [
        "state",
        "observedAt"
      ],
      properties: {
        state: {
          enum: [
            "working",
            "idle",
            "interrupted",
            "unknown"
          ]
        },
        observedAt: {
          type: "string",
          minLength: 24,
          maxLength: 24
        }
      }
    }
  }
};

// src/focus.ts
var MAX_DOCUMENT_BYTES = 64 * 1024;
function matches(value, rule) {
  if (rule.oneOf && rule.oneOf.filter((branch) => matches(value, branch)).length !== 1)
    return false;
  if ("const" in rule && value !== rule.const || rule.enum && !rule.enum.includes(value))
    return false;
  if (rule.type) {
    const types = Array.isArray(rule.type) ? rule.type : [rule.type];
    const type = value === null ? "null" : Array.isArray(value) ? "array" : typeof value;
    if (!types.includes(type))
      return false;
  }
  if (typeof value === "string" && ([...value].length < (rule.minLength ?? 0) || [...value].length > (rule.maxLength ?? Infinity)))
    return false;
  if (Array.isArray(value) && (value.length > (rule.maxItems ?? Infinity) || rule.items && !value.every((item) => matches(item, rule.items))))
    return false;
  if (rule.properties && value && typeof value === "object" && !Array.isArray(value)) {
    const object = value;
    if (rule.required?.some((key) => !Object.hasOwn(object, key)) || Object.keys(object).some((key) => {
      const property = rule.properties[key];
      return !Object.hasOwn(rule.properties, key) || !property || !matches(object[key], property);
    }))
      return false;
  }
  return true;
}
var timestamp = (value) => {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value;
};
function isFocusDocument(value) {
  try {
    if (new TextEncoder().encode(JSON.stringify(value)).length > MAX_DOCUMENT_BYTES || !matches(value, context_schema_default))
      return false;
    const document2 = value;
    return timestamp(document2.updatedAt) && timestamp(document2.activity.observedAt) && [document2.needsYou, document2.needToKnow, document2.nextSteps, document2.history].every((items) => new Set(items.map((item) => item.id)).size === items.length);
  } catch {
    return false;
  }
}
var snapshotSchema = {
  type: "object",
  additionalProperties: false,
  required: ["goal", "now", "needsYou", "needToKnow", "nextSteps", "history"],
  properties: Object.fromEntries(["goal", "now", "needsYou", "needToKnow", "nextSteps", "history"].map((key) => [key, context_schema_default.properties[key]]))
};

// src/model.ts
function splitBulletText(value) {
  const separator = /\r?\n[\t ]*\r?\n/.exec(value);
  if (!separator)
    return { text: value };
  const text = value.slice(0, separator.index);
  const details = value.slice(separator.index + separator[0].length);
  return text.trim() && details.trim() ? { text, details } : { text: value };
}
function strings(value) {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}
function document2(value) {
  if (!value || typeof value !== "object")
    return false;
  const item = value;
  return item.schemaVersion === 1 && typeof item.goal === "string" && strings(item.decisions) && strings(item.blockers) && strings(item.nextSteps) && Array.isArray(item.planItems) && item.planItems.every((plan) => plan && typeof plan === "object" && typeof plan.id === "string" && typeof plan.text === "string" && ["pending", "in_progress", "complete", "blocked"].includes(plan.status));
}
function acceptsRevision(previous, next) {
  return Number.isSafeInteger(next) && next >= previous;
}
function contextViewModel(value, revision = 0) {
  if (value === null)
    return { state: "empty", revision: 0 };
  if (isFocusDocument(value))
    return { state: "focus", revision, document: value };
  if (!document2(value))
    return { state: "error", revision };
  const bullets = (values) => values.map((value) => {
    const parts = splitBulletText(value);
    return { id: parts.text, ...parts };
  });
  return {
    state: "ready",
    revision,
    goal: value.goal,
    planItems: value.planItems.map((item) => ({ id: item.id, status: item.status, ...splitBulletText(item.text) })),
    decisions: bullets(value.decisions),
    blockers: bullets(value.blockers),
    nextSteps: bullets(value.nextSteps)
  };
}

// src/styles.ts
var styles = `
.wolfpack-agent-context {
  --wac-bg: var(--bg-surface, #131715);
  --wac-border: var(--border-subtle, #28312b);
  --wac-text: var(--text-primary, #edf3ef);
  --wac-muted: var(--text-muted, #a4b2a9);
  --wac-accent: var(--accent, #45ed7e);
  display: grid; gap: 16px; max-width: 760px; min-width: 0; margin-inline: auto;
  color: var(--wac-text); font: 13px/1.55 var(--font-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
  overflow-wrap: anywhere; container-type: inline-size;
}
.wolfpack-agent-context *, .wolfpack-agent-context *::before, .wolfpack-agent-context *::after { box-sizing: border-box; }
.wolfpack-agent-context[hidden], .wolfpack-agent-context [hidden] { display: none !important; }
.wolfpack-agent-context h2, .wolfpack-agent-context h3, .wolfpack-agent-context p, .wolfpack-agent-context ul { margin: 0; padding: 0; }
.wolfpack-agent-context .wac-meta { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 6px; color: var(--wac-muted); font-size: 11px; }
.wolfpack-agent-context .wac-revision { border: 1px solid var(--wac-border); border-radius: 6px; padding: 2px 7px; font-variant-numeric: tabular-nums; }
.wolfpack-agent-context .wac-goal { display: grid; gap: 8px; padding: 16px; border: 1px solid var(--wac-border); border-left: 2px solid var(--wac-accent); border-radius: 9px; background: var(--wac-bg); }
.wolfpack-agent-context .wac-eyebrow { color: var(--wac-accent); font-size: 10px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }
.wolfpack-agent-context h2 { font-size: 17px; font-weight: 600; line-height: 1.45; letter-spacing: -.015em; text-wrap: pretty; }
.wolfpack-agent-context .wac-content { display: grid; gap: 20px; min-width: 0; }
.wolfpack-agent-context .wac-section { min-width: 0; display: grid; align-content: start; gap: 8px; }
.wolfpack-agent-context .wac-section-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.wolfpack-agent-context h3 { color: var(--wac-muted); font-size: 11px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; }
.wolfpack-agent-context .wac-count { color: var(--wac-muted); font-size: 11px; font-variant-numeric: tabular-nums; }
.wolfpack-agent-context .wac-list { display: grid; gap: 8px; list-style: none; }
.wolfpack-agent-context .wac-item { border: 1px solid var(--wac-border); background: var(--wac-bg); border-radius: 9px; min-width: 0; overflow: clip; }
.wolfpack-agent-context .wac-item[data-status="blocked"] { border-color: var(--warning, #ebca78); }
.wolfpack-agent-context summary { list-style: none; cursor: pointer; }
.wolfpack-agent-context summary::-webkit-details-marker { display: none; }
.wolfpack-agent-context .wac-item summary { min-height: 44px; padding: 12px; }
.wolfpack-agent-context .wac-item summary:hover { background: var(--bg-hover, #1b231e); }
.wolfpack-agent-context summary:focus-visible, .wolfpack-agent-context button:focus-visible, .wolfpack-agent-context textarea:focus-visible { outline: 2px solid var(--wac-accent); outline-offset: -2px; border-radius: 5px; }
.wolfpack-agent-context .wac-caption { display: flex; align-items: flex-start; gap: 9px; min-width: 0; }
.wolfpack-agent-context .wac-static { padding: 12px; }
.wolfpack-agent-context .wac-caption-text { display: grid; flex: 1; min-width: 0; gap: 4px; }
.wolfpack-agent-context .wac-title { font-weight: 500; line-height: 1.45; }
.wolfpack-agent-context .wac-status { color: var(--wac-muted); font-size: 10px; line-height: 1.4; }
.wolfpack-agent-context [data-status="complete"] .wac-marker { color: var(--wac-accent); }
.wolfpack-agent-context [data-status="in_progress"] .wac-marker, .wolfpack-agent-context [data-status="in_progress"] .wac-status { color: var(--cmd-accent, #66ccff); }
.wolfpack-agent-context [data-status="blocked"] .wac-marker, .wolfpack-agent-context [data-status="blocked"] .wac-status { color: var(--warning, #ebca78); }
.wolfpack-agent-context .wac-marker { flex: 0 0 16px; color: var(--wac-muted); font-size: 12px; font-weight: 600; text-align: center; line-height: 19px; font-variant-numeric: tabular-nums; }
.wolfpack-agent-context .wac-chevron { flex: 0 0 14px; width: 14px; height: 14px; margin-top: 3px; fill: none; stroke: var(--wac-muted); stroke-width: 1.6; transition: transform .15s ease; }
.wolfpack-agent-context details[open] > summary .wac-chevron { transform: rotate(90deg); }
.wolfpack-agent-context .wac-detail { padding: 10px 12px 12px 37px; border-top: 1px solid var(--wac-border); color: var(--text-secondary, #bac6be); font-size: 12px; line-height: 1.65; white-space: pre-wrap; }
.wolfpack-agent-context .wac-focus { display: grid; gap: 16px; min-width: 0; }
.wolfpack-agent-context .wac-needs-you .wac-item { border-left: 3px solid var(--warning, #ebca78); }
.wolfpack-agent-context .wac-freshness, .wolfpack-agent-context .wac-activity { color: var(--wac-muted); font-size: 11px; }
.wolfpack-agent-context .wac-clear { color: var(--wac-muted); font-size: 11px; }
.wolfpack-agent-context .wac-blockers h3 { color: var(--warning, #ebca78); }
.wolfpack-agent-context .wac-tools { display: grid; border-top: 1px solid var(--wac-border); }
.wolfpack-agent-context .wac-tool > summary { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 44px; color: var(--wac-muted); font-size: 12px; }
.wolfpack-agent-context .wac-tool > summary:hover { color: var(--wac-text); }
.wolfpack-agent-context .wac-tool-body { display: grid; gap: 10px; padding-bottom: 12px; color: var(--wac-muted); font-size: 11px; }
.wolfpack-agent-context .wac-provenance { display: grid; gap: 6px; }
.wolfpack-agent-context .wac-session-id { font: 11px/1.6 var(--font-mono, monospace); color: var(--text-secondary, #bac6be); user-select: all; }
.wolfpack-agent-context textarea { display: block; width: 100%; min-height: 112px; resize: vertical; padding: 10px; border: 1px solid var(--border-input, #36433b); border-radius: 7px; background: var(--bg-inset, #0d100e); color: var(--wac-text); font: inherit; line-height: 1.6; }
.wolfpack-agent-context textarea::placeholder { color: var(--wac-muted); }
.wolfpack-agent-context .wac-guidance { display: grid; gap: 12px; color: var(--wac-muted); }
.wolfpack-agent-context .wac-request { display: block; padding: 12px; border: 1px solid var(--wac-border); border-radius: 7px; color: var(--wac-text); background: var(--wac-bg); user-select: all; }
.wolfpack-agent-context .wac-button { justify-self: start; min-height: 44px; padding: 7px 12px; border: 1px solid var(--border-hover, #405047); border-radius: 6px; color: var(--wac-text); background: var(--wac-bg); font: inherit; cursor: pointer; }
.wolfpack-agent-context .wac-button:hover { border-color: var(--wac-accent); }
.wolfpack-agent-context .wac-feedback { font-size: 11px; color: var(--wac-muted); }
.wolfpack-agent-context .wac-feedback:empty { display: none; }
@container (min-width: 560px) {
  .wolfpack-agent-context .wac-content { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); align-items: start; }
  .wolfpack-agent-context .wac-goal { padding: 20px; }
  .wolfpack-agent-context h2 { font-size: 21px; }
}
@media (max-width: 768px) { .wolfpack-agent-context textarea { font-size: 16px; } }
@media (prefers-reduced-motion: reduce) { .wolfpack-agent-context .wac-chevron { transition: none; } }
`;

// src/ui.ts
function node(tag, className = "", value = "") {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = value;
  return element;
}
function setText(element, value) {
  if (element.textContent !== value)
    element.textContent = value;
}
function chevron() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "wac-chevron");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(svg.namespaceURI, "path");
  path.setAttribute("d", "m6 3 5 5-5 5");
  svg.append(path);
  return svg;
}
var statuses = {
  pending: { label: "Pending", marker: "○" },
  in_progress: { label: "In progress", marker: "→" },
  complete: { label: "Complete", marker: "✓" },
  blocked: { label: "Blocked", marker: "!" }
};
var view = {
  id: "context",
  title: "Agent Context",
  mount(container, context) {
    const root = node("section", "wolfpack-agent-context");
    const events = new AbortController;
    let latest = -1;
    let stopped = false;
    let unsubscribe = () => {};
    const saved = (key) => {
      try {
        return context.storage.get(key);
      } catch {
        return null;
      }
    };
    const save = (key, value) => {
      try {
        context.storage.set(key, value);
        return true;
      } catch {
        return false;
      }
    };
    const meta = node("div", "wac-meta");
    const revisionLabel = node("span", "wac-revision");
    meta.append(node("span", "", "Agent-authored"), revisionLabel);
    const goalCard = node("div", "wac-goal");
    const goal = node("h2");
    goalCard.append(node("span", "wac-eyebrow", "Current goal"), goal);
    const feedback = node("p", "wac-feedback");
    feedback.setAttribute("role", "status");
    function copyButton(label, value) {
      const button = node("button", "wac-button", label);
      button.type = "button";
      button.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(value);
          if (!stopped)
            setText(feedback, "Copied to clipboard.");
        } catch {
          if (!stopped)
            setText(feedback, "Could not copy. Select the text and copy it manually.");
        }
      }, { signal: events.signal });
      return button;
    }
    const guidance = node("div", "wac-guidance");
    const request = "Update this session's context using the wolfpack-agent-context skill.";
    guidance.append(node("p", "", "Installing the Wolfpack extension adds this panel, not the Claude Code plugin or Pi companion. Automatic updates need a separate agent integration; installing a skill alone is not enough."), node("h3", "", "Setup for automatic updates"), node("p", "", "Claude Code: add the repository marketplace, then install the plugin:"), node("code", "wac-request", "claude plugin marketplace add /path/to/wolfpack-extensions"), node("code", "wac-request", "claude plugin install wolfpack-agent-context@wolfpack-extensions"), node("p", "", "Pi: install the companion:"), node("code", "wac-request", "pi install /path/to/wolfpack-extensions/packages/agent-context"), node("p", "", "Replace /path/to/wolfpack-extensions with your local repository directory. Use the integration for your agent, or both if you use both."), node("p", "", "Start a new session in Wolfpack after setup; /clear does not load a newly installed plugin. If already set up, no update has been received yet."), node("p", "", "Manual recovery is not automatic setup. The bundled skill explains explicit publication recovery; context is never scraped from terminal output."), node("p", "wac-request", request), copyButton("Copy request", request));
    const unavailable = node("p", "wac-feedback", "The document could not be read or did not match the context format. Ask the agent to check its published document. Your local draft is unaffected.");
    const content = node("div", "wac-content");
    const clear = node("p", "wac-clear", "✓  No blockers reported");
    function section(title, className = "") {
      const element = node("section", `wac-section ${className}`);
      element.setAttribute("aria-label", title);
      const heading = node("div", "wac-section-head");
      const count = node("span", "wac-count");
      const list = node("ul", "wac-list");
      list.setAttribute("role", "list");
      heading.append(node("h3", "", title), count);
      element.append(heading, list);
      return { element, heading, count, list };
    }
    const plan = section("Plan");
    const next = section("Next steps");
    const decisions = section("Decisions");
    const blockers = section("Blockers", "wac-blockers");
    content.append(plan.element, next.element, decisions.element);
    function tool(title, key, defaultOpen = false) {
      const element = node("details", "wac-tool");
      const summary = node("summary");
      summary.append(node("span", "", title), chevron());
      const body = node("div", "wac-tool-body");
      element.append(summary, body);
      element.open = saved(key) === "true" || saved(key) === null && defaultOpen;
      element.addEventListener("toggle", () => save(key, String(element.open)), { signal: events.signal });
      return { element, body };
    }
    const focusContent = node("div", "wac-focus");
    const now = section("Now");
    const needsYou = section("Needs you", "wac-needs-you");
    const noActions = node("p", "wac-action-state");
    needsYou.element.append(noActions);
    const knowledge = section("Need to know");
    const focusNext = section("Next");
    const moreKnowledge = tool("More need to know", "knowledge-open");
    const extraKnowledge = section("Additional need to know");
    moreKnowledge.body.append(extraKnowledge.element);
    const historyTool = tool("Decisions and completed work", "history-open");
    const history = section("History");
    historyTool.body.append(history.element);
    const freshness = node("p", "wac-freshness");
    const activity = node("p", "wac-activity");
    const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: "short", timeStyle: "short" });
    focusContent.append(now.element, needsYou.element, knowledge.element, moreKnowledge.element, focusNext.element, freshness, activity, historyTool.element);
    const draft = node("textarea");
    draft.placeholder = "Ideas to keep for later…";
    draft.setAttribute("aria-label", "Local draft");
    draft.value = saved("draft") ?? "";
    const draftTool = tool("Local draft", "draft-open", draft.value.length > 0);
    const draftNote = node("p", "", "Saved in this browser only. Not published to the agent.");
    draft.addEventListener("input", () => setText(draftNote, save("draft", draft.value) ? "Saved in this browser only. Not published to the agent." : "Could not save in this browser. Copy your draft before leaving."), { signal: events.signal });
    draftTool.body.append(draft, draftNote);
    const sessionTool = tool("Session details", "session-open");
    const provenance = node("div", "wac-provenance");
    provenance.hidden = true;
    const semanticTime = node("p");
    const activityTime = node("p");
    const freshnessNote = node("p");
    const producer = node("p");
    const anchor = node("p");
    const boundary = node("p");
    provenance.append(semanticTime, activityTime, freshnessNote, producer, anchor, boundary, node("p", "", "Last reported activity is not live presence; idle does not mean complete."));
    sessionTool.body.append(node("code", "wac-session-id", context.scope.sessionId), copyButton("Copy session ID", context.scope.sessionId), provenance, node("p", "", "Agent-authored context — not verified task or execution evidence."));
    const tools = node("div", "wac-tools");
    tools.append(draftTool.element, sessionTool.element);
    root.append(node("style", "", styles), meta, goalCard, guidance, unavailable, focusContent, blockers.element, clear, content, tools, feedback);
    container.replaceChildren(root);
    const rows = new Map;
    function makeRow(key, initiallyOpen) {
      const li = node("li", "wac-item");
      li.dataset.bullet = key;
      const disclosure = node("details");
      const summary = node("summary");
      const plain = node("div", "wac-static");
      const caption = node("span", "wac-caption");
      const title = node("span", "wac-title");
      const status = node("span", "wac-status");
      const marker = node("span", "wac-marker");
      marker.setAttribute("aria-hidden", "true");
      const words = node("span", "wac-caption-text");
      const arrow = chevron();
      words.append(title, status);
      caption.append(marker, words, arrow);
      const body = node("p", "wac-detail");
      summary.append(caption);
      disclosure.append(summary, body);
      li.append(disclosure, plain);
      const preference = saved(`bullet-open:${key}`);
      disclosure.open = preference === "true" || preference === null && initiallyOpen;
      disclosure.ontoggle = () => {
        if (!stopped)
          save(`bullet-open:${key}`, String(disclosure.open));
      };
      return { li, disclosure, summary, plain, caption, title, status, marker, body, arrow };
    }
    function renderList(group, name, values, planStatuses) {
      const wanted = new Set;
      const occurrences = new Map;
      let cursor = group.list.firstElementChild;
      values.forEach((value, index) => {
        const bullet = typeof value === "string" ? { id: `legacy-${index}`, text: value } : value;
        const occurrence = occurrences.get(bullet.id) ?? 0;
        occurrences.set(bullet.id, occurrence + 1);
        const key = JSON.stringify([name, bullet.id, occurrence]);
        wanted.add(key);
        let row = rows.get(key);
        if (!row) {
          row = makeRow(key, name === "blockers");
          rows.set(key, row);
        }
        const status = planStatuses?.[index];
        const hasDetails = Boolean(bullet.details);
        setText(row.title, bullet.text);
        setText(row.body, bullet.details ?? "");
        const annotation = typeof value === "object" && "owner" in value ? String(value.owner) : typeof value === "object" && ("kind" in value) ? String(value.kind) : "";
        setText(row.status, status ? statuses[status].label : annotation);
        row.status.hidden = !status && !annotation;
        setText(row.marker, status ? statuses[status].marker : name === "next" ? String(index + 1) : name === "blockers" ? "!" : "·");
        row.li.dataset.status = status ?? (name === "blockers" ? "blocked" : "");
        row.disclosure.hidden = !hasDetails;
        row.plain.hidden = hasDetails;
        row.arrow.style.display = hasDetails ? "" : "none";
        const parent = hasDetails ? row.summary : row.plain;
        if (row.caption.parentElement !== parent)
          parent.append(row.caption);
        if (row.li !== cursor)
          group.list.insertBefore(row.li, cursor);
        cursor = row.li.nextElementSibling;
      });
      for (const [key, row] of rows) {
        if (row.li.parentElement === group.list && !wanted.has(key))
          row.li.remove();
      }
      group.element.hidden = values.length === 0;
      setText(group.count, String(values.length));
    }
    function pruneRows() {
      for (const [key, row] of rows)
        if (!root.contains(row.li)) {
          row.disclosure.ontoggle = null;
          rows.delete(key);
        }
    }
    const render = (value, revision) => {
      if (stopped || !acceptsRevision(latest, revision))
        return;
      latest = revision;
      const active = document.activeElement instanceof HTMLElement && root.contains(document.activeElement) ? document.activeElement : null;
      const model = contextViewModel(value, revision);
      setText(revisionLabel, model.state === "empty" ? "Not published" : `Revision ${model.revision}`);
      guidance.hidden = model.state !== "empty";
      unavailable.hidden = model.state !== "error";
      focusContent.hidden = provenance.hidden = model.state !== "focus";
      content.hidden = clear.hidden = blockers.element.hidden = model.state !== "ready";
      if (model.state === "focus") {
        const value = model.document;
        setText(goal, value.goal);
        renderList(now, "now", [value.now]);
        renderList(needsYou, "needs-you", value.needsYou);
        renderList(knowledge, "knowledge", value.needToKnow.slice(0, 3));
        renderList(extraKnowledge, "knowledge", value.needToKnow.slice(3));
        moreKnowledge.element.hidden = value.needToKnow.length <= 3;
        renderList(focusNext, "focus-next", value.nextSteps);
        renderList(history, "history", value.history);
        historyTool.element.hidden = value.history.length === 0;
        pruneRows();
        setText(freshness, `Updated ${dateTime.format(new Date(value.updatedAt))}${value.freshness === "reviewed" ? "" : value.freshness === "missed" ? " · refresh missed" : " · unreviewed"}`);
        setText(activity, `Last reported: ${value.activity.state} · not live`);
        setText(semanticTime, `Context updated: ${value.updatedAt}`);
        setText(activityTime, `Activity observed: ${value.activity.observedAt}`);
        setText(freshnessNote, value.freshness === "reviewed" ? "Agent-authored snapshot reviewed only at that update; later changes may be missing." : value.freshness === "missed" ? "Refresh missed; context may be out of date." : "Context not reviewed for latest activity.");
        const source = value.source;
        if (source.harness === "pi") {
          setText(producer, `Producer: Pi session ${source.sessionId}`);
          setText(anchor, `Branch anchor: ${source.branchId ?? "none"}`);
          setText(boundary, `Covered entry: ${source.coveredEntryId ?? "none"}`);
        } else {
          setText(producer, `Producer: Claude Code session ${source.sessionId}`);
          setText(anchor, `Request: ${source.promptId ?? "none"}`);
          setText(boundary, `Covered tool result: ${source.coveredToolUseId ?? "none"}`);
        }
        needsYou.element.hidden = false;
        noActions.hidden = value.needsYou.length > 0;
        setText(noActions, value.freshness === "reviewed" ? "No action requested in this update." : "User actions unknown in the latest activity.");
        if (active?.isConnected && active.getClientRects().length && document.activeElement !== active)
          active.focus({ preventScroll: true });
        return;
      }
      if (model.state !== "ready") {
        setText(goal, model.state === "empty" ? "No context yet" : "Context unavailable");
        return;
      }
      setText(goal, model.goal);
      renderList(plan, "plan", model.planItems, model.planItems.map((item) => item.status));
      renderList(next, "next", model.nextSteps);
      renderList(decisions, "decisions", model.decisions);
      renderList(blockers, "blockers", model.blockers);
      pruneRows();
      clear.hidden = model.blockers.length > 0;
      setText(clear, "No blockers reported in this legacy context; freshness unknown.");
      setText(revisionLabel, `Revision ${model.revision} · legacy; freshness unknown`);
      if (active?.isConnected && active.getClientRects().length && document.activeElement !== active)
        active.focus({ preventScroll: true });
    };
    setText(goal, "Loading context…");
    setText(revisionLabel, "Loading");
    guidance.hidden = unavailable.hidden = content.hidden = focusContent.hidden = blockers.element.hidden = clear.hidden = true;
    const cleanup = () => {
      if (stopped)
        return;
      stopped = true;
      events.abort();
      unsubscribe();
      for (const row of rows.values())
        row.disclosure.ontoggle = null;
    };
    context.signal.addEventListener("abort", cleanup, { once: true });
    if (context.signal.aborted)
      cleanup();
    else {
      try {
        const release = context.documents.subscribe("context", render);
        if (stopped)
          release();
        else
          unsubscribe = release;
      } catch {
        render(undefined, 0);
      }
    }
    return { setVisible(visible) {
      if (!stopped)
        root.hidden = !visible;
    }, dispose() {
      cleanup();
      context.signal.removeEventListener("abort", cleanup);
      root.remove();
    } };
  }
};
function register(host) {
  host.registerContextView(view);
}
export {
  register as default
};
