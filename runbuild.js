const { spawnSync } = require('child_process');
const r = spawnSync('npm', ['run', 'build'], {
  cwd: 'C:/Users/MurkAnneKooistraKooi/.zenflow/worktrees/multi-element-ifc-import-met-pat-e7f1',
  shell: true,
  encoding: 'utf8',
  timeout: 90000
});
console.log('exit:', r.status);
if (r.stdout) console.log(r.stdout);
if (r.stderr) console.log(r.stderr);
