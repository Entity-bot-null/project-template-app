# Starting a new project from this template

The complete walkthrough, with every command and what it should print, is the step-by-step guide
([step-by-step.md](../step-by-step.md); Spanish: [step-by-step.es.md](../step-by-step.es.md)). This
page is its checklist, and the list of the template's placeholders in each part. Delete
`docs/template/` once the project no longer needs it (nothing else depends on it).

## Checklist

- [ ] Information, decisions and accounts: the worksheet filled in, the store accounts requested
      ([phase 0](../step-by-step.md#phase-0-information-decisions-and-accounts))
- [ ] Tools installed: Node.js 24, pnpm, Docker, Android Studio (and Xcode on a Mac), Maestro
      ([phase 1](../step-by-step.md#phase-1-your-computer))
- [ ] Repository created from the template, the identity changed (below)
      ([phase 2](../step-by-step.md#phase-2-create-the-project))
- [ ] The app running on an emulator, against the mock API and the real one
      ([phase 3](../step-by-step.md#phase-3-run-it-on-an-emulator))
- [ ] Every gate green locally: `pnpm verify`, `pnpm test:integration`, `pnpm test:e2e`,
      `pnpm sast`, `pnpm lint:workflows`, `pnpm iac:check`, `pnpm observability:check`, the stack and
      `pnpm smoke` ([phase 4](../step-by-step.md#phase-4-prove-every-gate-passes))
- [ ] Pushed, repository settings, rulesets, environments
      ([phase 5](../step-by-step.md#phase-5-put-it-on-github))
- [ ] The product made yours: backend, brand, features
      ([phase 6](../step-by-step.md#phase-6-make-it-yours))
- [ ] The servers of staging and production
      ([phase 7](../step-by-step.md#phase-7-the-server-the-api-and-the-public-site))
- [ ] EAS, builds on devices, the store records, the first store release
      ([phases 8 to 11](../step-by-step.md#phase-8-eas-and-services))
- [ ] [production-readiness.md](../production-readiness.md) signed off before real users
      ([phase 14](../step-by-step.md#phase-14-before-real-users))

## The placeholders

`git grep -n "REQUIERE CONFIGURACIÓN"` lists every place the template leaves to the project. The
identity, by part:

| Part        | Placeholder                                                              | Where                                                                                                                                                                                    |
| ----------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The project | `project-template-app`, the README's title and first paragraph           | the root `package.json` (`name`), `README.md`                                                                                                                                            |
| The app     | `Template App`, `template-app`, `com.example.templateapp`, `templateapp` | the `APP` block of `apps/mobile/app.config.ts` (name, slug, identifier, scheme)                                                                                                          |
| The app     | `easProjectId`, `owner`                                                  | the same block, from `eas init` ([phase 8.1](../step-by-step.md#81-the-eas-project))                                                                                                     |
| The app     | `linkDomain`, empty                                                      | the same block: the production server's domain                                                                                                                                           |
| The app     | `<identifier>.e2e`, `<scheme>-e2e`                                       | `APP_ID` and `SCHEME` of `apps/mobile/.maestro/flows/*.yaml` and `apps/mobile/.maestro/stack/**/*.yaml`                                                                                  |
| The app     | the store pages of the update screen                                     | `EXPO_PUBLIC_STORE_URL_IOS`, `EXPO_PUBLIC_STORE_URL_ANDROID` in each EAS environment                                                                                                     |
| The API     | `MAIL_FROM`, `APP_ORIGIN`, the secrets                                   | `apps/api/.env` locally; `deploy/vps/api.env` on each server                                                                                                                             |
| The app     | push credentials (optional)                                              | the `GOOGLE_SERVICES_JSON` file variable in each EAS environment, the FCM V1 key and the APNs key on EAS ([phase 8.4](../step-by-step.md#84-push-and-error-reporting-services-optional)) |
| The API     | `PUSH_ENABLED`, `EXPO_ACCESS_TOKEN` (optional)                           | `deploy/vps/api.env` on each server ([manual.md](../manual.md#59-push-notifications))                                                                                                    |
| The landing | `Template App`, `privacy@example.com`                                    | `SITE_NAME` and `PRIVACY_EMAIL` in `apps/landing/src/lib/site.ts`                                                                                                                        |
| The landing | the store listings                                                       | `apps/landing/src/lib/stores.ts`                                                                                                                                                         |
| The landing | the privacy policy's legal text, the product's texts                     | `apps/landing/src/i18n/en.ts` and `es.ts`                                                                                                                                                |
| The server  | `app.example.com`, the passwords                                         | `deploy/vps/*.env` on each server (from the `.example` files, never committed)                                                                                                           |
| The server  | the app's identity for its links                                         | `deploy/vps/web.env`: `APPLE_TEAM_ID`, `IOS_BUNDLE_ID`, `ANDROID_PACKAGE`, `ANDROID_SHA256_CERT_FINGERPRINTS`                                                                            |
| The server  | `project_name`, `domain`, `alert_emails`                                 | `infra/terraform/digitalocean/<environment>.tfvars` (Terraform only)                                                                                                                     |
| Security    | `security@example.com`, the response times                               | `SECURITY.md`                                                                                                                                                                            |
| GitHub      | the owners of sensitive paths                                            | `.github/CODEOWNERS` (uncomment)                                                                                                                                                         |
| Operations  | the contacts, the RPO and RTO, the escalation                            | [incident-response.md](../incident-response.md#roles-and-contacts), [disaster-recovery.md](../disaster-recovery.md#rpo-and-rto), [alerting.md](../alerting.md)                           |
