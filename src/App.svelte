<script>
  import { demoWalls } from './lib/ifc.js';
  import { buildGroups, detectAdjacency } from './lib/adjacency.js';
  import GroupingPanel from './components/GroupingPanel.svelte';

  let walls = demoWalls;
  let groups = buildGroups(walls);
  $: adjacency = detectAdjacency(walls);

  function handleGroupsChange(newGroups) {
    groups = newGroups;
  }

  function resetGroups() {
    groups = buildGroups(walls);
  }

  $: totalWallsInGroups = groups.reduce((s, g) => s + g.wallIds.length, 0);
</script>

<main>
  <header>
    <h1>Gevel Patroon Tool</h1>
    <p class="subtitle">
      {walls.length} wanden geladen &nbsp;·&nbsp;
      {groups.length} groepen &nbsp;·&nbsp;
      <button class="link-btn" on:click={resetGroups}>Hergroepeer automatisch</button>
    </p>
  </header>

  <div class="layout">
    <!-- ── Plattegrond-preview ── -->
    <section class="floor-plan">
      <h2>Plattegrond</h2>
      <svg viewBox="-0.5 -0.5 10 8" class="plan-svg" aria-label="Wandoverzicht">
        {#each walls as wall}
          {@const x1 = wall.startPoint.x}
          {@const y1 = 6 - wall.startPoint.y}
          {@const x2 = wall.endPoint.x}
          {@const y2 = 6 - wall.endPoint.y}

          {@const groupIndex = groups.findIndex(g => g.wallIds.includes(wall.id))}
          {@const colors = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#ec4899','#84cc16']}
          {@const color = groupIndex >= 0 ? colors[groupIndex % colors.length] : '#6b7280'}

          <line
            {x1} {y1} {x2} {y2}
            stroke={color}
            stroke-width="0.15"
            stroke-linecap="round"
          >
            <title>{wall.name}</title>
          </line>

          <circle cx={x1} cy={y1} r="0.08" fill={color} />
          <circle cx={x2} cy={y2} r="0.08" fill={color} />
        {/each}
      </svg>

      <!-- Legenda -->
      <div class="legend">
        {#each groups as group, i}
          {@const colors = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#ec4899','#84cc16']}
          <div class="legend-item">
            <span class="legend-dot" style="background:{colors[i % colors.length]}"></span>
            <span>{group.label}</span>
          </div>
        {/each}
      </div>
    </section>

    <!-- ── Groeperingspaneel ── -->
    <section class="panel-section">
      <GroupingPanel
        {groups}
        {walls}
        onGroupsChange={handleGroupsChange}
      />
    </section>
  </div>
</main>

<style>
  :global(*, *::before, *::after) { box-sizing: border-box; }
  :global(body) {
    margin: 0;
    font-family: system-ui, -apple-system, sans-serif;
    background: #f3f4f6;
    color: #111827;
  }

  main { max-width: 1100px; margin: 0 auto; padding: 1.5rem; }

  header { margin-bottom: 1.5rem; }
  h1 { margin: 0 0 0.25rem; font-size: 1.6rem; }
  .subtitle { margin: 0; color: #6b7280; font-size: 0.9rem; }

  .link-btn {
    background: none;
    border: none;
    color: #3b82f6;
    cursor: pointer;
    padding: 0;
    font-size: inherit;
    text-decoration: underline;
  }

  .layout {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1.5rem;
    align-items: start;
  }

  @media (max-width: 700px) {
    .layout { grid-template-columns: 1fr; }
  }

  .floor-plan {
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    padding: 1rem;
  }

  .floor-plan h2 { margin: 0 0 0.75rem; font-size: 1rem; }

  .plan-svg {
    width: 100%;
    height: auto;
    background: #f8fafc;
    border: 1px solid #e5e7eb;
    border-radius: 4px;
  }

  .legend {
    margin-top: 0.75rem;
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem 1rem;
    font-size: 0.8rem;
  }

  .legend-item { display: flex; align-items: center; gap: 0.3rem; }
  .legend-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .panel-section {
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    padding: 1rem;
  }
</style>
