import type { CommandResult } from "./index.ts";

export function tryExecCommandFunction(func: (cmd: string) => Promise<CommandResult>) {
    return async function(cmd: string): Promise<CommandResult> {
        try {
            return await func(cmd);
        } catch(err) {
            return {
                kind: "fail",
                reason: `${err}`
            };
        }
    }
}
