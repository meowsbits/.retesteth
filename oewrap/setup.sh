#!/bin/sh
SCRIPTPATH="$( cd -- "$(dirname "$0")" >/dev/null 2>&1 ; pwd -P )"
cd $SCRIPTPATH
if [ ! -d "node_modules" ]; then
    npm install
fi
