/**
 * Web to Figma v6 - Full featured capture from browser
 * - SVG with colors
 * - Text in buttons (mixed content)
 * - Font mapping
 * - Border-top handling
 * - Flexbox centering
 * - Heuristics: semantic wrappers (header/section/…)+child autoLayout, block stacks, grid auto-fill, layoutGrow
 */

const SKIP_TAGS = new Set(["script", "style", "noscript", "template", "head", "meta", "link", "iframe"]);

function parseColor(val) {
  if (!val || val === 'transparent' || val === 'rgba(0, 0, 0, 0)') return null;
  const rgb = val.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/);
  if (rgb) {
    return { 
      r: parseFloat(rgb[1]) / 255, 
      g: parseFloat(rgb[2]) / 255, 
      b: parseFloat(rgb[3]) / 255, 
      a: rgb[4] !== undefined ? parseFloat(rgb[4]) : 1 
    };
  }
  const hex = val.match(/^#([a-f0-9]{2})([a-f0-9]{2})([a-f0-9]{2})$/i);
  if (hex) {
    return { 
      r: parseInt(hex[1], 16) / 255, 
      g: parseInt(hex[2], 16) / 255, 
      b: parseInt(hex[3], 16) / 255, 
      a: 1 
    };
  }
  return null;
}

function getFontWeight(weight) {
  const w = parseInt(weight) || 400;
  if (w >= 700) return 'Bold';
  if (w >= 500) return 'Medium';
  return 'Regular';
}

