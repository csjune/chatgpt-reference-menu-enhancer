const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const { CONFIG, matchesSearch, contentKey, scopeKey, verifiedOwner, cleanReference, validThumbnail, fresh, catalogBody, detachedDownload, boundedImage,
  thumbnailMatchesReference, referenceTransport, mergeReference, nativeSelection, DownloadQueue,
  ThumbnailInventory, SharedImages, PreviewLoader, ChatCacheSession, chatIdFor, deletedChatId, CHAT_CACHE_PREFIX, CHAT_CACHE_RECENT_KEY, CatalogSession, waitWithSignal, PreviewCache, PersistentPreviewCache, HoverPreview, resizePreview, previewImageSize, previewPosition,
  ReferenceIndex, AccessWriteBatch, MenuRows, ReferenceClickGate, ReferenceFocusGate, REFERENCE_HOVER_EVENTS, nativeCatalog,
  referenceButton, referenceStatus, referenceNotice, referenceRefreshState, UI_MESSAGES, resolveUiLocale, uiLocale, translateUi, UI_ICONS, glyphPosition, renderUiStatus,
  mentionReferenceId, mentionHighlighted, highlightedMention, mentionImagePointers, referenceOwner, mentionIconBox, referencePill,
  RecentMisses } = require('./chatgpt-reference-menu.user.js');

// Existing pipeline regressions run with the lifecycle gate open. Lifecycle tests
// below use the unmodified gate and real fetch wrapper/history/storage integration.
// Source substitutions must fail loudly when the userscript text they target changes.
function replaceOnce(source, target, replacement) {
  assert.equal(source.split(target).length, 2, `test hook target not found exactly once: ${target.trim().slice(0, 60)}`);
  return source.replace(target, () => replacement);
}
function runtimeSource(managed = false) {
  const source = fs.readFileSync(require.resolve('./chatgpt-reference-menu.user.js'), 'utf8');
  return managed ? source : replaceOnce(source, 'return cacheSession.running && cacheSession.chatId === chatIdFor(location.href);', 'return true;');
}
function stateStorage(values = new Map()) {
  return { values, getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key),
    keys: () => [...values.keys()], get length() { return values.size; }, key: index => [...values.keys()][index] ?? null };
}
// Runs the real userscript in a fresh VM context. `expose` lines are injected right before
// the diagnostics block to reach closure internals; `window` adds window members (or builds
// them from the context); remaining options become extra or replacement context globals.
function loadRuntime({ fetch, href = 'https://chatgpt.com/', document = {}, managed = false, expose = [], window: extras = {},
  indexedDB = mockDatabase(), ...globals } = {}) {
  const window = { fetch };
  window.top = window;
  const context = { window, indexedDB, Request, Response, Headers, URL, AbortController, DOMException,
    location: { href, origin: 'https://chatgpt.com' },
    document: { hidden: true, body: null, head: null, addEventListener() {}, querySelectorAll: () => [], ...document },
    setTimeout, clearTimeout, queueMicrotask, BroadcastChannel: undefined, ...globals };
  Object.assign(window, typeof extras === 'function' ? extras(context) : extras);
  const source = expose.length ? replaceOnce(runtimeSource(managed), '  // Small diagnostics',
    `${expose.map(line => `  ${line}\n`).join('')}  // Small diagnostics`) : runtimeSource(managed);
  vm.runInNewContext(source, context);
  return { window, context };
}
// Minimal DOM element stub for menu rows, shared by the VM runtime contexts.
class Element {
  closest() { return this; }
  getAttribute() { return null; }
  hasAttribute() { return false; }
  querySelector() { return null; }
  getBoundingClientRect() { return { top: 20, bottom: 50, height: 30 }; }
  isConnected = true;
}

const ref = name => ({ id: name, entity_name: name, entity_type: 'asset', asset_pointer: `sediment://file_${name}`, thumbnail_asset_pointer: null });

test('참조 아이콘의 호버 이벤트만 막고 클릭·키보드와 다른 UI는 유지한다', () => {
  const icon = {}, unrelated = {};
  const gate = new ReferenceClickGate(target => target === icon ? icon : null);
  for (const type of REFERENCE_HOVER_EVENTS) {
    let blocked = false;
    assert.equal(gate.handle({ type, target: icon, stopImmediatePropagation() { blocked = true; } }), true);
    assert.equal(blocked, true);
  }
  for (const [type, target] of [['click', icon], ['pointerdown', icon], ['keydown', icon], ['pointerover', unrelated]]) {
    assert.equal(gate.handle({ type, target, stopImmediatePropagation() { throw new Error('native action blocked'); } }), false);
  }
});

test('참조 버튼의 호버 콜백 자체를 중립화하고 클릭·키보드·원본 props는 보존한다', () => {
  let hovered = 0, clicked = 0, keyed = 0;
  const original = Object.freeze({ onPointerEnter: () => hovered++, onPointerMoveCapture: () => hovered++,
    onMouseEnter: () => hovered++, onClick: () => clicked++, onKeyDown: () => keyed++ });
  const button = { __reactProps$fixture: original };
  const gate = new ReferenceClickGate(() => button);
  gate.prepare(button);
  const patched = button.__reactProps$fixture;
  patched.onPointerEnter(); patched.onPointerMoveCapture(); patched.onMouseEnter();
  patched.onClick(); patched.onKeyDown();
  assert.equal(hovered, 0);
  assert.equal(clicked, 1); assert.equal(keyed, 1);
  assert.equal(patched.onClick, original.onClick);
  assert.notEqual(patched.onPointerEnter, original.onPointerEnter);
  original.onPointerEnter(); assert.equal(hovered, 1, 'the original props object was not mutated');
  button.__reactProps$fixture = { ...original, onClick: () => clicked += 2 };
  gate.prepare(button); button.__reactProps$fixture.onPointerEnter(); button.__reactProps$fixture.onClick();
  assert.equal(hovered, 1); assert.equal(clicked, 3, 'new props after a render must be handled again');
});

test('참조 버튼 찾기는 SVG·텍스트 대상과 번역된 라벨을 지원하고 추가 버튼은 제외한다', () => {
  for (const label of ['사용된 참고 자료 1개 보기', '사용한 참고 이미지 2개 보기', 'View 2 references', 'Show the 1 reference used']) {
    const button = { getAttribute: () => label };
    const svg = { closest: () => button };
    assert.equal(referenceButton(svg), button);
    assert.equal(referenceButton({ nodeType: 3, parentElement: svg }), button);
  }
  assert.equal(referenceButton({ closest: () => ({ getAttribute: () => '참고 이미지 추가' }) }), null);
});

test('진행 상태는 필요한 숫자만 짧게 표시한다', () => {
  const progress = { total: 3001, discovered: 3001, ready: 2500, pending: 501, failed: 0 };
  assert.equal(referenceStatus({ progress }).text, '☷ 3,001 · 💾 2,500/0/3,001 · ◷ 501');
  const ready = { ...progress, ready: 3001, pending: 0 };
  assert.equal(referenceStatus({ progress: ready }).text, '☷ 3,001 · 💾 3,001');
  assert.equal(referenceStatus({ progress: ready, matched: 1, query: 'R001', refreshing: true }).text,
    '🔍 1 · ☷ 3,001 · 💾 3,001 · ↻…');
});

test('미확정·실패 상태는 짧은 표시와 상세 도움말로 구분한다', () => {
  const progress = { total: null, discovered: 150, ready: 73, pending: 76, failed: 1 };
  const result = referenceStatus({ progress, locale: 'ko', pages: 3, catalogError: true,
    storageError: { operation: 'thumbnails:readwrite', reason: 'timeout' }, storageWriteFailed: true });
  assert.equal(result.text, '☷ 150 / ? · 💾 73/1/? · ◷ 76 · ☷! · 💾!');
  assert.match(result.detail, /3페이지/); assert.match(result.detail, /timeout/);
  assert.equal(referenceStatus({ progress }).text, '☷ 150 / ? · 💾 73/1/? · ◷ 76 · ↻…');
});

test('진행 중인 조회·갱신·캐싱을 짧게 표시하고 종료·저장 중단 뒤에는 캐싱 표시를 지운다', () => {
  const progress = { total: 120, discovered: 120, ready: 100, pending: 20, failed: 0 };
  const prefix = '☷ 120 · 💾 100/0/120 · ◷ 20';
  assert.equal(referenceStatus({ progress, caching: true }).text, prefix + ' · ⇩…');
  assert.equal(referenceStatus({ progress, refreshing: true, caching: true }).text, prefix + ' · ↻… · ⇩…');
  assert.equal(referenceStatus({ progress: { ...progress, total: null }, caching: true }).text,
    '☷ 120 / ? · 💾 100/0/? · ◷ 20 · ↻… · ⇩…');
  assert.equal(referenceStatus({ progress, catalogError: true, caching: true }).text, prefix + ' · ☷! · ⇩…');
  assert.equal(referenceStatus({ progress, caching: true, storageWriteFailed: true }).text, prefix + ' · 💾!');
  assert.equal(referenceStatus({ progress }).text, prefix, 'pending items alone do not mean work is running');
  assert.equal(referenceStatus({ progress: { ...progress, ready: 120, pending: 0 } }).text, '☷ 120 · 💾 120');
});

test('캐시 재확인 작업은 상태줄에 표시하고 종료 뒤에는 제거한다', () => {
  const progress = { total: 120, discovered: 120, ready: 120, pending: 0, failed: 0 };
  const storageError = { operation: 'catalogs:readonly', reason: 'timeout' };
  assert.equal(referenceStatus({ progress, storageError, checkingCache: true }).text,
    '☷ 120 · 💾 120 · 🛡… · 💾!');
  assert.equal(referenceStatus({ progress }).text, '☷ 120 · 💾 120');
});

test('아이콘 UI는 화면 문구 없이 오류·진행·미확정 수를 구분하고 도움말 의미를 보존한다', () => {
  const model = referenceStatus({ progress: { total: null, discovered: 150, ready: 100, pending: 49, failed: 1 },
    caching: true, locale: 'ko', storageError: { operation: 'catalogs:readonly', reason: 'timeout' } });
  assert.doesNotMatch(model.text, /[가-힣A-Za-z]/);
  assert.equal(model.tokens.find(token => token.icon === 'list').value, '150 / ?');
  assert.equal(model.tokens.find(token => token.icon === 'refresh').busy, true);
  assert.equal(model.tokens.find(token => token.icon === 'download').busy, true);
  assert.equal(model.tokens.filter(token => token.icon === 'database' && token.error).length, 1);
  assert.match(model.detail, /캐싱 중/);
  assert.match(model.detail, /catalogs:readonly: timeout/);
  const loading = referenceNotice('verify', '선택한 참조 확인 중', true);
  const failure = referenceNotice('verify', '참조 확인 시간이 초과됐어', false, true);
  assert.equal(loading.text, '🛡…');
  assert.equal(failure.text, '🛡!');
  assert.equal(referenceNotice('error', 'Preview failed').text, '⚠');
  assert.equal(referenceNotice('image', 'Preview').text, '🖼');
  assert.equal(failure.tokens[0].busy, false);
  assert.match(failure.detail, /시간이 초과/);
});

test('새로고침 버튼은 갱신 중에도 누를 수 있고 선택 처리·연결 대기 때만 비활성화한다', () => {
  const session = { complete: false, failed: false, controller: new AbortController() };
  assert.equal(referenceRefreshState(session).busy, true);
  assert.equal(referenceRefreshState(session).disabled, false);
  assert.match(referenceRefreshState(session, true, false, 'ko').title, /취소하고 처음부터/);
  for (const changed of [{ complete: true }, { failed: true }, { controller: { signal: { aborted: true } } }]) {
    const result = referenceRefreshState({ ...session, ...changed });
    assert.equal(result.busy, false); assert.equal(result.disabled, false);
  }
  assert.equal(referenceRefreshState(null, false).disabled, true);
  assert.equal(referenceRefreshState(null, true, true).disabled, true);
});

test('증분 인덱스는 이름 중복·파일 공유·이름 및 포인터 변경·삭제를 반영한다', () => {
  const index = new ReferenceIndex();
  const one = ref('one'), alias = { ...ref('two'), entity_name: 'one', asset_pointer: one.asset_pointer };
  index.apply([one]);
  const version = index.version;
  assert.equal(index.apply([{ ...one }]).changed, 0);
  assert.equal(index.version, version);
  index.apply([alias]);
  assert.equal(index.byName.get('one').length, 2);
  assert.equal(index.byFile.get('file_one').length, 2);
  const changed = { ...alias, entity_name: 'renamed', asset_pointer: 'sediment://file_new' };
  const result = index.apply([changed]);
  assert.deepEqual([...result.names], ['one', 'renamed']);
  assert.equal(index.byName.get('one')[0], one);
  assert.equal(index.byFile.get('file_new')[0], changed);
  index.apply([changed], true);
  assert.equal(index.byId.size, 1);
  assert.equal(index.byName.has('one'), false);
  assert.equal(index.byFile.has('file_one'), false);
});

test('새 페이지 등록은 기존 전체 목록을 순회하거나 기존 항목을 재생성하지 않는다', () => {
  const index = new ReferenceIndex();
  const original = Array.from({ length: 2800 }, (_, i) => ref(String(i)));
  index.apply(original);
  index.byId.values = () => { throw new Error('full index scan'); };
  const extra = ref('last');
  index.apply([extra]);
  assert.equal(index.byId.size, 2801);
  assert.equal(index.byId.get('0'), original[0]);
  assert.equal(index.byId.get('last'), extra);
});

test('상태 변경과 요약은 전체 참조 대신 해당 파일만 갱신한다', () => {
  const inventory = new ThumbnailInventory();
  inventory.register(Array.from({ length: 3001 }, (_, i) => ref(String(i))));
  inventory.items.values = () => { throw new Error('full inventory scan'); };
  for (let i = 0; i < 3001; i++) inventory.mark('file_' + i, 'ready');
  assert.equal(inventory.summary().ready, 3001);
  inventory.mark('file_0', 'failed'); inventory.mark('file_0', 'failed');
  assert.equal(inventory.summary().ready, 3000);
  assert.equal(inventory.summary().failed, 1);
});

test('공유 파일의 일부 참조 변경·삭제 뒤에도 상태 집계가 일치한다', () => {
  const inventory = new ThumbnailInventory();
  const one = ref('one'), alias = { ...one, id: 'alias' };
  inventory.register([one, alias]); inventory.mark('file_one', 'ready');
  inventory.register([{ ...alias, asset_pointer: 'sediment://file_new' }]);
  assert.deepEqual(inventory.summary(), { total: null, discovered: 2, ready: 1, pending: 1, failed: 0, complete: false });
  inventory.finish([{ ...alias, asset_pointer: 'sediment://file_new' }]);
  inventory.mark('file_one', 'failed');
  assert.deepEqual(inventory.summary(), { total: 1, discovered: 1, ready: 0, pending: 1, failed: 0, complete: false });
  inventory.mark('file_new', 'ready');
  assert.equal(inventory.summary().complete, true);
  inventory.reset(); assert.equal(inventory.summary().discovered, 0);
});

function menuRowsFixture(count = 3) {
  let measurements = 0, writes = 0, labelsRead = 0;
  const index = new ReferenceIndex();
  const refs = Array.from({ length: count }, (_, i) => ref('R' + String(i).padStart(4, '0')));
  index.apply(refs);
  const rows = refs.map((reference, i) => ({
    textContent: reference.entity_name, label: reference.entity_name, classList: { add() {} },
    getAttribute: () => null, _hidden: false,
    get hidden() { return this._hidden; }, set hidden(value) { writes++; this._hidden = value; },
    getBoundingClientRect() { measurements++; return { top: i * 30 - 87000, bottom: i * 30 + 30 - 87000, height: 30 }; },
  }));
  const view = new MenuRows(index, row => { labelsRead++; return [row.label]; });
  const state = { menu: { getBoundingClientRect: () => ({ top: 0, bottom: 300 }) } };
  view.init(state); view.sync(state, rows); view.filter(state, '');
  return { index, view, state, rows, refs, measurements: () => measurements, writes: () => writes, labelsRead: () => labelsRead };
}

test('보이는 행 탐색은 목록 아래에서도 모든 행의 레이아웃을 읽지 않는다', () => {
  const h = menuRowsFixture(3000);
  const shown = h.view.visible(h.state, 1000);
  assert.equal(shown.length, 10);
  assert.equal(shown[0], h.rows[2900]);
  assert.ok(h.measurements() < 30, 'layout reads should scale with log(rows) + visible rows');
});

test('검색은 정규화된 이름을 재사용하고 바뀐 행만 숨긴다', () => {
  const h = menuRowsFixture();
  assert.equal(h.labelsRead(), 3);
  h.view.filter(h.state, 'ｒ０００１');
  assert.deepEqual(h.state.filteredRows, [h.rows[1]]);
  assert.equal(h.writes(), 2);
  h.view.filter(h.state, 'r0001');
  assert.equal(h.writes(), 2, 'unchanged visibility must not be written again');
  assert.equal(h.labelsRead(), 3);
});

test('부분 인덱스 갱신·같은 DOM 행의 이름 변경과 제거를 반영한다', () => {
  const h = menuRowsFixture();
  const renamed = { ...h.refs[1], entity_name: '새 이름', asset_pointer: 'sediment://file_changed' };
  h.rows[1].label = h.rows[1].textContent = '새 이름';
  h.state.dirtyNames = h.index.apply([renamed]).names;
  assert.equal(h.view.sync(h.state, h.rows), true);
  assert.equal(h.labelsRead(), 4, 'only the affected row should be reread');
  assert.equal(h.state.references.get(h.rows[1]), renamed);
  assert.equal(h.state.rowsByFile.has('file_R0001'), false);
  h.view.filter(h.state, '새 이름');
  assert.deepEqual(h.state.filteredRows, [h.rows[1]]);
  h.view.sync(h.state, [h.rows[0], h.rows[2]]);
  assert.equal(h.state.rowsByLabel.has('새 이름'), false);
  assert.equal(h.state.rowsByFile.has('file_changed'), false);
});

test('같은 파일을 사용하는 여러 행의 연결을 함께 보관한다', () => {
  const h = menuRowsFixture();
  h.state.dirtyNames = h.index.apply([{ ...h.refs[1], asset_pointer: h.refs[0].asset_pointer }]).names;
  h.view.sync(h.state, h.rows);
  assert.equal(h.state.rowsByFile.get('file_R0000').size, 2);
});

test('접근 시각은 같은 키를 합치고 최근에 저장한 키는 다시 쓰지 않는다', async () => {
  const written = [];
  const batch = new AccessWriteBatch(async items => written.push(new Map(items)), { delay: 10000, size: 128, interval: 60 });
  batch.touch('one', 100); batch.touch('one', 110); batch.touch('two', 120);
  assert.equal(written.length, 0);
  await batch.flush();
  assert.deepEqual([...written[0]], [['one', 110], ['two', 120]]);
  batch.touch('one', 130); await batch.flush();
  assert.equal(written.length, 1);
  batch.touch('one', 180); await batch.flush(); assert.equal(written.length, 2);
  batch.clear();
});

test('접근 시각 저장 중 새 접근·계정 전환·저장 오류도 다음 묶음을 막지 않는다', async () => {
  let release;
  const written = [];
  const batch = new AccessWriteBatch(async items => {
    written.push(new Map(items));
    if (written.length === 1) await new Promise(resolve => { release = resolve; });
    if (written.length === 2) throw new Error('storage failed');
  }, { delay: 10000, size: 128, interval: 0 });
  batch.touch('old', 100); const first = batch.flush();
  await until(() => release, 'flush did not start');
  batch.clear(); batch.touch('new', 200); release(); await first;
  assert.equal(batch.written.has('old'), false);
  await batch.flush();
  assert.equal(batch.written.has('new'), false, 'failed metadata writes must not count as persisted');
  batch.touch('new', 300); await batch.flush();
  assert.equal(batch.written.get('new'), 300);
  batch.clear();
});

function previewHarness({ load, current = () => true, delay = 0 } = {}) {
  const revoked = [];
  let counter = 0;
  const cache = new PreviewCache({ urls: { createObjectURL: () => 'blob:preview-' + ++counter, revokeObjectURL: url => revoked.push(url) } });
  const shown = [];
  let hides = 0;
  const preview = new HoverPreview({ cache, load, current, delay, show: state => shown.push(state), hide: () => hides++ });
  return { preview, shown, revoked, hides: () => hides };
}

test('큰 미리보기는 머무른 항목만 요청하고 떠나면 요청을 취소한다', async () => {
  let calls = 0, signal;
  const h = previewHarness({ delay: 20, load: async (_, s) => { calls++; signal = s; return new Promise(() => {}); } });
  h.preview.open('skipped', ref('skipped'), { row: {} });
  h.preview.close();
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(calls, 0);
  h.preview.open('one', ref('one'), { row: {} });
  await until(() => calls === 1, 'hover request not started');
  h.preview.close();
  assert.equal(signal.aborted, true);
  assert.equal(h.preview.target, null);
});

test('늦은 이전 미리보기 응답은 새 항목을 덮어쓰거나 캐시에 저장하지 않는다', async () => {
  const releases = new Map();
  const h = previewHarness({ load: reference => new Promise(resolve => releases.set(reference.id, resolve)) });
  h.preview.open('old', ref('old'), { row: {} });
  await until(() => releases.has('old'), 'old not started');
  h.preview.open('new', ref('new'), { row: {} });
  await until(() => releases.has('new'), 'new not started');
  releases.get('new')(new Blob(['new'], { type: 'image/png' }));
  await until(() => h.shown.some(s => s.key === 'new' && s.status === 'ready'), 'new not shown');
  releases.get('old')(new Blob(['old'], { type: 'image/png' }));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.preview.cache.entries.size, 1);
  assert.equal(h.preview.cache.get('old'), null);
  assert.equal(h.shown.at(-1).key, 'new');
  h.preview.close(); h.preview.cache.clear();
});

test('큰 미리보기는 같은 계정·파일 연결의 최근 이미지를 재사용한다', async () => {
  let calls = 0;
  const h = previewHarness({ load: async () => { calls++; return new Blob(['image'], { type: 'image/png' }); } });
  const row = {};
  h.preview.open('account-a/file-one', ref('one'), { row });
  await until(() => h.shown.some(s => s.status === 'ready'), 'preview not shown');
  const first = h.shown.at(-1).url;
  h.preview.close();
  h.preview.open('account-a/file-one', ref('one'), { row });
  await until(() => h.shown.filter(s => s.status === 'ready').length === 2, 'cached preview not shown');
  assert.equal(calls, 1);
  assert.equal(h.shown.at(-1).url, first);
  h.preview.open('account-b/file-one', ref('one'), { row });
  await until(() => calls === 2, 'other account reused preview');
  h.preview.close(); h.preview.cache.clear();
});

test('메뉴 종료나 계정 변경 뒤 도착한 큰 이미지는 표시하지 않는다', async () => {
  let valid = true, release;
  const h = previewHarness({ current: () => valid, load: () => new Promise(resolve => { release = resolve; }) });
  h.preview.open('one', ref('one'), { row: {} });
  await until(() => release, 'preview not requested');
  valid = false;
  release(new Blob(['image'], { type: 'image/png' }));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.shown.some(s => s.status === 'ready'), false);
  assert.equal(h.preview.cache.entries.size, 0);
  h.preview.close();
});

test('큰 미리보기 로딩 실패는 오류로 표시하고 재진입 때 다시 시도한다', async () => {
  let calls = 0;
  const h = previewHarness({ load: async () => { calls++; throw new Error('failed'); } });
  const row = {};
  h.preview.open('one', ref('one'), { row });
  await until(() => h.shown.at(-1)?.status === 'error', 'error not shown');
  h.preview.close(); h.preview.open('one', ref('one'), { row });
  await until(() => calls === 2, 'retry not started');
  h.preview.close();
});

