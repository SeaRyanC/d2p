import type { BotCommand } from '../types.ts';

export const helloCommand: BotCommand = {
    name: 'hello',
    channels: [],
    description: 'Prints "Hello, world" to the local console. Usage: !hello',

    async execute() {
        console.log('Hello, world');
    },
};
