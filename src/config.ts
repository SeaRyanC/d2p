import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import type {
    PublicRuntimeConfig,
    RuntimeConfig,
    RuntimeConfigPatch,
} from './types.ts';

const DEFAULT_CONFIG_FILE = 'd2p.config.json';

function getConfigPath(): string {
    return process.env['D2P_CONFIG_PATH'] || join(process.cwd(), DEFAULT_CONFIG_FILE);
}

function normalizeOptionalString(value: unknown, fieldName: string): string | null {
    if (value === null || value === undefined) return null;
    if (typeof value !== 'string') {
        throw new Error(`${fieldName} must be a string or null`);
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

function normalizePort(value: unknown, fallback: number): number {
    if (value === undefined || value === null) return fallback;
    if (typeof value !== 'number' || !Number.isInteger(value)) {
        throw new Error('diagnosticsPort must be an integer');
    }
    if (value < 1 || value > 65535) {
        throw new Error('diagnosticsPort must be between 1 and 65535');
    }
    return value;
}

function fromEnvironment(): RuntimeConfig {
    const envPort = Number.parseInt(process.env['DIAGNOSTICS_PORT'] ?? '8080', 10);
    const diagnosticsPort = Number.isInteger(envPort) && envPort >= 1 && envPort <= 65535
        ? envPort
        : 8080;

    return {
        discordToken: normalizeOptionalString(process.env['DISCORD_TOKEN'], 'discordToken'),
        serverId: normalizeOptionalString(process.env['SERVER_ID'], 'serverId'),
        diagnosticsPort,
        printerName: normalizeOptionalString(process.env['PRINTER_NAME'], 'printerName'),
    };
}

function normalizeConfigInput(input: Partial<RuntimeConfig>, base: RuntimeConfig): RuntimeConfig {
    return {
        discordToken: Object.hasOwn(input, 'discordToken')
            ? normalizeOptionalString(input.discordToken, 'discordToken')
            : base.discordToken,
        serverId: Object.hasOwn(input, 'serverId')
            ? normalizeOptionalString(input.serverId, 'serverId')
            : base.serverId,
        diagnosticsPort: Object.hasOwn(input, 'diagnosticsPort')
            ? normalizePort(input.diagnosticsPort, base.diagnosticsPort)
            : base.diagnosticsPort,
        printerName: Object.hasOwn(input, 'printerName')
            ? normalizeOptionalString(input.printerName, 'printerName')
            : base.printerName,
    };
}

export function toPublicConfig(config: RuntimeConfig, configPath: string): PublicRuntimeConfig {
    return {
        hasDiscordToken: Boolean(config.discordToken),
        serverId: config.serverId,
        diagnosticsPort: config.diagnosticsPort,
        printerName: config.printerName,
        configPath,
    };
}

export async function loadConfig(): Promise<{ config: RuntimeConfig; configPath: string }> {
    const configPath = getConfigPath();
    const envDefaults = fromEnvironment();

    try {
        const raw = await readFile(configPath, 'utf8');
        const parsed = JSON.parse(raw) as Partial<RuntimeConfig>;
        return {
            config: normalizeConfigInput(parsed, envDefaults),
            configPath,
        };
    } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
            return { config: envDefaults, configPath };
        }
        if (err instanceof SyntaxError) {
            throw new Error(`Failed to parse config file at ${configPath}: ${err.message}`);
        }
        throw err;
    }
}

export async function saveConfig(
    patch: RuntimeConfigPatch,
    current: RuntimeConfig,
    configPath: string,
): Promise<RuntimeConfig> {
    const updated = normalizeConfigInput(patch, current);
    await writeFile(configPath, `${JSON.stringify(updated, null, 2)}\n`, 'utf8');
    return updated;
}
