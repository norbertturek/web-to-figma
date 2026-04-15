/**
 * Decode a Figma clipboard to extract the schema and message structure.
 * 
 * USAGE:
 * 1. Open Figma, select a simple frame, copy it (Ctrl+C)
 * 2. Paste the clipboard HTML here in the sampleClipboard variable
 * 3. Run: node decode-clipboard.mjs
 */

import { writeFileSync } from 'fs';

const figKiwiPath = './node_modules/fig-kiwi/dist/index.esm.js';
const { readHTMLMessage, writeHTMLMessage } = await import(figKiwiPath);

// Paste your Figma clipboard HTML here
// You can get it by copying in Figma and then reading clipboard with:
// navigator.clipboard.read() in browser DevTools
const sampleClipboard = `
PASTE_YOUR_FIGMA_CLIPBOARD_HTML_HERE
`;

if (sampleClipboard.includes('PASTE_YOUR_FIGMA_CLIPBOARD')) {
  console.log(`
To use this tool:
1. Open Figma in your browser
2. Create a simple frame with some text
3. Select it and copy (Ctrl+C)
4. Open browser DevTools Console
5. Run this code to get the clipboard HTML:

   (async () => {
     const items = await navigator.clipboard.read();
     for (const item of items) {
       if (item.types.includes('text/html')) {
         const blob = await item.getType('text/html');
         const html = await blob.text();
         console.log(html);
       }
     }
   })();

6. Copy the output and paste it in this file's sampleClipboard variable
7. Run: node decode-clipboard.mjs
`);
  process.exit(1);
}

try {
  const result = readHTMLMessage(sampleClipboard);
  
  console.log('=== META ===');
  console.log(JSON.stringify(result.meta, null, 2));
  
  console.log('\n=== HEADER ===');
  console.log(result.header);
  
  console.log('\n=== SCHEMA (definitions count) ===');
  console.log(result.schema.definitions?.length);
  
  console.log('\n=== MESSAGE TYPE ===');
  console.log(result.message.type);
  
  console.log('\n=== NODE CHANGES ===');
  console.log(JSON.stringify(result.message.nodeChanges, null, 2));
  
  // Save schema for reuse
  writeFileSync('./figma-schema.json', JSON.stringify(result.schema, null, 2));
  console.log('\nSchema saved to figma-schema.json');
  
  // Try to re-encode
  console.log('\n=== TESTING RE-ENCODE ===');
  const reEncoded = writeHTMLMessage({
    meta: result.meta,
    schema: result.schema,
    message: result.message
  });
  console.log('Re-encoded successfully! Length:', reEncoded.length);
  writeFileSync('./test-re-encoded.html', reEncoded);
  
} catch (err) {
  console.error('Error:', err);
}
