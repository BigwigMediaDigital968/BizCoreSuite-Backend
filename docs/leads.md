# Leads Module — API Documentation

**Base path:** `/api/v1/leads`
**Module:** `apex--crm-backend` (Node.js / Express / TypeScript / MongoDB)
**Auth:** Bearer JWT (access token) on every endpoint
**Source of truth:** `src/routes/lead.routes.ts`, `src/controllers/*`, `src/services/*`, `src/validators/*`, `src/models/*`

---

## 1. Overview

The Leads module manages the full lifecycle of a sales lead: creation, listing, retrieval, assignment, status updates, remarks, follow-ups, Excel import, and an activity/audit log.

All endpoints are mounted under `/api/v1/leads` and require:

1. `authenticate` middleware — validates JWT and loads `req.user`.
2. `authorize(permission)` middleware — checks the user's role-permission map.
3. Optional `requireBranchAccess(resolver)` — for endpoints that need a branch scope check from the body.

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

| Permission        | Used for |
|-------------------|----------|
| `lead:view`       | List, get, activities, follow-ups, my follow-ups |
| `lead:create`     | Create lead, bulk import |
| `lead:update`     | Update status, add remark, create follow-up, complete follow-up |
| `lead:assign`     | Assign a lead to an employee |

Role × permission summary (see `src/permissions/rolePermissions.ts`):

| Role     | view | create | update | assign |
|----------|------|--------|--------|--------|
| head     | ✅   | ✅     | ✅     | ✅     |
| admin    | ✅   | ✅     | ✅     | ✅     |
| manager  | ✅   | ✅     | ✅     | ✅     |
| employee | ✅ (own) | ✅ | ✅ (own) | ❌ |

### 1.3 Branch access model

`HEAD` has global branch access. `ADMIN`/`MANAGER`/`EMPLOYEE` are restricted to the branches stored on the user record (`req.user.branches: string[]`).

- **Listing / get / activities / follow-ups** — service-level filter (`buildLeadAccessFilter`) automatically restricts results:
  - `EMPLOYEE` → only leads with `assignedTo == user.id` inside their branch(es).
  - `ADMIN` / `MANAGER` → leads in their branch(es).
  - `HEAD` → all non-deleted leads globally.
- **Assignment / Import** — extra middleware `requireBranchAccess(resolver)` verifies the target branch is in the actor's branch list.
- A lead outside the actor's branch scope is reported as `LEAD_NOT_FOUND` (does not leak existence).

### 1.4 Enums

**Lead status** (`src/constants/leadStatus.ts`):
`new`, `assigned`, `contacted`, `follow_up`, `interested`, `qualified`, `converted`, `lost`, `closed`

> The validator's `status` filter lists the legacy uppercase values (`NEW`, `ASSIGNED`, `CONTACTED`, `FOLLOW_UP`, `INTERESTED`, `NEGOTIATION`, `WON`, `LOST`, `JUNK`). New code uses the lowercase constants from `LEAD_STATUS`. The status you send to `PATCH /:id/status` is validated against the canonical lowercase set via `updateLeadStatusSchema`.

**Lead source type** (`src/models/Lead.ts`):
`MANUAL`, `EXCEL`, `API`, `IMPORT`

**Follow-up status** (`src/constants/leadFollowUpStatus.ts`):
`PENDING`, `COMPLETED`, `CANCELLED`, `MISSED`

**Lead activity type** (`src/models/LeadActivity.ts`):
`created`, `assigned`, `status_changed`, `remark_added`, `follow_up`

### 1.5 Lead model — fields & rules

| Field              | Type / Constraint |
|--------------------|-------------------|
| `_id`              | ObjectId |
| `name`             | string, 2–150, required |
| `phoneCountryCode` | string, 1–5, required, format `+[1-9]…` |
| `phone`            | string, 6–15 digits, required, indexed |
| `email`            | string, ≤150, lowercased |
| `city`             | string, ≤100 |
| `industry`         | string, ≤100 |
| `message`          | string, ≤5000 |
| `remarks`          | string, ≤2000 |
| `status`           | LeadStatus, default `new` |
| `source`           | string, 1–100, required |
| `sourceType`       | LeadSourceType, required |
| `externalId`       | string, ≤200, sparse index |
| `branch`           | ObjectId → `Branch`, required |
| `assignedTo`       | ObjectId → `User` |
| `assignedBy`       | ObjectId → `User` |
| `assignedAt`       | Date |
| `createdBy`        | ObjectId → `User`, required |
| `isDeleted`        | bool, default `false` (soft delete) |
| `createdAt`        | Date |
| `updatedAt`        | Date |

