export type ISSPlayerLifecycle = {
  readonly isISSSelected: boolean;
  readonly detached: boolean;
  readonly dismissed: boolean;
  readonly unavailable: boolean;
};

export type ISSPlayerAction =
  | { readonly type: "selection"; readonly isISSSelected: boolean }
  | { readonly type: "detach" }
  | { readonly type: "dock" }
  | { readonly type: "show" }
  | { readonly type: "error" }
  | { readonly type: "retry" }
  | { readonly type: "close" };

export const initialISSPlayerLifecycle: ISSPlayerLifecycle = {
  isISSSelected: false,
  detached: false,
  dismissed: false,
  unavailable: false,
};

export function issPlayerLifecycleReducer(state: ISSPlayerLifecycle, action: ISSPlayerAction): ISSPlayerLifecycle {
  switch (action.type) {
    case "selection":
      return {
        ...state,
        isISSSelected: action.isISSSelected,
        dismissed: (action.isISSSelected && !state.isISSSelected) || (!action.isISSSelected && !state.detached) ? false : state.dismissed,
        unavailable: !action.isISSSelected && !state.detached ? false : state.unavailable,
      };
    case "detach":
      return state.isISSSelected && !state.dismissed ? { ...state, detached: true } : state;
    case "dock":
      return state.isISSSelected ? { ...state, detached: false } : state;
    case "show":
      return state.isISSSelected ? { ...state, detached: false, dismissed: false, unavailable: false } : state;
    case "error":
      return shouldMountISSPlayer(state) ? { ...state, unavailable: true } : state;
    case "retry":
      return { ...state, unavailable: false };
    case "close":
      return { ...state, detached: false, dismissed: true, unavailable: false };
  }
}

export function shouldMountISSPlayer(state: ISSPlayerLifecycle): boolean {
  return state.detached || (state.isISSSelected && !state.dismissed);
}
