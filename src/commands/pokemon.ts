import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { access } from 'fs/promises';
import type { Command, CommandResult, CommandRunContext } from './index.ts';
import type { PrintJob } from '../types.ts';
import { tryExecCommandFunction } from './util.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SPRITE_DIR = join(__dirname, '../../assets/pokemon-sprites');

// Kanto Pokédex — index 0 = Bulbasaur (#1)
const KANTO: string[] = [
    'Bulbasaur', 'Ivysaur', 'Venusaur',
    'Charmander', 'Charmeleon', 'Charizard',
    'Squirtle', 'Wartortle', 'Blastoise',
    'Caterpie', 'Metapod', 'Butterfree',
    'Weedle', 'Kakuna', 'Beedrill',
    'Pidgey', 'Pidgeotto', 'Pidgeot',
    'Rattata', 'Raticate',
    'Spearow', 'Fearow',
    'Ekans', 'Arbok',
    'Pikachu', 'Raichu',
    'Sandshrew', 'Sandslash',
    'Nidoran♀', 'Nidorina', 'Nidoqueen',
    'Nidoran♂', 'Nidorino', 'Nidoking',
    'Clefairy', 'Clefable',
    'Vulpix', 'Ninetales',
    'Jigglypuff', 'Wigglytuff',
    'Zubat', 'Golbat',
    'Oddish', 'Gloom', 'Vileplume',
    'Paras', 'Parasect',
    'Venonat', 'Venomoth',
    'Diglett', 'Dugtrio',
    'Meowth', 'Persian',
    'Psyduck', 'Golduck',
    'Mankey', 'Primeape',
    'Growlithe', 'Arcanine',
    'Poliwag', 'Poliwhirl', 'Poliwrath',
    'Abra', 'Kadabra', 'Alakazam',
    'Machop', 'Machoke', 'Machamp',
    'Bellsprout', 'Weepinbell', 'Victreebel',
    'Tentacool', 'Tentacruel',
    'Geodude', 'Graveler', 'Golem',
    'Ponyta', 'Rapidash',
    'Slowpoke', 'Slowbro',
    'Magnemite', 'Magneton',
    "Farfetch'd",
    'Doduo', 'Dodrio',
    'Seel', 'Dewgong',
    'Grimer', 'Muk',
    'Shellder', 'Cloyster',
    'Gastly', 'Haunter', 'Gengar',
    'Onix',
    'Drowzee', 'Hypno',
    'Krabby', 'Kingler',
    'Voltorb', 'Electrode',
    'Exeggcute', 'Exeggutor',
    'Cubone', 'Marowak',
    'Hitmonlee', 'Hitmonchan',
    'Lickitung',
    'Koffing', 'Weezing',
    'Rhyhorn', 'Rhydon',
    'Chansey',
    'Tangela',
    'Kangaskhan',
    'Horsea', 'Seadra',
    'Goldeen', 'Seaking',
    'Staryu', 'Starmie',
    'Mr. Mime',
    'Scyther',
    'Jynx',
    'Electabuzz',
    'Magmar',
    'Pinsir',
    'Tauros',
    'Magikarp', 'Gyarados',
    'Lapras',
    'Ditto',
    'Eevee', 'Vaporeon', 'Jolteon', 'Flareon',
    'Porygon',
    'Omanyte', 'Omastar',
    'Kabuto', 'Kabutops',
    'Aerodactyl',
    'Snorlax',
    'Articuno', 'Zapdos', 'Moltres',
    'Dratini', 'Dragonair', 'Dragonite',
    'Mewtwo',
    'Mew',
];

function findPokemon(arg: string): { id: number; name: string } | null {
    const trimmed = arg.trim();

    // Try by number
    const num = parseInt(trimmed, 10);
    if (!isNaN(num) && num >= 1 && num <= 151) {
        return { id: num, name: KANTO[num - 1]! };
    }

    // Try by name (case-insensitive)
    const lower = trimmed.toLowerCase();
    const idx = KANTO.findIndex(n => n.toLowerCase() === lower);
    if (idx !== -1) {
        return { id: idx + 1, name: KANTO[idx]! };
    }

    return null;
}

async function pokemonWorker(args: string, ctx: CommandRunContext): Promise<CommandResult> {
    let id: number;
    let name: string;

    if (!args.trim()) {
        // Random
        id = Math.floor(Math.random() * KANTO.length) + 1;
        name = KANTO[id - 1]!;
    } else {
        const found = findPokemon(args);
        if (!found) {
            return {
                kind: 'fail',
                reason: `Unknown Pokémon "${args.trim()}". Use a name or number 1-151.`,
            };
        }
        ({ id, name } = found);
    }

    const spritePath = join(SPRITE_DIR, `${id}.png`);
    const numStr = String(id).padStart(3, '0');
    try {
        await access(spritePath);
    } catch (error) {
        throw new Error(`Pokémon sprite not found at ${spritePath}`, { cause: error });
    }

    const job: PrintJob = {
        header: `#${numStr} ${name}`,
        lines: [],
        urls: [],
        iconPath: spritePath,
    };

    await ctx.printJob(job);

    return { kind: 'pass', reply: `Printing #${numStr} ${name}!` };
}

export const printPokemon: Command = {
    aliases: ['pokemon', 'kanto'],
    invoke: tryExecCommandFunction(pokemonWorker),
};
