import { createServer, type IncomingMessage, type ServerResponse } from 'http';
import { build } from 'esbuild';
import { stat } from 'fs/promises';
import { join } from 'path';
import type {
    DiagnosticEvent,
    BotStatus,
    PublicRuntimeConfig,
    RuntimeConfigPatch,
} from './types.ts';

const MAX_EVENTS = 200;
const events: DiagnosticEvent[] = [];

export const status: BotStatus = {
    connected: false,
    tag: null,
    startedAt: null,
    guilds: [],
    configuredServerId: null,
};

export function logEvent(type: DiagnosticEvent['type'], message: string): void {
    const event: DiagnosticEvent = { timestamp: new Date().toISOString(), type, message };
    events.push(event);
    if (events.length > MAX_EVENTS) events.shift();
    console.log(`[${event.timestamp}] [${type.toUpperCase()}] ${message}`);
}

function renderHtmlShell(): string {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>d2p control panel</title>
  <style>
    :root { color-scheme: dark; }
    body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; background: #0f1115; color: #f5f7fa; }
    a { color: #8ab4ff; }
  </style>
</head>
<body>
  <div id="app"></div>
  <script type="module" src="/app.js"></script>
</body>
</html>`;
}

let appBundleCache: { script: string; mtimeMs: number } | null = null;

async function loadAppScript(): Promise<string> {
    const entryPoint = join(process.cwd(), 'src', 'web', 'app.tsx');
    const sourceStat = await stat(entryPoint);
    if (appBundleCache && appBundleCache.mtimeMs === sourceStat.mtimeMs) {
        return appBundleCache.script;
    }

    const result = await build({
        entryPoints: [entryPoint],
        bundle: true,
        write: false,
        platform: 'browser',
        format: 'esm',
        target: ['es2022'],
        jsx: 'automatic',
        jsxImportSource: 'preact',
        sourcemap: 'inline',
    });

    const firstFile = result.outputFiles[0];
    if (!firstFile) {
        throw new Error('Failed to generate app bundle');
    }

    appBundleCache = {
        script: firstFile.text,
        mtimeMs: sourceStat.mtimeMs,
    };
    return firstFile.text;
}

function sendJson(res: ServerResponse, statusCode: number, payload: unknown): void {
    const body = JSON.stringify(payload, null, 2);
    res.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(body),
    });
    res.end(body);
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
    const chunks: Buffer[] = [];
    let total = 0;

    for await (const chunk of req) {
        const bufferChunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        total += bufferChunk.byteLength;
        if (total > 1_000_000) {
            throw new Error('Request body is too large');
        }
        chunks.push(bufferChunk);
    }

    if (chunks.length === 0) return {};
    const raw = Buffer.concat(chunks).toString('utf8');
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error('JSON body must be an object');
    }

    return parsed as Record<string, unknown>;
}

export function startDiagnosticsServer(
    port: number,
    getConfig: () => PublicRuntimeConfig,
    updateConfig: (patch: RuntimeConfigPatch) => Promise<PublicRuntimeConfig>,
): void {
    const server = createServer(async (req, res) => {
        try {
            const method = req.method ?? 'GET';
            const url = req.url ?? '/';

            if (method === 'GET' && url === '/api/events') {
                sendJson(res, 200, { status, events: [...events].reverse() });
                return;
            }

            if (method === 'GET' && url === '/api/status') {
                sendJson(res, 200, status);
                return;
            }

            if (method === 'GET' && url === '/api/config') {
                sendJson(res, 200, getConfig());
                return;
            }

            if ((method === 'POST' || method === 'PUT') && url === '/api/config') {
                const body = await readJsonBody(req);
                const patch: RuntimeConfigPatch = {};

                if (Object.hasOwn(body, 'discordToken')) {
                    const tokenValue = body['discordToken'];
                    if (typeof tokenValue === 'string' || tokenValue === null) {
                        patch.discordToken = tokenValue;
                    } else {
                        throw new Error('discordToken must be a string or null');
                    }
                }

                if (Object.hasOwn(body, 'serverId')) {
                    const serverIdValue = body['serverId'];
                    if (typeof serverIdValue === 'string' || serverIdValue === null) {
                        patch.serverId = serverIdValue;
                    } else {
                        throw new Error('serverId must be a string or null');
                    }
                }

                if (Object.hasOwn(body, 'diagnosticsPort')) {
                    const diagnosticsPortValue = body['diagnosticsPort'];
                    if (typeof diagnosticsPortValue === 'number') {
                        patch.diagnosticsPort = diagnosticsPortValue;
                    } else {
                        throw new Error('diagnosticsPort must be an integer');
                    }
                }

                if (Object.hasOwn(body, 'printerName')) {
                    const printerNameValue = body['printerName'];
                    if (typeof printerNameValue === 'string' || printerNameValue === null) {
                        patch.printerName = printerNameValue;
                    } else {
                        throw new Error('printerName must be a string or null');
                    }
                }

                const config = await updateConfig(patch);
                sendJson(res, 200, config);
                return;
            }

            if (method === 'GET' && url === '/app.js') {
                const script = await loadAppScript();
                res.writeHead(200, {
                    'Content-Type': 'application/javascript; charset=utf-8',
                    'Content-Length': Buffer.byteLength(script),
                });
                res.end(script);
                return;
            }

            if (method === 'GET' && url === '/') {
                const html = renderHtmlShell();
                res.writeHead(200, {
                    'Content-Type': 'text/html; charset=utf-8',
                    'Content-Length': Buffer.byteLength(html),
                });
                res.end(html);
                return;
            }

            sendJson(res, 404, { error: 'Not found' });
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            sendJson(res, 400, { error: message });
            logEvent('error', `Diagnostics API error: ${message}`);
        }
    });

    server.listen(port, '0.0.0.0', () => {
        logEvent('startup', `Diagnostics server listening on http://0.0.0.0:${port}`);
    });
}
