# Versionado

Odometro base-10. Cada update suma 1. Sin categorias.

```
0.1.0 -> 0.1.1 -> ... -> 0.1.9 -> 0.2.0 -> ... -> 0.9.9 -> 1.0.0
```

- `0.x` = beta. `1.0.0` = sale de beta (se sigue igual despues).
- Comando unico (en `master` con todo mergeado): `npm run up`
  - Sube version, commitea (`0.1.4`), taggea (`v0.1.4`) y pushea.
  - `npm run up -- --no-push` para no pushear.
- Commit de laburo: 1 linea libre, corta, minuscula.
- Release: `## <version> — <titulo>` + 1 linea de que trae.
