import { describe, expect, it } from 'vitest';
import { CATALOG } from './catalog';
import { decodeRoomFromLink, encodeRoomForLink } from './share';
import { addStarterItems, createItem, createRoom } from './storage';

describe('link para compartir', () => {
    it('ida y vuelta conserva la habitación', async () => {
        let room = addStarterItems(createRoom({ name: 'Dormitorio de Ana', width: 400, length: 350, height: 260 }));
        room = { ...room, items: [...room.items, ...CATALOG.slice(5, 25).map((e) => createItem(e, room))] };

        const fragment = await encodeRoomForLink(room);
        expect(fragment).toMatch(/^d=[A-Za-z0-9_-]+$/);
        expect(await decodeRoomFromLink(`#${fragment}`)).toEqual(room);
    });

    it('el link de una habitación amueblada no es enorme', async () => {
        let room = createRoom({ name: 'Living', width: 500, length: 400, height: 260 });
        room = { ...room, items: CATALOG.slice(0, 30).map((e) => createItem(e, room)) };
        expect((await encodeRoomForLink(room)).length).toBeLessThan(6000);
    });

    it('las fotos no viajan en el link, los temas sí', async () => {
        const base = createRoom({ name: 'Cuarto', width: 300, length: 300, height: 250 });
        const frame = createItem(CATALOG.find((e) => e.type === 'cuadro')!, base);
        const bed = createItem(CATALOG.find((e) => e.type === 'cama-simple')!, base);
        const room = {
            ...base,
            items: [
                { ...frame, texture: 'data:image/jpeg;base64,AAAA' },
                { ...bed, texture: 'tema:dinosaurios' },
            ],
        };

        const shared = await decodeRoomFromLink(`#${await encodeRoomForLink(room)}`);
        expect(shared?.items[0].texture).toBeUndefined();
        expect(shared?.items[1].texture).toBe('tema:dinosaurios');
    });

    it('sin diseño en el link devuelve null', async () => {
        expect(await decodeRoomFromLink('')).toBeNull();
        expect(await decodeRoomFromLink('#otra=cosa')).toBeNull();
    });

    it('un link cortado da un error legible', async () => {
        const fragment = await encodeRoomForLink(createRoom({ name: 'x', width: 300, length: 300, height: 250 }));
        await expect(decodeRoomFromLink(`#${fragment.slice(0, 20)}`)).rejects.toThrow('incompleto o dañado');
    });
});
