figma.showUI(__html__, { width: 400, height: 500 });

figma.ui.onmessage = async function(msg) {
  if (msg.type === 'import') {
    try {
      await figma.loadFontAsync({ family: "Inter", style: "Regular" });
      await figma.loadFontAsync({ family: "Inter", style: "Medium" });
      await figma.loadFontAsync({ family: "Inter", style: "Bold" });

      var root = await createNode(msg.data, false);
      if (root) {
        var c = figma.viewport.center;
        root.x = c.x - root.width / 2;
        root.y = c.y - root.height / 2;
        figma.currentPage.selection = [root];
        figma.viewport.scrollAndZoomIntoView([root]);
        figma.notify('Zaimportowano!');
        figma.ui.postMessage({ type: 'success' });
      }
    } catch (err) {
      figma.notify('Blad: ' + err.message, { error: true });
      figma.ui.postMessage({ type: 'error', message: err.message });
    }
  }
  if (msg.type === 'cancel') {
    figma.closePlugin();
  }
};

function applyAutoLayoutProps(frame, al) {
  if (!al || !frame || frame.type !== 'FRAME') return;
  var mode = al.layoutMode || 'NONE';
  if (mode === 'NONE') return;
  frame.layoutMode = mode;
  if (mode === 'GRID') {
    if (al.gridColumnCount !== undefined) frame.gridColumnCount = al.gridColumnCount;
    if (al.gridRowCount !== undefined) frame.gridRowCount = al.gridRowCount;
    if (al.gridColumnGap !== undefined) frame.gridColumnGap = al.gridColumnGap;
    if (al.gridRowGap !== undefined) frame.gridRowGap = al.gridRowGap;
    if (al.paddingTop !== undefined) frame.paddingTop = al.paddingTop;
    if (al.paddingRight !== undefined) frame.paddingRight = al.paddingRight;
    if (al.paddingBottom !== undefined) frame.paddingBottom = al.paddingBottom;
    if (al.paddingLeft !== undefined) frame.paddingLeft = al.paddingLeft;
    return;
  }
  if (mode === 'HORIZONTAL' || mode === 'VERTICAL') {
    if (al.primaryAxisAlignItems === 'CENTER') frame.primaryAxisAlignItems = 'CENTER';
    else if (al.primaryAxisAlignItems === 'MAX') frame.primaryAxisAlignItems = 'MAX';
    else if (al.primaryAxisAlignItems === 'SPACE_BETWEEN') frame.primaryAxisAlignItems = 'SPACE_BETWEEN';
    else frame.primaryAxisAlignItems = 'MIN';
    if (al.counterAxisAlignItems === 'CENTER') frame.counterAxisAlignItems = 'CENTER';
    else if (al.counterAxisAlignItems === 'MAX') frame.counterAxisAlignItems = 'MAX';
    else frame.counterAxisAlignItems = 'MIN';
    if (al.itemSpacing !== undefined) frame.itemSpacing = al.itemSpacing;
    if (al.paddingTop !== undefined) frame.paddingTop = al.paddingTop;
    if (al.paddingRight !== undefined) frame.paddingRight = al.paddingRight;
    if (al.paddingBottom !== undefined) frame.paddingBottom = al.paddingBottom;
    if (al.paddingLeft !== undefined) frame.paddingLeft = al.paddingLeft;
    if (al.layoutWrap === 'WRAP') frame.layoutWrap = 'WRAP';
    else frame.layoutWrap = 'NO_WRAP';
    frame.primaryAxisSizingMode = 'FIXED';
    frame.counterAxisSizingMode = 'FIXED';
  }
}

