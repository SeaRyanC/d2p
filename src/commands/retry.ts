import { tryExecCommandFunction } from "./util.ts";
import type { CommandResultPass } from "./index.ts";

async function retryWorker(_args: string, ctx: import("./index.ts").CommandRunContext): Promise<CommandResultPass> {
    if (!ctx.retryFailedMessages) {
        throw new Error("The retry command is not available in this channel");
    }

    const count = await ctx.retryFailedMessages();
    return {
        kind: "pass",
        reply: count === 0
            ? "No failed messages found in the previous 20 messages."
            : `Retried ${count} failed message${count === 1 ? "" : "s"}.`,
    };
}

export const retry = {
    aliases: ["retry"],
    invoke: tryExecCommandFunction(retryWorker),
};
