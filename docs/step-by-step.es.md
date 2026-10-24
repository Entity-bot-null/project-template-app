# Paso a paso: de cero a las tiendas

English version: [step-by-step.md](step-by-step.md). Las dos versiones tienen los mismos pasos; un
cambio en una se hace también en la otra, en el mismo pull request.

Este es el **instructivo**: qué hacer, en orden, desde la información y las cuentas que necesitas
antes de empezar hasta una app publicada en Google Play y en la App Store, y después el ciclo
diario. Cada paso dice qué hacer, el comando exacto, qué deberías ver si ha funcionado y qué hacer
si no. El [manual](manual.es.md) explica cómo funcionan las cosas; esta página te dice qué hacer a
continuación.

Cómo usarla:

- Sigue las fases en orden y haz cada **Comprobación**: cada una demuestra que los pasos anteriores
  funcionaron.
- Los comandos se ejecutan en una terminal, en la raíz del proyecto. En Windows usa **Git Bash**.
- Lo que va entre `<ángulos>` es un valor que sustituyes; apunta los tuyos en la
  [hoja de trabajo](#la-hoja-de-trabajo).
- Algunas cuentas tardan días en aprobarse (Apple, Google): empieza primero por la fase 0 y después
  trabaja en las fases 1–7 mientras esperas.

## La línea de tiempo

| Fase                                                                                        | Con qué terminas                                                                                                 | Tiempo                          |
| ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| [0. Información, decisiones y cuentas](#fase-0-información-decisiones-y-cuentas)            | la hoja de trabajo rellena; las cuentas de las tiendas solicitadas                                               | 2 h, más **días** de aprobación |
| [1. Tu equipo](#fase-1-tu-equipo)                                                           | Node, pnpm, Android Studio (y Xcode en un Mac), Maestro, EAS CLI                                                 | 1–2 h                           |
| [2. Crea el proyecto](#fase-2-crea-el-proyecto)                                             | tu copia con la identidad de tu app                                                                              | 20 min                          |
| [3. Ejecútala en un emulador](#fase-3-ejecútala-en-un-emulador)                             | la app funcionando contra la API mock                                                                            | 30–45 min                       |
| [4. Comprueba que pasan todos los gates](#fase-4-comprueba-que-pasan-todos-los-gates)       | las mismas comprobaciones que CI, en verde en local                                                              | 30–60 min                       |
| [5. Súbela a GitHub](#fase-5-súbela-a-github)                                               | el repositorio protegido, CI en verde en un pull request                                                         | 1 h                             |
| [6. Hazla tuya](#fase-6-hazla-tuya)                                                         | tu backend, tu marca y tus funcionalidades                                                                       | de días a semanas               |
| [7. El servidor: la API y el sitio público](#fase-7-el-servidor-la-api-y-el-sitio-público)  | servidores de staging y producción con la API y la landing, desplegados por el workflow; el primer administrador | 2–3 h por entorno               |
| [8. EAS y servicios](#fase-8-eas-y-servicios)                                               | el proyecto de EAS, su configuración y las credenciales de firma                                                 | 1–2 h                           |
| [9. Primeros builds en dispositivos reales](#fase-9-primeros-builds-en-dispositivos-reales) | builds de desarrollo y de preview instalados en teléfonos                                                        | 1–2 h                           |
| [10. Las fichas en las tiendas](#fase-10-las-fichas-en-las-tiendas)                         | la app en Play Console y en App Store Connect, lista para recibir builds                                         | medio día                       |
| [11. La primera publicación en las tiendas](#fase-11-la-primera-publicación-en-las-tiendas) | la versión 1 en pruebas internas, después pública                                                                | 1–2 días, más la revisión       |
| [12. Actualizaciones OTA](#fase-12-actualizaciones-ota)                                     | un arreglo de JavaScript publicado sin pasar por las tiendas; un rollback ensayado                               | 1 h                             |
| [13. Monitorización](#fase-13-monitorización)                                               | crashes y errores reportados, alguien pendiente de ellos                                                         | 1 h                             |
| [14. Antes de los usuarios reales](#fase-14-antes-de-los-usuarios-reales)                   | la checklist final aprobada                                                                                      | medio día                       |
| [15. El ciclo diario](#fase-15-el-ciclo-diario)                                             | cómo llega cada cambio a los usuarios                                                                            | cada día                        |
| [16. El calendario de mantenimiento](#fase-16-el-calendario-de-mantenimiento)               | qué hacer cada semana, cada release y cada trimestre                                                             | recurrente                      |

---

## Fase 0. Información, decisiones y cuentas

### 0.1 Decide

- [ ] **El nombre de la app** en las tiendas (hasta 30 caracteres) y en la pantalla de inicio
      (corto).
- [ ] **El identificador**: un dominio que sea tuyo, en notación DNS inversa (reverse DNS) y en
      minúsculas, por ejemplo `com.acme.portal`. Es el paquete de Android y el bundle id de iOS, y
      **no se puede cambiar después de la primera publicación en las tiendas**.
- [ ] **El esquema de URL** (URL scheme) para los deep links, por ejemplo `acmeportal`
      (`acmeportal://items/42`).
- [ ] **El backend**: la API incluida (`apps/api`), que amplías con tus funcionalidades, o la tuya;
      y dónde va a funcionar, con sus URL HTTPS de staging y de producción. Mientras no funcione en
      ningún sitio, la app funciona contra la API en tu máquina o contra la API mock incluida.
- [ ] **Enlaces desde la web** (opcional): un dominio para universal links/App Links (que
      `app.acme.com/items/42` abra la app).
- [ ] **Qué datos recoge la app** (para los formularios de privacidad de las tiendas) y si usa
      analítica y notificaciones push.
- [ ] **Quién** aprueba los builds y las actualizaciones de producción, quién revisa el código,
      quién recibe los reportes de seguridad y las alertas.
- [ ] **Contacto de soporte**, **URL de la política de privacidad** (las dos tiendas exigen una) y
      las respuestas de la **clasificación por edad**.

### 0.2 Solicita las cuentas (empieza hoy: algunas tardan días)

| Cuenta                                        | Precio (comprueba los precios actuales)                                         | Plazo                                                                          | Notas                                                                                                                                                                                                                                                                   |
| --------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Apple Developer Program**                   | unos USD 99 al año                                                              | como particular: alrededor de un día; **como organización: de días a semanas** | una organización necesita un **número D-U-N-S** de la entidad jurídica (gratuito, puede tardar días)                                                                                                                                                                    |
| **Google Play Console**                       | unos USD 25, una sola vez                                                       | verificación de identidad: días                                                | las cuentas **personales** creadas después de noviembre de 2023 tienen que hacer una **prueba cerrada con al menos 12 testers durante 14 días** antes de publicar en producción (comprueba la regla vigente en Play Console); las cuentas de organización están exentas |
| **Expo** (expo.dev)                           | plan gratuito para empezar; planes de pago para más builds o builds más rápidos | minutos                                                                        | crea una **organización** si un equipo va a compartir el proyecto                                                                                                                                                                                                       |
| **GitHub**                                    | un repositorio privado necesita **Team** (organización) o **Pro**               | minutos                                                                        | en los repositorios privados, los entornos con revisores, los rulesets y la protección de ramas dependen del plan                                                                                                                                                       |
| **Firebase** (para push en Android, opcional) | gratuito                                                                        | minutos                                                                        | un proyecto para emitir las credenciales de FCM                                                                                                                                                                                                                         |
| **Sentry** (opcional)                         | plan gratuito para empezar                                                      | minutos                                                                        | informes de crashes y errores                                                                                                                                                                                                                                           |
| Un **Mac** (opcional)                         | —                                                                               | —                                                                              | los builds de iOS se ejecutan en EAS; un Mac añade el simulador de iOS y los builds de iOS en local                                                                                                                                                                     |
| Un **gestor de contraseñas**                  | —                                                                               | —                                                                              | una bóveda compartida para los secretos de esta guía                                                                                                                                                                                                                    |

### La hoja de trabajo

| Dato                                                         | Valor                 | Fase |
| ------------------------------------------------------------ | --------------------- | ---- |
| Nombre de la app (tienda / pantalla de inicio)               |                       | 0    |
| Identificador                                                | `com.<empresa>.<app>` | 0    |
| Esquema de URL                                               |                       | 0    |
| `OWNER/REPO` de GitHub                                       |                       | 0    |
| Cuenta u organización de Expo                                |                       | 0    |
| Apple Team ID                                                |                       | 0    |
| URL de la API de staging / producción                        |                       | 6    |
| Dominio de los enlaces (opcional)                            |                       | 6    |
| Id del proyecto de EAS                                       |                       | 7    |
| Token de acceso de Expo (`EXPO_TOKEN`)                       | gestor de contraseñas | 7    |
| DSN, org, proyecto y auth token de Sentry                    | gestor de contraseñas | 7    |
| Clave de la cuenta de servicio de Google (JSON)              | gestor de contraseñas | 9    |
| Clave de API de App Store Connect (Key ID, Issuer ID, `.p8`) | gestor de contraseñas | 9    |
| Id de la app en App Store Connect (numérico)                 |                       | 9    |
| Cuenta de prueba para los revisores (email/contraseña)       | gestor de contraseñas | 9    |
| URL de la política de privacidad, URL de soporte             |                       | 9    |

**Comprobación:** las líneas de la fase 0 de la hoja de trabajo están rellenas, y las cuentas de
Apple y de Google están, como mínimo, solicitadas.

---

## Fase 1. Tu equipo

### 1.1 Lo básico

| Herramienta        | Instalación                                                                                     | Comprobar                                     | Resultado esperado                                                 |
| ------------------ | ----------------------------------------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------ |
| Git                | Windows: Git for Windows (incluye Git Bash); macOS: `xcode-select --install`                    | `git --version`                               | cualquier versión actual                                           |
| Node.js 24         | nvm/fnm o el instalador oficial (24 LTS)                                                        | `node --version`                              | `v24.15.0` o posterior                                             |
| pnpm               | `corepack enable` (Node.js 25 y posteriores no traen Corepack: antes `npm install -g corepack`) | `pnpm --version` (dentro del proyecto)        | `12.5.1`                                                           |
| GitHub CLI         | cli.github.com                                                                                  | `gh auth status` (después de `gh auth login`) | `Logged in to github.com`                                          |
| Docker             | Docker Desktop (Windows, macOS) o Docker Engine con el plugin de Compose (Linux)                | `docker compose version`                      | `Docker Compose version v2…`                                       |
| EAS CLI            | `npm install -g eas-cli`                                                                        | `eas --version`                               | `eas-cli/…` (24 o posterior)                                       |
| VS Code (sugerido) | code.visualstudio.com                                                                           |                                               | ofrece las extensiones recomendadas (Expo Tools, ESLint, Prettier) |

### 1.2 Android Studio, el SDK y un emulador

1. Instala **Android Studio** (developer.android.com/studio). En el primer arranque, acepta la
   configuración estándar: instala el SDK de Android, las platform tools y un emulador.
2. **SDK Manager** (More Actions → SDK Manager): en **SDK Platforms**, la última versión de Android;
   en **SDK Tools**, _Android SDK Build-Tools_, _Android SDK Platform-Tools_, _Android Emulator_,
   _NDK (Side by side)_, _CMake_.
3. **Device Manager** (More Actions → Virtual Device Manager): **Create device** → un teléfono Pixel
   → una imagen de sistema reciente con Google APIs → Finish. Arráncalo una vez con ▶.
4. **JDK 17** (la versión que soporta React Native; el JDK propio de Android Studio es más nuevo):
   instala Temurin 17 (adoptium.net).
5. Variables de entorno (Windows: System → Advanced → Environment Variables, con Windows en español
   Sistema → Configuración avanzada del sistema → Variables de entorno; macOS/Linux: tu `~/.zshrc` o
   `~/.bashrc`):

   | Variable       | Valor                                                                                                           |
   | -------------- | --------------------------------------------------------------------------------------------------------------- |
   | `ANDROID_HOME` | Windows `C:\Users\<tu usuario>\AppData\Local\Android\Sdk`; macOS `~/Library/Android/sdk`; Linux `~/Android/Sdk` |
   | `JAVA_HOME`    | la carpeta del JDK 17                                                                                           |
   | `PATH`         | añade `$ANDROID_HOME/platform-tools` y `$ANDROID_HOME/emulator`                                                 |

6. **Solo en Windows**, para los builds nativos de Android en tu equipo:
   - pon tus proyectos en una carpeta de ruta corta (`C:\dev`), no en lo profundo de tu carpeta de
     usuario;
   - activa las rutas largas (en una PowerShell de administrador):
     `New-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem" -Name LongPathsEnabled -Value 1 -PropertyType DWORD -Force`;
   - añade la variable de entorno de usuario `pnpm_config_node_linker` = `hoisted`.

   (Por qué: [testing.md](testing.md#end-to-end). Como alternativa, compila en WSL 2, o deja que
   compile EAS.)

**Comprobación** (en una terminal nueva): `adb --version` imprime una versión; `emulator -list-avds`
lista tu dispositivo virtual; `java -version` imprime `17`.

### 1.3 Xcode (solo macOS)

1. Instala **Xcode** desde la App Store, ábrelo una vez, acepta la licencia e instala el simulador
   de iOS que te ofrece.
2. `xcode-select --install` (herramientas de línea de comandos), y después
   `sudo xcode-select -s /Applications/Xcode.app`.
3. CocoaPods: `brew install cocoapods`.

**Comprobación:** `xcrun simctl list devices available` lista iPhones; `pod --version` imprime una
versión.

### 1.4 Maestro (tests end-to-end)

- macOS/Linux: `curl -Ls "https://get.maestro.mobile.dev" | bash`
- Windows: descarga `maestro.zip` de la página de releases de Maestro en GitHub, descomprímelo en
  `C:\dev\maestro` y añade `C:\dev\maestro\bin` al `PATH` (usa el JDK 17 de 1.2).

**Comprobación:** `maestro --version` imprime una versión.

---

## Fase 2. Crea el proyecto

### 2.1 Tu repositorio a partir de la plantilla

En GitHub: el repositorio de la plantilla → **Use this template → Create a new repository**,
propietario `OWNER`, nombre `REPO`, **Private**. Después (en Windows, dentro de `C:\dev`):

```
gh repo clone OWNER/REPO
cd REPO
```

**Comprobación:** `ls` muestra `src`, `docs`, `apps/mobile/app.config.ts`, `apps/mobile/eas.json`.

### 2.2 La identidad de tu app

Abre `apps/mobile/app.config.ts` y cambia el bloque `APP`:

| Campo                   | Qué poner                                 |
| ----------------------- | ----------------------------------------- |
| `name`                  | el nombre de la pantalla de inicio        |
| `slug`                  | un id corto en minúsculas (`acme-portal`) |
| `identifier`            | tu identificador (`com.acme.portal`)      |
| `scheme`                | tu esquema de URL (`acmeportal`)          |
| `easProjectId`, `owner` | déjalos para la fase 8                    |
| `linkDomain`            | déjalo vacío hasta la fase 6              |
| `colors`                | déjalo para la fase 6 (marca)             |

Después: el `package.json` de la raíz → `"name"`; `README.md` → el título y el primer párrafo;
`SECURITY.md` → el contacto de seguridad y los plazos de respuesta; `.github/CODEOWNERS` → usuarios
o equipos reales, sin comentar; `apps/mobile/.maestro/flows/*.yaml` y
`apps/mobile/.maestro/stack/**/*.yaml` → `APP_ID: <identificador>.e2e` y `SCHEME: <esquema>-e2e`;
`apps/landing/src/lib/site.ts` → `SITE_NAME` (el mismo que `name`) y `PRIVACY_EMAIL`.

**Comprobación:** `git grep -n "com.example.templateapp"` solo lista documentación (`docs/`,
`apps/mobile/.maestro/README.md`) y fixtures de tests (`*.spec.*`, `scripts/*.test.mjs`, `e2e/`);
`git grep -n "REQUIERE CONFIGURACIÓN"` lista lo que queda para fases posteriores. (`templateapp` a secas sigue apareciendo en comentarios del código y en fixtures
de los tests: es normal.)

---

## Fase 3. Ejecútala en un emulador

### 3.1 Instala

```
corepack enable        # Node.js 25 o posterior: antes npm install -g corepack
pnpm install
```

**Comprobación:** termina con `Done in …`; `git config core.hooksPath` imprime `.husky/_`.

### 3.2 Configuración local

```
cp apps/mobile/.env.example apps/mobile/.env
```

Apunta a la API de este repositorio (`http://localhost:3010`, fase 3.5). Hasta entonces, sin
Docker, apúntala a la API mock: en `apps/mobile/.env`, `EXPO_PUBLIC_API_URL=http://localhost:4010`.

**Comprobación:** `git status` no lista `apps/mobile/.env` (está ignorado: nunca hagas commit de
él).

### 3.3 Arranca la API mock (terminal 1)

```
pnpm mock:api
```

**Comprobación:** imprime `Mock API on http://127.0.0.1:4010`. Déjala corriendo.

### 3.4 Compila y ejecuta la app (terminal 2)

Arranca el emulador desde el Device Manager de Android Studio (o con `emulator -avd <nombre>`), y
después:

```
adb reverse tcp:4010 tcp:4010
pnpm android
```

El primer build tarda 10–20 minutos (compila el código nativo); los siguientes son mucho más
rápidos.

**Comprobación**, en el emulador:

| Haz                                                         | Deberías ver                                           |
| ----------------------------------------------------------- | ------------------------------------------------------ |
| la app se abre                                              | la pantalla **Welcome**                                |
| toca **Get started**                                        | la pantalla **Sign in**                                |
| inicia sesión con `member@example.com` / `member-password`  | la lista **Items** (45 elementos)                      |
| escribe `7` en Search                                       | la lista se filtra a los elementos con un 7            |
| toca un elemento                                            | su pantalla de detalle                                 |
| vuelve atrás, y después **New item**, un título, **Create** | el elemento aparece arriba del todo en la lista        |
| pestaña **Settings**                                        | tu perfil, las opciones de tema, la versión y el build |
| cambia el tema a Dark                                       | toda la app se vuelve oscura                           |
| **Sign out** y confirma                                     | la pantalla Sign in                                    |

**iOS (en un Mac):** `pnpm ios` en lugar de `pnpm android` (el simulador llega a la API mock
directamente; sin `adb reverse`).

**Si falla:**

| Problema                                                    | Arreglo                                                                                                                                     |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| "You seem to be offline" al iniciar sesión                  | vuelve a ejecutar `adb reverse tcp:4010 tcp:4010` (después de cada reinicio del emulador)                                                   |
| `SDK location not found`                                    | `ANDROID_HOME` no está definida (1.2); abre una terminal nueva                                                                              |
| "A restricted method in java.lang.System has been called"   | `JAVA_HOME` tiene que ser el JDK 17                                                                                                         |
| Windows: `CMAKE_OBJECT_PATH_MAX`, "build.ninja still dirty" | 1.2 paso 6 (ruta corta, rutas largas, hoisted), después `rm -rf node_modules apps/mobile/node_modules apps/mobile/android` y `pnpm install` |

A partir de ahora: `pnpm mock:api` y `pnpm start`, y después abre la app instalada. Después de un
cambio nativo, `pnpm prebuild` y luego `pnpm android`: `pnpm android` solo genera
`apps/mobile/android/` cuando no existe.

### 3.5 La API real (Docker arrancado)

La app ha funcionado contra la API mock. Ahora la API de este repositorio, en tu máquina:

```
cp .env.example .env
cp apps/api/.env.example apps/api/.env
openssl rand -hex 32          # pégalo como JWT_ACCESS_SECRET en apps/api/.env
pnpm services:up              # PostgreSQL, Redis y Mailpit
pnpm db:migrate
pnpm db:seed
pnpm dev                      # terminal 1, en lugar de pnpm mock:api
```

**Comprobación:** `pnpm dev` muestra un recuadro con `API   http://127.0.0.1:3010/api`;
`http://127.0.0.1:3010/api/health/ready` responde `"status":"ok"`; `http://localhost:8045`
(Mailpit) se abre.

Apunta la app a ella: `EXPO_PUBLIC_API_URL=http://localhost:3010` en `apps/mobile/.env` (el valor
que trae `.env.example`), después
`adb reverse tcp:3010 tcp:3010` y `pnpm start` (terminal 2). Inicia sesión con
`member@example.com` / `member-password`: los mismos 45 elementos, ahora desde PostgreSQL. Para
volver a la API mock: `http://localhost:4010` y `pnpm mock:api`.

**Si falla:** un puerto ocupado por otro proyecto (`port is already allocated`): otro puerto en el
`.env` de la raíz y el mismo en `apps/api/.env`; la API se detiene al arrancar nombrando una
variable: defínela en `apps/api/.env` ([environment.md](environment.md)). Más en
[manual.es.md](manual.es.md#5-ejecutar-la-api).

---

## Fase 4. Comprueba que pasan todos los gates

### 4.1 El gate principal

```
pnpm verify
```

**Comprobación:** termina sin errores: los tests de la app y de la API pasados, la cobertura por
encima de los umbrales de las dos, `expo-doctor` `21/21 checks passed`, las comprobaciones de
seguridad OK, las cuatro líneas del presupuesto de bundle en `ok`.

### 4.2 Los tests de integración de la API (con los servicios arrancados)

```
pnpm test:integration
```

**Comprobación:** pasan todos los ficheros; se ejecutan en la base de datos `app_test`, nunca en tus
datos de desarrollo.

### 4.3 Comprobaciones con Docker (Docker arrancado)

```
pnpm sast
pnpm lint:workflows
pnpm exec playwright install chromium   # una vez
pnpm --filter landing build
pnpm test:e2e                           # la primera vez construye la imagen web: unos minutos
```

**Comprobación:** `0 findings`; `No findings to report`; `12 passed` (la landing, y los enlaces de la
app y sus archivos en la imagen web).

### 4.4 Los flujos end-to-end (opcional ahora, recomendado)

Con el emulador arrancado y `pnpm mock:api` en la terminal 1:

```
APP_VARIANT=e2e EXPO_PUBLIC_APP_ENV=development EXPO_PUBLIC_API_URL=http://localhost:4010 pnpm --filter mobile exec expo prebuild --platform android --clean --no-install
cd apps/mobile/android
APP_VARIANT=e2e EXPO_PUBLIC_APP_ENV=development EXPO_PUBLIC_API_URL=http://localhost:4010 ./gradlew assembleRelease -PreactNativeArchitectures=x86_64
cd ../../..
adb reverse tcp:4010 tcp:4010
adb shell settings put secure stylus_handwriting_enabled 0
adb shell settings put global hide_error_dialogs 1
adb install -r apps/mobile/android/app/build/outputs/apk/release/app-release.apk
pnpm test:e2e:mobile
```

**Comprobación:** `8/8 Flows Passed`. CI ejecuta lo mismo en cada pull request.

Después, los flujos contra la API real y Mailpit, con el mismo build (`pnpm dev` en la terminal 1
en lugar de la API mock, y las cuentas de ejemplo una vez):

```
pnpm db:seed
adb reverse tcp:4010 tcp:3010
pnpm test:e2e:mobile:stack
```

**Comprobación:** `1/1 Flow Passed`: los recorridos de cuenta (alta, cambio de correo, recuperación
de contraseña, borrado de cuenta).

`apps/mobile/android/` contiene ahora la variante `e2e`: ejecuta `pnpm prebuild` antes de volver a
`pnpm android`.

---

## Fase 5. Súbela a GitHub

### 5.1 Primer push

```
git add -A
git commit -m "chore: start from the mobile template"
git push --no-verify -u origin main
```

(`--no-verify` solo esta vez: a partir de ahora el hook rechaza los pushes a `main`.)

**Comprobación:** GitHub → **Actions** muestra **CI** y **E2E (Android)** ejecutándose en `main` y
terminando en verde.

### 5.2 Ajustes del repositorio

GitHub → **Settings**:

1. **General → Pull Requests**: solo **squash merging**, mensaje por defecto **Pull request
   title**, **Automatically delete head branches**.
2. **Actions → General → Workflow permissions**: **Read repository contents and packages
   permissions**, y marca **Allow GitHub Actions to create and approve pull requests** (el
   workflow **Release** abre el pull request de release con el token del workflow).
3. **Environments → New environment** `preview`: en deployment branches, **Selected branches** →
   `main`.
4. **Environments → New environment** `production`: lo mismo, más **Required reviewers** (marca
   **Prevent self-review**).
5. **Code security**: alertas y actualizaciones de seguridad de Dependabot, secret scanning con push
   protection (si está disponible), reporte privado de vulnerabilidades.
6. **Rules → Rulesets** (plan Team o repositorio público):

   ```
   gh api repos/OWNER/REPO/rulesets --method POST --input .github/rulesets/main.json
   gh api repos/OWNER/REPO/rulesets --method POST --input .github/rulesets/tags.json
   ```

   Con GitHub Pro, en su lugar: una regla de protección de rama en `main` (un pull request, una
   aprobación, los checks **CI passed** y **Conventions**). En el plan Free con un repositorio
   privado no hay ninguna de las dos, ni los revisores de los entornos: `main-guard.yml` avisa
   entonces de un push a `main` que no es un pull request mergeado, y `dependabot-auto-merge.yml`
   comprueba él mismo la aprobación y el CI, pero nada reemplaza a los revisores
   ([ci-cd.md](ci-cd.md#required-check)).

   El ruleset pide una aprobación de alguien distinto de la última persona que hizo push: un pull
   request necesita a un segundo miembro del equipo. Si trabajas solo, pon
   `required_approving_review_count` a `0` y `require_code_owner_review` y
   `require_last_push_approval` a `false` en `main.json` antes de importarlo; los pull requests,
   **CI passed**, **Conventions**, el historial lineal y los squash merges siguen siendo
   obligatorios.

7. Opcional, el token de release: sin él, el workflow **Release** lanza él mismo el CI y
   **Conventions** en el pull request de release. Con un token de una GitHub App o un
   **fine-grained personal access token** (tu avatar → Settings → Developer settings) limitado a
   `REPO`, con lectura y escritura en **Contents**, **Pull requests** e **Issues**, guardado con
   `gh secret set RELEASE_PLEASE_TOKEN`, el pull request de release ejecuta todos los workflows de
   pull request, como el de una persona ([ci-cd.md](ci-cd.md#release-pull-requests)).

**Comprobación:** Settings → Environments lista `preview` y `production` limitados a `main`; la
regla de `main` existe; si configuraste el token de release, `gh secret list` muestra
`RELEASE_PLEASE_TOKEN`.

### 5.3 Comprueba el flujo de pull request

```
git switch -c chore/check-pipeline
printf '\nBuilt from the mobile template.\n' >> README.md
git commit -am "docs: check the pipeline"
git push -u origin HEAD
gh pr create --fill
gh pr checks --watch
```

**Comprobación:** **CI passed** y **Conventions** en verde; una segunda persona lo aprueba; mergea
con **Squash and merge**. Un cambio `docs` o `chore` no publica nada, así que aún no aparece ningún
pull request de release: el workflow **Release** abre uno cuando el primer `feat` o `fix` llega a
`main`, y lanza el CI y **Conventions** en él (los dos en verde en ese pull request unos minutos
después). Déjalo abierto hasta la fase 11.

---

## Fase 6. Hazla tuya

Todo cambio a partir de aquí pasa por [el ciclo diario](#fase-15-el-ciclo-diario).

### 6.1 Tu backend

La API incluida es el backend de la app: tus funcionalidades le añaden módulos, y el contrato los
sigue (`pnpm contract`, [openapi/README.md](../openapi/README.md)).

1. Ponla a funcionar donde la alcancen tus usuarios, detrás de HTTPS, con su configuración de
   producción: el servidor de la [fase 7](#fase-7-el-servidor-la-api-y-el-sitio-público), primero
   staging (puedes hacerlo ahora y volver), o tu propia plataforma ([deploy-vps.md](deploy-vps.md)
   dice qué tiene que hacer cualquier destino). **REQUIERE CONFIGURACIÓN**.
2. Apunta tu `apps/mobile/.env` local a staging
   (`EXPO_PUBLIC_API_URL=https://staging.acme.com`: la imagen web reenvía `/api` a la API) y prueba
   la app contra ella; conserva la API mock para los flujos end-to-end.
3. Crea allí el primer administrador (7.10).

**Otro backend en su lugar:** pon su documento OpenAPI en `openapi/openapi.json`, haz que
`pnpm contract` solo regenere los tipos de la app (`pnpm --filter mobile api:types`) y quita
`apps/api` con sus scripts y sus jobs de CI. Tiene que ofrecer los endpoints de sesión de
[openapi/README.md](../openapi/README.md) (un inicio de sesión que devuelve un access token y un
refresh token, la renovación con el refresh token **en el cuerpo de la petición**, rotación);
`pnpm typecheck` lista cada sitio de la app que ya no coincide.

**Comprobación:** el inicio de sesión, las listas y los formularios funcionan contra staging;
`pnpm verify` pasa.

### 6.2 Tu marca

1. Sustituye las cinco imágenes de `apps/mobile/assets/images/` por las de tu diseñador, con los
   tamaños de [README.md](../README.md#branding) (icono de iOS sin transparencia; icono adaptativo
   de Android con el logo dentro del 66 % central; icono de notificación blanco sobre transparente).
2. Colores: `apps/mobile/src/ui/theme/tokens.ts` (la paleta y los colores claros/oscuros) y
   `APP.colors` en `apps/mobile/app.config.ts`. `pnpm test` comprueba el contraste del texto en los
   dos temas.
3. Los textos de las pantallas (`apps/mobile/src/features/*`), los puntos del onboarding, el nombre
   de la app.
4. Los iconos y el splash son nativos: `pnpm prebuild` y después `pnpm android` / `pnpm ios` para
   verlos.

**Comprobación:** el icono, el splash y los colores en el emulador son los tuyos; `pnpm test` pasa
(contraste).

### 6.3 Tus funcionalidades

Añade cada una junto al ejemplo de items, siguiendo
[mobile-architecture.md](mobile-architecture.md#adding-a-feature): el módulo de la API (esquemas,
servicio, controlador, migración, tests: [architecture.md](architecture.md)) → `pnpm contract` →
hooks de datos → pantalla → ruta → tests → un flujo de Maestro para un recorrido crítico. Cuando las
tuyas cubran la app, borra el ejemplo: `apps/mobile/src/features/items`, sus rutas en
`apps/mobile/src/app/(app)` (incluida la pestaña de inicio, `(tabs)/index.tsx`), los enlaces
`/items` de `apps/mobile/src/lib/links.ts` y sus tests, el flag `newItemForm`, el evento de
analítica `item_created`, sus tests, las rutas de items de la API mock, y
`apps/mobile/.maestro/flows/03-items.yaml`; en la API, `apps/api/src/items` (y después
`pnpm contract`), los elementos del seed, y la tabla `items` mediante una migración nueva
([database.md](database.md#expand-and-contract)). Los flujos `01` y `02` esperan `items-list` después del
inicio de sesión, y `04` abre un enlace de un item: apúntalos a tu pantalla de inicio y a tus
propios enlaces.

### 6.4 Piezas opcionales

- **Deep links desde tu dominio:** `APP.linkDomain` (el dominio del `APP_ORIGIN` de la API: los
  enlaces de sus correos apuntan ahí a `/app/…`), las rutas de `apps/mobile/src/lib/links.ts`, y la
  identidad de la app en la imagen web (`APPLE_TEAM_ID`, `IOS_BUNDLE_ID`, `ANDROID_PACKAGE`,
  `ANDROID_SHA256_CERT_FINGERPRINTS`), que entonces sirve `/.well-known/apple-app-site-association`
  y `/.well-known/assetlinks.json` reclamando `/app/*`
  ([environment.md](environment.md#web-variables),
  [mobile-architecture.md](mobile-architecture.md#deep-links)). Compruébalos con
  `pnpm smoke --url https://<dominio> --require-app-links`.
- **La landing:** el nombre, la dirección de privacidad, las fichas de las tiendas, los textos, el
  texto legal de la política de privacidad, la imagen compartida
  ([manual.es.md](manual.es.md#57-la-landing)).
- **Los enlaces a la tienda de la pantalla de actualizar:** cuando existan las fichas de las
  tiendas, `EXPO_PUBLIC_STORE_URL_IOS` y `EXPO_PUBLIC_STORE_URL_ANDROID` en cada entorno de EAS
  ([releases.md](releases.md#environment-variables)); los `MOBILE_MIN_VERSION_*` de la API deciden
  quién la ve ([releases.md](releases.md#minimum-supported-version)).
- **Notificaciones push:** la app registra cada teléfono en la API por sí sola
  ([mobile-architecture.md](mobile-architecture.md#notifications)); la API las envía en cuanto
  `PUSH_ENABLED` y `EXPO_ACCESS_TOKEN` están configurados (7.6), y los teléfonos necesitan las
  credenciales de FCM y APNs de 8.4. Una notificación propia:
  [how-to.md](how-to.md#send-a-push-notification).
- **Analítica:** un proveedor en `apps/mobile/src/lib/analytics/providers.ts`.

---

## Fase 7. El servidor: la API y el sitio público

La parte de servidor de la app, la API y la imagen web (la landing, los enlaces de la app y sus
ficheros), va en un servidor Linux por entorno y la despliega el workflow **Deploy**
([deploy-vps.md](deploy-vps.md) explica cada pieza). Haz del 7.0 al 7.7 dos veces: una para
**staging** y otra para **producción**. Los comandos usan `app.acme.com`; usa el dominio del entorno
que estás configurando: el de producción es el dominio de los enlaces de la app (`APP.linkDomain`,
fase 2.2), el de staging otro (`staging.acme.com`).

Los pasos 7.1 a 7.5 construyen el servidor y la base de datos a mano, con cualquier proveedor. En
DigitalOcean, Terraform puede construir el mismo servidor y una base de datos gestionada: haz el
7.0, sáltate del 7.1 al 7.5 y sigue en el 7.6.

### 7.0 En DigitalOcean, del 7.1 al 7.5 con Terraform (opcional)

Qué crea Terraform, cuánto cuesta y por qué:
[deploy-vps.md](deploy-vps.md#provision-with-terraform-digitalocean). Necesitas Terraform 1.17
([developer.hashicorp.com/terraform/install](https://developer.hashicorp.com/terraform/install);
`terraform version` imprime `Terraform v1.17.` y cualquier número de parche) y un token de la API
de DigitalOcean con permiso de escritura (**API → Tokens**).

En tu equipo, la clave de despliegue de este entorno (como en el 7.4) y después el fichero de
ajustes:

```
ssh-keygen -t ed25519 -N "" -C "github-deploy-production" -f deploy_production
cd infra/terraform/digitalocean
cp terraform.tfvars.example production.tfvars
```

Edita `production.tfvars`: `project_name`, `environment`, `domain`, tu clave pública SSH
(`admin_ssh_public_key`, el contenido de tu `~/.ssh/id_ed25519.pub`), el contenido de
`deploy_production.pub` (`deploy_ssh_public_key`) y `alert_emails` (miembros verificados de tu
equipo de DigitalOcean). Deja `admin_cidrs = ["0.0.0.0/0"]`: los runners de GitHub se conectan por
SSH desde direcciones que cambian. Después (pega el token cuando `read` espere, y pulsa Enter):

```
read -rs DIGITALOCEAN_TOKEN && export DIGITALOCEAN_TOKEN
terraform init
terraform workspace new production
terraform plan -var-file=production.tfvars -out=production.tfplan
terraform apply production.tfplan
rm production.tfplan
ssh "$(terraform output -raw ssh_admin)" cloud-init status --wait
```

La primera conexión SSH pregunta si confías en la clave del servidor: compara su huella con la que
muestra el servidor en la **Droplet Console** de DigitalOcean (entra como `ops` y ejecuta
`ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub`). Después apunta el dominio al servidor, salvo
que lo haya hecho `manage_dns = true`: el registro que muestra `terraform output dns_record`, en
tu proveedor de DNS. Por último, los roles de la base de datos y la clave del servidor para GitHub:

```
cd ../../..
pnpm iac:database
ssh-keyscan -t ed25519 app.acme.com > known_hosts_production
```

**Comprobación:** `cloud-init status --wait` termina con `status: done`; `pnpm iac:database` termina
con `Done: the database app (owner app_migrator) and the role app_runtime.`;
`ssh -i deploy_production deploy@app.acme.com 'docker ps'` imprime una tabla vacía (solo las
cabeceras); `ssh-keygen -lf known_hosts_production` muestra la huella que comparaste.

**Si falla:**

| Mensaje                                              | Causa y solución                                                                                                                                                                                                                          |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `401`, `Unable to authenticate you`                  | `DIGITALOCEAN_TOKEN` no está exportado en esta terminal, o el token no puede escribir                                                                                                                                                     |
| `Invalid value for variable`                         | el valor que nombra en `production.tfvars`; `variables.tf` dice qué acepta cada uno                                                                                                                                                       |
| `SSH Key is already in use on your account`          | esta clave de despliegue ya está en DigitalOcean (otro entorno, un intento anterior): una clave de despliegue por entorno, o borra la antigua allí (**Settings → Security**)                                                              |
| `Provider produced inconsistent result after apply`  | la nueva IP reservada tardó en aparecer en la API de DigitalOcean: `terraform import -var-file=production.tfvars digitalocean_reserved_ip.app <dirección>` (la dirección en **Networking → Reserved IPs**), después plan y apply de nuevo |
| `The workspace (...) is not the environment (...)`   | `terraform workspace select production`                                                                                                                                                                                                   |
| `status: error`                                      | `/var/log/cloud-init-output.log` en el servidor dice qué comando falló                                                                                                                                                                    |
| `pnpm iac:database`: `Permission denied (publickey)` | tu clave SSH no es la de `admin_ssh_public_key`                                                                                                                                                                                           |

### 7.1 Crea el servidor

En la consola de tu proveedor: un servidor con **Ubuntu 24.04 LTS**, 2 vCPU y 4 GB de RAM o más,
una IPv4 pública y tu clave pública SSH personal para el primer acceso. Si el proveedor tiene
firewall, permite TCP 22, 80 y 443, y UDP 443.

**Comprobación:** `ssh root@<IP del servidor>` (o el usuario que indique el proveedor) abre una shell
en el servidor.

### 7.2 Apunta el dominio al servidor

En tu proveedor de DNS: un registro **A** `app.acme.com` → la IPv4 del servidor. Ningún registro
**AAAA**: el despliegue sirve solo IPv4 ([deploy-vps.md](deploy-vps.md#2-create-the-server) explica
por qué).

**Comprobación**, después de unos minutos: `nslookup app.acme.com` responde con la dirección del
servidor.

### 7.3 Instala Docker y cierra el firewall

Conectado al servidor, copia estas líneas, un bloque cada vez:

```
sudo apt-get update
sudo apt-get install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

```
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 443/udp
sudo ufw --force enable
sudo apt-get install -y unattended-upgrades
sudo dpkg-reconfigure --priority=low unattended-upgrades
```

**Comprobación:** `docker compose version` imprime `Docker Compose version v2` o posterior;
`sudo ufw status` lista OpenSSH, 80 y 443 como `ALLOW`.

### 7.4 Crea el usuario de despliegue

En el servidor:

```
sudo adduser --disabled-password --gecos "" deploy
sudo usermod -aG docker deploy
sudo install -d -m 755 -o deploy -g deploy /srv/app
sudo install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
```

En **tu equipo**, una clave para que GitHub se conecte (una por entorno; sin frase de contraseña):

```
ssh-keygen -t ed25519 -N "" -C "github-deploy-production" -f deploy_production
scp deploy_production.pub <tu usuario>@app.acme.com:/tmp/deploy.pub
ssh <tu usuario>@app.acme.com 'sudo install -m 600 -o deploy -g deploy /tmp/deploy.pub /home/deploy/.ssh/authorized_keys && rm /tmp/deploy.pub'
ssh-keyscan -t ed25519 app.acme.com > known_hosts_production
```

**Comprobación:** `ssh -i deploy_production deploy@app.acme.com 'docker ps'` imprime una tabla vacía
(solo las cabeceras). Compara la clave de `known_hosts_production` con la clave de host que muestra
la consola de tu proveedor (o ejecuta `ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub` en el
servidor y `ssh-keygen -lf known_hosts_production` en tu equipo: las huellas tienen que coincidir).

### 7.5 Crea la base de datos

**En el servidor** (por defecto): aquí no hay nada que hacer. El 7.6 deja `COMPOSE_PROFILES=db` en
`server.env`, y el primer despliegue arranca PostgreSQL allí y crea la base de datos `app` y sus
roles, con las contraseñas que genera el 7.6 ([deploy-vps.md](deploy-vps.md#on-this-server)).

**Una base de datos gestionada:** en la consola de tu proveedor, un **PostgreSQL 16 o posterior**
gestionado: en la misma región que el servidor, con **backups automáticos** y **point-in-time
recovery** activados, **protección contra borrado** (deletion protection) activada, y acceso solo
desde la IP del servidor (o una red privada). Apunta su nombre de host.

Genera dos contraseñas (`openssl rand -hex 24`, dos veces) y guárdalas en el gestor de contraseñas.
Después, conectado como el administrador del proveedor
(`psql "<cadena de conexión del administrador>"`):

```sql
CREATE ROLE app_migrator LOGIN PASSWORD '<contraseña de app_migrator>';
GRANT app_migrator TO CURRENT_USER;
CREATE DATABASE app OWNER app_migrator;
CREATE ROLE app_runtime LOGIN PASSWORD '<contraseña de app_runtime>' CONNECTION LIMIT 50;
```

Después, conectado **como `app_migrator`** a la base de datos `app`
(`psql "postgresql://app_migrator:<contraseña de app_migrator>@<host>:5432/app?sslmode=require"`):

```sql
GRANT CONNECT ON DATABASE app TO app_runtime;
GRANT USAGE ON SCHEMA public TO app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO app_runtime;
```

**Comprobación:** cada sentencia responde `CREATE ROLE`, `GRANT ROLE`, `CREATE DATABASE`, `GRANT` o
`ALTER DEFAULT PRIVILEGES`, sin errores. Sin `GRANT app_migrator TO CURRENT_USER`, PostgreSQL 16 y
posteriores rechazan `CREATE DATABASE` (`must be able to SET ROLE "app_migrator"`): los
administradores de los proveedores no son superusuarios. El migrador será el propietario del
esquema y quien lo cambie; la API se conecta como `app_runtime`, que solo lee y escribe datos (no
el historial de migraciones: las migraciones del primer despliegue le retiran sus derechos sobre
él).

### 7.6 Copia los ficheros de despliegue al servidor

Desde la carpeta del proyecto en tu equipo:

```
scp deploy/vps/* deploy@app.acme.com:/srv/app/
```

Más adelante, cuando una release cambie alguno de estos ficheros (Dependabot actualiza las imágenes
de Caddy, PostgreSQL y Redis en `deploy/vps`), el workflow Deploy se detiene en **Check the server's
deploy files** hasta que los vuelvas a copiar
([deploy-vps.md](deploy-vps.md#update-the-server-files)).

En el servidor, como `deploy` (`ssh -i deploy_production deploy@app.acme.com`), cada fichero
desde su ejemplo (con una base de datos gestionada, sáltate `db.env` y `backup.env`):

```
cd /srv/app
chmod 755 deploy.sh rollback.sh db-init.sh backup.sh
cp server.env.example server.env
cp api.env.example api.env
cp migrate.env.example migrate.env
cp web.env.example web.env
cp redis.env.example redis.env
cp db.env.example db.env
cp backup.env.example backup.env
chmod 600 *.env
```

Después, los secretos: se generan en el servidor y se escriben en cada fichero que los necesita, sin
aparecer nunca en pantalla (con una base de datos gestionada, quita las líneas de `db.env` y
`backup.env`):

```
migrator=$(openssl rand -hex 24) runtime=$(openssl rand -hex 24) backup=$(openssl rand -hex 24) redis=$(openssl rand -hex 24)
sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(openssl rand -hex 24)|; s|^APP_MIGRATOR_PASSWORD=.*|APP_MIGRATOR_PASSWORD=$migrator|; s|^APP_RUNTIME_PASSWORD=.*|APP_RUNTIME_PASSWORD=$runtime|; s|^APP_BACKUP_PASSWORD=.*|APP_BACKUP_PASSWORD=$backup|" db.env
sed -i "s|^PGPASSWORD=.*|PGPASSWORD=$backup|" backup.env
sed -i "s|^REDIS_PASSWORD=.*|REDIS_PASSWORD=$redis|" redis.env
sed -i "s|<APP_RUNTIME_PASSWORD>|$runtime|; s|<REDIS_PASSWORD>|$redis|; s|^JWT_ACCESS_SECRET=.*|JWT_ACCESS_SECRET=$(openssl rand -hex 32)|" api.env
sed -i "s|<APP_MIGRATOR_PASSWORD>|$migrator|" migrate.env
unset migrator runtime backup redis
```

Edita cada fichero (`nano <fichero>`, guarda con `Ctrl+O`, sal con `Ctrl+X`):

| Fichero       | Define                                                                                                                                                                                                                                           |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `server.env`  | `APP_DOMAIN=app.acme.com`; deja `COMPOSE_PROFILES=db` (la base de datos en el servidor), o borra esa línea (una base de datos gestionada)                                                                                                        |
| `api.env`     | `APP_ENVIRONMENT=production` (o `staging`), `APP_ORIGIN=https://app.acme.com`; con una base de datos gestionada, también `DATABASE_URL=postgresql://app_runtime:<contraseña de app_runtime>@<host de la base de datos>:5432/app?sslmode=require` |
| `migrate.env` | nada, con la base de datos en el servidor; con una gestionada, `DATABASE_URL=postgresql://app_migrator:<contraseña de app_migrator>@<host de la base de datos>:5432/app?sslmode=require`                                                         |
| `web.env`     | nada todavía: la identidad de la app llega en las fases 8 y 10 (abajo)                                                                                                                                                                           |

Con Terraform (7.0), los dos valores de `DATABASE_URL` ya están completos: en
`infra/terraform/digitalocean` en tu equipo, `terraform output -raw database_runtime_url`
(`api.env`) y `terraform output -raw database_migrator_url` (`migrate.env`).

Con una base de datos gestionada en DigitalOcean o Amazon RDS, cuyos certificados vienen de la CA
propia del proveedor, termina las dos URL con `?sslmode=require&uselibpqcompat=true` (las salidas de
Terraform ya lo hacen): si no, la API rechaza el certificado (un error de certificado como
`self-signed certificate in certificate chain`,
[deploy-vps.md](deploy-vps.md#6-the-files-on-the-server)).

**Correo** (opcional, pero el registro, la recuperación de contraseña, las invitaciones y los
cambios de email de la app lo necesitan): en `api.env`,
`MAIL_SMTP_URL=smtps://<usuario>:<contraseña, codificada con %>@<host del proveedor>:465` y
`MAIL_FROM="Acme <no-reply@acme.com>"` de tu proveedor de correo (Amazon SES, Postmark, Resend,
Brevo...), y en el proveedor, SPF, DKIM y DMARC para `acme.com` ([manual](manual.es.md#53-correo)).
Tras el primer despliegue (7.8),
`docker compose --env-file server.env --env-file release.env run --rm -T api node dist/infrastructure/mail/mail.cli.js test --to <tú>`
debe imprimir `Delivered`. Si termina en `connection` o se agota el tiempo, puede que el servidor no
tenga permitido enviar SMTP (DigitalOcean bloquea los puertos 25, 465 y 587 en muchas cuentas): usa
el puerto 2525 del proveedor (`smtp://<usuario>:<contraseña>@<host del proveedor>:2525`, STARTTLS) o
pide al soporte de DigitalOcean que lo desbloquee.

**Notificaciones push** (opcional): en `api.env`, `PUSH_ENABLED=true` y
`EXPO_ACCESS_TOKEN=<token>`, un token de acceso de tu cuenta de Expo (expo.dev → **Settings →
Access tokens** → crea uno), con la seguridad reforzada de push activada en esa misma página
([manual](manual.es.md#59-notificaciones-push)). Los teléfonos necesitan las credenciales de 8.4.
Tras el primer despliegue (7.8),
`docker compose --env-file server.env --env-file release.env run --rm -T api node dist/infrastructure/push/push.cli.js status`
debe imprimir `Push is on.`

**La identidad de la app** (`web.env`), cuando la tengas: el Team ID de Apple y el identificador del
bundle (fase 8.3, cuando EAS registra la app), y el application id de Android con la huella SHA-256
de la clave de firma de Google (fase 10, cuando Play App Signing la custodia): descomenta las cuatro
líneas de `web.env`, rellénalas y vuelve a crear el contenedor web
(`docker compose --env-file server.env --env-file release.env up -d --wait web`). Hasta entonces,
los enlaces de los correos abren la página open-in-app en vez de la app
([deploy-vps.md](deploy-vps.md#6-the-files-on-the-server)).

**Comprobación:** `ls -l /srv/app` muestra cada fichero `.env` como `-rw-------` (solo `deploy` puede
leerlos), y `grep -nE '^[^#].*(<|example\.com)|^[A-Z_]+=$' *.env` no imprime nada (no queda ningún
marcador, dominio de ejemplo ni valor vacío).

### 7.7 Dale a GitHub los datos del servidor

Una vez para el repositorio:

```
gh variable set DEPLOY_TARGET --body vps
gh variable set IMAGE_PREFIX --body ghcr.io/<owner>/<repo>
```

(`IMAGE_PREFIX` en minúsculas: `ghcr.io/acme/acme-app`.)

Los entornos `staging` y `production` (Settings → Environments → New environment; ramas de
despliegue: solo `main`; producción con revisores obligatorios, como ya tiene `production` para
EAS, [ci-cd.md](ci-cd.md#environments)). Para el entorno que estás configurando (aquí `production`;
`staging` la otra vez):

```
gh variable set DEPLOY_HOST --env production --body app.acme.com
gh variable set PUBLIC_URL --env production --body https://app.acme.com
gh secret set DEPLOY_SSH_KEY --env production < deploy_production
gh secret set DEPLOY_KNOWN_HOSTS --env production < known_hosts_production
```

Guarda `deploy_production` en el gestor de contraseñas, y después bórralo de tu equipo junto con
`known_hosts_production`.

**Comprobación:** **Settings → Environments → production** lista las variables `DEPLOY_HOST`,
`PUBLIC_URL` y los secretos `DEPLOY_SSH_KEY`, `DEPLOY_KNOWN_HOSTS` (junto a `EXPO_TOKEN`);
**Settings → Secrets and variables → Actions → Variables** lista `DEPLOY_TARGET` e `IMAGE_PREFIX`.

Ahora repite el 7.0 o del 7.1 al 7.5, y después el 7.6 y el 7.7, para el otro entorno.

### 7.8 Despliega en staging

```
gh workflow run deploy.yml --ref main -f environment=staging -f ref=main
gh run watch
```

Tarda 15–25 minutos la primera vez. Los jobs, en orden: Resolve the commit → Gates → Publish
api / api-migrate / web → Release to staging (server).

**Comprobación:** la ejecución termina en verde; su resumen lista los tres digests de las imágenes; el
último paso imprime `Smoke test passed (public URL only).`; https://staging.acme.com abre la landing
con un certificado válido (el candado), y https://staging.acme.com/release.json nombra el commit
desplegado.

**Si falla:**

| Paso que falla                                                  | Causa y arreglo                                                                                                                                                                                                                       |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gates                                                           | lo mismo que un CI en rojo: abre el log del job que falla                                                                                                                                                                             |
| Publish: "The registry is ghcr.io"                              | `IMAGE_PREFIX` tiene que ser `ghcr.io/<owner>/<repo>` en minúsculas (7.7)                                                                                                                                                             |
| Publish: "Scan the pushed image"                                | un aviso HIGH o CRITICAL con arreglo en la imagen publicada, como en el escaneo de imágenes de los gates: actualiza la imagen base o la dependencia ([security.md](security.md#container-images))                                     |
| Environment settings                                            | falta una variable o un secreto del entorno (7.7)                                                                                                                                                                                     |
| Deploy on the server: `Permission denied (publickey)`           | la clave pública no está en `/home/deploy/.ssh/authorized_keys`, o `DEPLOY_SSH_KEY` tiene la clave privada equivocada (7.4)                                                                                                           |
| `Host key verification failed`                                  | `DEPLOY_KNOWN_HOSTS` no coincide con el servidor (7.4)                                                                                                                                                                                |
| Check the server's deploy files: "Server files out of date"     | una release cambió un fichero de `deploy/vps`: vuelve a copiarlos ([deploy-vps.md](deploy-vps.md#update-the-server-files))                                                                                                            |
| `server.env is missing` (o `redis.env`, `db.env`, `backup.env`) | el 7.6 no se hizo, o no entero, en ese servidor                                                                                                                                                                                       |
| `the data services did not start`                               | PostgreSQL o Redis no arrancaron: sus logs en el servidor (`docker logs app-db-1`, `docker logs app-redis-1`) dicen la causa, normalmente una contraseña del 7.6 ([troubleshooting.md](troubleshooting.md#deployment-and-operations)) |
| The migration failed                                            | `migrate.env`: contraseña o host equivocados, o la base de datos no es accesible desde el servidor (7.5)                                                                                                                              |
| The rollout failed                                              | el log del paso termina con las últimas líneas de log de los contenedores nuevos, y después la release anterior vuelve a arrancar; normalmente es `api.env` (`DATABASE_URL`, `JWT_ACCESS_SECRET`)                                     |
| Smoke test, errores de certificado                              | el DNS todavía no apunta al servidor, o los puertos 80/443 están cerrados (7.2, 7.3)                                                                                                                                                  |

### 7.9 Míralo

Abre https://staging.acme.com: la landing, en inglés, y en español en `/es/`;
https://staging.acme.com/app/reset-password muestra la página open-in-app. Apunta tu
`apps/mobile/.env` local a él (`EXPO_PUBLIC_API_URL=https://staging.acme.com` y después
`pnpm start`): nadie puede iniciar sesión todavía, las bases de datos de producción no tienen
cuentas.

### 7.10 Crea el primer administrador

En el servidor, como `deploy`:

```
cd /srv/app
read -rs PASSWORD
```

Escribe la contraseña (15 caracteres o más, unas cuantas palabras funcionan bien; no se muestra
nada), pulsa Enter y después:

```
printf '%s' "$PASSWORD" | docker compose --env-file server.env --env-file release.env \
  run --rm -T api node dist/users/create-user.cli.js \
  --email <email del primer administrador> --name "<Nombre>" --role admin
unset PASSWORD
```

**Comprobación:** imprime `Created the admin account <email> (<id>).`; inicia sesión desde la app con
ese email y esa contraseña; Ajustes muestra **Administration**, desde donde se invita por email al
resto del equipo.

### 7.11 Ensaya un rollback (staging)

Vuelve a desplegar staging con cualquier commit posterior de `main` (el 7.8 con `-f ref=main` tras
el siguiente merge): el build del 7.8 pasa a ser la release anterior, la que un rollback vuelve a
poner. En el servidor de staging:

```
cd /srv/app
./rollback.sh
```

**Comprobación:** imprime `rollback: running <commit del 7.8>`; https://staging.acme.com/release.json
nombra ese commit; el sitio y la app siguen funcionando. Tras un despliegue que solo volvió a
desplegar la release que ya corría, `rollback.sh` se niega (salida 2) y nombra la release anterior:
`./rollback.sh --previous` arranca esa.

Después devuelve staging con el workflow, como cualquier despliegue:

```
gh workflow run deploy.yml --ref main -f environment=staging -f ref=main
gh run watch
```

**Comprobación:** la ejecución termina en verde y `release.json` vuelve a nombrar el commit más
reciente. Hacer un rollback (una vuelta atrás) ya es algo que has hecho, no algo que has leído.

### 7.12 Producción

El mismo commit que ejecuta staging, ahora en producción (la ejecución espera a un revisor: ábrela
en GitHub → **Review deployments** → **Approve and deploy**):

```
gh workflow run deploy.yml --ref main -f environment=production -f ref=<el commit o tag de staging>
gh run watch
```

Después crea allí el primer administrador (7.10). A partir de la primera publicación en las
tiendas, despliega su tag en staging y luego en producción antes de construir la app (fase 11.1).

**Comprobación:** la ejecución termina en verde; producción no construye nada (su resumen lista los
tres digests de la ejecución de staging, "built and scanned by run <su id>"); https://app.acme.com
abre la landing, y https://app.acme.com/release.json nombra el mismo commit que staging.

---

## Fase 8. EAS y servicios

Todos los comandos `eas` de esta guía, de aquí al calendario de mantenimiento, se ejecutan en
`apps/mobile`, donde están `eas.json` y la configuración de la app: deja una terminal abierta allí.

### 8.1 El proyecto de EAS

```
cd apps/mobile
eas login
eas init
```

`eas init` crea el proyecto en tu cuenta de Expo (o en tu organización) e imprime su id; no puede
editar `apps/mobile/app.config.ts` por sí mismo. Copia los valores en `APP`:

```ts
easProjectId: '<el id que imprimió eas init>',
owner: '<tu cuenta u organización de Expo>',
```

**Comprobación:** `node scripts/check-eas-project.mjs` (en `apps/mobile`) imprime
`EAS project <id>`. Haz commit mediante un pull request (`chore: link the EAS project`).

### 8.2 Las variables de entorno de EAS

Para cada entorno de EAS (`development`, `preview`, `production`), la URL pública de la API: los
servidores de la fase 7, staging para `development` y `preview` (la imagen web reenvía `/api` a la
API, así que la URL es el origen del sitio):

```
eas env:create --environment production --name EXPO_PUBLIC_API_URL --value https://app.acme.com --visibility plaintext
eas env:create --environment preview --name EXPO_PUBLIC_API_URL --value https://staging.acme.com --visibility plaintext
eas env:create --environment development --name EXPO_PUBLIC_API_URL --value https://staging.acme.com --visibility plaintext
```

Con Sentry (8.4), también por entorno: `EXPO_PUBLIC_SENTRY_DSN` (plaintext), `SENTRY_ORG` y
`SENTRY_PROJECT` (plaintext), `SENTRY_AUTH_TOKEN` (`--visibility secret`).

**Comprobación:** `eas env:list --environment production` lista las variables.

### 8.3 Credenciales de firma

EAS las crea y las guarda; nada va al repositorio. De forma interactiva, una vez por plataforma:

```
eas credentials -p android
```

Elige el perfil de build `production` → **Keystore → Set up a new keystore**; repite para
`preview`.

```
eas credentials -p ios
```

Inicia sesión con tu Apple ID cuando te lo pida (registra los bundle ids y crea el certificado y
los perfiles). Para cada uno de `production`, `preview` y `development`: **Build Credentials → Set
up all the required credentials**.

Los builds internos de iOS (`development`, `preview`) solo se instalan en iPhones registrados.
Registra el dispositivo de cada tester:

```
eas device:create
```

Imprime un enlace o un código QR: ábrelo en el iPhone e instala el perfil que te ofrece.

**Comprobación:** `eas credentials -p android` y `-p ios` muestran credenciales para cada perfil;
`eas device:list` lista los iPhones registrados.

### 8.4 Servicios de push y de reporte de errores (opcional)

- **Push en Android:** consola de Firebase → tu proyecto → añade una app Android con tu
  identificador → descarga `google-services.json` (nunca lo hagas commit). Guárdalo como variable de
  EAS de tipo fichero, por entorno:
  `eas env:create --environment production --name GOOGLE_SERVICES_JSON --type file --value ./google-services.json --visibility secret`
  (`apps/mobile/app.config.ts` la lee). Después Project settings → Service accounts → genera una
  clave privada (JSON); `eas credentials -p android` → `production` → **Google Service Account →
  Manage your Google Service Account Key for Push Notifications (FCM V1)** → súbela.
- **Push en iOS:** `eas credentials -p ios` → `production` → **Push Notifications** → configura una
  clave (EAS la crea con tu cuenta de Apple).
- **Push desde la API:** lo mismo para el perfil `preview`, cuyo identificador termina en
  `.preview`: una segunda app Android en el mismo proyecto de Firebase (así un solo
  `google-services.json` sirve para las dos; guárdalo también en el entorno `preview`) y su clave
  FCM V1; en iOS, la clave APNs de tu equipo seleccionada para `preview`. Con `PUSH_ENABLED` y
  `EXPO_ACCESS_TOKEN` en staging (7.6), en un teléfono con un build preview (9.2): permite las
  notificaciones en Ajustes y cambia la contraseña. Llega el aviso ("Your password was changed") y
  al tocarlo se abre Ajustes; `push status` en el servidor lo muestra `delivered` unos 15 minutos
  después.
- **Sentry:** crea un proyecto **React Native**; su DSN, el slug de tu org, el slug del proyecto y
  un auth token (Sentry → Settings → Auth Tokens, con scopes para releases y source maps) van a las
  variables de EAS de 7.2. Para los source maps de OTA, además:
  `gh variable set SENTRY_ORG --body <org>`, `gh variable set SENTRY_PROJECT --body <proyecto>`, y
  `gh secret set SENTRY_AUTH_TOKEN --env production` (y `--env preview`).

### 8.5 El token para GitHub

expo.dev → tu cuenta u organización → **Settings → Access tokens**: crea un token (para una
organización, mejor un **robot user** con el rol Developer que un token personal; cuando el canal
de producción esté protegido, 11.4, el de `production` necesita el rol Release Manager). Después:

```
gh secret set EXPO_TOKEN --env preview
gh secret set EXPO_TOKEN --env production
```

**Comprobación:** Settings → Environments → `production` lista `EXPO_TOKEN`.

---

## Fase 9. Primeros builds en dispositivos reales

### 9.1 Un build de desarrollo para tu teléfono

```
eas build --profile development --platform android
eas build --profile development --platform ios
```

Cada uno imprime un enlace y un código QR al terminar (unos 15–30 minutos). Ábrelo en el teléfono e
instálalo. Después, en tu equipo, `pnpm start` y abre la app instalada: se conecta al servidor de
desarrollo de tu equipo (en la misma red Wi-Fi).

**Comprobación:** la app se abre en el teléfono, y el menú de desarrollo aparece cuando lo agitas.

### 9.2 Un build de preview para los testers

GitHub → **Actions → EAS build → Run workflow** (desde `main`): perfil `preview`, plataforma `all`,
ref `main`. O bien:

```
gh workflow run eas-build.yml --ref main -f profile=preview -f platform=all -f ref=main
gh run watch
```

El workflow ejecuta todos los gates sobre ese commit y después pone los builds en cola en EAS;
síguelos en expo.dev → tu proyecto → Builds.

**Comprobación:** los builds terminan; los testers los instalan desde el enlace de la página del
build (Android: el APK; iPhone: solo dispositivos registrados) y la app habla con tu API de staging.
Pruébala con la checklist de
[DEFINITION_OF_DONE.md](../DEFINITION_OF_DONE.md#devices-and-platforms).

**Si falla:**

| Mensaje                                           | Arreglo                          |
| ------------------------------------------------- | -------------------------------- |
| `No EAS project`                                  | falta el commit de 8.1 en `main` |
| `Invalid app configuration: EXPO_PUBLIC_API_URL…` | 8.2 para ese entorno             |
| errores de credenciales                           | 8.3 para ese perfil              |
| `EXPO_TOKEN` vacío o no autorizado                | 8.5 para ese entorno             |

---

## Fase 10. Las fichas en las tiendas

### 10.1 Google Play

1. Play Console → **Create app**: nombre, idioma por defecto, App, Free o Paid, acepta las
   declaraciones.
2. **Dashboard → Set up your app**, todas las tareas: URL de la política de privacidad, **app
   access** (dale al equipo de revisión una cuenta de prueba), anuncios, cuestionario de
   clasificación de contenido, público objetivo, **data safety** (lo que recoge la app, de 0.1) y
   las demás declaraciones.
3. **Store listing**: descripción corta y descripción completa, el icono de 512×512, el feature
   graphic de 1024×500, al menos dos capturas de pantalla de teléfono.
4. **Cuenta de servicio para los envíos automáticos:** consola de Google Cloud → el proyecto
   vinculado a Play Console → IAM → **Service accounts → Create** → **Keys → Add key → JSON**
   (descárgala). En Play Console → **Users and permissions → Invite new users** → el email de la
   cuenta de servicio → permisos para gestionar las releases de esta app. Después:

   ```
   eas credentials -p android
   ```

   → `production` → **Google Service Account → Upload a Google Service Account Key** para los
   envíos → el fichero JSON.

**Comprobación:** el Dashboard muestra hechas las tareas de configuración;
`eas credentials -p android` muestra la clave de envío.

### 10.2 App Store

1. App Store Connect → **Apps → + → New App**: iOS, nombre, idioma principal, el bundle id
   registrado en 8.3 (tu identificador, sin sufijo), un SKU.
2. **App Information**: categoría, derechos de contenido, clasificación por edad. **Pricing and
   Availability**. **App Privacy**: los tipos de datos (de 0.1) y la URL de la política de
   privacidad.
3. **Clave de API de App Store Connect**: Users and Access → **Integrations → App Store Connect API
   → Generate API Key** (rol **App Manager**); descarga el `.p8` (solo se puede una vez), apunta el
   Key ID y el Issuer ID. Después `eas credentials -p ios` → `production` → **App Store Connect:
   Manage your API Key** → configúrala con esos valores.
4. Copia el **Apple ID** numérico de la app (App Information) en `apps/mobile/eas.json`, para que
   los envíos automáticos sepan a qué app subir (no es un secreto):

   ```json
   "submit": {
     "production": {
       "android": { "track": "internal", "releaseStatus": "draft" },
       "ios": { "ascAppId": "<Apple ID numérico>" }
     }
   }
   ```

   Haz commit mediante un pull request.

**Comprobación:** la ficha de la app existe en App Store Connect; `eas credentials -p ios` muestra
la clave de API; `apps/mobile/eas.json` tiene el `ascAppId`.

---

## Fase 11. La primera publicación en las tiendas

### 11.1 Crea la versión

Mergea el pull request de release, "chore(main): release <versión>". La versión sale de los commits
desde el `0.1.0` de la plantilla: el primer `fix` la convierte en 0.1.1, el primer `feat` en 0.2.0.
Para empezar en 1.0.0, mergea antes un pull request añadiendo el pie `Release-As: 1.0.0` a su
mensaje de commit en el diálogo de **Squash and merge**. El workflow **Release** crea el tag de la
versión (`v<versión>`).

Después, la parte de servidor de ese tag, antes que la app: el build de producción habla con la API
de producción, que ya tiene que servir el contrato de la release (7.8, 7.12):

```
gh workflow run deploy.yml --ref main -f environment=staging -f ref=v<versión>
gh run watch
gh workflow run deploy.yml --ref main -f environment=production -f ref=v<versión>
```

**Comprobación:** las dos ejecuciones terminan en verde, y https://app.acme.com/release.json nombra
el commit del tag.

### 11.2 La primera subida de Android es manual (regla de Google)

Compila sin enviar:

```
gh workflow run eas-build.yml --ref main -f profile=production -f platform=android -f ref=v<versión>
```

Un revisor aprueba la ejecución (**Review deployments**). Cuando el build termine en expo.dev,
descarga el `.aab`. Play Console → **Testing → Internal testing → Create new release** → sube el
`.aab`, las notas de la versión → **Save → Review release → Start rollout to Internal testing**.
Añade los emails de tus testers en la pestaña **Testers** y comparte el enlace de inscripción
(opt-in).

### 11.3 Cada build posterior: envío automático

```
gh workflow run eas-build.yml --ref main -f profile=production -f platform=all -f ref=<tag> -f submit=true
```

Después de la aprobación y del build, EAS hace el envío: Android al track interno **como borrador**
(draft; abre Play Console → Internal testing → el borrador → **Start rollout**), iOS a
**TestFlight** (los testers internos lo reciben después del procesamiento de Apple, 10–30 minutos).

Para la primera versión, ejecútalo para iOS: `-f platform=ios -f submit=true`.

**Comprobación:** el build aparece en Internal testing de Play Console y en TestFlight; los testers
lo instalan y funciona contra la API de producción.

### 11.4 Protege el canal de actualizaciones de producción

El primer build de producción creó el canal `production`. Permite publicar en él solo a un
Release Manager o superior, si la cuenta tiene canales protegidos (una beta privada del plan
Enterprise de Expo; sin ellos, sáltate este paso: el revisor del entorno `production` sigue siendo
el control):

```
eas channel:protect
```

(elige `production`). **Comprobación:** `eas channel:view production` lo muestra protegido. Desde
ahora el `EXPO_TOKEN` del entorno `production` debe ser de un Release Manager (8.5): con el rol
Developer, los workflows EAS update y EAS rollback ya no pueden publicar en producción.

### 11.5 Hazla pública

- **Google Play:** desde Internal testing, **promociona** la release a pruebas cerradas (Closed
  testing; cuentas personales: los 12 testers durante 14 días de 0.2), y después a **Production**
  con un **staged rollout** (despliegue gradual; por ejemplo, al 10 %), que vas ampliando mientras
  se mantenga la tasa sin crashes (Android vitals).
- **App Store:** la página de la versión → añade el build de TestFlight, **What's New**, las
  capturas de pantalla, las notas para la revisión con la cuenta de prueba → **Add for Review →
  Submit**. Elige **phased release** para las actualizaciones automáticas. La revisión suele tardar
  uno o dos días.

**Comprobación:** la app se puede descargar de las dos tiendas; Settings → About, en una
instalación desde la tienda, muestra tu versión y tu build.

---

## Fase 12. Actualizaciones OTA

### 12.1 Publica un cambio de JavaScript

1. Un cambio de JavaScript pequeño y visible (un texto) mediante un pull request, mergeado.
2. Primero, en preview:

   ```
   gh workflow run eas-update.yml --ref main -f channel=preview -f ref=main -f message="Fix the settings text" -f rollout=100
   ```

3. En un build de preview: abre la app, ciérrala del todo y vuelve a abrirla (la actualización se
   descarga en segundo plano y se aplica en el siguiente arranque). Settings → About muestra el
   nuevo id de **Update**.
4. Después producción, empezando por poco:

   ```
   gh workflow run eas-update.yml --ref main -f channel=production -f ref=main -f message="Fix the settings text" -f rollout=10
   ```

   Tras un día sin errores nuevos: `eas update:edit` → súbelo al 100 %.

Solo JavaScript y assets se pueden publicar así; un cambio nativo necesita un build nuevo
([releases.md](releases.md#what-can-ship-as-an-ota-update)).

### 12.2 Ensaya un rollback (preview)

```
eas update:list --branch preview
```

Apunta el group id de la penúltima actualización, y después:

```
gh workflow run eas-rollback.yml --ref main -f channel=preview -f target=earlier-update -f group=<id del grupo> -f message="Rollback rehearsal"
```

**Comprobación:** después de dos reinicios, la app de preview muestra el id de la actualización
anterior en Settings → About.

---

## Fase 13. Monitorización

1. **Sentry:** reglas de alerta para issues nuevos y para un pico de errores; comprueba que le llega
   un error de prueba (desde un build de preview).
2. **Play Console → Android vitals** y **App Store Connect → TestFlight / Xcode Organizer**: crashes
   y ANRs/hangs por versión.
3. **EAS:** después de cada actualización, `eas update:insights` (arranques, crashes y tamaño de un
   grupo de actualizaciones) o la página **Updates** del proyecto en expo.dev.
4. **El servidor:** las comprobaciones de disponibilidad de
   [observability.md](observability.md#uptime-monitoring) (`/healthz`, la API, los ficheros de
   enlaces de la app; con Terraform, la primera ya existe), los dashboards y las reglas de alerta de
   `observability/` cargados en tu backend
   ([observability.md](observability.md#use-them-with-your-backend)), sus notificaciones enrutadas
   por severidad ([alerting.md](alerting.md)) y la tabla de contactos de
   [incident-response.md](incident-response.md#roles-and-contacts) rellena.
5. Quién mira, con qué frecuencia, y quién responde a las reseñas de las tiendas.

**Comprobación:** alguien del equipo recibe las alertas de Sentry y las del servidor (para la API de
staging unos minutos: salta la comprobación de disponibilidad).

---

## Fase 14. Antes de los usuarios reales

- [ ] [DEFINITION_OF_DONE.md](../DEFINITION_OF_DONE.md) se cumple en cada funcionalidad publicada.
- [ ] Probada en un teléfono Android pequeño/antiguo y en un iPhone reciente, con el tamaño de letra
      más grande, modo oscuro, TalkBack y VoiceOver, y modo avión en mitad de una petición.
- [ ] Los formularios de privacidad de las tiendas (data safety, App Privacy) coinciden con lo que
      recogen la app y sus SDK.
- [ ] Si la app permite a los usuarios crear cuentas, también les permite **borrar su cuenta** desde
      la app (requisito de la App Store).
- [ ] La cuenta de prueba de los revisores funciona en producción.
- [ ] Los cambios de backend que necesita la app están en producción y son compatibles con todas las
      versiones que siguen instaladas.
- [ ] El servidor de producción: una restauración ensayada
      ([disaster-recovery.md](disaster-recovery.md#restore-testing)), sus backups copiados fuera de
      él, un rollback ensayado en staging (7.11) y
      `pnpm smoke --url https://app.acme.com --require-app-links` pasando.
- [ ] Los builds y las actualizaciones de producción requieren un revisor (entorno de GitHub) y el
      canal de producción está protegido donde la cuenta lo permite (11.4).
- [ ] El objetivo de sesiones sin crashes, acordado (por ejemplo, el 99.5 % de las sesiones) y
      vigilado.
- [ ] [production-readiness.md](production-readiness.md) firmado, con
      [store-compliance.md](store-compliance.md) para las dos tiendas y la revisión manual de
      [accessibility.md](accessibility.md#manual-testing) (documentos en inglés).

---

## Fase 15. El ciclo diario

| Paso                                              | Haz                                                                                                                                                                                 | Comprobación                                         |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| 1. Empieza                                        | `git switch main && git pull && pnpm install`, `pnpm dev` (o `pnpm mock:api`), `pnpm start`                                                                                         | la app funciona                                      |
| 2. Rama                                           | `git switch -c feat/<descripción>`                                                                                                                                                  |                                                      |
| 3. Cambio                                         | código y tests ([mobile-architecture.md](mobile-architecture.md#adding-a-feature)); `pnpm contract` si cambió la API; `pnpm --filter mobile exec expo install` para una dependencia | funciona en Android y en iOS                         |
| 4. Verifica                                       | `pnpm verify`; `pnpm test:integration` si cambió la API                                                                                                                             | en verde                                             |
| 5. Pull request                                   | `git commit`, `git push -u origin HEAD`, `gh pr create --fill`; marca el impacto en la release (OTA o build nuevo)                                                                  | **CI passed** y **E2E (Android)** en verde, aprobado |
| 6. Merge                                          | **Squash and merge**                                                                                                                                                                |                                                      |
| 7a. Cambio solo de JavaScript                     | EAS update a `preview`, prueba, después `production` con un despliegue gradual                                                                                                      | el nuevo id de actualización en los dispositivos     |
| 7b. Cambio nativo, o una versión para las tiendas | mergea el pull request de release → tag; EAS build `preview`, prueba; EAS build `production` con submit; promociona en las tiendas                                                  | la nueva versión en las tiendas                      |
| 8. Vigila                                         | Sentry, Android vitals, feedback de TestFlight                                                                                                                                      | sin crashes nuevos                                   |

---

## Fase 16. El calendario de mantenimiento

| Cuándo                              | Qué hacer                                                                                                                                                                                                                                                                                 |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cada semana                         | Aprueba los pull requests de Dependabot: los patch y minor se mergean solos cuando el CI está en verde; las majors y las de workflows las mergeas a mano.                                                                                                                                 |
| Cada release                        | Build de preview, prueba en dispositivos, build de producción, pruebas internas, despliegue gradual.                                                                                                                                                                                      |
| Cada SDK de Expo (unos tres al año) | Actualiza, un SDK cada vez ([releases.md](releases.md#expo-sdk-upgrades)).                                                                                                                                                                                                                |
| Cada trimestre                      | Revisa `audit.ignore` y los `overrides` de seguridad en `pnpm-workspace.yaml`; las versiones fijadas de EAS CLI, Maestro, Node.js y pnpm, y TypeScript ([ci-cd.md](ci-cd.md#keeping-the-stack-current)); la caducidad de `EXPO_TOKEN`, y la de `RELEASE_PLEASE_TOKEN` si lo configuraste. |
| Cada año                            | Renueva la membresía de Apple Developer y el certificado de distribución (`eas credentials -p ios`) antes de que caduquen.                                                                                                                                                                |
| Cada agosto                         | La fecha límite de Google Play para el target API level: publica antes un build con un SDK de Expo actual.                                                                                                                                                                                |
| Una major de PostgreSQL o Redis     | A mano, junto con `docker-compose.yml`, el `deploy/vps/compose.yaml` del servidor y las imágenes de CI; los datos de PostgreSQL se exportan y se restauran entre majors ([ci-cd.md](ci-cd.md#postgresql-and-redis)).                                                                      |
| Cada mes (el servidor)              | Borra las imágenes viejas y reinicia cuando haga falta ([deploy-vps.md](deploy-vps.md#keep-the-server-healthy)).                                                                                                                                                                          |
| Cada trimestre (el servidor)        | Un simulacro de restauración ([disaster-recovery.md](disaster-recovery.md#restore-testing)), una alerta de prueba por el enrutado, comprobar la copia de los backups fuera del servidor.                                                                                                  |

---

## Cuando algo no está en esta guía

| Situación                                                            | Dónde                                                                                                                                            |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Un mensaje de error                                                  | [troubleshooting.md](troubleshooting.md), [testing.md](testing.md#end-to-end)                                                                    |
| Un cambio habitual (una pantalla, un endpoint, un enlace, un correo) | [how-to.md](how-to.md) (en inglés)                                                                                                               |
| El servidor, sus backups, un incidente                               | [deploy-vps.md](deploy-vps.md), [disaster-recovery.md](disaster-recovery.md), [incident-response.md](incident-response.md)                       |
| Cómo funciona algo                                                   | [manual.es.md](manual.es.md)                                                                                                                     |
| La API: módulos, convenciones, datos, errores                        | [architecture.md](architecture.md), [api-conventions.md](api-conventions.md), [database.md](database.md), [error-handling.md](error-handling.md) |
| Builds, versiones, tiendas y actualizaciones en detalle              | [releases.md](releases.md)                                                                                                                       |
| Workflows y ajustes de GitHub                                        | [ci-cd.md](ci-cd.md)                                                                                                                             |
| Seguridad                                                            | [SECURITY.md](../SECURITY.md), la de la API: [security.md](security.md)                                                                          |
