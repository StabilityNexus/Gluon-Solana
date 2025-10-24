#![allow(clippy::result_large_err)]
#![allow(non_snake_case)]

use anchor_lang::prelude::*;
use anchor_lang::solana_program::program_pack::Pack;
use anchor_spl::token::{self, Burn, Mint, MintTo, Token, TokenAccount, Transfer};
use pyth_sdk_solana::state::SolanaPriceAccount;
use spl_token::state::{Account as SplTokenAccount, Mint as SplMint};

mod uint_types {
    use uint::construct_uint;
    construct_uint! {
        pub struct U256(4);
    }
}

use uint_types::U256;

declare_id!("3Ad1BL6hdFP4ndQ3dKhFbLp56roCK76gs3mvVNJHPdYY");

const WAD: u128 = 1_000_000_000_000_000_000;
const PEG_WAD: u128 = WAD;
const PYTH_MAGIC: u32 = 0xa1b2c3d4;
const ACCOUNT_TYPE_PRODUCT: u32 = 2;

#[program]
pub mod stablecoin {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, params: InitializeParams) -> Result<()> {
        let clock = Clock::get()?;
        let reactor = &mut ctx.accounts.reactor;

        require!(
            !params.vault_name.trim().is_empty()
                && params.vault_name.len() <= Reactor::MAX_VAULT_NAME,
            ErrorCode::InvalidVaultName
        );
        require!(params.fission_fee_wad < WAD, ErrorCode::InvalidFee);
        require!(params.fusion_fee_wad < WAD, ErrorCode::InvalidFee);
        require!(
            params.target_reserve_ratio_wad >= WAD,
            ErrorCode::InvalidTargetReserveRatio
        );
        require!(
            ctx.accounts.treasury_authority.key() != Pubkey::default(),
            ErrorCode::InvalidTreasuryAuthority
        );
        require_keys_eq!(
            ctx.accounts.price_feed.key(),
            params.price_feed,
            ErrorCode::InvalidPriceAccount
        );
        require!(
            ctx.accounts.price_feed.owner == &params.oracle_program,
            ErrorCode::InvalidPriceAccount
        );

        let base_decimals = ctx.accounts.base_mint.decimals;
        let neutron_decimals = ctx.accounts.neutron_mint.decimals;
        let proton_decimals = ctx.accounts.proton_mint.decimals;
        reactor.validate_decimals(base_decimals)?;
        reactor.validate_decimals(neutron_decimals)?;
        reactor.validate_decimals(proton_decimals)?;

        require!(
            ctx.accounts.neutron_mint.mint_authority
                == Some(ctx.accounts.reactor_authority.key()).into(),
            ErrorCode::InvalidMintAuthority
        );
        require!(
            ctx.accounts.proton_mint.mint_authority
                == Some(ctx.accounts.reactor_authority.key()).into(),
            ErrorCode::InvalidMintAuthority
        );
        if let Some(authority) = Option::<Pubkey>::from(ctx.accounts.neutron_mint.freeze_authority)
        {
            require!(
                authority == ctx.accounts.reactor_authority.key(),
                ErrorCode::InvalidMintAuthority
            );
        }
        if let Some(authority) = Option::<Pubkey>::from(ctx.accounts.proton_mint.freeze_authority) {
            require!(
                authority == ctx.accounts.reactor_authority.key(),
                ErrorCode::InvalidMintAuthority
            );
        }
        require!(
            ctx.accounts.base_vault.owner == ctx.accounts.reactor_authority.key(),
            ErrorCode::InvalidVaultAuthority
        );
        require!(
            ctx.accounts.base_vault.mint == ctx.accounts.base_mint.key(),
            ErrorCode::MintMismatch
        );
        require!(
            ctx.accounts.treasury_base_account.mint == ctx.accounts.base_mint.key(),
            ErrorCode::MintMismatch
        );
        require!(
            ctx.accounts.treasury_base_account.owner == ctx.accounts.treasury_authority.key(),
            ErrorCode::InvalidTreasuryAccount
        );

        let authority_bump = ctx.bumps.reactor_authority;

        reactor.authority_bump = authority_bump;
        reactor.vault_name = params.vault_name;
        reactor.base_mint = ctx.accounts.base_mint.key();
        reactor.base_vault = ctx.accounts.base_vault.key();
        reactor.neutron_mint = ctx.accounts.neutron_mint.key();
        reactor.proton_mint = ctx.accounts.proton_mint.key();
        reactor.price_feed = params.price_feed;
        reactor.oracle_program = params.oracle_program;
        reactor.treasury_authority = ctx.accounts.treasury_authority.key();
        reactor.treasury_base_account = ctx.accounts.treasury_base_account.key();
        reactor.fission_fee_wad = params.fission_fee_wad;
        reactor.fusion_fee_wad = params.fusion_fee_wad;
        reactor.target_reserve_ratio_wad = params.target_reserve_ratio_wad;
        reactor.beta_phi0_wad = 0;
        reactor.beta_phi1_wad = 0;
        reactor.decay_per_second_wad = WAD;
        reactor.decayed_volume_base_wad = 0;
        reactor.last_decay_ts = clock.unix_timestamp;
        reactor.base_decimals = base_decimals;
        reactor.neutron_decimals = neutron_decimals;
        reactor.proton_decimals = proton_decimals;

