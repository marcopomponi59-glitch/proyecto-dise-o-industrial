import { describe, expect, it } from 'vitest';
import { placeOnWall } from './geometry';
import type { Room, RoomItem } from './types';
import { canMoveTo, wallSolids } from './walk';
import { blockKey, generateWorld, isExposed, raycastBlocks, SURFACE, WORLD_REACH } from './world';

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

describe('mundo de bloques', () => {
    const world = generateWorld(room, 'atardecer');

    it('rodea la casa con terreno hasta el alcance configurado', () => {
        expect(world.minX).toBe(-WORLD_REACH);
        expect(world.maxX).toBe(4 + WORLD_REACH);
        expect(world.blocks.get(blockKey(-5, 0, 2))).toBe('grass');
    });

    it('no hay bloques dentro de la habitación, pero sí en las columnas que tocan las paredes', () => {
        expect(world.blocks.has(blockKey(1, 0, 1))).toBe(false);
        // La columna z de 3 a 4 m pisa la pared inferior (z = 3,5 m): tiene que haber piso afuera de la puerta.
        expect(world.blocks.has(blockKey(1, 0, 3))).toBe(true);
    });

    it('tiene árboles con troncos y hojas', () => {
        const kinds = new Set(world.blocks.values());
        expect(kinds.has('log')).toBe(true);
        expect(kinds.has('leaves')).toBe(true);
    });

    it('siempre sale igual y los bloques rotos no vuelven', () => {
        const again = generateWorld(room, 'atardecer', [blockKey(-5, 0, 2)]);
        expect(again.blocks.size).toBe(world.blocks.size - 1);
        expect(again.blocks.has(blockKey(-5, 0, 2))).toBe(false);
    });

    it('sólo se ven los bloques con alguna cara al aire', () => {
        expect(isExposed(world, -5, 0, 2)).toBe(true);
        expect(isExposed(world, -5, -2, 2)).toBe(false);
    });
});

describe('rayo celda por celda', () => {
    const world = generateWorld(room, 'dia');

    it('mirando hacia abajo desde afuera encuentra el pasto que hay a los pies', () => {
        const hit = raycastBlocks(world, { x: -5.5, y: 1.6, z: 2.5 }, { x: 0, y: -1, z: 0 }, 4.5);
        expect(hit?.key).toBe(blockKey(-6, 0, 2));
        expect(hit?.distance).toBeCloseTo(1.6 - SURFACE);
    });

    it('un bloque nuevo va en la celda vacía pegada a la cara que se mira', () => {
        const hit = raycastBlocks(world, { x: -5.5, y: 1.6, z: 2.5 }, { x: 0, y: -1, z: 0 }, 4.5);
        expect(hit?.before).toBe(blockKey(-6, 1, 2));
    });

    it('los bloques puestos a mano aparecen aunque no haya terreno', () => {
        const empty = generateWorld(room, null, [], [[blockKey(1, 1, 1), 'log']]);
        expect(empty.terrain).toBe(false);
        expect([...empty.blocks]).toEqual([[blockKey(1, 1, 1), 'log']]);
    });

    it('mirando al cielo no encuentra nada', () => {
        expect(raycastBlocks(world, { x: -5.5, y: 1.6, z: 2.5 }, { x: 0, y: 1, z: 0 }, 4.5)).toBeNull();
    });

    it('no llega más lejos que la mano', () => {
        expect(raycastBlocks(world, { x: -5.5, y: 6, z: 2.5 }, { x: 0, y: -1, z: 0 }, 4.5)).toBeNull();
    });
});

describe('paredes y puertas', () => {
    const door: RoomItem = placeOnWall(
        {
            id: 'p',
            type: 'puerta',
            name: 'Puerta',
            shape: 'door',
            mount: 'wall',
            x: 0,
            y: 0,
            width: 80,
            depth: 10,
            height: 205,
            rotation: 0,
            elevation: 0,
            color: '#ffffff',
        },
        room,
        'bottom',
        200,
    );

    it('sin puerta no se puede salir', () => {
        const solids = wallSolids(room);
        expect(canMoveTo(solids, { x: 2, z: 3.1 }, { x: 2, z: 3.3 }, 0)).toBe(false);
    });

    it('por la puerta se sale, al costado de la puerta no', () => {
        const solids = wallSolids({ ...room, items: [door] });
        expect(canMoveTo(solids, { x: 2, z: 3.1 }, { x: 2, z: 3.3 }, 0)).toBe(true);
        expect(canMoveTo(solids, { x: 1, z: 3.1 }, { x: 1, z: 3.3 }, 0)).toBe(false);
    });
});