function mapFontFamily(family) {
  const f = (family || 'Inter').split(',')[0].replace(/['"]/g, '').trim();
  if (f.includes('system') || f.includes('apple') || f === 'BlinkMacSystemFont' || f === 'Segoe UI') {
    return 'Inter';
  }
  return f;
}

/** Parse grid-template-columns/rows: repeat(N, ...), or count space-separated tracks; 0 = unknown */
function parseGridTrackCount(cssVal) {
  if (!cssVal || cssVal === 'none') return 0;
  const s = String(cssVal).trim();
  const repeatNum = s.match(/repeat\s*\(\s*(\d+)/i);
  if (repeatNum) return Math.max(1, parseInt(repeatNum[1], 10));
  if (/repeat\s*\(\s*auto-(fill|fit)/i.test(s)) return 0;
  const parts = s.split(/\s+/).filter(Boolean);
  return parts.length > 0 ? Math.max(1, parts.length) : 0;
}

/** When grid-template uses repeat(auto-fill, minmax(...)), estimate column count from width */
function inferGridColumnsAutoFill(cs, rectWidth, childCount) {
  const gtc = String(cs.gridTemplateColumns || '');
  if (!gtc || gtc === 'none' || !/auto-(fill|fit)/i.test(gtc)) return 0;
  const mm = gtc.match(/minmax\s*\(\s*([^,)]+)\s*,/i);
  let minPx = 80;
  if (mm) {
    const v = parseFloat(mm[1]);
    if (!Number.isNaN(v) && v > 0) minPx = Math.min(Math.max(v, 40), Math.max(rectWidth, 40));
  }
  const colGap = parseFloat(cs.columnGap) || parseFloat(cs.gap) || 0;
  const w = Math.max(1, rectWidth);
  const n = Math.max(1, Math.floor((w + colGap) / (minPx + colGap)));
  return Math.min(n, Math.max(1, childCount));
}

const SEMANTIC_WRAP_TAGS = new Set(['header', 'nav', 'main', 'footer', 'section', 'article', 'aside', 'form']);

function isBlockLikeDisplay(display) {
  const d = display || '';
  return d === 'block' || d === 'flow-root' || d === 'list-item' || d === 'inline-block' || d === 'contents';
}

function paddingBoxFromComputed(cs) {
  return {
    paddingTop: Math.round(parseFloat(cs.paddingTop) || 0),
    paddingRight: Math.round(parseFloat(cs.paddingRight) || 0),
    paddingBottom: Math.round(parseFloat(cs.paddingBottom) || 0),
    paddingLeft: Math.round(parseFloat(cs.paddingLeft) || 0)
  };
}

/** Block flow: multiple children aligned in one column (e.g. flex-1 div with h1 + p) */
function inferVerticalStackAutoLayout(children, cs) {
  if (children.length < 2) return null;
  const sorted = [...children].sort((a, b) => (a.y || 0) - (b.y || 0));
  const x0 = sorted[0].x || 0;
  for (let i = 1; i < sorted.length; i++) {
    if (Math.abs((sorted[i].x || 0) - x0) > 8) return null;
  }
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    if ((cur.y || 0) < (prev.y || 0) + (prev.height || 0) - 3) return null;
  }
  const gaps = [];
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    gaps.push(Math.max(0, (cur.y || 0) - (prev.y || 0) - (prev.height || 0)));
  }
  const itemSpacing = gaps.length ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length) : 0;
  let counterAlign = 'MIN';
  if (cs.textAlign === 'center') counterAlign = 'CENTER';
  else if (cs.textAlign === 'right' || cs.textAlign === 'end') counterAlign = 'MAX';
  const pad = paddingBoxFromComputed(cs);
  return {
    layoutMode: 'VERTICAL',
    primaryAxisAlignItems: 'MIN',
    counterAxisAlignItems: counterAlign,
    itemSpacing,
    ...pad
  };
}

/** header/nav/… with one flex/grid child: outer gets VERTICAL + padding so Figma shows layout on wrapper */
function inferSemanticWrapperAutoLayout(tag, cs, children) {
  if (!SEMANTIC_WRAP_TAGS.has(tag) || children.length !== 1) return null;
  const ch = children[0];
  if (!ch || ch.type !== 'FRAME' || !ch.autoLayout) return null;
  return {
    layoutMode: 'VERTICAL',
    primaryAxisAlignItems: 'MIN',
    counterAxisAlignItems: 'MIN',
    itemSpacing: 0,
    ...paddingBoxFromComputed(cs)
  };
}

function hasTailwindLayoutClassHint(el) {
  const cls = el.className;
  if (typeof cls !== 'string' || !cls) return null;
  const c = cls.toLowerCase();
  if (/\bgrid\b/.test(c) || /\binline-grid\b/.test(c)) return 'grid';
  if (/\bflex\b/.test(c) || /\binline-flex\b/.test(c)) return 'flex';
  return null;
}

/** When computed style lost flex (rare) but Tailwind classes are present */
function inferFlexFromTailwindClasses(el) {
  const cls = typeof el.className === 'string' ? el.className.toLowerCase() : '';
  if (!/\bflex\b/.test(cls) && !/\binline-flex\b/.test(cls)) return null;
  const isRow = !/\bflex-col\b/.test(cls);
  let primaryAlign = 'MIN';
  if (/\bjustify-center\b/.test(cls)) primaryAlign = 'CENTER';
  else if (/\bjustify-between\b/.test(cls)) primaryAlign = 'SPACE_BETWEEN';
  else if (/\bjustify-end\b/.test(cls)) primaryAlign = 'MAX';
  let counterAlign = 'MIN';
  if (/\bitems-center\b/.test(cls)) counterAlign = 'CENTER';
  else if (/\bitems-end\b/.test(cls)) counterAlign = 'MAX';
  const cs = getComputedStyle(el);
  const pad = paddingBoxFromComputed(cs);
  const gap = Math.round(parseFloat(cs.gap) || parseFloat(cs.rowGap) || parseFloat(cs.columnGap) || 0);
  const out = {
    layoutMode: isRow ? 'HORIZONTAL' : 'VERTICAL',
    primaryAxisAlignItems: primaryAlign,
    counterAxisAlignItems: counterAlign,
    itemSpacing: gap,
    ...pad
  };
  if (/\bflex-wrap\b/.test(cls) || /\bflex-wrap-reverse\b/.test(cls)) {
    out.layoutWrap = 'WRAP';
  }
  return out;
}

function captureSvg(el, parentRect) {
  const rect = el.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1) return null;
  
  const x = parentRect ? rect.left - parentRect.left : rect.left;
  const y = parentRect ? rect.top - parentRect.top : rect.top;
  
  const cs = getComputedStyle(el);
  const svgColor = cs.color || 'black';
  
  // Clone and process SVG
  const clone = el.cloneNode(true);
  if (!clone.getAttribute('xmlns')) {
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  }
  
  // Inline use references
  clone.querySelectorAll('use').forEach(use => {
    const href = use.getAttribute('href') || use.getAttribute('xlink:href');
    if (href?.startsWith('#')) {
      const ref = document.getElementById(href.slice(1));
      if (ref) use.replaceWith(ref.cloneNode(true));
    }
  });
  
  // Replace currentColor
  let svgHtml = clone.outerHTML.replace(/currentColor/gi, svgColor);
  
  // If no fill attribute, add one
  if (!svgHtml.includes('fill=') && svgColor) {
    svgHtml = svgHtml.replace('<svg', `<svg fill="${svgColor}"`);
  }
  
  return {
    type: 'SVG',
    name: 'icon',
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
    svg: svgHtml,
    color: parseColor(svgColor)
  };
}

