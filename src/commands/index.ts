/**
 * Command registry.
 *
 * To add a new command:
 *   1. Create src/commands/yourcommand.ts exporting a `BotCommand`
 *   2. Import it here and add it to the `commands` array
 */
import { printCommand } from './print.ts';
import { helloCommand } from './hello.ts';
import type { BotCommand } from '../types.ts';

export const commands: BotCommand[] = [
    helloCommand,
    printCommand,
];
