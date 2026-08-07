# Windsor: Your Friendly Household Helper Bot

Windsor turns Discord messages into useful paper: shopping lists, reminders, QR
codes, puzzles, and more. It is designed to run continuously on a Raspberry Pi
with a USB thermal printer, but it also supports any Node.js machine with a
serial printer, a CUPS printer, or the browser-based image feed.

## What you need

* A Discord server where you can install an app
* A computer that can stay online (a Raspberry Pi is ideal!)
* A compatible printer, connected by USB or available through CUPS
* (Optional) An OpenAI API key enables certain features

## Installation

Install the published package globally:

```bash
npm install -g windsor-bot
```

The global install provides the `windsor-bot` command. Windsor creates
`windsor.config.json` in its working directory, so choose a permanent directory
for the bot before starting it.

## Initial setup

### 1. Create a Discord bot

1. Open the [Discord Developer Portal](https://discord.com/developers/applications)
   and select **New Application**.
2. Give the application a name and open its **Bot** page.
3. Click **Reset Token**, then copy the token. Treat it like a password: do
   not commit it, paste it into public issues, or share it. Discord will not
   show the token again without resetting it.
4. On the **Bot** page, enable the **Message Content Intent**. Windsor reads
   ordinary message text, so this privileged intent is required. Windsor also
   uses guilds, guild messages, and guild message reactions.

### 2. Invite the bot to your server

From the application's **Installation** or **OAuth2 > URL Generator** page,
create an installation URL with the `bot` scope. Grant these permissions:

* View Channels
* Send Messages
* Read Message History
* Add Reactions

Open the generated URL, choose the target server, and authorize it. The person
installing the bot must have permission to manage the server. The bot must be
able to view and read history in every channel that Windsor monitors.

### 3. Set up a Raspberry Pi (headless)

These steps assume a Raspberry Pi 4 or 5, a blank microSD card, and a wired or
wireless network. The [official Raspberry Pi OS documentation](https://www.raspberrypi.com/documentation/computers/getting-started.html)
has screenshots and troubleshooting for each step.

1. Use [Raspberry Pi Imager](https://www.raspberrypi.com/software/) to write
   **Raspberry Pi OS Lite (64-bit)** to the microSD card. Before writing,
   open the OS customization screen and set:
   * a hostname such as `windsor-pi`
   * a username such as `piuser` (the Linux account that will run Windsor)
   * a strong password
   * your Wi-Fi country, network name, and password (if using Wi-Fi)
   * the correct time zone and keyboard layout
   * **Enable SSH**, using password authentication for the first login
2. Eject the card, insert it into the Pi, connect the printer, and power on the
   Pi. Wait two to five minutes for the first boot.
3. From another computer on the same network, connect using the hostname:

   ```bash
   ssh piuser@windsor-pi.local
   ```

   If that name does not resolve, find the Pi in the router's client list and
   use its address instead:

   ```bash
   ssh piuser@192.168.1.50
   ```

   See the
   [Raspberry Pi SSH guide](https://www.raspberrypi.com/documentation/computers/remote-access.html#ssh)
   if hostname discovery does not work.
4. Update Raspberry Pi OS and install Node.js, npm, and the optional CUPS
   printing tools:

   ```bash
   sudo apt update && sudo apt upgrade -y
   sudo apt install -y nodejs npm cups
   node --version
   npm --version
   ```

5. Install Windsor globally:

   ```bash
   sudo npm install --global windsor-bot
   command -v windsor-bot
   ```

6. Create a dedicated working directory. Configuration and cached icons will
   be stored here:

   ```bash
   mkdir -p ~/windsor
   cd ~/windsor
   ```

7. Connect the USB printer. For a direct ESC/P printer, identify the device:

   ```bash
   ls -l /dev/ttyUSB* /dev/ttyACM* 2>/dev/null
   ```

   The usual result is `/dev/ttyUSB0` or `/dev/ttyACM0`. Add the login user to
   the device-access group, then reconnect over SSH:

   ```bash
   sudo usermod -aG dialout "$USER"
   exit
   ssh piuser@windsor-pi.local
   cd ~/windsor
   ```

   For a CUPS printer, enable the service and list configured printers:

   ```bash
   sudo systemctl enable --now cups
   lpstat -p
   ```

   Add the printer in CUPS, then use the name returned by `lpstat -p` in the
   Windsor control panel.

### 4. Install Windsor as a boot-time service

Windsor should run under `systemd`, so it starts automatically whenever the Pi
boots and restarts if the process exits. `systemd` does not use your interactive
shell's username or `nvm` settings, so use the actual account and absolute
binary path. Record them while logged in as the account that should run
Windsor:

```bash
id -un
echo "$HOME"
command -v windsor-bot
```

The first command must print an existing Linux username, and the last command
must print an executable path. In the example below the account is `piuser`,
the home directory is `/home/piuser`, and the installed command is
`/usr/bin/windsor-bot`. If your output is different, substitute your values
everywhere in the service file. For example, a Pi account named `windsor`
uses `User=windsor` and `/home/windsor/...`; do not leave `User=piuser` unless
that account actually exists.

Create `/etc/systemd/system/windsor.service`:

```bash
sudo nano /etc/systemd/system/windsor.service
```

Paste the following, replacing the three example values with the output from
the commands above:

```ini
[Unit]
Description=Windsor Bot
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=piuser
WorkingDirectory=/home/piuser/windsor
ExecStart=/usr/bin/windsor-bot
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable and start the service:

```bash
sudo systemctl daemon-reload
sudo systemctl enable windsor
sudo systemctl start windsor
sudo systemctl status windsor
```

The service starts Windsor on every boot. View its logs with:

```bash
journalctl -u windsor -f
```

If the unit was already started with the wrong username or path, edit the unit,
then run `sudo systemctl daemon-reload`, `sudo systemctl reset-failed windsor`,
and `sudo systemctl restart windsor`.

### 5. Configure credentials

Open [http://localhost:8080](http://localhost:8080) (or port 8080 on the Pi's
hostname/IP) from a computer on the same network. The service starts with no
Discord token, but the control panel is available immediately. Enter:

1. The Discord bot token.
2. Optionally, the server ID to restrict Windsor to one server. To copy
   IDs in Discord, enable **Developer Mode**, then right-click the server and
   choose **Copy Server ID**.
3. Optionally enter an OpenAI API key. It is required for AI-generated icons
   and recurring schedules.
4. Set a control-panel password in the **Security** section.
5. Save, then click **Restart Server**. This restarts the bot while leaving the
   boot service enabled.

Credentials may instead be supplied through environment variables:

| Variable | Purpose |
| --- | --- |
| `DISCORD_TOKEN` | Discord bot token |
| `SERVER_ID` | Optional Discord server ID |
| `OPENAI_API_KEY` | Optional OpenAI API key |
| `DIAGNOSTICS_PORT` | Control-panel port, default `8080` |
| `WINDSOR_CONFIG_PATH` | Path to the configuration file |

The control panel listens on all interfaces. Set a control-panel password in
the **Security** section before exposing it beyond your trusted local network.
`windsor.config.json` is gitignored because it contains secrets.

## Configure printing

Open the **Print Mode** section in the control panel, select an output mode, and
save it. Use **Print Test Page** before configuring channels.

* **ESC/P via Serial Port** sends thermal-printer commands directly to a
  device such as `/dev/ttyUSB0` (or `COM3` on Windows).
* **PDF via CUPS** renders a PDF and submits it with `lp`. Enter the CUPS
  printer name, paper size (for example `Letter`, `A4`, or `80x297mm`), and
  the display label for the paper.
* **Image Feed** renders jobs as PNGs instead of printing them. View them at
  `/feed`; this is useful for development and printer-independent testing.

## Configure channels

Windsor only monitors channels that have a behavior assigned. In **Channel
Behaviors**, choose a Discord text channel, select a behavior, and click
**Add**. Expand a channel row to edit its options. Use **Refresh Discord
Channels** after creating or renaming channels.

### 🖨️ Immediate Print

Every eligible message is printed immediately. This is useful for to-do items
and quick notes. Available options:

* **Header** and **Footer**: fixed text around each job
* **Include metadata footer**: includes the author and timestamp
* **Include AI-generated icon**: creates an icon from the message (requires an
  OpenAI key)

Messages can contain up to 800 non-URL characters. Up to five `https://` URLs
are extracted, replaced in the text with `[link]` (or `[link 1]`, etc.), and
printed as QR codes after the message.

### 🛒 Accumulating List

Messages are collected until someone posts `print` (case-insensitive; extra
punctuation is allowed). Windsor prints the items since the previous successful
print and marks the trigger with a reaction. This is useful for shopping lists.

Available options are **Header**, **Footer**, **Include metadata footer**, and
**Include checklist boxes**.

### 🔄 Recurring Print

Each message becomes a scheduled print. This behavior requires an OpenAI key
because Windsor uses it to interpret natural-language schedules. Examples:

```text
Take out the trash every other Tuesday at 7 PM
Change out the batteries on the 3rd of the month at 2 PM
Call Bob a week before his birthday (6/12)
```

Windsor replies with the interpreted schedule. If it is wrong, delete the
original message and post a corrected version. If no time is specified, the
default is 8:00 AM local time. Schedules are restored from recent channel
history when the bot starts.

### 💬 On-Demand

Only recognized commands are processed. Messages without a command prefix are
ignored. Commands accept either `!` or `/`; these are message prefixes, not
registered Discord slash commands.

## On-demand commands

| Command | Aliases | Description |
| --- | --- | --- |
| `/sudoku [kid\|easy\|medium\|hard]` | — | Prints a puzzle; defaults to `easy`. |
| `/wordsearch` | — | Prints a randomly themed, kid-appropriate word search. |
| `/pokemon [name\|1-151]` | `/kanto` | Prints a random Kanto Pokémon, or the named/numbered Pokémon. |
| `/hello` | `/helloworld` | Replies with a greeting without printing. |

For example, send `!sudoku hard` or `/pokemon Pikachu` in an on-demand
channel.

Wordsearches are pre-generated offline from the theme banks in
`scripts/wordsearch-themes`; the generator validates words against the
ROT13-encoded family-friendly denylist in
`scripts/wordsearch-blocklist.rot13.txt`. Run `npm run generate-wordsearches`
after changing the banks or generator.

## Control panel and local configuration

The diagnostics server provides:

* Bot connection status and recent events
* Discord credentials, server selection, and diagnostics port
* Channel behavior mappings
* Printer mode and test printing
* A password for the control panel
* Server restart and image-feed access

The panel saves settings to `windsor.config.json` in the current working
directory unless `WINDSOR_CONFIG_PATH` is set. The file is JSON and can be
backed up, but keep it private.

## Updating a production installation

Keep the Discord token and OpenAI key in the protected configuration file, or
configure them once through the panel. Upgrade the global package, then
restart the boot service:

```bash
sudo npm install --global windsor-bot
sudo systemctl restart windsor
```

Check the service after an update with `sudo systemctl status windsor` and view
logs with `journalctl -u windsor -f`.

## Troubleshooting

* **The bot is connected but ignores messages:** verify the channel has a
  behavior, the bot can view/read the channel, and **Message Content Intent**
  is enabled.
* **The server is missing from the panel:** verify the token, installation,
  and optional `SERVER_ID`; then use **Refresh Discord Channels**.
* **Printing fails:** use **Print Test Page**, confirm the selected mode, check
  the serial device permissions, or verify the CUPS name with `lpstat -p`.
* **The control panel cannot be reached:** confirm Windsor is running, check
  the configured port, and use the Pi's reachable hostname or IP instead of
  `localhost`.
* **AI features fail:** confirm `OPENAI_API_KEY` is present and restart Windsor
  after changing it.
* **`status=217/USER`:** the `User=` account in
  `/etc/systemd/system/windsor.service` does not exist. Set it to the username
  printed by `id -un`, update `WorkingDirectory` to that user's home directory,
  reload systemd, and restart the service.

## Local development

The normal installation does not require a checkout. These commands are for
contributors working from the source tree:

```bash
npm run dev     # run Windsor and the diagnostics server
npm run build   # type-check and build the web panel
npm test        # run the Node test suite
npm run gen-image -- a friendly shopping list      # generate test.png using the local config
```

The control-panel source is `src/web/app.tsx`. The browser app is bundled into
the npm package during `npm run build`.

## Sources

* [Discord: Building your first Discord bot](https://docs.discord.com/developers/quick-start/getting-started)
* [Discord: OAuth2 and bot authorization](https://docs.discord.com/developers/topics/oauth2#bot-authorization-flow)
* [Raspberry Pi: Getting started](https://www.raspberrypi.com/documentation/computers/getting-started.html)
* [Raspberry Pi: Remote access over SSH](https://www.raspberrypi.com/documentation/computers/remote-access.html#ssh)
