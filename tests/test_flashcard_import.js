const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const start = script.indexOf('function serializeDecks(');
const end = script.indexOf('function normalizeTaskDays', start);
assert.notEqual(start, -1, 'serializeDecks must exist');
assert.notEqual(end, -1, 'import helpers end marker must exist');

let uuidCounter = 0;
const context = {crypto: {randomUUID: () => `99999999-9999-4999-8999-${String(++uuidCounter).padStart(12, '0')}`}};
vm.createContext(context);
vm.runInContext(`${script.slice(start, end)}\n;globalThis.io={serializeDecks,parseLiangliDeckJson,parseTwoColumnCsv,remapFlashcardBundle,countBundleCollisions};`, context);
const {serializeDecks, parseLiangliDeckJson, parseTwoColumnCsv, remapFlashcardBundle, countBundleCollisions} = context.io;

const deckId = '11111111-1111-4111-8111-111111111111';
const cardId = '22222222-2222-4222-8222-222222222222';
const reviewId = '33333333-3333-4333-8333-333333333333';
const decks = [{id: deckId, name: 'Biology'}];
const cards = [{id: cardId, deckId, front: 'Cell?', back: 'Unit of life', dueAt: 123, intervalDays: 2, ease: 2.5, repetitions: 1}];
const reviews = [{id: reviewId, deckId, cardId, grade: 'good', previousIntervalDays: 1, reviewedAt: 123, wasNew: false}];
const encoded = serializeDecks(decks, cards, reviews);
assert.deepEqual(JSON.parse(JSON.stringify(parseLiangliDeckJson(encoded))), {decks, cards, reviews});
assert.throws(() => parseLiangliDeckJson('{"format":"liangli-flashcards","version":2,"decks":[],"cards":[],"reviews":[]}'), /version/i);
assert.throws(() => parseLiangliDeckJson('{"format":"wrong","version":1}'), /format/i);
assert.throws(() => parseLiangliDeckJson(serializeDecks(decks, [{...cards[0], deckId: '44444444-4444-4444-8444-444444444444'}], reviews)), /format/i);
assert.throws(() => parseLiangliDeckJson(serializeDecks(decks, [{...cards[0], intervalDays: 40000}], reviews)), /format/i);
assert.throws(() => parseLiangliDeckJson(serializeDecks(decks, cards, [{...reviews[0], wasNew: 'false'}])), /format/i);

const existingIds = new Set([deckId, cardId, reviewId]);
assert.equal(countBundleCollisions({decks, cards, reviews}, existingIds), 3);
const remapped = remapFlashcardBundle({decks, cards, reviews}, false, existingIds);
assert.notEqual(remapped.decks[0].id, deckId);
assert.equal(remapped.cards[0].deckId, remapped.decks[0].id);
assert.equal(remapped.reviews[0].cardId, remapped.cards[0].id);

const csv = 'front,back\r\n"What is ""ATP""?","Energy, molecule"\r\n"Line one\nLine two","Answer"';
const parsed = parseTwoColumnCsv(csv);
assert.equal(parsed.valid, true);
assert.equal(parsed.cards.length, 2);
assert.equal(parsed.cards[0].front, 'What is "ATP"?');
assert.equal(parsed.cards[0].back, 'Energy, molecule');
assert.equal(parsed.cards[1].front, 'Line one\nLine two');

const invalid = parseTwoColumnCsv('front,back\nok,answer\nmissing');
assert.equal(invalid.valid, false);
assert.equal(invalid.invalidRows.length, 1);
assert.equal(invalid.cards.length, 0, 'invalid import must not expose a partial card set');

console.log('flashcard import/export: ok');
