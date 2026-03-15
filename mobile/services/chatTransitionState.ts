type TransitionPhase = 'idle' | 'entering' | 'returning';

type Listener = (phase: TransitionPhase) => void;

let currentPhase: TransitionPhase = 'idle';
const listeners = new Set<Listener>();

export const chatTransitionState = {
  getPhase(): TransitionPhase {
    return currentPhase;
  },

  setPhase(phase: TransitionPhase) {
    currentPhase = phase;
    listeners.forEach((listener) => listener(phase));
  },

  subscribe(listener: Listener) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};
