import { readFileSync, writeFileSync } from 'fs';
import { compileSchema, parseSchema } from 'kiwi-schema';

const figKiwiPath = './node_modules/fig-kiwi/dist/index.esm.js';
const { writeHTMLMessage } = await import(figKiwiPath);

// Read and parse the Kiwi schema
const schemaText = readFileSync('./fig.kiwi', 'utf-8');
const schema = parseSchema(schemaText);
console.log('Schema parsed, definitions:', schema.definitions?.length || 0);

// Create a minimal message with a FRAME node
const message = {
  type: 'NODE_CHANGES',
  sessionID: 0,
  ackID: 0,
  pasteID: Math.floor(Math.random() * 1000000000),
  pasteFileKey: 'test-file-key',
  pasteIsPartiallyOutsideEnclosingFrame: false,
  pastePageId: { sessionID: 0, localID: 1 },
  nodeChanges: [
    {
      guid: { sessionID: 1, localID: 1 },
      phase: 'CREATED',
      type: 'FRAME',
      name: 'Test Frame',
      visible: true,
      opacity: 1,
      size: { x: 200, y: 100 },
      transform: {
        m00: 1, m01: 0, m02: 0,
        m10: 0, m11: 1, m12: 0
      },
      fillPaints: [{
        type: 'SOLID',
        color: { r: 0.2, g: 0.4, b: 0.8, a: 1 },
        opacity: 1,
        visible: true
      }]
    }
  ]
};

const meta = {
  fileKey: 'test-file',
  pasteID: message.pasteID,
  dataType: 'scene'
};

console.log('Message:', JSON.stringify(message, null, 2));
console.log('Meta:', meta);

try {
  const clipboardHtml = writeHTMLMessage({ meta, schema, message });
  console.log('\n=== CLIPBOARD HTML ===');
  console.log(clipboardHtml.slice(0, 500) + '...');
  
  // Save to file for testing
  writeFileSync('./test-clipboard.html', clipboardHtml);
  console.log('\nSaved to test-clipboard.html');
} catch (err) {
  console.error('Error generating clipboard:', err);
}
