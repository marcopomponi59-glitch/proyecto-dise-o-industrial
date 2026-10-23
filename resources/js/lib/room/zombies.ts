import * as THREE from 'three';
import { cannotStand } from './animals';
import { M } from './three-builders';
import type { Room } from './types';
import { hash, surfaceHeight, type BlockWorld } from './world';

/**
 * Zombis de cubos (diseño propio: piel verde, camisa rota marrón, pantalón oscuro y ojos rojos).
 * Pasean afuera; si el jugador anda cerca lo persiguen y le pegan. Tienen 10 de vida: con cada
 * golpe se ponen rojos y retroceden, y al llegar a 0 desaparecen en pedacitos. No entran a la casa.
 * De noche hay más. Con el tiempo aparecen nuevos lejos del jugador, hasta el máximo.
 */

export const ZOMBIE_HEALTH = 10;
/** Daño de cada golpe de un zombi al jugador (que tiene 20 de vida: 10 corazones). */
export const ZOMBIE_DAMAGE = 3;
const CHASE_DISTANCE = 14;
const ATTACK_DISTANCE = 1.3;
const ATTACK_EVERY = 1.2;
const WALK_SPEED = 0.6;
const CHASE_SPEED = 1.7;
const GRAVITY = 20;
const RESPAWN_EVERY = 12;

interface Zombie {
    group: THREE.Group;
    legs: THREE.Object3D[];
    materials: THREE.MeshLambertMaterial[];
    health: number;
    yaw: number;
    timer: number;
    walking: boolean;
    hurt: number;
    cooldown: number;
    velocity: THREE.Vector3;
    step: number;
}

function box(materials: THREE.MeshLambertMaterial[], color: string, size: [number, number, number], at: [number, number, number], emissive?: string) {
    const material = new THREE.MeshLambertMaterial({ color, emissive: emissive ?? '#000000' });
    materials.push(material);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
    mesh.position.set(...at);
    mesh.castShadow = true;
    return mesh;
}

/** Cuerpo del zombi: 1,8 m de alto, con los brazos estirados hacia adelante (+Z). */
function buildZombie(): Pick<Zombie, 'group' | 'legs' | 'materials'> {
    const group = new THREE.Group();
    const materials: THREE.MeshLambertMaterial[] = [];
    const legs: THREE.Object3D[] = [];
    const skin = '#7aa35f';

    group.add(box(materials, skin, [0.46, 0.46, 0.46], [0, 1.55, 0])); // cabeza
    group.add(box(materials, '#ff3b30', [0.08, 0.06, 0.02], [-0.11, 1.58, 0.24], '#aa1100')); // ojos
    group.add(box(materials, '#ff3b30', [0.08, 0.06, 0.02], [0.11, 1.58, 0.24], '#aa1100'));
    group.add(box(materials, '#3d5a32', [0.2, 0.05, 0.02], [0, 1.43, 0.24])); // boca
    group.add(box(materials, '#7d6b5a', [0.5, 0.6, 0.28], [0, 1.02, 0])); // camisa rota
    group.add(box(materials, skin, [0.14, 0.1, 0.02], [0.12, 0.85, 0.15])); // agujero de la camisa
    for (const x of [-0.33, 0.33]) {
        // Brazos estirados hacia adelante.
        group.add(box(materials, skin, [0.16, 0.16, 0.6], [x, 1.22, 0.3]));
    }
    for (const x of [-0.12, 0.12]) {
        const pivot = new THREE.Object3D();
        pivot.position.set(x, 0.72, 0);
        pivot.add(box(materials, '#3e4a3d', [0.2, 0.72, 0.22], [0, -0.36, 0]));
        legs.push(pivot);
        group.add(pivot);
    }
    return { group, legs, materials };
}

export class Horde {
    readonly group = new THREE.Group();
    private zombies: Zombie[] = [];
    private spawnTimer = 0;
    private spawned = 0;

    constructor(
        private room: Room,
        private world: BlockWorld,
        private groundAt: (x: number, z: number, y: number) => number,
    ) {}

    get count(): number {
        return this.zombies.length;
    }

    /** Hace aparecer un zombi lejos de `away` (el jugador), entre 18 y 35 m de la casa. */
    private spawn(away: THREE.Vector3 | null) {
        if (!this.world.terrain) {
            return;
        }
        for (let tries = 0; tries < 60; tries++) {
            const seed = this.spawned * 61 + tries;
            const angle = hash(seed, 3) * Math.PI * 2;
            const distance = 18 + hash(seed, 7) * 17;
            const x = (this.room.width * M) / 2 + Math.cos(angle) * distance;
            const z = (this.room.length * M) / 2 + Math.sin(angle) * distance;
            const ground = surfaceHeight(this.world, x, z);
            if (cannotStand(this.room, this.world, x, z, ground) || (away && Math.hypot(x - away.x, z - away.z) < 12)) {
                continue;
            }
            const body = buildZombie();
            body.group.position.set(x, ground, z);
            this.group.add(body.group);
            this.zombies.push({
                ...body,
                health: ZOMBIE_HEALTH,
                yaw: angle + Math.PI,
                timer: 1,
                walking: false,
                hurt: 0,
                cooldown: 0,
                velocity: new THREE.Vector3(),
                step: 0,
            });
            this.spawned++;
            return;
        }
    }

    /** Zombi al que pertenece un objeto que tocó el rayo (su índice), o null. */
    zombieAt(object: THREE.Object3D | null): number | null {
        let current = object;
        while (current && current.parent !== this.group) {
            current = current.parent;
        }
        if (!current) {
            return null;
        }
        const index = this.zombies.findIndex((z) => z.group === current);
        return index === -1 ? null : index;
    }