function diskPreviewHarness({ database, commit, ...options } = {}) {
  database ||= mockDatabase({ commit });
  const h = cacheWorkerHarness({ pages: new Map(), database });
  let scope = 'scope-a', nextUrl = 0;
  const revoked = [];
  const cacheOptions = { scope: () => scope, resize: async blob => ({ blob, width: 1, height: 1 }), urls: {
    createObjectURL: () => 'blob:disk-test-' + ++nextUrl, revokeObjectURL: url => revoked.push(url),
  }, ...options, diskLimit: options.diskLimit ?? options.limit ?? CONFIG.hoverDiskEntries,
    diskMaxBytes: options.diskMaxBytes ?? options.maxBytes ?? CONFIG.hoverDiskBytes };
  const cache = new PersistentPreviewCache(h.cache.storage, cacheOptions);
  const key = (name, owner = 'scope-a') => JSON.stringify([owner, name, 'sediment://file_' + name, null]);
  return { ...h, cache, database, cacheOptions, key, revoked, setScope(value) { scope = value; cache.clear(); } };
}

test('원본 이미지 요청은 공유하고 한 소비자 취소가 다른 소비자를 끊지 않는다', async () => {
  const shared = new SharedImages();
  let release, rootSignal, calls = 0;
  const load = signal => { calls++; rootSignal = signal; return new Promise(resolve => { release = () => resolve(new Response('original', {headers:{'content-type':'image/png'}})); }); };
  const controller = new AbortController();
  const cancelled = assert.rejects(shared.get('file', load, controller.signal), {name:'AbortError'});
  const retained = shared.get('file', load);
  await until(() => release, 'shared source not started');
  controller.abort(); await cancelled;
  assert.equal(rootSignal.aborted, false);
  release(); assert.equal(await (await retained).text(), 'original');
  assert.equal(await (await shared.get('file', load)).text(), 'original');
  assert.equal(calls, 1); shared.clear(); assert.equal(shared.bytes, 0);
});

test('일시적 원본 공유는 개수·용량·짧은 만료를 지키며 실패 응답은 재사용하지 않는다', async () => {
  const shared = new SharedImages({limit:1,maxBytes:4,lifetime:10});
  const load = async () => new Response('abc', {headers:{'content-type':'image/png'}});
  await shared.get('one',load); await shared.get('two',load);
  assert.equal(shared.entries.has('one'),false); assert.equal(shared.bytes,3);
  await new Promise(resolve=>setTimeout(resolve,20));
  assert.equal(shared.entries.size,0); assert.equal(shared.bytes,0);
  let failures=0;
  const fail=async()=>{failures++;return new Response('error',{status:500});};
  await shared.get('bad',fail); await shared.get('bad',fail);
  assert.equal(failures,2); shared.clear();
});

function previewLoaderHarness({load, queue = new DownloadQueue(2,1), ...options}={}) {
  const h=diskPreviewHarness(options);
  const loader=new PreviewLoader({cache:h.cache,queue,load,scope:h.cacheOptions.scope});
  const transport={scope:'scope-a'};
  const register=items=>{for(const item of items)loader.register('scope-a',item,transport);};
  return {...h,loader,transport,register};
}

test('큰 미리보기는 보이는 항목을 우선하고 팝업 대기가 취소돼도 모든 백그라운드 작업을 마친다',async()=>{
  const holds=new Map(), order=[];
  const h=previewLoaderHarness({load:(reference,transport,signal)=>new Promise(resolve=>{
    order.push(reference.id);holds.set(reference.id,{signal,release:()=>resolve(new Response('image',{headers:{'content-type':'image/png'}}))});
  })});
  const items=['one','two','visible'].map(ref);
  h.loader.setVisible(['visible']); h.register(items); h.loader.finish('scope-a',items);
  try {
    await until(()=>holds.has('visible'),'visible preview did not start');
    assert.deepEqual(order,['one','visible']);
    holds.get('visible').release();
    await until(()=>h.loader.inventory.summary().ready===1,'visible preview did not commit');
    assert.equal(h.loader.inventory.items.get('one').status,'pending');
    const controller=new AbortController();
    const cancelled=assert.rejects(h.loader.request(items[1],h.transport,controller.signal),{name:'AbortError'});
    await until(()=>holds.has('two'),'requested preview did not get priority');
    controller.abort();await cancelled;
    assert.equal(holds.get('two').signal.aborted,false);
    h.loader.setVisible([]);holds.get('one').release();holds.get('two').release();
    await until(()=>h.loader.inventory.summary().complete,'hidden previews did not finish');
    assert.equal(h.database.stores.get('previews').size,3);
    assert.equal(h.cache.entries.size,0,'prefetch must not fill the object-URL memory cache');
    assert.equal(order.filter(id=>id==='two').length,1,'popup and prefetch share one job');
  } finally {h.loader.reset();h.cache.clear();for(const job of holds.values())job.release();}
});

test('큰 미리보기는 페이지 수신 즉시 시작하고 디스크 커밋 전에는 완료로 세지 않는다',async()=>{
  let releaseCommit,loads=0;
  const h=previewLoaderHarness({load:async()=>{loads++;return new Response('image',{headers:{'content-type':'image/png'}});},
    commit:async(store,mode)=>{if(store==='previews'&&mode==='readwrite'&&!releaseCommit)await new Promise(resolve=>{releaseCommit=resolve;});}});
  const item=ref('one');h.register([item]);
  await until(()=>releaseCommit,'first page preview did not reach storage');
  assert.equal(loads,1);assert.equal(h.loader.inventory.summary().total,null);
  assert.equal(h.loader.inventory.summary().ready,0);
  h.loader.finish('scope-a',[item]);releaseCommit();
  await until(()=>h.loader.inventory.summary().complete,'preview did not commit');
  h.loader.reset();h.cache.clear();
});

test('전체 목록의 큰 미리보기는 기존 디스크 한도를 넘어도 보호하고 삭제된 참조는 보호에서 뺀다',async()=>{
  const h=previewLoaderHarness({diskLimit:1,diskMaxBytes:3,load:async()=>new Response('abc',{headers:{'content-type':'image/png'}})});
  const items=['one','two','three'].map(ref);h.register(items);h.loader.finish('scope-a',items);
  await until(()=>h.loader.inventory.summary().complete,'protected previews did not finish');
  assert.equal(h.database.stores.get('previews').size,3,'keep the whole current catalog');
  h.loader.finish('scope-a',items.slice(0,2));await h.cache.prune();
  assert.equal(h.database.stores.get('previews').size,2);
  assert.equal(h.loader.inventory.summary().total,2);
  h.loader.reset();h.cache.clear();
});

test('큰 미리보기 저장소 실패는 추가 전송을 중단하고 시도하지 않은 항목은 대기로 유지한다',async()=>{
  let loads=0;
  const h=previewLoaderHarness({load:async()=>{loads++;return new Response('image',{headers:{'content-type':'image/png'}});},
    commit:(store,mode)=>{if(store==='previews'&&mode==='readwrite')throw new DOMException('Quota','QuotaExceededError');}});
  const items=['one','two','three','four'].map(ref);h.register(items);h.loader.finish('scope-a',items);
  await until(()=>h.loader.paused&&h.loader.tasks.size===0,'storage failure did not stop work');
  const progress=h.loader.inventory.summary();
  assert.equal(progress.ready,0);assert.equal(progress.failed,1);assert.equal(progress.pending,3);
  const before=loads;h.register([ref('five')]);await new Promise(resolve=>setImmediate(resolve));
  assert.equal(loads,before);assert.equal(h.loader.inventory.summary().failed,1);assert.equal(h.loader.inventory.summary().pending,4);
  h.loader.reset();h.cache.clear();
});

test('큰 미리보기 작업은 계정 전환 시 취소되고 이전 응답을 저장하지 않는다',async()=>{
  let release,signal;
  const h=previewLoaderHarness({load:(reference,transport,s)=>{signal=s;return new Promise(resolve=>{release=()=>resolve(new Response('old',{headers:{'content-type':'image/png'}}));});}});
  h.register([ref('one')]);await until(()=>release,'preview did not start');
  h.setScope('scope-b');h.loader.reset();assert.equal(signal.aborted,true);release();
  await new Promise(resolve=>setImmediate(resolve));await h.cache.pending;
  assert.equal(h.database.stores.get('previews').size,0);
  assert.equal(h.loader.inventory.summary().discovered,0);h.cache.clear();
});

test('큰 미리보기 진행 아이콘은 성공/실패/전체 묶음과 일시중단을 표시한다',()=>{
  const progress={total:5,discovered:5,ready:5,pending:0,failed:0};
  const model=referenceStatus({progress,locale:'ko',previewProgress:{total:5,discovered:5,ready:3,pending:1,failed:1},previewCaching:true});
  const image=model.tokens.find(token=>token.icon==='image');
  assert.equal(image.value,'3/1/5');assert.equal(image.busy,true);assert.match(model.detail,/큰 미리보기 확인 5 · 큰 미리보기 대기 1/);
  const paused=referenceStatus({progress,previewProgress:{total:5,discovered:5,ready:3,pending:0,failed:2},previewCaching:true,previewPaused:true});
  assert.equal(paused.tokens.find(token=>token.icon==='image').error,true);
  assert.equal(paused.tokens.find(token=>token.icon==='image').busy,false);
});

test('큰 미리보기 축소는 전체 원본을 medium으로 처리하고 저장용 Blob을 두 상한 안에 만든다', async () => {
  for (const [sourceWidth, sourceHeight, width, height] of [[600,800,255,340], [1200,600,480,240], [200,2400,28,340], [2400,100,480,20]]) {
    let closed = false, drawn, encoded;
    const bitmap = { width: sourceWidth, height: sourceHeight, close() { closed = true; } };
    const context = { drawImage(...args) { drawn = args; } };
    const output = new Blob(['scaled'], { type: 'image/webp' });
    const canvas = { getContext: () => context, toBlob(callback, type, quality) { encoded = { type, quality }; callback(output); } };
    const result = await resizePreview(new Blob(['original'], { type: 'image/png' }), {
      decode: async () => bitmap, createCanvas: () => canvas,
    });
    assert.equal(canvas.width, width); assert.equal(canvas.height, height);
    assert.deepEqual(drawn, [bitmap, 0, 0, width, height], 'draw the whole image without a crop rectangle');
    assert.equal(context.imageSmoothingEnabled, true); assert.equal(context.imageSmoothingQuality, 'medium');
    assert.deepEqual(encoded, { type: 'image/webp', quality: 0.8 });
    assert.equal(result.blob, output); assert.equal(result.width, width); assert.equal(result.height, height);
    assert.equal(closed, true);
  }
  let closed = false;
  const small = new Blob(['small'], { type: 'image/png' });
  const kept = await resizePreview(small, { decode: async () => ({ width: 100, height: 80, close() { closed = true; } }),
    createCanvas() { throw new Error('small originals must not be upscaled or re-encoded'); } });
  assert.equal(kept.blob, small); assert.equal(kept.width, 100); assert.equal(kept.height, 80); assert.equal(closed, true);
});

test('큰 미리보기 인코딩 실패 때 디코딩한 비트맵을 해제한다', async () => {
  let closed = false;
  await assert.rejects(resizePreview(new Blob(['image']), {
    decode: async () => ({ width: 600, height: 800, close() { closed = true; } }),
    createCanvas: () => ({ getContext: () => ({ drawImage() {} }), toBlob: callback => callback(null) }),
  }), /encoding failed/);
  assert.equal(closed, true);
});

test('기존 원본 캐시는 한 번 변환해 교체하고 저장 시각·30일 만료를 연장하지 않는다', async () => {
  let resized = 0;
  const h = diskPreviewHarness({ resize: async () => { resized++; return { blob: new Blob(['scaled'], { type: 'image/webp' }), width: 255, height: 340 }; } });
  const key = h.key('legacy'), savedAt = Date.now() - 10000;
  await h.cache.storage.put('previews', { key, scope: 'scope-a', savedAt, accessedAt: savedAt,
    blob: new Blob(['original-large'], { type: 'image/png' }) });
  assert.ok(await h.cache.get(key)); await h.cache.pending;
  const record = h.database.stores.get('previews').get(key);
  assert.equal(await record.blob.text(), 'scaled');
  assert.equal(record.savedAt, savedAt); assert.equal(record.width, 255); assert.equal(record.height, 340);
  assert.match(record.processing, /480x340-medium/);
  h.cache.clear(); assert.ok(await h.cache.get(key));
  assert.equal(resized, 1, 'do not repeatedly resize and recompress a processed cache hit');
  h.cache.clear();
});

test('축소 처리 중 커서 이탈이나 계정 변경이 생기면 새 이미지를 캐시에 저장하지 않는다', async () => {
  for (const change of ['cancel', 'account']) {
    let release;
    const h = diskPreviewHarness({ resize: blob => new Promise(resolve => { release = () => resolve({ blob, width: 1, height: 1 }); }) });
    const controller = new AbortController();
    const rejected = assert.rejects(h.cache.put(h.key('one'), new Blob(['image'], { type: 'image/png' }), undefined, controller.signal), { name: 'AbortError' });
    await until(() => release, 'resize not started');
    if (change === 'cancel') controller.abort(); else h.setScope('scope-b');
    release(); await rejected; await h.cache.pending;
    assert.equal(h.cache.entries.size, 0); assert.equal(h.database.stores.get('previews').size, 0);
    h.cache.clear();
  }
});

test('기존 미리보기 디코딩 실패는 손상 레코드를 제거해 다음 수신 경로로 넘긴다', async () => {
  const h = diskPreviewHarness({ resize: async () => { throw new Error('decode failed'); } });
  const key = h.key('broken'), savedAt = Date.now();
  await h.cache.storage.put('previews', { key, scope: 'scope-a', savedAt, accessedAt: savedAt,
    blob: new Blob(['broken'], { type: 'image/png' }) });
  assert.equal(await h.cache.get(key), null); await h.cache.pending;
  assert.equal(h.database.stores.get('previews').has(key), false);
  assert.equal(h.cache.entries.size, 0); h.cache.clear();
});

test('늦게 끝난 이전 축소가 더 최신 이미지의 캐시를 덮어쓰지 않는다', async () => {
  let release;
  const h = diskPreviewHarness({ resize: async blob => {
    if (await blob.text() === 'old') await new Promise(resolve => { release = resolve; });
    return { blob, width: 1, height: 1 };
  } });
  const key = h.key('one');
  const old = assert.rejects(h.cache.put(key, new Blob(['old'], { type: 'image/png' })), { name: 'AbortError' });
  await until(() => release, 'old resize not started');
  await h.cache.put(key, new Blob(['new'], { type: 'image/png' }));
  release(); await old; await h.cache.pending;
  assert.equal(await h.database.stores.get('previews').get(key).blob.text(), 'new');
  h.cache.clear();
});

test('큰 미리보기 Blob은 새 탭의 저장소 연결에서도 복원하며 표시 URL 자체는 저장하지 않는다', async () => {
  const h = diskPreviewHarness();
  const key = h.key('one'), blob = new Blob(['original-image'], { type: 'image/png' });
  const first = await h.cache.put(key, blob);
  await h.cache.pending;
  const record = h.database.stores.get('previews').get(key);
  assert.equal(await record.blob.text(), 'original-image');
  assert.equal('url' in record, false);
  assert.equal(record.scope, 'scope-a');
  h.cache.clear();
  const tab = cacheWorkerHarness({ pages: new Map(), database: h.database });
  const restored = new PersistentPreviewCache(tab.cache.storage, h.cacheOptions);
  assert.equal(restored.entries.size, 0);
  const url = await restored.get(key);
  assert.notEqual(url, first, 'object URLs belong to each document');
  assert.equal(restored.entries.size, 1);
  assert.equal(await restored.get(h.key('other-pointer')), null);
  assert.equal(await restored.get(h.key('one', 'scope-b')), null);
  restored.clear();
});

test('큰 미리보기 DB 업그레이드는 기존 목록·썸네일 레코드를 보존한다', async () => {
  const database = mockDatabase();
  await new Promise(resolve => {
    const request = database.open('chatgpt-reference-menu-fast-v1', 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('catalogs'); request.result.createObjectStore('thumbnails');
    };
    request.onsuccess = resolve;
  });
  database.stores.get('catalogs').set('legacy', { key: 'legacy', data: 'catalog' });
  database.stores.get('thumbnails').set('legacy', { key: 'legacy', data: 'thumbnail' });
  const h = diskPreviewHarness({ database });
  assert.equal((await h.cache.storage.get('catalogs', 'legacy')).data, 'catalog');
  assert.equal((await h.cache.storage.get('thumbnails', 'legacy')).data, 'thumbnail');
  assert.equal(database.stores.has('previews'), true);
});

test('디스크 미리보기 복원은 저장 시각을 유지하며 메모리를 지워도 디스크는 보존한다', async () => {
  let time = 100000;
  const h = diskPreviewHarness({ now: () => time, lifetime: 50 });
  const key = h.key('one');
  await h.cache.put(key, new Blob(['image'], { type: 'image/png' })); await h.cache.pending;
  h.cache.clear(); time += 30;
  assert.ok(await h.cache.get(key));
  assert.equal(h.cache.entries.get(key).savedAt, 100000, 'reading must not extend the expiry');
  time += 21;
  assert.equal(await h.cache.get(key), null);
  await h.cache.pending;
  assert.equal(h.database.stores.get('previews').has(key), false);
  h.cache.clear();
});

test('디스크 미리보기는 최근 사용·개수·합산 바이트·만료 한도를 지킨다', async () => {
  let time = 100000;
  const h = diskPreviewHarness({ now: () => time, lifetime: 500000, limit: 2, maxBytes: 8 });
  const put = async name => { await h.cache.put(h.key(name), new Blob(['abc'], { type: 'image/webp' })); await h.cache.pending; };
  await put('one'); time++; await put('two');
  time += 60001; await h.cache.get(h.key('one')); await h.cache.accessWrites.flush();
  time++; await put('three');
  const records = h.database.stores.get('previews');
  assert.equal(records.has(h.key('one')), true);
  assert.equal(records.has(h.key('two')), false, 'evict the less recently accessed record');
  assert.equal(records.size, 2);
  const smaller = new PersistentPreviewCache(h.cache.storage, { ...h.cacheOptions, maxBytes: 5, limit: 10, diskMaxBytes: 5, diskLimit: 10 });
  await smaller.prune();
  assert.equal([...records.values()].reduce((sum, record) => sum + record.blob.size, 0), 3);
  time += 500001; await smaller.prune();
  assert.equal(records.size, 0);
  await assert.rejects(smaller.put(h.key('large'), new Blob(['123456'], { type: 'image/png' })), /Invalid/);
  h.cache.clear(); smaller.clear();
});

test('계정을 바꾸는 동안 완료된 디스크 읽기는 이전 계정 이미지를 메모리에 되살리지 않는다', async () => {
  let release;
  const h = diskPreviewHarness({ commit: async (store, mode) => {
    if (store === 'previews' && mode === 'readonly') await new Promise(resolve => { release = resolve; });
  } });
  const key = h.key('one');
  await h.cache.put(key, new Blob(['image'], { type: 'image/png' })); await h.cache.pending; h.cache.clear();
  const reading = h.cache.get(key);
  await until(() => release, 'disk read not started');
  h.setScope('scope-b'); release();
  assert.equal(await reading, null);
  assert.equal(h.cache.entries.size, 0);
  assert.equal(await h.cache.get(key), null);
  assert.equal(h.database.stores.get('previews').has(key), true, 'other account cache remains isolated on disk');
});

test('같은 디스크 읽기는 공유하되 한 미리보기의 취소는 다른 대기를 취소하지 않는다', async () => {
  let release, reads = 0;
  const h = diskPreviewHarness({ commit: async (store, mode) => {
    if (store === 'previews' && mode === 'readonly') { reads++; await new Promise(resolve => { release = resolve; }); }
  } });
  const key = h.key('one');
  await h.cache.put(key, new Blob(['image'], { type: 'image/png' })); await h.cache.pending; h.cache.clear();
  const controller = new AbortController();
  const cancelled = assert.rejects(h.cache.get(key, controller.signal), { name: 'AbortError' });
  const retained = h.cache.get(key);
  await until(() => release, 'disk read not started');
  controller.abort(); await cancelled; release();
  assert.ok(await retained); assert.equal(reads, 1);
  h.cache.clear();
});

test('큰 미리보기 저장이 실패해도 이미 받은 이미지는 메모리에서 재사용한다', async () => {
  const h = diskPreviewHarness({ commit: (store, mode) => {
    if (store === 'previews' && mode === 'readwrite') throw new DOMException('Quota', 'QuotaExceededError');
  } });
  const key = h.key('one');
  const url = await h.cache.put(key, new Blob(['image'], { type: 'image/png' }));
  assert.equal(typeof url, 'string', 'display must not wait for disk persistence');
  await h.cache.pending;
  assert.equal(await h.cache.get(key), url);
  assert.equal(h.database.stores.get('previews').size, 0);
  assert.equal(h.status().cacheStorageError.operation, 'previews:readwrite');
  h.cache.clear();
});

test('표시에 실패한 큰 미리보기를 삭제하면 예약된 저장 뒤에도 디스크에 남지 않는다', async () => {
  let release;
  const h = diskPreviewHarness({ commit: async (store, mode) => {
    if (!release && store === 'previews' && mode === 'readwrite') await new Promise(resolve => { release = resolve; });
  } });
  const key = h.key('one');
  await h.cache.put(key, new Blob(['bad-image'], { type: 'image/png' }));
  await until(() => release, 'write not started');
  h.cache.delete(key);
  assert.equal(await h.cache.get(key), null, 'invalidated images must not be restored while deletion waits');
  release(); await h.cache.pending;
  assert.equal(h.database.stores.get('previews').has(key), false);
  h.cache.clear();
});

test('큰 미리보기 캐시는 개수·바이트·만료 한도를 지키고 객체 URL을 해제한다', () => {
  let time = 0, counter = 0;
  const revoked = [];
  const cache = new PreviewCache({ limit: 2, maxBytes: 8, lifetime: 50, now: () => time,
    urls: { createObjectURL: () => 'blob:' + ++counter, revokeObjectURL: url => revoked.push(url) } });
  const blob = new Blob(['abc']);
  cache.put('one', blob); cache.put('two', blob);
  cache.get('one'); cache.put('three', blob);
  assert.equal(cache.get('two'), null, 'evict least recently used');
  assert.deepEqual(revoked, ['blob:2']);
  cache.put('large', new Blob(['1234567']));
  assert.equal(cache.entries.size, 1, 'enforce byte budget');
  assert.equal(cache.bytes, 7);
  assert.throws(() => cache.put('too-large', new Blob(['123456789'])));
  time = 50;
  assert.equal(cache.get('large'), null);
  assert.equal(cache.bytes, 0);
  assert.equal(revoked.length, 4);
  cache.put('last', blob); cache.clear();
  assert.equal(cache.entries.size, 0);
  assert.equal(revoked.length, 5);
});

test('미리보기 이미지 영역은 세로·가로·극단 비율과 작은 화면에서 비율을 유지하며 두 상한 안에 들어간다', () => {
  const viewport = { width: 1200, height: 800 };
  assert.deepEqual(previewImageSize(600, 800, viewport), { width: 255, height: 340 });
  assert.deepEqual(previewImageSize(1200, 600, viewport), { width: 480, height: 240 });
  assert.deepEqual(previewImageSize(100, 80, viewport), { width: 100, height: 80 }, 'do not upscale small originals');
  for (const [width, height] of [[2400, 100], [100, 2400], [600, 800], [1200, 600]]) {
    for (const screen of [viewport, { width: 240, height: 260 }]) {
      const size = previewImageSize(width, height, screen);
      assert.ok(size.width <= 480 && size.width <= screen.width - 38 + 1e-9);
      assert.ok(size.height <= 340 && size.height <= screen.height - 110 + 1e-9);
      assert.ok(Math.abs(size.width / size.height - width / height) < 1e-9);
    }
  }
  assert.equal(previewImageSize(0, 100, viewport), null);
});

