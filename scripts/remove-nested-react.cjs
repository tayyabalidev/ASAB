/**
 * npm may nest react@18 under @videosdk.live/react-native-sdk (peer of react-sdk).
 * Two React copies break VideoSDK hooks (e.g. "Cannot read property 'useState' of null").
 * Remove nested copies so resolution uses the app's react@19.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const nested = [
  path.join(root, 'node_modules', '@videosdk.live', 'react-native-sdk', 'node_modules', 'react'),
];

for (const dir of nested) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
    console.log('[remove-nested-react] Removed:', path.relative(root, dir));
  }
}
