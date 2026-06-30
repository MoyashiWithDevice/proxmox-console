function escapeHTML(s) {
  if (typeof s !== 'string') return String(s);
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function render() {
  var panel = document.getElementById('right-panel');
  if (PAGE_TITLE === 'Error') {
    panel.innerHTML = renderErrorPage();
  } else {
    panel.innerHTML = renderAuthForm();
  }
}

function renderErrorPage() {
  var err = FLOW.error || {};
  var title = err.id || 'Error occurred';
  var desc = '';
  if (err.messages && err.messages.length > 0) {
    desc = err.messages.map(function(m) { return m.text; }).join(' ');
  }
  if (!desc) desc = 'An unexpected error occurred. Please try again.';
  var html = '<div class="gloss-card-outer" style="border-radius:20px;overflow:hidden">';
  html += '<div class="gloss-card-inner" style="border-radius:20px">';
  html += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">';
  html += '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
  html += '<span style="font-size:12px;color:#dc2626;letter-spacing:0.08em;text-transform:uppercase;font-weight:600">Error</span></div>';
  html += '<h1 style="font-size:28px;font-weight:700;letter-spacing:-0.02em;margin-bottom:12px;margin-top:10px">' + escapeHTML(title) + '</h1>';
  html += '<p style="font-size:14px;color:rgba(255,255,255,0.4);line-height:1.7;margin-bottom:28px">' + escapeHTML(desc) + '</p>';
  html += '<a href="/login" style="display:inline-block;padding:12px 22px;background:#fff;color:#000;border-radius:10px;text-decoration:none;font-size:14px;font-weight:600">Return to login</a>';
  html += '</div></div>';
  return html;
}

function renderAuthForm() {
  var flow = FLOW;
  var ui = flow.ui || {};
  var nodes = ui.nodes || [];
  var action = ui.action || '';
  var method = ui.method || 'POST';
  var messages = ui.messages || [];
  var subtitle = IS_REG ? 'Join the platform.' : 'Welcome back.';
  var submitLabel = IS_REG ? 'Create account' : 'Sign in';
  var hasPassword = false;
  var submitBtnHtml = '';

  var html = '<div class="gloss-card-outer" style="border-radius:20px;overflow:hidden">';
  html += '<div class="gloss-card-inner" style="border-radius:20px">';
  html += '<h1 style="font-size:28px;font-weight:700;letter-spacing:-0.02em;margin-bottom:4px">' + escapeHTML(PAGE_TITLE) + '</h1>';
  html += '<p style="font-size:14px;color:rgba(255,255,255,0.3);margin-bottom:28px;line-height:1.5">' + subtitle + '</p>';

  // Global messages
  messages.forEach(function(msg) {
    var type = msg.type;
    var text = msg.text;
    var color = type === 'error' ? '#dc2626' : type === 'success' ? '#22c55e' : '#f59e0b';
    html += '<div style="display:flex;align-items:center;gap:8px;padding:10px 12px;background:rgba(220,38,38,0.08);border-radius:8px;margin-bottom:18px;font-size:12px;color:' + color + ';line-height:1.4">';
    html += '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="' + color + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';
    html += '<span>' + escapeHTML(text) + '</span></div>';
  });

  // action は Kratos の URL ではなく proxy エンドポイントを直接指定
  var proxyAction = IS_REG ? '/api/auth/registration' : '/api/auth/login';
  html += '<form id="auth-form" action="' + proxyAction + '" method="' + escapeHTML(method) + '">';

  // flow ID を hidden field として直接埋め込む（URL パース不要に）
  if (FLOW && FLOW.id) {
    html += '<input type="hidden" name="flow" value="' + escapeHTML(FLOW.id) + '">';
  }

  nodes.forEach(function(node) {
    var attrs = node.attributes || {};
    var nodeType = node.type;
    var meta = node.meta || {};
    var label = meta.label || {};
      var labelText = label.text || '';

      if (nodeType === 'input') {
        var inputType = attrs.type || 'text';
        var name = attrs.name || '';
        if (name === 'password') hasPassword = true;
        var value = attrs.value || '';
        var required = attrs.required;
        var autocomplete = attrs.autocomplete || '';
        var placeholder = autocomplete;

        if (inputType === 'hidden') {
          html += '<input type="hidden" name="' + escapeHTML(name) + '" value="' + escapeHTML(value) + '">';
        } else if (inputType === 'submit') {
          var btnName = name ? ' name="' + escapeHTML(name) + '"' : '';
          var btnValue = attrs.value ? ' value="' + escapeHTML(attrs.value) + '"' : '';
          var btnLabel = (labelText || submitLabel);
          submitBtnHtml = '<button type="submit"' + btnName + btnValue + ' class="btn-primary" style="width:100%;padding:14px 20px;background:#fff;color:#000;border:none;border-radius:12px;font-size:16px;font-weight:600;margin-top:6px">' + escapeHTML(btnLabel) + '</button>';
        } else {
          html += '<div style="margin-bottom:18px">';
          if (labelText) {
            html += '<label style="display:block;font-size:11px;color:rgba(255,255,255,0.3);margin-bottom:6px;letter-spacing:0.04em;text-transform:uppercase;font-weight:500">' + escapeHTML(labelText) + '</label>';
          }
          if (inputType === 'password') { placeholder = 'Enter your password'; }
        html += '<input type="' + escapeHTML(inputType) + '" name="' + escapeHTML(name) + '" value="' + escapeHTML(value) + '" placeholder="' + escapeHTML(placeholder) + '" style="width:100%;padding:14px 16px;background:#0a0a12;border:1px solid rgba(255,255,255,0.08);color:#fff;font-size:16px;outline:none"';
        if (required) html += ' required';
        html += '>';
        html += '</div>';
      }
    }
  });

  // Registration: パスワードフィールドがなければ追加（1画面に email + password を表示）
  if (IS_REG && !hasPassword) {
    html += '<div style="margin-bottom:18px">';
    html += '<label style="display:block;font-size:11px;color:rgba(255,255,255,0.3);margin-bottom:6px;letter-spacing:0.04em;text-transform:uppercase;font-weight:500">Password</label>';
    html += '<input type="password" name="password" placeholder="Enter your password" required style="width:100%;padding:14px 16px;background:#0a0a12;border:1px solid rgba(255,255,255,0.08);color:#fff;font-size:16px;outline:none">';
    html += '</div>';
  }

  html += submitBtnHtml || '<button type="submit" class="btn-primary" style="width:100%;padding:14px 20px;background:#fff;color:#000;border:none;border-radius:12px;font-size:16px;font-weight:600;margin-top:6px">' + escapeHTML(submitLabel) + '</button>';

  html += '</form>';

  var linkText = IS_REG ? 'Already have an account? ' : 'Don\'t have an account? ';
  var linkHref = IS_REG ? '/login' : '/registration';
  var linkLabel = IS_REG ? 'Sign in' : 'Create one';
  html += '<div style="text-align:center;margin-top:20px;font-size:13px;color:rgba(255,255,255,0.25)">';
  html += linkText + '<a href="' + linkHref + '" style="color:rgba(255,255,255,0.7);text-decoration:none;font-weight:500">' + linkLabel + '</a>';
  html += '</div>';

  html += '</div></div>';

  html += '<div id="auth-msg" style="display:none;margin-top:20px;padding:12px 16px;border-radius:10px;font-size:13px;line-height:1.5"></div>';

  return html;
}

function handleFormSubmit(e) {
  e.preventDefault();
  var form = document.getElementById('auth-form');
  var msgBox = document.getElementById('auth-msg');

  msgBox.style.display = 'none';

  // FormData は form 要素から作る（hidden flow も含まれる）
  var formData = new FormData(form);

  // Kratos の submit button (name="method") は FormData に含まれないので明示的に追加
  if (!formData.has('method')) {
    var methodEl = form.querySelector('[name="method"][value]');
    if (methodEl && methodEl.value) {
      formData.set('method', methodEl.value);
    }
  }

  fetch(form.action, {
    method: 'POST',
    body: formData,
  }).then(function(res) {
    console.log('[auth] response status', res.status, 'redirected', res.redirected);
    if (res.redirected) {
      window.location.href = res.url;
      return;
    }
    return res.text().then(function(text) {
      try {
        var data = JSON.parse(text);
        if (data.redirect_browser_to) {
          window.location.href = data.redirect_browser_to;
          return;
        }
        FLOW = data;
        render();
        bindForm();
      } catch(e) {
        console.error('[auth] parse error:', e, 'body:', text);
        msgBox.style.display = 'block';
        msgBox.style.background = 'rgba(220,38,38,0.08)';
        msgBox.style.color = '#dc2626';
        msgBox.textContent = 'Authentication failed. Please try again.';
      }
    });
  }).catch(function(err) {
    console.error('[auth] fetch failed:', err, 'action:', form.action);
    msgBox.style.display = 'block';
    msgBox.style.background = 'rgba(220,38,38,0.08)';
    msgBox.style.color = '#dc2626';
    msgBox.textContent = 'Network error. Please try again.';
  });
}

function bindForm() {
  var form = document.getElementById('auth-form');
  if (form) {
    form.addEventListener('submit', handleFormSubmit);
  }
}

render();
bindForm();
