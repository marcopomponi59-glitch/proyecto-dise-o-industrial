import * as THREE from 'three';
import { WALL_THICKNESS } from './geometry';
import { M } from './three-builders';
import type { Room } from './types';
import { blockKey, hash, SURFACE, surfaceHeight, type BlockWorld } from './world';

/**
 * Animales de granja hechos de cubos (diseño propio): pasean por el terreno de afuera, saltan
 * escalones de un bloque, no se meten en la casa y, si se los empuja, salen corriendo un rato.
 * No se guardan: cada vez que se abre la vista 3D aparecen en sus lugares de siempre.
 */

/**
 * Un bicho del paisaje (animal o zombi) no puede pararse ahí: adentro de la casa (con un margen,
 * así la casa es zona segura), fuera del mundo o arriba de la copa de un árbol.
 */
export function cannotStand(room: Room, world: BlockWorld, x: number, z: number, ground: number): boolean {
    const T = WALL_THICKNESS * M + 0.4;
    const insideHouse = x > -T && z > -T && x < room.width * M + T && z < room.length * M + T;
    const outside = x < world.minX + 2 || x > world.maxX - 2 || z < world.minZ + 2 || z > world.maxZ - 2;
    const onTree = world.blocks.get(blockKey(Math.floor(x), Math.round(ground - SURFACE), Math.floor(z))) === 'leaves';
    return insideHouse || outside || onTree;
}

export type AnimalKind = 'vaca' | 'oveja' | 'cerdo' | 'gallina';

export const ANIMAL_NAMES: Record<AnimalKind, string> = { vaca: 'Vaca', oveja: 'Oveja', cerdo: 'Cerdo', gallina: 'Gallina' };

interface Animal {
    kind: AnimalKind;
    group: THREE.Group;
    legs: THREE.Object3D[];
    materials: THREE.MeshLambertMaterial[];
    yaw: number;
    /** Segundos que le quedan a lo que está haciendo (caminar o quedarse quieto). */
    timer: number;
    walking: boolean;
    /** Segundos que le quedan escapando después de un empujón. */
    flee: number;
    /** Segundos que le quedan en rojo después de un empujón. */
    hurt: number;
    velocity: THREE.Vector3;
    step: number;
}

const GRAVITY = 20;
const WALK_SPEED = 0.8;
const FLEE_SPEED = 2.6;
const COUNT = 14;

/** Caja de color con el centro en (x, y, z); el material se guarda para poder ponerlo rojo al empujarlo. */
function part(materials: THREE.MeshLambertMaterial[], color: string, size: [number, number, number], at: [number, number, number]): THREE.Mesh {
    const material = new THREE.MeshLambertMaterial({ color });
    materials.push(material);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
    mesh.position.set(...at);
    mesh.castShadow = true;
    return mesh;
}

