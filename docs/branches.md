# Branches Module — API Documentation

**Base path:** `/api/v1/branches`
**Module:** `apex--crm-backend` (Node.js / Express / TypeScript / MongoDB)
**Auth:** Bearer JWT (access token) on every endpoint
**Source of truth:** `src/routes/branch.routes.ts`, `src/controllers/branch.controller.ts`, `src/services/branch.service.ts`, `src/services/branchAttendance.service.ts`, `src/validators/branch.validator.ts`, `src/validators/branchAttendance.validator.ts`, `src/models/Branch.ts`

---

## 1. Overview

The Branches module manages the company's physical/regional branches, their activation state, and the per-branch **attendance configuration** (geofence, working days/hours, grace period, timezone). Branches are referenced by `EmployeeProfile`, `Lead`, and several other modules.

All endpoints are mounted under `/api/v1/branches` and require:

1. `authenticate` middleware — validates JWT and loads `req.user`.
2. `authorize(permission)` middleware — checks the user's role-permission map.
3. Optional `requireBranchAccess(branchIdResolver)` middleware — for endpoints that need a branch-scope check from the route param.

Standard response envelope:

```json
{ "success": true, "message": "...", "data": { ... } }
```

Error envelope:

```json
{ "success": false, "message": "...", "code": "MACHINE_CODE" }
```

### 1.1 Global

- **Rate limit:** 300 requests / 15 min / IP (global, applied to the whole app).
- **Body size limit:** 1 MB JSON / 1 MB urlencoded.
- **CORS:** origin = `CLIENT_URL` (default `http://localhost:5173`), credentials enabled.
- **Cookies:** parsed via `cookie-parser` (used for refresh-token flows elsewhere).

### 1.2 Roles & permissions

Roles: `head`, `admin`, `manager`, `employee` (see `src/constants/roles.ts`).

Permissions used by this module:

| Permission                       | Used for |
|----------------------------------|----------|
| `branch:view`                    | List branches |
| `branch:create`                  | Create branch |
| `branch:update`                  | Update branch details, change status, update attendance config (route uses this) |
| `branch:delete`                  | (Permission defined; **no route exists**) |
| `branch-attendance:view`         | `GET /:id/attendance-config` |
| `branch-attendance:update`       | `PATCH /:id/attendance-config` (last-registered handler wins) |

> ⚠️ `BRANCH_UPDATE` is currently used for both the "update details" endpoint **and** the "update status" endpoint **and** the "update attendance config" endpoint via route-level registration. `BRANCH_ATTENDANCE_UPDATE` is registered afterwards on the same path; the last registered handler wins for the same method+path. In practice, only `BRANCH_ATTENDANCE_UPDATE` is enforced for `PATCH /:id/attendance-config` — see "Implementation notes".

Role × permission summary for the routes that exist today (see `src/permissions/rolePermissions.ts`):

| Role     | branch:view | branch:create | branch:update | branch-attendance:view | branch-attendance:update |
|----------|-------------|---------------|---------------|------------------------|--------------------------|
| head     | ✅          | ✅            | ✅            | ✅                     | ✅                       |
| admin    | ✅          | ❌            | ✅            | ✅                     | ✅                       |
| manager  | ✅          | ❌            | ❌            | ❌                     | ❌                       |
| employee | ❌          | ❌            | ❌            | ❌                     | ❌                       |

> `head` is the only role that holds `BRANCH_CREATE`. `admin` can update + change status + read/update attendance config; `manager` is read-only on the branch list.

### 1.3 Branch access model

`HEAD` has global branch access. `ADMIN` / `MANAGER` / `EMPLOYEE` are restricted to the branches stored on the user record (`req.user.branches: string[]`).

The `requireBranchAccess(branchIdResolver)` middleware runs before update / status / attendance-config endpoints:

- `HEAD` bypasses (`next()`).
- Other roles must have the resolved branch id in their `branches` list (else `403 BRANCH_ACCESS_DENIED`).
- A missing/empty branch id returns `400 BRANCH_ID_REQUIRED`.

