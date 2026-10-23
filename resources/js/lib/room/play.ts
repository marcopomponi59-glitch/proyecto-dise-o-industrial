import * as THREE from 'three';
import type { Slot } from './inventory';
import { crackCanvases } from './pixels';
import { parseBlockKey, SURFACE } from './world';

/** Un objeto tirado en el piso: gira, cae, y se junta al pasar cerca. */
interface Drop {
    mesh: THREE.Mesh;
    slot: Exclude<Slot, null>;
    velocity: THREE.Vector3;
    age: number;
}

interface Particle {
    mesh: THREE.Mesh;
    velocity: THREE.Vector3;
    age: number;
}

const GRAVITY = 20;
const PARTICLE_LIFE = 0.7;
/** Cuánto tiempo pasa antes de que algo tirado se pueda volver a juntar (si no, se junta al instante). */
const PICKUP_DELAY = 1;
const PICKUP_DISTANCE = 1.2;

/**
 * Efectos del recorrido: grietas sobre el bloque que se está rompiendo, pedacitos con la textura
 * del bloque cuando se rompe, y objetos tirados al piso que se pueden volver a juntar.
 */
export class PlayEffects {
    readonly group = new THREE.Group();
    private crack: THREE.Mesh;
    private crackTextures: THREE.CanvasTexture[];
    private particles: Particle[] = [];
    private drops: Drop[] = [];
    private particleGeometry = new THREE.BoxGeometry(0.12, 0.12, 0.12);
    private dropGeometry = new THREE.BoxGeometry(0.28, 0.28, 0.28);

    constructor() {
        this.crackTextures = crackCanvases().map((canvas) => {
            const texture = new THREE.CanvasTexture(canvas);
            texture.magFilter = THREE.NearestFilter;
            texture.minFilter = THREE.NearestFilter;
            return texture;
        });
        this.crack = new THREE.Mesh(
            new THREE.BoxGeometry(1.004, 1.004, 1.004),
            new THREE.MeshBasicMaterial({
                map: this.crackTextures[0],
                transparent: true,
                depthWrite: false,
                polygonOffset: true,
                polygonOffsetFactor: -1,
            }),
        );
        this.crack.visible = false;
        this.group.add(this.crack);
    }

    /** Muestra las grietas sobre un bloque; `progress` de 0 a 1 elige una de las 10 etapas. */
    setCrack(key: string | null, progress = 0) {
        this.crack.visible = key !== null && progress > 0;
        if (!key) {
            return;
        }
        const [ix, iy, iz] = parseBlockKey(key);
        this.crack.position.set(ix + 0.5, SURFACE + iy - 0.5, iz + 0.5);
        const stage = Math.min(this.crackTextures.length - 1, Math.floor(progress * this.crackTextures.length));
        const material = this.crack.material as THREE.MeshBasicMaterial;
        if (material.map !== this.crackTextures[stage]) {
            material.map = this.crackTextures[stage];
            material.needsUpdate = true;
        }
    }

    /** Pedacitos que saltan del bloque roto, con su misma textura. */
    burst(key: string, material: THREE.Material | THREE.Material[]) {
        const [ix, iy, iz] = parseBlockKey(key);
        const center = new THREE.Vector3(ix + 0.5, SURFACE + iy - 0.5, iz + 0.5);
        const face = Array.isArray(material) ? material[0] : material;
        for (let i = 0; i < 14; i++) {
            const mesh = new THREE.Mesh(this.particleGeometry, face);
            mesh.position.copy(center).add(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(0.7));
            const velocity = mesh.position
                .clone()
                .sub(center)
                .multiplyScalar(4)
                .add(new THREE.Vector3(0, 2 + Math.random() * 2, 0));
            this.group.add(mesh);
            this.particles.push({ mesh, velocity, age: 0 });
        }
    }

    /** Nube de pedacitos de un color (por ejemplo, un zombi que desaparece). */
    burstAt(center: THREE.Vector3, colors: string[]) {
        for (let i = 0; i < 24; i++) {
            const material = new THREE.MeshLambertMaterial({ color: colors[i % colors.length] });
            const mesh = new THREE.Mesh(this.particleGeometry, material);
            mesh.userData.ownMaterial = true;
            mesh.position.copy(center).add(new THREE.Vector3(Math.random() - 0.5, Math.random() * 1.2 - 0.6, Math.random() - 0.5));
            const velocity = mesh.position
                .clone()
                .sub(center)
                .multiplyScalar(3)
                .add(new THREE.Vector3(0, 2.5, 0));
            this.group.add(mesh);
            this.particles.push({ mesh, velocity, age: 0 });
        }
    }

