#!/bin/sh
threads=1
if [ "${1:-0}" -gt 1 ]
then
    threads=$1
fi

mkdir ~/.retesteth/logs
i=0
while [ "$i" -lt $threads ]; do
    tmpdir=$(mktemp -d -t ci-XXXXXXXXXX)
    file=$(date +"%m-%d-%y-%s")
    besu retesteth --rpc-http-port $((47710+$i)) --data-path=$tmpdir --logging=DEBUG >> ~/.retesteth/logs/besu-$file &
    i=$(( i + 1 ))
done
