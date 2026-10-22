import { describe, expect, it } from 'vitest';
import {
    clampToRoom,
    corners,
    findFreeSpot,
    findIssues,
    fitToRoom,
    isOutsideRoom,
    itemsCollide,
    moveItem,
    nearestWall,
    normalizeRotation,
    placeOnWall,
    reattachToWall,
} from './geometry';
import type { Room, RoomItem } from './types';

const room: Room = {
    id: 'r1',
    name: 'Prueba',
    width: 400,
    length: 300,
    height: 260,
    wallColor: '#ffffff',
    floorColor: '#cccccc',
    items: [],
    updatedAt: '2026-01-01T00:00:00.000Z',
};

function item(overrides: Partial<RoomItem> = {}): RoomItem {
    return {
        id: 'i1',
        type: 'caja',
        name: 'Caja',
        shape: 'box',
        mount: 'floor',
        x: 200,
        y: 150,
        width: 100,
        depth: 50,
        height: 80,
        rotation: 0,
        elevation: 0,
        color: '#888888',
        ...overrides,
    };
}

describe('corners', () => {
    it('sin rotación da el rectángulo alineado', () => {
        expect(corners(item())).toEqual([
            { x: 150, y: 125 },
            { x: 250, y: 125 },
            { x: 250, y: 175 },
            { x: 150, y: 175 },
        ]);
    });

    it('rotado 90° intercambia ancho y fondo', () => {
        const xs = corners(item({ rotation: 90 })).map((p) => Math.round(p.x));
        const ys = corners(item({ rotation: 90 })).map((p) => Math.round(p.y));
        expect(Math.max(...xs) - Math.min(...xs)).toBe(50);
        expect(Math.max(...ys) - Math.min(...ys)).toBe(100);
    });
});

describe('normalizeRotation', () => {
    it('deja el ángulo entre 0 y 359', () => {
        expect(normalizeRotation(-90)).toBe(270);
        expect(normalizeRotation(450)).toBe(90);
        expect(normalizeRotation(0)).toBe(0);
    });
});

describe('clampToRoom', () => {
    it('mete adentro un objeto que se pasa de la pared', () => {
        const moved = clampToRoom(item({ x: 390, y: 5 }), room);
        expect(moved.x).toBe(350);
        expect(moved.y).toBe(25);
    });

    it('usa la caja rotada para calcular el límite', () => {
        const moved = clampToRoom(item({ x: 0, y: 0, rotation: 90 }), room);
        expect(moved.x).toBeCloseTo(25);
        expect(moved.y).toBeCloseTo(50);
    });

    it('centra un objeto más grande que la habitación', () => {
        const moved = clampToRoom(item({ width: 500 }), room);
        expect(moved.x).toBe(200);
    });
});

describe('objetos de pared', () => {
    const tv = item({ mount: 'wall', width: 120, depth: 6, height: 70, elevation: 90 });

    it('elige la pared más cercana', () => {
        expect(nearestWall(room, { x: 200, y: 10 })).toBe('top');
        expect(nearestWall(room, { x: 395, y: 150 })).toBe('right');
        expect(nearestWall(room, { x: 200, y: 290 })).toBe('bottom');
        expect(nearestWall(room, { x: 5, y: 150 })).toBe('left');
    });

    it('queda con la espalda contra la pared y mirando hacia adentro', () => {
        expect(placeOnWall(tv, room, 'top', 200)).toMatchObject({ x: 200, y: 3, rotation: 0, wall: 'top' });
        expect(placeOnWall(tv, room, 'bottom', 200)).toMatchObject({ x: 200, y: 297, rotation: 180 });
        expect(placeOnWall(tv, room, 'left', 150)).toMatchObject({ x: 3, y: 150, rotation: 270 });
        expect(placeOnWall(tv, room, 'right', 150)).toMatchObject({ x: 397, y: 150, rotation: 90 });
    });

    it('no se sale por los costados de la pared', () => {
        expect(placeOnWall(tv, room, 'top', 10).x).toBe(60);
        expect(placeOnWall(tv, room, 'left', 290).y).toBe(240);
    });

    it('al moverlo se pega a la pared más cercana', () => {
        const moved = moveItem(tv, room, { x: 390, y: 100 });
        expect(moved).toMatchObject({ wall: 'right', x: 397, y: 100, rotation: 90 });
    });

    it('sigue pegado a su pared cuando la habitación cambia de tamaño', () => {
        const onBottom = placeOnWall(tv, room, 'bottom', 200);
        const bigger = reattachToWall(onBottom, { width: 400, length: 500 });
        expect(bigger).toMatchObject({ wall: 'bottom', y: 497 });
    });
});

