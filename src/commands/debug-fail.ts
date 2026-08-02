import type { CommandResultPass } from "./index.ts";
import { tryExecCommandFunction } from "./util.ts";

async function failWorker(): Promise<CommandResultPass> {
    throw new Error("this just never seems to work");
}

export const debugFail = {
    aliases: ["__debug_fail"],
    invoke: tryExecCommandFunction(failWorker)
};
