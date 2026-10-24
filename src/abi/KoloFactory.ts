// Generated from forge artifacts — do not edit
export const KOLO_FACTORY_ABI = [
 {
  "type": "constructor",
  "inputs": [
   {
    "name": "usdc_",
    "type": "address",
    "internalType": "address"
   },
   {
    "name": "registry_",
    "type": "address",
    "internalType": "address"
   },
   {
    "name": "treasury_",
    "type": "address",
    "internalType": "address"
   },
   {
    "name": "initialOwner",
    "type": "address",
    "internalType": "address"
   }
  ],
  "stateMutability": "nonpayable"
 },
 {
  "type": "function",
  "name": "FEE_CAP",
  "inputs": [],
  "outputs": [
   {
    "name": "",
    "type": "uint16",
    "internalType": "uint16"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "acceptOwnership",
  "inputs": [],
  "outputs": [],
  "stateMutability": "nonpayable"
 },
 {
  "type": "function",
  "name": "cctpReceiver",
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
  "name": "createGroupPot",
  "inputs": [
   {
    "name": "params",
    "type": "bytes",
    "internalType": "bytes"
   }
  ],
  "outputs": [
   {
    "name": "potId",
    "type": "uint256",
    "internalType": "uint256"
   },
   {
    "name": "pot",
    "type": "address",
    "internalType": "address"
   }
  ],
  "stateMutability": "nonpayable"
 },
 {
  "type": "function",
  "name": "createTuitionPot",
  "inputs": [
   {
    "name": "params",
    "type": "bytes",
    "internalType": "bytes"
   }
  ],
  "outputs": [
   {
    "name": "potId",
    "type": "uint256",
    "internalType": "uint256"
   },
   {
    "name": "pot",
    "type": "address",
    "internalType": "address"
   }
  ],
  "stateMutability": "nonpayable"
 },
 {
  "type": "function",
  "name": "feeBps",
  "inputs": [],
  "outputs": [
   {
    "name": "",
    "type": "uint16",
    "internalType": "uint16"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "globalStats",
  "inputs": [],
  "outputs": [
   {
    "name": "locked",
    "type": "uint256",
    "internalType": "uint256"
   },
   {
    "name": "released",
    "type": "uint256",
    "internalType": "uint256"
   },
   {
    "name": "refunded",
    "type": "uint256",
    "internalType": "uint256"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "groupPotImpl",
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
  "name": "isClone",
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
  "name": "owner",
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
  "name": "pendingOwner",
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
  "name": "potAddress",
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
  "name": "potCount",
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
  "name": "potType",
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
    "type": "uint8",
    "internalType": "enum KoloFactory.PotType"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "recordMove",
  "inputs": [
   {
    "name": "kind",
    "type": "uint8",
    "internalType": "enum KoloFactory.MoveKind"
   },
   {
    "name": "amount",
    "type": "uint256",
    "internalType": "uint256"
   }
  ],
  "outputs": [],
  "stateMutability": "nonpayable"
 },
 {
  "type": "function",
  "name": "registry",
  "inputs": [],
  "outputs": [
   {
    "name": "",
    "type": "address",
    "internalType": "contract PayeeRegistry"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "renounceOwnership",
  "inputs": [],
  "outputs": [],
  "stateMutability": "nonpayable"
 },
 {
  "type": "function",
  "name": "setCctpReceiver",
  "inputs": [
   {
    "name": "receiver",
    "type": "address",
    "internalType": "address"
   }
  ],
  "outputs": [],
  "stateMutability": "nonpayable"
 },
 {
  "type": "function",
  "name": "setFee",
  "inputs": [
   {
    "name": "bps",
    "type": "uint16",
    "internalType": "uint16"
   }
  ],
  "outputs": [],
  "stateMutability": "nonpayable"
 },
 {
  "type": "function",
  "name": "setGroupPotImpl",
  "inputs": [
   {
    "name": "impl",
    "type": "address",
    "internalType": "address"
   }
  ],
  "outputs": [],
  "stateMutability": "nonpayable"
 },
 {
  "type": "function",
  "name": "setTreasury",
  "inputs": [
   {
    "name": "treasury_",
    "type": "address",
    "internalType": "address"
   }
  ],
  "outputs": [],
  "stateMutability": "nonpayable"
 },
 {
  "type": "function",
  "name": "setTuitionPotImpl",
  "inputs": [
   {
    "name": "impl",
    "type": "address",
    "internalType": "address"
   }
  ],
  "outputs": [],
  "stateMutability": "nonpayable"
 },
 {
  "type": "function",
  "name": "totalLocked",
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
  "name": "totalRefunded",
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
  "name": "totalReleased",
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
  "name": "transferOwnership",
  "inputs": [
   {
    "name": "newOwner",
    "type": "address",
    "internalType": "address"
   }
  ],
  "outputs": [],
  "stateMutability": "nonpayable"
 },
 {
  "type": "function",
  "name": "treasury",
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
  "name": "tuitionPotImpl",
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
  "name": "CctpReceiverUpdated",
  "inputs": [
   {
    "name": "receiver",
    "type": "address",
    "indexed": true,
    "internalType": "address"
   }
  ],
  "anonymous": false
 },
 {
  "type": "event",
  "name": "FeeUpdated",
  "inputs": [
   {
    "name": "feeBps",
    "type": "uint16",
    "indexed": false,
    "internalType": "uint16"
   }
  ],
  "anonymous": false
 },
 {
  "type": "event",
  "name": "ImplUpdated",
  "inputs": [
   {
    "name": "potType",
    "type": "uint8",
    "indexed": false,
    "internalType": "enum KoloFactory.PotType"
   },
   {
    "name": "impl",
    "type": "address",
    "indexed": false,
    "internalType": "address"
   }
  ],
  "anonymous": false
 },
 {
  "type": "event",
  "name": "OwnershipTransferStarted",
  "inputs": [
   {
    "name": "previousOwner",
    "type": "address",
    "indexed": true,
    "internalType": "address"
   },
   {
    "name": "newOwner",
    "type": "address",
    "indexed": true,
    "internalType": "address"
   }
  ],
  "anonymous": false
 },
 {
  "type": "event",
  "name": "OwnershipTransferred",
  "inputs": [
   {
    "name": "previousOwner",
    "type": "address",
    "indexed": true,
    "internalType": "address"
   },
   {
    "name": "newOwner",
    "type": "address",
    "indexed": true,
    "internalType": "address"
   }
  ],
  "anonymous": false
 },
 {
  "type": "event",
  "name": "PotCreated",
  "inputs": [
   {
    "name": "potId",
    "type": "uint256",
    "indexed": true,
    "internalType": "uint256"
   },
   {
    "name": "potType",
    "type": "uint8",
    "indexed": true,
    "internalType": "enum KoloFactory.PotType"
   },
   {
    "name": "pot",
    "type": "address",
    "indexed": false,
    "internalType": "address"
   },
   {
    "name": "organizer",
    "type": "address",
    "indexed": true,
    "internalType": "address"
   }
  ],
  "anonymous": false
 },
 {
  "type": "event",
  "name": "TreasuryUpdated",
  "inputs": [
   {
    "name": "treasury",
    "type": "address",
    "indexed": true,
    "internalType": "address"
   }
  ],
  "anonymous": false
 },
 {
  "type": "error",
  "name": "FailedDeployment",
  "inputs": []
 },
 {
  "type": "error",
  "name": "FeeTooHigh",
  "inputs": []
 },
 {
  "type": "error",
  "name": "ImplNotSet",
  "inputs": []
 },
 {
  "type": "error",
  "name": "InsufficientBalance",
  "inputs": [
   {
    "name": "balance",
    "type": "uint256",
    "internalType": "uint256"
   },
   {
    "name": "needed",
    "type": "uint256",
    "internalType": "uint256"
   }
  ]
 },
 {
  "type": "error",
  "name": "NotAClone",
  "inputs": []
 },
 {
  "type": "error",
  "name": "OwnableInvalidOwner",
  "inputs": [
   {
    "name": "owner",
    "type": "address",
    "internalType": "address"
   }
  ]
 },
 {
  "type": "error",
  "name": "OwnableUnauthorizedAccount",
  "inputs": [
   {
    "name": "account",
    "type": "address",
    "internalType": "address"
   }
  ]
 },
 {
  "type": "error",
  "name": "ZeroAddress",
  "inputs": []
 }
] as const
