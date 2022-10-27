#! /usr/bin/node

const yargs = require("yargs")
const fs = require('fs')
const { exec } = require("child_process")
const ethTx = require("ethereumjs-tx").Transaction
const keccak256 = require("keccak256")
const rlp = require('rlp')

// Convert fork names from the t8ntool tool version to the openethereum
// version
const convertFork = t8nName => {
  if (t8nName === "YOLOv3") return "Berlin"
  return t8nName
}

const testFile = `/tmp/test${process.pid}.json`

// For debugging this script
const logFile = `/tmp/trace${process.pid}.trace`


var logMsgNum = 1

// Debug function
const logMe = str => {
  if (false)   // true to turn on logging, false to turn it off
    fs.appendFileSync(logFile, `###### LOG MESSAGE ${logMsgNum++} ######\n${str}\n`)
}



const options = yargs.argv

const alloc = JSON.parse(fs.readFileSync(options.input.alloc).toString())
const txs = JSON.parse(fs.readFileSync(options.input.txs).toString())
const env = JSON.parse(fs.readFileSync(options.input.env).toString())


if (txs.length == 0) {
  // This is the first call, which "mines" the genesis block. There are no
  // transactions

  // Extra fields which are ignored
  const outAlloc = alloc
  const out = {
    stateRoot:   "0xDEADBEEFdeadbeefDEADBEEFdeadbeefDEADBEEFdeadbeefDEADBEEFdeadbeef",
    txRoot:      "0xDEADBEEFdeadbeefDEADBEEFdeadbeefDEADBEEFdeadbeefDEADBEEFdeadbeef",
    receiptRoot: "0xDEADBEEFdeadbeefDEADBEEFdeadbeefDEADBEEFdeadbeefDEADBEEFdeadbeef",
    logsHash:    "0xDEADBEEFdeadbeefDEADBEEFdeadbeefDEADBEEFdeadbeefDEADBEEFdeadbeef",
    logsBloom:   "0x00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
    receipts: []
  }

  fs.appendFileSync(`${options.output.basedir}/${options.output.result}`,
        JSON.stringify(out, null, 2))
  fs.appendFileSync(`${options.output.basedir}/${options.output.alloc}`,
        JSON.stringify(outAlloc, null, 2))

  process.exit(0)
}



// Start the log here because we don't need to debug the
// first call when we are just "mining" the genesis block
logMe(`starting with ${testFile}\n`)
logMe(`options: ${JSON.stringify(options)}\n\n`)



// If we got here, this is the test block, the one with a transaction
const tx = txs[0]
const txHash = `0x${keccak256(new ethTx(tx).serialize()).toString('hex')}`

logMe(`Transaction: ${JSON.stringify(tx)}\n\n`)

tx.to = tx.to || "0x0000000000000000000000000000000000000000"

// Some values need to be added programatically
let test = {
   t8ntoolTest: {
      "_info": {},
      env: env,
      pre: alloc,
      transaction: {
         data: [tx.input],
         gasLimit: [tx.gas],
         gasPrice: tx.gasPrice,
         nonce: tx.nonce,
         secretKey: tx.secretKey,
         to: tx.to,
         value: [tx.value]
      },
      post: {}
   }
}

test.t8ntoolTest.post[convertFork(options.state.fork)] = [{
   "indexes": { "data":0, "gas":0, "value":0},
   "hash": "0x0000000000000000000000000000000000000000000000000000000000000000"
}]


// Write the test file we created
fs.writeFileSync(testFile, JSON.stringify(test, null, 2))


// Give the value at depth n
const stackDepth = (stack, depth) => stack[stack.length-depth]

// Get the n'th byte of a BigInt
const getByte = (val, n) => val >> BigInt(n*8) & 0xFFn


// Turn memory (an array of bytes, possibly with undefined values)
// into a hex string
const mem2str = mem => {
  var retVal = "0x"

  // Can't use mem.map because we have empty values
  for (var i=0; i<mem.length; i++)
    if (mem[i] === undefined)
       retVal += '00'
    else
       retVal += mem[i].toString(16).padStart(2, "0")

  return retVal
}  // mem2str

