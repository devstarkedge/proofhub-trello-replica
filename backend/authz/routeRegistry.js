export function collectRoutes(router, prefix = '') {
  const result = [];
  for (const layer of router.stack || router._router?.stack || []) {
    if (layer.route) {
      const declarations = layer.route.stack.filter(s => s.handle.authzDeclaration).map(s => s.handle.authzDeclaration);
      for (const method of Object.keys(layer.route.methods)) result.push({ method: method.toUpperCase(), path: prefix + layer.route.path, declarations });
    } else if (layer.handle?.stack) result.push(...collectRoutes(layer.handle, prefix));
  }
  return result;
}
export function assertDeclaredRoutes(router) {
  const routes = collectRoutes(router);
  const invalid = routes.filter(r => r.declarations.length !== 1);
  if (invalid.length) throw new Error(`Routes require exactly one authorization declaration: ${invalid.map(r => `${r.method} ${r.path}`).join(', ')}`);
  return routes;
}
