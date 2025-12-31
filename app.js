// MIDI Looper Application

// Configuration
const LOOP_DURATION = 8; // 8 seconds (4 bars at 120 BPM)
const BPM = 120;
const BAR_DURATION = LOOP_DURATION / 4; // 2 seconds per bar

// State
let isRecording = false;
let isPlaying = false;
let recordedNotes = [];
let currentPreset = 'piano';
let activeNotes = new Map();
let scheduledEvents = [];
let audioStarted = false;

// DOM Elements
const recordBtn = document.getElementById('record-btn');
const playBtn = document.getElementById('play-btn');
const clearBtn = document.getElementById('clear-btn');
const progressBar = document.getElementById('progress-bar');
const recordingIndicator = document.getElementById('recording-indicator');
const drumOverlay = document.getElementById('drum-overlay');
const loopCounter = document.getElementById('loop-counter');
const presetBtns = document.querySelectorAll('.preset-btn');

// Instruments
let pianoSynth, leadSynth, drumSynths;

// Effects
let mainFilter, reverb, chorus, delay, distortion;

// Initialize Tone.js instruments
function initInstruments() {
    // Create effects chain (order: distortion -> chorus -> delay -> reverb -> filter -> output)
    mainFilter = new Tone.Filter(8000, 'lowpass').toDestination();

    reverb = new Tone.Reverb({
        decay: 2,
        wet: 0.2
    }).connect(mainFilter);

    delay = new Tone.PingPongDelay({
        delayTime: '8n',
        feedback: 0.3,
        wet: 0
    }).connect(reverb);

    chorus = new Tone.Chorus({
        frequency: 2,
        delayTime: 3.5,
        depth: 0.7,
        wet: 0
    }).connect(delay);

    distortion = new Tone.Distortion({
        distortion: 0,
        wet: 0
    }).connect(chorus);

    // Piano - warm polyphonic synth
    pianoSynth = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'triangle' },
        envelope: {
            attack: 0.02,
            decay: 0.3,
            sustain: 0.2,
            release: 1
        },
        volume: -6
    }).connect(distortion);

    // Synth - bright sawtooth
    leadSynth = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'sawtooth' },
        envelope: {
            attack: 0.05,
            decay: 0.2,
            sustain: 0.5,
            release: 0.8
        },
        volume: -8
    }).connect(distortion);

    // Start chorus LFO
    chorus.start();

    // Create drum synths once
    initDrumSynths();

    // Setup knob controls
    setupKnobs();
}

