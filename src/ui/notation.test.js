import {afterEach, expect, it, vi} from 'vitest';
const {game, ids} = vi.hoisted(() => ({game: {cookies: 100, UpgradesInStore: []}, ids: new Map()}));
vi.mock('../core/globals', () => ({Game: game, l: id => ids.get(id), PlaySound() {}}));
import {colorSpanByValue, updateNotation} from './render';
afterEach(() => {vi.unstubAllGlobals(); ids.clear();});

it.each(['building', 'upgrade'])('reuses the displayed %s color, retains legacy calls and failed-color retry', type => {
  const node = {dataset: {cppHoverTracked: '1'}, style: {removeProperty() {}}, addEventListener() {}};
  const span = {style: {}, innerHTML: '', textContent: ''};
  const item = {type, id: 4, l: node, getPrice: () => 1};
  game.UpgradesInStore = [item]; ids.set('upgrade0', node);
  vi.stubGlobal('document', {getElementById: () => span});
  const planner = {calcWaitingTime: () => '', notationCache: new Map(), colorRender: vi.fn(() => '#abcdef'), colorSpanByValue};
  const metric = {score: 1, rankPercentile: 100, rankOrder: 1, normalizedPercent: 100};
  updateNotation.call(planner, item, metric);
  expect(span.style.color).toBe('#abcdef');
  expect(planner.colorRender).toHaveBeenCalledTimes(1);
  colorSpanByValue.call(planner, span, 1);
  expect(planner.colorRender).toHaveBeenCalledTimes(2);
  planner.notationCache.clear(); planner.colorRender.mockClear();
  planner.colorRender.mockImplementationOnce(() => {throw Error('invalid color');});
  updateNotation.call(planner, item, metric);
  expect(span.style.color).toBe('#abcdef');
  expect(planner.colorRender).toHaveBeenCalledTimes(2);
});

it.each(['building', 'upgrade'])('preserves %s text nodes during color-only updates', type => {
  const node = {dataset: {cppHoverTracked: '1'}, style: {removeProperty() {}}, addEventListener() {}};
  const span = {style: {}}, writes = []; let text = '';
  Object.defineProperty(span, type === 'upgrade' ? 'innerHTML' : 'textContent', {
    get: () => text, set: value => {text = value; writes.push(value);},
  });
  const item = {type, id: 4, l: node, getPrice: () => 1};
  game.UpgradesInStore = [item]; ids.set('upgrade0', node);
  vi.stubGlobal('document', {getElementById: () => span});
  const planner = {calcWaitingTime: () => '', notationCache: new Map(),
    colorRender: vi.fn().mockReturnValueOnce('#aabbcc').mockReturnValue('#ddeeff'), colorSpanByValue};
  const metric = {score: 1, rankPercentile: 100, rankOrder: 1, normalizedPercent: 100};
  updateNotation.call(planner, item, metric);
  updateNotation.call(planner, item, metric);
  expect(writes).toHaveLength(1); expect(span.style.color).toBe('#ddeeff');
  updateNotation.call(planner, item, {...metric, normalizedPercent: 99});
  expect(writes).toHaveLength(2); expect(text).toContain('99%');
});