test('디스크 미리보기는 RAM 퇴출 뒤에도 더 많은 이미지를 보관하고 다시 복원한다', async () => {
  const h = diskPreviewHarness({ limit: 1, maxBytes: 4, diskLimit: 3, diskMaxBytes: 9 });
  for (const name of ['one', 'two', 'three']) {
    await h.cache.put(h.key(name), new Blob(['abc'], { type: 'image/png' })); await h.cache.pending;
  }
  assert.equal(h.cache.entries.size, 1);
  assert.equal(h.cache.bytes, 3);
  assert.equal(h.database.stores.get('previews').size, 3);
  assert.ok(await h.cache.get(h.key('one')));
  assert.equal(h.cache.entries.size, 1);
  assert.equal(h.cache.entries.has(h.key('one')), true);
  h.cache.clear();
});

test('큰 미리보기는 기존 5분보다 오래 보관하고 저장 후 썸네일과 같은 30일에 만료된다', async () => {
  let time = 100000;
  const h = diskPreviewHarness({ now: () => time });
  const key = h.key('one');
  await h.cache.put(key, new Blob(['image'], { type: 'image/png' })); await h.cache.pending;
  h.cache.clear(); time += 29 * 24 * 60 * 60 * 1000;
  assert.ok(await h.cache.get(key), '29-day-old disk data remains valid');
  await h.cache.accessWrites.flush();
  assert.equal(h.database.stores.get('previews').get(key).savedAt, 100000);
  time += 24 * 60 * 60 * 1000;
  assert.equal(await h.cache.get(key), null);
  await h.cache.pending;
  assert.equal(h.database.stores.get('previews').has(key), false);
  h.cache.clear();
});

test('큰 미리보기는 목록 좌우 여백을 골라 화면 아래·오른쪽을 벗어나지 않는다', () => {
  const panel = { width: 320, height: 450 }, viewport = { width: 1200, height: 800 };
  assert.deepEqual(previewPosition({ top: 600 }, { left: 10, right: 500 }, panel, viewport), { left: 510, top: 342 });
  assert.deepEqual(previewPosition({ top: -30 }, { left: 700, right: 1150 }, panel, viewport), { left: 370, top: 8 });
  assert.deepEqual(previewPosition({ top: 10 }, { left: 20, right: 340 }, { width: 344, height: 450 }, { width: 360, height: 500 }), { left: 8, top: 10 });
});

test('커서 팝업은 16px 떨어져 표시하고 화면 끝에서는 좌우·상하를 뒤집는다', () => {
  const row = { top: 50 }, menu = { left: 20, right: 500 };
  const panel = { width: 320, height: 450 }, viewport = { width: 1200, height: 800 };
  assert.deepEqual(previewPosition(row, menu, panel, viewport, { x: 400, y: 100 }), { left: 416, top: 116 });
  assert.deepEqual(previewPosition(row, menu, panel, viewport, { x: 1100, y: 700 }), { left: 764, top: 234 });
  assert.deepEqual(previewPosition(row, menu, panel, viewport, { x: 400, y: 700 }), { left: 416, top: 234 });
  assert.deepEqual(previewPosition(row, menu, panel, { width: 360, height: 500 }, { x: 150, y: 250 }), { left: 8, top: 8 });
});

test('검색은 유니코드를 정규화하고 모든 단어를 찾는다', () => {
  assert.equal(matchesSearch('R001__샘플-이미지__앞면', 'r001 샘플'), true);
  assert.equal(matchesSearch('R001__샘플-이미지__앞면', 'r080 샘플'), false);
  assert.equal(matchesSearch('R001__샘플-이미지__앞면', ''), true);
});

test('계정 또는 사용자를 확인하지 못하면 캐시 범위를 만들지 않는다', () => {
  assert.equal(scopeKey(null, 'workspace'), null);
  assert.equal(scopeKey('user', null), null);
  assert.notEqual(scopeKey('one', 'workspace'), scopeKey('two', 'workspace'));
  assert.notEqual(scopeKey('user', 'one'), scopeKey('user', 'two'));
});

test('서버 응답의 소유자가 혼합돼 있으면 캐시 사용자로 사용하지 않는다', () => {
  assert.equal(verifiedOwner([{ id: 'AccountUserId_one~refimage_x' }]), 'AccountUserId_one');
  assert.equal(verifiedOwner([{ id: 'AccountUserId_one~refimage_x' }, { id: 'AccountUserId_two~refimage_y' }]), null);
  assert.equal(verifiedOwner([{ id: 'unscoped' }]), null);
});

test('원격 URL을 저장하지 않고 안정적인 포인터를 보관한다', () => {
  const result = cleanReference({ ...ref('R001'), content_url: 'https://example.test/temporary?secret=x', thumbnail_url: 'https://example.test/temporary' });
  assert.equal(result.content_url, null);
  assert.equal(result.thumbnail_url, null);
  assert.equal(result.asset_pointer, 'sediment://file_R001');
  assert.equal(cleanReference({ id: 'broken', entity_name: 'broken' }), null);
});

test('콘텐츠 URL의 파일 ID만 인식한다', () => {
  assert.equal(contentKey(new URL('https://chatgpt.com/backend-api/estuary/content?id=file_abc&sig=private')), 'file_abc');
  assert.equal(contentKey(new URL('https://chatgpt.com/backend-api/estuary/content?unrelated=file_abc')), null);
});

test('만료 시각과 미래 시각 캐시는 신선한 데이터로 취급하지 않는다', () => {
  assert.equal(fresh({ savedAt: 50 }, 50, 99), true);
  assert.equal(fresh({ savedAt: 50 }, 50, 100), false);
  assert.equal(fresh({ savedAt: 101 }, 50, 100), false);
});

test('캐시 썸네일은 작은 이미지 데이터 URL만 허용한다', () => {
  assert.equal(validThumbnail({ dataUrl: 'data:image/webp;base64,YWJj' }), true);
  assert.equal(validThumbnail({ dataUrl: 'https://external.test/image.png' }), false);
  assert.equal(validThumbnail({ dataUrl: 'data:text/html;base64,YWJj' }), false);
  assert.equal(validThumbnail({ dataUrl: 'data:image/webp;base64,' + 'a'.repeat(40000) }), false);
});

test('목록 세션은 커서 순서대로 페이지를 모으고 잘못된 응답 페이지는 저장하지 않는다', async () => {
  const one = { ...ref('one'), id: 'AccountUserId_user~refimage_one' }, two = { ...ref('two'), id: 'AccountUserId_user~refimage_two' };
  const bodies = new Map([[null, { items: [one], next_cursor: 'next' }], ['next', { items: [two], next_cursor: null }]]);
  const session = new CatalogSession({ owner: 'AccountUserId_user', request: async cursor => new Response(JSON.stringify(bodies.get(cursor))),
    onPage: async () => {}, onComplete: async () => {} });
  const pages = await session.start();
  assert.deepEqual(pages.map(page => [page.cursor, page.items[0].id, page.next_cursor]),
    [[null, one.id, 'next'], ['next', two.id, null]]);
  let requests = 0;
  const broken = new CatalogSession({ request: async () => { requests++; return new Response(JSON.stringify({ items: [{ id: 'broken' }], next_cursor: null })); },
    onPage: async () => assert.fail('an invalid page must not be delivered'), onComplete: async () => {} });
  await assert.rejects(broken.start(), /Invalid reference catalog page/);
  assert.equal(broken.pages.size, 0);
  assert.equal(requests, 1, 'an invalid schema is not retried');
});

test('다운로드 동시 실행 제한과 대기 중 취소를 지킨다', async () => {
  const queue = new DownloadQueue(1);
  let release;
  const first = queue.run(() => new Promise(resolve => { release = resolve; }));
  await new Promise(resolve => setImmediate(resolve));
  const controller = new AbortController();
  let ran = false;
  const cancelled = queue.run(() => { ran = true; }, controller.signal);
  controller.abort();
  await assert.rejects(cancelled, { name: 'AbortError' });
  const third = queue.run(() => 'last');
  release('first');
  assert.equal(await first, 'first');
  assert.equal(await third, 'last');
  assert.equal(ran, false);
});

test('목록 캐시 전체를 한 응답으로 전달해 다음 커서 왕복을 없앤다', () => {
  const result = catalogBody({ pages: [
    { items: [ref('one')], next_cursor: 'next' },
    { items: [ref('two')], next_cursor: null },
  ] });
  assert.deepEqual(result.items.map(item => item.id), ['one', 'two']);
  assert.equal(result.next_cursor, null);
});

test('화면 밖 대기 작업보다 화면 안 작업을 먼저 시작한다', async () => {
  const queue = new DownloadQueue(1, 1);
  const order = [];
  let release;
  const first = queue.run(() => new Promise(resolve => { release = resolve; }), undefined, () => false);
  await new Promise(resolve => setImmediate(resolve));
  const background = queue.run(() => order.push('background'), undefined, () => false);
  const foreground = queue.run(() => order.push('foreground'), undefined, () => true);
  release();
  await Promise.all([first, background, foreground]);
  assert.deepEqual(order, ['foreground', 'background']);
});

test('백그라운드 작업 수를 제한하면서 화면 안 작업용 여유를 둔다', async () => {
  const queue = new DownloadQueue(3, 1);
  const releases = [];
  let backgroundStarted = 0;
  const background = Array.from({ length: 3 }, () => queue.run(() => {
    backgroundStarted += 1;
    return new Promise(resolve => releases.push(resolve));
  }, undefined, () => false));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(backgroundStarted, 1);
  assert.equal(await queue.run(() => 'visible', undefined, () => true), 'visible');
  for (let i = 0; i < 3; i++) {
    releases[i]();
    await new Promise(resolve => setImmediate(resolve));
  }
  await Promise.all(background);
  assert.equal(backgroundStarted, 3);
});

test('스크롤로 우선순위가 바뀌면 다음 작업 선택에 반영한다', async () => {
  const queue = new DownloadQueue(1, 1);
  let release;
  const first = queue.run(() => new Promise(resolve => { release = resolve; }));
  await new Promise(resolve => setImmediate(resolve));
  let visible = 'old';
  const order = [];
  const old = queue.run(() => order.push('old'), undefined, () => visible === 'old');
  const next = queue.run(() => order.push('new'), undefined, () => visible === 'new');
  visible = 'new';
  release();
  await Promise.all([first, old, next]);
  assert.deepEqual(order, ['new', 'old']);
});

test('메뉴 요청 취소와 백그라운드 다운로드의 취소를 분리한다', async () => {
  const menu = new AbortController();
  const cache = new AbortController();
  const request = new Request('data:text/plain,thumbnail', { signal: menu.signal });
  const download = detachedDownload(fetch, request, { signal: menu.signal });
  menu.abort();
  assert.equal(await (await download(cache.signal)).text(), 'thumbnail');
  cache.abort();
  await assert.rejects(download(cache.signal), { name: 'AbortError' });
});

function mockDatabase(hooks = {}) {
  const stores = new Map();
  let schemaVersion = 0;
  const db = {
    close() {},
    createObjectStore(name) {
      if (stores.has(name)) throw new Error('Object store already exists');
      stores.set(name, new Map()); return { createIndex() {} };
    },
    transaction(name, mode) {
      const table = stores.get(name);
      const writes = [];
      const tx = { abort() {
        tx.aborted = true;
        tx.error = new DOMException('Aborted', 'AbortError');
        queueMicrotask(() => tx.onabort?.());
      }, objectStore: () => ({
        get: key => {
          const request = { result: table.get(key) };
          queueMicrotask(() => { if (!tx.aborted) request.onsuccess?.(); });
          return request;
        },
        getAll: () => {
          const request = { result: [...table.values()] };
          queueMicrotask(() => { if (!tx.aborted) request.onsuccess?.(); });
          return request;
        },
        put: record => { writes.push(() => table.set(record.key, structuredClone(record))); return { result: record.key }; },
        delete: key => { writes.push(() => table.delete(key)); return {}; },
      }) };
      queueMicrotask(async () => {
        try {
          await hooks.commit?.(name, mode);
          if (tx.aborted) return;
          for (const write of writes) write();
          tx.oncomplete?.();
        }
        catch (error) { tx.error = error; tx.onerror?.(); }
      });
      return tx;
    },
  };
  return { stores, open(name, version = 1) {
    const request = { result: db };
    queueMicrotask(() => {
      if (version > schemaVersion) {
        const oldVersion = schemaVersion; schemaVersion = version;
        request.onupgradeneeded?.({ oldVersion });
      }
      request.onsuccess?.();
    });
    return request;
  } };
}

test('실제 fetch 래퍼가 재열기 캐시를 먼저 반환하고 백그라운드 갱신·계정 전환을 구분한다', async () => {
  const calls = [];
  const { window } = loadRuntime({ fetch: async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input);
    if (url.pathname !== '/backend-api/files/library/reference-images') return new Response('{}', { status: 404 });
    const account = new Headers(init?.headers).get('ChatGPT-Account-ID');
    calls.push([url.searchParams.get('cursor'), account, init?.method || 'GET']);
    if (init?.method === 'POST') return new Response('{}');
    const next = url.searchParams.has('cursor');
    const item = { ...ref(next ? 'two' : 'one'), id: `AccountUserId_${account}~refimage_${next ? 'two' : 'one'}` };
    return new Response(JSON.stringify({ items: [item], next_cursor: next ? null : 'tail' }));
  } });
  const url = 'https://chatgpt.com/backend-api/files/library/reference-images?limit=50';
  const options = account => ({ headers: { 'ChatGPT-Account-ID': account } });
  await window.fetch(url, options('a'));
  await window.fetch(url + '&cursor=tail', options('a'));
  assert.equal(calls.length, 2);
  const warm = await (await window.fetch(url, options('a'))).json();
  assert.equal(calls.length, 2, 'warm reopen inside 30 minutes must not refresh');
  assert.equal(warm.items.length, 2);
  assert.equal(warm.next_cursor, null);
  await until(() => !window.__referenceMenuFastStatus().backgroundCatalogRefreshes, 'background refresh did not finish');
  const other = await (await window.fetch(url, options('b'))).json();
  assert.equal(calls.filter(([cursor, account]) => cursor === null && account === 'b').length, 1, 'another account must be verified live');
  assert.ok(other.items.every(item => item.id.startsWith('AccountUserId_b~')));
  await window.fetch(url + '&cursor=tail', options('b'));
  await window.fetch(url, { ...options('b'), method: 'POST' });
  await new Promise(resolve => setImmediate(resolve));
  const beforeRefresh = calls.filter(([cursor, , method]) => cursor === null && method === 'GET').length;
  await window.fetch(url, options('b'));
  assert.equal(calls.filter(([cursor, , method]) => cursor === null && method === 'GET').length, beforeRefresh + 1, 'invalidated catalog must be verified live');
});

test('진행률은 참조 ID로 중복을 제거하고 공유 파일은 각 참조의 완료로 센다', () => {
  const inventory = new ThumbnailInventory();
  const one = ref('one');
  const alias = { ...one, id: 'alias' };
  inventory.register([one, one, alias, ref('two')]);
  assert.deepEqual(inventory.summary(), { total: null, discovered: 3, ready: 0, failed: 0, pending: 3, complete: false });
  inventory.mark('file_one', 'ready');
  inventory.mark('file_two', 'failed');
  inventory.finish([one, alias, ref('two')]);
  assert.deepEqual(inventory.summary(), { total: 3, discovered: 3, ready: 2, failed: 1, pending: 0, complete: false });
  inventory.finish([alias]);
  assert.equal(inventory.summary().complete, true);
  inventory.register([{ ...alias, asset_pointer: 'sediment://file_new' }]);
  assert.equal(inventory.summary().ready, 0, 'a changed file invalidates the old completion');
});

test('목록 페이지는 즉시 전달하고 메뉴 대기 취소와 별도로 끝까지 수집한다', async () => {
  const one = { ...ref('one'), id: 'AccountUserId_user~refimage_one' };
  const two = { ...ref('two'), id: 'AccountUserId_user~refimage_two' };
  const calls = [];
  const received = [];
  let releaseTail;
  const session = new CatalogSession({ owner: 'AccountUserId_user',
    request: async cursor => {
      calls.push(cursor);
      if (cursor === null) return new Response(JSON.stringify({ items: [one], next_cursor: 'tail' }));
      return new Promise(resolve => { releaseTail = () => resolve(new Response(JSON.stringify({ items: [two], next_cursor: null }))); });
    }, onPage: items => received.push(items[0].id), onComplete() {} });
  const done = session.start();
  await session.page(null);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(received, [one.id]);
  const menu = new AbortController();
  const nativeWaiting = waitWithSignal(session.page('tail'), menu.signal);
  const rejected = assert.rejects(nativeWaiting, { name: 'AbortError' });
  menu.abort();
  await rejected;
  assert.equal(session.controller.signal.aborted, false);
  releaseTail();
  assert.equal((await done).length, 2);
  assert.deepEqual(calls, [null, 'tail'], 'native callers and worker share each cursor request');
  assert.deepEqual(received, [one.id, two.id]);
});

async function until(predicate, message) {
  const deadline = Date.now() + 2500;
  while (!predicate()) {
    assert.ok(Date.now() < deadline, message);
    await new Promise(resolve => setImmediate(resolve));
  }
}

function cacheWorkerHarness({ pages, commit, request, lookup, visible = [], database, storageTimeoutMs, storageRetryMs, storageReopenMs,
  managed = false, chatStorage = stateStorage(), href = 'https://chatgpt.com/c/test', image, mutationStatus = 200,
  querySelectorAll = () => [] } = {}) {
  const calls = { metadata: [], lookups: [], images: [] };
  const references = [...pages.values()].flatMap(page => page.items);
  const listeners = new Map();
  const { window, context } = loadRuntime({ managed, href, fetch: async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input);
    if (url.pathname === '/backend-api/me') return new Response(JSON.stringify({ id: 'initial-user' }));
    if (url.pathname.startsWith('/backend-api/conversation/')) return new Response('{}', {status:mutationStatus});
    if (url.pathname.endsWith('/reference-images')) {
      const cursor = url.searchParams.get('cursor');
      calls.metadata.push(cursor);
      if (request) return request(cursor, init?.signal);
      return new Response(JSON.stringify(pages.get(cursor)));
    }
    if (url.pathname.endsWith('/thumbnail_url')) {
      const id = decodeURIComponent(url.pathname.split('/').at(-2));
      calls.lookups.push(id);
      if (lookup) return lookup(id, init?.signal);
      const item = references.find(item => item.id === id);
      return new Response(JSON.stringify({ thumbnail_url: 'https://chatgpt.com/backend-api/estuary/content?id=' + item.asset_pointer.slice('sediment://'.length) }));
    }
    if (url.pathname.endsWith('/estuary/content')) {
      calls.images.push(url.searchParams.get('id'));
      if (image) return image(url.searchParams.get('id'), init?.signal);
      return new Response('valid-image', { headers: { 'Content-Type': 'image/png' } });
    }
    throw new Error('Unexpected test request');
  }, indexedDB: database || mockDatabase({ commit }), Blob, innerHeight: 1000,
    document: { querySelectorAll, createElement: tag => {
      assert.equal(tag, 'canvas');
      return { getContext: () => ({ drawImage() {} }), toBlob(callback) { callback(new Blob(['scaled-preview'], {type:'image/webp'})); }, toDataURL() {
        assert.equal(this.width, 48); assert.equal(this.height, 48);
        return 'data:image/webp;base64,YWJj';
      } };
    } },
    createImageBitmap: async blob => {
      assert.equal(await blob.text(), 'valid-image');
      return { width: 900, height: 1200, close() {} };
    }, setTimeout: (fn, ms, ...args) => setTimeout(fn,
      storageTimeoutMs && ms === 5000 ? storageTimeoutMs : storageRetryMs && ms === 1000 ? storageRetryMs :
        storageReopenMs && ms >= CONFIG.storageReopenSeconds * 1000 ? storageReopenMs : ms, ...args),
    window: context => ({ localStorage: chatStorage, addEventListener: (type, handler) => listeners.set(type, handler),
      history: { pushState(data, unused, value) { context.location.href = new URL(value, context.location.href).href; },
        replaceState(data, unused, value) { context.location.href = new URL(value, context.location.href).href; } } }),
    expose: ['window.testSession = cacheSession;', `thumbnailLoader.visibleFiles = new Set(${JSON.stringify(visible)});`,
      'window.testCache = thumbnailCache;', 'window.testCatalog = catalogController;', 'window.testMenus = mountedMenus;',
      'window.testMenuController = menuController;'] });
  return { window, calls, status: () => window.__referenceMenuFastStatus(),
    session: window.testSession, chatStorage, database: context.indexedDB,
    navigate: path => window.history.pushState(null, '', path),
    event: (type, value = {}) => listeners.get(type)?.(value),
    login: () => window.fetch('https://chatgpt.com/backend-api/me', {headers:{ Authorization:'Bearer test-only', 'ChatGPT-Account-ID':'account' }}),
    cache: window.testCache,
    catalog: window.testCatalog, menus: window.testMenus, menuController: window.testMenuController,
    open: signal => window.fetch('https://chatgpt.com/backend-api/files/library/reference-images?limit=50', {
      headers: { 'ChatGPT-Account-ID': 'account' }, signal,
    }) };
}

// A disk catalog for the logged-in user, as a caching chat would have saved it.
function seedCatalog(database, items, { account = 'account', identity = 'initial-user', ageMinutes = 31 } = {}) {
  const key = JSON.stringify(['AccountUserId_user', account]);
  database.stores.get('catalogs').set(key, { key, savedAt: Date.now() - ageMinutes * 60 * 1000, identity,
    pages: [{ cursor: null, items, next_cursor: null }] });
  return key;
}

async function cachedAccountHarness({ cached, latest = cached, request, cacheIdentity = 'initial-user', account = 'account', ageMinutes = 31 } = {}) {
  const database = mockDatabase();
  const pages = new Map([[null, { items: latest, next_cursor: null }]]);
  const h = cacheWorkerHarness({ database, pages, request, lookup: async id => {
    const reference = [...cached, ...latest].find(item => item.id === id);
    return new Response(JSON.stringify({ thumbnail_url: 'https://chatgpt.com/backend-api/estuary/content?id=' + reference.asset_pointer.slice('sediment://'.length) }));
  } });
  await new Promise(resolve => setImmediate(resolve));
  const key = seedCatalog(database, cached, { account, identity: cacheIdentity, ageMinutes });
  await h.window.fetch('https://chatgpt.com/backend-api/me');
  await until(() => h.status().identityReady, 'current user not observed');
  return { ...h, database, pages, key };
}

test('전체 파이프라인은 작은/큰 캐시에 원본을 공유하고 RAM을 채우지 않으며 다음 탭에서 다운로드를 생략한다',async()=>{
  const items=['one','two','three'].map(name=>({...ref(name),id:`AccountUserId_user~refimage_${name}`}));
  const pages=new Map([[null,{items,next_cursor:null}]]),database=mockDatabase();
  const h=cacheWorkerHarness({pages,database});await h.open();
  await until(()=>h.status().thumbnailProgress.complete&&h.status().previewProgress.complete,'both caches did not finish');
  assert.equal(h.calls.images.length,3,'each original should be fetched once for both sizes');
  assert.equal(h.status().hoverPreviewCached,0,'prefetch must not make object URLs');
  assert.equal(database.stores.get('previews').size,3);
  for(const record of database.stores.get('previews').values()) {
    assert.equal(record.width,255);assert.equal(record.height,340);assert.match(record.processing,/medium/);
  }
  const second=cacheWorkerHarness({pages,database});await second.open();
  await until(()=>second.status().thumbnailProgress.complete&&second.status().previewProgress.complete,'disk cache was not reused');
  assert.equal(second.calls.images.length,0);assert.equal(second.status().hoverPreviewCached,0);
  h.cache.accessWrites.clear();second.cache.accessWrites.clear();
});

