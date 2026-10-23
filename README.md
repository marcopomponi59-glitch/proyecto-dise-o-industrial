# Diseño de habitaciones

Editor para armar una habitación con las medidas que cargue la persona y amueblarla
(muebles, cuadros, TV, estanterías y objetos de pared), con vista en planta 2D y vista 3D.

## Qué hace

- **Habitación**: ancho, largo y alto en metros, color de paredes y piso. Se pueden tener varias.
  Una habitación nueva arranca, si se deja tildada la opción, con una ventana en la pared superior, otra
  en la derecha (si mide 3 m o más) y una lámpara de techo en el centro; se mueven o se quitan como cualquier objeto.
- **Catálogo** de unos 80 objetos: aberturas, dormitorio, living (varios sofás y sillones), cocina, comedor,
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
- **Estilos para cuadros, camas y alfombras**: temas dibujados por código (bloques pixelados, dinosaurios,
  espacio, arcoíris) o una foto propia, que se achica y queda guardada en el navegador.
- **Recorrer** (estilo juego de bloques): el mouse queda capturado y se mira moviéndolo, con una mira en el centro.
  W A S D camina, Espacio salta, Shift corre, Esc pausa. Hay gravedad y los muebles frenan; se sube a lo bajo saltando.
  Se sale afuera por las puertas y se camina por el terreno de bloques.
  - **Inventario** de 9 lugares (teclas 1-9 o la rueda); el primero es el **pico**. Lo elegido se ve en la mano.
  - **Romper**: manteniendo el clic izquierdo el bloque se agrieta en 10 etapas y salta en pedacitos con su
    textura; con el pico es mucho más rápido. Lo roto va al inventario (se apila de a 64). Un mueble con clic
    izquierdo se guarda entero en el inventario.
  - **Poner**: clic derecho pone el bloque elegido pegado a la cara que se mira (o sobre el piso), o el mueble
    elegido donde apunta la mira. Con el pico o la mano vacía, clic derecho agarra un mueble (R lo gira).
  - **Tirar**: Q tira uno de lo elegido; queda girando en el piso y se junta pasando cerca. Lo que quede tirado
    vuelve al inventario al salir del recorrido.
  - **Fabricar**: E abre las recetas básicas (madera → tablones, tablones → mesa de crafteo). Con la mesa de
    crafteo puesta, clic derecho sobre ella abre las de muebles (silla, mesa, cama, biblioteca, puerta,
    lámpara…) y ladrillos. Lo fabricado va al inventario.
  - **Animales** de cubos (vacas, ovejas, cerdos y gallinas) pasean por el terreno; con clic izquierdo se los
    empuja y salen corriendo un rato.
  - **Espadas** de madera y de piedra (se fabrican en la mesa) y **zombis** de cubos que persiguen al jugador
    afuera y le pegan; se los derrota a golpes (con la espada de piedra, en dos). Hay más de noche. El jugador
    tiene 10 corazones que se recuperan solos; si se queda sin vida, reaparece en la casa con su inventario.
    La casa es zona segura: los zombis no entran.
  - Bloques rotos y puestos e inventario se guardan con la habitación y se pueden deshacer. En pantallas
    táctiles se mira arrastrando y hay botones en pantalla.
- **Paisaje por las ventanas**: alrededor de la casa hay 60 m de paisaje de bloques al atardecer (cerezos, flores,
  sol cuadrado, bruma) o de día, o sólo cielo; se elige en las propiedades de la habitación.
- **Compartir**: arma un link con el diseño comprimido después del `#` (no pasa por el servidor). Quien lo abre
  recibe una copia en su navegador. Las fotos no viajan en el link; los temas sí.
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

## Publicación (Laravel Cloud)

La app pública corre en [Laravel Cloud](https://cloud.laravel.com), conectada al repo de Bitbucket: cada push a
`main` despliega solo. No usa base de datos, así que no hace falta agregar ninguna.

- **Build command**: `composer install --no-dev && npm ci && npm run build`
- **Deploy command**: vacío (sacar el `php artisan migrate --force` que Cloud pone por defecto).
- **Variables de entorno**: `APP_KEY` (se genera con `php artisan key:generate --show` y se pega en el
  panel, nunca en el repo), `APP_ENV=production`, `APP_DEBUG=false`, `APP_URL` con el dominio `*.laravel.cloud`,
  `SESSION_DRIVER=cookie`, `CACHE_STORE=file`, `QUEUE_CONNECTION=sync`.
- Detrás del balanceador de Cloud, `bootstrap/app.php` confía en el proxy (`trustProxies`) para que los
  archivos se sirvan por https.

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
| `resources/js/lib/room/world.ts` | Mundo de bloques como datos: generación, bloques visibles, rayo celda por celda |
| `resources/js/lib/room/landscape.ts` | Dibujo del paisaje (bloques, flores, nubes, cielo y sol) |
| `resources/js/lib/room/inventory.ts` | Inventario: lugares, pilas, tiempos de rotura |
| `resources/js/lib/room/pixels.ts` | Arte pixelado propio: texturas de bloques, pico, grietas |
| `resources/js/lib/room/recipes.ts` | Recetas de fabricar |
| `resources/js/lib/room/animals.ts` | Animales del paisaje: cuerpo, paseo, saltos y empujones |
| `resources/js/lib/room/zombies.ts` | Zombis: cuerpo, persecución, golpes y reaparición |
| `resources/js/lib/room/play.ts` | Efectos del recorrido: grietas, pedacitos y objetos tirados |
| `resources/js/lib/room/walk.ts` | Física del recorrido: gravedad, salto, choques con muebles, paredes, puertas y bloques |
| `resources/js/composables/useRoomEditor.ts` | Estado del editor, deshacer/rehacer y autoguardado |
| `resources/js/components/room/` | Plano 2D, vista 3D y paneles |
| `resources/js/pages/Editor.vue` | Página principal |
