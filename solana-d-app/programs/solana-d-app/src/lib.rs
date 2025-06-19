use anchor_lang::prelude::*;

// Maximum number of communities per user
const MAX_COMMUNITIES_PER_USER: usize = 10;

declare_id!("HSh6ntCpps9Zfa9rsZjqYzEXpK3uXqEXY7iLegF9angR");

#[program]
pub mod solana_d_app {
    use super::*;
    // You can add new instructions here for your new user database logic

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let community_account = &mut ctx.accounts.community_account;
        community_account.name = "all".to_string();
        community_account.authority = ctx.accounts.authority.key();
        msg!("'all' community created at PDA: {}", community_account.key());
        Ok(())
    }

    pub fn register_user(ctx: Context<RegisterUser>) -> Result<()> {
        let user_account = &mut ctx.accounts.user_account;
        user_account.authority = ctx.accounts.authority.key();
        user_account.communities = Vec::new();
        
        // Add the 'all' community to the user's communities
        let all_community_pda = ctx.accounts.all_community.key();
        let all_community = Community {
            name: "all".to_string(),
            pda_address: all_community_pda,
        };
        user_account.communities.push(all_community);
        
        msg!("Registering user: {}", ctx.accounts.authority.key());
        msg!("User PDA address: {}", ctx.accounts.user_account.key());
        msg!("Added 'all' community to user's communities, with address {}", all_community_pda);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + 32 + (4 + 3), // discriminator + authority + name("all")
        seeds = [b"community", b"all".as_ref()],
        bump
    )]
    pub community_account: Account<'info, CommunityAccount>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RegisterUser<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + 32 + 4 + (MAX_COMMUNITIES_PER_USER * (4 + 32 + 32)), // Max communities
        seeds = [b"user", authority.key().as_ref()],
        bump
    )]
    pub user_account: Account<'info, UserAccount>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
    /// CHECK: This is the 'all' community account that should already exist
    pub all_community: Account<'info, CommunityAccount>,
}

#[account]
pub struct UserAccount {
    pub authority: Pubkey,
    pub communities: Vec<Community>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct Community {
    pub name: String,
    pub pda_address: Pubkey,
}

#[account]
pub struct CommunityAccount {
    pub name: String,
    pub authority: Pubkey,
}