test('첫 페이지의 큰 캐싱은 전체 목록을 기다리지 않고 메뉴 취소 뒤에도 끝까지 진행한다',async()=>{
  const one={...ref('one'),id:'AccountUserId_user~refimage_one'},two={...ref('two'),id:'AccountUserId_user~refimage_two'};
  const pages=new Map([[null,{items:[one],next_cursor:'tail'}],['tail',{items:[two],next_cursor:null}]]);
  let release;
  const h=cacheWorkerHarness({pages,request:cursor=>cursor===null?Promise.resolve(new Response(JSON.stringify(pages.get(null)))):
    new Promise(resolve=>{release=()=>resolve(new Response(JSON.stringify(pages.get('tail'))));})});
  const menu=new AbortController();await h.open(menu.signal);
  await until(()=>release&&h.status().previewProgress.ready===1,'first-page preview did not persist');
  assert.equal(h.status().previewProgress.total,null);
  const tail=h.window.fetch('https://chatgpt.com/backend-api/files/library/reference-images?cursor=tail',{
    headers:{'ChatGPT-Account-ID':'account'},signal:menu.signal});
  const cancelled=assert.rejects(tail,{name:'AbortError'});menu.abort();await cancelled;release();
  await until(()=>h.status().previewProgress.complete,'closing a menu stopped preview prefetch');
  assert.equal(h.status().previewProgress.ready,2);assert.equal(h.status().previewProgress.total,2);
  h.cache.accessWrites.clear();
});

test('새 탭에서도 사용자·계정이 맞는 디스크 목록을 서버 응답 전에 반환한다', async () => {
  const one = { ...ref('one'), id: 'AccountUserId_user~refimage_one' };
  let release;
  const h = await cachedAccountHarness({ cached: [one], request: () => new Promise(resolve => {
    release = () => resolve(new Response(JSON.stringify({ items: [one], next_cursor: null })));
  }) });
  const first = await h.open();
  assert.equal((await first.json()).items[0].id, one.id);
  assert.equal(h.status().thumbnailProgress.total, 1);
  assert.equal(h.status().backgroundCatalogRefreshes, 1);
  const second = await h.open();
  assert.equal((await second.json()).items.length, 1);
  assert.deepEqual(h.calls.metadata, [null], 'concurrent cache readers must share the background refresh');
  release();
  await until(() => !h.status().backgroundCatalogRefreshes, 'refresh did not finish');
  h.cache.accessWrites.clear();
});

test('수동 새로고침은 진행 조회를 취소하고 첫 페이지부터 다시 시작하며 완료·실패 뒤 재시도한다', async () => {
  const one = { ...ref('one'), id: 'AccountUserId_user~refimage_one' };
  let mode = 'ready';
  const held = [];
  const h = await cachedAccountHarness({ cached: [one], request: (cursor, signal) => {
    if (mode === 'hold') return new Promise(resolve => { held.push({ cursor, signal, release: () => resolve(new Response(JSON.stringify({ items: [one], next_cursor: null }))) }); });
    return Promise.resolve(mode === 'fail' ? new Response('{}', { status: 403 }) :
      new Response(JSON.stringify({ items: [one], next_cursor: null })));
  } });
  await h.open();
  await until(() => !h.status().backgroundCatalogRefreshes, 'initial refresh did not finish');
  const attributes = {};
  const menu = { isConnected: true, querySelector: () => null, getBoundingClientRect: () => ({ top: 0, bottom: 300 }) };
  const state = { menu, filteredRows: [], status: {}, input: { value: '' }, refresh: {
    setAttribute(key, value) { attributes[key] = value; },
  } };
  h.menus.set(menu, state);
  try {
    mode = 'hold';
    const before = h.calls.metadata.length;
    const session = h.menuController.refreshList(state);
    assert.equal(state.refresh.disabled, false, 'the busy button must remain clickable');
    assert.equal(attributes['aria-busy'], 'true');
    await until(() => held.length === 1, 'manual refresh not started');
    const restarted = h.menuController.refreshList(state);
    assert.notEqual(restarted, session);
    assert.equal(session.controller.signal.aborted, true);
    assert.equal(held[0].signal.aborted, true, 'abort the actual HTTP request');
    await until(() => held.length === 2, 'replacement refresh not started');
    assert.deepEqual(held.map(job => job.cursor), [null, null]);
    assert.equal(h.calls.metadata.length, before + 2);
    assert.equal(h.status().thumbnailProgress.total, 1, 'cached snapshot stays visible');
    held[1].release();
    await until(() => attributes['aria-busy'] === 'false', 'button stayed busy after completion');
    held[0].release();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(h.catalog.sessions.get(h.key), restarted, 'late cancelled response cannot replace the new session');
    assert.equal(attributes['aria-busy'], 'false');
    mode = 'fail'; h.menuController.refreshList(state);
    assert.equal(attributes['aria-busy'], 'true');
    await until(() => h.status().catalogFetchFailed && attributes['aria-busy'] === 'false', 'failure left button stuck');
    mode = 'ready'; h.menuController.refreshList(state);
    await until(() => attributes['aria-busy'] === 'false' && !h.status().catalogFetchFailed, 'retry did not restore button');
  } finally { h.menus.clear(); h.cache.accessWrites.clear(); }
});

test('초기 목록의 페이지 대기는 연속 재시작을 따라가며 이전 커서를 재사용하거나 항목을 중복하지 않는다', async () => {
  const one = { ...ref('one'), id: 'AccountUserId_user~refimage_one' };
  const two = { ...ref('two'), id: 'AccountUserId_user~refimage_two' };
  const updated = { ...one, entity_name: 'updated' };
  let restarting = false, oldTail;
  const roots = [];
  const h = cacheWorkerHarness({ pages: new Map([
    [null, { items: [one], next_cursor: 'old-tail' }], ['old-tail', { items: [two], next_cursor: null }],
  ]), request: (cursor, signal) => {
    if (!restarting && cursor === null) return Promise.resolve(new Response(JSON.stringify({ items: [one], next_cursor: 'old-tail' })));
    if (!restarting) return new Promise(resolve => { oldTail = { signal, release: () => resolve(new Response(JSON.stringify({ items: [one], next_cursor: null }))) }; });
    if (cursor === null) return new Promise(resolve => { roots.push({ signal, release: () => resolve(new Response(JSON.stringify({ items: [two], next_cursor: 'new-tail' }))) }); });
    assert.equal(cursor, 'new-tail', 'the new traversal must use only its own cursor');
    return Promise.resolve(new Response(JSON.stringify({ items: [updated], next_cursor: null })));
  } });
  assert.equal((await (await h.open()).json()).items[0].id, one.id);
  await until(() => oldTail, 'old tail not waiting');
  const native = signal => h.window.fetch('https://chatgpt.com/backend-api/files/library/reference-images?cursor=old-tail', {
    headers: { 'ChatGPT-Account-ID': 'account' }, signal,
  });
  const result = native().then(response => response.json()).then(body => ({ body }), error => ({ error }));
  const cancelled = new AbortController();
  const abandoned = assert.rejects(native(cancelled.signal), { name: 'AbortError' });
  const state = { status: {}, input: { value: '' } };
  restarting = true;
  h.menuController.refreshList(state);
  await until(() => roots.length === 1, 'first replacement not started');
  h.menuController.refreshList(state);
  await until(() => roots.length === 2, 'second replacement not started');
  assert.equal(oldTail.signal.aborted, true);
  assert.equal(roots[0].signal.aborted, true);
  cancelled.abort(); await abandoned;
  assert.equal(roots[1].signal.aborted, false, 'closing a waiter must not cancel the new worker');
  roots[1].release();
  const outcome = await result;
  assert.equal(outcome.error, undefined);
  assert.deepEqual(outcome.body.items.map(item => item.id), [two.id], 'earlier delivered reference IDs are excluded');
  assert.equal(outcome.body.next_cursor, null);
  await until(() => h.status().thumbnailProgress.complete, 'new snapshot did not finish');
  assert.equal(h.catalog.index.byId.get(one.id).entity_name, 'updated');
  roots[0].release(); oldTail.release();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.catalog.index.byId.get(one.id).entity_name, 'updated', 'late cancelled responses cannot overwrite the new snapshot');
  assert.equal(h.status().catalogFetchFailed, false);
  assert.deepEqual(h.calls.metadata, [null, 'old-tail', null, null, 'new-tail']);
  h.cache.accessWrites.clear();
});

test('백그라운드 조회 실패는 캐시 목록을 지우지 않고 실패 상태만 남긴다', async () => {
  const one = { ...ref('one'), id: 'AccountUserId_user~refimage_one' };
  const h = await cachedAccountHarness({ cached: [one], request: async () => new Response('{}', { status: 403 }) });
  assert.equal((await (await h.open()).json()).items.length, 1);
  await until(() => h.status().catalogFetchFailed, 'refresh failure not reported');
  assert.equal(h.status().thumbnailProgress.total, 1);
  assert.equal(h.catalog.index.byId.has(one.id), true);
  assert.equal(h.catalog.records.has(h.key), true);
  h.cache.accessWrites.clear();
});

test('앱이 자체 목록을 재사용해 fetch하지 않아도 열기 클릭은 갱신을 시작한다', async () => {
  const one = { ...ref('one'), id: 'AccountUserId_user~refimage_one' };
  const h = await cachedAccountHarness({ cached: [one] });
  await h.open();
  await until(() => !h.status().backgroundCatalogRefreshes, 'initial refresh did not complete');
  const before = h.calls.metadata.length;
  h.catalog.records.get(h.key).savedAt -= 31 * 60 * 1000;
  h.catalog.refreshOnOpen(); h.catalog.refreshOnOpen();
  assert.equal((await (await h.open()).json()).items.length, 1);
  await until(() => h.calls.metadata.length > before, 'cached app reopen did not refresh');
  await until(() => !h.status().backgroundCatalogRefreshes, 'reopen refresh did not complete');
  assert.equal(h.calls.metadata.length, before + 1, 'one shared refresh per open burst');
  h.cache.accessWrites.clear();
});

test('다른 사용자·다른 계정의 디스크 목록은 캐시 우선 응답에 사용하지 않는다', async () => {
  const one = { ...ref('one'), id: 'AccountUserId_user~refimage_one' };
  const two = { ...ref('two'), id: 'AccountUserId_user~refimage_two' };
  for (const options of [{ cacheIdentity: 'other-user' }, { account: 'other-account' }]) {
    const h = await cachedAccountHarness({ cached: [one], latest: [two], ...options });
    const body = await (await h.open()).json();
    assert.equal(body.items[0].id, two.id);
    assert.equal(h.status().catalogHits, 0);
    await until(() => !h.status().backgroundCatalogRefreshes, 'cold catalog did not finish');
    h.cache.accessWrites.clear();
  }
});

test('최신 목록은 진행 중인 앱 응답 뒤 반영해 이전 캐시 응답의 덮어쓰기를 막는다', async () => {
  const fixture = nativeFixture();
  const changed = { ...fixture.item, entity_name: 'renamed' };
  const two = { ...ref('two'), id: 'AccountUserId_user~refimage_two' };
  let releaseRefresh, releaseNative;
  fixture.query.promise = new Promise(resolve => { releaseNative = resolve; });
  const h = await cachedAccountHarness({ cached: [fixture.item], latest: [changed, two], request: () => new Promise(resolve => {
    releaseRefresh = () => resolve(new Response(JSON.stringify({ items: [changed, two], next_cursor: null })));
  }) });
  await h.open();
  const row = { __reactFiber$test: fixture.fiber };
  const menu = { isConnected: true, querySelector: () => row, getBoundingClientRect: () => ({ top: 0, bottom: 300 }) };
  h.menus.set(menu, { menu, status: {}, matched: 1, filteredRows: [], references: new Map() });
  releaseRefresh();
  await until(() => !h.status().backgroundCatalogRefreshes, 'refresh did not finish');
  assert.equal(fixture.query.state.data, undefined, 'do not race the native cache response');
  releaseNative();
  await until(() => fixture.query.state.data?.length === 2, 'fresh query was not published');
  assert.equal(fixture.query.state.data[0].entity_name, 'renamed');
  assert.equal(h.catalog.index.byName.has('renamed'), true);
  assert.equal(h.catalog.index.byName.has('one'), false);
  h.menus.clear(); h.cache.accessWrites.clear();
});

test('다음 목록 페이지를 기다리는 중에도 캐싱하며 저장 커밋 전에는 완료로 세지 않는다', async () => {
  const one = { ...ref('one'), id: 'AccountUserId_user~refimage_one' };
  const alias = { ...one, id: 'AccountUserId_user~refimage_alias' };
  const two = { ...ref('two'), id: 'AccountUserId_user~refimage_two' };
  const pages = new Map([[null, { items: [one, alias], next_cursor: 'tail' }], ['tail', { items: [two], next_cursor: null }]]);
  let releaseTail;
  let releaseCommit;
  let heldCommit = false;
  const h = cacheWorkerHarness({ pages,
    request: async cursor => cursor === null ? new Response(JSON.stringify(pages.get(cursor))) : new Promise(resolve => {
      releaseTail = () => resolve(new Response(JSON.stringify(pages.get(cursor))));
    }), commit: async (store, mode) => {
      if (store === 'thumbnails' && mode === 'readwrite' && !heldCommit) {
        heldCommit = true;
        await new Promise(resolve => { releaseCommit = resolve; });
      }
    } });
  const menu = new AbortController();
  await h.open(menu.signal);
  await until(() => releaseCommit && releaseTail, 'first-page thumbnail should start before the final page');
  assert.equal(h.calls.images.length, 1);
  assert.equal(h.status().thumbnailProgress.ready, 0);
  assert.equal(h.status().thumbnailProgress.total, null, 'total is unknown while a cursor remains');
  releaseCommit();
  await until(() => h.status().thumbnailProgress.ready === 2, 'both aliases should share the persisted thumbnail');
  const nativeTail = h.window.fetch('https://chatgpt.com/backend-api/files/library/reference-images?limit=50&cursor=tail', {
    headers: { 'ChatGPT-Account-ID': 'account' }, signal: menu.signal,
  });
  const cancelled = assert.rejects(nativeTail, { name: 'AbortError' });
  menu.abort();
  await cancelled;
  releaseTail();
  await until(() => h.status().thumbnailProgress.complete, 'worker must finish metadata and images after closing');
  assert.deepEqual(JSON.parse(JSON.stringify(h.status().thumbnailProgress)), { total: 3, discovered: 3, ready: 3, failed: 0, pending: 0, complete: true });
  assert.deepEqual(h.calls.metadata, [null, 'tail']);
  assert.equal(h.calls.images.length, 2, 'two references with the same file must not download it twice');
});

test('모든 목록 페이지를 받으면 디스크 저장이 멈춰 있어도 전체 수를 확정한다', async () => {
  const one = { ...ref('one'), id: 'AccountUserId_user~refimage_one' };
  const two = { ...ref('two'), id: 'AccountUserId_user~refimage_two' };
  let releaseCatalog;
  const h = cacheWorkerHarness({ pages: new Map([
    [null, { items: [one], next_cursor: 'tail' }], ['tail', { items: [two], next_cursor: null }],
  ]), commit: async (store, mode) => {
    if (store === 'catalogs' && mode === 'readwrite') await new Promise(resolve => { releaseCatalog = resolve; });
  } });
  await h.open();
  await until(() => releaseCatalog && h.status().collectedPages === 2, 'final catalog page not received');
  try {
    assert.equal(h.status().thumbnailProgress.total, 2, 'metadata completion must not depend on a disk commit');
    assert.equal(h.status().backgroundCatalogRefreshes, 0);
  } finally { releaseCatalog(); }
});

test('캐시 읽기가 복구되면 현재 오류만 지우고 마지막 실패는 진단 기록에 남긴다', async () => {
  let fail = true;
  const h = cacheWorkerHarness({ pages: new Map(), commit: (store, mode) => {
    if (store === 'catalogs' && mode === 'readonly' && fail) throw new Error('temporary read failure');
  } });
  const storage = h.cache.storage;
  await assert.rejects(storage.get('catalogs', 'missing'), /temporary/);
  assert.equal(h.status().cacheStorageError.operation, 'catalogs:readonly');
  assert.equal(storage.checkingReads, true);
  fail = false;
  await storage.get('catalogs', 'missing');
  assert.equal(h.status().cacheStorageError, null);
  assert.equal(h.status().cacheStorageLastFailure.operation, 'catalogs:readonly');
  assert.equal(storage.retries.size, 0, 'successful read cancels the scheduled retry');
  assert.equal(storage.checkingReads, false);
});

test('서버 우회 후 시간 초과 난 목록 읽기를 한 번 재확인하고 성공하면 경고를 지운다', async () => {
  const one = { ...ref('one'), id: 'AccountUserId_user~refimage_one' };
  let reads = 0;
  const h = cacheWorkerHarness({ pages: new Map([[null, { items: [one], next_cursor: null }]]),
    storageTimeoutMs: 15, storageRetryMs: 40, commit: async (store, mode) => {
      if (store === 'catalogs' && mode === 'readonly' && ++reads === 1) await new Promise(() => {});
    } });
  await h.open();
  await until(() => h.status().thumbnailProgress.complete, 'server fallback did not complete');
  assert.equal(h.status().cacheStorageError.operation, 'catalogs:readonly', 'unrelated writes cannot clear a read failure');
  await until(() => reads === 2 && h.status().cacheStorageError === null && !h.cache.storage.checkingReads,
    'successful background recheck did not clear warning');
  assert.equal(h.status().cacheStorageLastFailure.reason, 'timeout');
  assert.equal(h.calls.images.length, 1, 'the health check must not redownload images');
});

test('지속되는 읽기 실패는 한 번만 자동 재시도하며 쓰기 오류는 다른 읽기 성공으로 지우지 않는다', async () => {
  let reads = 0, writes = 0;
  const h = cacheWorkerHarness({ pages: new Map(), storageRetryMs: 10, commit: (store, mode) => {
    if (store === 'catalogs' && mode === 'readonly') { reads++; throw new Error('persistent failure'); }
    if (store === 'thumbnails' && mode === 'readwrite') { writes++; throw new Error('write failure'); }
  } });
  const storage = h.cache.storage;
  await assert.rejects(storage.get('catalogs', 'missing'));
  await until(() => reads === 2 && storage.retries.size === 0, 'read retry did not settle');
  await assert.rejects(storage.put('thumbnails', { key: 'test' }));
  await storage.get('thumbnails', 'test');
  assert.equal(h.status().cacheStorageError.operation, 'thumbnails:readwrite');
  assert.equal(storage.errors.size, 2, 'unresolved failures remain separate by store and access mode');
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(reads, 2); assert.equal(writes, 1, 'writes must never be replayed automatically');
});

test('먼저 시작한 작업의 늦은 성공이나 실패가 새 캐시 상태를 덮어쓰지 않는다', async () => {
  let release, fail = false;
  const h = cacheWorkerHarness({ pages: new Map(), commit: async () => {
    if (!release) await new Promise(resolve => { release = resolve; });
    else if (fail) throw new Error('new failure');
  } });
  const storage = h.cache.storage;
  const older = storage.request('catalogs', 'readonly', table => table.get('missing'), false);
  await until(() => release, 'first transaction not started');
  fail = true;
  await assert.rejects(storage.request('catalogs', 'readonly', table => table.get('missing'), false));
  release(); await older;
  assert.equal(h.status().cacheStorageError.operation, 'catalogs:readonly', 'older success cannot hide a newer failure');
  let rejectCommit, attempts = 0;
  const next = cacheWorkerHarness({ pages: new Map(), commit: async () => {
    if (++attempts === 1) await new Promise((resolve, reject) => { rejectCommit = reject; });
  } });
  const late = assert.rejects(next.cache.storage.request('catalogs', 'readonly', table => table.get('missing'), false));
  await until(() => rejectCommit, 'older transaction not started');
  await next.cache.storage.get('catalogs', 'missing');
  rejectCommit(new Error('older failure')); await late;
  assert.equal(next.status().cacheStorageError, null, 'older failure cannot replace a newer successful read');
});

test('IndexedDB 열기가 무응답이어도 시간 제한 뒤 서버 목록의 전체 수를 확정한다', async () => {
  const one = { ...ref('one'), id: 'AccountUserId_user~refimage_one' };
  const two = { ...ref('two'), id: 'AccountUserId_user~refimage_two' };
  const h = cacheWorkerHarness({ pages: new Map([
    [null, { items: [one], next_cursor: 'tail' }], ['tail', { items: [two], next_cursor: null }],
  ]), database: { open: () => ({}) }, storageTimeoutMs: 20 });
  await h.open();
  await until(() => h.status().thumbnailProgress.total === 2 && h.status().backgroundCatalogRefreshes === 0, 'DB open blocked pagination');
  await until(() => h.status().thumbnailProgress.failed === 2, 'cache jobs did not settle');
  assert.deepEqual(h.calls.metadata, [null, 'tail']);
  assert.equal(h.status().cacheStorageError.reason, 'timeout');
  assert.equal(h.status().thumbnailProgress.ready, 0);
});

test('목록 캐시 읽기가 무응답이어도 서버 조회로 진행하고 목록을 완성한다', async () => {
  const one = { ...ref('one'), id: 'AccountUserId_user~refimage_one' };
  const h = cacheWorkerHarness({ pages: new Map([[null, { items: [one], next_cursor: null }]]), storageTimeoutMs: 20,
    commit: async (store, mode) => { if (store === 'catalogs' && mode === 'readonly') await new Promise(() => {}); } });
  await h.open();
  await until(() => h.status().thumbnailProgress.complete, 'DB read blocked completion');
  assert.equal(h.status().cacheStorageError.operation, 'catalogs:readonly');
  assert.equal(h.status().cacheStorageError.reason, 'timeout');
});

test('썸네일 저장이 무응답이면 시간 초과로 실패 처리하며 전체 수는 유지한다', async () => {
  const one = { ...ref('one'), id: 'AccountUserId_user~refimage_one' };
  const h = cacheWorkerHarness({ pages: new Map([[null, { items: [one], next_cursor: null }]]), storageTimeoutMs: 20,
    commit: async (store, mode) => { if (store === 'thumbnails' && mode === 'readwrite') await new Promise(() => {}); } });
  await h.open();
  await until(() => h.status().thumbnailProgress.failed === 1, 'stalled disk commit remained pending');
  assert.equal(h.status().thumbnailProgress.total, 1);
  assert.equal(h.status().thumbnailProgress.ready, 0);
  assert.equal(h.status().cacheStorageError.reason, 'timeout');
  assert.equal(h.status().cacheStorageFailed, true);
  assert.equal(h.calls.images.length, 1);
});

test('IndexedDB 접근이 즉시 거부돼도 원래 목록은 정상 응답한다', async () => {
  const one = { ...ref('one'), id: 'AccountUserId_user~refimage_one' };
  const h = cacheWorkerHarness({ pages: new Map([[null, { items: [one], next_cursor: null }]]),
    database: { open() { throw new DOMException('Denied', 'SecurityError'); } } });
  assert.equal((await (await h.open()).json()).items.length, 1);
  await until(() => h.status().thumbnailProgress.total === 1, 'storage denial blocked catalog');
  assert.equal(h.status().cacheStorageError.reason, 'unavailable', 'an open failure is a lost connection');
});

test('첫 목록 요청이 HTTP 오류거나 거부되면 확인 중 대신 조회 실패 상태를 남긴다', async () => {
  const pages = new Map([[null, { items: [], next_cursor: null }]]);
  const denied = cacheWorkerHarness({ pages, request: async () => new Response('{}', { status: 403 }) });
  assert.equal((await denied.open()).status, 403);
  assert.equal(denied.status().catalogFetchFailed, true);
  assert.equal(denied.status().thumbnailProgress.total, null);
  const offline = cacheWorkerHarness({ pages, request: async () => { throw new TypeError('Network request failed'); } });
  await assert.rejects(offline.open(), /Network request failed/);
  assert.equal(offline.status().catalogFetchFailed, true);
});

