import { router } from "@/server/trpc/init";
import { authRouter } from "./auth";
import { customersRouter } from "./customers";
import { servicesRouter } from "./services";
import { settingsRouter } from "./settings";
import { tenantRouter } from "./tenant";
import { visitsRouter } from "./visits";

export const appRouter = router({
  auth: authRouter,
  tenant: tenantRouter,
  services: servicesRouter,
  settings: settingsRouter,
  customers: customersRouter,
  visits: visitsRouter,
});

export type AppRouter = typeof appRouter;
