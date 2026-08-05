import { CancelledError, createCancelToken, isCancelledError } from '../cancellation';

describe('createCancelToken', () => {
  it('throws at a checkpoint once cancelled', () => {
    const token = createCancelToken();
    expect(() => token.throwIfCancelled()).not.toThrow();
    token.cancel();
    expect(token.cancelled).toBe(true);
    expect(() => token.throwIfCancelled()).toThrow(CancelledError);
  });

  it('runs every registered abort exactly once', () => {
    const token = createCancelToken();
    const first = jest.fn();
    const second = jest.fn();
    token.onCancel(first);
    token.onCancel(second);

    token.cancel();
    token.cancel(); // idempotent

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('does not abort a transfer that already finished', () => {
    // Without unregistering, a cancel arriving after a completed download would
    // call cancelAsync on a finished handle.
    const token = createCancelToken();
    const abort = jest.fn();
    const unregister = token.onCancel(abort);
    unregister();
    token.cancel();
    expect(abort).not.toHaveBeenCalled();
  });

  it('aborts immediately when registering after cancellation', () => {
    // A transfer that starts in the window between cancel() and its own registration
    // must not run unsupervised.
    const token = createCancelToken();
    token.cancel();
    const abort = jest.fn();
    token.onCancel(abort);
    expect(abort).toHaveBeenCalledTimes(1);
  });

  it('keeps aborting the rest when one abort throws', () => {
    const token = createCancelToken();
    const good = jest.fn();
    token.onCancel(() => {
      throw new Error('abort failed');
    });
    token.onCancel(good);
    expect(() => token.cancel()).not.toThrow();
    expect(good).toHaveBeenCalledTimes(1);
  });
});

describe('isCancelledError', () => {
  it('recognises the error by instance and by name', () => {
    expect(isCancelledError(new CancelledError())).toBe(true);
    // Errors crossing a module/realm boundary may fail instanceof.
    expect(isCancelledError({ name: 'CancelledError' })).toBe(true);
    expect(isCancelledError(new Error('network'))).toBe(false);
    expect(isCancelledError(undefined)).toBe(false);
  });
});
