import React, { useState } from 'react';

const AuthScreen = ({ onPasscodeSetup }) => {
  const [passcodeLength, setPasscodeLength] = useState(null); // To track 4 or 6 digit selection
  const [passcode, setPasscode] = useState('');
  const [confirmPasscode, setConfirmPasscode] = useState('');
  const [error, setError] = useState('');

  // Handle selection between 4-digit or 6-digit passcode
  const handlePasscodeSelection = (length) => {
    setPasscodeLength(length);
    setPasscode('');
    setConfirmPasscode('');
    setError('');
  };

  // Handle passcode setup
  const handlePasscodeSubmit = () => {
    if (passcode !== confirmPasscode) {
      setError("Passcodes don't match!");
      return;
    }
    if (passcode.length !== passcodeLength) {
      setError(`Passcode should be ${passcodeLength} digits long.`);
      return;
    }
    onPasscodeSetup(passcode); // Passcode setup complete, move to the next screen
  };

  return (
    <div style={styles.container}>
      {passcodeLength === null ? (
        // Initial screen for selecting passcode length
        <div style={styles.selectPasscode}>
          <h2>Choose Passcode Length</h2>
          <button onClick={() => handlePasscodeSelection(4)} style={styles.btnStyle}>4-Digit Passcode</button>
          <button onClick={() => handlePasscodeSelection(6)} style={styles.btnStyle}>6-Digit Passcode</button>
        </div>
      ) : (
        // Passcode setup screen (either 4 or 6 digits)
        <div style={styles.setupPasscode}>
          <h2>Set your {passcodeLength}-Digit Passcode</h2>
          <input
            type="password"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            placeholder={`Enter ${passcodeLength} digits`}
            style={styles.inputStyle}
            maxLength={passcodeLength}
          />
          <input
            type="password"
            value={confirmPasscode}
            onChange={(e) => setConfirmPasscode(e.target.value)}
            placeholder="Confirm passcode"
            style={styles.inputStyle}
            maxLength={passcodeLength}
          />
          {error && <div style={styles.error}>{error}</div>}
          <button onClick={handlePasscodeSubmit} style={styles.sendBtnStyle}>Submit</button>
        </div>
      )}
    </div>
  );
};

const styles = {
  container: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100vh',
    backgroundColor: '#1a1a1a',
    color: 'white',
    fontFamily: 'sans-serif',
    flexDirection: 'column',
    padding: '10px'
  },
  selectPasscode: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center'
  },
  setupPasscode: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    width: '100%',
    maxWidth: '400px'
  },
  btnStyle: {
    fontSize: '18px',
    padding: '10px',
    margin: '10px',
    backgroundColor: '#007bff',
    color: 'white',
    border: 'none',
    borderRadius: '5px',
    cursor: 'pointer'
  },
  inputStyle: {
    padding: '10px',
    margin: '10px',
    borderRadius: '5px',
    border: '1px solid #444',
    backgroundColor: '#222',
    color: 'white',
    width: '80%',
    textAlign: 'center'
  },
  sendBtnStyle: {
    padding: '10px 20px',
    backgroundColor: '#28a745',
    color: 'white',
    border: 'none',
    borderRadius: '5px',
    cursor: 'pointer',
    fontSize: '16px',
  },
  error: {
    color: 'red',
    marginTop: '10px',
  }
};

export default AuthScreen;
