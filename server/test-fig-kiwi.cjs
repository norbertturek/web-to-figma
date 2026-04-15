const figKiwi = require('fig-kiwi');
console.log('Exported:', Object.keys(figKiwi));
console.log('\nFunctions:', Object.entries(figKiwi).filter(([k,v]) => typeof v === 'function').map(([k]) => k));