test('IndexedDB 저장 실패는 다운로드 완료나 100% 캐싱으로 표시하지 않는다', async () => {
  const one = { ...ref('one'), id: 'AccountUserId_user~refimage_one' };
  const h = cacheWorkerHarness({ pages: new Map([[null, { items: [one], next_cursor: null }]]),
    commit: async (store, mode) => { if (store === 'thumbnails' && mode === 'readwrite') throw new Error('QuotaExceededError'); } });
  await h.open();
  await until(() => h.status().thumbnailProgress.failed === 1, 'storage failure must settle as failed');
  assert.equal(h.status().thumbnailProgress.total, 1);
  assert.equal(h.status().thumbnailProgress.ready, 0);
  assert.equal(h.status().thumbnailProgress.complete, false);
  assert.equal(h.status().cacheStorageFailed, true);
  assert.equal(h.calls.images.length, 1, 'do not redownload repeatedly when storage cannot commit');
});

test('실제 캐시 접근 시각 묶음은 이미지·저장 시각을 보존하며 삭제한 레코드를 되살리지 않는다', async () => {
  const commits = [];
  const database = mockDatabase({ commit: (store, mode) => commits.push([store, mode]) });
  const one = { ...ref('one'), id: 'AccountUserId_user~refimage_one' };
  const h = cacheWorkerHarness({ pages: new Map([[null, { items: [one], next_cursor: null }]]), database });
  await h.open(); await until(() => h.status().thumbnailProgress.complete, 'initial thumbnail did not commit');
  const table = database.stores.get('thumbnails');
  const original = [...table.values()][0];
  const later = original.accessedAt + 61000;
  commits.length = 0;
  for (let i = 0; i < 100; i++) h.cache.accessWrites.touch(original.key, later + i);
  await h.cache.accessWrites.flush();
  assert.equal(commits.filter(([store, mode]) => store === 'thumbnails' && mode === 'readwrite').length, 1);
  const updated = table.get(original.key);
  assert.equal(updated.dataUrl, original.dataUrl);
  assert.equal(updated.savedAt, original.savedAt);
  assert.equal(updated.accessedAt, later + 99);
  table.delete(original.key);
  h.cache.accessWrites.touch(original.key, later + 61000); await h.cache.accessWrites.flush();
  assert.equal(table.has(original.key), false);
  h.cache.accessWrites.clear();
});

test('연속 스크롤의 그리기는 프레임당 한 번만 예약하고 닫힌 메뉴는 그리지 않는다', async () => {
  const frames = [];
  let measurements = 0;
  const { window } = loadRuntime({ fetch: async () => new Response('{}'), innerHeight: 1000, document: { hidden: false },
    requestAnimationFrame: fn => frames.push(fn), expose: ['window.testMenu = menuController;'] });
  const state = { filteredRows: [], menu: { isConnected: true, getBoundingClientRect: () => {
    measurements++; return { top: 0, bottom: 300 };
  } } };
  for (let i = 0; i < 100; i++) window.testMenu.scheduleMenuPaint(state);
  assert.equal(frames.length, 1);
  frames.shift()(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(measurements, 1);
  window.testMenu.scheduleMenuPaint(state); state.menu.isConnected = false;
  frames.shift()();
  assert.equal(measurements, 1);
  assert.equal(state.paintScheduled, false);
});

test('첫 페이지 응답 전에 메뉴를 닫아도 검증 후 전체 캐싱을 이어간다', async () => {
  const one = { ...ref('one'), id: 'AccountUserId_user~refimage_one' };
  const pages = new Map([[null, { items: [one], next_cursor: null }]]);
  let releaseFirst;
  const h = cacheWorkerHarness({ pages, request: () => new Promise(resolve => {
    releaseFirst = () => resolve(new Response(JSON.stringify(pages.get(null))));
  }) });
  const menu = new AbortController();
  const opening = h.open(menu.signal);
  await until(() => releaseFirst, 'first request did not start');
  const cancelled = assert.rejects(opening, { name: 'AbortError' });
  menu.abort();
  releaseFirst();
  await cancelled;
  await until(() => h.status().thumbnailProgress.complete, 'bootstrap should remain independent of the popup');
  assert.equal(h.status().thumbnailProgress.ready, 1);
});

test('다른 소유자의 페이지와 반복 커서는 완성된 전체 목록으로 취급하지 않는다', async () => {
  const one = { ...ref('one'), id: 'AccountUserId_user~refimage_one' };
  let completed = false;
  let received = 0;
  const foreign = new CatalogSession({ owner: 'AccountUserId_user', request: async () => new Response(JSON.stringify({
    items: [{ ...one, id: 'AccountUserId_other~refimage_one' }], next_cursor: null,
  })), onPage: () => { received++; }, onComplete: () => { completed = true; } });
  await assert.rejects(foreign.start(), /Invalid reference catalog/);
  assert.equal(received, 0);
  assert.equal(completed, false);
  const cycle = new CatalogSession({ owner: 'AccountUserId_user', request: async cursor => new Response(JSON.stringify({
    items: [one], next_cursor: cursor === null ? 'tail' : 'tail',
  })), onPage() {}, onComplete: () => { completed = true; } });
  await assert.rejects(cycle.start(), /Repeated reference cursor/);
  assert.equal(completed, false);
});

test('화면 밖 다운로드가 진행 중이어도 보이는 참조가 먼저 캐시에 저장된다', async () => {
  const items = ['one', 'two', 'three', 'visible'].map(name => ({ ...ref(name), id: `AccountUserId_user~refimage_${name}` }));
  const releases = [];
  let allowBackground = false;
  const h = cacheWorkerHarness({ pages: new Map([[null, { items, next_cursor: null }]]), visible: ['file_visible'],
    lookup: id => {
      const item = items.find(item => item.id === id);
      const response = () => new Response(JSON.stringify({ thumbnail_url: 'https://chatgpt.com/backend-api/estuary/content?id=' + item.asset_pointer.slice('sediment://'.length) }));
      if (id.endsWith('visible') || allowBackground) return response();
      return new Promise(resolve => releases.push(() => resolve(response())));
    } });
  await h.open();
  await until(() => h.status().thumbnailProgress.ready === 1, 'visible item should finish without waiting for blocked background items');
  assert.deepEqual(h.calls.images, ['file_visible']);
  assert.ok(releases.length >= 1 && releases.length <= 2, 'two background jobs may share the same original-image transfer');
  allowBackground = true;
  for (const release of releases) release();
  await until(() => h.status().thumbnailProgress.complete, 'remaining items must finish afterwards');
  await until(() => h.status().previewProgress.complete, 'large previews must also finish afterwards');
  assert.equal(h.status().thumbnailProgress.ready, 4);
});

test('첫 사용자 정보 응답이 늦게 도착해도 이미 검증한 캐시 작업을 취소하지 않는다', async () => {
  const one = { ...ref('one'), id: 'AccountUserId_user~refimage_one' };
  const two = { ...ref('two'), id: 'AccountUserId_user~refimage_two' };
  const pages = new Map([[null, { items: [one], next_cursor: 'tail' }], ['tail', { items: [two], next_cursor: null }]]);
  let releaseTail;
  const h = cacheWorkerHarness({ pages, request: cursor => cursor === null ? new Response(JSON.stringify(pages.get(cursor))) :
    new Promise(resolve => { releaseTail = () => resolve(new Response(JSON.stringify(pages.get(cursor)))); }) });
  await h.open();
  await h.window.fetch('https://chatgpt.com/backend-api/me');
  await until(() => h.status().identityReady && releaseTail, 'initial identity should be observed');
  assert.equal(h.status().scopeReady, true);
  releaseTail();
  await until(() => h.status().thumbnailProgress.complete, 'same-session work should remain alive');
  assert.equal(h.status().thumbnailProgress.ready, 2);
});

test('선택한 원본은 본문까지 완료된 응답을 반환하고 무응답은 시간 제한으로 종료한다', async () => {
  const result = await boundedImage(async () => new Response('original', { headers: { 'Content-Type': 'image/png' } }), 1000);
  assert.equal(result.headers.get('Content-Type'), 'image/png');
  assert.equal(await result.text(), 'original');
  let signal;
  await assert.rejects(boundedImage(value => { signal = value; return new Promise(() => {}); }, 5), { name: 'TimeoutError' });
  assert.equal(signal.aborted, true);
  await assert.rejects(boundedImage(async () => new Response(new ReadableStream({ start() {} })), 5), { name: 'TimeoutError' });
});

test('캐시 적중으로 대기 중인 원본 쿼리를 선택 시 완료하고 후속 요청은 우회한다', async () => {
  // Test-only access to the real closure; the installed script exposes no such controls.
  const { window } = loadRuntime({ fetch: async () => new Response('normal-native-request'), Element, innerHeight: 1000,
    expose: ['window.testAccess = { setScope, mountedMenus, thumbnailMemory, beforeReferenceSelection, waitForMenuImage, updateMenus };'] });
  const access = window.testAccess;
  access.setScope('scope');
  await new Promise(resolve => setImmediate(resolve));
  const row = new Element();
  const item = ref('selected');
  const menu = {
    isConnected: true, getBoundingClientRect: () => ({ top: 0, bottom: 300 }),
    querySelectorAll: () => [], contains: node => node === row,
  };
  access.mountedMenus.set(menu, { menu, rows: [row], filteredRows: [row], references: new Map([[row, item]]), rowsByFile: new Map([['file_selected', new Set([row])]]), status: {}, matched: 1 });
  const key = JSON.stringify(['scope', 'file_selected']);
  access.thumbnailMemory.set(key, { key, savedAt: Date.now(), dataUrl: 'data:image/webp;base64,YWJj' });
  let originalCalls = 0;
  const pending = access.waitForMenuImage('file_selected', undefined, async () => {
    originalCalls += 1;
    return new Response('full-original');
  }, 'scope');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(window.__referenceMenuFastStatus().waitingImages, 1);
  assert.equal(originalCalls, 0, 'preview cache hit should not download an original by itself');
  access.beforeReferenceSelection({ type: 'click', target: row });
  const original = await pending;
  assert.equal(await original.text(), 'full-original');
  assert.equal(window.__referenceMenuFastStatus().waitingImages, 0);
  const next = await window.fetch('https://chatgpt.com/backend-api/estuary/content?id=file_selected');
  assert.equal(await next.text(), 'normal-native-request', 'regeneration must bypass preview interception');

  const abandoned = access.waitForMenuImage('file_selected', undefined, () => new Promise(() => {}), 'scope');
  const cancelled = assert.rejects(abandoned, { name: 'AbortError' });
  menu.isConnected = false;
  access.updateMenus();
  await cancelled;
  assert.equal(window.__referenceMenuFastStatus().waitingImages, 0, 'unmounted menus must not leak pending requests without a signal');
});

test('개별 참조 확인은 HTTPS의 실제 파일 연결과 일치해야 한다', () => {
  const item = ref('one');
  assert.equal(thumbnailMatchesReference('https://chatgpt.com/backend-api/estuary/content?id=file_one&sig=temporary', item), true);
  assert.equal(thumbnailMatchesReference('https://cdn.example.test/file_one', item), true);
  assert.equal(thumbnailMatchesReference('https://chatgpt.com/backend-api/estuary/content?id=file_other', item), false);
  assert.equal(thumbnailMatchesReference('http://chatgpt.com/file_one', item), false);
  assert.equal(thumbnailMatchesReference('javascript:file_one', item), false);
});

test('개별 조회는 기존 앱의 계정 요청 범위를 사용하고 메타데이터만 요청한다', async () => {
  const calls = [];
  const input = new Request('https://chatgpt.com/backend-api/files/library/reference-images?limit=50', {
    credentials: 'include', headers: { 'ChatGPT-Account-ID': 'account', 'x-client-request-id': 'old-id' },
  });
  const api = referenceTransport(async (request, init) => { calls.push({ request, init }); return new Response('{}'); },
    input, { headers: { 'X-Test': 'same-session' } }, 'https://chatgpt.com');
  const controller = new AbortController();
  await api.verify('AccountUserId_user~refimage_x', controller.signal);
  await api.list('next-page', controller.signal);
  assert.equal(calls[0].request.url, 'https://chatgpt.com/backend-api/files/library/reference-images/AccountUserId_user~refimage_x/thumbnail_url');
  assert.equal(calls[0].init.headers.get('ChatGPT-Account-ID'), 'account');
  assert.equal(calls[0].init.headers.get('X-Test'), 'same-session');
  assert.equal(calls[0].init.headers.has('x-client-request-id'), false);
  assert.equal(calls[0].request.credentials, 'include');
  assert.equal(calls[0].init.signal, controller.signal);
  assert.equal(new URL(calls[1].request.url).searchParams.get('cursor'), 'next-page');
});

function nativeFixture(onRecreate = async () => true) {
  const item = { ...ref('one'), id: 'AccountUserId_user~refimage_one' };
  const query = {
    queryKey: ['chatgpt-reference-images', 'account', 'native-account-user'],
    state: { data: undefined, fetchStatus: 'fetching', dataUpdatedAt: 0 },
    options: { placeholderData: [item, { ...ref('two'), id: 'AccountUserId_user~refimage_two' }] },
    promise: new Promise(() => {}),
  };
  const scope = { get() {}, query: {}, queryClient: {
    getQueryCache: () => ({ findAll: () => [query] }),
    setQueryData: (key, update, options) => {
      assert.equal(key, query.queryKey);
      query.state.data = typeof update === 'function' ? update(query.state.data) : update;
      query.state.dataUpdatedAt = options?.updatedAt ?? Date.now();
    },
  } };
  const owner = { memoizedProps: { cacheKey: 'native-account-user', items: [], onRecreate },
    updateQueue: { memoCache: { data: [[scope]] } } };
  const fiber = { key: item.id, return: owner };
  return { item, query, scope, owner, fiber };
}

test('현재 메뉴·계정의 정확한 React 참조 ID로만 빠른 선택을 연결한다', () => {
  const fixture = nativeFixture();
  const row = { __reactFiber$test: fixture.fiber };
  assert.equal(nativeSelection(row, 'account').reference.id, fixture.item.id);
  assert.equal(nativeSelection(row, 'other-account'), null);
  assert.equal(nativeSelection({}, 'account'), null);
  fixture.owner.memoizedProps.items = [{ reference_image_id: fixture.item.id }];
  assert.equal(nativeSelection(row, 'account'), null, 'used-reference edit must keep its native action');
});

test('검증한 선택 항목만 교체하며 나머지 목록과 원래 순서를 보존한다', () => {
  const old = [ref('one'), ref('two')];
  const changed = { ...ref('one'), entity_name: 'updated' };
  assert.deepEqual(mergeReference(undefined, old, changed).map(x => x.entity_name), ['updated', 'two']);
  assert.deepEqual(mergeReference([ref('three')], old, changed).map(x => x.id), ['three', 'one']);
  assert.equal(old[0].entity_name, 'one');
});

async function selectionHarness(verify) {
  class ClickableElement extends Element {
    nativeClicks = 0;
    click() { this.nativeClicks += 1; }
  }
  let submissions = 0;
  const fixture = nativeFixture(async item => {
    assert.equal(fixture.query.state.data.some(x => x.id === item.id && x.asset_pointer === item.asset_pointer), true);
    submissions += 1;
    return true;
  });
  const row = new ClickableElement();
  row.__reactFiber$test = fixture.fiber;
  const menu = { isConnected: true, contains: node => node === row, setAttribute() {}, removeAttribute() {}, querySelectorAll: () => [],
    getBoundingClientRect: () => ({ top: 0, bottom: 300 }) };
  const state = { menu, rows: [row], filteredRows: [row], references: new Map(), rowsByFile: new Map(), status: {}, matched: 1 };
  const { window } = loadRuntime({ fetch: async () => new Response('{}'), Element: ClickableElement, innerHeight: 1000,
    href: 'https://chatgpt.com/c/test',
    expose: ['window.testAccess = { setScope, mountedMenus, beforeReferenceSelection, setTransport:x=>activeTransport=x, setAccount:x=>activeAccount=x };'] });
  const access = window.testAccess;
  const scope = JSON.stringify(['AccountUserId_user', 'account']);
  access.setScope(scope); access.setAccount('account');
  await new Promise(resolve => setImmediate(resolve));
  const api = { verify, list: () => { throw new Error('must not wait for full list'); } };
  access.setTransport({ scope, api });
  access.mountedMenus.set(menu, state);
  const click = () => access.beforeReferenceSelection({ type: 'click', button: 0, target: row, preventDefault() {}, stopImmediatePropagation() {} });
  return { ...fixture, window, access, row, state, click, api, submissions: () => submissions };
}

async function waitForSelection(window) {
  const deadline = Date.now() + 1000;
  while (window.__referenceMenuFastStatus().fastSelectionPending) {
    assert.ok(Date.now() < deadline, 'single-reference operation did not settle');
    await new Promise(resolve => setImmediate(resolve));
  }
}

test('전체 목록 Promise가 끝나지 않아도 선택 한 건 확인 후 기존 생성 함수에 한 번 전달한다', async () => {
  let checks = 0;
  const h = await selectionHarness(async () => {
    checks += 1;
    return new Response(JSON.stringify({ thumbnail_url: 'https://chatgpt.com/backend-api/estuary/content?id=file_one' }));
  });
  h.click(); h.click();
  await waitForSelection(h.window);
  assert.equal(checks, 1);
  assert.equal(h.submissions(), 1, h.state.notice);
  assert.equal(h.query.state.fetchStatus, 'fetching', 'background refresh must remain in progress');
  assert.equal(h.query.state.dataUpdatedAt, 0, 'placeholder is not a newly verified full catalog');
  assert.equal(h.window.__referenceMenuFastStatus().fastSelections, 1);
});

test('단일 참조가 없거나 파일 연결이 달라지면 직접 재생성하지 않는다', async () => {
  const missing = await selectionHarness(async () => new Response('{}', { status: 404 }));
  missing.click();
  await waitForSelection(missing.window);
  assert.equal(missing.submissions(), 0);
  assert.equal(missing.window.__referenceMenuFastStatus().fastSelectionPending, false);
  const changed = await selectionHarness(async () => new Response(JSON.stringify({ thumbnail_url: 'https://chatgpt.com/backend-api/estuary/content?id=file_other' })));
  changed.click();
  await waitForSelection(changed.window);
  assert.equal(changed.submissions(), 0);
  assert.equal(changed.row.nativeClicks, 1, changed.state.notice);
});

test('참조 확인 도중 계정을 바꾸면 원래 계정의 생성 요청을 보내지 않는다', async () => {
  let release;
  const h = await selectionHarness(() => new Promise(resolve => { release = resolve; }));
  h.click();
  await new Promise(resolve => setImmediate(resolve));
  h.access.setScope(JSON.stringify(['AccountUserId_other', 'other-account']));
  release(new Response(JSON.stringify({ thumbnail_url: 'https://chatgpt.com/backend-api/estuary/content?id=file_one' })));
  await waitForSelection(h.window);
  assert.equal(h.submissions(), 0);
  assert.equal(h.query.state.data, undefined);
  assert.equal(h.window.__referenceMenuFastStatus().fastSelectionPending, false);
});

test('메뉴 종료로 기존 전체 조회가 취소돼도 별도로 목록을 채우고 생성은 재전송하지 않는다', async () => {
  const h = await selectionHarness(async () => new Response(JSON.stringify({ thumbnail_url: 'https://chatgpt.com/backend-api/estuary/content?id=file_one' })));
  let cancelRefresh;
  h.query.promise = new Promise((_, reject) => { cancelRefresh = reject; });
  const cursors = [];
  h.api.list = async cursor => {
    cursors.push(cursor);
    return new Response(JSON.stringify({ items: [cursor === null ? h.item : h.query.options.placeholderData[1]], next_cursor: cursor === null ? 'tail' : null }));
  };
  h.click();
  await waitForSelection(h.window);
  assert.equal(cursors.length, 0, 'do not duplicate the active native refresh');
  h.query.state.fetchStatus = 'idle';
  cancelRefresh(new DOMException('Menu closed', 'AbortError'));
  const deadline = Date.now() + 1000;
  while (h.window.__referenceMenuFastStatus().catalogItems !== 2 || h.window.__referenceMenuFastStatus().backgroundCatalogRefreshes) {
    assert.ok(Date.now() < deadline, 'background catalog did not finish');
    await new Promise(resolve => setImmediate(resolve));
  }
  assert.deepEqual(cursors, [null, 'tail']);
  assert.equal(h.submissions(), 1);
  assert.equal(h.query.state.data.length, 2);
});

test('채팅 ID는 저장된 채팅 경로에서만 인식하고 이름·검색 문자열은 키로 쓰지 않는다', () => {
  assert.equal(chatIdFor('https://chatgpt.com/c/chat-123'), 'chat-123');
  assert.equal(chatIdFor('https://chatgpt.com/g/g-sample/c/chat-123?model=x'), 'chat-123');
  for (const path of ['/', '/g/g-sample', '/?next=/c/fake', '/c/a/extra']) assert.equal(chatIdFor('https://chatgpt.com' + path), null);
});

test('채팅별 시작 상태만 재개하며 이동·수동 중지·저장 실패를 구분한다', async () => {
  const storage = stateStorage(), starts = [], cancelled = [];
  const create = () => new ChatCacheSession({ storage, start: (context, signal) => starts.push(signal), cancel: () => cancelled.push(true) });
  const session = create(); session.route('https://chatgpt.com/c/one'); session.credentials({key:'current-auth'});
  await new Promise(resolve => setImmediate(resolve)); assert.equal(starts.length, 0);
  session.begin(); await new Promise(resolve => setImmediate(resolve)); assert.equal(starts.length, 1);
  session.route('https://chatgpt.com/c/two'); assert.equal(starts[0].aborted, true); assert.equal(session.enabled, false);
  session.route('https://chatgpt.com/c/one'); await new Promise(resolve => setImmediate(resolve)); assert.equal(starts.length, 2);
  session.stop(); assert.equal(starts[1].aborted, true);
  const reload = create(); reload.route('https://chatgpt.com/c/one'); reload.credentials({key:'new-auth'});
  await new Promise(resolve => setImmediate(resolve)); assert.equal(starts.length, 2, 'saved stop must survive reload');
  assert.equal(storage.getItem(CHAT_CACHE_PREFIX+'one'),null);
  assert.deepEqual(JSON.parse(storage.getItem(CHAT_CACHE_RECENT_KEY)), []);
  assert.equal([...storage.values.values()].some(value => value.includes('current-auth')), false, 'no credentials persisted');
  const blocked = new ChatCacheSession({storage:{getItem(){throw Error('blocked')},setItem(){throw Error('blocked')}},start(){},cancel(){}});
  blocked.route('https://chatgpt.com/c/one'); blocked.credentials({key:'ok'}); blocked.begin(); blocked.stop();
  assert.equal(blocked.storageError, true); assert.equal(blocked.enabled, false); assert.equal(blocked.running, false);
});

test('인증을 기다리는 시작 요청도 중지할 수 있고 다른 탭의 중지·삭제 상태를 따른다', async () => {
  const storage=stateStorage(), starts=[];
  const s=new ChatCacheSession({storage,start:(c,signal)=>starts.push(signal),cancel(){}});
  s.route('https://chatgpt.com/c/one');s.begin();assert.equal(s.running,false);s.stop();
  s.credentials({key:'auth'});await new Promise(resolve=>setImmediate(resolve));assert.equal(starts.length,0);
  s.begin();await new Promise(resolve=>setImmediate(resolve));
  storage.setItem(CHAT_CACHE_RECENT_KEY,'[]');s.external('unrelated');
  assert.equal(s.running,true);s.external(CHAT_CACHE_RECENT_KEY);assert.equal(s.running,false);assert.equal(starts[0].aborted,true);
  s.begin();await new Promise(resolve=>setImmediate(resolve));s.deleted('other');assert.equal(s.running,true);
  s.deleted('one');assert.equal(s.running,false);assert.equal(s.read('one'),false);
});

test('삭제 요청만 식별하며 이름 변경·보관·요청 본문 소비와 구분한다', async () => {
  const url=new URL('https://chatgpt.com/backend-api/conversation/chat-1');
  assert.equal(await deletedChatId(url,'PATCH',url.href,{body:JSON.stringify({is_visible:false})}),'chat-1');
  assert.equal(await deletedChatId(url,'DELETE',url.href),'chat-1');
  for(const body of [{title:'new'},{is_archived:true},{is_visible:true}]) assert.equal(await deletedChatId(url,'PATCH',url.href,{body:JSON.stringify(body)}),null);
  const request=new Request(url,{method:'PATCH',body:JSON.stringify({is_visible:false})});
  assert.equal(await deletedChatId(url,'PATCH',request),'chat-1');assert.equal(request.bodyUsed,false);
});

test('실제 실행은 시작 버튼 의도 전에는 캐싱하지 않고 새 실행은 목록을 열지 않아도 디스크 캐시부터 재개한다',async()=>{
  const items=['one','two'].map(name=>({...ref(name),id:`AccountUserId_user~refimage_${name}`}));
  const pages=new Map([[null,{items,next_cursor:null}]]),database=mockDatabase(),chatStorage=stateStorage();
  const h=cacheWorkerHarness({pages,database,chatStorage,managed:true});await h.login();
  await until(()=>h.status().identityReady,'identity unavailable');assert.equal(h.calls.metadata.length,0);
  await h.open();assert.equal(h.calls.metadata.length,1);assert.equal(h.calls.images.length,0,'viewing a menu must not opt into caching');
  h.session.begin();await until(()=>h.status().previewProgress.complete&&h.status().thumbnailProgress.complete,'explicit start did not cache');
  assert.equal(h.calls.images.length,2);h.event('pagehide');assert.equal(h.status().cacheChat.running,false);
  const reload=cacheWorkerHarness({pages,database,chatStorage,managed:true});await reload.login();
  await until(()=>reload.status().previewProgress.complete&&reload.status().thumbnailProgress.complete,'reload did not auto-resume');
  assert.equal(reload.calls.images.length,0,'valid cached files must be skipped');assert.equal(reload.calls.metadata.length,0,'fresh persisted catalog must also skip network refresh');
  reload.session.stop();
  const paused=cacheWorkerHarness({pages,database,chatStorage,managed:true});await paused.login();
  await new Promise(resolve=>setImmediate(resolve));assert.equal(paused.calls.metadata.length,0);assert.equal(paused.calls.images.length,0);
  h.cache.accessWrites.clear();reload.cache.accessWrites.clear();paused.cache.accessWrites.clear();
});

test('다른 채팅은 자동 실행하지 않으며 History 이동은 진행 중 목록·큰/작은 원본 요청을 취소한다',async()=>{
  const one={...ref('one'),id:'AccountUserId_user~refimage_one'},two={...ref('two'),id:'AccountUserId_user~refimage_two'};
  const pages=new Map([[null,{items:[one],next_cursor:'tail'}],['tail',{items:[two],next_cursor:null}]]);
  const held=[];let tailSignal;
  const h=cacheWorkerHarness({pages,managed:true,request:(cursor,signal)=>{
    if(cursor===null)return new Response(JSON.stringify(pages.get(null)));
    tailSignal=signal;return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('Cancelled','AbortError')),{once:true}));
  },image:(file,signal)=>new Promise((resolve,reject)=>{held.push(signal);signal.addEventListener('abort',()=>reject(new DOMException('Cancelled','AbortError')),{once:true});})});
  await h.login();h.session.begin();await until(()=>tailSignal&&held.length,'background requests did not start');
  h.navigate('/c/other');assert.equal(tailSignal.aborted,true);assert.equal(held.every(signal=>signal.aborted),true);
  assert.equal(h.status().cacheChat.enabled,false);assert.equal(h.status().scopeReady,false);
  const before=h.calls.metadata.length;await new Promise(resolve=>setImmediate(resolve));assert.equal(h.calls.metadata.length,before);
  assert.equal(JSON.parse(h.chatStorage.getItem(CHAT_CACHE_RECENT_KEY)).includes('test'),true,'leaving retains the source chat resume flag');
  h.navigate('/');assert.equal(h.status().cacheChat.available,false);h.cache.accessWrites.clear();
});

