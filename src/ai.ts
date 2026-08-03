import { createHash } from 'crypto';
import { mkdir, writeFile, readFile, access } from 'fs/promises';
import { join } from 'path';
import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod.js';
import { z } from 'zod/v4';
import { getCurrentConfig, updateConfig } from './config.ts';
import { logEvent } from './server.ts';

const MODEL = 'gpt-5.4-nano';
const IMAGE_MODEL = 'gpt-image-1-mini';
const TOKEN_LIMIT_24H = 200_000;


export function trackTokenUsage(tokens: number): void {
    const config = getCurrentConfig();
    const entry = { timestamp: new Date().toISOString(), tokens };
    const usage = [...config.tokenUsage, entry];
    // Keep only entries from the last 24 hours
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const pruned = usage.filter(e => e.timestamp >= cutoff);
    void updateConfig({ tokenUsage: pruned });
}

export function getTokenUsage24h(): number {
    const config = getCurrentConfig();
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    return config.tokenUsage
        .filter(e => e.timestamp >= cutoff)
        .reduce((sum, e) => sum + e.tokens, 0);
}

export async function isOverTokenLimit(): Promise<boolean> {
    const used = getTokenUsage24h();
    if (used >= TOKEN_LIMIT_24H) {
        logEvent('error', `Token limit exceeded (${used} tokens in last 24h). Deleting OpenAI key.`);
        const config = getCurrentConfig();
        const updated = { ...config };
        delete updated.openaiKey;
        await updateConfig(updated);
        return true;
    }
    return false;
}


function getClient(): OpenAI | null {
    const key = getCurrentConfig().openaiKey;
    if (!key) return null;
    return new OpenAI({ apiKey: key });
}


const ScheduleSchema = z.object({
    'message without schedule': z.string(),
    'next occurrence': z.string(),
});

type ScheduleResult = z.infer<typeof ScheduleSchema>;

export interface ParsedSchedule {
    message: string;
    nextOccurrence: Date;
}

function parseOccurrenceDate(str: string): Date | null {
    try {
        const d = new Date(str);
        if (!isNaN(d.getTime())) return d;
    } catch {
        // ignore
    }
    return null;
}

export async function parseRecurringSchedule(userMessage: string, now: Date): Promise<ParsedSchedule | null> {
    const client = getClient();
    if (!client) return null;

    if (await isOverTokenLimit()) return null;

    const nowStr = formatScheduleDate(now);
    const prompt = `The user has asked for a recurring printout. It is currently ${nowStr}. Tell me the next time that I should do this, and what the non-schedule part of the message was (verbatim). If the user didn't specify a time of day, use 8:00 AM. Here's the user's message: ${userMessage}`;

    const results: ScheduleResult[] = [];
    const ATTEMPTS = 5;

    for (let i = 0; i < ATTEMPTS; i++) {
        try {
            const completion = await client.chat.completions.create({
                model: MODEL,
                reasoning_effort: 'low',
                messages: [{ role: 'user', content: prompt }],
                text: zodTextFormat(ScheduleSchema, 'schedule'),
            } as Parameters<typeof client.chat.completions.create>[0]) as import("openai/resources/chat/completions/completions.js").ChatCompletion;
            const content = completion.choices[0]?.message?.content;
            if (content) {
                const parsed = ScheduleSchema.parse(JSON.parse(content));
                results.push(parsed);
                const tokens = (completion as { usage?: { total_tokens?: number } }).usage?.total_tokens ?? 0;
                trackTokenUsage(tokens);
            }
        } catch (err) {
            logEvent('error', `Schedule parsing attempt ${i + 1} failed: ${err}`);
        }
    }

    if (results.length < 3) return null;

    // Majority voting: need 60% consistency for each field
    const messageCounts = new Map<string, number>();
    const occurrenceCounts = new Map<string, number>();

    for (const r of results) {
        messageCounts.set(r['message without schedule'], (messageCounts.get(r['message without schedule']) ?? 0) + 1);
        occurrenceCounts.set(r['next occurrence'], (occurrenceCounts.get(r['next occurrence']) ?? 0) + 1);
    }

    const threshold = ATTEMPTS * 0.6;

    let bestMessage: string | null = null;
    for (const [msg, count] of messageCounts) {
        if (count >= threshold) { bestMessage = msg; break; }
    }

    let bestOccurrence: string | null = null;
    for (const [occ, count] of occurrenceCounts) {
        if (count >= threshold) { bestOccurrence = occ; break; }
    }

    if (!bestMessage || !bestOccurrence) return null;

    const occDate = parseOccurrenceDate(bestOccurrence);
    if (!occDate) return null;

    return { message: bestMessage, nextOccurrence: occDate };
}

function formatScheduleDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    let hours = date.getHours();
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    return `${year}-${month}-${day} ${hours}:${minutes} ${ampm}`;
}

export { formatScheduleDate };

export async function getNextOccurrence(originalMessage: string, now: Date): Promise<Date | null> {
    const result = await parseRecurringSchedule(originalMessage, now);
    return result ? result.nextOccurrence : null;
}

export async function generateIcon(text: string, cacheDir: string): Promise<string | null> {
    const prompt = `Black-on-transparent line drawing icon for the TODO item: "${text}". Do not produce any text. Use big, thick lines. No fine detailing.`;
    const hash = createHash('sha1').update(prompt).digest('hex').slice(0, 9);
    const filename = `${hash}.png`;
    const cachePath = join(cacheDir, filename);

    // Check cache first
    try {
        await access(cachePath);
        return cachePath;
    } catch {
        // not cached
    }

    const client = getClient();
    if (!client) return null;

    if (await isOverTokenLimit()) return null;

    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            const response = await client.images.generate({
                model: IMAGE_MODEL,
                prompt,
                n: 1,
                size: '1024x1024',
                quality: 'auto',
                background: 'transparent',
                output_format: 'png',
            } as Parameters<typeof client.images.generate>[0]) as import("openai/resources/images.js").ImagesResponse;

            const imageData = response.data?.[0];
            if (!imageData) throw new Error('No image data returned');

            let imageBuffer: Buffer;
            if ('b64_json' in imageData && imageData.b64_json) {
                imageBuffer = Buffer.from(imageData.b64_json, 'base64');
            } else if ('url' in imageData && imageData.url) {
                const res = await fetch(imageData.url);
                imageBuffer = Buffer.from(await res.arrayBuffer());
            } else {
                throw new Error('No image URL or base64 data');
            }

            await mkdir(cacheDir, { recursive: true });
            await writeFile(cachePath, imageBuffer);
            return cachePath;
        } catch (err) {
            logEvent('error', `Icon generation attempt ${attempt + 1} failed: ${err}`);
            if (attempt === 2) return null;
        }
    }

    return null;
}

// suppress unused import warning
void readFile;
