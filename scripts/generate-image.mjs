import { copyFile } from 'fs/promises';
import { generateIcon } from '../src/ai.ts';
import { loadConfig } from '../src/config.ts';

const description = process.argv.slice(2).join(' ').trim();
if (!description) {
    throw new Error('Usage: npm run gen-image -- description...');
}

const { config } = await loadConfig();
const generatedPath = await generateIcon(description, config.iconCacheDir ?? './icon-cache');
if (!generatedPath) {
    throw new Error('Image generation failed. Check that an OpenAI API key is configured.');
}

await copyFile(generatedPath, 'test.png');
console.log('Wrote test.png');
