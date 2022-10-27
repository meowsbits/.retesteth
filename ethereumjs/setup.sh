#!/bin/sh
dir=$(pwd)
cd $ETHEREUMJS_PATH/packages/vm
npx ts-node test/retesteth/transition-cluster.ts &> /dev/null &
cd $dir
