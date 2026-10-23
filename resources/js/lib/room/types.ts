/**
 * Modelo de una habitación y sus objetos.
 *
 * Todas las medidas están en centímetros. El plano usa el origen en la esquina
 * superior izquierda: `x` crece hacia la derecha (ancho) e `y` hacia abajo (largo).
 * La rotación está en grados, en sentido horario visto desde arriba; con rotación 0
 * el frente del objeto mira hacia +y.
 */

import type { Slot } from './inventory';
import type { BlockKind } from './world';

export type Wall = 'top' | 'right' | 'bottom' | 'left';

export type Outside = 'atardecer' | 'bloques' | 'cielo';

/**
 * Cómo se apoya un objeto: en el piso, colgado de una pared, colgado del techo (su altura
 * desde el piso se calcula sola) o como alfombra (no choca con nada).
 */
export type Mount = 'floor' | 'wall' | 'ceiling' | 'rug';

/** Forma con la que se dibuja el objeto en 3D. */
export type Shape = 'box' | 'bed' | 'sofa' | 'table' | 'chair' | 'shelf' | 'wardrobe' | 'tv' | 'frame' | 'plant' | 'lamp' | 'rug' | 'window' | 'door';

export interface RoomItem {
    id: string;
    /** Clave del catálogo de la que salió el objeto. */
    type: string;
    name: string;
    shape: Shape;
    mount: Mount;
    /** Pared a la que está pegado; sólo para `mount: 'wall'`. */
    wall?: Wall;
    /** Centro del objeto en el plano. */
    x: number;
    y: number;
    width: number;
    depth: number;
    height: number;
    rotation: number;
    /** Distancia del piso a la base del objeto. */
    elevation: number;
    color: string;
    /** Sólo para lámparas: si está prendida. */
    lightOn?: boolean;
    /** Estilo de cuadros, camas y alfombras: `tema:<clave>` o una foto como data URL. */
    texture?: string;
}

export interface RoomWorld {
    broken: string[];
    placed?: [string, BlockKind][];
    inventory?: Slot[];
}

export interface Room {
    id: string;
    name: string;
    width: number;
    length: number;
    height: number;
    wallColor: string;
    floorColor: string;
    /** Qué se ve por las ventanas: paisaje de bloques al atardecer o de día, o sólo cielo. */
    outside?: Outside;
    /**
     * Lo que cambió en el recorrido: bloques rotos y puestos (claves `ix,iy,iz`) y el inventario.
     * Sin esto, el mundo es el generado y el inventario arranca sólo con el pico.
     */
    world?: RoomWorld;
    items: RoomItem[];
    updatedAt: string;
}

export interface Point {
    x: number;
    y: number;
}
