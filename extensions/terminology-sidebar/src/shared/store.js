/**
 * Simple Observable Store
 * Implements a minimal state management pattern with subscriptions.
 * @template T
 */
export class Store {
  /**
   * @param {T} initialState
   */
  constructor(initialState) {
    this.state = initialState;
    this.listeners = new Set();
  }

  /**
   * Get current state
   * @returns {T}
   */
  getState() {
    return this.state;
  }

  /**
   * Update state and notify listeners
   * @param {Partial<T> | function(T): Partial<T>} updater
   */
  setState(updater) {
    const nextPartial = typeof updater === 'function' ? updater(this.state) : updater;
    if (nextPartial === null || nextPartial === undefined) return;
    
    // Shallow merge
    const nextState = { ...this.state, ...nextPartial };
    
    // Check for changes (shallow comparison could be added here if needed)
    this.state = nextState;
    this.notify();
  }

  /**
   * Subscribe to state changes
   * @param {function(T): void} listener
   * @returns {function(): void} unsubscribe function
   */
  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Notify all listeners
   * @private
   */
  notify() {
    this.listeners.forEach(listener => listener(this.state));
  }
}
