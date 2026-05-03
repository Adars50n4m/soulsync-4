// Coordinates the my-status (status viewer) hero morph between the home
// screen's small "My Status" card and the full my-status sheet — same
// pattern as profileAvatarTransitionState, scoped to this single transition.
//
// Phase semantics:
//   - 'presented'  : sheet is open, source pill must hide so the morph is
//                    visually unique on screen.
//   - 'dismissing' : sheet is animating back to the source. Source pill
//                    can fade in to meet the morph at the end.
//   - 'idle'       : default; source pill is fully visible.

type TransitionPhase = 'idle' | 'presented' | 'dismissing';

type TransitionState = {
  phase: TransitionPhase;
};

type Listener = (state: TransitionState) => void;

let currentState: TransitionState = { phase: 'idle' };
const listeners = new Set<Listener>();

const notify = () => {
  listeners.forEach((listener) => listener(currentState));
};

export const myStatusTransitionState = {
  getState(): TransitionState {
    return currentState;
  },

  show() {
    currentState = { phase: 'presented' };
    notify();
  },

  dismiss() {
    currentState = { phase: 'dismissing' };
    notify();
  },

  clear() {
    currentState = { phase: 'idle' };
    notify();
  },

  subscribe(listener: Listener) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};
