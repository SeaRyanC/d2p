// Downloads Gen 1 GameBoy (yellow/gray) sprites for all 151 Kanto pokemon.
// Run once: node scripts/download-pokemon-sprites.mjs

import { mkdir, writeFile, access } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '../src/commands/pokemon-sprites');

const BASE_URL = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-i/yellow/gray';

await mkdir(OUT_DIR, { recursive: true });

let ok = 0, skipped = 0, failed = 0;

for (let id = 1; id <= 151; id++) {
    const dest = join(OUT_DIR, `${id}.png`);
    try {
        await access(dest);
        skipped++;
        continue;
    } catch { /* not downloaded yet */ }

    const url = `${BASE_URL}/${id}.png`;
    const res = await fetch(url);
    if (!res.ok) {
        console.error(`FAIL #${id}: HTTP ${res.status}`);
        failed++;
        continue;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    await writeFile(dest, buf);
    process.stdout.write(`\r${id}/151`);
    ok++;
}

console.log(`\nDone. Downloaded: ${ok}, Skipped (already existed): ${skipped}, Failed: ${failed}`);
