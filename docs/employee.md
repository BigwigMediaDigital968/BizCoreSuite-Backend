# Employees Module — API Documentation

**Base path:** `/api/v1/employee`
**Module:** `apex--crm-backend` (Node.js / Express / TypeScript / MongoDB)
**Auth:** Bearer JWT (access token) on every endpoint
**Source of truth:** `src/routes/employee.routes.ts`, `src/controllers/employee.controller.ts`, `src/services/employee.service.ts`, `src/validators/employee.validator.ts`, `src/models/EmployeeProfile.ts`

---

## 1. Overview

The Employees module stores the HR/employment profile for a `User` with the `employee` role. It links a user record to a branch, an `employeeCode`, employment metadata (type/status/joining date), personal/contact info, salary structure, bank details, and document references.

All endpoints are mounted under `/api/v1/employee` and require:

1. `authenticate` middleware — validates JWT and loads `req.user`.
2. `authorize(permission)` middleware — checks the user's role-permission map.

There is **no `DELETE` endpoint** and **no `PUT/PATCH` endpoint** in the current routes file — only create, list, and get-by-id. (The `updateEmployeeProfileSchema` exists in the validator but is not wired to a route.)

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

### 1.2 Roles & permissions

Roles: `head`, `admin`, `manager`, `employee` (see `src/constants/roles.ts`).

Permissions used by this module:

| Permission         | Used for |
|--------------------|----------|
| `employee:view`    | List employees, get employee by id |
| `employee:create`  | Create an employee profile |

> ⚠️ The constants `EMPLOYEE_UPDATE`, `EMPLOYEE_DELETE`, `EMPLOYEE_DOCUMENT_VIEW`, `EMPLOYEE_DOCUMENT_UPDATE`, `EMPLOYEE_SALARY_VIEW`, and `EMPLOYEE_SALARY_UPDATE` are defined in `src/constants/permissions.ts` but **no routes currently use them**. Salary/document fields are returned in the create/get responses and may be sensitive — treat their exposure as in-progress and review before exposing to managers/employees.

Role × permission summary for the routes that exist today (see `src/permissions/rolePermissions.ts`):

| Role     | `employee:view` | `employee:create` |
|----------|-----------------|-------------------|
| head     | ✅              | ✅                |
| admin    | ✅              | ✅                |
| manager  | ✅              | ❌                |
| employee | ✅ (own only)   | ❌                |

### 1.3 Branch access model

`HEAD` has global branch access. `ADMIN` / `MANAGER` / `EMPLOYEE` are restricted to the branches stored on the user record (`req.user.branches: string[]`).

- **`POST /api/v1/employee`** — service-level check (`assertBranchAccess`): if the actor is not `HEAD`, the requested `branchId` must be in `req.user.branches` (else `403 BRANCH_ACCESS_DENIED`).
- **`GET /api/v1/employee`** — service-level filter:
  - `EMPLOYEE` → forced to `user == self.id` (employees can only ever see themselves).
  - `MANAGER` / `ADMIN` → employees in their branch list.
  - `HEAD` → all employees; `branchId` query filter is honored.
- **`GET /api/v1/employee/:id`** — service-level check: the resolved employee's `branch` must be in the actor's `branches` list (HEAD bypasses). Additionally, if the actor is an `EMPLOYEE`, the profile's `user._id` must equal the actor's `id`.

### 1.4 Enums

**Employment type** (`src/constants/employee.ts`):
`full_time`, `part_time`, `contract`, `intern`

**Employment status** (`src/constants/employee.ts`):
`active`, `probation`, `notice_period`, `resigned`, `terminated`, `inactive`

**Gender** (`src/constants/employee.ts`):
`male`, `female`, `other`

**Working-days encoding** (used in `Branch.attendanceConfig.workingDays`, surfaced indirectly through branch-scoped reads):
`0 = Sunday`, `1 = Monday`, …, `6 = Saturday`

### 1.5 EmployeeProfile model — fields & rules

