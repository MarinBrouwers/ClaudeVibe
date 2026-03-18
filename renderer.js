// ══════════════════════════════════════════════════════════════════════════════
// ClaudeVibe — renderer.js
// Floating idle game that reacts to Claude Code activity via hooks
// ══════════════════════════════════════════════════════════════════════════════

document.getElementById('btn-cls').onclick = () => window.claude.close();
document.getElementById('btn-min').onclick = () => window.claude.minimize();

// Hidden reset: triple-click the title text
let _titleClicks = 0, _titleTimer = null;
document.querySelector('#titlebar .title').addEventListener('click', () => {
  _titleClicks++;
  if (_titleTimer) clearTimeout(_titleTimer);
  _titleTimer = setTimeout(() => { _titleClicks = 0; }, 600);
  if (_titleClicks >= 3) {
    _titleClicks = 0;
    if (confirm('Reset all progress?')) {
      window.claude.setSaveData(null);
      location.reload();
    }
  }
});

// ── Sound system (Tone.js) ────────────────────────────────────────────────────

let mutedFX = false;
let mutedMusic = false;
let toneReady = false;

// Instruments — created on first interaction
let _fxGain;
let _verb, _pluck, _melody, _bass, _tick, _whoosh;

async function startTone() {
  if (toneReady) return;
  await Tone.start();

  _fxGain = new Tone.Gain(1).toDestination();
  _verb   = new Tone.Reverb({ decay: 1.2, wet: 0.28 }).connect(_fxGain);

  _pluck  = new Tone.PluckSynth({
    attackNoise: 1.5, dampening: 3800, resonance: 0.97,
  }).connect(_verb);

  _melody = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'triangle8' },
    envelope:   { attack: 0.01, decay: 0.18, sustain: 0.05, release: 0.6 },
    volume: -6,
  }).connect(_verb);

  _bass   = new Tone.Synth({
    oscillator: { type: 'sine' },
    envelope:   { attack: 0.005, decay: 0.5, sustain: 0, release: 0.1 },
    volume: -4,
  }).connect(_fxGain);

  _tick   = new Tone.Synth({
    oscillator: { type: 'triangle' },
    envelope:   { attack: 0.001, decay: 0.04, sustain: 0, release: 0.01 },
    volume: -12,
  }).connect(_fxGain);

  // Whoosh: pink noise through a filter that sweeps up
  const whooshFilter = new Tone.Filter({ type: 'bandpass', Q: 3 }).connect(_fxGain);
  _whoosh = new Tone.NoiseSynth({
    noise:    { type: 'pink' },
    envelope: { attack: 0.02, decay: 0.28, sustain: 0, release: 0.05 },
    volume: -8,
  }).connect(whooshFilter);
  whooshFilter.frequency.value = 400;
  // Store filter ref so cast() can sweep it
  _whoosh._filter = whooshFilter;

  toneReady = true;
}

const sounds = {
  cast() {
    if (mutedFX || !toneReady) return;
    // Sweep filter frequency up for whoosh
    _whoosh._filter.frequency.cancelScheduledValues(Tone.now());
    _whoosh._filter.frequency.setValueAtTime(300, Tone.now());
    _whoosh._filter.frequency.exponentialRampToValueAtTime(2800, Tone.now() + 0.22);
    _whoosh.triggerAttackRelease('16n');
  },
  bite() {
    if (mutedFX || !toneReady) return;
    // Quick double-tap — line getting tugged
    _tick.triggerAttackRelease('E4', '32n');
    setTimeout(() => toneReady && _tick.triggerAttackRelease('C4', '32n'), 80);
  },
  reelTick() {
    if (mutedFX || !toneReady) return;
    _tick.triggerAttackRelease('A5', '64n');
  },
  catch() {
    if (mutedFX || !toneReady) return;
    ['C4', 'E4', 'G4', 'C5'].forEach((n, i) =>
      setTimeout(() => toneReady && _melody.triggerAttackRelease(n, '8n'), i * 110));
  },
  levelUp() {
    if (mutedFX || !toneReady) return;
    _bass.triggerAttackRelease('C2', '4n');
    ['C4', 'E4', 'G4', 'C5', 'E5', 'G5'].forEach((n, i) =>
      setTimeout(() => toneReady && _melody.triggerAttackRelease(n, '8n'), 60 + i * 95));
    setTimeout(() => toneReady && _melody.triggerAttackRelease(['C5', 'E5', 'G5'], '4n'), 680);
  },
};

// Theme toggle
document.getElementById('btn-theme').onclick = () => {
  S.theme = S.theme === 'light' ? 'dark' : 'light';
  applyTheme();
  saveToDisk();
};

// FX mute toggle — show/hide FX slider
document.getElementById('btn-mute').onclick = () => {
  startTone();
  mutedFX = !mutedFX;
  if (_fxGain) _fxGain.gain.value = mutedFX ? 0 : +document.getElementById('fx-vol').value / 100;
  const btn = document.getElementById('btn-mute');
  btn.textContent = mutedFX ? '🔇' : '🔊';
  btn.className = mutedFX ? 'muted' : 'active';
  document.getElementById('fx-vol-group').style.display = mutedFX ? 'none' : 'flex';
};

// FX volume slider
document.getElementById('fx-vol').oninput = (e) => {
  if (_fxGain && !mutedFX) _fxGain.gain.value = e.target.value / 100;
};

// Music volume slider
let musicVolume = 1.4;
document.getElementById('music-vol').oninput = (e) => {
  musicVolume = (e.target.value / 100) * 1.8;
  if (_musicGain && !mutedMusic) _musicGain.gain.value = musicVolume;
};

// Music button: start if off, mute/unmute if playing
document.getElementById('btn-music').onclick = async () => {
  await startTone();
  if (!chillPlaying) {
    mutedMusic = false;
    startTrack(_currentTrackIdx);
  } else {
    mutedMusic = !mutedMusic;
    if (_musicGain) _musicGain.gain.value = mutedMusic ? 0 : musicVolume;
    updateMusicBtn();
    document.getElementById('music-vol-group').style.display = mutedMusic ? 'none' : 'flex';
  }
};

// Next track button — cycles through all 5 tracks
document.getElementById('btn-next-track').onclick = async () => {
  await startTone();
  const next = (_currentTrackIdx + 1) % TRACKS.length;
  if (chillPlaying) {
    startTrack(next);
  } else {
    _currentTrackIdx = next;
    const nameEl = document.getElementById('music-track-name');
    if (nameEl) nameEl.textContent = TRACKS[next].emoji + ' ' + TRACKS[next].name;
  }
};

// Boot Tone.js on any canvas click too
document.getElementById('game-canvas').addEventListener('click', startTone, { once: true });

// Daily challenges toggle
document.getElementById('btn-challenges').onclick = () => {
  document.getElementById('shop-panel').classList.remove('visible');
  document.getElementById('quest-panel').classList.remove('visible');
  document.getElementById('lib-panel').classList.remove('visible');
  const panel = document.getElementById('challenge-panel');
  panel.classList.toggle('visible');
  if (panel.classList.contains('visible')) renderChallengePanel();
};

// Shop button
document.getElementById('btn-shop').onclick = () => {
  document.getElementById('quest-panel').classList.remove('visible');
  document.getElementById('lib-panel').classList.remove('visible');
  document.getElementById('challenge-panel').classList.remove('visible');
  const panel = document.getElementById('shop-panel');
  panel.classList.toggle('visible');
  if (panel.classList.contains('visible')) renderShop();
};

['hat','boat','rod','bobber','lure','buddy','water'].forEach(tab => {
  const btn = document.getElementById('shop-tab-' + tab);
  if (btn) btn.addEventListener('click', () => { _shopTab = tab; renderShop(); });
});

// Quest panel toggle
document.getElementById('btn-quests').onclick = () => {
  document.getElementById('shop-panel').classList.remove('visible');
  document.getElementById('lib-panel').classList.remove('visible');
  document.getElementById('challenge-panel').classList.remove('visible');
  const panel = document.getElementById('quest-panel');
  panel.classList.toggle('visible');
  if (panel.classList.contains('visible')) renderQuestPanel();
};

// Fish library toggle
document.getElementById('btn-lib').onclick = () => {
  document.getElementById('shop-panel').classList.remove('visible');
  document.getElementById('quest-panel').classList.remove('visible');
  document.getElementById('challenge-panel').classList.remove('visible');
  const panel = document.getElementById('lib-panel');
  panel.classList.toggle('visible');
  if (panel.classList.contains('visible')) renderLibPanel();
};

// ── Multi-track music system ──────────────────────────────────────────────────

const TRACKS = [
  { id: 'lofi',    name: 'Night Lo-fi',    emoji: '🌙' },
  { id: 'morning', name: 'Morning Chill',  emoji: '☀️' },
  { id: 'ocean',   name: 'Ocean Drift',    emoji: '🌊' },
  { id: 'forest',  name: 'Forest Ambient', emoji: '🌲' },
  { id: 'focus',   name: 'Focus Mode',     emoji: '⚡' },
];

let chillPlaying = false;
let _musicGain;
let _activeSeqs   = [];
let _activeSynths = [];
let _currentTrackIdx = 0;

function initMusicGain() {
  if (_musicGain) return;
  _musicGain = new Tone.Gain(1.4).toDestination();
}

function stopCurrentTrack() {
  // Zero gain immediately so long-release envelopes don't bleed into next track
  if (_musicGain) {
    _musicGain.gain.cancelScheduledValues(Tone.now());
    _musicGain.gain.setValueAtTime(0, Tone.now());
  }
  _activeSeqs.forEach(s => { try { s.stop(); s.dispose(); } catch(_){} });
  _activeSeqs = [];
  _activeSynths.forEach(n => { try { n.dispose(); } catch(_){} });
  _activeSynths = [];
  Tone.Transport.stop();
  Tone.Transport.cancel();
}

function buildTrack(idx) {
  initMusicGain();
  const seqs = [];
  const nodes = []; // all synths/effects to dispose on track stop

  if (idx === 0) {
    // 🌙 Night Lo-fi — 75bpm, pluck arp + soft drums, no pads
    Tone.Transport.bpm.value = 75;
    Tone.Transport.swing = 0.12;
    Tone.Transport.swingSubdivision = '8n';
    const verb  = new Tone.Reverb({ decay: 2.5, wet: 0.32 }).connect(_musicGain);
    const dly   = new Tone.FeedbackDelay('8n', 0.22).connect(verb);
    const arp   = new Tone.PluckSynth({ attackNoise: 0.6, dampening: 2200, resonance: 0.94, volume: -12 }).connect(dly);
    const kick  = new Tone.MembraneSynth({ pitchDecay: 0.04, octaves: 4, envelope: { attack: 0.001, decay: 0.2, sustain: 0, release: 0.08 }, volume: -16 }).connect(_musicGain);
    const snareFlt = new Tone.Filter(2200, 'lowpass').connect(_musicGain);
    const snare = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.1, sustain: 0, release: 0.04 }, volume: -22 }).connect(snareFlt);
    const hatFlt = new Tone.Filter(9000, 'highpass').connect(_musicGain);
    const hat   = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.03, sustain: 0, release: 0.01 }, volume: -30 }).connect(hatFlt);
    nodes.push(verb, dly, arp, kick, snareFlt, snare, hatFlt, hat);
    seqs.push(
      new Tone.Sequence((t, n) => { if(n) arp.triggerAttackRelease(n,'8n',t); },
        ['F4',null,null,'A4',null,'C5',null,null,'E4',null,null,'G4',null,'B4',null,null,'D4',null,null,'F4',null,'A4',null,null,'G4',null,null,'B4',null,'D5',null,'F4'], '8n'),
      new Tone.Sequence((t,v) => { if(v) kick.triggerAttackRelease('C2','8n',t); },  [1,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0], '16n'),
      new Tone.Sequence((t,v) => { if(v) snare.triggerAttackRelease('16n',t); },     [0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0], '16n'),
      new Tone.Sequence((t,v) => { if(v) hat.triggerAttackRelease('32n',t); },       [1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,1], '16n'),
    );

  } else if (idx === 1) {
    // ☀️ Morning Chill — 88bpm, bright plucky melody + light drums, no pads
    Tone.Transport.bpm.value = 88;
    Tone.Transport.swing = 0.06;
    Tone.Transport.swingSubdivision = '8n';
    const verb  = new Tone.Reverb({ decay: 1.5, wet: 0.25 }).connect(_musicGain);
    const dly   = new Tone.FeedbackDelay('8n', 0.15).connect(verb);
    const mel   = new Tone.PluckSynth({ attackNoise: 0.5, dampening: 4000, resonance: 0.9, volume: -10 }).connect(dly);
    const kick  = new Tone.MembraneSynth({ pitchDecay: 0.03, octaves: 4, envelope: { attack: 0.001, decay: 0.18, sustain: 0, release: 0.06 }, volume: -18 }).connect(_musicGain);
    const hatFlt = new Tone.Filter(10000, 'highpass').connect(_musicGain);
    const hat   = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.02, sustain: 0, release: 0.01 }, volume: -28 }).connect(hatFlt);
    nodes.push(verb, dly, mel, kick, hatFlt, hat);
    seqs.push(
      new Tone.Sequence((t,n) => { if(n) mel.triggerAttackRelease(n,'8n',t); },
        ['E5',null,'G5',null,'B5',null,null,'E5','A4',null,'C5',null,null,'E5',null,null,'F5',null,'A5',null,'C6',null,null,null,'G5',null,'B5',null,'D6',null,null,null], '8n'),
      new Tone.Sequence((t,v) => { if(v) kick.triggerAttackRelease('C2','8n',t); }, [1,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0], '16n'),
      new Tone.Sequence((t,v) => { if(v) hat.triggerAttackRelease('32n',t); },      [1,0,0,1,0,0,1,0,0,1,0,0,1,0,0,0], '16n'),
    );

  } else if (idx === 2) {
    // 🌊 Ocean Drift — 62bpm, no drums, sparse pluck melody + bells, no pads
    Tone.Transport.bpm.value = 62;
    Tone.Transport.swing = 0;
    Tone.Transport.swingSubdivision = '8n';
    const verb = new Tone.Reverb({ decay: 3.5, wet: 0.45 }).connect(_musicGain);
    const dly  = new Tone.FeedbackDelay('4n', 0.2).connect(verb);
    const mel  = new Tone.PluckSynth({ attackNoise: 0.3, dampening: 5000, resonance: 0.92, volume: -12 }).connect(dly);
    const bell = new Tone.Synth({ oscillator: { type: 'triangle' }, envelope: { attack: 0.001, decay: 1.5, sustain: 0, release: 2.5 }, volume: -18 }).connect(verb);
    nodes.push(verb, dly, mel, bell);
    seqs.push(
      new Tone.Sequence((t,n) => { if(n) mel.triggerAttackRelease(n,'4n',t); },
        ['A4',null,null,null,'E4',null,null,null,'F4',null,null,null,'C5',null,null,null,'C4',null,null,null,'G4',null,null,null,'E4',null,null,null,'B4',null,null,null], '8n'),
      new Tone.Sequence((t,n) => { if(n) bell.triggerAttackRelease(n,'8n',t); },
        ['E5',null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,'A5',null,null,null,null,null,null,null,null,null,null,null,null,null,null,null], '8n'),
    );

  } else if (idx === 3) {
    // 🌲 Forest Ambient — 65bpm, no drums, sparse plucks + high bells only
    Tone.Transport.bpm.value = 65;
    Tone.Transport.swing = 0;
    Tone.Transport.swingSubdivision = '8n';
    const verb  = new Tone.Reverb({ decay: 5.0, wet: 0.55 }).connect(_musicGain);
    const pluck = new Tone.PluckSynth({ attackNoise: 0.2, dampening: 4500, resonance: 0.96, volume: -12 }).connect(verb);
    const bell  = new Tone.Synth({ oscillator: { type: 'triangle' }, envelope: { attack: 0.001, decay: 1.8, sustain: 0, release: 2.5 }, volume: -18 }).connect(verb);
    const chime = new Tone.Synth({ oscillator: { type: 'triangle' }, envelope: { attack: 0.001, decay: 0.8, sustain: 0, release: 1.5 }, volume: -22 }).connect(verb);
    nodes.push(verb, pluck, bell, chime);
    seqs.push(
      new Tone.Sequence((t,n) => { if(n) pluck.triggerAttackRelease(n,'4n',t); },
        ['G4',null,null,null,null,null,'D5',null,null,null,null,null,null,null,null,null,'A4',null,null,null,null,null,null,null,'E5',null,null,null,null,null,null,null], '8n'),
      new Tone.Sequence((t,n) => { if(n) bell.triggerAttackRelease(n,'8n',t); },
        ['G5',null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,'D5',null,null,null,null,null,null,null], '8n'),
      new Tone.Sequence((t,n) => { if(n) chime.triggerAttackRelease(n,'8n',t); },
        [null,null,null,null,null,null,null,null,'B5',null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,'E6',null,null,null], '8n'),
    );

  } else if (idx === 4) {
    // ⚡ Focus Mode — 100bpm, driving, energetic, bright arps + punchy drums
    Tone.Transport.bpm.value = 100;
    Tone.Transport.swing = 0.06;
    Tone.Transport.swingSubdivision = '8n';
    const verb  = new Tone.Reverb({ decay: 1.0, wet: 0.15 }).connect(_musicGain);
    const dly   = new Tone.FeedbackDelay('16n', 0.15).connect(verb);
    const pad   = new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'triangle' }, envelope: { attack: 0.04, decay: 0.12, sustain: 0.2, release: 0.3 }, volume: -28 }).connect(verb);
    const arp   = new Tone.PluckSynth({ attackNoise: 0.8, dampening: 3000, resonance: 0.92, volume: -12 }).connect(dly);
    const kick  = new Tone.MembraneSynth({ pitchDecay: 0.05, octaves: 5, envelope: { attack: 0.001, decay: 0.25, sustain: 0, release: 0.08 }, volume: -12 }).connect(_musicGain);
    const snareFlt = new Tone.Filter(3500, 'lowpass').connect(_musicGain);
    const snare = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.1, sustain: 0, release: 0.03 }, volume: -20 }).connect(snareFlt);
    const hatFlt = new Tone.Filter(10000, 'highpass').connect(_musicGain);
    const hat   = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.018, sustain: 0, release: 0.01 }, volume: -26 }).connect(hatFlt);
    nodes.push(verb, dly, pad, arp, kick, snareFlt, snare, hatFlt, hat);
    seqs.push(
      new Tone.Sequence((t,c) => { pad.triggerAttackRelease(c,'1m',t); },
        [['A3','C4','E4'],['F3','A3','C4'],['C4','E4','G4'],['G3','B3','D4']], '1m'),
      new Tone.Sequence((t,n) => { if(n) arp.triggerAttackRelease(n,'16n',t); },
        ['A4','C5','E5','A5',null,'C5','E5',null,'F4','A4','C5',null,null,'A4','C5',null,'C5','E5','G5','C6',null,'E5','G5',null,'G4','B4','D5',null,null,'B4','D5',null], '16n'),
      new Tone.Sequence((t,v) => { if(v) kick.triggerAttackRelease('C2','8n',t); },  [1,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0], '16n'),
      new Tone.Sequence((t,v) => { if(v) snare.triggerAttackRelease('16n',t); },     [0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0], '16n'),
      new Tone.Sequence((t,v) => { if(v) hat.triggerAttackRelease('32n',t); },       [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1], '16n'),
    );
  }

  _activeSynths = nodes;
  return seqs;
}

function startTrack(idx) {
  if (!toneReady) return;
  stopCurrentTrack();
  _currentTrackIdx = idx;
  _activeSeqs = buildTrack(idx);
  _activeSeqs.forEach(s => s.start(0));
  // Restore gain after silencing old track
  if (_musicGain && !mutedMusic) {
    _musicGain.gain.setValueAtTime(musicVolume, Tone.now());
  }
  Tone.Transport.start();
  chillPlaying = true;
  updateMusicBtn();
}

function stopMusic() {
  stopCurrentTrack();
  chillPlaying = false;
  updateMusicBtn();
  document.getElementById('music-vol-group').style.display = 'none';
}

function updateMusicBtn() {
  const btn     = document.getElementById('btn-music');
  const track   = TRACKS[_currentTrackIdx];
  const nameEl  = document.getElementById('music-track-name');
  const nextBtn = document.getElementById('btn-next-track');
  const active  = chillPlaying && !mutedMusic;
  if (active) {
    btn.textContent = '⏸'; btn.className = 'active';
    if (nameEl) nameEl.textContent = track.emoji + ' ' + track.name;
    document.getElementById('music-vol-group').style.display = 'flex';
  } else if (mutedMusic) {
    btn.textContent = '🔇'; btn.className = 'muted';
  } else {
    btn.textContent = '🎵'; btn.className = '';
    if (nameEl) nameEl.textContent = '';
  }
  if (nextBtn) nextBtn.style.display = active ? 'inline-flex' : 'none';
}

// ── Canvas ────────────────────────────────────────────────────────────────────

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

function resize() {
  canvas.width  = canvas.clientWidth;
  canvas.height = canvas.clientHeight;
}
window.addEventListener('resize', resize);
resize();

// ── Tool → fish mapping ───────────────────────────────────────────────────────

const TOOL_FISH = {
  // Claude Code tools
  Bash:          { type: 'fish',     color: '#e67e22', label: 'Bash Fish' },
  Read:          { type: 'crab',     color: '#e74c3c', label: 'Read Crab' },
  Write:         { type: 'chest',    color: '#f1c40f', label: 'Write Chest' },
  Edit:          { type: 'chest',    color: '#e8c547', label: 'Edit Chest' },
  Grep:          { type: 'fish',     color: '#3498db', label: 'Grep Fish' },
  Glob:          { type: 'fish',     color: '#2ecc71', label: 'Glob Fish' },
  WebSearch:     { type: 'creature', color: '#9b59b6', label: 'Web Thing' },
  WebFetch:      { type: 'creature', color: '#8e44ad', label: 'Fetch Thing' },
  Agent:         { type: 'creature', color: '#44e8ff', label: 'Sub-Claude' },
  Task:          { type: 'creature', color: '#1abc9c', label: 'Task Thing' },
};

