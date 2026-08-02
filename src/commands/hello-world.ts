import type { CommandResultPass } from "./index.ts";
import { tryExecCommandFunction } from "./util.ts";

async function helloWorldWorker(): Promise<CommandResultPass> {
    console.log("Hello, world!");
    return {
        kind: "pass",
        reply: "Nice to meet you!"
    };
}

export const helloWorld = {
    aliases: ["hello", "helloworld"],
    invoke: tryExecCommandFunction(helloWorldWorker)
};
