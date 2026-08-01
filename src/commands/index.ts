/**
 * Command registry.
 *
 * To add a new command:
 *   1. Create src/commands/yourcommand.ts exporting a `BotCommand`
 *   2. Import it here and add it to the `commands` array
 */
import { printCommand } from './print.js';
import type { BotCommand } from '../types.js';

export const commands: BotCommand[] = [
    printCommand,
];
