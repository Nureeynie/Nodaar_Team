// Nodaar Team Hub — Advanced Channels & Enterprise Workspace (Microsoft Teams Architecture)
// Features: Rich text formatting, Tags & Mentions, Drafts & Sending, URL Attachments only (NO file uploads),
// Channel Access Control, Post Editing, Pinned Updates, In-App Drive Previews, and User CRUD (Delete, Edit, Save, Draft)

(function () {
  const CHANNELS_STORAGE_KEY = 'nodaar_channels_v4';
  const UPDATES_STORAGE_KEY = 'nodaar_channel_updates_v4';
  const MEMBERSHIPS_KEY = 'nodaar_channel_memberships_v4';
  const PROFILES_LOCAL_KEY = 'nodaar_profiles_cache';

  // Available System Tags
  const POPULAR_TAGS = ['#announcement', '#deliverable', '#urgent', '#sprint', '#review', '#client', '#operations', '#design'];

  // Default Seed Channels
  const DEFAULT_CHANNELS = [
    {
      id: 'ch_announcements',
      name: 'announcements',
      display_name: 'Announcements & All-Hands',
      description: 'Official organization broadcasts, company milestones, and executive directives.',
      icon: '📢',
      is_private: false,
      member_ids: []
    },
    {
      id: 'ch_general',
      name: 'general',
      display_name: 'General Workspace',
      description: 'Cross-functional coordination, general Q&A, and daily operations.',
      icon: '💬',
      is_private: false,
      member_ids: []
    },
    {
      id: 'ch_engineering',
      name: 'engineering-tech',
      display_name: 'Engineering & Tech',
      description: 'Architecture, Supabase migrations, code reviews, and sprint technical deliverables.',
      icon: '💻',
      is_private: true,
      member_ids: []
    },
    {
      id: 'ch_design',
      name: 'product-design',
      display_name: 'Product & UI-UX Design',
      description: 'Design systems, Figma wireframes, prototype reviews, and UX specs.',
      icon: '🎨',
      is_private: true,
      member_ids: []
    },
    {
      id: 'ch_marketing',
      name: 'growth-marketing',
      display_name: 'Growth & Marketing',
      description: 'Brand campaigns, pitch proposals, social assets, and client partnerships.',
      icon: '🚀',
      is_private: true,
      member_ids: []
    },
    {
      id: 'ch_leadership',
      name: 'executive-leadership',
      display_name: 'Executive Leadership',
      description: 'Confidential founder directives, financial metrics, and high-level OKRs.',
      icon: '🔒',
      is_private: true,
      member_ids: []
    }
  ];

  // Default Seed Updates with URL attachments & Tags
  // All AI seed updates cleared - start with clean workspace feeds
  const DEFAULT_UPDATES = [];

  let currentActiveChannelId = 'ch_announcements';
  let activeTagFilter = 'all';
  let activeStatusTab = 'all'; // 'all' | 'published' | 'drafts'
  let mobileActiveView = 'feed'; // 'channels' | 'feed' on mobile screens
  let channelsList = [];
  let channelUpdates = [];
  let channelMemberships = {};

  // ─────────────────────────────────────────────
  // 1. STATE & STORAGE MANAGEMENT
  // ─────────────────────────────────────────────
  function loadChannelsState() {
    try {
      const rawCh = localStorage.getItem(CHANNELS_STORAGE_KEY);
      channelsList = rawCh ? JSON.parse(rawCh) : DEFAULT_CHANNELS;
      if (!channelsList || channelsList.length === 0) channelsList = DEFAULT_CHANNELS;

      const rawUpd = localStorage.getItem(UPDATES_STORAGE_KEY);
      const loaded = rawUpd ? JSON.parse(rawUpd) : [];
      // Clean and purge any legacy AI-generated seed updates
      channelUpdates = (Array.isArray(loaded) ? loaded : []).filter(u => {
        if (!u || !u.id) return false;
        if (u.id === 'upd_1' || u.id === 'upd_2') return false;
        if (typeof u.title === 'string' && (u.title.includes('Nodaar Enterprise Workspace') || u.title.includes('Lagos Work Shift Sync'))) return false;
        return true;
      });
      localStorage.setItem(UPDATES_STORAGE_KEY, JSON.stringify(channelUpdates));
      if (!channelUpdates || channelUpdates.length === 0) channelUpdates = DEFAULT_UPDATES;

      const rawMem = localStorage.getItem(MEMBERSHIPS_KEY);
      channelMemberships = rawMem ? JSON.parse(rawMem) : {};
    } catch (e) {
      console.warn('Error reading channels from localStorage', e);
      channelsList = DEFAULT_CHANNELS;
      channelUpdates = DEFAULT_UPDATES;
      channelMemberships = {};
    }
  }

  function saveChannelsState() {
    try {
      localStorage.setItem(CHANNELS_STORAGE_KEY, JSON.stringify(channelsList));
      localStorage.setItem(UPDATES_STORAGE_KEY, JSON.stringify(channelUpdates));
      localStorage.setItem(MEMBERSHIPS_KEY, JSON.stringify(channelMemberships));
    } catch (e) {
      console.error('Failed to save channels state', e);
    }
  }

  // Admin & Access check
  function isCurrentAdmin() {
    return Boolean(
      window.currentProfile?.access_level === 'Admin' ||
      (typeof currentProfile !== 'undefined' && currentProfile?.access_level === 'Admin') ||
      window.currentUser?.email === 'nodaarltd@gmail.com' ||
      (typeof currentUser !== 'undefined' && currentUser?.email === 'nodaarltd@gmail.com')
    );
  }

  function canUserAccessChannel(channel) {
    if (!channel) return false;
    if (isCurrentAdmin()) return true;
    if (!channel.is_private) return true;

    const uid = window.currentUser?.id || (typeof currentUser !== 'undefined' && currentUser?.id);
    if (!uid) return false;
    const assignedIds = channelMemberships[channel.id] || channel.member_ids || [];
    return assignedIds.includes(uid);
  }

  function getAccessibleChannels() {
    return channelsList.filter(canUserAccessChannel);
  }

  // ─────────────────────────────────────────────
  // 2. MARKDOWN & SMART URL PARSER
  // ─────────────────────────────────────────────
  function parseTextFormatting(text) {
    if (!text) return '';
    let escaped = escapeHtml(text);

    // Bold: **text**
    escaped = escaped.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    // Italic: *text*
    escaped = escaped.replace(/\*(.*?)\*/g, '<em>$1</em>');
    // Inline code: `code`
    escaped = escaped.replace(/`([^`]+)`/g, '<code class="bg-slate-100 text-brand-600 px-1.5 py-0.5 rounded text-[11px] font-mono">$1</code>');
    // Blockquote: > text
    escaped = escaped.replace(/^&gt;\s?(.*?)$/gm, '<blockquote class="border-l-4 border-brand-400 pl-3 py-1 my-1 text-slate-600 italic bg-slate-50/50 rounded-r">$1</blockquote>');
    // Bullet points: • or -
    escaped = escaped.replace(/^[•\-]\s?(.*?)$/gm, '<li class="ml-4 list-disc">$1</li>');
    // Mentions: @username
    escaped = escaped.replace(/@([a-zA-Z0-9_\-]+)/g, '<span class="font-bold text-brand-600 bg-brand-50 px-1 py-0.5 rounded">@$1</span>');
    // Hashtags: #tag
    escaped = escaped.replace(/#([a-zA-Z0-9_\-]+)/g, '<span class="font-semibold text-blue-600 bg-blue-50 px-1 py-0.5 rounded">#$1</span>');

    return escaped.replace(/\n/g, '<br>');
  }

  // Detect URL metadata (Docs, Sheets, Slides, Figma, Loom, Drive, External)
  function getUrlMetadata(url) {
    if (!url) return null;
    const lower = url.toLowerCase();

    if (lower.includes('docs.google.com/document')) {
      return { type: 'gdoc', label: 'Google Docs', icon: '📄', color: 'blue', bg: 'bg-blue-50 text-blue-700 border-blue-200' };
    } else if (lower.includes('docs.google.com/spreadsheets')) {
      return { type: 'gsheet', label: 'Google Sheets', icon: '📊', color: 'emerald', bg: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
    } else if (lower.includes('docs.google.com/presentation')) {
      return { type: 'gslide', label: 'Google Slides', icon: '📑', color: 'amber', bg: 'bg-amber-50 text-amber-700 border-amber-200' };
    } else if (lower.includes('drive.google.com')) {
      return { type: 'gdrive', label: 'Google Drive Folder', icon: '📁', color: 'brand', bg: 'bg-brand-50 text-brand-700 border-brand-200' };
    } else if (lower.includes('figma.com')) {
      return { type: 'figma', label: 'Figma Design', icon: '🎨', color: 'purple', bg: 'bg-purple-50 text-purple-700 border-purple-200' };
    } else if (lower.includes('loom.com')) {
      return { type: 'loom', label: 'Loom Video', icon: '🎥', color: 'rose', bg: 'bg-rose-50 text-rose-700 border-rose-200' };
    } else if (lower.includes('github.com')) {
      return { type: 'github', label: 'GitHub Repo / PR', icon: '💻', color: 'slate', bg: 'bg-slate-100 text-slate-800 border-slate-300' };
    } else {
      return { type: 'web', label: 'External Resource', icon: '🔗', color: 'slate', bg: 'bg-slate-50 text-slate-700 border-slate-200' };
    }
  }

  // ─────────────────────────────────────────────
  // 3. MAIN CHANNELS VIEW
  // ─────────────────────────────────────────────
  window.loadChannels = async function () {
    loadChannelsState();
    const container = document.getElementById('channels-main-container');
    if (!container) return;

    const accessible = getAccessibleChannels();
    const isUserAdmin = Boolean(
      window.currentProfile?.access_level === 'Admin' ||
      (typeof currentProfile !== 'undefined' && currentProfile?.access_level === 'Admin') ||
      window.currentUser?.email === 'nodaarltd@gmail.com' ||
      (typeof currentUser !== 'undefined' && currentUser?.email === 'nodaarltd@gmail.com')
    );

    if (!channelsList.some(c => c.id === currentActiveChannelId)) {
      currentActiveChannelId = accessible[0]?.id || 'ch_announcements';
    }

    const activeChannel = channelsList.find(c => c.id === currentActiveChannelId) || channelsList[0];
    const hasAccess = canUserAccessChannel(activeChannel);

    container.innerHTML = `
      <div class="bg-white rounded-2xl sm:rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col md:grid md:grid-cols-12 w-full">
        
        <!-- LEFT COLUMN: Channels Directory (4 cols on md/lg) -->
        <div id="channel-nav-column" class="${mobileActiveView === 'channels' ? 'flex' : 'hidden'} md:flex md:col-span-4 lg:col-span-3 border-r border-slate-100 flex-col bg-slate-50/70 select-none">
          <!-- Channels Header -->
          <div class="p-3 sm:p-4 border-b border-slate-200/80 flex items-center justify-between">
            <div>
              <h3 class="font-black text-navy-900 text-sm flex items-center gap-1.5">
                <span>💬 Channels</span>
                <span class="pill bg-brand-50 text-brand-700 text-[10px] font-bold">${accessible.length}</span>
              </h3>
              <p class="text-[10px] text-slate-400 mt-0.5">MS Teams style workspace feeds</p>
            </div>
            <div class="flex items-center gap-1">
              ${isUserAdmin ? `
                <button onclick="window.openCreateChannelModal()" class="p-1.5 bg-brand-500 hover:bg-brand-600 text-white rounded-xl shadow-sm transition" title="Create New Channel">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M12 4v16m8-8H4"/></svg>
                </button>
              ` : ''}
              <button type="button" onclick="window.toggleMobileChannelView('feed')" class="md:hidden p-1.5 text-slate-600 hover:text-navy-900 bg-white border border-slate-200 rounded-xl text-xs font-bold transition flex items-center gap-1" title="View Feed">
                <span>Feed</span>
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>
              </button>
            </div>
          </div>

          <!-- Channel Filter Search -->
          <div class="p-2.5 border-b border-slate-100">
            <div class="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs">
              <svg class="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 21l-4.35-4.35M10 18a8 8 0 110-16 8 8 0 010 16z"/></svg>
              <input type="text" id="channel-search-input" placeholder="Search channels…" class="bg-transparent text-xs w-full focus:outline-none" oninput="window.filterChannelsList(this.value)">
            </div>
          </div>

          <!-- Channel List -->
          <div class="flex-1 overflow-y-auto p-2 space-y-1" id="channels-nav-list">
            ${renderChannelsNavItems(accessible)}
          </div>

          <!-- Active Shift Notice -->
          <div class="p-3 bg-brand-50/60 border-t border-brand-100/60 text-[11px] text-slate-600 flex items-center justify-between">
            <span class="flex items-center gap-1.5 font-bold text-brand-700">
              <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              Live Shift: 10:00 - 16:00
            </span>
            <span class="text-[10px] text-slate-400 font-semibold">Lagos HQ</span>
          </div>
        </div>

        <!-- RIGHT COLUMN: Active Channel Feed (8 cols on md/lg) -->
        <div id="channel-feed-column" class="${mobileActiveView === 'feed' ? 'flex' : 'hidden'} md:flex md:col-span-8 lg:col-span-9 flex-col bg-white">
          ${hasAccess ? renderActiveChannelFeed(activeChannel, isUserAdmin) : renderRestrictedChannelState(activeChannel)}
        </div>

      </div>
    `;

    renderChannelUpdatesFeed(activeChannel, isUserAdmin);
  };

  function renderChannelsNavItems(accessible) {
    const currentUid = window.currentUser?.id || (typeof currentUser !== 'undefined' && currentUser?.id);
    const isUserAdmin = Boolean(
      window.currentProfile?.access_level === 'Admin' ||
      (typeof currentProfile !== 'undefined' && currentProfile?.access_level === 'Admin') ||
      window.currentUser?.email === 'nodaarltd@gmail.com' ||
      (typeof currentUser !== 'undefined' && currentUser?.email === 'nodaarltd@gmail.com')
    );

    return accessible.map(c => {
      const isActive = c.id === currentActiveChannelId;
      const count = channelUpdates.filter(u => u.channel_id === c.id && u.status === 'published').length;
      const draftCount = channelUpdates.filter(u => u.channel_id === c.id && u.status === 'draft' && (isUserAdmin || u.author_id === currentUid)).length;

      return `
        <button onclick="window.switchChannel('${c.id}')" class="channel-nav-btn w-full flex items-center justify-between p-2.5 rounded-2xl text-xs transition text-left ${isActive ? 'bg-brand-500 text-white font-bold shadow-md shadow-brand-500/25' : 'text-slate-600 hover:bg-slate-100 hover:text-navy-900'}">
          <div class="flex items-center gap-2.5 min-w-0">
            <span class="text-sm">${c.icon || '💬'}</span>
            <div class="truncate">
              <span class="${isActive ? 'text-white' : 'text-slate-800 font-bold'}">#${escapeHtml(c.name)}</span>
              ${c.is_private ? '<span class="text-[9px] opacity-75 ml-1">🔒</span>' : ''}
            </div>
          </div>
          <div class="flex items-center gap-1 flex-shrink-0">
            ${draftCount > 0 ? `<span class="pill text-[8px] px-1 py-0.2 ${isActive ? 'bg-amber-300 text-navy-900' : 'bg-amber-100 text-amber-800'} font-bold">📝 ${draftCount}</span>` : ''}
            <span class="pill text-[9px] px-1.5 py-0.2 ${isActive ? 'bg-white/20 text-white' : 'bg-slate-200/70 text-slate-500'} font-semibold">${count}</span>
          </div>
        </button>
      `;
    }).join('');
  }

  function renderActiveChannelFeed(channel, isUserAdmin) {
    const assignedIds = channelMemberships[channel.id] || channel.member_ids || [];
    const memberCount = channel.is_private ? assignedIds.length : 'All Team';
    const currentUid = window.currentUser?.id;

    const draftCount = channelUpdates.filter(u => u.channel_id === channel.id && u.status === 'draft' && (isUserAdmin || u.author_id === currentUid)).length;

    return `
      <!-- Channel Top Bar -->
      <div class="p-3 sm:p-5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2.5 sm:gap-3 bg-white sticky top-0 z-10">
        <div class="flex items-center gap-2 sm:gap-3 min-w-0">
          <!-- Mobile Back to Channels Button -->
          <button type="button" onclick="window.toggleMobileChannelView('channels')" class="md:hidden px-2.5 py-1.5 text-slate-700 hover:text-navy-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition flex items-center gap-1 font-bold text-xs flex-shrink-0" title="Back to Channels">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M15 19l-7-7 7-7"/></svg>
            <span>Channels</span>
          </button>
          <div class="min-w-0">
            <div class="flex items-center gap-1.5 sm:gap-2">
              <span class="text-lg sm:text-xl flex-shrink-0">${channel.icon || '💬'}</span>
              <h2 class="font-extrabold text-navy-900 text-sm sm:text-base leading-tight truncate">#${escapeHtml(channel.name)}</h2>
              ${channel.is_private
                ? '<span class="pill bg-purple-50 text-purple-700 border border-purple-200 text-[9px] sm:text-[10px] font-bold flex-shrink-0">🔒 Private</span>'
                : '<span class="pill bg-emerald-50 text-emerald-700 border border-emerald-200 text-[9px] sm:text-[10px] font-bold flex-shrink-0">🌐 Public</span>'
              }
            </div>
            <p class="text-[11px] sm:text-xs text-slate-400 mt-0.5 truncate max-w-xs sm:max-w-md">${escapeHtml(channel.description || '')}</p>
          </div>
        </div>

        <div class="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
          <button onclick="window.openChannelWhatsApp('${channel.id}')" class="px-2.5 sm:px-3 py-1.5 sm:py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-xs rounded-xl border border-emerald-200 transition flex items-center gap-1" title="Open Channel WhatsApp Group">
            <span>📱</span> <span class="hidden sm:inline">WhatsApp</span>
          </button>

          <div class="text-[11px] sm:text-xs text-slate-500 bg-slate-50 border border-slate-200 px-2 sm:px-3 py-1.5 rounded-xl font-semibold flex items-center gap-1">
            <span>👥</span> <span class="hidden sm:inline">${memberCount} Members</span><span class="sm:hidden">${memberCount}</span>
          </div>

          ${isUserAdmin ? `
            <button onclick="window.openChannelSettingsModal('${channel.id}')" class="px-2.5 sm:px-3 py-1.5 sm:py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition flex items-center gap-1" title="Manage Members">
              <span>⚙️</span> <span class="hidden sm:inline">Members</span>
            </button>
          ` : ''}

          <button onclick="window.openPostUpdateModal('${channel.id}')" class="px-3 sm:px-4 py-1.5 sm:py-2 bg-brand-500 hover:bg-brand-600 text-white font-bold text-xs rounded-xl shadow-md transition flex items-center gap-1 flex-shrink-0">
            <span>📝</span> <span class="hidden sm:inline">New Post / Draft</span><span class="sm:hidden">Post</span>
          </button>
        </div>
      </div>

      <!-- Filter Tabs & Tag Bar (Horizontal Scroller) -->
      <div class="px-4 sm:px-6 py-2.5 bg-slate-50/70 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs">
        <!-- Status Tabs: All | Announcements | Deliverables | Drafts -->
        <div class="horizontal-scroller flex items-center gap-1 overflow-x-auto max-w-full">
          <button onclick="window.setStatusTab('all')" class="px-3 py-1 rounded-lg font-bold transition flex-shrink-0 ${activeStatusTab === 'all' ? 'bg-white text-navy-900 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-navy-900'}">
            All Feed
          </button>
          <button onclick="window.setStatusTab('deliverables')" class="px-3 py-1 rounded-lg font-bold transition flex-shrink-0 ${activeStatusTab === 'deliverables' ? 'bg-white text-navy-900 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-navy-900'}">
            📁 URL Deliverables
          </button>
          <button onclick="window.setStatusTab('drafts')" class="px-3 py-1 rounded-lg font-bold transition flex-shrink-0 flex items-center gap-1 ${activeStatusTab === 'drafts' ? 'bg-white text-amber-900 shadow-sm border border-amber-200' : 'text-slate-500 hover:text-navy-900'}">
            <span>📝 Drafts</span>
            ${draftCount > 0 ? `<span class="pill bg-amber-200 text-amber-900 text-[9px] px-1.5 py-0.2">${draftCount}</span>` : ''}
          </button>
        </div>

        <!-- Tag Quick Filter Pills -->
        <div class="horizontal-scroller flex items-center gap-1 overflow-x-auto max-w-sm">
          <span class="text-[10px] font-bold text-slate-400 uppercase mr-1 flex-shrink-0">Tags:</span>
          <button onclick="window.setTagFilter('all')" class="pill ${activeTagFilter === 'all' ? 'bg-navy-900 text-white' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'} text-[10px] transition flex-shrink-0">All</button>
          ${POPULAR_TAGS.slice(0, 4).map(tag => `
            <button onclick="window.setTagFilter('${tag}')" class="pill ${activeTagFilter === tag ? 'bg-brand-500 text-white font-bold' : 'bg-white border border-slate-200 text-slate-600 hover:border-brand-300'} text-[10px] transition flex-shrink-0">${tag}</button>
          `).join('')}
        </div>
      </div>

      <!-- Updates Feed Area -->
      <div class="flex-1 overflow-y-auto p-3.5 sm:p-5 space-y-4 overscroll-contain" id="channel-feed-container" style="-webkit-overflow-scrolling: touch;">
        <!-- Rendered by renderChannelUpdatesFeed -->
      </div>

      <!-- DOCKED BOTTOM COMPOSER (Like Teams & Slack) -->
      <div class="p-3 sm:p-4 bg-slate-50 border-t border-slate-200 sticky bottom-0 z-10">
        <div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-3 focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-500/10 transition">
          <!-- Textarea -->
          <textarea id="docked-post-body" rows="2" placeholder="Send a message to #${escapeHtml(channel.name)}… (use **bold**, *italic*, \`code\`, quote, #tags)" class="w-full text-xs text-navy-900 focus:outline-none resize-none"></textarea>

          <!-- Docked Controls Bar -->
          <div class="mt-2 pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
            <!-- Formatting & Tags Toolbar -->
            <div class="flex items-center gap-1 text-slate-500 overflow-x-auto py-1 flex-nowrap max-w-full">
              <button type="button" onclick="window.insertFormatting('**', '**', 'bold text')" class="p-1 hover:bg-slate-100 rounded text-xs font-bold" title="Bold (**text**)"><b>B</b></button>
              <button type="button" onclick="window.insertFormatting('*', '*', 'italic text')" class="p-1 hover:bg-slate-100 rounded text-xs italic font-serif" title="Italic (*text*)"><i>I</i></button>
              <button type="button" onclick="window.insertFormatting('\`', '\`', 'code')" class="p-1 hover:bg-slate-100 rounded text-xs font-mono" title="Code">&lt;/&gt;</button>
              <button type="button" onclick="window.insertFormatting('> ', '', 'quote')" class="p-1 hover:bg-slate-100 rounded text-xs" title="Quote (> text)">“</button>
              <button type="button" onclick="window.insertFormatting('• ', '', 'list item')" class="p-1 hover:bg-slate-100 rounded text-xs" title="Bullet list">• List</button>
              
              <!-- Quick Tag Insert Dropdown -->
              <div class="relative inline-block ml-1">
                <button type="button" onclick="window.toggleTagMenu()" class="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[10px] rounded-lg transition flex items-center gap-0.5">
                  <span>#</span> Tag
                </button>
                <div id="quick-tag-menu" class="hidden absolute bottom-full mb-1 left-0 bg-white border border-slate-200 rounded-xl shadow-lg p-1.5 w-36 z-20 space-y-0.5">
                  ${POPULAR_TAGS.map(t => `
                    <button type="button" onclick="window.appendTag('${t}')" class="w-full text-left px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 rounded-lg">${t}</button>
                  `).join('')}
                </div>
              </div>

              <!-- URL Attachment Input Toggle (STRICTLY URL ONLY - NO FILE UPLOADS) -->
              <button type="button" onclick="window.toggleDockedUrlInput()" class="px-2 py-1 bg-brand-50 hover:bg-brand-100 text-brand-700 font-bold text-[10px] rounded-lg transition flex items-center gap-1" title="Add URL Link">
                <span>🔗 Add URL</span>
              </button>
            </div>

            <!-- Action Buttons: Save Draft & Send -->
            <div class="flex items-center gap-2">
              <button type="button" onclick="window.submitDockedPost('draft')" class="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition flex items-center gap-1" title="Save this message as Draft">
                <span>📝</span> Draft
              </button>
              <button type="button" onclick="window.submitDockedPost('published')" class="px-4 py-1.5 bg-gradient-to-r from-brand-500 to-amber-500 hover:from-brand-600 hover:to-amber-600 text-white font-bold text-xs rounded-xl shadow-md transition flex items-center gap-1.5">
                <span>Send</span>
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M14 5l7 7m0 0l-7 7m7-7H3"/></svg>
              </button>
            </div>
          </div>

          <!-- URL Link Input Field (Hidden by default, toggled open) -->
          <div id="docked-url-container" class="hidden mt-2 pt-2 border-t border-slate-100">
            <div class="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5">
              <span class="text-xs">🔗</span>
              <input type="url" id="docked-post-url" placeholder="Paste URL link (Google Docs, Sheets, Slides, Figma, Loom, GitHub)… Strictly URL only" class="bg-transparent text-xs w-full focus:outline-none">
              <button type="button" onclick="document.getElementById('docked-post-url').value=''" class="text-slate-400 hover:text-slate-600 text-xs">✕</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderRestrictedChannelState(channel) {
    return `
      <div class="flex-1 flex flex-col items-center justify-center p-8 text-center bg-slate-50/50">
        <div class="w-16 h-16 rounded-3xl bg-purple-50 border border-purple-100 text-purple-600 text-2xl flex items-center justify-center mb-4 shadow-sm">
          🔒
        </div>
        <h3 class="text-lg font-black text-navy-900">Restricted Channel</h3>
        <p class="text-xs text-slate-500 mt-1.5 max-w-sm">
          You are not currently assigned to <b>#${escapeHtml(channel.name)}</b>. Contact an administrator to request channel access.
        </p>
      </div>
    `;
  }

  // Render Updates Feed with Filters, Pinned Posts & URL Badges
  function renderChannelUpdatesFeed(channel, isUserAdmin) {
    const container = document.getElementById('channel-feed-container');
    if (!container) return;

    const currentUid = window.currentUser?.id;

    // Apply Filters
    let updates = channelUpdates.filter(u => u.channel_id === channel.id);

    // Status Filter (all, deliverables, drafts)
    if (activeStatusTab === 'deliverables') {
      updates = updates.filter(u => u.url_link && u.url_link.trim() !== '');
    } else if (activeStatusTab === 'drafts') {
      updates = updates.filter(u => u.status === 'draft' && (isUserAdmin || u.author_id === currentUid));
    } else {
      // Normal 'all': show published, plus drafts if author/admin
      updates = updates.filter(u => u.status === 'published' || (u.status === 'draft' && (isUserAdmin || u.author_id === currentUid)));
    }

    // Tag Filter
    if (activeTagFilter !== 'all') {
      updates = updates.filter(u => (u.tags || []).includes(activeTagFilter));
    }

    // Sort: Pinned first, then newest first
    updates.sort((a, b) => {
      if (a.is_pinned && !b.is_pinned) return -1;
      if (!a.is_pinned && b.is_pinned) return 1;
      return new Date(b.created_at) - new Date(a.created_at);
    });

    if (updates.length === 0) {
      container.innerHTML = `
        <div class="p-8 sm:p-12 text-center text-slate-400 bg-slate-50/60 rounded-3xl border border-slate-100">
          <div class="text-3xl mb-2">${channel.icon || '💬'}</div>
          <h4 class="font-bold text-navy-900 text-sm">Welcome to #${escapeHtml(channel.name)}</h4>
          <p class="text-xs text-slate-400 mt-1 max-w-sm mx-auto">No announcements or updates posted yet. Use the composer below to share a post, deliverable link, or discussion.</p>
        </div>
      `;
      return;
    }

    const typeBadges = {
      announcement: '<span class="pill bg-purple-50 text-purple-700 border border-purple-200">📢 Announcement</span>',
      priority: '<span class="pill bg-amber-50 text-amber-700 border border-amber-200">⚡ Priority Update</span>',
      deliverable: '<span class="pill bg-brand-50 text-brand-700 border border-brand-200">📁 URL Deliverable</span>',
      general: '<span class="pill bg-slate-100 text-slate-600 border border-slate-200">💬 Discussion</span>'
    };

    container.innerHTML = updates.map(u => {
      const isAuthorOrAdmin = isUserAdmin || u.author_id === currentUid;
      const isDraft = u.status === 'draft';
      const initials = (u.author_name || 'Admin').charAt(0).toUpperCase();
      const urlMeta = getUrlMetadata(u.url_link);

      return `
        <div class="update-card bg-white rounded-3xl border ${isDraft ? 'border-amber-300 bg-amber-50/15' : u.is_pinned ? 'border-brand-200 bg-brand-50/10' : 'border-slate-200'} p-5 sm:p-6 shadow-sm hover:shadow-md transition relative">
          
          <!-- Pinned or Draft Ribbon -->
          <div class="flex items-center justify-between mb-3">
            <div class="flex items-center gap-2">
              ${u.is_pinned ? `
                <span class="pill bg-brand-100 text-brand-800 text-[10px] font-bold flex items-center gap-1">
                  <span>📌</span> Pinned by Admin
                </span>
              ` : ''}

              ${isDraft ? `
                <span class="pill bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-bold">
                  📝 DRAFT — Only visible to you & admin
                </span>
              ` : ''}
            </div>

            ${isDraft ? `
              <button onclick="window.sendDraftNow('${u.id}')" class="px-3 py-1 bg-gradient-to-r from-brand-500 to-amber-500 hover:from-brand-600 hover:to-amber-600 text-white rounded-xl text-xs font-bold shadow-sm transition">
                🚀 Send Now
              </button>
            ` : ''}
          </div>

          <!-- Header -->
          <div class="flex items-start justify-between gap-3 mb-2.5">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-2xl bg-gradient-to-tr from-brand-500 to-amber-400 text-white font-black text-xs flex items-center justify-center overflow-hidden shadow-sm flex-shrink-0">
                ${u.author_avatar ? `<img src="${u.author_avatar}" class="w-full h-full object-cover">` : initials}
              </div>
              <div>
                <div class="flex items-center gap-2">
                  <h4 class="font-bold text-navy-900 text-sm leading-tight">${escapeHtml(u.author_name || 'Team Member')}</h4>
                  <span class="pill bg-slate-100 text-slate-600 text-[9px] font-semibold">${escapeHtml(u.author_role || 'Member')}</span>
                </div>
                <div class="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1.5">
                  <span>${new Date(u.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</span>
                  ${u.updated_at ? '<span class="text-slate-400 italic">(edited)</span>' : ''}
                </div>
              </div>
            </div>

            <div class="flex items-center gap-2">
              ${typeBadges[u.update_type] || typeBadges.general}

              <!-- Admin/Author Actions Menu -->
              ${isAuthorOrAdmin ? `
                <div class="flex items-center gap-1">
                  ${isUserAdmin ? `
                    <button onclick="window.togglePinUpdate('${u.id}')" class="p-1.5 text-slate-400 hover:text-brand-600 hover:bg-slate-100 rounded-lg transition" title="${u.is_pinned ? 'Unpin' : 'Pin to Top'}">
                      <span class="text-xs">📌</span>
                    </button>
                  ` : ''}
                  <button onclick="window.openEditUpdateModal('${u.id}')" class="p-1.5 text-slate-400 hover:text-brand-600 hover:bg-slate-100 rounded-lg transition" title="Edit Post">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                  </button>
                  <button onclick="window.deleteUpdate('${u.id}')" class="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition" title="Delete Post">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                  </button>
                </div>
              ` : ''}
            </div>
          </div>

          <!-- Title & Formatted Body -->
          ${u.title ? `<h3 class="font-extrabold text-navy-900 text-base mb-1.5">${escapeHtml(u.title)}</h3>` : ''}
          <div class="text-xs text-slate-700 leading-relaxed">${parseTextFormatting(u.body)}</div>

          <!-- Tags Badges Row -->
          ${(u.tags && u.tags.length > 0) ? `
            <div class="mt-3 flex flex-wrap gap-1.5">
              ${u.tags.map(t => `
                <button onclick="window.setTagFilter('${escapeHtml(t)}')" class="pill bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[10px] transition cursor-pointer">
                  ${escapeHtml(t)}
                </button>
              `).join('')}
            </div>
          ` : ''}

          <!-- Attached URL Deliverable Card (STRICTLY URL ONLY - NO FILE UPLOADS) -->
          ${(u.url_link && urlMeta) ? `
            <div class="mt-3.5 p-3.5 bg-slate-50 border border-slate-200/90 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div class="flex items-center gap-3 min-w-0">
                <span class="text-2xl">${urlMeta.icon}</span>
                <div class="truncate">
                  <div class="flex items-center gap-1.5">
                    <span class="pill ${urlMeta.bg} border text-[9px] font-bold">${urlMeta.label}</span>
                    <span class="text-xs font-bold text-navy-900 truncate">URL Attachment</span>
                  </div>
                  <div class="text-[11px] text-brand-600 truncate underline mt-0.5">${escapeHtml(u.url_link)}</div>
                </div>
              </div>
              <div class="flex items-center gap-2 flex-shrink-0">
                ${urlMeta.type.startsWith('g') ? `
                  <button onclick="window.openGoogleDrivePreview('${escapeHtml(u.url_link)}', '${escapeHtml((u.title || 'Google File').replace(/'/g, "\\'"))}')" class="px-3 py-1.5 bg-brand-50 hover:bg-brand-100 text-brand-700 font-bold text-xs rounded-xl transition">
                    👁️ In-App Preview
                  </button>
                ` : ''}
                <a href="${escapeHtml(u.url_link)}" target="_blank" rel="noopener noreferrer" class="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-xs rounded-xl transition flex items-center gap-1">
                  <span>Open URL</span> ↗
                </a>
              </div>
            </div>
          ` : ''}

          <!-- Reactions Bar & Threaded Replies -->
          <div class="mt-4 pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
            <div class="flex items-center gap-1.5">
              ${['👍', '❤️', '🚀', '🔥', '👏'].map(emoji => {
                const count = (u.reactions?.[emoji] || []).length;
                const hasReacted = (u.reactions?.[emoji] || []).includes(currentUid);
                return `
                  <button onclick="window.toggleUpdateReaction('${u.id}', '${emoji}')" class="px-2 py-1 rounded-xl text-xs transition flex items-center gap-1 ${hasReacted ? 'bg-brand-50 border border-brand-300 text-brand-700 font-bold' : 'bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100'}">
                    <span>${emoji}</span>
                    ${count > 0 ? `<span class="text-[10px] font-bold">${count}</span>` : ''}
                  </button>
                `;
              }).join('')}
            </div>

            <button onclick="window.toggleReplyThread('${u.id}')" class="text-xs font-bold text-slate-500 hover:text-navy-900 transition flex items-center gap-1">
              <span>💬</span> ${(u.replies || []).length} Replies
            </button>
          </div>

          <!-- Threaded Replies Section -->
          <div id="reply-thread-${u.id}" class="mt-3 pt-3 border-t border-slate-100 hidden space-y-3">
            <div class="space-y-2">
              ${(u.replies || []).map(r => `
                <div class="bg-slate-50 p-3 rounded-2xl border border-slate-100 text-xs">
                  <div class="flex items-center justify-between mb-1">
                    <span class="font-bold text-navy-900">${escapeHtml(r.author_name)}</span>
                    <span class="text-[10px] text-slate-400">${new Date(r.created_at).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })}</span>
                  </div>
                  <p class="text-slate-700">${parseTextFormatting(r.body)}</p>
                </div>
              `).join('')}
            </div>

            <form onsubmit="window.submitReply(event, '${u.id}')" class="flex gap-2">
              <input type="text" placeholder="Write a reply… (tags & URLs supported)" required class="flex-1 text-xs px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white">
              <button type="submit" class="px-3.5 py-2 bg-navy-900 hover:bg-navy-800 text-white font-bold text-xs rounded-xl shadow-sm transition">
                Reply
              </button>
            </form>
          </div>

        </div>
      `;
    }).join('');
  }

  // ─────────────────────────────────────────────
  // 4. RICH TEXT, TAGGING & DOCKED COMPOSER ACTIONS
  // ─────────────────────────────────────────────
  window.switchChannel = function (channelId) {
    currentActiveChannelId = channelId;
    mobileActiveView = 'feed';
    window.loadChannels();
  };

  window.toggleMobileChannelView = function (view) {
    mobileActiveView = view;
    const navCol = document.getElementById('channel-nav-column');
    const feedCol = document.getElementById('channel-feed-column');
    if (!navCol || !feedCol) {
      window.loadChannels();
      return;
    }
    if (view === 'channels') {
      navCol.classList.remove('hidden');
      navCol.classList.add('flex');
      feedCol.classList.add('hidden');
      feedCol.classList.remove('flex');
    } else {
      navCol.classList.add('hidden');
      navCol.classList.remove('flex');
      feedCol.classList.remove('hidden');
      feedCol.classList.add('flex');
    }
  };

  window.setStatusTab = function (tab) {
    activeStatusTab = tab;
    const ch = channelsList.find(c => c.id === currentActiveChannelId);
    window.loadChannels();
  };

  window.setTagFilter = function (tag) {
    activeTagFilter = tag;
    const ch = channelsList.find(c => c.id === currentActiveChannelId);
    renderChannelUpdatesFeed(ch, isCurrentAdmin());
  };

  window.toggleTagMenu = function () {
    const el = document.getElementById('quick-tag-menu');
    if (el) el.classList.toggle('hidden');
  };

  window.appendTag = function (tag) {
    const textarea = document.getElementById('docked-post-body');
    if (textarea) {
      textarea.value += (textarea.value.endsWith(' ') || !textarea.value ? '' : ' ') + tag + ' ';
      textarea.focus();
    }
    const el = document.getElementById('quick-tag-menu');
    if (el) el.classList.add('hidden');
  };

  window.toggleDockedUrlInput = function () {
    const el = document.getElementById('docked-url-container');
    if (el) {
      el.classList.toggle('hidden');
      if (!el.classList.contains('hidden')) {
        document.getElementById('docked-post-url')?.focus();
      }
    }
  };

  // Helper to insert markdown format tags around selection
  window.insertFormatting = function (prefix, suffix, defaultText) {
    const textarea = document.getElementById('docked-post-body') || document.getElementById('upd-body');
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;

    const selected = text.substring(start, end) || defaultText;
    const replacement = prefix + selected + suffix;

    textarea.value = text.substring(0, start) + replacement + text.substring(end);
    textarea.focus();
    textarea.setSelectionRange(start + prefix.length, start + prefix.length + selected.length);
  };

  // Submit message from the docked bottom composer (Draft or Send)
  window.submitDockedPost = function (status) {
    const bodyInput = document.getElementById('docked-post-body');
    const urlInput = document.getElementById('docked-post-url');
    if (!bodyInput) return;

    const body = bodyInput.value.trim();
    const url = urlInput ? urlInput.value.trim() : '';

    if (!body && !url) {
      if (typeof showToast === 'function') showToast('Please enter a message or URL link.', true);
      return;
    }

    // Extract tags from body (e.g. #announcement, #deliverable)
    const matchedTags = body.match(/#[a-zA-Z0-9_\-]+/g) || [];
    const tags = Array.from(new Set(matchedTags));

    const newPost = {
      id: 'upd_' + Date.now(),
      channel_id: currentActiveChannelId,
      author_id: window.currentUser?.id || 'admin',
      author_name: window.currentProfile?.full_name || window.currentUser?.email || 'Team Member',
      author_avatar: window.currentProfile?.avatar_url || '',
      author_role: window.currentProfile?.role || 'Member',
      title: '',
      body,
      tags,
      update_type: url ? 'deliverable' : 'general',
      status: status || 'published',
      is_pinned: false,
      url_link: url || null,
      reactions: {},
      replies: [],
      created_at: new Date().toISOString(),
      updated_at: null
    };

    channelUpdates.unshift(newPost);
    saveChannelsState();

    bodyInput.value = '';
    if (urlInput) urlInput.value = '';
    document.getElementById('docked-url-container')?.classList.add('hidden');

    if (typeof showToast === 'function') {
      showToast(status === 'draft' ? 'Message saved to Drafts! 📝' : 'Message sent to channel! 🚀');
    }

    const ch = channelsList.find(c => c.id === currentActiveChannelId);
    renderChannelUpdatesFeed(ch, isCurrentAdmin());
  };

  window.sendDraftNow = function (updateId) {
    const upd = channelUpdates.find(u => u.id === updateId);
    if (!upd) return;
    upd.status = 'published';
    upd.updated_at = new Date().toISOString();
    saveChannelsState();
    if (typeof showToast === 'function') showToast('Draft sent to channel! 🚀');
    const ch = channelsList.find(c => c.id === currentActiveChannelId);
    renderChannelUpdatesFeed(ch, isCurrentAdmin());
  };

  window.togglePinUpdate = function (updateId) {
    const upd = channelUpdates.find(u => u.id === updateId);
    if (!upd) return;
    upd.is_pinned = !upd.is_pinned;
    saveChannelsState();
    if (typeof showToast === 'function') showToast(upd.is_pinned ? 'Post pinned to top! 📌' : 'Post unpinned.');
    const ch = channelsList.find(c => c.id === currentActiveChannelId);
    renderChannelUpdatesFeed(ch, isCurrentAdmin());
  };

  // ─────────────────────────────────────────────
  // 5. EXPANDED MODAL POST COMPOSER (With Toolbar, Tags, URL Attachment & Draft)
  // ─────────────────────────────────────────────
  window.openPostUpdateModal = function (channelId) {
    const ch = channelsList.find(c => c.id === channelId) || channelsList[0];
    const modalTitle = document.getElementById('modal-title');
    const modalFields = document.getElementById('modal-fields');
    if (!modalTitle || !modalFields) return;

    modalTitle.innerHTML = `📢 Post to <span class="text-brand-600">#${escapeHtml(ch.name)}</span>`;
    modalFields.innerHTML = `
      <div class="space-y-4">
        <div>
          <label class="block text-xs font-bold text-slate-700 uppercase mb-1">Headline / Title (Optional)</label>
          <input type="text" id="upd-title" placeholder="e.g. Q4 Sprint Deliverable Review & Drive Link" class="w-full text-xs p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none">
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-bold text-slate-700 uppercase mb-1">Category</label>
            <select id="upd-type" class="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none">
              <option value="announcement">📢 Announcement</option>
              <option value="priority">⚡ Priority Update</option>
              <option value="deliverable">📁 URL Deliverable</option>
              <option value="general" selected>💬 Discussion / General</option>
            </select>
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-700 uppercase mb-1">Status (Send or Draft)</label>
            <select id="upd-status" class="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none">
              <option value="published" selected>🚀 Send / Publish Now</option>
              <option value="draft">📝 Save as Draft (Only you & admin see)</option>
            </select>
          </div>
        </div>

        <!-- Formatting Toolbar -->
        <div>
          <div class="flex items-center justify-between mb-1">
            <label class="block text-xs font-bold text-slate-700 uppercase">Message Content *</label>
            <div class="flex items-center gap-1 text-slate-500">
              <button type="button" onclick="window.insertFormatting('**', '**', 'bold text')" class="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 rounded text-xs font-bold">B</button>
              <button type="button" onclick="window.insertFormatting('*', '*', 'italic text')" class="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 rounded text-xs italic font-serif">I</button>
              <button type="button" onclick="window.insertFormatting('\`', '\`', 'code')" class="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 rounded text-xs font-mono">&lt;&gt;</button>
              <button type="button" onclick="window.insertFormatting('> ', '', 'quote')" class="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 rounded text-xs">“</button>
              <button type="button" onclick="window.insertFormatting('• ', '', 'item')" class="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 rounded text-xs">•</button>
            </div>
          </div>
          <textarea id="upd-body" rows="4" required placeholder="Write the update details, instructions, or meeting summary… (supports Markdown and @mentions)" class="w-full text-xs p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none"></textarea>
        </div>

        <!-- Tags Selector -->
        <div>
          <label class="block text-xs font-bold text-slate-700 uppercase mb-1">Tags (Click to add)</label>
          <div class="flex flex-wrap gap-1.5 p-2 bg-slate-50 border border-slate-200 rounded-xl">
            ${POPULAR_TAGS.map(tag => `
              <button type="button" onclick="window.insertFormatting('${tag} ', '', '')" class="pill bg-white hover:bg-brand-50 hover:text-brand-700 border border-slate-200 text-slate-700 text-[10px] font-semibold transition">
                + ${tag}
              </button>
            `).join('')}
          </div>
        </div>

        <!-- URL Attachment Only (NO FILE UPLOAD) -->
        <div>
          <label class="block text-xs font-bold text-slate-700 uppercase mb-1 flex items-center justify-between">
            <span>Attach URL Link (Strictly URL Only — No File Uploads)</span>
            <span class="text-[10px] text-brand-600 font-bold">Google Docs, Sheets, Drive, Figma, Loom</span>
          </label>
          <div class="relative">
            <span class="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-400">🔗</span>
            <input type="url" id="upd-url-link" placeholder="https://docs.google.com/... or https://drive.google.com/..." class="w-full text-xs pl-9 pr-3 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none">
          </div>
        </div>

        <input type="hidden" id="upd-channel-id" value="${ch.id}">
      </div>
    `;

    const submitBtn = document.querySelector('#modal-form [type="submit"]');
    if (submitBtn) {
      submitBtn.style.display = 'block';
      submitBtn.textContent = 'Submit / Save';
    }

    document.getElementById('action-modal').classList.remove('hidden');

    document.getElementById('modal-form').onsubmit = async function (e) {
      e.preventDefault();
      const channel_id = document.getElementById('upd-channel-id').value;
      const title = document.getElementById('upd-title').value.trim();
      const body = document.getElementById('upd-body').value.trim();
      const update_type = document.getElementById('upd-type').value;
      const status = document.getElementById('upd-status').value;
      const url_link = document.getElementById('upd-url-link').value.trim();

      const matchedTags = (body + ' ' + title).match(/#[a-zA-Z0-9_\-]+/g) || [];
      const tags = Array.from(new Set(matchedTags));

      const newUpdate = {
        id: 'upd_' + Date.now(),
        channel_id,
        author_id: window.currentUser?.id || 'admin',
        author_name: window.currentProfile?.full_name || window.currentUser?.email || 'Team Member',
        author_avatar: window.currentProfile?.avatar_url || '',
        author_role: window.currentProfile?.role || 'Member',
        title,
        body,
        tags,
        update_type,
        status,
        is_pinned: false,
        url_link: url_link || null,
        reactions: {},
        replies: [],
        created_at: new Date().toISOString(),
        updated_at: null
      };

      channelUpdates.unshift(newUpdate);
      saveChannelsState();

      if (typeof showToast === 'function') {
        showToast(status === 'draft' ? 'Update saved as Draft! 📝' : 'Update published to channel! 📢');
      }
      closeActionModal();
      window.loadChannels();
    };
  };

  // Edit Existing Post Modal
  window.openEditUpdateModal = function (updateId) {
    const upd = channelUpdates.find(u => u.id === updateId);
    if (!upd) return;

    const modalTitle = document.getElementById('modal-title');
    const modalFields = document.getElementById('modal-fields');
    if (!modalTitle || !modalFields) return;

    modalTitle.innerHTML = `✏️ Edit Post`;
    modalFields.innerHTML = `
      <div class="space-y-4">
        <div>
          <label class="block text-xs font-bold text-slate-700 uppercase mb-1">Headline / Title</label>
          <input type="text" id="upd-edit-title" value="${escapeHtml(upd.title || '')}" class="w-full text-xs p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none">
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-bold text-slate-700 uppercase mb-1">Category</label>
            <select id="upd-edit-type" class="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none">
              <option value="announcement" ${upd.update_type === 'announcement' ? 'selected' : ''}>📢 Announcement</option>
              <option value="priority" ${upd.update_type === 'priority' ? 'selected' : ''}>⚡ Priority Update</option>
              <option value="deliverable" ${upd.update_type === 'deliverable' ? 'selected' : ''}>📁 Deliverable</option>
              <option value="general" ${upd.update_type === 'general' ? 'selected' : ''}>💬 Discussion</option>
            </select>
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-700 uppercase mb-1">Status</label>
            <select id="upd-edit-status" class="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none">
              <option value="published" ${upd.status === 'published' ? 'selected' : ''}>🚀 Published</option>
              <option value="draft" ${upd.status === 'draft' ? 'selected' : ''}>📝 Draft</option>
            </select>
          </div>
        </div>

        <div>
          <label class="block text-xs font-bold text-slate-700 uppercase mb-1">Message Content *</label>
          <textarea id="upd-edit-body" rows="4" required class="w-full text-xs p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none">${escapeHtml(upd.body)}</textarea>
        </div>

        <!-- URL Attachment Only (NO FILE UPLOAD) -->
        <div>
          <label class="block text-xs font-bold text-slate-700 uppercase mb-1">Attached URL Link (No File Upload)</label>
          <input type="url" id="upd-edit-url" value="${escapeHtml(upd.url_link || '')}" placeholder="https://..." class="w-full text-xs p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none">
        </div>
      </div>
    `;

    const submitBtn = document.querySelector('#modal-form [type="submit"]');
    if (submitBtn) {
      submitBtn.style.display = 'block';
      submitBtn.textContent = 'Save Changes';
    }

    document.getElementById('action-modal').classList.remove('hidden');

    document.getElementById('modal-form').onsubmit = function (e) {
      e.preventDefault();
      upd.title = document.getElementById('upd-edit-title').value.trim();
      upd.body = document.getElementById('upd-edit-body').value.trim();
      upd.update_type = document.getElementById('upd-edit-type').value;
      upd.status = document.getElementById('upd-edit-status').value;
      upd.url_link = document.getElementById('upd-edit-url').value.trim() || null;
      upd.updated_at = new Date().toISOString();

      const matchedTags = (upd.body + ' ' + upd.title).match(/#[a-zA-Z0-9_\-]+/g) || [];
      upd.tags = Array.from(new Set(matchedTags));

      saveChannelsState();
      if (typeof showToast === 'function') showToast('Post updated successfully! 💾');
      closeActionModal();
      window.loadChannels();
    };
  };

  window.deleteUpdate = function (updateId) {
    if (!confirm('Are you sure you want to delete this post?')) return;
    channelUpdates = channelUpdates.filter(u => u.id !== updateId);
    saveChannelsState();
    if (typeof showToast === 'function') showToast('Post deleted! 🗑️');
    const ch = channelsList.find(c => c.id === currentActiveChannelId);
    renderChannelUpdatesFeed(ch, isCurrentAdmin());
  };

  window.toggleUpdateReaction = function (updateId, emoji) {
    const upd = channelUpdates.find(u => u.id === updateId);
    if (!upd) return;
    const uid = window.currentUser?.id || 'admin';
    if (!upd.reactions) upd.reactions = {};
    if (!upd.reactions[emoji]) upd.reactions[emoji] = [];

    const idx = upd.reactions[emoji].indexOf(uid);
    if (idx > -1) {
      upd.reactions[emoji].splice(idx, 1);
    } else {
      upd.reactions[emoji].push(uid);
    }
    saveChannelsState();
    const ch = channelsList.find(c => c.id === currentActiveChannelId);
    renderChannelUpdatesFeed(ch, isCurrentAdmin());
  };

  window.toggleReplyThread = function (updateId) {
    const el = document.getElementById(`reply-thread-${updateId}`);
    if (el) el.classList.toggle('hidden');
  };

  window.submitReply = function (e, updateId) {
    e.preventDefault();
    const input = e.target.querySelector('input');
    const val = input.value.trim();
    if (!val) return;

    const upd = channelUpdates.find(u => u.id === updateId);
    if (!upd) return;
    if (!upd.replies) upd.replies = [];

    upd.replies.push({
      id: 'rep_' + Date.now(),
      author_name: window.currentProfile?.full_name || window.currentUser?.email || 'Team Member',
      author_avatar: window.currentProfile?.avatar_url || '',
      body: val,
      created_at: new Date().toISOString()
    });

    saveChannelsState();
    input.value = '';
    const ch = channelsList.find(c => c.id === currentActiveChannelId);
    renderChannelUpdatesFeed(ch, isCurrentAdmin());
  };

  // ─────────────────────────────────────────────
  // 6. CHANNEL CREATION & MEMBERSHIP MODAL
  // ─────────────────────────────────────────────
  window.openCreateChannelModal = function () {
    const modalTitle = document.getElementById('modal-title');
    const modalFields = document.getElementById('modal-fields');
    if (!modalTitle || !modalFields) return;

    const profiles = JSON.parse(localStorage.getItem(PROFILES_LOCAL_KEY) || '[]') || [];

    modalTitle.innerHTML = `➕ Create New Channel`;
    modalFields.innerHTML = `
      <div class="space-y-4">
        <div>
          <label class="block text-xs font-bold text-slate-700 uppercase mb-1">Channel Name (slug) *</label>
          <div class="flex items-center">
            <span class="px-3 py-3 bg-slate-100 border border-r-0 border-slate-200 rounded-l-xl text-xs font-bold text-slate-500">#</span>
            <input type="text" id="ch-name" required placeholder="client-operations" class="w-full text-xs p-3 rounded-r-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none">
          </div>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-bold text-slate-700 uppercase mb-1">Display Title *</label>
            <input type="text" id="ch-display" required placeholder="Client Operations" class="w-full text-xs p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none">
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-700 uppercase mb-1">Icon / Emoji</label>
            <input type="text" id="ch-icon" value="💼" class="w-full text-xs p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none text-center">
          </div>
        </div>

        <div>
          <label class="block text-xs font-bold text-slate-700 uppercase mb-1">Channel Purpose & Description</label>
          <textarea id="ch-desc" rows="2" placeholder="Briefly describe what this channel is for…" class="w-full text-xs p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none"></textarea>
        </div>

        <div>
          <label class="block text-xs font-bold text-slate-700 uppercase mb-1">Privacy & Access</label>
          <select id="ch-privacy" class="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none" onchange="document.getElementById('ch-members-picker').style.display = this.value === 'private' ? 'block' : 'none'">
            <option value="public">🌐 Public (All organization members)</option>
            <option value="private">🔒 Private (Only assigned members)</option>
          </select>
        </div>

        <div id="ch-members-picker" style="display:none;" class="space-y-2 bg-slate-50 p-3 rounded-2xl border border-slate-200">
          <label class="block text-xs font-bold text-navy-900">Assign Members to this Private Channel</label>
          <div class="max-h-36 overflow-y-auto space-y-1">
            ${profiles.map(p => `
              <label class="flex items-center gap-2 p-1.5 hover:bg-white rounded-lg cursor-pointer text-xs">
                <input type="checkbox" name="ch-assign-members" value="${p.id}" class="rounded text-brand-500 focus:ring-brand-500">
                <span class="font-semibold text-slate-700">${escapeHtml(p.full_name || p.email)}</span>
                <span class="text-[10px] text-slate-400">(${escapeHtml(p.role || 'Member')})</span>
              </label>
            `).join('')}
          </div>
        </div>
      </div>
    `;

    document.getElementById('action-modal').classList.remove('hidden');

    document.getElementById('modal-form').onsubmit = function (e) {
      e.preventDefault();
      const rawName = document.getElementById('ch-name').value.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '-');
      const display_name = document.getElementById('ch-display').value.trim();
      const icon = document.getElementById('ch-icon').value.trim() || '💬';
      const description = document.getElementById('ch-desc').value.trim();
      const is_private = document.getElementById('ch-privacy').value === 'private';
      const selectedMemberIds = Array.from(document.querySelectorAll('input[name="ch-assign-members"]:checked')).map(el => el.value);

      const newCh = {
        id: 'ch_' + Date.now(),
        name: rawName,
        display_name,
        description,
        icon,
        is_private,
        member_ids: selectedMemberIds
      };

      channelsList.push(newCh);
      channelMemberships[newCh.id] = selectedMemberIds;
      saveChannelsState();

      if (typeof showToast === 'function') showToast(`Channel #${newCh.name} created! 🎉`);
      closeActionModal();
      currentActiveChannelId = newCh.id;
      window.loadChannels();
    };
  };

  window.openChannelSettingsModal = function (channelId) {
    const ch = channelsList.find(c => c.id === channelId);
    if (!ch) return;

    const modalTitle = document.getElementById('modal-title');
    const modalFields = document.getElementById('modal-fields');
    if (!modalTitle || !modalFields) return;

    const profiles = JSON.parse(localStorage.getItem(PROFILES_LOCAL_KEY) || '[]') || [];
    const assigned = channelMemberships[ch.id] || ch.member_ids || [];

    modalTitle.innerHTML = `⚙️ Manage Members: <span class="text-brand-600">#${escapeHtml(ch.name)}</span>`;
    modalFields.innerHTML = `
      <div class="space-y-4">
        <div>
          <label class="block text-xs font-bold text-slate-700 uppercase mb-1">Channel Privacy</label>
          <div class="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold">
            ${ch.is_private ? '🔒 Private (Restricted to assigned members below)' : '🌐 Public (Accessible to everyone in organization)'}
          </div>
        </div>

        <div>
          <div class="flex items-center justify-between mb-2">
            <label class="block text-xs font-bold text-slate-700 uppercase">Assigned Team Members (${assigned.length})</label>
            <button type="button" onclick="document.querySelectorAll('input[name=ch-setting-member]').forEach(c=>c.checked=true)" class="text-[11px] font-bold text-brand-600 hover:underline">Select All</button>
          </div>
          <div class="max-h-56 overflow-y-auto space-y-1.5 bg-slate-50 p-3 rounded-2xl border border-slate-200">
            ${profiles.map(p => {
              const isChecked = assigned.includes(p.id) || !ch.is_private;
              return `
                <label class="flex items-center justify-between p-2 bg-white rounded-xl border border-slate-100 cursor-pointer text-xs hover:border-brand-200 transition">
                  <div class="flex items-center gap-2">
                    <input type="checkbox" name="ch-setting-member" value="${p.id}" ${isChecked ? 'checked' : ''} class="rounded text-brand-500 focus:ring-brand-500">
                    <span class="font-bold text-navy-900">${escapeHtml(p.full_name || p.email)}</span>
                  </div>
                  <span class="pill bg-slate-100 text-slate-600 text-[10px]">${escapeHtml(p.role || 'Member')}</span>
                </label>
              `;
            }).join('')}
          </div>
        </div>

        <input type="hidden" id="setting-ch-id" value="${ch.id}">
      </div>
    `;

    document.getElementById('action-modal').classList.remove('hidden');

    document.getElementById('modal-form').onsubmit = function (e) {
      e.preventDefault();
      const updatedMemberIds = Array.from(document.querySelectorAll('input[name="ch-setting-member"]:checked')).map(el => el.value);

      ch.member_ids = updatedMemberIds;
      channelMemberships[ch.id] = updatedMemberIds;
      saveChannelsState();

      if (typeof showToast === 'function') showToast('Channel members updated! 👥');
      closeActionModal();
      window.loadChannels();
    };
  };

  // ─────────────────────────────────────────────
  // 7. IN-APP GOOGLE DRIVE PREVIEW MODAL
  // ─────────────────────────────────────────────
  window.openGoogleDrivePreview = function (url, title) {
    if (!url) return;
    let previewUrl = url;

    if (url.includes('/edit') || url.includes('/view')) {
      previewUrl = url.replace(/\/edit.*$/, '/preview').replace(/\/view.*$/, '/preview');
    } else if (url.includes('drive.google.com/file/d/')) {
      const match = url.match(/file\/d\/([a-zA-Z0-9_-]+)/);
      if (match) previewUrl = `https://drive.google.com/file/d/${match[1]}/preview`;
    }

    const modalTitle = document.getElementById('modal-title');
    const modalFields = document.getElementById('modal-fields');
    if (!modalTitle || !modalFields) {
      window.open(url, '_blank');
      return;
    }

    modalTitle.innerHTML = `📁 File Preview: <span class="text-brand-600">${escapeHtml(title || 'Google Drive File')}</span>`;
    modalFields.innerHTML = `
      <div class="space-y-3">
        <div class="flex items-center justify-between text-xs pb-2 border-b border-slate-100">
          <span class="text-slate-500 font-semibold truncate max-w-sm">Source: ${escapeHtml(url)}</span>
          <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" class="px-3 py-1 bg-brand-50 hover:bg-brand-100 text-brand-700 font-bold rounded-lg transition">
            Open in Google Tab ↗
          </a>
        </div>
        <div class="rounded-2xl overflow-hidden border border-slate-200 bg-slate-50 h-[480px]">
          <iframe src="${escapeHtml(previewUrl)}" class="w-full h-full" allow="autoplay" frameborder="0"></iframe>
        </div>
      </div>
    `;

    document.getElementById('action-modal').classList.remove('hidden');
    const submitBtn = document.querySelector('#modal-form [type="submit"]');
    if (submitBtn) submitBtn.style.display = 'none';
  };

  // ─────────────────────────────────────────────
  // 8. USER MANAGEMENT (Delete, Edit, Save, Draft)
  // ─────────────────────────────────────────────
  window.deleteUser = async function (userId, userName) {
    if (window.currentUser && window.currentUser.id === userId) {
      alert("You cannot delete your own active administrator account.");
      return;
    }

    const confirmMsg = `Are you sure you want to delete user "${userName || 'this member'}"?\n\nThis will remove their profile, assigned tasks, and channel access. This action cannot be undone.`;
    if (!confirm(confirmMsg)) return;

    try {
      if (window.sbClient) {
        await window.sbClient.from('profiles').delete().eq('id', userId);
      }
    } catch (e) {}

    try {
      const profs = JSON.parse(localStorage.getItem(PROFILES_LOCAL_KEY) || '[]');
      const filtered = profs.filter(p => p.id !== userId);
      localStorage.setItem(PROFILES_LOCAL_KEY, JSON.stringify(filtered));
    } catch (e) {}

    Object.keys(channelMemberships).forEach(chId => {
      channelMemberships[chId] = (channelMemberships[chId] || []).filter(id => id !== userId);
    });
    channelsList.forEach(ch => {
      ch.member_ids = (ch.member_ids || []).filter(id => id !== userId);
    });
    saveChannelsState();

    if (typeof showToast === 'function') {
      showToast(`User "${userName || 'Member'}" was successfully deleted. 🗑️`);
    }

    if (typeof loadTeam === 'function') loadTeam();
  };

  // Enhanced Edit User Modal
  window.openEditUserModal = async function (userId) {
    const sb = window.sbClient;
    let user = null;

    try {
      if (sb) {
        const { data } = await sb.from('profiles').select('*').eq('id', userId).single();
        user = data;
      }
    } catch (e) {}

    if (!user) {
      const cached = JSON.parse(localStorage.getItem(PROFILES_LOCAL_KEY) || '[]');
      user = cached.find(p => p.id === userId);
    }
    if (!user) return;

    const modal = document.getElementById('action-modal');
    document.getElementById('modal-title').textContent = `Manage User: ${user.full_name || user.email}`;

    const roles = window.allRoles || [];
    const roleOptions = `<option value="">No Role</option>` +
      roles.map(r => `<option value="${r.id}" ${r.id === user.role_id ? 'selected' : ''}>${escapeHtml(r.name)}</option>`).join('');

    document.getElementById('modal-fields').innerHTML = `
      <div class="space-y-4">
        <div>
          <label class="block text-xs font-bold text-slate-600 mb-1">Full Name *</label>
          <input id="eu-name" type="text" required value="${escapeHtml(user.full_name || '')}" class="w-full text-xs p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none">
        </div>

        <div>
          <label class="block text-xs font-bold text-slate-600 mb-1">Email Address</label>
          <input type="text" disabled value="${escapeHtml(user.email)}" class="w-full text-xs p-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-500 cursor-not-allowed">
        </div>

        <div class="grid grid-cols-3 gap-3">
          <div>
            <label class="block text-xs font-bold text-slate-600 mb-1">Role / Department</label>
            <select id="eu-role-id" class="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none">
              ${roleOptions}
            </select>
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-600 mb-1">Access Level</label>
            <select id="eu-access" class="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none">
              <option value="Member" ${user.access_level === 'Member' ? 'selected' : ''}>Member</option>
              <option value="Admin" ${user.access_level === 'Admin' ? 'selected' : ''}>Admin</option>
            </select>
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-600 mb-1">Account Status</label>
            <select id="eu-status" class="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none">
              <option value="active" ${user.status !== 'draft' && user.status !== 'inactive' ? 'selected' : ''}>🟢 Active</option>
              <option value="draft" ${user.status === 'draft' ? 'selected' : ''}>📝 Draft / Pending</option>
              <option value="inactive" ${user.status === 'inactive' ? 'selected' : ''}>⏸️ Inactive</option>
            </select>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-bold text-slate-600 mb-1">Job Title</label>
            <input id="eu-title" type="text" value="${escapeHtml(user.role || '')}" class="w-full text-xs p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none">
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-600 mb-1">Phone Number</label>
            <input id="eu-phone" type="tel" value="${escapeHtml(user.phone || '')}" class="w-full text-xs p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none">
          </div>
        </div>

        <div>
          <label class="block text-xs font-bold text-slate-700 uppercase mb-1.5">Assigned Channels</label>
          <div class="grid grid-cols-2 gap-2 bg-slate-50 p-3 rounded-2xl border border-slate-200 max-h-40 overflow-y-auto">
            ${channelsList.map(ch => {
              const isChecked = (channelMemberships[ch.id] || ch.member_ids || []).includes(user.id);
              return `
                <label class="flex items-center gap-2 p-1.5 bg-white rounded-lg border border-slate-100 cursor-pointer text-xs">
                  <input type="checkbox" name="eu-channels" value="${ch.id}" ${isChecked ? 'checked' : ''} class="rounded text-brand-500 focus:ring-brand-500">
                  <span class="font-bold text-navy-900">${ch.icon} #${ch.name}</span>
                </label>
              `;
            }).join('')}
          </div>
        </div>

        <div class="pt-3 border-t border-slate-100 flex items-center justify-between">
          <button type="button" onclick="closeActionModal(); window.deleteUser('${user.id}', '${escapeHtml((user.full_name || user.email).replace(/'/g, "\\'"))}')" class="px-3 py-2 bg-red-50 hover:bg-red-100 text-red-600 font-bold text-xs rounded-xl transition flex items-center gap-1">
            <span>🗑️</span> Delete User
          </button>
          <span class="text-[10px] text-slate-400">Permanently removes member from workspace</span>
        </div>
      </div>
    `;

    const submitBtn = document.querySelector('#modal-form [type="submit"]');
    if (submitBtn) {
      submitBtn.style.display = 'block';
      submitBtn.textContent = 'Save Changes';
    }

    modal.classList.remove('hidden');

    document.getElementById('modal-form').onsubmit = async function (e) {
      e.preventDefault();
      const full_name = document.getElementById('eu-name').value.trim();
      const role_id = document.getElementById('eu-role-id').value || null;
      const access_level = document.getElementById('eu-access').value;
      const status = document.getElementById('eu-status').value;
      const role = document.getElementById('eu-title').value.trim() || 'Member';
      const phone = document.getElementById('eu-phone').value.trim();

      const checkedChannelIds = Array.from(document.querySelectorAll('input[name="eu-channels"]:checked')).map(el => el.value);
      channelsList.forEach(ch => {
        if (!channelMemberships[ch.id]) channelMemberships[ch.id] = ch.member_ids || [];
        const hasUser = channelMemberships[ch.id].includes(user.id);
        const shouldHave = checkedChannelIds.includes(ch.id);
        if (shouldHave && !hasUser) {
          channelMemberships[ch.id].push(user.id);
          ch.member_ids.push(user.id);
        } else if (!shouldHave && hasUser) {
          channelMemberships[ch.id] = channelMemberships[ch.id].filter(id => id !== user.id);
          ch.member_ids = ch.member_ids.filter(id => id !== user.id);
        }
      });
      saveChannelsState();

      try {
        if (sb) {
          await sb.from('profiles').update({
            full_name, role_id, access_level, role, phone, status
          }).eq('id', user.id);
        }
      } catch (err) {}

      const cached = JSON.parse(localStorage.getItem(PROFILES_LOCAL_KEY) || '[]');
      const idx = cached.findIndex(p => p.id === user.id);
      if (idx > -1) {
        cached[idx] = { ...cached[idx], full_name, role_id, access_level, role, phone, status };
        localStorage.setItem(PROFILES_LOCAL_KEY, JSON.stringify(cached));
      }

      if (typeof showToast === 'function') showToast('User & channel permissions updated! 💾');
      closeActionModal();
      if (typeof resetModalSubmit === 'function') resetModalSubmit();
      if (typeof loadTeam === 'function') loadTeam();
    };
  };

  // Enhanced Add User Modal
  window.openAddUserModal = function () {
    const modal = document.getElementById('action-modal');
    document.getElementById('modal-title').textContent = 'Add New Team Member';

    const roles = window.allRoles || [];
    const roleOptions = `<option value="">No Specific Role</option>` +
      roles.map(r => `<option value="${r.id}">${escapeHtml(r.name)}</option>`).join('');

    document.getElementById('modal-fields').innerHTML = `
      <div class="space-y-4">
        <div>
          <label class="block text-xs font-bold text-slate-600 mb-1">Full Name *</label>
          <input id="u-name" type="text" required placeholder="Jane Doe" class="w-full text-xs p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none">
        </div>
        <div>
          <label class="block text-xs font-bold text-slate-600 mb-1">Email Address *</label>
          <input id="u-email" type="email" required placeholder="jane@nodaar.com" class="w-full text-xs p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none">
        </div>
        <div>
          <label class="block text-xs font-bold text-slate-600 mb-1">Temporary Password *</label>
          <input id="u-password" type="password" required value="Nodaar@2026" placeholder="Min 6 characters" class="w-full text-xs p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none">
          <span class="text-[10px] text-slate-400">Share this password with the member to sign in.</span>
        </div>
        <div class="grid grid-cols-3 gap-3">
          <div>
            <label class="block text-xs font-bold text-slate-600 mb-1">Assigned Role</label>
            <select id="u-role-id" class="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none">
              ${roleOptions}
            </select>
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-600 mb-1">Access Level</label>
            <select id="u-access" class="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none">
              <option value="Member">Member</option>
              <option value="Admin">Admin</option>
            </select>
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-600 mb-1">Creation Status</label>
            <select id="u-status" class="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none">
              <option value="active">🟢 Active</option>
              <option value="draft">📝 Save as Draft</option>
            </select>
          </div>
        </div>
        <div>
          <label class="block text-xs font-bold text-slate-600 mb-1">Job Title</label>
          <input id="u-title" type="text" placeholder="e.g. Frontend Engineer, Designer" class="w-full text-xs p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:outline-none">
        </div>

        <div>
          <label class="block text-xs font-bold text-slate-700 uppercase mb-1">Assign to Channels</label>
          <div class="grid grid-cols-2 gap-2 bg-slate-50 p-3 rounded-2xl border border-slate-200 max-h-36 overflow-y-auto">
            ${channelsList.map(ch => `
              <label class="flex items-center gap-2 p-1.5 bg-white rounded-lg border border-slate-100 cursor-pointer text-xs">
                <input type="checkbox" name="nu-channels" value="${ch.id}" ${!ch.is_private ? 'checked' : ''} class="rounded text-brand-500 focus:ring-brand-500">
                <span class="font-bold text-navy-900">${ch.icon} #${ch.name}</span>
              </label>
            `).join('')}
          </div>
        </div>
      </div>
    `;

    const submitBtn = document.querySelector('#modal-form [type="submit"]');
    if (submitBtn) {
      submitBtn.style.display = 'block';
      submitBtn.textContent = 'Create User';
    }

    modal.classList.remove('hidden');

    document.getElementById('modal-form').onsubmit = async function (e) {
      e.preventDefault();
      const btn = e.target.querySelector('[type="submit"]');
      btn.disabled = true; btn.textContent = 'Saving user…';

      const full_name = document.getElementById('u-name').value.trim();
      const email = document.getElementById('u-email').value.trim();
      const password = document.getElementById('u-password').value.trim();
      const role_id = document.getElementById('u-role-id').value || null;
      const access_level = document.getElementById('u-access').value;
      const status = document.getElementById('u-status').value;
      const selectedRole = (window.allRoles || []).find(r => r.id === role_id);
      const job_title = document.getElementById('u-title').value.trim() || (selectedRole ? selectedRole.name : 'Member');
      const assignedChannels = Array.from(document.querySelectorAll('input[name="nu-channels"]:checked')).map(el => el.value);

      const newUserId = 'usr_' + Date.now();

      assignedChannels.forEach(chId => {
        if (!channelMemberships[chId]) channelMemberships[chId] = [];
        channelMemberships[chId].push(newUserId);
      });
      saveChannelsState();

      try {
        const sbUrl = window.SB_URL || window.CONFIG?.SUPABASE_URL || 'https://xzrczuoxlujzmztkupbz.supabase.co';
        const sbKey = window.SB_KEY || window.CONFIG?.SUPABASE_ANON_KEY || 'sb_publishable_rmA0mlX3rpylvgJ47uBktA_yv2085CN';
        if (window.supabase) {
          const tempClient = window.supabase.createClient(sbUrl, sbKey, {
            auth: { persistSession: false, autoRefreshToken: false }
          });
          const { data: authData } = await tempClient.auth.signUp({
            email, password, options: { data: { full_name, role: job_title, access_level, status } }
          });
          const finalUid = authData?.user?.id || newUserId;

          if (window.sbClient) {
            await window.sbClient.from('profiles').upsert({
              id: finalUid, email, full_name, role: job_title, role_id, access_level, status
            });
          }
        }
      } catch (err) {}

      const cached = JSON.parse(localStorage.getItem(PROFILES_LOCAL_KEY) || '[]');
      cached.push({
        id: newUserId,
        email,
        full_name,
        role: job_title,
        role_id,
        access_level,
        status,
        roles: selectedRole ? { name: selectedRole.name, color: selectedRole.color } : null
      });
      localStorage.setItem(PROFILES_LOCAL_KEY, JSON.stringify(cached));

      if (typeof showToast === 'function') {
        showToast(status === 'draft' ? `Draft user ${full_name} saved! 📝` : `User ${full_name} created successfully! 🎉`);
      }
      closeActionModal();
      if (typeof resetModalSubmit === 'function') resetModalSubmit();
      if (typeof loadTeam === 'function') loadTeam();
    };
  };

  // ─────────────────────────────────────────────
  // 9. ENHANCED LOADTEAM
  // ─────────────────────────────────────────────
  window.loadTeam = async function () {
    const tableBody = document.getElementById('team-table-body');
    const mobileCards = document.getElementById('team-cards-mobile');
    if (!tableBody && !mobileCards) return;

    loadChannelsState();

    let remoteTeam = [];
    try {
      if (window.sbClient) {
        const { data } = await window.sbClient.from('profiles').select('*, roles:role_id(name,color)').order('full_name');
        remoteTeam = data || [];
      }
    } catch (e) {}

    const localTeam = JSON.parse(localStorage.getItem(PROFILES_LOCAL_KEY) || '[]') || [];
    const profMap = new Map();
    localTeam.forEach(p => { if (p && p.id) profMap.set(p.id, p); });
    remoteTeam.forEach(p => { if (p && p.id) profMap.set(p.id, p); });
    const team = Array.from(profMap.values());
    localStorage.setItem(PROFILES_LOCAL_KEY, JSON.stringify(team));

    const countEl = document.getElementById('team-count-text');
    if (countEl) countEl.textContent = `Team Directory (${team.length} Members)`;

    const isAdmin = Boolean(
      window.currentProfile?.access_level === 'Admin' ||
      (typeof currentProfile !== 'undefined' && currentProfile?.access_level === 'Admin') ||
      window.currentUser?.email === 'nodaarltd@gmail.com' ||
      (typeof currentUser !== 'undefined' && currentUser?.email === 'nodaarltd@gmail.com')
    );
    const currentUid = window.currentUser?.id || (typeof currentUser !== 'undefined' && currentUser?.id);

    const teamAddUserBtn = document.getElementById('team-add-user-btn');
    if (teamAddUserBtn) {
      if (isAdmin) teamAddUserBtn.classList.remove('hidden');
      else teamAddUserBtn.classList.add('hidden');
    }

    if (team.length === 0) {
      if (tableBody) tableBody.innerHTML = `<tr><td colspan="6" class="py-8 text-center text-xs text-slate-400">No team profiles found.</td></tr>`;
      if (mobileCards) mobileCards.innerHTML = `<div class="py-8 text-center text-xs text-slate-400">No team profiles found.</div>`;
      return;
    }

    // Render Desktop Table Rows
    if (tableBody) {
      tableBody.innerHTML = team.map(u => {
        const name = u.full_name || u.email || 'Member';
        const initials = name.charAt(0).toUpperCase();
        const userIsAdmin = u.access_level === 'Admin';
        const isDraft = u.status === 'draft';
        const isInactive = u.status === 'inactive';
        const isSelf = currentUid && u.id === currentUid;
        const canEdit = isAdmin || isSelf;
        const canDelete = isAdmin && !isSelf;
        const cleanPhone = (u.phone || '').replace(/[^0-9+]/g, '');
        const waLink = cleanPhone ? `https://wa.me/${cleanPhone.replace('+', '')}` : null;

        const roleTag = u.roles
          ? `<span class="pill" style="background:${u.roles.color}22;color:${u.roles.color};border:1px solid ${u.roles.color}44;">${escapeHtml(u.roles.name)}</span>`
          : `<span class="text-slate-400 text-xs font-semibold">${escapeHtml(u.role || 'Member')}</span>`;

        const statusPill = isDraft
          ? `<span class="pill bg-amber-50 text-amber-700 border border-amber-200 text-xs">📝 Draft</span>`
          : isInactive
          ? `<span class="pill bg-slate-100 text-slate-600 border border-slate-200 text-xs">⏸️ Inactive</span>`
          : `<span class="pill bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs">🟢 Active</span>`;

        const assignedChannels = channelsList.filter(ch => {
          const ids = channelMemberships[ch.id] || ch.member_ids || [];
          return ids.includes(u.id);
        });

        return `
          <tr class="hover:bg-slate-50/70 transition">
            <td class="py-3 px-4">
              <div class="flex items-center gap-3">
                <div class="w-9 h-9 rounded-xl overflow-hidden flex-shrink-0 shadow-sm">
                  ${u.avatar_url
                    ? `<img src="${u.avatar_url}" class="w-full h-full object-cover">`
                    : `<div class="w-full h-full bg-gradient-to-tr from-brand-500 to-amber-400 text-white font-black text-sm flex items-center justify-center">${initials}</div>`}
                </div>
                <div>
                  <div class="font-bold text-navy-900 text-sm flex items-center gap-1.5">
                    <span>${escapeHtml(name)}</span>
                    ${statusPill}
                  </div>
                  <div class="text-xs text-slate-400">${escapeHtml(u.email)}</div>
                </div>
              </div>
            </td>
            <td class="py-3 px-4">${roleTag}</td>
            <td class="py-3 px-4">
              ${userIsAdmin ? '<span class="pill bg-purple-100 text-purple-700 border border-purple-200 text-xs">Admin</span>' : '<span class="pill bg-slate-100 text-slate-600 text-xs">Member</span>'}
            </td>
            <td class="py-3 px-4">
              <div class="flex flex-wrap gap-1 max-w-[180px]">
                ${assignedChannels.length > 0 ? assignedChannels.map(c => `
                  <span class="pill bg-slate-100 text-slate-700 text-xs font-semibold">#${escapeHtml(c.name)}</span>
                `).join('') : '<span class="text-slate-300 text-xs">—</span>'}
              </div>
            </td>
            <td class="py-3 px-4 text-slate-600 font-medium text-xs">
              ${u.phone ? `
                <div class="flex items-center gap-1.5">
                  <span>📞 ${escapeHtml(u.phone)}</span>
                  ${waLink ? `<a href="${waLink}" target="_blank" rel="noopener" class="text-emerald-600 hover:text-emerald-700 text-xs font-bold" title="WhatsApp">💬</a>` : ''}
                </div>
              ` : '<span class="text-slate-300 text-xs">—</span>'}
            </td>
            <td class="py-3 px-4 text-right">
              <div class="flex items-center justify-end gap-1.5">
                ${waLink ? `
                  <a href="${waLink}" target="_blank" rel="noopener" class="px-2.5 py-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-xl transition inline-flex items-center gap-1" title="WhatsApp Message">
                    <span>💬</span>
                  </a>
                ` : ''}
                <a href="mailto:${escapeHtml(u.email)}" class="px-2.5 py-1.5 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-xl transition inline-flex items-center gap-1" title="Send Email">
                  <span>✉️</span>
                </a>
                ${canEdit ? `
                  <button onclick="window.openEditUserModal('${u.id}')" class="px-2.5 py-1.5 text-xs font-bold text-brand-700 bg-brand-50 hover:bg-brand-100 rounded-xl transition inline-flex items-center gap-1" title="Edit User">
                    <span>✏️</span><span>Edit</span>
                  </button>
                ` : ''}
                ${canDelete ? `
                  <button onclick="window.deleteUser('${u.id}', '${escapeHtml(name.replace(/'/g, "\\'"))}')" class="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition inline-flex items-center justify-center" title="Delete User">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                  </button>
                ` : ''}
              </div>
            </td>
          </tr>
        `;
      }).join('');
    }

    // Render Mobile Cards View
    if (mobileCards) {
      mobileCards.innerHTML = team.map(u => {
        const name = u.full_name || u.email || 'Member';
        const initials = name.charAt(0).toUpperCase();
        const userIsAdmin = u.access_level === 'Admin';
        const isDraft = u.status === 'draft';
        const isInactive = u.status === 'inactive';
        const isSelf = currentUid && u.id === currentUid;
        const canEdit = isAdmin || isSelf;
        const canDelete = isAdmin && !isSelf;
        const cleanPhone = (u.phone || '').replace(/[^0-9+]/g, '');
        const waLink = cleanPhone ? `https://wa.me/${cleanPhone.replace('+', '')}` : null;

        const roleTag = u.roles
          ? `<span class="pill" style="background:${u.roles.color}22;color:${u.roles.color};border:1px solid ${u.roles.color}44;">${escapeHtml(u.roles.name)}</span>`
          : `<span class="text-slate-500 font-semibold text-xs">${escapeHtml(u.role || 'Member')}</span>`;

        const statusPill = isDraft
          ? `<span class="pill bg-amber-50 text-amber-700 border border-amber-200 text-xs">📝 Draft</span>`
          : isInactive
          ? `<span class="pill bg-slate-100 text-slate-600 border border-slate-200 text-xs">⏸️ Inactive</span>`
          : `<span class="pill bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs">🟢 Active</span>`;

        const assignedChannels = channelsList.filter(ch => {
          const ids = channelMemberships[ch.id] || ch.member_ids || [];
          return ids.includes(u.id);
        });

        return `
          <div class="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm space-y-3">
            <div class="flex items-start justify-between gap-3">
              <div class="flex items-center gap-3 min-w-0">
                <div class="w-11 h-11 rounded-2xl overflow-hidden flex-shrink-0 shadow-sm">
                  ${u.avatar_url
                    ? `<img src="${u.avatar_url}" class="w-full h-full object-cover">`
                    : `<div class="w-full h-full bg-gradient-to-tr from-brand-500 to-amber-400 text-white font-black text-base flex items-center justify-center">${initials}</div>`}
                </div>
                <div class="min-w-0">
                  <div class="font-extrabold text-navy-900 text-sm flex items-center gap-1.5 truncate">
                    <span class="truncate">${escapeHtml(name)}</span>
                  </div>
                  <div class="text-xs text-slate-500 truncate mt-0.5">${escapeHtml(u.email)}</div>
                </div>
              </div>
              <div class="flex flex-col items-end gap-1 flex-shrink-0">
                ${userIsAdmin ? '<span class="pill bg-purple-100 text-purple-700 border border-purple-200 text-xs font-bold">Admin</span>' : '<span class="pill bg-slate-100 text-slate-600 text-xs font-bold">Member</span>'}
                ${statusPill}
              </div>
            </div>

            <div class="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs">
              <div class="flex items-center gap-1 text-slate-600">
                <span class="font-bold text-slate-400">Role:</span>
                ${roleTag}
              </div>
              ${u.phone ? `
                <div class="flex items-center gap-1 text-slate-600">
                  <span class="font-bold text-slate-400">Phone:</span>
                  <a href="tel:${escapeHtml(u.phone)}" class="text-brand-600 font-semibold hover:underline">${escapeHtml(u.phone)}</a>
                </div>
              ` : ''}
            </div>

            ${assignedChannels.length > 0 ? `
              <div class="flex flex-wrap items-center gap-1.5 pt-1 text-xs">
                <span class="text-slate-400 text-xs font-bold mr-0.5">Channels:</span>
                ${assignedChannels.map(c => `
                  <span class="pill bg-slate-100 text-slate-700 text-xs font-semibold">#${escapeHtml(c.name)}</span>
                `).join('')}
              </div>
            ` : ''}

            <!-- Mobile Actions Row (Always Available!) -->
            <div class="flex items-center justify-between gap-2 pt-2.5 border-t border-slate-100">
              <div class="flex items-center gap-2 flex-wrap">
                ${waLink ? `
                  <a href="${waLink}" target="_blank" rel="noopener" class="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-bold rounded-xl transition flex items-center gap-1">
                    <span>💬</span> WhatsApp
                  </a>
                ` : ''}
                <a href="mailto:${escapeHtml(u.email)}" class="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold rounded-xl transition flex items-center gap-1">
                  <span>✉️</span> Email
                </a>
              </div>
              <div class="flex items-center gap-1.5">
                ${canEdit ? `
                  <button onclick="window.openEditUserModal('${u.id}')" class="px-3 py-1.5 bg-brand-50 hover:bg-brand-100 text-brand-700 text-xs font-bold rounded-xl transition flex items-center gap-1">
                    <span>✏️</span> Edit
                  </button>
                ` : ''}
                ${canDelete ? `
                  <button onclick="window.deleteUser('${u.id}', '${escapeHtml(name.replace(/'/g, "\\'"))}')" class="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition flex items-center justify-center" title="Delete User">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                  </button>
                ` : ''}
              </div>
            </div>
          </div>
        `;
      }).join('');
    }
  };

  // Register Navigation TAB_META
  if (typeof window.TAB_META !== 'undefined') {
    window.TAB_META['channels'] = {
      title: 'Channels & Broadcasts',
      sub: 'Microsoft Teams style department feeds, URL deliverables & draft messages',
      btn: ''
    };
  }

  // Hook into loadTabData
  const prevLoadTabData = window.loadTabData;
  window.loadTabData = async function (tab) {
    if (tab === 'channels') {
      await window.loadChannels();
    } else if (prevLoadTabData) {
      await prevLoadTabData(tab);
    }
  };

  loadChannelsState();
})();