test('초기 첫 페이지 확인 중에도 중지 즉시 취소하고 성공한 채팅 삭제만 영구 중지한다',async()=>{
  const pages=new Map([[null,{items:[],next_cursor:null}]]);
  for(const mutationStatus of [200,403]){
    let rootSignal;
    const h=cacheWorkerHarness({pages,managed:true,mutationStatus,request:(cursor,signal)=>{
      rootSignal=signal;return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('Cancelled','AbortError')),{once:true}));
    }});
    await h.login();h.session.begin();await until(()=>rootSignal,'bootstrap did not start');
    await h.window.fetch('https://chatgpt.com/backend-api/conversation/test',{method:'PATCH',body:JSON.stringify({is_visible:false})});
    assert.equal(rootSignal.aborted,mutationStatus===200);assert.equal(h.session.enabled,mutationStatus!==200);
    if(mutationStatus!==200)h.session.stop();assert.equal(rootSignal.aborted,true);
    await new Promise(resolve=>setImmediate(resolve));assert.equal(h.status().catalogFetchFailed,false,'intentional cancellation is not a fetch failure');
  }
});

test('다른 채팅·새 채팅에서는 같은 사용자로 로그인해도 이전 실행 상태를 가져오지 않는다',async()=>{
  const pages=new Map([[null,{items:[],next_cursor:null}]]),chatStorage=stateStorage(new Map([[CHAT_CACHE_PREFIX+'test',JSON.stringify({enabled:true})]]));
  for(const href of ['https://chatgpt.com/c/other','https://chatgpt.com/']){
    const h=cacheWorkerHarness({pages,chatStorage,managed:true,href});await h.login();await new Promise(resolve=>setImmediate(resolve));
    assert.equal(h.calls.metadata.length,0);assert.equal(h.session.enabled,false);
  }
});

test('페이지 종료 뒤 늦은 인증 응답은 재시작하지 않고 BFCache 복귀 시에만 재개한다',async()=>{
  const h=cacheWorkerHarness({managed:true,pages:new Map([[null,{items:[],next_cursor:null}]])});
  h.session.begin();h.event('pagehide');await h.login();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.calls.metadata.length,0);h.event('pageshow');await until(()=>h.calls.metadata.length===1,'page restore did not resume');
  h.session.stop();
});

test('떠나 있는 채팅을 다른 탭에서 중지하면 돌아와도 이전 시작 상태가 되살아나지 않는다',async()=>{
  const storage=stateStorage(),starts=[];
  const s=new ChatCacheSession({storage,start:()=>starts.push(true),cancel(){}});
  s.route('https://chatgpt.com/c/one');s.credentials({key:'auth'});s.begin();await new Promise(resolve=>setImmediate(resolve));
  s.route('https://chatgpt.com/c/two');storage.setItem(CHAT_CACHE_RECENT_KEY,'[]');s.external(CHAT_CACHE_RECENT_KEY);
  s.route('https://chatgpt.com/c/one');await new Promise(resolve=>setImmediate(resolve));assert.equal(starts.length,1);assert.equal(s.enabled,false);
});

test('현재 채팅 조회가 삭제됨을 반환하면 자동 재개 의도를 중지로 저장한다',async()=>{
  const h=cacheWorkerHarness({managed:true,mutationStatus:404,pages:new Map([[null,{items:[],next_cursor:null}]])});
  await h.login();h.session.begin();await until(()=>h.calls.metadata.length>0,'startup missing');
  await h.window.fetch('https://chatgpt.com/backend-api/conversation/test');
  assert.equal(h.session.enabled,false);assert.equal(h.session.running,false);
  assert.equal(h.chatStorage.getItem(CHAT_CACHE_PREFIX+'test'),null);
  assert.equal(JSON.parse(h.chatStorage.getItem(CHAT_CACHE_RECENT_KEY)).includes('test'),false);
});


test('시작 버튼 없이 참조 목록 열기로 그 채팅만 시작하고 새 실행은 자동 재개한다', async () => {
  const item={...ref('one'),id:'AccountUserId_user~refimage_one'};
  const pages=new Map([[null,{items:[item],next_cursor:null}]]),database=mockDatabase(),chatStorage=stateStorage();
  const h=cacheWorkerHarness({managed:true,pages,database,chatStorage});await h.login();
  assert.equal(h.calls.metadata.length,0);h.catalog.refreshOnOpen();
  await until(()=>h.status().thumbnailProgress.complete&&h.status().previewProgress.complete,'opening did not start both caches');
  assert.equal(h.session.enabled,true);h.event('pagehide');
  const reload=cacheWorkerHarness({managed:true,pages,database,chatStorage});await reload.login();
  await until(()=>reload.status().thumbnailProgress.complete&&reload.status().previewProgress.complete,'reload did not resume');
  assert.equal(reload.calls.images.length,0);reload.navigate('/c/other');
  assert.equal(reload.session.running,false);assert.equal(reload.session.enabled,false);
  reload.catalog.refreshOnOpen();await until(()=>reload.session.running,'opening the new chat did not start its own work');
  reload.session.stop();h.cache.accessWrites.clear();reload.cache.accessWrites.clear();
});

test('참조 목록을 연 최신 채팅 5개만 저장하고 다시 연 항목은 중복 없이 맨 앞으로 옮긴다',()=>{
  const storage=stateStorage(),s=new ChatCacheSession({storage,start(){},cancel(){}});
  for(const id of ['a','b','c','d','e','f']){s.route('https://chatgpt.com/c/'+id);s.begin()}
  assert.deepEqual(JSON.parse(storage.getItem(CHAT_CACHE_RECENT_KEY)),['f','e','d','c','b']);
  assert.equal(s.read('a'),false);s.route('https://chatgpt.com/c/c');s.begin();
  assert.deepEqual(JSON.parse(storage.getItem(CHAT_CACHE_RECENT_KEY)),['c','f','e','d','b']);
  s.route('https://chatgpt.com/c/b');
  assert.deepEqual(JSON.parse(storage.getItem(CHAT_CACHE_RECENT_KEY)),['c','f','e','d','b'],'visiting without opening the reference menu must not change recency');
  assert.deepEqual([...storage.values.keys()],[CHAT_CACHE_RECENT_KEY],'do not accumulate per-chat flags');
});

test('기존 등록의 시간 기록이 없으면 현재 채팅을 우선해 5개로 이전하고 이전 키는 정리한다',()=>{
  const values=new Map();for(let i=1;i<=7;i++)values.set(CHAT_CACHE_PREFIX+'old-'+i,JSON.stringify({enabled:true}));
  values.set(CHAT_CACHE_PREFIX+'stopped',JSON.stringify({enabled:false}));values.set(CHAT_CACHE_PREFIX+'broken','invalid-json');values.set('unrelated','keep');
  const s=new ChatCacheSession({storage:stateStorage(values),start(){},cancel(){}});s.route('https://chatgpt.com/c/old-1');
  assert.deepEqual(s.recent(),['old-1','old-7','old-6','old-5','old-4']);assert.equal(s.enabled,true);
  assert.equal([...values.keys()].some(key=>key.startsWith(CHAT_CACHE_PREFIX)),false);assert.equal(values.get('unrelated'),'keep');
});

test('다른 탭에서 여섯 번째 채팅을 등록하면 밀려난 채팅의 진행 중 작업도 중단한다',async()=>{
  const storage=stateStorage(),started=[];
  const one=new ChatCacheSession({storage,start:(context,signal)=>started.push(signal),cancel(){}});
  one.route('https://chatgpt.com/c/a');one.credentials({key:'auth'});one.begin();await new Promise(resolve=>setImmediate(resolve));
  const two=new ChatCacheSession({storage,start(){},cancel(){}});
  for(const id of ['b','c','d','e','f']){two.route('https://chatgpt.com/c/'+id);two.begin()}
  one.external(CHAT_CACHE_RECENT_KEY);assert.equal(one.enabled,false);assert.equal(one.running,false);assert.equal(started[0].aborted,true);
  assert.deepEqual(one.recent(),['f','e','d','c','b']);
});

test('최신 5개에서 빠진 채팅은 새로고침해도 재개하지 않고 남은 채팅만 재개한다',async()=>{
  const storage=stateStorage(new Map([[CHAT_CACHE_RECENT_KEY,JSON.stringify(['f','e','d','c','b'])]])),pages=new Map([[null,{items:[],next_cursor:null}]]);
  const removed=cacheWorkerHarness({managed:true,chatStorage:storage,pages,href:'https://chatgpt.com/c/a'});await removed.login();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(removed.calls.metadata.length,0);assert.equal(removed.session.enabled,false);
  const kept=cacheWorkerHarness({managed:true,chatStorage:storage,pages,href:'https://chatgpt.com/c/b'});await kept.login();
  await until(()=>kept.status().thumbnailProgress.complete,'retained chat did not resume');assert.deepEqual(JSON.parse(storage.getItem(CHAT_CACHE_RECENT_KEY)),['f','e','d','c','b']);
  kept.session.stop();assert.deepEqual(JSON.parse(storage.getItem(CHAT_CACHE_RECENT_KEY)),['f','e','d','c']);
});

test('자동 재개는 등록 순서를 바꾸지 않고 실제 목록 재열기만 최근 순서를 갱신한다',async()=>{
  const storage=stateStorage(new Map([[CHAT_CACHE_RECENT_KEY,JSON.stringify(['a','b','c','d','test'])]]));
  const h=cacheWorkerHarness({managed:true,chatStorage:storage,pages:new Map([[null,{items:[],next_cursor:null}]])});await h.login();
  await until(()=>h.status().thumbnailProgress.complete,'resume did not finish');assert.deepEqual(JSON.parse(storage.getItem(CHAT_CACHE_RECENT_KEY)),['a','b','c','d','test']);
  h.catalog.refreshOnOpen();assert.deepEqual(JSON.parse(storage.getItem(CHAT_CACHE_RECENT_KEY)),['test','a','b','c','d']);h.session.stop();
});

test('등록 목록의 중복·잘못된 ID·초과 항목은 정리하고 삭제 감지 때는 목록에서 제거한다',()=>{
  const storage=stateStorage(new Map([[CHAT_CACHE_RECENT_KEY,JSON.stringify(['a','a','bad/id',null,'b','c','d','e','f'])]]));
  const s=new ChatCacheSession({storage,start(){},cancel(){}});s.route('https://chatgpt.com/c/a');
  assert.deepEqual(JSON.parse(storage.getItem(CHAT_CACHE_RECENT_KEY)),['a','b','c','d','e']);s.deleted('c');
  assert.deepEqual(JSON.parse(storage.getItem(CHAT_CACHE_RECENT_KEY)),['a','b','d','e']);assert.equal(storage.values.size,1);
});

test('저장 실패 뒤 목록을 다시 등록해도 이미 완료한 큰 미리보기를 실패로 바꾸지 않는다',async()=>{
  const h=previewLoaderHarness({load:async()=>new Response('image',{headers:{'Content-Type':'image/png'}})});
  const one=ref('one'),items=[one,ref('two'),ref('three')];
  h.register([one]);h.loader.finish('scope-a',[one]);await until(()=>h.loader.inventory.summary().complete,'first preview not committed');
  const put=h.cache.storage.put.bind(h.cache.storage);
  h.cache.storage.put=(store,record)=>record.key===h.key('two')?Promise.reject(new DOMException('Quota','QuotaExceededError')):put(store,record);
  h.register(items);h.loader.finish('scope-a',items);await until(()=>h.loader.paused&&h.loader.tasks.size===0,'write error did not pause');
  h.register(items);h.loader.finish('scope-a',items);
  const progress=h.loader.inventory.summary();assert.equal(progress.ready,1);assert.equal(progress.failed,1);assert.equal(progress.pending,1);
  assert.equal(h.database.stores.get('previews').has(h.key('one')),true);assert.ok(await h.cache.get(h.key('one')));
  assert.equal(h.loader.inventory.summary().ready,1);h.loader.reset();h.cache.clear();
});

test('캐시 읽기 실패는 미확인 항목을 전부 실패로 만들지 않고 디스크 확인·목록 갱신 뒤 복구한다',async()=>{
  let loads=0;const h=previewLoaderHarness({load:async()=>{loads++;return new Response('image',{headers:{'Content-Type':'image/png'}})}});
  const items=['one','two','three'].map(ref);
  for(const item of items){const result=await h.cache.store(h.key(item.id),new Blob(['cached'],{type:'image/png'}));await result.committed;}
  const get=h.cache.storage.get.bind(h.cache.storage);let blocked=true;
  h.cache.storage.get=(store,key)=>blocked?Promise.reject(new DOMException('Busy','TimeoutError')):get(store,key);
  h.register(items);h.loader.finish('scope-a',items);await until(()=>h.loader.paused&&h.loader.tasks.size===0,'read failure did not pause');
  assert.equal(h.loader.inventory.summary().failed,0);assert.equal(h.loader.inventory.summary().pending,3);assert.equal(loads,0);
  blocked=false;assert.ok(await h.cache.get(h.key('one')));assert.equal(h.loader.inventory.summary().ready,1);
  h.register(items);assert.equal(h.loader.inventory.summary().ready,1,'re-registration must preserve the confirmed disk hit');
  h.loader.finish('scope-a',items);await until(()=>h.loader.inventory.summary().complete,'refresh did not recover cached records');
  assert.equal(h.loader.paused,null);assert.equal(h.loader.inventory.summary().failed,0);assert.equal(loads,0,'no cached file should be redownloaded');
  h.loader.reset();h.cache.clear();
});

test('캐시 정리 실패는 이미 성공한 이미지 저장 커밋과 완료 알림을 실패로 바꾸지 않는다',async()=>{
  const h=diskPreviewHarness(),confirmed=[];h.cache.onReady=record=>confirmed.push(record.key);
  let cleanups=0;h.cache.prune=async()=>{cleanups++;throw new Error('cleanup failed')};
  const key=h.key('one'),result=await h.cache.store(key,new Blob(['image'],{type:'image/png'}));
  assert.equal(await result.committed,true);assert.equal(cleanups,1);assert.equal(h.database.stores.get('previews').has(key),true);
  assert.deepEqual(confirmed,[key]);h.cache.clear();
});

test('일시중단 중 디스크에서 확인한 큰 미리보기는 실패 집계에서 완료로 옮긴다',async()=>{
  const h=previewLoaderHarness({load:async()=>new Response('{}',{status:403})}),item=ref('one');
  h.register([item]);h.loader.finish('scope-a',[item]);await until(()=>h.loader.inventory.summary().failed===1&&h.loader.tasks.size===0,'image error not reported');
  const key=h.key('one');const result=await h.cache.store(key,new Blob(['recovered'],{type:'image/png'}));await result.committed;
  assert.equal(h.loader.inventory.summary().ready,1);assert.equal(h.loader.inventory.summary().failed,0);
  h.loader.inventory.mark(JSON.stringify(['',item.id,item.asset_pointer,item.thumbnail_asset_pointer]),'failed');
  h.loader.paused=Object.assign(new Error('old read failure'),{cacheStorageFailure:true,cacheStorageOperation:'read'});
  assert.ok(await h.cache.get(key));assert.equal(h.loader.inventory.summary().ready,1);assert.equal(h.loader.inventory.summary().failed,0);
  h.loader.reset();h.cache.clear();
});

test('마지막 전체 목록 갱신 성공 후 30분 이내에는 메뉴·fetch 재열기 모두 자동 조회를 생략한다',async()=>{
  const one={...ref('one'),id:'AccountUserId_user~refimage_one'};
  const h=await cachedAccountHarness({cached:[one],ageMinutes:29});
  const record=h.database.stores.get('catalogs').get(h.key),savedAt=record.savedAt;
  await h.open();h.catalog.refreshOnOpen();h.catalog.refreshOnOpen();await h.open();
  await until(()=>h.status().thumbnailProgress.complete&&h.status().previewProgress.complete,'image caching did not proceed');
  assert.equal(h.calls.metadata.length,0);assert.equal(h.catalog.records.get(h.key).savedAt,savedAt,'serving a cache must not extend the refresh clock');
  assert.equal(h.status().backgroundCatalogRefreshes,0);h.cache.accessWrites.clear();
});

test('30분이 지나면 캐시부터 반환하고 갱신을 한 번 공유하며 성공 시점부터 다시 30분을 센다',async()=>{
  const one={...ref('one'),id:'AccountUserId_user~refimage_one'};let release;
  const h=await cachedAccountHarness({cached:[one],ageMinutes:30,request:()=>new Promise(resolve=>{release=()=>resolve(new Response(JSON.stringify({items:[one],next_cursor:null})))} )});
  const savedAt=h.database.stores.get('catalogs').get(h.key).savedAt;
  assert.equal((await(await h.open()).json()).items.length,1);await until(()=>release,'due refresh missing');
  h.catalog.refreshOnOpen();await h.open();assert.equal(h.calls.metadata.length,1);assert.equal(h.catalog.records.get(h.key).savedAt,savedAt);
  release();await until(()=>!h.status().backgroundCatalogRefreshes,'refresh did not finish');
  assert.ok(h.catalog.records.get(h.key).savedAt>savedAt);h.catalog.refreshOnOpen();await h.open();assert.equal(h.calls.metadata.length,1);
  h.cache.accessWrites.clear();
});

test('갱신 실패는 마지막 성공 시각을 바꾸지 않아 다음 열기에서 다시 시도한다',async()=>{
  const one={...ref('one'),id:'AccountUserId_user~refimage_one'};
  const h=await cachedAccountHarness({cached:[one],ageMinutes:31,request:async()=>new Response('{}',{status:403})});
  const savedAt=h.database.stores.get('catalogs').get(h.key).savedAt;
  await h.open();await until(()=>h.status().catalogFetchFailed,'refresh error missing');assert.equal(h.catalog.records.get(h.key).savedAt,savedAt);
  await h.open();await until(()=>h.calls.metadata.length===2&&!h.status().backgroundCatalogRefreshes,'failed refresh was incorrectly throttled');
  assert.equal(h.catalog.records.get(h.key).savedAt,savedAt);h.cache.accessWrites.clear();
});

test('수동 새로고침 아이콘은 30분 이내에도 즉시 서버 목록을 다시 받는다',async()=>{
  const one={...ref('one'),id:'AccountUserId_user~refimage_one'};const h=await cachedAccountHarness({cached:[one],ageMinutes:1});
  await h.open();assert.equal(h.calls.metadata.length,0);
  const state={status:{},input:{value:''}};const session=h.menuController.refreshList(state);assert.ok(session);
  await until(()=>h.calls.metadata.length===1&&!h.status().backgroundCatalogRefreshes,'manual refresh was blocked by interval');
  assert.equal(h.status().catalogFetchFailed,false);h.cache.accessWrites.clear();
});

test('30분 이내 새 탭의 캐시 재사용은 전체 목록을 받지 않고 빠진 이미지 캐싱만 재개한다',async()=>{
  const one={...ref('one'),id:'AccountUserId_user~refimage_one'},h=await cachedAccountHarness({cached:[one],ageMinutes:5});
  const tab=cacheWorkerHarness({database:h.database,pages:new Map([[null,{items:[one],next_cursor:null}]])});await tab.login();
  await until(()=>tab.status().identityReady,'current user not confirmed');await tab.open();
  await until(()=>tab.status().thumbnailProgress.complete&&tab.status().previewProgress.complete,'missing images did not cache');
  assert.equal(tab.calls.metadata.length,0);assert.equal(tab.calls.images.length,1,'image work stays independent of catalog refresh');
  h.cache.accessWrites.clear();tab.cache.accessWrites.clear();
});


