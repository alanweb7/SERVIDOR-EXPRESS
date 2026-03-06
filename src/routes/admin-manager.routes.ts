import type { FastifyInstance } from "fastify";
import { verifyAdminManagerAuth } from "../middlewares/admin-manager-auth.js";
import { AdminManagerController } from "../controllers/admin-manager.controller.js";
import { AdminManagerService } from "../services/admin-manager.service.js";

export async function adminManagerRoutes(app: FastifyInstance): Promise<void> {
  const controller = new AdminManagerController(new AdminManagerService());

  app.get(
    "/api/v1/admin/manager/menu",
    { preHandler: verifyAdminManagerAuth },
    controller.menu.bind(controller)
  );

  app.get(
    "/api/v1/admin/manager/agents",
    { preHandler: verifyAdminManagerAuth },
    controller.listAgents.bind(controller)
  );

  app.post(
    "/api/v1/admin/manager/agents/create",
    { preHandler: verifyAdminManagerAuth },
    controller.createAgent.bind(controller)
  );

  app.post(
    "/api/v1/admin/manager/agents/set-identity",
    { preHandler: verifyAdminManagerAuth },
    controller.setIdentity.bind(controller)
  );

  app.post(
    "/api/v1/admin/manager/agents/bind",
    { preHandler: verifyAdminManagerAuth },
    controller.bindChannel.bind(controller)
  );

  app.post(
    "/api/v1/admin/manager/agents/create-from-template",
    { preHandler: verifyAdminManagerAuth },
    controller.createFromTemplate.bind(controller)
  );

  app.get(
    "/api/v1/admin/manager/agents/persistent",
    { preHandler: verifyAdminManagerAuth },
    controller.listPersistentAgents.bind(controller)
  );

  app.post(
    "/api/v1/admin/manager/agents/persistent",
    { preHandler: verifyAdminManagerAuth },
    controller.upsertPersistentAgent.bind(controller)
  );

  app.post(
    "/api/v1/admin/manager/agents/persistent/sync",
    { preHandler: verifyAdminManagerAuth },
    controller.syncPersistentAgent.bind(controller)
  );
}