| Field                     | Type / Constraint |
|---------------------------|-------------------|
| `_id`                     | ObjectId |
| `user`                    | ObjectId → `User`, required, **unique** |
| `employeeCode`            | string, 2–30, uppercase, required, **unique** |
| `branch`                  | ObjectId → `Branch`, required, indexed |
| `reportingManager`        | ObjectId → `User` (must have `manager` role and belong to the same branch), optional, indexed |
| `designation`             | string, ≤150 |
| `department`              | string, ≤150 |
| `employmentType`          | EmploymentType, required, default `full_time`, indexed |
| `employmentStatus`        | EmploymentStatus, required, default `active`, indexed |
| `joiningDate`             | Date, required |
| `probationEndDate`        | Date, optional |
| `dateOfBirth`             | Date, optional |
| `gender`                  | Gender, optional |
| `personalPhone`           | string, ≤20 |
| `alternatePhone`          | string, ≤20 |
| `address`                 | string, ≤500 |
| `city`                    | string, ≤100 |
| `state`                   | string, ≤100 |
| `country`                 | string, ≤100, default `"India"` |
| `postalCode`              | string, ≤20 |
| `emergencyContactName`    | string, ≤150 |
| `emergencyContactPhone`   | string, ≤20 |
| `emergencyContactRelation`| string, ≤100 |
| `documents`               | `IEmployeeDocument[]` (see below), default `[]` |
| `salary`                  | `ISalaryStructure` (see below), required |
| `bankDetails`             | `IBankDetails` (see below), optional |
| `notes`                   | string, ≤3000 |
| `createdBy`               | ObjectId → `User`, required |
| `updatedBy`               | ObjectId → `User` |
| `createdAt`               | Date |
| `updatedAt`               | Date |

Indexes: `user` (unique), `employeeCode` (unique), `branch`, `reportingManager`, `employmentType`, `employmentStatus`, `{branch, employmentStatus}`, `{branch, reportingManager}`, `{joiningDate: -1}`.

**`IEmployeeDocument`:**
```jsonc
{
  "_id": "ObjectId?",
  "documentType": "string (1–100)",   // required
  "documentNumber": "string?",
  "documentUrl": "string URL",        // required
  "publicId": "string?",
  "uploadedAt": "Date"
}
```

**`ISalaryStructure`:**
```jsonc
{
  "basic": 0,
  "hra": 0,
  "conveyance": 0,
  "medicalAllowance": 0,
  "specialAllowance": 0,
  "otherAllowance": 0,
  "grossSalary": 0,                   // required
  "pfDeduction": 0,
  "esiDeduction": 0,
  "professionalTax": 0,
  "otherDeduction": 0,
  "netSalary": 0                      // required
}
```

**`IBankDetails`:** `{ accountHolderName?, accountNumber?, ifscCode?, bankName?, branchName? }`

Unique constraints:
- `user` — one profile per user (`EMPLOYEE_PROFILE_EXISTS`).
- `employeeCode` — globally unique, uppercased before write (`EMPLOYEE_CODE_EXISTS`).
- `Branch.code` — branch codes are unique; an employee profile's `branch` must be a real, active branch (`BRANCH_NOT_FOUND`).

---

## 2. Endpoint reference

### 2.1 `POST /api/v1/employee` — Create an employee profile

- **Permission:** `employee:create` (currently only `head` and `admin`).
- **Body (`createEmployeeProfileSchema` — Zod):**

