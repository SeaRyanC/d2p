# Windsor: Your Friendly Household Helper Bot

You'll need:
 * A Raspberry Pi (or equivalent)
 * Thermal printer connected to its USB port

## Initial Setup

### Create a Discord Bot

<!-- Write instructions on how to create a Discord bot -->

### Invite to Server

<!-- Write instructions on how to invite the bot to your server -->

### Set up Raspberry Pi

<!-- Write high-level instructions on how to set up a headless Raspberry Pi -->

### Configure Credentials

<!-- Write instructions on how to get the right kind of discord API token here -->

## Automatic Behaviors

Windsor will automatically convert all URLs in messages to QR codes. These always appear after the message text, regardless of where they appeared in the message. If the URL was in the middle of the message, it'll be replaced with `[link]`.

## Channel Configuration

Windsor is primarily configured by assigning a *channel behaviors* to your Discord server's channels.
You don't need to assign a behavior for every channel; channels without a behavior won't be monitored.

The following channel behaviors are supported.

### 🖨️ Immediate Print

In *immediate print* mode, messages posted to the channel are immediately printed off.
This is ideal for "to do" items.

<!-- TODO (human): photo of a sample -->

You can enable these settings in the configuration panel:
 * **Header**: Include this text at the top of every printout.
 * **Icon**: Includes an image based on the message content. Requires OpenAI key.
 * **Metadata Footer**: Include footer lines with timestamp and message initiator.
 * **Footer**: Include this text at the bottom of every printout.

### 🛒 Accumulating List

In *accumulating list* mode, each printout is a list of messages since the prior printout.
This is ideal for shopping lists.

Trigger a printout of all unprinted items by posting the message "print" in the channel.

<!-- TODO (human): photo of a sample -->

You can enable these settings in the configuration panel:

 * **Header**: Include this text at the top of every printout.
 * **Checklist**: Include checkmark boxes next to each line
 * **Metadata Footer**: Include footer lines with timestamp and message initiator
 * **Footer**: Include this text at the bottom of every printout.

### 🔄 Recurring Print

*Recurring print* lets you set up automatic recurring printouts.
These work the same way as *immediate print*, but with a repeating schedule.
This feature requires an OpenAI key.

If you have an OpenAI key, the recurrence schedule will be determined automatically based on the text of the message. For example, you can write:

> Take out the trash every other Tuesday at 7 PM

AI will understand almost any syntax, e.g. you can write messges like any of these:

> Every other Tuesday, run the dishwasher clean cycle
>
> Change out the batteries on the 3rd of the month at 2 PM
> 
> Call Bob a week before his birthday (6/12)

If time of day isn't specified, the default is 8:00 AM local time.

Windsor will reply to you with its understood schedule. If you were misinterpreted, delete your message and rephrase in a new one.

### On-Demand

In on-demand channels, only specific commands will be processed. Other messages will be ignored. See the list in this document for supported commands.

## On-Demand Commands

Windsor includes many fun commands for printing one-off items

### `/sudoku [kid | easy | medium | hard]`

Prints a Sudoku puzzle at the specified difficulty (defaults to `easy`).

### `/wordsearch`

Prints a themed word search puzzle.
Themes are chosen randomly and are always kid-appropriate.

## Local Development

## Control panel and local config

Run the bot with:

```bash
npm run dev
```

Then open `http://localhost:8080` to use the web control panel.

The control panel is a Preact app served by the diagnostics server and can:

1. Show runtime bot status and recent events.
2. Save basic setup into a local `windsor.config.json` file (Discord token, server id, etc).

The browser app source lives in `src/web/app.tsx` and is bundled on-demand by the server using the esbuild API.

`windsor.config.json` is gitignored because it can contain secrets.