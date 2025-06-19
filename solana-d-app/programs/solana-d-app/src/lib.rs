use anchor_lang::prelude::*;

// Maximum number of users
const MAX_USERS: usize = 200;

declare_id!("HSh6ntCpps9Zfa9rsZjqYzEXpK3uXqEXY7iLegF9angR");

#[program]
pub mod solana_d_app {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let user_list = &mut ctx.accounts.user_list;
        user_list.users = Vec::new();
        Ok(())
    }

    pub fn register_user(ctx: Context<RegisterUser>) -> Result<()> {
        let user_list = &mut ctx.accounts.user_list;
        let user = ctx.accounts.user.key();
        // Check if user is already registered
        if user_list.users.contains(&user) {
            return err!(ErrorCode::UserAlreadyRegistered);
        }
        // Check if list is full
        if user_list.users.len() >= MAX_USERS {
            return err!(ErrorCode::UserListFull);
        }
        user_list.users.push(user);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = payer,
        space = 8 + 4 + (MAX_USERS * 32),
        seeds = [b"user-list"],
        bump
    )]
    pub user_list: Account<'info, UserList>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RegisterUser<'info> {
    #[account(mut)]
    pub user_list: Account<'info, UserList>,
    /// CHECK: This is safe because we only use the public key for registration and require the user to be a signer.
    #[account(signer)]
    pub user: AccountInfo<'info>,
}

#[account]
pub struct UserList {
    pub users: Vec<Pubkey>,
}

#[error_code]
pub enum ErrorCode {
    #[msg("User is already registered.")]
    UserAlreadyRegistered,
    #[msg("User list is full.")]
    UserListFull,
}