```jsonc
{
  "userId": "65f0...",                          // required, non-empty
  "employeeCode": "EMP-001",                    // required, 2–30 (uppercased on save)
  "branchId": "65f0...",                        // required, non-empty, must be in actor's branch list (HEAD bypasses)

  "reportingManager": "65f0...",                // optional; must be a manager-role user in the same branch
  "designation": "Sales Executive",             // optional, ≤150
  "department": "Sales",                        // optional, ≤150

  "employmentType": "full_time",                // required: full_time | part_time | contract | intern
  "employmentStatus": "active",                 // optional: active | probation | notice_period | resigned | terminated | inactive
  "joiningDate": "2026-08-01",                  // required, ISO date
  "probationEndDate": "2026-11-01",             // optional, ISO date
  "dateOfBirth": "1995-04-12",                  // optional, ISO date
  "gender": "male",                             // optional: male | female | other

  "personalPhone": "+91-9876543210",            // optional, ≤20
  "alternatePhone": "+91-9123456789",           // optional, ≤20
  "address": "221B Baker Street",               // optional, ≤500
  "city": "Mumbai",                             // optional, ≤100
  "state": "MH",                                // optional, ≤100
  "country": "India",                           // optional, ≤100
  "postalCode": "400001",                       // optional, ≤20

  "emergencyContactName": "Jane Doe",           // optional
  "emergencyContactPhone": "+91-9988776655",    // optional
  "emergencyContactRelation": "Sibling",        // optional

  "documents": [                                // optional array
    {
      "documentType": "Aadhaar",
      "documentNumber": "XXXX-XXXX-1234",
      "documentUrl": "https://cdn.example.com/docs/aadhaar.pdf",
      "publicId": "abc123",
      "uploadedAt": "2026-08-10T10:00:00.000Z"
    }
  ],

  "salary": {                                   // required
    "basic": 30000,
    "hra": 12000,
    "conveyance": 2000,
    "medicalAllowance": 1500,
    "specialAllowance": 5000,
    "otherAllowance": 0,
    "grossSalary": 50500,
    "pfDeduction": 1800,
    "esiDeduction": 0,
    "professionalTax": 200,
    "otherDeduction": 0,
    "netSalary": 48500
  },

  "bankDetails": {                              // optional
    "accountHolderName": "John Doe",
    "accountNumber": "1234567890",
    "ifscCode": "HDFC0000123",
    "bankName": "HDFC Bank",
    "branchName": "Mumbai Main"
  },

  "notes": "Joined via campus placement."        // optional, ≤3000
}
```

Validation rules (from `createEmployeeProfileSchema`):
- `userId`, `branchId` must be non-empty strings (no ObjectId format check at the validator layer).
- `employeeCode` trimmed, 2–30 chars.
- `employmentType` required and must be a member of `EMPLOYMENT_TYPES`.
- `employmentStatus`, if provided, must be a member of `EMPLOYMENT_STATUS`.
- `joiningDate`, `probationEndDate`, `dateOfBirth` are coerced from any date-parsable string.
- `gender`, if provided, must be a member of `GENDER`.
- `documents` items: `documentType` 1–100; `documentUrl` must be a valid URL; `uploadedAt` defaults to `now`.
- `salary.*` numeric fields are `≥ 0`; `grossSalary` and `netSalary` are required.
- `notes` ≤ 3000 chars.

Service-level validations (`createEmployeeProfile`):
1. `assertBranchAccess(branchId, context)` — non-HEAD actors must have the branch in their list (`403 BRANCH_ACCESS_DENIED`).
2. User must exist (`404 USER_NOT_FOUND`) and be `isActive` (`400 USER_INACTIVE`).
3. Branch must exist and be `isActive` (`404 BRANCH_NOT_FOUND`).
4. No existing profile for that user (`409 EMPLOYEE_PROFILE_EXISTS`).
5. No existing profile with the same `employeeCode` (case-insensitive via uppercasing) (`409 EMPLOYEE_CODE_EXISTS`).
6. If `reportingManager` is provided, the manager must exist (`404 MANAGER_NOT_FOUND`), have role `manager` (`400 INVALID_REPORTING_MANAGER`), and belong to the same branch as the new employee (`400 MANAGER_BRANCH_MISMATCH`).

**Responses**
- `201 Created` — `data` is the new `EmployeeProfile` (Mongoose doc, not populated).
- `400 VALIDATION_ERROR` — Zod failure.
- `400 USER_INACTIVE` / `400 INVALID_REPORTING_MANAGER` / `400 MANAGER_BRANCH_MISMATCH`.
- `403 BRANCH_ACCESS_DENIED`.
- `404 USER_NOT_FOUND` / `404 BRANCH_NOT_FOUND` / `404 MANAGER_NOT_FOUND`.
- `409 EMPLOYEE_PROFILE_EXISTS` / `409 EMPLOYEE_CODE_EXISTS`.

