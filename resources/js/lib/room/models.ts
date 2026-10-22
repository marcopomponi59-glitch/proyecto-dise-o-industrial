import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { CatalogEntry } from './catalog';

const loader = new GLTFLoader();
const cache = new Map<string, Promise<THREE.Object3D>>();

/** Escena del modelo, cargada una sola vez por archivo. Lo que se agrega a la escena siempre es un clon. */
function loadModel(model: string): Promise<THREE.Object3D> {
    let pending = cache.get(model);
    if (!pending) {
        pending = loader.loadAsync(`/models/kenney/${model}.glb`).then((gltf) => gltf.scene);
        // Si falla (red, archivo faltante) se puede reintentar más tarde.
        pending.catch(() => cache.delete(model));
        cache.set(model, pending);
    }
    return pending;
}

/**
 * Copia del modelo ajustada a las medidas del objeto (en metros): centrada, con la base en y = 0,
 * el frente hacia +Z y estirada para ocupar exactamente ancho × alto × fondo.
 * Los materiales listados en `tint` se pintan con `color`.
 */
export async function buildModel(entry: CatalogEntry, size: THREE.Vector3, color: string): Promise<THREE.Object3D> {
    const source = await loadModel(entry.model!);
    const model = source.clone(true);

    const oriented = new THREE.Group();
    oriented.add(model);
    oriented.rotation.y = ((entry.modelRotation ?? 0) * Math.PI) / 180;
    oriented.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(oriented);
    const center = box.getCenter(new THREE.Vector3());
    const current = box.getSize(new THREE.Vector3());

    const fitted = new THREE.Group();
    fitted.add(oriented);
    oriented.position.set(-center.x, -box.min.y, -center.z);
    fitted.scale.set(size.x / Math.max(current.x, 1e-4), size.y / Math.max(current.y, 1e-4), size.z / Math.max(current.z, 1e-4));

    const tint = new Set(entry.tint ?? []);
    model.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) {
            return;
        }
        child.castShadow = entry.mount !== 'rug';
        child.userData.sharedGeometry = true;
        child.receiveShadow = true;
        // Cada objeto tiene sus propios materiales: los clones comparten los del archivo original.
        const materials = (Array.isArray(child.material) ? child.material : [child.material]).map((m: THREE.Material) => {
            const copy = m.clone() as THREE.MeshStandardMaterial;
            if (tint.has(copy.name)) {
                copy.color.set(color);
                // La parte pintable es también la que lleva el estampado (tema o foto).
                copy.userData.fabric = true;
            }
            if (copy.name === 'lamp') {
                copy.userData.lampShade = true;
            }
            return copy;
        });
        child.material = Array.isArray(child.material) ? materials : materials[0];
    });

    return fitted;
}
