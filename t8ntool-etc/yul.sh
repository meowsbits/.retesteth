#!/bin/sh
echo 0x`solc --assemble $1 2>/dev/null | grep "Binary representation:" -A 1 | tail -n1`