Side effects: writes an `AuditLog` row (`action: "EMPLOYEE_CREATED"`, `entity: "EmployeeProfile"`, `branch` = new employee's branch). Does not modify the `User` record's `branches` array.

---

### 2.2 `GET /api/v1/employee` — List employees (paginated, filterable)

- **Permission:** `employee:view`
- **Query (`employeeListQuerySchema` — Zod, all coerced):**

| Param      | Type / Values | Default | Notes |
|------------|---------------|---------|-------|
| `page`     | int ≥ 1       | `1`     | |
| `limit`    | int 1–100     | `20`    | |
| `branchId` | string        | —       | Only honored for `HEAD`; other roles have their branch list applied automatically. |
| `status`   | EmploymentStatus | —     | Exact match on `employmentStatus`. |
| `search`   | string ≤100   | —       | Case-insensitive regex on `employeeCode`, `designation`, `department`. |

**Response:**

```json
{
  "success": true,
  "data": [
    {
      "_id": "65f0...",
      "employeeCode": "EMP-001",
      "user": { "_id": "...", "name": "...", "email": "...", "role": "employee", "isActive": true },
      "branch": { "_id": "...", "name": "...", "code": "...", "city": "..." },
      "designation": "Sales Executive",
      "department": "Sales",
      "employmentType": "full_time",
      "employmentStatus": "active",
      "joiningDate": "2026-08-01T00:00:00.000Z",
      "salary": { "grossSalary": 50500, "netSalary": 48500, "...": "..." },
      "bankDetails": { "...": "..." },
      "documents": [ { "...": "..." } ],
      "createdBy": "...",
      "createdAt": "...",
      "updatedAt": "..."
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 47,
    "totalPages": 3
  }
}
```

Notes:
- Items are sorted by `createdAt: -1`.
- `user` is populated with `name email role isActive`.
- `branch` is populated with `name code city` (the get-by-id route also includes `state`).
- For `EMPLOYEE` actors, the list is silently constrained to their own profile only.
- For `MANAGER` / `ADMIN`, the list is restricted to employees whose `branch` is in `req.user.branches`. Passing `branchId` from a non-HEAD actor is ignored (the filter is applied unconditionally for non-HEAD).

**Responses / errors:**
- `200 OK`.
- `400 VALIDATION_ERROR` — Zod failure on query.

---

### 2.3 `GET /api/v1/employee/:id` — Get an employee profile

- **Permission:** `employee:view`
- **Path:** `id` — ObjectId of the `EmployeeProfile`.
- **Behavior (`getEmployeeProfileById`):**
  - Populates `user` (`name email role isActive`), `branch` (`name code city state`), and `reportingManager` (`name email role`).
  - Returns the doc as a plain object (`lean()`).
  - If the actor is not `HEAD`, the employee's `branch._id` must be in the actor's `branches` list (else `403 EMPLOYEE_ACCESS_DENIED`).
  - If the actor is an `EMPLOYEE`, the employee's `user._id` must equal the actor's id (else `403 EMPLOYEE_ACCESS_DENIED`).

**Responses:**
- `200 OK` — `data` is the populated employee profile.
- `400 INVALID_EMPLOYEE_ID` — `id` is not a string.
- `403 EMPLOYEE_ACCESS_DENIED` — actor's branch scope or self-only check failed.
- `404 EMPLOYEE_NOT_FOUND` — profile missing.

---

## 3. Data shapes

### 3.1 `EmployeeProfile` (response item)

```jsonc
{
  "_id": "ObjectId",
  "user": { "_id", "name", "email", "role", "isActive" },
  "employeeCode": "EMP-001",
  "branch": { "_id", "name", "code", "city", "state?" },
  "reportingManager": { "_id", "name", "email", "role" } | null,
  "designation": "string?",
  "department": "string?",
  "employmentType": "full_time",
  "employmentStatus": "active",
  "joiningDate": "ISO date",
  "probationEndDate": "ISO date?",
  "dateOfBirth": "ISO date?",
  "gender": "male | female | other",
  "personalPhone": "string?",
  "alternatePhone": "string?",
  "address": "string?",
  "city": "string?",
  "state": "string?",
  "country": "India",
  "postalCode": "string?",
  "emergencyContactName": "string?",
  "emergencyContactPhone": "string?",
  "emergencyContactRelation": "string?",
  "documents": [
    {
      "_id": "ObjectId",
      "documentType": "string",
      "documentNumber": "string?",
      "documentUrl": "string URL",
      "publicId": "string?",
      "uploadedAt": "ISO date"
    }
  ],
  "salary": { "...": "see ISalaryStructure" },
  "bankDetails": { "...": "see IBankDetails" } | null,
  "notes": "string?",
  "createdBy": "ObjectId",
  "updatedBy": "ObjectId?",
  "createdAt": "ISO date",
  "updatedAt": "ISO date"
}
```

### 3.2 `ISalaryStructure`

```jsonc
{
  "basic": 0, "hra": 0, "conveyance": 0,
  "medicalAllowance": 0, "specialAllowance": 0, "otherAllowance": 0,
  "grossSalary": 0,
  "pfDeduction": 0, "esiDeduction": 0, "professionalTax": 0, "otherDeduction": 0,
  "netSalary": 0
}
```

### 3.3 `IBankDetails`

```jsonc
{
  "accountHolderName": "string?",
  "accountNumber": "string?",
  "ifscCode": "string?",
  "bankName": "string?",
  "branchName": "string?"
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
| `BRANCH_ACCESS_DENIED` | 403 | Actor's `branches` does not include the requested branch |
| `EMPLOYEE_ACCESS_DENIED` | 403 | Employee-scoped check failed (branch scope or self-only) |
| `INVALID_EMPLOYEE_ID` | 400 | `req.params.id` was not a string |
| `USER_NOT_FOUND` | 404 | `userId` from create body does not exist |
| `USER_INACTIVE` | 400 | Tried to create a profile for an inactive user |
| `BRANCH_NOT_FOUND` | 404 | `branchId` from create body is missing or inactive |
| `MANAGER_NOT_FOUND` | 404 | `reportingManager` user does not exist |
| `INVALID_REPORTING_MANAGER` | 400 | `reportingManager` does not have the `manager` role |
| `MANAGER_BRANCH_MISMATCH` | 400 | `reportingManager` does not belong to the employee's branch |
| `EMPLOYEE_NOT_FOUND` | 404 | Profile lookup miss |
| `EMPLOYEE_PROFILE_EXISTS` | 409 | One profile per `user` |
| `EMPLOYEE_CODE_EXISTS` | 409 | `employeeCode` already taken (case-insensitive) |
| `INTERNAL_SERVER_ERROR` | 500 | Fallback for unhandled exceptions |

---

## 5. Examples

### 5.1 Create an employee profile (admin)

```bash
curl -X POST http://localhost:8000/api/v1/employee \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "65f0userabc",
    "employeeCode": "EMP-001",
    "branchId": "65f0branch1",
    "designation": "Sales Executive",
    "department": "Sales",
    "employmentType": "full_time",
    "employmentStatus": "active",
    "joiningDate": "2026-08-01",
    "personalPhone": "+91-9876543210",
    "salary": {
      "basic": 30000, "hra": 12000, "conveyance": 2000,
      "medicalAllowance": 1500, "specialAllowance": 5000, "otherAllowance": 0,
      "grossSalary": 50500,
      "pfDeduction": 1800, "esiDeduction": 0, "professionalTax": 200, "otherDeduction": 0,
      "netSalary": 48500
    }
  }'