        Ok(())
    }

    pub fn set_beta_params(ctx: Context<SetBetaParams>, params: BetaParams) -> Result<()> {
        let reactor = &mut ctx.accounts.reactor;

        require!(
            params.phi0_wad <= WAD && params.phi1_wad <= WAD,
            ErrorCode::InvalidBetaParam
        );
        require!(
            params.decay_per_second_wad <= WAD,
            ErrorCode::InvalidBetaParam
        );

        reactor.beta_phi0_wad = params.phi0_wad;
        reactor.beta_phi1_wad = params.phi1_wad;
        reactor.decay_per_second_wad = params.decay_per_second_wad;

        emit!(BetaParamsSetEvent {
            reactor: reactor.key(),
            phi0_wad: params.phi0_wad,
            phi1_wad: params.phi1_wad,
            decay_per_second_wad: params.decay_per_second_wad,
        });

        Ok(())
    }

    pub fn fission(ctx: Context<Fission>, amount_in: u64) -> Result<()> {
        require!(amount_in > 0, ErrorCode::AmountIsZero);
        let clock = Clock::get()?;
        let reactor = &mut ctx.accounts.reactor;

        require_keys_eq!(
            ctx.accounts.price_feed.key(),
            reactor.price_feed,
            ErrorCode::InvalidPriceAccount
        );

        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.user_base_account.clone(),
                    to: ctx.accounts.base_vault.clone(),
                    authority: ctx.accounts.user_authority.to_account_info(),
                },
            ),
            amount_in,
        )?;

        let amount_in_wad = tokens_to_wad(amount_in, reactor.base_decimals)?;
        let fee_wad = mul_div(amount_in_wad, reactor.fission_fee_wad, WAD)?;
        let fee_tokens = wad_to_tokens(fee_wad, reactor.base_decimals)?;
        let net_tokens = amount_in
            .checked_sub(fee_tokens)
            .ok_or(error!(ErrorCode::MathOverflow))?;
        require!(net_tokens > 0, ErrorCode::AmountTooSmall);

        let net_wad = tokens_to_wad(net_tokens, reactor.base_decimals)?;
        let linked_price_key = find_linked_price_key(&ctx.accounts.price_feed)?;
        let linked_price_account = linked_price_key.and_then(|key| {
            ctx.remaining_accounts
                .iter()
                .find(|account| account.key() == key)
        });
        let price_base_wad = reactor.get_base_price_in_pegged_asset(
            &ctx.accounts.price_feed,
            linked_price_account,
            clock.unix_timestamp,
        )?;

        if fee_tokens > 0 {
            let reactor_key = reactor.key();
            let bump = [reactor.authority_bump];
            let signer_seeds: &[&[u8]] =
                &[Reactor::AUTHORITY_PDA_SEED, reactor_key.as_ref(), &bump];
            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.base_vault.clone(),
                        to: ctx.accounts.treasury_base_account.clone(),
                        authority: ctx.accounts.reactor_authority.to_account_info(),
                    },
                    &[signer_seeds],
                ),
                fee_tokens,
            )?;
        }

        let neutron_out_wad = mul_div(net_wad, price_base_wad, reactor.target_reserve_ratio_wad)?;
        let net_over_r = mul_div(net_wad, WAD, reactor.target_reserve_ratio_wad)?;
        let proton_out_wad = net_wad
            .checked_sub(net_over_r)
            .ok_or(error!(ErrorCode::MathOverflow))?;

        let neutron_out_tokens = wad_to_tokens(neutron_out_wad, reactor.neutron_decimals)?;
        let proton_out_tokens = wad_to_tokens(proton_out_wad, reactor.proton_decimals)?;
        require!(
            neutron_out_tokens > 0 || proton_out_tokens > 0,
            ErrorCode::AmountTooSmall
        );

        let reactor_key = reactor.key();
        let bump = [reactor.authority_bump];
        let signer_seeds: &[&[u8]] = &[Reactor::AUTHORITY_PDA_SEED, reactor_key.as_ref(), &bump];

        if neutron_out_tokens > 0 {
            token::mint_to(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    MintTo {
                        mint: ctx.accounts.neutron_mint.clone(),
                        to: ctx.accounts.user_neutron_account.clone(),
                        authority: ctx.accounts.reactor_authority.to_account_info(),
                    },
                    &[signer_seeds],
                ),
                neutron_out_tokens,
            )?;
        }

        if proton_out_tokens > 0 {
            token::mint_to(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    MintTo {
                        mint: ctx.accounts.proton_mint.clone(),
                        to: ctx.accounts.user_proton_account.clone(),
                        authority: ctx.accounts.reactor_authority.to_account_info(),
                    },
                    &[signer_seeds],
                ),
                proton_out_tokens,
            )?;
        }

        emit!(FissionEvent {
            reactor: reactor.key(),
            from_authority: ctx.accounts.user_authority.key(),
            base_in: amount_in,
            neutron_minted: neutron_out_tokens,
            proton_minted: proton_out_tokens,
            base_fee_to_treasury: fee_tokens,
        });

        Ok(())
    }

    pub fn fusion(ctx: Context<Fusion>, amount_in: u64) -> Result<()> {
        require!(amount_in > 0, ErrorCode::AmountIsZero);
        let reactor = &mut ctx.accounts.reactor;

        let reserve_tokens = load_token_account(&ctx.accounts.base_vault)?.amount;
        require!(reserve_tokens > 0, ErrorCode::ZeroReserve);

        let neutron_mint_state = load_mint(&ctx.accounts.neutron_mint)?;
        let proton_mint_state = load_mint(&ctx.accounts.proton_mint)?;
        let neutron_supply_tokens = neutron_mint_state.supply;
        let proton_supply_tokens = proton_mint_state.supply;
        require!(neutron_supply_tokens > 0, ErrorCode::ZeroSupply);
        require!(proton_supply_tokens > 0, ErrorCode::ZeroSupply);

        let m_wad = tokens_to_wad(amount_in, reactor.base_decimals)?;
        let reserve_wad = tokens_to_wad(reserve_tokens, reactor.base_decimals)?;
        let neutron_supply_wad = tokens_to_wad(neutron_supply_tokens, reactor.neutron_decimals)?;
        let proton_supply_wad = tokens_to_wad(proton_supply_tokens, reactor.proton_decimals)?;

        let n_burn_wad = mul_div(m_wad, neutron_supply_wad, reserve_wad)?;
        let p_burn_wad = mul_div(m_wad, proton_supply_wad, reserve_wad)?;

        let neutron_burn_tokens = wad_to_tokens(n_burn_wad, reactor.neutron_decimals)?;
        let proton_burn_tokens = wad_to_tokens(p_burn_wad, reactor.proton_decimals)?;
        require!(
            neutron_burn_tokens > 0 && proton_burn_tokens > 0,
            ErrorCode::AmountTooSmall
        );

        token::burn(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Burn {
                    mint: ctx.accounts.neutron_mint.clone(),
                    from: ctx.accounts.user_neutron_account.clone(),
                    authority: ctx.accounts.user_authority.to_account_info(),
                },
            ),
            neutron_burn_tokens,
        )?;

        token::burn(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Burn {
                    mint: ctx.accounts.proton_mint.clone(),
                    from: ctx.accounts.user_proton_account.clone(),
                    authority: ctx.accounts.user_authority.to_account_info(),
                },
            ),
            proton_burn_tokens,
        )?;

        let fee_wad = mul_div(m_wad, reactor.fusion_fee_wad, WAD)?;
        let fee_tokens = wad_to_tokens(fee_wad, reactor.base_decimals)?;
        let net_tokens = amount_in
            .checked_sub(fee_tokens)
            .ok_or(error!(ErrorCode::MathOverflow))?;
        require!(net_tokens > 0, ErrorCode::AmountTooSmall);

        let reactor_key = reactor.key();
        let bump = [reactor.authority_bump];
        let signer_seeds: &[&[u8]] = &[Reactor::AUTHORITY_PDA_SEED, reactor_key.as_ref(), &bump];

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.base_vault.clone(),
                    to: ctx.accounts.user_base_account.clone(),
                    authority: ctx.accounts.reactor_authority.to_account_info(),
                },
                &[signer_seeds],
            ),
            net_tokens,
        )?;

        if fee_tokens > 0 {
            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.base_vault.clone(),
                        to: ctx.accounts.treasury_base_account.clone(),
                        authority: ctx.accounts.reactor_authority.to_account_info(),
                    },
                    &[signer_seeds],
                ),
                fee_tokens,
            )?;
        }

        emit!(FusionEvent {
            reactor: reactor.key(),
            from_authority: ctx.accounts.user_authority.key(),
            neutron_burned: neutron_burn_tokens,
            proton_burned: proton_burn_tokens,
            base_out: net_tokens,
            base_fee_to_treasury: fee_tokens,
        });

        Ok(())
    }

    pub fn transmute_proton_to_neutron(ctx: Context<TransmutePlus>, proton_in: u64) -> Result<()> {
        require!(proton_in > 0, ErrorCode::AmountIsZero);
        let clock = Clock::get()?;
        let reactor = &mut ctx.accounts.reactor;

        let reserve_tokens = load_token_account(&ctx.accounts.base_vault)?.amount;
        let proton_supply_tokens = load_mint(&ctx.accounts.proton_mint)?.supply;
        let neutron_supply_tokens = load_mint(&ctx.accounts.neutron_mint)?.supply;

        let linked_price_key = find_linked_price_key(&ctx.accounts.price_feed)?;
        let linked_price_account = linked_price_key.and_then(|key| {
            ctx.remaining_accounts
                .iter()
                .find(|account| account.key() == key)
        });
        let base_price_wad = reactor.get_base_price_in_pegged_asset(
            &ctx.accounts.price_feed,
            linked_price_account,
            clock.unix_timestamp,
        )?;
        let proton_price_base_wad =
            reactor.proton_price_in_base(reserve_tokens, proton_supply_tokens)?;
        let neutron_price_base_wad =
            reactor.neutron_price_in_base(reserve_tokens, neutron_supply_tokens, base_price_wad)?;

        token::burn(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Burn {
                    mint: ctx.accounts.proton_mint.clone(),
                    from: ctx.accounts.user_proton_account.clone(),
                    authority: ctx.accounts.user_authority.to_account_info(),
                },
            ),
            proton_in,
        )?;

        let proton_in_wad = tokens_to_wad(proton_in, reactor.proton_decimals)?;
        let gross_base_wad = mul_div(proton_in_wad, proton_price_base_wad, WAD)?;

        reactor.decay_ledger(clock.unix_timestamp)?;
        let reserve_wad = tokens_to_wad(reserve_tokens, reactor.base_decimals)?;
        let fee_wad = reactor.beta_plus_fee(reserve_wad)?;
        let fee_factor = WAD
            .checked_sub(fee_wad)
            .ok_or(error!(ErrorCode::MathOverflow))?;
        let net_base_wad = mul_div(gross_base_wad, fee_factor, WAD)?;
        let neutron_out_wad = mul_div(net_base_wad, WAD, neutron_price_base_wad)?;
        let neutron_out_tokens = wad_to_tokens(neutron_out_wad, reactor.neutron_decimals)?;
        require!(neutron_out_tokens > 0, ErrorCode::AmountTooSmall);

        let reactor_key = reactor.key();
        let bump = [reactor.authority_bump];
        let signer_seeds: &[&[u8]] = &[Reactor::AUTHORITY_PDA_SEED, reactor_key.as_ref(), &bump];

        token::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                MintTo {
                    mint: ctx.accounts.neutron_mint.clone(),
                    to: ctx.accounts.user_neutron_account.clone(),
                    authority: ctx.accounts.reactor_authority.to_account_info(),
                },
                &[signer_seeds],
            ),
            neutron_out_tokens,
        )?;

        let gross_base_i128 = gross_base_wad_to_i128(gross_base_wad)?;
        reactor.decayed_volume_base_wad = reactor
            .decayed_volume_base_wad
            .checked_add(gross_base_i128)
            .ok_or(error!(ErrorCode::MathOverflow))?;

        emit!(TransmutePlusEvent {
            reactor: reactor.key(),
            authority: ctx.accounts.user_authority.key(),
            proton_in,
            neutron_out: neutron_out_tokens,
            fee_wad,
            decayed_volume_base_wad: reactor.decayed_volume_base_wad,
        });

        Ok(())
    }

    pub fn transmute_neutron_to_proton(
        ctx: Context<TransmuteMinus>,
        neutron_in: u64,
    ) -> Result<()> {
        require!(neutron_in > 0, ErrorCode::AmountIsZero);
        let clock = Clock::get()?;
        let reactor = &mut ctx.accounts.reactor;

        let reserve_tokens = load_token_account(&ctx.accounts.base_vault)?.amount;
        let proton_supply_tokens = load_mint(&ctx.accounts.proton_mint)?.supply;
        let neutron_supply_tokens = load_mint(&ctx.accounts.neutron_mint)?.supply;

        let linked_price_key = find_linked_price_key(&ctx.accounts.price_feed)?;
        let linked_price_account = linked_price_key.and_then(|key| {
            ctx.remaining_accounts
                .iter()
                .find(|account| account.key() == key)
        });
        let base_price_wad = reactor.get_base_price_in_pegged_asset(
            &ctx.accounts.price_feed,
            linked_price_account,
            clock.unix_timestamp,
        )?;
        let proton_price_base_wad =
            reactor.proton_price_in_base(reserve_tokens, proton_supply_tokens)?;
        let neutron_price_base_wad =
            reactor.neutron_price_in_base(reserve_tokens, neutron_supply_tokens, base_price_wad)?;

        token::burn(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Burn {
                    mint: ctx.accounts.neutron_mint.clone(),
                    from: ctx.accounts.user_neutron_account.clone(),
                    authority: ctx.accounts.user_authority.to_account_info(),
                },
            ),
            neutron_in,
        )?;

        let neutron_in_wad = tokens_to_wad(neutron_in, reactor.neutron_decimals)?;
        let gross_base_wad = mul_div(neutron_in_wad, neutron_price_base_wad, WAD)?;

        reactor.decay_ledger(clock.unix_timestamp)?;
        let reserve_wad = tokens_to_wad(reserve_tokens, reactor.base_decimals)?;
        let fee_wad = reactor.beta_minus_fee(reserve_wad)?;
        let fee_factor = WAD
            .checked_sub(fee_wad)
            .ok_or(error!(ErrorCode::MathOverflow))?;
        let net_base_wad = mul_div(gross_base_wad, fee_factor, WAD)?;
        let proton_out_wad = mul_div(net_base_wad, WAD, proton_price_base_wad)?;
        let proton_out_tokens = wad_to_tokens(proton_out_wad, reactor.proton_decimals)?;
        require!(proton_out_tokens > 0, ErrorCode::AmountTooSmall);

        let reactor_key = reactor.key();
        let bump = [reactor.authority_bump];
        let signer_seeds: &[&[u8]] = &[Reactor::AUTHORITY_PDA_SEED, reactor_key.as_ref(), &bump];

        token::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                MintTo {
                    mint: ctx.accounts.proton_mint.clone(),
                    to: ctx.accounts.user_proton_account.clone(),
                    authority: ctx.accounts.reactor_authority.to_account_info(),
                },
                &[signer_seeds],
            ),
            proton_out_tokens,
        )?;

        let gross_base_i128 = gross_base_wad_to_i128(gross_base_wad)?;
        reactor.decayed_volume_base_wad = reactor
            .decayed_volume_base_wad
            .checked_sub(gross_base_i128)
            .ok_or(error!(ErrorCode::MathOverflow))?;

        emit!(TransmuteMinusEvent {
            reactor: reactor.key(),
            authority: ctx.accounts.user_authority.key(),
            neutron_in,
            proton_out: proton_out_tokens,
            fee_wad,
            decayed_volume_base_wad: reactor.decayed_volume_base_wad,
        });

        Ok(())
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct InitializeParams {
    pub vault_name: String,
    pub fission_fee_wad: u128,
    pub fusion_fee_wad: u128,
    pub target_reserve_ratio_wad: u128,
    pub price_feed: Pubkey,
    pub oracle_program: Pubkey,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct BetaParams {
    pub phi0_wad: u128,
    pub phi1_wad: u128,
    pub decay_per_second_wad: u128,
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        init,
        payer = payer,
        space = Reactor::SPACE,
    )]
    pub reactor: Account<'info, Reactor>,
    #[account(
        seeds = [Reactor::AUTHORITY_PDA_SEED, reactor.key().as_ref()],
        bump
    )]
    /// CHECK: PDA authority for minting and vault custody.
    pub reactor_authority: UncheckedAccount<'info>,
    pub base_mint: Account<'info, Mint>,
    #[account(mut)]
    pub base_vault: Account<'info, TokenAccount>,
    pub neutron_mint: Account<'info, Mint>,
    pub proton_mint: Account<'info, Mint>,
    /// CHECK: validated in handler
    pub price_feed: AccountInfo<'info>,
    /// CHECK: validated in handler
    pub treasury_authority: UncheckedAccount<'info>,
    #[account(mut)]
    pub treasury_base_account: Account<'info, TokenAccount>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct SetBetaParams<'info> {
    #[account(mut, has_one = treasury_authority)]
    pub reactor: Account<'info, Reactor>,
    pub treasury_authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct Fission<'info> {
    #[account(
        mut,
        has_one = base_vault,
        has_one = neutron_mint,
        has_one = proton_mint,
        has_one = price_feed,
        has_one = treasury_base_account
    )]
    pub reactor: Account<'info, Reactor>,
    #[account(
        seeds = [Reactor::AUTHORITY_PDA_SEED, reactor.key().as_ref()],
        bump = reactor.authority_bump
    )]
    /// CHECK: signer PDA derived inside handler
    pub reactor_authority: UncheckedAccount<'info>,
    pub user_authority: Signer<'info>,
    /// CHECK: validated in handler via has_one constraint
    #[account(mut)]
    pub base_vault: AccountInfo<'info>,
    /// CHECK: validated in handler via has_one constraint
    #[account(mut)]
    pub neutron_mint: AccountInfo<'info>,
    /// CHECK: validated in handler via has_one constraint
    #[account(mut)]
    pub proton_mint: AccountInfo<'info>,
    /// CHECK: manually loaded and validated in handler
    #[account(mut)]
    pub user_base_account: AccountInfo<'info>,
    /// CHECK: manually loaded and validated in handler
    #[account(mut)]
    pub user_neutron_account: AccountInfo<'info>,
    /// CHECK: manually loaded and validated in handler
    #[account(mut)]
    pub user_proton_account: AccountInfo<'info>,
    /// CHECK: validated in handler via has_one constraint
    #[account(mut)]
    pub treasury_base_account: AccountInfo<'info>,
    /// CHECK: verified in handler
    pub price_feed: AccountInfo<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct Fusion<'info> {
    #[account(
        mut,
        has_one = base_vault,
        has_one = neutron_mint,
        has_one = proton_mint,
        has_one = treasury_base_account
    )]
    pub reactor: Account<'info, Reactor>,
    #[account(
        seeds = [Reactor::AUTHORITY_PDA_SEED, reactor.key().as_ref()],
        bump = reactor.authority_bump
    )]
    /// CHECK: signer PDA derived inside handler
    pub reactor_authority: UncheckedAccount<'info>,
    pub user_authority: Signer<'info>,
    /// CHECK: validated in handler via has_one constraint
    #[account(mut)]
    pub base_vault: AccountInfo<'info>,
    /// CHECK: validated in handler via has_one constraint
    #[account(mut)]
    pub neutron_mint: AccountInfo<'info>,
    /// CHECK: validated in handler via has_one constraint
    #[account(mut)]
    pub proton_mint: AccountInfo<'info>,
    /// CHECK: manually loaded and validated in handler
    #[account(mut)]
    pub user_base_account: AccountInfo<'info>,
    /// CHECK: manually loaded and validated in handler
    #[account(mut)]
    pub user_neutron_account: AccountInfo<'info>,
    /// CHECK: manually loaded and validated in handler
    #[account(mut)]
    pub user_proton_account: AccountInfo<'info>,
    /// CHECK: validated in handler via has_one constraint
    #[account(mut)]
    pub treasury_base_account: AccountInfo<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct TransmutePlus<'info> {
    #[account(
        mut,
        has_one = base_vault,
        has_one = proton_mint,
        has_one = neutron_mint,
        has_one = price_feed
    )]
    pub reactor: Account<'info, Reactor>,
    #[account(
        seeds = [Reactor::AUTHORITY_PDA_SEED, reactor.key().as_ref()],
        bump = reactor.authority_bump
    )]
    /// CHECK: signer PDA derived inside handler
    pub reactor_authority: UncheckedAccount<'info>,
    pub user_authority: Signer<'info>,
    /// CHECK: validated in handler via has_one constraint
    #[account(mut)]
    pub base_vault: AccountInfo<'info>,
    /// CHECK: validated in handler via has_one constraint
    #[account(mut)]
    pub proton_mint: AccountInfo<'info>,
    /// CHECK: validated in handler via has_one constraint
    #[account(mut)]
    pub neutron_mint: AccountInfo<'info>,
    /// CHECK: manually loaded and validated in handler
    #[account(mut)]
    pub user_proton_account: AccountInfo<'info>,
    /// CHECK: manually loaded and validated in handler
    #[account(mut)]
    pub user_neutron_account: AccountInfo<'info>,
    /// CHECK: verified in handler
    pub price_feed: AccountInfo<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct TransmuteMinus<'info> {
    #[account(
        mut,
        has_one = base_vault,
        has_one = proton_mint,
        has_one = neutron_mint,
        has_one = price_feed
    )]
    pub reactor: Account<'info, Reactor>,
    #[account(
        seeds = [Reactor::AUTHORITY_PDA_SEED, reactor.key().as_ref()],
        bump = reactor.authority_bump
    )]
    /// CHECK: signer PDA derived inside handler
    pub reactor_authority: UncheckedAccount<'info>,
    pub user_authority: Signer<'info>,
    /// CHECK: validated in handler via has_one constraint
    #[account(mut)]
    pub base_vault: AccountInfo<'info>,
    /// CHECK: validated in handler via has_one constraint
    #[account(mut)]
    pub proton_mint: AccountInfo<'info>,
    /// CHECK: validated in handler via has_one constraint
    #[account(mut)]
    pub neutron_mint: AccountInfo<'info>,
    /// CHECK: manually loaded and validated in handler
    #[account(mut)]
    pub user_neutron_account: AccountInfo<'info>,
    /// CHECK: manually loaded and validated in handler
    #[account(mut)]
    pub user_proton_account: AccountInfo<'info>,
    /// CHECK: verified in handler
    pub price_feed: AccountInfo<'info>,
    pub token_program: Program<'info, Token>,
}

