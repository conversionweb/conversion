/* Conversion — unit converter. No dependencies, runs entirely in the browser. */
(function () {
  'use strict';

  var root = document.documentElement;

  /* ---------- theme ---------- */

  function applyTheme(t) {
    root.setAttribute('data-theme', t);
    try { localStorage.setItem('cv-theme', t); } catch (e) {}
    var b = document.getElementById('theme-btn');
    if (b) b.setAttribute('aria-label', t === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
  }
  var stored = null;
  try { stored = localStorage.getItem('cv-theme'); } catch (e) {}
  applyTheme(stored || (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));

  /* ---------- helpers ---------- */

  function parseVal(raw) {
    if (!raw) return 0;
    var s = String(raw).trim().replace(/\s+/g, '').replace(/ /g, '').replace(',', '.');
    if (s === '' || s === '-' || s === '.') return 0;
    var n = Number(s);
    return isFinite(n) ? n : 0;
  }

  function group(i) { return i.replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }

  function fmt(x, sig) {
    if (x === null || x === undefined || !isFinite(x)) return '—';
    if (x === 0) return '0';
    var a = Math.abs(x);
    if (a >= 1e15 || a < 1e-9) return x.toExponential(Math.max(2, sig - 1)).replace('e', '×10^');
    var n = Number(x.toPrecision(sig));
    var s =
      Math.abs(n) < 1e-6
        ? n.toFixed(Math.min(20, sig - 1 - Math.floor(Math.log10(Math.abs(n))))).replace(/0+$/, '')
        : n.toString();
    if (s.indexOf('e') > -1) return s;
    var neg = s.charAt(0) === '-';
    if (neg) s = s.slice(1);
    var parts = s.split('.');
    return (neg ? '-' : '') + group(parts[0]) + (parts[1] ? '.' + parts[1] : '');
  }

  function plain(x, sig) {
    if (!isFinite(x)) return '';
    if (x === 0) return '0';
    var a = Math.abs(x);
    if (a >= 1e15 || a < 1e-9) return x.toExponential(Math.max(2, sig - 1));
    return String(Number(x.toPrecision(sig)));
  }

  function el(tag, cls, txt) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (txt !== undefined) n.textContent = txt;
    return n;
  }

  function copyText(text, node) {
    var done = function () {
      node.classList.add('copied');
      setTimeout(function () { node.classList.remove('copied'); }, 700);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text, done); });
    } else {
      fallbackCopy(text, done);
    }
  }
  function fallbackCopy(text, done) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); done(); } catch (e) {}
    document.body.removeChild(ta);
  }

  /* ---------- converter ---------- */

  function build(host, cfg) {
    var t = cfg.t || {};
    var units = cfg.units;
    var single = cfg.mode === 'single';
    var sig = 8;
    try {
      var p = parseInt(localStorage.getItem('cv-digits'), 10);
      if (p >= 4 && p <= 12) sig = p;
    } catch (e) {}

    var card = el('div', 'card');

    var head = el('div', 'card-head');
    head.appendChild(el('span', 'card-title', cfg.cardTitle || cfg.name));
    var tools = el('div', 'card-tools');
    tools.appendChild(el('span', 'eyebrow', t.digits || 'Digits'));

    var seg = el('div', 'seg');
    seg.setAttribute('role', 'group');
    seg.setAttribute('aria-label', t.digits || 'Digits');
    var segButtons = [];
    [4, 6, 8, 10, 12].forEach(function (v) {
      var b = el('button', null, String(v));
      b.type = 'button';
      b.setAttribute('aria-pressed', v === sig ? 'true' : 'false');
      b.addEventListener('click', function () {
        sig = v;
        try { localStorage.setItem('cv-digits', String(v)); } catch (e) {}
        segButtons.forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
        calc();
      });
      segButtons.push(b);
      seg.appendChild(b);
    });
    tools.appendChild(seg);

    var clearBtn = el('button', 'btn', t.clear || 'Clear');
    clearBtn.type = 'button';
    var convBtn = el('button', 'btn btn-primary', t.convert || 'Convert');
    convBtn.type = 'button';
    tools.appendChild(clearBtn);
    tools.appendChild(convBtn);
    head.appendChild(tools);
    card.appendChild(head);

    var cols = el('div', 'card-cols');
    cols.appendChild(el('span', null, t.colUnit || 'Unit'));
    cols.appendChild(el('span', 'r', t.colValue || 'Value'));
    cols.appendChild(el('span', 'r', t.colResult || 'Result'));
    card.appendChild(cols);

    var inputs = [];
    var outs = [];
    var srcIndex = 0;
    var pickButtons = [];
    var srcNameNode = null;

    var rows = el('div', 'rows');

    if (single) {
      var pick = el('div', 'src-pick');
      units.forEach(function (u, i) {
        var b = el('button', 'chip', u.sym);
        b.type = 'button';
        b.setAttribute('aria-pressed', i === 0 ? 'true' : 'false');
        b.addEventListener('click', function () { selectSource(i); });
        pickButtons.push(b);
        pick.appendChild(b);
      });
      card.appendChild(pick);

      var row = el('div', 'row');
      var lab = el('label');
      lab.setAttribute('for', 'src-input');
      srcNameNode = el('span', 'n', units[0].label);
      lab.appendChild(srcNameNode);
      lab.appendChild(el('span', 'u', units[0].sym));
      var inp = el('input');
      inp.type = 'text';
      inp.id = 'src-input';
      inp.inputMode = 'decimal';
      inp.autocomplete = 'off';
      inp.placeholder = '0';
      row.appendChild(lab);
      row.appendChild(inp);
      row.appendChild(el('span'));
      rows.appendChild(row);
      inputs.push(inp);

      units.forEach(function (u) {
        var r = el('div', 'row');
        var l = el('label');
        l.appendChild(el('span', 'n', u.label));
        l.appendChild(el('span', 'u', u.sym));
        r.appendChild(l);
        r.appendChild(el('span'));
        r.appendChild(makeOut(u));
        rows.appendChild(r);
      });
    } else {
      units.forEach(function (u, i) {
        var r = el('div', 'row');
        var l = el('label');
        l.setAttribute('for', 'in-' + i);
        l.appendChild(el('span', 'n', u.label));
        l.appendChild(el('span', 'u', u.sym));
        var input = el('input');
        input.type = 'text';
        input.id = 'in-' + i;
        input.inputMode = 'decimal';
        input.autocomplete = 'off';
        input.placeholder = '0';
        r.appendChild(l);
        r.appendChild(input);
        r.appendChild(makeOut(u));
        rows.appendChild(r);
        inputs.push(input);
      });
    }
    card.appendChild(rows);

    function makeOut(u) {
      var o = el('div', 'out');
      o.setAttribute('role', 'button');
      o.setAttribute('tabindex', '0');
      o.setAttribute('aria-label', (t.copyLabel || 'Copy') + ' ' + u.sym);
      o.appendChild(el('span', 'ov', '0'));
      o.appendChild(el('span', 'ou', u.sym));
      o.dataset.raw = '0';
      var copy = function () { if (o.dataset.raw) copyText(o.dataset.raw + ' ' + u.sym, o); };
      o.addEventListener('click', copy);
      o.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); copy(); }
      });
      outs.push(o);
      return o;
    }

    var foot = el('div', 'card-foot');
    foot.appendChild(el('span', null, single ? (cfg.key === 'fuel' ? t.hintFuel : t.hintTemp) || '' : t.hintSum || ''));
    foot.appendChild(el('span', 'kbd-hint', t.hintCopy || ''));
    card.appendChild(foot);

    if (cfg.examples && cfg.examples.length) {
      var chips = el('div', 'chips');
      chips.appendChild(el('span', 'eyebrow', t.tryLabel || 'Try'));
      cfg.examples.forEach(function (ex) {
        var b = el('button', 'chip', ex.label);
        b.type = 'button';
        b.addEventListener('click', function () {
          clearAll();
          if (single) {
            selectSource(ex.unit || 0);
            inputs[0].value = String(ex.value);
          } else {
            Object.keys(ex.values).forEach(function (k) {
              if (inputs[Number(k)]) inputs[Number(k)].value = String(ex.values[k]);
            });
          }
          calc();
        });
        chips.appendChild(b);
      });
      card.appendChild(chips);
    }

    host.appendChild(card);

    var toBase = units.map(function (u) {
      return single ? new Function('v', 'return ' + u.to) : function (v) { return v * u.f; };
    });
    var fromBase = units.map(function (u) {
      return single ? new Function('v', 'return ' + u.from) : function (v) { return v / u.f; };
    });

    function selectSource(i) {
      srcIndex = i;
      pickButtons.forEach(function (b, j) { b.setAttribute('aria-pressed', j === i ? 'true' : 'false'); });
      if (srcNameNode) {
        srcNameNode.textContent = units[i].label;
        srcNameNode.parentNode.querySelector('.u').textContent = units[i].sym;
      }
      calc();
    }

    function calc() {
      var base = 0;
      var empty = true;
      if (single) {
        var raw = inputs[0].value;
        if (raw.trim() !== '') { base = toBase[srcIndex](parseVal(raw)); empty = false; }
      } else {
        for (var i = 0; i < inputs.length; i++) {
          var v = parseVal(inputs[i].value);
          if (inputs[i].value.trim() !== '') empty = false;
          if (v) base += toBase[i](v);
        }
      }
      if (empty && single) { blank(); return; }
      write(units.map(function (u, i) { return fromBase[i](base); }));
    }

    function write(vals) {
      for (var i = 0; i < outs.length; i++) {
        outs[i].querySelector('.ov').textContent = fmt(vals[i], sig);
        outs[i].dataset.raw = plain(vals[i], sig);
      }
    }

    function blank() {
      outs.forEach(function (o) {
        o.querySelector('.ov').textContent = '—';
        o.dataset.raw = '';
      });
    }

    function clearAll() {
      inputs.forEach(function (i) { i.value = ''; });
      if (single) blank();
      else write(units.map(function () { return 0; }));
    }

    inputs.forEach(function (i) {
      i.addEventListener('input', calc);
      i.addEventListener('keydown', function (e) { if (e.key === 'Escape') clearAll(); });
    });
    convBtn.addEventListener('click', calc);
    clearBtn.addEventListener('click', function () { clearAll(); inputs[0].focus(); });

    clearAll();
  }

  /* ---------- home search ---------- */

  function initSearch() {
    var box = document.getElementById('tile-search');
    if (!box) return;
    var tiles = Array.prototype.slice.call(document.querySelectorAll('.tile'));
    var groups = Array.prototype.slice.call(document.querySelectorAll('.group'));
    var empty = document.getElementById('no-hits');
    var clear = document.getElementById('search-clear');

    function run() {
      var q = box.value.trim().toLowerCase();
      var hits = 0;
      tiles.forEach(function (t) {
        var hay = (t.dataset.terms || '') + ' ' + t.textContent.toLowerCase();
        var show = !q || hay.indexOf(q) > -1;
        t.hidden = !show;
        if (show) hits++;
      });
      groups.forEach(function (g) {
        var any = g.querySelectorAll('.tile:not([hidden])').length;
        g.hidden = !any;
      });
      if (empty) empty.hidden = hits > 0;
      if (clear) clear.hidden = !q;
    }

    box.addEventListener('input', run);
    if (clear) {
      clear.hidden = true;
      clear.addEventListener('click', function () { box.value = ''; run(); box.focus(); });
    }
    document.addEventListener('keydown', function (e) {
      if (e.key === '/' && document.activeElement !== box && !/^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)) {
        e.preventDefault();
        box.focus();
        box.select();
      }
    });
  }

  /* ---------- language menu ---------- */

  function initLang() {
    var btn = document.getElementById('lang-btn');
    var menu = document.getElementById('lang-menu');
    if (!btn || !menu) return;
    function close() { menu.removeAttribute('data-open'); btn.setAttribute('aria-expanded', 'false'); }
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = menu.getAttribute('data-open') === '1';
      if (open) close();
      else { menu.setAttribute('data-open', '1'); btn.setAttribute('aria-expanded', 'true'); }
    });
    document.addEventListener('click', function (e) { if (!menu.contains(e.target)) close(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
  }


  /* Opened straight from disk? A file:// browser will not turn /mass-converter/
     into its index.html, so point folder links at the file itself. Never runs
     on a real host. */
  function fixFileLinks() {
    if (location.protocol !== 'file:') return;
    var links = document.querySelectorAll('a[href$="/"]');
    for (var i = 0; i < links.length; i++) {
      links[i].setAttribute('href', links[i].getAttribute('href') + 'index.html');
    }
  }

  /* ---------- boot ---------- */

  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('#theme-btn');
    if (b) applyTheme(root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
  });

  document.addEventListener('DOMContentLoaded', function () {
    fixFileLinks();
    initSearch();
    initLang();
    var host = document.getElementById('converter');
    if (host && window.UP_CONFIG) build(host, window.UP_CONFIG);
  });
})();
