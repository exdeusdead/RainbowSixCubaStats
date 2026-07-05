const DEFAULT_API_URL = "http://87.99.138.202:3007";
const TRACKER_SECTIONS = ["overview", "matches", "seasons", "operators", "maps"];
const SECTION_PATHS = {
  overview: "overview",
  matches: "matches",
  seasons: "seasons?gamemode=pvp_ranked&page=1",
  operators: "operators?gamemode=pvp_ranked",
  maps: "maps?gamemode=pvp_ranked"
};

function detectSectionFromUrl(url) {
  const clean = String(url || "").toLowerCase();
  if (clean.includes("/operators")) return "operators";
  if (clean.includes("/seasons")) return "seasons";
  if (clean.includes("/matches")) return "matches";
  if (clean.includes("/maps")) return "maps";
  if (clean.includes("/trends")) return "trends";
  if (clean.includes("/encounters")) return "encounters";
  return "overview";
}

function extractUbisoftNameFromUrl(url) {
  const match = String(url || "").match(/profile\/ubi\/([^/?#]+)/i);
  return match ? decodeURIComponent(match[1]) : null;
}

function getProfileBaseUrl(url) {
  const match = String(url || "").match(/^(https:\/\/r6\.tracker\.network\/r6siege\/profile\/ubi\/[^/?#]+)/i);
  return match ? match[1] : null;
}

function getQueryParam(name) {
  try {
    return new URL(window.location.href).searchParams.get(name);
  } catch {
    return null;
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function captureCurrentPage() {
  const rawText = (document.body && document.body.innerText ? document.body.innerText : "").slice(0, 160000);
  const trackerUrl = window.location.href;
  const section = detectSectionFromUrl(trackerUrl);
  const ubisoftName = extractUbisoftNameFromUrl(trackerUrl);

  return {
    section,
    ubisoftName,
    trackerUrl,
    capturedAt: new Date().toISOString(),
    rawText
  };
}

function showR6CubaBanner(message, isError = false) {
  const old = document.getElementById("r6cuba-sync-banner");
  if (old) old.remove();

  const div = document.createElement("div");
  div.id = "r6cuba-sync-banner";
  div.textContent = message;
  div.style.position = "fixed";
  div.style.top = "12px";
  div.style.right = "12px";
  div.style.zIndex = "999999";
  div.style.maxWidth = "420px";
  div.style.padding = "12px 14px";
  div.style.borderRadius = "10px";
  div.style.background = isError ? "#b00020" : "#0078d4";
  div.style.color = "white";
  div.style.fontFamily = "Arial, sans-serif";
  div.style.fontSize = "14px";
  div.style.boxShadow = "0 4px 18px rgba(0,0,0,.35)";
  document.documentElement.appendChild(div);
}

async function postJson(url, apiKey, body) {
  const headers = { "Content-Type": "application/json" };
  if (apiKey) headers["x-api-key"] = apiKey;

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

async function startAutoSyncFromDiscordLink() {
  const discordId = getQueryParam("r6cubaSync") || getQueryParam("r6sync");
  if (!discordId) return false;

  const baseUrl = getProfileBaseUrl(window.location.href);
  const ubisoftName = extractUbisoftNameFromUrl(window.location.href);
  if (!baseUrl || !ubisoftName) return false;

  const saved = await chrome.storage.local.get(["apiUrl", "apiKey"]);
  const apiUrl = (getQueryParam("apiUrl") || saved.apiUrl || DEFAULT_API_URL).replace(/\/+$/, "");
  const apiKey = saved.apiKey || "";

  const state = {
    active: true,
    source: "discord-link",
    discordId: String(discordId),
    ubisoftName,
    baseUrl,
    apiUrl,
    apiKey,
    sections: {},
    startedAt: new Date().toISOString()
  };

  await chrome.storage.local.set({ r6cubaAutoSync: state, discordId: String(discordId), apiUrl });
  showR6CubaBanner(`Rainbow Six CUBA: sincronización iniciada para ${ubisoftName}. No cierres esta pestaña.`);
  return true;
}

async function processAutoSyncIfNeeded() {
  const saved = await chrome.storage.local.get(["r6cubaAutoSync"]);
  const state = saved.r6cubaAutoSync;
  if (!state || !state.active) return;

  const currentBase = getProfileBaseUrl(window.location.href);
  if (!currentBase || currentBase !== state.baseUrl) return;

  await sleep(3500);

  const captured = captureCurrentPage();
  const section = captured.section;

  if (!TRACKER_SECTIONS.includes(section)) {
    window.location.href = `${state.baseUrl}/${SECTION_PATHS.overview}`;
    return;
  }

  state.sections = state.sections || {};
  state.sections[section] = captured;
  await chrome.storage.local.set({ r6cubaAutoSync: state });

  const missing = TRACKER_SECTIONS.find(item => !state.sections[item]);
  if (missing) {
    showR6CubaBanner(`Rainbow Six CUBA: capturado ${section}. Abriendo ${missing}...`);
    await sleep(1000);
    window.location.href = `${state.baseUrl}/${SECTION_PATHS[missing]}`;
    return;
  }

  showR6CubaBanner("Rainbow Six CUBA: enviando perfil completo al servidor...");

  try {
    const response = await postJson(`${state.apiUrl}/api/snapshot-bundle`, state.apiKey, {
      discordId: state.discordId,
      ubisoftName: state.ubisoftName,
      trackerUrl: `${state.baseUrl}/overview`,
      platform: "ubi",
      capturedAt: new Date().toISOString(),
      sections: state.sections
    });

    await chrome.storage.local.remove("r6cubaAutoSync");
    showR6CubaBanner(`Rainbow Six CUBA: sync completado ✅ (${response.savedSections?.join(", ") || "perfil"})`);
  } catch (error) {
    state.active = false;
    state.lastError = error.message;
    await chrome.storage.local.set({ r6cubaAutoSync: state });
    showR6CubaBanner(`Rainbow Six CUBA: error de sync ❌ ${error.message}`, true);
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== "R6_CAPTURE_PAGE") return;

  try {
    sendResponse({ ok: true, data: captureCurrentPage() });
  } catch (error) {
    sendResponse({ ok: false, error: error.message });
  }

  return true;
});

(async () => {
  try {
    await startAutoSyncFromDiscordLink();
    await processAutoSyncIfNeeded();
  } catch (error) {
    showR6CubaBanner(`Rainbow Six CUBA: error inicializando sync ❌ ${error.message}`, true);
  }
})();