The list endpoint (`GET /`) reads directly from the service:

- `HEAD` → `Branch.find().sort({ name: 1 })` (all branches globally).
- `ADMIN` / `MANAGER` / `EMPLOYEE` → `Branch.find({ _id: { $in: user.branches } }).sort({ name: 1 })`.

`POST /` is open to any role with `branch:create`; the creating user's id is added to the new branch's `branches` list on the user record (`User.findByIdAndUpdate`).

### 1.4 Branch model — fields & rules

| Field        | Type / Constraint |
|--------------|-------------------|
| `_id`        | ObjectId |
| `name`       | string, 2–100, required, trimmed |
| `code`       | string, 2–30, required, trimmed, uppercased, **unique** (`/^[A-Z0-9-]+$/` at the validator) |
| `description`| string, ≤500 |
| `address`    | string, ≤500 |
| `city`       | string, ≤100 |
| `state`      | string, ≤100 |
| `country`    | string, ≤100, default `"India"` |
| `phone`      | string, ≤20 |
| `email`      | string (email format at validator), lowercased, ≤150 |
| `isActive`   | bool, default `true`, indexed |
| `createdBy`  | ObjectId → `User`, required |
| `updatedBy`  | ObjectId → `User` |
| `attendanceConfig` | sub-document (see below) |
| `createdAt`  | Date |
| `updatedAt`  | Date |

Indexes: `code` (unique), `name`, `isActive`.

**`attendanceConfig` sub-document (with default values):**

```jsonc
{
  "enabled": true,
  "timezone": "Asia/Kolkata",
  "location": {
    "latitude": 0,            // required at update; default 0 via Mongoose
    "longitude": 0,           // required at update; default 0 via Mongoose
    "radiusMeters": 200       // 10–5000
  },
  "workingDays": [1, 2, 3, 4, 5, 6],   // 0=Sun, 1=Mon, …, 6=Sat
  "workingHours": {
    "startTime": "09:30",              // HH:MM (24h)
    "endTime":   "18:30"
  },
  "gracePeriodMinutes": 15             // 0–180
}
```

### 1.5 Working-days encoding

The `workingDays` array uses JS `Date.getDay()` semantics: `0 = Sunday`, `1 = Monday`, …, `6 = Saturday`. Validator accepts `0–6` integers, requires `1`–`7` items, and rejects duplicates.

---

## 2. Endpoint reference

### 2.1 `POST /api/v1/branches` — Create a branch

- **Permission:** `branch:create` (currently only `head`).
- **Body (`createBranchSchema` — Zod):**

```jsonc
{
  "name": "Mumbai HQ",                 // required, 2–100
  "code": "MUM-HQ",                    // required, 2–30, ^[A-Z0-9-]+$ (uppercased on save)
  "description": "Head office in Mumbai", // optional, ≤500
  "address": "Bandra Kurla Complex",    // optional, ≤500
  "city": "Mumbai",                     // optional, ≤100
  "state": "MH",                        // optional, ≤100
  "country": "India",                   // optional, ≤100
  "phone": "+91-22-12345678",           // optional, ≤20
  "email": "mumbai@example.com"         // optional, valid email
}
```

- **Behavior (`createBranch`):**
  - `code` is uppercased before the duplicate check (`A branch with this code already exists` → `409 BRANCH_CODE_EXISTS`).
  - Persists the branch with `createdBy = req.user.id`.
  - Side effect: adds the new branch's `_id` to the creating user's `branches` array (`User.findByIdAndUpdate` with `$addToSet`).

**Responses**
- `201 Created` — `data` is the new branch (Mongoose doc, including default `attendanceConfig`).
- `400 VALIDATION_ERROR` — Zod failure.
- `409 BRANCH_CODE_EXISTS` — `code` already taken.

Audit: writes an `AuditLog` row via `auditRequest` (`action: BRANCH_CREATED`, `entity: Branch`, metadata: `{ name, code }`).

