# Dev-Auth & Backend Module Infrastructure

**Issue:** casehubio/casehub-pages#88, casehubio/casehub-pages#21
**Date:** 2026-07-02
**Status:** Approved

## Context

casehub-pages is a 100% TypeScript web application framework that runs fully client-side. This design introduces an optional Quarkus backend that enhances functionality when present — authentication, layout persistence, and (eventually) server-side data processing. The frontend always works without a backend; the backend is an optimization/enhancement path.

**Issue scope:** This spec addresses #88 (dev-auth) and the backend module infrastructure needed to support it — auth, layout persistence, and the data module scaffold. It is the first increment toward #21 (Optional Quarkus backend MVP). #21's remaining scope (capabilities API, dataset CRUD, SQL data provider, RemoteDataService) is follow-up work that builds on this foundation.

Consumer applications (devtown, aml, clinical, life, etc.) depend on specific backend modules at build time — pay for what you use.

## Architectural Principle

The frontend consumes services through a uniform interface and is completely agnostic about whether those services are browser-local implementations or server-backed. Events flow to "services" — the frontend never makes an "am I talking to a server?" decision. The app wires the execution environment at configuration time.

- `LayoutStore`: `createLocalLayoutStore()` (browser) or `createRestLayoutStore()` (server)
- Data processing: browser-native services as baseline, server-side services when backend present
- Auth: login gate renders only when backend URL is configured

## Maven Structure

```
backend/
  pom.xml                          ← io.casehub:casehub-pages-backend (parent POM)
  auth/pom.xml                     ← io.casehub:casehub-pages-auth
  layout/pom.xml                   ← io.casehub:casehub-pages-layout (SPI + REST)
  layout-sqlite/pom.xml            ← io.casehub:casehub-pages-layout-sqlite
  data/pom.xml                     ← io.casehub:casehub-pages-data-backend
```

**Parent POM** inherits `casehub-parent` (0.2-SNAPSHOT) — gets Quarkus 3.32.2 BOM, Java 21, managed plugin config. Version: `0.1-SNAPSHOT`.

**Folder naming** follows platform convention: short descriptive names, no repo prefix.

**Artifact naming:** `casehub-pages-data-backend` avoids collision with the npm `@casehubio/pages-data` package.

**Consumer usage:**
```xml
<dependency>
  <groupId>io.casehub</groupId>
  <artifactId>casehub-pages-auth</artifactId>
</dependency>
```

## §1 Auth Module (`backend/auth/`)

Lightweight JWT authentication for dev/test mode. No password, no Keycloak, no Docker. Real `SecurityIdentity`, real `@RolesAllowed`.

**Dependency:** `quarkus-smallrye-jwt` (in Quarkus BOM).

**Endpoint:** `POST /dev/auth/login`

```json
// Request
{ "name": "alice", "roles": ["user", "admin"] }

// Response
{ "token": "eyJhbG..." }
```

- `name` required, `roles` optional (defaults to `["user"]`)
- JWT claims: `sub` = name, `groups` = roles, `iss` = configured issuer, `tenant_id` = configurable (default: `"dev"`), 24h expiry
- Uses Quarkus 3.22+ auto-generated RSA keypair — no PEM files

**Profile gating:** Endpoint annotated with `@UnlessBuildProfile("prod")` — active in dev and test profiles, excluded from prod builds.

**Configuration:**
```properties
%dev.mp.jwt.verify.issuer=casehub-dev
%test.mp.jwt.verify.issuer=casehub-dev
```

`mp.jwt.verify.issuer` must be explicitly set (Quarkus 3.22.1+ requirement — default issuer forced otherwise, tokens fail validation).

