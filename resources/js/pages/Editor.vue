<script setup lang="ts">
import CatalogPanel from '@/components/room/CatalogPanel.vue';
import NewRoomForm from '@/components/room/NewRoomForm.vue';
import Plan2D from '@/components/room/Plan2D.vue';
import PropertiesPanel from '@/components/room/PropertiesPanel.vue';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useRoomEditor, type ViewMode } from '@/composables/useRoomEditor';
import { decodeRoomFromLink, encodeRoomForLink, hasPhotos } from '@/lib/room/share';
import { parseRoomFile, type NewRoomData } from '@/lib/room/storage';
import { Head } from '@inertiajs/vue3';
import { useEventListener } from '@vueuse/core';
import { AlertTriangle, Check, Copy, Download, Info, Plus, Redo2, Share2, Trash2, Undo2, Upload, X } from 'lucide-vue-next';
import { computed, defineAsyncComponent, onMounted, ref } from 'vue';

// Three.js pesa: se descarga recién cuando se muestra la vista 3D.
const Room3D = defineAsyncComponent(() => import('@/components/room/Room3D.vue'));

const editor = useRoomEditor();
const { rooms, room, activeId, selectedId, issues, saveFailed, snapStep, viewMode, canUndo, canRedo } = editor;

const showNewRoom = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);
const errorMessage = ref<string | null>(null);
const notice = ref<string | null>(null);
const shareLink = ref<string | null>(null);
const copied = ref(false);

const views: { value: ViewMode; label: string }[] = [
    { value: '2d', label: '2D' },
    { value: 'split', label: '2D + 3D' },
    { value: '3d', label: '3D' },
];

const issueCount = computed(() => issues.value.size);

function createRoom(data: NewRoomData) {
    editor.createNewRoom(data);
    showNewRoom.value = false;
}

function confirmDelete() {
    if (room.value && window.confirm(`¿Eliminar "${room.value.name}"? Se borra de este navegador y no se puede deshacer.`)) {
        editor.deleteRoom(room.value.id);
    }
}

async function importFile(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
        return;
    }
    try {
        editor.importRoom(parseRoomFile(await file.text()));
        errorMessage.value = null;
    } catch (error) {
        errorMessage.value = error instanceof Error ? error.message : 'No se pudo importar el archivo.';
    }
}

async function openShare() {
    if (!room.value) {
        return;
    }
    copied.value = false;
    const fragment = await encodeRoomForLink(room.value);
    shareLink.value = `${window.location.origin}${window.location.pathname}#${fragment}`;
}

async function copyShareLink(input: HTMLInputElement | null) {
    if (!shareLink.value) {
        return;
    }
    try {
        await navigator.clipboard.writeText(shareLink.value);
        copied.value = true;
    } catch {
        // Sin acceso al portapapeles (sitio sin https): se deja el link seleccionado para copiarlo a mano.
        input?.select();
    }
}

/** Si la página se abrió con un link compartido, guarda una copia del diseño y limpia el link. */
onMounted(async () => {
    try {
        const shared = await decodeRoomFromLink(window.location.hash);
        if (!shared) {
            return;
        }
        const result = editor.openSharedRoom(shared);
        notice.value =
            result === 'added'
                ? `Te compartieron "${shared.name}". Se guardó una copia en este navegador: los cambios que hagas no le llegan a quien te la mandó.`
                : `"${shared.name}" ya estaba guardada en este navegador; se abrió la que tenías.`;
    } catch (error) {
        errorMessage.value = error instanceof Error ? error.message : 'No se pudo abrir el diseño compartido.';
    } finally {
        if (window.location.hash) {
            history.replaceState(null, '', window.location.pathname + window.location.search);
        }
    }
});

function isTyping(target: EventTarget | null): boolean {
    return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName));
}

useEventListener(window, 'keydown', (event: KeyboardEvent) => {
    if (isTyping(event.target) || !room.value) {
        return;
    }
    const mod = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();

    if (mod && key === 'z') {
        event.preventDefault();
        if (event.shiftKey) {
            editor.redo();
        } else {
            editor.undo();
        }
        return;
    }
    if (mod && key === 'y') {
        event.preventDefault();
        editor.redo();
        return;
    }

    const id = selectedId.value;
    if (!id) {
        return;
    }
    const step = event.shiftKey ? 10 : 1;
    const moves: Record<string, [number, number]> = { arrowleft: [-step, 0], arrowright: [step, 0], arrowup: [0, -step], arrowdown: [0, step] };

    if (key in moves) {
        event.preventDefault();
        editor.nudgeItem(id, ...moves[key]);
    } else if (key === 'delete' || key === 'backspace') {
        event.preventDefault();
        editor.removeItem(id);
    } else if (key === 'escape') {
        editor.selectItem(null);
    } else if (key === 'r' && !mod) {
        editor.rotateItem(id, event.shiftKey ? -90 : 90);
    } else if (mod && key === 'd') {
        event.preventDefault();
        editor.duplicateItem(id);
    }
});
</script>

