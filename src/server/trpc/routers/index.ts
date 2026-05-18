import { router } from "@/server/trpc/init";
import { aiRouter } from "./ai";
import { authRouter } from "./auth";
import { categoriesRouter } from "./categories";
import { contactsRouter } from "./contacts";
import { dashboardRouter } from "./dashboard";
import { expensesRouter, payablesRouter, receivablesRouter } from "./finance";
import { productsRouter } from "./products";
import { salesRouter } from "./sales";
import { settingsRouter } from "./settings";
import { tasksRouter } from "./tasks";
import { tenantRouter } from "./tenant";

export const appRouter = router({
  auth: authRouter,
  tenant: tenantRouter,
  dashboard: dashboardRouter,
  contacts: contactsRouter,
  products: productsRouter,
  categories: categoriesRouter,
  sales: salesRouter,
  receivables: receivablesRouter,
  payables: payablesRouter,
  expenses: expensesRouter,
  tasks: tasksRouter,
  ai: aiRouter,
  settings: settingsRouter,
});

export type AppRouter = typeof appRouter;