function fishForTool(toolName) {
  if (TOOL_FISH[toolName]) return TOOL_FISH[toolName];
  // fallback based on name patterns
  if (toolName.toLowerCase().includes('search')) return { type: 'creature', color: '#9b59b6', label: toolName };
  if (toolName.toLowerCase().includes('read'))   return { type: 'crab',     color: '#e74c3c', label: toolName };
  if (toolName.toLowerCase().includes('write'))  return { type: 'chest',    color: '#f1c40f', label: toolName };
  return { type: 'fish', color: '#7ec8e3', label: toolName };
}

// ── Quest definitions ─────────────────────────────────────────────────────────

const QUEST_DEFS = [
  // ── Easy ──────────────────────────────────────────────────────────────────
  { id: 'first_catch',  name: 'First Catch',    xp: 50,
    desc: 'Catch your first fish',
    check: () => S.fishCaught.length >= 1 },
  { id: 'catch_5',      name: 'Just Warming Up', xp: 30,
    desc: 'Catch 5 fish total',
    check: () => S.fishCaught.length >= 5,
    progress: () => [Math.min(S.fishCaught.length, 5), 5] },
  { id: 'level_2',      name: 'Apprentice',      xp: 50,
    desc: 'Reach level 2',
    check: () => S.level >= 2 },
  { id: 'night_fisher', name: 'Night Fisher',    xp: 100,
    desc: 'Catch a fish while the moon is out',
    check: () => S.fishCaught.some(f => f.atNight) },

  // ── One of each fish ──────────────────────────────────────────────────────
  { id: 'bash_first',  name: 'Shell Shock',   xp: 30, desc: 'Catch your first Bash Fish',
    check: () => S.fishCaught.some(f => f.label === 'Bash Fish') },
  { id: 'read_first',  name: 'Bookworm',      xp: 30, desc: 'Catch your first Read Crab',
    check: () => S.fishCaught.some(f => f.label === 'Read Crab') },
  { id: 'write_first', name: 'Scribe',        xp: 30, desc: 'Catch your first Write Chest',
    check: () => S.fishCaught.some(f => f.label === 'Write Chest') },
  { id: 'edit_first',  name: 'Patcher',       xp: 30, desc: 'Catch your first Edit Chest',
    check: () => S.fishCaught.some(f => f.label === 'Edit Chest') },
  { id: 'grep_first',  name: 'Regex Rookie',  xp: 30, desc: 'Catch your first Grep Fish',
    check: () => S.fishCaught.some(f => f.label === 'Grep Fish') },
  { id: 'glob_first',  name: 'Wildcard',      xp: 30, desc: 'Catch your first Glob Fish',
    check: () => S.fishCaught.some(f => f.label === 'Glob Fish') },
  { id: 'web_first',   name: 'Surfer',        xp: 30, desc: 'Catch your first Web Thing',
    check: () => S.fishCaught.some(f => f.label === 'Web Thing') },
  { id: 'fetch_first', name: 'Data Diver',    xp: 30, desc: 'Catch your first Fetch Thing',
    check: () => S.fishCaught.some(f => f.label === 'Fetch Thing') },
  { id: 'agent_first', name: 'Cloned',        xp: 50, desc: 'Catch your first Sub-Claude',
    check: () => S.fishCaught.some(f => f.label === 'Sub-Claude') },
  { id: 'task_first',  name: 'Delegator',     xp: 40, desc: 'Catch your first Task Thing',
    check: () => S.fishCaught.some(f => f.label === 'Task Thing') },

  // ── Medium ────────────────────────────────────────────────────────────────
  { id: 'type_collector', name: 'Type Collector', xp: 150,
    desc: 'Catch all 4 creature types',
    check: () => {
      const t = new Set(S.fishCaught.map(f => f.type));
      return ['fish','crab','chest','creature'].every(x => t.has(x));
    } },
  { id: 'bash_5',      name: 'Terminal Rat',  xp: 75,
    desc: 'Catch 5 Bash Fish',
    check: () => S.fishCaught.filter(f => f.label === 'Bash Fish').length >= 5,
    progress: () => [Math.min(S.fishCaught.filter(f => f.label === 'Bash Fish').length, 5), 5] },
  { id: 'web_3',       name: 'Deep Web',      xp: 75,
    desc: 'Catch 3 Web creatures',
    check: () => S.fishCaught.filter(f => f.label === 'Web Thing' || f.label === 'Fetch Thing').length >= 3,
    progress: () => [Math.min(S.fishCaught.filter(f => f.label === 'Web Thing' || f.label === 'Fetch Thing').length, 3), 3] },
  { id: 'rare_catch',  name: 'Golden Hour',   xp: 200,
    desc: 'Catch a rare golden fish',
    check: () => S.fishCaught.some(f => f.rare) },
  { id: 'catch_20',    name: 'The Hoarder',   xp: 150,
    desc: 'Catch 20 fish total',
    check: () => S.fishCaught.length >= 20,
    progress: () => [Math.min(S.fishCaught.length, 20), 20] },
  { id: 'level_5',     name: 'Seasoned',      xp: 200,
    desc: 'Reach level 5',
    check: () => S.level >= 5,
    progress: () => [Math.min(S.level, 5), 5] },
  { id: 'night_5',     name: 'Nightcrawler',  xp: 150,
    desc: 'Catch 5 fish at night',
    check: () => S.fishCaught.filter(f => f.atNight).length >= 5,
    progress: () => [Math.min(S.fishCaught.filter(f => f.atNight).length, 5), 5] },
  { id: 'agent_3',     name: 'Hive Mind',     xp: 150,
    desc: 'Catch 3 Sub-Claudes',
    check: () => S.fishCaught.filter(f => f.label === 'Sub-Claude').length >= 3,
    progress: () => [Math.min(S.fishCaught.filter(f => f.label === 'Sub-Claude').length, 3), 3] },
  { id: 'rare_3',      name: 'Lucky Strike',  xp: 300,
    desc: 'Catch 3 rare golden fish',
    check: () => S.fishCaught.filter(f => f.rare).length >= 3,
    progress: () => [Math.min(S.fishCaught.filter(f => f.rare).length, 3), 3] },

  // ── Hard ──────────────────────────────────────────────────────────────────
  { id: 'full_library', name: 'Full Stack',   xp: 400,
    desc: 'Catch every fish type at least once',
    check: () => {
      const labels = new Set(S.fishCaught.map(f => f.label));
      return Object.values(TOOL_FISH).every(d => labels.has(d.label));
    } },
  { id: 'catch_50',    name: 'Dedicated',     xp: 300,
    desc: 'Catch 50 fish total',
    check: () => S.fishCaught.length >= 50,
    progress: () => [Math.min(S.fishCaught.length, 50), 50] },
  { id: 'level_10',    name: 'Veteran',       xp: 500,
    desc: 'Reach level 10',
    check: () => S.level >= 10,
    progress: () => [Math.min(S.level, 10), 10] },
  { id: 'catch_100',   name: 'Obsessed',      xp: 750,
    desc: 'Catch 100 fish total',
    check: () => S.fishCaught.length >= 100,
    progress: () => [Math.min(S.fishCaught.length, 100), 100] },
  { id: 'rare_5',      name: 'Gilded',        xp: 600,
    desc: 'Catch 5 rare golden fish',
    check: () => S.fishCaught.filter(f => f.rare).length >= 5,
    progress: () => [Math.min(S.fishCaught.filter(f => f.rare).length, 5), 5] },
  { id: 'level_20',    name: 'Legend',        xp: 1000,
    desc: 'Reach level 20',
    check: () => S.level >= 20,
    progress: () => [Math.min(S.level, 20), 20] },
];

function checkQuests() {
  let changed = false;
  for (const q of QUEST_DEFS) {
    if (S.questsCompleted.includes(q.id)) continue;
    if (q.check()) {
      S.questsCompleted.push(q.id);
      const leveled = addXP(q.xp, canvas.width * 0.5, S._wY - 60);
      if (leveled) { flashLevelUp(); sounds.levelUp(); }
      showAchievementToast(q.name, q.xp);
      changed = true;
    }
  }
  if (changed) { saveToDisk(); renderQuestPanel(); }
}

let _toastTimer = null;
function showAchievementToast(name, xp) {
  const toast = document.getElementById('achievement-toast');
  document.getElementById('toast-text').textContent = name;
  document.getElementById('toast-xp').textContent = '+' + xp + ' XP';
  toast.classList.add('show');
  if (_toastTimer) clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => toast.classList.remove('show'), 3500);
}

function renderQuestPanel() {
  const list = document.getElementById('quest-list');
  if (!list) return;
  list.innerHTML = '';
  const active    = QUEST_DEFS.filter(q => !S.questsCompleted.includes(q.id));
  const completed = QUEST_DEFS.filter(q =>  S.questsCompleted.includes(q.id));
  for (const q of [...active, ...completed]) {
    const done = S.questsCompleted.includes(q.id);
    const el = document.createElement('div');
    el.className = 'quest-item' + (done ? ' done' : '');
    let prog = '';
    if (!done && q.progress) {
      const [cur, max] = q.progress();
      prog = `<div class="qprog"><div class="qprog-fill" style="width:${(cur/max*100).toFixed(0)}%"></div></div><span class="qcount">${cur}/${max}</span>`;
    }
    el.innerHTML = `<div class="qname">${done ? '<span class="check">✓</span>' : ''}${q.name}</div><div class="qdesc">${q.desc}</div>${prog}${!done ? `<div class="qxp">+${q.xp} XP</div>` : ''}`;
    list.appendChild(el);
  }
}

function renderLibPanel() {
  const list = document.getElementById('lib-list');
  if (!list) return;
  list.innerHTML = '';
  // Count catches per label, track rares
  const counts = {}, rares = {};
  for (const f of S.fishCaught) {
    counts[f.label] = (counts[f.label] || 0) + 1;
    if (f.rare) rares[f.label] = (rares[f.label] || 0) + 1;
  }
  // Show all known fish types, seen ones bright, unseen dimmed
  for (const [tool, def] of Object.entries(TOOL_FISH)) {
    const count = counts[def.label] || 0;
    const rareCount = rares[def.label] || 0;
    const el = document.createElement('div');
    el.className = 'lib-item' + (count === 0 ? ' lib-unseen' : '');
    el.innerHTML = `<div class="lib-dot" style="background:${count > 0 ? def.color : '#2a2a4a'}"></div>`
      + `<span class="lib-name">${def.label}</span>`
      + (rareCount > 0 ? `<span class="lib-rare">★${rareCount}</span>` : '')
      + `<span class="lib-count">${count > 0 ? 'x' + count : '?'}</span>`;
    list.appendChild(el);
  }
}

// ── Cosmetics shop ────────────────────────────────────────────────────────────

const COSMETICS = {
  hat: [
    { id: 'straw',   name: 'Straw Hat',    level: 1,  cost: 0   },
    { id: 'cap',     name: 'Blue Cap',      level: 2,  cost: 30  },
    { id: 'bucket',  name: 'Bucket Hat',    level: 3,  cost: 40  },
    { id: 'redcap',  name: 'Red Cap',       level: 4,  cost: 50  },
    { id: 'beanie',  name: 'Beanie',        level: 5,  cost: 60  },
    { id: 'party',   name: 'Party Hat',     level: 6,  cost: 70  },
    { id: 'tophat',  name: 'Top Hat',       level: 7,  cost: 90  },
    { id: 'sombrero',name: 'Sombrero',      level: 8,  cost: 100 },
    { id: 'helmet',  name: 'Hard Hat',      level: 9,  cost: 110 },
    { id: 'beret',   name: 'Beret',         level: 10, cost: 120 },
    { id: 'wizard',  name: 'Wizard Hat',    level: 11, cost: 150 },
    { id: 'pirate',  name: 'Pirate Hat',    level: 13, cost: 200 },
    { id: 'tinfoil', name: 'Tinfoil Hat',   level: 15, cost: 240 },
    { id: 'crown',   name: 'Crown',         level: 16, cost: 300 },
    { id: 'halo',    name: 'Halo',          level: 20, cost: 500 },
  ],
  boat: [
    { id: 'wood',    name: 'Wood Boat',     level: 1,  cost: 0   },
    { id: 'canoe',   name: 'Canoe',         level: 2,  cost: 40  },
    { id: 'duck',    name: 'Rubber Duck',   level: 3,  cost: 50  },
    { id: 'blue',    name: 'Blue Vessel',   level: 4,  cost: 60  },
    { id: 'bathtub', name: 'Bathtub',       level: 5,  cost: 70  },
    { id: 'red',     name: 'Red Fisher',    level: 6,  cost: 80  },
    { id: 'cardboard',name:'Cardboard Box', level: 7,  cost: 90  },
    { id: 'shoe',    name: 'Floating Shoe', level: 8,  cost: 120 },
    { id: 'raft',    name: 'Log Raft',      level: 9,  cost: 130 },
    { id: 'race',    name: 'Race Boat',     level: 10, cost: 160 },
    { id: 'submarine',name:'Submarine',     level: 11, cost: 180 },
    { id: 'dark',    name: 'Midnight',      level: 12, cost: 200 },
    { id: 'pirateship', name: 'Pirate Ship',level: 14, cost: 260 },
    { id: 'gold',    name: 'Golden Barge',  level: 17, cost: 380 },
    { id: 'ufo',     name: 'UFO',           level: 20, cost: 600 },
  ],
  rod: [
    { id: 'bamboo',  name: 'Bamboo Rod',    level: 1,  cost: 0   },
    { id: 'carbon',  name: 'Carbon Rod',    level: 2,  cost: 35  },
    { id: 'noodle',  name: 'Pool Noodle',   level: 3,  cost: 40  },
    { id: 'blue',    name: 'Blue Steel',    level: 4,  cost: 55  },
    { id: 'wand',    name: 'Magic Wand',    level: 5,  cost: 65  },
    { id: 'pink',    name: 'Pink Rod',      level: 6,  cost: 70  },
    { id: 'selfie',  name: 'Selfie Stick',  level: 7,  cost: 80  },
    { id: 'gold',    name: 'Gold Rod',      level: 8,  cost: 100 },
    { id: 'plunger', name: 'Plunger',       level: 9,  cost: 110 },
    { id: 'neon',    name: 'Neon Green',    level: 10, cost: 130 },
    { id: 'crystal', name: 'Crystal Rod',   level: 13, cost: 200 },
    { id: 'lightsaber',name:'Lightsaber',   level: 14, cost: 240 },
    { id: 'fire',    name: 'Fire Rod',      level: 16, cost: 280 },
    { id: 'trident', name: 'Trident',       level: 17, cost: 320 },
    { id: 'rainbow', name: 'Rainbow Rod',   level: 20, cost: 500 },
  ],
  bobber: [
    { id: 'none',    name: 'No Bobber',     level: 1,  cost: 0   },
    { id: 'classic', name: 'Classic',       level: 1,  cost: 0   },
    { id: 'blue',    name: 'Blue',          level: 2,  cost: 20  },
    { id: 'yellow',  name: 'Yellow',        level: 3,  cost: 30  },
    { id: 'cork',    name: 'Cork',          level: 4,  cost: 45  },
    { id: 'pizza',   name: 'Pizza Slice',   level: 5,  cost: 55  },
    { id: 'oval',    name: 'Oval Float',    level: 6,  cost: 65  },
    { id: 'heart',   name: 'Heart',         level: 7,  cost: 80  },
    { id: 'glow',    name: 'Glow Float',    level: 8,  cost: 100 },
    { id: 'rubber_duck', name: 'Rubber Duck', level: 9, cost: 120 },
    { id: 'neon',    name: 'Neon',          level: 10, cost: 140 },
    { id: 'skull',   name: 'Skull',         level: 11, cost: 160 },
    { id: 'crystal', name: 'Crystal',       level: 13, cost: 200 },
    { id: 'gem',     name: 'Gem',           level: 14, cost: 220 },
    { id: 'star',    name: 'Star Float',    level: 16, cost: 280 },
    { id: 'ring',    name: 'Ring Float',    level: 17, cost: 300 },
  ],
  lure: [
    { id: 'none',      name: 'Live Worm',   level: 1,  cost: 0,  bait: true },
    { id: 'hotdog',    name: 'Hotdog',      level: 2,  cost: 25, bait: true },
    { id: 'crawler',   name: 'Big Crawler', level: 3,  cost: 40, bait: true },
    { id: 'coin',      name: 'Shiny Coin',  level: 4,  cost: 50  },
    { id: 'frog',      name: 'Frog',        level: 5,  cost: 65  },
    { id: 'rubber_duck',name:'Mini Duck',   level: 6,  cost: 75  },
    { id: 'spinner',   name: 'Spinner',     level: 7,  cost: 90  },
    { id: 'ghost',     name: 'Ghost',       level: 8,  cost: 100 },
    { id: 'spoon',     name: 'Silver Spoon',level: 9,  cost: 120 },
    { id: 'sausage',   name: 'Sausage',     level: 10, cost: 135, bait: true },
    { id: 'fly',       name: 'Fly Lure',    level: 11, cost: 160 },
    { id: 'cheese',    name: 'Cheese',      level: 12, cost: 175, bait: true },
    { id: 'firefly',   name: 'Firefly',     level: 14, cost: 220 },
    { id: 'deepdiver', name: 'Deep Diver',  level: 17, cost: 320 },
    { id: 'squid',     name: 'Squid',       level: 20, cost: 450 },
  ],
  buddy: [
    { id: 'none',    name: 'No Buddy',      level: 1,  cost: 0   },
    { id: 'cat',     name: 'Cat',           level: 3,  cost: 45  },
    { id: 'dog',     name: 'Dog',           level: 6,  cost: 80  },
    { id: 'duck',    name: 'Duck',          level: 9,  cost: 120 },
    { id: 'gnome',   name: 'Garden Gnome',  level: 12, cost: 180 },
    { id: 'parrot',  name: 'Parrot',        level: 16, cost: 300 },
  ],
  water: [
    { id: 'normal',  name: 'Normal',        level: 1,  cost: 0   },
    { id: 'tea',     name: 'Earl Grey',     level: 4,  cost: 50  },
    { id: 'lava',    name: 'Lava Pond',     level: 8,  cost: 120 },
    { id: 'slime',   name: 'Slime Pit',     level: 12, cost: 190 },
    { id: 'galaxy',  name: 'Galaxy Water',  level: 17, cost: 400 },
  ],
};

const HAT_COLORS = {
  straw:   ['#d4a017', '#b8860b'],
  cap:     ['#2980b9', '#1a5276'],
  bucket:  ['#e8d080', '#c4a840'],
  redcap:  ['#c0392b', '#7b241c'],
  beanie:  ['#27ae60', '#1e8449'],
  party:   ['#e74c3c', '#f39c12'],
  tophat:  ['#2c2c2c', '#1a1a1a'],
  sombrero:['#c8a050', '#8a6030'],
  helmet:  ['#e67e22', '#ca6f1e'],
  beret:   ['#2c3e50', '#1a252f'],
  wizard:  ['#8e44ad', '#6c3483'],
  pirate:  ['#1a1a1a', '#c0392b'],
  tinfoil: ['#c0c8d0', '#a0a8b0'],
  crown:   ['#ffd700', '#f39c12'],
  halo:    ['#fff080', '#ffd700'],
};

const BOAT_COLORS = {
  wood:       ['#8B5E3C', '#6B3E1C'],
  canoe:      ['#c07840', '#8B5E3C'],
  duck:       ['#f1c40f', '#e67e22'],
  blue:       ['#2980b9', '#1a5276'],
  bathtub:    ['#ecf0f1', '#bdc3c7'],
  red:        ['#c0392b', '#7b241c'],
  cardboard:  ['#c8a050', '#9a7030'],
  shoe:       ['#e8e0c8', '#c8b898'],
  raft:       ['#8B5E3C', '#5a3e1c'],
  race:       ['#e74c3c', '#c0392b'],
  submarine:  ['#27ae60', '#1e8449'],
  dark:       ['#1e1e3a', '#0e0e1e'],
  pirateship: ['#2c1810', '#1a0e08'],
  gold:       ['#c8a000', '#a07800'],
  ufo:        ['#7ec8e3', '#4a8fff'],
};

const BOBBER_COLORS = {
  classic:     { top: '#e74c3c', bot: '#f0f0f0' },
  blue:        { top: '#2980b9', bot: '#ecf0f1' },
  yellow:      { top: '#f1c40f', bot: '#1a1a2e' },
  cork:        { top: '#c8a060', bot: '#8B6914' },
  pizza:       { top: '#e74c3c', bot: '#f39c12' },
  oval:        { top: '#e74c3c', bot: '#f0f0f0', oval: true },
  heart:       { top: '#e74c3c', bot: '#c0392b' },
  glow:        { top: '#7ec8e3', bot: '#4a8fff', glows: true },
  rubber_duck: { top: '#f1c40f', bot: '#e67e22' },
  neon:        { top: '#00ff88', bot: '#006644', glows: true },
  skull:       { top: '#ecf0f1', bot: '#bdc3c7' },
  crystal:     { top: '#c8e8ff', bot: '#e8f8ff', crystal: true },
  gem:         { top: '#9b59b6', bot: '#8e44ad', crystal: true },
  star:        { top: '#ffd700', bot: '#f39c12', star: true },
  ring:        { top: '#ffd700', bot: '#f39c12' },
};

