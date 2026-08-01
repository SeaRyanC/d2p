export interface CommandContext {
    /** The name of the channel the message was sent in */
    channelName: string;
    /** Everything after `!commandName ` */
    args: string;
    /** The full original message content */
    rawMessage: string;
    messageId: string;
    channelId: string;
    guildId: string;
}

export interface BotCommand {
    /** Command name (the word immediately after `!`) */
    name: string;
    /**
     * Channel names this command is active in.
     * Empty array means the command is active in all channels.
     */
    channels: string[];
    description: string;
    execute(context: CommandContext): Promise<void>;
}

export type DiagnosticEventType = 'startup' | 'command' | 'success' | 'error' | 'info';

export interface DiagnosticEvent {
    timestamp: string; // ISO string
    type: DiagnosticEventType;
    message: string;
}

export interface BotStatus {
    connected: boolean;
    tag: string | null;
    startedAt: string | null;
    guilds: string[];
    configuredServerId: string | null;
}

export interface RuntimeConfig {
    discordToken: string | null;
    serverId: string | null;
    diagnosticsPort: number;
    printerName: string | null;
}

export interface PublicRuntimeConfig {
    hasDiscordToken: boolean;
    serverId: string | null;
    diagnosticsPort: number;
    printerName: string | null;
    configPath: string;
}

export interface RuntimeConfigPatch {
    discordToken?: string | null;
    serverId?: string | null;
    diagnosticsPort?: number;
    printerName?: string | null;
}
