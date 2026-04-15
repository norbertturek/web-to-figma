// background.js — Web to Figma

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'attachDebugger') {
    chrome.debugger.attach({ tabId: msg.tabId }, '1.3', () => {
      if (chrome.runtime.lastError) {
        sendResponse({ attached: false, error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ attached: true });
      }
    });
    return true;
  }
  
  if (msg.action === 'detachDebugger') {
    if (!sender.tab) {
      chrome.debugger.detach({ tabId: msg.tabId }, () => {
        sendResponse({ detached: true });
      });
    } else {
      chrome.debugger.detach({ tabId: sender.tab.id }, () => {
        sendResponse({ detached: true });
      });
    }
    return true;
  }
});

chrome.debugger.onDetach.addListener((source, reason) => {
  // Jeśli użytkownik zamknie pasek debuggera iksem
  chrome.tabs.sendMessage(source.tabId, { action: 'debuggerDetached' }).catch(() => {});
});