/** Arma el cuerpo de cada animal. El frente mira hacia +Z; las patas giran desde la cadera. */
function buildBody(kind: AnimalKind): Pick<Animal, 'group' | 'legs' | 'materials'> {
    const group = new THREE.Group();
    const materials: THREE.MeshLambertMaterial[] = [];
    const legs: THREE.Object3D[] = [];
    const leg = (color: string, size: [number, number, number], hip: [number, number, number]) => {
        const pivot = new THREE.Object3D();
        pivot.position.set(...hip);
        pivot.add(part(materials, color, size, [0, -size[1] / 2, 0]));
        legs.push(pivot);
        group.add(pivot);
    };

    switch (kind) {
        case 'vaca': {
            group.add(part(materials, '#7a4b2a', [0.6, 0.6, 1.1], [0, 0.85, 0]));
            group.add(part(materials, '#f2efe9', [0.62, 0.3, 0.4], [0, 0.95, -0.15])); // mancha clara
            group.add(part(materials, '#7a4b2a', [0.42, 0.4, 0.36], [0, 1.05, 0.68]));
            group.add(part(materials, '#e9b8a8', [0.3, 0.16, 0.1], [0, 0.93, 0.88])); // hocico
            group.add(part(materials, '#e6dccb', [0.06, 0.14, 0.06], [-0.16, 1.3, 0.66]));
            group.add(part(materials, '#e6dccb', [0.06, 0.14, 0.06], [0.16, 1.3, 0.66]));
            for (const [x, z] of [
                [-0.18, 0.4],
                [0.18, 0.4],
                [-0.18, -0.4],
                [0.18, -0.4],
            ]) {
                leg('#5c3a20', [0.18, 0.55, 0.18], [x, 0.55, z]);
            }
            break;
        }
        case 'oveja': {
            group.add(part(materials, '#f4f1ea', [0.62, 0.55, 0.9], [0, 0.78, 0]));
            group.add(part(materials, '#8c8478', [0.3, 0.32, 0.3], [0, 0.95, 0.55]));
            group.add(part(materials, '#f4f1ea', [0.36, 0.1, 0.2], [0, 1.13, 0.5])); // lana en la frente
            for (const [x, z] of [
                [-0.16, 0.3],
                [0.16, 0.3],
                [-0.16, -0.3],
                [0.16, -0.3],
            ]) {
                leg('#8c8478', [0.14, 0.5, 0.14], [x, 0.5, z]);
            }
            break;
        }
        case 'cerdo': {
            group.add(part(materials, '#f2a7b3', [0.55, 0.45, 0.85], [0, 0.55, 0]));
            group.add(part(materials, '#f2a7b3', [0.42, 0.4, 0.36], [0, 0.65, 0.55]));
            group.add(part(materials, '#e07f92', [0.22, 0.14, 0.08], [0, 0.6, 0.76])); // trompa
            for (const [x, z] of [
                [-0.15, 0.25],
                [0.15, 0.25],
                [-0.15, -0.25],
                [0.15, -0.25],
            ]) {
                leg('#e7929f', [0.14, 0.33, 0.14], [x, 0.33, z]);
            }
            break;
        }
        case 'gallina': {
            group.add(part(materials, '#fbfaf5', [0.3, 0.3, 0.38], [0, 0.42, 0]));
            group.add(part(materials, '#fbfaf5', [0.2, 0.26, 0.18], [0, 0.66, 0.16]));
            group.add(part(materials, '#f2b33d', [0.1, 0.06, 0.1], [0, 0.66, 0.29])); // pico
            group.add(part(materials, '#d9302c', [0.06, 0.1, 0.12], [0, 0.82, 0.16])); // cresta
            leg('#f2b33d', [0.05, 0.28, 0.05], [-0.07, 0.28, 0]);
            leg('#f2b33d', [0.05, 0.28, 0.05], [0.07, 0.28, 0]);
            break;
        }
    }
    return { group, legs, materials };
}

export class Herd {
    readonly group = new THREE.Group();
    private animals: Animal[] = [];

    constructor(
        private room: Room,
        private world: BlockWorld,
    ) {
        if (!world.terrain) {
            return;
        }
        const kinds: AnimalKind[] = ['vaca', 'oveja', 'cerdo', 'gallina'];
        // Lugares fijos (con semilla) sobre pasto libre, entre 5 y 25 m de la casa.
        for (let i = 0, tries = 0; this.animals.length < COUNT && tries < 400; tries++) {
            const angle = hash(tries, 5) * Math.PI * 2;
            const distance = 5 + hash(tries, 9) * 20;
            const x = (room.width * M) / 2 + Math.cos(angle) * (distance + (room.width * M) / 2);
            const z = (room.length * M) / 2 + Math.sin(angle) * (distance + (room.length * M) / 2);
            const ground = surfaceHeight(world, x, z);
            if (this.blocked(x, z, ground)) {
                continue;
            }
            const kind = kinds[i++ % kinds.length];
            const body = buildBody(kind);
            body.group.position.set(x, ground, z);
            body.group.userData.animal = this.animals.length;
            this.group.add(body.group);
            this.animals.push({
                kind,
                ...body,
                yaw: hash(tries, 13) * Math.PI * 2,
                timer: hash(tries, 17) * 3,
                walking: false,
                flee: 0,
                hurt: 0,
                velocity: new THREE.Vector3(),
                step: 0,
            });
        }
    }

    private blocked(x: number, z: number, ground: number): boolean {
        return cannotStand(this.room, this.world, x, z, ground);
    }