<template>
    <Head title="Editor" />

    <div class="flex h-dvh flex-col bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
        <!-- Barra superior -->
        <header class="flex flex-wrap items-center gap-2 border-b bg-white px-3 py-2 dark:bg-neutral-900">
            <h1 class="mr-2 text-base font-semibold">Diseño de habitaciones</h1>

            <template v-if="room">
                <select
                    :value="activeId ?? undefined"
                    aria-label="Habitación"
                    class="h-8 max-w-48 rounded-md border border-input bg-background px-2 text-sm"
                    @change="editor.selectRoom(($event.target as HTMLSelectElement).value)"
                >
                    <option v-for="r in rooms" :key="r.id" :value="r.id">{{ r.name }}</option>
                </select>
                <Button variant="outline" size="sm" @click="showNewRoom = true"><Plus /> Nueva</Button>
                <Button variant="outline" size="sm" title="Abrir un diseño exportado" @click="fileInput?.click()"><Upload /> Importar</Button>
                <Button variant="outline" size="sm" title="Descargar este diseño como archivo" @click="editor.downloadActiveRoom()"
                    ><Download /> Exportar</Button
                >
                <Button variant="outline" size="sm" title="Armar un link para mandarle este diseño a otra persona" @click="openShare"
                    ><Share2 /> Compartir</Button
                >
                <Button variant="ghost" size="sm" title="Eliminar esta habitación" @click="confirmDelete"><Trash2 /></Button>

                <div class="mx-1 h-6 w-px bg-neutral-200 dark:bg-neutral-700" />

                <Button variant="ghost" size="sm" :disabled="!canUndo" title="Deshacer (Ctrl+Z)" @click="editor.undo()"><Undo2 /></Button>
                <Button variant="ghost" size="sm" :disabled="!canRedo" title="Rehacer (Ctrl+Shift+Z)" @click="editor.redo()"><Redo2 /></Button>

                <div class="ml-auto flex items-center gap-2">
                    <label class="flex items-center gap-1 text-xs text-neutral-600 dark:text-neutral-400">
                        Ajuste
                        <select v-model.number="snapStep" class="h-8 rounded-md border border-input bg-background px-1 text-sm">
                            <option :value="0">libre</option>
                            <option :value="1">1 cm</option>
                            <option :value="5">5 cm</option>
                            <option :value="10">10 cm</option>
                        </select>
                    </label>
                    <div class="inline-flex rounded-md border bg-neutral-100 p-0.5 dark:bg-neutral-800" role="group" aria-label="Vista">
                        <button
                            v-for="view in views"
                            :key="view.value"
                            type="button"
                            :aria-pressed="viewMode === view.value"
                            :class="[
                                'rounded px-2.5 py-1 text-xs font-medium',
                                viewMode === view.value
                                    ? 'bg-white shadow-sm dark:bg-neutral-700'
                                    : 'text-neutral-600 hover:text-neutral-900 dark:text-neutral-400',
                            ]"
                            @click="viewMode = view.value"
                        >
                            {{ view.label }}
                        </button>
                    </div>
                </div>
            </template>
            <input ref="fileInput" type="file" accept="application/json,.json" class="hidden" @change="importFile" />
        </header>

        <div
            v-if="notice"
            class="flex items-center gap-2 border-b border-blue-200 bg-blue-50 px-3 py-1.5 text-sm text-blue-800 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200"
        >
            <Info class="h-4 w-4 shrink-0" />
            <span class="flex-1">{{ notice }}</span>
            <button type="button" class="rounded p-0.5 hover:bg-blue-100 dark:hover:bg-blue-900" title="Cerrar" @click="notice = null">
                <X class="h-4 w-4" />
            </button>
        </div>
        <div
            v-if="errorMessage || saveFailed"
            class="flex items-center gap-2 border-b border-red-200 bg-red-50 px-3 py-1.5 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
        >
            <AlertTriangle class="h-4 w-4 shrink-0" />
            <span class="flex-1">{{
                errorMessage ?? 'El navegador no deja guardar los cambios (¿modo privado o sin espacio?). Exportá el diseño para no perderlo.'
            }}</span>
            <button
                v-if="errorMessage"
                type="button"
                class="rounded p-0.5 hover:bg-red-100 dark:hover:bg-red-900"
                title="Cerrar"
                @click="errorMessage = null"
            >
                <X class="h-4 w-4" />
            </button>
        </div>

        <!-- Sin habitaciones todavía -->
        <main v-if="!room" class="flex flex-1 items-center justify-center overflow-y-auto p-4">
            <div class="w-full max-w-md rounded-xl border bg-white p-6 shadow-sm dark:bg-neutral-900">
                <h2 class="text-lg font-semibold">Creá tu habitación</h2>
                <p class="mb-4 text-sm text-neutral-500">Cargá las medidas y después la amueblás como quieras, en planta y en 3D.</p>
                <NewRoomForm @create="createRoom" />
                <button
                    type="button"
                    class="mt-3 w-full text-center text-sm text-neutral-500 underline-offset-2 hover:underline"
                    @click="fileInput?.click()"
                >
                    o importá un diseño guardado
                </button>
            </div>
        </main>

        <!-- Editor -->
        <div v-else class="flex min-h-0 flex-1 flex-col lg:flex-row">
            <aside
                class="flex max-h-56 min-h-0 shrink-0 flex-col border-b bg-white dark:bg-neutral-900 lg:max-h-none lg:w-56 lg:border-b-0 lg:border-r"
            >
                <CatalogPanel />
            </aside>

            <main
                :class="[
                    'grid min-h-[60vh] flex-1 gap-px bg-neutral-200 dark:bg-neutral-800 lg:min-h-0',
                    viewMode === 'split' ? 'grid-rows-2 xl:grid-cols-2 xl:grid-rows-1' : '',
                ]"
            >
                <section
                    v-if="viewMode !== '3d'"
                    class="relative min-h-0 bg-neutral-100 p-2 text-neutral-500 dark:bg-neutral-900"
                    aria-label="Plano 2D"
                >
                    <Plan2D :room="room" />
                    <span
                        class="pointer-events-none absolute left-2 top-2 rounded bg-white/80 px-1.5 py-0.5 text-[11px] font-medium dark:bg-neutral-800/80"
                        >Planta</span
                    >
                </section>
                <section
                    v-if="viewMode !== '2d'"
                    class="relative min-h-0 bg-gradient-to-b from-sky-100 to-neutral-100 dark:from-neutral-800 dark:to-neutral-900"
                    aria-label="Vista 3D"
                >
                    <Room3D :room="room" />
                </section>
            </main>

            <aside class="flex min-h-0 shrink-0 flex-col border-t bg-white dark:bg-neutral-900 lg:w-72 lg:border-l lg:border-t-0">
                <PropertiesPanel />
                <p v-if="issueCount > 0" class="flex items-center gap-1 border-t px-3 py-2 text-xs text-red-600">
                    <AlertTriangle class="h-3.5 w-3.5" /> {{ issueCount === 1 ? '1 objeto tiene' : `${issueCount} objetos tienen` }} problemas de
                    ubicación.
                </p>
            </aside>
        </div>

        <Dialog :open="shareLink !== null" @update:open="(open: boolean) => !open && (shareLink = null)">
            <DialogContent class="max-w-lg">
                <DialogHeader>
                    <DialogTitle>Compartir "{{ room?.name }}"</DialogTitle>
                    <DialogDescription>
                        Quien abra este link recibe una copia del diseño tal como está ahora. Si después cambiás algo, volvé a compartirlo.
                    </DialogDescription>
                </DialogHeader>
                <div class="flex gap-2">
                    <input
                        ref="shareInput"
                        :value="shareLink ?? ''"
                        readonly
                        aria-label="Link para compartir"
                        class="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-2 font-mono text-xs"
                        @focus="($event.target as HTMLInputElement).select()"
                    />
                    <Button type="button" @click="copyShareLink($refs.shareInput as HTMLInputElement)">
                        <Check v-if="copied" />
                        <Copy v-else />
                        {{ copied ? 'Copiado' : 'Copiar' }}
                    </Button>
                </div>
                <p v-if="room && hasPhotos(room)" class="text-xs text-amber-600">
                    Las fotos que subiste no viajan en el link (pesan demasiado): quien lo abra ve esos objetos lisos. Los temas sí viajan.
                </p>
                <p class="text-xs text-neutral-500">
                    El diseño viaja dentro del link: no se sube a ningún servidor. Para que otra persona pueda abrirlo, la aplicación tiene que estar
                    publicada en una dirección a la que esa persona llegue.
                </p>
            </DialogContent>
        </Dialog>

        <Dialog v-model:open="showNewRoom">
            <DialogContent class="max-w-md">
                <DialogHeader>
                    <DialogTitle>Nueva habitación</DialogTitle>
                    <DialogDescription>Cargá las medidas interiores.</DialogDescription>
                </DialogHeader>
                <NewRoomForm @create="createRoom" />
            </DialogContent>
        </Dialog>
    </div>
</template>
