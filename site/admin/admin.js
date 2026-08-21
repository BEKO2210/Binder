(function binderAdmin() {
  'use strict';

  const SUPABASE_URL = 'https://sbohsxtzitqhyswznhec.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_CS84Z2jb7tQZBk97sFpPCw_9smErm5J';
  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
      storageKey: 'binder-admin-session',
    },
  });

  const state = {
    member: null,
    activeTab: null,
    pendingAction: null,
    objectUrls: new Set(),
  };

  const byId = (id) => document.getElementById(id);
  const all = (selector) => Array.from(document.querySelectorAll(selector));

  function make(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function formatDate(value) {
    if (!value) return '–';
    return new Intl.DateTimeFormat('de-DE', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));
  }

  function humanize(value) {
    const labels = {
      app: 'App', legal: 'Rechtliches', discover: 'Discovery', matches: 'Matches',
      chat: 'Chat', profile: 'Profil', beta: 'Beta', empty: 'Leer', cancel: 'Abgebrochen',
      bug: 'Fehler', ux: 'Bedienung', safety: 'Sicherheit', performance: 'Tempo',
      photo_review: 'Foto', report: 'Meldung', approve_media: 'Foto freigegeben',
      reject_media: 'Foto abgelehnt', remove_media: 'Foto entfernt', warn: 'Verwarnung',
      suspend: 'Konto gesperrt', dismiss: 'Meldung geschlossen', spam: 'Spam',
      harassment: 'Belästigung', underage: 'Minderjährigkeit', fake: 'Falsches Profil',
      sexual_content: 'Sexuelle Inhalte', violence: 'Gewalt', other: 'Sonstiges',
    };
    return labels[value] || String(value || '–').replaceAll('_', ' ');
  }

  function empty(container, text) {
    container.replaceChildren(make('div', 'empty-state', text));
  }

  function setStatus(node, message, kind) {
    node.textContent = message || '';
    node.classList.toggle('error', kind === 'error');
    node.classList.toggle('success', kind === 'success');
  }

  let toastTimer;
  function toast(message, error) {
    const node = byId('toast');
    node.textContent = message;
    node.classList.toggle('error', Boolean(error));
    node.hidden = false;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => { node.hidden = true; }, 4200);
  }

  async function rpc(name, args) {
    const { data, error } = await client.rpc(name, args || {});
    if (error) throw new Error(error.message || 'Serveranfrage fehlgeschlagen.');
    return data;
  }

  function firstRow(data) {
    return Array.isArray(data) ? data[0] : data;
  }

  function allowedTabs() {
    const tabs = [];
    if (state.member.can_review_media) tabs.push('photos');
    if (state.member.can_review_reports) tabs.push('reports');
    if (state.member.admin_role === 'owner') tabs.push('moderators');
    tabs.push('audit');
    tabs.push('diagnostics');
    return tabs;
  }

  function selectTab(tab) {
    if (!allowedTabs().includes(tab)) return;
    state.activeTab = tab;
    all('[data-tab]').forEach((button) => {
      button.classList.toggle('active', button.dataset.tab === tab);
      button.setAttribute('aria-selected', button.dataset.tab === tab ? 'true' : 'false');
    });
    all('[data-panel]').forEach((panel) => { panel.hidden = panel.dataset.panel !== tab; });
  }

  function configurePermissions() {
    const visible = new Set(allowedTabs());
    all('[data-tab]').forEach((button) => { button.hidden = !visible.has(button.dataset.tab); });
    byId('summary-moderators').closest('.summary-card').hidden = state.member.admin_role !== 'owner';
    byId('session-label').textContent = `${state.member.admin_email} · ${state.member.admin_role === 'owner' ? 'Owner' : 'Moderator'}`;
    selectTab(allowedTabs()[0]);
  }

  // One place decides what is on screen. Four separate spots used to set these
  // three flags, and a path that missed one left the sign-in card sitting under
  // a dashboard the person was already signed into.
  function showSession(signedIn) {
    document.body.dataset.session = signedIn ? 'in' : 'out';
    byId('login-view').hidden = signedIn;
    byId('dashboard-view').hidden = !signedIn;
    byId('sign-out').hidden = !signedIn;
  }

  let authorizing = false;

  async function authorizeSession() {
    if (authorizing) return;
    authorizing = true;
    try {
      state.member = firstRow(await rpc('claim_admin_session'));
      if (!state.member) throw new Error('not-authorized');
      showSession(true);
      configurePermissions();
      window.scrollTo({ top: 0, behavior: 'instant' in document.documentElement.style ? 'instant' : 'auto' });
      await refreshAll();
    } catch (error) {
      const message = String(error?.message || '');
      const transient = /fetch|network|timeout|load failed/i.test(message);
      if (transient && state.member) {
        // A flaky request must not destroy a valid session.
        toast('Verbindung unterbrochen. Bitte „Alles aktualisieren" antippen.', true);
      } else if (transient) {
        setStatus(byId('login-status'), 'Keine Verbindung zum Server. Bitte erneut versuchen.', 'error');
      } else {
        await client.auth.signOut({ scope: 'local' });
        state.member = null;
        showSession(false);
        setStatus(byId('login-status'), 'Dieses Konto ist nicht für Binder Admin freigeschaltet.', 'error');
      }
    } finally {
      authorizing = false;
    }
  }

  async function refreshSummary() {
    const row = firstRow(await rpc('admin_dashboard_summary')) || {};
    byId('summary-media').textContent = row.pending_media ?? 0;
    byId('summary-reports').textContent = row.open_reports ?? 0;
    byId('summary-suspended').textContent = row.suspended_accounts ?? 0;
    byId('summary-moderators').textContent = row.active_moderators ?? 0;
    byId('summary-audit').textContent = row.audit_actions ?? 0;
    await refreshPlatformNumbers();
  }

  // Was der Betrieb ueber die Plattform wissen darf: reine Aggregate. Keine
  // Zeile, keine Kennung, kein Standort — und Werte unter fuenf weist der
  // Server als fuenf aus, damit eine kleine Gruppe nicht durch Zusehen beim
  // Zaehler eingegrenzt werden kann.
  async function refreshPlatformNumbers() {
    const host = byId('platform-numbers');
    if (!host) return;
    try {
      const rows = await rpc('admin_platform_overview');
      const grid = make('div', 'metric-grid');
      rows.forEach((row) => {
        const card = make('article', 'metric-card');
        card.append(make('strong', '', new Intl.NumberFormat('de-DE').format(Number(row.value))), make('span', '', row.detail));
        grid.append(card);
      });
      host.replaceChildren(grid);
    } catch (error) {
      empty(host, error instanceof Error ? error.message : 'Zahlen nicht verfügbar.');
    }
  }

  function revokeObjectUrls() {
    state.objectUrls.forEach((url) => URL.revokeObjectURL(url));
    state.objectUrls.clear();
  }

  async function attachProtectedImage(frame, path) {
    const status = make('span', 'image-status', 'Bild wird sicher geladen …');
    frame.append(status);
    const { data, error } = await client.storage.from('profile-media').download(path);
    if (error) {
      status.textContent = 'Bild konnte nicht geladen werden.';
      return;
    }
    const url = URL.createObjectURL(data);
    state.objectUrls.add(url);
    const image = make('img');
    image.alt = 'Zu prüfendes Profilbild';
    image.src = url;
    frame.replaceChildren(image);
  }

  function actionButton(label, className, action) {
    const button = make('button', `admin-button ${className}`, label);
    button.type = 'button';
    button.addEventListener('click', () => openActionDialog(action));
    return button;
  }

  async function refreshPhotos() {
    const container = byId('photo-queue');
    container.setAttribute('aria-busy', 'true');
    revokeObjectUrls();
    const rows = await rpc('admin_list_media_queue', { p_limit: 100, p_offset: 0 });
    if (!rows.length) {
      empty(container, 'Keine Profilbilder warten auf Prüfung.');
      container.removeAttribute('aria-busy');
      return;
    }
    const fragment = document.createDocumentFragment();
    rows.forEach((row) => {
      const card = make('article', 'moderation-card');
      const frame = make('div', 'media-frame');
      const body = make('div', 'case-body');
      const meta = make('div', 'case-meta');
      meta.append(make('span', '', `Fall #${row.case_id}`), make('time', '', formatDate(row.submitted_at)));
      body.append(meta, make('h3', '', row.profile_first_name || 'Profil ohne Namen'));
      body.append(make('p', '', `Position ${Number(row.media_position) + 1} · Priorität ${row.priority}`));
      const actions = make('div', 'case-actions');
      actions.append(
        actionButton('Freigeben', 'approve-action', {
          type: 'media', caseId: row.case_id, action: 'approve_media',
          title: 'Profilbild freigeben', description: 'Das Bild wird für andere Binder-Nutzer sichtbar.', required: false,
        }),
        actionButton('Ablehnen', 'danger-action', {
          type: 'media', caseId: row.case_id, action: 'reject_media',
          title: 'Profilbild ablehnen', description: 'Das Bild bleibt verborgen. Eine sachliche Begründung ist erforderlich.', required: true,
        }),
      );
      body.append(actions);
      card.append(frame, body);
      fragment.append(card);
      attachProtectedImage(frame, row.storage_path);
    });
    container.replaceChildren(fragment);
    container.removeAttribute('aria-busy');
  }

  function evidenceBlock(label, value) {
    const block = make('div', 'evidence-block');
    block.append(make('span', '', label), make('pre', '', value || 'Keine Angaben'));
    return block;
  }

  async function refreshReports() {
    const container = byId('report-queue');
    container.setAttribute('aria-busy', 'true');
    const rows = await rpc('admin_list_report_queue', { p_limit: 100, p_offset: 0 });
    if (!rows.length) {
      empty(container, 'Keine Meldungen warten auf Entscheidung.');
      container.removeAttribute('aria-busy');
      return;
    }
    const fragment = document.createDocumentFragment();
    rows.forEach((row) => {
      const card = make('article', 'report-card');
      const top = make('div', 'report-top');
      const heading = make('div');
      heading.append(make('span', 'admin-kicker', `Fall #${row.case_id}`), make('h3', '', row.profile_first_name || 'Gemeldetes Profil'));
      const high = Number(row.priority) >= 80;
      top.append(heading, make('span', `priority-badge${high ? ' priority-high' : ''}`, `${humanize(row.reason)} · P${row.priority}`));
      card.append(top, make('p', 'report-details', row.details || 'Keine zusätzlichen Angaben.'));
      const evidence = make('div', 'evidence-grid');
      evidence.append(
        evidenceBlock('Profil-Snapshot', JSON.stringify(row.reported_profile_snapshot || {}, null, 2)),
        evidenceBlock('Gemeldete Nachricht', row.message_body_snapshot || 'Keine Nachricht gemeldet'),
      );
      card.append(evidence);
      const actions = make('div', 'case-actions');
      actions.append(
        actionButton('Kein Verstoß', 'ghost', {
          type: 'report', caseId: row.case_id, action: 'dismiss', title: 'Meldung schließen',
          description: 'Der Fall wird ohne Maßnahme geschlossen.', required: false,
        }),
        actionButton('Verwarnen', 'secondary-action', {
          type: 'report', caseId: row.case_id, action: 'warn', title: 'Nutzer verwarnen',
          description: 'Die Entscheidung wird im Audit-Protokoll festgehalten.', required: true,
        }),
      );
      if (state.member.can_suspend_accounts) {
        actions.append(actionButton('Konto sperren', 'danger-action', {
          type: 'report', caseId: row.case_id, action: 'suspend', title: 'Konto sofort sperren',
          description: 'Matches werden beendet, Push-Tokens deaktiviert und das Profil verborgen.', required: true,
        }));
      }
      card.append(actions);
      // Angeschaut und nichts zu tun ist auch Arbeit, und sie hinterlaesst eine
      // Spur. Daneben das Beweispaket: der Fall in einer Form, die man aus der
      // Hand geben kann, mit Pruefsumme.
      card.append(receiptRow(row));
      fragment.append(card);
    });
    container.replaceChildren(fragment);
    container.removeAttribute('aria-busy');
  }

  // Bei zehntausend Nutzern ist die Fehlerliste eine Wand. Quittieren nimmt
  // einen Eintrag aus der Arbeitsliste, ohne ihn zu loeschen: die Zeile bleibt,
  // die Zaehlung bleibt ehrlich.
  function diagnosticReceipt(row) {
    const wrapper = make('div', 'case-receipt');
    if (row.acknowledged_at) {
      wrapper.append(make('p', 'receipt-note',
        `Quittiert von ${row.acknowledged_by} am ${formatDate(row.acknowledged_at)}${row.acknowledgement_note ? ` — ${row.acknowledgement_note}` : ''}`));
    }
    const button = make('button', 'admin-button ghost', row.acknowledged_at ? 'Erneut quittieren' : 'Quittieren');
    button.type = 'button';
    button.addEventListener('click', async () => {
      const note = window.prompt('Notiz (optional):', '') ?? '';
      try {
        await rpc('admin_acknowledge_diagnostic', { p_event_id: row.event_id, p_note: note.trim() || null });
        toast('Fehler quittiert.', false);
        await refreshDiagnostics();
      } catch (error) { toast(error instanceof Error ? error.message : 'Quittung fehlgeschlagen.', true); }
    });
    wrapper.append(button);
    return wrapper;
  }

  // Zehn Moderatoren, eine Schlange: wer zuerst da ist, hat den Fall fuenfzehn
  // Minuten. Die anderen sehen wer, und bis wann.
  async function claimCase(caseId) {
    try {
      const [claim] = await rpc('admin_claim_case', { p_case_id: caseId });
      if (claim.was_free) toast(`Fall ${caseId} gehoert dir bis ${formatDate(claim.claimed_until)}.`, false);
      else toast(`Fall ${caseId} bearbeitet gerade ${claim.claimed_by} (bis ${formatDate(claim.claimed_until)}).`, true);
      await refreshReports();
    } catch (error) { toast(error instanceof Error ? error.message : 'Uebernahme fehlgeschlagen.', true); }
  }

  function receiptRow(row) {
    const wrapper = make('div', 'case-receipt');
    if (row.claimed_by && new Date(row.claimed_until) > new Date()) {
      wrapper.append(make('p', 'claim-note claim-taken',
        `In Bearbeitung von ${row.claimed_by} bis ${formatDate(row.claimed_until)}`));
    }
    if (row.acknowledged_at) {
      wrapper.append(make('p', 'receipt-note',
        `Quittiert von ${row.acknowledged_by} am ${new Date(row.acknowledged_at).toLocaleString('de-DE')}${row.acknowledgement_note ? ` — ${row.acknowledgement_note}` : ''}`));
    }
    const acknowledge = make('button', 'admin-button ghost', row.acknowledged_at ? 'Erneut quittieren' : 'Gesehen, quittieren');
    acknowledge.type = 'button';
    acknowledge.addEventListener('click', () => acknowledgeCase(row.case_id));
    const claim = make('button', 'admin-button ghost', 'Fall übernehmen');
    claim.type = 'button';
    claim.addEventListener('click', () => claimCase(row.case_id));
    wrapper.append(claim);
    const evidence = make('button', 'admin-button secondary-action', 'Beweispaket sichern');
    evidence.type = 'button';
    evidence.addEventListener('click', () => exportEvidence(row.case_id));
    wrapper.append(acknowledge, evidence);
    return wrapper;
  }

  async function acknowledgeCase(caseId) {
    const note = window.prompt('Notiz zur Quittung (optional):', '') ?? '';
    try {
      await rpc('admin_acknowledge_case', { p_case_id: caseId, p_note: note.trim() || null });
      toast(`Fall ${caseId} quittiert.`, false);
      await refreshReports();
    } catch (error) {
      toast(`Quittung fehlgeschlagen: ${error instanceof Error ? error.message : 'unbekannter Fehler'}`, true);
    }
  }

  async function exportEvidence(caseId) {
    try {
      const [result] = await rpc('admin_export_case_evidence', { p_case_id: caseId });
      // Die Pruefsumme gilt fuer genau diese Bytes, deshalb wird die Datei aus
      // demselben Text gebaut, ueber den der Server sie gebildet hat.
      const text = JSON.stringify(result.bundle, null, 4);
      const blob = new Blob([text], { type: 'application/json' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `binder-fall-${caseId}-${result.sha256.slice(0, 12)}.json`;
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(link.href);
      toast(`Beweispaket gesichert. SHA-256 ${result.sha256.slice(0, 16)}…`, false);
    } catch (error) {
      toast(`Beweispaket fehlgeschlagen: ${error instanceof Error ? error.message : 'unbekannter Fehler'}`, true);
    }
  }

  function permissionToggle(label, checked) {
    const wrapper = make('label', 'permission-check');
    const input = make('input');
    input.type = 'checkbox';
    input.checked = Boolean(checked);
    wrapper.append(input, document.createTextNode(label));
    return { wrapper, input };
  }

  async function refreshModerators() {
    if (state.member.admin_role !== 'owner') return;
    const container = byId('moderator-list');
    const rows = await rpc('admin_list_moderators');
    if (!rows.length) {
      empty(container, 'Noch keine Moderatoren angelegt.');
      return;
    }
    const fragment = document.createDocumentFragment();
    rows.forEach((row) => {
      const card = make('article', 'moderator-card');
      const identity = make('div');
      identity.append(make('h3', '', row.moderator_email), make('p', '', `${row.moderator_status} · aktiviert ${formatDate(row.activated_at)}`));
      const media = permissionToggle('Fotos prüfen', row.can_review_media);
      const reports = permissionToggle('Meldungen prüfen', row.can_review_reports);
      const suspend = permissionToggle('Konten sperren', row.can_suspend_accounts);
      suspend.input.addEventListener('change', () => { if (suspend.input.checked) reports.input.checked = true; });
      reports.input.addEventListener('change', () => { if (!reports.input.checked) suspend.input.checked = false; });
      const actions = make('div', 'moderator-actions');
      const save = make('button', 'admin-button secondary-action', 'Speichern');
      save.type = 'button';
      save.addEventListener('click', async () => {
        save.disabled = true;
        try {
          await rpc('admin_update_moderator', {
            p_email: row.moderator_email, p_enabled: true,
            p_can_review_media: media.input.checked, p_can_review_reports: reports.input.checked,
            p_can_suspend_accounts: suspend.input.checked,
          });
          toast('Moderatorrechte gespeichert.');
          await Promise.all([refreshModerators(), refreshSummary()]);
        } catch (error) { toast(error.message, true); }
        finally { save.disabled = false; }
      });
      const disable = make('button', 'admin-button danger-action', row.moderator_status === 'disabled' ? 'Bleibt deaktiviert' : 'Deaktivieren');
      disable.type = 'button';
      disable.disabled = row.moderator_status === 'disabled';
      disable.addEventListener('click', async () => {
        disable.disabled = true;
        try {
          await rpc('admin_update_moderator', {
            p_email: row.moderator_email, p_enabled: false,
            p_can_review_media: media.input.checked, p_can_review_reports: reports.input.checked,
            p_can_suspend_accounts: suspend.input.checked,
          });
          toast('Moderator wurde deaktiviert.');
          await Promise.all([refreshModerators(), refreshSummary()]);
        } catch (error) { toast(error.message, true); }
      });
      // Disabling is right for somebody who should stop moderating. It is the
      // wrong answer for an address that was mistyped and never existed — that
      // one has to be able to leave the list.
      const remove = make('button', 'admin-button danger-action', 'Löschen');
      remove.type = 'button';
      remove.addEventListener('click', async () => {
        if (!window.confirm(`${row.moderator_email} endgültig aus der Moderatorenliste entfernen?`)) return;
        remove.disabled = true;
        try {
          await rpc('admin_remove_moderator', { p_email: row.moderator_email });
          toast('Moderator wurde entfernt.');
          await Promise.all([refreshModerators(), refreshSummary()]);
        } catch (error) { toast(error.message, true); remove.disabled = false; }
      });
      actions.append(save, disable, remove);
      card.append(identity, media.wrapper, reports.wrapper, suspend.wrapper, actions);
      fragment.append(card);
    });
    container.replaceChildren(fragment);
  }

  async function refreshAudit() {
    const container = byId('audit-list');
    const rows = await rpc('admin_list_audit', { p_limit: 200 });
    if (!rows.length) {
      empty(container, 'Noch keine Moderationsaktionen protokolliert.');
      return;
    }
    const fragment = document.createDocumentFragment();
    rows.forEach((row) => {
      const item = make('article', 'audit-row');
      item.append(
        make('time', '', formatDate(row.created_at)),
        make('strong', '', humanize(row.action)),
        make('span', '', `${row.actor} · Fall #${row.case_id} · ${humanize(row.source_type)}`),
        make('p', '', row.notes || 'Keine Notiz'),
      );
      fragment.append(item);
    });
    container.replaceChildren(fragment);
  }

  async function refreshDiagnostics() {
    const [health, summary, errors, feedback] = await Promise.all([
      rpc('admin_diagnostics_health'),
      rpc('admin_diagnostics_summary', { p_days: 14 }),
      rpc('admin_diagnostics_client_errors', { p_limit: 50 }),
      rpc('admin_diagnostics_feedback', { p_limit: 50 }),
    ]);

    const healthRow = firstRow(health) || {};
    const cards = [
      ['Diagnose an', healthRow.diagnostics_opted_in ?? 0],
      ['Diagnose aus', healthRow.diagnostics_opted_out ?? 0],
      ['Geräte (7 Tage)', healthRow.reporting_devices_7d ?? 0],
      ['Ereignisse (24 h)', healthRow.client_events_24h ?? 0],
      ['Fehler (24 h)', healthRow.client_errors_24h ?? 0],
      ['Letztes Ereignis', formatDate(healthRow.newest_event_at)],
    ];
    const healthFragment = document.createDocumentFragment();
    cards.forEach(([label, value]) => {
      const card = make('article', 'summary-card');
      card.append(make('span', '', label), make('strong', '', value));
      healthFragment.append(card);
    });
    byId('diagnostics-health').replaceChildren(healthFragment);

    const summaryContainer = byId('diagnostics-summary');
    const days = (summary || []).filter((row) => Number(row.new_users) || Number(row.decisions) || Number(row.client_errors) || Number(row.feedback));
    if (!days.length) {
      empty(summaryContainer, 'In diesem Zeitraum wurde nichts gemeldet.');
    } else {
      const table = make('table', 'diagnostics-grid');
      const head = make('tr');
      ['Tag', 'Neu', 'Entscheidungen', 'Binds', 'Matches', '1. Nachricht', 'Meldungen', 'Feedback', 'Fehler', 'Discovery p95'].forEach((label) => head.append(make('th', '', label)));
      const header = make('thead');
      header.append(head);
      table.append(header);
      const body = make('tbody');
      days.forEach((row) => {
        const line = make('tr');
        [
          new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit' }).format(new Date(row.day)),
          row.new_users, row.decisions, row.binds, row.matches, row.first_messages,
          row.reports, row.feedback, row.client_errors,
          row.discovery_p95_ms == null ? '–' : `${Math.round(row.discovery_p95_ms)} ms`,
        ].forEach((value) => line.append(make('td', '', value)));
        body.append(line);
      });
      table.append(body);
      summaryContainer.replaceChildren(table);
    }

    const errorContainer = byId('diagnostics-errors');
    if (!errors.length) {
      empty(errorContainer, 'Keine Fehlerereignisse gemeldet.');
    } else {
      const fragment = document.createDocumentFragment();
      errors.forEach((row) => {
        const item = make('article', 'audit-row');
        item.append(
          make('time', '', formatDate(row.created_at)),
          make('strong', '', `${humanize(row.surface)} · ${row.outcome === 'error' ? 'Fehler' : humanize(row.outcome)}`),
          make('span', '', `${row.event_name} · ${row.platform} · App ${row.app_version}${row.duration_ms == null ? '' : ` · ${row.duration_ms} ms`}`),
          diagnosticReceipt(row),
          make('p', '', `Sitzung ${String(row.session_id).slice(0, 8)}`),
        );
        fragment.append(item);
      });
      errorContainer.replaceChildren(fragment);
    }

    const feedbackContainer = byId('diagnostics-feedback');
    if (!feedback.length) {
      empty(feedbackContainer, 'Noch keine Rückmeldungen.');
    } else {
      const fragment = document.createDocumentFragment();
      feedback.forEach((row) => {
        const item = make('article', 'audit-row');
        item.append(
          make('time', '', formatDate(row.created_at)),
          make('strong', '', `${humanize(row.category)} · ${row.rating}/5`),
          make('span', '', row.profile_first_name ? `${row.profile_first_name}` : 'Konto ohne Profilnamen'),
          make('p', '', row.details || 'Keine Beschreibung'),
        );
        fragment.append(item);
      });
      feedbackContainer.replaceChildren(fragment);
    }
  }

  async function refreshAll() {
    const jobs = [refreshSummary(), refreshAudit(), refreshDiagnostics()];
    if (state.member.can_review_media) jobs.push(refreshPhotos());
    if (state.member.can_review_reports) jobs.push(refreshReports());
    if (state.member.admin_role === 'owner') jobs.push(refreshModerators());
    const results = await Promise.allSettled(jobs);
    const failed = results.find((result) => result.status === 'rejected');
    if (failed) toast(failed.reason?.message || 'Ein Bereich konnte nicht geladen werden.', true);
  }

  function openActionDialog(action) {
    state.pendingAction = action;
    byId('action-title').textContent = action.title;
    byId('action-description').textContent = action.description;
    byId('notes-requirement').textContent = action.required ? '(Pflichtfeld)' : '(optional)';
    byId('action-notes').value = '';
    byId('action-notes').required = action.required;
    setStatus(byId('action-status'), '');
    byId('action-dialog').showModal();
  }

  async function submitAction(event) {
    event.preventDefault();
    const action = state.pendingAction;
    if (!action) return;
    const notes = byId('action-notes').value.trim();
    if (action.required && notes.length < 3) {
      setStatus(byId('action-status'), 'Bitte eine kurze Begründung eintragen.', 'error');
      return;
    }
    const confirm = byId('action-confirm');
    confirm.disabled = true;
    try {
      await rpc(action.type === 'media' ? 'admin_review_media' : 'admin_review_report', {
        p_case_id: action.caseId,
        p_action: action.action,
        p_notes: notes || null,
      });
      byId('action-dialog').close();
      toast('Entscheidung wurde serverseitig gespeichert.');
      await Promise.all([
        refreshSummary(), refreshAudit(),
        action.type === 'media' ? refreshPhotos() : refreshReports(),
      ]);
    } catch (error) {
      setStatus(byId('action-status'), error.message, 'error');
    } finally {
      confirm.disabled = false;
    }
  }

  async function submitInvite(event) {
    event.preventDefault();
    const status = byId('invite-status');
    const email = byId('moderator-email').value.trim().toLowerCase();
    if (byId('invite-suspend').checked) byId('invite-reports').checked = true;
    setStatus(status, 'Einladung wird sicher erstellt …');
    const submit = event.submitter;
    submit.disabled = true;
    try {
      const { data, error } = await client.functions.invoke('invite-moderator', {
        body: {
          email,
          permissions: {
            reviewMedia: byId('invite-media').checked,
            reviewReports: byId('invite-reports').checked,
            suspendAccounts: byId('invite-suspend').checked,
          },
        },
      });
      if (error) throw error;
      setStatus(status, data?.status === 'active' ? 'Bestehendes Konto wurde als Moderator freigeschaltet.' : 'Einladungslink wurde versendet.', 'success');
      byId('moderator-email').value = '';
      await Promise.all([refreshModerators(), refreshSummary()]);
    } catch {
      setStatus(status, 'Einladung konnte nicht versendet werden. Bitte später erneut versuchen.', 'error');
    } finally {
      submit.disabled = false;
    }
  }

  async function submitLogin(event) {
    event.preventDefault();
    const button = byId('login-submit');
    const status = byId('login-status');
    button.disabled = true;
    setStatus(status, 'Anmeldelink wird angefordert …');
    const redirectTo = new URL('./', window.location.href);
    redirectTo.search = '';
    redirectTo.hash = '';
    const { error } = await client.auth.signInWithOtp({
      email: byId('login-email').value.trim().toLowerCase(),
      options: { shouldCreateUser: false, emailRedirectTo: redirectTo.toString() },
    });
    if (error) setStatus(status, 'Anmeldung derzeit nicht möglich. Bitte Eingabe prüfen.', 'error');
    else setStatus(status, 'Wenn das Konto freigeschaltet ist, wurde ein Anmeldelink gesendet.', 'success');
    button.disabled = false;
  }

  function bindEvents() {
    byId('login-form').addEventListener('submit', submitLogin);
    byId('invite-form').addEventListener('submit', submitInvite);
    byId('action-form').addEventListener('submit', submitAction);
    byId('action-cancel').addEventListener('click', () => byId('action-dialog').close());
    byId('refresh-all').addEventListener('click', refreshAll);
    byId('sign-out').addEventListener('click', async () => {
      revokeObjectUrls();
      await client.auth.signOut();
      window.location.reload();
    });
    all('[data-tab]').forEach((button) => button.addEventListener('click', () => selectTab(button.dataset.tab)));
    all('[data-refresh]').forEach((button) => button.addEventListener('click', async () => {
      const jobs = { photos: refreshPhotos, reports: refreshReports, audit: refreshAudit, diagnostics: refreshDiagnostics };
      button.disabled = true;
      try { await jobs[button.dataset.refresh](); }
      catch (error) { toast(error.message, true); }
      finally { button.disabled = false; }
    }));
  }

  async function start() {
    bindEvents();
    client.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session && !state.member) void authorizeSession();
      if (event === 'SIGNED_OUT') {
        state.member = null;
        showSession(false);
      }
    });
    const { data } = await client.auth.getSession();
    if (data.session) await authorizeSession();
  }

  window.addEventListener('beforeunload', revokeObjectUrls);
  start().catch(() => setStatus(byId('login-status'), 'Dashboard konnte nicht gestartet werden.', 'error'));
})();