test('작은/큰 캐시는 성공·실패·전체를 같은 묶음에 넣고 별도 실패 수를 표시하지 않는다',()=>{
  const progress={total:null,discovered:10,ready:6,failed:2,pending:2};
  const model=referenceStatus({progress,locale:'ko',previewProgress:{...progress,total:10,ready:7,failed:0,pending:3}});
  const small=model.tokens.find(token=>token.icon==='database'),large=model.tokens.find(token=>token.icon==='image');
  assert.equal(small.value,'6/2/?');assert.equal(large.value,'7/0/10');
  assert.deepEqual(small.parts.map(part=>part.kind),['success','failure','total']);
  assert.deepEqual(large.parts.map(part=>part.value),['7','0','10']);
  assert.equal(model.tokens.some(token=>token.icon==='error'&&token.value!==undefined),false);
  assert.match(model.detail,/썸네일 캐시 성공\/실패\/전체 6\/2\/\?/);
});

test('완료한 작은·큰 캐시는 전체 수만 표시하고 실패·대기가 생기면 세 수치로 복귀한다', () => {
  const done = { total: 120, discovered: 120, ready: 120, failed: 0, pending: 0 };
  const counter = (model, icon) => model.tokens.find(token => token.icon === icon);
  const complete = referenceStatus({ progress: done, previewProgress: done, locale: 'en' });
  for (const icon of ['database', 'image']) {
    const token = counter(complete, icon);
    assert.equal(token.value, '120');
    assert.deepEqual(token.parts, [{ kind: 'total', value: '120' }]);
    assert.match(token.label, /complete/i);
    assert.doesNotMatch(token.label, /success\/failure\/total/);
  }
  const failure = { ...done, ready: 119, failed: 1 };
  const independent = referenceStatus({ progress: done, previewProgress: failure });
  assert.equal(counter(independent, 'database').value, '120');
  assert.equal(counter(independent, 'image').value, '119/1/120');
  const pending = referenceStatus({ progress: { ...done, ready: 119, pending: 1 }, previewProgress: done });
  assert.equal(counter(pending, 'database').value, '119/0/120');
  assert.equal(counter(pending, 'image').value, '120');
  const recovered = referenceStatus({ progress: done, previewProgress: done });
  assert.equal(counter(recovered, 'image').value, '120');
});

test('전체 미확정·불일치 상태는 완료로 줄이지 않고 확정된 빈 캐시는 0으로 표시한다', () => {
  const done = { total: 120, discovered: 120, ready: 120, failed: 0, pending: 0 };
  for (const changed of [{ total: null }, { discovered: 121 }, { pending: 1 }, { failed: 1 }]) {
    const token = referenceStatus({ progress: { ...done, ...changed } }).tokens.find(token => token.icon === 'database');
    assert.equal(token.parts.length, 3, JSON.stringify(changed));
    assert.equal(token.value.split('/').length, 3);
  }
  const empty = { total: 0, discovered: 0, ready: 0, failed: 0, pending: 0 };
  const model = referenceStatus({ progress: empty, previewProgress: empty });
  assert.equal(model.tokens.find(token => token.icon === 'database').value, '0');
  assert.equal(model.tokens.find(token => token.icon === 'image').value, '0');
});

test('완료 수치가 축약되어도 캐시 중단·저장소 오류와 갱신 표시는 유지한다', () => {
  const done = { total: 5, discovered: 5, ready: 5, failed: 0, pending: 0 };
  const model = referenceStatus({ progress: done, previewProgress: done, previewPaused: true,
    previewCaching: true, refreshing: true, storageWriteFailed: true });
  const preview = model.tokens.find(token => token.icon === 'image');
  assert.equal(preview.value, '5');
  assert.equal(preview.error, true);
  assert.equal(preview.busy, false);
  assert.equal(model.tokens.find(token => token.icon === 'refresh').busy, true);
  assert.equal(model.tokens.find(token => token.icon === 'save').error, true);
});

test('UI 언어는 지역·문자 변형을 해석하고 지원하지 않는 언어는 영어로 돌아간다', () => {
  for (const [input, expected] of [
    ['en-US', 'en'], ['ko_KR', 'ko'], ['ja-JP', 'ja'], ['es-419', 'es'], ['fr-CA', 'fr'],
    ['de-DE', 'de'], ['pt', 'pt-BR'], ['pt-PT', 'pt-BR'], ['ru-RU', 'ru'],
    ['zh', 'zh-CN'], ['zh-SG', 'zh-CN'], ['zh-Hans', 'zh-CN'], ['zh-Hans-CN', 'zh-CN'],
    ['zh-Hant', 'zh-TW'], ['zh-Hant-HK', 'zh-TW'], ['zh-HK', 'zh-TW'], ['zh-MO', 'zh-TW'],
    ['zh-TW', 'zh-TW'], ['unsupported', 'en'], ['', 'en'],
  ]) assert.equal(resolveUiLocale(input), expected, input);
  assert.equal(resolveUiLocale(['unsupported', 'de-AT', 'ko']), 'de');
  assert.equal(resolveUiLocale([]), 'en');
});

test('페이지 UI 언어가 브라우저 언어보다 우선하고 언어 변경을 다시 읽는다', t => {
  const original = new Map(['document', 'navigator'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  t.after(() => {
    for (const [key, descriptor] of original) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  const root = { lang: 'ja' };
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { documentElement: root } });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { languages: ['de-DE', 'ko'], language: 'ko' } });
  assert.equal(uiLocale(), 'ja');
  root.lang = 'fr-CA';
  assert.equal(uiLocale(), 'fr');
  root.lang = 'unsupported';
  assert.equal(uiLocale(), 'en', 'an unsupported page language must not switch to another browser preference');
  root.lang = '';
  assert.equal(uiLocale(), 'de');
  delete globalThis.document;
  assert.equal(uiLocale(), 'de');
  delete globalThis.navigator;
  assert.equal(uiLocale(), 'en');
});

test('10개 UI 번역의 키와 매개변수가 일치하고 숫자 0·알 수 없는 언어도 처리한다', () => {
  const locales = ['de', 'en', 'es', 'fr', 'ja', 'ko', 'pt-BR', 'ru', 'zh-CN', 'zh-TW'];
  assert.deepEqual(Object.keys(UI_MESSAGES).sort(), locales);
  const keys = Object.keys(UI_MESSAGES.en).sort();
  assert.equal(keys.length, 40);
  const placeholders = text => [...text.matchAll(/\{([^}]+)\}/g)].map(match => match[1]).sort();
  for (const locale of locales) {
    assert.deepEqual(Object.keys(UI_MESSAGES[locale]).sort(), keys, locale);
    for (const key of keys) {
      const text = UI_MESSAGES[locale][key];
      assert.equal(typeof text, 'string', `${locale}/${key}`);
      assert.ok(text.trim(), `${locale}/${key}`);
      assert.deepEqual(placeholders(text), placeholders(UI_MESSAGES.en[key]), `${locale}/${key}`);
      assert.doesNotMatch(translateUi(key, { count: 0, label: 'CACHE' }, locale), /\{(?:count|label)\}/);
    }
  }
  assert.equal(translateUi('pending', { count: 0 }, 'en'), 'Pending: 0');
  assert.equal(translateUi('searchLabel', {}, 'unsupported'), 'Search reference names');
  assert.equal(translateUi('unknownMessage', {}, 'fr'), 'unknownMessage');
});

test('집계 도움말·접근성 문구·새로고침 동작 안내와 숫자는 선택한 언어를 따른다', () => {
  const progress = { total: 1234, discovered: 1234, ready: 1200, failed: 0, pending: 34 };
  const busy = { complete: false, failed: false, controller: new AbortController() };
  for (const locale of Object.keys(UI_MESSAGES)) {
    const model = referenceStatus({ progress, locale, caching: true, query: 'ref', matched: 1 });
    assert.equal(model.tokens.find(token => token.icon === 'search').label, UI_MESSAGES[locale].searchResults);
    assert.ok(model.detail.includes(UI_MESSAGES[locale].caching), locale);
    assert.equal(referenceRefreshState(busy, true, false, locale).title, UI_MESSAGES[locale].refreshingRestart);
    assert.equal(referenceRefreshState(null, false, false, locale).title, UI_MESSAGES[locale].connectingReferences);
    assert.equal(referenceRefreshState(null, true, true, locale).title, UI_MESSAGES[locale].selectingReference);
  }
  assert.equal(referenceStatus({ progress, locale: 'en' }).tokens.find(token => token.icon === 'list').value, '1,234');
  assert.equal(referenceStatus({ progress, locale: 'de' }).tokens.find(token => token.icon === 'list').value, '1.234');
});

test('문자 아이콘은 음의 베어링·비대칭 높이와 서로 다른 기준선에서도 잉크 중심을 맞춘다', () => {
  const samples = [
    { actualBoundingBoxLeft: -2.25, actualBoundingBoxRight: 12.75, actualBoundingBoxAscent: 10.25, actualBoundingBoxDescent: 2.5 },
    { actualBoundingBoxLeft: 9, actualBoundingBoxRight: -2, actualBoundingBoxAscent: 2, actualBoundingBoxDescent: 8 },
    { actualBoundingBoxLeft: 4, actualBoundingBoxRight: 8, actualBoundingBoxAscent: -1, actualBoundingBoxDescent: 7 },
  ];
  for (const metrics of samples) for (const baseline of [-3, 0, 7.5, 14]) for (const size of [18, 24.5]) {
    const position = glyphPosition(metrics, baseline, size);
    assert.ok(position, JSON.stringify({ metrics, baseline, size }));
    const inkLeft = position.left - metrics.actualBoundingBoxLeft;
    const inkRight = position.left + metrics.actualBoundingBoxRight;
    const inkTop = position.top + baseline - metrics.actualBoundingBoxAscent;
    const inkBottom = position.top + baseline + metrics.actualBoundingBoxDescent;
    assert.ok(Math.abs((inkLeft + inkRight) / 2 - size / 2) < 1e-9, 'horizontal ink center');
    assert.ok(Math.abs((inkTop + inkBottom) / 2 - size / 2) < 1e-9, 'vertical ink center');
  }
  const metrics = samples[0];
  assert.deepEqual(glyphPosition(metrics, 12), glyphPosition(metrics, 12, 18), 'default frame is 18px');
});

test('문자 아이콘의 경계값이 없거나 유효한 잉크 영역이 아니면 기본 배치로 돌아간다', () => {
  const good = { actualBoundingBoxLeft: 2, actualBoundingBoxRight: 8, actualBoundingBoxAscent: 9, actualBoundingBoxDescent: 3 };
  for (const metrics of [null, undefined, {}, { width: 10 },
    { ...good, actualBoundingBoxLeft: -8 }, { ...good, actualBoundingBoxLeft: -9 },
    { ...good, actualBoundingBoxDescent: -9 }, { ...good, actualBoundingBoxDescent: -10 }]) {
    assert.equal(glyphPosition(metrics, 12), null);
  }
  for (const key of Object.keys(good)) for (const invalid of [NaN, Infinity, -Infinity, undefined, '5']) {
    assert.equal(glyphPosition({ ...good, [key]: invalid }, 12), null, `${key}: ${String(invalid)}`);
  }
  for (const baseline of [NaN, Infinity, -Infinity, undefined, '12']) {
    assert.equal(glyphPosition(good, baseline), null, `baseline: ${String(baseline)}`);
  }
  for (const size of [0, -1, NaN, Infinity, -Infinity, '18']) {
    assert.equal(glyphPosition(good, 12, size), null, `size: ${String(size)}`);
  }
});


function focusGateFixture(props = {}) {
  const input = {}, row = {}, outside = {};
  const attributes = new Map([['data-state', 'open']]);
  const members = new Set([input, row]);
  const menu = { id: 'reference-focus-menu', isConnected: true,
    getAttribute: name => attributes.get(name) ?? null,
    contains(target) {
      if (target?.notANode) throw new TypeError('Expected Node');
      return target === menu || members.has(target);
    }, __reactProps$fixture: Object.freeze(props) };
  let registered = [menu];
  return { menu, input, row, outside, attributes,
    getMenus: () => registered.values(), setMenus: menus => { registered = menus; } };
}

test('참조 목록 포커스 이탈만 무시하고 동결된 원본 props와 선택·키보드 콜백은 보존한다', () => {
  let blurred = 0, captured = 0, clicked = 0, keyed = 0;
  const h = focusGateFixture({ onBlur: () => blurred++, onBlurCapture: () => captured++,
    onClick: () => clicked++, onKeyDown: () => keyed++ });
  const original = h.menu.__reactProps$fixture;
  const gate = new ReferenceFocusGate(h.getMenus);
  gate.prepare(h.menu);
  const patched = h.menu.__reactProps$fixture;
  assert.notEqual(patched, original);
  assert.notEqual(patched.onBlur, original.onBlur);
  assert.notEqual(patched.onBlurCapture, original.onBlurCapture);
  for (const relatedTarget of [h.outside, null, { notANode: true }]) {
    const event = { target: h.input, relatedTarget };
    patched.onBlur(event); patched.onBlurCapture(event);
  }
  assert.equal(blurred, 0); assert.equal(captured, 0);
  patched.onClick(); patched.onKeyDown();
  assert.equal(clicked, 1); assert.equal(keyed, 1);
  assert.equal(patched.onClick, original.onClick); assert.equal(patched.onKeyDown, original.onKeyDown);
  original.onBlur({}); original.onBlurCapture({});
  assert.equal(blurred, 1); assert.equal(captured, 1);
  assert.equal(Object.isFrozen(original), true);
});

test('목록 내부 포커스 이동은 원래 핸들러의 this·인수·반환값을 유지한다', () => {
  const calls = [], receiver = {};
  const original = function (...args) { calls.push({ receiver: this, args }); return 'native blur'; };
  const h = focusGateFixture({ onBlur: original, onBlurCapture: original });
  const gate = new ReferenceFocusGate(h.getMenus);
  gate.prepare(h.menu);
  const event = { target: h.input, relatedTarget: h.row }, extra = {};
  for (const name of ['onBlur', 'onBlurCapture']) {
    assert.equal(h.menu.__reactProps$fixture[name].call(receiver, event, extra), 'native blur');
  }
  assert.equal(calls.length, 2);
  for (const call of calls) { assert.equal(call.receiver, receiver); assert.deepEqual(call.args, [event, extra]); }
});

test('닫히는 중·연결 해제·등록 해제된 목록의 blur 정리는 가로막지 않는다', () => {
  let blurred = 0;
  const h = focusGateFixture({ onBlur: () => blurred++, onBlurCapture: () => blurred++ });
  const gate = new ReferenceFocusGate(h.getMenus);
  gate.prepare(h.menu);
  const blur = () => {
    h.menu.__reactProps$fixture.onBlur({ target: h.input, relatedTarget: h.outside });
    h.menu.__reactProps$fixture.onBlurCapture({ target: h.input, relatedTarget: null });
  };
  h.attributes.set('data-state', 'closed'); blur();
  h.attributes.set('data-state', 'open'); h.menu.isConnected = false; blur();
  h.menu.isConnected = true; h.setMenus([]); blur();
  assert.equal(blurred, 6);
  for (const type of ['pointerdown', 'click']) gate.handle({ type, target: h.outside });
  assert.equal(blurred, 6);
});

test('focus 캡처에서 새 React props를 다시 준비하되 실제 포커스 이벤트는 취소하지 않는다', () => {
  let blurred = 0;
  const h = focusGateFixture({ onBlur: () => blurred++ });
  const gate = new ReferenceFocusGate(h.getMenus);
  gate.prepare(h.menu);
  const once = h.menu.__reactProps$fixture;
  gate.prepare(h.menu);
  assert.equal(h.menu.__reactProps$fixture, once, 'same prepared props must not wrap twice');
  for (const type of ['blur', 'focusout']) {
    h.menu.__reactProps$fixture = Object.freeze({ onBlur: () => blurred += 10, onFocus: () => 'native focus' });
    const event = { type, target: h.input, relatedTarget: h.outside,
      stopPropagation: () => assert.fail('focus propagation blocked'),
      stopImmediatePropagation: () => assert.fail('focus propagation blocked'),
      preventDefault: () => assert.fail('real focus movement prevented') };
    gate.handle(event);
    const patched = h.menu.__reactProps$fixture;
    patched.onBlur(event);
    assert.equal(blurred, type === 'blur' ? 0 : 10);
    assert.equal(patched.onFocus(), 'native focus');
    patched.onBlur({ target: h.input, relatedTarget: h.row });
  }
  assert.equal(blurred, 20);
});

test('바깥 pointerdown·click은 가로채지 않고 원래 바깥 클릭 동작에 맡긴다', () => {
  let blurred = 0, nativePointer = 0, nativeClick = 0;
  const h = focusGateFixture({ onBlur: () => blurred++,
    onPointerDownCapture: () => nativePointer++, onClick: () => nativeClick++ });
  const original = h.menu.__reactProps$fixture;
  const gate = new ReferenceFocusGate(h.getMenus);
  gate.prepare(h.menu);
  const patched = h.menu.__reactProps$fixture;
  for (const type of ['pointerdown', 'click']) {
    const event = { type, target: h.outside,
      stopPropagation: () => assert.fail('outside control interaction blocked'),
      stopImmediatePropagation: () => assert.fail('outside control interaction blocked'),
      preventDefault: () => assert.fail('outside control default action prevented') };
    assert.equal(gate.handle(event), false);
    assert.equal(h.menu.__reactProps$fixture, patched, 'pointer events must not rebuild or invoke handlers');
    h.menu.__reactProps$fixture.onBlur({ target: h.input, relatedTarget: h.outside });
    assert.equal(blurred, 0, 'a pointer event must not relax focus-only protection');
  }
  assert.equal(patched.onPointerDownCapture, original.onPointerDownCapture);
  assert.equal(patched.onClick, original.onClick);
  assert.equal(nativePointer, 0); assert.equal(nativeClick, 0, 'the gate does not call native pointer handlers itself');
  patched.onPointerDownCapture(); patched.onClick();
  assert.equal(nativePointer, 1); assert.equal(nativeClick, 1);
});

test('목록 내부·자기 트리거 클릭과 Escape 핸들러도 교체하거나 호출하지 않는다', () => {
  let clicked = 0, escaped = 0;
  const h = focusGateFixture({ onBlur() {}, onClick: () => clicked++,
    onKeyDown(event) { if (event.key === 'Escape') escaped++; } });
  const original = h.menu.__reactProps$fixture;
  const gate = new ReferenceFocusGate(h.getMenus);
  const trigger = { closest: () => assert.fail('the focus gate must not inspect click targets') };
  for (const type of ['pointerdown', 'click']) for (const target of [h.input, h.row, trigger]) {
    assert.equal(gate.handle({ type, target }), false);
  }
  assert.equal(gate.handle({ type: 'keydown', key: 'Escape', target: h.input }), false);
  assert.equal(h.menu.__reactProps$fixture, original, 'native click and key handling remains untouched');
  assert.equal(clicked, 0); assert.equal(escaped, 0);
  gate.prepare(h.menu);
  assert.equal(h.menu.__reactProps$fixture.onClick, original.onClick);
  assert.equal(h.menu.__reactProps$fixture.onKeyDown, original.onKeyDown);
  h.menu.__reactProps$fixture.onClick();
  h.menu.__reactProps$fixture.onKeyDown({ key: 'Escape' });
  assert.equal(clicked, 1); assert.equal(escaped, 1);
});

test('등록한 참조 목록만 보호하고 관련 없는 UI의 blur 핸들러는 그대로 둔다', () => {
  let referenceBlur = 0, unrelatedBlur = 0;
  const h = focusGateFixture({ onBlur: () => referenceBlur++ });
  const unrelated = focusGateFixture({ onBlur: () => unrelatedBlur++ });
  const original = unrelated.menu.__reactProps$fixture;
  const gate = new ReferenceFocusGate(h.getMenus);
  gate.handle({ type: 'focusout', target: unrelated.input, relatedTarget: h.outside });
  assert.equal(unrelated.menu.__reactProps$fixture, original);
  original.onBlur({ target: unrelated.input, relatedTarget: h.outside });
  assert.equal(unrelatedBlur, 1);
  gate.handle({ type: 'focusout', target: h.input, relatedTarget: h.outside });
  h.menu.__reactProps$fixture.onBlur({ target: h.input, relatedTarget: h.outside });
  assert.equal(referenceBlur, 0);
  const withoutReactProps = { isConnected: true, contains: () => true, getAttribute: () => 'open' };
  assert.doesNotThrow(() => gate.prepare(withoutReactProps));
});

// Shaped like Radix Menu in the live bundle: Menu root effects -> Popper -> MenuProvider(content) -> ... -> content node.
function windowBlurFixture({ react18 = false, cleanupSource = null } = {}) {
  const listeners = new Set(), removed = [];
  const view = {
    addEventListener(type, fn) { if (type === 'blur') listeners.add(fn); },
    removeEventListener(type, fn) { if (type === 'blur') { listeners.delete(fn); removed.push(fn); } },
    dispatchBlur() { for (const fn of [...listeners]) if (listeners.has(fn)) fn({ type: 'blur', target: view }); },
  };
  const focus = focusGateFixture({ onBlur() {} });
  const menu = focus.menu;
  const state = { open: true, closed: 0, keyboardCleanup: 0 };
  const onOpenChange = open => { if (!open) { state.open = false; state.closed++; } };
  const keyboardEffect = {
    tag: 9, deps: [],
    create: () => { document.addEventListener('keydown', () => {}); return () => { state.keyboardCleanup++; }; },
  };
  const blurEffect = { tag: 9 };
  blurEffect.create = cleanupSource ? cleanupSource.create : () => {
    if (!state.open) return;
    const handleBlur = () => onOpenChange(false);
    return window.addEventListener('blur', handleBlur), () => window.removeEventListener('blur', handleBlur);
  };
  const run = effect => {
    // Evaluate the effect against the fake window, as React would run it in the page.
    const destroy = new Function('window', 'document', 'state', 'onOpenChange',
      `return (${Function.prototype.toString.call(effect.create)})()`)(view, { addEventListener() {} }, state, onOpenChange);
    if (react18) effect.destroy = destroy; else effect.inst = { destroy };
  };
  const mount = () => {
    for (const effect of [keyboardEffect, blurEffect]) run(effect);
    keyboardEffect.inst && (keyboardEffect.inst.destroy = () => { state.keyboardCleanup++; });
    if (react18) keyboardEffect.destroy = () => { state.keyboardCleanup++; };
  };
  keyboardEffect.next = blurEffect; blurEffect.next = keyboardEffect;
  const root = { type: { name: 'Menu' }, memoizedProps: { open: true }, updateQueue: { lastEffect: blurEffect }, return: null };
  const popper = { memoizedProps: {}, updateQueue: null, return: root };
  const provider = { memoizedProps: { scope: undefined, open: true, onOpenChange, content: menu }, return: popper };
  const rootProvider = { memoizedProps: { onClose() {} }, return: provider };
  const content = { memoizedProps: { role: 'menu' }, return: rootProvider };
  menu.__reactFiber$fixture = content;
  mount();
  return { ...focus, view, listeners, removed, state, root, provider, keyboardEffect, blurEffect, mount };
}

test('창 전환 window blur에서 참조 메뉴의 네이티브 blur 리스너만 해제해 목록을 유지한다', () => {
  for (const react18 of [false, true]) {
    const h = windowBlurFixture({ react18 });
    const gate = new ReferenceFocusGate(h.getMenus, h.view);
    assert.equal(h.listeners.size, 1);
    // The gate is registered as a window capture listener before the app's listener.
    const event = { type: 'blur', target: h.view,
      stopPropagation: () => assert.fail('window blur propagation blocked'),
      stopImmediatePropagation: () => assert.fail('window blur propagation blocked'),
      preventDefault: () => assert.fail('window blur default prevented') };
    assert.equal(gate.handle(event), true);
    h.view.dispatchBlur();
    assert.equal(h.state.closed, 0, 'the reference menu stays open');
    assert.equal(h.listeners.size, 0);
    assert.equal(h.state.keyboardCleanup, 0, 'other Menu effects are left alone');
    assert.equal(gate.windowBlurReleases, 1);
    // Repeated window blur does not call the same cleanup again.
    assert.equal(gate.handle(event), false);
    assert.equal(h.removed.length, 1);
    // Reopening runs the effect again; the new listener is released on the next window blur.
    h.mount();
    assert.equal(h.listeners.size, 1);
    assert.equal(gate.handle(event), true);
    h.view.dispatchBlur();
    assert.equal(h.state.closed, 0);
    assert.equal(gate.windowBlurReleases, 2);
  }
});

