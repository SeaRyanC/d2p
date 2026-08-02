import { printJob } from '../printer.ts';
import type { PrintJob } from '../types.ts';
import type { Command, CommandResult } from './index.ts';
import { tryExecCommandFunction } from './util.ts';

type Difficulty = 'kid' | 'easy' | 'medium' | 'hard' | '';

type Grid = (number | 0)[][];

function generateSudoku(difficulty: Difficulty): Grid {
    // Start with a solved grid
    const base: Grid = [
        [5, 3, 4, 6, 7, 8, 9, 1, 2],
        [6, 7, 2, 1, 9, 5, 3, 4, 8],
        [1, 9, 8, 3, 4, 2, 5, 6, 7],
        [8, 5, 9, 7, 6, 1, 4, 2, 3],
        [4, 2, 6, 8, 5, 3, 7, 9, 1],
        [7, 1, 3, 9, 2, 4, 8, 5, 6],
        [9, 6, 1, 5, 3, 7, 2, 8, 4],
        [2, 8, 7, 4, 1, 9, 6, 3, 5],
        [3, 4, 5, 2, 8, 6, 1, 7, 9],
    ];

    // Number of cells to remove based on difficulty
    const removes: Record<NonNullable<Difficulty>, number> = {
        '': 35,
        kid: 20,
        easy: 35,
        medium: 45,
        hard: 55,
    };
    const toRemove = removes[difficulty] ?? 35;

    // Shuffle positions and remove
    const positions = Array.from({ length: 81 }, (_, i) => i);
    for (let i = positions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = positions[i]!;
        positions[i] = positions[j]!;
        positions[j] = tmp;
    }

    const grid: Grid = base.map(row => [...row] as (number | 0)[]);
    for (let i = 0; i < toRemove; i++) {
        const pos = positions[i];
        if (pos === undefined) break;
        const row = Math.floor(pos / 9);
        const col = pos % 9;
        if (grid[row]) grid[row]![col] = 0;
    }
    return grid;
}

function renderSudokuGrid(grid: Grid): string[] {
    const lines: string[] = [];
    lines.push('┌───────┬───────┬───────┐');
    for (let row = 0; row < 9; row++) {
        const cells = grid[row] ?? [];
        const r1 = cells.slice(0, 3).map(c => c === 0 ? '·' : String(c)).join(' ');
        const r2 = cells.slice(3, 6).map(c => c === 0 ? '·' : String(c)).join(' ');
        const r3 = cells.slice(6, 9).map(c => c === 0 ? '·' : String(c)).join(' ');
        lines.push(`│ ${r1} │ ${r2} │ ${r3} │`);
        if (row === 2 || row === 5) {
            lines.push('├───────┼───────┼───────┤');
        }
    }
    lines.push('└───────┴───────┴───────┘');
    return lines;
}

async function printSudokuWorker(args: string): Promise<CommandResult> {
    // !TODO: Implement good command parsing
    const difficulty = args as Difficulty;

    const diff = difficulty || 'easy';
    const grid = generateSudoku(diff as Difficulty);
    const gridLines = renderSudokuGrid(grid);

    const job: PrintJob = {
        urls: [],
        header: `Sudoku (${diff})`,
        lines: gridLines,
    };

    await printJob(job);

    return {
        kind: "pass"
    };
}

export const printSudoku: Command = {
    aliases: ["sudoku"],
    invoke: tryExecCommandFunction(printSudokuWorker)
};
