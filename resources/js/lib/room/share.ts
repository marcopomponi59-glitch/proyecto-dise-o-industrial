import { exportRoom, parseRoomFile } from './storage';
import { isPhoto } from './textures';
import type { Room } from './types';

/** Parámetro del fragmento (`#d=…`) que lleva el diseño. El fragmento no viaja al servidor. */
const PARAM = 'd';

function toBase64Url(bytes: Uint8Array): string {
    let binary = '';
    bytes.forEach((b) => (binary += String.fromCharCode(b)));
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array {
    const base64 = text.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
    return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

async function transform(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
    const output = new Blob([bytes]).stream().pipeThrough(stream);
    return new Uint8Array(await new Response(output).arrayBuffer());
}

/** Las fotos pesan demasiado para un link: viajan sólo los temas. */
export function withoutPhotos(room: Room): Room {
    return { ...room, items: room.items.map((item) => (isPhoto(item.texture) ? { ...item, texture: undefined } : item)) };
}

export function hasPhotos(room: Room): boolean {
    return room.items.some((item) => isPhoto(item.texture));
}

/** Fragmento `d=…` con la habitación comprimida, listo para poner después del `#`. */
export async function encodeRoomForLink(room: Room): Promise<string> {
    const json = new TextEncoder().encode(exportRoom(withoutPhotos(room)));
    const compressed = await transform(json, new CompressionStream('deflate-raw'));
    return `${PARAM}=${toBase64Url(compressed)}`;
}

/** El diseño que trae un fragmento (`#d=…`), o null si el link no trae ninguno. Si viene dañado, tira un error legible. */
export async function decodeRoomFromLink(hash: string): Promise<Room | null> {
    const value = new URLSearchParams(hash.replace(/^#/, '')).get(PARAM);
    if (!value) {
        return null;
    }
    let json: string;
    try {
        const bytes = await transform(fromBase64Url(value), new DecompressionStream('deflate-raw'));
        json = new TextDecoder().decode(bytes);
    } catch {
        throw new Error('El link del diseño está incompleto o dañado. Pedí que te lo vuelvan a mandar.');
    }
    return parseRoomFile(json);
}