Unique soft constraint: a `branch + phoneCountryCode + phone` combination must be unique among non-deleted leads (`LEAD_ALREADY_EXISTS`).

---

## 2. Endpoint reference

### 2.1 `POST /api/v1/leads` — Create a lead

- **Permission:** `lead:create`
- **Body (JSON):** `createLeadSchema` (Zod)

```jsonc
{
  "name": "John Doe",                // required, 2–150
  "phoneCountryCode": "+91",         // required, format ^\+[1-9]\d{0,3}$
  "phone": "9876543210",             // required, 6–15 digits
  "email": "john@example.com",       // optional
  "city": "Mumbai",                  // optional
  "industry": "SaaS",                // optional
  "message": "Interested in CRM",    // optional
  "remarks": "Inbound from website", // optional
  "source": "Website",               // required, 1–100
  "sourceType": "MANUAL",            // required: MANUAL | EXCEL | API | IMPORT
  "branchId": "65f0a..."             // optional; HEAD/ADMIN only. MANAGER/EMPLOYEE must use their own branch.
}
```

Branch resolution:
- `HEAD` / `ADMIN` → uses `branchId` from body (must be an active branch).
- `MANAGER` / `EMPLOYEE` → uses the user's first branch. If the user has no branch → `BRANCH_NOT_ASSIGNED`.
- `HEAD` skips branch-access checks; other roles must have the branch in their `branches` list.

**Responses**
- `201 Created` — `data.lead` is the new lead (Mongoose doc).
- `400 VALIDATION_ERROR` — Zod failure.
- `400 BRANCH_REQUIRED` / `400 INVALID_BRANCH_ID` — branch missing/invalid.
- `403 BRANCH_NOT_ASSIGNED` / `403 BRANCH_ACCESS_DENIED` — user has no branch scope.
- `404 BRANCH_NOT_FOUND` — branch inactive or missing.
- `409 LEAD_ALREADY_EXISTS` — duplicate phone in same branch.

Side effects: creates an audit log (`action: LEAD_CREATED`).

---

### 2.2 `GET /api/v1/leads` — List leads (paginated, filterable)

- **Permission:** `lead:view`
- **Query:** `listLeadQuerySchema` (Zod, all coerced)

| Param        | Type / Values | Default | Notes |
|--------------|---------------|---------|-------|
| `page`       | int ≥ 1       | `1`     | |
| `limit`      | int 1–100     | `20`    | |
| `search`     | string ≤100   | —       | Case-insensitive on `name`, `phone`, `email`, `city`, `industry` |
| `status`     | enum          | —       | See "Enums" |
| `source`     | string ≤100   | —       | |
| `branchId`   | ObjectId      | —       | HEAD only can use a foreign branch |
| `assignedTo` | ObjectId      | —       | Employees forced to their own id; otherwise `LEAD_ACCESS_DENIED` |
| `fromDate`   | ISO datetime  | —       | inclusive `createdAt >= fromDate` |
| `toDate`     | ISO datetime  | —       | inclusive `createdAt <= toDate` |
| `sortBy`     | `createdAt` \| `updatedAt` \| `name` \| `status` | `createdAt` | |
| `sortOrder`  | `asc` \| `desc` | `desc` | |

Result:

```json
{
  "success": true,
  "data": {
    "leads": [
      {
        "_id": "65f0...",
        "name": "John Doe",
        "phoneCountryCode": "+91",
        "phone": "9876543210",
        "email": "...",
        "status": "new",
        "branch": { "_id": "...", "name": "...", "code": "..." },
        "assignedTo": { "_id": "...", "name": "...", "email": "...", "role": "employee" },
        "createdBy": { "_id": "...", "name": "...", "email": "...", "role": "admin" },
        "createdAt": "...",
        "updatedAt": "..."
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 153,
      "totalPages": 8,
      "hasNextPage": true,
      "hasPreviousPage": false
    }
  }
}
```

