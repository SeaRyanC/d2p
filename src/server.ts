import { createServer } from 'http';
import type { DiagnosticEvent, BotStatus } from './types.js';

const MAX_EVENTS = 200;
const events: DiagnosticEvent[] = [];

export const status: BotStatus = {
    connected: false,
    tag: null,
    startedAt: null,
    guilds: [],
};

export function logEvent(type: DiagnosticEvent['type'], message: string): void {
    const event: DiagnosticEvent = { timestamp: new Date().toISOString(), type, message };
    events.push(event);
    if (events.length > MAX_EVENTS) events.shift();
    console.log(`[${event.timestamp}] [${type.toUpperCase()}] ${message}`);
}

function renderHtml(): string {
    const rows = [...events].reverse().map(e => {
        const color: Record<DiagnosticEvent['type'], string> = {
            startup: '#6c757d',
            command: '#0d6efd',
            success: '#198754',
            error: '#dc3545',
            info: '#0dcaf0',
        };
        return `<tr style="color:${color[e.type]}">
            <td style="white-space:nowrap;padding:4px 8px">${e.timestamp}</td>
            <td style="padding:4px 8px"><b>${e.type}</b></td>
            <td style="padding:4px 8px">${e.message.replace(/</g, '&lt;')}</td>
        </tr>`;
    }).join('\n');

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta http-equiv="refresh" content="5"/>
  <title>d2p diagnostics</title>
  <style>
    body { font-family: monospace; background: #111; color: #eee; padding: 16px; }
    h1 { color: #fff; }
    .status { background: #222; border-radius: 6px; padding: 12px; margin-bottom: 16px; }
    table { border-collapse: collapse; width: 100%; }
    tr:hover { background: #222; }
  </style>
</head>
<body>
  <h1>🏠 d2p diagnostics</h1>
  <div class="status">
    <b>Status:</b> ${status.connected ? '🟢 Connected' : '🔴 Disconnected'}<br/>
    <b>Bot:</b> ${status.tag ?? '—'}<br/>
    <b>Started:</b> ${status.startedAt ?? '—'}<br/>
    <b>Guilds:</b> ${status.guilds.join(', ') || '—'}
  </div>
  <table>
    <thead><tr>
      <th style="text-align:left;padding:4px 8px">Time</th>
      <th style="text-align:left;padding:4px 8px">Type</th>
      <th style="text-align:left;padding:4px 8px">Message</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>`;
}

export function startDiagnosticsServer(port: number): void {
    const server = createServer((req, res) => {
        if (req.url === '/api/events') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status, events: [...events].reverse() }, null, 2));
        } else if (req.url === '/api/status') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(status, null, 2));
        } else {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(renderHtml());
        }
    });

    server.listen(port, '0.0.0.0', () => {
        logEvent('startup', `Diagnostics server listening on http://0.0.0.0:${port}`);
    });
}
