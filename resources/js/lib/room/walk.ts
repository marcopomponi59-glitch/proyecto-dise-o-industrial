import * as THREE from 'three';
import { M } from './three-builders';
import type { Room } from './types';

export type WalkKey = 'forward' | 'back' | 'left' | 'right';

export const WALK_KEYS: Record<string, WalkKey> = {
    w: 'forward',
    arrowup: 'forward',
    s: 'back',
    arrowdown: 'back',
    a: 'left',
    arrowleft: 'left',
    d: 'right',
    arrowright: 'right',
};

/** Distancia mínima a las paredes, en metros, para que la cámara no las atraviese. */
const MARGIN = 0.25;
const EYE_HEIGHT = 1.6;
const SPEED = 1.4;

/**
 * Recorrido en primera persona: la cámara a la altura de los ojos, se gira arrastrando
 * y se camina con el teclado o con los botones en pantalla. No atraviesa las paredes;
 * los muebles sí, para poder acercarse a cualquier lugar.
 */
export class WalkControls {
    readonly pressed = new Set<WalkKey>();
    private yaw = 0;
    private pitch = 0;
    private saved: { position: THREE.Vector3; quaternion: THREE.Quaternion; fov: number } | null = null;

    constructor(private camera: THREE.PerspectiveCamera) {}

    /** Entra parado cerca de la pared inferior, mirando hacia el centro de la habitación. */
    enter(room: Room) {
        this.saved = { position: this.camera.position.clone(), quaternion: this.camera.quaternion.clone(), fov: this.camera.fov };
        this.yaw = 0;
        this.pitch = -0.08;
        this.camera.position.set((room.width * M) / 2, Math.min(EYE_HEIGHT, room.height * M - 0.2), room.length * M - 0.6);
        this.camera.fov = 70;
        this.camera.updateProjectionMatrix();
        this.applyRotation();
        this.clamp(room);
    }

    exit() {
        this.pressed.clear();
        if (this.saved) {
            this.camera.position.copy(this.saved.position);
            this.camera.quaternion.copy(this.saved.quaternion);
            this.camera.fov = this.saved.fov;
            this.camera.updateProjectionMatrix();
        }
        this.saved = null;
    }

    /** Girar la vista: `dx`/`dy` en píxeles arrastrados. */
    look(dx: number, dy: number) {
        this.yaw -= dx * 0.005;
        this.pitch = Math.max(-1.3, Math.min(1.3, this.pitch - dy * 0.005));
        this.applyRotation();
    }

    /** Avanza según las teclas apretadas; `seconds` es el tiempo desde el cuadro anterior. */
    update(seconds: number, room: Room, fast = false) {
        if (this.pressed.size === 0) {
            return;
        }
        const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
        const right = new THREE.Vector3(-forward.z, 0, forward.x);
        const move = new THREE.Vector3();
        if (this.pressed.has('forward')) move.add(forward);
        if (this.pressed.has('back')) move.sub(forward);
        if (this.pressed.has('right')) move.add(right);
        if (this.pressed.has('left')) move.sub(right);
        if (move.lengthSq() === 0) {
            return;
        }
        // Tope de 0,1 s por cuadro: si la pestaña estuvo en segundo plano no da un salto.
        move.normalize().multiplyScalar(SPEED * (fast ? 2 : 1) * Math.min(seconds, 0.1));
        this.camera.position.add(move);
        this.clamp(room);
    }

    private applyRotation() {
        this.camera.quaternion.setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
    }

    private clamp(room: Room) {
        const p = this.camera.position;
        p.x = Math.max(MARGIN, Math.min(room.width * M - MARGIN, p.x));
        p.z = Math.max(MARGIN, Math.min(room.length * M - MARGIN, p.z));
    }
}
