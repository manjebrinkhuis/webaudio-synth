var audioContext = new window.AudioContext();

// Concert A4
const A4MIDI = 69
const A4FQ = 440;
const NOTERATIO = 2**(1/12)


function midiToFrequency(midi) {
  // Calculate frequency from midi index.
  return(A4FQ * (NOTERATIO**(midi - A4MIDI)))
}

function getNodeFromPath( obj, path) {
  /*
  Parse dot-separated string as nested objects
  For exampe, "parent.child1.child2" becomes parent[child1][child2]
  */
  return path.split('.').reduce((o, key) => {
    return o && o[key] ? o[key] : null
  }, obj)
}


function approachZero( value ) {
  /* return number close to zero instead of zero */
  return value ? value : 0.00001
}


function createRamp(audioParam, value, when, method="lin") {
  /* Wrapper to create a webaudio ramp */
  if (method === "lin") {
    audioParam.linearRampToValueAtTime( value, when );
  } else {
    audioParam.exponentialRampToValueAtTime( approachZero(value), when );
  }
}


function createOsc( settings, maxVoices=32 ) {
  /* Create a polyphonic synth */

  const voices = [];
  const envelopes = [];
  const outputs = [];

  // Object method to connect envelope
  function connectEnvelope( env ) {
    envelopes.push( env );
  }

  // Object method to connect output
  function connect( dest ) {
    outputs.push( dest );
  }

  // Object method to get voice
  function getVoice( note, when, name ) {
    /*
      Get voice. If note already has a voice, use that voice,
      otherwise create new voice.
    */

    let voice;

    // Get active voice of note if exists
    voice = voices.find( v => ( v.note === note ));

    // If voice is undefined, find an active voice
    // that is available (is not currently playing).
    if ( !voice ) {
      voice = voices.find( v => ( v.timeAvailable && ( when > v.timeAvailable )));
    }

    if ( voice ) {
      // Keep track of previous onset and offset
      // to determine initial state during onset.
      const prevOnset = voice.onset
          , prevOffset = voice.offset;
      voice.prevOnset = prevOnset;
      voice.prevOffset = prevOffset;

      // Reset note
      voice.note = note;
      voice.name = name;
      voice.freq = undefined;
      voice.onset = when;
      voice.offset = undefined;
      voice.timeAvailable = undefined;

    } else if ( voices.length < maxVoices ) {
      // If still no voice, create new voice.
      const osc = audioContext.createOscillator()
          , gain = audioContext.createGain()
          , filterNode = audioContext.createBiquadFilter();

      osc.connect(filterNode);
      filterNode.connect(gain);
      outputs.forEach( out => {
        gain.connect( out );
      })

      gain.gain.setValueAtTime(0, 0);
      osc.start();

      voice = {
        name,
        osc,
        gain,
        note,
        filterNode,
        freq: undefined,
        onset: when,
        offset: undefined,
        prevOnset: undefined,
        prevOffset: undefined,
        timeAvailable: undefined,
      };

      voices.push( voice );
    }

    return voice
  }

  function start( note, when, name="" ) {
    // start note

    const startFilter = settings.filterFrequency
        , startPitch = midiToFrequency(note + settings.coarse) + settings.fine;

    const voice = getVoice( note, when, name );

    voice.freq = startPitch;
    voice.osc.type = settings.type
    voice.filterNode.frequency.setValueAtTime( startFilter, when );
    voice.osc.frequency.setValueAtTime( startPitch, when );

    // Apply connected envelopes
    envelopes.forEach( env => {
      env.applyOnset( voice, settings );
    })
  }

  function stop( note, when ) {
    // Apply offset, finish release and silence voice.
    // Get active voice of note if exists
    const voice = voices.find( v => ( v.note === note ))
        , releases = [];

    voice.offset = when;


    envelopes.forEach( env => {
      let offset = env.applyOffset( voice, settings );
      releases.push( offset );
    })

    voice.timeAvailable = Math.max( ...releases );
    voice.gain.gain.setValueAtTime( 0, voice.timeAvailable );
  }

  return { start, stop, connect, connectEnvelope, voices }

}


function createAudioNode( node ) {

  const audioNode = audioContext[node]();

  // Add method to connect
  function connect( dest ) {
    audioNode.connect( dest )
  }

  // Return function to create node with settings
  return (function( settings ) {
    return {
      node: audioNode,
      settings,
      connect
    }
  })

}


