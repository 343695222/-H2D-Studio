const isFirefox =
  typeof browser !== "undefined" &&
  typeof browser.runtime !== "undefined" &&
  typeof (browser.runtime as unknown as Record<string, unknown>).getBrowserInfo === "function";
const api = typeof browser !== "undefined" ? browser : chrome;

api.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;

  // Check for unsupported pages (chrome://, file:// without permission, etc.)
  const url = tab.url || "";
  if (
    url.startsWith("chrome://") ||
    url.startsWith("chrome-extension://") ||
    url.startsWith("about:") ||
    url.startsWith("moz-extension://")
  ) {
    // Can't inject into browser internal pages
    return;
  }

  if (url.startsWith("file://")) {
    // chrome.extension.isAllowedFileSchemeAccess is Chrome-only
    if (!isFirefox) {
      const hasFileAccess = await chrome.extension.isAllowedFileSchemeAccess();
      if (!hasFileAccess) {
        await api.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            alert(
              "H2D Capture: To use on local files, enable \"Allow access to file URLs\" in extension settings.\n\n" +
              "Go to chrome://extensions → H2D Capture → Details → toggle \"Allow access to file URLs\"",
            );
          },
        }).catch(() => {
          // Even the alert might fail — nothing we can do
        });
        return;
      }
    }
  }

  try {
    // Inject the CORS-bypass bridge into the ISOLATED world first,
    // so the content script can relay fetch requests from MAIN world.
    // ISOLATED is the default world — omitting `world` works on both browsers.
    await api.scripting.executeScript({
      target: { tabId: tab.id },
      func: installCorsBridge,
    });

    if (isFirefox) {
      // Firefox: inject injector.js (ISOLATED world) which creates <script>
      // tags to load capture.js + toolbar.js into MAIN world.
      await api.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["injector.js"],
      });
    } else {
      // Chrome: direct MAIN world injection
      await api.scripting.executeScript({
        target: { tabId: tab.id },
        world: "MAIN" as chrome.scripting.ExecutionWorld,
        files: ["capture.js"],
      });

      await api.scripting.executeScript({
        target: { tabId: tab.id },
        world: "MAIN" as chrome.scripting.ExecutionWorld,
        files: ["toolbar.js"],
      });
    }
  } catch (e) {
    console.error("H2D Capture: cannot inject on this page", e);
  }
});

// ---------------------------------------------------------------------------
// Cross-origin image fetch (background has no CORS limits)
// ---------------------------------------------------------------------------

api.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "figma-capture-fetch-image") {
    fetchImageAsBase64(message.url)
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ error: String(err) }));
    return true;
  }

  // Send capture data to local H2D server
  if (message.type === "h2d-send-to-server") {
    const { endpoint, data } = message;
    fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
      .then(r => r.json())
      .then(result => sendResponse({ success: true, data: result }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // async response
  }

  // Get projects list from local H2D server
  if (message.type === "h2d-get-projects") {
    fetch('http://127.0.0.1:3200/api/projects')
      .then(r => r.json())
      .then(data => sendResponse({ success: true, data }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  // Capture visible tab screenshot
  if (message.type === "h2d-capture-screenshot") {
    (async () => {
      try {
        const dataUrl = await chrome.tabs.captureVisibleTab(
          sender.tab!.windowId,
          { format: 'png' }
        );
        sendResponse({ success: true, data: dataUrl });
      } catch (err) {
        sendResponse({ success: false, error: String(err) });
      }
    })();
    return true;
  }

  return false;
});

/**
 * Fetch an image URL from the background (no CORS restrictions) and return
 * it as a base64 data URL.
 */
async function fetchImageAsBase64(url: string): Promise<{ dataUrl: string } | { error: string }> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return { error: `HTTP ${response.status}` };
    }
    const blob = await response.blob();
    const buffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);
    const dataUrl = `data:${blob.type || "image/png"};base64,${base64}`;
    return { dataUrl };
  } catch (err) {
    return { error: String(err) };
  }
}

// ---------------------------------------------------------------------------
// CORS bridge (injected into ISOLATED world of the content page)
// ---------------------------------------------------------------------------

/**
 * This function runs in the ISOLATED content script world. It listens for
 * custom events from the MAIN world (where capture.js runs) and relays
 * them to the background via chrome.runtime.sendMessage.
 *
 * Flow: MAIN world → CustomEvent → ISOLATED world → chrome.runtime.sendMessage → background fetch
 */
function installCorsBridge(): void {
  if ((window as unknown as Record<string, boolean>).__figmaCorsBridge) return;
  (window as unknown as Record<string, boolean>).__figmaCorsBridge = true;

  // Use whichever API is available (Firefox: browser.*, Chrome: chrome.*)
  const rt = typeof browser !== "undefined" ? browser.runtime : chrome.runtime;

  // CORS image fetch bridge
  window.addEventListener("figma-capture-fetch", async (event) => {
    const detail = (event as CustomEvent).detail;
    if (!detail?.url || !detail?.callbackId) return;

    try {
      const result = await rt.sendMessage({
        type: "figma-capture-fetch-image",
        url: detail.url,
      });

      window.dispatchEvent(
        new CustomEvent("figma-capture-fetch-result", {
          detail: { callbackId: detail.callbackId, result },
        }),
      );
    } catch (err) {
      window.dispatchEvent(
        new CustomEvent("figma-capture-fetch-result", {
          detail: {
            callbackId: detail.callbackId,
            result: { error: String(err) },
          },
        }),
      );
    }
  });

  // H2D Screenshot bridge: MAIN world requests screenshot via ISOLATED world
  window.addEventListener("h2d-screenshot-request", async (event) => {
    const detail = (event as CustomEvent).detail;
    if (!detail?.callbackId) return;

    try {
      const result = await rt.sendMessage({ type: "h2d-capture-screenshot" });
      window.dispatchEvent(
        new CustomEvent("h2d-screenshot-result", {
          detail: { callbackId: detail.callbackId, data: result?.data || "" },
        }),
      );
    } catch (err) {
      window.dispatchEvent(
        new CustomEvent("h2d-screenshot-result", {
          detail: { callbackId: detail.callbackId, data: "" },
        }),
      );
    }
  });

}