    healthOf(index: number): number {
        return this.zombies[index]?.health ?? 0;
    }

    /**
     * Un golpe desde `from` con `damage` de daño: retrocede y se pone rojo.
     * Devuelve dónde estaba si murió (para los pedacitos), o null si sigue vivo.
     */
    hit(index: number, from: THREE.Vector3, damage: number): THREE.Vector3 | null {
        const zombie = this.zombies[index];
        if (!zombie) {
            return null;
        }
        zombie.health -= damage;
        zombie.hurt = 0.3;
        const away = zombie.group.position.clone().sub(from).setY(0).normalize();
        zombie.velocity.set(away.x * 6, 4, away.z * 6);
        if (zombie.health > 0) {
            return null;
        }
        const where = zombie.group.position.clone().add(new THREE.Vector3(0, 1, 0));
        this.group.remove(zombie.group);
        this.disposeZombie(zombie);
        this.zombies.splice(index, 1);
        return where;
    }

    /**
     * Un paso: pasean, o persiguen al jugador si está cerca (y afuera). `player` son los pies del jugador
     * (null si no se está recorriendo). Devuelve el daño que le hicieron al jugador en este paso.
     */
    update(seconds: number, player: THREE.Vector3 | null, night: boolean): number {
        const dt = Math.min(seconds, 0.05);
        let damage = 0;

        // Repoblar de a poco: más de noche.
        const max = night ? 9 : 4;
        this.spawnTimer -= dt;
        if (this.zombies.length < max && this.spawnTimer <= 0) {
            this.spawn(player);
            // La primera vez se llena rápido; después, cada zombi derrotado tarda en ser reemplazado.
            this.spawnTimer = this.spawned < max ? 0.5 : RESPAWN_EVERY;
        }

        for (const zombie of this.zombies) {
            const position = zombie.group.position;
            zombie.hurt = Math.max(0, zombie.hurt - dt);
            zombie.cooldown = Math.max(0, zombie.cooldown - dt);
            zombie.materials.forEach((m, i) => (i < 1 || i > 2 ? m.emissive.set(zombie.hurt > 0 ? '#aa0000' : '#000000') : undefined));

            const distance = player ? Math.hypot(player.x - position.x, player.z - position.z) : Infinity;
            const chasing = player !== null && distance < CHASE_DISTANCE && Math.abs(player.y - position.y) < 4;
            if (chasing) {
                zombie.yaw = Math.atan2(player.x - position.x, player.z - position.z);
                zombie.walking = distance > ATTACK_DISTANCE * 0.8;
                if (distance < ATTACK_DISTANCE && zombie.cooldown === 0) {
                    damage += ZOMBIE_DAMAGE;
                    zombie.cooldown = ATTACK_EVERY;
                }
            } else {
                zombie.timer -= dt;
                if (zombie.timer <= 0) {
                    zombie.walking = !zombie.walking;
                    zombie.timer = zombie.walking ? 2 + Math.random() * 3 : 1 + Math.random() * 2;
                    zombie.yaw += (Math.random() - 0.5) * Math.PI;
                }
            }

            const ground = this.groundAt(position.x, position.z, position.y + 0.5);
            const onGround = position.y <= ground + 0.01 && zombie.velocity.y <= 0;
            if (zombie.walking && onGround) {
                const speed = chasing ? CHASE_SPEED : WALK_SPEED;
                const nx = position.x + Math.sin(zombie.yaw) * speed * dt;
                const nz = position.z + Math.cos(zombie.yaw) * speed * dt;
                const next = this.groundAt(nx, nz, position.y + 1.2);
                if (cannotStand(this.room, this.world, nx, nz, next) || next - position.y > 1.05) {
                    if (!chasing) zombie.yaw += Math.PI * (0.5 + Math.random());
                } else {
                    position.x = nx;
                    position.z = nz;
                    if (next - position.y > 0.3) zombie.velocity.y = 6.5;
                }
            }

            zombie.velocity.y -= GRAVITY * dt;
            position.x += zombie.velocity.x * dt;
            position.z += zombie.velocity.z * dt;
            position.y += zombie.velocity.y * dt;
            zombie.velocity.x *= 0.88;
            zombie.velocity.z *= 0.88;
            const below = this.groundAt(position.x, position.z, position.y + 0.5);
            if (position.y <= below) {
                position.y = below;
                zombie.velocity.y = 0;
            }
            if (cannotStand(this.room, this.world, position.x, position.z, below)) {
                position.x -= zombie.velocity.x * dt * 2;
                position.z -= zombie.velocity.z * dt * 2;
                zombie.velocity.x = zombie.velocity.z = 0;
            }

            const turn = ((((zombie.yaw - zombie.group.rotation.y + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI;
            zombie.group.rotation.y += turn * Math.min(1, dt * 6);
            zombie.step += zombie.walking ? dt * (chasing ? 10 : 6) : 0;
            zombie.legs.forEach((leg, i) => (leg.rotation.x = zombie.walking ? Math.sin(zombie.step + (i ? Math.PI : 0)) * 0.5 : 0));
        }
        return damage;
    }

    private disposeZombie(zombie: Zombie) {
        zombie.group.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                child.geometry.dispose();
            }
        });
        zombie.materials.forEach((m) => m.dispose());
    }

    dispose() {
        this.zombies.forEach((z) => this.disposeZombie(z));
        this.group.clear();
        this.zombies = [];
    }
}
