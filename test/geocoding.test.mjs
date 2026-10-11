import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const W = require('../src/acuris-geocoding.js');
const KEY = 'test-key-not-real';

function mockFetch(status, body, calls) {
  return (url, init) => { calls.push({ url, init }); return Promise.resolve({ status, ok: status < 300, json: () => Promise.resolve(body) }); };
}

test('query: single line uses q, fielded uses street/hno/city/state/postalcode', () => {
  assert.deepEqual(W.buildQuery(' Schönhauser Allee 36, Berlin ', 'DEU'), { country: 'deu', q: 'Schönhauser Allee 36, Berlin' });
  assert.deepEqual(W.buildQuery({ street: 'Main St', hno: '12', city: 'Springfield', state: 'IL', postalcode: '', other: 'x' }, 'usa'),
    { country: 'usa', street: 'Main St', hno: '12', city: 'Springfield', state: 'IL' });
});

test('geocode: GET /geocode on the main host, gbr on the PAF host', async () => {
  const calls = [];
  await W.geocode('Schönhauser Allee 36, Berlin', { apiKey: KEY, country: 'deu', fetch: mockFetch(200, {}, calls) });
  assert.equal(calls[0].url, 'https://api.acuris-geo.com/geocode?country=deu&q=Sch%C3%B6nhauser%20Allee%2036%2C%20Berlin');
  assert.equal(calls[0].init.method, 'GET');
  assert.equal(calls[0].init.headers['X-Acuris-Client'], 'gh-geocoding/0.1.1');
  await W.geocode('10 Downing Street, London', { apiKey: KEY, country: 'gbr', fetch: mockFetch(200, {}, calls) });
  assert.match(calls[1].url, /^https:\/\/paf\.acuris-geo\.com\/geocode\?country=gbr&q=/);
});

test('render: rooftop point with OpenStreetMap link', () => {
  const r = { lat: 52.538189, lng: 13.412664, accuracy_type: 'rooftop', point_coordinate: true, formatted_address: 'Schönhauser Allee 36\n10435 Berlin\nGERMANY' };
  const h = W.resultHtml(r);
  assert.match(h, /acuris-tag--point">Address point/);
  assert.match(h, /52\.538189/);
  assert.match(h, /Precision: <strong>Rooftop<\/strong>/);
  assert.match(h, /https:\/\/www\.openstreetmap\.org\/\?mlat=52\.538189&amp;mlon=13\.412664#map=18\/52\.538189\/13\.412664/);
  assert.doesNotMatch(h, /Approximate:/);
});

test('render: approximate locality centre carries a warning and an area badge', () => {
  const r = { lat: 38.709801, lng: -9.395957, accuracy_type: 'locality_centroid', point_coordinate: false, approximate: true, resolved_level: 'locality', resolved_name: 'Estoril', formatted_address: '' };
  const h = W.resultHtml(r);
  assert.match(h, /acuris-tag--area">Approximate area/);
  assert.match(h, /the pin is the centre of the locality \(Estoril\)/);
  assert.match(h, /#map=14\//);
});

test('render: precision badge follows point_coordinate, not the tier string', () => {
  assert.match(W.resultHtml({ lat: 1, lng: 2, accuracy_type: 'a_future_tier', point_coordinate: true }), /acuris-tag--point/);
  assert.match(W.resultHtml({ lat: 1, lng: 2, accuracy_type: 'rooftop' }), /acuris-tag--area/);
});

test('404 no_match renders a No match card with candidates', async () => {
  const calls = [];
  const body = { error: 'no_match', message: "Street 'Rua de Portugal' not found in Estoril", did_you_mean: [{ street: 'Avenida de Portugal', city: 'Estoril' }] };
  await assert.rejects(W.geocode('Rua de Portugal, Estoril', { apiKey: KEY, country: 'prt', fetch: mockFetch(404, body, calls) }), (e) => {
    const h = W.errorHtml(e);
    assert.match(h, /No match/);
    assert.match(h, /Rua de Portugal&#39; not found/);
    assert.match(h, /Avenida de Portugal, Estoril/);
    return true;
  });
});

test('render: attribution link on by default, removable, API attribution kept', () => {
  const r = { lat: 1, lng: 2, point_coordinate: true, attribution: 'Data <source>' };
  const on = W.resultHtml(r);
  assert.match(on, /<a href="https:\/\/www\.acuris-geo\.com\/" target="_blank" rel="noopener">Powered by Acuris Geo<\/a>/);
  assert.match(on, /<p class="acuris-attrib">Data &lt;source&gt;<\/p>/);
  const off = W.resultHtml(r, { attribution: false });
  assert.doesNotMatch(off, /ACURIS-geo\.com/);
  assert.match(off, /<p class="acuris-attrib">Data &lt;source&gt;<\/p>/);
});