describe('choques', () => {
    it('dos objetos superpuestos chocan', () => {
        expect(itemsCollide(item(), item({ id: 'i2', x: 260 }))).toBe(true);
    });

    it('dos objetos que apenas se tocan no chocan', () => {
        expect(itemsCollide(item(), item({ id: 'i2', x: 300 }))).toBe(false);
    });

    it('a distinta altura no chocan (TV sobre el mueble)', () => {
        const rack = item({ height: 50 });
        const tv = item({ id: 'tv', mount: 'wall', elevation: 90, height: 70 });
        expect(itemsCollide(rack, tv)).toBe(false);
    });

    it('un objeto apoyado justo encima no choca (lámpara sobre la mesa de luz)', () => {
        const table = item({ width: 45, depth: 40, height: 55 });
        const lamp = item({ id: 'l', width: 25, depth: 25, height: 45, elevation: 55 });
        expect(itemsCollide(table, lamp)).toBe(false);
    });

    it('las alfombras no chocan con nada', () => {
        expect(itemsCollide(item({ mount: 'rug', height: 1 }), item({ id: 'i2' }))).toBe(false);
    });

    it('detecta el choque entre rectángulos rotados', () => {
        const a = item({ x: 100, y: 100, width: 100, depth: 20, rotation: 45 });
        const b = item({ id: 'b', x: 130, y: 130, width: 20, depth: 20 });
        const far = item({ id: 'c', x: 150, y: 50, width: 20, depth: 20 });
        expect(itemsCollide(a, b)).toBe(true);
        expect(itemsCollide(a, far)).toBe(false);
    });
});

describe('findFreeSpot', () => {
    it('deja el objeto donde está si no choca', () => {
        expect(findFreeSpot(item(), room)).toMatchObject({ x: 200, y: 150 });
    });

    it('lo corre al lugar libre más cercano si choca', () => {
        const occupied = { ...room, items: [item({ id: 'a' })] };
        const placed = findFreeSpot(item({ id: 'b' }), occupied);
        expect(itemsCollide(placed, occupied.items[0])).toBe(false);
        expect(isOutsideRoom(placed, occupied)).toBe(false);
        expect(Math.hypot(placed.x - 200, placed.y - 150)).toBeLessThanOrEqual(60);
    });

    it('a lo de pared lo busca a lo largo de la pared', () => {
        const tv = placeOnWall(item({ id: 'tv', mount: 'wall', width: 120, depth: 6, elevation: 90 }), room, 'top', 200);
        const placed = findFreeSpot({ ...tv, id: 'tv2' }, { ...room, items: [tv] });
        expect(placed.wall).toBeDefined();
        expect(itemsCollide(placed, tv)).toBe(false);
    });
});

describe('ventanas, puertas y techo', () => {
    const window = placeOnWall(
        item({ id: 'v', name: 'Ventana', shape: 'window', mount: 'wall', width: 120, depth: 10, height: 110, elevation: 95 }),
        room,
        'top',
        200,
    );
    const door = placeOnWall(
        item({ id: 'p', name: 'Puerta', shape: 'door', mount: 'wall', width: 80, depth: 10, height: 205, elevation: 0 }),
        room,
        'left',
        150,
    );

    it('las aberturas no cuentan como fuera de la habitación', () => {
        expect(window.y).toBe(-5);
        expect(isOutsideRoom(window, room)).toBe(false);
    });

    it('un cuadro sobre la ventana choca, uno al costado no', () => {
        const over = placeOnWall(item({ id: 'c', mount: 'wall', width: 60, depth: 3, height: 40, elevation: 140 }), room, 'top', 210);
        const beside = placeOnWall(item({ id: 'c2', mount: 'wall', width: 60, depth: 3, height: 40, elevation: 140 }), room, 'top', 320);
        expect(itemsCollide(window, over)).toBe(true);
        expect(itemsCollide(window, beside)).toBe(false);
    });

    it('un mueble contra la pared de la ventana no choca con ella', () => {
        expect(itemsCollide(window, item({ id: 'm', y: 30, height: 200 }))).toBe(false);
    });

    it('avisa cuando un mueble tapa el paso de la puerta', () => {
        const chair = item({ id: 's', name: 'Silla', x: 40, y: 150, width: 45, depth: 45 });
        const issues = findIssues({ ...room, items: [door, chair] });
        expect(issues.get('s')).toEqual(['Tapa el paso de Puerta']);
        expect(issues.get('p')).toEqual(['Silla no deja abrirla']);
        expect(findIssues({ ...room, items: [door, { ...chair, x: 200 }] }).size).toBe(0);
    });

    it('lo de techo cuelga del techo aunque cambie la altura', () => {
        const lamp = item({ mount: 'ceiling', height: 60 });
        expect(fitToRoom(lamp, { ...room, height: 260 }).elevation).toBe(200);
        expect(fitToRoom(lamp, { ...room, height: 300 }).elevation).toBe(240);
    });
});

describe('findIssues', () => {
    it('informa choques, objetos fuera y más altos que el techo', () => {
        const issues = findIssues({
            ...room,
            items: [
                item({ id: 'a', name: 'Cama' }),
                item({ id: 'b', name: 'Mesa', x: 220 }),
                item({ id: 'c', name: 'Placard', x: 380, y: 60, height: 300 }),
                item({ id: 'd', name: 'Silla', x: 50, y: 250 }),
            ],
        });

        expect(issues.get('a')).toEqual(['Choca con Mesa']);
        expect(issues.get('b')).toEqual(['Choca con Cama']);
        expect(issues.get('c')).toEqual(['Se sale de la habitación', 'Supera la altura del techo']);
        expect(issues.has('d')).toBe(false);
    });
});
