const TRACKER_SECTIONS = ["overview", "matches", "seasons", "operators", "maps"];

const sectionPaths = {
  overview: "overview",
  matches: "matches",
  seasons: "seasons?gamemode=pvp_ranked&page=1",
  operators: "operators?gamemode=pvp_ranked",
  maps: "maps?gamemode=pvp_ranked"
};

function setResult(value) {
  const el = document.getElementById("result");
  el.textContent = typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

function normalizeApiUrl(value) {
  return String(value || "http://87.99.138.202:3007").trim().replace(/\/+$/, "");
}

function getProfileBaseUrl(url) {
  const match = String(url || "").match(/^(https:\/\/r6\.tracker\.network\/r6siege\/profile\/ubi\/[^/]+)/i);
  if (!match) return null;
  return match[1];
}

function getUbisoftNameFromUrl(url) {
  const match = String(url || "").match(/profile\/ubi\/([^/]+)/i);
  return match ? decodeURIComponent(match[1]) : null;
}

function waitForTabComplete(tabId) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error("Timeout esperando que Tracker cargue la página."));
    }, 45000);

    function listener(updatedTabId, changeInfo) {
      if (updatedTabId === tabId && changeInfo.status === "complete") {
        clearTimeout(timeout);
        chrome.tabs.onUpdated.removeListener(listener);
        setTimeout(resolve, 3500);
      }
    }

    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function getActiveTrackerTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) throw new Error("No encontré la pestaña activa.");
  if (!String(tab.url || "").includes("r6.tracker.network/r6siege/profile/ubi/")) {
    throw new Error("Abre primero un perfil de R6 Tracker.");
  }
  return tab;
}

function captureTab(tabId) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, { type: "R6_CAPTURE_PAGE" }, (response) => {
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
      if (!response || !response.ok) return reject(new Error(response?.error || "Captura fallida."));
      resolve(response.data);
    });
  });
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

async function syncCurrentPage() {
  const discordId = document.getElementById("discordId").value.trim();
  const apiUrl = normalizeApiUrl(document.getElementById("apiUrl").value);
  const apiKey = document.getElementById("apiKey").value.trim();
  if (!discordId) throw new Error("Escribe tu Discord ID.");

  const tab = await getActiveTrackerTab();
  const data = await captureTab(tab.id);

  return postJson(`${apiUrl}/api/snapshot`, apiKey, {
    discordId,
    ...data
  });
}

async function syncFullProfile() {
  const discordId = document.getElementById("discordId").value.trim();
  const apiUrl = normalizeApiUrl(document.getElementById("apiUrl").value);
  const apiKey = document.getElementById("apiKey").value.trim();
  if (!discordId) throw new Error("Escribe tu Discord ID.");

  const tab = await getActiveTrackerTab();
  const baseUrl = getProfileBaseUrl(tab.url);
  if (!baseUrl) throw new Error("No pude detectar la URL base del perfil.");

  const ubisoftName = getUbisoftNameFromUrl(tab.url);
  const sections = {};

  for (const section of TRACKER_SECTIONS) {
    const sectionUrl = `${baseUrl}/${sectionPaths[section]}`;
    setResult(`Abriendo ${section}...\n${sectionUrl}`);

    await chrome.tabs.update(tab.id, { url: sectionUrl });
    await waitForTabComplete(tab.id);

    setResult(`Capturando ${section}...`);
    const captured = await captureTab(tab.id);
    sections[section] = captured;
  }

  setResult("Enviando paquete completo al servidor...");

  return postJson(`${apiUrl}/api/snapshot-bundle`, apiKey, {
    discordId,
    ubisoftName,
    trackerUrl: `${baseUrl}/overview`,
    platform: "ubi",
    capturedAt: new Date().toISOString(),
    sections
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  const saved = await chrome.storage.local.get(["discordId", "apiUrl", "apiKey"]);
  if (saved.discordId) document.getElementById("discordId").value = saved.discordId;
  if (saved.apiUrl) document.getElementById("apiUrl").value = saved.apiUrl;
  else document.getElementById("apiUrl").value = "http://87.99.138.202:3007";
  if (saved.apiKey) document.getElementById("apiKey").value = saved.apiKey;
});

async function saveSettings() {
  await chrome.storage.local.set({
    discordId: document.getElementById("discordId").value.trim(),
    apiUrl: normalizeApiUrl(document.getElementById("apiUrl").value),
    apiKey: document.getElementById("apiKey").value.trim()
  });
}

document.getElementById("syncCurrent").onclick = async () => {
  try {
    await saveSettings();
    setResult("Procesando página actual...");
    const response = await syncCurrentPage();
    setResult(response);
  } catch (error) {
    setResult(`Error: ${error.message}`);
  }
};

document.getElementById("syncAll").onclick = async () => {
  try {
    await saveSettings();
    setResult("Iniciando sincronización completa...");
    const response = await syncFullProfile();
    setResult(response);
  } catch (error) {
    setResult(`Error: ${error.message}`);
  }
};