const LURE_COLORS = {
  crawler:    { color: '#e67e22', dark: '#d45000' },
  hotdog:     { color: '#e67e22', dark: '#c0392b', bun: '#f39c12' },
  coin:       { color: '#ffd700', dark: '#c8a000', shine: '#ffe566' },
  frog:       { color: '#2ecc71', dark: '#1a7a30', belly: '#f1c40f' },
  rubber_duck:{ color: '#f1c40f', dark: '#e67e22', beak: '#e67e22' },
  spinner:    { color: '#bdc3c7', blade: '#ecf0f1' },
  ghost:      { color: '#ecf0f1', dark: '#bdc3c7', glow: '#ffffff' },
  spoon:      { color: '#c8c8cc', shine: '#ecf0f1' },
  sausage:    { color: '#c0392b', dark: '#922b21', shine: '#e74c3c' },
  fly:        { color: '#d4688a', wing: '#9b59b6' },
  cheese:     { color: '#f1c40f', dark: '#d4ac0d', hole: '#c8a000' },
  firefly:    { color: '#ffff44', dark: '#888800', glows: true },
  deepdiver:  { color: '#c0392b', belly: '#e8e0d0' },
  squid:      { color: '#9b59b6', dark: '#6c3483' },
};

const ROD_COLORS = {
  bamboo:    '#8B7355',
  carbon:    '#4a4a5a',
  noodle:    '#e74c3c',
  blue:      '#2980b9',
  wand:      '#9b59b6',
  pink:      '#e91e8c',
  selfie:    '#bdc3c7',
  gold:      '#ffd700',
  plunger:   '#e67e22',
  neon:      '#39ff14',
  crystal:   '#7ec8e3',
  lightsaber:'#4a8fff',
  fire:      '#e74c3c',
  trident:   '#3498db',
  rainbow:   '#ff6b6b',
};

let _shopTab = 'hat';

function drawShopPreview(canvas, category, id) {
  const c = canvas.getContext('2d');
  c.clearRect(0, 0, 36, 36);
  const s = 3;
  const p = (x, y, col, w=1, h=1) => { c.fillStyle = col; c.fillRect(x*s, y*s, w*s, h*s); };

  if (category === 'hat') {
    const [col1, col2] = HAT_COLORS[id] || ['#888','#555'];
    if (id === 'straw') {
      p(1,5, col2, 10, 1); // wide brim
      p(3,3, col1, 6, 2);  // top
      p(4,2, col1, 4, 1);
    } else if (id === 'cap' || id === 'redcap') {
      p(2,5, col2, 8, 1); // brim
      p(9,6, col2, 2, 1); // visor
      p(2,3, col1, 8, 2); // body
      p(3,2, col1, 6, 1);
    } else if (id === 'wizard') {
      p(4,0, col1, 4, 1);
      p(3,1, col1, 5, 2);
      p(2,3, col1, 7, 2);
      p(1,5, col2, 10, 1); // brim
      // Stars
      c.fillStyle = '#ffd700';
      c.fillRect(4*s, 1*s, s, s);
      c.fillRect(6*s, 3*s, s, s);
    } else if (id === 'beanie') {
      p(1,5, col2, 10, 2); // fold
      p(2,2, col1, 8, 3);  // body
      p(4,1, col1, 4, 1);
      p(5,0, col2, 2, 1);  // bobble
    } else if (id === 'tophat') {
      p(0,5, col2, 12, 2); // brim
      p(2,1, col1, 8, 4);  // tall body
    } else if (id === 'helmet') {
      p(1,5, col2, 10, 1); // brim
      p(1,2, col1, 10, 3); // body
      p(2,1, col1, 8, 1);
      p(3,6, '#fff8', 5, 1); // visor
    } else if (id === 'pirate') {
      p(0,5, col2, 12, 2); // brim
      p(2,2, col1, 8, 3);  // body
      p(1,1, col1, 2, 2);  // left horn
      p(9,1, col1, 2, 2);  // right horn
      p(4,3, '#f0f0f0', 4, 1); // skull stripe
    } else if (id === 'crown') {
      p(1,3, col1, 1, 3);
      p(3,2, col1, 1, 4);
      p(5,1, col1, 2, 5);
      p(8,2, col1, 1, 4);
      p(10,3,col1, 1, 3);
      p(1,4, col1, 10, 2);
      c.fillStyle = '#e74c3c'; c.fillRect(5*s, 3*s, s, s);
      c.fillStyle = '#3498db'; c.fillRect(7*s, 3*s, s, s);
    } else if (id === 'halo') {
      c.strokeStyle = col1;
      c.lineWidth = 2;
      c.shadowColor = col1;
      c.shadowBlur = 6;
      c.beginPath();
      c.ellipse(6*s, 3*s, 5*s, 2*s, 0, 0, Math.PI * 2);
      c.stroke();
      c.shadowBlur = 0;
    } else if (id === 'bucket') {
      p(1,5, col2, 10, 2); // wide brim
      p(2,2, col1, 8, 3);  // wide low crown
      p(3,1, col2, 6, 1);  // top fold
    } else if (id === 'party') {
      p(5,0, col1, 2, 1);
      p(4,1, col1, 4, 2);
      p(3,3, col1, 6, 2);
      p(2,5, col2, 8, 2); // brim
      c.fillStyle = '#ffd700'; c.fillRect(5*s, 0*s, s, s); // star tip
      c.fillStyle = '#ffffff'; c.fillRect(4*s, 2*s, s, s); // dot
      c.fillStyle = '#ffffff'; c.fillRect(7*s, 3*s, s, s); // dot
    } else if (id === 'sombrero') {
      p(0,5, col2, 12, 2); // very wide brim
      p(2,3, col1, 8, 2);
      p(3,1, col1, 6, 2);
      p(4,0, col1, 4, 1);
      c.fillStyle = '#e74c3c'; c.fillRect(2*s, 5*s, 8*s, s); // band
    } else if (id === 'beret') {
      p(1,4, col1, 10, 1); // brim edge
      p(2,2, col1, 8, 2);
      p(3,1, col1, 6, 1);
      p(4,0, col2, 4, 1);
      p(9,2, col2, 2, 2);  // side puff
    } else if (id === 'tinfoil') {
      p(2,5, col2, 8, 1); // brim
      p(3,3, col1, 6, 2);
      p(4,1, col1, 4, 2);
      p(5,0, col1, 2, 1);
      // shiny creases
      c.fillStyle = '#ffffff88'; c.fillRect(4*s, 1*s, s, 4*s);
      c.fillStyle = '#ffffff44'; c.fillRect(7*s, 2*s, s, 3*s);
    }
  } else if (category === 'boat') {
    const [col1, col2] = BOAT_COLORS[id] || ['#8B5E3C','#6B3E1C'];

    if (id === 'wood') {
      // Classic rowboat — wide flat hull, oars on sides
      p(0,7, '#6a4a20', 2, 1);   // left oar
      p(10,7, '#6a4a20', 2, 1);  // right oar
      p(1,6, col1, 10, 2);       // hull body
      p(2,8, col2, 8, 1);        // hull bottom
      p(3,9, col2, 6, 1);        // keel
      p(4,5, '#8B7355', 4, 1);   // bench seat

    } else if (id === 'canoe') {
      // Narrow canoe — pointed ends, paddle centre
      p(6,4, '#6a4a20', 1, 4);   // paddle shaft
      p(4,6, '#8B7355', 4, 1);   // paddle blade
      p(3,6, col1, 6, 1);        // upper rim
      p(1,7, col1, 10, 2);       // body
      p(2,9, col2, 8, 1);        // keel
      p(3,10, col2, 6, 1);       // narrow bottom

    } else if (id === 'blue' || id === 'red') {
      // Sailboat — triangular jib + main sail
      p(1,7, col1, 10, 2);       // hull
      p(2,9, col2, 8, 1);
      p(3,10, col2, 6, 1);
      p(6,0, '#6a4a20', 1, 7);   // mast
      p(7,1, '#e8e0d0', 4, 3);   // main sail
      p(7,3, '#d0c8b8', 3, 2);
      p(4,2, col1, 2, 4);        // jib (front sail)

    } else if (id === 'shoe') {
      // Floating boot — toe left, ankle shaft, heel right
      p(1,10, col2, 10, 1);      // sole
      p(1,8, col1, 4, 2);        // toe box
      p(0,9, col2, 2, 1);        // toe tip
      p(3,3, col1, 3, 7);        // ankle shaft
      p(6,6, col1, 5, 4);        // heel block
      p(4,2, '#f0f0f0', 2, 1);   // tongue
      p(4,3, '#ffffff', 1, 1);   // lace 1
      p(5,4, '#ffffff', 1, 1);   // lace 2
      p(4,5, '#ffffff', 1, 1);   // lace 3

    } else if (id === 'race') {
      // Racing speedboat — flat and sleek with cockpit
      p(1,8, col1, 10, 1);       // hull deck
      p(0,9, col2, 12, 1);       // hull side
      p(1,10, col2, 10, 1);      // bottom
      p(3,6, '#1a1a1a', 6, 2);   // cockpit
      p(4,5, '#334455', 4, 1);   // windshield
      p(9,8, col2, 3, 1);        // engine exhaust
      p(0,8, '#ffffff', 1, 2);   // nose tip

    } else if (id === 'dark') {
      // Fishing trawler — cabin + smokestack
      p(1,8, col1, 10, 2);       // hull
      p(2,10, col2, 8, 1);
      p(3,11, col2, 6, 1);
      p(4,5, col2, 4, 3);        // cabin
      p(4,5, '#4a6a8a', 2, 1);   // cabin window
      p(7,3, '#2a2a3a', 1, 2);   // smokestack
      p(6,3, '#1a1a2a', 3, 1);   // smoke puff

    } else if (id === 'pirateship') {
      // Galleon — two sails, skull flag, cannon ports
      p(1,9, col1, 10, 2);       // hull
      p(2,11, col2, 8, 1);
      p(6,0, '#8B6914', 1, 9);   // mast
      p(2,2, '#d4c8a8', 4, 4);   // left sail
      p(7,1, '#d4c8a8', 4, 5);   // right sail
      p(7,2, '#e8e8e8', 2, 1);   // skull bg
      p(7,3, '#1a1a1a', 1, 1);   // skull eye L
      p(8,3, '#1a1a1a', 1, 1);   // skull eye R
      p(0,9, col2, 1, 2);        // cannon port L
      p(11,9, col2, 1, 2);       // cannon port R

    } else if (id === 'gold') {
      // Ornate royal barge — golden sail + trim
      p(1,7, col1, 10, 3);       // hull
      p(2,10, col2, 8, 1);
      p(3,11, col2, 6, 1);
      p(6,0, '#a07800', 1, 7);   // mast
      p(7,1, col1, 4, 4);        // golden sail
      p(1,7, '#ffe566', 10, 1);  // top trim
      p(1,9, '#ffe566', 10, 1);  // bottom trim
      p(5,0, '#ffd700', 1, 1);   // crown tip
      p(6,0, '#ffd700', 1, 1);
      p(7,0, '#ffd700', 1, 1);

    } else if (id === 'ufo') {
      // Flying saucer — dome on disc with coloured lights
      p(4,2, '#c8e8ff', 4, 1);   // dome top
      p(3,3, '#7ec8e3', 6, 3);   // dome body
      p(1,6, col1, 10, 2);       // disc
      p(2,8, col2, 8, 1);        // underside
      c.fillStyle = '#ffff44'; c.fillRect(2*s, 7*s, s, s);   // light 1
      c.fillStyle = '#ff44ff'; c.fillRect(5*s, 7*s, s, s);   // light 2
      c.fillStyle = '#44ffff'; c.fillRect(8*s, 7*s, s, s);   // light 3
      c.fillStyle = col2 + '55';
      c.beginPath(); c.ellipse(6*s, 9*s, 5*s, s, 0, 0, Math.PI*2); c.fill(); // glow

    } else if (id === 'duck') {
      // Yellow rubber duck
      p(1,8, col1, 10, 2);   // body
      p(2,10, col2, 8, 1);
      p(3,5, col1, 5, 3);    // head
      p(4,4, col1, 3, 1);
      p(8,6, col2, 3, 2);    // beak
      c.fillStyle = '#1a1a1a'; c.fillRect(5*s, 5*s, s, s); // eye
    } else if (id === 'bathtub') {
      p(0,9, col2, 12, 2);   // wide flat bottom
      p(0,6, col1, 2, 3);    // left wall
      p(10,6, col1, 2, 3);   // right wall
      p(1,5, '#c0c0c0', 2, 2); // faucet
      p(7,5, col2, 4, 2);    // soap dish bump
      c.fillStyle = '#ffffff44'; c.fillRect(2*s, 7*s, 6*s, 2*s); // water in tub
    } else if (id === 'cardboard') {
      p(1,5, col1, 10, 6);   // box body
      p(0,5, col2, 1, 6);    // left edge
      p(11,5, col2, 1, 6);   // right edge
      p(1,4, col2, 3, 1);    // left flap
      p(5,3, col2, 4, 2);    // right flap open
      c.fillStyle = col2; c.fillRect(4*s, 5*s, s, 4*s); // center crease
      c.fillStyle = '#e74c3c'; c.fillRect(3*s, 7*s, 4*s, s); // FRAGILE sticker
    } else if (id === 'raft') {
      // Three logs lashed together
      p(0,8, '#8B5E3C', 12, 2);   // log 1
      p(0,6, '#7a4e2c', 12, 2);   // log 2
      p(0,4, '#6a3e1c', 12, 2);   // log 3
      p(3,3, '#c8a050', 1, 6);    // lashing rope L
      p(8,3, '#c8a050', 1, 6);    // lashing rope R
    } else if (id === 'submarine') {
      p(2,5, col1, 8, 4);    // hull
      p(1,6, col2, 1, 2);    // left nose
      p(11,6, col2, 1, 2);   // right nose
      p(5,3, col2, 3, 2);    // conning tower
      p(6,1, '#888', 1, 2);  // periscope
      c.fillStyle = '#c8e8ff'; c.fillRect(3*s, 6*s, 2*s, 2*s); // porthole L
      c.fillStyle = '#c8e8ff'; c.fillRect(7*s, 6*s, 2*s, 2*s); // porthole R
    } else {
      // Fallback sailboat
      p(1,7, col1, 10, 2);
      p(2,9, col2, 8, 1);
      p(3,10, col2, 6, 1);
      p(6,1, '#6a4a20', 1, 6);
      p(7,2, '#e8e0d0', 4, 2);
      p(7,3, '#d0c8b8', 3, 2);
    }

  } else if (category === 'rod') {
    const col = ROD_COLORS[id] || '#8B7355';
    c.strokeStyle = col;
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(2*s, 10*s);
    c.quadraticCurveTo(5*s, 4*s, 10*s, 1*s);
    c.stroke();
    c.fillStyle = '#aaaadd';
    c.fillRect(10*s, 1*s, s, s);
    if (id === 'gold') {
      c.fillStyle = '#ffd70055';
      c.beginPath(); c.arc(6*s, 5*s, 2*s, 0, Math.PI*2); c.fill();
    } else if (id === 'crystal') {
      c.strokeStyle = '#7ec8e366'; c.lineWidth = 4;
      c.beginPath(); c.moveTo(2*s, 10*s); c.quadraticCurveTo(5*s, 4*s, 10*s, 1*s); c.stroke();
    } else if (id === 'neon') {
      c.shadowColor = ROD_COLORS.neon; c.shadowBlur = 6;
      c.strokeStyle = ROD_COLORS.neon; c.lineWidth = 2;
      c.beginPath(); c.moveTo(2*s, 10*s); c.quadraticCurveTo(5*s, 4*s, 10*s, 1*s); c.stroke();
      c.shadowBlur = 0;
    } else if (id === 'fire') {
      c.strokeStyle = '#f39c12'; c.lineWidth = 3;
      c.beginPath(); c.moveTo(2*s, 10*s); c.quadraticCurveTo(5*s, 4*s, 10*s, 1*s); c.stroke();
      c.strokeStyle = '#e74c3c'; c.lineWidth = 1;
      c.beginPath(); c.moveTo(2*s, 10*s); c.quadraticCurveTo(5*s, 4*s, 10*s, 1*s); c.stroke();
    } else if (id === 'rainbow') {
      const cols = ['#ff6b6b','#ffd700','#2ecc71','#4a8fff','#9b59b6'];
      cols.forEach((col, i) => {
        c.strokeStyle = col; c.lineWidth = 1.5; c.globalAlpha = 0.8;
        c.beginPath(); c.moveTo((2+i*0.3)*s, (10-i*0.3)*s);
        c.quadraticCurveTo(5*s, (4-i*0.2)*s, (10+i*0.2)*s, 1*s); c.stroke();
      });
      c.globalAlpha = 1;
    }
    if (id === 'noodle') {
      c.clearRect(0, 0, 36, 36);
      c.strokeStyle = ROD_COLORS.noodle; c.lineWidth = 5;
      c.beginPath(); c.moveTo(2*s, 10*s); c.quadraticCurveTo(5*s, 4*s, 10*s, 1*s); c.stroke();
      c.strokeStyle = '#ff9999'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(2*s, 10*s); c.quadraticCurveTo(5*s, 4*s, 10*s, 1*s); c.stroke();
    } else if (id === 'wand') {
      c.clearRect(0, 0, 36, 36);
      c.strokeStyle = ROD_COLORS.wand; c.lineWidth = 2;
      c.beginPath(); c.moveTo(2*s, 10*s); c.lineTo(10*s, 1*s); c.stroke();
      c.shadowColor = '#ffd700'; c.shadowBlur = 8;
      c.fillStyle = '#ffd700';
      c.beginPath(); c.arc(10*s, 1*s, 2*s, 0, Math.PI*2); c.fill();
      c.fillStyle = '#ffd70088';
      c.beginPath(); c.arc(10*s, 1*s, 3*s, 0, Math.PI*2); c.fill();
      c.shadowBlur = 0;
    } else if (id === 'selfie') {
      c.clearRect(0, 0, 36, 36);
      c.strokeStyle = ROD_COLORS.selfie; c.lineWidth = 2;
      c.beginPath(); c.moveTo(2*s, 10*s); c.lineTo(10*s, 1*s); c.stroke();
      p(8,0, '#2c3e50', 4, 3);
      p(9,0, '#4a8fff', 2, 2);
    } else if (id === 'plunger') {
      c.clearRect(0, 0, 36, 36);
      c.strokeStyle = ROD_COLORS.plunger; c.lineWidth = 2;
      c.beginPath(); c.moveTo(2*s, 10*s); c.lineTo(8*s, 2*s); c.stroke();
      c.fillStyle = ROD_COLORS.plunger;
      c.beginPath(); c.arc(9*s, 1*s, 2*s, 0, Math.PI); c.fill();
      c.fillStyle = '#e67e2244';
      c.beginPath(); c.ellipse(9*s, 3*s, 3*s, s, 0, 0, Math.PI*2); c.fill();
    } else if (id === 'lightsaber') {
      c.clearRect(0, 0, 36, 36);
      c.strokeStyle = '#888888'; c.lineWidth = 4;
      c.beginPath(); c.moveTo(2*s, 10*s); c.lineTo(4*s, 7*s); c.stroke();
      c.shadowColor = ROD_COLORS.lightsaber; c.shadowBlur = 12;
      c.strokeStyle = ROD_COLORS.lightsaber; c.lineWidth = 2;
      c.beginPath(); c.moveTo(4*s, 7*s); c.lineTo(10*s, 1*s); c.stroke();
      c.strokeStyle = '#ffffff'; c.lineWidth = 1;
      c.beginPath(); c.moveTo(4*s, 7*s); c.lineTo(10*s, 1*s); c.stroke();
      c.shadowBlur = 0;
    } else if (id === 'trident') {
      c.clearRect(0, 0, 36, 36);
      c.strokeStyle = ROD_COLORS.trident; c.lineWidth = 2;
      c.beginPath(); c.moveTo(2*s, 10*s); c.lineTo(7*s, 2*s); c.stroke();
      c.fillStyle = ROD_COLORS.trident;
      c.fillRect(5*s, 0*s, s, 3*s); // left prong
      c.fillRect(7*s, 0*s, s, 4*s); // center prong
      c.fillRect(9*s, 0*s, s, 3*s); // right prong
      c.fillRect(5*s, 3*s, 5*s, s); // crossbar
    }

  } else if (category === 'bobber') {
    const bc = BOBBER_COLORS[id];

    if (id === 'none') {
      // No bobber — just a cross / empty indicator
      c.strokeStyle = '#4a4a6a'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(3*s, 3*s); c.lineTo(9*s, 9*s); c.stroke();
      c.beginPath(); c.moveTo(9*s, 3*s); c.lineTo(3*s, 9*s); c.stroke();

    } else if (id === 'oval') {
      // Tall oval float
      p(6,0, '#6a4a20', 1, 2);
      c.fillStyle = bc.top; c.beginPath(); c.ellipse(6*s, 5*s, 2.5*s, 4*s, 0, 0, Math.PI*2); c.fill();
      c.fillStyle = bc.bot; c.beginPath(); c.ellipse(6*s, 8*s, 2.5*s, 2.5*s, 0, 0, Math.PI*2); c.fill();

    } else if (id === 'star') {
      // Star shape
      c.fillStyle = bc.top;
      c.beginPath();
      for (let i = 0; i < 5; i++) {
        const a = (i * 4 * Math.PI / 5) - Math.PI / 2;
        const ai = a + (2 * Math.PI / 5);
        if (i === 0) c.moveTo(6*s + Math.cos(a)*4*s, 6*s + Math.sin(a)*4*s);
        else c.lineTo(6*s + Math.cos(a)*4*s, 6*s + Math.sin(a)*4*s);
        c.lineTo(6*s + Math.cos(ai)*2*s, 6*s + Math.sin(ai)*2*s);
      }
      c.closePath(); c.fill();

    } else if (id === 'crystal') {
      c.fillStyle = bc.top + 'cc';
      c.beginPath(); c.arc(6*s, 6*s, 4*s, 0, Math.PI*2); c.fill();
      c.fillStyle = '#ffffff55';
      c.beginPath(); c.arc(5*s, 5*s, 1.5*s, 0, Math.PI*2); c.fill();

    } else if (id === 'pizza') {
      c.fillStyle = '#f39c12';
      c.beginPath(); c.moveTo(6*s, 2*s); c.lineTo(2*s, 10*s); c.lineTo(10*s, 10*s); c.closePath(); c.fill();
      c.fillStyle = '#e74c3c';
      c.beginPath(); c.moveTo(6*s, 3*s); c.lineTo(3*s, 9*s); c.lineTo(9*s, 9*s); c.closePath(); c.fill();
      c.fillStyle = '#f0f0f0'; c.fillRect(4*s, 5*s, s, s);
      c.fillStyle = '#f0f0f0'; c.fillRect(7*s, 7*s, s, s);
    } else if (id === 'heart') {
      c.fillStyle = '#e74c3c';
      c.beginPath();
      c.moveTo(6*s, 10*s);
      c.bezierCurveTo(1*s, 6*s, 1*s, 2*s, 4*s, 2*s);
      c.bezierCurveTo(5*s, 2*s, 6*s, 3*s, 6*s, 3*s);
      c.bezierCurveTo(6*s, 3*s, 7*s, 2*s, 8*s, 2*s);
      c.bezierCurveTo(11*s, 2*s, 11*s, 6*s, 6*s, 10*s);
      c.fill();
    } else if (id === 'rubber_duck') {
      p(3,3, '#f1c40f', 6, 4);
      p(2,7, '#f1c40f', 8, 4);
      p(8,5, '#e67e22', 3, 2);
      c.fillStyle = '#1a1a1a'; c.fillRect(4*s, 4*s, s, s);
    } else if (id === 'skull') {
      p(2,2, '#ecf0f1', 8, 5);
      p(1,4, '#ecf0f1', 10, 3);
      p(2,9, '#ecf0f1', 3, 2);
      p(7,9, '#ecf0f1', 3, 2);
      c.fillStyle = '#1a1a1a'; c.fillRect(3*s, 4*s, 2*s, 2*s);
      c.fillStyle = '#1a1a1a'; c.fillRect(7*s, 4*s, 2*s, 2*s);
      c.fillStyle = '#1a1a1a'; c.fillRect(4*s, 8*s, s, 2*s);
    } else if (id === 'gem') {
      const gc = BOBBER_COLORS.gem;
      c.fillStyle = gc.top + 'cc';
      c.beginPath(); c.arc(6*s, 6*s, 4*s, 0, Math.PI*2); c.fill();
      c.fillStyle = '#ffffff55';
      c.beginPath(); c.arc(5*s, 4*s, 1.5*s, 0, Math.PI*2); c.fill();
      c.fillStyle = gc.bot;
      c.fillRect(4*s, 6*s, 4*s, 2*s);
    } else if (id === 'ring') {
      const rc = BOBBER_COLORS.ring;
      c.strokeStyle = rc.top; c.lineWidth = 3;
      c.beginPath(); c.arc(6*s, 6*s, 4*s, 0, Math.PI*2); c.stroke();
      c.strokeStyle = '#ffe566'; c.lineWidth = 1;
      c.beginPath(); c.arc(6*s, 6*s, 4*s, 0, Math.PI*2); c.stroke();
      c.fillStyle = '#c8e8ff';
      c.beginPath(); c.moveTo(6*s, 2*s); c.lineTo(4*s, 4*s); c.lineTo(6*s, 6*s); c.lineTo(8*s, 4*s); c.closePath(); c.fill();
    } else if (bc) {
      // Standard round bobber (classic, blue, yellow, cork, glow, neon)
      p(6,0, '#6a4a20', 1, 3);   // antenna
      p(4,3, bc.top, 4, 4);      // top half
      p(4,7, bc.bot, 4, 3);      // bottom half
      if (bc.glows) {
        const pulse = 0.7 + 0.3 * Math.sin(Date.now() / 280);
        // Outer soft halo
        c.shadowColor = bc.top;
        c.shadowBlur = Math.round(22 * pulse);
        c.fillStyle = bc.top + '18';
        c.beginPath(); c.arc(6*s, 6*s, 8*s, 0, Math.PI*2); c.fill();
        // Mid glow ring
        c.shadowBlur = Math.round(14 * pulse);
        c.fillStyle = bc.top + '33';
        c.beginPath(); c.arc(6*s, 6*s, 6*s, 0, Math.PI*2); c.fill();
        // Inner bright core
        c.shadowBlur = Math.round(8 * pulse);
        c.fillStyle = bc.top + '66';
        c.beginPath(); c.arc(6*s, 6*s, 4*s, 0, Math.PI*2); c.fill();
        c.shadowBlur = 0;
      }
    }

  } else if (category === 'lure') {
    const lc = LURE_COLORS[id];

    if (id === 'none') {
      // Live worm — default pink worm
      p(5,1, '#d4688a', 3, 2);
      p(4,3, '#d4688a', 4, 2);
      p(5,5, '#c0507a', 3, 2);
      p(4,7, '#d4688a', 4, 2);
      p(5,9, '#c0507a', 3, 2);
      p(6,11, '#d4688a', 2, 1);

    } else if (id === 'crawler') {
      // Big orange crawler
      p(5,1, lc.color, 3, 2);
      p(4,3, lc.color, 4, 2);
      p(5,5, lc.color, 3, 2);
      p(4,7, lc.dark, 4, 2);
      p(5,9, lc.dark, 3, 2);
      p(6,11, lc.color, 2, 1);

    } else if (id === 'frog') {
      p(3,4, lc.color, 6, 5);
      p(2,4, lc.dark, 2, 2);
      p(8,4, lc.dark, 2, 2);
      p(3,4, '#7fff7f', 1, 1);
      p(8,5, '#7fff7f', 1, 1);
      p(4,9, lc.belly, 4, 1);
      p(2,9, lc.color, 3, 2);
      p(7,9, lc.color, 3, 2);
      p(1,10, lc.color, 2, 1);
      p(9,10, lc.color, 2, 1);

    } else if (id === 'spinner') {
      p(6,2, lc.color, 2, 8);
      p(3,4, lc.blade, 4, 4);
      c.fillStyle = '#ffffff55'; c.fillRect(3*s, 4*s, 2*s, 2*s);
      c.fillStyle = lc.color; c.fillRect(3*s, 8*s, s, 2*s);

    } else if (id === 'spoon') {
      p(5,1, lc.color, 3, 2);
      p(4,3, lc.color, 5, 5);
      p(5,8, lc.color, 3, 3);
      p(5,3, lc.shine, 2, 4);

    } else if (id === 'fly') {
      p(5,6, lc.color, 2, 5);
      p(2,3, lc.wing, 4, 4);
      p(6,3, lc.wing, 4, 4);
      p(5,4, lc.color, 2, 3);
      p(4,10, '#8B7355', 4, 2);

    } else if (id === 'firefly') {
      c.shadowColor = lc.color; c.shadowBlur = 10;
      p(4,3, lc.dark, 4, 3);
      p(4,6, lc.color, 4, 4);
      p(5,10, lc.dark, 2, 2);
      c.shadowBlur = 0;
      c.fillStyle = lc.color + '22';
      c.beginPath(); c.arc(6*s, 8*s, 4*s, 0, Math.PI*2); c.fill();

    } else if (id === 'deepdiver') {
      p(2,3, lc.color, 8, 6);
      p(2,9, lc.belly, 5, 2);
      p(3,4, '#c8e8ff', 2, 2);
      p(8,8, '#888', 1, 4);
      p(7,11, '#888', 3, 1);

    } else if (id === 'squid') {
      p(4,1, lc.color, 4, 5);
      p(3,6, lc.color, 6, 3);
      p(2,9, lc.dark, 2, 3);
      p(4,9, lc.dark, 2, 3);
      p(6,9, lc.dark, 2, 3);
      p(8,9, lc.dark, 2, 3);
      p(5,2, '#ffffff55', 2, 2);
    } else if (id === 'hotdog') {
      p(2,5, lc.bun, 8, 3);
      p(1,8, lc.bun, 10, 2);
      p(2,6, lc.color, 8, 3);
      c.fillStyle = '#f1c40f'; c.fillRect(2*s, 7*s, 8*s, s);
    } else if (id === 'coin') {
      c.fillStyle = lc.color;
      c.beginPath(); c.arc(6*s, 6*s, 4*s, 0, Math.PI*2); c.fill();
      c.fillStyle = lc.dark;
      c.beginPath(); c.arc(6*s, 6*s, 3*s, 0, Math.PI*2); c.fill();
      c.fillStyle = lc.shine;
      c.beginPath(); c.arc(5*s, 5*s, 1.5*s, 0, Math.PI*2); c.fill();
      c.fillStyle = lc.color; c.font = `bold ${2*s}px sans-serif`; c.textAlign = 'center';
      c.fillText('$', 6*s, 8*s);
      c.textAlign = 'left';
    } else if (id === 'rubber_duck') {
      p(3,3, lc.color, 6, 4);
      p(2,7, lc.color, 8, 4);
      p(8,5, lc.beak, 3, 2);
      c.fillStyle = '#1a1a1a'; c.fillRect(4*s, 4*s, s, s);
    } else if (id === 'ghost') {
      p(3,2, lc.color, 6, 5);
      p(2,5, lc.color, 8, 5);
      p(2,10, lc.color, 2, 2);
      p(5,10, lc.color, 2, 2);
      p(8,10, lc.color, 2, 2);
      c.fillStyle = '#1a1a1a'; c.fillRect(4*s, 5*s, 2*s, 2*s);
      c.fillStyle = '#1a1a1a'; c.fillRect(7*s, 5*s, 2*s, 2*s);
      c.shadowColor = lc.glow; c.shadowBlur = 8;
      c.fillStyle = lc.color + '22'; c.beginPath(); c.arc(6*s, 6*s, 5*s, 0, Math.PI*2); c.fill();
      c.shadowBlur = 0;
    } else if (id === 'sausage') {
      p(2,4, lc.dark, 8, 2);
      p(1,5, lc.color, 10, 3);
      p(2,8, lc.dark, 8, 2);
      p(0,6, lc.dark, 2, 2);
      p(10,6, lc.dark, 2, 2);
      c.fillStyle = lc.shine; c.fillRect(4*s, 5*s, 4*s, s);
    } else if (id === 'cheese') {
      c.fillStyle = lc.color;
      c.beginPath(); c.moveTo(2*s, 10*s); c.lineTo(10*s, 10*s); c.lineTo(10*s, 4*s); c.lineTo(2*s, 10*s); c.fill();
      c.fillStyle = lc.dark;
      c.beginPath(); c.moveTo(2*s, 10*s); c.lineTo(10*s, 4*s); c.lineTo(10*s, 3*s); c.lineTo(1*s, 10*s); c.closePath(); c.fill();
      c.fillStyle = lc.hole;
      c.beginPath(); c.arc(7*s, 8*s, 1.5*s, 0, Math.PI*2); c.fill();
      c.beginPath(); c.arc(5*s, 9*s, s, 0, Math.PI*2); c.fill();
    }

  } else if (category === 'buddy') {
    if (id === 'none') {
      c.strokeStyle = '#4a4a6a'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(3*s, 3*s); c.lineTo(9*s, 9*s); c.stroke();
      c.beginPath(); c.moveTo(9*s, 3*s); c.lineTo(3*s, 9*s); c.stroke();
    } else if (id === 'cat') {
      p(3,2, '#888888', 2, 2);
      p(7,2, '#888888', 2, 2);
      p(2,4, '#888888', 8, 6);
      p(3,3, '#888888', 6, 3);
      c.fillStyle = '#1a1a1a'; c.fillRect(4*s, 5*s, s, s);
      c.fillStyle = '#1a1a1a'; c.fillRect(7*s, 5*s, s, s);
      c.fillStyle = '#e8a0a0'; c.fillRect(5*s, 6*s, 2*s, s);
      c.strokeStyle = '#cccccc'; c.lineWidth = 1;
      c.beginPath(); c.moveTo(2*s, 6*s); c.lineTo(5*s, 7*s); c.stroke();
      c.beginPath(); c.moveTo(2*s, 7*s); c.lineTo(5*s, 7*s); c.stroke();
      c.beginPath(); c.moveTo(10*s, 6*s); c.lineTo(7*s, 7*s); c.stroke();
      c.beginPath(); c.moveTo(10*s, 7*s); c.lineTo(7*s, 7*s); c.stroke();
    } else if (id === 'dog') {
      p(2,4, '#c8a060', 8, 3);
      p(1,7, '#c8a060', 10, 4);
      p(1,4, '#a07040', 3, 4);
      p(8,4, '#a07040', 3, 4);
      p(5,11, '#a07040', 2, 2);
      c.fillStyle = '#1a1a1a'; c.fillRect(4*s, 5*s, s, s);
      c.fillStyle = '#1a1a1a'; c.fillRect(7*s, 5*s, s, s);
      c.fillStyle = '#cc6655'; c.fillRect(5*s, 6*s, 2*s, s);
    } else if (id === 'duck') {
      p(4,3, '#f1c40f', 4, 3);
      p(2,6, '#f1c40f', 8, 4);
      p(8,5, '#e67e22', 3, 2);
      p(4,10, '#e67e22', 4, 2);
      c.fillStyle = '#1a1a1a'; c.fillRect(5*s, 4*s, s, s);
    } else if (id === 'gnome') {
      p(4,0, '#e74c3c', 4, 4);
      p(3,1, '#e74c3c', 6, 3);
      p(2,4, '#f0e8d8', 8, 2);
      p(3,6, '#c8a878', 6, 3);
      p(2,9, '#4a7a3a', 8, 3);
      p(4,8, '#f0f0f0', 4, 2);
    } else if (id === 'parrot') {
      p(4,2, '#27ae60', 4, 3);
      p(2,5, '#27ae60', 8, 4);
      p(3,1, '#e74c3c', 2, 2);
      p(7,5, '#f39c12', 3, 2);
      p(2,9, '#8B5E3C', 4, 2);
      p(6,9, '#8B5E3C', 4, 2);
      c.fillStyle = '#1a1a1a'; c.fillRect(5*s, 3*s, s, s);
      c.fillStyle = '#f1c40f'; c.fillRect(4*s, 7*s, 3*s, 2*s);
    }

  } else if (category === 'water') {
    const waterPalette = {
      normal:  ['#1a4a7a', '#0a2040', '#4a8fbf'],
      tea:     ['#8b6914', '#5a3e00', '#c8a050'],
      lava:    ['#c0392b', '#7b241c', '#e74c3c'],
      slime:   ['#27ae60', '#1a5e30', '#2ecc71'],
      galaxy:  ['#1a0a3a', '#0a0520', '#9b59b6'],
    };
    const [wt, wb, ws] = waterPalette[id] || waterPalette.normal;
    const g2 = c.createLinearGradient(0, 4*s, 0, 12*s);
    g2.addColorStop(0, wt); g2.addColorStop(1, wb);
    c.fillStyle = g2; c.fillRect(0, 4*s, 12*s, 8*s);
    c.fillStyle = ws + '44'; c.fillRect(1*s, 5*s, 5*s, s);
    c.fillStyle = ws + '44'; c.fillRect(4*s, 7*s, 6*s, s);
    if (id === 'galaxy') {
      c.fillStyle = '#ffffff'; c.fillRect(2*s, 5*s, s, s);
      c.fillStyle = '#ffffff'; c.fillRect(8*s, 6*s, s, s);
      c.fillStyle = '#9b59b6'; c.fillRect(5*s, 8*s, s, s);
    }
  }
}