**Security mechanism coexistence:** SmallRye JWT and OIDC are not competing CDI beans — they are independent Quarkus `HttpAuthenticationMechanism` providers that coexist via Quarkus' standard security multiplexing. In dev/test, OIDC is disabled (`%dev.quarkus.oidc.enabled=false`) and SmallRye JWT handles all authentication. In prod, both mechanisms are active: SmallRye JWT rejects incoming OIDC tokens (wrong issuer — `casehub-dev` vs the OIDC provider's issuer) and falls through to the OIDC mechanism, which succeeds. The `mp.jwt.verify.issuer` is only configured for `%dev` and `%test` profiles; in prod, SmallRye JWT uses the Quarkus default issuer, ensuring rapid rejection with no ambiguity. The dev-auth endpoint itself is removed by `@UnlessBuildProfile("prod")`, so no new dev tokens can be minted in prod. The minor overhead of one rejected JWT validation per request in prod is negligible.

**Contract:** Any Quarkus app adding `casehub-pages-auth` gets:
- `/dev/auth/login` endpoint in dev/test mode
- SmallRye JWT validation on `@Authenticated` / `@RolesAllowed` endpoints
- `SecurityIdentity` populated with JWT principal and roles

**Package:** `io.casehub.pages.auth`

## §2 Layout Module (`backend/layout/` + `backend/layout-sqlite/`)

Server-side layout persistence. Durable layout state that survives browser clears and works across devices.

**Module split** follows the persistence-backend-cdi-priority protocol — SPI and implementation in separate artifacts for classpath-activated backend selection.

### `casehub-pages-layout` (`backend/layout/`)

SPI, no-op default, and REST endpoint.

**SPI:**

```java
package io.casehub.pages.layout;

public interface LayoutPersistenceStore {
    Optional<String> load(String key, String tenantId, String userId);
    void save(String key, String tenantId, String userId, String payload);
    void delete(String key, String tenantId, String userId);
}
```

- `key`: layout identifier (matches TypeScript `LayoutStore` key)
- `tenantId`: extracted from JWT `tenant_id` claim at the REST layer
- `userId`: extracted from JWT `sub` claim (`JsonWebToken.getSubject()`) at the REST layer — provides per-user layout isolation within a tenant
- `payload`: opaque JSON — backend stores it, doesn't parse it. Schema ownership stays in TypeScript. `LayoutState` is structurally typed and additively evolved (new optional fields only) — old stored payloads with missing fields are handled gracefully by the TypeScript `load()` path (the ratio count guard in the layout serialization spec is a reference example).

**CDI pattern:**
- `NoOpLayoutPersistenceStore` — `@DefaultBean`, returns `Optional.empty()`, no-ops on write. Active when no persistence backend is on the classpath.

**REST endpoint:** `LayoutResource` — annotated `@Authenticated` to ensure SmallRye JWT validation runs before any resource method executes.

```
GET    /api/layouts/{key}     → load
PUT    /api/layouts/{key}     → save (body = LayoutState JSON)
DELETE /api/layouts/{key}     → delete
```

Tenant extracted from JWT `tenant_id` claim via `JsonWebToken.getClaim("tenant_id")`. Claim name configurable: `casehub.pages.layout.tenant-claim` (default: `tenant_id`). User extracted from JWT `sub` claim via `JsonWebToken.getSubject()`. If the configured tenant claim is absent from the JWT, the resource returns `401 Unauthorized` with a message indicating the expected claim is missing — fail early with a clear error rather than propagating `null` into the persistence layer. No dependency on `casehub-platform-api` — the REST resource uses SmallRye JWT's `JsonWebToken` directly, keeping the layout module independent of the CaseHub platform.

**Package:** `io.casehub.pages.layout`

### `casehub-pages-layout-sqlite` (`backend/layout-sqlite/`)

SQLite persistence backend. Activated by classpath presence.

- `SqliteLayoutPersistenceStore` — `@ApplicationScoped`, beats `@DefaultBean` automatically (Tier 2 in the persistence-backend-cdi-priority protocol)
- Single table `layout_state` (`key TEXT, tenant_id TEXT, user_id TEXT, payload TEXT, updated_at TEXT, PRIMARY KEY(key, tenant_id, user_id)`)
- Uses `xerial` JDBC + HikariCP with WAL mode (`PRAGMA journal_mode=WAL` via HikariCP connection init SQL), consistent with the platform's `memory-sqlite` pattern — WAL enables concurrent readers and a single writer without contention under concurrent HTTP requests
- Configurable: `casehub.pages.layout.sqlite.path`

