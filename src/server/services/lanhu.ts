import https from "https";
import http from "http";

// ---- Lanhu API Types ----

interface LanhuPage {
  id: string;
  name: string;
  description?: string;
}

interface LanhuAIAnalysis {
  summary?: string;
  components?: string[];
  interactions?: string[];
  notes?: string;
}

// ---- Configuration ----

function getConfig() {
  const token = process.env.LANHU_TOKEN;
  const baseUrl = process.env.LANHU_BASE_URL || "https://api.lanhu.com";
  if (!token) return null;
  return { token, baseUrl };
}

// ---- HTTP Helper ----

function fetchJSON<T>(url: string, token: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const mod = parsed.protocol === "https:" ? https : http;
    const req = mod.get(
      url,
      { headers: { Authorization: `Bearer ${token}` } },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(data));
            } catch {
              reject(new Error(`Failed to parse JSON from ${url}`));
            }
          } else {
            reject(new Error(`Lanhu API ${res.statusCode}: ${data.slice(0, 200)}`));
          }
        });
      }
    );
    req.on("error", reject);
    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error(`Request to ${url} timed out`));
    });
  });
}

// ---- API Methods ----

export async function isLanhuAvailable(): Promise<boolean> {
  return getConfig() !== null;
}

export async function fetchPages(fileId: string): Promise<LanhuPage[]> {
  const config = getConfig();
  if (!config) throw new Error("Lanhu token not configured");

  return fetchJSON<LanhuPage[]>(
    `${config.baseUrl}/api/v1/files/${fileId}/pages`,
    config.token
  );
}

export async function fetchAIAnalysis(
  fileId: string,
  pageId: string
): Promise<LanhuAIAnalysis> {
  const config = getConfig();
  if (!config) throw new Error("Lanhu token not configured");

  return fetchJSON<LanhuAIAnalysis>(
    `${config.baseUrl}/api/v1/ai/analyze?page_id=${pageId}&file_id=${fileId}`,
    config.token
  );
}
