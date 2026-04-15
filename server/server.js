import express from 'express';
import cors from 'cors';
import puppeteer from 'puppeteer';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = 3847;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(join(__dirname, 'public')));

let browser = null;

async function getBrowser() {
  if (!browser) {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--font-render-hinting=none']
    });
  }
  return browser;
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: '3.0.0' });
});

/**
 * Capture URL and convert to Figma JSON
 * POST /capture
 * Body: { url: string, width?: number, scroll?: boolean }
 */
app.post('/capture', async (req, res) => {
  const { url, width = 1440, scroll = true } = req.body;
  
  if (!url) {
    return res.status(400).json({ error: 'Missing url' });
  }

  console.log(`[Capture] ${url} @ ${width}px`);
  
  try {
    const b = await getBrowser();
    const page = await b.newPage();
    
    // Set viewport
    await page.setViewport({ width, height: 900, deviceScaleFactor: 1 });
    
    // Load page
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
    
    // Wait for fonts
    await page.evaluate(() => document.fonts.ready);
    await new Promise(r => setTimeout(r, 500));
    
    // Scroll to load lazy content
    if (scroll) {
      await page.evaluate(async () => {
        const delay = ms => new Promise(r => setTimeout(r, ms));
        const step = window.innerHeight * 0.8;
        let y = 0;
        const maxY = document.documentElement.scrollHeight;
        while (y < maxY) {
          window.scrollTo(0, y);
          await delay(150);
          y += step;
        }
        window.scrollTo(0, 0);
        await delay(300);
      });
    }
    
    // Capture all elements
    const figmaTree = await page.evaluate(() => {
      const SKIP_TAGS = new Set(['script', 'style', 'noscript', 'template', 'head', 'meta', 'link', 'iframe']);
      
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
      
      function captureElement(el, parentRect, depth) {
        if (depth > 30) return null;
        
        const tag = el.tagName?.toLowerCase() || '';
        if (SKIP_TAGS.has(tag)) return null;
        
        const rect = el.getBoundingClientRect();
        if (rect.width < 1 || rect.height < 1) return null;
        
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) return null;
        
        // Position relative to parent
        const x = parentRect ? rect.left - parentRect.left : rect.left + window.scrollX;
        const y = parentRect ? rect.top - parentRect.top : rect.top + window.scrollY;
        
        // Handle SVG
        if (tag === 'svg') {
          const clone = el.cloneNode(true);
          if (!clone.getAttribute('xmlns')) {
            clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
          }
          
          // Get computed color for currentColor replacement
          const svgColor = cs.color || 'black';
          const svgFill = cs.fill !== 'none' ? cs.fill : null;
          
          // Inline use references
          clone.querySelectorAll('use').forEach(use => {
            const href = use.getAttribute('href') || use.getAttribute('xlink:href');
            if (href?.startsWith('#')) {
              const ref = document.getElementById(href.slice(1));
              if (ref) use.replaceWith(ref.cloneNode(true));
            }
          });
          
          // Replace currentColor and add fill if missing
          const svgHtml = clone.outerHTML
            .replace(/currentColor/gi, svgColor)
            .replace(/fill="none"/gi, 'fill="none"'); // keep none as none
          
          // If SVG has no fill, add one based on color
          let finalSvg = svgHtml;
          if (!svgHtml.includes('fill=') && svgColor) {
            finalSvg = svgHtml.replace('<svg', `<svg fill="${svgColor}"`);
          }
          
          return {
            type: 'SVG',
            name: 'icon',
            x: Math.round(x),
            y: Math.round(y),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            svg: finalSvg,
            color: parseColor(svgColor)
          };
        }
        
        // Handle images
        if (tag === 'img') {
          return {
            type: 'IMAGE',
            name: el.alt || 'image',
            x: Math.round(x),
            y: Math.round(y),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            src: el.src,
            cornerRadius: Math.round(parseFloat(cs.borderRadius) || 0)
          };
        }
        
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
        
        // Use the most prominent border
        let borderWidth = Math.max(borderTopWidth, borderRightWidth, borderBottomWidth, borderLeftWidth);
        let borderColor = borderTopColor;
        
        // Detect partial borders (for note in output)
        const hasPartialBorder = (borderTopWidth > 0 && borderBottomWidth === 0) ||
                                  (borderBottomWidth > 0 && borderTopWidth === 0) ||
                                  (borderLeftWidth > 0 && borderRightWidth === 0) ||
                                  (borderRightWidth > 0 && borderLeftWidth === 0);
        
        // Font
        const fontSize = parseFloat(cs.fontSize) || 16;
        const fontWeight = getFontWeight(cs.fontWeight);
        let fontFamily = (cs.fontFamily || 'Inter').split(',')[0].replace(/['"]/g, '').trim();
        // Map system fonts to Inter
        if (fontFamily.includes('system') || fontFamily.includes('apple') || fontFamily === 'BlinkMacSystemFont' || fontFamily === 'Segoe UI') {
          fontFamily = 'Inter';
        }
        let textAlign = cs.textAlign;
        const lineHeight = parseFloat(cs.lineHeight) || fontSize * 1.4;
        const letterSpacing = parseFloat(cs.letterSpacing) || 0;
        
        // Detect flexbox centering
        if (cs.display === 'flex' || cs.display === 'inline-flex') {
          if (cs.justifyContent === 'center' || cs.justifyContent === 'space-around' || cs.justifyContent === 'space-evenly') {
            textAlign = 'center';
          }
        }
        // Check parent flexbox
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
          
          // Calculate position relative to parent
          let textX = 0;
          let textY = 0;
          let textWidth = rect.width;
          let textHeight = fontSize * 1.5;
          
          if (textRect) {
            textX = textRect.left - rect.left;
            textY = textRect.top - rect.top;
            textWidth = textRect.width;
            textHeight = textRect.height;
          } else {
            // Fallback: center based on flexbox
            if (cs.display === 'flex' || cs.display === 'inline-flex') {
              if (cs.alignItems === 'center') {
                textY = (rect.height - fontSize) / 2;
              }
            }
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
        
        // Pure text node (no child elements)
        if (directTextContent && !hasChildElements) {
          // Make sure we have a valid text color - default to black if parsing fails
          let finalTextColor = textColor;
          if (!finalTextColor || (finalTextColor.r === 0 && finalTextColor.g === 0 && finalTextColor.b === 0 && finalTextColor.a === 0)) {
            // Try to get color again more carefully
            const rawColor = cs.color;
            finalTextColor = parseColor(rawColor) || { r: 0, g: 0, b: 0, a: 1 };
          }
          
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
            fills: [{ type: 'SOLID', color: finalTextColor }]
          };
        }
        
        // Frame
        const fills = [];
        if (bgColor && bgColor.a > 0.01) {
          fills.push({ type: 'SOLID', color: bgColor });
        }
        
        // Only add stroke if border is on all sides (not partial)
        const strokes = [];
        const isFullBorder = borderTopWidth > 0 && borderRightWidth > 0 && 
                             borderBottomWidth > 0 && borderLeftWidth > 0 &&
                             borderTopWidth === borderRightWidth && 
                             borderRightWidth === borderBottomWidth &&
                             borderBottomWidth === borderLeftWidth;
        
        if (borderColor && borderWidth > 0 && borderColor.a > 0.01 && isFullBorder) {
          strokes.push({ type: 'SOLID', color: borderColor });
        }
        
        // If only border-top, add a line element as first child
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
        
        // If only border-bottom, add a line element as last child
        if (borderBottomWidth > 0 && borderTopWidth === 0 && borderTopColor && borderTopColor.a > 0.01) {
          children.push({
            type: 'FRAME',
            name: 'border-bottom',
            x: 0,
            y: Math.round(rect.height - borderBottomWidth),
            width: Math.round(rect.width),
            height: Math.round(borderBottomWidth),
            fills: [{ type: 'SOLID', color: borderTopColor }],
            strokes: [],
            strokeWeight: 0,
            cornerRadius: 0,
            children: []
          });
        }
        
        return {
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
      }
      
      // Get page background
      const bodyCs = getComputedStyle(document.body);
      const htmlCs = getComputedStyle(document.documentElement);
      const pageBg = parseColor(bodyCs.backgroundColor) || parseColor(htmlCs.backgroundColor) || { r: 1, g: 1, b: 1, a: 1 };
      
      // Capture body children
      const bodyRect = document.body.getBoundingClientRect();
      const children = [];
      for (const child of document.body.children) {
        const captured = captureElement(child, null, 0);
        if (captured) children.push(captured);
      }
      
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
    });
    
    await page.close();
    
    // Count nodes
    let stats = { frames: 0, texts: 0, svgs: 0, images: 0 };
    function countNodes(node) {
      if (!node) return;
      if (node.type === 'FRAME') stats.frames++;
      if (node.type === 'TEXT') stats.texts++;
      if (node.type === 'SVG') stats.svgs++;
      if (node.type === 'IMAGE') stats.images++;
      node.children?.forEach(countNodes);
    }
    countNodes(figmaTree);
    
    console.log(`[Capture] Done: ${stats.frames} frames, ${stats.texts} texts, ${stats.svgs} SVGs, ${stats.images} images`);
    
    res.json({
      success: true,
      figmaTree,
      stats,
      viewport: { width, height: figmaTree.height }
    });
    
  } catch (err) {
    console.error('[Capture] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Graceful shutdown
process.on('SIGINT', async () => {
  if (browser) await browser.close();
  process.exit();
});

app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════╗
║     Web to Figma Server v3.0 (Puppeteer)       ║
║     http://localhost:${PORT}                       ║
╠════════════════════════════════════════════════╣
║  POST /capture { url, width?, scroll? }        ║
║  → Returns Figma JSON for plugin import        ║
╚════════════════════════════════════════════════╝
`);
});