function renderShop() {
  const container = document.getElementById('shop-items');
  if (!container) return;
  document.getElementById('shop-coins').textContent = '🪙 ' + S.coins;

  // Update tab buttons
  ['hat','boat','rod','bobber','lure','buddy','water'].forEach(tab => {
    const btn = document.getElementById('shop-tab-' + tab);
    if (btn) btn.classList.toggle('active-tab', tab === _shopTab);
  });

  container.innerHTML = '';
  const items = COSMETICS[_shopTab];
  for (const item of items) {
    const levelMet  = S.level >= item.level;
    const purchased = item.id === 'none' || S.cosmeticsPurchased.includes(item.id);
    const equipped  = S.cosmetics[_shopTab] === item.id;
    const canAfford = S.coins >= item.cost;

    const el = document.createElement('div');
    el.className = 'shop-item'
      + (equipped  ? ' equipped'   : '')
      + (!levelMet ? ' locked'     : '')
      + (levelMet && !purchased && !canAfford ? ' cant-afford' : '');

    // Preview canvas
    const wrap = document.createElement('div');
    wrap.className = 'shop-icon-wrap';
    const cv = document.createElement('canvas');
    cv.width = 36; cv.height = 36;
    cv.style.cssText = 'image-rendering:pixelated;width:36px;height:36px;';
    drawShopPreview(cv, _shopTab, item.id);
    wrap.appendChild(cv);

    // Info
    const info = document.createElement('div');
    info.className = 'shop-info';
    let desc = '';
    if (!levelMet)               desc = `Unlocks at level ${item.level}`;
    else if (!purchased && !canAfford) desc = `need ${item.cost - S.coins} more 🪙`;
    else if (!purchased)         desc = item.cost > 0 ? `${item.cost} 🪙` : 'Free';
    else                  desc = equipped ? 'Equipped' : 'Owned';
    const lvlBadge = item.level > 1 ? `<span class="shop-lvl-badge${!levelMet ? ' locked-badge' : ''}">LVL ${item.level}</span>` : '';
    info.innerHTML = `<div class="shop-item-name">${item.name}${lvlBadge}</div><div class="shop-item-desc">${desc}</div>`;

    // Button
    const btn = document.createElement('button');
    if (!levelMet) {
      btn.className = 'shop-buy-btn';
      btn.textContent = `LVL ${item.level}`;
      btn.disabled = true;
    } else if (!purchased) {
      btn.className = 'shop-buy-btn';
      btn.textContent = item.cost > 0 ? `BUY ${item.cost}🪙` : 'GET';
      btn.disabled = !canAfford;
      btn.onclick = () => {
        S.coins -= item.cost;
        S.cosmeticsPurchased.push(item.id);
        S.cosmetics[_shopTab] = item.id;
        saveToDisk(); updateStats(); renderShop();
      };
    } else if (equipped) {
      btn.className = 'shop-buy-btn maxed-btn';
      btn.textContent = 'EQUIPPED';
      btn.disabled = true;
    } else {
      btn.className = 'shop-buy-btn';
      btn.textContent = 'EQUIP';
      btn.onclick = () => {
        S.cosmetics[_shopTab] = item.id;
        saveToDisk(); renderShop();
      };
    }

    el.appendChild(wrap);
    el.appendChild(info);
    el.appendChild(btn);
    container.appendChild(el);
  }
}

// ── Daily challenges ──────────────────────────────────────────────────────────

const CHALLENGE_POOL = [
  { id: 'bash_3',      tool: 'Bash',      count: 3,  label: 'Run 3 Bash commands',       reward: 60 },
  { id: 'read_5',      tool: 'Read',      count: 5,  label: 'Read 5 files',              reward: 60 },
  { id: 'edit_3',      tool: 'Edit',      count: 3,  label: 'Edit 3 files',              reward: 75 },
  { id: 'grep_3',      tool: 'Grep',      count: 3,  label: 'Search with Grep 3x',       reward: 60 },
  { id: 'write_2',     tool: 'Write',     count: 2,  label: 'Write 2 files',             reward: 75 },
  { id: 'glob_3',      tool: 'Glob',      count: 3,  label: 'Glob 3 patterns',           reward: 60 },
  { id: 'websearch_1', tool: 'WebSearch', count: 1,  label: 'Search the web',            reward: 80 },
  { id: 'webfetch_1',  tool: 'WebFetch',  count: 1,  label: 'Fetch a webpage',           reward: 80 },
  { id: 'agent_1',     tool: 'Agent',     count: 1,  label: 'Spawn a sub-agent',         reward: 100 },
  { id: 'task_1',      tool: 'Task',      count: 1,  label: 'Run a background task',     reward: 90 },
  { id: 'catch_5',     special: 'catch',  count: 5,  label: 'Catch 5 fish today',        reward: 50 },
  { id: 'catch_rare',  special: 'rare',   count: 1,  label: 'Catch a rare golden fish',  reward: 100 },
  { id: 'tools_4',     special: 'unique', count: 4,  label: 'Use 4 different tools',     reward: 80 },
];

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function getDailyChallenges() {
  const today = todayStr();
  if (S.dailyChallenges && S.dailyChallenges.date === today) return S.dailyChallenges;
  // Seed selection by date so everyone gets same 3 challenges each day
  const seed = today.replace(/-/g, '') | 0;
  const pick = (s, arr) => { let h = s; const r = []; const used = new Set(); while (r.length < 3) { h = (h * 1664525 + 1013904223) & 0x7fffffff; const i = h % arr.length; if (!used.has(i)) { used.add(i); r.push({...arr[i], progress: 0, completed: false}); } } return r; };
  S.dailyChallenges = { date: today, slots: pick(seed, CHALLENGE_POOL) };
  saveToDisk();
  return S.dailyChallenges;
}

function tickDailyChallenge(toolName, catchData) {
  const dc = getDailyChallenges();
  let changed = false;
  for (const ch of dc.slots) {
    if (ch.completed) continue;
    if (ch.tool && ch.tool === toolName) {
      ch.progress = (ch.progress || 0) + 1;
    } else if (ch.special === 'catch' && catchData) {
      ch.progress = (ch.progress || 0) + 1;
    } else if (ch.special === 'rare' && catchData && catchData.rare) {
      ch.progress = (ch.progress || 0) + 1;
    } else if (ch.special === 'unique' && toolName) {
      if (!ch._tools) ch._tools = new Set();
      ch._tools.add(toolName);
      ch.progress = ch._tools.size;
    }
    if (!ch.completed && ch.progress >= ch.count) {
      ch.completed = true;
      addCoins(ch.reward);
      showAchievementToast(ch.label, ch.reward + ' 🪙');
      changed = true;
    }
  }
  if (changed || toolName || catchData) {
    saveToDisk();
    renderChallengePanel();
  }
}

