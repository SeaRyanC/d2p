/** @jsxImportSource preact */
import { render } from 'preact';
import type { JSX } from 'preact';
import { useEffect, useState, useRef } from 'preact/hooks';

// ─── Types ────────────────────────────────────────────────────────────────────

type BehaviorType = 'immediate-print' | 'accumulating-list' | 'recurring-print' | 'on-demand';

interface ChannelBehaviorConfig {
    type: BehaviorType;
    header?: string;
    footer?: string;
    includeIcon?: boolean;
    includeMetadata?: boolean;
    includeChecklist?: boolean;
}

interface ChannelMapping {
    channelId: string;
    channelName: string;
    config: ChannelBehaviorConfig;
}

interface DiscordChannel {
    id: string;
    name: string;
}

interface DiagnosticEvent {
    timestamp: string;
    type: string;
    message: string;
}

interface StatusData {
    connected: boolean;
    tag: string | null;
    startedAt: string | null;
    guilds: string[];
    configuredServerId: string | null;
}

interface ConfigData {
    hasDiscordToken: boolean;
    hasOpenaiKey: boolean;
    serverId: string | null;
    diagnosticsPort: number;
    channels: ChannelMapping[];
    configPath: string;
}

interface ChannelsData {
    channels: ChannelMapping[];
    discordChannels: DiscordChannel[];
    unmapped: DiscordChannel[];
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const S = {
    box: { background: '#151922', border: '1px solid #2b3340', borderRadius: '10px', padding: '16px', marginBottom: '16px' } as JSX.CSSProperties,
    input: { background: '#0f1115', color: '#f5f7fa', border: '1px solid #354051', borderRadius: '6px', padding: '8px 10px', width: '100%', boxSizing: 'border-box' as const } as JSX.CSSProperties,
    btn: { background: '#2e7dff', color: '#fff', border: 'none', borderRadius: '6px', padding: '8px 14px', cursor: 'pointer', marginRight: '8px' } as JSX.CSSProperties,
    btnDanger: { background: '#c0392b', color: '#fff', border: 'none', borderRadius: '6px', padding: '4px 10px', cursor: 'pointer' } as JSX.CSSProperties,
    label: { display: 'block', marginBottom: '12px' } as JSX.CSSProperties,
    labelText: { display: 'block', marginBottom: '4px', color: '#b4bdc8' } as JSX.CSSProperties,
    select: { background: '#0f1115', color: '#f5f7fa', border: '1px solid #354051', borderRadius: '6px', padding: '8px 10px' } as JSX.CSSProperties,
    th: { textAlign: 'left' as const, padding: '8px', borderBottom: '1px solid #2b3340' },
    td: { padding: '8px', borderBottom: '1px solid #1a2030', verticalAlign: 'top' as const, wordBreak: 'break-word' as const },
    row: { cursor: 'pointer', background: 'transparent' } as JSX.CSSProperties,
    rowHover: { background: '#1a2030' } as JSX.CSSProperties,
    grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' } as JSX.CSSProperties,
    grid3: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', alignItems: 'end' } as JSX.CSSProperties,
    err: { color: '#ff8080', margin: '8px 0' } as JSX.CSSProperties,
    ok: { color: '#8ff0a4', margin: '8px 0' } as JSX.CSSProperties,
    mono: { fontFamily: 'monospace', fontSize: '0.85em' } as JSX.CSSProperties,
};

// ─── Fetch helper ─────────────────────────────────────────────────────────────

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
    const res = await fetch(url, options);
    const json = await res.json() as { error?: string } & T;
    if (!res.ok) throw new Error(json.error ?? 'Request failed');
    return json;
}

