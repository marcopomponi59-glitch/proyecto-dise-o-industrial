import type { RoomItem } from './types';
import { BLOCK_KINDS, type BlockKind } from './world';

/**
 * Inventario del recorrido, como en los juegos de bloques: 9 lugares; el primero empieza con el pico.
 * Los bloques se apilan (hasta 64 por lugar); cada mueble guardado ocupa un lugar entero.
 */

export type Tool = 'pico' | 'espada-madera' | 'espada-piedra';

export const TOOLS: Tool[] = ['pico', 'espada-madera', 'espada-piedra'];

export const TOOL_NAMES: Record<Tool, string> = { pico: 'Pico', 'espada-madera': 'Espada de madera', 'espada-piedra': 'Espada de piedra' };

/** Daño de cada golpe a un zombi (tiene 10 de vida). La mano o un bloque pegan 1. */
export const TOOL_DAMAGE: Record<Tool, number> = { pico: 2, 'espada-madera': 4, 'espada-piedra': 6 };

export type Slot = { kind: 'tool'; tool: Tool } | { kind: 'block'; block: BlockKind; count: number } | { kind: 'item'; item: RoomItem } | null;

export const SLOTS = 9;
export const STACK = 64;

export function defaultInventory(): Slot[] {
    return [{ kind: 'tool', tool: 'pico' }, ...Array<Slot>(SLOTS - 1).fill(null)];
}

/** Agrega un bloque: primero a una pila del mismo tipo con lugar, si no al primer lugar vacío. Null si está lleno. */
export function addBlock(inventory: Slot[], block: BlockKind): Slot[] | null {
    const next = [...inventory];
    const stack = next.findIndex((s) => s?.kind === 'block' && s.block === block && s.count < STACK);
    if (stack !== -1) {
        const slot = next[stack] as Extract<Slot, { kind: 'block' }>;
        next[stack] = { ...slot, count: slot.count + 1 };
        return next;
    }
    const empty = next.indexOf(null);
    if (empty === -1) {
        return null;
    }
    next[empty] = { kind: 'block', block, count: 1 };
    return next;
}

/** Guarda un mueble en el primer lugar vacío. Null si está lleno. */
export function addItem(inventory: Slot[], item: RoomItem): Slot[] | null {
    const empty = inventory.indexOf(null);
    if (empty === -1) {
        return null;
    }
    const next = [...inventory];
    next[empty] = { kind: 'item', item };
    return next;
}

/** Vuelve a meter algo que se había tirado (un bloque o un mueble). */
export function addSlot(inventory: Slot[], slot: Exclude<Slot, null>): Slot[] | null {
    if (slot.kind === 'item') {
        return addItem(inventory, slot.item);
    }
    if (slot.kind === 'block') {
        return addBlock(inventory, slot.block);
    }
    const empty = inventory.indexOf(null);
    if (empty === -1) {
        return null;
    }
    const next = [...inventory];
    next[empty] = slot;
    return next;
}

/** Saca una unidad del lugar `index` (un bloque de la pila, el mueble o el pico). */
export function takeOne(inventory: Slot[], index: number): { inventory: Slot[]; taken: Exclude<Slot, null> } | null {
    const slot = inventory[index];
    if (!slot) {
        return null;
    }
    const next = [...inventory];
    if (slot.kind === 'block') {
        next[index] = slot.count > 1 ? { ...slot, count: slot.count - 1 } : null;
        return { inventory: next, taken: { kind: 'block', block: slot.block, count: 1 } };
    }
    next[index] = null;
    return { inventory: next, taken: slot };
}

/** Segundos que tarda en romperse cada bloque, con la mano o con el pico. */
export const BREAK_SECONDS: Record<BlockKind, { hand: number; pico: number }> = {
    leaves: { hand: 0.3, pico: 0.15 },
    grass: { hand: 0.9, pico: 0.35 },
    dirt: { hand: 0.75, pico: 0.3 },
    log: { hand: 2, pico: 0.6 },
    stone: { hand: 4, pico: 0.7 },
    planks: { hand: 1.5, pico: 0.5 },
    bricks: { hand: 4, pico: 0.8 },
    crafting: { hand: 1.5, pico: 0.5 },
};

/** Valida un inventario guardado (localStorage o archivo); lo que no se entiende queda vacío. */
export function normalizeInventory(raw: unknown, normalizeItem: (raw: unknown) => RoomItem | null): Slot[] {
    const list = Array.isArray(raw) ? raw.slice(0, SLOTS) : [];
    const slots: Slot[] = list.map((s): Slot => {
        if (typeof s !== 'object' || s === null) return null;
        const slot = s as Record<string, unknown>;
        if (slot.kind === 'tool' && TOOLS.includes(slot.tool as Tool)) return { kind: 'tool', tool: slot.tool as Tool };
        if (slot.kind === 'block' && BLOCK_KINDS.includes(slot.block as BlockKind)) {
            const count = typeof slot.count === 'number' && slot.count >= 1 ? Math.min(STACK, Math.floor(slot.count)) : 1;
            return { kind: 'block', block: slot.block as BlockKind, count };
        }
        if (slot.kind === 'item') {
            const item = normalizeItem(slot.item);
            return item ? { kind: 'item', item } : null;
        }
        return null;
    });
    while (slots.length < SLOTS) slots.push(null);
    return slots;
}
