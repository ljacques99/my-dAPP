import { useState, useEffect } from 'react'
import { PublicKey } from '@solana/web3.js'
import * as anchor from '@coral-xyz/anchor'
import idl from './solana_d_app.json'

const COMMUNITY_SEED = "community";
const SURVEY_SEED = "survey";
const USER_SEED = "user";
const VOTE_SEED = "vote";
const PROGRAM_ID = "Ho1P3APYbSz3DUZyjNiezxuVkGinLB9vkqAfLBfVM8Cm";

function SurveyList({ connection, walletAddress, onNavigate, communityName }) {
  const [surveys, setSurveys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedSurvey, setSelectedSurvey] = useState(null);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [voting, setVoting] = useState(false);
  const [votingError, setVotingError] = useState(null);
  const [showVoting, setShowVoting] = useState(false);
  const [hasVoted, setHasVoted] = useState(false);
  const [checkingVoteStatus, setCheckingVoteStatus] = useState(false);

  // Fetch surveys for the community
  const fetchSurveys = async () => {
    if (!connection || !walletAddress || !communityName) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const provider = new anchor.AnchorProvider(connection, window.solana, anchor.AnchorProvider.defaultOptions());
      const program = new anchor.Program(idl, provider);
      
      // Get community account to see survey titles
      const [communityPda] = await PublicKey.findProgramAddress([
        Buffer.from(COMMUNITY_SEED),
        Buffer.from(communityName),
      ], new PublicKey(PROGRAM_ID));

      const communityAccount = await program.account.communityAccount.fetch(communityPda);
      
      // Fetch each survey's details
      const surveyDetails = [];
      for (const surveyTitle of communityAccount.surveys) {
        try {
          const [surveyPda] = await PublicKey.findProgramAddress([
            Buffer.from(SURVEY_SEED),
            Buffer.from(communityName),
            Buffer.from(surveyTitle),
          ], new PublicKey(PROGRAM_ID));

          const surveyAccount = await program.account.surveyAccount.fetch(surveyPda);
          surveyDetails.push({
            title: surveyAccount.title,
            questions: surveyAccount.questions,
            answers: surveyAccount.answers,
            limitdate: surveyAccount.limitdate,
            communityName: surveyAccount.communityName
          });
        } catch (err) {
          console.error(`Error fetching survey ${surveyTitle}:`, err);
        }
      }
      
      setSurveys(surveyDetails);
      
    } catch (err) {
      console.error('Error fetching surveys:', err);
      setError('Failed to fetch surveys: ' + (err.message || JSON.stringify(err)));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSurveys();
  }, [connection, walletAddress, communityName]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchSurveys();
    setRefreshing(false);
  };

  const formatDate = (timestamp) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleString();
  };

  const isVotingOpen = (limitDate) => {
    const now = Math.floor(Date.now() / 1000);
    return now < limitDate;
  };

  const getTotalVotes = (answers) => {
    return answers.reduce((total, answer) => total + answer.votes, 0);
  };

  const handleViewDetails = (survey) => {
    setSelectedSurvey(survey);
    setShowVoting(false);
    setSelectedAnswer(null);
    setVotingError(null);
    setHasVoted(false);
    checkVoteStatus(survey);
  };

  const checkVoteStatus = async (survey) => {
    if (!connection || !walletAddress || !survey) return;
    
    setCheckingVoteStatus(true);
    try {
      const [voteRecordPda] = await PublicKey.findProgramAddress([
        Buffer.from(VOTE_SEED),
        (await PublicKey.findProgramAddress([
          Buffer.from(SURVEY_SEED),
          Buffer.from(communityName),
          Buffer.from(survey.title),
        ], new PublicKey(PROGRAM_ID)))[0].toBuffer(),
        new PublicKey(walletAddress).toBuffer(),
      ], new PublicKey(PROGRAM_ID));

      const voteRecordAccount = await connection.getAccountInfo(voteRecordPda);
      setHasVoted(!!voteRecordAccount);
    } catch (err) {
      console.error('Error checking vote status:', err);
      setHasVoted(false);
    } finally {
      setCheckingVoteStatus(false);
    }
  };

  const handleAnswerSelect = (answerIndex) => {
    setSelectedAnswer(answerIndex);
    setVotingError(null); // Clear any previous errors
  };

  const handleVote = async () => {
    if (selectedAnswer === null) {
      setVotingError('Please select an answer before voting');
      return;
    }

    if (!isVotingOpen(selectedSurvey.limitdate)) {
      setVotingError('Voting is closed for this survey');
      return;
    }

    setVoting(true);
    setVotingError(null);

    try {
      const provider = new anchor.AnchorProvider(connection, window.solana, anchor.AnchorProvider.defaultOptions());
      const program = new anchor.Program(idl, provider);

      // Get PDAs
      const [userPda] = await PublicKey.findProgramAddress([
        Buffer.from(USER_SEED),
        new PublicKey(walletAddress).toBuffer(),
      ], new PublicKey(PROGRAM_ID));

      const [communityPda] = await PublicKey.findProgramAddress([
        Buffer.from(COMMUNITY_SEED),
        Buffer.from(communityName),
      ], new PublicKey(PROGRAM_ID));

      const [surveyPda] = await PublicKey.findProgramAddress([
        Buffer.from(SURVEY_SEED),
        Buffer.from(communityName),
        Buffer.from(selectedSurvey.title),
      ], new PublicKey(PROGRAM_ID));

      const [voteRecordPda] = await PublicKey.findProgramAddress([
        Buffer.from(VOTE_SEED),
        surveyPda.toBuffer(),
        new PublicKey(walletAddress).toBuffer(),
      ], new PublicKey(PROGRAM_ID));

      // Submit vote transaction
      const tx = await program.methods
        .vote(selectedAnswer)
        .accounts({
          userAccount: userPda,
          surveyAccount: surveyPda,
          communityAccount: communityPda,
          authority: new PublicKey(walletAddress),
          voteRecord: voteRecordPda,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      console.log('Vote submitted successfully:', tx);
      
      // Reset voting state and refresh surveys
      setShowVoting(false);
      setSelectedAnswer(null);
      setVotingError(null);
      setHasVoted(true);
      await fetchSurveys(); // Refresh to show updated vote counts

    } catch (err) {
      console.error('Error submitting vote:', err);
      if (err.message.includes('already in use')) {
        setVotingError('You have already voted on this survey');
      } else if (err.message.includes('VotingClosed')) {
        setVotingError('Voting is closed for this survey');
      } else if (err.message.includes('NotMemberOfCommunity')) {
        setVotingError('You are not a member of this community');
      } else {
        setVotingError('Failed to submit vote: ' + (err.message || JSON.stringify(err)));
      }
    } finally {
      setVoting(false);
    }
  };

  const handleVoteNow = () => {
    setShowVoting(true);
    setSelectedAnswer(null);
    setVotingError(null);
  };

  const handleCancelVote = () => {
    setShowVoting(false);
    setSelectedAnswer(null);
    setVotingError(null);
  };

  if (loading) {
    return (
      <div className="center-title">
        <div className="center-content">
          <h2>Loading surveys...</h2>
        </div>
      </div>
    );
  }

  return (
    <div className="center-title">
      <div className="center-content">
        <h1>Surveys in "{communityName}"</h1>
        
        <div style={{ display: 'flex', gap: '20px', alignItems: 'center', marginBottom: '20px' }}>
          <button 
            onClick={() => onNavigate('communities')}
            style={{ 
              padding: '8px 16px', 
              fontSize: '14px', 
              cursor: 'pointer',
              background: '#666',
              color: 'white',
              border: 'none',
              borderRadius: '4px'
            }}
          >
            ← Back to Communities
          </button>
          <button
            onClick={() => onNavigate('addSurvey', { communityName: communityName })}
            style={{ 
              padding: '8px 16px', 
              fontSize: '14px', 
              cursor: 'pointer',
              background: '#28a745',
              color: 'white',
              border: 'none',
              borderRadius: '4px'
            }}
          >
            Create Survey
          </button>
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
            title="Refresh surveys"
          >
            {refreshing ? '⟳' : '↻'}
          </button>
        </div>

        {surveys.length === 0 ? (
          <div style={{ 
            padding: '40px', 
            textAlign: 'center', 
            border: '1px solid #ddd', 
            borderRadius: '8px',
            background: '#f9f9f9'
          }}>
            <h3 style={{ color: '#666', marginBottom: '10px' }}>No surveys yet</h3>
            <p style={{ color: '#888', fontStyle: 'italic' }}>
              This community doesn't have any surveys yet. Be the first to create one!
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: '30px', alignItems: 'flex-start' }}>
            {/* Left side - Surveys Table */}
            <div style={{ flex: '1', minWidth: '400px' }}>
              <h3>Surveys List ({surveys.length})</h3>
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
                        Survey Title
                      </th>
                      <th style={{ 
                        padding: '12px', 
                        textAlign: 'center', 
                        borderBottom: '1px solid #ddd',
                        fontSize: '14px',
                        fontWeight: 'bold'
                      }}>
                        Status
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
                    {surveys.map((survey, index) => (
                      <tr key={index} style={{ 
                        background: index % 2 === 0 ? '#ffffff' : '#f9f9f9',
                        borderBottom: index < surveys.length - 1 ? '1px solid #eee' : 'none',
                        cursor: 'pointer'
                      }}
                      onClick={() => handleViewDetails(survey)}
                      >
                        <td style={{ 
                          padding: '12px', 
                          fontSize: '14px',
                          fontWeight: '500'
                        }}>
                          {survey.title}
                        </td>
                        <td style={{ 
                          padding: '12px', 
                          textAlign: 'center'
                        }}>
                          <span style={{ 
                            fontSize: '12px', 
                            padding: '4px 8px', 
                            borderRadius: '12px',
                            background: isVotingOpen(survey.limitdate) ? '#d4edda' : '#f8d7da',
                            color: isVotingOpen(survey.limitdate) ? '#155724' : '#721c24'
                          }}>
                            {isVotingOpen(survey.limitdate) ? 'Open' : 'Closed'}
                          </span>
                        </td>
                        <td style={{ 
                          padding: '12px', 
                          textAlign: 'center'
                        }}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleViewDetails(survey);
                            }}
                            style={{ 
                              padding: '6px 12px', 
                              fontSize: '12px', 
                              cursor: 'pointer',
                              background: '#007bff',
                              color: 'white',
                              border: 'none',
                              borderRadius: '4px'
                            }}
                          >
                            View Details
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Right side - Survey Details */}
            <div style={{ flex: '1', minWidth: '400px' }}>
              {selectedSurvey ? (
                <div style={{ 
                  border: '1px solid #ddd', 
                  borderRadius: '8px', 
                  padding: '20px',
                  background: '#fff'
                }}>
                  <h3 style={{ margin: '0 0 15px 0', color: '#333' }}>{selectedSurvey.title}</h3>
                  
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                      <span style={{ 
                        fontSize: '12px', 
                        padding: '4px 8px', 
                        borderRadius: '12px',
                        background: isVotingOpen(selectedSurvey.limitdate) ? '#d4edda' : '#f8d7da',
                        color: isVotingOpen(selectedSurvey.limitdate) ? '#155724' : '#721c24'
                      }}>
                        {isVotingOpen(selectedSurvey.limitdate) ? 'Voting Open' : 'Voting Closed'}
                      </span>
                      {!isVotingOpen(selectedSurvey.limitdate) && (
                        <span style={{ fontSize: '12px', color: '#666' }}>
                          {getTotalVotes(selectedSurvey.answers)} votes
                        </span>
                      )}
                    </div>
                  </div>
                  
                  <p style={{ 
                    margin: '0 0 15px 0', 
                    color: '#666', 
                    fontSize: '14px',
                    lineHeight: '1.5'
                  }}>
                    {selectedSurvey.questions}
                  </p>
                  
                  <div style={{ marginBottom: '15px' }}>
                    <h4 style={{ margin: '0 0 10px 0', fontSize: '14px', color: '#555' }}>
                      {showVoting ? 'Select your answer:' : (isVotingOpen(selectedSurvey.limitdate) ? 'Answer Options:' : 'Results:')}
                    </h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {(() => {
                        return selectedSurvey.answers.map((answer, answerIndex) => {
                          const totalVotes = getTotalVotes(selectedSurvey.answers);
                          const percentage = totalVotes > 0 ? Math.round((answer.votes / totalVotes) * 100) : 0;
                          
                          return (
                            <div key={answerIndex} style={{ 
                              display: 'flex', 
                              alignItems: 'center', 
                              gap: '10px',
                              padding: '8px',
                              background: showVoting ? (selectedAnswer === answerIndex ? '#e3f2fd' : '#fff') : '#f8f9fa',
                              borderRadius: '4px',
                              border: showVoting ? `2px solid ${selectedAnswer === answerIndex ? '#2196f3' : '#ddd'}` : 'none',
                              cursor: showVoting ? 'pointer' : 'default',
                              transition: 'all 0.2s ease',
                              boxShadow: showVoting && selectedAnswer === answerIndex ? '0 2px 4px rgba(33, 150, 243, 0.2)' : 'none'
                            }}
                            onClick={showVoting ? () => handleAnswerSelect(answerIndex) : undefined}
                            >
                              {showVoting && (
                                <div style={{
                                  width: '20px',
                                  height: '20px',
                                  borderRadius: '50%',
                                  border: `2px solid ${selectedAnswer === answerIndex ? '#2196f3' : '#ccc'}`,
                                  background: selectedAnswer === answerIndex ? '#2196f3' : '#fff',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  flexShrink: 0
                                }}>
                                  {selectedAnswer === answerIndex && (
                                    <div style={{
                                      width: '8px',
                                      height: '8px',
                                      borderRadius: '50%',
                                      background: '#fff'
                                    }} />
                                  )}
                                </div>
                              )}
                              {!isVotingOpen(selectedSurvey.limitdate) && !showVoting && (
                                <>
                                  <div style={{ 
                                    flex: '1',
                                    background: '#e9ecef',
                                    borderRadius: '4px',
                                    height: '20px',
                                    position: 'relative',
                                    overflow: 'hidden'
                                  }}>
                                    <div style={{
                                      position: 'absolute',
                                      top: '0',
                                      left: '0',
                                      height: '100%',
                                      width: `${percentage}%`,
                                      background: '#007bff',
                                      transition: 'width 0.3s ease'
                                    }} />
                                  </div>
                                  <span style={{ fontSize: '12px', color: '#666', minWidth: '40px' }}>
                                    {answer.votes} ({percentage}%)
                                  </span>
                                </>
                              )}
                              <span style={{ 
                                fontSize: '14px', 
                                color: selectedAnswer === answerIndex && showVoting ? '#1565c0' : '#333', 
                                flex: '1',
                                fontWeight: selectedAnswer === answerIndex && showVoting ? '600' : 'normal',
                                padding: showVoting ? '8px' : '0',
                                borderRadius: showVoting ? '4px' : '0'
                              }}>
                                {answer.text}
                              </span>
                            </div>
                          );
                        });
                      })()}
                    </div>
                  </div>

                  {votingError && (
                    <div style={{
                      color: '#721c24',
                      background: '#f8d7da',
                      border: '1px solid #f5c6cb',
                      borderRadius: '4px',
                      padding: '12px',
                      marginBottom: '15px',
                      fontSize: '14px'
                    }}>
                      {votingError}
                    </div>
                  )}
                  
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center',
                    fontSize: '12px',
                    color: '#666'
                  }}>
                    <span>Voting ends: {formatDate(selectedSurvey.limitdate)}</span>
                    {isVotingOpen(selectedSurvey.limitdate) && !showVoting && (
                      checkingVoteStatus ? (
                        <span style={{ 
                          fontSize: '12px', 
                          color: '#666',
                          fontStyle: 'italic'
                        }}>
                          Checking vote status...
                        </span>
                      ) : hasVoted ? (
                        <span style={{ 
                          fontSize: '12px', 
                          color: '#28a745',
                          fontWeight: '500'
                        }}>
                          ✓ You've already voted
                        </span>
                      ) : (
                        <button
                          onClick={handleVoteNow}
                          style={{ 
                            padding: '6px 12px', 
                            fontSize: '12px', 
                            cursor: 'pointer',
                            background: '#28a745',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px'
                          }}
                        >
                          Vote Now
                        </button>
                      )
                    )}
                    {showVoting && (
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          onClick={handleCancelVote}
                          disabled={voting}
                          style={{ 
                            padding: '6px 12px', 
                            fontSize: '12px', 
                            cursor: voting ? 'not-allowed' : 'pointer',
                            background: '#6c757d',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            opacity: voting ? 0.6 : 1
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleVote}
                          disabled={voting || selectedAnswer === null}
                          style={{ 
                            padding: '6px 12px', 
                            fontSize: '12px', 
                            cursor: (voting || selectedAnswer === null) ? 'not-allowed' : 'pointer',
                            background: selectedAnswer === null ? '#6c757d' : '#28a745',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            opacity: (voting || selectedAnswer === null) ? 0.6 : 1
                          }}
                        >
                          {voting ? 'Submitting...' : 'Submit Vote'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div style={{ 
                  border: '1px solid #ddd', 
                  borderRadius: '8px', 
                  padding: '40px',
                  background: '#f9f9f9',
                  textAlign: 'center'
                }}>
                  <h3 style={{ color: '#666', marginBottom: '10px' }}>Select a Survey</h3>
                  <p style={{ color: '#888', fontStyle: 'italic' }}>
                    Click on a survey from the list to view its details
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {error && (
          <div
            style={{
              color: 'red',
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

export default SurveyList; 