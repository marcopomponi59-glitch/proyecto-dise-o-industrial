import { describe, expect, it } from 'vitest';
import type { Room, RoomItem } from './types';
import { canMoveTo, solidsFor, supportHeight } from './walk';

function item(overrides: Partial<RoomItem>): RoomItem {
    return {
        id: 'i',
        type: 'caja',
        name: 'Caja',
        shape: 'box',
        mount: 'floor',
        x: 200,
        y: 200,
        width: 100,
        depth: 100,
        height: 60,
        rotation: 0,
        elevation: 0,
        color: '#888888',
        ...overrides,
    };
}

const room = (items: RoomItem[]): Room => ({
    id: 'r',
    name: 'Prueba',
    width: 400,
    length: 400,
    height: 260,
    wallColor: '#ffffff',
    floorColor: '#cccccc',
    items,
    updatedAt: '',
});

describe('física del recorrido', () => {
    const bed = item({ id: 'cama', height: 60 });
    const wardrobe = item({ id: 'placard', x: 100, height: 220, width: 60, depth: 60 });
    const solids = solidsFor(room([bed, wardrobe, item({ id: 'alfombra', mount: 'rug', height: 1, x: 300 })]));

    it('las alfombras no son sólidas', () => {
        expect(solids.map((s) => s.id)).toEqual(['cama', 'placard']);
    });

    it('un mueble frena al que camina por el piso', () => {
        // La cama ocupa z de 1,5 a 2,5 m; el cuerpo mide 0,3 m de radio.
        expect(canMoveTo(solids, { x: 2, z: 3.5 }, { x: 2, z: 2.7 }, 0)).toBe(false);
        expect(canMoveTo(solids, { x: 2, z: 3.5 }, { x: 2, z: 3.4 }, 0)).toBe(true);
    });

    it('arriba de la cama se puede caminar y no frena', () => {
        expect(canMoveTo(solids, { x: 2, z: 2.2 }, { x: 2, z: 2.0 }, 0.6)).toBe(true);
    });

    it('al placard no se lo pasa ni desde arriba de la cama', () => {
        expect(canMoveTo(solids, { x: 1.7, z: 2 }, { x: 1.5, z: 2 }, 0.6)).toBe(false);
    });

    it('el apoyo es el piso o la parte de arriba de lo que tiene debajo', () => {
        expect(supportHeight(solids, 3.5, 3.5, 0)).toBe(0);
        expect(supportHeight(solids, 2, 2, 0.7)).toBeCloseTo(0.6);
        // Desde el piso no "sube" a la cama sin saltar: está más alta que un escalón.
        expect(supportHeight(solids, 2, 2, 0)).toBe(0);
    });

    it('si quedó metido en un mueble (al entrar) puede salir', () => {
        expect(canMoveTo(solids, { x: 2, z: 2 }, { x: 2, z: 2.1 }, 0)).toBe(true);
    });

    it('lo que tiene en la mano no cuenta como sólido', () => {
        expect(solidsFor(room([bed]), 'cama')).toEqual([]);
    });
});