// Initialize drum synths (called once)
function initDrumSynths() {
    // Create hi-hat filter
    const hhFilter = new Tone.Filter(8000, 'highpass').toDestination();
    const cymbalFilter = new Tone.Filter(6000, 'highpass').toDestination();
    const clapFilter = new Tone.Filter(1500, 'bandpass').toDestination();

    const kick = new Tone.MembraneSynth({
        pitchDecay: 0.05,
        octaves: 6,
        oscillator: { type: 'sine' },
        envelope: { attack: 0.001, decay: 0.4, sustain: 0.01, release: 0.4 },
        volume: -4
    }).toDestination();

    const snare = new Tone.NoiseSynth({
        noise: { type: 'white' },
        envelope: { attack: 0.001, decay: 0.2, sustain: 0.01, release: 0.2 },
        volume: -10
    }).toDestination();

    const hihatClosed = new Tone.NoiseSynth({
        noise: { type: 'white' },
        envelope: { attack: 0.001, decay: 0.08, sustain: 0.01, release: 0.08 },
        volume: -16
    }).connect(hhFilter);

    const hihatOpen = new Tone.NoiseSynth({
        noise: { type: 'white' },
        envelope: { attack: 0.001, decay: 0.3, sustain: 0.01, release: 0.3 },
        volume: -16
    }).connect(hhFilter);

    const tomLow = new Tone.MembraneSynth({
        pitchDecay: 0.08,
        octaves: 4,
        envelope: { attack: 0.001, decay: 0.3, sustain: 0.01, release: 0.3 },
        volume: -8
    }).toDestination();

    const tomMid = new Tone.MembraneSynth({
        pitchDecay: 0.08,
        octaves: 4,
        envelope: { attack: 0.001, decay: 0.3, sustain: 0.01, release: 0.3 },
        volume: -8
    }).toDestination();

    const tomHigh = new Tone.MembraneSynth({
        pitchDecay: 0.08,
        octaves: 4,
        envelope: { attack: 0.001, decay: 0.3, sustain: 0.01, release: 0.3 },
        volume: -8
    }).toDestination();

    const crash = new Tone.NoiseSynth({
        noise: { type: 'white' },
        envelope: { attack: 0.001, decay: 1, sustain: 0.01, release: 1 },
        volume: -12
    }).connect(cymbalFilter);

    const ride = new Tone.MetalSynth({
        frequency: 300,
        envelope: { attack: 0.001, decay: 0.4, release: 0.2 },
        harmonicity: 5.1,
        modulationIndex: 32,
        resonance: 4000,
        octaves: 1.5,
        volume: -20
    }).toDestination();

    const clap = new Tone.NoiseSynth({
        noise: { type: 'white' },
        envelope: { attack: 0.001, decay: 0.15, sustain: 0.01, release: 0.15 },
        volume: -12
    }).connect(clapFilter);

    const rim = new Tone.MetalSynth({
        frequency: 400,
        envelope: { attack: 0.001, decay: 0.1, release: 0.1 },
        harmonicity: 3,
        modulationIndex: 16,
        resonance: 8000,
        octaves: 0.5,
        volume: -16
    }).toDestination();

    const cowbell = new Tone.MetalSynth({
        frequency: 560,
        envelope: { attack: 0.001, decay: 0.3, release: 0.1 },
        harmonicity: 5.1,
        modulationIndex: 32,
        resonance: 1000,
        octaves: 0.5,
        volume: -14
    }).toDestination();

    // Map notes to drums
    drumSynths = {
        'C3':  { synth: kick, note: 'C1', duration: '8n' },
        'C#3': { synth: snare, duration: '16n', isNoise: true },
        'D3':  { synth: hihatClosed, duration: '32n', isNoise: true },
        'D#3': { synth: hihatOpen, duration: '8n', isNoise: true },
        'E3':  { synth: tomLow, note: 'G2', duration: '8n' },
        'F3':  { synth: tomMid, note: 'C3', duration: '8n' },
        'F#3': { synth: tomHigh, note: 'E3', duration: '8n' },
        'G3':  { synth: crash, duration: '2n', isNoise: true },
        'G#3': { synth: ride, duration: '4n', isMetal: true },
        'A3':  { synth: clap, duration: '16n', isNoise: true },
        'A#3': { synth: rim, duration: '16n', isMetal: true },
        'B3':  { synth: cowbell, note: 'G5', duration: '8n', isMetal: true },
        'C4':  { synth: kick, note: 'C1', duration: '8n' },
        'C#4': { synth: snare, duration: '16n', isNoise: true },
        'D4':  { synth: hihatClosed, duration: '32n', isNoise: true },
        'D#4': { synth: hihatOpen, duration: '8n', isNoise: true },
        'E4':  { synth: tomLow, note: 'G2', duration: '8n' },
        'F4':  { synth: tomMid, note: 'C3', duration: '8n' },
        'F#4': { synth: tomHigh, note: 'E3', duration: '8n' },
        'G4':  { synth: crash, duration: '2n', isNoise: true },
        'G#4': { synth: ride, duration: '4n', isMetal: true },
        'A4':  { synth: clap, duration: '16n', isNoise: true },
        'A#4': { synth: rim, duration: '16n', isMetal: true },
        'B4':  { synth: cowbell, note: 'G5', duration: '8n', isMetal: true }
    };
}