function captureImage(el, parentRect) {
  const rect = el.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1) return null;
  
  const x = parentRect ? rect.left - parentRect.left : rect.left;
  const y = parentRect ? rect.top - parentRect.top : rect.top;
  const cs = getComputedStyle(el);
  
  return {
    type: 'IMAGE',
    name: el.alt || 'image',
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
    src: el.src || '',
    cornerRadius: Math.round(parseFloat(cs.borderRadius) || 0)
  };
}

function captureElement(el, parentRect, depth) {
  if (depth > 30) return null;
  
  const tag = el.tagName?.toLowerCase() || '';
  if (SKIP_TAGS.has(tag)) return null;
  
  // Handle SVG
  if (tag === 'svg') {
    return captureSvg(el, parentRect);
  }
  
  // Handle images
  if (tag === 'img') {
    return captureImage(el, parentRect);
  }
  
  const rect = el.getBoundingClientRect();
  if (rect.width < 0.25 && rect.height < 0.25) return null;
  
  const cs = getComputedStyle(el);
  if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) return null;
  
  const x = parentRect ? rect.left - parentRect.left : rect.left + window.scrollX;
  const y = parentRect ? rect.top - parentRect.top : rect.top + window.scrollY;
  
  // Colors
  const bgColor = parseColor(cs.backgroundColor);
  const textColor = parseColor(cs.color);
  const borderRadius = parseFloat(cs.borderRadius) || 0;
  
  // Border - check individual sides
  const borderTopWidth = parseFloat(cs.borderTopWidth) || 0;
  const borderRightWidth = parseFloat(cs.borderRightWidth) || 0;
  const borderBottomWidth = parseFloat(cs.borderBottomWidth) || 0;
  const borderLeftWidth = parseFloat(cs.borderLeftWidth) || 0;
  const borderTopColor = parseColor(cs.borderTopColor);
  
  const borderWidth = Math.max(borderTopWidth, borderRightWidth, borderBottomWidth, borderLeftWidth);
  const isFullBorder = borderTopWidth > 0 && borderRightWidth > 0 && 
                       borderBottomWidth > 0 && borderLeftWidth > 0 &&
                       borderTopWidth === borderRightWidth;
  
  // Font
  const fontSize = parseFloat(cs.fontSize) || 16;
  const fontWeight = getFontWeight(cs.fontWeight);
  const fontFamily = mapFontFamily(cs.fontFamily);
  let textAlign = cs.textAlign;
  const lineHeight = parseFloat(cs.lineHeight) || fontSize * 1.4;
  const letterSpacing = parseFloat(cs.letterSpacing) || 0;
  
  // Detect flexbox centering
  if (cs.display === 'flex' || cs.display === 'inline-flex') {
    if (cs.justifyContent === 'center' || cs.justifyContent === 'space-around') {
      textAlign = 'center';
    }
  }
  const parentCs = el.parentElement ? getComputedStyle(el.parentElement) : null;
  if (parentCs && (parentCs.display === 'flex' || parentCs.display === 'inline-flex')) {
    if (parentCs.justifyContent === 'center' || parentCs.alignItems === 'center') {
      textAlign = 'center';
    }
  }
  
  // Collect children and text
  const children = [];
  let directTextContent = '';
  let hasChildElements = false;
  
  for (const child of el.childNodes) {
    if (child.nodeType === 3) { // Text
      const text = child.textContent.trim();
      if (text) directTextContent += (directTextContent ? ' ' : '') + text;
    } else if (child.nodeType === 1) { // Element
      hasChildElements = true;
      const captured = captureElement(child, rect, depth + 1);
      if (captured) children.push(captured);
    }
  }
  
  // If we have direct text AND child elements, add text as a child node
  if (directTextContent && hasChildElements) {
    // Find actual text position using Range API
    let textRect = null;
    for (const child of el.childNodes) {
      if (child.nodeType === 3 && child.textContent.trim()) {
        const range = document.createRange();
        range.selectNodeContents(child);
        const rects = range.getClientRects();
        if (rects.length > 0) {
          textRect = rects[0];
          break;
        }
      }
    }
    
    let textX = 0, textY = 0, textWidth = rect.width, textHeight = fontSize * 1.5;
    
    if (textRect) {
      textX = textRect.left - rect.left;
      textY = textRect.top - rect.top;
      textWidth = textRect.width;
      textHeight = textRect.height;
    } else if (cs.display === 'flex' && cs.alignItems === 'center') {
      textY = (rect.height - fontSize) / 2;
    }
    
    children.push({
      type: 'TEXT',
      name: directTextContent.slice(0, 30),
      x: Math.max(0, Math.round(textX)),
      y: Math.max(0, Math.round(textY)),
      width: Math.round(textWidth),
      height: Math.round(textHeight),
      characters: directTextContent,
      fontSize: Math.round(fontSize),
      fontFamily,
      fontWeight,
      textAlign: 'center',
      lineHeight: Math.round(lineHeight),
      letterSpacing,
      fills: [{ type: 'SOLID', color: textColor || { r: 1, g: 1, b: 1, a: 1 } }]
    });
  }
  
  const shouldKeepTextOnlyElementAsFrame =
    tag === 'button' ||
    ((bgColor && bgColor.a > 0.01) || borderWidth > 0 || borderRadius > 0);

  // Pure text node (no child elements)
  if (directTextContent && !hasChildElements && !shouldKeepTextOnlyElementAsFrame) {
    return {
      type: 'TEXT',
      name: directTextContent.slice(0, 30),
      x: Math.round(x),
      y: Math.round(y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      characters: directTextContent,
      fontSize: Math.round(fontSize),
      fontFamily,
      fontWeight,
      textAlign,
      lineHeight: Math.round(lineHeight),
      letterSpacing,
      fills: [{ type: 'SOLID', color: textColor || { r: 0, g: 0, b: 0, a: 1 } }]
    };
  }

  if (directTextContent && !hasChildElements && shouldKeepTextOnlyElementAsFrame) {
    children.push({
      type: 'TEXT',
      name: directTextContent.slice(0, 30),
      x: 0,
      y: 0,
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      characters: directTextContent,
      fontSize: Math.round(fontSize),
      fontFamily,
      fontWeight,
      textAlign,
      lineHeight: Math.round(lineHeight),
      letterSpacing,
      fills: [{ type: 'SOLID', color: textColor || { r: 0, g: 0, b: 0, a: 1 } }]
    });
  }
  
  // Frame
  const fills = [];
  if (bgColor && bgColor.a > 0.01) {
    fills.push({ type: 'SOLID', color: bgColor });
  }
  
  // Only add stroke if border is on all sides
  const strokes = [];
  if (borderTopColor && borderWidth > 0 && borderTopColor.a > 0.01 && isFullBorder) {
    strokes.push({ type: 'SOLID', color: borderTopColor });
  }
  
  // If only border-top, add a line element
  if (borderTopWidth > 0 && borderBottomWidth === 0 && borderTopColor && borderTopColor.a > 0.01) {
    children.unshift({
      type: 'FRAME',
      name: 'border-top',
      x: 0,
      y: 0,
      width: Math.round(rect.width),
      height: Math.round(borderTopWidth),
      fills: [{ type: 'SOLID', color: borderTopColor }],
      strokes: [],
      strokeWeight: 0,
      cornerRadius: 0,
      children: []
    });
  }
  
  // Auto-layout: CSS Grid (takes precedence over flex if both were ever set)
  let autoLayout = null;
  if (cs.display === 'grid' || cs.display === 'inline-grid') {
    let colCount = parseGridTrackCount(cs.gridTemplateColumns);
    if (colCount < 1) {
      const inferred = inferGridColumnsAutoFill(cs, rect.width, children.length);
      if (inferred > 0) colCount = inferred;
    }
    if (colCount < 1) colCount = 1;
    let rowCount = parseGridTrackCount(cs.gridTemplateRows);
    const neededRows = Math.max(1, Math.ceil(children.length / colCount));
    if (rowCount < 1) rowCount = neededRows;
    else rowCount = Math.max(rowCount, neededRows);
    const colGap = parseFloat(cs.columnGap) || parseFloat(cs.gap) || 0;
    const rowGap = parseFloat(cs.rowGap) || parseFloat(cs.gap) || 0;
    const paddingTop = parseFloat(cs.paddingTop) || 0;
    const paddingRight = parseFloat(cs.paddingRight) || 0;
    const paddingBottom = parseFloat(cs.paddingBottom) || 0;
    const paddingLeft = parseFloat(cs.paddingLeft) || 0;
    autoLayout = {
      layoutMode: 'GRID',
      gridColumnCount: colCount,
      gridRowCount: rowCount,
      gridColumnGap: Math.round(colGap),
      gridRowGap: Math.round(rowGap),
      paddingTop: Math.round(paddingTop),
      paddingRight: Math.round(paddingRight),
      paddingBottom: Math.round(paddingBottom),
      paddingLeft: Math.round(paddingLeft)
    };
  } else if (cs.display === 'flex' || cs.display === 'inline-flex') {
    const direction = cs.flexDirection || 'row';
    const isHorizontal = direction === 'row' || direction === 'row-reverse';
    
    // Map justify-content to primaryAxisAlignItems
    let primaryAlign = 'MIN';
    if (cs.justifyContent === 'center') primaryAlign = 'CENTER';
    else if (cs.justifyContent === 'flex-end' || cs.justifyContent === 'end') primaryAlign = 'MAX';
    else if (cs.justifyContent === 'space-between') primaryAlign = 'SPACE_BETWEEN';
    else if (cs.justifyContent === 'space-around' || cs.justifyContent === 'space-evenly') primaryAlign = 'SPACE_BETWEEN';
    
    // Map align-items to counterAxisAlignItems
    let counterAlign = 'MIN';
    if (cs.alignItems === 'center') counterAlign = 'CENTER';
    else if (cs.alignItems === 'flex-end' || cs.alignItems === 'end') counterAlign = 'MAX';
    else if (cs.alignItems === 'stretch') counterAlign = 'MIN'; // Figma doesn't have stretch, use MIN
    else if (cs.alignItems === 'baseline') counterAlign = 'MIN';
    
    // Gap
    const gap = parseFloat(cs.gap) || parseFloat(cs.rowGap) || parseFloat(cs.columnGap) || 0;
    
    // Padding
    const paddingTop = parseFloat(cs.paddingTop) || 0;
    const paddingRight = parseFloat(cs.paddingRight) || 0;
    const paddingBottom = parseFloat(cs.paddingBottom) || 0;
    const paddingLeft = parseFloat(cs.paddingLeft) || 0;
    
    autoLayout = {
      layoutMode: isHorizontal ? 'HORIZONTAL' : 'VERTICAL',
      primaryAxisAlignItems: primaryAlign,
      counterAxisAlignItems: counterAlign,
      itemSpacing: Math.round(gap),
      paddingTop: Math.round(paddingTop),
      paddingRight: Math.round(paddingRight),
      paddingBottom: Math.round(paddingBottom),
      paddingLeft: Math.round(paddingLeft)
    };
    if (cs.flexWrap === 'wrap' || cs.flexWrap === 'wrap-reverse') {
      autoLayout.layoutWrap = 'WRAP';
    }
  }
  
  if (!autoLayout && isBlockLikeDisplay(cs.display)) {
    const wrap = inferSemanticWrapperAutoLayout(tag, cs, children);
    if (wrap) autoLayout = wrap;
  }
  if (!autoLayout && isBlockLikeDisplay(cs.display)) {
    const stack = inferVerticalStackAutoLayout(children, cs);
    if (stack) autoLayout = stack;
  }
  if (!autoLayout && hasTailwindLayoutClassHint(el) === 'flex') {
    const tw = inferFlexFromTailwindClasses(el);
    if (tw) autoLayout = tw;
  }
  
  const frame = {
    type: 'FRAME',
    name: tag,
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
    fills,
    strokes,
    strokeWeight: isFullBorder ? borderWidth : 0,
    cornerRadius: Math.round(borderRadius),
    children
  };
  
  if (autoLayout) {
    frame.autoLayout = autoLayout;
  }
  
  const flexGrow = parseFloat(cs.flexGrow);
  if (!Number.isNaN(flexGrow) && flexGrow > 0) {
    frame.layoutGrow = Math.min(1, flexGrow);
  }
  
  return frame;
}

