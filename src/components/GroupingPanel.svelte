<script>
  import { mergeGroups, splitGroup, renameGroup } from '../lib/adjacency.js';

  /** @type {import('../lib/adjacency.js').WallGroup[]} */
  export let groups = [];

  /** @type {import('../lib/ifc.js').Wall[]} */
  export let walls = [];

  export let onGroupsChange = (/** @type {any} */ g) => { groups = g; };

  const wallNameMap = () => Object.fromEntries(walls.map(w => [w.id, w.name]));

  // ── Samenvoegen ──────────────────────────────
  let mergeA = '';
  let mergeB = '';

  function handleMerge() {
    if (!mergeA || !mergeB || mergeA === mergeB) return;
    onGroupsChange(mergeGroups(groups, mergeA, mergeB));
    mergeA = '';
    mergeB = '';
  }

  // ── Splitsen ─────────────────────────────────
  let splitGroupId = '';
  /** @type {Set<string>} */
  let splitSelection = new Set();

  function toggleSplitWall(wallId) {
    splitSelection = new Set(splitSelection);
    if (splitSelection.has(wallId)) splitSelection.delete(wallId);
    else splitSelection.add(wallId);
  }

  function handleSplit() {
    if (!splitGroupId || splitSelection.size === 0) return;
    const group = groups.find(g => g.id === splitGroupId);
    if (!group || splitSelection.size >= group.wallIds.length) return;
    onGroupsChange(splitGroup(groups, splitGroupId, [...splitSelection]));
    splitGroupId = '';
    splitSelection = new Set();
  }

  // ── Hernoemen ────────────────────────────────
  let renamingId = '';
  let renameValue = '';

  function startRename(group) {
    renamingId  = group.id;
    renameValue = group.label;
  }

  function commitRename() {
    if (!renamingId || !renameValue.trim()) { renamingId = ''; return; }
    onGroupsChange(renameGroup(groups, renamingId, renameValue.trim()));
    renamingId = '';
  }

  $: names = wallNameMap();
  $: splitGroup_ = groups.find(g => g.id === splitGroupId);
</script>

<div class="grouping-panel">
  <h2>Wandgroepen</h2>

  <!-- ── Lijst van groepen ── -->
  <ul class="group-list">
    {#each groups as group (group.id)}
      <li class="group-card">
        <div class="group-header">
          {#if renamingId === group.id}
            <input
              class="rename-input"
              bind:value={renameValue}
              on:keydown={e => e.key === 'Enter' && commitRename()}
              on:blur={commitRename}
              autofocus
            />
          {:else}
            <span class="group-label">{group.label}</span>
            <button class="btn-icon" title="Hernoem" on:click={() => startRename(group)}>✏️</button>
          {/if}
          <span class="badge">{group.wallIds.length}</span>
        </div>
        <ul class="wall-chips">
          {#each group.wallIds as wid}
            <li class="chip">{names[wid] ?? wid}</li>
          {/each}
        </ul>
      </li>
    {/each}
  </ul>

  <!-- ── Samenvoegen ── -->
  <section class="action-section">
    <h3>Groepen samenvoegen</h3>
    <div class="row">
      <select bind:value={mergeA}>
        <option value="">— kies groep A —</option>
        {#each groups as g}
          <option value={g.id}>{g.label}</option>
        {/each}
      </select>
      <span>+</span>
      <select bind:value={mergeB}>
        <option value="">— kies groep B —</option>
        {#each groups as g}
          {#if g.id !== mergeA}
            <option value={g.id}>{g.label}</option>
          {/if}
        {/each}
      </select>
      <button class="btn-primary" on:click={handleMerge} disabled={!mergeA || !mergeB || mergeA === mergeB}>
        Samenvoegen
      </button>
    </div>
  </section>

  <!-- ── Splitsen ── -->
  <section class="action-section">
    <h3>Groep splitsen</h3>
    <div class="row">
      <select bind:value={splitGroupId} on:change={() => splitSelection = new Set()}>
        <option value="">— kies een groep —</option>
        {#each groups.filter(g => g.wallIds.length > 1) as g}
          <option value={g.id}>{g.label}</option>
        {/each}
      </select>
    </div>
    {#if splitGroup_}
      <p class="hint">Selecteer de wanden die naar een nieuwe groep gaan:</p>
      <div class="checkbox-list">
        {#each splitGroup_.wallIds as wid}
          <label class="check-label">
            <input
              type="checkbox"
              checked={splitSelection.has(wid)}
              on:change={() => toggleSplitWall(wid)}
              disabled={splitGroup_.wallIds.length - (splitSelection.has(wid) ? 1 : 0) <= 0 ||
                        (!splitSelection.has(wid) && splitSelection.size >= splitGroup_.wallIds.length - 1)}
            />
            {names[wid] ?? wid}
          </label>
        {/each}
      </div>
      <button
        class="btn-primary"
        on:click={handleSplit}
        disabled={splitSelection.size === 0 || splitSelection.size >= splitGroup_.wallIds.length}
      >
        Splitsen
      </button>
    {/if}
  </section>
</div>

<style>
  .grouping-panel {
    font-family: system-ui, sans-serif;
    max-width: 640px;
    padding: 1rem;
  }

  h2 { margin-top: 0; font-size: 1.25rem; }
  h3 { font-size: 1rem; margin-bottom: 0.5rem; }

  .group-list {
    list-style: none;
    padding: 0;
    margin: 0 0 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .group-card {
    border: 1px solid #d1d5db;
    border-radius: 6px;
    padding: 0.75rem 1rem;
    background: #f9fafb;
  }

  .group-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.4rem;
  }

  .group-label { font-weight: 600; flex: 1; }

  .badge {
    background: #3b82f6;
    color: white;
    border-radius: 999px;
    padding: 1px 8px;
    font-size: 0.75rem;
  }

  .btn-icon {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 0.9rem;
    padding: 0 2px;
  }

  .rename-input {
    flex: 1;
    padding: 2px 6px;
    border: 1px solid #6b7280;
    border-radius: 4px;
    font-size: 0.95rem;
  }

  .wall-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .chip {
    background: #e5e7eb;
    border-radius: 4px;
    padding: 1px 8px;
    font-size: 0.8rem;
    color: #374151;
  }

  .action-section {
    margin-bottom: 1.5rem;
    background: #fff;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    padding: 1rem;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  select {
    padding: 0.35rem 0.5rem;
    border: 1px solid #d1d5db;
    border-radius: 4px;
    font-size: 0.9rem;
    flex: 1;
    min-width: 160px;
  }

  .btn-primary {
    padding: 0.35rem 1rem;
    background: #3b82f6;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.9rem;
    white-space: nowrap;
  }

  .btn-primary:disabled {
    background: #93c5fd;
    cursor: not-allowed;
  }

  .hint { font-size: 0.85rem; color: #6b7280; margin: 0.5rem 0 0.25rem; }

  .checkbox-list {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    margin-bottom: 0.75rem;
  }

  .check-label {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.9rem;
    cursor: pointer;
  }
</style>
