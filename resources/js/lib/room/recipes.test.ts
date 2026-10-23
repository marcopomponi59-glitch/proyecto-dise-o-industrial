import { describe, expect, it } from 'vitest';
import { CATALOG } from './catalog';
import { addBlock, defaultInventory, SLOTS, type Slot } from './inventory';
import { countBlock, craft, missing, RECIPES, removeBlocks } from './recipes';
import type { RoomItem } from './types';
import type { BlockKind } from './world';

function withBlocks(blocks: [BlockKind, number][]): Slot[] {
    let inventory: Slot[] = defaultInventory();
    for (const [kind, amount] of blocks) {
        for (let i = 0; i < amount; i++) inventory = addBlock(inventory, kind)!;
    }
    return inventory;
}

const recipe = (id: string) => RECIPES.find((r) => r.id === id)!;
const makeItem = (type: string) => ({ id: `nuevo-${type}`, type, name: type }) as RoomItem;

describe('recetas', () => {
    it('todos los muebles que se fabrican existen en el catálogo', () => {
        for (const r of RECIPES) {
            if ('item' in r.gives) {
                const type = r.gives.item;
                expect(CATALOG.some((e) => e.type === type)).toBe(true);
            }
        }
    });

    it('una madera da cuatro tablones', () => {
        const result = craft(withBlocks([['log', 1]]), recipe('tablones'), makeItem)!;
        expect(countBlock(result, 'log')).toBe(0);
        expect(countBlock(result, 'planks')).toBe(4);
    });

    it('con cuatro tablones se hace la mesa de crafteo', () => {
        const result = craft(withBlocks([['planks', 5]]), recipe('mesa-crafteo'), makeItem)!;
        expect(countBlock(result, 'planks')).toBe(1);
        expect(countBlock(result, 'crafting')).toBe(1);
    });

    it('dice qué falta y no gasta nada si no alcanza', () => {
        const inventory = withBlocks([['planks', 2]]);
        expect(missing(inventory, recipe('cama'))).toEqual([
            { block: 'planks', amount: 1 },
            { block: 'leaves', amount: 3 },
        ]);
        expect(craft(inventory, recipe('cama'), makeItem)).toBeNull();
    });

    it('un mueble fabricado entra al inventario entero', () => {
        const result = craft(withBlocks([['planks', 4]]), recipe('silla'), makeItem)!;
        expect(result.find((s) => s?.kind === 'item')).toEqual({ kind: 'item', item: makeItem('silla') });
        expect(countBlock(result, 'planks')).toBe(0);
    });

    it('si lo fabricado no entra, no se gasta nada', () => {
        // 5 tablones: después de usar 4 queda la pila ocupando su lugar, y el resto está lleno.
        const full: Slot[] = withBlocks([['planks', 5]]);
        for (let i = 2; i < SLOTS; i++) full[i] = { kind: 'item', item: makeItem(`x${i}`) };
        expect(craft(full, recipe('silla'), makeItem)).toBeNull();
        expect(countBlock(full, 'planks')).toBe(5);
    });

    it('la espada de piedra va a la barra como herramienta', () => {
        const result = craft(
            withBlocks([
                ['stone', 2],
                ['log', 1],
            ]),
            recipe('espada-piedra'),
            makeItem,
        )!;
        expect(result).toContainEqual({ kind: 'tool', tool: 'espada-piedra' });
        expect(countBlock(result, 'stone')).toBe(0);
    });

    it('saca materiales de varias pilas', () => {
        const inventory = withBlocks([['stone', 70]]);
        const result = removeBlocks(inventory, 'stone', 68)!;
        expect(countBlock(result, 'stone')).toBe(2);
        expect(removeBlocks(inventory, 'stone', 71)).toBeNull();
    });
});
