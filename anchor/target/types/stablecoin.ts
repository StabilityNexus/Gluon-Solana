/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/stablecoin.json`.
 */
export type Stablecoin = {
  "address": "3Ad1BL6hdFP4ndQ3dKhFbLp56roCK76gs3mvVNJHPdYY",
  "metadata": {
    "name": "stablecoin",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Created with Anchor"
  },
  "instructions": [
    {
      "name": "fission",
      "discriminator": [
        106,
        52,
        111,
        46,
        205,
        20,
        239,
        82
      ],
      "accounts": [
        {
          "name": "reactor",
          "writable": true
        },
        {
          "name": "reactorAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  97,
                  99,
                  116,
                  111,
                  114,
                  45,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "reactor"
              }
            ]
          }
        },
        {
          "name": "userAuthority",
          "signer": true
        },
        {
          "name": "baseVault",
          "writable": true,
          "relations": [
            "reactor"
          ]
        },
        {
          "name": "neutronMint",
          "writable": true,
          "relations": [
            "reactor"
          ]
        },
        {
          "name": "protonMint",
          "writable": true,
          "relations": [
            "reactor"
          ]
        },
        {
          "name": "userBaseAccount",
          "writable": true
        },
        {
          "name": "userNeutronAccount",
          "writable": true
        },
        {
          "name": "userProtonAccount",
          "writable": true
        },
        {
          "name": "treasuryBaseAccount",
          "writable": true,
          "relations": [
            "reactor"
          ]
        },
        {
          "name": "priceFeed",
          "relations": [
            "reactor"
          ]
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "amountIn",
          "type": "u64"
        }
      ]
    },
    {
      "name": "fusion",
      "discriminator": [
        206,
        106,
        177,
        144,
        1,
        151,
        67,
        100
      ],
      "accounts": [
        {
          "name": "reactor",
          "writable": true
        },
        {
          "name": "reactorAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  97,
                  99,
                  116,
                  111,
                  114,
                  45,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "reactor"
              }
            ]
          }
        },
        {
          "name": "userAuthority",
          "signer": true
        },
        {
          "name": "baseVault",
          "writable": true,
          "relations": [
            "reactor"
          ]
        },
        {
          "name": "neutronMint",
          "writable": true,
          "relations": [
            "reactor"
          ]
        },
        {
          "name": "protonMint",
          "writable": true,
          "relations": [
            "reactor"
          ]
        },
        {
          "name": "userBaseAccount",
          "writable": true
        },
        {
          "name": "userNeutronAccount",
          "writable": true
        },
        {
          "name": "userProtonAccount",
          "writable": true
        },
        {
          "name": "treasuryBaseAccount",
          "writable": true,
          "relations": [
            "reactor"
          ]
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "amountIn",
          "type": "u64"
        }
      ]
    },
    {
      "name": "initialize",
      "discriminator": [
        175,
        175,
        109,
        31,
        13,
        152,
        155,
        237
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "reactor",
          "writable": true,
          "signer": true
        },
        {
          "name": "reactorAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  97,
                  99,
                  116,
                  111,
                  114,
                  45,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "reactor"
              }
            ]
          }
        },
        {
          "name": "baseMint"
        },
        {
          "name": "baseVault",
          "writable": true
        },
        {
          "name": "neutronMint"
        },
        {
          "name": "protonMint"
        },
        {
          "name": "priceFeed"
        },
        {
          "name": "treasuryAuthority"
        },
        {
          "name": "treasuryBaseAccount",
          "writable": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "params",
          "type": {
            "defined": {
              "name": "initializeParams"
            }
          }
        }
      ]
    },
    {
      "name": "setBetaParams",
      "discriminator": [
        76,
        237,
        59,
        40,
        140,
        213,
        9,
        216
      ],
      "accounts": [
        {
          "name": "reactor",
          "writable": true
        },
        {
          "name": "treasuryAuthority",
          "signer": true,
          "relations": [
            "reactor"
          ]
        }
      ],
      "args": [
        {
          "name": "params",
          "type": {
            "defined": {
              "name": "betaParams"
            }
          }
        }
      ]
    },
    {
      "name": "transmuteNeutronToProton",
      "discriminator": [
        5,
        188,
        185,
        108,
        68,
        20,
        20,
        95
      ],
      "accounts": [
        {
          "name": "reactor",
          "writable": true
        },
        {
          "name": "reactorAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  97,
                  99,
                  116,
                  111,
                  114,
                  45,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "reactor"
              }
            ]
          }
        },
        {
          "name": "userAuthority",
          "signer": true
        },
        {
          "name": "baseVault",
          "writable": true,
          "relations": [
            "reactor"
          ]
        },
        {
          "name": "protonMint",
          "writable": true,
          "relations": [
            "reactor"
          ]
        },
        {
          "name": "neutronMint",
          "writable": true,
          "relations": [
            "reactor"
          ]
        },
        {
          "name": "userNeutronAccount",
          "writable": true
        },
        {
          "name": "userProtonAccount",
          "writable": true
        },
        {
          "name": "priceFeed",
          "relations": [
            "reactor"
          ]
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "neutronIn",
          "type": "u64"
        }
      ]
    },
    {
      "name": "transmuteProtonToNeutron",
      "discriminator": [
        1,
        2,
        155,
        120,
        201,
        174,
        198,
        91
      ],
      "accounts": [
        {
          "name": "reactor",
          "writable": true
        },
        {
          "name": "reactorAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  97,
                  99,
                  116,
                  111,
                  114,
                  45,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "reactor"
              }
            ]
          }
        },
        {
          "name": "userAuthority",
          "signer": true
        },
        {
          "name": "baseVault",
          "writable": true,
          "relations": [
            "reactor"
          ]
        },
        {
          "name": "protonMint",
          "writable": true,
          "relations": [
            "reactor"
          ]
        },
        {
          "name": "neutronMint",
          "writable": true,
          "relations": [
            "reactor"
          ]
        },
        {
          "name": "userProtonAccount",
          "writable": true
        },
        {
          "name": "userNeutronAccount",
          "writable": true
        },
        {
          "name": "priceFeed",
          "relations": [
            "reactor"
          ]
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "protonIn",
          "type": "u64"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "reactor",
      "discriminator": [
        23,
        95,
        9,
        66,
        41,
        244,
        37,
        71
      ]
    }
  ],
  "events": [
    {
      "name": "betaParamsSetEvent",
      "discriminator": [
        16,
        110,
        158,
        211,
        182,
        187,
        99,
        84
      ]
    },
    {
      "name": "fissionEvent",
      "discriminator": [
        188,
        93,
        41,
        124,
        229,
        122,
        150,
        165
      ]
    },
    {
      "name": "fusionEvent",
      "discriminator": [
        236,
        16,
        143,
        70,
        222,
        173,
        223,
        63
      ]
    },
    {
      "name": "transmuteMinusEvent",
      "discriminator": [
        74,
        176,
        93,
        198,
        152,
        124,
        255,
        202
      ]
    },
    {
      "name": "transmutePlusEvent",
      "discriminator": [
        139,
        170,
        99,
        103,
        100,
        19,
        158,
        155
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "amountIsZero",
      "msg": "Amount must be greater than zero"
    },
    {
      "code": 6001,
      "name": "mathOverflow",
      "msg": "Math overflow"
    },
    {
      "code": 6002,
      "name": "divisionByZero",
      "msg": "Division by zero"
    },
    {
      "code": 6003,
      "name": "invalidFee",
      "msg": "Fee must be less than 100% (WAD)"
    },
    {
      "code": 6004,
      "name": "invalidTargetReserveRatio",
      "msg": "Target reserve ratio must be at least 100% (WAD)"
    },
    {
      "code": 6005,
      "name": "invalidDecimals",
      "msg": "Invalid decimals for token; maximum supported is 18"
    },
    {
      "code": 6006,
      "name": "invalidMintAuthority",
      "msg": "Invalid mint authority for program controlled mint"
    },
    {
      "code": 6007,
      "name": "invalidVaultAuthority",
      "msg": "Invalid vault authority"
    },
    {
      "code": 6008,
      "name": "mintMismatch",
      "msg": "Token mint mismatch"
    },
    {
      "code": 6009,
      "name": "invalidTreasuryAccount",
      "msg": "Treasury token account is invalid"
    },
    {
      "code": 6010,
      "name": "invalidTreasuryAuthority",
      "msg": "Invalid treasury authority"
    },
    {
      "code": 6011,
      "name": "invalidPriceAccount",
      "msg": "Invalid or mismatched price account"
    },
    {
      "code": 6012,
      "name": "priceNotAvailable",
      "msg": "No recent price available from oracle"
    },
    {
      "code": 6013,
      "name": "invalidPriceValue",
      "msg": "Oracle price is not positive"
    },
    {
      "code": 6014,
      "name": "amountTooSmall",
      "msg": "Amount too small after applying fees or conversions"
    },
    {
      "code": 6015,
      "name": "zeroReserve",
      "msg": "Reserve balance is zero"
    },
    {
      "code": 6016,
      "name": "zeroSupply",
      "msg": "Supply is zero"
    },
    {
      "code": 6017,
      "name": "accountDataBorrowFailed",
      "msg": "Failed to borrow account data"
    },
    {
      "code": 6018,
      "name": "invalidTokenAccount",
      "msg": "Invalid token account data"
    },
    {
      "code": 6019,
      "name": "invalidMintAccount",
      "msg": "Invalid mint account data"
    },
    {
      "code": 6020,
      "name": "valueTooLarge",
      "msg": "Value exceeds supported range"
    },
    {
      "code": 6021,
      "name": "exponentTooLarge",
      "msg": "Exponent exceeds supported range for pow10"
    },
    {
      "code": 6022,
      "name": "missingBump",
      "msg": "Missing PDA bump"
    },
    {
      "code": 6023,
      "name": "invalidBetaParam",
      "msg": "Invalid beta parameters"
    },
    {
      "code": 6024,
      "name": "invalidVaultName",
      "msg": "Invalid vault name"
    }
  ],
  "types": [
    {
      "name": "betaParams",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "phi0Wad",
            "type": "u128"
          },
          {
            "name": "phi1Wad",
            "type": "u128"
          },
          {
            "name": "decayPerSecondWad",
            "type": "u128"
          }
        ]
      }
    },
    {
      "name": "betaParamsSetEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "reactor",
            "type": "pubkey"
          },
          {
            "name": "phi0Wad",
            "type": "u128"
          },
          {
            "name": "phi1Wad",
            "type": "u128"
          },
          {
            "name": "decayPerSecondWad",
            "type": "u128"
          }
        ]
      }
    },
    {
      "name": "fissionEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "reactor",
            "type": "pubkey"
          },
          {
            "name": "fromAuthority",
            "type": "pubkey"
          },
          {
            "name": "baseIn",
            "type": "u64"
          },
          {
            "name": "neutronMinted",
            "type": "u64"
          },
          {
            "name": "protonMinted",
            "type": "u64"
          },
          {
            "name": "baseFeeToTreasury",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "fusionEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "reactor",
            "type": "pubkey"
          },
          {
            "name": "fromAuthority",
            "type": "pubkey"
          },
          {
            "name": "neutronBurned",
            "type": "u64"
          },
          {
            "name": "protonBurned",
            "type": "u64"
          },
          {
            "name": "baseOut",
            "type": "u64"
          },
          {
            "name": "baseFeeToTreasury",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "initializeParams",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "vaultName",
            "type": "string"
          },
          {
            "name": "fissionFeeWad",
            "type": "u128"
          },
          {
            "name": "fusionFeeWad",
            "type": "u128"
          },
          {
            "name": "targetReserveRatioWad",
            "type": "u128"
          },
          {
            "name": "priceFeed",
            "type": "pubkey"
          },
          {
            "name": "oracleProgram",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "reactor",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authorityBump",
            "type": "u8"
          },
          {
            "name": "vaultName",
            "type": "string"
          },
          {
            "name": "baseMint",
            "type": "pubkey"
          },
          {
            "name": "baseVault",
            "type": "pubkey"
          },
          {
            "name": "neutronMint",
            "type": "pubkey"
          },
          {
            "name": "protonMint",
            "type": "pubkey"
          },
          {
            "name": "priceFeed",
            "type": "pubkey"
          },
          {
            "name": "oracleProgram",
            "type": "pubkey"
          },
          {
            "name": "treasuryAuthority",
            "type": "pubkey"
          },
          {
            "name": "treasuryBaseAccount",
            "type": "pubkey"
          },
          {
            "name": "fissionFeeWad",
            "type": "u128"
          },
          {
            "name": "fusionFeeWad",
            "type": "u128"
          },
          {
            "name": "targetReserveRatioWad",
            "type": "u128"
          },
          {
            "name": "betaPhi0Wad",
            "type": "u128"
          },
          {
            "name": "betaPhi1Wad",
            "type": "u128"
          },
          {
            "name": "decayPerSecondWad",
            "type": "u128"
          },
          {
            "name": "decayedVolumeBaseWad",
            "type": "i128"
          },
          {
            "name": "lastDecayTs",
            "type": "i64"
          },
          {
            "name": "baseDecimals",
            "type": "u8"
          },
          {
            "name": "neutronDecimals",
            "type": "u8"
          },
          {
            "name": "protonDecimals",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "transmuteMinusEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "reactor",
            "type": "pubkey"
          },
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "neutronIn",
            "type": "u64"
          },
          {
            "name": "protonOut",
            "type": "u64"
          },
          {
            "name": "feeWad",
            "type": "u128"
          },
          {
            "name": "decayedVolumeBaseWad",
            "type": "i128"
          }
        ]
      }
    },
    {
      "name": "transmutePlusEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "reactor",
            "type": "pubkey"
          },
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "protonIn",
            "type": "u64"
          },
          {
            "name": "neutronOut",
            "type": "u64"
          },
          {
            "name": "feeWad",
            "type": "u128"
          },
          {
            "name": "decayedVolumeBaseWad",
            "type": "i128"
          }
        ]
      }
    }
  ]
};
