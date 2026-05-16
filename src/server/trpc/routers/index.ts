import { router } from "@/server/trpc/init";
import { authRouter } from "./auth";
import { servicesRouter } from "./services";
import { settingsRouter } from "./settings";
import { tenantRouter } from "./tenant";

export const appRouter = router({
  auth: authRouter,
  tenant: tenantRouter,
  services: servicesRouter,
  settings: settingsRouter,
});

export type AppRouter = typeof appRouter;
