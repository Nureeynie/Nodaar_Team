/* ==========================================================================
   Nodaar Hub — mobile navigation
   · Bottom tab bar (footer) active state
   · "More" sheet open / close, keyboard and focus handling
   · Top-bar avatar, user card and primary-button label kept in sync
   Depends on app.legacy.js (navigate, activeTab, logout).
   ========================================================================== */
(function () {
  'use strict';

  // Tabs on the bottom bar. Every other tab is listed in the "More" sheet.
  var BAR_TABS = ['overview', 'channels', 'tasks', 'calendar', 'reports'];
  var sheetOpen = false;

  function $(id) { return document.getElementById(id); }

  function currentTab() {
    return (typeof activeTab !== 'undefined' && activeTab) || 'overview';
  }

  // Called by navigate() in app.legacy.js on every tab change.
  window.syncMobileTabbar = function (tab) {
    var moreActive = BAR_TABS.indexOf(tab) === -1;

    document.querySelectorAll('#mtabbar .mtab').forEach(function (btn) {
      var on = btn.id === 'bn-more' ? moreActive : btn.id === 'bn-' + tab;
      btn.classList.toggle('is-active', on);
      if (on) btn.setAttribute('aria-current', 'page');
      else btn.removeAttribute('aria-current');
    });

    document.querySelectorAll('#more-sheet .more-tile').forEach(function (tile) {
      var on = tile.getAttribute('data-more-tab') === tab;
      tile.classList.toggle('is-current', on);
      if (on) tile.setAttribute('aria-current', 'page');
      else tile.removeAttribute('aria-current');
    });
  };

  // Hide sheet items whose sidebar counterpart is hidden (e.g. Roles for non-admins).
  function syncSheetItems() {
    document.querySelectorAll('#more-sheet .more-tile[data-sync-from]').forEach(function (tile) {
      var src = $(tile.getAttribute('data-sync-from'));
      tile.hidden = !!src && window.getComputedStyle(src).display === 'none';
    });
  }

  // Copy the signed-in user's name, role and avatar from the sidebar.
  function syncUserCard() {
    var name = $('user-display-name');
    var role = $('user-display-role');
    var outName = $('more-user-name');
    var outRole = $('more-user-role');
    if (outName) outName.textContent = (name && name.textContent.trim()) || 'Signed in';
    if (outRole) outRole.textContent = (role && role.textContent.trim()) || '';

    var avatar = $('sidebar-avatar');
    if (avatar) {
      var html = avatar.innerHTML;
      if ($('tb-avatar-inner')) $('tb-avatar-inner').innerHTML = html;
      if ($('more-avatar-inner')) $('more-avatar-inner').innerHTML = html;
    }
  }

  // The icon-only "+" button on phones keeps its meaning for screen readers.
  function mirrorActionLabel() {
    var text = $('action-btn-text');
    var btn = $('primary-action-btn');
    if (!text || !btn) return;
    var label = text.textContent.trim() || 'Create';
    btn.setAttribute('aria-label', label);
    btn.setAttribute('title', label);
  }

  window.openMoreSheet = function () {
    var sheet = $('more-sheet');
    var overlay = $('more-overlay');
    var btn = $('bn-more');
    if (!sheet || !overlay) return;

    syncSheetItems();
    syncUserCard();
    window.syncMobileTabbar(currentTab());

    sheet.classList.add('is-open');
    overlay.classList.add('is-open');
    sheet.setAttribute('aria-hidden', 'false');
    if (btn) btn.setAttribute('aria-expanded', 'true');
    sheetOpen = true;

    var closeBtn = sheet.querySelector('.more-close');
    if (closeBtn) closeBtn.focus({ preventScroll: true });
  };

  // opts.restoreFocus: false when a tile navigated away (focus goes to the page title).
  window.closeMoreSheet = function (opts) {
    var sheet = $('more-sheet');
    var overlay = $('more-overlay');
    var btn = $('bn-more');
    if (!sheet || !overlay) return;

    var hadFocus = sheet.contains(document.activeElement);
    var restore = !opts || opts.restoreFocus !== false;

    sheet.classList.remove('is-open');
    overlay.classList.remove('is-open');
    sheet.setAttribute('aria-hidden', 'true');
    if (btn) btn.setAttribute('aria-expanded', 'false');
    sheetOpen = false;

    if (hadFocus) {
      var target = restore ? btn : $('page-title');
      if (target) {
        if (target.id === 'page-title') target.setAttribute('tabindex', '-1');
        target.focus({ preventScroll: true });
      }
    }
  };

  // Escape closes; Tab cycles inside the sheet while it is open.
  document.addEventListener('keydown', function (e) {
    if (!sheetOpen) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      window.closeMoreSheet();
      return;
    }
    if (e.key !== 'Tab') return;

    var sheet = $('more-sheet');
    var items = Array.prototype.filter.call(
      sheet.querySelectorAll('button:not([disabled])'),
      function (el) { return !el.closest('[hidden]'); }
    );
    if (!items.length) return;
    var first = items[0];
    var last = items[items.length - 1];

    if (!sheet.contains(document.activeElement)) {
      e.preventDefault();
      first.focus();
    } else if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });

  // Rotating to desktop width closes the sheet (the tab bar is hidden there).
  window.addEventListener('resize', function () {
    if (sheetOpen && window.innerWidth >= 768) window.closeMoreSheet({ restoreFocus: false });
  });

  function watch(el, fn) {
    if (!el || !('MutationObserver' in window)) return;
    new MutationObserver(fn).observe(el, { childList: true, subtree: true, characterData: true });
  }

  function init() {
    watch($('sidebar-avatar'), syncUserCard);
    watch($('user-display-name'), syncUserCard);
    watch($('user-display-role'), syncUserCard);
    watch($('action-btn-text'), mirrorActionLabel);
    syncUserCard();
    mirrorActionLabel();
    syncSheetItems();
    window.syncMobileTabbar(currentTab());
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
