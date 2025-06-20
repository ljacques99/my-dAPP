import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SolanaDApp } from "../target/types/solana_d_app";
import { assert } from "chai";
import idl from "../target/idl/solana_d_app.json";

describe("solana-d-app", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const program = anchor.workspace.solanaDApp as Program<SolanaDApp>;
  const programId = new anchor.web3.PublicKey("HSh6ntCpps9Zfa9rsZjqYzEXpK3uXqEXY7iLegF9angR");

  it("Initializes the 'all' community if it doesn't exist", async () => {
    const authority = (program.provider as anchor.AnchorProvider).wallet;
    
    // Find the PDA for the "all" community
    const [communityPda] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("community"), Buffer.from("all")],
      programId
    );

    // Try to fetch the community account first
    let communityAccount;
    try {
      communityAccount = await program.account.communityAccount.fetch(communityPda);
      console.log("Community already exists:", communityAccount);
      console.log("'all' community PDA address:", communityPda.toBase58());
    } catch (err) {
      console.log("Community doesn't exist, initializing...");
      // Initialize the "all" community
      const tx = await program.methods
        .initialize()
        .accounts({
          communityAccount: communityPda,
          authority: authority.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
      console.log("Initialize 'all' community transaction signature:", tx);
      
      // Fetch the newly created community account
      communityAccount = await program.account.communityAccount.fetch(communityPda);
    }

    // Verify the community account contents
    console.log("Fetched community account:", communityAccount);
    assert.strictEqual(communityAccount.name, "all");
    assert.strictEqual(communityAccount.authority.toBase58(), authority.publicKey.toBase58());
    assert.isArray(communityAccount.surveys);
    assert.lengthOf(communityAccount.surveys, 0);
  });

  it("Registers a user and creates a PDA with the 'all' community", async () => {
    const user = anchor.web3.Keypair.generate();
    // Airdrop SOL to the user for fees
    const sig = await program.provider.connection.requestAirdrop(user.publicKey, 1e9);
    await program.provider.connection.confirmTransaction(sig);

    // Derive the PDA for the user
    const [userPda] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("user"), user.publicKey.toBuffer()],
      programId
    );

    // Derive the PDA for the "all" community
    const [communityPda] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("community"), Buffer.from("all")],
      programId
    );

    // Build the instruction
    const ix = await program.methods
      .registerUser()
      .accounts({
        userAccount: userPda,
        authority: user.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
        allCommunity: communityPda,
      })
      .instruction();

    // Create and send the transaction with the user as fee payer
    const tx = new anchor.web3.Transaction().add(ix);
    tx.feePayer = user.publicKey;
    const latestBlockhash = await program.provider.connection.getLatestBlockhash();
    tx.recentBlockhash = latestBlockhash.blockhash;
    const signedTx = await anchor.web3.sendAndConfirmTransaction(
      program.provider.connection,
      tx,
      [user]
    );
    console.log("RegisterUser transaction signature:", signedTx);

    // Fetch the user account and check its contents
    const userAccount = await program.account.userAccount.fetch(userPda);
    console.log("Fetched user account:", userAccount);
    assert.strictEqual(userAccount.authority.toBase58(), user.publicKey.toBase58());
    assert.isArray(userAccount.communities);
    assert.lengthOf(userAccount.communities, 1);
    
    // Check the "all" community reference details
    const allCommunityRef = userAccount.communities[0];
    assert.strictEqual(allCommunityRef.name, "all");
    assert.strictEqual(allCommunityRef.pdaAddress.toBase58(), communityPda.toBase58());
    console.log("User is registered with 'all' community reference:", allCommunityRef);
  });

  it("A registered user successfully creates a community", async () => {
    const user = anchor.web3.Keypair.generate();
    // Airdrop SOL to the user for fees
    const sig = await program.provider.connection.requestAirdrop(user.publicKey, 1e9);
    await program.provider.connection.confirmTransaction(sig);

    // First, register the user
    const [userPda] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("user"), user.publicKey.toBuffer()],
      programId
    );

    const [allCommunityPda] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("community"), Buffer.from("all")],
      programId
    );

    // Register the user first
    const registerIx = await program.methods
      .registerUser()
      .accounts({
        userAccount: userPda,
        authority: user.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
        allCommunity: allCommunityPda,
      })
      .instruction();

    const registerTx = new anchor.web3.Transaction().add(registerIx);
    registerTx.feePayer = user.publicKey;
    const registerBlockhash = await program.provider.connection.getLatestBlockhash();
    registerTx.recentBlockhash = registerBlockhash.blockhash;
    await anchor.web3.sendAndConfirmTransaction(
      program.provider.connection,
      registerTx,
      [user]
    );

    // Now create a community
    const communityName = "community" + user.publicKey.toBase58().slice(0, 4);
    const [newCommunityPda] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("community"), Buffer.from(communityName)],
      programId
    );

    const createIx = await program.methods
      .createCommunity(communityName)
      .accounts({
        communityAccount: newCommunityPda,
        authority: user.publicKey,
        userAccount: userPda,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .instruction();

    const createTx = new anchor.web3.Transaction().add(createIx);
    createTx.feePayer = user.publicKey;
    const createBlockhash = await program.provider.connection.getLatestBlockhash();
    createTx.recentBlockhash = createBlockhash.blockhash;
    const createSignature = await anchor.web3.sendAndConfirmTransaction(
      program.provider.connection,
      createTx,
      [user]
    );
    console.log("Create community transaction signature:", createSignature);

    // Verify the community was created correctly
    const communityAccount = await program.account.communityAccount.fetch(newCommunityPda);
    console.log("Created community:", communityAccount);
    assert.strictEqual(communityAccount.name, communityName);
    assert.strictEqual(communityAccount.authority.toBase58(), user.publicKey.toBase58());
    assert.isArray(communityAccount.surveys);
    assert.lengthOf(communityAccount.surveys, 0);
  });

  it("A non-registered user is rejected when trying to create a community", async () => {
    const nonRegisteredUser = anchor.web3.Keypair.generate();
    // Airdrop SOL to the user for fees
    const sig = await program.provider.connection.requestAirdrop(nonRegisteredUser.publicKey, 1e9);
    await program.provider.connection.confirmTransaction(sig);

    const communityName = "community" + nonRegisteredUser.publicKey.toBase58().slice(0, 4);
    const [communityPda] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("community"), Buffer.from(communityName)],
      programId
    );

    // Try to create a community without being registered - this should fail
    try {
      const createIx = await program.methods
        .createCommunity(communityName)
        .accounts({
          communityAccount: communityPda,
          authority: nonRegisteredUser.publicKey,
          userAccount: anchor.web3.PublicKey.default, // This will cause the constraint to fail
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .instruction();

      const createTx = new anchor.web3.Transaction().add(createIx);
      createTx.feePayer = nonRegisteredUser.publicKey;
      const createBlockhash = await program.provider.connection.getLatestBlockhash();
      createTx.recentBlockhash = createBlockhash.blockhash;
      await anchor.web3.sendAndConfirmTransaction(
        program.provider.connection,
        createTx,
        [nonRegisteredUser]
      );
      
      // If we reach here, the test should fail
      assert.fail("Expected transaction to fail for non-registered user");
    } catch (error) {
      console.log("Successfully rejected non-registered user:", error.message);
      // The transaction should fail, which is what we expect
      assert.include(error.message, "failed");
    }
  });
});