#[account]
pub struct Reactor {
    pub authority_bump: u8,
    pub vault_name: String,
    pub base_mint: Pubkey,
    pub base_vault: Pubkey,
    pub neutron_mint: Pubkey,
    pub proton_mint: Pubkey,
    pub price_feed: Pubkey,
    pub oracle_program: Pubkey,
    pub treasury_authority: Pubkey,
    pub treasury_base_account: Pubkey,
    pub fission_fee_wad: u128,
    pub fusion_fee_wad: u128,
    pub target_reserve_ratio_wad: u128,
    pub beta_phi0_wad: u128,
    pub beta_phi1_wad: u128,
    pub decay_per_second_wad: u128,
    pub decayed_volume_base_wad: i128,
    pub last_decay_ts: i64,
    pub base_decimals: u8,
    pub neutron_decimals: u8,
    pub proton_decimals: u8,
}

impl Reactor {
    pub const MAX_VAULT_NAME: usize = 64;
    pub const MAX_DECIMALS: u8 = 18;
    pub const AUTHORITY_PDA_SEED: &'static [u8] = b"reactor-authority";
    pub const MAX_PRICE_AGE_SECONDS: i64 = 3000000000; 
    pub const SPACE: usize = 8 + 4 + Self::MAX_VAULT_NAME + 1 + 32 * 8 + 16 * 6 + 16 + 8 + 3 + 5;

