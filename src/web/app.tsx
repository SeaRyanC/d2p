/** @jsxImportSource preact */
import { render } from 'preact';
import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';

type EventType = 'startup' | 'command' | 'success' | 'error' | 'info';

interface RuntimeStatus {
    connected: boolean;
    tag: string | null;
    startedAt: string | null;
    guilds: string[];
    configuredServerId: string | null;
}

interface DiagnosticEvent {
    timestamp: string;
    type: EventType;
    message: string;
}

interface EventsResponse {
    status: RuntimeStatus;
    events: DiagnosticEvent[];
}

interface ConfigResponse {
    hasDiscordToken: boolean;
    serverId: string | null;
    diagnosticsPort: number;
    printerName: string | null;
    configPath: string;
}

interface ConfigUpdateRequest {
    discordToken?: string;
    serverId: string | null;
    diagnosticsPort: number;
    printerName: string | null;
}

interface FormState {
    discordToken: string;
    serverId: string;
    diagnosticsPort: string;
    printerName: string;
}

const POLL_MS = 4000;
const boxStyle = { background: '#151922', border: '1px solid #2b3340', borderRadius: '10px', padding: '16px', marginBottom: '16px' };
const formStyle = { display: 'grid', gap: '12px', maxWidth: '520px' };
const gridStyle = { display: 'grid', gridTemplateColumns: '160px 1fr', gap: '8px 12px', margin: 0 };
const inputStyle = { background: '#0f1115', color: '#f5f7fa', border: '1px solid #354051', borderRadius: '6px', padding: '8px 10px' };
const buttonStyle = { width: 'fit-content', background: '#2e7dff', color: '#fff', border: 'none', borderRadius: '6px', padding: '8px 12px', cursor: 'pointer' };
const thStyle = { textAlign: 'left', padding: '8px', borderBottom: '1px solid #2b3340' };
const tdStyle = { padding: '8px', borderBottom: '1px solid #222932', verticalAlign: 'top', wordBreak: 'break-word' };

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
    const response = await fetch(url, options);
    const payload = await response.json().catch(() => ({} as { error?: string }));
    if (!response.ok) {
        const message = typeof (payload as { error?: unknown }).error === 'string'
            ? (payload as { error: string }).error
            : 'Request failed';
        throw new Error(message);
    }

    return payload as T;
}

function Field(
    { label, type, value, onChange, placeholder }: {
        label: string;
        type: string;
        value: string;
        onChange: (value: string) => void;
        placeholder: string;
    },
): JSX.Element {
    return (
        <label style={{ display: 'grid', gap: '6px' }}>
            <span>{label}</span>
            <input
                type={type}
                value={value}
                placeholder={placeholder}
                onInput={(event) => onChange((event.currentTarget as HTMLInputElement).value)}
                style={inputStyle}
            />
        </label>
    );
}