function jsonPost<T>(url: string, body: unknown): Promise<T> {
    return apiFetch<T>(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

function jsonPut<T>(url: string, body: unknown): Promise<T> {
    return apiFetch<T>(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

async function jsonDelete<T>(url: string): Promise<T> {
    return apiFetch<T>(url, { method: 'DELETE' });
}

// ─── Field component ──────────────────────────────────────────────────────────

function Field({ label, type = 'text', value, onChange, placeholder }: {
    label: string;
    type?: string;
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
}): JSX.Element {
    return (
        <label style={S.label}>
            <span style={S.labelText}>{label}</span>
            <input
                type={type}
                value={value}
                placeholder={placeholder ?? ''}
                onInput={e => onChange((e.currentTarget as HTMLInputElement).value)}
                style={S.input}
            />
        </label>
    );
}

function CheckField({ label, checked, onChange }: {
    label: string;
    checked: boolean;
    onChange: (v: boolean) => void;
}): JSX.Element {
    return (
        <label style={{ ...S.label, display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <input type="checkbox" checked={checked} onChange={e => onChange((e.currentTarget as HTMLInputElement).checked)} />
            {label}
        </label>
    );
}

// ─── Behavior sub-config ──────────────────────────────────────────────────────

function BehaviorConfig({ config, onChange }: {
    config: ChannelBehaviorConfig;
    onChange: (c: ChannelBehaviorConfig) => void;
}): JSX.Element {
    const t = config.type;
    return (
        <div style={{ paddingTop: '12px' }}>
            {(t === 'immediate-print' || t === 'accumulating-list' || t === 'recurring-print') && (
                <>
                    <Field
                        label="Header"
                        value={config.header ?? ''}
                        onChange={v => { const c = { ...config }; if (v) { c.header = v; } else { delete c.header; } onChange(c); }}
                        placeholder="Optional header text"
                    />
                    <Field
                        label="Footer"
                        value={config.footer ?? ''}
                        onChange={v => { const c = { ...config }; if (v) { c.footer = v; } else { delete c.footer; } onChange(c); }}
                        placeholder="Optional footer text"
                    />
                    <CheckField
                        label="Include metadata footer"
                        checked={config.includeMetadata ?? false}
                        onChange={v => onChange({ ...config, includeMetadata: v })}
                    />
                </>
            )}
            {(t === 'immediate-print' || t === 'recurring-print') && (
                <CheckField
                    label="Include AI-generated icon (requires OpenAI key)"
                    checked={config.includeIcon ?? false}
                    onChange={v => onChange({ ...config, includeIcon: v })}
                />
            )}
            {t === 'accumulating-list' && (
                <CheckField
                    label="Include checklist boxes"
                    checked={config.includeChecklist ?? false}
                    onChange={v => onChange({ ...config, includeChecklist: v })}
                />
            )}
        </div>
    );
}

// ─── Channel Row ──────────────────────────────────────────────────────────────

function ChannelRow({ mapping, onDelete, onUpdate }: {
    mapping: ChannelMapping;
    onDelete: () => void;
    onUpdate: (c: ChannelBehaviorConfig) => void;
}): JSX.Element {
    const [expanded, setExpanded] = useState(false);
    const [hovered, setHovered] = useState(false);

    return (
        <tbody>
            <tr
                style={hovered ? S.rowHover : S.row}
                onClick={() => setExpanded(!expanded)}
                onMouseEnter={() => setHovered(true)}
                onMouseLeave={() => setHovered(false)}
            >
                <td style={S.td}># {mapping.channelName}</td>
                <td style={S.td}>{mapping.config.type}</td>
                <td style={{ ...S.td, textAlign: 'right' }}>
                    <button
                        style={S.btnDanger}
                        onClick={e => { e.stopPropagation(); onDelete(); }}
                    >
                        Delete
                    </button>
                </td>
            </tr>
            {expanded && (
                <tr>
                    <td colSpan={3} style={{ ...S.td, background: '#0f1115', padding: '16px' }}>
                        <BehaviorConfig
                            config={mapping.config}
                            onChange={c => onUpdate(c)}
                        />
                    </td>
                </tr>
            )}
        </tbody>
    );
}

// ─── Sections ─────────────────────────────────────────────────────────────────

function BotSetup({ config, onSave }: {
    config: ConfigData | null;
    onSave: () => void;
}): JSX.Element {
    const [discordToken, setDiscordToken] = useState('');
    const [serverId, setServerId] = useState(config?.serverId ?? '');
    const [openaiKey, setOpenaiKey] = useState('');
    const [diagnosticsPort, setDiagnosticsPort] = useState(String(config?.diagnosticsPort ?? 8080));
    const [msg, setMsg] = useState('');
    const [err, setErr] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        setServerId(config?.serverId ?? '');
        setDiagnosticsPort(String(config?.diagnosticsPort ?? 8080));
    }, [config?.serverId, config?.diagnosticsPort]);

    async function save(): Promise<void> {
        setSaving(true);
        setErr(''); setMsg('');
        try {
            const body: Record<string, unknown> = {
                serverId: serverId.trim() || null,
                diagnosticsPort: Number(diagnosticsPort),
            };
            if (discordToken.trim()) body['discordToken'] = discordToken.trim();
            if (openaiKey.trim()) body['openaiKey'] = openaiKey.trim();
            await jsonPost('/api/config', body);
            setDiscordToken('');
            setOpenaiKey('');
            setMsg('Saved.');
            onSave();
        } catch (e) {
            setErr(e instanceof Error ? e.message : String(e));
        } finally {
            setSaving(false);
        }
    }

    return (
        <section style={S.box}>
            <h2 style={{ marginTop: 0 }}>Bot Setup</h2>
            {config && <p style={{ color: '#b4bdc8', marginTop: 0 }}>Config: {config.configPath}</p>}
            {err && <p style={S.err}>{err}</p>}
            {msg && <p style={S.ok}>{msg}</p>}
            <Field label="Discord Token" type="password" value={discordToken} onChange={setDiscordToken} placeholder="Paste to set/replace" />
            <Field label="Server ID" value={serverId} onChange={setServerId} placeholder="Optional guild ID" />
            <Field label="OpenAI Key" type="password" value={openaiKey} onChange={setOpenaiKey} placeholder="Paste to set/replace" />
            <Field label="Diagnostics Port" type="number" value={diagnosticsPort} onChange={setDiagnosticsPort} placeholder="8080" />
            {config && <p style={{ color: '#b4bdc8' }}>Token: {config.hasDiscordToken ? '✅ set' : '—'} · OpenAI: {config.hasOpenaiKey ? '✅ set' : '—'}</p>}
            <button style={S.btn} onClick={() => void save()} disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
            </button>
        </section>
    );
}

function ChannelBehaviors(): JSX.Element {
    const [data, setData] = useState<ChannelsData | null>(null);
    const [err, setErr] = useState('');
    const [addChannelId, setAddChannelId] = useState('');
    const [addBehavior, setAddBehavior] = useState<BehaviorType>('immediate-print');

    async function load(): Promise<void> {
        try {
            const d = await apiFetch<ChannelsData>('/api/channels');
            setData(d);
        } catch (e) {
            setErr(e instanceof Error ? e.message : String(e));
        }
    }

    useEffect(() => { void load(); }, []);

    async function addMapping(): Promise<void> {
        if (!addChannelId) return;
        const dc = data?.discordChannels.find(c => c.id === addChannelId);
        if (!dc) return;
        const defaultConfig: ChannelBehaviorConfig = addBehavior === 'immediate-print'
            ? { type: 'immediate-print', includeIcon: false, includeMetadata: false }
            : addBehavior === 'accumulating-list'
                ? { type: 'accumulating-list', includeChecklist: false, includeMetadata: false }
                : addBehavior === 'recurring-print'
                    ? { type: 'recurring-print', includeIcon: false, includeMetadata: false }
                    : { type: 'on-demand' };
        await jsonPost('/api/channels', { channelId: dc.id, channelName: dc.name, config: defaultConfig });
        setAddChannelId('');
        await load();
    }

    async function deleteChannel(id: string): Promise<void> {
        await jsonDelete(`/api/channels/${id}`);
        await load();
    }

    async function updateChannel(id: string, config: ChannelBehaviorConfig): Promise<void> {
        await jsonPut(`/api/channels/${id}`, { config });
        await load();
    }

    return (
        <section style={S.box}>
            <h2 style={{ marginTop: 0 }}>Channel Behaviors</h2>
            {err && <p style={S.err}>{err}</p>}
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '16px' }}>
                <thead>
                    <tr>
                        <th style={S.th}>Channel</th>
                        <th style={S.th}>Behavior</th>
                        <th style={{ ...S.th, textAlign: 'right' as const }}>Actions</th>
                    </tr>
                </thead>
                {data?.channels.map(m => (
                    <ChannelRow
                        key={m.channelId}
                        mapping={m}
                        onDelete={() => void deleteChannel(m.channelId)}
                        onUpdate={c => void updateChannel(m.channelId, c)}
                    />
                ))}
                {(!data || data.channels.length === 0) && (
                    <tbody>
                        <tr><td colSpan={3} style={{ ...S.td, color: '#b4bdc8' }}>No channel mappings yet.</td></tr>
                    </tbody>
                )}
            </table>

            <div style={S.grid3}>
                <label style={S.label}>
                    <span style={S.labelText}>Channel</span>
                    <select style={S.select} value={addChannelId} onChange={e => setAddChannelId((e.currentTarget as HTMLSelectElement).value)}>
                        <option value="">Select…</option>
                        {data?.unmapped.map(c => <option key={c.id} value={c.id}>#{c.name}</option>)}
                    </select>
                </label>
                <label style={S.label}>
                    <span style={S.labelText}>Behavior</span>
                    <select style={S.select} value={addBehavior} onChange={e => setAddBehavior((e.currentTarget as HTMLSelectElement).value as BehaviorType)}>
                        <option value="immediate-print">🖨️ Immediate Print</option>
                        <option value="accumulating-list">🛒 Accumulating List</option>
                        <option value="recurring-print">🔄 Recurring Print</option>
                        <option value="on-demand">💬 On-Demand</option>
                    </select>
                </label>
                <button style={S.btn} onClick={() => void addMapping()} disabled={!addChannelId}>Add</button>
            </div>
        </section>
    );
}

function PrinterSection(): JSX.Element {
    const [printer, setPrinter] = useState<string | null>(null);
    const [testing, setTesting] = useState(false);
    const [msg, setMsg] = useState('');
    const [err, setErr] = useState('');

    async function load(): Promise<void> {
        const d = await apiFetch<{ printer: string | null }>('/api/printer');
        setPrinter(d.printer);
    }

    useEffect(() => { void load(); }, []);

    async function testPage(): Promise<void> {
        setTesting(true); setErr(''); setMsg('');
        try {
            await jsonPost('/api/printer/test', {});
            setMsg('Test page sent to printer.');
        } catch (e) {
            setErr(e instanceof Error ? e.message : String(e));
        } finally {
            setTesting(false);
        }
    }

    return (
        <section style={S.box}>
            <h2 style={{ marginTop: 0 }}>Printer</h2>
            {err && <p style={S.err}>{err}</p>}
            {msg && <p style={S.ok}>{msg}</p>}
            <p>Connected printer: <strong>{printer ?? 'None detected'}</strong></p>
            <button style={S.btn} onClick={() => void testPage()} disabled={!printer || testing}>
                {testing ? 'Printing…' : 'Print Test Page'}
            </button>
        </section>
    );
}

function SecuritySection({ onSave }: { onSave: () => void }): JSX.Element {
    const [password, setPassword] = useState('');
    const [msg, setMsg] = useState('');
    const [err, setErr] = useState('');
    const [saving, setSaving] = useState(false);

    async function save(): Promise<void> {
        setSaving(true); setErr(''); setMsg('');
        try {
            await jsonPost('/api/config', { password });
            setPassword('');
            setMsg(password ? 'Password set.' : 'Password cleared.');
            onSave();
        } catch (e) {
            setErr(e instanceof Error ? e.message : String(e));
        } finally {
            setSaving(false);
        }
    }

    return (
        <section style={S.box}>
            <h2 style={{ marginTop: 0 }}>Security</h2>
            {err && <p style={S.err}>{err}</p>}
            {msg && <p style={S.ok}>{msg}</p>}
            <Field label="Control Panel Password" type="password" value={password} onChange={setPassword} placeholder="Leave blank to remove password" />
            <button style={S.btn} onClick={() => void save()} disabled={saving}>
                {saving ? 'Saving…' : 'Set Password'}
            </button>
        </section>
    );
}

function LogSection(): JSX.Element {
    const [events, setEvents] = useState<DiagnosticEvent[]>([]);
    const [status, setStatus] = useState<StatusData | null>(null);

    async function load(): Promise<void> {
        const d = await apiFetch<{ events: DiagnosticEvent[]; status: StatusData }>('/api/events');
        setEvents(d.events);
        setStatus(d.status);
    }

    useEffect(() => {
        void load();
        const t = setInterval(() => void load(), 4000);
        return () => clearInterval(t);
    }, []);

    const typeColor: Record<string, string> = {
        startup: '#8ab4ff',
        success: '#8ff0a4',
        error: '#ff8080',
        print: '#ffd580',
        info: '#b4bdc8',
        command: '#d2a8ff',
    };

    return (
        <section style={S.box}>
            <h2 style={{ marginTop: 0 }}>Bot Status & Log</h2>
            {status && (
                <dl style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: '4px 12px', marginBottom: '16px' }}>
                    <dt style={{ color: '#b4bdc8' }}>Connected</dt><dd style={{ margin: 0 }}>{status.connected ? '✅ yes' : '❌ no'}</dd>
                    <dt style={{ color: '#b4bdc8' }}>Bot</dt><dd style={{ margin: 0 }}>{status.tag ?? '—'}</dd>
                    <dt style={{ color: '#b4bdc8' }}>Started</dt><dd style={{ margin: 0 }}>{status.startedAt ?? '—'}</dd>
                    <dt style={{ color: '#b4bdc8' }}>Server ID</dt><dd style={{ margin: 0 }}>{status.configuredServerId ?? '—'}</dd>
                    <dt style={{ color: '#b4bdc8' }}>Guilds</dt><dd style={{ margin: 0 }}>{status.guilds.join(', ') || '—'}</dd>
                </dl>
            )}
            <div style={{ maxHeight: '400px', overflow: 'auto', border: '1px solid #2b3340', borderRadius: '8px' }}>
                {events.length === 0 ? (
                    <p style={{ padding: '12px', margin: 0, color: '#b4bdc8' }}>No events yet.</p>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr>
                                <th style={S.th}>Time</th>
                                <th style={S.th}>Type</th>
                                <th style={S.th}>Message</th>
                            </tr>
                        </thead>
                        <tbody>
                            {events.map((e, i) => (
                                <tr key={String(i)}>
                                    <td style={{ ...S.td, ...S.mono, whiteSpace: 'nowrap' as const }}>{e.timestamp}</td>
                                    <td style={{ ...S.td, color: typeColor[e.type] ?? '#b4bdc8' }}>{e.type}</td>
                                    <td style={S.td}>{e.message}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </section>
    );
}

// ─── App ──────────────────────────────────────────────────────────────────────

function App(): JSX.Element {
    const [config, setConfig] = useState<ConfigData | null>(null);
    const configRef = useRef(config);
    configRef.current = config;

    async function loadConfig(): Promise<void> {
        const d = await apiFetch<ConfigData>('/api/config');
        setConfig(d);
    }

    useEffect(() => { void loadConfig(); }, []);

    return (
        <main style={{ maxWidth: '860px', margin: '0 auto', padding: '24px' }}>
            <h1 style={{ marginTop: 0 }}>🖨️ Windsor Control Panel</h1>
            <BotSetup config={config} onSave={() => void loadConfig()} />
            <ChannelBehaviors />
            <PrinterSection />
            <SecuritySection onSave={() => void loadConfig()} />
            <LogSection />
        </main>
    );
}

const root = document.getElementById('app');
if (!root) throw new Error('Missing #app');
render(<App />, root);
