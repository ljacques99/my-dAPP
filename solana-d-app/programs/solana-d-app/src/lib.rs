use anchor_lang::prelude::*;
use anchor_lang::solana_program::account_info::AccountInfo;
use anchor_lang::solana_program::system_program;

// Maximum number of communities per user
const MAX_COMMUNITIES_PER_USER: usize = 10;
// Maximum number of surveys per community
const MAX_SURVEYS_PER_COMMUNITY: usize = 5;
// Maximum length of survey title
const MAX_SURVEY_TITLE_LENGTH: usize = 30; // tests based on 30
// Maximum length of survey question
const MAX_SURVEY_QUESTION_LENGTH: usize = 200;
// Maximum length of survey answer
const MAX_SURVEY_ANSWER_LENGTH: usize = 50;

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
        
        // Initialize program configuration
        let program_config = &mut ctx.accounts.program_config;
        program_config.max_survey_title_length = MAX_SURVEY_TITLE_LENGTH as u8;
        program_config.max_survey_question_length = MAX_SURVEY_QUESTION_LENGTH as u16;
        program_config.max_survey_answer_length = MAX_SURVEY_ANSWER_LENGTH as u8;
        msg!("Program configuration initialized with max title: {}, max question: {}, max answer: {}", 
             program_config.max_survey_title_length, 
             program_config.max_survey_question_length, 
             program_config.max_survey_answer_length);
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
        let user_account = &mut ctx.accounts.user_account;
        
        community_account.name = name.clone();
        community_account.authority = ctx.accounts.authority.key();
        community_account.surveys = Vec::new();
        
        // Add the community reference to the creator's communities
        let community_ref = CommunityRef {
            name: name.clone(),
            pda_address: community_account.key(),
        };
        user_account.communities.push(community_ref);
        
        msg!("Community '{}' created at PDA: {}", community_account.name, community_account.key());
        msg!("Authority: {}", community_account.authority);
        msg!("Creator automatically joined the community");
        Ok(())
    }

    pub fn join_community(ctx: Context<JoinCommunity>) -> Result<()> {
        let user_account = &mut ctx.accounts.user_account;
        let community_account = &ctx.accounts.community_account;
        
        // Check if user is already a member of this community
        for community_ref in &user_account.communities {
            if community_ref.pda_address == community_account.key() {
                return err!(ErrorCode::AlreadyMember);
            }
        }
        
        // Check if user has reached the maximum number of communities
        if user_account.communities.len() >= MAX_COMMUNITIES_PER_USER {
            return err!(ErrorCode::TooManyCommunities);
        }
        
        // Add the community reference to the user's communities
        let community_ref = CommunityRef {
            name: community_account.name.clone(),
            pda_address: community_account.key(),
        };
        user_account.communities.push(community_ref);
        
        msg!("User {} joined community '{}'", ctx.accounts.authority.key(), community_account.name);
        Ok(())
    }

    pub fn create_survey(
        ctx: Context<CreateSurvey>,
        title: String,
        questions: String,
        answers: Vec<String>, // Should be max 4
        limitdate: i64,
    ) -> Result<()> {
        // Check that the user is a member of the community
        let user_account = &ctx.accounts.user_account;
        let community_account = &ctx.accounts.community_account;
        let is_member = user_account.communities.iter().any(|c| c.pda_address == community_account.key());
        require!(is_member, ErrorCode::NotMemberOfCommunity);

        // Check survey title length
        require!(title.len() <= MAX_SURVEY_TITLE_LENGTH, ErrorCode::SurveyTitleTooLong);

        // Check survey question length
        require!(questions.len() <= MAX_SURVEY_QUESTION_LENGTH, ErrorCode::SurveyQuestionTooLong);

        // Check survey answers length
        for answer in &answers {
            require!(answer.len() <= MAX_SURVEY_ANSWER_LENGTH, ErrorCode::SurveyAnswerTooLong);
        }

        require!(answers.len() <= 4, ErrorCode::TooManyAnswers);
        let now = Clock::get()?.unix_timestamp;
        require!(limitdate > now, ErrorCode::LimitDateInPast);
        let survey_account = &mut ctx.accounts.survey_account;
        survey_account.title = title.clone();
        survey_account.community_name = ctx.accounts.community_account.name.clone();
        survey_account.questions = questions;
        survey_account.answers = answers
            .into_iter()
            .map(|text| Answer { text, votes: 0 })
            .collect();
        survey_account.limitdate = limitdate;

        // Add survey reference to community
        let community_account = &mut ctx.accounts.community_account;
        community_account.surveys.push(title.clone());
        msg!("Survey '{}' created for community '{}' at PDA: {}", title, community_account.name, survey_account.key());
        Ok(())
    }

    pub fn vote(
        ctx: Context<Vote>,
        answer_index: u8,
    ) -> Result<()> {
        let user_account = &ctx.accounts.user_account;
        let survey_account = &mut ctx.accounts.survey_account;
        let community_account = &ctx.accounts.community_account;
        let authority_key = ctx.accounts.authority.key();
        let vote_record = &mut ctx.accounts.vote_record;

        // Check user is a member of the community
        let is_member = user_account.communities.iter().any(|c| c.pda_address == community_account.key());
        require!(is_member, ErrorCode::NotMemberOfCommunity);

        // Check survey is linked to the community
        require!(survey_account.community_name == community_account.name, ErrorCode::SurveyNotInCommunity);

        // Check time is before limitdate
        let now = Clock::get()?.unix_timestamp;
        require!(now < survey_account.limitdate, ErrorCode::VotingClosed);

        // Check answer_index is valid
        require!((answer_index as usize) < survey_account.answers.len(), ErrorCode::InvalidAnswerIndex);

        // No explicit check for already voted; rely on Anchor's PDA init error
        survey_account.answers[answer_index as usize].votes += 1;
        vote_record.voter = authority_key;
        Ok(())
    }

    pub fn delete_survey(ctx: Context<DeleteSurvey>) -> Result<()> {
        let community_account = &mut ctx.accounts.community_account;
        let survey_account = &mut ctx.accounts.survey_account;
        let authority_key = ctx.accounts.authority.key();

        // Check that the authority is the community authority
        require!(community_account.authority == authority_key, ErrorCode::NotCommunityAuthority);

        // Check survey is linked to the community
        require!(survey_account.community_name == community_account.name, ErrorCode::SurveyNotInCommunity);

        // Get survey title before mutable operations
        let survey_title = survey_account.title.clone();

        // Remove the survey title from the community's surveys list
        let survey_index = community_account.surveys.iter().position(|s| s == &survey_title);
        require!(survey_index.is_some(), ErrorCode::SurveyNotFoundInCommunity);
        community_account.surveys.remove(survey_index.unwrap());

        // Close the survey account and return rent to the authority
        let survey_account_info = &mut ctx.accounts.survey_account.to_account_info();
        let authority_info = &ctx.accounts.authority.to_account_info();
        let dest_starting_lamports = authority_info.lamports();
        **authority_info.lamports.borrow_mut() = dest_starting_lamports
            .checked_add(survey_account_info.lamports())
            .unwrap();
        **survey_account_info.lamports.borrow_mut() = 0;
        survey_account_info.assign(&system_program::ID);
        survey_account_info.realloc(0, false)?;

        msg!("Survey '{}' deleted from community '{}' and account closed", survey_title, community_account.name);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + 32 + (4 + 3) + 4 + (MAX_SURVEYS_PER_COMMUNITY * (4 + MAX_SURVEY_TITLE_LENGTH)), // discriminator + authority + name("all") + surveys vec + max survey titles (30 chars each)
        seeds = [b"community", b"all".as_ref()],
        bump
    )]
    pub community_account: Account<'info, CommunityAccount>,
    #[account(
        init,
        payer = authority,
        space = 8 + 1 + 2 + 1, // discriminator + max_survey_title_length (u8) + max_survey_question_length (u16) + max_survey_answer_length (u8)
        seeds = [b"program_config"],
        bump
    )]
    pub program_config: Account<'info, ProgramConfig>,
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
        space = 8 + (4 + name.len()) + 32 + 4 + (MAX_SURVEYS_PER_COMMUNITY * (4 + MAX_SURVEY_TITLE_LENGTH)), // discriminator + name + authority + surveys vec + max survey titles (30 chars each)
        seeds = [b"community", name.as_bytes()],
        bump
    )]
    pub community_account: Account<'info, CommunityAccount>,
    #[account(mut)]
    pub authority: Signer<'info>,
    /// CHECK: This ensures the user is registered before creating a community
    #[account(
        mut,
        seeds = [b"user", authority.key().as_ref()],
        bump,
        constraint = user_account.authority == authority.key()
    )]
    pub user_account: Account<'info, UserAccount>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct JoinCommunity<'info> {
    #[account(
        mut,
        seeds = [b"user", authority.key().as_ref()],
        bump,
        constraint = user_account.authority == authority.key()
    )]
    pub user_account: Account<'info, UserAccount>,
    /// CHECK: This is the community account to join - must exist and be initialized
    #[account(
        constraint = community_account.name.len() > 0
    )]
    pub community_account: Account<'info, CommunityAccount>,
    #[account(signer)]
    pub authority: Signer<'info>,
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
    pub surveys: Vec<String>, // Just store survey titles as strings
}