function renderChallengePanel() {
  const list = document.getElementById('challenge-list');
  if (!list) return;
  list.innerHTML = '';
  const dc = getDailyChallenges();
  for (const ch of dc.slots) {
    const el = document.createElement('div');
    el.className = 'ch-item' + (ch.completed ? ' done' : '');
    const prog = ch.count > 1
      ? `<div class="ch-prog"><div class="ch-prog-fill" style="width:${Math.min(100, ((ch.progress||0)/ch.count*100)).toFixed(0)}%"></div></div><span class="ch-count">${Math.min(ch.progress||0, ch.count)}/${ch.count}</span>`
      : '';
    el.innerHTML = `<div class="ch-name">${ch.completed ? '✓ ' : ''}${ch.label}</div>${prog}<div class="ch-reward">+${ch.reward} 🪙</div>`;
    list.appendChild(el);
  }
}

// ── Game state ────────────────────────────────────────────────────────────────

const MOOD_COL = { idle: '#7ec8e3', focused: '#e8c547', sleepy: '#7070a0' };

const S = {
  level: 1, xp: 0, xpToNext: 100,
  coins: 0,
  cosmetics: { hat: 'straw', boat: 'wood', rod: 'bamboo', bobber: 'classic', lure: 'none', buddy: 'none', water: 'normal' },
  cosmeticsPurchased: ['straw', 'wood', 'bamboo', 'classic', 'none'],
  mood: 'idle',
  questsCompleted: [],
  fishCaught: [],
  activeFish: [],
  particles: [],
  floatingTexts: [],
  isActive: false,
  lastActivity: Date.now(),
  t: 0,
  _wY: 0,
  _tip: null,
  // Cast state — randomised each time user sends a message
  cast: { offset: 80, depthLine: 40 },
  bobberDip: 0,
  lureSplash: 0,  // counts down when a lure gets struck
  reelProgress: 0,
  _bobberX: 0,
  _bobberY: 0,
  wormX: 0,
  wormY: 0,
  // Casting animation
  castAnim: null,     // { phase:'swing'|'fly', t:0, targetX, targetY }
  reelTickTimer: 0,
  zoom: 1.0,
  panX: 0,
  panY: 0,
  smileTimer: 0,
  catchCooldown: 0, // frames to wait after catch before next fish can spawn
  sessionFish: [],  // fish caught this session only — cleared on restart
  milestonesReached: [],
  hourGoal: 8 + Math.floor(Math.random() * 8), // target fish this hour
  hourStart: Date.now(),
  hourFish: 0,
  fishQueue: [],    // queued events: { type: 'cast' } or { type: 'fish', tool }
  theme: 'dark',
};

// ── Persistence ───────────────────────────────────────────────────────────────

async function loadSave() {
  const d = await window.claude.getSaveData();
  if (d) {
    S.level      = d.level      || 1;
    S.xp         = d.xp         || 0;
    S.xpToNext   = d.xpToNext   || 100;
    S.coins      = d.coins      || 0;
    if (d.cosmetics) S.cosmetics = { ...S.cosmetics, ...d.cosmetics };
    if (d.cosmeticsPurchased) S.cosmeticsPurchased = d.cosmeticsPurchased;
    S.fishCaught       = d.fishCaught       || [];
    S.milestonesReached = d.milestonesReached || [];
    S.questsCompleted  = d.questsCompleted  || [];
    if (d.dailyChallenges && d.dailyChallenges.date === todayStr()) {
      S.dailyChallenges = d.dailyChallenges;
      // Re-hydrate Set for unique tool challenge
      for (const ch of S.dailyChallenges.slots) {
        if (ch.special === 'unique' && ch._toolsArr) ch._tools = new Set(ch._toolsArr);
      }
    }
    if (d.theme) S.theme = d.theme;
  }
  applyTheme();
  updateStats();
  getDailyChallenges();
}

function applyTheme() {
  document.documentElement.dataset.theme = S.theme === 'light' ? 'light' : '';
  document.getElementById('btn-theme').textContent = S.theme === 'light' ? '🌙' : '☀️';
}

async function saveToDisk() {
  // Serialize Set to array for JSON
  const dc = S.dailyChallenges ? {
    ...S.dailyChallenges,
    slots: S.dailyChallenges.slots.map(ch => ({
      ...ch,
      _tools: undefined,
      _toolsArr: ch._tools ? [...ch._tools] : undefined,
    })),
  } : null;
  await window.claude.setSaveData({
    level: S.level, xp: S.xp, xpToNext: S.xpToNext,
    coins: S.coins,
    cosmetics: S.cosmetics,
    cosmeticsPurchased: S.cosmeticsPurchased,
    fishCaught: S.fishCaught, milestonesReached: S.milestonesReached, questsCompleted: S.questsCompleted,
    dailyChallenges: dc, theme: S.theme,
  });
}

loadSave();

function updateStats() {
  document.getElementById('s-lvl').textContent  = S.level;
  document.getElementById('s-fish').textContent = S.fishCaught.length;
  document.getElementById('s-coins').textContent = S.coins;
  const pct = (S.xp / S.xpToNext) * 100;
  document.getElementById('xp-fill').style.width = pct + '%';
}

function addXP(amount, x, y) {
  S.xp += amount;
  let leveled = false;
  while (S.xp >= S.xpToNext) {
    S.xp -= S.xpToNext;
    S.level++;
    S.xpToNext = Math.floor(S.xpToNext * 1.5);
    leveled = true;
  }
  updateStats();
  // Floating XP text
  const fx = x !== undefined ? x : canvas.width * 0.5 + (Math.random() - 0.5) * 60;
  const fy = y !== undefined ? y : S._wY - 20;
  spawnFloatingText(`+${amount} XP`, fx, fy, '#4a8fff');
  // Flash XP bar
  const xpFill = document.getElementById('xp-fill');
  xpFill.style.background = '#a0cfff';
  setTimeout(() => xpFill.style.background = '#4a8fff', 300);
  return leveled;
}

function addCoins(amount) {
  S.coins += amount;
  document.getElementById('s-coins').textContent = S.coins;
  saveToDisk();
}

function spawnFloatingText(text, x, y, color, big = false) {
  // Nudge up if another text is already too close
  let attempts = 0;
  while (attempts++ < 6 && S.floatingTexts.some(f => Math.abs(f.x - x) < 50 && Math.abs(f.y - y) < 16)) {
    y -= 16;
  }
  S.floatingTexts.push({ text, x, y, vy: -1.0, life: 90, maxLife: 90, color, big });
}

function drawFloatingTexts() {
  ctx.textAlign = 'center';
  for (let i = S.floatingTexts.length - 1; i >= 0; i--) {
    const f = S.floatingTexts[i];
    f.y += f.vy;
    f.vy *= 0.97;
    f.life--;
    if (f.life <= 0) { S.floatingTexts.splice(i, 1); continue; }
    const alpha = Math.min(1, f.life / 25) * Math.min(1, (f.maxLife - f.life + 10) / 10);
    ctx.globalAlpha = alpha;
    ctx.font = f.big ? 'bold 15px Courier New' : 'bold 13px Courier New';
    // Shadow for readability
    ctx.fillStyle = '#000';
    ctx.fillText(f.text, f.x + 1, f.y + 1);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'left';
}

// ── Hook events ───────────────────────────────────────────────────────────────

window.claude.onGameEvent(event => {
  startTone();
  S.lastActivity = Date.now();

  if (event.type === 'cast') {
    S.isActive = true;
    S.mood = 'focused';
    // If pond is clear, cast immediately; otherwise queue the re-cast
    if (S.activeFish.length === 0 && S.fishQueue.length === 0 && S.catchCooldown === 0) {
      doCast();
    } else {
      S.fishQueue.push({ type: 'cast' });
    }
    const leveled = addXP(10, canvas.width * 0.5, S._wY - 30);
    if (leveled) flashLevelUp();
    updateStats();
  }

  else if (event.type === 'tool_use' && event.tool) {
    S.fishQueue.push({ type: 'fish', tool: event.tool });
    tickDailyChallenge(event.tool, null);
  }

  else if (event.type === 'done') {
    S.isActive = false;
    celebrate();
    saveToDisk();
  }
});

function doCast() {
  const side = Math.random() > 0.5 ? 1 : -1;
  const W_ = canvas.width;
  const tipApprox = W_ * 0.44 + side * 46;
  const maxOff = Math.min(140, (side > 0 ? W_ - 80 - tipApprox : tipApprox - 80));
  S.cast.offset    = side * (60 + Math.random() * Math.max(0, maxOff - 60));
  S.cast.depthLine = 35 + Math.random() * 70;
  S.bobberDip = 0;
  S.castAnim = { phase: 'swing', t: 0 };
}

function spawnFish(toolName) {
  const def  = fishForTool(toolName);
  const rare = Math.random() < 0.05;
  const W    = canvas.width;
  const spawnX = S.cast.offset > 0 ? -30 : W + 30;
  // Lure: fish attacks horizontally at the surface; bobber: fish swims up from depth
  const lureId_   = S.cosmetics.lure || 'none';
  const lureItem_ = (COSMETICS.lure || []).find(l => l.id === lureId_);
  const isLure_   = lureId_ !== 'none' && LURE_COLORS[lureId_] != null && !(lureItem_ && lureItem_.bait);
  const spawnY = isLure_
    ? S._wY + 8 + (Math.random() - 0.5) * 6   // near surface — horizontal attack
    : S._wY + S.cast.depthLine + (Math.random() - 0.5) * 20; // deep underwater
  const W2 = canvas.width;
  S.activeFish.push({
    type:  def.type,
    color: rare ? '#ffd700' : def.color,
    label: def.label,
    rare,
    phase: 'approaching',
    x: spawnX, y: spawnY,
    isLure: isLure_,
    biteTimer: 0, progress: 0, reelStartY: spawnY, reelStartX: spawnX,
    facingLeft: spawnX > W2 / 2, // spawned from right → swims left, from left → swims right
    thought: THINKING_PHRASES[Math.floor(Math.random() * THINKING_PHRASES.length)],
  });
}

function celebrate() {
  const W = canvas.width;
  for (let i = 0; i < 14; i++) {
    S.particles.push({
      x: W * 0.2 + Math.random() * W * 0.6,
      y: S._wY - 8,
      vx: (Math.random() - 0.5) * 3.5,
      vy: -Math.random() * 4.5 - 1,
      life: 50 + Math.random() * 40,
      color: ['#f1c40f','#e67e22','#9b59b6','#e74c3c','#4a8fff'][Math.floor(Math.random() * 5)],
      size: 2 + Math.random() * 3,
    });
  }
}

let levelUpFlash = 0;
let milestoneFlash = { timer: 0, text: '', coins: 0 };

const MILESTONES = [
  { count: 10,   coins: 25,   label: '10 fish!' },
  { count: 25,   coins: 50,   label: '25 fish!' },
  { count: 50,   coins: 100,  label: '50 fish!' },
  { count: 100,  coins: 200,  label: '100 fish!' },
  { count: 250,  coins: 400,  label: '250 fish!' },
  { count: 500,  coins: 750,  label: '500 fish!' },
  { count: 1000, coins: 1500, label: '1000 fish!!' },
];
function flashLevelUp() {
  levelUpFlash = 90;
}

// ── Drawing helpers ───────────────────────────────────────────────────────────

const P = 4;

// ── Day / night cycle ─────────────────────────────────────────────────────────
// Full cycle = 8 minutes of real time

const DAY_MS = 8 * 60 * 1000;

function getDayPhase() {
  return (Date.now() % DAY_MS) / DAY_MS; // 0=midnight 0.25=sunrise 0.5=noon 0.75=sunset
}

function lerpHex(a, b, t) {
  const ah = parseInt(a.slice(1), 16), bh = parseInt(b.slice(1), 16);
  const ar = (ah >> 16) & 0xff, ag = (ah >> 8) & 0xff, ab = ah & 0xff;
  const br = (bh >> 16) & 0xff, bg = (bh >> 8) & 0xff, bb = bh & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl2 = Math.round(ab + (bb - ab) * t);
  return '#' + [r, g, bl2].map(v => v.toString(16).padStart(2, '0')).join('');
}

// Sky palette stops: [phase, topColor, botColor]
const SKY_STOPS = [
  [0.00, '#08051e', '#150a38'],  // midnight
  [0.20, '#120820', '#22082a'],  // pre-dawn
  [0.28, '#c0501a', '#e8a030'],  // sunrise — warm orange
  [0.35, '#2a7acc', '#70c0f0'],  // morning — clear blue coming in
  [0.50, '#1a6ec8', '#88d0f8'],  // noon — bright open sky
  [0.65, '#2a7acc', '#70c0f0'],  // afternoon
  [0.72, '#c04818', '#e09028'],  // sunset — warm orange
  [0.80, '#120820', '#22082a'],  // dusk
  [1.00, '#08051e', '#150a38'],  // midnight
];

function getSkyColors(phase) {
  for (let i = 0; i < SKY_STOPS.length - 1; i++) {
    const [p0, t0, b0] = SKY_STOPS[i];
    const [p1, t1, b1] = SKY_STOPS[i + 1];
    if (phase >= p0 && phase <= p1) {
      const t = (phase - p0) / (p1 - p0);
      return { top: lerpHex(t0, t1, t), bot: lerpHex(b0, b1, t) };
    }
  }
  return { top: '#06061a', bot: '#0e0e2c' };
}

// ── Clouds ────────────────────────────────────────────────────────────────────

// Stars — fixed random positions, generated once
const STARS = Array.from({ length: 40 }, () => ({
  x: Math.random(),   // stored as 0–1 fractions, scaled to W at draw time
  y: Math.random(),   // fraction of sky height
  s: Math.random() > 0.8 ? 3 : 2,  // occasional larger star
  twinkleOffset: Math.random() * Math.PI * 2,
}));

const clouds = [];
function initClouds(W) {
  for (let i = 0; i < 4; i++) {
    clouds.push({
      x: Math.random() * W * 1.5 - W * 0.2,
      y: 18 + Math.random() * 50,
      w: 28 + Math.random() * 36,
      speed: 0.12 + Math.random() * 0.18,
    });
  }
}

function updateClouds(W) {
  for (const c of clouds) {
    c.x += c.speed;
    if (c.x > W + 60) {
      c.x = -70;
      c.y = 14 + Math.random() * 52;
      c.w = 28 + Math.random() * 36;
    }
  }
}

function drawCloud(c, phase) {
  // Clouds visible during day, fade at deep night
  const nightness = phase < 0.2 || phase > 0.8
    ? 1 - Math.min(1, Math.abs(phase < 0.5 ? phase : 1 - phase) / 0.2)
    : 0;
  const alpha = 0.55 - nightness * 0.45;
  ctx.globalAlpha = alpha;
  const x = Math.round(c.x), y = Math.round(c.y), w = Math.round(c.w);
  px(x,         y + 5,  w,     7,  '#c8cce0');
  px(x + 4,     y + 1,  w - 8, 6,  '#d8dcea');
  px(x + 8,     y,      w - 16, 4, '#e0e4f0');
  px(x + w - 5, y + 2,  8,     6,  '#d0d4e8');
  ctx.globalAlpha = 1;
}

function px(x, y, w, h, col) {
  ctx.fillStyle = col;
  ctx.fillRect(Math.round(x), Math.round(y), w, h);
}

// ── Scene ─────────────────────────────────────────────────────────────────────

function drawSky(W, wY) {
  const phase = getDayPhase();
  const { top, bot } = getSkyColors(phase);

  const g = ctx.createLinearGradient(0, 0, 0, wY);
  g.addColorStop(0, top);
  g.addColorStop(1, bot);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, wY);

  // Stars — fade out during day
  const starAlpha = phase < 0.22 ? 0.55
    : phase < 0.32 ? 0.55 * (1 - (phase - 0.22) / 0.10)
    : phase > 0.78 ? 0.55 * ((phase - 0.78) / 0.10)
    : 0;

  if (starAlpha > 0.01) {
    for (let i = 0; i < STARS.length; i++) {
      const star = STARS[i];
      const sx = Math.round(star.x * W);
      const sy = Math.round(star.y * (wY - 10)) + 5;
      const tw = Math.sin(S.t * 0.008 + star.twinkleOffset) * 0.15 + 0.85;
      ctx.globalAlpha = tw * starAlpha;
      px(sx, sy, star.s, star.s, '#ffffff');
    }
    ctx.globalAlpha = 1;
  }

  // Sun — visible from phase 0.25 to 0.75, arc across sky
  const sunVisible = phase > 0.22 && phase < 0.78;
  if (sunVisible) {
    const sunPhase = (phase - 0.25) / 0.5; // 0=rise, 0.5=noon, 1=set
    const sunX = sunPhase * (W + 20) - 10;
    const arcHeight = wY * 0.7;
    const sunY = wY - arcHeight * Math.sin(sunPhase * Math.PI) - 10;
    const sunAlpha = phase < 0.32 ? (phase - 0.22) / 0.1
      : phase > 0.68 ? (0.78 - phase) / 0.1
      : 1;

    ctx.globalAlpha = Math.min(1, sunAlpha) * 0.9;
    px(sunX - 6, sunY - 6, 12, 12, '#f8d060'); // glow
    px(sunX - 4, sunY - 4, 8,  8,  '#ffe080'); // core
    px(sunX - 2, sunY - 2, 4,  4,  '#ffffff'); // highlight
    ctx.globalAlpha = 1;
  }

  // Moon — arcs across the night sky (phase 0.75 → 0.0 → 0.25)
  const moonAlpha = phase < 0.18 ? 1
    : phase < 0.28 ? 1 - (phase - 0.18) / 0.10
    : phase > 0.72 ? (phase - 0.72) / 0.10
    : 0;

  if (moonAlpha > 0.01) {
    const moonPhase = phase >= 0.75 ? (phase - 0.75) / 0.5 : (phase + 0.25) / 0.5;
    const arcHeight = wY * 0.72;
    const moonX = moonPhase * (W + 20) - 10;
    const moonY = wY - arcHeight * Math.sin(moonPhase * Math.PI) - 10;
    // Glow (soft, dimmer)
    ctx.globalAlpha = moonAlpha * 0.35;
    px(moonX - 7, moonY - 7, 14, 14, '#c8d8f0');
    // Full moon disc
    ctx.globalAlpha = moonAlpha * 0.60;
    px(moonX - 5, moonY - 5, 10, 10, '#d8e4f0');
    ctx.globalAlpha = moonAlpha * 0.72;
    px(moonX - 3, moonY - 3, 6,  6,  '#e8eef8');
    ctx.globalAlpha = 1;
  }

  // Clouds
  updateClouds(W);
  for (const c of clouds) drawCloud(c, phase);
}

// Water colour stops — [phase, top, bottom, shimmer]
const WATER_STOPS = [
  [0.00, '#0a1428', '#050810', '#1a3a60'],
  [0.22, '#0a1428', '#050810', '#1a3a60'],
  [0.28, '#6a3a20', '#2a1410', '#c07840'],
  [0.35, '#1a5a9a', '#0a2a50', '#5ab0e8'],
  [0.50, '#1a5a9a', '#0a2a50', '#5ab0e8'],
  [0.65, '#1a5a9a', '#0a2a50', '#5ab0e8'],
  [0.72, '#6a3a20', '#2a1410', '#c07840'],
  [0.80, '#0a1428', '#050810', '#1a3a60'],
  [1.00, '#0a1428', '#050810', '#1a3a60'],
];

function getWaterColors(phase) {
  for (let i = 0; i < WATER_STOPS.length - 1; i++) {
    const [p0, t0, b0, s0] = WATER_STOPS[i];
    const [p1, t1, b1, s1] = WATER_STOPS[i + 1];
    if (phase >= p0 && phase <= p1) {
      const t = (phase - p0) / (p1 - p0);
      return { top: lerpHex(t0, t1, t), bot: lerpHex(b0, b1, t), shimmer: lerpHex(s0, s1, t) };
    }
  }
  return { top: '#0a1428', bot: '#050810', shimmer: '#1a3a60' };
}

function drawWater(W, H, wY) {
  const phase = getDayPhase();
  const { top: waterTop, bot: waterBot, shimmer: shimmerCol } = getWaterColors(phase);

  // Water cosmetic override
  const WATER_SKINS = {
    tea:    { top: '#7a5a00', bot: '#4a3400', shimmer: '#c8a050' },
    lava:   { top: '#c0392b', bot: '#7b241c', shimmer: '#ff6633' },
    slime:  { top: '#27ae60', bot: '#1a5e30', shimmer: '#2ecc71' },
    galaxy: { top: '#1a0a3a', bot: '#0a0520', shimmer: '#9b59b6' },
  };
  const waterSkin = WATER_SKINS[S.cosmetics.water];
  const wTop     = waterSkin ? waterSkin.top     : waterTop;
  const wBot     = waterSkin ? waterSkin.bot     : waterBot;
  const wShimmer = waterSkin ? waterSkin.shimmer : shimmerCol;

  const g = ctx.createLinearGradient(0, wY, 0, H);
  g.addColorStop(0, wTop);
  g.addColorStop(1, wBot);
  ctx.fillStyle = g;
  ctx.fillRect(0, wY, W, H - wY);

  ctx.globalAlpha = 0.2;
  for (let row = 0; row < 3; row++) {
    const y = wY + row * 12 + Math.sin(S.t * 0.02 + row) * 2;
    for (let x = 0; x < W; x += 18) {
      const o = Math.sin(S.t * 0.03 + x * 0.05 + row * 1.5) * 7;
      px(x + o, y, 12, 2, wShimmer);
    }
  }
  ctx.globalAlpha = 0.08;
  for (let x = 0; x < W; x += 4) {
    const s = Math.sin(S.t * 0.05 + x * 0.12) * 1.5;
    px(x, wY + s, 2, 2, wShimmer);
  }
  ctx.globalAlpha = 1;
}

