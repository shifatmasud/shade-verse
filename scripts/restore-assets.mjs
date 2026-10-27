import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
const data = Buffer.from(readFileSync(new URL('../art/shrub112.png.b64', import.meta.url), 'utf8').trim(), 'base64');
if (createHash('sha256').update(data).digest('hex') !== 'bcad85920d554d648d0a17e6e92c89c698e5f43c3976a9d30a7b22677bb833b7') throw new Error('Shrub asset checksum mismatch');
mkdirSync(new URL('../public/', import.meta.url), { recursive: true });
writeFileSync(new URL('../public/shrub112.png', import.meta.url), data);
