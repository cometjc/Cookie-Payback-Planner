import {readFile} from 'node:fs/promises';
import {transformSync} from 'esbuild';
const source=await readFile(new URL('../../src/calc/creatorObserver.ts',import.meta.url),'utf8');
const {code}=transformSync(source,{loader:'ts',format:'esm',target:'es2020'});
export const {observeCreatorLaunch}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
