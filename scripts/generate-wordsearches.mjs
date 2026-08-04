import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const BANK_DIR = join(ROOT, 'scripts/wordsearch-themes');
const BLOCKLIST_FILE = join(ROOT, 'scripts/wordsearch-blocklist.rot13.txt');
const OUTPUT_DIR = join(ROOT, 'assets/wordsearches');
const SIZE = 15;
const PUZZLE_COUNT = 20;
const WORDS_PER_PUZZLE = 10;
const DIRECTIONS = [
    [0, 1], [1, 0], [1, 1], [1, -1],
    [0, -1], [-1, 0], [-1, -1], [-1, 1],
];
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function rot13(value) {
    return value.replace(/[A-Za-z]/g, char => {
        const base = char <= 'Z' ? 65 : 97;
        return String.fromCharCode(((char.charCodeAt(0) - base + 13) % 26) + base);
    });
}

async function readBlockedWords() {
    const lines = (await readFile(BLOCKLIST_FILE, 'utf8'))
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#'));
    return new Set(lines.map(word => rot13(word).toUpperCase()));
}

function random(seed) {
    let state = seed >>> 0;
    return () => {
        state = Math.imul(1664525, state) + 1013904223;
        return (state >>> 0) / 0x100000000;
    };
}

function shuffle(values, next) {
    const result = [...values];
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}

function makePuzzle(words, next) {
    for (let restart = 0; restart < 100; restart++) {
        const grid = Array.from({ length: SIZE }, () => Array(SIZE).fill(''));
        const placed = [];
        const candidates = shuffle(words, next).sort((a, b) => b.length - a.length);
        let failed = false;

        for (const word of candidates) {
            let placedWord = false;
            for (const [dr, dc] of shuffle(DIRECTIONS, next)) {
                for (let attempt = 0; attempt < 100; attempt++) {
                    const row = Math.floor(next() * SIZE);
                    const col = Math.floor(next() * SIZE);
                    const cells = [];
                    let fits = true;
                    for (let i = 0; i < word.length; i++) {
                        const r = row + dr * i;
                        const c = col + dc * i;
                        if (r < 0 || r >= SIZE || c < 0 || c >= SIZE) {
                            fits = false;
                            break;
                        }
                        const cell = grid[r][c];
                        if (cell && cell !== word[i]) {
                            fits = false;
                            break;
                        }
                        cells.push([r, c]);
                    }
                    if (!fits) continue;
                    for (let i = 0; i < cells.length; i++) {
                        const [r, c] = cells[i];
                        grid[r][c] = word[i];
                    }
                    placed.push(word);
                    placedWord = true;
                    break;
                }
                if (placedWord) break;
            }
            if (!placedWord) {
                failed = true;
                break;
            }
        }

        if (failed) continue;
        for (const row of grid) {
            for (let col = 0; col < SIZE; col++) {
                if (!row[col]) row[col] = LETTERS[Math.floor(next() * LETTERS.length)];
            }
        }
        return { words: placed, grid: grid.map(row => row.join(' ')) };
    }
    throw new Error('Could not place all words in a puzzle');
}

async function main() {
    const files = (await readdir(BANK_DIR)).filter(file => file.endsWith('.txt')).sort();
    if (files.length !== 10) throw new Error(`Expected 10 theme banks, found ${files.length}`);
    const blockedWords = await readBlockedWords();
    await mkdir(OUTPUT_DIR, { recursive: true });

    for (const file of files) {
        const lines = (await readFile(join(BANK_DIR, file), 'utf8'))
            .split(/\r?\n/)
            .map(line => line.trim())
            .filter(line => line && !line.startsWith('#'));
        const theme = lines.shift();
        if (!theme || lines.length < WORDS_PER_PUZZLE) throw new Error(`Invalid theme bank: ${file}`);
        const words = lines.map(word => word.toUpperCase());
        if (words.some(word => !/^[A-Z]+$/.test(word))) throw new Error(`Invalid word in ${file}`);
        const blocked = words.find(word => blockedWords.has(word));
        if (blocked) throw new Error(`Blocked word "${blocked}" found in ${file}`);

        const seed = [...file].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) >>> 0, 0);
        const next = random(seed);
        const output = [
            'WORDSEARCH 1',
            `THEME ${theme}`,
            `SIZE ${SIZE}`,
            `COUNT ${PUZZLE_COUNT}`,
            '',
        ];
        for (let i = 1; i <= PUZZLE_COUNT; i++) {
            const puzzle = makePuzzle(shuffle(words, next).slice(0, WORDS_PER_PUZZLE), next);
            output.push(`PUZZLE ${i}`, `WORDS ${puzzle.words.join(',')}`, 'GRID', ...puzzle.grid, 'END', '');
        }
        const outputName = `${basename(file, '.txt')}.txt`;
        await writeFile(join(OUTPUT_DIR, outputName), output.join('\n'));
    }
}

await main();
