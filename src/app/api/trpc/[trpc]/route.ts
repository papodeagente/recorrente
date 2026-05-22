import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { logger } from "@/server/lib/logger";
import { createContext } from "@/server/trpc/init";
import { appRouter } from "@/server/trpc/routers";

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: (opts) => createContext(opts),
    onError({ error, path, type }) {
      // Sempre logar (inclusive prod). Erros 401/403/404 viram info; resto error.
      const code = error.code ?? "INTERNAL_SERVER_ERROR";
      const isExpected = ["UNAUTHORIZED", "FORBIDDEN", "NOT_FOUND", "BAD_REQUEST", "CONFLICT"].includes(code);
      const log = isExpected ? logger.info : logger.error;
      log.call(
        logger,
        {
          path: path ?? "<unknown>",
          type,
          code,
          message: error.message,
          cause: error.cause instanceof Error ? error.cause.message : undefined,
          stack: !isExpected ? error.stack?.split("\n").slice(0, 8).join("\n") : undefined,
        },
        "[trpc] error",
      );
    },
  });

export { handler as GET, handler as POST };