    fn validate_decimals(&self, decimals: u8) -> Result<()> {
        require!(decimals <= Self::MAX_DECIMALS, ErrorCode::InvalidDecimals);
        Ok(())
    }

    fn q_wad(&self) -> u128 {
        let q = (WAD * WAD) / self.target_reserve_ratio_wad;
        if q > WAD {
            WAD
        } else {
            q
        }
    }

    fn get_base_price_in_pegged_asset(
        &self,
        price_info: &AccountInfo<'_>,
        alternative_price: Option<&AccountInfo<'_>>,
        current_ts: i64,
    ) -> Result<u128> {
        require!(
            price_info.key() == self.price_feed,
            ErrorCode::InvalidPriceAccount
        );
        require!(
            price_info.owner == &self.oracle_program,
            ErrorCode::InvalidPriceAccount
        );
        let price_account = match SolanaPriceAccount::account_info_to_feed(price_info) {
            Ok(account) => account,
            Err(_) => {
                let alternative = alternative_price.ok_or(error!(ErrorCode::InvalidPriceAccount))?;
                require!(
                    alternative.owner == &self.oracle_program,
                    ErrorCode::InvalidPriceAccount
                );
                SolanaPriceAccount::account_info_to_feed(alternative)
                    .map_err(|_| error!(ErrorCode::InvalidPriceAccount))?
            }
        };
        let price = price_account
            .get_price_no_older_than(current_ts, Self::MAX_PRICE_AGE_SECONDS as u64)
            .ok_or(error!(ErrorCode::PriceNotAvailable))?;
        require!(price.price > 0, ErrorCode::InvalidPriceValue);
        let price_u128 = price.price as u128;
        if price.expo >= 0 {
            let scale = pow10(price.expo as u32)?;
            price_u128
                .checked_mul(scale)
                .and_then(|v| v.checked_mul(WAD))
                .ok_or(error!(ErrorCode::MathOverflow))
        } else {
            let scale = pow10((-price.expo) as u32)?;
            mul_div(price_u128, WAD, scale)
        }
    }

