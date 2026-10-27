import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
const assets = {
  "spray145.png": "bcec47379c672eb1179e831ea8953425e1af94ae63523e7b7335679b06c0a0ff",
  "shrub134.png": "27dcd1c2ec4f6b8421149b5e1664c5bb96a5f25cf8a1a4f318fea9a0ddfed3b2",
  "shrub112.png": "bcad85920d554d648d0a17e6e92c89c698e5f43c3976a9d30a7b22677bb833b7",
  "leaves.png": "ace13a4f9aac67a6816695c68ac3c10f76ee4ec8bdbbe3933584fe773612e46e",
  "pine.png": "e07ef1b9b26acff181eb4ec424898dbfd36e222427ce3bc1754b40355e7675f3",
  "bark.jpg": "7b64d504b4d0a61ed42f3547bd673f9bc704b7253400133cea218cc423f129e0",
  "pinebark.jpg": "64561841753b1e04e1b4c7018fba037d07afd17bc55b94a9ab4006e83c34ed9d"
};
mkdirSync(new URL('../public/', import.meta.url), { recursive: true });
for (const [name, hash] of Object.entries(assets)) {
  const data = Buffer.from(readFileSync(new URL('../art/' + name + '.b64', import.meta.url), 'utf8').trim(), 'base64');
  if (createHash('sha256').update(data).digest('hex') !== hash) throw new Error('Asset checksum mismatch: ' + name);
  writeFileSync(new URL('../public/' + name, import.meta.url), data);
}
