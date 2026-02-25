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

  res.setHeader("Content-Type", "application/json");

  try {
    let data = await getCached<{ stocks: Awaited<ReturnType<typeof getStocks>> }>(cacheKeys.stocks());
    if (!data) {
      const stocks = await getStocks();
      data = { stocks };
      await setCached(cacheKeys.stocks(), data);
    }
    return res.status(200).json(data);
  } catch (e) {
    console.error("stocks error", e);
    return res.status(503).json({ error: "Failed to fetch stocks", message: String(e) });
  }
}