    fn proton_price_in_base(&self, reserve_tokens: u64, proton_supply_tokens: u64) -> Result<u128> {
        if proton_supply_tokens == 0 {
            return Ok(WAD);
        }
        let reserve_wad = tokens_to_wad(reserve_tokens, self.base_decimals)?;
        if reserve_wad == 0 {
            return Ok(0);
        }
        let supply_wad = tokens_to_wad(proton_supply_tokens, self.proton_decimals)?;
        let q = self.q_wad();
        let one_minus_q = WAD.checked_sub(q).ok_or(error!(ErrorCode::MathOverflow))?;
        mul_div(one_minus_q, reserve_wad, supply_wad)
    }

    fn neutron_price_in_base(
        &self,
        reserve_tokens: u64,
        neutron_supply_tokens: u64,
        base_price_wad: u128,
    ) -> Result<u128> {
        if neutron_supply_tokens == 0 {
            return mul_div(PEG_WAD, WAD, base_price_wad);
        }
        let reserve_wad = tokens_to_wad(reserve_tokens, self.base_decimals)?;
        if reserve_wad == 0 {
            return Ok(0);
        }
        let supply_wad = tokens_to_wad(neutron_supply_tokens, self.neutron_decimals)?;
        let q = self.q_wad();
        mul_div(q, reserve_wad, supply_wad)
    }

