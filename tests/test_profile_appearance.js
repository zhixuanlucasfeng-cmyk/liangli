const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync('index.html', 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const start = script.indexOf("const APPEARANCE_DB_NAME=");
const end = script.indexOf('const CORE_LEGACY_KEYS=', start);

function element() {
  return {
    hidden: false, src: '', style: {values: {}, setProperty(key, value) { this.values[key] = value; }, removeProperty(key) { delete this.values[key]; }},
    removeAttribute(name) { if (name === 'src') this.src = ''; },
  };
}

const elements = new Map([
  ['profileAvatar', element()], ['appearanceAvatarPreview', element()],
  ['avatarFallback', element()], ['appearanceStatus', element()],
]);
const app = element();
const revoked = [];
let nextUrl = 0;
const context = {
  document: {
    getElementById: id => elements.get(id),
    querySelector: selector => selector === '.app' ? app : null,
    createElement() { throw new Error('not used in this contract test'); },
  },
  URL: {
    createObjectURL() { nextUrl += 1; return `blob:test-${nextUrl}`; },
    revokeObjectURL(value) { revoked.push(value); },
  },
  indexedDB: {}, Promise, Error, String, Math, T: key => key,
};
vm.createContext(context);
vm.runInContext(`${script.slice(start, end)}\n;globalThis.appearanceApi={applyAppearanceBlob,compressAppearanceImage,handleAppearanceFile,resetAppearance,setCompress:fn=>compressAppearanceImage=fn,setRecord:fn=>appearanceRecord=fn};`, context);

const blobA = {id: 'a'};
const blobB = {id: 'b'};
context.appearanceApi.applyAppearanceBlob('avatar', blobA);
assert.equal(elements.get('profileAvatar').src, 'blob:test-1');
assert.equal(elements.get('profileAvatar').hidden, false);
assert.equal(elements.get('avatarFallback').hidden, true);

context.appearanceApi.applyAppearanceBlob('avatar', blobB);
assert.deepEqual(revoked, ['blob:test-1'], 'replacing an avatar releases the old object URL');
assert.equal(elements.get('profileAvatar').src, 'blob:test-2');

context.appearanceApi.applyAppearanceBlob('wallpaper', blobA);
assert.equal(app.style.values['--profile-wallpaper'], 'url("blob:test-3")');
context.appearanceApi.applyAppearanceBlob('wallpaper', null);
assert.deepEqual(revoked, ['blob:test-1', 'blob:test-3']);
assert.equal(app.style.values['--profile-wallpaper'], undefined);

assert.rejects(
  context.appearanceApi.compressAppearanceImage({type: 'text/plain', size: 20}, 'avatar'),
  /Invalid appearance image/,
);

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return {promise, resolve};
}

async function testNewestSelectionWins() {
  const oldCompression = deferred();
  const newCompression = deferred();
  const writes = [];
  context.appearanceApi.setCompress(file => file.name === 'old' ? oldCompression.promise : newCompression.promise);
  context.appearanceApi.setRecord(async (mode, operation, blob) => { writes.push({mode, operation, blob}); });
  const oldInput = {files: [{name: 'old'}], value: 'old'};
  const newInput = {files: [{name: 'new'}], value: 'new'};
  const oldSave = context.appearanceApi.handleAppearanceFile('avatar', oldInput);
  const newSave = context.appearanceApi.handleAppearanceFile('avatar', newInput);
  newCompression.resolve({id: 'new'});
  await newSave;
  oldCompression.resolve({id: 'old'});
  await oldSave;
  assert.deepEqual(writes.map(entry => entry.blob.id), ['new'], 'a slower older selection cannot overwrite the latest avatar');
  assert.equal(elements.get('profileAvatar').src, 'blob:test-4');
}

async function testResetWinsAgainstInFlightSave() {
  const putFinished = deferred();
  const putStarted = deferred();
  const operations = [];
  context.appearanceApi.setCompress(async () => ({id: 'large'}));
  context.appearanceApi.setRecord(async (mode, operation) => {
    operations.push(operation);
    if (operation === 'put') { putStarted.resolve(); await putFinished.promise; }
  });
  const save = context.appearanceApi.handleAppearanceFile('avatar', {files: [{name: 'large'}], value: 'large'});
  await putStarted.promise;
  const reset = context.appearanceApi.resetAppearance('avatar');
  putFinished.resolve();
  await Promise.all([save, reset]);
  assert.deepEqual(operations, ['put', 'delete'], 'reset is serialized after an already-started save');
  assert.equal(elements.get('profileAvatar').hidden, true);
  assert.equal(elements.get('avatarFallback').hidden, false);
}

testNewestSelectionWins().then(testResetWinsAgainstInFlightSave).then(() => {
  console.log('profile appearance tests passed');
});
