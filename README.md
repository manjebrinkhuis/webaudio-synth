# Synth

This project was a test to try out the webaudio API. It works similar to Tonejs and not meant for production. Tonejs is much better for that.

## Usage

Describe a synth as object

```JavaScript
const exampleSynth = {
  sources: {
    osc1: {
      index: 1,
      node: 'osc',
      targets: [{ node: 'effects.compressor', target: 'node' }],
      settings: {
        coarse: 0,
        fine: -.6,
        gain: .1,
        type: 'sawtooth',
        filterFrequency: 5000
      }
    },
    osc2: {
      index: 2,
      node: 'osc',
      targets: [{ node: 'effects.compressor', target: 'node' }],
      settings: {
        coarse: -12,
        fine: -.6,
        gain: .1,
        type: 'sawtooth',
        filterFrequency: 5000
      }
    }
  },
  effects: {
    compressor: {
      node: 'compressor',
      targets: [{ node: 'master', target: 'gain' }],
      index: 1,
      settings: {
        'threshold': -30,
        'knee': 40,
        'ratio': 16,
        'attack': 0.2,
        'release': '0.2'
      }
    }
  },
  envelopes: {
    volEnv: {
      node: 'envelope',
      targets: [
        { node: 'sources.osc1', target: 'gain.gain', base: 'settings.gain' },
        { node: 'sources.osc2', target: 'gain.gain', base: 'settings.gain' },
      ],
      settings: {
        attack: .005,
        decay: .05,
        release: .05,
        start: 0,
        peak: 1,
        sustain: 1,
        end: 0,
      }
    },
    cutEnv: {
      node: 'envelope',
      targets: [
        { node: 'sources.osc1', target: 'filterNode.frequency', base: 'settings.filterFrequency' },
        { node: 'sources.osc2', target: 'filterNode.frequency', base: 'settings.filterFrequency' },
      ],
      settings: {
        attack: .005,
        decay: .5,
        release: .05,
        start: 1,
        peak: 3,
        sustain: 0,
        end: 0,
      }
    },
    pitchEnv: {
      node: 'envelope',
      targets: [
        { node: 'sources.osc1', target: 'osc.frequency', base: 'voice.freq' },
        { node: 'sources.osc2', target: 'osc.frequency', base: 'voice.freq' },
      ],
      settings: {
        attack: 0.005,
        decay: .05,
        release: .1,
        start: 5,
        peak: 1,
        sustain: 1,
        end: 1,
      }
    }
  }
}
```

And create a synth from object;

```JavaScript
let synth = createSynth(exampleSynth);
```

To turn a note on:

```JavaScript
synth.noteOn(64)
```

to turn it off:

```JavaScript
synth.noteOff(64)
```

to schedule a note one second from now, playing for one second:

```JavaScript
synth.noteOn(64, audioContext.currentTime + 1);
synth.noteOff(64, audioContext.currentTime + 2);
```
