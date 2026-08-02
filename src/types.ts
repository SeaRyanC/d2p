// ─── Channel behavior types ───────────────────────────────────────────────────

export type ChannelBehaviorType = 'immediate-print' | 'accumulating-list' | 'recurring-print' | 'on-demand';

export interface ImmediatePrintConfig {
    type: 'immediate-print';
    header?: string;
    footer?: string;
    includeIcon: boolean;
    includeMetadata: boolean;
}

export interface AccumulatingListConfig {
    type: 'accumulating-list';
    header?: string;
    footer?: string;
    includeChecklist: boolean;
    includeMetadata: boolean;
}

export interface RecurringPrintConfig {
    type: 'recurring-print';
    header?: string;
    footer?: string;
    includeIcon: boolean;
    includeMetadata: boolean;
}

export interface OnDemandConfig {
    type: 'on-demand';
}

export type ChannelBehaviorConfig =
    | ImmediatePrintConfig
    | AccumulatingListConfig
    | RecurringPrintConfig
    | OnDemandConfig;

export interface ChannelMapping {
    channelId: string;
    channelName: string;
    config: ChannelBehaviorConfig;
}

// ─── Token usage ──────────────────────────────────────────────────────────────

export interface TokenUsageEntry {
    timestamp: string; // ISO string
    tokens: number;
}

// ─── Main config ─────────────────────────────────────────────────────────────

export interface WindsorConfig {
    discordToken?: string;
    serverId?: string;
    openaiKey?: string;
    diagnosticsPort: number;
    passwordHash?: string;
    channels: ChannelMapping[];
    iconCacheDir?: string;
    tokenUsage: TokenUsageEntry[];
}

// ─── Diagnostics ─────────────────────────────────────────────────────────────

export type DiagnosticEventType = 'startup' | 'command' | 'success' | 'error' | 'info' | 'print';

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

// ─── Print job ────────────────────────────────────────────────────────────────

export interface PrintJob {
    header?: string;
    lines: string[];
    iconPath?: string;
    urls: string[];
    footer?: string;
    metadataLines?: string[];
}

// ─── On-demand command context ────────────────────────────────────────────────

export interface CommandContext {
    channelName: string;
    args: string;
    rawMessage: string;
    messageId: string;
    channelId: string;
    guildId: string;
}

