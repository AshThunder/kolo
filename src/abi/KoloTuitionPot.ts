// Generated from forge artifacts — do not edit
export const KOLO_TUITION_POT_ABI = [
 {
  "type": "function",
  "name": "GRACE_PERIOD",
  "inputs": [],
  "outputs": [
   {
    "name": "",
    "type": "uint256",
    "internalType": "uint256"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "MAX_TERMS",
  "inputs": [],
  "outputs": [
   {
    "name": "",
    "type": "uint256",
    "internalType": "uint256"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "PAY_WINDOW",
  "inputs": [],
  "outputs": [
   {
    "name": "",
    "type": "uint256",
    "internalType": "uint256"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "allowOverfund",
  "inputs": [],
  "outputs": [
   {
    "name": "",
    "type": "bool",
    "internalType": "bool"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "approveClose",
  "inputs": [],
  "outputs": [],
  "stateMutability": "nonpayable"
 },
 {
  "type": "function",
  "name": "cancelSubscription",
  "inputs": [
   {
    "name": "subId",
    "type": "uint256",
    "internalType": "uint256"
   }
  ],
  "outputs": [],
  "stateMutability": "nonpayable"
 },
 {
  "type": "function",
  "name": "claimRefund",
  "inputs": [],
  "outputs": [],
  "stateMutability": "nonpayable"
 },
 {
  "type": "function",
  "name": "close",
  "inputs": [
   {
    "name": "",
    "type": "bytes",
    "internalType": "bytes"
   }
  ],
  "outputs": [],
  "stateMutability": "nonpayable"
 },
 {
  "type": "function",
  "name": "closeApprovalBitmap",
  "inputs": [],
  "outputs": [
   {
    "name": "",
    "type": "uint128",
    "internalType": "uint128"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "closeApprovalCount",
  "inputs": [],
  "outputs": [
   {
    "name": "",
    "type": "uint8",
    "internalType": "uint8"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "coSignerCount",
  "inputs": [],
  "outputs": [
   {
    "name": "",
    "type": "uint8",
    "internalType": "uint8"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "coSigners",
  "inputs": [
   {
    "name": "",
    "type": "uint256",
    "internalType": "uint256"
   }
  ],
  "outputs": [
   {
    "name": "",
    "type": "address",
    "internalType": "address"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "contribute",
  "inputs": [
   {
    "name": "amount",
    "type": "uint128",
    "internalType": "uint128"
   },
   {
    "name": "memoHash",
    "type": "bytes32",
    "internalType": "bytes32"
   }
  ],
  "outputs": [],
  "stateMutability": "nonpayable"
 },
 {
  "type": "function",
  "name": "contributeFor",
  "inputs": [
   {
    "name": "contributor",
    "type": "address",
    "internalType": "address"
   },
   {
    "name": "amount",
    "type": "uint128",
    "internalType": "uint128"
   },
   {
    "name": "memoHash",
    "type": "bytes32",
    "internalType": "bytes32"
   }
  ],
  "outputs": [],
  "stateMutability": "nonpayable"
 },
 {
  "type": "function",
  "name": "contributed",
  "inputs": [
   {
    "name": "",
    "type": "address",
    "internalType": "address"
   }
  ],
  "outputs": [
   {
    "name": "",
    "type": "uint128",
    "internalType": "uint128"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "deadline",
  "inputs": [],
  "outputs": [
   {
    "name": "",
    "type": "uint40",
    "internalType": "uint40"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "factory",
  "inputs": [],
  "outputs": [
   {
    "name": "",
    "type": "address",
    "internalType": "address"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "handleRevocation",
  "inputs": [],
  "outputs": [],
  "stateMutability": "nonpayable"
 },
 {
  "type": "function",
  "name": "initialize",
  "inputs": [
   {
    "name": "params",
    "type": "bytes",
    "internalType": "bytes"
   }
  ],
  "outputs": [],
  "stateMutability": "nonpayable"
 },
 {
  "type": "function",
  "name": "leftover",
  "inputs": [],
  "outputs": [
   {
    "name": "",
    "type": "uint128",
    "internalType": "uint128"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "minContribution",
  "inputs": [],
  "outputs": [
   {
    "name": "",
    "type": "uint96",
    "internalType": "uint96"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "organizer",
  "inputs": [],
  "outputs": [
   {
    "name": "",
    "type": "address",
    "internalType": "address"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "pause",
  "inputs": [],
  "outputs": [],
  "stateMutability": "nonpayable"
 },
 {
  "type": "function",
  "name": "paused",
  "inputs": [],
  "outputs": [
   {
    "name": "",
    "type": "bool",
    "internalType": "bool"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "payTerm",
  "inputs": [
   {
    "name": "i",
    "type": "uint8",
    "internalType": "uint8"
   }
  ],
  "outputs": [],
  "stateMutability": "nonpayable"
 },
 {
  "type": "function",
  "name": "payeeId",
  "inputs": [],
  "outputs": [
   {
    "name": "",
    "type": "uint256",
    "internalType": "uint256"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "pledge",
  "inputs": [
   {
    "name": "amount",
    "type": "uint128",
    "internalType": "uint128"
   },
   {
    "name": "dueBy",
    "type": "uint40",
    "internalType": "uint40"
   }
  ],
  "outputs": [],
  "stateMutability": "nonpayable"
 },
 {
  "type": "function",
  "name": "pledgeOf",
  "inputs": [
   {
    "name": "addr",
    "type": "address",
    "internalType": "address"
   }
  ],
  "outputs": [
   {
    "name": "amount",
    "type": "uint128",
    "internalType": "uint128"
   },
   {
    "name": "dueBy",
    "type": "uint40",
    "internalType": "uint40"
   },
   {
    "name": "fulfilled",
    "type": "uint128",
    "internalType": "uint128"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "pledges",
  "inputs": [
   {
    "name": "",
    "type": "address",
    "internalType": "address"
   }
  ],
  "outputs": [
   {
    "name": "amount",
    "type": "uint128",
    "internalType": "uint128"
   },
   {
    "name": "dueBy",
    "type": "uint40",
    "internalType": "uint40"
   },
   {
    "name": "fulfilled",
    "type": "uint128",
    "internalType": "uint128"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "potBalance",
  "inputs": [],
  "outputs": [
   {
    "name": "",
    "type": "uint256",
    "internalType": "uint256"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "potId",
  "inputs": [],
  "outputs": [
   {
    "name": "",
    "type": "uint256",
    "internalType": "uint256"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "pull",
  "inputs": [
   {
    "name": "subId",
    "type": "uint256",
    "internalType": "uint256"
   }
  ],
  "outputs": [],
  "stateMutability": "nonpayable"
 },
 {
  "type": "function",
  "name": "refundClaimed",
  "inputs": [
   {
    "name": "",
    "type": "address",
    "internalType": "address"
   }
  ],
  "outputs": [
   {
    "name": "",
    "type": "bool",
    "internalType": "bool"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "setCanonicals",
  "inputs": [
   {
    "name": "_usdc",
    "type": "address",
    "internalType": "address"
   },
   {
    "name": "_factory",
    "type": "address",
    "internalType": "address"
   },
   {
    "name": "_potId",
    "type": "uint256",
    "internalType": "uint256"
   }
  ],
  "outputs": [],
  "stateMutability": "nonpayable"
 },
 {
  "type": "function",
  "name": "state",
  "inputs": [],
  "outputs": [
   {
    "name": "",
    "type": "uint8",
    "internalType": "enum KoloTuitionPot.PotState"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "subCount",
  "inputs": [],
  "outputs": [
   {
    "name": "",
    "type": "uint256",
    "internalType": "uint256"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "subscribe",
  "inputs": [
   {
    "name": "amountPerPull",
    "type": "uint96",
    "internalType": "uint96"
   },
   {
    "name": "interval",
    "type": "uint32",
    "internalType": "uint32"
   },
   {
    "name": "maxPulls",
    "type": "uint32",
    "internalType": "uint32"
   }
  ],
  "outputs": [
   {
    "name": "subId",
    "type": "uint256",
    "internalType": "uint256"
   }
  ],
  "stateMutability": "nonpayable"
 },
 {
  "type": "function",
  "name": "subscriptions",
  "inputs": [
   {
    "name": "",
    "type": "uint256",
    "internalType": "uint256"
   }
  ],
  "outputs": [
   {
    "name": "subscriber",
    "type": "address",
    "internalType": "address"
   },
   {
    "name": "amountPerPull",
    "type": "uint96",
    "internalType": "uint96"
   },
   {
    "name": "interval",
    "type": "uint32",
    "internalType": "uint32"
   },
   {
    "name": "maxPulls",
    "type": "uint32",
    "internalType": "uint32"
   },
   {
    "name": "pullCount",
    "type": "uint32",
    "internalType": "uint32"
   },
   {
    "name": "nextDue",
    "type": "uint40",
    "internalType": "uint40"
   },
   {
    "name": "active",
    "type": "bool",
    "internalType": "bool"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "termCount",
  "inputs": [],
  "outputs": [
   {
    "name": "",
    "type": "uint8",
    "internalType": "uint8"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "terms",
  "inputs": [
   {
    "name": "",
    "type": "uint256",
    "internalType": "uint256"
   }
  ],
  "outputs": [
   {
    "name": "dueDate",
    "type": "uint40",
    "internalType": "uint40"
   },
   {
    "name": "amount",
    "type": "uint128",
    "internalType": "uint128"
   },
   {
    "name": "status",
    "type": "uint8",
    "internalType": "enum KoloTuitionPot.TermStatus"
   },
   {
    "name": "invoiceHash",
    "type": "bytes32",
    "internalType": "bytes32"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "threshold",
  "inputs": [],
  "outputs": [
   {
    "name": "",
    "type": "uint8",
    "internalType": "uint8"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "titleHash",
  "inputs": [],
  "outputs": [
   {
    "name": "",
    "type": "bytes32",
    "internalType": "bytes32"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "totalContributed",
  "inputs": [],
  "outputs": [
   {
    "name": "",
    "type": "uint128",
    "internalType": "uint128"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "totalRefunded",
  "inputs": [],
  "outputs": [
   {
    "name": "",
    "type": "uint128",
    "internalType": "uint128"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "totalReleased",
  "inputs": [],
  "outputs": [
   {
    "name": "",
    "type": "uint128",
    "internalType": "uint128"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "totalUnrefundedContrib",
  "inputs": [],
  "outputs": [
   {
    "name": "",
    "type": "uint128",
    "internalType": "uint128"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "unpause",
  "inputs": [],
  "outputs": [],
  "stateMutability": "nonpayable"
 },
 {
  "type": "function",
  "name": "usdc",
  "inputs": [],
  "outputs": [
   {
    "name": "",
    "type": "address",
    "internalType": "address"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "event",
  "name": "Closed",
  "inputs": [
   {
    "name": "potId",
    "type": "uint256",
    "indexed": true,
    "internalType": "uint256"
   }
  ],
  "anonymous": false
 },
 {
  "type": "event",
  "name": "Contributed",
  "inputs": [
   {
    "name": "potId",
    "type": "uint256",
    "indexed": true,
    "internalType": "uint256"
   },
   {
    "name": "contributor",
    "type": "address",
    "indexed": true,
    "internalType": "address"
   },
   {
    "name": "amount",
    "type": "uint256",
    "indexed": false,
    "internalType": "uint256"
   },
   {
    "name": "memoHash",
    "type": "bytes32",
    "indexed": false,
    "internalType": "bytes32"
   }
  ],
  "anonymous": false
 },
 {
  "type": "event",
  "name": "Paused",
  "inputs": [
   {
    "name": "account",
    "type": "address",
    "indexed": false,
    "internalType": "address"
   }
  ],
  "anonymous": false
 },
 {
  "type": "event",
  "name": "Pledged",
  "inputs": [
   {
    "name": "potId",
    "type": "uint256",
    "indexed": true,
    "internalType": "uint256"
   },
   {
    "name": "pledger",
    "type": "address",
    "indexed": true,
    "internalType": "address"
   },
   {
    "name": "amount",
    "type": "uint256",
    "indexed": false,
    "internalType": "uint256"
   },
   {
    "name": "dueBy",
    "type": "uint256",
    "indexed": false,
    "internalType": "uint256"
   }
  ],
  "anonymous": false
 },
 {
  "type": "event",
  "name": "PullSkipped",
  "inputs": [
   {
    "name": "subId",
    "type": "uint256",
    "indexed": true,
    "internalType": "uint256"
   },
   {
    "name": "reason",
    "type": "string",
    "indexed": false,
    "internalType": "string"
   }
  ],
  "anonymous": false
 },
 {
  "type": "event",
  "name": "Pulled",
  "inputs": [
   {
    "name": "potId",
    "type": "uint256",
    "indexed": true,
    "internalType": "uint256"
   },
   {
    "name": "subId",
    "type": "uint256",
    "indexed": true,
    "internalType": "uint256"
   },
   {
    "name": "subscriber",
    "type": "address",
    "indexed": true,
    "internalType": "address"
   },
   {
    "name": "amount",
    "type": "uint256",
    "indexed": false,
    "internalType": "uint256"
   }
  ],
  "anonymous": false
 },
 {
  "type": "event",
  "name": "Refunded",
  "inputs": [
   {
    "name": "potId",
    "type": "uint256",
    "indexed": true,
    "internalType": "uint256"
   },
   {
    "name": "contributor",
    "type": "address",
    "indexed": true,
    "internalType": "address"
   },
   {
    "name": "amount",
    "type": "uint256",
    "indexed": false,
    "internalType": "uint256"
   }
  ],
  "anonymous": false
 },
 {
  "type": "event",
  "name": "Refunding",
  "inputs": [
   {
    "name": "potId",
    "type": "uint256",
    "indexed": true,
    "internalType": "uint256"
   },
   {
    "name": "reason",
    "type": "string",
    "indexed": false,
    "internalType": "string"
   }
  ],
  "anonymous": false
 },
 {
  "type": "event",
  "name": "Subscribed",
  "inputs": [
   {
    "name": "potId",
    "type": "uint256",
    "indexed": true,
    "internalType": "uint256"
   },
   {
    "name": "subId",
    "type": "uint256",
    "indexed": true,
    "internalType": "uint256"
   },
   {
    "name": "subscriber",
    "type": "address",
    "indexed": false,
    "internalType": "address"
   },
   {
    "name": "amountPerPull",
    "type": "uint96",
    "indexed": false,
    "internalType": "uint96"
   },
   {
    "name": "interval",
    "type": "uint32",
    "indexed": false,
    "internalType": "uint32"
   }
  ],
  "anonymous": false
 },
 {
  "type": "event",
  "name": "SubscriptionCancelled",
  "inputs": [
   {
    "name": "potId",
    "type": "uint256",
    "indexed": true,
    "internalType": "uint256"
   },
   {
    "name": "subId",
    "type": "uint256",
    "indexed": true,
    "internalType": "uint256"
   }
  ],
  "anonymous": false
 },
 {
  "type": "event",
  "name": "TermPaid",
  "inputs": [
   {
    "name": "potId",
    "type": "uint256",
    "indexed": true,
    "internalType": "uint256"
   },
   {
    "name": "termIndex",
    "type": "uint8",
    "indexed": true,
    "internalType": "uint8"
   },
   {
    "name": "school",
    "type": "address",
    "indexed": true,
    "internalType": "address"
   },
   {
    "name": "amount",
    "type": "uint256",
    "indexed": false,
    "internalType": "uint256"
   }
  ],
  "anonymous": false
 },
 {
  "type": "event",
  "name": "Unpaused",
  "inputs": [
   {
    "name": "account",
    "type": "address",
    "indexed": false,
    "internalType": "address"
   }
  ],
  "anonymous": false
 },
 {
  "type": "error",
  "name": "AlreadyInitialized",
  "inputs": []
 },
 {
  "type": "error",
  "name": "AmountZero",
  "inputs": []
 },
 {
  "type": "error",
  "name": "ArrayLengthMismatch",
  "inputs": []
 },
 {
  "type": "error",
  "name": "BelowMinContribution",
  "inputs": []
 },
 {
  "type": "error",
  "name": "DeadlinePassed",
  "inputs": []
 },
 {
  "type": "error",
  "name": "EnforcedPause",
  "inputs": []
 },
 {
  "type": "error",
  "name": "ExpectedPause",
  "inputs": []
 },
 {
  "type": "error",
  "name": "InsufficientBalance",
  "inputs": []
 },
 {
  "type": "error",
  "name": "InvalidTerms",
  "inputs": []
 },
 {
  "type": "error",
  "name": "NotCoSigner",
  "inputs": []
 },
 {
  "type": "error",
  "name": "NotEnoughCloseApprovals",
  "inputs": []
 },
 {
  "type": "error",
  "name": "NotEnoughCoSigns",
  "inputs": []
 },
 {
  "type": "error",
  "name": "NotOrganizer",
  "inputs": []
 },
 {
  "type": "error",
  "name": "NotVerifiedSchool",
  "inputs": []
 },
 {
  "type": "error",
  "name": "NothingToRefund",
  "inputs": []
 },
 {
  "type": "error",
  "name": "OverfundNotAllowed",
  "inputs": []
 },
 {
  "type": "error",
  "name": "PledgeDuePassed",
  "inputs": []
 },
 {
  "type": "error",
  "name": "PotNotActive",
  "inputs": []
 },
 {
  "type": "error",
  "name": "PotNotRefunding",
  "inputs": []
 },
 {
  "type": "error",
  "name": "PullTooEarly",
  "inputs": []
 },
 {
  "type": "error",
  "name": "ReentrancyGuardReentrantCall",
  "inputs": []
 },
 {
  "type": "error",
  "name": "RefundAlreadyClaimed",
  "inputs": []
 },
 {
  "type": "error",
  "name": "SafeERC20FailedOperation",
  "inputs": [
   {
    "name": "token",
    "type": "address",
    "internalType": "address"
   }
  ]
 },
 {
  "type": "error",
  "name": "SchoolRevoked",
  "inputs": []
 },
 {
  "type": "error",
  "name": "SubNotActive",
  "inputs": []
 },
 {
  "type": "error",
  "name": "TermAlreadyPaid",
  "inputs": []
 },
 {
  "type": "error",
  "name": "TermNotDue",
  "inputs": []
 },
 {
  "type": "error",
  "name": "TooManyCoSigners",
  "inputs": []
 },
 {
  "type": "error",
  "name": "TooManyTerms",
  "inputs": []
 },
 {
  "type": "error",
  "name": "ZeroAddress",
  "inputs": []
 }
] as const
