import { useState, useEffect } from 'react'
import { PublicKey } from '@solana/web3.js'
import * as anchor from '@coral-xyz/anchor'
import idl from './solana_d_app.json'

const USER_SEED = "user";
const COMMUNITY_SEED = "community";
const PROGRAM_ID = "Ho1P3APYbSz3DUZyjNiezxuVkGinLB9vkqAfLBfVM8Cm";

function Communities({ connection, walletAddress, onNavigate }) {
  const [userCommunities, setUserCommunities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [newCommunityName, setNewCommunityName] = useState('');
  const [creatingCommunity, setCreatingCommunity] = useState(false);
  const [joinCommunityName, setJoinCommunityName] = useState('');
  const [joiningCommunity, setJoiningCommunity] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Fetch user's communities
  const fetchUserCommunities = async () => {
    if (!connection || !walletAddress) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const provider = new anchor.AnchorProvider(connection, window.solana, anchor.AnchorProvider.defaultOptions());
      const program = new anchor.Program(idl, provider);
      
      const publicKey = new PublicKey(walletAddress);
      const [userPda] = await PublicKey.findProgramAddress([
        Buffer.from(USER_SEED),
        publicKey.toBuffer(),
      ], new PublicKey(PROGRAM_ID));

      // Get user account data
      const userAccount = await program.account.userAccount.fetch(userPda);
      setUserCommunities(userAccount.communities);
      
    } catch (err) {
      console.error('Error fetching user communities:', err);
      setError('Failed to fetch communities: ' + (err.message || JSON.stringify(err)));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUserCommunities();
  }, [connection, walletAddress]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchUserCommunities();
    setRefreshing(false);
  };

  const handleCreateCommunity = async () => {
    if (!newCommunityName.trim()) {
      setError('Please enter a community name');
      return;
    }

    setCreatingCommunity(true);
    setError(null);

    try {
      const provider = new anchor.AnchorProvider(connection, window.solana, anchor.AnchorProvider.defaultOptions());
      const program = new anchor.Program(idl, provider);
      
      const publicKey = new PublicKey(walletAddress);
      const [userPda] = await PublicKey.findProgramAddress([
        Buffer.from(USER_SEED),
        publicKey.toBuffer(),
      ], new PublicKey(PROGRAM_ID));

      const [communityPda] = await PublicKey.findProgramAddress([
        Buffer.from(COMMUNITY_SEED),
        Buffer.from(newCommunityName),
      ], new PublicKey(PROGRAM_ID));

      // Call the create_community instruction
      const tx = await program.methods
        .createCommunity(newCommunityName)
        .accounts({
          communityAccount: communityPda,
          authority: publicKey,
          userAccount: userPda,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      console.log('Community creation transaction signature:', tx);
      
      // Refresh communities list
      const userAccount = await program.account.userAccount.fetch(userPda);
      setUserCommunities(userAccount.communities);
      
      setNewCommunityName('');
      setError('Community created successfully! Transaction: ' + tx);
      
    } catch (err) {
      console.error('Community creation error:', err);
      setError('Failed to create community: ' + (err.message || JSON.stringify(err)));
    } finally {
      setCreatingCommunity(false);
    }
  };

  const handleJoinCommunity = async () => {
    if (!joinCommunityName.trim()) {
      setError('Please enter a community name to join');
      return;
    }

    setJoiningCommunity(true);
    setError(null);

    try {
      const provider = new anchor.AnchorProvider(connection, window.solana, anchor.AnchorProvider.defaultOptions());
      const program = new anchor.Program(idl, provider);
      
      const publicKey = new PublicKey(walletAddress);
      const [userPda] = await PublicKey.findProgramAddress([
        Buffer.from(USER_SEED),
        publicKey.toBuffer(),
      ], new PublicKey(PROGRAM_ID));

      const [communityPda] = await PublicKey.findProgramAddress([
        Buffer.from(COMMUNITY_SEED),
        Buffer.from(joinCommunityName),
      ], new PublicKey(PROGRAM_ID));

      // Check if community exists
      const communityAccount = await connection.getAccountInfo(communityPda);
      if (!communityAccount) {
        setError(`Community "${joinCommunityName}" does not exist. Please check the name or create it first.`);
        setJoiningCommunity(false);
        return;
      }

      // Check if user is already a member
      const userAccount = await program.account.userAccount.fetch(userPda);
      if (userAccount.communities.includes(joinCommunityName)) {
        setError(`You are already a member of "${joinCommunityName}"`);
        setJoiningCommunity(false);
        return;
      }

      // Call the join_community instruction
      const tx = await program.methods
        .joinCommunity()
        .accounts({
          userAccount: userPda,
          communityAccount: communityPda,
          authority: publicKey,
        })
        .rpc();

      console.log('Join community transaction signature:', tx);
      
      // Refresh communities list
      const updatedUserAccount = await program.account.userAccount.fetch(userPda);
      setUserCommunities(updatedUserAccount.communities);
      
      setJoinCommunityName('');
      setError('Successfully joined community! Transaction: ' + tx);
      
    } catch (err) {
      console.error('Join community error:', err);
      if (err.message && err.message.includes('AlreadyMember')) {
        setError(`You are already a member of "${joinCommunityName}"`);
      } else {
        setError('Failed to join community: ' + (err.message || JSON.stringify(err)));
      }
    } finally {
      setJoiningCommunity(false);
    }
  };

  if (loading) {
    return (
      <div className="center-title">
        <div className="center-content">
          <h2>Loading your communities...</h2>
        </div>
      </div>
    );
  }

  return (
    <div className="center-title">
      <div className="center-content">
        <h1>Your Communities</h1>
        
        <div style={{ display: 'flex', gap: '50px', alignItems: 'flex-start' }}>
          {/* Left side - Create and Join blocks */}
          <div style={{ flex: '1', minWidth: '300px' }}>
            {/* Create New Community */}
            <div style={{ marginBottom: '30px', padding: '20px', border: '1px solid #ddd', borderRadius: '8px' }}>
              <h3>Create New Community</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginTop: '15px' }}>
                <input
                  type="text"
                  placeholder="Enter community name"
                  value={newCommunityName}
                  onChange={(e) => setNewCommunityName(e.target.value)}
                  style={{ 
                    padding: '10px', 
                    fontSize: '14px', 
                    border: '1px solid #ddd', 
                    borderRadius: '4px',
                    width: '100%',
                    boxSizing: 'border-box'
                  }}
                />
                <button
                  onClick={handleCreateCommunity}
                  disabled={creatingCommunity}
                  style={{ 
                    padding: '10px 20px', 
                    fontSize: '14px', 
                    cursor: creatingCommunity ? 'not-allowed' : 'pointer',
                    background: '#4caf50',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    alignSelf: 'center'
                  }}
                >
                  {creatingCommunity ? 'Creating...' : 'Create'}
                </button>
              </div>
            </div>

            {/* Join Community */}
            <div style={{ marginBottom: '30px', padding: '20px', border: '1px solid #ddd', borderRadius: '8px' }}>
              <h3>Join Community</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginTop: '15px' }}>
                <input
                  type="text"
                  placeholder="Enter community name"
                  value={joinCommunityName}
                  onChange={(e) => setJoinCommunityName(e.target.value)}
                  style={{ 
                    padding: '10px', 
                    fontSize: '14px', 
                    border: '1px solid #ddd', 
                    borderRadius: '4px',
                    width: '100%',
                    boxSizing: 'border-box'
                  }}
                />
                <button
                  onClick={handleJoinCommunity}
                  disabled={joiningCommunity}
                  style={{ 
                    padding: '10px 20px', 
                    fontSize: '14px', 
                    cursor: joiningCommunity ? 'not-allowed' : 'pointer',
                    background: '#2196f3',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    alignSelf: 'center'
                  }}
                >
                  {joiningCommunity ? 'Joining...' : 'Join'}
                </button>
              </div>
            </div>
          </div>

          {/* Right side - Communities List */}
          <div style={{ flex: '2', minWidth: '400px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
              <h3>Your Communities ({userCommunities.length})</h3>
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                style={{ 
                  padding: '8px', 
                  fontSize: '16px', 
                  cursor: refreshing ? 'not-allowed' : 'pointer',
                  background: 'transparent',
                  color: '#666',
                  border: '1px solid #ddd',
                  borderRadius: '50%',
                  width: '32px',
                  height: '32px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
                title="Refresh communities"
              >
                {refreshing ? '⟳' : '↻'}
              </button>
            </div>
            {userCommunities.length === 0 ? (
              <p style={{ color: '#666', fontStyle: 'italic' }}>You haven't joined any communities yet.</p>
            ) : (
              <div style={{ 
                border: '1px solid #ddd', 
                borderRadius: '8px', 
                overflow: 'hidden'
              }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#f5f5f5' }}>
                      <th style={{ 
                        padding: '12px', 
                        textAlign: 'left', 
                        borderBottom: '1px solid #ddd',
                        fontSize: '14px',
                        fontWeight: 'bold'
                      }}>
                        Community Name
                      </th>
                      <th style={{ 
                        padding: '12px', 
                        textAlign: 'center', 
                        borderBottom: '1px solid #ddd',
                        fontSize: '14px',
                        fontWeight: 'bold'
                      }}>
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {userCommunities.map((community, index) => (
                      <tr key={index} style={{ 
                        background: index % 2 === 0 ? '#ffffff' : '#f9f9f9',
                        borderBottom: index < userCommunities.length - 1 ? '1px solid #eee' : 'none'
                      }}>
                        <td style={{ 
                          padding: '12px', 
                          fontSize: '14px',
                          fontWeight: '500'
                        }}>
                          {community}
                        </td>
                        <td style={{ 
                          padding: '12px', 
                          textAlign: 'center'
                        }}>
                          <button
                            onClick={() => onNavigate('surveys', { community: community })}
                            style={{ 
                              padding: '6px 12px', 
                              fontSize: '12px', 
                              cursor: 'pointer',
                              background: '#2196f3',
                              color: 'white',
                              border: 'none',
                              borderRadius: '4px'
                            }}
                          >
                            View Surveys
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {error && (
          <div
            style={{
              color: error.includes('successfully') || error.includes('created successfully') || error.includes('Successfully joined') ? '#28a745' : 'red',
              marginTop: '20px',
              textAlign: 'center'
            }}
          >
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

export default Communities; 