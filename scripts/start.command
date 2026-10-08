#!/bin/sh
cd "$(dirname "$0")" || exit 1
sh ./start.sh
status=$?
if [ "$status" -ne 0 ]; then
  printf '\nPress Enter to close. '
  read -r reply
fi
exit "$status"
