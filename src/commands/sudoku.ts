import { readFile, unlink, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { Jimp, JimpMime, loadFont, measureText } from 'jimp';
import type { PrintJob } from '../types.ts';
import type { Command, CommandResult, CommandRunContext } from './index.ts';
import { tryExecCommandFunction } from './util.ts';

type Difficulty = 'kid' | 'easy' | 'medium' | 'hard' | '';

type Grid = (number | 0)[][];

const __dirname = dirname(fileURLToPath(import.meta.url));
const SUDOKU_DIR = join(__dirname, '../../assets');
const puzzleCache = new Map<string, Promise<Grid[]>>();
const FONT_DIR = new URL('../../node_modules/@jimp/plugin-print/dist/fonts/open-sans/', import.meta.url).pathname;
const SUDOKU_FONT = `${FONT_DIR}open-sans-32-black/open-sans-32-black.fnt`;
const IMAGE_WIDTH = 560;
const IMAGE_HEIGHT = 640;
const GRID_SIZE = 504;
const GRID_LEFT = (IMAGE_WIDTH - GRID_SIZE) / 2;
const GRID_TOP = 98;
const CELL_SIZE = GRID_SIZE / 9;

async function loadSudokus(difficulty: Exclude<Difficulty, ''>): Promise<Grid[]> {
    let puzzles = puzzleCache.get(difficulty);
    if (!puzzles) {
        puzzles = readFile(join(SUDOKU_DIR, `sudoku-${difficulty}.txt`), 'utf8').then(contents => {
            const lines = contents.split(/\r?\n/).filter(Boolean);
            return lines.map((puzzle, index) => {
                if (puzzle.length !== 81 || /[^.1-9]/.test(puzzle)) {
                    throw new Error(`Invalid Sudoku puzzle at ${difficulty} asset line ${index + 1}`);
                }
                return Array.from({ length: 9 }, (_, row) =>
                    Array.from(puzzle.slice(row * 9, row * 9 + 9), cell => cell === '.' ? 0 : Number(cell))
                );
            });
        });
        puzzleCache.set(difficulty, puzzles);
    }
    return puzzles;
}

async function renderSudokuImage(grid: Grid, difficulty: Exclude<Difficulty, ''>): Promise<string> {
    const font = await loadFont(SUDOKU_FONT);
    const image = new Jimp({ width: IMAGE_WIDTH, height: IMAGE_HEIGHT, color: 0xffffffff });
    const title = `Sudoku - ${difficulty}`;
    image.print({
        font,
        x: (IMAGE_WIDTH - measureText(font, title)) / 2,
        y: 24,
        text: title,
    });

    for (let row = 0; row < 10; row++) {
        const thickness = row % 3 === 0 ? 4 : 1;
        const y = Math.round(GRID_TOP + row * CELL_SIZE);
        for (let offset = 0; offset < thickness; offset++) {
            for (let x = GRID_LEFT; x <= GRID_LEFT + GRID_SIZE; x++) {
                image.setPixelColor(0x000000ff, x, y + offset);
            }
        }
    }
    for (let col = 0; col < 10; col++) {
        const thickness = col % 3 === 0 ? 4 : 1;
        const x = Math.round(GRID_LEFT + col * CELL_SIZE);
        for (let offset = 0; offset < thickness; offset++) {
            for (let y = GRID_TOP; y <= GRID_TOP + GRID_SIZE; y++) {
                image.setPixelColor(0x000000ff, x + offset, y);
            }
        }
    }

    for (let row = 0; row < 9; row++) {
        const cells = grid[row];
        if (!cells) throw new Error(`Missing Sudoku row ${row + 1}`);
        for (let col = 0; col < 9; col++) {
            const value = cells[col];
            if (value === undefined || value === 0) continue;
            const text = String(value);
            const x = GRID_LEFT + col * CELL_SIZE + (CELL_SIZE - measureText(font, text)) / 2;
            image.print({
                font,
                x,
                y: GRID_TOP + row * CELL_SIZE + 9,
                text,
            });
        }
    }

    const imagePath = join(tmpdir(), `windsor-sudoku-${process.pid}-${Date.now()}.png`);
    await writeFile(imagePath, await image.getBuffer(JimpMime.png));
    return imagePath;
}

async function printSudokuWorker(args: string, ctx: CommandRunContext): Promise<CommandResult> {
    // !TODO: Implement good command parsing
    const difficulty = args as Difficulty;

    const diff = difficulty || 'easy';
    const puzzles = await loadSudokus(diff as Exclude<Difficulty, ''>);
    const grid = puzzles[Math.floor(Math.random() * puzzles.length)];
    if (!grid) throw new Error(`No Sudoku puzzles available for ${diff}`);
    const imagePath = await renderSudokuImage(grid, diff as Exclude<Difficulty, ''>);
    try {
        const job: PrintJob = {
            urls: [],
            lines: [],
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

export const printSudoku: Command = {
    aliases: ["sudoku"],
    invoke: tryExecCommandFunction(printSudokuWorker)
};
