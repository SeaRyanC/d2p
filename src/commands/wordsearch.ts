import type { PrintJob } from '../types.ts';
import type { Command, CommandResultPass, CommandRunContext } from './index.ts';
import { tryExecCommandFunction } from './util.ts';

const THEMES: Array<{ name: string; words: string[] }> = [
    {
        name: 'Animals',
        words: ['CAT', 'DOG', 'BIRD', 'FISH', 'LION', 'BEAR', 'FROG', 'DUCK', 'WOLF', 'DEER'],
    },
    {
        name: 'Fruits',
        words: ['APPLE', 'MANGO', 'GRAPE', 'PEACH', 'PLUM', 'PEAR', 'LIME', 'KIWI', 'FIG', 'DATE'],
    },
    {
        name: 'Colors',
        words: ['RED', 'BLUE', 'GREEN', 'PINK', 'GOLD', 'TEAL', 'CORAL', 'TAN', 'IVORY', 'NAVY'],
    },
    {
        name: 'Space',
        words: ['STAR', 'MOON', 'SUN', 'MARS', 'EARTH', 'VENUS', 'COMET', 'ORBIT', 'NOVA', 'RING'],
    },
    {
        name: 'Food',
        words: ['PIZZA', 'TACO', 'SOUP', 'CAKE', 'RICE', 'BREAD', 'PASTA', 'SALAD', 'CHIP', 'PIE'],
    },
];

const SIZE = 15;

function makeGrid(): string[][] {
    return Array.from({ length: SIZE }, () => Array(SIZE).fill('') as string[]);
}

type Direction = [number, number];

const DIRECTIONS: Direction[] = [
    [0, 1], [1, 0], [1, 1], [1, -1],
    [0, -1], [-1, 0], [-1, -1], [-1, 1],
];

function placeWord(grid: string[][], word: string): boolean {
    const shuffledDirs = [...DIRECTIONS].sort(() => Math.random() - 0.5);
    for (const [dr, dc] of shuffledDirs) {
        for (let attempt = 0; attempt < 30; attempt++) {
            const row = Math.floor(Math.random() * SIZE);
            const col = Math.floor(Math.random() * SIZE);
            let fits = true;
            for (let i = 0; i < word.length; i++) {
                const r = row + dr * i;
                const c = col + dc * i;
                if (r < 0 || r >= SIZE || c < 0 || c >= SIZE) { fits = false; break; }
                const cell = grid[r]?.[c];
                if (cell && cell !== word[i]) { fits = false; break; }
            }
            if (fits) {
                for (let i = 0; i < word.length; i++) {
                    const r = row + dr * i;
                    const c = col + dc * i;
                    if (grid[r]) grid[r]![c] = word[i]!;
                }
                return true;
            }
        }
    }
    return false;
}

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function fillGrid(grid: string[][]): void {
    for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
            if (!grid[r]?.[c]) {
                if (grid[r]) grid[r]![c] = LETTERS[Math.floor(Math.random() * 26)] ?? 'A';
            }
        }
    }
}

function renderGrid(grid: string[][]): string[] {
    return grid.map(row => row.join(' '));
}

async function printWordsearchWorker(_args: string, ctx: CommandRunContext): Promise<CommandResultPass> {
    const theme = THEMES[Math.floor(Math.random() * THEMES.length)];
    if (!theme) throw new Error('No themes available');

    const grid = makeGrid();
    const placed: string[] = [];
    for (const word of theme.words) {
        if (placeWord(grid, word)) placed.push(word);
    }
    fillGrid(grid);

    const lines: string[] = [
        ...renderGrid(grid),
        '',
        'Find these words:',
        placed.join('  '),
    ];

    const job: PrintJob = {
        urls: [],
        header: `Word Search: ${theme.name}`,
        lines,
    };

    await ctx.printJob(job);

    return {
        kind: "pass"
    };
}

export const printWordsearch: Command = {
    aliases: ["wordsearch"],
    invoke: tryExecCommandFunction(printWordsearchWorker)
};
