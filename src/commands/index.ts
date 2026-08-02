import { debugFail } from "./debug-fail.ts";
import { helloWorld } from "./hello-world.ts";
import { printSudoku } from "./sudoku.ts";
import { printWordsearch } from "./wordsearch.ts";

export type Command = {
    aliases: string[];
    invoke: (msg: string) => Promise<CommandResult>;
};

export type CommandResultPass = {
    kind: "pass";
    reply?: string;
};

export type CommandResultFail = {
    kind: "fail";
    reason: string;
};

export type CommandResult = CommandResultPass | CommandResultFail;

export const Commands = [
    helloWorld,
    printSudoku,
    printWordsearch,
    debugFail
] satisfies Command[];
