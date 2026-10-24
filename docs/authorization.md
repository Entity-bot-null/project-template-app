# Authorization

Who may do what is decided by the API, on every request. The app only decides what to **show**
(the `Stack.Protected` guards of `apps/mobile/src/app/_layout.tsx`): a hidden screen or button is
never the protection, since anyone can call the API with their own token, from any client.

Three checks, all required:

| Check                                | Question                                 | Where                                                        | Answer when refused |
| ------------------------------------ | ---------------------------------------- | ------------------------------------------------------------ | ------------------- |
| Authentication                       | Is there a valid access token?           | `@Auth()` on the controller (`JwtAuthGuard`)                 | 401                 |
| Role (RBAC)                          | May this kind of account use this route? | `@Auth('admin')`, or `@RequireRoles('admin')` on one handler | 403                 |
| Object level (BOLA/IDOR, OWASP API1) | May this caller touch **this** record?   | the service, **inside the query**                            | 404                 |

Broken object-level authorization is the most common API vulnerability: a signed-in user changes
an id in a URL and reads or changes someone else's record. Linters and SAST cannot see it, since
the code is valid; only the rules below, and tests that try it, catch it.

## Authentication

`JwtAuthGuard` (`apps/api/src/auth/jwt-auth.guard.ts`) checks the access token's signature, expiry
and claims offline, then reads the account by its primary key and compares the token's security
version with the account's: a password change or reset ends every access token at once, and the
tokens of a deleted account stop working (401). The caller it puts on the request (`id`, `role`) is
what `@CurrentUser()` returns. The role is the token's, read from the database at sign-in and at
every renewal: a role changed in the database applies from the session's next renewal, at most 15
minutes later (the access token's lifetime).

## Roles

`@Auth()` on a controller protects every handler in it, including the ones added later. To narrow
one handler to a role, use `@RequireRoles('admin')` (`GET /api/users` in
`apps/api/src/users/users.controller.ts`). A handler-level `@Auth('admin')` inside an `@Auth()`
controller would register the guards a second time and run them twice. A handler's roles replace
its controller's (`RolesGuard`), and a handler without roles inherits them, so a handler can never
loosen an `@Auth('admin')` controller (`InvitationsController`).

Roles live in `ROLES` (`apps/api/src/common/types/request-user.ts`) and the Prisma `Role` enum; a
unit spec checks that they match. Adding one also takes a migration (`ALTER TYPE ... ADD VALUE`, an
expand step) and the app's `SessionUserSchema` (`apps/mobile/src/auth/schemas.ts`): installed app
versions refuse a role they do not know at sign-in, so a new role can be given only once every
supported app version knows it
([api-conventions.md](api-conventions.md#versioning-and-compatibility)).

## Object level: the rules

1. **Ownership goes into the query** that reads or writes the record, never into a check after it
   (`ItemsService.findOwned`):

   ```ts
   const row = await this.prisma.item.findFirst({ where: { id, ownerId }, select: ITEM_SELECT });
   if (row === null) throw new NotFoundException(ITEM_NOT_FOUND);
   ```

   A fetch-then-compare is a second step to forget, and a concurrent change can slip in between.
   With the filter in the query, a record the caller may not see simply does not exist.

2. **Someone else's record answers 404**, with exactly the body of a missing one
   (`Item not found`), so ids cannot be probed for existence. 403 is for a record the caller may see
   but not change, for example a read-only member of a shared resource.
3. **The caller comes from the token, never from the request.** `@CurrentUser()` gives the caller.
   An owner id in the body, the query string or a header is ignored or refused, and the DTO schemas
   do not accept one: `CreateItemSchema` has no owner field, so an `ownerId` sent in the body is
   stripped. On creation, the owner is the caller (`ItemsController.create` passes `user.id`).
4. **Writes are scoped too, in one statement.** Use `updateMany` or `deleteMany` with the same
   filter, then check the count: 0 means not found (404).

   ```ts
   const { count } = await this.prisma.item.deleteMany({ where: { id, ownerId: actor.id } });
   if (count === 0) throw new NotFoundException(ITEM_NOT_FOUND);
   ```

   When the write needs the record first, read it with the scoped filter inside the same
   transaction. `InvitationsService.revoke` has this shape; its filter is the id alone because
   invitations belong to no one administrator, and its controller admits administrators only.

5. **Lists are scoped and paginated.** The count uses the same filter, so a total never reveals
   other users' records (`ItemsService.list` passes one `where` to the page and to the count).
6. **Nested routes check the whole path** in one query. For `/projects/:projectId/tasks/:taskId`:

   ```ts
   where: { id: taskId, project: { id: projectId, ownerId: actor.id } }
   ```

7. **Shared records** (teams, sharing) use a membership table. The filter becomes
   `members: { some: { userId: actor.id } }`, and stays in the query.
8. **Admin access is explicit**, written in the filter where the product needs it
   (`UsersService.findVisible`, where a user's own record is the one with their id):

   ```ts
   where: {
     AND: [{ id }, actor.role === 'admin' ? {} : { id: actor.id }];
   }
   ```

   If the product must audit who read whose data, log admins' reads of other users' records
   (REQUIERE CONFIGURACIÓN).

9. **Unguessable ids are not authorization.** UUIDs make enumeration hard, not impossible: ids
   leak through logs, links and shared screens, and the template's UUIDv7 start with their creation
   time. Validate their format (`ParseUUIDPipe`, so a malformed id is a 400), and still apply every
   rule above.
10. **Authorization is never cached.** A decision or a role in a cache outlives its change. Cache
    keys of owned data include the owner ([architecture.md](architecture.md#cache)). The one role
    kept between requests is the access token's, for at most 15 minutes
    ([Authentication](#authentication)).

In the template:

- **Users.** `UsersService.findVisible` applies rules 1, 2 and 8: a member reads only their own
  record, an admin any. `GET /api/users/me` reads the caller; `GET /api/users` is for admins only.
- **Items**, the example resource (`apps/api/src/items`): every query carries the owner (rules 1,
  2, 3 and 5); another user's item answers 404 like a missing one, and `GET /api/items` lists and
  counts only the caller's. Idempotency keys are per owner too. The module is the reference for a
  new owned resource: the model with `ownerId` and its index, scoped reads and writes, and the tests
  below.
- **Invitations** are an administrators' resource: `@Auth('admin')` on the controller
  (`/api/admin/invitations`), no owner, so any administrator lists and revokes any invitation.
  Accepting one is public (`POST /api/auth/invitations/accept`): the link's token is the
  authorization, and it works only while whoever sent the invitation is still an administrator (the
  acceptance reads the inviter's role under the invitation's lock).
- **Devices** (`/api/devices/{installationId}`, push notifications): an installation is the phone's
  own record, named by a random UUID the app made, which only the phone and the API know. A
  registration (`PUT`) is an upsert that **moves** the installation, and its token, to the caller:
  a shared phone changes account by signing in, and the previous account must stop getting its
  notices there. Were someone to learn another phone's installation id, a registration would only
  divert that phone's notifications until its next start registers it back; nothing is read
  through it. A removal (`DELETE`) touches the caller's own installation only (rules 1 and 2):
  another account's answers 404 like a missing one.
- **The account** (`/api/account/*`) acts on the caller only, taken from the token. The routes that
  change credentials or delete the account also ask for the current password, and answer 403 when
  it is wrong: the session is fine, and a 401 would make the app renew it and send the request
  again ([security.md](security.md#account-deletion)).

## Tests

Every route on one owned record gets the **access matrix**: `expectRecordAccess` in
`apps/api/test/access.ts`.

```ts
await expectRecordAccess(t.server, {
  path: (itemId) => `/api/items/${itemId}`,
  id,
  owner: asAda(),
  other: asGrace(),
});
```

It checks four things:

- without a token, 401;
- from another account with the owner's role, 404 with exactly the body a missing record gets
  (`MISSING_ID`);
- the owner gets through: 200, or `status`;
- so does an admin, when `admin` is given.

The refusals run first, so a write reaches the record only from the owner. Writes pass `method`
(`put`, `patch`, `delete`) and `body`. A delete checks the admin with a record of its own, since the
owner's call removes it: the helper refuses `admin` together with `delete`.

The integration specs (`pnpm test:integration`, against PostgreSQL) that cover authorization:

- `apps/api/src/items/items.int.spec.ts`: `GET /api/items/{id}` through its owner only, another
  user's item answering 404 like a missing one, and a non-UUID id 400; the list returns and counts
  only the caller's items (another user's item is neither listed nor counted); every route needs a
  session; an `Idempotency-Key` used by one user is free for another.
- `apps/api/src/users/users.int.spec.ts`: `GET /api/users/{id}` with an admin (`admin: asAdmin()`):
  the owner and admins read the record, another member gets a missing record's 404; the id matches
  whatever its letter case; a non-UUID id is a 400; `GET /api/users` refuses members (403).
- `apps/api/src/devices/devices.int.spec.ts`: both routes need a session; a registration moves an
  installation to whoever signs in on it, and a token to its new installation; a removal of
  another account's installation answers 404 like a missing one and leaves it; a non-UUID id is a 400.
- `apps/api/src/invitations/invitations.int.spec.ts`: every invitation route refuses members (403);
  an invitation stops working once whoever sent it is no longer an administrator.

Unit tests assert the filter in the query: `apps/api/src/items/items.service.spec.ts`
(`{ id, ownerId }` for one item, the same `where` for the page and the count) and
`apps/api/src/users/users.service.spec.ts` (`AND: [{ id }, { id: actor.id }]` for a member, `{}`
for an admin). Route protection has its own: `auth.decorator.spec.ts` (the guards registered once,
on the controller; `@RequireRoles` narrows a handler without loosening its controller),
`roles.guard.spec.ts`, and `apps/api/src/openapi/openapi.spec.ts` (every route outside `/api/auth/`
and `/api/health/` requires the bearer token).

## Review

Reviewers ask for these on every change to the API
([DEFINITION_OF_DONE.md](../DEFINITION_OF_DONE.md)):

- [ ] Every route: `@Auth(...)` with the right roles, or public on purpose, with the reason in a
      comment.
- [ ] Every query on an owned model carries the owner filter; every write is scoped and checks
      its count.
- [ ] No owner id taken from the request.
- [ ] An access-matrix test for each new route on one record, and a scoped-list test.
