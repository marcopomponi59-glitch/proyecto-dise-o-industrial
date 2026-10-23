import { describe, expect, it } from 'vitest';
import { CATALOG } from './catalog';
import { addStarterItems, createItem, createRoom, exportRoom, loadState, parseRoomFile, saveState, STORAGE_KEY } from './storage';

function memoryStorage(initial: Record<string, string> = {}): Storage {
    const data = new Map(Object.entries(initial));
    return {
        get length() {
            return data.size;
        },
        clear: () => data.clear(),
        getItem: (key) => data.get(key) ?? null,
        key: (index) => [...data.keys()][index] ?? null,
        removeItem: (key) => void data.delete(key),
        setItem: (key, value) => void data.set(key, value),
    };
}

const base = { name: 'Dormitorio', width: 400, length: 350, height: 260 };

describe('createItem', () => {
    it('pone los muebles de piso en el centro de la habitación', () => {
        const room = createRoom(base);
        const bed = createItem(CATALOG.find((e) => e.type === 'cama-doble')!, room);
        expect(bed).toMatchObject({ x: 200, y: 175, mount: 'floor', rotation: 0 });
    });

    it('cuelga lo de pared en la pared superior', () => {
        const room = createRoom(base);
        const tv = createItem(CATALOG.find((e) => e.type === 'tv')!, room);
        expect(tv).toMatchObject({ wall: 'top', x: 200, y: 3, elevation: 100 });
    });
});

describe('aberturas y techo', () => {
    it('la ventana queda centrada dentro del espesor de la pared', () => {
        const room = createRoom(base);
        const window = createItem(CATALOG.find((e) => e.type === 'ventana')!, room);
        expect(window).toMatchObject({ wall: 'top', x: 200, y: -5, elevation: 95 });
    });

    it('la lámpara de techo cuelga del techo y arranca prendida', () => {
        const room = createRoom(base);
        const lamp = createItem(CATALOG.find((e) => e.type === 'lampara-techo')!, room);
        expect(lamp).toMatchObject({ mount: 'ceiling', elevation: 200, lightOn: true });
    });
});

describe('addStarterItems', () => {
    it('agrega dos ventanas, una puerta y una lámpara de techo', () => {
        const room = addStarterItems(createRoom(base));
        expect(room.items.map((i) => [i.type, i.wall ?? i.mount])).toEqual([
            ['ventana', 'top'],
            ['ventana', 'right'],
            ['puerta', 'bottom'],
            ['lampara-techo', 'ceiling'],
        ]);
        expect(room.items[1]).toMatchObject({ x: 405, y: 175, rotation: 90 });
    });

    it('en una habitación angosta pone una sola ventana', () => {
        const room = addStarterItems(createRoom({ ...base, length: 250 }));
        expect(room.items.filter((i) => i.type === 'ventana')).toHaveLength(1);
    });
});

describe('bloques rotos', () => {
    it('se guardan con la habitación y descarta claves inválidas', () => {
        const room = {
            ...createRoom(base),
            world: {
                broken: ['3,0,-2', 'basura', '-1,2,5'],
                placed: [
                    ['1,1,1', 'log'],
                    ['2,1,1', 'oro'],
                ] as [string, never][],
            },
        };
        expect(parseRoomFile(exportRoom(room)).world).toEqual({ broken: ['3,0,-2', '-1,2,5'], placed: [['1,1,1', 'log']] });
    });
});

describe('exportar e importar', () => {
    it('ida y vuelta conserva la habitación', () => {
        const room = createRoom(base);
        room.items.push(createItem(CATALOG[0], room));
        expect(parseRoomFile(exportRoom(room))).toEqual(room);
    });

    it('rechaza archivos que no son JSON o no son de la aplicación', () => {
        expect(() => parseRoomFile('no es json')).toThrow('JSON válido');
        expect(() => parseRoomFile('{"hola":1}')).toThrow('no es un diseño');
    });

    it('rechaza una habitación sin medidas', () => {
        expect(() => parseRoomFile(JSON.stringify({ format: 'diseno-habitacion', version: 1, room: { name: 'x' } }))).toThrow('ancho, largo y alto');
    });

    it('completa datos faltantes o inválidos de los objetos', () => {
        const file = JSON.stringify({
            format: 'diseno-habitacion',
            version: 1,
            room: { ...base, items: [{ type: 'sofa', x: 100, y: 100, width: -5, color: 'rojo' }, 'basura'] },
        });
        const room = parseRoomFile(file);
        expect(room.items).toHaveLength(1);
        expect(room.items[0]).toMatchObject({ name: 'Sofá', shape: 'sofa', width: 200, color: '#ef5350' });
    });
});

describe('localStorage', () => {
    it('guarda y vuelve a leer', () => {
        const storage = memoryStorage();
        const room = createRoom(base);
        expect(saveState(storage, { rooms: [room], activeId: room.id })).toBe(true);
        expect(loadState(storage)).toEqual({ rooms: [room], activeId: room.id });
    });

    it('arranca vacío si lo guardado está roto', () => {
        expect(loadState(memoryStorage({ [STORAGE_KEY]: '{roto' }))).toEqual({ rooms: [], activeId: null });
    });

    it('descarta sólo las habitaciones dañadas', () => {
        const room = createRoom(base);
        const storage = memoryStorage({ [STORAGE_KEY]: JSON.stringify({ rooms: [room, { name: 'sin medidas' }], activeId: 'otro' }) });
        expect(loadState(storage)).toEqual({ rooms: [room], activeId: room.id });
    });

    it('avisa cuando el navegador no deja guardar', () => {
        const storage = memoryStorage();
        storage.setItem = () => {
            throw new Error('QuotaExceededError');
        };
        expect(saveState(storage, { rooms: [], activeId: null })).toBe(false);
    });
});