`branch`, `assignedTo`, `createdBy` are populated with the fields shown above.

---

### 2.3 `GET /api/v1/leads/:id` — Get a lead

- **Permission:** `lead:view`
- **Path:** `id` — ObjectId.
- **Behavior:** resolves through `buildLeadAccessFilter`, so a lead outside the actor's branch scope is reported as `LEAD_NOT_FOUND`.
- **Responses:**
  - `200 OK` — `data.lead` (same shape as list item).
  - `400 INVALID_LEAD_ID` — malformed ObjectId.
  - `404 LEAD_NOT_FOUND` — missing or out of scope.

---

### 2.4 `PATCH /api/v1/leads/:id/assign` — Assign lead to an employee

- **Permission:** `lead:assign`
- **Body (`assignLeadSchema`):**
  ```json
  { "employeeId": "65f0...", "reason": "optional, ≤500" }
  ```
  > The current route only validates `employeeId` (string, non-empty) in the route-level validator (`src/validators/lead-assignment.validator.ts`). The `reason` field is consumed by the older `lead.validator.assignLeadSchema` but **not currently used** in this endpoint.

- **Behavior (`assignLead` service):**
  - Both IDs must be valid ObjectIds.
  - Target user must exist, be `isActive`, have role `employee`.
  - Employee must already belong to the lead's branch (`CROSS_BRANCH_ASSIGNMENT`).
  - Actor must have the lead's branch in their scope (HEAD bypasses).
  - Updates `lead.assignedTo`, `lead.assignedBy`, `lead.assignedAt`.
  - Creates a `LeadAssignmentHistory` row containing `previousAssignee`.

- **Responses:**
  - `200 OK` — `data.lead`.
  - `400 INVALID_LEAD_ID` / `400 INVALID_EMPLOYEE_ID` / `400 INVALID_ASSIGNMENT_TARGET`.
  - `401 ACTOR_NOT_FOUND` / `403 ACCOUNT_INACTIVE`.
  - `403 CROSS_BRANCH_ASSIGNMENT` / `403 BRANCH_ACCESS_DENIED`.
  - `404 LEAD_NOT_FOUND` / `404 EMPLOYEE_NOT_FOUND`.

Side effect: audit log `LEAD_ASSIGNED`.

---

### 2.5 `PATCH /api/v1/leads/:id/status` — Update lead status

- **Permission:** `lead:update`
- **Body (`updateLeadStatusSchema`):**
  ```jsonc
  {
    "status": "contacted",          // required, one of LEAD_STATUS
    "remark": "Spoke with decision maker"  // optional, ≤2000
  }
  ```
- **Behavior:** only checks that the lead exists and isn't soft-deleted. The new status is applied and the most recent remark (if provided) is stored on `lead.remarks`. A `LeadActivity` of type `status_changed` is recorded with `previousStatus` / `newStatus`.
  - If the new status equals the current status **and** no remark is provided → `400 STATUS_UNCHANGED`.
- **Responses:**
  - `200 OK` — `data.lead`.
  - `400 INVALID_LEAD_ID` / `400 STATUS_UNCHANGED` / `400 VALIDATION_ERROR`.
  - `404 LEAD_NOT_FOUND`.

---

### 2.6 `POST /api/v1/leads/:id/remarks` — Add a remark to a lead

- **Permission:** `lead:update`
- **Body (`addLeadRemarkSchema`):**
  ```json
  { "remark": "Called on 5th, follow-up next week" }
  ```
  `remark` is required, 1–2000 chars, trimmed.
- **Behavior:** overwrites `lead.remarks` with the new value and logs a `LeadActivity` of type `remark_added`.
- **Responses:**
  - `200 OK` — `data.lead`.
  - `400 INVALID_LEAD_ID` / `400 VALIDATION_ERROR` / `400 LEAD_ID_REQUIRED`.
  - `404 LEAD_NOT_FOUND`.

---

### 2.7 `GET /api/v1/leads/:id/activities` — Lead activity timeline