function App(): JSX.Element {
    const [status, setStatus] = useState<RuntimeStatus | null>(null);
    const [events, setEvents] = useState<DiagnosticEvent[]>([]);
    const [config, setConfig] = useState<ConfigResponse | null>(null);
    const [form, setForm] = useState<FormState>({
        discordToken: '',
        serverId: '',
        diagnosticsPort: '8080',
        printerName: '',
    });
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);

    async function refresh(): Promise<void> {
        const [eventsPayload, configPayload] = await Promise.all([
            fetchJson<EventsResponse>('/api/events'),
            fetchJson<ConfigResponse>('/api/config'),
        ]);

        setStatus(eventsPayload.status);
        setEvents(Array.isArray(eventsPayload.events) ? eventsPayload.events : []);
        setConfig(configPayload);
        setForm(current => ({
            discordToken: current.discordToken,
            serverId: configPayload.serverId ?? '',
            diagnosticsPort: String(configPayload.diagnosticsPort ?? 8080),
            printerName: configPayload.printerName ?? '',
        }));
    }

    useEffect(() => {
        void refresh().catch(err => setError(err instanceof Error ? err.message : String(err)));
        const timer = setInterval(() => {
            void refresh().catch(err => setError(err instanceof Error ? err.message : String(err)));
        }, POLL_MS);
        return () => clearInterval(timer);
    }, []);

    async function save(event: Event): Promise<void> {
        event.preventDefault();
        setSaving(true);
        setError('');
        setMessage('');

        try {
            const diagnosticsPort = Number.parseInt(form.diagnosticsPort, 10);
            const payload: ConfigUpdateRequest = {
                serverId: form.serverId.trim() || null,
                diagnosticsPort,
                printerName: form.printerName.trim() || null,
            };
            const token = form.discordToken.trim();
            if (token) payload.discordToken = token;

            const nextConfig = await fetchJson<ConfigResponse>('/api/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            setConfig(nextConfig);
            setForm(current => ({ ...current, discordToken: '' }));
            setMessage('Configuration saved.');
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setSaving(false);
        }
    }

    return (
        <main style={{ maxWidth: '1120px', margin: '0 auto', padding: '24px' }}>
            <h1 style={{ marginTop: 0 }}>d2p control panel</h1>
            {error ? <p style={{ color: '#ff8080' }}>{error}</p> : null}
            {message ? <p style={{ color: '#8ff0a4' }}>{message}</p> : null}

            <section style={boxStyle}>
                <h2>Bot setup</h2>
                {config ? <p style={{ marginTop: 0, color: '#b4bdc8' }}>Config file: {config.configPath}</p> : null}
                <form onSubmit={(event) => void save(event)} style={formStyle}>
                    <Field
                        label="Discord token"
                        type="password"
                        value={form.discordToken}
                        onChange={(discordToken) => setForm({ ...form, discordToken })}
                        placeholder="Paste a new token to set/replace"
                    />
                    <Field
                        label="Server ID"
                        type="text"
                        value={form.serverId}
                        onChange={(serverId) => setForm({ ...form, serverId })}
                        placeholder="Optional guild id"
                    />
                    <Field
                        label="Diagnostics port"
                        type="number"
                        value={form.diagnosticsPort}
                        onChange={(diagnosticsPort) => setForm({ ...form, diagnosticsPort })}
                        placeholder="1-65535"
                    />
                    <Field
                        label="Printer name"
                        type="text"
                        value={form.printerName}
                        onChange={(printerName) => setForm({ ...form, printerName })}
                        placeholder="Optional CUPS destination"
                    />
                    <button type="submit" disabled={saving} style={buttonStyle}>
                        {saving ? 'Saving…' : 'Save config'}
                    </button>
                </form>
                {config ? <p style={{ marginBottom: 0, color: '#b4bdc8' }}>Token present: {config.hasDiscordToken ? 'yes' : 'no'}</p> : null}
            </section>

            <section style={boxStyle}>
                <h2>Runtime status</h2>
                {!status ? (
                    <p>Loading…</p>
                ) : (
                    <dl style={gridStyle}>
                        <dt style={{ color: '#b4bdc8' }}>Connected</dt>
                        <dd style={{ margin: 0 }}>{status.connected ? 'yes' : 'no'}</dd>
                        <dt style={{ color: '#b4bdc8' }}>Bot</dt>
                        <dd style={{ margin: 0 }}>{status.tag ?? '—'}</dd>
                        <dt style={{ color: '#b4bdc8' }}>Started</dt>
                        <dd style={{ margin: 0 }}>{status.startedAt ?? '—'}</dd>
                        <dt style={{ color: '#b4bdc8' }}>Configured server</dt>
                        <dd style={{ margin: 0 }}>{status.configuredServerId ?? '—'}</dd>
                        <dt style={{ color: '#b4bdc8' }}>Guilds</dt>
                        <dd style={{ margin: 0 }}>{status.guilds.join(', ') || '—'}</dd>
                    </dl>
                )}
            </section>

            <section style={boxStyle}>
                <h2>Recent events</h2>
                <div style={{ maxHeight: '420px', overflow: 'auto', border: '1px solid #2b3340', borderRadius: '8px' }}>
                    {events.length === 0 ? (
                        <p style={{ padding: '12px', margin: 0 }}>No events yet.</p>
                    ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr>
                                    <th style={thStyle}>Time</th>
                                    <th style={thStyle}>Type</th>
                                    <th style={thStyle}>Message</th>
                                </tr>
                            </thead>
                            <tbody>
                                {events.map((item, index) => (
                                    <tr key={String(index)}>
                                        <td style={tdStyle}>{item.timestamp || ''}</td>
                                        <td style={tdStyle}>{item.type || ''}</td>
                                        <td style={tdStyle}>{item.message || ''}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </section>
        </main>
    );
}

const appRoot = document.getElementById('app');
if (!appRoot) {
    throw new Error('Expected #app root element');
}

render(<App />, appRoot);