**Package:** `io.casehub.pages.layout.sqlite`

**Consumer usage:**
```xml
<!-- REST endpoint with no persistence (no-op) -->
<dependency>
  <groupId>io.casehub</groupId>
  <artifactId>casehub-pages-layout</artifactId>
</dependency>

<!-- Add SQLite persistence -->
<dependency>
  <groupId>io.casehub</groupId>
  <artifactId>casehub-pages-layout-sqlite</artifactId>
</dependency>
```

**Future:** When a JPA/PostgreSQL backend materialises, it ships as `casehub-pages-layout-jpa` with `@Alternative @Priority(1)` (Tier 3) — wins over SQLite when co-deployed.

## §3 Data Module (`backend/data/`) — Scaffold

Establishes module structure only. The full data processing design is a follow-up issue.

**What goes in now:**
- `pom.xml` with coordinates `io.casehub:casehub-pages-data-backend`
- Package: `io.casehub.pages.data`
- Enough to prove the module builds

**Follow-up scope:** Server-side implementations of the same data processing services that `pages-data` runs in the browser. The frontend connects to "services" — it doesn't know if they run in the browser or on a server. Events go to services; if a backend exists, those events go server-side first.

## §4 Frontend TypeScript Changes

### pages-runtime — REST layout store

```typescript
export function createRestLayoutStore(baseUrl: string, tokenFn: () => string | null): LayoutStore
```

Implements `LayoutStore` via `fetch()`. Follows the `LayoutStore` contract: `load()` catches all fetch/parse errors and returns `null`; `save()` and `delete()` catch all errors and log warnings via `console.warn`. Network failures, HTTP 4xx/5xx responses, and JSON parse errors are all handled internally — the framework safety net in `site.ts` is a backup, not the primary error boundary. `tokenFn` returns current JWT from `sessionStorage` for `Authorization: Bearer` header, or `null` when unauthenticated.

**Auth invalidation:** On HTTP 401 response, dispatches a `pages-auth-expired` CustomEvent on `document` (follows the existing event pattern: `pages-filter`, `pages-sort`, `pages-split-resize`). The login gate listens for this event and re-renders. This handles server-side JWT invalidation (e.g., Quarkus dev-mode keypair rotation) that client-side expiry checks cannot detect.

**Debounce:** The site-level debounce (defined in the layout serialization spec) handles all layout stores. `SiteOptions` gains `layoutSaveDelayMs?: number` (default 500). For REST stores, consumers pass a longer delay (e.g., 2000ms) to avoid excessive network calls:

```typescript
loadSite(container, tree, {
  layoutStore: createRestLayoutStore(backendUrl, tokenFn),
  layoutKey: "my-layout",
  layoutSaveDelayMs: 2000,
});
```

One debounce, one layer, configurable delay. The debounce collapses rapid user interactions (split drags, dock toggles) into a single serialization + save after the configured silence period.

### pages-ui — Login gate component

`<pages-dev-auth>` Web Component:
- On load: checks `sessionStorage` for JWT. If absent or expired, renders centered overlay card.
- **Expiry check:** decodes the JWT payload (base64url, no cryptographic verification needed client-side) and compares the `exp` claim against `Date.now() / 1000`. If expired, clears `sessionStorage` and renders the login overlay.
- **Server invalidation:** listens for `pages-auth-expired` CustomEvent on `document`. When received (e.g., after Quarkus dev-mode keypair rotation invalidates the JWT), clears `sessionStorage` and re-renders the login overlay. This handles the case where a JWT is not expired but has been invalidated server-side.
- Two inputs: dropdown of known identities, text field for free entry
- On selection: `POST /dev/auth/login`, stores JWT in `sessionStorage` (key: `pages-dev-auth-token`), dismisses gate
- Subsequent fetch calls include `Authorization: Bearer` header

**Identity provisioning:** Known identities are provided via `SiteOptions.devAuth`:

