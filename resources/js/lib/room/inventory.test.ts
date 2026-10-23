import { describe, expect, it } from 'vitest';
import { addBlock, addItem, addSlot, defaultInventory, normalizeInventory, SLOTS, STACK, takeOne, type Slot } from './inventory';
import type { RoomItem } from './types';

const chair = { id: 's', type: 'silla', name: 'Silla' } as RoomItem;

describe('inventario', () => {
    it('empieza con el pico en el primer lugar y 8 lugares vacíos', () => {
        const inventory = defaultInventory();
        expect(inventory).toHaveLength(SLOTS);
        expect(inventory[0]).toEqual({ kind: 'tool', tool: 'pico' });
        expect(inventory.slice(1).every((s) => s === null)).toBe(true);
    });

    it('apila los bloques del mismo tipo y abre otra pila al llegar a 64', () => {
        let inventory: Slot[] = defaultInventory();
        for (let i = 0; i < STACK + 1; i++) {
            inventory = addBlock(inventory, 'log')!;
        }
        expect(inventory[1]).toEqual({ kind: 'block', block: 'log', count: STACK });
        expect(inventory[2]).toEqual({ kind: 'block', block: 'log', count: 1 });
    });

    it('cada mueble ocupa un lugar y con el inventario lleno no entra nada', () => {
        let inventory: Slot[] = defaultInventory();
        for (let i = 1; i < SLOTS; i++) {
            inventory = addItem(inventory, { ...chair, id: `s${i}` })!;
        }
        expect(addItem(inventory, chair)).toBeNull();
        expect(addBlock(inventory, 'dirt')).toBeNull();
    });

    it('saca de a uno: de la pila un bloque, o el mueble entero', () => {
        let inventory = addBlock(addBlock(defaultInventory(), 'stone')!, 'stone')!;
        inventory = addItem(inventory, chair)!;
        const block = takeOne(inventory, 1)!;
        expect(block.taken).toEqual({ kind: 'block', block: 'stone', count: 1 });
        expect(block.inventory[1]).toEqual({ kind: 'block', block: 'stone', count: 1 });
        const item = takeOne(block.inventory, 2)!;
        expect(item.taken).toEqual({ kind: 'item', item: chair });
        expect(item.inventory[2]).toBeNull();
        expect(takeOne(item.inventory, 5)).toBeNull();
    });

    it('lo que se tiró vuelve a entrar', () => {
        const inventory = addSlot(defaultInventory(), { kind: 'block', block: 'leaves', count: 1 })!;
        expect(inventory[1]).toEqual({ kind: 'block', block: 'leaves', count: 1 });
    });

    it('valida lo guardado y descarta lo que no entiende', () => {
        const restored = normalizeInventory(
            [
                { kind: 'tool', tool: 'pico' },
                { kind: 'block', block: 'log', count: 500 },
                { kind: 'block', block: 'oro' },
                'basura',
                { kind: 'item', item: chair },
            ],
            (raw) => (raw as RoomItem) ?? null,
        );
        expect(restored).toHaveLength(SLOTS);
        expect(restored[1]).toEqual({ kind: 'block', block: 'log', count: STACK });
        expect(restored[2]).toBeNull();
        expect(restored[3]).toBeNull();
        expect(restored[4]).toEqual({ kind: 'item', item: chair });
    });
});
