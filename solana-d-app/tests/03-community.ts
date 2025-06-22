import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SolanaDApp } from "../target/types/solana_d_app";
import { assert } from "chai";
import idl from "../target/idl/solana_d_app.json";

describe("solana-d-app community", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const program = anchor.workspace.solanaDApp as Program<SolanaDApp>;
  const programId = new anchor.web3.PublicKey("Ho1P3APYbSz3DUZyjNiezxuVkGinLB9vkqAfLBfVM8Cm");

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

    // Create a community
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

    // Verify the creator automatically joined the community
    const userAccount = await program.account.userAccount.fetch(userPda);
    console.log("Creator's user account after creating community:", userAccount);
    assert.lengthOf(userAccount.communities, 2); // all + created community
    // Check that the created community is in the creator's communities
    assert.isTrue(userAccount.communities.includes(communityName));
    console.log("Creator automatically joined their created community:", communityName);
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

  it("A user successfully joins an existing community", async () => {
    // Create two users: one to create the community, one to join it
    const creator = anchor.web3.Keypair.generate();
    const joiner = anchor.web3.Keypair.generate();
    
    // Airdrop SOL to both users
    const creatorSig = await program.provider.connection.requestAirdrop(creator.publicKey, 1e9);
    await program.provider.connection.confirmTransaction(creatorSig);
    const joinerSig = await program.provider.connection.requestAirdrop(joiner.publicKey, 1e9);
    await program.provider.connection.confirmTransaction(joinerSig);

    // Register the creator
    const [creatorPda] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("user"), creator.publicKey.toBuffer()],
      programId
    );

    const [allCommunityPda] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("community"), Buffer.from("all")],
      programId
    );

    // Register the creator
    const registerCreatorIx = await program.methods
      .registerUser()
      .accounts({
        userAccount: creatorPda,
        authority: creator.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
        allCommunity: allCommunityPda,
      })
      .instruction();

    const registerCreatorTx = new anchor.web3.Transaction().add(registerCreatorIx);
    registerCreatorTx.feePayer = creator.publicKey;
    const registerCreatorBlockhash = await program.provider.connection.getLatestBlockhash();
    registerCreatorTx.recentBlockhash = registerCreatorBlockhash.blockhash;
    await anchor.web3.sendAndConfirmTransaction(
      program.provider.connection,
      registerCreatorTx,
      [creator]
    );

    // Register the joiner
    const [joinerPda] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("user"), joiner.publicKey.toBuffer()],
      programId
    );

    const registerJoinerIx = await program.methods
      .registerUser()
      .accounts({
        userAccount: joinerPda,
        authority: joiner.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
        allCommunity: allCommunityPda,
      })
      .instruction();

    const registerJoinerTx = new anchor.web3.Transaction().add(registerJoinerIx);
    registerJoinerTx.feePayer = joiner.publicKey;
    const registerJoinerBlockhash = await program.provider.connection.getLatestBlockhash();
    registerJoinerTx.recentBlockhash = registerJoinerBlockhash.blockhash;
    await anchor.web3.sendAndConfirmTransaction(
      program.provider.connection,
      registerJoinerTx,
      [joiner]
    );

    // Creator creates a community
    const communityName = "community" + creator.publicKey.toBase58().slice(0, 4);
    const [newCommunityPda] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("community"), Buffer.from(communityName)],
      programId
    );

    const createIx = await program.methods
      .createCommunity(communityName)
      .accounts({
        communityAccount: newCommunityPda,
        authority: creator.publicKey,
        userAccount: creatorPda,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .instruction();

    const createTx = new anchor.web3.Transaction().add(createIx);
    createTx.feePayer = creator.publicKey;
    const createBlockhash = await program.provider.connection.getLatestBlockhash();
    createTx.recentBlockhash = createBlockhash.blockhash;
    await anchor.web3.sendAndConfirmTransaction(
      program.provider.connection,
      createTx,
      [creator]
    );

    // Now the joiner joins the community
    const joinIx = await program.methods
      .joinCommunity()
      .accounts({
        userAccount: joinerPda,
        communityAccount: newCommunityPda,
        authority: joiner.publicKey,
      })
      .instruction();

    const joinTx = new anchor.web3.Transaction().add(joinIx);
    joinTx.feePayer = joiner.publicKey;
    const joinBlockhash = await program.provider.connection.getLatestBlockhash();
    joinTx.recentBlockhash = joinBlockhash.blockhash;
    const joinSignature = await anchor.web3.sendAndConfirmTransaction(
      program.provider.connection,
      joinTx,
      [joiner]
    );
    console.log("Join community transaction signature:", joinSignature);

    // Verify the joiner now has 2 communities (all + the joined one)
    const joinerAccount = await program.account.userAccount.fetch(joinerPda);
    console.log("Joiner account after joining:", joinerAccount);
    assert.lengthOf(joinerAccount.communities, 2);
    
    // Check that the joined community is in the joiner's communities
    assert.isTrue(joinerAccount.communities.includes(communityName));
    console.log("Successfully joined community:", communityName);

    // Verify the creator still has only 1 community (all)
    const creatorAccount = await program.account.userAccount.fetch(creatorPda);
    console.log("Creator account:", creatorAccount);
    assert.lengthOf(creatorAccount.communities, 2);
    assert.strictEqual(creatorAccount.communities[0], "all");
  });

  it("A user is rejected when trying to join a non-existent community", async () => {
    // Create a user and register them
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

    // Register the user
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

    // Try to join a non-existent community
    const fakeCommunityName = "nonexistent";
    const [fakeCommunityPda] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("community"), Buffer.from(fakeCommunityName)],
      programId
    );

    try {
      const joinIx = await program.methods
        .joinCommunity()
        .accounts({
          userAccount: userPda,
          communityAccount: fakeCommunityPda,
          authority: user.publicKey,
        })
        .instruction();

      const joinTx = new anchor.web3.Transaction().add(joinIx);
      joinTx.feePayer = user.publicKey;
      const joinBlockhash = await program.provider.connection.getLatestBlockhash();
      joinTx.recentBlockhash = joinBlockhash.blockhash;
      await anchor.web3.sendAndConfirmTransaction(
        program.provider.connection,
        joinTx,
        [user]
      );
      
      // If we reach here, the test should fail
      assert.fail("Expected transaction to fail for non-existent community");
    } catch (error) {
      console.log("Successfully rejected joining non-existent community:", error.message);
      // The transaction should fail, which is what we expect
      assert.include(error.message, "failed");
    }
  });

  it("Rejects creating a community with a duplicate name by another user", function (done) {
    this.timeout(3000); // 10 seconds
    let finished = false;
    setTimeout(() => {
      if (!finished) done(new Error("Test timed out!"));
    }, 9000);
    (async () => {
      try {
        // Create the first user and register them
        const user1 = anchor.web3.Keypair.generate();
        const sig1 = await program.provider.connection.requestAirdrop(user1.publicKey, 1e9);
        await program.provider.connection.confirmTransaction(sig1);

        const [user1Pda] = await anchor.web3.PublicKey.findProgramAddress(
          [Buffer.from("user"), user1.publicKey.toBuffer()],
          programId
        );
        const [allCommunityPda] = await anchor.web3.PublicKey.findProgramAddress(
          [Buffer.from("community"), Buffer.from("all")],
          programId
        );
        const registerIx1 = await program.methods
          .registerUser()
          .accounts({
            userAccount: user1Pda,
            authority: user1.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
            allCommunity: allCommunityPda,
          })
          .instruction();
        const registerTx1 = new anchor.web3.Transaction().add(registerIx1);
        registerTx1.feePayer = user1.publicKey;
        const registerBlockhash1 = await program.provider.connection.getLatestBlockhash();
        registerTx1.recentBlockhash = registerBlockhash1.blockhash;
        await anchor.web3.sendAndConfirmTransaction(
          program.provider.connection,
          registerTx1,
          [user1]
        );

        // User1 creates a community
        const communityName = "duplicate-test-community";
        const [communityPda] = await anchor.web3.PublicKey.findProgramAddress(
          [Buffer.from("community"), Buffer.from(communityName)],
          programId
        );

        const createIx = await program.methods
          .createCommunity(communityName)
          .accounts({
            communityAccount: communityPda,
            authority: user1.publicKey,
            userAccount: user1Pda,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .instruction();

        const createTx = new anchor.web3.Transaction().add(createIx);
        createTx.feePayer = user1.publicKey;
        const createBlockhash = await program.provider.connection.getLatestBlockhash();
        createTx.recentBlockhash = createBlockhash.blockhash;
        await anchor.web3.sendAndConfirmTransaction(
          program.provider.connection,
          createTx,
          [user1]
        );

        // Create the second user and register them
        const user2 = anchor.web3.Keypair.generate();
        const sig2 = await program.provider.connection.requestAirdrop(user2.publicKey, 1e9);
        await program.provider.connection.confirmTransaction(sig2);

        const [user2Pda] = await anchor.web3.PublicKey.findProgramAddress(
          [Buffer.from("user"), user2.publicKey.toBuffer()],
          programId
        );

        const registerIx2 = await program.methods
          .registerUser()
          .accounts({
            userAccount: user2Pda,
            authority: user2.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
            allCommunity: allCommunityPda,
          })
          .instruction();
        const registerTx2 = new anchor.web3.Transaction().add(registerIx2);
        registerTx2.feePayer = user2.publicKey;
        const registerBlockhash2 = await program.provider.connection.getLatestBlockhash();
        registerTx2.recentBlockhash = registerBlockhash2.blockhash;
        await anchor.web3.sendAndConfirmTransaction(
          program.provider.connection,
          registerTx2,
          [user2]
        );

        // Now, user2 tries to create a community with the same name, which should fail
        const createAgainIx = await program.methods
          .createCommunity(communityName)
          .accounts({
            communityAccount: communityPda,
            authority: user2.publicKey,
            userAccount: user2Pda,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .instruction();

        const createAgainTx = new anchor.web3.Transaction().add(createAgainIx);
        createAgainTx.feePayer = user2.publicKey;
        const createAgainBlockhash = await program.provider.connection.getLatestBlockhash();
        createAgainTx.recentBlockhash = createAgainBlockhash.blockhash;

        await anchor.web3.sendAndConfirmTransaction(
          program.provider.connection,
          createAgainTx,
          [user2]
        );
        finished = true;
        done(new Error("Should have failed to create a community with a duplicate name."));
      } catch (error) {
        finished = true;
        console.log("Test passed: duplicate community creation was rejected as expected.");
        done();
      }
    })();
  });

  it("A user can exit a community they joined", async () => {
    // Create two users: one to create the community, one to join and then exit
    const creator = anchor.web3.Keypair.generate();
    const joiner = anchor.web3.Keypair.generate();
    // Airdrop SOL to both users
    const creatorSig = await program.provider.connection.requestAirdrop(creator.publicKey, 1e9);
    await program.provider.connection.confirmTransaction(creatorSig);
    const joinerSig = await program.provider.connection.requestAirdrop(joiner.publicKey, 1e9);
    await program.provider.connection.confirmTransaction(joinerSig);
    // Register both users
    const [creatorPda] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("user"), creator.publicKey.toBuffer()],
      programId
    );
    const [joinerPda] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("user"), joiner.publicKey.toBuffer()],
      programId
    );
    const [allCommunityPda] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("community"), Buffer.from("all")],
      programId
    );
    // Register creator
    const registerCreatorIx = await program.methods
      .registerUser()
      .accounts({
        userAccount: creatorPda,
        authority: creator.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
        allCommunity: allCommunityPda,
      })
      .instruction();
    await anchor.web3.sendAndConfirmTransaction(
      program.provider.connection,
      new anchor.web3.Transaction().add(registerCreatorIx),
      [creator]
    );
    // Register joiner
    const registerJoinerIx = await program.methods
      .registerUser()
      .accounts({
        userAccount: joinerPda,
        authority: joiner.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
        allCommunity: allCommunityPda,
      })
      .instruction();
    await anchor.web3.sendAndConfirmTransaction(
      program.provider.connection,
      new anchor.web3.Transaction().add(registerJoinerIx),
      [joiner]
    );
    // Creator creates a community
    const communityName = "exitcommunity" + creator.publicKey.toBase58().slice(0, 4);
    const [communityPda] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("community"), Buffer.from(communityName)],
      programId
    );
    const createIx = await program.methods
      .createCommunity(communityName)
      .accounts({
        communityAccount: communityPda,
        authority: creator.publicKey,
        userAccount: creatorPda,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .instruction();
    await anchor.web3.sendAndConfirmTransaction(
      program.provider.connection,
      new anchor.web3.Transaction().add(createIx),
      [creator]
    );
    // Joiner joins the community
    const joinIx = await program.methods
      .joinCommunity()
      .accounts({
        userAccount: joinerPda,
        communityAccount: communityPda,
        authority: joiner.publicKey,
      })
      .instruction();
    await anchor.web3.sendAndConfirmTransaction(
      program.provider.connection,
      new anchor.web3.Transaction().add(joinIx),
      [joiner]
    );
    // Joiner exits the community
    const exitIx = await program.methods
      .exitCommunity()
      .accounts({
        userAccount: joinerPda,
        communityAccount: communityPda,
        authority: joiner.publicKey,
      })
      .instruction();
    await anchor.web3.sendAndConfirmTransaction(
      program.provider.connection,
      new anchor.web3.Transaction().add(exitIx),
      [joiner]
    );
    // Fetch joiner's account and check the community is removed
    const joinerAccount = await program.account.userAccount.fetch(joinerPda);
    assert.isFalse(joinerAccount.communities.includes(communityName));
    // The joiner should still have 'all' in their communities
    assert.isTrue(joinerAccount.communities.includes("all"));
  });

  it("The authority cannot exit their own community", async () => {
    // Create a user who will be the authority
    const creator = anchor.web3.Keypair.generate();
    const creatorSig = await program.provider.connection.requestAirdrop(creator.publicKey, 1e9);
    await program.provider.connection.confirmTransaction(creatorSig);
    const [creatorPda] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("user"), creator.publicKey.toBuffer()],
      programId
    );
    const [allCommunityPda] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("community"), Buffer.from("all")],
      programId
    );
    // Register creator
    const registerCreatorIx = await program.methods
      .registerUser()
      .accounts({
        userAccount: creatorPda,
        authority: creator.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
        allCommunity: allCommunityPda,
      })
      .instruction();
    await anchor.web3.sendAndConfirmTransaction(
      program.provider.connection,
      new anchor.web3.Transaction().add(registerCreatorIx),
      [creator]
    );
    // Creator creates a community
    const communityName = "exitcommunity" + creator.publicKey.toBase58().slice(0, 4);
    const [communityPda] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("community"), Buffer.from(communityName)],
      programId
    );
    const createIx = await program.methods
      .createCommunity(communityName)
      .accounts({
        communityAccount: communityPda,
        authority: creator.publicKey,
        userAccount: creatorPda,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .instruction();
    await anchor.web3.sendAndConfirmTransaction(
      program.provider.connection,
      new anchor.web3.Transaction().add(createIx),
      [creator]
    );
    // Creator tries to exit their own community (should fail)
    try {
      const exitIx = await program.methods
        .exitCommunity()
        .accounts({
          userAccount: creatorPda,
          communityAccount: communityPda,
          authority: creator.publicKey,
        })
        .instruction();
      await anchor.web3.sendAndConfirmTransaction(
        program.provider.connection,
        new anchor.web3.Transaction().add(exitIx),
        [creator]
      );
      assert.fail("Expected authority to be denied exit from their own community");
    } catch (e) {
      assert.include(e.message, "Community authority cannot exit");
    }
  });
});