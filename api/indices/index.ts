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

  res.setHeader("Content-Type", "application/json");

  try {
    let data = await getCached<{ indices: Awaited<ReturnType<typeof getIndices>> }>(cacheKeys.indices());
    if (!data) {
      const indices = await getIndices();
      data = { indices };
      await setCached(cacheKeys.indices(), data);
    }
    return res.status(200).json(data);
  } catch (e) {
    console.error("indices error", e);
    return res.status(503).json({ error: "Failed to fetch indices", message: String(e) });
  }
}
