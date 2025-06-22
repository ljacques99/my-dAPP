import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SolanaDApp } from "../target/types/solana_d_app";
import { assert } from "chai";

describe("vote instruction", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const program = anchor.workspace.solanaDApp as Program<SolanaDApp>;
  const programId = new anchor.web3.PublicKey("Ho1P3APYbSz3DUZyjNiezxuVkGinLB9vkqAfLBfVM8Cm");

  const surveyTitle = "Favorite Color?";
  const surveyQuestions = "What is your favorite color?";
  const surveyAnswers = ["Red", "Blue", "Green", "Yellow"];

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

  it("allows a community member to vote before the limitdate", async () => {
    // Setup user and community
    const user = anchor.web3.Keypair.generate();
    const sig = await program.provider.connection.requestAirdrop(user.publicKey, 1e9);
    await program.provider.connection.confirmTransaction(sig);
    const [userPda] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("user"), user.publicKey.toBuffer()],
      programId
    );
    const [allCommunityPda] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("community"), Buffer.from("all")],
      programId
    );
    const uniqueCommunityName = "votecommunity" + user.publicKey.toBase58().slice(0, 4);
    // Register user
    const regIx = await program.methods
      .registerUser()
      .accounts({
        userAccount: userPda,
        authority: user.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
        allCommunity: allCommunityPda,
      })
      .instruction();
    await sendIx(regIx, user.publicKey, [user]);
    // Create community
    const [communityPda] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("community"), Buffer.from(uniqueCommunityName)],
      programId
    );
    const comIx = await program.methods
      .createCommunity(uniqueCommunityName)
      .accounts({
        communityAccount: communityPda,
        authority: user.publicKey,
        userAccount: userPda,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .instruction();
    await sendIx(comIx, user.publicKey, [user]);
    // Create survey with future limitdate
    const [surveyPda] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("survey"), Buffer.from(uniqueCommunityName), Buffer.from(surveyTitle)],
      programId
    );
    const now = Math.floor(Date.now() / 1000);
    const limitdate = now + 3600;
    const surveyIx = await program.methods
      .createSurvey(surveyTitle, surveyQuestions, surveyAnswers, new anchor.BN(limitdate))
      .accounts({
        communityAccount: communityPda,
        surveyAccount: surveyPda,
        authority: user.publicKey,
        userAccount: userPda,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .instruction();
    await sendIx(surveyIx, user.publicKey, [user]);
    // Vote for answer 1
    const voteIx = await program.methods
      .vote(1)
      .accounts({
        userAccount: userPda,
        surveyAccount: surveyPda,
        communityAccount: communityPda,
        authority: user.publicKey,
      })
      .instruction();
    await sendIx(voteIx, user.publicKey, [user]);
    // Check vote count
    const survey = await program.account.surveyAccount.fetch(surveyPda);
    assert.equal(survey.answers[1].votes, 1);
  });

  it("blocks voting after the limitdate", async () => {
    // Setup user and community
    const user = anchor.web3.Keypair.generate();
    const sig = await program.provider.connection.requestAirdrop(user.publicKey, 1e9);
    await program.provider.connection.confirmTransaction(sig);
    const [userPda] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("user"), user.publicKey.toBuffer()],
      programId
    );
    const [allCommunityPda] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("community"), Buffer.from("all")],
      programId
    );
    const uniqueCommunityName = "votecommunity" + user.publicKey.toBase58().slice(0, 4);
    // Register user
    const regIx = await program.methods
      .registerUser()
      .accounts({
        userAccount: userPda,
        authority: user.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
        allCommunity: allCommunityPda,
      })
      .instruction();
    await sendIx(regIx, user.publicKey, [user]);
    // Create community
    const [communityPda] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("community"), Buffer.from(uniqueCommunityName)],
      programId
    );
    const comIx = await program.methods
      .createCommunity(uniqueCommunityName)
      .accounts({
        communityAccount: communityPda,
        authority: user.publicKey,
        userAccount: userPda,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .instruction();
    await sendIx(comIx, user.publicKey, [user]);
    // Create survey with limitdate 2 seconds in the future
    const [surveyPda] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("survey"), Buffer.from(uniqueCommunityName), Buffer.from(surveyTitle)],
      programId
    );
    const now = Math.floor(Date.now() / 1000);
    const limitdate = now + 2;
    const surveyIx = await program.methods
      .createSurvey(surveyTitle, surveyQuestions, surveyAnswers, new anchor.BN(limitdate))
      .accounts({
        communityAccount: communityPda,
        surveyAccount: surveyPda,
        authority: user.publicKey,
        userAccount: userPda,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .instruction();
    await sendIx(surveyIx, user.publicKey, [user]);
    // Wait 2.5 seconds so the limitdate is passed
    await new Promise(res => setTimeout(res, 2500));
    // Try to vote (should fail)
    const voteIx = await program.methods
      .vote(1)
      .accounts({
        userAccount: userPda,
        surveyAccount: surveyPda,
        communityAccount: communityPda,
        authority: user.publicKey,
      })
      .instruction();
    try {
      await sendIx(voteIx, user.publicKey, [user]);
      assert.fail("Vote should have failed due to limitdate");
    } catch (e) {
      console.log('Expected error message:', e.message);
      assert.include(e.message, "Voting is closed");
    }
  });

  it("blocks voting if user is not a member of the community", async () => {
    // Setup two users
    const user1 = anchor.web3.Keypair.generate();
    const user2 = anchor.web3.Keypair.generate();
    const sig1 = await program.provider.connection.requestAirdrop(user1.publicKey, 1e9);
    await program.provider.connection.confirmTransaction(sig1);
    const sig2 = await program.provider.connection.requestAirdrop(user2.publicKey, 1e9);
    await program.provider.connection.confirmTransaction(sig2);
    const [user1Pda] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("user"), user1.publicKey.toBuffer()],
      programId
    );
    const [user2Pda] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("user"), user2.publicKey.toBuffer()],
      programId
    );
    const [allCommunityPda] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("community"), Buffer.from("all")],
      programId
    );
    const uniqueCommunityName = "votecommunity" + user1.publicKey.toBase58().slice(0, 4);
    // Register both users
    const regIx1 = await program.methods
      .registerUser()
      .accounts({
        userAccount: user1Pda,
        authority: user1.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
        allCommunity: allCommunityPda,
      })
      .instruction();
    await sendIx(regIx1, user1.publicKey, [user1]);
    const regIx2 = await program.methods
      .registerUser()
      .accounts({
        userAccount: user2Pda,
        authority: user2.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
        allCommunity: allCommunityPda,
      })
      .instruction();
    await sendIx(regIx2, user2.publicKey, [user2]);
    // Create community with user1
    const [communityPda] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("community"), Buffer.from(uniqueCommunityName)],
      programId
    );
    const comIx = await program.methods
      .createCommunity(uniqueCommunityName)
      .accounts({
        communityAccount: communityPda,
        authority: user1.publicKey,
        userAccount: user1Pda,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .instruction();
    await sendIx(comIx, user1.publicKey, [user1]);
    // Create survey with user1
    const [surveyPda] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("survey"), Buffer.from(uniqueCommunityName), Buffer.from(surveyTitle)],
      programId
    );
    const now = Math.floor(Date.now() / 1000);
    const limitdate = now + 3600;
    const surveyIx = await program.methods
      .createSurvey(surveyTitle, surveyQuestions, surveyAnswers, new anchor.BN(limitdate))
      .accounts({
        communityAccount: communityPda,
        surveyAccount: surveyPda,
        authority: user1.publicKey,
        userAccount: user1Pda,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .instruction();
    await sendIx(surveyIx, user1.publicKey, [user1]);
    // Try to vote with user2 (should fail)
    const voteIx = await program.methods
      .vote(1)
      .accounts({
        userAccount: user2Pda,
        surveyAccount: surveyPda,
        communityAccount: communityPda,
        authority: user2.publicKey,
      })
      .instruction();
    try {
      await sendIx(voteIx, user2.publicKey, [user2]);
      assert.fail("Vote should have failed because user is not a member");
    } catch (e) {
      console.log('Expected error message:', e.message);
      assert.include(e.message, "not a member");
    }
  });

  it("blocks a user from voting twice on the same survey", async () => {
    // Setup user and community
    const user = anchor.web3.Keypair.generate();
    const sig = await program.provider.connection.requestAirdrop(user.publicKey, 1e9);
    await program.provider.connection.confirmTransaction(sig);
    const [userPda] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("user"), user.publicKey.toBuffer()],
      programId
    );
    const [allCommunityPda] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("community"), Buffer.from("all")],
      programId
    );
    const uniqueCommunityName = "votecommunity" + user.publicKey.toBase58().slice(0, 4);
    // Register user
    const regIx = await program.methods
      .registerUser()
      .accounts({
        userAccount: userPda,
        authority: user.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
        allCommunity: allCommunityPda,
      })
      .instruction();
    await sendIx(regIx, user.publicKey, [user]);
    // Create community
    const [communityPda] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("community"), Buffer.from(uniqueCommunityName)],
      programId
    );
    const comIx = await program.methods
      .createCommunity(uniqueCommunityName)
      .accounts({
        communityAccount: communityPda,
        authority: user.publicKey,
        userAccount: userPda,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .instruction();
    await sendIx(comIx, user.publicKey, [user]);
    // Create survey
    const [surveyPda] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("survey"), Buffer.from(uniqueCommunityName), Buffer.from(surveyTitle)],
      programId
    );
    const now = Math.floor(Date.now() / 1000);
    const limitdate = now + 3600;
    const surveyIx = await program.methods
      .createSurvey(surveyTitle, surveyQuestions, surveyAnswers, new anchor.BN(limitdate))
      .accounts({
        communityAccount: communityPda,
        surveyAccount: surveyPda,
        authority: user.publicKey,
        userAccount: userPda,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .instruction();
    await sendIx(surveyIx, user.publicKey, [user]);
    // First vote
    const [voteRecordPda] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("vote"), surveyPda.toBuffer(), user.publicKey.toBuffer()],
      programId
    );
    const voteIx = await program.methods
      .vote(1)
      .accounts({
        userAccount: userPda,
        surveyAccount: surveyPda,
        communityAccount: communityPda,
        authority: user.publicKey,
        voteRecord: voteRecordPda,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .instruction();
    await sendIx(voteIx, user.publicKey, [user]);
    // Second vote (should fail)
    try {
      const voteIx2 = await program.methods
        .vote(2)
        .accounts({
          userAccount: userPda,
          surveyAccount: surveyPda,
          communityAccount: communityPda,
          authority: user.publicKey,
          voteRecord: voteRecordPda,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .instruction();
      await sendIx(voteIx2, user.publicKey, [user]);
      assert.fail("Second vote should have failed");
    } catch (e) {
      console.log('Expected error message:', e.message);
      assert.include(e.message, "already in use"); // Anchor error for PDA already exists
    }
  });
}); 