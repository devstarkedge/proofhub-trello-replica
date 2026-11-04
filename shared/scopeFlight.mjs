// One bootstrap per identity, with an explicit generation guard for late results.
export function createScopeFlight() {
  let revision = 0, current = null;
  return {
    invalidate() { revision++; current = null; },
    run(scope, load) {
      if (current?.scope === scope) return current.promise;
      const request = { scope, revision, promise: null };
      current = request;
      const isCurrent = () => current === request && revision === request.revision;
      request.promise = Promise.resolve().then(() => load(isCurrent)).finally(() => {
        if (current === request) current = null;
      });
      return request.promise;
    }
  };
}
