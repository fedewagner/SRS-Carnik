#!/bin/sh
# PreToolUse: el agente no lee ni escribe ficheros .env, que contienen secretos reales.
# env.example (sin punto) y tests/test.env no tienen secretos y quedan permitidos.
path=$(jq -r '.tool_input.file_path // empty')
case "$(basename "$path")" in
  .env|.env.*)
    echo "Bloqueado: $path puede contener secretos. Usa env.example como referencia." >&2
    exit 2
    ;;
esac
exit 0
