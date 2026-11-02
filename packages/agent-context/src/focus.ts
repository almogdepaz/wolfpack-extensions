import schema from "../schemas/context.schema.json";

export const CONTEXT_SCHEMA_VERSION = 3;
export const MAX_DOCUMENT_BYTES = 64 * 1024;
export interface FocusItem { readonly id: string; readonly text: string; readonly details?: string }
export interface FocusSnapshot {
  readonly goal: string;
  readonly now: FocusItem;
  readonly needsYou: readonly FocusItem[];
  readonly needToKnow: readonly FocusItem[];
  readonly nextSteps: readonly (FocusItem & { readonly owner: "agent" | "user" })[];
  readonly history: readonly (FocusItem & { readonly kind: "decision" | "completed" })[];
}
/** Exact producer identity plus the native conversation boundary the semantic snapshot covers. */
export type FocusSource =
  | { readonly harness: "pi"; readonly sessionId: string; readonly branchId: string | null; readonly coveredEntryId: string | null }
  | { readonly harness: "claude"; readonly sessionId: string; readonly promptId: string | null; readonly coveredToolUseId: string | null };
export type FocusHarness = FocusSource["harness"];
export interface FocusDocument extends FocusSnapshot {
  readonly schemaVersion: typeof CONTEXT_SCHEMA_VERSION;
  readonly source: FocusSource;
  readonly updatedAt: string;
  readonly freshness: "reviewed" | "unreviewed" | "missed";
  readonly activity: { readonly state: "working" | "idle" | "interrupted" | "unknown"; readonly observedAt: string };
}
// Only the static keywords used by our reviewed schema. The host independently validates all writes.
interface StaticSchema {
  type?: string | string[]; const?: unknown; enum?: unknown[];
  minLength?: number; maxLength?: number; maxItems?: number;
  // JSON-module inference normalizes oneOf branches with absent (undefined) sibling properties.
  properties?: Record<string, StaticSchema | undefined>; required?: string[]; items?: StaticSchema; oneOf?: StaticSchema[];
}
function matches(value: unknown, rule: StaticSchema): boolean {
  if (rule.oneOf && rule.oneOf.filter(branch => matches(value, branch)).length !== 1) return false;
  if ("const" in rule && value !== rule.const || rule.enum && !rule.enum.includes(value)) return false;
  if (rule.type) {
    const types = Array.isArray(rule.type) ? rule.type : [rule.type];
    const type = value === null ? "null" : Array.isArray(value) ? "array" : typeof value;
    if (!types.includes(type)) return false;
  }
  if (typeof value === "string" && ([...value].length < (rule.minLength ?? 0) || [...value].length > (rule.maxLength ?? Infinity))) return false;
  if (Array.isArray(value) && (value.length > (rule.maxItems ?? Infinity) || rule.items && !value.every(item => matches(item, rule.items!)))) return false;
  if (rule.properties && value && typeof value === "object" && !Array.isArray(value)) {
    const object = value as Record<string, unknown>;
    if (rule.required?.some(key => !Object.hasOwn(object, key)) || Object.keys(object).some(key => { const property = rule.properties![key]; return !Object.hasOwn(rule.properties!, key) || !property || !matches(object[key], property); })) return false;
  }
  return true;
}
const timestamp = (value: string): boolean => { const date = new Date(value); return Number.isFinite(date.getTime()) && date.toISOString() === value; };
export function isFocusDocument(value: unknown): value is FocusDocument {
  try {
    if (new TextEncoder().encode(JSON.stringify(value)).length > MAX_DOCUMENT_BYTES || !matches(value, schema)) return false;
    const document = value as FocusDocument;
    return timestamp(document.updatedAt) && timestamp(document.activity.observedAt)
      && [document.needsYou, document.needToKnow, document.nextSteps, document.history].every(items => new Set(items.map(item => item.id)).size === items.length);
  } catch { return false; }
}
export function snapshotOf(document: FocusSnapshot): FocusSnapshot {
  return { goal: document.goal, now: document.now, needsYou: document.needsYou, needToKnow: document.needToKnow, nextSteps: document.nextSteps, history: document.history };
}
/** Stable object ordering for semantic de-duplication; array order remains meaningful. */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  return JSON.stringify(value);
}
export const snapshotSchema = {
  type: "object", additionalProperties: false,
  required: ["goal", "now", "needsYou", "needToKnow", "nextSteps", "history"],
  properties: Object.fromEntries(["goal", "now", "needsYou", "needToKnow", "nextSteps", "history"].map(key => [key, schema.properties[key as keyof typeof schema.properties]])),
};
