import http from "http";
import type { IncomingMessage, ServerResponse } from "http";
import indicesHandler from "./api/indices/index";
import indexSymbolHandler from "./api/indices/[symbol]";
import stocksHandler from "./api/stocks/index";
import stockSymbolHandler from "./api/stocks/[symbol]";

const PORT = Number(process.env.PORT) || 3000;

function createReq(url: string, method: string, pathname: string, symbol?: string): Parameters<typeof indicesHandler>[0] {
  const query: Record<string, string> = {};
  if (symbol) query.symbol = symbol;
  return {
    method,
    url,
    query,
    headers: {},
    body: undefined,
  } as Parameters<typeof indicesHandler>[0];
}

function createRes(res: ServerResponse): Parameters<typeof indicesHandler>[1] {
  return {
    setHeader(name: string, value: string | number | string[]) {
      res.setHeader(name, value);
      return this;
    },
    status(code: number) {
      res.statusCode = code;
      return this;
    },
    json(body: unknown) {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(body));
      return this;
    },
    end(body?: string) {
      if (body) res.end(body);
      else res.end();
      return this;
    },
  } as Parameters<typeof indicesHandler>[1];
}

const server = http.createServer(async (req: IncomingMessage, res: ServerResponse) => {
  const url = req.url ?? "/";
  const method = req.method ?? "GET";
  const pathname = url.split("?")[0];

  const vercelReq = createReq(url, method, pathname);
  const vercelRes = createRes(res);

  try {
    if (pathname === "/indices" && method === "GET") {
      return await indicesHandler(vercelReq, vercelRes);
    }
    const indexSymbolMatch = pathname.match(/^\/indices\/([^/]+)$/);
    if (indexSymbolMatch && method === "GET") {
      (vercelReq.query as Record<string, string>).symbol = decodeURIComponent(indexSymbolMatch[1]);
      return await indexSymbolHandler(vercelReq, vercelRes);
    }
    if (pathname === "/stocks" && method === "GET") {
      return await stocksHandler(vercelReq, vercelRes);
    }
    const stockSymbolMatch = pathname.match(/^\/stocks\/([^/]+)$/);
    if (stockSymbolMatch && method === "GET") {
      (vercelReq.query as Record<string, string>).symbol = decodeURIComponent(stockSymbolMatch[1]);
      return await stockSymbolHandler(vercelReq, vercelRes);
    }

    res.statusCode = 404;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Not found", path: pathname }));
  } catch (err) {
    console.error(err);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Internal server error" }));
  }
});

server.listen(PORT, () => {
  console.log(`PSX API running at http://localhost:${PORT}`);
  console.log("  GET /indices       - all indices");
  console.log("  GET /indices/:sym  - one index (e.g. /indices/KSE100)");
  console.log("  GET /stocks        - all stocks");
  console.log("  GET /stocks/:sym   - one stock");
});
