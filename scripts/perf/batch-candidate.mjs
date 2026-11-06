import {readFile} from 'node:fs/promises';
import {transformSync} from 'esbuild';
// Share the product implementation; the project's CommonJS package cannot import TS as ESM directly.
const source = await readFile(new URL('../../src/calc/batchCandidate.ts', import.meta.url), 'utf8');
const {code} = transformSync(source, {loader: 'ts', format: 'esm', target: 'es2020'});
export const {installBatchCandidate} = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
