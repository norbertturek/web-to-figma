const esmPath = './node_modules/fig-kiwi/dist/index.esm.js';
const { readHTMLMessage, writeHTMLMessage, FigmaArchiveParser } = await import(esmPath);

console.log('writeHTMLMessage:', writeHTMLMessage.toString().slice(0, 500));
