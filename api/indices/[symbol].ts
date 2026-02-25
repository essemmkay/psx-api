import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getCached, setCached, cacheKeys } from "../../lib/cache";
import { getIndices } from "../../lib/scraper";

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
    let index: Awaited<ReturnType<typeof getIndices>>[number] | undefined = await getCached(cacheKeys.index(symbol));
    if (!index) {
      const indices = await getIndices();
      index = indices.find((i) => i.symbol.toUpperCase() === symbol.toUpperCase());
      if (index) await setCached(cacheKeys.index(symbol), index);
    }
    if (!index) {
      return res.status(404).json({ error: "Index not found", symbol });
    }
    return res.status(200).json(index);
  } catch (e) {
    console.error("index error", e);
    return res.status(503).json({ error: "Failed to fetch index", message: String(e) });
  }
}
