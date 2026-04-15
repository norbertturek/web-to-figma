// popup.js — Web to Figma v4

function setStatus(msg, type) {
  var el = document.getElementById('status');
  if (!el) return;
  el.textContent = msg;
  el.className = 'status ' + (type || 'info');
}

async function getActiveTab() {
  var tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tabs || !tabs[0] || !tabs[0].id) throw new Error('Brak aktywnej karty');
  return tabs[0];
}

async function ensureContentScript(tabId) {
  try {
    var res = await chrome.tabs.sendMessage(tabId, { action: 'ping' });
    if (res && res.ok) return res;
  } catch (e) {}
  
  await chrome.scripting.executeScript({
    target: { tabId: tabId },
    files: ['content.js']
  });
  await new Promise(function(r) { setTimeout(r, 300); });
  
  try {
    var res = await chrome.tabs.sendMessage(tabId, { action: 'ping' });
    return res;
  } catch (e) {
    return { ok: true };
  }
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch (e) {
    throw new Error('Błąd kopiowania: ' + e.message);
  }
}

function getViewportWidth() {
  var sel = document.getElementById('viewport');
  if (!sel) return null;
  var val = sel.value;
  if (val === 'auto') return null;
  return parseInt(val, 10);
}

async function resizeAndWait(tab, targetWidth) {
  // Get current window
  var win = await chrome.windows.get(tab.windowId);
  
  // Check if maximized
  if (win.state === 'maximized') {
    throw new Error('Okno jest zmaksymalizowane!\n\nAby użyć viewport:\n1. Kliknij przycisk "Restore" okna\n2. Spróbuj ponownie');
  }
  
  // Calculate new window width (add some padding for scrollbar/borders)
  var newWidth = targetWidth + 20;
  
  // Resize
  await chrome.windows.update(tab.windowId, { width: newWidth });
  
  // Wait for resize to take effect
  await new Promise(function(r) { setTimeout(r, 800); });
  
  // Reload the page to ensure layout recalculates
  // Actually, let's just wait longer and force reflow via content script
  await new Promise(function(r) { setTimeout(r, 400); });
}

// Main capture button
document.getElementById('copy').addEventListener('click', async function() {
  var scrollEl = document.getElementById('scrollPage');
  var scrollPage = scrollEl && scrollEl.checked;
  var targetViewport = getViewportWidth();
  
  try {
    setStatus('Przygotowywanie...', 'info');
    
    var tab = await getActiveTab();
    
    // Resize viewport if requested
    if (targetViewport) {
      setStatus('Zmieniam viewport na ' + targetViewport + 'px...', 'info');
      await resizeAndWait(tab, targetViewport);
    }
    
    // Inject content script
    setStatus('Ładuję skrypt...', 'info');
    var pingResult = await ensureContentScript(tab.id);
    
    if (scrollPage) {
      setStatus('Przewijanie strony (ładowanie lazy content)...', 'info');
    } else {
      setStatus('Przechwytywanie elementów...', 'info');
    }
    
    var response = await chrome.tabs.sendMessage(tab.id, { 
      action: 'captureFigma', 
      scrollPage: scrollPage
    });
    
    if (!response || !response.ok) {
      throw new Error(response ? response.error : 'Brak odpowiedzi ze strony');
    }
    
    var figmaTree = response.figmaTree;
    var capturedWidth = response.capturedWidth || 'auto';
    var json = JSON.stringify(figmaTree, null, 2);
    
    await copyToClipboard(json);
    
    // Count elements
    var stats = { frames: 0, texts: 0, svgs: 0, images: 0 };
    function count(node) {
      if (!node) return;
      if (node.type === 'FRAME') stats.frames++;
      if (node.type === 'TEXT') stats.texts++;
      if (node.type === 'SVG') stats.svgs++;
      if (node.type === 'IMAGE') stats.images++;
      if (node.children) node.children.forEach(count);
    }
    count(figmaTree);
    
    setStatus(
      '✓ Skopiowano! (viewport: ' + capturedWidth + 'px)\n' +
      stats.frames + ' frames, ' + stats.texts + ' texts, ' + stats.svgs + ' SVG, ' + stats.images + ' img\n\n' +
      'Teraz:\n' +
      '1. Otwórz Figmę\n' +
      '2. Plugins → Web to Figma Import\n' +
      '3. Wklej JSON i kliknij Import',
      'success'
    );
    
  } catch (err) {
    setStatus('Błąd: ' + (err.message || String(err)), 'error');
  }
});

console.log('[Web to Figma] Popup v4 loaded');
