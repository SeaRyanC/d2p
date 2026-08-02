import { loadConfig, getCurrentConfig } from './config.ts';
import { logEvent, startDiagnosticsServer, setDiscordChannels } from './server.ts';
import { WindsorBot, checkScheduledTasks } from './bot.ts';

const { configPath } = await loadConfig();
const config = getCurrentConfig();

startDiagnosticsServer(config.diagnosticsPort);

let bot: WindsorBot | null = null;
let startInFlight = false;

async function maybeStartBot(): Promise<void> {
    if (startInFlight || bot) return;
    const cfg = getCurrentConfig();
    if (!cfg.discordToken) {
        logEvent('info', 'No Discord token configured. Visit the control panel to set up.');
        return;
    }

    startInFlight = true;
    const nextBot = new WindsorBot();
    try {
        await nextBot.start(cfg.discordToken);
        bot = nextBot;

        // Register discord channels in server for the web UI
        const guilds = [...nextBot.getClient().guilds.cache.values()];
        const channels: Array<{ id: string; name: string }> = [];
        for (const guild of guilds) {
            const fetched = await guild.channels.fetch();
            for (const ch of fetched.values()) {
                if (ch?.isTextBased() && 'name' in ch) {
                    channels.push({ id: ch.id, name: (ch as { name: string }).name });
                }
            }
        }
        setDiscordChannels(channels);

        logEvent('startup', 'Bot started successfully');
    } catch (err) {
        logEvent('error', `Failed to start bot: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
        startInFlight = false;
    }
}

// Recurring task checker
setInterval(() => {
    checkScheduledTasks();
}, 30_000);

await maybeStartBot();