    fn decay_ledger(&mut self, now_ts: i64) -> Result<()> {
        if now_ts <= self.last_decay_ts {
            return Ok(());
        }
        let dt = (now_ts - self.last_decay_ts) as u64;
        if dt == 0 {
            return Ok(());
        }
        if self.decay_per_second_wad == WAD {
            self.last_decay_ts = now_ts;
            return Ok(());
        }
        let decay_factor = rpow(self.decay_per_second_wad, dt)?;
        if self.decayed_volume_base_wad > 0 {
            let volume = self.decayed_volume_base_wad as u128;
            let decayed = mul_div(volume, decay_factor, WAD)?;
            self.decayed_volume_base_wad = decayed as i128;
        } else if self.decayed_volume_base_wad < 0 {
            let volume = (-self.decayed_volume_base_wad) as u128;
            let decayed = mul_div(volume, decay_factor, WAD)?;
            self.decayed_volume_base_wad = -(decayed as i128);
        }
        self.last_decay_ts = now_ts;
        Ok(())
    }

    fn beta_plus_fee(&self, reserve_wad: u128) -> Result<u128> {
        if reserve_wad == 0 {
            return Ok(WAD);
        }
        if self.beta_phi0_wad == 0 && self.beta_phi1_wad == 0 {
            return Ok(0);
        }
        let pos = if self.decayed_volume_base_wad > 0 {
            self.decayed_volume_base_wad as u128
        } else {
            0
        };
        let mut fee = self.beta_phi0_wad;
        if pos > 0 {
            let term = mul_div(self.beta_phi1_wad, pos, reserve_wad)?;
            fee = fee
                .checked_add(term)
                .ok_or(error!(ErrorCode::MathOverflow))?;
        }
        if fee > WAD {
            Ok(WAD)
        } else {
            Ok(fee)
        }
    }

