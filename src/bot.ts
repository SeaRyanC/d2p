import {
    Client,
    GatewayIntentBits,
    type Guild,
    type Message,
    type TextChannel,
} from 'discord.js';
import { commands } from './commands/index.ts';
import { logEvent, status } from './server.ts';
import type { CommandContext } from './types.ts';

const COMMAND_PREFIX = '!';
const SUCCESS_EMOJI = '✅';
const ERROR_EMOJI = '❌';

export class HouseholdBot {
    private readonly client: Client;
    private readonly getConfiguredServerId: () => string | null;

    constructor(getConfiguredServerId: () => string | null) {
        this.getConfiguredServerId = getConfiguredServerId;
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

    private async onReady(): Promise<void> {
        const botUser = this.client.user!;
        status.connected = true;
        status.tag = botUser.tag;
        status.startedAt = new Date().toISOString();
        status.configuredServerId = this.getConfiguredServerId();

        const targetGuilds = this.getTargetGuilds();
        status.guilds = targetGuilds.map(g => g.name);

        logEvent('startup', `Logged in as ${botUser.tag}; in guilds: ${status.guilds.join(', ') || 'none'}`);
        logEvent('info', `Loaded commands: ${commands.map(c => `!${c.name}`).join(', ')}`);

        await this.scanForUnhandledMessages();
    }

    /**
     * On startup, fetch the last 100 messages in every channel that has at
     * least one applicable command and process any that the bot hasn't already
     * reacted to.
     */
    private async scanForUnhandledMessages(): Promise<void> {
        logEvent('info', 'Starting startup scan for unhandled messages…');
        let scanned = 0;
        let processed = 0;

        for (const guild of this.getTargetGuilds()) {
            const channels = await guild.channels.fetch();
            for (const channel of channels.values()) {
                if (!channel?.isTextBased()) continue;
                const textChannel = channel as TextChannel;

                const applicable = commands.filter(cmd =>
                    cmd.channels.length === 0 || cmd.channels.includes(textChannel.name)
                );
                if (applicable.length === 0) continue;

                try {
                    const messages = await textChannel.messages.fetch({ limit: 100 });
                    scanned += messages.size;
                    for (const message of messages.values()) {
                        if (await this.processMessage(message)) processed++;
                    }
                } catch (err) {
                    logEvent('error', `Could not scan #${textChannel.name}: ${err}`);
                }
            }
        }

        logEvent('info', `Startup scan complete — scanned ${scanned} messages, processed ${processed} new actions`);
    }

    private getTargetGuilds(): Guild[] {
        const configuredServerId = this.getConfiguredServerId();
        status.configuredServerId = configuredServerId;

        if (!configuredServerId) {
            return [...this.client.guilds.cache.values()];
        }

        const guild = this.client.guilds.cache.get(configuredServerId);
        if (!guild) {
            logEvent('error', `Configured serverId ${configuredServerId} not found in connected guilds`);
            return [];
        }

        return [guild];
    }

    private async onMessage(message: Message): Promise<void> {
        await this.processMessage(message);
    }

    /**
     * Parses and executes the command in `message` if applicable.
     * Returns true if an action was executed, false if skipped (not a command,
     * wrong channel, or already handled).
     */
    private async processMessage(message: Message): Promise<boolean> {
        if (message.author.bot) return false;
        const configuredServerId = this.getConfiguredServerId();
        if (configuredServerId && message.guildId !== configuredServerId) return false;
        if (!message.content.startsWith(COMMAND_PREFIX)) return false;

        const afterPrefix = message.content.slice(COMMAND_PREFIX.length).trim();
        const spaceIndex = afterPrefix.indexOf(' ');
        const commandName = spaceIndex === -1 ? afterPrefix : afterPrefix.slice(0, spaceIndex);
        const args = spaceIndex === -1 ? '' : afterPrefix.slice(spaceIndex + 1).trim();

        if (!commandName) return false;

        const channelName = (message.channel as TextChannel).name ?? '';
        const command = commands.find(cmd =>
            cmd.name === commandName &&
            (cmd.channels.length === 0 || cmd.channels.includes(channelName))
        );
        if (!command) return false;

        // Idempotency: if the bot has already reacted ✅, this message is done.
        const successReaction = message.reactions.cache.get(SUCCESS_EMOJI);
        if (successReaction?.me) return false;

        const ctx: CommandContext = {
            channelName,
            args,
            rawMessage: message.content,
            messageId: message.id,
            channelId: message.channelId,
            guildId: message.guildId!,
        };

        logEvent('command', `!${command.name} in #${channelName}: "${args}"`);

        try {
            await command.execute(ctx);
            await message.react(SUCCESS_EMOJI);
            logEvent('success', `!${command.name} completed successfully`);
            return true;
        } catch (err) {
            const detail = err instanceof Error ? err.message : String(err);
            logEvent('error', `!${command.name} failed: ${detail}`);
            await message.react(ERROR_EMOJI).catch(() => undefined);
            await message.reply(`❌ **${command.name}** failed: ${detail}`).catch(() => undefined);
            return false;
        }
    }
}
