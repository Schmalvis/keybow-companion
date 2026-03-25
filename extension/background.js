let port = null;

function connectToHost() {
  port = chrome.runtime.connectNative('com.keybow.companion');

  port.onMessage.addListener(async (message) => {
    if (message.action === 'focusOrOpen' && typeof message.url === 'string') {
      if (!message.url.startsWith('https://')) {
        port.postMessage({ success: false, error: 'Only https:// URLs allowed' });
        return;
      }
      try {
        const result = await focusOrOpenTab(message.url);
        port.postMessage(result);
      } catch (err) {
        port.postMessage({ success: false, error: err.message });
      }
    }
  });

  port.onDisconnect.addListener(() => {
    port = null;
    setTimeout(connectToHost, 3000);
  });
}

async function focusOrOpenTab(targetUrl) {
  const url = new URL(targetUrl);
  const tabs = await chrome.tabs.query({});
  const match = tabs.find((tab) => {
    try {
      const tabUrl = new URL(tab.url);
      return tabUrl.origin === url.origin &&
        tabUrl.pathname.startsWith(url.pathname === '/' ? '/' : url.pathname);
    } catch { return false; }
  });

  if (match) {
    await chrome.tabs.update(match.id, { active: true });
    await chrome.windows.update(match.windowId, { focused: true });
    return { success: true, action: 'focused', tabId: match.id };
  } else {
    const tab = await chrome.tabs.create({ url: targetUrl });
    return { success: true, action: 'opened', tabId: tab.id };
  }
}

connectToHost();