async function createNode(d, parentHasAutoLayout) {
  if (!d) return null;
  var n;
  var useZeroPosition = parentHasAutoLayout === true;

  if (d.type === 'TEXT') {
    n = figma.createText();
    n.name = d.name || 'Text';
    
    // Load font
    var fontFamily = d.fontFamily || 'Inter';
    var fontWeight = d.fontWeight || 'Regular';
    try {
      await figma.loadFontAsync({ family: fontFamily, style: fontWeight });
      n.fontName = { family: fontFamily, style: fontWeight };
    } catch (e) {
      n.fontName = { family: 'Inter', style: 'Regular' };
    }
    
    n.characters = d.characters || '';
    if (d.fontSize) n.fontSize = d.fontSize;
    if (d.lineHeight) {
      n.lineHeight = { value: d.lineHeight, unit: 'PIXELS' };
    }
    
    // Text alignment
    if (d.textAlign === 'center') {
      n.textAlignHorizontal = 'CENTER';
    } else if (d.textAlign === 'right') {
      n.textAlignHorizontal = 'RIGHT';
    } else {
      n.textAlignHorizontal = 'LEFT';
    }
    
    // Auto-resize: let text flow naturally
    n.textAutoResize = 'WIDTH_AND_HEIGHT';
    
    if (useZeroPosition) {
      n.x = 0;
      n.y = 0;
    } else {
      n.x = d.x || 0;
      n.y = d.y || 0;
    }
    
    // Fills
    if (d.fills && d.fills.length) {
      n.fills = d.fills.map(function(f) {
        return {
          type: 'SOLID',
          color: {
            r: f.color && f.color.r !== undefined ? f.color.r : 0,
            g: f.color && f.color.g !== undefined ? f.color.g : 0,
            b: f.color && f.color.b !== undefined ? f.color.b : 0
          },
          opacity: f.color && f.color.a !== undefined ? f.color.a : 1
        };
      });
    }
    
  } else if (d.type === 'SVG') {
    // Try to create SVG node
    try {
      if (d.svg) {
        n = figma.createNodeFromSvg(d.svg);
        n.name = d.name || 'icon';
        if (useZeroPosition) {
          n.x = 0;
          n.y = 0;
        } else {
          n.x = d.x || 0;
          n.y = d.y || 0;
        }
        // Resize if needed
        if (d.width && d.height && n.width > 0 && n.height > 0) {
          var scale = Math.min(d.width / n.width, d.height / n.height);
          n.resize(n.width * scale, n.height * scale);
        }
        // Apply color to SVG children if provided
        if (d.color && n.children) {
          var svgColor = {
            r: d.color.r !== undefined ? d.color.r : 0,
            g: d.color.g !== undefined ? d.color.g : 0,
            b: d.color.b !== undefined ? d.color.b : 0
          };
          function applyColorToNode(node) {
            try {
              if (node.fills && Array.isArray(node.fills) && node.fills.length > 0) {
                node.fills = [{ type: 'SOLID', color: svgColor }];
              }
              if (node.children) {
                for (var i = 0; i < node.children.length; i++) {
                  applyColorToNode(node.children[i]);
                }
              }
            } catch (e) {}
          }
          for (var i = 0; i < n.children.length; i++) {
            applyColorToNode(n.children[i]);
          }
        }
      } else {
        // Fallback: create rectangle placeholder
        n = figma.createRectangle();
        n.name = d.name || 'icon';
        n.resize(d.width || 24, d.height || 24);
        if (useZeroPosition) { n.x = 0; n.y = 0; } else { n.x = d.x || 0; n.y = d.y || 0; }
        n.fills = [{ type: 'SOLID', color: { r: 0.8, g: 0.8, b: 0.8 } }];
      }
    } catch (e) {
      // SVG parse failed, create placeholder
      n = figma.createRectangle();
      n.name = (d.name || 'icon') + ' (SVG error)';
      n.resize(d.width || 24, d.height || 24);
      if (useZeroPosition) { n.x = 0; n.y = 0; } else { n.x = d.x || 0; n.y = d.y || 0; }
      n.fills = [{ type: 'SOLID', color: { r: 0.9, g: 0.7, b: 0.7 } }];
    }
    
  } else if (d.type === 'IMAGE') {
    // Create placeholder for images
    n = figma.createRectangle();
    n.name = d.name || 'image';
    n.resize(d.width || 100, d.height || 100);
    if (useZeroPosition) { n.x = 0; n.y = 0; } else { n.x = d.x || 0; n.y = d.y || 0; }
    n.fills = [{ type: 'SOLID', color: { r: 0.9, g: 0.9, b: 0.95 } }];
    n.cornerRadius = 4;
    
  } else {
    // FRAME
    n = figma.createFrame();
    n.name = d.name || 'Frame';
    n.resize(d.width || 100, d.height || 100);
    if (useZeroPosition) {
      n.x = 0;
      n.y = 0;
    } else {
      n.x = d.x || 0;
      n.y = d.y || 0;
    }
    n.clipsContent = false;
    
    if (d.fills && d.fills.length) {
      n.fills = d.fills.map(function(f) {
        return {
          type: 'SOLID',
          color: {
            r: f.color && f.color.r !== undefined ? f.color.r : 1,
            g: f.color && f.color.g !== undefined ? f.color.g : 1,
            b: f.color && f.color.b !== undefined ? f.color.b : 1
          },
          opacity: f.color && f.color.a !== undefined ? f.color.a : 1
        };
      });
    } else {
      n.fills = [];
    }
    
    if (d.cornerRadius) {
      n.cornerRadius = d.cornerRadius;
    }
    
    // Strokes (borders)
    if (d.strokes && d.strokes.length) {
      n.strokes = d.strokes.map(function(s) {
        return {
          type: 'SOLID',
          color: {
            r: s.color && s.color.r !== undefined ? s.color.r : 0,
            g: s.color && s.color.g !== undefined ? s.color.g : 0,
            b: s.color && s.color.b !== undefined ? s.color.b : 0
          },
          opacity: s.color && s.color.a !== undefined ? s.color.a : 1
        };
      });
      if (d.strokeWeight) {
        n.strokeWeight = d.strokeWeight;
      }
    }
    
    var al = d.autoLayout;
    var hasFlowLayout = al && al.layoutMode && al.layoutMode !== 'NONE';
    applyAutoLayoutProps(n, al);
    
    // Children must be appended after layoutMode is set so Figma places them in flow
    var childInFlow = !!hasFlowLayout;
    if (d.children && d.children.length) {
      for (var j = 0; j < d.children.length; j++) {
        var childData = d.children[j];
        var cn = await createNode(childData, childInFlow);
        if (cn) {
          if (childInFlow && 'layoutPositioning' in cn) {
            cn.layoutPositioning = 'AUTO';
          }
          if (childInFlow && childData.layoutGrow !== undefined && 'layoutGrow' in cn) {
            cn.layoutGrow = childData.layoutGrow;
          }
          n.appendChild(cn);
        }
      }
    }
  }
  
  return n;
}
