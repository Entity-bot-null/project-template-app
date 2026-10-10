# Manual

English version: [MANUAL.md](MANUAL.md). Las dos versiones dicen lo mismo; un cambio en una se hace
también en la otra, en el mismo pull request.

Cómo funciona esta plantilla y todos los comandos que trae. Explica; para saber **qué hacer a
continuación**, en orden, sigue la guía paso a paso: [STEP_BY_STEP.es.md](STEP_BY_STEP.es.md) (en
inglés: [STEP_BY_STEP.md](STEP_BY_STEP.md)). Las demás páginas de `docs/` contienen los detalles.

Convenciones: los comandos se ejecutan desde la raíz del proyecto; en Windows, en Git Bash. Lo que
va entre `<ángulos>` es un valor que sustituyes. **REQUIERE CONFIGURACIÓN** marca lo que solo tu
proyecto puede decidir o aportar.

## Contenido

1. [Qué es la plantilla](#1-qué-es-la-plantilla)
2. [Herramientas](#2-herramientas)
3. [Cómo está organizado el proyecto](#3-cómo-está-organizado-el-proyecto)
4. [Ejecutar la app](#4-ejecutar-la-app)
5. [Desarrollo diario](#5-desarrollo-diario)
6. [Tests](#6-tests)
7. [Commits, pushes y pull requests](#7-commits-pushes-y-pull-requests)
8. [Configuración](#8-configuración)
9. [Referencia de comandos](#9-referencia-de-comandos)
10. [CI/CD](#10-cicd)
11. [Builds, tiendas y actualizaciones OTA](#11-builds-tiendas-y-actualizaciones-ota)
12. [Monitorizar una app publicada](#12-monitorizar-una-app-publicada)
13. [Calendario de mantenimiento](#13-calendario-de-mantenimiento)
14. [Cuando algo falla](#14-cuando-algo-falla)
15. [Apéndice](#15-apéndice)

## 1. Qué es la plantilla

Una app React Native para Android e iOS hecha con Expo (SDK 57), lista para publicarse en las
tiendas: TypeScript estricto, navegación basada en ficheros con grupos de rutas protegidos, un
cliente de API tipado generado a partir de un contrato OpenAPI, una sesión segura (el refresh token
en el Keychain/Keystore), detección de la falta de conexión, un sistema de diseño con temas claro y
oscuro, reporte de errores, analítica con consentimiento, feature flags, la infraestructura de las
notificaciones push, tests unitarios, de integración y end-to-end, y CI/CD con EAS para los builds,
los envíos a las tiendas y las actualizaciones over-the-air.

Contiene una **funcionalidad de ejemplo** (inicio de sesión, una lista paginada de elementos con
búsqueda, el detalle de un elemento, la creación de elementos, ajustes) que recorre todas las capas.
Construye tus funcionalidades junto a ella y bórrala cuando existan las tuyas
([STEP_BY_STEP.es.md](STEP_BY_STEP.es.md#fase-6-hazla-tuya)).

Lo que no incluye a propósito, y por qué: [adr/0001-stack.md](adr/0001-stack.md) y
[SECURITY.md](../SECURITY.md#advanced-device-controls).

## 2. Herramientas

| Herramienta    | Versión                                              | Para qué                                |
| -------------- | ---------------------------------------------------- | --------------------------------------- |
| Node.js        | 24.15+ (`.nvmrc`)                                    | todo lo de JavaScript                   |
| pnpm           | 12.5.1 (`packageManager`; `corepack enable`)         | dependencias y scripts                  |
| Git            | actual                                               | control de versiones; los hooks         |
| Android Studio | actual, con el Android SDK, un emulador y **JDK 17** | builds de Android y el emulador         |
| Xcode          | la versión que pide el SDK de Expo (solo macOS)      | builds de iOS y el simulador            |
| EAS CLI        | `npm install -g eas-cli` (o `pnpm dlx eas-cli`)      | builds, credenciales, actualizaciones   |
| Maestro        | 2.10 (la versión que fija CI)                        | flujos end-to-end                       |
| Docker         | actual                                               | solo `pnpm sast`, `pnpm lint:workflows` |
| GitHub CLI     | actual                                               | ajustes del repositorio, workflows      |

Windows: los builds nativos de Android necesitan además, en esa máquina, una ruta de proyecto corta,
las rutas largas de Windows y un `node_modules` hoisted ([TESTING.md](TESTING.md#end-to-end)); WSL 2
o los builds de EAS lo evitan.

## 3. Cómo está organizado el proyecto

```
src/app/         rutas (Expo Router): layouts, guards, pantallas ligeras
src/features/    áreas del producto: pantallas y sus hooks de datos (auth, items, settings, onboarding, account)
src/api/         cliente HTTP, tipos generados del contrato, desempaquetado de respuestas
src/auth/        la sesión: tokens, restauración, renovación, cierre de sesión
src/config/      la configuración pública validada (EXPO_PUBLIC_*)
src/lib/         errores, observabilidad, almacenamiento, query, enlaces, notificaciones, permisos, analítica, flags
src/store/       estado del cliente (Zustand)
src/ui/          sistema de diseño: tokens, tema, componentes
openapi/         el contrato de la API    scripts/   API mock y comprobaciones
.maestro/        flujos end-to-end        .github/   CI/CD
app.config.ts    identidad, variantes de build, configuración nativa
eas.json         perfiles de build y envío a las tiendas
```

Las reglas entre estas carpetas (las hace cumplir ESLint) y sus motivos:
[MOBILE_ARCHITECTURE.md](MOBILE_ARCHITECTURE.md).

**El código nativo es generado.** `expo prebuild` produce `android/` e `ios/` a partir de
`app.config.ts`; nunca se hace commit de ellos ni se editan a mano.

**Variantes de build.** Un solo código, cuatro variantes (`APP_VARIANT`): `development`, `preview`,
`e2e`, `production`, cada una con su propio identificador de aplicación y su propio esquema de URL,
para que se instalen una junto a otra ([RELEASES.md](RELEASES.md#build-variants-and-profiles)).

## 4. Ejecutar la app

La app se ejecuta como **development build** (el binario de tu propia app con herramientas para
desarrolladores), no en Expo Go.

| Objetivo                                         | Comandos                                                                                                                              |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| La primera vez en Android                        | `pnpm install`, `cp .env.example .env`, `pnpm mock:api` (terminal 1), `adb reverse tcp:4010 tcp:4010`, `pnpm android` (terminal 2)    |
| La primera vez en iOS (macOS)                    | lo mismo con `pnpm ios` (el simulador llega a `localhost` directamente)                                                               |
| Los demás días                                   | `pnpm mock:api` y `pnpm start`, y después abre la app instalada                                                                       |
| Después de un cambio nativo                      | `pnpm android` / `pnpm ios` otra vez (vuelve a compilar el binario)                                                                   |
| Un development build sin Android Studio ni Xcode | `eas build --profile development --platform android` (o `development-simulator` para el simulador de iOS) e instálalo desde el enlace |

La API mock (`scripts/mock-api.mjs`) implementa el contrato en memoria: las cuentas
`member@example.com` / `member-password` y `admin@example.com` / `admin-password`, 45 elementos de
ejemplo. `MOCK_ACCESS_TTL_SEC=20 pnpm mock:api` hace que los tokens caduquen enseguida (verás cómo
se renueva la sesión); `MOCK_LATENCY_MS=1500` ralentiza todas las respuestas (verás los estados de
carga).

Con la app en marcha: `r` en la terminal de `pnpm start` recarga, `j` abre React Native DevTools, `m`
abre el menú de desarrollador en el dispositivo.

## 5. Desarrollo diario

1. `git switch main && git pull`, y después `pnpm install` si cambió el lockfile.
2. Una rama: `git switch -c feat/<descripción>` (tipos: `feat`, `fix`, `chore`, `docs`,
   `refactor`, `test`, `ci`, `build`, `perf`, `hotfix`, `release`).
3. El cambio, siguiendo la receta de
   [MOBILE_ARCHITECTURE.md](MOBILE_ARCHITECTURE.md#adding-a-feature): contrato → hooks de datos →
   pantalla → ruta → tests.
4. Cambios en el contrato de la API: edita `openapi/openapi.json`, ejecuta `pnpm contract` y haz
   commit de los dos ficheros ([openapi/README.md](../openapi/README.md)).
5. Una dependencia: `pnpm exec expo install <paquete>` (nunca `pnpm add` para nada que toque código
   nativo); explícala en el pull request
   ([CONTRIBUTING.md](../CONTRIBUTING.md#adding-a-dependency)).
6. Antes de hacer push: `pnpm verify`.

## 6. Tests

| Tipo                                      | Comando                                                                                          | Dónde                                   |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------- |
| Unitarios, de componentes, de integración | `pnpm test`                                                                                      | `src/**/*.spec.ts(x)`, `*.int.spec.tsx` |
| Con cobertura y umbrales                  | `pnpm test:coverage`                                                                             | informe en `coverage/index.html`        |
| Modo watch                                | `pnpm test:watch`                                                                                |                                         |
| Una carpeta o un test                     | `pnpm test src/features/items`, `pnpm test -t "<nombre>"`                                        |                                         |
| End-to-end en un dispositivo              | `pnpm test:e2e` (con un build de release de la variante `e2e` instalado y la API mock en marcha) | `.maestro/flows/`                       |

Cómo escribirlos y los helpers: [TESTING.md](TESTING.md).

## 7. Commits, pushes y pull requests

- Los mensajes de commit y los títulos de los pull requests siguen Conventional Commits:
  `feat(items): share an item` ([CONTRIBUTING.md](../CONTRIBUTING.md#commits)).
- Hooks: `pre-commit` (ficheros en stage: ningún `.env`, escaneo de secretos, lint con arreglos,
  formato), `commit-msg` (commitlint), `pre-push` (ningún push a `main`, nombre de la rama,
  `pnpm typecheck`, `pnpm test`).
- Los pull requests usan la plantilla: qué y por qué, cómo se probó en dispositivos, capturas de
  pantalla, el impacto en la release (actualización OTA o build nuevo para las tiendas) y la
  Definition of Done.
- Haz merge con **Squash and merge** cuando **CI passed** esté en verde y un revisor lo haya
  aprobado.

## 8. Configuración

| Dónde                                      | Qué                                                                                                                                         | En git    |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| `app.config.ts` → `APP`                    | nombre, slug, identificador, esquema de URL, id y propietario del proyecto de EAS, dominio de los enlaces, colores (REQUIERE CONFIGURACIÓN) | sí        |
| `.env`                                     | configuración pública local (`EXPO_PUBLIC_*`)                                                                                               | nunca     |
| `.env.example`                             | documentación de todas las variables                                                                                                        | sí        |
| `eas.json`                                 | perfiles de build: variante, entorno, canal, distribución; envío                                                                            | sí        |
| Variables de entorno de EAS                | por entorno: URL de la API, DSN de Sentry, `SENTRY_*` (en tiempo de build)                                                                  | en EAS    |
| Entornos de GitHub `preview`, `production` | `EXPO_TOKEN`, `SENTRY_AUTH_TOKEN`                                                                                                           | en GitHub |

Todos los valores `EXPO_PUBLIC_*` se compilan dentro de la app y cualquiera puede leerlos: nunca un
secreto. `src/config/env.schema.ts` los valida cuando se evalúa la configuración de la app (un valor
incorrecto hace fallar el build) y al arrancar. La tabla completa:
[RELEASES.md](RELEASES.md#environment-variables).

## 9. Referencia de comandos

| Comando                                      | Qué hace                                                                                                                                                                |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install`                               | dependencias; instala los hooks de Git y genera los tipos de Expo (`prepare`)                                                                                           |
| `pnpm start`                                 | servidor de desarrollo Metro para un development build instalado                                                                                                        |
| `pnpm android` / `pnpm ios`                  | compila, instala y ejecuta un development build en local                                                                                                                |
| `pnpm prebuild`                              | regenera `android/` e `ios/`                                                                                                                                            |
| `pnpm mock:api`                              | la API mock en `127.0.0.1:4010`                                                                                                                                         |
| `pnpm types:generate`                        | los tipos generados de Expo (`expo-env.d.ts`, rutas tipadas)                                                                                                            |
| `pnpm lint` / `pnpm lint:fix`                | ESLint, cero warnings                                                                                                                                                   |
| `pnpm format` / `pnpm format:check`          | Prettier                                                                                                                                                                |
| `pnpm typecheck`                             | desviaciones del contrato, tipos generados, `tsc`                                                                                                                       |
| `pnpm test` / `test:watch` / `test:coverage` | Jest                                                                                                                                                                    |
| `pnpm test:e2e`                              | flujos de Maestro                                                                                                                                                       |
| `pnpm test:scripts`                          | los tests de los scripts del repositorio (`scripts/*.test.mjs`: el motor de Doberman, la política de dependencias, las imágenes de herramientas)                        |
| `pnpm expo:doctor`                           | expo-doctor, todas las comprobaciones; las versiones de las dependencias contra el manifiesto del SDK instalado (el lockfile), no contra los últimos parches publicados |
| `pnpm security`                              | `pnpm audit` (high), política de dependencias y licencias, escaneo de secretos                                                                                          |
| `pnpm deps:check` / `pnpm secrets:scan`      | las dos políticas por separado                                                                                                                                          |
| `pnpm sast`                                  | Semgrep (Docker)                                                                                                                                                        |
| `pnpm lint:workflows`                        | actionlint, zizmor, shellcheck (Docker)                                                                                                                                 |
| `pnpm contract`                              | regenera `src/api/schema.d.ts` a partir de `openapi/openapi.json`                                                                                                       |
| `pnpm export`                                | bundles de JavaScript de producción de las dos plataformas en `dist/`                                                                                                   |
| `pnpm bundle:check` / `pnpm build:check`     | presupuesto del bundle; export + presupuesto                                                                                                                            |
| `pnpm sbom:generate`                         | SBOM CycloneDX de las dependencias de producción                                                                                                                        |
| `pnpm verify`                                | formato, lint, typecheck, cobertura, expo-doctor, seguridad, comprobación del build                                                                                     |

EAS (CLI global, `eas <comando>`): `login`, `init`, `build`, `build:list`, `submit`, `update`,
`update:list`, `update:edit`, `update:republish`, `update:roll-back-to-embedded`, `channel:list`,
`channel:protect`, `credentials`, `env:create`, `env:list`, `device:create`, `fingerprint:compare`.

## 10. CI/CD

| Workflow      | Cuándo                                       | Hace                                                                                                                                             |
| ------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| CI            | en cada pull request y en cada push a `main` | convenciones, todos los gates (formato, lint, tipos, doctor, SAST, tests, seguridad, bundle, prebuild); un solo check obligatorio: **CI passed** |
| E2E (Android) | pull requests y pushes que tocan la app      | APK de release de la variante `e2e`, API mock, emulador, Maestro                                                                                 |
| Release       | push a `main`                                | el pull request de release; al mergearlo, el tag y la GitHub release con el SBOM                                                                 |
| EAS build     | a mano, desde `main`                         | los gates, y después un build de EAS de `preview` o `production` (envío opcional a pruebas internas)                                             |
| EAS update    | a mano, desde `main`                         | los gates, y después una actualización OTA a `preview` o `production`, opcionalmente escalonada                                                  |
| EAS rollback  | a mano, desde `main`                         | vuelve a publicar una actualización anterior o vuelve al bundle embebido                                                                         |
| CodeQL        | si se activa                                 | análisis de seguridad                                                                                                                            |

Ningún pull request puede compilar, firmar, enviar a las tiendas ni publicar:
[CI_CD.md](CI_CD.md#what-protects-production).

## 11. Builds, tiendas y actualizaciones OTA

- **Versiones:** `package.json` guarda la versión que ven los usuarios (la sube release-please); EAS
  incrementa los números de build de los builds de producción.
- **Builds:** los development builds los hace cada desarrollador; los de `preview` y `production`,
  el workflow EAS build a partir de un commit de `main` (los de producción, de un tag de release).
- **Tiendas:** los builds de producción van al track interno de Google Play (como borrador) y a
  TestFlight; la publicación para el público se hace en Play Console y App Store Connect, con un
  lanzamiento escalonado o progresivo.
- **Actualizaciones OTA:** el JavaScript y los assets llegan a los builds instalados con la misma
  runtime version (el fingerprint nativo) sin pasar por las tiendas; los cambios nativos siempre
  necesitan un build nuevo.
- **Rollback:** una actualización OTA se revierte volviendo a publicar una anterior o volviendo al
  bundle embebido; una release en las tiendas se detiene en la propia tienda y se corrige con una
  actualización o un build nuevo.

Todo en detalle: [RELEASES.md](RELEASES.md).

## 12. Monitorizar una app publicada

- **Sentry** (cuando `EXPO_PUBLIC_SENTRY_DSN` está definida): crashes y errores con la release, el
  build, el id de la actualización y el canal; los source maps los suben los builds y el workflow
  EAS update.
- **Las tiendas:** Play Console → Android vitals (crashes, ANRs); App Store Connect / Xcode
  Organizer (crashes, energía, bloqueos); valoraciones y reseñas.
- **EAS:** `eas update:insights`, `eas channel:insights` (adopción y tasa de crashes por
  actualización).
- **Settings → About** en la app muestra la versión, el build y la actualización que usa un
  usuario: pide esa información en los reportes de bugs.

## 13. Calendario de mantenimiento

| Cuándo                              | Qué                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cada semana                         | Aprueba los pull requests de Dependabot: las actualizaciones patch y minor se mergean solas cuando el CI está en verde; las majors y las de workflows las mergeas a mano ([CI_CD.md](CI_CD.md#dependency-updates)).                                                                                                                                                                                                                                  |
| Cada release                        | Build de preview, prueba en dispositivos, build de producción, pruebas internas, lanzamiento escalonado en las tiendas.                                                                                                                                                                                                                                                                                                                              |
| Cada SDK de Expo (unos tres al año) | Actualiza un SDK cada vez ([RELEASES.md](RELEASES.md#expo-sdk-upgrades)).                                                                                                                                                                                                                                                                                                                                                                            |
| Cada trimestre                      | Revisa las excepciones de auditoría (`audit.ignore`) y los `overrides` de seguridad de `pnpm-workspace.yaml` (quita un override cuando `pnpm why <paquete>` muestre una versión corregida sin él); las versiones fijadas de EAS CLI, Maestro y Node; las credenciales que caducan (el certificado de distribución de Apple dura un año: renuévalo con `eas credentials` antes de que caduque, o fallará el build de iOS del workflow de producción). |
| Antes de los plazos de las tiendas  | El requisito de target API level de Google Play (cada agosto) y el requisito de versión mínima de Xcode/SDK de Apple (cada primavera): los builds hechos con un SDK nuevo los cumplen.                                                                                                                                                                                                                                                               |

## 14. Cuando algo falla

El README tiene una tabla de problemas y soluciones ([README.md](../README.md#troubleshooting)); lo
específico de los tests end-to-end está en [TESTING.md](TESTING.md#end-to-end). Los más habituales:

| Mensaje                                                                          | Arreglo                                                                                   |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| "You seem to be offline" en el emulador de Android                               | `adb reverse tcp:4010 tcp:4010`                                                           |
| `Invalid app configuration: EXPO_PUBLIC_API_URL…`                                | defínela (`.env` en local, el entorno de EAS para los builds); HTTPS fuera de localhost   |
| `pnpm expo:doctor` informa de versiones                                          | `EXPO_OFFLINE=1 pnpm exec expo install --fix` (las versiones que espera el SDK instalado) |
| `ERR_PNPM_NO_MATURE_MATCHING_VERSION`                                            | una release con menos de siete días: usa la anterior o espera                             |
| Build de Android: "A restricted method in java.lang.System has been called"      | JDK 17                                                                                    |
| Build de Android en Windows: `CMAKE_OBJECT_PATH_MAX` o "build.ninja still dirty" | ruta corta y `node_modules` hoisted, o WSL 2 / EAS                                        |
| No hay proyecto de EAS                                                           | `eas init`, y después `APP.easProjectId` y `APP.owner` en `app.config.ts`                 |

## 15. Apéndice

### 15.1 Cuentas e identificadores

| Qué                           | Dónde                                                                                            |
| ----------------------------- | ------------------------------------------------------------------------------------------------ |
| Cuentas de la API mock        | `member@example.com` / `member-password`, `admin@example.com` / `admin-password` (solo en local) |
| Identificadores de aplicación | `APP.identifier` + `.dev`, `.preview`, `.e2e`, o nada para producción                            |
| Esquemas de URL               | `APP.scheme` + `-dev`, `-preview`, `-e2e`, o nada                                                |
| Puertos                       | `4010` API mock, `8081` Metro                                                                    |

### 15.2 Los demás documentos

| Documento                                                                                                                                         | Para                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| [STEP_BY_STEP.es.md](STEP_BY_STEP.es.md)                                                                                                          | qué hacer, en orden, desde cero hasta las tiendas                |
| [MOBILE_ARCHITECTURE.md](MOBILE_ARCHITECTURE.md)                                                                                                  | cómo está organizado el código y por qué                         |
| [TESTING.md](TESTING.md), [PERFORMANCE.md](PERFORMANCE.md)                                                                                        | tests; rendimiento y el presupuesto del bundle                   |
| [RELEASES.md](RELEASES.md), [CI_CD.md](CI_CD.md)                                                                                                  | builds, tiendas, actualizaciones; workflows y ajustes            |
| [PRODUCTION_READINESS.md](PRODUCTION_READINESS.md), [STORE_COMPLIANCE.md](STORE_COMPLIANCE.md)                                                    | la checklist antes de publicar; lo que exigen las tiendas        |
| [ACCESSIBILITY.md](ACCESSIBILITY.md), [LOCALIZATION.md](LOCALIZATION.md)                                                                          | el gate de accesibilidad; traducir la app (opcional)             |
| [SECURITY.md](../SECURITY.md)                                                                                                                     | modelo de amenazas, MASVS, secretos, dependencias                |
| [ENGINEERING_STANDARDS.md](../ENGINEERING_STANDARDS.md), [DEFINITION_OF_DONE.md](../DEFINITION_OF_DONE.md), [CONTRIBUTING.md](../CONTRIBUTING.md) | las reglas; cuándo está terminado un cambio; el flujo de trabajo |
| [AGENTS.md](../AGENTS.md)                                                                                                                         | instrucciones para agentes de IA que escriben código             |
