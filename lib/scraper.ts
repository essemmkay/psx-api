import * as cheerio from "cheerio";
import type { IndexOHLCV, StockOHLCV } from "./types";

const BASE_URL = "https://dps.psx.com.pk";
const INDICES_URL = `${BASE_URL}/indices`;
/** Official PSX page for stock OHLCV: https://dps.psx.com.pk/historical */
const HISTORICAL_URL = `${BASE_URL}/historical`;
/** Fallback: index constituent pages have SYMBOL | NAME | LDCP | CURRENT | CHANGE | CHANGE (%) | ... | VOLUME */
const INDEX_CONSTITUENT_SLUGS = ["KSE100", "KSE30", "ALLSHR"];

function parseNum(s: string): number | null {
  const cleaned = s.replace(/,/g, "").trim();
  if (!cleaned || cleaned === "N/A") return null;
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

function parsePercent(s: string): number | null {
  const cleaned = s.replace(/,/g, "").replace(/%/g, "").trim();
  if (!cleaned || cleaned === "N/A") return null;
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

export async function getIndices(): Promise<IndexOHLCV[]> {
  const res = await fetch(INDICES_URL, {
    headers: { "User-Agent": "PSX-API/1.0" },
  });
  if (!res.ok) throw new Error(`Indices fetch failed: ${res.status}`);
  const html = await res.text();
  const $ = cheerio.load(html);

  const out: IndexOHLCV[] = [];
  const tables = $("table");
  for (let i = 0; i < tables.length; i++) {
    const table = tables.eq(i);
    const headers = table.find("thead th").map((_, el) => $(el).text().trim()).get();
    const hasIndex = headers.some((h) => /index/i.test(h));
    const hasCurrent = headers.some((h) => /current/i.test(h));
    if (!hasIndex || !hasCurrent) continue;

    const colIndex = headers.findIndex((h) => /index/i.test(h));
    const colHigh = headers.findIndex((h) => /^high$/i.test(h));
    const colLow = headers.findIndex((h) => /^low$/i.test(h));
    const colCurrent = headers.findIndex((h) => /current/i.test(h));
    const colChange = headers.findIndex((h) => /change/i.test(h) && !/%/i.test(h));
    const colChangePct = headers.findIndex((h) => /%?\s*change/i.test(h) || /change\s*%?/i.test(h));
    if (colIndex < 0 || colCurrent < 0) continue;

    table.find("tbody tr").each((_, row) => {
      const cells = $(row).find("td");
      if (cells.length === 0) return;
      const symbolCell = cells.eq(colIndex);
      let symbol = symbolCell.find("a").text().trim() || symbolCell.text().trim();
      symbol = symbol.split(/\s*\(/)[0].trim();
      if (!symbol) return;

      const high = colHigh >= 0 ? parseNum(cells.eq(colHigh).text()) : null;
      const low = colLow >= 0 ? parseNum(cells.eq(colLow).text()) : null;
      const close = parseNum(cells.eq(colCurrent).text());
      const change = colChange >= 0 ? parseNum(cells.eq(colChange).text()) : null;
      const changePercent = colChangePct >= 0 ? parsePercent(cells.eq(colChangePct).text()) : null;

      if (close === null) return;
      // Open not on indices page: use previous close (close - change) as opening reference
      const open =
        change !== null && Number.isFinite(close - change) ? close - change : null;
      out.push({
        symbol,
        high: high ?? close,
        low: low ?? close,
        close,
        change: change ?? null,
        changePercent: changePercent ?? null,
        open,
        volume: null,
      });
    });
    if (out.length > 0) break;
  }

  // Enrich volume from index constituent pages (KSE100, KSE30, ALLSHR have constituent tables with VOLUME)
  const volumeBySymbol = await getConstituentVolumesByIndex();
  for (const row of out) {
    const total = volumeBySymbol.get(row.symbol);
    if (total != null) row.volume = total;
  }

  return out;
}

/**
 * Fetch index constituent pages and return total traded volume per index (sum of constituent volumes).
 * Only indices with a constituent page (KSE100, KSE30, ALLSHR) will have an entry.
 */
async function getConstituentVolumesByIndex(): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  const headers = { "User-Agent": "PSX-API/1.0" };

  for (const slug of INDEX_CONSTITUENT_SLUGS) {
    try {
      const res = await fetch(`${BASE_URL}/indices/${encodeURIComponent(slug)}`, {
        headers,
      });
      if (!res.ok) continue;
      const html = await res.text();
      const $ = cheerio.load(html);
      const tables = $("table");
      let totalVolume = 0;
      for (let i = 0; i < tables.length; i++) {
        const table = tables.eq(i);
        const headerTexts = table
          .find("thead th")
          .map((_, el) => $(el).text().trim().toUpperCase())
          .get();
        const colVolume = headerTexts.findIndex((h) => /^VOLUME$/i.test(h));
        if (colVolume < 0) continue;
        table.find("tbody tr").each((_, row) => {
          const cells = $(row).find("td");
          if (cells.length <= colVolume) return;
          const v = parseNum(cells.eq(colVolume).text());
          if (v != null) totalVolume += v;
        });
        if (totalVolume > 0) break;
      }
      if (totalVolume > 0) result.set(slug, totalVolume);
    } catch {
      // skip this index
    }
  }
  return result;
}

/**
 * Try to parse an OHLCV table from the historical page HTML.
 * Looks for table with columns: Symbol/Script, Open, High, Low, Close, Volume (or similar).
 */
function parseHistoricalTable($: cheerio.CheerioAPI): StockOHLCV[] {
  const out: StockOHLCV[] = [];
  const tables = $("table");
  for (let i = 0; i < tables.length; i++) {
    const table = tables.eq(i);
    const headers = table.find("thead th").map((_, el) => $(el).text().trim().toUpperCase()).get();
    const colSymbol = headers.findIndex((h) => /^SYMBOL$|^SCRIPT$|^SCRIP$/i.test(h));
    const colOpen = headers.findIndex((h) => /^OPEN$/i.test(h));
    const colHigh = headers.findIndex((h) => /^HIGH$/i.test(h));
    const colLow = headers.findIndex((h) => /^LOW$/i.test(h));
    const colClose = headers.findIndex((h) => /^CLOSE$|^CURRENT$/i.test(h));
    const colVolume = headers.findIndex((h) => /^VOLUME$/i.test(h));
    if (colClose < 0) continue;
    const hasOhlc = colOpen >= 0 || colHigh >= 0 || colLow >= 0;
    if (!hasOhlc && colClose < 0) continue;

    table.find("tbody tr").each((_, row) => {
      const cells = $(row).find("td");
      if (cells.length <= colClose) return;
      const symIdx = colSymbol >= 0 ? colSymbol : 0;
      const symbolCell = cells.eq(symIdx);
      const link = symbolCell.find('a[href*="/company/"]').attr("href");
      let symbol = "";
      if (link) {
        const m = link.match(/\/company\/([^/?#]+)/i);
        symbol = m ? m[1].trim() : symbolCell.text().trim().split(/\s*\(/)[0].trim();
      } else {
        symbol = symbolCell.text().trim().split(/\s*\(/)[0].trim();
      }
      if (!symbol || symbol.length > 20) return;

      const close = parseNum(cells.eq(colClose).text());
      if (close === null) return;

      out.push({
        symbol,
        open: colOpen >= 0 ? parseNum(cells.eq(colOpen).text()) : null,
        high: colHigh >= 0 ? parseNum(cells.eq(colHigh).text()) : null,
        low: colLow >= 0 ? parseNum(cells.eq(colLow).text()) : null,
        close,
        volume: colVolume >= 0 ? parseNum(cells.eq(colVolume).text()) : null,
      });
    });
    if (out.length > 0) return out;
  }
  return out;
}

/**
 * Parse index constituent page (e.g. /indices/KSE100) table:
 * SYMBOL | NAME | LDCP | CURRENT | CHANGE | CHANGE (%) | ... | VOLUME
 */
function parseConstituentTable($: cheerio.CheerioAPI): StockOHLCV[] {
  const out: StockOHLCV[] = [];
  const tables = $("table");
  for (let i = 0; i < tables.length; i++) {
    const table = tables.eq(i);
    const headers = table.find("thead th").map((_, el) => $(el).text().trim().toUpperCase()).get();
    const colSymbol = headers.findIndex((h) => /^SYMBOL$|^SCRIPT$/i.test(h));
    const colLdcp = headers.findIndex((h) => /^LDCP$/i.test(h));
    const colCurrent = headers.findIndex((h) => /^CURRENT$/i.test(h));
    const colChange = headers.findIndex((h) => /^CHANGE$/i.test(h) && !/%/.test(h));
    const colChangePct = headers.findIndex((h) => /CHANGE/i.test(h) && /%/.test(h));
    const colVolume = headers.findIndex((h) => /^VOLUME$/i.test(h));
    if (colSymbol < 0 || colCurrent < 0) continue;

    table.find("tbody tr").each((_, row) => {
      const cells = $(row).find("td");
      if (cells.length <= colCurrent) return;
      const symbolCell = cells.eq(colSymbol);
      const link = symbolCell.find('a[href*="/company/"]').attr("href");
      let symbol = "";
      if (link) {
        const m = link.match(/\/company\/([^/?#]+)/i);
        symbol = m ? m[1].trim() : symbolCell.text().trim().split(/\s*\(/)[0].trim();
      } else {
        symbol = symbolCell.text().trim().split(/\s*\(/)[0].trim();
      }
      if (!symbol || symbol.length > 20) return;

      const close = parseNum(cells.eq(colCurrent).text());
      if (close === null) return;

      const open = colLdcp >= 0 ? parseNum(cells.eq(colLdcp).text()) : null;
      const change = colChange >= 0 ? parseNum(cells.eq(colChange).text()) : null;
      const changePercent = colChangePct >= 0 ? parsePercent(cells.eq(colChangePct).text()) : null;
      const volume = colVolume >= 0 ? parseNum(cells.eq(colVolume).text()) : null;
      // Constituent table has no High/Low columns; only historical page has real high/low
      out.push({
        symbol,
        open,
        high: null,
        low: null,
        close,
        change: change ?? null,
        changePercent: changePercent ?? null,
        volume: volume ?? null,
      });
    });
    if (out.length > 0) return out;
  }
  return out;
}

/** Format date as YYYY-MM-DD for PSX historical POST (required by the server). */
function formatDateForHistoricalPost(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export async function getStocks(): Promise<StockOHLCV[]> {
  const headers = {
    "User-Agent": "PSX-API/1.0",
    "Content-Type": "application/x-www-form-urlencoded",
    Referer: `${BASE_URL}/historical`,
    Origin: BASE_URL,
  };

  // Primary source: historical page returns OHLCV table (including real High/Low) via POST
  for (let daysBack = 0; daysBack <= 7; daysBack++) {
    try {
      const d = new Date();
      d.setDate(d.getDate() - daysBack);
      const dateStr = formatDateForHistoricalPost(d);
      const res = await fetch(HISTORICAL_URL, {
        method: "POST",
        headers,
        body: `date=${encodeURIComponent(dateStr)}`,
      });
      if (res.ok) {
        const html = await res.text();
        const $ = cheerio.load(html);
        const fromHistorical = parseHistoricalTable($);
        if (fromHistorical.length > 0) return fromHistorical;
      }
    } catch {
      // try next day
    }
  }

  // Fallback: index constituent pages (KSE100, KSE30, ALLSHR)
  const seen = new Set<string>();
  const merged: StockOHLCV[] = [];
  for (const slug of INDEX_CONSTITUENT_SLUGS) {
    try {
      const res = await fetch(`${BASE_URL}/indices/${encodeURIComponent(slug)}`, { headers });
      if (!res.ok) continue;
      const html = await res.text();
      const $ = cheerio.load(html);
      const rows = parseConstituentTable($);
      for (const row of rows) {
        const key = row.symbol.toUpperCase();
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(row);
      }
    } catch {
      // skip this index page
    }
  }

  return merged;
}
