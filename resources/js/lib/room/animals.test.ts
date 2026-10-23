import { describe, expect, it } from 'vitest';
import { Herd } from './animals';
import type { Room } from './types';
import { blockSolids, supportHeight } from './walk';
import { generateWorld, SURFACE, surfaceHeight, WORLD_FLOOR } from './world';

const room: Room = {
    id: 'r',
    name: 'Prueba',
    width: 400,
    length: 350,
    height: 260,
    wallColor: '#ffffff',
    floorColor: '#cccccc',
    items: [],
    updatedAt: '',
};

describe('animales', () => {
    const world = generateWorld(room, 'dia');
    const groundAt = (x: number, z: number, y: number) => {
        const inside = x >= 0 && z >= 0 && x <= 4 && z <= 3.5;
        return supportHeight(blockSolids(world, x, z, y - 0.5), x, z, y, inside ? 0 : SURFACE + WORLD_FLOOR - 1);
    };
    const insideHouse = (x: number, z: number) => x > -0.1 && z > -0.1 && x < 4.1 && z < 3.6;

    it('aparecen afuera de la casa, parados en el suelo', () => {
        const herd = new Herd(room, world);
        const animals = herd.group.children;
        expect(animals.length).toBe(14);
        for (const a of animals) {
            expect(insideHouse(a.position.x, a.position.z)).toBe(false);
            expect(a.position.y).toBeCloseTo(surfaceHeight(world, a.position.x, a.position.z), 1);
            // Parados sobre el pasto, no enterrados: la superficie cerca de la casa está a ras del piso o más arriba.
            expect(a.position.y).toBeGreaterThan(SURFACE - 0.01);
        }
    });

    it('después de pasear un minuto ninguno se metió en la casa ni se cayó del mundo', () => {
        const herd = new Herd(room, world);
        for (let i = 0; i < 60 * 30; i++) {
            herd.update(1 / 30, groundAt);
        }
        for (const a of herd.group.children) {
            expect(insideHouse(a.position.x, a.position.z)).toBe(false);
            expect(a.position.y).toBeGreaterThan(SURFACE + WORLD_FLOOR - 1);
        }
    });

    it('sin terreno (vista "sólo cielo") no hay animales', () => {
        const herd = new Herd(room, generateWorld(room, null));
        expect(herd.group.children.length).toBe(0);
    });
});