---

### 2.2 `GET /api/v1/branches` — List branches

- **Permission:** `branch:view`.
- **Query:** none.
- **Behavior (`getBranches`):**
  - `HEAD` → all branches, sorted `name: 1`.
  - Other roles → branches whose `_id ∈ req.user.branches`, sorted `name: 1`.
  - No pagination, no filters, no field selection — the full branch document is returned (including `attendanceConfig`).

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "65f0...",
      "name": "Mumbai HQ",
      "code": "MUM-HQ",
      "description": "...",
      "address": "...",
      "city": "...",
      "state": "...",
      "country": "India",
      "phone": "...",
      "email": "...",
      "isActive": true,
      "createdBy": "...",
      "updatedBy": "...",
      "attendanceConfig": { "...": "see §1.4" },
      "createdAt": "...",
      "updatedAt": "..."
    }
  ]
}
```

> The list is implicitly branch-scoped. To see all branches, log in as `head`.

---

### 2.3 `PATCH /api/v1/branches/:id` — Update branch details

- **Permission:** `branch:update` (head, admin).
- **Middleware:** `requireBranchAccess(...)` (HEAD bypasses).
- **Body (`updateBranchSchema = createBranchSchema.partial()`):** any subset of:
  ```jsonc
  {
    "name": "Mumbai HQ - South",  // 2–100
    "code": "MUM-HQ-S",           // 2–30, ^[A-Z0-9-]+$  ← note: validator permits it; the service does not re-check uniqueness on update
    "description": "...",
    "address": "...",
    "city": "...",
    "state": "...",
    "country": "...",
    "phone": "...",
    "email": "..."
  }
  ```
  All fields are optional. `code` is uppercased by the model on save but the service does **not** normalize on update; sending `"mum-hq-s"` will fail the validator regex.
- **Behavior (`updateBranch`):**
  - Validates `branchId` is a valid ObjectId (`400 INVALID_BRANCH_ID`).
  - Loads the branch (`404 BRANCH_NOT_FOUND` if missing).
  - Inactive branches cannot be updated (`400 BRANCH_INACTIVE`).
  - Only updates fields that were actually provided (uses `Object.assign`).

**Responses:**
- `200 OK` — `data` is the updated branch.
- `400 VALIDATION_ERROR` / `400 INVALID_BRANCH_ID` / `400 BRANCH_ID_REQUIRED` / `400 BRANCH_INACTIVE`.
- `403 BRANCH_ACCESS_DENIED`.
- `404 BRANCH_NOT_FOUND`.

Audit: `BRANCH_UPDATED`, `entity: Branch`, metadata: `{ updatedFields: Object.keys(body) }`.

---

### 2.4 `PATCH /api/v1/branches/:id/status` — Activate / deactivate a branch

- **Permission:** `branch:update`.
- **Middleware:** `requireBranchAccess(...)`.
- **Body:**
  ```json
  { "isActive": true }
  ```
  - `isActive` is required and **must be a boolean** (controller-level type check; throws `400 INVALID_BRANCH_STATUS` if missing or non-boolean).
- **Behavior (`updateBranchStatus`):**
  - Validates `branchId` is a valid ObjectId.
  - Loads the branch (`404 BRANCH_NOT_FOUND`).
  - Refuses to set the branch to its current state: `BRANCH_ALREADY_ACTIVE` (400) when activating an already-active branch; `BRANCH_ALREADY_INACTIVE` (400) when deactivating an already-inactive branch.
  - Toggles `branch.isActive` and saves.

**Responses:**
- `200 OK` — message `"Branch activated successfully"` or `"Branch deactivated successfully"`.
- `400 INVALID_BRANCH_STATUS` / `400 INVALID_BRANCH_ID` / `400 BRANCH_ID_REQUIRED` / `400 BRANCH_ALREADY_ACTIVE` / `400 BRANCH_ALREADY_INACTIVE`.
- `403 BRANCH_ACCESS_DENIED`.
- `404 BRANCH_NOT_FOUND`.

Audit: `BRANCH_ACTIVATED` or `BRANCH_DEACTIVATED`, `entity: Branch`, metadata: `{ isActive }`.

> ⚠️ **Side-effect warning.** Deactivating a branch does **not** block other modules (e.g. leads, employees) from continuing to reference it. If you need to enforce this, do it at the consumer.

---

### 2.5 `GET /api/v1/branches/:id/attendance-config` — Read attendance config

- **Permission:** `branch-attendance:view` (head, admin). The route also requires `branch:update` in the path-level middleware chain via `requireBranchAccess`; effectively only `head` and `admin` can reach it.
- **Middleware:** `requireBranchAccess(...)`.
- **Behavior (`getBranchAttendanceConfig`):**
  - Loads the branch with `select("_id name code isActive attendanceConfig")`.
  - Returns `{ branch: { id, name, code, isActive }, attendanceConfig }`.

**Response:**
```json
{
  "success": true,
  "message": "Branch attendance configuration fetched successfully",
  "data": {
    "branch": {
      "id": "65f0...",
      "name": "Mumbai HQ",
      "code": "MUM-HQ",
      "isActive": true
    },
    "attendanceConfig": {
      "enabled": true,
      "timezone": "Asia/Kolkata",
      "location": { "latitude": 19.07, "longitude": 72.87, "radiusMeters": 200 },
      "workingDays": [1, 2, 3, 4, 5, 6],
      "workingHours": { "startTime": "09:30", "endTime": "18:30" },
      "gracePeriodMinutes": 15
    }
  }
}
```

**Responses / errors:**
- `200 OK`.
- `400 INVALID_BRANCH_ID` / `400 BRANCH_ID_REQUIRED`.
- `403 BRANCH_ACCESS_DENIED`.
- `404 BRANCH_NOT_FOUND`.

---

### 2.6 `PATCH /api/v1/branches/:id/attendance-config` — Update attendance config

- **Permission:** `branch-attendance:update` (head, admin) — see "Implementation notes" for the route registration gotcha.
- **Middleware:** `requireBranchAccess(...)`.
- **Body (`updateBranchAttendanceConfigSchema` — Zod, all fields optional):**

```jsonc
{
  "enabled": true,                                 // optional
  "timezone": "Asia/Kolkata",                      // optional, 1–100
  "location": {
    "latitude": 19.07,                             // -90..90
    "longitude": 72.87,                            // -180..180
    "radiusMeters": 200                            // 10..5000
  },
  "workingDays": [1, 2, 3, 4, 5, 6],               // each 0–6, min length 1, no duplicates
  "workingHours": {
    "startTime": "09:30",                          // HH:MM (24h)
    "endTime":   "18:30"
  },
  "gracePeriodMinutes": 15                         // 0..180
}
```

- **Behavior (`updateBranchAttendanceConfig`):**
  - Loads the branch (`404 BRANCH_NOT_FOUND`).
  - Inactive branches cannot be updated (`400 BRANCH_INACTIVE`).
  - Each top-level field is shallow-merged: only the fields you send are replaced. `location`, `workingHours` are replaced as whole sub-objects (not deep-merged).
  - Sets `branch.updatedBy = req.user.id`.

**Responses:**
- `200 OK` — `data` is `branch.attendanceConfig` (the updated sub-document only, **not** the full branch).
- `400 VALIDATION_ERROR` / `400 INVALID_BRANCH_ID` / `400 BRANCH_ID_REQUIRED` / `400 BRANCH_INACTIVE`.
- `403 BRANCH_ACCESS_DENIED`.
- `404 BRANCH_NOT_FOUND`.

Audit: `BRANCH_UPDATED`, `entity: Branch`, metadata: `{ type: "ATTENDANCE_CONFIGURATION_UPDATED" }`.

---

## 3. Data shapes

### 3.1 `Branch` (response item)

```jsonc
{
  "_id": "ObjectId",
  "name": "string",
  "code": "MUM-HQ",
  "description": "string?",
  "address": "string?",
  "city": "string?",
  "state": "string?",
  "country": "India",
  "phone": "string?",
  "email": "string?",
  "isActive": true,
  "createdBy": "ObjectId",
  "updatedBy": "ObjectId?",
  "attendanceConfig": { "...": "see §1.4" },
  "createdAt": "ISO date",
  "updatedAt": "ISO date"
}
```

### 3.2 `IBranchAttendanceConfig`

```jsonc
{
  "enabled": true,
  "timezone": "Asia/Kolkata",
  "location": {
    "latitude": 19.07,
    "longitude": 72.87,
    "radiusMeters": 200
  },
  "workingDays": [1, 2, 3, 4, 5, 6],
  "workingHours": {
    "startTime": "09:30",
    "endTime": "18:30"
  },
  "gracePeriodMinutes": 15
}
```

---

## 4. Error codes

All errors are returned as `{ success: false, message, code, errors? }`.

| Code | HTTP | Where it can come from |
|------|------|------------------------|
| `VALIDATION_ERROR` | 400 | Zod failure on any request body / query / params |
| `AUTHENTICATION_REQUIRED` | 401 | Missing `Authorization` header or no `req.user` |
| `INVALID_AUTHORIZATION_HEADER` | 401 | Wrong scheme / missing token |
| `INVALID_ACCESS_TOKEN` | 401 | JWT verification failed |
| `ACCOUNT_NOT_FOUND` | 401 | Token subject does not exist |
| `ACCOUNT_INACTIVE` | 401/403 | User `isActive = false` |
| `FORBIDDEN` | 403 | `authorize` middleware — missing role permission |
| `BRANCH_ID_REQUIRED` | 400 | `requireBranchAccess` could not resolve a branch id |
| `BRANCH_ACCESS_DENIED` | 403 | Actor's `branches` does not include the resolved branch |
| `INVALID_BRANCH_ID` | 400 | `req.params.id` is not a valid ObjectId (service-level) or not a string (controller-level) |
| `BRANCH_NOT_FOUND` | 404 | Branch missing |
| `BRANCH_INACTIVE` | 400 | Tried to update / update-attendance on an inactive branch |
| `BRANCH_CODE_EXISTS` | 409 | Create with a duplicate `code` (case-insensitive via uppercasing) |
| `INVALID_BRANCH_STATUS` | 400 | `isActive` was missing or not a boolean on `PATCH /:id/status` |
| `BRANCH_ALREADY_ACTIVE` / `BRANCH_ALREADY_INACTIVE` | 400 | Status update with the current state |
| `INTERNAL_SERVER_ERROR` | 500 | Fallback for unhandled exceptions |

---

## 5. Examples

### 5.1 Create a branch (head)

```bash
curl -X POST http://localhost:8000/api/v1/branches \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Mumbai HQ",
    "code": "MUM-HQ",
    "city": "Mumbai",
    "state": "MH",
    "country": "India",
    "phone": "+91-22-12345678",
    "email": "mumbai@example.com"
  }'