```typescript
interface DevAuthConfig {
  backendUrl: string;
  identities?: string[];
}

// In SiteOptions:
readonly devAuth?: DevAuthConfig;
```

If `devAuth` is configured, the login gate renders when no JWT is in `sessionStorage`. `identities` populates the dropdown; if omitted, only the free-text entry is available. The `backendUrl` is the single source for backend location — used by the login gate, `createRestLayoutStore`, and any future REST services.

**Token utility:**

```typescript
export function createDevAuthTokenFn(
  sessionStorageKey = "pages-dev-auth-token"
): () => string | null
```

Returns a function that reads the JWT from `sessionStorage`. All REST adapters (`createRestLayoutStore`, future data services) use this as their `tokenFn`. The `sessionStorage` key (`pages-dev-auth-token`) is a public contract.

### pages-ui — Identity widget

Small clickable name display for app chrome:
- Shows current identity name
- Click opens picker popover (same UI as login gate)
- Switch: calls `/dev/auth/login` with new name, updates JWT

### WebSocket token support

JWT passed as query parameter (`/ws/chat?token=<jwt>`) since browsers can't send custom headers on WebSocket.

**Security note:** Token-in-URL is a dev/test-only mechanism. Tokens in query parameters appear in server access logs and browser history. Production WebSocket authentication should use a different approach (e.g., short-lived connection ticket obtained via REST, or cookie-based auth). The consuming spec (casehubio/connectors — chat demo §1 User Identity) owns the full WebSocket auth design.

**Server-side validation:** The Quarkus WebSocket endpoint uses a `ContainerRequestFilter` (for WebSocket-over-HTTP upgrade) or a `ServerEndpointConfig.Configurator` to extract the `token` query parameter and validate it via `JsonWebToken` parsing. Full mechanism deferred to the consuming spec — this module provides the JWT minting; WebSocket validation is a consumer concern.

### Service discovery

Backend configuration is provided via `SiteOptions.devAuth`. If `devAuth` is absent, browser-local implementations are used and the login gate doesn't render. No auto-detection.

## §5 Testing Strategy

**Backend (Java — `@QuarkusTest`):**
- Auth: hit `POST /dev/auth/login`, verify JWT claims including `tenant_id`. Verify endpoint absent in prod profile (`@UnlessBuildProfile("prod")`). Verify `SecurityIdentity` on a protected endpoint.
- Layout: CRUD via REST with no-op store (verify 404/empty responses). Verify `@Authenticated` rejects unauthenticated requests. Verify missing `tenant_id` claim returns 401. With `casehub-pages-layout-sqlite` on classpath: verify SQLite persistence, tenant isolation, and user isolation (same key + tenant, different `sub` → independent layouts). Unit test `SqliteLayoutPersistenceStore` directly. Verify tenant and user extraction from JWT claims.
- Data: build-only — compiles, is depended on.

**Frontend (TypeScript — Vitest):**
- `createRestLayoutStore`: mock `fetch`, verify URLs/headers/body, verify `load()` returns `null` on network error, verify `save()`/`delete()` catch errors and log warnings, verify 401 response dispatches `pages-auth-expired` event
- `layoutSaveDelayMs`: verify configurable delay overrides default 500ms, verify REST store works with 2000ms delay
- Login gate + identity widget: component tests with mock `/dev/auth/login`. Verify expired JWT triggers re-render. Verify `pages-auth-expired` event triggers re-render.

## References

- [SmallRye JWT auto-generated dev keys (Quarkus 3.22+)](https://github.com/quarkusio/quarkus/issues/44179)
- [Quarkus SmallRye JWT guide](https://quarkus.io/guides/security-jwt)
- [Issuer gotcha since 3.22.1](https://github.com/quarkusio/quarkus/issues/47723)
- Garden: GE-20260604-d8c0c1 — JWT threading through quarkus-flow
- Consuming spec: `casehubio/connectors` — chat demo interactive features (§1 User Identity)
- Platform conventions: PLATFORM.md — module-tier-structure, submodule-folder-naming, SPI defaults
