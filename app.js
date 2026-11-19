 
'use strict';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

const form = $('#assessment-form');

const geometry = [
  ['slope_height_ft', 'Slope height', 'ft', null],
  ['slope_angle_deg', 'Slope angle', 'degrees', 90],
  ['slope_length_ft', 'Slope length', 'ft', null],
  ['ditch_slope_deg', 'Ditch slope', 'degrees', 90],
  ['ditch_width_ft', 'Ditch width', 'ft', null],
  ['ditch_depth_ft', 'Ditch depth', 'ft', null]
];

const ratings = [
  ['rockfall_freq_score', 'Rockfall frequency'],
  ['precip_score', 'Precipitation'],
  ['freeze_thaw_score', 'Freeze–thaw activity'],
  ['seepage_score', 'Seepage'],
  ['aspect_score', 'Slope aspect']
];

$('#geometry-fields').innerHTML = geometry.map(
  ([name, label, unit, max]) =>
    `<label>${label} <span class="optional">${unit}</span>
    <input type="number" name="${name}" min="0"
    ${max ? 'max="' + max + '"' : ''}
    step="any" required placeholder="Enter measurement"></label>`
).join('');

$('#rating-fields').innerHTML = ratings.map(
  ([name, label]) =>
    `<label>${label}
    <select name="${name}" required>
    <option value="">Select score</option>
    ${[3, 9, 27, 81].map(
      v => `<option value="${v}">${v}</option>`
    ).join('')}
    </select></label>`
).join('');

const samples = {
  low: {
    rock_type: 'Crystalline',
    slope_type: 'Cut',
    region: 4,
    slope_height_ft: 30,
    slope_angle_deg: 42.5,
    slope_length_ft: 300,
    ditch_slope_deg: 5,
    ditch_width_ft: 15,
    ditch_depth_ft: 2,
    rockfall_freq_score: 3,
    precip_score: 9,
    freeze_thaw_score: 9,
    seepage_score: 3,
    aspect_score: 3
  },
  high: {
    rock_type: 'Sedimentary',
    slope_type: 'Total',
    region: 3,
    slope_height_ft: 260,
    slope_angle_deg: 62.5,
    slope_length_ft: 900,
    ditch_slope_deg: 12.5,
    ditch_width_ft: 6,
    ditch_depth_ft: 0.5,
    rockfall_freq_score: 81,
    precip_score: 27,
    freeze_thaw_score: 81,
    seepage_score: 27,
    aspect_score: 27
  }
};

const recorded = {
  low: {
    hazard_class: 'Low',
    class_probabilities_pct: {
      Low: 59.2,
      Moderate: 28,
      High: 12.8
    },
    p_high_pct: 12.8,
    alert: false
  },
  high: {
    hazard_class: 'High',
    class_probabilities_pct: {
      Low: 20.2,
      Moderate: 35,
      High: 44.8
    },
    p_high_pct: 44.8,
    alert: true
  }
};

let currentStep = 0;
let currentResult = null;
let inflight = null;

