export const Reaction = {
    ok: "✅",
    what: "❓",
    fail: "❌"
} as const;
export type Reaction = (typeof Reaction)[keyof typeof Reaction];
