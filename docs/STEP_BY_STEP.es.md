# Paso a paso: de cero a las tiendas

English version: [STEP_BY_STEP.md](STEP_BY_STEP.md). Las dos versiones tienen los mismos pasos; un
cambio en una se hace también en la otra, en el mismo pull request.

Este es el **instructivo**: qué hacer, en orden, desde la información y las cuentas que necesitas
antes de empezar hasta una app publicada en Google Play y en la App Store, y después el ciclo
diario. Cada paso dice qué hacer, el comando exacto, qué deberías ver si ha funcionado y qué hacer
si no. El [manual](MANUAL.es.md) explica cómo funcionan las cosas; esta página te dice qué hacer a
continuación.

Cómo usarla:

- Sigue las fases en orden y haz cada **Comprobación**: cada una demuestra que los pasos anteriores
  funcionaron.
- Los comandos se ejecutan en una terminal, en la raíz del proyecto. En Windows usa **Git Bash**.
- Lo que va entre `<ángulos>` es un valor que sustituyes; apunta los tuyos en la
  [hoja de trabajo](#la-hoja-de-trabajo).
- Algunas cuentas tardan días en aprobarse (Apple, Google): empieza primero por la fase 0 y después
  trabaja en las fases 1–6 mientras esperas.

## La línea de tiempo

| Fase                                                                                        | Con qué terminas                                                                   | Tiempo                          |
| ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------- |
| [0. Información, decisiones y cuentas](#fase-0-información-decisiones-y-cuentas)            | la hoja de trabajo rellena; las cuentas de las tiendas solicitadas                 | 2 h, más **días** de aprobación |
| [1. Tu equipo](#fase-1-tu-equipo)                                                           | Node, pnpm, Android Studio (y Xcode en un Mac), Maestro, EAS CLI                   | 1–2 h                           |
| [2. Crea el proyecto](#fase-2-crea-el-proyecto)                                             | tu copia con la identidad de tu app                                                | 20 min                          |
| [3. Ejecútala en un emulador](#fase-3-ejecútala-en-un-emulador)                             | la app funcionando contra la API mock                                              | 30–45 min                       |
| [4. Comprueba que pasan todos los gates](#fase-4-comprueba-que-pasan-todos-los-gates)       | las mismas comprobaciones que CI, en verde en local                                | 30–60 min                       |
| [5. Súbela a GitHub](#fase-5-súbela-a-github)                                               | el repositorio protegido, CI en verde en un pull request                           | 1 h                             |
| [6. Hazla tuya](#fase-6-hazla-tuya)                                                         | tu backend, tu marca y tus funcionalidades                                         | de días a semanas               |
| [7. EAS y servicios](#fase-7-eas-y-servicios)                                               | el proyecto de EAS, su configuración y las credenciales de firma                   | 1–2 h                           |
| [8. Primeros builds en dispositivos reales](#fase-8-primeros-builds-en-dispositivos-reales) | builds de desarrollo y de preview instalados en teléfonos                          | 1–2 h                           |
| [9. Las fichas en las tiendas](#fase-9-las-fichas-en-las-tiendas)                           | la app en Play Console y en App Store Connect, lista para recibir builds           | medio día                       |
| [10. La primera publicación en las tiendas](#fase-10-la-primera-publicación-en-las-tiendas) | la versión 1 en pruebas internas, después pública                                  | 1–2 días, más la revisión       |
| [11. Actualizaciones OTA](#fase-11-actualizaciones-ota)                                     | un arreglo de JavaScript publicado sin pasar por las tiendas; un rollback ensayado | 1 h                             |
| [12. Monitorización](#fase-12-monitorización)                                               | crashes y errores reportados, alguien pendiente de ellos                           | 1 h                             |
| [13. Antes de los usuarios reales](#fase-13-antes-de-los-usuarios-reales)                   | la checklist final aprobada                                                        | medio día                       |
| [14. El ciclo diario](#fase-14-el-ciclo-diario)                                             | cómo llega cada cambio a los usuarios                                              | cada día                        |
| [15. El calendario de mantenimiento](#fase-15-el-calendario-de-mantenimiento)               | qué hacer cada semana, cada release y cada trimestre                               | recurrente                      |

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
- [ ] **El backend**: la API con la que habla la app, sus URL HTTPS de staging y de producción, y su
      contrato OpenAPI. Si todavía no existe, la app funciona contra la API mock incluida hasta que
      exista. Si es la API de la plantilla web de esta familia de repositorios, planifica los
      endpoints de sesión para móvil (fase 6.1).
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
5. Variables de entorno (Windows: System → Advanced → Environment Variables, con Windows en español Sistema → Configuración avanzada del sistema → Variables de entorno; macOS/Linux: tu
   `~/.zshrc` o `~/.bashrc`):

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

   (Por qué: [TESTING.md](TESTING.md#end-to-end). Como alternativa, compila en WSL 2, o deja que
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

**Comprobación:** `ls` muestra `src`, `docs`, `app.config.ts`, `eas.json`.

### 2.2 La identidad de tu app

Abre `app.config.ts` y cambia el bloque `APP`:

| Campo                   | Qué poner                                 |
| ----------------------- | ----------------------------------------- |
| `name`                  | el nombre de la pantalla de inicio        |
| `slug`                  | un id corto en minúsculas (`acme-portal`) |
| `identifier`            | tu identificador (`com.acme.portal`)      |
| `scheme`                | tu esquema de URL (`acmeportal`)          |
| `easProjectId`, `owner` | déjalos para la fase 7                    |
| `linkDomain`            | déjalo vacío hasta la fase 6              |
| `colors`                | déjalo para la fase 6 (marca)             |

Después: `package.json` → `"name"`; `README.md` → el título y el primer párrafo; `SECURITY.md` → el
contacto de seguridad y los plazos de respuesta; `.github/CODEOWNERS` → usuarios o equipos reales,
sin comentar;
`.maestro/flows/*.yaml` → `APP_ID: <identificador>.e2e` y `SCHEME: <esquema>-e2e`.

**Comprobación:** `git grep -n "com.example.templateapp"` solo lista documentación (`docs/`,
`.maestro/README.md`); `git grep -n "REQUIERE CONFIGURACIÓN"` lista lo que queda para fases
posteriores. (`templateapp` a secas sigue apareciendo en comentarios del código y en fixtures de
los tests: es normal.)

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
cp .env.example .env
```

Ya apunta a la API mock (`http://localhost:4010`). No hay que definir nada más.

**Comprobación:** `git status` no lista `.env` (está ignorado: nunca hagas commit de él).

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

| Problema                                                    | Arreglo                                                                                                |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| "You seem to be offline" al iniciar sesión                  | vuelve a ejecutar `adb reverse tcp:4010 tcp:4010` (después de cada reinicio del emulador)              |
| `SDK location not found`                                    | `ANDROID_HOME` no está definida (1.2); abre una terminal nueva                                         |
| "A restricted method in java.lang.System has been called"   | `JAVA_HOME` tiene que ser el JDK 17                                                                    |
| Windows: `CMAKE_OBJECT_PATH_MAX`, "build.ninja still dirty" | 1.2 paso 6 (ruta corta, rutas largas, hoisted), después `rm -rf node_modules android` y `pnpm install` |

A partir de ahora: `pnpm mock:api` y `pnpm start`, y después abre la app instalada. Después de un
cambio nativo, `pnpm prebuild` y luego `pnpm android`: `pnpm android` solo genera `android/` cuando
no existe.

---

## Fase 4. Comprueba que pasan todos los gates

### 4.1 El gate principal

```
pnpm verify
```

**Comprobación:** termina sin errores: más de 200 tests pasados, la cobertura por encima de los
umbrales, `expo-doctor` `21/21 checks passed`, las comprobaciones de seguridad OK, las cuatro líneas
del presupuesto de bundle en `ok`.

### 4.2 Comprobaciones con Docker (Docker arrancado)

```
pnpm sast
pnpm lint:workflows
```

**Comprobación:** `0 findings`; `No findings to report`.

### 4.3 Los flujos end-to-end (opcional ahora, recomendado)

Con el emulador arrancado y `pnpm mock:api` en la terminal 1:

```
APP_VARIANT=e2e EXPO_PUBLIC_APP_ENV=development EXPO_PUBLIC_API_URL=http://localhost:4010 pnpm exec expo prebuild --platform android --clean --no-install
cd android
APP_VARIANT=e2e EXPO_PUBLIC_APP_ENV=development EXPO_PUBLIC_API_URL=http://localhost:4010 ./gradlew assembleRelease -PreactNativeArchitectures=x86_64
cd ..
adb reverse tcp:4010 tcp:4010
adb shell settings put secure stylus_handwriting_enabled 0
adb install -r android/app/build/outputs/apk/release/app-release.apk
pnpm test:e2e
```

**Comprobación:** `5/5 Flows Passed`. CI ejecuta lo mismo en cada pull request.

`android/` contiene ahora la variante `e2e`: ejecuta `pnpm prebuild` antes de volver a
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
   ([CI_CD.md](CI_CD.md#required-check)).

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
   pull request, como el de una persona ([CI_CD.md](CI_CD.md#release-pull-requests)).

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
después). Déjalo abierto hasta la fase 10.

---

## Fase 6. Hazla tuya

Todo cambio a partir de aquí pasa por [el ciclo diario](#fase-14-el-ciclo-diario).

### 6.1 Conecta tu backend

1. Pon el documento OpenAPI de tu API en `openapi/openapi.json`, y después `pnpm contract`.
2. `pnpm typecheck` lista cada sitio que ya no coincide: corrige los esquemas Zod y los hooks de
   `src/features/*/api.ts` y `src/auth/schemas.ts`.
3. La app espera los endpoints de sesión de
   [openapi/README.md](../openapi/README.md#what-the-app-expects-from-the-api) (un inicio de sesión
   que devuelve un access token y un refresh token, la renovación con el refresh token **en el
   cuerpo de la petición**, rotación). Un backend hecho solo para navegadores (como la API de la
   plantilla web, con una cookie HTTP-only) necesita que se le añadan esos endpoints para los
   clientes móviles.
4. Apunta tu `.env` local a tu API de staging (`EXPO_PUBLIC_API_URL=https://staging-api.acme.com`)
   y prueba la app contra ella; conserva la API mock para los tests.

**Comprobación:** el inicio de sesión, las listas y los formularios funcionan contra staging;
`pnpm verify` pasa.

### 6.2 Tu marca

1. Sustituye las cinco imágenes de `assets/images/` por las de tu diseñador, con los tamaños de
   [README.md](../README.md#branding) (icono de iOS sin transparencia; icono adaptativo de Android
   con el logo dentro del 66 % central; icono de notificación blanco sobre transparente).
2. Colores: `src/ui/theme/tokens.ts` (la paleta y los colores claros/oscuros) y `APP.colors` en
   `app.config.ts`. `pnpm test` comprueba el contraste del texto en los dos temas.
3. Los textos de las pantallas (`src/features/*`), los puntos del onboarding, el nombre de la app.
4. Los iconos y el splash son nativos: `pnpm prebuild` y después `pnpm android` / `pnpm ios` para
   verlos.

**Comprobación:** el icono, el splash y los colores en el emulador son los tuyos; `pnpm test` pasa
(contraste).

### 6.3 Tus funcionalidades

Añade cada una junto a `src/features/items`, siguiendo
[MOBILE_ARCHITECTURE.md](MOBILE_ARCHITECTURE.md#adding-a-feature): contrato → hooks de datos →
pantalla → ruta → tests → un flujo de Maestro para un recorrido crítico. Cuando las tuyas cubran la
app, borra el ejemplo: `src/features/items`, sus rutas en `src/app/(app)` (incluida la pestaña de
inicio, `(tabs)/index.tsx`), los enlaces `/items` de `src/lib/links.ts` y sus tests, el flag
`newItemForm`, el evento de analítica `item_created`, sus tests, las rutas de items del contrato y
de la API mock, y `.maestro/flows/03-items.yaml`. Los flujos `01` y `02` esperan `items-list`
después del inicio de sesión, y `04` abre un enlace de un item: apúntalos a tu pantalla de inicio y
a tus propios enlaces.

### 6.4 Piezas opcionales

- **Deep links desde tu dominio:** `APP.linkDomain`, las rutas de `src/lib/links.ts`, y los ficheros
  `/.well-known/apple-app-site-association` y `/.well-known/assetlinks.json` en ese dominio
  ([MOBILE_ARCHITECTURE.md](MOBILE_ARCHITECTURE.md#deep-links)).
- **Notificaciones push:** implementa `PushTokenRegistrar` con el endpoint de tu backend
  ([MOBILE_ARCHITECTURE.md](MOBILE_ARCHITECTURE.md#notifications)); las credenciales, en la fase
  7.4.
- **Analítica:** un proveedor en `src/lib/analytics/providers.ts`.

---

## Fase 7. EAS y servicios

### 7.1 El proyecto de EAS

```
eas login
eas init
```

`eas init` crea el proyecto en tu cuenta de Expo (o en tu organización) e imprime su id; no puede
editar `app.config.ts` por sí mismo. Copia los valores en `APP`:

```ts
easProjectId: '<el id que imprimió eas init>',
owner: '<tu cuenta u organización de Expo>',
```

**Comprobación:** `node scripts/check-eas-project.mjs` imprime `EAS project <id>`. Haz commit
mediante un pull request (`chore: link the EAS project`).

### 7.2 Las variables de entorno de EAS

Para cada entorno de EAS (`development`, `preview`, `production`), la URL pública de la API (la API
de staging para `development` y `preview`):

```
eas env:create --environment production --name EXPO_PUBLIC_API_URL --value https://api.acme.com --visibility plaintext
eas env:create --environment preview --name EXPO_PUBLIC_API_URL --value https://staging-api.acme.com --visibility plaintext
eas env:create --environment development --name EXPO_PUBLIC_API_URL --value https://staging-api.acme.com --visibility plaintext
```

Con Sentry (7.4), también por entorno: `EXPO_PUBLIC_SENTRY_DSN` (plaintext), `SENTRY_ORG` y
`SENTRY_PROJECT` (plaintext), `SENTRY_AUTH_TOKEN` (`--visibility secret`).

**Comprobación:** `eas env:list --environment production` lista las variables.

### 7.3 Credenciales de firma

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

### 7.4 Servicios de push y de reporte de errores (opcional)

- **Push en Android:** consola de Firebase → tu proyecto → añade una app Android con tu
  identificador → descarga `google-services.json` (nunca lo hagas commit). Guárdalo como variable de
  EAS de tipo fichero, por entorno:
  `eas env:create --environment production --name GOOGLE_SERVICES_JSON --type file --value ./google-services.json --visibility secret`
  (`app.config.ts` la lee). Después Project settings → Service accounts → genera una clave privada
  (JSON); `eas credentials -p android` → `production` → **Google Service Account → Manage your
  Google Service Account Key for Push Notifications (FCM V1)** → súbela.
- **Push en iOS:** `eas credentials -p ios` → `production` → **Push Notifications** → configura una
  clave (EAS la crea con tu cuenta de Apple).
- **Sentry:** crea un proyecto **React Native**; su DSN, el slug de tu org, el slug del proyecto y
  un auth token (Sentry → Settings → Auth Tokens, con scopes para releases y source maps) van a las
  variables de EAS de 7.2. Para los source maps de OTA, además:
  `gh variable set SENTRY_ORG --body <org>`, `gh variable set SENTRY_PROJECT --body <proyecto>`, y
  `gh secret set SENTRY_AUTH_TOKEN --env production` (y `--env preview`).

### 7.5 El token para GitHub

expo.dev → tu cuenta u organización → **Settings → Access tokens**: crea un token (para una
organización, mejor un **robot user** con el rol Developer que un token personal; cuando el canal
de producción esté protegido, 10.4, el de `production` necesita el rol Release Manager). Después:

```
gh secret set EXPO_TOKEN --env preview
gh secret set EXPO_TOKEN --env production
```

**Comprobación:** Settings → Environments → `production` lista `EXPO_TOKEN`.

---

## Fase 8. Primeros builds en dispositivos reales

### 8.1 Un build de desarrollo para tu teléfono

```
eas build --profile development --platform android
eas build --profile development --platform ios
```

Cada uno imprime un enlace y un código QR al terminar (unos 15–30 minutos). Ábrelo en el teléfono e
instálalo. Después, en tu equipo, `pnpm start` y abre la app instalada: se conecta al servidor de
desarrollo de tu equipo (en la misma red Wi-Fi).

**Comprobación:** la app se abre en el teléfono, y el menú de desarrollo aparece cuando lo agitas.

### 8.2 Un build de preview para los testers

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
Pruébala con la checklist de [DEFINITION_OF_DONE.md](../DEFINITION_OF_DONE.md#devices-and-platforms).

**Si falla:**

| Mensaje                                           | Arreglo                          |
| ------------------------------------------------- | -------------------------------- |
| `No EAS project`                                  | falta el commit de 7.1 en `main` |
| `Invalid app configuration: EXPO_PUBLIC_API_URL…` | 7.2 para ese entorno             |
| errores de credenciales                           | 7.3 para ese perfil              |
| `EXPO_TOKEN` vacío o no autorizado                | 7.5 para ese entorno             |

---

## Fase 9. Las fichas en las tiendas

### 9.1 Google Play

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

### 9.2 App Store

1. App Store Connect → **Apps → + → New App**: iOS, nombre, idioma principal, el bundle id
   registrado en 7.3 (tu identificador, sin sufijo), un SKU.
2. **App Information**: categoría, derechos de contenido, clasificación por edad. **Pricing and
   Availability**. **App Privacy**: los tipos de datos (de 0.1) y la URL de la política de
   privacidad.
3. **Clave de API de App Store Connect**: Users and Access → **Integrations → App Store Connect API
   → Generate API Key** (rol **App Manager**); descarga el `.p8` (solo se puede una vez), apunta el
   Key ID y el Issuer ID. Después `eas credentials -p ios` → `production` → **App Store Connect:
   Manage your API Key** → configúrala con esos valores.
4. Copia el **Apple ID** numérico de la app (App Information) en `eas.json`, para que los envíos
   automáticos sepan a qué app subir (no es un secreto):

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
la clave de API; `eas.json` tiene el `ascAppId`.

---

## Fase 10. La primera publicación en las tiendas

### 10.1 Crea la versión

Mergea el pull request de release, "chore(main): release <versión>". La versión sale de los commits
desde el `0.1.0` de la plantilla: el primer `fix` la convierte en 0.1.1, el primer `feat` en 0.2.0.
Para empezar en 1.0.0, mergea antes un pull request añadiendo el pie `Release-As: 1.0.0` a su
mensaje de commit en el diálogo de **Squash and merge**. El workflow **Release** crea el tag de la
versión (`v<versión>`).

### 10.2 La primera subida de Android es manual (regla de Google)

Compila sin enviar:

```
gh workflow run eas-build.yml --ref main -f profile=production -f platform=android -f ref=v<versión>
```

Un revisor aprueba la ejecución (**Review deployments**). Cuando el build termine en expo.dev,
descarga el `.aab`. Play Console → **Testing → Internal testing → Create new release** → sube el
`.aab`, las notas de la versión → **Save → Review release → Start rollout to Internal testing**.
Añade los emails de tus testers en la pestaña **Testers** y comparte el enlace de inscripción
(opt-in).

### 10.3 Cada build posterior: envío automático

```
gh workflow run eas-build.yml --ref main -f profile=production -f platform=all -f ref=<tag> -f submit=true
```

Después de la aprobación y del build, EAS hace el envío: Android al track interno **como borrador**
(draft; abre Play Console → Internal testing → el borrador → **Start rollout**), iOS a
**TestFlight** (los testers internos lo reciben después del procesamiento de Apple, 10–30 minutos).

Para la primera versión, ejecútalo para iOS: `-f platform=ios -f submit=true`.

**Comprobación:** el build aparece en Internal testing de Play Console y en TestFlight; los testers
lo instalan y funciona contra la API de producción.

### 10.4 Protege el canal de actualizaciones de producción

El primer build de producción creó el canal `production`. Permite publicar en él solo a un
Release Manager o superior, si la cuenta tiene canales protegidos (una beta privada del plan
Enterprise de Expo; sin ellos, sáltate este paso: el revisor del entorno `production` sigue siendo
el control):

```
eas channel:protect
```

(elige `production`). **Comprobación:** `eas channel:view production` lo muestra protegido. Desde
ahora el `EXPO_TOKEN` del entorno `production` debe ser de un Release Manager (7.5): con el rol
Developer, los workflows EAS update y EAS rollback ya no pueden publicar en producción.

### 10.5 Hazla pública

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

## Fase 11. Actualizaciones OTA

### 11.1 Publica un cambio de JavaScript

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
([RELEASES.md](RELEASES.md#what-can-ship-as-an-ota-update)).

### 11.2 Ensaya un rollback (preview)

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

## Fase 12. Monitorización

1. **Sentry:** reglas de alerta para issues nuevos y para un pico de errores; comprueba que le llega
   un error de prueba (desde un build de preview).
2. **Play Console → Android vitals** y **App Store Connect → TestFlight / Xcode Organizer**: crashes
   y ANRs/hangs por versión.
3. **EAS:** después de cada actualización, `eas update:insights` (arranques, crashes y tamaño de un
   grupo de actualizaciones) o la página **Updates** del proyecto en expo.dev.
4. Quién mira, con qué frecuencia, y quién responde a las reseñas de las tiendas.

**Comprobación:** alguien del equipo recibe las alertas de Sentry.

---

## Fase 13. Antes de los usuarios reales

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
- [ ] Los builds y las actualizaciones de producción requieren un revisor (entorno de GitHub) y el
      canal de producción está protegido donde la cuenta lo permite (10.4).
- [ ] El objetivo de sesiones sin crashes, acordado (por ejemplo, el 99.5 % de las sesiones) y
      vigilado.
- [ ] [PRODUCTION_READINESS.md](PRODUCTION_READINESS.md) firmado, con
      [STORE_COMPLIANCE.md](STORE_COMPLIANCE.md) para las dos tiendas y la revisión manual de
      [ACCESSIBILITY.md](ACCESSIBILITY.md#manual-testing) (documentos en inglés).

---

## Fase 14. El ciclo diario

| Paso                                              | Haz                                                                                                                                                                 | Comprobación                                         |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| 1. Empieza                                        | `git switch main && git pull && pnpm install`, `pnpm mock:api`, `pnpm start`                                                                                        | la app funciona                                      |
| 2. Rama                                           | `git switch -c feat/<descripción>`                                                                                                                                  |                                                      |
| 3. Cambio                                         | código y tests ([MOBILE_ARCHITECTURE.md](MOBILE_ARCHITECTURE.md#adding-a-feature)); `pnpm contract` si cambió la API; `pnpm exec expo install` para una dependencia | funciona en Android y en iOS                         |
| 4. Verifica                                       | `pnpm verify`                                                                                                                                                       | en verde                                             |
| 5. Pull request                                   | `git commit`, `git push -u origin HEAD`, `gh pr create --fill`; marca el impacto en la release (OTA o build nuevo)                                                  | **CI passed** y **E2E (Android)** en verde, aprobado |
| 6. Merge                                          | **Squash and merge**                                                                                                                                                |                                                      |
| 7a. Cambio solo de JavaScript                     | EAS update a `preview`, prueba, después `production` con un despliegue gradual                                                                                      | el nuevo id de actualización en los dispositivos     |
| 7b. Cambio nativo, o una versión para las tiendas | mergea el pull request de release → tag; EAS build `preview`, prueba; EAS build `production` con submit; promociona en las tiendas                                  | la nueva versión en las tiendas                      |
| 8. Vigila                                         | Sentry, Android vitals, feedback de TestFlight                                                                                                                      | sin crashes nuevos                                   |

---

## Fase 15. El calendario de mantenimiento

| Cuándo                              | Qué hacer                                                                                                                                                                                                                                                                                 |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cada semana                         | Aprueba los pull requests de Dependabot: los patch y minor se mergean solos cuando el CI está en verde; las majors y las de workflows las mergeas a mano.                                                                                                                                 |
| Cada release                        | Build de preview, prueba en dispositivos, build de producción, pruebas internas, despliegue gradual.                                                                                                                                                                                      |
| Cada SDK de Expo (unos tres al año) | Actualiza, un SDK cada vez ([RELEASES.md](RELEASES.md#expo-sdk-upgrades)).                                                                                                                                                                                                                |
| Cada trimestre                      | Revisa `audit.ignore` y los `overrides` de seguridad en `pnpm-workspace.yaml`; las versiones fijadas de EAS CLI, Maestro, Node.js y pnpm, y TypeScript ([CI_CD.md](CI_CD.md#keeping-the-stack-current)); la caducidad de `EXPO_TOKEN`, y la de `RELEASE_PLEASE_TOKEN` si lo configuraste. |
| Cada año                            | Renueva la membresía de Apple Developer y el certificado de distribución (`eas credentials -p ios`) antes de que caduquen.                                                                                                                                                                |
| Cada agosto                         | La fecha límite de Google Play para el target API level: publica antes un build con un SDK de Expo actual.                                                                                                                                                                                |

---

## Cuando algo no está en esta guía

| Situación                                               | Dónde                                                                          |
| ------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Un mensaje de error                                     | [README.md](../README.md#troubleshooting), [TESTING.md](TESTING.md#end-to-end) |
| Cómo funciona algo                                      | [MANUAL.es.md](MANUAL.es.md)                                                   |
| Builds, versiones, tiendas y actualizaciones en detalle | [RELEASES.md](RELEASES.md)                                                     |
| Workflows y ajustes de GitHub                           | [CI_CD.md](CI_CD.md)                                                           |
| Seguridad                                               | [SECURITY.md](../SECURITY.md)                                                  |