```

### 5.2 List branches (admin — only branches in scope)

```bash
curl http://localhost:8000/api/v1/branches \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

### 5.3 Update branch details

```bash
curl -X PATCH http://localhost:8000/api/v1/branches/65f0branch \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "city": "Navi Mumbai", "phone": "+91-22-87654321" }'
```

### 5.4 Deactivate a branch

```bash
curl -X PATCH http://localhost:8000/api/v1/branches/65f0branch/status \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "isActive": false }'
```

### 5.5 Read attendance config

```bash
curl http://localhost:8000/api/v1/branches/65f0branch/attendance-config \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

### 5.6 Update attendance config

```bash
curl -X PATCH http://localhost:8000/api/v1/branches/65f0branch/attendance-config \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "enabled": true,
    "location": { "latitude": 19.07, "longitude": 72.87, "radiusMeters": 250 },
    "workingDays": [1, 2, 3, 4, 5],
    "workingHours": { "startTime": "10:00", "endTime": "19:00" },
    "gracePeriodMinutes": 10
  }'
```

---

## 6. Implementation notes / gotchas

- **Two `PATCH /:id/attendance-config` handlers are registered.** The route file registers `branch:update` + `updateBranchAttendanceConfigController` first, then registers `branch-attendance:update` + the **same** controller again. Express keeps the last handler registered for the same `(method, path)` chain, so the effective permission check is `branch-attendance:update`. `manager` lacks both permissions and gets `403 FORBIDDEN` from the `authorize` middleware. Treat this as a refactor candidate — duplicate registration is brittle.
- **Duplicate routes for status / attendance-config are silent.** Same risk: a future reorder can change which `authorize` middleware runs. Prefer factoring the chained middleware into a single constant per route.
- **No `DELETE` route.** `BRANCH_DELETE` is defined but no handler exists. Soft-deletes would be safer than hard-deletes since `Branch._id` is referenced by many other models.
- **Inactive branches are not enforced elsewhere.** Leads, employees, and attendance flows can still reference a deactivated branch. There is no cascading guard at write-time.
- **`code` is uppercased on create but not normalized on update.** The validator's regex requires uppercase, so a lowercase `code` will fail validation on `PATCH /:id`. The service does not re-check uniqueness on `code` updates — you can collide with another branch.
- **`createBranch` adds the branch to the actor's `branches`.** Subsequent calls to `GET /branches` from that user will include it. Other admins do **not** automatically get the new branch — they need a `user:assign-branch` flow.
- **Update status is atomic on the document, not on the user side.** Deactivating a branch does not remove it from `User.branches[]` for any other user; they will continue to see the branch in their list and may pass `requireBranchAccess` for it. If you need that, do it explicitly.
- **Attendance config replaces whole sub-objects.** Sending `workingHours: { startTime: "10:00" }` will write `{ startTime: "10:00", endTime: "18:30" }` only if Mongoose preserves the previous `endTime` — but the service does `branch.attendanceConfig.workingHours = data.workingHours`, which **replaces the whole sub-document**. Always send the full sub-object you want to keep.
- **`requireBranchAccess` returns `400 BRANCH_ID_REQUIRED` (not 404) when the resolver returns `undefined`.** This is most easily hit if the route param is missing; the controller layer in `updateBranchController` also has its own `getRequiredParam` check that can throw a 400 first.
- **`getBranches` returns the full document, including `attendanceConfig`.** If you want a slimmer list, narrow the projection in the service.
- **Audit logging.** Create / update / status change / attendance-config change all write `AuditLog` rows. The audit routes live under `/api/v1/audit-logs` and require `audit:view` / `audit:read`.
- **Rate limiting.** The 300/15min limiter is global. There is no per-endpoint override.
- **Idempotency.** No idempotency keys. Calling `POST /` twice with the same `code` always returns `409 BRANCH_CODE_EXISTS`.

---

## 7. Related modules

- **Users** — `/api/v1/users` (`user:view`, `user:assign-branch`). The `createdBy` reference and `User.branches[]` list are managed here.
- **Employees** — `/api/v1/employee` (`employee:view`, `employee:create`). The `branch` field on `EmployeeProfile` must reference a real, active branch.
- **Leads** — `/api/v1/leads` (`lead:view`, `lead:create`, etc.). Leads are created in a branch; the branch filter scopes who can see them.
- **Holidays** — `/api/v1/holidays` (`holiday:view`, etc.). Branch-scoped holiday management.
- **Branch attendance** — `/api/v1/branches/:id/attendance-config` (this module). Consumed by the attendance flow.
- **Audit logs** — `/api/v1/audit-logs` (`audit:view`, `audit:read`). Every state-changing branch endpoint writes here.
- **Auth** — `/api/v1/auth`. Issues the JWTs required on every endpoint.

---

_Last generated from the source under `src/` at the current `main` HEAD. If you change a route, controller, schema, or service, regenerate this file._