// Play drum sound
function playDrum(note) {
    const drum = drumSynths[note];
    if (!drum) return;

    if (drum.isNoise) {
        drum.synth.triggerAttackRelease(drum.duration);
    } else if (drum.isMetal) {
        drum.synth.triggerAttackRelease(drum.note || 'C4', drum.duration);
    } else {
        drum.synth.triggerAttackRelease(drum.note || note, drum.duration);
    }
}

// Get current melodic instrument
function getCurrentInstrument() {
    switch (currentPreset) {
        case 'piano': return pianoSynth;
        case 'synth': return leadSynth;
        default: return pianoSynth;
    }
}

// Play a note
function playNote(note) {
    if (!audioStarted) return;

    if (currentPreset === 'drums') {
        playDrum(note);
    } else {
        const instrument = getCurrentInstrument();
        instrument.triggerAttack(note);
    }

    if (isRecording) {
        const time = Tone.Transport.seconds % LOOP_DURATION;
        activeNotes.set(note, { startTime: time });
    }
}

// Stop a note
function stopNote(note) {
    if (currentPreset !== 'drums') {
        const instrument = getCurrentInstrument();
        instrument.triggerRelease(note);
    }

    if (isRecording && activeNotes.has(note)) {
        const noteData = activeNotes.get(note);
        const endTime = Tone.Transport.seconds % LOOP_DURATION;
        let duration = endTime - noteData.startTime;

        if (duration < 0) duration += LOOP_DURATION;
        if (duration < 0.05) duration = 0.1;

        recordedNotes.push({
            note: note,
            time: noteData.startTime,
            duration: duration,
            preset: currentPreset
        });

        activeNotes.delete(note);
    }
}

// Visual feedback
function highlightKey(note, className = 'active') {
    const key = document.querySelector(`[data-note="${note}"]`);
    if (key) key.classList.add(className);
}

function unhighlightKey(note, className = 'active') {
    const key = document.querySelector(`[data-note="${note}"]`);
    if (key) key.classList.remove(className);
}

// Track currently pressed keys
const pressedKeys = new Set();

// Setup piano interaction
function setupPianoInteraction() {
    const keys = document.querySelectorAll('.key');

    keys.forEach(key => {
        const note = key.dataset.note;

        // Mouse events
        key.addEventListener('mousedown', async (e) => {
            e.preventDefault();
            pressedKeys.add(note);
            highlightKey(note);

            if (!audioStarted) {
                await startAudioContext();
            }

            // Only play if still pressed after audio started
            if (pressedKeys.has(note)) {
                playNote(note);
            }
        });

        key.addEventListener('mouseup', () => {
            pressedKeys.delete(note);
            stopNote(note);
            unhighlightKey(note);
        });

        key.addEventListener('mouseleave', () => {
            if (pressedKeys.has(note)) {
                pressedKeys.delete(note);
                stopNote(note);
                unhighlightKey(note);
            }
        });

        key.addEventListener('mouseenter', (e) => {
            if (e.buttons === 1 && audioStarted) {
                pressedKeys.add(note);
                playNote(note);
                highlightKey(note);
            }
        });

        // Touch events
        key.addEventListener('touchstart', async (e) => {
            e.preventDefault();
            pressedKeys.add(note);
            highlightKey(note);

            if (!audioStarted) {
                await startAudioContext();
            }

            if (pressedKeys.has(note)) {
                playNote(note);
            }
        }, { passive: false });

        key.addEventListener('touchend', (e) => {
            e.preventDefault();
            pressedKeys.delete(note);
            stopNote(note);
            unhighlightKey(note);
        }, { passive: false });

        key.addEventListener('touchcancel', () => {
            pressedKeys.delete(note);
            stopNote(note);
            unhighlightKey(note);
        });
    });

    // Global mouseup to catch releases outside keys
    document.addEventListener('mouseup', () => {
        pressedKeys.forEach(note => {
            stopNote(note);
            unhighlightKey(note);
        });
        pressedKeys.clear();
    });
}

