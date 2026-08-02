import {
    Client,
    GatewayIntentBits,
    type Guild,
    type Message,
    type MessageReaction,
    type TextChannel,
} from 'discord.js';
import { formatScheduleDate, generateIcon, getNextOccurrence, parseRecurringSchedule } from './ai.ts';
import { Commands } from './commands/index.ts';
import { getCurrentConfig, reconcileChannels } from './config.ts';
import { formatTimestamp, printJob } from './printer.ts';
import { logEvent, status } from './server.ts';
import type {
    AccumulatingListConfig,
    ChannelBehaviorConfig,
    ImmediatePrintConfig,
    PrintJob,
    RecurringPrintConfig,
} from './types.ts';
import { Reaction } from './reactions.ts';

const MAX_MESSAGE_CHARS = 800;
const MAX_URLS = 5;

// ─── URL extraction ───────────────────────────────────────────────────────────

const URL_REGEX = /https:\/\/[^\s<>"']+/g;
const TRAILING_PUNCT = /[.,;:!?)\]}>'"]+$/;

export function extractUrls(text: string): string[] {
    const matches = text.match(URL_REGEX) ?? [];
    const result: string[] = [];
    for (const m of matches) {
        try {
            const stripped = m.replace(TRAILING_PUNCT, '');
            new URL(stripped); // validate
            result.push(stripped);
        } catch {
            // not a valid URL - skip
        }
        if (result.length >= MAX_URLS) break;
    }
    return result;
}

export function stripUrls(text: string): string {
    return text.replace(URL_REGEX, '').replace(/\s+/g, ' ').trim();
}

export function replaceUrlsInText(text: string, urls: string[]): string {
    if (urls.length === 0) return text;
    let result = text;
    for (let i = 0; i < urls.length; i++) {
        const url = urls[i];
        if (!url) continue;
        const label = urls.length === 1 ? '[link]' : `[link ${i + 1}]`;
        // Replace first occurrence only (in case of duplicates)
        result = result.replace(url, label);
    }
    return result;
}

// ─── Idempotency helpers ──────────────────────────────────────────────────────

async function hasReaction(message: Message, emoji: Reaction): Promise<boolean> {
    try {
        await message.fetch();
    } catch {
        // ignore
    }
    const reaction: MessageReaction | undefined = message.reactions.cache.get(emoji);
    return Boolean(reaction?.me);
}

async function hasAnyReaction(message: Message) {
    try {
        await message.fetch();
    } catch {
        // ignore
    }
    for (const v of Object.values(Reaction) as Reaction[]) {
        if (message.reactions.cache.get(v)) {
            return true;
        }
    }
    return false;
}

async function reactSafe(message: Message, emoji: Reaction): Promise<void> {
    try {
        await message.react(emoji);
    } catch {
        // ignore
    }
}

async function replySafe(message: Message, content: string): Promise<Message | null> {
    try {
        return await message.reply(content);
    } catch {
        return null;
    }
}

// ─── Normalize "print" trigger ────────────────────────────────────────────────

function isPrintTrigger(content: string): boolean {
    return content.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() === 'print';
}

// ─── Main bot class ───────────────────────────────────────────────────────────

export class WindsorBot {
    private readonly client: Client;

