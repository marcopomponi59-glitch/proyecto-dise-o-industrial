import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { TOOL_DAMAGE } from './inventory';
import type { Room } from './types';
import { blockSolids, supportHeight } from './walk';
import { generateWorld, SURFACE, surfaceHeight, WORLD_FLOOR } from './world';
import { Horde, ZOMBIE_DAMAGE, ZOMBIE_HEALTH } from './zombies';

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

const world = generateWorld(room, 'dia');
const groundAt = (x: number, z: number, y: number) => {
    const inside = x >= 0 && z >= 0 && x <= 4 && z <= 3.5;
    return supportHeight(blockSolids(world, x, z, y - 0.5), x, z, y, inside ? 0 : SURFACE + WORLD_FLOOR - 1);
};
const insideHouse = (x: number, z: number) => x > -0.1 && z > -0.1 && x < 4.1 && z < 3.6;

function spawned(night = false): Horde {
    const horde = new Horde(room, world, groundAt);
    // Unos segundos sin jugador alcanzan para que aparezcan.
    for (let i = 0; i < 60 * 30; i++) horde.update(1 / 30, null, night);
    return horde;
}

describe('zombis', () => {
    it('aparecen afuera, y de noche hay más', () => {
        const day = spawned();
        const night = spawned(true);
        expect(day.count).toBe(4);
        expect(night.count).toBe(9);
        for (const z of night.group.children) {
            expect(insideHouse(z.position.x, z.position.z)).toBe(false);
        }
    });

    it('persiguen al jugador que anda cerca y le pegan', () => {
        const horde = spawned();
        const zombie = horde.group.children[0];
        // El jugador a 5 m del zombi, afuera.
        const player = zombie.position.clone().add(new THREE.Vector3(5, 0, 0));
        player.y = surfaceHeight(world, player.x, player.z);
        let damage = 0;
        for (let i = 0; i < 30 * 15 && damage === 0; i++) {
            damage += horde.update(1 / 30, player, false);
        }
        expect(damage).toBe(ZOMBIE_DAMAGE);
    });

    it('no entran a la casa aunque el jugador esté adentro', () => {
        const horde = spawned(true);
        const player = new THREE.Vector3(2, 0, 1.75);
        for (let i = 0; i < 30 * 60; i++) horde.update(1 / 30, player, true);
        for (const z of horde.group.children) {
            expect(insideHouse(z.position.x, z.position.z)).toBe(false);
        }
    });

    it('con la espada de piedra mueren en dos golpes; con la mano hacen falta diez', () => {
        const horde = spawned();
        const from = horde.group.children[0].position.clone().add(new THREE.Vector3(1, 0, 0));
        expect(horde.hit(0, from, TOOL_DAMAGE['espada-piedra'])).toBeNull();
        expect(horde.healthOf(0)).toBe(ZOMBIE_HEALTH - 6);
        expect(horde.hit(0, from, TOOL_DAMAGE['espada-piedra'])).not.toBeNull();
        expect(horde.count).toBe(3);

        const other = spawned();
        for (let i = 0; i < 9; i++) expect(other.hit(0, from, 1)).toBeNull();
        expect(other.hit(0, from, 1)).not.toBeNull();
    });
});