#[account]
pub struct SurveyAccount {
    pub title: String,
    pub community_name: String,
    pub questions: String,
    pub answers: Vec<Answer>, // max 4
    pub limitdate: i64, // Unix timestamp
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct Answer {
    pub text: String,
    pub votes: u32,
}

#[account]
pub struct VoteRecord {
    pub voter: Pubkey,
}

#[account]
pub struct ProgramConfig {
    pub max_survey_title_length: u8,
    pub max_survey_question_length: u16,
    pub max_survey_answer_length: u8,
}

#[error_code]
pub enum ErrorCode {
    #[msg("User is already a member of this community.")]
    AlreadyMember,
    #[msg("User has reached the maximum number of communities.")]
    TooManyCommunities,
    #[msg("Too many answers provided (max 4).")]
    TooManyAnswers,
    #[msg("Limit date must be in the future.")]
    LimitDateInPast,
    #[msg("User is not a member of the community.")]
    NotMemberOfCommunity,
    #[msg("Survey is not linked to the community.")]
    SurveyNotInCommunity,
    #[msg("Voting is closed for this survey.")]
    VotingClosed,
    #[msg("Invalid answer index.")]
    InvalidAnswerIndex,
    #[msg("Survey title is too long.")]
    SurveyTitleTooLong,
    #[msg("Survey question is too long.")]
    SurveyQuestionTooLong,
    #[msg("Survey answer is too long.")]
    SurveyAnswerTooLong,
    #[msg("Authority is not the community authority.")]
    NotCommunityAuthority,
    #[msg("Survey not found in community.")]
    SurveyNotFoundInCommunity,
}

#[derive(Accounts)]
#[instruction(title: String, questions: String, answers: Vec<String>, limitdate: i64)]
pub struct CreateSurvey<'info> {
    #[account(
        mut,
        seeds = [b"community", community_account.name.as_bytes()],
        bump
    )]
    pub community_account: Account<'info, CommunityAccount>,
    #[account(
        init,
        payer = authority,
        space = 8 + (4 + MAX_SURVEY_TITLE_LENGTH) + (4 + 50) + (4 + MAX_SURVEY_QUESTION_LENGTH) + 4 + (4 * (4 + MAX_SURVEY_ANSWER_LENGTH + 4)) + 8, // discriminator + title (30 chars) + community_name + questions (200 chars) + answers vec (max 4 answers, 50 chars each) + limitdate
        seeds = [b"survey", community_account.name.as_bytes(), title.as_bytes()],
        bump
    )]
    pub survey_account: Account<'info, SurveyAccount>,
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        mut,
        seeds = [b"user", authority.key().as_ref()],
        bump,
        constraint = user_account.authority == authority.key()
    )]
    pub user_account: Account<'info, UserAccount>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Vote<'info> {
    #[account(mut)]
    pub user_account: Account<'info, UserAccount>,
    #[account(mut)]
    pub survey_account: Account<'info, SurveyAccount>,
    pub community_account: Account<'info, CommunityAccount>,
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        init,
        payer = authority,
        space = 8 + 32, // discriminator + voter pubkey
        seeds = [b"vote", survey_account.key().as_ref(), authority.key().as_ref()],
        bump
    )]
    pub vote_record: Account<'info, VoteRecord>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DeleteSurvey<'info> {
    #[account(mut)]
    pub community_account: Account<'info, CommunityAccount>,
    #[account(
        mut,
        constraint = survey_account.community_name == community_account.name
    )]
    pub survey_account: Account<'info, SurveyAccount>,
    #[account(signer)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}
