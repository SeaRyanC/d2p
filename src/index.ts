import { HouseholdBot } from './bot.ts';
import { loadConfig, saveConfig, toPublicConfig } from './config.ts';
import { logEvent, startDiagnosticsServer, status } from './server.ts';

const { configPath, config: initialConfig } = await loadConfig();
let currentConfig = initialConfig;
let bot: HouseholdBot | null = null;
let startAttemptInFlight = false;

function applyRuntimeConfig(): void {
    status.configuredServerId = currentConfig.serverId;

    if (currentConfig.printerName) {
        process.env['PRINTER_NAME'] = currentConfig.printerName;
    } else {
        delete process.env['PRINTER_NAME'];
    }
}

function maybeStartBot(): void {
    if (startAttemptInFlight || bot || !currentConfig.discordToken) return;

    startAttemptInFlight = true;
    const nextBot = new HouseholdBot(() => currentConfig.serverId);

    nextBot.start(currentConfig.discordToken).then(() => {
        bot = nextBot;
        logEvent('startup', 'Bot client connected');
    }).catch(err => {
        logEvent('error', `Failed to connect bot: ${err instanceof Error ? err.message : String(err)}`);
    }).finally(() => {
        startAttemptInFlight = false;
    });
}

applyRuntimeConfig();
startDiagnosticsServer(
    currentConfig.diagnosticsPort,
    () => toPublicConfig(currentConfig, configPath),
    async (patch) => {
        const updated = await saveConfig(patch, currentConfig, configPath);
        currentConfig = updated;
        applyRuntimeConfig();
        maybeStartBot();
        return toPublicConfig(currentConfig, configPath);
    },
);

if (!currentConfig.discordToken) {
    logEvent('info', 'No Discord token configured yet. Open the control panel and save bot setup.');
}
maybeStartBot();
