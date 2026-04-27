type TransitionPhase = 'idle' | 'presented' | 'dismissing';

type TransitionState = {
  phase: TransitionPhase;
  profileId?: string;
};

type Listener = (state: TransitionState) => void;

let currentState: TransitionState = { phase: 'idle' };
const listeners = new Set<Listener>();

const notify = () => {
  listeners.forEach((listener) => listener(currentState));
};

export const profileAvatarTransitionState = {
  getState(): TransitionState {
    return currentState;
  },

  show(profileId: string) {
    currentState = { phase: 'presented', profileId };
    notify();
  },

  dismiss(profileId?: string) {
    if (profileId && currentState.profileId && currentState.profileId !== profileId) {
      return;
    }

    currentState = {
      phase: 'dismissing',
      profileId: profileId || currentState.profileId,
    };
    notify();
  },

  clear(profileId?: string) {
    if (profileId && currentState.profileId && currentState.profileId !== profileId) {
      return;
    }

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
