export const Reaction = {
    ok: "✅",
    what: "❓",
    fail: "❌",
    thinking: "🧠"
} as const;
export type Reaction = (typeof Reaction)[keyof typeof Reaction];
