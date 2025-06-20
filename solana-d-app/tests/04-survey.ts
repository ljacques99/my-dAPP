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
    const ix = await program.methods
      .registerUser()
      .accounts({
        userAccount: userPda,
        authority: user.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
        allCommunity: allCommunityPda,
      })
      .instruction();
    const tx = new anchor.web3.Transaction().add(ix);
    tx.feePayer = user.publicKey;
    const latestBlockhash = await program.provider.connection.getLatestBlockhash();
    tx.recentBlockhash = latestBlockhash.blockhash;
    await anchor.web3.sendAndConfirmTransaction(
      program.provider.connection,
      tx,
      [user]
    );
  });

  it("creates a community", async () => {
    [communityPda] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("community"), Buffer.from(communityName)],
      programId
    );
    const ix = await program.methods
      .createCommunity(communityName)
      .accounts({
        communityAccount: communityPda,
        authority: user.publicKey,
        userAccount: userPda,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .instruction();
    const tx = new anchor.web3.Transaction().add(ix);
    tx.feePayer = user.publicKey;
    const latestBlockhash = await program.provider.connection.getLatestBlockhash();
    tx.recentBlockhash = latestBlockhash.blockhash;
    await anchor.web3.sendAndConfirmTransaction(
      program.provider.connection,
      tx,
      [user]
    );
  });

  it("creates a survey", async () => {
    [surveyPda] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("survey"), Buffer.from(communityName), Buffer.from(surveyTitle)],
      programId
    );
    const ix = await program.methods
      .createSurvey(surveyTitle, surveyQuestions, surveyAnswers)
      .accounts({
        communityAccount: communityPda,
        surveyAccount: surveyPda,
        authority: user.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .instruction();
    const tx = new anchor.web3.Transaction().add(ix);
    tx.feePayer = user.publicKey;
    const latestBlockhash = await program.provider.connection.getLatestBlockhash();
    tx.recentBlockhash = latestBlockhash.blockhash;
    await anchor.web3.sendAndConfirmTransaction(
      program.provider.connection,
      tx,
      [user]
    );

    // Fetch and check the survey account
    const survey = await program.account.surveyAccount.fetch(surveyPda);
    assert.equal(survey.title, surveyTitle);
    assert.equal(survey.communityName, communityName);
    assert.equal(survey.questions, surveyQuestions);
    assert.lengthOf(survey.answers, 4);
    assert.equal(survey.answers[0].text, "Red");
    assert.equal(survey.answers[0].votes, 0);

    // Fetch and check the community account's surveys vector
    const community = await program.account.communityAccount.fetch(communityPda);
    assert.isAtLeast(community.surveys.length, 1);
    const found = community.surveys.find((s: any) => s.title === surveyTitle);
    assert.isOk(found);
    assert.equal(found.pdaAddress.toBase58(), surveyPda.toBase58());
  });
}); 