let _boatRipples = [];
let _lastRippleTick = -999;

function drawBoat(W, wY) {
  const bX = W * 0.44;
  const bobAmp = S.mood === 'sleepy' ? 3 : 1.5;
  const bY = wY - 5 + Math.sin(S.t * 0.025) * bobAmp;
  const facingLeft = S.cast.offset < 0;

  // Character position — defined early so hull shapes can reference it
  const cX = bX - 2, cY = bY - 19;

  // Hull ripples — spawn at bottom of bob, drawn before hull
  {
    const bobSin = Math.sin(S.t * 0.025);
    if (bobSin < -0.92 && S.t - _lastRippleTick > 80) {
      _boatRipples.push({ age: 0 });
      _lastRippleTick = S.t;
    }
    _boatRipples = _boatRipples.filter(r => r.age < 160);
    _boatRipples.forEach(r => r.age++);

    const _rippleBase = getWaterColors(getDayPhase());
    const _rippleSkins = { tea: '#c8a050', lava: '#ff6633', slime: '#2ecc71', galaxy: '#9b59b6' };
    const shimmer = _rippleSkins[S.cosmetics.water] || _rippleBase.shimmer;
    for (const rip of _boatRipples) {
      const rx = Math.min(44, 22 + rip.age * 0.5);
      const ry = rx * 0.18;
      const rippleY = wY + ry;
      const alpha = Math.max(0, 0.45 - rip.age * (0.45 / 160));
      if (alpha < 0.01) continue;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = shimmer;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(bX, rippleY, rx, ry, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  // ── Dinghy — drawn before main hull so it sits behind ──
  {
    const dinghyBob = Math.sin(S.t * 0.025 + 1.2) * 1.5;
    const side = facingLeft ? 1 : -1; // opposite side from cast
    const ropeAttachX = facingLeft ? bX + 25 : bX - 25;
    const ropeAttachY = bY - 2;
    const dX = bX + side * 72;
    const dY = wY - 3 + dinghyBob;

    // Rope
    ctx.strokeStyle = '#8a7060';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(ropeAttachX, ropeAttachY);
    ctx.quadraticCurveTo((ropeAttachX + dX) * 0.5, Math.max(ropeAttachY, dY) + 8, dX, dY - 2);
    ctx.stroke();

    // Fish pile — grows upward above the rim using session fish
    const total = S.sessionFish.length;
    if (total > 0) {
      // Clip to hull width so fish never stick out the sides
      ctx.save();
      ctx.beginPath();
      ctx.rect(dX - 18, dY - 200, 36, 212); // wide enough for hull, tall enough for pile
      ctx.clip();
      for (let i = 0; i < total; i++) {
        const seed  = (i * 1664525 + 1013904223) & 0xffff;
        const t     = (seed % 1000) / 1000;
        const angle = (((seed >> 4) & 0xffff) / 0xffff - 0.5) * 0.7;
        const fx    = dX - 12 + t * 24;
        const fy    = dY + 6 - Math.floor(i / 3) * 4; // pile grows upward, overflow after 3
        const f     = S.sessionFish[i];
        const color = f.rare ? '#ffd700' : (f.color || '#e06030');
        ctx.save();
        ctx.translate(Math.round(fx), Math.round(fy));
        ctx.rotate(angle);
        ctx.fillStyle = color;
        ctx.fillRect(-5, -2, 10, 3);  // body
        ctx.fillRect(-8, -3,  4, 2);  // tail top
        ctx.fillRect(-8,  1,  4, 2);  // tail bottom
        ctx.fillStyle = '#00000066';
        ctx.fillRect(-2, -1,  2, 2);  // eye
        ctx.restore();
      }
      ctx.restore();
    }

    // Hull (drawn over bottom of pile so it looks contained)
    px(dX - 17, dY,      34, 3, '#5a3e28');
    px(dX - 18, dY + 3,  36, 5, '#7a5535');
    px(dX - 17, dY + 8,  34, 3, '#5a3e28');
    px(dX - 18, dY - 2,  36, 3, '#9a7248'); // rim
  }

  // Hull — unique shape per boat cosmetic
  const boat = S.cosmetics.boat || 'wood';
  const [hc1, hc2] = BOAT_COLORS[boat] || BOAT_COLORS.wood;

  if (boat === 'wood') {
    // Classic rowboat with oars
    px(bX - 22, bY,       50, P*2, hc1);
    px(bX - 18, bY + P*2, 42, P,   hc2);
    px(bX - 14, bY + P*3, 34, P,   hc2);
    px(bX - 27, bY - P,    5, P,   hc1);
    px(bX + 24, bY - P,    5, P,   hc1);
    px(bX - 32, bY + P,    8, 2,   '#8B7355'); // left oar
    px(bX + 25, bY + P,    8, 2,   '#8B7355'); // right oar

  } else if (boat === 'canoe') {
    // Narrow canoe with pointed bow/stern
    px(bX - 20, bY + P,    8, P,   hc1); // left point
    px(bX + 14, bY + P,    8, P,   hc1); // right point
    px(bX - 14, bY,       30, P*2, hc1); // narrow body
    px(bX - 10, bY + P*2, 22, P,   hc2);
    px(bX - 6,  bY + P*3, 14, P,   hc2);
    px(bX - 26, bY - P*2,  4, P*6, '#8B7355'); // paddle shaft
    px(bX - 30, bY + P,    8, P*2, '#8B7355'); // paddle blade

  } else if (boat === 'blue' || boat === 'red') {
    // Sailboat — hull + mast + sail at stern
    px(bX - 20, bY,       42, P*2, hc1);
    px(bX - 16, bY + P*2, 34, P,   hc2);
    px(bX - 12, bY + P*3, 26, P,   hc2);
    px(bX - 23, bY - P,    5, P,   hc1);
    px(bX + 18, bY - P,    5, P,   hc1);
    // Mast and sail at stern
    const mX = facingLeft ? bX + 16 : bX - 16;
    px(mX - 1, bY - 34, 3, 34, '#6a4a20'); // mast
    const sailW = facingLeft ? 16 : -16;
    ctx.fillStyle = '#e8e0d0';
    ctx.beginPath();
    ctx.moveTo(mX, bY - 32);
    ctx.lineTo(mX, bY - 6);
    ctx.lineTo(mX + sailW, bY - 10);
    ctx.closePath();
    ctx.fill();

  } else if (boat === 'shoe') {
    // Floating boot — toe on one side, ankle shaft up
    const toeSide = facingLeft ? 1 : -1;
    const toeX = bX + toeSide * 14;
    const heelX = bX - toeSide * 14;
    // Sole
    px(bX - 28, bY + P*2, 58, P,   hc2);
    // Toe box
    px(toeX - 2, bY - P*2, 20, P*4, hc1);
    px(toeX + (toeSide > 0 ? 2 : -2), bY - P*4, 16, P*2, hc1);
    // Heel / ankle area (where character sits)
    px(heelX - 10, bY - P, 22, P*3, hc1);
    px(heelX - 8,  bY - P*4, 18, P*3, hc1); // ankle collar
    // Laces
    for (let i = 0; i < 3; i++) {
      px(heelX - 6 + i * 5, bY - P*3, 3, 2, '#ffffff');
    }

  } else if (boat === 'race') {
    // Sleek racing boat — low profile, white stripe, cockpit frame
    px(bX - 24, bY,       50, P*2, hc1);
    px(bX - 20, bY + P*2, 42, P,   hc2);
    px(bX - 16, bY + P*3, 34, P,   hc2);
    px(bX - 22, bY,       50, 2,   '#ffffff'); // racing stripe
    // Cockpit frame
    px(cX - 6, cY + 10, 22, 8, '#1a1a1a');
    // Exhaust at stern
    const exX = facingLeft ? bX + 20 : bX - 24;
    px(exX, bY - P, 5, P*2, '#4a4a5a');

  } else if (boat === 'dark') {
    // Fishing trawler — wide hull, reinforced sides, equipment box
    px(bX - 26, bY,       54, P*2, hc1);
    px(bX - 22, bY + P*2, 46, P,   hc2);
    px(bX - 18, bY + P*3, 38, P,   hc2);
    px(bX - 28, bY - P,    6, P*3, hc2); // left bumper
    px(bX + 23, bY - P,    6, P*3, hc2); // right bumper
    // Equipment box at back of boat
    const eqX = facingLeft ? bX + 8 : bX - 22;
    px(eqX, bY - P*2, 14, P*2, hc2);
    px(eqX + 2, bY - P*2, 4, P, '#4a6a8a'); // window on box

  } else if (boat === 'pirateship') {
    // Galleon — tall wide hull, cannon ports
    px(bX - 28, bY - P,   58, P*3, hc1);
    px(bX - 24, bY + P*2, 50, P,   hc2);
    px(bX - 20, bY + P*3, 42, P,   hc2);
    // Cannon ports
    px(bX - 26, bY + P,    5, 5,   hc2);
    px(bX + 22, bY + P,    5, 5,   hc2);
    // Bowsprit
    const bpX = facingLeft ? bX - 28 : bX + 24;
    const bpDir = facingLeft ? -1 : 1;
    px(bpX + bpDir * 2, bY - P*2, bpDir * 14, 2, '#8B6914');

  } else if (boat === 'gold') {
    // Ornate royal barge — wider hull, gold trim
    px(bX - 26, bY,       54, P*2, hc1);
    px(bX - 22, bY + P*2, 46, P,   hc2);
    px(bX - 18, bY + P*3, 38, P,   hc2);
    px(bX - 24, bY,       54, 2,   '#ffe566'); // gold top trim
    px(bX - 24, bY + P*2, 2, P,   '#ffe566'); // left accent
    px(bX + 22, bY + P*2, 2, P,   '#ffe566'); // right accent
    // Decorative prow
    const prowX = facingLeft ? bX - 28 : bX + 24;
    px(prowX, bY - P*3, 5, P*4, '#a07800');
    px(prowX, bY - P*3, 5, 2,   '#ffe566');

  } else if (boat === 'ufo') {
    // Flying saucer — hovers, wide disc, blinking lights
    px(bX - 28, bY + P,   58, P*2, hc1); // main disc
    px(bX - 24, bY + P*3, 50, P,   hc2); // disc underside
    px(bX - 20, bY,       42, P,   hc2); // disc top edge
    // Dome base over character
    px(bX - 18, bY - P*2, 38, P*2, '#7ec8e3');
    // Blinking lights
    const lp = Math.floor(S.t * 0.05) % 3;
    const lCols = ['#ffff44', '#ff44ff', '#44ffff'];
    px(bX - 22, bY + P*2, 6, 4, lCols[lp % 3]);
    px(bX - 5,  bY + P*2, 6, 4, lCols[(lp + 1) % 3]);
    px(bX + 12, bY + P*2, 6, 4, lCols[(lp + 2) % 3]);

  } else if (boat === 'duck') {
    // Rubber duck boat
    px(bX - 24, bY,       50, P*2, hc1);
    px(bX - 20, bY + P*2, 42, P,   hc2);
    px(bX - 16, bY + P*3, 34, P,   hc2);
    const bowSide = facingLeft ? bX - 20 : bX + 14;
    px(bowSide,      bY - P*4,  14, 12, hc1);
    px(bowSide + (facingLeft ? -4 : 4), bY - P*2, 8, 4, hc2);
    px(bowSide + 4,  bY - P*4, 3, 3, '#1a1a1a');

  } else if (boat === 'bathtub') {
    // Bathtub
    px(bX - 26, bY,       54, P*2, hc1);
    px(bX - 22, bY + P*2, 46, P,   hc2);
    px(bX - 28, bY - P*4, P*2, P*6, hc1);
    px(bX + 22, bY - P*4, P*2, P*6, hc1);
    px(bX - 22, bY - P*2,  8,   4, '#c0c0c0');
    px(bX + 16, bY - P*2,  8,   4, '#c0c0c0');

  } else if (boat === 'cardboard') {
    // Cardboard box boat
    px(bX - 24, bY - P*2, 50, P*4, hc1);
    px(bX - 20, bY + P*2, 42, P,   hc2);
    px(bX - 28, bY - P,    6, P*3, hc2);
    px(bX + 22, bY - P,    6, P*3, hc2);
    px(bX - 8,  bY - P*3, 18, P,   '#c8a050');
    px(bX - 20, bY - P*3, 14, P*2, hc2);
    px(bX + 6,  bY - P*3, 14, P*2, hc2);

  } else if (boat === 'raft') {
    // Log raft
    px(bX - 28, bY,       58, P*2, '#8B5E3C');
    px(bX - 28, bY - P*2, 58, P*2, '#7a4e2c');
    px(bX - 28, bY - P*4, 58, P*2, '#6a3e1c');
    px(bX - 16, bY - P*5, 4, P*6, '#c8a050');
    px(bX + 12, bY - P*5, 4, P*6, '#c8a050');

  } else if (boat === 'submarine') {
    // Submarine
    px(bX - 26, bY - P,   54, P*3, hc1);
    px(bX - 22, bY + P*2, 46, P,   hc2);
    px(bX - 8,  bY - P*4, 18, P*3, hc2);
    px(bX - 4,  bY - P*7,  4, P*3, '#888888');
    px(bX - 16, bY,  6, 5, '#c8e8ff');
    px(bX + 10, bY,  6, 5, '#c8e8ff');
    const torpX = facingLeft ? bX - 28 : bX + 22;
    px(torpX, bY, 8, P*3, hc2);

  } else {
    // Fallback — generic hull
    px(bX - 22, bY,       50, P*2, hc1);
    px(bX - 18, bY + P*2, 42, P,   hc2);
    px(bX - 14, bY + P*3, 34, P,   hc2);
    px(bX - 25, bY - P,    5, P,   hc1);
    px(bX + 25, bY - P,    5, P,   hc1);
  }

  // Bow lantern (front/cast side)
  {
    const phase = getDayPhase();
    const nightT = phase < 0.25 ? 1 - phase / 0.25
                 : phase > 0.75 ? (phase - 0.75) / 0.25
                 : 0;
    const flicker = nightT > 0.05
      ? 0.85 + 0.15 * Math.sin(Date.now() / 120 + Math.sin(Date.now() / 47))
      : 1;
    // Some boats skip the wooden lantern — they have their own aesthetics
    if (!(boat === 'bathtub' || boat === 'cardboard' || boat === 'ufo')) {
    // Duck boat: lamp mounts on stern (duck head occupies the bow)
    const bowX = boat === 'duck'
      ? (facingLeft ? bX + 18 : bX - 22)
      : (facingLeft ? bX - 22 : bX + 18);
    px(bowX + 1, bY - 6, 2, 6, '#6a4a20');
    px(bowX,     bY - 9, 5, 5, '#c8a030');
    px(bowX + 1, bY - 8, 3, 3, nightT > 0.1 ? '#ffee88' : '#888840');
    px(bowX - 1, bY -11, 7, 2, '#6a4a20');
    if (nightT > 0.05) {
      ctx.save();
      ctx.shadowColor = '#ffcc44';
      ctx.shadowBlur  = Math.round(28 * nightT * flicker);
      ctx.globalAlpha = 0.85 * nightT * flicker;
      ctx.fillStyle   = '#ffee88';
      ctx.beginPath(); ctx.arc(bowX + 2, bY - 7, 6, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur  = 0;
      ctx.globalAlpha = 0.14 * nightT * flicker;
      ctx.beginPath(); ctx.ellipse(bowX + 2, bY + P * 2, 20, 5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    } // end lamp skip
  }

  // Character — hidden on enclosed/crewed vessels
  const hideCharacter = boat === 'cardboard' || boat === 'submarine' || boat === 'ufo';
  if (!hideCharacter) {
  px(cX,     cY + 10, 10, 9,  '#3a3a6a'); // body
  px(cX - 2, cY,      14, 12, '#f5e6d0'); // head

  // Eyes shift toward cast direction — gives "turned head" look
  // facingLeft: eyes cluster left; facingRight: eyes cluster right
  const eyeNear = facingLeft ? cX + 1 : cX + 7;
  const eyeFar  = facingLeft ? cX + 5 : cX + 3;
  const mouthX  = facingLeft ? cX + 1 : cX + 5;

  if (S.mood === 'sleepy') {
    // Fully closed — two separate fine lines, fixed positions with clear gap
    px(cX + 1, cY + 5, 3, 1, '#000000');
    px(cX + 7, cY + 5, 3, 1, '#000000');
  } else if (S.mood === 'focused') {
    // Wide open, no blink — alert, near eye bigger for 3D feel
    px(eyeNear, cY + 3, 3, 3, '#1a1a2e');
    px(eyeNear, cY + 3, 1, 1, '#fff');
    px(eyeFar,  cY + 4, 2, 2, '#1a1a2e');
    px(eyeFar,  cY + 4, 1, 1, '#fff');
  } else {
    // Idle — near eye bigger, far eye smaller, occasional blink
    const blink = Math.floor(S.t * 0.02) % 110 > 106;
    if (!blink) {
      px(eyeNear, cY + 4, 3, 2, '#1a1a2e');
      px(eyeNear, cY + 4, 1, 1, '#fff');
      px(eyeFar,  cY + 4, 2, 2, '#1a1a2e');
      px(eyeFar,  cY + 4, 1, 1, '#fff');
    } else {
      px(eyeNear, cY + 5, 4, 1, '#1a1a2e');
      px(eyeFar,  cY + 5, 3, 1, '#1a1a2e');
    }
  }

  // Mouth — shifted toward cast side
  if (S.smileTimer > 0) {
    // Curved smile — corners up, middle lower = ∪ shape
    px(mouthX,     cY + 9,  1, 1, '#c0846a'); // left corner up
    px(mouthX + 5, cY + 9,  1, 1, '#c0846a'); // right corner up
    px(mouthX + 1, cY + 10, 4, 1, '#c0846a'); // middle lower
  } else if (S.mood === 'focused') {
    // Tight determined line
    px(mouthX, cY + 9, 5, 1, '#c0846a');
  } else if (S.mood === 'sleepy') {
    // Slight open / slack jaw
    px(mouthX, cY + 9, 3, 1, '#c0846a');
    px(mouthX + 1, cY + 10, 2, 1, '#a06050');
  } else {
    // Idle — small smile, shifted toward cast side
    px(mouthX,     cY + 9,  2, 1, '#c0846a');
    px(mouthX + 2, cY + 10, 2, 1, '#c0846a');
  }

  // Mood dot
  px(cX + 12, cY - 1, 3, 3, MOOD_COL[S.mood]);

  // Hat (cosmetic)
  {
    const [hc1, hc2] = HAT_COLORS[S.cosmetics.hat] || HAT_COLORS.straw;
    const hat = S.cosmetics.hat;
    if (hat === 'straw') {
      px(cX - 4, cY - 2, 18, 2, hc2); // brim
      px(cX,     cY - 5, 10, 3, hc1); // top
    } else if (hat === 'cap' || hat === 'redcap') {
      px(cX - 1, cY - 2, 12, 2, hc2); // brim
      px(facingLeft ? cX - 3 : cX + 10, cY - 2, 4, 2, hc2); // visor
      px(cX,     cY - 5, 10, 3, hc1);
    } else if (hat === 'wizard') {
      px(cX - 3, cY - 2, 16, 2, hc2); // brim
      px(cX + 1, cY - 5, 8,  3, hc1);
      px(cX + 3, cY - 8, 4,  3, hc1);
      px(cX + 4, cY -11, 2,  3, hc1);
      px(cX + 5, cY - 5, 2,  2, '#ffd700'); // star
    } else if (hat === 'crown') {
      px(cX - 1, cY - 2, 12, 3, hc1); // band
      px(cX,     cY - 5, 2,  3, hc1); // spike L
      px(cX + 4, cY - 6, 2,  4, hc1); // spike M
      px(cX + 8, cY - 5, 2,  3, hc1); // spike R
      px(cX + 2, cY - 3, 2,  2, '#e74c3c'); // gem
      px(cX + 6, cY - 3, 2,  2, '#3498db'); // gem
    } else if (hat === 'beanie') {
      px(cX,     cY - 4, 10, 4, hc1);
      px(cX - 1, cY - 2, 12, 2, hc2); // fold
      px(cX + 4, cY - 6, 2,  2, hc2); // bobble
    } else if (hat === 'tophat') {
      px(cX - 2, cY - 2, 14, 2, hc2); // brim
      px(cX + 1, cY - 8, 8,  6, hc1); // tall top
    } else if (hat === 'helmet') {
      px(cX - 2, cY - 2, 14, 2, hc2);
      px(cX,     cY - 5, 10, 3, hc1);
      px(cX - 1, cY - 3, 2,  3, hc1); // ear L
      px(cX + 9, cY - 3, 2,  3, hc1); // ear R
      px(cX + 2, cY - 2, 3,  1, '#fff8'); // visor glare
    } else if (hat === 'pirate') {
      px(cX - 2, cY - 2, 14, 2, hc2); // brim
      px(cX + 1, cY - 6, 8,  4, hc1); // body
      px(cX + 4, cY - 8, 2,  2, hc1); // peak L
      px(cX + 6, cY - 8, 2,  2, hc1); // peak R
      px(cX + 4, cY - 5, 4,  1, '#f0f0f0'); // skull stripe
    } else if (hat === 'halo') {
      // Glowing ring above head
      ctx.globalAlpha = 0.8 + Math.sin(S.t * 0.05) * 0.2;
      ctx.strokeStyle = hc1;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(cX + 5, cY - 6, 7, 3, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    } else if (hat === 'bucket') {
      px(cX - 4, cY - 2, 18, 2, hc2); // brim
      px(cX,     cY - 5, 10, 3, hc1); // crown
      px(cX + 1, cY - 6, 8,  1, hc2); // top fold
    } else if (hat === 'party') {
      px(cX - 1, cY - 2, 12, 2, hc2); // brim
      px(cX + 1, cY - 5, 8,  3, hc1);
      px(cX + 3, cY - 8, 4,  3, hc1);
      px(cX + 5, cY -10, 2,  2, hc1);
      px(cX + 5, cY -11, 2,  1, '#ffd700'); // tip
    } else if (hat === 'sombrero') {
      px(cX - 6, cY - 2, 22, 2, hc2); // very wide brim
      px(cX,     cY - 5, 10, 3, hc1);
      px(cX + 1, cY - 7, 8,  2, hc1);
      px(cX,     cY - 3, 10, 1, '#e74c3c'); // band
    } else if (hat === 'beret') {
      px(cX - 1, cY - 2, 12, 1, hc1);
      px(cX,     cY - 5, 10, 3, hc1);
      px(cX + 8, cY - 4, 4,  3, hc2); // side puff
    } else if (hat === 'tinfoil') {
      px(cX - 2, cY - 2, 14, 2, hc2); // brim
      px(cX,     cY - 5, 10, 3, hc1);
      px(cX + 1, cY - 8, 8,  3, hc1);
      px(cX + 3, cY -10, 4,  2, hc1);
      // Shine crease
      ctx.fillStyle = '#ffffff88'; ctx.fillRect((cX+3), (cY-9), 2, 7);
    }
  }

  // Buddy — swims near the boat in the water
  {
    const buddy = S.cosmetics.buddy || 'none';
    if (buddy !== 'none') {
      // Drift left/right and bob in the water behind the boat
      // Fully independent from the boat — own drift and bob rhythms
      const buddyDrift = Math.sin(S.t * 0.011 + 2.7) * 14;
      const buddyBob   = Math.sin(S.t * 0.019 + 1.1) * 3;
      const bX2 = Math.round(W * 0.44 + buddyDrift);
      const bY2 = Math.round(wY + 30 + buddyBob);

      if (buddy === 'cat') {
        // Head + ears above water — matches shop preview (grid at 1px per unit)
        px(bX2 + 3, bY2 - 4, 2, 2, '#888888'); // ear L
        px(bX2 + 7, bY2 - 4, 2, 2, '#888888'); // ear R
        px(bX2 + 3, bY2 - 3, 6, 3, '#888888'); // head
        px(bX2 + 2, bY2 - 1, 8, 3, '#888888'); // neck/chest at waterline
        px(bX2 + 4, bY2 - 1, 1, 1, '#1a1a1a'); // eye L
        px(bX2 + 7, bY2 - 1, 1, 1, '#1a1a1a'); // eye R
        px(bX2 + 5, bY2,     2, 1, '#e8a0a0'); // nose
        // whiskers
        ctx.strokeStyle = '#cccccc'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(bX2+2, bY2); ctx.lineTo(bX2+5, bY2+1); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(bX2+10, bY2); ctx.lineTo(bX2+7, bY2+1); ctx.stroke();
      } else if (buddy === 'dog') {
        // Doggy paddle — head + ears above water, paws alternate
        px(bX2 + 1, bY2 - 4, 3, 4, '#a07040'); // ear L
        px(bX2 + 8, bY2 - 4, 3, 4, '#a07040'); // ear R
        px(bX2 + 2, bY2 - 4, 8, 3, '#c8a060'); // head
        px(bX2 + 1, bY2 - 1, 10, 3, '#c8a060'); // body at waterline
        px(bX2 + 4, bY2 - 3, 1, 1, '#1a1a1a'); // eye L
        px(bX2 + 7, bY2 - 3, 1, 1, '#1a1a1a'); // eye R
        px(bX2 + 5, bY2 - 2, 2, 1, '#cc6655'); // snout
        // Paws alternating at surface
        const pawSplash = Math.round(Math.abs(Math.sin(S.t * 0.08)) * 2);
        px(bX2,     bY2 + 1 - pawSplash, 3, 2, '#c8a060'); // paw L
        px(bX2 + 9, bY2 + 1 - (2 - pawSplash), 3, 2, '#c8a060'); // paw R
      } else if (buddy === 'duck') {
        // Full duck floating — matches shop preview
        px(bX2 + 4, bY2 - 5, 4, 3, '#f1c40f'); // head
        px(bX2 + 8, bY2 - 4, 3, 2, '#e67e22'); // beak
        px(bX2 + 2, bY2 - 2, 8, 4, '#f1c40f'); // body
        px(bX2 + 5, bY2 - 4, 1, 1, '#1a1a1a'); // eye
      } else if (buddy === 'gnome') {
        // Gnome on a tiny log — matches shop layout
        px(bX2 - 2, bY2 + 1, 16, 3, '#8B5E3C'); // log
        px(bX2 + 4, bY2 - 8, 4, 4, '#e74c3c'); // hat top
        px(bX2 + 3, bY2 - 7, 6, 3, '#e74c3c'); // hat wide
        px(bX2 + 2, bY2 - 4, 8, 2, '#f0e8d8'); // brim
        px(bX2 + 3, bY2 - 2, 6, 3, '#c8a878'); // face
        px(bX2 + 4, bY2 - 1, 4, 2, '#f0f0f0'); // beard
        px(bX2 + 2, bY2 + 1, 8, 2, '#4a7a3a'); // body (on log)
      } else if (buddy === 'parrot') {
        // Parrot hovers above water — matches shop layout, wings animate
        const flapY = Math.round(Math.sin(S.t * 0.07) * 4);
        const wingSpread = Math.round(Math.abs(Math.sin(S.t * 0.07)) * 5);
        px(bX2 + 3, bY2 - 9 + flapY,  2, 2, '#e74c3c'); // crest
        px(bX2 + 4, bY2 - 8 + flapY,  4, 3, '#27ae60'); // head
        px(bX2 + 7, bY2 - 7 + flapY,  3, 2, '#f39c12'); // beak
        px(bX2 + 2, bY2 - 5 + flapY,  8, 4, '#27ae60'); // body
        px(bX2 + 4, bY2 - 3 + flapY,  3, 2, '#f1c40f'); // chest
        px(bX2 + 5, bY2 - 7 + flapY,  1, 1, '#1a1a1a'); // eye
        // Wings
        px(bX2 + 2 - wingSpread, bY2 - 5 + flapY, wingSpread + 1, 2, '#27ae60');
        px(bX2 + 10,             bY2 - 5 + flapY, wingSpread + 1, 2, '#27ae60');
      }
    }
  }

  // Mood indicator above head
  ctx.textAlign = 'left';
  if (S.mood === 'idle') {
    const zp = S.t * 0.018;
    const zData = [
      { ch: 'Z', dx: 14, dy: -6,  size: '11px', phase: 0 },
      { ch: 'z', dx: 20, dy: -16, size: '13px', phase: 1.1 },
      { ch: 'Z', dx: 26, dy: -27, size: '11px', phase: 2.2 },
    ];
    for (const z of zData) {
      ctx.font = `bold ${z.size} Courier New`;
      const alpha = (Math.sin(zp + z.phase) * 0.3 + 0.55);
      const zy = cY + z.dy + Math.sin(zp + z.phase) * 2;
      const zx = cX + z.dx;
      // Dark outline for contrast against any sky
      ctx.globalAlpha = alpha * 0.9;
      ctx.fillStyle = '#0a0c18';
      for (const [ox, oy] of [[-1,0],[1,0],[0,-1],[0,1]]) ctx.fillText(z.ch, zx + ox, zy + oy);
      // White Z on top
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#ffffff';
      ctx.fillText(z.ch, zx, zy);
    }
    ctx.globalAlpha = 1;
  } else if (S.mood === 'focused') {
    // Pixel-art speech bubble
    const bx = cX + 12, by = cY - 32, bw = 16, bh = 14;
    ctx.globalAlpha = 0.9 + Math.sin(S.t * 0.1) * 0.1;
    ctx.fillStyle = '#f0eeff';
    ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = '#9090dd';
    ctx.fillRect(bx,          by,          bw, 1);
    ctx.fillRect(bx,          by + bh - 1, bw, 1);
    ctx.fillRect(bx,          by,          1,  bh);
    ctx.fillRect(bx + bw - 1, by,          1,  bh);
    ctx.fillStyle = '#f0eeff';
    ctx.fillRect(bx + 3, by + bh,     4, 2);
    ctx.fillRect(bx + 3, by + bh + 2, 2, 1);
    ctx.fillStyle = '#9090dd';
    ctx.fillRect(bx + 3, by + bh,     1, 2);
    ctx.fillRect(bx + 6, by + bh,     1, 2);
    ctx.font = 'bold 10px Courier New';
    ctx.fillStyle = '#e67e22';
    ctx.textAlign = 'center';
    ctx.fillText('!', bx + bw / 2, by + bh - 3);
    ctx.textAlign = 'left';
    ctx.globalAlpha = 1;
  } else if (S.mood === 'sleepy') {
    const zp = S.t * 0.012;
    const zData = [
      { ch: 'Z', dx: 14, dy: -6,  size: '13px', phase: 0 },
      { ch: 'z', dx: 22, dy: -18, size: '11px', phase: 1.4 },
      { ch: 'Z', dx: 28, dy: -30, size: '15px', phase: 2.8 },
    ];
    for (const z of zData) {
      ctx.font = `bold ${z.size} Courier New`;
      const alpha = Math.max(0, Math.sin(zp + z.phase) * 0.5 + 0.5);
      const zy = cY + z.dy + Math.sin(zp + z.phase) * 3;
      const zx = cX + z.dx;
      ctx.globalAlpha = alpha * 0.9;
      ctx.fillStyle = '#0a0c18';
      for (const [ox, oy] of [[-1,0],[1,0],[0,-1],[0,1]]) ctx.fillText(z.ch, zx + ox, zy + oy);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#ffffff';
      ctx.fillText(z.ch, zx, zy);
    }
    ctx.globalAlpha = 1;
  }
  } // end hideCharacter

  // Night lantern area illumination — additive glow that brightens boat/character/water
  {
    const phase = getDayPhase();
    const nightT = phase < 0.25 ? 1 - phase / 0.25
                 : phase > 0.75 ? (phase - 0.75) / 0.25
                 : 0;
    if (nightT > 0.05 && boat !== 'bathtub' && boat !== 'cardboard' && boat !== 'ufo') {
      const flicker = 0.88 + 0.12 * Math.sin(Date.now() / 130 + Math.sin(Date.now() / 53));
      const strength = nightT * flicker;
      const bowX  = boat === 'duck'
        ? (facingLeft ? bX + 21 : bX - 19)
        : (facingLeft ? bX - 19 : bX + 21);
      const lightY = bY - 7;

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';

      const g1 = ctx.createRadialGradient(bowX, lightY, 0, bowX, lightY, 300);
      g1.addColorStop(0,   `rgba(255, 220, 120, ${0.38 * strength})`);
      g1.addColorStop(0.15, `rgba(255, 200, 80,  ${0.24 * strength})`);
      g1.addColorStop(0.35, `rgba(255, 170, 40,  ${0.13 * strength})`);
      g1.addColorStop(0.6, `rgba(255, 130, 10,  ${0.06 * strength})`);
      g1.addColorStop(0.85, `rgba(255, 90,  0,   ${0.02 * strength})`);
      g1.addColorStop(1,   'rgba(255, 80, 0, 0)');
      ctx.fillStyle = g1;
      ctx.beginPath(); ctx.ellipse(bowX, lightY + 20, 300, 200, 0, 0, Math.PI * 2); ctx.fill();

      ctx.restore();
    }
  }

  // Rod — flips with character direction, swings during cast animation
  let swingOffset = 0;
  if (S.castAnim) {
    const p = S.castAnim.t / (S.castAnim.phase === 'swing' ? 18 : 20);
    swingOffset = S.castAnim.phase === 'swing'
      ? Math.sin(p * Math.PI) * 22 * (facingLeft ? -1 : 1)
      : 0;
  }
  const rBX = facingLeft ? cX - 1   : cX + 12;
  const rBY = cY + 7;
  const rTX = (facingLeft ? bX - 46  : bX + 46) + swingOffset;
  const rTY = bY - 36 - Math.abs(swingOffset) * 0.4;
  ctx.strokeStyle = ROD_COLORS[S.cosmetics.rod] || '#8B7355';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(rBX, rBY);
  ctx.quadraticCurveTo(
    facingLeft ? rBX - 14 : rBX + 14,
    rBY - 22,
    rTX, rTY
  );
  ctx.stroke();
  px(rTX - 1, rTY - 1, 2, 2, '#a09070');

  S._tip = { x: rTX, y: rTY };

  // Hourly goal banner — drawn above the character's head
  drawHourlyBanner(canvas.width);
}

function drawLine(wY) {
  if (!S._tip) return;
  if (S.mood === 'idle' || S.mood === 'sleepy') return;

  const bobX     = S._bobberX;
  const bobY     = S._bobberY;
  const bobberId = S.cosmetics.bobber || 'classic';
  const lureId   = S.cosmetics.lure   || 'none';
  const lureItem = (COSMETICS.lure || []).find(l => l.id === lureId);
  const isBait   = !lureItem || lureItem.bait === true;
  const useLure  = lureId !== 'none' && LURE_COLORS[lureId] != null && !isBait;
  const bc       = BOBBER_COLORS[bobberId];
  const lc       = LURE_COLORS[lureId];
  const dayPhase = getDayPhase();
  const isNight  = dayPhase < 0.25 || dayPhase > 0.75;

  // ── Fishing line: rod tip → bobber/lure position ──
  ctx.strokeStyle = 'rgba(200,200,240,0.75)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(S._tip.x, S._tip.y);
  const midX = (S._tip.x + bobX) * 0.5;
  const midY = Math.min(S._tip.y, bobY) - 8;
  ctx.quadraticCurveTo(midX, midY, bobX, bobY);
  ctx.stroke();

  if (S.reelProgress < 0.95) {
    if (useLure) {
      // ── LURE MODE: no bobber, lure sits at water surface ──
      const lureY = wY + 3;

      if (lureId === 'frog') {
        px(bobX - 4, lureY,     8, 5, lc.color);
        px(bobX - 5, lureY + 2, 2, 2, lc.dark);
        px(bobX + 3, lureY + 2, 2, 2, lc.dark);
        px(bobX - 3, lureY + 5, 6, 2, lc.belly);
      } else if (lureId === 'spinner') {
        px(bobX - 1, lureY,     3, 9, lc.color);
        const bAngle = (S.t * 0.12) % (Math.PI * 2);
        px(Math.round(bobX + Math.cos(bAngle) * 4) - 2,
           Math.round(lureY + 4 + Math.sin(bAngle) * 2) - 1, 4, 2, lc.blade);
      } else if (lureId === 'spoon') {
        px(bobX - 2, lureY,     5, 2, lc.color);
        px(bobX - 3, lureY + 2, 7, 5, lc.color);
        px(bobX - 2, lureY + 7, 5, 2, lc.color);
        px(bobX - 1, lureY + 2, 3, 3, lc.shine);
      } else if (lureId === 'fly') {
        px(bobX - 1, lureY + 3, 3, 5, lc.color);
        px(bobX - 5, lureY,     4, 4, lc.wing);
        px(bobX + 2, lureY,     4, 4, lc.wing);
        px(bobX - 2, lureY,     4, 3, lc.color);
      } else if (lureId === 'deepdiver') {
        px(bobX - 5, lureY,     10, 7, lc.color);
        px(bobX - 5, lureY + 7,  6, 2, lc.belly);
        px(bobX - 3, lureY + 1,  3, 3, '#c8e8ff');
      } else if (lureId === 'firefly') {
        const ga = 0.5 + Math.sin(S.t * 0.08) * 0.4;
        ctx.globalAlpha = ga;
        ctx.shadowColor = lc.color; ctx.shadowBlur = 10;
        px(bobX - 2, lureY, 5, 5, lc.color);
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
        if (isNight) {
          ctx.globalAlpha = ga * 0.4;
          ctx.fillStyle = lc.color + '44';
          ctx.beginPath(); ctx.arc(bobX, lureY + 2, 10, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = 1;
        }
      } else if (lureId === 'crawler') {
        const wx = Math.sin(S.t * 0.08) * 2;
        px(bobX - 3 + wx, lureY,     5, 3, lc.color);
        px(bobX - 4 + wx, lureY + 3, 6, 3, lc.dark);
        px(bobX - 2 + wx, lureY + 6, 5, 3, lc.color);
        px(bobX - 3 + wx, lureY + 9, 5, 2, lc.dark);
      } else if (lureId === 'squid') {
        px(bobX - 3, lureY,     6, 5, lc.color);
        px(bobX - 5, lureY + 5, 3, 4, lc.dark);
        px(bobX - 2, lureY + 5, 3, 4, lc.dark);
        px(bobX + 1, lureY + 5, 3, 4, lc.dark);
        px(bobX + 4, lureY + 5, 3, 4, lc.dark);
      }

      // Lure strike splash animation
      if (S.lureSplash > 0) {
        const sp = S.lureSplash / 55; // 1→0
        // Expanding burst rings
        for (let i = 0; i < 3; i++) {
          const rp = ((1 - sp) + i * 0.25) % 1;
          const r  = 4 + rp * 22;
          ctx.globalAlpha = (1 - rp) * 0.7 * sp;
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth   = 2 - rp;
          ctx.beginPath();
          ctx.ellipse(Math.round(bobX), Math.round(lureY + 2), r, r * 0.35, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
        // Upward water drops
        for (let i = 0; i < 5; i++) {
          const seed  = i * 137.5;
          const angle = (seed % 180 - 90) * Math.PI / 180;
          const dist2 = (1 - sp) * (12 + (seed % 8));
          const dx2   = Math.sin(angle) * dist2;
          const dy2   = -Math.abs(Math.cos(angle)) * dist2 * 1.5;
          ctx.globalAlpha = sp * 0.8;
          ctx.fillStyle   = '#aaddff';
          ctx.fillRect(Math.round(bobX + dx2) - 1, Math.round(lureY + dy2) - 1, 2, 2);
        }
        ctx.globalAlpha = 1;
      }

      // Lure is the fish target
      S.wormX = bobX;
      S.wormY = lureY + 6;

    } else {
      // ── BOBBER MODE: float on surface, worm/bait at depth ──
      if (bobberId !== 'none' && bc) {
        if (bobberId === 'oval') {
          ctx.fillStyle = bc.top;
          ctx.beginPath(); ctx.ellipse(bobX, bobY + 4, 5, 8, 0, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = bc.bot;
          ctx.beginPath(); ctx.ellipse(bobX, bobY + 9, 5, 5, 0, 0, Math.PI * 2); ctx.fill();
        } else if (bobberId === 'star') {
          ctx.fillStyle = bc.top;
          ctx.beginPath();
          for (let i = 0; i < 5; i++) {
            const a  = (i * 4 * Math.PI / 5) - Math.PI / 2;
            const ai = a + 2 * Math.PI / 5;
            if (i === 0) ctx.moveTo(bobX + Math.cos(a) * 7, bobY + 5 + Math.sin(a) * 7);
            else         ctx.lineTo(bobX + Math.cos(a) * 7, bobY + 5 + Math.sin(a) * 7);
            ctx.lineTo(bobX + Math.cos(ai) * 3, bobY + 5 + Math.sin(ai) * 3);
          }
          ctx.closePath(); ctx.fill();
        } else if (bobberId === 'crystal') {
          ctx.globalAlpha = 0.7;
          px(bobX - 4, bobY,     8, 6, bc.top);
          px(bobX - 4, bobY + 6, 8, 4, bc.bot);
          ctx.globalAlpha = 0.4;
          px(bobX - 2, bobY + 1, 3, 3, '#ffffff');
          ctx.globalAlpha = 1;
        } else {
          // Standard round bobber
          px(bobX - 4, bobY,     8, 6, bc.top);
          px(bobX - 4, bobY + 6, 8, 4, bc.bot);
        }

        if (bc.glows) {
          const gs = isNight ? 0.5 + Math.sin(S.t * 0.06) * 0.15 : 0.15;
          ctx.globalAlpha = gs;
          ctx.shadowColor = bc.top; ctx.shadowBlur = 14;
          ctx.fillStyle = bc.top + '44';
          ctx.beginPath(); ctx.arc(bobX, bobY + 5, 10, 0, Math.PI * 2); ctx.fill();
          ctx.shadowBlur = 0;
          ctx.globalAlpha = 1;
        }
      }

      // Ripple rings at water surface
      for (let i = 0; i < 3; i++) {
        const phase = ((S.t * 0.016) + i * 0.333) % 1;
        const r = 5 + phase * 28;
        ctx.globalAlpha = (1 - phase) * 0.28;
        ctx.strokeStyle = '#5a9fff'; ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(Math.round(bobX), Math.round(wY + 3), r, r * 0.3, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // Depth line
      const depthLine = S.cast.depthLine * (1 - S.reelProgress * 0.95);
      const wormY = bobY + Math.max(4, depthLine);
      S.wormX = bobX;
      S.wormY = wormY;

      ctx.strokeStyle = 'rgba(160,160,190,0.22)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(bobX, bobY + 10);
      ctx.lineTo(bobX, wormY);
      ctx.stroke();

      // Worm / bait
      if (S.reelProgress < 0.9) {
        ctx.globalAlpha = 1 - S.reelProgress;
        if (lureId === 'crawler' && lc) {
          // Big orange crawler
          const wx = Math.sin(S.t * 0.08) * 2;
          px(bobX - 3 + wx, wormY,      5, 3, lc.color);
          px(bobX - 4 + wx, wormY + 3,  6, 3, lc.dark);
          px(bobX - 2 + wx, wormY + 6,  5, 3, lc.color);
          px(bobX - 3 + wx, wormY + 9,  5, 2, lc.dark);
        } else {
          // Default pink worm
          px(bobX - 2, wormY,     5, 3, '#d4688a');
          px(bobX - 3, wormY + 3, 4, 2, '#c0507a');
          px(bobX - 1, wormY + 5, 5, 2, '#d4688a');
        }
        ctx.globalAlpha = 1;
      }
    }
  } else {
    // Fully reeled — still need wormX/Y for fish targeting
    S.wormX = bobX;
    S.wormY = bobY;
  }
}

function drawFish(f, wY) {
  const x = Math.round(f.x);
  const y = Math.round(f.y);

  ctx.globalAlpha = Math.min(1, f.progress * 4 + 0.2);

  // Flip horizontally when facing right (default sprite faces left)
  ctx.save();
  if (f.facingLeft === false) {
    const fishCenterX = x + P * 4;
    ctx.translate(fishCenterX, 0);
    ctx.scale(-1, 1);
    ctx.translate(-fishCenterX, 0);
  }

  switch (f.type) {

    case 'fish': {
      // Oval body with forked tail and dorsal fin
      const c = f.color, dark = '#b85a00';
      // dorsal fin
      px(x+P*2, y,      P*2, P,   c);
      // body rows
      px(x+P,   y+P,    P*4, P,   c);
      px(x,     y+P*2,  P*5, P,   c);
      px(x+P,   y+P*3,  P*4, P,   c);
      // tail (forked)
      px(x+P*5, y+P,    P*2, P,   dark);
      px(x+P*6, y,      P,   P,   dark);
      px(x+P*5, y+P*3,  P*2, P,   dark);
      px(x+P*6, y+P*4,  P,   P,   dark);
      // eye
      px(x+P,   y+P*2,  P,   P,   '#111');
      px(x+P,   y+P*2,  2,   2,   '#fff');
      break;
    }

    case 'crab': {
      const c = f.color, cl = '#c0392b';
      // body (wide flat)
      px(x+P,   y+P,    P*5, P*2, c);
      px(x,     y+P*2,  P*7, P,   c);
      // eye stalks
      px(x+P*2, y,      P,   P*2, c);
      px(x+P*4, y,      P,   P*2, c);
      px(x+P,   y,      P*2, P,   '#111'); // eyes
      px(x+P*4, y,      P*2, P,   '#111');
      // left claw
      px(x-P*2, y+P,    P*2, P,   cl);
      px(x-P*3, y,      P,   P*2, cl);
      px(x-P*3, y+P*2,  P,   P,   cl);
      // right claw
      px(x+P*7, y+P,    P*2, P,   cl);
      px(x+P*8, y,      P,   P*2, cl);
      px(x+P*8, y+P*2,  P,   P,   cl);
      // legs
      for (let i = 0; i < 4; i++) {
        px(x+P*(i+1), y+P*3, P, P*2, cl);
      }
      break;
    }

    case 'creature': {
      // Anglerfish — big round head, angler light, glowing eye, teeth
      const c = f.color, glow = '#44e8ff', dark = '#6a3a9a';
      // body
      px(x,     y+P,    P*7, P*4, c);
      px(x+P,   y,      P*5, P,   c);
      px(x+P,   y+P*5,  P*5, P,   c);
      // tail
      px(x+P*7, y+P*2,  P*2, P*2, dark);
      px(x+P*8, y+P,    P,   P*4, dark);
      // big eye
      px(x+P,   y+P*2,  P*2, P*2, '#ddd');
      px(x+P*1.5,y+P*2.5,P, P,   '#111');
      px(x+P*1.5,y+P*2,  2,  2,   '#fff');
      // teeth
      px(x+P*2, y+P*5,  P,   P,   '#fff');
      px(x+P*4, y+P*5,  P,   P,   '#fff');
      // angler lure
      px(x+P*3, y-P*3,  P,   P*3, c);
      px(x+P*2, y-P*4,  P*3, P*2, glow);
      ctx.globalAlpha = (Math.sin(S.t * 0.1) * 0.3 + 0.7) * Math.min(1, f.progress * 4 + 0.2);
      px(x+P,   y-P*4,  P*5, P*3, glow); // glow halo
      ctx.globalAlpha = Math.min(1, f.progress * 4 + 0.2);
      break;
    }

    case 'chest': {
      // Treasure chest with lid that opens
      const c = f.color, band = '#8B5E3C', metal = '#d4a017';
      if (f.progress > 0.6) {
        // lid open
        px(x,   y-P*2,  P*5, P*2, metal);
        px(x+P, y-P*3,  P*3, P,   c);
      } else {
        // lid closed
        px(x,   y,      P*5, P*2, metal);
      }
      // box body
      px(x,     y+P*2,  P*5, P*3, c);
      // bands
      px(x,     y+P*2,  P*5, P,   band);
      px(x,     y+P*4,  P*5, P,   band);
      // lock
      px(x+P*2, y+P*3,  P,   P,   metal);
      // sparkle when open
      if (f.progress > 0.6 && Math.floor(S.t * 0.15) % 2 === 0) {
        px(x+P*5, y, 3, 3, '#fff');
        px(x+P,   y-P*3, 2, 2, '#fff');
      }
      break;
    }
  }

  ctx.globalAlpha = 1;

  ctx.restore(); // undo fish facing flip

  // Label shows while reeling
  if (f.phase === 'reeling' && f.progress > 0.3) {
    ctx.fillStyle = f.color;
    ctx.font = 'bold 10px Courier New';
    ctx.textAlign = 'center';
    ctx.globalAlpha = Math.min(1, (f.progress - 0.3) * 5);
    ctx.fillStyle = '#000';
    ctx.fillText(f.label, x + P * 3 + 1, y - P);
    ctx.fillStyle = f.color;
    ctx.fillText(f.label, x + P * 3, y - P - 1);
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  }
}

const THINKING_PHRASES = [
  'angling', 'trolling', 'jigging', 'trawling', 'casting',
  'drowning worms', 'wetting a line', 'tempting the deep',
  'negotiating with fish', 'communing with fish',
  'baiting the abyss', 'wooing the water',
  'sending an invitation', 'chasing fins',
  'consulting the depths', 'hook diplomacy',
  'aquatic ambush', 'sub-surface networking',
  'bottom feeding (respectfully)', 'deep sea vibing',
  'fish whispering', 'underwater cold outreach',
  'deploying worm', 'spearfishing (figuratively)',
  'luring', 'seducing fish',
];

function drawThinkingText(W, wY) {
  const fishing = S.activeFish.length > 0 || S.fishQueue.length > 0 || S.catchCooldown > 0;
  if (!fishing) return;

  const bX = W * 0.44;
  const textY = wY + 90;
  const phrase = S.activeFish.length > 0 ? S.activeFish[0].thought : null;
  if (!phrase) return;
  const alpha = 0.75;

  ctx.save();
  ctx.globalAlpha = alpha * 0.75;
  ctx.font = 'italic 12px Courier New';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(phrase, bX, textY);
  ctx.restore();
}

function drawParticles() {
  for (let i = S.particles.length - 1; i >= 0; i--) {
    const p = S.particles[i];
    p.x += p.vx; p.y += p.vy; p.vy += 0.1; p.life--;
    if (p.life <= 0) { S.particles.splice(i, 1); continue; }
    ctx.globalAlpha = p.life / 90;
    px(p.x, p.y, p.size, p.size, p.color);
  }
  ctx.globalAlpha = 1;
}

function drawLevelUpFlash(W, H) {
  if (levelUpFlash <= 0) return;
  levelUpFlash--;
  ctx.globalAlpha = (levelUpFlash / 90) * 0.35;
  ctx.fillStyle = '#4a8fff';
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 1;

  if (levelUpFlash > 40) {
    ctx.fillStyle = `rgba(200,210,255,${(levelUpFlash - 40) / 50})`;
    ctx.font = 'bold 11px Courier New';
    ctx.textAlign = 'center';
    ctx.fillText(`LEVEL ${S.level}`, W / 2, H / 2);
    ctx.textAlign = 'left';
  }
}

function drawMilestoneFlash(W, H) {
  if (milestoneFlash.timer <= 0) return;
  milestoneFlash.timer--;
  const t = milestoneFlash.timer;
  const fadeIn  = Math.min(1, (220 - t) / 20);
  const fadeOut = Math.min(1, t / 40);
  const alpha   = Math.min(fadeIn, fadeOut);

  // Gold screen wash
  ctx.globalAlpha = alpha * 0.28;
  ctx.fillStyle = '#ffd700';
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 1;

  if (t > 30) {
    const scale = 1 + Math.sin((220 - t) * 0.15) * 0.04; // slight pulse
    ctx.save();
    ctx.translate(W / 2, H / 2 - 20);
    ctx.scale(scale, scale);
    ctx.textAlign = 'center';
    // Shadow
    ctx.globalAlpha = alpha * 0.9;
    ctx.fillStyle = '#7a5500';
    ctx.font = 'bold 16px Courier New';
    ctx.fillText(milestoneFlash.text, 2, 2);
    // Gold text
    ctx.fillStyle = '#ffd700';
    ctx.fillText(milestoneFlash.text, 0, 0);
    // Coins subtext
    ctx.font = 'bold 10px Courier New';
    ctx.fillStyle = '#ffe566';
    ctx.fillText(`+${milestoneFlash.coins} 🪙`, 0, 18);
    ctx.globalAlpha = 1;
    ctx.restore();
    ctx.textAlign = 'left';
  }
}

function drawHourlyBanner(W) {
  const goal    = S.hourGoal;
  const current = Math.min(S.hourFish, goal);
  const pct     = current / goal;
  const done    = pct >= 1;
  const reward  = goal * 4;
  const label   = `Hourly Goal: ${current} / ${goal}  +${reward}🪙`;

  ctx.font = 'bold 10px Courier New';
  const textW = ctx.measureText(label).width;
  const bW = textW + 18;
  const bH = 18;
  const bX = Math.round(W / 2 - bW / 2);
  const bY = 8;

  // Background
  ctx.globalAlpha = 0.88;
  ctx.fillStyle = '#0a0e1e';
  ctx.fillRect(bX, bY, bW, bH);
  // Progress fill
  ctx.fillStyle = done ? '#2ecc71' : '#4a8fff';
  ctx.fillRect(bX, bY + bH - 3, Math.round(bW * pct), 3);
  // Border
  ctx.strokeStyle = done ? '#2ecc71' : '#2a3a6a';
  ctx.lineWidth = 1;
  ctx.strokeRect(bX + 0.5, bY + 0.5, bW - 1, bH - 1);
  // Text
  ctx.globalAlpha = 1;
  ctx.fillStyle = done ? '#2ecc71' : '#ffffff';
  ctx.textAlign = 'center';
  ctx.fillText(label, bX + bW / 2, bY + bH - 5);
  ctx.textAlign = 'left';
}

// ── Game loop ─────────────────────────────────────────────────────────────────

function loop() {
  S.t++;

  const W = canvas.width, H = canvas.height;
  const wY = H * 0.56;
  S._wY = wY;

  // Mood
  const idleSec = (Date.now() - S.lastActivity) / 1000;
  const prevMood = S.mood;
  if (S.isActive || S.activeFish.length > 0 || S.fishQueue.length > 0 || S.catchCooldown > 0) S.mood = 'focused';
  else if (idleSec > 60) S.mood = 'sleepy';
  else                   S.mood = 'idle';
  if (S.mood !== prevMood) updateStats();

  // Ease bobber dip back to 0
  if (S.bobberDip > 0) S.bobberDip = Math.max(0, S.bobberDip - 0.4);
  if (S.smileTimer > 0) S.smileTimer--;
  if (S.catchCooldown > 0) S.catchCooldown--;

  // Drain queue — process next event when pond is clear
  if (S.activeFish.length === 0 && S.catchCooldown === 0 && S.fishQueue.length > 0) {
    const next = S.fishQueue.shift();
    if (next.type === 'cast') doCast();
    else if (next.type === 'fish') spawnFish(next.tool);
  }
  if (S.lureSplash > 0) S.lureSplash--;

  // Cast animation state machine
  if (S.castAnim) {
    S.castAnim.t++;
    if (S.castAnim.phase === 'swing' && S.castAnim.t >= 18) {
      S.castAnim = { phase: 'fly', t: 0 };
      sounds.cast();
    } else if (S.castAnim.phase === 'fly' && S.castAnim.t >= 20) {
      S.castAnim = null;
    }
  }

  // Reel tick sound
  if (S.reelProgress > 0) {
    S.reelTickTimer--;
    if (S.reelTickTimer <= 0) {
      sounds.reelTick();
      S.reelTickTimer = 6;
    }
  }

  // Compute reel progress (max among reeling fish)
  S.reelProgress = 0;
  for (const f of S.activeFish) {
    if (f.phase === 'reeling') S.reelProgress = Math.max(S.reelProgress, f.progress);
  }

  // Compute bobber position for this frame — whole rig reels toward rod tip
  {
    const tipY   = S._tip ? S._tip.y : 0;
    const tipX   = S._tip ? S._tip.x : 0;
    const wobble = Math.sin(S.t * 0.02) * 3 * (1 - S.reelProgress); // wobble fades as line tightens
    const castX  = Math.max(55, Math.min(W - 55, tipX + S.cast.offset));
    const baseY  = wY - 3 + Math.sin(S.t * 0.03) * 2 + S.bobberDip;
    // Bobber stays at the waterline — fish rises from depth as depthLine shrinks
    S._bobberX = castX + (tipX - castX) * S.reelProgress + wobble;
    S._bobberY = baseY;
  }

  // Fish state machine
  for (let i = S.activeFish.length - 1; i >= 0; i--) {
    const f = S.activeFish[i];

    if (f.phase === 'approaching') {
      const dx = S.wormX - f.x;
      const dy = S.wormY - f.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const speed = 1.4 + Math.random() * 0.4;
      if (dist < 10) {
        f.phase = 'biting';
        f.biteTimer = 40 + Math.floor(Math.random() * 30);
        const lureId2 = S.cosmetics.lure || 'none';
        const lureItem2 = (COSMETICS.lure || []).find(l => l.id === lureId2);
        if (lureId2 !== 'none' && LURE_COLORS[lureId2] && !(lureItem2 && lureItem2.bait)) {
          S.lureSplash = 55; // lure strike — surface explosion
        } else {
          S.bobberDip = 14; // bobber dip
        }
        sounds.bite();
      } else {
        const newX = f.x + (dx / dist) * speed;
        const newY = f.y + (dy / dist) * speed;
        if (Math.abs(newX - f.x) > 0.3) f.facingLeft = newX < f.x;
        f.x = newX; f.y = newY;
      }
    }

    else if (f.phase === 'biting') {
      // Wiggle at worm
      f.x = S.wormX + Math.sin(S.t * 0.4 + i) * 4;
      f.y = S.wormY + Math.cos(S.t * 0.3 + i) * 2;
      // Keep indicator going
      if (S.lureSplash > 0) {
        S.lureSplash = Math.max(S.lureSplash, 20); // keep splash active while biting
      } else {
        S.bobberDip = Math.max(S.bobberDip, 10);
      }
      f.biteTimer--;
      if (f.biteTimer <= 0) {
        f.phase = 'reeling';
        f.reelStartY = f.y;
        f.reelStartX = f.x;
        f.progress = 0;
        S.bobberDip = 0;
        S.lureSplash = 0;
        // Lock facing direction for reel — fish faces toward the rod
        if (S._tip) f.facingLeft = f.x > S._tip.x;
      }
    }

    else if (f.phase === 'reeling') {
      // Fish struggles harder as it nears the boat
      const struggle = f.progress;
      const fightBack = Math.random() < struggle * 0.15;
      f.progress += fightBack ? -0.004 : (0.010 + Math.random() * 0.006);
      f.progress = Math.max(0, f.progress);
      const wobbleAmp = 3 + struggle * 7;

      if (f.isLure) {
        // Lure mode: fish follows lure exactly, stays at surface
        f.x = S._bobberX;
        f.y = S._wY + 6 + Math.sin(S.t * 0.08 + i) * 3;
      } else {
        // Bobber mode: fish follows bobber exactly, rises from depth
        const depthLine = S.cast.depthLine * (1 - f.progress * 0.95);
        f.x = S._bobberX;
        f.y = S._bobberY + Math.max(4, depthLine);
      }

      if (f.progress >= 1) {
        const phase = getDayPhase();
        const atNight = phase < 0.22 || phase > 0.72;
        S.fishCaught.push({ type: f.type, label: f.label, rare: f.rare, color: f.color, atNight, ts: Date.now() });
        S.sessionFish.push({ color: f.color, rare: f.rare });

        // Milestone check
        const total = S.fishCaught.length;
        for (const m of MILESTONES) {
          if (total === m.count && !S.milestonesReached.includes(m.count)) {
            S.milestonesReached.push(m.count);
            milestoneFlash = { timer: 220, text: m.label, coins: m.coins };
            addCoins(m.coins);
            spawnFloatingText(`+${m.coins}🪙`, W * 0.5, wY - 60, '#ffd700', true);
            sounds.levelUp();
          }
        }

        // Hourly goal check — reset if an hour has passed
        if (Date.now() - S.hourStart > 3600000) {
          S.hourStart = Date.now();
          S.hourFish = 0;
          S.hourGoal = 8 + Math.floor(Math.random() * 10);
        }
        S.hourFish++;
        if (S.hourFish >= S.hourGoal) {
          const bonus = S.hourGoal * 4;
          addCoins(bonus);
          spawnFloatingText(`hourly goal! +${bonus}🪙`, W * 0.5, wY - 80, '#2ecc71', true);
          S.hourStart = Date.now();
          S.hourFish = 0;
          S.hourGoal = 8 + Math.floor(Math.random() * 10);
        }
        S.activeFish.splice(i, 1);
        const catchX = f.x;
        const catchY = S._wY - P * 4;
        sounds.catch();
        S.smileTimer = 120; // ~2 seconds at 60fps
        S.catchCooldown = 150; // wait for particles + text to finish before next fish
        const xpAmt = f.rare ? 50 : 15;
        const coinAmt = f.rare ? 15 + Math.floor(Math.random() * 6) : 1 + Math.floor(Math.random() * 3);
        addCoins(coinAmt);
        spawnFloatingText(`+${coinAmt}🪙`, catchX + 20, catchY - 10, '#f1c40f', false);
        tickDailyChallenge(null, { rare: f.rare });
        const leveled = addXP(xpAmt, catchX, catchY);
        if (leveled) { flashLevelUp(); sounds.levelUp(); }
        const label = (f.rare ? '✨ ' : '') + f.label + '!';
        spawnFloatingText(label, catchX, catchY - 24, f.color, true);
        const particleCount = f.rare ? 18 : 8;
        for (let j = 0; j < particleCount; j++) {
          S.particles.push({
            x: catchX + (Math.random() - 0.5) * 20,
            y: S._wY,
            vx: (Math.random() - 0.5) * (f.rare ? 5 : 3),
            vy: -Math.random() * (f.rare ? 5 : 3) - 1,
            life: (f.rare ? 50 : 25) + Math.random() * 20,
            color: f.rare ? '#ffd700' : f.color,
            size: 2 + Math.random() * (f.rare ? 4 : 2),
          });
        }
        checkQuests();
        if (document.getElementById('lib-panel').classList.contains('visible')) renderLibPanel();
        updateStats();
      }
    }
  }

  // Draw
  ctx.clearRect(0, 0, W, H);

  // Apply zoom + pan
  const zCX = W * 0.5, zCY = H * 0.52;
  const z = S.zoom;
  // Clamp pan to game bounds
  const maxPanX = (z - 1) * zCX;
  const maxPanY = (z - 1) * zCY;
  S.panX = Math.max(-maxPanX, Math.min(maxPanX, S.panX || 0));
  S.panY = Math.max(-(z - 1) * (H - zCY), Math.min(maxPanY, S.panY || 0));
  if (z !== 1.0 || S.panX || S.panY) {
    ctx.save();
    ctx.translate(zCX + S.panX, zCY + S.panY);
    ctx.scale(z, z);
    ctx.translate(-zCX, -zCY);
  }

  drawSky(W, wY);
  drawWater(W, H, wY);
  drawBoat(W, wY);
  drawLine(wY);
  for (const f of S.activeFish) drawFish(f, wY);
  drawThinkingText(W, wY);
  drawParticles();
  drawFloatingTexts();
  drawLevelUpFlash(W, H);
  drawMilestoneFlash(W, H);

  if (z !== 1.0 || S.panX || S.panY) ctx.restore();

  // Zoom indicator (top-left, subtle)
  if (Math.abs(S.zoom - 1.0) > 0.05) {
    ctx.fillStyle = 'rgba(100,100,180,0.55)';
    ctx.font = '9px Courier New';
    ctx.fillText(`${S.zoom.toFixed(1)}x`, 8, H - 8);
  }

  requestAnimationFrame(loop);
}

// Zoom via scroll wheel — min 1.0 so you can never zoom out past game view
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  S.zoom = Math.max(1.0, Math.min(2.5, S.zoom + (e.deltaY > 0 ? -0.1 : 0.1)));
  if (S.zoom === 1.0) { S.panX = 0; S.panY = 0; }
}, { passive: false });

// Pan via mouse drag when zoomed in
let _drag = null;
canvas.addEventListener('mousedown', (e) => {
  if (S.zoom > 1.0) _drag = { sx: e.clientX, sy: e.clientY, px: S.panX || 0, py: S.panY || 0 };
});
window.addEventListener('mousemove', (e) => {
  if (!_drag) return;
  S.panX = _drag.px + (e.clientX - _drag.sx);
  S.panY = _drag.py + (e.clientY - _drag.sy);
});
window.addEventListener('mouseup', () => { _drag = null; });

// init clouds once canvas is sized
initClouds(canvas.width || 460);

loop();