    /** Animal al que pertenece un objeto que tocó el rayo (o null). */
    animalAt(object: THREE.Object3D | null): number | null {
        let current = object;
        while (current) {
            if (typeof current.userData.animal === 'number') {
                return current.userData.animal;
            }
            current = current.parent;
        }
        return null;
    }

    nameOf(index: number): string {
        return ANIMAL_NAMES[this.animals[index].kind];
    }

    /** Un empujón desde `from`: sale despedido, se pone rojo un instante y escapa unos segundos. */
    hit(index: number, from: THREE.Vector3) {
        const animal = this.animals[index];
        if (!animal) {
            return;
        }
        const away = animal.group.position.clone().sub(from).setY(0).normalize();
        animal.velocity.set(away.x * 5, 4.5, away.z * 5);
        animal.yaw = Math.atan2(away.x, away.z);
        animal.flee = 3;
        animal.hurt = 0.3;
        animal.walking = true;
    }

    update(seconds: number, groundAt: (x: number, z: number, y: number) => number) {
        const dt = Math.min(seconds, 0.05);
        for (const animal of this.animals) {
            const position = animal.group.position;
            animal.timer -= dt;
            animal.flee = Math.max(0, animal.flee - dt);
            animal.hurt = Math.max(0, animal.hurt - dt);
            animal.materials.forEach((m) => m.emissive.set(animal.hurt > 0 ? '#aa0000' : '#000000'));

            // Paseo: un rato camina en una dirección, otro rato se queda quieto.
            if (animal.flee === 0 && animal.timer <= 0) {
                animal.walking = !animal.walking;
                animal.timer = animal.walking ? 2 + Math.random() * 3 : 1 + Math.random() * 3;
                if (animal.walking) {
                    animal.yaw += (Math.random() - 0.5) * Math.PI;
                }
            }

            const ground = groundAt(position.x, position.z, position.y + 0.5);
            const onGround = position.y <= ground + 0.01 && animal.velocity.y <= 0;
            if (animal.walking && onGround) {
                const speed = animal.flee > 0 ? FLEE_SPEED : WALK_SPEED;
                const nx = position.x + Math.sin(animal.yaw) * speed * dt;
                const nz = position.z + Math.cos(animal.yaw) * speed * dt;
                const next = groundAt(nx, nz, position.y + 1.2);
                if (this.blocked(nx, nz, next) || next - position.y > 1.05) {
                    // Pared, casa o escalón muy alto: se da vuelta.
                    animal.yaw += Math.PI * (0.5 + Math.random());
                } else {
                    position.x = nx;
                    position.z = nz;
                    if (next - position.y > 0.3) {
                        // Escalón de un bloque: salta.
                        animal.velocity.y = 6.5;
                    }
                }
            }

            // Gravedad y empujones.
            animal.velocity.y -= GRAVITY * dt;
            position.x += animal.velocity.x * dt;
            position.z += animal.velocity.z * dt;
            position.y += animal.velocity.y * dt;
            animal.velocity.x *= 0.9;
            animal.velocity.z *= 0.9;
            const below = groundAt(position.x, position.z, position.y + 0.5);
            if (position.y <= below) {
                position.y = below;
                animal.velocity.y = 0;
            }
            if (this.blocked(position.x, position.z, below)) {
                // Un empujón no lo puede meter en la casa ni sacarlo del mundo.
                position.x -= animal.velocity.x * dt * 2;
                position.z -= animal.velocity.z * dt * 2;
                animal.velocity.x = animal.velocity.z = 0;
            }

            // Que gire de a poco hacia donde va, y que mueva las patas al caminar.
            const turn = ((((animal.yaw - animal.group.rotation.y + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI;
            animal.group.rotation.y += turn * Math.min(1, dt * 6);
            animal.step += animal.walking ? dt * (animal.flee > 0 ? 16 : 8) : 0;
            animal.legs.forEach((legPivot, i) => {
                legPivot.rotation.x = animal.walking ? Math.sin(animal.step + (i % 2 ? Math.PI : 0)) * 0.5 : 0;
            });
        }
    }

    dispose() {
        this.group.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                child.geometry.dispose();
                (child.material as THREE.Material).dispose();
            }
        });
        this.group.clear();
        this.animals = [];
    }
}