    fn beta_minus_fee(&self, reserve_wad: u128) -> Result<u128> {
        if reserve_wad == 0 {
            return Ok(WAD);
        }
        if self.beta_phi0_wad == 0 && self.beta_phi1_wad == 0 {
            return Ok(0);
        }
        let neg = if self.decayed_volume_base_wad < 0 {
            (-self.decayed_volume_base_wad) as u128
        } else {
            0
        };
        let mut fee = self.beta_phi0_wad;
        if neg > 0 {
            let term = mul_div(self.beta_phi1_wad, neg, reserve_wad)?;
            fee = fee
                .checked_add(term)
                .ok_or(error!(ErrorCode::MathOverflow))?;
        }
        if fee > WAD {
            Ok(WAD)
        } else {
            Ok(fee)
        }
    }
}

fn extract_price_account_key_from_product(data: &[u8]) -> Option<Pubkey> {
    const HEADER_LEN: usize = 4 + 4 + 4 + 4;
    const KEY_OFFSET: usize = HEADER_LEN;
    const KEY_END: usize = KEY_OFFSET + 32;

    if data.len() < KEY_END {
        return None;
    }
    let magic = u32::from_le_bytes(data[0..4].try_into().ok()?);
    let account_type = u32::from_le_bytes(data[8..12].try_into().ok()?);
    if magic != PYTH_MAGIC || account_type != ACCOUNT_TYPE_PRODUCT {
        return None;
    }
    let key_bytes: [u8; 32] = data[KEY_OFFSET..KEY_END].try_into().ok()?;
    Some(Pubkey::new_from_array(key_bytes))
}

fn find_linked_price_key(price_info: &AccountInfo<'_>) -> Result<Option<Pubkey>> {
    let data_ref = price_info
        .try_borrow_data()
        .map_err(|_| error!(ErrorCode::AccountDataBorrowFailed))?;
    let maybe_price_key = extract_price_account_key_from_product(&data_ref);
    drop(data_ref);
    Ok(maybe_price_key)
}

#[event]
pub struct FissionEvent {
    pub reactor: Pubkey,
    pub from_authority: Pubkey,
    pub base_in: u64,
    pub neutron_minted: u64,
    pub proton_minted: u64,
    pub base_fee_to_treasury: u64,
}

#[event]
pub struct FusionEvent {
    pub reactor: Pubkey,
    pub from_authority: Pubkey,
    pub neutron_burned: u64,
    pub proton_burned: u64,
    pub base_out: u64,
    pub base_fee_to_treasury: u64,
}

