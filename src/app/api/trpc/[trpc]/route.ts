import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { createContext } from "@/server/trpc/init";
import { appRouter } from "@/server/trpc/routers";

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: (opts) => createContext(opts),
    onError({ error, path }) {
      if (process.env.NODE_ENV !== "production") {
        console.error(`[trpc] ${path ?? "<unknown>"}:`, error);
      }
    },
  });

export { handler as GET, handler as POST };
