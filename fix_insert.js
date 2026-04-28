const fs = require('fs');
let content = fs.readFileSync('server.js', 'utf8');
// Fix the VALUES clause to include email placeholder
content = content.replace(
  /VALUES \(\`\?, \?, datetime\('now', '\+8 hours'\)\`/g, 
  "VALUES (?, ?, datetime('now', '+8 hours'))`"
);
fs.writeFileSync('server.js', content);
console.log('Fixed server.js');