#[event]
pub struct TransmutePlusEvent {
    pub reactor: Pubkey,
    pub authority: Pubkey,
    pub proton_in: u64,
    pub neutron_out: u64,
    pub fee_wad: u128,
    pub decayed_volume_base_wad: i128,
}

#[event]
pub struct TransmuteMinusEvent {
    pub reactor: Pubkey,
    pub authority: Pubkey,
    pub neutron_in: u64,
    pub proton_out: u64,
    pub fee_wad: u128,
    pub decayed_volume_base_wad: i128,
}

#[event]
pub struct BetaParamsSetEvent {
    pub reactor: Pubkey,
    pub phi0_wad: u128,
    pub phi1_wad: u128,
    pub decay_per_second_wad: u128,
}

fn load_token_account(account: &AccountInfo<'_>) -> Result<SplTokenAccount> {
    let data = account
        .try_borrow_data()
        .map_err(|_| error!(ErrorCode::AccountDataBorrowFailed))?;
    SplTokenAccount::unpack(&data).map_err(|_| error!(ErrorCode::InvalidTokenAccount))
}

fn load_mint(account: &AccountInfo<'_>) -> Result<SplMint> {
    let data = account
        .try_borrow_data()
        .map_err(|_| error!(ErrorCode::AccountDataBorrowFailed))?;
    SplMint::unpack(&data).map_err(|_| error!(ErrorCode::InvalidMintAccount))
}

fn tokens_to_wad(amount: u64, decimals: u8) -> Result<u128> {
    let denom = pow10(decimals as u32)?;
    mul_div(amount as u128, WAD, denom)
}

fn wad_to_tokens(value_wad: u128, decimals: u8) -> Result<u64> {
    let multiplier = pow10(decimals as u32)?;
    let raw = mul_div(value_wad, multiplier, WAD)?;
    if raw > u64::MAX as u128 {
        return Err(error!(ErrorCode::ValueTooLarge));
    }
    Ok(raw as u64)
}

fn gross_base_wad_to_i128(value: u128) -> Result<i128> {
    if value > i128::MAX as u128 {
        return Err(error!(ErrorCode::MathOverflow));
    }
    Ok(value as i128)
}

fn mul_div(a: u128, b: u128, denominator: u128) -> Result<u128> {
    if denominator == 0 {
        return Err(error!(ErrorCode::DivisionByZero));
    }
    if a == 0 || b == 0 {
        return Ok(0);
    }
    let product = U256::from(a)
        .checked_mul(U256::from(b))
        .ok_or(error!(ErrorCode::MathOverflow))?;
    let result = product / U256::from(denominator);
    if result > U256::from(u128::MAX) {
        return Err(error!(ErrorCode::MathOverflow));
    }
    Ok(result.as_u128())
}

fn pow10(exp: u32) -> Result<u128> {
    if exp > 38 {
        return Err(error!(ErrorCode::ExponentTooLarge));
    }
    let mut result = 1u128;
    for _ in 0..exp {
        result = result
            .checked_mul(10)
            .ok_or(error!(ErrorCode::MathOverflow))?;
    }
    Ok(result)
}

fn rpow(mut x: u128, mut n: u64) -> Result<u128> {
    if n == 0 {
        return Ok(WAD);
    }
    let mut z = if n % 2 != 0 { x } else { WAD };
    while {
        n /= 2;
        n != 0
    } {
        x = mul_div(x, x, WAD)?;
        if n % 2 != 0 {
            z = mul_div(z, x, WAD)?;
        }
    }
    Ok(z)
}

#[error_code]
pub enum ErrorCode {
    #[msg("Amount must be greater than zero")]
    AmountIsZero,
    #[msg("Math overflow")]
    MathOverflow,
    #[msg("Division by zero")]
    DivisionByZero,
    #[msg("Fee must be less than 100% (WAD)")]
    InvalidFee,
    #[msg("Target reserve ratio must be at least 100% (WAD)")]
    InvalidTargetReserveRatio,
    #[msg("Invalid decimals for token; maximum supported is 18")]
    InvalidDecimals,
    #[msg("Invalid mint authority for program controlled mint")]
    InvalidMintAuthority,
    #[msg("Invalid vault authority")]
    InvalidVaultAuthority,
    #[msg("Token mint mismatch")]
    MintMismatch,
    #[msg("Treasury token account is invalid")]
    InvalidTreasuryAccount,
    #[msg("Invalid treasury authority")]
    InvalidTreasuryAuthority,
    #[msg("Invalid or mismatched price account")]
    InvalidPriceAccount,
    #[msg("No recent price available from oracle")]
    PriceNotAvailable,
    #[msg("Oracle price is not positive")]
    InvalidPriceValue,
    #[msg("Amount too small after applying fees or conversions")]
    AmountTooSmall,
    #[msg("Reserve balance is zero")]
    ZeroReserve,
    #[msg("Supply is zero")]
    ZeroSupply,
    #[msg("Failed to borrow account data")]
    AccountDataBorrowFailed,
    #[msg("Invalid token account data")]
    InvalidTokenAccount,
    #[msg("Invalid mint account data")]
    InvalidMintAccount,
    #[msg("Value exceeds supported range")]
    ValueTooLarge,
    #[msg("Exponent exceeds supported range for pow10")]
    ExponentTooLarge,
    #[msg("Missing PDA bump")]
    MissingBump,
    #[msg("Invalid beta parameters")]
    InvalidBetaParam,
    #[msg("Invalid vault name")]
    InvalidVaultName,
}
