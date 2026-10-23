import { addBlock, addItem, addSlot, type Slot, type Tool } from './inventory';
import type { RoomItem } from './types';
import type { BlockKind } from './world';

/**
 * Recetas para fabricar en el recorrido. Las básicas se hacen con la mano (tecla E); los muebles
 * necesitan una mesa de crafteo cerca. Lo fabricado va al inventario.
 */

export interface Recipe {
    id: string;
    name: string;
    needs: Partial<Record<BlockKind, number>>;
    /** Un bloque (con cantidad), un mueble del catálogo (por su tipo) o una herramienta. */
    gives: { block: BlockKind; count: number } | { item: string } | { tool: Tool };
    station: 'mano' | 'mesa';
}

export const RECIPES: Recipe[] = [
    { id: 'tablones', name: 'Tablones', needs: { log: 1 }, gives: { block: 'planks', count: 4 }, station: 'mano' },
    { id: 'mesa-crafteo', name: 'Mesa de crafteo', needs: { planks: 4 }, gives: { block: 'crafting', count: 1 }, station: 'mano' },
    { id: 'espada-madera', name: 'Espada de madera', needs: { planks: 2, log: 1 }, gives: { tool: 'espada-madera' }, station: 'mesa' },
    { id: 'espada-piedra', name: 'Espada de piedra', needs: { stone: 2, log: 1 }, gives: { tool: 'espada-piedra' }, station: 'mesa' },
    { id: 'ladrillos', name: 'Ladrillos', needs: { stone: 2 }, gives: { block: 'bricks', count: 1 }, station: 'mesa' },
    { id: 'silla', name: 'Silla de madera', needs: { planks: 4 }, gives: { item: 'silla' }, station: 'mesa' },
    { id: 'mesa', name: 'Mesa', needs: { planks: 6 }, gives: { item: 'mesa' }, station: 'mesa' },
    { id: 'mesa-de-luz', name: 'Mesa de luz', needs: { planks: 4 }, gives: { item: 'mesa-de-luz-simple' }, station: 'mesa' },
    { id: 'cama', name: 'Cama simple', needs: { planks: 3, leaves: 3 }, gives: { item: 'cama-simple' }, station: 'mesa' },
    { id: 'biblioteca', name: 'Biblioteca', needs: { planks: 6 }, gives: { item: 'biblioteca' }, station: 'mesa' },
    { id: 'caja', name: 'Caja', needs: { planks: 2 }, gives: { item: 'caja' }, station: 'mesa' },
    { id: 'puerta', name: 'Puerta', needs: { planks: 6 }, gives: { item: 'puerta' }, station: 'mesa' },
    { id: 'lampara', name: 'Lámpara de mesa', needs: { log: 1, stone: 1 }, gives: { item: 'lampara-mesa' }, station: 'mesa' },
    { id: 'planta', name: 'Planta chica', needs: { leaves: 2, dirt: 1 }, gives: { item: 'planta-chica' }, station: 'mesa' },
];

/** Cuántos bloques de un tipo hay en todo el inventario (sumando las pilas). */
export function countBlock(inventory: Slot[], block: BlockKind): number {
    return inventory.reduce((total, s) => total + (s?.kind === 'block' && s.block === block ? s.count : 0), 0);
}

/** Saca `amount` bloques de un tipo, empezando por las últimas pilas. Null si no alcanza. */
export function removeBlocks(inventory: Slot[], block: BlockKind, amount: number): Slot[] | null {
    if (countBlock(inventory, block) < amount) {
        return null;
    }
    const next = [...inventory];
    let left = amount;
    for (let i = next.length - 1; i >= 0 && left > 0; i--) {
        const slot = next[i];
        if (slot?.kind === 'block' && slot.block === block) {
            const used = Math.min(slot.count, left);
            left -= used;
            next[i] = slot.count - used > 0 ? { ...slot, count: slot.count - used } : null;
        }
    }
    return next;
}

/** Lo que falta para una receta (vacío si alcanza). */
export function missing(inventory: Slot[], recipe: Recipe): { block: BlockKind; amount: number }[] {
    return (Object.entries(recipe.needs) as [BlockKind, number][])
        .map(([block, amount]) => ({ block, amount: amount - countBlock(inventory, block) }))
        .filter((m) => m.amount > 0);
}

/**
 * Fabrica: saca los materiales y agrega lo fabricado. `makeItem` arma el mueble a partir del tipo del catálogo.
 * Null si faltan materiales o si lo fabricado no entra en el inventario (en ese caso no se gasta nada).
 */
export function craft(inventory: Slot[], recipe: Recipe, makeItem: (type: string) => RoomItem | null): Slot[] | null {
    if (missing(inventory, recipe).length > 0) {
        return null;
    }
    let next: Slot[] | null = inventory;
    for (const [block, amount] of Object.entries(recipe.needs) as [BlockKind, number][]) {
        next = next && removeBlocks(next, block, amount);
    }
    if (!next) {
        return null;
    }
    if ('block' in recipe.gives) {
        for (let i = 0; i < recipe.gives.count && next; i++) {
            next = addBlock(next, recipe.gives.block);
        }
        return next;
    }
    if ('tool' in recipe.gives) {
        return addSlot(next, { kind: 'tool', tool: recipe.gives.tool });
    }
    const item = makeItem(recipe.gives.item);
    return item ? addItem(next, item) : null;
}
