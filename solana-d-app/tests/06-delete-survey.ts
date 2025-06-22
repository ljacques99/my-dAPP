import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SolanaDApp } from "../target/types/solana_d_app";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { expect } from "chai";

describe("delete-survey", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.SolanaDApp as Program<SolanaDApp>;
  const programId = new anchor.web3.PublicKey("Ho1P3APYbSz3DUZyjNiezxuVkGinLB9vkqAfLBfVM8Cm");

  async function sendIx(ix: anchor.web3.TransactionInstruction, feePayer: anchor.web3.PublicKey, signers: anchor.web3.Keypair[]) {
    const tx = new anchor.web3.Transaction().add(ix);
    tx.feePayer = feePayer;
    const latestBlockhash = await program.provider.connection.getLatestBlockhash();
    tx.recentBlockhash = latestBlockhash.blockhash;
    const sig = await anchor.web3.sendAndConfirmTransaction(
      program.provider.connection,
      tx,
      signers
    );
    console.log('Transaction signature:', sig);
  }

  it("Should register user, create community, create survey, and delete survey", async () => {
    // Generate unique keypairs
    const user = Keypair.generate();
    const communityCreator = Keypair.generate();
    
    // Airdrop SOL to both users
    const userAirdropSig = await provider.connection.requestAirdrop(user.publicKey, 10 * anchor.web3.LAMPORTS_PER_SOL);
    await provider.connection.confirmTransaction(userAirdropSig);
    
    const creatorAirdropSig = await provider.connection.requestAirdrop(communityCreator.publicKey, 10 * anchor.web3.LAMPORTS_PER_SOL);
    await provider.connection.confirmTransaction(creatorAirdropSig);

    // Find PDAs with unique names using findProgramAddress
    const [userAccount] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("user"), user.publicKey.toBuffer()],
      programId
    );

    const [communityCreatorAccount] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("user"), communityCreator.publicKey.toBuffer()],
      programId
    );

    const communityName = "deletecommunity";
    const uniqueCommunityName = communityName + user.publicKey.toBase58().slice(0, 4);
    const [communityAccount] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("community"), Buffer.from(uniqueCommunityName)],
      programId
    );

    const uniqueSurveyTitle = "Title" + user.publicKey.toBase58().slice(0, 4);
    const [surveyAccount] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("survey"), Buffer.from(uniqueCommunityName), Buffer.from(uniqueSurveyTitle)],
      programId
    );

    const [allCommunity] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("community"), Buffer.from("all")],
      programId
    );

    // Step 1: Register user
    const registerIx = await program.methods
      .registerUser()
      .accounts({
        userAccount: userAccount,
        authority: user.publicKey,
        systemProgram: SystemProgram.programId,
        allCommunity: allCommunity,
      })
      .instruction();
    await sendIx(registerIx, user.publicKey, [user]);

    // Step 1.5: Register community creator as user
    const registerCreatorIx = await program.methods
      .registerUser()
      .accounts({
        userAccount: communityCreatorAccount,
        authority: communityCreator.publicKey,
        systemProgram: SystemProgram.programId,
        allCommunity: allCommunity,
      })
      .instruction();
    await sendIx(registerCreatorIx, communityCreator.publicKey, [communityCreator]);

    // Step 2: Create community (communityCreator becomes the authority)
    const createCommunityIx = await program.methods
      .createCommunity(uniqueCommunityName)
      .accounts({
        communityAccount: communityAccount,
        authority: communityCreator.publicKey,
        userAccount: communityCreatorAccount,
        systemProgram: SystemProgram.programId,
      })
      .instruction();
    await sendIx(createCommunityIx, communityCreator.publicKey, [communityCreator]);

    // Step 2.5: User joins the community
    const joinCommunityIx = await program.methods
      .joinCommunity()
      .accounts({
        userAccount: userAccount,
        communityAccount: communityAccount,
        authority: user.publicKey,
      })
      .instruction();
    await sendIx(joinCommunityIx, user.publicKey, [user]);

    // Step 3: Create survey
    const futureDate = Math.floor(Date.now() / 1000) + 86400;
    const createSurveyIx = await program.methods
      .createSurvey(
        uniqueSurveyTitle,
        "What is your favorite color?",
        ["Red", "Blue", "Green", "Yellow"],
        new anchor.BN(futureDate)
      )
      .accounts({
        communityAccount: communityAccount,
        surveyAccount: surveyAccount,
        authority: user.publicKey,
        userAccount: userAccount,
        systemProgram: SystemProgram.programId,
      })
      .instruction();
    await sendIx(createSurveyIx, user.publicKey, [user]);

    // Step 4: Verify survey was created
    const surveyAccountData = await program.account.surveyAccount.fetch(surveyAccount);
    expect(surveyAccountData.title).to.equal(uniqueSurveyTitle);
    expect(surveyAccountData.communityName).to.equal(uniqueCommunityName);

    const communityAccountData = await program.account.communityAccount.fetch(communityAccount);
    expect(communityAccountData.surveys).to.include(uniqueSurveyTitle);

    // Step 5: Delete survey (communityCreator is the authority)
    const initialBalance = await provider.connection.getBalance(communityCreator.publicKey);
    
    const deleteSurveyIx = await program.methods
      .deleteSurvey()
      .accounts({
        communityAccount: communityAccount,
        surveyAccount: surveyAccount,
        authority: communityCreator.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .instruction();
    await sendIx(deleteSurveyIx, communityCreator.publicKey, [communityCreator]);

    // Step 6: Verify survey is deleted from community list
    const updatedCommunityData = await program.account.communityAccount.fetch(communityAccount);
    expect(updatedCommunityData.surveys).to.not.include(uniqueSurveyTitle);

    // Step 7: Verify survey PDA is closed
    try {
      await program.account.surveyAccount.fetch(surveyAccount);
      expect.fail("Survey account should be closed");
    } catch (error) {
      expect(error.message).to.include("Account does not exist");
    }

    // Step 8: Verify rent was returned to community creator
    const finalBalance = await provider.connection.getBalance(communityCreator.publicKey);
    expect(finalBalance).to.be.greaterThan(initialBalance);
  });

  it("Should block non-community authority from deleting survey", async () => {
    // Generate unique keypairs
    const user = Keypair.generate();
    const communityCreator = Keypair.generate();
    const unauthorizedUser = Keypair.generate();
    
    // Airdrop SOL to all users
    const userAirdropSig = await provider.connection.requestAirdrop(user.publicKey, 10 * anchor.web3.LAMPORTS_PER_SOL);
    await provider.connection.confirmTransaction(userAirdropSig);
    
    const creatorAirdropSig = await provider.connection.requestAirdrop(communityCreator.publicKey, 10 * anchor.web3.LAMPORTS_PER_SOL);
    await provider.connection.confirmTransaction(creatorAirdropSig);

    const unauthorizedAirdropSig = await provider.connection.requestAirdrop(unauthorizedUser.publicKey, 10 * anchor.web3.LAMPORTS_PER_SOL);
    await provider.connection.confirmTransaction(unauthorizedAirdropSig);

    // Find PDAs with unique names using findProgramAddress
    const [userAccount] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("user"), user.publicKey.toBuffer()],
      programId
    );

    const [communityCreatorAccount] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("user"), communityCreator.publicKey.toBuffer()],
      programId
    );

    const [unauthorizedUserAccount] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("user"), unauthorizedUser.publicKey.toBuffer()],
      programId
    );

    const communityName = "blockcommunity";
    const uniqueCommunityName = communityName + user.publicKey.toBase58().slice(0, 4);
    const [communityAccount] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("community"), Buffer.from(uniqueCommunityName)],
      programId
    );

    const uniqueSurveyTitle = "Title" + user.publicKey.toBase58().slice(0, 4);
    const [surveyAccount] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("survey"), Buffer.from(uniqueCommunityName), Buffer.from(uniqueSurveyTitle)],
      programId
    );

    const [allCommunity] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("community"), Buffer.from("all")],
      programId
    );

    // Step 1: Register all users
    const registerIx = await program.methods
      .registerUser()
      .accounts({
        userAccount: userAccount,
        authority: user.publicKey,
        systemProgram: SystemProgram.programId,
        allCommunity: allCommunity,
      })
      .instruction();
    await sendIx(registerIx, user.publicKey, [user]);

    const registerCreatorIx = await program.methods
      .registerUser()
      .accounts({
        userAccount: communityCreatorAccount,
        authority: communityCreator.publicKey,
        systemProgram: SystemProgram.programId,
        allCommunity: allCommunity,
      })
      .instruction();
    await sendIx(registerCreatorIx, communityCreator.publicKey, [communityCreator]);

    const registerUnauthorizedIx = await program.methods
      .registerUser()
      .accounts({
        userAccount: unauthorizedUserAccount,
        authority: unauthorizedUser.publicKey,
        systemProgram: SystemProgram.programId,
        allCommunity: allCommunity,
      })
      .instruction();
    await sendIx(registerUnauthorizedIx, unauthorizedUser.publicKey, [unauthorizedUser]);

    // Step 2: Create community (communityCreator becomes the authority)
    const createCommunityIx = await program.methods
      .createCommunity(uniqueCommunityName)
      .accounts({
        communityAccount: communityAccount,
        authority: communityCreator.publicKey,
        userAccount: communityCreatorAccount,
        systemProgram: SystemProgram.programId,
      })
      .instruction();
    await sendIx(createCommunityIx, communityCreator.publicKey, [communityCreator]);

    // Step 3: User joins the community
    const joinCommunityIx = await program.methods
      .joinCommunity()
      .accounts({
        userAccount: userAccount,
        communityAccount: communityAccount,
        authority: user.publicKey,
      })
      .instruction();
    await sendIx(joinCommunityIx, user.publicKey, [user]);

    // Step 4: Create survey
    const futureDate = Math.floor(Date.now() / 1000) + 86400;
    const createSurveyIx = await program.methods
      .createSurvey(
        uniqueSurveyTitle,
        "What is your favorite color?",
        ["Red", "Blue", "Green", "Yellow"],
        new anchor.BN(futureDate)
      )
      .accounts({
        communityAccount: communityAccount,
        surveyAccount: surveyAccount,
        authority: user.publicKey,
        userAccount: userAccount,
        systemProgram: SystemProgram.programId,
      })
      .instruction();
    await sendIx(createSurveyIx, user.publicKey, [user]);

    // Step 5: Verify survey was created
    const surveyAccountData = await program.account.surveyAccount.fetch(surveyAccount);
    expect(surveyAccountData.title).to.equal(uniqueSurveyTitle);
    expect(surveyAccountData.communityName).to.equal(uniqueCommunityName);

    const communityAccountData = await program.account.communityAccount.fetch(communityAccount);
    expect(communityAccountData.surveys).to.include(uniqueSurveyTitle);

    // Step 6: Try to delete survey with unauthorized user (should fail)
    try {
      const deleteSurveyIx = await program.methods
        .deleteSurvey()
        .accounts({
          communityAccount: communityAccount,
          surveyAccount: surveyAccount,
          authority: unauthorizedUser.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .instruction();
      await sendIx(deleteSurveyIx, unauthorizedUser.publicKey, [unauthorizedUser]);
      expect.fail("Unauthorized user should not be able to delete survey");
    } catch (error) {
      console.log("❌ Survey deletion blocked for unauthorized user");
      console.log("Error message:", error.message);
      
      expect(error.message).to.include("Authority is not the community authority.");
    }

    // Step 7: Verify survey still exists and is unchanged
    const surveyAccountDataAfter = await program.account.surveyAccount.fetch(surveyAccount);
    expect(surveyAccountDataAfter.title).to.equal(uniqueSurveyTitle);
    expect(surveyAccountDataAfter.communityName).to.equal(uniqueCommunityName);

    const communityAccountDataAfter = await program.account.communityAccount.fetch(communityAccount);
    expect(communityAccountDataAfter.surveys).to.include(uniqueSurveyTitle);

    console.log("✅ Survey deletion properly blocked for unauthorized user");
  });
});
