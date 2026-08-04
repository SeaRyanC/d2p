import { readdir, readFile, unlink, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';
import { Jimp, JimpMime, loadFont, measureText } from 'jimp';
import type { PrintJob } from '../types.ts';
import type { Command, CommandResultPass, CommandRunContext } from './index.ts';
import { tryExecCommandFunction } from './util.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUZZLE_DIR = join(__dirname, '../../assets/wordsearches');
const FONT_DIR = new URL('../../node_modules/@jimp/plugin-print/dist/fonts/open-sans/', import.meta.url).pathname;
const WORDSEARCH_FONT = `${FONT_DIR}open-sans-32-black/open-sans-32-black.fnt`;
const IMAGE_WIDTH = 560;
const IMAGE_HEIGHT = 600;
const GRID_SIZE = 510;
const GRID_LEFT = (IMAGE_WIDTH - GRID_SIZE) / 2;
const GRID_TOP = 68;
const CELL_SIZE = GRID_SIZE / 15;

interface Puzzle {
    theme: string;
    words: string[];
    grid: string[];
}

let puzzlesPromise: Promise<Puzzle[]> | undefined;

async function loadPuzzles(): Promise<Puzzle[]> {
    const files = (await readdir(PUZZLE_DIR)).filter(file => file.endsWith('.txt')).sort();
    const puzzles: Puzzle[] = [];

    for (const file of files) {
        const text = await readFile(join(PUZZLE_DIR, file), 'utf8');
        const lines = text.split(/\r?\n/);
        let theme = '';
        let words: string[] = [];
        let grid: string[] = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i]?.trim() ?? '';
            if (line.startsWith('THEME ')) {
                theme = line.slice('THEME '.length).trim();
            } else if (line.startsWith('WORDS ')) {
                words = line.slice('WORDS '.length).split(',').filter(Boolean);
            } else if (line === 'GRID') {
                const gridLines: string[] = [];
                for (let j = i + 1; j < lines.length; j++) {
                    const row = lines[j]?.trim() ?? '';
                    if (row === 'END') break;
                    if (row) gridLines.push(row);
                }
                grid = gridLines;
                break;
            }
        }

        if (!theme || words.length === 0 || grid.length === 0) {
            throw new Error(`Invalid wordsearch asset: ${file}`);
        }
        puzzles.push({ theme, words, grid });
    }

    if (puzzles.length === 0) throw new Error('No wordsearch assets found');
    return puzzles;
}

async function renderWordsearchImage(puzzle: Puzzle): Promise<string> {
    const font = await loadFont(WORDSEARCH_FONT);
    const image = new Jimp({ width: IMAGE_WIDTH, height: IMAGE_HEIGHT, color: 0xffffffff });
    const title = `Word Search - ${puzzle.theme}`;
    image.print({
        font,
        x: (IMAGE_WIDTH - measureText(font, title)) / 2,
        y: 22,
        text: title,
    });

    const rows = puzzle.grid.map(row => row.split(/\s+/));
    if (rows.length !== 15 || rows.some(row => row.length !== 15)) {
        throw new Error(`Invalid ${puzzle.theme} wordsearch grid`);
    }

    for (let row = 0; row <= 15; row++) {
        const y = Math.round(GRID_TOP + row * CELL_SIZE);
        for (let x = GRID_LEFT; x <= GRID_LEFT + GRID_SIZE; x++) {
            image.setPixelColor(0x000000ff, x, y);
        }
    }
    for (let col = 0; col <= 15; col++) {
        const x = Math.round(GRID_LEFT + col * CELL_SIZE);
        for (let y = GRID_TOP; y <= GRID_TOP + GRID_SIZE; y++) {
            image.setPixelColor(0x000000ff, x, y);
        }
    }

    for (let row = 0; row < 15; row++) {
        const cells = rows[row];
        if (!cells) throw new Error(`Missing wordsearch row ${row + 1}`);
        for (let col = 0; col < 15; col++) {
            const text = cells[col];
            if (!text) throw new Error(`Missing wordsearch cell ${row + 1},${col + 1}`);
            image.print({
                font,
                x: GRID_LEFT + col * CELL_SIZE + (CELL_SIZE - measureText(font, text)) / 2,
                y: GRID_TOP + row * CELL_SIZE + 1,
                text,
            });
        }
    }

    const imagePath = join(tmpdir(), `windsor-wordsearch-${process.pid}-${Date.now()}.png`);
    await writeFile(imagePath, await image.getBuffer(JimpMime.png));
    return imagePath;
}

async function printWordsearchWorker(_args: string, ctx: CommandRunContext): Promise<CommandResultPass> {
    puzzlesPromise ??= loadPuzzles();
    const puzzles = await puzzlesPromise;
    const puzzle = puzzles[Math.floor(Math.random() * puzzles.length)];
    if (!puzzle) throw new Error('No wordsearch puzzle available');

    const imagePath = await renderWordsearchImage(puzzle);
    try {
        const job: PrintJob = {
            urls: [],
            lines: [
                'Find these words:',
                puzzle.words.join('  '),
            ],
            iconPath: imagePath,
        };

        await ctx.printJob(job);
    } finally {
        await unlink(imagePath);
    }

    return {
        kind: "pass"
    };
}

export const printWordsearch: Command = {
    aliases: ["wordsearch"],
    invoke: tryExecCommandFunction(printWordsearchWorker)
};