// Currently unused, might add tracing in the future
const processTrace = traceParam => {
    var trace = traceParam
    var mem = new Array()
    var logs = []

    logMe(`evm trace length:\n${trace.length}`)
    logMe(`evm trace:\n${JSON.stringify(trace, "", 2)}\n\n\n`)

    for(var step=0; step<trace.length; step++) {
        const current = trace[step]

        // Add the missing trace fields. Note that
        // the trace shows the situation BEFORE the current opcode
        if (step == trace.length-1)
             current.gasCost = "0x0"
        else
             current.gasCost = `0x${(current.gas-trace[step+1].gas).toString(16)}`

        // Don't worry about memory, just return values
        current.memory = ""
        current.memSize = 0
        current.returnStack = []
        current.refund = 0
        current.error = ""

        const stack = current.stack
        var topics = [null, null, null, null]

        /*
        // Special opcodes, either MSTORE[8] or LOG[0-4]
        switch (current.opName) {
            case "MSTORE":
               const val = BigInt(stackDepth(stack,2))
               for(byte=31; byte>=0; byte--)
                 mem[parseInt(stackDepth(stack,1))+31-byte] =
                      getByte(val, byte)

               // Memory is allocated in 0x20 byte chunks
               if (mem.length % 0x20 != 0)
                 mem[0x20*Math.floor(mem.length/0x20)+0x1F] = 0n
               break;
            case "MSTORE8":
               mem[parseInt(stackDepth(stack,1))] = stackDepth(stack,2) & 0xFF

               // Memory is allocated in 0x20 byte chunks
               if (mem.length % 0x20 != 0)
                 mem[0x20*Math.floor(mem.length/0x20)+0x1F] = 0n
               break;

            // Get the appropriate topics. The fall through behavior
            // of switch is ideal here
            case "LOG4":
               topics[3] = stackDepth(stack,6)
            case "LOG3":
               topics[2] = stackDepth(stack,5)
            case "LOG2":
               topics[1] = stackDepth(stack,4)
            case "LOG1":
               topics[0] = stackDepth(stack,3)
            case "LOG0":
               const offest = stackDepth(stack,1)
               const length = stackDepth(stack,2)
               const newEntry = [0x095e7baea6a6c7c4c2dfeb977efac326af552d87, [], ""]
               break;
        }  // switch current.opName
         */
    }   // for step

    // When creating a new contract there may not be a trace
    trace[trace.length] = {
       output: "",
       time: -1,    /// clearly invalid value because we don't do this
       gasUsed: trace.length === 0 ? "0x00" :`0x${(trace[0].gas-trace[trace.length-1].gas).toString(16)}`
    }

    logMe(`logs:${JSON.stringify(logs,null,2)}\n\n\n`)

    return {
       trace: trace,
       logsHash: `0x${keccak256(rlp.encode(logs)).toString('hex')}`
    }
}   // processTrace


// Process the test results
const processResult = (root, outAlloc) => {

  const out = {
    stateRoot:   root,

    // These fields are required, but their values are ignored
    receiptRoot: "0xDEADBEEFdeadbeefDEADBEEFdeadbeefDEADBEEFdeadbeefDEADBEEFdeadbeef",
    txRoot: "0xDEADBEEFdeadbeefDEADBEEFdeadbeefDEADBEEFdeadbeefDEADBEEFdeadbeef",
    logsHash:    "0xDEADBEEFdeadbeefDEADBEEFdeadbeefDEADBEEFdeadbeefDEADBEEFdeadbeef",    
    logsBloom:   "0x00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",

    receipts: [
      {
         // This has to be the real hash of the transaction bytes
         "transactionHash": txHash,

         // These fields have to be there, but their value doesn't matter
         "root": "0x",
         "status": "0x",
         "cumulativeGasUsed": "0x",
         "logsBloom": "0x",
         "logs": null,
         "contractAddress": "0x",
         "gasUsed": "0x01",
         "blockHash": "0x0000000000000000000000000000000000000000000000000000000000000000",
         "transactionIndex": "0x0"
      }
    ]
  }

  fs.writeFileSync(`${options.output.basedir}/${options.output.result}`,
        JSON.stringify(out, null, 2))
  fs.writeFileSync(`${options.output.basedir}/${options.output.alloc}`,
        JSON.stringify(outAlloc, null, 2))

  logMe(`out:\n${JSON.stringify(out, null, 2)}\n\n\n`)
  logMe(`outAlloc:\n${JSON.stringify(outAlloc, null, 2)}\n\n\n`)
}  // processResults


cmd = `openethereum-evm state-test ${testFile} --std-dump-json`
logMe(`running ${cmd}\n\n`)


stderrLastLine = ""

// Run the test file and interpret the results
exec(cmd, {maxBuffer:1024*1024*1024}, (err, stdout, stderr) => {
  if (err) {
    console.log(`error: ${err.message}`)
    logMe(`error: ${err}\n`)
  }

  // The last line in stderr is the summary. The earlier lines
  // are the trace, which we ignore.
  if (stderr) {
    logMe(`stderr Length: ${stderr.length}`)
    stderrLastLine = stderr.match(/{"acc.*/)
    logMe(`stderr, last line: ${stderrLastLine}\n`)
  }
  if (stdout) {
    logMe(`stdout: ${stdout}\n`)
  }
}).on('close', code => { // execSync("openethereum-env ...

  logMe(`openethereum-evm exited with ${code}\n`)

  // const lines = stderrContent.split("\n")
  // const res = JSON.parse(lines[lines.length-2])
  res = JSON.parse(stderrLastLine)

  // const evmTrace = processTrace(lines.slice(0,-2).map(x => JSON.parse(x)))
  logMe(`openethereum-evm gave us the state root: ${res.root}\n`)
  processResult(res.root, res.accounts)

  // logMe(JSON.stringify(evmTrace,null,2))

  // if (options.trace)
  //  fs.writeFileSync(`${options.output.basedir}/trace-0-${txHash}.jsonl`,
  //       evmTrace.trace.map(x => JSON.stringify(x)).reduce((a,b)=> a+"\n"+b))


  // At this point we're done
  fs.unlinkSync(testFile)
  logMe(`done\n`)
})    // .on("close", ...
