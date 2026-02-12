#!/bin/sh

region="$(slurp)" || exit 0
[ -n "$region" ] || exit 0

grim -g "$region" - | swappy -f -