test('닫힘·연결 해제·미등록 목록과 요소 blur에서는 네이티브 window blur 닫기를 유지한다', () => {
  const cases = [
    h => h.attributes.set('data-state', 'closed'),
    h => { h.menu.isConnected = false; },
    h => h.setMenus([]),
  ];
  for (const change of cases) {
    const h = windowBlurFixture();
    const gate = new ReferenceFocusGate(h.getMenus, h.view);
    change(h);
    assert.equal(gate.handle({ type: 'blur', target: h.view }), false);
    h.view.dispatchBlur();
    assert.equal(h.state.closed, 1);
  }
  const h = windowBlurFixture();
  const gate = new ReferenceFocusGate(h.getMenus, h.view);
  gate.handle({ type: 'blur', target: h.input, relatedTarget: null });
  gate.handle({ type: 'focusout', target: h.view });
  assert.equal(h.listeners.size, 1, 'only a blur targeting the window releases the listener');
  const withoutView = new ReferenceFocusGate(h.getMenus);
  assert.equal(withoutView.handle({ type: 'blur', target: h.view }), false);
  assert.equal(h.listeners.size, 1);
});

test('다른 메뉴 provider를 넘거나 다른 정리까지 포함한 cleanup은 호출하지 않는다', () => {
  {
    // A parent menu's root above another provider must not be released for this menu.
    const h = windowBlurFixture();
    const nested = { memoizedProps: { content: { nodeType: 1 } }, return: h.root };
    h.provider.return.return = nested;
    h.provider.return = { memoizedProps: {}, return: nested };
    const gate = new ReferenceFocusGate(h.getMenus, h.view);
    assert.equal(gate.handle({ type: 'blur', target: h.view }), false);
    assert.equal(h.listeners.size, 1);
  }
  {
    // Shared hooks that also remove resize or other listeners are not this menu's dedicated window blur effect.
    const h = windowBlurFixture({ cleanupSource: { create: () => {
      const handleBlur = () => onOpenChange(false), resize = () => {};
      window.addEventListener('blur', handleBlur);
      return () => { window.removeEventListener('blur', handleBlur); window.removeEventListener('resize', resize); };
    } } });
    const gate = new ReferenceFocusGate(h.getMenus, h.view);
    assert.equal(gate.handle({ type: 'blur', target: h.view }), false);
    assert.equal(h.listeners.size, 1);
  }
  {
    // Without a provider whose content is this menu, nothing is released.
    const h = windowBlurFixture();
    h.provider.memoizedProps = { ...h.provider.memoizedProps, content: null };
    const gate = new ReferenceFocusGate(h.getMenus, h.view);
    assert.equal(gate.handle({ type: 'blur', target: h.view }), false);
    assert.equal(h.listeners.size, 1);
  }
  {
    // A throwing cleanup keeps the native listener and does not escape the window listener.
    const h = windowBlurFixture();
    h.blurEffect.inst.destroy = function () { window.removeEventListener('blur', boom); };
    const gate = new ReferenceFocusGate(h.getMenus, h.view);
    assert.doesNotThrow(() => gate.handle({ type: 'blur', target: h.view }));
    assert.equal(gate.windowBlurReleases, 0);
  }
});


test('참조 버튼으로 들어오는 직전 요소의 out 이벤트에서 재렌더된 호버 props를 다시 막고 이벤트는 통과시킨다', () => {
  let hovered = 0;
  const button = { __reactProps$fixture: { onPointerEnter: () => hovered++ } };
  const sibling = {};
  const gate = new ReferenceClickGate(target => target === button ? button : null);
  gate.prepare(button);
  // A re-render replaces DOM-side props without any attribute mutation.
  button.__reactProps$fixture = { onPointerEnter: () => hovered++, onMouseEnter: () => hovered++ };
  for (const type of ['pointerout', 'mouseout']) {
    const event = { type, target: sibling, relatedTarget: button,
      stopImmediatePropagation: () => assert.fail('the previous element\'s leave event must still propagate') };
    assert.equal(gate.handle(event), false);
  }
  button.__reactProps$fixture.onPointerEnter(); button.__reactProps$fixture.onMouseEnter();
  assert.equal(hovered, 0, 'React reads the refreshed props when it derives onPointerEnter from the out event');
  const unrelated = { __reactProps$fixture: Object.freeze({ onPointerEnter: () => hovered++ }) };
  gate.handle({ type: 'pointerout', target: sibling, relatedTarget: unrelated });
  unrelated.__reactProps$fixture.onPointerEnter();
  assert.equal(hovered, 1);
});

test('같은 상태줄 모델은 다시 그리지 않아 진행 애니메이션과 툴팁을 유지하고 값·언어가 바뀌면 다시 그린다', () => {
  const previous = globalThis.document;
  const element = () => ({ children: [], attributes: {}, classList: { add() {} }, style: {},
    append(...nodes) { this.children.push(...nodes); }, setAttribute(name, value) { this.attributes[name] = value; } });
  globalThis.document = { documentElement: { lang: 'en' }, createElement: element, createTextNode: text => ({ text }) };
  try {
    let renders = 0;
    const node = { ...element(), replaceChildren() { renders++; } };
    const model = () => referenceStatus({ progress: { discovered: 3, ready: 1, failed: 0, pending: 2, total: 3, complete: false },
      pages: 1, caching: true });
    renderUiStatus(node, model()); renderUiStatus(node, model());
    assert.equal(renders, 1, 'an unchanged progress tick must keep the existing nodes');
    renderUiStatus(node, referenceStatus({ progress: { discovered: 3, ready: 2, failed: 0, pending: 1, total: 3, complete: false },
      pages: 1, caching: true }));
    assert.equal(renders, 2);
    globalThis.document.documentElement.lang = 'ko';
    renderUiStatus(node, referenceStatus({ progress: { discovered: 3, ready: 2, failed: 0, pending: 1, total: 3, complete: false },
      pages: 1, caching: true }));
    assert.equal(renders, 3, 'a language change re-renders');
  } finally { globalThis.document = previous; }
});

test('대체된 큰 미리보기 작업(AbortError)은 마지막 시도에서도 실패가 아니라 대기로 남긴다', async () => {
  let loads = 0;
  const h = previewLoaderHarness({ load: async () => { loads++; throw new DOMException('Preview superseded', 'AbortError'); } });
  const item = ref('one');
  h.register([item]); h.loader.finish('scope-a', [item]);
  await until(() => h.loader.tasks.size === 0, 'superseded preview task did not settle');
  assert.equal(loads, CONFIG.cacheAttempts, 'a superseded write is still retried');
  assert.equal(h.loader.inventory.summary().failed, 0);
  assert.equal(h.loader.inventory.summary().pending, 1);
  h.loader.reset(); h.cache.clear();
});

test('참조 변경 요청은 /me 사용자 ID와 다른 AccountUserId 소유자 범위의 저장 목록도 무효화한다', async () => {
  const one = { ...ref('one'), id: 'AccountUserId_user~refimage_one' };
  const h = await cachedAccountHarness({ cached: [one], ageMinutes: 1 });
  assert.equal(h.database.stores.get('catalogs').has(h.key), true);
  const otherKey = JSON.stringify(['AccountUserId_user', 'other-account']);
  h.database.stores.get('catalogs').set(otherKey, { ...h.database.stores.get('catalogs').get(h.key), key: otherKey });
  await h.window.fetch('https://chatgpt.com/backend-api/files/library/reference-images', {
    method: 'POST', headers: { 'ChatGPT-Account-ID': 'account' } });
  await until(() => !h.database.stores.get('catalogs').has(h.key), 'the stored owner-scoped catalog was not invalidated');
  assert.equal(h.database.stores.get('catalogs').has(otherKey), true, 'another account keeps its catalog');
  // After invalidation the next open verifies live instead of serving the stale snapshot.
  const before = h.calls.metadata.length;
  await h.open();
  assert.equal(h.calls.metadata.length, before + 1);
  h.cache.accessWrites.clear();
});

test('첫 목록 응답을 해석하지 못하면 앱의 원래 목록 요청을 그대로 통과시킨다', async () => {
  const h = cacheWorkerHarness({ pages: new Map(), request: () => new Response('not json', { headers: { 'Content-Type': 'text/plain' } }) });
  const response = await h.open();
  assert.equal(response.ok, true);
  assert.equal(await response.text(), 'not json');
  assert.equal(h.status().catalogFetchFailed, true);
});


// The database refuses the first `denials` opens, then behaves like the normal mock.
function flakyDatabase(denials, hooks = {}) {
  const base = mockDatabase(hooks);
  let opens = 0;
  return { stores: base.stores, get opens() { return opens; }, open(...args) {
    opens += 1;
    if (denials-- > 0) throw new DOMException('Denied', 'UnknownError');
    return base.open(...args);
  } };
}

test('IndexedDB 열기가 실패해도 새로고침 없이 다시 연결하고 멈춘 작은·큰 캐싱을 이어서 끝낸다', async () => {
  const items = ['one', 'two'].map(name => ({ ...ref(name), id: `AccountUserId_user~refimage_${name}` }));
  const database = flakyDatabase(1);
  const h = cacheWorkerHarness({ pages: new Map([[null, { items, next_cursor: null }]]), database, storageReopenMs: 30 });
  assert.equal((await (await h.open()).json()).items.length, 2, 'the catalog is served from the server meanwhile');
  await until(() => h.status().thumbnailProgress.complete && h.status().previewProgress.complete, 'caching did not resume after reconnecting');
  assert.equal(h.status().cacheStorageReconnects, 1);
  assert.equal(h.status().cacheStorageFailed, false);
  assert.equal(h.status().previewCachePaused, false);
  assert.equal(database.stores.get('thumbnails').size, 2);
  assert.equal(database.stores.get('previews').size, 2);
  assert.ok(database.opens >= 2);
  h.cache.accessWrites.clear();
});

test('다른 탭의 스키마 변경으로 닫힌 연결은 다음 요청에서 다시 열고 그동안의 요청도 실패로 남기지 않는다', async () => {
  const one = { ...ref('one'), id: 'AccountUserId_user~refimage_one' };
  const database = flakyDatabase(0);
  const h = cacheWorkerHarness({ pages: new Map([[null, { items: [one], next_cursor: null }]]), database, storageReopenMs: 30 });
  await h.open();
  await until(() => h.status().thumbnailProgress.complete, 'initial caching did not finish');
  const storage = h.cache.storage, connection = storage.db;
  assert.ok(connection);
  connection.onversionchange();
  assert.equal(storage.db, null, 'a versionchange closes and forgets the connection');
  assert.ok(await storage.get('thumbnails', [...database.stores.get('thumbnails').keys()][0]));
  assert.equal(h.status().cacheStorageReconnects, 1);
  assert.equal(database.opens, 2);
  h.cache.accessWrites.clear();
});

test('재연결은 용량 부족 같은 쓰기 오류로 멈춘 캐싱은 다시 시작하지 않는다', async () => {
  const one = { ...ref('one'), id: 'AccountUserId_user~refimage_one' };
  const database = flakyDatabase(0, { commit: async (store, mode) => {
    if (store === 'thumbnails' && mode === 'readwrite') throw new Error('QuotaExceededError');
  } });
  const h = cacheWorkerHarness({ pages: new Map([[null, { items: [one], next_cursor: null }]]), database, storageReopenMs: 30 });
  await h.open();
  await until(() => h.status().thumbnailProgress.failed === 1, 'quota failure did not settle');
  h.cache.storage.db.onversionchange();
  await h.cache.storage.get('catalogs', 'missing');
  assert.equal(h.status().cacheStorageReconnects, 1);
  assert.equal(h.status().cacheStorageFailed, true, 'a quota failure keeps the existing reload policy');
  assert.equal(h.status().thumbnailProgress.failed, 1);
  assert.equal(h.calls.images.length, 1);
});


test('입력창 @ 후보 행은 React 키 reference-image:<id>로 참조 ID를 찾고 강조 상태만 따른다', () => {
  const id = 'AccountUserId_user~refimage_one';
  const row = { __reactFiber$x: { key: null, return: { key: null, return: { key: `reference-image:${id}`, return: null } } } };
  assert.equal(mentionReferenceId(row), id);
  assert.equal(mentionReferenceId({ __reactFiber$x: { key: 'other:1', return: null } }), null);
  assert.equal(mentionReferenceId({}), null, 'rows without React internals are ignored');
  let deep = { key: `reference-image:${id}`, return: null };
  for (let i = 0; i < 12; i++) deep = { key: null, return: deep };
  assert.equal(mentionReferenceId({ __reactFiber$x: deep }), null, 'the lookup stays near the row');
  const attrs = values => ({ getAttribute: name => values[name] ?? null });
  assert.equal(mentionHighlighted(attrs({ 'aria-selected': 'true' })), true);
  assert.equal(mentionHighlighted(attrs({ 'aria-current': 'true' })), true);
  assert.equal(mentionHighlighted(attrs({ 'aria-selected': 'false' })), false);
  assert.equal(mentionHighlighted(null), false);
});

test('강조된 @ 후보는 어느 섹션이든 참조 key가 있는 행만 고른다(정확히 일치 섹션 포함)', () => {
  const referenceRow = { __reactFiber$x: { key: null, return: { key: 'reference-image:AccountUserId_u~refimage_1', return: null } } };
  const otherRow = { __reactFiber$x: { key: 'file:1', return: null } };
  const section = row => ({ querySelector: selector => {
    assert.match(selector, /aria-selected="true"/); assert.match(selector, /aria-current="true"/); return row; } });
  const root = sections => ({ querySelectorAll: selector => { assert.equal(selector, '[data-mention-section-id]'); return sections; } });
  const exact = section(referenceRow);
  assert.deepEqual(highlightedMention(root([section(null), section(otherRow), exact])), { row: referenceRow, section: exact });
  assert.equal(highlightedMention(root([section(otherRow)])), null, 'a highlighted file or tool row is not a reference');
  assert.equal(highlightedMention(root([])), null);
});


test('@ 후보 행의 아이콘 props에서 이미지 포인터를, 참조 ID에서 소유자 범위를 읽는다', () => {
  const icon = { memoizedProps: { assetPointer: 'sediment://file_one', thumbnailAssetPointer: 'sediment://file_one_thumb' }, child: null, sibling: null };
  const label = { memoizedProps: { children: 'one' }, child: null, sibling: icon };
  const row = { __reactFiber$x: { child: { memoizedProps: {}, child: label, sibling: null }, return: null } };
  assert.deepEqual(mentionImagePointers(row), { asset_pointer: 'sediment://file_one', thumbnail_asset_pointer: 'sediment://file_one_thumb' });
  // Off-screen rows render a placeholder; the keyed row component still carries the entry's icon element.
  const keyed = { key: 'reference-image:x', memoizedProps: { children: { props: { entry: { iconElement: { props: {
    assetPointer: 'sediment://file_two', thumbnailAssetPointer: null } } } } } }, return: null };
  assert.deepEqual(mentionImagePointers({ __reactFiber$x: { child: null, return: keyed } }),
    { asset_pointer: 'sediment://file_two', thumbnail_asset_pointer: null });
  const external = { __reactFiber$x: { child: { memoizedProps: { assetPointer: 'https://example.test/a.png' }, child: null, sibling: null }, return: null } };
  assert.equal(mentionImagePointers(external), null, 'only sediment pointers address the preview cache');
  assert.equal(mentionImagePointers({}), null);
  assert.equal(referenceOwner('AccountUserId_abc-1~refimage_9'), 'AccountUserId_abc-1');
  assert.equal(referenceOwner('refimage_9'), null);
  assert.equal(referenceOwner(null), null);
});


test('입력창 @ 후보의 참조 섹션이 열리면 참조 메뉴 열기처럼 저장된 채팅의 캐싱을 시작한다', async () => {
  const items = ['one', 'two'].map(name => ({ ...ref(name), id: `AccountUserId_user~refimage_${name}` }));
  let sections = [];
  const h = cacheWorkerHarness({ pages: new Map([[null, { items, next_cursor: null }]]), managed: true,
    querySelectorAll: selector => selector === '[data-mention-section-id="reference-images"]' ? sections : [] });
  await h.login(); await until(() => h.status().identityReady, 'identity unavailable');
  h.menuController.updateMenus();
  assert.equal(h.calls.metadata.length, 0, 'no suggestions open: nothing starts');
  assert.equal(h.chatStorage.getItem(CHAT_CACHE_RECENT_KEY), null);
  sections = [{ querySelector: () => null }];
  h.menuController.updateMenus(); h.menuController.updateMenus();
  assert.deepEqual(JSON.parse(h.chatStorage.getItem(CHAT_CACHE_RECENT_KEY)), ['test'], 'the chat is registered like a menu open');
  await until(() => h.status().thumbnailProgress.complete && h.status().previewProgress.complete, 'opening @ suggestions did not cache');
  assert.equal(h.calls.metadata.length, 1, 'one catalog request while the suggestions stay open');
  assert.equal(h.calls.images.length, 2);
  // Closing and reopening the suggestions inside 30 minutes reuses the catalog.
  sections = []; h.menuController.updateMenus();
  sections = [{ querySelector: () => null }]; h.menuController.updateMenus();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.calls.metadata.length, 1);
  h.cache.accessWrites.clear();
});

test('새 채팅처럼 저장된 채팅 ID가 없으면 @ 후보를 열어도 캐싱을 시작하지 않는다', async () => {
  const items = [{ ...ref('one'), id: 'AccountUserId_user~refimage_one' }];
  const h = cacheWorkerHarness({ pages: new Map([[null, { items, next_cursor: null }]]), managed: true, href: 'https://chatgpt.com/',
    querySelectorAll: selector => selector === '[data-mention-section-id="reference-images"]' ? [{ querySelector: () => null }] : [] });
  await h.login(); await until(() => h.status().identityReady, 'identity unavailable');
  h.menuController.updateMenus();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.calls.metadata.length, 0);
  assert.equal(h.status().cacheChat.running, false);
});


// A page where caching is off (managed gate) with a stored catalog for the logged-in user.
async function storedCatalogHarness({ href, ageMinutes = 60, account = 'account', identity = 'initial-user' } = {}) {
  const items = ['one', 'two'].map(name => ({ ...ref(name), id: `AccountUserId_user~refimage_${name}` }));
  const database = mockDatabase();
  const h = cacheWorkerHarness({ pages: new Map([[null, { items, next_cursor: null }]]), database, managed: true, href });
  await new Promise(resolve => setImmediate(resolve));
  const key = seedCatalog(database, items, { account, identity, ageMinutes });
  await h.login(); await until(() => h.status().identityReady, 'identity unavailable');
  return { ...h, items, key };
}

test('캐싱하지 않는 화면(스페이스 등)의 참조 목록 요청은 저장된 카탈로그로 읽기 전용 응답한다', async () => {
  const h = await storedCatalogHarness({ href: 'https://chatgpt.com/space/file/libfile_x' });
  const body = await (await h.open()).json();
  assert.deepEqual(body.items.map(item => item.id), h.items.map(item => item.id));
  assert.equal(body.next_cursor, null, 'the whole stored list ends the app page loop');
  assert.equal(h.calls.metadata.length, 0, 'no catalog request reaches the network');
  const status = h.status();
  assert.equal(status.storedCatalogServes, 1);
  assert.equal(status.cacheChat.running, false, 'serving the list does not start caching');
  assert.equal(status.scopeReady, false);
  assert.equal(h.calls.images.length, 0);
  assert.equal(h.chatStorage.getItem(CHAT_CACHE_RECENT_KEY), null, 'nothing is registered');
  // Later cursor pages and other accounts pass through unchanged.
  await h.window.fetch('https://chatgpt.com/backend-api/files/library/reference-images?limit=50&cursor=tail', { headers: { 'ChatGPT-Account-ID': 'account' } });
  await h.window.fetch('https://chatgpt.com/backend-api/files/library/reference-images?limit=50', { headers: { 'ChatGPT-Account-ID': 'other' } });
  assert.deepEqual(h.calls.metadata, ['tail', null]);
});

test('저장 카탈로그가 없거나 24시간이 지났거나 다른 사용자의 것이면 원래 목록 요청을 그대로 보낸다', async () => {
  for (const options of [{ ageMinutes: 25 * 60 }, { identity: 'someone-else' }]) {
    const h = await storedCatalogHarness({ href: 'https://chatgpt.com/', ...options });
    await h.open();
    assert.equal(h.calls.metadata.length, 1);
    assert.equal(h.status().storedCatalogServes, 0);
  }
});


test('@ 후보 행의 아이콘 칸은 이미지·대체 아이콘에서 아이콘 크기를 넘지 않는 가장 바깥 조상으로 찾는다', () => {
  const box = (width, parentElement) => ({ parentElement, getBoundingClientRect: () => ({ width, height: width }) });
  const row = box(320, null);
  const content = box(300, row);       // label + icon line: wider than an icon
  const slot = box(20, content);       // the icon slot ChatGPT keeps stable
  const fill = box(20, slot);          // size-full wrapper
  const glyph = box(14, fill);         // img, or the fallback glyph while evicted
  let selector = null;
  row.querySelector = value => { selector = value; return glyph; };
  assert.equal(mentionIconBox(row), slot);
  assert.match(selector, /img:not\(\[data-ref-fast-mention-icon\]\)/, 'the overlay itself is never the anchor');
  assert.match(selector, /svg/);
  assert.equal(mentionIconBox({ querySelector: () => null }), null, 'an unrendered placeholder row has no icon box');
  // A composer pill wraps the 20×20 slot in a padded 23×16 inline span; the overlay must match the square slot.
  const pill = { parentElement: null, getBoundingClientRect: () => ({ width: 73, height: 19 }) };
  const wrapper = { parentElement: pill, getBoundingClientRect: () => ({ width: 23, height: 16 }) };
  const square = { parentElement: wrapper, getBoundingClientRect: () => ({ width: 20, height: 20 }) };
  const image = { parentElement: square, getBoundingClientRect: () => ({ width: 20, height: 20 }) };
  pill.querySelector = () => image;
  assert.equal(mentionIconBox(pill), square);
});


test('입력창·보낸 프롬프트의 참조 멘션 링크에서 참조 ID와 이미지 포인터를 읽는다', () => {
  const id = 'AccountUserId_user~refimage_one';
  const href = `chatgpt-reference-image://${encodeURIComponent(id)}?assetPointer=${encodeURIComponent('sediment://file_one')}&thumbnailAssetPointer=${encodeURIComponent('sediment://file_one_t')}`;
  assert.deepEqual(referencePill(href), { id, pointers: { asset_pointer: 'sediment://file_one', thumbnail_asset_pointer: 'sediment://file_one_t' } });
  assert.deepEqual(referencePill(`chatgpt-reference-image://${encodeURIComponent(id)}?assetPointer=sediment%3A%2F%2Ffile_two`).pointers,
    { asset_pointer: 'sediment://file_two', thumbnail_asset_pointer: null });
  for (const bad of [null, 'https://example.test/x', 'chatgpt-reference-image://', `chatgpt-reference-image://${id}`,
    `chatgpt-reference-image://${id}?assetPointer=https%3A%2F%2Fexample.test`, 'chatgpt-reference-image://%E0%A4%A']) {
    assert.equal(referencePill(bad), null, String(bad));
  }
});


test('조회 실패 기록은 정해진 시간 동안만 다시 찾지 않게 한다', () => {
  let now = 1000;
  const misses = new RecentMisses(60000, () => now);
  assert.equal(misses.has('a'), false);
  misses.add('a');
  assert.equal(misses.has('a'), true);
  now += 59999; assert.equal(misses.has('a'), true);
  now += 1; assert.equal(misses.has('a'), false, 'retried after the lifetime');
  assert.equal(misses.has('b'), false);
});
