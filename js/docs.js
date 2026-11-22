/* ============================================================
   NODAAR TEAM HUB — Docs (Word-style document editor)
   Clean document workspace: list of docs + rich editor
   (bold/italic/underline/strike, H1-H3, lists, quote, link,
   clear formatting). Autosaves to localStorage; Supabase-ready.
   ============================================================ */
(function () {
  const KEY = 'nodaar_docs_v1';
  let docs = [];
  let activeId = null;
  let saveTimer = null;

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      docs = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(docs)) docs = [];
    } catch { docs = []; }
    if (docs.length && !docs.find(d => d.id === activeId)) activeId = docs[0].id;
    if (!docs.length) activeId = null;
  }
  function save() {
    localStorage.setItem(KEY, JSON.stringify(docs));
  }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function uid() {
    return 'doc_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }
  function now() { return new Date().toISOString(); }

  function createDoc() {
    const d = { id: uid(), title: 'Untitled document', html: '', created_at: now(), updated_at: now() };
    docs.unshift(d);
    activeId = d.id;
    save();
    render();
  }
  function deleteDoc(id) {
    if (!confirm('Delete this document permanently?')) return;
    docs = docs.filter(d => d.id !== id);
    if (activeId === id) activeId = docs[0] ? docs[0].id : null;
    save();
    render();
  }
  function renameDoc(id, title) {
    const d = docs.find(x => x.id === id);
    if (d) { d.title = title.trim() || 'Untitled document'; d.updated_at = now(); save(); renderList(); }
  }
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const ed = document.getElementById('doc-editor');
      const d = docs.find(x => x.id === activeId);
      if (ed && d) {
        d.html = ed.innerHTML;
        d.updated_at = now();
        save();
        renderList();
        toast('Saved');
      }
    }, 600);
  }

  function renderList() {
    const list = document.getElementById('docs-list');
    if (!list) return;
    if (!docs.length) {
      list.innerHTML = `<div class="p-4 text-center text-xs text-slate-400">No documents yet.<br>Click <b>+ New Document</b> to start writing.</div>`;
      return;
    }
    list.innerHTML = docs.map(d => `
      <button onclick="window.openDoc('${d.id}')" class="doc-item w-full text-left p-3 rounded-xl border transition flex items-start gap-2.5 ${d.id === activeId ? 'bg-brand-50 border-brand-300' : 'bg-white border-slate-200 hover:border-brand-200 hover:bg-slate-50'}">
        <span class="mt-0.5 text-slate-400 flex-shrink-0">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/></svg>
        </span>
        <span class="min-w-0 flex-1">
          <span class="block text-xs font-bold text-navy-900 truncate">${esc(d.title)}</span>
          <span class="block text-[10px] text-slate-400 mt-0.5">${new Date(d.updated_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</span>
        </span>
      </button>
    `).join('');
  }

  function renderEditor() {
    const wrap = document.getElementById('docs-editor-wrap');
    if (!wrap) return;
    const d = docs.find(x => x.id === activeId);
    if (!d) {
      wrap.innerHTML = `
        <div class="flex-1 flex flex-col items-center justify-center text-center p-10 text-slate-400 bg-white rounded-3xl border border-dashed border-slate-300">
          <svg class="w-10 h-10 mb-3 text-slate-300" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M12 18v-6M9 15l3-3 3 3"/></svg>
          <p class="text-sm font-bold text-slate-500">No document selected</p>
          <p class="text-xs mt-1">Create a new document to start writing — Word-style.</p>
        </div>`;
      return;
    }
    wrap.innerHTML = `
      <div class="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col" style="min-height:60vh">
        <!-- Word-style toolbar -->
        <div class="flex flex-wrap items-center gap-1 px-3 py-2 border-b border-slate-200 bg-slate-50 sticky top-0 z-10" id="doc-toolbar">
          <input id="doc-title-input" value="${esc(d.title)}" class="min-w-0 flex-1 sm:flex-none sm:w-64 text-sm font-extrabold text-navy-900 bg-transparent border-b border-transparent focus:border-brand-400 focus:outline-none px-1 py-1" oninput="window.renameDocLive('${d.id}', this.value)">
          <span class="hidden sm:block w-px h-5 bg-slate-300 mx-1"></span>
          <button type="button" data-cmd="bold" title="Bold (Ctrl+B)" class="doc-tb font-black">B</button>
          <button type="button" data-cmd="italic" title="Italic (Ctrl+I)" class="doc-tb italic font-serif">I</button>
          <button type="button" data-cmd="underline" title="Underline (Ctrl+U)" class="doc-tb underline">U</button>
          <button type="button" data-cmd="strikeThrough" title="Strikethrough" class="doc-tb line-through">S</button>
          <span class="w-px h-5 bg-slate-300 mx-1 hidden sm:block"></span>
          <button type="button" data-cmd="formatBlock" data-val="h1" title="Heading 1" class="doc-tb font-extrabold">H1</button>
          <button type="button" data-cmd="formatBlock" data-val="h2" title="Heading 2" class="doc-tb font-bold">H2</button>
          <button type="button" data-cmd="formatBlock" data-val="h3" title="Heading 3" class="doc-tb font-semibold">H3</button>
          <button type="button" data-cmd="formatBlock" data-val="p" title="Paragraph" class="doc-tb">¶</button>
          <span class="w-px h-5 bg-slate-300 mx-1 hidden sm:block"></span>
          <button type="button" data-cmd="insertUnorderedList" title="Bullet list" class="doc-tb">• List</button>
          <button type="button" data-cmd="insertOrderedList" title="Numbered list" class="doc-tb">1. List</button>
          <button type="button" data-cmd="formatBlock" data-val="blockquote" title="Quote" class="doc-tb">“ Quote</button>
          <button type="button" id="doc-link-btn" title="Insert link" class="doc-tb">🔗</button>
          <span class="w-px h-5 bg-slate-300 mx-1 hidden sm:block"></span>
          <button type="button" data-cmd="removeFormat" title="Clear formatting" class="doc-tb text-slate-400">⌫ Clear</button>
          <span class="flex-1"></span>
          <button type="button" onclick="window.deleteDoc('${d.id}')" title="Delete document" class="doc-tb text-red-500 hover:bg-red-50">🗑</button>
        </div>
        <!-- Page -->
        <div id="doc-editor" contenteditable="true" spellcheck="true"
             class="doc-page flex-1 px-5 sm:px-10 py-6 text-sm text-navy-900 leading-relaxed focus:outline-none"
             style="min-height:50vh">${d.html || ''}</div>
        <div class="px-4 py-2 border-t border-slate-100 text-[10px] text-slate-400 flex items-center justify-between">
          <span>Autosaves locally · Word-style formatting</span>
          <span id="doc-saved-at">${new Date(d.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
      </div>`;

    // toolbar events
    wrap.querySelectorAll('#doc-toolbar [data-cmd]').forEach(b => {
      b.addEventListener('click', () => {
        const ed = document.getElementById('doc-editor');
        ed.focus();
        document.execCommand(b.dataset.cmd, false, b.dataset.val || null);
        scheduleSave();
      });
    });
    document.getElementById('doc-link-btn').addEventListener('click', () => {
      const url = prompt('Paste link URL (https://…):');
      if (url && /^https?:\/\//i.test(url)) {
        document.getElementById('doc-editor').focus();
        document.execCommand('createLink', false, url);
        scheduleSave();
      }
    });
    const ed = document.getElementById('doc-editor');
    ed.addEventListener('input', scheduleSave);
    ed.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && ['b', 'i', 'u'].includes(e.key.toLowerCase())) {
        // let browser handle, then save
        setTimeout(scheduleSave, 0);
      }
    });
  }

  function render() {
    renderList();
    renderEditor();
  }

  window.loadDocs = function () { load(); render(); };
  window.openDoc = function (id) { activeId = id; render(); };
  window.newDoc = function () { createDoc(); };
  window.deleteDoc = deleteDoc;
  window.renameDocLive = function (id, title) {
    const d = docs.find(x => x.id === id);
    if (d) { d.title = title.trim() || 'Untitled document'; d.updated_at = now(); clearTimeout(saveTimer); saveTimer = setTimeout(() => { save(); renderList(); }, 400); }
  };
  function toast(msg) {
    const t = document.getElementById('toast');
    if (t) { t.textContent = msg; t.style.opacity = '1'; setTimeout(() => t.style.opacity = '0', 1200); }
  }
})();