function createEnvelope( settings, target ) {
  /*
  Create an envelope on target AudioParam.
  */

  function applyOnset( voice, targetSettings ) {

    const value = getNodeFromPath({ settings: targetSettings, voice }, target.base)

    let propElapsed
      , startValue;

    if ( !voice.prevOffset || (voice.onset < voice.prevOffset )) {

      if (voice.onset < ( voice.prevOnset + settings.attack )) {
        propElapsed = (voice.onset - voice.prevOnset) / settings.attack;
        startValue = settings.start + propElapsed * (settings.peak - settings.start);
      } else if ( voice.onset < ( voice.prevOnset + settings.attack + settings.decay )) {
        propElapsed = (voice.onset - voice.prevOnset + settings.attack) / settings.decay;
        startValue = settings.peak + propElapsed * (settings.sustain - settings.peak);
      } else {
        startValue = settings.sustain;
      }
    } else if ( voice.onset < ( voice.prevOffset + settings.release )) {
      propElapsed = (voice.onset - voice.prevOffset) / settings.release;
      startValue = settings.sustain + propElapsed * (settings.end - settings.sustain);
    } else {
      startValue = settings.start;
    }

    const start = startValue * value
        , peak = settings.peak * value
        , sustain = settings.sustain * value
        , node = getNodeFromPath( voice, target.target );

    node.cancelScheduledValues( voice.onset );
    // node.setValueAtTime( start, voice.onset );

    createRamp( node, start, voice.onset );
    createRamp( node, peak, voice.onset + settings.attack );
    createRamp( node, sustain, voice.onset + settings.attack + settings.decay );

  }

  function applyOffset( voice, targetSettings ) {

    const value = getNodeFromPath({ settings: targetSettings, voice }, target.base)
        , timeElapsed = voice.offset - voice.onset;

    // linear estimate of value at offset, when attack and decay hasn't finished.
    let propElapsed, envValue;

    if ( timeElapsed < settings.attack ) {
      propElapsed = timeElapsed / settings.attack
      envValue = settings.start + propElapsed * (settings.peak - settings.start);
    } else if ((timeElapsed > settings.attack) && (timeElapsed < settings.decay)) {
      propElapsed = (timeElapsed - settings.attack) / settings.decay
      envValue = settings.peak + propElapsed * (settings.sustain - settings.peak);
    } else {
      envValue = settings.sustain;
    }

    const end = settings.end * value
        , startValue = envValue * value
        , node = getNodeFromPath( voice, target.target )
        , offset = voice.offset + settings.release;

    node.cancelScheduledValues( voice.offset );
    createRamp( node, startValue, voice.offset );
    createRamp( node, end, offset );

    return offset
  }

  return { applyOnset, applyOffset }
}


function createSynth( settings ) {

  const nodes = {
    master: { gain: audioContext.createGain() },
    sources: {},
    effects: {},
    envelopes: {}
  }

  function addNodes( type ) {
    // add nodes and connect to output
    Object.keys( settings[type] ).sort((n1, n2 ) => {
      return settings[ type ][n1].index - settings[ type ][n2].index
    }).forEach( n => {
      let node = nodeMapper[ type ][ settings[type][n].node ]( settings[type][n].settings );
      settings[type][n].targets.forEach( tgt =>{
        const first = getNodeFromPath( nodes, tgt.node )
            , second = getNodeFromPath( first, tgt.target );
        node.connect( second );
      })
      nodes[ type ][ n ] = node;
    })
  }

  function addEnvelopes( envelopes ) {
    // add envelopes and connect
    Object.keys( envelopes ).forEach( envKey => {
      let env = envelopes[ envKey ];

      env.targets.forEach( tgt => {
        let first = getNodeFromPath( nodes, tgt.node )
          , envelope = createEnvelope( env.settings, tgt );
        first.connectEnvelope( envelope );
      })
    })
  }

  addNodes( "effects" );
  addNodes( "sources" );
  addEnvelopes( settings.envelopes );

  function noteOn(note, when) {
    Object.keys( nodes.sources ).forEach(src => {
      nodes.sources[ src ].start(note, when, src)
    })
  }

  function noteOff(note, when) {
    Object.keys( nodes.sources ).forEach(src => {
      nodes.sources[ src ].stop(note, when)
    })
  }

  function connect( dest ) {
    nodes.master.gain.connect( dest );
  }

  return { noteOn, noteOff, connect, nodes }
}

// Text to node
const nodeMapper = {
  sources: {
    osc: createOsc,
  },
  effects: {
    compressor: createAudioNode('createDynamicsCompressor'),
  },
  envelopes: {
    envelope: createEnvelope,
  }
}



/* Testing
 *
 */


const defaultSynth = {
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
    },
    osc3: {
      index: 3,
      node: 'osc',
      targets: [{ node: 'effects.compressor', target: 'node' }],
      settings: {
        coarse: 0,
        fine: 0,
        gain: .1,
        type: 'square',
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
        { node: 'sources.osc3', target: 'gain.gain', base: 'settings.gain' },
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
        { node: 'sources.osc3', target: 'filterNode.frequency', base: 'settings.filterFrequency' },
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
