/* ─── Auth — magic link, role resolution, header widget ─────────────────── */

// Global auth state: { email, role } or null
let currentUser = null;

// ── waitForAuth ───────────────────────────────────────────────────────────────
// Returns a Promise that resolves to currentUser once auth initialization is done.
// Other scripts: const user = await waitForAuth();
let _authReady = false;
let _authResolvers = [];

function _resolveAuth() {
  _authReady = true;
  _authResolvers.forEach(fn => fn(currentUser));
  _authResolvers = [];
}

function waitForAuth() {
  if (_authReady) return Promise.resolve(currentUser);
  return new Promise(resolve => _authResolvers.push(resolve));
}

// ── escHtml (self-contained copy) ─────────────────────────────────────────────
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Role resolution ───────────────────────────────────────────────────────────
async function resolveRole(email) {
  if (email === OWNER_EMAIL) return 'owner';
  // user_roles table won't exist until Phase 2; handle gracefully
  try {
    const { data } = await sb.from('user_roles').select('role').eq('email', email).maybeSingle();
    if (data?.role === 'builder') return 'builder';
  } catch (_) {}
  return 'viewer';
}

// ── Auth widget rendering ─────────────────────────────────────────────────────
function renderAuthWidget() {
  const container = document.querySelector('.site-header .container');
  if (!container) return;

  // Remove existing widget if present
  const existing = document.getElementById('auth-widget');
  if (existing) existing.remove();

  const widget = document.createElement('div');
  widget.id = 'auth-widget';
  widget.className = 'auth-widget';

  if (currentUser) {
    const emailDisplay = currentUser.email.length > 22
      ? currentUser.email.slice(0, 20) + '…'
      : currentUser.email;
    widget.innerHTML = `
      <span class="auth-email">${escHtml(emailDisplay)}</span>
      <span class="auth-role-badge auth-role-${escHtml(currentUser.role)}">${escHtml(currentUser.role)}</span>
      <button id="auth-sign-out" class="auth-signout-btn">Sign out</button>
    `;
    widget.querySelector('#auth-sign-out').addEventListener('click', async () => {
      await sb.auth.signOut();
    });
  } else {
    widget.innerHTML = `
      <button id="auth-sign-in-btn" class="auth-signin-btn">Sign in</button>
    `;
    widget.querySelector('#auth-sign-in-btn').addEventListener('click', openSignInModal);
  }

  container.appendChild(widget);
}

// ── Sign-in modal ─────────────────────────────────────────────────────────────
function ensureSignInModal() {
  if (document.getElementById('signin-modal')) return;

  const modal = document.createElement('div');
  modal.id = 'signin-modal';
  modal.className = 'signin-modal-overlay';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', 'Sign in');

  modal.innerHTML = `
    <div class="signin-modal-backdrop"></div>
    <div class="signin-modal-card">
      <h3>Sign in to StyleMyShack</h3>
      <p class="signin-modal-sub">Enter your email — we'll send you a magic link.</p>
      <div id="signin-form-wrap">
        <input
          type="email"
          id="signin-email"
          class="signin-email-input"
          placeholder="your@email.com"
          autocomplete="email"
        />
        <div id="signin-error" class="signin-error" style="display:none;"></div>
        <div class="signin-modal-btns">
          <button id="signin-cancel-btn" class="signin-cancel-btn">Cancel</button>
          <button id="signin-submit-btn" class="signin-submit-btn">Send link</button>
        </div>
      </div>
      <div id="signin-success" class="signin-success" style="display:none;">
        Check your email for a sign-in link!
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Backdrop click closes modal
  modal.querySelector('.signin-modal-backdrop').addEventListener('click', closeSignInModal);

  // Cancel button
  modal.querySelector('#signin-cancel-btn').addEventListener('click', closeSignInModal);

  // Submit
  modal.querySelector('#signin-submit-btn').addEventListener('click', handleSignIn);

  // Enter key in email field
  modal.querySelector('#signin-email').addEventListener('keydown', e => {
    if (e.key === 'Enter') handleSignIn();
  });

  // Escape key closes modal
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeSignInModal();
  });
}

function openSignInModal() {
  ensureSignInModal();
  const modal = document.getElementById('signin-modal');
  // Reset state
  document.getElementById('signin-form-wrap').style.display = '';
  document.getElementById('signin-success').style.display = 'none';
  const errEl = document.getElementById('signin-error');
  errEl.style.display = 'none';
  errEl.textContent = '';
  document.getElementById('signin-email').value = '';
  modal.classList.add('open');
  setTimeout(() => document.getElementById('signin-email').focus(), 50);
}

function closeSignInModal() {
  const modal = document.getElementById('signin-modal');
  if (modal) modal.classList.remove('open');
}

async function handleSignIn() {
  const emailInput = document.getElementById('signin-email');
  const errEl = document.getElementById('signin-error');
  const submitBtn = document.getElementById('signin-submit-btn');
  const email = emailInput.value.trim();

  errEl.style.display = 'none';
  errEl.textContent = '';

  if (!email) {
    errEl.textContent = 'Please enter your email address.';
    errEl.style.display = 'block';
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = 'Sending…';

  const { error } = await sb.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin }
  });

  submitBtn.disabled = false;
  submitBtn.textContent = 'Send link';

  if (error) {
    errEl.textContent = error.message || 'Something went wrong. Please try again.';
    errEl.style.display = 'block';
    return;
  }

  // Success
  document.getElementById('signin-form-wrap').style.display = 'none';
  document.getElementById('signin-success').style.display = 'block';
}

// ── Init IIFE ─────────────────────────────────────────────────────────────────
(async function initAuth() {
  const { data: { session } } = await sb.auth.getSession();
  if (session?.user?.email) {
    const role = await resolveRole(session.user.email);
    currentUser = { email: session.user.email, role };
  }
  renderAuthWidget();
  _resolveAuth();

  sb.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session?.user?.email) {
      const role = await resolveRole(session.user.email);
      currentUser = { email: session.user.email, role };
      renderAuthWidget();
      _resolveAuth();
    } else if (event === 'SIGNED_OUT') {
      currentUser = null;
      renderAuthWidget();
    }
  });
})();