function readStorage(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

// Automatically connect to Flask on the same domain.
// A saved custom endpoint can still be selected in settings.
const DEFAULT_ENDPOINT = location.origin + '/predict';
const savedEndpoint = readStorage('rockfall_endpoint', null);

let endpoint = savedEndpoint === ''
  ? ''
  : (typeof savedEndpoint === 'string' && savedEndpoint
      ? savedEndpoint
      : DEFAULT_ENDPOINT);

let history = readStorage('rockfall_history', []);
if (!Array.isArray(history)) history = [];

function escapeHTML(str) {
  return String(str).replace(
    /[&<>"']/g,
    c => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[c])
  );
}

function showMessage(message) {
  $('#form-message').textContent = message;
  $('#form-message').hidden = !message;
}

function setStep(step) {
  currentStep = step;

  $$('.step').forEach((el, i) => {
    el.classList.toggle('active', i === step);
    el.setAttribute('aria-selected', i === step);
  });

  $$('.step-panel').forEach((el, i) => {
    el.hidden = i !== step;
  });

  $('#previous').hidden = step === 0;
  $('#next').hidden = step === 2;
  $('#run').hidden = step !== 2;

  $('#next').textContent = step === 0
    ? 'Continue to geometry'
    : 'Continue to ratings';
}

$$('.step').forEach(el => {
  el.onclick = () => setStep(Number(el.dataset.step));
});

function validatePanel(step) {
  const invalid = [
    ...$(`[data-panel="${step}"]`).querySelectorAll('input,select')
  ].find(el => !el.checkValidity());

  if (invalid) {
    setStep(step);
    invalid.reportValidity();
    return false;
  }

  return true;
}

$('#next').onclick = () => {
  if (validatePanel(currentStep)) {
    setStep(currentStep + 1);
  }
};

$('#previous').onclick = () => setStep(currentStep - 1);

function invalidate() {
  if (inflight) {
    inflight.abort();
    inflight = null;
  }

  currentResult = null;
  $('#empty-result').hidden = false;
  $('#result-content').hidden = true;
  $('#result-tag').textContent = 'Awaiting assessment';

  showMessage('');

  $$('.pill').forEach(el => {
    el.classList.remove('selected');
  });
}

form.addEventListener('input', invalidate);
form.addEventListener('change', invalidate);

function loadSample(key) {
  invalidate();

  Object.entries(samples[key]).forEach(([name, value]) => {
    form.elements[name].value = value;
  });

  form.elements.assessment_name.value = key === 'low'
    ? 'Gentle slope · Notebook example 1'
    : 'Steep slope · Notebook example 2';

  $('#sample-' + key).classList.add('selected');
  setStep(0);

  showMessage(
    'Notebook example loaded. Review the three sections, then select Assess slope.'
  );
}

$('#sample-low').onclick = () => loadSample('low');
$('#sample-high').onclick = () => loadSample('high');

$('#reset').onclick = () => {
  form.reset();
  invalidate();
  setStep(0);
};

function inputs() {
  const out = {};

  Object.keys(samples.low).forEach(name => {
    out[name] = ['rock_type', 'slope_type'].includes(name)
      ? form.elements[name].value
      : Number(form.elements[name].value);
  });

  out.region = String(out.region);
  return out;
}

function matchingSample(values) {
  return Object.keys(samples).find(key =>
    Object.keys(samples[key]).every(
      name => String(values[name]) === String(samples[key][name])
    )
  );
}

function validateResponse(data) {
  const classes = ['Low', 'Moderate', 'High'];

  if (
    !data ||
    !classes.includes(data.hazard_class) ||
    typeof data.alert !== 'boolean'
  ) {
    throw Error('The API returned an invalid assessment.');
  }

  const p = data.class_probabilities_pct;

  if (
    !p ||
    !classes.every(
      k => typeof p[k] === 'number' &&
      Number.isFinite(p[k]) &&
      p[k] >= 0 &&
      p[k] <= 100
    ) ||
    Math.abs(classes.reduce((n, k) => n + p[k], 0) - 100) > 0.3
  ) {
    throw Error('The API returned invalid class probabilities.');
  }

  if (
    typeof data.p_high_pct !== 'number' ||
    Math.abs(data.p_high_pct - p.High) > 0.11
  ) {
    throw Error('The API returned inconsistent high-hazard probability.');
  }

  if (
    p[data.hazard_class] <
    Math.max(...classes.map(k => p[k]))
  ) {
    throw Error(
      'The predicted class does not match the largest probability.'
    );
  }

  return data;
}

form.noValidate = true;

form.onsubmit = async e => {
  e.preventDefault();

  for (let step = 0; step < 3; step++) {
    if (!validatePanel(step)) return;
  }

  showMessage('');

  const values = inputs();
  const name = form.elements.assessment_name.value.trim()
    || 'Untitled slope';

  let data, mode;

  const button = $('#run');
  button.disabled = true;
  button.textContent = 'Assessing…';

  try {
    if (endpoint) {
      inflight = new AbortController();
      const controller = inflight;

      const timeout = setTimeout(
        () => controller.abort(),
        90000
      );

      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(values),
          signal: controller.signal,
          credentials: 'omit'
        });

        if (!response.ok) {
          let detail = '';
          try {
            const errorData = await response.json();
            detail = errorData.error || '';
          } catch {}

          throw Error(
            `Model API returned HTTP ${response.status}. ${detail}`
          );
        }

        data = validateResponse(await response.json());
        mode = 'Connected model';

      } finally {
        clearTimeout(timeout);
      }

      if (inflight !== controller) return;
      inflight = null;

    } else {
      const match = matchingSample(values);

      if (!match) {
        showMessage(
          'Custom inputs require the trained model. Connect the API or load a notebook example.'
        );
        return;
      }

      data = structuredClone(recorded[match]);
      mode = 'Recorded notebook example';
    }

    currentResult = {
      id: crypto.randomUUID(),
      name,
      inputs: values,
      result: data,
      mode,
      time: new Date().toISOString()
    };

    renderResult();

  } catch (error) {
    showMessage(
      error.name === 'AbortError'
        ? 'Request timed out or was cancelled. Please try again.'
        : error.message === 'Failed to fetch'
          ? 'Could not reach the model API. Check the connection.'
          : error.message
    );

  } finally {
    button.disabled = false;
    button.textContent = 'Assess slope';
  }
};

