// Focus ao longo do tempo: lê data/<indicador>.json (gerado por scripts/fetch_focus.py) e desenha a página.
(function () {
  'use strict';

  var SVG = 'http://www.w3.org/2000/svg';
  var IND = {
    ipca: { name: 'IPCA', the: 'o IPCA', what: 'inflação no ano', unit: '%' },
    selic: { name: 'Selic', the: 'a Selic', what: 'meta no fim do ano', unit: '% a.a.' },
    pib: { name: 'PIB', the: 'o PIB', what: 'crescimento no ano', unit: '%' },
    cambio: { name: 'Câmbio', the: 'o câmbio', what: 'dólar no fim do ano', unit: 'R$', currency: true },
  };

  var app = document.getElementById('app');
  var $ = function (sel) { return app.querySelector(sel); };
  var cache = {};
  var state = { ind: 'ipca', year: null };

  // ---------- formatação ----------
  function num(v, dec) {
    return v.toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec }).replace('-', '−');
  }
  function fmt(ind, v) {
    return IND[ind].currency ? 'R$ ' + num(v, 2) : num(v, 2) + IND[ind].unit;
  }
  function fmtDelta(ind, d) {
    if (Math.abs(d) < 0.005) return 'estável';
    var sign = d > 0 ? '+' : '−';
    return IND[ind].currency ? sign + 'R$ ' + num(Math.abs(d), 2) : sign + num(Math.abs(d), 2) + ' p.p.';
  }
  function day(s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function fmtDay(s) { return day(s).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' }); }
  function fmtMonth(s) { return day(s).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' }); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function svgEl(tag, attrs, text) {
    var e = document.createElementNS(SVG, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    return e;
  }

  // índice do último ponto em ou antes de `date`
  function indexAt(series, date) {
    var found = -1;
    for (var i = 0; i < series.d.length; i++) {
      if (series.d[i] <= date) found = i; else break;
    }
    return found;
  }
  function minusDays(s, n) {
    var d = day(s); d.setDate(d.getDate() - n);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  // ---------- carga ----------
  function load(ind) {
    if (cache[ind]) return Promise.resolve(cache[ind]);
    return fetch('data/' + ind + '.json')
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (json) { cache[ind] = json; return json; });
  }

  // ---------- resumo (ano corrente e próximo) ----------
  function renderSummary(data) {
    var box = $('.summary');
    box.textContent = '';
    var latestYear = +data.latest.slice(0, 4);
    [latestYear, latestYear + 1].forEach(function (y) {
      var s = data.years[String(y)];
      if (!s) return;
      var last = s.d.length - 1;
      var prev = indexAt(s, minusDays(s.d[last], 28));
      var tile = el('div', 'tile');
      tile.appendChild(el('p', 'tile-label', IND[state.ind].name + ' ' + y + ' · ' + IND[state.ind].what));
      tile.appendChild(el('p', 'tile-value', fmt(state.ind, s.med[last])));
      var delta = prev >= 0 ? fmtDelta(state.ind, s.med[last] - s.med[prev]) + ' em 4 semanas · ' : '';
      tile.appendChild(el('p', 'tile-delta', delta + s.n[last] + ' respondentes'));
      box.appendChild(tile);
    });
    $('.report-date').textContent = 'Dados até ' + fmtDay(data.latest);
  }

  // ---------- anos ----------
  function renderYears(data) {
    var box = $('.years');
    box.textContent = '';
    Object.keys(data.years).forEach(function (y) {
      var b = el('button', null, y);
      b.type = 'button';
      b.setAttribute('aria-pressed', String(+y === state.year));
      b.addEventListener('click', function () { state.year = +y; update(); });
      box.appendChild(b);
    });
    var active = box.querySelector('[aria-pressed="true"]');
    if (active) box.scrollLeft = active.offsetLeft - box.clientWidth / 2 + active.offsetWidth / 2;
  }

  // ---------- gráfico ----------
  function niceStep(span, count) {
    var step = Math.pow(10, Math.floor(Math.log10(span / count)));
    var err = span / count / step;
    if (err >= 7.5) step *= 10; else if (err >= 3.5) step *= 5; else if (err >= 1.5) step *= 2;
    return step;
  }

  function renderChart(data) {
    var ind = state.ind, y = String(state.year), s = data.years[y];
    var real = data.realized && data.realized[y];
    var box = $('.chart');
    box.textContent = '';

    var past = +y < +data.latest.slice(0, 4);
    $('.chart-title').textContent = 'O que o mercado ' + (past ? 'esperava' : 'espera') + ' para ' + IND[ind].the + ' de ' + y;
    var first = 0, last = s.d.length - 1;
    var startIdx = indexAt(s, y + '-01-01');
    var parts = ['Primeira projeção: ' + fmt(ind, s.med[first]) + ' (' + fmtMonth(s.d[first]) + ')'];
    if (startIdx > first && startIdx < last) parts.push('no início do ano: ' + fmt(ind, s.med[startIdx]));
    parts.push((real != null ? 'última: ' : 'agora: ') + fmt(ind, s.med[last]));
    if (real != null) parts.push('realizado: ' + fmt(ind, real));
    $('.chart-sub').textContent = parts.join(' · ');
    $('.legend-realized').hidden = real == null;
    $('.chart-note').textContent = ind === 'cambio' && past
      ? 'Para o câmbio não mostramos o valor realizado, porque não há uma série do Banco Central equivalente à definição usada no Focus.'
      : '';

    var W = Math.max(box.clientWidth, 280), H = W < 520 ? 260 : 320;
    var pad = { l: 46, r: W < 520 ? 52 : 64, t: 16, b: 28 };
    var lo = Math.min.apply(null, s.min), hi = Math.max.apply(null, s.max);
    if (real != null) { lo = Math.min(lo, real); hi = Math.max(hi, real); }
    var step = niceStep(hi - lo || 1, 4);
    var y0 = Math.floor(lo / step) * step, y1 = Math.ceil(hi / step) * step;
    if (y1 === y0) y1 = y0 + step;
    var t0 = day(s.d[first]).getTime(), t1 = day(s.d[last]).getTime();
    var X = function (d) { return pad.l + ((day(d).getTime() - t0) / (t1 - t0 || 1)) * (W - pad.l - pad.r); };
    var Y = function (v) { return pad.t + (1 - (v - y0) / (y1 - y0)) * (H - pad.t - pad.b); };

    var svg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, role: 'img', tabindex: '0' });
    svg.setAttribute('aria-label', $('.chart-title').textContent + '. ' + $('.chart-sub').textContent);

    for (var t = y0; t <= y1 + step / 1e6; t += step) {
      var yy = Y(t);
      svg.appendChild(svgEl('line', { x1: pad.l, x2: W - pad.r, y1: yy, y2: yy, class: 'grid' }));
      svg.appendChild(svgEl('text', { x: pad.l - 8, y: yy + 4, class: 'tick', 'text-anchor': 'end' },
        IND[ind].currency ? num(t, step < 0.1 ? 2 : 1) : num(t, step < 0.1 ? 2 : step < 1 ? 1 : 0)));
    }
    var fy = day(s.d[first]).getFullYear() + 1, ly = day(s.d[last]).getFullYear();
    for (var yr = fy; yr <= ly; yr++) {
      var xx = X(yr + '-01-01');
      svg.appendChild(svgEl('text', { x: xx, y: H - 8, class: 'tick', 'text-anchor': 'middle' }, String(yr)));
      svg.appendChild(svgEl('line', { x1: xx, x2: xx, y1: H - pad.b, y2: H - pad.b + 4, class: 'grid' }));
    }
    // início do ano de referência
    if (startIdx > first) {
      var xs = X(y + '-01-01');
      svg.appendChild(svgEl('line', { x1: xs, x2: xs, y1: pad.t, y2: H - pad.b, class: 'year-start' }));
      svg.appendChild(svgEl('text', { x: xs + 6, y: pad.t + 10, class: 'year-start-label' }, 'começa ' + y));
    }

    var top = '', bottom = '', line = '';
    s.d.forEach(function (d, i) {
      var x = X(d).toFixed(1);
      top += (i ? 'L' : 'M') + x + ',' + Y(s.max[i]).toFixed(1);
      line += (i ? 'L' : 'M') + x + ',' + Y(s.med[i]).toFixed(1);
    });
    for (var i = s.d.length - 1; i >= 0; i--) bottom += 'L' + X(s.d[i]).toFixed(1) + ',' + Y(s.min[i]).toFixed(1);
    svg.appendChild(svgEl('path', { d: top + bottom + 'Z', class: 'band' }));

    if (real != null) {
      var yr2 = Y(real);
      svg.appendChild(svgEl('line', { x1: pad.l, x2: W - pad.r, y1: yr2, y2: yr2, class: 'real' }));
      svg.appendChild(svgEl('text', { x: W - pad.r + 6, y: yr2 + 4, class: 'real-label' }, num(real, 2)));
    }

    svg.appendChild(svgEl('path', { d: line, class: 'line' }));
    var lx = X(s.d[last]), lyv = Y(s.med[last]);
    svg.appendChild(svgEl('circle', { cx: lx, cy: lyv, r: 4, class: 'dot' }));
    if (real == null || Math.abs(Y(real) - lyv) > 14) {
      svg.appendChild(svgEl('text', { x: lx + 8, y: lyv + 4, class: 'end-label' }, num(s.med[last], 2)));
    }

    // camada de hover
    var cross = svgEl('line', { y1: pad.t, y2: H - pad.b, class: 'cross', visibility: 'hidden' });
    var hdot = svgEl('circle', { r: 4, class: 'dot', visibility: 'hidden' });
    svg.appendChild(cross);
    svg.appendChild(hdot);
    var tip = el('div', 'tip');
    tip.hidden = true;
    var current = last;

    function row(label, value, main) {
      var r = el('div', 'tip-row' + (main ? ' tip-main' : ''));
      r.appendChild(el('span', null, label));
      r.appendChild(el('strong', null, value));
      return r;
    }
    function show(i) {
      current = Math.max(0, Math.min(last, i));
      var x = X(s.d[current]), yv = Y(s.med[current]);
      cross.setAttribute('x1', x); cross.setAttribute('x2', x); cross.setAttribute('visibility', 'visible');
      hdot.setAttribute('cx', x); hdot.setAttribute('cy', yv); hdot.setAttribute('visibility', 'visible');
      tip.textContent = '';
      tip.appendChild(el('div', 'tip-date', 'Semana de ' + fmtDay(s.d[current])));
      tip.appendChild(row('Mediana', fmt(ind, s.med[current]), true));
      tip.appendChild(row('Média', fmt(ind, s.mean[current])));
      tip.appendChild(row('Mín. – máx.', num(s.min[current], 2) + ' – ' + num(s.max[current], 2)));
      tip.appendChild(row('Respondentes', String(s.n[current])));
      tip.hidden = false;
      var w = tip.offsetWidth, scale = box.clientWidth / W;
      var left = x * scale + 14;
      if (left + w > box.clientWidth) left = x * scale - w - 14;
      tip.style.left = Math.max(0, left) + 'px';
    }
    function hide() {
      cross.setAttribute('visibility', 'hidden');
      hdot.setAttribute('visibility', 'hidden');
      tip.hidden = true;
    }
    function nearest(clientX) {
      var rect = svg.getBoundingClientRect();
      var x = (clientX - rect.left) * (W / rect.width), best = 0, dist = Infinity;
      for (var i = 0; i <= last; i++) {
        var dx = Math.abs(X(s.d[i]) - x);
        if (dx < dist) { dist = dx; best = i; }
      }
      return best;
    }
    svg.addEventListener('pointermove', function (e) { show(nearest(e.clientX)); });
    svg.addEventListener('pointerdown', function (e) { show(nearest(e.clientX)); });
    svg.addEventListener('pointerleave', hide);
    svg.addEventListener('focus', function () { show(current); });
    svg.addEventListener('blur', hide);
    svg.addEventListener('keydown', function (e) {
      var n = e.shiftKey ? 10 : 1;
      if (e.key === 'ArrowLeft') { show(current - n); e.preventDefault(); }
      if (e.key === 'ArrowRight') { show(current + n); e.preventDefault(); }
    });

    box.appendChild(svg);
    box.appendChild(tip);
  }

  // ---------- tabela ----------
  function renderTable(data) {
    var s = data.years[String(state.year)], tbody = app.querySelector('tbody'), ind = state.ind;
    tbody.textContent = '';
    for (var i = s.d.length - 1; i >= 0; i--) {
      var tr = el('tr');
      tr.appendChild(el('td', null, fmtDay(s.d[i])));
      [s.med[i], s.mean[i], s.min[i], s.max[i]].forEach(function (v) { tr.appendChild(el('td', null, fmt(ind, v))); });
      tr.appendChild(el('td', null, String(s.n[i])));
      tbody.appendChild(tr);
    }
  }

  // ---------- estado ----------
  function readHash() {
    var m = location.hash.match(/^#(ipca|selic|pib|cambio)(?:\/(\d{4}))?$/);
    if (m) { state.ind = m[1]; state.year = m[2] ? +m[2] : null; }
  }
  function writeHash() {
    history.replaceState(null, '', '#' + state.ind + '/' + state.year);
  }

  function update() {
    app.querySelectorAll('[data-ind]').forEach(function (b) {
      b.setAttribute('aria-selected', String(b.dataset.ind === state.ind));
    });
    app.classList.add('loading');
    load(state.ind).then(function (data) {
      var years = Object.keys(data.years).map(Number);
      var latestYear = +data.latest.slice(0, 4);
      if (!state.year || years.indexOf(state.year) < 0) state.year = latestYear;
      renderSummary(data);
      renderYears(data);
      renderChart(data);
      renderTable(data);
      writeHash();
      app.classList.remove('loading');
    }).catch(function () {
      $('.chart').textContent = '';
      $('.chart').appendChild(el('p', 'error', 'Não foi possível carregar os dados agora. Tente de novo em alguns minutos.'));
    });
  }

  app.querySelectorAll('[data-ind]').forEach(function (b) {
    b.addEventListener('click', function () { state.ind = b.dataset.ind; update(); });
  });
  var timer;
  window.addEventListener('resize', function () {
    clearTimeout(timer);
    timer = setTimeout(function () { if (cache[state.ind]) renderChart(cache[state.ind]); }, 150);
  });
  window.addEventListener('hashchange', function () { readHash(); update(); });

  readHash();
  update();
})();
