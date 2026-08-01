import { HouseholdBot } from './bot.js';
import { startDiagnosticsServer } from './server.js';

const token = process.env['DISCORD_TOKEN'];
if (!token) {
    console.error('DISCORD_TOKEN environment variable is required');
    process.exit(1);
}

const diagnosticsPort = parseInt(process.env['DIAGNOSTICS_PORT'] ?? '8080', 10);
startDiagnosticsServer(diagnosticsPort);

const bot = new HouseholdBot();
bot.start(token).catch(err => {
    console.error('Fatal: failed to start bot:', err);
    process.exit(1);
});
