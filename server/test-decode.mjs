const esmPath = './node_modules/fig-kiwi/dist/index.esm.js';
const { readHTMLMessage } = await import(esmPath);

// Sample Figma clipboard HTML (you'd get this from actually copying from Figma)
// For now, let's see what structure readHTMLMessage expects
console.log('readHTMLMessage signature:', readHTMLMessage.toString().slice(0, 800));
