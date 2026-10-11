/*! Acuris geocoding widget | MIT | Copyright (c) 2026 Acuris GmbH */
(function (root, factory) {
  var C = (typeof module === 'object' && module.exports) ? require('./acuris-core.js') : root.AcurisCore;
  var api = factory(C);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AcurisGeocoding = api;
})(typeof self !== 'undefined' ? self : this, function (C) {
  'use strict';

  var VERSION = '0.1.0';
  var FIELDS = [['street', 'Street'], ['hno', 'House number'], ['city', 'City'], ['postalcode', 'Postcode'], ['state', 'State / region']];
  var ATTRIB = 'Geocoding by ACURIS-geo.com';
  var ATTRIB_URL = 'https://www.acuris-geo.com/';

  // Visible attribution link, on by default; opts.attribution === false removes it.
  function attribLinkHtml(opts) {
    if (opts && opts.attribution === false) return '';
    return '<p class="acuris-powered"><a href="' + C.esc(ATTRIB_URL) + '" target="_blank" rel="noopener">' + C.esc(ATTRIB) + '</a></p>';
  }

  // values: a single-line string, or {street, hno, city, state, postalcode}.
  function buildQuery(values, country) {
    var q = { country: String(country || '').toLowerCase() };
    if (values && typeof values === 'object') {
      for (var i = 0; i < FIELDS.length; i++) {
        var v = values[FIELDS[i][0]];
        if (v != null && String(v).trim() !== '') q[FIELDS[i][0]] = String(v).trim();
      }
    } else q.q = String(values == null ? '' : values).trim();
    return q;
  }

  function geocode(values, opts) {
    opts = opts || {};
    var q = buildQuery(values, opts.country);
    if (!q.country) return Promise.reject(C.normalizeError(0, { error: 'country_required', message: 'Select a country first.' }));
    return C.request({ path: '/geocode', query: q, country: q.country, apiKey: opts.apiKey, baseUrl: opts.baseUrl,
      ukBaseUrl: opts.ukBaseUrl, fetch: opts.fetch, signal: opts.signal, client: opts.client || ('gh-geocoding/' + VERSION) })
      .then(function (r) { return r.data; });
  }

  function osmUrl(r) {
    var z = r.point_coordinate === true ? 18 : 14;
    return 'https://www.openstreetmap.org/?mlat=' + r.lat + '&mlon=' + r.lng + '#map=' + z + '/' + r.lat + '/' + r.lng;
  }

  // Pure: /geocode response -> HTML string. opts.attribution === false hides the attribution link.
  function resultHtml(r, opts) {
    var p = C.precision(r);
    var addr = r.formatted_address || (r.standardized && r.standardized.formatted_address) || '';
    var h = '<div class="acuris-result acuris-geo-result">';
    h += '<span class="acuris-tag acuris-tag--' + (p.point ? 'point' : 'area') + '">' + (p.point ? 'Address point' : 'Approximate area') + '</span>';
    if (typeof r.lat === 'number' && typeof r.lng === 'number') {
      h += '<p class="acuris-latlng"><span>Lat</span> ' + r.lat.toFixed(6) + ' <span>Lng</span> ' + r.lng.toFixed(6) + '</p>';
    }
    if (p.label) h += '<p class="acuris-meta">Precision: <strong>' + C.esc(p.label) + '</strong> <code>' + C.esc(r.accuracy_type) + '</code></p>';
    if (addr) h += '<div class="acuris-addr">' + C.esc(addr) + '</div>';
    if (r.approximate === true) {
      h += '<p class="acuris-warn" role="note">Approximate: the pin is the centre of the ' +
        C.esc(String(r.resolved_level || 'area').replace(/_/g, ' ')) + (r.resolved_name ? ' (' + C.esc(r.resolved_name) + ')' : '') +
        ', not a specific address.</p>';
    }
    if (typeof r.lat === 'number') h += '<p><a href="' + C.esc(osmUrl(r)) + '" target="_blank" rel="noopener">Open in OpenStreetMap</a></p>';
    if (r.attribution) h += '<p class="acuris-attrib">' + C.esc(r.attribution) + '</p>';
    h += attribLinkHtml(opts);
    return h + '</div>';
  }

  function errorHtml(err) {
    if (err && err.code === 'no_match') {
      var d = (err.body && err.body.did_you_mean) || [];
      var h = '<div class="acuris-result"><span class="acuris-tag acuris-tag--nomatch">No match</span><p>' + C.esc(err.message) + '</p>';
      if (d.length) {
        h += '<p class="acuris-meta">Did you mean: ';
        for (var i = 0; i < d.length && i < 6; i++) h += (i ? '; ' : '') + C.esc([d[i].street, d[i].city].filter(Boolean).join(', '));
        h += '</p>';
      }
      return h + '</div>';
    }
    return '<p class="acuris-error" role="alert">' + C.esc(err && err.message) + '</p>';
  }

  function formHtml(o) {
    var id = o.idPrefix, h = '<form class="acuris-geo" novalidate>';
    if (o.country === 'select') {
      h += '<label for="' + id + '-c">Country</label><select id="' + id + '-c" name="country" required>' + C.countryOptions(C.FREQUENT) +
        '<option value="__other">Other country (ISO-3 code)</option></select>' +
        '<input name="country_other" maxlength="3" placeholder="e.g. che" hidden aria-label="ISO-3 country code">';
    }
    if (o.fields === 'fielded') {
      for (var i = 0; i < FIELDS.length; i++) {
        h += '<label for="' + id + '-' + FIELDS[i][0] + '">' + FIELDS[i][1] + '</label><input id="' + id + '-' + FIELDS[i][0] + '" name="' + FIELDS[i][0] + '">';
      }
    } else h += '<label for="' + id + '-q">Address</label><input id="' + id + '-q" name="q" autocomplete="off">';
    return h + '<button type="submit">Geocode</button><div class="acuris-out" aria-live="polite"></div></form>';
  }

  function mount(target, options) {
    var o = {}, k;
    for (k in options || {}) if (Object.prototype.hasOwnProperty.call(options, k)) o[k] = options[k];
    o.country = o.country || 'select';
    o.idPrefix = C.nextId('acuris-geo');
    var host = C.pick(target);
    if (!host) throw new Error('AcurisGeocoding: target not found');
    host.innerHTML = formHtml(o);
    var form = host.querySelector('form'), out = host.querySelector('.acuris-out');
    var sel = form.querySelector('select'), other = form.querySelector('input[name="country_other"]');
    if (sel) sel.addEventListener('change', function () { other.hidden = sel.value !== '__other'; });
    function country() {
      if (!sel) return o.country;
      return sel.value === '__other' ? String(other.value || '').trim().toLowerCase() : sel.value;
    }
    function values() {
      if (o.fields !== 'fielded') return form.querySelector('input[name="q"]').value;
      var v = {};
      for (var i = 0; i < FIELDS.length; i++) v[FIELDS[i][0]] = form.querySelector('input[name="' + FIELDS[i][0] + '"]').value;
      return v;
    }
    function run(v) {
      out.innerHTML = '<p class="acuris-busy">Locating…</p>';
      return geocode(v == null ? values() : v, { apiKey: o.apiKey, country: country(), baseUrl: o.baseUrl, ukBaseUrl: o.ukBaseUrl, fetch: o.fetch, client: o.client })
        .then(function (r) {
          out.innerHTML = resultHtml(r, o);
          C.emit(host, 'acuris:result', { response: r });
          if (typeof o.onResult === 'function') o.onResult(r);
          return r;
        }, function (err) {
          out.innerHTML = errorHtml(err);
          C.emit(host, 'acuris:error', { error: err });
          if (typeof o.onError === 'function') o.onError(err);
          return null;
        });
    }
    function onSubmit(ev) { ev.preventDefault(); run(); }
    form.addEventListener('submit', onSubmit);
    return {
      element: host, geocode: run,
      destroy: function () { form.removeEventListener('submit', onSubmit); host.innerHTML = ''; }
    };
  }

  return { VERSION: VERSION, FIELDS: FIELDS, buildQuery: buildQuery, geocode: geocode, osmUrl: osmUrl, resultHtml: resultHtml, errorHtml: errorHtml, formHtml: formHtml, mount: mount };
});