    constructor() {
        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent,
                GatewayIntentBits.GuildMessageReactions,
            ],
        });

        this.client.on('ready', () => void this.onReady());
        this.client.on('messageCreate', (msg) => void this.onMessage(msg));
    }

    async start(token: string): Promise<void> {
        await this.client.login(token);
    }

    destroy(): void {
        this.client.destroy();
    }

    getClient(): Client {
        return this.client;
    }

    private async onReady(): Promise<void> {
        const botUser = this.client.user!;
        status.connected = true;
        status.tag = botUser.tag;
        status.startedAt = new Date().toISOString();
        status.configuredServerId = getCurrentConfig().serverId ?? null;
        status.guilds = [...this.client.guilds.cache.values()].map(g => g.name);

        logEvent('startup', `Connected as ${botUser.tag}`);

        const guilds = this.getTargetGuilds();
        for (const guild of guilds) {
            const channels = await guild.channels.fetch();
            const textChannels = [...channels.values()]
                .filter(c => c?.isTextBased())
                .map(c => ({ id: c!.id, name: (c as TextChannel).name }));
            await reconcileChannels(textChannels);
        }

        await this.startupScan();
    }

    private getTargetGuilds(): Guild[] {
        const serverId = getCurrentConfig().serverId;
        if (!serverId) return [...this.client.guilds.cache.values()];
        const guild = this.client.guilds.cache.get(serverId);
        if (!guild) {
            logEvent('error', `Configured serverId ${serverId} not found`);
            return [];
        }
        return [guild];
    }

    private async startupScan(): Promise<void> {
        logEvent('info', 'Starting startup scan...');
        const config = getCurrentConfig();
        const guilds = this.getTargetGuilds();

        for (const guild of guilds) {
            const channels = await guild.channels.fetch();
            for (const ch of channels.values()) {
                if (!ch?.isTextBased()) continue;
                const textCh = ch as TextChannel;
                const mapping = config.channels.find(m => m.channelId === textCh.id);
                if (!mapping) continue;

                const limit = mapping.config.type === 'recurring-print' ? 500 : 100;
                try {
                    const messages = await textCh.messages.fetch({ limit });
                    const sorted = [...messages.values()].sort((a, b) =>
                        Number(BigInt(a.id) - BigInt(b.id))
                    );
                    await this.processBehaviorStartup(textCh, mapping.config, sorted);
                } catch (err) {
                    logEvent('error', `Startup scan failed for #${textCh.name}: ${err}`);
                }
            }
        }
        logEvent('info', 'Startup scan complete');
    }

    private async processBehaviorStartup(
        channel: TextChannel,
        config: ChannelBehaviorConfig,
        messages: Message[],
    ): Promise<void> {
        const botId = this.client.user?.id;

        switch (config.type) {
            case 'immediate-print': {
                for (const msg of messages) {
                    if (msg.author.bot) continue;
                    if (msg.reference) continue; // skip replies
                    if (msg.author.id === botId) continue;
                    if (await hasAnyReaction(msg)) continue;
                    await this.handleImmediatePrint(msg, config);
                }
                break;
            }
            case 'accumulating-list': {
                // Find print triggers that don't have ✅, re-process them
                for (const msg of messages) {
                    if (msg.author.bot) continue;
                    if (msg.reference) continue;
                    if (msg.author.id === botId) continue;
                    if (!isPrintTrigger(msg.content)) continue;
                    if (await hasAnyReaction(msg)) continue;
                    // Also retry ⏸️ reactions
                    await this.handleAccumulatingPrint(msg, config, messages);
                }
                break;
            }
            case 'recurring-print': {
                await this.startupRecurring(channel, config, messages);
                break;
            }
            case 'on-demand': {
                for (const msg of messages) {
                    if (msg.author.bot) continue;
                    if (msg.reference) continue;
                    if (msg.author.id === botId) continue;
                    if (await hasAnyReaction(msg)) continue;
                    await this.handleOnDemand(msg);
                }
                break;
            }
        }
    }

    private async startupRecurring(
        channel: TextChannel,
        config: RecurringPrintConfig,
        messages: Message[],
    ): Promise<void> {
        // Find bot "Got it. I will print ⟪..." replies
        const botId = this.client.user?.id;
        const scheduleReplies = messages.filter(m =>
            m.author.id === botId && m.content.startsWith('Got it. I will print ⟪')
        );

        for (const scheduleReply of scheduleReplies) {
            // Find the parent message
            const parentId = scheduleReply.reference?.messageId;
            if (!parentId) continue;

            // Check the latest status reply for this schedule
            const statusReplies = messages.filter(m =>
                m.author.id === botId &&
                m.reference?.messageId === scheduleReply.id &&
                (m.content.startsWith('Printed at') || m.content.includes('has expired'))
            );

            const latestStatus = statusReplies[statusReplies.length - 1];

            if (latestStatus?.content.includes('has expired')) {
                continue; // All done
            }

            if (latestStatus && latestStatus.content.startsWith('Printed at') && !await hasReaction(latestStatus, Reaction.ok)) {
                // Printed but no OK reaction - need to fetch next occurrence
                await this.advanceRecurring(scheduleReply, latestStatus, config);
                continue;
            }

            if (!latestStatus) {
                // No status reply yet - check if the schedule reply has ✅ (meaning it's been set up)
                // Find when the next print should be from the schedule reply text
                // Format: "Got it. I will print ⟪text⟫ at TIMESTAMP"
                const match = /at (.+)$/.exec(scheduleReply.content);
                if (!match?.[1]) continue;
                const nextTime = new Date(match[1]);
                if (isNaN(nextTime.getTime())) continue;
                scheduleRecurringTask(scheduleReply, nextTime, config, this);
            }
        }
    }

    private async onMessage(message: Message): Promise<void> {
        if (message.author.bot) return;
        if (message.reference) return; // ignore replies
        if (message.author.id === this.client.user?.id) return;

        const config = getCurrentConfig();
        const mapping = config.channels.find(m => m.channelId === message.channelId);
        if (!mapping) return;

        const serverId = config.serverId;
        if (serverId && message.guildId !== serverId) return;

        switch (mapping.config.type) {
            case 'immediate-print':
                await this.handleImmediatePrint(message, mapping.config);
                break;
            case 'accumulating-list': {
                if (isPrintTrigger(message.content)) {
                    const channel = message.channel as TextChannel;
                    const messages = await channel.messages.fetch({ limit: 100 });
                    const sorted = [...messages.values()].sort((a, b) =>
                        Number(BigInt(a.id) - BigInt(b.id))
                    );
                    await this.handleAccumulatingPrint(message, mapping.config, sorted);
                }
                break;
            }
            case 'recurring-print':
                await this.handleRecurringSetup(message, mapping.config);
                break;
            case 'on-demand':
                await this.handleOnDemand(message);
                break;
        }
    }

    // ─── Immediate Print ────────────────────────────────────────────────────────

    async handleImmediatePrint(message: Message, config: ImmediatePrintConfig): Promise<void> {
        const rawContent = message.content;
        const urls = extractUrls(rawContent);
        const textWithLinkLabels = replaceUrlsInText(rawContent, urls);
        const strippedText = stripUrls(rawContent);

        if (strippedText.length > MAX_MESSAGE_CHARS) {
            await reactSafe(message, Reaction.fail);
            return;
        }

        const job: PrintJob = {
            lines: [textWithLinkLabels],
            urls,
        };

        if (config.header) job.header = config.header;
        if (config.footer) job.footer = config.footer;
        if (config.includeMetadata) {
            job.metadataLines = [
                `${message.author.username} · ${formatTimestamp(message.createdAt)}`,
            ];
        }

        if (config.includeIcon) {
            const iconCacheDir = getCurrentConfig().iconCacheDir ?? './icon-cache';
            const iconPath = await generateIcon(strippedText, iconCacheDir);
            if (iconPath) job.iconPath = iconPath;
        }

        try {
            await printJob(job);
            await reactSafe(message, Reaction.ok);
            logEvent('print', `Printed immediate message from ${message.author.username}`);
        } catch (err) {
            await reactSafe(message, Reaction.fail);
            await replySafe(message, `⏸️ Print failed: ${err instanceof Error ? err.message : String(err)}`);
            logEvent('error', `Print failed: ${err}`);
        }
    }

    // ─── Accumulating List ──────────────────────────────────────────────────────

    async handleAccumulatingPrint(
        triggerMessage: Message,
        config: AccumulatingListConfig,
        allMessages: Message[],
    ): Promise<void> {
        const botId = this.client.user?.id;

        // Find the previous print trigger (has ✅ reaction from bot)
        const triggerIdx = allMessages.findIndex(m => m.id === triggerMessage.id);
        const prior = allMessages.slice(0, triggerIdx).reverse();
        const prevPrintIdx = prior.findIndex(m =>
            !m.author.bot &&
            !m.reference &&
            isPrintTrigger(m.content) &&
            m.reactions.cache.get(Reaction.ok)?.me
        );

        const startIdx = prevPrintIdx === -1 ? 0 : triggerIdx - prevPrintIdx;

        // Collect items between the previous print trigger and this one
        let items = allMessages.slice(startIdx, triggerIdx).filter(m =>
            !m.author.bot &&
            !m.reference &&
            m.author.id !== botId &&

            !isPrintTrigger(m.content)
        );

        // Use latest version of edited messages (discord.js gives us current content)
        // If 0 items, print the "previous" list (retry)
        if (items.length === 0) {
            // Re-use items from the previous print
            if (prevPrintIdx === -1) {
                await reactSafe(triggerMessage, Reaction.ok);
                return;
            }
            const prevTriggerMsg = prior[prevPrintIdx];
            if (!prevTriggerMsg) {
                await reactSafe(triggerMessage, Reaction.ok);
                return;
            }
            const prevTriggerIdx = allMessages.findIndex(m => m.id === prevTriggerMsg.id);
            const beforePrev = allMessages.slice(0, prevTriggerIdx);
            const prevPrevIdx = beforePrev.reverse().findIndex(m =>
                !m.author.bot && !m.reference && isPrintTrigger(m.content) && m.reactions.cache.get(Reaction.ok)?.me
            );
            const prevStartIdx = prevPrevIdx === -1 ? 0 : prevTriggerIdx - prevPrevIdx;
            items = allMessages.slice(prevStartIdx, prevTriggerIdx).filter(m =>
                !m.author.bot && !m.reference && m.author.id !== botId && !isPrintTrigger(m.content)
            );
        }

        if (items.length === 0) {
            await reactSafe(triggerMessage, Reaction.ok);
            return;
        }

        const lines = items.map(m => {
            const urls = extractUrls(m.content);
            const text = replaceUrlsInText(m.content, urls);
            return config.includeChecklist ? `☐ ${text}` : text;
        });

        const job: PrintJob = { lines, urls: [] };
        if (config.header) job.header = config.header;
        if (config.footer) job.footer = config.footer;
        if (config.includeMetadata) {
            job.metadataLines = [`Printed at ${formatTimestamp(new Date())}`];
        }

        try {
            await printJob(job);
            await reactSafe(triggerMessage, Reaction.ok);
            logEvent('print', `Printed accumulating list (${lines.length} items)`);
        } catch (err) {
            await reactSafe(triggerMessage, Reaction.fail);
            await replySafe(triggerMessage, `⏸️ Print failed: ${err instanceof Error ? err.message : String(err)}`);
            logEvent('error', `Accumulating print failed: ${err}`);
        }
    }

    // ─── Recurring Print ─────────────────────────────────────────────────────────

    async handleRecurringSetup(message: Message, config: RecurringPrintConfig): Promise<void> {
        const rawContent = message.content;

        try {
            const parsed = await parseRecurringSchedule(rawContent, new Date());
            if (!parsed) {
                await reactSafe(message, Reaction.what);
                await replySafe(message, '⁉️ Could not parse a schedule from your message. Please try again with a clearer schedule.');
                return;
            }

            const nextStr = formatScheduleDate(parsed.nextOccurrence);
            await reactSafe(message, Reaction.ok);
            const reply = await replySafe(message, `Got it. I will print ⟪${parsed.message}⟫ at ${nextStr}`);

            if (reply) {
                scheduleRecurringTask(reply, parsed.nextOccurrence, config, this);
            }
        } catch (err) {
            await reactSafe(message, Reaction.fail);
            await replySafe(message, `⁉️ Failed to parse schedule: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    async executeRecurringTask(
        scheduleReply: Message,
        config: RecurringPrintConfig,
    ): Promise<void> {
        // Extract message text from schedule reply
        const match = /⟪(.+?)⟫/.exec(scheduleReply.content);
        if (!match?.[1]) return;
        const text = match[1];

        // Find the original user message to get context
        const originalMsgId = scheduleReply.reference?.messageId;

        const urls = extractUrls(text);
        const textWithLinks = replaceUrlsInText(text, urls);
        const strippedText = stripUrls(text);

        const job: PrintJob = {
            lines: [textWithLinks],
            urls,
        };
        if (config.header) job.header = config.header;
        if (config.footer) job.footer = config.footer;
        if (config.includeMetadata) {
            job.metadataLines = [`Recurring · ${formatTimestamp(new Date())}`];
        }
        if (config.includeIcon) {
            const iconCacheDir = getCurrentConfig().iconCacheDir ?? './icon-cache';
            const iconPath = await generateIcon(strippedText, iconCacheDir);
            if (iconPath) job.iconPath = iconPath;
        }

        const printedAt = formatTimestamp(new Date());

        try {
            await printJob(job);
        } catch (err) {
            // Print failed - don't advance, will retry on next startup
            logEvent('error', `Recurring print failed: ${err}`);
            return;
        }

        logEvent('print', `Printed recurring task: ${text}`);

        // Ask AI for next occurrence
        const originalUserMessage = scheduleReply.content.replace(/^Got it\. I will print ⟪.+?⟫ at /, '');
        const nextOccurrence = await getNextOccurrence(originalUserMessage, new Date());

        let statusReply: Message | null;
        if (!nextOccurrence) {
            statusReply = await replySafe(scheduleReply, 'This occurrence has expired and no more prints are scheduled');
        } else {
            const nextStr = formatScheduleDate(nextOccurrence);
            statusReply = await replySafe(scheduleReply, `Printed at ${printedAt}. The next print will be at ${nextStr}.`);
        }

        if (statusReply) {
            await reactSafe(statusReply, Reaction.ok);
        }

        if (nextOccurrence && statusReply) {
            scheduleRecurringTask(scheduleReply, nextOccurrence, config, this);
        }
    }

    async advanceRecurring(
        scheduleReply: Message,
        latestStatusReply: Message,
        config: RecurringPrintConfig,
    ): Promise<void> {
        // The print happened but we never got next occurrence - ask AI now
        const match = /⟪(.+?)⟫/.exec(scheduleReply.content);
        if (!match?.[1]) return;

        const nextOccurrence = await getNextOccurrence(match[1], new Date());
        if (!nextOccurrence) {
            await replySafe(latestStatusReply, 'This occurrence has expired and no more prints are scheduled');
            return;
        }

        const nextStr = formatScheduleDate(nextOccurrence);
        await replySafe(latestStatusReply, `The next print will be at ${nextStr}.`);
        await reactSafe(latestStatusReply, Reaction.ok);
        scheduleRecurringTask(scheduleReply, nextOccurrence, config, this);
    }

    // ─── On-Demand ──────────────────────────────────────────────────────────────

    async handleOnDemand(message: Message): Promise<void> {
        const content = message.content.trim();
        if (!content.startsWith('!') && !content.startsWith('/')) return;

        const afterPrefix = content.slice(1).trim();
        const spaceIdx = afterPrefix.indexOf(' ');
        const commandName = (spaceIdx === -1 ? afterPrefix : afterPrefix.slice(0, spaceIdx)).toLowerCase();
        const args = spaceIdx === -1 ? '' : afterPrefix.slice(spaceIdx + 1).trim();

        let foundCommand = false;
        for (const cmd of Commands) {
            if (cmd.aliases.some(a => commandName.localeCompare(a, undefined, { sensitivity: "base" }) == 0)) {
                foundCommand = true;
                const result = await cmd.invoke(args);
                if (result.kind === 'pass') {
                    await reactSafe(message, "✅");
                    if (result.reply) {
                        await replySafe(message, result.reply);
                    }
                } else {
                    void (result.kind satisfies 'fail');
                    await reactSafe(message, "❌");
                    await replySafe(message, result.reason);
                }
                break;
            }
        }
        if (!foundCommand) {
            await reactSafe(message, "❓");
        }
    }
}

// ─── Recurring task scheduler ─────────────────────────────────────────────────

interface ScheduledTask {
    scheduleReply: Message;
    nextOccurrence: Date;
    config: RecurringPrintConfig;
    bot: WindsorBot;
    timerId: ReturnType<typeof setTimeout>;
}

const scheduledTasks = new Map<string, ScheduledTask>();

export function scheduleRecurringTask(
    scheduleReply: Message,
    nextOccurrence: Date,
    config: RecurringPrintConfig,
    bot: WindsorBot,
): void {
    const key = scheduleReply.id;
    const existing = scheduledTasks.get(key);
    if (existing) clearTimeout(existing.timerId);

    const delay = Math.max(0, nextOccurrence.getTime() - Date.now());
    const timerId = setTimeout(() => {
        scheduledTasks.delete(key);
        void bot.executeRecurringTask(scheduleReply, config);
    }, delay);

    scheduledTasks.set(key, { scheduleReply, nextOccurrence, config, bot, timerId });
}

export function checkScheduledTasks(): void {
    const now = new Date();
    for (const [key, task] of scheduledTasks) {
        if (task.nextOccurrence <= now) {
            clearTimeout(task.timerId);
            scheduledTasks.delete(key);
            void task.bot.executeRecurringTask(task.scheduleReply, task.config);
        }
    }
}
