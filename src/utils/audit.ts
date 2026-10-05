import type { Request } from "express";

import {
  createAuditLog,
} from "../services/audit.service.js";

import type {
  AuditAction,
} from "../constants/auditActions.js";

import type {
  AuditEntity,
} from "../constants/auditEntities.js";

interface AuditRequestInput {
  req: Request;

  action: AuditAction;

  entity: AuditEntity;

  entityId?: string;

  branch?: string;

  metadata?: Record<string, unknown>;
}

export const auditRequest =
  async ({
    req,
    action,
    entity,
    entityId,
    branch,
    metadata,
  }: AuditRequestInput) => {
    if (!req.user) {
      return;
    }

    await createAuditLog({
      actor: req.user.id,

      action,

      entity,

      entityId,

      branch,

      metadata,

      ipAddress:
        req.ip,

      userAgent:
        req.get("user-agent"),
    });
  };