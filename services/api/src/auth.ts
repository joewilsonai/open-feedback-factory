import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AdminRole, ApiConfig } from "./config.js";

type AdminPermission = "admin:read" | "merge:write" | "owner" | "policy:write" | "repo:write" | "secrets:write" | "work:write";

interface AdminPrincipal {
  role: AdminRole;
}

export async function registerAccessControls(app: FastifyInstance, config: ApiConfig): Promise<void> {
  app.addHook("preHandler", async (request, reply) => {
    if (request.url.startsWith("/admin/")) {
      return requireAdminPermission({
        config,
        permission: adminPermissionForRequest(request),
        reply,
        request,
      });
    }
    if (request.url.startsWith("/runner/")) {
      return requireToken({
        configuredToken: config.runnerToken,
        error: "runner_auth_required",
        headerName: "x-off-runner-token",
        reply,
        request,
      });
    }
  });
}

export function accessControlStatus(config: ApiConfig): {
  adminAuthRequired: boolean;
  adminRbacEnabled: boolean;
  adminRoles: AdminRole[];
  runnerAuthRequired: boolean;
} {
  return {
    adminAuthRequired: Boolean(config.adminToken || config.adminRoleTokens.length),
    adminRbacEnabled: config.adminRoleTokens.length > 0,
    adminRoles: configuredAdminRoles(config),
    runnerAuthRequired: Boolean(config.runnerToken),
  };
}

function requireAdminPermission(input: {
  config: ApiConfig;
  permission: AdminPermission;
  reply: FastifyReply;
  request: FastifyRequest;
}): FastifyReply | undefined {
  const authConfigured = Boolean(input.config.adminToken || input.config.adminRoleTokens.length);
  if (!authConfigured) return undefined;

  const principal = resolveAdminPrincipal(input.config, input.request);
  if (!principal) {
    return input.reply
      .code(401)
      .header("www-authenticate", "Bearer")
      .send({
        error: "admin_auth_required",
        status: "blocked",
      });
  }

  if (adminRoleAllows(principal.role, input.permission)) return undefined;

  return input.reply
    .code(403)
    .send({
      error: "admin_permission_denied",
      requiredPermission: input.permission,
      role: principal.role,
      status: "blocked",
    });
}

function requireToken(input: {
  configuredToken: string | undefined;
  error: string;
  headerName: string;
  reply: FastifyReply;
  request: FastifyRequest;
}): FastifyReply | undefined {
  if (!input.configuredToken) return undefined;
  const supplied = readToken(input.request, input.headerName);
  if (supplied && tokensEqual(supplied, input.configuredToken)) return undefined;

  return input.reply
    .code(401)
    .header("www-authenticate", "Bearer")
    .send({
      error: input.error,
      status: "blocked",
    });
}

function resolveAdminPrincipal(config: ApiConfig, request: FastifyRequest): AdminPrincipal | null {
  const supplied = readToken(request, "x-off-admin-token");
  if (!supplied) return null;
  if (config.adminToken && tokensEqual(supplied, config.adminToken)) return { role: "owner" };

  for (const roleToken of config.adminRoleTokens) {
    if (tokensEqual(supplied, roleToken.token)) return { role: roleToken.role };
  }

  return null;
}

function adminPermissionForRequest(request: FastifyRequest): AdminPermission {
  const path = request.url.split("?")[0] ?? request.url;
  if (request.method === "GET") return "admin:read";
  if (path === "/admin/settings/codex-api-key") return "secrets:write";
  if (path.startsWith("/admin/settings/")) return "policy:write";
  if (path === "/admin/connect/sdk-install-pr") return "repo:write";
  if (path.endsWith("/automerge")) return "merge:write";
  if (path.startsWith("/admin/work-items/")) return "work:write";
  if (path === "/admin/reconciliation/run") return "work:write";
  return "owner";
}

function adminRoleAllows(role: AdminRole, permission: AdminPermission): boolean {
  return adminPermissionsForRole(role).includes(permission);
}

function adminPermissionsForRole(role: AdminRole): AdminPermission[] {
  if (role === "owner") {
    return ["admin:read", "work:write", "repo:write", "policy:write", "merge:write", "secrets:write", "owner"];
  }
  if (role === "admin") {
    return ["admin:read", "work:write", "repo:write", "policy:write", "merge:write"];
  }
  if (role === "operator") {
    return ["admin:read", "work:write"];
  }
  return ["admin:read"];
}

function configuredAdminRoles(config: ApiConfig): AdminRole[] {
  const roles = new Set<AdminRole>();
  for (const roleToken of config.adminRoleTokens) roles.add(roleToken.role);
  if (config.adminToken) roles.add("owner");
  return Array.from(roles);
}

function readToken(request: FastifyRequest, headerName: string): string | undefined {
  const direct = request.headers[headerName];
  if (typeof direct === "string" && direct.trim()) return direct.trim();

  const authorization = request.headers.authorization;
  if (typeof authorization !== "string") return undefined;
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim();
}

function tokensEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}
