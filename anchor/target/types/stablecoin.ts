/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/stablecoin.json`.
 */
export type Stablecoin = {
  "address": "2JKDPiVwn2yf2zGw8rqX5hVLv3NUdmfLjcQBsFNbDwn1",
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
          "name": "priceUpdate"
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
      "docs": [
        "Fusion: user returns the exact pro-rata bundle of neutrons+protons"
      ],
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
          "signer": true
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
      "docs": [
        "β⁻: neutron -> proton. apply (1 - φβ-(τ)),"
      ],
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
          "name": "priceUpdate"
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
      "docs": [
        "β⁺: proton -> neutron. apply (1 - φβ+(τ)),"
      ],
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
          "name": "priceUpdate"
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
      "name": "priceUpdateV2",
      "discriminator": [
        34,
        241,
        35,
        99,
        157,
        126,
        244,
        205
      ]
    },
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
      "msg": "Target reserve ratio / r* must be valid"
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
      "name": "missingPriceUpdate",
      "msg": "Missing or invalid price update account"
    },
    {
      "code": 6012,
      "name": "invalidAssetMetadata",
      "msg": "Invalid asset metadata"
    },
    {
      "code": 6013,
      "name": "invalidPriceAccount",
      "msg": "Invalid or mismatched price account"
    },
    {
      "code": 6014,
      "name": "priceNotAvailable",
      "msg": "No recent price available from oracle"
    },
    {
      "code": 6015,
      "name": "invalidPriceValue",
      "msg": "Oracle price is not positive"
    },
    {
      "code": 6016,
      "name": "amountTooSmall",
      "msg": "Amount too small after applying fees or conversions"
    },
    {
      "code": 6017,
      "name": "zeroReserve",
      "msg": "Reserve balance is zero"
    },
    {
      "code": 6018,
      "name": "zeroSupply",
      "msg": "Supply is zero"
    },
    {
      "code": 6019,
      "name": "accountDataBorrowFailed",
      "msg": "Failed to borrow account data"
    },
    {
      "code": 6020,
      "name": "invalidTokenAccount",
      "msg": "Invalid token account data"
    },
    {
      "code": 6021,
      "name": "invalidMintAccount",
      "msg": "Invalid mint account data"
    },
    {
      "code": 6022,
      "name": "valueTooLarge",
      "msg": "Value exceeds supported range"
    },
    {
      "code": 6023,
      "name": "exponentTooLarge",
      "msg": "Exponent exceeds supported range for pow10"
    },
    {
      "code": 6024,
      "name": "missingBump",
      "msg": "Missing PDA bump"
    },
    {
      "code": 6025,
      "name": "invalidBetaParam",
      "msg": "Invalid beta parameters"
    },
    {
      "code": 6026,
      "name": "invalidVaultName",
      "msg": "Invalid vault name"
    },
    {
      "code": 6027,
      "name": "invalidPriceFeedId",
      "msg": "Invalid price feed ID"
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
            "name": "baseAssetName",
            "type": "string"
          },
          {
            "name": "baseAssetSymbol",
            "type": "string"
          },
          {
            "name": "peggedAssetName",
            "type": "string"
          },
          {
            "name": "peggedAssetSymbol",
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
            "name": "criticalReserveRatioWad",
            "type": "u128"
          },
          {
            "name": "rStarWad",
            "type": "u128"
          },
          {
            "name": "priceFeedId",
            "type": "string"
          }
        ]
      }
    },
    {
      "name": "priceFeedMessage",
      "repr": {
        "kind": "c"
      },
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "feedId",
            "docs": [
              "`FeedId` but avoid the type alias because of compatibility issues with Anchor's `idl-build` feature."
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "price",
            "type": "i64"
          },
          {
            "name": "conf",
            "type": "u64"
          },
          {
            "name": "exponent",
            "type": "i32"
          },
          {
            "name": "publishTime",
            "docs": [
              "The timestamp of this price update in seconds"
            ],
            "type": "i64"
          },
          {
            "name": "prevPublishTime",
            "docs": [
              "The timestamp of the previous price update. This field is intended to allow users to",
              "identify the single unique price update for any moment in time:",
              "for any time t, the unique update is the one such that prev_publish_time < t <= publish_time.",
              "",
              "Note that there may not be such an update while we are migrating to the new message-sending logic,",
              "as some price updates on pythnet may not be sent to other chains (because the message-sending",
              "logic may not have triggered). We can solve this problem by making the message-sending mandatory",
              "(which we can do once publishers have migrated over).",
              "",
              "Additionally, this field may be equal to publish_time if the message is sent on a slot where",
              "where the aggregation was unsuccesful. This problem will go away once all publishers have",
              "migrated over to a recent version of pyth-agent."
            ],
            "type": "i64"
          },
          {
            "name": "emaPrice",
            "type": "i64"
          },
          {
            "name": "emaConf",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "priceUpdateV2",
      "docs": [
        "A price update account. This account is used by the Pyth Receiver program to store a verified price update from a Pyth price feed.",
        "It contains:",
        "- `write_authority`: The write authority for this account. This authority can close this account to reclaim rent or update the account to contain a different price update.",
        "- `verification_level`: The [`VerificationLevel`] of this price update. This represents how many Wormhole guardian signatures have been verified for this price update.",
        "- `price_message`: The actual price update.",
        "- `posted_slot`: The slot at which this price update was posted."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "writeAuthority",
            "type": "pubkey"
          },
          {
            "name": "verificationLevel",
            "type": {
              "defined": {
                "name": "verificationLevel"
              }
            }
          },
          {
            "name": "priceMessage",
            "type": {
              "defined": {
                "name": "priceFeedMessage"
              }
            }
          },
          {
            "name": "postedSlot",
            "type": "u64"
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
            "name": "baseAssetName",
            "type": "string"
          },
          {
            "name": "baseAssetSymbol",
            "type": "string"
          },
          {
            "name": "peggedAssetName",
            "type": "string"
          },
          {
            "name": "peggedAssetSymbol",
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
            "name": "priceFeedId",
            "type": "string"
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
            "name": "criticalReserveRatioWad",
            "type": "u128"
          },
          {
            "name": "rStarWad",
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
    },
    {
      "name": "verificationLevel",
      "docs": [
        "Pyth price updates are bridged to all blockchains via Wormhole.",
        "Using the price updates on another chain requires verifying the signatures of the Wormhole guardians.",
        "The usual process is to check the signatures for two thirds of the total number of guardians, but this can be cumbersome on Solana because of the transaction size limits,",
        "so we also allow for partial verification.",
        "",
        "This enum represents how much a price update has been verified:",
        "- If `Full`, we have verified the signatures for two thirds of the current guardians.",
        "- If `Partial`, only `num_signatures` guardian signatures have been checked.",
        "",
        "# Warning",
        "Using partially verified price updates is dangerous, as it lowers the threshold of guardians that need to collude to produce a malicious price update."
      ],
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "partial",
            "fields": [
              {
                "name": "numSignatures",
                "type": "u8"
              }
            ]
          },
          {
            "name": "full"
          }
        ]
      }
    }
  ]
};