    /** Tira algo al piso desde `from` en la dirección `direction`. `material` es el del bloque (o un color, para un mueble). */
    drop(slot: Exclude<Slot, null>, from: THREE.Vector3, direction: THREE.Vector3, material: THREE.Material | THREE.Material[] | string) {
        const face =
            typeof material === 'string' ? new THREE.MeshLambertMaterial({ color: material }) : Array.isArray(material) ? material[0] : material;
        const mesh = new THREE.Mesh(this.dropGeometry, face);
        mesh.userData.ownMaterial = typeof material === 'string';
        mesh.position.copy(from);
        mesh.castShadow = true;
        this.group.add(mesh);
        this.drops.push({ mesh, slot, velocity: direction.clone().setY(0).normalize().multiplyScalar(3.5).setY(3), age: 0 });
    }

    /**
     * Un paso de animación. `groundAt` da la altura del piso debajo de un punto; `player` es la
     * posición de los pies. Devuelve lo que el jugador juntó en este paso.
     */
    update(seconds: number, groundAt: (x: number, z: number, y: number) => number, player: THREE.Vector3): Exclude<Slot, null>[] {
        const dt = Math.min(seconds, 0.05);

        this.particles = this.particles.filter((p) => {
            p.age += dt;
            p.velocity.y -= GRAVITY * dt;
            p.mesh.position.addScaledVector(p.velocity, dt);
            p.mesh.scale.setScalar(Math.max(0.01, 1 - p.age / PARTICLE_LIFE));
            if (p.age < PARTICLE_LIFE) {
                return true;
            }
            this.group.remove(p.mesh);
            if (p.mesh.userData.ownMaterial) {
                (p.mesh.material as THREE.Material).dispose();
            }
            return false;
        });

        const picked: Exclude<Slot, null>[] = [];
        this.drops = this.drops.filter((d) => {
            d.age += dt;
            d.velocity.y -= GRAVITY * dt;
            d.mesh.position.addScaledVector(d.velocity, dt);
            const ground = groundAt(d.mesh.position.x, d.mesh.position.z, d.mesh.position.y) + 0.14;
            if (d.mesh.position.y <= ground) {
                d.mesh.position.y = ground + Math.sin(d.age * 3) * 0.04 + 0.04;
                d.velocity.set(0, 0, 0);
            }
            d.mesh.rotation.y += dt * 1.5;
            const near =
                Math.hypot(d.mesh.position.x - player.x, d.mesh.position.z - player.z) < PICKUP_DISTANCE &&
                Math.abs(d.mesh.position.y - player.y) < 1.8;
            if (d.age > PICKUP_DELAY && near) {
                picked.push(d.slot);
                this.removeDrop(d);
                return false;
            }
            return true;
        });
        return picked;
    }

    /** Si al juntar algo no había lugar en el inventario, vuelve al piso. */
    putBack(slot: Exclude<Slot, null>, at: THREE.Vector3, material: THREE.Material | THREE.Material[] | string) {
        this.drop(slot, at, new THREE.Vector3(1, 0, 0), material);
        const last = this.drops[this.drops.length - 1];
        last.velocity.set(0, 0, 0);
        last.age = -2;
    }

    private removeDrop(d: Drop) {
        this.group.remove(d.mesh);
        if (d.mesh.userData.ownMaterial) {
            (d.mesh.material as THREE.Material).dispose();
        }
    }

    /**
     * Limpia los efectos y devuelve lo que había tirado en el piso, para que vuelva al inventario:
     * así no se pierde un mueble del diseño por haberlo tirado.
     */
    clear(): Exclude<Slot, null>[] {
        const pending = this.drops.map((d) => d.slot);
        this.particles.forEach((p) => this.group.remove(p.mesh));
        this.drops.forEach((d) => this.removeDrop(d));
        this.particles = [];
        this.drops = [];
        this.setCrack(null);
        return pending;
    }

    dispose() {
        this.clear();
        this.particleGeometry.dispose();
        this.dropGeometry.dispose();
        this.crack.geometry.dispose();
        (this.crack.material as THREE.Material).dispose();
        this.crackTextures.forEach((t) => t.dispose());
    }
}
