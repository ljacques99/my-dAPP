use anchor_lang::prelude::*;

declare_id!("HSh6ntCpps9Zfa9rsZjqYzEXpK3uXqEXY7iLegF9angR");

#[program]
pub mod solana_d_app {
    use super::*;
    // You can add new instructions here for your new user database logic

    pub fn register_user(ctx: Context<RegisterUser>) -> Result<()> {
        let user_account = &mut ctx.accounts.user_account;
        user_account.authority = ctx.accounts.authority.key();
        user_account.communities = Vec::new();
        msg!("Registering user: {}", ctx.accounts.authority.key());
        msg!("User PDA address: {}", ctx.accounts.user_account.key());
        Ok(())
    }
}

#[derive(Accounts)]
pub struct RegisterUser<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + 32 + 4 + (32 * 10), // 8 (discriminator) + 32 (pubkey) + 4 (vec len) + 10 * 32 (up to 10 communities, 32 bytes each)
        seeds = [b"user", authority.key().as_ref()],
        bump
    )]
    pub user_account: Account<'info, UserAccount>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[account]
pub struct UserAccount {
    pub authority: Pubkey,
    pub communities: Vec<String>,
}
