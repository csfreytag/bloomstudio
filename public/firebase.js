/* ============================================================================
 * firebase.js — Freytag's Recipe Guide
 * Firebase wiring: environment switching, auth gate, and the RecipeStore
 * data layer that replaces localStorage.
 *
 * Loaded as a CLASSIC (non-module) script AFTER the Firebase compat SDK and
 * BEFORE the app's main inline <script>, so everything stays global and the
 * existing inline onclick handlers keep working.
 *
 * Data model (Recipe Guide owns these on the shared Firebase project):
 *   recipes/{id}              one doc per recipe (photo stored in Storage)
 *   settings/recipeGuide      { tags[], priceLists{...}, marginGood, marginWarn }
 *   users/{uid}               { recipeGuideRole, email, displayName, ... }
 *   changeLogs/{auto}         append-only activity feed
 *
 * NOTE: Price lists currently live in settings/recipeGuide and remain
 * editable in-app (mirroring the prototype). The one-way Google Sheet ->
 * products/pricing sync described in CLAUDE.md is a later workstream and is
 * intentionally NOT wired here.
 * ========================================================================== */

(function () {
  'use strict';

  // ── Firebase config per environment ──────────────────────────────────────
  // PRODUCTION: shared Purchasing project (public web config — safe to commit).
  var PROD_CONFIG = {
    apiKey: 'AIzaSyAMWlRK2PcbxISUk6KA58bHlWmcBw62bGw',
    authDomain: 'freytags-purchasing.firebaseapp.com',
    projectId: 'freytags-purchasing',
    storageBucket: 'freytags-purchasing.firebasestorage.app',
    messagingSenderId: '291868509292',
    appId: '1:291868509292:web:dac696ccf7fb9b093e4449'
  };

  // STAGING: a DEDICATED Recipe-only project (freytags-recipes-staging),
  // separate from the Purchasing project so testing can never affect any data
  // or rules the Purchasing app uses. Production still shares the Purchasing
  // project (see PROD_CONFIG); the apps only share a backend in production.
  // TODO(setup): replace the placeholder values below with the STAGING
  // project's own web config (Firebase console -> Project settings -> Your
  // apps -> SDK setup). Until this is filled in, staging/localhost will warn.
  var STAGING_CONFIG = {
    apiKey: 'AIzaSyAXAh2UZXo-CVn5yvNsMqjagE90jnr1URE',
    authDomain: 'freytags-recipes-staging.firebaseapp.com',
    projectId: 'freytags-recipes-staging',
    storageBucket: 'freytags-recipes-staging.firebasestorage.app',
    messagingSenderId: '191400526806',
    appId: '1:191400526806:web:0dda9774e712873e871a77'
  };

  function pickConfig() {
    var host = location.hostname;
    var isProd = (host === 'freytags-recipes.web.app' ||
                  host === 'freytags-recipes.firebaseapp.com');
    // Everything else (staging site, localhost, 127.0.0.1, previews) -> staging.
    return isProd ? PROD_CONFIG : STAGING_CONFIG;
  }

  var CONFIG = pickConfig();
  var IS_STAGING = (CONFIG === STAGING_CONFIG);
  var STAGING_NOT_CONFIGURED = IS_STAGING && CONFIG.apiKey === 'STAGING_API_KEY';

  // ── Initialise Firebase ───────────────────────────────────────────────────
  if (typeof firebase === 'undefined') {
    alert('Firebase SDK failed to load. Check your network connection.');
    return;
  }
  firebase.initializeApp(CONFIG);
  var auth = firebase.auth();
  var db = firebase.firestore();
  var storage = firebase.storage();

  // Offline cache — lets the app keep working on a flaky workbench connection.
  db.enablePersistence({ synchronizeTabs: true }).catch(function () { /* multi-tab or unsupported — fine */ });

  var SETTINGS_DOC = 'recipeGuide';
  // Tags live in their own collection (the production rules let managers write
  // /tags but NOT /settings). One doc holds the whole list: tags/all { list:[] }.
  var TAGS_DOC = 'all';
  var PRICE_LIST_KEYS = ['flowers', 'fillers', 'containers', 'accents', 'hardgoods', 'plants'];

  // Resolved after sign-in.
  var ctx = { user: null, role: null, env: IS_STAGING ? 'staging' : 'production' };

  // ── Auth gate UI ──────────────────────────────────────────────────────────
  function injectAuthStyles() {
    if (document.getElementById('fbAuthStyles')) return;
    var s = document.createElement('style');
    s.id = 'fbAuthStyles';
    s.textContent = [
      '#fbAuthOverlay{position:fixed;inset:0;z-index:9999;background:var(--bg3,#f7eef1);display:flex;align-items:center;justify-content:center;font-family:Georgia,serif;}',
      '#fbAuthCard{background:#fff;border:0.5px solid rgba(0,0,0,0.1);border-radius:12px;padding:30px 28px;width:340px;max-width:90vw;box-shadow:0 10px 40px rgba(0,0,0,0.08);text-align:center;}',
      '#fbAuthCard h2{font-size:18px;color:#8f0d2b;margin-bottom:4px;}',
      '#fbAuthCard p.sub{font-size:12px;color:#9b9b96;font-style:italic;margin-bottom:18px;}',
      '#fbAuthCard input{width:100%;padding:8px 10px;margin:5px 0;border:0.5px solid rgba(0,0,0,0.18);border-radius:8px;font-size:13px;}',
      '#fbAuthCard button{width:100%;padding:9px;margin-top:8px;border:none;border-radius:8px;font-size:13px;cursor:pointer;font-family:inherit;}',
      '.fbBtnGoogle{background:#fff;border:0.5px solid rgba(0,0,0,0.18)!important;color:#1a1a18;display:flex;align-items:center;justify-content:center;gap:8px;}',
      '.fbBtnPrimary{background:#C4133C;color:#fff;}',
      '.fbDivider{display:flex;align-items:center;gap:8px;color:#9b9b96;font-size:11px;margin:14px 0;}',
      '.fbDivider::before,.fbDivider::after{content:"";flex:1;height:1px;background:rgba(0,0,0,0.1);}',
      '#fbAuthMsg{font-size:12px;color:#A32D2D;min-height:16px;margin-top:10px;}',
      '#fbEnvBadge{position:fixed;bottom:10px;right:12px;z-index:9998;background:#854F0B;color:#fff;font-size:10px;font-family:Georgia,serif;padding:3px 9px;border-radius:10px;letter-spacing:0.04em;opacity:0.9;}'
    ].join('\n');
    document.head.appendChild(s);
  }

  function showOverlay(html) {
    injectAuthStyles();
    var o = document.getElementById('fbAuthOverlay');
    if (!o) {
      o = document.createElement('div');
      o.id = 'fbAuthOverlay';
      document.body.appendChild(o);
    }
    o.innerHTML = '<div id="fbAuthCard">' + html + '</div>';
    o.style.display = 'flex';
  }

  function hideOverlay() {
    var o = document.getElementById('fbAuthOverlay');
    if (o) o.style.display = 'none';
  }

  function setMsg(text) {
    var m = document.getElementById('fbAuthMsg');
    if (m) m.textContent = text || '';
  }

  function showEnvBadge() {
    if (!IS_STAGING || document.getElementById('fbEnvBadge')) return;
    var b = document.createElement('div');
    b.id = 'fbEnvBadge';
    b.textContent = 'STAGING';
    document.body.appendChild(b);
  }

  function loginScreen() {
    showOverlay([
      '<h2>Freytag’s Recipe Guide</h2>',
      '<p class="sub">Please sign in to continue</p>',
      STAGING_NOT_CONFIGURED ? '<p style="font-size:11px;color:#A32D2D;margin-bottom:10px;">⚠ Staging Firebase config not set yet — see firebase.js</p>' : '',
      '<button class="fbBtnGoogle" id="fbGoogleBtn"><i class="ti ti-brand-google"></i> Sign in with Google</button>',
      '<div class="fbDivider">or</div>',
      '<input type="email" id="fbEmail" placeholder="Email" autocomplete="username"/>',
      '<input type="password" id="fbPass" placeholder="Password" autocomplete="current-password"/>',
      '<button class="fbBtnPrimary" id="fbEmailBtn">Sign in</button>',
      '<div id="fbAuthMsg"></div>'
    ].join(''));

    document.getElementById('fbGoogleBtn').onclick = function () {
      setMsg('');
      var provider = new firebase.auth.GoogleAuthProvider();
      provider.setCustomParameters({ hd: 'freytags.com' });
      auth.signInWithPopup(provider).catch(function (e) { setMsg(friendlyError(e)); });
    };
    document.getElementById('fbEmailBtn').onclick = function () {
      setMsg('');
      var email = (document.getElementById('fbEmail').value || '').trim();
      var pass = document.getElementById('fbPass').value || '';
      if (!email || !pass) { setMsg('Enter your email and password.'); return; }
      auth.signInWithEmailAndPassword(email, pass).catch(function (e) { setMsg(friendlyError(e)); });
    };
    document.getElementById('fbPass').addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') document.getElementById('fbEmailBtn').click();
    });
  }

  function noAccessScreen(email) {
    showOverlay([
      '<h2>No access yet</h2>',
      '<p class="sub">' + escapeHtml(email || '') + '</p>',
      '<p style="font-size:12.5px;color:#6b6b67;line-height:1.6;">Your account is signed in but hasn’t been granted a Recipe Guide role yet. Ask an administrator to add you.</p>',
      '<button class="fbBtnPrimary" id="fbSignOutBtn">Sign out</button>'
    ].join(''));
    document.getElementById('fbSignOutBtn').onclick = function () { auth.signOut(); };
  }

  function friendlyError(e) {
    var code = e && e.code ? e.code : '';
    if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found')
      return 'Incorrect email or password.';
    if (code === 'auth/too-many-requests') return 'Too many attempts. Try again later.';
    if (code === 'auth/popup-closed-by-user') return '';
    if (code === 'auth/popup-blocked') return 'Popup blocked — allow popups and try again.';
    return (e && e.message) ? e.message : 'Sign-in failed.';
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  // ── Role resolution ───────────────────────────────────────────────────────
  // Reads users/{uid}. If missing, an admin must create it. (A bootstrap path
  // for the very first admin is documented in the setup checklist.)
  function resolveRole(user) {
    return db.collection('users').doc(user.uid).get().then(function (snap) {
      if (!snap.exists) return null;
      var d = snap.data() || {};
      return d.recipeGuideRole || null;
    });
  }

  // ── Public API: RecipeStore ────────────────────────────────────────────────
  var RecipeStore = {
    /**
     * Resolves once the user is signed in AND has a Recipe Guide role.
     * Drives the auth overlay until then.
     */
    init: function () {
      showEnvBadge();
      var booted = false;
      return new Promise(function (resolve) {
        auth.onAuthStateChanged(function (user) {
          // Once the app has loaded for one identity, any later change
          // (sign out, or sign in as someone else) reloads to start clean.
          if (booted) { location.reload(); return; }
          if (!user) { loginScreen(); return; }
          // Refresh the ID token first so any custom claims granted while the
          // user was already signed in (active / recipeGuideRole — the
          // production rules read these) take effect without a re-login.
          user.getIdToken(true).catch(function () {}).then(function () {
            return resolveRole(user);
          }).then(function (role) {
            if (!role) { noAccessScreen(user.email); return; }
            ctx.user = user;
            ctx.role = role;
            booted = true;
            hideOverlay();
            resolve(ctx);
          }).catch(function (e) {
            setMsg('Could not load your profile: ' + (e.message || e));
          });
        });
      });
    },

    context: function () { return ctx; },

    signOut: function () { return auth.signOut(); },

    /**
     * Loads all Recipe Guide data. If the cloud is empty, seeds it once from
     * (a) this browser's localStorage prototype data if present, else
     * (b) the built-in defaults passed in.
     * @param defaults {recipes, priceLists:{...}, tags}
     */
    loadAll: function (defaults) {
      return Promise.all([
        db.collection('recipes').get(),
        db.collection('settings').doc(SETTINGS_DOC).get(),
        db.collection('tags').doc(TAGS_DOC).get()
      ]).then(function (res) {
        var recipesSnap = res[0];
        var settingsSnap = res[1];
        var tagsSnap = res[2];
        var cloudEmpty = recipesSnap.empty && !settingsSnap.exists;

        // Seed only on staging. Production starts clean: prices arrive via the
        // one-way Sheet sync (service account) and the team builds recipes/tags.
        if (cloudEmpty && IS_STAGING) {
          return seedCloud(defaults).then(function () { return RecipeStore.loadAll(defaults); });
        }

        var recipes = [];
        recipesSnap.forEach(function (doc) {
          var r = doc.data();
          r.id = isNaN(Number(doc.id)) ? doc.id : Number(doc.id);
          recipes.push(r);
        });
        recipes.sort(function (a, b) { return (Number(a.id) || 0) - (Number(b.id) || 0); });

        var s = settingsSnap.exists ? settingsSnap.data() : {};
        var priceLists = s.priceLists || {};
        PRICE_LIST_KEYS.forEach(function (k) {
          if (!priceLists[k]) priceLists[k] = (defaults.priceLists && defaults.priceLists[k]) || [];
        });

        // Tags now live in tags/all; fall back to the older settings.tags
        // location (and then defaults) so existing data migrates smoothly.
        var tags;
        if (tagsSnap.exists && Array.isArray((tagsSnap.data() || {}).list)) {
          tags = tagsSnap.data().list;
        } else {
          tags = s.tags || (defaults.tags || []);
        }

        return {
          recipes: recipes,
          priceLists: priceLists,
          tags: tags,
          marginGood: typeof s.marginGood === 'number' ? s.marginGood : 40,
          marginWarn: typeof s.marginWarn === 'number' ? s.marginWarn : 20,
          pricingSync: s.pricingSync || null
        };
      });
    },

    saveRecipe: function (recipe) {
      var clean = JSON.parse(JSON.stringify(recipe)); // drop undefined / functions
      clean.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
      return db.collection('recipes').doc(String(recipe.id)).set(clean, { merge: true });
    },

    deleteRecipe: function (id) {
      return db.collection('recipes').doc(String(id)).delete();
    },

    savePriceLists: function (priceLists) {
      return db.collection('settings').doc(SETTINGS_DOC)
        .set({ priceLists: priceLists }, { merge: true });
    },

    saveTags: function (tags) {
      return db.collection('tags').doc(TAGS_DOC).set({ list: tags }, { merge: true });
    },

    saveSettings: function (obj) {
      return db.collection('settings').doc(SETTINGS_DOC).set(obj, { merge: true });
    },

    /**
     * Uploads a data-URL photo to Storage and returns its download URL.
     */
    uploadPhoto: function (recipeId, dataUrl) {
      var ref = storage.ref('recipes/' + recipeId + '/' + Date.now() + '.jpg');
      return ref.putString(dataUrl, 'data_url').then(function (snap) {
        return snap.ref.getDownloadURL();
      });
    },

    /** Append a change-log entry (best effort — never blocks the UI). */
    log: function (action, entityType, entityId, entityName, extra) {
      var rec = Object.assign({
        app: 'recipe-guide',
        action: action,
        entityType: entityType,
        entityId: String(entityId == null ? '' : entityId),
        entityName: entityName || '',
        userId: ctx.user ? ctx.user.uid : 'system',
        userEmail: ctx.user ? ctx.user.email : '',
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      }, extra || {});
      return db.collection('changeLogs').add(rec).catch(function () {});
    }
  };

  // ── One-time cloud seed ─────────────────────────────────────────────────────
  function seedCloud(defaults) {
    defaults = defaults || {};
    // Prefer this browser's existing prototype data, if any.
    var lsRecipes = safeParse(localStorage.getItem('bs_recipes2'));
    var recipes = (lsRecipes && lsRecipes.length) ? lsRecipes : (defaults.recipes || []);

    var priceLists = {};
    PRICE_LIST_KEYS.forEach(function (k) {
      var ls = safeParse(localStorage.getItem('bs_' + k));
      priceLists[k] = (ls && ls.length) ? ls : ((defaults.priceLists && defaults.priceLists[k]) || []);
    });

    var tags = safeParse(localStorage.getItem('bs_tags')) || defaults.tags || [];
    var marginGood = parseInt(localStorage.getItem('bs_margin_good'), 10);
    var marginWarn = parseInt(localStorage.getItem('bs_margin_warn'), 10);

    var batch = db.batch();
    recipes.forEach(function (r) {
      // Photos as base64 can exceed Firestore's 1 MB doc limit — drop on seed.
      // (Re-upload via the editor stores them in Storage instead.)
      var copy = Object.assign({}, r);
      if (copy.photo && /^data:/.test(copy.photo)) copy.photo = null;
      copy.id = r.id;
      batch.set(db.collection('recipes').doc(String(r.id)), copy);
    });
    batch.set(db.collection('tags').doc(TAGS_DOC), { list: tags });
    batch.set(db.collection('settings').doc(SETTINGS_DOC), {
      priceLists: priceLists,
      tags: tags,
      marginGood: isNaN(marginGood) ? 40 : marginGood,
      marginWarn: isNaN(marginWarn) ? 20 : marginWarn,
      seededAt: firebase.firestore.FieldValue.serverTimestamp(),
      seededBy: ctx.user ? ctx.user.email : ''
    });
    return batch.commit().then(function () {
      RecipeStore.log('settings.seeded', 'settings', SETTINGS_DOC, 'Initial seed',
        { note: 'Seeded ' + recipes.length + ' recipes' });
    });
  }

  function safeParse(s) { try { return s ? JSON.parse(s) : null; } catch (e) { return null; } }

  // Expose globally for the main inline script.
  window.RecipeStore = RecipeStore;
})();
