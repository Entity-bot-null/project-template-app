# Manual

English version: [manual.md](manual.md). Las dos versiones dicen lo mismo; un cambio en una se hace
también en la otra, en el mismo pull request.

Cómo funciona esta plantilla y todos los comandos que trae. Explica; para saber **qué hacer a
continuación**, en orden, sigue la guía paso a paso: [step-by-step.es.md](step-by-step.es.md) (en
inglés: [step-by-step.md](step-by-step.md)). Las demás páginas de `docs/` contienen los detalles.

Convenciones: los comandos se ejecutan desde la raíz del proyecto; en Windows, en Git Bash. Lo que
va entre `<ángulos>` es un valor que sustituyes. **REQUIERE CONFIGURACIÓN** marca lo que solo tu
proyecto puede decidir o aportar.

## Contenido

1. [Qué es la plantilla](#1-qué-es-la-plantilla)
2. [Herramientas](#2-herramientas)
3. [Cómo está organizado el proyecto](#3-cómo-está-organizado-el-proyecto)
4. [Ejecutar la app](#4-ejecutar-la-app)
5. [Ejecutar la API](#5-ejecutar-la-api)
6. [Desarrollo diario](#6-desarrollo-diario)
7. [Tests](#7-tests)
8. [Commits, pushes y pull requests](#8-commits-pushes-y-pull-requests)
9. [Configuración](#9-configuración)
10. [Referencia de comandos](#10-referencia-de-comandos)
11. [CI/CD](#11-cicd)
12. [Builds, tiendas y actualizaciones OTA](#12-builds-tiendas-y-actualizaciones-ota)
13. [Monitorizar una app publicada](#13-monitorizar-una-app-publicada)
14. [Calendario de mantenimiento](#14-calendario-de-mantenimiento)
15. [Cuando algo falla](#15-cuando-algo-falla)
16. [Apéndice](#16-apéndice)

## 1. Qué es la plantilla

Una app React Native para Android e iOS hecha con Expo (SDK 57), lista para publicarse en las
tiendas, y la API HTTP con la que habla. La app: TypeScript estricto, navegación basada en ficheros
con grupos de rutas protegidos, un cliente de API tipado generado a partir del contrato OpenAPI de
la API, una sesión segura (el refresh token en el Keychain/Keystore), detección de la falta de
conexión, un sistema de diseño con temas claro y oscuro, reporte de errores, analítica con
consentimiento, feature flags, la infraestructura de las notificaciones push, tests unitarios, de
integración y end-to-end, y CI/CD con EAS para los builds, los envíos a las tiendas y las
actualizaciones over-the-air. La API (NestJS, PostgreSQL, Redis opcional, correo mediante un
outbox): cuentas con sesiones móviles, alta, recuperación de contraseña, invitaciones, borrado de
cuenta, los elementos de ejemplo, una versión mínima de la app, límites de intentos que distinguen a
las personas detrás de una misma dirección del operador, observabilidad, y sus propios tests
unitarios y de integración.

Contiene una **funcionalidad de ejemplo** (inicio de sesión, una lista paginada de elementos con
búsqueda, el detalle de un elemento, la creación de elementos, ajustes) que recorre todas las capas,
en la app y en la API.
Construye tus funcionalidades junto a ella y bórrala cuando existan las tuyas
([step-by-step.es.md](step-by-step.es.md#fase-6-hazla-tuya)).

Lo que no incluye a propósito, y por qué: [adr/0001-stack.md](adr/0001-stack.md) y
[SECURITY.md](../SECURITY.md#advanced-device-controls).

## 2. Herramientas

| Herramienta    | Versión                                                                                         | Para qué                                                    |
| -------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Node.js        | 24.15+ (`.nvmrc`)                                                                               | todo lo de JavaScript                                       |
| pnpm           | 12.5.1 (`packageManager`; `corepack enable`; desde Node.js 25, antes `npm install -g corepack`) | dependencias y scripts                                      |
| Git            | actual                                                                                          | control de versiones; los hooks                             |
| Android Studio | actual, con el Android SDK, un emulador y **JDK 17**                                            | builds de Android y el emulador                             |
| Xcode          | la versión que pide el SDK de Expo (solo macOS)                                                 | builds de iOS y el simulador                                |
| EAS CLI        | `npm install -g eas-cli` (o `pnpm dlx eas-cli`), se ejecuta en `apps/mobile`                    | builds, credenciales, actualizaciones                       |
| Maestro        | 2.10 (la versión que fija CI)                                                                   | flujos end-to-end                                           |
| Docker         | actual, con Compose                                                                             | los servicios de la API, `pnpm sast`, `pnpm lint:workflows` |
| GitHub CLI     | actual                                                                                          | ajustes del repositorio, workflows                          |

Windows: los builds nativos de Android necesitan además, en esa máquina, una ruta de proyecto corta,
las rutas largas de Windows y un `node_modules` hoisted ([testing.md](testing.md#end-to-end)); WSL 2
o los builds de EAS lo evitan.

## 3. Cómo está organizado el proyecto

Un workspace de pnpm: la app es el paquete `mobile` en `apps/mobile`, la API el paquete `api` en
`apps/api`, el sitio público el paquete `landing` en `apps/landing`, y la raíz guarda lo que aplica
a todo el repositorio. Los comandos se ejecutan desde la raíz; `pnpm --filter <paquete> <script>`
ejecuta uno de los scripts propios de un paquete.

```
apps/mobile/            la app
  src/app/              rutas (Expo Router): layouts, guards, pantallas ligeras
  src/features/         áreas del producto: pantallas y sus hooks de datos (auth, items, settings, onboarding, account)
  src/api/              cliente HTTP, tipos generados del contrato, desempaquetado de respuestas
  src/auth/             la sesión: tokens, restauración, renovación, cierre de sesión
  src/config/           la configuración pública validada (EXPO_PUBLIC_*)
  src/lib/              errores, observabilidad, almacenamiento, query, enlaces, notificaciones, permisos, analítica, flags
  src/store/            estado del cliente (Zustand)
  src/ui/               sistema de diseño: tokens, tema, componentes
  .maestro/             flujos end-to-end
  scripts/              tipos del contrato, API mock, presupuesto del bundle, expo-doctor, comprobación del proyecto de EAS
  app.config.ts         identidad, variantes de build, configuración nativa
  eas.json              perfiles de build y envío a las tiendas (EAS se ejecuta aquí)
apps/api/               la API (NestJS)
  src/                  módulos: auth, account, invitations, items, users, health; common (guards,
                        pipes, filtros, middleware), infrastructure (Redis, caché, locks, límites de
                        intentos, outbox de correo), observability, env, prisma, seed, openapi
  prisma/               el esquema y las migraciones en git
  test/                 helpers de los tests de integración
  Dockerfile            la imagen de la API y su job de migraciones
apps/landing/           el sitio público (Astro), en inglés y español, y la imagen web
  src/pages/            las páginas: inicio, privacidad, borrado de cuenta, open-in-app, no encontrada (es/: español)
  src/i18n/             todos los textos, un diccionario por idioma
  src/lib/              el nombre y la dirección de privacidad (site.ts), las fichas de las tiendas (stores.ts)
  public/               favicon.svg, og.png (la imagen de un enlace compartido, 1200 × 630)
  nginx/                el servidor web: rutas, cabeceras de seguridad, los archivos de enlaces de la app al arrancar
  Dockerfile            la imagen web
openapi/                el contrato de la API, generado por la API (`pnpm contract`)
observability/          el catálogo de las métricas de la API
e2e/                    la suite del navegador (Playwright): la landing, los enlaces de la app en la imagen web
scripts/                las comprobaciones del repositorio (hooks y CI), `pnpm dev`, el smoke test, las imágenes de herramientas fijadas
docker-compose.yml      PostgreSQL, Redis y Mailpit para desarrollo; el stack parecido a producción
.github/                CI/CD
```

Las reglas entre estas carpetas (las hace cumplir ESLint) y sus motivos:
[mobile-architecture.md](mobile-architecture.md) para la app, [architecture.md](architecture.md)
para la API y el sitio.

**El código nativo es generado.** `expo prebuild` produce `apps/mobile/android/` e
`apps/mobile/ios/` a partir de `apps/mobile/app.config.ts`; nunca se hace commit de ellos ni se
editan a mano.

**Variantes de build.** Un solo código, cuatro variantes (`APP_VARIANT`): `development`, `preview`,
`e2e`, `production`, cada una con su propio identificador de aplicación y su propio esquema de URL,
para que se instalen una junto a otra ([releases.md](releases.md#build-variants-and-profiles)).

## 4. Ejecutar la app

La app se ejecuta como **development build** (el binario de tu propia app con herramientas para
desarrolladores), no en Expo Go.

| Objetivo                                         | Comandos                                                                                                                                                                                                                                |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| La primera vez en Android                        | `pnpm install`, `cp apps/mobile/.env.example apps/mobile/.env` y en él `EXPO_PUBLIC_API_URL=http://localhost:4010` (trae la API, sección 5), `pnpm mock:api` (terminal 1), `adb reverse tcp:4010 tcp:4010`, `pnpm android` (terminal 2) |
| La primera vez en iOS (macOS)                    | lo mismo con `pnpm ios` (el simulador llega a `localhost` directamente)                                                                                                                                                                 |
| Los demás días                                   | `pnpm mock:api` y `pnpm start`, y después abre la app instalada                                                                                                                                                                         |
| Después de un cambio nativo                      | `pnpm prebuild`, y después `pnpm android` / `pnpm ios` (no regeneran nada mientras existan `apps/mobile/android/` e `apps/mobile/ios/`)                                                                                                 |
| Un development build sin Android Studio ni Xcode | `eas build --profile development --platform android` (o `development-simulator` para el simulador de iOS) e instálalo desde el enlace                                                                                                   |

La API mock (`apps/mobile/scripts/mock-api.mjs`) implementa el contrato en memoria: las cuentas
`member@example.com` / `member-password` y `admin@example.com` / `admin-password`, 45 elementos de
ejemplo. `MOCK_ACCESS_TTL_SEC=20 pnpm mock:api` hace que los tokens caduquen enseguida (verás cómo
se renueva la sesión); `MOCK_LATENCY_MS=1500` ralentiza todas las respuestas (verás los estados de
carga). También falla a demanda, para ver un estado de error:
`curl -X POST localhost:4010/__mock/sessions/revoke` termina la sesión en la siguiente petición de
la app ([testing.md](testing.md#end-to-end) lista las demás). No envía correo: los enlaces que
enviaría (alta, recuperación de contraseña, cambio de correo, invitación) se imprimen en su terminal
con el esquema del build de desarrollo y se guardan en `GET localhost:4010/__mock/outbox`; ábrelos en
el emulador con `adb shell am start -a android.intent.action.VIEW -d '<enlace>'`.

Con la app en marcha: `r` en la terminal de `pnpm start` recarga, `j` abre React Native DevTools,
`m` abre el menú de desarrollador en el dispositivo.

## 5. Ejecutar la API

La API se ejecuta en tu máquina contra PostgreSQL, Redis y Mailpit en Docker. La app sigue
funcionando contra la API mock (sección 4) hasta que la apuntes aquí.

### 5.1 La primera vez

```sh
cp .env.example .env                     # los puertos que publica Docker Compose (los valores por defecto sirven)
cp apps/api/.env.example apps/api/.env   # la configuración de la API; define JWT_ACCESS_SECRET:
openssl rand -hex 32                     #   pega la salida como JWT_ACCESS_SECRET
pnpm services:up                         # PostgreSQL, Redis y Mailpit, sanos
pnpm db:migrate                          # las migraciones en git
pnpm db:seed                             # las cuentas de ejemplo y los 45 elementos del miembro
pnpm dev                                 # la API en modo watch, y un recuadro con todas las direcciones
```

| Qué                         | Dónde                                                                            |
| --------------------------- | -------------------------------------------------------------------------------- |
| La API                      | `http://127.0.0.1:3010/api` (`/api/health/ready` dice si está lista)             |
| Su documentación            | `http://127.0.0.1:3010/api/docs` (Swagger UI, no en producción)                  |
| PostgreSQL                  | `localhost:5452`, base de datos `app`                                            |
| Redis                       | `localhost:6399`                                                                 |
| Mailpit (todos los correos) | `http://localhost:8045`                                                          |
| Cuentas del seed            | `member@example.com` / `member-password`, `admin@example.com` / `admin-password` |

Los puertos son los de la plantilla web más 10, así que las dos funcionan en la misma máquina. Si
otro proyecto ocupa un puerto: cámbialo en el `.env` de la raíz y la URL correspondiente en
`apps/api/.env` (`pnpm dev` avisa si no coinciden). `pnpm db:down` detiene los servicios; sus datos
quedan en volúmenes de Docker.

### 5.2 Apuntar la app a la API

En `apps/mobile/.env`: `EXPO_PUBLIC_API_URL=http://localhost:3010`; en el emulador de Android,
además, `adb reverse tcp:3010 tcp:3010` (el simulador de iOS llega a `localhost` directamente).
Después `pnpm start` otra vez, e inicia sesión con una cuenta del seed. Para volver a la API mock:
`http://localhost:4010`.

### 5.3 Correo

En local, todos los mensajes llegan a Mailpit (`http://localhost:8045`); nada sale de la máquina:
confirmaciones de alta, recuperaciones de contraseña, cambios de correo, invitaciones y los avisos de
seguridad (contraseña cambiada, cuenta borrada). Sin `MAIL_SMTP_URL` el correo está desactivado y
las rutas que lo necesitan responden 503 (`GET /api/auth/capabilities` le dice a un cliente cuáles
están disponibles). Los
comandos del outbox:

```sh
pnpm --filter api mail test --to tu@example.com    # encola un mensaje de prueba y espera su entrega
pnpm --filter api mail status [--to <dirección>]   # la cola, o los mensajes de una dirección
pnpm --filter api mail retry --id <id> | --failed  # reenvía los mensajes fallidos
```

Los enlaces de esos mensajes (`<APP_ORIGIN>/app/<pantalla>#token=…`) abren las pantallas de la app
en un teléfono cuando `APP.linkDomain` es ese dominio
([mobile-architecture.md](mobile-architecture.md#deep-links)). Un build de desarrollo no reclama
ningún dominio: abre el enlace con su esquema, conservando la pantalla y el fragmento,
`adb shell am start -a android.intent.action.VIEW -d 'templateapp-dev://reset-password#token=…'`
(`xcrun simctl openurl booted '…'` en el simulador de iOS).

Un servidor SMTP real, el remitente y los límites: [environment.md](environment.md); cómo funciona
el outbox: [architecture.md](architecture.md#email).

### 5.4 Infraestructura opcional

| Pieza            | Se activa con                                                                                                                                     | Sin ella                                             |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Redis            | `REDIS_URL` (definida en `apps/api/.env.example`), `RATE_LIMIT_STORE` y `CACHE_STORE` = `redis`                                                   | límites, caché y locks en el proceso (una instancia) |
| Sentry           | `SENTRY_DSN`                                                                                                                                      | los errores solo en los logs                         |
| OpenTelemetry    | `OTEL_EXPORTER_OTLP_ENDPOINT`                                                                                                                     | no se exportan trazas ni métricas                    |
| Un backend local | `docker compose --profile observability up -d`, y después `OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4328`; Grafana en `http://localhost:3011` | —                                                    |

Detalles: [architecture.md](architecture.md#optional-infrastructure) y
[observability.md](observability.md).

### 5.5 El stack parecido a producción

`docker compose --profile stack up --build` construye la imagen de la API, su job de migraciones y
la imagen web a partir de sus Dockerfiles, aplica las migraciones y lo sirve todo en
`http://localhost:8090`: la landing, los enlaces de la app y la API en `/api`, con la configuración
de producción y Redis (necesita `JWT_ACCESS_SECRET` en el `.env` de la raíz). `pnpm smoke --url
http://localhost:8090` lo comprueba. Para
probar la pantalla de actualización de la app, arráncalo con
`STACK_MOBILE_MIN_VERSION_ANDROID=99.0.0` (o `_IOS`): entonces todas las peticiones de la app
responden 426. No es un despliegue: sin TLS, credenciales locales, solo loopback.

### 5.6 Cuentas y administradores

Las cuentas del seed son solo para desarrollo (`pnpm db:seed` se niega en producción y con bases de
datos remotas). En cualquier otro sitio, crea una cuenta con su contraseña por la entrada estándar:

```sh
printf '%s' "$PASSWORD" | pnpm --filter api user:create --email <correo> --name <nombre> --role admin
```

Es el camino hacia el primer administrador: el alta pública (`SIGN_UP_ENABLED`, desactivada por
defecto) solo crea miembros, y los administradores invitan al resto. Una cuenta la borra su dueño,
con su contraseña (`POST /api/account/deletion`), y con ella todo lo suyo; el único administrador no puede
borrar la suya ([adr/0012-account-deletion.md](adr/0012-account-deletion.md)).

### 5.7 La landing

El sitio público: la página de inicio (qué es la app, cómo funciona, dónde descargarla), la
privacidad, el borrado de cuenta (la URL que pide el formulario Data safety de Google Play) y la
página que muestran los enlaces de la app donde la app no los abre, en inglés (`/`) y español
(`/es/`). `pnpm dev` la sirve en `http://localhost:4331`, con `/api` reenviado a la API;
`pnpm --filter landing build` y después `pnpm --filter landing preview` muestran las páginas
compiladas.

Lo que cambia un producto (REQUIERE CONFIGURACIÓN):

| Qué                                     | Dónde                                                                                                               |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| El nombre                               | `apps/landing/src/lib/site.ts` (`SITE_NAME`), el mismo que `APP.name` en `apps/mobile/app.config.ts`                |
| La dirección de privacidad y de borrado | `apps/landing/src/lib/site.ts` (`PRIVACY_EMAIL`): alguien tiene que leerla                                          |
| Las fichas de las tiendas (insignias)   | `apps/landing/src/lib/stores.ts` cuando existan; vacías, las insignias no se muestran                               |
| Los textos                              | `apps/landing/src/i18n/en.ts` y `es.ts`, en el mismo cambio (un texto que falte rompe el build)                     |
| La política de privacidad               | `privacy` en los dos diccionarios: el texto legal, los proveedores, los plazos; después quita su aviso de plantilla |
| La imagen y el icono                    | `apps/landing/public/og.png` (1200 × 630) y `favicon.svg`                                                           |
| Los colores y la tipografía             | `apps/landing/src/styles/global.css` (claro y oscuro)                                                               |

Servidos por la imagen web, los enlaces de los correos de la API (`/app/<pantalla>#token=…`) se
abren en la app cuando el dominio demuestra que es de la app: define la identidad de la app en la
imagen (`APPLE_TEAM_ID`, `IOS_BUNDLE_ID`, `ANDROID_PACKAGE`, `ANDROID_SHA256_CERT_FINGERPRINTS`,
[environment.md](environment.md#web-variables)) y el mismo dominio en `APP.linkDomain`. Sin ellas,
un enlace muestra la página open-in-app. Detalles:
[architecture.md](architecture.md#public-site-and-app-links-appslanding).

### 5.8 El servidor

La parte de servidor (la API y la imagen web) se despliega en un servidor Linux con Docker, el
destino de referencia ([deploy-vps.md](deploy-vps.md),
[ADR 0009](adr/0009-postgresql-and-redis-on-the-server.md)): Caddy para TLS, la imagen web, la API,
PostgreSQL con su backup nocturno (o uno gestionado) y Redis, desde `deploy/vps/`. El workflow
**Deploy**, que lanza una persona, publica las imágenes una vez por commit, comprueba los ficheros
del servidor, migra, despliega, pasa el smoke test y vuelve atrás solo; primero staging y después
el mismo commit a producción. En DigitalOcean, Terraform crea el servidor
(`infra/terraform/digitalocean`). Los builds de la app apuntan a él: los de `preview` a staging, los
de `production` a producción, y su dominio es el dominio de los enlaces de la app.

| Qué                      | Dónde                                                                                                                                |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| Montar un servidor       | [deploy-vps.md](deploy-vps.md), paso a paso en [step-by-step.es.md](step-by-step.es.md#fase-7-el-servidor-la-api-y-el-sitio-público) |
| Desplegar, volver atrás  | [deploy-vps.md](deploy-vps.md#operations), [ci-cd.md](ci-cd.md#deployment)                                                           |
| Backups y restauraciones | [deploy-vps.md](deploy-vps.md#backups), [disaster-recovery.md](disaster-recovery.md)                                                 |
| Dashboards y alertas     | `observability/` ([observability.md](observability.md#dashboards-and-alerts-as-code), [alerting.md](alerting.md))                    |
| Cuando salta una alerta  | [incident-response.md](incident-response.md)                                                                                         |

`pnpm iac:check` y `pnpm observability:check` comprueban el código del servidor en local (Docker),
como hace la CI.

### 5.9 Notificaciones push

La API envía notificaciones push a través del servicio push de Expo, a cada teléfono de la cuenta
que las haya permitido; viene un tipo, el aviso de seguridad de una contraseña cambiada ("Your
password was changed", que abre Ajustes). Desactivadas por defecto: `PUSH_ENABLED=true` las
activa, y `EXPO_ACCESS_TOKEN` (un token de acceso de la cuenta de Expo, con la seguridad de push
activada en expo.dev/settings/access-tokens) impide que quien conozca el token de un teléfono le
envíe nada ([environment.md](environment.md#api-variables)). La app registra el teléfono cuando el
usuario permite las notificaciones en Ajustes, y lo quita al cerrar sesión
([mobile-architecture.md](mobile-architecture.md#notifications)).

Para recibirlas necesitas un teléfono real con un build de desarrollo o de release, hecho con un
proyecto de EAS (`eas init`) y sus credenciales (REQUIERE CONFIGURACIÓN; paso a paso en
[step-by-step.es.md](step-by-step.es.md#84-servicios-de-push-y-de-reporte-de-errores-opcional)): en Android, el
`google-services.json` del proyecto de Firebase como variable de EAS de tipo archivo
`GOOGLE_SERVICES_JSON` y su clave FCM V1; en iOS, una clave APNs. Los emuladores y simuladores no
reciben token push: la app no registra nada en ellos. El comando del outbox:

```sh
pnpm --filter api push status   # si push está activo, la cola, los dispositivos, los últimos fallos
```

Cómo funciona el outbox: [architecture.md](architecture.md#push-notifications); cuando las
notificaciones no llegan:
[incident-response.md](incident-response.md#19-push-notifications-not-delivered).

## 6. Desarrollo diario

1. `git switch main && git pull`, y después `pnpm install` si cambió el lockfile.
2. Una rama: `git switch -c feat/<descripción>` (tipos: `feat`, `fix`, `chore`, `docs`,
   `refactor`, `test`, `ci`, `build`, `perf`, `hotfix`, `release`).
3. El cambio, siguiendo la receta de
   [mobile-architecture.md](mobile-architecture.md#adding-a-feature): API (esquema, ruta, tests) →
   contrato → hooks de datos → pantalla → ruta → tests.
4. Los cambios en el contrato de la API empiezan en la API (sus esquemas de Zod y sus
   controladores); `pnpm contract` regenera `openapi/openapi.json` y
   `apps/mobile/src/api/schema.d.ts`: haz commit de los dos ([openapi/README.md](../openapi/README.md)).
   Los cambios son aditivos: las apps instaladas mantienen el contrato antiguo
   ([api-conventions.md](api-conventions.md)).
5. Cambios en la base de datos: edita `apps/api/prisma/schema.prisma`, y `pnpm db:migrate` crea la
   migración; haz commit de ella y nunca edites una ya aplicada ([database.md](database.md#migrations)).
6. Una dependencia: para la app, `pnpm --filter mobile exec expo install <paquete>` (nunca
   `pnpm add` para nada que toque código nativo); para la API, `pnpm --filter api add <paquete>`;
   explícala en el pull request ([CONTRIBUTING.md](../CONTRIBUTING.md#adding-a-dependency)).
7. Antes de hacer push: `pnpm verify`, y `pnpm test:integration` si cambió la API.

## 7. Tests

| Tipo                                           | Comando                                                                                                 | Dónde                                               |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| App: unitarios, de componentes, de integración | `pnpm test` (los dos paquetes)                                                                          | `apps/mobile/src/**/*.spec.ts(x)`, `*.int.spec.tsx` |
| API: unitarios (sin base de datos)             | `pnpm test`                                                                                             | `apps/api/src/**/*.spec.ts`                         |
| API: integración (PostgreSQL, Redis, Mailpit)  | `pnpm test:integration` (con los servicios arrancados: `pnpm services:up`)                              | `apps/api/src/**/*.int.spec.ts`, en `app_test`      |
| Landing: diccionarios, páginas, helpers        | `pnpm test` (Vitest)                                                                                    | `apps/landing/src/**/*.spec.ts`                     |
| Con cobertura y umbrales                       | `pnpm test:coverage`                                                                                    | `apps/*/coverage/`                                  |
| Modo watch                                     | `pnpm --filter mobile test:watch`, `pnpm --filter api test:watch`                                       |                                                     |
| Una carpeta o un test                          | `pnpm --filter mobile test features/items`, `pnpm --filter api exec vitest run src/items`               |                                                     |
| End-to-end en un dispositivo                   | `pnpm test:e2e:mobile` (con un build de release de la variante `e2e` instalado y la API mock en marcha) | `apps/mobile/.maestro/flows/`                       |
| End-to-end contra la API y Mailpit             | `pnpm test:e2e:mobile:stack` (el mismo build, `pnpm dev`, `adb reverse tcp:4010 tcp:3010`)              | `apps/mobile/.maestro/stack/`                       |
| Navegador: la landing y la imagen web          | `pnpm test:e2e` (después de `pnpm --filter landing build`; Docker para la imagen)                       | `e2e/`                                              |
| Un despliegue, o el stack                      | `pnpm smoke --url <URL pública> --api <URL de la API>` (solo lectura)                                   | `scripts/smoke-test.mjs`                            |

Cómo escribirlos y los helpers: [testing.md](testing.md).

## 8. Commits, pushes y pull requests

- Los mensajes de commit y los títulos de los pull requests siguen Conventional Commits:
  `feat(items): share an item` ([CONTRIBUTING.md](../CONTRIBUTING.md#commits)).
- Hooks: `pre-commit` (ficheros en stage: ningún `.env`, escaneo de secretos, lint con arreglos,
  formato), `commit-msg` (commitlint), `pre-push` (ningún push a `main`, nombre de la rama,
  `pnpm typecheck`, `pnpm test`).
- Los pull requests usan la plantilla: qué y por qué, cómo se probó en dispositivos, capturas de
  pantalla, el impacto en la release (actualización OTA o build nuevo para las tiendas) y la
  Definition of Done.
- Haz merge con **Squash and merge** cuando **CI passed** y **Conventions** estén en verde y un
  revisor lo haya aprobado.

## 9. Configuración

| Dónde                                      | Qué                                                                                                                                         | En git    |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| `apps/mobile/app.config.ts` → `APP`        | nombre, slug, identificador, esquema de URL, id y propietario del proyecto de EAS, dominio de los enlaces, colores (REQUIERE CONFIGURACIÓN) | sí        |
| `apps/mobile/.env`                         | configuración pública local (`EXPO_PUBLIC_*`)                                                                                               | nunca     |
| `apps/mobile/.env.example`                 | documentación de todas las variables                                                                                                        | sí        |
| `apps/api/.env`                            | la configuración local de la API (base de datos, secretos, correo, Redis, límites)                                                          | nunca     |
| `apps/api/.env.example`                    | documentación de todas las variables de la API                                                                                              | sí        |
| `.env` (raíz)                              | los puertos y valores que lee Docker Compose (`.env.example`)                                                                               | nunca     |
| `apps/mobile/eas.json`                     | perfiles de build: variante, entorno, canal, distribución; envío                                                                            | sí        |
| Variables de entorno de EAS                | por entorno: URL de la API, DSN de Sentry, `SENTRY_*` (en tiempo de build)                                                                  | en EAS    |
| Entornos de GitHub `preview`, `production` | `EXPO_TOKEN`, `SENTRY_AUTH_TOKEN`                                                                                                           | en GitHub |

Todos los valores `EXPO_PUBLIC_*` se compilan dentro de la app y cualquiera puede leerlos: nunca un
secreto. `apps/mobile/src/config/env.schema.ts` los valida cuando se evalúa la configuración de la
app (un valor incorrecto hace fallar el build) y al arrancar. La tabla completa:
[releases.md](releases.md#environment-variables). La API lee sus variables solo en
`apps/api/src/env/env.ts` y se niega a arrancar con una inválida, nombrándola; todas las variables,
sus valores por defecto y sus reglas: [environment.md](environment.md).

## 10. Referencia de comandos

| Comando                                           | Qué hace                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install`                                    | dependencias; instala los hooks de Git, genera los tipos de Expo y el cliente de Prisma                                                                                                                                                                                                                                     |
| `pnpm dev`                                        | `pnpm services:up`, y después la API en modo watch, la landing en `localhost:4331` y un recuadro con sus direcciones                                                                                                                                                                                                        |
| `pnpm services:up`                                | PostgreSQL, Redis y Mailpit en Docker, esperando a que estén sanos                                                                                                                                                                                                                                                          |
| `pnpm db:up` / `pnpm db:down`                     | solo PostgreSQL / detiene todos los servicios (los datos se quedan)                                                                                                                                                                                                                                                         |
| `pnpm db:migrate`                                 | crea una migración a partir de los cambios de `schema.prisma`, aplica las pendientes, regenera el cliente                                                                                                                                                                                                                   |
| `pnpm db:seed`                                    | las cuentas y los elementos de ejemplo (solo bases de datos locales)                                                                                                                                                                                                                                                        |
| `pnpm start`                                      | servidor de desarrollo Metro para un development build instalado                                                                                                                                                                                                                                                            |
| `pnpm android` / `pnpm ios`                       | compila, instala y ejecuta un development build en local                                                                                                                                                                                                                                                                    |
| `pnpm prebuild`                                   | regenera `apps/mobile/android/` e `apps/mobile/ios/`                                                                                                                                                                                                                                                                        |
| `pnpm mock:api`                                   | la API mock en `127.0.0.1:4010`                                                                                                                                                                                                                                                                                             |
| `pnpm --filter mobile types:generate`             | los tipos generados de Expo (`apps/mobile/expo-env.d.ts`, rutas tipadas)                                                                                                                                                                                                                                                    |
| `pnpm lint` / `pnpm lint:fix`                     | ESLint, cero warnings                                                                                                                                                                                                                                                                                                       |
| `pnpm format` / `pnpm format:check`               | Prettier                                                                                                                                                                                                                                                                                                                    |
| `pnpm typecheck`                                  | desviaciones del contrato, tipos generados, `tsc`                                                                                                                                                                                                                                                                           |
| `pnpm test` / `pnpm test:coverage`                | Jest (app) y Vitest (unitarios de la API, landing); `pnpm --filter <paquete> test:watch` para el modo watch                                                                                                                                                                                                                 |
| `pnpm test:integration`                           | la suite de integración de la API contra PostgreSQL, Redis y Mailpit                                                                                                                                                                                                                                                        |
| `pnpm test:e2e`                                   | Playwright: la landing compilada y los enlaces de la app en la imagen web (construye y arranca la imagen: Docker)                                                                                                                                                                                                           |
| `pnpm test:e2e:mobile`                            | flujos de Maestro                                                                                                                                                                                                                                                                                                           |
| `pnpm test:e2e:mobile:stack`                      | flujos de Maestro contra la API real y Mailpit (alta, cambio de correo, recuperación de contraseña, borrado de cuenta)                                                                                                                                                                                                      |
| `pnpm test:scripts`                               | los tests de los scripts del repositorio (`scripts/*.test.mjs` y `apps/*/scripts/*.test.mjs`: el motor de Doberman, la política de dependencias, las imágenes de herramientas, la API mock contra el contrato, los scripts de la imagen web, los de despliegue y los ficheros del servidor, los ficheros de observabilidad) |
| `pnpm expo:doctor`                                | expo-doctor, todas las comprobaciones; las versiones de las dependencias contra el manifiesto del SDK instalado (el lockfile), no contra los últimos parches publicados                                                                                                                                                     |
| `pnpm security`                                   | `pnpm audit` (high), política de dependencias y licencias, escaneo de secretos                                                                                                                                                                                                                                              |
| `pnpm deps:check` / `pnpm secrets:scan`           | las dos políticas por separado                                                                                                                                                                                                                                                                                              |
| `pnpm sast`                                       | Semgrep (Docker)                                                                                                                                                                                                                                                                                                            |
| `pnpm lint:workflows`                             | actionlint, zizmor, shellcheck (Docker)                                                                                                                                                                                                                                                                                     |
| `pnpm contract`                                   | `openapi/openapi.json` a partir de la API, y después `apps/mobile/src/api/schema.d.ts` a partir de él                                                                                                                                                                                                                       |
| `pnpm build`                                      | la API (`apps/api/dist/`), la landing (`apps/landing/dist/`) y los bundles de JavaScript de producción de la app para las dos plataformas (`apps/mobile/dist/`)                                                                                                                                                             |
| `pnpm perf:check`                                 | los presupuestos de la landing y de la app, después de `pnpm build`                                                                                                                                                                                                                                                         |
| `pnpm smoke`                                      | el smoke test de solo lectura de un despliegue o del stack (`--url`, `--api`, `--release`, `--require-app-links`)                                                                                                                                                                                                           |
| `pnpm iac:check`                                  | Terraform (formato, validación, tests), TFLint, Trivy, cloud-init, los roles de la base de datos y `db-init.sh` sobre PostgreSQL (Docker)                                                                                                                                                                                   |
| `pnpm iac:database`                               | los roles de la base de datos gestionada, desde el servidor que creó Terraform (sección 5.8)                                                                                                                                                                                                                                |
| `pnpm observability:check`                        | los dashboards y las reglas de alerta contra el catálogo de métricas y los runbooks, después promtool y los tests unitarios de las reglas (Docker)                                                                                                                                                                          |
| `pnpm --filter landing dev` / `build` / `preview` | solo la landing: su servidor de desarrollo, su build (`astro check` antes), las páginas compiladas                                                                                                                                                                                                                          |
| `pnpm sbom:generate`                              | SBOM CycloneDX de las dependencias de producción                                                                                                                                                                                                                                                                            |
| `pnpm verify`                                     | formato, lint, typecheck, cobertura, expo-doctor, seguridad, build, presupuestos                                                                                                                                                                                                                                            |
| `pnpm --filter api user:create`                   | una cuenta, con su contraseña por la entrada estándar (sección 5.6)                                                                                                                                                                                                                                                         |
| `pnpm --filter api mail <comando>`                | el outbox de correo: `test`, `status`, `retry` (sección 5.3)                                                                                                                                                                                                                                                                |
| `pnpm --filter api push status`                   | el outbox de push: si está activo, la cola, los dispositivos, los últimos fallos (sección 5.9)                                                                                                                                                                                                                              |
| `docker compose --profile stack up --build`       | el stack parecido a producción en `localhost:8090`: la imagen web delante de la API (sección 5.5)                                                                                                                                                                                                                           |

EAS (CLI global, `eas <comando>`): `login`, `init`, `build`, `build:list`, `submit`, `update`,
`update:list`, `update:edit`, `update:republish`, `update:roll-back-to-embedded`, `channel:list`,
`channel:protect`, `credentials`, `env:create`, `env:list`, `device:create`, `fingerprint:compare`.

## 11. CI/CD

| Workflow      | Cuándo                                             | Hace                                                                                                                                                                                                                   |
| ------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CI            | en cada pull request y en cada push a `main`       | todos los gates (formato, lint, tipos, doctor, SAST, tests, la suite de integración de la API, seguridad, build y bundle, prebuild, las imágenes de la API construidas y escaneadas); check obligatorio: **CI passed** |
| Conventions   | en cada pull request, otra vez al editar su título | nombre de la rama y título (Conventional Commits); check obligatorio: **Conventions**                                                                                                                                  |
| E2E (Android) | pull requests y pushes que tocan la app            | APK de release de la variante `e2e`, API mock, emulador, Maestro                                                                                                                                                       |
| Release       | push a `main`                                      | el pull request de release y el CI en él; al mergearlo, el tag y la GitHub release con el SBOM                                                                                                                         |
| EAS build     | a mano, desde `main`                               | los gates, y después un build de EAS de `preview` o `production` (envío opcional a pruebas internas)                                                                                                                   |
| EAS update    | a mano, desde `main`                               | los gates, y después una actualización OTA a `preview` o `production`, opcionalmente escalonada                                                                                                                        |
| EAS rollback  | a mano, desde `main`                               | vuelve a publicar una actualización anterior o vuelve al bundle embebido                                                                                                                                               |
| CodeQL        | si se activa                                       | análisis de seguridad                                                                                                                                                                                                  |
| Deploy        | a mano, desde `main`                               | gates y después la parte de servidor a `staging` o `production`: imágenes, migración, despliegue, smoke test, vuelta atrás (sección 5.8)                                                                               |
| DAST          | cada semana, a mano                                | OWASP ZAP sobre las imágenes de producción arrancadas en el runner, o un escaneo pasivo de staging; orientativo                                                                                                        |

Ningún pull request puede compilar, firmar, enviar a las tiendas ni publicar:
[ci-cd.md](ci-cd.md#what-protects-production).

## 12. Builds, tiendas y actualizaciones OTA

- **Versiones:** `apps/mobile/package.json` guarda la versión que ven los usuarios (la sube
  release-please, junto con el `package.json` de la raíz: una sola versión para todo el
  repositorio); EAS incrementa los números de build de los builds de producción.
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

Todo en detalle: [releases.md](releases.md).

## 13. Monitorizar una app publicada

- **Sentry** (cuando `EXPO_PUBLIC_SENTRY_DSN` está definida): crashes y errores con la release, el
  build, el id de la actualización y el canal; los source maps los suben los builds y el workflow
  EAS update.
- **Las tiendas:** Play Console → Android vitals (crashes, ANRs); App Store Connect / Xcode
  Organizer (crashes, energía, bloqueos); valoraciones y reseñas.
- **EAS:** `eas update:insights`, `eas channel:insights` (adopción y tasa de crashes por
  actualización).
- **Settings → About** en la app muestra la versión, el build y la actualización que usa un
  usuario: pide esa información en los reportes de bugs.
- **El servidor:** los dashboards y las reglas de alerta de `observability/` en el backend elegido,
  las comprobaciones de disponibilidad (`/healthz`, la API, los ficheros de enlaces de la app) y los
  runbooks de [incident-response.md](incident-response.md), uno por alerta
  ([alerting.md](alerting.md)). `ApiClientsRefusedAsOutdated` avisa cuando una versión mínima deja
  fuera a la mayoría de las instalaciones de una plataforma.

## 14. Calendario de mantenimiento

| Cuándo                              | Qué                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cada semana                         | Aprueba los pull requests de Dependabot: las actualizaciones patch y minor se mergean solas cuando el CI está en verde; las majors y las de workflows las mergeas a mano ([ci-cd.md](ci-cd.md#dependency-updates)).                                                                                                                                                                                                                                                                                                          |
| Cada release                        | Build de preview, prueba en dispositivos, build de producción, pruebas internas, lanzamiento escalonado en las tiendas.                                                                                                                                                                                                                                                                                                                                                                                                      |
| Cada SDK de Expo (unos tres al año) | Actualiza un SDK cada vez ([releases.md](releases.md#expo-sdk-upgrades)).                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Cada trimestre                      | Revisa las excepciones de auditoría (`audit.ignore`) y los `overrides` de seguridad de `pnpm-workspace.yaml` (quita un override cuando `pnpm why <paquete>` muestre una versión corregida sin él); las versiones fijadas de EAS CLI, Maestro, Node.js y pnpm, y TypeScript ([ci-cd.md](ci-cd.md#keeping-the-stack-current)); las credenciales que caducan (el certificado de distribución de Apple dura un año: renuévalo con `eas credentials` antes de que caduque, o fallará el build de iOS del workflow de producción). |
| Antes de los plazos de las tiendas  | El requisito de target API level de Google Play (cada agosto) y el requisito de versión mínima de Xcode/SDK de Apple (cada primavera): los builds hechos con un SDK nuevo los cumplen.                                                                                                                                                                                                                                                                                                                                       |
| Una major de PostgreSQL o Redis     | A mano, junto con `docker-compose.yml`, el `deploy/vps/compose.yaml` del servidor y las imágenes de CI (`scripts/tool-images/Dockerfile`); el directorio de datos de PostgreSQL se exporta y se restaura entre majors ([ci-cd.md](ci-cd.md#postgresql-and-redis)).                                                                                                                                                                                                                                                           |
| Cada mes (el servidor)              | Borra las imágenes viejas del servidor, conservando la release en marcha y la de vuelta atrás; reinícialo cuando exista `/var/run/reboot-required` ([deploy-vps.md](deploy-vps.md#keep-the-server-healthy)).                                                                                                                                                                                                                                                                                                                 |
| Cada trimestre (el servidor)        | Un simulacro de restauración de la base de datos ([disaster-recovery.md](disaster-recovery.md#restore-testing)), una alerta de prueba por el enrutado ([alerting.md](alerting.md#escalation-requiere-configuración)) y comprobar la copia de los backups fuera del servidor.                                                                                                                                                                                                                                                 |

## 15. Cuando algo falla

El README tiene una tabla de problemas y soluciones ([README.md](../README.md#troubleshooting)); lo
específico de los tests end-to-end está en [testing.md](testing.md#end-to-end); cada mensaje
que imprimen las herramientas, con su arreglo, en [troubleshooting.md](troubleshooting.md), y qué
hacer cuando producción falla, en [incident-response.md](incident-response.md). Los más
habituales:

| Mensaje                                                                          | Arreglo                                                                                                   |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| "You seem to be offline" en el emulador de Android                               | `adb reverse tcp:4010 tcp:4010`                                                                           |
| `Invalid app configuration: EXPO_PUBLIC_API_URL…`                                | defínela (`apps/mobile/.env` en local, el entorno de EAS para los builds); HTTPS fuera de localhost       |
| `pnpm expo:doctor` informa de versiones                                          | `EXPO_OFFLINE=1 pnpm --filter mobile exec expo install --fix` (las versiones que espera el SDK instalado) |
| `ERR_PNPM_NO_MATURE_MATCHING_VERSION`                                            | una release con menos de siete días: usa la anterior o espera                                             |
| Build de Android: "A restricted method in java.lang.System has been called"      | JDK 17                                                                                                    |
| Build de Android en Windows: `CMAKE_OBJECT_PATH_MAX` o "build.ninja still dirty" | ruta corta y `node_modules` hoisted, o WSL 2 / EAS                                                        |
| No hay proyecto de EAS                                                           | `eas init`, y después `APP.easProjectId` y `APP.owner` en `apps/mobile/app.config.ts`                     |
| La API se detiene al arrancar nombrando una variable                             | corrígela en `apps/api/.env` ([environment.md](environment.md))                                           |
| `pnpm services:up`: "port is already allocated"                                  | otro proyecto lo ocupa: otro puerto en el `.env` de la raíz, y la URL en `apps/api/.env` a juego          |
| `Cannot reach PostgreSQL` en `pnpm test:integration`                             | `pnpm services:up` (o `DATABASE_URL` apuntando a un servidor)                                             |
| La app recibe 426 "no longer supported"                                          | `MOBILE_MIN_VERSION_*` de la API está por encima de la versión de la app: quítala en local                |

## 16. Apéndice

### 16.1 Cuentas e identificadores

| Qué                           | Dónde                                                                                                                                                                                                                                    |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cuentas de ejemplo            | `member@example.com` / `member-password`, `admin@example.com` / `admin-password`: las de la API mock y las del seed (solo en local)                                                                                                      |
| Identificadores de aplicación | `APP.identifier` + `.dev`, `.preview`, `.e2e`, o nada para producción                                                                                                                                                                    |
| Esquemas de URL               | `APP.scheme` + `-dev`, `-preview`, `-e2e`, o nada                                                                                                                                                                                        |
| Puertos                       | `4010` API mock, `8081` Metro, `3010` API, `4331` la landing, `5452` PostgreSQL, `6399` Redis, `1045`/`8045` Mailpit, `8090` el stack, `8091` la imagen web de la suite del navegador, `4328`/`3011`/`9100` el backend de observabilidad |

### 16.2 Los demás documentos

| Documento                                                                                                                                                                | Para                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| [step-by-step.es.md](step-by-step.es.md)                                                                                                                                 | qué hacer, en orden, desde cero hasta las tiendas                                                               |
| [mobile-architecture.md](mobile-architecture.md)                                                                                                                         | cómo está organizado el código de la app y por qué                                                              |
| [architecture.md](architecture.md), [api-conventions.md](api-conventions.md), [authorization.md](authorization.md), [database.md](database.md)                           | la API: módulos, convenciones HTTP, reglas de acceso, datos                                                     |
| [error-handling.md](error-handling.md), [observability.md](observability.md), [environment.md](environment.md), [security.md](security.md)                               | los errores de punta a punta; logs, trazas, métricas; las variables de la API; el diseño de seguridad de la API |
| [adr/](adr/README.md)                                                                                                                                                    | las decisiones y sus motivos                                                                                    |
| [testing.md](testing.md), [performance.md](performance.md)                                                                                                               | tests; rendimiento y el presupuesto del bundle                                                                  |
| [releases.md](releases.md), [ci-cd.md](ci-cd.md)                                                                                                                         | builds, tiendas, actualizaciones; workflows y ajustes                                                           |
| [deploy-vps.md](deploy-vps.md), [disaster-recovery.md](disaster-recovery.md), [load-testing.md](load-testing.md)                                                         | el servidor: montarlo y operarlo; backups y restauraciones; pruebas de carga                                    |
| [alerting.md](alerting.md), [incident-response.md](incident-response.md), [troubleshooting.md](troubleshooting.md)                                                       | SLOs y alertas; los runbooks; cada mensaje de error y su arreglo                                                |
| [production-readiness.md](production-readiness.md), [store-compliance.md](store-compliance.md)                                                                           | la checklist antes de publicar; lo que exigen las tiendas                                                       |
| [accessibility.md](accessibility.md), [localization.md](localization.md)                                                                                                 | el gate de accesibilidad; traducir la app (opcional)                                                            |
| [SECURITY.md](../SECURITY.md)                                                                                                                                            | modelo de amenazas, MASVS, inventario de datos, secretos, dependencias                                          |
| [ENGINEERING_STANDARDS.md](../ENGINEERING_STANDARDS.md), [DEFINITION_OF_DONE.md](../DEFINITION_OF_DONE.md), [CONTRIBUTING.md](../CONTRIBUTING.md)                        | las reglas; cuándo está terminado un cambio; el flujo de trabajo                                                |
| [how-to.md](how-to.md), [template/bootstrap.md](template/bootstrap.md)                                                                                                   | recetas para los cambios habituales; empezar un proyecto y sus marcadores                                       |
| [branching.md](branching.md), [commits.md](commits.md), [code-review.md](code-review.md), [git-hooks.md](git-hooks.md), [definition-of-ready.md](definition-of-ready.md) | ramas, títulos de commit, revisión, hooks, cuándo puede empezar una historia                                    |
| [AGENTS.md](../AGENTS.md)                                                                                                                                                | instrucciones para agentes de IA que escriben código                                                            |