// Start audio context
async function startAudioContext() {
    if (audioStarted) return;

    try {
        await Tone.start();
        audioStarted = true;
        console.log('Audio started');
    } catch (e) {
        console.error('Failed to start audio:', e);
    }
}

// Schedule loop playback
function scheduleLoop() {
    scheduledEvents.forEach(id => Tone.Transport.clear(id));
    scheduledEvents = [];

    recordedNotes.forEach(noteData => {
        const eventId = Tone.Transport.schedule((time) => {
            if (noteData.preset === 'drums') {
                // Play drum at scheduled time
                const drum = drumSynths[noteData.note];
                if (drum) {
                    if (drum.isNoise) {
                        drum.synth.triggerAttackRelease(drum.duration, time);
                    } else if (drum.isMetal) {
                        drum.synth.triggerAttackRelease(drum.note || 'C4', drum.duration, time);
                    } else {
                        drum.synth.triggerAttackRelease(drum.note || noteData.note, drum.duration, time);
                    }
                }
            } else {
                const instrument = noteData.preset === 'synth' ? leadSynth : pianoSynth;
                instrument.triggerAttackRelease(noteData.note, noteData.duration, time);
            }


        }, noteData.time);

        scheduledEvents.push(eventId);
    });
}

// Update UI during playback
function updatePlaybackUI() {
    if (isPlaying) {
        const currentTime = Tone.Transport.seconds % LOOP_DURATION;
        const progress = (currentTime / LOOP_DURATION) * 100;
        progressBar.style.width = progress + '%';

        // Update bar counter
        const currentBar = Math.floor(currentTime / BAR_DURATION);
        const bars = loopCounter.querySelectorAll('.bar');
        bars.forEach((bar, index) => {
            bar.classList.toggle('active', index === currentBar);
        });

        requestAnimationFrame(updatePlaybackUI);
    }
}

// Control handlers
async function toggleRecord() {
    isRecording = !isRecording;
    recordBtn.classList.toggle('active', isRecording);
    recordingIndicator.classList.toggle('visible', isRecording);

    if (isRecording && !isPlaying) {
        await startPlayback();
    }
}

async function togglePlay() {
    if (isPlaying) {
        stopPlayback();
    } else {
        await startPlayback();
    }
}

async function startPlayback() {
    await startAudioContext();
    isPlaying = true;
    playBtn.classList.add('active');

    // Toggle icons
    playBtn.querySelector('.play-icon').style.display = 'none';
    playBtn.querySelector('.stop-icon').style.display = 'block';

    Tone.Transport.loop = true;
    Tone.Transport.loopStart = 0;
    Tone.Transport.loopEnd = LOOP_DURATION;
    Tone.Transport.bpm.value = BPM;

    scheduleLoop();
    Tone.Transport.start();
    updatePlaybackUI();
}

function stopPlayback() {
    isPlaying = false;
    isRecording = false;
    playBtn.classList.remove('active');
    recordBtn.classList.remove('active');
    recordingIndicator.classList.remove('visible');

    // Toggle icons
    playBtn.querySelector('.play-icon').style.display = 'block';
    playBtn.querySelector('.stop-icon').style.display = 'none';

    Tone.Transport.stop();
    Tone.Transport.position = 0;
    progressBar.style.width = '0%';

    // Reset bar counter
    const bars = loopCounter.querySelectorAll('.bar');
    bars.forEach(bar => bar.classList.remove('active'));

    pianoSynth.releaseAll();
    leadSynth.releaseAll();
}

function clearLoop() {
    recordedNotes = [];
    scheduledEvents.forEach(id => Tone.Transport.clear(id));
    scheduledEvents = [];

    if (isPlaying) {
        scheduleLoop();
    }
}

// Preset change
function changePreset(preset) {
    currentPreset = preset;

    // Update buttons
    presetBtns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.preset === preset);
    });

    // Show/hide drum labels
    drumOverlay.classList.toggle('visible', preset === 'drums');
}