function renderResult() {
  const { result: r, mode } = currentResult;

  $('#empty-result').hidden = true;
  $('#result-content').hidden = false;

  $('#result-tag').textContent =
    mode === 'Connected model' ? 'API result' : 'Recorded example';

  $('#result-content').innerHTML = `
    <div class="result-hero">
      <div>
        <small>PREDICTED HAZARD CLASS</small>
        <strong class="hazard-${r.hazard_class.toLowerCase()}">
          ${r.hazard_class}
        </strong>
      </div>
      <div>
        <strong>
          ${r.p_high_pct.toFixed(1)}
          <span style="font-size:16px">%</span>
        </strong>
        <small>HIGH-CLASS PROBABILITY</small>
      </div>
    </div>

    ${['Low', 'Moderate', 'High'].map(k => `
      <div class="bar-row">
        <div>
          <span>${k}</span>
          <strong>${r.class_probabilities_pct[k].toFixed(1)}%</strong>
        </div>
        <div class="bar-track">
          <div class="bar-fill ${k.toLowerCase()}"
            style="width:${r.class_probabilities_pct[k]}%">
          </div>
        </div>
      </div>
    `).join('')}

    <div class="status-box ${r.alert ? 'flagged' : ''}">
      ${r.alert
        ? 'Meets the model’s inspection-priority threshold.'
        : 'Below the model’s inspection-priority threshold.'}
      ${mode === 'Recorded notebook example'
        ? 'Notebook threshold: 24%.'
        : ''}
    </div>

    <p class="result-source">
      ${mode === 'Recorded notebook example'
        ? 'Recorded notebook output. No live inference was run.'
        : 'Prediction received from the trained model API.'}
      This is a relative hazard ranking.
    </p>

    <div class="result-actions">
      <button class="secondary" id="save-result">
        Save assessment
      </button>
      <button class="secondary" id="export-result">
        Export JSON
      </button>
    </div>
  `;

  $('#save-result').onclick = saveResult;
  $('#export-result').onclick = () => downloadJSON(currentResult);
}

function saveResult() {
  if (!currentResult) return;

  if (history.some(r => r.id === currentResult.id)) return;

  const updated = [currentResult, ...history].slice(0, 100);

  if (!writeStorage('rockfall_history', updated)) {
    showMessage('Browser storage unavailable. Export JSON instead.');
    return;
  }

  history = updated;
  $('#save-result').textContent = 'Saved';
  $('#save-result').disabled = true;

  renderHistory();
}

