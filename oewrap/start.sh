#!/bin/sh
SCRIPTPATH="$( cd -- "$(dirname "$0")" >/dev/null 2>&1 ; pwd -P )"
cd $SCRIPTPATH
if [ $1 = "-v" ]; then
    ./t8n_oe.js -v
else
    ./t8n_oe.js t8n ${1} ${2} ${3} ${4} ${5} ${6} ${7} ${8} ${9} ${10} ${11} ${12} ${13} ${14} ${15} ${16} ${17} ${18} ${19} ${20} --verbosity 2
fi