// Setup preset buttons
function setupPresetButtons() {
    presetBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            changePreset(btn.dataset.preset);
        });
    });
}

// Event listeners
recordBtn.addEventListener('click', toggleRecord);
playBtn.addEventListener('click', togglePlay);
clearBtn.addEventListener('click', clearLoop);

// Setup knob controls
function setupKnobs() {
    // Get elements
    const waveSelect = document.getElementById('wave-select');
    const filterKnob = document.getElementById('filter-knob');
    const reverbKnob = document.getElementById('reverb-knob');
    const chorusKnob = document.getElementById('chorus-knob');
    const delayKnob = document.getElementById('delay-knob');
    const distortionKnob = document.getElementById('distortion-knob');
    const attackKnob = document.getElementById('attack-knob');
    const releaseKnob = document.getElementById('release-knob');

    const filterValue = document.getElementById('filter-value');
    const reverbValue = document.getElementById('reverb-value');
    const chorusValue = document.getElementById('chorus-value');
    const delayValue = document.getElementById('delay-value');
    const distortionValue = document.getElementById('distortion-value');
    const attackValue = document.getElementById('attack-value');
    const releaseValue = document.getElementById('release-value');

    const controlScroll = document.querySelector('.control-scroll');
    const soundControls = document.getElementById('sound-controls');

    // Hide scroll hint after scrolling
    controlScroll.addEventListener('scroll', () => {
        if (controlScroll.scrollLeft > 20) {
            soundControls.classList.add('scrolled');
        }
    });

    // Wave type control
    waveSelect.addEventListener('change', (e) => {
        const waveType = e.target.value;
        pianoSynth.set({ oscillator: { type: waveType } });
        leadSynth.set({ oscillator: { type: waveType } });
    });

    // Filter control
    filterKnob.addEventListener('input', (e) => {
        const freq = parseInt(e.target.value);
        mainFilter.frequency.rampTo(freq, 0.1);
        filterValue.textContent = freq >= 1000 ? (freq / 1000).toFixed(1) + 'k' : freq + '';
    });

    // Reverb control
    reverbKnob.addEventListener('input', (e) => {
        const wet = parseInt(e.target.value) / 100;
        reverb.wet.rampTo(wet, 0.1);
        reverbValue.textContent = e.target.value + '%';
    });

    // Chorus control
    chorusKnob.addEventListener('input', (e) => {
        const wet = parseInt(e.target.value) / 100;
        chorus.wet.rampTo(wet, 0.1);
        chorusValue.textContent = e.target.value + '%';
    });

    // Delay control
    delayKnob.addEventListener('input', (e) => {
        const wet = parseInt(e.target.value) / 100;
        delay.wet.rampTo(wet, 0.1);
        delayValue.textContent = e.target.value + '%';
    });

    // Distortion control
    distortionKnob.addEventListener('input', (e) => {
        const amount = parseInt(e.target.value) / 100;
        distortion.distortion = amount;
        distortion.wet.value = amount > 0 ? 1 : 0;
        distortionValue.textContent = e.target.value + '%';
    });

    // Attack control
    attackKnob.addEventListener('input', (e) => {
        const attack = parseInt(e.target.value) / 1000;
        pianoSynth.set({ envelope: { attack } });
        leadSynth.set({ envelope: { attack } });
        attackValue.textContent = e.target.value + 'ms';
    });

    // Release control
    releaseKnob.addEventListener('input', (e) => {
        const release = parseInt(e.target.value) / 1000;
        pianoSynth.set({ envelope: { release } });
        leadSynth.set({ envelope: { release } });
        if (e.target.value >= 1000) {
            releaseValue.textContent = (parseInt(e.target.value) / 1000).toFixed(1) + 's';
        } else {
            releaseValue.textContent = e.target.value + 'ms';
        }
    });
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initInstruments();
    setupPianoInteraction();
    setupPresetButtons();
});
