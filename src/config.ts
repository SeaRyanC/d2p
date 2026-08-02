import { readFile, writeFile } from 'fs/promises';
import { createHash } from 'crypto';
import { join } from 'path';
import type { WindsorConfig, ChannelMapping, TokenUsageEntry } from './types.ts';

export const DEFAULT_CONFIG_FILE = 'windsor.config.json';
const LEGACY_CONFIG_FILE = 'd2p.config.json';

export function getConfigPath(): string {
    if (process.env['WINDSOR_CONFIG_PATH']) return process.env['WINDSOR_CONFIG_PATH'];
    if (process.env['D2P_CONFIG_PATH']) return process.env['D2P_CONFIG_PATH'];
    return join(process.cwd(), DEFAULT_CONFIG_FILE);
}

// ─── In-memory state ──────────────────────────────────────────────────────────

let _config: WindsorConfig = {
    diagnosticsPort: 8080,
    channels: [],
    tokenUsage: [],
};
let _configPath: string = getConfigPath();

export function getCurrentConfig(): WindsorConfig {
    return _config;
}

export function getConfigFilePath(): string {
    return _configPath;
}

// ─── Persistence ──────────────────────────────────────────────────────────────

function defaultConfig(): WindsorConfig {
    const envPort = Number.parseInt(process.env['DIAGNOSTICS_PORT'] ?? '8080', 10);
    const diagnosticsPort = Number.isFinite(envPort) && envPort >= 1 && envPort <= 65535 ? envPort : 8080;
    const result: WindsorConfig = {
        diagnosticsPort,
        channels: [],
        tokenUsage: [],
    };
    const token = process.env['DISCORD_TOKEN']?.trim();
    if (token) result.discordToken = token;
    const serverId = process.env['SERVER_ID']?.trim();
    if (serverId) result.serverId = serverId;
    const openaiKey = process.env['OPENAI_API_KEY']?.trim();
    if (openaiKey) result.openaiKey = openaiKey;
    return result;
}

function parseConfig(raw: unknown): WindsorConfig {
    if (typeof raw !== 'object' || raw === null) {
        return defaultConfig();
    }
    const obj = raw as Record<string, unknown>;
    const base = defaultConfig();
    const result: WindsorConfig = {
        diagnosticsPort: typeof obj['diagnosticsPort'] === 'number' ? obj['diagnosticsPort'] : base.diagnosticsPort,
        channels: Array.isArray(obj['channels']) ? (obj['channels'] as unknown[]).flatMap(c => {
            if (typeof c === 'object' && c !== null) return [c as ChannelMapping];
            return [];
        }) : [],
        tokenUsage: Array.isArray(obj['tokenUsage']) ? (obj['tokenUsage'] as unknown[]).flatMap(e => {
            if (typeof e === 'object' && e !== null) return [e as TokenUsageEntry];
            return [];
        }) : [],
    };
    if (typeof obj['discordToken'] === 'string' && obj['discordToken'].trim()) {
        result.discordToken = obj['discordToken'].trim();
    } else if (base.discordToken) {
        result.discordToken = base.discordToken;
    }
    if (typeof obj['serverId'] === 'string' && obj['serverId'].trim()) {
        result.serverId = obj['serverId'].trim();
    } else if (base.serverId) {
        result.serverId = base.serverId;
    }
    if (typeof obj['openaiKey'] === 'string' && obj['openaiKey'].trim()) {
        result.openaiKey = obj['openaiKey'].trim();
    } else if (base.openaiKey) {
        result.openaiKey = base.openaiKey;
    }
    if (typeof obj['passwordHash'] === 'string') result.passwordHash = obj['passwordHash'];
    if (typeof obj['iconCacheDir'] === 'string') result.iconCacheDir = obj['iconCacheDir'];
    return result;
}

export async function loadConfig(): Promise<{ config: WindsorConfig; configPath: string }> {
    _configPath = getConfigPath();

    // Try canonical path, then legacy path
    const pathsToTry = [_configPath];
    if (_configPath.endsWith(DEFAULT_CONFIG_FILE)) {
        pathsToTry.push(join(process.cwd(), LEGACY_CONFIG_FILE));
    }

    for (const p of pathsToTry) {
        try {
            const raw = await readFile(p, 'utf8');
            _config = parseConfig(JSON.parse(raw));
            _configPath = p;
            return { config: _config, configPath: _configPath };
        } catch (err) {
            if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
                throw err;
            }
        }
    }

    _config = defaultConfig();
    return { config: _config, configPath: _configPath };
}

export async function saveCurrentConfig(): Promise<void> {
    await writeFile(_configPath, `${JSON.stringify(_config, null, 2)}\n`, 'utf8');
}

export async function updateConfig(patch: Partial<WindsorConfig>): Promise<WindsorConfig> {
    const updated: WindsorConfig = { ..._config, ...patch };
    _config = updated;
    await saveCurrentConfig();
    return _config;
}

// ─── Password hashing ─────────────────────────────────────────────────────────

export function hashPassword(password: string): string {
    return createHash('sha256').update(password).digest('hex');
}

export function checkPassword(password: string): boolean {
    if (!_config.passwordHash) return true; // no password set
    return hashPassword(password) === _config.passwordHash;
}

// ─── Channel reconciliation ───────────────────────────────────────────────────

export interface DiscordChannelInfo {
    id: string;
    name: string;
}

/**
 * Reconcile channel configs against the current set of Discord channels.
 * Match by ID first, then by name. Delete unmatched UNLESS all channels are missing (server blip).
 * Mutates config.channels in place and saves.
 */
export async function reconcileChannels(discordChannels: DiscordChannelInfo[]): Promise<void> {
    if (discordChannels.length === 0) {
        // Server blip - don't delete anything
        return;
    }

    const channelById = new Map(discordChannels.map(c => [c.id, c]));
    const channelByName = new Map(discordChannels.map(c => [c.name, c]));

    const reconciled: ChannelMapping[] = [];
    for (const mapping of _config.channels) {
        const byId = channelById.get(mapping.channelId);
        if (byId) {
            // ID match — update name if changed
            reconciled.push({ ...mapping, channelName: byId.name });
            continue;
        }
        const byName = channelByName.get(mapping.channelName);
        if (byName) {
            // Name match — update ID
            reconciled.push({ ...mapping, channelId: byName.id });
            continue;
        }
        // No match — delete this mapping
    }

    _config.channels = reconciled;
    await saveCurrentConfig();
}

// ─── Legacy compat (kept for server.ts usage) ────────────────────────────────

export function toPublicConfig(configPath: string) {
    return {
        hasDiscordToken: Boolean(_config.discordToken),
        hasOpenaiKey: Boolean(_config.openaiKey),
        serverId: _config.serverId ?? null,
        diagnosticsPort: _config.diagnosticsPort,
        channels: _config.channels,
        configPath,
    };
}
