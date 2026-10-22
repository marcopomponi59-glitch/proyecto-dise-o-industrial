# Diseño de habitaciones

Editor para armar una habitación con las medidas que cargue la persona y amueblarla
(muebles, cuadros, TV, estanterías y objetos de pared), con vista en planta 2D y vista 3D.

## Qué hace

- **Habitación**: ancho, largo y alto en metros, color de paredes y piso. Se pueden tener varias.
  Una habitación nueva arranca, si se deja tildada la opción, con una ventana en la pared superior, otra
  en la derecha (si mide 3 m o más) y una lámpara de techo en el centro; se mueven o se quitan como cualquier objeto.
- **Catálogo** de unos 65 objetos: aberturas, dormitorio, living (varios sofás y sillones), comedor,
  escritorio, guardado, pared, iluminación y decoración. Cada objeto trae medidas típicas y se le puede
  cambiar nombre, medidas, color (tela o madera, según el modelo), altura desde el piso y rotación.
- **Modelos 3D**: los muebles usan modelos del [Kenney Furniture Kit](https://kenney.nl/assets/furniture-kit)
  (CC0, `public/models/kenney/`), estirados a las medidas del objeto. Mientras cargan se ve una forma simple.
- **Ventanas y puertas**: van dentro del espesor de la pared (10 cm) y la agujerean en 3D. En la planta se
  dibujan el vidrio y el arco de apertura; avisa si un mueble no deja abrir la puerta o si algo colgado
  tapa una ventana.
- **Lámparas** de techo, pared, pie y mesa que iluminan la escena 3D; se prenden y apagan, y el botón
  *Noche* apaga la luz de día para ver sólo las lámparas. Lo de techo cuelga solo del techo.
- **Objetos de pared** (TV, cuadros, espejo, estantes, aire): se pegan solos a la pared más cercana
  mirando hacia adentro y se mueven a lo largo de ella.
- **Plano 2D**: arrastrar para mover, tirador para rotar (de a 15°, con Shift libre), cuadrícula de
  10/50 cm, ajuste configurable y cotas del objeto seleccionado a cada pared.
- **Vista 3D**: girar, acercar y arrastrar objetos (Shift + arrastrar: subir o bajar). Barra sobre el
  objeto seleccionado para rotar, subir, bajar, prender la luz, duplicar y quitar. Las paredes que tapan
  la vista se transparentan.
- **Avisos**: objetos que chocan, que se salen de la habitación o que superan el techo. Se tiene en
  cuenta la altura: la TV colgada sobre el mueble o la lámpara sobre la mesa de luz no chocan, y las
  alfombras no chocan con nada.
- **Guardado** automático en el navegador (`localStorage`), sin cuentas ni base de datos.
  Exportar e importar cada habitación como `.json`.
- **Deshacer y rehacer**.

### Atajos

| Tecla | Acción |
| --- | --- |
| Flechas (Shift: de a 10 cm) | Mover el objeto seleccionado 1 cm |
| `R` / `Shift+R` | Rotar 90° a la derecha / izquierda |
| `Supr` | Quitar el objeto |
| `Ctrl+D` | Duplicar |
| `Ctrl+Z` / `Ctrl+Shift+Z` o `Ctrl+Y` | Deshacer / rehacer |
| `Esc` | Deseleccionar |

## Stack

- Laravel 12 (PHP 8.2 o superior) con el starter kit oficial de Vue, sin la parte de usuarios
- Vue 3 + Inertia + TypeScript + Tailwind, compilado con Vite
- Three.js para la vista 3D (se carga recién al mostrarla)

## Puesta en marcha

```bash
composer install
npm install
cp .env.example .env
php artisan key:generate
composer run dev
```

`composer run dev` levanta el servidor de Laravel y Vite juntos. La app queda en http://127.0.0.1:8000.

El `.env.example` ya viene preparado para funcionar sin base de datos: sesión y caché en
archivos (`SESSION_DRIVER=file`, `CACHE_STORE=file`) y colas sincrónicas (`QUEUE_CONNECTION=sync`).

## Verificación

```bash
npm test            # cálculos de geometría y guardado (Vitest)
npm run typecheck   # vue-tsc
npm run lint
php artisan test    # la home responde con el editor
```

## Dónde está cada cosa

| Archivo | Qué tiene |
| --- | --- |
| `resources/js/lib/room/types.ts` | Modelo de habitación y objetos (todo en cm, convención de ejes y rotación) |
| `resources/js/lib/room/catalog.ts` | Catálogo de objetos con sus medidas por defecto |
| `resources/js/lib/room/geometry.ts` | Paredes, límites, choques y avisos |
| `resources/js/lib/room/storage.ts` | Crear, validar, exportar/importar y guardar en el navegador |
| `resources/js/lib/room/three-builders.ts` | Formas simples, paredes con huecos, luces |
| `resources/js/lib/room/models.ts` | Carga de los modelos GLB y ajuste a las medidas del objeto |
| `resources/js/composables/useRoomEditor.ts` | Estado del editor, deshacer/rehacer y autoguardado |
| `resources/js/components/room/` | Plano 2D, vista 3D y paneles |
| `resources/js/pages/Editor.vue` | Página principal |
