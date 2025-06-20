import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SolanaDApp } from "../target/types/solana_d_app";
import { assert } from "chai";

describe("survey creation", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const program = anchor.workspace.solanaDApp as Program<SolanaDApp>;
  const programId = new anchor.web3.PublicKey("HSh6ntCpps9Zfa9rsZjqYzEXpK3uXqEXY7iLegF9angR");

  const communityName = "testcommunity";
  const surveyTitle = "Favorite Color?";
  const surveyQuestions = "What is your favorite color?";
  const surveyAnswers = ["Red", "Blue", "Green", "Yellow"];

  let user: anchor.web3.Keypair;
  let userPda: anchor.web3.PublicKey;
  let communityPda: anchor.web3.PublicKey;
  let surveyPda: anchor.web3.PublicKey;
  let uniqueCommunityName: string;

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

  it("registers a user", async () => {
    user = anchor.web3.Keypair.generate();
    // Airdrop SOL to the user for fees
    const sig = await program.provider.connection.requestAirdrop(user.publicKey, 1e9);
    await program.provider.connection.confirmTransaction(sig);
    [userPda] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("user"), user.publicKey.toBuffer()],
      programId
    );
    const [allCommunityPda] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("community"), Buffer.from("all")],
      programId
    );
    // Use first 4 digits of user address for unique community name
    uniqueCommunityName = communityName + user.publicKey.toBase58().slice(0, 4);
    const ix = await program.methods
      .registerUser()
      .accounts({
        userAccount: userPda,
        authority: user.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
        allCommunity: allCommunityPda,
      })
      .instruction();
    await sendIx(ix, user.publicKey, [user]);
  });

  it("creates a community", async () => {
    [communityPda] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("community"), Buffer.from(uniqueCommunityName)],
      programId
    );
    const ix = await program.methods
      .createCommunity(uniqueCommunityName)
      .accounts({
        communityAccount: communityPda,
        authority: user.publicKey,
        userAccount: userPda,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .instruction();
    await sendIx(ix, user.publicKey, [user]);
  });

  it("creates a survey", async () => {
    [surveyPda] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("survey"), Buffer.from(uniqueCommunityName), Buffer.from(surveyTitle)],
      programId
    );
    // Set limitdate to 1 hour in the future
    const now = Math.floor(Date.now() / 1000);
    const limitdate = now + 3600;
    const ix = await program.methods
      .createSurvey(surveyTitle, surveyQuestions, surveyAnswers, new anchor.BN(limitdate))
      .accounts({
        communityAccount: communityPda,
        surveyAccount: surveyPda,
        authority: user.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .instruction();
    await sendIx(ix, user.publicKey, [user]);

    // Fetch and check the survey account
    const survey = await program.account.surveyAccount.fetch(surveyPda);
    assert.equal(survey.title, surveyTitle);
    assert.equal(survey.communityName, uniqueCommunityName);
    assert.equal(survey.questions, surveyQuestions);
    assert.lengthOf(survey.answers, 4);
    assert.equal(survey.answers[0].text, "Red");
    assert.equal(survey.answers[0].votes, 0);
    assert.equal(survey.limitdate.toNumber(), limitdate);

    // Fetch and check the community account's surveys vector
    const community = await program.account.communityAccount.fetch(communityPda);
    assert.isAtLeast(community.surveys.length, 1);
    const found = community.surveys.find((s: any) => s.title === surveyTitle);
    assert.isOk(found);
    assert.equal(found.pdaAddress.toBase58(), surveyPda.toBase58());
  });

  it("blocks a non-member from creating a survey for a community", async () => {
    // Setup two users
    const user1 = anchor.web3.Keypair.generate();
    const user2 = anchor.web3.Keypair.generate();
    // Airdrop SOL to both users
    const sig1 = await program.provider.connection.requestAirdrop(user1.publicKey, 1e9);
    await program.provider.connection.confirmTransaction(sig1);
    const sig2 = await program.provider.connection.requestAirdrop(user2.publicKey, 1e9);
    await program.provider.connection.confirmTransaction(sig2);
    // Derive PDAs
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
    const uniqueCommunityName = communityName + user1.publicKey.toBase58().slice(0, 4);
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
    // Try to create a survey with user2 (should fail)
    const [surveyPda] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("survey"), Buffer.from(uniqueCommunityName), Buffer.from(surveyTitle)],
      programId
    );
    const now = Math.floor(Date.now() / 1000);
    const limitdate = now + 3600;
    try {
      const surveyIx = await program.methods
        .createSurvey(surveyTitle, surveyQuestions, surveyAnswers, new anchor.BN(limitdate))
        .accounts({
          communityAccount: communityPda,
          surveyAccount: surveyPda,
          authority: user2.publicKey,
          userAccount: user2Pda,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .instruction();
      await sendIx(surveyIx, user2.publicKey, [user2]);
      assert.fail("Non-member should not be able to create a survey");
    } catch (e) {
      console.log('Expected error message:', e.message);
      assert.include(e.message, "not a member");
    }
  });
}); 