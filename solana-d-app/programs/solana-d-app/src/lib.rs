use anchor_lang::prelude::*;

// Maximum number of communities per user
const MAX_COMMUNITIES_PER_USER: usize = 10;
// Maximum number of surveys per community
const MAX_SURVEYS_PER_COMMUNITY: usize = 5;

declare_id!("HSh6ntCpps9Zfa9rsZjqYzEXpK3uXqEXY7iLegF9angR");

#[program]
pub mod solana_d_app {
    use super::*;
    // You can add new instructions here for your new user database logic

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let community_account = &mut ctx.accounts.community_account;
        community_account.name = "all".to_string();
        community_account.authority = ctx.accounts.authority.key();
        community_account.surveys = Vec::new();
        msg!("'all' community created at PDA: {}", community_account.key());
        Ok(())
    }

    pub fn register_user(ctx: Context<RegisterUser>) -> Result<()> {
        let user_account = &mut ctx.accounts.user_account;
        user_account.authority = ctx.accounts.authority.key();
        user_account.communities = Vec::new();
        
        // Add the 'all' community reference to the user's communities
        let all_community_pda = ctx.accounts.all_community.key();
        let all_community_ref = CommunityRef {
            name: "all".to_string(),
            pda_address: all_community_pda,
        };
        user_account.communities.push(all_community_ref);
        
        msg!("Registering user: {}", ctx.accounts.authority.key());
        msg!("User PDA address: {}", ctx.accounts.user_account.key());
        msg!("Added 'all' community to user's communities, with address {}", all_community_pda);
        Ok(())
    }

    pub fn create_community(ctx: Context<CreateCommunity>, name: String) -> Result<()> {
        let community_account = &mut ctx.accounts.community_account;
        community_account.name = name.clone();
        community_account.authority = ctx.accounts.authority.key();
        community_account.surveys = Vec::new();
        
        msg!("Community '{}' created at PDA: {}", community_account.name, community_account.key());
        msg!("Authority: {}", community_account.authority);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + 32 + (4 + 3) + 4 + (MAX_SURVEYS_PER_COMMUNITY * (4 + 50)), // discriminator + authority + name("all") + surveys vec + max surveys
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
        space = 8 + 32 + 4 + (MAX_COMMUNITIES_PER_USER * (4 + 32 + 32)), // Max community references
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

#[derive(Accounts)]
#[instruction(name: String)]
pub struct CreateCommunity<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + (4 + name.len()) + 32 + 4 + (MAX_SURVEYS_PER_COMMUNITY * (4 + 50)), // discriminator + name + authority + surveys vec + max surveys
        seeds = [b"community", name.as_bytes()],
        bump
    )]
    pub community_account: Account<'info, CommunityAccount>,
    #[account(mut)]
    pub authority: Signer<'info>,
    /// CHECK: This ensures the user is registered before creating a community
    #[account(
        seeds = [b"user", authority.key().as_ref()],
        bump,
        constraint = user_account.authority == authority.key()
    )]
    pub user_account: Account<'info, UserAccount>,
    pub system_program: Program<'info, System>,
}

#[account]
pub struct UserAccount {
    pub authority: Pubkey,
    pub communities: Vec<CommunityRef>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct CommunityRef {
    pub name: String,
    pub pda_address: Pubkey,
}

#[account]
pub struct CommunityAccount {
    pub name: String,
    pub authority: Pubkey,
    pub surveys: Vec<String>,
}
