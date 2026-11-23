// Nodaar Team Hub — WhatsApp Groups Management & Deep Linking
// Supports multi-department WhatsApp group links, Lagos HQ shift alerts, and Admin CRUD.

(function () {
  const WHATSAPP_STORAGE_KEY = 'nodaar_whatsapp_groups_v1';

  // Default Lagos HQ WhatsApp Groups
  const DEFAULT_WHATSAPP_GROUPS = [
    {
      id: 'wa_all_team',
      name: 'Nodaar Lagos HQ — All Team Broadcast',
      category: 'Company-wide',
      channel_id: 'ch_announcements',
      url: 'https://chat.whatsapp.com/invites/nodaar-all-team-hq',
      description: 'Official organization announcements, emergency alerts, daily Lagos HQ 10:00 - 16:00 shift announcements.',
      access: 'All Members',
      is_pinned: true,
      created_at: new Date().toISOString()
    },
    {
      id: 'wa_engineering',
      name: 'Engineering & Dev Operations',
      category: 'Engineering',
      channel_id: 'ch_engineering',
      url: 'https://chat.whatsapp.com/invites/nodaar-engineering-tech',
      description: 'GitHub code reviews, PR deployments, Supabase backend updates, and urgent bug fixes.',
      access: 'Engineering Team',
      is_pinned: true,
      created_at: new Date().toISOString()
    },
    {
      id: 'wa_design',
      name: 'Product Design & UI/UX Reviews',
      category: 'Design & UI',
      channel_id: 'ch_design',
      url: 'https://chat.whatsapp.com/invites/nodaar-product-design',
      description: 'Figma prototypes, deliverable reviews, UI asset handoffs, and creative sync.',
      access: 'Design Team',
      is_pinned: false,
      created_at: new Date().toISOString()
    },
    {
      id: 'wa_marketing',
      name: 'Marketing & Community Growth',
      category: 'Marketing',
      channel_id: 'ch_marketing',
      url: 'https://chat.whatsapp.com/invites/nodaar-marketing-outreach',
      description: 'Social media campaigns, pitch deck attachments, client sync, and community partnerships.',
      access: 'Marketing Team',
      is_pinned: false,
      created_at: new Date().toISOString()
    },
    {
      id: 'wa_executive',
      name: 'Executive & Admin Leadership',
      category: 'Management',
      channel_id: 'ch_general',
      url: 'https://chat.whatsapp.com/invites/nodaar-executive-admin',
      description: 'Executive management, performance scores, quarterly OKR tracking, and budget approvals.',
      access: 'Admin Only',
      is_pinned: false,
      created_at: new Date().toISOString()
    }
  ];

  let whatsappGroups = [];
  let activeCategoryFilter = 'all';

  function loadWhatsAppGroups() {
    try {
      const raw = localStorage.getItem(WHATSAPP_STORAGE_KEY);
      if (raw) {
        whatsappGroups = JSON.parse(raw);
      } else {
        whatsappGroups = [...DEFAULT_WHATSAPP_GROUPS];
        saveWhatsAppGroups();
      }
    } catch (e) {
      console.warn('Could not load WhatsApp groups, using defaults', e);
      whatsappGroups = [...DEFAULT_WHATSAPP_GROUPS];
    }
    return whatsappGroups;
  }

  function saveWhatsAppGroups() {
    try {
      localStorage.setItem(WHATSAPP_STORAGE_KEY, JSON.stringify(whatsappGroups));
    } catch (e) {
      console.error('Failed to save WhatsApp groups to localStorage', e);
    }
  }

  // Escape HTML helper
  function esc(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // ─────────────────────────────────────────────
  // RENDER WHATSAPP HUB VIEW
  // ─────────────────────────────────────────────
  window.loadWhatsAppView = function () {
    loadWhatsAppGroups();
    const container = document.getElementById('view-whatsapp');
    if (!container) return;

    const isAdmin = Boolean(
      (typeof window.isUserAdmin === 'function' ? window.isUserAdmin() : (
        window.currentProfile?.access_level === 'Admin' ||
        (typeof currentProfile !== 'undefined' && currentProfile?.access_level === 'Admin') ||
        window.currentUser?.email === 'nodaarltd@gmail.com' ||
        (typeof currentUser !== 'undefined' && currentUser?.email === 'nodaarltd@gmail.com')
      ))
    );
    const categories = ['all', ...new Set(whatsappGroups.map(g => g.category))];

    // Filter by Category
    const filtered = activeCategoryFilter === 'all'
      ? whatsappGroups
      : whatsappGroups.filter(g => g.category === activeCategoryFilter);

    // Sort: Pinned first
    filtered.sort((a, b) => (b.is_pinned ? 1 : 0) - (a.is_pinned ? 1 : 0));

    container.innerHTML = `
      <!-- TOP BANNER -->
      <div class="bg-gradient-to-r from-emerald-600 via-teal-600 to-navy-900 rounded-3xl p-6 sm:p-8 text-white relative overflow-hidden shadow-xl">
        <div class="absolute -right-8 -bottom-8 w-48 h-48 bg-white/10 rounded-full blur-2xl pointer-events-none"></div>
        <div class="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div class="max-w-xl">
            <div class="inline-flex items-center gap-2 px-3 py-1 bg-white/15 backdrop-blur-md rounded-full text-xs font-bold text-emerald-200 border border-white/20 mb-3">
              <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              WhatsApp Official Integration
            </div>
            <h2 class="text-2xl sm:text-3xl font-black tracking-tight leading-tight">Team WhatsApp Groups & Hub</h2>
            <p class="text-xs sm:text-sm text-emerald-100 mt-2 leading-relaxed">
              Connect directly with colleagues on WhatsApp. Join department group chats, get real-time Lagos HQ shift alerts (10:00 - 16:00), and access quick voice sync.
            </p>
          </div>

          <div class="flex items-center gap-3 flex-shrink-0">
            ${isAdmin ? `
              <button onclick="window.openWhatsAppGroupModal()" class="px-5 py-3 bg-white hover:bg-emerald-50 text-emerald-800 font-extrabold text-xs rounded-2xl shadow-lg transition flex items-center gap-2">
                <span class="text-base leading-none">+</span>
                <span>Add WhatsApp Group</span>
              </button>
            ` : ''}
            <button onclick="window.copyAllWhatsAppLinks()" class="px-4 py-3 bg-white/15 hover:bg-white/25 text-white font-bold text-xs rounded-2xl border border-white/20 transition flex items-center gap-1.5" title="Copy all WhatsApp group links">
              <span>📋</span>
              <span class="hidden sm:inline">Export Links</span>
            </button>
          </div>
        </div>

        <!-- KPI Strip -->
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-6 border-t border-white/15">
          <div class="bg-white/10 rounded-2xl p-3 backdrop-blur-sm">
            <div class="text-[10px] text-emerald-200 font-bold uppercase tracking-wider">Active Groups</div>
            <div class="text-xl font-black mt-0.5">${whatsappGroups.length}</div>
          </div>
          <div class="bg-white/10 rounded-2xl p-3 backdrop-blur-sm">
            <div class="text-[10px] text-emerald-200 font-bold uppercase tracking-wider">Departments</div>
            <div class="text-xl font-black mt-0.5">${new Set(whatsappGroups.map(g => g.category)).size}</div>
          </div>
          <div class="bg-white/10 rounded-2xl p-3 backdrop-blur-sm">
            <div class="text-[10px] text-emerald-200 font-bold uppercase tracking-wider">Active Shift</div>
            <div class="text-xl font-black mt-0.5">10:00 - 16:00</div>
          </div>
          <div class="bg-white/10 rounded-2xl p-3 backdrop-blur-sm">
            <div class="text-[10px] text-emerald-200 font-bold uppercase tracking-wider">Lagos HQ Status</div>
            <div class="text-xl font-black mt-0.5 text-emerald-300">Online</div>
          </div>
        </div>
      </div>

      <!-- FILTER & SEARCH BAR -->
      <div class="bg-white rounded-2xl p-3.5 border border-slate-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
        <!-- Horizontal Category Scroller -->
        <div class="horizontal-scroller w-full sm:w-auto flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          ${categories.map(cat => `
            <button onclick="window.filterWhatsAppCategory('${cat}')" class="px-3 py-1.5 rounded-xl text-xs font-bold transition flex-shrink-0 ${activeCategoryFilter === cat ? 'bg-emerald-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}">
              ${cat === 'all' ? '🌐 All Groups' : cat}
            </button>
          `).join('')}
        </div>

        <!-- Search Input -->
        <div class="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 w-full sm:w-64 flex-shrink-0">
          <svg class="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 21l-4.35-4.35M10 18a8 8 0 110-16 8 8 0 010 16z"/></svg>
          <input type="text" id="wa-search-input" class="bg-transparent text-xs w-full focus:outline-none" oninput="window.searchWhatsAppGroups(this.value)">
        </div>
      </div>

      <!-- GROUPS GRID -->
      <div id="whatsapp-groups-grid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        ${renderWhatsAppGroupCards(filtered, isAdmin)}
      </div>
    `;
  };

  function renderWhatsAppGroupCards(groups, isAdmin) {
    if (!groups || groups.length === 0) {
      return `
        <div class="col-span-full bg-white rounded-3xl border border-slate-200 p-12 text-center">
          <div class="w-16 h-16 rounded-3xl bg-emerald-50 text-emerald-600 text-3xl flex items-center justify-center mx-auto mb-4">📱</div>
          <h3 class="font-extrabold text-navy-900 text-base">No WhatsApp groups found</h3>
          <p class="text-xs text-slate-400 mt-1 max-w-sm mx-auto">There are no WhatsApp groups matching your search or category filter.</p>
          ${isAdmin ? `
            <button onclick="window.openWhatsAppGroupModal()" class="mt-4 px-4 py-2 bg-emerald-600 text-white font-bold text-xs rounded-xl shadow-md transition">
              + Add WhatsApp Group Link
            </button>
          ` : ''}
        </div>
      `;
    }

    return groups.map(g => {
      const isPinned = g.is_pinned;
      return `
        <div class="bg-white rounded-3xl border ${isPinned ? 'border-emerald-300 ring-2 ring-emerald-500/10 shadow-md' : 'border-slate-200 shadow-sm'} p-5 flex flex-col justify-between hover:shadow-lg transition group">
          <div>
            <!-- Card Top Header -->
            <div class="flex items-start justify-between gap-3 mb-3">
              <div class="flex items-center gap-3">
                <div class="w-11 h-11 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 text-white flex items-center justify-center text-xl shadow-md flex-shrink-0">
                  💬
                </div>
                <div>
                  <div class="flex items-center gap-1.5 flex-wrap">
                    <span class="pill bg-emerald-50 text-emerald-800 border border-emerald-200 text-[9px] font-bold">${esc(g.category)}</span>
                    ${isPinned ? '<span class="pill bg-amber-50 text-amber-700 border border-amber-200 text-[9px] font-bold">📌 Pinned HQ</span>' : ''}
                  </div>
                  <h3 class="font-extrabold text-navy-900 text-sm mt-1 leading-snug group-hover:text-emerald-700 transition">${esc(g.name)}</h3>
                </div>
              </div>

              ${isAdmin ? `
                <div class="flex items-center gap-1 flex-shrink-0">
                  <button onclick="window.openWhatsAppGroupModal('${g.id}')" class="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-navy-900 transition" title="Edit Group Link">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                  </button>
                  <button onclick="window.deleteWhatsAppGroup('${g.id}')" class="p-1.5 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-600 transition" title="Delete Group Link">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                  </button>
                </div>
              ` : ''}
            </div>

            <!-- Description -->
            <p class="text-xs text-slate-500 leading-relaxed mb-4">${esc(g.description || 'Join this team group on WhatsApp for real-time discussions.')}</p>

            <!-- Access Level Notice -->
            <div class="flex items-center justify-between text-[11px] text-slate-400 mb-4 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
              <span class="flex items-center gap-1">
                <span>🔒 Access:</span>
                <b class="text-navy-900">${esc(g.access || 'All Members')}</b>
              </span>
              <span class="text-emerald-600 font-semibold flex items-center gap-1">
                <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span> Verified Link
              </span>
            </div>
          </div>

          <!-- Bottom Action Buttons -->
          <div class="pt-3 border-t border-slate-100 flex items-center gap-2">
            <a href="${esc(g.url)}" target="_blank" rel="noopener noreferrer" class="flex-1 py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-extrabold text-xs rounded-xl shadow-md transition flex items-center justify-center gap-1.5 text-center">
              <span>Join WhatsApp Group</span>
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M14 5l7 7m0 0l-7 7m7-7H3"/></svg>
            </a>

            <button type="button" onclick="window.copyWhatsAppLink('${esc(g.url)}')" class="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition font-bold text-xs flex items-center justify-center" title="Copy Group Link to Clipboard">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  // ─────────────────────────────────────────────
  // MODAL: ADD / EDIT WHATSAPP GROUP
  // ─────────────────────────────────────────────
  window.openWhatsAppGroupModal = function (groupId = null) {
    if (!window.isUserAdmin || !window.isUserAdmin()) {
      if (typeof showToast === 'function') showToast('Restricted: Only administrators can manage WhatsApp group links.', true);
      return;
    }
    loadWhatsAppGroups();
    const existing = groupId ? whatsappGroups.find(g => g.id === groupId) : null;
    const modal = document.getElementById('action-modal');
    if (!modal) return;

    document.getElementById('modal-title').textContent = existing ? 'Edit WhatsApp Group' : 'Add Team WhatsApp Group';

    const categories = ['Company-wide', 'Engineering', 'Design & UI', 'Marketing', 'Management', 'Operations', 'Client Support'];

    document.getElementById('modal-fields').innerHTML = `
      <div class="space-y-4">
        <div>
          <label class="block text-xs font-bold text-slate-700 uppercase mb-1">Group Name *</label>
          <input id="wa-name" type="text" required value="${esc(existing?.name || '')}" class="w-full text-xs p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 focus:outline-none">
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-bold text-slate-700 uppercase mb-1">Department / Category *</label>
            <select id="wa-cat" class="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 focus:outline-none">
              ${categories.map(c => `<option value="${c}" ${existing?.category === c ? 'selected' : ''}>${c}</option>`).join('')}
            </select>
          </div>

          <div>
            <label class="block text-xs font-bold text-slate-700 uppercase mb-1">Member Access</label>
            <select id="wa-access" class="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 focus:outline-none">
              <option value="All Members" ${existing?.access === 'All Members' ? 'selected' : ''}>All Team Members</option>
              <option value="Department Only" ${existing?.access === 'Department Only' ? 'selected' : ''}>Department Members Only</option>
              <option value="Admin Only" ${existing?.access === 'Admin Only' ? 'selected' : ''}>Admin Only</option>
            </select>
          </div>
        </div>

        <div>
          <label class="block text-xs font-bold text-slate-700 uppercase mb-1">WhatsApp Invite Link *</label>
          <div class="flex items-center gap-2 bg-emerald-50/50 border border-emerald-200 rounded-xl px-3 py-1">
            <span class="text-emerald-600 font-bold text-xs">🔗</span>
            <input id="wa-url" type="url" required value="${esc(existing?.url || '')}" class="bg-transparent text-xs w-full py-2 text-navy-900 focus:outline-none font-mono">
          </div>
          <span class="text-[10px] text-slate-400 mt-1 block">Copy this link from your WhatsApp group info (Group Info → Invite via link).</span>
        </div>

        <div>
          <label class="block text-xs font-bold text-slate-700 uppercase mb-1">Group Description & Guidelines</label>
          <textarea id="wa-desc" rows="2" class="w-full text-xs p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 focus:outline-none resize-none">${esc(existing?.description || '')}</textarea>
        </div>

        <div class="flex items-center gap-2 p-3 bg-slate-50 border border-slate-200 rounded-xl">
          <input type="checkbox" id="wa-pinned" ${existing?.is_pinned ? 'checked' : ''} class="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer">
          <label for="wa-pinned" class="text-xs font-bold text-navy-900 cursor-pointer">📌 Pin to Top (Highlighted for All Team Members)</label>
        </div>
      </div>
    `;

    const submitBtn = document.querySelector('#modal-form [type="submit"]');
    if (submitBtn) {
      submitBtn.textContent = existing ? 'Save Changes' : 'Create WhatsApp Link';
      submitBtn.className = 'px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-md transition';
    }

    modal.classList.remove('hidden');

    document.getElementById('modal-form').onsubmit = function (e) {
      e.preventDefault();
      const name = document.getElementById('wa-name').value.trim();
      const category = document.getElementById('wa-cat').value;
      const access = document.getElementById('wa-access').value;
      let url = document.getElementById('wa-url').value.trim();
      const description = document.getElementById('wa-desc').value.trim();
      const is_pinned = document.getElementById('wa-pinned').checked;

      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
      }

      if (existing) {
        existing.name = name;
        existing.category = category;
        existing.access = access;
        existing.url = url;
        existing.description = description;
        existing.is_pinned = is_pinned;
        if (typeof showToast === 'function') showToast('WhatsApp Group updated! 📱');
      } else {
        const newGroup = {
          id: 'wa_' + Date.now(),
          name,
          category,
          access,
          url,
          description,
          is_pinned,
          created_at: new Date().toISOString()
        };
        whatsappGroups.push(newGroup);
        if (typeof showToast === 'function') showToast('WhatsApp Group link added! 🎉');
      }

      saveWhatsAppGroups();
      if (typeof closeActionModal === 'function') closeActionModal();
      window.loadWhatsAppView();
    };
  };

  window.deleteWhatsAppGroup = function (groupId) {
    if (!window.isUserAdmin || !window.isUserAdmin()) {
      if (typeof showToast === 'function') showToast('Restricted: Only administrators can delete WhatsApp groups.', true);
      return;
    }
    if (!confirm('Are you sure you want to remove this WhatsApp group link?')) return;
    whatsappGroups = whatsappGroups.filter(g => g.id !== groupId);
    saveWhatsAppGroups();
    if (typeof showToast === 'function') showToast('WhatsApp group removed 🗑️');
    window.loadWhatsAppView();
  };

  window.copyWhatsAppLink = function (url) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(() => {
        if (typeof showToast === 'function') showToast('WhatsApp link copied to clipboard! 📋');
      }).catch(() => fallbackCopy(url));
    } else {
      fallbackCopy(url);
    }
  };

  function fallbackCopy(text) {
    const el = document.createElement('textarea');
    el.value = text;
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
    if (typeof showToast === 'function') showToast('WhatsApp link copied! 📋');
  }

  window.copyAllWhatsAppLinks = function () {
    const summary = whatsappGroups.map(g => `${g.name} (${g.category}): ${g.url}`).join('\n');
    window.copyWhatsAppLink(summary);
  };

  window.filterWhatsAppCategory = function (cat) {
    activeCategoryFilter = cat;
    window.loadWhatsAppView();
  };

  window.searchWhatsAppGroups = function (query) {
    const q = (query || '').toLowerCase().trim();
    const isAdmin = Boolean(
      (typeof window.isUserAdmin === 'function' ? window.isUserAdmin() : (
        window.currentProfile?.access_level === 'Admin' ||
        (typeof currentProfile !== 'undefined' && currentProfile?.access_level === 'Admin') ||
        window.currentUser?.email === 'nodaarltd@gmail.com' ||
        (typeof currentUser !== 'undefined' && currentUser?.email === 'nodaarltd@gmail.com')
      ))
    );
    const grid = document.getElementById('whatsapp-groups-grid');
    if (!grid) return;

    const filtered = whatsappGroups.filter(g => {
      const matchCat = activeCategoryFilter === 'all' || g.category === activeCategoryFilter;
      const matchText = !q || g.name.toLowerCase().includes(q) || (g.description || '').toLowerCase().includes(q) || g.category.toLowerCase().includes(q);
      return matchCat && matchText;
    });

    grid.innerHTML = renderWhatsAppGroupCards(filtered, isAdmin);
  };

  window.openChannelWhatsApp = function (channelId) {
    loadWhatsAppGroups();
    const match = whatsappGroups.find(g => g.channel_id === channelId) || whatsappGroups[0];
    if (match) {
      window.open(match.url, '_blank');
    } else {
      window.navigate('whatsapp');
    }
  };

})();
