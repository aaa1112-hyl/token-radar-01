// Token Radar dashboard: the board, a detail view for every protocol, and a filter.
// Renders window.RADAR (written by main.ts from the sealed snapshot) with no network.
// Row arrays: [rank, slug, name, category, chains, tvl, chg, age, implied, multiple,
//   growthMult, maturityMult, breadthMult, watchlist]. Live arrays: [slug, name, category,
//   chains, tvl, mcap, chg, multiple]. Query params drive the views, so the three
//   screenshots are deterministic: ?detail=<slug> opens a protocol, ?category=<name> or
//   ?watchlist=1 filters the board, ?tab=live|model switches tabs.
(function () {
  var DATA = window.RADAR;
  var params = new URLSearchParams(location.search);
  var state = {
    q: params.get('q') || '',
    category: params.get('category') || 'all',
    chain: params.get('chain') || 'all',
    watchlist: params.get('watchlist') === '1',
    sort: params.get('sort') || 'implied',
    dir: -1,
    tab: params.get('tab') || 'board',
    selected: null,
    growthWeight: DATA.model.growth_weight,
  };

  function fmtUsd(n) {
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + Math.round(n);
  }
  function fmtNum(n) { return '$' + Math.round(n).toLocaleString('en-US'); }
  function fmtPct(n) {
    if (n === null || n === undefined) return '—';
    return (n > 0 ? '+' : '') + n.toFixed(1) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days < 30) return days + 'd';
    if (days < 365) return Math.round(days / 30) + 'mo';
    return (days / 365).toFixed(1) + 'y';
  }
  function clampGrowth(g) { return Math.min(120, Math.max(-60, g === null ? 0 : g)); }

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'text') node.textContent = attrs[k];
      else if (k === 'html') node.innerHTML = attrs[k];
      else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
    });
    if (children) (Array.isArray(children) ? children : [children]).forEach(function (c) { if (c) node.appendChild(c); });
    return node;
  }

  // --- the farm plan, derived from the row's own record, as board.json does ---
  function capitalFor(tvl) {
    if (tvl >= 5e9) return 250;
    if (tvl >= 1e9) return 150;
    if (tvl >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function actionFor(name, cat, capital, chain) {
    var c = (cat || '').toLowerCase();
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0)
      return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ', then borrow $20 against it and repay it the same week so the position shows both sides.';
    if (c.indexOf('dex') >= 0 || c.indexOf('liquidity manager') >= 0)
      return 'Add $' + capital + ' of liquidity to ' + name + '\'s deepest pool on ' + chain + ' and make one swap through it each week.';
    if (c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0)
      return 'Deposit $' + capital + ' into ' + name + '\'s highest-yield vault on ' + chain + ' and top it up by $10 every week.';
    if (c.indexOf('bridge') >= 0 || c.indexOf('cross chain') >= 0)
      return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ', then use the bridged funds in its app instead of bridging straight back.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0 || c.indexOf('staking pool') >= 0)
      return 'Stake $' + capital + ' of the chain\'s staking asset through ' + name + ' on ' + chain + ' and keep the receipt token in the same wallet.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('options') >= 0)
      return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedged trade, closing it before the week ends.';
    if (c.indexOf('prediction') >= 0)
      return 'Fund $' + capital + ' on ' + name + ' and place one small position in a market that settles within the week.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('onchain capital') >= 0)
      return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the vault shares in the same wallet.';
    if (c.indexOf('stable') >= 0)
      return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + ' and hold it for the full window.';
    if (c.indexOf('rwa') >= 0)
      return 'Mint $' + capital + ' of the protocol\'s yield-bearing asset on ' + chain + ' through ' + name + ' and hold it.';
    if (c.indexOf('insurance') >= 0)
      return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy active for the full window.';
    if (c.indexOf('farm') >= 0)
      return 'Deposit $' + capital + ' into ' + name + '\'s main farm on ' + chain + ' and claim and re-stake the rewards once a week.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and use its main feature once a week.';
  }
  function weeklyFor(cat) {
    var c = (cat || '').toLowerCase();
    if (c.indexOf('dex') >= 0 || c.indexOf('liquidity manager') >= 0) return 'Swap $10 through the pool and add the fees back to the position.';
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0) return 'Adjust the borrow by $10 and repay it, so the account shows fresh activity.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Open and close one small trade so the account shows weekly volume.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $10 back and forth once, keeping the main funds on the destination chain.';
    if (c.indexOf('prediction') >= 0) return 'Settle one market and open the next, keeping a position live every week.';
    return 'Make one qualifying action, such as a deposit, a swap, a vote or a claim.';
  }
  function farmSteps(row) {
    var name = row[2], cat = row[3], chain = (row[4] || '').split('|')[0] || 'its main chain';
    var capital = capitalFor(row[5]), hold = holdDaysFor(row[7]);
    return [
      { t: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', c: 'under $3 of gas for the first transaction', d: '5 minutes' },
      { t: actionFor(name, cat, capital, chain), c: '$' + capital + ' of capital and about $' + (capital >= 150 ? 8 : 4) + ' of gas', d: '15 minutes to set up' },
      { t: weeklyFor(cat) + ' Do it on the same day each week so the activity forms a regular pattern.', c: 'about $2 of gas a week', d: '10 minutes a week' },
      { t: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', c: 'the $' + capital + ' stays in the position', d: hold + ' days' },
      { t: 'Before you withdraw, open the protocol\'s own points or rewards page and claim only from the link it publishes.', c: 'no fee to check, and never pay to claim', d: '10 minutes' },
      { t: 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.', c: 'nothing but the log', d: '5 minutes' },
    ];
  }

  // --- ranking under the sandbox weight ---
  function impliedOf(row, w) {
    var g = 1 + (clampGrowth(row[6]) / 100) * w;
    return Math.max(1, Math.round(row[5] * row[9] * g * row[11] * row[12]));
  }
  function viewRows() {
    var list = DATA.rows.filter(function (r) {
      if (state.watchlist && !r[13]) return false;
      if (state.category !== 'all' && (r[3] || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && (r[4] || '').split('|').indexOf(state.chain) < 0) return false;
      if (state.q) {
        var q = state.q.toLowerCase();
        if (r[2].toLowerCase().indexOf(q) < 0 && r[1].toLowerCase().indexOf(q) < 0) return false;
      }
      return true;
    });
    var key = state.sort;
    list = list.slice().sort(function (a, b) {
      var va, vb;
      if (key === 'implied') { va = impliedOf(a, state.growthWeight); vb = impliedOf(b, state.growthWeight); }
      else if (key === 'tvl') { va = a[5]; vb = b[5]; }
      else if (key === 'growth') { va = a[6] === null ? -999 : a[6]; vb = b[6] === null ? -999 : b[6]; }
      else if (key === 'age') { va = a[7] === null ? -1 : a[7]; vb = b[7] === null ? -1 : b[7]; }
      else { va = a[2].toLowerCase(); vb = b[2].toLowerCase(); }
      if (va < vb) return -state.dir; if (va > vb) return state.dir; return a[0] - b[0];
    });
    return list;
  }

  function header() {
    return el('header', { class: 'top' }, [
      el('div', {}, [
        el('h1', { html: 'Token Radar <b>· pre-token protocols, ranked</b>' }),
        el('p', { text: 'Which protocol\'s token would be worth the most if it launched today — and how to farm it first. Implied values come from the snapshot\'s own figures, never from a hand-kept list of names.' }),
      ]),
      el('div', {}, el('span', { class: 'badge', text: 'Snapshot ' + DATA.as_of + ' · DeFiLlama' })),
    ]);
  }
  function stats() {
    var total = DATA.total_implied_usd;
    return el('div', { class: 'stats' }, [
      el('div', { class: 'stat' }, [el('span', { text: 'Watchlist' }), el('b', { text: String(DATA.watchlist_size) }), el('small', { text: ' protocols at $50M+ TVL, no token recorded' })]),
      el('div', { class: 'stat' }, [el('span', { text: 'Board' }), el('b', { text: String(DATA.board_size) }), el('small', { text: ' ranked, ' + DATA.early_size + ' below the floor' })]),
      el('div', { class: 'stat' }, [el('span', { text: 'Total implied value' }), el('b', { text: fmtUsd(total) }), el('small', { text: ' across the whole board' })]),
      el('div', { class: 'stat' }, [el('span', { text: 'Median multiple' }), el('b', { text: DATA.median_multiple.toFixed(2) + '×' }), el('small', { text: ' market cap / TVL, live tokens' })]),
    ]);
  }
  function chart() {
    var top = DATA.rows.slice(0, 10);
    var max = top.length ? top[0][8] : 1;
    return el('section', { class: 'panel' }, [
      el('h2', { text: 'Top 10 by implied value' }),
      el('p', { class: 'sub', text: 'Implied launch value if each protocol\'s token traded at its category\'s comparable multiple.' }),
      el('div', { class: 'chart' }, top.map(function (r) {
        return el('div', { class: 'bar-row' }, [
          el('span', { text: '#' + r[0] + ' ' + r[2] }),
          el('div', { class: 'bar-track' }, el('div', { class: 'bar-fill', style: 'width:' + Math.max(2, Math.round(r[8] / max * 100)) + '%' })),
          el('span', { class: 'bar-val', text: fmtUsd(r[8]) }),
        ]);
      })),
    ]);
  }
  function tabs() {
    function tab(name, label) {
      return el('button', { type: 'button', 'aria-pressed': state.tab === name ? 'true' : 'false', text: label, onclick: function () { state.tab = name; render(); } });
    }
    return el('div', { class: 'tabs' }, [tab('board', 'Board'), tab('live', 'Live-token comps'), tab('model', 'Model & method')]);
  }
  function controls() {
    var cats = Array.from(new Set(DATA.rows.map(function (r) { return r[3] || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (a, r) { return a.concat((r[4] || '').split('|').filter(Boolean)); }, []))).sort();
    var search = el('input', { type: 'search', placeholder: 'Search name or slug…', value: state.q, 'aria-label': 'Search' });
    search.addEventListener('input', function () { state.q = search.value; render(); });
    var catSel = el('select', { 'aria-label': 'Category' }, [el('option', { value: 'all', text: 'All categories' })].concat(cats.map(function (c) { return el('option', { value: c, text: c }); })));
    catSel.value = state.category;
    catSel.addEventListener('change', function () { state.category = catSel.value; render(); });
    var chainSel = el('select', { 'aria-label': 'Chain' }, [el('option', { value: 'all', text: 'All chains' })].concat(chains.map(function (c) { return el('option', { value: c, text: c }); })));
    chainSel.value = state.chain;
    chainSel.addEventListener('change', function () { state.chain = chainSel.value; render(); });
    var wl = el('input', { type: 'checkbox', checked: state.watchlist ? 'checked' : null, 'aria-label': 'Watchlist only' });
    wl.addEventListener('change', function () { state.watchlist = wl.checked; render(); });
    var sortSel = el('select', { 'aria-label': 'Sort by' }, [
      el('option', { value: 'implied', text: 'Sort: implied value' }),
      el('option', { value: 'tvl', text: 'Sort: TVL' }),
      el('option', { value: 'growth', text: 'Sort: 7-day growth' }),
      el('option', { value: 'age', text: 'Sort: age' }),
      el('option', { value: 'name', text: 'Sort: name' }),
    ]);
    sortSel.value = state.sort;
    sortSel.addEventListener('change', function () { state.sort = sortSel.value; render(); });
    return el('div', { class: 'controls' }, [
      el('div', { class: 'field' }, [el('span', { text: 'Search' }), search]),
      el('div', { class: 'field' }, [el('span', { text: 'Category' }), catSel]),
      el('div', { class: 'field' }, [el('span', { text: 'Chain' }), chainSel]),
      el('div', { class: 'field' }, [el('span', { text: 'Watchlist only' }), wl]),
      el('div', { class: 'field' }, [el('span', { text: 'Sort' }), sortSel]),
      el('span', { class: 'count', text: viewRows().length + ' of ' + DATA.board_size + ' rows shown' }),
    ]);
  }
  function boardTable() {
    var list = viewRows();
    if (!list.length) return el('div', { class: 'empty' }, [el('h2', { text: 'No protocol matches that filter' }), el('p', { text: 'Clear the search or widen the category and chain filters.' })]);
    function sortBtn(key, label) {
      return el('button', { type: 'button', text: label + (state.sort === key ? (state.dir < 0 ? ' ↓' : ' ↑') : ''), onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } });
    }
    var head = el('tr', {}, [
      el('th', {}, sortBtn('implied', 'Rank')), el('th', {}, sortBtn('name', 'Protocol')),
      el('th', {}, el('span', { text: 'Category' })), el('th', {}, el('span', { text: 'Chains' })),
      el('th', {}, sortBtn('tvl', 'TVL')), el('th', {}, sortBtn('growth', '7d')),
      el('th', {}, sortBtn('age', 'Age')), el('th', {}, sortBtn('implied', 'Implied value')), el('th', {}, el('span', { text: '× mult' })),
    ]);
    var body = el('tbody', {}, list.slice(0, 100).map(function (r) {
      var chg = r[6];
      return el('tr', { tabindex: '0', onclick: function () { openDetail(r[1]); }, onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r[1]); } } }, [
        el('td', { text: '#' + r[0] + (r[13] ? ' ★' : '') }),
        el('td', { class: 'name' }, [el('b', { text: r[2] }), el('small', { text: r[1] })]),
        el('td', { text: r[3] || '—' }),
        el('td', {}, (r[4] || '').split('|').slice(0, 3).map(function (c) { return el('span', { class: 'tag', text: c }); })),
        el('td', { text: fmtUsd(r[5]) }),
        el('td', { class: chg === null ? '' : (chg >= 0 ? 'up' : 'down'), text: fmtPct(chg) }),
        el('td', { text: fmtAge(r[7]) }),
        el('td', {}, el('b', { text: fmtUsd(impliedOf(r, state.growthWeight)) })),
        el('td', { text: r[9].toFixed(2) + '×' }),
      ]);
    }));
    var note = list.length > 100 ? el('p', { class: 'sub', text: 'Showing the first 100 of ' + list.length + ' matching rows — narrow the filters to see the rest.' }) : null;
    return el('div', {}, [el('table', { class: 'board' }, [el('thead', {}, head), body]), note]);
  }
  function liveView() {
    var head = el('tr', {}, ['Protocol', 'Category', 'TVL', 'Market cap', 'mcap / TVL', '7d'].map(function (h) { return el('th', {}, el('span', { text: h })); }));
    var body = el('tbody', {}, DATA.live.map(function (r) {
      return el('tr', {}, [
        el('td', { class: 'name' }, [el('b', { text: r[1] }), el('small', { text: r[0] })]),
        el('td', { text: r[2] || '—' }),
        el('td', { text: fmtUsd(r[4]) }),
        el('td', { text: fmtUsd(r[5]) }),
        el('td', {}, el('b', { text: r[7].toFixed(2) + '×' })),
        el('td', { class: r[6] === null ? '' : (r[6] >= 0 ? 'up' : 'down'), text: fmtPct(r[6]) }),
      ]);
    }));
    return el('section', { class: 'panel' }, [
      el('h2', { text: 'Live-token comparables' }),
      el('p', { class: 'sub', text: 'The market\'s own values: the 24 largest live-token protocols by market cap. Their market-cap / TVL ratios are the comparables the model\'s multiples come from — a token already trades here, so the board shows the market\'s number, never a model\'s.' }),
      el('table', { class: 'board' }, [el('thead', {}, head), body]),
    ]);
  }
  function modelView() {
    var m = DATA.model;
    var compRows = DATA.comps.map(function (c) {
      return el('tr', {}, [el('td', { text: c.category }), el('td', { text: String(c.n) }), el('td', { text: c.median.toFixed(3) + '×' }), el('td', {}, el('b', { text: c.multiple.toFixed(3) + '×' }))]);
    });
    return el('section', { class: 'panel' }, [
      el('h2', { text: 'How implied value is computed — model ' + DATA.model_version }),
      el('p', { class: 'sub', text: 'Every factor comes from the snapshot\'s own figures. No protocol name is special-cased: the same function scores every row.' }),
      el('div', { class: 'note' }, el('span', { html: '<b>implied = TVL × multiple × growth × maturity × breadth.</b> multiple is the category\'s comparable (below); growth = 1 + clamped 7-day change × ' + m.growth_weight + '; maturity = 0.6 + min(age, 1095d) / 1095 × 0.4; breadth = 1 + 0.03 × (chains − 1), capped at 1.15.' })),
      el('h3', { text: 'Comparable multiples by category' }),
      el('p', { class: 'sub', text: 'Median market-cap / TVL of the category\'s live-token protocols, shrunk toward the whole-market median (' + DATA.median_multiple.toFixed(3) + '×) when a category has few live names, clamped to 0.02×–1.50×.' }),
      el('table', { class: 'model-table' }, [
        el('thead', {}, el('tr', {}, ['Category', 'Live names', 'Median', 'Multiple'].map(function (h) { return el('th', {}, el('span', { text: h })); }))),
        el('tbody', {}, compRows),
      ]),
      el('h3', { text: 'Try it: move the growth weight' }),
      el('p', { class: 'sub', text: 'The board re-ranks live from the same snapshot figures. The submitted board uses growth weight ' + m.growth_weight + '.' }),
      el('div', {}, [
        el('input', { type: 'range', min: '0', max: '1', step: '0.05', value: String(state.growthWeight), 'aria-label': 'Growth weight', oninput: function (e) { state.growthWeight = parseFloat(e.target.value); document.getElementById('gw-val').textContent = state.growthWeight.toFixed(2); renderBoardOnly(); } }),
        el('span', { id: 'gw-val', text: ' ' + state.growthWeight.toFixed(2) }),
        el('button', { type: 'button', text: ' Reset', onclick: function () { state.growthWeight = DATA.model.growth_weight; render(); } }),
      ]),
      el('div', { id: 'sandbox-board' }),
      el('h3', { text: 'What the board does not claim' }),
      el('p', { class: 'sub', text: 'A protocol on the board records no token in DefiLlama\'s data — that is a record, not proof it has none. Implied value is this entry\'s own claim about what a launch would be worth if the protocol\'s record stayed as it is; it does not predict whether or when a token is issued.' }),
    ]);
  }
  function renderBoardOnly() {
    var host = document.getElementById('sandbox-board');
    if (!host) return;
    host.textContent = '';
    var top = viewRows().slice(0, 5);
    host.appendChild(el('p', { class: 'sub', text: 'Top 5 at growth weight ' + state.growthWeight.toFixed(2) + ': ' + top.map(function (r) { return '#' + r[0] + ' ' + r[2] + ' (' + fmtUsd(impliedOf(r, state.growthWeight)) + ')'; }).join(' · ') }));
  }
  function openDetail(slug) {
    var row = null;
    DATA.rows.forEach(function (r) { if (r[1] === slug) row = r; });
    if (!row) return;
    state.selected = slug;
    var comp = null;
    DATA.comps.forEach(function (c) { if (c.category === (row[3] || 'Other')) comp = c; });
    var steps = farmSteps(row);
    var overlay = el('div', { class: 'overlay', onclick: function (e) { if (e.target === overlay) closeDetail(); } }, [
      el('div', { class: 'dialog', role: 'dialog', 'aria-label': row[2] }, [
        el('button', { class: 'close', type: 'button', text: 'Close ×', onclick: closeDetail }),
        el('h2', { text: row[2] }),
        el('p', { class: 'sub', text: (row[3] || 'No category') + ' · ' + (row[4] || '').split('|').join(', ') + (row[13] ? ' · ★ watchlist' : '') }),
        el('div', { class: 'kv' }, [
          el('div', {}, [el('span', { text: 'Rank' }), el('b', { text: '#' + row[0] + ' of ' + DATA.board_size })]),
          el('div', {}, [el('span', { text: 'Implied value' }), el('b', { text: fmtNum(impliedOf(row, state.growthWeight)) })]),
          el('div', {}, [el('span', { text: 'TVL' }), el('b', { text: fmtUsd(row[5]) })]),
          el('div', {}, [el('span', { text: '7-day change' }), el('b', { class: row[6] === null ? '' : (row[6] >= 0 ? 'up' : 'down'), text: fmtPct(row[6]) })]),
          el('div', {}, [el('span', { text: 'Age (tracked since)' }), el('b', { text: fmtAge(row[7]) })]),
          el('div', {}, [el('span', { text: 'Token' }), el('b', { text: 'none recorded' })]),
        ]),
        el('h3', { text: 'Why this value — the model, step by step' }),
        el('table', { class: 'model-table' }, [
          el('tbody', {}, [
            el('tr', {}, [el('td', { text: 'TVL' }), el('td', { text: fmtNum(row[5]) })]),
            el('tr', {}, [el('td', { text: 'Comparable multiple (' + (row[3] || 'Other') + (comp ? ', ' + comp.n + ' live names' : '') + ')' }), el('td', { text: '× ' + row[9].toFixed(3) })]),
            el('tr', {}, [el('td', { text: 'Growth (7d ' + fmtPct(row[6]) + ')' }), el('td', { text: '× ' + row[10].toFixed(3) })]),
            el('tr', {}, [el('td', { text: 'Maturity (' + fmtAge(row[7]) + ' with no token)' }), el('td', { text: '× ' + row[11].toFixed(3) })]),
            el('tr', {}, [el('td', { text: 'Breadth (' + (row[4] || '').split('|').length + ' chains)' }), el('td', { text: '× ' + row[12].toFixed(3) })]),
            el('tr', {}, [el('td', {}, el('b', { text: 'Implied value' })), el('td', {}, el('b', { text: fmtNum(impliedOf(row, state.growthWeight)) }))]),
          ]),
        ]),
        el('h3', { text: 'How to farm it' }),
        el('ol', { class: 'farm' }, steps.map(function (s) {
          return el('li', {}, [el('span', { text: s.t }), el('br'), el('b', { text: 'Cost: ' + s.c + ' · Time: ' + s.d })]);
        })),
        el('div', { class: 'note' }, el('span', { text: 'Farm only what you can afford to lose, and claim only from links the protocol itself publishes. This board is a radar, not financial advice.' })),
      ]),
    ]);
    document.body.appendChild(overlay);
    document.addEventListener('keydown', escClose);
  }
  function escClose(e) { if (e.key === 'Escape') closeDetail(); }
  function closeDetail() {
    state.selected = null;
    document.removeEventListener('keydown', escClose);
    var o = document.querySelector('.overlay');
    if (o) o.remove();
  }
  function render() {
    var main = document.getElementById('board');
    main.textContent = '';
    main.setAttribute('aria-busy', 'false');
    var wrap = el('div', { class: 'wrap' }, [header(), stats(), chart(), tabs()]);
    if (state.tab === 'board') {
      wrap.appendChild(el('section', { class: 'panel' }, [
        el('h2', { text: 'The board' }),
        el('p', { class: 'sub', text: 'Every pre-token protocol in the snapshot, ranked by implied value. Click a row for its model breakdown and farm plan.' }),
        controls(), boardTable(),
      ]));
    } else if (state.tab === 'live') {
      wrap.appendChild(liveView());
    } else {
      wrap.appendChild(modelView());
    }
    wrap.appendChild(el('footer', { text: 'Token Radar · model ' + DATA.model_version + ' · snapshot ' + DATA.as_of + ' · ' + DATA.source + ' · Implied values are this entry\'s own claims, not make.fun\'s. Farm plans are a guide, not financial advice.' }));
    main.appendChild(wrap);
    if (state.tab === 'model') renderBoardOnly();
    var detailSlug = params.get('detail');
    if (detailSlug && !document.querySelector('.overlay')) openDetail(detailSlug);
  }
  render();
})();