function captureFullPage() {
  const body = document.body;
  void body.offsetHeight; // Force reflow
  
  const bodyRect = body.getBoundingClientRect();
  const children = [];
  
  for (const child of body.children) {
    const captured = captureElement(child, null, 0);
    if (captured) children.push(captured);
  }
  
  // Get page background
  const bodyCs = getComputedStyle(body);
  const htmlCs = getComputedStyle(document.documentElement);
  const pageBg = parseColor(bodyCs.backgroundColor) || parseColor(htmlCs.backgroundColor) || { r: 1, g: 1, b: 1, a: 1 };
  
  return {
    type: 'FRAME',
    name: document.title || 'Page',
    x: 0,
    y: 0,
    width: Math.max(Math.round(bodyRect.width), window.innerWidth),
    height: Math.max(document.documentElement.scrollHeight, window.innerHeight),
    fills: [{ type: 'SOLID', color: pageBg }],
    cornerRadius: 0,
    children
  };
}

async function scrollPage() {
  const step = Math.max(Math.floor(window.innerHeight * 0.7), 300);
  let y = 0;
  let maxY = document.documentElement.scrollHeight;
  
  while (y < maxY) {
    window.scrollTo(0, y);
    await new Promise(r => setTimeout(r, 150));
    y += step;
    maxY = document.documentElement.scrollHeight;
  }
  window.scrollTo(0, 0);
  await new Promise(r => setTimeout(r, 200));
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.action === 'ping') {
    sendResponse({ ok: true, width: window.innerWidth });
    return true;
  }
  
  if (message?.action === 'captureFigma') {
    (async () => {
      try {
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        await new Promise(r => setTimeout(r, 100));
        
        if (message.scrollPage) {
          await scrollPage();
        }
        
        await new Promise(r => setTimeout(r, 100));
        
        const figmaTree = captureFullPage();
        sendResponse({ ok: true, figmaTree, capturedWidth: window.innerWidth });
      } catch (err) {
        sendResponse({ ok: false, error: err.message || String(err) });
      }
    })();
    return true;
  }
  
  return false;
});

console.log("[Web to Figma] Content script v6 loaded");
