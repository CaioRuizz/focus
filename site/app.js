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
    $('.chart-note').textContent = ind === 'cambio' && real != null
      ? 'Realizado do câmbio: média da PTAX de venda nos dias úteis de dezembro, a definição que bate com as projeções do Focus (veja a metodologia).'
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
    var gap = null;
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
      if (real != null) tip.appendChild(row('Distância do realizado', fmtDelta(ind, s.med[current] - real)));
      tip.hidden = false;
      if (gap) gap.show(current);
      var w = tip.offsetWidth, scale = box.clientWidth / W;
      var left = x * scale + 14;
      if (left + w > box.clientWidth) left = x * scale - w - 14;
      tip.style.left = Math.max(0, left) + 'px';
    }
    function hide() {
      cross.setAttribute('visibility', 'hidden');
      hdot.setAttribute('visibility', 'hidden');
      tip.hidden = true;
      if (gap) gap.hide();
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
    gap = renderGap(ind, s, real, W, X, pad, function (i) { show(i); }, hide);
  }

  // ---------- distância entre a mediana e o realizado (mesmo eixo de tempo do gráfico principal) ----------
  function renderGap(ind, s, real, W, X, pad, onPick, onLeave) {
    var wrap = $('.gap'), box = $('.gap-chart');
    box.textContent = '';
    wrap.hidden = real == null;
    if (real == null) return null;

    var diffs = s.med.map(function (v) { return v - real; });
    var last = diffs.length - 1;
    var H = 150, top = 12, bottom = 22;
    var lo = Math.min(0, Math.min.apply(null, diffs)), hi = Math.max(0, Math.max.apply(null, diffs));
    var step = niceStep(hi - lo || 1, 3);
    var y0 = Math.floor(lo / step) * step, y1 = Math.ceil(hi / step) * step;
    if (y1 === y0) y1 = y0 + step;
    var Y = function (v) { return top + (1 - (v - y0) / (y1 - y0)) * (H - top - bottom); };

    var svg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, role: 'img' });
    svg.setAttribute('aria-label', 'Distância entre a mediana e o valor realizado ao longo do tempo');
    for (var t = y0; t <= y1 + step / 1e6; t += step) {
      if (Math.abs(t) < step / 1e6) continue;
      var yy = Y(t);
      svg.appendChild(svgEl('line', { x1: pad.l, x2: W - pad.r, y1: yy, y2: yy, class: 'grid' }));
      svg.appendChild(svgEl('text', { x: pad.l - 8, y: yy + 4, class: 'tick', 'text-anchor': 'end' },
        (t > 0 ? '+' : '') + num(t, step < 0.1 ? 2 : step < 1 ? 1 : 0)));
    }
    var zero = Y(0);
    var line = '', area = '';
    diffs.forEach(function (v, i) {
      var x = X(s.d[i]).toFixed(1), y = Y(v).toFixed(1);
      line += (i ? 'L' : 'M') + x + ',' + y;
    });
    area = line + 'L' + X(s.d[last]).toFixed(1) + ',' + zero.toFixed(1) + 'L' + X(s.d[0]).toFixed(1) + ',' + zero.toFixed(1) + 'Z';
    svg.appendChild(svgEl('path', { d: area, class: 'gap-area' }));
    svg.appendChild(svgEl('line', { x1: pad.l, x2: W - pad.r, y1: zero, y2: zero, class: 'real' }));
    svg.appendChild(svgEl('text', { x: pad.l - 8, y: zero + 4, class: 'tick', 'text-anchor': 'end' }, '0'));
    svg.appendChild(svgEl('text', { x: W - pad.r + 6, y: zero + 4, class: 'real-label' }, 'realizado'));
    svg.appendChild(svgEl('path', { d: line, class: 'line' }));
    var endY = Y(diffs[last]);
    svg.appendChild(svgEl('circle', { cx: X(s.d[last]), cy: endY, r: 4, class: 'dot' }));
    if (Math.abs(endY - zero) > 14) {
      svg.appendChild(svgEl('text', { x: X(s.d[last]) + 8, y: endY + 4, class: 'end-label' }, fmtDelta(ind, diffs[last])));
    }

    var cross = svgEl('line', { y1: top, y2: H - bottom, class: 'cross', visibility: 'hidden' });
    var hdot = svgEl('circle', { r: 4, class: 'dot', visibility: 'hidden' });
    svg.appendChild(cross);
    svg.appendChild(hdot);
    function nearest(clientX) {
      var rect = svg.getBoundingClientRect();
      var x = (clientX - rect.left) * (W / rect.width), best = 0, dist = Infinity;
      for (var i = 0; i <= last; i++) {
        var dx = Math.abs(X(s.d[i]) - x);
        if (dx < dist) { dist = dx; best = i; }
      }
      return best;
    }
    svg.addEventListener('pointermove', function (e) { onPick(nearest(e.clientX)); });
    svg.addEventListener('pointerdown', function (e) { onPick(nearest(e.clientX)); });
    svg.addEventListener('pointerleave', onLeave);
    box.appendChild(svg);

    return {
      show: function (i) {
        var x = X(s.d[i]);
        cross.setAttribute('x1', x); cross.setAttribute('x2', x); cross.setAttribute('visibility', 'visible');
        hdot.setAttribute('cx', x); hdot.setAttribute('cy', Y(diffs[i])); hdot.setAttribute('visibility', 'visible');
      },
      hide: function () {
        cross.setAttribute('visibility', 'hidden');
        hdot.setAttribute('visibility', 'hidden');
      },
    };
  }

  // ---------- projeção do início do ano × realizado, todos os anos ----------
  function renderScore(data) {
    var ind = state.ind, card = $('.score-card'), box = $('.score-chart');
    box.textContent = '';
    var rows = [];
    Object.keys(data.realized || {}).sort().forEach(function (y) {
      var s = data.years[y];
      if (!s) return;
      var i = 0;
      while (i < s.d.length && s.d[i] < y + '-01-01') i++;
      if (i >= s.d.length) return;
      rows.push({ year: y, start: s.med[i], date: s.d[i], real: data.realized[y], diff: s.med[i] - data.realized[y] });
    });
    card.hidden = rows.length === 0;
    if (!rows.length) return;

    var W = Math.max(box.clientWidth, 280), H = 220, pad = { l: 46, r: 10, t: 22, b: 26 };
    var lo = Math.min(0, Math.min.apply(null, rows.map(function (r) { return r.diff; })));
    var hi = Math.max(0, Math.max.apply(null, rows.map(function (r) { return r.diff; })));
    var step = niceStep(hi - lo || 1, 4);
    var y0 = Math.floor(lo / step) * step, y1 = Math.ceil(hi / step) * step;
    var Y = function (v) { return pad.t + (1 - (v - y0) / (y1 - y0)) * (H - pad.t - pad.b); };
    var band = (W - pad.l - pad.r) / rows.length, bw = Math.min(24, band * 0.6);

    var svg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, role: 'img' });
    svg.setAttribute('aria-label', 'Diferença entre a projeção do início de cada ano e o valor realizado');
    for (var t = y0; t <= y1 + step / 1e6; t += step) {
      var yy = Y(t);
      svg.appendChild(svgEl('line', { x1: pad.l, x2: W - pad.r, y1: yy, y2: yy, class: Math.abs(t) < step / 1e6 ? 'real' : 'grid' }));
      svg.appendChild(svgEl('text', { x: pad.l - 8, y: yy + 4, class: 'tick', 'text-anchor': 'end' },
        (t > 0 ? '+' : '') + num(t, step < 0.1 ? 2 : step < 1 ? 1 : 0)));
    }
    var zero = Y(0), r = 4;
    var tip = el('div', 'tip');
    tip.hidden = true;
    rows.forEach(function (row, k) {
      var cx = pad.l + band * k + band / 2, x = cx - bw / 2, yv = Y(row.diff);
      var h = Math.abs(yv - zero), rr = Math.min(r, h);
      // barra com a ponta arredondada e a base reta, saindo do zero
      var d = row.diff >= 0
        ? 'M' + x + ',' + zero + 'V' + (yv + rr) + 'Q' + x + ',' + yv + ' ' + (x + rr) + ',' + yv + 'H' + (x + bw - rr) + 'Q' + (x + bw) + ',' + yv + ' ' + (x + bw) + ',' + (yv + rr) + 'V' + zero + 'Z'
        : 'M' + x + ',' + zero + 'V' + (yv - rr) + 'Q' + x + ',' + yv + ' ' + (x + rr) + ',' + yv + 'H' + (x + bw - rr) + 'Q' + (x + bw) + ',' + yv + ' ' + (x + bw) + ',' + (yv - rr) + 'V' + zero + 'Z';
      var g = svgEl('g', { class: 'score-bar' + (+row.year === state.year ? ' is-selected' : ''), tabindex: '0', role: 'button' });
      g.setAttribute('aria-label', row.year + ': ' + fmtDelta(ind, row.diff));
      g.appendChild(svgEl('rect', { x: cx - band / 2, y: pad.t, width: band, height: H - pad.t - pad.b, class: 'hit' }));
      g.appendChild(svgEl('path', { d: d, class: 'bar' }));
      if (band >= 34) {
        g.appendChild(svgEl('text', { x: cx, y: row.diff >= 0 ? yv - 6 : yv + 14, class: 'bar-label', 'text-anchor': 'middle' },
          (row.diff > 0 ? '+' : '') + num(row.diff, IND[ind].currency ? 2 : 1)));
      }
      g.appendChild(svgEl('text', { x: cx, y: H - 8, class: 'tick', 'text-anchor': 'middle' }, band >= 34 ? row.year : "'" + row.year.slice(2)));
      function showTip() {
        tip.textContent = '';
        tip.appendChild(el('div', 'tip-date', row.year));
        var line = function (label, value, main) {
          var e = el('div', 'tip-row' + (main ? ' tip-main' : ''));
          e.appendChild(el('span', null, label));
          e.appendChild(el('strong', null, value));
          tip.appendChild(e);
        };
        line('Diferença', fmtDelta(ind, row.diff), true);
        line('Mediana no início do ano', fmt(ind, row.start));
        line('Realizado', fmt(ind, row.real));
        tip.hidden = false;
        var scale = box.clientWidth / W, w = tip.offsetWidth;
        var left = cx * scale + 14;
        if (left + w > box.clientWidth) left = cx * scale - w - 14;
        tip.style.left = Math.max(0, left) + 'px';
      }
      function pick() { state.year = +row.year; update(); document.querySelector('.chart-card').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
      g.addEventListener('pointerenter', showTip);
      g.addEventListener('focus', showTip);
      g.addEventListener('pointerleave', function () { tip.hidden = true; });
      g.addEventListener('blur', function () { tip.hidden = true; });
      g.addEventListener('click', pick);
      g.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
      svg.appendChild(g);
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

  // ---------- metodologia: Focus na última semana do ano × média de dezembro × último dia ----------
  function renderFxCheck() {
    var tbody = document.querySelector('.fx-check tbody');
    load('cambio').then(function (data) {
      tbody.textContent = '';
      var gaps = { avg: [], last: [] };
      Object.keys(data.realized || {}).sort().reverse().forEach(function (y) {
        var s = data.years[y], last = data.ptax_last_day && data.ptax_last_day[y];
        if (!s || last == null) return;
        var i = indexAt(s, y + '-12-31');
        if (i < 0 || s.d[i].slice(0, 4) !== y) return;
        var med = s.med[i], avg = data.realized[y];
        var tr = el('tr');
        tr.appendChild(el('td', null, y));
        tr.appendChild(el('td', null, 'R$ ' + num(med, 2)));
        var avgCell = el('td', null, 'R$ ' + num(avg, 2) + ' (' + fmtDelta('cambio', avg - med).replace('estável', 'menos de R$ 0,01') + ')');
        var lastCell = el('td', null, 'R$ ' + num(last, 2) + ' (' + fmtDelta('cambio', last - med).replace('estável', 'menos de R$ 0,01') + ')');
        (Math.abs(avg - med) <= Math.abs(last - med) ? avgCell : lastCell).className = 'closest';
        tr.appendChild(avgCell);
        tr.appendChild(lastCell);
        tbody.appendChild(tr);
        gaps.avg.push(Math.abs(avg - med));
        gaps.last.push(Math.abs(last - med));
      });
      if (gaps.avg.length) {
        var mean = function (xs) { return xs.reduce(function (a, b) { return a + b; }, 0) / xs.length; };
        var tr = el('tr', 'fx-summary');
        tr.appendChild(el('td', null, 'Distância média'));
        tr.appendChild(el('td', null, ''));
        tr.appendChild(el('td', 'closest', 'R$ ' + num(mean(gaps.avg), 3)));
        tr.appendChild(el('td', null, 'R$ ' + num(mean(gaps.last), 3)));
        tbody.appendChild(tr);
      }
    }).catch(function () {});
  }

  // ---------- estado ----------
  function readHash() {
    var m = location.hash.match(/^#(ipca|selic|pib|cambio)(?:\/(\d{4}))?$/);
    if (m) { state.ind = m[1]; state.year = m[2] ? +m[2] : null; }
    return !!m;
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
      renderScore(data);
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
    timer = setTimeout(function () { if (cache[state.ind]) { renderChart(cache[state.ind]); renderScore(cache[state.ind]); } }, 150);
  });
  window.addEventListener('hashchange', function () { if (readHash()) update(); });

  readHash();
  update();
  renderFxCheck();
})();