function downloadJSON(record) {
  const url = URL.createObjectURL(
    new Blob(
      [JSON.stringify(record, null, 2)],
      { type: 'application/json' }
    )
  );

  const a = document.createElement('a');
  a.href = url;
  a.download = 'rockfall-assessment-' +
    record.id.slice(0, 8) + '.json';

  a.click();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function renderHistory() {
  $('#history-content').innerHTML = history.length
    ? history.map((r, i) => `
      <div class="history-record">
        <div>
          <h3>${escapeHTML(r.name)}</h3>
          <p>
            ${escapeHTML(r.inputs.rock_type)} ·
            ${escapeHTML(r.inputs.slope_type)} ·
            Region ${escapeHTML(r.inputs.region)}
          </p>
          <small>
            ${escapeHTML(r.mode)} ·
            ${new Date(r.time).toLocaleString()}
          </small>
        </div>
        <div class="record-right">
          <strong class="hazard-${escapeHTML(
            r.result.hazard_class.toLowerCase()
          )}">
            ${escapeHTML(r.result.hazard_class)}
          </strong>
          <button class="text-button history-export"
            data-index="${i}">
            Export JSON
          </button>
        </div>
      </div>
    `).join('')
    : `
      <div class="history-empty">
        <div class="empty-symbol">◷</div>
        <h2>Your assessments will appear here.</h2>
        <p>Run an assessment and save the result.</p>
        <a class="primary" href="#assessment">
          Start an assessment
        </a>
      </div>
    `;

  $$('.history-export').forEach(b => {
    b.onclick = () =>
      downloadJSON(history[Number(b.dataset.index)]);
  });

  $('#clear-history').disabled = !history.length;
}

$('#clear-history').onclick = () => {
  if (
    history.length &&
    confirm('Clear all saved assessments from this browser?')
  ) {
    if (writeStorage('rockfall_history', [])) {
      history = [];
      renderHistory();
    }
  }
};

function bars(target, items, max) {
  $(target).innerHTML = items.map(
    ([name, value, label, color]) => `
      <div class="bar-row">
        <div>
          <span>${name}</span>
          <strong>${label}</strong>
        </div>
        <div class="bar-track">
          <div class="bar-fill ${color || ''}"
            style="width:${value / max * 100}%">
          </div>
        </div>
      </div>
    `
  ).join('');
}

bars('#distribution', [
  ['Low', 104, '104 slopes', 'low'],
  ['Moderate', 141, '141 slopes', 'moderate'],
  ['High', 110, '110 slopes', 'high']
], 355);

bars('#importance', [
  ['Slope aspect', .144, '0.144'],
  ['Slope height', .082, '0.082'],
  ['Rockfall frequency', .038, '0.038'],
  ['Region', .036, '0.036'],
  ['Slope angle', .035, '0.035']
], .16);

const pages = {
  assessment: 'Slope assessment',
  insights: 'Model insights',
  history: 'Assessment history',
  project: 'About the project'
};

function route() {
  const key = location.hash.slice(1);
  const page = pages[key] ? key : 'assessment';

  $$('.page').forEach(p => {
    p.hidden = p.id !== page;
  });

  $$('[data-page]').forEach(a => {
    a.classList.toggle('active', a.dataset.page === page);

    if (a.dataset.page === page) {
      a.setAttribute('aria-current', 'page');
    } else {
      a.removeAttribute('aria-current');
    }
  });

  $('#breadcrumb').textContent = pages[page];

  document.title =
    `Highway Rockfall Hazard Classification · ${pages[page]}`;

  if (page === 'history') renderHistory();

  window.scrollTo({
    top: 0,
    behavior: 'instant'
  });
}

window.addEventListener('hashchange', route);

route();
renderHistory();

// API connection settings

function setMode() {
  $('#mode-label').textContent = endpoint
    ? 'API configured'
    : 'Notebook demo';

  $('#endpoint').value = endpoint;
}

function openConnection() {
  setMode();
  $('#connect-dialog').showModal();
}

$('#connect-open').onclick = openConnection;

$$('.connect-trigger').forEach(b => {
  b.onclick = openConnection;
});

$('#connect-close').onclick = () => {
  $('#connect-dialog').close();
};

$('#connection-form').onsubmit = e => {
  e.preventDefault();

  const value = $('#endpoint').value.trim();

  if (value) {
    let url;

    try {
      url = new URL(value, location.origin);
    } catch {
      $('#endpoint').setCustomValidity('Enter a valid API URL.');
      $('#endpoint').reportValidity();
      return;
    }

    if (!['https:', 'http:'].includes(url.protocol)) {
      $('#endpoint').setCustomValidity(
        'Use an HTTP or HTTPS endpoint.'
      );
      $('#endpoint').reportValidity();
      return;
    }

    if (url.username || url.password) {
      $('#endpoint').setCustomValidity(
        'Do not include credentials.'
      );
      $('#endpoint').reportValidity();
      return;
    }

    endpoint = url.href;
  } else {
    endpoint = DEFAULT_ENDPOINT;
  }

  writeStorage('rockfall_endpoint', endpoint);

  invalidate();
  setMode();

  $('#connect-dialog').close();
};

$('#endpoint').oninput = () => {
  $('#endpoint').setCustomValidity('');
};

$('#demo-mode').onclick = () => {
  endpoint = '';
  writeStorage('rockfall_endpoint', '');

  invalidate();
  setMode();

  $('#connect-dialog').close();
};

setMode();
