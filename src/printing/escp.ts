import { Printer, InMemory, Style, Align, Cut } from 'escpos-buffer';
import { SerialPort } from 'serialport';
import type { PrintJob } from '../types.ts';


const COLS_NORMAL = 48;
const COLS_DOUBLE = 24;


function wrapText(text: string, width: number): string[] {
    const words = text.split(' ');
    const lines: string[] = [];
    let current = '';
    for (const word of words) {
        if (current.length === 0) {
            current = word;
        } else if (current.length + 1 + word.length <= width) {
            current += ' ' + word;
        } else {
            lines.push(current);
            current = word;
        }
    }
    if (current) lines.push(current);
    return lines.length > 0 ? lines : [''];
}


type FontSize = 'double' | 'tall' | 'normal';

function chooseFontForLines(totalLines: number): { fontSize: FontSize; cols: number } {
    if (totalLines <= 4) {
        return { fontSize: 'double', cols: COLS_DOUBLE };
    } else if (totalLines <= 8) {
        return { fontSize: 'tall', cols: COLS_DOUBLE };
    } else {
        return { fontSize: 'normal', cols: COLS_NORMAL };
    }
}


export async function buildEscpBuffer(job: PrintJob): Promise<Buffer> {
    const conn = new InMemory();
    const printer = await Printer.CONNECT('MP-2800 TH', conn);

    const { fontSize, cols } = chooseFontForLines(job.lines.length <= 2 ? 2 : job.lines.length);

    // Header
    if (job.header) {
        const headerLines = wrapText(job.header, COLS_DOUBLE);
        for (const line of headerLines) {
            await printer.writeln(line, Style.Bold | Style.DoubleWidth | Style.DoubleHeight, Align.Center);
        }
        await printer.feed(1);
    }

    // Primary text
    if (job.lines.length > 0) {
        const widthStyle = fontSize === 'double'
            ? Style.DoubleWidth | Style.DoubleHeight
            : fontSize === 'tall'
                ? Style.DoubleHeight
                : 0;

        for (const line of job.lines) {
            const wrapped = wrapText(line, cols);
            for (const l of wrapped) {
                await printer.writeln(l, widthStyle);
            }
        }
        await printer.feed(1);
    }

    // URLs (printed as labelled text; QR code can be added later)
    if (job.urls.length > 0) {
        await printer.feed(1);
        for (let i = 0; i < job.urls.length; i++) {
            const url = job.urls[i];
            if (!url) continue;
            const label = job.urls.length === 1 ? '[link]' : `[link ${i + 1}]`;
            await printer.writeln(label, Style.Bold);
            const urlLines = wrapText(url, COLS_NORMAL);
            for (const l of urlLines) {
                await printer.writeln(l);
            }
        }
    }

    // Footer
    if (job.footer) {
        await printer.feed(1);
        const footerLines = wrapText(job.footer, COLS_NORMAL);
        for (const line of footerLines) {
            await printer.writeln(line, Style.Bold);
        }
    }

    // Metadata footer
    if (job.metadataLines && job.metadataLines.length > 0) {
        await printer.feed(1);
        for (const line of job.metadataLines) {
            await printer.writeln(line);
        }
    }

    await printer.feed(3);
    await printer.cutter(Cut.Partial);
    await printer.close();

    return conn.buffer();
}


export async function printJobEscp(job: PrintJob, portPath: string): Promise<void> {
    const data = await buildEscpBuffer(job);

    await new Promise<void>((resolve, reject) => {
        const port = new SerialPort({ path: portPath, baudRate: 19200 });

        port.on('error', reject);
        port.on('open', () => {
            port.write(data, (err) => {
                if (err) { reject(err); return; }
                port.drain((drainErr) => {
                    port.close((closeErr) => {
                        if (drainErr) reject(drainErr);
                        else if (closeErr) reject(closeErr);
                        else resolve();
                    });
                });
            });
        });
    });
}