```

### 5.2 List employees in my branch (manager)

```bash
curl "http://localhost:8000/api/v1/employee?status=active&page=1&limit=25" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

### 5.3 Search by name/designation

```bash
curl "http://localhost:8000/api/v1/employee?search=sales" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

### 5.4 Get my own profile (employee)

```bash
curl "http://localhost:8000/api/v1/employee/65f0employeeprofile" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

---

## 6. Implementation notes / gotchas

- **No update / delete routes.** `updateEmployeeProfileSchema` is exported from the validator file but is **not** wired to any route. `EMPLOYEE_UPDATE` / `EMPLOYEE_DELETE` permissions exist in `src/constants/permissions.ts` but no current role holds `EMPLOYEE_UPDATE` (only `head`). Plan endpoint additions before relying on these.
- **Sensitive fields in responses.** `salary`, `bankDetails`, and `documents` are returned on list and get without redaction. The `EMPLOYEE_SALARY_*` and `EMPLOYEE_DOCUMENT_*` permissions exist but are not enforced at the controller layer today — assume the data is exposed to anyone with `employee:view`.
- **`userId` / `branchId` are not ObjectId-validated at the validator layer.** They are validated downstream by the service via Mongoose queries. A non-ObjectId value will surface as a downstream `USER_NOT_FOUND` / `BRANCH_NOT_FOUND` rather than a `VALIDATION_ERROR`.
- **`employeeCode` is uppercased on write** by the service. The validator does not enforce uppercase; both `"emp-001"` and `"EMP-001"` are accepted and stored as `"EMP-001"`. The unique index is also uppercase.
- **Reporting-manager branch match is strict.** A manager must be in the **same** `branchId` as the new employee (`MANAGER_BRANCH_MISMATCH`). They cannot span branches.
- **`createdBy` is set automatically** to `req.user.id`; it is **not** accepted from the request body.
- **No link back to `User.branches`.** Creating an employee profile does **not** add the new branch to the user's `branches` array. Branch assignment for the underlying user is managed by `/api/v1/users` (`user:assign-branch`), not by the employee module.
- **No soft delete.** `EmployeeProfile` has no `isDeleted` flag and there is no delete route. Deleting requires either dropping the document or adding an endpoint.
- **`EMPLOYEE` listing self-only is silent.** `GET /api/v1/employee` for an `employee` user returns just their own profile with no `403`; do not rely on the response to detect other employees.
- **Audit logging.** `createEmployeeProfile` writes an `AuditLog` row (`action: "EMPLOYEE_CREATED"`, `entity: "EmployeeProfile"`, `branch` = new employee's branch). The audit routes live under `/api/v1/audit-logs` and require `audit:view` / `audit:read`.
- **Rate limiting.** The 300/15min limiter is global. There is no per-endpoint override.
- **`user.role` and `isActive` are checked, not `role === "employee"`.** Any active user (regardless of role) can be the target of a profile, but practically this module is intended for `employee`-role users. If you wire additional flows, gate on `user.role === "employee"`.
- **Documents are URLs only.** The schema stores a `documentUrl` and an optional `publicId`; there is no upload route in this module. Pair with whatever upload service writes the URL (e.g. Cloudinary public id) before creating the profile.

---

## 7. Related modules

- **Branches** — `/api/v1/branches` (`branch:view`, `branch:update`, `branch-attendance:view` / `branch-attendance:update`). The employee's `branch` and the manager's branch must reference real, active branches.
- **Users** — `/api/v1/users`. The `user` reference on the profile and the actor's `req.user.branches` are both sourced here. `user:assign-branch` updates the user's branch list.
- **Audit logs** — `/api/v1/audit-logs` (`audit:view`, `audit:read`). Every employee write goes here.
- **Auth** — `/api/v1/auth`. Issues the JWTs required on every endpoint.
- **Permissions** — `/api/v1/permissions`. Source of role × permission truth; the `employee:*` permissions used by this module are defined here.

---

_Last generated from the source under `src/` at the current `main` HEAD. If you change a route, controller, schema, or service, regenerate this file._
