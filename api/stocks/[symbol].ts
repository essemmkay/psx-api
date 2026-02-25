import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getCached, setCached, cacheKeys } from "../../lib/cache";
import { getStocks } from "../../lib/scraper";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    return res.status(204).end();
  }
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET, OPTIONS");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const symbol = (req.query.symbol as string)?.trim();
  if (!symbol) {
    res.setHeader("Content-Type", "application/json");
    return res.status(400).json({ error: "Missing symbol" });
  }

  res.setHeader("Content-Type", "application/json");

  try {
    let stock: Awaited<ReturnType<typeof getStocks>>[number] | undefined = await getCached(cacheKeys.stock(symbol));
    if (!stock) {
      const stocks = await getStocks();
      stock = stocks.find((s) => s.symbol.toUpperCase() === symbol.toUpperCase());
      if (stock) await setCached(cacheKeys.stock(symbol), stock);
    }
    if (!stock) {
      return res.status(404).json({ error: "Stock not found", symbol });
    }
    return res.status(200).json(stock);
  } catch (e) {
    console.error("stock error", e);
    return res.status(503).json({ error: "Failed to fetch stock", message: String(e) });
  }
}
