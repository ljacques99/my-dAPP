import { useState, useEffect } from 'react'
import { PublicKey } from '@solana/web3.js'
import * as anchor from '@coral-xyz/anchor'
import idl from './solana_d_app.json'

const USER_SEED = "user";
const COMMUNITY_SEED = "community";
const SURVEY_SEED = "survey";
const PROGRAM_ID = "Ho1P3APYbSz3DUZyjNiezxuVkGinLB9vkqAfLBfVM8Cm";

function AddSurvey({ connection, walletAddress, onNavigate, communityName }) {
  const [title, setTitle] = useState('');
  const [question, setQuestion] = useState('');
  const [answers, setAnswers] = useState(['', '']); // Start with 2 answers
  const [limitDate, setLimitDate] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);
  const [isMember, setIsMember] = useState(false);
  const [checkingMembership, setCheckingMembership] = useState(true);

  // Check if user is a member of the community
  useEffect(() => {
    const checkMembership = async () => {
      if (!connection || !walletAddress || !communityName) return;
      
      setCheckingMembership(true);
      try {
        const provider = new anchor.AnchorProvider(connection, window.solana, anchor.AnchorProvider.defaultOptions());
        const program = new anchor.Program(idl, provider);
        
        const publicKey = new PublicKey(walletAddress);
        const [userPda] = await PublicKey.findProgramAddress([
          Buffer.from(USER_SEED),
          publicKey.toBuffer(),
        ], new PublicKey(PROGRAM_ID));

        const userAccount = await program.account.userAccount.fetch(userPda);
        setIsMember(userAccount.communities.includes(communityName));
        
      } catch (err) {
        console.error('Error checking membership:', err);
        setIsMember(false);
      } finally {
        setCheckingMembership(false);
      }
    };

    checkMembership();
  }, [connection, walletAddress, communityName]);

  const addAnswer = () => {
    if (answers.length < 4) {
      setAnswers([...answers, '']);
    }
  };

  const removeAnswer = (index) => {
    if (answers.length > 2) {
      const newAnswers = answers.filter((_, i) => i !== index);
      setAnswers(newAnswers);
    }
  };

  const updateAnswer = (index, value) => {
    const newAnswers = [...answers];
    newAnswers[index] = value;
    setAnswers(newAnswers);
  };

  const validateForm = () => {
    if (!title.trim()) {
      setError('Please enter a survey title');
      return false;
    }
    if (title.length > 30) {
      setError('Survey title must be 30 characters or less');
      return false;
    }
    if (!question.trim()) {
      setError('Please enter a survey question');
      return false;
    }
    if (question.length > 200) {
      setError('Survey question must be 200 characters or less');
      return false;
    }
    
    // Check for valid answers (non-empty)
    const validAnswers = answers.filter(answer => answer.trim() !== '');
    if (validAnswers.length < 2) {
      setError('Please provide at least 2 answer options');
      return false;
    }
    if (validAnswers.length > 4) {
      setError('Please provide no more than 4 answer options');
      return false;
    }
    if (validAnswers.some(answer => answer.length > 50)) {
      setError('Each answer must be 50 characters or less');
      return false;
    }
    if (!limitDate) {
      setError('Please select a limit date');
      return false;
    }
    const selectedDate = new Date(limitDate).getTime() / 1000;
    const now = Math.floor(Date.now() / 1000);
    if (selectedDate <= now) {
      setError('Limit date must be in the future');
      return false;
    }
    return true;
  };

  const handleCreateSurvey = async () => {
    if (!validateForm()) return;

    setCreating(true);
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
        Buffer.from(communityName),
      ], new PublicKey(PROGRAM_ID));

      const [surveyPda] = await PublicKey.findProgramAddress([
        Buffer.from(SURVEY_SEED),
        Buffer.from(communityName),
        Buffer.from(title),
      ], new PublicKey(PROGRAM_ID));

      const limitTimestamp = Math.floor(new Date(limitDate).getTime() / 1000);

      // Filter out empty answers and ensure we have valid answers
      const validAnswers = answers.filter(answer => answer.trim() !== '');

      console.log('Creating survey with data:', {
        title,
        question,
        answers: validAnswers,
        limitTimestamp
      });

      // Call the create_survey instruction
      const tx = await program.methods
        .createSurvey(
          title.trim(),
          question.trim(),
          validAnswers.map(answer => answer.trim()),
          new anchor.BN(limitTimestamp)
        )
        .accounts({
          communityAccount: communityPda,
          surveyAccount: surveyPda,
          authority: publicKey,
          userAccount: userPda,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      console.log('Survey creation transaction signature:', tx);
      setError('Survey created successfully! Transaction: ' + tx);
      
      // Navigate back to surveys list after successful creation
      setTimeout(() => {
        onNavigate('surveys', { community: communityName });
      }, 2000);
      
    } catch (err) {
      console.error('Survey creation error:', err);
      setError('Failed to create survey: ' + (err.message || JSON.stringify(err)));
    } finally {
      setCreating(false);
    }
  };

  if (checkingMembership) {
    return (
      <div className="center-title">
        <div className="center-content">
          <h2>Checking community membership...</h2>
        </div>
      </div>
    );
  }

  if (!isMember) {
    return (
      <div className="center-title">
        <div className="center-content">
          <h2>Access Denied</h2>
          <p>You must be a member of "{communityName}" to create surveys.</p>
          <button 
            onClick={() => onNavigate('surveys', { community: communityName })}
            style={{ 
              marginTop: '20px',
              padding: '8px 16px', 
              fontSize: '14px', 
              cursor: 'pointer',
              background: '#666',
              color: 'white',
              border: 'none',
              borderRadius: '4px'
            }}
          >
            ← Back to Surveys
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="center-title">
      <div className="center-content">
        <h1>Create Survey in "{communityName}"</h1>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <button 
            onClick={() => onNavigate('surveys', { community: communityName })}
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
            ← Back to Surveys
          </button>
        </div>

        <div style={{ 
          maxWidth: '600px', 
          margin: '0 auto', 
          padding: '30px', 
          border: '1px solid #ddd', 
          borderRadius: '8px',
          background: '#fff'
        }}>
          <form onSubmit={(e) => { e.preventDefault(); handleCreateSurvey(); }}>
            {/* Survey Title */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', color: '#333' }}>
                Survey Title *
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Enter survey title (max 30 characters)"
                style={{ 
                  width: '100%',
                  padding: '10px', 
                  fontSize: '14px', 
                  border: '1px solid #ddd', 
                  borderRadius: '4px',
                  boxSizing: 'border-box'
                }}
                maxLength={30}
              />
              <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                {title.length}/30 characters
              </div>
            </div>

            {/* Survey Question */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', color: '#333' }}>
                Survey Question *
              </label>
              <textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Enter your survey question (max 200 characters)"
                style={{ 
                  width: '100%',
                  padding: '10px', 
                  fontSize: '14px', 
                  border: '1px solid #ddd', 
                  borderRadius: '4px',
                  minHeight: '80px',
                  resize: 'vertical',
                  boxSizing: 'border-box'
                }}
                maxLength={200}
              />
              <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                {question.length}/200 characters
              </div>
            </div>

            {/* Answer Options */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', color: '#333' }}>
                Answer Options * ({answers.length}/4)
              </label>
              {answers.map((answer, index) => (
                <div key={index} style={{ display: 'flex', gap: '10px', marginBottom: '10px', alignItems: 'center' }}>
                  <input
                    type="text"
                    value={answer}
                    onChange={(e) => updateAnswer(index, e.target.value)}
                    placeholder={`Answer option ${index + 1} (max 50 characters)`}
                    style={{ 
                      flex: '1',
                      padding: '10px', 
                      fontSize: '14px', 
                      border: '1px solid #ddd', 
                      borderRadius: '4px'
                    }}
                    maxLength={50}
                  />
                  {answers.length > 2 && (
                    <button
                      type="button"
                      onClick={() => removeAnswer(index)}
                      style={{ 
                        padding: '8px 12px',
                        fontSize: '14px',
                        cursor: 'pointer',
                        background: '#dc3545',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px'
                      }}
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
              {answers.length < 4 && (
                <button
                  type="button"
                  onClick={addAnswer}
                  style={{ 
                    padding: '8px 16px',
                    fontSize: '14px',
                    cursor: 'pointer',
                    background: '#6c757d',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px'
                  }}
                >
                  + Add Answer Option
                </button>
              )}
            </div>

            {/* Limit Date */}
            <div style={{ marginBottom: '30px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', color: '#333' }}>
                Voting Deadline *
              </label>
              <input
                type="datetime-local"
                value={limitDate}
                onChange={(e) => setLimitDate(e.target.value)}
                style={{ 
                  width: '100%',
                  padding: '10px', 
                  fontSize: '14px', 
                  border: '1px solid #ddd', 
                  borderRadius: '4px',
                  boxSizing: 'border-box'
                }}
                min={new Date().toISOString().slice(0, 16)}
              />
            </div>

            {/* Submit Button */}
            <div style={{ textAlign: 'center' }}>
              <button
                type="submit"
                disabled={creating}
                style={{ 
                  padding: '12px 24px', 
                  fontSize: '16px', 
                  cursor: creating ? 'not-allowed' : 'pointer',
                  background: '#28a745',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  minWidth: '150px'
                }}
              >
                {creating ? 'Creating Survey...' : 'Create Survey'}
              </button>
            </div>
          </form>
        </div>

        {error && (
          <div
            style={{
              color: error.includes('successfully') ? '#28a745' : 'red',
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

export default AddSurvey; 