- **Permission:** `lead:view`
- **Returns** all `LeadActivity` records for the lead, sorted `createdAt: -1`, with `performedBy` populated (`name email role`).

Activity types: `created`, `assigned`, `status_changed`, `remark_added`, `follow_up`.

Each entry shape:

```json
{
  "_id": "...",
  "lead": "...",
  "activityType": "status_changed",
  "performedBy": { "_id": "...", "name": "...", "email": "...", "role": "..." },
  "previousStatus": "new",
  "newStatus": "contacted",
  "remark": "...",
  "metadata": { "...": "..." },
  "createdAt": "...",
  "updatedAt": "..."
}
```

- **Responses:**
  - `200 OK` — `data.activities: LeadActivity[]`.
  - `400 LEAD_ID_REQUIRED`.

---

### 2.8 `POST /api/v1/leads/import` — Bulk import (Excel/CSV)

- **Permission:** `lead:create`
- **Content-Type:** `multipart/form-data`
- **Form fields:**
  - `file` — Excel (`.xlsx`, `.xls`) or CSV (required).
  - `branchId` — ObjectId of the target branch (required, must be in actor's branch list unless actor is `HEAD`).
- **Multer limits:** file size ≤ **5 MB** (from `LEAD_IMPORT_CONFIG.maxFileSize`); allowed mime types `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, `application/vnd.ms-excel`, `text/csv`, `application/csv`.

Supported column headers (case-insensitive, header aliases supported):
- `name` / `Name` (required)
- `phone` / `Phone` (required, 6–15 digits)
- `phoneCountryCode` / `Country Code` / `Phone Country Code` / `phone_country_code` (required). If a row omits the leading `+`, it is auto-prepended.
- `city` / `City`
- `email` / `Email`
- `industry` / `Industry`
- `message` / `Message`

Each created lead is stamped with `source: "Excel Import"`, `sourceType: "EXCEL"`, `status: "new"`, and the actor's `createdBy` / provided `branchId`.

Duplicate handling: rows are deduplicated against the existing `branch + country code + phone` index in the DB and against earlier rows in the same file. Duplicates are reported in the response, not inserted.

**Response (`201 Created`):**
```json
{
  "success": true,
  "message": "Lead import completed",
  "data": {
    "totalRows": 120,
    "successful": 95,
    "duplicates": 20,
    "failed": 5,
    "errors": [
      { "row": 7, "field": "email", "value": "bad@", "message": "Invalid email address" },
      { "row": 14, "field": "phone", "value": "+91999", "message": "Lead already exists or is duplicated in the import file" }
    ]
  }
}
```

- **Responses / errors:**
  - `400 IMPORT_FILE_REQUIRED` / `400 BRANCH_ID_REQUIRED` / `400 NO_LEADS_FOUND` / `400 EMPTY_IMPORT_FILE` / `400 EMPTY_WORKBOOK` / `400 WORKSHEET_NOT_FOUND`.
  - `400 BRANCH_ID_REQUIRED` (from `requireBranchAccess` if missing).
  - `403 BRANCH_ACCESS_DENIED`.
  - `404 BRANCH_NOT_FOUND`.
  - `500` for multer errors (e.g. "Only Excel or CSV files are allowed").

Side effect: audit log `LEADS_IMPORTED`.

---

### 2.9 Follow-up endpoints

#### 2.9.1 `POST /api/v1/leads/:id/follow-ups` — Schedule a follow-up

- **Permission:** `lead:update`
- **Body (`createLeadFollowUpSchema`):**
  ```jsonc
  {
    "scheduledAt": "2026-08-20T10:30:00.000Z",  // required, ISO date, must be in the future
    "remark": "Call about proposal"             // optional, ≤2000
  }
  ```
- **Behavior:**
  - Lead must exist and be non-deleted (`LEAD_NOT_FOUND`).
  - Lead must be assigned (`LEAD_NOT_ASSIGNED`).
  - The current user must be the assignee (`FOLLOW_UP_ACCESS_DENIED`).
  - Creates a `LeadFollowUp` with `status: PENDING`, and a `LeadActivity` of type `follow_up` (`metadata.action = "FOLLOW_UP_SCHEDULED"`).
- **Responses:**
  - `201 Created` — `data.followUp` (full `LeadFollowUp`).
  - `400 INVALID_LEAD_ID` / `400 LEAD_NOT_ASSIGNED` / `400 VALIDATION_ERROR`.
  - `403 FOLLOW_UP_ACCESS_DENIED`.
  - `404 LEAD_NOT_FOUND`.

#### 2.9.2 `PATCH /api/v1/leads/follow-ups/:followUpId/complete` — Complete a follow-up

- **Permission:** `lead:update`
- **Body (`completeLeadFollowUpSchema`):**
  ```jsonc
  { "remark": "Customer requested pricing PDF" }   // required, 1–2000
  ```
- **Behavior:**
  - Follow-up must exist and be `PENDING` (`FOLLOW_UP_NOT_PENDING`).
  - Caller must be the assignee (`FOLLOW_UP_ACCESS_DENIED`).
  - Sets `status = COMPLETED`, `completedAt = now`, `completedBy = user.id`, and overwrites `remark`.
  - Logs a `LeadActivity` of type `follow_up` (`metadata.action = "FOLLOW_UP_COMPLETED"`).
- **Responses:**
  - `200 OK` — `data.followUp`.
  - `400 INVALID_FOLLOW_UP_ID` / `400 FOLLOW_UP_NOT_PENDING` / `400 VALIDATION_ERROR`.
  - `403 FOLLOW_UP_ACCESS_DENIED`.
  - `404 FOLLOW_UP_NOT_FOUND`.

#### 2.9.3 `GET /api/v1/leads/:id/follow-ups` — List follow-ups for a lead

- **Permission:** `lead:view`
- **Returns** all follow-ups sorted by `scheduledAt: -1`. `assignedTo` and `completedBy` populated (`name email role`).

#### 2.9.4 `GET /api/v1/leads/my/follow-ups` — My pending follow-ups

- **Permission:** `lead:view`
- **Returns** the caller's own `PENDING` follow-ups, sorted `scheduledAt: 1`. `lead` is populated with `name phone email city status`.

> ⚠️ **Access-scope note:** these four follow-up endpoints currently look up follow-ups / lead IDs without applying `buildLeadAccessFilter`. In practice they are limited to the actor being the assignee (create / complete) or, for "my follow-ups", `assignedTo == user.id`. Treat them as per-employee scoped; do not rely on them to enumerate follow-ups across other employees in the same branch.

---

## 3. Data shapes

### 3.1 `Lead` (response item)

```jsonc
{
  "_id": "ObjectId",
  "name": "string",
  "phoneCountryCode": "+91",
  "phone": "9876543210",
  "email": "string?",
  "city": "string?",
  "industry": "string?",
  "message": "string?",
  "remarks": "string?",
  "status": "new",
  "source": "string",
  "sourceType": "MANUAL",
  "externalId": "string?",
  "branch": { "_id": "ObjectId", "name": "string", "code": "string" } | "ObjectId",
  "assignedTo": { "_id", "name", "email", "role" } | "ObjectId" | null,
  "assignedBy": "ObjectId" | null,
  "assignedAt": "ISO date" | null,
  "createdBy": { "_id", "name", "email", "role" } | "ObjectId",
  "isDeleted": false,
  "createdAt": "ISO date",
  "updatedAt": "ISO date"
}
```

### 3.2 `LeadFollowUp`

```jsonc
{
  "_id": "ObjectId",
  "lead": "ObjectId",
  "assignedTo": { "_id", "name", "email", "role" } | "ObjectId",
  "createdBy": "ObjectId",
  "branch": "ObjectId",
  "scheduledAt": "ISO date",
  "status": "PENDING" | "COMPLETED" | "CANCELLED" | "MISSED",
  "remark": "string?",
  "completedAt": "ISO date" | null,
  "completedBy": { "_id", "name", "email", "role" } | "ObjectId" | null,
  "createdAt": "ISO date",
  "updatedAt": "ISO date"
}
```

### 3.3 `LeadActivity`

```jsonc
{
  "_id": "ObjectId",
  "lead": "ObjectId",
  "activityType": "created" | "assigned" | "status_changed" | "remark_added" | "follow_up",
  "performedBy": { "_id", "name", "email", "role" } | "ObjectId",
  "previousStatus": "string?",
  "newStatus": "string?",
  "remark": "string?",
  "metadata": { "...": "..." },
  "createdAt": "ISO date",
  "updatedAt": "ISO date"
}
```

### 3.4 `LeadAssignmentHistory` (side effect of assign)

```jsonc
{
  "_id": "ObjectId",
  "lead": "ObjectId",
  "assignedTo": "ObjectId",
  "assignedBy": "ObjectId",
  "branch": "ObjectId",
  "previousAssignee": "ObjectId" | null,
  "assignedAt": "ISO date",
  "createdAt": "ISO date"
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
| `BRANCH_NOT_ASSIGNED` | 403 | Actor has no branches in their record |
| `INVALID_BRANCH_ASSIGNMENT` | 403 | All branches are malformed ObjectIds |
| `BRANCH_ACCESS_DENIED` | 403 | Actor's role can't operate on the requested branch |
| `CROSS_BRANCH_ASSIGNMENT` | 403 | Target employee isn't in lead's branch |
| `LEAD_ACCESS_DENIED` | 403 | Employee tried to view/update someone else's lead |
| `FOLLOW_UP_ACCESS_DENIED` | 403 | Caller isn't the assignee on the follow-up |
| `INVALID_LEAD_ID` | 400 | `req.params.id` is not a valid ObjectId |
| `LEAD_ID_REQUIRED` | 400 | `:id` param missing or non-string |
| `INVALID_BRANCH_ID` | 400 | Body `branchId` is not a valid ObjectId |
| `BRANCH_ID_REQUIRED` | 400 | Body `branchId` missing on import |
| `BRANCH_REQUIRED` | 400 | Create-lead branch resolution failed |
| `BRANCH_NOT_FOUND` | 404 | Branch missing or inactive |
| `LEAD_NOT_FOUND` | 404 | Lead missing / soft-deleted / out of branch scope |
| `LEAD_NOT_ASSIGNED` | 400 | Tried to schedule a follow-up on an unassigned lead |
| `LEAD_ALREADY_EXISTS` | 409 | Duplicate `branch + country code + phone` |
| `INVALID_EMPLOYEE_ID` | 400 | `employeeId` is not a valid ObjectId |
| `EMPLOYEE_NOT_FOUND` | 404 | Employee missing or inactive |
| `EMPLOYEE_INACTIVE` | 400 | Assigning to an inactive employee (legacy) |
| `INVALID_ASSIGNMENT_TARGET` | 400 | Tried to assign to a non-employee role |
| `ACTOR_NOT_FOUND` | 401 | Assigning user vanished |
| `INVALID_FOLLOW_UP_ID` | 400 | `followUpId` is not a valid ObjectId |
| `FOLLOW_UP_ID_REQUIRED` | 400 | `:followUpId` param missing |
| `FOLLOW_UP_NOT_FOUND` | 404 | Follow-up record missing |
| `FOLLOW_UP_NOT_PENDING` | 400 | Tried to complete a non-pending follow-up |
| `STATUS_UNCHANGED` | 400 | Status update with same status and no remark |
| `NO_CHANGES` | 400 | (legacy) |
| `IMPORT_FILE_REQUIRED` | 400 | No file on the multipart import request |
| `EMPTY_IMPORT_FILE` | 400 | Buffer is empty |
| `EMPTY_WORKBOOK` | 400 | Excel has no worksheets |
| `WORKSHEET_NOT_FOUND` | 400 | First sheet unreadable |
| `NO_LEADS_FOUND` | 400 | Excel had headers but no data rows |
| `INTERNAL_SERVER_ERROR` | 500 | Fallback for unhandled exceptions |

---

## 5. Examples

### 5.1 Create a lead (cURL)

```bash
curl -X POST http://localhost:8000/api/v1/leads \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe",
    "phoneCountryCode": "+91",
    "phone": "9876543210",
    "email": "john@example.com",
    "city": "Mumbai",
    "industry": "SaaS",
    "source": "Website",
    "sourceType": "MANUAL"
  }'
```

### 5.2 List assigned leads (employee)

```bash
curl "http://localhost:8000/api/v1/leads?status=follow_up&assignedTo=65f0abc&page=1&limit=25" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

### 5.3 Update lead status with a remark

```bash
curl -X PATCH http://localhost:8000/api/v1/leads/65f0abc/status \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "status": "qualified", "remark": "Budget approved, awaiting contract" }'
```

### 5.4 Bulk import (Excel)

```bash
curl -X POST http://localhost:8000/api/v1/leads/import \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -F "file=@./leads.xlsx" \
  -F "branchId=65f0branch"
```

### 5.5 Schedule and complete a follow-up

```bash
# Schedule
curl -X POST http://localhost:8000/api/v1/leads/65f0lead/follow-ups \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "scheduledAt": "2026-08-20T10:30:00.000Z", "remark": "Call back" }'

# Complete
curl -X PATCH http://localhost:8000/api/v1/leads/follow-ups/65f0followUp/complete \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "remark": "Sent proposal and pricing PDF" }'
```

---

## 6. Implementation notes / gotchas

- **Soft delete.** Leads are never hard-deleted. All read queries filter `isDeleted: false`. There is currently **no DELETE endpoint** in the leads module — `LEAD_DELETE` exists as a permission but is unused here.
- **Status enum mismatch.** `LEAD_STATUS` constants are lowercase (`"new"`, `"assigned"`, …) but `listLeadQuerySchema` only accepts the older uppercase set (`NEW`, `ASSIGNED`, `CONTACTED`, `FOLLOW_UP`, `INTERESTED`, `NEGOTIATION`, `WON`, `LOST`, `JUNK`). When calling `GET /leads?status=…` you must use those uppercase tokens. `PATCH /:id/status` accepts the canonical lowercase set via `Object.values(LEAD_STATUS)`. Plan to align both in a follow-up.
- **Two `assignLead` implementations.** The route currently wires `lead-assignment.controller.ts` → `lead-assignment.service.ts` (which writes `LeadAssignmentHistory`). The `lead.service.ts` file still contains a fully commented-out alternative. When extending, only edit the live path.
- **Two assignment validators.** `src/validators/lead-assignment.validator.ts` (live, only `employeeId` non-empty) and `src/validators/lead.validator.ts#assignLeadSchema` (legacy, full regex on ObjectId + optional `reason`). The route uses the live one.
- **`reason` on assignment** is currently *not* persisted by the active assign service (no `reason` field on `LeadAssignmentHistory`).
- **Branch filter for `EMPLOYEE`.** `GET /leads?assignedTo=…` is silently forced to the caller's id; supplying any other id returns `LEAD_ACCESS_DENIED`.
- **Follow-up scope.** The follow-up endpoints do not currently apply `buildLeadAccessFilter`; access is enforced only by assignee matching. Do not advertise cross-employee visibility in the UI.
- **Audit logging.** Every create / assign / status update / remark / import writes an entry to the `AuditLog` collection via `createAuditLog`. The audit routes live under `/api/v1/audit-logs` and require `audit:view` / `audit:read`.
- **Rate limiting.** The 300/15min limiter is global. There is no per-endpoint override.
- **Timestamps.** The service uses `scheduledAt` in `createLeadFollowUp` but the route/validator field is `followUpAt` in `lead.validator.ts` (legacy) — the live path uses `scheduledAt` from `lead-followup.validator.ts`. Make sure request bodies use `scheduledAt` (the live validator's field name).
- **Idempotency.** No idempotency keys. Creating the same lead twice within the same branch always returns `409 LEAD_ALREADY_EXISTS`.

---

## 7. Related modules

- **Branches** — `/api/v1/branches` (`branch:view`, etc.). Branch access scopes everything in this module.
- **Users** — `/api/v1/users`. Used to resolve `assignedTo`, `createdBy`, and the actor.
- **Audit logs** — `/api/v1/audit-logs` (`audit:view`, `audit:read`). Every state-changing leads endpoint writes here.
- **Auth** — `/api/v1/auth`. The `Authorization: Bearer <token>` header is required; tokens are issued there.

---

_Last generated from the source under `src/` at the current `main` HEAD. If you change a route, controller, or schema, regenerate this file._
