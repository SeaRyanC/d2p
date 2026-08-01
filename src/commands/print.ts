import { exec } from 'child_process';
import { writeFile, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import type { BotCommand } from '../types.ts';

/**
 * Prints text to the configured CUPS printer.
 *
 * Environment variables:
 *   PRINTER_NAME  - CUPS printer name (optional; omit to use the system default)
 */
export const printCommand: BotCommand = {
    name: 'print',
    channels: ['todo'],
    description: 'Prints the given text on the local printer. Usage: !print <text>',

    async execute(ctx) {
        const text = ctx.args.trim();
        if (!text) throw new Error('Nothing to print — provide text after !print');

        const tmpFile = join(tmpdir(), `d2p-${Date.now()}.txt`);
        await writeFile(tmpFile, text + '\n', 'utf8');

        try {
            await printFile(tmpFile);
        } finally {
            await unlink(tmpFile).catch(() => undefined);
        }
    },
};

function printFile(filePath: string): Promise<void> {
    const printerName = process.env['PRINTER_NAME'];
    const destination = printerName ? `-d ${shellQuote(printerName)}` : '';
    const cmd = `lp ${destination} ${shellQuote(filePath)}`;

    return new Promise((resolve, reject) => {
        exec(cmd, (err, _stdout, stderr) => {
            if (err) {
                reject(new Error(`lp failed: ${stderr.trim() || err.message}`));
            } else {
                resolve();
            }
        });
    });
}

function shellQuote(s: string): string {
    return `'${s.replace(/'/g, "'\\''")}'`;
}
