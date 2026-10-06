# ADR 0005 · `env.example` sin punto inicial

**Estado:** aceptada · Entrega 2

## Contexto

El hook de pre-commit (`.githooks/pre-commit`) rechaza cualquier ruta que coincida con `.env` o `.env.*`, también la de ejemplo, que no tiene secretos. La salida fácil era hacer el commit con `--no-verify` o añadir una excepción al hook.

## Decisión

El fichero de ejemplo se versiona como `env.example`. El hook no se debilita.

## Consecuencias

- Rompe la convención de `.env.example`; se documenta en `readme.md` §1 y §2.4.
- El control sigue sin excepciones: ningún fichero `.env*` puede llegar a un commit.
- El hook se versiona en `.githooks/` y se activa con `git config core.hooksPath .githooks`.
